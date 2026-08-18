// notification.service.js — synchronous email sending for BillFlow (BRD FR-4.1/4.2).
//
// SIMPLICITY CHOICE (learning project): there is NO queue. This module does the real work directly —
// render the PDF (PDFKit) and send the email (SendGrid via utils/mailer). Callers await it and wrap
// it in try/catch so an email failure never breaks the main flow (invoice/payment still succeed).
// The daily cron checks (jobs/*) also call these helpers directly.
//
// (Previously this was a thin BullMQ enqueue wrapper; the queue/worker were removed in favour of
// synchronous sends + node-cron. See docs/BillFlow_Dev_Technical_Spec.md §7.)

const Invoice = require('../../models/Invoice');
const Customer = require('../../models/Customer');
const { renderInvoicePdf } = require('../../utils/pdfGenerator');
const { sendMail } = require('../../utils/mailer');
const { invoiceSentTemplate, paymentReminderTemplate } = require('../../utils/emailTemplates');

// Load an invoice + its customer as plain objects (templates/PDF take plain objects).
async function loadInvoiceAndCustomer(invoiceId) {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw new Error(`Invoice ${invoiceId} not found`);
  const customer = await Customer.findById(invoice.customerId);
  return {
    invoice: invoice.toObject(),
    customer: customer ? customer.toObject() : {},
  };
}

/**
 * Render the invoice PDF and email it to the customer with the PDF attached (FR-4.2).
 * Synchronous — throws on failure so the caller can decide (callers treat it as best-effort).
 * @param {string} invoiceId
 */
async function sendInvoiceEmail(invoiceId) {
  const { invoice, customer } = await loadInvoiceAndCustomer(invoiceId);
  const pdf = await renderInvoicePdf(invoice, customer);
  const { subject, html, text } = invoiceSentTemplate(invoice, customer);
  return sendMail({
    to: customer.email,
    subject,
    html,
    text,
    attachments: [{ filename: `${invoice.invoiceNumber || 'invoice'}.pdf`, content: pdf }],
  });
}

/**
 * Email a payment reminder for an invoice (FR-4.1). Tone (due-soon vs past-due) is derived from
 * the invoice status inside paymentReminderTemplate. Synchronous — throws on failure.
 * @param {string} invoiceId
 */
async function sendInvoiceReminder(invoiceId) {
  const { invoice, customer } = await loadInvoiceAndCustomer(invoiceId);
  const { subject, html, text } = paymentReminderTemplate(invoice, customer);
  return sendMail({ to: customer.email, subject, html, text });
}

module.exports = { sendInvoiceEmail, sendInvoiceReminder };
