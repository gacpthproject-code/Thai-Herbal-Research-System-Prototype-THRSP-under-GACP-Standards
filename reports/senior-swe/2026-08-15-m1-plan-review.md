# senior-swe adversarial review — M1 plan (2026-08-15)

Target: `docs/superpowers/plans/2026-08-15-membership-m1-farm-holds-certificate.md` (draft ก่อน commit)
Method: fresh-context agent เปิดโค้ดจริงตรวจ 30+ citation — ไม่เชื่อ recon
Disposition: **ทุก finding ถูก fold เข้า plan ฉบับ commit แล้ว** (ระบุจุดใน วงเล็บท้ายข้อ)

## BLOCKER

**B1 — D6 ทำ MANAGER ได้สิทธิ์ submit โดยไม่ตั้งใจ (privilege escalation)**
`entity-service.js:127-131` — `MANAGER_FARM_OPERATIONS = FARM_OPERATION_CAPABILITIES.filter(c => c !== FARM_CREATE && c !== EDIT_FARM)` spread เข้า MANAGER default ที่ `:165-168`. การเพิ่ม `SUBMIT_APPLICATION` เข้า `FARM_OPERATION_CAPABILITIES` ดื้อๆ จะให้ MANAGER ได้สิทธิ์ทันที ขัด owner decision ("MANAGER can fill the wizard / save drafts but not submit" — `applications.js:516-518`) และเทส `applications-submit-capability-gate.test.js:158-163`.
แก้: exclude จาก MANAGER filter + เทส pin 2 ข้อ. (→ plan D6 + Task C1 Step 3b)

**B2 — D8 ปล่อยชื่อบุคคลรอด erasure ผ่าน holderType='INDIVIDUAL' (PDPA)**
`entity-service.js:323-327` — displayName ของ INDIVIDUAL entity คือ `firstName + lastName` ของบุคคลตรงๆ. กติกาเดิมของ plan ("INDIVIDUAL-entity: never touched") ทำให้ลบผู้ใช้แล้วชื่อเดียวกันที่ถูก wipe จาก `applicantName` (`pdpa-erasure-service.js:687`) ยังโชว์ต่อใน holderDisplayName.
แก้: wipe เมื่อ `holderType IN ('LEGACY_PERSON','INDIVIDUAL')` — AC4 คุ้มครองเฉพาะ JURISTIC/COMMUNITY_ENTERPRISE. (→ plan D8 + Task B3)

## MAJOR

**M1 — mock shape ของ guard ไม่ตรง engine API จริง** — ของจริง: `getEffectiveEntityPermissions({...}) → { effective: [...] }` (`entity-effective-permissions-service.js:143-145,219-231`) และมี primitive `assertEntityActionPermission({ entityId, userId, permission })` (`:403-426`, fail-closed, 403 `ENTITY_PERMISSION_DENIED`). Integration เลื่อนไป staging ⇒ mock-shape bug จะเขียวในเครื่อง. แก้: ใช้ primitive จริง + reuse error code เดิม. (→ plan D5 + Task C1)

**M2 — premise "lazy-heal รันก่อน guard ที่ /submit" เป็นเท็จ** — heal (`applications.js:214-222`) อยู่เฉพาะเส้น /draft,/prepare; เส้น /submit ใช้ `findDraftForSubmit` (`application-applicant-query-methods.js:196-221`) ไม่ heal ⇒ hard-400 กับแถว pre-Phase-66. แก้: heal ก่อน guard ทุกเส้น submit. (→ Task C2 Step 1b)

**M3 — D8 snippet พังกับ select จริง** — `pdpa-erasure-service.js:679-682` select `{ id: true }` ⇒ `cert.holderType` undefined เสมอ. แก้: ขยาย select. (→ Task B3 Step 2)

**M4 — เทสเดิมที่จะแดงซึ่ง plan ไม่ได้ระบุ** — `applications-submit-canonical-validation.test.js:152` (draft mock entityId null), `a0-pr2-submit-hops-audit-emission.test.js:225,248,364`. (→ Task C2 RED-first list)

## MINOR (fold แล้วทั้งหมด)

1. citation เพี้ยน: D1 → `auth.prisma:73-75` (ไม่ใช่ :83) · D2 mask → `public.js:28-43` (ไม่ใช่ :85-89)
2. D12 ขาดไฟล์ `interoperability-contracts.js` (import ที่ `interoperability-core.js:15`) — เพิ่มใน File Structure แล้ว
3. bundle submit: select `:333` ต้องมี entityId · guard+log ก่อน `$transaction` `:380` (advisory lock `middleware/audit-logger.js:505-506` ห้ามซ้อน tx, FAILURE row ต้องรอด rollback) — Task C2 Step 2b
4. `auditLogger.log()` กลืน error (`:526-541`) — best-effort โดยออกแบบ, จดใน D10
5. bundle create `:177,:239` link app ที่มีอยู่ ไม่ใช่จุด seed entityId — แก้ Task C2 Step 2
6. `certificate-service.js` export singleton — attach method เข้า instance · farm include entity ครบ 3 ทาง return — Task A3
7. renewal ไม่ set submitterId (`renewal-service.js:312-317`) — D3 fallback รองรับ, จดไว้

## ตรวจแล้วไม่พบปัญหา (สิ่งที่ตรวจ)

- SQL A2: `@@map` ครบสี่ตาราง (`certificates` certification.prisma:142, `applications` application.prisma:227, `entities` entity.prisma:115, `farms` farm.prisma:106) · คอลัมน์ camelCase quoted ถูก · `UPDATE...FROM` ใช้ได้
- D1/D3/D9/D10/D11/D13 ตรงโค้ดจริง (`'SYSTEM'` ที่ workflow-handler-deps.js:63 / auditor-handler-deps.js:48 · canonical JSON certificate-service.js:47 · `HASH_PAYLOAD_VERSION=2` audit-logger.js:94 · provider bypass revision-deadline.js:258)
- ชุด endpoint D4 ครบ (grep ทุก submit route + wizard mount ใต้ flag ที่ไม่มีใครตั้ง — routes/api/index.js:368-370) · alias mounts ชี้ router เดียวกัน
- reader ครบ (certificates.js / interoperability-resolve.js ไม่ expose applicantName · trust record มีแค่ farm name)
- tier: prisma = C_STRUCTURAL (`tier-check.sh:59-60`) ทั้ง 3 PR เป็น Tier C จริง · PR-B/PR-C ขนานได้หลัง PR-A
