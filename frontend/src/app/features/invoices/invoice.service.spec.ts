import { TestBed } from '@angular/core/testing';

import { InvoiceService } from './invoice.service';

describe('InvoiceService', () => {
  let service: InvoiceService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(InvoiceService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // TODO: add tests for CRUD + PDF download + send against /api/invoices (Spec §6)
});
