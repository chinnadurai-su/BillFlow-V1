# BillFlow — Interview Notes & Cheat Sheet

> A personal study guide for talking about BillFlow in interviews.
> Part 1 is a quick briefing. Part 2 is a full question bank with answers,
> grouped by round (overview, stack, architecture, deep-dives, DB, scenarios,
> frontend, security, testing, curveballs).

---

# PART 1 — THE BRIEFING

## 1. Elevator pitch (30 seconds)

BillFlow is a SaaS billing and invoicing platform — a lightweight Chargebee.
Businesses manage customers, create one-off and recurring invoices, record
payments against them, and track revenue on a dashboard. It handles the
money-critical parts carefully: every financial operation is **idempotent**,
multi-collection writes run in **database transactions**, and every sensitive
change is **audit-logged**. It's a full-stack app — Angular frontend, Node/Express
API, MongoDB — with **background jobs** for recurring invoices and overdue
reminders.

## 2. Tech stack (with the "why")

| Layer | Choice | Why |
|---|---|---|
| Frontend | Angular 21 — standalone components + Signals, NgRx for shared state only | Signals give fine-grained reactivity for local state; NgRx reserved for genuinely shared state (auth/user) to avoid boilerplate |
| Backend | Node.js + Express | Lightweight REST API, thin controllers |
| Database | MongoDB Atlas + Mongoose | Flexible schema for invoices with variable line items; transactions via replica sets |
| Queue | BullMQ + Redis | Background jobs run outside the request cycle |
| Email | SendGrid | Transactional email for invoices/reminders |
| PDF | PDFKit | Generate invoice PDFs in-memory (Buffer, no temp files) |
| Deploy | Netlify (frontend) + Render (backend) | |

## 3. Architecture in one breath

- **Modular backend**: each domain (`auth`, `customer`, `invoice`, `payment`,
  `dashboard`, `notification`) is a folder with `routes → controller → service`.
  Controllers are thin — all business logic lives in `*.service.js`.
- **Frontend feature-folder structure**: each feature has components, a
  data-access service over a central `ApiService`, and typed models. No `any`
  types — full typed model layer end to end.
- **Background jobs** run as BullMQ workers, not cron inside the web process,
  so scheduling scales independently of the API.

## 4. The four "signature" concerns

1. **Idempotency (defense in depth)** — client `Idempotency-Key` header + a
   middleware cache, backed by a **unique DB index** on `idempotencyKey`. On a
   race, one insert wins and the duplicate (E11000) returns the existing record.
   Cache stores only 2xx responses so a transient failure can still be retried.
2. **MongoDB transactions** — recording a payment touches Payment + invoice
   balance + invoice status + audit log; all wrapped in `withTransaction` so a
   failure rolls everything back.
3. **Audit logging** — every sensitive write logs a before/after snapshot inside
   the same transaction, sanitized of passwords/tokens/card fields.
4. **Auth & security** — JWT access (15m) + refresh (7d, httpOnly cookie), token
   rotation + revocation (SHA-256 hash denylist with TTL index), RBAC, bcrypt,
   no user enumeration, no privilege escalation, rate limiting.

## 5. Extra talking points

- Invoices: server computes totals (never trusts the client); numbers are
  sequential (`INV-2026-0001`) via an atomic counter; cancel is a soft-delete.
- Recurring invoices: a daily job generates the next occurrence; retries are
  deduped by a deterministic idempotency key.
- Frontend resilience: single-flight refresh, 401 refresh-and-retry interceptor,
  `switchMap` to cancel stale search requests.
- Testing: socket-free unit tests (always run) + DB-backed integration tests
  (env-gated), with explicit idempotency and rollback tests.

---

# PART 2 — QUESTION BANK WITH ANSWERS

## A. Warm-up / project overview

**1. Walk me through BillFlow in 2 minutes. What problem does it solve?**
It's a billing/invoicing SaaS for businesses that need to invoice customers and
collect payments. It solves the operational overhead of manual billing: you
store customers, generate invoices (one-off or recurring), email them as PDFs,
record payments against them, and see revenue/outstanding/overdue on a dashboard.
The engineering focus is correctness of money operations — no double charges, no
partial writes, and a full audit trail.

**2. Who are the users, and what are the core workflows?**
The users are business staff (with roles — regular users and admins). Core
workflows: (a) manage customers, (b) create and send invoices, (c) record
payments, (d) auto-generate recurring invoices and overdue reminders via jobs,
(e) monitor revenue on the dashboard.

