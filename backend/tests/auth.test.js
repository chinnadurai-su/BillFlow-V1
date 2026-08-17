// auth.test.js — integration tests for the auth module (Spec Section 6 — Auth, Section 8).
//
// Covers register / login / refresh / logout over real HTTP (supertest) against an
// in-memory MongoDB, plus the auth middleware + role-based access control (RBAC).
// Rules (testing-agent): each function has a happy path and a failure path; assert
// behavior, not implementation; never touch the real Atlas cluster.

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');

const buildAuthApp = require('./helpers/authApp');
const User = require('../src/models/User');
const RevokedToken = require('../src/models/RevokedToken');
const authMiddleware = require('../src/middleware/auth.middleware');
const { requireRole } = require('../src/middleware/auth.middleware');
const errorHandler = require('../src/middleware/errorHandler');
const { connect, clearDatabase, closeDatabase } = require('./helpers/db');

// These integration tests need a TCP socket: mongodb-memory-server starts a real mongod
// on a port, and supertest binds an ephemeral port per request. Some sandboxed CI/dev
// environments block listen()/connect() entirely (EPERM), where these simply cannot run.
// Set BILLFLOW_SKIP_DB_TESTS=1 to skip them there (they show as "skipped", not passed).
// The socket-free security logic is fully covered by auth.unit.test.js regardless.
const describeDb = process.env.BILLFLOW_SKIP_DB_TESTS ? describe.skip : describe;

describeDb('auth module (DB-backed integration)', () => {
  // Auth-only app (see helpers/authApp.js for why we don't import src/server.js here).
  const app = buildAuthApp();

  beforeAll(async () => {
    await connect();
  });

  afterEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  // Convenience: register a user directly through the API.
  function registerUser(overrides = {}) {
    return request(app)
      .post('/api/auth/register')
      .send({ name: 'Test User', email: 'test@example.com', password: 'password123', ...overrides });
  }

  // Pull the refreshToken cookie string out of a response's Set-Cookie header.
  function getRefreshCookie(res) {
    const cookies = res.headers['set-cookie'] || [];
    return cookies.find((c) => c.startsWith('refreshToken='));
  }

  describe('POST /api/auth/register', () => {
  it('registers a new user and returns it WITHOUT the password hash', async () => {
    const res = await registerUser();

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe('test@example.com');
    // Never leak the hash (or raw password) in the response.
    expect(res.body.data.passwordHash).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('password123');
    // Defaults to the least-privileged role (Spec/BRD Section 5).
    expect(res.body.data.role).toBe('staff');
  });

  it('hashes the password with bcrypt — never stores the raw password', async () => {
    await registerUser();

    // Explicitly opt back into the select:false field to inspect what was stored.
    const user = await User.findOne({ email: 'test@example.com' }).select('+passwordHash');
    expect(user.passwordHash).toBeDefined();
    expect(user.passwordHash).not.toBe('password123');
    // bcrypt hashes start with $2a$/$2b$.
    expect(user.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it('rejects a duplicate email with 409', async () => {
    await registerUser();
    const res = await registerUser();

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.errorCode).toBe('EMAIL_TAKEN');
  });

  it('rejects a missing password with 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'x@example.com' });

    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('VALIDATION_ERROR');
  });

  it('does not let the client self-assign an elevated role via public registration (RBAC critical)', async () => {
    // Even explicitly requesting role:'admin' must be ignored — public registration always
    // yields the default 'staff' role (prevents privilege escalation).
    const res = await registerUser({ email: 'sneaky@example.com', role: 'admin' });

    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('staff');
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await registerUser();
  });

  it('logs in with valid credentials, returns an access token, and sets an httpOnly refresh cookie', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.user.email).toBe('test@example.com');
    expect(res.body.data.user.passwordHash).toBeUndefined();

    const refreshCookie = getRefreshCookie(res);
    expect(refreshCookie).toBeDefined();
    // The refresh cookie must be httpOnly (Spec Section 8).
    expect(refreshCookie.toLowerCase()).toContain('httponly');
  });

  it('rejects invalid credentials with 401 (same message for unknown email or wrong password)', async () => {
    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'wrongpassword' });
    const unknownEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'password123' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.errorCode).toBe('INVALID_CREDENTIALS');
    // Identical response prevents user enumeration.
    expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
  });
});

