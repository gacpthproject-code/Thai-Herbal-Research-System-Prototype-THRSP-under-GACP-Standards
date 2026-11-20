# Certificate revision (ฉบับแก้ไขภายใต้เลขเดิม) — design

Date: 2026-08-27 · Operator ruling: a certificate whose data is wrong through the SYSTEM's fault is
corrected under the **same certificate number** as a numbered revision (ฉบับแก้ไขครั้งที่ n), never
revoked and never renumbered. Ledger origin: F-G4-52 (three demo certificates carry the literal
`Unknown` as province because issuance read a wizard key that was never filled).

## 1. Why a revision, not an edit and not a revocation

- `province`, `district`, `subDistrict` are inside `certificateCanonicalJson` (services/certificate-service.js),
  which is what `documentHash` covers and what the RSA signature is over. Editing the row in place turns a
  valid certificate into `TAMPERED` on the public verifier — that is the integrity design working as intended.
- Revocation (`revokeCertificate`) records that the holder lost certification. A clerical error of the
  system is not that; the holder must keep the number, the QR on the printed document, the planting
  cycles bound to `certificateId`, and a clean history.
- The correct record is therefore: the previous signed content is archived as revision *n*, the live row is
  rewritten with the corrected facts and **re-signed with a trusted key** as revision *n+1*, and both are
  verifiable: the archived one as "valid when issued, superseded on <date>", the live one as VALID.

## 2. Data model (expand migration, Tier C)

New table `certificate_revisions` (Prisma model `CertificateRevision`, file `prisma/schema/certification.prisma`):

| column | type | meaning |
|---|---|---|
| id | uuid pk | |
| certificateId | fk → certificates.id, onDelete Restrict | the certificate this revision belongs to |
| revisionNo | int | the number of the ARCHIVED revision (1 for the original issue) |
| snapshot | jsonb | every field of `certificateCanonicalJson` plus `address`, exactly as they stood when signed |
| documentHash, signature, signatureAlgorithm, signatureKeyId, signaturePublicKey, signedBy, signedAt | as on certificates | the archived proof, copied verbatim |
| supersededAt | timestamptz | when revision n+1 replaced it |
| supersededBy | text | actor id (admin user id) |
| reasonCode | text | `SYSTEM_DATA_CORRECTION` (the only value this design defines) |
| reasonText | text | the admin's words (never shown publicly) |
| correctedFields | text[] | which certificate columns changed, e.g. `{province,district,subDistrict,address}` |
| organizationId | fk → organizations | tenant, copied from the certificate |
| createdAt | timestamptz default now() | |

Unique `(certificateId, revisionNo)`. Index `certificateId`.

`certificates` gains: `revisionNo Int @default(1)`, `revisedAt DateTime?`, `revisedBy String?`,
`revisionReason String?` (the reasonCode of the latest revision). No status change; the row stays `active`.

Migration name: `20260827HHMMSS_certificate_revisions_expand` (expand only: CREATE TABLE + ADD COLUMN with
defaults). Applied migrations stay frozen (`prisma/migrations/APPLIED-IS-FROZEN.md`).
`__tests__/unit/migration-inventory.test.js` must still pass (new model maps to a table the migration creates).

## 3. The operation — `reviseCertificateFromFarm`

`certificateService.reviseCertificateFromFarm(certificateId, { actorId, reason, callerOrganizationId, crossTenant:false, prisma? })`

1. Load the certificate with its farm. Refuse (404, same wording as revoke's org-guard) when missing or
   another tenant's. Refuse `CERTIFICATE_NOT_REVISABLE` (409) when status is not `active` (revoked,
   suspended, expired, renewed) — only a certificate in force is corrected.
2. Compute the corrected location from the **farm row only**: province, district, subDistrict, address,
   through the F-G4-52 rules (`missingLocationFields` / retired stand-ins count as missing → refuse
   `CERTIFICATE_FARM_LOCATION_MISSING`). The admin never types register values.
