# PAYMENT-SCHEDULER REALITY CHECK — 2026-08-04
งาน read-only ตาม QUEUE.md:240-266 · branch ที่ทำงาน `fix/status-writer-scanner-blind-spots` (ไม่แตะไฟล์ในรีโป ไม่รันคำสั่ง git ที่เปลี่ยนสถานะ)

---

## ส่วนที่ 1 — flow เงินกับคิว ตั้งแต่ยื่นถึงออกใบรับรอง (อ่านเรียงลำดับเดียว)

1. เกษตรกรกรอกคำขอแล้วกดส่ง ระบบตั้งใบแจ้งหนี้งวดที่ 1 ให้ทันทีในจังหวะที่ส่งคำขอ (apps/backend/controllers/wizard-controller.js:406) และคำขอย้ายไปสถานะ "รอชำระค่าเอกสาร" (apps/backend/routes/api/applications/applications.js:556)
2. ใบแจ้งหนี้งวดที่ 1 ออกเป็นสองใบเสมอ ใบหนึ่งเป็นค่าธรรมเนียมของกรม อีกใบเป็นค่าบริการของบริษัทบวกภาษี (apps/backend/services/application-service/application-phase-invoice-methods.js:436-459)
3. วันนี้เกษตรกรจ่ายด้วยการโอนเงินเข้าบัญชีแล้วอัปโหลดสลิปเข้าระบบ (apps/backend/routes/api/finance/payment-slips.js:201) สถานะเปลี่ยนเป็น "รอตรวจสลิปงวด 1" (apps/backend/services/payment-slip-service.js:334)
4. ฝ่ายบัญชีเป็นคนกดอนุมัติสลิป ระบบจะเลื่อนคำขอเป็น "ชำระค่าเอกสารแล้ว" ก็ต่อเมื่อสลิปครบทั้งสองใบของงวดนั้น (apps/backend/services/payment-slip-service.js:1042, :1265)
5. คำขอที่ยังไม่จ่ายเดินต่อไม่ได้ เพราะทางออกทางเดียวของสถานะ "ชำระค่าเอกสารแล้ว" คือส่งเข้าคิวตรวจเอกสาร และคนจัดคิวจะกดมอบหมายผู้ตรวจได้ต่อเมื่อคำขออยู่ในสถานะจ่ายแล้วเท่านั้น (apps/backend/services/workflow-transition-service.js:56, apps/backend/routes/api/provider/handlers/scheduler-assign-reviewer-handler.js:88)
6. งานไม่ได้เข้าคิวใครโดยอัตโนมัติ ระบบเพียงเปลี่ยนสถานะ แล้วรายการไปโผล่ในหน้าจอของเจ้าหน้าที่จัดคิว ต้องมีคนกดเลือกผู้ตรวจเอง (apps/backend/routes/api/provider/handlers/scheduler-assign-reviewer-handler.js:40)
7. ผู้ตรวจเอกสารตัดสินได้สองทาง คือผ่าน หรือให้กลับไปแก้ไข การกลับไปแก้ไขไม่เก็บเงินเพิ่ม และวนได้ไม่จำกัดรอบ แต่มีเส้นตาย 5 วันทำการ ถ้าเลยเส้นตายคำขอจะหมดอายุ (apps/backend/routes/api/applications/applications.js:557, apps/backend/services/workflow-transition-service.js:200-203, apps/backend/config/business-rules.js:121)
8. พอเอกสารผ่าน ระบบจะออกใบแจ้งหนี้งวดที่ 2 ให้เองในจังหวะนั้น ไม่ได้ออกไว้ล่วงหน้าตั้งแต่ตอนยื่น (apps/backend/routes/api/provider/handlers/workflow-side-effects.js:164-175)
9. เกษตรกรจ่ายงวดที่ 2 ด้วยวิธีเดียวกับงวดแรก คือโอนแล้วอัปโหลดสลิป ฝ่ายบัญชีอนุมัติ (apps/backend/services/payment-slip-service.js:342)
10. เมื่อจ่ายงวดที่ 2 ครบ คำขอจึงเข้าคิวรอ "นัดตรวจ" และเจ้าหน้าที่จัดคิวเป็นคนเลือกวัน เลือกผู้ตรวจ และเลือกว่าจะตรวจที่แปลงจริงหรือตรวจแบบออนไลน์ (apps/backend/services/audit-scheduling-service.js:263-290, apps/backend/routes/api/provider/handlers/scheduler-audit-schedules-post-handler.js:46-53)
11. ระบบห้ามนัดวันเสาร์อาทิตย์และวันหยุดราชการ และห้ามนัดชนเวลาเดิมของผู้ตรวจคนเดียวกัน (apps/backend/routes/api/provider/handlers/scheduler-audit-schedules-post-handler.js:65, :150-185)
12. เกษตรกรขอเลื่อนนัดได้ แต่เป็นแค่คำขอ ต้องให้เจ้าหน้าที่จัดคิวอนุมัติ และการเลื่อนนัดไม่มีการเก็บเงินเพิ่มในโค้ด (apps/backend/routes/api/audit/scheduling.js:111, apps/backend/services/audit-scheduling-service.js:773)
13. ผู้ตรวจลงพื้นที่แล้วตัดสิน ผ่าน / ให้แก้ไข / ไม่ผ่าน ถ้าให้แก้ไข เกษตรกรส่งหลักฐานแก้ไขกลับมาโดยไม่ต้องจ่ายเพิ่ม (apps/backend/routes/api/provider/handlers/auditor-audit-decision-handler.js:152-161, apps/backend/routes/api/applications/applications.js:558)
14. ถ้าผ่าน ระบบออกใบรับรองให้ในขั้นตอนเดียวกับที่ผู้ตรวจกดผ่าน ไม่มีค่าธรรมเนียมงวดที่สาม (apps/backend/routes/api/provider/handlers/auditor-audit-decision-handler.js:182-188, apps/backend/config/payment-fees.js:10)

สิ่งที่ยังไม่เปิดใช้จริงในเส้นนี้ คือช่องทางจ่ายเงินออนไลน์ (บัตร/พร้อมเพย์ผ่านผู้ให้บริการรับชำระเงิน) — เขียนโค้ดฝั่งหลังบ้านไว้แล้วแต่ยังปิดสวิตช์ทุกเครื่อง และหน้าจอฝั่งผู้ใช้ยังไม่มีขั้นตอนกรอกข้อมูลจ่ายเงินจริง (รายละเอียดข้อ 6)

---

## ส่วนที่ 2 — คำตอบ 6 ข้อ

### 1. Milestone — มีกี่ตัว ราคาเท่าไหร่ mint ตอนไหน

**มี 2 ตัวเท่านั้น: M1 และ M2**
- `MILESTONES = ['M1','M2']` — apps/backend/shared/checkout-status.js:29
- DB บังคับด้วย CHECK `milestone IN ('M1','M2')` — apps/backend/prisma/migrations/20260802150000_wave1_checkout_engine_expand/migration.sql:53-55
- ฝั่ง legacy ใช้คำว่า PHASE_1 / PHASE_2 คู่กัน — apps/backend/services/application-service/application-phase-invoice-methods.js:361, apps/backend/routes/api/finance/payments.js:59-68

