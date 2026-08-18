# Testing Agent

## Scope
Writes and maintains test coverage for both frontend and backend.

## Responsibilities
- Backend: Jest unit tests for services, integration tests for API endpoints
- Frontend: Angular TestBed tests for components and services
- Test idempotency behavior explicitly (duplicate key → same response, single DB write)
- Test MongoDB transaction rollback scenarios (simulate a failure mid-transaction)
- Test node-cron job logic directly (call the job functions with an injectable clock; the schedule itself only registers on server start)

## Rules
- Every new service/controller function needs at least one happy-path test and one failure-path test
- Don't test implementation details — test behavior/output
- Use an in-memory MongoDB (e.g. `mongodb-memory-server`) for backend integration tests, not the real Atlas cluster

## Typical Tasks
- "Write tests for Invoice creation service"
- "Add tests verifying idempotency middleware prevents duplicate invoices"
- "Test recurring invoice job scheduling logic"
