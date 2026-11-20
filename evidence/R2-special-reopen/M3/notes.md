# M3 — round counter ต่อ stage (append-only) + SSOT เลข 5 — 2026-08-03

> **หัวไฟล์ — ที่มาของเอกสารนี้ (อ่านก่อน)**
>
> **notes.md ฉบับนี้เขียนย้อนหลัง ไม่ใช่บันทึกสดระหว่างทำ M3.**
>
> implementer ที่ทำ M3 (`10bd568b`) **ตายกลางคัน (เครดิตโมเดลหมด)** จึง commit งานไป
> โดยไม่ได้เขียน notes.md — evidence pack เหลือแค่ `red-output.txt` + `test-output.txt`
> (auditor จับเป็น F3: `audit-report.md:38-42, 81`).
>
> ผู้เขียนไฟล์นี้คือ **implementer ของ fix cycle 1/3** ซึ่ง **ไม่ได้อยู่ในเหตุการณ์ตอน M3**
> เนื้อหาส่วน "M3 ทำอะไร" ทั้งหมด **reconstruct จากสองแหล่งเท่านั้น**:
> 1. โค้ดที่ commit ไว้จริง (diff `2375ce2c..10bd568b`) — อ่านเอง
> 2. `evidence/R2-special-reopen/M3/audit-report.md` — ผลตรวจของ auditor
>
> ดังนั้น **ห้ามอ่านส่วน §1 เป็นคำให้การของคนทำ** ไม่มีบันทึกเจตนา ไม่มีลำดับความคิด
> ระหว่างทำ ไม่มีเหตุผลที่คนทำเลือกทางนั้น — สิ่งเหล่านั้น **สูญไปแล้ว** ถ้าไฟล์นี้เขียน
> อะไรที่เดาเจตนา = แต่งเรื่อง (CLAUDE.md Law 3.2) จึงเขียนเฉพาะ "โค้ดทำอะไร" ไม่ใช่
> "คนทำคิดอะไร"
>
> §2 (fix cycle) เป็นบันทึกสดของงานรอบนี้จริง — แยกส่วนกันชัดเจน

Spec source: `evidence/R2-special-reopen/final-requirements.md` ข้อ 2 verbatim
("นับเลขครั้งต่อ stage — reset ทุกรอบ วนไม่จำกัดครั้ง") · `decisions-final.md` แผน M3 ·
`gap-report.md` ตาราง ข้อ 2 (C-3: ไม่มี counter ต่อ stage)
Branch: `feat/r2-m3-round-counter` (stack บน M2 `2375ce2c`)

---

## §1 — M3 ทำอะไร (reconstruct จากโค้ด + audit report, ไม่ใช่บันทึกสด)

### 1.1 ตารางใหม่ CorrectionRound (EXPAND, Law 3.10)

- `apps/backend/prisma/schema/correction-round.prisma` (ไฟล์ใหม่, 53 บรรทัด) —
  `model CorrectionRound`, `@@unique([applicationId, stage, roundNo])`,
  `@@map("correction_rounds")`, `organizationId String` (required ไม่ใช่ `String?`),
  **ไม่มี `updatedAt`** เพราะ row ถูกเขียนครั้งเดียวแล้วไม่แตะอีก
- `apps/backend/prisma/migrations/20260803122000_add_correction_rounds/migration.sql` —
  EXPAND ล้วน: `CREATE TABLE IF NOT EXISTS` + index + FK บนตารางใหม่, มี `BEGIN;`/`COMMIT;`,
  CHECK `"stage" IN ('DOC_REVIEW', 'FIELD_AUDIT')`, rollback comment, ไม่มี
  DROP/ALTER COLUMN/UPDATE/DELETE
- `RevisionDeadline` (ตารางเดิม) **ไม่ถูกแตะ** — expand ก่อน contract ทีหลัง
- `apps/backend/services/tenant-prisma-extension.js:100` — `'CorrectionRound'` เข้า
  `TENANT_SCOPED_MODELS`

### 1.2 Round ledger — writer จุดเดียว

- `apps/backend/services/decision-letter-service.js:88-134` — `roundNo` =
  `count({where:{applicationId, stage: roundStage}}) + 1` นับผ่าน **`tx` ตัวเดียวกัน**
  กับ decision + letter, แล้ว `correctionRound.create` ที่ `:116`
