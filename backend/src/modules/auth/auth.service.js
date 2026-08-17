// auth.service.js — Business logic for authentication (Spec Section 6 — Auth, Section 8).
//
// Responsibilities:
//   - register: hash the password with bcrypt and persist a User (never store the raw password)
//   - login:    verify credentials (bcrypt.compare) and issue access + refresh tokens
//   - refresh:  verify + ROTATE the refresh token (old one is denylisted), re-read the user's
//               current role, and issue a fresh access + refresh token pair
//   - logout:   invalidate (denylist) the refresh token
//
// Access token = 15 min, refresh token = 7 days (Spec Section 8). Refresh tokens are stateless
// JWTs, so "invalidation" is implemented via the RevokedToken denylist (see models/RevokedToken.js).

const bcrypt = require('bcrypt');
const crypto = require('crypto');

const User = require('../../models/User');
const RevokedToken = require('../../models/RevokedToken');
const ApiError = require('../../utils/ApiError');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} = require('../../utils/tokens');

// bcrypt cost factor. Configurable via env so it can be tuned per environment;
// 10 is a sane default (Spec allows BCRYPT_SALT_ROUNDS).
const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS) || 10;

// Store only a SHA-256 hash of a refresh token in the denylist — never the raw token
// (project rule: never log/store tokens). SHA-256 is deterministic, so the same token
// always maps to the same hash for lookups.
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/**
 * Register a new user. SECURITY: this never accepts a caller-chosen role — every user registered
 * through the public endpoint gets the User schema default ('staff'). Admins are provisioned out of
 * band (seed script / DB), so a public request can never mint an admin (prevents privilege
 * escalation — see the RBAC review finding).
 * @param {{ name?: string, email: string, password: string }} input
 * @returns {Promise<object>} the created user WITHOUT passwordHash
 */
async function register({ name, email, password } = {}) {
  if (!email || !password) {
    throw new ApiError(400, 'Email and password are required', 'VALIDATION_ERROR');
  }
  if (password.length < 8) {
    throw new ApiError(400, 'Password must be at least 8 characters', 'VALIDATION_ERROR');
  }

  const normalizedEmail = String(email).toLowerCase().trim();

  // Pre-check for a friendly 409 (the unique index is still the source of truth —
  // see the duplicate-key catch below for the race-condition case).
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    throw new ApiError(409, 'A user with this email already exists', 'EMAIL_TAKEN');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  try {
    const user = await User.create({
      name,
      email: normalizedEmail,
      passwordHash,
      // role intentionally omitted → schema default 'staff'. Never trust a client-supplied role.
    });

    // toJSON strips passwordHash/__v; return the safe representation.
    return user.toJSON();
  } catch (err) {
    // Duplicate-key race: two concurrent registrations for the same email.
    if (err && err.code === 11000) {
      throw new ApiError(409, 'A user with this email already exists', 'EMAIL_TAKEN');
    }
    throw err;
  }
}

/**
 * Verify credentials and issue tokens.
 * @param {{ email: string, password: string }} input
 * @returns {Promise<{ user: object, accessToken: string, refreshToken: string }>}
 */
async function login({ email, password } = {}) {
  if (!email || !password) {
    throw new ApiError(400, 'Email and password are required', 'VALIDATION_ERROR');
  }

  const normalizedEmail = String(email).toLowerCase().trim();

  // passwordHash is select:false, so opt back in here (only here) to compare.
  const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');

  // Use the SAME error for "no such user" and "wrong password" so we don't reveal
  // which emails are registered (avoids user enumeration).
  if (!user) {
    throw new ApiError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    throw new ApiError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
  }

  return {
    user: user.toJSON(),
    accessToken: signAccessToken(user),
    refreshToken: signRefreshToken(user),
  };
}

/**
 * Rotate a refresh token: verify it, reject if denylisted, denylist the old one,
 * and issue a fresh access + refresh pair (Spec Section 8 — refresh mechanism).
 * @param {string} refreshToken
 * @returns {Promise<{ accessToken: string, refreshToken: string }>}
 */
async function refresh(refreshToken) {
  if (!refreshToken) {
    throw new ApiError(401, 'Refresh token missing', 'NO_REFRESH_TOKEN');
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch (_err) {
    // Expired / tampered / wrong-secret tokens all land here.
    throw new ApiError(401, 'Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN');
  }

  // Reject tokens that were revoked by a prior logout or a prior rotation. Without this
  // check the denylist would never be consulted and a "logged out" (or already-rotated)
  // token would still be usable until its natural 7-day expiry.
  const isRevoked = await RevokedToken.exists({ tokenHash: hashToken(refreshToken) });
  if (isRevoked) {
    throw new ApiError(401, 'Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN');
  }

  // Re-read the user so the new access token reflects the CURRENT role (e.g. if an admin
  // demoted them) and so we don't mint tokens for a deleted user.
  const user = await User.findById(decoded.sub);
  if (!user) {
    throw new ApiError(401, 'Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN');
  }

  // Rotation: denylist the token we just consumed so it can't be reused (a stolen,
  // already-rotated token becomes worthless). The new pair replaces it.
  await denylist(refreshToken, decoded);

  return {
    accessToken: signAccessToken(user),
    refreshToken: signRefreshToken(user),
  };
}

/**
 * Invalidate a refresh token on logout by recording it in the denylist until it
 * would have expired anyway (Spec Section 6 — POST /api/auth/logout).
 * Idempotent: logging out twice with the same token is a no-op.
 * @param {string} refreshToken
 */
async function logout(refreshToken) {
  if (!refreshToken) {
    // Nothing to invalidate — treat as a successful no-op so logout is always safe to call.
    return { success: true };
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch (_err) {
    // An expired/tampered token needs no revocation (it's already unusable).
    return { success: true };
  }

  await denylist(refreshToken, decoded);
  return { success: true };
}

/**
 * Add a verified refresh token to the denylist.
 * Keyed (upserted) on the token hash so repeated calls are idempotent — no duplicate
 * rows, no duplicate-key error. The TTL index on expiresAt purges the row once the
 * token would have expired naturally.
 */
async function denylist(refreshToken, decoded) {
  // `exp` is seconds-since-epoch; convert to a Date for the TTL index.
  const expiresAt = new Date(decoded.exp * 1000);
  await RevokedToken.updateOne(
    { tokenHash: hashToken(refreshToken) },
    { $setOnInsert: { expiresAt, userId: decoded.sub } },
    { upsert: true }
  );
}

module.exports = { register, login, refresh, logout };
