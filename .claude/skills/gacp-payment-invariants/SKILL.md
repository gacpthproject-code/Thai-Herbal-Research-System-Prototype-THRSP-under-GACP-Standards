---
name: gacp-payment-invariants
description: กติกาเหล็กของระบบเงิน GACP — ค่าบริการก้อนเดียว, สมการเงิน, SETTLED มาจาก webhook เท่านั้น, Stripe SDK ไฟล์เดียว, idempotency, ผู้ออกเอกสารรายเดียว. Use when reading or changing anything about fees, VAT, invoices, receipts, checkout orders, Stripe, or webhooks, or when a money number appears in code, test, or report.
---

# GACP Payment Invariants

**หมายเหตุการอ้างอิงในไฟล์นี้**: อ้างด้วยชื่อ const/function/object-key/probe เท่านั้น
ไม่อ้างเลขบรรทัด (เลขบรรทัดขยับทุก commit — ใช้ `grep -n "<symbol>"` เพื่อหาบรรทัดจริงเสมอ)

## กฎเหล็กข้อ 0 — agent ห้าม mutate เงิน

CLAUDE.md หัวข้อ "ขอบเขตที่ห้ามข้าม" (แก้เงินจริง, refund, live payment key = operator) และชั้น C (เงิน):
**อ่าน / flag / เสนอ diff เท่านั้น** ห้ามรัน migration เงิน ห้ามแก้ยอด ห้าม settle/refund/remit เอง ·
เจอปัญหาเงินให้หยุดแล้วรายงาน · ยังไม่มี probe `money-write-guard` (ไม่มีแถวใน `probe-registry.txt`)
⇒ ตัวบังคับคือวินัย + code review

`scripts/probes/tier-check.sh` จัดไฟล์เงิน (`business-rules.js`, `payment-fees.js`,
`invoice-issuers.js`, `payment-service.js` ฯลฯ) เป็น C ตาม token ในชื่อไฟล์ — เชื่อ output ที่รันจริง
และไม่ว่า tier-check จะคืนชั้นใด **ทุก money-path change = operator merge** (CLAUDE.md ชั้น C)

## เมื่อไรใช้

- แตะ fee / VAT / invoice / receipt / checkout / Stripe / webhook
- เห็นตัวเลขเงินในโค้ด test หรือรายงาน แล้วต้องรู้ว่าถูกหรือเปล่า
- จะเขียน test ที่ assert ยอดเงิน
- จะเพิ่มไฟล์ที่ import `stripe` หรือเขียนสถานะ `SETTLED`

## ค่าบริการก้อนเดียว

operator สั่งเลิกแยกค่าธรรมเนียมรัฐกับค่าบริการ 2026-09-11 (memory
`one-service-fee-no-split`) — อัตราที่ประกาศ **คือค่าบริการเอง** ไม่มี govFee ·
กระเป๋าสองใบที่เคยแยกส่งกรม/บริษัทถูกถอดไปด้วยในมติเดียวกัน · ฝ่ายการเงินทั้งสองฝั่ง
(`FINANCE_OFFICER_DTAM`/`FINANCE_OFFICER_PLATFORM` — ดูสกิล `gacp-workflow-rules`)
อ่านตัวเลขชุดเดียวกันจากแหล่งเดียวกันนี้ ไม่มีเลขคนละชุดให้กระทบยอดกันเองอีกแล้ว — นี่คือ
เจตนาของมติ ไม่ใช่แค่ผลข้างเคียงจากการยุบกระเป๋า

เอกสารการเงินและยอดชำระเป็นค่าบริการก้อนเดียวเสมอ · การ**แสดง**ส่วนแบ่งกรม/แพลตฟอร์มได้รับอนุญาตสองที่:
หน้าราคาแสดงค่าตรวจของกรม 5,000/25,000/30,000 + ค่าแพลตฟอร์ม 500/2,500/3,000 (คำสั่ง 38, memory
`fee-line-descriptions-2026-10-03`) และหน้าหลังบ้านแสดงลูกค้าจ่าย/ส่วนกรม/ส่วนแพลตฟอร์ม (คำสั่ง 58, memory
`finance-is-display-books-offline`) · ต้องอ่านจากตารางที่มีวันกำกับ ห้ามฝังตัวเลข และห้ามไหลกลับไปเป็นบรรทัดบนเอกสาร ·
ยังไม่ได้สร้างทั้งสองที่ (ตรวจ 2026-11-03: ไม่มี `dtamShare`/`platformShare` ในโค้ด หน้า `(marketing)/pricing` ยังไม่แสดง)

| งวด | ค่าบริการ | VAT 7% | รวมเรียกเก็บ |
|---|---|---|---|
| งวด 1 (เอกสาร, ต่อรูปแบบการปลูก) | 5,500 | 385 | **5,885** |
| งวด 2 (ภาคสนาม, ต่อรูปแบบการปลูก) | 27,500 | 1,925 | **29,425** |
| ต่ออายุ (ต่อรูปแบบการปลูก) | 33,000 | 2,310 | **35,310** |

**อัตราจริงมีที่เดียว**: `apps/backend/config/business-rules.js` → `FEE_DEFAULTS`
(`PHASE1_PER_SCOPE` / `PHASE2_PER_SCOPE` / `RENEWAL_PER_SCOPE` / `VAT_RATE`) — คุมโดย
probe **`fee-single-source`** (`scripts/probes/fee-single-source.sh`, ตัววัดของ GOALS.md G1
ข้อ 1) ไม่ใช่ domain `fee-table` ใน `ssot-domains.txt` (regex ของ domain นั้นยังเขียน
ชื่อเก่า `RENEWAL_PER_CERT` ซึ่งไม่ตรงกับ `RENEWAL_PER_SCOPE` ที่โค้ดใช้จริง — แปลว่าถ้ามีใคร
เพิ่ม literal `RENEWAL_PER_SCOPE` ที่ไฟล์ที่สอง domain นี้จะ**ไม่จับ** ห้ามเข้าใจว่า
`ssot-domains.txt` คุม renewal ไว้แล้ว ตัวที่คุมจริงคือ `fee-single-source.sh`)

- `payment-fees.js` เป็นแค่ **view** ที่ derive จาก `business-rules.js` (comment หัวไฟล์:
  "THE TARIFF HAS ONE HOME, AND IT IS NOT THIS FILE") ห้ามเขียนตัวเลขซ้ำที่นั่น
- ในไฟล์ไม่มีตัวเลขค่าธรรมเนียมเลย (รวม comment) — เทส `payment-fees-no-dead-literals.test.js` คุมไว้
- **VAT คิดจากค่าบริการทั้งก้อน** ไม่มีส่วนที่ยกเว้น VAT อีกแล้ว — ผู้ออกเอกสารรายเดียว
  เสียภาษีเต็มยอด (`payment-fees.js` → `phaseAmounts()`)
- `computePhaseBreakdown(phase)` คืน `lineItems` **2 บรรทัด** เท่านั้น: ค่าบริการ + VAT
  — ไม่มีบรรทัดที่ 3 ของฝั่งรัฐอีกแล้ว บริษัทเก็บเงินแล้วนำส่งกรมนอกระบบนี้ (comment
  ในฟังก์ชันเดียวกัน: "กระเป๋าเดียว: เกษตรกรจ่ายบริษัท และบริษัทกระทบยอดกับกรมนอกระบบนี้")
