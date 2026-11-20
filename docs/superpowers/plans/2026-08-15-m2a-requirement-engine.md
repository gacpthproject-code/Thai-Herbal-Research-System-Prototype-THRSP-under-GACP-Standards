# M2a — Requirement Engine Implementation Plan (2026-08-15 — rev.2 หลังรีวิว senior-swe)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เสา 2 ของ M2 — กติกาเอกสารบังคับเป็น**ข้อมูล append-only มีวันมีผล** เสียบเข้า submit gate จริงทั้ง 5 ประตู อ่านหลักฐาน server-side เท่านั้น (คำวินิจฉัย G2 + spec M2 §3)

**Architecture:** branch `feat/m2a-requirement-engine` · ตารางใหม่ `RequirementRule` (catalog กลางไม่ผูก tenant — convention เดียวกับ `CertificationStandard`) + service (immutability บังคับที่ service) + admin API (`requireAdmin`) + ตัวเช็คที่ประตูยื่น + ประทับ snapshot ลงคำขอ (server-owned key) · **operator merge**

**Tech Stack:** Prisma / Express / Jest — reuse: `validation-slot-utils.js` (alias→slot กลาง), `shared/form-data-ownership.js`, `middleware/require-admin.js`, guard-door pattern ของ M1

**Spec:** `docs/superpowers/specs/2026-08-15-membership-m2-documents-and-poa-design.md` (rev.2 §3 + AC 1-3) — อ่านคู่เสมอ

## Global Constraints

- RED-first ทุก task → `evidence/M2a/<task>-red.txt` / `-green.txt` · เครื่องนี้ไม่มี DB — HAS_DB test = PENDING(staging) · full suite = `NODE_OPTIONS=--max-old-space-size=3072`
- hook ~3-4 นาที ห้าม kill (timeout 600000) · ห้าม grep/glob ทั้ง repo · ห้าม TODO/hardcode ใหม่ · commit trailer มาตรฐาน session
- **ห้าม UPDATE เนื้อแถว RequirementRule — ยกเว้นสามคอลัมน์ปิดวาระของ `closeRule` (`effectiveTo/closedBy/closedAt`) เท่านั้น** — append-only คือหัวใจของ AC3 (ตรวจย้อนได้) (ถ้อยคำแก้ตามรีวิว L8)
- **vocabulary เดียว:** `requestType` ใช้ชุดของ `document-slots.js` = `NEW | RENEWAL | REPLACEMENT` (**ไม่ใช่ 'RENEW'** — กันเกิดชุดคำที่ห้าตามที่ sweep ด่าไว้) · `slotId` เก็บ**รูป canonical (lower)** ผ่าน `getCanonicalSlotId` ตั้งแต่ insert/seed และ**เทียบผ่าน canonicalizer ทั้งสองฝั่งเสมอ** (รีวิว M4/M6)
- **นอกขอบเขต M2a:** vault/ความสด runtime (M2b — คอลัมน์ `maxDocumentAgeMonths` เกิดแต่ยังเฉย), CONSULTANT/POA (M2c), checkpoint เจ้าหน้าที่ (M2d), ย้าย baseline 15 slots เข้า engine, หน้าจอ admin (M4 — เฟสนี้ API เท่านั้น)

---

### Task 1: ตาราง + migration + seed กติกาตั้งต้น

**Files:**
- Create: `apps/backend/prisma/schema/requirement-rule.prisma`
- Create: `apps/backend/prisma/migrations/20260815200000_requirement_rules/migration.sql`
- Test: `apps/backend/__tests__/integration/m2a-requirement-seed.test.js` (HAS_DB)

**Interfaces:**
- Produces model `RequirementRule` (`@@map("requirement_rules")`): `id/createdAt` · มิติ `holderType? requestType? plantCode?` (**null = ครอบทุกค่า**ของมิตินั้น) · `slotId` (slot กลางของ `document-slots.js`) · `isRequired Boolean @default(true)` · `maxDocumentAgeMonths Int?` (G4 — บังคับใช้จริงเมื่อ M2b มี vault) · `effectiveFrom DateTime` / `effectiveTo DateTime?` (null = ยังมีผล) · `createdBy/reason?` + `closedBy?/closedAt?` · index `[slotId]`, `[effectiveFrom, effectiveTo]` · **ไม่มี organizationId** (นโยบายกรมฯ ระดับประเทศ — precedent: `CertificationStandard` certification.prisma:152)

