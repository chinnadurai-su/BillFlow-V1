// payment.models.ts — Payment domain types (Spec §5.4).
import { Paginated } from '../../core/models/api.model';

export type PaymentMethod = 'card' | 'bank_transfer' | 'cash' | 'other';
export type PaymentStatus = 'pending' | 'completed' | 'failed';

export interface Payment {
  _id: string;
  invoiceId: string;
  invoiceNumber?: string; // denormalized for list rows
  customerId: string;
  customerName?: string; // denormalized for list rows
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus; // set server-side
  transactionRef?: string;
  createdAt?: string;
}

/** Client-settable fields for recording a payment (status is assigned by the backend). */
export interface PaymentPayload {
  invoiceId: string;
  customerId: string;
  amount: number;
  method: PaymentMethod;
  transactionRef?: string;
}

export interface PaymentListParams {
  page?: number;
  limit?: number;
  invoiceId?: string;
  customerId?: string;
}

export type PaymentPage = Paginated<Payment>;
