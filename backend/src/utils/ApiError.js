// ApiError.js — a small typed Error so services/controllers can signal an HTTP
// status + machine-readable error code, which the centralized errorHandler
// (middleware/errorHandler.js) turns into the standard { success, message, errorCode }
// response shape (Spec Section 8).
//
// Using this keeps controllers thin: they just `next(err)` and the error handler
// decides the status code — no per-controller try/catch response shaping.

class ApiError extends Error {
  /**
   * @param {number} statusCode  HTTP status (e.g. 400, 401, 403, 404, 409)
   * @param {string} message     Human-readable message (safe to send to the client)
   * @param {string} [errorCode] Stable machine code (e.g. 'INVALID_CREDENTIALS')
   */
  constructor(statusCode, message, errorCode = 'ERROR') {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    // Marks errors we deliberately threw, so the error handler can tell them apart
    // from unexpected crashes (which should stay generic 500s, never leak internals).
    this.isOperational = true;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

module.exports = ApiError;
