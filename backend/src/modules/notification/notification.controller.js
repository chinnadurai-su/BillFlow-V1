// notification.controller.js — intentionally has NO HTTP handlers.
//
// N/A: this module is triggered by BullMQ jobs, not by direct API calls. There are no routes
// in Section 6 for notifications — the worker (workers/invoice.worker.js) invokes
// notification.service.js to send emails after PDF generation (Spec Section 7.4).
//
// This file exists only to keep the module's controller → service → routes shape consistent.
// If notifications ever need an HTTP surface (e.g. resend, delivery status), add handlers here.

module.exports = {};
