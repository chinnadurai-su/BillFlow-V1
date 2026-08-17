// invoice.service.ts — Data access for invoices (CRUD + PDF + send email, Spec §6).
//
// create() attaches a client-generated UUID `Idempotency-Key` header (Spec §7.1 / FR-2.8)
// so a network retry or double-submit can't create a duplicate invoice. Callers may pass
// their own key (the form generates a fresh one per submit); otherwise one is generated
// here so the endpoint is always protected.
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { ApiService } from '../../core/api.service';
import { Paginated } from '../../core/models/api.model';
import { Invoice, InvoiceListParams, InvoicePayload } from './invoice.models';

@Injectable({ providedIn: 'root' })
export class InvoiceService {
  private readonly api = inject(ApiService);

  /** GET /api/invoices — filter by status, customer and date range. */
  getAll(params: InvoiceListParams = {}): Observable<Paginated<Invoice>> {
    return this.api.get<Paginated<Invoice>>('/invoices', {
      params: {
        page: params.page,
        limit: params.limit,
        status: params.status,
        customerId: params.customerId,
        fromDate: params.fromDate,
        toDate: params.toDate,
      },
    });
  }

  /** GET /api/invoices/:id */
  getById(id: string): Observable<Invoice> {
    return this.api.get<Invoice>(`/invoices/${id}`);
  }

  /** POST /api/invoices — requires an Idempotency-Key header (Spec §7.1). */
  create(payload: InvoicePayload, idempotencyKey: string = crypto.randomUUID()): Observable<Invoice> {
    return this.api.post<Invoice>('/invoices', payload, {
      headers: { 'Idempotency-Key': idempotencyKey },
    });
  }

  /** PUT /api/invoices/:id */
  update(id: string, payload: InvoicePayload): Observable<Invoice> {
    return this.api.put<Invoice>(`/invoices/${id}`, payload);
  }

  /** DELETE /api/invoices/:id — cancel (soft state change; BR-1). */
  cancel(id: string): Observable<void> {
    return this.api.delete<void>(`/invoices/${id}`);
  }

  /** GET /api/invoices/:id/pdf — binary PDF for browser download (FR-2.6). */
  downloadPdf(id: string): Observable<Blob> {
    return this.api.getBlob(`/invoices/${id}/pdf`);
  }

  /** POST /api/invoices/:id/send — email the invoice to the customer (FR-2.7). */
  sendEmail(id: string): Observable<void> {
    return this.api.post<unknown>(`/invoices/${id}/send`, {}).pipe(map(() => undefined));
  }
}
