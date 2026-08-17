// payment.controller.js — thin Express handlers for payments (Spec Section 6 — Payments).
//
// Controllers stay thin: delegate to payment.service, shape { success, data }, forward errors.
// The idempotency middleware runs before recordPayment on the route; the handler forwards the
// Idempotency-Key header to the service (DB-enforced idempotency backstop, Spec 7.1 / FR-3.4).

const paymentService = require('./payment.service');

// GET /api/payments — paginated + filterable list.
async function listPayments(req, res, next) {
  try {
    const result = await paymentService.list(req.query);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return next(err);
  }
}

// GET /api/payments/:id — one payment (404 if missing).
async function getPayment(req, res, next) {
  try {
    const payment = await paymentService.getById(req.params.id);
    return res.status(200).json({ success: true, data: payment });
  } catch (err) {
    return next(err);
  }
}

// POST /api/payments — record a payment (requires Idempotency-Key header, Spec 7.1).
async function recordPayment(req, res, next) {
  try {
    const idempotencyKey = req.headers['idempotency-key'];
    const payment = await paymentService.record(
      { ...req.body, idempotencyKey },
      req.user && req.user.id
    );
    return res.status(201).json({ success: true, data: payment });
  } catch (err) {
    return next(err);
  }
}

module.exports = { listPayments, getPayment, recordPayment };
