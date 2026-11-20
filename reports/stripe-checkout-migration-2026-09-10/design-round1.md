# แผนย้าย checkout ไป Stripe Checkout Sessions (hosted) — ฉบับลงมือทำ

เอกสารนี้เขียนให้คนที่ไม่เคยต่อ Stripe อ่านแล้วทำตามได้ ทุกข้ออ้างมี `file:line` · ข้อไหนเป็น "พฤติกรรมของ Stripe เอง" ที่ยังไม่ได้พิสูจน์บนเครื่องนี้ ติดป้าย **[ต้องยืนยัน]** ไว้ทุกจุด และมีใบทดสอบรองรับใน §7

---

## §0. ปูพื้น 8 บรรทัดสำหรับคนที่ไม่เคยต่อ Stripe

| คำ | แปลว่าอะไรในระบบนี้ |
|---|---|
| **PaymentIntent (PI)** | "ความตั้งใจจะเก็บเงิน 1 ก้อน" วันนี้เราสร้างตัวนี้ตรง ๆ (`apps/backend/services/payment/stripe-adapter.js:49`) แล้วคาดว่า frontend จะเอา `client_secret` ไปวาดฟอร์มเอง — ซึ่ง **ไม่เคยถูกเขียน** (ข้อเท็จจริงฐาน) |
| **Checkout Session (cs_...)** | หน้าเว็บจ่ายเงินที่ Stripe โฮสต์ให้ เราสร้างแล้วได้ `url` มา 1 อัน แล้ว **redirect** ผู้ใช้ไป Stripe วาด QR PromptPay ให้เอง เราไม่ต้องเขียนฟอร์มจ่ายเงินเลย |
| **webhook** | Stripe ยิง HTTP มาบอกเราว่าเกิดอะไรขึ้น — ประตูเดียวของเราคือ `apps/backend/routes/api/webhooks/stripe.js:60` และมันคือ **ทางเดียว** ที่เงินจะถูกบันทึกว่าเข้าแล้ว |
| **asynchronous payment** | PromptPay ไม่ใช่บัตร: ผู้ใช้สแกนแล้ว Stripe ยังไม่รู้ทันทีว่าเงินเข้า จึงมีช่วง "จ่ายแล้วรอยืนยัน" ที่ระบบเราวันนี้ **ไม่มีที่เก็บ** (`apps/backend/shared/checkout-status.js:21-26` มี 4 ค่า ไม่มีค่ากลาง) |
| **idempotency key** | กุญแจกันสร้างซ้ำ ส่ง key เดิม = Stripe คืนของเดิม วันนี้ key คงที่ `checkout:{orderId}` (`stripe-checkout-service.js:722`) ซึ่งจะกลายเป็นกับดักเมื่อ session มีวันหมดอายุ |
| **test mode** | คีย์ `sk_test_...` เงินไม่ออกจริง เครื่องนี้มี `stripe` CLI แล้ว (รันจริง: `stripe version` → **1.21.8**) |

**ทิศทางที่อนุมัติแล้ว**: hosted (redirect ออกไป Stripe) ก่อน แล้วค่อยย้ายมาฝัง (embedded) ทีหลัง

---

## §1. การตัดสินใจ 7 ข้อที่แผนนี้ยืนอยู่บน (ถ้าไม่เห็นด้วยข้อไหน ต้องแก้ก่อนเริ่มใบแรก)

| # | ตัดสินว่า | เพราะ |
|---|---|---|
| D1 | **ไม่ยัด `cs_...` ลง `stripePaymentIntentId`** — เพิ่มคอลัมน์ `stripe_checkout_session_id` แยก | คอลัมน์เดิมมี unique index ของตัวเอง (`prisma/migrations/20260802150000_wave1_checkout_engine_expand/migration.sql:79-80`) และมีผู้อ่าน 2 job ที่จะเรียก `paymentIntents.retrieve('cs_...')` ทันที (`jobs/settlement-reconcile-job.js:142`, `jobs/payment-closure-job.js:135`) · กติกา memory: ตั้งชื่อให้ถูก อย่าซ่อนค่าที่ถูกไว้หลังชื่อที่ผิด |
| D2 | **เพิ่มสถานะ `PROCESSING`** ให้ checkout order | PromptPay async → `checkout.session.completed` มาถึงตอนเงินยังไม่เข้า ถ้าไม่มีที่พัก จะต้องเลือกระหว่าง "settle ก่อนเงินเข้า" กับ "ทิ้ง event" |
| D3 | **หนึ่ง order + หนึ่ง invoice ต่อ (application, milestone) ตลอดชีวิต** จนกว่าจะ SETTLED หรือ CANCELLED · session หมดอายุ = เกิดใบใหม่เฉพาะฝั่ง Stripe ไม่ใช่ฝั่งเรา | invoice ถูกล็อกด้วย unique `uniq_invoice_app_service_active` (migration `20260701010000_uniq_invoice_app_servicetype`) อยู่แล้ว ถ้าปล่อยให้ order ใบที่สองเกิด จะไป P2002 ที่ invoice แทน = ปฏิเสธผู้ใช้โดยไม่มีเหตุผลที่อธิบายได้ |
| D4 | **ไม่ย้ายการ mint invoice ไปที่ settle** ในรอบนี้ (เหตุผลเต็ม §5) | มี 5 ระบบที่ยึด "invoice pending" เป็นแหล่งความจริง และ journal บังคับ `invoiceId` |
| D5 | **`idempotencyKey` ต้องมี generation**: `checkout:{orderId}:{attempt}` + เก็บ attempt ลงแถว | session อายุ ≤24 ชม. **[ต้องยืนยัน]** แล้วตาย · key คงที่ = หลังหมดอายุจะสร้างใบใหม่ไม่ได้ตลอดกาล |
| D6 | **settlement ต้องเทียบ gateway ref กับแถว order ทุกครั้ง** ก่อนตอบ `alreadySettled` | `checkout-settlement-service.js:247-263` วันนี้ไม่เทียบเลย · เมื่อ order หนึ่งใบมีได้หลาย session หนี้นี้เปลี่ยนจาก "แทบไม่เกิด" เป็น "เกิดตามปกติ" |
| D7 | **ปิดปุ่มด้วย `STRIPE_CHECKOUT_ENABLED` (backend) เป็นด่านหลัก** ไม่ใช่ `NEXT_PUBLIC_CHECKOUT_UI_ENABLED` | ตัวหลังเป็น build-time (`apps/web-app/Dockerfile:50-51`) และ **ปิดแล้วทำให้ใบแจ้งหนี้เกิดเร็วขึ้น** เพราะตกรางเดิมที่ `apps/web-app/src/lib/services/submit-and-hand-over.ts:83` ยิง `POST /payments/create` ตั้งแต่ตอนกดยื่น |

