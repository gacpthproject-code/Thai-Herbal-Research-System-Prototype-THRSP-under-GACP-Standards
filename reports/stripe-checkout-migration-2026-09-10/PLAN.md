# แผนย้าย checkout → Stripe Checkout Sessions (hosted) — ฉบับสุดท้าย

Status: `PENDING` — เอกสารนี้เป็นแผน ไม่ใช่ผลรัน · ไม่ได้รัน probe/test ใดในเซสชันนี้ · ทุก `file:line` เปิดอ่านจริง (รายการท้ายเอกสาร) · ข้อที่เป็นพฤติกรรมของ Stripe เอง ติดป้าย **[ต้องยืนยัน]**

---

## §1. รับข้อคัดค้านข้อไหน ไม่รับข้อไหน

| ข้อ | ผล | เหตุผล (หลักฐาน) |
|---|---|---|
| M1/O1 CANCELLED ทางตัน + invoice ผี | **รับ** | `checkout-status.js:45` `CANCELLED: []` terminal · `20260701010000.../migration.sql:87-89` `uniq_invoice_app_service_active` ไม่มีเงื่อนไข status · `grep "isDeleted: true"` ใน `services/checkout|services/billing|routes/api/finance|jobs` = **0 hit** ⇒ invoice ค้างกินช่องตลอดกาล จริง |
| M1(ก) ใส่ CANCELLED ใน predicate ของ open-index | **ไม่รับ** | ถ้า CANCELLED อยู่ใน index จะไม่มีทางออกจาก price-drift เลย (O2) · รับ **M1(ข)** แทน: ผู้เขียน CANCELLED ต้อง soft-delete invoice ใน tx เดียวกัน |
| M2 ORDER_NOT_FOUND เงียบ + terminal | **รับ** | `checkout-settlement-service.js:236` fallback ค้นเฉพาะคอลัมน์ PI · `:506` `const terminal = result.settled === false && result.reason;` แล้ว stamp PROCESSED · `settlement-reconcile-job.js:132-140` ข้าม PROCESSED ⇒ ไม่มีใครกวาดอีกเลย |
| M3 จ่ายซ้ำสองครั้งต่อ order | **รับครึ่ง** | รับส่วน "ตรวจจับ + AuditLog CRITICAL + แจ้ง admin" · **ไม่รับ** การสร้างเส้นคืนเงินในรอบนี้ (L3 + `refund-service.js` เป็นงานที่คนการเงินเริ่มและโอนเอง) |
| M4/O3 closure job ตาบอดต่อ order ที่ไม่มี PI id | **รับ + เปลี่ยนลำดับงาน** | `payment-closure-job.js:127` `select: { stripePaymentIntentId: true }` · `:129` ไม่มี PI = `return false` (ปิดได้) · `:35` "PAYMENT_ABANDONED close is final" ⇒ **ใบ job ต้อง merge+deploy ก่อนใบที่สร้าง session** |
| M5/O5 D6 ยิง CRITICAL เท็จทุกใบ | **รับ** | `:363` settle เขียน PI id ลงแถว charge ไม่ใช่แถว order ⇒ `order.stripePaymentIntentId` null ⇒ "ไม่ตรง" เท็จ · แก้: null = ผูก ref ไม่ใช่ mismatch |
| M6 PERIOD_CLOSED กับการจ่ายแบบ async | **รับ** | หน้าต่างจ่ายยาวขึ้นเป็นวัน ⇒ `entryDate` ต้องเป็นเวลาที่ gateway capture · และ PERIOD_CLOSED ต้องเข้าคิว operator ไม่ใช่ DEAD_LETTER เงียบ (`:513-523`) |
| M7 ด่านเทียบยอดกลายเป็นเทียบเลขของเราเอง | **รับ** | `:268` เทียบ `paymentIntent.amount_received` ⇒ `toSettlementFacts()` ต้องดึงยอดจาก PaymentIntent เท่านั้น ห้าม fallback `session.amount_total` |
| M8 `line_items` / VAT | **รับ** | `stripe-adapter.js:48-58` วันนี้ส่ง `amount` ก้อนเดียวผ่าน `paymentIntents.create` ⇒ การแปลงเป็น line_items เป็นงานบังคับที่แผนเดิมไม่มี · VAT คิดบนก้อนรวม (`fee-service.js:239-242`, `config/payment-fees.js:41-45`) ⇒ ห้าม `automatic_tax`/`tax_rates` |
| M9/O6 เผาเลข TAX-PRD เป็นกิจวัตร | **รับ (ทางเลือก ก)** | `:290` allocate นอก tx ก่อน `:305` FOR UPDATE · **ไม่รับ (ข)** ย้ายเข้า tx เพราะ `:283-289` อธิบายว่าจะ serialize ทุก settle หลัง lock ของ sequence |
| M10 `gatewayRef` เก็บอะไร | **รับ** | `:363` `gatewayRef: paymentIntent.id` เป็นจุดเดียวที่ผูก ledger กับ Stripe ⇒ ตรึงว่าเป็น PI id เสมอ |
| M11/F6 ทวงเงินคนที่จ่ายแล้ว | **รับ** | `payment-reminder-job.js:119-120` กรองแค่ serviceType + `pending` · `payment-closure-job.js:251` การทวงครบคือเงื่อนไขก่อนปิด |
| O2 remediation ของ price-drift เป็น deadlock | **รับ** | `error-codes.js` (CHECKOUT_PRICE_DRIFT) สั่ง "cancel its PaymentIntent … then re-issue" — แต่ invoice ผีทำให้ mint ใหม่ 409 อยู่ดี ⇒ ต้องมี **ประตูล้างรายการจริง** ก่อน ไม่ใช่แก้คำในแคตตาล็อก |
| O4 reconcile query B | **รับ** | `settlement-reconcile-job.js:118-121` กรอง `stripePaymentIntentId: {not: null}` + `:75` `SETTLE_EVENT_TYPE` เป็น scalar + `:136` JSON path แกนเดียว |
| O7 ตารางเดินสถานะไม่บังคับอะไรจริง | **รับ** | `grep canTransitionCheckout` ทั้ง repo = เจอเฉพาะ `shared/checkout-status.js` + `__tests__/unit/checkout-vocabulary.test.js` ⇒ ผู้เขียนทุกตัวต้องใช้ `updateMany` + `where.status IN (...)` |
| O8 เหตุผลของใบ "ลบรางเดิม" ผิด | **รับ — และถอนข้ออ้างของแผนเดิม** | `payment-service-phase-flow.js` **ไม่มี** `invoice.create` (grep = 0) · มีแต่ `:187` เดินคำขอไป `PENDING_DOC_FEE`, `:192` `phase1Status:'PROCESSING'`, `:211` charge `BANK_TRANSFER` ⇒ ประโยค "ปิด flag แล้วใบแจ้งหนี้เกิดเร็วขึ้น" **ผิด ตัดทิ้ง** |
| O9 ลำดับ migration/deploy | **รับ** | image ที่ขึ้นก่อน `migrate deploy` = backend ไม่บูต · ไม่มีการถอย schema มีแต่ roll-forward |
| O10 FE/BE คนละ image | **รับ** | `checkout-service.ts:43-46` บังคับ `paymentIntentId`/`clientSecret` เป็น required |
| F1 หน้ารายการไม่รู้จัก PROCESSING | **รับ** | `client-view.tsx:315-317` `pendingAmount` นับจาก invoice ล้วน · `checkout-entry-owes.ts:42` `pendingAmount > 0` ⇒ ปุ่มยังขึ้นทั้งที่จ่ายแล้ว |
| F2 ไม่มีใครบอกผลการจ่าย | **รับ** | settlement ไม่ import notification เลย |
| F3 PROCESSING ไม่มีประตูออก | **รับแบบมีเงื่อนไข** | ให้ reconcile เขียน EXPIRED ได้ **จากคำตอบของ gateway เท่านั้น** — ไม่รับการเขียนสถานะจากนาฬิกาเราอย่างเดียว (เงินเป็นความจริงของ gateway) |
| F4 attempt ต้องตัดสินจาก `expiresAt` | **รับ** | ทำให้ webhook เป็นตัวยืนยัน ไม่ใช่เงื่อนไขจำเป็น — ตัดลูป "กดแล้วได้ QR ที่ตายแล้ว" |
| F5 T1 ต้องมาก่อน T2 | **รับ** | `client-view.tsx:457` กล่องเตือนผูกกับ `pendingAmount > 0` |
| F7 เกษตรกรโหลดใบเสร็จไม่ได้ | **รับ** | `invoice-payment-handlers.js:62` receipt PDF = `authenticateProvider` + `RECEIPT_ISSUE` ⇒ เพิ่มประตูฝั่ง health เป็นใบเล็ก |
| F8/F9/F10/F11 จอคั่น · เวลาหมดอายุ · mock url · เลขคำขอ | **รับทั้งหมด** | `middleware.ts:176` เก็บแค่ pathname · `Dockerfile:70-71` flag เป็น build-time · `mock-payment-adapter.js:31,62` คืน `pi_mock_*` ไม่มี url |
| ลบสาขา `payment_intent.*` ทันที | **ไม่รับ** | ต้องเป็นคำสั่ง operator เป็นลายลักษณ์อักษร ไม่ใช่การอนุมานของ agent (L6) |

