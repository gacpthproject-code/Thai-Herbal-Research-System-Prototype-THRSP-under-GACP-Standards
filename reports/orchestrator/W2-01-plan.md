# W2-01 — Adapter seam (PROMPT-PAYMENT-REWORK.md §3.1) — PLAN

## Scope
แยก stripe SDK ออกจาก business logic ผ่าน `PaymentAdapter` interface:
`createCheckoutSession`, `verifyWebhookSignature`, `parseEvent`, `getPaymentIntent`
สอง implementation (StripeAdapter จริง / MockPaymentAdapter deterministic) สลับด้วย
`PAYMENT_ADAPTER=mock|stripe` (default stripe, ค่าอื่น fail closed)

## Files ที่จะแตะ
| file | การเปลี่ยน |
|---|---|
| `apps/backend/services/payment/payment-adapter.js` | NEW — factory + parseEvent normalization (2 event families) |
| `apps/backend/services/payment/stripe-adapter.js` | NEW — ไฟล์เดียวที่ `require('stripe')`; ย้าย getStripeClient/assertWebhookSecret มาจาก config/stripe.js |
| `apps/backend/services/payment/mock-payment-adapter.js` | NEW — deterministic ids จาก idempotency key, HMAC mock signature, `__setNextCreateFailure` hook |
| `apps/backend/config/stripe.js` | ตัด SDK import + client ออก — เหลือ pure config (descriptor, toSatang, flag) |
| `apps/backend/services/checkout/stripe-checkout-service.js` | เรียก adapter แทน SDK ตรง |
| `apps/backend/routes/api/webhooks/stripe.js` | verify ผ่าน adapter |
| `apps/backend/__tests__/unit/payment-adapter.test.js` | NEW — RED ก่อน implement |
| `apps/backend/__tests__/unit/stripe-checkout-engine.test.js` | ย้าย import getStripeClient/assertWebhookSecret → stripe-adapter (assertion เดิมครบทุกตัว — Law 3.7) |

## Acceptance criteria (machine-checkable)
1. probe `stripe-sdk-isolated` PASS: stripe import เจอเฉพาะ services/payment/stripe-adapter.js
2. test ใหม่ ≥ 10 ข้อใน payment-adapter.test.js เขียว หลังจากเคย FAIL จริง (RED output ใน evidence/W2-01-adapter-seam/red-output.txt)
3. probe `suite-green` PASS: full suite exit 0, count ≥ 6872 (baseline AUDIT_LEDGER.md)
4. probe `ratchet` PASS: ไม่มี counter เพิ่มจาก baseline (43/59/169/4)
5. test pin §3.2: body ที่ถูก JSON.parse แล้ว → reject โดยทั้งสอง adapter

## Non-goals (ห้ามแตะใน item นี้)
- ไม่แตะ legacy slip path ใดๆ (D2 — PROMPT §1.7)
- ไม่เปลี่ยน settlement logic / journal / split documents
- ไม่เปลี่ยน event ที่ webhook รับ (การตัดสิน payment_intent.* vs checkout.session.* = decision รอ operator — parseEvent รองรับทั้งสอง family ไว้แล้ว, ดู Found ใน report)
- ไม่แตะ frontend / Flutter
