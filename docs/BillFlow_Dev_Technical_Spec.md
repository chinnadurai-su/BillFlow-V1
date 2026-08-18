# BillFlow — Development Technical Specification

**Version:** 5.1 (Scheduling model documented as synchronous + node-cron across all docs)
**Last updated:** 2026-08-18
**Type:** SaaS Billing & Invoicing Platform
**Domain Model:** Subscription/Invoice management (Chargebee-style)

> This spec describes the intended architecture of the repository. Business-level requirements live
> in [`BillFlow_BRD.md`](./BillFlow_BRD.md); design-decision rationale and trade-offs live in
> [`INTERVIEW_NOTES.md`](./INTERVIEW_NOTES.md).

> **Changelog — v5.1:** Background processing is documented as **synchronous request handling +
> in-process node-cron** for scheduled work (recurring invoices, overdue flagging, reminders), with
> **no Redis/BullMQ queue or worker process**. This was a deliberate simplicity choice for this
> project's scale (see §7.12); a BullMQ + Redis queue is documented as the upgrade path when
> decoupled retries and cross-process scaling are needed. README, `INTERVIEW_NOTES.md`, and
> `.claude/CLAUDE.md` were aligned to the same model in this pass.

---

## 1. System Overview

BillFlow is a full-stack SaaS billing platform: businesses manage customers, generate invoices
(manual + recurring), track payments, and automate overdue flagging and reminder emails — with
financial-grade correctness (idempotency, transactions, audit logging) built in.

### 1.1 Core Capabilities (all implemented)
- Customer management (CRUD + soft archive, running outstanding balance)
- Invoice generation (manual + recurring), server-computed totals, auto invoice numbers
- PDF invoice export (PDFKit)
- Payment recording & reconciliation (auto invoice→paid, balance updates)
- Automated overdue flagging + reminder emails (daily node-cron + SendGrid)
- "Registration Successful" welcome email on sign-up
- Dashboard analytics (revenue, outstanding, overdue) via MongoDB aggregation
- Role-based access (Admin / Staff) + audit logging for compliance

---

## 2. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend framework | Angular 21 | Standalone components + Signals (no NgModules) |
| Shared state | NgRx | Auth state only; component-local state uses Signals |
| Charts | Chart.js | Dashboard revenue trend |
| Backend runtime | Node.js ≥ 20 | (dev/test run on Node 24) |
| Backend framework | Express.js 4 | REST API, feature-module layout |
| Database | MongoDB Atlas | Replica set (required for transactions) |
| ODM | Mongoose 8 | Schema validation + multi-document transactions |
| Scheduling | node-cron | Daily checks: recurring invoices, overdue flagging, reminders |
| PDF generation | PDFKit | Invoice PDFs (returned as a Buffer) |
| Email | **SendGrid** (`@sendgrid/mail`) | Transactional + reminder emails (dry-run when no key) |
| Auth | JWT (jsonwebtoken) | Access (15 min) + refresh (7 days, httpOnly cookie) |
| Password hashing | bcrypt | `select: false` password hash |
| Testing (BE) | Jest + supertest + `mongodb-memory-server` | Socket-free unit + DB-backed integration |
| Testing (FE) | Angular TestBed (Karma + Jasmine) | Component/service specs |
| Hosting | Netlify (frontend) / Render (backend) | CI/CD via Git |

---

## 3. High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         CLIENT (Browser)                           │
│              Angular 21 SPA — Standalone + Signals + NgRx          │
└──────────────────────────────┬─────────────────────────────────────┘
                               │ HTTPS / REST (JSON) — Bearer access token
                               │ + httpOnly refresh cookie
┌──────────────────────────────▼─────────────────────────────────────┐
│                     Node.js + Express API Layer                     │
│  auth ─ middleware(auth/idempotency/error) ─ customer ─ invoice ─   │
│  payment ─ dashboard ─ notification(sync sender) ─ utils            │
│                                                                     │
│  Request handlers do ALL work synchronously, incl. PDF (PDFKit) +   │
│  email (SendGrid) inline on invoice send (best-effort, try/catch).  │
│                                                                     │
│  node-cron (in-process) — three daily jobs at 00:00:                │
│    • recurringInvoiceCheck → generate due recurring occurrences     │
│    • overdueCheck          → flag past-due 'sent' invoices           │
│    • reminderCheck         → email approaching/past-due reminders    │
└──────────────────────────────┬─────────────────────────────────────┘
                               │
                     ┌─────────▼──────────┐
                     │   MongoDB Atlas    │
                     │   (Mongoose ODM)   │
                     └────────────────────┘
