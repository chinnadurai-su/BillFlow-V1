# BillFlow — Business Requirements Document (BRD)

**Document Version:** 1.0
**Project Type:** SaaS Billing & Invoicing Platform
**Domain:** B2B Subscription/Invoice Management (Chargebee-style)

---

## 1. Executive Summary

BillFlow is a SaaS billing and invoicing platform designed to help businesses manage customer relationships, generate and track invoices, process payments, and automate recurring billing cycles. The platform reduces manual billing overhead through automation (recurring invoices, payment reminders, PDF generation) while maintaining strict data integrity and auditability — critical for financial software.

This document defines the business requirements that guide functional scope, user roles, business rules, and success criteria for BillFlow's development.

---

## 2. Business Objectives

| Objective | Description |
|---|---|
| Reduce manual billing effort | Automate recurring invoice generation and payment reminders |
| Improve payment visibility | Real-time dashboard showing revenue, outstanding, and overdue amounts |
| Ensure financial data integrity | No duplicate charges, consistent records across related data (invoices, payments, balances) |
| Maintain compliance readiness | Every financial action is logged and traceable |
| Enable fast customer onboarding | Simple customer and invoice creation workflow |

---

## 3. Scope

### 3.1 In Scope
- Customer relationship management (create, view, update, archive customers)
- Manual and recurring invoice generation
- PDF invoice generation and email delivery
- Payment recording and reconciliation
- Automated payment reminder emails
- Revenue/outstanding/overdue dashboard with visual charts
- Role-based access (Admin, Staff)
- Audit trail for all sensitive financial actions

### 3.2 Out of Scope (Current Phase)
- Direct payment gateway integration (Stripe/Razorpay charge processing) — payments are recorded manually or via reconciliation, not processed live through BillFlow in this phase
- Multi-currency support
- Multi-tenancy (separate businesses sharing one deployment)
- Tax jurisdiction-specific tax calculation engines
- Mobile native apps (web-responsive only)

---

## 4. Stakeholders

| Role | Interest |
|---|---|
| Business Owner / Admin | Full visibility into revenue, customers, and system configuration |
| Staff / Billing Operator | Day-to-day invoice and payment management |
| Customer (indirect) | Receives invoices and payment reminders via email; does not log into the system directly in this phase |

---

## 5. User Roles & Permissions

| Capability | Admin | Staff |
|---|---|---|
| Manage customers (CRUD) | Yes | Yes |
| Create/edit invoices | Yes | Yes |
| Delete/cancel invoices | Yes | No (requires Admin) |
| Record payments | Yes | Yes |
| View dashboard/analytics | Yes | Yes |
| Manage user accounts | Yes | No |
| View audit logs | Yes | No |

---

## 6. Functional Requirements

### 6.1 Customer Management
- **FR-1.1:** System shall allow creating a customer record with name, email, phone, and billing address.
- **FR-1.2:** System shall allow editing and archiving (soft-delete) customer records.
- **FR-1.3:** System shall maintain a running outstanding balance per customer, updated automatically as invoices/payments occur.
- **FR-1.4:** System shall allow searching/filtering the customer list by name or email.

### 6.2 Invoice Management
- **FR-2.1:** System shall allow creating an invoice with one or more line items (description, quantity, unit price).
- **FR-2.2:** System shall automatically calculate subtotal, tax, and total amount from line items.
- **FR-2.3:** System shall support invoice statuses: draft, sent, paid, overdue, cancelled.
- **FR-2.4:** System shall generate a unique, human-readable invoice number automatically.
- **FR-2.5:** System shall support marking an invoice as recurring (monthly/quarterly/yearly), automatically generating a new invoice each cycle.
- **FR-2.6:** System shall generate a downloadable PDF for any invoice.
- **FR-2.7:** System shall allow sending an invoice to the customer via email with the PDF attached.
- **FR-2.8:** System shall prevent duplicate invoice creation if the same creation request is submitted twice (e.g. due to network retry or accidental double-click).
- **FR-2.9:** System shall automatically flag invoices as "overdue" once the due date passes without full payment.

### 6.3 Payment Management
- **FR-3.1:** System shall allow recording a payment against a specific invoice, including amount, method, and status.
- **FR-3.2:** System shall update the related invoice's status to "paid" once the full amount is recorded.
- **FR-3.3:** System shall update the customer's outstanding balance when a payment is recorded.
- **FR-3.4:** System shall prevent duplicate payment records for the same payment action (idempotency).

