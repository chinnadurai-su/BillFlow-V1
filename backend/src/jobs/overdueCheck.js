// overdueCheck.js — daily check that flags overdue invoices (BRD BR-4 / FR-2.9). Replaces the old
// BullMQ repeatable job with a plain scheduled function call (see tech spec §7 — simplicity choice).
//
// Finds 'sent' invoices whose dueDate has passed and flips them to 'overdue', writing an AuditLog
// for each. Update + audit run in ONE transaction (Spec 7.2), and the status precondition is
// re-checked inside the transaction so a payment that just marked the invoice 'paid' isn't clobbered.
// Scheduled daily from server.js.

const Invoice = require('../models/Invoice');
const withTransaction = require('../utils/withTransaction');
const { writeAudit } = require('../utils/audit');

/**
 * Flag every past-due 'sent' invoice as 'overdue' (BR-4: system-computed, never set manually).
 * @param {Date} [now] injectable clock for testing
 * @returns {Promise<number>} number of invoices flagged
 */
async function overdueCheck(now = new Date()) {
  // Candidate ids only — re-read each inside its transaction to avoid a lost update.
  const candidates = await Invoice.find({ status: 'sent', dueDate: { $lt: now } }).select('_id');

  let flagged = 0;
  for (const { _id } of candidates) {
    // eslint-disable-next-line no-await-in-loop
    const didFlag = await withTransaction(async (session) => {
      const invoice = await Invoice.findById(_id).session(session);
      // Re-assert the precondition inside the transaction (skip if paid/changed since the find()).
      if (!invoice || invoice.status !== 'sent' || !(invoice.dueDate < now)) return false;

      const beforeState = invoice.toObject();
      invoice.status = 'overdue';
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

    if (didFlag) flagged += 1;
  }

  if (flagged) console.log(`[overdueCheck] flagged ${flagged} invoice(s) overdue`);
  return flagged;
}

module.exports = { overdueCheck };
