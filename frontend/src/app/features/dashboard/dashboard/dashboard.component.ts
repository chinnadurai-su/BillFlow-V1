// dashboard.component.ts — landing view: KPI summary cards + revenue-trend chart.
//
// Fetches the summary and trend in parallel on init. Totals live in a summary Signal
// (seeded with zeros so the cards render before data arrives); the trend feeds the chart.
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';

import { AppError } from '../../../core/models/api.model';
import { LoadingSpinnerComponent } from '../../../shared/loading-spinner/loading-spinner.component';
import { DashboardChartComponent } from '../dashboard-chart/dashboard-chart.component';
import { DashboardSummary, RevenueTrendPoint } from '../dashboard.models';
import { DashboardService } from '../dashboard.service';

@Component({
  selector: 'app-dashboard',
  imports: [DashboardChartComponent, LoadingSpinnerComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent {
  private readonly dashboardService = inject(DashboardService);
  private readonly destroyRef = inject(DestroyRef);

  readonly summary = signal<DashboardSummary>({ totalRevenue: 0, outstanding: 0, overdueCount: 0 });
  readonly revenueTrend = signal<RevenueTrendPoint[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    this.load();
  }

  money(value: number): string {
    return (value ?? 0).toFixed(2);
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    forkJoin({
      summary: this.dashboardService.getSummary(),
      trend: this.dashboardService.getRevenueTrend(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ summary, trend }) => {
          this.summary.set(summary);
          this.revenueTrend.set(trend);
          this.loading.set(false);
        },
        error: (err: AppError) => {
          this.error.set(err.message);
          this.loading.set(false);
        },
      });
  }
}
