# Certificate Revision (ฉบับแก้ไขภายใต้เลขเดิม) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the location facts on a live certificate under its own number by archiving the signed original as revision 1 and re-signing the corrected content as revision 2, through a real admin door, with both revisions verifiable in public.

**Architecture:** One new table (`certificate_revisions`) holds every superseded signed document verbatim; the live `certificates` row stays the single identity (same id/number/QR/cycles) and carries `revisionNo`. A service method (`reviseCertificateFromFarm`) derives the corrected values from the farm row only, archives, rewrites, re-signs with the trusted key in one transaction. An admin route + dialog press it; the public verifier reports the revision and can verify an archived one.

**Tech Stack:** Node/Express + Prisma (Postgres), jest; Next.js/React + jest (jsdom); Playwright (e2e-g4).

**Spec:** `docs/superpowers/specs/2026-08-27-certificate-revision-design.md` (binding authority for conflicts).

## Global Constraints

- Never write a placeholder into a register (`'Unknown'`, `'-'`, `'00000'`); a missing fact is a refusal (`CERTIFICATE_FARM_LOCATION_MISSING`), never a value.
- Only a certificate with `status === 'active'` can be revised; the admin never types register values — corrected values come from the Farm row only.
- All new error codes must be rows in `apps/backend/shared/error-codes.js` (the catalog drift test `__tests__/unit/error-codes-catalog.test.js` enforces it) with `source: 'path:line'`.
- RED-first for every executable change (Tier C): run the failing test, keep its output in the report, then implement.
- Never read `process.env` outside `apps/backend/config/`; never add `.skip`/`.only`/TODO; ratchet counters (`bash scripts/probes/ratchet.sh`) must not rise.
- Thai UI copy: address the user as คุณ, no em dash in Thai strings, space before ๆ, errors state cause + next action.
- Migrations are expand-only; applied migrations are frozen (`apps/backend/prisma/migrations/APPLIED-IS-FROZEN.md`). The coordinator applies the migration to the demo DB; agents never run `prisma migrate deploy`/`db push`/`generate` or write to any database.
- Agents never run git commands that write; the coordinator commits.
- Backend tests: `cd apps/backend && npx jest <file> --runInBand`. Frontend tests: `cd apps/web-app && npx jest <file>`.
- `reasonText` (the admin's free text) is never exposed on the public verifier; only `reasonCode`'s Thai label is.

---

### Task 1: Data model — `CertificateRevision` + revision columns (expand migration)

**Files:**
- Modify: `apps/backend/prisma/schema/certification.prisma` (model `Certificate` ~line 3-165; add model after it)
- Create: `apps/backend/prisma/migrations/20260827130000_certificate_revisions_expand/migration.sql`
- Test: `apps/backend/__tests__/unit/migration-inventory.test.js` (existing — must stay green)
- Test: `apps/backend/__tests__/unit/certificate-revision-schema.test.js` (new)

**Interfaces:**
- Produces: Prisma model `CertificateRevision` (delegate `prisma.certificateRevision`) with fields `id, certificateId, revisionNo, snapshot (Json), documentHash, signature, signatureAlgorithm, signatureKeyId, signaturePublicKey, signedBy, signedAt, supersededAt, supersededBy, reasonCode, reasonText, correctedFields (String[]), organizationId, createdAt`; `Certificate` gains `revisionNo Int @default(1)`, `revisedAt DateTime?`, `revisedBy String?`, `revisionReason String?`, relation `revisions CertificateRevision[]`.

- [ ] **Step 1: Write the failing schema test**

```js
// apps/backend/__tests__/unit/certificate-revision-schema.test.js
'use strict';
const fs = require('fs');
const path = require('path');

const SCHEMA = path.resolve(__dirname, '../../prisma/schema/certification.prisma');
const MIG_DIR = path.resolve(__dirname, '../../prisma/migrations');

describe('certificate revisions — the schema and its expand migration agree', () => {
    const schema = fs.readFileSync(SCHEMA, 'utf8');
    const certModel = schema.slice(schema.indexOf('model Certificate {'), schema.indexOf('model CertificateStandard {'));
    const revisionModel = schema.slice(schema.indexOf('model CertificateRevision {'));

    it('Certificate carries revisionNo (default 1), revisedAt, revisedBy, revisionReason', () => {
        expect(certModel).toMatch(/revisionNo\s+Int\s+@default\(1\)/);
        expect(certModel).toMatch(/revisedAt\s+DateTime\?/);
        expect(certModel).toMatch(/revisedBy\s+String\?/);
        expect(certModel).toMatch(/revisionReason\s+String\?/);
        expect(certModel).toMatch(/revisions\s+CertificateRevision\[\]/);
    });

    it('CertificateRevision archives the whole proof and is unique per (certificate, revisionNo)', () => {
        for (const col of ['certificateId', 'revisionNo', 'snapshot', 'documentHash', 'signature',
            'signatureAlgorithm', 'signatureKeyId', 'signaturePublicKey', 'signedBy', 'signedAt',
            'supersededAt', 'supersededBy', 'reasonCode', 'reasonText', 'correctedFields', 'organizationId']) {
            expect(revisionModel).toMatch(new RegExp(`\\b${col}\\b`));
        }
        expect(revisionModel).toMatch(/@@unique\(\[certificateId, revisionNo\]\)/);
        expect(revisionModel).toMatch(/@@map\("certificate_revisions"\)/);
        expect(revisionModel).toMatch(/onDelete: Restrict/);
    });

    it('the expand migration exists and only adds', () => {
        const dir = fs.readdirSync(MIG_DIR).find((d) => /^\d{14}_certificate_revisions_expand$/.test(d));
        expect(dir).toBeTruthy();
        const sql = fs.readFileSync(path.join(MIG_DIR, dir, 'migration.sql'), 'utf8');
        expect(sql).toMatch(/CREATE TABLE "certificate_revisions"/);
        expect(sql).toMatch(/ALTER TABLE "certificates" ADD COLUMN\s+"revisionNo" INTEGER NOT NULL DEFAULT 1/);
        expect(sql).not.toMatch(/DROP |ALTER COLUMN .* TYPE|SET NOT NULL/);
    });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/backend && npx jest __tests__/unit/certificate-revision-schema.test.js --runInBand`
Expected: FAIL — `revisionNo` not in the model, no migration dir.

- [ ] **Step 3: Add the schema**

In `apps/backend/prisma/schema/certification.prisma`, inside `model Certificate {` after the `previousCertificateId String?` line:

```prisma
  // ฉบับแก้ไข (2026-08-27, spec docs/superpowers/specs/2026-08-27-certificate-revision-design.md):
  // a correction of the SYSTEM's own error is re-signed under the SAME number as
  // revision n+1; the superseded signed document is archived in CertificateRevision.
  // The row's identity (id, number, QR, planting cycles) never changes.
  revisionNo     Int       @default(1)
  revisedAt      DateTime?
  revisedBy      String?
  revisionReason String?   // reasonCode of the latest revision, e.g. SYSTEM_DATA_CORRECTION
  revisions      CertificateRevision[]
```

After the closing `}` of `model Certificate` add:

```prisma
/// One archived, superseded revision of a certificate — the signed document exactly
/// as it stood before a correction. The live row is always the current revision.
model CertificateRevision {
  id            String   @id @default(uuid())
  createdAt     DateTime @default(now())
  certificateId String
  certificate   Certificate @relation(fields: [certificateId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  /// The number of THIS archived revision (1 = the original issue).
  revisionNo    Int
  /// Every certificateCanonicalJson field plus address, verbatim at signing time.
  snapshot      Json
  documentHash       String?
  signature          String?
  signatureAlgorithm String?
  signatureKeyId     String?
  signaturePublicKey String?
  signedBy           String?
  signedAt           DateTime?
  supersededAt   DateTime
  supersededBy   String
  reasonCode     String   // SYSTEM_DATA_CORRECTION
  reasonText     String?  // the admin's words — never public
  correctedFields String[] @default([])
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict, onUpdate: Cascade)

  @@unique([certificateId, revisionNo])
  @@index([certificateId])
  @@index([organizationId])
  @@map("certificate_revisions")
}
```

Add the back-relation on `model Organization` (find it with `grep -n "model Organization" apps/backend/prisma/schema/*.prisma`): `certificateRevisions CertificateRevision[]`.

- [ ] **Step 4: Write the migration**

`apps/backend/prisma/migrations/20260827130000_certificate_revisions_expand/migration.sql`:

```sql
-- Certificate revisions (expand only). Spec: docs/superpowers/specs/2026-08-27-certificate-revision-design.md
ALTER TABLE "certificates" ADD COLUMN "revisionNo" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "certificates" ADD COLUMN "revisedAt" TIMESTAMP(3);
ALTER TABLE "certificates" ADD COLUMN "revisedBy" TEXT;
ALTER TABLE "certificates" ADD COLUMN "revisionReason" TEXT;

CREATE TABLE "certificate_revisions" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "certificateId" TEXT NOT NULL,
    "revisionNo" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "documentHash" TEXT,
    "signature" TEXT,
    "signatureAlgorithm" TEXT,
    "signatureKeyId" TEXT,
    "signaturePublicKey" TEXT,
    "signedBy" TEXT,
    "signedAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3) NOT NULL,
    "supersededBy" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "reasonText" TEXT,
    "correctedFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "organizationId" TEXT NOT NULL,
    CONSTRAINT "certificate_revisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "certificate_revisions_certificateId_revisionNo_key" ON "certificate_revisions"("certificateId", "revisionNo");
CREATE INDEX "certificate_revisions_certificateId_idx" ON "certificate_revisions"("certificateId");
CREATE INDEX "certificate_revisions_organizationId_idx" ON "certificate_revisions"("organizationId");

ALTER TABLE "certificate_revisions" ADD CONSTRAINT "certificate_revisions_certificateId_fkey"
    FOREIGN KEY ("certificateId") REFERENCES "certificates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "certificate_revisions" ADD CONSTRAINT "certificate_revisions_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

Check the organizations table name with `grep -n '@@map' apps/backend/prisma/schema/organization.prisma` (or wherever `model Organization` lives) and use it verbatim.

- [ ] **Step 5: Run the schema test and the inventory test**

Run: `cd apps/backend && npx jest __tests__/unit/certificate-revision-schema.test.js __tests__/unit/migration-inventory.test.js --runInBand`
Expected: PASS. Also run `npx prisma validate --schema prisma/schema` (validation only — no generate, no DB).

- [ ] **Step 6: Report** (the coordinator commits; agents never run git).

---

### Task 2: Error codes for the revision door

**Files:**
- Modify: `apps/backend/shared/error-codes.js` (after the `CERTIFICATE_ALREADY_REVOKED` entry)
- Test: `apps/backend/__tests__/unit/error-codes-catalog.test.js` (existing) + `apps/backend/__tests__/unit/certificate-revision-error-codes.test.js` (new)

**Interfaces:**
- Produces codes: `CERTIFICATE_NOT_REVISABLE` (409), `CERTIFICATE_REVISION_NO_CHANGE` (409), `CERTIFICATE_REVISION_CONFLICT` (409), `REVISION_REASON_REQUIRED` (400), `REVISION_REASON_TOO_LONG` (400).

- [ ] **Step 1: Failing test**

```js
// apps/backend/__tests__/unit/certificate-revision-error-codes.test.js
'use strict';
const { lookupErrorCode } = require('../../shared/error-codes');

describe('certificate revision — every door code is catalogued', () => {
    it.each([
        ['CERTIFICATE_NOT_REVISABLE', 409],
        ['CERTIFICATE_REVISION_NO_CHANGE', 409],
        ['CERTIFICATE_REVISION_CONFLICT', 409],
        ['REVISION_REASON_REQUIRED', 400],
        ['REVISION_REASON_TOO_LONG', 400],
    ])('%s is catalogued at %d with Thai cause + next action', (code, status) => {
        const entry = lookupErrorCode(code);
        expect(entry).toBeTruthy();
        expect(entry.httpStatus).toBe(status);
        expect(entry.messageTh).toMatch(/กรุณา|คุณ/);
        expect(entry.messageTh).not.toMatch(/—/);
    });
});
```

(Confirm the export name: `grep -n "lookupErrorCode" apps/backend/shared/error-codes.js`; the admin audits route already imports it.)

- [ ] **Step 2: Run it to see it fail** — `npx jest __tests__/unit/certificate-revision-error-codes.test.js --runInBand` → FAIL (entries undefined).

- [ ] **Step 3: Add the entries** (shape identical to `CERTIFICATE_ALREADY_REVOKED`; `source` points at the line in `services/certificate-service.js` / `routes/api/admin/certificates.js` where each is thrown — fill the real line numbers after Task 3/4 land, then re-run the catalog test):

```js
  CERTIFICATE_NOT_REVISABLE: {
    code: 'CERTIFICATE_NOT_REVISABLE',
    httpStatus: 409,
    messageEn: 'Only a certificate in force (status active) can be revised; nothing was changed',
    messageTh: 'ออกฉบับแก้ไขได้เฉพาะใบรับรองที่ยังมีผลบังคับใช้เท่านั้น ใบนี้ถูกเพิกถอน ระงับ หรือหมดอายุแล้ว กรุณาตรวจสอบสถานะใบรับรองก่อน',
    source: 'services/certificate-service.js:0',
    remediation: 'A revision corrects the register for a live certificate; a revoked/suspended/expired one keeps its history as is.',
  },
  CERTIFICATE_REVISION_NO_CHANGE: {
    code: 'CERTIFICATE_REVISION_NO_CHANGE',
    httpStatus: 409,
    messageEn: 'The farm record and the certificate already agree; there is nothing to revise',
    messageTh: 'ข้อมูลที่ตั้งบนใบรับรองตรงกับบันทึกฟาร์มอยู่แล้ว ไม่มีอะไรต้องแก้ไข หากบันทึกฟาร์มผิด กรุณาแก้ไขบันทึกฟาร์มก่อนแล้วลองใหม่',
    source: 'services/certificate-service.js:0',
    remediation: 'The corrected values come from the Farm row only; fix the farm first.',
  },
  CERTIFICATE_REVISION_CONFLICT: {
    code: 'CERTIFICATE_REVISION_CONFLICT',
    httpStatus: 409,
    messageEn: 'Another revision of this certificate was recorded first; reload and review the current revision',
    messageTh: 'มีการออกฉบับแก้ไขของใบรับรองนี้ไปก่อนหน้าแล้ว กรุณาโหลดหน้านี้ใหม่เพื่อดูฉบับล่าสุดก่อนดำเนินการอีกครั้ง',
    source: 'services/certificate-service.js:0',
    remediation: 'The conditional update on revisionNo lost a race; nothing was written by the loser.',
  },
  REVISION_REASON_REQUIRED: {
    code: 'REVISION_REASON_REQUIRED',
    httpStatus: 400,
    messageEn: 'A reason is required to issue a revision',
    messageTh: 'ระบบยังไม่ได้รับเหตุผลการออกฉบับแก้ไข กรุณาระบุเหตุผลก่อนที่คุณจะกดยืนยันอีกครั้ง',
    source: 'routes/api/admin/certificates.js:0',
    remediation: 'The reason is recorded on the archived revision (never shown publicly).',
  },
  REVISION_REASON_TOO_LONG: {
    code: 'REVISION_REASON_TOO_LONG',
    httpStatus: 400,
    messageEn: 'The revision reason exceeds 500 characters',
    messageTh: 'เหตุผลการออกฉบับแก้ไขยาวเกิน 500 ตัวอักษร กรุณาย่อเหตุผลให้สั้นลงแล้วกดยืนยันอีกครั้ง',
    source: 'routes/api/admin/certificates.js:0',
    remediation: 'Same bound as the revocation reason.',
  },
```

- [ ] **Step 4: Run both tests** → PASS (the catalog test's `source` line check only requires `path:digits`; update the digits to the real lines once Tasks 3–4 exist).

---

### Task 3: Service — `reviseCertificateFromFarm`

**Files:**
- Modify: `apps/backend/services/certificate-service.js` (add method in `class CertificateService` after `revokeCertificate`, ~line 1650; reuse `missingLocationFields`, `CERTIFICATE_LOCATION_FIELDS`, `isLocationFactMissing`, `normalizeText`, `buildCertificateDocumentHash`, `certificateCanonicalJson`, `signCertificateDataOrThrow`, `_auditCertLifecycle`)
- Test: `apps/backend/__tests__/unit/certificate-revision-service.test.js` (new)

**Interfaces:**
- Produces: `certificateService.reviseCertificateFromFarm(certificateId, { actorId, reason, callerOrganizationId, crossTenant = false, prisma? })` → `Promise<{ certificate, previousRevisionNo: number, correctedFields: string[] }>`; throws errors with `.code` ∈ {`CERTIFICATE_NOT_REVISABLE`, `CERTIFICATE_REVISION_NO_CHANGE`, `CERTIFICATE_REVISION_CONFLICT`, `CERTIFICATE_FARM_LOCATION_MISSING`, `CERT_SIGNING_UNAVAILABLE`} and `.statusCode`; 404 `Certificate not found` for missing/cross-tenant.
- Produces: `certificateService.previewCertificateRevision(certificateId, { callerOrganizationId, crossTenant })` → `{ current: {province,district,subDistrict,address}, corrected: {...}, changed: string[] }` (steps 1–3 only, no writes; same refusals except NO_CHANGE, which returns `changed: []`).
- Produces: module-level `REVISION_REASON_CODES = Object.freeze({ SYSTEM_DATA_CORRECTION: 'SYSTEM_DATA_CORRECTION' })` and `REVISION_REASON_LABELS_TH = Object.freeze({ SYSTEM_DATA_CORRECTION: 'แก้ไขข้อมูลที่ตั้งฟาร์ม (ความผิดพลาดของระบบ)' })` exported on the instance as `certificateService.REVISION_REASON_LABELS_TH`.
- Produces: `certificateService.CERTIFICATE_REVISION_FIELDS = ['province','district','subDistrict','address']`.

- [ ] **Step 1: Failing tests** (pattern: `__tests__/unit/certificate-issuance-carries-farm-coordinates.test.js` — mock `services/crypto/signature-service` with a trusted key, build a fake prisma client and pass it via `options.prisma`)

```js
// apps/backend/__tests__/unit/certificate-revision-service.test.js
'use strict';
const TRUSTED = 'sha256:trusted';
const signMock = jest.fn(async () => 'sig-v2');
jest.mock('../../services/crypto/signature-service', () => ({
    getSignatureService: () => ({
        signWithLocalKey: (...a) => signMock(...a),
        getPublicKeyForNamespace: async () => 'pem-v2',
        verifyWithLocalKey: async () => true,
        getTrustedPublicKeyFingerprints: async () => new Set([TRUSTED]),
    }),
    fingerprintPublicKey: () => TRUSTED,
}));
jest.mock('../../shared/logger', () => { const l = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }; return { ...l, createLogger: () => l }; });

