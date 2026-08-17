// server.js — Backend entry point: creates the Express app, wires middleware/routes, and starts the API.
//
// Purpose (see Spec Section 3 / 8): bootstraps the Express REST API, connects to MongoDB (config/db),
// mounts module routers (auth, customer, invoice, payment), request logging (morgan), CORS, and the
// centralized error handler. Notification is worker-triggered and has no router (see module comment).

// Env vars live in backend/environment/.env — load via an absolute path so it works
// regardless of the process working directory (server, worker, seed, tests).
require('dotenv').config({ path: require('path').resolve(__dirname, '../environment/.env') });

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

// Module routers.
const authRoutes = require('./modules/auth/auth.routes');
const customerRoutes = require('./modules/customer/customer.routes');
const invoiceRoutes = require('./modules/invoice/invoice.routes');
const paymentRoutes = require('./modules/payment/payment.routes');

const app = express();

// --- Global middleware ---
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:4200',
  credentials: true
}));
app.use(express.json());
app.use(morgan('dev'));

// --- Health check (trivial infra — fully real) ---
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// --- Module routes (Spec Section 6) ---
app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/payments', paymentRoutes);

// --- Centralized error handler (must be mounted last, Spec Section 8) ---
app.use(errorHandler);

/**
 * Start the HTTP server, then attempt the DB connection.
 * We start listening regardless so /health and the API surface come up even if
 * MongoDB isn't reachable yet (useful during scaffolding / local dev).
 */
async function start() {
  const port = process.env.PORT || 5000;

  app.listen(port, () => console.log(`[server] listening on port ${port}`));

  try {
    await connectDB();
  } catch (err) {
    console.error('[server] MongoDB connection failed:', err.message);
    // Don't exit — the server stays up; DB-backed endpoints will error until it connects.
  }
}

// Only auto-start when run directly (not when imported by tests via supertest).
if (require.main === module) {
  start();
}

module.exports = app;
