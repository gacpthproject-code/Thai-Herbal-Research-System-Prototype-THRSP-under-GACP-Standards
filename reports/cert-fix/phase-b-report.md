# Phase B — provision onsite-audit evidence models, unfreeze cert issuance

Status: `DONE(probe: manual jest run, this session — see RED/GREEN below)`
Branch: `feat/onsite-evidence-capture` · Tier C (schema + cert) · commit only, not pushed.

## Problem

`services/onsite-evidence-gate.js` (Phase A/A2, merged) fail-closes every PASS
decision / certificate mint unless it can verify onsite-audit evidence via
`prisma.farmAuditPhoto` / `prisma.farmAuditChecklistItem`. Neither model
existed in the Prisma schema, so `typeof prisma.farmAuditPhoto?.count !==
'function'` was true for **every** application — the gate threw
`EVIDENCE_CAPTURE_UNAVAILABLE` unconditionally. `services/audit-onsite-
service.js` `submitChecklistItem`/`uploadPhoto` were already fully coded
against these models; they just crashed. Net effect: certificate issuance
was frozen for every audit, evidenced or not.

## Model definitions vs. the code that dictated them

**`FarmAuditChecklistItem`** (`prisma/schema/audit-onsite-evidence.prisma`) —
fields taken directly from `audit-onsite-service.js:544-563`
(`tx.farmAuditChecklistItem.upsert`):

| field | from |
|---|---|
| `auditId`, `itemCode`, `section`, `response`, `notes`, `isCritical`, `maxPoints`, `recordedBy`, `recordedAt` | the `create`/`update` payload, verbatim |
| `@@unique([auditId, itemCode])` | `where: { auditId_itemCode: { auditId, itemCode } }` — Prisma's implicit compound-key name for an unnamed `@@unique` is exactly `auditId_itemCode` |
| `photos FarmAuditPhoto[]` | reverse side of `FarmAuditPhoto.checklistItemId`, set by the `updateMany` a few lines below the upsert |
| **no `organizationId`** | the upsert never sets one (checked); adding a column the writer can't populate would sit permanently NULL or require editing the already-correct coded flow, which is out of scope. Reachable via `audit.organizationId`. |

**`FarmAuditPhoto`** — fields from `audit-onsite-service.js:662-674`
(`prisma.farmAuditPhoto.create`) and the `updateMany` inside
`submitChecklistItem`:

| field | from |
|---|---|
| `auditId`, `attachmentId`, `fileHash`, `gpsLatitude`, `gpsLongitude`, `capturedAt`, `caption`, `uploadedBy`, `organizationId` | the `create` payload, verbatim (`organizationId` is validated `if (!organizationId) throw` in `uploadPhoto`, so it is REQUIRED here, unlike the checklist-item model) |
| `checklistItemId String?` + relation | `tx.farmAuditPhoto.updateMany({ where:{ id:{in:photoIds}, auditId }, data:{ checklistItemId: row.id } })` |
| `attachmentId` as a bare `String` (no formal relation) | matches the polymorphic resModel/resId convention `Attachment` already uses elsewhere — every other cross-reference in this schema to an actor/attachment id is a loose column, not a relation |

Both counted by the gate via `count({ where: { auditId } })` — satisfied by
the `@@index([auditId])` / the leading column of the compound unique.

Back-relations added (required by Prisma for both sides of every relation,
not optional):
- `AuditChecklist.checklistItems` / `.photos` (`system.prisma`)
- `Organization.farmAuditPhotos` (`tenancy.prisma`) — `FarmAuditChecklistItem`
  deliberately NOT listed (no `organizationId` column, see table above)
- `tenant-prisma-extension.js` `TENANT_SCOPED_MODELS` gains `'FarmAuditPhoto'`
  — the file documents "one entry per model with an `organizationId`
  relation" as an invariant; `uploadPhoto` already sets `organizationId`
  explicitly so this is a read-scoping safety net, not a functional
  dependency. `FarmAuditChecklistItem` is not added (no column to scope).

## Migration (expand-only, reviewed before deploy)

`prisma/migrations/20260816161908_onsite_evidence_models/migration.sql` —
2 `CREATE TABLE`, 6 `CREATE INDEX` (1 unique, 5 plain), 4 `ADD FOREIGN KEY`.
No `DROP`, no `ALTER` on any existing table's columns.

