// withTransaction.js — run a function inside a MongoDB multi-document transaction (Spec 7.2).
//
// Every BillFlow write that touches more than one collection (e.g. Invoice + Customer + AuditLog)
// MUST be atomic (CLAUDE.md / Spec 7.2). This helper standardizes the session lifecycle so callers
// just write their logic against the provided session and get all-or-nothing semantics.
//
// NOTE: transactions require a replica set. MongoDB Atlas is always a replica set; for local dev
// run a single-node replica set (tests use mongodb-memory-server's replSet). A standalone mongod
// will reject transactions by design — we do NOT silently fall back, because losing atomicity on
// financial writes would be worse than failing loudly.

const mongoose = require('mongoose');

/**
 * @template T
 * @param {(session: import('mongoose').ClientSession) => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withTransaction(fn) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

module.exports = withTransaction;
