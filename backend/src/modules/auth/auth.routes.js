// auth.routes.js — Express router mapping auth endpoints to controller handlers.
//
// Endpoints (see Spec Section 6 — Auth):
//   POST /api/auth/register  — Register new user
//   POST /api/auth/login     — Login, returns JWT access token + sets refresh cookie
//   POST /api/auth/refresh   — Refresh access token (rotates refresh token)
//   POST /api/auth/logout    — Invalidate refresh token
//
// Rate limiting (express-rate-limit) is applied to /register and /login to blunt
// credential-stuffing / brute-force attempts (Spec Section 8).

const express = require('express');
const rateLimit = require('express-rate-limit');
const authController = require('./auth.controller');

const router = express.Router();

// Limit auth attempts per IP. Disabled under test so the suite isn't throttled.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // max attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts, please try again later', errorCode: 'RATE_LIMITED' },
  skip: () => process.env.NODE_ENV === 'test',
});

router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);

module.exports = router;