---

## §2. ลำดับงานเป็นใบ

> **กติกา**: tier ตัดสินโดย `bash scripts/probes/tier-check.sh` เท่านั้น (CLAUDE.md L5) คอลัมน์ "tier คาด" ข้างล่างคือการวางแผน ไม่ใช่คำตัดสิน — ทุกใบต้องรัน tier-check จริงก่อนขอ merge · ใบที่แตะ `prisma/schema` + migration + เส้นทางเงิน = **operator merge เสมอ**

### กราฟลำดับ (ลูกศร = ต้อง merge ก่อน)

```
W0 (ทำได้ทันที ขนานกัน)      W1 (รากฐาน)          W2 (เปิดใช้จริง)        W3 (เปิดปุ่ม)
T0 ─┐                          
T1 ─┤                        T4 ──┬── T5 ── T6 ──┬── T7 ── T8 ── T9 ──┬── T12 ── T13
T2 ─┤                             │              │        └── T10 ────┘
T3 ─┘ ──────────────────────────► │              └── T11
```

### W0 — ซ่อมสิ่งที่ผิดอยู่แล้ววันนี้ (ไม่ต้องรอ Stripe เลย)

| ใบ | ชื่อ | tier คาด | ทำอะไร | ขึ้นกับ |
|---|---|---|---|---|
| **T0** | แก้ตัวเลขใน skill ที่เลิกใช้แล้ว | A | `.claude/skills/gacp-payment-invariants/SKILL.md:26-38` ยังบอก VAT คิดจากค่าบริการอย่างเดียว (5,535 / 27,675) แต่โค้ดจริงคิด VAT บนค่าบริการ**ทั้งก้อน** (`apps/backend/modules/billing/internal/fee-service.js:239-243` → 5,885 / 29,425) · ใครอ่าน skill ระหว่างทำแผนนี้จะพัง | — |
| **T1** | กล่องเตือน flag-off ต้องขึ้นเมื่อเป็นหนี้จริง | B | `apps/web-app/src/app/health/payments/client-view.tsx:457` ใช้ `pendingAmount > 0` · คนที่เพิ่งยอมรับใบเสนอราคายังไม่มี invoice → ไม่เห็นทั้งปุ่มและไม่เห็นคำอธิบาย · เปลี่ยนเป็น `entryOwes` (`checkout-entry-owes.ts:42-48`) | — |
| **T2** | ปิดปุ่ม = ต้องไม่ทำให้ใบแจ้งหนี้เกิดเร็วขึ้น | C | ลบ fallback `submit-and-hand-over.ts:83` (`POST /payments/create` ตอนกดยื่น) · รางเก่า/slip ถูกสั่งเลิกแล้ว (memory: slip + account-approve retired; platform ยัง pre-production ไม่มีข้อมูลจริงต้องถนอม) — ต้องมีคำยืนยัน operator ในใบนี้ | — |
| **T3** | settlement ต้องรู้ว่าเงินก้อนนี้เป็นของ order ใบไหน | C | `checkout-settlement-service.js:247-263`: ก่อนคืน `{settled:true, alreadySettled:true}` ต้องเทียบ `paymentIntent.id` กับ `order.stripePaymentIntentId` (และหลัง T4 คือกับ `stripeCheckoutSessionId` ด้วย) · ไม่ตรง = ไม่ใช่ no-op แต่เป็น **AuditLog CRITICAL + refuse** · RED-first บังคับ | — |

### W1 — รากฐาน (สร้างของไว้ ยังไม่มีใครเรียก)

| ใบ | ชื่อ | tier คาด | ทำอะไร | ขึ้นกับ |
|---|---|---|---|---|
| **T4** | schema expand + vocabulary | **C** | 1) เพิ่ม `stripe_checkout_session_id TEXT` + unique index 2) เพิ่ม `session_attempt INT NOT NULL DEFAULT 0` 3) `checkout_orders_status_check` เพิ่ม `'PROCESSING'` (drop/add — ของเดิมที่ `migration 20260802150000:50-52`) 4) **แก้ predicate ของ partial unique**: `checkout_orders_open_per_application_milestone_key` จาก `WHERE status='PENDING_PAYMENT'` (`:89-91`) เป็น `WHERE status IN ('PENDING_PAYMENT','PROCESSING','EXPIRED')` และคู่แฝดของ subscription (`:92-94`) 5) `shared/checkout-status.js:21-26` + ตารางทรานซิชัน `:41-46` (boot assertion `:58-79` จะจับให้เองถ้าลืมแถว) · **ยังไม่มีโค้ดไหนเขียนค่าใหม่** | — |
| **T5** | adapter seam | C | ใน `services/payment/stripe-adapter.js` (ไฟล์เดียวที่ import `stripe` ได้ — probe `stripe-sdk-isolated`): เพิ่ม `createHostedCheckoutSession()` → คืน `{id, url, expiresAt, paymentIntentId, raw}` · `getCheckoutSession(id)` · `expireCheckoutSession(id)` (วันนี้ **ไม่มีเลย** จน `error-codes.js:2594` ต้องเขียน remediation ให้ operator ไปกดยกเลิกในมือ) · เพิ่ม `toSettlementFacts(object)` ที่ `payment-adapter.js` คืน `{gatewayRef, sessionId, paymentIntentId, amountSatang, metadata, paid:boolean}` เพื่อไม่ให้ settlement ต้องรู้จักรูปทรงของ object · **แก้ vocabulary ที่ผิดอยู่แล้ว**: `payment-adapter.js:30` จัด `checkout.session.completed` เป็น SETTLE ซึ่งผิดสำหรับ PromptPay และ `checkout.session.async_payment_succeeded` ไม่อยู่ในลิสต์ใดเลย · mock ต้องมีคู่แฝดครบ (`mock-payment-adapter.js:35-64` วันนี้คืน `pi_mock_*`) | T4 |
| **T6** | webhook + settlement รู้จัก event ชุดใหม่ (ยังไม่มีใครสร้าง session) | C | `routes/api/webhooks/stripe.js:100` และ `checkout-settlement-service.js:538-589` รับ 4 event ใหม่ตาม §4 · เทสด้วย mock adapter + payload ที่บันทึกจาก `stripe trigger` | T5 |

