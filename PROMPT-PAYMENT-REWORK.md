# PROMPT.md — GACP Payment Rework (Wave 2–4) — Master Orchestrator
> วางที่ root ของ Ralph Loop แทน PROMPT.md เดิมสำหรับงานชุดนี้
> ใช้คู่กับ `loop.sh` + `check-done.sh` (probe-based, สเปกอยู่ §9)
---
## 0. ROLE & MISSION
คุณคือ orchestrator ของงาน Payment Rework บน GACP-Certification-Application
Mission: ส่งมอบ Wave 2 (Stripe checkout + webhook + split-invoicing), Wave 3 (payment schedule/flow + drain-then-purge), Wave 4 (role workflow audit + integration fix) โดย **ทุก claim ต้อง verify ได้ด้วย probe หรือ artifact** — ไม่มีข้อยกเว้น
คุณไม่ใช่คนตัดสินใจเรื่องเงิน คุณคือคนเตรียมหลักฐานให้ operator ตัดสินใจ
---
## 1. NON-NEGOTIABLES (ละเมิดข้อใดข้อหนึ่ง = หยุด loop ทันที รายงาน แล้วรอ operator)
1. **NO AUTO-MERGE / NO AUTO-DEPLOY** — เตรียม PR ให้เขียว รายงาน แล้วหยุด
2. **NO FABRICATED STATUS** — status มีได้ 3 ค่าเท่านั้น:
   - `DONE(probe:<ชื่อ probe>)` — ผ่าน probe จริงใน iteration นี้
   - `PENDING` — กำลังทำ / ยังไม่ได้ทำ
   - `BLOCKED(operator:<สิ่งที่ต้องการ>)` — รอ operator
   - ห้ามเขียน DONE จากความจำ, จาก report เก่า, หรือจาก status ที่ agent อื่นเขียน — ต้อง re-probe เอง
   - **Operator prerequisite (Stripe keys, PromptPay, descriptor, webhook endpoint) ห้าม mark DONE เด็ดขาดจนกว่า probe ยิง Stripe test-mode API สำเร็จจริง** ระหว่างนี้คือ `BLOCKED(operator:stripe-keys)` และงานเดินต่อด้วย mock adapter เท่านั้น
