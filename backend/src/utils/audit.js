// audit.js — helper for writing AuditLog entries for sensitive domain operations
// (create/update/delete on Invoice, Customer, Payment) per BRD FR-6.1 / Spec 7.3.
//
// Two jobs:
//   - writeAudit(...) persists an AuditLog entry, optionally inside a transaction session so
//     the audit row commits atomically with the business write (Spec 7.2).
//   - sanitize(...) strips sensitive fields from before/after snapshots so passwords, tokens,
//     or card data can NEVER land in the audit trail (Spec 7.3 / BRD FR-6.2). Pure + testable.

const AuditLog = require('../models/AuditLog');

// Field names that must never appear in an audit snapshot, whatever entity they came from.
const SENSITIVE_KEYS = [
  'password', 'passwordHash', 'token', 'refreshToken', 'accessToken',
  'cardNumber', 'cardNo', 'cvv', 'cvc', 'idempotencyKey',
];

/**
 * Return a shallow copy of a state object with sensitive keys removed. Accepts a Mongoose
 * document (calls toObject) or a plain object. Non-objects pass through unchanged.
 * @param {*} state
 * @returns {*}
 */
function sanitize(state) {
  if (!state || typeof state !== 'object') return state;
  const plain = typeof state.toObject === 'function' ? state.toObject() : state;
  const clone = {};
  for (const [key, value] of Object.entries(plain)) {
    if (SENSITIVE_KEYS.includes(key)) continue;
    clone[key] = value;
  }
  return clone;
}

/**
 * Write an AuditLog entry. Pass `session` to enlist it in an open transaction so the audit
 * row is committed atomically with the change it records.
 * @param {object} params
 * @param {string} params.action        e.g. 'CUSTOMER_CREATED', 'INVOICE_CANCELLED'
 * @param {string} params.entityType    'Invoice' | 'Customer' | 'Payment'
 * @param {*} params.entityId
 * @param {*} [params.performedBy]       req.user.id
 * @param {*} [params.beforeState]
 * @param {*} [params.afterState]
 * @param {import('mongoose').ClientSession} [params.session]
 * @returns {Promise<object>} the created AuditLog document
 */
async function writeAudit({ action, entityType, entityId, performedBy, beforeState, afterState, session }) {
  // create() must receive an array when a session is supplied.
  const [doc] = await AuditLog.create(
    [{
      action,
      entityType,
      entityId,
      performedBy,
      beforeState: sanitize(beforeState),
      afterState: sanitize(afterState),
    }],
    { session }
  );
  return doc;
}

module.exports = { writeAudit, sanitize, SENSITIVE_KEYS };
