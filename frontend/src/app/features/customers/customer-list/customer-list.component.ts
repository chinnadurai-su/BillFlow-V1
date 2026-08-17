// customer-list.component.ts — paginated, searchable customer table.
//
// All list state is component-local Signals (Spec §7.5: list state is NOT shared, so no
// NgRx). Fetching flows through a single switchMap pipeline so a newer request cancels a
// stale one. Search is debounced and resets to page 1. Archiving is confirmed through the
// shared confirm-dialog (never the browser's native confirm()).
import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { of, Subject } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, map, skip, startWith, switchMap } from 'rxjs';

import { AppError } from '../../../core/models/api.model';
import { ConfirmDialogComponent } from '../../../shared/confirm-dialog/confirm-dialog.component';
import { Customer } from '../customer.models';
import { CustomerService } from '../customer.service';

const PAGE_SIZE = 20; // Spec §8 default list limit
const SEARCH_DEBOUNCE_MS = 300;

@Component({
  selector: 'app-customer-list',
  imports: [RouterLink, ConfirmDialogComponent],
  templateUrl: './customer-list.component.html',
  styleUrl: './customer-list.component.css',
})
export class CustomerListComponent {
  private readonly customerService = inject(CustomerService);
  private readonly destroyRef = inject(DestroyRef);

  readonly customers = signal<Customer[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly currentPage = signal(1);
  readonly search = signal('');
  private readonly total = signal(0);

  readonly limit = PAGE_SIZE;
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.limit)));
  readonly hasNextPage = computed(() => this.currentPage() < this.totalPages());
  readonly hasPrevPage = computed(() => this.currentPage() > 1);

  // Customer awaiting archive confirmation (drives the shared confirm-dialog).
  readonly pendingDelete = signal<Customer | null>(null);

  private readonly reload$ = new Subject<void>();

  constructor() {
    // Debounced search: reset to the first page and reload.
    toObservable(this.search)
      .pipe(
        skip(1), // ignore the initial emission; startWith below handles the first load
        debounceTime(SEARCH_DEBOUNCE_MS),
        map((term) => term.trim()),
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.currentPage.set(1);
        this.reload$.next();
      });

    // Single fetch pipeline; switchMap cancels an in-flight request when a newer one starts.
    this.reload$
      .pipe(
        startWith(void 0), // initial load
        switchMap(() => {
          this.loading.set(true);
          this.error.set(null);
          this.pendingDelete.set(null);
          return this.customerService
            .getAll({
              page: this.currentPage(),
              limit: this.limit,
              search: this.search().trim() || undefined,
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
          this.customers.set(result.items);
          this.total.set(result.total);
        } else {
          this.customers.set([]);
        }
      });
  }

  onSearchInput(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages() || page === this.currentPage()) {
      return;
    }
    this.currentPage.set(page);
    this.reload$.next();
  }

  nextPage(): void {
    if (this.hasNextPage()) {
      this.goToPage(this.currentPage() + 1);
    }
  }

  prevPage(): void {
    if (this.hasPrevPage()) {
      this.goToPage(this.currentPage() - 1);
    }
  }

  // --- archive with confirm-dialog ---
  requestDelete(customer: Customer): void {
    this.pendingDelete.set(customer);
  }

  cancelDelete(): void {
    this.pendingDelete.set(null);
  }

  confirmDelete(customer: Customer): void {
    this.error.set(null);
    this.customerService
      .archive(customer._id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.pendingDelete.set(null);
          // If we just removed the only row on a page past the first, step back a page.
          if (this.customers().length === 1 && this.currentPage() > 1) {
            this.currentPage.set(this.currentPage() - 1);
          }
          this.reload$.next();
        },
        error: (err: AppError) => this.error.set(err.message),
      });
  }
}
