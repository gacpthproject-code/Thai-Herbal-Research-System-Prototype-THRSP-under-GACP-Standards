# SENIOR-SWE Design Decision — A0-AUDIT-EMISSION (2026-08-06)

Phase: PLAN (design) — ก่อน RED
Status: PENDING (เอกสารตัดสินใจ — ยังไม่มีโค้ด; ข้อ 3 ครึ่งหลัง = BLOCKED(operator:D2-sequencing))
Input: `evidence/A0-AUDIT-EMISSION/spec-reader-report.md` · `GAP-MAP.md:75-81` (§3 theme 1) ·
`apps/backend/services/application-status-writer.js` · `apps/backend/eslint-rules/no-direct-application-status-write.js` ·
`HARNESS_LOG.md:120-129` (M4 reference pattern), `:152-159` (tiered-merge 2026-08-06)
Reviewer: senior-swe (ตาม `.claude/agents/senior-swe.md`) — เอกสารนี้คือ design ruling ไม่ใช่ implementation

---

## 1. AMBIGUOUS Resolutions (5 ข้อจาก spec-reader-report.md:50-55)

### A1 — audits.js:362 (PATCH /:id/schedule): **ตัดออกจาก A0 scope — GAP-MAP:68 stale ครึ่งใบ**
- ตรวจซ้ำแล้ว: `routes/api/audit/audits.js:395-401` — `updateData = { updatedBy, scheduledDate?, auditorId? }`
  ไม่มี key `status` และไม่มี `formData.workflowState` → ไม่ใช่ status-write ไม่เข้า invariant ของ A0
- GAP-MAP:68 ที่เขียน "POST/PATCH … bypass canonical writer, no audit row" จึงถูกครึ่งเดียว:
  **POST :266 เป็น bypass จริง (= B2)** · PATCH :362 เป็น column-only mutation
- หมายเหตุที่ไม่ทิ้ง: การเปลี่ยน `auditorId` ที่ :401 เปิด owner-gate ให้ auditor คนใหม่
  (comment ในไฟล์เอง :385-389) โดย**ไม่มี audit row** — เป็นช่องโหว่ audit-coverage คนละคลาส
  (column mutation ไม่ใช่ status transition) → ส่งเข้า **A7 AUTHZ SWEEP / GP-7 backlog** ไม่ใช่ A0
- Action: PM แก้ GAP-MAP:68 (ผมไม่มี write scope ไฟล์นั้น)

