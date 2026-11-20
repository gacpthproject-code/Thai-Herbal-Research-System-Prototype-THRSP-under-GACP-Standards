# RULE REFORM — ข้อเสนอลดกฎ เพิ่มความยืดหยุ่น ให้เครื่องทำงานแทนคน (2026-08-06)

> ที่มา: operator สั่ง 2026-08-06 — "กฎเยอะเกินไป … ปรับให้ยืดหยุ่นและเน้นคอมพิวเตอร์ทำงานมากขึ้น เวลาทดสอบให้ใช้ view-in-the-loop"
> สถานะ: **ข้อเสนอเท่านั้น** — CLAUDE.md/HARNESS.md เป็น operator-owned (Law 3.12) · ถ้าเห็นชอบทิศทาง agent จะร่าง patch จริง + probe ใหม่เป็น PR แยกให้ merge
> หลักฐานที่ข้อเสนอนี้ยืนอยู่: ป้าย enforcement ที่ operator เพิ่ง apply เอง (0727f4c) แสดงว่า Laws 12 ข้อมี `[DRAFT]` 5 ข้อ (พึ่งวินัยล้วน) · phantom-guardrail sweep พบกลไกที่ "มีอยู่แต่ไม่คุ้มครอง" 71 รายการ (AUDIT_LEDGER.md:34-119) · ตาราง Burned ว่าง = burn-down quota (HARNESS.md:68) ไม่เคยเดินจริง

## หลักปฏิรูป 3 ข้อ

1. **กฎ = สิ่งที่เครื่องบังคับได้เท่านั้น** — ตรงกับ meta-rule ที่ CLAUDE.md ประกาศอยู่แล้ว (บรรทัด 3: "กฎที่ไม่มี probe บังคับ = กฎร่าง") แค่ทำให้จริง: ข้อไหนสร้าง probe ไม่ได้ใน 30 วัน → demote เป็น "แนวปฏิบัติ" (guidance) ไม่นับเป็น Law ไม่ต้องไล่เช็คทุก report
2. **วินัยที่ต้องทำซ้ำทุกครั้ง → ย้ายเป็น automation** — session protocol, การตรวจ stale, การเช็ค format ล้วนเป็นงานเครื่อง
3. **มนุษย์ตัดสินเฉพาะจุดเสี่ยงจริง** — เงินจริง / ข้อมูลบุคคลจริง / การแก้กติกา — ที่เหลือเครื่อง gate, agent เดินได้เอง

## ข้อเสนอ: Laws 12 ข้อ → 6 invariants (ทุกตัวมีกลไกเครื่อง)

