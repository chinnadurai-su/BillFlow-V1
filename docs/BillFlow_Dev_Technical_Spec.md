# BillFlow — Development Technical Specification

**Version:** 4.0 (Final — Architecture + Patterns + MCP + Subagents + Skills + Hooks, fully consolidated)
**Type:** SaaS Billing & Invoicing Platform
**Domain Model:** Subscription/Invoice management (Chargebee-style)

---

## 1. System Overview

BillFlow is a full-stack SaaS billing platform that lets businesses manage customers, generate invoices, track payments, and automate recurring billing reminders.

### 1.1 Core Capabilities
- Customer management (CRUD)
- Invoice generation (manual + recurring)
- PDF invoice export
- Payment tracking & reconciliation
- Automated email reminders
- Dashboard analytics (revenue, outstanding, overdue)
- Audit logging for compliance

---

## 2. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend Framework | Angular 21 | Standalone Components, Signals |
| State Management | NgRx | For shared/global state |
| Backend Runtime | Node.js | LTS version |
| Backend Framework | Express.js | REST API |
| Database | MongoDB Atlas | Document store |
| ODM | Mongoose | Schema validation, transactions |
| Queue | BullMQ | Job processing |
| Queue Broker | Redis | BullMQ backend |
| Charts | Chart.js | Dashboard visualizations |
| PDF Generation | PDFKit | Invoice PDFs |
| Email | SendGrid (`@sendgrid/mail`) | Transactional + reminder emails |
| Auth | JWT | Access + refresh token pattern |
| Frontend Hosting | Netlify | CI/CD via Git |
| Backend Hosting | Render | Node web service |

---

## 3. High-Level Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                         CLIENT (Browser)                        │
│              Angular 21 SPA — Standalone + Signals               │
└──────────────────────────────┬───────────────────────────────────┘
                                │ HTTPS / REST (JSON)
┌──────────────────────────────▼───────────────────────────────────┐
│                     Node.js + Express API Layer                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │   Auth   │ │ Customer │ │ Invoice  │ │ Payment  │ │  Notify │ │
│  │  Module  │ │  Module  │ │  Module  │ │  Module  │ │ Module  │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └─────────┘ │
└───────┬──────────────────────────────────────────┬───────────────┘
        │                                            │
┌───────▼────────┐                          ┌────────▼─────────┐
│  MongoDB Atlas  │                          │   Redis + BullMQ  │
│  (Mongoose ODM) │                          │   (Job Queue)     │
└─────────────────┘                          └────────┬─────────┘
                                                        │
                                          ┌─────────────▼──────────────┐
                                          │  Worker Process             │
                                          │  - PDFKit (generate PDF)    │
                                          │  - SendGrid (send email)    │
                                          └─────────────────────────────┘