**3. What was your role / what did you build?**
I built the full stack — the Angular frontend (typed services, Signals-based
components, auth store), the Express API (auth, customers, invoices, payments,
dashboard modules), the MongoDB schemas, the BullMQ jobs, and the test suite. I
put special emphasis on the money-critical guarantees: idempotency, transactions,
and audit logging.

**4. What's the single hardest problem you solved?**
Guaranteeing exactly-once financial writes under retries and races. A payment
must never be recorded twice even if the client retries or two requests race. I
solved it with defense in depth: an idempotency-key cache in front, plus a unique
database index as the real backstop, plus wrapping the whole write in a
transaction so the payment, the balance update, and the audit log all commit or
all roll back together.

**5. If you rebuilt it today, what would you change?**
Three honest things: (1) add optimistic concurrency (a version field) so two
admins editing the same record don't silently last-write-wins; (2) add
per-tenant multi-tenancy isolation from day one; (3) precompute dashboard
aggregates into a rollup collection so analytics stays fast at scale.

## B. Tech stack — "why did you choose X?"

**6. Why Angular over React/Vue?**
Angular gives an opinionated, batteries-included structure (routing, forms, DI,
HTTP) that keeps a larger app consistent, and Angular 21's Signals give
fine-grained reactivity without extra libraries. For a project that needs to be
maintainable and "interview-explainable," the opinionated structure is a plus.

**7. Why Signals and NgRx — isn't that redundant?**
No — they serve different scopes. Signals hold component-local state (form
values, UI toggles, computed totals). NgRx holds only genuinely shared state —
the current user and auth status — which is read by the route guard, the HTTP
interceptor, and the nav shell. Putting list/CRUD state in NgRx would be
boilerplate for no benefit, so those stay as local Signals. I actually removed a
customer NgRx slice to enforce this.

**8. Why MongoDB and not a relational DB for financial data?**
Two reasons: invoices have variable-length line items that map naturally to an
embedded document, and MongoDB (on a replica set) supports multi-document ACID
transactions, which is what the money paths need. I'd concede that a relational
DB is defensible for strict accounting/ledgering — the tradeoff is schema
flexibility vs rigid, relationally-enforced ACID.

**9. Why Express and not NestJS?**
Express is lightweight and gives full control. I imposed structure myself with
the routes → controller → service pattern, so I get separation of concerns
without a heavier framework. NestJS would be a reasonable choice if the team
wanted built-in DI and module conventions.

**10. Why BullMQ/Redis instead of node-cron?**
Jobs run outside the request/response cycle, survive process restarts, and get
retries with backoff for free. They also scale independently — I can run more
worker processes without touching the API. In-process cron would tie job
execution to the web server's lifecycle and single process.

**11. Why SendGrid over raw SMTP/Nodemailer?**
Managed deliverability, and a clean API. Importantly, my mailer has a **dry-run
mode** — if `SENDGRID_API_KEY` isn't set (dev/test), it logs instead of sending,
so tests and local dev never send real email or crash.

**12. Why PDFKit and not headless-browser (Puppeteer) rendering?**
PDFKit generates the PDF in-memory as a Buffer with no Chromium dependency —
much lighter to run on Render, no temp files, and fast for structured documents
like invoices. Puppeteer would be overkill and memory-heavy for this.

## C. System architecture / design

**13. Draw the request flow from browser to DB.**
Angular component → data-access service → `ApiService` (HttpClient) → auth
interceptor attaches the Bearer token → Express route → auth middleware verifies
JWT and sets `req.user` → thin controller validates and calls → service holds the
business logic and opens a transaction → Mongoose → MongoDB. Response comes back
as a `{ success, data }` envelope, which the frontend unwraps. Background work
(recurring invoices, reminders) is enqueued to BullMQ/Redis and consumed by a
separate worker.

**14. How is the backend structured? Why routes → controller → service?**
Each domain is a module folder. Routes wire URLs to controllers; controllers are
thin (validate input, call a service, shape the HTTP response); services hold all
business logic and data access. This keeps logic testable in isolation, reusable
across controllers/jobs, and keeps HTTP concerns out of business code.

**15. Where do background jobs fit? What runs them?**
A shared BullMQ queue (created lazily so importing it never opens a Redis socket)
holds jobs. A worker process consumes them and dispatches by job type:
`generatePDF`, `sendReminder`, `createRecurringInvoice`, `overdueCheck`. A daily
repeatable job flags overdue invoices and sends reminders.

