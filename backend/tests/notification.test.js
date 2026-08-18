// notification.test.js — unit tests for the synchronous notification service + email templates.
//
// notification.service now sends directly (SendGrid via utils/mailer) — no queue. We mock the mailer
// and the models so these run socket-free (no DB, no network) and assert the right message is built.

// Mock the mailer so no network/SDK is needed and the composed message is observable. (Hoisted.)
jest.mock('../src/utils/mailer', () => ({ sendMail: jest.fn().mockResolvedValue({ dryRun: true }) }));
// Mock the models so notification.service can load an invoice + customer without a DB. (Hoisted.)
jest.mock('../src/models/Invoice', () => ({ findById: jest.fn() }));
jest.mock('../src/models/Customer', () => ({ findById: jest.fn() }));

const { sendMail } = require('../src/utils/mailer');
const Invoice = require('../src/models/Invoice');
const Customer = require('../src/models/Customer');
const notificationService = require('../src/modules/notification/notification.service');

// Build a Mongoose-ish doc whose toObject() returns the given plain object.
const doc = (obj) => ({ ...obj, toObject: () => obj });

const invoiceObj = {
  _id: 'inv-1',
  invoiceNumber: 'INV-2026-0001',
  customerId: 'cust-1',
  items: [{ description: 'x', quantity: 1, unitPrice: 100, total: 100 }],
  subtotal: 100, tax: 0, totalAmount: 100,
  status: 'sent',
  dueDate: new Date('2026-01-01T00:00:00Z'),
};
const customerObj = { _id: 'cust-1', name: 'Acme', email: 'billing@acme.test' };

beforeEach(() => {
  jest.clearAllMocks();
  Invoice.findById.mockResolvedValue(doc(invoiceObj));
  Customer.findById.mockResolvedValue(doc(customerObj));
});

describe('notification.service — synchronous sends (FR-4.1/4.2)', () => {
  it('sendInvoiceEmail renders a PDF and emails it to the customer with the PDF attached', async () => {
    await notificationService.sendInvoiceEmail('inv-1');

    expect(sendMail).toHaveBeenCalledTimes(1);
    const msg = sendMail.mock.calls[0][0];
    expect(msg.to).toBe('billing@acme.test');
    expect(msg.subject).toContain('INV-2026-0001');
    expect(msg.html).toEqual(expect.any(String));
    // PDF attached as a Buffer named after the invoice number.
    expect(msg.attachments).toHaveLength(1);
    expect(msg.attachments[0].filename).toBe('INV-2026-0001.pdf');
    expect(Buffer.isBuffer(msg.attachments[0].content)).toBe(true);
    expect(msg.attachments[0].content.subarray(0, 4).toString('ascii')).toBe('%PDF');
  });

  it('sendInvoiceReminder emails the reminder (no attachment)', async () => {
    await notificationService.sendInvoiceReminder('inv-1');

    expect(sendMail).toHaveBeenCalledTimes(1);
    const msg = sendMail.mock.calls[0][0];
    expect(msg.to).toBe('billing@acme.test');
    expect(msg.subject.toLowerCase()).toContain('invoice');
    expect(msg.attachments).toBeUndefined();
  });

  it('throws when the invoice does not exist (caller treats sending as best-effort)', async () => {
    Invoice.findById.mockResolvedValue(null);
    await expect(notificationService.sendInvoiceEmail('missing')).rejects.toThrow(/not found/i);
  });
});

describe('emailTemplates never leak secrets/card data (Spec 7.3)', () => {
  const { invoiceSentTemplate, paymentReminderTemplate } = require('../src/utils/emailTemplates');
  it('renders only invoice/customer fields, no sensitive tokens', () => {
    const invoice = { invoiceNumber: 'INV-2026-0001', totalAmount: 100, dueDate: new Date('2026-01-01Z') };
    const customer = { name: 'X', email: 'x@y.z' };
    const sent = invoiceSentTemplate(invoice, customer);
    const reminder = paymentReminderTemplate(invoice, customer);
    for (const out of [sent, reminder]) {
      expect(out.html.toLowerCase()).not.toContain('password');
      expect(out.html.toLowerCase()).not.toContain('cardnumber');
      expect(out.html.toLowerCase()).not.toContain('cvv');
    }
  });
});