```

---

## 4. Folder Structure

```
BillFlow/
├── .claude/
│   ├── CLAUDE.md                      # Project rules for Claude Code
│   ├── agents/
│   │   ├── frontend-agent.md
│   │   ├── backend-agent.md
│   │   ├── testing-agent.md
│   │   └── reviewer-agent.md
│   └── skills/
│       └── idempotent-endpoint/
│           └── SKILL.md
├── .mcp.json                          # GitHub / Render / Netlify MCP config
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── core/                 # Guards, interceptors, services (singleton)
│   │   │   ├── shared/                # Reusable components, pipes, directives
│   │   │   ├── features/
│   │   │   │   ├── auth/
│   │   │   │   ├── customers/
│   │   │   │   ├── invoices/
│   │   │   │   ├── payments/
│   │   │   │   └── dashboard/
│   │   │   ├── store/                 # NgRx: actions, reducers, effects, selectors
│   │   │   └── app.config.ts
│   │   └── environments/
│   └── angular.json
│
├── backend/
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   │   ├── auth.controller.js
│   │   │   │   ├── auth.service.js
│   │   │   │   └── auth.routes.js
│   │   │   ├── customer/
│   │   │   ├── invoice/
│   │   │   ├── payment/
│   │   │   └── notification/
│   │   ├── models/                    # Mongoose schemas
│   │   │   ├── Customer.js
│   │   │   ├── Invoice.js
│   │   │   ├── Payment.js
│   │   │   ├── AuditLog.js
│   │   │   ├── IdempotencyKey.js
│   │   │   └── User.js
│   │   ├── middleware/
│   │   │   ├── auth.middleware.js
│   │   │   ├── idempotency.middleware.js
│   │   │   └── errorHandler.js
│   │   ├── jobs/                      # BullMQ job definitions
│   │   │   ├── invoiceReminder.job.js
│   │   │   └── recurringInvoice.job.js
│   │   ├── workers/                   # BullMQ worker processes
│   │   │   └── invoice.worker.js
│   │   ├── utils/
│   │   │   ├── pdfGenerator.js
│   │   │   └── emailTemplates.js
│   │   ├── config/
│   │   │   ├── db.js
│   │   │   └── redis.js
│   │   └── server.js
│   └── package.json
│
├── docs/
│   └── BillFlow_Dev_Technical_Spec.md
├── tests/
│   ├── frontend/
│   └── backend/
├── docker/
└── .env.example
```

---

## 5. Data Models (Mongoose Schemas)

### 5.1 User
```js
{
  _id: ObjectId,
  name: String,
  email: String (unique, required),
  passwordHash: String,
  role: String (enum: 'admin', 'staff'),
  createdAt: Date,
  updatedAt: Date
}
```

### 5.2 Customer
```js
{
  _id: ObjectId,
  name: String (required),
  email: String (required),
  phone: String,
  billingAddress: {
    line1: String,
    city: String,
    state: String,
    zip: String,
    country: String
  },
  balance: Number (default: 0),      // running outstanding balance
  createdBy: ObjectId (ref: User),
  createdAt: Date,
  updatedAt: Date
}
```

### 5.3 Invoice
```js
{
  _id: ObjectId,
  invoiceNumber: String (unique, auto-generated),   // human-readable ID shown to customers (e.g. "INV-2026-0042")
  customerId: ObjectId (ref: Customer, required),   // which customer this invoice belongs to
  items: [{                                          // line items — an array so an invoice can have multiple products/services
    description: String,
    quantity: Number,
    unitPrice: Number,
    total: Number                                    // = quantity * unitPrice, calculated at creation time
  }],
  subtotal: Number,                                  // sum of all item totals, before tax
  tax: Number,
  totalAmount: Number,                                // subtotal + tax — the final amount customer owes
  status: String (enum: 'draft', 'sent', 'paid', 'overdue', 'cancelled'), // tracks invoice lifecycle
  dueDate: Date,
  isRecurring: Boolean (default: false),              // if true, this invoice auto-regenerates on a schedule
  recurringCycle: String (enum: 'monthly', 'quarterly', 'yearly', null), // only relevant if isRecurring is true
  pdfUrl: String,                                     // where the generated PDF is stored, filled in after PDFKit runs
  idempotencyKey: String (unique, sparse),             // "sparse" means the unique constraint only applies to
                                                        // documents that actually have this field — most queries
                                                        // won't set this directly (it's mainly for reference/debugging,
                                                        // the real idempotency check happens via the separate
                                                        // IdempotencyKey collection, see Section 7.1)
  createdAt: Date,
  updatedAt: Date
}
```

### 5.4 Payment
```js
{
  _id: ObjectId,
  invoiceId: ObjectId (ref: Invoice, required),        // which invoice this payment is for
  customerId: ObjectId (ref: Customer, required),      // denormalized here too, so we don't always need to
                                                          // look up the invoice just to know who paid
  amount: Number (required),
  method: String (enum: 'card', 'bank_transfer', 'cash', 'other'),
  status: String (enum: 'pending', 'completed', 'failed'), // payment gateway/reconciliation status
  transactionRef: String,                                // external reference ID from payment gateway (if any)
  idempotencyKey: String (unique, sparse),                // same purpose as in Invoice — see Section 7.1
  createdAt: Date
}
```

### 5.5 AuditLog
```js
{
  _id: ObjectId,
  action: String,                     // e.g. 'INVOICE_CREATED', 'PAYMENT_UPDATED'
  entityType: String,                 // 'Invoice', 'Customer', 'Payment'
  entityId: ObjectId,
  performedBy: ObjectId (ref: User),
  beforeState: Object,
  afterState: Object,
  timestamp: Date
}
```

---

## 6. API Endpoints

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register new user (sends a welcome email via SendGrid — see note) |
| POST | `/api/auth/login` | Login, returns JWT |
| POST | `/api/auth/refresh` | Refresh access token |
| POST | `/api/auth/logout` | Invalidate refresh token |

> **Welcome email:** on successful registration, `auth.service.register()` synchronously sends a
> "Registration Successful" welcome email via SendGrid (`utils/mailer.sendMail` +
> `welcomeEmailTemplate`). It is **best-effort** — a send failure is caught and logged, and never
> fails the registration (registration success must not depend on email delivery). Registration is
> not routed through BullMQ; only recurring invoices and reminders use the queue.

### Customers
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/customers` | List customers (paginated, filterable) |
| GET | `/api/customers/:id` | Get customer details |
| POST | `/api/customers` | Create customer |
| PUT | `/api/customers/:id` | Update customer |
| DELETE | `/api/customers/:id` | Delete/archive customer |