- [ ] **Step 1:** เขียน schema ตาม Interfaces (comment หัวไฟล์: G2 + append-only + ห้าม UPDATE) · `npx prisma generate --schema prisma/schema` ผ่าน
- [ ] **Step 2:** migration idempotent (pattern `20260803130000`): `CREATE TABLE IF NOT EXISTS "requirement_rules" (...)` + index + **seed 2 แถวตั้งต้นด้วย id คงที่** (`INSERT ... ON CONFLICT (id) DO NOTHING`):

```sql
INSERT INTO "requirement_rules" ("id","holderType","requestType","plantCode","slotId","isRequired","maxDocumentAgeMonths","effectiveFrom","effectiveTo","createdBy","reason","createdAt")
VALUES
('m2a-seed-juristic-company-reg', 'JURISTIC', NULL, NULL, 'company_reg', TRUE, 6, '2026-08-15T00:00:00Z', NULL, 'SYSTEM-M2A-SEED', 'คำวินิจฉัย operator 2026-08-15 (G-grill): นิติบุคคลแนบหนังสือรับรอง DBD', NOW()),
('m2a-seed-community-cert',      'COMMUNITY_ENTERPRISE', NULL, NULL, 'community_cert', TRUE, 6, '2026-08-15T00:00:00Z', NULL, 'SYSTEM-M2A-SEED', 'คำวินิจฉัย operator 2026-08-15 (G-grill): วิสาหกิจชุมชนแนบเอกสารรับรองการจดทะเบียน', NOW())
ON CONFLICT ("id") DO NOTHING;
```
(ค่า `maxDocumentAgeMonths = 6` เป็นค่าตั้งต้นตามธรรมเนียมหนังสือรับรองราชการ — **แก้ได้ทาง admin API ไม่ใช่ hardcode** · ธงให้ operator เห็นใน R-PR-1)
- [ ] **Step 3:** integration test (HAS_DB — skip ในเครื่อง): สองแถว seed อยู่จริง + query ด้วย id คงที่ · เก็บ `evidence/M2a/t1-jest-skip.txt` = PENDING(staging)
- [ ] **Step 4:** Commit `feat(schema): requirement rules become data — dated, append-only, no deploy to change them`

### Task 2: requirement-rule-service (append-only บังคับที่ service)

**Files:**
- Create: `apps/backend/services/requirement-rule-service.js`
- Test: `apps/backend/__tests__/unit/requirement-rule-service.test.js`

**Interfaces:**
- `rulesAt({ at, holderType, requestType, plantCode }, client?) -> Promise<rule[]>` — where: `effectiveFrom <= at AND (effectiveTo IS NULL OR effectiveTo > at)` และมิติ: `(holderType IS NULL OR = :holderType)` (requestType/plantCode เช่นเดียวกัน)
- `insertRule(data, actor)` / `closeRule(id, actor, reason)` — closeRule = **update เฉพาะ `effectiveTo/closedBy/closedAt`** (ทางเดียวที่แตะแถวเดิม — นี่ไม่ใช่การแก้กติกา แต่คือการปิดวาระ) · ทั้งคู่เขียน AuditLog ผ่าน `auditLogger.log` (action `REQUIREMENT_RULE_CREATED`/`REQUIREMENT_RULE_CLOSED`, metadata = สาระของแถว)
- **ไม่มี method แก้เนื้อแถว** — เทส pin: module ไม่ export `updateRule` และ closeRule ที่พยายามเปลี่ยน `slotId/holderType/...` = ไม่มีทางทำได้ (signature ไม่รับ)

- [ ] **Step 1 (RED):** unit tests (mock prisma):

```js
it('a rule effective yesterday..open applies today; effective tomorrow does not; closed yesterday does not', async () => {
    // rulesAt สร้าง where ถูกต้อง — assert argument ของ findMany (บอกเวลา ณ จุดถาม)
});
it('dimension null matches everything; JURISTIC rule never fires for COMMUNITY_ENTERPRISE', async () => { ... });
it('insertRule + closeRule write audit rows; the service exposes NO way to edit a rule body', async () => {
    expect(svc.updateRule).toBeUndefined();
});
```

