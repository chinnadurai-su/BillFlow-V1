// invoiceReminder.job.js — BullMQ job producer: enqueues PDF generation + reminder/invoice email.
//
// Purpose (see Spec Section 7.4): after an invoice is created/regenerated, add a job to the
// "invoiceJobs" queue; the worker then runs PDFKit (generate PDF) + Nodemailer (send email).
//
// TODO: implement the job producer.
//   const { Queue } = require('bullmq');
//   const connection = require('../config/redis');
//   const invoiceQueue = new Queue('invoiceJobs', { connection });
//   await invoiceQueue.add('generatePDF', { invoiceId }, {
//     attempts: 3, backoff: { type: 'exponential', delay: 5000 },
//   });
// NOTE: the queue name ('invoiceJobs') MUST match workers/invoice.worker.js exactly.

// TODO: export an enqueue helper (e.g. enqueueInvoiceReminder(invoiceId)) once implemented.
module.exports = {};
