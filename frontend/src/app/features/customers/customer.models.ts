// customer.models.ts — Customer domain types (Spec §5.2).
import { Paginated } from '../../core/models/api.model';

export interface BillingAddress {
  line1?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

export interface Customer {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  billingAddress?: BillingAddress;
  balance: number; // running outstanding balance — server-managed
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Client-settable fields for create/update. `balance`, `createdBy` and timestamps are
 * managed by the backend and intentionally excluded.
 */
export interface CustomerPayload {
  name: string;
  email: string;
  phone?: string;
  billingAddress?: BillingAddress;
}

/** Query params for the paginated/filterable list endpoint. */
export interface CustomerListParams {
  page?: number;
  limit?: number;
  search?: string;
}

export type CustomerPage = Paginated<Customer>;
