// pdfGenerator.js — renders an invoice into a PDF using PDFKit (Spec Section 2 / 7.4).
//
// OUTPUT FORMAT DECISION — returns a Buffer (in-memory), not a file path.
//   Why: the backend deploys to Render, whose filesystem is ephemeral, and PDF storage
//   is still an open item (Spec Section 14). Returning an in-memory Buffer avoids
//   depending on a writable/persistent disk and lets the CALLER decide what to do with
//   it — attach it to an email (worker), stream it as the GET /api/invoices/:id/pdf
//   response, or persist it to a bucket later. It's also fully unit-testable with no disk.
//
// Two exports:
//   - renderInvoicePdf(invoice, customer) -> Promise<Buffer>   PURE: takes already-loaded
//       plain objects, does no DB access. This is where the layout lives (easy to test).
//   - generatePDF(invoiceId)              -> Promise<Buffer>   loads Invoice + Customer from
//       Mongo, then delegates to renderInvoicePdf. Used by the worker / PDF endpoint.

const PDFDocument = require('pdfkit');

const Invoice = require('../models/Invoice');
const Customer = require('../models/Customer');
const ApiError = require('./ApiError');
const { formatMoney, formatDate } = require('./format');

// Company/brand shown in the PDF header. Single-tenant per deployment (BRD Section 9),
// so a single env-configurable name is sufficient.
const COMPANY_NAME = () => process.env.COMPANY_NAME || 'BillFlow';

// Layout constants (A4 with 50pt margins → 495pt usable width).
const PAGE_MARGIN = 50;
const CONTENT_LEFT = PAGE_MARGIN;
const CONTENT_RIGHT = 545; // 595 (A4 width) - 50 margin
// Line-item column x-positions.
const COL_DESC = CONTENT_LEFT;
const COL_QTY = 330;
const COL_UNIT = 400;
const COL_TOTAL = 480;

/**
 * Render an invoice + its customer into a PDF Buffer. Pure: no DB access.
 * @param {object} invoice  plain invoice object (items, subtotal, tax, totalAmount, ...)
 * @param {object} customer plain customer object (name, email, billingAddress)
 * @returns {Promise<Buffer>}
 */
function renderInvoicePdf(invoice, customer) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN });

      // Collect the streamed output into a single Buffer (no filesystem involved).
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      drawHeader(doc, invoice);
      drawParties(doc, invoice, customer);
      drawItemsTable(doc, invoice);
      drawSummary(doc, invoice);
      drawFooter(doc);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/** Company header + "INVOICE" title. */
function drawHeader(doc, invoice) {
  doc
    .fontSize(20)
    .fillColor('#1a1a1a')
    .text(COMPANY_NAME(), CONTENT_LEFT, PAGE_MARGIN, { continued: false });

  doc
    .fontSize(24)
    .fillColor('#4f46e5')
    .text('INVOICE', CONTENT_LEFT, PAGE_MARGIN, { align: 'right' });

  doc.moveDown(0.5);
  doc
    .fontSize(10)
    .fillColor('#555555')
    .text(`Invoice #: ${invoice.invoiceNumber || '—'}`, { align: 'right' })
    .text(`Status: ${(invoice.status || 'draft').toUpperCase()}`, { align: 'right' })
    .text(`Issued: ${formatDate(invoice.createdAt)}`, { align: 'right' })
    .text(`Due: ${formatDate(invoice.dueDate)}`, { align: 'right' });

  // Divider.
  doc.moveTo(CONTENT_LEFT, 140).lineTo(CONTENT_RIGHT, 140).strokeColor('#e5e7eb').stroke();
}

