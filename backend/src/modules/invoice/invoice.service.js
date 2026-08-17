// invoice.service.js — Business logic for invoices.
const Invoice = require('./invoice.model');
//
// TODO: implement business logic for each operation.
//
// IMPORTANT PATTERNS:
//   - use MongoDB transaction here per Section 7.2: the create flow does
//       Invoice.create() + Customer balance update + AuditLog.create()
//     and MUST be wrapped in session.withTransaction() for all-or-nothing consistency.
//   - use idempotency middleware on create route per Section 7.1: the POST /api/invoices route
//     is guarded by idempotency.middleware so duplicate submissions don't create duplicate invoices.
//   - auto-generate invoiceNumber (e.g. "INV-2026-0042") and compute item totals / subtotal /
//     totalAmount at creation time.
//   - for recurring invoices, schedule the recurringInvoice job (Spec 7.4).

// TODO: implement and export the service functions used by invoice.controller.js.
exports.listInvoices = async (filter, options) => {
  // Implementation for listing invoices
  return await Invoice.find(filter).sort(options.sort).limit(options.limit).skip(options.skip);
};

exports.getInvoice = async (id) => {
  return await Invoice.findById(id);
};

exports.createInvoice = async (invoiceData) => {
  return await Invoice.create(invoiceData);
};

exports.updateInvoice = async (id, updateData) => {
  return await Invoice.findByIdAndUpdate(id, updateData, { new: true });
};

exports.cancelInvoice = async (id) => {
  return await Invoice.findByIdAndUpdate(id, { status: 'cancelled' }, { new: true });
};

exports.downloadPdf = async (id) => {
  // Implementation for downloading PDF
};

exports.sendInvoice = async (id) => {
  // Implementation for sending invoice
};
