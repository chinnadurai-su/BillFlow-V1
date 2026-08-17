// auth.selectors.ts — Selectors for the shared auth state (Spec §7.5).
import { createFeatureSelector, createSelector } from '@ngrx/store';

import { AUTH_FEATURE_KEY, AuthState } from './auth.reducer';

export const selectAuthState = createFeatureSelector<AuthState>(AUTH_FEATURE_KEY);

export const selectCurrentUser = createSelector(selectAuthState, (state) => state.user);

export const selectAuthStatus = createSelector(selectAuthState, (state) => state.status);

export const selectIsAuthenticated = createSelector(
  selectAuthState,
  (state) => state.status === 'authenticated',
);
