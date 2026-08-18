# BillFlow — Interview Notes & Cheat Sheet

> A design-decision-and-trade-off study guide for talking about **BillFlow** in interviews.
> Grounded in the **actual implementation** — the backend is fully built and the Angular
> frontend is built out (auth, customers, invoices, payments, dashboard). Answers are
> deliberately crisp — a few sentences each, with the "why" front and centre.
> Requirement IDs (`FR-*`, `BR-*`) reference `docs/BillFlow_BRD.md`.

---

## 30-second pitch

BillFlow is a SaaS billing/invoicing platform (a lightweight Chargebee). Businesses manage customers, create one-off and recurring invoices, email them as PDFs, record payments, and watch revenue / outstanding / overdue on a dashboard. The engineering focus is **money correctness**: every financial write is **idempotent** (cache + unique-index backstop), **multi-collection writes are transactional** (all-or-nothing), and **every sensitive change is audit-logged inside the same transaction**. Full stack — Angular 21 (standalone + Signals + a thin NgRx auth slice), Node/Express, MongoDB Atlas + Mongoose, BullMQ/Redis workers, SendGrid, PDFKit.

## Tech stack at a glance

| Layer | Choice | One-line why |
|---|---|---|
| Frontend | Angular 21 — standalone + Signals, NgRx for shared state only | Signals for local reactivity; NgRx reserved for genuinely shared auth state |
| Backend | Node.js + Express | Thin controllers, hand-wired `routes → controller → service` |
| Database | MongoDB Atlas + Mongoose | Embedded line items; multi-doc ACID transactions on a replica set |
| Queue | BullMQ + Redis | Jobs run outside the request cycle, survive restarts, retry with backoff |
| Email | **SendGrid** (`@sendgrid/mail`) | Managed deliverability + a dry-run fallback for dev/test |
| PDF | PDFKit | In-memory `Buffer`, no Chromium, no temp files (Render FS is ephemeral) |
| Deploy | Netlify (frontend) + Render (backend) | Free-tier friendly |

## The four signature concerns

1. **Idempotency (defense in depth)** — `Idempotency-Key` header → middleware cache → **unique DB index** on `idempotencyKey`. The cache caches only 2xx; the index is the real backstop.
2. **Transactions** — recording a payment writes Payment + invoice status + customer balance + audit log; all wrapped in `withTransaction`, which **fails loudly** on standalone Mongo rather than silently dropping atomicity.
3. **Audit logging** — before/after snapshots written *inside* the transaction, sanitized of secrets.
4. **Auth & security** — JWT access (15m) + refresh (7d, httpOnly cookie), rotation + SHA-256 denylist with TTL, RBAC, no user enumeration, no privilege escalation.

---

# 1. Architecture & Tech Choices

**Q1. Draw the request flow, browser to DB.**
Angular component → feature data-access service → central `ApiService` (HttpClient) → `authInterceptor` attaches the Bearer token + `withCredentials` → Express route → `authMiddleware` verifies the JWT and sets `req.user` → thin controller validates and shapes the HTTP response → `*.service.js` holds business logic and opens a transaction → Mongoose → MongoDB. Responses use a `{ success, data }` envelope the frontend unwraps. Async work (PDF/email, recurring, overdue) is enqueued to BullMQ and consumed by a **separate worker process**.

```
Angular (Signals) ──HTTP──> Express API ──> service layer ──> MongoDB (replica set)
       │  authInterceptor        │  authMiddleware / RBAC        ▲
       │  (Bearer + cookie)      │  idempotency + transactions   │  $inc balance, audit
       ▼                         ▼                               │
   NgRx auth slice          BullMQ enqueue ──> Redis ──> Worker ─┘ (PDF, email, recurring, overdue)
```

**Q2. Why `routes → controller → service`?**
Controllers stay thin — validate input, call a service, shape the response. All business logic and data access live in the service, so the same logic is reusable from HTTP controllers *and* from BullMQ workers (e.g. `createRecurringOccurrence` is called by the worker, never by an endpoint), and it's unit-testable without HTTP.

