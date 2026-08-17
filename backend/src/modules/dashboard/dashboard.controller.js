// dashboard.controller.js — thin Express handlers for dashboard analytics (Spec Section 6 — Dashboard).

const dashboardService = require('./dashboard.service');

// GET /api/dashboard/summary — revenue, outstanding, overdue totals (FR-5.1).
async function getSummary(req, res, next) {
  try {
    const summary = await dashboardService.getSummary();
    return res.status(200).json({ success: true, data: summary });
  } catch (err) {
    return next(err);
  }
}

// GET /api/dashboard/revenue-trend — time-series for the chart (FR-5.2).
async function getRevenueTrend(req, res, next) {
  try {
    const trend = await dashboardService.getRevenueTrend(req.query);
    return res.status(200).json({ success: true, data: trend });
  } catch (err) {
    return next(err);
  }
}

module.exports = { getSummary, getRevenueTrend };
