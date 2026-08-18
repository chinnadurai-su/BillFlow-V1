// emailTemplates.js — builds the subject + HTML/text bodies for BillFlow emails (Spec Section 2).
//
// Two templates:
//   - invoiceSentTemplate(invoice, customer)      → sent when an invoice is issued (FR-4.2)
//   - paymentReminderTemplate(invoice, customer)  → reminder for due/overdue invoices (FR-4.1)
//
// Each returns { subject, html, text } ready to hand to Nodemailer. Actual sending (transport,
// from/to, PDF attachment) lives in modules/notification — templates stay pure and side-effect free
// so they're trivially unit-testable and can never accidentally send.
//
// Security (Spec 7.3): every customer-controlled value (name, email, item descriptions) is HTML-escaped
// before interpolation. These models hold no passwords or card data, and none is ever added here.

const { formatMoney, formatDate, escapeHtml } = require('./format');

const COMPANY_NAME = () => process.env.COMPANY_NAME || 'BillFlow';

// Shared inline-styled shell. No external images/CSS (project requirement) so it renders
// consistently in every mail client and has no network dependencies.
function layout({ heading, bodyHtml, accent = '#4f46e5' }) {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="background:${accent};padding:20px 32px;">
                <span style="color:#ffffff;font-size:20px;font-weight:bold;">${escapeHtml(COMPANY_NAME())}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px;font-size:18px;color:#111827;">${escapeHtml(heading)}</h1>
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px;">
                This is an automated message from ${escapeHtml(COMPANY_NAME())}. Please do not reply directly to this email.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// Small "invoice facts" block reused by both templates.
function invoiceSummaryHtml(invoice) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;font-size:14px;color:#374151;">
    <tr><td style="padding:2px 16px 2px 0;color:#6b7280;">Invoice #</td><td style="padding:2px 0;">${escapeHtml(invoice.invoiceNumber || '—')}</td></tr>
    <tr><td style="padding:2px 16px 2px 0;color:#6b7280;">Amount due</td><td style="padding:2px 0;font-weight:bold;">${escapeHtml(formatMoney(invoice.totalAmount))}</td></tr>
    <tr><td style="padding:2px 16px 2px 0;color:#6b7280;">Due date</td><td style="padding:2px 0;">${escapeHtml(formatDate(invoice.dueDate))}</td></tr>
  </table>`;
}

/**
 * Email for a newly issued invoice (FR-4.2). The PDF is attached by the sender.
 * @param {object} invoice
 * @param {object} customer
 * @returns {{ subject: string, html: string, text: string }}
 */
function invoiceSentTemplate(invoice = {}, customer = {}) {
  const name = customer.name || 'there';
  const number = invoice.invoiceNumber || 'your invoice';
  const subject = `Invoice ${invoice.invoiceNumber || ''} from ${COMPANY_NAME()}`.trim();

  const bodyHtml = `
    <p style="margin:0 0 12px;font-size:14px;">Hi ${escapeHtml(name)},</p>
    <p style="margin:0 0 12px;font-size:14px;">
      Thank you for your business. Your invoice from ${escapeHtml(COMPANY_NAME())} is ready.
      A PDF copy is attached to this email for your records.
    </p>
    ${invoiceSummaryHtml(invoice)}
    <p style="margin:16px 0 0;font-size:14px;">Please arrange payment by the due date shown above.</p>`;

  const text = [
    `Hi ${name},`,
    '',
    `Thank you for your business. Your invoice ${number} from ${COMPANY_NAME()} is ready (PDF attached).`,
    '',
    `Invoice #: ${invoice.invoiceNumber || '—'}`,
    `Amount due: ${formatMoney(invoice.totalAmount)}`,
    `Due date: ${formatDate(invoice.dueDate)}`,
    '',
    'Please arrange payment by the due date shown above.',
  ].join('\n');

  return { subject, html: layout({ heading: `Invoice ${escapeHtml(number)}`, bodyHtml }), text };
}

