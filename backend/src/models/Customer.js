// Customer.js — Mongoose model for customers that businesses bill and track balances for.
//
// Schema fields (see Spec Section 5.2):
//   _id            ObjectId
//   name           String   (required)
//   email          String   (required)
//   phone          String
//   billingAddress Object { line1, city, state, zip, country }
//   balance        Number   (default: 0)  // running outstanding balance
//   createdBy      ObjectId (ref: User)
//   createdAt      Date
//   updatedAt      Date

const mongoose = require('mongoose');

// Sub-document for the billing address — no separate _id needed.
const billingAddressSchema = new mongoose.Schema(
  {
    line1: { type: String },
    city: { type: String },
    state: { type: String },
    zip: { type: String },
    country: { type: String },
  },
  { _id: false }
);

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      // Basic format check so bad data is rejected at the DB layer, not just the frontend.
      match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
    },
    phone: { type: String },
    billingAddress: { type: billingAddressSchema, default: () => ({}) },
    balance: { type: Number, default: 0 }, // running outstanding balance (computed, never client-set — BR-2)
    // Soft-delete flag (BR-5): archiving flips this to 'archived'; records are never hard-deleted.
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Indexes for frequent queries: filter by status (active/archived) and search by name/email.
customerSchema.index({ status: 1 });
customerSchema.index({ email: 1 });
customerSchema.index({ name: 1 });

module.exports = mongoose.model('Customer', customerSchema);
