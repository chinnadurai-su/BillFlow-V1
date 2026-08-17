// api.service.ts — Base HTTP wrapper that feature services extend for calls to the backend API.
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ApiService {
  // TODO:
  //  - Wrap HttpClient with get/post/put/delete helpers based on environment.apiUrl.
  //  - Centralize error mapping to the { success, message, errorCode } shape (Spec §8).
  //  - Provide a hook for attaching the `Idempotency-Key` header on financial POSTs (Spec §7.1).
}
