# R2 M3b — AUDIT REPORT (รอบ 2 — focused บน fix cycle 1/3)

- Head ที่ตรวจ: `cb41412d` · commit ที่เป็นเป้า: **`c4f2891a`** (diff เทียบ `9826be38`)
- ผู้ตรวจ: auditor agent (fresh context) — verdict **FAIL, 1 finding (BLOCKING, ไม่ CRITICAL)**
- Orchestrator spot-verify: ทำเองครบ (คำสั่ง + output ท้ายไฟล์) — **ตรงกับ auditor ทุกข้อ**

---

## คำตัดสิน: FAIL — 1 finding

**F1 และ F2 ของรอบ 1 ปิดจริงทั้งคู่** (auditor พิสูจน์ด้วย runtime probe 22 เคส + independent sweep)
finding เดียวที่เหลือเป็น **evidence เท่านั้น ไม่ต้องแก้โค้ด**

---

## F3 — BLOCKING (Law 3.2 / 3.9): parity proof ที่ทั้ง fix พิงอยู่ อ้างกลไกที่ไม่มีอยู่จริง และตาราง delta ขาดข้อที่สาม

**ที่:** `evidence/R2-special-reopen/M3b/notes.md:291-292` (§8.3 ข้อ 4) · ผลต่อเนื่องที่ `:297-302`
(ตาราง "delta ที่เหลือ 2 ข้อ — รายงานตรง ๆ ไม่กลบ")

**ข้อความที่อ้าง:**
> `4. admin ไม่ถือ edge ใน ROLE_TRANSITIONS แต่ assertTransition ปล่อยผ่านบน edge legality (services/workflow-transition-service.js:269-277) + canTransition = true ⇒ admin ยังทำได้ที่ canonical เช่นกัน`

**หลักฐานที่ auditor รันจริง (ไม่ใช่อ่าน):**

1. `assertTransition` **ไม่ใช่ฟังก์ชันในโมดูลนั้นและไม่ถูก export** — ทั้งรีโปมันมีสถานะเป็น
   **boolean option** ของ `writeApplicationStatus` เท่านั้น บวกคอมเมนต์หนึ่งที่
   `services/workflow-transition-service.js:158`; `module.exports` (`:422-438`) ไม่มี symbol นี้

2. เส้น canonical **ไม่ได้เดินทางนั้น** — `routes/api/provider/handlers/workflow-transitions-handler.js:234-243`
   เรียก `buildTransitionUpdate({ ..., actorRole: req.user.canonicalRole, force })` และ
   `services/workflow-transition-service.js:334` บังคับโดยไม่มีเงื่อนไขเมื่อ `!force`:
   ```js
   if (!force && !canRoleTransition(canonicalRole, fromState, nextState)) {
       throw new Error(`Role ${canonicalRole} cannot transition ${fromState} -> ${nextState}`);
   }
   ```

3. ช่วงบรรทัดที่ยกมาอ้าง **พูดตรงข้ามกับข้อสรุป** — `services/workflow-transition-service.js:266-267`:
   `// ADMIN ... is gated by the 'force' flag in buildTransitionUpdate instead`

**ทำไมถึงเป็น finding ไม่ใช่เรื่องเล็ก:** §8.3 พาดหัวข้อนี้เองว่า `เงื่อนไขบังคับก่อนเดินแนวหลัก` —
คือเงื่อนไขที่ใช้ตัดสินว่าจะ "ปิดรูที่ต้นทาง" แทนการ mint จุดที่ 4 ข้อ 4 ผิดที่ตัวกลไก และ file:line
ที่อ้างขัดกับข้อสรุปของตัวเอง (Law 3.9) หมวดที่พาดหัวว่า `รายงานตรง ๆ ไม่กลบ` จึงรายงานไม่ครบ —
มี **delta ข้อที่สามที่ไม่ได้ประกาศ**:

