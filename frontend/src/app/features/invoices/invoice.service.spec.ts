import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { Invoice, InvoicePayload } from './invoice.models';
import { InvoiceService } from './invoice.service';

const base = environment.apiUrl;

const invoice: Invoice = {
  _id: 'inv1',
  invoiceNumber: 'INV-2026-0001',
  customerId: 'c1',
  items: [{ description: 'Work', quantity: 1, unitPrice: 100, total: 100 }],
  subtotal: 100,
  tax: 10,
  totalAmount: 110,
  status: 'draft',
  isRecurring: false,
};

const payload: InvoicePayload = {
  customerId: 'c1',
  items: [{ description: 'Work', quantity: 1, unitPrice: 100 }],
  tax: 10,
  isRecurring: false,
  recurringCycle: null,
};

describe('InvoiceService', () => {
  let service: InvoiceService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(InvoiceService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getAll forwards status, customer and date-range filters', () => {
    service
      .getAll({
        page: 1,
        limit: 20,
        status: 'paid',
        customerId: 'c1',
        fromDate: '2026-01-01',
        toDate: '2026-02-01',
      })
      .subscribe();

    const req = httpMock.expectOne((r) => r.url === `${base}/invoices`);
    expect(req.request.params.get('status')).toBe('paid');
    expect(req.request.params.get('customerId')).toBe('c1');
    expect(req.request.params.get('fromDate')).toBe('2026-01-01');
    expect(req.request.params.get('toDate')).toBe('2026-02-01');
    req.flush({
      success: true,
      items: [invoice],
      pagination: { page: 1, limit: 20, total: 1, pageCount: 1, hasNextPage: false },
    });
  });

  it('create attaches a generated Idempotency-Key header', () => {
    service.create(payload).subscribe();

    const req = httpMock.expectOne(`${base}/invoices`);
    expect(req.request.method).toBe('POST');
    const key = req.request.headers.get('Idempotency-Key');
    expect(key).toBeTruthy();
    expect((key ?? '').length).toBeGreaterThan(0);
    expect(req.request.body).toEqual(payload);
    req.flush({ success: true, data: invoice });
  });

  it('create uses a caller-supplied Idempotency-Key when provided', () => {
    service.create(payload, 'key-abc').subscribe();

    const req = httpMock.expectOne(`${base}/invoices`);
    expect(req.request.headers.get('Idempotency-Key')).toBe('key-abc');
    req.flush({ success: true, data: invoice });
  });

  it('update PUTs to the invoice id', () => {
    service.update('inv1', payload).subscribe();
    const req = httpMock.expectOne(`${base}/invoices/inv1`);
    expect(req.request.method).toBe('PUT');
    req.flush({ success: true, data: invoice });
  });

  it('cancel DELETEs the invoice', () => {
    service.cancel('inv1').subscribe();
    const req = httpMock.expectOne(`${base}/invoices/inv1`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ success: true, data: null });
  });

  it('downloadPdf requests a blob', () => {
    let result: Blob | undefined;
    service.downloadPdf('inv1').subscribe((b) => (result = b));

    const req = httpMock.expectOne(`${base}/invoices/inv1/pdf`);
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['%PDF'], { type: 'application/pdf' }));
    expect(result instanceof Blob).toBeTrue();
  });

  it('sendEmail POSTs to the send endpoint', () => {
    let completed = false;
    service.sendEmail('inv1').subscribe({ complete: () => (completed = true) });

    const req = httpMock.expectOne(`${base}/invoices/inv1/send`);
    expect(req.request.method).toBe('POST');
    req.flush({ success: true, message: 'Invoice sent' });
    expect(completed).toBeTrue();
  });
});