- [ ] **Step 2:** RED → `evidence/M2a/t2-red.txt` · **Step 3:** implement (~80 บรรทัด) · **Step 4:** GREEN → `t2-green.txt` · Commit `feat(rules): the engine reads the law as of the day you filed`

### Task 3: admin API

**Files:**
- Create: `apps/backend/routes/api/admin/requirement-rules.js` · Modify: `apps/backend/routes/api/admin/index.js` (mount)
- Test: `apps/backend/__tests__/unit/admin-requirement-rules-routes.test.js`

**Interfaces:**
- `GET /api/admin/requirement-rules` (query: `at?`, `includeClosed?`) · `POST /` (insert) · `POST /:id/close` — ทุกเส้น `authenticateProvider + requireAdmin` (convention `middleware/require-admin.js` — ADMIN canonical เท่านั้น) · ตอบแถวเต็ม (นโยบายไม่ใช่ PII)

- [ ] **Step 1 (RED):** supertest: non-admin → 403 · admin insert → 201 + audit เรียกจริง (mock service) · close → 200 · validation (รีวิว M6 — กัน "กฎหมายใบ้" ที่ไม่มีวันยิงเพราะพิมพ์ผิด): `slotId` ผ่าน `getCanonicalSlotId` แล้วต้องอยู่ใน `DOCUMENT_SLOTS` → ไม่รู้จัก = 400 · `holderType` ∈ {INDIVIDUAL, JURISTIC, COMMUNITY_ENTERPRISE} หรือ null · `requestType` ∈ {NEW, RENEWAL, REPLACEMENT} หรือ null → นอกชุด = 400 พร้อมบอกชุดที่รับ
- [ ] **Step 2:** RED → `t3-red.txt` · **Step 3:** implement · **Step 4:** GREEN → `t3-green.txt` · Commit `feat(admin): the ministry edits the document law without a deploy`

### Task 4: ตัวเช็คที่ประตูยื่น + ประทับ snapshot

**Files:**
- Create: `apps/backend/services/application-document-requirements.js`
- Modify: `apps/backend/shared/form-data-ownership.js:36-71` — เพิ่ม `'serverRequirementSnapshot'`, `'serverVaultSnapshot'` (จองให้ M2b พร้อมกัน — "Adding a key here is always safe" ตาม doc ของไฟล์เอง) พร้อม comment กลุ่มใหม่
- Modify (เสียบ — **จำแนกตามรีวิว H1/H2, ห้ามเบี่ยง**):
  - `routes/api/applications/applications.js` — **/submit เป็นประตูผสม**: มี predicate จริงอยู่แล้ว `isInitialSubmit = currentStatus === 'DRAFT'` (`:746`) และ `RESUBMIT_TARGET` รับ DRAFT/REVISION_REQUESTED/CAR_PENDING (`:654-658`) — จุดเสียบอยู่**หลัง resolve RESUBMIT_TARGET และหลัง early-return idempotent** (`:633` — SUBMITTED/PENDING_DOC_FEE ตอบ 200 ต้องไม่กลายเป็น 422): branch DRAFT = check ด้วย `mode:'first-submit'` + stamp ที่จุด merge formData Hop 1 (`:800-806` — มีจริง) · branch REVISION_REQUESTED/CAR_PENDING = `mode:'resubmit'` validate-by-stamp
  - `application-bundles.js` — first-submit ต่อ linked app แต่**ประตูนี้ไม่มี formData write เดิมให้เกาะ** (ตรวจแล้ว: projection `:404-406` ไม่โหลด formData และ `writeApplicationStatus` `:490-499` ไม่ส่ง additionalData) — **สั่งวิธีตรงนี้เลย**: ขยาย projection ให้รวม `formData` (ต้องใช้อ่าน evidence อยู่แล้ว) แล้วส่ง `additionalData: { formData: { ...linkedApp.formData, serverRequirementSnapshot } }` ใน write ต่อ app ภายใน tx เดิม — **ห้าม stamp โดยไม่ spread ก้อนเดิม** (writer แทนทั้งก้อน — ทับข้อมูลผู้สมัคร)
  - `applications-car.js` (resubmit — มี formData merge เดิม `:264-274`) / `revision-deadline.js` (resubmit — **ขยาย projection** `:319-322` จาก `{id, entityId, submitterId}` ให้รวม `formData, status` · **branch provider-bypass (`:368-376`) ข้าม doc-check โดยตั้งใจ** — สอดคล้อง D13 จดใน commit + เทส pin ว่า officer path ไม่เปลี่ยน) / `application-workflow-handlers.js` (resubmit — โหลด full row อยู่แล้ว)
