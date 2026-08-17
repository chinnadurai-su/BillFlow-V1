// auth.service.ts — Authentication service (Spec §6 — Auth, §8).
//
// State model (Spec §7.5 split):
//  - The access token lives in a Signal here (in-memory + persisted to localStorage so a
//    page reload keeps the session). It's read synchronously by the HTTP interceptor, and
//    kept OUT of the NgRx store — tokens don't belong in devtools/serialized state.
//  - The current user + auth status live in the NgRx auth store (shared across guards,
//    interceptor and the app-shell nav). `currentUser`/`isAuthenticated` are exposed here
//    as Signals backed by that store so components have one convenient surface.
//  - The refresh token is never touched by JS: the backend sets it as an httpOnly cookie,
//    so refresh()/logout() just send credentials and the browser attaches it.
import { computed, inject, Injectable, signal } from '@angular/core';
import { Store } from '@ngrx/store';
import { Observable, of, throwError } from 'rxjs';
import { catchError, finalize, map, shareReplay, tap } from 'rxjs';

import { ApiService } from '../../core/api.service';
import { User } from '../../core/models/user.model';
import { AuthActions } from '../../store/auth.actions';
import { selectCurrentUser } from '../../store/auth.selectors';
import { LoginCredentials, LoginData, RefreshData, RegisterPayload } from './auth.models';

const TOKEN_STORAGE_KEY = 'billflow.accessToken';
const USER_STORAGE_KEY = 'billflow.user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly store = inject(Store);

  // Access token — source of truth for "is a request authorized". Rehydrated from storage.
  private readonly _accessToken = signal<string | null>(this.readStorage(TOKEN_STORAGE_KEY));
  readonly accessToken = this._accessToken.asReadonly();

  // Current user + derived auth flag, backed by the NgRx store.
  readonly currentUser = this.store.selectSignal(selectCurrentUser);
  readonly isAuthenticated = computed(() => this._accessToken() !== null && this.currentUser() !== null);

  // Dedupes concurrent 401s: many failing requests share one in-flight refresh call.
  private refreshInFlight$: Observable<string> | null = null;

  constructor() {
    // Rehydrate the store from a persisted session so guards/nav work after a reload.
    const user = this.readUser();
    if (user && this._accessToken()) {
      this.store.dispatch(AuthActions.sessionRestored({ user }));
    } else if (this._accessToken() || user) {
      // Half a session (token without user, or vice versa) is unusable — start clean.
      this.clearStoredSession();
    }
  }

  /** POST /api/auth/register — create an account (does not log the user in). */
  register(payload: RegisterPayload): Observable<User> {
    return this.api.post<User>('/auth/register', payload, { withCredentials: true });
  }

  /** POST /api/auth/login — authenticate and start a session. */
  login(credentials: LoginCredentials): Observable<User> {
    return this.api.post<LoginData>('/auth/login', credentials, { withCredentials: true }).pipe(
      tap((data) => this.startSession(data.accessToken, data.user)),
      map((data) => data.user),
    );
  }

  /**
   * POST /api/auth/refresh — swap the httpOnly refresh cookie for a new access token.
   * Concurrent callers (e.g. several requests that 401 at once) share one HTTP call.
   * On failure the session is torn down so the interceptor can bounce to /login.
   */
  refresh(): Observable<string> {
    if (this.refreshInFlight$) {
      return this.refreshInFlight$;
    }
    this.refreshInFlight$ = this.api
      .post<RefreshData>('/auth/refresh', {}, { withCredentials: true })
      .pipe(
        map((data) => data.accessToken),
        tap((token) => this.setToken(token)),
        catchError((error) => {
          this.clearSession();
          return throwError(() => error);
        }),
        finalize(() => {
          this.refreshInFlight$ = null;
        }),
        shareReplay(1),
      );
    return this.refreshInFlight$;
  }

  /**
   * POST /api/auth/logout — invalidate the refresh token server-side.
   * Always resolves and clears the local session, even if the network call fails,
   * so the user is never stuck "logged in" on the client.
   */
  logout(): Observable<void> {
    return this.api.post<unknown>('/auth/logout', {}, { withCredentials: true }).pipe(
      catchError(() => of(null)),
      tap(() => this.clearSession()),
      map(() => undefined),
    );
  }

  /** Tear down the session locally (used on logout and on refresh failure). */
  clearSession(): void {
    this.clearStoredSession();
    this.store.dispatch(AuthActions.loggedOut());
  }

  // --- session + token persistence -----------------------------------------

  private startSession(token: string, user: User): void {
    this.setToken(token);
    this.writeStorage(USER_STORAGE_KEY, JSON.stringify(user));
    this.store.dispatch(AuthActions.loginSuccess({ user }));
  }

  private setToken(token: string): void {
    this._accessToken.set(token);
    this.writeStorage(TOKEN_STORAGE_KEY, token);
  }

  private clearStoredSession(): void {
    this._accessToken.set(null);
    this.removeStorage(TOKEN_STORAGE_KEY);
    this.removeStorage(USER_STORAGE_KEY);
  }

  private readUser(): User | null {
    const raw = this.readStorage(USER_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  }

  // localStorage wrappers guard against private-mode / quota / disabled-storage errors.
  private readStorage(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private writeStorage(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* storage unavailable — session simply won't survive a reload */
    }
  }

  private removeStorage(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}
