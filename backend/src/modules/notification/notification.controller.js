// notification.controller.js — intentionally has NO HTTP handlers.
//
// N/A: notifications are not a REST resource. Emails are sent synchronously by
// notification.service.js — called directly from invoice.service (send/remind) and from the daily
// node-cron checks (jobs/recurringInvoiceCheck, reminderCheck). There are no routes in Section 6 for
// notifications.
//
// This file exists only to keep the module's controller → service → routes shape consistent.
// If notifications ever need an HTTP surface (e.g. resend, delivery status), add handlers here.

module.exports = {};
