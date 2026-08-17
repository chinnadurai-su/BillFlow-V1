// jobs-dashboard.test.js — DB-backed tests for the overdue-check job (BR-4), recurring invoice
// occurrence generation (BR-3), and dashboard aggregations (FR-5.1/5.2).
//
// Requires a real Mongo replica set (transactions). Skipped where unavailable via BILLFLOW_SKIP_DB_TESTS=1.

const { flagOverdueInvoices, remindUpcomingInvoices } = require('../src/jobs/overdueCheck.job');
const notificationService = require('../src/modules/notification/notification.service');
const invoiceService = require('../src/modules/invoice/invoice.service');
const dashboardService = require('../src/modules/dashboard/dashboard.service');
const Invoice = require('../src/models/Invoice');
const Customer = require('../src/models/Customer');
const AuditLog = require('../src/models/AuditLog');
const { connectReplSet, clearDatabase, closeDatabase } = require('./helpers/db');

const describeDb = process.env.BILLFLOW_SKIP_DB_TESTS ? describe.skip : describe;

describeDb('overdue-check job (BR-4)', () => {
  let customer;
  beforeAll(async () => { await connectReplSet(); });
  afterEach(async () => { await clearDatabase(); });
  afterAll(async () => { await closeDatabase(); });
  beforeEach(async () => { customer = await Customer.create({ name: 'C', email: 'c@t.com' }); });

  const now = new Date('2026-06-01T00:00:00Z');
  const past = new Date('2026-05-01T00:00:00Z');
  const future = new Date('2026-07-01T00:00:00Z');

  function makeInvoice(status, dueDate) {
    return Invoice.create({
      invoiceNumber: `INV-2026-${Math.floor(Math.random() * 100000)}`,
      customerId: customer._id,
      items: [{ description: 'x', quantity: 1, unitPrice: 100, total: 100 }],
      subtotal: 100, tax: 0, totalAmount: 100,
      status, dueDate,
    });
  }

  it('flags past-due SENT invoices as overdue and writes an AuditLog for each', async () => {
    const sentPastDue = await makeInvoice('sent', past);
    await makeInvoice('sent', future); // not due yet
    await makeInvoice('draft', past); // draft not flagged
    await makeInvoice('paid', past); // paid not flagged

    const flagged = await flagOverdueInvoices(now);
    expect(flagged).toBe(1);

    const fresh = await Invoice.findById(sentPastDue._id);
    expect(fresh.status).toBe('overdue');
    expect(await AuditLog.findOne({ action: 'INVOICE_OVERDUE', entityId: sentPastDue._id })).not.toBeNull();
  });

  it('is a no-op when nothing is past due', async () => {
    await makeInvoice('sent', future);
    expect(await flagOverdueInvoices(now)).toBe(0);
  });

  it('enqueues an overdue reminder email for each flagged invoice (FR-4.1)', async () => {
    const spy = jest.spyOn(notificationService, 'sendInvoiceReminder').mockResolvedValue(null);
    const sentPastDue = await makeInvoice('sent', past);

    await flagOverdueInvoices(now);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0][0])).toBe(String(sentPastDue._id));
    spy.mockRestore();
  });
});

describeDb('upcoming-due reminders (FR-4.1)', () => {
  let customer;
  beforeAll(async () => { await connectReplSet(); });
  afterEach(async () => { jest.restoreAllMocks(); await clearDatabase(); });
  afterAll(async () => { await closeDatabase(); });
  beforeEach(async () => { customer = await Customer.create({ name: 'C', email: 'c@t.com' }); });

  const now = new Date('2026-06-01T00:00:00Z');
  const inTwoDays = new Date('2026-06-03T00:00:00Z');
  const inTenDays = new Date('2026-06-11T00:00:00Z');

  function makeInvoice(status, dueDate) {
    return Invoice.create({
      invoiceNumber: `INV-2026-${Math.floor(Math.random() * 100000)}`,
      customerId: customer._id,
      items: [{ description: 'x', quantity: 1, unitPrice: 100, total: 100 }],
      subtotal: 100, tax: 0, totalAmount: 100, status, dueDate,
    });
  }

  it('reminds sent invoices due within the window, once each (guarded by lastReminderAt)', async () => {
    const spy = jest.spyOn(notificationService, 'sendInvoiceReminder').mockResolvedValue(null);
    const soon = await makeInvoice('sent', inTwoDays);
    await makeInvoice('sent', inTenDays); // outside the 3-day window

    const first = await remindUpcomingInvoices(now, 3);
    expect(first).toBe(1);
    expect(spy).toHaveBeenCalledTimes(1);

    // lastReminderAt now set → a second run does NOT re-remind.
    const second = await remindUpcomingInvoices(now, 3);
    expect(second).toBe(0);

    const fresh = await Invoice.findById(soon._id);
    expect(fresh.lastReminderAt).not.toBeNull();
    spy.mockRestore();
  });
});


