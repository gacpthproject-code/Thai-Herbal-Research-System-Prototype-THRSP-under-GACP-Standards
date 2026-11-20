# FAIL

ไม่มี CRITICAL (ไม่แตะเงิน / security / data integrity)

---

## F1 — BLOCKING: M3 ทำให้ CI gate แดง (regression จาก parent)

`/home/user/GACP-Certification-Application/apps/backend/shared/correction-letter-template.js:73`

```js
throw new Error('[CorrectionLetter] missing/invalid roundNo — a letter without its per-stage round number is refused (FINAL ข้อ 2 + D-8: no letter, no transition)');
```

string literal นี้มีอักษรไทย (`FINAL ข้อ 2`) + em dash → ละเมิดกฎ em-dash ของ `.claude/skills/thai-ui-copy` ที่ gate บังคับอยู่ (gate อ่านเฉพาะ string literal ที่มีอักษรไทย — ข้อความ throw เดิมของ M2 ที่บรรทัด 69/78 เป็นอังกฤษล้วนจึงไม่โดน)

- gate นี้เป็น **required step** ที่ `/home/user/GACP-Certification-Application/.github/workflows/ci.yml:123` (job `lint`, ไม่มี `continue-on-error`)
- reproduce (รันเอง):
  - HEAD `10bd568b`: `node scripts/ci/check-thai-copy-style.js` → `[thai-copy-style] 1 issue(s)` **exit 1**
  - parent `2375ce2c` (git worktree + symlink `apps/web-app/node_modules`): → `[thai-copy-style] OK` **exit 0**
- ยืนยันว่าเป็น regression ของ commit นี้จริง ไม่ใช่หนี้เก่า — M2 audit เคยรัน gate นี้ผ่าน (`/home/user/GACP-Certification-Application/evidence/R2-special-reopen/M2/notes.md:96`)
- gate ตัวนี้คือ gate ที่ **ไม่มีอยู่ใน evidence pack ของ M3** (ดู F3) → งานถูก commit โดยไม่มีใครเห็นว่ามันแดง

## F2 — SSOT เลข 5 ไม่ครบ + pin ถูกจำกัด scope จนมองไม่เห็นที่ตกหล่น

deliverable M3 ที่ spec เขียนไว้ (`/home/user/GACP-Certification-Application/evidence/R2-special-reopen/decisions-final.md` แผน M3): "ยุบแหล่งเลข 5 ให้เหลือ config เดียว" — ยังไม่จริง

- `/home/user/GACP-Certification-Application/apps/backend/scripts/ops/restamp-revision-deadlines.js:45` `const SLA_DAYS = 5;` ใช้ที่ `:94` `addWorkingDays(requestedAt, SLA_DAYS)` — ตัวนี้ **เขียนจริง** (`--apply` restamp `revisionDue` + formData twins) ไม่ใช่ read-only
- `/home/user/GACP-Certification-Application/apps/backend/scripts/ops/identify-wrongful-expiry-cohort.js:30` `const SLA_DAYS = 5;` ใช้ที่ `:73`
- `/home/user/GACP-Certification-Application/apps/backend/utils/working-days.js:299` `function calculateRevisionDeadline(startDate, businessDays = 5, ...)` — default ที่สามของกฎเดียวกัน

pin ที่อ้างว่าคุม (`/home/user/GACP-Certification-Application/apps/backend/__tests__/unit/correction-round.test.js:394-406`) วน `['services','routes','jobs']` เท่านั้น → มองไม่เห็น `scripts/` และ `utils/` ทั้ง 3 จุดข้างบน เขียวโดยไม่ครอบสิ่งที่ชื่อ test อ้าง (`no SLA_DAYS = <n> literal`)

reproduce: `grep -rn "SLA_DAYS\s*=\s*5" --include=*.js apps/backend | grep -iv waiver`

(หมายเหตุ: `waiver-reopen-service.js:41` ยืนยันว่า **ไม่ถูกแตะ** จริงตาม L4 — ไม่อยู่ใน diff)

## F3 — Evidence pack ไม่ครบพอจะตรวจ

