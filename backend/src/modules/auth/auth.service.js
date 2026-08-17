// auth.service.js — Business logic for authentication (user creation, password hashing, JWT issue/verify/refresh).
//
// Purpose (see Spec Section 8): issues JWT access tokens (15 min) + refresh tokens (7 days),
// verifies credentials, and handles refresh-token rotation/invalidation.
//
// TODO: implement business logic
//   - hash password with bcrypt on registration; never store the raw password (Spec 7.3)
//   - validate credentials on login (bcrypt.compare against User.passwordHash)
//   - generate JWT access (JWT_ACCESS_SECRET, 15m) + refresh (JWT_REFRESH_SECRET, 7d) tokens
//   - verify/rotate refresh tokens; invalidate on logout

// TODO: implement register/login/token helpers and export them here.
module.exports = {};
