// user.model.ts — Authenticated user shape (Spec §5.1), shared across auth service,
// NgRx auth store, guards and the app shell. Mirrors what the backend returns from
// register/login (the password hash is never sent to the client).
export type UserRole = 'admin' | 'staff';

export interface User {
  _id: string;
  name?: string;
  email: string;
  role: UserRole;
  createdAt?: string;
  updatedAt?: string;
}