### W2 — เปิดใช้จริง

| ใบ | ชื่อ | tier คาด | ทำอะไร | ขึ้นกับ |
|---|---|---|---|---|
| **T7** | สร้าง session แทน PI | C | `stripe-checkout-service.js:707-730` → เรียก `createHostedCheckoutSession` · เขียน `stripeCheckoutSessionId`, `expiresAt`, `sessionAttempt` · `idempotencyKey: checkout:{order.id}:{attempt}` (D5) · re-entry lookup `:463-465` และ re-binding `:546-549` ต้องอ่าน `status IN ('PENDING_PAYMENT','PROCESSING','EXPIRED')` และ flip `EXPIRED → PENDING_PAYMENT` + `attempt+1` เมื่อสร้างใบใหม่ · response ใหม่ตาม §3 | T6 |
| **T8** | ประตูอ่านสถานะ (ของใหม่ ไม่มีวันนี้) | C | `GET /api/payments/checkout/:checkoutOrderId/status` — วันนี้ **ไม่มี route ไหนเปิดสถานะ order ให้ FE เลย** (มีแต่ `POST /checkout` ที่ `routes/api/finance/payments.js:501`) หน้าเกษตรกรอ่านความจริงจาก invoice ล้วน ๆ | T7 |
| **T9** | job ทั้งสองต้องเห็นโลกใหม่ | C | `settlement-reconcile-job.js`: `SETTLE_EVENT_TYPE` `:75` เป็นชุด · query B `:118-125` กวาดจากคอลัมน์ใหม่ + รวม `PROCESSING` · refinement B JSON path `:136` · `getPaymentIntent` `:142` → `getCheckoutSession` และ `pi.status!=='succeeded'` `:143` → `payment_status !== 'paid'` · `payment-closure-job.js:124-145`: `isInvoicePaidAtGateway` ต้องนับ "กำลังรอยืนยัน" เป็น **ห้ามปิด** ไม่ใช่ปล่อยผ่าน | T7 |
| **T10** | FE redirect + หน้า return | B (ยกเว้นถ้า tier-check ว่า C) | ตาม §3/§6 · ไฟล์ใหม่ `apps/web-app/src/app/health/payments/checkout/return/page.tsx` + `client-view.tsx` **ต้องคัดด่าน flag จาก `checkout/page.tsx:33-36` มาด้วย** · ลิงก์เข้าที่ `payments/client-view.tsx:486` ต้องพก `&milestone=` (วันนี้ไม่มี → backend แทนที่ด้วย `'M1'` เสมอที่ `payments.js:523` → คำขอที่อยู่งวด 2 ชน `CHECKOUT_MILESTONE_NOT_PAYABLE`) | T7, T8 |
| **T11** | คำปฏิเสธ + คำไทย | A | เพิ่มรหัสใหม่ใน `apps/backend/shared/error-codes.js` (`CHECKOUT_SESSION_EXPIRED`, `CHECKOUT_PAYMENT_FAILED_ASYNC`, `CHECKOUT_AWAITING_CONFIRMATION`) + คำไทยใน `CHECKOUT_ERROR_MAP` และเติมเข้า `RAIL_CODES` ของเทส (`checkout-error-copy-covers-the-quotation-gate.test.ts:26-34`) · **แก้ remediation ของ `CHECKOUT_PRICE_DRIFT`** (`error-codes.js:2594`) ที่สั่งให้ operator "cancel its PaymentIntent" — เปลี่ยนเป็น expire session ผ่านเมธอดใหม่ใน T5 | T5 |

### W3 — เปิดปุ่ม

| ใบ | ชื่อ | tier คาด | ทำอะไร | ขึ้นกับ |
|---|---|---|---|---|
| **T12** | probe ที่ทำให้เงื่อนไขเปิดปุ่มเป็นของเครื่อง ไม่ใช่ของความจำ | C (L6: cover ต้อง operator เซ็น) | probe ใหม่ `scripts/probes/checkout-session-rail.sh` + `--selftest` ทั้งเคสแดง/เขียว · ขยาย `settle-webhook-only.sh:5-8` ให้คุมผู้เขียน `PROCESSING`/`EXPIRED` ด้วย ไม่ใช่แค่ `SETTLED` · เพิ่มแถวใน `scripts/probes/probe-registry.txt` (แถวใกล้เคียง: `:45`, `:46`, `:53`, `:54`) | T9, T10 |
| **T13** | เดินจริง + view-pack + เปิดปุ่ม | A (evidence) + ปฏิบัติการ | §6 | T12 |

---

## §3. สัญญา API ใหม่

### 3.1 `POST /api/payments/checkout` (route เดิม `routes/api/finance/payments.js:501`)

**Request** — เพิ่มไม่มี แต่ `milestone` ต้องถูกส่งจริงจาก FE (วันนี้ FE ไม่ส่ง แล้ว backend เดา `'M1'` ที่ `:523`)

```jsonc
{ "applicationId": "<uuid>", "milestone": "M1" | "M2" }
```

**Response 200**

```jsonc
{
  "success": true,
  "data": {
    "checkoutOrderId": "<uuid>",
    "milestone": "M1",
    "status": "PENDING_PAYMENT",            // ค่าจาก CHECKOUT_STATUSES เท่านั้น
    "quotationNumber": "QT-...",             // คงเดิม (F-G4-64)
    "breakdown": {                           // คงเดิมทุก field — FE ห้ามคำนวณเอง
      "dtamPayableAmount": 5000,
      "platformFeeNet": 500,
      "platformFeeVat": 385,
      "platformFeeGross": 885,
      "totalPayableAmount": 5885
    },
    "gateway": {
      "kind": "STRIPE_CHECKOUT",
      "sessionId": "cs_test_...",
      "url": "https://checkout.stripe.com/c/pay/cs_test_...",  // ปลายทางของ redirect
      "expiresAt": "2026-09-11T04:15:00.000Z"                  // = session.expires_at
    }
  }
}
```

**ตัดออก**: `clientSecret` และ `paymentIntentId` (วันนี้อยู่ที่ `stripe-checkout-service.js:741-742`)
- `clientSecret` ไม่มีผู้ใช้จริงเลย (ข้อเท็จจริงฐาน) และ hosted Checkout ไม่ควรส่งออกมาให้ FE
- `paymentIntentId` ตอนสร้าง session อาจยังไม่มีค่า **[ต้องยืนยัน: `session.payment_intent` ถูกเติมตอนไหน]** — ถ้าปล่อยเป็น `null` ในสัญญาเดิม จะได้ field ที่โกหก
- ผลกระทบที่ต้องแก้ในใบเดียวกัน (T10): `apps/web-app/src/lib/services/checkout-service.ts:43-57` (`clientSecret: string` ที่ `:46`), fixtures, และ `checkout-service.test.ts:178-196` ที่ `toEqual` ทั้งก้อน

