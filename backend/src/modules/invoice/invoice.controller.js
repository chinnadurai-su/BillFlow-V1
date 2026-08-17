// invoice.controller.js — thin Express handlers for invoices (Spec Section 6 — Invoices).
//
// Controllers stay thin: read req, delegate to invoice.service, shape { success, data }, and
// forward errors via next(err). The idempotency middleware runs before createInvoice on the route;
// the create handler forwards the Idempotency-Key header to the service so the invoice records it
// (DB-enforced idempotency backstop, Spec 7.1).

const invoiceService = require('./invoice.service');

// GET /api/invoices — paginated + filterable (status, customer, date range).
exports.listInvoices = async (req, res, next) => {
  try {
    const result = await invoiceService.list(req.query);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return next(err);
  }
};

// GET /api/invoices/:id — one invoice (404 if missing).
exports.getInvoice = async (req, res, next) => {
  try {
    const invoice = await invoiceService.getById(req.params.id);
    return res.status(200).json({ success: true, data: invoice });
  } catch (err) {
    return next(err);
  }
};

// POST /api/invoices — create (requires Idempotency-Key header, Spec 7.1).
exports.createInvoice = async (req, res, next) => {
  try {
    const idempotencyKey = req.headers['idempotency-key'];
    const invoice = await invoiceService.create(
      { ...req.body, idempotencyKey },
      req.user && req.user.id
    );
    return res.status(201).json({ success: true, data: invoice });
  } catch (err) {
    return next(err);
  }
};

// PUT /api/invoices/:id — update line items / due date.
exports.updateInvoice = async (req, res, next) => {
  try {
    const invoice = await invoiceService.update(req.params.id, req.body, req.user && req.user.id);
    return res.status(200).json({ success: true, data: invoice });
  } catch (err) {
    return next(err);
  }
};

// DELETE /api/invoices/:id — cancel (soft, BR-1). Admin-only guard is on the route (BR-5).
exports.cancelInvoice = async (req, res, next) => {
  try {
    const invoice = await invoiceService.cancel(req.params.id, req.user && req.user.id);
    return res.status(200).json({ success: true, data: invoice });
  } catch (err) {
    return next(err);
  }
};

// GET /api/invoices/:id/pdf — stream the generated PDF (FR-2.6).
exports.downloadPdf = async (req, res, next) => {
  try {
    const { buffer, invoice } = await invoiceService.getInvoicePdf(req.params.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${invoice.invoiceNumber || 'invoice'}.pdf"`
    );
    return res.status(200).send(buffer);
  } catch (err) {
    return next(err);
  }
};

// POST /api/invoices/:id/send — mark sent + enqueue PDF/email job (FR-2.7).
exports.sendInvoice = async (req, res, next) => {
  try {
    const invoice = await invoiceService.sendInvoice(req.params.id, req.user && req.user.id);
    return res.status(200).json({ success: true, data: invoice, message: 'Invoice queued for delivery' });
  } catch (err) {
    return next(err);
  }
};

// POST /api/invoices/:id/remind — enqueue a payment reminder email (FR-4.1, manual trigger).
exports.remindInvoice = async (req, res, next) => {
  try {
    const invoice = await invoiceService.remind(req.params.id);
    return res.status(200).json({ success: true, data: invoice, message: 'Reminder queued' });
  } catch (err) {
    return next(err);
  }
};
