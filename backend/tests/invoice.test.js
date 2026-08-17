// invoice.test.js — placeholder tests for the invoice module (Spec Section 6 — Invoices).
// Uses it.todo so the suite is valid (won't fail) until the real tests land.

describe('invoice module', () => {
  // TODO: test CRUD operations
  it.todo('lists invoices with filters (status, customer, date range) + pagination');
  it.todo('gets an invoice by id (404 when missing)');
  it.todo('creates an invoice, updates customer balance, and writes AuditLog in a transaction (Spec 7.2)');
  it.todo('rolls back the whole invoice-create transaction if any step fails (Spec 7.2)');
  it.todo('updates and cancels an invoice');
  it.todo('downloads the invoice PDF');
  it.todo('sends the invoice email (enqueues the job)');

  // TODO: idempotency duplicate-key test (Spec Section 7.1) — POST /api/invoices
  //   send the SAME Idempotency-Key twice and assert:
  //     - only ONE invoice is created in the database
  //     - the second response equals the first (same status code + body)
  //     - after TTL expiry, a fresh key behaves as a new request
  it.todo('creates only one invoice when the same Idempotency-Key is sent twice (Spec 7.1)');
});
