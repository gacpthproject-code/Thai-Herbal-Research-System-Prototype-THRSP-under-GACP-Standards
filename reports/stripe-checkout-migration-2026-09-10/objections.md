

# ข้อคัดค้าน: ความถูกต้องของเงิน

# หักล้างแผนย้าย Stripe Checkout Sessions — มุมความถูกต้องของเงิน

ทุกข้อมาจากการเปิดอ่านไฟล์จริงในเซสชันนี้ (read-only ไม่แก้ไฟล์ ไม่รัน test ไม่แตะ DB/Stripe ไม่พิมพ์ค่า env) · ไม่ได้รัน probe ใด ⇒ สถานะรายงานนี้ `PENDING`

---

## M1 — `CANCELLED` เป็นทางตัน + invoice ค้างเป็น "หนี้ผี" ⇒ เกษตรกรรายนั้นจ่ายไม่ได้อีกตลอดกาล (ร้ายแรงสุด)

แผน T4 ตั้ง predicate ใหม่เป็น `status IN ('PENDING_PAYMENT','PROCESSING','EXPIRED')` — **ตกหล่น `CANCELLED`** ทั้งที่ D3 เขียนเองว่า "หนึ่ง order + หนึ่ง invoice ต่อ (application, milestone) ตลอดชีวิต **จนกว่าจะ SETTLED หรือ CANCELLED**" คือแผนยอมรับเองว่าหลัง CANCELLED จะมี order ใบใหม่ แต่ฝั่ง invoice ทำไม่ได้

หลักฐาน:
- `apps/backend/shared/checkout-status.js:39`, `:45` — `CANCELLED → (nothing) a new attempt is a NEW order` (terminal ไม่มี edge กลับ)
- `apps/backend/prisma/migrations/20260701010000_uniq_invoice_app_servicetype/migration.sql` — `uniq_invoice_app_service_active ON "invoices"("applicationId","serviceType") WHERE "isDeleted" = false AND "applicationId" IS NOT NULL` — **ไม่มีเงื่อนไข status เลย** invoice `pending` ที่ค้างจึงกินช่องตลอดไป
- ไม่มีโค้ดไหนใน checkout path soft-delete invoice: `grep -rn "isDeleted: true" apps/backend/{services,routes,jobs}` เจอเฉพาะ wht / pdpa / quotation / planting / provider-user / repositories — ไม่มี checkout, ไม่มี settlement
- `apps/backend/services/checkout/checkout-settlement-service.js:571-583` เขียน `CANCELLED` เมื่อได้ `payment_intent.canceled` และแถวยัง `PENDING_PAYMENT`
- `apps/backend/services/checkout/stripe-checkout-service.js:697` — P2002 ใด ๆ ในบล็อก mint ถูกแปลเป็น `CHECKOUT_ALREADY_IN_PROGRESS` ("มีรายการชำระเงินของงวดนี้กำลังดำเนินการอยู่แล้ว") ซึ่งเป็น **คำโกหก** เพราะไม่มีอะไรกำลังดำเนินการ

สถานการณ์ (หลังแผนนี้ deploy):
1. เกษตรกรกดจ่าย → order `PENDING_PAYMENT` + invoice `pending` (`stripe-checkout-service.js:603-621`)
2. ไม่จ่าย ปล่อย session ตายที่ 24 ชม. → Stripe ยกเลิก PaymentIntent ที่ผูกกับ session นั้น → `payment_intent.canceled` มาถึง (แผน §4.3 บอกเองว่า **คงสาขานี้ไว้**)
3. `:571-583` เขียน order → `CANCELLED`
4. `checkout.session.expired` มาทีหลัง อยากเขียน `EXPIRED` แต่แถวเป็น terminal แล้ว (§4.2 ไม่มี `CANCELLED → EXPIRED`)
5. เกษตรกรกดปุ่มใหม่ → re-entry lookup (`:464`, แผน T7 แก้เป็น 3 สถานะ) **ไม่เห็น CANCELLED** → เข้าทาง mint
6. order ใบใหม่ผ่าน (ไม่ติด partial unique เพราะใบเก่า CANCELLED) แต่ `tx.invoice.create` (`:603`) ชน `uniq_invoice_app_service_active` → P2002 → `:697` → 409 "กำลังดำเนินการอยู่แล้ว"
7. **ตายวนตรงนี้ถาวร** invoice ผีตัวเดิมยังโดน reminder job ทวง (`payment-reminder-job.js:117-121`) และ closure job ปิดคำขอเป็น `PAYMENT_ABANDONED` ซึ่ง final (`payment-closure-job.js:35-36`) — รายได้ก้อนนั้นหายถาวร

ข้อที่ทำให้เรื่องนี้ **แย่กว่าวันนี้จริง**: วันนี้ไม่มีโค้ดบรรทัดไหนยกเลิก PaymentIntent เลย (`grep "paymentIntents.cancel\|sessions.expire" apps/backend/{services,jobs}` = 0 hit) และ `error-codes.js` remediation ของ `CHECKOUT_PRICE_DRIFT` สั่ง operator ไปกดยกเลิกในมือเพื่อให้ได้ `payment_intent.canceled` — คือ `CANCELLED` วันนี้เป็นสถานะที่แทบไม่มีใครไปถึง แต่ hosted Checkout ทำให้มันเป็นเหตุการณ์ประจำวัน **และ remediation ที่เขียนไว้เองนั้นก็พังด้วยเหตุผลเดียวกัน** (ยกเลิกแล้วออกใบเสนอราคาใหม่ ก็ยังชน invoice เดิมอยู่ดี)

ทางแก้ที่เล็กที่สุด (เลือกหนึ่ง ใส่ใน T4 พร้อม RED-first):
- **(ก)** ใส่ `CANCELLED` ใน predicate ของ partial unique ด้วย + เพิ่ม edge `CANCELLED → PENDING_PAYMENT` — คือทำให้ "หนึ่ง order ต่องวด ตลอดชีวิต" เป็นจริงตามที่ D3 พูด แล้วลบประโยค "จนกว่าจะ CANCELLED" ทิ้ง หรือ
- **(ข)** ผู้เขียน `CANCELLED` ต้อง soft-delete invoice ในทรานแซกชันเดียวกัน (`isDeleted=true` + `deleteReason`) — แต่ข้อนี้แพงกว่าเพราะกระทบ AR/journal provenance

---

## M2 — เงินเข้าแล้ว แต่ settle ไม่ได้ และ **ไม่มีใครกลับมาดูอีกเลย** (ORDER_NOT_FOUND เป็น terminal + เงียบ)

แผนวางทั้งระบบไว้บนข้อ **[ต้องยืนยัน]** ข้อเดียว (metadata copy ลง PaymentIntent, §5.2 ข้อ 2) แต่ไม่ได้เพิ่ม **fallback** ให้เลย ทั้งที่ fallback ที่มีอยู่จะพังแน่นอนกับ id ตระกูลใหม่:

- `checkout-settlement-service.js:236` — `where: orderId ? {id: orderId} : { stripePaymentIntentId: paymentIntent.id }` · ถ้า object เป็น session และ metadata หาย ค่าที่ยิงเข้าไปคือ `cs_...` ค้นในคอลัมน์ PI → ไม่เจอ
- `:240-244` → `ORDER_NOT_FOUND` และ side effect เดียวคือ `logger.error` — **ไม่มี AuditLog ไม่มี notification ถึง admin** (ต่างจาก price-drift ที่มีทั้งคู่ที่ `stripe-checkout-service.js:251-292`)
- `:506-509` — `const terminal = result.settled === false && result.reason;` แล้ว stamp `status: 'PROCESSED'` ⇒ event ที่เงินเข้าแล้วถูกปิดคดีทันที
- `settlement-reconcile-job.js:132-140` refinement B ข้าม candidate ที่มี event `PROCESSED` ⇒ backstop จะไม่แตะมันอีกตลอดกาล

⇒ ผลรวม: เงินอยู่ที่ Stripe · order ยัง `PENDING_PAYMENT`/`PROCESSING` · ไม่มีใบเสร็จ · ไม่มี journal · closure job ปิดคำขอทิ้งในอีก 3 รอบทวง · และไม่มีใครรู้จนกว่าจะกระทบยอดด้วยมือ

ทางแก้ที่เล็กที่สุด: ใน T6 (1) fallback lookup ต้องเป็น `OR` ของสองคอลัมน์ `{ stripeCheckoutSessionId: ref }` (2) `ORDER_NOT_FOUND` ที่เกิดกับ ref ตระกูล `cs_`/`pi_` ที่ **มีเงินจริง** (`payment_status==='paid'` / `amount_received>0`) ต้องไม่ terminal — ให้ throw เพื่อเข้า retry/DEAD_LETTER ซึ่งมี log operator (`:522`) และต้องยิง admin notification แบบเดียวกับ price-drift

