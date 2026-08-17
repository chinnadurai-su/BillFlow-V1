// payment.service.ts — Data access for payments (record + list).
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class PaymentService {
  // TODO: implement calls (Spec §6 Payments), extending core/api.service:
  //  - list(params)    -> GET  /api/payments
  //  - get(id)         -> GET  /api/payments/:id
  //  - record(payload) -> POST /api/payments   (send client `Idempotency-Key` header, Spec §7.1)
}