**Response ปฏิเสธ** — คงรูปเดิมทุกอย่าง (`{success:false, error:<CODE>}`) เพิ่มรหัสใหม่จาก T11

### 3.2 `GET /api/payments/checkout/:checkoutOrderId/status` (ใหม่ — T8)

`authenticateHealth` + ownership ด้วย `healthId` แบบเดียวกับ create (`stripe-checkout-service.js:414-423`) · ไม่ใช่ของตัวเอง = 404 ไม่ใช่ 403

```jsonc
{
  "success": true,
  "data": {
    "checkoutOrderId": "<uuid>",
    "applicationId": "<uuid>",
    "milestone": "M1",
    "status": "PROCESSING",
    "expiresAt": "2026-09-11T04:15:00.000Z",
    "settledAt": null,
    "breakdown": { /* เหมือน 3.1 */ },
    "invoice":  { "invoiceNumber": "INV-CO-1a2b3c4d-M1", "status": "pending", "dueDate": "2026-09-24T..." },
    "receipt":  null,                        // { "receiptNumber": "TAX-PRD-2026-000123", "issuedAt": "..." } เมื่อ SETTLED
    "resume":   { "url": "https://checkout.stripe.com/c/pay/cs_test_...", "expiresAt": "..." },  // null เมื่อ session ตายแล้ว
    "canRetry": false                        // true เมื่อ status ∈ {PENDING_PAYMENT, EXPIRED} และ session ตายแล้ว
  }
}
```

**ห้าม** ใส่ค่าอะไรที่มาจาก env หรือคีย์ลงใน response นี้ (L2) · `resume.url` เป็นค่าที่ Stripe ออกให้ต่อ session ไม่ใช่ความลับของระบบ แต่ต้อง scope ด้วย ownership เสมอ

---

## §4. สถานะที่ต้องเพิ่ม — เก็บที่ไหน ใครเปลี่ยน

### 4.1 ตารางเก็บ

| สิ่งที่ต้องจำ | เก็บที่ | ต้อง migrate? |
|---|---|---|
| "จ่ายแล้ว รอยืนยัน" (PromptPay) | `checkout_orders.status = 'PROCESSING'` | **ใช่** — CHECK ที่ `migration 20260802150000:50-52` + partial unique `:89-91` |
| " session ตายแล้ว กดใหม่ได้" | `checkout_orders.status = 'EXPIRED'` (**ค่านี้มีอยู่แล้วแต่ไม่เคยมีใครเขียนเลย** — grep ยืนยันใน 2 รายงาน) | ไม่ (ค่ามีใน CHECK แล้ว) |
| "หมดอายุเมื่อไร" | `checkout_orders.expiresAt` (`prisma/schema/billing.prisma:1352`, `migration:39`) — **คอลัมน์ว่างมาตลอด ไม่มีใครเขียน** ตรงกับ `session.expires_at` พอดี | ไม่ |
| session id | `checkout_orders.stripe_checkout_session_id` (ใหม่, unique) | **ใช่** (T4) |
| ครั้งที่เท่าไร | `checkout_orders.session_attempt` (ใหม่ INT default 0) | **ใช่** (T4) |
| PI id ที่ session สร้างให้ | `checkout_orders.stripe_payment_intent_id` **คงไว้ตามชื่อเดิมและความหมายเดิม** เขียนเมื่อ webhook พามาให้ครั้งแรก | ไม่ |
| "ช่วงรอยืนยันของ charge" | `payment_transactions.status = 'PROCESSING'` — คำนี้อยู่ในคำอธิบายคอลัมน์แล้ว (`billing.prisma:339`) และ **ไม่มี CHECK constraint ในฐานข้อมูล** (grep migrations: เจอแต่ RLS policy กับ FK) | **ไม่ต้อง** |
| เหตุที่ล้ม | `payment_transactions.errorCode/errorMessage/webhookReceivedAt` (ทางเดิมที่ `checkout-settlement-service.js:556-563`) | ไม่ |

### 4.2 ตารางเดินสถานะใหม่ (`shared/checkout-status.js:41-46`)

```
PENDING_PAYMENT → SETTLED | PROCESSING | EXPIRED | CANCELLED
PROCESSING      → SETTLED | EXPIRED | CANCELLED
EXPIRED         → PENDING_PAYMENT          (re-entry สร้าง session ใบใหม่ attempt+1)
SETTLED         → ()                        terminal
CANCELLED       → ()                        terminal
```

### 4.3 ใครเขียนแต่ละ edge (ห้ามมีผู้เขียนที่ห้าอยู่นอกตารางนี้ — probe T12 บังคับ)

| edge | ผู้เขียนไฟล์เดียว | ทริกเกอร์ |
|---|---|---|
| (ว่าง) → PENDING_PAYMENT | `stripe-checkout-service.js:575-599` | กดปุ่มครั้งแรก |
| EXPIRED → PENDING_PAYMENT | `stripe-checkout-service.js` (re-entry, T7) | กดปุ่มซ้ำหลัง session ตาย |
| PENDING_PAYMENT → PROCESSING | `checkout-settlement-service.js` (T6) | `checkout.session.completed` ที่ `payment_status !== 'paid'` |
| PENDING_PAYMENT / PROCESSING → SETTLED | `checkout-settlement-service.js:311-318` | `checkout.session.async_payment_succeeded` หรือ `completed` ที่ `payment_status === 'paid'` หรือ `payment_intent.succeeded` (ของเก่า) |
| PENDING_PAYMENT / PROCESSING → EXPIRED | `checkout-settlement-service.js` (T6) | `checkout.session.expired` หรือ `checkout.session.async_payment_failed` |
| PENDING_PAYMENT / PROCESSING → CANCELLED | `checkout-settlement-service.js:577-581` | `payment_intent.canceled` (คงไว้ช่วงเปลี่ยนผ่าน) |