| delta | work-inbox (ก่อนแก้) | canonical (หลังแก้) |
|---|---|---|
| เส้น admin REJECT | `advanceStatus:{toState:'REJECTED', comment}` — เส้นธรรมดาผ่าน `isAdmin` bypass (`work.js:460-465` ก่อน fix) บันทึกเป็น `WORKFLOW_TRANSITION` | ต้องส่ง `force:true` + `reasonCode` + `comment` (`workflow-transitions-handler.js:71,90`); ไม่ force ได้ 422 `INVALID_TRANSITION`; บันทึกเป็น `WORKFLOW_FORCE_TRANSITION` |

**ไม่ CRITICAL**: capability ไม่หาย (admin + force ทำได้ และ **ยัง mint จดหมาย** เพราะ
`workflow-transitions-handler.js:432-448` ทำงานทั้งเส้น force และไม่ force) และทิศทางเข้มขึ้น
แต่เป็น defect class เดียวกับ F1/F2 รอบ 1 — claim ที่รับน้ำหนักการตัดสินแต่เป็นเท็จ — **โผล่ซ้ำ
ในตัว correction ที่ควรจะปิดมันเอง**

---

## ที่ auditor พังไม่ได้ — ยืนยันด้วยการรัน ไม่ใช่การอ่าน

**A. F1 ปิดจริง และปิดหมด** — runtime probe 22 เคส (harness ของ auditor เอง ลบทิ้งแล้ว) ยิงเข้า
`POST /work/:id/done` โดย instrument `writeApplicationStatus`:

```
exact / lowercase / mixedcase / space-padded / tab+newline / NBSP / BOM / U+2028
   → http=422 code=USE_CANONICAL_REVIEW  writes=0
ZWSP / soft-hyphen / NUL / fullwidth / REJECT / "REJECTED." / object-toString
   → http=422 code=INVALID_TRANSITION    writes=0
array wrapper ['REJECTED'] / ['rejected'] → 422 USE_CANONICAL_REVIEW writes=0
```
`writeApplicationStatus` ถูกเรียก **0 ครั้ง** ทุก variant · gate ที่ `work.js:424` อยู่หลัง
`.trim().toUpperCase()` (`:407`) และครอบเท่ากับสิ่งที่ไปถึง write ได้พอดี (`assertCanonicalStatus`
`application-status-writer.js:171-193` + `canTransition` strict Set `:255`, `normalizeWorkflowStateInput`
`:221` fail-closed) — ไม่มีทางลักลอบ

- **isAdmin bypass** (`work.js:460`): `admin` และ `platform_admin` → 422 ทั้งคู่, `$transaction` = **0 ครั้ง**, activity ยัง `CLAIMED` ⇒ gate อยู่ก่อน tx จริง
- **`GET /:id/next-states`**: 8 คู่ role/group — ไม่มี `REJECTED` เลยสักคู่ แต่ยังคืน `["AUDIT_PASSED","CAR_PENDING"]` ⇒ ไม่ใช่ผ่านเพราะ list ว่าง
- **body injection** (`additionalData.status`, `status`/`toStatus` ระดับบน, `formData.workflowState`) ไปถึง REJECTED write ไม่ได้

**A.5 ไม่มี surface เหลือ** — auditor ไม่ใช้ grep ชุดเดิมของ implementer: sweep เอง 45 บรรทัด
`writeApplicationStatus(` ที่ไม่ใช่คอมเมนต์ ลบนิยามที่ `services/application-status-writer.js:275`
= **44** (37 ใน 8 ไดเรกทอรี + 7 สคริปต์ออฟไลน์) ตรงกับ §8.2 ทีละแถวครบ 37 · ตรวจทางเลี่ยง writer
เพิ่ม: ไม่มี `$executeRaw`/`$queryRaw` UPDATE `Application.status`; `application.update` 12 จุดที่พูดถึง
`status:` เปิดดูครบ — มีแต่ `application-status-writer.js:447/604` ที่เขียนจริง; ผู้บริโภค
`buildTransitionUpdate` ที่ apply `updateData` เองทุกตัวใช้ปลายทาง hardcode ที่ไม่ใช่ REJECTED
(`provider/auditor.js:130,219`, `audits.js:307`, `scheduler-assign-reviewer-handler.js:113`);
`workflowState:` writer 33 ตัวตรวจครบ ⇒ **ไม่มี surface ที่ 4 ที่ไร้จดหมาย**

