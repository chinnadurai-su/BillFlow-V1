// customer-list.component.ts — Paginated, filterable list of customers.
import { Component } from '@angular/core';

@Component({
  selector: 'app-customer-list',
  imports: [],
  templateUrl: './customer-list.component.html',
  styleUrl: './customer-list.component.css',
})
export class CustomerListComponent {
  // TODO:
  //  - Load a paginated list via CustomerService -> GET /api/customers (default limit 20, Spec §6/§8).
  //  - Support filtering/search; show name, email, phone, balance columns (Spec §5.2).
  //  - Row actions: view, edit (-> customer-form), delete/archive.
}
