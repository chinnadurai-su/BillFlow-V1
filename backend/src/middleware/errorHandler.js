// errorHandler.js — Centralized Express error-handling middleware producing a consistent error response shape.
//
// Purpose (see Spec Section 8): catches errors from all routes and returns the standard shape
// { success, message, errorCode }.

// TODO: centralized error handler, return { success: false, message, errorCode } shape per Section 8

// Express recognizes error-handling middleware by its 4-arg signature (err, req, res, next).
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // TODO: centralized error handler, return { success: false, message, errorCode } shape per Section 8
  const status = err.statusCode || 500;
  return res.status(status).json({
    success: false,
    message: err.message || 'Internal Server Error',
    errorCode: err.errorCode || 'INTERNAL_ERROR',
  });
}

module.exports = errorHandler;