- DOC_REVIEW / FIELD_AUDIT เป็นตัวนับ **อิสระกัน** (pin `correction-round.test.js:130-146`)
- **ไม่มี cap** ที่ใดเลย (D-2 ยกเลิกกติกา "แก้ไม่เกิน 3 ครั้ง")
- ชน unique key → P2002 → throw ข้อความชัดที่ `:127-134` **ไม่ silent** →
  transaction ทั้งก้อนล้ม caller ยิง decision ใหม่ (Postgres abort tx แล้ว retry ใน tx ไม่ได้)
- append-only: ไม่มี `update/updateMany/upsert/delete/deleteMany` ต่อ `correctionRound`
  ที่ใดในทั้ง backend (FINAL ข้อ 4)

### 1.3 Stage vocabulary SSOT

- `apps/backend/shared/correction-round-stage.js` (ไฟล์ใหม่) —
  `roundStageForLetterStage()` ที่ `:47-54` แปลง letter stage → round stage
  (`DOC_REVIEW`→`DOC_REVIEW`, `FIELD_AUDIT_CAR`→`FIELD_AUDIT`, อื่น → throw)
- จุดเรียกครบ 3 surface: `workflow-transitions-handler.js:434` ·
  `auditor-audit-decision-handler.js:254` · `application-workflow-handlers.js:204-206`

### 1.4 เลขครั้งเป็นองค์ประกอบบังคับตัวที่ 5 ของจดหมาย

- `apps/backend/shared/correction-letter-template.js:72-74` — `roundNo` ที่หายไป/ผิดชนิด
  = **refuse (throw)** ทั้ง `{}` / `0` / `-1` / `1.5` / `'2'` — D-8: no letter, no transition
- ข้อความ "การแก้ไขครั้งที่ N ของขั้นตอน…" นิยามที่ template ไฟล์เดียว

### 1.5 SSOT เลข 5 (ส่วนที่ M3 ทำสำเร็จ)

ยุบ literal `5` ให้อ่านจาก `config/business-rules.js`
`PAYMENT.REVISION_DEADLINE_BUSINESS_DAYS` ที่: `workflow-handler-deps.js` ·
`workflow-transitions-handler.js` (CAR_SLA_DAYS derive จาก REVISION_SLA_DAYS) ·
`application-workflow-handlers.js` · `car-deadline-service.js`

**ส่วนที่ M3 ทำไม่ครบ → กลายเป็น F2 ของ audit → เก็บใน §2 ข้างล่าง**

### 1.6 สิ่งที่ auditor ยืนยันแล้วว่าถูกต้องจริง (mutation-verified)

จาก `audit-report.md:46-73` — orchestrator ไม่ต้องรื้อซ้ำ:

- **atomicity D-8 พิสูจน์ด้วย mutation จริง** (auditor แก้แล้ว revert):
  mutation A กลืน error → แดง 2 tests · mutation B ย้าย write ออกนอก tx → แดง
  **11 tests ครบทั้ง 3 surface ใน 3 suites** → pin มีชีวิตจริง ไม่ใช่ pin หลอก
- round ledger / stage mapping / migration EXPAND / tenant scoping — ตรวจแล้วผ่าน
- แก้ pin M2 เป็น **strengthening ไม่ใช่ reduction**: test count เท่าเดิมทุกไฟล์
  (atomic-decision-letter 15→15, provider-cms-workflow 15→15,
  workflow-reject-deadline-holiday 6→6) และ
  `workflow-reject-deadline-holiday.test.js:115-119` เปลี่ยน literal-pin เป็น config-pin
  **พร้อมเพิ่ม** negative assertion (Law 3.7 ไม่ถูกละเมิด)

### 1.7 Born-green ของ M3 — 4 ตัวนี้เป็น **pin ไม่ใช่ fix** (Law 3.11)

auditor จับได้ว่า M3 มี 4 tests ที่ **เขียวตั้งแต่เกิด** และ **ไม่มีที่ไหนประกาศไว้เลย
เพราะไม่มี notes.md** (`audit-report.md:67`) — ประกาศให้ชัดตรงนี้ พร้อมหลักฐานว่าเขียว
ตั้งแต่ RED run (บรรทัดใน `M3/red-output.txt`):

