// idempotency.middleware.js — Express middleware that short-circuits duplicate POSTs using the Idempotency-Key header.
//
// Purpose (see Spec Section 7.1): checks the IdempotencyKey collection for the request's
// "Idempotency-Key" header; if found, returns the previously stored response without re-running
// the controller; if new, lets the request proceed and caches the key + response afterward.
// Wired onto POST /api/invoices and POST /api/payments.

// Import the IdempotencyKey model.
const IdempotencyKey = require('../models/IdempotencyKey');

// This is an Express middleware — it runs BEFORE the actual controller function.
// (req, res, next) is the standard Express middleware signature.
async function idempotencyMiddleware(req, res, next) {
  // Read the "Idempotency-Key" header (Express lowercases header names).
  const key = req.headers['idempotency-key'];

  // No key → skip protection and let the request go through normally.
  if (!key) return next();

  // Has this exact key been used before?
  const existing = await IdempotencyKey.findOne({ key });

  if (existing) {
    // Already processed — return the SAME response we sent the first time,
    // without re-running the controller (no duplicate invoice/payment).
    return res.status(existing.statusCode).json(existing.response);
  }

  // --- New request we haven't seen before ---

  // Keep a reference to the real res.json so we can call it after caching.
  const originalJson = res.json.bind(res);

  // Override res.json: when the controller calls res.json(body), first persist the
  // key + response, THEN send the response to the client.
  res.json = async (body) => {
    await IdempotencyKey.create({
      key, // the same key from the header
      statusCode: res.statusCode, // whatever status the controller set (e.g. 201)
      response: body, // the actual response data the controller is sending
    });
    return originalJson(body); // now actually send the response
  };

  // Continue to the actual controller (e.g. createInvoice).
  next();
}

// Export so routes can plug this in before their controller functions.
module.exports = idempotencyMiddleware;
