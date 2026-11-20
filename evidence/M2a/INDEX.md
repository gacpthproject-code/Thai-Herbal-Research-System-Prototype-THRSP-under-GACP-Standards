# Evidence — M2a Requirement Engine (feat/m2a-requirement-engine) — 2026-08-15

Plan: `docs/superpowers/plans/2026-08-15-m2a-requirement-engine.md` (rev.2) · Spec: M2 rev.2 §3 + AC1-3
Audit: รอบ 1 **FAIL** (F1 CRITICAL ประตู 5 ลอด DRAFT · F2 CRITICAL stamp ปลอมได้ · F3 HIGH กติการายพืชไม่มีวันยิง) → fix `22ad8ce4` → รอบ 2 **PASS** (auditor ทำ PoC เดิมซ้ำทั้งสาม + mutation 3/3 ถูกฆ่า)

| ไฟล์ | คืออะไร | ผล |
|---|---|---|
| `t1-red.txt` / `t1-green.txt` / `t1-jest-skip.txt` | T1 ตาราง `requirement_rules` + migration + seed (drift-check offline) | schema/DDL match ครบ · HAS_DB skip = **PENDING(staging)** |
| `t2-red.txt` / `t2-green.txt` / `t2-mutation.txt` | T2 service append-only (effective dating + มิติ null=ครอบทุกค่า) | module-not-found → 12 passed · mutation 4/4 ถูกฆ่า |
| `t3-red.txt` / `t3-green.txt` / `t3-regression.txt` | T3 admin API (whitelist สามมิติ + สืบ auth จาก parent) | 40 tests เขียว |
| `t4-red.txt` / `t4-green.txt` / `t4-regression.txt` | T4 ตัวเช็ค + stamp + 5 ประตู | 14 behavioral fails → เขียว · lane เขียว |
| `fix-red.txt` / `fix-green.txt` / `fix-regression.txt` | fix cycle audit F1/F2/F3 (ประตู 5 อ่าน status · merge ผ่าน applyClientFormData + serverFormDataPatch · ปฏิเสธ plantCode) | 9 failed → 76 passed · regression 207/207 |
| `fix2-error-catalog-green.txt` | `APPLICATION_INCOMPLETE` เข้า error catalog (จับโดย gate เต็ม) | 11/11 passed ที่ `5dd1c3f4` |
| `tier-check.txt` | tier ของ branch ตามเครื่อง | **TIER=C** (prisma migration+schema) = operator merge |
| `gate-local-full.txt` | `LOCAL_GATE_FULL=1` heap 3GB ที่ **SHA `22ad8ce4`** (ประทับท้ายไฟล์) | probes แดง 3 baseline เดิมของ main · suite **7587 passed / 2 failed / 126 skipped (HAS_DB)** — แดง (1) `pdf-ssrf-interception` = PDF renderer ของเครื่อง (diff ไม่มี path pdf — ยืนยันใน session) (2) `error-codes-catalog` = **ของจริงจาก diff เรา แก้แล้วที่ `5dd1c3f4`** (fix2 — diff ระหว่างสอง SHA มีแค่ catalog entry + evidence จึงไม่รัน gate เต็มซ้ำ) |

**Chain ความสมบูรณ์ของ gate:** gate เต็มรันที่ `22ad8ce4` → suite เดียวที่แดงจาก diff (error-codes-catalog) ถูกแก้ที่ `5dd1c3f4` และรันเขียวเดี่ยว → การเปลี่ยนแปลงระหว่างสอง SHA = entry ใน `shared/error-codes.js` + ไฟล์ evidence เท่านั้น (ตรวจได้จาก `git diff 22ad8ce4..5dd1c3f4 --stat`)

สถานะที่ห้ามเคลม: DB-side ทั้งหมด (seed จริง / 422 บน Postgres / stamp persist จริง) = **PENDING(staging)** — วิ่งใน full-gate ของ staging · full-gate attestation ของ SHA นี้ยังไม่มี · กติการายพืช = ปฏิเสธที่ admin จนกว่า gate จะส่งมิติพืช (M2b+)
