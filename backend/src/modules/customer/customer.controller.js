// customer.controller.js — thin Express handlers for customer CRUD (Spec Section 6 — Customers).
//
// Controllers stay thin (project rule): they read req params/body/user, delegate to
// customer.service, shape the { success, data } response, and forward errors via next(err).

const customerService = require('./customer.service');

// GET /api/customers — paginated + filterable list (FR-1.4).
async function listCustomers(req, res, next) {
  try {
    const result = await customerService.list(req.query);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return next(err);
  }
}

// GET /api/customers/:id — one customer (404 if missing).
async function getCustomer(req, res, next) {
  try {
    const customer = await customerService.getById(req.params.id);
    return res.status(200).json({ success: true, data: customer });
  } catch (err) {
    return next(err);
  }
}

// POST /api/customers — create (writes AuditLog).
async function createCustomer(req, res, next) {
  try {
    const customer = await customerService.create(req.body, req.user && req.user.id);
    return res.status(201).json({ success: true, data: customer });
  } catch (err) {
    return next(err);
  }
}

// PUT /api/customers/:id — update (writes AuditLog with before/after).
async function updateCustomer(req, res, next) {
  try {
    const customer = await customerService.update(req.params.id, req.body, req.user && req.user.id);
    return res.status(200).json({ success: true, data: customer });
  } catch (err) {
    return next(err);
  }
}

// DELETE /api/customers/:id — soft archive (BR-5), writes AuditLog.
async function deleteCustomer(req, res, next) {
  try {
    const customer = await customerService.archive(req.params.id, req.user && req.user.id);
    return res.status(200).json({ success: true, data: customer });
  } catch (err) {
    return next(err);
  }
}

module.exports = { listCustomers, getCustomer, createCustomer, updateCustomer, deleteCustomer };