**16. How would you scale this to 10× traffic?**
The API is stateless (JWT), so scale it horizontally behind a load balancer.
Scale MongoDB Atlas (bigger tier, then sharding on a good key). Add more BullMQ
worker instances for job throughput. Cache/precompute dashboard aggregates.
Redis is already shared, so the queue and idempotency backstop work across
instances.

**17. Is the API stateless? Where does session state live?**
Yes, stateless. The access token travels in the `Authorization` header; the
refresh token lives in an httpOnly cookie; the only server-side "session" state
is the refresh-token revocation denylist in MongoDB (hashed, TTL-expiring).

**18. How do frontend and backend keep their contract in sync?**
REST with a consistent JSON envelope (`{ success, data }` and a paginated
variant). The frontend has a typed model layer that mirrors the API shapes
(`ApiResponse<T>`, `Paginated<T>`, and per-feature models), so responses are
strongly typed end to end.

**19. What are the failure points and how does it degrade?**
Redis down → enqueue times out gracefully; jobs are skipped but the API keeps
serving. SendGrid down/unset → dry-run, no crash. DB down → 5xx with internals
scrubbed from the client. The transaction helper deliberately fails loudly rather
than silently writing non-atomically.

## D. The four signature deep-dives

### Idempotency

**20. What is idempotency and why does billing need it?**
An idempotent operation produces the same result whether it's applied once or
many times. Billing needs it because network retries, timeouts, and double-clicks
can send the same "create payment" request twice, and charging twice is
unacceptable.

**21. Walk me through your idempotency implementation end to end.**
The client generates a UUID and sends it as an `Idempotency-Key` header on
invoice/payment creation. Middleware checks a cache keyed by that value: on a
hit it returns the stored response without re-running the operation. That's layer
one. Layer two — the real correctness backstop — is a **unique index** on
`idempotencyKey` in the Invoice/Payment collections. If two requests slip past
the cache, the database rejects the second insert with a duplicate-key error
(E11000), and the service catches it and returns the already-created record.

**22. Two identical requests arrive the same millisecond and both miss the cache. What happens?**
Exactly what the unique index is for. Both try to insert; the database lets one
win and rejects the other with E11000. The service catches that and returns the
existing record, so the client still gets a success and there's only one payment.

**23. Why cache only 2xx responses?**
Because caching a failure would permanently block a legitimate retry. If the
first attempt failed transiently (say a timeout), the client should be able to
retry with the same key and succeed. Only successful responses are safe to
replay.

**24. Where do you store the idempotency cache and how does it expire?**
In the database (shared across API instances, so it works when scaled). The
authoritative uniqueness is the unique index on the record itself; the cached
response is what lets a repeat call return the same body cheaply.

**25. What if the client never sends a key?**
The operation proceeds without cache-level dedup. That's why the unique index
exists as a backstop for the records themselves, and why the frontend always
generates a fresh key per submit and disables the button while in flight.

### Transactions

**26. Which operations need a transaction and why?**
Any write that touches more than one collection. Recording a payment writes the
Payment, decrements the invoice balance, possibly flips the invoice to "paid,"
and writes an audit log — four writes that must all succeed or all fail. Invoice
create (invoice + counter + audit), cancel, send, and customer create/archive are
similar.

**27. What if the audit-log write fails halfway through recording a payment?**
The whole transaction rolls back. There's no orphan payment, the balance is
unchanged, and no audit entry is left dangling. The operation is atomic.

**28. MongoDB transactions need a replica set — how do you handle standalone dev?**
My `withTransaction` helper deliberately does **not** silently fall back to
non-transactional writes on a standalone server — it fails loudly, because a
silent fallback would break financial atomicity without anyone noticing. Tests
spin up an in-memory replica set so transactions work in CI.

**29. How did you test rollback?**
I mock the audit-log write to throw mid-transaction, then assert that no
payment/invoice was created and the customer/invoice balance is unchanged. That
proves the rollback actually reverts every write in the transaction.

### Audit logging

**30. What gets audited and what's in an entry?**
Every sensitive write — create/update/cancel/send on Invoice, create/update/
archive on Customer, record on Payment, plus system actions like the overdue
flip. Each entry captures who did it (or "system"), when, and a before/after
snapshot of the record.

