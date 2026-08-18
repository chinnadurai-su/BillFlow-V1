// backend-logic.unit.test.js — socket-free unit tests for the pure business logic added across
// Sections 3–10: invoice totals/numbering, recurring cycle math, audit sanitization, pagination,
// the dashboard aggregation pipeline builder, and idempotency middleware behavior (mocked model).
// None of these need a DB or a socket, so they always run.

// Mock the IdempotencyKey model so the middleware tests run without a DB. (Hoisted by jest.)
jest.mock('../src/models/IdempotencyKey', () => ({ findOne: jest.fn(), create: jest.fn() }));

const { computeTotals, formatInvoiceNumber, cycleToDelayMs, DAY_MS } = require('../src/modules/invoice/invoice.service');
const { sanitize } = require('../src/utils/audit');
const { parsePagination, paginatedResult } = require('../src/utils/pagination');
const { buildRevenueTrendPipeline } = require('../src/modules/dashboard/dashboard.service');
const IdempotencyKey = require('../src/models/IdempotencyKey');
const idempotencyMiddleware = require('../src/middleware/idempotency.middleware');

describe('invoice.computeTotals (FR-2.2)', () => {
  it('computes per-item totals, subtotal, tax, and total (server-side)', () => {
    const out = computeTotals(
      [
        { description: 'A', quantity: 2, unitPrice: 100 },
        { description: 'B', quantity: 1, unitPrice: 49.5 },
      ],
      0.1
    );
    expect(out.items[0].total).toBe(200);
    expect(out.items[1].total).toBe(49.5);
    expect(out.subtotal).toBe(249.5);
    expect(out.tax).toBe(24.95); // 249.5 * 0.1
    expect(out.totalAmount).toBe(274.45);
  });

  it('defaults tax to 0 when no rate is given', () => {
    const out = computeTotals([{ description: 'A', quantity: 3, unitPrice: 10 }]);
    expect(out.subtotal).toBe(30);
    expect(out.tax).toBe(0);
    expect(out.totalAmount).toBe(30);
  });

  it('rejects an empty item list', () => {
    expect(() => computeTotals([])).toThrow(/at least one line item/i);
  });

  it('rejects a non-positive quantity or negative unit price', () => {
    expect(() => computeTotals([{ description: 'A', quantity: 0, unitPrice: 10 }])).toThrow();
    expect(() => computeTotals([{ description: 'A', quantity: 1, unitPrice: -5 }])).toThrow();
  });

  it('rejects a tax rate outside 0..1', () => {
    expect(() => computeTotals([{ description: 'A', quantity: 1, unitPrice: 1 }], 2)).toThrow();
  });

  it('ignores any client-sent total on the item (recomputes it)', () => {
    const out = computeTotals([{ description: 'A', quantity: 2, unitPrice: 5, total: 9999 }]);
    expect(out.items[0].total).toBe(10);
  });
});

describe('invoice.formatInvoiceNumber (FR-2.4)', () => {
  it('zero-pads the sequence to 4 digits', () => {
    expect(formatInvoiceNumber(2026, 42)).toBe('INV-2026-0042');
    expect(formatInvoiceNumber(2026, 1)).toBe('INV-2026-0001');
  });
  it('does not truncate sequences beyond 4 digits', () => {
    expect(formatInvoiceNumber(2026, 12345)).toBe('INV-2026-12345');
  });
});

describe('invoice.cycleToDelayMs (FR-2.5 / BR-3)', () => {
  it('maps cycles to day-based delays', () => {
    expect(cycleToDelayMs('monthly')).toBe(30 * DAY_MS);
    expect(cycleToDelayMs('quarterly')).toBe(91 * DAY_MS);
    expect(cycleToDelayMs('yearly')).toBe(365 * DAY_MS);
  });
  it('throws on an unknown cycle', () => {
    expect(() => cycleToDelayMs('weekly')).toThrow(/unknown recurringcycle/i);
  });
});

