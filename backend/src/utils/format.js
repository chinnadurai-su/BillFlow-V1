// format.js — small, dependency-free formatting helpers shared by the PDF generator
// (utils/pdfGenerator.js) and the email templates (utils/emailTemplates.js).
//
// Everything here is PURE and deterministic (no locale/timezone drift): money is
// formatted manually and dates are rendered in UTC, so the same input always yields
// the same string. That keeps the PDF/email output stable and unit-testable without
// a DB, a socket, or a filesystem.

// Month abbreviations for the deterministic date formatter (avoids Intl/locale variance).
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Format a numeric amount as currency, e.g. 1234.5 -> "$1,234.50".
 * The currency symbol comes from CURRENCY_SYMBOL (default "$") — BillFlow is
 * single-currency per deployment (BRD Section 9), so a symbol is sufficient.
 * @param {number} amount
 * @param {string} [symbol]
 * @returns {string}
 */
function formatMoney(amount, symbol = process.env.CURRENCY_SYMBOL || '$') {
  const n = Number(amount);
  const safe = Number.isFinite(n) ? n : 0;
  const sign = safe < 0 ? '-' : '';
  const [intPart, decPart] = Math.abs(safe).toFixed(2).split('.');
  // Insert thousands separators into the integer part.
  const withSeparators = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${symbol}${withSeparators}.${decPart}`;
}

/**
 * Format a Date (or date-like value) as "Aug 17, 2026" in UTC.
 * Returns an em dash for missing/invalid dates so templates never render "Invalid Date".
 * @param {Date|string|number|null|undefined} value
 * @returns {string}
 */
function formatDate(value) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

/**
 * Escape a value for safe interpolation into HTML email bodies. Customer names,
 * emails, and line-item descriptions are user-controlled, so escaping them prevents
 * HTML/script injection into the rendered email (defense-in-depth).
 * @param {*} value
 * @returns {string}
 */
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = { formatMoney, formatDate, escapeHtml };
