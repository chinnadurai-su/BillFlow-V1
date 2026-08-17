// invoiceReminder.job.js — BullMQ job producers for invoice email delivery (Spec 7.4 / 7.6).
//
// Two producers, both on the shared "invoiceJobs" queue with the retry/backoff policy from
// Spec 7.6 (3 attempts, exponential backoff starting at 5s):
//   - enqueueInvoiceEmail(invoiceId)    → 'generatePDF' job: worker renders the PDF and emails it
//                                          (used when an invoice is marked "sent", FR-2.7 / FR-4.2)
//   - enqueueInvoiceReminder(invoiceId) → 'sendReminder' job: worker emails a due/overdue reminder
//                                          (FR-4.1)
//
// These are producers only — they return immediately after adding the job to Redis. The actual
// PDF/email work happens asynchronously in workers/invoice.worker.js so API responses never block
// on it (FR-4.3).

const { addInvoiceJob } = require('./invoiceQueue');

// Retry policy per Spec 7.6: retry up to 3 times with exponential backoff (5s, 10s, 20s).
const RETRY_OPTS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: true,
  removeOnFail: false, // keep failed jobs for inspection
};

/**
 * Enqueue PDF generation + invoice email for a newly sent invoice.
 * @param {string} invoiceId
 */
async function enqueueInvoiceEmail(invoiceId) {
  return addInvoiceJob('generatePDF', { invoiceId: String(invoiceId) }, RETRY_OPTS);
}

/**
 * Enqueue a payment reminder email for an invoice.
 * @param {string} invoiceId
 */
async function enqueueInvoiceReminder(invoiceId) {
  return addInvoiceJob('sendReminder', { invoiceId: String(invoiceId) }, RETRY_OPTS);
}

module.exports = { enqueueInvoiceEmail, enqueueInvoiceReminder, RETRY_OPTS };
