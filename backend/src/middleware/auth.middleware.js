// auth.middleware.js — Express middleware that verifies the JWT access token and attaches the user to the request.
//
// Purpose (see Spec Section 8): guards protected routes using the JWT access-token pattern
// (15 min access token; refresh handled via httpOnly cookie).

// TODO: verify JWT from Authorization header, attach req.user, call next() or return 401

// Minimal valid export so routes can require and mount this without crashing.
function authMiddleware(req, res, next) {
  // TODO: verify JWT from Authorization header, attach req.user, call next() or return 401
  return next();
}

module.exports = authMiddleware;