### Invoices
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/invoices` | List invoices (filter by status, customer, date range) |
| GET | `/api/invoices/:id` | Get invoice detail |
| POST | `/api/invoices` | Create invoice (requires `Idempotency-Key` header) |
| PUT | `/api/invoices/:id` | Update invoice |
| DELETE | `/api/invoices/:id` | Cancel invoice |
| GET | `/api/invoices/:id/pdf` | Download invoice PDF |
| POST | `/api/invoices/:id/send` | Send invoice email to customer |
| POST | `/api/invoices/:id/remind` | Send a payment reminder email (FR-4.1, manual trigger) |

### Payments
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/payments` | List payments |
| POST | `/api/payments` | Record payment (requires `Idempotency-Key` header) |
| GET | `/api/payments/:id` | Payment detail |

### Dashboard
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/dashboard/summary` | Revenue, outstanding, overdue counts |
| GET | `/api/dashboard/revenue-trend` | Time-series data for charts |

---

## 7. Key Implementation Patterns

### 7.1 Idempotency-Key Pattern

**Problem it solves:** Network retries or double-clicks on "Create Invoice" / "Record Payment" can trigger the same request twice. Without protection, this creates duplicate invoices/payments.

**Flow:**
- Client generates a UUID and sends it in `Idempotency-Key` header for POST `/invoices` and POST `/payments`
- Middleware checks if key exists in `IdempotencyKey` collection
- If exists → return the previously stored response (no duplicate write, controller never runs again)
- If not → let the request proceed, then store the key + response after processing
- Keys auto-expire after 24 hours via TTL index (short-term protection only, no need to keep forever)

**`models/IdempotencyKey.js`:**
```js
// Import Mongoose — the ODM (Object Document Mapper) we use to talk to MongoDB
const mongoose = require('mongoose');

