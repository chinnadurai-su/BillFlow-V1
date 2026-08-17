// auth.test.js — placeholder tests for the auth module (Spec Section 6 — Auth).
// Uses it.todo so the suite is valid (won't fail) until the real tests land.

describe('auth module', () => {
  // TODO: test register / login / refresh / logout flows
  it.todo('registers a new user and hashes the password (never stores raw password)');
  it.todo('logs in with valid credentials and returns a JWT access token');
  it.todo('sets an httpOnly refresh-token cookie on login (Spec Section 8)');
  it.todo('rejects invalid credentials with 401');
  it.todo('refresh rotates the refresh token and issues a new access token');
  it.todo('logout invalidates the refresh token');
});
