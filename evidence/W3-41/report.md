## W3-41 (Q2) — Payment Schedule: due date + derived OVERDUE + reminder cron — 2026-08-03

Phase: PLAN → RED → GREEN → AUDIT → EVIDENCE → REPORT (ครบ — pipeline: spec-reader → STOP รอ operator → PLAN → implementer D1-D2 → auditor → gates)
Status: DONE(probe:ratchet) + auditor PASS | fix cycles 0/3

Did:
- D1 (commit 1cba81e): `INVOICE_DUE_BUSINESS_DAYS {M1:7,M2:15}` + `PAYMENT_REMINDER {PRE_DUE_BUSINESS_DAYS:3}` ใน business-rules (Law 3.5), `checkout-schedule-service.js` (computeDueDate ผ่าน calendar canonical ตัวเดียว / isInvoiceOverdue + overdueInvoiceWhere derived-only ไม่มี writer / computeReminderDates 3 types + shift), **mint fix ปิดบั๊ก #721** (`invoice.create` + dueDate — RED แดงจาก field หายจริง)
- D2 (commit 85b02b2): `PaymentReminderLog` EXPAND additive ล้วน (unique invoiceId+type+intendedDate, tenant-scoped copy-from-invoice), `payment-reminder-job.js` (insert-first dedup, ICT date-equality, ไม่มี money-state write — afterEach guard), scheduler block 13 `'0 9 * * *'` Asia/Bangkok

Found:
1. Auditor (fresh) รันซ้ำเองทั้งหมด: targeted 56 tests + full suite 520/521 ตรง claim ทุกตัวเลข, RED timeline ตรง git log, fixture วันหยุดตรวจกับตาราง canonical ด้วยมือ, dedup/guard/shift ทดสอบของจริง — PASS ไม่มี CRITICAL
2. **Gate §4.2 (CI): "รอ retarget"** ตามคำสั่ง operator ข้อ 3 — #721 ยังไม่ merge, workflow ไม่ trigger PR ที่ base ไม่ใช่ main — ไม่นับ fix cycle
3. `prisma validate/generate` รันใน sandbox ไม่ได้ (engine 403) — schema ตรวจมือ + suite mocked-prisma ผ่าน; **ก่อน merge ต้องรัน `prisma migrate deploy` + `generate` ใน env ที่ถึง engine**
4. Q2 อยู่ใน PR #722 (ไม่ใช่ PR แยก): D1 ต้องแตะ mint ของสาย #721 และ D2 ต่อจาก D1 — แยก PR ย้อนหลังต้อง force-push ซึ่งต้องห้ามตาม §6 (บันทึกเป็นการตัดสินใจแทนคนใน FLOW-REPORT)
5. คำถามรอ operator (ไม่ block): retry policy ของ reminder ที่ dispatch แล้วไม่ confirm (ปัจจุบัน sentAt=NULL ไม่ retry + warn)

Ratchet: hardcode 43→43 | todo 59→59 | env-direct 169→169 | dup-source 4→4 (`evidence/W3-41/ratchet-before-after.txt`)

Blocked: —

Next:
1. Q3 reopen-readiness audit (mandate: `evidence/Q3-reopen-audit/mandate.md`) → Q-END
2. หลัง #721 merge: rebase+retarget #722 → main, ยืนยัน CI trigger, รายงาน run แรก
3. Backlog PRIORITY สูง: drain stored-'overdue' consumers (ar-aging ฝั่ง Account) — operator นำไปคุยต่อ

Evidence: `evidence/W3-41/` — plan.md, spec-reader-report.md, red-output.txt, test-output.txt, ratchet-before-after.txt, orchestration-log.md
Check-in: อัตโนมัติ ~1 ชม. ครอบ #721+#722 (ล่าสุด 01:23Z)
