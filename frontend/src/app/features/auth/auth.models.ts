// auth.models.ts — Request/response shapes for the Auth API (Spec §6 — Auth).
import { User, UserRole } from '../../core/models/user.model';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  role?: UserRole;
}

/** Payload of POST /api/auth/login (the refresh token is set as an httpOnly cookie). */
export interface LoginData {
  user: User;
  accessToken: string;
}

/** Payload of POST /api/auth/refresh (rotates the cookie, returns a fresh access token). */
export interface RefreshData {
  accessToken: string;
}
