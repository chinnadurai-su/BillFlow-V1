// auth.reducer.ts — NgRx reducer for authentication state.
import { createReducer } from '@ngrx/store';

// TODO: define the auth state shape — user, token, isAuthenticated (plus loading/error flags).
export interface AuthState {}

export const initialAuthState: AuthState = {};

// TODO: add on(...) handlers for login/register/refresh/logout actions.
export const authReducer = createReducer(initialAuthState);
