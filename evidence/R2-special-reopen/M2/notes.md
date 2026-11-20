# M2 — atomic decision + จดหมาย (D-8) — 2026-08-03

Spec source: `evidence/R2-special-reopen/decisions-final.md` (D-8 verbatim + แผน M2) ·
`final-requirements.md` ข้อ 2-3 · `gap-report.md` ตาราง ข้อ 2/ข้อ 3.
Branch: `feat/r2-m2-atomic-letter` (stack บน M1 `45b66bf9`)

## ทำ (file:line)

1. **Template SSOT** — `apps/backend/shared/correction-letter-template.js` (ไฟล์ใหม่):
   `buildCorrectionLetter({applicationNumber, stage, items, message, dueAt})` →
   `{title, message, metadata}` ครบสี่องค์ประกอบ (ผลไม่ผ่าน+ระบุขั้นตอน /
   รายการประเด็น / กำหนดส่งวันที่ไทย พ.ศ. ผ่าน `utils/thai-format.formatThaiDateFull` /
   ช่องทางระบบออนไลน์) + `CORRECTION_LETTER_STAGE` vocab (`DOC_REVIEW`/`FIELD_AUDIT_CAR`)
   — จดหมายที่ขาดองค์ประกอบ (dueAt invalid / ไม่มี items+message / stage ไม่รู้จัก)
   = throw (D-8: no letter, no transition). ยังไม่มีเลขครั้ง (มาใน M3 ตามแผน)
2. **Mint orchestrator** — `apps/backend/services/decision-letter-service.js` (ไฟล์ใหม่):
   `mintCorrectionLetter({tx, healthId, ...})` — resolve ผู้รับผ่าน
   `findUserByHealthIdSecurely(healthId, {select:{id,organizationId}})`
   (รองรับ token/canonicalId path), ผู้รับ resolve ไม่ได้/ไม่มี tenant = throw;
   เขียนผ่าน M1 `createOfficialLetter` (`:79-88`) — ไม่กลืน error ทุกกรณี
3. **Surface 1 canonical** — `apps/backend/routes/api/provider/handlers/workflow-transitions-handler.js:404-433`
   (closure `mintDecisionLetter` สำหรับ REVISION_REQUESTED/CAR_PENDING) + `:449` และ
   `:458` (เรียกใน `$transaction` ทั้งสอง branch หลัง `writeApplicationStatus`) —
   lazy require กัน notification stack โหลดใน transition ที่ไม่มีจดหมาย
4. **Surface 2 auditor** — `apps/backend/routes/api/provider/handlers/auditor-audit-decision-handler.js:236-262`:
   tx เดิม (BE-T1) ขยายเป็น async block, MINOR/MAJOR → CAR_PENDING mint จดหมาย
   (items จาก findings: `nonConformity แนวทางแก้ไข: correctiveAction`, dueAt =
   `carDueAt` จาก `computeCarDueDate` เดิม) — notification อังกฤษเดิม `:285-307`
   คง best-effort หลัง commit
5. **Surface 3 reject** — `apps/backend/routes/api/applications/application-workflow-handlers.js:184-206`:
   mint หลัง `writeApplicationStatus` **ก่อน** comment/RevisionDeadline upsert
   ใน tx เดิม — จดหมายล้ม = upsert ไม่เคยถูกเรียก + status rollback
   (surface นี้เดิมไม่ส่งอะไรเลย — gap-report ข้อ 3ค)
6. **Tests** — `apps/backend/__tests__/unit/atomic-decision-letter.test.js` (15 tests):
   ต่อ surface: success (จดหมายผ่าน tx เดียวกัน + สี่องค์ประกอบ + BE year) /
   atomic-fail (letter โยน → 500 + tx reject + post-commit effect ไม่รัน) +
   SSOT grep-pin (สอง phrase template อยู่ไฟล์เดียว) + template unit 4 ตัว +
   pin ว่า 3 surface ไม่ spell official-letter literal (M1 pin คงศักดิ์สิทธิ์)
7. **Regression mock updates** (ไม่ลด assertion, test count เท่าเดิม):
   - `__tests__/integration/reject-handler-natid-scalar.test.js:39-49` — stub
     `decision-letter-service` (พฤติกรรมจดหมาย pin ในไฟล์ใหม่แล้ว)
   - `__tests__/integration/provider-cms-workflow.test.js:135-145` (user fixture
     ได้ `organizationId`) + `:166-176` (application fixture ได้ `healthId`) —
     suite นี้ exercise เส้นจดหมายจริง (real notification-service + real
     decision-letter-service ผ่าน prisma mock)

## RED → GREEN

