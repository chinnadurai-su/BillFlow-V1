// Payment.js — Mongoose model for payments recorded against invoices.
//
// Schema fields (see Spec Section 5.4).

const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true },
    // Denormalized so we don't always need to look up the invoice just to know who paid.
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    amount: { type: Number, required: true },
    method: { type: String, enum: ['card', 'bank_transfer', 'cash', 'other'] },
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
    transactionRef: { type: String }, // external reference from payment gateway (if any)
    // "sparse" — unique only for docs that set it. See Spec Section 7.1.
    idempotencyKey: { type: String, unique: true, sparse: true },
  },
  // Spec 5.4 lists only createdAt (no updatedAt) for Payment.
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.model('Payment', paymentSchema);
