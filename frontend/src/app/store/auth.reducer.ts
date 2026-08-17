// auth.reducer.ts — NgRx reducer for authentication state (Spec §7.5).
import { createReducer, on } from '@ngrx/store';

import { User } from '../core/models/user.model';
import { AuthActions } from './auth.actions';

export const AUTH_FEATURE_KEY = 'auth';

export type AuthStatus = 'authenticated' | 'unauthenticated';

export interface AuthState {
  user: User | null;
  status: AuthStatus;
}

export const initialAuthState: AuthState = {
  user: null,
  status: 'unauthenticated',
};

export const authReducer = createReducer(
  initialAuthState,
  // Login and session-restore both put us into an authenticated state with a user.
  on(
    AuthActions.loginSuccess,
    AuthActions.sessionRestored,
    (_state, { user }): AuthState => ({ user, status: 'authenticated' }),
  ),
  // Logout resets to the initial, unauthenticated state.
  on(AuthActions.loggedOut, (): AuthState => ({ ...initialAuthState })),
);