---

## M3 — จ่ายซ้ำสองครั้งต่อ order เดียว ไม่มีชั้นไหนจับได้ และแผนตัด refund ออกจาก scope

แผนสร้างเงื่อนไขให้ **หนึ่ง order มีได้หลาย session** (D5 attempt-keyed key + edge `EXPIRED → PENDING_PAYMENT`) แต่ไม่มีข้อไหนพูดถึงการเก็บเงินสำเร็จซ้อน

สถานการณ์:
1. attempt 1: PromptPay QR ออกไปแล้ว
2. `checkout.session.expired` (หรือ `async_payment_failed`) → order `EXPIRED` (§4.3)
3. เกษตรกรกดใหม่ → attempt 2 → จ่ายสำเร็จ → order `SETTLED` + `TAX-PRD-...` + journal
4. เงินของ attempt 1 ตามมาทีหลัง (async ล่าช้า / redelivery / reconcile) → `:247` fast-path `alreadySettled` (หรือถ้าใส่ D6 แล้ว = refuse) → `:506-509` stamp PROCESSED

ผลลัพธ์: เก็บเงินสองก้อน ออกใบเสร็จใบเดียว บันทึกบัญชีก้อนเดียว หนี้ที่ต้องคืนไม่มีใครรู้ · `payment_transactions.gatewayRef @unique` (`billing.prisma:323`) เก็บได้เพียง ref แรก (`:363`) จึงไม่ได้ทำหน้าที่เป็นตัวจับ · แผน §9.5 ประกาศชัดว่า "ไม่แตะ refund"

ทางแก้ที่เล็กที่สุด (ไม่ต้องสร้าง refund flow): ใน T3/T6 — เมื่อ settle-class event มาถึง order ที่ `SETTLED` แล้ว **และ ref ไม่ตรงกับสิ่งที่แถวจำไว้** ให้เขียน AuditLog CRITICAL + admin notification URGENT (ใช้ท่อเดียวกับ `stripe-checkout-service.js:251-292`) แล้วคืน terminal — เปลี่ยน "เงียบ" เป็น "คิวให้คนตัดสิน" เท่านั้น ก็พอสำหรับรอบนี้

---

## M4 — ช่วงระหว่าง deploy T7 กับ T9: closure job ปิดคำขอของคนที่กำลังจ่ายอยู่ และปิดแบบ **final**

กราฟลำดับของแผนเองอนุญาตให้ T7 (สร้าง session จริง) merge/deploy ก่อน T9 (job เห็นโลกใหม่)

- `payment-closure-job.js:125-133` — `select: { stripePaymentIntentId: true }` แล้ว `if (!order || !order.stripePaymentIntentId) return false;` = "ไม่มีอะไรให้ gateway เก็บ" ⇒ **ปิดต่อไปได้**
- หลัง T7 order ใบใหม่จะมีแต่ `stripeCheckoutSessionId` ส่วน `stripePaymentIntentId` เป็น null (แผน §4.1 บอกเองว่าเขียน "เมื่อ webhook พามาให้ครั้งแรก")
- `payment-closure-job.js:35-36` — "the reopen mechanism (R2 mechanism 2) is unbuilt, so a PAYMENT_ABANDONED close is final"
- ประตูสำรองก็ตาบอดพร้อมกัน: `settlement-reconcile-job.js:118-125` กรอง `stripePaymentIntentId: { not: null }`

⇒ หน้าต่างนี้ = คำขอที่จ่ายค้างอยู่ถูกปิดถาวร เงินที่จ่ายเข้ามาทีหลังจะไป settle ทับคำขอที่ EXPIRED (ซึ่งแผน §9.2 บอกเองว่าไม่แก้ — `application-status-writer.js:701` default `assertTransition=false` และรั้ว EXPIRED ยกเว้น actor `system` ที่ settle ใช้ที่ `checkout-settlement-service.js:422-423`) คือได้ผลลัพธ์แบบสุ่มว่าคำขอจะฟื้นหรือไม่ฟื้น

ทางแก้ที่เล็กที่สุด: กลับลำดับ — **T9 ต้อง merge และ deploy ก่อน T7** (T9 ต้องการแค่คอลัมน์จาก T4 ไม่ได้ต้องการให้มี session จริง) หรือยุบ T7+T9 เป็นใบเดียว · ระหว่างนั้น `isInvoicePaidAtGateway` ต้อง fail-safe เป็น `true` เมื่อ order มี `stripeCheckoutSessionId` แต่ยังอ่านไม่ได้

---

## M5 — D6 ตามที่เขียนไว้ จะยิง CRITICAL เท็จ + ปฏิเสธ duplicate ที่ควรเป็น no-op **ทุกใบ** ในเส้น hosted

D6 สั่งเทียบ `paymentIntent.id` กับ `order.stripePaymentIntentId` (และ `stripeCheckoutSessionId`) — แต่แผนไม่ได้ตั้งผู้เขียน `stripe_payment_intent_id` ในเส้น hosted ที่จ่ายสำเร็จทันที:

- §4.3 ระบุผู้เขียน PI id ไว้เฉพาะ handler `PENDING_PAYMENT → PROCESSING` ("เขียน stripe_payment_intent_id ถ้า payload พามา")
- เส้นที่ `payment_status === 'paid'` ตั้งแต่ `checkout.session.completed` **ไม่ผ่าน PROCESSING เลย** (§5.1 แถวแรก)
- settle เขียน PI id ลง **แถว charge** ไม่ใช่แถว order: `checkout-settlement-service.js:363` `gatewayRef: paymentIntent.id`

⇒ `order.stripePaymentIntentId` ยัง null · พอ `payment_intent.succeeded` ของ session เดียวกันตามมา (แผน §5.1 บอกว่า "คงไว้ทั้งดุ้น") D6 เจอ "ไม่ตรง" → AuditLog CRITICAL + refuse ทุกรายการ · ผลข้างเคียงที่แพงกว่าคือ **การ heal quotation หายไป**: `:247-263` เป็นทางเดียวที่ซ่อม order ที่ settle แล้วแต่ใบเสนอราคายังไม่ถูก stamp (`closeQuotationForSettledOrder`) — ถ้า refuse แทน heal probe `quotation-closure.sh` จะแดงจากการทำงานปกติ

ทางแก้ที่เล็กที่สุด: settle เขียน **ทั้งสอง ref ลงแถว order ในทรานแซกชันเดียวกัน** (เพิ่ม `stripePaymentIntentId` ใน update ที่ `:311-318`) และ D6 refuse เฉพาะเมื่อ ref ที่ได้มา **ไม่ตรงกับคอลัมน์ใดเลย และคอลัมน์นั้นไม่ null** · null = ยังไม่เคยผูก ⇒ ผูกให้ ไม่ใช่ปฏิเสธ

---

## M6 — PERIOD_CLOSED × การจ่ายแบบ async = เงินเข้า Stripe แต่บัญชีไม่ลง แล้วจบที่ DEAD_LETTER

- `journal-entry-service.js:661-667` — period-close guard โยน `PERIOD_CLOSED` **ก่อน** persist และอยู่ใน settle tx (`checkout-settlement-service.js:372-401` ส่ง `tx`) ⇒ rollback ทั้งก้อน
- `:513-523` — throw ⇒ `attempts+1` ⇒ ครบ `MAX_ATTEMPTS` เป็น `DEAD_LETTER` ⇒ `:500-502` terminal ไม่ re-drive

วันนี้ช่องว่างระหว่าง "สร้าง PI" กับ "succeeded" คือนาที · แผนนี้ทำให้เป็น **สูงสุด 24 ชม. + ช่วง PROCESSING ของ PromptPay** ⇒ การจ่ายที่เริ่มวันสุดท้ายของงวดแล้วยืนยันหลังปิดงวด กลายเป็นเหตุการณ์ที่เกิดได้จริงทุกเดือน และผลลัพธ์คือเงินเข้าแล้วไม่มีใบเสร็จ ไม่มี journal

ทางแก้ที่เล็กที่สุด: ตัดสินใน T6 ว่า `entryDate` ของ settle คือ **instant ที่ Stripe capture** (จาก payload) ไม่ใช่ instant ที่เรา settle — และถ้ายังชนงวดปิด ต้องเป็น refusal ที่มีคิวให้ operator ไม่ใช่ DEAD_LETTER เงียบ

---

## M7 — ด่านเทียบยอดกลายเป็น "เทียบเลขของเรากับเลขของเราเอง"

