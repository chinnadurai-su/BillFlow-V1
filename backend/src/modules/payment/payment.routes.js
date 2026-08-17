// payment.routes.js — Express router for payment endpoints (Spec Section 6 — Payments).
//
//   GET  /api/payments      — List payments
//   POST /api/payments      — Record payment (requires Idempotency-Key header, Spec 7.1)
//   GET  /api/payments/:id  — Payment detail
//
// All routes require authentication (Spec Section 8). Recording payments is allowed for both
// Admin and Staff (BRD Section 5), so no admin-only guard here.

const express = require('express');
const paymentController = require('./payment.controller');
const idempotencyMiddleware = require('../../middleware/idempotency.middleware');
const authMiddleware = require('../../middleware/auth.middleware');

const router = express.Router();

// Protect every payment route with JWT auth.
router.use(authMiddleware);

router.get('/', paymentController.listPayments);
// idempotencyMiddleware runs BEFORE the controller — duplicate keys short-circuit (Spec 7.1).
router.post('/', idempotencyMiddleware, paymentController.recordPayment);
router.get('/:id', paymentController.getPayment);

module.exports = router;
