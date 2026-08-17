// auth.interceptor.ts — Attaches the JWT to outgoing API calls and transparently
// refreshes it once on a 401 (Spec §6/§8).
//
// Flow:
//  1. For same-origin API requests, send credentials (so the refresh cookie flows) and,
//     for non-auth endpoints, attach `Authorization: Bearer <accessToken>`.
//  2. If a request comes back 401 and we currently hold a session, call AuthService.refresh()
//     ONCE (concurrent 401s share one refresh), then retry the original request with the new
//     token. If the refresh itself fails, tear down the session and redirect to /login.
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';

import { environment } from '../../environments/environment';
import { AuthService } from '../features/auth/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // Only touch calls to our own backend; leave third-party requests untouched.
  if (!req.url.startsWith(environment.apiUrl)) {
    return next(req);
  }

  // Auth endpoints must not carry a bearer token or trigger the refresh-retry loop
  // (a 401 from /auth/* is a real credential failure, not an expired access token).
  const isAuthEndpoint = req.url.includes('/auth/');

  let apiReq = req.clone({ withCredentials: true });
  const token = auth.accessToken();
  if (token && !isAuthEndpoint) {
    apiReq = apiReq.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }

  return next(apiReq).pipe(
    catchError((error: HttpErrorResponse) => {
      const canRefresh = error.status === 401 && !isAuthEndpoint && auth.accessToken() !== null;
      if (!canRefresh) {
        return throwError(() => error);
      }

      return auth.refresh().pipe(
        // Retry the original request once with the freshly minted token.
        switchMap((newToken) =>
          next(apiReq.clone({ setHeaders: { Authorization: `Bearer ${newToken}` } })),
        ),
        catchError((refreshError) => {
          // Refresh failed — the session is gone; send the user to sign in again.
          auth.clearSession();
          void router.navigate(['/auth/login']);
          return throwError(() => refreshError);
        }),
      );
    }),
  );
};