- วันนี้: `checkout-settlement-service.js:266-276` เทียบ `paymentIntent.amount_received` (เงินที่ **เก็บได้จริง**) กับ `toSatang(order.totalPayableAmount)` · เจตนาเขียนไว้ที่ `:33`
- แผน §5.2 ข้อ 1 สั่ง normalize ผ่าน `toSettlementFacts()` เพื่อรักษา "ด่านเดียว" แต่ **ไม่ระบุว่า `amountSatang` มาจาก field ไหน** · ถ้ามาจาก `session.amount_total` นั่นคือยอดที่ **เราเป็นคนส่งไปเอง** ตอนสร้าง session ⇒ ด่านนี้จะผ่านเสมอโดยไม่พิสูจน์อะไรเกี่ยวกับเงินที่เข้าจริง

ทางแก้ที่เล็กที่สุด: เขียนใน T5 ให้ชัดว่า settle-class event ต้องได้ `amountSatang` จาก PaymentIntent (`expand: ['payment_intent']` ตอน retrieve หรือ `getCheckoutSession` แล้วอ่าน PI) และถ้าอ่าน PI ไม่ได้ = ปฏิเสธ ไม่ใช่ตกกลับไปใช้ `amount_total`

---

## M8 — แผนไม่ได้บอกว่า `line_items` ประกอบขึ้นอย่างไร ซึ่งคือจุดเดียวที่ VAT จะเพี้ยน

- วันนี้ adapter ส่งยอดก้อนเดียว: `stripe-adapter.js:52` `amount: amountSatang` · `checkout.sessions.create` แบบ `mode: 'payment'` รับ `line_items` ไม่ใช่ `amount` ⇒ **นี่คือการแปลงที่บังคับต้องทำ และแผนไม่มีบรรทัดไหนพูดถึง** ทั้งใน §3 (พูดแค่สัญญา API ของเรา) และ T5/T7
- สูตรเราปัดต่อ component แล้วบวก: `fee-service.js:239-243` (`5000 → platform 500 → base 5500 → vat 385 → total 5885`) ถ้าใครไปใช้ `tax_rates`/`automatic_tax` 7% Stripe จะคำนวณจากฐานของมันเอง ⇒ `amount_total ≠ total_payable_amount` ⇒ ชนทั้ง DB CHECK (`migration 20260802150000:62-70`) และด่าน `:266-276` — **หลังจากเกษตรกรจ่ายไปแล้ว** คือ refuse ตอนที่เงินอยู่ที่ Stripe แล้ว
- และคำบรรยายบรรทัดต้องตรงกับสองพื้นผิวที่ถูกทำให้ตรงกันมาแล้วโดยเจตนา: invoice (`stripe-checkout-service.js:642,653,668`) กับใบกำกับภาษี (`checkout-settlement-service.js:116,121`)

ทางแก้ที่เล็กที่สุด: ตรึงใน T5 — 3 `price_data` บรรทัด, `unit_amount` เป็นสตางค์จากคอลัมน์ของ order เอง (`toSatang`, `config/stripe.js:22-34`), `quantity: 1`, ห้าม `automatic_tax` ห้าม `tax_rates` ห้าม `allow_promotion_codes` ห้าม `adjustable_quantity`

---

## M9 — เลข `TAX-PRD` จะถูกเผาเป็นกิจวัตร ไม่ใช่อุบัติเหตุ

- `checkout-settlement-service.js:290` `allocateReceiptNumber(...)` อยู่ **นอก** tx และ **ก่อน** `SELECT ... FOR UPDATE` ที่ `:305-308` · ผู้แพ้ race คืน `{raced:true}` ที่ `:306` ทั้งที่จองเลขไปแล้ว (คอมเมนต์ `:281-289` ยอมรับว่า "a crashed settle burns a number")
- วันนี้ settle-class event มีชนิดเดียว (`stripe.js:100`) การชนกันต้องอาศัย redelivery · แผน §5.1 ทำให้ **เงินก้อนเดียวมี settle-class event สองใบคนละ event id** (`checkout.session.async_payment_succeeded` + `payment_intent.succeeded`) ที่มาถึงห่างกันมิลลิวินาที และ dedup ชั้น 1 (`stripe.js:81-83`) กันไม่ได้เพราะคนละ id — แผนเองระบุไว้ที่ §5.2 ข้อ 3

⇒ ลำดับเลขใบกำกับภาษีจะมีช่องว่างเป็นระบบทุกใบ ซึ่งเป็นเรื่องที่ต้องอธิบายกับสรรพากรได้ ไม่ใช่แค่ "sequence มีช่องว่างได้"

ทางแก้ที่เล็กที่สุด (เลือกหนึ่ง): (ก) ให้ order หนึ่งใบมี settle-class event เพียงชนิดเดียว — ถ้าแถวมี `stripeCheckoutSessionId` ให้ `payment_intent.succeeded` เป็น no-op (ก) ถูกกว่า (ข) ย้ายการจองเลขเข้าไปใน tx หลัง recheck ซึ่งเปลี่ยนเหตุผลที่เขียนไว้ที่ `:281-289`

---

## M10 — แผนไม่ได้ตัดสินว่า `gatewayRef` เก็บอะไร ⇒ กระทบยอดกับ payout ของ Stripe ไม่ได้

`checkout-settlement-service.js:363` เขียน `gatewayRef: paymentIntent.id` และเป็นคอลัมน์ unique (`billing.prisma:323`) — เป็น **จุดเดียว** ที่ผูก ledger ของเรากับฝั่ง Stripe · แผนสร้าง `toSettlementFacts()` ที่คืน `gatewayRef` แต่ไม่มีบรรทัดไหนบอกว่าเป็น `cs_` หรือ `pi_` · ถ้าเป็น `cs_` รายงาน payout/charge ของ Stripe จะไม่มีเลขนี้ปรากฏเลย ⇒ recon สามทางทำไม่ได้

ทางแก้ที่เล็กที่สุด: เขียนเป็นข้อผูกมัดใน T5 — `gatewayRef` **คือ PaymentIntent id เสมอ** ทั้งก่อนและหลังการย้าย · session id อยู่ในคอลัมน์ของตัวเองเท่านั้น

---

## M11 — คนที่จ่ายแล้ว (PROCESSING) ยังโดนทวงหนี้ และการทวงคือเงื่อนไขของการปิดคำขอ

แผน T9 แก้ closure job ให้ไม่ปิดคนที่รอยืนยัน แต่ **ไม่แตะ reminder job**:
- `payment-reminder-job.js:117-121` — where มีแค่ `serviceType startsWith CHECKOUT_...`, `status: INVOICE_STATUS_PENDING`, `isDeleted:false` ไม่รู้จัก order เลย
- และการทวงครบ 3 ชนิดคือ **เงื่อนไขบังคับก่อนปิด** (`payment-closure-job.js:74`) ⇒ การทวงคนที่จ่ายแล้วคือการเดินนับถอยหลังให้ปิดคำขอเขา

ทางแก้ที่เล็กที่สุด: ใส่เงื่อนไข "order ของ invoice นี้ไม่อยู่ใน `PROCESSING`" ลงใน query ของ reminder job ในใบ T9 เดียวกัน

---

## สิ่งที่ตรวจแล้ว **ไม่เจอ** ข้อคัดค้าน (ไม่แต่งเพิ่ม)

- **D4 (ไม่ย้าย mint invoice)** — เหตุผล 5 ข้อของแผนตรงกับไฟล์จริงทุกข้อ: `journal-entry-service.js:600-602` (`invoiceId is required`), `:511` FK, `billing.prisma:58` dueDate NOT NULL, ผู้อ่าน invoice-pending 5 ราย · เห็นด้วยว่าไม่ควรย้ายในรอบนี้
- **โครงสร้าง journal 5 บรรทัด + balance guard + `journal_entries_settlement_once`** — ไม่ถูกแผนแตะ และไม่มีจุดไหนที่การย้าย gateway ทำให้รูปทรงเปลี่ยน
- **ลำดับ T3 มาก่อน T7** — ถูกต้องและจำเป็นจริง (`:247` ไม่เทียบ ref)
- **`invoice.status` คงเป็น `'paid'`** (§9.5) — ตรงกับผู้อ่าน 4 รายที่คอมเมนต์ `:333-343` ระบุไว้ ไม่มีข้อคัดค้าน
- **การจอง `expiresAt` ลงคอลัมน์เดิม** (`billing.prisma:1352`) — ไม่มีผู้อ่านเดิมให้พัง

---

## สรุปเงื่อนไขขั้นต่ำก่อนแผนนี้เดินได้

