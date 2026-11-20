# W2-02 — money-equation property pin + double-checkout guard — PLAN

Mission: PROMPT-PAYMENT-REWORK.md §3.3 + §3.4 (สองข้อสุดท้ายของ Wave 2 ที่ยังไม่มีใน PR #721)

## Scope

1. **§3.3 property-based money-equation pin**
   - Test ใหม่ 1,000 เคสสุ่ม (seeded PRNG — reproduce ได้) เหนือ `buildPhaseFee` decomposition:
     `stateAmount + platformAmount + vatAmount === phaseTotal` ทุกเคส, ทุก component เป็นจำนวนเต็มบาท
   - Pin กติกาปัดเศษที่เป็นจริงในระบบ (modules/billing/internal/fee-service.js:100-102):
     **ปัดรายชิ้น** — `platform = Math.round(state × 0.10)`, `vat = Math.round(platform × 0.07)` (คิดจากค่า
     ที่ปัดแล้ว), แล้ว **บวกชิ้นที่ปัดแล้ว** เป็น total — ห้ามปัดผลรวม
   - ระบุกติกานี้เป็น code comment ที่ `breakdownForMilestone` + เพิ่มใน design v2 §5.5 + test grep-pin ว่า comment อยู่จริง

2. **§3.4 double-checkout guard ระดับ service**
   - `createCheckoutForApplication`: catch Prisma P2002 จาก `checkoutOrder.create` (แพ้ race กับ partial
     unique index #720) → 409 `CHECKOUT_ALREADY_IN_PROGRESS` ข้อความไทยอ่านรู้เรื่อง — ไม่มี raw 500
   - Test: ยิง 2 threads พร้อมกัน (mock: findFirst→null ทั้งคู่, create สำเร็จ 1 / โยน P2002 1) —
     สำเร็จ 1, อีก 1 ได้ {status:409, code:'CHECKOUT_ALREADY_IN_PROGRESS'}

## Files ที่จะแตะ

- `apps/backend/__tests__/unit/money-equation-property.test.js` — NEW (§3.3)
- `apps/backend/__tests__/unit/stripe-checkout-engine.test.js` — เพิ่มเคส §3.4
- `apps/backend/services/checkout/stripe-checkout-service.js` — P2002 catch + rounding comment
- `apps/backend/shared/error-codes.js` — ลงทะเบียน `CHECKOUT_ALREADY_IN_PROGRESS`
- `docs/payment-refactor/step2-data-model-design.md` — §5.5 เพิ่มถ้อยคำกติกาปัดเศษ (agent-authored doc)

## จะไม่แตะ

- `modules/billing/internal/fee-service.js` (กติกาเดิมคือ SSOT — pin ตามที่เป็น ไม่แก้)
- settlement service, webhook route, legacy slip path, migrations
- CLAUDE.md / HARNESS.md / scripts/probes/* (operator-owned)

## Acceptance (machine-checkable)

1. `money-equation-property.test.js`: 1,000/1,000 เคสผ่านสมการ + integer pin + rounding-comment pin
2. เคส concurrent ใน `stripe-checkout-engine.test.js`: 1 resolve / 1 reject(409, code ถูก) — ไม่มี P2002 หลุด
3. Full suite ผ่าน ≥ baseline (ห้ามรันเฉพาะไฟล์ที่แก้แล้วเคลม)
4. Ratchet delta 0 ทุกตัว

## RED-first disclosure

- เคส §3.4 และ comment-pin ของ §3.3 จะ fail จริงกับโค้ดปัจจุบัน (แนบ output)
- property numeric 1,000 เคสเป็น **pin ของพฤติกรรมที่ถูกอยู่แล้ว** — คาดว่าเขียวแต่กำเนิด จะรายงานตามจริง