```

- **No queue/worker.** This is a deliberate simplicity choice for a learning/interview project (see
  §7.12): CRUD/auth flows and PDF+email run synchronously in the request; recurring/overdue/reminder
  logic runs as three daily in-process **node-cron** checks. Email sends are wrapped in try/catch so a
  delivery failure never breaks the main flow (the invoice/payment still succeeds).
- **Frontend state split:** access token in an Angular Signal (+ localStorage); current user in NgRx;
  component-local UI (forms, computed totals) in Signals.

---

## 4. Folder Structure (current)

```
BillFlow/
├── .claude/                              # AI-assisted dev config (agents, skills, CLAUDE.md)
├── docs/                                 # BRD, this spec, INTERVIEW_NOTES
├── README.md
│
├── backend/
│   ├── environment/                      # .env (git-ignored) + .env.example
│   ├── jest.config.js
│   └── src/
│       ├── config/                       # db.js (Mongoose connection)
│       ├── middleware/                   # auth.middleware, idempotency.middleware, errorHandler
│       ├── models/                       # User, Customer, Invoice, Payment, AuditLog,
│       │                                 #   IdempotencyKey, Counter, RevokedToken
│       ├── modules/
│       │   ├── auth/                      # controller / service / routes
│       │   ├── customer/
│       │   ├── invoice/
│       │   ├── payment/
│       │   ├── dashboard/                # summary + revenue-trend (aggregation)
│       │   └── notification/             # synchronous email sender (no HTTP routes)
│       ├── jobs/                         # node-cron daily checks:
│       │                                 #   recurringInvoiceCheck, overdueCheck, reminderCheck
│       ├── utils/                        # tokens, ApiError, mailer(SendGrid), emailTemplates,
│       │                                 #   pdfGenerator, audit, withTransaction, pagination, format
│       └── server.js                     # Express app + schedules the 3 cron jobs on startup
│
├── backend/tests/                        # Jest: *.unit.test.js (socket-free) + *.test.js (DB-backed)
│   ├── setup.env.js, jest.config.js, helpers/{db,authApp}.js
│
└── frontend/
    ├── netlify.toml
    └── src/
        ├── environments/                 # environment.ts / environment.prod.ts (apiUrl)
        └── app/
            ├── core/                     # api.service, auth.interceptor, auth.guard, models/
            ├── shared/                   # loading-spinner, confirm-dialog
            ├── store/                    # auth.actions / auth.reducer / auth.selectors / app.state
            ├── features/
            │   ├── auth/ (login, register, auth.service, auth.models)
            │   ├── customers/ (list, form, customer.service, customer.models)
            │   ├── invoices/ (list, form, detail, invoice.service, invoice.models)
            │   ├── payments/ (list, form, payment.service, payment.models)
            │   └── dashboard/ (dashboard, dashboard-chart, dashboard.service, dashboard.models)
            ├── app.config.ts             # providers: router, HttpClient+interceptor, NgRx store
            └── app.routes.ts             # lazy standalone routes, authGuard on feature routes