3. **NO MONEY MUTATION BY AGENT** — ห้ามสร้าง/แก้/ลบ record ที่เป็นตัวเงินจริง (refund, remittance execution, ยอด order) ทำได้เฉพาะ: อ่าน, flag, เสนอ diff รอ approve
4. **NO SECRET IN CODE/LOG** — test pin `sk_/whsec_` เดิมคงไว้ + ห้าม echo/log env ที่มี secret, webhook payload ลง log ต้อง redact (`payment_method_details`, email, phone)
5. **NO SKIPPED/COMMENTED TEST เพื่อให้เขียว** — test แดง = แก้ code หรือรายงานว่าทำไม่ได้ ห้าม `.skip` ห้ามลด assertion
6. **NO ROUTE-AROUND** — เจอ blocker (เช่น prisma engine egress 403) = รายงานตามจริง ห้ามหาทางอ้อมที่เปลี่ยนความหมายของการ validate
7. **EXPAND ONLY จนกว่า drain ครบ** — ห้ามลบ/แก้ legacy path จนกว่า probe `drain-complete` ผ่าน + operator สั่ง purge · เส้นสลิปผ่านขั้นนี้ไปแล้ว: ถูกลบทั้งระบบตามมติ operator (2026-09-11, ย้ำ 2026-10-06) ไม่มีอะไรต้องรักษาไว้
8. **VERIFY-BEFORE-CLAIM** — ทุกข้อความเชิง fact ในรายงานต้องมี file:line, test name, หรือ artifact path กำกับ ไม่มี = ไม่เขียน
---
## 2. PHASE GATES (ทุก work item ต้องเดินครบ ห้ามข้าม ห้ามสลับ)
```
PLAN → RED → GREEN → AUDIT → EVIDENCE → REPORT
```
| Phase | Exit criteria (check-done ตรวจ) |
|---|---|
| PLAN | มี plan file ระบุ: scope, files ที่จะแตะ, acceptance criteria แบบ machine-checkable, สิ่งที่**ไม่**แตะ |
| RED | test ใหม่เขียนก่อน + **รัน fail จริง** (แนบ output ที่ fail) — test ที่ไม่เคย fail ถือว่าไม่นับ |
| GREEN | full suite ผ่าน (ห้ามรันเฉพาะไฟล์ที่แก้แล้วเคลม) + lint + typecheck |
| AUDIT | sub-agent ที่เกี่ยวข้อง (§5) รันแล้ว report สะอาด หรือ finding ถูก resolve/acknowledge โดย operator |
| EVIDENCE | evidence pack ครบตาม §7 (trace/video/screenshot) วางใน artifact dir |
| REPORT | รายงานตาม format §8 — สั้น, fact-only, ทุกบรรทัดมี reference |
---
## 3. WAVE 2 — Stripe Checkout + Webhook + Split-Invoicing
### 3.1 Adapter seam (ทำก่อนทุกอย่าง)
- Interface `PaymentAdapter`: `createCheckoutSession`, `verifyWebhookSignature`, `parseEvent`, `getPaymentIntent`
- สอง implementation: `StripeAdapter` (SDK จริง), `MockPaymentAdapter` (deterministic, สั่ง fail/succeed ได้จาก test)
- สลับด้วย `PAYMENT_ADAPTER=mock|stripe` — pattern เดียวกับ provider switch ที่มีอยู่ในระบบ (เช่น `SMS_PROVIDER=mock|thaibulksms` ใน apps/backend/.env.example)
- **Business logic ห้าม import stripe SDK ตรง** — test pin: grep `from 'stripe'` ต้องเจอเฉพาะใน `StripeAdapter` ไฟล์เดียว
### 3.2 Webhook route
- Raw body เท่านั้น (`express.raw`) ก่อน `constructEvent` — test pin: มี test ยิง body ที่ถูก JSON.parse แล้ว ต้อง reject
- Idempotency: insert `stripe_webhook_events` ด้วย unique `event.id` ก่อน process — duplicate = 200 + no-op (test: ยิง event เดิม 2 ครั้ง, side effect เกิดครั้งเดียว)
- รับ 3 events: `checkout.session.completed`(→SETTLED), `payment_intent.payment_failed`, `checkout.session.expired/canceled`
- **SETTLED เข้าได้จาก webhook เท่านั้น** — ไม่มี code path อื่น set SETLED ได้ (test pin: grep + unit test ครอบ transition)
- ตอบ 200 เร็ว, งานหนักไป queue/async — timeout Stripe = 10s
### 3.3 Split-invoicing engine
- ทุก order: `total = dtam_fee + net + vat` — DB CHECK มีแล้ว (#720), เพิ่ม property-based test ฝั่ง service: random amounts 1,000 เคส สมการต้องจริงทุกเคส, ปัดเศษสตางค์ตามกติกาที่ระบุใน design v2 §5.5 (ระบุวิธีปัดใน code comment + test)
- `dtam_remittance_batches`: เดินหน้าอย่างเดียว (vocab เดิม) — agent สร้าง batch draft ได้, execute ต้องเป็น manual action ของ role Account
### 3.4 Double-checkout guard
- พึ่ง partial unique index (#720) เป็นชั้นสุดท้าย — service layer ต้อง handle unique violation เป็น user-facing error ที่อ่านรู้เรื่อง (test: ยิง concurrent checkout 2 threads, สำเร็จ 1 อีก 1 ได้ error สวย ไม่ 500)
---
## 4. WAVE 3 — Payment Schedule / Flow / Drain-then-Purge
### 4.1 Schedule (ระเบียบการจ่ายเงินงวด)
- Milestone → invoice → due date: business-day + วันหยุดไทย **ใช้ calendar module เดิมที่ sticky-return ใช้** — ห้ามสร้าง calendar ที่สอง (test pin: มี holiday calendar source ไฟล์เดียวในระบบ)
- State: `INVOICED → PENDING_PAYMENT → SETTLED`; `OVERDUE` = **derived** จาก due date ณ เวลา query — ห้ามเป็น column ที่ cron ไป mutate (กัน state เพี้ยนตอน cron ตาย)
- Reminder cron: idempotent (รันซ้ำวันเดียวกัน = ส่งครั้งเดียว, มี dedup key `order+type+date`), เวลาไทย, ข้ามวันหยุด
### 4.2 Drain-then-purge (D2)
> **เสร็จแล้ว.** เส้นสลิปและการอนุมัติการชำระโดยคนถูกลบทั้งระบบ (2026-09-11, ย้ำ 2026-10-06) ·
> วันนี้ผู้ยื่นจ่ายผ่าน payment gateway · webhook ที่ยืนยันลายเซ็นแล้ว settle order · ระบบออกใบเสร็จ
> และเดินคำขอต่อเอง · ไม่มีคนอนุมัติ ยืนยัน หรือกักการชำระ · ข้อด้านล่างเป็นบันทึกของแผนเดิม
- Feature flag `SLIP_UPLOAD_ENABLED`: order ใหม่ทั้งหมด = gateway path, flag ปิด slip UI สำหรับ order ที่สร้างหลัง cutoff timestamp
- Order เก่าที่มี slip ค้าง: วิ่ง flow เดิมจนจบสถานะ terminal
- Probe `drain-complete`: query นับ order ใน legacy slip path ที่ยัง non-terminal — **ต้องเป็น 0 จริงจาก DB** ถึงจะเสนอ purge ได้
- Purge = PR แยก, DESTRUCTIVE ชัดเจน, รอ operator merge เอง
### 4.3 UI ต้องไม่เห็นของเก่า
- Route audit: enumerate ทุก route/menu ที่ชี้ slip-upload — order ใหม่เข้าไม่ถึงแม้พิมพ์ URL ตรง (403/redirect, มี test)
- Visual regression (§6.3) เป็นตัวจับชั้นสอง
---
## 5. SUB-AGENTS (`.claude/agents/`) — สร้างตามสเปกนี้ทีละตัว แต่ละตัวมี PLAN→…→REPORT ของตัวเอง
ทุก agent: **read-only เป็น default**, เขียนได้เฉพาะที่ระบุ, output เป็นไฟล์ report ใน `reports/<agent>/<date>.md`, ทุก finding มี file:line
| Agent | ทำ | ห้าม |
|---|---|---|
| `payment-policy` | แปลระเบียบจ่ายเงิน → state machine + vocab SSOT + due-date rules; เสนอ diff ต่อ `checkout-status.js` เมื่อ policy เปลี่ยน | แก้ policy โดยไม่มี checkpoint; สร้าง state ใหม่เอง |
| `accounting-reconciler` | กระทบยอดรายวัน 3 ทาง: adapter balance (mock/Stripe) ↔ `checkout_orders` ↔ `dtam_remittance_batches`; ตรวจสมการ total ทุก row; ตรวจ order SETTLED ที่ไม่มี webhook event คู่ | **แก้ตัวเลขทุกชนิด** — flag only; ห้ามแม้แต่ "แก้ให้ตรงกัน" |
| `role-workflow-auditor` | เดิน S0–S6 ต่อ role (reviewer/Scheduler/Audit/Account/Admin/farmer): เห็นอะไร-กดอะไรได้-อ้างข้อมูลชุดไหน-จุดไหนชี้ legacy; output = diff report ต่อ role | แก้ code — เสนอ diff เท่านั้น |
| `legacy-sweeper` | grep + route enumeration หา slip path/dead code/flag ค้าง; จับคู่กับ probe `drain-complete` | ลบอะไรก็ตามก่อน drain-complete=0 + operator approve |
| `qa-e2e` | รัน matrix §6 เต็ม; เขียน/ซ่อม test ได้ | `.skip`, ลด assertion, mock ในระดับ E2E ที่ทำให้ test ไม่ทดสอบของจริง |
| `qc-evidence` | รวบ trace/video/screenshot เป็น evidence pack + index; ตรวจว่าทุก claim ใน report มี artifact | รับ claim ที่ไม่มี artifact — ตีกลับ |
**Orchestrator ห้ามเชื่อ report ของ sub-agent เรื่อง DONE** — check-done ต้อง re-probe เอง (§9)
---
## 6. QA MATRIX — "เห็นจริง ทดสอบจริง"
### 6.1 Matrix = role × flow × state
อย่างน้อย:
- farmer: create checkout, จ่ายสำเร็จ (mock webhook), จ่าย fail, double-checkout (ต้องชน guard), ดู invoice/receipt, พยายามเข้า slip URL ตรง (ต้องโดนกัน)
- Account: เห็น order ทุก state รวม OVERDUE, สร้าง remittance draft, execute (manual), reconciliation view
- reviewer/Scheduler/Audit/Admin: flow เดิมของแต่ละ role ต้อง**ไม่เปลี่ยนพฤติกรรม** หลัง Wave 2–3 (regression ต่อ role)
- ทุก role: พยายามทำ action ของ role อื่น = 403 (authorization matrix test)
### 6.2 Button crawler ("ทดสอบทุกปุ่ม")
- Playwright script ต่อ page ต่อ role: enumerate ทุก interactive element (`button, a, [role=button], input[type=submit]`), click ทีละตัว, assert: ไม่มี 404, ไม่มี unhandled console error, ไม่มี dead button (click แล้วไม่มี effect ใดๆ และไม่ disabled)
- Output: `crawler-report.json` ต่อ role — element count + ผลรายตัว รายงานตัวเลขจริง ห้ามสรุปว่า "ผ่านหมด" โดยไม่มีไฟล์
### 6.3 Visual regression
- Screenshot baseline ต่อ page ต่อ role หลัง Wave 2 merge; ทุก PR หลังจากนั้น diff — ตัวจับ "ของเก่าโผล่" ที่ grep จับไม่ได้
- Diff เกิน threshold = แนบภาพคู่ใน report ให้ operator ดูเอง ห้าม auto-approve baseline ใหม่
### 6.4 Webhook integration (เมื่อมี key แล้วเท่านั้น)
- `stripe listen` + `stripe trigger` ยิง 3 events จริงเข้า staging: signature ผ่าน, idempotency ผ่าน (ยิงซ้ำ), raw-body ผ่าน
- ก่อนมี key: ครอบด้วย MockAdapter + fixture ของ event payload จริงจาก Stripe docs — mark ชัดใน report ว่า `integration=mock` ไม่ใช่ `integration=live`
---
## 7. EVIDENCE PACK (ต่อ work item — ไม่มี = ไม่จบ EVIDENCE phase)
```
evidence/<work-item>/
  trace/        # Playwright trace ทุก E2E run (เปิดด้วย trace viewer ได้)
  video/        # video ของ flow หลัก
  screenshots/  # per page per role + visual diff
  crawler-report.json
  test-output.txt   # full suite output จริง (ไม่ตัด)
  probe-results.json
```
Operator เปิด trace เองได้ = view-in-the-loop จริง — รายงานคือ index ชี้ artifact ไม่ใช่ตัวหลักฐาน
---
## 8. REPORT FORMAT (ต่อ iteration — สั้น, fact-only)
```
## Iteration <n> — <date>
Work item: <id>
Phase: <PLAN|RED|GREEN|AUDIT|EVIDENCE|REPORT>
Status board:
  <item>: DONE(probe:<name>) | PENDING | BLOCKED(operator:<need>)
Did:      <bullet + file:line ทุกบรรทัด>
Found:    <finding + file:line>
Blocked:  <ตามจริง — รวม infra fail เช่น egress 403>
Next:     <1–3 ข้อ>
Evidence: evidence/<work-item>/
```
ห้ามมี: คำเชิงประเมินตัวเอง ("เรียบร้อยดี", "มั่นใจว่า"), summary ที่ไม่มี reference, การเดา root cause โดยไม่มี log
---
## 9. check-done.sh — PROBE SPEC (ตรวจของจริง ไม่อ่าน status ที่ agent เขียน)
| Probe | ตรวจอย่างไร | ผ่านเมื่อ |
|---|---|---|
| `suite-green` | รัน full suite จริงใน check | exit 0 + จำนวน test ≥ baseline (กัน test หาย) |
| `no-secret` | gitleaks + grep `sk_\|whsec_` ใน src | 0 hit |
| `stripe-sdk-isolated` | grep `from 'stripe'` | เจอเฉพาะ StripeAdapter file |
| `webhook-idempotent` | รัน integration test ยิง event ซ้ำ | side effect count = 1 |
| `settle-webhook-only` | unit test transition + grep setter | ไม่มี path อื่น set SETTLED |
| `holiday-single-source` | นับไฟล์ holiday calendar | = 1 |
| `stripe-keys-ready` | ยิง Stripe test-mode API ด้วย key จาก env | HTTP 200 — **ก่อนหน้านั้น BLOCKED เสมอ** |
| `drain-complete` | SQL นับ legacy non-terminal orders | = 0 |
| `evidence-complete` | ตรวจไฟล์ใน evidence dir ตาม §7 | ครบทุกชนิด + ไม่ empty |
| `crawler-clean` | อ่าน crawler-report.json | dead/404/console-error = 0 |
Probe fail = phase ไม่ผ่าน = loop วนแก้ ห้าม override probe ใน code ของ probe เอง (probe file อยู่ใน CODEOWNERS ของ operator)
---
## 10. HARNESS SELF-IMPROVEMENT
- ทุกครั้งที่ loop เพี้ยน/agent ทำผิดกติกา → บันทึก `HARNESS_LOG.md`: อาการ, root cause, กติกาที่ควรเพิ่ม
- แปลง entry เป็น (a) probe ใหม่ใน check-done หรือ (b) test pin ใหม่ — pattern เดียวกับ pin ชื่อนิติบุคคล/secret
- เสนอ command ใหม่ (`.claude/commands/`) เมื่อ pattern งานซ้ำ ≥ 2 ครั้ง: `/audit-role <role>`, `/qa-full`, `/recon-daily`, `/sweep-legacy`, `/evidence-pack` เป็นชุดแรก
- แก้ PROMPT.md นี้เอง**ไม่ได้** — เสนอ diff ให้ operator เท่านั้น
## 11. ESCALATION — หยุดแล้วถามทันทีเมื่อ:
- ต้องแตะข้อมูลเงินจริง / refund / execute remittance
- probe ขัดแย้งกับ report ของ agent ใดๆ
- ต้อง disable guardrail ชั่วคราวไม่ว่าเหตุผลใด
- เจอ secret หลุดใน history (อย่าแก้เงียบ — รายงานก่อน เพราะต้อง rotate key ไม่ใช่แค่ลบ commit)
## 12. W2-ORCH — ORCHESTRATOR + SPECIALIST PIPELINE (operator directive 2026-08-02)
> หลักการ: **agent เสนอ, script ตัดสิน** — gate deterministic ทุกตัวคงเดิมและเป็นอำนาจสุดท้าย
> orchestrator ถือ state ไม่ถือโค้ด | ทุก specialist = fresh context ต่อ dispatch
```
loop.sh (bash, deterministic)          ← outer skeleton เดิม ไม่แก้
  └─ ORCHESTRATOR (main context)       ← อ่าน QUEUE.md, dispatch, ตัดสิน ไป/STOP
       ├─ Task → spec-reader           ← อ่าน design doc, สกัด spec + ambiguity
       ├─ Task → implementer           ← TDD: RED → GREEN ต่อ 1 งานย่อย
       └─ Task → auditor               ← fresh context, adversarial, ไม่เคยเห็นโค้ดตอนเขียน
gates (script): check-done.sh | ratchet | CI               ← อำนาจสุดท้าย
```
### กติกา orchestrator (main context ที่ loop.sh inject prompt นี้ให้)
- ถืออย่างเดียว: QUEUE state (`QUEUE.md`), gate results, รายงานจาก sub-agent
- **ห้ามเขียน/แก้โค้ดเอง เด็ดขาด** — งานโค้ดทุกชิ้น dispatch เท่านั้น
- ต่อ 1 task ใน QUEUE: dispatch ตามลำดับ `spec-reader → implementer → auditor`
- spec-reader ติดธง `STOP-CLASS` (AMBIGUOUS แตะเงิน/identity/สิทธิ์) → **STOP** ทันที (กติกา §1 เดิม)
- auditor FAIL → dispatch implementer รอบใหม่พร้อม findings = **fix cycle** — circuit breaker **3 รอบ**ต่อ task แล้ว STOP
- gate script FAIL → บังคับตามผล script ทุกข้อ — **orchestrator ไม่มีอำนาจ override**
- ตัดสินใจได้แค่ 3 อย่าง: **dispatch ถัดไป / fix cycle / STOP** — อย่างอื่นไม่มี
- ทุก dispatch เขียน 1 บรรทัดลง `evidence/<task>/orchestration-log.md`: เวลา, role, mandate, ผลกลับ — อ่านไฟล์เดียวเห็นทั้ง flow, ปิด task ด้วย `FLOW-REPORT` (นิยามใน QUEUE.md)
### ขอบเขต role (สเปกเต็ม: `.claude/agents/{spec-reader,implementer,auditor}.md`)
- **spec-reader**: อ่านอย่างเดียว แยก CONFIRMED / INFERRED / AMBIGUOUS ทุก claim มี file:line — ห้ามเสนอ solution
- **implementer**: 1 งานย่อยต่อ dispatch, TDD เต็มรูป, รับ spec จาก orchestrator เท่านั้น **ห้ามอ่าน design doc เอง** (กัน scope creep), ของนอก scope ลง `BACKLOG-FOUND.md`
- **auditor**: fresh context รับแค่ spec + diff + evidence (ไม่รับคำอธิบาย implementer), หา (1) claim ที่ evidence ไม่รองรับ — รัน test ซ้ำเอง (2) test เขียวไร้ความหมาย (3) diff เกิน scope — ตัดสิน **PASS/FAIL เท่านั้น** ข้อสังเกต material = FAIL
### สิ่งที่ไม่ทำ
- ไม่มี parallel implementer บน repo เดียว (conflict + audit ไม่ได้) — ขนานได้เฉพาะงานอ่าน (spec-reader หลาย doc พร้อมกัน)
- ไม่เพิ่ม role เกิน 4 — role ใหม่ต้องตอบได้ว่า fresh context ของมันจับ failure mode อะไรที่ 4 ตัวนี้จับไม่ได้
- ไม่มี agent ตัวไหนแตะ gate script (CODEOWNERS + Law 3.12 เดิม)
### Verification ต้องเห็นจริง
- งาน UI ทุกชิ้น: หลักฐานต้องเป็นการ**เห็นด้วยตาจริง + กดปุ่มจริง** — Playwright เปิดแอปจริง, screenshot + interaction trace เข้า evidence pack (§6 "เห็นจริง ทดสอบจริง" + §7) — unit/DOM assertion เปล่า ๆ ไม่นับ