**31. How do you keep secrets out of the audit log?**
A `sanitize()` step strips sensitive keys — password, tokens, card fields,
idempotency key — from the before/after snapshots before they're written. This
also applies to error messages and logs.

**32. Why write the audit entry inside the transaction instead of after?**
Atomicity in both directions: you can't have an action without its audit record,
and you can't have an audit record for an action that got rolled back. Writing it
after the commit would open a window where the two disagree.

### Auth

**33. Walk me through login → authenticated request → logout.**
Login verifies the bcrypt password hash, issues a short-lived access token
(returned to the app) and a refresh token (set as an httpOnly cookie). Each API
call carries the access token in the Authorization header; middleware verifies it
and sets `req.user`. When the access token expires, the client calls refresh; the
old refresh token is rotated (new one issued, old one denylisted). Logout
denylists the refresh token so it can't be reused.

**34. Why access + refresh tokens instead of one long-lived token?**
A short access token (15 min) limits the damage if it leaks — it expires fast and
isn't independently revocable. The refresh token lets you get new access tokens
and can be rotated and revoked, giving you control that a single long-lived JWT
wouldn't.

**35. Where's the refresh token stored and why httpOnly cookie?**
In an httpOnly cookie, so JavaScript can't read it — that mitigates token theft
via XSS. Secure/SameSite attributes are tuned per environment.

**36. JWTs are stateless — how do you revoke one on logout?**
I keep a denylist: on logout (and on every rotation) the refresh token is stored
as a SHA-256 hash with a TTL index that auto-purges it at expiry. Refresh checks
the denylist and rejects revoked tokens. Storing only a hash means the raw token
isn't recoverable from the DB.

**37. What's token rotation and why?**
Every refresh issues a brand-new refresh token and denylists the old one. If a
refresh token is stolen and replayed, the legitimate rotation will have already
invalidated it (or the attacker's use invalidates the real user's), which limits
replay attacks.

## E. Database design

**38. Show me your main schemas and their relationships.**
User (auth + role), Customer (with balance and active/archived status), Invoice
(embedded line items + `customerId`, status, dueDate), Payment (`invoiceId` +
`customerId`), Counter (invoice-number sequence), RevokedToken (denylist), and
AuditLog. Invoices reference customers; payments reference both invoice and
customer.

**39. Embedded or referenced line items? Why?**
Embedded. Line items have no life of their own — they're always created, read,
and updated together with their invoice, and there's no need to query them
independently. Embedding avoids joins and keeps the invoice a single atomic
document.

**40. How are invoice numbers generated with no gaps or duplicates?**
A Counter document with an atomic `findByIdAndUpdate($inc)`, scoped per year
(e.g. `invoice-2026`). The increment happens inside the invoice-create
transaction, so numbers are sequential and unique — `INV-2026-0001`,
`INV-2026-0002`, and so on.

**41. What indexes did you add and why?**
`customerId`, `status`, `dueDate` on Invoice for frequent filters, plus a
compound `{status, dueDate}` for the overdue sweep; `invoiceId`/`customerId` on
Payment; email/status/name on Customer; a **unique** index on `idempotencyKey`;
and a **TTL** index on RevokedToken so expired tokens self-delete.

**42. How do you "delete" an invoice?**
Soft-delete — status changes to cancelled, the record is retained. Financial
records shouldn't be hard-deleted (audit/compliance), and cancel is admin-only
via RBAC.

**43. How do you keep an invoice's balance correct as payments come in?**
Each payment decrements the invoice/customer balance with `$inc` inside the
payment transaction, flips the invoice to "paid" when fully covered, and guards
against overpayment and payments on cancelled invoices. Because it's in a
transaction plus idempotent, the balance changes exactly once per payment.

**44. How does the TTL index on RevokedToken work?**
Each denylist entry stores an expiry aligned to the token's own expiry; MongoDB's
background TTL monitor deletes expired documents automatically, so the denylist
stays small and self-cleaning.

## F. Scenario-based

**45. A user double-clicks "Pay $500." What prevents two payments?**
Idempotency. The form generates one key per submit and disables the button while
in flight; the middleware cache returns the same response on the repeat; and the
unique index guarantees only one payment record even if both slip through.

**46. A recurring-invoice job crashes and BullMQ retries it. Duplicate invoice?**
No. Each recurring occurrence is created with a deterministic idempotency key
(e.g. based on the job/occurrence identity), so a retried job hits the unique
index and dedupes instead of creating a second invoice.