---

## §2. การตัดสินใจของแผนสุดท้าย

| # | ตัดสิน |
|---|---|
| D1 | `cs_...` อยู่คอลัมน์ `stripe_checkout_session_id` ของตัวเอง · `stripe_payment_intent_id` คงความหมายเดิม · **`gatewayRef` = PI id เสมอ** |
| D2 | เพิ่มสถานะ `PROCESSING` (PromptPay async) |
| D3 | หนึ่ง order + หนึ่ง invoice ต่อ (application, milestone) จนกว่าจะ `SETTLED` · predicate ของ open-index = `PENDING_PAYMENT / PROCESSING / EXPIRED` · **`CANCELLED` เป็นการล้างรายการโดยเจตนา: ผู้เขียนต้อง soft-delete invoice ใน tx เดียวกัน และทำได้เฉพาะ invoice ที่ยัง `pending` และไม่มี `receiptNumber`** |
| D4 | **ไม่ย้าย** การ mint invoice ไป settle (คู่คัดค้านทั้งสองเห็นตรงกัน: `journal-entry-service.js` บังคับ `invoiceId`, `dueDate` NOT NULL, ผู้อ่าน invoice-pending 5 ราย) |
| D5 | `idempotencyKey = checkout:{orderId}:{attempt}` · **`attempt+1` ตัดสินจาก `expiresAt < now` ของเราเอง** ไม่ใช่จาก status (F4) |
| D6 | settle เทียบ ref ทุกครั้ง **แต่** ref ที่เป็น null = "ผูกให้" ไม่ใช่ mismatch · settle เขียนทั้ง session id และ PI id ลงแถว order ใน tx เดียวกัน · mismatch จริง = AuditLog CRITICAL + แจ้ง admin + ปฏิเสธ |
| D7 | ประตูจริงคือ `STRIPE_CHECKOUT_ENABLED` (backend, `payments.js:502-509` ตอบ 503) · `NEXT_PUBLIC_CHECKOUT_UI_ENABLED` เป็น build-time (`Dockerfile:70-71` default `true`) ⇒ "เปิดกลับ" = เลิกส่ง `--build-arg ...=false` · **ข้ออ้างเดิมเรื่องใบแจ้งหนี้ถูกถอน** |
| D8 | หนึ่ง order = **หนึ่ง settle-class event** · order ที่มี session id: `payment_intent.succeeded` = บันทึก PI id อย่างเดียว ไม่ settle (กันเผาเลขใบเสร็จ) |
| D9 | refusal ที่ terminal ได้ ต้องอยู่ใน **allowlist ที่ระบุชื่อ** ไม่ใช่ `result.reason` อะไรก็ได้ · ORDER_NOT_FOUND ที่ ref มีเงินจริง = throw เข้า retry + แจ้ง admin |

