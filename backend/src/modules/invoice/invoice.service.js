// invoice.service.js — business logic for invoices (BRD FR-2.1–FR-2.9, BR-1, BR-2, Spec 7.1/7.2).
//
// Key guarantees:
//   - Totals are computed SERVER-SIDE from line items (FR-2.2) — client-sent subtotal/total are
//     ignored. computeTotals() is pure and unit-tested.
//   - Invoice numbers are unique + sequential per year via the atomic Counter (FR-2.4).
//   - create() runs Invoice.create + customer balance update + AuditLog in ONE transaction (Spec 7.2)
//     and is idempotent: the invoice stores its idempotencyKey (unique index), so even if two
//     requests race past the idempotency middleware, the second insert is rejected and the existing
//     invoice is returned (Spec 7.1 — DB-enforced backstop).
//   - Recurring invoices schedule the next cycle after commit (FR-2.5, best-effort).
//   - BR-1: invoices are never hard-deleted; DELETE cancels (soft state change), preserving payments.
//   - BR-2: customer balance is maintained here, never accepted from the client.

const Invoice = require('../../models/Invoice');
const Customer = require('../../models/Customer');
const Payment = require('../../models/Payment');
const Counter = require('../../models/Counter');
const ApiError = require('../../utils/ApiError');
const withTransaction = require('../../utils/withTransaction');
const { writeAudit } = require('../../utils/audit');
const { parsePagination, paginatedResult } = require('../../utils/pagination');
const { renderInvoicePdf } = require('../../utils/pdfGenerator');
const { scheduleRecurringInvoice, cycleToDelayMs } = require('../../jobs/recurringInvoice.job');
const notificationService = require('../notification/notification.service');

const VALID_CYCLES = ['monthly', 'quarterly', 'yearly'];

// Round to 2 decimals to avoid floating-point drift in money math.
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// ---------------------------------------------------------------------------
// Pure helpers (no DB) — exported for unit testing.
// ---------------------------------------------------------------------------

/**
 * Compute per-item totals, subtotal, tax, and totalAmount from line items (FR-2.2).
 * @param {Array<{description:string, quantity:number, unitPrice:number}>} items
 * @param {number} [taxRate] fraction 0..1 (e.g. 0.1 = 10%); default 0
 * @returns {{ items: Array, subtotal: number, tax: number, totalAmount: number }}
 */
function computeTotals(items, taxRate = 0) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new ApiError(400, 'At least one line item is required', 'VALIDATION_ERROR');
  }
  const rate = Number(taxRate) || 0;
  if (rate < 0 || rate > 1) {
    throw new ApiError(400, 'taxRate must be a fraction between 0 and 1', 'VALIDATION_ERROR');
  }

  const computedItems = items.map((item) => {
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unitPrice);
    if (
      !item.description ||
      !Number.isFinite(quantity) || quantity <= 0 ||
      !Number.isFinite(unitPrice) || unitPrice < 0
    ) {
      throw new ApiError(
        400,
        'Each line item needs a description, a positive quantity, and a non-negative unit price',
        'VALIDATION_ERROR'
      );
    }
    return {
      description: String(item.description),
      quantity,
      unitPrice,
      total: round2(quantity * unitPrice),
    };
  });

  const subtotal = round2(computedItems.reduce((sum, it) => sum + it.total, 0));
  const tax = round2(subtotal * rate);
  const totalAmount = round2(subtotal + tax);
  return { items: computedItems, subtotal, tax, totalAmount };
}

/**
 * Format a human-readable invoice number, e.g. (2026, 42) → "INV-2026-0042". Pure.
 * @param {number} year
 * @param {number} seq
 */
function formatInvoiceNumber(year, seq) {
  return `INV-${year}-${String(seq).padStart(4, '0')}`;
}

// Derive the effective tax rate of an existing invoice (for re-computing on item edits).
function impliedRate(invoice) {
  return invoice.subtotal > 0 ? invoice.tax / invoice.subtotal : 0;
}

// ---------------------------------------------------------------------------
// DB-backed service functions.
// ---------------------------------------------------------------------------

/** List invoices with pagination + filters: status, customerId, createdAt date range. */
async function list(query = {}) {
  const { page, limit, skip } = parsePagination(query);

  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.customerId) filter.customerId = query.customerId;
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) filter.createdAt.$lte = new Date(query.to);
  }

  const [items, total] = await Promise.all([
    Invoice.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Invoice.countDocuments(filter),
  ]);
  return paginatedResult(items, total, { page, limit });
}

/** Get one invoice by id (404 if missing). */
async function getById(id) {
  const invoice = await Invoice.findById(id);
  if (!invoice) throw new ApiError(404, 'Invoice not found', 'INVOICE_NOT_FOUND');
  return invoice;
}