const certService = require('../../services/certificate-service');

const ORG = 'org-1';
const farm = { id: 'farm-1', organizationId: ORG, province: 'เชียงใหม่', district: 'เมืองเชียงใหม่', subDistrict: 'สุเทพ', address: '88/12 หมู่ 5', postalCode: '50200' };
function liveCert(over = {}) {
    return {
        id: 'cert-1', certificateNumber: 'GACP-TH-2569-TEST01', verificationCode: 'vc', applicationId: 'app-1', userId: 'u1',
        farmId: 'farm-1', farmName: 'ไร่ทดสอบ', applicantName: 'สมชาย', cropType: 'Herb', farmSize: 200,
        province: 'Unknown', district: '-', subDistrict: '-', address: null,
        standardName: 'GACP', standardId: 'std', validityYears: 3, issuedDate: new Date('2026-08-26T00:00:00Z'),
        expiryDate: new Date('2029-08-26T00:00:00Z'), issuedBy: 'auditor-1', status: 'active', organizationId: ORG,
        revisionNo: 1, documentHash: 'hmac-sha256:old', signature: 'sig-v1', signatureAlgorithm: 'RSA-SHA256',
        signatureKeyId: 'rsa:gacp-certificate', signaturePublicKey: 'pem-v1', signedBy: 'auditor-1', signedAt: new Date('2026-08-26T00:00:00Z'),
        farm, ...over,
    };
}
function fakePrisma(cert) {
    const tx = {
        certificateRevision: { create: jest.fn(async ({ data }) => ({ id: 'rev-1', ...data })) },
        certificate: { updateMany: jest.fn(async () => ({ count: 1 })), findUnique: jest.fn(async () => ({ ...cert, revisionNo: 2 })) },
    };
    return {
        tx,
        certificate: { findFirst: jest.fn(async () => cert) },
        $transaction: jest.fn(async (cb) => cb(tx)),
    };
}
const opts = (p) => ({ actorId: 'admin-1', reason: 'ที่ตั้งฟาร์มถูกบันทึกเป็น Unknown จากความผิดพลาดของระบบ', callerOrganizationId: ORG, prisma: p });

