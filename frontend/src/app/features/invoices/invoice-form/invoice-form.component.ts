// invoice-form.component.ts — Create/edit form for an invoice, including line items.
import { Component } from '@angular/core';

@Component({
  selector: 'app-invoice-form',
  imports: [],
  templateUrl: './invoice-form.component.html',
  styleUrl: './invoice-form.component.css',
})
export class InvoiceFormComponent {
  // TODO:
  //  - Reactive form matching the Invoice schema (Spec §5.3):
  //      customerId (required), items[] { description, quantity, unitPrice, total },
  //      tax, dueDate, isRecurring, recurringCycle (monthly|quarterly|yearly).
  //  - Compute item.total, subtotal, totalAmount locally with Signals (Spec §7.5).
  //  - Create -> POST /api/invoices with a client-generated `Idempotency-Key` header (Spec §7.1).
  //  - Edit   -> PUT /api/invoices/:id. invoiceNumber is server-generated.
}
