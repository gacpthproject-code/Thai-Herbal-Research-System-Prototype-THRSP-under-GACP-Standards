---
description: รวบ + ตรวจ evidence pack ของ work item ผ่าน qc-evidence agent
---
Dispatch qc-evidence agent (.claude/agents/qc-evidence.md) สำหรับ work item ที่ระบุ
(argument = work item id เช่น W2-01-adapter-seam):
1. ตรวจ evidence/<id>/ ครบตาม HARNESS.md §5
2. สร้าง evidence/<id>/INDEX.md (artifact → claim)
3. ไล่ claim ใน report ล่าสุด — claim ไร้ artifact = REJECTED list

เสร็จแล้ว: รัน `WORK_ITEM=<id> bash scripts/check-done.sh evidence-complete report-integrity`
ผล probe คือคำตัดสิน — ไม่ใช่ summary ของ agent
