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
    name: { type: String, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Never store raw passwords — only the bcrypt hash (Spec Section 7.3 / 8).
    // select: false keeps the hash OUT of every query result by default, so it can
    // never accidentally leak through an API response or a log. Login explicitly
    // opts back in with .select('+passwordHash') when it needs to compare.
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['admin', 'staff'], default: 'staff' },
  },
  // timestamps: true auto-manages createdAt / updatedAt.
  { timestamps: true }
);

// Defense-in-depth: even if a document that loaded passwordHash gets serialized
// (res.json, logging), strip the hash and internal version key from the output.
userSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
