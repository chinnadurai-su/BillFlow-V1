// server.js — Backend entry point: creates the Express app, wires middleware/routes, and starts the API.
//
// Purpose (see Spec Section 3 / 8): bootstraps the Express REST API, connects to MongoDB (config/db),
// mounts module routers (auth, customer, invoice, payment, dashboard), request logging (morgan),
// CORS, and the centralized error handler. On startup it also registers three daily node-cron jobs
// (recurring-invoice generation, overdue flagging, payment reminders) — the app is fully synchronous;
// there is no queue/worker (deliberate simplicity choice, see Spec Section 7).

// Env vars live in backend/environment/.env — load via an absolute path so it works
// regardless of the process working directory (server, worker, seed, tests).
require('dotenv').config({ path: require('path').resolve(__dirname, '../environment/.env') });

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');

const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

// Module routers.
const authRoutes = require('./modules/auth/auth.routes');
const customerRoutes = require('./modules/customer/customer.routes');
const invoiceRoutes = require('./modules/invoice/invoice.routes');
const paymentRoutes = require('./modules/payment/payment.routes');
const dashboardRoutes = require('./modules/dashboard/dashboard.routes');

const app = express();

// --- Global middleware ---
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:4200',
  credentials: true
}));
app.use(express.json());
// cookie-parser populates req.cookies so the auth refresh/logout flow can read the
// httpOnly refreshToken cookie (Spec Section 8). Without this, req.cookies is undefined.
app.use(cookieParser());
app.use(morgan('dev'));

// --- Health check (trivial infra — fully real) ---
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// --- Module routes (Spec Section 6) ---
app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/dashboard', dashboardRoutes);

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

  // Register the three daily maintenance jobs with node-cron (BR-3/BR-4/FR-4.1). Required lazily so
  // importing this module (e.g. in tests) never needs node-cron installed. All run at 00:00 daily.
  try {
    const cron = require('node-cron');
    const { recurringInvoiceCheck } = require('./jobs/recurringInvoiceCheck');
    const { overdueCheck } = require('./jobs/overdueCheck');
    const { reminderCheck } = require('./jobs/reminderCheck');

    // Wrap each so a thrown error is logged, not left as an unhandled rejection.
    const run = (name, fn) => () => Promise.resolve()
      .then(fn)
      .catch((err) => console.error(`[cron] ${name} failed:`, err && err.message));

    cron.schedule('0 0 * * *', run('recurringInvoiceCheck', recurringInvoiceCheck));
    cron.schedule('0 0 * * *', run('overdueCheck', overdueCheck));
    cron.schedule('0 0 * * *', run('reminderCheck', reminderCheck));
    console.log('[server] scheduled daily cron jobs: recurring, overdue, reminder');
  } catch (err) {
    console.error('[server] failed to schedule cron jobs:', err.message);
  }
}

// Only auto-start when run directly (not when imported by tests via supertest).
if (require.main === module) {
  start();
}

module.exports = app;
