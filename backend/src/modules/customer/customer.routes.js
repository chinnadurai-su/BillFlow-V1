// customer.routes.js — Express router for the 5 customer endpoints (Spec Section 6 — Customers).
//
//   GET    /api/customers       — List customers (paginated, filterable)
//   GET    /api/customers/:id   — Get customer details
//   POST   /api/customers       — Create customer
//   PUT    /api/customers/:id   — Update customer
//   DELETE /api/customers/:id   — Delete/archive customer
//
// NOTE: protect these routes with auth.middleware once auth is implemented (Spec Section 8).

const express = require('express');
const customerController = require('./customer.controller');

const router = express.Router();

router.get('/', customerController.listCustomers);
router.get('/:id', customerController.getCustomer);
router.post('/', customerController.createCustomer);
router.put('/:id', customerController.updateCustomer);
router.delete('/:id', customerController.deleteCustomer);

module.exports = router;