3. Diff against the certificate. No difference → refuse `CERTIFICATE_REVISION_NO_CHANGE` (409).
4. In ONE transaction:
   a. insert `certificate_revisions` row: revisionNo = certificate.revisionNo, snapshot = canonical fields +
      address as currently stored, proof columns copied verbatim, supersededAt = now, supersededBy = actorId,
      reasonCode = `SYSTEM_DATA_CORRECTION`, reasonText = reason, correctedFields = the diff keys;
   b. build the new content: corrected fields applied, `documentHash = buildCertificateDocumentHash(newContent)`,
      `signedAt = now`, `signedBy = actorId`; call `signCertificateDataOrThrow(newContent, certificateNumber)`
      (trusted-key check included — an untrusted key refuses the whole revision, nothing written);
   c. update the certificate: corrected fields, hash + signature columns, `revisionNo + 1`, `revisedAt = now`,
      `revisedBy = actorId`, `revisionReason = SYSTEM_DATA_CORRECTION`, `pdfGenerated = false`,
      `pdfGeneratedAt = null`, `updatedBy = actorId`. Concurrency: the update is conditional on
      `revisionNo = <the number read in step 1>`; a lost race (Prisma P2025) refuses with
      `CERTIFICATE_REVISION_CONFLICT` (409) and the transaction rolls back.
5. Best-effort lifecycle audit `CERTIFICATE_REVISED` via `_auditCertLifecycle` with
   `{ reason, actorId, revisionNo, correctedFields }`.
6. Return the updated certificate plus `{ previousRevisionNo, correctedFields }`.

`verifyDocumentIntegrity` / `verifyCertificateSignature` are unchanged: they take a row-shaped object, so an
archived revision's `snapshot` + proof columns can be handed to them to verify the old document.

## 4. Doors

### Admin API — `POST /api/admin/certificates/:id/revise-location`
Mounted in `routes/api/admin/certificates.js` next to `/revoke` (ADMIN only through the admin router).
Body `{ reason: string }` (trimmed, 1..500 chars — same rules and codes as revoke:
`REVOCATION_REASON_REQUIRED`-style codes become `REVISION_REASON_REQUIRED` / `REVISION_REASON_TOO_LONG`).
Also `GET /api/admin/certificates/:id/revise-location/preview` → `{ current: {...4 fields}, corrected: {...}, changed: [...] }`
so the UI can show the diff before the press; it runs steps 1–3 without writing.
Responses: 200 `{ id, certificateNumber, revisionNo, revisedAt, correctedFields }`; 404; 409 with the
three codes above; 422 `CERTIFICATE_FARM_LOCATION_MISSING`; 503 `CERT_SIGNING_UNAVAILABLE`.
Admin audit `ADMIN_CERTIFICATE_REVISED` (metadata: certificateNumber, revisionNo, correctedFields).
All new codes go into `shared/error-codes.js` (the catalog drift test enforces it).

### Admin UI — `/admin/certificates/[id]`
Button "ออกฉบับแก้ไขจากข้อมูลฟาร์ม" (visible for `active` only). Dialog: title "ออกฉบับแก้ไขครั้งที่ n",
a two-column table เดิม / ใหม่ for จังหวัด อำเภอ ตำบล ที่อยู่ (from the preview endpoint; unchanged rows
muted), textarea "เหตุผล" (required, 500), confirm "ยืนยันออกฉบับแก้ไข". On success reload the row and
show "ฉบับแก้ไขครั้งที่ n · <date>" beside the number and a "ประวัติการแก้ไข" list (revision, date,
reason label). Errors state cause + next action (คุณ register, no em dash).
`AdminService.previewCertificateRevision(id)` / `reviseCertificateLocation(id, reason)` in admin-service.ts.

### Public verifier
`GET /api/public/verify/:no` adds
`revision: { no, revisedAt, reasonLabel, history: [{ no, signedAt, supersededAt }] }` (reasonLabel is the
Thai label of the reasonCode: `SYSTEM_DATA_CORRECTION` → "แก้ไขข้อมูลบนใบรับรองให้ตรงกับบันทึกต้นทาง (ความผิดพลาดของระบบ)"; the one code
covers every correctable field (location and/or plant name), so the label names the source, never one field;
reasonText is never exposed). `revision` is `null` for a certificate at revision 1.
`GET /api/public/verify/:no/revisions/:n` verifies the archived revision *n*:
`{ certificateNumber, revisionNo, superseded: true, supersededAt, integrity, signatureValid, snapshot: { province, district, subDistrict, farmName } }`
using the archived proof columns and pinned key (404 when no such revision; the rate limiter of the verify
route applies). The existing `valid`/`verified` aliases are untouched (F-G4-44 is a separate contract debt).

