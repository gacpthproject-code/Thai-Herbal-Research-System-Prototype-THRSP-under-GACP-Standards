# M1 — ใบรับรองเป็นของฟาร์ม: Implementation Plan (2026-08-15)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ย้ายน้ำหนัก "เจ้าของใบรับรอง" จากบุคคลไปที่ entity/ฟาร์ม (expand-only) + บังคับกติกา "ยื่นในนาม entity" ที่ submit endpoint + พิสูจน์ด้วยเทสว่าลบคนแล้วใบของฟาร์มไม่ตาย

**Architecture:** 3 PR เรียงลำดับ — PR-A expand schema + dual-write ตอนออกใบ + backfill · PR-B ย้าย reader ทุกจุดไปอ่าน `holderDisplayName` + กัน erasure · PR-C บังคับ 3 เงื่อนไขที่ submit endpoint ผ่าน guard กลางตัวเดียว + audit "ใครทำในนามใคร" — ทุก PR เป็น **Tier C (operator merge)** เพราะแตะ `prisma/schema|migrations` (C_STRUCTURAL, `scripts/probes/tier-check.sh:59-60`) และ auth/permission keyword

**Tech Stack:** Prisma (multi-file schema `apps/backend/prisma/schema/`), Express routes, Jest (unit = mock, integration = `HAS_DB` pattern), raw SQL migration แบบ idempotent

**Spec:** `docs/superpowers/specs/2026-08-14-membership-m1-farm-holds-certificate-design.md` (spec เดินทางคู่ plan นี้ — อ่านทั้งคู่)

## Global Constraints

- **Expand-only** — ห้ามลบ/เปลี่ยนความหมาย `Certificate.userId` และ `applicantName` (spec §3.1:32) · migration ทุกใบ idempotent (`IF NOT EXISTS` idiom ตาม `20260803130000_add_user_anonymization_markers`)
- **RED ก่อนเสมอ** — Tier C: paste ผลเทสที่ fail จริงก่อนขอ GREEN (CLAUDE.md §5)
- **เครื่อง dev นี้ไม่มี DB** — DATABASE_URL/port 5432/docker ไม่มีทั้งสามอย่าง (ตรวจแล้ว 2026-08-15) ⇒ integration test แบบ `HAS_DB` จะ skip ในเครื่อง **ห้ามใช้ jest เขียวในเครื่องเป็นหลักฐานพฤติกรรม DB** — หลักฐาน DB จริงมาจาก staging เท่านั้น = ขึ้นสถานะ `PENDING` (spec AC5:59-60)
- **UI ทุกจอ = M4** · การเชิญที่ปรึกษา/มอบอำนาจ = M2 (spec §5) — plan นี้ห้ามแตะเมนู/จอใหม่
- **Read-path scoping ไม่แตะ** (spec §3.2:45)
- Migration แตะ `certificates` เท่านั้น ห้ามแตะตารางเงิน (L3)

## คำตัดสินที่ plan นี้ล็อก (จาก AMBIGUOUS ของ spec-reader — ⚠️ = ควรให้ operator เห็นก่อน merge PR แรก)

