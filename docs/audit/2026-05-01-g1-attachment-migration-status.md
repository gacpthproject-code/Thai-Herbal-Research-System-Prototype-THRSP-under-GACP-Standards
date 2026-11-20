# G1 Attachment migration — status & reader playbook

**Date**: 2026-05-01
**Status**: Foundation + writers + backfill complete. Readers tracked per-consumer.
**Companion to**: `docs/audit/2026-04-30-workflow-gap-analysis.md`, `docs/deployment/2026-05-01-wave-a-release-notes.md`

## Why this doc exists

The 2026-04-30 workflow gap analysis flagged G1 (polymorphic `Attachment` model) as a "L (Large) effort, multi-PR over 2 weeks" initiative. Wave A in this session shipped the foundation, every writer dual-write, and a one-shot backfill of historical data. **Reader migration is a per-consumer concern that lands as small follow-up PRs once the frontend for each surface is also ready.** This doc captures the pattern, the per-consumer status, and the migration playbook so the work can resume cleanly.

## What's done (Phases 32–48)

| Layer | Status | PR |
|---|---|---|
| `Attachment` Prisma model + migration | ✅ | #109 |
| `attachment-service.js` (5 functions, 14 tests) | ✅ | #109 |
| Tenant + soft-delete extension wiring | ✅ | #109 |
| Dual-writer: `PaymentSlip.fileUrl` | ✅ | #110 |
| Dual-writer: `ReportSubmission.attachmentUrl` | ✅ | #111 |
| Dual-writer: `Lot.labTestReportUrl` | ✅ | #112 |
| Dual-writer: `Application.attachments` (JSON) | ✅ | #113 |
| Dual-writer: `PostAuditTask.documents` (JSON) | ✅ | #114 |
| Dual-writer: `AuditChecklist.sections.*.evidence` | ✅ | #115 |
| Schema cleanup: drop dead `pdfUrl` columns | ✅ | #116 |
| Backfill script (idempotent, all 6 consumers) | ✅ | #125, #126 |
| Backfill executed on production | ✅ | 2026-05-01 |

Production state at execution: 0 `payment_slips` rows, 0 `report_submissions` with `attachmentUrl` set, 0 `lots` with `labTestReportUrl`, 9 applications with non-null `attachments` JSON (all empty arrays), 0 post-audit tasks, 0 audit checklists. **No live legacy data exists today.** The dual-writer + backfill infrastructure is ready for the moment users start uploading files via these flows.

## What "reader migration" means

Today every reader fetches the legacy field directly:

```js
// Today (legacy)
const slip = await prisma.paymentSlip.findUnique({ where: { id } });
return res.redirect(slip.fileUrl);
```

After reader migration:

```js
// After reader migration
const attachments = await attachmentService.listForResource({
    prisma,
    resModel: 'PaymentSlip',
    resId: id,
    field: 'fileUrl',
});
const fileUrl = attachments[0]?.fileUrl || (await prisma.paymentSlip.findUnique({ where: { id } }))?.fileUrl;
return res.redirect(fileUrl);
```

