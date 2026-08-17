// customer.service.js — business logic for customer CRUD (BRD FR-1.1–FR-1.4, BR-2, BR-5).
//
// Rules enforced here:
//   - AuditLog entry on every create/update/archive (FR-6.1), atomically with the change (Spec 7.2).
//   - `balance` is NEVER accepted from the client (BR-2) — only a whitelist of editable fields is
//     applied. Balance is maintained by the invoice/payment flows.
//   - Delete is a SOFT archive (status → 'archived'), never a hard delete (BR-5 / FR-1.2).

const Customer = require('../../models/Customer');
const ApiError = require('../../utils/ApiError');
const withTransaction = require('../../utils/withTransaction');
const { writeAudit } = require('../../utils/audit');
const { parsePagination, paginatedResult } = require('../../utils/pagination');

// The only fields a client may set/change. Note the absence of balance/status/createdBy.
const EDITABLE_FIELDS = ['name', 'email', 'phone', 'billingAddress'];

function pickEditable(input = {}) {
  const out = {};
  for (const field of EDITABLE_FIELDS) {
    if (input[field] !== undefined) out[field] = input[field];
  }
  return out;
}

/**
 * List customers with pagination + optional name/email search and status filter (FR-1.4).
 * Defaults to active customers only (archived are hidden unless status='archived'|'all').
 * @param {object} query req.query
 */
async function list(query = {}) {
  const { page, limit, skip } = parsePagination(query);

  const filter = {};
  // Status filter: default to active; 'all' removes the filter; otherwise use the given value.
  if (query.status === 'all') {
    // no status filter
  } else if (query.status) {
    filter.status = query.status;
  } else {
    filter.status = 'active';
  }

  // Case-insensitive search across name/email (FR-1.4).
  if (query.search) {
    const term = String(query.search).trim();
    // Escape regex metacharacters so a search term can't act as a pattern.
    const safe = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { name: { $regex: safe, $options: 'i' } },
      { email: { $regex: safe, $options: 'i' } },
    ];
  }

  const [items, total] = await Promise.all([
    Customer.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Customer.countDocuments(filter),
  ]);

  return paginatedResult(items, total, { page, limit });
}

/**
 * Get one customer by id. Throws 404 if not found.
 * @param {string} id
 */
async function getById(id) {
  const customer = await Customer.findById(id);
  if (!customer) throw new ApiError(404, 'Customer not found', 'CUSTOMER_NOT_FOUND');
  return customer;
}

/**
 * Create a customer + AuditLog atomically (FR-1.1).
 * @param {object} input request body
 * @param {string} [userId] req.user.id (createdBy + audit performedBy)
 */
async function create(input, userId) {
  const data = pickEditable(input);
  if (!data.name || !data.email) {
    throw new ApiError(400, 'Name and email are required', 'VALIDATION_ERROR');
  }

  return withTransaction(async (session) => {
    const [customer] = await Customer.create([{ ...data, createdBy: userId }], { session });
    await writeAudit({
      action: 'CUSTOMER_CREATED',
      entityType: 'Customer',
      entityId: customer._id,
      performedBy: userId,
      beforeState: null,
      afterState: customer.toObject(),
      session,
    });
    return customer;
  });
}

/**
 * Update a customer + AuditLog (before/after) atomically (FR-1.2, FR-6.1).
 * @param {string} id
 * @param {object} input request body
 * @param {string} [userId]
 */
async function update(id, input, userId) {
  const data = pickEditable(input);

  return withTransaction(async (session) => {
    const customer = await Customer.findById(id).session(session);
    if (!customer) throw new ApiError(404, 'Customer not found', 'CUSTOMER_NOT_FOUND');

    const beforeState = customer.toObject();
    Object.assign(customer, data);
    await customer.save({ session });

    await writeAudit({
      action: 'CUSTOMER_UPDATED',
      entityType: 'Customer',
      entityId: customer._id,
      performedBy: userId,
      beforeState,
      afterState: customer.toObject(),
      session,
    });
    return customer;
  });
}

/**
 * Archive (soft-delete) a customer + AuditLog atomically (FR-1.2, BR-5).
 * Idempotent: archiving an already-archived customer just returns it.
 * @param {string} id
 * @param {string} [userId]
 */
async function archive(id, userId) {
  return withTransaction(async (session) => {
    const customer = await Customer.findById(id).session(session);
    if (!customer) throw new ApiError(404, 'Customer not found', 'CUSTOMER_NOT_FOUND');

    if (customer.status === 'archived') return customer;

    const beforeState = customer.toObject();
    customer.status = 'archived';
    await customer.save({ session });

    await writeAudit({
      action: 'CUSTOMER_ARCHIVED',
      entityType: 'Customer',
      entityId: customer._id,
      performedBy: userId,
      beforeState,
      afterState: customer.toObject(),
      session,
    });
    return customer;
  });
}

module.exports = { list, getById, create, update, archive, EDITABLE_FIELDS };
