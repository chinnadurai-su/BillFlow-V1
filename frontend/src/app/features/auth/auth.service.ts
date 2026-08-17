// auth.service.ts — Authentication service: login/register/refresh/logout against the auth API.
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AuthService {
  // TODO: implement methods calling the Auth endpoints (Spec §6), extending core/api.service:
  //  - register(payload)     -> POST /api/auth/register
  //  - login(credentials)    -> POST /api/auth/login    (returns JWT access + refresh tokens)
  //  - refresh()             -> POST /api/auth/refresh   (refresh via httpOnly cookie, Spec §8)
  //  - logout()              -> POST /api/auth/logout    (invalidate refresh token)
  //  Dispatch auth state to NgRx (store/auth.reducer): user, token, isAuthenticated.
}
