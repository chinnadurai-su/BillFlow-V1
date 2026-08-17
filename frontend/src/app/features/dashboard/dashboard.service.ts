// dashboard.service.ts — Data access for dashboard analytics.
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  // TODO: implement calls (Spec §6 Dashboard), extending core/api.service:
  //  - summary()      -> GET /api/dashboard/summary        (revenue, outstanding, overdue counts)
  //  - revenueTrend() -> GET /api/dashboard/revenue-trend  (time-series for charts)
}
