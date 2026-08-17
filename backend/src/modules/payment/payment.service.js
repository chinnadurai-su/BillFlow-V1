// payment.service.js — business logic for payments (BRD FR-3.1–FR-3.4, BR-1/BR-2, Spec 7.1/7.2).
//
// record() runs in ONE transaction (Spec 7.2): create Payment + update Invoice status (→ 'paid'
// when fully covered, FR-3.2) + decrement customer balance (FR-3.3) + AuditLog. It is idempotent
// via the payment's unique idempotencyKey (Spec 7.1 / FR-3.4) — a raced duplicate insert is
// rejected by the DB and the existing payment is returned.
//
// Guardrails: cannot pay a cancelled invoice; cannot overpay (amount must not exceed the
// remaining balance). Only 'completed' payments affect invoice status / customer balance.
// Never log card data (BR / Spec 7.3) — `method` is an enum, not a card number.

const Payment = require('../../models/Payment');
const Invoice = require('../../models/Invoice');
const Customer = require('../../models/Customer');
const ApiError = require('../../utils/ApiError');
const withTransaction = require('../../utils/withTransaction');
const { writeAudit } = require('../../utils/audit');
const { parsePagination, paginatedResult } = require('../../utils/pagination');

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const VALID_METHODS = ['card', 'bank_transfer', 'cash', 'other'];

/** List payments with pagination + optional invoiceId/customerId/status filters. */
async function list(query = {}) {
  const { page, limit, skip } = parsePagination(query);

  const filter = {};
  if (query.invoiceId) filter.invoiceId = query.invoiceId;
  if (query.customerId) filter.customerId = query.customerId;
  if (query.status) filter.status = query.status;

  const [items, total] = await Promise.all([
    Payment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Payment.countDocuments(filter),
  ]);
  return paginatedResult(items, total, { page, limit });
}

/** Get one payment by id (404 if missing). */
async function getById(id) {
  const payment = await Payment.findById(id);
  if (!payment) throw new ApiError(404, 'Payment not found', 'PAYMENT_NOT_FOUND');
  return payment;
}

/**
 * Record a payment against an invoice (FR-3.1–3.4).
 * @param {object} input { invoiceId, amount, method, transactionRef, status, idempotencyKey }
 * @param {string} [userId]
 */
async function record(input = {}, userId) {
  const { invoiceId, amount, method, transactionRef, idempotencyKey } = input;

  if (!invoiceId) throw new ApiError(400, 'invoiceId is required', 'VALIDATION_ERROR');
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    throw new ApiError(400, 'amount must be a positive number', 'VALIDATION_ERROR');
  }
  if (method && !VALID_METHODS.includes(method)) {
    throw new ApiError(400, `method must be one of ${VALID_METHODS.join(', ')}`, 'VALIDATION_ERROR');
  }
  // Payments are recorded from external confirmation (BRD assumption) → default 'completed'.
  const status = input.status === 'pending' || input.status === 'failed' ? input.status : 'completed';

  try {
    return await withTransaction(async (session) => {
      const invoice = await Invoice.findById(invoiceId).session(session);
      if (!invoice) throw new ApiError(404, 'Invoice not found', 'INVOICE_NOT_FOUND');
      if (invoice.status === 'cancelled') {
        throw new ApiError(409, 'Cannot record a payment against a cancelled invoice', 'INVOICE_CANCELLED');
      }

      // How much is still owed (based on prior completed payments)?
      const priorPayments = await Payment.find({ invoiceId: invoice._id, status: 'completed' }).session(session);
      const paidSoFar = priorPayments.reduce((sum, p) => sum + p.amount, 0);
      const remaining = round2(invoice.totalAmount - paidSoFar);

      // Only 'completed' payments are checked against / applied to the balance.
      if (status === 'completed') {
        if (remaining <= 0) {
          throw new ApiError(409, 'Invoice is already fully paid', 'INVOICE_PAID');
        }
        if (amt > remaining) {
          throw new ApiError(409, `Payment exceeds the remaining balance of ${remaining}`, 'OVERPAYMENT');
        }
      }

      const [payment] = await Payment.create(
        [{
          invoiceId: invoice._id,
          customerId: invoice.customerId, // denormalized (Spec 5.4)
          amount: amt,
          method: method || 'other',
          status,
          transactionRef,
          idempotencyKey: idempotencyKey || undefined,
        }],
        { session }
      );

      await writeAudit({
        action: 'PAYMENT_RECORDED',
        entityType: 'Payment',
        entityId: payment._id,
        performedBy: userId,
        beforeState: null,
        afterState: payment.toObject(),
        session,
      });

      // Apply balance + invoice-status effects only for completed payments.
      if (status === 'completed') {
        // FR-3.3: reduce the customer's outstanding balance.
        await Customer.updateOne(
          { _id: invoice.customerId },
          { $inc: { balance: -amt } },
          { session }
        );

        // FR-3.2: mark the invoice paid once fully covered.
        const newPaidTotal = round2(paidSoFar + amt);
        if (newPaidTotal >= invoice.totalAmount && invoice.status !== 'paid') {
          const beforeState = invoice.toObject();
          invoice.status = 'paid';
          await invoice.save({ session });
          await writeAudit({
            action: 'INVOICE_PAID',
            entityType: 'Invoice',
            entityId: invoice._id,
            performedBy: userId,
            beforeState,
            afterState: invoice.toObject(),
            session,
          });
        }
      }

      return payment;
    });
  } catch (err) {
    // DB-enforced idempotency backstop (Spec 7.1 / FR-3.4).
    if (err && err.code === 11000 && err.keyPattern && err.keyPattern.idempotencyKey && idempotencyKey) {
      const existing = await Payment.findOne({ idempotencyKey });
      if (existing) return existing;
    }
    throw err;
  }
}

module.exports = { list, getById, record };