beforeEach(() => signMock.mockClear());

describe('reviseCertificateFromFarm', () => {
    it('archives the previous signed document verbatim as revision 1', async () => {
        const p = fakePrisma(liveCert());
        await certService.reviseCertificateFromFarm('cert-1', opts(p));
        const { data } = p.tx.certificateRevision.create.mock.calls[0][0];
        expect(data.revisionNo).toBe(1);
        expect(data.documentHash).toBe('hmac-sha256:old');
        expect(data.signature).toBe('sig-v1');
        expect(data.signaturePublicKey).toBe('pem-v1');
        expect(data.snapshot.province).toBe('Unknown');
        expect(data.reasonCode).toBe('SYSTEM_DATA_CORRECTION');
        expect(data.correctedFields.sort()).toEqual(['address', 'district', 'province', 'subDistrict']);
        expect(data.supersededBy).toBe('admin-1');
    });

    it('rewrites the live row from the farm, re-signs, bumps revisionNo conditionally', async () => {
        const p = fakePrisma(liveCert());
        const out = await certService.reviseCertificateFromFarm('cert-1', opts(p));
        const call = p.tx.certificate.updateMany.mock.calls[0][0];
        expect(call.where).toEqual({ id: 'cert-1', revisionNo: 1 });
        expect(call.data).toEqual(expect.objectContaining({
            province: 'เชียงใหม่', district: 'เมืองเชียงใหม่', subDistrict: 'สุเทพ', address: '88/12 หมู่ 5',
            revisionNo: 2, revisedBy: 'admin-1', revisionReason: 'SYSTEM_DATA_CORRECTION',
            signature: 'sig-v2', signaturePublicKey: 'pem-v2', signedBy: 'admin-1', pdfGenerated: false, pdfGeneratedAt: null,
        }));
        expect(call.data.documentHash).not.toBe('hmac-sha256:old');
        expect(call.data.revisedAt).toBeInstanceOf(Date);
        expect(call.data.signedAt).toEqual(call.data.revisedAt);
        expect(out.previousRevisionNo).toBe(1);
        expect(out.correctedFields).toContain('province');
    });

    it('the new hash is the canonical hash of the corrected content', async () => {
        const p = fakePrisma(liveCert());
        await certService.reviseCertificateFromFarm('cert-1', opts(p));
        const { data } = p.tx.certificate.updateMany.mock.calls[0][0];
        const expected = certService.constructor.buildCertificateDocumentHash
            ? certService.constructor.buildCertificateDocumentHash({ ...liveCert(), ...data })
            : require('../../services/certificate-service').buildCertificateDocumentHash({ ...liveCert(), ...data });
        expect(data.documentHash).toBe(expected);
    });

    it.each(['revoked', 'suspended', 'expired', 'renewed'])('refuses a %s certificate with CERTIFICATE_NOT_REVISABLE and writes nothing', async (status) => {
        const p = fakePrisma(liveCert({ status }));
        await expect(certService.reviseCertificateFromFarm('cert-1', opts(p))).rejects.toMatchObject({ code: 'CERTIFICATE_NOT_REVISABLE', statusCode: 409 });
        expect(p.$transaction).not.toHaveBeenCalled();
    });

    it('refuses when the farm and the certificate already agree', async () => {
        const p = fakePrisma(liveCert({ province: 'เชียงใหม่', district: 'เมืองเชียงใหม่', subDistrict: 'สุเทพ', address: '88/12 หมู่ 5' }));
        await expect(certService.reviseCertificateFromFarm('cert-1', opts(p))).rejects.toMatchObject({ code: 'CERTIFICATE_REVISION_NO_CHANGE' });
        expect(p.$transaction).not.toHaveBeenCalled();
    });

    it('refuses when the farm row itself lacks a location fact', async () => {
        const p = fakePrisma(liveCert({ farm: { ...farm, district: '' } }));
        await expect(certService.reviseCertificateFromFarm('cert-1', opts(p))).rejects.toMatchObject({ code: 'CERTIFICATE_FARM_LOCATION_MISSING' });
        expect(p.$transaction).not.toHaveBeenCalled();
    });

    it('a lost race on revisionNo refuses with CERTIFICATE_REVISION_CONFLICT', async () => {
        const p = fakePrisma(liveCert());
        p.tx.certificate.updateMany.mockResolvedValueOnce({ count: 0 });
        await expect(certService.reviseCertificateFromFarm('cert-1', opts(p))).rejects.toMatchObject({ code: 'CERTIFICATE_REVISION_CONFLICT', statusCode: 409 });
    });

    it('another tenant gets the same 404 as a missing certificate', async () => {
        const p = fakePrisma(liveCert({ organizationId: 'org-2' }));
        await expect(certService.reviseCertificateFromFarm('cert-1', opts(p))).rejects.toMatchObject({ statusCode: 404 });
        expect(p.$transaction).not.toHaveBeenCalled();
    });

    it('an untrusted signing key refuses the whole revision (nothing archived)', async () => {
        const p = fakePrisma(liveCert());
        const svc = require('../../services/crypto/signature-service').getSignatureService();
        const spy = jest.spyOn(svc, 'getTrustedPublicKeyFingerprints').mockResolvedValueOnce(new Set(['sha256:other']));
        await expect(certService.reviseCertificateFromFarm('cert-1', opts(p))).rejects.toMatchObject({ code: 'CERT_SIGNING_UNAVAILABLE' });
        spy.mockRestore();
    });
});

