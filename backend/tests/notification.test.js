// notification.test.js — unit tests for the notification module + invoice job producers.
//
// The notification service is a THIN enqueue wrapper (real send happens in the worker, FR-4.3),
// so these tests assert it enqueues the RIGHT job with the RIGHT retry policy. The BullMQ queue is
// mocked, so no Redis/socket is needed and these always run.

// Mock the shared queue so addInvoiceJob is observable and never touches Redis. (Hoisted.)
jest.mock('../src/jobs/invoiceQueue', () => ({
  addInvoiceJob: jest.fn().mockResolvedValue({ id: 'job-1' }),
  getInvoiceQueue: jest.fn(),
  INVOICE_QUEUE_NAME: 'invoiceJobs',
}));

const { addInvoiceJob } = require('../src/jobs/invoiceQueue');
const notificationService = require('../src/modules/notification/notification.service');
const { RETRY_OPTS } = require('../src/jobs/invoiceReminder.job');

beforeEach(() => jest.clearAllMocks());

describe('notification.service (thin enqueue wrapper, FR-4.1–4.3)', () => {
  it('sendInvoiceReminder enqueues a "sendReminder" job with the 3-attempt backoff policy', async () => {
    await notificationService.sendInvoiceReminder('inv-1');
    expect(addInvoiceJob).toHaveBeenCalledWith(
      'sendReminder',
      { invoiceId: 'inv-1' },
      expect.objectContaining({ attempts: 3, backoff: { type: 'exponential', delay: 5000 } })
    );
  });

  it('sendInvoiceEmail enqueues a "generatePDF" job (PDF + email flow, FR-4.2)', async () => {
    await notificationService.sendInvoiceEmail('inv-2');
    expect(addInvoiceJob).toHaveBeenCalledWith(
      'generatePDF',
      { invoiceId: 'inv-2' },
      expect.objectContaining({ attempts: 3 })
    );
  });

  it('the retry policy matches Spec 7.6 (3 attempts, exponential backoff from 5s)', () => {
    expect(RETRY_OPTS.attempts).toBe(3);
    expect(RETRY_OPTS.backoff).toEqual({ type: 'exponential', delay: 5000 });
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
