// invoice.controller.js — Express request handlers for invoices (Spec Section 6 — Invoices).
//
// TODO: implement CRUD + PDF download + send-email handlers matching Section 6 endpoints,
//       delegating to invoice.service:
//   listInvoices    GET    /api/invoices          — paginated; filter by status, customer, date range
//   getInvoice      GET    /api/invoices/:id      — fetch one, 404 if not found
//   createInvoice   POST   /api/invoices          — requires Idempotency-Key header (Spec 7.1);
//                                                    creates invoice + updates customer balance +
//                                                    writes AuditLog inside a transaction (Spec 7.2)
//   updateInvoice   PUT    /api/invoices/:id      — validate + update, write AuditLog
//   cancelInvoice   DELETE /api/invoices/:id      — set status 'cancelled', write AuditLog
//   downloadPdf     GET    /api/invoices/:id/pdf  — stream/return the generated PDF (utils/pdfGenerator)
//   sendInvoice     POST   /api/invoices/:id/send — enqueue the invoiceReminder job (PDF + email)

// eslint-disable-next-line no-unused-vars
async function listInvoices(req, res, next) {
  // TODO: call invoice.service.js (paginated + filterable list)
  return res.status(501).json({ success: false, message: 'Not implemented', errorCode: 'NOT_IMPLEMENTED' });
}

// eslint-disable-next-line no-unused-vars
async function getInvoice(req, res, next) {
  // TODO: call invoice.service.js
  return res.status(501).json({ success: false, message: 'Not implemented', errorCode: 'NOT_IMPLEMENTED' });
}

// eslint-disable-next-line no-unused-vars
async function createInvoice(req, res, next) {
  // TODO: call invoice.service.js (idempotency middleware runs before this on the POST route)
  return res.status(501).json({ success: false, message: 'Not implemented', errorCode: 'NOT_IMPLEMENTED' });
}

// eslint-disable-next-line no-unused-vars
async function updateInvoice(req, res, next) {
  // TODO: call invoice.service.js
  return res.status(501).json({ success: false, message: 'Not implemented', errorCode: 'NOT_IMPLEMENTED' });
}

// eslint-disable-next-line no-unused-vars
async function cancelInvoice(req, res, next) {
  // TODO: call invoice.service.js
  return res.status(501).json({ success: false, message: 'Not implemented', errorCode: 'NOT_IMPLEMENTED' });
}

// eslint-disable-next-line no-unused-vars
async function downloadPdf(req, res, next) {
  // TODO: call invoice.service.js / utils/pdfGenerator
  return res.status(501).json({ success: false, message: 'Not implemented', errorCode: 'NOT_IMPLEMENTED' });
}

// eslint-disable-next-line no-unused-vars
async function sendInvoice(req, res, next) {
  // TODO: enqueue invoiceReminder job (PDF + email) via jobs/
  return res.status(501).json({ success: false, message: 'Not implemented', errorCode: 'NOT_IMPLEMENTED' });
}

module.exports = {
  listInvoices,
  getInvoice,
  createInvoice,
  updateInvoice,
  cancelInvoice,
  downloadPdf,
  sendInvoice,
};