> **หมายเหตุที่ห้ามลืม**: ถ้า `PROCESSING` ไม่ถูกใส่ใน predicate ของ partial unique index (`migration:89-91`) แถวที่ย้ายไป PROCESSING จะ **หลุดออกจาก index** และการกดปุ่มอีกครั้งจะพยายาม mint order ใบที่สองของงวดเดียวกัน — คือหนี้ซ้ำแบบเดียวกับที่ operator เจอ กลับมาในรูปที่แย่กว่าเดิม

---

## §5. webhook — รับอะไร ทำอะไร รับของเก่าอีกนานแค่ไหน

### 5.1 ตารางหน้าที่ (หลัง T6)

| event | route ทำอะไร | settlement ทำอะไร |
|---|---|---|
| `checkout.session.completed` **และ** `payment_status === 'paid'` | ACK 200 ก่อน แล้ว settle แบบ async (ทางเดียวกับ `stripe.js:100-110` วันนี้) | settle เต็มเส้น |
| `checkout.session.completed` **และ** `payment_status ∈ {unpaid, processing}` | `handleStripeEvent` inline แล้ว stamp PROCESSED | order → `PROCESSING` · charge → `PROCESSING` · เขียน `stripe_payment_intent_id` ถ้า payload พามา · **ห้ามแตะ invoice ห้ามออกเลขใบเสร็จ ห้ามเดิน workflow** |
| `checkout.session.async_payment_succeeded` | ACK ก่อน แล้ว settle async | settle เต็มเส้น (นี่คือตัวที่แทน `payment_intent.succeeded` เชิงหน้าที่) |
| `checkout.session.async_payment_failed` | inline | order → `EXPIRED` · charge → `FAILED` + errorCode · ไม่แตะ invoice |
| `checkout.session.expired` | inline | order → `EXPIRED` เฉพาะเมื่อยัง `PENDING_PAYMENT`/`PROCESSING` |
| `payment_intent.succeeded` | **คงไว้ทั้งดุ้น** | settle เต็มเส้น (order เก่า และ PI ที่ session สร้างให้) |
| `payment_intent.payment_failed` / `payment_intent.canceled` | คงไว้ (`checkout-settlement-service.js:547`, `:571`) | ตามเดิม |
| อื่น ๆ (เช่น `charge.succeeded`) | `default: {handled:false}` ACK เฉย ๆ (`:586-588`) | ไม่ทำอะไร |

### 5.2 สามอย่างที่ต้องแก้พร้อมกันหรือ event ใหม่จะไร้ผล

1. **`settleEvent` สมมติว่า payload คือ PaymentIntent** — `checkout-settlement-service.js:503` อ่าน `ev.payload.data.object` ตรง ๆ และ `settleFromPaymentIntent` อ่าน `paymentIntent.metadata.checkoutOrderId` (`:231`) กับ `paymentIntent.amount_received` (`:268`) ซึ่ง **session ไม่มีทั้งสอง field** (session ใช้ `amount_total`) ⇒ ต้อง normalize ผ่าน `toSettlementFacts()` ของ T5 ให้ด่านเทียบยอด `:266-276` ยังเป็น **ด่านเดียว** อย่าเพิ่ม branch ที่สอง
2. **metadata ต้องอยู่บน PaymentIntent ไม่ใช่แค่บน Session** — settlement หา order จาก `metadata.checkoutOrderId` เป็นทางแรก (`:231`) ⇒ ตอนสร้าง session ต้องส่ง `payment_intent_data.metadata` ด้วย **[ต้องยืนยัน: session.metadata ไม่ copy ลง PI เอง]** · **ถ้าข้อนี้ผิด ทุก settle จะกลายเป็น `ORDER_NOT_FOUND` ทั้งระบบ** — เป็นข้อที่ต้องยิงจริงดูก่อนเขียนโค้ดตาม (ใบทดสอบ TEST-2 ใน §7)
3. **dedup ชั้นที่ 1 ไม่กันเงินก้อนเดียวที่มาสอง event** — `checkout.session.async_payment_succeeded` กับ `payment_intent.succeeded` เป็น event id คนละใบ (`stripe.js:81-83` ดักได้แค่ id ซ้ำ) ⇒ สิ่งเดียวที่กันคือ `SELECT ... FOR UPDATE` (`:305-308`) กับ fast-path `:247-263` ที่ **ไม่เทียบ id** ⇒ **T3 ต้อง merge ก่อน T7 เสมอ**

### 5.3 ช่วงเปลี่ยนผ่าน — รับของเก่านานแค่ไหน

เงื่อนไขเป็น **แถวในฐานข้อมูล ไม่ใช่วันที่บนปฏิทิน**:

```sql
-- รันเป็น read-only ได้ (L3 ปลอดภัย)
SELECT count(*) FROM checkout_orders
WHERE stripe_checkout_session_id IS NULL
  AND status IN ('PENDING_PAYMENT','PROCESSING');
```

- ผลลัพธ์ > 0 = ยังมี order ที่ผูกกับ PI ดิบ ⇒ **ห้ามลบสาขา `payment_intent.*`**
- ผลลัพธ์ = 0 ติดกัน 7 วัน ⇒ เปิดใบ contract แยก (Tier C) ลบสาขาเก่า + ลบ `SETTLE_EVENT_TYPE` เก่าใน job
- **ทางลัดที่ถูกกฎ**: ระบบยัง pre-production (demo/staging, Stripe test mode) ถ้า operator ยืนยันเป็นลายลักษณ์อักษรว่าแถวเหล่านี้ทิ้งได้ ให้ลบสาขาเก่าในใบ T7 เลย — ต้องเป็นคำสั่ง ไม่ใช่การอนุมานของ agent
- ระหว่างช่วงเปลี่ยนผ่าน `settlement-reconcile-job.js:75` ต้องกวาด **ทั้งสองตระกูล** ไม่งั้น event ชนิดใหม่ที่ค้าง `RECEIVED`/`FAILED` จะไม่มีใครกวาดตลอดกาล

---

## §6. การ mint invoice — ย้ายไหม ย้ายแล้วพังอะไร

### คำตอบ: **ไม่ย้ายในรอบนี้** (D4)

**สิ่งที่ตรวจแล้วว่าจะพังถ้าย้ายไป settle** (ทุกข้อมาจากผลตรวจ ไม่ใช่การเดา):