```

---

## 5. Data Models (Mongoose Schemas)

All schemas live in `backend/src/models/`. Indexes are declared for frequent query fields.

### 5.1 User
```
name, email (unique, lowercase, required),
passwordHash (select: false — never returned by default),
role (enum: 'admin' | 'staff', default 'staff'),
timestamps
```
`toJSON` strips `passwordHash` and `__v`. Role is **never** settable via public registration.

### 5.2 Customer
```
name (required), email (required, format-validated), phone,
billingAddress { line1, city, state, zip, country },
balance (Number, default 0)         // running outstanding balance — server-maintained (BR-2)
status (enum: 'active' | 'archived', default 'active')   // soft-delete (BR-5)
createdBy (ref User), timestamps
```
Indexes: `status`, `email`, `name`.

### 5.3 Invoice
```
invoiceNumber (unique)              // "INV-2026-0042", auto-generated via Counter
customerId (ref Customer, required)
items [{ description, quantity, unitPrice, total }]   // total computed server-side
subtotal, tax, totalAmount          // computed server-side (FR-2.2)
status (enum: draft | sent | paid | overdue | cancelled, default draft)
dueDate, isRecurring (bool), recurringCycle (enum: monthly | quarterly | yearly | null)
pdfUrl                              // (declared; PDFs are streamed on demand — see §13)
lastReminderAt (Date)               // guards the upcoming-due reminder sweep (FR-4.1)
idempotencyKey (unique, sparse)     // DB-enforced duplicate-write backstop (§7.1)
timestamps
```
Indexes: `customerId`, `status`, `dueDate`, `(status, dueDate)` (for the overdue sweep).

### 5.4 Payment
```
invoiceId (ref Invoice, required), customerId (ref Customer, required)  // denormalized
amount (required), method (enum: card | bank_transfer | cash | other),
status (enum: pending | completed | failed, default pending),
transactionRef, idempotencyKey (unique, sparse),
createdAt only (no updatedAt)
```
Indexes: `invoiceId`, `customerId`.

### 5.5 AuditLog
```
action, entityType ('Invoice'|'Customer'|'Payment'), entityId,
performedBy (ref User), beforeState, afterState (sanitized), timestamp
```
Sensitive keys (password/token/card fields, idempotencyKey) are stripped before write (§7.3).

### 5.6 IdempotencyKey
```
key (unique), statusCode, response (Mixed), createdAt (TTL 24h)
```

### 5.7 Counter  *(infra — added for invoice numbering)*
```
_id (scope string, e.g. "invoice-2026"), seq (Number)
static next(id, session) → atomic $inc, upsert   // race-safe sequential numbers
```

### 5.8 RevokedToken  *(infra — refresh-token denylist for logout/rotation)*
```
tokenHash (SHA-256 of refresh token, unique), userId, expiresAt (TTL — auto-purged at expiry)
```

---

## 6. API Endpoints

Response envelope: success → `{ success: true, data }` (list endpoints add
`{ items, pagination: { page, limit, total, pageCount, hasNextPage } }`); error → the centralized
shape `{ success: false, message, errorCode }`. All non-auth routes require a Bearer access token.

### Auth  (`/api/auth`)  — public; `register`/`login` are rate-limited
| Method | Endpoint | Description |
|---|---|---|
| POST | `/register` | Create user (role forced to `staff`); sends a best-effort welcome email |
| POST | `/login` | Verify credentials → access token + sets httpOnly refresh cookie |
| POST | `/refresh` | Rotate refresh token (old one denylisted) → new access token |
| POST | `/logout` | Revoke the refresh token (denylist) + clear cookie |

### Customers  (`/api/customers`)  — auth required
| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | List (paginated; `search`, `status` filters) |
| GET | `/:id` | Get one (404 if missing) |
| POST | `/` | Create (+ AuditLog) |
| PUT | `/:id` | Update (+ AuditLog before/after) |
| DELETE | `/:id` | **Archive** (soft-delete, BR-5) — not a hard delete |

### Invoices  (`/api/invoices`)  — auth required
| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | List (filter by `status`, `customerId`, date range) |
| GET | `/:id` | Get one |
| POST | `/` | Create — **requires `Idempotency-Key` header** (§7.1); txn: invoice + balance + audit |
| PUT | `/:id` | Update items/dueDate/recurring flag (recomputes totals, adjusts balance) |
| DELETE | `/:id` | **Cancel** (soft, BR-1) — **Admin only** (BR-5) |
| GET | `/:id/pdf` | Stream the generated PDF (FR-2.6) |
| POST | `/:id/send` | Mark sent + generate PDF & email it (synchronous, FR-2.7) |
| POST | `/:id/remind` | Send a payment reminder email (synchronous, FR-4.1, manual trigger) |

### Payments  (`/api/payments`)  — auth required
| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | List (filter by `invoiceId`, `customerId`, `status`) |
| POST | `/` | Record — **requires `Idempotency-Key` header**; txn: payment + invoice→paid + balance + audit |
| GET | `/:id` | Get one |

### Dashboard  (`/api/dashboard`)  — auth required
| Method | Endpoint | Description |
|---|---|---|
| GET | `/summary` | `{ totalRevenue, totalOutstanding, totalOverdue, overdueCount }` (FR-5.1) |
| GET | `/revenue-trend` | Time-series of completed payments; params `from`, `to`, `granularity` (day/month) (FR-5.2) |

---

## 7. Key Implementation Patterns

### 7.1 Idempotency (two layers) — Spec 7.1 / FR-2.8 / FR-3.4
1. **Cache layer** — `idempotency.middleware.js` on POST `/invoices` & `/payments`: looks up the
   `Idempotency-Key` header in the `IdempotencyKey` collection; on hit, replays the stored response
   (controller never runs). It caches **only 2xx** responses (so a transient 4xx/5xx never gets
   pinned) and the cache write is best-effort/race-tolerant.
2. **DB backstop** — the controller forwards the header to the service, which stores it as the
   invoice/payment's unique `idempotencyKey`. If two requests race past the cache, the second
   `insert` hits the unique index (E11000) and the service returns the existing record. This makes
   idempotency correct even under true concurrency.

### 7.2 MongoDB transactions — `utils/withTransaction.js`
Every write touching >1 collection runs inside `session.withTransaction()`: invoice create
(number + invoice + customer balance + audit), payment record (payment + invoice status + balance +
audit), customer create/update/archive, invoice update/cancel, overdue flip. **No standalone
fallback** — transactions require a replica set (Atlas provides one; tests use a single-node
replica set). We fail loudly rather than silently drop atomicity on financial writes.

### 7.3 Audit logging — `utils/audit.js`
`writeAudit({ action, entityType, entityId, performedBy, beforeState, afterState, session })` writes
an `AuditLog` entry inside the same transaction as the change. `sanitize()` strips sensitive keys
(password/token/card fields, idempotencyKey) so secrets never reach the audit trail (BRD FR-6.2).

### 7.4 Auth — `utils/tokens.js`, `modules/auth`
- Access token (15 min) carries `{ sub, role, email }`; refresh token (7 days) carries `{ sub }`.
- Refresh is stored in an **httpOnly cookie**; `/refresh` **rotates** it (old token hash added to the
  `RevokedToken` denylist) and re-reads the user's current role.
- `register` **never** accepts a client-supplied role → always `staff` (prevents privilege
  escalation). Passwords hashed with bcrypt; hash is `select: false`.

### 7.5 RBAC — `middleware/auth.middleware.js`
`authMiddleware` verifies the Bearer token and sets `req.user = { id, role, email }`.
`requireRole('admin')` guards Admin-only actions — currently **invoice cancel** (BR-5). Staff may
archive customers, record payments, and create/edit invoices.

### 7.6 Invoice numbering — `models/Counter.js`
`Counter.next('invoice-<year>', session)` atomically `$inc`s a per-year sequence, formatted as
`INV-YYYY-NNNN`. Atomic + transaction-scoped → race-safe, no duplicate numbers.

### 7.7 Balance invariant (BR-2)
`customer.balance = Σ(totalAmount of non-cancelled invoices) − Σ(completed payments)`, maintained
incrementally inside transactions: +total on invoice create, −amount on payment, −remaining on
cancel, delta on invoice edit. **Never** accepted from the client.

### 7.8 Overdue auto-flagging (BR-4) — `jobs/overdueCheck.js`
The daily `overdueCheck` cron finds `sent` invoices past `dueDate`, re-reads each inside a
transaction (guards against a lost update vs a just-recorded payment), and flips it to `overdue` +
writes an AuditLog. `overdueCheck(now)` takes an injectable clock and is tested directly.

### 7.9 Recurring invoices (BR-3) — `jobs/recurringInvoiceCheck.js` + `invoice.service`
A recurring **template** invoice (`isRecurring: true`) stores a `nextRecurrenceAt` date. The daily
`recurringInvoiceCheck` cron finds templates whose `nextRecurrenceAt` has passed and calls
`invoiceService.createRecurringOccurrence()`, which — in ONE transaction — creates the concrete
occurrence (`isRecurring: false`, status `sent`), increments the customer balance, writes an
AuditLog, and advances the template's `nextRecurrenceAt` by one cycle. The new occurrence is then
emailed (best-effort). The series stops when the template is no longer recurring, is cancelled, or
the customer is archived (all re-checked inside the transaction). `cycleToDelayMs()` maps
monthly/quarterly/yearly to an approximate interval.

### 7.10 Reminders (FR-4.1) — `jobs/reminderCheck.js`
The daily `reminderCheck` cron finds unpaid invoices (`sent`/`overdue`) that are approaching (due
within 3 days) or already past due and haven't been reminded within a cooldown (3 days, guarded by
`lastReminderAt`), and emails each a reminder via `notification.service`. A manual
`POST /invoices/:id/remind` is also exposed.

### 7.11 Email (SendGrid) — `utils/mailer.js` + `utils/emailTemplates.js` + `modules/notification`
`sendMail({ to, subject, html, text, attachments })` owns the SendGrid transport. It is **lazily
required** (importing the mailer never needs the package/network) and **dry-runs** when
`SENDGRID_API_KEY` is unset (composes but doesn't send) — ideal for dev/tests. Buffer attachments
(the invoice PDF) are base64-encoded for the SendGrid API. Templates: `invoiceSentTemplate`,
`paymentReminderTemplate`, `welcomeEmailTemplate` — all HTML-escape user content.
`notification.service` composes template + PDF and calls `sendMail` **synchronously**; every caller
(invoice send/remind, the welcome email, the cron checks) wraps it in try/catch so a delivery
failure is logged and never breaks the main flow.

### 7.12 Scheduling & the no-queue decision — `jobs/`, `server.js`
**Deliberate simplicity choice for a learning/interview project:** BillFlow has **no message queue
or worker process**. CRUD/auth flows and PDF+email run **synchronously** in the request handler
(email best-effort), and the three periodic concerns run as in-process **node-cron** jobs scheduled
at `0 0 * * *` (daily midnight) from `server.js`: `recurringInvoiceCheck`, `overdueCheck`,
`reminderCheck`. `node-cron` is required lazily inside `start()` so importing the app (e.g. in tests)
never needs it. Trade-off vs a BullMQ/Redis queue: no retries/backoff, no cross-process scaling, and
a slow SendGrid call briefly occupies the request thread — all acceptable at this scale, and far
less infrastructure to run and reason about. (A queue would be the upgrade path for production scale.)

### 7.13 Error handling — `middleware/errorHandler.js`
Centralized; maps `ApiError`, Mongoose `ValidationError`/`CastError`/duplicate-key (11000) to proper
statuses, returns `{ success, message, errorCode }`, and never leaks internals on 5xx.

### 7.14 Frontend state split (NgRx + Signals) — Spec 7.5
- **NgRx** store holds the shared **auth** feature (current user + status).
- The **access token** lives in a Signal (persisted to localStorage; read synchronously by the HTTP
  interceptor) — intentionally kept OUT of the store/devtools.
- **Signals** power component-local state: form values, list filters, pagination, and computed
  invoice subtotal/tax/total in the invoice form.

### 7.15 Frontend HTTP layer — `core/`
- `ApiService` prefixes `environment.apiUrl`, unwraps the `{ data }` envelope, and normalizes errors
  into an `AppError` (distinguishing `NETWORK_ERROR` from backend errors); supports per-call headers
  (client-generated `Idempotency-Key` via `crypto.randomUUID()` on invoice/payment create) and a
  `getBlob` path for PDF download.
- `authInterceptor` attaches the Bearer token to backend calls and, on a 401, calls `refresh()`
  **once** (concurrent 401s share one in-flight refresh), retries, and on refresh failure clears the
  session and routes to `/auth/login`.
- `authGuard` (`CanActivateFn`) allows navigation when authenticated, else redirects to login.

---

## 8. Non-Functional Requirements

| Area | Requirement / Implementation |
|---|---|
| Data integrity | Multi-collection writes are atomic (transactions); balance is server-computed |
| Duplicate prevention | Idempotency on money endpoints (cache + DB unique key) |
| Auth | JWT access (15m) + refresh (7d, httpOnly cookie, rotated + denylisted) |
| Validation | Mongoose schema validation + service-layer checks |
| Error handling | Centralized middleware, consistent `{ success, message, errorCode }` |
| Rate limiting | `express-rate-limit` on `/auth/register` and `/auth/login` |
| Logging | morgan request logging + AuditLog for domain events; never logs secrets |
| Pagination | Offset-based, default limit 20 (cap 100) |
| Availability | Email is best-effort (try/catch) so it never blocks CRUD; periodic work runs via daily node-cron, not in the request path |

---

## 9. Environment Variables (`backend/environment/.env.example`)

```
# Server
NODE_ENV=development
PORT=5000
CLIENT_URL=http://localhost:4200          # CORS origin (Angular dev / Netlify in prod)

