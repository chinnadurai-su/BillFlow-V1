// payment.service.ts — Data access for payments (list + record, Spec §6 Payments).
//
// create() attaches a client-generated UUID `Idempotency-Key` header (Spec §7.1 / FR-2.8 /
// duplicate-prevention NFR) so a retry or double-submit can't record a duplicate payment.
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from '../../core/api.service';
import { Paginated } from '../../core/models/api.model';
import { Payment, PaymentListParams, PaymentPayload } from './payment.models';

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private readonly api = inject(ApiService);

  /** GET /api/payments — paginated list. */
  getAll(params: PaymentListParams = {}): Observable<Paginated<Payment>> {
    return this.api.getPaginated<Payment>('/payments', {
      params: {
        page: params.page,
        limit: params.limit,
        invoiceId: params.invoiceId,
        customerId: params.customerId,
      },
    });
  }

  /** POST /api/payments — requires an Idempotency-Key header (Spec §7.1). */
  create(payload: PaymentPayload, idempotencyKey: string = crypto.randomUUID()): Observable<Payment> {
    return this.api.post<Payment>('/payments', payload, {
      headers: { 'Idempotency-Key': idempotencyKey },
    });
  }
}
