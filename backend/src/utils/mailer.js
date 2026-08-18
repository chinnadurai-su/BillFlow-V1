// mailer.js — the single place that owns outbound email delivery (SendGrid, @sendgrid/mail).
//
// Sends are triggered synchronously from modules/notification/notification.service.js; centralizing
// transport here means the provider and its config live in one place while the transport-agnostic sendMail({to, subject, html, text,
// attachments}) interface stays stable — swapping providers never touches callers.
//
// IMPORT-SAFE: @sendgrid/mail is required LAZILY inside the send path, only when SENDGRID_API_KEY is
// configured. So importing this module (from the worker, or a test) never needs the package
// installed and never opens a network connection.
//
// Dev/test fallback: with no SENDGRID_API_KEY, sending is a DRY RUN that returns the composed
// message without touching the network — so local dev and tests work without a key and never crash.

const DEFAULT_FROM = 'BillFlow <no-reply@billflow.app>';

/**
 * Build a SendGrid message from our transport-agnostic input. Pure → unit-testable WITHOUT the SDK.
 * Converts Buffer attachments (what callers pass, e.g. the invoice PDF) to SendGrid's base64 format.
 * @param {object} input
 * @param {string} input.to
 * @param {string} input.subject
 * @param {string} [input.html]
 * @param {string} [input.text]
 * @param {Array}  [input.attachments] e.g. [{ filename, content: Buffer, type?, disposition? }]
 * @param {string} [input.from]
 * @returns {object} @sendgrid/mail message
 */
function buildSendGridMessage({ to, subject, html, text, attachments, from } = {}) {
  const message = {
    to,
    from: from || process.env.EMAIL_FROM || DEFAULT_FROM,
    subject,
  };
  if (html) message.html = html;
  if (text) message.text = text;

  if (Array.isArray(attachments) && attachments.length) {
    message.attachments = attachments.map((att) => ({
      // SendGrid requires base64-encoded string content; callers pass a Buffer (or string).
      content: Buffer.isBuffer(att.content)
        ? att.content.toString('base64')
        : Buffer.from(att.content || '').toString('base64'),
      filename: att.filename,
      type: att.type || 'application/pdf',
      disposition: att.disposition || 'attachment',
    }));
  }
  return message;
}

let configured = false;

/**
 * Lazily load + configure the SendGrid client (once). Returns null when no API key is set, so the
 * caller can fall back to a dry run. The require is inside here so importing this module doesn't
 * require @sendgrid/mail to be installed unless a send with a real key actually happens.
 */
function getClient() {
  if (!process.env.SENDGRID_API_KEY) return null;
  // eslint-disable-next-line global-require
  const sgMail = require('@sendgrid/mail');
  if (!configured) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    configured = true;
  }
  return sgMail;
}

/**
 * Send an email via SendGrid.
 * @param {object} message { to, subject, html?, text?, attachments? }
 * @returns {Promise<object>} SendGrid send result, or a dry-run stub when no API key is configured
 */
async function sendMail({ to, subject, html, text, attachments }) {
  const message = buildSendGridMessage({ to, subject, html, text, attachments });
  const client = getClient();
  if (!client) {
    // No API key → dry run (dev/test). Never sends, never throws.
    console.log(`[mailer] SENDGRID_API_KEY not set — skipping send to ${to} ("${subject}")`);
    return { dryRun: true, message };
  }
  return client.send(message);
}

// Test hook to reset the memoized "configured" flag between cases.
function _resetForTests() {
  configured = false;
}

module.exports = { sendMail, buildSendGridMessage, _resetForTests };