# Database (replica set required for transactions)
MONGODB_URI=

# Auth / JWT
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
BCRYPT_SALT_ROUNDS=10

# Email (SendGrid) — blank SENDGRID_API_KEY ⇒ dry-run (composes, never sends)
SENDGRID_API_KEY=
EMAIL_FROM="BillFlow <no-reply@billflow.app>"
```
Also read by code (optional): `COMPANY_NAME` and `CURRENCY_SYMBOL` (PDF/email branding + money
formatting). The real `.env` lives in `backend/environment/` and is **git-ignored** — never commit secrets.

---

## 10. Testing Strategy

**Backend (Jest).** Two tiers, so the security-critical logic runs anywhere:
- **Socket-free unit tests** (`*.unit.test.js`, `utils.test.js`, `backend-logic.unit.test.js`,
  `notification.test.js`, `mailer.test.js`): JWT/middleware/RBAC, idempotency middleware behavior,
  invoice totals + numbering, recurring cycle math, audit sanitize, pagination, dashboard pipeline,
  templates, PDF buffer, mailer payload — no DB or socket.
- **DB-backed integration** (`*.test.js` wrapped in `describeDb`): full flows via `mongodb-memory-server`
  (standalone for reads, **single-node replica set** for transactions) + supertest — including the
  **idempotency duplicate-key** test (service + HTTP) and **transaction rollback**, RBAC, balance
  math, overdue/recurring/reminders, dashboard aggregation, welcome email.
- Env: run on Node ≥ 20. Where TCP/Mongo is unavailable, set `BILLFLOW_SKIP_DB_TESTS=1` to skip the
  DB tier cleanly. Infra: `tests/setup.env.js`,
  `tests/helpers/db.js` (`connect` / `connectReplSet` / `clearDatabase` / `closeDatabase`).

**Frontend.** Angular TestBed with Karma + Jasmine (`ng test`) — component + service specs.

---

## 11. Deployment

- **Frontend → Netlify** (`frontend/netlify.toml`); `environment.prod.ts` points `apiUrl` at the
  Render API.
- **Backend → Render** — a single web service (`npm start`); set env vars in the Render dashboard.
  MongoDB via Atlas (a replica set, required for transactions). No Redis/worker needed — the daily
  node-cron jobs run in the same process. (Note: on multi-instance hosting the cron would run on
  every instance; single-instance is assumed at this scale.)

---

## 12. AI-Assisted Development (Claude Code)

| Piece | Purpose | Location |
|---|---|---|
| **CLAUDE.md** | Project-wide rules (stack, idempotency/transaction/audit mandates, conventions) | `.claude/CLAUDE.md` |
| **Subagents** | `frontend-agent`, `backend-agent`, `testing-agent`, `reviewer-agent` | `.claude/agents/*.md` |
| **Skills** | `idempotent-endpoint` (POST-protection pattern) | `.claude/skills/*/SKILL.md` |
| **MCP** | GitHub / Render / Netlify integrations | `.mcp.json` |

Workflow: backend-agent builds an endpoint → follows the `idempotent-endpoint` skill → testing-agent
adds Jest coverage (incl. the duplicate-key test) → reviewer-agent applies the pre-commit checklist
(idempotency, transactions, audit logs, no leaked secrets, no `any`, tests present).

---

## 13. Known Gaps / To Decide

- **PDF storage** — PDFs are rendered on demand and streamed; `Invoice.pdfUrl` is declared but never
  populated (no bucket/disk persistence yet). Decide: store in a bucket vs keep on-demand.
- **`npm run seed`** references `src/seed.js`, which does not exist yet — add a seed script (also the
  supported way to create the first **admin**, since registration only creates `staff`).
- **Invoice list date params** — the frontend `InvoiceService.getAll` sends `fromDate`/`toDate`, but
  the backend list filter reads `from`/`to`; align these.
- **`authGuard` returnUrl** — the guard redirects to `/auth/login` but does not yet preserve the
  attempted URL as `returnUrl`.
- **Payment `pending`/`failed`** statuses have no promotion path to `completed` yet.
- Multi-currency, multi-tenancy, and live payment-gateway webhooks remain out of scope (per BRD §3.2).

---

*This spec reflects the implemented codebase as of the version/date above. Update it alongside code
changes.*
