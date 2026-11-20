# R2 M3b — AUDIT REPORT (รอบ 1)

- Head ที่ตรวจ: `0bf5b4e1` บน `feat/r2-m3b-terminal-letter`
- ผู้ตรวจ: auditor agent (fresh context) — verdict **FAIL, 2 findings, ไม่มี CRITICAL**
- Orchestrator spot-verify: ทำเองครบทั้ง 2 finding (คำสั่ง + output อยู่ท้ายไฟล์)

---

## คำตัดสิน: FAIL

ไม่มี CRITICAL — แกน 2 (แต่งข้อมูลกฎหมาย) ตรวจแล้ว**สะอาด** (รายละเอียดใน "ยืนยันแล้วสะอาด" ล่าง)

---

## F1 — BLOCKING: มี REJECT terminal surface ที่ 4 ที่เขียน `REJECTED` แล้วไม่ mint จดหมาย

`apps/backend/routes/api/provider/work.js:364` (`POST /api/provider/work/:id/done`) → `:473`
`writeApplicationStatus({ prisma: tx, toStatus: nextLegacyStatus })` โดย `nextLegacyStatus = toState` (`:456`)
รับค่าจาก body ตรง ๆ

เส้นทางเปิดจริง ไม่ใช่ทฤษฎี:
- `work.js:41` `WORK_INBOX_BLOCKED_DECISION_STATES = new Set(['DOC_APPROVED', 'REVISION_REQUESTED'])` — **ไม่กัน `REJECTED`**; gate ที่ `:401` จึงปล่อยผ่าน
- `canTransition('AUDIT_CONFIRMED','REJECTED') === true` และ `canRoleTransition('auditor','AUDIT_CONFIRMED','REJECTED') === true` (auditor รันยืนยันเอง — `services/workflow-transition-service.js:65,138`)
- `GET /:id/next-states` (`work.js:337-349`) **เสนอ `REJECTED` ให้ FE เป็นตัวเลือก** เพราะ filter ตัดแค่ 2 state ข้างบน
- `grep -n "decision-letter-service\|mintTerminal" routes/api/provider/work.js` → exit=1 (ไม่มี)

Reproduce (auditor รันแล้ว ผ่าน = พิสูจน์รู):
```
POST /api/provider/work/act-1/done
  { advanceStatus: { toState: 'REJECTED', comment: '...', reasonCode: 'AUDIT_FAIL' } }
→ HTTP 200 · writeApplicationStatus({ toStatus: 'REJECTED' }) ถูกเรียก · tx.notification.create = 0 ครั้ง
```
(temp test ใน `apps/backend/__tests__/unit/` ลบทิ้งแล้ว — tree สะอาด)

ขัด spec ตรง ๆ: `evidence/R2-special-reopen/decisions-final.md:42` "REJECT terminal ต้องมีจดหมาย" + `:52`
"ออกจดหมายไม่ได้ = REJECT ไม่สำเร็จ" — เส้นนี้ commit terminal REJECTED ได้โดยไม่มีคำสั่งทางปกครองส่งถึงเกษตรกรเลย

หมายเหตุประกอบคำตอบข้อ 5(ข): `services/admin-application-service.js:464` `revertLastTransition` ก็ลง `REJECTED`
ได้ (ผ่าน override ออกจาก REJECTED ก่อน แล้ว revert) แต่การจัดชั้นของ implementer ว่าเป็น undo ไม่ใช่คำตัดสินใหม่
**รับได้** — ไม่นับเป็น finding

## F2 — Law 3.2 / 3.9: claim ฐานของแกน 5 เป็นเท็จ

`evidence/R2-special-reopen/M3b/notes.md:9` — "ไล่ทุก caller ของ chokepoint `writeApplicationStatus` (**25 call sites**)"

นับจริง:
`grep -rn "await writeApplicationStatus({" routes/ services/ jobs/ controllers/ middleware/ shared/ utils/ modules/ | grep -v __tests__ | wc -l`
→ **38**

และตาราง `notes.md:11-32` ทั้งสองตาราง (ทั้ง "ต่อสายแล้ว" และ "ไม่ใช่ terminal surface") **ไม่มี
`routes/api/provider/work.js` เลยแม้แต่บรรทัดเดียว** — ไม่ใช่จัดชั้นผิด แต่คือไม่เคยถูกไล่ ⇒ ข้ออ้าง
exhaustiveness ที่แกน 5 ทั้งแกนพิงอยู่ ไม่มี evidence รองรับ

---

## ยืนยันแล้วสะอาด (auditor รันเอง ไม่ต้อง audit ซ้ำ)