M1 · M2 · M4 · M5 ต้องถูกแก้ **ในใบเดียวกับที่มันเกิด** ไม่ใช่ตามเก็บทีหลัง เพราะทั้งสี่ข้อมีรูปแบบเดียวกัน: ความล้มเหลวเป็น terminal และเงียบ (stamp `PROCESSED` / close final) ⇒ ไม่มีใครเจอจนกว่าจะกระทบยอดด้วยมือ · M3 · M6 · M9 เป็นการแลกที่ต้องให้ operator ตัดสินโดยเห็นราคาก่อน ไม่ใช่ให้ agent เลือกเอง

# ข้อคัดค้าน: ความปลอดภัยของการย้าย

# หักล้างแผนย้าย checkout → Stripe Checkout Sessions (มุมความปลอดภัยของการเปลี่ยนผ่าน)

อ่านอย่างเดียว ไม่แก้ไฟล์ ไม่รัน probe/test ⇒ สถานะของรายงานนี้ = `PENDING` (การอ่าน source ไม่ใช่ผลรัน) · ข้อที่เป็นพฤติกรรมของ Stripe เอง ติดป้าย **[ต้องยืนยัน]** ไว้

---

## O1 — CANCELLED คือทางตันถาวร และแผนเปลี่ยนมันจาก "แทบไม่เกิด" เป็น "เกิดทุก 24 ชม."

**หลักฐาน**
- `checkout-settlement-service.js:571-581` — `payment_intent.canceled` เขียน `status:'CANCELLED'` เมื่อแถวยัง `PENDING_PAYMENT`
- `shared/checkout-status.js:44-45` — `CANCELLED: []` terminal ไม่มีทางออก (แผน §4.2 คงข้อนี้ไว้)
- `prisma/migrations/20260802150000_wave1_checkout_engine_expand/migration.sql:89-91` — open-order index ครอบเฉพาะ `status='PENDING_PAYMENT'` (T4 เติม PROCESSING/EXPIRED แต่ **ไม่เติม CANCELLED**) ⇒ order ใบที่สอง mint ผ่าน index นี้ได้
- `prisma/migrations/20260701010000_uniq_invoice_app_servicetype/migration.sql:87-89` — แต่ invoice ชน `uniq_invoice_app_service_active (applicationId, serviceType) WHERE isDeleted=false` → P2002 → `stripe-checkout-service.js:697` ตอบ 409 `CHECKOUT_ALREADY_IN_PROGRESS`
- grep `isDeleted: true` ใน `services/checkout`, `services/billing`, `routes/api/finance`, `jobs` = **0 hit** ⇒ ไม่มีใครปลด invoice ของ order ที่ตายแล้วเลย

**สถานการณ์เป็นขั้น** — session หมดอายุ 24 ชม. → Stripe ยกเลิก PI ของ session นั้น **[ต้องยืนยัน]** → `payment_intent.canceled` มาถึง **ก่อน** `checkout.session.expired` (ลำดับ event ไม่มีการรับประกัน) → แถวเป็น CANCELLED → handler ใหม่ของ T6 ที่เขียน EXPIRED "เฉพาะเมื่อยัง PENDING/PROCESSING" กลายเป็น no-op → re-entry ของ T7 (อ่าน PENDING/PROCESSING/EXPIRED) ไม่เจอ → mint ใหม่ → 409 ตลอดกาล · **เกษตรกรรายนั้นจ่ายเงินไม่ได้อีกเลย** และ D3 (หนึ่ง invoice ตลอดชีวิต) คือสิ่งที่ทำให้ฟื้นไม่ได้ · แผน §5.1 สั่ง "คงไว้ช่วงเปลี่ยนผ่าน" ให้ `payment_intent.canceled` โดยไม่รู้ว่าโลกใหม่จะยิงมันเป็นกิจวัตร

**ทางแก้เล็กสุด** — ใน T6: `payment_intent.canceled` ต้องเป็น no-op เมื่อแถวมี `stripe_checkout_session_id` (order ที่เกิดจาก session รับสถานะจากตระกูล session เท่านั้น) และเพิ่ม `CANCELLED → PENDING_PAYMENT` ให้ re-entry รับ CANCELLED เท่ากับ EXPIRED

---

## O2 — remediation ใหม่ของ T11 เปลี่ยน price-drift จาก "แก้ได้" เป็น deadlock

`error-codes.js:2594` เขียนไว้ว่าการปลดต้อง **สองขั้น**: ยกเลิก PI → webhook พาแถวไป CANCELLED (ออกจาก index) → แล้วค่อยออกใบเสนอราคาใหม่ · T11 เปลี่ยนเป็น "expire session" ⇒ แถวไป **EXPIRED** ซึ่ง T4 เพิ่งใส่ไว้ใน predicate ของ index ⇒ re-entry คืน **order ใบเดิม** → breakdown ถูก freeze จากแถว (`stripe-checkout-service.js:207-215`) → drift check ครอบ RE_ENTRY ด้วย (`:487-497`, `entry` ที่ `:496`) → `CHECKOUT_PRICE_DRIFT` ยิงซ้ำทุกครั้ง ไม่มีทางออก

(ทางเดิมก็พังอยู่แล้วด้วย O1 — invoice ค้าง) ⇒ **ทางแก้เล็กสุด**: ใบแยกก่อน T11 = สคริปต์ operator ที่ soft-delete invoice + ปิด order พร้อมกัน แล้วค่อยเขียน remediation ชี้ไปที่สคริปต์นั้น ไม่ใช่เปลี่ยนคำในแคตตาล็อกเฉย ๆ

---

## O3 — guard #3 ของ closure job ตายเงียบสำหรับ order ที่เกิดจาก session → ปิดคำขอที่จ่ายเงินแล้ว (reopen ไม่มี)

`payment-closure-job.js:125-132`
```js
select: { stripePaymentIntentId: true },
...
if (!order || !order.stripePaymentIntentId) { return false; }   // false = "ยังไม่จ่าย ปิดได้"
```
แผน §4.1 บอกว่า PI id เขียน "เมื่อ webhook พามาให้ครั้งแรก" ⇒ order ที่ **webhook หาย** (คือเคสเดียวที่ guard นี้มีไว้กัน — `:110-121`) จะมี PI id = null เสมอ → guard ผ่านฉลุย → คำขอถูกปิด `EXPIRED`/`PAYMENT_ABANDONED` ทั้งที่เงินอยู่ที่ Stripe · `payment-closure-job.js:35` เขียนเองว่า "NOT reopen-eligible ... final" · T9 ในแผนพูดแค่ "นับ processing เป็นห้ามปิด" ไม่ได้สั่งเปลี่ยนคอลัมน์ที่ lookup

**ทางแก้เล็กสุด** — select ทั้งสองคอลัมน์, มี session id → `getCheckoutSession`, ไม่มี ref ทั้งคู่ → `return true` (fail-safe) ไม่ใช่ false

---

## O4 — Query B ของ reconcile: เปลี่ยนคอลัมน์ = order เก่าหลุด backstop ในวันเดียวกับที่แผนบอกให้ "รับของเก่าต่อ"

`settlement-reconcile-job.js:118-125` กรอง `status:'PENDING_PAYMENT'` + `stripePaymentIntentId:{not:null}` · T9 เขียนว่า "กวาดจากคอลัมน์ใหม่" ⇒ order รางเก่าหายจาก backstop ทันที ขณะที่ §5.3 บอกให้รับ event เก่าต่อจนกว่าจะนับได้ 0 — สองข้อขัดกันเอง

เพิ่มเติมที่แผนไม่ได้พูด: `:135` ใช้ `type: SETTLE_EVENT_TYPE` เป็น scalar และ `:136` เทียบ JSON path `data.object.id` — ถ้า `:75` กลายเป็น array ต้องแก้ `:135` เป็น `in` ด้วย ไม่งั้นตัวกรองพัง และ path ต้องเทียบสองแกน (cs_ / pi_)

**ทางแก้เล็กสุด** — query B เป็น `OR` ของสองคอลัมน์ + `status IN ('PENDING_PAYMENT','PROCESSING')` และ re-drive dispatch ตาม `ev.type`

---

## O5 — T3 ตามที่เขียน จะยิง CRITICAL ใส่ทางสุขที่สุดทุกใบ และ "refuse" ของมันเป็น terminal เงียบ