`/home/user/GACP-Certification-Application/evidence/R2-special-reopen/M3/` มีแค่ `red-output.txt` + `test-output.txt`
ขาด: `notes.md`, ผล `ratchet.sh`, ผล `check-thai-copy-style.js`, ผล `check-banned-terms.js`, ผล full-suite
เทียบ M2 ที่มีครบ (`M2/notes.md`, `M2/audit-report.md`) — CLAUDE.md §4 ข้อ 4 + §5 บังคับ evidence pack ครบ; gate ที่หายไปคือ gate ที่แดงพอดี (F1)

---

## สิ่งที่ตรวจแล้วผ่านจริง (รัน/อ่านเอง — orchestrator ไม่ต้องรื้อซ้ำ)

**แกน 1 round ledger** — `decision-letter-service.js:88-134`: `count({where:{applicationId, stage: roundStage}}) + 1` ผ่าน `tx` เดียวกัน; DOC_REVIEW/FIELD_AUDIT อิสระจริง (pin `correction-round.test.js:130-146`); ไม่มี cap ที่ใดเลย (grep `correctionRound` ทั้ง repo: writer เดียวคือ `decision-letter-service.js:116`, ไม่มี `update/updateMany/upsert/delete/deleteMany` ที่ไหน); P2002 → throw ข้อความชัด ไม่ silent (`:127-134`)

**แกน 2 atomicity D-8 (mutation-verified)** — ผมแก้จริงแล้ว revert แล้ว:
- mutation A (กลืน error: แทน catch ด้วย `void error`) → แดง 2 tests
- mutation B (ย้าย write ออกนอก tx: `outsideTx.correctionRound.create`) → แดง **11 tests ครบทั้ง 3 surface** (canonical / auditor CAR / PATCH reject) ใน 3 suites
pin มีชีวิตจริง

**แกน 3 stage mapping** — `roundStageForLetterStage` (`shared/correction-round-stage.js:47-54`) + จุดเรียกครบ 3: `workflow-transitions-handler.js:434` (CAR_PENDING→FIELD_AUDIT_CAR / REVISION_REQUESTED→DOC_REVIEW), `auditor-audit-decision-handler.js:254` (FIELD_AUDIT_CAR), `application-workflow-handlers.js:204-206` (FIELD_CAR→FIELD_AUDIT_CAR / อื่น→DOC_REVIEW; `decisionType` ถูก clamp ที่ `:63` เหลือ 2 ค่า) — ไม่มี surface ที่ 4 ที่เขียน REVISION_REQUESTED/CAR_PENDING โดยไม่ mint

**แกน 4 เลขครั้งในจดหมาย** — `correction-letter-template.js:72-74` throw จริงทั้ง `{}`/`0`/`-1`/`1.5`/`'2'`; แก้ pin M2 = **strengthening ไม่ใช่ reduction**: test count เท่าเดิมทุกไฟล์ (atomic-decision-letter 15→15, provider-cms-workflow 15→15, workflow-reject-deadline-holiday 6→6) และ `workflow-reject-deadline-holiday.test.js:115-119` เปลี่ยน literal-pin เป็น config-pin **พร้อมเพิ่ม negative assertion** `not.toMatch(/addWorkingDays\(now,\s*5\)/)`

**แกน 6 migration** — `20260803122000_add_correction_rounds/migration.sql` อ่านทั้งไฟล์: EXPAND ล้วน (CREATE TABLE IF NOT EXISTS + index + FK บนตารางใหม่ ไม่มี DROP/ALTER COLUMN/UPDATE/DELETE), CHECK `('DOC_REVIEW','FIELD_AUDIT')` ตรง vocab, idempotent, มี rollback comment, timestamp `20260803122000` ไม่ชนกับ `20260803120000_add_notification_kind` / `20260803120000_add_payment_reminder_log`; ชื่อ constraint/index ตรง convention ของ Prisma; ไม่แตะ `revision_deadlines`

**แกน 7 tenant** — `tenant-prisma-extension.js:100` `'CorrectionRound'` อยู่ใน `TENANT_SCOPED_MODELS`; `organizationId` required ใน schema; stamp explicit จาก `recipient.organizationId` (`decision-letter-service.js:124`) ไม่พึ่ง inject

