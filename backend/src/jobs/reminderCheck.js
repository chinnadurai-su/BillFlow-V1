// reminderCheck.js — daily check that emails payment reminders (BRD FR-4.1). Replaces the old
// BullMQ-based reminder flow with a plain scheduled function call (see tech spec §7).
//
// Finds unpaid invoices ('sent' or 'overdue') that are approaching or past their due date and
// haven't been reminded recently (a cooldown, so a daily run doesn't spam the customer), sends the
// reminder email directly via notification.service (SendGrid + paymentReminderTemplate), and stamps
// lastReminderAt. Scheduled daily from server.js.

const Invoice = require('../models/Invoice');
const notificationService = require('../modules/notification/notification.service');

const DAY_MS = 24 * 60 * 60 * 1000;
// Send an "approaching due" reminder when the due date is within this many days.
const UPCOMING_WINDOW_DAYS = 3;
// Don't remind the same invoice again within this many days.
const REMINDER_COOLDOWN_DAYS = 3;

/**
 * Send reminders for approaching/past-due unpaid invoices not reminded within the cooldown.
 * @param {Date} [now] injectable clock for testing
 * @param {object} [opts] { upcomingWindowDays, cooldownDays }
 * @returns {Promise<number>} number of reminders sent
 */
async function reminderCheck(now = new Date(), opts = {}) {
  const upcomingWindowDays = opts.upcomingWindowDays ?? UPCOMING_WINDOW_DAYS;
  const cooldownDays = opts.cooldownDays ?? REMINDER_COOLDOWN_DAYS;

  const windowEnd = new Date(now.getTime() + upcomingWindowDays * DAY_MS);
  const cooldownCutoff = new Date(now.getTime() - cooldownDays * DAY_MS);

  const candidates = await Invoice.find({
    status: { $in: ['sent', 'overdue'] }, // unpaid, still owed
    dueDate: { $lte: windowEnd }, // approaching (within window) OR already past due
    // Not reminded before, or last reminder is older than the cooldown.
    $or: [
      { lastReminderAt: null },
      { lastReminderAt: { $exists: false } },
      { lastReminderAt: { $lt: cooldownCutoff } },
    ],
  }).select('_id');

  let sent = 0;
  for (const { _id } of candidates) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await notificationService.sendInvoiceReminder(_id);
      // Stamp the reminder time so the cooldown applies on the next run (bookkeeping, no audit).
      // eslint-disable-next-line no-await-in-loop
      await Invoice.updateOne({ _id }, { lastReminderAt: now });
      sent += 1;
    } catch (err) {
      console.error('[reminderCheck] failed to send reminder for', String(_id), err && err.message);
    }
  }

  if (sent) console.log(`[reminderCheck] sent ${sent} reminder(s)`);
  return sent;
}

module.exports = { reminderCheck, UPCOMING_WINDOW_DAYS, REMINDER_COOLDOWN_DAYS };
