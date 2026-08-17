// IdempotencyKey.js — Mongoose model storing idempotency keys + cached responses to prevent duplicate writes.
//
// This collection stores ONLY idempotency keys and their cached responses — no business data.
// See Spec Section 7.1.

// Import Mongoose — the ODM (Object Document Mapper) we use to talk to MongoDB
const mongoose = require('mongoose');

// Schema definition for the IdempotencyKey collection
const idempotencyKeySchema = new mongoose.Schema({
  // The unique key sent by the client in the "Idempotency-Key" request header.
  // "unique: true" means MongoDB itself will reject a duplicate insert of the same key.
  key: { type: String, required: true, unique: true },

  // The HTTP status code returned the first time this request was processed (e.g. 201).
  statusCode: { type: Number, required: true },

  // The actual response body sent back the first time. "Mixed" so it can hold any shape.
  response: { type: mongoose.Schema.Types.Mixed, required: true },

  // "expires: 86400" creates a TTL index — MongoDB deletes this doc 24h after createdAt.
  // Idempotency keys only protect against short-term retries, not long-term storage.
  createdAt: { type: Date, default: Date.now, expires: 86400 },
});

// Export the compiled model so the middleware can import and use it.
module.exports = mongoose.model('IdempotencyKey', idempotencyKeySchema);
