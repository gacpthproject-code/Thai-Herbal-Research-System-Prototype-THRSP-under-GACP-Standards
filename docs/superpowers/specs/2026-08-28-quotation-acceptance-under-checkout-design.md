> ## ⚠️ เอกสารนี้บันทึกโมเดลที่เลิกใช้แล้ว (ปักป้าย 2026-09-05)
>
> ตัวเลขค่าธรรมเนียมและจุดยืนทางภาษีในเอกสารนี้เป็นของสูตรก่อน W14 (VAT คิดเฉพาะส่วนแพลตฟอร์ม)
> ปัจจุบัน: **ผู้ออกเอกสารรายเดียว · VAT 7% บนค่าบริการทั้งก้อน · งวด 1 = 5,885 · งวด 2 = 29,425**
> เก็บไว้อ่านเป็นบันทึกประวัติ · ความจริงปัจจุบัน: `apps/backend/services/fee-service.js`

# ใบเสนอราคาใต้รางบัตร (Stripe checkout): ยอมรับก่อนจ่าย และปิดใบเมื่อเงินเข้า — design

- ledger: F-G4-64 (ต้นตอของ F-G4-55) · วันที่ 2026-08-28 · operator ยืนยันทาง (ก) 2026-08-28 ("ยืนยันตามคุณแนะนำทั้งหมด")
- ฐานหลักฐาน: `reports/research/2026-08-28-f-g4-64/{synthesis,code-trace,rulings,register,external}.md` (สังเคราะห์ผ่านผู้คัดค้าน 23 ข้อ) — ทุกข้อในเอกสารนี้ชี้กลับไปที่รายงานนั้น ข้อที่รายงานติดป้าย UNVERIFIED ยังคงเป็น UNVERIFIED ที่นี่
- Tier: **C** (เส้นเงิน + migration + governance) — merge โดย operator เท่านั้น · L3: agent เขียนโค้ด/สคริปต์ dry-run ได้ การ `--apply` กับทะเบียนจริง = operator

## 1. สิ่งที่ operator ให้สัตยาบัน (ไม่ใช่มติเดิมที่เคยมี)

ก่อนหน้านี้มีแค่เจตนาการออกแบบ (arch doc 2026-05-16, ข้อความหน้าจอ, หน้าราคาสาธารณะ) ไม่มีมติที่ลงนามว่า "ต้องยอมรับใบเสนอราคาก่อนจ่าย" บนรางบัตร (`synthesis.md` §6 เหตุผล 1) มติวันนี้คือ:

> **R1** ใบเสนอราคาเป็น *ราคาที่บันทึกไว้* ของคำขอ และการที่ผู้ขอ **กดยอมรับ** ใบนั้น (การกระทำของมนุษย์ บันทึกผู้กระทำ + เวลา + ภาพนิ่งของตัวเลขที่เห็น) เป็น **เงื่อนไขก่อนสร้างรายการชำระเงินทุกงวด บนทุกราง** · ไม่มีใบ = จ่ายไม่ได้ (fail-closed) · ใบที่ยอมรับแล้วปิดเป็น INVOICED เมื่องวดสุดท้ายของใบถูกชำระ
> **R2** ยอดที่เรียกเก็บต้องเท่ากับยอดในภาพนิ่งที่ผู้ขอยอมรับ ถึงสตางค์ — ต่างกัน = ไม่สร้างรายการชำระ และแจ้ง ops (ไม่เก็บเงินคนละยอดกับที่ตกลงเงียบ ๆ)
> **R3** การออกใบเสนอราคาตอนยื่นต้องรอผลและล้มดัง ไม่กลืน error
> **R4** ข้อความยินยอม "เงื่อนไขการชำระเงิน" (มติ Q4) บังคับบนรางบัตรด้วย และเอกสารนั้นต้องพิมพ์ราคาที่ตรงกับที่เก็บจริง
> **R5** แถวเดิม 3 ใบซ่อมตามความจริง: ปิดใบของคำขอที่จ่ายครบผ่านราง checkout ก่อนมีด่าน โดย **ไม่แต่งบันทึกการยอมรับที่ไม่เคยเกิด** · คำขอ A2 ที่ไม่มีใบเลย: บันทึกในทะเบียนว่าไม่มีเอกสารตั้งราคา ห้ามสร้างย้อนหลัง

## 2. สถานะปัจจุบัน (อ้าง `synthesis.md` §1-3)

