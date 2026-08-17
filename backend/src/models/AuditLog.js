// AuditLog.js — Mongoose model capturing before/after state of sensitive domain operations for compliance.
//
// Schema fields (see Spec Section 5.5).
//
// Note (Spec 7.3): never log passwords or payment card data in beforeState/afterState.

const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  action: { type: String, required: true }, // e.g. 'INVOICE_CREATED', 'PAYMENT_UPDATED'
  entityType: { type: String }, // 'Invoice', 'Customer', 'Payment'
  entityId: { type: mongoose.Schema.Types.ObjectId },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // Mixed — captures an arbitrary snapshot of the entity before/after the change.
  beforeState: { type: mongoose.Schema.Types.Mixed },
  afterState: { type: mongoose.Schema.Types.Mixed },
  timestamp: { type: Date, default: Date.now },
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
