// customer.routes.js — Express router for the 5 customer endpoints (Spec Section 6 — Customers).
//
//   GET    /api/customers       — List customers (paginated, filterable)
//   GET    /api/customers/:id   — Get customer details
//   POST   /api/customers       — Create customer
//   PUT    /api/customers/:id   — Update customer
//   DELETE /api/customers/:id   — Archive customer (soft-delete, BR-5)
//
// All routes require authentication (Spec Section 8). Per BR-5, DELETE is a soft ARCHIVE, which
// Staff are allowed to perform — so no admin-only guard here. (Hard delete is not exposed at all.)

const express = require('express');
const customerController = require('./customer.controller');
const authMiddleware = require('../../middleware/auth.middleware');

const router = express.Router();

// Protect every customer route with JWT auth.
router.use(authMiddleware);

router.get('/', customerController.listCustomers);
router.get('/:id', customerController.getCustomer);
router.post('/', customerController.createCustomer);
router.put('/:id', customerController.updateCustomer);
router.delete('/:id', customerController.deleteCustomer);

module.exports = router;
