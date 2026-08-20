// dashboard.service.ts — Data access for dashboard analytics (Spec §6 Dashboard).
//
// Thin ApiService wrapper; failures arrive as normalized AppErrors (Spec §8, item 9).
// The backend names its analytics fields differently from the view models the UI binds to
// (summary.totalOutstanding → outstanding; trend rows are { period, total } → { label, revenue }),
// so this service maps the raw payloads into the component-facing shapes.
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { ApiService } from '../../core/api.service';
import {
  DashboardSummary,
  DashboardSummaryResponse,
  RevenueTrendParams,
  RevenueTrendPoint,
  RevenueTrendResponse,
} from './dashboard.models';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Turn a backend period bucket into a human-readable chart label.
 * "2026-08" → "Aug 2026"; "2026-08-17" → "Aug 17". Falls back to the raw value if unrecognized.
 */
function formatPeriodLabel(period: string): string {
  const [year, month, day] = (period ?? '').split('-');
  const monthName = MONTH_NAMES[Number(month) - 1];
  if (!monthName) {
    return period;
  }
  return day ? `${monthName} ${Number(day)}` : `${monthName} ${year}`;
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly api = inject(ApiService);

  /** GET /api/dashboard/summary — revenue, outstanding and overdue figures. */
  getSummary(): Observable<DashboardSummary> {
    return this.api.get<DashboardSummaryResponse>('/dashboard/summary').pipe(
      map((res) => ({
        totalRevenue: res.totalRevenue,
        outstanding: res.totalOutstanding,
        overdueCount: res.overdueCount,
      })),
    );
  }

  /** GET /api/dashboard/revenue-trend — time-series for the chart. */
  getRevenueTrend(range: RevenueTrendParams = {}): Observable<RevenueTrendPoint[]> {
    return this.api
      .get<RevenueTrendResponse[]>('/dashboard/revenue-trend', {
        params: { fromDate: range.fromDate, toDate: range.toDate },
      })
      .pipe(
        map((rows) =>
          rows.map((row) => ({ label: formatPeriodLabel(row.period), revenue: row.total })),
        ),
      );
  }
}