- ไม่มี Phase 3 — ไม่เก็บค่าออกใบรับรอง (header comment บนหัวไฟล์)
- renewal คิดครั้งเดียวต่อรูปแบบการปลูก ไม่แยก 2 งวดแบบใบสมัครใหม่ (`FEE_DEFAULTS.RENEWAL_PER_SCOPE`
  comment ใน `business-rules.js`)

## สมการเงิน (probe `money-equation`)

ทุกแถวใน `checkout_orders` ต้องเป็นจริงพร้อมกันสองข้อ (`scripts/probes/money-equation.sh`,
near ตัว SQL `SELECT count(*) FROM checkout_orders WHERE ...`):

```
platform_fee_gross   = platform_fee_net + platform_fee_vat
total_payable_amount = platform_fee_gross        (ยกเว้นแถว CANCELLED)
```

ทั้งสองข้อเป็น CHECK ในฐานข้อมูลด้วย (migration `20260929155037_drop_dtam_remittance_schema`
ซึ่งดรอป `dtam_fee_amount`) · ข้อยกเว้น CANCELLED มีเหตุเดียว: order ที่ถูกยกเลิกก่อน 2026-09-11
ยังเก็บส่วนของกรมฯ ไว้ใน `total_payable_amount` (ไม่มีการเขียนยอดใหม่) และ order CANCELLED ไม่ได้เก็บเงิน ·
order เก่าแบบนั้นจะถูกเปลี่ยนเป็น SETTLED ไม่ได้ (CHECK ปฏิเสธ — พิสูจน์ใน
`__tests__/integration/dtam-schema-drop-migration-real-postgres.test.js`)

probe เป็น `manual` **ถาวร** ใน `scripts/probes/probe-registry.txt` (แถว `money-equation`)
เพราะต้อง sample แถวจริงจาก DB — ห้ามรันใน CI (ไม่มี CI แล้วตามมติ operator — ทุก probe
รันผ่าน `local-gate.sh`/`full-gate.sh` เท่านั้น) และ **BLOCKED ตัวเองเมื่อไม่มี
`DATABASE_URL`+`psql`** ไม่ยอม PASS ลอยๆ (near ข้อความ "no vacuous pass" ใน
`money-equation.sh`)

Cross-check ชั้นก่อนหน้า: `settleFromPaymentIntent()` (`checkout-settlement-service.js`)
ตรวจ `amount_received` เทียบ satang ที่คาดไว้ **ก่อนแตะ side effect ใดๆ** ไม่ตรง = alert
ไม่ใช่การ settle (comment ในฟังก์ชัน: "AMOUNT MISMATCH — alert, not a settlement")

**หมายเหตุชื่อคอลัมน์**: `platform_fee_net`/`platform_fee_vat`/`platform_fee_gross` ยังสะกด
โมเดลเก่า ("platform" แยกจากค่าธรรมเนียมรัฐ) แต่ความหมายวันนี้คือ ค่าบริการทั้งหมด / VAT ของมัน /
รวม · `dtam_fee_amount` ถูกดรอปแล้ว (PR3, 2026-09-29) · การเปลี่ยนชื่อคอลัมน์ platform_fee_* เป็นการ
ตัดสินใจแยก (memory `one-service-fee-no-split` ข้อ 2) — อย่าเข้าใจผิดว่ามี "สองทาง" อยู่จริง
เพราะเห็นชื่อเหล่านี้

## SETTLED มาจาก webhook เท่านั้น (probe `settle-webhook-only`)

- vocabulary: `apps/backend/shared/checkout-status.js` → `CHECKOUT_STATUSES`; `SETTLED`
  เป็น terminal (`ALLOWED_CHECKOUT_TRANSITIONS.SETTLED` เป็น array ว่าง); เจตนาเขียนไว้
  ตรงๆ ในคอมเมนต์เหนือ `ALLOWED_CHECKOUT_TRANSITIONS`: "the verified webhook, and nothing else"
- ผู้เขียนค่านี้มีไฟล์เดียว: `services/checkout/checkout-settlement-service.js` →
  `settleFromPaymentIntent()` (`data: { status: 'SETTLED', ... }`)
- probe **ไม่ใช่** grep ข้อความ `status: 'SETTLED'` ตรงๆ (แบบนั้นแมตช์ทั้งเขียนและอ่าน
  เคยฟ้อง `dtam-remittance-service.js` ที่แค่**อ่าน**ใบที่ตัดเงินแล้ว — ไฟล์นั้นถูกถอดแล้ว 2026-09-29) — ตัวจริง
  (`settled_writers()` ใน `settle-webhook-only.sh`) นับเป็นการเขียนก็ต่อเมื่อเครื่องหมาย
  ล่าสุดก่อนหน้าคือ `data:` ถ้าเป็น `where:` คือการอ่าน ปล่อยผ่าน
- ฝั่ง workflow: `PENDING_DOC_FEE→DOC_FEE_PAID` และ `PENDING_AUDIT_FEE→AUDIT_FEE_PAID`
  เป็นของ `ROLE_TRANSITIONS[CANONICAL_ROLES.SYSTEM]` เท่านั้น (ดูสกิล `gacp-workflow-rules`)
