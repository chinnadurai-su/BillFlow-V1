// dashboard.component.ts — Dashboard landing view with revenue/outstanding/overdue summary cards.
import { Component } from '@angular/core';

@Component({
  selector: 'app-dashboard',
  imports: [],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent {
  // TODO:
  //  - Load summary via DashboardService -> GET /api/dashboard/summary (Spec §6 Dashboard).
  //  - Render KPI cards: revenue, outstanding, overdue counts.
  //  - Embed <app-dashboard-chart> for the revenue trend.
}