**ราคา (คิดต่อ 1 scope = 1 วิธีปลูก)**
- ค่าธรรมเนียมรัฐ งวด 1 = 5,000 / งวด 2 = 25,000 — apps/backend/config/business-rules.js:34, :36
- ค่าบริการแพลตฟอร์ม 10% ของค่าธรรมเนียมรัฐ, VAT 7% ของค่าบริการ — apps/backend/config/business-rules.js:40, :42
- สูตรจริง: state = rate x scopeCount, platform = round(state x 0.10), vat = round(platform x 0.07), total = state+platform+vat — apps/backend/modules/billing/internal/fee-service.js:99-102
- ตรวจด้วยการรันโมดูลจริงใน session นี้ (read-only): scope=1 → งวด1 = 5,535 / งวด2 = 27,675 · scope=2 → งวด1 = 11,070 / งวด2 = 55,350
- **หมายเหตุที่ต้องระวัง**: มีตารางราคาชุดที่สองที่ hardcode ไว้แบบ 1 scope ตายตัวใน apps/backend/config/payment-fees.js:23-31 (PHASE_1_TOTAL 5535, PHASE_2_TOTAL 27675) และ TOTAL_STANDARD_FEE 33210 ที่ :38 — ไฟล์นี้ถูก require เฉพาะเพื่ออ่าน `VAT_RATE` (apps/backend/services/accounting-service.js:377, apps/backend/services/journal-entry-service.js:249, apps/backend/services/financial-export-service.js:188, apps/backend/services/split-payment-calculator.js:102) ส่วน `computePhaseBreakdown` (payment-fees.js:118) ค้นแล้ว **ไม่พบ caller นอก test** (git grep `computePhaseBreakdown` ใน apps/backend)

**mint ตอนไหน — ไม่ได้สร้างพร้อมกันทั้งชุด**
- เส้นที่ใช้จริงวันนี้ (slip): งวด 1 สร้างตอนส่งคำขอ (apps/backend/controllers/wizard-controller.js:406) และตอนกดยอมรับใบเสนอราคา (apps/backend/routes/api/applications/quotations.js:323) · **งวด 2 สร้างเฉพาะตอนเอกสารผ่าน** ใน auto-chain DOC_APPROVED → PENDING_AUDIT_FEE (apps/backend/routes/api/provider/handlers/workflow-side-effects.js:164-175)
- เส้น Stripe (ยังปิด): สร้างทีละ milestone ตอนที่ผู้ใช้กดเปิด checkout และรัฐของคำขอต้องอยู่ในชุดที่จ่ายงวดนั้นได้ — M1 = DRAFT/SUBMITTED/PENDING_DOC_FEE, M2 = DOC_APPROVED/PENDING_AUDIT_FEE (apps/backend/services/checkout/stripe-checkout-service.js:39-42, :107-110) หนึ่ง checkout = หนึ่ง order + หนึ่ง invoice (:141, :160)
- ค้นทุกจุดที่สร้าง order/invoice ด้วย `git grep "checkoutOrder.create\|invoice.create("` — จุดที่เกี่ยวกับ milestone มีแค่ 3 จุดข้างบน (ที่เหลือคือ e2e-controller.js:386, preview-financial-utils.js:133, seed-test-data.js:118, quote-service.js:347, subscription-order-service.js:162 ซึ่งไม่ใช่เส้น milestone)

**คำถามที่ operator ถามตรง: เคสที่ตกตอนตรวจเอกสาร จะมีใบแจ้งหนี้ M2 ค้างไหม**
**ไม่มี** — เพราะจุดสร้างใบแจ้งหนี้งวด 2 มีจุดเดียวและอยู่หลัง DOC_APPROVED (workflow-side-effects.js:175) ส่วนเส้นทางที่เอกสารไม่ผ่านคือ ASSIGNED_FOR_REVIEW → REVISION_REQUESTED → EXPIRED ซึ่งไม่ผ่าน DOC_APPROVED เลย (apps/backend/services/workflow-transition-service.js:58-59)

**แต่พบเงินค้างชนิดอื่นที่ควรรายงาน (จากโค้ด ไม่ใช่จากการให้เหตุผล)**
- คำขอที่จ่ายงวด 1 แล้ว เอกสารผ่าน แล้วไม่จ่ายงวด 2 จะค้างถาวร: สถานะ PENDING_AUDIT_FEE ไม่มี edge ไป EXPIRED เลย (apps/backend/services/workflow-transition-service.js:62) ใบแจ้งหนี้งวด 2 ค้าง `pending` ไปเรื่อย ๆ
- ไม่มีทางยกเลิก/ตัดหนี้ใบแจ้งหนี้: ฟังก์ชัน `forfeitRevenue` มีอยู่ (apps/backend/services/invoice/invoice-finance-ops.js:103-116) แต่ค้นแล้ว **ไม่พบ route หรือ job ที่เรียก** (git grep `forfeitRevenue` เจอเฉพาะ invoice-service.js:687 ที่เป็น wrapper และ test) และ route ฝั่งการเงินมีแค่ hold (invoice-payment-handlers.js:135) กับ release (:162) ไม่มี forfeit
- เงินที่เข้ามาหลังเคสตายแล้ว ระบบบันทึกไว้ แต่ไม่เลื่อนสถานะ และมีแค่ alert (apps/backend/services/payment-slip-service.js:1255-1258, :1293-1299)

### 2. Gate การชำระ — ขั้นไหนต้องจ่ายก่อนถึงเดินต่อ

**การอ้างอิง S0–S6**: คำว่า S0–S6 นิยามที่ .claude/agents/role-workflow-auditor.md:9 ("canonical 7-step workflow (S0 ยื่นคำขอ → S6 ใบรับรอง)") ส่วนตาราง 7 ขั้นตอนของจริงอยู่ที่ docs/payment-refactor/step2-data-model-design.md:14-22 (ขั้นที่ 1 ยื่นคำขอ + จ่ายงวด 1 … ขั้นที่ 7 ออกใบรับรอง) ดังนั้น S0 = ขั้น 1 และ S6 = ขั้น 7

**Gate 1 — หลัง S0 (ยื่นคำขอ) ก่อนเข้า S2 (ตรวจเอกสาร)**
- สถานะ DOC_FEE_PAID มีทางออกเดียวคือ ASSIGNED_FOR_REVIEW — apps/backend/services/workflow-transition-service.js:56
- คนจัดคิวจะมอบหมายผู้ตรวจเอกสารได้เฉพาะเมื่อคำขออยู่ DOC_FEE_PAID เท่านั้น มิฉะนั้น 400 — apps/backend/routes/api/provider/handlers/scheduler-assign-reviewer-handler.js:86-92
- เข้าสู่ DOC_FEE_PAID ได้ 2 ทาง: ฝ่ายบัญชีอนุมัติสลิป (apps/backend/services/workflow-transition-service.js:100-105 + apps/backend/services/payment-slip-service.js:334, :1265) หรือ webhook ของ Stripe ในฐานะ SYSTEM (apps/backend/services/workflow-transition-service.js:170) — ไม่มี role มนุษย์คนไหนถือ edge PENDING_DOC_FEE→DOC_FEE_PAID โดยตรง