1. **ไม่มีผู้เขียน `stripe_payment_intent_id` ในตาราง §4.3 เลย** ⇒ order ที่เกิดจาก session มีค่านี้ null · เมื่อ `payment_intent.succeeded` (ที่ §5.1 สั่ง "คงไว้ทั้งดุ้น") มาถึงหลัง settle แล้ว fast-path (`checkout-settlement-service.js:247-263`) จะเทียบ `pi.id` กับ null → "ไม่ตรง" → AuditLog CRITICAL + refuse **ทุกการจ่ายที่สำเร็จ**
2. **ช่อง crash**: การเขียน session id อยู่นอก transaction เหมือนท่าเดิม (`stripe-checkout-service.js:725-730`) → crash ระหว่างนั้น = แถวไม่มี ref ใด ๆ แต่ session มีชีวิต → จ่ายจริง → T3 ตีเป็น mismatch → refuse
3. **refusal ใหม่กลายเป็น terminal อัตโนมัติ**: `checkout-settlement-service.js:506` `const terminal = result.settled === false && result.reason;` — *เหตุผลอะไรก็ได้* ถูก stamp `PROCESSED` ทันที ไม่ retry และ query A ไม่แตะ PROCESSED (`settlement-reconcile-job.js:93-94`) ⇒ เงินเข้าแล้วแต่ไม่มีวัน settle และไม่มีใครกวาด

**ทางแก้เล็กสุด** — (ก) ref เป็น null = "ผูก ref" ไม่ใช่ mismatch (ข) เทียบกับชุด `{sessionId, paymentIntentId, session.payment_intent}` (ค) รหัส refusal ใหม่ต้องอยู่ใน allowlist terminal ที่ระบุชื่อ ไม่ใช่ blanket `result.reason`

---

## O6 — แผนสั่ง settle เต็มเส้น **สองครั้ง** ต่อการจ่ายหนึ่งครั้งโดยตั้งใจ

§5.1 ให้ทั้ง `checkout.session.async_payment_succeeded` และ `payment_intent.succeeded` เป็น "settle เต็มเส้น" · เป็น event id คนละใบ dedup ชั้น 1 จึงไม่กัน (`routes/api/webhooks/stripe.js:81-83`) ⇒ ทั้งคู่วิ่งเข้า `settleFromPaymentIntent` · ผู้แพ้ **จองเลข TAX-PRD ไปแล้วที่ `:290` ก่อนเข้า tx** แล้วจึงเจอ `raced` ที่ `:307` และคืน `alreadySettled` ที่ `:445` ⇒ เผาเลขใบเสร็จหนึ่งใบต่อการจ่ายหนึ่งครั้ง เป็นกิจวัตร (I15 ยอมให้มีช่องว่าง แต่นี่คือครึ่งหนึ่งของเลขทั้งหมด) และเป็นตัวจุดชนวน O5(1) ทุกครั้ง

**ทางแก้เล็กสุด** — order ที่มี session id: `payment_intent.succeeded` = บันทึก PI id อย่างเดียว ไม่ settle

---

## O7 — ตารางเดินสถานะ §4.2 ไม่ได้บังคับอะไรเลยในโปรดักชัน และ PROCESSING writer ไม่มี predicate

grep `canTransitionCheckout` / `ALLOWED_CHECKOUT_TRANSITIONS` ทั่ว `apps/backend` + `scripts`: **ไม่มีผู้เรียกในโค้ดโปรดักชันเลย** (เจอแต่ `__tests__/unit/checkout-vocabulary.test.js` และสคริปต์ที่เช็คว่าสตริงอยู่ในลิสต์) ⇒ edge ถูกบังคับด้วย `where` ที่เขียนมือของแต่ละ writer เท่านั้น และ CHECK ใน DB คุมได้แค่ "ค่าที่ถูก" ไม่ใช่ "การเดินที่ถูก" · ประโยค "ห้ามมีผู้เขียนที่ห้า — probe T12 บังคับ" คุมได้แค่ *ไฟล์* ไม่ใช่ *edge*

แผนให้ predicate กับ EXPIRED writer แต่ไม่ให้กับ PROCESSING writer · สถานการณ์: delivery แรกของ `checkout.session.completed` ทำ handler พัง route ตอบ 500 (`stripe.js:110-122`) แถวค้าง `RECEIVED` → ผู้ใช้จ่ายสำเร็จ → `async_payment_succeeded` settle → Stripe redeliver ใบ completed → แถวไม่ PROCESSED จึงไหลลง handler (`stripe.js:85-90`) → **เขียน PROCESSING ทับ SETTLED** → ทุกผู้อ่านเห็นว่ายังไม่จ่าย และ reconcile query B จะ re-drive

**ทางแก้เล็กสุด** — writer ใหม่ทุกตัวใช้ `updateMany` + `where.status IN (...)` และ T12 ตรวจว่าไม่มี `checkoutOrder.update` ที่เขียน `status` โดยไม่มี status predicate (ยกเว้นในไฟล์ settle ที่ถือ `FOR UPDATE`)

---

## O8 — เหตุผลของ T2 อ้างสิ่งที่โค้ดไม่ได้ทำ (Tier C ที่ขอ operator อนุมัติบนข้อเท็จจริงผิด)

`POST /payments/create` → `createPhase1Payment` **ไม่สร้างแถว invoice เลย**: สร้างสตริง `INV-${Date.now()}-...` (`services/payment-service-phase-flow.js:169`), เดินคำขอไป `PENDING_DOC_FEE` + `phase1Status:'PROCESSING'` + `phase1ExpiresAt` (`:176-208`) และแถว `paymentTransaction` gateway `BANK_TRANSFER` (`:210-223`) — ไม่มี `prisma.invoice.create` ในไฟล์

⇒ ประโยค "ปิด flag แล้วใบแจ้งหนี้เกิดเร็วขึ้น" (D7 และ §7.3) **ยืนยันไม่ได้** · สิ่งที่ T2 ลบจริงคือผู้เขียน `phase1Status` และการเดินคำขอไป `PENDING_DOC_FEE` ตอนกดยื่น = เปลี่ยน population ของทุกคิว/รายงานที่กรองด้วย `PENDING_DOC_FEE` โดยที่ใบไม่ได้พูดถึง

**ทางแก้เล็กสุด** — เขียนเหตุผลของ T2 ใหม่ให้ตรงของจริง (ลบรางสลิปที่ตายแล้ว ตาม memory "slip retired") และระบุผลข้างเคียงเรื่องสถานะคำขอไว้ในใบ

---

## O9 — ลำดับ deploy: migration guard ทำให้ "ผิดลำดับ" = ดับทั้งเว็บ ไม่ใช่แค่ checkout · และไม่มีทางถอย schema

- `server.js:550-556` → `assertMigrationLevelAtBoot` → `process.exit(1)` เมื่อ tree มี migration ที่ DB ยังไม่ apply (strict = production หรือ `REQUIRE_MIGRATIONS_CURRENT=true` — `config/migration-level-guard.js:88-90`) ⇒ image ของ T4 ที่ขึ้นก่อน `migrate deploy` = backend ไม่บูตเลย ทุกโดเมนที่ใช้ฐานนั้น
- ถอย image ได้ (DB ใหม่กว่า tree = แค่ warn — `migration-level-guard.js:112-118`) แต่ **ถอย DB ไม่ได้**: `ADD CONSTRAINT checkout_orders_status_check` ใบเก่าจะล้มทันทีถ้ามีแถว `PROCESSING` อยู่ (`migration 20260802150000:50-52`) · และโค้ดเก่าที่กลับมาจะมองไม่เห็นแถว PROCESSING (`stripe-checkout-service.js:464` อ่าน PENDING_PAYMENT ล้วน) แต่ index ใหม่ที่ยังอยู่จะปฏิเสธการ mint → เกษตรกรกลุ่มนั้นได้ 409 จนกว่า webhook จะมา
- prod+demo ใช้ Supabase ตัวเดียวกัน staging คนละตัว (memory) ⇒ T4 = migrate สองฐาน + image สองชุด และของ staging จะลาก migration ค้างอื่น ๆ ขึ้นไปพร้อมกัน

**ทางแก้เล็กสุด** — T4 ต้องมี runbook เป็นขั้น (migrate demo/prod → deploy backend → migrate staging → deploy staging) และประกาศตรง ๆ ว่าไม่มีการถอย schema มีแต่ roll-forward

---

## O10 (เล็ก) — FE/BE คนละ image: การตัด `clientSecret` ต้องมีลำดับ deploy

`apps/web-app/src/lib/services/checkout-service.ts:43-46` บังคับ `paymentIntentId: string; clientSecret: string` · BE ใหม่ + FE เก่า = ผู้ใช้ถึงจอ "created" ที่ไม่มีทางออก ขณะที่ invoice เกิดแล้วและ session เดินนาฬิกาอยู่ · FE ใหม่ + BE เก่า = redirect ไป `undefined`
**ทางแก้เล็กสุด** — FE อ่าน `data.gateway?.url` แบบทน ไม่มีก็ค้างจอเดิม + deploy BE ก่อน FE เสมอ

