# ERP RBAC + Audit Notes (Canonical)

This note documents the minimum pattern for guarded endpoints and auditable workflow changes.

## 1) Guard backend endpoints with canonical permission checks

Use provider routes under `apps/backend/routes/api/provider/*` and gate transitions with canonical permissions from `apps/backend/shared/canonical-rbac.js`.

## 2) Record workflow transitions with audit trail

When status changes:

- include `actorId` and `actorRole` from authenticated user
- include `resourceType` and `resourceId`
- include previous/next status in transition metadata

## 3) Revision SLA fields

When revision is requested, keep both naming styles during transition windows:

- camelCase: `revisionRequestedAt`, `revisionDueAt`
- snake_case: `revision_requested_at`, `revision_due_at`

## 4) Canonical provider endpoints

- `POST /api/provider/applications/:id/workflow-transitions`
- `POST /api/provider/applications/:id/revision-expirations`
- `GET /api/provider/reviewer/dashboard`
- `POST /api/provider/admin/revision-reminder-runs`

## 5) Accounting receipt lifecycle

Relevant APIs:

- `GET /api/invoices/receipts/pending`
- `GET /api/invoices/receipts/issued`
- `POST /api/invoices/:invoiceId/receipt`