| test | file:line | เขียวใน red-output.txt |
|---|---|---|
| the round-line Thai copy is defined ONLY in the letter template SSOT (Law 3.5/3.6) | `correction-round.test.js:239` | บรรทัด 30 ✓ |
| no backend .js file mutates correctionRound (update/upsert/delete are forbidden) | `correction-round.test.js:273` | บรรทัด 35 ✓ |
| RevisionDeadline stays untouched (EXPAND, not contract — Law 3.10) | `correction-round.test.js:317` | บรรทัด 40 ✓ |
| canonical value unchanged: PAYMENT.REVISION_DEADLINE_BUSINESS_DAYS === 5 | `correction-round.test.js:364` | บรรทัด 43 ✓ |

**ทั้ง 4 ตัวไม่ได้แก้อะไรเลย — เป็น pin ล้วน**: มันตรึงสภาพที่ถูกอยู่แล้วก่อน M3 ไม่ให้
ถอยหลัง (ห้ามมีที่สองที่สะกด Thai copy / ห้ามมีใครไป mutate ledger / ห้าม contract
ตารางเดิม / ค่า canonical ต้องยังเป็น 5) การนับมันเป็นผลงานของ M3 = แต่งเรื่อง

---

## §2 — fix cycle 1/3 (บันทึกสดของรอบนี้)

ที่มา: `evidence/R2-special-reopen/M3/audit-report.md` — **FAIL 3 ข้อ, ไม่มี CRITICAL**
(ไม่แตะเงิน / security / data integrity) แกนหลักทั้งหมดของ M3 auditor ยืนยันว่าถูกต้อง

### F1 — CI gate `check-thai-copy-style` แดง (BLOCKING)

- **อาการ**: `apps/backend/shared/correction-letter-template.js:73` — throw message มี
  อักษรไทย (`FINAL ข้อ 2`) + em dash. gate อ่าน string literal ที่ **มีอักษรไทย** เป็น
  "copy ที่ผู้ยื่นคำขอจะอ่าน" แล้วบังคับกฎ em dash ของ `.claude/skills/thai-ui-copy`
  ทับลงไป. throw ตัวอื่นในไฟล์เดียวกัน (หลังแก้แล้วอยู่ที่ `:69`, `:83`, `:94`)
  เป็นอังกฤษล้วนจึงรอด. gate นี้เป็น **required step** ที่ `.github/workflows/ci.yml:123`
  (job `lint`, ไม่มี `continue-on-error`) → M3 ถูก commit ทั้งที่ CI จะแดง
- **แก้**: `correction-letter-template.js:72-78` (throw อยู่ `:78`) — ทำ message เป็น **อังกฤษล้วน**
  `FINAL ข้อ 2` → `FINAL item 2` (คง citation ไว้ครบ คง em dash ได้เพราะไม่ใช่ Thai copy)
  พร้อมคอมเมนต์ 5 บรรทัดเหนือมันอธิบายว่าทำไมต้องอังกฤษ — เพื่อคนถัดไปไม่เผลอเขียน
  ไทยกลับเข้ามาแล้วโดน gate อีกรอบ
- **ไม่ได้แก้ gate/skill** (Law 3.12) — แก้ที่โค้ดฝั่งเดียว
- **ตรวจตัวอื่นในรอบเดียวตามที่ dispatch สั่ง**: grep throw/Error ทุกตัวที่ M3 เพิ่มใน
  diff `2375ce2c..10bd568b` → `decision-letter-service.js:130` และ
  `correction-round-stage.js:49` มี em dash แต่ **อังกฤษล้วน ไม่มีอักษรไทย** → gate
  ไม่จับ (ถูกต้องตามกฎ: กฎนี้เป็นเรื่อง "ไทยอ่านยังไง" ไม่ใช่เรื่องอังกฤษ). ส่วน Thai +
  em dash ที่เหลือในไฟล์ M3 อยู่ใน **comment ทั้งหมด** ซึ่ง gate blank ทิ้งก่อนสแกน
  (`check-thai-copy-style.js:92-165`) → ยืนยันด้วยการรัน gate: เหลือ **0 issue**

### F2 — SSOT เลข 5 ไม่ครบ + pin scope แคบจนมองไม่เห็น

**(ก) ขยาย pin ก่อน (RED-first, Law 3.11)** — `correction-round.test.js:407-432`

