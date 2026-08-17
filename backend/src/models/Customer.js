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
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String },
    billingAddress: { type: billingAddressSchema, default: () => ({}) },
    balance: { type: Number, default: 0 }, // running outstanding balance
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Customer', customerSchema);
