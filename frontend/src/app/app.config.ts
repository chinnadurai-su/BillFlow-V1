// app.config.ts — Application-level providers for the standalone bootstrap.
import { ApplicationConfig } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideStore } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';

import { routes } from './app.routes';
import { authInterceptor } from './core/auth.interceptor';
import { AUTH_FEATURE_KEY, authReducer } from './store/auth.reducer';

// NgRx root store holds only genuinely shared state (Spec §7.5) — currently the auth
// feature. HttpClient is wired with the functional auth interceptor (token + 401 refresh).
export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideStore({ [AUTH_FEATURE_KEY]: authReducer }),
    provideEffects([]),
  ],
};
