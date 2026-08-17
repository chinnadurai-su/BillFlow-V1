// customer.controller.js — Express request handlers for customer CRUD (Spec Section 6 — Customers).
//
// TODO: implement CRUD handlers matching Section 6 endpoints, delegating to customer.service:
//   listCustomers  GET    /api/customers      — paginated (default limit 20) + filterable (Spec 8)
//   getCustomer    GET    /api/customers/:id  — fetch one, 404 if not found
//   createCustomer POST   /api/customers      — validate DTO, create, write AuditLog (Spec 7.3)
//   updateCustomer PUT    /api/customers/:id  — validate, update, write AuditLog with before/after
//   deleteCustomer DELETE /api/customers/:id  — delete/archive, write AuditLog

// eslint-disable-next-line no-unused-vars
async function listCustomers(req, res, next) {
  // TODO: call customer.service.js (paginated list)
  return res.status(501).json({ success: false, message: 'Not implemented', errorCode: 'NOT_IMPLEMENTED' });
}

// eslint-disable-next-line no-unused-vars
async function getCustomer(req, res, next) {
  // TODO: call customer.service.js
  return res.status(501).json({ success: false, message: 'Not implemented', errorCode: 'NOT_IMPLEMENTED' });
}

// eslint-disable-next-line no-unused-vars
async function createCustomer(req, res, next) {
  // TODO: call customer.service.js
  return res.status(501).json({ success: false, message: 'Not implemented', errorCode: 'NOT_IMPLEMENTED' });
}

// eslint-disable-next-line no-unused-vars
async function updateCustomer(req, res, next) {
  // TODO: call customer.service.js
  return res.status(501).json({ success: false, message: 'Not implemented', errorCode: 'NOT_IMPLEMENTED' });
}

// eslint-disable-next-line no-unused-vars
async function deleteCustomer(req, res, next) {
  // TODO: call customer.service.js
  return res.status(501).json({ success: false, message: 'Not implemented', errorCode: 'NOT_IMPLEMENTED' });
}

module.exports = { listCustomers, getCustomer, createCustomer, updateCustomer, deleteCustomer };
