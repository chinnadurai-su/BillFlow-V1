// loading-spinner.component.ts — reusable loading indicator.
//
// Purely presentational: shows a CSS spinner with an optional caption.
import { Component, input } from '@angular/core';

@Component({
  selector: 'app-loading-spinner',
  imports: [],
  templateUrl: './loading-spinner.component.html',
  styleUrl: './loading-spinner.component.css',
})
export class LoadingSpinnerComponent {
  /** Optional caption shown under the spinner. */
  readonly message = input('Loading…');
}