| แกน | ผล |
|---|---|
| 1 องค์ประกอบ 4 ข้อ + throw | `shared/terminal-letter-template.js:100,107` throw จริงทุกเคส (reason `undefined/''/'   '/'\n\t'/0`, stage `undefined/'NOT_A_STATE'/'constructor'/'toString'/lowercase`) — `hasOwnProperty` กัน prototype ได้จริง; เนื้อจดหมาย render จริงครบ 4 ข้อ |
| **2 ไม่แต่งข้อมูลกฎหมาย** | ประโยคอุทธรณ์ prefix **ตรง spec เป๊ะ** (`startsWith` = true); ส่วนแทน `<ช่องทางติดต่อกรม>` = `MINISTRY_CONTACT.ministry + MINISTRY_CONTACT_LINE` ล้วน; `shared/ministry-contact.js` เกิดที่ commit `922fa333` (2026-07-08) — **มีอยู่ก่อนจริง** ไม่ใช่ implementer สร้าง; scan เนื้อจดหมาย: `ภายใน…/วัน…/อุทธรณ์…` → `null`, digit ทั้งหมดมาจาก applicationNumber + เบอร์/อีเมลของ SSOT เท่านั้น |
| 3 Atomic D-8 | mint อยู่ใน `$transaction` เดียวกับ status write ทั้ง 3 surface (`workflow-transitions-handler.js:469-489`, `auditor-audit-decision-handler.js:252-280`, `admin.js:430-490`) · mutation รันเอง 3 ตัว: กลืน error ที่ auditor → 1 fail · ย้าย mint ออกนอก tx ที่ canonical → 3 fail · กลืน error ที่ admin → 1 fail |
| 4 ไม่มี dueDate / CorrectionRound | metadata ไม่มี `dueAt`, ส่ง `dueAt` เข้าไปถูก ignore, `correctionRound.create/count` ไม่ถูกเรียกเลย (test:437-438) + grep pin สองทาง (test:779-784) |
| 6 stage vocab | `CORRECTION_ROUND_STAGE` = `{DOC_REVIEW, FIELD_AUDIT}` เท่านั้น — ครอบ `AUDIT_PASSED/CERTIFIED` ไม่ได้จริง (force edge ยืนยันที่ `workflow-transitions-cert-integrity.test.js:320-326`) · `STATUS_PRESENTATION` มีนิยามเดียวที่ `shared/status-machine-contract.js:35` — ไม่มี vocab ชุดที่สาม |
| 7 test เดิม | diff `workflow-transitions-cert-integrity.test.js` = **+14 / -0** ล้วน (mock block เท่านั้น) · assertion เดิมไม่ถูกแตะ · 13 tests ยังผ่านครบ |
| 8 EXPAND select | `admin-application-service.js:602` additive; caller เดียวคือ `admin.js:417`; `healthId`/`applicationNumber` ถูกใช้จริงในการ mint — ไม่ over-fetch |
| 9 gates | jest 7 suites = **104/104** (+cert-integrity 13 → 117/117) · full suite **7114 passed / 1 failed** (1 = `__tests__/unit/dataset-export-service.test.js:81` `Prisma.dmmf` undefined, pre-existing, อยู่นอก diff) · ratchet **43/59/169/4 PASS** · thai-copy-style exit=0 · banned-terms exit=0 · eslint exit=0 · skip/only = 0 |
| 9 RED authenticity | **auditor reproduce เองแล้ว**: revert impl 5 ไฟล์กลับ `6082401b` + ลบ template → **21 failed / 4 passed** ตรงกับ `M3b/red-output.txt` เป๊ะ และ 4 เขียวคือ negative control 4 ตัวที่ประกาศไว้จริง · ตัวที่ 5 เดิมแก้จริง — `terminal-decision-letter.test.js:779` `expect(src).toContain('async function mintTerminalDecisionLetter')` ทำให้มันแดงที่ red-output.txt:48 |
| 10 scope | 13 ไฟล์ ไม่แตะ waiver/cron/reminder/APPLICATION_EXPIRED/schema/migration/gate/probe · `BACKLOG-FOUND.md` 2 entry เป็น finding จริงทั้งคู่ (ยืนยัน `admin-application-service.js:64` vs `admin.js:406` ขัดกันจริง · แจ้งเตือน EN ที่ `auditor-audit-decision-handler.js:309-317` มีจริง) |

**tree สะอาด**: `git status --porcelain` ว่าง · HEAD = `0bf5b4e1` · `git stash list` ว่าง · mutation ทั้งหมด
restore แล้ว · temp repro test ลบแล้ว

---

## ORCHESTRATOR SPOT-VERIFY (ทำเอง ไม่เชื่อ report)

ตรวจซ้ำที่ head `0bf5b4e1` เอง — ตรงกับ auditor ทุกข้อ:

```
$ sed -n '41p' apps/backend/routes/api/provider/work.js
const WORK_INBOX_BLOCKED_DECISION_STATES = new Set(['DOC_APPROVED', 'REVISION_REQUESTED']);
                                                    ^ ไม่มี REJECTED

$ sed -n '456p;473p' apps/backend/routes/api/provider/work.js
                const nextLegacyStatus = toState;
                const updatedApp = await writeApplicationStatus({

$ grep -c "decision-letter-service\|mintTerminal" apps/backend/routes/api/provider/work.js
0                                                            (exit=1)

$ grep -rn "await writeApplicationStatus({" routes/ services/ jobs/ controllers/ \
    middleware/ shared/ utils/ modules/ | grep -v __tests__ | wc -l
38                                                           (notes.md อ้าง 25)
```

เพิ่มเติมที่ orchestrator หาเอง (ใช้กำหนดขอบเขต fix):

```
$ node -e "ไล่ทุก state × role ที่เข้า REJECTED ได้"
[["AUDIT_CONFIRMED","auditor|approver"]]          ← มี edge เดียวเท่านั้นทั้งระบบ
REQUIRES_COMMENT_TARGETS.has('REJECTED') = true
```

- `work.js:473` เรียก `writeApplicationStatus` **โดยไม่มี `onAudit`** — ต่างจาก canonical
  (`workflow-transitions-handler.js:471` ส่ง `onAudit: statusTransitionAuditHook(...)`) ⇒ surface นี้
  ขาดทั้งจดหมาย **และ** AuditLog ที่แก้ไขไม่ได้ ตรงกับเหตุผลที่ตัวไฟล์เองเขียนไว้ที่ `work.js:38-41`
- canonical (`POST /provider/applications/:id/workflow-transitions`, `applications.js:322-325`) ตรวจ role
  ผ่าน `canRoleTransition` ตัวเดียวกับ work.js ⇒ ทั้ง auditor และ approver ยังทำ REJECT ได้ที่นั่น

---

## สั่งแก้ (fix cycle 1/3)

ดู `evidence/R2-special-reopen/orchestration-log.md` — dispatch M3b fix cycle 1/3