---

## สิ่งที่ตามหาแล้ว "ไม่เจอปัญหา" (บอกตามจริง)

- dedup ชั้น event id ใช้กับ event ชุดใหม่ได้โดยไม่ต้องแก้จริง — `routes/api/webhooks/stripe.js:81-83` เก็บ `type` แต่ตัดสินจาก id เท่านั้น
- ผู้อ่าน invoice ทุกตัวจับด้วย `serviceType` ที่ไม่เปลี่ยน (`stripe-checkout-service.js:90-92`) — ไม่มีหนี้ช่วงเปลี่ยนผ่านตรงนี้
- `journal_entries_settlement_once` ผูกกับ `order.id` ไม่ใช่ event ⇒ การ settle สองรอบของ O6 ไม่สร้าง journal ซ้ำ (หนี้อยู่ที่เลขใบเสร็จอย่างเดียว)
- ไม่พบผู้เขียน `EXPIRED`/`expiresAt` ในปัจจุบันจริง ⇒ ไม่มีแถวเก่าที่ต้อง backfill ก่อนเปลี่ยน predicate ของ partial unique index — ตรงกับที่แผนอ้าง
- ไม่พบว่า `parseEvent` (`services/payment/payment-adapter.js:34-50`) มีผู้เรียกในโปรดักชัน ⇒ การแก้ vocabulary ใน T5 ไม่ทำให้ของเดิมพังทันที (แต่ `:32` จัด `checkout.session.expired` เป็น CANCEL อยู่ — ถ้าใครเสียบ parseEvent เข้า dispatch ภายหลัง จะได้ O1 ฟรีทันที)

# ข้อคัดค้าน: มุมเกษตรกร

## หักล้างแผน — มุมเกษตรกร (เรียงจากร้ายแรงสุด)

ทุกข้อคือการอ่านไฟล์จริงในเซสชันนี้ · ข้อที่เป็นพฤติกรรมของ Stripe เอง ติดป้าย **[ต้องยืนยัน]** · ไม่ได้รัน test/probe ใด ๆ → สถานะรายงานนี้ `PENDING`

---

### F1. หน้ารายการยังบอกว่า "ยังไม่ชำระ" ขณะเงินกำลังเดินทาง → เกษตรกรจ่ายซ้ำ และเงินก้อนที่สองไม่มีที่ลง

**เส้นทางเป็นขั้น**
1. กด "ชำระเงินออนไลน์" → redirect ไป Stripe → สแกน PromptPay → จ่ายจากแอปธนาคารบนมือถืออีกเครื่อง → แท็บ Stripe บนคอมถูกปิด/หลุด
2. `checkout.session.completed` มาถึงแบบ `payment_status ≠ paid` → order = `PROCESSING` และตามแผน §5.1 "**ห้ามแตะ invoice**" ⇒ invoice ยัง `pending`
3. เกษตรกรกลับมาหน้า `/health/payments` — `pendingAmount` นับจาก `!item.isPaid && !item.isCancelled` (`apps/web-app/src/app/health/payments/client-view.tsx:315-317`) ⇒ ยอดรอชำระเท่าเดิม, `entryOwes` เป็นจริงจากบรรทัดแรกสุด (`apps/web-app/src/app/health/payments/checkout-entry-owes.ts:42`) ⇒ **ปุ่ม "ชำระเงินออนไลน์" ยังขึ้นเหมือนไม่เคยจ่าย** (`client-view.tsx:473-486`) พร้อมคำโปรย "ชำระผ่านระบบออนไลน์ได้ทันที" (`:466-468`)
4. กดอีกครั้ง — แผน T7 บอกแค่ว่า re-entry lookup ต้องอ่าน `status IN ('PENDING_PAYMENT','PROCESSING','EXPIRED')` **แต่ไม่ได้เขียนกฎว่าเจอ PROCESSING แล้วต้องทำอะไร** จบได้ 2 ทาง ทั้งคู่แย่: (ก) คืน session เดิมที่ `complete` แล้ว → จอ Stripe ที่อ่านไม่ออกว่าเกิดอะไร **[ต้องยืนยัน]** (ข) ออก session ใหม่ → QR ใบที่สอง → **จ่ายจริงสองครั้ง**

**ทำไมข้อนี้ร้ายกว่าที่แผนคิด** — ถ้าเกิด (ข) เงินก้อนที่สอง**ไม่มีแถวไหนในระบบรองรับเลย**:
- D6/T3 สั่งให้ settlement เทียบ gateway ref แล้วปฏิเสธ ⇒ event ถูก stamp `PROCESSED` พร้อม error (`apps/backend/services/checkout/checkout-settlement-service.js:505-511`) จบที่ log ไม่มี invoice ไม่มีใบเสร็จ
- คืนเงินอัตโนมัติไม่มี: adapter ไม่มีเมธอด refund เลย (grep `refund` ใน `apps/backend/services/payment/stripe-adapter.js` + `payment-adapter.js` = 0) และ `refund-service.js:6-7,:20-23` ระบุเองว่าเป็นงานที่เจ้าหน้าที่การเงินเริ่ม แล้ว **"finance staff makes the actual bank transfer"** นอกระบบ · ทั้งเส้นผูกกับ invoice ที่ `status === 'paid'` (`refund-service.js:296`) ซึ่งก้อนที่สอง**ไม่มี**
- แต่จอที่เกษตรกรติ๊กยอมรับก่อนกดจ่าย เขียนไว้ว่า "**เงินที่เก็บซ้ำหรือเก็บผิดพลาดมีสิทธิ์ได้รับคืน**" (`apps/web-app/src/app/health/payments/checkout/client-view.tsx:632-635`) — แผนนี้เพิ่มโอกาสเก็บซ้ำ (หลาย session ต่อ 1 order) โดยไม่มีของที่จะทำตามคำสัญญานั้น

**ทางแก้ที่เล็กที่สุด**: (1) ประตูสถานะ T8 ต้องป้อน**หน้ารายการ** ด้วย ไม่ใช่แค่หน้า return — ปุ่มต้องกลายเป็นป้าย "รอยืนยันการชำระเงิน" เมื่อ order เป็น PROCESSING (2) เขียนกฎ re-entry ให้ชัดในใบ T7: เจอ PROCESSING = **ปฏิเสธด้วยรหัส/คำไทยใหม่** ห้ามสร้าง session ใหม่ทุกกรณี

---

### F2. ไม่มีสิ่งใดบอกเกษตรกรว่าเงินเข้าแล้วหรือไม่เข้า — ความจริงถูกวางไว้บนจอที่ต้องเปิดค้าง

- `checkout-settlement-service.js` ไม่ import notification เลย (รายการ require ทั้งหมด `:38-61` — มี audit, journal, receipt, quotation ไม่มี notification)
- `application-status-writer.js:142-159` เขียนไว้เองว่า fanout ถูก lazy-require เพราะ "**the AUDIT_PASSED branch is the ONLY caller**" ⇒ การเดินไป `DOC_FEE_PAID` ไม่แจ้งใคร
- `NotifyType` มี `PAYMENT_REMINDER` เท่านั้น (`apps/backend/services/notification-service.js:16`, template `:144`) — ไม่มีชนิด "ชำระเงินสำเร็จ" หรือ "ชำระไม่สำเร็จ"

PromptPay เป็น async: ผลจริงอาจมาหลังเกษตรกรปิดเบราว์เซอร์ไปแล้ว แผนตอบเรื่องนี้ด้วย §3.2 + T10 คือ **หน้า return ที่ poll** ซึ่งแปลว่า "ถ้าคุณปิดจอ คุณจะไม่มีวันรู้ผล จนกว่าจะเปิดหน้ารายการเองแล้วเดาเอาจากตัวเลข" · และในกรณี `async_payment_failed` เกษตรกรจะเชื่อว่าจ่ายแล้ว (เงินหักจากบัญชีชั่วคราว/ไม่หัก แล้วแต่ธนาคาร) โดยไม่มีใครบอกว่าล้ม

**ทางแก้ที่เล็กที่สุด**: เพิ่ม in-app notification 2 ใบในใบ T6 (settled / async_failed) ผ่าน `sendNotification` ที่มีอยู่แล้ว — in-app only ตามกติกาที่บันทึกไว้ ไม่ต้องแตะ email/SMS

---

### F3. `PROCESSING` ไม่มีประตูออก — คำขอค้างถาวรและไม่มีทางแก้ด้วยตัวเอง