### A2 — schedule writers "2/4": **sweep เสร็จใน session นี้ — คำตอบคือ live 3 ตัว + 1 ตัวที่ GAP-MAP นับผิด และพบ caller ใหม่ 1 จุดที่ spec-reader ตกสำรวจ**
Writers ที่ land `AUDIT_CONFIRMED` (grep ทั้ง `apps/backend` ใน session นี้):
1. `routes/api/audit/audits.js:266-335` — POST /schedule = **B2** (bypass ผ่าน `buildTransitionUpdate` + `updateApplicationColumns`)
2. `routes/api/provider/handlers/scheduler-audit-schedules-post-handler.js:194-227` — ผ่าน writer, ไม่มี onAudit (= #19)
3. **[NEW — เพิ่มเข้า inventory เป็น #24]** `services/audit-scheduling-service.js:540-558` —
   POST /api/audit/scheduling/assign: ผ่าน writer ใน `$transaction` Serializable แต่**ไม่ส่ง onAudit**;
   audit ของมันคือ `_safeAudit(...)` ที่ :602 = **post-commit best-effort** (tx ปิดที่ :559)
   → crash window ระหว่าง commit กับ audit-call ทำ trail หาย — คลาสเดียวกับ #19
4. ตัวที่ 4 ของ GAP-MAP:68 คือ PATCH :362 ซึ่งตาม A1 ไม่ใช่ status writer → "FOUR" เป็นการนับรวมของ stale
นอก live path: `scripts/verify-e2e.js:60`, `prisma/seed-approve.js:37` (dev/seed — ไม่เข้า invariant)
- Ruling: **ไม่ต้อง sweep เพิ่ม** — inventory ปิดที่ 16+1 (#24) live + 4 bypass; กลไกข้อ 2 ด้านล่างปิดคลาสนี้ที่ chokepoint อยู่แล้ว

### A3 — [MATERIAL] cert surface: **แยกเป็นสอง ruling — hop-count ตัดสินเลย · ตำแหน่ง cert-issuance audit row = รอ operator**
- **ตัดสินเลย (mechanical):** ต่อ per-hop invariant ของ A0 ทั้งสามจุดเป็น**คนละ hop คนละ state-machine edge**:
  - `auditor-audit-decision-handler.js:251-252` — `AUDIT_CONFIRMED|CAR_REVIEWING → AUDIT_PASSED|CAR_PENDING|REJECTED` (cert mint เกิดใน writer hook ใน tx เดียวกัน)
  - `provider/auditor.js:129-134` (B3) — `AUDIT_PASSED → APPROVED`
  - `provider/auditor.js:218-230` (B4) — `AUDIT_PASSED → CAR_REVIEWING` + cert revoke
  แต่ละ write ต้องมี canonical audit row ของตัวเอง 1 แถวใน tx ของตัวเอง — จบ ไม่มีการ "รวมเป็น hop เดียว"
  เพราะ invariant นิยาม per-write ไม่ใช่ per-business-moment และ audit row เป็น additive ไม่เปลี่ยนพฤติกรรมเงิน/cert
- **รอ operator (ระบุชัดตามที่ถาม):** คำถามซ้อนที่เสี่ยงจริงคือ *cert-issuance/void audit row (CERTIFICATE category — GAP-MAP GP-9 คอลัมน์ Audit ❌) ควรผูกกับ write ไหน* — เพราะ operator ruling **D2 (GAP-MAP:117)** สั่งย้าย cert mint จาก `AUDIT_PASSED` ไป `CERTIFIED` write อยู่แล้ว
  ถ้า A0 pin test "cert row เกิดที่ AUDIT_PASSED" วันนี้ D2 จะต้องรื้อ test นั้นทันที
  → **BLOCKED(operator:ตัดสินลำดับ A0-PR-4 vs D2)** — ข้อเสนอของผม: PR-4 ทำเฉพาะ APPLICATION-category
  transition rows (ปลอดภัยต่อ D2 ทุกกรณี) แล้วยก CERTIFICATE-category row ไปเป็นส่วนหนึ่งของ D2

### A4 — B1 vs L-081: **A0 ครอบเลย แบบ subset แคบ — ไม่รอ triage**
- L-081 (PENDING, `reports/role-workflow-auditor/2026-08-06-reviewer.md:152`) proposed fix ของมันเอง =
  "migrate `schedulerAssignReviewer` onto `writeApplicationStatus` **แล้วค่อย** delete dead pair — expand-then-contract"
- Ruling: A0 ทำเฉพาะ**ครึ่ง expand**: ย้าย `writeAssignmentColumns` path
  (`application-provider-query-methods.js:172-178` ผ่าน `scheduler-assign-reviewer-handler.js:146-149`)
  เข้า `writeApplicationStatus` + canonical audit ใน tx — เป็น strict subset ของ fix ที่ L-081 เสนอเอง จึงไม่ชนกัน
- **ไม่แตะใน A0**: re-point FE (`coordinator/client-view.tsx:185`) และ delete endpoint ตาย — นั่นคือครึ่ง contract
  (Law 3.10) เป็นของ L-081 หลัง operator triage · ถ้า triage ออกมาทางอื่น L-081 supersede ได้โดย A0 ไม่เสียของ
  (audit row บนเส้น live ถูกต้องไม่ว่า endpoint ไหนชนะ)

### A5 — #17 dead route (`provider/handlers/applications.js:151-230`): **ตัด per-route RED ออก — ให้กลไก default ครอบฟรี**
- เหตุผล: route ตายตาม L-081 (ไม่มี FE caller) และมีกำหนดถูกลบใน contract phase ของ L-081 —
  เขียน RED pin พฤติกรรม route ที่ตั้งใจจะลบ = สร้าง churn ขัด EXPAND-CONTRACT
- แต่ไม่ใช่ "ปล่อยรู": route นี้เรียก `writeApplicationStatus` อยู่แล้ว (:178) — เมื่อกลไกข้อ 2
  (writer audit-by-default) land มันได้ audit row อัตโนมัติโดยไม่ต้องมี test เฉพาะทาง
- ถ้า L-081 triage ตัดสินให้ route นี้กลายเป็นเส้น live (สลับกับ B1) → ค่อยยก test จาก template PR-2

### A6 — [MATERIAL, เพิ่มโดย implementer PR-A0-2 หลัง audit รอบ 1 ข้อ F4 — **AMBIGUOUS, รอ senior-swe/operator**] INVARIANT A0 ข้อ (1) "Δ = +1 พอดี" ขัดกับ failure policy fail-open ที่ §2 เลือกเอง

- §4:136-137 นิยาม invariant ว่า **commit(H) สำเร็จ ⇒ Δ canonical row = +1 พอดี** (ไม่ใช่ ≥1 ไม่ใช่ ≥0)
- แต่ §2.3 + PR-A0-1b เลือก failure policy เป็น **fail-open**: emission วิ่งหลัง SAVEPOINT fence
  (`application-status-writer.js` `runFencedBestEffort`) — INSERT ล้ม ⇒ unwind เฉพาะแถวนั้น
  **status write ยัง commit** ⇒ สถานะ "hop commit สำเร็จ แต่ Δ = 0" **เกิดได้จริงโดยเจตนา**
- ⇒ ตามตัวอักษร invariant ข้อ (1) **เป็นเท็จได้** บนโค้ดที่ design ฉบับนี้สั่งให้เขียนเอง
  สองข้อนี้อยู่ในเอกสารเดียวกันและขัดกันตรงๆ
- ที่พบเรื่องนี้: audit รอบ 1 ของ PR-A0-2 (F4) จับได้ว่าคอมเมนต์ใน caller เคลม "land or vanish together"
  ซึ่งเท็จ — implementer แก้คอมเมนต์ให้ตรงความจริงแล้ว (`applications.js`, `application-bundles.js`)
  แต่**ไม่แก้ semantics เอง** เพราะการเลือกระหว่างสองข้อนี้เป็น design ruling ไม่ใช่ bug fix
- ทางเลือกที่เห็น (ให้ senior-swe/operator เลือก — implementer ไม่ตัดสิน):
  1. **แก้ถ้อยคำ invariant**: ข้อ (1) อ่านเป็น "เมื่อ emission สำเร็จ ⇒ +1 พอดี (ห้ามซ้ำ)" + เพิ่มข้อ (1b)
     "emission ล้ม ⇒ Δ = 0 และ **ต้องมี warn log**" ⇒ fail-open ยังถูกต้อง แต่ต้องมี observability
     ทดแทน (ตอนนี้มีแค่ `console.warn` ไม่มี metric/alert — เป็นรูจริงถ้าเลือกทางนี้)
  2. **flip เป็น fail-closed เร็วขึ้น** สำหรับ caller ที่ส่ง tx (คือสิ่งที่ §2 "Contract" วางไว้ทีหลังอยู่แล้ว)
     ⇒ invariant ข้อ (1) เป็นจริงตามตัวอักษร แต่ availability ของทุก hop ผูกกับ audit backend
  3. คงไว้ทั้งคู่และยอมรับว่า invariant เป็น "เป้าหมายหลัง contract PR" ไม่ใช่ค่าที่ test วันนี้ pin ได้
     ⇒ ต้องเขียนกำกับใน §4 ไม่งั้นคนอ่านจะ implement ผิดซ้ำ
- **ผลต่อ test ที่เขียนไปแล้ว**: integration case ที่ assert Δ=+1 บน happy path ยังถูกต้องทุกทาง
  (ไม่มี injected audit failure) — ข้อขัดแย้งนี้กระทบเฉพาะ "invariant พูดถึงทุกกรณีหรือเฉพาะ happy path"

---

## 2. Mechanism Decision: **(c) HYBRID — writer เป็น audit-by-default (expand, fail-open) + per-hop hardening เฉพาะ Tier C (fail-closed) + contract ทีหลัง**

### ทำไมไม่ (a) เพียว (default-on + fail-closed ทันทีทุก caller)
- coverage สูงสุดใน PR เดียวจริง แต่เปลี่ยน availability contract ที่ประกาศไว้ในไฟล์
  (`application-status-writer.js:480-483` — "audit failure must NOT block status writes") กับ caller live 23 จุดพร้อมกัน
- blast radius ต่อ suite: unit test stub ที่ไม่มี `auditLog` namespace จะพังยกแผง; caller ที่ส่ง bare
  prisma (พิสูจน์แล้ว: submit hops `applications.js:654-676,684` ส่ง `prisma` ตรง ไม่ใช่ tx) จะได้ semantics ใหม่ทันที
- เท่ากับยัดการเปลี่ยนพฤติกรรมเส้นเงิน/cert ลง PR ที่ path-tier = B → หลุดกรอบ tiered-merge

### ทำไมไม่ (b) เพียว (แก้ per-caller 24 จุด)
- diff surface ใหญ่สุด (24 ไฟล์ × envelope เขียนมือ) · envelope จะ drift
- **ไม่ปิดคลาส**: caller ใหม่ในอนาคตเกิดมาพร้อมรูเดิม — ตรงข้ามบทเรียน R2-D ของ cert hook เอง
  (writer comment :500-516: ย้าย hook เข้า writer เพราะ "FOUR write paths … only the first one ran cert-gen")
  audit emission เป็นเคสเดียวกันเป๊ะ
- opt-in comment เดิม (:49-56) อ้างเหตุ "ไม่อยาก couple กับ audit-logger" — **เหตุผลนั้นตายแล้ว**:
  writer lazy-require `middleware/audit-logger` อยู่แล้ว (`getAuditModule` :101-108) และใช้
  `auditLogger.logWithin(event, tx)` ใน rollback path (:667-683) — coupling มีอยู่จริงในไฟล์แล้ว

### รูปธรรมของ (c)
**PR-1 (EXPAND — กลไก):** ใน `writeApplicationStatus`
1. `onAudit` เป็น tri-state: `undefined` → writer emit canonical row เองผ่าน
   `auditLogger.logWithin({category: APPLICATION, action: 'APPLICATION_STATUS_TRANSITION', resourceId, metadata:{fromStatus,toStatus,reason,actorRole}}, prisma)`
   (join tx เมื่อ caller ส่ง tx handle) · `function` → พฤติกรรมเดิมเป๊ะ ไม่ emit ซ้ำ (กัน double row) ·
   `false` → ไม่ emit (สำหรับ dev scripts + caller #7 `admin/applications.js:312` ที่ logWithin เองใน tx อยู่แล้ว —
   จนกว่าจะ migrate ใน PR-2)
2. เมื่อ `args.prisma` เป็น bare client (มี `$transaction`) → writer ห่อ UPDATE + audit INSERT ใน
   internal tx สั้นของตัวเอง ให้ invariant "same tx" เป็นจริงแม้ caller ไม่ส่ง tx
   (cert hook / fanout / work-activity อยู่นอก internal tx — พฤติกรรมเดิมไม่เปลี่ยน)
3. Failure policy ใน PR-1 = **เดิมเป๊ะ: swallow + warn** (fail-open) — PR-1 จึงเปลี่ยน "ไม่มี row" เป็น
   "มี row" โดยไม่เปลี่ยน availability ใดๆ → blast radius ต่อ suite เหลือแค่ "assert ว่ามี row เพิ่ม"
**PR-3/PR-4 (per-hop hardening, Tier C):** เฉพาะ hop เงิน (#23) และ cert (#16/B3/B4) — ยก emission เป็น
**fail-closed atomic** ตาม M4 reference pattern ที่ operator เคาะแล้ว (HARNESS_LOG:125-129, D-8:
"a letter that cannot be written rolls the decision back" — precedent ตรงตัว)
**Contract (หลัง suite เขียวบน Postgres, PR แยกอนาคต):** flip default fail-open → fail-closed สำหรับ caller
ที่ส่ง tx · ลบ onAudit callback ที่ซ้ำ envelope default · flip ESLint rule → error (PR-WF-2 ratchet เดิม)

### Trade-off ที่ยอมรับ
- ช่วง PR-1..PR-3 hop ทั่วไปมี row แบบ best-effort (ไม่ atomic-guaranteed เมื่อ infra audit พังกลางคัน) —
  ยอมรับได้เพราะดีกว่าปัจจุบัน (ไม่มี row เลย) และไม่มีการถอย
- internal tx เพิ่ม round-trip ให้ bare-client caller — จำกัดด้วย tx สั้น (2 statement)

---

## 3. Work-item Split + ลำดับ (คำตอบ: **Tier ทั่วไปก่อน** — เหตุผลด้านล่าง)

| PR | เนื้อหา | ไฟล์หลัก | Tier (probe จริง §5) | Merge path |
|---|---|---|---|---|
| **PR-A0-1** | writer audit-by-default (tri-state onAudit + internal tx + envelope) + unit + integration invariant | `services/application-status-writer.js` | **B** | CI เขียว + review (senior) |
| **PR-A0-2** | general callers: ส่ง tx ที่ hop ซึ่งมี multi-write รอบข้าง · migrate #7 เป็น onAudit · per-hop integration tests #8,#9,#12,#13-15,#18-22,**#24** (แตก 2a submit-hops / 2b scheduler-cron-hops ได้ถ้าใหญ่) | `routes/api/applications/*`, `system/cron.js`, `provider/handlers/*`, `services/audit-scheduling-service.js` | **B** | CI เขียว + review |
| **PR-A0-3** | #23 settle: canonical row **fail-closed** ใน settle tx (`checkout-settlement-service.js:216-227`) — M4 pattern | `services/checkout/checkout-settlement-service.js` | **C (money)** | draft PR · operator merge |
| **PR-A0-4** | #16 decision-handler: เพิ่ม in-tx canonical row ใน `$transaction` ที่ :251 · B3/B4: migrate `tx.application.update` → writer + onAudit ใน tx เดิม (`auditor.js:130,219`) — **เฉพาะ APPLICATION-category** (A3) | `auditor-audit-decision-handler.js`, `provider/auditor.js` | **B โดย probe — แต่ treat เป็น C โดยนโยบาย** (ดู §5 gap) | draft PR · operator merge ตาม tiered-merge HARNESS_LOG:158 + task mandate (B3/B4 PR แยก) |
| **PR-A0-5** | B1 (assign เส้น live → writer + audit, subset ของ L-081 ตาม A4) + B2 (`audits.js:266` POST /schedule → writer) | `application-provider-query-methods.js`, `scheduler-assign-reviewer-handler.js`, `audits.js` | **B** | CI เขียว + review |

### [แก้โดย implementer PR-A0-2 หลัง audit รอบ 1 ข้อ F6 — **DESCOPE ที่ประกาศไว้ในตารางแต่ส่งไม่ครบ**]

ช่องของ PR-A0-2 ข้างบนประกาศ per-hop integration ครอบ `#8,#9,#12,#13-15,#18-22,#24`
**ส่งจริงเฉพาะ `#7,#8,#9,#12,#13,#14,#15`** ใน `apps/backend/__tests__/integration/a0-pr2-per-hop-invariant.test.js`
(table-driven, ยิง route จริง) · ที่เหลือ **descope** พร้อมเหตุผลรายตัว ห้ามอ่านตารางข้างบนว่ายังค้างส่ง:

| hop | ทำไมไม่ส่ง |
|---|---|
| #18 `workflow-transitions-handler.js:168` | route อยู่หลัง `requireCanonicalPermission(PERMISSIONS.APPLICATION_WORKFLOW_TRANSITION)` + `workflow-handler-deps` (23 exports) — fixture ต้องมี permission grant จริงในฐาน ซึ่งไม่มีใน seed ของ A0 · และ hop นี้ **ไม่ได้ถูกแก้โดย PR-A0-2** (คงอยู่บน bare client โดยเจตนา) จึงไม่มี behaviour ใหม่ให้ pin |
| #19 `scheduler-audit-schedules-post-handler.js:194` | ต้อง seed ผู้ใช้ role AUDITOR ที่ ACTIVE + วันที่ไม่ชนคิว + ผ่าน collision window — fixture มีสาขาเยอะกว่าตัว hop เอง · ไม่ถูกแก้โดย PR-A0-2 |
| #20 `workflow-side-effects.js:151` | ไม่ใช่ route — เป็นฟังก์ชันที่ handler #18 เรียกต่อ ⇒ ยิงผ่าน HTTP ได้ก็ต่อเมื่อ #18 ยิงได้ก่อน |
| #21 `workflow-revision-expirations-handler.js:81` | เงื่อนไขเดียวกับ #18 (permission middleware + deps module) · ไม่ถูกแก้โดย PR-A0-2 |
| #22 `provider/work.js:496` | ต้อง seed `WorkActivity` + `StageActivityConfig` + group membership ของ user (`shared/user-groups`) ให้ตรงกันทั้งสามที่ ⇒ fixture ใหญ่กว่า hop · ส่ง tx อยู่แล้วก่อน PR-A0-2 |
| #24 `audit-scheduling-service.js:540` | ไม่ใช่ route (service call) + ต้องมี auditor ACTIVE, วันทำการตามปฏิทินวันหยุดจริง, และ tx เป็น `Serializable` ⇒ เคส (2) ต้องแยกออกแบบต่างหาก · ส่ง tx อยู่แล้วก่อน PR-A0-2 |

หลักที่ใช้ตัด: **hop ที่ PR-A0-2 ไม่ได้แก้ call site และไม่มี behaviour ใหม่ ⇒ integration ของมันคือการพิสูจน์กลไก PR-A0-1 ซ้ำ**
ซึ่งมี integration ของตัวเองอยู่แล้วที่ `__tests__/integration/status-writer-audit-default-invariant.test.js`
· ทั้ง 6 hop ยังถูก pin ที่ระดับ call-site contract (`__tests__/unit/a0-pr2-hop-emission-contract.test.js`)
· ถ้า senior-swe/operator ไม่รับเหตุผลนี้ ให้ตีกลับเป็น PR แยก (ต้นทุน fixture อยู่ที่ hop ไม่ใช่ที่ harness — harness เป็น table-driven แล้ว เพิ่มแถวได้)

**ลำดับ: PR-1 → {PR-2, PR-5 ขนาน} → PR-3, PR-4 (draft ค้างรอ operator ได้ตั้งแต่ PR-1 land)**
เหตุผลตัดสิน "ทั่วไปก่อน ไม่ใช่ Tier C ก่อน":
1. ข้อโต้แย้ง "Tier C ก่อนเพราะ coverage สูงสุด" ไม่จริงหลังเลือกกลไก (c): **coverage สูงสุดอยู่ที่ PR-1**
   (ปิด 16+1 จุดในไฟล์เดียว รวม #17 ฟรี) และ PR-1 เป็น Tier B
2. PR-3/PR-4 **ต้องการ PR-1 land ก่อน** (fail-closed ต่อยอด default mechanism — stack C บน B ที่ยังไม่ merge = rebase churn บนไฟล์เงิน)
3. ตาม tiered-merge (HARNESS_LOG:157-158): B ติดเงื่อนไข "CI เขียวจริงบน runner" — merge ได้ทันทีเมื่อ CI ฟื้น ·
   C ติด operator ซึ่งเป็นคอขวดคนละเส้น → เตรียม draft C ขนานไปได้ ไม่มีเหตุให้เอา C ขึ้นก่อน
4. ความเสี่ยงไฟล์เงิน/cert ต่ำสุดเมื่อ diff บนไฟล์เหล่านั้นแคบสุด — hybrid ทำให้ PR-3/PR-4 เป็น diff จุดเดียว
   (เพิ่ม emission ใน tx ที่มีอยู่แล้ว) แทนที่จะแบกกลไกไปด้วย

---

## 4. RED-test Invariant (นิยามสุดท้าย)

```
INVARIANT A0 (per hop H ที่เปลี่ยน Application.status บนเส้น live):
  (1) commit(H) สำเร็จ ⇒ ΔAuditLog(category=APPLICATION, action=APPLICATION_STATUS_TRANSITION,
      resourceId=applicationId, metadata.fromStatus/toStatus ตรงกับ H) = +1 พอดี (ไม่ใช่ ≥1)
  (2) แถวนั้น commit ใน transaction เดียวกับ status UPDATE — พิสูจน์ negative:
      inject failure หลัง UPDATE ก่อน commit (เช่น constraint-violating statement ใน tx เดียวกัน
      หรือ cert-gen throw บน hop PASS) ⇒ status ไม่เปลี่ยน AND Δ = 0
  (3) idempotent-retry: ยิง hop ซ้ำรอบสอง (guard "already in state" ทำงาน) ⇒ Δ รอบสอง = 0
      (M4 pattern: รัน cron สองรอบ, HARNESS_LOG:125)
  (4) hop ที่มี side-effect คู่ (PR-3 settle, PR-4 cert): failure ของ side-effect ⇒ status, audit row,
      side-effect หายพร้อมกันทั้งสาม (fail-closed — เฉพาะ Tier C hops)
```

**ตำแหน่ง test — ruling: ข้อ (1),(2),(3),(4) ต้องเป็น integration บน Postgres จริง (R-R2-1)**
- Atomicity (ข้อ 2/4) **พิสูจน์บน mock ไม่ได้โดยนิยาม** — mock ไม่มี transaction semantics;
  precedent คือ M4 (HARNESS_LOG:125: integration + self-seed + `HAS_DB` guard + assert audit +1/+0 delta) ซึ่ง operator เคาะเป็น reference pattern แล้ว
- รูปแบบ: self-seed org→user→application ที่ status ต้นทางของ hop → เรียก handler/service จริง →
  นับ AuditLog delta ด้วย where แคบ (resourceId + action + metadata) — ห้ามนับกว้าง
- **Unit (mock ได้) เฉพาะสัญญา writer ล้วนๆ ใน PR-1**: tri-state ของ onAudit (undefined→emit /
  function→callback เดียว ไม่ double / false→เงียบ) · envelope shape · "bare client → เปิด internal tx"
  (spy ว่า `$transaction` ถูกเรียก) — mock ที่อนุญาต: `prisma.application.update`, `auditLog` namespace,
  `getAuditModule()` · **ห้าม** ใช้ unit อ้างผ่านข้อ (2)
- RED-first (Law 3.11): integration test ของ hop ที่ยังไม่แก้ (เช่น #8 submit) ต้อง**แดงจริง**ที่ Δ=0
  ก่อนเริ่ม GREEN ทุก PR — แนบ output fail ตาม M4 gate "paste RED ก่อนขอ GREEN" (HARNESS_LOG:129จ)
- ลำดับ RED ตาม wave ใหม่ (แทน :58 ของ spec-reader): PR-1 invariant ทั่วไป 1 เคส → PR-2 per-hop
  (#8,#9,#12 ก่อน แล้ว #13-15,#18-22,#24) → PR-5 (B1,B2) → PR-3 (#23 MONEY) → PR-4 (#16,B3,B4)

---

## 5. Tier Classification ต่อ PR — output จริงจาก `bash scripts/probes/tier-check.sh -` (stdin mode) ใน session นี้

```
PR-1: services/application-status-writer.js=B, test=A            → TIER=B
PR-2: 10 ไฟล์ routes/handlers/cron                               → TIER=B
PR-3: services/checkout/checkout-settlement-service.js=C (money) → TIER=C
PR-4: auditor-audit-decision-handler.js=B, provider/auditor.js=B → TIER=B   ← ดูหมายเหตุ
PR-5: query-methods/assign-handler/audits.js                     → TIER=B
```
(probe อยู่สถานะ `manual-until:2026-09-15` ใน `scripts/probes/probe-registry.txt:36` — รัน manual ได้ตามนิยาม)

**หมายเหตุ MATERIAL — ช่องโหว่ tier-check:** PR-4 (ไฟล์ที่ mint/void certificate) ออกมาเป็น **B**
เพราะ `C_KEYWORD` (tier-check.sh:78-84) ไม่มี pattern `cert|certificate` — ขัดเจตนา "C-inclusive"
ของ probe เองและขัด mandate ที่สั่งให้ B3/B4 เป็น PR แยก operator merge
→ **ผม treat PR-4 เป็น operator-merge โดยนโยบาย** (เอกสารนี้ + task mandate เป็นหลักฐาน ไม่ใช่การเดา tier เอง)
และเสนอ diff ให้ operator (probe เป็น operator-owned ผมแก้ไม่ได้):

```diff
--- a/scripts/probes/tier-check.sh
+++ b/scripts/probes/tier-check.sh
@@ C_KEYWORD=(
     "money|(^|/)(payment|payments|invoice|invoicing|checkout|billing|finance|accounting|remittance)([/.]|$)"
     "money|(stripe|ksher|promptpay|webhook)"
+    "cert-issuance|(certificate|cert-service|certificates)"
     "auth-identity|(^|/)(auth|identity|rbac|permission|permissions|jwt|session|oauth|thaid)([/.-]|$)"
```
(ข้อจำกัดที่รู้: pattern คำว่า certificate จับ `auditor.js` ไม่ได้อยู่ดีเพราะชื่อไฟล์ไม่มีคำนี้ —
path-based มีเพดาน; ทางเลือกที่แม่นกว่าคือ list ไฟล์ cert-adjacent ชัดๆ ใน C_STRUCTURAL:
`provider/auditor\.js$|auditor-audit-decision-handler\.js$|certificate-service` — ยกให้ operator เลือก)

---

## 6. Findings ระหว่างทาง (นอก scope A0 แต่ต้องบันทึก — ทุกข้อมี file:line)

1. **ESLint rule มองไม่เห็น bypass คลาส `data: <Identifier>`** — `no-direct-application-status-write.js:131-135`
   ต้องการ `data` เป็น ObjectExpression ที่มี key `status` ตรงตัว; B3/B4 (`auditor.js:130-133,219-222`)
   เขียน `data: transition.updateData` (Identifier) จึงหลุด lint มาตลอด · B2 หลุดอีกชั้นเพราะผ่าน
   `applicationService.updateApplicationColumns` (indirection) — เสนอ (PR อนาคต ไม่บล็อค A0):
   rule รายงาน `data` ที่ไม่ใช่ ObjectExpression บน `prisma.application.update` เป็น warn "unverifiable payload"
2. **Caller ใหม่ #24**: `audit-scheduling-service.js:540` (รายละเอียดใน A2) — spec-reader inventory ตกไป 1 จุด
   · เพิ่มเข้า PR-2 scope แล้ว
3. GAP-MAP:68 ต้องแก้ตาม A1 (PM apply — อ้างเอกสารนี้ได้)
4. tier-check C_KEYWORD ไม่มี cert pattern (รายละเอียด §5) — รอ operator

## 7. Next (1-3 ข้อ)
1. operator: เคาะ A3-ครึ่งหลัง (ลำดับ PR-4 vs D2) + รับ/ปัด diff tier-check §5
2. implementer: เริ่ม PR-A0-1 ตาม §2 (spec: tri-state onAudit + internal tx + envelope; out-of-scope:
   failure-policy change, caller files, eslint rule) — RED integration invariant ก่อน GREEN ตาม §4
3. PM: อัปเดต GAP-MAP:68 + ตาราง QUEUE ด้วย split §3

Evidence: `evidence/A0-AUDIT-EMISSION/design-decision.md` (ไฟล์นี้) · probe output §5 รันจริงใน session
(command: `printf '%s\n' <files> | bash scripts/probes/tier-check.sh -`)
