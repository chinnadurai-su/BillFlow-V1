// dashboard-chart.component.ts — Chart.js revenue-trend visualization (Spec §2).
//
// Presentational: the parent passes the trend data via an input Signal. An effect rebuilds
// the chart whenever the data (or the resolved canvas) changes, destroying the previous
// instance first — so repeated data updates never leak Chart.js instances. The chart is also
// destroyed on teardown.
import { Component, DestroyRef, effect, ElementRef, inject, input, viewChild } from '@angular/core';
import Chart from 'chart.js/auto';

import { RevenueTrendPoint } from '../dashboard.models';

@Component({
  selector: 'app-dashboard-chart',
  imports: [],
  templateUrl: './dashboard-chart.component.html',
  styleUrl: './dashboard-chart.component.css',
})
export class DashboardChartComponent {
  /** Revenue trend points supplied by the parent. */
  readonly data = input<RevenueTrendPoint[]>([]);

  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('revenueChart');
  private chart: Chart | null = null;

  constructor() {
    // Rebuild whenever data or the canvas ref changes.
    effect(() => {
      const points = this.data();
      const canvasEl = this.canvas()?.nativeElement;
      if (!canvasEl) {
        return;
      }
      this.renderChart(canvasEl, points);
    });

    // Prevent leaks: always tear the chart down with the component.
    inject(DestroyRef).onDestroy(() => this.destroyChart());
  }

  private renderChart(canvasEl: HTMLCanvasElement, points: RevenueTrendPoint[]): void {
    // Destroy the previous instance before creating a new one (no orphaned charts).
    this.destroyChart();
    this.chart = new Chart(canvasEl, {
      type: 'line',
      data: {
        labels: points.map((point) => point.label),
        datasets: [
          {
            label: 'Revenue',
            data: points.map((point) => point.revenue),
            borderColor: '#4f46e5',
            backgroundColor: 'rgba(79, 70, 229, 0.12)',
            fill: true,
            tension: 0.3,
            pointRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { callback: (value) => `$${value}` } },
        },
      },
    });
  }

  private destroyChart(): void {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
  }
}
