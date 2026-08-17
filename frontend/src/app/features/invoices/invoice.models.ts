// invoice.models.ts — Invoice domain types (Spec §5.3, FR-2.x).
import { Paginated } from '../../core/models/api.model';
import { Customer } from '../customers/customer.models';

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
export type RecurringCycle = 'monthly' | 'quarterly' | 'yearly';

export interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number; // quantity * unitPrice, computed server-side at creation
}

export interface Invoice {
  _id: string;
  invoiceNumber: string;
  customerId: string;
  customerName?: string; // denormalized for list rows
  customer?: Customer; // populated on the detail endpoint
  items: InvoiceItem[];
  subtotal: number;
  tax: number;
  totalAmount: number;
  amountDue?: number; // remaining balance (total minus payments); server-provided when available
  status: InvoiceStatus;
  dueDate?: string;
  isRecurring: boolean;
  recurringCycle?: RecurringCycle | null;
  pdfUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** A single line item as sent to the API (server computes each row's `total`). */
export interface InvoiceItemInput {
  description: string;
  quantity: number;
  unitPrice: number;
}

/**
 * Create/update payload. We send the computed `tax` amount for convenience, but the
 * backend recomputes subtotal/tax/total from the line items and remains the source of
 * truth (FR-2.2). subtotal/totalAmount are intentionally not sent.
 */
export interface InvoicePayload {
  customerId: string;
  items: InvoiceItemInput[];
  tax: number;
  dueDate?: string;
  isRecurring: boolean;
  recurringCycle?: RecurringCycle | null;
}

export interface InvoiceListParams {
  page?: number;
  limit?: number;
  status?: InvoiceStatus;
  customerId?: string;
  fromDate?: string; // ISO date (yyyy-mm-dd)
  toDate?: string;
}

export type InvoicePage = Paginated<Invoice>;
