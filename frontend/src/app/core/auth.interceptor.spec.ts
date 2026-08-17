import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideStore } from '@ngrx/store';

import { environment } from '../../environments/environment';
import { User } from '../core/models/user.model';
import { AUTH_FEATURE_KEY, authReducer } from '../store/auth.reducer';
import { AuthService } from '../features/auth/auth.service';
import { authInterceptor } from './auth.interceptor';

const base = environment.apiUrl;
const user: User = { _id: 'u1', email: 'jane@example.com', role: 'staff' };

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  const seedSession = (token = 'access-1') => {
    localStorage.setItem('billflow.accessToken', token);
    localStorage.setItem('billflow.user', JSON.stringify(user));
  };

  const configure = () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        provideStore({ [AUTH_FEATURE_KEY]: authReducer }),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthService); // construct + rehydrate any seeded session
  };

  beforeEach(() => localStorage.clear());
  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('attaches the bearer token and credentials to API requests', () => {
    seedSession('access-1');
    configure();

    http.get(`${base}/customers`).subscribe();
    const req = httpMock.expectOne(`${base}/customers`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer access-1');
    expect(req.request.withCredentials).toBeTrue();
    req.flush({ success: true, data: [] });
  });

  it('does not attach a bearer token to auth endpoints', () => {
    seedSession('access-1');
    configure();

    http.post(`${base}/auth/login`, {}).subscribe();
    const req = httpMock.expectOne(`${base}/auth/login`);
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({ success: true, data: { user, accessToken: 'x' } });
  });

  it('leaves non-API requests untouched', () => {
    seedSession('access-1');
    configure();

    http.get('https://example.com/data').subscribe();
    const req = httpMock.expectOne('https://example.com/data');
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({});
  });

  it('refreshes once on a 401 then retries the original request', () => {
    seedSession('access-1');
    configure();

    let result: unknown;
    http.get(`${base}/customers`).subscribe((r) => (result = r));

    // 1) original request fails with 401
    const first = httpMock.expectOne((r) => r.url === `${base}/customers`);
    expect(first.request.headers.get('Authorization')).toBe('Bearer access-1');
    first.flush(
      { success: false, message: 'expired', errorCode: 'TOKEN_EXPIRED' },
      { status: 401, statusText: 'Unauthorized' },
    );

    // 2) interceptor triggers a refresh
    const refresh = httpMock.expectOne(`${base}/auth/refresh`);
    expect(refresh.request.method).toBe('POST');
    refresh.flush({ success: true, data: { accessToken: 'access-2' } });

    // 3) original request retried with the fresh token
    const retry = httpMock.expectOne((r) => r.url === `${base}/customers`);
    expect(retry.request.headers.get('Authorization')).toBe('Bearer access-2');
    retry.flush({ success: true, data: [{ _id: 'c1' }] });

    expect(result).toEqual({ success: true, data: [{ _id: 'c1' }] });
  });

  it('tears down the session and propagates when the refresh fails', () => {
    seedSession('access-1');
    configure();

    let errored = false;
    http.get(`${base}/customers`).subscribe({ next: () => undefined, error: () => (errored = true) });

    httpMock
      .expectOne(`${base}/customers`)
      .flush({}, { status: 401, statusText: 'Unauthorized' });
    httpMock
      .expectOne(`${base}/auth/refresh`)
      .flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(errored).toBeTrue();
    expect(TestBed.inject(AuthService).accessToken()).toBeNull();
  });
});
