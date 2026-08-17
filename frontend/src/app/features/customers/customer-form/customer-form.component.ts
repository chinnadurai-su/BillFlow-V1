// customer-form.component.ts — create/edit form for a customer (Spec §5.2, §6).
//
// One component serves both modes: an `:id` route param switches it to edit, pre-filling
// from getById(). `balance` is server-managed and never edited here.
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AppError } from '../../../core/models/api.model';
import { CustomerService } from '../customer.service';

@Component({
  selector: 'app-customer-form',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './customer-form.component.html',
  styleUrl: './customer-form.component.css',
})
export class CustomerFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly customerService = inject(CustomerService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  private readonly customerId = this.route.snapshot.paramMap.get('id');
  readonly isEdit = this.customerId !== null;

  readonly loading = signal(false); // fetching the existing customer (edit mode)
  readonly saving = signal(false); // create/update request in flight
  readonly error = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    phone: [''],
    billingAddress: this.fb.nonNullable.group({
      line1: [''],
      city: [''],
      state: [''],
      zip: [''],
      country: [''],
    }),
  });

  constructor() {
    if (this.customerId) {
      this.loadCustomer(this.customerId);
    }
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    const payload = this.form.getRawValue();

    const request$ = this.customerId
      ? this.customerService.update(this.customerId, payload)
      : this.customerService.create(payload);

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.saving.set(false);
        void this.router.navigate(['/customers']);
      },
      error: (err: AppError) => {
        this.saving.set(false);
        this.error.set(err.message);
      },
    });
  }

  private loadCustomer(id: string): void {
    this.loading.set(true);
    this.customerService
      .getById(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (customer) => {
          this.form.patchValue({
            name: customer.name,
            email: customer.email,
            phone: customer.phone ?? '',
            billingAddress: {
              line1: customer.billingAddress?.line1 ?? '',
              city: customer.billingAddress?.city ?? '',
              state: customer.billingAddress?.state ?? '',
              zip: customer.billingAddress?.zip ?? '',
              country: customer.billingAddress?.country ?? '',
            },
          });
          this.loading.set(false);
        },
        error: (err: AppError) => {
          this.error.set(err.message);
          this.loading.set(false);
        },
      });
  }
}
