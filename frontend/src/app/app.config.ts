// app.config.ts — Application-level providers for the standalone bootstrap (router + NgRx root store/effects).
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideStore } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';

import { routes } from './app.routes';

// NgRx root store wired with an empty reducer map for now — the standalone equivalent of
// StoreModule.forRoot({}) (Spec 7.5). Register feature reducers from app/store/ as they are built.
export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideStore({}),
    provideEffects([]),
  ],
};