```sql
CREATE TABLE "farm_audit_checklist_items" ( ... 12 columns ..., PRIMARY KEY ("id") );
CREATE TABLE "farm_audit_photos" ( ... 13 columns ..., PRIMARY KEY ("id") );
CREATE UNIQUE INDEX "farm_audit_checklist_items_auditId_itemCode_key" ON "farm_audit_checklist_items"("auditId", "itemCode");
CREATE INDEX "farm_audit_photos_auditId_idx" ON "farm_audit_photos"("auditId");
CREATE INDEX "farm_audit_photos_organizationId_idx" ON "farm_audit_photos"("organizationId");
CREATE INDEX "farm_audit_photos_attachmentId_idx" ON "farm_audit_photos"("attachmentId");
CREATE INDEX "farm_audit_photos_checklistItemId_idx" ON "farm_audit_photos"("checklistItemId");
CREATE INDEX "farm_audit_photos_uploadedBy_idx" ON "farm_audit_photos"("uploadedBy");
ALTER TABLE "farm_audit_checklist_items" ADD CONSTRAINT ..._auditId_fkey FOREIGN KEY ("auditId") REFERENCES "audit_checklists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "farm_audit_photos" ADD CONSTRAINT ..._auditId_fkey FOREIGN KEY ("auditId") REFERENCES "audit_checklists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "farm_audit_photos" ADD CONSTRAINT ..._checklistItemId_fkey FOREIGN KEY ("checklistItemId") REFERENCES "farm_audit_checklist_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "farm_audit_photos" ADD CONSTRAINT ..._organizationId_fkey FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

Run against the shared dev Supabase via `migrate dev --create-only` (review)
→ `migrate deploy` → `prisma generate`. `migrate dev` did not propose a
reset at any point; full command output captured in-session.

## RED → GREEN (real Postgres, no mocks — `__tests__/integration/onsite-evidence-unfreeze.test.js`)

**RED** (run before the schema/migration existed — full output:
`reports/cert-fix/phase-b-red-output.txt`): **6/6 tests failed**, each for
the documented reason —
`submitChecklistItem` / `uploadPhoto` → `TypeError: Cannot read properties
of undefined (reading 'upsert')` / the pre-existing `ONSITE_NOT_AVAILABLE`
guard; the gate-holds test received `EVIDENCE_CAPTURE_UNAVAILABLE` where
`INSUFFICIENT_PHOTOS` was expected — proving the freeze was blanket, not
evidence-aware.

**GREEN** (after migration + `prisma generate`, same test file, same
assertions, unchanged):

```
PASS __tests__/integration/onsite-evidence-unfreeze.test.js (45.531 s)
  the already-coded capture flow (submitChecklistItem / uploadPhoto)
    √ submitChecklistItem persists a real FarmAuditChecklistItem row
    √ uploadPhoto persists a real FarmAuditPhoto row carrying its SHA-256 hash
  onsite-evidence-gate + certificate issuance (the headline unfreeze)
    √ assertOnsiteEvidenceSufficient resolves once photos+checklist are fully recorded
    √ HEADLINE: generateCertificate mints a real Certificate for an application with sufficient recorded evidence
    √ gate holds: generateCertificate still throws INSUFFICIENT_PHOTOS for an application whose audit has NO evidence rows
    √ gate holds: generateCertificate still throws INCOMPLETE_CHECKLIST when photos are present but the checklist is short
Tests: 6 passed, 6 total
```

**The headline proof**: an application seeded with 24/24 `CHECKLIST_TEMPLATE_2026`
items + 5 photos (written through the real `submitChecklistItem`/`uploadPhoto`,
not direct SQL) → `certificate-service.generateCertificate(..., {
skipInitialAssets: true })` **minted a real Certificate row**
(`GACP-TH-2569-D5D68E`, confirmed by a follow-up `prisma.certificate.findFirst`).
A sibling application with an audit but **zero** evidence rows still throws
`INSUFFICIENT_PHOTOS`; one with photos but only 1/24 checklist items still
throws `INCOMPLETE_CHECKLIST`. Fail-closed holds — the fix is a real
unfreeze, not a blanket bypass.

`skipInitialAssets: true` was used deliberately: it is an existing,
already-supported `generateCertificate` option that skips PlantingCycle/
HarvestBatch/QR bootstrap, which is unrelated to the evidence-gate fix and
depends on shared-DB `PlantSpecies` seed state outside this test's control.
Keeps the proof isolated to the two models this change adds.

Observed, pre-existing, out-of-scope: PKI signing (`signWithLocalKey`)
failed with `bad decrypt` (dev RSA passphrase mismatch in this sandbox) —
already caught by the existing best-effort try/catch in
`certificate-service.js`; the cert still issued with hash-only integrity,
exactly as designed. Unrelated to this change (would reproduce for any
caller of `generateCertificate` in this environment).

## Merged suites + ratchet (unchanged behaviour)

- `__tests__/services/onsite-evidence-gate.test.js` — 11/11 pass (unchanged; mock-based, unaffected by the real schema).
- `__tests__/services/audit-onsite-service.test.js` — 34/34 pass (unchanged).
- `scripts/probes/ratchet.sh` → `PASS: no counter above baseline — hardcode=43 todo=59 env-direct=168 dup-source=2`.
- `scripts/probes/no-secret.sh` → layer1 grep 0 hits; deep scanner (gitleaks/TruffleHog) unavailable locally — probe fails loud per its own design rather than claim an unverified PASS (documented CLAUDE.md L2 behaviour, not a finding).

## Files changed

- `apps/backend/prisma/schema/audit-onsite-evidence.prisma` (new) — the two models.
- `apps/backend/prisma/schema/system.prisma` — `AuditChecklist` back-relations.
- `apps/backend/prisma/schema/tenancy.prisma` — `Organization.farmAuditPhotos` back-relation.
- `apps/backend/services/tenant-prisma-extension.js` — registers `'FarmAuditPhoto'` in `TENANT_SCOPED_MODELS` (comment explains why `FarmAuditChecklistItem` is not).
- `apps/backend/prisma/migrations/20260816161908_onsite_evidence_models/migration.sql` (new).
- `apps/backend/__tests__/integration/onsite-evidence-unfreeze.test.js` (new) — the RED→GREEN proof.
- `reports/cert-fix/phase-b-red-output.txt` (new) — captured RED run output.

**Not touched** (confirmed via `git status` — neither file appears modified):
`services/onsite-evidence-gate.js` (the fail-closed gate logic) and
`services/certificate-service.js` (cert-mint logic). `services/audit-onsite-
service.js` was read only, not edited — the capture flow needed no changes,
only the models it already assumed.

## Out of scope (not fixed here, flagging per instruction)

- The onsite-inspection screen route-param bug (inspect page passes
  `applicationId` where the backend expects `auditId`) — a frontend fix,
  untouched.
- `FarmAuditChecklistItem` carries no `organizationId` (see table above) —
  reachable today via `audit.organizationId`; revisit if a direct
  tenant-scoped query on this table is ever needed.
