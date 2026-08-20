// payment-list.component.ts — recorded-payments table (same Signal-based list pattern as
// the invoice list). List state is component-local Signals (Spec §7.5 — not NgRx).
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { of, Subject } from 'rxjs';
import { catchError, startWith, switchMap } from 'rxjs';

import { AppError } from '../../../core/models/api.model';
import { AppDatePipe } from '../../../shared/pipes/app-date.pipe';
import { Payment, PaymentStatus } from '../payment.models';
import { PaymentService } from '../payment.service';

const PAGE_SIZE = 20; // Spec §8 default list limit

@Component({
  selector: 'app-payment-list',
  imports: [RouterLink, AppDatePipe],
  templateUrl: './payment-list.component.html',
  styleUrl: './payment-list.component.css',
})
export class PaymentListComponent {
  private readonly paymentService = inject(PaymentService);

  readonly payments = signal<Payment[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly currentPage = signal(1);
  private readonly total = signal(0);

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
          return this.paymentService.getAll({ page: this.currentPage(), limit: this.limit }).pipe(
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
          this.payments.set(result.items);
          this.total.set(result.total);
        } else {
          this.payments.set([]);
        }
      });
  }

  /** Maps a payment status to its badge CSS class (pure function). */
  badgeClass(status: PaymentStatus): string {
    return `badge badge--${status}`;
  }

  money(value: number): string {
    return (value ?? 0).toFixed(2);
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
}