pin เดิม (`:394-406` ก่อนแก้) วนแค่ `['services','routes','jobs']` และ match แค่
`SLA_DAYS = <n>` ทั้งที่ชื่อ test อ้างว่า "no SLA_DAYS = &lt;n&gt; literal" →
**แคบทั้งสองแกน** ขยายเป็น:
- dirs (`:407`): `['services','routes','jobs','scripts','utils']`
- pattern (`:410`): `/\b(?:SLA_DAYS|slaDays|businessDays)\s*=\s*\d/` — ครอบ default-parameter
  spelling ด้วย (และครอบ `@param` JSDoc default ที่สะกดเลขซ้ำ)

รัน **ก่อนแตะ source สักไฟล์** → **แดงจริง จับครบ 3 จุดที่ audit ระบุ**
(หลักฐานเต็ม: `evidence/R2-special-reopen/M3/red-output-fix1.txt`):

```
● SSOT เลข 5 (Law 3.5/3.6) › grep-pin: no revision-SLA day literal in
  services/routes/jobs/scripts/utils outside the waiver family (L4)

    - Array []
    + Array [
    +   "scripts/ops/identify-wrongful-expiry-cohort.js",
    +   "scripts/ops/restamp-revision-deadlines.js",
    +   "utils/working-days.js",
    + ]
Tests: 3 failed, 15 skipped, 9 passed, 27 total
```

**(ข) L4 waiver — exclude อย่างเปิดเผย ไม่ใช่ regex เงียบ ๆ**

`services/waiver-reopen-service.js:41` **ห้ามแตะ** (ธง L4, operator-frozen รอคำวินิจฉัย
ทางกฎหมาย) — และมีอีก 2 ไฟล์ในตระกูลเดียวกัน (`jobs/waiver-sla-escalation-job.js:29`,
`scripts/ops/waiver-anomaly-report.js:51`) ที่โผล่ขึ้นมาเมื่อขยาย pin เข้า `scripts/`

เพิ่ม **test ตัวใหม่** `correction-round.test.js:434-448` ที่ assert รายชื่อ 3 ไฟล์นี้
**ตรง ๆ**: ถ้าวันหนึ่ง waiver ถูกยุบ/ย้าย test นี้จะแดงและบังคับให้คนแก้ตัดสินใจ
อย่างรู้ตัว แทนที่ข้อยกเว้นจะค่อย ๆ กลายเป็นรูโหว่ที่ไม่มีใครจำได้ว่าทำไมมี

> **ประกาศ born-green (Law 3.11)**: test ตัวนี้ (`the L4 waiver exception is the ONLY
> thing the pin skips, and it is still there`) **เขียวตั้งแต่เกิด — เป็น pin ไม่ใช่ fix**
> เห็นได้ใน `red-output-fix1.txt:49` (`✓` ในรันเดียวกับที่อีก 3 ตัวแดง) มันไม่ได้แก้
> อะไร มันตรึงข้อยกเว้นที่มีอยู่แล้วให้มองเห็นได้

**(ค) แก้ทั้ง 3 จุด**

1. `scripts/ops/restamp-revision-deadlines.js:44-50` — `const SLA_DAYS = 5;` →
   `PAYMENT.REVISION_DEADLINE_BUSINESS_DAYS` (`:48` require, `:50` const).
   **จุดนี้สำคัญที่สุดในสามจุด**: script นี้
   **เขียนจริง** ด้วย `--apply` (restamp `revisionDue` + formData twins) — ถ้ามันถือเลข
   คนละตัวกับที่ระบบบังคับใช้ มันจะ restamp ให้เป็นเลขที่ระบบเลิกใช้แล้ว ซึ่งคือ drift
   ชนิดเดียวกับที่ script นี้ถูกสร้างมาซ่อมพอดี. แก้คอมเมนต์หัวไฟล์ `:15` ที่สะกด
   `addWorkingDays(requestedAt, 5)` เป็น `SLA_DAYS` ด้วย
2. `scripts/ops/identify-wrongful-expiry-cohort.js:29-34` — เหมือนกัน (read-only report
   แต่ถ้าเลขต่างกันมันจะชี้ชื่อ applicant ผิดชุด)
3. `utils/working-days.js` — **ดูหัวข้อถัดไป**

