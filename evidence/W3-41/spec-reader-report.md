# SPEC — Q2 / Wave 3 §4.1 Payment Schedule (milestone → invoice → due date)
> ผลจาก spec-reader dispatch 2026-08-03 (fresh context, read-only) — persist โดย orchestrator ตามที่ส่งกลับ ไม่แก้ไขเนื้อหา

## CONFIRMED (doc/code ระบุชัด — ทุกข้อมี file:line)

**A. ข้อกำหนดจาก §4.1 (design doc หลัก — ทั้ง section มี 3 บรรทัด)**
1. Milestone → invoice → due date ต้องคิดแบบ business-day + วันหยุดไทย โดย "ใช้ calendar module เดิมที่ sticky-return ใช้" ห้ามสร้าง calendar ที่สอง; test pin = holiday calendar source ไฟล์เดียว — `PROMPT-PAYMENT-REWORK.md:58`
2. State ที่ doc กำหนด: `INVOICED → PENDING_PAYMENT → SETTLED`; `OVERDUE` = derived จาก due date ณ เวลา query — ห้ามเป็น column ที่ cron mutate — `PROMPT-PAYMENT-REWORK.md:59`
3. Reminder cron: idempotent (รันซ้ำวันเดียวกันส่งครั้งเดียว, dedup key `order+type+date`), เวลาไทย, ข้ามวันหยุด — `PROMPT-PAYMENT-REWORK.md:60`
4. Probe ที่ผูก: `holiday-single-source` นับไฟล์ calendar ต้อง = 1 — `PROMPT-PAYMENT-REWORK.md:134`, probe implementation `scripts/probes/holiday-single-source.sh:4-9`, อยู่ใน DEFAULT probe set `scripts/check-done.sh:12`

**B. Design doc รอง (step2) — ส่วนที่แตะ schedule**
5. Checkout lifecycle ที่ approve แล้ว: `PENDING_PAYMENT → SETTLED | EXPIRED | CANCELLED` (ไม่มี INVOICED, ไม่มี OVERDUE) — `docs/payment-refactor/step2-data-model-design.md:68`
6. step2 doc ประกาศชัดว่า "Wave 3 state collapse vocabulary — exact names … belong to the Wave 3 design, not here" — `docs/payment-refactor/step2-data-model-design.md:303` — คือ **ไม่มี spec เรื่อง due date / OVERDUE / reminder ใน step2 เลย** (ทั้งไฟล์ไม่มีคำว่า due date/reminder สำหรับ checkout; มีแต่ `expiresAt` — line 85)

**C. Calendar SSOT — ตอบคำถาม "อยู่ไฟล์ไหน มีกี่แหล่ง"**
7. **มี 3 แหล่ง (finding เปิดอยู่แล้ว = L-001, P1)** — `AUDIT_LEDGER.md:20` + `evidence/probe-results.json:2` (ratchet dup [holiday-calendar] 3 sources); probe `holiday-single-source` = **FAIL อยู่ปัจจุบัน** (ตาม L-001):
   - `apps/backend/utils/working-days.js:25-67` — RECURRING_HOLIDAYS + EXTRA_HOLIDAYS_BY_YEAR (static, 2025–2027), Asia/Bangkok-aware (`:19`, `:77-103`), warn เมื่อปีเกิน coverage (`:111-128`)
   - `apps/backend/services/working-days-service.js:41-82` — holiday จาก env `TH_PUBLIC_HOLIDAYS` + systemConfig `public_holidays_th` (ไม่เคย seed), คำนวณแบบ server-local time (`getDay()` ที่ `:23-28` — ไม่ timezone-aware)
   - `apps/backend/routes/api/provider/handlers/workflow-handler-deps.js:25-31` — token match ใน comment (ไฟล์นี้ delegate ไป canonical แล้ว: `:38` import `utils/working-days`)
8. "Calendar ที่ sticky-return ใช้" = `utils/working-days.js`: sticky-return คือ CAR flow (`apps/backend/services/notification-service.js:81`), CAR deadline ใช้ `car-deadline-service.js:19` → `require('../utils/working-days')`; L-001 ระบุตรงกัน: "ยุบเหลือ utils/working-days.js ตัวเดียว (ตัวที่ sticky-return ใช้)" — `AUDIT_LEDGER.md:20`
9. ผู้ใช้ calendar ตัวรอง (working-days-service): `routes/api/system/system.js:8`, `routes/api/system/cron.js:7` เท่านั้น; ผู้ใช้ตัว canonical: 14 ไฟล์ non-test (เช่น `services/car-deadline-service.js:19`, `jobs/waiver-sla-escalation-job.js:24`, `services/audit-scheduling-service.js:44`)

