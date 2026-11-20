---
description: Inventory residue ของฟีเจอร์ที่ถูกถอดแล้ว (เช่น DTAM remittance batch pipeline) / dead code / flag ค้าง ผ่าน legacy-sweeper agent (ห้ามลบ)
---
Dispatch legacy-sweeper agent (.claude/agents/legacy-sweeper.md):
enumerate residue ของฟีเจอร์ที่ operator สั่งถอด — เส้นทางจ่ายเงินแบบมีคนอนุมัติ ถอดแล้วจริง ·
DTAM remittance สั่งถอด 2026-09-11 (memory `dtam-remittance-removal-ordered`) · batch
pipeline ถอดแล้วใน PR1 ⇒ UI/route/job ที่เจอ = residue = finding · ตาราง/คอลัมน์ดรอปแล้วใน
PR3 · ชั้นบัญชีกรมฯ (2151-001/5110-001, `recordRemittanceToDtam`, gov_remittance) ถอดแล้วใน PR2 ตามมติ operator
2026-09-29 (ชำระกับกรมฯ นอกระบบ ลงบัญชีในสมุดบัญชีบริษัทเอง) — + dead code + flag ค้าง → purge manifest ใน
reports/legacy-sweeper/<date>.md

กติกา D2 (PROMPT §1.7): ห้ามลบอะไรทั้งสิ้นใน command นี้ —
purge จริงเกิดได้ต่อเมื่อ `bash scripts/check-done.sh drain-complete` = PASS (0 จาก DB จริง)
และ operator สั่งใน PR แยกที่ติดป้าย DESTRUCTIVE
