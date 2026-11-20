# Evidence — Phase 0 รอบ 2026-08-19: ท่อเดินจริงครบเส้น C01→C15 บน Postgres จริง

SHA_UNDER_TEST `369a3685` (= main หลัง merge fix/phase0-flow-proof-blockers) + fix ที่เกิดในรอบเดิน (commit รอบนี้)
Stack: laptop `next dev`:3000 (heap 3GB) + backend `node server.js`:8000 → Supabase จริง + `stripe listen` (test mode) — detached ทั้งหมด
เริ่ม 2026-08-18 22:37 → จบ 2026-08-19 03:24 (Asia/Bangkok) · **verdict: เส้นหลัก C01→C15 ✅ ครบ** — ดูตารางเต็ม + FINDINGS ทั้ง 7 ใน `FINDINGS.md`

## เปิดดูอะไรก่อน

| ไฟล์ | คืออะไร |
|---|---|
| **`WALKTHROUGH.html`** | หน้าเดียวไล่ภาพจริง C01→C15 จากบนลงล่าง — จุด view-in-the-loop หลักของรอบนี้ |
| `FINDINGS.md` | ทะเบียน FINDING สะสม (รอบก่อน + รอบนี้ 7 ตัว: 5 fixed-TDD, 2 recorded) + ตารางผลราย checkpoint |
| `VARS.md` | interface ระหว่าง segment (id เกษตรกร/คำขอ/ใบรับรอง — append-only, ไม่มี secret) |

## Walk-2 (เส้นที่จบ) — artifact ราย segment

ทุก segment มี: screenshot ทุก step + DB dump before/after ราย checkpoint + audit dump + trace/video (`test-output/`) + response ดิบของ hop สำคัญ

| โฟลเดอร์ | checkpoint | หมายเหตุ |
|---|---|---|
| `s01/` | C01-C02 สมัคร→ยื่น | payload Option-1 เติม `areaUnit` แล้ว (บทเรียน walk-1) |
| `settlement/` | C03-C04 จ่ายงวด 1 | SETTLED + journal สมดุล + ใบเสร็จแยก (C04-erp-*) |
| `s02/` | C05-C06 แจกงาน+ส่งกลับแก้ | dropdown reviewer มีรายชื่อ (fix เดิมพิสูจน์) |
| `s03/` | C07-C08 ยื่นกลับ+อนุมัติ | reviewer คนเดิม + ใบงวด 2 |
| `s04/` | C09-C10 จ่ายงวด 2 | **เขียวเต็ม segment ในรันเดียว** — จุดที่รอบก่อน FAIL |
| `s05/` | C11-C12 นัด+ตรวจภาคสนาม | gate fail-closed พิสูจน์ + GPS/รูป 5/5/checklist 24/24 · C12 จบด้วย resume driver (เหตุ+ลำดับใน `C12-summary.txt`, source driver ใน `C12-resume-driver-source.txt`) · `FIX-auditor-dropdown/` = RED→GREEN pack |
| `s06/` | C13-C15 อนุมัติ→CERTIFIED→จอเกษตรกร+verify | C14 ผ่านประตู UI จริง (work inbox) · PDF 2 ไฟล์ (ปุ่ม UI + bytes) · portal "ผ่าน" · resume driver sources ใน `C14/C15-resume-driver-source.txt` |
| `s07-seams/` | seams A/C/B | 3/3 บน fixture ของตัวเอง (ฉบับ rewrite post-fix) |

## Walk-1 (specimen ค้าง — หลักฐาน FINDING)

| โฟลเดอร์ | คืออะไร |
|---|---|
| `walk1-blocked-specimen/` | ทั้งเส้น C01→C12 ของแอป `f866374a…` ที่ค้างถาวรที่ AUDIT_CONFIRMED (F-PLOT-AREAUNIT-DEADEND) — จ่ายจริง 2 งวด ตรวจครบ ใบไม่ออก · รวม s04 post-hoc ERP verify + FIX-auditor-dropdown RED→GREEN |
| `red-1-cold-compile/` | trace/video ของรอบแดง cold-compile (F-LOGIN-NAV-COLD-COMPILE) |

## สิ่งที่ห้ามเข้าใจผิด

- C12 และ C13-C15 ของ walk-2 จบแบบ **ประกอบหลาย run** (สาเหตุ: FINDING จริงขวางกลางเส้นแล้วแก้แบบ TDD ระหว่างทาง) — ทุก run บันทึกครบ ลำดับเล่าใน `s05/C12-summary.txt` + `FINDINGS.md` · ไม่มีขั้นไหนใช้ /api/e2e หรือเขียน DB ตรง
- ใบรับรอง mint ที่ AUDIT_PASSED (ก่อน APPROVED/CERTIFIED) — recorded per ruling D2, ticket แยก
- จอเกษตรกรรอบนี้ถ่าย desktop viewport — มาตรฐานมือถือ 390×844 เป็นของรอบ QA เต็ม ไม่ใช่ walk พิสูจน์ท่อ