| # | ประเด็น | คำตัดสิน | เหตุผลจากหลักฐาน |
|---|---|---|---|
| D1 | เส้น backfill `holderDisplayName` | ลำดับ: (1) `Application.entityId → Entity.displayName` (2) `Certificate.farmId → Farm.entityId → Entity.displayName` (3) fallback `applicantName` เดิม + นับแถวลง evidence · สองเส้นขัดกัน = ใช้เส้น (1) + นับแถว conflict | `Application.entityId` คือ "ผู้ยื่นตามกฎหมาย" ตั้งแต่ Phase 66 (`auth.prisma:73-75`) และ `Entity.displayName` comment ระบุ "shown on certificates" (`entity.prisma:35-36`); `Farm.entityId` เป็น null ในฟาร์มเก่าจำนวนมาก (เส้น reuse ค้นด้วย ownerId ไม่เคย backfill — `certificate-service.js:445-515,565-578`) |
| D2 ⚠️ | เพิ่มคอลัมน์ที่ 3 `holderType` (spec ระบุแค่ 2) | เพิ่ม `holderType String?` ค่า `INDIVIDUAL\|JURISTIC\|COMMUNITY_ENTERPRISE\|LEGACY_PERSON` | จำเป็นต่อ (ก) กติกา mask หน้า verify — ชื่อนิติบุคคลไม่ mask, ชื่อคน mask ต่อ (`maskApplicantName` เดิมออกแบบสำหรับชื่อบุคคล — `public.js:28-43`, call site :148) (ข) กติกา erasure ข้อ D8 — แยกแถวที่ holder เป็นชื่อคนออกจากชื่อฟาร์มโดยไม่ต้อง join runtime |
| D3 | แหล่งค่า `submittedByUserId` ตอนออกใบ | `application.submitterId ?? app.applicant.id` — **ห้าม**ใช้ argument `providerId` | ผู้เรียก 2/5 ทางส่ง `'SYSTEM'` (`workflow-handler-deps.js:63`, `auditor-handler-deps.js:48`); `Application.submitterId` คือ "User ที่กดยื่น" อยู่แล้ว (`application.prisma:14-32` comment Wave B Phase 66) |
| D4 ⚠️ | รายชื่อ endpoint ที่ถูก gate (§3.2 "ทุก endpoint ที่สร้าง/ยื่น") | ชุด M1 = 4 เส้น submit: `POST /api/applications/submit` · `POST /api/applications/bundles/:id/submit` · `PUT /api/applications/revision-deadline/:id/submit` · `POST /api/applications/car/:id/car` + ฝั่ง create: draft/bundle-create/renewal-create ต้อง seed `entityId` สำเร็จ ไม่งั้น 400 · wizard (`ENABLE_PROVIDER_LEGACY_ALIAS`) = dead flag ไม่แตะ ส่งชื่อให้ legacy-sweeper | bundle submit วันนี้ไม่มีเช็ค entity เลย = ทาง route-around (`application-bundles.js:320-397`); enforcement เส้นเดียวไร้ความหมาย |
| D5 | เช็คสมาชิก/grant ใช้ engine ไหน | ใช้ primitive สำเร็จรูป `assertEntityActionPermission({ entityId, userId, permission })` ของ `entity-effective-permissions-service` (fail-closed, 403, code `ENTITY_PERMISSION_DENIED` — **ใช้ code เดิมนี้ ไม่ประดิษฐ์ใหม่**) — **ไม่ใช่** `assertCapability(role)` เดิม · เช็คกับ `entityId` ของ **แถวคำขอที่กำลัง submit** ไม่ใช่ header | primitive มีอยู่แล้วตรงเงื่อนไขเป๊ะ (`entity-effective-permissions-service.js:403-426`; engine คืน `{ effective: [...] }` — `:143-145,219-231`) แค่ไม่ถูกต่อเข้าเส้น submit; การเช็คตาม header เปิดช่อง "สมาชิก X submit draft ของ Y" (finding submit-endpoints) |
| D6 ⚠️ | `SUBMIT_APPLICATION` ยังไม่อยู่ในชุดที่ grant ได้ | เพิ่ม `SUBMIT_APPLICATION` เข้า `FARM_OPERATION_CAPABILITIES` **พร้อม exclude ออกจาก MANAGER filter** (แบบเดียวกับ `FARM_CREATE`/`EDIT_FARM`) + เทส pin 2 ข้อ: MANAGER default **ไม่มี** `SUBMIT_APPLICATION` / grantable set **มี** | AC3 เป็นจริงไม่ได้ถ้า grant แถวนั้นสร้างไม่ได้ — แต่เพิ่มดื้อๆ จะทำ MANAGER ได้สิทธิ์ submit อัตโนมัติผ่าน `MANAGER_FARM_OPERATIONS` spread (`entity-service.js:127-131,165-168`) ขัด owner decision ที่ pin ไว้ ("MANAGER can fill the wizard / save drafts but not submit" — `applications.js:516-518`) และเทสเดิม `applications-submit-capability-gate.test.js:158-163` |
| D7 | พลิกพฤติกรรม opt-in gate | พลิก: ไม่มี `entityId` (หลัง lazy-heal) = **400 VALIDATION_ERROR เสมอ** — เทสเดิมที่ pin พฤติกรรม "ข้าม gate เมื่อไม่มี activeEntity" (`applications-submit-capability-gate.test.js:178-184`) ถูกเขียนทับแบบ RED-first | ตัวอักษร AC2; ช่อง fail-open ของ active-entity middleware (`active-entity-middleware.js:189-195`) ทำให้ opt-in = gate ที่หลบได้ |
| D8 | AC4 vs โค้ด erasure จริง | แก้ `pdpa-erasure-service.js` ชัดเจน: ล้าง `holderDisplayName` → sentinel เมื่อ `holderType IN ('LEGACY_PERSON','INDIVIDUAL')` · **AC4 คุ้มครองเฉพาะแถว JURISTIC/COMMUNITY_ENTERPRISE** (ชื่อนิติบุคคล/วิสาหกิจไม่ใช่ข้อมูลส่วนบุคคล) + เทส pin ทั้งสองฝั่ง | spec §2:20 อ้างว่า erasure เก็บ field แสดงผลไว้แล้ว — โค้ดจริงล้าง `applicantName` เป็น sentinel (`pdpa-erasure-service.js:687`); และ displayName ของ INDIVIDUAL entity สร้างจาก `firstName + lastName` ของบุคคลตรงๆ (`entity-service.js:323-327`) — ยกเว้น INDIVIDUAL จะทำชื่อคนรอด erasure บน PDF/verify/interop (ช่อง PDPA) |
| D9 | `onBehalfOfEntityId` ลงที่ไหน | `AuditLog.metadata` (Json เดิม) — ไม่เพิ่มคอลัมน์ | hash chain + `HASH_PAYLOAD_VERSION=2` (`audit-logger.js:94`) — เพิ่มคอลัมน์ = แตะ payload version โดยไม่จำเป็น; metadata เป็น additive ต่อแถวใหม่เท่านั้น |
| D10 | audit FAILURE ตอน 400/403 vs instinct I-003 | ใช้ `auditLogger.log()` (เปิด tx ตัวเอง — `middleware/audit-logger.js:479`) สำหรับ rejection path · `logWithin` คงไว้สำหรับ success ใน service tx ตามเดิม · **หมายเหตุ:** `log()` กลืน error (return null + console fallback — `:526-541`) ⇒ "ทุก throw เขียน FAILURE" เป็น best-effort โดยออกแบบ — เทส AC2 ฝั่ง staging ต้อง assert แบบรู้ข้อจำกัดนี้ | I-003 (`applications.js:74-79`) ครอบการเขียนใน business tx — เส้น 403 ไม่มี tx ให้เกาะ; `log()` ออกแบบมา standalone อยู่แล้ว (มี advisory lock ของตัวเอง `:505-506` — ห้ามเรียกซ้อนใน interactive tx อื่น) |
| D11 ⚠️ | `holderDisplayName` กับลายเซ็น/`documentHash` | **ไม่เข้า** `certificateCanonicalJson` ใน M1 — คงชุด field เดิมเป๊ะ · จด backlog "canonical v2 (versioned)" | `applicantName` อยู่ใน canonical JSON ที่ hash+RSA ครอบ (`certificate-service.js:47`, `public.js:85-89`) — เปลี่ยนชุด field = ใบเก่าทุกใบขึ้น TAMPERED |
| D12 ⚠️ | interop partner envelope | additive เท่านั้น: เพิ่ม `subject.holderDisplayName` + `subject.holderType` คง `applicantName` เดิม + bump `ECERT_SCHEMA_VERSION` minor | envelope เป็นสัญญากับ partner ภายนอก (`interoperability-core.js:207-213`) เปลี่ยนความหมาย field เงียบ ๆ = ผิดสัญญา |
| D13 ⚠️ | provider bypass "submit on behalf of citizens" ที่ revision-deadline | คงไว้ (officer ไม่ใช่สมาชิก entity — เส้นมอบอำนาจจริงคือ M2) แต่บังคับ audit row `actorType:'PROVIDER'` + `onBehalfOfEntityId` ทุกครั้ง | `revision-deadline.js:256`; ปิดตอนนี้ = หักงาน officer ที่ใช้จริง; เปิดโดยไม่ audit = มองไม่เห็น |

