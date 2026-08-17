// idempotency.test.js — the canonical duplicate-key test at the middleware + real-model level
// (Spec Section 7.1, idempotent-endpoint skill Step 4).
//
// Rather than go through HTTP (covered in invoice/payment .test.js), this drives the middleware
// directly against the real IdempotencyKey collection to assert the cache is written once and
// replayed. DB-backed (no transactions needed → standalone Mongo), skipped where Mongo is
// unavailable via BILLFLOW_SKIP_DB_TESTS=1.

const idempotencyMiddleware = require('../src/middleware/idempotency.middleware');
const IdempotencyKey = require('../src/models/IdempotencyKey');
const { connect, clearDatabase, closeDatabase } = require('./helpers/db');

const describeDb = process.env.BILLFLOW_SKIP_DB_TESTS ? describe.skip : describe;

// Minimal res double capturing status + body, mirroring Express's chainable API.
function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

// Wait a tick so the middleware's fire-and-forget cache write completes.
const flush = () => new Promise((r) => setImmediate(r));

describeDb('idempotency middleware (Spec 7.1) — real model', () => {
  beforeAll(async () => {
    await connect();
  });
  afterEach(async () => {
    await clearDatabase();
  });
  afterAll(async () => {
    await closeDatabase();
  });

  it('caches a successful response, replays it on repeat, and creates exactly one record', async () => {
    const key = 'dup-key-1';

    // First request: controller runs and sends a 201.
    const res1 = mockRes();
    const next1 = jest.fn(() => res1.status(201).json({ success: true, data: { id: 'abc' } }));
    await idempotencyMiddleware({ headers: { 'idempotency-key': key } }, res1, next1);
    next1();
    await flush();

    expect(next1).toHaveBeenCalled();
    expect(res1.statusCode).toBe(201);

    // Second request with the SAME key: cached response replayed, controller NOT run.
    const res2 = mockRes();
    const next2 = jest.fn();
    await idempotencyMiddleware({ headers: { 'idempotency-key': key } }, res2, next2);

    expect(next2).not.toHaveBeenCalled();
    expect(res2.statusCode).toBe(201);
    expect(res2.body).toEqual({ success: true, data: { id: 'abc' } });

    // Exactly one cache record exists.
    expect(await IdempotencyKey.countDocuments({ key })).toBe(1);
  });

  it('requests without an Idempotency-Key skip the cache and proceed', async () => {
    const res = mockRes();
    const next = jest.fn();
    await idempotencyMiddleware({ headers: {} }, res, next);
    expect(next).toHaveBeenCalled();
    expect(await IdempotencyKey.countDocuments()).toBe(0);
  });

  it('does not cache an error (non-2xx) response', async () => {
    const key = 'err-key-1';
    const res = mockRes();
    const next = jest.fn(() => res.status(400).json({ success: false }));
    await idempotencyMiddleware({ headers: { 'idempotency-key': key } }, res, next);
    next();
    await flush();
    expect(await IdempotencyKey.countDocuments({ key })).toBe(0);
  });
});