/**
 * Create an invoice (FR-2.1–2.5). Transaction: number + invoice + balance + audit (Spec 7.2).
 * Idempotent via the invoice's unique idempotencyKey (Spec 7.1).
 * @param {object} input request body (+ idempotencyKey from the header)
 * @param {string} [userId]
 */
async function create(input = {}, userId) {
  const { customerId, items, taxRate, dueDate, isRecurring, recurringCycle, status, idempotencyKey } = input;

  if (!customerId) throw new ApiError(400, 'customerId is required', 'VALIDATION_ERROR');

  // Status at creation is limited to draft/sent (never paid/overdue/cancelled).
  const initialStatus = status === 'sent' ? 'sent' : 'draft';

  if (isRecurring && !VALID_CYCLES.includes(recurringCycle)) {
    throw new ApiError(400, `recurringCycle must be one of ${VALID_CYCLES.join(', ')}`, 'VALIDATION_ERROR');
  }

  const totals = computeTotals(items, taxRate); // server-side (FR-2.2)

  try {
    const invoice = await withTransaction(async (session) => {
      const customer = await Customer.findById(customerId).session(session);
      if (!customer) throw new ApiError(404, 'Customer not found', 'CUSTOMER_NOT_FOUND');
      if (customer.status === 'archived') {
        throw new ApiError(409, 'Cannot create an invoice for an archived customer', 'CUSTOMER_ARCHIVED');
      }

      const year = new Date().getUTCFullYear();
      const seq = await Counter.next(`invoice-${year}`, session);
      const invoiceNumber = formatInvoiceNumber(year, seq);

      const [created] = await Invoice.create(
        [{
          invoiceNumber,
          customerId,
          items: totals.items,
          subtotal: totals.subtotal,
          tax: totals.tax,
          totalAmount: totals.totalAmount,
          status: initialStatus,
          dueDate: dueDate ? new Date(dueDate) : undefined,
          isRecurring: Boolean(isRecurring),
          recurringCycle: isRecurring ? recurringCycle : null,
          idempotencyKey: idempotencyKey || undefined,
        }],
        { session }
      );

      // BR-2: increase the customer's outstanding balance by the invoice total.
      await Customer.updateOne(
        { _id: customerId },
        { $inc: { balance: created.totalAmount } },
        { session }
      );

      await writeAudit({
        action: 'INVOICE_CREATED',
        entityType: 'Invoice',
        entityId: created._id,
        performedBy: userId,
        beforeState: null,
        afterState: created.toObject(),
        session,
      });

      return created;
    });

    // Post-commit side effect: schedule the next recurring cycle (FR-2.5). Best-effort — a
    // scheduling failure must not undo the already-committed invoice.
    if (invoice.isRecurring && invoice.recurringCycle) {
      await safeSchedule(invoice._id, invoice.recurringCycle);
    }

    return invoice;
  } catch (err) {
    // DB-enforced idempotency backstop: a concurrent request already created this invoice.
    if (err && err.code === 11000 && err.keyPattern && err.keyPattern.idempotencyKey && idempotencyKey) {
      const existing = await Invoice.findOne({ idempotencyKey });
      if (existing) return existing;
    }
    throw err;
  }
}

/**
 * Update an invoice's line items / due date / recurring flag (FR-2.1, BR-3). Recomputes totals and
 * adjusts the customer balance by the delta, atomically with an AuditLog entry. Paid/cancelled
 * invoices are locked. Turning isRecurring off here is the supported way to stop a recurring series
 * (BR-3). If an item edit drops the total to at/below what's already been paid, the invoice is
 * marked 'paid' (so it can't be wrongly flagged overdue later).
 */
