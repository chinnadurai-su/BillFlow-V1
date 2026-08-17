// dashboard.routes.js — Express router for dashboard analytics (Spec Section 6 — Dashboard).
//
//   GET /api/dashboard/summary        — revenue, outstanding, overdue counts (FR-5.1)
//   GET /api/dashboard/revenue-trend  — time-series data for charts (FR-5.2)
//
// All routes require authentication (Spec Section 8). Both Admin and Staff may view analytics.

const express = require('express');
const dashboardController = require('./dashboard.controller');
const authMiddleware = require('../../middleware/auth.middleware');

const router = express.Router();

router.use(authMiddleware);

router.get('/summary', dashboardController.getSummary);
router.get('/revenue-trend', dashboardController.getRevenueTrend);

module.exports = router;