/**
 * Payment reminder email (FR-4.1). Tone adapts to whether the invoice is already
 * overdue (status 'overdue', a system-computed state per BR-4) or merely approaching due.
 * @param {object} invoice
 * @param {object} customer
 * @returns {{ subject: string, html: string, text: string }}
 */
function paymentReminderTemplate(invoice = {}, customer = {}) {
  const name = customer.name || 'there';
  const number = invoice.invoiceNumber || 'your invoice';
  const isOverdue = invoice.status === 'overdue';

  const subject = isOverdue
    ? `Overdue: Invoice ${invoice.invoiceNumber || ''} is past due`.trim()
    : `Reminder: Invoice ${invoice.invoiceNumber || ''} is due soon`.trim();

  const lead = isOverdue
    ? `Our records show that invoice ${escapeHtml(number)} is now past its due date and remains unpaid.`
    : `This is a friendly reminder that invoice ${escapeHtml(number)} is approaching its due date.`;

  const accent = isOverdue ? '#dc2626' : '#4f46e5';

  const bodyHtml = `
    <p style="margin:0 0 12px;font-size:14px;">Hi ${escapeHtml(name)},</p>
    <p style="margin:0 0 12px;font-size:14px;">${lead}</p>
    ${invoiceSummaryHtml(invoice)}
    <p style="margin:16px 0 0;font-size:14px;">
      ${isOverdue
        ? 'Please arrange payment at your earliest convenience to avoid further reminders.'
        : 'Please ensure payment is made by the due date to keep your account in good standing.'}
    </p>`;

  const text = [
    `Hi ${name},`,
    '',
    isOverdue
      ? `Invoice ${number} is now past due and remains unpaid.`
      : `This is a friendly reminder that invoice ${number} is approaching its due date.`,
    '',
    `Invoice #: ${invoice.invoiceNumber || '—'}`,
    `Amount due: ${formatMoney(invoice.totalAmount)}`,
    `Due date: ${formatDate(invoice.dueDate)}`,
  ].join('\n');

  return {
    subject,
    html: layout({ heading: isOverdue ? 'Payment overdue' : 'Payment reminder', bodyHtml, accent }),
    text,
  };
}

module.exports = { invoiceSentTemplate, paymentReminderTemplate, welcomeEmailTemplate };

/**
 * Welcome email sent when a new user registers (Auth module). Confirms the account was created,
 * echoes the registered email back, and invites them to log in.
 * @param {{ name?: string, email?: string }} user  the newly created user
 * @returns {{ subject: string, html: string, text: string }}
 */
function welcomeEmailTemplate(user = {}) {
  const name = user.name || 'there';
  const email = user.email || '';
  const company = COMPANY_NAME();

  const subject = user.name
    ? `Welcome to ${company}, ${user.name}!`
    : `Welcome to ${company}!`;

  const bodyHtml = `
    <p style="margin:0 0 12px;font-size:14px;">Hi ${escapeHtml(name)},</p>
    <p style="margin:0 0 12px;font-size:14px;">
      Your ${escapeHtml(company)} account has been created successfully. Welcome aboard!
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;font-size:14px;color:#374151;">
      <tr>
        <td style="padding:2px 16px 2px 0;color:#6b7280;">Registered email</td>
        <td style="padding:2px 0;font-weight:bold;">${escapeHtml(email)}</td>
      </tr>
    </table>
    <p style="margin:16px 0 0;font-size:14px;">
      You can now log in with this email to start managing customers, invoices, and payments.
    </p>`;

  const text = [
    `Hi ${name},`,
    '',
    `Your ${company} account has been created successfully. Welcome aboard!`,
    '',
    `Registered email: ${email}`,
    '',
    'You can now log in with this email to start managing customers, invoices, and payments.',
  ].join('\n');

  return { subject, html: layout({ heading: `Welcome to ${escapeHtml(company)}`, bodyHtml }), text };
}
