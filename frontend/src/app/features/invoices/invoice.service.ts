// invoice.service.ts — Data access for invoices (CRUD + PDF download + send email).
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class InvoiceService {
  // TODO: implement calls (Spec §6 Invoices), extending core/api.service:
  //  - list(filters)       -> GET    /api/invoices          (filter by status, customer, date range)
  //  - get(id)             -> GET    /api/invoices/:id
  //  - create(payload)     -> POST   /api/invoices          (send client `Idempotency-Key` header, Spec §7.1)
  //  - update(id, patch)   -> PUT    /api/invoices/:id
  //  - cancel(id)          -> DELETE /api/invoices/:id
  //  - downloadPdf(id)     -> GET    /api/invoices/:id/pdf   (blob)
  //  - send(id)            -> POST   /api/invoices/:id/send
}
