# Full local gate — ทั้ง session (T&T · application-v2 · staff · finance) เทียบ baseline

รัน: `NODE_OPTIONS=--max-old-space-size=3072 LOCAL_GATE_FULL=1 bash scripts/ci/local-gate.sh`
บนต้นไม้สะอาด (รอบสุดท้าย: หลัง B6 + cleanup + legal register) · baseline: `/home/ubuntu/backups/local-gate-b1.txt`

`RESULT: FAIL` เป็นเรื่องปกติของ repo นี้ — gate แดงบน main อยู่แล้ว เกณฑ์คือ
**"ไม่มีความล้มเหลวใหม่"** ตามที่ตกลงไว้ ผลเต็มอยู่ที่ `compare-output.txt`

| | baseline | รอบนี้ |
|---|---|---|
| probe FAIL | 5 | **5 (ชื่อเดิมทุกตัว)** |
| suite FAIL | 4 | **2** |
| test FAIL | 8 | **4** |
| ผ่าน | 9,767 | **10,298** |
| suite ทั้งหมด | 755 | 813 |

**ไม่มีความล้มเหลวใหม่** และของเดิมหายไป 2 suite / 4 test:

- `error-codes-catalog` — รหัส `CYCLE_FROZEN` (T1) กับ `LAB_FILE_REQUIRED`/`LAB_NAME_REQUIRED`
  (T10) ไม่เคยถูกลงทะเบียน · ลงครบพร้อม `remediation` และ `source` แบบ `path:line`
- `application-status-writer-cert-hook-evidence-gate` (3 เทส) — fixture ไม่ได้ระบุพืช
  การออกใบ fail-closed กับพืชที่ resolve ไม่ได้ ⇒ control case ตายที่ด่านพืชและไม่เคยไปถึง
  evidence gate ที่ suite นี้มีไว้ทดสอบ · ตอนนี้มันเฝ้า gate จริง

## หมายเหตุเรื่องรอบที่ 5-7

รอบ 5 พบ 3 ratchet แดงจากงานชุดนี้เอง (soft-delete registry, tenant-scope registry,
PR-A0-2 hop inventory) — ทั้งสามทำหน้าที่ถูก แก้แล้วที่ `94394805` ·
รอบ 7 จับตอนแก้ค้างกลางคัน (4 assertion ที่ปักสัญญาเก่าของ probe ใบรับรอง) แก้เสร็จก่อนรอบนี้ ·
รอบนี้คือรอบที่ต้นไม้สะอาดและไม่มีการแก้ระหว่างรัน

## สัญญาที่เครื่องถือไว้ และ **รันจริงบน CI** (2026-09-06)

สามสวีทที่เขียนตอบคำถามของ operator โดยตรง ถูกใส่เข้าทั้งรายการที่ CI รันและด่านที่ยืนยันว่า
"รันจริง ไม่ใช่ข้าม" (จำนวน suite 8 → 11) — เพราะสวีทที่ self-skip เมื่อไม่มีฐานข้อมูล
จะขึ้นเขียวโดยไม่เคยทำงาน ซึ่งเคยเกิดกับ repo นี้มาแล้ว

| สัญญา | ตอบคำถามไหน | mutation |
|---|---|---|
| `public-scan-scope-contract` | ข้อมูลเปิดให้สแกนได้แค่ไหน | หยุดส่งที่อยู่ → แดง · ปล่อยพิกัด → แดง |
| `staff-scope-contract` | พนักงานแต่ละบทบาทเห็นได้แค่ไหน | ขอบเขตกว้างเกิน → แดง · fail-open → แดง |
| `staff-chain-assign-then-see` | งานที่มอบหมายถึงมือคนรับไหม | ถอดเงื่อนไข reviewerId → แดง |
| `officer-review-round-trip` | วงจรตรวจเอกสารเดินครบไหม | ปิดกฎ "ต้องมีเหตุผล" → แดง · ปิดกฎ "ต้องครบก่อนรับ" → แดง |
| `farmer-tnt-flow` | เกษตรกรอัปเดตข้อมูลและออก QR ถูกต้องไหม | ปิดการแช่แข็ง → แดง · ปิดการมินต์รหัสแปลง → แดง · ปิดการปฏิเสธค่าพิมพ์เอง → แดง |

ทำซ้ำงาน CI ในเครื่องแล้ว: **13 suites · 72 tests · skipped = 0 · failedSuites = 0**