Verify page (`src/app/(public)/verify/[cert-number]/verify-view.tsx` + page): when `revision` is present,
one neutral info line under the hero: "ฉบับแก้ไขครั้งที่ 1 · 27 ส.ค. 2569 · แก้ไขข้อมูลบนใบรับรองให้ตรงกับ
บันทึกต้นทาง (ความผิดพลาดของระบบ)" with a link "ดูฉบับก่อนหน้า" that opens `/verify/<no>/revision/1` showing the archived
snapshot's fields and its own verdict "ฉบับนี้ถูกต้อง ณ วันที่ออก และถูกแทนที่แล้วเมื่อ <date>". The hero
stays green; nothing here downgrades trust.

### PDF
`certificate-template-service.js`: when `revisionNo > 1`, print "ฉบับแก้ไขครั้งที่ n · <revisedAt Thai date>"
under the certificate number (new placeholder `REVISION_LINE`, empty string at revision 1). Location prints
from the row as today.

## 5. Tests (RED-first, every layer)

Backend unit (`apps/backend/__tests__/unit/`):
- `certificate-revision-service.test.js` — drives the real service through `options.prisma`
  (pattern: certificate-issuance-carries-farm-coordinates.test.js): (a) archives the exact previous signed
  content and the archived snapshot verifies (hash + signature) as a document; (b) the live row is re-signed,
  `revisionNo` 1→2, `signedAt`/`signedBy` are the correction's, `pdfGenerated` false; (c) refusals:
  non-active → NOT_REVISABLE; no diff → NO_CHANGE; farm location missing → FARM_LOCATION_MISSING; untrusted key
  → CERT_SIGNING_UNAVAILABLE with nothing written; lost race (P2025) → REVISION_CONFLICT; (d) tenant wall: another
  org → 404, crossTenant false always; (e) audit `CERTIFICATE_REVISED` carries revisionNo + correctedFields.
- `admin-certificates-revise-route.test.js` — 401/403/400/404/409/422/200 and the preview endpoint; inventory
  rows added to `admin-routes-rbac.test.js`.
- `public-verify-revision.test.js` — `revision` null at r1, populated at r2, history order, reasonText never in
  the body; `/revisions/:n` verdict for an archived snapshot and 404.
- `certificate-template-revision-line.test.js` — placeholder present only when revisionNo > 1.
- `error-codes-catalog.test.js` (existing) — must stay green.
- `migration-inventory.test.js` (existing) — must stay green.

Frontend (`apps/web-app`): `admin/certificates/[id]/__tests__/revise-dialog.test.tsx` (preview table,
disabled confirm, success panel, 409 message); `(public)/verify/[cert-number]/__tests__/verify-revision-line.test.tsx`
(line present only with `revision`, hero stays green); eslint + tsc on touched files.

## 6. Rollout and evidence

1. Migration applied on the demo database (`npx prisma migrate deploy --schema prisma/schema` from apps/backend,
   after the operator's go — the boot guard names the pending migration otherwise), backend restarted.
2. Real presses (`e2e-g4/c03-revise-certificate-location.spec.ts`, two-state per certificate): admin logs in,
   opens E5960D, sees the diff (เชียงใหม่ / เมืองเชียงใหม่ / สุเทพ / address vs Unknown / - / - / null),
   confirms with a reason; repeats for 4C3761. Screenshots to `evidence/g4-rebuild-2026-08-25/c03`.
3. DB proof: `certificates.revisionNo = 2`, province etc. real, `certificate_revisions` holds revision 1 with the
   old hash/signature; `GET /api/public/verify/:no` → integrity VALID, signatureValid true, province real,
   `revision.no = 2`; `/revisions/1` → superseded, signatureValid true.
4. Ledger: F-G4-52 → CLOSED for the two live certificates; CAE820 stays revoked, untouched.

## 7. Out of scope (ledgered)

- The six legacy `PLATFORM_VAT` line items with the old base wording (invoice display text, not a tax document).
- Planting cycles bound to the revoked CAE820 (F-G4-56 — policy decision).
- Public verifier's handling of status `renewed` (F-G4-57).
- Revising an `expired` certificate — not allowed by this design.
- Any other field than the four location columns; any admin-typed register value.