## File Structure

```
apps/backend/prisma/schema/certification.prisma        [M] +3 field (PR-A)
apps/backend/prisma/migrations/20260815xxxxxx_certificate_holder_expand/migration.sql  [C] (PR-A)
apps/backend/services/certificate-service.js           [M] dual-write ตอนออกใบ (PR-A)
apps/backend/prisma/seed-gacp.js                       [M] seed เติม field ใหม่ (PR-A)
apps/backend/services/entity-service.js                [M] grantable set (PR-C)
apps/backend/services/application-submit-guard.js      [C] guard กลาง 3 เงื่อนไข (PR-C)
apps/backend/routes/api/applications/applications.js   [M] เสียบ guard ที่ /submit (PR-C)
apps/backend/routes/api/applications/application-bundles.js [M] เสียบ guard (PR-C)
apps/backend/routes/api/applications/revision-deadline.js   [M] เสียบ guard + bypass audit (PR-C)
apps/backend/routes/api/applications/applications-car.js    [M] เสียบ guard (PR-C)
apps/backend/services/pdf/certificate-template-service.js   [M] reader → holder (PR-B)
apps/backend/routes/api/auth/public.js                 [M] verify JSON+SSR → holder+mask rule (PR-B)
apps/web-app/src/app/(public)/verify/[cert-number]/page.tsx [M] FE reader (PR-B)
apps/backend/routes/api/interoperability/interoperability-core.js [M] additive (PR-B)
apps/backend/routes/api/interoperability/interoperability-contracts.js [M] bump ECERT_SCHEMA_VERSION (PR-B — import ที่ core.js:15)
apps/backend/routes/api/integration/interoperability.js [M] search OR holder (PR-B)
apps/backend/services/pdpa-erasure-service.js          [M] กติกา D8 (PR-B)
```

เทสใหม่: `__tests__/unit/certificate-holder-resolver.test.js`, `__tests__/unit/application-submit-guard.test.js`, `__tests__/unit/public-verify-holder-display.test.js`, `__tests__/integration/m1-holder-backfill.test.js` (HAS_DB), `__tests__/integration/m1-erasure-holder-survives.test.js` (HAS_DB), `__tests__/integration/m1-submit-enforcement.test.js` (HAS_DB)

---

# PR-A — expand schema + dual-write + backfill (branch `feat/m1-holder-expand`)

### Task A1: Prisma schema expand

**Files:**
- Modify: `apps/backend/prisma/schema/certification.prisma` (model Certificate, หลังบรรทัด ~29 `applicantName`)

**Interfaces:**
- Produces: `Certificate.submittedByUserId: String?`, `Certificate.holderDisplayName: String?`, `Certificate.holderType: String?` — ชื่อเป๊ะตามนี้ ทุก task อ้างชุดนี้

- [ ] **Step 1:** เพิ่ม 3 field ต่อท้าย `applicantName` (คงของเดิมทุกบรรทัด):

```prisma
  // M1 (2026-08-15): the farm holds the certificate, the person merely submits.
  // Old userId/applicantName are frozen history — never dropped here (contract PR comes after drain).
  submittedByUserId String?  // ผู้ยื่นในบันทึก — backfill = ค่า userId เดิม
  holderDisplayName String?  // ชื่อผู้ถือใบ (Entity.displayName) — fallback = applicantName เดิม
  holderType        String?  // INDIVIDUAL | JURISTIC | COMMUNITY_ENTERPRISE | LEGACY_PERSON
```

- [ ] **Step 2:** `cd apps/backend && npx prisma generate --schema prisma/schema` — ต้องผ่านไม่มี error
- [ ] **Step 3:** Commit `feat(schema): M1 expand — certificate learns its holder, keeps its history`

### Task A2: Migration expand + backfill (idempotent)

**Files:**
- Create: `apps/backend/prisma/migrations/20260815100000_certificate_holder_expand/migration.sql`

**Interfaces:**
- Consumes: คอลัมน์จาก A1 · Produces: ทุกแถว `certificates` มีค่า 3 field ใหม่ครบ

- [ ] **Step 1:** เขียน migration (pattern `IF NOT EXISTS` ตาม `20260803130000`; backfill pattern ตาม `20260427120200_backfill_default_organization`):

