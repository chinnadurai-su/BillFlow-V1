import { TestBed } from '@angular/core/testing';
import { LOCALE_ID } from '@angular/core';

import { AppDatePipe } from './app-date.pipe';

describe('AppDatePipe', () => {
  let pipe: AppDatePipe;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AppDatePipe, { provide: LOCALE_ID, useValue: 'en-US' }],
    });
    pipe = TestBed.inject(AppDatePipe);
  });

  it('formats an ISO string as "d MMMM y"', () => {
    expect(pipe.transform('2026-08-20T10:44:09.122Z')).toBe('20 August 2026');
  });

  it('formats a date-only string', () => {
    expect(pipe.transform('2026-09-01')).toBe('1 September 2026');
  });

  it('formats a Date object', () => {
    expect(pipe.transform(new Date(2026, 0, 5))).toBe('5 January 2026');
  });

  it('renders a dash for empty / missing values', () => {
    expect(pipe.transform(null)).toBe('—');
    expect(pipe.transform(undefined)).toBe('—');
    expect(pipe.transform('')).toBe('—');
  });

  it('renders a dash for an unparseable value', () => {
    expect(pipe.transform('not-a-date')).toBe('—');
  });
});