| # | พังตรงไหน | หลักฐาน |
|---|---|---|
| 1 | journal ต้องมี `invoiceId` | `services/journal-entry-service.js:600-602` โยน `VALIDATION_ERROR` ถ้าไม่มี, FK เขียนที่ `:511` ⇒ invoice ยังต้องเกิดใน tx เดียวกัน **ก่อน** `recordPaymentEntry` แค่ย้ายตำแหน่ง ไม่ได้หายไป |
| 2 | `meta.invoiceNumber` อ่านจาก include เดิม | `checkout-settlement-service.js:397` + `include` ที่ `:237` จะได้ null |
| 3 | `dueDate` เป็น NOT NULL แต่ไม่มีความหมาย | `billing.prisma:58`; ค่าวันนี้มาจาก `computeDueDate(new Date(), milestone)` (`stripe-checkout-service.js:617`) — invoice ที่เกิดตอน settle ไม่มี "หน้าต่างครบกำหนด" ให้คำนวณ |
| 4 | ระบบ 5 ตัวที่ยึด "invoice pending" หายพร้อมกัน | เตือนชำระเงิน `jobs/payment-reminder-job.js:117-121` · ปิดคำขอที่ทิ้งค้าง `jobs/payment-closure-job.js:180-193` · AR aging `services/ar-aging-service.js:178-184` · ยอดค้าง `services/invoice-service.js:252-266` · หน้าพรีวิวเกษตรกร `routes/api/preview/preview-financial-utils.js:501-525` |
| 5 | คำปฏิเสธหายไปครึ่งหนึ่ง | `P2002 → CHECKOUT_ALREADY_IN_PROGRESS` (`stripe-checkout-service.js:695-701`) วันนี้ครอบ 2 index; ไม่มี invoice ตอน mint เหลือ index เดียว |

**แล้วอาการที่ operator เจอ ("กดปุ่มแล้วเกิดหนี้ทันที ทำให้ปุ่มขึ้นซ้ำ") ถูกแก้ด้วยอะไร**

ผลตรวจบอกว่ามันไม่ใช่ปัญหา "invoice ซ้ำ" — invoice ไม่เคยซ้ำ เพราะ re-entry lookup (`:463-465`) คืน order ใบเดิม อาการจริงคือ **วนอยู่ในลูปที่กดแล้วไม่ไปไหน**: หนี้ทำให้ `entryOwes` จริง (`checkout-entry-owes.ts:42`) → ปุ่มขึ้น → กด → ได้ PI ใบเดิมที่ตายแล้ว (`idempotencyKey` คงที่ `:722`) → จบที่จอ "รอชำระเงิน" ที่มีปุ่มเดียวคือกลับหน้ารายการ

ลูปนี้ถูกตัดด้วย **T7 (attempt-keyed idempotency + edge `EXPIRED → PENDING_PAYMENT`) + T10 (redirect ออกไปจ่ายได้จริง)** ไม่ใช่ด้วยการเลื่อน invoice

**ถ้า operator ยังต้องการเลื่อนจริง ๆ**: เปิดเป็นใบ Tier C แยกต่างหาก **หลัง T13** ชื่อ "invoice ตามหลังการจ่าย" และต้องมาพร้อมของทดแทน 5 อย่างในข้อ 4 ข้างบน (โดยเฉพาะเตือนชำระเงินและปิดคำขอที่ทิ้งค้าง ซึ่งต้องเปลี่ยนไปยึด `checkout_orders.status + expiresAt` แทน) — โครง DB รองรับแล้ว (`checkout_orders.invoiceId` nullable+unique, `migration:41`, `:81-82`; settle ก็ update แบบมีเงื่อนไข `if (order.invoiceId)` อยู่แล้วที่ `:344`)

---

## §7. การเปิดปุ่มกลับ — เงื่อนไขที่แท้จริง และพิสูจน์อย่างไร

### 7.1 กลไก (ข้อเท็จจริง ไม่ใช่ข้อเสนอ)

ปุ่มถูกคุมด้วย **สามตัวแปร ไม่ใช่ตัวเดียว** และคนละชั้นกัน:

| ตัวแปร | อยู่ที่ไหน | ปิดอะไร | เปิดอย่างไร |
|---|---|---|---|
| `NEXT_PUBLIC_CHECKOUT_UI_ENABLED` | `apps/web-app/src/lib/config/checkout-mode.ts:42-44` (`=== 'true'` เป๊ะ) | route 404 (`checkout/page.tsx:33-36`) + บล็อกปุ่ม (`payments/client-view.tsx:473`) | **build image ใหม่** — `apps/web-app/Dockerfile:50-51` เขียนไว้เองว่าตั้งบน container ที่รันอยู่ไม่มีผล · ARG default = `true` (`:70-71`) ⇒ "เปิดกลับ" = เลิกส่ง `--build-arg ...=false` |
| `STRIPE_CHECKOUT_ENABLED` | `apps/backend/config/stripe.js:37-39` | `POST /api/payments/checkout` ตอบ 503 (`payments.js:502-509`) | env ของ backend container + restart |
| `PAYMENT_ADAPTER` | `config/stripe.js:70-72` | `stripe` \| `mock` (unknown = fail closed `payment-adapter.js:62-65`) | env |

**ประตูจริงคือตัวที่สอง** ตราบใดที่ `STRIPE_CHECKOUT_ENABLED=true` การซ่อนปุ่มไม่ได้ปิดอะไร — bundle เก่าใน browser cache หรือ curl ยัง mint ได้

### 7.2 เงื่อนไขเปิด — ให้เครื่องตัดสิน ไม่ใช่ให้คนจำ

เปิดได้เมื่อ **ทุกข้อ** เป็นจริง และทุกข้อวัดได้:

| # | เงื่อนไข | เครื่องที่ตัดสิน |
|---|---|---|
| G1 | T3, T4, T5, T6, T7, T8, T9, T10, T11 merge บน main แล้ว | `git log` |
| G2 | probe `checkout-session-rail` เขียว | `bash scripts/probes/checkout-session-rail.sh` (สร้างใน T12) — ต้องตรวจอย่างน้อย: adapter เรียก `checkout.sessions.create` ไม่ใช่ `paymentIntents.create` · webhook route รู้จัก 4 event ใหม่ · settlement เทียบ gateway ref กับแถว order · `PROCESSING` อยู่ทั้งใน vocabulary และใน predicate ของ partial unique index · route `/checkout/return` มีด่าน flag |
| G3 | probe `settle-webhook-only` (ขยายแล้ว) + `webhook-idempotent` + `money-equation` + `quotation-closure` เขียว | `probe-registry.txt:45,46,53,54` — สองตัวหลังต้อง DB จริง = operator รัน |
| G4 | **การจ่ายจริง 1 ครั้งใน test mode เดินครบเส้น** | view-pack ตาม `gacp-view-in-the-loop`: กดปุ่ม → ไปหน้า Stripe → จ่าย PromptPay test → กลับมาที่จอ "รอยืนยัน" → webhook `async_payment_succeeded` → เลขใบเสร็จ `TAX-PRD-...` ขึ้นบนจอ |
| G5 | หลัง G4: query ยืนยัน 1 order = 1 journal entry = 1 เลขใบเสร็จ | อ่านอย่างเดียว บน DB ของ demo |
| G6 | operator merge ใบ Tier C ทุกใบ (L6 — agent เซ็นเองไม่ได้) | — |

