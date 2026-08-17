// recurringInvoice.job.js — schedules regeneration of recurring invoices (Spec 7.4, BRD BR-3).
//
// SCHEDULING APPROACH — self-rescheduling DELAYED jobs (not BullMQ repeatable/cron). Rationale:
//   BR-3 says recurring invoices keep generating "until the recurring flag is turned off or the
//   customer is archived." A self-rescheduling delayed job checks those stop-conditions at each
//   run (in the worker) and simply doesn't re-arm when they're met — so turning off `isRecurring`
//   or archiving the customer stops the chain naturally, with no separate bookkeeping to remove a
//   registered repeat key. A one-off delayed job per cycle also keeps each run independent.
//   Trade-off: the interval is a fixed approximation (monthly ≈ 30d) rather than exact calendar
//   months; acceptable for this phase and documented. (Exact calendar cadence would need cron.)
//
// The worker's 'createRecurringInvoice' handler creates the next invoice, then calls
// scheduleRecurringInvoice() again for the following cycle.

const { addInvoiceJob } = require('./invoiceQueue');

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Map a recurring cycle to a delay in milliseconds. Pure → unit-testable.
 * @param {'monthly'|'quarterly'|'yearly'} cycle
 * @returns {number} delay in ms
 * @throws if the cycle is not recognized
 */
function cycleToDelayMs(cycle) {
  switch (cycle) {
    case 'monthly':
      return 30 * DAY_MS;
    case 'quarterly':
      return 91 * DAY_MS; // ~3 months
    case 'yearly':
      return 365 * DAY_MS;
    default:
      throw new Error(`Unknown recurringCycle: ${cycle}`);
  }
}

/**
 * Schedule the next generation of a recurring invoice.
 * @param {string} invoiceId  the source (template) invoice id
 * @param {'monthly'|'quarterly'|'yearly'} cycle
 */
async function scheduleRecurringInvoice(invoiceId, cycle) {
  const delay = cycleToDelayMs(cycle);
  return addInvoiceJob(
    'createRecurringInvoice',
    { invoiceId: String(invoiceId), cycle },
    {
      delay,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
      removeOnFail: false,
    }
  );
}

module.exports = { scheduleRecurringInvoice, cycleToDelayMs, DAY_MS };
