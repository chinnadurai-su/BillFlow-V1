// invoice.routes.js — Express router for invoice endpoints (Spec Section 6 — Invoices).
//
//   GET    /api/invoices          — List invoices (filter by status, customer, date range)
//   GET    /api/invoices/:id      — Get invoice detail
//   POST   /api/invoices          — Create invoice (requires Idempotency-Key header, Spec 7.1)
//   PUT    /api/invoices/:id      — Update invoice
//   DELETE /api/invoices/:id      — Cancel invoice
//   GET    /api/invoices/:id/pdf  — Download invoice PDF
//   POST   /api/invoices/:id/send — Send invoice email to customer
//
// NOTE: protect these routes with auth.middleware once auth is implemented (Spec Section 8).

const express = require('express');
const invoiceController = require('./invoice.controller');
const idempotencyMiddleware = require('../../middleware/idempotency.middleware');

const router = express.Router();

router.get('/', invoiceController.listInvoices);
router.get('/:id', invoiceController.getInvoice);
// idempotencyMiddleware runs BEFORE the controller — duplicate keys short-circuit (Spec 7.1).
router.post('/', idempotencyMiddleware, invoiceController.createInvoice);
router.put('/:id', invoiceController.updateInvoice);
router.delete('/:id', invoiceController.cancelInvoice);
router.get('/:id/pdf', invoiceController.downloadPdf);
router.post('/:id/send', invoiceController.sendInvoice);

module.exports = router;
