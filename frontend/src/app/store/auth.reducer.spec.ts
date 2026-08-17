import { authReducer, initialAuthState } from './auth.reducer';

describe('authReducer', () => {
  it('should return the current state for an unknown action', () => {
    const state = authReducer(initialAuthState, { type: 'unknown' });
    expect(state).toBe(initialAuthState);
  });

  // TODO: add tests for login/logout/refresh state transitions (user, token, isAuthenticated)
});