- settle เป็น **transaction เดียว** ใน `settleFromPaymentIntent()` ครอบ order → invoice →
  journal entry (`recordPaymentEntry()`) → **เอกสารเดียว** (`tx.checkoutDocument.create()`,
  `documentType: 'PLATFORM_TAX_INVOICE'` — W14: "the ONE settlement document ... The DTAM
  disbursal receipt is not issued") → ปลดล็อก workflow (`writeApplicationStatus()`)
- การลงสมุดรายวันอัตโนมัติ (`recordPaymentEntry()`) ยังอยู่ในโค้ด แต่มติคำสั่ง 64 ค9 ให้ถอด (ยังไม่ทำ) ห้ามต่อยอด ·
  ระบบเป็นการเรียกเก็บ + กระทบยอด + ส่งออกให้ผู้ทำบัญชี ไม่ใช่บัญชีเต็มรูป (คำสั่ง 59): ประตูลงบัญชีด้วยมือ ใบกำกับภาษีซื้อ
  และปิดงวดถูกถอดแล้ว (`ac73b497a`, `4fa34cb59`)
- **เงินที่เข้าแล้วต้องถูกบันทึกเสมอ** (รีวิวความปลอดภัย 2026-10-06 N1): ก่อนปลดล็อก settle ถาม
  `unpaidMilestonesBefore()` ของตัวเขียนสถานะ ถ้างวดก่อนหน้ายังไม่จ่าย (เช่น M2 เข้าหลัง M1 ถูกคืนเงิน)
  order/invoice/journal/ใบกำกับภาษียัง commit ครบ สถานะคำขอคงเดิม แล้วหลัง commit เขียน audit
  `SETTLEMENT_STATUS_REFUSED` (CRITICAL) + แจ้งเตือน `SETTLEMENT_STATUS_REFUSED` ถึง platform staff ·
  event เป็น `PROCESSED` ไม่ retry · กฎสถานะห้ามทำให้เงินที่เก็บแล้ว rollback
- ประตู checkout ปฏิเสธ M2 ก่อนสร้างแถวหรือเรียก gateway เมื่อ M1 ยังไม่จ่าย (`MILESTONE_NOT_PAID` 409)
  ด้วย predicate เดียวกับตัวเขียน (`unpaidMilestonesBefore` ของ `SETTLED_TARGET_STATE[milestone]`)
  คำขอต่ออายุไม่มี M1 จึงผ่าน
- ทั้ง `settle-webhook-only` และ `webhook-idempotent` **รันใน CI แล้ว** (`ci` column ใน
  `probe-registry.txt`) — ข้อยกเว้นชั่วคราวถูกปลดไป 2026-09-11 ("operator: ทำให้ถูกต้อง
  ไม่มีการยกเว้น") "CI" ที่นี่หมายถึง `probe-gate.js` รันตอน `local-gate.sh`/`full-gate.sh`
  ไม่ใช่ hosted GitHub Actions (ไม่มีแล้วตามมติ operator, memory `no-ci-by-operator-decision`)

## การคืนเงิน — สองชนิดเท่านั้น (คำสั่ง 22, operator 2026-10-06)

ระบบไม่โอนเงินคืนเอง บริษัทโอนนอกระบบ แล้วฝ่ายการเงินบันทึกที่ `services/refund-service.js`
ซึ่งออกและ post ใบลดหนี้ใน transaction เดียวที่ล็อกแถว invoice แล้วแถว application (`FOR UPDATE` ลำดับเดียวกับ settlement) ·
ชนิดอยู่ที่ `shared/refund-kinds.js` → `REFUND_KINDS` · ผู้บันทึกได้มีบทบาทเดียวคือ `finance_officer_platform` ในองค์กรของ invoice
(เงินคืนเป็นเงินบริษัท ไม่มีบทบาทฝั่งกรมบันทึก) · การอ่านสถานะคืนเงินผ่าน `organizationScope` ไม่ข้ามองค์กร

| ชนิด | ประตู | ยอด | ผล |
|---|---|---|---|
| `DUPLICATE` เก็บซ้ำ/เกิน (เงื่อนไข v1.3 ข้อ 7.3) | `POST /api/finance/refunds/:invoiceId/duplicate-charge` `{ amount, idempotencyKey }` | เฉพาะส่วนเกินจริง > 0 ทศนิยมไม่เกิน 2 ตำแหน่ง: เงินที่ gateway settle ของงวดนั้น (order `SETTLED`) ลบยอด invoice ลบ `DUPLICATE` ที่บันทึกแล้วของงวดนั้น · ชำระครั้งเดียว = ไม่มีส่วนเกิน = 409 | บันทึกใน `metadata.duplicateChargeRefunds` · งวดยังชำระแล้ว · สถานะคำขอไม่ขยับ · ใบลดหนี้ `CORRECTION` |
| `PROVIDER_CANCELLED` บริษัทหรือรัฐยกเลิกบริการ (เงื่อนไข v1.3 ข้อ 7.2) | `POST /api/finance/refunds/:invoiceId/provider-cancellation` `{ reasonCode, note }` | ทั้งหมดที่ยังคืนได้ | บันทึกใน `metadata.refund` (ที่ `isInvoicePaid` อ่าน ⇒ งวดนี้ไม่ถือว่าชำระ) · คำขอปิดเป็น `CANCELLED` ผ่าน status writer (SYSTEM) · ใบลดหนี้ `CANCELLATION` |

- `PROVIDER_CANCELLED` ต้องมีเหตุจาก `PROVIDER_CANCELLATION_REASONS` (สี่ข้อ) + บันทึกรายละเอียด ≥ 10 ตัวอักษร
  ใบลดหนี้พิมพ์เฉพาะเหตุจากรายการ บันทึกของเจ้าหน้าที่อยู่ใน `metadata.refund.note` เท่านั้น ไม่ไปถึงผู้ยื่น
  งวดที่เหตุแต่ละข้อยกเลิกได้อยู่ในตารางเดียว `PROVIDER_CANCELLATION_REASON_MILESTONES` (`shared/refund-kinds.js`) ที่ refund-service อ่าน
  และแบบฟอร์มเว็บใช้ฉบับสะท้อนเสนอเฉพาะเหตุของงวดของใบแจ้งหนี้ (ตรึงด้วย `frontend-refund-kinds-mirror`)
  เหตุ (ง) `COMPANY_CANNOT_INSPECT` ใช้ได้กับงวดที่ 2 เท่านั้น และบันทึก `inspectionDeadline` = วันชำระงวดที่ 2 + จำนวนวันทำการตาม
  `PAYMENT_TERMS_VERSIONS[<รุ่นที่ประทับบน order>].companyInspectWorkingDays` อ่านผ่าน `companyInspectionDeadline(paidAt, termsVersion)`
  (`shared/refund-kinds.js` · v1.3 = 60 วันทำการ เวลากรุงเทพฯ · รุ่นก่อน v1.3 เป็น `null` = เหตุ (ง) ใช้ไม่ได้)
  และงวดต้อง**ยังไม่เริ่ม** (ข้อ 7.2.3): M1 เฉพาะ `DOC_FEE_PAID` · M2 เฉพาะ `AUDIT_FEE_PAID`/`AUDIT_CONFIRMED` ที่ยังไม่มี
  บันทึกหน้างานใด ๆ (`m2ServiceStarted` ใน `refund-service.js`: ข้อมูลใน `formData.auditExecution`, `auditDecisions`,
  `reinspection`, คอลัมน์ `auditResult`, หรือรายการตรวจที่ตัดสินแล้ว มีคำตอบ หรือมีรูป) — สถานะอย่างเดียวบอกไม่ได้
  เพราะการนัดลงพื้นที่ซ้ำพาคำขอที่ตรวจไปแล้วกลับมา `AUDIT_CONFIRMED` (รีวิวความปลอดภัย 2026-10-09 F2) — นอกนั้น `REFUND_SERVICE_ALREADY_STARTED`
- ผู้ยื่นขอยกเลิกเอง และการยกเลิกเพราะระบบผิดพลาด **ไม่มีชนิดคืนเงิน** (ไม่คืน · ระบบผิดพลาดให้กู้คำขอคืน)
- ทุกใบลดหนี้อยู่ใต้กติกาใบลดหนี้: ยอด invoice ลบใบลดหนี้ ISSUED/POSTED ทุกใบ แยก subtotal และ VAT
  (`credit-note-service.creditableRemainder`) · `DUPLICATE` มีเพดานส่วนเกินจริงซ้อนอีกชั้น และแยก VAT ตามสัดส่วนของ invoice เอง
- คำขอที่ CANCELLED พร้อมการคืนเงินแบบ `PROVIDER_CANCELLED` เปิดกลับไม่ได้ทั้ง force-status และ revert-last-transition
  (`APPLICATION_REFUNDED_CANCELLED`) · revert ใช้กติกาเป้าหมายต้องห้ามชุดเดียวกับ force-status (`REVERT_TARGET_FORBIDDEN`)
- การเริ่มตรวจแปลงและการมอบหมายผู้ตรวจเอกสารเขียนแบบมีเงื่อนไขสถานะ (`expectedStatus`) ถ้าการยกเลิกพร้อมคืนเงินชนะก่อน ได้ 409 `APPLICATION_STATE_CHANGED`
- ประตูเดิม `/initiate` (คืนเต็มใบ) และ `/cancel` ถูกถอดแล้ว
- ข้อความเหตุสี่ข้อใน `PROVIDER_CANCELLATION_REASONS` = ข้อ 7.2.1 ของเงื่อนไข v1.3 ทุกตัวอักษร (เทสต์ `refund-notices-follow-payment-terms`)
  ฝั่งเว็บ `constants/refund-kinds.ts` สะท้อนค่าเดียวกัน และหน้าราคา/หน้าชำระเงินอ่านจากชุดนี้ ห้ามพิมพ์ซ้ำที่อื่น
- แจ้งผู้ยื่นแยกตามชนิด: `REFUND_DUPLICATE_CHARGE` และ `REFUND_PROVIDER_CANCELLED` (`notification-fanout-service`) ใช้ "ท่าน" ขึ้นต้นด้วยคำขอโทษ
  ระยะโอน `REFUND_TRANSFER_WORKING_DAYS` และอีเมล `REFUND_CONTACT_EMAIL` มาจาก `shared/refund-kinds.js` ที่เทสต์ตรึงกับข้อ 7.4 และ 11.1

## Stripe SDK ไฟล์เดียว (probe `stripe-sdk-isolated`)

`require('stripe')` อนุญาตที่ **`apps/backend/services/payment/stripe-adapter.js`**
ไฟล์เดียว (ไม่นับ `__tests__`) — probe แถว `stripe-sdk-isolated` ใน `probe-registry.txt`
รันทุกครั้งที่ `local-gate.sh`/`full-gate.sh` ทำงาน (ไม่มี PR runner แยก — ไม่มี CI ตามมติ
operator) โค้ดอื่นคุยผ่าน interface ใน `services/payment/payment-adapter.js`

## โหมดทดลอง/จริง: คีย์ของ adapter บอกโหมดของวันนี้ · เงินที่เข้าแล้วบอกโหมดของตัวเอง (คำสั่ง 105(3), operator 2026-10-21)

- แหล่งเดียว: `getPaymentMode()` ใน `services/payment/payment-adapter.js` · `TRIAL` เมื่อ adapter ไม่ใช่ `stripe`
  หรือคีย์ลับไม่มี เป็น test หรืออ่านโหมดไม่ออก · `LIVE` เมื่อคีย์ลับ (`sk_`/`rk_`) เป็น live เท่านั้น
  (`stripe-adapter.js` → `paymentMode()`) · publishable key ไม่มีผล · ห้ามเพิ่มธงตั้งเองที่แยกจากคีย์
- คำและค่าคงที่อยู่ที่ `shared/payment-mode.js` (`TRIAL_COPY`, `TRIAL_RECEIPT_NOTICE`) · เว็บไม่พิมพ์ข้อความเอง
  อ่านจาก `GET /api/payments/mode` (ไม่ต้องล็อกอิน, `Cache-Control: no-store`, ส่งข้อความชุดเดียวกันทั้งสองโหมด
  เพราะจอบนคีย์ live ยังต้องประทับเอกสารที่ settle ในโหมดทดสอบ)
- **โหมดของเงินที่เข้าแล้วบันทึกตอน settle**: `settleFromPaymentIntent` เขียน `invoice.metadata.livemode` จาก `livemode`
  ของ PaymentIntent ของ Stripe ในธุรกรรมเดียวกับเลขใบเสร็จ (intent ที่ไม่บอกว่า live เช่น mock = ไม่ live) ·
  อ่านด้วย `settledPaymentMode(invoice)` เท่านั้น: `null` ก่อนเงินเข้า (`paidAt` ว่าง) · ไม่มีบันทึก = `TRIAL`
  (settle ก่อนมีบันทึกทั้งหมดเป็นโหมดทดสอบ) · ห้ามตัดสินตราของเอกสารที่เงินเข้าแล้วจาก `getPaymentMode()`
- ทุกการอ่านที่ป้อนเอกสารหรือจอต้อง select `paidAt` + `metadata` ของใบแจ้งหนี้ (ใบลดหนี้/ใบเพิ่มหนี้ใช้
  `DOCUMENT_ORIGINAL_INVOICE_SELECT` ภายในเท่านั้น) · `metadata` ไม่ออกจาก server: รายการส่ง `paymentMode` แทน
- PDF การเงินทุกใบผ่าน `renderTemplateToPdf` → `withTrialMark` จุดเดียว (ใบเสนอราคา ใบวางบิล ใบเสร็จ/ใบกำกับภาษี
  ใบลดหนี้ ใบเพิ่มหนี้) · ใบที่มีเงินเข้าแล้วประทับตาม `settledPaymentMode` (ใบลดหนี้/ใบเพิ่มหนี้ตามใบแจ้งหนี้ต้นทาง)
  ใบที่ยังไม่มีเงินเข้าตามคีย์ · ตราเป็น `position:fixed` ไม่กินพื้นที่ จึงไม่ทำให้เอกสารหนึ่งหน้าล้นหน้า
  (`invoice-documents-fit-one-page`, `finance-paper-text-inside-print-margin`)
- เว็บ: `TrialPaymentNotice` บนหน้าชำระเงิน รายการชำระเงิน สรุปยอด เอกสารทางการ และกล่องชำระสำเร็จ ·
  `TrialMarkedDocument` ครอบเอกสารบนจอ (ใบเสนอราคา การ์ดใบเสนอราคา รายละเอียดใบแจ้งหนี้/ใบเสร็จ หน้าต่างของฝ่ายการเงิน) ·
  ตอบไม่ได้ (`UNKNOWN`) = ไม่วาดอะไร ห้ามเดาว่าเป็นทดลอง · เอกสารของแถวที่เงินเข้าแล้วส่ง `settledMode={row.paymentMode}`
  ประกาศหน้า (`TrialPaymentNotice`) ยังตามคีย์
- แจ้งเตือน "ชำระสำเร็จ ออกใบเสร็จแล้ว" ต่อท้าย `TRIAL_RECEIPT_NOTICE` ตามโหมดของเหตุการณ์เงินนั้น (ทาง heal อ่านบันทึก)
- แจ้งเตือนคืนเงินสี่ฉบับต่อท้าย `TRIAL_REFUND_NOTICE` (ช่อง `smsTH` ใช้ `TRIAL_REFUND_SMS`) เมื่อเงินที่คืนเก็บในโหมดทดสอบ
  และไม่บอกให้รอโอนหรือส่งเลขบัญชีในกรณีนั้น · ฉบับไม่มียอดคง `paymentMode` ไว้
- ใบที่ settle ในโหมดทดสอบแล้วพิมพ์ซ้ำหลังสลับเป็นคีย์ live ยังมีตรา (แก้ข้อจำกัดเดิมเมื่อ 2026-10-29) ·
  การล้างข้อมูลการเงินทดลองตามคำสั่ง 105(1) ยังเป็นเรื่องที่ operator ตัดสิน
- สลับเป็นเงินจริง (operator สั่งแยก): ตั้งคีย์ live คู่กัน → restart backend → `GET /api/payments/mode` ต้องตอบ `LIVE`

## Idempotency — 3 ชั้น

1. **PaymentIntent**: idempotency key `` `checkout:${orderId}` `` ส่งเข้า adapter ทั้งสองจุด
   ใน `services/checkout/stripe-checkout-service.js` → `createCheckoutForApplication()`
   ⇒ กดซ้ำได้ intent เดิม
2. **Webhook event**: `routes/api/webhooks/stripe.js` → `router.post('/stripe', ...)` —
   insert-first dedup บน Stripe event id (`prisma.stripeWebhookEvent.create()`) ก่อน
   ประมวลผล · ล้มเหลว (ที่ไม่ใช่ P2002) คืน 500 เพื่อให้ Stripe ส่งซ้ำ
3. **Settlement**: `settleFromPaymentIntent()` — order ที่ `SETTLED` แล้ว = no-op สำเร็จ
   (`if (order.status === 'SETTLED') { ... return { settled: true, alreadySettled: true }; }`)

pin ด้วย probe `webhook-idempotent` (jest `-t "redelivered event id is a 200 no-op"`)
— รันใน CI แล้วเหมือนกัน (ดูหัวข้อก่อนหน้า)

ลำดับกันชนก่อนถึงเงิน: `router.post('/stripe', ...)` ตรวจ signature ด้วย raw bytes จริง
(`req.rawBody`) + `STRIPE_WEBHOOK_SECRET` ผ่าน `adapter.verifyWebhookSignature()` — ไม่มี
rawBody = throw ก่อนถึงขั้นตรวจลายเซ็นด้วยซ้ำ

## ผู้ออกเอกสารรายเดียว (`apps/backend/config/invoice-issuers.js`)

**มีผู้ออกเอกสารเดียว** — `ISSUER_TYPES` เหลือแค่ `PLATFORM` · `DTAM` ถูกถอด 2026-09-11
พร้อมการเลิกแยกค่าธรรมเนียมรัฐ (memory `one-service-fee-no-split`)

| นิติบุคคล | เลขประจำตัวผู้เสียภาษี | เอกสารที่ออก | VAT |
|---|---|---|---|
| บริษัท พรีดิกทีฟ เอไอ โซลูชัน จำกัด (สำนักงานใหญ่) | `PLATFORM_ISSUER.taxId` = `0105568045932` | `PLATFORM_ISSUER.receiptDocumentType` = `FULL_TAX_INVOICE_RECEIPT` | `PLATFORM_ISSUER.chargesVat` = `true`, คิด 7% ของค่าบริการทั้งก้อน |

- `registrationNo` = `taxId` ค่าเดียวกัน — ในไทยเลขทะเบียนนิติบุคคล 13 หลักคือเลขผู้เสียภาษี
  (comment เหนือ `PLATFORM_ISSUER`)
- ไม่มี `GOVERNMENT_REVENUE_RECEIPT` อีกแล้ว — ทุก service type ออกเป็น
  `FULL_TAX_INVOICE_RECEIPT` ของบริษัทเดียว (`getInvoiceIssuer()`)
- **กรม (DTAM) เป็นผู้ให้การรับรอง ไม่ใช่ผู้ออกใบเสร็จ** — ชื่อ/เลขของกรมยังอยู่บน
  เทมเพลต **ใบรับรอง** เท่านั้น คนละเรื่องกับเอกสารการเงิน (header comment บนหัวไฟล์:
  "กรมเป็นผู้ให้การรับรอง ไม่ใช่ผู้ออกใบเสร็จ")
- ทุกค่า override ได้ผ่าน env (`PLATFORM_TAX_ID`, ...) — อ่านผ่าน `getInvoiceIssuer(serviceType)`
  เท่านั้น **อย่าอ่าน `PLATFORM_ISSUER` object ตรง อย่าสะกดเลขซ้ำที่อื่น**
- ที่อยู่ติดต่อบนเอกสาร `PLATFORM_ISSUER.contactEmail` = `finance@gacpth.com` (`FINANCE_CONTACT_EMAIL` ใน config/invoice-issuers.js · default gmail ส่วนตัวเดิมถูกถอด 2026-09-27) คืออีเมล
  contact ของบริษัทเองบนกระดาษการเงิน (operator 2026-09-11) — มติ 2026-09-26 (memory
  `no-email-any-channel-2026-09-26`) พูดถึงเฉพาะ 2FA/OTP และการรีเซ็ต-เปลี่ยนรหัสผ่านที่
  ย้ายไปหมอพร้อมแล้ว ไม่ได้ห้ามอีเมลที่เป็นข้อมูล/contact แบบนี้ — บรรทัดนี้จึงไม่ใช่ข้อยกเว้น
  ของกฎอะไร แต่ก็ไม่ใช่บรรทัดต้นแบบสำหรับเพิ่มที่อยู่ติดต่อแบบนี้ที่จุดอื่นโดยไม่คิด
- บริษัทเก็บเงินแล้วนำส่งกรม**นอกระบบนี้** — operator **สั่งถอด** DTAM remittance ทั้งระบบ
  2026-09-11 (AskUserQuestion ตอบ "ถอดออกทั้งระบบ (แนะนำ)", memory
  `dtam-remittance-removal-ordered`) · **โค้ดถอดแล้ว (PR1, สาขา
  chore/remove-dtam-remittance-pipeline, 2026-09-29)**: service, route `/api/finance/dtam-remittance`,
  monthly batch job + การลงทะเบียน cron, `shared/dtam-remittance-status.js`, error codes 14 ตัว
  และการเขียน `dtamRemittanceStatus: 'PENDING'` ตอน settle — ล็อกด้วย
  `__tests__/unit/dtam-remittance-pipeline-removed.test.js` · **มติ operator 2026-09-29: บริษัท
  ชำระกับกรมฯ นอกระบบ และลงบัญชีในสมุดบัญชีของบริษัทเอง — แพลตฟอร์มลงบัญชีเฉพาะค่าบริการ**
  (Dr 1110-001 / Cr 4110-001 / Cr 2131-001) ไม่มีเจ้าหนี้กรมฯ 2151-001 ไม่มีต้นทุน 5110-001
  ไม่มี `recordRemittanceToDtam`/`buildRemittanceEntryLines` ไม่มี `buildGovRemittanceReport`
  ไม่มี `stateFee` ในรายการบัญชี (PR2, สาขา chore/remove-dtam-accounting-layer — ล็อกด้วย
  `__tests__/unit/dtam-accounting-layer-removed.test.js`) · **PR3 (contract migration
  `20260929155037_drop_dtam_remittance_schema`, DESTRUCTIVE, operator merge)** ดรอปตาราง
  `dtam_remittance_batches` + คอลัมน์ `dtam_remittance_status`/`remittanceBatchId`/`dtam_fee_amount`
  และถอดตัวกัน "order ที่มีส่วนของกรมฯ" ทั้งที่ประตู checkout และ settlement (หลังดรอป order มีส่วนนั้น
  ไม่ได้ — CHECK ในฐานเป็นคนปฏิเสธ) — ล็อกด้วย `__tests__/unit/dtam-remittance-schema-dropped.test.js` ·
  migration **ปฏิเสธก่อนดรอป** เมื่อมี order `dtam_fee_amount` > 0 ที่ไม่ใช่ CANCELLED หรือ batch ที่ไม่ใช่
  OPEN — ตรวจล่วงหน้าแบบอ่านอย่างเดียวด้วย `apps/backend/scripts/ops/check-dtam-schema-drop-preflight.js` ·
  **ห้ามเขียนโค้ดใหม่ที่แยกส่วนของกรมฯ หรือเพิ่มบัญชีของกรมฯ กลับเข้าผังบัญชี**
- **ถอด order ที่ยังไม่จ่ายมีที่เดียว: `services/checkout/retire-checkout-order.js`** (PR2 review I-1) —
  webhook `payment_intent.canceled` เรียกตัวนี้: order → CANCELLED + invoice ที่ยังไม่จ่าย
  soft-delete (`deletedBy: 'system:checkout-order-retired'`, `deleteReason`) + charge PENDING → CANCELLED ใน tx เดียว
  ห้ามยกเลิก order โดยไม่ถอด invoice (ผู้ยื่นจะกดจ่ายใหม่ไม่ได้ตลอดไป) · Stripe ปฏิเสธ cancel ⇒ อ่าน intent ใหม่:
  canceled ไปต่อ / อย่างอื่น `CHECKOUT_INTENT_UNUSABLE` ไม่ส่ง error ดิบของ Stripe · `?type=gov_remittance` ⇒ 400
  `EXPORT_REPORT_TYPE_RETIRED`
- **ช่องผู้ซื้อ/ผู้รับบริการ (payer block) ตาม Entity.type — แหล่งเดียวคือ `apps/backend/utils/applicant-resolver.js`** (operator 2026-09-27): เอกสารออกในนาม entity ที่ยื่น · INDIVIDUAL = ชื่อ-นามสกุล ห้ามพิมพ์เลขบัตรประชาชนทุกรูปแบบ (พิมพ์ "-") · JURISTIC = ชื่อบริษัท + `juristicId` เมื่อผ่าน `isPrintableJuristicTaxId` · PARTNERSHIP = ชื่อห้างหุ้นส่วน + `juristicId` ตามกฎเดียวกับ JURISTIC (คำสั่ง 134) · COMMUNITY_ENTERPRISE = ชื่อวิสาหกิจชุมชน + `communityRegNo` (ใบกำกับภาษีพิมพ์เลขผู้เสียภาษีผู้ซื้อ "-") — ใบเสนอราคา/ใบวางบิล/ใบเสร็จ/ใบกำกับภาษี/ใบลด-เพิ่มหนี้/หน้าเว็บ (ผ่าน `payer` ของ quotation API) อ่านจากที่นี่เท่านั้น ห้ามมีป้ายหรือกฎเลขชุดที่สอง · select ด้วย `PAYER_ENTITY_SELECT` (ไม่มี `thaiCitizenId`)
- **PDF เอกสารการเงินไม่ถูกเก็บที่ไหนเลย** (B0 `fix/finance-read-leaks`): ทุกประตูพิมพ์ใหม่จากแถวในฐานข้อมูล · ห้ามเพิ่มการเขียนสำเนาลง storage (เดิมลง `gacp-pdfs` ซึ่ง storage แบบ local อยู่ใต้ `/uploads` ที่เสิร์ฟสาธารณะ — staging ให้ใบเสร็จแก่คนไม่ล็อกอิน 2026-10-09) · `gacp-pdfs/` ถูกจัดเป็น sensitive และ `/uploads/gacp-pdfs/…` ไม่เสิร์ฟให้ใครเลย (ไม่มีเซสชัน 401 · มีเซสชัน 404 · คำขอแบบที่อยู่เต็ม `GET http://host/uploads/…` ได้ 400 ทุกโฟลเดอร์ เพราะด่านอ่านเฉพาะเป้าหมายที่ขึ้นต้นด้วย `/uploads/` ตาม `decodeUploadsRel`) · probe `no-public-financial-pdfs` (ตรวจเครื่องจริงต้องรันด้วย root ตามหัวไฟล์ อ่านไม่ครบ = BLOCKED ไม่ใช่ PASS) · ไฟล์เก่าย้ายด้วย `apps/backend/scripts/ops/move-generated-pdfs-out-of-public.js` (เทียบที่อยู่จริงด้วย realpath และไม่ unlink ไฟล์ที่เป็นไฟล์เดียวกับปลายทาง) · ประตูของผู้ถือส่งเฉพาะช่องที่ตั้งชื่อ ไม่ใช้ deny-list: `GET /api/invoices/my` = `APPLICANT_INVOICE_SELECT` (`services/invoice-service.js`) ไม่มี `healthId` ไม่มี `metadata` · รายการใบลดหนี้ของผู้ถือ = `HOLDER_CREDIT_NOTE_SELECT` (`services/credit-note-service.js`) · แถวใบเสนอราคาของผู้ถือ (รายการและคำตอบของปุ่มยอมรับ) = `HOLDER_QUOTATION_FIELDS` (`routes/api/applications/quotations.js`) · ประตูอ่านและประตูเขียนใบลดหนี้/ใบเพิ่มหนี้ (สร้าง issue post cancel refund-transfer) ประตูคืนเงิน (duplicate-charge provider-cancellation status) และประตูบันทึกหนังสือรับรองหัก ณ ที่จ่าย (`POST /api/finance/wht/certificate`) ตอบ id ขององค์กรอื่นเหมือน id ที่ไม่มีอยู่ (404 รหัสเดียวกัน ก่อนบอกสถานะใดของแถว และก่อนล็อกแถวใบแจ้งหนี้หรือใบลดหนี้ คำขอขององค์กรอื่นจึงไม่รอล็อกขององค์กรนี้) เหมือนใบเสร็จและใบเสนอราคา · ประตูเขียนถามซ้ำใต้ล็อก เพราะแถวอาจย้ายองค์กรหรือถูกลบระหว่างที่คำขอรอ: แถวที่ย้ายองค์กรตอบ 404 เดิม ใบลดหนี้ที่ถูกลบตอบ 404 `CREDIT_NOTE_NOT_FOUND` ใบแจ้งหนี้ที่ถูกลบตอบ 410 `INVOICE_DELETED` และไม่บันทึกอะไร (ผลตรวจ f45c9a987 Low-1, หมวด 4b ของ `finance-read-leaks-real-postgres`) · ประตูเขียนตรวจบทบาทและองค์กรของผู้เรียกก่อนอ่านแถว การปฏิเสธตามบทบาทและผู้ไม่มีองค์กรจึงเป็น 403 ไม่ขึ้นกับ id (`rowInCallerOrganization` ใน `services/finance/company-books-access.js`, R2-L2)
- **ใบเสนอราคาหนึ่งเลขคือเอกสารเดียว ยอดเต็มทุกงวด** (คำสั่ง 54, operator 2026-10-09): PDF พิมพ์ทุกงวดที่แถวตั้งราคา (บรรทัดค่าบริการก่อน VAT ต่อรูปแบบการปลูก · แถว VAT ตามแค็ตตาล็อก · แถวรวมงวด) แล้วยอดรวมทั้งสิ้นเท่ากับผลบวกของงวด อ่านจากแถว/ภาพนิ่งที่ยอมรับเท่านั้น · ประตู PDF ไม่มี `?phase` · แถวที่ไม่ตั้งราคางวดใดถูกปฏิเสธ `QUOTATION_NOT_PRICED` · สิ่งที่การชำระเงินอ้างคือใบแจ้งหนี้ของงวด (55(a) ยังไม่ทำ) · แจ้งเตือน `CHECKOUT_PRICE_DRIFT` มีสองฉบับใน `PRICE_DRIFT_VERSIONS` (`services/notification/domain-helpers.js`): ฉบับเต็ม (ยอด + เลขใบเสนอราคา และเลขใบแจ้งหนี้เมื่อคำสั่งชำระที่ถูกปฏิเสธมีใบแจ้งหนี้แล้ว) ถึง finance_officer_platform ขององค์กรของคำขอ · ฉบับไม่มียอดถึง system_admin_platform · ไม่มีบทบาทอื่น · กันซ้ำแยกตามฉบับ (`metadata.audience`)
- **หัวผู้ออก/ย่อหน้า/ผู้ลงนามบนเอกสารเว็บ — แหล่งเดียวคือ `invoice-template-service.js`** (operator 2026-09-28): quotation API ส่ง `issuer` (`buildQuotationIssuer` — รวม `contact` = บรรทัดติดต่อของหัว PDF เส้นเดียว) · `copy` { intro, note } (`buildQuotationCopy` — พืชจาก `plantNameTH` ของคำขอ, บรรทัดชำระจาก `buildPaymentChannelLine`) · `signatory` (`buildQuotationSignatory`) ตัวเดียวกับที่ PDF พิมพ์ · quotation-document/gacpthai-document-layout ไม่มีข้อความผู้ออก ถ้อยคำเอกสาร หรือโลโก้ของตัวเอง ห้ามใส่ค่าเริ่มต้น · ใบวางบิลที่ลูกค้าได้คือ PDF (ไม่มีหน้าเว็บ)

## มติ operator 2026-09-27 เป็นต้นมา

สถานะ deploy ของ staging/demo เช็คด้วย `GET /api/health` → `revision` เท่านั้น ห้ามจำ sha ไว้ในสกิล

| มติ | โค้ด |
|---|---|
| **ใบเสนอราคาออกได้อีกครั้ง** — `ISSUER.DTAM` undefined ตั้งแต่ `3fc6a56a` (2026-09-11) ทำให้ทุกการชำระตอบ 409 | merge แล้ว `fix/quotation-issuer-undefined` `a24f100e` — เจอระหว่างเดิน PromptPay walk 2026-09-27, ถูกซ่อนไว้ด้วย prisma mock ในเทสระดับ unit, ตอนนี้มี integration test บน Postgres จริงตรึงไว้ (ดู `HARNESS_LOG.md`) |
| **ใบเสนอราคายืนราคา 7 วันทำการ ไม่นับวันออก ตามเวลากรุงเทพฯ** | merge แล้ว `fix/quotation-7-working-days` `65813e34` — `quotation-service.js` เรียก `addWorkingDays(issueDate, PAYMENT.QUOTATION_VALIDITY_BUSINESS_DAYS)` (เลิกใช้ `DEFAULT_VALIDITY_DAYS` แบบปฏิทินแล้ว) · PDF พิมพ์วันสิ้นสุดยืนราคา |
| **ใบเสร็จออกโดยระบบตอน settle จาก webhook เท่านั้น ไม่มีคนออก** ("ออกใบเสร็จจากระบบเลย") | ขา settle ออกเองแล้วบน main (`settleFromPaymentIntent()` ใน `checkout-settlement-service.js` เขียน `receiptIssuedBy: 'stripe-webhook'`) · ประตูออกด้วยมือ `POST /api/invoices/:invoiceId/receipt`, ประตู hold/release และสิทธิ์ `RECEIPT_ISSUE` **ถูกลบแล้ว** (กิ่ง `chore/remove-manual-payment-approval`, มติ 2026-10-06 "ลบ...ที่บอกว่าต้องมีเจ้าหน้าที่บัญชีกดอนุมัติ") · ด่านใน `application-status-writer.js`: การเขียน `DOC_FEE_PAID`/`AUDIT_FEE_PAID` ที่ไม่ใช่ SYSTEM ถูกปฏิเสธด้วย `PAYMENT_NOT_SETTLED` (409) ถ้าไม่มี checkout order `SETTLED` ของงวดนั้น · force-status ของแอดมินไม่มีสถานะจ่ายแล้วให้เลือก ⇒ ไม่มีคนอนุมัติ ยืนยัน กัก หรือ mark การชำระเงิน |
| **ช่องทางชำระ = พร้อมเพย์อย่างเดียว** แสดงด้วย QR ของ Stripe เอง (`confirmPromptPayPayment`) settle จาก webhook เท่านั้น · บัตรเพิ่มเมื่อลูกค้าขอเท่านั้น | merge แล้ว `feat/promptpay-qr` `1da94bc4` — backend: `CHECKOUT_PAYMENT_METHOD_TYPES = ['promptpay']` (`stripe-checkout-service.js`) · เว็บมีขั้นแสดง QR แล้ว: `apps/web-app/src/app/health/payments/checkout/promptpay-pay-step.tsx` เรียก `stripe.confirmPromptPayPayment` ผ่าน `@stripe/stripe-js` (`loadStripe` จาก `@stripe/stripe-js/pure`) · reuse/refuse intent เดิมกันเก็บเงินซ้ำ · compare-and-set บน order update · event เก่า (canceled/failed) ไม่ยกเลิกคำสั่งซื้อ · env อยู่ที่ `docs/runbooks/stripe-webhook-staging-demo.md` |
| **ข้อความถึงผู้ใช้ไม่ระบุชื่อผู้ให้บริการรับชำระเงิน** — เงื่อนไขการชำระเขียน "ผู้ให้บริการรับชำระเงิน" เฉย ๆ | merge แล้วใน `feat/promptpay-qr` `1da94bc4` — ชื่อ Stripe อยู่ได้ในโค้ด (adapter/env) ไม่อยู่ในข้อความทางกฎหมาย · ร่าง v1.2 แก้ข้อนี้บนกิ่งแยก |
| **เงื่อนไขการชำระที่ใช้ = v1.3** (มติ 2026-10-06) | `middleware/consent-manager.js` → `PAYMENT_TERMS: 'payment-terms-th-v1.3'` · ข้อความ `docs/legal/payment-terms-th-v1.3.md` §7: คืนเงินได้สองชนิดเท่านั้น คือบริษัทหรือรัฐยกเลิกด้วยเหตุตามข้อ 7.2.1 (คืนงวดที่ยังไม่เริ่มตรวจ ปิดคำขอ) และเก็บซ้ำหรือเกิน (คืนเฉพาะส่วนเกิน สถานะคำขอไม่เปลี่ยน งวดยังถือว่าชำระแล้ว) · ระยะโอนคืน `REFUND_TRANSFER_WORKING_DAYS` (`shared/refund-kinds.js`) = 15 วันทำการ (§7.4) · ฉบับ 1.2 ไม่แก้ข้อความ (sha256 ตรึงใน `payment-terms-v1-2-as-published.test.js`) · การ roll-out ทุกรุ่นเล่นซ้ำใน `payment-terms-rollout-real-postgres.test.js` · ผู้ที่ยอมรับฉบับเก่าต้องกดยอมรับใหม่ก่อนชำระครั้งถัดไป · v1.4 อยู่ในแผน B3a ของสเปกการเรียกเก็บ (คำสั่ง 64) ยังไม่ merge · รุ่นใหม่ต้องเพิ่มแถวใน `PAYMENT_TERMS_VERSIONS` ด้วย |
| ฝ่ายการเงินสองบทบาท: อ่านชุดเดียวกัน · ดูบิลและออกรายงานเท่านั้น ไม่อนุมัติการชำระ · กรมฯ อ่านอย่างเดียว · อนุมัติ waiver-reopen ได้ทั้งคู่ (การอนุมัติยกเว้นค่าธรรมเนียม ไม่ใช่การอนุมัติการชำระ) · `field_inspector` ไม่มีสิทธิ์อ่านการเงิน · ราคาใบเสนอราคาเฉพาะผู้ยื่น+การเงิน+แอดมิน · ปิด PII เกินใน invoice | merge แล้ว `fix/finance-one-view` `6adfbdd8` — ดูสกิล `gacp-workflow-rules` หัวข้อ "ฝ่ายการเงิน" สำหรับ symbol อ้างอิงเต็ม |

env ของ Stripe และ nginx บน staging/demo อยู่ที่ `docs/runbooks/stripe-webhook-staging-demo.md` (รายละเอียด deploy ไม่ใช่กติกา)

## เอกสารที่ออกแล้ว — ห้ามลบ (มติ operator 2026-09-27 · มีผลเต็มตั้งแต่เปิดใช้จริง)

- ใบเสร็จรับเงิน / ใบกำกับภาษี / ใบลดหนี้ / ใบเพิ่มหนี้ ที่มีเลขแล้ว **ห้ามลบ ห้ามแก้ย้อน** — ออกผิดให้ยกเลิกหรือออกใบลดหนี้ · เลขเดินต่อเนื่องตรวจย้อนได้
- เก็บไม่น้อยกว่า 5 ปี (หลักทั่วไปตาม พ.ร.บ.การบัญชี และประมวลรัษฎากร — ให้ผู้ทำบัญชี/ผู้สอบบัญชียืนยันระยะที่ใช้จริง) · ใบเสนอราคาที่ใช้อ้างราคาที่ตกลงเก็บคู่กับคำขอ
- ระหว่างเอกสารจริงยังอยู่ในระยะเก็บ ระบบต้องเปิดดู/พิมพ์ซ้ำได้ ⇒ ห้ามถอดโค้ดที่อ่านเอกสารชนิดนั้น
- ข้อมูลทดสอบก่อนเปิดใช้ (Stripe test mode ไม่มีเงินจริง) ไม่ใช่เอกสารทางบัญชี — ถอดการรองรับได้เมื่อ**นับแล้วเป็นศูนย์**ในทุกฐานที่ระบบใช้ และมีตัวกันไม่ให้กลับมา (constraint + ตรวจก่อน deploy)

## กับดัก

| กับดัก | ความจริง |
|---|---|
| เขียน `5500` / `27500` / `33000` / `0.07` ลงในโค้ดหรือ label | probe `ratchet` (counter `hardcode`, `dup-source`) + memory `operator-no-hardcode-in-api` · ratchet `hardcode` เพิ่ม = gate แดง (probe `ratchet` ใน probe-gate — รันจาก local-gate/full-gate ไม่ใช่ GitHub Actions) · เคสจริงเก่า L-094 ฝัง ฿27,675 ใน label ปุ่ม (`reports/role-workflow-auditor/2026-08-06-farmer.md:190`) — นั่นคือสูตร**ก่อน W14** (ก่อน 2026-08-22, ตอนยังมีค่าธรรมเนียมรัฐ 25,000 + ค่าบริการ 2,500 + VAT 175) ไม่ใช่ตัวเลขจาก one-service-fee-no-split (2026-09-11) — ยอดรวมงวด 2 ไม่เคยขยับจาก 29,425 ตอนยุบสูตร (memory: "the money did not move") — รูปแบบผิดเดิม (ฝัง literal ใน label) ยังเกิดซ้ำได้กับตัวเลขปัจจุบัน |
| คิดว่า domain `fee-table` ใน `ssot-domains.txt` คุม fee ครบแล้ว | **ไม่ครบ** — regex ของ domain นั้นยังเขียนชื่อเก่า `RENEWAL_PER_CERT` ซึ่งไม่ตรงกับ `RENEWAL_PER_SCOPE` ที่โค้ดใช้จริง ⇒ literal `RENEWAL_PER_SCOPE` ที่ไฟล์ที่สองจะไม่ถูกจับเป็น dup-source · ตัวที่คุม fee จริงคือ probe **`fee-single-source.sh`** (GOALS.md G1 ข้อ 1) — `config/payment-fees.js` และ `modules/billing/internal/fee-service.js` เป็นผู้อ่าน `business-rules.js` เท่านั้น |
| คำนวณ VAT จากยอดรวมแยกส่วนรัฐ/บริษัท | ไม่มีส่วนให้แยกแล้ว — VAT คิดจาก **ค่าบริการทั้งก้อน** (`payment-fees.js` → `phaseAmounts()`, อัตราที่ `business-rules.js` → `FEE_DEFAULTS.VAT_RATE`) ไม่มีบรรทัดใดยกเว้น VAT อีกต่อไป (`invoice-issuers.js` → `PLATFORM_ISSUER.chargesVat`) · ส่วนแบ่งที่แสดงบนหน้าราคา/หลังบ้าน (คำสั่ง 38, 58) เป็นการแสดงเท่านั้น ไม่ใช่ฐานคิด VAT |
| เขียน `status: 'SETTLED'` ในไฟล์ใหม่ "เพื่อ backfill" | probe `settle-webhook-only` แดงทันที (นับเป็นเขียนเพราะมี `data:` นำหน้า) · `SETTLED` เป็น terminal ไม่มี edge ออก (`ALLOWED_CHECKOUT_TRANSITIONS.SETTLED` ว่าง) |
| `import stripe` ในไฟล์ที่สอง | probe `stripe-sdk-isolated` แดง — ต่อผ่าน adapter |
| สับสนชื่อ env | Stripe อ่าน `STRIPE_SECRET_KEY` และ `STRIPE_WEBHOOK_SECRET` เท่านั้น (`config/stripe.js`) · `PAYMENT_SECRET_KEY` ไม่มีผู้อ่านแล้ว (ดูสกิล `gacp-debug`) |
| เห็น `money-equation` PASS แล้วสบายใจ | ตรวจว่ามันไม่ได้ BLOCKED เพราะไม่มี DB — probe จะบอกเองว่า "no vacuous pass" |
| ลบ display branch ของข้อมูลแบบเก่าโดยไม่ดูข้อมูลจริง | ถามสองข้อก่อนลบเสมอ: (1) backend ยังคืนแถวชนิดนั้นไหม (2) ฐานข้อมูลที่ระบบใช้จริงมีแถวนั้นกี่แถว — นับแบบอ่านอย่างเดียวผ่าน `DATABASE_URL` ของคอนเทนเนอร์ที่รันอยู่ (ตัด `pgbouncer=` ออกก่อนใช้กับ psql) · รอบแรกของ one-fee-residue ลบ branch STATE โดยไม่ถามข้อ (1) แถวที่ backend ยังคืนได้กลายเป็น "ไม่ระบุ" + VAT ปั้น (แก้ `07fa8cb4`) · สถานะงานถอดข้อมูลเก่า (`fix/retire-legacy-quotations`, `services/billing/w14-boundary.js`) ดูที่ QUEUE/BACKLOG ไม่ใช่สกิลนี้ |
| receipt number กระโดด | จงใจ — `allocateReceiptNumber()` เรียกนอก transaction ของ `settleFromPaymentIntent()` การ settle ที่ crash เผาเลข 1 ตัว (ตอนนี้มีเลขเดียว ไม่ใช่สองเลขแบบยุคสองผู้ออกเอกสาร) ลำดับมีช่องว่างได้โดยชอบ |

## ตรวจก่อนส่ง

```bash
bash scripts/check-done.sh stripe-sdk-isolated ratchet
bash scripts/ci/local-gate.sh
```
`settle-webhook-only` / `webhook-idempotent` รันใน local-gate/full-gate อยู่แล้ว (ดูหัวข้อ
SETTLED ด้านบน) · `money-equation` ต้องรันมือกับ DB จริง — ถ้ารันไม่ได้ให้รายงาน
`BLOCKED(operator:...)` ห้ามเคลม DONE (CLAUDE.md หัวข้อ "แบบไหนเรียกว่าเสร็จ")
