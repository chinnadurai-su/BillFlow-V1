// dashboard.service.js — analytics aggregations for the dashboard (BRD FR-5.1–FR-5.3).
//
// getSummary(): total revenue (completed payments), total outstanding (sum of customer balances —
//   which by our BR-2 invariant equals unpaid invoices minus payments), and total overdue.
// getRevenueTrend(): time-series of completed payments grouped by day or month over a date range.
//
// buildRevenueTrendPipeline() is a pure function (returns the aggregation array) so the grouping
// logic is unit-testable without a DB.

const Payment = require('../../models/Payment');
const Invoice = require('../../models/Invoice');
const Customer = require('../../models/Customer');

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * Build the aggregation pipeline for the revenue trend. Pure → unit-testable.
 * @param {object} [opts]
 * @param {string|Date} [opts.from]
 * @param {string|Date} [opts.to]
 * @param {'day'|'month'} [opts.granularity] default 'month'
 * @returns {Array<object>} MongoDB aggregation pipeline
 */
function buildRevenueTrendPipeline({ from, to, granularity = 'month' } = {}) {
  const match = { status: 'completed' };
  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.$gte = new Date(from);
    if (to) match.createdAt.$lte = new Date(to);
  }
  // Group into readable period buckets ("2026-08" monthly, "2026-08-17" daily).
  const format = granularity === 'day' ? '%Y-%m-%d' : '%Y-%m';
  return [
    { $match: match },
    { $group: { _id: { $dateToString: { format, date: '$createdAt' } }, total: { $sum: '$amount' } } },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, period: '$_id', total: 1 } },
  ];
}

// Small helper to pull the single scalar out of a `$group _id:null` aggregation.
function firstValue(rows, field) {
  return rows.length ? rows[0][field] : 0;
}

/**
 * Dashboard summary totals (FR-5.1).
 * @returns {Promise<{ totalRevenue:number, totalOutstanding:number, totalOverdue:number, overdueCount:number }>}
 */
async function getSummary() {
  const [revenueRows, outstandingRows, overdueRows] = await Promise.all([
    Payment.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Customer.aggregate([{ $group: { _id: null, total: { $sum: '$balance' } } }]),
    Invoice.aggregate([
      { $match: { status: 'overdue' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
    ]),
  ]);

  return {
    totalRevenue: round2(firstValue(revenueRows, 'total')),
    totalOutstanding: round2(firstValue(outstandingRows, 'total')),
    totalOverdue: round2(firstValue(overdueRows, 'total')),
    overdueCount: firstValue(overdueRows, 'count'),
  };
}

/**
 * Revenue trend time-series (FR-5.2).
 * @param {object} query { from, to, granularity }
 * @returns {Promise<Array<{ period:string, total:number }>>}
 */
async function getRevenueTrend(query = {}) {
  const rows = await Payment.aggregate(buildRevenueTrendPipeline(query));
  return rows.map((r) => ({ period: r.period, total: round2(r.total) }));
}

module.exports = { getSummary, getRevenueTrend, buildRevenueTrendPipeline };
