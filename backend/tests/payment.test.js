// payment.test.js — DB-backed integration tests for the payment module (FR-3.x, Spec 7.1/7.2).
//
// Requires a real Mongo replica set (transactions). Skipped where TCP/Mongo is unavailable via
// BILLFLOW_SKIP_DB_TESTS=1. Covers: record (payment + invoice→paid + balance-- + audit atomically),
// partial payment, overpayment guard, cancelled-invoice guard, idempotency, and transaction rollback.

const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');

const paymentService = require('../src/modules/payment/payment.service');
const invoiceService = require('../src/modules/invoice/invoice.service');
const Payment = require('../src/models/Payment');
const Invoice = require('../src/models/Invoice');
const Customer = require('../src/models/Customer');
const AuditLog = require('../src/models/AuditLog');
const { signAccessToken } = require('../src/utils/tokens');
const { connectReplSet, clearDatabase, closeDatabase } = require('./helpers/db');

const describeDb = process.env.BILLFLOW_SKIP_DB_TESTS ? describe.skip : describe;

describeDb('payment module (DB-backed)', () => {
  let customer;
  let invoice; // a 'sent' invoice with total 250

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
    invoice = await invoiceService.create(
      { customerId: customer._id, items: [{ description: 'Work', quantity: 1, unitPrice: 250 }], status: 'sent' },
      'u'
    );
    // After create, customer balance == 250.
  });

  describe('record (FR-3.1–3.3, Spec 7.2)', () => {
    it('records a full payment → invoice paid, balance 0, audit entries (atomic)', async () => {
      const payment = await paymentService.record(
        { invoiceId: invoice._id, amount: 250, method: 'bank_transfer' },
        'user-1'
      );
      expect(payment.amount).toBe(250);
      expect(payment.status).toBe('completed');

      const freshInvoice = await Invoice.findById(invoice._id);
      expect(freshInvoice.status).toBe('paid'); // FR-3.2

      const freshCustomer = await Customer.findById(customer._id);
      expect(freshCustomer.balance).toBe(0); // FR-3.3

      expect(await AuditLog.findOne({ action: 'PAYMENT_RECORDED' })).not.toBeNull();
      expect(await AuditLog.findOne({ action: 'INVOICE_PAID' })).not.toBeNull();
    });

    it('records a partial payment → invoice stays sent, balance reduced', async () => {
      await paymentService.record({ invoiceId: invoice._id, amount: 100 }, 'u');
      const freshInvoice = await Invoice.findById(invoice._id);
      expect(freshInvoice.status).toBe('sent');
      const freshCustomer = await Customer.findById(customer._id);
      expect(freshCustomer.balance).toBe(150);
    });

    it('rejects overpayment (409)', async () => {
      await expect(
        paymentService.record({ invoiceId: invoice._id, amount: 300 }, 'u')
      ).rejects.toMatchObject({ statusCode: 409, errorCode: 'OVERPAYMENT' });
    });

    it('rejects a payment against a cancelled invoice (409)', async () => {
      await invoiceService.cancel(invoice._id, 'u');
      await expect(
        paymentService.record({ invoiceId: invoice._id, amount: 50 }, 'u')
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('rejects a non-positive amount (400)', async () => {
      await expect(
        paymentService.record({ invoiceId: invoice._id, amount: 0 }, 'u')
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('ROLLS BACK if the audit write fails — no payment, invoice/balance unchanged (Spec 7.2)', async () => {
      jest.spyOn(AuditLog, 'create').mockRejectedValue(new Error('audit boom'));

      await expect(
        paymentService.record({ invoiceId: invoice._id, amount: 250 }, 'u')
      ).rejects.toThrow(/audit boom/);

      expect(await Payment.countDocuments()).toBe(0);
      const freshInvoice = await Invoice.findById(invoice._id);
      expect(freshInvoice.status).toBe('sent'); // not flipped to paid
      const freshCustomer = await Customer.findById(customer._id);
      expect(freshCustomer.balance).toBe(250); // unchanged
    });
  });

  describe('idempotency (Spec 7.1 / FR-3.4)', () => {
    it('service-level: same key returns the same payment, balance decremented once', async () => {
      const key = 'pay-key-1';
      const first = await paymentService.record({ invoiceId: invoice._id, amount: 100, idempotencyKey: key }, 'u');
      const second = await paymentService.record({ invoiceId: invoice._id, amount: 100, idempotencyKey: key }, 'u');

      expect(String(second._id)).toBe(String(first._id));
      expect(await Payment.countDocuments()).toBe(1);
      const freshCustomer = await Customer.findById(customer._id);
      expect(freshCustomer.balance).toBe(150); // decremented once, not twice
    });

    it('HTTP: same Idempotency-Key twice records only one payment (skill test)', async () => {
      const app = express();
      app.use(express.json());
      app.use('/api/payments', require('../src/modules/payment/payment.routes'));
      app.use(require('../src/middleware/errorHandler'));
      const token = signAccessToken({ _id: new mongoose.Types.ObjectId(), role: 'staff', email: 's@b.c' });

      const payload = { invoiceId: String(invoice._id), amount: 100 };
      const key = 'http-pay-1';

      const first = await request(app)
        .post('/api/payments')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', key)
        .send(payload);
      const second = await request(app)
        .post('/api/payments')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', key)
        .send(payload);

      expect(first.status).toBe(201);
      expect(second.body).toEqual(first.body);
      expect(await Payment.countDocuments()).toBe(1);
    });
  });

  describe('list / get', () => {
    it('lists payments with pagination and gets one by id (404 when missing)', async () => {
      await paymentService.record({ invoiceId: invoice._id, amount: 50 }, 'u');
      const list = await paymentService.list({});
      expect(list.pagination.total).toBe(1);

      await expect(
        paymentService.getById(new mongoose.Types.ObjectId())
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
