// customer.test.js — placeholder tests for the customer module (Spec Section 6 — Customers).
// Uses it.todo so the suite is valid (won't fail) until the real tests land.

describe('customer module', () => {
  // TODO: test CRUD operations
  it.todo('lists customers with pagination (default limit 20)');
  it.todo('gets a customer by id (404 when missing)');
  it.todo('creates a customer and writes an AuditLog entry');
  it.todo('updates a customer and records before/after in the AuditLog');
  it.todo('deletes/archives a customer');
});
