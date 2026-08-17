// notification.service.js — email-sending logic used by the worker (wraps Nodemailer, Spec Section 2).
//
// TODO: implement send-email logic used by the worker.
//   - create a Nodemailer transport from SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS (Spec Section 9)
//   - sendInvoiceEmail(invoiceId, pdfPath): load invoice + customer, build the message from
//     utils/emailTemplates, attach the generated PDF, and send it
//   - used by workers/invoice.worker.js after PDF generation (Spec Section 7.4)

// TODO: implement and export the notification functions used by the worker.
module.exports = {};