| ใหม่ | รวมมาจาก | กลไกบังคับ | สถานะกลไกวันนี้ |
|---|---|---|---|
| **I1 NO FABRICATION** — status/ตัวเลข/ผล test ต้องมาจากการรันจริง | 3.2 + 3.9 | probe `report-integrity` (แก้ให้รับ path ชัดเจน — L-031) | [MANUAL] → เสียบ CI ได้หลังแก้ path |
| **I2 NO SECRET** | 3.3 | TruffleHog (CI, มีแล้ว) + gitleaks local (BACKLOG 2026-08-03) | ชั้น CI [ACTIVE] แล้ว |
| **I3 NO MONEY MUTATION by agent** | 3.4 | **สร้าง probe `money-write-guard`** (ยังไม่มีไฟล์ — หนี้ใน CLAUDE.md เอง) | [DRAFT] → ต้อง build |
| **I4 RATCHET ลงทางเดียว** — hardcode/dup-source/todo/env-direct/skip/assertion รวมเป็นตระกูลเดียว | 3.5 + 3.6 + 3.7 | `probe-gate` (#813) + `check-green-mask-assertions.js` (มีแล้วทั้งคู่) | รอพิสูจน์เขียวบน runner 1 ครั้ง |
| **I5 OPERATOR-OWNED PATHS** — แตะไฟล์กติกา/probe = PR ที่ operator merge เท่านั้น | 3.12 + 3.1 (ฝั่ง merge) | **สร้าง CI path-guard job** — fail เมื่อ PR แตะ path ล็อกโดยไม่มี label ที่ operator ติดเอง (ไม่ต้องใช้ GitHub Pro/branch protection) | [DRAFT] → ต้อง build (~50 บรรทัด) |
| **I6 NO AUTO-DEPLOY** | 3.1 (ฝั่ง deploy) | `workflow_dispatch` only + promote `if:false` (#775) | มีจริงแล้วเชิงกล |

**Demote เป็นแนวปฏิบัติ (ไม่ block งาน — ยืดหยุ่นขึ้นตรงนี้):**
- **RED-FIRST (3.11)** → บังคับเฉพาะ Tier C (เงิน/auth/identity) ผ่าน review; งานทั่วไปแนะนำแต่ไม่ block — เหตุ: เป็น [DRAFT] อยู่แล้ว บังคับเชิงกลไม่ได้ และต้นทุนวินัยสูงสุดต่อ iteration
- **EXPAND-BEFORE-CONTRACT (3.10)** → เป็น checklist ใน PR template + probe `drain-complete` เฉพาะตอน CONTRACT จริง
- **NO ROUTE-AROUND (3.8)** → คงเป็นวัฒนธรรม + HARNESS_LOG protocol (จับด้วย incident ไม่ใช่ pre-check)
- **ESCALATION §7 คงเดิมทั้งหมด** — นี่คือจุดที่มนุษย์ต้องอยู่ (เงินจริง / secret ใน history / disable guardrail)

## Automation ที่เสนอสร้าง (เครื่องทำแทนคน — เรียงตามคุ้มก่อน)

1. **SessionStart hook** รัน `scripts/session-check.sh` อัตโนมัติทุก session (สกิล `session-start-hook` มีอยู่แล้วใน harness) — ตัด SESSION START PROTOCOL ข้อ 1-2 ออกจากภาระวินัย
2. **probe `queue-freshness`** — เทียบทุก status claim ใน QUEUE.md กับ git log จริง (merge แล้วแต่เขียน "ยังไม่ทำ" = FAIL) — operator เคยสั่งบันทึกความต้องการนี้ไว้แล้วหลัง check-in อ้างสถานะเก่า 2 ครั้ง (HARNESS_LOG.md:80-81) · วันนี้เพิ่งต้องกวาด stale ด้วยมือ 5 จุดอีกรอบ = pattern เกิดซ้ำ ตาม HARNESS.md:107 ต้องมี probe
3. **CI path-guard** (I5) — ทดแทน branch protection ที่ตั้งไม่ได้บนแพลนปัจจุบัน
4. **`money-write-guard`** (I3) — grep/AST หา write ตาราง invoice/payment/journal นอก allowlist writer ที่ operator เซ็น
5. **Report format ลดจาก 8 ช่องเหลือ 4**: `Status / Did (มี file:line) / Blocked / Evidence` — ratchet ไม่ต้องพิมพ์มือแล้ว (probe-gate พิมพ์เอง) แล้วให้ `report-integrity` ตรวจ 4 ช่องนี้เชิงกล
6. **View-in-the-loop เป็นมาตรฐาน evidence** (คำสั่ง operator วันนี้): ทุก work item ที่แตะ UI/flow ต้องมี **visual pack** — screenshot ต่อ step + trace + `INDEX.md` ที่ operator เปิดไล่ดูเองได้โดยไม่ต้องอ่านโค้ด (ตรง HARNESS.md:89 "operator เปิด trace/ภาพดูเอง = view-in-the-loop จริง") · บังคับด้วย probe `evidence-complete` ที่มีอยู่ + เพิ่มเช็คว่า screenshots/ ไม่ว่างสำหรับงาน UI · ระยะถัดไป: rig E2E ให้ผลิต visual walkthrough หน้าเดียวต่อรอบ QA อัตโนมัติ

## ผลลัพธ์ที่คาดหวัง

- เอกสารกติกาที่ agent ต้องถือ ↓ จาก ~3 ไฟล์ยาว → 1 หน้า (6 invariants + escalation)
- ภาระ per-iteration ↓: ไม่ต้องพิมพ์ ratchet มือ, ไม่ต้องรัน session-check มือ, report สั้นลงครึ่ง
- ความคุ้มครองจริง ↑: ทุก Law ที่เหลือมีเครื่อง fail ได้จริง — เลิกมีกฎที่ละเมิดแล้วเงียบ
- ความเสี่ยงไม่เพิ่ม: จุดเงิน/secret/กติกา ยังล็อกเท่าเดิมหรือแน่นขึ้น (I3, I5 ได้กลไกที่ไม่เคยมี)

## ขั้นถัดไป (ถ้า operator เห็นชอบ)

1. Operator ตอบ 3 คำถาม: (ก) รับโครง 6 invariants ไหม (ข) RED-FIRST เหลือบังคับเฉพาะ Tier C โอเคไหม (ค) ให้เริ่ม build อะไรก่อนระหว่าง path-guard / queue-freshness / money-write-guard
2. Agent ร่าง: patch `CLAUDE.md` v3 + probe ใหม่ 3 ตัว + SessionStart hook — เป็น PR แยกตาม HARNESS.md §8 (กฎเดิม/กฎใหม่/เหตุผล/probe ที่บังคับ) ให้ operator merge
3. ระหว่างรอ: กติกาปัจจุบันยังบังคับใช้เต็มรูป — ข้อเสนอนี้ไม่ใช่ข้ออนุญาตให้หย่อนวินัยก่อน merge