// Schema definition for the IdempotencyKey collection
// This collection ONLY stores idempotency keys and their cached responses —
// it does not store any business data (no invoice/payment details here)
const idempotencyKeySchema = new mongoose.Schema({

  // The unique key sent by the client in the "Idempotency-Key" request header
  // "unique: true" means MongoDB itself will reject a duplicate insert of the same key
  key: { type: String, required: true, unique: true },

  // The HTTP status code that was returned the first time this request was processed
  // (e.g. 201 for "Created"). We store it so we can return the exact same status on repeat calls
  statusCode: { type: Number, required: true },

  // The actual response body sent back the first time (e.g. { invoiceId, invoiceNumber, ... })
  // "Mixed" type means it can store any shape of object — since different endpoints
  // (invoices, payments) will return different response structures
  response: { type: mongoose.Schema.Types.Mixed, required: true },

  // Timestamp of when this key was first stored
  // "expires: 86400" creates a MongoDB TTL (Time-To-Live) index —
  // MongoDB automatically deletes this document 86400 seconds (24 hours) after createdAt
  // We don't need to keep idempotency keys forever — they only protect against
  // short-term retries (network blips, double-clicks), not long-term storage
  createdAt: { type: Date, default: Date.now, expires: 86400 }
});

// Export the compiled model so other files (like the middleware) can import and use it
module.exports = mongoose.model('IdempotencyKey', idempotencyKeySchema);
```

**`middleware/idempotency.middleware.js`:**
```js
// Import the IdempotencyKey model we just defined
const IdempotencyKey = require('../models/IdempotencyKey');

// This is an Express middleware — it runs BEFORE the actual controller function
// (req, res, next) is the standard Express middleware signature
async function idempotencyMiddleware(req, res, next) {

  // Read the "Idempotency-Key" header sent by the client
  // Header names in Express are automatically lowercased, so we read it as lowercase
  const key = req.headers['idempotency-key'];

  // If the client didn't send a key at all, just skip this protection
  // and let the request go through normally (next() passes control to the controller)
  if (!key) return next();

  // Check the database — has this exact key been used before?
  const existing = await IdempotencyKey.findOne({ key });

  if (existing) {
    // This key was already processed successfully before.
    // Instead of running the controller again (which would create a duplicate
    // invoice/payment), we just send back the SAME response we sent the first time.
    return res.status(existing.statusCode).json(existing.response);
  }

  // --- If we reach here, this is a NEW request we haven't seen before ---

  // We want to capture whatever response the controller eventually sends,
  // so we "wrap" the original res.json function.
  // originalJson keeps a reference to the real res.json method
  const originalJson = res.json.bind(res);

  // We override res.json so that whenever the controller calls res.json(data),
  // our custom version runs FIRST — it saves the key + response to the database,
  // and THEN calls the real res.json to actually send the response to the client
  res.json = async (body) => {
    await IdempotencyKey.create({
      key,                        // the same key from the header
      statusCode: res.statusCode, // whatever status code the controller set (e.g. 201)
      response: body              // the actual response data the controller is sending
    });
    return originalJson(body); // now actually send the response to the client
  };

  // Let the request continue to the actual controller (e.g. createInvoice)
  next();
}

// Export so routes can plug this in before their controller functions
module.exports = idempotencyMiddleware;
```

**Usage:**
```js
// The middleware runs BEFORE the controller function.
// Express runs functions in order: request → idempotencyMiddleware → controller
// If the middleware calls res.json() itself (duplicate key case), the controller
// function below never even runs — Express stops there.
router.post('/invoices', idempotencyMiddleware, invoiceController.createInvoice);
router.post('/payments', idempotencyMiddleware, paymentController.recordPayment);
```

### 7.2 MongoDB Multi-Document Transactions
- Used in Invoice creation flow: `Invoice.create()` + `Customer.updateBalance()` + `AuditLog.create()` wrapped in a `session.withTransaction()` block
- Ensures all-or-nothing consistency

### 7.3 AuditLog Middleware
- A post-save/post-update hook (or explicit service-layer call) captures before/after state for sensitive entities
- Never log passwords or payment card data

### 7.4 BullMQ Job Flow
```
Invoice created (isRecurring: true)
   → recurringInvoice.job scheduled with cron pattern (per recurringCycle)
   → Worker picks job at scheduled time
   → Creates new Invoice document
   → Queues invoiceReminder.job (PDF + email)
   → invoice.worker.js generates PDF (PDFKit) + sends email (SendGrid)