describe('previewCertificateRevision', () => {
    it('returns current vs corrected and the changed keys without writing', async () => {
        const p = fakePrisma(liveCert());
        const out = await certService.previewCertificateRevision('cert-1', { callerOrganizationId: ORG, prisma: p });
        expect(out.current.province).toBe('Unknown');
        expect(out.corrected.province).toBe('เชียงใหม่');
        expect(out.changed.sort()).toEqual(['address', 'district', 'province', 'subDistrict']);
        expect(p.$transaction).not.toHaveBeenCalled();
    });
});
```

Adjust the "hash" test to however `buildCertificateDocumentHash` is reachable (it is a module-level function; export it on the instance as `certificateService.buildCertificateDocumentHash` if it is not already — `grep -n "buildCertificateDocumentHash" apps/backend/prisma/seed-gacp.js` shows the seed already calls `certificateService.buildCertificateDocumentHash`, so it is exported).

- [ ] **Step 2: Run to see it fail** — `npx jest __tests__/unit/certificate-revision-service.test.js --runInBand` → FAIL: `reviseCertificateFromFarm is not a function`.

- [ ] **Step 3: Implement** — in `class CertificateService`, after `revokeCertificate`:

```js
    /**
     * ฉบับแก้ไข — spec docs/superpowers/specs/2026-08-27-certificate-revision-design.md.
     * The corrected values come from the FARM ROW ONLY; the admin never types register values.
     * Steps 1-3 read; step 4 archives + rewrites + re-signs in ONE transaction.
     */
    _resolveRevisionTarget(cert, { callerOrganizationId, crossTenant }) {
        const notFound = () => Object.assign(new Error('Certificate not found'), { statusCode: 404 });
        if (!cert) { throw notFound(); }
        if (!crossTenant && (!callerOrganizationId || cert.organizationId !== callerOrganizationId)) { throw notFound(); }
        if (String(cert.status || '').toLowerCase() !== 'active') {
            throw Object.assign(new Error('Only a certificate in force can be revised'), { statusCode: 409, code: 'CERTIFICATE_NOT_REVISABLE' });
        }
        const farm = cert.farm;
        const missing = missingLocationFields(farm, CERTIFICATE_LOCATION_FIELDS);
        if (missing.length > 0) { throw refuseFarmLocation(missing, { applicationId: cert.applicationId, farmId: cert.farmId }); }
        const corrected = {
            province: normalizeText(farm.province),
            district: normalizeText(farm.district),
            subDistrict: normalizeText(farm.subDistrict),
            address: isLocationFactMissing(farm.address) ? null : normalizeText(farm.address),
        };
        const current = {
            province: cert.province, district: cert.district, subDistrict: cert.subDistrict, address: cert.address ?? null,
        };
        const changed = CERTIFICATE_REVISION_FIELDS.filter((f) => (current[f] ?? null) !== (corrected[f] ?? null));
        return { current, corrected, changed };
    }

    async _loadForRevision(certificateId, client) {
        return client.certificate.findFirst({ where: { id: certificateId, isDeleted: false }, include: { farm: true } });
    }

    async previewCertificateRevision(certificateId, { callerOrganizationId = null, crossTenant = false, prisma: injected } = {}) {
        const client = injected || prisma;
        const cert = await this._loadForRevision(certificateId, client);
        return this._resolveRevisionTarget(cert, { callerOrganizationId, crossTenant });
    }

    async reviseCertificateFromFarm(certificateId, opts = {}) {
        const { actorId, reason, callerOrganizationId = null, crossTenant = false } = opts;
        const client = opts.prisma || prisma;
        const cert = await this._loadForRevision(certificateId, client);
        const { current, corrected, changed } = this._resolveRevisionTarget(cert, { callerOrganizationId, crossTenant });
        if (changed.length === 0) {
            throw Object.assign(new Error('The farm record and the certificate already agree'), { statusCode: 409, code: 'CERTIFICATE_REVISION_NO_CHANGE' });
        }
        const now = new Date();
        const previousRevisionNo = cert.revisionNo || 1;
        // The corrected document, hashed and signed BEFORE the transaction opens so a
        // signing refusal (untrusted key) writes nothing at all.
        const nextContent = { ...cert, ...corrected, signedAt: now, signedBy: actorId };
        nextContent.documentHash = buildCertificateDocumentHash(nextContent);
        await this.signCertificateDataOrThrow(nextContent, cert.certificateNumber);

        const snapshot = { ...JSON.parse(certificateCanonicalJson(cert)), address: current.address };
        await client.$transaction(async (tx) => {
            await tx.certificateRevision.create({
                data: {
                    certificateId: cert.id,
                    revisionNo: previousRevisionNo,
                    snapshot,
                    documentHash: cert.documentHash, signature: cert.signature, signatureAlgorithm: cert.signatureAlgorithm,
                    signatureKeyId: cert.signatureKeyId, signaturePublicKey: cert.signaturePublicKey,
                    signedBy: cert.signedBy, signedAt: cert.signedAt,
                    supersededAt: now, supersededBy: actorId,
                    reasonCode: REVISION_REASON_CODES.SYSTEM_DATA_CORRECTION, reasonText: reason || null,
                    correctedFields: changed, organizationId: cert.organizationId,
                },
            });
            const res = await tx.certificate.updateMany({
                where: { id: cert.id, revisionNo: previousRevisionNo },
                data: {
                    ...corrected,
                    documentHash: nextContent.documentHash,
                    signature: nextContent.signature, signatureAlgorithm: nextContent.signatureAlgorithm,
                    signatureKeyId: nextContent.signatureKeyId, signaturePublicKey: nextContent.signaturePublicKey,
                    signedBy: actorId, signedAt: now,
                    revisionNo: previousRevisionNo + 1, revisedAt: now, revisedBy: actorId,
                    revisionReason: REVISION_REASON_CODES.SYSTEM_DATA_CORRECTION,
                    pdfGenerated: false, pdfGeneratedAt: null, updatedBy: actorId,
                },
            });
            if (res.count !== 1) {
                throw Object.assign(new Error('Another revision was recorded first'), { statusCode: 409, code: 'CERTIFICATE_REVISION_CONFLICT' });
            }
        });
        const updated = await client.certificate.findUnique
            ? await client.certificate.findUnique({ where: { id: cert.id } }).catch(() => null)
            : null;
        const result = updated || { ...cert, ...corrected, revisionNo: previousRevisionNo + 1 };
        await this._auditCertLifecycle('CERTIFICATE_REVISED', result, { reason: `${REVISION_REASON_CODES.SYSTEM_DATA_CORRECTION}: ${changed.join(',')} (rev ${previousRevisionNo}→${previousRevisionNo + 1})`, actorId });
        return { certificate: result, previousRevisionNo, correctedFields: changed };
    }