ทั้ง (1) และ (2) มี positive pin คุมไว้ที่ `correction-round.test.js:450-459` (ต้องมี
ทั้ง `require(config/business-rules)` และ `PAYMENT.REVISION_DEADLINE_BUSINESS_DAYS`)
— pin นี้แดงจริงก่อนแก้ เห็นที่ `red-output-fix1.txt:50`

### Design decision: F2(3) — `utils/` import `config/` หรือคงข้อยกเว้น

dispatch สั่งให้ **ประเมินก่อนแก้**: ถ้า import ทำให้เกิด circular dependency หรือผิดทิศ
layering ให้คงไว้ + คอมเมนต์ + allowlist ใน pin; ถ้า import ได้สะอาดก็แก้

**ตัดสินใจ: import — เพราะสะอาดจริง ตรวจแล้ว ไม่ใช่เดา**

หลักฐาน 4 ข้อที่ตรวจเองก่อนตัดสิน:

1. **ไม่มีทางเกิด circular dependency** — `config/business-rules.js` มี `require()`
   **ศูนย์ตัว** (`grep -n "require(" config/business-rules.js` → ไม่มี output, exit 1)
   โมดูลที่ไม่ import ใครเลย เข้าวงกลมไม่ได้ ไม่ว่าจะฝั่งไหน
2. **ไม่มี lint rule ห้าม** — `apps/backend/eslint.config.js` มี module-boundary rule
   ตัวเดียวคือ `gacp/no-cross-module-internal` (`:65`) ซึ่งคุม `modules/<x>/internal/*`
   ไม่เกี่ยวกับ `utils/` → `config/` เลย
3. **หัวไฟล์ประกาศไว้เองอยู่แล้ว** — `utils/working-days.js:9` เขียนมาก่อนงานนี้ว่า
   *"Source of truth: apps/backend/config/business-rules.js
   (PAYMENT.REVISION_DEADLINE_BUSINESS_DAYS)"* — การ import ทำให้ประโยคนี้**เป็นจริง**
   แทนที่จะเป็นความตั้งใจที่โค้ดข้างล่างไม่ทำตาม
4. **ทิศ layering ไม่ผิด เพราะแยกที่ระดับ function ไม่ใช่ระดับไฟล์** — `calculateRevisionDeadline`
   เป็นฟังก์ชันที่**ตั้งชื่อตามกฎธุรกิจ**อยู่แล้ว (ชื่อมีคำว่า Revision) การให้มันอ่านกฎ
   ธุรกิจจึงตรงทิศ ส่วน calendar primitive แท้ ๆ (`addWorkingDays`, `isWorkingDay`,
   `countWorkingDaysBetween`) **ยังรับ day count จาก caller เหมือนเดิม ไม่รู้จัก revision
   เลย** — เขียนล็อกไว้ในคอมเมนต์ `utils/working-days.js:19-34` ให้คนถัดไปเห็นเส้นแบ่ง
   (`:34` require, `:317-320` signature ที่ default อ่าน config)

ทางเลือกที่ **ไม่** เอา และเหตุผล: คง `businessDays = 5` ไว้ + allowlist ใน pin —
แปลว่ายอมให้มี "แหล่งที่สอง" ที่ยังมีชีวิต caller คนไหนที่เรียกโดยไม่ใส่ argument จะได้
เลขเก่าเงียบ ๆ หลัง config ขยับ ซึ่งคือ failure mode ของ Law 3.6 เป๊ะ ๆ — และ deliverable
ของ M3 คือ "ยุบให้เหลือ config เดียว" การ allowlist คือการประกาศว่าทำไม่สำเร็จ ทั้งที่
ทำสำเร็จได้

**พฤติกรรมเท่าเดิม พิสูจน์ 2 ชั้น**:
- runtime: `calculateRevisionDeadline(start).revisionDue` = `2026-08-10T16:59:59.999Z`
  ทั้งตอนใช้ default และตอนส่ง `5` ตรง ๆ, `workingDaysAdded` = 5
- test ใหม่ `correction-round.test.js:461-475` assert ว่า default === `addWorkingDays(start,
  PAYMENT.REVISION_DEADLINE_BUSINESS_DAYS)` (เทียบกับ config ไม่ใช่เทียบกับเลข 5 ที่
  พิมพ์ซ้ำ — ไม่งั้นก็เป็น shadow source ตัวใหม่ในไฟล์ test เอง)
