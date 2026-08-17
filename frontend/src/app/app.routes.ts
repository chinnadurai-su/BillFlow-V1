// app.routes.ts — Root route table for the BillFlow SPA.
//
// Auth routes are public; every feature route is protected by authGuard. Components are
// lazy-loaded standalone components (Spec §2). Feature modules beyond auth are still being
// implemented — their routes are wired here so navigation/guards work end to end.
import { Routes } from '@angular/router';

import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },

  // --- Public auth routes ---
  {
    path: 'auth/login',
    loadComponent: () => import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'auth/register',
    loadComponent: () =>
      import('./features/auth/register/register.component').then((m) => m.RegisterComponent),
  },

  // --- Protected feature routes ---
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/dashboard/dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'customers',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/customers/customer-list/customer-list.component').then(
        (m) => m.CustomerListComponent,
      ),
  },
  {
    path: 'customers/new',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/customers/customer-form/customer-form.component').then(
        (m) => m.CustomerFormComponent,
      ),
  },
  {
    path: 'customers/:id/edit',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/customers/customer-form/customer-form.component').then(
        (m) => m.CustomerFormComponent,
      ),
  },
  {
    path: 'invoices',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/invoices/invoice-list/invoice-list.component').then(
        (m) => m.InvoiceListComponent,
      ),
  },
  {
    path: 'invoices/new',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/invoices/invoice-form/invoice-form.component').then(
        (m) => m.InvoiceFormComponent,
      ),
  },
  {
    path: 'invoices/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/invoices/invoice-detail/invoice-detail.component').then(
        (m) => m.InvoiceDetailComponent,
      ),
  },
  {
    path: 'invoices/:id/edit',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/invoices/invoice-form/invoice-form.component').then(
        (m) => m.InvoiceFormComponent,
      ),
  },
  {
    path: 'payments',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/payments/payment-list/payment-list.component').then(
        (m) => m.PaymentListComponent,
      ),
  },
  {
    path: 'payments/new',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/payments/payment-form/payment-form.component').then(
        (m) => m.PaymentFormComponent,
      ),
  },

  { path: '**', redirectTo: 'dashboard' },
];
