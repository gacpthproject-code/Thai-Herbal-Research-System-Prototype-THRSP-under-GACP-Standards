# RATIONALE — CLAUDE.md v3 + HARNESS.md (2026-08-07)
> คำสั่ง: HARNESS_LOG.md:185-195 (verbatim + หลักฐานภาคสนาม 5 ข้อ) + คำสั่งเพิ่มบ่ายวันเดียวกัน (rationale inflation + รีวิวทุกข้อ)
> ไฟล์นี้จงใจสั้น — ตามกติกาใหม่ที่มันเสนอเอง

## คำตัดสินรายข้อ (คง / ยุบ / ลดเป็น guidance / ตัด)

| v2 | คำตัดสิน | เหตุผล (หลักฐาน) |
|---|---|---|
| 3.1 tiered merge | **คง** → L5 | ชั้น C/deploy = ความเสี่ยงจริง · deploy มีกลไกแล้ว (#775) · ที่ขาดคือ path-guard ไม่ใช่การผ่อน |
| 3.2 no fabrication | **ยุบ** → L1 | เนื้อเดียวกับ 3.9 · probe `status-vocab` พิสูจน์แล้วว่าจับได้จริง (เขียว main 2026-08-07) |
| 3.3 no secret | **คง** → L2 | ห้ามผ่อนตามคำสั่ง dispatch · near-miss จริง 2026-08-03 (HARNESS_LOG.md:59-64) |
| 3.4 no money mutation | **คง + เข้มขึ้น** → L3 | ห้ามผ่อน · เพิ่ม G1 hard gate ตาม GOALS.md:37 ("บันทึกเป็นกติกา ไม่ใช่ backlog") |
| 3.5 no hardcode | **ยุบ** → L4 | ตัวนับเดียวกับ 3.6 อยู่แล้ว (`ratchet.sh`) — สองข้อความ กลไกเดียว = ยุบ |
| 3.6 SSOT | **ยุบ** → L4 | เหตุผลเดียวกับ 3.5 · `holiday-single-source` คง pin แยกเพราะ critical |
| 3.7 no skip/assertion | **ยุบ** → L4 | ทั้ง `.skip` และ assertion-mask คือ ratchet ตระกูลเดียว — `no-skip` + green-mask คุมอยู่แล้ว |
| 3.8 no route-around | **ยุบ** → L1 | route-around คือการรายงานเท็จรูปหนึ่ง — จับด้วย incident review เหมือนเดิม ไม่มี pre-check เชิงกล |
| 3.9 verify-before-claim | **ยุบ** → L1 | ข้อเดียวกับ 3.2 ในทางปฏิบัติ — ละเมิดจริงล่าสุดคือ 55e23fbd (HARNESS_LOG.md:178-183) |
| 3.10 expand-before-contract | **ลด → guidance** | [DRAFT] มาตลอด ไม่มีเครื่องตรวจ · migration = Tier C → operator เห็นทุกใบอยู่แล้ว |
| 3.11 red-first | **ลด → DoD ชั้น B/C** | บังคับเฉพาะ executable behavior · กับ docs = พิธีกรรม (ต้นทุนวินัยสูงสุดต่อ iteration) · ชั้น C คง paste-RED ตาม M4 pattern (HARNESS_LOG.md:120-130) |
| 3.12 operator-owned | **แปลง** → L6 | เส้นใหม่: เขียนกฎ (probe+selftest) = เปิด · ยกเว้นกฎ (waiver/baseline-up/merge C) = operator — ดูหัวข้อถัดไป |
| §1 session 4 ขั้น | **ตัดเหลือ 2** | git status/probe = งานเครื่อง (session-check พิมพ์เอง) · ประกาศไฟล์ล่วงหน้า = คำสัญญาที่ tier-check ตัดสินจาก diff จริงได้ดีกว่า |
| §2 status 3 ค่า | **คงทุกตัวอักษร** | ห้ามลบตามคำสั่ง · probe เพิ่งพิสูจน์วันนี้ว่าคุมได้จริง |
| §4 DoD | **แปลงเป็นตาราง 3 ชั้น** | full suite กับ docs ไม่ลดความเสี่ยงใด (หลักฐานภาคสนาม #5) · ชั้น C เข้มเท่าเดิมทุกข้อ |
| §5 report format | **ผ่อน + เพดาน 40 บรรทัด** | file:line เฉพาะ claim ข้อเท็จจริง · คงห้ามคำประเมินตัวเอง · เพดานฆ่า rationale inflation |
| §7 escalation | **คงทุกข้อ** | จุดที่มนุษย์ต้องตัดสิน — operator ไม่ได้สั่งผ่อน |
| HARNESS §1 matrix | **แยกแถว probe logic / cover** | ให้ L6 ใช้งานได้จริง — cover rows ยังล็อกที่ operator |
| HARNESS §3 phase gates | **ผ่อนชั้น A เหลือ 3 phase** | RED/AUDIT/EVIDENCE กับ docs = ผลิตข้อความ ไม่ผลิตหลักฐาน |
| HARNESS §4 | **เพิ่ม 4.4 view-pack + 4.5 build list** | คำสั่ง view-in-the-loop → ทำเป็นหมวดหลักฐานชั้นหนึ่ง + รายการ probe ที่ต้องสร้างชัดเจน |

## เส้นแบ่ง L6: ทำไม "เขียนกฎ" เปิดได้ แต่ "ยกเว้นกฎ" ไม่ได้
- แก้/สร้าง probe = **เพิ่ม** enforcement และถูกเครื่องตรวจกลับได้ (selftest fail-case + review + registry diff โปร่งใส) — ความเสี่ยงหลักคือ probe อ่อนลงเงียบๆ ซึ่ง review + selftest + ตัวเลข counter ที่ตกผิดปกติจับได้
- waiver / manual(-until) / baseline ขึ้น = **ปิด** enforcement — ตรวจกลับไม่ได้ด้วยเครื่อง (เป็นดุลยพินิจล้วน) จึงต้องเป็นลายเซ็น operator เท่านั้น · `probe-gate.js` บังคับ signed-by=operator อยู่แล้ว
- ข้อยกเว้นทางเดียวที่ให้ agent: ลบ waiver ที่หนี้จ่ายแล้ว — เพราะ probe-gate เป็นผู้สั่งลบเอง (เครื่อง authorize ไม่ใช่ agent) · เคสจริงตอนนี้: `probe-registry.txt:25` ทำ gate แดงค้างทั้งที่ `holiday-single-source` PASS

## หลักฐานภาคสนาม (HARNESS_LOG.md:189-194 — จำนวนครั้งจริง)
1. probe เขียน absolute path ทับไฟล์ tracked → tree สกปรก **3 ครั้ง/วัน** → งานเครื่อง (แก้ probe ได้เองภายใต้ L6)
2. ratchet นับ identifier ในคอมเมนต์เป็น source → ลงโทษเอกสารซื่อสัตย์ **3 ครั้ง** → probe fix ภายใต้ L6
3. waiver หนี้จ่ายแล้วรอ operator ลบมือ → gate แดงค้าง (registry:25 ตอนนี้) → L6 + HARNESS §8
4. status-vocab จับ prose เป็น claim **5 จุด/รายงานเดียว** → probe fix ภายใต้ L6 (มี selftest อยู่แล้ว)
5. full suite กับงาน docs ทุกชิ้น → DoD ชั้น A ตัดออก
6. rationale inflation: claim กว้างกว่าที่ตรวจ (55e23fbd) + รายงานยาวกว่า diff หลายฉบับวันนี้ → เพดาน 40 บรรทัด + `report-size`

## ความเสี่ยงที่ยอมรับจากการผ่อน (แจ้งตรง)
- 3.10→guidance: contract ผิดจังหวะอาจหลุดใน Tier B — รับได้เพราะ migration จริงเป็น Tier C เสมอ (tier-check: prisma = C structural)
- 3.11→DoD: งาน B ที่ reviewer ไม่เข้มอาจข้าม RED — ชดด้วย artifact บังคับ (test output ที่ fail จริงเมื่อเปลี่ยน behavior)
- L6 probe-edit: agent อาจอ่อน probe เงียบๆ — ชดด้วย selftest บังคับ + review + ห้ามแตะ waiver/baseline ในใบเดียวกัน + merge ยังตาม tier
- DoD ชั้น A ไม่รัน suite: docs ที่ฝัง executable (สคริปต์ใน skill) อาจหลุด — ชดด้วย tier-check ที่นับ `.claude/` เป็น C (เสนอไว้แล้ว HARNESS_LOG.md:183)
- report ≤ 40 บรรทัด: อาจตัดรายละเอียดที่จำเป็น — ทางออกคือชี้ artifact ไม่ใช่เขียนเพิ่ม ซึ่งคือพฤติกรรมที่ต้องการพอดี

## Probe ใหม่ที่ v3 ต้องการ (รายละเอียด HARNESS.md §4.5)
`path-guard` (PR แตะ path C โดยไม่มี operator label = FAIL) · `money-write-guard` (write ตารางเงินนอก allowlist) ·
`report-size` (≤ 40 บรรทัด/work item) · `probe-selftest` (probe ที่แตะใน PR ต้องมี selftest ผ่าน) ·
`queue-freshness` (QUEUE เทียบ git log) · `evidence-complete` ขยาย (งาน UI: screenshots ไม่ว่าง + INDEX + SHA/วันที่)
ปลดจอด 2 ตัว (เงื่อนไขทำแล้ว): `report-integrity` (registry:48) · `tier-check` (fetch-depth:0 + เข้า DEFAULT check-done)

## สิ่งที่ไม่แตะ (ยืนยันข้อห้าม dispatch)
เงินทุกมิติ (L3 เข้มขึ้น ไม่ผ่อน) · secret (L2 คงเดิม + fail-loud) · status vocab 3 ค่า · escalation ทุกข้อ · deploy = operator เท่านั้น