- suite เดิม `__tests__/unit/working-days.test.js` **24/24 ผ่าน** รวมถึงตัวที่ชื่อ
  `returns correct deadline with default 5 working days` (ไม่ได้แตะไฟล์ test นั้น)

**เกร็ดที่ควรบันทึก — pin จับคอมเมนต์ของตัวเอง**: ตอนแรกเขียนคอมเมนต์อธิบายว่า
"ทางเลือกคือคง `businessDays = 5` ไว้" แล้ว pin แดงทันทีเพราะมันอ่าน raw text และ
คอมเมนต์นั้น**สะกดเลขซ้ำ** — เลือก**เขียนคอมเมนต์ใหม่ให้ไม่สะกดเลข** ไม่ใช่ทำ pin ให้
ข้ามคอมเมนต์ เพราะคอมเมนต์คือที่ที่เลขค้างเก่าชอบไปซ่อนที่สุด (การทำ pin ให้ตาบอด
เพื่อให้ตัวเองผ่าน = ลดพลัง assertion, Law 3.7)

### F3 — evidence pack

- ไฟล์นี้ (`notes.md`) — พร้อมหัวไฟล์ประกาศว่าเขียนย้อนหลัง
- `gates.txt` — output **จริง** ของ gate ทั้ง 5 + suite `working-days` + full backend suite
  (รันเองทั้งหมดในรอบนี้ ไม่ได้ก๊อปมาจากที่ไหน)
- `red-output-fix1.txt` — RED ของ pin ที่ขยายในรอบนี้ (ไม่ทับ `red-output.txt` ของ M3 เดิม)

---

## §3 — Gates (รายละเอียดเต็มใน `gates.txt`)

| # | gate | ผล |
|---|---|---|
| 1 | jest 6 suites | **78 passed / 78** (M3 เดิม 75 → +3 test ที่เพิ่มรอบนี้ ไม่มีตัวไหนหาย) |
| 1b | jest `working-days.test.js` (ไฟล์ที่แตะ) | **24 passed / 24** |
| 2 | `scripts/probes/ratchet.sh` | **PASS** hardcode=43 todo=59 env-direct=169 dup-source=4 — ไม่เพิ่มสักตัว |
| 3 | `npx eslint` 5 ไฟล์ที่แตะ | **0** (exit 0, ไม่มี output) |
| 4 | `check-thai-copy-style.js` | **OK exit 0** ← gate ที่ M3 ทิ้งไว้แดง |
| 5 | `check-banned-terms.js` | **Repository scan passed exit 0** |

**full backend suite**: 527 suites passed / 1 failed / 5 skipped — 7088 passed, 1 failed
ตัวที่แดงคือ `__tests__/unit/dataset-export-service.test.js:81` (`Prisma.dmmf.datamodel`
undefined เพราะ prisma client ยังไม่ generate ใน container นี้) — **pre-existing
ไม่เกี่ยวกับ diff นี้** พิสูจน์ด้วยการ `git stash -u` แล้วรันบน tree สะอาดที่ `84ed4f3e`:
แดงเหมือนกัน บรรทัดเดียวกัน (1 failed / 11 passed) รายงานตามจริง ไม่ route around
(Law 3.8) — ตรงกับที่ auditor เจอ (`audit-report.md:65`) และที่มีบันทึกไว้แล้วใน
`BACKLOG-FOUND.md`

---

## §4 — ที่ไม่ได้แตะ (โดยตั้งใจ)

`services/waiver-reopen-service.js` + ตระกูล waiver ทั้งหมด (L4) · cron · reminder ·
schema/migration ที่ M3 วางไว้ · gate/skill/probe (Law 3.12) · `red-output.txt` และ
`test-output.txt` ของ M3 เดิม (ไม่ทับหลักฐานเก่า) · ไม่มี push

## §5 — เจอนอก scope

`shared/correction-round-stage.js:27` export `CORRECTION_ROUND_STAGES` (ที่ `:57`)
ไม่มี consumer และไม่มี test อ้าง — auditor จับไว้แล้วว่า non-blocking
(`audit-report.md:71`) **ไม่แก้ในรอบนี้** เพราะอยู่นอก 3 findings — จดลง
`BACKLOG-FOUND.md`

---

## §6 — CORRECTION (fix cycle 2/3, 2026-08-03) — §2 F2 (ก) กล่าวไม่ครบ