**47. Redis is down. What happens to the API and jobs?**
The API still serves reads and writes normally. Enqueue calls time out gracefully
rather than hanging, so jobs are simply deferred/skipped — no crash. Jobs resume
when Redis is back.

**48. A payment is recorded but the app crashes before responding; the client retries. Result?**
The retry carries the same idempotency key, so it returns the already-created
payment. No duplicate, correct balance.

**49. Someone registers with `role: "admin"` in the body. What happens?**
The server ignores the client-supplied role and assigns the default — public
registration can't self-assign admin. This privilege-escalation guard is
explicitly tested.

**50. An attacker floods `/login` with guesses. Defenses?**
Rate limiting on the auth routes (skipped only in tests), bcrypt's deliberate
cost slowing each attempt, and an identical error for wrong-email vs
wrong-password so the attacker learns nothing.

**51. A stolen access token — how bad, for how long?**
Bounded — it's valid ~15 minutes and can't be refreshed without the httpOnly
refresh cookie. The refresh token is revocable, so the session can be killed.

**52. Invoice PDF for a 500-line invoice — memory concern?**
PDFKit builds it as a Buffer; for typical invoices that's fine. If documents got
very large I'd stream the PDF directly to the response instead of buffering the
whole thing.

**53. Two admins edit the same customer simultaneously — last write wins?**
Currently yes, last-write-wins. The improvement I'd make is optimistic
concurrency: a version field checked on update so the second writer gets a
conflict instead of silently clobbering. (Good "what I'd improve" answer.)

**54. The dashboard aggregation slows down as data grows. What do you do?**
Ensure the aggregation is index-backed, paginate, and precompute daily revenue
rollups into a summary collection (or cache them) so the dashboard reads
pre-aggregated data instead of scanning all payments each time.

## G. Frontend-specific

**55. Standalone components vs NgModules — why standalone?**
Standalone removes NgModule boilerplate, makes dependencies explicit per
component, and enables straightforward lazy loading of routes. It's the modern
Angular default and keeps the feature-folder structure clean.

**56. Signals vs RxJS Observables — when each?**
Signals for synchronous local state and derived values (form totals, UI flags) —
they're simple and integrate with the template. Observables/RxJS for async
streams and event pipelines (debounced search, HTTP, cancellation with
`switchMap`). I bridge them with `toSignal`/`toObservable` where needed.

**57. How does the HTTP interceptor work?**
It attaches the Bearer access token and credentials to same-origin API calls,
skips `/auth/*` routes, and on a 401 triggers a single refresh-and-retry. If the
refresh fails, it tears down the session and redirects to login.

**58. Concurrent requests all get 401 at once. How do you avoid 5 refresh calls?**
Single-flight refresh: the first 401 starts a refresh observable shared via
`shareReplay`; concurrent 401s subscribe to that same in-flight refresh and then
retry, so only one refresh request actually goes out.

**59. How does the route guard work, and how do you return the user after login?**
`authGuard` checks `AuthService.isAuthenticated()`. If not authed, it redirects to
`/auth/login` with a `returnUrl` query param, and after successful login the app
navigates back to that URL.

**60. How do you cancel a stale search request as the user types?**
Debounce the input, then `switchMap` the term to the HTTP call. `switchMap`
cancels the previous inner request when a new term arrives, so only the latest
search resolves, and I reset to page 1 on a new term.

**61. How is the frontend fully typed — no `any`?**
A typed model layer: a generic API envelope (`ApiResponse<T>`, `Paginated<T>`,
`AppError`) plus per-feature domain models (customer, invoice, payment,
dashboard, auth). Services and components use these generics end to end.

**62. How do you show friendly errors instead of raw server errors?**
The backend returns a stable `errorCode`; the frontend maps codes to friendly
copy via a `FRIENDLY_ERROR_MESSAGES` map with a sensible fallback, and flags
network/status-0 errors distinctly.

## H. Security

**63. Top 3 security risks in a billing app and mitigations.**
(1) Duplicate/fraudulent charges → idempotency + transactions. (2) Auth/token
compromise → short access tokens, httpOnly rotating refresh tokens, revocation,
RBAC. (3) Sensitive-data leakage → sanitized audit logs, scrubbed 5xx responses,
bcrypt with `select:false`, never logging secrets.