```

### 7.5 NgRx + Signals Split
- **NgRx store**: auth state, customer list (shared across invoice creation, dashboard), global loading/error state
- **Signals**: component-local UI state — form values, toggle states, computed totals in invoice form

### 7.6 Redis Quick Reference (for BullMQ)
Redis's only role in BillFlow is as the **broker/storage layer for BullMQ** — it is not used as the primary database.

```js
// config/redis.js
// ioredis is the Node.js client library we use to connect to Redis
const Redis = require('ioredis');

// Create one shared connection using the REDIS_URL from our .env file
// (e.g. redis://localhost:6379 for local dev, or a cloud Redis URL for production)
const connection = new Redis(process.env.REDIS_URL);

// Export this single connection so both job producers (jobs/) and
// job consumers (workers/) use the SAME Redis connection instead of
// each file creating its own — this avoids opening too many connections
module.exports = connection;
```

```js
// jobs/recurringInvoice.job.js — adding a job to the queue
// (this file is called from wherever an invoice is created, not run standalone)

// Queue is the BullMQ class used to ADD jobs — it does not process them
const { Queue } = require('bullmq');
const connection = require('../config/redis');

// Create (or connect to) a queue named "invoiceJobs" — this name must match
// exactly what the worker listens to, otherwise jobs will never be picked up
const invoiceQueue = new Queue('invoiceJobs', { connection });

// Add a job to the queue. This does NOT run the PDF generation immediately —
// it just writes a record to Redis saying "this job needs to be done".
// A separate worker process picks it up whenever it's free.
await invoiceQueue.add(
  'generatePDF',                     // job name/type — the worker checks this to decide what to do
  { invoiceId: invoice._id },        // job data — whatever info the worker needs to do its work
  {
    attempts: 3,                     // if the job fails, BullMQ will automatically retry up to 3 times
    backoff: { type: 'exponential', delay: 5000 } // wait 5s, then 10s, then 20s between retries
                                                    // (exponential backoff avoids hammering a failing service)
  }
);
```

```js
// workers/invoice.worker.js — processing jobs
// This file runs as a SEPARATE process from the main API server
// (started with something like: node src/workers/invoice.worker.js)

const { Worker } = require('bullmq');
const connection = require('../config/redis');
const { generatePDF } = require('../utils/pdfGenerator');
const { sendInvoiceEmail } = require('../utils/emailTemplates');

// Worker listens on the SAME queue name ("invoiceJobs") that jobs are added to.
// Whenever a new job appears in Redis, this callback function runs automatically.
const worker = new Worker('invoiceJobs', async (job) => {

  // job.name tells us which TYPE of job this is (we might add more job types later,
  // e.g. 'sendReminder', 'generateReport' — each handled differently here)
  if (job.name === 'generatePDF') {

    // job.data is whatever we passed in when the job was added (invoiceId here)
    const pdfPath = await generatePDF(job.data.invoiceId);

    // After the PDF is ready, immediately email it to the customer
    await sendInvoiceEmail(job.data.invoiceId, pdfPath);
  }

  // If this function throws an error, BullMQ automatically triggers a retry
  // (based on the "attempts" and "backoff" settings we defined when adding the job)
}, { connection });
```

Local dev setup: `brew install redis` (Mac) → `redis-server` to start → confirm with `redis-cli ping` (should return `PONG`).

---

## 8. Non-Functional Requirements

| Area | Requirement |
|---|---|
| Auth | JWT access token (15 min expiry) + refresh token (7 days), httpOnly cookie for refresh |
| Validation | Mongoose schema validation + class-validator/DTO validation at controller layer |
| Error Handling | Centralized error middleware, consistent error response shape `{ success, message, errorCode }` |
| Rate Limiting | Recommend `express-rate-limit` on auth and payment endpoints |
| Logging | Request logging (morgan) + AuditLog for domain events |
| Pagination | Cursor or offset-based pagination on list endpoints (default limit 20) |
| Testing | Jest for backend unit/integration tests; Angular TestBed for frontend |

---

## 9. Environment Variables (`.env.example`)

```
# Server
PORT=5000
NODE_ENV=development