- รางสลิปมีด่าน `assertQuotationAcceptedForPhase1Slip` (`services/payment-slip-service.js:448`) — fail-open เมื่อไม่มีใบ · รางบัตร (`services/checkout/stripe-checkout-service.js:161-181`) ไม่มีด่าน และคำนวณราคาสดโดยไม่เปิดใบ (`:139`)
- settlement (`services/checkout/checkout-settlement-service.js:182-313`) ไม่แตะ `quotations` · `markQuotationInvoiced` ไม่มีผู้เรียกจริง
- ทะเบียน 2026-08-28: `quotations` = {PENDING: 3}; เงินที่เก็บโดยไม่มีบันทึกการยอมรับ 176,550 บาท; A2 (E5960D) ไม่มีใบเลย; ยอดใบ = ยอดบัตร ถึงสตางค์ (บังเอิญ ไม่มีโค้ดตรวจ)
- wizard slot 10 (`apps/web-app/src/app/health/applications/new/_steps/steps/invoice-step.tsx`) ให้ติ๊กยอมรับเอกสารที่เบราว์เซอร์แต่งเอง (เลข `G-01-…`, ยอด 30,000 คงที่) และเก็บคำยอมรับไว้ใน state เบราว์เซอร์เท่านั้น
- ด่านยินยอม Q4 (`payment-slip-service.js:517`) มีเฉพาะรางสลิป; `payment_slips` = 0 แถว → ไม่เคยมีลูกค้าเห็นข้อความนั้น; `docs/legal/payment-terms-th-v1.md:15-18` พิมพ์ 5,535 / 27,675 ต่ำกว่าที่เก็บจริง 5,885 / 29,425

## 3. การออกแบบ

### 3.1 ด่านเดียว สองราง — `services/billing/quotation-gate.js` (ใหม่)

```js
// throws { code, status: 409 } — never returns a "skip"
async function assertQuotationAcceptedForPayment({ applicationId, milestone /* 'M1'|'M2'|'PHASE_1'|'PHASE_2' */, client })
```
- หาใบผ่าน `quotationService.findQuotationsByApplicationId` (W14: `platform` คือใบเดียว; ใบ `dtam` มีเฉพาะคำขอก่อน W14 — ถ้ามีทั้งคู่ ทั้งคู่ต้องยอมรับ)
- **ไม่มีใบ → `QUOTATION_NOT_ISSUED` (409)** ข้อความ: "ระบบยังไม่ออกใบเสนอราคาของคำขอนี้ กดรีเฟรชอีกครั้ง หากยังไม่ปรากฏให้ติดต่อเจ้าหน้าที่" · ไม่มี legacy fail-open (ต่างจากรางสลิปเดิม)
- สถานะไม่อยู่ใน {ACCEPTED, INVOICED} → `QUOTATION_NOT_ACCEPTED` (409) ข้อความ: "กรุณายอมรับใบเสนอราคาก่อนชำระเงิน"
- ใบหมดอายุ (`validUntil < now` และยัง PENDING) → `QUOTATION_EXPIRED` (409) — บังคับ ม.357/359 (ถ้อยคำ UNVERIFIED แต่ตรรกะ "คำเสนอมีอายุ" เป็นของเราเอง) · ใบที่ ACCEPTED แล้วไม่หมดอายุ
- lookup ล้มเหลว → `QUOTATION_GATE_UNAVAILABLE` (503) ไม่ใช่ปล่อยผ่าน
- รางสลิป: `assertQuotationAcceptedForPhase1Slip` เรียกด่านนี้แทนตรรกะเดิม (ตัด fail-open ออก) · รางบัตร: `createCheckoutForApplication` เรียกด่านนี้ **หลัง** ตรวจเจ้าของ/สถานะ และ **ก่อน** `adapter.assertReady()` และก่อนแตะ DB
- `PAYABLE_STATES.M1` ตัด `DRAFT` ออก (ใบเกิดตอนออกจาก DRAFT) · ต่ออายุ (renewal): ใบเสนอราคาต้องถูกออกตอน renewal-service สร้างคำขอ — plan ต้องพิสูจน์ว่าออกจริง (UNVERIFIED วันนี้) มิฉะนั้นด่านจะบล็อกการต่ออายุทุกใบ

### 3.2 ภาพนิ่งตอนยอมรับ + ผูกกับรายการชำระ (R2)