**Gate 2 — หลัง S3 (เอกสารผ่าน) ก่อนเข้า S5 (ลงพื้นที่)**
- บล็อกจริงที่ 3 จุด และทั้งสามจุดต้องการ AUDIT_FEE_PAID:
  - apps/backend/routes/api/provider/handlers/scheduler-audit-schedules-post-handler.js:107-121 (เช็คสถานะ + เช็คว่าเงินงวด 2 settle จริง)
  - apps/backend/services/audit-scheduling-service.js:449-456 (เส้น /audit/scheduling/assign)
  - apps/backend/shared/phase2-schedule-gate.js:65-75 ใช้โดย apps/backend/routes/api/audit/audits.js:389-392 (เส้น PATCH /audits/:id/schedule)
- AUDIT_FEE_PAID มีทางออกเดียวคือ AUDIT_CONFIRMED — apps/backend/services/workflow-transition-service.js:64
- เข้าสู่ AUDIT_FEE_PAID ได้ 2 ทางเหมือน gate แรก: บัญชีอนุมัติสลิปงวด 2 (payment-slip-service.js:342, :1265) หรือ webhook (workflow-transition-service.js:171)

**ไม่มี gate ที่ 3**
- ไม่มีค่าธรรมเนียมออกใบรับรอง — apps/backend/config/payment-fees.js:10
- endpoint สร้างการชำระงวด 2 แบบเก่าถูกปิดเป็น 410 — apps/backend/routes/api/finance/payments.js:388-396

### 3. Scheduler — อัตโนมัติหรือคนกด ใครเลือกวัน/ผู้ตรวจ/พื้นที่ มี capacity ไหม

**อัตโนมัติแค่เปลี่ยนสถานะ ไม่ใช่จ่ายงาน**
- ตอนเงินเข้า ระบบเลื่อนสถานะให้เอง M1 → DOC_FEE_PAID, M2 → AUDIT_FEE_PAID (apps/backend/services/checkout/checkout-settlement-service.js:42-45, :215-228) หรือฝั่ง slip ที่ apps/backend/services/payment-slip-service.js:1265-1270
- "คิว" คือการ query ตามสถานะเท่านั้น ไม่มีการจองงาน ไม่มีการกดรับงาน — apps/backend/services/audit-scheduling-service.js:263-290 (where status = AUDIT_FEE_PAID, take 500, เรียงตาม updatedAt)
- ค้น auto-assign / round-robin ด้วย `git grep -niE "round.robin|auto.assign|autoAssign"` ใน apps/backend → **ไม่พบตัวจ่ายงานอัตโนมัติ** เจอแค่ apps/backend/services/assignment-ledger-query-service.js:154 ซึ่งเป็นรายงานความเป็นธรรมย้อนหลัง ไม่ใช่ตัวจัดงาน

**คนเลือกทั้งหมด**
- เจ้าหน้าที่จัดคิวส่ง auditorId, scheduledDate, inspectionMode, สถานที่/ลิงก์ มาจาก request body ตรง ๆ — apps/backend/routes/api/provider/handlers/scheduler-audit-schedules-post-handler.js:46-53
- อีกเส้นหนึ่ง (service) รับ auditorId/scheduledDate/scheduledTime/location/inspectionMode เหมือนกัน — apps/backend/services/audit-scheduling-service.js:371-382
- สิทธิ์คือ permission APPLICATION_SCHEDULE (post handler :43) และ role SCHEDULER/ADMIN (audit-scheduling-service.js:66-69)

**เงื่อนไขที่ระบบบังคับเอง**
- ห้ามวันหยุด/เสาร์อาทิตย์ — post handler :65-70 และ audit-scheduling-service.js:400-406
- ห้ามชนเวลา: post handler เช็ค overlap ในหน้าต่าง ±12 ชั่วโมง (:150-185) ส่วน service เช็ค overlap ตาม duration (audit-scheduling-service.js:209-216)

**capacity / ปฏิทินผู้ตรวจ**
- มีเพดานต่อวัน: `AUDITOR_MAX_PER_DAY` ค่า default 2 ปรับได้ด้วย env — apps/backend/services/audit-scheduling-service.js:56-64 บังคับที่ :195-207 (error AUDITOR_OVER_CAP)
- **แต่เพดานนี้บังคับแค่เส้นเดียว**: เส้น POST /api/audit/scheduling/assign (apps/backend/routes/api/audit/scheduling.js:92 → assignAuditor → :501) ส่วนอีกเส้นที่เขียนคอลัมน์เดียวกันและเลื่อนสถานะเป็น AUDIT_CONFIRMED เหมือนกัน คือ POST /api/provider/scheduler/audits/schedules (apps/backend/routes/api/provider/scheduler.js:41 → post handler :194-241) **ไม่มีการเช็คเพดานต่อวัน** มีแค่ overlap ±12 ชั่วโมง
- ทั้งสองเส้นมีหน้าจอใช้งานจริงคนละหน้า: หน้า queue เรียกเส้นที่มีเพดาน (apps/web-app/src/app/provider/scheduler/queue/client-view.tsx:419 → apps/web-app/src/lib/services/audit-service.ts:176-182) และหน้า calendar เรียกเส้นที่ไม่มีเพดาน (apps/web-app/src/app/provider/calendar/client-view.tsx:148)
- "ปฏิทินผู้ตรวจ" ที่มีคือ endpoint คำนวณช่องว่างจากนัดที่มีอยู่ ไม่ใช่ปฏิทินที่ผู้ตรวจกรอกเอง — apps/backend/services/audit-scheduling-service.js:971-1025 (อ่านจาก Application.scheduledDate)
- **ไม่พบ** โมเดลวันลา/วันว่าง/โควตาของผู้ตรวจในฐานข้อมูล — ค้นด้วย `git grep -niE "model .*(availab|leave|calendar|shift|capacity)"` ที่ apps/backend/prisma → ไม่มีผลลัพธ์

**พื้นที่**
- จังหวัดถูกใช้เพื่อ "จัดกลุ่มแสดงผล" เท่านั้น อ่านจาก formData.farmProvince — apps/backend/services/audit-scheduling-service.js:299-302, :330-337 · **ไม่พบ** กติกาจ่ายงานตามพื้นที่

**ข้อสังเกตที่เป็นข้อเท็จจริงเรื่องเวลานัด**
- หน้าจอ queue ส่งช่วงเวลาเป็น `scheduledSlot: 'AM' | 'PM'` (apps/web-app/src/lib/services/audit-service.ts:91-98) แต่ backend อ่าน `scheduledTime` (apps/backend/routes/api/audit/scheduling.js:96) และ service ใช้เฉพาะรูปแบบ HH:mm (apps/backend/services/audit-scheduling-service.js:139-151) — ค่า AM/PM จึงถูกทิ้ง เวลานัดตกเป็นค่าเริ่มต้นของวันที่ที่ส่งมา