describe('audit.sanitize (Spec 7.3 / FR-6.2)', () => {
  it('strips sensitive keys from a snapshot', () => {
    const clean = sanitize({
      name: 'x',
      passwordHash: 'secret',
      token: 't',
      cardNumber: '4111',
      idempotencyKey: 'k',
      amount: 10,
    });
    expect(clean).toEqual({ name: 'x', amount: 10 });
  });
  it('passes non-objects through untouched', () => {
    expect(sanitize(null)).toBeNull();
    expect(sanitize(5)).toBe(5);
  });
  it('handles a Mongoose-like doc via toObject()', () => {
    const doc = { toObject: () => ({ a: 1, passwordHash: 'x' }) };
    expect(sanitize(doc)).toEqual({ a: 1 });
  });
});

describe('pagination helpers (Spec Section 8)', () => {
  it('defaults to page 1, limit 20', () => {
    expect(parsePagination({})).toEqual({ page: 1, limit: 20, skip: 0 });
  });
  it('computes skip from page + limit', () => {
    expect(parsePagination({ page: '3', limit: '10' })).toEqual({ page: 3, limit: 10, skip: 20 });
  });
  it('caps limit at 100 and floors page/limit at 1', () => {
    expect(parsePagination({ limit: '9999' }).limit).toBe(100);
    expect(parsePagination({ page: '0' }).page).toBe(1);
    expect(parsePagination({ limit: '0' }).limit).toBe(1);
  });
  it('builds a paginated envelope with hasNextPage', () => {
    const res = paginatedResult([1, 2], 25, { page: 1, limit: 20 });
    expect(res.pagination).toEqual({ page: 1, limit: 20, total: 25, pageCount: 2, hasNextPage: true });
    const last = paginatedResult([1], 25, { page: 2, limit: 20 });
    expect(last.pagination.hasNextPage).toBe(false);
  });
});

describe('dashboard.buildRevenueTrendPipeline (FR-5.2)', () => {
  it('matches only completed payments and groups monthly by default', () => {
    const pipeline = buildRevenueTrendPipeline({});
    expect(pipeline[0]).toEqual({ $match: { status: 'completed' } });
    expect(pipeline[1].$group._id.$dateToString.format).toBe('%Y-%m');
    expect(pipeline[1].$group.total).toEqual({ $sum: '$amount' });
  });
  it('supports daily granularity and a date range', () => {
    const pipeline = buildRevenueTrendPipeline({ from: '2026-01-01', to: '2026-02-01', granularity: 'day' });
    expect(pipeline[1].$group._id.$dateToString.format).toBe('%Y-%m-%d');
    expect(pipeline[0].$match.createdAt.$gte).toBeInstanceOf(Date);
    expect(pipeline[0].$match.createdAt.$lte).toBeInstanceOf(Date);
  });
});

describe('idempotency middleware (Spec 7.1) — behavior with a mocked model', () => {
  beforeEach(() => jest.clearAllMocks());

  function mockRes() {
    return {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
  }

  it('skips (calls next) when no Idempotency-Key header is present', async () => {
    const next = jest.fn();
    await idempotencyMiddleware({ headers: {} }, mockRes(), next);
    expect(next).toHaveBeenCalled();
    expect(IdempotencyKey.findOne).not.toHaveBeenCalled();
  });

  it('replays the cached response for a known key (controller never runs)', async () => {
    IdempotencyKey.findOne.mockResolvedValue({ statusCode: 201, response: { success: true, cached: true } });
    const res = mockRes();
    const next = jest.fn();
    await idempotencyMiddleware({ headers: { 'idempotency-key': 'k1' } }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ success: true, cached: true });
  });

  it('does NOT cache an error (4xx) response', async () => {
    IdempotencyKey.findOne.mockResolvedValue(null);
    IdempotencyKey.create.mockResolvedValue({});
    const res = mockRes();
    await idempotencyMiddleware({ headers: { 'idempotency-key': 'k2' } }, res, jest.fn());
    // Simulate the controller sending a 400 via the wrapped res.json.
    res.status(400).json({ success: false });
    expect(IdempotencyKey.create).not.toHaveBeenCalled();
  });

  it('caches a successful (2xx) response', async () => {
    IdempotencyKey.findOne.mockResolvedValue(null);
    IdempotencyKey.create.mockResolvedValue({});
    const res = mockRes();
    await idempotencyMiddleware({ headers: { 'idempotency-key': 'k3' } }, res, jest.fn());
    res.status(201).json({ success: true });
    expect(IdempotencyKey.create).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'k3', statusCode: 201, response: { success: true } })
    );
  });
});