---

## §3. ลำดับงานใหม่ (เปลี่ยนจากแผนแรกตาม M4/O3, F5, O2)

```
W0 ซ่อมของที่ผิดวันนี้        W1 รากฐาน            W2 เปิดใช้จริง              W3 เปิดปุ่ม
P0 ─┐                                              
P1 ─┴─ P2                     P5 ── P6 ── P7 ── P8 ── P9 ── P10 ── P11 ──┬── P14 ── P15
P3 ─── P4 ────────────────────┘                    ▲                     │
P13 (ขนาน, ไม่ขึ้นกับใคร)                     TEST-2 ต้องผ่านก่อน P10     P12 ─────┘
```

**สิ่งที่เปลี่ยนจากแผนแรก**: ใบ job (P8) ขึ้น **ก่อน** ใบสร้าง session (P10) · ใบ "ประตูล้างรายการ" (P4) เป็นของใหม่และเป็นเงื่อนไขก่อนแตะคำ remediation · P1 เป็น dependency ของ P2 · P13 (ใบเสร็จฝั่งเกษตรกร) ไม่ต้องรอ P15

### รายละเอียดที่ต้องอยู่ในแต่ละใบ

- **P0** แก้ `.claude/skills/gacp-payment-invariants/SKILL.md:26-38` — ตาราง 5,535 / 27,675 และประโยค "VAT คิดจากค่าบริการเท่านั้น" ขัดกับไฟล์ที่มันอ้างเอง (`config/payment-fees.js:41-45`: `vat = round((stateFee + serviceFee) × VAT_RATE)` ⇒ 5,885 / 29,425)
- **P1** กล่องเตือน flag-off เปลี่ยนจาก `pendingAmount > 0` (`client-view.tsx:457`) เป็น `entryOwes`
- **P2** ลบราง `/payments/create` (`submit-and-hand-over.ts:83`) — เหตุผลจริง: รางสลิปถูกสั่งเลิกแล้ว · **ต้องเขียนผลข้างเคียงไว้ในใบ**: ผู้เขียน `phase1Status` และการเดินคำขอไป `PENDING_DOC_FEE` (`payment-service-phase-flow.js:187,192`) หายไปด้วย = population ของทุกคิวที่กรองด้วย `PENDING_DOC_FEE` เปลี่ยน
- **P3** settlement รู้ว่าเงินก้อนนี้ของ order ไหน: เทียบ ref ตาม D6 · fallback lookup เป็น `OR` ของสองคอลัมน์ · ORDER_NOT_FOUND/mismatch ที่มีเงินจริง = ไม่ terminal + แจ้ง admin (ท่อเดียวกับ price-drift) · **RED-first บังคับ**
- **P4** ประตูล้างรายการ (operator): tx เดียวที่ตั้ง order เป็น `CANCELLED` + `invoice.isDeleted = true` + `deleteReason` · ปฏิเสธถ้า invoice ไม่ใช่ `pending` หรือมี `receiptNumber` · เป็นทางออกเดียวของ price-drift และของเกษตรกรที่กดผิด
- **P5** schema + vocabulary: `stripe_checkout_session_id` (unique), `checkout_session_url`, `session_attempt`, ใช้ `expiresAt` ที่มีอยู่แล้ว, `PROCESSING` ใน CHECK + predicate ของ open-index ทั้งคู่ (application/subscription), ตารางทรานซิชันใหม่ (boot assertion จับให้เอง)
- **P6** adapter seam: `createHostedCheckoutSession` / `getCheckoutSession` / `expireCheckoutSession` / `toSettlementFacts` · **เปลี่ยนชื่อ `createCheckoutSession` เดิมเป็น `createPaymentIntent`** (วันนี้ชื่อโกหก — `stripe-adapter.js:44-59` เรียก `paymentIntents.create`) · `line_items` = 3 `price_data` จากคอลัมน์ของ order, `quantity:1`, ห้าม `automatic_tax`/`tax_rates`/promo · ชื่อบรรทัดแรกพกเลขคำขอ · `payment_intent_data.metadata` ต้องมี `checkoutOrderId` · mock คืน url ที่เป็น route ภายในแอป
- **P7** webhook + settlement: 4 event ใหม่ · ผู้เขียนสถานะทุกตัวเป็น `updateMany` + `where.status IN` · `payment_intent.canceled` = **no-op** เมื่อแถวมี session id · D8 · `entryDate` = เวลาที่ gateway capture · notification "ชำระสำเร็จ / ชำระไม่สำเร็จ" (in-app) · terminal allowlist (D9)
- **P8** jobs: reconcile query B = `OR` สองคอลัมน์ + `status IN (PENDING_PAYMENT, PROCESSING)` + event type เป็นชุด (`:75`, `:135`, `:136` แก้พร้อมกัน) + เขียน `EXPIRED` ได้จากคำตอบ gateway · closure `isInvoicePaidAtGateway` อ่านทั้งสองคอลัมน์ ไม่มี ref ทั้งคู่ = **ห้ามปิด** · reminder ข้าม invoice ที่ order เป็น `PROCESSING`/`SETTLED`
- **P9** `GET /api/payments/checkout/:id/status` (`authenticateHealth` + ownership, ไม่ใช่ของตัวเอง = 404) — คืน status/expiresAt/breakdown/invoice/receipt/`resume`/`canRetry` · ห้ามมีค่าจาก env ในคำตอบ (L2)
- **P10** สร้าง session แทน PI: เขียน session id + url + expiresAt + attempt · re-entry อ่าน 3 สถานะ · **เจอ `PROCESSING` = ปฏิเสธด้วยรหัสใหม่ ห้ามสร้าง session ใบที่สอง** · `expiresAt < now` = attempt+1 · ตัด `clientSecret` ออกจาก response
- **P11** FE: หน้ารายการอ่าน P9 แล้วเปลี่ยนปุ่มเป็นป้าย "รอยืนยันการชำระเงิน" · คงจอคั่นที่พิมพ์เลขคำขอ + `expiresAt` เวลาไทย + **ลิงก์ให้กดเอง** (auto-redirect เป็นทางลัด) · หน้า return อ่าน order id จาก path segment (middleware เก็บแค่ pathname) · ปฏิเสธ navigate ไป host ที่ไม่ใช่ Stripe · อ่าน `data.gateway?.url` แบบทน (deploy BE ก่อน FE)
- **P12** รหัส + คำไทยใหม่ · แก้ remediation ของ `CHECKOUT_PRICE_DRIFT` ให้ชี้ไปที่ประตู P4
- **P13** `GET /api/invoices/:invoiceId/receipt/pdf` ฝั่ง health + `assertHealthOwnsInvoice`
- **P14** probe `checkout-session-rail` + `--selftest` · ขยาย `settle-webhook-only` ให้คุมผู้เขียน `PROCESSING`/`EXPIRED` · ตรวจว่าไม่มี `checkoutOrder.update` ที่เขียน `status` โดยไม่มี status predicate (ยกเว้นไฟล์ settle ที่ถือ FOR UPDATE) · แถวใหม่ใน `probe-registry.txt` = **operator เซ็น**
- **P15** เดินจริง test mode + view-pack + เปิดปุ่ม

