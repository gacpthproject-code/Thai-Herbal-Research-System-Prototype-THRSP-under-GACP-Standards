# Phase 3 Backend Audit - Payment, Invoice, Quote

[Backend Audit Item]
- ID: PAY-01
- Endpoint/Module: Payment creation surface `/api/payments/create`
- Controller/Service/Middleware: `routes/api/payments.js` -> `services/payment-service.js` -> `payment-service-phase-flow.js`
- Expected Role: `health` for phase 1; scheduler/admin only when initiating phase 2 through provider flow
- DB/Queue/External Dependency: `Application`, `Invoice`, `PaymentTransaction`, PromptPay/mock payment provider
- Findings: Route-level phase resolution maps statuses such as `SUBMITTED` and `PENDING_DOC_FEE` to phase 1 and `DOC_APPROVED` and `PENDING_AUDIT_FEE` to phase 2, but the underlying phase-creation services allow a different set of statuses. The route contract and service contract are not aligned.
- Risk Level: Critical
- Evidence from code/runtime structure: `apps/backend/routes/api/payments.js` defines `PHASE_FROM_STATUS`; `apps/backend/services/payment-service-phase-flow.js` only accepts legacy phase-creation states such as `PAYMENT_1_PENDING` and `UNDER_REVIEW`, not the route-level canonical inputs.
- Suspected Failure Mode: The endpoint accepts an application as phase-eligible at the route layer and then fails inside the payment service with a status error, producing broken payment initiation for otherwise valid frontend flows.
- What to inspect next: Open the exact `createPhase1Payment` and `createPhase2Payment` guards in `apps/backend/services/payment-service-phase-flow.js`.

[Backend Audit Item]
- ID: PAY-02
- Endpoint/Module: Phase-specific payment endpoints `/api/payments/phase1/:applicationId` and `/api/payments/phase2/:applicationId`
- Controller/Service/Middleware: `routes/api/payments.js` -> auth middleware -> `services/payment-service.js`
- Expected Role: `health` for phase 1; `scheduler` or `admin` for phase 2
- DB/Queue/External Dependency: `Application`, `Invoice`, `PaymentTransaction`
- Findings: Phase 2 initiation is protected by canonical role normalization in the route, but the service still expects `UNDER_REVIEW` rather than the scheduler dashboard's canonical phase-2 readiness states. This creates a split between the scheduler UI logic and the payment initiation service.
- Risk Level: High
- Evidence from code/runtime structure: `apps/backend/routes/api/payments.js` restricts phase 2 to scheduler/admin; `apps/backend/routes/api/provider/handlers/scheduler-dashboard-handler.js` treats `AUDIT_FEE_PAID` and related states as scheduling flow; `apps/backend/services/payment-service-phase-flow.js` still checks `UNDER_REVIEW`.
- Suspected Failure Mode: Scheduler users see an application as ready in the dashboard path but cannot generate the expected phase-2 payment artifact due to service-layer state rejection.
- What to inspect next: Compare the scheduler frontend payment trigger path, if any, against `/api/payments/phase2/:applicationId`.

[Backend Audit Item]
- ID: PAY-03
- Endpoint/Module: Payment webhook surface `/api/webhooks/payment` and `/api/webhooks/payment/:provider`
- Controller/Service/Middleware: `routes/api/webhooks.js` -> `services/payment-service.js::handleWebhook` -> `payment-service-webhook-flow.js`
- Expected Role: Machine-to-machine callback with signature validation and idempotent processing
- DB/Queue/External Dependency: Payment gateway signature, `PaymentTransaction`, `Application`, notifications, optional webhook DLQ
- Findings: The webhook route always returns HTTP 200 even when processing fails, which avoids retries but weakens delivery semantics. Service-level idempotency only covers a narrow "already SUCCESS then SUCCESS again" case, and application update plus transaction update are not handled as one atomic unit.
- Risk Level: Critical
- Evidence from code/runtime structure: `apps/backend/routes/api/webhooks.js` returns success envelopes with `processed`, `unmatched`, and `invalidSignature` even on failure paths; `apps/backend/services/payment-service-webhook-flow.js` updates transaction state and then branches into success/failure handlers without wrapping all side effects in one transaction.
- Suspected Failure Mode: Duplicate callbacks or mid-flight failures can leave `PaymentTransaction`, `Invoice`, and `Application` out of sync while the gateway receives a 200 and stops retrying.
- What to inspect next: Open any DLQ processor under queue workers to see whether failed webhook events are persisted or retried elsewhere.

[Backend Audit Item]
- ID: PAY-04
- Endpoint/Module: Quote management under `/api/quotes/*`
- Controller/Service/Middleware: `routes/api/quotes.js` -> Prisma direct writes -> notification service -> helper routes in `helpers/quotes-provider-routes.js`
- Expected Role: Provider accounting/review provider for provider actions; `health` for `/my` and accept/reject own quotes
- DB/Queue/External Dependency: `Quote`, `Invoice`, `Application`, notifications
- Findings: Quote routes rely mostly on broad `authenticateProvider` without canonical permission checks, use inline validation, and write legacy statuses such as `QUOTE_SENT` and `AWAITING_PAYMENT` directly to `Application`. Helper routes for manual invoice creation and document-number override also omit accountant/admin permission guards.
- Risk Level: High
- Evidence from code/runtime structure: `apps/backend/routes/api/quotes.js` lacks `requireCanonicalPermission(...)`; `apps/backend/routes/api/helpers/quotes-provider-routes.js` only uses provider auth; both files write legacy quote and application statuses.
- Suspected Failure Mode: Any provider-authenticated provider account can create invoices, mutate quote numbers, or move applications into stale billing states that other modules no longer treat canonically.
- What to inspect next: Compare frontend accounting pages and any BFF quote handlers with the actual quote endpoints to confirm which Provider roles can reach these actions.

[Backend Audit Item]
- ID: PAY-05
- Endpoint/Module: Invoice routes under `/api/invoices/*`
- Controller/Service/Middleware: `routes/api/invoices.js` -> `services/invoice-service.js` -> local `requirePermission(...)` middleware
- Expected Role: `account` or other canonical roles with invoice permissions; `health` for own invoice download/payment initiation
- DB/Queue/External Dependency: `Invoice`, `Quote`, payment provider, PDF generation
- Findings: Invoice routes are more aligned with canonical RBAC than quote routes, but invoice numbering and quote-to-invoice conversion elsewhere still use count-based numbering patterns that are concurrency-sensitive. Error handling is route-local and not transaction-oriented across quote acceptance, invoice creation, and application status update.
- Risk Level: Medium
- Evidence from code/runtime structure: `apps/backend/routes/api/invoices.js` defines a canonical permission wrapper using `canonical-rbac`; `apps/backend/routes/api/quotes.js` and `helpers/quotes-provider-routes.js` generate invoice numbers via `count()+1` and perform multi-step writes without a surrounding Prisma transaction.
- Suspected Failure Mode: Concurrent quote acceptance or manual invoice creation can collide on invoice numbers or leave quote, invoice, and application records in partially updated states.
- What to inspect next: Open `apps/backend/services/invoice-service.js` to confirm whether service-level transaction wrappers exist for receipt issuance and payment initiation.
