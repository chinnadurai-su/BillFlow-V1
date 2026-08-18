// auth.unit.test.js — socket-free unit tests for the auth module's security-critical
// logic: JWT token helpers, the auth middleware, RBAC (requireRole), bcrypt hashing,
// and the service-layer validation paths that run BEFORE any DB access.
//
// These tests need neither a TCP port nor MongoDB, so they run in any environment
// (including CI sandboxes that block sockets). The DB-backed HTTP flows live in
// auth.test.js (register/login/refresh/logout over supertest + mongodb-memory-server).

const bcrypt = require('bcrypt');

// Mock the User model + the SendGrid mailer so register()'s welcome-email path can be exercised
// without a DB or network. (jest.mock is hoisted above the requires below.) The pre-existing
// validation-path tests never reach these mocks, so they're unaffected.
jest.mock('../src/models/User', () => ({ findOne: jest.fn(), create: jest.fn(), findById: jest.fn() }));
jest.mock('../src/utils/mailer', () => ({ sendMail: jest.fn() }));

const {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} = require('../src/utils/tokens');
const authMiddleware = require('../src/middleware/auth.middleware');
const { requireRole } = require('../src/middleware/auth.middleware');
const authService = require('../src/modules/auth/auth.service');
const ApiError = require('../src/utils/ApiError');
const User = require('../src/models/User');
const { sendMail } = require('../src/utils/mailer');
const { welcomeEmailTemplate } = require('../src/utils/emailTemplates');

// A fake user with the fields the token helpers read.
const fakeUser = { _id: '507f1f77bcf86cd799439011', role: 'staff', email: 'u@example.com' };

describe('utils/tokens', () => {
  it('signs an access token that verifies and carries sub, role, and email', () => {
    const token = signAccessToken(fakeUser);
    const decoded = verifyAccessToken(token);

    expect(decoded.sub).toBe(String(fakeUser._id));
    expect(decoded.role).toBe('staff');
    expect(decoded.email).toBe('u@example.com');
    // exp/iat present → the token is genuinely time-limited (Spec Section 8).
    expect(decoded.exp).toEqual(expect.any(Number));
  });

  it('signs a refresh token that verifies and carries only the user id (minimal payload)', () => {
    const token = signRefreshToken(fakeUser);
    const decoded = verifyRefreshToken(token);

    expect(decoded.sub).toBe(String(fakeUser._id));
    // Refresh token must NOT embed the role (role is re-read from DB on refresh).
    expect(decoded.role).toBeUndefined();
  });

  it('rejects a token verified with the wrong secret (access secret != refresh secret)', () => {
    const accessToken = signAccessToken(fakeUser);
    // Verifying an access token with the refresh secret must fail.
    expect(() => verifyRefreshToken(accessToken)).toThrow();
  });

  it('rejects a tampered token', () => {
    const token = signAccessToken(fakeUser);
    const tampered = `${token}tamper`;
    expect(() => verifyAccessToken(tampered)).toThrow();
  });
});

describe('auth.middleware — token verification', () => {
  // Minimal Express req/res/next stubs — no sockets involved.
  function run(headers) {
    const req = { headers: headers || {} };
    let nextArg;
    const next = (arg) => {
      nextArg = arg;
    };
    authMiddleware(req, {}, next);
    return { req, nextArg };
  }

  it('calls next() with a 401 ApiError when the Authorization header is missing', () => {
    const { nextArg } = run({});
    expect(nextArg).toBeInstanceOf(ApiError);
    expect(nextArg.statusCode).toBe(401);
    expect(nextArg.errorCode).toBe('NO_TOKEN');
  });

  it('calls next() with a 401 ApiError for a non-Bearer scheme', () => {
    const { nextArg } = run({ authorization: 'Basic abc' });
    expect(nextArg.statusCode).toBe(401);
    expect(nextArg.errorCode).toBe('NO_TOKEN');
  });

  it('calls next() with INVALID_TOKEN for a garbage bearer token', () => {
    const { nextArg } = run({ authorization: 'Bearer not-a-jwt' });
    expect(nextArg.statusCode).toBe(401);
    expect(nextArg.errorCode).toBe('INVALID_TOKEN');
  });

  it('attaches req.user (id, role, email) and calls next() with no error for a valid token', () => {
    const token = signAccessToken(fakeUser);
    const { req, nextArg } = run({ authorization: `Bearer ${token}` });

    expect(nextArg).toBeUndefined(); // next() called with no error
    expect(req.user).toEqual({
      id: String(fakeUser._id),
      role: 'staff',
      email: 'u@example.com',
    });
  });
});