# Database
MONGODB_URI=mongodb+srv://...

# Redis
REDIS_URL=redis://...

# JWT
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Email (SendGrid)
# EMAIL_FROM must be a SendGrid-verified sender. If SENDGRID_API_KEY is blank, the app runs in
# DRY-RUN mode (composes but never sends) — convenient for local dev and tests.
SENDGRID_API_KEY=
EMAIL_FROM="BillFlow <no-reply@billflow.app>"

# Frontend
CLIENT_URL=https://billflow.netlify.app
```

---

## 10. Development Workflow

1. Set up `.env` from `.env.example`
2. `npm install` in both `frontend/` and `backend/`
3. Backend: `npm run dev` (nodemon) — starts API + BullMQ worker
4. Frontend: `ng serve` — starts Angular dev server
5. Seed sample data via `npm run seed` (optional script)
6. Run tests: `npm test` in each folder

---

## 12. AI-Assisted Development Setup (Claude Code)

BillFlow is developed using Claude Code with a structured Agent + Skill + Hook + MCP setup. Each piece has a distinct role:

| | Purpose | Location |
|---|---|---|
| **MCP** | Connects Claude Code to external services (GitHub, Render, Netlify) | `.mcp.json` |
| **Subagents** | Specialized roles that own specific areas of the codebase | `.claude/agents/*.md` |
| **Skills** | Step-by-step reusable procedures for recurring implementation patterns | `.claude/skills/*/SKILL.md` |
| **Hooks** | Automatic triggers that run a command at a specific event (before/after a tool runs) | `.claude/settings.json` |

### 12.1 `.claude/CLAUDE.md`
Contains project-wide rules Claude Code follows automatically on every task:
- Enforces Angular 21 standalone components + Signals/NgRx split
- Enforces idempotency middleware on `/invoices` and `/payments` POST routes
- Enforces MongoDB transactions for multi-collection writes
- Enforces AuditLog entries on sensitive operations
- Documents which subagent owns which task, and when to reach for a skill
- Coding style, testing, and commit conventions

### 12.2 Subagents (`.claude/agents/`)
| Agent | Responsibility | Status |
|---|---|---|
| `frontend-agent.md` | Angular components, services, forms, Signals/NgRx state | Ready |
| `backend-agent.md` | Express APIs, Mongoose schemas, BullMQ jobs, idempotency/transactions | Ready |
| `testing-agent.md` | Jest + Angular TestBed tests, idempotency & transaction test coverage | Ready |
| `reviewer-agent.md` | Pre-commit checklist — idempotency, transactions, audit logs, no leaked secrets | Ready |
| `database-agent.md` | Schema design, indexing strategy, query optimization | Create when schema decisions come up |
| `security-agent.md` | Auth flow review, input sanitization, dependency audits | Create when Payment module work begins |
| `devops-agent.md` | Render/Netlify deployment configs, CI/CD, env var management | Create when deployment work starts |

### 12.3 Skills (`.claude/skills/`)
Skills capture a recurring implementation pattern as a step-by-step guide with real code, so it's applied consistently every time instead of being re-derived from scratch (or drifting) on each task.

| Skill | Purpose | Status |
|---|---|---|
| `idempotent-endpoint` | Full pattern for protecting a POST endpoint against duplicate execution — model, middleware, route wiring, and required test case | Ready |
| `mongoose-transaction` | Boilerplate for multi-collection atomic writes using `session.withTransaction()` | Create when needed |
| `invoice-pdf-generation` | Correct PDFKit layout/formatting steps for generating invoice PDFs | Create when needed |

**Skill file format** — every `SKILL.md` starts with YAML frontmatter so Claude Code can auto-discover relevance:
```yaml
---
name: idempotent-endpoint
description: Use this skill when building any POST endpoint that creates or changes financial records...
---
```

### 12.4 MCP Configuration (`.mcp.json`)
| MCP Server | Used For | Status |
|---|---|---|
| GitHub | Creating PRs, listing/triaging issues, reviewing open PRs | Connected |
| Render | Creating/managing the backend web service, checking deployments and logs | Available, connect when deploying |
| Netlify | Deploying and managing the frontend site | Available, connect when deploying |

Setup requires a GitHub fine-grained Personal Access Token with `Contents`, `Pull requests`, and `Issues` permissions, stored as `GITHUB_PERSONAL_ACCESS_TOKEN` (never committed — add to `.gitignore`).

### 12.5 Typical Workflow — All Three Working Together
```
"Build Payment recording API"
   → backend-agent (Subagent) picks up the task
   → backend-agent follows idempotent-endpoint (Skill) for the correct pattern
   → testing-agent (Subagent) writes Jest tests, including the duplicate-key test
   → reviewer-agent (Subagent) checks idempotency/transaction/audit-log rules
   → GitHub MCP creates a PR with a summary
