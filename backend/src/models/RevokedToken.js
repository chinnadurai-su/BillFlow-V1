// RevokedToken.js — Mongoose model implementing the refresh-token denylist used by logout.
//
// Refresh tokens are stateless JWTs, so the only way to "invalidate" one before its
// natural 7-day expiry (see Spec Section 8) is to remember that it was revoked.
// This collection stores a HASH of each revoked refresh token — never the raw token
// (project rule: never log/store tokens) — until the moment the token would have expired
// anyway, at which point the TTL index removes the row automatically.

const mongoose = require('mongoose');

const revokedTokenSchema = new mongoose.Schema({
  // SHA-256 hash of the revoked refresh token. Hashing (not the raw token) keeps the
  // denylist safe to store, and "unique: true" makes a repeated logout a no-op insert.
  tokenHash: { type: String, required: true, unique: true },

  // Optional: which user this token belonged to — handy for auditing/debugging.
  // Not required, because the current refresh payload may not carry a user id yet.
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // The token's own expiry (from its `exp` claim). "expires: 0" makes this a TTL index
  // with expireAfterSeconds = 0, so MongoDB deletes the row once expiresAt is in the past.
  // There's no point denylisting a token past the moment it would be rejected anyway.
  expiresAt: { type: Date, required: true, expires: 0 },
});

module.exports = mongoose.model('RevokedToken', revokedTokenSchema);
