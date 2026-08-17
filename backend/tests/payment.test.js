// payment.test.js — placeholder tests for the payment module (Spec Section 6 — Payments).
// Uses it.todo so the suite is valid (won't fail) until the real tests land.

describe('payment module', () => {
  // TODO: test CRUD operations
  it.todo('lists payments with pagination (default limit 20)');
  it.todo('gets a payment by id (404 when missing)');
  it.todo('records a payment, updates balances, and writes AuditLog in a transaction (Spec 7.2)');

  // TODO: idempotency duplicate-key test (Spec Section 7.1) — POST /api/payments
  //   send the SAME Idempotency-Key twice and assert:
  //     - only ONE payment is created in the database
  //     - the second response equals the first (same status code + body)
  //     - after TTL expiry, a fresh key behaves as a new request
  it.todo('records only one payment when the same Idempotency-Key is sent twice (Spec 7.1)');
});
