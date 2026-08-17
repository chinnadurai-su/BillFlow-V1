// utils.test.js — unit tests for the shared utilities (Section 2): format helpers,
// the PDFKit invoice renderer, and the email templates.
//
// The pure functions (format, renderInvoicePdf, email templates) need no DB or socket,
// so they always run. The DB-backed generatePDF(invoiceId) path is wrapped in describeDb
// and skipped where TCP/Mongo is unavailable (set BILLFLOW_SKIP_DB_TESTS=1).

const { formatMoney, formatDate, escapeHtml } = require('../src/utils/format');
const { renderInvoicePdf } = require('../src/utils/pdfGenerator');
const { invoiceSentTemplate, paymentReminderTemplate } = require('../src/utils/emailTemplates');

const describeDb = process.env.BILLFLOW_SKIP_DB_TESTS ? describe.skip : describe;

// A representative invoice + customer used across the PDF/email tests.
const sampleInvoice = {
  invoiceNumber: 'INV-2026-0042',
  status: 'sent',
  createdAt: new Date('2026-08-01T00:00:00Z'),
  dueDate: new Date('2026-08-31T00:00:00Z'),
  items: [
    { description: 'Consulting', quantity: 2, unitPrice: 100, total: 200 },
    { description: 'Hosting', quantity: 1, unitPrice: 49.5, total: 49.5 },
  ],
  subtotal: 249.5,
  tax: 24.95,
  totalAmount: 274.45,
};
const sampleCustomer = {
  name: 'Acme Corp',
  email: 'billing@acme.test',
  billingAddress: { line1: '1 Main St', city: 'Springfield', state: 'IL', zip: '62701', country: 'USA' },
};

describe('utils/format — formatMoney', () => {
  it('formats a plain amount with symbol and 2 decimals', () => {
    expect(formatMoney(1234.5)).toBe('$1,234.50');
  });
  it('adds thousands separators', () => {
    expect(formatMoney(1000000)).toBe('$1,000,000.00');
  });
  it('handles zero and rounds to 2 decimals', () => {
    expect(formatMoney(0)).toBe('$0.00');
    expect(formatMoney(1.005)).toBe('$1.00'); // toFixed rounding
  });
  it('handles negatives with the sign before the symbol', () => {
    expect(formatMoney(-50)).toBe('-$50.00');
  });
  it('falls back to 0.00 for non-numeric input', () => {
    expect(formatMoney(undefined)).toBe('$0.00');
    expect(formatMoney('abc')).toBe('$0.00');
  });
  it('respects CURRENCY_SYMBOL override', () => {
    expect(formatMoney(10, '₹')).toBe('₹10.00');
  });
});

describe('utils/format — formatDate', () => {
  it('formats a Date in UTC as "Mon D, YYYY"', () => {
    expect(formatDate(new Date('2026-08-17T00:00:00Z'))).toBe('Aug 17, 2026');
  });
  it('accepts an ISO string', () => {
    expect(formatDate('2026-01-05T12:00:00Z')).toBe('Jan 5, 2026');
  });
  it('returns an em dash for missing/invalid dates', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate('not-a-date')).toBe('—');
  });
});

describe('utils/format — escapeHtml', () => {
  it('escapes HTML-significant characters', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'
    );
  });
  it('escapes ampersands and single quotes', () => {
    expect(escapeHtml("Tom & Jerry's")).toBe('Tom &amp; Jerry&#39;s');
  });
  it('returns empty string for null/undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('utils/pdfGenerator — renderInvoicePdf (pure)', () => {
  it('returns a non-empty PDF Buffer with the %PDF magic header', async () => {
    const buf = await renderInvoicePdf(sampleInvoice, sampleCustomer);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(500);
    // Every PDF file starts with "%PDF".
    expect(buf.subarray(0, 4).toString('ascii')).toBe('%PDF');
  });

  it('renders without throwing when there are no line items / missing customer', async () => {
    const buf = await renderInvoicePdf(
      { invoiceNumber: 'INV-2026-0001', items: [], subtotal: 0, tax: 0, totalAmount: 0 },
      null
    );
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 4).toString('ascii')).toBe('%PDF');
  });
});

describe('utils/emailTemplates — invoiceSentTemplate', () => {
  it('returns subject, html, and text', () => {
    const out = invoiceSentTemplate(sampleInvoice, sampleCustomer);
    expect(out).toEqual(
      expect.objectContaining({
        subject: expect.any(String),
        html: expect.any(String),
        text: expect.any(String),
      })
    );
  });

  it('puts the invoice number in the subject and the formatted total in the body', () => {
    const { subject, html, text } = invoiceSentTemplate(sampleInvoice, sampleCustomer);
    expect(subject).toContain('INV-2026-0042');
    expect(html).toContain('$274.45');
    expect(text).toContain('$274.45');
    expect(html).toContain('Acme Corp');
  });

  it('HTML-escapes a malicious customer name (no script injection)', () => {
    const { html } = invoiceSentTemplate(sampleInvoice, { name: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('utils/emailTemplates — paymentReminderTemplate', () => {
  it('uses "due soon" tone for a non-overdue invoice', () => {
    const { subject, html } = paymentReminderTemplate(
      { ...sampleInvoice, status: 'sent' },
      sampleCustomer
    );
    expect(subject.toLowerCase()).toContain('due soon');
    expect(html.toLowerCase()).toContain('approaching its due date');
  });

  it('uses "past due" tone for an overdue invoice (BR-4)', () => {
    const { subject, html } = paymentReminderTemplate(
      { ...sampleInvoice, status: 'overdue' },
      sampleCustomer
    );
    expect(subject.toLowerCase()).toContain('past due');
    expect(html.toLowerCase()).toContain('past its due date');
  });

  it('escapes customer-controlled content', () => {
    const { html } = paymentReminderTemplate(sampleInvoice, { name: '<b>x</b>' });
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});

describeDb('utils/pdfGenerator — generatePDF(invoiceId) [DB-backed]', () => {
  const mongoose = require('mongoose');
  const Invoice = require('../src/models/Invoice');
  const Customer = require('../src/models/Customer');
  const { connect, clearDatabase, closeDatabase } = require('./helpers/db');

  beforeAll(async () => {
    await connect();
  });
  afterEach(async () => {
    await clearDatabase();
  });
  afterAll(async () => {
    await closeDatabase();
  });

  it('loads the invoice + customer and renders a PDF Buffer', async () => {
    const { generatePDF } = require('../src/utils/pdfGenerator');
    const customer = await Customer.create({ name: 'DB Cust', email: 'db@cust.test' });
    const invoice = await Invoice.create({
      invoiceNumber: 'INV-2026-9001',
      customerId: customer._id,
      items: [{ description: 'X', quantity: 1, unitPrice: 10, total: 10 }],
      subtotal: 10,
      tax: 0,
      totalAmount: 10,
    });

    const buf = await generatePDF(invoice._id);
    expect(buf.subarray(0, 4).toString('ascii')).toBe('%PDF');
  });

  it('throws 404 for a missing invoice', async () => {
    const { generatePDF } = require('../src/utils/pdfGenerator');
    const missingId = new mongoose.Types.ObjectId();
    await expect(generatePDF(missingId)).rejects.toMatchObject({ statusCode: 404 });
  });
});
