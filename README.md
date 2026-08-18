# BillFlow

> A full-stack SaaS billing & invoicing platform — manage customers, generate invoices, record payments, automate recurring billing and reminders, and watch revenue on a dashboard — built around financial-grade correctness patterns (idempotency, transactions, audit logging).

<p align="left">
  <img alt="Angular" src="https://img.shields.io/badge/Angular-21-DD0031?logo=angular&logoColor=white">
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-%3E%3D20-339933?logo=nodedotjs&logoColor=white">
  <img alt="Express" src="https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white">
  <img alt="MongoDB" src="https://img.shields.io/badge/MongoDB-Atlas%20%2F%20Mongoose%208-47A248?logo=mongodb&logoColor=white">
  <img alt="node-cron" src="https://img.shields.io/badge/Scheduling-node--cron-2F855A">
  <img alt="SendGrid" src="https://img.shields.io/badge/Email-SendGrid-1A82E2?logo=minutemailer&logoColor=white">
  <img alt="License" src="https://img.shields.io/badge/license-UNLICENSED-lightgrey">
</p>

BillFlow is a Chargebee-style billing system split into an **Angular 21 standalone SPA** and a **Node.js + Express REST API** backed by **MongoDB Atlas (Mongoose)**. It is designed around financial-grade correctness: every money-moving `POST` is idempotent (a fast-path response cache **plus** a unique-index database backstop), multi-collection writes run inside MongoDB transactions, and every sensitive write is audit-logged with secrets scrubbed. Slow work — PDF rendering and email delivery — runs **synchronously** in the request handler (best-effort, so a delivery hiccup never fails the operation), and scheduled work — recurring-invoice generation, the daily overdue sweep, and reminders — runs as in-process **node-cron** jobs. This is a deliberate scale-appropriate simplification for a learning/portfolio project; see [Architecture Decisions](#key-implementation-patterns) for how it would evolve to a BullMQ + Redis queue at higher scale.

Requirements traceability throughout this document uses the `FR-*` / `BR-*` IDs from [`docs/BillFlow_BRD.md`](docs/BillFlow_BRD.md).

---

## Table of Contents

- [Project Status](#project-status)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Available Scripts](#available-scripts)
- [API Reference](#api-reference)
- [Key Implementation Patterns](#key-implementation-patterns)
- [Data Models](#data-models)
- [Testing](#testing)
- [Deployment](#deployment)
- [AI-Assisted Development](#ai-assisted-development)
- [Contributing & Conventions](#contributing--conventions)
- [License](#license)

---

## Project Status

BillFlow is **substantially implemented**, not a scaffold. The backend is feature-complete across all five modules; the Angular frontend is built out end-to-end (auth, customers, invoices, payments, dashboard). The remaining gaps are deployment wiring and a couple of dangling references, called out honestly below.

| Layer | Status | Notes |
|---|---|---|
| **Backend — REST API** | ✅ Implemented | Auth, Customers, Invoices, Payments, Dashboard modules all wired and mounted in `server.js`. No `TODO` stubs in `backend/src/modules/`. |
| **Backend — background & scheduled jobs** | ✅ Implemented | Three in-process **node-cron** daily jobs — `recurringInvoiceCheck`, `overdueCheck`, `reminderCheck` — scheduled from `server.js`. No separate worker process. |
| **Backend — data models** | ✅ Implemented | 8 Mongoose models incl. `Counter` (sequential invoice numbers) and `RevokedToken` (refresh-token denylist). |
| **Backend — tests** | ✅ Implemented | Socket-free unit tests + DB-backed integration tests (Jest + `mongodb-memory-server`). See [Testing](#testing). |
| **Frontend — SPA** | ✅ Implemented | Angular 21 standalone components + Signals; NgRx holds the auth slice only. All feature routes are lazy-loaded behind `authGuard`. |
| **Frontend — tests** | 🟡 Present | `*.spec.ts` sibling per component/service, run via Karma/Jasmine (`ng test`). |
| **Deployment — Netlify (frontend)** | 🟡 Configured | `frontend/netlify.toml` builds with `npx ng build` and publishes `dist/billflow/browser`. |
| **Deployment — Render (backend)** | 🟡 Manual | No Render blueprint checked in; the prod API URL in `environment.prod.ts` is still a **placeholder** (`billflow-api.onrender.com`). |

**Honest caveats (worth knowing before you start):**

- `npm run seed` is defined in `backend/package.json` but **`backend/src/seed.js` does not exist** — the script is a dangling reference today.
- `environment.prod.ts` `apiUrl` is a TODO placeholder; point it at your real Render URL before a production build.
- `Invoice.pdfUrl` is a declared-but-unused field — PDFs are always rendered on demand, never stored.
- The auth `returnUrl` deep-link redirect is only half-wired on the frontend (the guard never sets the query param), so post-login always lands on `/dashboard`.

---

## Features

Mapped to the BRD (`docs/BillFlow_BRD.md`).

- **Customer management** — create, edit, soft-archive, and search/filter customers with a server-maintained running balance (FR-1.1–FR-1.4). Balance is never client-settable — only invoice/payment `$inc` operations move it (BR-2).
- **Invoices** — line items with **server-computed** subtotal/tax/total (FR-2.1–FR-2.2), five-state lifecycle `draft → sent → paid/overdue/cancelled` (FR-2.3), atomic **per-year sequential numbers** like `INV-2026-0042` (FR-2.4), on-demand **PDF** rendering (FR-2.6), and email send (FR-2.7). Invoices are never hard-deleted — cancel only (BR-1); cancellation is **admin-only** (BR-5, RBAC).
- **Recurring invoices** — a daily `recurringInvoiceCheck` cron finds recurring templates whose next occurrence is due, generates the next invoice (monthly/quarterly/yearly), and stops cleanly when the flag is turned off, the source is cancelled, or the customer is archived (FR-2.5, BR-3).
- **Overdue auto-flagging** — a daily `overdueCheck` cron sweep flips past-due `sent` invoices to `overdue` (system-computed, never manual) and fires a reminder (FR-2.9, BR-4).
- **Payments** — record full/partial payments with method + optional transaction ref; server marks the invoice `paid` and decrements the balance when fully covered (FR-3.1–FR-3.3). Overpayment and paying a cancelled invoice are rejected.
- **Idempotent money endpoints** — `POST /invoices` and `POST /payments` honor an `Idempotency-Key` header, backed by both a response cache and a unique-index DB backstop (FR-2.8, FR-3.4).
- **Notifications** — email via SendGrid, sent **synchronously** but best-effort (wrapped in try/catch so a delivery failure never blocks the operation): invoice-sent (with PDF attachment), due-soon reminders, overdue reminders, and manual reminders (FR-4.1–FR-4.3). A **welcome email** is sent on registration (best-effort, synchronous).
- **Dashboard** — total revenue, total outstanding, overdue totals/count, and a revenue-trend time series for charts (FR-5.1–FR-5.2).
- **Auth & RBAC** — JWT access tokens (15 min) + rotating refresh tokens (7 days, httpOnly cookie) with a SHA-256 denylist for logout/rotation; `admin` / `staff` roles (FR-7.1–FR-7.3, BR-5).
- **Audit trail** — every sensitive create/update/delete on Invoice/Customer/Payment writes an `AuditLog` entry inside the same transaction, with secrets scrubbed (FR-6.1–FR-6.2).

---

## Architecture

```
                         ┌───────────────────────────────────┐
                         │         Angular 21 SPA              │
                         │  Standalone components + Signals    │
                         │  NgRx (auth slice only)             │
                         │  authInterceptor: Bearer + refresh  │
                         └───────────────┬─────────────────────┘
                                         │ HTTPS  (Bearer access token,
                                         │         httpOnly refresh cookie)
                                         ▼
     ┌──────────────────────────────────────────────────────────────────┐
     │                    Express REST API  (server.js)                   │
     │  cors → json → cookie-parser → morgan → routers → errorHandler     │
     │                                                                    │
     │  /api/auth   /api/customers   /api/invoices   /api/payments        │
     │                        /api/dashboard                              │
     │                                                                    │
     │  middleware:  authMiddleware · requireRole · idempotencyMiddleware │
     │  patterns:    withTransaction() · writeAudit() · Counter.next()    │
     │                                                                    │
     │  Request handlers do ALL work synchronously, incl. PDF (PDFKit) +  │
     │  email (SendGrid) inline on invoice send (best-effort, try/catch). │
     │                                                                    │
     │  node-cron (in-process) — three daily jobs at 00:00:               │
     │    • recurringInvoiceCheck → generate due recurring occurrences    │
     │    • overdueCheck          → flag past-due 'sent' invoices          │
     │    • reminderCheck         → email approaching / past-due reminders │
     └───────┬─────────────────────────────────────────────────┬─────────┘
             │ Mongoose                                         │ (dry-run
             ▼                                                  │  if no key)
   ┌────────────────────┐                                       ▼
   │  MongoDB (replica   │                                  ┌──────────┐
   │  set — required for │                                  │ SendGrid │
   │  transactions)      │                                  │ @sendgrid│
   │                     │                                  │  /mail   │
   │  users, customers,  │                                  └──────────┘
   │  invoices, payments,│
   │  auditlogs,         │
   │  counters,          │
   │  idempotencykeys,   │
   │  revokedtokens      │
   └─────────────────────┘
```

Key points: there is deliberately **no message queue or separate worker process** — the API serves HTTP and runs all slow (PDF/email) and scheduled (recurring/overdue/reminder) work in-process, the latter via **node-cron** daily jobs. Email is best-effort (try/catch) so a delivery failure never fails a CRUD/payment operation. Transactions require a MongoDB **replica set** — there is deliberately no standalone fallback (losing atomicity on financial writes fails loudly instead). See [Key Implementation Patterns](#key-implementation-patterns) for why this scale-appropriate choice was made and how it would evolve to a BullMQ + Redis queue.

---

## Tech Stack

| Area | Technology | Notes |
|---|---|---|
| Frontend | Angular 21 (standalone + Signals) | No NgModules; feature-folder structure |
| Frontend state | NgRx `@ngrx/store` / `@ngrx/effects` 21 | Shared **auth slice only**; lists use component-local Signals |
| Charts | Chart.js 4 | Dashboard revenue-trend line chart |
| Backend | Node.js ≥ 20 + Express 4 | Thin controllers → `*.service.js` business logic |
| Database | MongoDB + Mongoose 8 | Atlas or local **replica set** (for transactions) |
| Scheduling | node-cron | Three daily in-process jobs: recurring invoices, overdue sweep, reminders |
| PDF | PDFKit | In-memory `Buffer`, rendered on demand |
| Email | **SendGrid** (`@sendgrid/mail` 8) | Dry-run when `SENDGRID_API_KEY` is unset |
| Auth | `jsonwebtoken` 9 + `bcrypt` 5 | Access/refresh JWTs; bcrypt password hashing |
| Hardening | `express-rate-limit`, `cors`, `cookie-parser`, `morgan` | Rate-limit on `/register` + `/login` |
| Backend tests | Jest 29 + Supertest 7 + `mongodb-memory-server` 10 | Unit + DB-backed integration |
| Frontend tests | Karma + Jasmine | `ng test` |
| Deployment | Netlify (frontend) · Render (backend) | See [Deployment](#deployment) |

---

## Project Structure

```
BillFlow-V1/
├── backend/
│   ├── environment/
│   │   ├── .env.example        # committed template (no secrets)
│   │   └── .env                # git-ignored — you create this
│   ├── src/
│   │   ├── server.js           # app wiring; mounts routers; schedules cron jobs
│   │   ├── config/             # db.js (Mongoose connection)
│   │   ├── middleware/         # auth, idempotency, errorHandler
│   │   ├── models/             # User, Customer, Invoice, Payment, AuditLog,
│   │   │                       #   Counter, IdempotencyKey, RevokedToken
│   │   ├── modules/
│   │   │   ├── auth/            # register/login/refresh/logout
│   │   │   ├── customer/        # CRUD + soft-archive
│   │   │   ├── invoice/         # CRUD, PDF, send, remind, recurring
│   │   │   ├── payment/         # record + list/get
│   │   │   ├── dashboard/       # summary + revenue-trend
│   │   │   └── notification/    # synchronous email sender (no HTTP routes)
│   │   ├── jobs/               # node-cron daily checks: recurringInvoiceCheck,
│   │   │                       #   overdueCheck, reminderCheck
│   │   └── utils/              # tokens, audit, withTransaction, mailer,
│   │                           #   emailTemplates, pdfGenerator, pagination,
│   │                           #   format, ApiError
│   ├── tests/                  # unit + DB-backed suites + helpers/
│   ├── jest.config.js
│   └── package.json
├── frontend/
│   ├── src/app/
│   │   ├── app.config.ts        # providers: router, http+interceptor, NgRx
│   │   ├── app.routes.ts        # lazy standalone routes behind authGuard
│   │   ├── core/               # ApiService, authGuard, authInterceptor, models
│   │   ├── features/           # auth, customers, invoices, payments, dashboard
│   │   ├── shared/             # loading-spinner, confirm-dialog
│   │   └── store/              # NgRx auth slice (actions/reducer/selectors)
│   ├── src/environments/       # environment.ts, environment.prod.ts
│   ├── netlify.toml            # build + SPA redirect
│   ├── angular.json
│   └── package.json
├── docs/                        # BRD, Technical Spec, Interview Notes
├── docker/                      # reserved (empty)
└── .claude/                     # CLAUDE.md, agents/, skills/  (AI-assisted dev)
```

---

## Getting Started

### Prerequisites

- **Node.js ≥ 20** (declared in `backend/package.json` `engines`).
- **MongoDB with transactions enabled** — i.e. a **replica set**, not a standalone `mongod`. Options:
  - MongoDB **Atlas** (any cluster is a replica set), or
  - a **local single-node replica set**: `mongod --replSet rs0 --dbpath /data/db` then, in `mongosh`, `rs.initiate()`.
  - Transactions have **no standalone fallback** — every create/update/cancel/payment will fail on a plain `mongod`.
- **npm** (bundled with Node).

> No Redis or message broker is required — scheduled work runs in-process via node-cron.

### 1. Clone & configure

```bash
git clone <your-fork-url> BillFlow-V1
cd BillFlow-V1
```

Create the backend env file from the committed template (run from `backend/`):

```bash
cd backend
cp environment/.env.example environment/.env
# then edit environment/.env and fill in the real values
```

Generate strong JWT secrets:

```bash
openssl rand -base64 48   # run twice — one for JWT_ACCESS_SECRET, one for JWT_REFRESH_SECRET
```

See [Environment Variables](#environment-variables) for every variable. The real `.env` is git-ignored — **never commit it or any secret**.

### 2. Install dependencies

```bash
# backend
cd backend && npm install

# frontend (separate manifest)
cd ../frontend && npm install
```

### 3. Run in development (two terminals)

The API runs everything in-process (including the node-cron scheduled jobs) — start it alongside the Angular dev server.

```bash
# Terminal 1 — REST API (http://localhost:5000)
cd backend && npm run dev

# Terminal 2 — Angular SPA (http://localhost:4200)
cd frontend && npm start
```

The API comes up even if MongoDB is briefly unreachable (DB-backed endpoints error until it connects). Health check: `GET http://localhost:5000/health` → `{ "status": "ok" }`. If `SENDGRID_API_KEY` is left blank, email runs in **dry-run** mode (composed and logged, never sent) — perfect for local dev.

---

## Environment Variables

Backend variables live in `backend/environment/.env` (template: `backend/environment/.env.example`).

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `NODE_ENV` | no | `development` | Affects cookie `secure`/`sameSite`, rate-limit skip in tests |
| `PORT` | no | `5000` | API listen port |
| `CLIENT_URL` | no | `http://localhost:4200` | CORS origin (Netlify URL in prod) |
| `MONGODB_URI` | **yes** | — | Mongo connection string; **must be a replica set** |
| `JWT_ACCESS_SECRET` | **yes** | — | Signs access tokens (API 500s if unset) |
| `JWT_REFRESH_SECRET` | **yes** | — | Signs refresh tokens (API 500s if unset) |
| `JWT_ACCESS_EXPIRY` | no | `15m` | Access-token lifetime |
| `JWT_REFRESH_EXPIRY` | no | `7d` | Refresh-token lifetime |
| `BCRYPT_SALT_ROUNDS` | no | `10` | bcrypt cost factor |
| `SENDGRID_API_KEY` | no | *(dry-run if unset)* | SendGrid API key (Mail Send permission) |
| `EMAIL_FROM` | no | `BillFlow <no-reply@billflow.app>` | Must be a SendGrid-**verified** sender |
| `COMPANY_NAME` | no | `BillFlow` | Branding in PDFs & emails — **not in `.env.example`** but read by code |
| `CURRENCY_SYMBOL` | no | `$` | Money formatting — **not in `.env.example`** but read by code |

The frontend does not use a `.env` — its API base URL is set in `frontend/src/environments/environment.ts` (dev) and `environment.prod.ts` (prod, currently a placeholder).

> **Never commit `.env` files, secrets, tokens, or API keys.** Only `.env.example` (which contains no secrets) belongs in version control.

---

## Available Scripts

### Backend (`backend/`)

| Script | Command | What it does |
|---|---|---|
| `npm start` | `node src/server.js` | Start the API (production) |
| `npm run dev` | `nodemon src/server.js` | Start the API with reload (development) |
| `npm test` | `jest` | Run the backend test suite |
| `npm run lint` | `eslint src` | Lint backend source |
| `npm run seed` | `node src/seed.js` | ⚠️ Defined but `src/seed.js` does not exist yet (dangling) |

### Frontend (`frontend/`)

| Script | Command | What it does |
|---|---|---|
| `npm start` | `ng serve` | Angular dev server on `:4200` |
| `npm run build` | `npx ng build` | Production build → `dist/billflow/browser` |
| `npm test` | `ng test` | Karma/Jasmine unit tests |

---

## API Reference

Base URL: `http://localhost:5000/api`. All non-auth routes require `Authorization: Bearer <accessToken>`. Success responses use `{ success: true, data }` (single) or `{ success: true, items, pagination }` (lists). Errors use `{ success: false, message, errorCode }`.

### Auth — `/api/auth`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/register` | public* | Register (always `staff`; sends welcome email). Rate-limited. |
| POST | `/login` | public* | Login → `{ user, accessToken }` + httpOnly refresh cookie. Rate-limited. |
| POST | `/refresh` | cookie | Rotate refresh token, issue new access token (old token denylisted) |
| POST | `/logout` | cookie | Revoke refresh token (idempotent) + clear cookie |

<sub>*`/register` and `/login` are rate-limited to 20 attempts / IP / 15 min (disabled under `NODE_ENV=test`).</sub>

### Customers — `/api/customers` (auth required)

| Method | Path | Description |
|---|---|---|
| GET | `/` | List (paginated; `search`, `status` filters — default hides archived) |
| GET | `/:id` | Get one |
| POST | `/` | Create (writes `CUSTOMER_CREATED` audit) |
| PUT | `/:id` | Update (before/after audit) |
| DELETE | `/:id` | **Soft-archive** (BR-5; hard delete is not exposed) |

### Invoices — `/api/invoices` (auth required)

| Method | Path | Description |
|---|---|---|
| GET | `/` | List (filters: `status`, `customerId`, `from`/`to` on createdAt) |
| GET | `/:id` | Get one |
| POST | `/` | Create — **requires `Idempotency-Key` header** (FR-2.8) |
| PUT | `/:id` | Update (locked once paid/cancelled) |
| DELETE | `/:id` | **Cancel** — soft, **admin-only** (BR-1, BR-5) |
| GET | `/:id/pdf` | Stream the invoice PDF (`application/pdf`) |
| POST | `/:id/send` | Mark sent + generate & email the PDF synchronously (FR-2.7) |
| POST | `/:id/remind` | Send a manual payment reminder synchronously (FR-4.1) |

### Payments — `/api/payments` (auth required)

| Method | Path | Description |
|---|---|---|
| GET | `/` | List (filters: `invoiceId`, `customerId`, `status`) |
| POST | `/` | Record payment — **requires `Idempotency-Key` header** (FR-3.4) |
| GET | `/:id` | Get one |

### Dashboard — `/api/dashboard` (auth required)

| Method | Path | Description |
|---|---|---|
| GET | `/summary` | `{ totalRevenue, totalOutstanding, totalOverdue, overdueCount }` (FR-5.1) |
| GET | `/revenue-trend` | Time series of completed payments; query: `from`, `to`, `granularity` (`day`\|`month`, default `month`) (FR-5.2) |

---

## Key Implementation Patterns

- **Idempotency (two layers)** — `idempotencyMiddleware` looks up the `Idempotency-Key` header in the `IdempotencyKey` collection: a hit replays the cached `{ statusCode, response }` and the controller never runs; a miss caches **only 2xx** responses (best-effort, after the response is sent) so a transient failure never blocks a legitimate retry. The **real guarantee** is the unique+sparse `idempotencyKey` index on `Invoice`/`Payment` — a racing duplicate insert throws `E11000` and the service returns the already-existing record. (See the `idempotent-endpoint` skill in `.claude/skills/`.)
- **Transactions** — `withTransaction(fn)` wraps `session.withTransaction()` for every multi-collection write (invoice create adjusts `Customer.balance` + writes an audit log in one atomic unit). Requires a replica set; **no standalone fallback** by design.
- **Audit logging** — `writeAudit()` inserts an `AuditLog` in the *same session* as the business write. `sanitize()` strips a fixed blocklist (`password`, `passwordHash`, `token`, card fields, `idempotencyKey`, …) from before/after snapshots (FR-6.1–6.2).
- **Sequential invoice numbers** — `Counter.next('invoice-<year>', session)` does an atomic `$inc` inside the create transaction, yielding race-free numbers like `INV-2026-0042` (FR-2.4). A rolled-back transaction simply skips a number (harmless).
- **Auth & token rotation** — access token (15 min) carries `sub`/`role`/`email`; refresh token (7 days, httpOnly cookie) carries only `sub`. On refresh, the old token is SHA-256-hashed and added to the `RevokedToken` denylist, then a fresh pair is issued; logout denylists the current token. Role is re-read on every refresh so privilege changes take effect. The frontend interceptor performs a single deduped refresh-and-retry on `401`.
- **Synchronous notifications** — `notification.service` composes the template (+ PDF attachment) and calls SendGrid **inline** in the request handler, wrapped in try/catch so a delivery failure is logged but never fails the invoice/payment/registration it accompanies. A missing SendGrid key degrades to dry-run (composed, logged, never sent) — ideal for dev/test.
- **Scheduled work (node-cron) & the no-queue decision** — three in-process **node-cron** jobs run daily at `0 0 * * *`: `recurringInvoiceCheck` generates due recurring occurrences (stop conditions per BR-3), `overdueCheck` flips past-due `sent` invoices to `overdue` exactly once (BR-4), and `reminderCheck` emails approaching/past-due reminders (guarded by `lastReminderAt`). **This is a deliberate, scale-appropriate choice:** for this project's volume, in-process cron plus synchronous PDF/email is far less infrastructure to run and reason about than a queue, and interview-explainable end to end. The trade-off is no built-in retries/backoff, no cross-process scaling, and a slow SendGrid call briefly occupying the request thread. **How it would evolve:** at higher scale I'd introduce a **BullMQ + Redis** queue to decouple the slow operations (PDF generation, email sending) from the API response cycle and handle retries more robustly, moving the scheduled sweeps to repeatable queue jobs and running a separate worker process.

---

## Data Models

All schemas live in `backend/src/models/`.

| Model | Purpose | Notable fields / indexes |
|---|---|---|
| **User** | Auth accounts | `email` unique; `passwordHash` (`select:false`, scrubbed in `toJSON`); `role` enum `admin`\|`staff` (default `staff`) |
| **Customer** | Billing customers | `balance` (server-only, BR-2); `status` enum `active`\|`archived` (soft-delete, BR-5); indexes on `status`/`email`/`name` (email **not** unique) |
| **Invoice** | Invoices | `invoiceNumber` unique; `items[]`; `subtotal`/`tax`/`totalAmount`; `status` enum (5 states); `isRecurring`/`recurringCycle`; `lastReminderAt`; `idempotencyKey` unique+sparse; index `{status,dueDate}` for the overdue sweep |
| **Payment** | Payment records | `invoiceId` + denormalized `customerId`; `method`/`status` enums; `idempotencyKey` unique+sparse; **`createdAt` only** (no `updatedAt`) |
| **AuditLog** | Sensitive-write trail | `action`, `entityType`, `entityId`, `performedBy`, `beforeState`/`afterState` (Mixed), manual `timestamp` |
| **Counter** | Atomic sequences | `_id` scope key (e.g. `invoice-2026`), `seq`; `next()` is transaction-aware |
| **IdempotencyKey** | Response cache | `key` unique, `statusCode`, `response`; **24h TTL** on `createdAt` |
| **RevokedToken** | Refresh denylist | `tokenHash` (SHA-256) unique; TTL deletes the row at the token's natural `expiresAt` |

---

## Testing

### Backend (Jest)

```bash
cd backend
npm test                          # full suite (spins up mongodb-memory-server)
BILLFLOW_SKIP_DB_TESTS=1 npm test # socket-free unit tests only
```

The backend suite is deliberately split into two tiers:

- **Socket-free unit tests** — always run; cover the security- and money-critical logic without any TCP socket: token signing/verification, auth middleware + RBAC, `computeTotals`, invoice-number formatting, recurring-cycle math, audit `sanitize`, pagination, the dashboard aggregation pipeline, idempotency-middleware behavior (with a mocked model), and the SendGrid mailer in dry-run.
- **DB-backed integration tests** — gated behind **`BILLFLOW_SKIP_DB_TESTS`**. When that env var is set, these blocks are **skipped** (`describe.skip`) so the suite still passes in sandboxed/CI environments that block `listen()`/`connect()`. They exercise real transactions, rollbacks, HTTP flows (Supertest), and idempotency end-to-end. Suites needing transactions use a single-node **replica set** via `mongodb-memory-server`; auth/PDF/idempotency-only suites use standalone Mongo.

Test env (`tests/setup.env.js`) sets throwaway JWT secrets and cost-4 bcrypt; the node-cron jobs are only scheduled when the server actually starts, so importing modules under test never fires a scheduled job. First run may download a Mongo binary (hence the 60s Jest timeout).

### Frontend (Karma/Jasmine)

```bash
cd frontend
npm test    # ng test — every component/service has a .spec.ts sibling
```

---

## Deployment

### Frontend → Netlify

`frontend/netlify.toml` is committed:

- **Build command:** `npx ng build`
- **Publish directory:** `dist/billflow/browser`
- **SPA fallback:** `/* → /index.html` (status `200`) for client-side routing

Before building for production, set `frontend/src/environments/environment.prod.ts` `apiUrl` to your real Render API URL (it ships as a placeholder). The Angular build swaps `environment.ts` → `environment.prod.ts` automatically.

### Backend → Render

Deploy as a **single web service** from the repo (rooted at `backend/`):

1. **Web service** — start command `npm start` (`node src/server.js`). The node-cron scheduled jobs run inside this same process, so no separate worker or Redis instance is needed.

It needs the environment variables (see [Environment Variables](#environment-variables)) and a **replica-set** `MONGODB_URI` (MongoDB Atlas). Set `CLIENT_URL` to your Netlify origin so CORS and the cross-origin refresh cookie (`sameSite=none; secure` in production) work. Configure secrets in Render's dashboard — **never** in the repo.

> **Scaling note:** because the cron jobs run in-process, this assumes a **single API instance**. If you scale to multiple instances, the scheduled jobs would run on each one — that's the point at which you'd move scheduled/slow work to a **BullMQ + Redis** queue with a dedicated worker (see [Key Implementation Patterns](#key-implementation-patterns)).

> There is no Render blueprint (`render.yaml`) checked in yet; the service is configured manually.

---

## AI-Assisted Development

This repo is set up for AI-assisted development with Claude Code; the configuration lives under `.claude/`:

- **`CLAUDE.md`** — project rules Claude must follow (strict tech stack, backend correctness rules for idempotency/transactions/audit, no `any` types, Conventional Commits).
- **Subagents (`.claude/agents/`)** — `frontend-agent`, `backend-agent`, `testing-agent`, `reviewer-agent`, each scoped to a slice of the work. Three more (`database`, `security`, `devops`) are documented as create-when-needed.
- **Skills (`.claude/skills/`)** — `idempotent-endpoint` codifies the required pattern for any new money-moving `POST`.
- **MCP (`.mcp.json`)** — a GitHub MCP server for PR/issue automation (the only server configured).

`docs/BillFlow_Dev_Technical_Spec.md` and `docs/INTERVIEW_NOTES.md` capture the deeper design rationale.

---

## Contributing & Conventions

- **Commits:** Conventional Commits — `feat:`, `fix:`, `refactor:`, `test:`, `docs:`. One logical change per commit.
- **Backend:** thin controllers; business logic in `*.service.js`. Every `POST /invoices` and `POST /payments` uses `idempotencyMiddleware`; multi-collection writes use `withTransaction()`; every sensitive write logs an `AuditLog`. Never log passwords, tokens, or card data.
- **Frontend:** standalone components only (no NgModules); Signals for local state, NgRx for shared state only; no `any` — define proper interfaces.
- **Tests:** add Jest coverage for new backend service/controller functions, including explicit idempotency and transaction-rollback tests.
- **Secrets:** never commit `.env` files, tokens, or keys. Only `.env.example` is tracked.

---

## License

**UNLICENSED / proprietary.** No open-source license file is present in this repository; all rights reserved by the project owner. Contact the maintainer before reuse or distribution.
