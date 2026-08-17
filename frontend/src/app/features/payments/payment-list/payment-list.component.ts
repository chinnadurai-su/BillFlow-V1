// payment-list.component.ts — List of recorded payments.
import { Component } from '@angular/core';

@Component({
  selector: 'app-payment-list',
  imports: [],
  templateUrl: './payment-list.component.html',
  styleUrl: './payment-list.component.css',
})
export class PaymentListComponent {
  // TODO:
  //  - Load via PaymentService -> GET /api/payments (Spec §6 Payments).
  //  - Columns: invoice, customer, amount, method, status, createdAt (Spec §5.4).
  //  - Row action: view payment detail.
}
