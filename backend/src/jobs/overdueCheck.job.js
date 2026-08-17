// overdueCheck.job.js — daily invoice maintenance: flag overdue invoices (BR-4) and send payment
// reminders (FR-4.1). Runs as a repeatable BullMQ job; the DB work is exported for direct testing.
//
// SCHEDULING APPROACH — a BullMQ REPEATABLE (cron) job, unlike the per-invoice recurring job which
// uses self-rescheduling delayed jobs. A system-wide daily sweep has no per-entity stop condition
// and should simply run forever on a fixed cadence, so a repeatable cron job is the natural fit and
// survives restarts (BullMQ stores the schedule in Redis and dedupes identical repeat keys).
//
// Exports:
//   - flagOverdueInvoices(now)      : 'sent' invoices past dueDate → 'overdue' (each flip + AuditLog in a
//                                     transaction), then enqueue an overdue reminder email (FR-4.1).
//   - remindUpcomingInvoices(now,d) : 'sent' invoices due within `d` days → enqueue an "approaching due"
//                                     reminder, once per invoice (guarded by lastReminderAt, FR-4.1).
//   - registerOverdueCheck()        : registers the repeatable daily job on server startup (Spec §9).
//
// The 'overdueCheck' job type is handled in workers/invoice.worker.js, which calls BOTH sweeps.

const Invoice = require('../models/Invoice');
const withTransaction = require('../utils/withTransaction');
const { writeAudit } = require('../utils/audit');
const { getInvoiceQueue } = require('./invoiceQueue');
const notificationService = require('../modules/notification/notification.service');

// Runs daily at 02:00 (server time). BR-4 only needs day-granularity flagging.
const OVERDUE_CRON = '0 2 * * *';
// How many days ahead of the due date to send an "approaching due" reminder (FR-4.1).
const UPCOMING_WINDOW_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

// Enqueue a reminder without letting a queue failure abort the sweep (best-effort, async delivery).
async function safeRemind(invoiceId) {
  try {
    await notificationService.sendInvoiceReminder(invoiceId);
  } catch (err) {
    console.error('[overdueCheck] failed to enqueue reminder:', err && err.message);
  }
}

/**
 * Flag every invoice whose due date has passed but is still 'sent' as 'overdue', then enqueue an
 * overdue reminder email (FR-4.1). BR-4: overdue is a SYSTEM-computed status, never set manually.
 * Only 'sent' invoices become overdue — draft/paid/cancelled are excluded. Since the flip moves the
 * invoice out of 'sent', a given invoice is flagged (and reminded) exactly once.
 * @param {Date} [now] injectable clock for testing
 * @returns {Promise<number>} number of invoices flagged
 */
async function flagOverdueInvoices(now = new Date()) {
  // Candidate ids only — we re-read each invoice inside its transaction to avoid a lost update
  // (a payment could mark an invoice 'paid' between this find() and the save).
  const candidates = await Invoice.find({ status: 'sent', dueDate: { $lt: now } }).select('_id');

  let flagged = 0;
  for (const { _id } of candidates) {
    // Update + audit atomically (two collections → transaction, Spec 7.2). Returns true if flipped.
    // eslint-disable-next-line no-await-in-loop
    const didFlag = await withTransaction(async (session) => {
      // Re-read inside the transaction and re-assert the precondition. If a payment flipped it to
      // 'paid' (or it's no longer past due) since the find(), skip it — don't clobber the newer state.
      const invoice = await Invoice.findById(_id).session(session);
      if (!invoice || invoice.status !== 'sent' || !(invoice.dueDate < now)) return false;

      const beforeState = invoice.toObject();
      invoice.status = 'overdue';
      invoice.lastReminderAt = now;
      await invoice.save({ session });
      await writeAudit({
        action: 'INVOICE_OVERDUE',
        entityType: 'Invoice',
        entityId: invoice._id,
        performedBy: undefined, // system action (no user)
        beforeState,
        afterState: invoice.toObject(),
        session,
      });
      return true;
    });

    if (didFlag) {
      // FR-4.1: notify the customer the invoice is now past due (best-effort, delivered by the worker).
      // eslint-disable-next-line no-await-in-loop
      await safeRemind(_id);
      flagged += 1;
    }
  }
  return flagged;
}

/**
 * Send an "approaching due date" reminder for 'sent' invoices due within `daysAhead` days that
 * haven't been reminded yet (FR-4.1). The lastReminderAt guard ensures each invoice gets at most
 * one upcoming reminder, so a daily sweep doesn't spam the customer.
 * @param {Date} [now] injectable clock for testing
 * @param {number} [daysAhead]
 * @returns {Promise<number>} number of reminders enqueued
 */
async function remindUpcomingInvoices(now = new Date(), daysAhead = UPCOMING_WINDOW_DAYS) {
  const windowEnd = new Date(now.getTime() + daysAhead * DAY_MS);
  const candidates = await Invoice.find({
    status: 'sent',
    dueDate: { $gte: now, $lte: windowEnd },
    // Not yet reminded (field null or absent).
    $or: [{ lastReminderAt: null }, { lastReminderAt: { $exists: false } }],
  });

  let reminded = 0;
  for (const invoice of candidates) {
    // eslint-disable-next-line no-await-in-loop
    await safeRemind(invoice._id);
    // Record that we reminded so the next daily run skips this invoice (single-collection write,
    // no audit — a reminder timestamp is bookkeeping, not a financial state change).
    // eslint-disable-next-line no-await-in-loop
    await Invoice.updateOne({ _id: invoice._id }, { lastReminderAt: now });
    reminded += 1;
  }
  return reminded;
}

/**
 * Register the repeatable daily maintenance job. Safe no-op when queueing is disabled.
 * Called from server startup (server.js). Idempotent: BullMQ dedupes identical repeat keys.
 */
async function registerOverdueCheck() {
  const queue = getInvoiceQueue();
  if (!queue) return null;
  return queue.add(
    'overdueCheck',
    {},
    { repeat: { pattern: OVERDUE_CRON }, removeOnComplete: true, removeOnFail: false }
  );
}

module.exports = {
  flagOverdueInvoices,
  remindUpcomingInvoices,
  registerOverdueCheck,
  OVERDUE_CRON,
  UPCOMING_WINDOW_DAYS,
};
