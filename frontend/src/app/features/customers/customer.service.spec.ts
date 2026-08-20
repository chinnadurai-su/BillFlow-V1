import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { Customer } from './customer.models';
import { CustomerService } from './customer.service';

const base = environment.apiUrl;
const customer: Customer = { _id: 'c1', name: 'Acme', email: 'billing@acme.com', balance: 0 };

describe('CustomerService', () => {
  let service: CustomerService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CustomerService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getAll sends pagination + search params and returns the page', () => {
    let result: unknown;
    service.getAll({ page: 2, limit: 20, search: 'ac' }).subscribe((r) => (result = r));

    const req = httpMock.expectOne((r) => r.url === `${base}/customers`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('limit')).toBe('20');
    expect(req.request.params.get('search')).toBe('ac');

    const pagination = { page: 2, limit: 20, total: 1, pageCount: 1, hasNextPage: false };
    req.flush({ success: true, items: [customer], pagination });
    expect(result).toEqual({ items: [customer], total: 1, page: 2, limit: 20, totalPages: 1 });
  });

  it('getById fetches a single customer', () => {
    let result: unknown;
    service.getById('c1').subscribe((r) => (result = r));

    const req = httpMock.expectOne(`${base}/customers/c1`);
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, data: customer });
    expect(result).toEqual(customer);
  });

  it('create POSTs the payload', () => {
    const payload = { name: 'Acme', email: 'billing@acme.com' };
    service.create(payload).subscribe();

    const req = httpMock.expectOne(`${base}/customers`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush({ success: true, data: customer });
  });

  it('update PUTs to the customer id', () => {
    const payload = { name: 'Acme Renamed', email: 'billing@acme.com' };
    service.update('c1', payload).subscribe();

    const req = httpMock.expectOne(`${base}/customers/c1`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(payload);
    req.flush({ success: true, data: { ...customer, name: 'Acme Renamed' } });
  });

  it('archive DELETEs the customer', () => {
    service.archive('c1').subscribe();

    const req = httpMock.expectOne(`${base}/customers/c1`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ success: true, data: null });
  });
});
