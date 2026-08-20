// dashboard.models.ts — Dashboard analytics types (Spec §6 Dashboard, FR-5.1).

/** Headline figures for the KPI cards. */
export interface DashboardSummary {
  totalRevenue: number; // total collected revenue
  outstanding: number; // total outstanding (unpaid) amount
  overdueCount: number; // number of overdue invoices
}

/** One point on the revenue time-series. */
export interface RevenueTrendPoint {
  label: string; // period label, e.g. "Jan 2026"
  revenue: number;
}

/** Optional date-range filter for the revenue trend. */
export interface RevenueTrendParams {
  fromDate?: string;
  toDate?: string;
}

// ---------------------------------------------------------------------------
// Raw API payloads (GET /api/dashboard/*). The backend uses different field
// names than the view models above, so the service maps between them.
// ---------------------------------------------------------------------------

/** Raw summary payload from GET /api/dashboard/summary. */
export interface DashboardSummaryResponse {
  totalRevenue: number;
  totalOutstanding: number;
  totalOverdue: number;
  overdueCount: number;
}

/** Raw revenue-trend row from GET /api/dashboard/revenue-trend. */
export interface RevenueTrendResponse {
  period: string; // "2026-08" (monthly) or "2026-08-17" (daily)
  total: number;
}