async function update(id, input = {}, userId) {
  return withTransaction(async (session) => {
    const invoice = await Invoice.findById(id).session(session);
    if (!invoice) throw new ApiError(404, 'Invoice not found', 'INVOICE_NOT_FOUND');
    if (invoice.status === 'paid' || invoice.status === 'cancelled') {
      throw new ApiError(409, `Cannot edit a ${invoice.status} invoice`, 'INVOICE_LOCKED');
    }

    const beforeState = invoice.toObject();
    let balanceDelta = 0;

    if (input.items) {
      const rate = input.taxRate != null ? input.taxRate : impliedRate(invoice);
      const totals = computeTotals(input.items, rate);
      balanceDelta = round2(totals.totalAmount - invoice.totalAmount);
      invoice.items = totals.items;
      invoice.subtotal = totals.subtotal;
      invoice.tax = totals.tax;
      invoice.totalAmount = totals.totalAmount;
    }
    if (input.dueDate !== undefined) invoice.dueDate = input.dueDate ? new Date(input.dueDate) : undefined;

    // BR-3 off-switch: allow stopping (or (re)configuring) recurrence via update.
    if (input.isRecurring !== undefined) {
      invoice.isRecurring = Boolean(input.isRecurring);
      if (!invoice.isRecurring) {
        invoice.recurringCycle = null;
      } else {
        const cycle = input.recurringCycle || invoice.recurringCycle;
        if (!VALID_CYCLES.includes(cycle)) {
          throw new ApiError(400, `recurringCycle must be one of ${VALID_CYCLES.join(', ')}`, 'VALIDATION_ERROR');
        }
        invoice.recurringCycle = cycle;
      }
    }

    // If the (possibly reduced) total is now fully covered by completed payments, mark it paid so
    // the overdue sweep won't later flag an over-paid invoice (BR-4 correctness).
    if (input.items) {
      const payments = await Payment.find({ invoiceId: invoice._id, status: 'completed' }).session(session);
      const paidSoFar = payments.reduce((sum, p) => sum + p.amount, 0);
      if (paidSoFar > 0 && paidSoFar >= invoice.totalAmount && invoice.status !== 'paid') {
        invoice.status = 'paid';
      }
    }

    await invoice.save({ session });

    if (balanceDelta !== 0) {
      await Customer.updateOne(
        { _id: invoice.customerId },
        { $inc: { balance: balanceDelta } },
        { session }
      );
    }

    await writeAudit({
      action: 'INVOICE_UPDATED',
      entityType: 'Invoice',
      entityId: invoice._id,
      performedBy: userId,
      beforeState,
      afterState: invoice.toObject(),
      session,
    });
    return invoice;
  });
}

/**
 * Cancel an invoice (DELETE endpoint). BR-1: invoices are NEVER hard-deleted — even when payments
 * exist — they are only cancelled, preserving the payment/audit trail. Removes the still-unpaid
 * portion from the customer balance. Paid invoices cannot be cancelled.
 */
async function cancel(id, userId) {
  return withTransaction(async (session) => {
    const invoice = await Invoice.findById(id).session(session);
    if (!invoice) throw new ApiError(404, 'Invoice not found', 'INVOICE_NOT_FOUND');
    if (invoice.status === 'cancelled') return invoice; // idempotent
    if (invoice.status === 'paid') {
      throw new ApiError(409, 'Cannot cancel a fully paid invoice', 'INVOICE_PAID');
    }

    const beforeState = invoice.toObject();

    // Remaining owed = total − completed payments already applied.
    const payments = await Payment.find({ invoiceId: invoice._id, status: 'completed' }).session(session);
    const paidSoFar = payments.reduce((sum, p) => sum + p.amount, 0);
    const remaining = round2(invoice.totalAmount - paidSoFar);

    invoice.status = 'cancelled';
    await invoice.save({ session });

    if (remaining !== 0) {
      await Customer.updateOne(
        { _id: invoice.customerId },
        { $inc: { balance: -remaining } },
        { session }
      );
    }

    await writeAudit({
      action: 'INVOICE_CANCELLED',
      entityType: 'Invoice',
      entityId: invoice._id,
      performedBy: userId,
      beforeState,
      afterState: invoice.toObject(),
      session,
    });
    return invoice;
  });
}

/**
 * Mark an invoice as "sent" (if it was a draft) and enqueue the PDF+email job (FR-2.7 / FR-4.2).
 * Email delivery is async (worker); enqueue failures are logged, not fatal.
 */
async function sendInvoice(id, userId) {
  const invoice = await withTransaction(async (session) => {
    const inv = await Invoice.findById(id).session(session);
    if (!inv) throw new ApiError(404, 'Invoice not found', 'INVOICE_NOT_FOUND');
    if (inv.status === 'cancelled') {
      throw new ApiError(409, 'Cannot send a cancelled invoice', 'INVOICE_CANCELLED');
    }

    if (inv.status === 'draft') {
      const beforeState = inv.toObject();
      inv.status = 'sent';
      await inv.save({ session });
      await writeAudit({
        action: 'INVOICE_SENT',
        entityType: 'Invoice',
        entityId: inv._id,
        performedBy: userId,
        beforeState,
        afterState: inv.toObject(),
        session,
      });
    }
    return inv;
  });

  // Enqueue PDF generation + email (async). Best-effort so a Redis hiccup doesn't fail the request.
  try {
    await notificationService.sendInvoiceEmail(invoice._id);
  } catch (err) {
    console.error('[invoice] failed to enqueue invoice email:', err && err.message);
  }
  return invoice;
}

