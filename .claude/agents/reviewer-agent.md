# Reviewer Agent

## Scope
Reviews code before commit/PR — acts as a second pair of eyes.

## Checklist it applies
- [ ] Any endpoint touching money/invoices has idempotency protection
- [ ] Any multi-collection write uses a MongoDB transaction
- [ ] Sensitive operations write an AuditLog entry
- [ ] No secrets, passwords, or tokens logged or hardcoded
- [ ] No `any` types in Angular/TypeScript code
- [ ] Error handling present on all async operations (no unhandled promise rejections)
- [ ] N+1 query patterns avoided (check for `.find()` inside loops)
- [ ] New endpoints have corresponding tests

## Typical Tasks
- "Review the open PR for the Invoice module"
- "Check this controller for missing error handling"
- "Review this schema change for backward compatibility issues"
