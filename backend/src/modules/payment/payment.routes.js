// payment.routes.js — Express router for payment endpoints (Spec Section 6 — Payments).
//
//   GET  /api/payments      — List payments
//   POST /api/payments      — Record payment (requires Idempotency-Key header, Spec 7.1)
//   GET  /api/payments/:id  — Payment detail
//
// NOTE: apply express-rate-limit + auth.middleware to these routes once implemented (Spec Section 8).

const express = require('express');
const paymentController = require('./payment.controller');
const idempotencyMiddleware = require('../../middleware/idempotency.middleware');

const router = express.Router();

router.get('/', paymentController.listPayments);
// idempotencyMiddleware runs BEFORE the controller — duplicate keys short-circuit (Spec 7.1).
router.post('/', idempotencyMiddleware, paymentController.recordPayment);
router.get('/:id', paymentController.getPayment);

module.exports = router;