/**
 * Manually enqueue a payment reminder for an invoice (FR-4.1, manual trigger). Validates the
 * invoice is in a remindable state (not paid/cancelled). Delivery is async (worker). Records
 * lastReminderAt so the automatic upcoming-due sweep won't immediately re-remind.
 * @param {string} id
 */
async function remind(id) {
  const invoice = await Invoice.findById(id);
  if (!invoice) throw new ApiError(404, 'Invoice not found', 'INVOICE_NOT_FOUND');
  if (invoice.status === 'paid') {
    throw new ApiError(409, 'Invoice is already paid', 'INVOICE_PAID');
  }
  if (invoice.status === 'cancelled') {
    throw new ApiError(409, 'Cannot send a reminder for a cancelled invoice', 'INVOICE_CANCELLED');
  }

  try {
    await notificationService.sendInvoiceReminder(invoice._id);
    invoice.lastReminderAt = new Date();
    await invoice.save();
  } catch (err) {
    console.error('[invoice] failed to enqueue reminder:', err && err.message);
  }
  return invoice;
}

/**
 * Render an invoice PDF (FR-2.6). Returns the Buffer + the invoice (for the download filename).
 */
async function getInvoicePdf(id) {
  const invoice = await Invoice.findById(id);
  if (!invoice) throw new ApiError(404, 'Invoice not found', 'INVOICE_NOT_FOUND');
  const customer = await Customer.findById(invoice.customerId);
  const buffer = await renderInvoicePdf(invoice.toObject(), customer ? customer.toObject() : null);
  return { buffer, invoice };
}

/**
 * Create the next occurrence of a recurring invoice (called by the worker). Implements BR-3:
 * stops (returns null) if the source is no longer recurring, is cancelled, or the customer is
 * archived. The occurrence itself is NOT marked recurring — the source template remains the anchor.
 *
 * Idempotent: pass a deterministic idempotencyKey (e.g. the BullMQ job id) so a worker RETRY after
 * the transaction already committed does not create a duplicate occurrence / double-charge the
 * balance — the unique idempotencyKey index rejects the second insert and we return the existing one.
 * @param {string} sourceInvoiceId
 * @param {string} [idempotencyKey]
 */
async function createRecurringOccurrence(sourceInvoiceId, idempotencyKey) {
  const source = await Invoice.findById(sourceInvoiceId);
  if (!source || !source.isRecurring || !source.recurringCycle) return null; // BR-3 stop
  if (source.status === 'cancelled') return null; // a cancelled source stops the series (BR-3)
  const customer = await Customer.findById(source.customerId);
  if (!customer || customer.status === 'archived') return null; // BR-3 stop

  const now = new Date();
  const year = now.getUTCFullYear();

  try {
    return await withTransaction(async (session) => {
      const seq = await Counter.next(`invoice-${year}`, session);
      const invoiceNumber = formatInvoiceNumber(year, seq);
      const dueDate = new Date(now.getTime() + cycleToDelayMs(source.recurringCycle));

      const [created] = await Invoice.create(
        [{
          invoiceNumber,
          customerId: source.customerId,
          items: source.items,
          subtotal: source.subtotal,
          tax: source.tax,
          totalAmount: source.totalAmount,
          status: 'sent',
          dueDate,
          isRecurring: false, // the occurrence is a concrete invoice, not itself a template
          recurringCycle: null,
          idempotencyKey: idempotencyKey || undefined,
        }],
        { session }
      );

      await Customer.updateOne(
        { _id: source.customerId },
        { $inc: { balance: created.totalAmount } },
        { session }
      );

      await writeAudit({
        action: 'INVOICE_CREATED',
        entityType: 'Invoice',
        entityId: created._id,
        performedBy: undefined, // system-generated
        beforeState: null,
        afterState: created.toObject(),
        session,
      });
      return created;
    });
  } catch (err) {
    // Retry after a prior commit: the occurrence already exists for this idempotencyKey.
    if (err && err.code === 11000 && err.keyPattern && err.keyPattern.idempotencyKey && idempotencyKey) {
      const existing = await Invoice.findOne({ idempotencyKey });
      if (existing) return existing;
    }
    throw err;
  }
}

// Best-effort recurring scheduler (swallows Redis errors — invoice is already committed).
async function safeSchedule(invoiceId, cycle) {
  try {
    await scheduleRecurringInvoice(invoiceId, cycle);
  } catch (err) {
    console.error('[invoice] failed to schedule recurring job:', err && err.message);
  }
}

module.exports = {
  // pure helpers (unit-tested)
  computeTotals,
  formatInvoiceNumber,
  // service
  list,
  getById,
  create,
  update,
  cancel,
  sendInvoice,
  remind,
  getInvoicePdf,
  createRecurringOccurrence,
};
