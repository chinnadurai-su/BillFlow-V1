// customer.service.ts — Data access for customers (CRUD against the customers API).
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class CustomerService {
  // TODO: implement CRUD calls (Spec §6 Customers), extending core/api.service:
  //  - list(params)      -> GET    /api/customers        (paginated, filterable)
  //  - get(id)           -> GET    /api/customers/:id
  //  - create(payload)   -> POST   /api/customers
  //  - update(id, patch) -> PUT    /api/customers/:id
  //  - remove(id)        -> DELETE /api/customers/:id     (delete/archive)
  //  Consider caching the customer list in NgRx (store/customer.reducer) for reuse.
}
