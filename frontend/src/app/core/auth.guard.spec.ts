import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, RouterStateSnapshot, UrlTree } from '@angular/router';
import { provideStore } from '@ngrx/store';

import { User } from '../core/models/user.model';
import { AUTH_FEATURE_KEY, authReducer } from '../store/auth.reducer';
import { AuthService } from '../features/auth/auth.service';
import { authGuard } from './auth.guard';

const user: User = { _id: 'u1', email: 'jane@example.com', role: 'staff' };

describe('authGuard', () => {
  const runGuard = (url: string) =>
    TestBed.runInInjectionContext(() =>
      authGuard({} as unknown as ActivatedRouteSnapshot, { url } as unknown as RouterStateSnapshot),
    );

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideStore({ [AUTH_FEATURE_KEY]: authReducer }),
      ],
    });
  });

  afterEach(() => localStorage.clear());

  it('redirects unauthenticated users to /auth/login with a returnUrl', () => {
    const result = runGuard('/customers');

    expect(result instanceof UrlTree).toBeTrue();
    const tree = result as UrlTree;
    expect(tree.toString()).toContain('/auth/login');
    expect(tree.queryParams['returnUrl']).toBe('/customers');
  });

  it('allows authenticated users through', () => {
    // Seed a session before the guard reads it, then construct the service to rehydrate.
    localStorage.setItem('billflow.accessToken', 'tok');
    localStorage.setItem('billflow.user', JSON.stringify(user));
    TestBed.inject(AuthService);

    expect(runGuard('/customers')).toBeTrue();
  });
});
