// pdfGenerator.js — Utility that renders an invoice into a PDF document using PDFKit (Spec Section 2).
//
// Purpose (see Spec Section 7.4): given an invoiceId, lays out and generates the invoice PDF,
// returning the stored PDF path/URL used to populate Invoice.pdfUrl.
//
// TODO: use PDFKit to generate the invoice PDF, referencing Invoice + Customer data.
//   - load the Invoice (and its Customer) by invoiceId
//   - build a PDFDocument: header/logo, customer + billing address, line items table
//     (description / quantity / unitPrice / total), subtotal, tax, totalAmount, due date
//   - write it to storage and return the path/URL (see Open Item: PDF storage, Spec Section 14)
//   - consider extracting the layout into an `invoice-pdf-generation` skill when it stabilizes

// eslint-disable-next-line no-unused-vars
async function generatePDF(invoiceId) {
  // TODO: implement PDFKit generation and return the stored PDF path/URL.
  throw new Error('pdfGenerator.generatePDF not implemented (scaffold).');
}

module.exports = { generatePDF };