```sql
-- M1 EXPAND only (guidance §4) — no column dropped, no meaning changed on old columns.
ALTER TABLE "certificates" ADD COLUMN IF NOT EXISTS "submittedByUserId" TEXT;
ALTER TABLE "certificates" ADD COLUMN IF NOT EXISTS "holderDisplayName" TEXT;
ALTER TABLE "certificates" ADD COLUMN IF NOT EXISTS "holderType" TEXT;

-- Backfill 1: submitter of record = old userId (spec §3.1:28-29)
UPDATE "certificates" SET "submittedByUserId" = "userId"
WHERE "submittedByUserId" IS NULL;

-- Backfill 2 (D1 priority 1): application → entity
UPDATE "certificates" c
SET "holderDisplayName" = e."displayName", "holderType" = e."type"
FROM "applications" a JOIN "entities" e ON e."id" = a."entityId"
WHERE c."applicationId" = a."id" AND a."entityId" IS NOT NULL
  AND c."holderDisplayName" IS NULL;

-- Backfill 3 (D1 priority 2): farm → entity
UPDATE "certificates" c
SET "holderDisplayName" = e."displayName", "holderType" = e."type"
FROM "farms" f JOIN "entities" e ON e."id" = f."entityId"
WHERE c."farmId" = f."id" AND f."entityId" IS NOT NULL
  AND c."holderDisplayName" IS NULL;

-- Backfill 4 (D1 fallback): frozen person name — counted as LEGACY_PERSON
UPDATE "certificates" SET "holderDisplayName" = "applicantName", "holderType" = 'LEGACY_PERSON'
WHERE "holderDisplayName" IS NULL;
```

- [ ] **Step 2:** เขียน integration test `__tests__/integration/m1-holder-backfill.test.js` (idiom `HAS_DB` ตาม `cert-issuance-atomicity-be-t1.test.js:15-16`):

```js
const HAS_DB = Boolean(process.env.DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;
d('M1 holder backfill (real Postgres)', () => {
  it('leaves no certificate row with NULL holderDisplayName/submittedByUserId/holderType', async () => {
    const [row] = await prisma.$queryRaw`
      SELECT COUNT(*) FILTER (WHERE "holderDisplayName" IS NULL) AS holder_null,
             COUNT(*) FILTER (WHERE "submittedByUserId" IS NULL) AS submitter_null,
             COUNT(*) FILTER (WHERE "holderType" IS NULL) AS type_null,
             COUNT(*) FILTER (WHERE "holderType" = 'LEGACY_PERSON') AS legacy_person,
             COUNT(*) AS total FROM "certificates"`;
    expect(Number(row.holder_null)).toBe(0);
    expect(Number(row.submitter_null)).toBe(0);
    expect(Number(row.type_null)).toBe(0);
    // legacy_person + total ไม่ assert ค่า — พิมพ์ลง evidence ตาม AC5
    console.log(`M1-BACKFILL-EVIDENCE total=${row.total} legacy_person=${row.legacy_person}`);
  });
});
```

- [ ] **Step 3:** รันในเครื่อง: `npx jest __tests__/integration/m1-holder-backfill.test.js` — คาด **skip** (ไม่มี DATABASE_URL) · จดใน report ว่า DB-side = `PENDING` จนกว่ารันบน staging
- [ ] **Step 4:** Commit `feat(migration): M1 expand+backfill — every certificate learns who holds it`

**Evidence บังคับ (AC5, ทำบน staging เท่านั้น — operator/infra-devops รัน):** นับแถว before/after + จำนวน LEGACY_PERSON + จำนวนแถวที่เส้น (1)/(2) ขัดกัน:
```sql
SELECT COUNT(*) FROM certificates;  -- ก่อนและหลัง ต้องเท่ากัน (expand ห้ามลด/เพิ่มแถว)
-- conflict count (D1): application-entity ≠ farm-entity
SELECT COUNT(*) FROM certificates c
JOIN applications a ON a.id = c."applicationId" JOIN farms f ON f.id = c."farmId"
WHERE a."entityId" IS NOT NULL AND f."entityId" IS NOT NULL AND a."entityId" <> f."entityId";
```

### Task A3: dual-write ตอนออกใบ + seed

**Files:**
- Modify: `apps/backend/services/certificate-service.js:330-376` (certData) และ include ที่ `:227-230`
- Modify: `apps/backend/prisma/seed-gacp.js:483-514`
- Test: `apps/backend/__tests__/unit/certificate-holder-resolver.test.js`

**Interfaces:**
- Produces: `resolveHolderForIssuance(app, farm) -> { holderDisplayName, holderType, submittedByUserId }` (export จาก certificate-service เพื่อเทสตรง)

- [ ] **Step 1 (RED):** เขียน unit test (mock ไม่แตะ DB — รันได้ในเครื่อง):

```js
const { resolveHolderForIssuance } = require('../../services/certificate-service');
describe('M1 resolveHolderForIssuance', () => {
  const person = { id: 'u1', firstName: 'สมชาย', lastName: 'ใจดี' };
  it('uses application entity displayName first', () => {
    const app = { applicant: person, submitterId: 'u2',
      entity: { displayName: 'วิสาหกิจชุมชนสมุนไพรบ้านนา', type: 'COMMUNITY_ENTERPRISE' } };
    const out = resolveHolderForIssuance(app, { entity: null });
    expect(out).toEqual({ holderDisplayName: 'วิสาหกิจชุมชนสมุนไพรบ้านนา',
      holderType: 'COMMUNITY_ENTERPRISE', submittedByUserId: 'u2' });
  });
  it('falls back to farm entity, then to person name as LEGACY_PERSON', () => {
    const app = { applicant: person, submitterId: null, entity: null };
    expect(resolveHolderForIssuance(app, { entity: { displayName: 'ฟาร์ม A', type: 'JURISTIC' } }))
      .toEqual({ holderDisplayName: 'ฟาร์ม A', holderType: 'JURISTIC', submittedByUserId: 'u1' });
    expect(resolveHolderForIssuance(app, { entity: null }))
      .toEqual({ holderDisplayName: 'สมชาย ใจดี', holderType: 'LEGACY_PERSON', submittedByUserId: 'u1' });
  });
  it('never lets the providerId/SYSTEM leak into submittedByUserId', () => {
    const app = { applicant: person, submitterId: null, entity: null };
    const out = resolveHolderForIssuance(app, { entity: null }, 'SYSTEM');
    expect(out.submittedByUserId).toBe('u1');
  });
});
```