---

## §4. สถานะ + ผู้เขียน (ห้ามมีผู้เขียนที่หก — P14 บังคับ)

```
PENDING_PAYMENT → SETTLED | PROCESSING | EXPIRED | CANCELLED
PROCESSING      → SETTLED | EXPIRED | CANCELLED
EXPIRED         → PENDING_PAYMENT | CANCELLED
SETTLED, CANCELLED → terminal
```

| edge | ผู้เขียน | ทริกเกอร์ |
|---|---|---|
| (ว่าง) → PENDING_PAYMENT · EXPIRED → PENDING_PAYMENT | `stripe-checkout-service.js` (P10) | กดปุ่ม / กดซ้ำหลัง `expiresAt` |
| → PROCESSING | `checkout-settlement-service.js` (P7) | `checkout.session.completed` ที่ `payment_status ≠ paid` |
| → SETTLED | `checkout-settlement-service.js:311-318` | `async_payment_succeeded` / `completed` ที่ paid / `payment_intent.succeeded` (เฉพาะ order รางเก่า) |
| → EXPIRED | `checkout-settlement-service.js` (P7) + `settlement-reconcile-job.js` (P8, จากคำตอบ gateway) | `session.expired` / `async_payment_failed` |
| → CANCELLED | ประตู operator (P4) · `payment_intent.canceled` เฉพาะ order ที่**ไม่มี** session id | ล้างรายการโดยเจตนา (ต้อง soft-delete invoice ใน tx เดียวกัน) |

