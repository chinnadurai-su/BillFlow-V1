// invoice-list.component.ts — List of invoices, filterable by status, customer, and date range.
import { Component } from '@angular/core';

@Component({
  selector: 'app-invoice-list',
  imports: [],
  templateUrl: './invoice-list.component.html',
  styleUrl: './invoice-list.component.css',
})
export class InvoiceListComponent {
  // TODO:
  //  - Load via InvoiceService -> GET /api/invoices with filters: status, customer, date range (Spec §6).
  //  - Columns: invoiceNumber, customer, totalAmount, status, dueDate (Spec §5.3).
  //  - Row actions: view detail, edit, cancel.
}
