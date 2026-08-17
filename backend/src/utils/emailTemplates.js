// emailTemplates.js — Email template builders for invoice/reminder emails (Spec Section 7.4).
//
// Purpose: builds the subject + HTML/text body for invoice and reminder emails. The actual
// sending is done by modules/notification/notification.service.js (which wraps Nodemailer).
//
// TODO: implement email templates for invoice reminders.
//   - invoiceEmailTemplate({ customer, invoice }) → { subject, html, text }
//   - reminderEmailTemplate({ customer, invoice }) → { subject, html, text } for overdue/upcoming
//   - keep templates data-driven; never embed secrets or payment card data (Spec 7.3)

// eslint-disable-next-line no-unused-vars
function invoiceEmailTemplate({ customer, invoice } = {}) {
  // TODO: return { subject, html, text } for a newly issued invoice.
  throw new Error('emailTemplates.invoiceEmailTemplate not implemented (scaffold).');
}

// eslint-disable-next-line no-unused-vars
function reminderEmailTemplate({ customer, invoice } = {}) {
  // TODO: return { subject, html, text } for a payment reminder.
  throw new Error('emailTemplates.reminderEmailTemplate not implemented (scaffold).');
}

module.exports = { invoiceEmailTemplate, reminderEmailTemplate };
