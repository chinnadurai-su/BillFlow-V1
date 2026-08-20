// invoice-form.component.ts — create/edit invoice with line items (Spec §5.3, FR-2.x).
//
// Line items are a reactive FormArray. subtotal/tax/total are computed Signals derived from
// the form's value changes — live UI feedback only; the backend recomputes and stays the
// source of truth (FR-2.2). On submit we generate a fresh UUID Idempotency-Key (Spec §7.1)
// and disable the button while in flight, so neither a double-click nor a network retry can
// create a duplicate invoice (FR-2.8).
import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AppError } from '../../../core/models/api.model';
import { Customer } from '../../customers/customer.models';
import { CustomerService } from '../../customers/customer.service';
import { Invoice, InvoicePayload, RecurringCycle } from '../invoice.models';
import { InvoiceService } from '../invoice.service';

@Component({
  selector: 'app-invoice-form',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './invoice-form.component.html',
  styleUrl: './invoice-form.component.css',
})
export class InvoiceFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly invoiceService = inject(InvoiceService);
  private readonly customerService = inject(CustomerService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  private readonly invoiceId = this.route.snapshot.paramMap.get('id');
  readonly isEdit = this.invoiceId !== null;

  readonly loading = signal(false); // fetching existing invoice / customers
  readonly saving = signal(false); // create/update in flight
  readonly error = signal<string | null>(null);
  readonly customers = signal<Customer[]>([]);

  readonly form = this.fb.nonNullable.group({
    customerId: ['', [Validators.required]],
    dueDate: ['', [Validators.required]],
    isRecurring: [false],
    recurringCycle: [''],
    taxRate: [0, [Validators.min(0)]],
    items: this.fb.array([this.createItemGroup()]),
  });

  // Signals mirroring form values, so subtotal/tax/total recompute live.
  private readonly itemsValue = toSignal(this.items.valueChanges, {
    initialValue: this.items.getRawValue(),
  });
  private readonly taxRateValue = toSignal(this.form.controls.taxRate.valueChanges, {
    initialValue: this.form.controls.taxRate.value,
  });
  readonly isRecurring = toSignal(this.form.controls.isRecurring.valueChanges, {
    initialValue: this.form.controls.isRecurring.value,
  });

  readonly subtotal = computed(() =>
    this.round2(
      this.itemsValue().reduce(
        (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
        0,
      ),
    ),
  );
  readonly taxAmount = computed(() =>
    this.round2((this.subtotal() * (Number(this.taxRateValue()) || 0)) / 100),
  );
  readonly totalAmount = computed(() => this.round2(this.subtotal() + this.taxAmount()));

  get items() {
    return this.form.controls.items;
  }

  constructor() {
    // Recurring cycle is required only when the invoice is marked recurring.
    this.form.controls.isRecurring.valueChanges.pipe(takeUntilDestroyed()).subscribe((on) => {
      const cycle = this.form.controls.recurringCycle;
      if (on) {
        cycle.setValidators([Validators.required]);
      } else {
        cycle.clearValidators();
        cycle.setValue('');
      }
      cycle.updateValueAndValidity();
    });

    this.loadCustomers();
    if (this.invoiceId) {
      this.loadInvoice(this.invoiceId);
    }
  }

  lineTotal(index: number): number {
    const item = this.itemsValue()[index];
    return item ? (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0) : 0;
  }

  money(value: number): string {
    return (value ?? 0).toFixed(2);
  }

  addItem(): void {
    this.items.push(this.createItemGroup());
  }

  removeItem(index: number): void {
    // Always keep at least one line item.
    if (this.items.length > 1) {
      this.items.removeAt(index);
    }
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    const raw = this.form.getRawValue();
    const payload: InvoicePayload = {
      customerId: raw.customerId,
      items: raw.items.map((item) => ({
        description: item.description,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
      })),
      tax: this.taxAmount(),
      dueDate: raw.dueDate || undefined,
      isRecurring: raw.isRecurring,
      recurringCycle: raw.isRecurring ? (raw.recurringCycle as RecurringCycle) : null,
    };

    // A fresh idempotency key per submit; the disabled button guards against double-clicks.
    const request$ = this.invoiceId
      ? this.invoiceService.update(this.invoiceId, payload)
      : this.invoiceService.create(payload, crypto.randomUUID());

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (invoice) => {
        this.saving.set(false);
        void this.router.navigate(['/invoices', invoice._id]);
      },
      error: (err: AppError) => {
        this.saving.set(false);
        this.error.set(err.message);
      },
    });
  }

  private createItemGroup(item?: { description?: string; quantity?: number; unitPrice?: number }) {
    return this.fb.nonNullable.group({
      description: [item?.description ?? '', [Validators.required]],
      quantity: [item?.quantity ?? 1, [Validators.required, Validators.min(1)]],
      unitPrice: [item?.unitPrice ?? 0, [Validators.required, Validators.min(0)]],
    });
  }

  private loadCustomers(): void {
    // Load a generous page for the selector (Spec §6 default limit is 20; bump for the dropdown).
    this.customerService
      .getAll({ page: 1, limit: 100 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => this.customers.set(page.items),
        error: (err: AppError) => this.error.set(err.message),
      });
  }

  private loadInvoice(id: string): void {
    this.loading.set(true);
    this.invoiceService
      .getById(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (invoice) => {
          this.patchForm(invoice);
          this.loading.set(false);
        },
        error: (err: AppError) => {
          this.error.set(err.message);
          this.loading.set(false);
        },
      });
  }

  private patchForm(invoice: Invoice): void {
    // Rebuild the line-item array from the loaded invoice.
    this.items.clear();
    for (const item of invoice.items) {
      this.items.push(this.createItemGroup(item));
    }
    if (this.items.length === 0) {
      this.items.push(this.createItemGroup());
    }

    // Back-compute the tax rate from stored amounts (the model stores tax as an amount).
    const rate = invoice.subtotal > 0 ? this.round2((invoice.tax / invoice.subtotal) * 100) : 0;

    this.form.patchValue({
      customerId: invoice.customerId,
      dueDate: invoice.dueDate ? invoice.dueDate.substring(0, 10) : '',
      isRecurring: invoice.isRecurring,
      recurringCycle: invoice.recurringCycle ?? '',
      taxRate: rate,
    });
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