**ข้อสำคัญ**: G2 ทำให้ "เปิดปุ่ม" ไม่ใช่การที่มีคนจำได้ว่าต้องไปกด — ถ้าใครเปิด flag ก่อนงานเสร็จ probe จะแดงบน gate และ merge ไม่ผ่าน · แต่ต้องพูดตรง ๆ ว่า **การ flip env เองยังเป็นการกระทำของมนุษย์อยู่ดี** (build-arg + env ของ container) probe คุมได้แค่ว่าโค้ดพร้อมหรือยัง ไม่ได้คุมมือที่ไปตั้งค่า

### 7.3 ระหว่างที่ยังปิด ต้องทำสองอย่างนี้ ไม่งั้นได้จอเปล่า

- T1 — กล่องเตือนต้องขึ้นกับคนที่เป็นหนี้จริง (`payments/client-view.tsx:457`)
- T2 — ปิด flag ต้องไม่ทำให้ใบแจ้งหนี้เกิดตั้งแต่ตอนกดยื่น (`submit-and-hand-over.ts:83`)

---

## §8. แผนทดสอบ

### 8.1 สภาพเครื่องนี้ (รันจริงในเซสชันนี้)

```
stripe CLI : FOUND  (stripe version 1.21.8)
docker     : FOUND
stripe SDK : apps/backend/node_modules/stripe  present
STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET / STRIPE_PUBLISHABLE_KEY / STRIPE_CHECKOUT_ENABLED / PAYMENT_ADAPTER
           : unset ใน shell นี้ (ตรวจแบบไม่พิมพ์ค่า)
```

⇒ ต้องได้ **test-mode key จาก operator** ก่อนเริ่ม TEST-2 ขึ้นไป: `BLOCKED(operator:stripe-test-keys)` · ห้าม echo ค่าใด ๆ ลง log/report (L2)

### 8.2 ทำได้บนเครื่องนี้

| id | ทดสอบอะไร | วิธี | ผูกกับใบ |
|---|---|---|---|
| TEST-1 | state machine + dedup + เทียบยอด + invoice/receipt/journal ครบเส้น โดยไม่แตะเน็ต | `PAYMENT_ADAPTER=mock` + jest · ต้องมี RED ก่อนทุกใบที่เปลี่ยน behavior (DoD ชั้น B/C) · memory: full suite ต้อง `NODE_OPTIONS=--max-old-space-size=3072` | T3-T9 |
| TEST-2 | **metadata copy ลง PaymentIntent จริงไหม** (ข้อที่พังทั้งระบบถ้าผิด) | สร้าง session จริงใน test mode ผ่านประตูของเราเอง แล้ว `stripe listen --forward-to localhost:<port>/api/webhooks/stripe` · อ่าน payload ของ `checkout.session.completed` และของ `payment_intent.*` ว่ามี `metadata.checkoutOrderId` หรือไม่ | **ต้องผ่านก่อน T7** |
| TEST-3 | webhook route + settlement รับ event ชุดใหม่ได้จริง (ลายเซ็นจริง) | `stripe listen` + `stripe trigger checkout.session.completed` / `...async_payment_succeeded` / `...expired` · **ข้อควรระวัง**: fixture ของ `stripe trigger` ไม่มี metadata ของเรา ⇒ จะได้ `ORDER_NOT_FOUND` ซึ่งเป็นผลที่ *ถูก* สำหรับการทดสอบลายเซ็น/dedup แต่ **ไม่ใช่** การทดสอบ settle | T6 |
| TEST-4 | เดินประตูจริงทั้งเส้นบน Postgres จริง | ตาม memory "walking the real doors": scratch Postgres + backend จาก tree + HTTP จริง · กดปุ่มจริง → ตามไปหน้า Stripe test → จ่าย → ดูใบเสร็จ | G4 |
| TEST-5 | expiry | ตั้ง `expires_at` สั้นที่สุดที่ Stripe ยอม **[ต้องยืนยันค่าต่ำสุด]** แล้วรอ event จริง · สำรอง: `stripe trigger checkout.session.expired` (ทดสอบ handler ได้ ไม่ได้ทดสอบว่า Stripe ยิงจริง) | T6, T9 |
| TEST-6 | สมการเงินบนแถวจริง | `scripts/probes/money-equation.sh` + `quotation-closure.sh` — ต้อง `DATABASE_URL` จริง ⇒ operator รัน (`probe-registry.txt:53,54`) | G3 |

### 8.3 ทดสอบไม่ได้ — ต้องเขียน PENDING ตรง ๆ

| เรื่อง | ทำไม |
|---|---|
| เงิน PromptPay เข้าบัญชีจริง | test mode จำลองเท่านั้น · L3 ห้าม agent แตะเงินจริง และ live key ถูก hard-gate ด้วย G1 (GOALS.md) |
| การหมดอายุ 24 ชม. ของจริงในเวลาจริง | รอ 24 ชม. ในเซสชันไม่ได้ · ข้ออ้าง "default 24 ชม. สูงสุด 24 ชม." เป็นข้อเท็จจริงฐานที่ผู้สั่งงานให้มา **ยังไม่ได้ยืนยันจากเอกสาร Stripe ในเซสชันนี้** |
| ลำดับ event ของ async payment ในโลกจริง (สลับลำดับ / มาซ้อน / มาย้อน) | จำลองได้บางส่วนด้วย `stripe trigger` แต่ลำดับจริงของ PromptPay ต้องเห็นของจริง |
| พฤติกรรมบน production ministry machines | ยังไม่มีเครื่อง (memory: residency rule lifted until ministry prod) |
| ว่าการปิด/เปิด flag บน image ที่ deploy แล้วเปลี่ยนอะไรบ้าง | ต้อง build + deploy + วัดในเบราว์เซอร์ (memory: measure after deploy, not after edit — เผื่อ 4-5 รอบ) |