```

Module-level (near `CERTIFICATE_LOCATION_FIELDS`):

```js
const CERTIFICATE_REVISION_FIELDS = Object.freeze(['province', 'district', 'subDistrict', 'address']);
const REVISION_REASON_CODES = Object.freeze({ SYSTEM_DATA_CORRECTION: 'SYSTEM_DATA_CORRECTION' });
const REVISION_REASON_LABELS_TH = Object.freeze({ SYSTEM_DATA_CORRECTION: 'แก้ไขข้อมูลที่ตั้งฟาร์ม (ความผิดพลาดของระบบ)' });
```

and on the instance before `module.exports`: `_certificateServiceInstance.REVISION_REASON_LABELS_TH = REVISION_REASON_LABELS_TH; _certificateServiceInstance.CERTIFICATE_REVISION_FIELDS = CERTIFICATE_REVISION_FIELDS;` (check how the instance already exposes helpers, e.g. `buildCertificateDocumentHash`, and follow that idiom). If the fake client in tests has `findUnique` under `tx` only, read the final row via `client.certificate.findFirst` — pick ONE lookup and make the test's fake provide it.

- [ ] **Step 4: Run the tests** → PASS. Also run `__tests__/unit/certificate-service.test.js`, `certificate-issuance-carries-farm-location.test.js`, `cert-revoke-org-guard.test.js` (unchanged behaviour). Fill the `source:` lines in Task 2's catalog entries with the real thrown lines and re-run `error-codes-catalog.test.js`.

---

### Task 4: Admin door — preview + revise routes

**Files:**
- Modify: `apps/backend/routes/api/admin/certificates.js` (add two routes after `/:id/revoke`)
- Modify: `apps/backend/__tests__/unit/admin-routes-rbac.test.js` (inventory rows for both routes)
- Test: `apps/backend/__tests__/unit/admin-certificates-revise-route.test.js` (new; copy the scaffold of `admin-certificates-revoke-route.test.js`)

**Interfaces:**
- Consumes: `certificateService.previewCertificateRevision`, `certificateService.reviseCertificateFromFarm` (Task 3); codes from Task 2.
- Produces: `GET /api/admin/certificates/:id/revise-location/preview` → `{ success, data: { current, corrected, changed } }`; `POST /api/admin/certificates/:id/revise-location` `{ reason }` → 200 `{ success, data: { id, certificateNumber, revisionNo, revisedAt, correctedFields } }`; errors `{ success:false, error:<code>, message:<Thai from catalog> }`.

- [ ] **Step 1: Failing route test** — mount the real admin router the way `admin-certificates-revoke-route.test.js` does (mock auth-middleware + certificate-service with `previewCertificateRevision` / `reviseCertificateFromFarm`); cases: anonymous 401; auditor 403; empty reason 400 `REVISION_REASON_REQUIRED` (service untouched); 501-char reason 400 `REVISION_REASON_TOO_LONG`; service throws `{statusCode:409, code:'CERTIFICATE_NOT_REVISABLE'}` → 409 with the catalog Thai message; `CERTIFICATE_REVISION_NO_CHANGE` → 409; `CERTIFICATE_REVISION_CONFLICT` → 409; `CERTIFICATE_FARM_LOCATION_MISSING` (statusCode 422, `missingFields`) → 422 with `missingFields`; 404; happy path → 200 data shape and `auditLogger.log` called with action `ADMIN_CERTIFICATE_REVISED`; preview → 200 `{ current, corrected, changed }` and no `reviseCertificateFromFarm` call.

- [ ] **Step 2: Run it to see it fail** → 404 for the unmounted paths.

- [ ] **Step 3: Implement** in `routes/api/admin/certificates.js`:

```js
const REVISION_REASON_MAX_LENGTH = 500;
const { lookupErrorCode } = require('../../../shared/error-codes');

