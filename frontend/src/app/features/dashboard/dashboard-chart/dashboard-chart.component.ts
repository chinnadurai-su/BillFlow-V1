// dashboard-chart.component.ts — Chart.js revenue-trend visualization.
import { Component } from '@angular/core';

@Component({
  selector: 'app-dashboard-chart',
  imports: [],
  templateUrl: './dashboard-chart.component.html',
  styleUrl: './dashboard-chart.component.css',
})
export class DashboardChartComponent {
  // TODO:
  //  - Fetch time-series via DashboardService -> GET /api/dashboard/revenue-trend (Spec §6).
  //  - Render a Chart.js line chart of the revenue trend (Spec §2 — Chart.js).
  //  - Destroy the chart instance on component teardown.
}
