// auth.middleware.js — verifies the JWT access token and attaches the user to the request,
// plus a role-guard factory for role-based access control (Spec Section 8, BRD Section 5).
//
// Pattern (Spec Section 8): protected routes require a valid short-lived access token in the
// `Authorization: Bearer <token>` header. `authMiddleware` verifies it and sets req.user
// = { id, role, email }. `requireRole('admin')` then gates admin-only actions (BR-5).

const ApiError = require('../utils/ApiError');
const { verifyAccessToken } = require('../utils/tokens');

/**
 * Verify the Bearer access token and attach req.user. Returns 401 (via next(err))
 * when the header is missing/malformed or the token is invalid/expired.
 */
function authMiddleware(req, _res, next) {
  const authHeader = req.headers.authorization || '';

  // Expect exactly "Bearer <token>".
  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(new ApiError(401, 'Authentication required', 'NO_TOKEN'));
  }

  try {
    const decoded = verifyAccessToken(token);
    // Attach a minimal, trusted identity derived from the signed token — never from
    // client-supplied body/headers. Downstream code reads req.user for authorization
    // and for AuditLog `performedBy`.
    req.user = { id: decoded.sub, role: decoded.role, email: decoded.email };
    return next();
  } catch (_err) {
    // Expired or tampered token.
    return next(new ApiError(401, 'Invalid or expired token', 'INVALID_TOKEN'));
  }
}

/**
 * Role guard factory (RBAC). Use AFTER authMiddleware on a route:
 *   router.delete('/:id', authMiddleware, requireRole('admin'), handler)
 *
 * @param {...string} allowedRoles roles permitted to proceed (e.g. 'admin')
 * @returns {import('express').RequestHandler}
 */
function requireRole(...allowedRoles) {
  return (req, _res, next) => {
    // Must run after authMiddleware; guard against misordering.
    if (!req.user) {
      return next(new ApiError(401, 'Authentication required', 'NO_TOKEN'));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ApiError(403, 'You do not have permission to perform this action', 'FORBIDDEN')
      );
    }
    return next();
  };
}

module.exports = authMiddleware;
module.exports.authMiddleware = authMiddleware;
module.exports.requireRole = requireRole;