ตาม §4.3 ผู้เขียน `EXPIRED` มีแค่ `checkout.session.expired` กับ `checkout.session.async_payment_failed` เท่านั้น · session ที่ยิง `completed` ไปแล้วจะไม่ยิง `expired` อีก **[ต้องยืนยัน]** ⇒ ถ้าผลลัพธ์ async หายไป (webhook ล่มช่วงนั้น / event เข้า DEAD_LETTER) order จะค้าง `PROCESSING` ตลอดกาล:
- `DEAD_LETTER` เป็น terminal ไม่มีใคร re-drive (`checkout-settlement-service.js:500-502`)
- reconcile query A กวาดเฉพาะ `status in ['RECEIVED','FAILED']` (`apps/backend/jobs/settlement-reconcile-job.js:91-94`) ⇒ ไม่แตะ DEAD_LETTER
- query B ยิง gateway แล้วยอมรับเฉพาะ "จ่ายแล้ว" (`:118-125` + T9) — แผนไม่ได้ให้อำนาจใครเขียน `EXPIRED` จากการอ่าน gateway
- และ T9 ยังสั่ง closure job ว่า "รอยืนยัน = ห้ามปิด" ⇒ คำขอไม่ถูกปิด ไม่ถูกจ่าย และ **reopen ยังไม่มีของ** (`apps/backend/jobs/payment-closure-job.js:35-36`)

ผลกับเกษตรกร: คำขอแช่แข็ง ปุ่มกดไม่ได้ (ถ้าแก้ F1 แล้ว) ทางออกเดียวคือโทรหาเจ้าหน้าที่ ซึ่งเจ้าหน้าที่ก็ไม่มีปุ่มอะไรให้กด

**ทางแก้ที่เล็กที่สุด**: ให้ `PROCESSING` มีนาฬิกาของตัวเอง (ใช้ `payment_transactions.webhookReceivedAt` ที่มีอยู่แล้ว — `prisma/schema/billing.prisma:339,356`) และให้ reconcile ตัดสินจาก gateway: PI ที่ไม่ succeeded และไม่ processing แล้ว → เขียน `EXPIRED` · เขียนเป็น edge ในใบ T9 ไม่ใช่ปล่อยให้ webhook เป็นผู้เขียนรายเดียว

---

### F4. session ตายแล้วแต่ order ยัง `PENDING_PAYMENT` → ปุ่มพาไปหน้าที่ตายแล้ว วนไม่จบ

D5 ผูก `attempt` ไว้กับการ flip `EXPIRED → PENDING_PAYMENT` ซึ่งตาม §4.3 มี **webhook เป็นผู้เขียนรายเดียว** · ถ้า `checkout.session.expired` หาย/มาช้า/ตกไป DEAD_LETTER (`:500-502`) order จะยัง `PENDING_PAYMENT` ที่ attempt เดิม ⇒ ทุกครั้งที่กดปุ่ม `idempotencyKey: checkout:{orderId}:{attempt}` เดิมจะคืน **session ใบเดิมที่หมดอายุ** ⇒ เกษตรกรถูกส่งออกไปหน้า Stripe ที่บอกว่าลิงก์หมดอายุ กดกลับ กดใหม่ ได้ผลเดิมทุกครั้ง — คือลูปเดิมที่แผนบอกว่าจะแก้ (§6) ย้ายไปอยู่ฝั่ง Stripe แทน

**ทางแก้ที่เล็กที่สุด**: ตัดสิน attempt จาก **`expiresAt` เทียบนาฬิกาของเราเอง** (คอลัมน์ที่ T4 เขียนอยู่แล้ว) ไม่ใช่จาก status — `expiresAt < now` = attempt+1 เสมอ ไม่ว่า status จะเป็นอะไร · webhook กลายเป็นตัวยืนยัน ไม่ใช่เงื่อนไขจำเป็น

---

### F5. ลำดับ T1/T2 ที่แผนไม่ได้กำหนด ทำให้จอเปล่าแบบ UX-9 กลับมาทันที

W0 เขียนว่า T0-T3 "ทำได้ทันที ขนานกัน" และช่อง "ขึ้นกับ" ของทั้งสองใบเป็น `—` · แต่ถ้า **T2 ขึ้นก่อน T1**: ลบ fallback ที่ `apps/web-app/src/lib/services/submit-and-hand-over.ts:83` ⇒ ใต้ flag ปิด ไม่มี invoice เกิด ⇒ `pendingAmount = 0` ⇒ กล่องเตือน "ระบบยังไม่เปิดช่องทางชำระเงิน" ที่เงื่อนไข `pendingAmount > 0` (`payments/client-view.tsx:457`) **ไม่ขึ้น** ⇒ เกษตรกรที่เพิ่งยอมรับใบเสนอราคาเห็นหน้าที่ไม่มีทั้งปุ่ม ไม่มีทั้งคำอธิบาย — คือเคสที่คอมเมนต์ `:445-456` เขียนไว้เองว่าเคยทำให้ walk นั่งรอ 60 วินาที

**ทางแก้ที่เล็กที่สุด**: เขียนในตาราง W0 ว่า **T1 เป็น dependency ของ T2** (บรรทัดเดียว) — ตอนนี้แผนไม่มีบรรทัดนี้

---

### F6. ระบบทวงเงินคนที่จ่ายไปแล้ว

`apps/backend/jobs/payment-reminder-job.js:118-121` คัดใบแจ้งหนี้จาก `serviceType startsWith 'CERTIFICATION_CHECKOUT'` + `status: 'pending'` **เท่านั้น** ไม่มองสถานะ order เลย ⇒ ระหว่าง `PROCESSING` (และหลัง settle ที่ตกไป DEAD_LETTER) เกษตรกรที่จ่ายแล้วจะได้รับ PRE_DUE / DUE_DATE / OVERDUE_NOTICE ครบสามระลอกตามกำหนดของ `dueDate` · แผน §6 ยกงานนี้มาเป็นเหตุผลว่า "ห้ามย้าย invoice" แต่**ไม่มีใบไหนแก้ตัวกรองของมัน** (T9 แตะแค่ reconcile + closure)

**ทางแก้ที่เล็กที่สุด**: เติมเงื่อนไขใน where เดียวกัน — ข้าม invoice ที่ order เป็น `PROCESSING`/`SETTLED` (หนึ่ง relation filter ในใบ T9)

---

### F7. จบเส้นทางแล้วเกษตรกรได้ "ตัวเลข" ไม่ได้ "ใบเสร็จ"

เกณฑ์ปิดงาน G4 ของแผนคือ "เลขใบเสร็จ `TAX-PRD-...` ขึ้นบนจอ" — แต่เอกสารจริงเอาออกไม่ได้:
- ประตูใบเสร็จ PDF เป็น **provider-only**: `apps/backend/routes/api/finance/invoice-payment-handlers.js:62` (`authenticateProvider` + `PERMISSIONS.RECEIPT_ISSUE`)
- ประตูเดียวของเกษตรกรคือ `apps/backend/routes/api/finance/invoices.js:146` → `invoice-service.js:351` → `generateInvoicePdf` ซึ่งเป็น**คนละ template** กับ `generateReceiptPdf` (`invoice-service.js:556`; template `apps/backend/services/pdf/invoice-template-service.js:658`) — บริบทที่พิมพ์ `RECEIPT_NUMBER` อยู่ใน `buildReceiptContext` (`:475-504`) ซึ่งถูกเรียกจาก `:705` และ `:882` เท่านั้น **ไม่ใช่จาก `generateInvoicePdf` (`:570`)**
- `generateTaxInvoicePdf` (`:780`) ไม่มี route production เรียกเลย (grep ทั้ง `apps/backend` นอก tests = พบเฉพาะคอมเมนต์ที่ `routes/api/finance/credit-notes.js:161`)
- `checkoutDocument` `PLATFORM_TAX_INVOICE` ที่ settle สร้างไว้ ไม่มี route ไหนเสิร์ฟ (grep `checkoutDocument|PLATFORM_TAX_INVOICE` ใน `apps/backend/routes` = 0)

⇒ เกษตรกรที่ต้องใช้ใบกำกับภาษีไปลงบัญชี ต้องโทรหาเจ้าหน้าที่ทุกราย

**ทางแก้ที่เล็กที่สุด**: เพิ่ม `GET /api/invoices/:invoiceId/receipt/pdf` เวอร์ชัน `authenticateHealth` + `assertHealthOwnsInvoice` (ฟังก์ชันที่มีอยู่แล้วที่ `invoices.js:148`) เป็นใบเล็กแยก — ไม่ต้องรอ T13

---

### F8. จังหวะ redirect คือจังหวะที่แผนควบคุมน้อยที่สุด และไม่มีทางกลับ