**แกน 8 ของต้องห้าม** — diff 19 ไฟล์ ไม่มี waiver / revision-deadline-checker / payment-reminder / APPLICATION_EXPIRED template / `RevisionDeadline` schema; FK `RESTRICT` ใหม่ไม่ชนเส้นลบที่มีอยู่ (`pdpa-erasure-service.js:728` และ `job-scheduler.js:98` ยกเว้น OFFICIAL_LETTER อยู่แล้ว; ไม่มี hard-delete application ใน prod code)

**แกน 9 gates ที่รันเอง** — jest 6 suites **75/75 passed** (ตรง evidence) · full backend suite `npx jest --config jest.config.cjs`: **528 suites, 7085 passed, 1 failed** — ตัวที่แดงคือ `__tests__/unit/dataset-export-service.test.js:81` `Prisma.dmmf.datamodel` undefined เพราะ **prisma client ยังไม่ generate ใน sandbox นี้** ไม่เกี่ยว M3 · `ratchet.sh` PASS **43/59/169/4** ตรงเป๊ะ · `check-banned-terms.js` PASS · `eslint .` **0 errors** · `.only/.skip` = 0 · **`check-thai-copy-style.js` FAIL (F1)**

**RED authenticity** — `M3/red-output.txt` 20 fail / 4 pass จาก 24 tests; fail มาจาก assertion ของ pin เอง (`count` 0 calls, promise resolved แทน rejected, writer list `[]`, regex vocab ไม่เจอ) + `Cannot find module '../../shared/correction-round-stage'` (ไฟล์ยังไม่มีตอน RED) — แดงจากตัวที่อ้างจริง; ไฟล์ test ตอน RED มี 24 tests เท่ากับ HEAD ตอนนี้ (ไม่มีการเติม test หลังเขียว) · 4 ตัวที่ born-green (Thai-copy SSOT / no-mutation / RevisionDeadline untouched / config===5) ไม่มีที่ไหนประกาศไว้ เพราะไม่มี notes.md

**แกน 10 scope** — diff `2375ce2c..10bd568b` 19 ไฟล์ อธิบายได้ด้วย spec M3 ทั้งหมด ไม่มีไฟล์นอก scope; `84ed4f3e` docs ล้วนจริง (QUEUE.md + decisions-final.md + orchestration-log.md)

**งานค้างครึ่งทาง** — ไม่พบ TODO/FIXME/comment "จะทำต่อ" ใน diff; ไม่พบ path ที่เขียนแล้วไม่มีใครเรียก ยกเว้น export ตายตัวเดียว `CORRECTION_ROUND_STAGES` (`shared/correction-round-stage.js:27` export ที่ `:57`) ที่ไม่มี consumer และไม่มี test อ้าง — non-blocking

**ข้อจำกัด infra (รายงานตามจริง, Law 3.8)** — `npx prisma validate --schema prisma/schema` รันไม่ได้ใน env นี้ (proxy 403 ตอนดึง schema-engine binary) → ความถูกต้องเชิง schema ของ `correction-round.prisma` **ไม่ได้ถูกพิสูจน์ด้วยเครื่อง** มีแต่ regex pin กับการอ่านด้วยตา (relation ทั้ง 3 คู่มีขาเดียว ไม่กำกวม)

---

## ปิดท้าย

**(ก) tree สะอาด** — mutation ทั้ง 3 ตัว (swallow error / write นอก tx / config 5→7) revert ครบแล้ว: `git status --porcelain` = ว่าง, `git diff 10bd568b -- apps/backend` = ว่าง, worktree ชั่วคราวถูก `git worktree remove` แล้ว (`git worktree list` เหลือ repo เดียว)

**(ข) evidence pack ขาด `notes.md`** — `/home/user/GACP-Certification-Application/evidence/R2-special-reopen/M3/` มีแค่ `red-output.txt` + `test-output.txt` และยังขาดผล gate อีก 3 ตัว (ratchet / thai-copy-style / banned-terms) ตามที่ระบุใน F3