**C. F2 correction ซื่อสัตย์** — `notes.md:9` byte ตรงกับ `0bf5b4e1` (md5 `b154012668039f057c940d6f53bcc034`
ทั้งสองฝั่ง); diff ของ notes = `+283/-0` append-only · เลขนับซ้ำได้ตรง: ดิบ `38`, ลบ JSDoc ที่
`application-status-writer.js:29` = `37`, บวกออฟไลน์ 7 = `44` · สุ่มตรวจ 12 แถวกับไฟล์จริง ถูกทุกแถว
รวมแถวที่ถ้าผิดจะซ่อนรู (แถว 5/26 `FORCE_STATUS_EXCLUSIONS.REJECTED` ที่ `admin-application-service.js:64`
+ `ALLOWED_STATUSES` `admin/applications.js:29`, แถว 12 `RESUBMIT_TARGET :555-559`, แถว 37
`REOPENABLE_ORIGINS :42` guard `:316`)

**D. Law 3.7 ไม่มีอะไรถูกลดทอน** — test diff `+129/-0` ยืนยันด้วย `git diff --numstat` ·
`.skip`/`.only` = **0** ทั้ง `apps/backend/__tests__` · mutation ของ auditor เอง:

| mutation | ผล |
|---|---|
| ถอด `'REJECTED'` ออกจาก Set (`work.js:61`) | **5 แดง** — ตรงกับ pin พฤติกรรมใหม่ 5 ตัว |
| ถอด `'DOC_APPROVED'` ออกจาก Set | **4 แดง** — pin WF-1 เดิมยังมีชีวิต ไม่ถูกกลืน |
| เพิ่ม call site `writeApplicationStatus` ตัวที่ 2 | **2 แดง** |
| ต่อสาย letter service แบบ **alias destructure** (`mintTerminalDecisionLetter: mintL`) | **1 แดง** — regex ที่แก้หลัง GREEN ไม่ใช่ช่องหนี |
| เติม `onAudit:` เข้า writer call | **1 แดง** |

regex ที่ implementer แก้หลัง GREEN (`provider-work-routes.test.js:381-383`) auditor จงใจโจมตีด้วย
รูป alias ที่ regex เดิมแบบจับคำจะจับได้ — ยังยิงติด ⇒ ไม่ได้แคบลงอย่างมีนัย

**E. RED authentic** — revert เฉพาะ `work.js` + `error-codes.js` กลับ `9826be38` คง test ใหม่ไว้ →
**5 failed / 15 passed / 20 total** ชื่อ test ตรงชุดกับ `red-output-fix1.txt` และแดงด้วยเหตุที่ถูก
(`Expected: 422, Received: 200` + next-states คืน `["AUDIT_PASSED","CAR_PENDING","REJECTED"]`) ·
เขียวตั้งแต่เกิด **3 ตัวพอดี** ตรงกับที่ประกาศ และทั้งสามถูก mutation-verify ว่ามีชีวิต ไม่ใช่ test ปลอบใจ

**F + gates ทุกตัว reproduce ได้ตรง**

| gate | implementer อ้าง | auditor ได้ |
|---|---|---|
| `npx jest` full | 7122 passed / 1 failed | **7122 passed / 1 failed** (528 suites) — ตัวแดง `dataset-export-service.test.js:81` `Prisma.dmmf` นอก diff |
| `ratchet.sh` | 43/59/169/4 PASS | **43/59/169/4 PASS** |
| `eslint` 3 ไฟล์ | exit=0 | **exit=0** |
| `check-thai-copy-style.js` | exit=0 | **exit=0** |
| `check:banned-terms` | exit=0 | **exit=0** |