1. **redirect ล้ม = จอค้าง**: order + invoice ถูก commit ไปแล้วก่อนคุยกับ gateway (`apps/backend/services/checkout/stripe-checkout-service.js:603-621` อยู่ใน `$transaction` ที่ปิดก่อนบรรทัด `:707`) · แผน T10 ตัดจอ `created` ทิ้ง ⇒ ถ้าเน็ตหลุดหลัง 200 แต่ก่อน navigate เกษตรกรเห็นปุ่มหมุนแล้วเงียบ โดยที่หนี้เกิดแล้ว และหน้ารายการก็ไม่มีปุ่ม "ไปจ่ายต่อ" ให้
2. **login กินพารามิเตอร์ทิ้ง**: token ฝั่ง health อายุ 24 ชม. (`apps/backend/config/jwt-security.js:130`) เท่ากับอายุ session พอดี ⇒ คนที่จ่ายข้ามวันมีโอกาสสูงที่จะถูกเด้งเข้า login ตอนกลับมา และ middleware เก็บแค่ **pathname**: `loginUrl.searchParams.set('redirect', pathname)` (`apps/web-app/src/middleware.ts:176`, และซ้ำที่ `:192`, `:211`) ⇒ `?order=...&session_id=...` หายทั้งหมด หน้า return จะไม่รู้ว่ากำลังพูดถึงรายการไหน
3. **§3.2 สัญญา `resume.url` ที่ไม่มีที่เก็บ**: T4 เพิ่มแค่ `stripe_checkout_session_id` + `session_attempt` + `expiresAt` ⇒ ตัว URL ไม่ได้ถูกบันทึก ประตู status จึงต้องยิง Stripe ทุกครั้งที่ poll (ช้า/ล้มพร้อม gateway) หรือไม่ก็ตอบ `resume.url` ไม่ได้จริง

**ทางแก้ที่เล็กที่สุด**: (ก) คงจอคั่นไว้หนึ่งจอที่มี**ลิงก์ให้กดเอง**ไปหน้าจ่าย (auto-redirect เป็นทางลัด ไม่ใช่ทางเดียว) (ข) เก็บ `url` ลงแถวพร้อม `expiresAt` ในใบ T4 (ค) ให้หน้า return อ่าน order id จาก path segment ไม่ใช่ query string เพื่อรอด middleware

---

### F9. QR ตายใน 24 ชม. แต่ใบแจ้งหนี้บอก 7 วันทำการ — และไม่มีประโยคไหนบอกเกษตรกร

- ใบแจ้งหนี้ M1 ครบกำหนด **7 วันทำการ** (M2 = 15) — `apps/backend/config/business-rules.js:286-289` ผ่าน `computeDueDate` (`checkout-schedule-service.js:52-64`)
- session อายุ ≤24 ชม. **[ต้องยืนยัน]**
- หัวหน้าเพจบอก "ระบบจะออกใบเสร็จให้อัตโนมัติเมื่อชำระสำเร็จ" (`payments/client-view.tsx:406`) และการ์ดปุ่มบอก "ชำระผ่านระบบออนไลน์ได้ทันที" (`:466-468`) — สองประโยคนี้เขียนไว้ตอนที่ rail ยังเป็นแบบซิงโครนัส

เกษตรกรที่บันทึกรูป QR ไว้แล้วโอนวันรุ่งขึ้นตามกำหนดชำระที่ระบบบอกเอง จะโอนเข้า QR ที่ตายแล้ว ผลปลายทาง **[ต้องยืนยันด้วย TEST-5]** แต่ทุกผลลัพธ์จบที่ "โทรหาเจ้าหน้าที่"

**ทางแก้ที่เล็กที่สุด**: จอคั่น/จอ return ต้องพิมพ์ `expiresAt` เป็นเวลาไทย + ประโยคเดียวว่า "QR ใช้ได้ถึง … ถ้าเลยเวลานี้ให้กลับมากดสร้างรายการใหม่ อย่าโอนจาก QR ที่บันทึกไว้" · และแก้สองประโยคข้างบนในใบ T10

---

### F10. โหมด mock: แผนสั่งให้ redirect แต่ไม่ได้บอกว่า redirect ไปไหน

`mock-payment-adapter.js:35-63` คืน `{id, clientSecret, raw}` ไม่มี `url` · T5 บอกแค่ว่า "mock ต้องมีคู่แฝดครบ" ไม่ได้บอกว่า url ของ mock คืออะไร · FE ก็มี mock ของตัวเองอีกชั้น (`NEXT_PUBLIC_CHECKOUT_API_MODE`, `apps/web-app/src/lib/config/checkout-mode.ts:32-35`) ⇒ ถ้าสภาพแวดล้อมที่เกษตรกรทดลองใช้ตั้ง adapter เป็น mock (ยังไม่ยืนยันว่า demo ตั้งค่าใด — ห้ามพิมพ์ค่า env) ผู้ใช้จะถูกส่งออกไปยัง URL ที่ไม่มีอยู่จริง

**ทางแก้ที่เล็กที่สุด**: กำหนดในใบ T5 ว่า mock ต้องคืน url ที่เป็น **route ภายในแอป** และให้ FE ปฏิเสธการ navigate ไป host ที่ไม่ใช่ Stripe

---

### F11. บนหน้าที่เราไม่ได้เขียนเอง ไม่มีอะไรบอกว่ากำลังจ่ายให้คำขอไหน

หน้ารายการเลือกคำขอด้วย `payments.find(...)` = แถว invoice **แรก** ที่เจอ (`apps/web-app/src/app/health/payments/payments-application-id.ts:33-34`) เกษตรกรที่มีสองคำขออาจถูกพาไปจ่ายใบที่ไม่ได้ตั้งใจ · เดิมยังมีจอ `created` ที่พิมพ์เลขคำขอไว้ให้ทาน (`checkout/client-view.tsx:424-462`) — T10 ตัดจอนั้นทิ้ง และสิ่งที่เกษตรกรเห็นบนหน้า Stripe คือ `line_items` ที่ §3/money-coupling กำหนดให้เป็นข้อความค่าธรรมเนียม 3 บรรทัด ส่วนเลขคำขออยู่ในฟิลด์ `description` (`stripe-checkout-service.js:714`) ซึ่ง**ไม่รับประกันว่าจะแสดงบน hosted page** **[ต้องยืนยัน]** · ธนาคารของผู้จ่ายจะเห็น `PREDICTIVE AI - GACP` (`apps/backend/config/stripe.js:19`) ซึ่งไม่ใช่ชื่อที่เกษตรกรคุ้น

**ทางแก้ที่เล็กที่สุด**: ใส่เลขคำขอเป็นส่วนหนึ่งของชื่อบรรทัดแรกของ `line_items` (ข้อความที่เห็นแน่ ๆ) และคงจอคั่นตาม F8(ก) ที่ยังพิมพ์เลขคำขอก่อนออกจากระบบเรา

---

## ที่ตรวจแล้วไม่เจอปัญหา (พูดตรง ๆ ว่าไม่เจอ)

- **ใบเสนอราคาหมดอายุระหว่างค้างจ่าย** — ไม่เป็นปัญหา: gate ปล่อยผ่านทันทีเมื่อสถานะอยู่ใน `QUOTATION_ACCEPTED_STATES` และเช็ค `validUntil` เฉพาะแถวที่ **ยังไม่ถูกยอมรับ** (`apps/backend/services/billing/quotation-gate.js:156-167`) ⇒ การยืดอายุ order ข้ามวันตามแผนไม่ทำให้ประตูล็อกเพิ่ม
- **ติ๊กเงื่อนไขซ้ำทุกครั้งที่กลับมาจาก Stripe** — ไม่เป็นปัญหา: consent อ่านจาก ledger และแสดง "คุณได้ยอมรับเงื่อนไขนี้ไว้แล้ว" (`checkout/client-view.tsx:646-651`)
- **กดปุ่มซ้ำแล้วได้ invoice ใบที่สอง** — ไม่เกิด ตราบใดที่ T4 แก้ predicate ของ partial unique ตามที่แผนเขียนไว้ (แผนข้อนี้ถูกแล้ว)
- **ไม่พบ**: ประตู "ยกเลิกรายการชำระเงิน" ฝั่งเกษตรกรในทั้ง repo (ผู้เขียน `CANCELLED` มีรายเดียวคือ `checkout-settlement-service.js:571-581` จาก event ของ gateway) — ไม่ใช่ข้อผิดของแผน แต่แปลว่าเกษตรกรที่กดพลาดไม่มีทางล้างรายการของตัวเอง และแผนก็ไม่ได้เพิ่มให้