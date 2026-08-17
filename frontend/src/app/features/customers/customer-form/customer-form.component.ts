// customer-form.component.ts — Create/edit form for a customer.
import { Component } from '@angular/core';

@Component({
  selector: 'app-customer-form',
  imports: [],
  templateUrl: './customer-form.component.html',
  styleUrl: './customer-form.component.css',
})
export class CustomerFormComponent {
  // TODO:
  //  - Reactive form matching the Customer schema (Spec §5.2):
  //      name (required), email (required), phone,
  //      billingAddress { line1, city, state, zip, country }.
  //  - Create -> POST /api/customers; Edit -> PUT /api/customers/:id (Spec §6).
  //  - balance is server-managed (do not edit directly).
}
