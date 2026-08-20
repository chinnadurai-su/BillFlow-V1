import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { Payment, PaymentPayload } from './payment.models';
import { PaymentService } from './payment.service';

const base = environment.apiUrl;

const payment: Payment = {
  _id: 'p1',
  invoiceId: 'inv1',
  customerId: 'c1',
  amount: 50,
  method: 'card',
  status: 'completed',
};

const payload: PaymentPayload = {
  invoiceId: 'inv1',
  customerId: 'c1',
  amount: 50,
  method: 'card',
};

describe('PaymentService', () => {
  let service: PaymentService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PaymentService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getAll forwards pagination + filter params and returns the page', () => {
    let result: unknown;
    service.getAll({ page: 1, limit: 20, invoiceId: 'inv1' }).subscribe((r) => (result = r));

    const req = httpMock.expectOne((r) => r.url === `${base}/payments`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('invoiceId')).toBe('inv1');

    const pagination = { page: 1, limit: 20, total: 1, pageCount: 1, hasNextPage: false };
    req.flush({ success: true, items: [payment], pagination });
    expect(result).toEqual({ items: [payment], total: 1, page: 1, limit: 20, totalPages: 1 });
  });

  it('create attaches a generated Idempotency-Key header', () => {
    service.create(payload).subscribe();

    const req = httpMock.expectOne(`${base}/payments`);
    expect(req.request.method).toBe('POST');
    const key = req.request.headers.get('Idempotency-Key');
    expect(key).toBeTruthy();
    expect((key ?? '').length).toBeGreaterThan(0);
    expect(req.request.body).toEqual(payload);
    req.flush({ success: true, data: payment });
  });

  it('create uses a caller-supplied Idempotency-Key when provided', () => {
    service.create(payload, 'key-xyz').subscribe();

    const req = httpMock.expectOne(`${base}/payments`);
    expect(req.request.headers.get('Idempotency-Key')).toBe('key-xyz');
    req.flush({ success: true, data: payment });
  });
});
