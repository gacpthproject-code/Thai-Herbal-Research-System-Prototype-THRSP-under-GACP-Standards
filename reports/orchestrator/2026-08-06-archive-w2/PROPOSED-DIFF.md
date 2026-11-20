# ข้อเสนอ archive PROMPT-W2-AUTONOMOUS-FLOW.md (2026-08-06)

> สถานะ: ข้อเสนอ — `PROMPT-*.md` เป็น operator-owned (`.github/CODEOWNERS:5`) agent ย้าย/แก้เองไม่ได้ (Law 3.12)
> กติกาที่รองรับ: CLAUDE.md §6 ("PROMPT-<mission>.md ← mission ปัจจุบัน — จบแล้ว archive") + HARNESS.md §8/:111 ("Mission จบ → archive … สรุป probe/กติกาไหนคงถาวร")

## ข้อเท็จจริง

- เนื้องานของ mission จบสมบูรณ์ตั้งแต่ 2026-08-03: Q1→Q2→Q3→Q-END ครบ, `evidence/FLOW-REPORT.md:1-3` บันทึก STOP แล้ว (QUEUE.md:8-11)
- แต่ไฟล์ยังถูกอ้างเป็นกติกา active ของคิวที่เดินต่อ: QUEUE.md:3 ("กติกาเต็ม: PROMPT-W2-AUTONOMOUS-FLOW.md") และ QUEUE.md:26-29 ("Circuit breaker (PROMPT §5)") — archive ดื้อๆ จะทำให้ pointer ชี้ไฟล์ที่หายไป

## ข้อเสนอ (operator เลือก 1 ใน 2)

**ทางเลือก ก — archive ตอนนี้ (แนะนำถ้ายังไม่ทำ rule reform เร็วๆ นี้):**
1. Operator ย้ายกติกาที่ยังใช้ 3 ก้อนจาก PROMPT-W2 เข้า **HARNESS.md** (บ้านถาวรของกติกา harness ตาม HARNESS.md:111):
   - Circuit breaker (§5: 3 fix cycles บน head/ประเด็นเดียว → STOP · CRITICAL จากเงิน/security → STOP ทันที · MAX_HOURS=8 · MAX_ITER=40) → เพิ่มเป็น HARNESS.md §3.1 ใต้ Phase gates
   - Auto-advance gate 6 ข้อ (§4) → รวมเข้า HARNESS.md §3 exit criteria
   - Dispatch pipeline spec-reader→implementer→auditor (§3) → มีใน HARNESS.md §1 แล้วโดยสาระ — ไม่ต้องย้าย
2. Operator รัน `git mv PROMPT-W2-AUTONOMOUS-FLOW.md docs/archive/` (หรือ `archive/` ตามที่ตั้งใจ — วันนี้ยังไม่มี dir `archive/` ที่ root; `docs/archive/` มีอยู่แล้ว)
3. จากนั้น agent จะแก้ pointer ใน QUEUE.md:3,26 ให้ชี้ HARNESS.md ในคอมมิตเดียวกัน (QUEUE เป็นไฟล์ agent-writable — จะทำทันทีที่เห็นการย้ายจริง ไม่ทำล่วงหน้า)

**ทางเลือก ข — รวมเข้ารอบ rule reform (ประหยัดรอบ merge):**
ถ้า operator กำลังจะพิจารณา `reports/orchestrator/2026-08-06-rule-reform/PROPOSAL.md` อยู่แล้ว — circuit breaker/gate ควรไปอยู่ในบ้านใหม่ตามโครง v3 ทีเดียว: archive PROMPT-W2 เป็นส่วนหนึ่งของ PR reform เดียว ลดการแก้ HARNESS.md สองรอบ

## เหตุที่ **ไม่** เสนอย้ายกติกาเข้า QUEUE.md

QUEUE.md เป็นไฟล์ที่ orchestrator เขียนได้เอง — การย้ายกติกา governance จากไฟล์ operator-owned เข้าไฟล์ที่ agent แก้ได้ = ลดชั้นคุ้มครองของ Law 3.12 (ประเด็นนี้ถูก adversarial review จับตอนร่างแผน — บันทึกไว้กันเสนอซ้ำ)