- [ ] **Step 2:** รัน `npx jest certificate-holder-resolver` — คาด FAIL (`resolveHolderForIssuance is not a function`) — **paste output ลง evidence**
- [ ] **Step 3:** implement ใน certificate-service.js — เพิ่มฟังก์ชัน + export + เรียกใน certData:

```js
function resolveHolderForIssuance(app, farm /* , _ignoredProviderId */) {
  const personName = `${app.applicant.firstName} ${app.applicant.lastName}`;
  const entity = app.entity ?? farm?.entity ?? null;   // D1 priority: application ก่อน farm
  return {
    holderDisplayName: entity ? entity.displayName : personName,
    holderType: entity ? entity.type : 'LEGACY_PERSON',
    submittedByUserId: app.submitterId ?? app.applicant.id,   // D3 — ห้ามใช้ providerId
  };
}
```
ข้อบังคับการต่อสาย (จาก review senior-swe):
- `certificate-service.js` export เป็น **singleton instance** — attach `resolveHolderForIssuance` เข้า instance ตาม pattern เดียวกับ `buildCertificateDocumentHash` ไม่งั้น destructure ในเทสได้ `undefined`
- ขยาย include ของ application เป็น `{ applicant: true, entity: true }` และ farm ต้อง include `entity` **ครบทั้ง 3 ทาง return ของ `resolveFarmForCertificate`** (findFirst `:445-462,:512-515` / create `:554` / update `:565`) — พลาดทางเดียว = holderType เพี้ยนเฉพาะบางใบ
- spread `...resolveHolderForIssuance(app, farm)` เข้า certData (คง `userId`/`applicantName` เดิมไว้ทุกตัวอักษร) · ใน seed-gacp.js เติม 3 field เดียวกันใน upsert
- หมายเหตุ: renewal ไม่ set `submitterId` (`renewal-service.js:312-317` copy เฉพาะ entityId) — fallback `app.applicant.id` ของ D3 รองรับ จดไว้ไม่ต้องแก้ใน M1
- [ ] **Step 4:** `npx jest certificate-holder-resolver` — PASS · รัน suite unit เดิมของ certificate-service ต้องไม่แดงเพิ่ม
- [ ] **Step 5:** Commit `feat(cert): new certificates are born knowing their holder`

### Task A4: gate + PR

- [ ] `bash scripts/ci/local-gate.sh` PASS (เทียบ baseline main — deploy-drift/main-attestation-audit แดงได้ตามเดิม) + `LOCAL_GATE_FULL=1` (unit suite)
- [ ] `bash scripts/probes/tier-check.sh` บน diff — คาด **C** (prisma) · เปิด PR base `main` + "สรุปสำหรับ operator" 3 บรรทัด (R-PR-1) + ธง PENDING ฝั่ง DB · **operator merge**

---

# PR-B — readers ย้ายไป holderDisplayName + erasure guard (branch `feat/m1-holder-readers`, ต่อจาก PR-A merge)

### Task B1: PDF + verify (backend)

**Files:**
- Modify: `apps/backend/services/pdf/certificate-template-service.js:244`
- Modify: `apps/backend/routes/api/auth/public.js:143-161` (JSON), `:195,:324-325` (SSR)
- Test: `apps/backend/__tests__/unit/public-verify-holder-display.test.js` + แก้ `public-verify-certificate-fields.test.js`, `certificate-template-service.test.js` แบบ RED-first

**Interfaces:**
- Produces: helper `holderNameForDisplay(cert) -> string` ใน public.js (mask ตาม D2: mask เมื่อ `holderType` ∈ {INDIVIDUAL, LEGACY_PERSON} หรือ null, ไม่ mask นิติบุคคล/วิสาหกิจ)

- [ ] **Step 1 (RED):** unit test ก่อน:

```js
describe('M1 holder display on public verify', () => {
  it('shows unmasked juristic holder name', () => {
    expect(holderNameForDisplay({ holderDisplayName: 'บริษัท สมุนไพรไทย จำกัด',
      holderType: 'JURISTIC', applicantName: 'สมชาย ใจดี' }))
      .toBe('บริษัท สมุนไพรไทย จำกัด');
  });
  it('masks person-shaped holders (INDIVIDUAL / LEGACY_PERSON / unknown)', () => {
    const out = holderNameForDisplay({ holderDisplayName: 'สมชาย ใจดี', holderType: 'LEGACY_PERSON' });
    expect(out).not.toBe('สมชาย ใจดี');       // ถูก mask ตาม maskApplicantName เดิม
    expect(out.startsWith('สมชาย')).toBe(true);
  });
  it('falls back to applicantName when holder columns are empty (pre-backfill rows)', () => {
    expect(holderNameForDisplay({ holderDisplayName: null, holderType: null,
      applicantName: 'สมหญิง ดีใจ' })).toBe(holderNameForDisplay({
      holderDisplayName: 'สมหญิง ดีใจ', holderType: 'LEGACY_PERSON' }));
  });
});
```

- [ ] **Step 2:** รัน — FAIL (helper ยังไม่มี) — paste evidence · **Step 3:** implement helper + เปลี่ยน reader:
  - `certificate-template-service.js:244` → `APPLICANT_NAME: cert.holderDisplayName || cert.applicantName || '-'` (ชื่อ placeholder ใน template คงเดิม — ไม่แตะ HTML layout, จอแสดงคือชื่อผู้ถือ)
  - `public.js` JSON: เพิ่ม field `holderDisplayName: holderNameForDisplay(certificate)` และให้ `applicantName` เดิมส่งค่าเดิมต่อไป (สัญญาเก่าไม่หัก) · SSR row "ผู้ประกอบการ" → ใช้ `holderNameForDisplay`
