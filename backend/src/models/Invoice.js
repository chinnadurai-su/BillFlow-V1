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
    // For recurring TEMPLATE invoices: when the next occurrence should be generated. The daily
    // recurringInvoiceCheck cron queries invoices where nextRecurrenceAt <= now (FR-2.5 / BR-3).
    nextRecurrenceAt: { type: Date },
    // Last time a reminder email was sent for this invoice. The daily reminderCheck cron uses this
    // as a cooldown so the same invoice isn't reminded again too soon (FR-4.1).
    lastReminderAt: { type: Date },
    // "sparse" so the unique constraint only applies to docs that actually set it.
    // The real idempotency check happens via the IdempotencyKey collection (Spec Section 7.1).
    idempotencyKey: { type: String, unique: true, sparse: true },
  },
  { timestamps: true }
);

// Indexes for frequent queries (Spec / CLAUDE.md): list by customer, filter by status,
// and the overdue sweep which scans by status + dueDate.
invoiceSchema.index({ customerId: 1 });
invoiceSchema.index({ status: 1 });
invoiceSchema.index({ dueDate: 1 });
invoiceSchema.index({ status: 1, dueDate: 1 }); // supports the overdue-check query
invoiceSchema.index({ isRecurring: 1, nextRecurrenceAt: 1 }); // supports the recurring-check query

module.exports = mongoose.model('Invoice', invoiceSchema);