- Modify (เทสเดิมที่จะ crash เพราะ service ใหม่ — รีวิว M3 **จองงานในนี้เลย**): `__tests__/unit/m1-submit-guard-doors.test.js` (prisma mock ไม่มี `entity`/`requirementRule`/`applicationDocument` — mock module `application-document-requirements` แทน), `a0-pr2-submit-hops-audit-emission.test.js`, `applications-submit-capability-gate.test.js`, `applications-submit-canonical-validation.test.js`
- Test: `apps/backend/__tests__/unit/m2a-doc-requirements.test.js` (service) + `apps/backend/__tests__/unit/m2a-doc-requirements-doors.test.js` (ประตู — pattern `m1-submit-guard-doors.test.js`) + `apps/backend/__tests__/integration/m2a-submit-enforcement.test.js` (HAS_DB)

**Interfaces:**
- `collectServerDocumentEvidence(application) -> Set<canonicalSlotId>` — union: `formData.draftDocuments[]` ผ่าน `buildUploadedSlotSet` + แถว `ApplicationDocument` **map ด้วย `getCanonicalSlotId(row.documentType)` เท่านั้น — ห้ามป้อน row ดิบเข้า buildUploadedSlotSet** (fallback `entry.id` จะเอา UUID มาเป็น slot — รีวิว M5) · SSOT alias = `validation-slot-utils.js` ห้ามเขียน alias ใหม่ · **ไม่อ่าน `formData.documents`** (ธง client)
- `assertRequiredDocumentsPresent({ application, mode, client }) -> Promise<{ appliedRules }>` — **`mode: 'first-submit' | 'resubmit'` ประตูเป็นผู้บอก** (จาก predicate ของประตูเอง เช่น `isInitialSubmit` — service ไม่เดาจาก status เอง — รีวิว H1):
  - `mode:'resubmit'` + มี `formData.serverRequirementSnapshot` → validate กับ `slotIds` ที่ประทับ — กติกาที่เปลี่ยนภายหลังไม่มีผล (spec M-9)
  - `mode:'first-submit'` → resolve `Entity.type` จาก `application.entityId` → `requestType = formData.renewalOf ? 'RENEWAL' : 'NEW'` (vocabulary ของ `document-slots.js` — รีวิว M6) → `rulesAt(now, ...)` → เทียบ evidence (**canonicalize ฝั่ง rule ด้วย `getCanonicalSlotId(rule.slotId)` ก่อนเทียบเสมอ — สองฝั่งรูปเดียวกัน** — รีวิว M4) → ขาด = throw `{ status: 422, code: 'APPLICATION_INCOMPLETE', missingSlots: [{ slotId, labelTH }] }` (label จาก `DOCUMENT_SLOTS`)
  - `mode:'resubmit'` + ไม่มี stamp (คำขอยุคก่อน M2a) → **grandfather**: ผ่าน + `logger.warn` (นับ drain)
- `buildRequirementSnapshot(appliedRules) -> { stampedAt, ruleIds, slotIds }` (pure) — ประตู first-submit ประทับลง formData **ใน write เดิมของประตูนั้น** (จุด merge formData ที่ประตูมีอยู่แล้ว — implementer ชี้จุดจริงต่อประตูและกันทับด้วย server-owned merge)

