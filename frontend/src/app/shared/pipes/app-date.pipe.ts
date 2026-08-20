// app-date.pipe.ts — the single app-wide date format for the UI: "20 August 2026".
//
// Centralizing the format here (instead of repeating `| date:'d MMMM y'` in every template)
// keeps date display consistent across invoices, payments, etc. and gives one place to change
// it. Delegates to Angular's formatDate so locale data / edge cases are handled for us.
import { formatDate } from '@angular/common';
import { inject, LOCALE_ID, Pipe, PipeTransform } from '@angular/core';

/** Day (no leading zero), full month name, full year → e.g. "20 August 2026". */
export const APP_DATE_FORMAT = 'd MMMM y';

@Pipe({ name: 'appDate' })
export class AppDatePipe implements PipeTransform {
  private readonly locale = inject(LOCALE_ID);

  transform(value: string | number | Date | null | undefined): string {
    if (value === null || value === undefined || value === '') {
      return '—';
    }
    try {
      return formatDate(value, APP_DATE_FORMAT, this.locale);
    } catch {
      // Unparseable value — show a dash rather than a raw string or "Invalid Date".
      return '—';
    }
  }
}
