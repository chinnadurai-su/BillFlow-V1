import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { ApiService } from './api.service';
import { AppError } from './models/api.model';

describe('ApiService', () => {
  let service: ApiService;
  let httpMock: HttpTestingController;
  const base = environment.apiUrl;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('unwraps the data payload from a successful response', () => {
    let result: unknown;
    service.get<{ id: number }>('/things').subscribe((r) => (result = r));

    const req = httpMock.expectOne(`${base}/things`);
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, data: { id: 7 } });

    expect(result).toEqual({ id: 7 });
  });

  it('attaches query params and drops empty ones', () => {
    service.get('/customers', { params: { page: 2, search: '', status: undefined } }).subscribe();

    const req = httpMock.expectOne((r) => r.url === `${base}/customers`);
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.has('search')).toBeFalse();
    expect(req.request.params.has('status')).toBeFalse();
    req.flush({ success: true, data: [] });
  });

  it('forwards custom headers such as Idempotency-Key', () => {
    service
      .post('/payments', { amount: 10 }, { headers: { 'Idempotency-Key': 'key-123' } })
      .subscribe();

    const req = httpMock.expectOne(`${base}/payments`);
    expect(req.request.headers.get('Idempotency-Key')).toBe('key-123');
    req.flush({ success: true, data: {} });
  });

  it('maps a backend error to a friendly AppError', () => {
    let error: AppError | undefined;
    service.post('/auth/login', {}).subscribe({
      next: () => fail('expected an error'),
      error: (e: AppError) => (error = e),
    });

    httpMock
      .expectOne(`${base}/auth/login`)
      .flush(
        { success: false, message: 'Invalid email or password', errorCode: 'INVALID_CREDENTIALS' },
        { status: 401, statusText: 'Unauthorized' },
      );

    expect(error).toBeInstanceOf(AppError);
    expect(error?.errorCode).toBe('INVALID_CREDENTIALS');
    expect(error?.status).toBe(401);
    expect(error?.isNetworkError).toBeFalse();
    expect(error?.message).toBe('Invalid email or password.');
  });

  it('falls back to the backend message for unmapped error codes', () => {
    let error: AppError | undefined;
    service.get('/x').subscribe({ next: () => fail('expected error'), error: (e: AppError) => (error = e) });

    httpMock
      .expectOne(`${base}/x`)
      .flush(
        { success: false, message: 'Custom failure', errorCode: 'SOMETHING_ODD' },
        { status: 422, statusText: 'Unprocessable Entity' },
      );

    expect(error?.message).toBe('Custom failure');
    expect(error?.errorCode).toBe('SOMETHING_ODD');
  });

  it('flags a connection failure distinctly as a network error', () => {
    let error: AppError | undefined;
    service.get('/dashboard/summary').subscribe({
      next: () => fail('expected an error'),
      error: (e: AppError) => (error = e),
    });

    httpMock.expectOne(`${base}/dashboard/summary`).error(new ProgressEvent('error'));

    expect(error).toBeInstanceOf(AppError);
    expect(error?.isNetworkError).toBeTrue();
    expect(error?.errorCode).toBe('NETWORK_ERROR');
    expect(error?.status).toBe(0);
  });
});
