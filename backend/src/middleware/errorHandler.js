// errorHandler.js — Centralized Express error-handling middleware producing a consistent
// error response shape { success, message, errorCode } (Spec Section 8).
//
// All controllers forward errors here via next(err). Operational errors (ApiError) carry
// their own statusCode/errorCode; common Mongoose errors are mapped to friendly 4xx codes;
// anything else is treated as an unexpected 500 without leaking internals to the client.

// Express recognizes error-handling middleware by its 4-arg signature (err, req, res, next).
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let errorCode = err.errorCode || 'INTERNAL_ERROR';

  // Mongoose schema validation failures → 400.
  if (err.name === 'ValidationError') {
    status = 400;
    errorCode = 'VALIDATION_ERROR';
    message = Object.values(err.errors || {})
      .map((e) => e.message)
      .join('; ') || 'Validation failed';
  }

  // Duplicate unique key (e.g. email already registered) → 409.
  if (err.code === 11000) {
    status = 409;
    errorCode = 'DUPLICATE_KEY';
    message = 'A record with that value already exists';
  }

  // Malformed ObjectId in a route param → 400 (instead of a confusing 500).
  if (err.name === 'CastError') {
    status = 400;
    errorCode = 'INVALID_ID';
    message = 'Invalid identifier';
  }

  // Never leak internals for unexpected 500s. Log the real error server-side,
  // return a generic message to the client.
  if (status >= 500) {
    console.error('[error]', err);
    message = 'Internal Server Error';
    errorCode = 'INTERNAL_ERROR';
  }

  return res.status(status).json({ success: false, message, errorCode });
}

module.exports = errorHandler;
