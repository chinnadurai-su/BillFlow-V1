// Invoice.js — Mongoose model for invoices (manual + recurring) issued to customers.
//
// Schema fields (see Spec Section 5.3).

const mongoose = require('mongoose');

// Line item sub-document — an invoice can have multiple products/services.
const invoiceItemSchema = new mongoose.Schema(
  {
    description: { type: String },
    quantity: { type: Number },
    unitPrice: { type: Number },
    total: { type: Number }, // = quantity * unitPrice, calculated at creation time
  },
  { _id: false }
);

const invoiceSchema = new mongoose.Schema(
  {
    // Human-readable ID shown to customers (e.g. "INV-2026-0042"). Auto-generated at creation.
    invoiceNumber: { type: String, unique: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    items: { type: [invoiceItemSchema], default: [] },
    subtotal: { type: Number }, // sum of all item totals, before tax
    tax: { type: Number },
    totalAmount: { type: Number }, // subtotal + tax — final amount owed
    status: {
      type: String,
      enum: ['draft', 'sent', 'paid', 'overdue', 'cancelled'],
      default: 'draft',
    },
    dueDate: { type: Date },
    isRecurring: { type: Boolean, default: false },
    // Only relevant when isRecurring is true; null otherwise.
    recurringCycle: {
      type: String,
      enum: ['monthly', 'quarterly', 'yearly', null],
      default: null,
    },
    pdfUrl: { type: String }, // filled in after PDFKit runs
    // "sparse" so the unique constraint only applies to docs that actually set it.
    // The real idempotency check happens via the IdempotencyKey collection (Spec Section 7.1).
    idempotencyKey: { type: String, unique: true, sparse: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Invoice', invoiceSchema);