function catalogued(res, code, fallbackStatus, extra = {}) {
    const entry = lookupErrorCode(code);
    return res.status(entry?.httpStatus || fallbackStatus).json({
        success: false, error: code, message: entry?.messageTh || MESSAGES.SERVER_ERROR, ...extra,
    });
}

router.get('/:id/revise-location/preview', async (req, res) => {
    try {
        const data = await certificateService.previewCertificateRevision(String(req.params.id || '').trim(), {
            callerOrganizationId: req.user?.organizationId || null, crossTenant: false,
        });
        return res.json({ success: true, data });
    } catch (error) {
        return revisionError(res, error);
    }
});

router.post('/:id/revise-location', async (req, res) => {
    const certificateId = String(req.params.id || '').trim();
    const rawReason = req.body?.reason;
    const reason = typeof rawReason === 'string' ? rawReason.trim() : '';
    if (!reason) { return catalogued(res, 'REVISION_REASON_REQUIRED', 400); }
    if (reason.length > REVISION_REASON_MAX_LENGTH) { return catalogued(res, 'REVISION_REASON_TOO_LONG', 400); }
    const actorId = String(req.user?.id || 'SYSTEM');
    try {
        const { certificate, correctedFields } = await certificateService.reviseCertificateFromFarm(certificateId, {
            reason, actorId, callerOrganizationId: req.user?.organizationId || null, crossTenant: false,
        });
        try {
            await auditLogger.log({
                category: AuditCategory.ADMIN, action: 'ADMIN_CERTIFICATE_REVISED', severity: AuditSeverity.WARNING,
                actorId, actorRole: req.user?.role || 'UNKNOWN', actorType: 'ADMIN',
                resourceType: ResourceType.CERTIFICATE, resourceId: certificate.id,
                organizationId: certificate.organizationId || req.user?.organizationId || null,
                ipAddress: getRequestIp(req), userAgent: req.get('user-agent'),
                metadata: { certificateNumber: certificate.certificateNumber, revisionNo: certificate.revisionNo, correctedFields },
            });
        } catch (auditError) {
            logger.warn('[admin/certificates] ADMIN_CERTIFICATE_REVISED audit write failed:', auditError?.message);
        }
        return res.status(200).json({ success: true, data: {
            id: certificate.id, certificateNumber: certificate.certificateNumber, revisionNo: certificate.revisionNo,
            revisedAt: toIso(certificate.revisedAt), correctedFields,
        } });
    } catch (error) {
        return revisionError(res, error);
    }
});

function revisionError(res, error) {
    const statusCode = Number(error?.statusCode);
    if (statusCode === 404) { return res.status(404).json({ success: false, error: 'CERTIFICATE_NOT_FOUND', message: MESSAGES.NOT_FOUND }); }
    if (error?.code && lookupErrorCode(error.code)) {
        const extra = Array.isArray(error.missingFields) && error.missingFields.length ? { missingFields: error.missingFields } : {};
        return catalogued(res, error.code, statusCode || 500, extra);
    }
    logger.error('[admin/certificates] revise failed:', error?.message);
    return res.status(500).json({ success: false, error: 'CERTIFICATE_REVISE_FAILED', message: safeErrorMessage(error, MESSAGES.SERVER_ERROR) });
}
```

Add `CERTIFICATE_REVISE_FAILED` (500) to the catalog in Task 2's block. Add both routes to the inventory in `admin-routes-rbac.test.js` (the file enumerates every admin route; follow its row format and bump its counts).

- [ ] **Step 4: Run** the new test, `admin-routes-rbac.test.js`, `admin-gates-use-canonical-rbac.test.js`, `error-codes-catalog.test.js` → PASS.

---

### Task 5: Public verifier — revision info and archived-revision verification

**Files:**
- Modify: `apps/backend/routes/api/auth/public.js` (`GET /verify/:certificateNumber` ~line 69-200; add `GET /verify/:certificateNumber/revisions/:n`)
- Modify: `apps/backend/services/certificate-service.js` (add `listRevisionSummaries(certificateId)`, `verifyArchivedRevision(certificateId, revisionNo)`)
- Test: `apps/backend/__tests__/unit/public-verify-revision.test.js` (new; find how `certificate-integrity-cluster.test.js` or `h17-verify-adversarial.test.js` mounts the public router and mocks the service — copy that scaffold)

**Interfaces:**
- Produces on `GET /api/public/verify/:no` → `data.revision`: `null` when `revisionNo <= 1`, else `{ no, revisedAt, reasonLabel, history: [{ no, signedAt, supersededAt }] }` (history ascending by `no`).
- Produces `GET /api/public/verify/:no/revisions/:n` → 200 `{ success, data: { certificateNumber, revisionNo, superseded: true, supersededAt, integrity, signatureValid, snapshot: { province, district, subDistrict, farmName } } }`; 404 `{ success:false, error:'REVISION_NOT_FOUND' }` (catalogue it, 404).
- Service: `certificateService.listRevisionSummaries(certificateId)` → `Array<{ no, signedAt, supersededAt }>`; `certificateService.verifyArchivedRevision(certificateId, revisionNo)` → `{ found:false } | { found:true, revision, integrity: {status}, signature: {signed, valid} }` — it recomputes `buildCertificateDocumentHash(snapshot)` against the archived `documentHash` and runs `verifyCertificateSignature({ ...snapshot, documentHash, signature, signaturePublicKey, signatureAlgorithm })`.

- [ ] **Step 1: Failing tests** — (a) revision null at revisionNo 1; (b) at revisionNo 2 the body has `revision.no === 2`, `reasonLabel === 'แก้ไขข้อมูลที่ตั้งฟาร์ม (ความผิดพลาดของระบบ)'`, history `[{no:1,...}]`, and the raw body string never contains the reasonText fixture `'ผู้ดูแลพิมพ์ไว้'`; (c) `/revisions/1` for an archived snapshot whose stored hash equals the recomputed one and whose signature verifies → `superseded:true`, `integrity:'VALID'`, `signatureValid:true`; (d) `/revisions/9` → 404 `REVISION_NOT_FOUND`; (e) rate limiter applied (assert the router uses `publicVerifyLimiter` on the new route by reading the route stack or by the same middleware mock the existing tests use).

- [ ] **Step 2: Run to see them fail.**

- [ ] **Step 3: Implement.** In `public.js` verify handler, after `signature` is computed:

```js
        const revision = (certificate.revisionNo || 1) > 1
            ? {
                no: certificate.revisionNo,
                revisedAt: certificate.revisedAt ? new Date(certificate.revisedAt).toISOString() : null,
                reasonLabel: certificateService.REVISION_REASON_LABELS_TH[certificate.revisionReason] || null,
                history: await certificateService.listRevisionSummaries(certificate.id),
            }
            : null;
