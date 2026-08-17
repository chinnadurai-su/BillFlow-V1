// payment-form.component.ts — Form to record a payment against an invoice.
import { Component } from '@angular/core';

@Component({
  selector: 'app-payment-form',
  imports: [],
  templateUrl: './payment-form.component.html',
  styleUrl: './payment-form.component.css',
})
export class PaymentFormComponent {
  // TODO:
  //  - Reactive form matching the Payment schema (Spec §5.4):
  //      invoiceId (required), customerId (required), amount (required),
  //      method (card|bank_transfer|cash|other), transactionRef.
  //  - Submit -> POST /api/payments with a client-generated `Idempotency-Key` header (Spec §7.1).
  //  - status is set server-side (pending|completed|failed).
}