### 4. นัดใหม่หลังลงพื้นที่ไม่ผ่าน — โค้ดเก็บเงินเพิ่มไหม

**โค้ดไม่เก็บเงินเพิ่ม**
- เลื่อนนัด: ผู้ขอยื่นคำขอเลื่อนได้เฉพาะตอน AUDIT_CONFIRMED (apps/backend/services/audit-scheduling-service.js:714-722) และการอนุมัติเลื่อน "เปลี่ยนเฉพาะตารางนัด" (:769-773, ฟังก์ชันรับแค่ newDate/newAuditor ที่ :782)
- ตรวจไม่ผ่านแบบแก้ไขได้ (MINOR/MAJOR) → CAR_PENDING (apps/backend/routes/api/provider/handlers/auditor-audit-decision-handler.js:152-161) และการส่งแก้กลับ ระบุไว้ตรง ๆ ว่าไม่ต้องจ่ายใหม่ (apps/backend/routes/api/applications/applications.js:558 — CAR_PENDING → CAR_REVIEWING)
- ไม่มีจุดสร้างใบแจ้งหนี้ใด ๆ ผูกกับ CAR หรือการนัดใหม่ (จุดสร้างทั้งหมดอยู่ในข้อ 1)
- ค่าธรรมเนียมยื่นซ้ำมีแต่ค่าคงที่ ไม่มีคนเรียกใช้: apps/backend/config/business-rules.js:123 (RESUBMISSION_FEE 5000), apps/backend/config/payment-fees.js:34 (RE_SUBMISSION_FEE 5000), apps/backend/modules/billing/internal/payment-constants.js:47 (resubmissionStateRate) — ค้น `git grep -rn "RESUBMISSION\|resubmission" apps/backend` แล้ว **ไม่พบ** โค้ดที่สร้างใบแจ้งหนี้จากค่าเหล่านี้ ขณะที่ apps/backend/services/payment-service.js:9 ยังเขียนกติกาข้อ 3 ไว้ในคอมเมนต์ (โมดูลนั้น export แค่ createPhase1Payment ที่ :170-186)

**เทียบกับมติ correction loop "วนไม่จำกัดครั้ง" (QUEUE.md:253) — พบข้อขัดแย้ง 3 จุด ที่ operator ต้องตัดสิน**
- (ก) **การวนซ้ำรอบสองบนหน้าจอผู้ตรวจทำไม่ได้**: เมื่อคำขออยู่ CAR_REVIEWING route ตัดสินผลตรวจอนุญาตเฉพาะ PASS เท่านั้น (apps/backend/routes/api/provider/handlers/auditor-audit-decision-handler.js:84-89) ทั้งที่ state machine และสิทธิ์ role อนุญาต CAR_REVIEWING → CAR_PENDING (apps/backend/services/workflow-transition-service.js:67, :140) ผ่าน endpoint ทั่วไป (apps/backend/routes/api/provider/applications.js:322-325)
- (ข) **ไม่มีเส้นทางกลับไป "ลงพื้นที่ใหม่"**: AUDIT_CONFIRMED เข้าได้จาก AUDIT_FEE_PAID เท่านั้น (apps/backend/services/workflow-transition-service.js:64) และประตูจัดตารางทั้งสามจุดในข้อ 2 บังคับสถานะ AUDIT_FEE_PAID — คำขอที่อยู่ใน CAR_PENDING/CAR_REVIEWING จึงนัดลงพื้นที่รอบใหม่ไม่ได้เลยด้วย API ที่มี ดังนั้นวันนี้ loop ที่ "ไม่จำกัด" คือ loop เอกสาร/หลักฐาน ไม่ใช่ loop การลงพื้นที่
- (ค) **เพดานเวลาแทนเพดานจำนวนครั้ง**: CAR/revision มีเส้นตาย 5 วันทำการ เลยแล้วหมดอายุโดย cron (apps/backend/config/business-rules.js:121, apps/backend/services/workflow-transition-service.js:59, :172-173) และเงินที่จ่ายไปแล้วของเคสที่หมดอายุไม่มี route คืน/ตัดจ่าย (ดูข้อ 1)

### 5. Zoom กับลงพื้นที่ — เป็นทางเลือกจริงไหม ราคาต่างไหม ใครเลือก เปลี่ยนได้ไหม

**เป็นสองทางเลือกจริงในโค้ด**: ONSITE กับ ONLINE_MEET
- ค่าที่ยอมรับและค่า default = ONSITE — apps/backend/services/audit-scheduling-service.js:411-413
- normalize ค่า ONLINE → ONLINE_MEET — apps/backend/routes/api/provider/handlers/queue-utils.js:44-45
- ตรวจความครบถ้วนตามโหมด: ONLINE_MEET ต้องมีลิงก์ประชุมและต้องเป็น URL ที่ถูกต้อง, ONSITE ต้องมี mapLink หรือ location — apps/backend/routes/api/provider/handlers/scheduler-audit-schedules-post-handler.js:71-82
- แดชบอร์ดนับแยกสองโหมด — apps/backend/routes/api/provider/handlers/scheduler-dashboard-handler.js:139-140

**ราคาไม่ต่างกัน**
- ฟังก์ชันคิดค่าธรรมเนียมรับพารามิเตอร์เดียวคือจำนวน scope — apps/backend/modules/billing/internal/fee-service.js:98-103, :147-163
- ค้น `git grep -rn "inspectionMode\|ONLINE_MEET" apps/backend --include=*.js` แล้ว **ไม่พบ** การอ้างถึง inspectionMode ในไฟล์ฝั่งการเงิน/ค่าธรรมเนียมใด ๆ (ผลลัพธ์อยู่เฉพาะไฟล์ scheduling / dashboard / queue-utils / e2e)

**ใครเลือก และเลือกตอนไหน**
- เจ้าหน้าที่จัดคิวเลือกตอนกดนัด ไม่ใช่เกษตรกร — apps/backend/routes/api/provider/handlers/scheduler-audit-schedules-post-handler.js:49 (อ่านจาก body) และหน้าจอที่ส่งค่านี้คือหน้า provider/calendar (apps/web-app/src/app/provider/calendar/client-view.tsx:148-158)
- ค้นฝั่งเกษตรกร `grep -rn "inspectionMode\|ONLINE_MEET" apps/web-app/src/app/health` → **ไม่พบ** ช่องให้เลือกโหมด
- หน้าจอคิวอีกหน้าหนึ่งไม่ส่งโหมดมาเลย (apps/web-app/src/lib/services/audit-service.ts:91-98 ไม่มีฟิลด์ inspectionMode) นัดที่สร้างจากหน้านั้นจึงตกเป็น ONSITE เสมอ (apps/backend/services/audit-scheduling-service.js:411)

