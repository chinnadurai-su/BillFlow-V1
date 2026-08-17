// auth.actions.ts — NgRx actions for the shared auth state (Spec §7.5).
//
// Auth state (current user + status) is the one piece of state genuinely shared across
// unrelated features — guards, the HTTP interceptor and the app-shell nav all read it —
// so it lives in NgRx. The access token itself stays in AuthService (see auth.service.ts);
// tokens don't belong in the store/devtools.
import { createActionGroup, emptyProps, props } from '@ngrx/store';

import { User } from '../core/models/user.model';

export const AuthActions = createActionGroup({
  source: 'Auth',
  events: {
    // Fired after a successful login — establishes the session.
    'Login Success': props<{ user: User }>(),
    // Fired on app boot when a persisted session is rehydrated from storage.
    'Session Restored': props<{ user: User }>(),
    // Fired on logout or when a refresh fails and the session is torn down.
    'Logged Out': emptyProps(),
  },
});
