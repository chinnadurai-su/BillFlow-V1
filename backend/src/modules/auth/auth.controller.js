// auth.controller.js — Express request handlers for the auth endpoints (register, login, refresh, logout).
//
// Purpose (see Spec Section 6 — Auth): validates incoming requests, delegates to auth.service,
// and shapes HTTP responses (including setting the httpOnly refresh-token cookie per Section 8).
//
// TODO: implement register, login, refresh, logout handlers, calling auth.service.js
//   - register: validate body, call authService.registerUser, return created user (no passwordHash)
//   - login:    validate credentials via authService, set httpOnly refresh cookie, return access token
//   - refresh:  read refresh cookie, call authService to rotate + issue a new access token
//   - logout:   invalidate the refresh token and clear the cookie

// eslint-disable-next-line no-unused-vars
async function register(req, res, next) {
  // TODO: call auth.service.js
  return res.status(501).json({ success: false, message: 'Not implemented', errorCode: 'NOT_IMPLEMENTED' });
}

// eslint-disable-next-line no-unused-vars
async function login(req, res, next) {
  // TODO: call auth.service.js
  return res.status(501).json({ success: false, message: 'Not implemented', errorCode: 'NOT_IMPLEMENTED' });
}

// eslint-disable-next-line no-unused-vars
async function refresh(req, res, next) {
  // TODO: call auth.service.js
  return res.status(501).json({ success: false, message: 'Not implemented', errorCode: 'NOT_IMPLEMENTED' });
}

// eslint-disable-next-line no-unused-vars
async function logout(req, res, next) {
  // TODO: call auth.service.js
  return res.status(501).json({ success: false, message: 'Not implemented', errorCode: 'NOT_IMPLEMENTED' });
}

module.exports = { register, login, refresh, logout };