```

### 12.6 Hooks (`.claude/settings.json`)
Hooks are automatic triggers — a command runs by itself at a specific event, without being asked each time.

| Hook Event | Fires When | Status |
|---|---|---|
| `PostToolUse` (after Edit) | Every time a backend file is edited → auto-run `npm test` | Not yet configured — add once test suite is stable |
| `PreToolUse` (before commit) | Before `git commit` → auto-run lint + format check | Not yet configured — add once CI conventions are settled |
| `PreToolUse` (dangerous commands) | Before risky shell commands (e.g. `rm -rf`) → warn/block | Not yet configured |

Example config shape:
```json
{
  "hooks": {
    "PostToolUse": [
      { "matcher": "Edit", "hooks": [{ "type": "command", "command": "npm test" }] }
    ]
  }
}
```
Not needed at BillFlow's current stage (early development) — worth adding once the codebase is large enough that manual "run tests" reminders become a bottleneck.

### 12.7 Git & GitHub Automation
Local git operations (`init`, `add`, `commit`, branch management) run through Claude Code's built-in bash tool — no MCP needed for these. GitHub MCP takes over for anything remote: creating the repo, pushing, opening PRs, managing issues.

```bash
# One-time local setup (setup-git.sh)
git init
git add .
git commit -m "feat: initial project setup"
git branch -M main
```
Then in Claude Code: `"Create a GitHub repo called BillFlow and push this project"` — GitHub MCP handles repo creation and push.

---

## 13. Redis — Quick Context (For Reference)

Redis is used **only** as the storage/broker layer for BullMQ — not as the primary database and not (yet) as a general-purpose cache. Local development uses `redis-server` (installed via `brew install redis` on Mac). Production should use a managed free tier (Upstash recommended over Render's free Redis, which expires after 90 days).

**Scope needed for this project:** basic key-value concept, a few CLI commands (`SET`/`GET`/`EXPIRE`), `ioredis` connection setup, and comfort with the BullMQ queue/worker pattern (Section 7.6). Advanced Redis topics (Cluster/Sentinel, Pub/Sub, persistence internals, deep caching strategy) are out of scope for BillFlow's current needs.

---

## 14. Open Items / To Decide

- [ ] Multi-tenancy strategy (single DB with tenantId field vs. DB-per-tenant)
- [ ] File storage for generated PDFs (store in DB, S3-compatible bucket, or Render disk)
- [ ] Rate limiting thresholds per endpoint
- [ ] Webhook support for payment gateway integration (future)
- [ ] Role-based permission granularity (currently just admin/staff)
- [ ] Redis provider for production (Upstash free tier recommended)
- [ ] When to create database-agent, security-agent, devops-agent, and remaining skills

---

*This is the final consolidated development spec — covers architecture, data models, API contracts, implementation patterns, and the full AI-assisted dev workflow (MCP + Subagents + Skills). Update as implementation decisions are finalized.*