**Q3. Why Angular Signals *and* NgRx — isn't that redundant?**
They cover different scopes. **Signals** hold component-local state — form values, UI toggles, computed invoice totals, list pagination/search. **NgRx holds only genuinely shared state**: the current user + auth status, read by the route guard, the interceptor, and the nav shell. The store has exactly one feature slice (`auth`); every list/CRUD screen keeps its state in local Signals with a `reload$` + `switchMap` pattern (stale-request cancellation). `provideEffects([])` is wired but empty — all async auth work lives in `AuthService`, not effects. (A customer NgRx slice was deliberately removed to enforce this "NgRx for shared state only" rule.)

**Q4. Why MongoDB for financial data?**
Invoices have variable-length line items that map naturally to an **embedded array** (single atomic document, no joins), and MongoDB on a **replica set** gives multi-document ACID transactions — exactly what the money paths need. I'd concede a relational DB is defensible for a strict general ledger; the trade-off is schema flexibility vs. relationally-enforced constraints.

**Q5. Why BullMQ/Redis instead of node-cron in the web process?**
Jobs run outside the request/response cycle, survive process restarts, retry with exponential backoff, and scale independently (spin up more worker instances without touching the API). CLAUDE.md explicitly forbids in-process cron for recurring invoices. Redis is used **only** as the queue backend, not as a general cache.

**Q6. Why SendGrid over SMTP/Nodemailer?**
Managed deliverability and a clean HTTP API (no SMTP socket handling). The decisive implementation detail is the **dry-run fallback**: `utils/mailer.js` lazily requires `@sendgrid/mail` only when `SENDGRID_API_KEY` is set; when it's unset it logs `[mailer] SENDGRID_API_KEY not set — skipping send…` and returns `{ dryRun: true }`. So importing the module never opens a socket or even requires the package, and dev/test/CI never send real mail or crash. Attachments are converted to base64 in `buildSendGridMessage` (pure/testable). *(The code and deps are 100% SendGrid; `.claude/CLAUDE.md`, the spec, and the README have all been aligned to match.)*

**Q7. Why PDFKit and not headless-browser rendering?**
`renderInvoicePdf` builds the PDF as an in-memory `Buffer` (collects `data` chunks, resolves on `end`) — no Chromium, no temp files. That matters because Render's filesystem is ephemeral, so nothing is persisted; the caller decides whether to stream it (`GET /invoices/:id/pdf`) or attach it to email. Puppeteer would be heavier and memory-hungry for structured documents. *(The `Invoice.pdfUrl` field exists but is never written — PDFs are always rendered on demand.)*

**Q8. How do frontend and backend keep their contract in sync?**
REST with a consistent JSON envelope: `{ success, data }` for single items, `{ success, items, pagination }` for lists. The frontend has a typed model layer (`ApiResponse<T>`, `Paginated<T>`, `AppError`, per-feature models) — no `any` anywhere — and `ApiService` unwraps `res.data`. Stable backend `errorCode`s map to friendly copy via a `FRIENDLY_ERROR_MESSAGES` table.

---

# 2. Financial Correctness