**เปลี่ยนทีหลังได้ไหม**
- ได้ ถ้าเจ้าหน้าที่จัดคิวยิงนัดใหม่ทับผ่านเส้น provider: ระบบมองว่าเป็น AUDIT_RESCHEDULED และเขียน inspectionMode ใหม่ทับ — apps/backend/routes/api/provider/handlers/scheduler-audit-schedules-post-handler.js:191, :210-222
- แต่เส้น "อนุมัติคำขอเลื่อนของผู้ขอ" เปลี่ยนได้แค่วันและผู้ตรวจ ไม่มีพารามิเตอร์โหมด — apps/backend/services/audit-scheduling-service.js:782 (รับ newDate, newAuditor)

### 6. สถานะเงินตอนนี้ — Stripe จริงหรือ mock, staging กับ production, เกษตรกรจ่ายจริงได้หรือยัง

**สวิตช์เลือก adapter อยู่ที่ไหน**
- `PAYMENT_ADAPTER` (ค่า default = "stripe" เมื่อไม่ตั้ง) — apps/backend/config/stripe.js:67-69
- ตัวเลือกจริง: stripe → services/payment/stripe-adapter.js, mock → services/payment/mock-payment-adapter.js, ค่าอื่น throw — apps/backend/services/payment/payment-adapter.js:53-66
- สวิตช์ที่สอง `STRIPE_CHECKOUT_ENABLED` ต้องเป็นสตริง "true" เท่านั้น — apps/backend/config/stripe.js:34-36 · ถ้าไม่ใช่ endpoint checkout ตอบ 503 STRIPE_CHECKOUT_DISABLED — apps/backend/routes/api/finance/payments.js:409-417
- ถ้า adapter เป็น stripe แต่ไม่มีคีย์ จะ throw STRIPE_NOT_CONFIGURED ก่อนสร้างแถวใด ๆ — apps/backend/config/stripe.js:43-52 + apps/backend/services/payment/stripe-adapter.js:39-42 เรียกจาก apps/backend/services/checkout/stripe-checkout-service.js:114-117

**staging**
- บล็อก environment ของ backend-staging คือ docker-compose.staging.yml:63-142 — **ไม่มี** STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_CHECKOUT_ENABLED, PAYMENT_ADAPTER แม้แต่ตัวเดียว
- ไฟล์เดียวกันเขียนไว้เองว่า service นี้ไม่มี env_file ต้อง forward ทีละตัว (docker-compose.staging.yml:138) แปลว่าต่อให้ .env.staging บนเครื่องมีคีย์ Stripe ค่านั้นก็เข้า container ไม่ได้
- สคริปต์ deploy ตรวจ env ที่จำเป็น 6 ตัว ไม่มี Stripe — scripts/deploy/deploy-staging.sh:32-35

**production**
- บล็อก environment ของ backend คือ docker-compose.production.yml:86-239 (58 บรรทัด env) — grep คำว่า stripe ได้ 0 ผลลัพธ์ · คำว่า payment ได้ผลเดียวคือ PAYMENT_WEBHOOK_SECRET ที่ :127 ซึ่งเป็นความลับของเส้น webhook เก่า ไม่ใช่ Stripe
- ไฟล์เดียวกันย้ำว่า service นี้ไม่มี env_file (docker-compose.production.yml:186)
- scripts/deploy/deploy-production.sh:46-... ไม่บังคับ Stripe var

**หลักฐานที่รันจริงใน session นี้**
- `bash scripts/probes/stripe-keys-ready.sh` → `BLOCKED: operator:stripe-keys — STRIPE_SECRET_KEY absent from env` (exit 2) ตรงตามสัญญาที่ scripts/probes/stripe-keys-ready.sh:5 และ HARNESS.md:76

**MockPaymentAdapter อยู่ตรงไหน**
- ถูกเลือกเฉพาะเมื่อ PAYMENT_ADAPTER=mock (apps/backend/services/payment/payment-adapter.js:59-61) · ค้น `git grep PAYMENT_ADAPTER` ทั้งรีโป → พบเฉพาะ .env.example:181, config, test, เอกสาร · **ไม่พบ** ใน compose หรือสคริปต์ deploy ใด ๆ ดังนั้น mock ไม่ได้ถูกใช้ในเครื่องที่ deploy จริง ใช้ใน unit test เท่านั้น (คีย์เซ็นของ mock เป็นค่าคงที่ไม่ลับ — apps/backend/services/payment/mock-payment-adapter.js:24-26)

**เกษตรกรจ่ายเงินจริงผ่านระบบออนไลน์ได้หรือยัง — ยังไม่ได้ ด้วยเหตุผล 4 ชั้น**
1. หน้าจอเข้าสู่ checkout ถูกซ่อน: ต้องมี NEXT_PUBLIC_CHECKOUT_UI_ENABLED === 'true' (apps/web-app/src/lib/config/checkout-mode.ts:39-43) ใช้จริงที่ apps/web-app/src/app/health/payments/client-view.tsx:298 · ค้น env นี้ใน compose ทั้งสองไฟล์ → ไม่พบ (staging FE env ที่ docker-compose.staging.yml:171-177, prod FE env ที่ docker-compose.production.yml:276-282)
2. ต่อให้เปิด UI แล้ว API ยังตอบ 503 เพราะ STRIPE_CHECKOUT_ENABLED ไม่ได้ตั้ง (payments.js:409-417)
3. ต่อให้เปิดสวิตช์ทั้งสอง ก็ไม่มีคีย์ให้ adapter ทำงาน (config/stripe.js:43-52) และคีย์ส่งเข้า container ไม่ได้ตามที่อธิบายข้างบน
4. ต่อให้มีคีย์ครบ **หน้าจอก็ยังไม่มีขั้นตอนจ่ายเงิน**: หน้า checkout แสดงแค่ยอดและเลขรายการ และเขียนบอกผู้ใช้เองว่า "คุณยังไม่ถูกเรียกเก็บเงินจนกว่าจะทำขั้นตอนชำระเงินถัดไปเสร็จ" (apps/web-app/src/app/health/payments/checkout/client-view.tsx:234-237) · ค้น `@stripe/stripe-js`, `PaymentElement`, `confirmPayment` ใน apps/web-app/src → **ไม่พบ** และ dependency `stripe` มีเฉพาะฝั่ง backend (apps/backend/package.json:50)

**ช่องทางที่จ่ายได้จริงวันนี้** คือโอนเงินเข้าบัญชีแล้วอัปโหลดสลิป (apps/backend/routes/api/finance/payment-slips.js:201) ให้ฝ่ายบัญชีอนุมัติ (apps/backend/services/payment-slip-service.js:1042) โดยบันทึกเป็น gateway BANK_TRANSFER (apps/backend/services/payment-service.js:179-182) เลขบัญชี/พร้อมเพย์ของแพลตฟอร์มมาจาก env ที่ forward ไว้แล้ว (docker-compose.staging.yml:140-142)

