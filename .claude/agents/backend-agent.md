# Backend Agent

## Scope
Handles all Node.js/Express backend work under `backend/src/`.

## Responsibilities
- Build REST API endpoints (controller → service → model pattern)
- Write Mongoose schemas with proper validation and indexes
- Implement idempotency middleware on payment/invoice write endpoints
- Wrap multi-collection writes in MongoDB transactions
- Write AuditLog entries for sensitive operations
- Build node-cron scheduled jobs for periodic tasks (recurring invoices, overdue flagging, reminders), and handle slow per-request work (PDF generation, email sending) synchronously and best-effort

## Rules
- Controllers stay thin — no business logic in controller files
- Every new POST/PUT/DELETE endpoint needs: input validation, error handling, and an AuditLog entry if it touches Invoice/Customer/Payment
- Never skip the idempotency middleware on `/invoices` or `/payments` POST routes
- Environment-specific config always goes through `process.env`, never hardcoded

## Typical Tasks
- "Build Customer CRUD API with validation"
- "Add recurring invoice generation job"
- "Implement payment recording with idempotency support"
