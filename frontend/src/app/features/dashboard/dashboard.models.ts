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
