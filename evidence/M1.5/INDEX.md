# Evidence — M1.5 hardening (feat/m1.5-hardening) — 2026-08-15

Spec: `docs/superpowers/specs/2026-08-15-m1.5-hardening-design.md` (rev.3) · Plan: `docs/superpowers/plans/2026-08-15-m1.5-hardening.md` (rev.2)
Audit: รอบ 1 **FAIL** (CRITICAL-1/2 president.idCard + comment เท็จ, HIGH-1, MEDIUM-1/2) → fix `1137fbe0` → รอบ 2 **PASS** (auditor รันซ้ำเองทุกข้อ + mutation ×2 byte-match)

| ไฟล์ | คืออะไร | ผล |
|---|---|---|
| `h1-red.txt` / `h1-green.txt` | T1 ปิดทางยึด workspace (claim guard + 409 HTTP + ถอด legacy materialise) | 12 failed → 362 passed (lane) |
| `h2-red.txt` / `h2-green.txt` / `h2-lane-entities.txt` | T2 mask เลขบัตร (shapeEntityResponse 3 endpoint) | 11 failed → 11 passed · lane 368 passed |
| `h3-red.txt` / `h3-green.txt` / `h3-regression.txt` | T3 ฟาร์ม entity-first + สามคลาส update | 5 failed → 5 passed · regression เขียว |
| `h4-red.txt` / `h4-green.txt` / `h4-mutation-red.txt` | T4 ถอดประตู role เก่า (guard ตัดสินเดียว) + mutation-proof | 3 failed → 17+65 passed · mutation แดงจริง |
| `audit-fix-red.txt` / `audit-fix-green.txt` / `audit-fix-mutation-red.txt` | fix cycle จาก audit: president.idCard mask + ACTIVE pin | 1 failed → 89 passed · mutation ACTIVE แดงจริง |
| `tier-check.txt` | tier ของ diff ตามเครื่อง | **TIER=B** — ตรงกับ probe-vs-plan conflict F4 ที่บันทึกแล้ว (`BACKLOG-FOUND.md`) · ปฏิบัติแบบ C: operator merge |
| `gate-local-full.txt` | `LOCAL_GATE_FULL=1` heap 3GB ที่ **SHA `1137fbe0`** (ประทับท้ายไฟล์) | probes แดง 3 baseline เดิมของ main (`deploy-drift`/`gate-attestation`/`main-attestation-audit` — attestation = เงื่อนไขเปิด ต้อง full-gate บน staging) · suite **7481 passed / 1 failed / 118 skipped (HAS_DB)** — แดงเดียว = `pdf-ssrf-interception` (PDF renderer ของเครื่อง — `git diff main...HEAD` ไม่มี path pdf ยืนยันใน session) |

สถานะที่ห้ามเคลม: พฤติกรรมระดับ DB จริง (claim guard / farm resolution บน Postgres) = PENDING(staging) — วิ่งใน full-gate ของ staging ตาม runbook เดิม · full-gate attestation ของ `1137fbe0` ยังไม่มี
