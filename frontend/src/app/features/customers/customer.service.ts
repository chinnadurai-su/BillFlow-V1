// customer.service.ts — Data access for customers (CRUD against /api/customers, Spec §6).
//
// Thin wrapper over ApiService: every method returns the unwrapped payload and any HTTP
// failure already arrives as a normalized AppError (Spec §8, item 9), so components just
// read `.message`. Customer-list state stays as component-local Signals — deliberately NOT
// NgRx (Spec §7.5 / CLAUDE.md rules).
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from '../../core/api.service';
import { Paginated } from '../../core/models/api.model';
import { Customer, CustomerListParams, CustomerPayload } from './customer.models';

@Injectable({ providedIn: 'root' })
export class CustomerService {
  private readonly api = inject(ApiService);

  /** GET /api/customers — paginated, filterable list. */
  getAll(params: CustomerListParams = {}): Observable<Paginated<Customer>> {
    return this.api.getPaginated<Customer>('/customers', {
      params: { page: params.page, limit: params.limit, search: params.search },
    });
  }

  /** GET /api/customers/:id */
  getById(id: string): Observable<Customer> {
    return this.api.get<Customer>(`/customers/${id}`);
  }

  /** POST /api/customers */
  create(payload: CustomerPayload): Observable<Customer> {
    return this.api.post<Customer>('/customers', payload);
  }

  /** PUT /api/customers/:id */
  update(id: string, payload: CustomerPayload): Observable<Customer> {
    return this.api.put<Customer>(`/customers/${id}`, payload);
  }

  /** DELETE /api/customers/:id — archive/soft-delete. */
  archive(id: string): Observable<void> {
    return this.api.delete<void>(`/customers/${id}`);
  }
}
