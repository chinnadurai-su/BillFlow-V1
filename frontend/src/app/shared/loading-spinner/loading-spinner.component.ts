// loading-spinner.component.ts — Reusable loading indicator.
import { Component } from '@angular/core';

@Component({
  selector: 'app-loading-spinner',
  imports: [],
  templateUrl: './loading-spinner.component.html',
  styleUrl: './loading-spinner.component.css',
})
export class LoadingSpinnerComponent {
  // TODO:
  //  - Reusable spinner shown while async work is in flight.
  //  - Optionally accept an input to toggle visibility / size / label.
}