Migration expand (ตาม guidance §4 expand-before-contract):
- `quotations.acceptedSnapshot Json?` — สิ่งที่ผู้ขอเห็น ณ วินาทีกดยอมรับ: `{ quotationNumber, issuerType, scopeCount, currency:'THB', installments:[{phase, stateAmount, platformAmount, vatAmount, phaseTotal}], subtotal, vat, totalAmount, validUntil, feeTable:{ phase1RatePerScope, phase2RatePerScope, platformRate, vatRate } , renderedAt }` (ตัวเลขเป็นสตริงทศนิยม 2 ตำแหน่ง)
- `quotations.acceptedSnapshotHash String?` — sha256 ของ canonical JSON (เรียงคีย์) · `quotations.acceptedBy String?` (มีแล้วใน updatedBy — เพิ่มคอลัมน์ชัดเจน) · `quotations.phase1InvoicedAt DateTime?`, `phase2InvoicedAt DateTime?`
- `checkout_orders.quotationId String?` (+ index) และ `checkout_orders.quotationSnapshotHash String?`
- `markQuotationAccepted(id, { acceptedBy, snapshot })` คำนวณ hash เอง · ภาพนิ่งสร้างจาก **แถวในฐานข้อมูล** (installments ที่แช่ไว้) ไม่ใช่จากการคำนวณสด — และ API/PDF ใบเสนอราคาต้องเรนเดอร์จากแถว ไม่ใช่คำนวณใหม่ (ปิดช่องทาง C ของ `synthesis.md` §3.3 สำหรับเอกสารที่แสดง; `routes/api/applications/quotations.js:163` และ `services/pdf/invoice-template-service.js:1021` เปลี่ยนไปอ่านแถว)
- `createCheckoutForApplication`: หลังด่าน 3.1 คำนวณ breakdown สดตามเดิม แล้ว **เทียบกับ snapshot ของงวดนั้น** (dtamFeeAmount = stateAmount, platformFeeNet, platformFeeVat, totalPayableAmount = phaseTotal) — ต่างกัน → `CHECKOUT_PRICE_DRIFT` (409) + `logger.error` + แถวใน `audit_logs` (action `CHECKOUT_PRICE_DRIFT`) · ไม่สร้าง order · **ไม่มีการเปลี่ยนสูตรราคาใด ๆ** (ยอดที่เก็บได้จริงยังมาจาก fee-service เหมือนเดิม; ด่านนี้แค่ปฏิเสธเมื่อไม่ตรงกับที่ตกลง)
- order ที่สร้างสำเร็จบันทึก `quotationId` + `quotationSnapshotHash`

### 3.3 settlement ปิดใบ (best-effort หลัง commit, กำกับด้วยงวด)

- ใน `settleFromPaymentIntent` **หลัง** `$transaction` commit (`:313` เป็นต้นไป) เรียก `quotationService.recordPhaseInvoiced({ quotationId: order.quotationId ?? lookup by applicationId, milestone, invoiceNumber, at: settledAt })`:
  - เขียน `phase1InvoicedAt` หรือ `phase2InvoicedAt`
  - เมื่อ **ทุกงวดของใบ** มี invoicedAt (2 งวด; renewal = งวดเดียว) → `status = INVOICED`
  - ใบที่ไม่อยู่ใน {ACCEPTED, INVOICED} (แถวเก่าก่อนด่าน) → ไม่เปลี่ยนสถานะ เขียนแค่ invoicedAt + `logger.error('[checkout-settle] quotation not accepted at settlement', …)`
- ห้ามโยนออกจาก `settleFromPaymentIntent`: try/catch → `logger.error` + `audit_logs` action `QUOTATION_CLOSE_FAILED` · เงิน/ใบเสร็จ/สถานะคำขอไม่ย้อนกลับ
- probe อ่านอย่างเดียว `scripts/probes/quotation-closure.js`: รายการ order SETTLED ที่ใบยังไม่มี invoicedAt ของงวดนั้น = 0 บนทะเบียนที่ถูกต้อง

### 3.4 ออกใบตอนยื่น: รอผล ล้มดัง (R3)