- [ ] **Step 1 (RED — service):** เคส: JURISTIC ไม่มี `COMPANY_REG` ฝั่ง server → 422 + missingSlots · มีใน draftDocuments (ผ่าน alias เก่า เช่น `company_reg` ตัวเล็ก) → ผ่าน · ธง `formData.documents[].uploaded=true` ล้วน → ยัง 422 (AC2) · INDIVIDUAL → ไม่มี rule ยิง → ผ่าน · resubmit-มี-stamp → ใช้ slotIds เดิมแม้ rulesAt ตอนนี้ต่างไป (AC3) · legacy-ไม่มี-stamp → grandfather+warn
- [ ] **Step 2:** RED → `t4-red.txt` · **Step 3:** implement service + เติม 2 keys ใน ownership + เสียบ 5 ประตู (first-submit: หลัง `assertSubmitAllowed` สำเร็จ — ลำดับ: สิทธิ์ก่อน แล้วค่อยความครบเอกสาร) + stamp
- [ ] **Step 4 (RED — doors):** doors test: /submit JURISTIC ขาดเอกสาร → 422 ก่อนเขียนอะไร · bundle: linked app ขาด → 422 ทั้ง bundle ไม่มี tx เปิด · resubmit door ใช้ stamp · stamp โดน `/prepare` เขียนทับไม่ได้ (pin กับ `applyClientFormData` จริง)
- [ ] **Step 5:** GREEN ทุกชุด → `t4-green.txt` + lane `applications-submit|bundle|revision|car|doc-requirements` → `t4-regression.txt` · integration (HAS_DB) → skip = PENDING(staging) · Commit `feat(submit): five doors now read the document law — as data, as of the filing date`

### Task 5: gate + evidence + PR

- [ ] `tier-check.sh > evidence/M2a/tier-check.txt` (เครื่องตัดสิน — ปฏิบัติแบบ C) · `LOCAL_GATE_FULL=1 NODE_OPTIONS=--max-old-space-size=3072 local-gate.sh > evidence/M2a/gate-local-full.txt` + SHA stamp — เกณฑ์ no new failures over main (baseline: 3 probes + pdf-ssrf เครื่อง)
- [ ] `evidence/M2a/INDEX.md` + สถานะห้ามเคลม (DB-side PENDING(staging) — seed/422 จริง/stamp จริง วิ่งใน full-gate staging)
- [ ] Audit adversarial (fresh context — โจทย์: หา route-around ของ 422, ทดสอบ immutability จริง, mutation ≥3) → fix cycle ตามจำเป็น → push + R-PR-1 (ธง: ค่า 6 เดือนตั้งต้น + การ grandfather คำขอเก่า) + คำสั่ง merge

## Self-review + adversarial review (ทำแล้ว)

- Spec coverage: G2/AC1 (per-type 422 + missingSlots)→T4 · AC2 (ธง client ไร้ผล + snapshot server-owned)→T4 · AC3 (effective dating + resubmit ใช้ชุดประทับ)→T2+T4 · admin-as-data→T1-T3 · maxDocumentAgeMonths เกิดใน T1 เฉยจน M2b (ประกาศชัด)
- ไม่มี placeholder · ชื่อสอดคล้อง: `RequirementRule`, `rulesAt`, `assertRequiredDocumentsPresent(mode)`, `serverRequirementSnapshot`, `APPLICATION_INCOMPLETE`
- **รีวิว senior-swe รอบ plan (พับครบใน rev.2):** H1 /submit เป็นประตูผสม — จำแนก branch ด้วย `isInitialSubmit` + เสียบหลัง early-return idempotent · H2 bundle ไม่มี formData write เดิม — สั่งวิธี additionalData spread เป็นลายลักษณ์อักษร · M3 จองงานแก้เทสเดิม 4 ไฟล์ใน Files · M4/M5 canonicalize สองฝั่ง + map แถว DB ด้วย documentType · M6 whitelist มิติ + vocabulary RENEWAL · L7 projection revision-deadline + provider-bypass เป็นการตัดสินใจที่จด · L8 ถ้อยคำ UPDATE
- จุดเดียวที่เหลือให้ implementer ชี้: บรรทัดแทรกที่แน่นอนของ check ในแต่ละประตู (พิกัดหลัง M1.5 อาจเลื่อน — หาด้วยเนื้อหาที่ plan ระบุ)