**ความไม่ตรงกันระหว่างคอมเมนต์กับโค้ดที่พบบนเส้นเงิน (รายงานตามจริง ไม่เสนอแก้)**
- apps/backend/routes/api/webhooks/stripe.js:23-24 เขียนว่า route จะ "refuses to register at all" ถ้าไม่มี STRIPE_WEBHOOK_SECRET แต่ในไฟล์ไม่มีการตรวจตอนลงทะเบียนเลย — router.post ลงทะเบียนทันทีที่ :35 และความลับถูกอ่านตอนมี request เท่านั้นผ่าน adapter (apps/backend/services/payment/stripe-adapter.js:68-71) ผลจริงคือ request จะได้ 400 INVALID_SIGNATURE ไม่ใช่ boot ล้ม · route ถูก mount แบบไม่มีเงื่อนไขที่ apps/backend/routes/api/index.js:162
- งาน cron เตือนชำระเงินครอบเฉพาะใบแจ้งหนี้ของเส้น Stripe (serviceType = CERTIFICATION_CHECKOUT) — apps/backend/jobs/payment-reminder-job.js:115-128 ลงทะเบียนที่ apps/backend/jobs/scheduler.js:262-275 · เมื่อเส้น Stripe ยังปิดทุกเครื่อง งานนี้จึงไม่มีใบแจ้งหนี้ให้เตือน เพราะใบแจ้งหนี้ที่ใช้จริงเป็น PHASE_1/PHASE_2_*_FEE

---

## ส่วนที่ 3 — ทำงานจริงแล้ว กับ ยัง mock / flag ปิด / ไม่มีโค้ด

| ทำงานจริงแล้ว (มีโค้ดและเส้นทางที่เดินได้) | ยัง mock / flag ปิด / ไม่มีโค้ด |
|---|---|
| ออกใบแจ้งหนี้งวด 1 ตอนส่งคำขอ และตอนรับใบเสนอราคา (wizard-controller.js:406, quotations.js:323) | จ่ายเงินออนไลน์ผ่าน Stripe — flag ปิดทั้ง backend และ frontend (config/stripe.js:34-36, checkout-mode.ts:43) และไม่มี env ใน compose (docker-compose.staging.yml:63-142, docker-compose.production.yml:86-239) |
| ออกใบแจ้งหนี้งวด 2 อัตโนมัติเมื่อเอกสารผ่าน (workflow-side-effects.js:164-175) | หน้าจอกรอกข้อมูลชำระเงิน (บัตร/พร้อมเพย์) — ไม่มี Stripe SDK ฝั่ง frontend เลย (ค้นใน apps/web-app/src ไม่พบ; dependency อยู่ที่ apps/backend/package.json:50) |
| จ่ายด้วยโอน+สลิป และบัญชีอนุมัติ (payment-slips.js:201, payment-slip-service.js:1042, :1265) | webhook Stripe — มี route จริง (webhooks/stripe.js:35) แต่ไม่มีคีย์ ไม่มี event เข้าจริง; probe ยืนยัน BLOCKED ใน session นี้ |
| ประตูเงินงวด 1 ก่อนเข้าคิวตรวจเอกสาร (scheduler-assign-reviewer-handler.js:86-92) | MockPaymentAdapter — ไม่ได้ถูกเลือกในเครื่องที่ deploy (ไม่พบ PAYMENT_ADAPTER ใน compose/สคริปต์ deploy) ใช้เฉพาะ test |
| ประตูเงินงวด 2 ก่อนนัดลงพื้นที่ 3 จุด (post-handler:107-121, audit-scheduling-service.js:449-456, phase2-schedule-gate.js:65-75) | cron เตือนชำระเงิน — ลงทะเบียนจริง (jobs/scheduler.js:262-275) แต่ครอบเฉพาะใบแจ้งหนี้เส้น Stripe (payment-reminder-job.js:115-128) จึงไม่มีผลกับใบแจ้งหนี้ที่ใช้จริง |
| นัดตรวจโดยคน + กันวันหยุด + กันเวลาชน (post-handler:46-53, :65-70, :150-185) | เพดานงานต่อวันของผู้ตรวจ — บังคับเฉพาะเส้น /audit/scheduling/assign (audit-scheduling-service.js:200) เส้น provider ที่หน้า calendar ใช้ ไม่มีเพดาน |
| เพดาน 2 งาน/วัน/ผู้ตรวจ บนเส้น assign (audit-scheduling-service.js:56-64, :195-207) | ปฏิทินว่าง/วันลาของผู้ตรวจ — ไม่มีโมเดลในฐานข้อมูล (ค้น prisma/schema ไม่พบ) |
| ผู้ขอยื่นขอเลื่อนนัด และ scheduler อนุมัติ (scheduling.js:111, :128) | จัดงานอัตโนมัติ/round-robin/จ่ายงานตามพื้นที่ — ไม่พบโค้ด |
| loop แก้ไขเอกสารไม่จำกัดรอบ + เส้นตาย 5 วันทำการ (workflow-transition-service.js:200-203, business-rules.js:121) | นัดลงพื้นที่รอบใหม่หลัง CAR — ไม่มีเส้นทางสถานะ (AUDIT_CONFIRMED เข้าได้จาก AUDIT_FEE_PAID เท่านั้น, workflow-transition-service.js:64) |
| ค่าธรรมเนียมคิดตามจำนวนวิธีปลูก (fee-service.js:98-103 ยืนยันด้วยการรันจริง) | ค่าธรรมเนียมยื่นซ้ำ 5,000 — เป็นค่าคงที่ที่ไม่มีคนเรียก (business-rules.js:123, payment-fees.js:34) |
| ยกเลิก/พักใบแจ้งหนี้แบบ hold/release (invoice-payment-handlers.js:135, :162) | ตัดหนี้/ยกเลิกใบแจ้งหนี้ค้าง (forfeitRevenue) — มีฟังก์ชัน (invoice-finance-ops.js:103) แต่ไม่มี route และไม่มี job เรียก |

---

## ส่วนที่ 4 — คำถามที่ต้องให้ operator ตัดสิน (เรียงตามความสำคัญ)

