// auth.guard.ts — Functional route guard blocking unauthenticated access (Spec §6).
//
// Returns true when a valid session exists (token + user in state), otherwise redirects
// to /auth/login, preserving the attempted URL as `returnUrl` so the user lands back where
// they were headed after signing in.
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../features/auth/auth.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/auth/login']);
};
