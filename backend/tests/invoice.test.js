// invoice.test.js — DB-backed integration tests for the invoice module (FR-2.x, BR-1, BR-2, Spec 7.1/7.2).
//
// Requires a real Mongo replica set (transactions). Skipped where TCP/Mongo is unavailable via
// BILLFLOW_SKIP_DB_TESTS=1. Covers: create (totals + numbering + balance + audit in a transaction),
// transaction ROLLBACK on failure, idempotency (service-level + HTTP duplicate-key per the skill),
// update, cancel (BR-1), and PDF generation.

const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');

const invoiceService = require('../src/modules/invoice/invoice.service');
const paymentService = require('../src/modules/payment/payment.service');
const Invoice = require('../src/models/Invoice');
const Customer = require('../src/models/Customer');
const Payment = require('../src/models/Payment');
const AuditLog = require('../src/models/AuditLog');
const { signAccessToken } = require('../src/utils/tokens');
const { connectReplSet, clearDatabase, closeDatabase } = require('./helpers/db');

const describeDb = process.env.BILLFLOW_SKIP_DB_TESTS ? describe.skip : describe;

describeDb('invoice module (DB-backed)', () => {
  let customer;

  beforeAll(async () => {
    await connectReplSet();
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await clearDatabase();
  });
  afterAll(async () => {
    await closeDatabase();
  });

  beforeEach(async () => {
    customer = await Customer.create({ name: 'Acme', email: 'acme@test.com' });
  });

  const items = [
    { description: 'Consulting', quantity: 2, unitPrice: 100 },
    { description: 'Hosting', quantity: 1, unitPrice: 50 },
  ];

  describe('create (FR-2.1–2.4, Spec 7.2)', () => {
    it('creates an invoice with server-computed totals, a unique number, balance++ and AuditLog', async () => {
      const invoice = await invoiceService.create({ customerId: customer._id, items, taxRate: 0.1 }, 'user-1');

      expect(invoice.invoiceNumber).toMatch(/^INV-\d{4}-\d{4}$/);
      expect(invoice.subtotal).toBe(250);
      expect(invoice.tax).toBe(25);
      expect(invoice.totalAmount).toBe(275);

      // Balance increased (BR-2) atomically.
      const fresh = await Customer.findById(customer._id);
      expect(fresh.balance).toBe(275);

      // AuditLog written in the same transaction.
      const log = await AuditLog.findOne({ action: 'INVOICE_CREATED', entityId: invoice._id });
      expect(log).not.toBeNull();
    });

    it('generates sequential invoice numbers', async () => {
      const a = await invoiceService.create({ customerId: customer._id, items }, 'u');
      const b = await invoiceService.create({ customerId: customer._id, items }, 'u');
      expect(a.invoiceNumber).not.toBe(b.invoiceNumber);
    });

    it('ROLLS BACK the whole transaction if the AuditLog write fails (Spec 7.2)', async () => {
      // Force the final step of the transaction to fail.
      jest.spyOn(AuditLog, 'create').mockRejectedValue(new Error('audit boom'));

      await expect(
        invoiceService.create({ customerId: customer._id, items }, 'u')
      ).rejects.toThrow(/audit boom/);

      // Nothing partial should remain: no invoice, balance unchanged.
      expect(await Invoice.countDocuments()).toBe(0);
      const fresh = await Customer.findById(customer._id);
      expect(fresh.balance).toBe(0);
    });

    it('rejects creating an invoice for a missing customer (404)', async () => {
      await expect(
        invoiceService.create({ customerId: new mongoose.Types.ObjectId(), items }, 'u')
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('list / detail (denormalized display fields)', () => {
    it('attaches customerName to each list row (Spec 5.3)', async () => {
      await invoiceService.create({ customerId: customer._id, items }, 'u');
      const result = await invoiceService.list({});
      expect(result.pagination.total).toBe(1);
      expect(result.items[0].customerName).toBe(customer.name);
    });

    it('getById returns the invoice with its customer + customerName for the detail view', async () => {
      const created = await invoiceService.create({ customerId: customer._id, items }, 'u');
      const detail = await invoiceService.getById(created._id);
      expect(detail.customerName).toBe(customer.name);
      expect(detail.customer.name).toBe(customer.name);
      expect(detail.customer.email).toBe(customer.email);
    });
  });

  describe('idempotency (Spec 7.1 / FR-2.8)', () => {
    it('service-level: same idempotencyKey returns the same invoice, only one is created', async () => {
      const key = 'svc-key-1';
      const first = await invoiceService.create({ customerId: customer._id, items, idempotencyKey: key }, 'u');
      const second = await invoiceService.create({ customerId: customer._id, items, idempotencyKey: key }, 'u');

      expect(String(second._id)).toBe(String(first._id));
      expect(await Invoice.countDocuments()).toBe(1);
      // Balance incremented only ONCE.
      const fresh = await Customer.findById(customer._id);
      expect(fresh.balance).toBe(first.totalAmount);
    });

    it('HTTP: sending the same Idempotency-Key twice creates only one invoice (skill test)', async () => {
      // Minimal app with the real invoice routes + real auth. Mint an admin token.
      const app = express();
      app.use(express.json());
      app.use('/api/invoices', require('../src/modules/invoice/invoice.routes'));
      app.use(require('../src/middleware/errorHandler'));
      const token = signAccessToken({ _id: new mongoose.Types.ObjectId(), role: 'admin', email: 'a@b.c' });

      const payload = { customerId: String(customer._id), items };
      const key = 'http-key-1';

      const first = await request(app)
        .post('/api/invoices')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', key)
        .send(payload);
      const second = await request(app)
        .post('/api/invoices')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', key)
        .send(payload);

      expect(first.status).toBe(201);
      expect(second.body).toEqual(first.body); // same status + body
      expect(await Invoice.countDocuments()).toBe(1); // no duplicate write
    });
  });

  describe('update (FR-2.1)', () => {
    it('recomputes totals and adjusts the customer balance by the delta', async () => {
      const invoice = await invoiceService.create({ customerId: customer._id, items, taxRate: 0 }, 'u'); // total 250
      const updated = await invoiceService.update(
        invoice._id,
        { items: [{ description: 'X', quantity: 1, unitPrice: 400 }] },
        'u'
      );
      expect(updated.totalAmount).toBe(400);
      const fresh = await Customer.findById(customer._id);
      expect(fresh.balance).toBe(400); // 250 → 400 delta applied
    });

    it('refuses to edit a cancelled invoice (409)', async () => {
      const invoice = await invoiceService.create({ customerId: customer._id, items }, 'u');
      await invoiceService.cancel(invoice._id, 'u');
      await expect(
        invoiceService.update(invoice._id, { dueDate: new Date() }, 'u')
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('can turn OFF the recurring flag (BR-3 off-switch)', async () => {
      const invoice = await invoiceService.create(
        { customerId: customer._id, items, isRecurring: true, recurringCycle: 'monthly' },
        'u'
      );
      const updated = await invoiceService.update(invoice._id, { isRecurring: false }, 'u');
      expect(updated.isRecurring).toBe(false);
      expect(updated.recurringCycle).toBeNull();
    });

    it('marks the invoice paid when an item edit drops the total to/below the amount already paid', async () => {
      const invoice = await invoiceService.create(
        { customerId: customer._id, items: [{ description: 'X', quantity: 1, unitPrice: 100 }], status: 'sent' },
        'u'
      ); // total 100
      await paymentService.record({ invoiceId: invoice._id, amount: 60 }, 'u'); // partial, still 'sent'

      // Reduce total to 50 (<= 60 already paid) → should flip to 'paid'.
      const updated = await invoiceService.update(
        invoice._id,
        { items: [{ description: 'X', quantity: 1, unitPrice: 50 }] },
        'u'
      );
      expect(updated.status).toBe('paid');
    });
  });

  describe('cancel (BR-1)', () => {
    it('cancels (soft) and reduces the balance; the invoice row is preserved', async () => {
      const invoice = await invoiceService.create({ customerId: customer._id, items }, 'u');
      const cancelled = await invoiceService.cancel(invoice._id, 'u');
      expect(cancelled.status).toBe('cancelled');

      // Row still exists (never hard-deleted, BR-1).
      expect(await Invoice.findById(invoice._id)).not.toBeNull();
      const fresh = await Customer.findById(customer._id);
      expect(fresh.balance).toBe(0); // owed amount removed

      const log = await AuditLog.findOne({ action: 'INVOICE_CANCELLED' });
      expect(log).not.toBeNull();
    });

    it('cancelling an invoice that has a payment still keeps the payment (BR-1) and only removes the unpaid remainder', async () => {
      const invoice = await invoiceService.create({ customerId: customer._id, items, taxRate: 0 }, 'u'); // 250
      // Record a partial payment directly.
      await Payment.create({ invoiceId: invoice._id, customerId: customer._id, amount: 100, status: 'completed' });
      await Customer.updateOne({ _id: customer._id }, { $inc: { balance: -100 } }); // reflect the payment

      await invoiceService.cancel(invoice._id, 'u');

      // Payment is preserved (BR-1).
      expect(await Payment.countDocuments({ invoiceId: invoice._id })).toBe(1);
      // Balance: 250 - 100 (paid) - 150 (remaining removed on cancel) = 0.
      const fresh = await Customer.findById(customer._id);
      expect(fresh.balance).toBe(0);
    });

    it('cannot cancel a fully paid invoice (409)', async () => {
      const invoice = await invoiceService.create({ customerId: customer._id, items, taxRate: 0 }, 'u');
      invoice.status = 'paid';
      await invoice.save();
      await expect(invoiceService.cancel(invoice._id, 'u')).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('PDF (FR-2.6)', () => {
    it('produces a PDF buffer for an invoice', async () => {
      const invoice = await invoiceService.create({ customerId: customer._id, items }, 'u');
      const { buffer } = await invoiceService.getInvoicePdf(invoice._id);
      expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
    });
  });

  describe('remind (FR-4.1, manual)', () => {
    const notificationService = require('../src/modules/notification/notification.service');

    it('enqueues a reminder and stamps lastReminderAt', async () => {
      const spy = jest.spyOn(notificationService, 'sendInvoiceReminder').mockResolvedValue(null);
      const invoice = await invoiceService.create({ customerId: customer._id, items, status: 'sent' }, 'u');

      const result = await invoiceService.remind(invoice._id);
      expect(spy).toHaveBeenCalledWith(invoice._id);
      expect(result.lastReminderAt).toBeTruthy();
      spy.mockRestore();
    });

    it('refuses to remind a paid or cancelled invoice (409)', async () => {
      const invoice = await invoiceService.create({ customerId: customer._id, items }, 'u');
      await invoiceService.cancel(invoice._id, 'u');
      await expect(invoiceService.remind(invoice._id)).rejects.toMatchObject({ statusCode: 409 });
    });

    it('404s for a missing invoice', async () => {
      await expect(invoiceService.remind(new mongoose.Types.ObjectId())).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
