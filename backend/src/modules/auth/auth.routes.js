// auth.routes.js — Express router mapping auth endpoints to controller handlers.
//
// Endpoints (see Spec Section 6 — Auth):
//   POST /api/auth/register  — Register new user
//   POST /api/auth/login     — Login, returns JWT
//   POST /api/auth/refresh   — Refresh access token
//   POST /api/auth/logout    — Invalidate refresh token
//
// NOTE: rate limiting (express-rate-limit) should be applied to /register and /login (Spec Section 8).

const express = require('express');
const authController = require('./auth.controller');

const router = express.Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);

module.exports = router;