- [ ] **Step 4:** แก้เทสเดิมที่ pin ค่าเก่า (RED ก่อน) · suite unit เขียว · **Step 5:** Commit `feat(verify): the public sees the farm, not the farmer`

### Task B2: web-app verify + interop + search

**Files:**
- Modify: `apps/web-app/src/app/(public)/verify/[cert-number]/page.tsx:35,220`
- Modify: `apps/backend/routes/api/interoperability/interoperability-core.js:207-213`
- Modify: `apps/backend/routes/api/integration/interoperability.js:294-299`

- [ ] **Step 1:** page.tsx — type เพิ่ม `holderDisplayName?: string` · render `<InfoRow label="ผู้ถือใบรับรอง" value={cert.holderDisplayName ?? cert.applicantName} />` (label เดิม "ผู้ประกอบการ" → "ผู้ถือใบรับรอง" — ตรวจกับ skill thai-ui-copy)
- [ ] **Step 2:** interop envelope — **additive** (D12): `subject: { ...เดิม, holderDisplayName: certificate.holderDisplayName, holderType: certificate.holderType }` + bump `ECERT_SCHEMA_VERSION` minor + แก้เทส `interop-resolve.test.js` RED-first
- [ ] **Step 3:** trust-registry search — `where.OR` เพิ่ม `{ holderDisplayName: { contains: search } }` คงของเดิม
- [ ] **Step 4:** jest unit เขียว + `cd apps/web-app && npm run build` ผ่าน · Commit `feat(verify,interop): holder name travels additively to every consumer`

### Task B3: erasure guard (AC4 — หัวใจ §3.3)

**Files:**
- Modify: `apps/backend/services/pdpa-erasure-service.js:676-692`
- Test: `apps/backend/__tests__/integration/m1-erasure-holder-survives.test.js` (HAS_DB)

- [ ] **Step 1 (RED):** integration test:

```js
const HAS_DB = Boolean(process.env.DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;
d('M1: erasing a member never kills the farm certificate (AC4)', () => {
  it('juristic-held cert: valid + verifiable + holder name unchanged after member erasure', async () => {
    const { user, cert } = await seedJuristicEntityWithCert();  // helper ใน test file: entity JURISTIC + member + cert holderType JURISTIC
    await erasureService.eraseUser(user.id);
    const after = await prisma.certificate.findUnique({ where: { id: cert.id } });
    expect(after.status).toBe('active');
    expect(after.holderDisplayName).toBe(cert.holderDisplayName);
    expect(after.holderType).toBe('JURISTIC');
    const res = await request(app).get(`/api/v1/public/verify/${cert.certificateNumber}`);
    expect(res.status).toBe(200);
  });
  it('LEGACY_PERSON and INDIVIDUAL certs: holder name IS wiped to sentinel (person data duty wins)', async () => {
    for (const seed of [seedLegacyPersonCert, seedIndividualEntityCert]) {
      const { user, cert } = await seed();   // INDIVIDUAL entity displayName = ชื่อคนจริง (entity-service.js:323-327)
      await erasureService.eraseUser(user.id);
      const after = await prisma.certificate.findUnique({ where: { id: cert.id } });
      expect(after.holderDisplayName).toBe(ERASURE_SENTINEL);
    }
  });
});
```

- [ ] **Step 2:** implement (D8) ในบล็อก cert-anonymise เดิม (`:676-692`) — **ต้องขยาย select ของ query certs (`:679-682`) จาก `{ id: true }` เป็น `{ id: true, holderType: true }` ก่อน** ไม่งั้น branch ด้านล่างได้ `undefined` เสมอ:
```js
// M1: holder columns — a farm's name is not personal data; a person's is.
...(cert.holderType === 'LEGACY_PERSON' || cert.holderType === 'INDIVIDUAL'
  ? { holderDisplayName: ERASURE_SENTINEL }
  : {}),   // JURISTIC / COMMUNITY_ENTERPRISE: never touched (AC4)
```
(applicantName → sentinel คงเดิมทุกตัวอักษร)
- [ ] **Step 3:** เครื่องนี้ skip ⇒ สถานะเทสนี้ = `PENDING(staging)` — ห้ามเคลม · Commit `feat(pdpa): erasure learns which names belong to people`
- [ ] **Step 4:** view-pack (AC6 — บน staging หลัง deploy): ภาพ PDF + หน้า verify ก่อน/หลัง ตาม `gacp-view-in-the-loop` — qc-evidence รวบเข้า `evidence/M1/view-pack/INDEX.md`
- [ ] **Task B4:** local-gate + tier-check + PR + operator merge (แบบ A4)

---

# PR-C — submit enforcement + audit (branch `feat/m1-submit-guard`, ขนานกับ PR-B ได้หลัง PR-A)

### Task C1: guard กลาง

**Files:**
- Create: `apps/backend/services/application-submit-guard.js`
- Modify: `apps/backend/services/entity-service.js:101-131` (เพิ่ม `'SUBMIT_APPLICATION'` เข้า `FARM_OPERATION_CAPABILITIES` — D6)
- Test: `apps/backend/__tests__/unit/application-submit-guard.test.js`

