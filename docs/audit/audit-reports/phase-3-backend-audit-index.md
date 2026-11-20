# Phase 3 Backend Audit Index

This phase audits `apps/backend` against the real runtime tree and related web-app call sites where contract drift is relevant.

Documents:

- `docs/backend-audit-auth.md`
- `docs/backend-audit-applicant-workflow.md`
- `docs/backend-audit-payment-invoice-quote.md`
- `docs/backend-audit-document-certificate.md`
- `docs/backend-audit-planting-trace.md`
- `docs/backend-audit-provider-ops.md`
- `docs/backend-audit-admin-system.md`
- `docs/backend-audit-public-integration.md`
- `docs/backend-audit-async-integration.md`

Coverage model:

- Each audit item is written against the active route family or compatibility path actually present in `apps/backend/routes/api`.
- Each item traces route -> controller -> service -> middleware/auth -> DB/queue/external dependency when that chain was visible in runtime code.
- Frontend/BFF contract mismatches are called out only where the corresponding `apps/web-app` caller was already verified in code.
- When a conclusion could not be proven from the inspected runtime path alone, the item explicitly says what should be opened next.

Known focus areas surfaced repeatedly across the files:

- canonical RBAC vs legacy role strings
- canonical workflow states vs legacy status dialects
- compatibility paths still present in runtime
- missing or inconsistent auth gates on provider/admin routes
- incomplete idempotency, transaction, queue safety, and webhook safety boundaries
