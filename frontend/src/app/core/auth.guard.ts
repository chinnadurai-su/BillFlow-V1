// auth.guard.ts — Route guard that blocks unauthenticated access to protected routes.
import { CanActivateFn } from '@angular/router';

export const authGuard: CanActivateFn = () => {
  // TODO:
  //  - Check JWT validity via AuthService / NgRx auth state.
  //  - Return true when authenticated; otherwise redirect to /auth/login.
  return true;
};
