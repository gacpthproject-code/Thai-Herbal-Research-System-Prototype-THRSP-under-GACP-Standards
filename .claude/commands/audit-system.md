---
description: Deep read-only audit ของทั้ง repo → AUDIT_LEDGER.md + ratchet baselines (HARNESS.md §6)
---
รัน Deep Audit ตาม HARNESS.md §6 ทั้ง 9 ขั้น — read-only ทั้งหมด output คือ
AUDIT_LEDGER.md (append findings ใหม่ ห้ามลบของเก่า) ไม่ใช่การแก้โค้ด

บังคับ: ทุก finding มี id, severity (เงิน/ความปลอดภัย = P0), file:line, proposed fix, effort
1. Inventory: โครง repo, entry points, routes ต่อ app, Prisma models ↔ ตาราง, cron/jobs
2. Hardcode scan: ทุก pattern ใน scripts/probes/hardcode-patterns.txt + AST scan → จัดกลุ่ม เงิน > เวลา > identifiers > ข้อความ — เจอชนิดใหม่ = เสนอ pattern เพิ่ม (PR ให้ operator)
3. SSOT violations: logic/ค่าคงที่ซ้ำสองที่ (เทียบ scripts/probes/ssot-domains.txt แล้วเสนอ domain ใหม่)
4. Config drift: process.env ทุกจุด vs config module vs .env.example
5. Dead code/route: route ไม่มี test + ไม่มี referrer, export ไม่มี import, flag ค้าง
6. Test quality: test ไร้ assertion, mock จนไม่ทดสอบอะไร, coverage hole ใน payment/auth
7. Auth matrix: ทุก route × role จาก middleware จริง เทียบกับที่ตั้งใจ
8. Migration hygiene: migration แก้ย้อนหลัง, schema drift
9. สรุปเข้า AUDIT_LEDGER.md + เสนอ baseline counters ใหม่ (ratchet ลงเท่านั้น — ขึ้นต้องมี incident entry จาก operator)

ใช้ sub-agents ขนานได้ (Explore/general-purpose) แต่ orchestrator ต้อง re-verify
ตัวเลขทุกตัวด้วย probe ก่อนเขียนลง ledger (HARNESS.md §2 trust chain)
