// payment.controller.js — Express request handlers for payments (Spec Section 6 — Payments).
//
// TODO: implement record + list handlers, delegating to payment.service:
//   listPayments  GET  /api/payments      — paginated list (default limit 20, Spec 8)
//   getPayment    GET  /api/payments/:id  — fetch one, 404 if not found
//   recordPayment POST /api/payments      — requires Idempotency-Key header (Spec 7.1);
//                                            records payment + updates invoice/customer balance +
//                                            writes AuditLog inside a transaction (Spec 7.2)

// eslint-disable-next-line no-unused-vars
async function listPayments(req, res, next) {
  // TODO: call payment.service.js (paginated list)
  return res.status(501).json({ success: false, message: 'Not implemented', errorCode: 'NOT_IMPLEMENTED' });
}

// eslint-disable-next-line no-unused-vars
async function getPayment(req, res, next) {
  // TODO: call payment.service.js
  return res.status(501).json({ success: false, message: 'Not implemented', errorCode: 'NOT_IMPLEMENTED' });
}

// eslint-disable-next-line no-unused-vars
async function recordPayment(req, res, next) {
  // TODO: call payment.service.js (idempotency middleware runs before this on the POST route)
  return res.status(501).json({ success: false, message: 'Not implemented', errorCode: 'NOT_IMPLEMENTED' });
}

module.exports = { listPayments, getPayment, recordPayment };