```

and add `revision` to the response `data` (both the active and the not-active branches, since a revised certificate can later expire). New route:

```js
router.get('/verify/:certificateNumber/revisions/:n', publicVerifyLimiter, async (req, res) => {
    try {
        const certificate = await certificateService.findByCertificateNumber(req.params.certificateNumber);
        const n = Number.parseInt(req.params.n, 10);
        if (!certificate || !Number.isInteger(n) || n < 1) {
            return res.status(404).json({ success: false, error: 'REVISION_NOT_FOUND' });
        }
        const out = await certificateService.verifyArchivedRevision(certificate.id, n);
        if (!out.found) { return res.status(404).json({ success: false, error: 'REVISION_NOT_FOUND' }); }
        const { revision, integrity, signature } = out;
        return res.json({ success: true, data: {
            certificateNumber: certificate.certificateNumber, revisionNo: n, superseded: true,
            supersededAt: revision.supersededAt ? new Date(revision.supersededAt).toISOString() : null,
            integrity: integrity.status,
            signatureValid: signature.signed ? signature.valid === true : null,
            snapshot: {
                province: revision.snapshot?.province ?? null, district: revision.snapshot?.district ?? null,
                subDistrict: revision.snapshot?.subDistrict ?? null, farmName: revision.snapshot?.farmName ?? null,
            },
        } });
    } catch (error) {
        logger.error('[Public] Revision verification error:', error);
        return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการตรวจสอบฉบับก่อนหน้า' });
    }
});
```

Service additions:

```js
    async listRevisionSummaries(certificateId) {
        const rows = await prisma.certificateRevision.findMany({
            where: { certificateId }, orderBy: { revisionNo: 'asc' },
            select: { revisionNo: true, signedAt: true, supersededAt: true },
        });
        return rows.map((r) => ({ no: r.revisionNo, signedAt: r.signedAt ? new Date(r.signedAt).toISOString() : null, supersededAt: r.supersededAt ? new Date(r.supersededAt).toISOString() : null }));
    }

    async verifyArchivedRevision(certificateId, revisionNo) {
        const revision = await prisma.certificateRevision.findUnique({ where: { certificateId_revisionNo: { certificateId, revisionNo } } });
        if (!revision) { return { found: false }; }
        const doc = { ...(revision.snapshot || {}), documentHash: revision.documentHash, signature: revision.signature,
            signatureAlgorithm: revision.signatureAlgorithm, signaturePublicKey: revision.signaturePublicKey, signatureKeyId: revision.signatureKeyId };
        const integrity = this.verifyDocumentIntegrity(doc);
        const signature = await this.verifyCertificateSignature(doc);
        return { found: true, revision, integrity, signature };
    }
```

(`verifyDocumentIntegrity` recomputes from the row-shaped object's canonical fields; the snapshot carries exactly those fields, so the archived hash matches iff the archive is intact.)

- [ ] **Step 4: Run** the new test plus `certificate-integrity-cluster.test.js`, `certificate-signature-public-key-pinned.test.js`, `h17-verify-adversarial.test.js` → PASS.

---

### Task 6: PDF — revision line

**Files:**
- Modify: `apps/backend/services/pdf/certificate-template-service.js` (placeholder map ~line 240-300 and the HTML string that prints the certificate number)
- Test: `apps/backend/__tests__/unit/certificate-template-revision-line.test.js` (new; pattern: `certificate-template-service.test.js` — find the exported builder that returns the placeholder map / HTML)

- [ ] **Step 1: Failing test** — building the template context for `{ revisionNo: 2, revisedAt: new Date('2026-08-27T02:00:00Z') }` yields `REVISION_LINE` = `'ฉบับแก้ไขครั้งที่ 1 · 27 ส.ค. 2569'` (use the module's own Thai date formatter; the number printed is `revisionNo - 1`, i.e. "แก้ไขครั้งที่ 1" for the second revision) and the rendered HTML contains it under the certificate number; for `revisionNo: 1` the placeholder is `''` and the HTML has no "ฉบับแก้ไข".
- [ ] **Step 2: Run to see it fail.**
- [ ] **Step 3: Implement** — add `REVISION_LINE` to the placeholder map: `REVISION_LINE: (cert.revisionNo || 1) > 1 ? \`ฉบับแก้ไขครั้งที่ ${cert.revisionNo - 1} · ${formatThaiDateShort(cert.revisedAt)}\` : ''` and a `<div class="cert-revision">{{REVISION_LINE}}</div>` directly under the `{{CERT_NUMBER}}` element in the HTML (empty div renders nothing; add `.cert-revision:empty { display:none }` to the template CSS).
- [ ] **Step 4: Run** the new test and `certificate-template-service.test.js` → PASS.

---

### Task 7: Admin UI — revise dialog