`error-codes.js:2021` `source: 'routes/api/provider/work.js:425'` — บรรทัด 425 คือ
`return res.status(422).json({` **ถูกต้อง** · catalog validate: path ที่ dispatch สะกด
(`scripts/ci/extract-error-codes.js`) **ไม่มีจริง** ของจริงคือ `apps/backend/scripts/extract-error-codes.js`
→ `VALIDATION OK - catalog has 293 entries; 293 codes reconciled` exit 0

copy ไทย 422 ที่ `work.js:428` ครอบครบ 3 สถานะ ไม่มี em dash ไม่มีไม้ยมก เว้นวรรค Thai/Latin ถูก
บอกทั้งสาเหตุและขั้นถัดไป — ตรง `.claude/skills/thai-ui-copy/SKILL.md`

คอมเมนต์ที่ `work.js:33-60` ตรวจแล้วจริงทุก claim (`decisions-final.md:52`, `workflow-transition-service.js:65`,
`workflow-transitions-handler.js:472`)

**scope สะอาด** — `c4f2891a` แตะ 7 ไฟล์ (โค้ด/test 3 + evidence 4) · `cb41412d` แตะแค่
`orchestration-log.md` · ไม่มีอะไรใน `scripts/probes`, `scripts/check-done.sh`, `CLAUDE.md`,
`HARNESS*`, `.github`, eslint/jest config, `package.json`, `prisma/`

**tree สะอาด**: HEAD `cb41412d` · `git status --porcelain` ว่าง · `git stash list` ว่าง ·
sha256 golden ตรงทั้ง 3 ไฟล์ · temp probe `__tests__/integration/zzz-auditor-probe.test.js` ลบแล้ว

---

## ORCHESTRATOR SPOT-VERIFY (ทำเอง ไม่เชื่อ report)

```
$ node -e "const w=require('./services/workflow-transition-service');
           console.log(typeof w.assertTransition)"
undefined                                    ← ไม่ถูก export จริง

$ sed -n '266,267p' apps/backend/services/workflow-transition-service.js
  // that still falls through here (it has NO ROLE_TRANSITIONS entry and is
  // gated by the `force` flag in buildTransitionUpdate instead);
                                             ← พูดตรงข้ามกับ claim จริง

$ sed -n '334,336p' apps/backend/services/workflow-transition-service.js
  if (!force && !canRoleTransition(canonicalRole, fromState, nextState)) {
    throw new Error(`Role ${canonicalRole} cannot transition ...`);

$ node -e "buildTransitionUpdate({application:{status:'AUDIT_CONFIRMED',...},
           toState:'REJECTED', actorRole:'admin', force:<f>})"
admin force=false => THROW: Role admin cannot transition AUDIT_CONFIRMED -> REJECTED
admin force=true  => OK
```

เพิ่มเติม: orchestrator ยืนยัน `canRoleTransition('admin','AUDIT_CONFIRMED','REJECTED') = false`
มาตั้งแต่รอบ verify ก่อน push `c4f2891a` แล้ว (บันทึกใน `orchestration-log.md`) — สอดคล้องกับ F3

**สรุป: F3 จริงทุกองค์ประกอบ** — ทั้งกลไกที่อ้างไม่มีอยู่ ทั้ง file:line ที่ยกมาขัดกับข้อสรุปเอง
ทั้ง delta ข้อที่สามที่ขาดไป

---

## สั่งแก้ (fix cycle 2/3 — evidence เท่านั้น ไม่แตะโค้ด)

ดู `evidence/R2-special-reopen/orchestration-log.md` — dispatch M3b fix cycle 2/3
