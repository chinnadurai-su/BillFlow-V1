// tokens.js — centralized JWT sign/verify helpers for the auth module.
//
// Why a single module (Spec Section 8): the access-token secret/expiry and the
// refresh-token secret/expiry are used from several places (service issues them,
// middleware verifies the access token, refresh flow verifies the refresh token).
// Keeping the env-var names and payload shape in one file avoids drift and makes
// the 15-min access / 7-day refresh policy explicit and testable.

const jwt = require('jsonwebtoken');
const ApiError = require('./ApiError');

// Access token: short-lived, sent in the Authorization header, carries just enough
// to authorize a request (user id + role) so we don't hit the DB on every call.
const ACCESS_SECRET = () => process.env.JWT_ACCESS_SECRET;
const ACCESS_EXPIRY = () => process.env.JWT_ACCESS_EXPIRY || '15m';

// Refresh token: longer-lived, stored in an httpOnly cookie, only ever used to mint
// a new access token. Carries only the user id (role is re-read on refresh).
const REFRESH_SECRET = () => process.env.JWT_REFRESH_SECRET;
const REFRESH_EXPIRY = () => process.env.JWT_REFRESH_EXPIRY || '7d';

function assertSecrets() {
  if (!ACCESS_SECRET() || !REFRESH_SECRET()) {
    // Fail loudly rather than signing tokens with `undefined` (which jwt would reject
    // anyway, but with a confusing message). This surfaces a misconfigured env early.
    throw new ApiError(500, 'JWT secrets are not configured', 'CONFIG_ERROR');
  }
}

/** Sign a short-lived access token embedding the user id and role (for RBAC). */
function signAccessToken(user) {
  assertSecrets();
  return jwt.sign(
    { sub: String(user._id), role: user.role, email: user.email },
    ACCESS_SECRET(),
    { expiresIn: ACCESS_EXPIRY() }
  );
}

/** Sign a long-lived refresh token. Keep the payload minimal (id only). */
function signRefreshToken(user) {
  assertSecrets();
  return jwt.sign({ sub: String(user._id) }, REFRESH_SECRET(), {
    expiresIn: REFRESH_EXPIRY(),
  });
}

/** Verify an access token; throws jwt errors (caller/middleware maps to 401). */
function verifyAccessToken(token) {
  assertSecrets();
  return jwt.verify(token, ACCESS_SECRET());
}

/** Verify a refresh token; throws jwt errors (caller maps to 401). */
function verifyRefreshToken(token) {
  assertSecrets();
  return jwt.verify(token, REFRESH_SECRET());
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  REFRESH_EXPIRY,
};
