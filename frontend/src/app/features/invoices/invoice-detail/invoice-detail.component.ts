// invoice-detail.component.ts — read-only invoice view with PDF download, email, and cancel.
//
// Loads one invoice by route id. "Download PDF" fetches the binary and triggers a browser
// download; "Send Email" posts to the send endpoint; "Cancel invoice" is a destructive
// action confirmed through the shared confirm-dialog (never native confirm()).
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { AppError } from '../../../core/models/api.model';
import { ConfirmDialogComponent } from '../../../shared/confirm-dialog/confirm-dialog.component';
import { LoadingSpinnerComponent } from '../../../shared/loading-spinner/loading-spinner.component';
import { AppDatePipe } from '../../../shared/pipes/app-date.pipe';
import { Invoice } from '../invoice.models';
import { InvoiceService } from '../invoice.service';

@Component({
  selector: 'app-invoice-detail',
  imports: [RouterLink, ConfirmDialogComponent, LoadingSpinnerComponent, AppDatePipe],
  templateUrl: './invoice-detail.component.html',
  styleUrl: './invoice-detail.component.css',
})
export class InvoiceDetailComponent {
  private readonly invoiceService = inject(InvoiceService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  private readonly invoiceId = this.route.snapshot.paramMap.get('id') ?? '';

  readonly invoice = signal<Invoice | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly sending = signal(false);
  readonly toastMessage = signal<string | null>(null);
  readonly confirmingCancel = signal(false);

  constructor() {
    if (this.invoiceId) {
      this.loadInvoice();
    } else {
      this.error.set('No invoice specified.');
    }
  }

  money(value: number): string {
    return (value ?? 0).toFixed(2);
  }

  downloadPdf(): void {
    const invoice = this.invoice();
    if (!invoice) {
      return;
    }
    this.toastMessage.set(null);
    this.invoiceService
      .downloadPdf(this.invoiceId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => this.saveBlob(blob, `${invoice.invoiceNumber || 'invoice'}.pdf`),
        error: (err: AppError) => this.error.set(err.message),
      });
  }

  sendEmail(): void {
    if (!this.invoice()) {
      return;
    }
    this.sending.set(true);
    this.error.set(null);
    this.toastMessage.set(null);
    this.invoiceService
      .sendEmail(this.invoiceId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.sending.set(false);
          this.toastMessage.set('Invoice emailed to the customer.');
        },
        error: (err: AppError) => {
          this.sending.set(false);
          this.error.set(err.message);
        },
      });
  }

  // --- cancel invoice (confirm-dialog) ---
  requestCancel(): void {
    this.confirmingCancel.set(true);
  }

  dismissCancel(): void {
    this.confirmingCancel.set(false);
  }

  confirmCancel(): void {
    this.confirmingCancel.set(false);
    if (!this.invoice()) {
      return;
    }
    this.error.set(null);
    this.toastMessage.set(null);
    this.invoiceService
      .cancel(this.invoiceId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toastMessage.set('Invoice cancelled.');
          this.loadInvoice(); // refresh so the status badge reflects the cancellation
        },
        error: (err: AppError) => this.error.set(err.message),
      });
  }

  private loadInvoice(): void {
    this.loading.set(true);
    this.error.set(null);
    this.invoiceService
      .getById(this.invoiceId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (invoice) => {
          this.invoice.set(invoice);
          this.loading.set(false);
        },
        error: (err: AppError) => {
          this.error.set(err.message);
          this.loading.set(false);
        },
      });
  }

  /** Turn a Blob into a browser file download. */
  private saveBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