**D. Vocab/schema ปัจจุบัน — จุดชนกับ state machine §4.1**
10. `apps/backend/shared/checkout-status.js:21-26` — CHECKOUT_STATUSES = `PENDING_PAYMENT, SETTLED, EXPIRED, CANCELLED` (**ไม่มี INVOICED, ไม่มี OVERDUE**); transitions `:41-46` มี `EXPIRED → PENDING_PAYMENT` re-entry; Postgres CHECK ตาม migration 20260802150000 (`checkout-status.js:12`) — เพิ่ม state = ต้องแก้ CHECK (migration)
11. `apps/backend/prisma/schema/billing.prisma:1251-1310` — CheckoutOrder **ไม่มี dueDate**; มีแค่ `expiresAt`/`settledAt` (`:1281-1282`)
12. `apps/backend/prisma/schema/billing.prisma:58-59` — Invoice มี `dueDate DateTime` (**required, ไม่มี default**; DB NOT NULL ตาม `prisma/migrations/20260110020726_add_system_config/migration.sql:178`) และ comment vocab เก่า `pending, paid, overdue, cancelled` — **`overdue` เป็น stored status ใน vocab เก่า** ขัดกับ §4.1 ที่สั่งให้ derived
13. ไม่มี writer ตัวไหนเขียน Invoice.status = 'overdue' จริง (grep ทั้ง backend: มีแต่ query filter — `services/repositories/invoice-repository.js:50,135,141`, `services/invoice-service.js:65-67`, `services/ar-aging-service.js:189` และ seed `scripts/seed-test-data.js:114`); ar-aging **derive** overdue จาก dueDate อยู่แล้ว — `services/ar-aging-service.js:7-8,105-107,248`
14. `shared/dtam-remittance-status.js` มีอยู่แล้ว (Wave 1) — ตรง ssot-domains `scripts/probes/ssot-domains.txt:7`

**E. จุด mint invoice ปัจจุบัน**
15. Legacy per-phase mint (ensurePhaseInvoices): due date = **calendar days แบบ hardcode** — `services/application-service/application-phase-invoice-methods.js:424` (`dueInDays = PHASE_1 ? 7 : 15`) และ `:226` (`Date.now() + dueInDays*24h`) — ไม่ใช้ working-days
16. Wave-2 checkout mint: `services/checkout/stripe-checkout-service.js:140-148` สร้าง order status `PENDING_PAYMENT` ตรง ๆ (ไม่มี INVOICED interlude), `:159-171` mint Invoice **โดยไม่ set dueDate เลย**
17. Settlement path: `services/checkout/checkout-settlement-service.js:150-160` — order → SETTLED + invoice → 'paid' ใน webhook transaction (สอดคล้อง settle-webhook-only)

**F. Due date rule — "ตัวเลขจริงอยู่ไหน"**
18. ไม่มี constant กลาง: `config/business-rules.js` PAYMENT section (`:112-122`) มีแค่ `REVISION_DEADLINE_BUSINESS_DAYS: 5` — **ไม่มี invoice-due-date rule**; ตัวเลขที่มีจริงกระจายเป็น hardcode: 7/15 วันปฏิทิน (`application-phase-invoice-methods.js:424`), `INVOICE_DUE_CALENDAR_DAYS = 7` ใน PDF template (`services/pdf/invoice-template-service.js:17,548`), 7 วัน subscription (`services/subscription/subscription-order-service.js:148`), 30 วัน quote (`services/quote-service.js:332`)

**G. Cron/reminder infrastructure ปัจจุบัน**
19. Runner = node-cron ใน `apps/backend/jobs/scheduler.js`; เวลาไทยรองรับผ่าน option `{ timezone: 'Asia/Bangkok' }` ต่อ job (`:111,125,159,177,197,233,253`) — แต่บาง job ไม่ใส่ (certificate expiry `:43`, revision-deadline `:30`, work-activity `:134` = server-local)
20. Dedup patterns ที่มีอยู่ 4 แบบ:
    - Fanout `dedupeKey` — Redis setNX, **TTL 60 นาทีเท่านั้น** + in-memory fallback — `services/notification-fanout-service.js:66-72,154-160`
    - Per-row column marker (`warnedAt`/`breachedAt`) — `jobs/scheduler.js:128-132`
    - Durable JSON marker keyed `(certId, reminderType)` — **ไม่มีมิติ date** — `services/renewal-service.js:439-452`
    - Cadence-only (พึ่งเวลารัน ไม่มี marker): slip-sla — `jobs/slip-sla-monitor.js:5-9`
21. "ข้ามวันหยุด" ปัจจุบัน: ไม่มี job ไหน skip วันหยุดไทยจริง — ใกล้สุดคือ cron `'0 10 * * 1-5'` (skip เสาร์-อาทิตย์เท่านั้น) — `jobs/scheduler.js:103`

