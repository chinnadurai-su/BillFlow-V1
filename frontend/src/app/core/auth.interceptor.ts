// auth.interceptor.ts — HTTP interceptor that attaches the JWT to outgoing API requests.
import { HttpInterceptorFn } from '@angular/common/http';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // TODO:
  //  - Attach `Authorization: Bearer <accessToken>` to outgoing requests.
  //  - On 401, attempt refresh (POST /api/auth/refresh, Spec §6/§8) then retry the request.
  return next(req);
};
