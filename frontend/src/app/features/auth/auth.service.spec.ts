import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideStore } from '@ngrx/store';

import { environment } from '../../../environments/environment';
import { User } from '../../core/models/user.model';
import { AUTH_FEATURE_KEY, authReducer } from '../../store/auth.reducer';
import { AuthService } from './auth.service';

const base = environment.apiUrl;
const user: User = { _id: 'u1', name: 'Jane', email: 'jane@example.com', role: 'staff' };

function configure() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideStore({ [AUTH_FEATURE_KEY]: authReducer }),
    ],
  });
}

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  const flushLogin = (accessToken = 'access-1') =>
    httpMock.expectOne(`${base}/auth/login`).flush({ success: true, data: { user, accessToken } });

  beforeEach(() => {
    localStorage.clear();
    configure();
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('starts unauthenticated', () => {
    expect(service.isAuthenticated()).toBeFalse();
    expect(service.accessToken()).toBeNull();
    expect(service.currentUser()).toBeNull();
  });

  it('login stores the token + user and sends credentials', () => {
    service.login({ email: 'jane@example.com', password: 'secret123' }).subscribe();

    const req = httpMock.expectOne(`${base}/auth/login`);
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBeTrue();
    expect(req.request.body).toEqual({ email: 'jane@example.com', password: 'secret123' });
    req.flush({ success: true, data: { user, accessToken: 'access-1' } });

    expect(service.accessToken()).toBe('access-1');
    expect(service.currentUser()).toEqual(user);
    expect(service.isAuthenticated()).toBeTrue();
    expect(localStorage.getItem('billflow.accessToken')).toBe('access-1');
  });

  it('register posts to /auth/register with the payload', () => {
    service.register({ name: 'Jane', email: 'jane@example.com', password: 'secret123' }).subscribe();

    const req = httpMock.expectOne(`${base}/auth/register`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: 'Jane', email: 'jane@example.com', password: 'secret123' });
    req.flush({ success: true, data: user });
    // register alone does not establish a session
    expect(service.isAuthenticated()).toBeFalse();
  });

  it('refresh rotates the access token', () => {
    service.login({ email: 'jane@example.com', password: 'secret123' }).subscribe();
    flushLogin('access-1');

    let newToken: string | undefined;
    service.refresh().subscribe((t) => (newToken = t));

    const req = httpMock.expectOne(`${base}/auth/refresh`);
    expect(req.request.withCredentials).toBeTrue();
    req.flush({ success: true, data: { accessToken: 'access-2' } });

    expect(newToken).toBe('access-2');
    expect(service.accessToken()).toBe('access-2');
  });

  it('logout clears the session', () => {
    service.login({ email: 'jane@example.com', password: 'secret123' }).subscribe();
    flushLogin('access-1');
    expect(service.isAuthenticated()).toBeTrue();

    service.logout().subscribe();
    httpMock.expectOne(`${base}/auth/logout`).flush({ success: true, message: 'Logged out successfully' });

    expect(service.accessToken()).toBeNull();
    expect(service.currentUser()).toBeNull();
    expect(service.isAuthenticated()).toBeFalse();
    expect(localStorage.getItem('billflow.accessToken')).toBeNull();
  });

  it('logout still clears the session when the network call fails', () => {
    service.login({ email: 'jane@example.com', password: 'secret123' }).subscribe();
    flushLogin('access-1');

    let completed = false;
    service.logout().subscribe({ complete: () => (completed = true) });
    httpMock.expectOne(`${base}/auth/logout`).error(new ProgressEvent('error'));

    expect(completed).toBeTrue();
    expect(service.isAuthenticated()).toBeFalse();
  });
});

describe('AuthService session rehydration', () => {
  afterEach(() => localStorage.clear());

  it('rehydrates a persisted session on construction', () => {
    localStorage.clear();
    localStorage.setItem('billflow.accessToken', 'persisted-token');
    localStorage.setItem('billflow.user', JSON.stringify(user));

    configure();
    const service = TestBed.inject(AuthService);

    expect(service.accessToken()).toBe('persisted-token');
    expect(service.currentUser()).toEqual(user);
    expect(service.isAuthenticated()).toBeTrue();
  });

  it('discards a half-persisted session (token without user)', () => {
    localStorage.clear();
    localStorage.setItem('billflow.accessToken', 'orphan-token');

    configure();
    const service = TestBed.inject(AuthService);

    expect(service.accessToken()).toBeNull();
    expect(service.isAuthenticated()).toBeFalse();
    expect(localStorage.getItem('billflow.accessToken')).toBeNull();
  });
});
