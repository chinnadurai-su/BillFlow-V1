// invoice.worker.js — BullMQ worker process (runs separately from the API) consuming the "invoiceJobs" queue.
//
// Purpose (see Spec Section 7.4 / 7.6): listens on the "invoiceJobs" queue; for each job it
// generates the PDF (utils/pdfGenerator) and sends the email (modules/notification). Started as
// its own process: `node src/workers/invoice.worker.js` (npm run worker).
//
// TODO: implement the worker.
//   const { Worker } = require('bullmq');
//   const connection = require('../config/redis');
//   const { generatePDF } = require('../utils/pdfGenerator');
//   const { sendInvoiceEmail } = require('../modules/notification/notification.service');
//   const worker = new Worker('invoiceJobs', async (job) => {
//     if (job.name === 'generatePDF') {
//       const pdfPath = await generatePDF(job.data.invoiceId);
//       await sendInvoiceEmail(job.data.invoiceId, pdfPath);
//     }
//   }, { connection });
// NOTE: deliberately NOT connecting to Redis yet — this is a scaffold stub so `npm run worker`
//       starts and exits cleanly without a running Redis instance.

console.log('[worker] invoice.worker.js — not implemented yet (scaffold stub). See Spec Section 7.4.');
