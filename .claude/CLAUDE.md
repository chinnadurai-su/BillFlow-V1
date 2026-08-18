# BillFlow — Project Rules for Claude Code

## Project Overview
BillFlow is a SaaS billing/invoicing platform (Chargebee-style domain).
Full spec reference: `docs/BillFlow_Dev_Technical_Spec.md`

## Tech Stack (STRICT — do not deviate)
- **Frontend:** Angular 21 — Standalone Components + Signals + NgRx (for shared state only)
- **Backend:** Node.js + Express.js
- **Database:** MongoDB Atlas + Mongoose ODM
- **Scheduling:** node-cron (in-process daily jobs) — no message queue at this scale
- **PDF:** PDFKit
- **Email:** SendGrid (`@sendgrid/mail`)
- **Deployment:** Frontend → Netlify, Backend → Render

## Coding Rules

### Frontend (Angular)
- ALWAYS use standalone components — never generate NgModules
- Use Signals for component-local state (form values, UI toggles, computed values)
- Use NgRx ONLY for shared/global state (auth, customer list, dashboard data)
- Follow feature-folder structure under `src/app/features/`
- No `any` type — always define proper interfaces/types

### Backend (Node/Express)
- Follow REST conventions strictly (proper HTTP verbs, status codes)
- Every POST on `/invoices` and `/payments` MUST use `idempotencyMiddleware`
- Any operation touching multiple collections MUST use MongoDB transactions (`session.withTransaction()`)
- Every sensitive write (create/update/delete on Invoice, Customer, Payment) MUST write an AuditLog entry
- Never log passwords, tokens, or full card details — anywhere (console, AuditLog, error messages)
- Controllers stay thin — business logic goes in `*.service.js` files, not controllers

### Database
- All schemas live in `backend/src/models/`
- Use Mongoose schema validation (`required`, `enum`, etc.) — don't rely on frontend validation alone
- Add indexes for fields used in frequent queries (`customerId`, `status`, `dueDate`)

### Testing
- Write Jest tests for every new service/controller function
- Test idempotency behavior explicitly (same key twice → same response, no duplicate DB write)

### Git / Commits
- Conventional commit format: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`
- One logical change per commit — don't bundle unrelated changes

## Subagents — Available in `.claude/agents/`

This project uses dedicated subagents for different types of work. When a task matches an agent's scope below, route the work to that agent instead of handling everything in one generic pass.

### frontend-agent.md
**Use when:** building or modifying anything under `frontend/src/app/` — components, forms, Signals-based state, NgRx store for shared state.
**Do NOT use for:** backend API logic, schema design, or writing tests (those belong to other agents).

### backend-agent.md
**Use when:** building or modifying anything under `backend/src/` — Express routes, controllers, services, Mongoose schemas, node-cron scheduled jobs.
**Always enforce via this agent:** idempotency middleware on `/invoices` and `/payments` POST routes, MongoDB transactions for multi-collection writes, AuditLog entries for sensitive writes.

### testing-agent.md
**Use when:** a feature (frontend or backend) has just been built and needs test coverage, or when existing code is missing tests.
**Always include:** at least one happy-path test and one failure-path test per new service/controller function; explicit tests for idempotency behavior and transaction rollback.

### reviewer-agent.md
**Use when:** code is ready to commit or a PR is open and needs review before merge.
**Checklist it applies:** idempotency on payment/invoice endpoints, transactions on multi-collection writes, AuditLog entries present, no secrets/tokens logged or hardcoded, no `any` types, no N+1 queries, tests present for new endpoints.

### database-agent.md (add when needed — not yet created)
**Use when:** deciding schema structure, indexing strategy, or query performance issues come up. Create this agent file the first time a schema/indexing decision needs dedicated focus — don't pre-build it before it's needed.

### security-agent.md (add when needed — not yet created)
**Use when:** starting work on payment-related endpoints, auth flows, or anything handling sensitive customer data. Create this agent file when the Payment module work begins.

### devops-agent.md (add when needed — not yet created)
**Use when:** setting up deployment, CI/CD, or environment variable management for Render/Netlify. Create this agent file when deployment work starts.

**General rule:** Don't invoke an agent outside its stated scope, and don't create the "add when needed" agents until the matching task actually comes up — this avoids unused, stale agent definitions.

## Architecture Reminders
- Idempotency pattern: check `middleware/idempotency.middleware.js` before implementing payment/invoice writes
- Scheduled work (recurring invoices, overdue flagging, reminders) runs as in-process **node-cron** daily jobs under `backend/src/jobs/`, scheduled from `server.js` — not a queue/worker
- PDF generation and email delivery run **synchronously** in the request handler, best-effort (try/catch) so a delivery failure never fails the operation
- No Redis/BullMQ at this scale — that's the documented upgrade path (decouple slow PDF/email work, add retries/backoff) if the project scales up; add it only when explicitly decided

## When Unsure
- If a requirement isn't covered in `docs/BillFlow_Dev_Technical_Spec.md`, ask before assuming.
- Prefer explicit, readable code over clever one-liners — this project needs to be interview-explainable.
