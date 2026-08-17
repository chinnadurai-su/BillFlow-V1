// Counter.js — atomic sequence generator, used for human-readable sequential invoice numbers.
//
// Why a dedicated collection: invoiceNumber must be unique and readable (e.g. "INV-2026-0042").
// A findByIdAndUpdate($inc) is atomic even under concurrency, so two invoices created at the
// same instant get distinct sequence values without a race (safer than counting existing docs).
// One counter document per scope (e.g. _id "invoice-2026") keeps sequences per-year.

const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  // Scope key, e.g. "invoice-2026".
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

/**
 * Atomically increment and return the next sequence value for a scope.
 * Pass the transaction `session` so the increment participates in the invoice-create txn
 * (if that txn aborts, the increment rolls back too — a skipped number is harmless).
 * @param {string} id       scope key, e.g. "invoice-2026"
 * @param {import('mongoose').ClientSession} [session]
 * @returns {Promise<number>}
 */
counterSchema.statics.next = async function next(id, session) {
  const doc = await this.findByIdAndUpdate(
    id,
    { $inc: { seq: 1 } },
    { new: true, upsert: true, session }
  );
  return doc.seq;
};

module.exports = mongoose.model('Counter', counterSchema);
