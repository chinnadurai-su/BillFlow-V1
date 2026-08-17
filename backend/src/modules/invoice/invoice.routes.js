// invoice.routes.js — Express router for invoice endpoints (Spec Section 6 — Invoices).
//
//   GET    /api/invoices          — List invoices (filter by status, customer, date range)
//   GET    /api/invoices/:id      — Get invoice detail
//   POST   /api/invoices          — Create invoice (requires Idempotency-Key header, Spec 7.1)
//   PUT    /api/invoices/:id      — Update invoice
//   DELETE /api/invoices/:id      — Cancel invoice (ADMIN only — BR-5)
//   GET    /api/invoices/:id/pdf  — Download invoice PDF
//   POST   /api/invoices/:id/send — Send invoice email to customer
//   POST   /api/invoices/:id/remind — Enqueue a payment reminder email (FR-4.1)
//
// All routes require authentication (Spec Section 8). Cancelling an invoice is Admin-only (BR-5).

const express = require('express');
const invoiceController = require('./invoice.controller');
const idempotencyMiddleware = require('../../middleware/idempotency.middleware');
const authMiddleware = require('../../middleware/auth.middleware');
const { requireRole } = require('../../middleware/auth.middleware');

const router = express.Router();

// Protect every invoice route with JWT auth.
router.use(authMiddleware);

router.get('/', invoiceController.listInvoices);
router.get('/:id', invoiceController.getInvoice);
// idempotencyMiddleware runs BEFORE the controller — duplicate keys short-circuit (Spec 7.1).
router.post('/', idempotencyMiddleware, invoiceController.createInvoice);
router.put('/:id', invoiceController.updateInvoice);
// BR-5: only Admin can cancel invoices.
router.delete('/:id', requireRole('admin'), invoiceController.cancelInvoice);
router.get('/:id/pdf', invoiceController.downloadPdf);
router.post('/:id/send', invoiceController.sendInvoice);
// Manual payment reminder (FR-4.1) — allowed for both Admin and Staff.
router.post('/:id/remind', invoiceController.remindInvoice);

module.exports = router;
