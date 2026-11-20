## W2-02 — money-equation property pin + double-checkout guard — 2026-08-02

Phase: PLAN → RED → GREEN → AUDIT → EVIDENCE → REPORT (ครบ)
Status: DONE(probe:ratchet) + full suite รันจริงใน session นี้ (ดู Found ข้อ 3)

Did:
- Property test 1,000 เคสสุ่ม (seeded LCG, reproduce ได้): สมการ `total = state + platform + vat` exact ทุกเคส + integer pin + component-rounding pin — `apps/backend/__tests__/unit/money-equation-property.test.js:41-75`
- Rounding-rule comment pin (grep source + design doc) — `money-equation-property.test.js:77-90`
- ROUNDING RULE comment ที่จุดบริโภค — `apps/backend/services/checkout/stripe-checkout-service.js:47-62`
- กติกาปัดเศษลง design v2 §5.5 — `docs/payment-refactor/step2-data-model-design.md:266-274`
- P2002 → 409 `CHECKOUT_ALREADY_IN_PROGRESS` ข้อความไทย — `stripe-checkout-service.js:135-155`
- Concurrent 2-thread test: winner mints / loser 409 สวย ไม่มี P2002 หลุด, invoice mint ครั้งเดียว — `stripe-checkout-engine.test.js:234-271`

Found:
1. RED จริงทั้งสองจุด: concurrent case หลุด `code:'P2002'` ดิบ, comment pin ไม่เจอ pattern — `evidence/W2-02-money-invariants/red-output.txt`
2. Numeric property 1,000 เคส**เขียวแต่กำเนิด** (พฤติกรรมเดิมถูกอยู่แล้ว — เป็น pin ไม่ใช่ fix) — เปิดเผยตาม PLAN
3. Full suite: 518 suites ผ่าน, fail เดียว = `dataset-export-service.test.js` (ต้องการ generated Prisma client — sandbox ไม่มี; เขียวบน CI branch นี้ ดู PR #721) — `evidence/W2-02-money-invariants/test-output.txt`
4. `CHECKOUT_ALREADY_IN_PROGRESS` ไม่ลง `shared/error-codes.js` — idiom `httpError()` อยู่นอก validator (`extract-error-codes.js --validate` = OK 276/276 ทั้งก่อน/หลัง) และพี่น้อง `CHECKOUT_*` อีก 3 ตัวก็ไม่ได้ลงทะเบียนเช่นกัน — คงความสม่ำเสมอ, catalog ทั้ง family เป็นงานแยก

Ratchet: hardcode 43→43 | todo 59→59 | env-direct 169→169 | dup-source 4→4

Blocked: —

Next:
1. Frontend checkout UI (mock adapter) — follow-up PR ตามที่ระบุใน #721
2. Catalog `CHECKOUT_*` family ลง error-codes.js (งานแยก ถ้า operator ต้องการ)
3. Wave 3 §4.1 schedule/due-date เมื่อ operator สั่งเริ่ม

Evidence: evidence/W2-02-money-invariants/ (plan.md, red-output.txt, test-output.txt, ratchet-before-after.txt, report.md)
