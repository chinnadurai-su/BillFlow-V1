// dashboard.service.ts — Data access for dashboard analytics (Spec §6 Dashboard).
//
// Thin ApiService wrapper; failures arrive as normalized AppErrors (Spec §8, item 9).
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from '../../core/api.service';
import { DashboardSummary, RevenueTrendParams, RevenueTrendPoint } from './dashboard.models';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly api = inject(ApiService);

  /** GET /api/dashboard/summary — revenue, outstanding and overdue figures. */
  getSummary(): Observable<DashboardSummary> {
    return this.api.get<DashboardSummary>('/dashboard/summary');
  }

  /** GET /api/dashboard/revenue-trend — time-series for the chart. */
  getRevenueTrend(range: RevenueTrendParams = {}): Observable<RevenueTrendPoint[]> {
    return this.api.get<RevenueTrendPoint[]>('/dashboard/revenue-trend', {
      params: { fromDate: range.fromDate, toDate: range.toDate },
    });
  }
}