- `routes/api/applications/applications.js:1211` และ `application-review-revision-methods.js:317`: `await` การออกใบ; ล้มเหลว → `logger.error` + `audit_logs` action `QUOTATION_ISSUE_FAILED` + notification ถึง admin queue + response ของ submit มี `quotation: { issued:false, error:'QUOTATION_ISSUE_FAILED' }` (สถานะคำขอที่เขียนไปแล้วไม่ย้อนกลับ)
- self-heal ที่ควบคุม: `GET /api/applications/:id/quotations` เมื่อคำขอพ้น DRAFT แล้วและไม่มีใบ → ออกใบแบบ idempotent พร้อม `notes: 'ISSUED_LATE: <reason>'` และ `audit_logs` — **ข้อจำกัดที่ยอมรับ:** ราคาของใบที่ออกช้าคืออัตรา ณ เวลานั้น (ตารางอัตราไม่มี effective date — `config/business-rules.js:112-154`; หนี้แยกใบ ไม่แก้ที่นี่)

### 3.5 หน้าจอ

- **wizard slot 10** (`invoice-step.tsx`): ลบตัวสร้างเอกสารในเบราว์เซอร์ (`generateDocumentNumber`, `generateQuotationItems`, `dtamQuote` state) · เรนเดอร์ใบจริงจาก `PaymentService.getQuotations` (เลข `QT-PRD-…`, installments ต่อ scope, VAT) · ช่องติ๊ก = `POST /:issuerType/accept` · ไม่มีใบ → สถานะรอ "ระบบกำลังออกใบเสนอราคา" + ปุ่มรีเฟรช · ผ่านได้เมื่อ ACCEPTED
- **หน้าชำระเงิน** (`app/health/payments/client-view.tsx:388`): ปุ่ม "ชำระเงินออนไลน์" แสดงเมื่อมีหนี้ **และ** ใบ ACCEPTED/INVOICED; มิฉะนั้นแสดงข้อความชี้ไปการ์ดใบเสนอราคา
- **หน้า checkout** (`app/health/payments/checkout/`): แสดงเลขใบเสนอราคา + ยอดงวดจาก snapshot + ข้อความยินยอมเงื่อนไขการชำระเงิน (Q4) เป็นช่องติ๊กบังคับก่อนสร้าง session (ส่ง `paymentTermsAccepted: { version, acceptedAt }` ให้ backend; backend บันทึกลง `checkout_orders.paymentTermsVersion`/`paymentTermsAcceptedAt` — คอลัมน์ใหม่) · backend ปฏิเสธ `PAYMENT_TERMS_NOT_ACCEPTED` (409) เมื่อไม่มี
- ข้อความสาธารณะ/ i18n ที่พูดถึงการยอมรับ (`pricing/page.tsx:48`, `th-wizard.ts:274`) คงไว้ — ตรงกับความจริงแล้ว

### 3.6 เอกสารกฎหมาย + รหัสข้อผิดพลาด

- `docs/legal/payment-terms-th-v1.md` → v1.1 (2026-08-28): ตารางราคาต่อรูปแบบการปลูก งวด 1 = 5,885 (5,000 + 500 + VAT 385), งวด 2 = 29,425 (25,000 + 2,500 + VAT 1,925), รวม 35,310; ต่ออายุ 35,310; ระบุว่า VAT 7% คิดบนค่าบริการทั้งก้อนตามมติ W14 · ข้อความยินยอมอ้าง version `payment-terms-th-v1.1`
- `shared/error-codes.js`: `QUOTATION_NOT_ACCEPTED` httpStatus 409, ข้อความครอบทั้งสองราง, source ชี้ `services/billing/quotation-gate.js` · เพิ่ม `QUOTATION_NOT_ISSUED`, `QUOTATION_EXPIRED`, `QUOTATION_GATE_UNAVAILABLE`, `CHECKOUT_PRICE_DRIFT`, `PAYMENT_TERMS_NOT_ACCEPTED`, `QUOTATION_ISSUE_FAILED`
- **ข้อความ "ยกเว้น VAT ม.77/1(10)" บนเอกสาร** (`stripe-checkout-service.js:260` และอีก ≥8 จุด): **ไม่แก้ในงานนี้** — รอคำตอบที่ปรึกษาภาษี (ledger F-G4-67) เพราะแตะความหมายทางภาษีของใบกำกับภาษีที่ออกไปแล้ว

### 3.7 ซ่อมแถวเดิม (R5) — `apps/backend/scripts/close-quotations-settled-before-gate.js` (dry-run default, `--apply --expect=2`)

