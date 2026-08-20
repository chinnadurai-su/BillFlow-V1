// api.model.ts — Shared types for talking to the BillFlow backend.
//
// The backend uses a single, consistent envelope (Spec §8):
//   success:  { success: true, data: <payload> }        // 2xx
//   error:    { success: false, message, errorCode }     // 4xx / 5xx
// ApiService unwraps `data` on success and normalizes every failure into an AppError.

/** Success envelope returned by every backend endpoint. `data` is the actual payload. */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  errorCode?: string;
}

/** Error envelope (Spec §8). Every non-2xx response follows this shape. */
export interface ApiErrorBody {
  success: false;
  message: string;
  errorCode: string;
}

/**
 * Client-side shape for a page of a paginated list endpoint, as consumed by list
 * components. `ApiService.getPaginated` maps the raw backend envelope into this shape
 * (backend `pagination.pageCount` → `totalPages`).
 */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Raw list-endpoint envelope (Spec §6). Unlike single-resource endpoints, list routes
 * place `items` and `pagination` at the TOP LEVEL of the response — they are NOT wrapped
 * in `data`. `ApiService.getPaginated` reads this and maps it into `Paginated<T>`.
 */
export interface PaginatedResponse<T> {
  success: boolean;
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pageCount: number;
    hasNextPage: boolean;
  };
}

/** Per-call options accepted by ApiService helpers. */
export interface RequestOptions {
  /** Query-string params. `null`/`undefined`/`''` values are dropped. */
  params?: Record<string, string | number | boolean | null | undefined>;
  /** Extra request headers (e.g. `Idempotency-Key` on financial POSTs, Spec §7.1). */
  headers?: Record<string, string>;
  /** Send cookies (needed for the httpOnly refresh-token cookie on auth calls). */
  withCredentials?: boolean;
}

/**
 * Normalized, user-presentable error thrown by every ApiService call.
 * Components read `.message` to show feedback and can branch on `.errorCode`
 * or `.isNetworkError` for special handling.
 */
export class AppError extends Error {
  constructor(
    override readonly message: string,
    readonly errorCode: string,
    readonly status: number,
    readonly isNetworkError: boolean = false,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * Maps backend `errorCode`s to friendly, user-facing copy (Spec item 9).
 * Unlisted codes fall back to the backend's own `message`.
 */
export const FRIENDLY_ERROR_MESSAGES: Record<string, string> = {
  NETWORK_ERROR: 'Connection problem — please check your internet and try again.',
  INTERNAL_ERROR: 'Something went wrong on our end. Please try again shortly.',
  VALIDATION_ERROR: 'Please check the highlighted fields and try again.',
  INVALID_CREDENTIALS: 'Invalid email or password.',
  EMAIL_TAKEN: 'An account with this email already exists.',
  DUPLICATE_KEY: 'A record with these details already exists.',
  RATE_LIMITED: 'Too many attempts. Please wait a few minutes and try again.',
  NO_REFRESH_TOKEN: 'Your session has expired. Please sign in again.',
  INVALID_REFRESH_TOKEN: 'Your session has expired. Please sign in again.',
  INVALID_ID: 'The requested item could not be found.',
  NOT_FOUND: 'The requested item could not be found.',
};