**Q9. What is idempotency and why does billing need it?**
An idempotent operation yields the same result whether applied once or many times. Network retries, timeouts, and double-clicks can resend "create payment", and charging twice is unacceptable (**FR-2.8**, **FR-3.4**; the BRD's headline success metric is *zero* duplicate financial records).

**Q10. Walk through the two-layer idempotency implementation.**
- **Layer 1 — middleware cache.** The client sends an `Idempotency-Key` header (the frontend generates a fresh `crypto.randomUUID()` per submit). `idempotencyMiddleware` looks it up in the `IdempotencyKey` collection: on a hit it **replays the stored `{ statusCode, response }` and the controller never runs**. On a miss it wraps `res.json` to cache the response — but **only 2xx**, and the write is fire-and-forget *after* the response is sent, tolerating E11000.
- **Layer 2 — unique DB index (the real backstop).** `Invoice` and `Payment` both have `idempotencyKey: { unique, sparse }`. The service stores the header value on the created doc; if two requests race past the cache, the second insert throws **E11000** and the service catches it and **returns the already-existing record**.

**Q11. Two identical requests arrive the same millisecond and both miss the cache — what happens?**
Exactly the case the unique index exists for. Both attempt to insert; the DB lets one win and rejects the other with E11000; the service returns the existing record. The client still sees success and there's exactly one invoice/payment.

**Q12. Why cache only 2xx responses?**
Caching a 4xx/5xx would permanently replay a *transient* failure and block a legitimate retry with the same key. Only a successful result is safe to replay. This is the "hardened" fix over the naive idempotency pattern documented in the project's `idempotent-endpoint` skill.

**Q13. If the process dies after responding but before the background cache write?**
The cache entry is simply absent — but correctness is unaffected, because the unique `idempotencyKey` index on the record is the authoritative guarantee. The cache is a fast-path / UX optimization, not the enforcement (the middleware comment says exactly this). Cache entries also self-expire via a 24h TTL on `IdempotencyKey.createdAt`.

**Q14. Which operations need a transaction, and what's inside one?**
Any write touching more than one collection. Recording a payment: create `Payment` + `$inc` customer balance + maybe flip invoice → `paid` + write `PAYMENT_RECORDED` / `INVOICE_PAID` audit logs. Invoice create: `Counter.next` + `Invoice.create` + `$inc` balance + `INVOICE_CREATED`. Cancel, send, customer create/update/archive, and the overdue flip are all similarly wrapped in `withTransaction`.

**Q15. What if the audit-log write fails halfway through recording a payment?**
The whole transaction rolls back — no orphan payment, balance unchanged, no dangling audit entry. This is tested directly: mock `AuditLog.create` to reject and assert nothing persisted and balances unchanged.

**Q16. MongoDB transactions need a replica set — how do you handle standalone dev?**
`withTransaction` deliberately **does not** silently fall back to non-transactional writes on a standalone `mongod` — it fails loudly. A silent fallback would break financial atomicity without anyone noticing, which is worse than an error. Tests spin up an in-memory single-node replica set so transactions work in CI.

**Q17. Explain the customer balance invariant (BR-2).**
`Customer.balance` is a stored running total that is **only ever mutated by `$inc`** inside invoice/payment transactions — never recomputed from scratch, never client-set. The write path enforces this: create/update controllers use an `EDITABLE_FIELDS` whitelist (`name`, `email`, `phone`, `billingAddress`), so a client-sent `balance` is silently dropped. Invoice create `$inc +total`; completed payment `$inc −amount`; cancel decrements only the still-unpaid remainder; an edit that changes the total applies just the `balanceDelta`.

**Q18. How are invoice numbers race-safe (FR-2.4)?**
A `Counter` document per scope (`invoice-2026`) with an atomic `findByIdAndUpdate({ $inc: { seq: 1 } }, { upsert, new, session })`. The increment runs **inside the invoice-create transaction**, so numbers are sequential (`INV-2026-0001`, `INV-2026-0002`…) and race-free under concurrency (`formatInvoiceNumber` zero-pads the seq to 4 digits). Bonus: if an idempotent duplicate aborts the transaction, the counter increment rolls back with it, so a duplicate request doesn't waste a number.

**Q19. How do you "delete" an invoice, and why cancel-not-delete (BR-1)?**
Soft cancel only — `status → 'cancelled'`, record retained. **There is no hard-delete path.** Financial records with payments against them must preserve the payment and audit trail for compliance. Cancel is **admin-only** via RBAC, is idempotent (already-cancelled → no-op), refuses a fully-paid invoice (409 `INVOICE_PAID`), and decrements the customer balance by only the unpaid remainder.

**Q20. Server-side totals — why never trust the client (FR-2.2)?**
`computeTotals` (pure, unit-tested) recomputes per-item `total = round2(qty × unitPrice)`, `subtotal`, `tax = round2(subtotal × rate)`, `totalAmount`, rounding to 2 decimals. Any client-sent subtotal/tax/total is ignored. It also validates each item (description, `quantity > 0`, `unitPrice ≥ 0`) and that `taxRate` is a fraction 0..1. *(Frontend nuance: the invoice form works in tax **rate %** for UX but sends `tax` as an **amount**; the backend is still the source of truth.)*

**Q21. Overpayment / paying a cancelled invoice?**
In the payment transaction, `remaining = totalAmount − Σ completed payments`. For a `completed` payment: `remaining ≤ 0` → 409 `INVOICE_PAID`; `amount > remaining` → 409 `OVERPAYMENT`. Cancelled invoices reject payment (409 `INVOICE_CANCELLED`). Partial and exact payments are allowed; only `completed` payments move the balance/status (`pending`/`failed` are audit-only records, and there's no endpoint to later promote them — a known limitation). Paying a `draft` in full is allowed and flips it straight to `paid`.

---

# 3. Auth & Security

**Q22. Walk through login → authenticated request → logout.**
Login verifies the bcrypt hash and issues a short access token (in the response body) + a refresh token (**httpOnly cookie**, `path=/api/auth`). Each API call carries the access token in `Authorization: Bearer …`; `authMiddleware` verifies it and sets `req.user = { id, role, email }`. On expiry the client calls `/refresh`, which **rotates**: verifies the token, checks the denylist, denylists the consumed token, and issues a fresh pair. Logout denylists the refresh token and clears the cookie.

**Q23. Why access + refresh instead of one long-lived token?**
The access token is short-lived (15m) so a leak is bounded, and being stateless it isn't independently revocable. The refresh token (7d) can be rotated and revoked, giving real session control a single long-lived JWT can't. The access token payload carries `{ sub, role, email }`; the refresh token carries **only `sub`** — role is re-read from the DB on refresh, so a demoted user's new access token reflects the current role (and a deleted user is rejected).

**Q24. JWTs are stateless — how do you revoke one on logout?**
A `RevokedToken` denylist. On logout *and on every rotation*, the token is stored as its **SHA-256 hash** (never the raw token) with `expiresAt` set to the token's own `exp`. A TTL index (`expires: 0`) auto-purges the row at natural expiry, so the denylist stays small and self-cleaning. `refresh` rejects any token whose hash is in the denylist. The upsert is keyed on the hash (`$setOnInsert`), so repeated logout is a no-op with no duplicate-key error → logout is idempotent, and a missing/invalid cookie is a safe no-op success.

**Q25. What's token rotation and why does it matter?**
Every `/refresh` issues a brand-new refresh token and denylists the old one. A stolen, already-rotated token is worthless; if an attacker uses a token before the legitimate user, the rotation invalidates the other party's copy — limiting replay windows. The frontend interceptor de-dupes concurrent 401s into a single in-flight refresh (`shareReplay`) and retries the original request once.

**Q26. RBAC — where is it enforced?**
`requireRole('admin')` is a middleware factory (403 `FORBIDDEN` if the role isn't allowed, 401 `NO_TOKEN` if unauthenticated). It gates exactly one route today: `DELETE /api/invoices/:id` (invoice cancel, **BR-5**). All other protected routes require authentication only. Customer archive is intentionally *not* admin-gated — the argument is that BR-5 restricts *permanent* removal, and only soft-archive is exposed (no hard-delete exists), so the admin restriction doesn't apply. The frontend has a `UserRole` type but currently gates UI on `authGuard` only, not role.

**Q27. The privilege-escalation fix — why does register never trust the client role?**
`register` reads **only** `{ name, email, password }` from the body; `role` is deliberately never read, so every public registration gets the schema default `'staff'`. Admins are provisioned out-of-band (seed / DB update). This is explicitly tested: a `role: 'admin'` in the body is ignored and the user is created as staff.

**Q28. How are passwords stored, and how do you avoid leaking them?**
bcrypt-hashed with a configurable cost (`BCRYPT_SALT_ROUNDS`, default 10; 4 in tests). `passwordHash` is `select: false` (login opts in with `.select('+passwordHash')`) and stripped in `toJSON` — so it's never returned by the API. **No secrets in logs/audit**: `audit.sanitize()` strips a fixed blocklist (`password`, `passwordHash`, `token`, `refreshToken`, `accessToken`, `cardNumber`/`cardNo`, `cvv`/`cvc`, `idempotencyKey`) from before/after snapshots (**FR-6.2**); 5xx errors are logged server-side but returned to the client as a generic `INTERNAL_ERROR`.

**Q29. How do you prevent user enumeration on login?**
Unknown-email and wrong-password both return the identical `401 INVALID_CREDENTIALS` ("Invalid email or password"). *(Honest caveat: `/register` does return `409 EMAIL_TAKEN`, which reveals whether an email is registered — a known trade-off for a friendlier signup UX.)*

**Q30. Other auth hardening?**
Rate limiting on `/register` and `/login` (20/IP/15min, skipped in tests; `/refresh` and `/logout` are not limited). Cookie attributes tuned per env (`Secure` + `SameSite=None` in prod for the Netlify→Render cross-origin, `SameSite=Strict` otherwise). Customer search terms are regex-escaped before building Mongo `$or` queries; email/PDF template content is HTML-escaped; Mongoose parameterizes queries; Angular escapes bindings by default.

**Q31. Refresh token in a cookie, access token in JS — CSRF and XSS?**
The access token is sent explicitly in a header (not automatically by the browser), so it isn't CSRF-exploitable; the refresh cookie relies on `SameSite` / `Secure`. *(Honest caveat: the access token is persisted to `localStorage`, which is XSS-readable — a pragmatic UX choice I'd flag; a stricter posture keeps it in memory only.)*

---

# 4. Async & Background Jobs

**Q32. What runs the jobs, and what are the job types?**
A single lazily-created BullMQ queue (`invoiceJobs`) and a **separate worker process** (`npm run worker`). The worker dispatches by `job.name`: `generatePDF` (render + email PDF), `sendReminder`, `createRecurringInvoice`, `overdueCheck`. The queue is created only on first enqueue (import-safe for tests), and `QUEUE_DISABLED=1` makes producers clean no-ops. Producers share a retry policy (`attempts: 3`, exponential backoff from 5s, `removeOnComplete: true`, `removeOnFail: false` to keep failures for inspection).

**Q33. Recurring invoices — why self-rescheduling delayed jobs, not cron (FR-2.5)?**
Each recurring occurrence is a **delayed job that re-arms itself** after it runs — no BullMQ repeatable/cron key to manage per invoice, and stop conditions are checked naturally at each occurrence (if the series should stop, the worker just doesn't re-enqueue). `cycleToDelayMs`: monthly = 30d, quarterly = 91d, yearly = 365d — a documented **approximation** trade-off (fixed intervals, not exact calendar months). Each occurrence is created as a concrete, non-recurring invoice (`isRecurring: false`) with `dueDate = now + one cycle`.

**Q34. BR-3 stop conditions — when does the recurring chain end?**
`createRecurringOccurrence` returns `null` (and the worker does **not** re-arm) if: the source invoice is missing / not recurring / has no cycle, the source is `cancelled`, or the customer is missing or `archived`. Turning `isRecurring` off via the update endpoint clears `recurringCycle` and stops the series.

**Q35. A recurring job crashes and BullMQ retries it — duplicate invoice?**
No. The worker passes a deterministic key `recurring:<jobId>` as the occurrence's `idempotencyKey`. A retried job (same `job.id`) hits the unique index (E11000) and returns the existing occurrence instead of creating a second — so **no double-charge**. Email send and re-scheduling are independent best-effort steps (each in its own try/catch), so a Redis/email blip can't duplicate the invoice or break the chain.

**Q36. Overdue auto-flagging — why cron here, and how is BR-4 enforced?**
Overdue is a **system-wide daily sweep** with no per-entity stop condition, so a BullMQ **repeatable cron** (`0 2 * * *`) fits — it runs forever on a fixed cadence and survives restarts (BullMQ stores the schedule in Redis and dedupes identical repeat keys). `flagOverdueInvoices` finds `status:'sent', dueDate < now`, then **re-reads each candidate inside a transaction and re-asserts the precondition** (guards against a payment having flipped it to `paid` meanwhile), flips to `overdue`, writes `INVOICE_OVERDUE` (system action, `performedBy: undefined`), and enqueues a reminder. Because the flip moves it out of `sent`, each invoice is flagged exactly once. **BR-4: overdue is system-computed, never manually set** — no endpoint can set it. *(The compound `{status, dueDate}` index backs this query.)*

**Q37. How do reminders avoid spamming (FR-4.1)?**
`remindUpcomingInvoices` reminds `sent` invoices due within 3 days that have no prior `lastReminderAt`, then stamps `lastReminderAt` — so a second daily run reminds each invoice at most once. The manual `POST /invoices/:id/remind` endpoint (admin + staff) also stamps `lastReminderAt` so the sweep won't immediately re-remind; it refuses paid/cancelled invoices (409).

**Q38. Best-effort enqueues + fast-fail — why does the API never hang on Redis?**
The shared ioredis connection uses `maxRetriesPerRequest: null`, so a command issued while Redis is down would buffer forever. `addInvoiceJob` therefore races the enqueue against a `QUEUE_ENQUEUE_TIMEOUT_MS` (3s default) timeout and rejects promptly. Callers treat enqueue as **best-effort** (invoice create still commits; the enqueue failure is logged, not fatal). The notification service is a thin producer — it only enqueues, never calls the email provider — satisfying **FR-4.3** (async delivery never blocks the API). *(Known gap: `registerOverdueCheck` on startup calls `queue.add` directly, bypassing the timeout race — a slow Redis at boot could delay startup.)*

**Q39. Why send the welcome email synchronously but invoice email via a queue?**
Registration is a low-frequency, non-financial action, so `register` calls `sendMail(welcomeEmailTemplate(user))` synchronously — but wrapped in try/catch as **best-effort**, so a SendGrid failure never fails registration (and no audit entry is written for it). Invoice/reminder delivery is higher-volume and must never block the API, so `sendInvoice` marks the invoice sent + enqueues `generatePDF`, and the worker renders + emails the PDF attachment.

---

# 5. Dashboard & Reporting

**Q40. What does the dashboard show, and how is it computed (FR-5.1/5.2)?**
`GET /dashboard/summary` returns `totalRevenue` (sum of **completed** payments), `totalOutstanding` (sum of all `Customer.balance` — which by the BR-2 invariant already equals unpaid invoices minus payments, so no re-derivation needed), `totalOverdue`, and `overdueCount`. `GET /dashboard/revenue-trend` returns a time-series of completed payments grouped by month (`%Y-%m`) or day (`%Y-%m-%d`) over an optional `from`/`to` range. Both routes require auth; admin and staff may view.

**Q41. Why is the aggregation-building logic split out as a pure function?**
`buildRevenueTrendPipeline({ from, to, granularity })` returns the MongoDB aggregation array without touching the DB, so the grouping/date-bucketing logic is **unit-testable without a database**. The service just runs the pipeline and rounds to 2 decimals. The summary uses three parallel aggregations (`Promise.all`) so it's a single round-trip fan-out.

**Q42. Is the data real-time (FR-5.3)?**
Yes — the dashboard reads live aggregations on every request (no caching layer today), so it's inherently near-real-time. The trade-off is cost as payment volume grows; the forward-looking answer is precomputed daily rollups (see Q52). On the frontend, the dashboard fetches summary + trend in parallel (`forkJoin`) and renders KPI cards plus a Chart.js line chart that destroys the prior chart instance before re-render (no leaks).

---

# 6. Testing

**Q43. What's the testing strategy?**
Two tiers. **Socket-free unit tests** always run — pure logic with mocked models: `computeTotals`, `formatInvoiceNumber`, `cycleToDelayMs`, `audit.sanitize`, pagination, the dashboard aggregation pipeline, JWT/token behavior, `authMiddleware` / `requireRole` RBAC, bcrypt, the SendGrid mailer (dry-run + `buildSendGridMessage`), and idempotency-middleware behavior against a mocked model. **DB-backed integration tests** cover real flows (auth, customer, invoice, payment, idempotency, notification, jobs/dashboard) with happy *and* failure paths.

**Q44. Why the split, and how is the DB provided?**
DB tests are gated by `BILLFLOW_SKIP_DB_TESTS` (via `describeDb = flag ? describe.skip : describe`) because they need a real TCP socket — some sandboxed CI/dev environments block `listen()` / `connect()`. The security-critical logic still has full socket-free coverage there. DB tests use `mongodb-memory-server`: a **standalone** instance where no transaction is needed (auth, PDF, idempotency), and a **single-node replica set** (`MongoMemoryReplSet`) everywhere multi-document transactions are exercised (invoice/payment/customer/job flows).

**Q45. How do you test idempotency and rollback specifically?**
**Idempotency:** call the create path twice with the same key and assert one record, one balance change, and identical responses — at both the service level and via real HTTP routes with a minted token. **Rollback:** mock `AuditLog.create` to throw mid-transaction and assert no invoice/payment was created and balances are unchanged — proving the transaction reverts every write.

**Q46. How do you test code that depends on Redis/SendGrid/Mongo without them?**
Dry-run mailer when `SENDGRID_API_KEY` is unset; `QUEUE_DISABLED=1` to no-op the queue (no Redis socket); in-memory Mongo (standalone + replica set); and the `BILLFLOW_SKIP_DB_TESTS` env gate for restricted sandboxes. Test setup also uses cost-4 bcrypt and throwaway JWT secrets.

**Q47. Adversarial / review-driven testing — anything notable?**
The privilege-escalation fix (register ignoring a client `role`) came from a security review and has a dedicated test. Tests assert anti-enumeration (identical login error), the transaction rollback path, the recurring-occurrence dedupe (same key → one doc), and that email templates never leak `password` / `cardnumber` / `cvv`. *(Stack note: backend uses Jest; the frontend uses Angular TestBed with Karma/Jasmine per the spec — CLAUDE.md's "Jest for every service/controller" rule is scoped to the backend.)*

---

# 7. Database Design (quick reference)

| Model | Notable fields | Key indexes |
|---|---|---|
| `User` | `email` (unique), `passwordHash` (`select:false`), `role` enum `admin`/`staff` default `staff` | unique `email` |
| `Customer` | `balance` (server-only), `status` enum `active`/`archived`, embedded `billingAddress` | `status`, `email`, `name` (email **not** unique) |
| `Invoice` | embedded `items[]`, `subtotal`/`tax`/`totalAmount`, status enum (5), `isRecurring`, `recurringCycle`, `lastReminderAt`, `idempotencyKey` (unique, sparse) | `customerId`, `status`, `dueDate`, compound `{status,dueDate}`, unique `invoiceNumber` |
| `Payment` | `invoiceId`, `customerId` (denormalized), `amount`, `method`/`status` enums, `idempotencyKey` (unique, sparse) | `invoiceId`, `customerId`; **no `updatedAt`** (immutable records) |
| `Counter` | `_id` scope key (`invoice-2026`), `seq`; atomic, session-aware `next(id, session)` | — |
| `IdempotencyKey` | `key` (unique), cached `{ statusCode, response }` | TTL `expires: 86400` (24h) |
| `RevokedToken` | `tokenHash` (SHA-256, unique), `expiresAt` | TTL `expires: 0` (delete once past) |
| `AuditLog` | `action`, `entityType`, `entityId`, `performedBy`, before/after (sanitized), `timestamp` | *none currently* |

**Embedded vs referenced line items?** Embedded — items have no independent life, are always read/written with their invoice, and are never queried alone; embedding keeps the invoice one atomic document with no joins.

---

# 8. How Would You Extend This? (forward-looking)

**Q48. Two admins edit the same customer at once — what happens, and what would you add?**
Currently last-write-wins. I'd add **optimistic concurrency**: a `version` field checked on update so the second writer gets a conflict instead of silently clobbering.

**Q49. How would you add a live payment gateway (Stripe/Razorpay)?**
Payments are recorded from external confirmation today (BRD §3.2). I'd add a gateway integration with **webhook handlers** — and the existing idempotency infrastructure (key + unique index) maps directly onto webhook `event.id` dedupe, since providers redeliver events. I'd also add an endpoint/flow to promote a `pending` payment to `completed` (today that transition has no path).

**Q50. How would you add multi-tenancy / data isolation?**
Add a tenant/org id to every record and **scope every query and index by it**, enforced centrally in the service layer (or a query helper) so no endpoint can read across tenants. Explicitly out of scope today (BRD §3.2).

**Q51. Calendar-accurate recurring cadence?**
Replace the fixed 30/91/365-day approximations with real calendar-month arithmetic (e.g. day-of-month clamping), or drive the schedule from an anchor date rather than "now + N days".

**Q52. The dashboard aggregation slows down as payments grow — what do you do?**
Keep the aggregation index-backed and paginated, then **precompute daily revenue rollups** into a summary collection (or cache them) so the dashboard reads pre-aggregated data instead of scanning all payments. (Today `getRevenueTrend` runs a live `$match status:completed` + monthly `$group` pipeline on every request.)

**Q53. If you rebuilt it today, top three changes?**
(1) Optimistic concurrency (version field); (2) multi-tenancy isolation from day one; (3) precomputed dashboard rollups. Smaller cleanups: move the access token out of `localStorage`, wire the frontend `returnUrl` after guard bounce (currently the guard never appends it, so deep links land on `/dashboard`), add a `status` index on `Payment`, index `AuditLog` (e.g. `entityId`/`timestamp`), and route `registerOverdueCheck` through the fast-fail enqueue.

---

## Quick-prep priority

Master cold: **the four signature concerns** (idempotency, transactions, audit, auth — Q9–Q31), the **balance / counter / cancel** trio (Q17–Q19), and the **async trade-offs** (Q33–Q39). Those are where engineering judgment shows and where a strong interviewer pushes hardest.