- เงื่อนไข: ใบ PENDING ที่คำขอมี `checkout_orders` SETTLED ครบทุกงวดที่ใบตั้งราคา → เขียน `phase1InvoicedAt/phase2InvoicedAt` = `settledAt` ของ order แต่ละงวด, `status = INVOICED`, `notes += 'CLOSED_BY_REPAIR 2026-08-xx F-G4-64: settled via checkout before the acceptance gate; no acceptance recorded'`, `acceptedAt` คงเป็น null, `acceptedSnapshot` null
- คาดหมาย: QT-PRD-2026-000001 (A1), QT-PRD-2026-000002 (A3/B) · QT-PRD-2026-000003 (A4) ไม่แตะ
- A2 (`29422e73`, E5960D): ไม่สร้างอะไร · ledger F-G4-68 บันทึก "ไม่มีเอกสารตั้งราคาสำหรับ 35,310 บาท (TAX-PRD-2026-000003/4)"
- FE: ใบสถานะ INVOICED ที่ `acceptedAt` null แสดงป้าย "ออกใบแจ้งหนี้แล้ว (ชำระก่อนมีขั้นตอนยอมรับ)" ไม่มีปุ่มยอมรับ

## 4. ผลต่อ walk และเทสต์

- a03 (M1) ต้องกด "ยอมรับใบเสนอราคา" บนหน้าชำระเงินก่อนกด "ชำระเงินออนไลน์" และติ๊กเงื่อนไขการชำระเงินบนหน้า checkout · a05 (M2) ไม่ต้องยอมรับซ้ำ แต่ต้องติ๊กเงื่อนไข · เพิ่ม C07: คำขอ A4 (`ffeca61c`, PENDING_DOC_FEE, ใบ PENDING) กด "ชำระเงินออนไลน์" ก่อนยอมรับ → ถูกปฏิเสธด้วยข้อความไทย; ยอมรับแล้ว → ผ่าน (ไม่จ่ายจริงใน C07)
- RED-first (ชั้น C): (1) สร้าง checkout session ได้ทั้งที่ใบ PENDING (พิสูจน์ช่องปัจจุบัน) (2) ไม่มีใบ → สร้างได้ (fail-open) (3) `markQuotationInvoiced` โยนใน tx → invoice ไม่ paid + DEAD_LETTER (พิสูจน์กับดัก) (4) snapshot ต่างจาก breakdown → ยังสร้างได้ (5) settlement ไม่แตะใบ (6) slot 10 ยอมรับเอกสาร 30,000 โดยไม่เรียก backend
- ชุดที่จะพังและต้องแก้ในใบเดียวกัน: `stripe-checkout-engine.test.js` (mockDb ไม่มี `quotation`), `checkout-vat-line-names-its-base.test.js`, `checkout-renewal-price.test.js`, `settle-event.test.js`, `settlement-binds-receipt-number-to-invoice.test.js`, `settlement-reconcile.test.js`, `quotation-gate-phase1-slip.test.js`, e2e `a03`, `a05`
- money-equation / ratchet: ไม่มีสูตรเปลี่ยน; ตัวนับ hardcode/todo/env-direct ต้องไม่ขึ้น

## 5. สิ่งที่งานนี้ไม่แก้ (ledger)

- F-G4-67 (TALK, ที่ปรึกษาภาษี): ม.77/1(10) vs ม.81(1)(ท) บนใบกำกับภาษี 6 ใบที่ออกแล้ว; ฐาน VAT; `dtam_remittance_status` PENDING 6 ใบ
- F-G4-68 (บันทึก): A2 ไม่มีเอกสารตั้งราคา
- F-G4-69 (OPEN): ตารางอัตราไม่มี effective date (`business-rules.js:112-154`) — ใบที่ออกช้าใช้อัตราปัจจุบัน
- F-G4-70 (OPEN, L3): checkout ไม่ส่ง `options.scopeCount` (`stripe-checkout-service.js:118-126`) — ด่าน R2 จะทำให้ความต่างโผล่เป็น `CHECKOUT_PRICE_DRIFT` แทนการเก็บเงียบ แต่การแก้แหล่งนับ = มติเงินแยกใบ
- ถ้อยคำ ป.พ.พ. (ม.357/359/361/366) และ ISO §7.7.3(c) ยัง UNVERIFIED — ห้ามใช้ในสัญญาก่อนนักกฎหมายตรวจ
