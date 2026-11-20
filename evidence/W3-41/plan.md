# W3-41 (Q2) — PLAN — Payment Schedule (milestone → invoice → due date)
> เขียนโดย orchestrator ตาม §3.2 หลัง operator ตัดสิน (orchestration-log 2026-08-03)
> Spec ฐาน: `evidence/W3-41/spec-reader-report.md` + คำตัดสิน operator 4 ข้อ

## คำตัดสิน operator (ground truth)
1. **INVOICED = conceptual** — vocab 4 state คงเดิม (extend ไม่ replace) ไม่มี migration แก้ CHECK; "INVOICED" = order+invoice mint แล้ว (invoiceId != null) ซึ่งเกิดพร้อม PENDING_PAYMENT
2. **Due date = M1:7 / M2:15 business days นับจาก mint** — คำนวณผ่าน `utils/working-days.js` (calendar ตัว canonical ที่ sticky-return ใช้ — ห้ามสร้าง calendar ใหม่), เก็บลง `Invoice.dueDate` (คอลัมน์เดิม — ไม่ต้อง migrate), ตัวเลขเป็น config ใน `config/business-rules.js` (Law 3.5) — **ปิด mint-crash ของ #721 ไปพร้อมกัน** (INFERRED#1: mint ไม่ส่ง dueDate ที่ NOT NULL)
3. **OVERDUE = derived-only เฉพาะ schedule ใหม่** — **ห้ามแตะ consumer เก่าทุกไฟล์** (invoice-repository/invoice-service/ar-aging/seed) — backlog drain = PRIORITY สูง (บันทึกแล้ว BACKLOG-FOUND) + ระบุใน FLOW-REPORT ให้ operator คุยฝั่ง Account
4. **Reminder 3 types**: `PRE_DUE` (3 business days ก่อนครบ), `DUE_DATE` (วันครบ), `OVERDUE_NOTICE` (วันทำการถัดจากครบ) — วันส่งตรงวันหยุด → **shift ไปวันทำการถัดไป** (ไม่ skip), dedup key `(invoice, type, intendedDate)` โดย date = วันที่ตั้งใจส่ง, durable store ใหม่ (EXPAND — ตาราง reminder log)

## ไฟล์ที่จะสร้าง/แก้
| ไฟล์ | อะไร |
|---|---|
| `apps/backend/config/business-rules.js` | เพิ่ม `INVOICE_DUE_BUSINESS_DAYS: { M1: 7, M2: 15 }` + `PAYMENT_REMINDER: { PRE_DUE_BUSINESS_DAYS: 3 }` ใน PAYMENT section (แก้ไฟล์เดิม — additive keys เท่านั้น) |
| `apps/backend/services/checkout/checkout-schedule-service.js` (ใหม่) | `computeDueDate(mintDate, milestone)` ผ่าน `utils/working-days.js`; `isInvoiceOverdue(invoice, now)` + `overdueWhereClause(now)` (derived — ไม่มี writer); `computeReminderDates(dueDate)` 3 types + shift ผ่าน working-days |
| `apps/backend/services/checkout/stripe-checkout-service.js` | จุดเดียว: `invoice.create` เพิ่ม `dueDate: computeDueDate(...)` — ปิด mint-crash |
| `apps/backend/prisma/schema/billing.prisma` + migration ใหม่ (EXPAND) | ตาราง `PaymentReminderLog` (invoiceId, reminderType, intendedDate, sentAt, dedup unique (invoiceId, reminderType, intendedDate)) — additive อย่างเดียว |
| `apps/backend/jobs/payment-reminder-job.js` (ใหม่) + ลงทะเบียนใน `jobs/scheduler.js` | daily cron `{ timezone: 'Asia/Bangkok' }`, insert-first dedup (unique constraint = ชั้นสุดท้าย), ส่งผ่าน notification service เดิม |
| Tests (RED-first) | รายการล่าง |

## Test list + RED ที่คาด
| Test | คาด RED เพราะ |
|---|---|
| `checkout-schedule-service.test.js` — M1 mint วันศุกร์ → due +7 business days ข้ามเสาร์อาทิตย์+วันหยุดไทย (fixture วันหยุดจริงจาก calendar), M2 15BD, ตัวเลขมาจาก business-rules ไม่ hardcode (pin: เปลี่ยน config → ผลเปลี่ยน), reminder dates 3 types + shift กรณี intended ตรงวันหยุด, isInvoiceOverdue derived (pending+เลย due = true, paid = false), **grep pin: ไม่มี writer เขียน 'overdue' + ไม่มี calendar table ใหม่ในไฟล์** | module ยังไม่มี |
| `stripe-checkout-engine.test.js` — เพิ่มเคส: mint แล้ว `invoice.create` ถูกเรียกพร้อม `dueDate` ที่เป็นผลของ computeDueDate | **จับ bug จริงของ #721** — ปัจจุบัน create ไม่มี dueDate → assertion fail = RED มีความหมาย |
| `payment-reminder-job.test.js` — รันวันเดียวกันสองครั้ง ส่งครั้งเดียว (dedup insert-first), type ครบ 3, intended ตรงวันหยุด → ส่งวันทำการถัดไปด้วย dedup key = intended date, timezone Bangkok pin | module ยังไม่มี |

**เขียวแต่กำเนิด**: ไม่คาด — ทุกเคสชี้ behavior ใหม่/บั๊กจริง

## Out-of-scope (ห้ามแตะ)
- Consumer stored-'overdue' ทุกไฟล์: `invoice-repository.js`, `invoice-service.js`, `ar-aging-service.js`, `seed-test-data.js` (คำสั่ง operator ชัด)
- `utils/working-days.js` (SSOT — ใช้ ห้ามแก้), `working-days-service.js` + `routes/api/system/*` (AMBIGUOUS #8 ยังไม่ตัดสิน — คง 3-source ไว้ probe holiday-single-source ยัง FAIL ตาม L-001 เดิม ไม่ใช่ regression ของงานนี้)
- checkout-status.js vocab / DB CHECK / partial unique index / settlement service / webhook / legacy slip path / frontend ทุกไฟล์
- `application-phase-invoice-methods.js` (legacy mint 7/15 calendar-day — drain window ห้ามแตะ)

## ลำดับ dispatch
1. **D1 implementer**: config + schedule service + mint fix + tests (RED→GREEN)
2. **D2 implementer**: EXPAND migration (PaymentReminderLog) + reminder job + scheduler registration + tests
3. **auditor** (fresh): spec + diff + evidence
4. Gates §4 → REPORT → Q-END (FLOW-REPORT + STOP)

## Acceptance
1. RED จริงต่อไฟล์ (โดยเฉพาะเคส mint-dueDate ที่จับบั๊ก #721) → GREEN full backend suite (fail ได้เฉพาะ dataset-export เดิม)
2. Ratchet delta 0 จาก FLOW-baseline (hardcode ไม่เพิ่ม — ตัวเลขทั้งหมดอยู่ใน business-rules)
3. ไม่มีไฟล์ out-of-scope ถูกแตะ (โดยเฉพาะ consumer เก่า + working-days ทั้งสองตัว)
4. Migration เป็น additive ล้วน (EXPAND) — ไม่มี ALTER/DROP ของเดิม
