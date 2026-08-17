// invoice-list.component.ts — filterable, paginated invoice table.
//
// List state stays as component-local Signals (Spec §7.5 — not NgRx). Status/date-range
// filters are Signals; changing any of them resets to page 1 and refetches through a single
// switchMap pipeline (a newer request cancels a stale one).
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { of, Subject } from 'rxjs';
import { catchError, startWith, switchMap } from 'rxjs';

import { AppError } from '../../../core/models/api.model';
import { Invoice, InvoiceStatus } from '../invoice.models';
import { InvoiceService } from '../invoice.service';

const PAGE_SIZE = 20; // Spec §8 default list limit

@Component({
  selector: 'app-invoice-list',
  imports: [RouterLink],
  templateUrl: './invoice-list.component.html',
  styleUrl: './invoice-list.component.css',
})
export class InvoiceListComponent {
  private readonly invoiceService = inject(InvoiceService);

  readonly invoices = signal<Invoice[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly currentPage = signal(1);
  private readonly total = signal(0);

  // Filters (Spec §6: filter by status + date range).
  readonly statusFilter = signal<InvoiceStatus | ''>('');
  readonly fromDate = signal('');
  readonly toDate = signal('');

  readonly limit = PAGE_SIZE;
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.limit)));
  readonly hasNextPage = computed(() => this.currentPage() < this.totalPages());
  readonly hasPrevPage = computed(() => this.currentPage() > 1);

  private readonly reload$ = new Subject<void>();

  constructor() {
    this.reload$
      .pipe(
        startWith(void 0), // initial load
        switchMap(() => {
          this.loading.set(true);
          this.error.set(null);
          return this.invoiceService
            .getAll({
              page: this.currentPage(),
              limit: this.limit,
              status: this.statusFilter() || undefined,
              fromDate: this.fromDate() || undefined,
              toDate: this.toDate() || undefined,
            })
            .pipe(
              catchError((err: AppError) => {
                this.error.set(err.message);
                return of(null);
              }),
            );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((result) => {
        this.loading.set(false);
        if (result) {
          this.invoices.set(result.items);
          this.total.set(result.total);
        } else {
          this.invoices.set([]);
        }
      });
  }

  /** Maps an invoice status to its badge CSS class (pure function). */
  badgeClass(status: InvoiceStatus): string {
    return `badge badge--${status}`;
  }

  money(value: number): string {
    return (value ?? 0).toFixed(2);
  }

  onStatusChange(event: Event): void {
    this.statusFilter.set((event.target as HTMLSelectElement).value as InvoiceStatus | '');
    this.resetAndReload();
  }

  onFromChange(event: Event): void {
    this.fromDate.set((event.target as HTMLInputElement).value);
    this.resetAndReload();
  }

  onToChange(event: Event): void {
    this.toDate.set((event.target as HTMLInputElement).value);
    this.resetAndReload();
  }

  nextPage(): void {
    if (this.hasNextPage()) {
      this.currentPage.set(this.currentPage() + 1);
      this.reload$.next();
    }
  }

  prevPage(): void {
    if (this.hasPrevPage()) {
      this.currentPage.set(this.currentPage() - 1);
      this.reload$.next();
    }
  }

  private resetAndReload(): void {
    this.currentPage.set(1);
    this.reload$.next();
  }
}
