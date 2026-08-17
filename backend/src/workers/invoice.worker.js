// invoice.worker.js — BullMQ worker (separate process) consuming the "invoiceJobs" queue.
//
// Run standalone: `npm run worker` (node src/workers/invoice.worker.js), per Spec Section 4 / 7.6.
// Handles four job types:
//   - 'generatePDF'            : render the invoice PDF (PDFKit) and email it with the PDF attached
//                                (invoice "sent" flow, FR-2.7 / FR-4.2)
//   - 'sendReminder'           : email a due/overdue payment reminder (FR-4.1)
//   - 'createRecurringInvoice' : create the next occurrence of a recurring invoice, email it, and
//                                re-schedule the following cycle (FR-2.5 / BR-3)
//   - 'overdueCheck'           : sweep and flag overdue invoices (BR-4)
//
// IMPORT-SAFE: the Redis connection, DB connection, and Worker are created only inside start(),
// so requiring this module in a test (to exercise the dispatcher) never opens a socket.

// Load env from the same absolute path the server uses (works regardless of CWD).
require('dotenv').config({ path: require('path').resolve(__dirname, '../../environment/.env') });

const { Worker } = require('bullmq');

const { INVOICE_QUEUE_NAME } = require('../jobs/invoiceQueue');
const Invoice = require('../models/Invoice');
const Customer = require('../models/Customer');
const { renderInvoicePdf } = require('../utils/pdfGenerator');
const { invoiceSentTemplate, paymentReminderTemplate } = require('../utils/emailTemplates');
const { sendMail } = require('../utils/mailer');
const invoiceService = require('../modules/invoice/invoice.service');
const { scheduleRecurringInvoice } = require('../jobs/recurringInvoice.job');
const { enqueueInvoiceEmail } = require('../jobs/invoiceReminder.job');
const { flagOverdueInvoices, remindUpcomingInvoices } = require('../jobs/overdueCheck.job');

// --- Job handlers ---

/** 'generatePDF' — render + email the invoice with its PDF attached (FR-2.6 / FR-4.2). */
async function handleGeneratePdf(invoiceId) {
  const invoice = await Invoice.findById(invoiceId).lean();
  if (!invoice) throw new Error(`generatePDF: invoice ${invoiceId} not found`);
  const customer = await Customer.findById(invoice.customerId).lean();
  if (!customer || !customer.email) {
    console.warn(`[worker] generatePDF: no customer email for invoice ${invoiceId}; skipping send`);
    return;
  }

  const buffer = await renderInvoicePdf(invoice, customer);
  const { subject, html, text } = invoiceSentTemplate(invoice, customer);
  await sendMail({
    to: customer.email,
    subject,
    html,
    text,
    attachments: [{ filename: `${invoice.invoiceNumber || 'invoice'}.pdf`, content: buffer }],
  });
}

/** 'sendReminder' — email a payment reminder (FR-4.1). */
async function handleSendReminder(invoiceId) {
  const invoice = await Invoice.findById(invoiceId).lean();
  if (!invoice) throw new Error(`sendReminder: invoice ${invoiceId} not found`);
  const customer = await Customer.findById(invoice.customerId).lean();
  if (!customer || !customer.email) {
    console.warn(`[worker] sendReminder: no customer email for invoice ${invoiceId}; skipping send`);
    return;
  }

  const { subject, html, text } = paymentReminderTemplate(invoice, customer);
  await sendMail({ to: customer.email, subject, html, text });
}

/**
 * 'createRecurringInvoice' — create the next occurrence, email it, and re-arm the next cycle.
 * If createRecurringOccurrence returns null the chain stops (BR-3: flag off / cancelled / customer
 * archived), so we do NOT re-schedule.
 *
 * jobId is passed through as the occurrence's idempotencyKey so a retry of THIS job (after the
 * occurrence already committed) is deduped instead of creating a duplicate invoice. The email and
 * reschedule are best-effort and INDEPENDENT: a Redis blip on either must not throw the processor
 * (which would trigger a retry and risk re-creation) nor kill the recurring chain.
 */
async function handleCreateRecurring(sourceInvoiceId, cycle, jobId) {
  const dedupeKey = jobId ? `recurring:${jobId}` : undefined;
  const occurrence = await invoiceService.createRecurringOccurrence(sourceInvoiceId, dedupeKey);
  if (!occurrence) {
    console.log(`[worker] recurring chain stopped for source ${sourceInvoiceId} (BR-3)`);
    return;
  }
  // Email the new invoice (best-effort — a failure here must not re-create the occurrence).
  try {
    await enqueueInvoiceEmail(occurrence._id);
  } catch (err) {
    console.error('[worker] recurring: failed to enqueue email:', err && err.message);
  }
  // Re-arm the next cycle INDEPENDENTLY so an email failure can't break the chain (BR-3).
  try {
    await scheduleRecurringInvoice(sourceInvoiceId, cycle);
  } catch (err) {
    console.error('[worker] recurring: failed to schedule next cycle:', err && err.message);
  }
}

/** 'overdueCheck' — daily maintenance: flag overdue invoices (BR-4) + remind upcoming (FR-4.1). */
async function handleOverdueCheck() {
  const flagged = await flagOverdueInvoices();
  const reminded = await remindUpcomingInvoices();
  console.log(`[worker] overdueCheck flagged ${flagged} overdue, reminded ${reminded} upcoming`);
}

/**
 * Dispatch a job by its name. Exported for unit testing (unknown job → throws), and used by the
 * Worker created in start().
 */
async function processor(job) {
  switch (job.name) {
    case 'generatePDF':
      return handleGeneratePdf(job.data.invoiceId);
    case 'sendReminder':
      return handleSendReminder(job.data.invoiceId);
    case 'createRecurringInvoice':
      return handleCreateRecurring(job.data.invoiceId, job.data.cycle, job.id);
    case 'overdueCheck':
      return handleOverdueCheck();
    default:
      throw new Error(`Unknown job type: ${job.name}`);
  }
}

/** Connect to Mongo + Redis and start consuming jobs. Only called when run as a process. */
async function start() {
  const connectDB = require('../config/db');
  const connection = require('../config/redis');

  await connectDB();

  const worker = new Worker(INVOICE_QUEUE_NAME, processor, { connection });
  worker.on('completed', (job) => console.log(`[worker] ${job.name} completed (job ${job.id})`));
  worker.on('failed', (job, err) =>
    console.error(`[worker] ${job && job.name} failed:`, err && err.message)
  );
  // Without an 'error' listener, a transient queue/connection error emitted by the Worker would be
  // thrown as an unhandled error and crash the process (Node EventEmitter contract). Log instead.
  worker.on('error', (err) => console.error('[worker] error:', err && err.message));
  console.log(`[worker] listening on queue "${INVOICE_QUEUE_NAME}"`);
  return worker;
}

if (require.main === module) {
  start().catch((err) => {
    console.error('[worker] fatal:', err);
    process.exit(1);
  });
}

module.exports = {
  processor,
  handleGeneratePdf,
  handleSendReminder,
  handleCreateRecurring,
  handleOverdueCheck,
  start,
};