describe('POST /api/auth/refresh', () => {
  async function loginAndGetCookie() {
    await registerUser();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'password123' });
    return getRefreshCookie(res);
  }

  it('rotates the refresh token and issues a new access token', async () => {
    const cookie = await loginAndGetCookie();

    const res = await request(app).post('/api/auth/refresh').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));

    // Rotation issues a NEW refresh cookie...
    const newCookie = getRefreshCookie(res);
    expect(newCookie).toBeDefined();

    // ...and the OLD refresh token is now denylisted (can't be reused).
    const reuse = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(reuse.status).toBe(401);
    expect(reuse.body.errorCode).toBe('INVALID_REFRESH_TOKEN');
  });

  it('rejects a request with no refresh cookie (401)', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
    expect(res.body.errorCode).toBe('NO_REFRESH_TOKEN');
  });

  it('rejects a tampered/garbage refresh token (401)', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', 'refreshToken=not-a-real-jwt');
    expect(res.status).toBe(401);
    expect(res.body.errorCode).toBe('INVALID_REFRESH_TOKEN');
  });
});

describe('POST /api/auth/logout', () => {
  it('invalidates the refresh token so it can no longer be refreshed', async () => {
    await registerUser();
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'password123' });
    const cookie = getRefreshCookie(loginRes);

    const logoutRes = await request(app).post('/api/auth/logout').set('Cookie', cookie);
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.success).toBe(true);

    // The token is recorded in the denylist...
    const revokedCount = await RevokedToken.countDocuments();
    expect(revokedCount).toBe(1);

    // ...and refresh with that same token now fails.
    const refreshRes = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(refreshRes.status).toBe(401);
  });

  it('is a safe no-op when called without a refresh cookie', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('auth middleware + RBAC (Spec Section 8, BRD Section 5)', () => {
  // A tiny app exercising the middleware directly: one route needing any authenticated
  // user, one needing the admin role (BR-5). This keeps the test independent of feature
  // routes that aren't built yet.
  let guardedApp;

  beforeAll(() => {
    guardedApp = express();
    guardedApp.use(express.json());
    guardedApp.use(cookieParser());
    guardedApp.get('/me', authMiddleware, (req, res) => res.json({ user: req.user }));
    guardedApp.delete(
      '/admin-only',
      authMiddleware,
      requireRole('admin'),
      (_req, res) => res.json({ ok: true })
    );
    guardedApp.use(errorHandler);
  });

  async function tokenFor(role) {
    await registerUser({ email: `${role}@example.com` });
    // Registration always creates a 'staff' user (role is never client-settable). To test the
    // admin path, promote the user directly in the DB — mirrors how admins are provisioned
    // out of band (seed/DB), never via the public register endpoint.
    if (role === 'admin') {
      await User.updateOne({ email: `${role}@example.com` }, { role: 'admin' });
    }
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: `${role}@example.com`, password: 'password123' });
    return login.body.data.accessToken;
  }

  it('rejects requests with no Authorization header (401)', async () => {
    const res = await request(guardedApp).get('/me');
    expect(res.status).toBe(401);
    expect(res.body.errorCode).toBe('NO_TOKEN');
  });

  it('rejects an invalid/garbage token (401)', async () => {
    const res = await request(guardedApp).get('/me').set('Authorization', 'Bearer garbage');
    expect(res.status).toBe(401);
    expect(res.body.errorCode).toBe('INVALID_TOKEN');
  });

  it('attaches req.user (id, role, email) for a valid access token', async () => {
    const token = await tokenFor('staff');
    const res = await request(guardedApp).get('/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('staff');
    expect(res.body.user.email).toBe('staff@example.com');
    expect(res.body.user.id).toEqual(expect.any(String));
  });

  it('forbids a staff user from an admin-only action (403) — BR-5', async () => {
    const token = await tokenFor('staff');
    const res = await request(guardedApp)
      .delete('/admin-only')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('FORBIDDEN');
  });

  it('allows an admin user to perform an admin-only action', async () => {
    const token = await tokenFor('admin');
    const res = await request(guardedApp)
      .delete('/admin-only')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
});