**Interfaces:**
- Produces: `assertSubmitAllowed({ userId, application, auditContext }) -> Promise<{ entityId }>` — throw `SubmitGuardError(status, code)`: ไม่มี entityId → `(400,'VALIDATION_ERROR')` · ไม่ใช่สมาชิก ACTIVE และไม่มี grant ครอบ → `(403,'ENTITY_PERMISSION_DENIED')` (**reuse code เดิมของ engine — D5, ไม่ประดิษฐ์ใหม่**) · ทุก throw เขียน AuditLog FAILURE (D10, best-effort) พร้อม `metadata.onBehalfOfEntityId`
- Consumes: `assertEntityActionPermission({ entityId, userId, permission })` จาก `entity-effective-permissions-service.js:403-426` (fail-closed อยู่แล้ว), `auditLogger.log` (`middleware/audit-logger.js:479`)

- [ ] **Step 1 (RED):** unit tests — mock ให้**ตรง API จริง** (engine คืน `{ effective: [...] }` / `assertEntityActionPermission` throw `ENTITY_PERMISSION_DENIED` — mock shape ผิดคือช่องที่ bug รอดเทสทั้งชุด เพราะ integration ถูกเลื่อนไป staging):

```js
jest.mock('../../services/entity-effective-permissions-service');
const { assertEntityActionPermission } = require('../../services/entity-effective-permissions-service');
const denied = Object.assign(new Error('denied'), { status: 403, code: 'ENTITY_PERMISSION_DENIED' });

describe('M1 assertSubmitAllowed', () => {
  it('400 VALIDATION_ERROR when application has no entityId', async () => {
    await expect(assertSubmitAllowed({ userId: 'u1', application: { id: 'a1', entityId: null }, auditContext: ctx }))
      .rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    expect(auditLogger.log).toHaveBeenCalledWith(expect.objectContaining({
      result: 'FAILURE', actorId: 'u1',
      metadata: expect.objectContaining({ onBehalfOfEntityId: null }) }));
  });
  it('403 ENTITY_PERMISSION_DENIED + audit FAILURE when neither ACTIVE member nor grant-holder', async () => {
    assertEntityActionPermission.mockRejectedValue(denied);
    await expect(assertSubmitAllowed({ userId: 'u1', application: { id: 'a1', entityId: 'e9' }, auditContext: ctx }))
      .rejects.toMatchObject({ status: 403, code: 'ENTITY_PERMISSION_DENIED' });
    expect(assertEntityActionPermission).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', entityId: 'e9', permission: 'SUBMIT_APPLICATION' }));
    expect(auditLogger.log).toHaveBeenCalledWith(expect.objectContaining({
      result: 'FAILURE', metadata: expect.objectContaining({ onBehalfOfEntityId: 'e9' }) }));
  });
  it('passes when the engine allows (role default / GRANT row — REVOKE-wins อยู่ในตัว engine แล้ว)', async () => {
    assertEntityActionPermission.mockResolvedValue(undefined);
    await expect(assertSubmitAllowed({ userId: 'u1', application: { id: 'a1', entityId: 'e1' }, auditContext: ctx }))
      .resolves.toEqual({ entityId: 'e1' });
  });
  it('keys off the APPLICATION row entityId — an x-active-entity header for another entity changes nothing', async () => {
    assertEntityActionPermission.mockImplementation(({ entityId }) =>
      entityId === 'e1' ? Promise.resolve() : Promise.reject(denied));
    await expect(assertSubmitAllowed({ userId: 'u1',
      application: { id: 'a1', entityId: 'e2' }, auditContext: { ...ctx, activeEntityId: 'e1' } }))
      .rejects.toMatchObject({ status: 403 });
  });
});
```

- [ ] **Step 2:** รัน — FAIL — paste evidence · **Step 3:** implement guard (~50 บรรทัด: เรียก `assertEntityActionPermission({ entityId: application.entityId, userId, permission: 'SUBMIT_APPLICATION' })`, แปลง reject → เขียน audit FAILURE แล้ว rethrow / คืน `{ entityId }` เมื่อผ่าน — metadata SUCCESS ให้ caller แนบใน status-write เดิม)
- [ ] **Step 3b (B1 จาก review — ห้ามข้าม):** เพิ่ม `SUBMIT_APPLICATION` เข้า `FARM_OPERATION_CAPABILITIES` (`entity-service.js:101-131`) **และ** เพิ่มเข้า exclude list ของ `MANAGER_FARM_OPERATIONS` filter (`:127-131` — แบบเดียวกับ `FARM_CREATE`/`EDIT_FARM`) + เทส pin 2 ข้อ (RED ก่อน): (1) `DEFAULT_PERMISSIONS_BY_ROLE.MANAGER` ไม่มี `SUBMIT_APPLICATION` (2) grantable set มี — เทสเดิม `applications-submit-capability-gate.test.js:158-163` ("MANAGER is blocked with 403") ต้องยังเขียว
- [ ] **Step 4:** PASS · Commit `feat(guard): who submits, in whose name — one gate, every door`

### Task C2: เสียบ guard ทั้ง 4 เส้น + พลิกเทส opt-in

**Files:**
- Modify: `applications.js:502-533` (แทน capability gate เดิมด้วย guard), `application-bundles.js:320-397`, `revision-deadline.js:251-258` (bypass provider: ข้าม membership check แต่**บังคับ** audit `actorType:'PROVIDER'` + onBehalfOfEntityId — D13), `applications-car.js:73`
- Modify (RED-first) — เทสเดิมที่จะแดง **3 ไฟล์** (จาก review): `__tests__/unit/applications-submit-capability-gate.test.js:146-184` (เคส "no activeEntity → allowed" พลิกเป็น "no entityId → 400") · `__tests__/unit/applications-submit-canonical-validation.test.js` (draft mock `entityId: null` ที่ `:152` — ทุกเคสจะชน 400 ใหม่ก่อนถึง logic ที่เทสวัด ต้องเติม entityId ใน mock) · `__tests__/unit/a0-pr2-submit-hops-audit-emission.test.js:225,248,364` (ยิง /submit โดยไม่ mock deps ของ guard ใหม่)

