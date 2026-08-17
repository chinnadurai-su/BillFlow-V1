// invoice-detail.component.ts — Read-only view of a single invoice with PDF download + send actions.
import { Component } from '@angular/core';

@Component({
  selector: 'app-invoice-detail',
  imports: [],
  templateUrl: './invoice-detail.component.html',
  styleUrl: './invoice-detail.component.css',
})
export class InvoiceDetailComponent {
  // TODO:
  //  - Load one invoice via InvoiceService -> GET /api/invoices/:id (Spec §6).
  //  - Render line items, subtotal, tax, totalAmount, status, dueDate (Spec §5.3).
  //  - "Download PDF" button    -> GET  /api/invoices/:id/pdf.
  //  - "Send to customer" button -> POST /api/invoices/:id/send.
}
