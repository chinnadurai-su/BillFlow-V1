// notification.service.js — thin producer-side wrapper for outbound invoice emails (BRD FR-4.1–4.3).
//
// INTENTIONALLY THIN. This module does NOT talk to the email provider. It only ENQUEUES BullMQ jobs;
// the actual PDF rendering + SendGrid send happens asynchronously in workers/invoice.worker.js. That split
// is required by FR-4.3: "reminder and notification jobs shall run asynchronously and not block the
// main application from responding to user requests." So the overdue-check job and any manual
// "send reminder" / "send invoice" action call these helpers and return immediately, while delivery
// (which can be slow or fail transiently) is retried in the background by the worker.

const { enqueueInvoiceReminder, enqueueInvoiceEmail } = require('../../jobs/invoiceReminder.job');

/**
 * Queue a payment reminder email for an invoice (FR-4.1). Returns as soon as the job is enqueued.
 * @param {string} invoiceId
 */
async function sendInvoiceReminder(invoiceId) {
  return enqueueInvoiceReminder(invoiceId);
}

/**
 * Queue PDF generation + the "invoice sent" email for an invoice (FR-4.2). Returns immediately.
 * @param {string} invoiceId
 */
async function sendInvoiceEmail(invoiceId) {
  return enqueueInvoiceEmail(invoiceId);
}

module.exports = { sendInvoiceReminder, sendInvoiceEmail };