**64. How do you prevent user enumeration on login?**
Unknown-email and wrong-password return the exact same error, so an attacker
can't tell which emails are registered.

**65. How are passwords stored?**
bcrypt-hashed with a configurable cost. The hash field is `select:false` and
stripped in `toJSON`, so it's never returned by the API or logged.

**66. How do you prevent secrets leaking into logs/audit/errors?**
Audit snapshots run through `sanitize()`; 5xx handlers log details server-side but
send a generic message to the client; passwords/tokens/card data are never logged
anywhere.

**67. XSS/injection concerns — how handled?**
Email/template content is HTML-escaped; user-supplied search terms are
regex-escaped before building queries; Mongoose parameterizes queries. Angular
escapes template bindings by default on the frontend.

**68. How would you add multi-tenancy / data isolation?**
Add an org/tenant id to every record and scope every query and index by it,
enforced centrally (e.g. in the service layer or a query helper) so no endpoint
can accidentally read across tenants. This is future work I'd prioritize.

## I. Testing / quality

**69. What's your testing strategy? What's covered?**
Two tiers. Socket-free **unit tests** always run (tokens, RBAC, total
computation, pagination, audit sanitize, dashboard pipeline, worker dispatch).
**DB-backed integration tests** cover the real flows (auth, customer, invoice,
payment, idempotency, notification, jobs/dashboard) with happy and failure paths.
DB tests are gated by an env flag so they skip where there's no database.

**70. How do you test idempotency and rollback specifically?**
Idempotency: call the create path twice with the same key and assert one record,
one balance change, and identical responses — at both the service and HTTP
duplicate-key levels. Rollback: force the audit write to throw and assert nothing
was persisted and balances are unchanged.

**71. How do you test code depending on Redis/SendGrid/Mongo without them?**
Dry-run mailer when the API key is unset, a `QUEUE_DISABLED` flag to no-op the
queue, an in-memory MongoDB (standalone and replica set) for DB tests, and an
env gate to skip DB tests in restricted sandboxes.

**72. Do you chase 100% coverage?**
No — I target meaningful coverage: every service gets a happy path and a failure
path, and the risky money logic (idempotency, transactions, RBAC) gets explicit
dedicated tests. Coverage is a means, not the goal.

## J. Curveballs / "why" follow-ups

**73. Convince me MongoDB is safe for money.**
On a replica set, MongoDB supports multi-document ACID transactions with
snapshot isolation. I wrap every multi-collection money write in one, and my
helper refuses to run non-transactionally, so there's no silent weakening of the
guarantee. Combined with idempotency and a unique index, writes are atomic and
exactly-once. For a full general ledger I might still choose SQL, but for this
domain the guarantees are sufficient and proven by the rollback tests.

**74. Idempotency key + unique index — isn't the middleware cache redundant?**
They do different jobs. The unique index guarantees **correctness** (no duplicate
record). The cache is an **optimization + UX**: it returns the same response body
without re-running the operation or hitting a duplicate-key error path. You could
drop the cache and stay correct, but you'd do more work and return a less clean
response on retries.

**75. What happens to idempotency if you run multiple API instances?**
Still safe, because both mechanisms live in shared MongoDB, not in-process
memory. Any instance sees the same cache and the same unique index, so dedup
holds across the whole fleet.

**76. Refresh token in a cookie, access token in JS — what about CSRF?**
The access token is sent explicitly in a header, not automatically by the
browser, so it's not CSRF-exploitable. The refresh cookie uses SameSite (and
Secure) to limit cross-site sending. If I needed cookie-based auth for state-
changing routes, I'd add a CSRF token as well.

**77. Doesn't putting the audit log in the transaction hurt write performance?**
There's a small cost, but correctness wins — you can't have actions and their
audit trail disagree. If audit volume became a bottleneck I'd keep the write in
the transaction but archive/offload old audit data out of the hot collection.

**78. Where would business logic leak into a controller if you weren't careful?**
Anywhere you're tempted to compute or branch in the controller — e.g. computing
invoice totals, deciding whether an invoice is fully paid, or building the audit
snapshot. In BillFlow all of that lives in the service; the controller only
validates input, calls the service, and shapes the HTTP response.

---

## Quick-prep priority

Master cold: **B7, the four deep-dives (D20–D37), and F45–F48** — that's where
engineering judgment shows and where a strong interviewer will push hardest. For
everything else, the one- or two-sentence version above is enough.
