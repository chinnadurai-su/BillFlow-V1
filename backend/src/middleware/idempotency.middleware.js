// idempotency.middleware.js — short-circuits duplicate POSTs using the Idempotency-Key header
// (Spec Section 7.1). Wired onto POST /api/invoices and POST /api/payments.
//
// This is a hardened version of the idempotent-endpoint skill's baseline. Two fixes over the
// naive pattern:
//   1. Only SUCCESSFUL (2xx) responses are cached. Caching a 4xx/5xx would replay a transient
//      failure forever and permanently block a legitimate retry with the same key.
//   2. The cache write is best-effort and tolerates the concurrent-duplicate race (E11000) —
//      it never blocks or fails the response. The REAL duplicate-write guarantee comes from the
//      unique `idempotencyKey` index on the Invoice/Payment documents (set in the services), so
//      even if two requests race past this cache, the second insert is rejected by the DB.

const IdempotencyKey = require('../models/IdempotencyKey');

async function idempotencyMiddleware(req, res, next) {
  // Header names are lowercased by Express.
  const key = req.headers['idempotency-key'];

  // No key → skip protection and let the request proceed (Spec 7.1).
  if (!key) return next();

  let existing;
  try {
    existing = await IdempotencyKey.findOne({ key });
  } catch (err) {
    // A DB error looking up the key is a real error — surface it, don't swallow it.
    return next(err);
  }

  if (existing) {
    // Seen before → replay the exact original response; the controller never runs again.
    return res.status(existing.statusCode).json(existing.response);
  }

  // New request: wrap res.json so we can cache the response after the controller sends it.
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    // Send to the client FIRST (don't block the response on a DB write).
    const result = originalJson(body);

    // Cache only successful responses; persist in the background.
    if (res.statusCode >= 200 && res.statusCode < 300) {
      IdempotencyKey.create({ key, statusCode: res.statusCode, response: body }).catch((err) => {
        // E11000 = a concurrent request already cached this key → nothing to do.
        if (!err || err.code !== 11000) {
          console.error('[idempotency] failed to cache response:', err && err.message);
        }
      });
    }
    return result;
  };

  next();
}

module.exports = idempotencyMiddleware;