---

## §5. เงื่อนไขเปิดปุ่มกลับ

G1 P3–P12 merge บน main · G2 probe `checkout-session-rail` เขียว · G3 `settle-webhook-only`(ขยาย) + `webhook-idempotent` + `money-equation` + `quotation-closure` เขียว (สองตัวหลังต้อง DB จริง = operator รัน) · G4 จ่ายจริง 1 ครั้งใน test mode ครบเส้นถึง **ใบเสร็จที่เกษตรกรกดโหลดได้เอง** (ไม่ใช่แค่เลขบนจอ) · G5 query ยืนยัน 1 order = 1 journal = 1 เลขใบเสร็จ · G6 operator merge ทุกใบ Tier C
**พูดตรง ๆ**: probe คุมได้แค่ว่าโค้ดพร้อมหรือยัง การ flip `--build-arg` + env ยังเป็นมือมนุษย์

---

## §6. สิ่งที่แผนนี้ไม่แก้

1. ไม่ทำ embedded checkout 2. ไม่แก้ `writeApplicationStatus` ที่ปลุกคำขอ EXPIRED (ใบแยก) 3. ไม่สร้าง reopen ของคำขอที่ถูกปิด 4. ไม่แตะ refund/credit/debit/WHT — จ่ายซ้ำได้แค่ "ตรวจจับ + แจ้ง" 5. ไม่เพิ่มสถานะใน workflow ของคำขอ 6. ไม่แตะ card path 7. ไม่ลบสาขา `payment_intent.*` 8. ไม่รับประกัน deploy ครั้งเดียวจบ — P5 หนึ่ง migration = สองฐาน (prod+demo ใช้ Supabase ร่วม, staging แยก) และไม่มีการถอย schema