---

## §9. สิ่งที่แผนนี้ไม่แก้ (พูดตรง ๆ)

1. **ไม่ทำ embedded checkout** — hosted อย่างเดียวตามที่ operator อนุมัติ · การย้ายมาฝังทีหลังจะกลับมาต้องการ `clientSecret` ที่ §3 ตัดออก ให้ถือเป็นงานคนละรอบ
2. **ไม่แก้ `writeApplicationStatus` ที่ปลุกคำขอ EXPIRED ให้ฟื้น** — `application-status-writer.js:701` default `assertTransition = false` และรั้ว EXPIRED ที่ `:727-729` ยกเว้น `actorRole === 'system'` ซึ่ง settle ใช้ (`checkout-settlement-service.js:422-423`) ⇒ settle ยกคำขอที่ EXPIRED กลับมาเป็น `DOC_FEE_PAID` ได้จริง · **นี่คือช่องที่ควรเปิดใบแยก** ไม่ควรผสมเข้ากับการย้าย gateway เพราะ RED-first ของสองเรื่องนี้คนละชุด
3. **ไม่สร้างกลไก reopen คำขอที่ถูกปิดผิด** — `payment-closure-job.js:35-36` บอกเองว่ายังไม่มีของ · แผนนี้แค่ทำให้ closure job ไม่ปิดคนที่กำลังรอยืนยัน (T9)
4. **ไม่แก้ `taxableAmount` ที่ไม่เคยถูกเซ็ตบนบรรทัด journal** — `journal-entry-service.js:274-379` ไม่เซ็ต ทั้งที่ `persistEntry:533-536` เตรียมคอลัมน์ไว้ให้ ภ.พ.30 · หนี้เดิม ไม่ใช่ของใหม่
5. **ไม่แตะ refund / credit note / debit note / WHT** — สี่ไฟล์นั้นอ่าน `invoice.status !== 'paid'` ตรง ๆ (`credit-note-service.js:191`, `debit-note-service.js:160`, `refund-service.js:296`, `wht-service.js:396`) แผนนี้จึงคง `invoice.status = 'paid'` ไว้เหมือนเดิมโดยเจตนา
6. **ไม่เพิ่มสถานะใหม่ใน workflow ของคำขอ** — ไม่มีสถานะระหว่าง `PENDING_DOC_FEE` กับ `DOC_FEE_PAID` (`shared/status-machine-contract.js:38-40`) และ contract บังคับ totality ตอน boot (`:58-73`) · "รอยืนยันการชำระเงิน" แสดงจาก `checkout_orders.status` ผ่าน endpoint ใหม่ (T8) ไม่ใช่จาก workflow
7. **ไม่แตะ remittance ให้กรมฯ** — `dtam-remittance-service.js` แตะแค่ `dtamRemittanceStatus` ไม่ยุ่งกับ `status` (`:277-280`, `:385-388`, `:442-445`, `:491-494`)
8. **ไม่รับประกันว่า deploy ครั้งเดียวจบ** — staging มี Supabase project ของตัวเอง ส่วน prod+demo ใช้ตัวเดียวกัน (memory: staging DB is not Supabase and is 14 behind) ⇒ **T4 หนึ่ง migration = สอง deployment** และ main อาจนำหน้า DB อยู่ก่อนแล้ว (memory: main is ahead of the database) ต้อง `migrate deploy` ก่อน image ทุกครั้ง
9. **ไม่แตะ card path** — `paymentMethodTypes: ['promptpay']` (`stripe-checkout-service.js:713`) มีคำสั่งห้ามเติม card โดยไม่มีคำสั่ง operator เขียนคาไว้ที่ `:710-712`
10. **ไม่ลบสาขา `payment_intent.*`** ในรอบนี้ — เป็นใบ contract แยกตาม §5.3

---

## ที่มาของข้อมูลในเอกสารนี้ (L1)

- **อ่านเองในเซสชันนี้** (ยืนยัน file:line ตรง): `stripe-checkout-service.js:700-755`, `checkout-settlement-service.js:225-300`, `stripe-adapter.js:28-90`, `payment-adapter.js:1-80`, `mock-payment-adapter.js:25-70`, `shared/checkout-status.js:1-85`, `routes/api/webhooks/stripe.js:55-139`, `migration 20260802150000:30-95`, `billing.prisma:315-345, 1345-1360`, `config/stripe.js:15-81`, `routes/api/finance/payments.js:495-545`, `settlement-reconcile-job.js:70-150`, `payment-closure-job.js:118-146`, `application-status-writer.js:690-735`, `fee-service.js:236-246`, `.claude/skills/gacp-payment-invariants/SKILL.md:20-45`, `error-codes.js:2565-2594`, `checkout-mode.ts`, `checkout/page.tsx`, `submit-and-hand-over.ts:60-105`, `payments/client-view.tsx:440-500`, `checkout-entry-owes.ts:20-50`, `checkout-service.ts:35-110`, `checkout-error-copy-covers-the-quotation-gate.test.ts:20-50`, `probe-registry.txt:45,46,53,54`
- **รันจริง**: `stripe version` → 1.21.8 · ตรวจการมีอยู่ของ docker / stripe SDK / ตัวแปร env แบบไม่พิมพ์ค่า
- **มาจากผลตรวจสี่ด้านที่ผู้สั่งงานแนบมา** (ยังไม่ได้เปิดซ้ำในเซสชันนี้): `journal-entry-service.js`, `receipt-numbering-service.js`, `quotation-gate.js`, `quotation-service.js`, `invoice-service.js`, `ar-aging-service.js`, `payment-reminder-job.js`, `preview-financial-utils.js`, ไฟล์เทสฝั่ง FE ทั้งหมด, และรายละเอียดของ `dtam-remittance-service.js`
- **ยังไม่พิสูจน์ที่ไหนเลย** — ทุกจุดที่ติดป้าย **[ต้องยืนยัน]**: อายุ default/สูงสุดของ Checkout Session, การ copy metadata จาก session ลง PaymentIntent, จังหวะที่ `session.payment_intent` ถูกเติม, ค่า `expires_at` ต่ำสุดที่ Stripe ยอม · ทั้งสี่ข้อนี้ต้องผ่าน TEST-2/TEST-5 ก่อน merge T7
- **ยังไม่ได้รัน probe หรือ test ใด ๆ กับโค้ดในเซสชันนี้** ⇒ สถานะของงานนี้คือ `PENDING` (แผน ไม่ใช่ผลรัน)