describeDb('recurring invoice occurrence (BR-3)', () => {
  let customer;
  beforeAll(async () => { await connectReplSet(); });
  afterEach(async () => { await clearDatabase(); });
  afterAll(async () => { await closeDatabase(); });
  beforeEach(async () => { customer = await Customer.create({ name: 'C', email: 'c@t.com' }); });

  it('creates the next occurrence (status sent, non-recurring) and increments balance', async () => {
    const source = await invoiceService.create(
      { customerId: customer._id, items: [{ description: 'Sub', quantity: 1, unitPrice: 100 }], isRecurring: true, recurringCycle: 'monthly' },
      'u'
    );
    const balanceAfterSource = (await Customer.findById(customer._id)).balance;

    const occurrence = await invoiceService.createRecurringOccurrence(source._id);
    expect(occurrence).not.toBeNull();
    expect(occurrence.status).toBe('sent');
    expect(occurrence.isRecurring).toBe(false); // occurrence is a concrete invoice, not a template
    expect(occurrence.totalAmount).toBe(100);

    const fresh = await Customer.findById(customer._id);
    expect(fresh.balance).toBe(balanceAfterSource + 100);
  });

  it('stops (returns null) when the source is not recurring (BR-3)', async () => {
    const inv = await invoiceService.create(
      { customerId: customer._id, items: [{ description: 'One-off', quantity: 1, unitPrice: 10 }] },
      'u'
    );
    expect(await invoiceService.createRecurringOccurrence(inv._id)).toBeNull();
  });

  it('stops (returns null) when the customer is archived (BR-3)', async () => {
    const source = await invoiceService.create(
      { customerId: customer._id, items: [{ description: 'Sub', quantity: 1, unitPrice: 100 }], isRecurring: true, recurringCycle: 'monthly' },
      'u'
    );
    await Customer.updateOne({ _id: customer._id }, { status: 'archived' });
    expect(await invoiceService.createRecurringOccurrence(source._id)).toBeNull();
  });

  it('stops (returns null) when the source invoice is cancelled (BR-3)', async () => {
    const source = await invoiceService.create(
      { customerId: customer._id, items: [{ description: 'Sub', quantity: 1, unitPrice: 100 }], isRecurring: true, recurringCycle: 'monthly' },
      'u'
    );
    await invoiceService.cancel(source._id, 'u');
    expect(await invoiceService.createRecurringOccurrence(source._id)).toBeNull();
  });

  it('is idempotent: the same idempotencyKey does not create a duplicate occurrence (retry safety)', async () => {
    const source = await invoiceService.create(
      { customerId: customer._id, items: [{ description: 'Sub', quantity: 1, unitPrice: 100 }], isRecurring: true, recurringCycle: 'monthly' },
      'u'
    );
    const balanceBefore = (await Customer.findById(customer._id)).balance;

    const key = 'recurring:job-123';
    const first = await invoiceService.createRecurringOccurrence(source._id, key);
    const second = await invoiceService.createRecurringOccurrence(source._id, key); // simulated retry

    expect(String(second._id)).toBe(String(first._id)); // same occurrence, not a duplicate
    // Only ONE occurrence created (source + 1), and balance incremented once.
    expect(await Invoice.countDocuments({ idempotencyKey: key })).toBe(1);
    const balanceAfter = (await Customer.findById(customer._id)).balance;
    expect(balanceAfter).toBe(balanceBefore + 100);
  });
});

describeDb('dashboard aggregations (FR-5.1/5.2)', () => {
  beforeAll(async () => { await connectReplSet(); });
  afterEach(async () => { await clearDatabase(); });
  afterAll(async () => { await closeDatabase(); });

  it('summary reports revenue, outstanding, and overdue totals', async () => {
    const custA = await Customer.create({ name: 'A', email: 'a@t.com' });
    const custB = await Customer.create({ name: 'B', email: 'b@t.com' });

    // A: 250 invoice, 100 paid → balance 150, revenue 100.
    const invA = await invoiceService.create(
      { customerId: custA._id, items: [{ description: 'x', quantity: 1, unitPrice: 250 }], status: 'sent' },
      'u'
    );
    const paymentService = require('../src/modules/payment/payment.service');
    await paymentService.record({ invoiceId: invA._id, amount: 100 }, 'u');

    // B: 200 invoice, flagged overdue → balance 200, overdue 200.
    const invB = await invoiceService.create(
      { customerId: custB._id, items: [{ description: 'y', quantity: 1, unitPrice: 200 }], status: 'sent' },
      'u'
    );
    await Invoice.updateOne({ _id: invB._id }, { status: 'overdue' });

    const summary = await dashboardService.getSummary();
    expect(summary.totalRevenue).toBe(100);
    expect(summary.totalOutstanding).toBe(350); // 150 (A) + 200 (B)
    expect(summary.totalOverdue).toBe(200);
    expect(summary.overdueCount).toBe(1);
  });

  it('revenue trend groups completed payments into period buckets', async () => {
    const cust = await Customer.create({ name: 'A', email: 'a@t.com' });
    const inv = await invoiceService.create(
      { customerId: cust._id, items: [{ description: 'x', quantity: 1, unitPrice: 300 }], status: 'sent' },
      'u'
    );
    const paymentService = require('../src/modules/payment/payment.service');
    await paymentService.record({ invoiceId: inv._id, amount: 100 }, 'u');
    await paymentService.record({ invoiceId: inv._id, amount: 50 }, 'u');

    const trend = await dashboardService.getRevenueTrend({ granularity: 'month' });
    const total = trend.reduce((s, b) => s + b.total, 0);
    expect(total).toBe(150);
    expect(trend.every((b) => typeof b.period === 'string')).toBe(true);
  });
});