**ยังไม่พิสูจน์ที่ไหนเลย [ต้องยืนยัน]**: อายุ default/สูงสุด/ต่ำสุดของ Checkout Session · การ copy metadata ลง PaymentIntent · จังหวะที่ `session.payment_intent` ถูกเติม · ลำดับ event ของ PromptPay · ทั้งหมดต้องผ่าน TEST-2/TEST-5 ก่อน merge P10 · ต้องได้ test key จาก operator ก่อน: `BLOCKED(operator:stripe-test-keys)` (ห้าม echo ค่าใด ๆ — L2)

---

## §7. ตารางใบงาน

> tier ตัดสินโดย `bash scripts/probes/tier-check.sh` เท่านั้น (L5) — คอลัมน์นี้คือการวางแผน ไม่ใช่คำตัดสิน

| ใบงาน | tier คาด | ขึ้นกับ | พิสูจน์ยังไง |
|---|---|---|---|
| P0 แก้ตัวเลข VAT ใน SKILL.md | A | — | diff เทียบกับ `payment-fees.js:41-45` + local-gate PASS |
| P1 กล่องเตือน flag-off ผูก `entryOwes` | B | — | RED-first: เทสหน้ารายการ (ยอมรับใบเสนอราคาแล้ว invoice ยังไม่เกิด) แดงก่อน |
| P2 ลบราง `/payments/create` | C | P1 | RED-first + คำยืนยัน operator + ระบุผลข้างเคียงต่อ `PENDING_DOC_FEE` |
| P3 settle ผูก ref + refusal ไม่เงียบ | C | — | RED-first 4 เคส: ref ตรง / null / ไม่ตรง / ORDER_NOT_FOUND ที่มีเงิน (mock adapter) |
| P4 ประตูล้างรายการ (cancel + soft-delete invoice) | C | P3 | RED-first: mint ซ้ำหลัง CANCELLED ต้องผ่าน (วันนี้ 409) + ปฏิเสธเมื่อ invoice paid |
| P5 schema + vocabulary (PROCESSING) | C | P4 | migration ขึ้น scratch Postgres จริง + boot assertion + selftest ของ CHECK/partial index |
| P6 adapter seam + line_items + rename | C | P5 | TEST-2 (metadata จริงใน test mode) + unit เทียบ 3 บรรทัดกับ `totalPayableAmount` |
| P7 webhook + settlement event ชุดใหม่ | C | P6 | RED-first + `stripe listen`/`stripe trigger` (ลายเซ็นจริง) + เทส redelivery ทับ SETTLED |
| P8 jobs (reconcile/closure/reminder) | C | P5 | RED-first: order ที่มีแต่ session id ต้อง **ไม่ถูกปิด** และต้องถูก backstop เห็น |
| P9 ประตูอ่านสถานะ | C | P8 | เทส ownership (คนอื่น = 404) + รูปคำตอบ + ไม่มีค่าจาก env |
| P10 สร้าง session แทน PI | C | P8, P9, TEST-2 | RED-first: PROCESSING = ปฏิเสธ · `expiresAt` เลย = attempt+1 · เดินประตูจริงบน Postgres |
| P11 FE จอคั่น + return + ป้าย PROCESSING | B | P10 | view-pack (`gacp-view-in-the-loop`) — ภาพ 5 จอ + deploy BE ก่อน FE |
| P12 รหัส + คำไทย + remediation ใหม่ | A | P4, P6 | เทส RAIL_CODES ครบ + local-gate |
| P13 ใบเสร็จฝั่งเกษตรกร | B | — | RED-first ownership + เปิด PDF จริง 1 ใบ |
| P14 probe rail + ขยาย settle-webhook-only | C | P10, P11 | `--selftest` ทั้งเคสแดงและเขียว + operator เซ็นแถว registry |
| P15 เดินจริง + view-pack + เปิดปุ่ม | A (evidence) | P14 | G1–G6 · จ่าย PromptPay test 1 ครั้งครบเส้นถึงใบเสร็จที่เกษตรกรโหลดเอง |