**Files:**
- Modify: `apps/web-app/src/lib/services/admin-service.ts` (add `previewCertificateRevision`, `reviseCertificateLocation`; extend `CertificateDetail` with `revisionNo?: number; revisedAt?: string | null; revisionReason?: string | null`)
- Modify: `apps/web-app/src/app/admin/certificates/[id]/detail-view.tsx` (button + dialog + "ฉบับแก้ไขครั้งที่ n" line beside the number; mirror the revoke dialog's state/handlers at ~line 114-200 and ~430-520)
- Test: `apps/web-app/src/app/admin/certificates/[id]/__tests__/revise-dialog.test.tsx` (new; scaffold from `revoke-dialog.test.tsx`)

**Interfaces:**
- Consumes: Task 4 routes.
- Produces: `AdminService.previewCertificateRevision(id) → Promise<{ ok:true; data:{ current; corrected; changed:string[] } } | { ok:false; error:string; message:string }>`; `AdminService.reviseCertificateLocation(id, reason) → Promise<{ ok:true; data:{ id; certificateNumber; revisionNo; revisedAt; correctedFields:string[] } } | { ok:false; error; message }>` (never throw; mirror `revokeCertificate`'s envelope handling).

- [ ] **Step 1: Failing test** — mock `useAuth` ADMIN, `AdminService.getCertificate` (active, revisionNo 1, province 'Unknown'), `previewCertificateRevision` (changed: province/district/subDistrict/address), `reviseCertificateLocation`. Cases: (a) button "ออกฉบับแก้ไขจากข้อมูลฟาร์ม" opens the dialog which shows a table with rows จังหวัด / อำเภอ / ตำบล / ที่อยู่ and the values 'Unknown' → 'เชียงใหม่'; (b) confirm "ยืนยันออกฉบับแก้ไข" is disabled until a reason is typed; (c) confirming calls `reviseCertificateLocation(certId, reason)` once, then `getCertificate` resolves `{revisionNo:2, revisedAt}` and the page shows "ฉบับแก้ไขครั้งที่ 1" and a role="status" line "ออกฉบับแก้ไขครั้งที่ 1 ของใบรับรอง <number> แล้ว"; (d) a `CERTIFICATE_REVISION_NO_CHANGE` result keeps the dialog open with the Thai message in role="alert"; (e) the button is absent for a revoked certificate; (f) `changed: []` from preview renders "ข้อมูลตรงกันอยู่แล้ว ไม่มีอะไรต้องแก้ไข" and no confirm.
- [ ] **Step 2: Run to see it fail.**
- [ ] **Step 3: Implement** — state: `reviseDialogOpen`, `revisePreview`, `reviseReason`, `revising`, `reviseError`, `reviseNotice`; opening the dialog calls the preview; the table uses the existing token classes (`text-foreground`, `text-muted-foreground`, `bg-muted`), the Dialog/Button/Textarea primitives already imported; error mapping mirrors `revokeFailureMessage` (add Thai copy for the five new codes in the same `REVOKE_ERROR_MESSAGES`-style map, renamed to a shared `CERTIFICATE_ACTION_MESSAGES` if you touch it — never a second vocabulary). Beside the number: when `cert.revisionNo > 1`, a muted line `ฉบับแก้ไขครั้งที่ ${cert.revisionNo - 1} · ${formatThaiDate(cert.revisedAt)}`.
- [ ] **Step 4: Run** the new test, `revoke-dialog.test.tsx`, `status-and-identities.test.tsx`; `npx eslint` on the two files; `npx tsc --noEmit -p apps/web-app` (touched files only) → clean.

---

### Task 8: Verify page — revision line + archived revision page

**Files:**
- Modify: `apps/web-app/src/app/(public)/verify/[cert-number]/verify-view.tsx` (add `revision` to the parsed result type and `deriveVerifyView` output)
- Modify: `apps/web-app/src/app/(public)/verify/[cert-number]/page.tsx` (render the line under the hero, ~line 238 region, before the crypto verdict block)
- Create: `apps/web-app/src/app/(public)/verify/[cert-number]/revision/[n]/page.tsx` (server component fetching `/api/public/verify/:no/revisions/:n` the same way `page.tsx` fetches the verify result — copy its fetch helper/base-URL resolution exactly)
- Test: `apps/web-app/src/app/(public)/verify/[cert-number]/__tests__/verify-revision-line.test.tsx` (new; scaffold from `verify-crypto-verdict.test.tsx`)

- [ ] **Step 1: Failing test** — (a) a result with `data.revision = { no:2, revisedAt:'2026-08-27T02:00:00Z', reasonLabel:'แก้ไขข้อมูลที่ตั้งฟาร์ม (ความผิดพลาดของระบบ)', history:[{no:1,...}] }` renders the text "ฉบับแก้ไขครั้งที่ 1" and "แก้ไขข้อมูลที่ตั้งฟาร์ม", a link to `/verify/<no>/revision/1` labelled "ดูฉบับก่อนหน้า", and the hero stays the success tone; (b) `revision: null` renders none of it; (c) the revision page for `{ superseded:true, supersededAt, integrity:'VALID', signatureValid:true, snapshot:{province:'Unknown',...} }` renders "ฉบับนี้ถูกต้อง ณ วันที่ออก และถูกแทนที่แล้วเมื่อ 27 ส.ค. 2569" and the snapshot's province.
- [ ] **Step 2: Run to see it fail.**
- [ ] **Step 3: Implement** — `deriveVerifyView` returns `revision` (typed) unchanged; the page renders a neutral `bg-muted text-muted-foreground` line (no colour of the status hero); the revision page reuses the page's layout shell and the `formatThaiDate` helper from `@/lib/format/thai-date`.
- [ ] **Step 4: Run** the new test + `verify-crypto-verdict.test.tsx` + `verify-holder-row.test.tsx`; eslint; tsc → clean.

---

### Task 9: Real press — `e2e-g4/c03-revise-certificate-location.spec.ts` (coordinator runs it)

**Files:**
- Create: `apps/web-app/e2e-g4/c03-revise-certificate-location.spec.ts` (pattern: `c01-revoke-untrusted-key-certificate.spec.ts` — admin login via `g4Login`, two-state per certificate)

- [ ] **Step 1: Write the spec** — for each of `['GACP-TH-2569-E5960D','GACP-TH-2569-4C3761']`: `g4psql` the certificate id + revisionNo; if `revisionNo >= 2` → log "already revised — verifying" and only assert the page shows "ฉบับแก้ไขครั้งที่ 1"; else open `/admin/certificates/<id>`, click "ออกฉบับแก้ไขจากข้อมูลฟาร์ม", assert the diff table shows 'Unknown' → 'เชียงใหม่', fill the reason "ระบบบันทึกที่ตั้งฟาร์มเป็น Unknown ตอนออกใบ (F-G4-52) ทั้งที่ผู้ขอกรอกครบ ออกฉบับแก้ไขจากบันทึกฟาร์ม", confirm, wait for "ฉบับแก้ไขครั้งที่ 1", screenshot; then `page.goto('/verify/<no>')` and assert "ฉบับแก้ไขครั้งที่ 1" + the province text 'เชียงใหม่' + no 'Unknown'; screenshot; then `g4psql` proves `revisionNo=2`, province real, and one `certificate_revisions` row with `revisionNo=1` and the old hash. Evidence dir `seg('c03')`.
- [ ] **Step 2:** The coordinator applies the migration on the demo DB (`npx prisma migrate deploy --schema prisma/schema` from apps/backend, then `npx prisma generate` with the backend stopped), restarts the backend, runs `bash run-g4.sh c03-revise-certificate-location.spec.ts`, and reads `GET /api/public/verify/<no>` and `/revisions/1` for both certificates.

---

## Self-review

- Spec §2 → Task 1; §3 → Task 3; §4 admin API → Task 4; §4 admin UI → Task 7; §4 verifier → Task 5 + Task 8; §4 PDF → Task 6; §5 tests → inside each task; §6 rollout → Task 9. §7 out of scope — no task (correct).
- Placeholders: none (`source: ...:0` lines are explicitly instructed to be replaced with the real line numbers in Task 3/4 Step 4 before the catalog test is considered green).
- Names: `reviseCertificateFromFarm`, `previewCertificateRevision`, `listRevisionSummaries`, `verifyArchivedRevision`, `REVISION_REASON_LABELS_TH`, `CERTIFICATE_REVISION_FIELDS`, routes `/:id/revise-location` and `/:id/revise-location/preview`, FE `previewCertificateRevision` / `reviseCertificateLocation`, response fields `revision.{no,revisedAt,reasonLabel,history}` — used consistently across Tasks 3–9.