- RED (`red-output.txt`): 13 failed ด้วย assertion จริง / 2 passed
- GREEN (`test-output.txt`): 15/15 + consolidated 26 suites 731/731

### Test เขียวแต่กำเนิด = PIN ไม่ใช่ fix (Law 3.11) — ประกาศ

1. `non-correction transition (DOC_APPROVED) mints NO letter (negative control)`
2. `PASS mints NO correction letter (negative control)`
   — ทั้งคู่ pin ว่า scope จดหมายจำกัดเฉพาะ correction decision

## Design decisions ที่ spec ไม่ระบุ (ตัดสินเอง + เหตุผล)

1. **REJECT (terminal) ไม่ mint จดหมาย correction** — สี่องค์ประกอบบังคับ
   "กำหนดส่ง+ช่องทางส่งแก้" ซึ่งไม่มีจริงสำหรับ terminal REJECT (ไม่มีนาฬิกา
   5 วัน) — จะใส่ = fabricate deadline; แจ้ง REJECTED เดิม (best-effort) คงอยู่
   ทั้งสอง surface → รายงานเป็นจุด spec ไม่ครอบ
2. **RevisionDeadline upsert ฝั่ง canonical คงเป็น post-commit side-effect**
   (`workflow-side-effects.js` ไม่แตะ) — dispatch ต้องการพิสูจน์ "letter ล้ม →
   deadline ไม่ขยับ" ซึ่งได้ผลเดียวกันเพราะ side-effect รันหลัง tx สำเร็จเท่านั้น
   (pin ใน test: `handleRevisionDeadlines` not called) — ย้าย upsert เข้า tx เป็น
   โครงสร้างของ M3 (per-round append) ไม่ทำครึ่งทางที่นี่
3. **ผู้รับ resolve ไม่ได้ = transition ล้ม (fail-closed)** — ตาม D-8 ตัวอักษร:
   จดหมายออกไม่ได้ (ไม่มีผู้รับ/ไม่มี tenant) = decision ต้องไม่ถูกบันทึก
   นาฬิกาต้องไม่เดิน — เดิม healthUserId null = ข้าม notification เงียบ ๆ
4. **จดหมายใช้ ท่าน (ไม่ใช่ คุณ)** — thai-ui-copy สงวน ท่าน ให้ surface
   ราชการ/กฎหมาย; จดหมายราชการในระบบเข้าเกณฑ์นั้น (สอดคล้อง copy จดหมายใน
   M1 test + notification เดิมถึงเกษตรกร)
5. **type `'WARNING'`, priority `'HIGH'`** — ตาม convention ของ revision notice
   in-app เดิม (`workflow-side-effects.js:220`); ไม่สร้าง NotifyType ใหม่
6. **ไม่พูด "5 วันทำการ" ในตัวจดหมาย** — ใช้วันที่ครบกำหนดจริง (พ.ศ.) เท่านั้น
   เพื่อไม่เพิ่มแหล่งเลข 5 แหล่งที่ 6 (gap-report ข้อ 2 SSOT — M3 จะยุบ)
7. **stage vocab แยกจาก workflow state** — จดหมายบอก "ขั้นตอนที่ตก" ไม่ใช่ state
   ภายใน; canonical CAR / auditor CAR / reject FIELD_CAR ทุกทาง map เข้า
   `FIELD_AUDIT_CAR` เดียว

## จุดที่ spec ไม่ครอบ (รายงาน ไม่แตะ)

1. terminal REJECT ไม่มีนิยามจดหมาย (ดู design decision 1)
2. auditor handler ยังส่ง notification best-effort เป็นภาษาอังกฤษ (`:285-307`)
   — จดหมายไทยทางการมีแล้วใน tx; การแปล notice เดิมไม่อยู่ใน mandate M2
3. email/SMS ของจดหมาย: M1 contract ห้าม side channel ใน tx — spec M2 ไม่สั่ง
   ยิงหลัง commit เพิ่ม จึงยังไม่มี email ของตัวจดหมาย (in-app notice เดิมคงอยู่)

## Gates (ตามลำดับ dispatch)

1. jest: ไฟล์ใหม่ 15/15 + consolidated 26 suites 731/731 (test-output.txt)
2. `bash scripts/probes/ratchet.sh` → PASS hardcode=43 todo=59 env-direct=169 dup-source=4 (ไม่ขยับ)
3. ESLint 8 ไฟล์ที่แตะ → exit 0
4. `node scripts/ci/check-thai-copy-style.js` → OK (จดหมายไทยผ่าน em-dash/ไม้ยมก gate)
5. `node scripts/ci/check-banned-terms.js` → passed