> ย่อหน้านี้ **เพิ่มต่อท้าย ไม่ลบของเดิม** ข้อความ §2 ที่ `notes.md:139-148` ยังอยู่
> ครบทุกตัวอักษร รวมทั้งประโยคที่ผิดพลาด — เพื่อให้อ่านย้อนได้ว่าตอนนั้นเขียนอะไรไว้

### (ก) สิ่งที่ §2 บอก vs สิ่งที่เกิดขึ้นจริง

`notes.md:143-148` เขียนว่า pin เดิม "**แคบทั้งสองแกน**" (dirs + pattern) แล้วบอกว่า
รอบ fix 1 ขยายทั้งสองแกน — **จริงเฉพาะสองแกนนั้น** แต่ประโยคนี้กล่าวไม่ครบ เพราะ
pattern ตัวใหม่ที่รอบ fix 1 ใส่เข้าไป (`correction-round.test.js:410` ตอนนั้น)

```js
/\b(?:SLA_DAYS|slaDays|businessDays)\s*=\s*\d/
```

**แคบลงกว่าเดิมบนแกนที่สาม** คือแกน **prefix ของชื่อตัวแปร**: `\b` ที่นำหน้า
`SLA_DAYS` ต้องการ word boundary แต่ `_` เป็น word character → ใน `REVISION_SLA_DAYS`
และ `CAR_SLA_DAYS` **ไม่มี boundary** ตรงหน้า `SLA_DAYS` → regex ไม่จับ

สองชื่อที่หลุดคือสองชื่อที่ repo ใช้จริง และเป็นสองตัวที่ M3 เพิ่งย้ายมาอ่าน config
ด้วยตัวเอง — `routes/api/provider/handlers/workflow-handler-deps.js:44` (`REVISION_SLA_DAYS`)
และ `routes/api/provider/handlers/workflow-transitions-handler.js:44` (`CAR_SLA_DAYS`)
pin ตัวนี้มีหน้าที่จับ "แหล่งที่สองใหม่ที่โผล่ที่ไหนก็ได้" จึงกลายเป็นตาบอดต่อรูปแบบ
ที่มีโอกาสเกิดซ้ำมากที่สุด = **assertion reduction ที่ ship มากับคอมมิตซึ่งอ้างว่ามาเสริม
assertion** (Law 3.7) และคอมมิต `c0ab377b` ไม่ได้กล่าวถึงเลย (Law 3.9)

### (ข) auditor รอบ 2 จับได้ด้วย mutation สองทาง

`audit-report-round2.md` finding F4 — พิสูจน์ทั้งขาไปและขากลับ ไม่ใช่อ่าน regex เอาเอง:

1. เติม `const REVISION_SLA_DAYS = 5;` ลง `services/car-deadline-service.js` →
   pin ของ fix 1 **เขียว 27/27** (ควรแดง)
2. เอา pin เวอร์ชันก่อน fix 1 มารัน (`git show 7192f47d:apps/backend/__tests__/unit/correction-round.test.js`
   บรรทัด `:402` = `/SLA_DAYS\s*=\s*\d/` **ไม่มี `\b`** จึงจับ `REVISION_SLA_DAYS = 5` ได้)
   กับ mutation ตัวเดียวกัน → **แดง**

ข้อ 2 คือสิ่งที่ทำให้เถียงไม่ได้ว่าเป็นการเสีย coverage จริง ไม่ใช่ pin ที่ไม่เคยครอบ

### (ค) fix รอบ 2 แก้อย่างไร

`correction-round.test.js:408-417` — pattern ใหม่ (regex อยู่ `:417`, คอมเมนต์อธิบาย `:408-416`):

```js
/\b\w*(?:SLA_DAYS|[Ss]laDays|[Bb]usinessDays)\s*=\s*\d/
```

- `\b\w*` แทน `\b` เปล่า: `\b` ยึดที่ **หัวคำ** แล้วให้ `\w*` กิน prefix (`REVISION_`,
  `CAR_`, `car`) ก่อนถึง suffix ที่ต้องการ → ครอบ prefix ทุกแบบโดยไม่ต้องไล่ชื่อทีละตัว
