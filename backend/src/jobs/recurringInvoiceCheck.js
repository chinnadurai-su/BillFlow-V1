// recurringInvoiceCheck.js — daily check that generates the next occurrence of each due recurring
// invoice (BRD FR-2.5 / BR-3). Replaces the old BullMQ self-rescheduling job with a simple
// scheduled function call (see docs/BillFlow_Dev_Technical_Spec.md §7 — simplicity choice).
//
// A recurring TEMPLATE invoice (isRecurring:true) carries a nextRecurrenceAt date. This check finds
// templates whose nextRecurrenceAt has passed and asks invoice.service to generate the next
// occurrence — which creates the concrete invoice, bumps the customer balance, writes an AuditLog,
// and advances the template's nextRecurrenceAt by one cycle, all in one transaction. The new
// occurrence is then emailed (best-effort). Scheduled daily from server.js.

const Invoice = require('../models/Invoice');
const invoiceService = require('../modules/invoice/invoice.service');
const notificationService = require('../modules/notification/notification.service');

/**
 * Generate occurrences for all recurring templates that are due.
 * @param {Date} [now] injectable clock for testing
 * @returns {Promise<number>} number of occurrences generated
 */
async function recurringInvoiceCheck(now = new Date()) {
  const dueTemplates = await Invoice.find({
    isRecurring: true,
    status: { $ne: 'cancelled' },
    nextRecurrenceAt: { $lte: now },
  }).select('_id');

  let generated = 0;
  for (const { _id } of dueTemplates) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const occurrence = await invoiceService.createRecurringOccurrence(_id);
      if (!occurrence) continue; // BR-3 stop condition met (flag off / cancelled / archived)
      generated += 1;

      // Email the freshly generated invoice (FR-4.2). Best-effort — a send failure must not stop
      // the sweep or undo the already-committed occurrence.
      try {
        // eslint-disable-next-line no-await-in-loop
        await notificationService.sendInvoiceEmail(occurrence._id);
      } catch (err) {
        console.error('[recurringInvoiceCheck] failed to email occurrence:', err && err.message);
      }
    } catch (err) {
      console.error('[recurringInvoiceCheck] failed for template', String(_id), err && err.message);
    }
  }

  if (generated) console.log(`[recurringInvoiceCheck] generated ${generated} recurring invoice(s)`);
  return generated;
}

module.exports = { recurringInvoiceCheck };