1. **นโยบายรอบตรวจซ้ำหลังลงพื้นที่ไม่ผ่าน (ข้อ 4 — ขัดกับมติ "วนไม่จำกัดครั้ง")** — โค้ดวันนี้ให้แก้ไขเอกสาร/หลักฐานได้ไม่จำกัด แต่ (ก) หน้าจอตัดสินผลตรวจยอมรับเฉพาะ PASS เมื่ออยู่ CAR_REVIEWING (auditor-audit-decision-handler.js:84-89) และ (ข) ไม่มีเส้นทางกลับไปนัดลงพื้นที่รอบใหม่เลย (workflow-transition-service.js:64 + ประตูจัดตาราง 3 จุดในข้อ 2) ต้องตัดสินว่า "การตรวจซ้ำ" หมายถึงตรวจเอกสารซ้ำ หรือกลับไปเหยียบแปลงใหม่ และถ้าเป็นอย่างหลัง ใครจ่าย
2. **เงินค้างและหนี้ค้างที่ไม่มีทางปิด** — คำขอค้างที่ PENDING_AUDIT_FEE ได้ตลอดกาล (workflow-transition-service.js:62) ใบแจ้งหนี้ค้าง pending และไม่มี route ตัดหนี้ (invoice-finance-ops.js:103 ไม่มี caller) ส่วนเงินที่จ่ายแล้วบนเคสที่หมดอายุถูกบันทึกไว้เฉย ๆ (payment-slip-service.js:1255-1258) ต้องตัดสินนโยบายอายุใบแจ้งหนี้และการคืน/ตัดจ่าย
3. **ขอบเขตงานก่อนจะโชว์ว่า "จ่ายออนไลน์ได้"** — ต้องแก้ compose ให้ forward env (docker-compose.staging.yml:138, docker-compose.production.yml:186 ระบุเองว่าไม่มี env_file) + ตั้ง 4 ตัวแปร + ที่สำคัญคือยังไม่มีหน้าจอชำระเงินฝั่งผู้ใช้เลย (checkout/client-view.tsx:234-237) ต้องตัดสินว่าจะพูดถึงเรื่องนี้ใน demo อย่างไร
4. **เส้นทางจัดตารางสองเส้นที่กติกาไม่เท่ากัน** — เส้น queue มีเพดาน 2 งาน/วัน (audit-scheduling-service.js:200) เส้น calendar ไม่มี (post-handler:150-185) ทั้งคู่เขียนคอลัมน์เดียวกันและมีหน้าจอใช้งานจริงทั้งคู่ ต้องตัดสินว่าเส้นไหนเป็นเส้นทางการ
5. **ตารางราคาสองชุด** — apps/backend/config/payment-fees.js:23-38 เป็นตัวเลขตายตัว 1 scope (5535/27675/33210) ขณะที่ราคาที่คิดจริงคูณตามจำนวนวิธีปลูก (fee-service.js:99) ต้องตัดสินว่าจะยึดชุดไหนก่อนมีใครหยิบตัวเลขจาก payment-fees.js ไปแสดงบนหน้าจอหรือเอกสาร
6. **ช่วงเวลานัด AM/PM ที่ถูกทิ้ง** — หน้าจอให้เลือกช่วงเช้า/บ่าย แต่ backend ไม่ได้รับค่านี้ (audit-service.ts:95 กับ scheduling.js:96) ต้องตัดสินว่าเวลานัดเป็นข้อมูลที่ต้องเก็บจริงหรือไม่
7. **คอมเมนต์ที่บอกความจริงคนละอย่างกับโค้ดบนเส้นเงิน** — webhooks/stripe.js:23-24 อ้างว่า route จะไม่ลงทะเบียนถ้าไม่มี webhook secret ซึ่งไม่ตรงกับโค้ด ต้องตัดสินว่าจะแก้ข้อความหรือแก้พฤติกรรม

---

## ส่วนที่ 5 — ขอบเขตที่ตรวจ และสิ่งที่ตรวจไม่ได้

