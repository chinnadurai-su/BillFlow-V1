// tests/helpers/authApp.js — builds a minimal Express app wired with ONLY the auth
// module (routes + cookie parsing + centralized error handler).
//
// Why not import src/server.js directly: server.js mounts every feature router, and
// the not-yet-implemented modules (invoice/payment/...) still have scaffold code that
// throws on require. Testing auth against a focused app keeps this suite independent
// of the other modules' build state while exercising the exact same middleware stack
// (express.json, cookie-parser, error handler) that server.js uses.

const express = require('express');
const cookieParser = require('cookie-parser');

const authRoutes = require('../../src/modules/auth/auth.routes');
const errorHandler = require('../../src/middleware/errorHandler');

function buildAuthApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/auth', authRoutes);
  app.use(errorHandler);
  return app;
}

module.exports = buildAuthApp;
