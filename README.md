# BillFlow

> A full-stack SaaS billing & invoicing platform — manage customers, generate invoices, track payments, and automate recurring billing, with correctness patterns (idempotency, transactions, audit logging) built in from day one.

<p align="left">
  <img alt="Angular" src="https://img.shields.io/badge/Angular-21-DD0031?logo=angular&logoColor=white">
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-%3E%3D20-339933?logo=nodedotjs&logoColor=white">
  <img alt="Express" src="https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white">
  <img alt="MongoDB" src="https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white">
  <img alt="Redis" src="https://img.shields.io/badge/Redis-BullMQ-DC382D?logo=redis&logoColor=white">
  <img alt="License" src="https://img.shields.io/badge/license-UNLICENSED-lightgrey">
</p>

BillFlow is a Chargebee-style billing system split into an **Angular 21 SPA** and a **Node.js + Express REST API** backed by **MongoDB Atlas** and a **Redis/BullMQ** job queue. It is designed around financial-grade correctness: every money-moving endpoint is idempotent, multi-collection writes are transactional, and sensitive operations are audit-logged.

---

## 📋 Table of Contents

- [Project Status](#-project-status)
- [Features](#-features)
- [Architecture](#-architecture)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [Available Scripts](#-available-scripts)
- [API Reference](#-api-reference)
- [Key Implementation Patterns](#-key-implementation-patterns)
- [Data Models](#-data-models)
- [Testing](#-testing)
- [Deployment](#-deployment)
- [AI-Assisted Development](#-ai-assisted-development)
- [Contributing & Conventions](#-contributing--conventions)
- [License](#-license)

---

## 🚦 Project Status

**Early scaffold.** The full architecture is in place — module layout, Mongoose models, routers, middleware, the idempotency pattern, worker/job skeletons, and the Angular feature/component tree with tests. Business logic in the service layer (`*.service.js`) and the Angular route table are still being implemented (marked with `TODO`s).

| Layer | State |
|---|---|
| Backend structure, routers, middleware | ✅ Wired |
| Idempotency middleware + `IdempotencyKey` model | ✅ Implemented |
| Mongoose models (User, Customer, Invoice, Payment, AuditLog, IdempotencyKey) | ✅ Defined |
| Auth / Customer / Invoice / Payment **service logic** | 🚧 Stubbed (`TODO`) |
| BullMQ jobs & worker | 🚧 Skeleton |
| Frontend components, services, NgRx store | ✅ Scaffolded |
| Frontend route table (`app.routes.ts`) | 🚧 Placeholder |
| Backend & frontend test suites | ✅ Present |

See [`docs/BillFlow_Dev_Technical_Spec.md`](docs/BillFlow_Dev_Technical_Spec.md) for the complete technical specification (v4.0).

---

## ✨ Features

- **Customer management** — full CRUD with billing address and a running outstanding balance.
- **Invoice generation** — manual and recurring invoices with line items, tax, and auto-generated human-readable invoice numbers (e.g. `INV-2026-0042`).
- **PDF invoice export** — server-side rendering with PDFKit.
- **Payment tracking & reconciliation** — record payments against invoices and update customer balances atomically.
- **Automated email reminders** — recurring invoice generation and reminder emails via BullMQ workers + Nodemailer.
- **Dashboard analytics** — revenue, outstanding, and overdue metrics with Chart.js visualizations.
- **Audit logging** — before/after state captured for sensitive operations (never passwords or card data).
- **Financial-grade correctness** — idempotent write endpoints, MongoDB transactions, JWT auth, centralized error handling, rate limiting, and pagination.

---

## 🏗 Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                          CLIENT (Browser)                          │
│               Angular 21 SPA — Standalone + Signals                │
└──────────────────────────────┬─────────────────────────────────────┘
                                │ HTTPS / REST (JSON)
┌──────────────────────────────▼─────────────────────────────────────┐
│                      Node.js + Express API Layer                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │   Auth   │ │ Customer │ │ Invoice  │ │ Payment  │ │  Notify  │  │
│  │  Module  │ │  Module  │ │  Module  │ │  Module  │ │  Module  │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
└───────┬──────────────────────────────────────────────┬─────────────┘
        │                                                │
┌───────▼────────┐                              ┌────────▼──────────┐
│  MongoDB Atlas  │                              │   Redis + BullMQ   │
│  (Mongoose ODM) │                              │   (Job Queue)      │
└─────────────────┘                              └────────┬──────────┘
                                                           │
                                            ┌──────────────▼───────────────┐
                                            │  Worker Process               │
                                            │  - PDFKit (generate PDF)      │
                                            │  - Nodemailer (send email)    │
                                            └───────────────────────────────┘
```

- The **API server** handles synchronous REST requests.
- **Redis + BullMQ** decouple slow/scheduled work (PDF generation, email, recurring invoices) into a **separate worker process** (`npm run worker`).
- **State split (frontend):** NgRx for shared/global state (auth, customer list, global loading/error); Angular **Signals** for component-local UI state (form values, computed invoice totals).

---

## 🧰 Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend framework | **Angular 21** | Standalone components only (no NgModules) |
| State management | **NgRx** + **Signals** | Global store + local signals split |
| Charts | **Chart.js** | Dashboard visualizations |
| Backend runtime | **Node.js ≥ 20** | LTS |
| Backend framework | **Express 4** | REST API, feature-module layout |
| Database | **MongoDB Atlas** | Document store |
| ODM | **Mongoose 8** | Schema validation + transactions |
| Queue | **BullMQ 5** | Background jobs |
| Queue broker | **Redis** (ioredis) | BullMQ backend |
| PDF generation | **PDFKit** | Invoice PDFs |
| Email | **Nodemailer** | Transactional + reminder emails |
| Auth | **JWT** (jsonwebtoken) | Access (15 min) + refresh (7 days) |
| Password hashing | **bcrypt** | |
| Testing | **Jest** + **supertest** / **Angular TestBed** (Karma/Jasmine) | + `mongodb-memory-server` |
| Hosting | **Netlify** (frontend) / **Render** (backend) | CI/CD via Git |

---

## 📁 Project Structure

```
BillFlow/
├── backend/                         # Node.js + Express REST API
│   └── src/
│       ├── modules/                 # Feature modules (controller / service / routes)
│       │   ├── auth/  customer/  invoice/  payment/  notification/
│       ├── models/                  # Mongoose schemas
│       │   ├── User.js  Customer.js  Invoice.js  Payment.js
│       │   ├── AuditLog.js  IdempotencyKey.js
│       ├── middleware/              # auth · idempotency · errorHandler
│       ├── jobs/                    # BullMQ job definitions (recurring, reminders)
│       ├── workers/                 # BullMQ worker processes (PDF + email)
│       ├── utils/                   # pdfGenerator · emailTemplates
│       ├── config/                  # db.js (Mongo) · redis.js (BullMQ)
│       └── server.js                # API entry point
│
├── frontend/                        # Angular 21 standalone SPA
│   └── src/app/
│       ├── core/                    # Guards, interceptors, singleton services
│       ├── shared/                  # Reusable components (dialog, spinner)
│       ├── features/                # auth · customers · invoices · payments · dashboard
│       ├── store/                   # NgRx reducers / state
│       └── app.routes.ts            # Route table
│
├── docs/BillFlow_Dev_Technical_Spec.md   # Full technical specification (v4.0)
├── .claude/                         # Claude Code config: CLAUDE.md, agents, skills
├── .mcp.json                        # MCP servers (GitHub / Render / Netlify)
├── .env.example                     # Backend environment template
└── docker/                          # (reserved for container configs)
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js ≥ 20** (LTS recommended) and npm
- **MongoDB** — a [MongoDB Atlas](https://www.mongodb.com/atlas) cluster or a local `mongod`
- **Redis** — required for BullMQ jobs/worker
  - macOS: `brew install redis && redis-server` → verify with `redis-cli ping` → `PONG`
- **Angular CLI 21** (optional, for `ng` commands): `npm i -g @angular/cli@21`

### 1. Clone & configure

```bash
git clone <your-repo-url> BillFlow
cd BillFlow

# Backend environment — copy the template and fill in real values
cp .env.example backend/.env
```

> ⚠️ **Never commit `.env`.** Keep real secrets (Mongo URI, JWT secrets, SMTP creds, `GITHUB_PERSONAL_ACCESS_TOKEN`) out of the repo.

### 2. Install dependencies

```bash
# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install
```

### 3. Run in development

Open three terminals (API, worker, frontend):

```bash
# Terminal 1 — API server (http://localhost:5000)
cd backend && npm run dev

# Terminal 2 — BullMQ worker (PDF generation + email)
cd backend && npm run worker

# Terminal 3 — Angular dev server (http://localhost:4200)
cd frontend && npm start
```

Health check: `curl http://localhost:5000/health` → `{"status":"ok"}`.

> **Note:** The API server starts even if MongoDB isn't reachable yet (so `/health` and the surface come up during local dev); DB-backed endpoints will error until the connection succeeds.

<details>
<summary>Troubleshooting: <code>bcrypt</code> install fails</summary>

`bcrypt` is a native module and compiles on install. If it fails, ensure you're on a supported Node LTS and have build tools available (Xcode Command Line Tools on macOS, `build-essential` on Linux). In restricted environments you can install with `npm install --ignore-scripts` and rebuild later.
</details>

---

## 🔐 Environment Variables

Defined in [`.env.example`](.env.example) (backend):

| Variable | Description | Example |
|---|---|---|
| `PORT` | API server port | `5000` |
| `NODE_ENV` | Environment | `development` |
| `MONGODB_URI` | MongoDB Atlas connection string | `mongodb+srv://...` |
| `REDIS_URL` | Redis connection URL (BullMQ) | `redis://localhost:6379` |
| `JWT_ACCESS_SECRET` | Secret for signing access tokens | *(set)* |
| `JWT_REFRESH_SECRET` | Secret for signing refresh tokens | *(set)* |
| `JWT_ACCESS_EXPIRY` | Access token lifetime | `15m` |
| `JWT_REFRESH_EXPIRY` | Refresh token lifetime | `7d` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Email (Nodemailer) config | |
| `CLIENT_URL` | Allowed CORS origin (frontend URL) | `https://billflow.netlify.app` |

Frontend API base URLs live in [`frontend/src/environments/`](frontend/src/environments/).

---

## 📜 Available Scripts

### Backend (`backend/`)

| Script | Command | Description |
|---|---|---|
| `npm run dev` | `nodemon src/server.js` | Start API with hot reload |
| `npm start` | `node src/server.js` | Start API (production) |
| `npm run worker` | `node src/workers/invoice.worker.js` | Start the BullMQ worker process |
| `npm test` | `jest` | Run backend unit/integration tests |
| `npm run lint` | `eslint src` | Lint backend source |
| `npm run seed` | `node src/seed.js` | Seed sample data *(seed script planned — not yet added)* |

### Frontend (`frontend/`)

| Script | Command | Description |
|---|---|---|
| `npm start` | `ng serve` | Angular dev server (`http://localhost:4200`) |
| `npm run build` | `ng build` | Production build |
| `npm test` | `ng test` | Angular unit tests (Karma/Jasmine) |

---

## 🔌 API Reference

Base path: `/api`. All responses use a consistent error shape: `{ success, message, errorCode }`.

### Auth
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register a new user |
| `POST` | `/api/auth/login` | Login — returns JWT access token |
| `POST` | `/api/auth/refresh` | Refresh access token (refresh token in httpOnly cookie) |
| `POST` | `/api/auth/logout` | Invalidate refresh token |

### Customers
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/customers` | List customers (paginated, filterable) |
| `GET` | `/api/customers/:id` | Get customer details |
| `POST` | `/api/customers` | Create customer |
| `PUT` | `/api/customers/:id` | Update customer |
| `DELETE` | `/api/customers/:id` | Delete/archive customer |

### Invoices
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/invoices` | List invoices (filter by status, customer, date range) |
| `GET` | `/api/invoices/:id` | Get invoice detail |
| `POST` | `/api/invoices` | Create invoice — **requires `Idempotency-Key` header** |
| `PUT` | `/api/invoices/:id` | Update invoice |
| `DELETE` | `/api/invoices/:id` | Cancel invoice |
| `GET` | `/api/invoices/:id/pdf` | Download invoice PDF |
| `POST` | `/api/invoices/:id/send` | Send invoice email to customer |

### Payments
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/payments` | List payments |
| `POST` | `/api/payments` | Record payment — **requires `Idempotency-Key` header** |
| `GET` | `/api/payments/:id` | Payment detail |

### Dashboard *(planned)*
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/dashboard/summary` | Revenue, outstanding, overdue counts |
| `GET` | `/api/dashboard/revenue-trend` | Time-series data for charts |

> Routes are wired in `server.js` for auth, customers, invoices, and payments. Controller/service logic is being implemented (see [Project Status](#-project-status)). The notification module is worker-triggered and has no public router.

---

## 🧩 Key Implementation Patterns

These patterns are **non-negotiable** for BillFlow (see [`.claude/CLAUDE.md`](.claude/CLAUDE.md) and Spec §7):

### 1. Idempotency (`Idempotency-Key`)
`POST /api/invoices` and `POST /api/payments` are guarded by [`idempotency.middleware.js`](backend/src/middleware/idempotency.middleware.js). The client sends a UUID in the `Idempotency-Key` header; the middleware:

1. Looks up the key in the `IdempotencyKey` collection.
2. **If found** → returns the previously stored status + response, *without re-running the controller* (no duplicate write).
3. **If new** → lets the request proceed, then caches the key + response.
4. Keys **auto-expire after 24h** via a MongoDB TTL index.

This makes double-clicks and network retries safe. Example:

```bash
curl -X POST http://localhost:5000/api/payments \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 3f1c9d2e-8b7a-4c6e-9f01-2a3b4c5d6e7f" \
  -d '{ "invoiceId": "...", "amount": 100, "method": "card" }'
```

> Building a new money-moving POST endpoint? Use the **`idempotent-endpoint`** skill in [`.claude/skills/`](.claude/skills/).

### 2. Transactions
Multi-collection writes (e.g. `Invoice.create()` + customer balance update + `AuditLog.create()`) are wrapped in `session.withTransaction()` for all-or-nothing consistency.

### 3. Audit logging
Sensitive operations write an `AuditLog` entry capturing before/after state. **Passwords and payment card data are never logged.**

### 4. Auth
JWT **access token (15 min)** + **refresh token (7 days)** stored in an **httpOnly cookie**. Rate limiting (`express-rate-limit`) is applied to auth and payment endpoints.

### 5. Error handling
All errors flow through the centralized error middleware and return `{ success, message, errorCode }`.

### 6. Background jobs (BullMQ)
```
Invoice created (isRecurring: true)
  → recurringInvoice.job scheduled with a cron pattern (per recurringCycle)
  → Worker picks the job at the scheduled time → creates a new Invoice
  → Queues invoiceReminder.job (PDF + email)
  → invoice.worker.js generates the PDF (PDFKit) + sends email (Nodemailer)
```

---

## 🗄 Data Models

Mongoose schemas in [`backend/src/models/`](backend/src/models/):

| Model | Purpose | Key fields |
|---|---|---|
| **User** | Auth accounts | `email` (unique), `passwordHash`, `role` (`admin`/`staff`) |
| **Customer** | Billing entities | `name`, `email`, `billingAddress`, `balance` (running outstanding) |
| **Invoice** | Bills | `invoiceNumber` (unique), `customerId`, `items[]`, `subtotal`, `tax`, `totalAmount`, `status` (`draft`/`sent`/`paid`/`overdue`/`cancelled`), `isRecurring`, `recurringCycle`, `pdfUrl` |
| **Payment** | Payments against invoices | `invoiceId`, `customerId`, `amount`, `method`, `status`, `transactionRef` |
| **AuditLog** | Compliance trail | `action`, `entityType`, `entityId`, `performedBy`, `beforeState`, `afterState`, `timestamp` |
| **IdempotencyKey** | Duplicate-request guard | `key` (unique), `statusCode`, `response`, `createdAt` (TTL 24h) |

Full field definitions: Spec [§5](docs/BillFlow_Dev_Technical_Spec.md).

---

## 🧪 Testing

- **Backend:** Jest + supertest, with `mongodb-memory-server` for an in-memory Mongo instance. Coverage includes the idempotency duplicate-key case and transaction rollback.
  ```bash
  cd backend && npm test
  ```
- **Frontend:** Angular TestBed (Karma/Jasmine). Component `.spec.ts` files live alongside each component.
  ```bash
  cd frontend && npm test
  ```

Test files: [`backend/tests/`](backend/tests/) and `frontend/src/app/**/*.spec.ts`.

---

## ☁️ Deployment

| Target | Service | Notes |
|---|---|---|
| Frontend | **Netlify** | `ng build` output, CI/CD via Git |
| Backend API | **Render** | Node web service (`npm start`) |
| Worker | **Render** | Separate background worker (`npm run worker`) |
| Database | **MongoDB Atlas** | Managed cluster |
| Redis | Managed free tier | **Upstash** recommended (Render's free Redis expires after 90 days) |

Set all [environment variables](#-environment-variables) in the hosting provider's dashboard — never in the repo.

---

## 🤖 AI-Assisted Development

BillFlow is developed with **Claude Code** using a structured Agent + Skill + MCP setup ([`.claude/`](.claude/)):

- **[`CLAUDE.md`](.claude/CLAUDE.md)** — project-wide rules enforced on every task (standalone components, idempotency, transactions, audit logging, auth, error shape).
- **Subagents** ([`.claude/agents/`](.claude/agents/)) — `frontend-agent`, `backend-agent`, `testing-agent`, `reviewer-agent`, each owning a slice of the codebase.
- **Skills** ([`.claude/skills/`](.claude/skills/)) — reusable procedures, e.g. `idempotent-endpoint`.
- **MCP** ([`.mcp.json`](.mcp.json)) — connects Claude Code to GitHub, Render, and Netlify.

---

## 🤝 Contributing & Conventions

- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/) — `feat:`, `fix:`, `test:`, `chore:`, etc.
- **Validation:** Mongoose schema validation + class-validator/DTO validation at the controller layer.
- **Pagination:** list endpoints are paginated (default limit 20).
- **Rate limiting:** `express-rate-limit` on auth and payment endpoints.
- **Logging:** `morgan` request logging + `AuditLog` for domain events.
- **Frontend:** Angular standalone components only; respect the NgRx (global) vs Signals (local) state split.
- **Before committing:** run the review checklist (idempotency, transactions, audit logs, no leaked secrets) — use the `reviewer-agent`.
- **Secrets:** never commit `.env` or `GITHUB_PERSONAL_ACCESS_TOKEN`.

---

## 📄 License

UNLICENSED / private. Add a `LICENSE` file if this project is to be distributed.

---

<p align="center"><em>See <a href="docs/BillFlow_Dev_Technical_Spec.md">docs/BillFlow_Dev_Technical_Spec.md</a> for the complete architecture, data models, API contracts, and implementation patterns.</em></p>
