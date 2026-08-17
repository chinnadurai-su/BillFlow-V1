import { User } from '../core/models/user.model';
import { AuthActions } from './auth.actions';
import { authReducer, initialAuthState } from './auth.reducer';

const user: User = { _id: 'u1', name: 'Jane', email: 'jane@example.com', role: 'staff' };

describe('authReducer', () => {
  it('returns the current state for an unknown action', () => {
    const state = authReducer(initialAuthState, { type: 'unknown' });
    expect(state).toBe(initialAuthState);
  });

  it('sets the user and authenticated status on loginSuccess', () => {
    const state = authReducer(initialAuthState, AuthActions.loginSuccess({ user }));
    expect(state.user).toEqual(user);
    expect(state.status).toBe('authenticated');
  });

  it('sets the user and authenticated status on sessionRestored', () => {
    const state = authReducer(initialAuthState, AuthActions.sessionRestored({ user }));
    expect(state.user).toEqual(user);
    expect(state.status).toBe('authenticated');
  });

  it('resets to the initial state on loggedOut', () => {
    const authenticated = authReducer(initialAuthState, AuthActions.loginSuccess({ user }));
    const state = authReducer(authenticated, AuthActions.loggedOut());
    expect(state).toEqual(initialAuthState);
  });
});
