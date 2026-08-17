// idempotency.test.js — the required idempotency duplicate-key test (Spec Section 7.1 test example).
//
// This is the canonical duplicate-key test called out by the idempotent-endpoint skill (Step 4).
// It applies to every idempotent POST route (currently /api/invoices and /api/payments).
//
// Suggested setup once implemented: mongodb-memory-server for an isolated DB + supertest for HTTP.
// Uses it.todo so the suite is valid (won't fail) until the real tests land.

describe('idempotency middleware (Spec 7.1)', () => {
  // TODO: idempotency duplicate-key test
  //   1. POST with a given Idempotency-Key → expect 201 and a created record
  //   2. POST again with the SAME key → expect the SAME status + body, and NO new record
  //   3. Assert exactly one record exists in the database
  it.todo('second request with the same Idempotency-Key returns the cached response, no duplicate write');
  it.todo('exactly one record is created after two identical requests');
  it.todo('a fresh Idempotency-Key after TTL expiry is treated as a new request');
  it.todo('requests without an Idempotency-Key skip the cache and proceed normally');
});
