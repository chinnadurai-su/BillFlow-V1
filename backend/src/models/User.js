// User.js — Mongoose model for application users (admin/staff) who log in and manage BillFlow.
//
// Schema fields (see Spec Section 5.1):
//   _id          ObjectId
//   name         String
//   email        String   (unique, required)
//   passwordHash String
//   role         String   (enum: 'admin', 'staff')
//   createdAt    Date
//   updatedAt    Date

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Never store raw passwords — only the bcrypt hash (Spec Section 7.3 / 8).
    passwordHash: { type: String },
    role: { type: String, enum: ['admin', 'staff'], default: 'staff' },
  },
  // timestamps: true auto-manages createdAt / updatedAt.
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