### 6.4 Notifications
- **FR-4.1:** System shall automatically send a reminder email to customers with invoices approaching or past their due date.
- **FR-4.2:** System shall send an email with the invoice PDF attached when an invoice is marked "sent."
- **FR-4.3:** Reminder and notification jobs shall run asynchronously and not block the main application from responding to user requests.

### 6.5 Dashboard & Reporting
- **FR-5.1:** System shall display total revenue, total outstanding, and total overdue amounts on a summary dashboard.
- **FR-5.2:** System shall display a revenue trend chart over a selectable time range.
- **FR-5.3:** Dashboard data shall reflect near-real-time state (no more than a few minutes of staleness).

### 6.6 Audit & Compliance
- **FR-6.1:** System shall log every create/update/delete action on Invoice, Payment, and Customer records, capturing who performed the action, what changed, and when.
- **FR-6.2:** Audit logs shall never contain full payment card numbers or plaintext passwords.
- **FR-6.3:** Audit logs shall be retained and queryable by Admin users (queryable — not necessarily exposed in UI in the current phase).

### 6.7 Authentication & Access
- **FR-7.1:** System shall require login (email + password) for all users.
- **FR-7.2:** System shall issue short-lived access tokens with a longer-lived refresh mechanism.
- **FR-7.3:** System shall enforce role-based access as defined in Section 5.

---

## 7. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Data Integrity | Financial operations touching multiple records (e.g. invoice + balance + audit log) must be atomic — all succeed or all fail together |
| Duplicate Prevention | Payment and invoice creation must be protected against duplicate execution from network retries |
| Performance | Dashboard and list views should load within 2 seconds under normal load |
| Availability | Background jobs (PDF generation, email sending) should not block or slow down interactive API responses |
| Security | Passwords hashed, never logged; sensitive fields never appear in logs or audit trails |
| Auditability | Every financial state change must be traceable to a user and a timestamp |
| Usability | Interface usable on both desktop and mobile browser widths |
| Maintainability | Codebase organized by clear module boundaries (auth, customer, invoice, payment, notification) to support solo or small-team development |

---

## 8. Business Rules

- **BR-1:** An invoice cannot be deleted once a payment has been recorded against it — it can only be cancelled (soft state change), preserving the audit trail.
- **BR-2:** A customer's outstanding balance is always the sum of unpaid invoice amounts minus recorded payments — never manually overridden.
- **BR-3:** Recurring invoices continue generating until the recurring flag is turned off or the customer is archived.
- **BR-4:** An invoice past its due date without full payment automatically becomes "overdue" — this is a system-computed status, not manually set.
- **BR-5:** Only Admin users can permanently remove a customer or user record; Staff can only archive.

---

## 9. Assumptions & Constraints

### Assumptions
- Single business/tenant uses one deployment (no multi-tenancy in this phase)
- Payments are recorded based on external confirmation (bank transfer, manual card processing) rather than live gateway webhooks in this phase
- English-only interface for the current phase
- Single currency (INR or USD, to be fixed per deployment) — no multi-currency conversion

### Constraints
- Must run on free/low-cost infrastructure tiers suitable for a solo-developer project (Netlify, Render, MongoDB Atlas free tier)
- Development timeline driven by a single developer working part-time alongside other commitments

---

## 10. Success Metrics

| Metric | Target |
|---|---|
| Duplicate financial records in production | Zero |
| Invoice PDF generation success rate | 99%+ |
| Reminder email delivery success rate | 95%+ |
| Dashboard load time | Under 2 seconds |
| Audit log coverage on financial actions | 100% |

---

## 11. Glossary

| Term | Meaning |
|---|---|
| Idempotency | Property ensuring that repeating the same request doesn't cause duplicate side effects |
| Recurring Invoice | An invoice template that automatically regenerates on a schedule |
| Outstanding Balance | Amount a customer currently owes across unpaid invoices |
| Audit Log | Record of who did what, when, on sensitive data |

---

*This BRD defines business-level requirements. Technical implementation details (architecture, schemas, API contracts) are covered separately in `docs/BillFlow_Dev_Technical_Spec.md`.*