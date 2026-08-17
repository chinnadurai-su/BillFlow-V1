// auth.controller.js — thin Express handlers for the auth endpoints (Spec Section 6 — Auth).
//
// Controllers stay thin (project rule): validate/shape HTTP, delegate all business logic to
// auth.service. Errors are forwarded to the centralized errorHandler via next(err) so every
// failure returns the standard { success, message, errorCode } shape (Spec Section 8).

const authService = require('./auth.service');

// Name of the httpOnly cookie carrying the refresh token (Spec Section 8).
const REFRESH_COOKIE = 'refreshToken';

// 7 days in ms — keep the cookie's maxAge aligned with the refresh token TTL.
const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

/**
 * Build the options for the refresh-token cookie.
 * - httpOnly: JS in the browser can't read it (mitigates XSS token theft)
 * - secure:   only sent over HTTPS in production (allow HTTP on localhost for dev)
 * - sameSite: 'strict' locally; 'none' in prod so the Netlify frontend on a different
 *             origin can send it (requires secure:true, which prod has)
 * - path:     scope the cookie to the auth routes that actually read it
 */
function refreshCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'strict',
    maxAge: REFRESH_COOKIE_MAX_AGE,
    path: '/api/auth',
  };
}

// POST /api/auth/register — create a user, return it without the password hash.
async function register(req, res, next) {
  try {
    // NOTE: `role` is deliberately NOT read from the request body. Public registration must never
    // let a caller choose their own role (that would allow self-escalation to admin). New users
    // always get the schema default ('staff'); admins are provisioned via seed/DB, not this route.
    const { name, email, password } = req.body || {};
    const user = await authService.register({ name, email, password });
    return res.status(201).json({ success: true, data: user });
  } catch (err) {
    return next(err);
  }
}

// POST /api/auth/login — verify credentials, set the refresh cookie, return the access token.
async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};
    const { user, accessToken, refreshToken } = await authService.login({ email, password });

    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
    return res.status(200).json({ success: true, data: { user, accessToken } });
  } catch (err) {
    return next(err);
  }
}

// POST /api/auth/refresh — rotate the refresh token, set the new cookie, return a new access token.
async function refresh(req, res, next) {
  try {
    const token = req.cookies && req.cookies[REFRESH_COOKIE];
    const { accessToken, refreshToken } = await authService.refresh(token);

    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
    return res.status(200).json({ success: true, data: { accessToken } });
  } catch (err) {
    return next(err);
  }
}

// POST /api/auth/logout — invalidate the refresh token and clear the cookie.
async function logout(req, res, next) {
  try {
    const token = req.cookies && req.cookies[REFRESH_COOKIE];
    await authService.logout(token);

    // Clear with the SAME attributes used to set it, or some browsers won't remove it.
    res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
    return res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    return next(err);
  }
}

module.exports = { register, login, refresh, logout };