/** "Bill To" block with the customer's details + billing address. */
function drawParties(doc, invoice, customer) {
  const top = 160;
  const c = customer || {};
  const addr = c.billingAddress || {};

  doc
    .fontSize(11)
    .fillColor('#111827')
    .text('Bill To:', CONTENT_LEFT, top);

  doc
    .fontSize(10)
    .fillColor('#374151')
    .text(c.name || 'Customer', CONTENT_LEFT, top + 16)
    .text(c.email || '', CONTENT_LEFT, top + 30);

  // Compose address lines, skipping empties so we don't print blank rows.
  const cityLine = [addr.city, addr.state, addr.zip].filter(Boolean).join(', ');
  const addressLines = [addr.line1, cityLine, addr.country].filter(Boolean);
  let y = top + 44;
  addressLines.forEach((line) => {
    doc.text(line, CONTENT_LEFT, y);
    y += 14;
  });
}

/** Line-item table header + rows (description / qty / unit price / total). */
function drawItemsTable(doc, invoice) {
  const headerY = 260;

  // Header row.
  doc.fontSize(10).fillColor('#6b7280');
  doc.text('Description', COL_DESC, headerY);
  doc.text('Qty', COL_QTY, headerY, { width: 60, align: 'right' });
  doc.text('Unit Price', COL_UNIT, headerY, { width: 70, align: 'right' });
  doc.text('Amount', COL_TOTAL, headerY, { width: 65, align: 'right' });

  doc.moveTo(CONTENT_LEFT, headerY + 15).lineTo(CONTENT_RIGHT, headerY + 15).strokeColor('#e5e7eb').stroke();

  // Rows.
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  let y = headerY + 24;
  doc.fillColor('#111827');
  items.forEach((item) => {
    const qty = Number(item.quantity) || 0;
    const unit = Number(item.unitPrice) || 0;
    const lineTotal = item.total != null ? Number(item.total) : qty * unit;

    doc.text(item.description || '', COL_DESC, y, { width: 270 });
    doc.text(String(qty), COL_QTY, y, { width: 60, align: 'right' });
    doc.text(formatMoney(unit), COL_UNIT, y, { width: 70, align: 'right' });
    doc.text(formatMoney(lineTotal), COL_TOTAL, y, { width: 65, align: 'right' });

    // Advance by the tallest cell (description may wrap).
    const descHeight = doc.heightOfString(item.description || '', { width: 270 });
    y += Math.max(descHeight, 14) + 6;
  });

  // Remember where the rows ended so the summary sits below them.
  doc.y = y + 6;
}

/** Subtotal / tax / total summary block, right-aligned. */
function drawSummary(doc, invoice) {
  const labelX = 360;
  const valueX = COL_TOTAL;
  let y = Math.max(doc.y, 320);

  doc.moveTo(labelX, y).lineTo(CONTENT_RIGHT, y).strokeColor('#e5e7eb').stroke();
  y += 10;

  const row = (label, value, opts = {}) => {
    doc
      .fontSize(opts.bold ? 12 : 10)
      .fillColor(opts.bold ? '#111827' : '#374151')
      .text(label, labelX, y, { width: 100, align: 'left' })
      .text(value, valueX, y, { width: 65, align: 'right' });
    y += opts.bold ? 20 : 16;
  };

  row('Subtotal', formatMoney(invoice.subtotal));
  row('Tax', formatMoney(invoice.tax));
  row('Total', formatMoney(invoice.totalAmount), { bold: true });
}

/** Small thank-you footer. */
function drawFooter(doc) {
  doc
    .fontSize(9)
    .fillColor('#9ca3af')
    .text(
      `Thank you for your business. Generated by ${COMPANY_NAME()}.`,
      CONTENT_LEFT,
      760,
      { align: 'center', width: CONTENT_RIGHT - CONTENT_LEFT }
    );
}

/**
 * Load an Invoice (and its Customer) by id and render it to a PDF Buffer.
 * @param {string} invoiceId
 * @returns {Promise<Buffer>}
 */
async function generatePDF(invoiceId) {
  const invoice = await Invoice.findById(invoiceId).lean();
  if (!invoice) {
    throw new ApiError(404, 'Invoice not found', 'INVOICE_NOT_FOUND');
  }
  const customer = await Customer.findById(invoice.customerId).lean();
  return renderInvoicePdf(invoice, customer);
}

module.exports = { generatePDF, renderInvoicePdf };