## INFERRED (อนุมานจากโค้ด — ระบุฐานอนุมาน + ความมั่นใจ)

1. **Checkout mint ปัจจุบันน่าจะ crash บน DB จริง**: `stripe-checkout-service.js:159-171` ไม่ส่ง `dueDate` แต่ schema บังคับ required+NOT NULL (`billing.prisma:58`) → Prisma create ควร throw validation error. ความมั่นใจ: สูงเชิง schema (ไม่ได้รันจริง; unit test mock prisma จึงมองไม่เห็น) — งาน §4.1 (ใส่ due date ตอน mint) ทับจุดนี้พอดี
2. **ไม่มี infra dedup `order+type+date` ที่ durable ข้ามวัน** — จาก G.20: Redis TTL 1 ชม. สั้นเกิน, renewal marker ไม่มี date, column marker เป็น one-shot → ต้องมีกลไกใหม่ (ความมั่นใจสูง)
3. **EXPAND Wave 1 ไม่ครอบงานนี้ทั้งหมด** — (a) INVOICED เป็น checkout state จริง → แก้ CHECK = migration; (b) dedup store ไม่มีที่เก็บ → น่าจะต้อง migration; (c) due date บน Invoice.dueDate เดิม → storage ครอบแล้ว
4. Milestone ของ schedule = M1/M2 สองงวด (ฐาน: `checkout-status.js:29`, `billing.prisma:1263`, step2 §0) — มั่นใจสูงแต่ §4.1 ไม่ได้เขียนเอง

## AMBIGUOUS (ตัดสินไม่ได้จาก doc+โค้ด — ห้ามเดา)

1. **INVOICED เป็น state ของ entity ไหน** — §4.1:59 เขียน `INVOICED → PENDING_PAYMENT → SETTLED` แต่ checkout-status.js ไม่มี INVOICED, step2:68 approve 4 state, step2:303 บอก vocab เป็นงาน Wave 3, โค้ด mint ไม่มี interlude ทางตีความ: (i) เพิ่มเข้า CheckoutOrder vocab (migration แก้ CHECK + กระทบ partial unique index + probe settle-webhook-only), (ii) state ของ Invoice/schedule แยก, (iii) conceptual phase = `invoiceId != null`
2. **§4.1 ไม่พูดถึง EXPIRED/CANCELLED** — doc มี 3 state; ของจริง 4 + re-entry edge — replace หรือ extend?
3. **ตัวเลข due date ไม่มีที่ไหนระบุ** — §4.1 บอกแค่ business-day+วันหยุดไทย ไม่บอกกี่วัน นับจาก event ไหน; 7/15 ที่มีเป็น calendar-day hardcode (หน่วยขัด §4.1 + ขัด Law 3.5) — product decision
4. **Due date เก็บที่ไหน** — CheckoutOrder ไม่มี column, Invoice.dueDate มี; ความสัมพันธ์ due date ↔ `expiresAt` ของ intent ไม่ระบุ
5. **OVERDUE derived vs stored vocab เก่า** — query ที่ filter stored `'overdue'` (invoice-repository.js:50,135,141, ar-aging-service.js:189, seed) จะ match 0 row — scope §4.1 ครอบการแก้ vocab/report เก่าไหม (QA matrix PROMPT:86 คาดว่า Account เห็น OVERDUE)
6. **"ข้ามวันหยุด" ของ reminder** — skip เฉย ๆ หรือ shift ไปวันทำการถัดไป; dedup `date` = วันที่รันหรือวันที่ควรส่ง
7. **`type` ใน dedup key มีค่าอะไรบ้าง** — reminder types ไม่นิยามที่ไหน (เทียบ renewal D60/D30/D15)
8. **ทางแก้ calendar 3-sources** — L-001 เสนอ delegate แต่สองตัวพฤติกรรมต่างจริง (static+ICT vs env/systemConfig+server-local) — delegate = behavior change ของ `routes/api/system/{system,cron}.js` เกิน scope L-001 หรือไม่

## MATERIAL-AMBIGUITY

**แตะเงินโดยตรง: #1, #2, #3, #4, #5** — กำหนดว่าเมื่อไหร่เงินถึงกำหนด/ค้างชำระ และ state machine ของ order เงิน = product/policy decision (โดยเฉพาะ #3 ไม่มี source ใดเลย, #1 แตะ vocab ที่มี DB CHECK + probe pin) → **STOP-CLASS** ไม่มีข้อแตะ identity/สิทธิ์ (#8 เป็น ops-facing) หมายเหตุ: probe `holiday-single-source` FAIL อยู่แล้วก่อนเริ่ม (L-001) — ledger คาดหวังให้งานนี้เป็นตัวปิด
