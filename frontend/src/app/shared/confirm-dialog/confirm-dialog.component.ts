// confirm-dialog.component.ts — reusable confirm/cancel modal for destructive actions.
//
// Used instead of the browser's native confirm() for archiving a customer, cancelling an
// invoice, etc. Presentational: the parent controls visibility (renders it with @if) and
// reacts to the confirm/cancel outputs.
import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-confirm-dialog',
  imports: [],
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.css',
})
export class ConfirmDialogComponent {
  readonly title = input('Please confirm');
  readonly message = input('Are you sure?');
  readonly confirmLabel = input('Confirm');
  readonly cancelLabel = input('Cancel');

  /** Emitted when the user accepts / dismisses the action. */
  readonly confirm = output<void>();
  readonly cancel = output<void>();
}