**ไฟล์/ไดเรกทอรีที่เดินอ่านจริง**
- apps/backend/shared/ (checkout-status.js, phase2-schedule-gate.js, status-machine-contract.js, correction-round-stage.js)
- apps/backend/services/ (checkout/*, payment/*, payment-slip-service.js, payment-service.js, audit-scheduling-service.js, workflow-transition-service.js, invoice-service.js, invoice/invoice-finance-ops.js, application-service/application-phase-invoice-methods.js, quote-service.js)
- apps/backend/config/ (payment-fees.js, business-rules.js, stripe.js), apps/backend/modules/billing/internal/ (fee-service.js, payment-constants.js)
- apps/backend/routes/api/ (finance/payments.js, finance/payment-slips.js, finance/invoice-payment-handlers.js, webhooks/stripe.js, audit/scheduling.js, audit/audits.js, audit/onsite.js, applications/applications.js, applications/quotations.js, provider/scheduler.js, provider/applications.js, provider/handlers/* ที่เกี่ยวกับ scheduler/auditor/workflow, index.js)
- apps/backend/jobs/ (scheduler.js, payment-reminder-job.js, revision-deadline-checker.js), apps/backend/controllers/wizard-controller.js, apps/backend/server.js
- apps/backend/prisma/ (schema/*.prisma, migrations/20260802150000_wave1_checkout_engine_expand/migration.sql)
- apps/web-app/src/ (lib/config/checkout-mode.ts, lib/services/checkout-service.ts, lib/services/audit-service.ts, lib/services/provider-api.ts, app/health/payments/*, app/provider/calendar/client-view.tsx, app/provider/scheduler/queue/client-view.tsx, components/audit/AssignAuditorModal.tsx)
- docker-compose.staging.yml, docker-compose.production.yml, scripts/deploy/*.sh, scripts/probes/stripe-keys-ready.sh, apps/backend/.env.example
- QUEUE.md, PROMPT-PAYMENT-REWORK.md, HARNESS.md, docs/payment-refactor/step2-data-model-design.md, .claude/agents/role-workflow-auditor.md

**pattern ที่ใช้ค้น (ที่สำคัญ)**
- `git grep -n "ensurePhaseInvoices" / "checkoutOrder.create\|invoice.create(" / "createCheckoutForApplication"`
- `git grep -n "STRIPE_CHECKOUT_ENABLED" / "PAYMENT_ADAPTER" / "STRIPE_SECRET_KEY"` และ grep ใน compose/สคริปต์ deploy
- `git grep -rniE "round.robin|auto.assign|autoAssign|workload.*balance"` (หา auto-assign)
- `git grep -rniE "model .*(availab|leave|calendar|shift|capacity)" apps/backend/prisma` (หาโมเดลปฏิทิน/โควตา)
- `git grep -rn "RESUBMISSION\|resubmission"` , `git grep -rn "forfeitRevenue"` , `git grep -rn "inspectionMode\|ONLINE_MEET"`
- `grep -rn "@stripe/stripe-js\|PaymentElement\|confirmPayment" apps/web-app/src` (หา UI จ่ายเงิน)

**คำสั่งที่รันจริงใน session นี้ (อ่านอย่างเดียว ไม่เขียนไฟล์ในรีโป)**
- `node -e` เรียก apps/backend/modules/billing/internal/fee-service.js เพื่อพิมพ์ยอดจริงของ scope 1 และ 2 (ไม่แตะฐานข้อมูล)
- `bash scripts/probes/stripe-keys-ready.sh` → BLOCKED: operator:stripe-keys (exit 2)

**สิ่งที่ตรวจไม่ได้ และเหตุผล**
- **ไม่ได้แตะฐานข้อมูลจริง** ไม่มีการ query ใด ๆ จึง **ไม่ทราบจำนวนจริง** ของใบแจ้งหนี้ค้าง เคสที่ค้าง PENDING_AUDIT_FEE หรือ checkout order ที่ค้าง — ข้อสรุปเรื่อง "ค้าง" ทั้งหมดมาจากเส้นทางในโค้ด ไม่ใช่จากข้อมูลจริง
- **ไม่เห็นค่า env จริงบนเครื่อง** รีโปมีแต่ไฟล์ตัวอย่าง (.env.example, .env.production.example) ไม่มี .env.staging / .env.production — ข้อสรุปข้อ 6 จึงเป็นเรื่อง "compose ไม่ได้ forward ตัวแปรเข้า container" ซึ่งพิสูจน์จากไฟล์ในรีโปได้ ไม่ใช่การอ้างว่าเจ้าของเครื่องไม่มีคีย์
- **ไม่ได้รัน test suite** ตั้งใจไม่รันเพราะ jest/playwright อาจเขียน artifact ลงในรีโป (test-reports/, coverage/) ซึ่งขัดข้อห้ามงานนี้ที่ต้อง read-only ทั้งหมด
- **ไม่ได้ยิง HTTP ไปที่ staging/production** ไม่มีการยืนยันพฤติกรรมรันไทม์ ทุกข้อสรุปเป็นการอ่านโค้ดและ config
- **working tree ใช้ร่วมกับ agent อีกตัว** ระหว่างที่ตรวจ มีไฟล์ untracked โผล่ขึ้นมาเองสองไฟล์ (apps/backend/shared/zz-orch-probe.ts และ apps/backend/scripts/e2e/zz-orch-probe.mjs, timestamp 07:35:46) และรายการ untracked เดิม (evidence/STATUS-WRITER/) หายไป — ทั้งหมดไม่ได้เกิดจากงานนี้ งานนี้ไม่ได้เขียนหรือลบไฟล์ใดในรีโป และไม่ได้รันคำสั่ง git ที่เปลี่ยนสถานะ

---

## ส่วนที่ 6 — การตรวจซ้ำโดย orchestrator (ไม่ได้อ่านรายงานแล้วเชื่อ)

รายงานข้างบนเขียนโดย sub-agent · orchestrator สุ่มตรวจ `file:line` **14 จุด** ด้วยตัวเอง
โดยอ่านจาก `origin/main` ตรง ๆ (`git show origin/main:<path> | sed -n '<n>p'`) ไม่ใช่จากทรีที่ agent ทำงาน

| # | จุดที่ตรวจ | อ้างว่า | อ่านจริงได้ | ผล |
|---|---|---|---|---|
| 1 | `shared/checkout-status.js:29` | `MILESTONES = ['M1','M2']` | `const MILESTONES = Object.freeze(['M1', 'M2']);` | ตรง |
| 2 | `config/business-rules.js:34,36,40,42` | 5000 / 25000 / 0.10 / 0.07 | `PHASE1_PER_SCOPE: 5000` · `PHASE2_PER_SCOPE: 25000` · `PLATFORM_RATE: 0.10` · `VAT_RATE: 0.07` | ตรง |
| 3 | `modules/billing/internal/fee-service.js:99-102` | สูตรคูณ scope | `stateAmount = ratePerScope * scopeCount` … | ตรง |
| 4 | `controllers/wizard-controller.js:406` | mint งวด 1 ตอนส่งคำขอ | `ensurePhaseInvoices(result.id, 'PHASE_1', {` | ตรง |
| 5 | `routes/api/provider/handlers/workflow-side-effects.js:164-175` | mint งวด 2 หลังเอกสารผ่าน | `ensurePhaseInvoices(application.id, 'PHASE_2')` พร้อมคอมเมนต์ยืนยันว่าเป็นจุดเดียว | ตรง |
| 6 | `services/workflow-transition-service.js:62` | `PENDING_AUDIT_FEE` ไม่มี edge ไป `EXPIRED` | `PENDING_AUDIT_FEE: new Set(['PHASE_2_SLIP_UNDER_REVIEW', 'AUDIT_FEE_PAID'])` | ตรง |
| 7 | `services/invoice/invoice-finance-ops.js:103-116` | `forfeitRevenue` ไม่มี caller | มีเฉพาะ wrapper `invoice-service.js:687,691` + export `:154` + คอมเมนต์ `prisma-pdpa-extension.js:773` ไม่มี route/job | ตรง |
| 8 | `routes/api/provider/handlers/auditor-audit-decision-handler.js:84-89` | CAR_REVIEWING รับเฉพาะ PASS | `if (currentState === 'CAR_REVIEWING' && decision !== 'PASS') return 400` | ตรง |
| 9 | `routes/api/finance/payments.js:409-417` | 503 STRIPE_CHECKOUT_DISABLED | ตรงบรรทัดต่อบรรทัด | ตรง |
| 10 | `apps/web-app/src/lib/config/checkout-mode.ts:39-43` | flag ปิด fail-closed | `=== 'true'` พร้อมคอมเมนต์ "No trim, no case folding — fail closed" | ตรง |
| 11 | `routes/api/webhooks/stripe.js:23-24` vs `:35` | คอมเมนต์ขัดโค้ด | คอมเมนต์เขียน "The route refuses to register at all when STRIPE_WEBHOOK_SECRET is missing (fail-closed)" แต่ `router.post('/stripe', ...)` ลงทะเบียนทันทีไม่มีเงื่อนไข และ mount ไม่มีเงื่อนไขที่ `routes/api/index.js:162` | ตรง — ข้อขัดแย้งมีจริง |
| 12 | `services/audit-scheduling-service.js:56-64` | เพดาน 2 งาน/วัน | `AUDITOR_MAX_PER_DAY … : 2` clamp 1..8 | ตรง |
| 13 | `config/payment-fees.js:23-38` | ตารางราคาชุดที่สอง 1 scope ตายตัว | `PHASE_1_TOTAL: 5535` · `PHASE_2_TOTAL: 27675` · `TOTAL_STANDARD_FEE: 33210` | ตรง |
| 14 | `docker-compose.staging.yml` + `docker-compose.production.yml` | ไม่มี env ของ Stripe เลย | `git grep -in "stripe\|PAYMENT_ADAPTER\|CHECKOUT_UI_ENABLED"` บนสองไฟล์ = **0 hit** และทั้งสองไฟล์เขียนเองว่า service นี้ไม่มี `env_file` ต้อง forward ทีละตัว | ตรง |

**14/14 ตรง** — ไม่พบ claim ที่อ้าง `file:line` ผิดแม้จุดเดียว

### ข้อจำกัดของการตรวจซ้ำนี้ (เขียนไว้กันเข้าใจเกินจริง)
- ตรวจว่า **บรรทัดที่อ้างมีเนื้อหาตามที่เขียน** ไม่ได้ตรวจว่า**ข้อสรุปเชิงระบบ**ถูกทุกข้อ · ข้อสรุปประเภท "ไม่พบ X ทั้งรีโป" ยืนยันซ้ำได้เฉพาะ 2 ข้อ (`forfeitRevenue` caller และ env ใน compose) ที่เหลือรับตามที่รายงานพร้อม pattern ที่ระบุไว้ในส่วนที่ 5
- ไม่มีการยืนยันด้วยการรันระบบจริงหรือแตะฐานข้อมูล — ข้อจำกัดเดียวกับที่รายงานระบุไว้เอง
