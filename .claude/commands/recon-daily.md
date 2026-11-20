---
description: กระทบยอดเงิน 2 ทางประจำวันผ่าน accounting-reconciler agent (flag only)
---
Dispatch accounting-reconciler agent (.claude/agents/accounting-reconciler.md):
กระทบยอด adapter balance ↔ checkout_orders + checkout_orders ↔ checkout_documents
(ผู้ออกเอกสารรายเดียว) + สมการเงินทุกแถว + SETTLED ไร้ webhook event คู่ (DTAM remittance —
operator สั่งถอด 2026-09-11, memory `dtam-remittance-removal-ordered` · batch pipeline ถอดแล้วใน
PR1 · ตาราง dtam_remittance_batches และคอลัมน์ส่วนกรมฯ ดรอปแล้วใน PR3 · ชั้นบัญชีกรมฯ ถอดแล้วใน PR2 — มติ operator 2026-09-29: ชำระกับกรมฯ นอกระบบ
ลงบัญชีในสมุดบัญชีบริษัทเอง แพลตฟอร์มลงเฉพาะค่าบริการ · บรรทัดบน 2151-001 = residue ให้ flag)

ไม่มี DATABASE_URL ใน environment → รายงาน BLOCKED(operator:database-access) ทันที
ห้ามประมาณการตัวเลขแทน

เสร็จแล้ว: รัน `bash scripts/check-done.sh money-equation` แล้วแนบผลใน report
Discrepancy ใดๆ = flag ใน reports/accounting-reconciler/<date>.md — ห้ามแก้เอง (CLAUDE.md L3 — เดิม Law 3.4)
