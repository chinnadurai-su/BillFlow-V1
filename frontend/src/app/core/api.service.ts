// api.service.ts — Base HTTP wrapper every feature service builds on.
//
// Responsibilities:
//  - Prefix all calls with environment.apiUrl (Spec §9) so services pass only the path.
//  - Unwrap the backend success envelope, returning just the `data` payload.
//  - Normalize every failure into an AppError with friendly copy (Spec §8, item 9),
//    flagging connection failures distinctly from backend errors.
//  - Support per-call headers so financial POSTs can attach an `Idempotency-Key`
//    (Spec §7.1) and auth calls can send credentials for the refresh cookie.
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs';

import { environment } from '../../environments/environment';
import {
  ApiErrorBody,
  ApiResponse,
  AppError,
  FRIENDLY_ERROR_MESSAGES,
  Paginated,
  PaginatedResponse,
  RequestOptions,
} from './models/api.model';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  get<T>(path: string, options: RequestOptions = {}): Observable<T> {
    return this.http
      .get<ApiResponse<T>>(this.url(path), this.buildOptions(options))
      .pipe(this.unwrap<T>());
  }

  /**
   * GET a paginated list. List endpoints (Spec §6) return `{ success, items, pagination }`
   * at the top level instead of a `data` payload, so this maps that envelope into the
   * `Paginated<T>` shape list components consume (backend `pagination.pageCount` → `totalPages`).
   */
  getPaginated<T>(path: string, options: RequestOptions = {}): Observable<Paginated<T>> {
    return this.http
      .get<PaginatedResponse<T>>(this.url(path), this.buildOptions(options))
      .pipe(
        map((res) => ({
          items: res?.items ?? [],
          page: res?.pagination?.page ?? 1,
          limit: res?.pagination?.limit ?? 0,
          total: res?.pagination?.total ?? 0,
          totalPages: res?.pagination?.pageCount ?? 0,
        })),
        catchError((error: HttpErrorResponse) => this.handleError(error)),
      );
  }

  post<T>(path: string, body: unknown, options: RequestOptions = {}): Observable<T> {
    return this.http
      .post<ApiResponse<T>>(this.url(path), body, this.buildOptions(options))
      .pipe(this.unwrap<T>());
  }

  put<T>(path: string, body: unknown, options: RequestOptions = {}): Observable<T> {
    return this.http
      .put<ApiResponse<T>>(this.url(path), body, this.buildOptions(options))
      .pipe(this.unwrap<T>());
  }

  delete<T>(path: string, options: RequestOptions = {}): Observable<T> {
    return this.http
      .delete<ApiResponse<T>>(this.url(path), this.buildOptions(options))
      .pipe(this.unwrap<T>());
  }

  /** Fetch a binary payload (e.g. an invoice PDF) rather than the JSON envelope. */
  getBlob(path: string, options: RequestOptions = {}): Observable<Blob> {
    return this.http
      .get(this.url(path), { ...this.buildOptions(options), responseType: 'blob' })
      .pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  private url(path: string): string {
    return `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  }

  private buildOptions(options: RequestOptions) {
    return {
      params: this.buildParams(options.params),
      headers: new HttpHeaders(options.headers ?? {}),
      withCredentials: options.withCredentials ?? false,
    };
  }

  private buildParams(params: RequestOptions['params']): HttpParams {
    let httpParams = new HttpParams();
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        // Drop empty values so we don't send `?status=` for unset filters.
        if (value !== null && value !== undefined && value !== '') {
          httpParams = httpParams.set(key, String(value));
        }
      }
    }
    return httpParams;
  }

  /** Unwrap `data` on success; convert any HttpErrorResponse into an AppError. */
  private unwrap<T>() {
    return (source: Observable<ApiResponse<T>>): Observable<T> =>
      source.pipe(
        map((res) => res?.data as T),
        catchError((error: HttpErrorResponse) => this.handleError(error)),
      );
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    return throwError(() => this.normalize(error));
  }

  private normalize(error: HttpErrorResponse): AppError {
    // status 0 = request never reached the server (offline, DNS, CORS, timeout).
    if (error.status === 0) {
      return new AppError(FRIENDLY_ERROR_MESSAGES['NETWORK_ERROR'], 'NETWORK_ERROR', 0, true);
    }

    const body = (error.error ?? {}) as Partial<ApiErrorBody>;
    const errorCode = body.errorCode ?? 'INTERNAL_ERROR';
    // Prefer friendly copy for known codes; otherwise surface the backend's message.
    const message =
      FRIENDLY_ERROR_MESSAGES[errorCode] ?? body.message ?? 'Something went wrong. Please try again.';
    return new AppError(message, errorCode, error.status);
  }
}