- [ ] **Step 1 (RED):** พลิก/เพิ่ม/ซ่อมเทสทั้ง 3 ไฟล์ก่อน — รันให้เห็นแดงทั้งชุด — paste evidence
- [ ] **Step 1b (M2 จาก review — heal ก่อน gate):** เส้น /submit ใช้ `findDraftForSubmit` (`application-applicant-query-methods.js:196-221`) ซึ่ง**ไม่มี** lazy-heal (heal อยู่เฉพาะเส้น /draft,/prepare — `applications.js:214-222`) ⇒ ก่อนเรียก guard ที่ทุกเส้น submit: ถ้า `application.entityId` เป็น null ให้ heal ด้วย `findUserPersonalEntity` + `healDraftEntityColumns` (reuse ของเดิม) แล้วค่อยตัดสิน 400 — ไม่งั้นแถว pre-Phase-66 ที่เจ้าของไม่เคยเปิด draft ซ้ำจะโดน hard-400 ถาวร (พร้อมเทส: draft entityId null + user มี personal entity → heal แล้วผ่าน)
- [ ] **Step 2:** เสียบ guard ทีละเส้น รันเทสจนเขียว · draft-create endpoints (`applications.js:234-239` seedEntityId, renewal create `renewals.js:58-96`): seed แล้วยัง null → 400 `VALIDATION_ERROR` (พร้อมเทส) · **bundle create (`:177,:239`) ไม่มีอะไรให้ seed** — สอง endpoint นั้น link application ที่มีอยู่ จุดคุมคือ guard per-linked-app ตอน submit
- [ ] **Step 2b (bundle รายละเอียดจาก review):** select ของ linked apps ที่ `application-bundles.js:333` เป็น `{ id: true, status: true }` — ขยายให้มี `entityId` · รัน guard + `auditLogger.log()` ครบทุก linked app **ก่อน**เปิด `prisma.$transaction` ที่ `:380` — `log()` มี advisory lock ของตัวเอง ซ้อนใน tx = pool contention และแถว FAILURE ต้องอยู่รอด rollback
- [ ] **Step 3:** integration `m1-submit-enforcement.test.js` (HAS_DB — AC2/AC3 ระดับ DB: 403 แล้วมีแถว AuditLog FAILURE จริง, grant แล้ว submit สำเร็จ + audit onBehalfOf) — เครื่องนี้ skip = `PENDING(staging)`
- [ ] **Step 4:** สำคัญ: เช็คว่า status-write audit เดิม (`application-status-writer.js:862-915`) ได้ `metadata.onBehalfOfEntityId` ด้วยตอน submit สำเร็จ (AC3) — เติมจุดส่ง metadata จาก caller
- [ ] **Step 5:** Commit `feat(submit): the four doors now ask in whose name`

### Task C3: gate + PR + ปิดงาน

- [ ] local-gate (+FULL) + tier-check (คาด C — keyword `permission`) + security-review agent + PR + operator merge
- [ ] Report ตาม §6 (≤40 บรรทัด) — DB-side ทุกข้อ = `PENDING(staging)` ระบุชัด · Evidence: `evidence/M1/INDEX.md`

---

## ลำดับหลักฐานฝั่ง staging (ทำหลัง 3 PR merge — operator/infra-devops)

1. Deploy staging → รัน `prisma migrate deploy` → เก็บ count queries (Task A2 Evidence) 
2. `DATABASE_URL=... npx jest __tests__/integration/m1-*` บนเครื่อง staging — RED→GREEN จริง แนบ output
3. View-pack AC6: PDF + verify ก่อน/หลัง → `evidence/M1/view-pack/INDEX.md`
4. อัปเดต status ใน report: `PENDING` → `DONE(probe:...)` เฉพาะที่มี artifact จริง

## Self-review + adversarial review (ทำแล้ว)

- Spec coverage: §3.1→A1-A3+B1-B2 · §3.2→C1-C2 · §3.3→B3 · AC1→A3 · AC2/AC3→C1-C2 · AC4→B3 · AC5→A2+staging §ข้างบน · AC6→B3 Step 4 · §5 out-of-scope เคารพครบ (ไม่มี task UI/M2/M3/transfer/contract)
- ไม่มี TBD/placeholder · ชื่อ field/function สอดคล้องทุก task (`submittedByUserId`, `holderDisplayName`, `holderType`, `resolveHolderForIssuance`, `assertSubmitAllowed`, `holderNameForDisplay`)
- จุดที่ plan แตกจาก spec ตัวอักษร (มีเหตุผล + ธง ⚠️ ให้ operator): D2 (คอลัมน์ที่ 3), D4 (นิยามชุด endpoint), D6 (ขยาย grantable set แบบไม่หลุดถึง MANAGER), D8 (แก้ erasure ชัดเจน — spec §2 premise ขัดโค้ดจริง + ปิดช่อง INDIVIDUAL), D11-D13
- **Adversarial review โดย senior-swe (fresh context, 2026-08-15)**: เปิดโค้ดจริงตรวจ 30+ citation — พบ BLOCKER 2 (B1 MANAGER escalation ผ่าน grantable spread, B2 ชื่อคนใน INDIVIDUAL entity รอด erasure) + MAJOR 4 (mock shape ไม่ตรง engine API, heal ไม่มีบนเส้น /submit, erasure select ขาด holderType, เทสเดิมแดงเพิ่ม 2 ไฟล์) — **ทั้งหมด fold เข้า plan ฉบับนี้แล้ว** (D5/D6/D8/D10 + Task A3/B3/C1/C2) · รายงานเต็ม: `reports/senior-swe/2026-08-15-m1-plan-review.md`