The legacy column stays populated by the existing dual-write path. The fallback handles any edge case where the Attachment row is missing (shouldn't happen post-backfill, but defensive). After every reader on a model is migrated AND the model has been observed in production with the new path working, the legacy column can be dropped — and reader migration unlocks that drop.

## Per-consumer reader surface + migration plan

### PaymentSlip.fileUrl

**Readers**:
- `apps/backend/routes/api/finance/payment-slips.js`
  - `GET /:id` — returns slip including `fileUrl` (response shape)
  - `GET /:id/file` — redirects to `slip.fileUrl` for download
  - Cloud storage path: extracts key from `slip.fileUrl` for signed URL
- `apps/backend/services/payment-slip-service.js` `getSlipById()` — returns full slip object
- Frontend: `apps/web-app/src/app/provider/accounting/slip-review/*` — read `slip.fileUrl` to render preview

**Migration**: 1 PR, ~30 min
1. Backend: add Attachment lookup in `slip-review` response builder, prefer Attachment when present.
2. Frontend: no change needed — response shape stays the same.
3. After deploy + observation: drop `PaymentSlip.fileUrl` / `fileMimeType` / `fileSizeBytes` columns in a follow-up.

### ReportSubmission.attachmentUrl

**Readers**:
- `apps/backend/routes/api/documents/report-submissions.js`
  - `GET /` (list), `GET /:id` (detail) — both return `attachmentUrl` in response
- Frontend: HEALTH report views read `report.attachmentUrl` to show attachment download link.

**Migration**: 1 PR, ~30 min — same shape as PaymentSlip.

### Lot.labTestReportUrl

**Readers**:
- `apps/backend/routes/api/trace/lots.js` — admin/HEALTH lot detail
- `apps/backend/services/trace-service/resolve-generic.js:250` — public QR display

**Migration**: 1 PR, ~30 min — same shape.

### Application.attachments (JSON array, slot-keyed)

**Readers** (highest fan-out):
- `apps/backend/routes/api/preview/preview.js` — preview endpoint maps attachments through
- `apps/backend/routes/api/preview/preview-utils.js` — preview shape builder, multiple sites
- `apps/backend/routes/api/helpers/application-payload-builders.js` — payload composition
- `apps/backend/routes/api/provider/applications.js:256` — provider detail select
- `apps/backend/routes/api/applications/application-workflow-handlers.js:130` — comment attachments (different flow but reads from JSON)
- Frontend: HEALTH wizard preview, provider review pages, PDF templates

**Migration**: 2-3 PRs:
1. Server-side mapper that prefers Attachment table over JSON (touches preview-utils + provider applications).
2. Frontend display update if the response shape changes.
3. After observation: drop the `attachments` JSON column.

### PostAuditTask.documents (JSON array)

**Readers**:
- `apps/backend/routes/api/audit/post-audit.js` — task list/detail
- Frontend: post-audit task UI

**Migration**: 1 PR, ~45 min (JSON array shape conversion).

### AuditChecklist.sections.*.evidence (deeply nested JSON)

**Readers**:
- `apps/backend/controllers/audit-checklist-controller.js` `getByApplication` / `update` — returns full sections JSON
- Frontend: auditor checklist UI

**Production state**: empty table. Lowest urgency.

**Migration**: 1 PR, low priority. Deferred until the audit checklist feature has real data.

## Reader migration helper (suggested)

A shared util can DRY up the per-consumer code. Single addition:

```js
// services/attachment-service.js (proposed addition)
async function readPrimary({ prisma, resModel, resId, field, fallback }) {
    const list = await listForResource({ prisma, resModel, resId, field });
    return list.length > 0 ? list[0].fileUrl : fallback;
}
```

Each reader becomes a 2-line change.

## Why reader migration was deferred

The 2026-04-30 audit explicitly estimated G1 as "multi-PR over 2 weeks" and noted that reader migration involves coordinated backend + frontend changes per consumer. Wave A's session shipped:

- The architectural foundation (table + service + extensions).
- All 6 dual-writers (so new uploads land in both places).
- The backfill (so historical uploads land in Attachment too).
- The first PDPA-grade query path (`detachAllByUploader` for delete-by-user).

What's left — reader migration — is small per-consumer but spans frontend code that's outside Wave A's hygiene-and-security focus. It belongs to the per-feature follow-up cycle, not the architectural sweep.

## Acceptance criteria for "G1 fully complete"

When all 6 reader migrations land and the legacy columns are dropped, the schema becomes:

```
Attachment is the single home for every file pointer.
PaymentSlip.fileUrl       — DROPPED
ReportSubmission.attachmentUrl — DROPPED
Lot.labTestReportUrl      — DROPPED
Application.attachments   — DROPPED  (JSON column)
PostAuditTask.documents   — DROPPED  (JSON column)
AuditChecklist.evidence   — STAYS    (still nested in sections JSON for now)
```

The audit doc's four cited G1 benefits (PDPA delete-by-user, virus-scan pipeline, dedup, storage migration) become trivially exercisable through `attachment-service` alone.

## Out of scope for Wave A

- Frontend migration for each consumer (per-feature work).
- A virus-scan pipeline on attach (operational hardening, separate initiative).
- Storage migration to S3 / CDN (operational, separate initiative).