---

**สำหรับ operator (ย่อหน้าเดียว)**: แผนนี้ย้ายการรับเงินจากการที่เราต้องเขียนฟอร์มจ่ายเงินเอง (ซึ่งไม่เคยถูกเขียน จึงเป็นเหตุที่ปุ่มวันนี้พาไปจบที่จอ "รอชำระเงิน" เฉย ๆ) ไปเป็นหน้าจ่ายเงินที่ Stripe โฮสต์ให้ — เกษตรกรกดปุ่ม แล้วไปสแกน PromptPay บนหน้าของ Stripe แล้วกลับมาเห็นสถานะและใบเสร็จของตัวเอง · งานมี 16 ใบ ในนั้น **11 ใบเป็น Tier C ที่ต้องให้ท่าน merge** · ห้าใบแรก (P0–P4) ซ่อมของที่พังอยู่แล้ววันนี้และทำได้ทันทีโดยไม่ต้องมีคีย์ Stripe ส่วนที่เหลือติดที่ **ต้องได้ test key จากท่านก่อน** จึงจะพิสูจน์ข้อที่ยังไม่รู้ 4 ข้อเกี่ยวกับพฤติกรรมของ Stripe ได้ · ถ้าไม่นับเวลารอ operator merge/คีย์ งานเขียนโค้ดคือระดับ "หลายวันทำงาน" ไม่ใช่ชั่วโมง เพราะทุกใบที่แตะเงินบังคับ RED-first + evidence pack และ P5 หนึ่งใบ = migrate สองฐานข้อมูล (prod+demo ใช้ Supabase ร่วม, staging แยก) ที่ถอยกลับไม่ได้ มีแต่เดินหน้า · ความเสี่ยงหนักอยู่สามที่: (1) ถ้า metadata ไม่ถูก copy ลง PaymentIntent การ settle จะพังทั้งระบบ — จึงบังคับให้ยิงจริงดูก่อนเขียนโค้ดตาม (2) ระหว่างที่ยังเปลี่ยนไม่ครบ งานเบื้องหลังอาจปิดคำขอของคนที่จ่ายเงินไปแล้วแบบถาวร — จึงย้ายใบงานเบื้องหลังขึ้นก่อนใบที่สร้าง session (3) PromptPay ยืนยันช้า ทำให้เกิดช่วง "จ่ายแล้วรอยืนยัน" ที่วันนี้ไม่มีที่เก็บ ถ้าไม่ทำหน้ารายการให้รู้จักช่วงนี้ เกษตรกรจะกดจ่ายซ้ำ และเราไม่มีเส้นคืนเงินอัตโนมัติ · ตอนนี้ปุ่มปิดอยู่ และจะเปิดกลับได้ก็ต่อเมื่อ P3–P12 เข้า main ครบ probe ใหม่เขียว และมีการจ่ายจริงใน test mode หนึ่งครั้งที่เดินครบถึงใบเสร็จที่เกษตรกรโหลดเองได้ — การเปิดคือ build image ใหม่โดยเลิกส่ง `--build-arg NEXT_PUBLIC_CHECKOUT_UI_ENABLED=false` พร้อมตั้ง `STRIPE_CHECKOUT_ENABLED` ฝั่ง backend ซึ่งเป็นประตูจริง
