// invoiceQueue.js — the single shared BullMQ queue used by all invoice-related job producers.
//
// IMPORT-SAFE BY DESIGN: the Queue (and therefore the Redis connection) is created LAZILY on the
// first enqueue, not at module load. This matters because the invoice/payment services require the
// job producers at the top level — if importing them opened a Redis socket, every unit test that
// touches those services would try (and fail) to connect to Redis. With lazy creation, importing is
// free; only actually enqueuing a job connects.
//
// The queue name 'invoiceJobs' MUST match workers/invoice.worker.js exactly (Spec 7.6).

const { Queue } = require('bullmq');

const INVOICE_QUEUE_NAME = 'invoiceJobs';

// Producer enqueues fail fast after this many ms. The shared ioredis connection uses
// maxRetriesPerRequest:null with the default offline queue, so a command issued while Redis is
// unreachable would buffer and never reject — hanging the awaiting request. Racing against a
// timeout lets best-effort callers (sendInvoice/safeSchedule/safeRemind) catch a failure and
// return promptly instead of blocking the API.
const ENQUEUE_TIMEOUT_MS = Number(process.env.QUEUE_ENQUEUE_TIMEOUT_MS) || 3000;

let queue;

/**
 * Lazily create (once) and return the shared invoiceJobs queue.
 * Returns null when queueing is disabled (QUEUE_DISABLED=1, used in tests) so callers can
 * no-op cleanly without a Redis dependency.
 * @returns {import('bullmq').Queue | null}
 */
function getInvoiceQueue() {
  if (process.env.QUEUE_DISABLED === '1') return null;
  if (!queue) {
    // Lazy require so merely importing this module never pulls in the Redis connection.
    const connection = require('../config/redis');
    queue = new Queue(INVOICE_QUEUE_NAME, { connection });
  }
  return queue;
}

/**
 * Add a job to the invoice queue. Safe no-op (returns null) when queueing is disabled.
 * Rejects (rather than hangs) if Redis is unreachable within ENQUEUE_TIMEOUT_MS.
 * @param {string} name job type ('generatePDF' | 'sendReminder' | 'createRecurringInvoice')
 * @param {object} data job payload
 * @param {object} [opts] BullMQ job options
 */
async function addInvoiceJob(name, data, opts) {
  const q = getInvoiceQueue();
  if (!q) return null;

  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`enqueue '${name}' timed out after ${ENQUEUE_TIMEOUT_MS}ms (Redis unreachable?)`)),
      ENQUEUE_TIMEOUT_MS
    );
  });
  try {
    return await Promise.race([q.add(name, data, opts), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { INVOICE_QUEUE_NAME, getInvoiceQueue, addInvoiceJob };
