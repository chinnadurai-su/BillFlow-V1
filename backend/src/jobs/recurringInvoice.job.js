// recurringInvoice.job.js — BullMQ job producer: schedules recurring invoice regeneration.
//
// Purpose (see Spec Section 7.4): scheduled with a cron pattern per the invoice's recurringCycle
// (monthly/quarterly/yearly). When it fires, the worker creates a new Invoice document and queues
// the invoiceReminder job (PDF + email).
//
// TODO: implement the recurring job producer.
//   const { Queue } = require('bullmq');
//   const connection = require('../config/redis');
//   const invoiceQueue = new Queue('invoiceJobs', { connection });
//   await invoiceQueue.add('regenerateRecurring', { invoiceId }, {
//     repeat: { pattern: cronForCycle(recurringCycle) },  // monthly/quarterly/yearly
//   });
// NOTE: the queue name ('invoiceJobs') MUST match workers/invoice.worker.js exactly.

// TODO: export a scheduling helper once implemented.
module.exports = {};
