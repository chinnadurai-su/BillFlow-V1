// app.routes.ts — Root route table for the BillFlow SPA.
import { Routes } from '@angular/router';

export const routes: Routes = [
  // TODO: add feature routes here (lazy-loaded standalone components), e.g.
  //   { path: 'auth/login',    loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent) },
  //   { path: 'auth/register', loadComponent: () => import('./features/auth/register/register.component').then(m => m.RegisterComponent) },
  //   { path: 'customers',     loadComponent: () => import('./features/customers/customer-list/customer-list.component').then(m => m.CustomerListComponent) },
  //   { path: 'invoices',      loadComponent: () => import('./features/invoices/invoice-list/invoice-list.component').then(m => m.InvoiceListComponent) },
  //   { path: 'payments',      loadComponent: () => import('./features/payments/payment-list/payment-list.component').then(m => m.PaymentListComponent) },
  //   { path: 'dashboard',     loadComponent: () => import('./features/dashboard/dashboard/dashboard.component').then(m => m.DashboardComponent) },
  // Protect authenticated routes with the core/auth.guard.
];