- suffix ยังผูกกับคำว่า SLA/business-days อยู่ → `days = 5`, `WORKING_DAYS = 5`,
  `graceDays = 5` **ไม่ถูกจับ** (นี่คือขาที่กัน false positive; วิธีแก้ false positive
  ที่ถูกคือแก้ pattern **ไม่ใช่ใส่ allowlist**)
- `[Ss]laDays` / `[Bb]usinessDays` รับ camelCase ที่มี prefix (`carSlaDays`,
  `totalBusinessDays`) ซึ่งเป็นการสะกดที่ JS ฝั่ง handler มีสิทธิ์ใช้พอกัน

**และคราวนี้ตัว pattern เองถูก pin** — `correction-round.test.js:428-471` เพิ่ม test
`SLA_LITERAL flags every prefixed spelling and no bare day count` (`:466`) ที่ยิง regex ตรง ๆ
ด้วยตาราง 13 เคส (7 ต้องจับ / 6 ห้ามจับ) เหตุผล: pin ที่เดินไฟล์ **รายงานความตาบอด
ของตัวเองไม่ได้** — ถ้า regex แคบลงอีก มันจะเขียวเงียบ ๆ เหมือนรอบที่แล้ว

### (ง) ตารางความครอบคลุม — ก่อน/หลัง fix 2

รันจริง (`red-output-fix2.txt` STEP 1 = แดง 3 บรรทัด, STEP 2 = เขียว 28/28):

| การสะกด | fix 1 (`\b...`) | fix 2 (`\b\w*...`) | ใช้จริงที่ไหน |
|---|---|---|---|
| `const REVISION_SLA_DAYS = 5;` | ไม่จับ | **จับ** | `workflow-handler-deps.js:34` |
| `const CAR_SLA_DAYS = 5;` | ไม่จับ | **จับ** | `workflow-transitions-handler.js:33` |
| `const SLA_DAYS = 5;` | จับ | จับ | `waiver-reopen-service.js:41` ตระกูล waiver (L4, excluded โดยตั้งใจ) |
| `businessDays = 5` (default param) | จับ | จับ | `utils/working-days.js:319` (ตอนนี้อ่าน config แล้ว — coverage ที่ fix 1 เพิ่งเพิ่ม ต้องไม่เสีย) |
| `let carSlaDays = 5;` | ไม่จับ | **จับ** | ยังไม่มีในโค้ด — กันไว้ล่วงหน้า |
| `const days = 5;` / `WORKING_DAYS = 5` / `graceDays = 5` | ไม่จับ | ไม่จับ | ต้องไม่จับ (false positive) |

ยืนยันปลายทางด้วย mutation ที่ไฟล์จริง ไม่ใช่แค่ระดับ regex: เติม
`const REVISION_SLA_DAYS = 5;` ลง `services/car-deadline-service.js` → grep-pin **แดง
พร้อมชื่อไฟล์** `["services/car-deadline-service.js"]` → revert แล้ว md5 กลับเท่าเดิม
(`red-output-fix2.txt` STEP 3-5)

### (จ) ขอบเขตที่ pattern นี้ยัง **ไม่** ครอบ (พูดไว้ก่อน ดีกว่าให้ audit รอบหน้าจับ)

pin ตัวนี้ยึดรูปแบบ `<identifier> = <ตัวเลข>` เท่านั้น — การสะกดแบบ **object key**
(`revisionSlaDays: 5`) ไม่ถูกจับโดย pin ทั่วไปตัวนี้ มีเพียง assertion เฉพาะไฟล์ที่
`correction-round.test.js:385` ที่ดักรูปแบบนั้นในไฟล์เดียว (`application-workflow-handlers.js`)
รอบนี้ **ไม่ขยายแกนนั้น** เพราะอยู่นอก F4 — ระบุไว้ตรงนี้เป็นหนี้ที่รู้ตัว ไม่ใช่ช่องที่ลืม

### (ฉ) ไฟล์ที่รอบ fix 2 แตะ

- `apps/backend/__tests__/unit/correction-round.test.js` — pattern + test ใหม่ (ไฟล์เดียว)
- `evidence/R2-special-reopen/M3/red-output-fix2.txt` (ใหม่), `gates.txt` (append), `notes.md` (§6 นี้)
- **ไม่แตะ source ใด ๆ** — F4 เป็นเรื่อง pin ล้วน ถ้าต้องแตะ source แปลว่าเข้าใจโจทย์ผิด