describe('auth.middleware — requireRole (RBAC, BR-5)', () => {
  function run(user, ...roles) {
    const req = { user };
    let nextArg;
    const next = (arg) => {
      nextArg = arg;
    };
    requireRole(...roles)(req, {}, next);
    return nextArg;
  }

  it('lets an allowed role through (next with no error)', () => {
    const nextArg = run({ id: '1', role: 'admin' }, 'admin');
    expect(nextArg).toBeUndefined();
  });

  it('forbids a disallowed role with a 403 ApiError', () => {
    const nextArg = run({ id: '1', role: 'staff' }, 'admin');
    expect(nextArg).toBeInstanceOf(ApiError);
    expect(nextArg.statusCode).toBe(403);
    expect(nextArg.errorCode).toBe('FORBIDDEN');
  });

  it('rejects with 401 when no user is attached (middleware misordering)', () => {
    const nextArg = run(undefined, 'admin');
    expect(nextArg.statusCode).toBe(401);
    expect(nextArg.errorCode).toBe('NO_TOKEN');
  });
});

describe('bcrypt password hashing (Spec 7.3)', () => {
  it('hashes a password so the raw value is never recoverable, and compare works', async () => {
    const hash = await bcrypt.hash('password123', 4);
    expect(hash).not.toBe('password123');
    expect(hash).toMatch(/^\$2[aby]\$/);
    expect(await bcrypt.compare('password123', hash)).toBe(true);
    expect(await bcrypt.compare('wrong', hash)).toBe(false);
  });
});

describe('auth.service — validation paths (no DB access)', () => {
  // These inputs are rejected BEFORE any Mongoose query runs, so no DB is needed.
  it('register throws 400 when email/password are missing', async () => {
    await expect(authService.register({})).rejects.toMatchObject({
      statusCode: 400,
      errorCode: 'VALIDATION_ERROR',
    });
  });

  it('register throws 400 for a too-short password', async () => {
    await expect(
      authService.register({ email: 'a@b.com', password: 'short' })
    ).rejects.toMatchObject({ statusCode: 400, errorCode: 'VALIDATION_ERROR' });
  });

  it('login throws 400 when credentials are missing', async () => {
    await expect(authService.login({})).rejects.toMatchObject({
      statusCode: 400,
      errorCode: 'VALIDATION_ERROR',
    });
  });

  it('refresh throws 401 when no token is provided', async () => {
    await expect(authService.refresh()).rejects.toMatchObject({
      statusCode: 401,
      errorCode: 'NO_REFRESH_TOKEN',
    });
  });

  it('refresh throws 401 for an invalid token', async () => {
    await expect(authService.refresh('garbage')).rejects.toMatchObject({
      statusCode: 401,
      errorCode: 'INVALID_REFRESH_TOKEN',
    });
  });

  it('logout is a safe no-op (resolves) when no token is provided', async () => {
    await expect(authService.logout()).resolves.toEqual({ success: true });
  });
});

describe('register — welcome email (SendGrid via mailer.sendMail, best-effort)', () => {
  // A stand-in for the freshly created User doc (register returns user.toJSON()).
  const newUser = {
    _id: 'u1',
    name: 'Jane Doe',
    email: 'jane@example.com',
    role: 'staff',
    toJSON() {
      return { _id: this._id, name: this.name, email: this.email, role: this.role };
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    User.findOne.mockResolvedValue(null); // email not already taken
    User.create.mockResolvedValue(newUser);
  });

  it('sends the welcome email with { to, subject, html } derived from welcomeEmailTemplate()', async () => {
    sendMail.mockResolvedValue({ dryRun: true });

    const result = await authService.register({
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'password123',
    });

    expect(result.email).toBe('jane@example.com');
    const expected = welcomeEmailTemplate(newUser);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledWith({
      to: 'jane@example.com',
      subject: expected.subject,
      html: expected.html,
    });
    // Sanity: subject actually greets the user by name.
    expect(expected.subject).toBe('Welcome to BillFlow, Jane Doe!');
  });

  it('still returns a successful registration when sendMail throws (never depends on email)', async () => {
    sendMail.mockRejectedValue(new Error('SendGrid 503'));

    const result = await authService.register({
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'password123',
    });

    // Registration succeeded despite the email failure.
    expect(result).toMatchObject({ email: 'jane@example.com', role: 'staff' });
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
});
