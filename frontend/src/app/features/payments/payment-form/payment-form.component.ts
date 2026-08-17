// payment-form.component.ts — record a payment against an invoice (Spec §5.4, §7.1).
//
// The invoice selector lists only unpaid/partially-paid invoices (not paid/cancelled). The
// amount is validated against the selected invoice's remaining balance via computed Signals.
// On submit we generate a fresh UUID Idempotency-Key and disable the button while in flight
// so neither a double-click nor a network retry can record a duplicate payment (FR-2.8 NFR).
import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AppError } from '../../../core/models/api.model';
import { Invoice } from '../../invoices/invoice.models';
import { InvoiceService } from '../../invoices/invoice.service';
import { PaymentMethod, PaymentPayload } from '../payment.models';
import { PaymentService } from '../payment.service';

@Component({
  selector: 'app-payment-form',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './payment-form.component.html',
  styleUrl: './payment-form.component.css',
})
export class PaymentFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly paymentService = inject(PaymentService);
  private readonly invoiceService = inject(InvoiceService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly payableInvoices = signal<Invoice[]>([]);

  readonly form = this.fb.nonNullable.group({
    invoiceId: ['', [Validators.required]],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    method: ['card', [Validators.required]],
    transactionRef: [''],
  });

  private readonly invoiceIdValue = toSignal(this.form.controls.invoiceId.valueChanges, {
    initialValue: '',
  });
  private readonly amountValue = toSignal(this.form.controls.amount.valueChanges, {
    initialValue: this.form.controls.amount.value,
  });

  readonly selectedInvoice = computed(() =>
    this.payableInvoices().find((invoice) => invoice._id === this.invoiceIdValue()),
  );
  readonly remainingBalance = computed(() => {
    const invoice = this.selectedInvoice();
    return invoice ? (invoice.amountDue ?? invoice.totalAmount) : 0;
  });
  readonly amountExceedsBalance = computed(() => {
    const invoice = this.selectedInvoice();
    return !!invoice && (Number(this.amountValue()) || 0) > this.remainingBalance();
  });

  constructor() {
    this.loadInvoices();

    // Pre-fill the amount with the remaining balance when an invoice is chosen.
    this.form.controls.invoiceId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      const invoice = this.payableInvoices().find((inv) => inv._id === id);
      this.form.controls.amount.setValue(invoice ? (invoice.amountDue ?? invoice.totalAmount) : 0);
    });
  }

  money(value: number): string {
    return (value ?? 0).toFixed(2);
  }

  submit(): void {
    const invoice = this.selectedInvoice();
    if (this.form.invalid || this.amountExceedsBalance() || !invoice) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    const raw = this.form.getRawValue();
    const payload: PaymentPayload = {
      invoiceId: raw.invoiceId,
      customerId: invoice.customerId,
      amount: Number(raw.amount),
      method: raw.method as PaymentMethod,
      transactionRef: raw.transactionRef || undefined,
    };

    // Fresh idempotency key per submit; the disabled button guards against double-clicks.
    this.paymentService
      .create(payload, crypto.randomUUID())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          void this.router.navigate(['/payments']);
        },
        error: (err: AppError) => {
          this.saving.set(false);
          this.error.set(err.message);
        },
      });
  }

  private loadInvoices(): void {
    this.invoiceService
      .getAll({ page: 1, limit: 100 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          // Only invoices that can still take a payment (exclude fully paid + cancelled).
          this.payableInvoices.set(
            page.items.filter((invoice) => invoice.status !== 'paid' && invoice.status !== 'cancelled'),
          );
        },
        error: (err: AppError) => this.error.set(err.message),
      });
  }
}
