# Proposed diff — CLAUDE.md Law 3.1 (auto-merge มีขอบเขต) — 2026-08-06

> ที่มา: คำสั่ง operator 2026-08-06 "เปิดสิทธ Auto merge แต่ต้องมีกลับมารีวิว งานตลอด" (บันทึกใน HARNESS_LOG.md entry วันเดียวกัน)
> CLAUDE.md เป็น operator-owned — operator เป็นผู้ apply diff นี้เอง (Law 3.12)

## กฎเดิม (แถว 3.1)

NO AUTO-MERGE / NO AUTO-DEPLOY — enforcement `[DRAFT]` (branch protection ตั้งไม่ได้บนแพลนปัจจุบัน · ที่บังคับฝั่ง merge คือ operator กดเอง + agent ไม่เรียก merge command)

## กฎใหม่ที่เสนอ (แถว 3.1)

**TIERED MERGE / NO AUTO-DEPLOY** — agent merge ได้ตามชั้น:
| ชั้น | เงื่อนไข merge โดย agent |
|---|---|
| docs/reports/QUEUE/evidence | guard local ผ่าน (banned-terms, mojibake) + review pass ≥1 ชั้น + สรุปให้ operator รีวิวย้อนหลังทุกครั้ง |
| โค้ดทั่วไป (ไม่ใช่ Tier C) | **CI เขียวจริงบน runner** + `engineering:review` + `security-review` ผ่าน + สรุปย้อนหลัง · CI ล่ม = ห้าม merge |
| Tier C (เงิน/auth/identity/schema/migration) + ไฟล์ operator-owned | **operator merge เท่านั้น** (ไม่เปลี่ยน) |
| deploy ทุกชนิด | **operator เท่านั้น** (ไม่เปลี่ยน — #775) |

## เหตุผล

- ตรงคำสั่ง operator: เครื่อง/agent ทำงานมากขึ้น, operator รีวิวต่อเนื่องแทนการเป็นคอขวดก่อน merge
- ความเสี่ยงคุมด้วยชั้น: จุดเงิน/auth/กติกายังล็อกที่ operator เท่าเดิม
- Enforcement เชิงกลที่จะตามมา (rule-reform I5): CI path-guard ตรวจว่า PR ที่ agent merge ไม่แตะ path ชั้น Tier C/operator-owned — ทำได้โดยไม่ต้อง GitHub Pro

## สิ่งที่ operator ต้องทำ

1. ถ้าเห็นชอบ: แก้แถว 3.1 ใน CLAUDE.md ตามตารางบน (หรือสั่งปรับขอบเขตก่อน)
2. ถ้าไม่เห็นชอบขอบเขตใด: สั่งแก้ในแชท — agent จะถือขอบเขตตาม HARNESS_LOG entry จนกว่าจะมีคำสั่งใหม่
