# Evidence — M1 PR-C (feat/m1-submit-guard) — 2026-08-15

Plan: `docs/superpowers/plans/2026-08-15-membership-m1-farm-holds-certificate.md` Tasks C1-C2 (+ fix cycle จาก audit)
Audit: รอบ 1 **FAIL (CRITICAL F1: ประตูที่ 5)** → fix `3bdd1019` → รอบ 2 **PASS** (auditor reproduce RED กับ commit แม่ + mutation จริง 3 ตัว + ไล่ bypass angle ครบ)

| ไฟล์ | คืออะไร | ผล |
|---|---|---|
| `c1-red.txt` / `c1-green.txt` | RED→GREEN guard กลาง `assertSubmitAllowed` (12 เคส) | module ไม่มี → 12 passed |
| `c1-grantable-red.txt` / `c1-grantable-green.txt` | RED→GREEN pin grantable set | 2 failed → 13 passed |
| `c1-manager-escalation-red.txt` | mutation พิสูจน์ B1 ของ review: เพิ่มสิทธิ์ดื้อๆ → MANAGER ได้ 200 แทน 403 จริง | 4 failed (หลักฐานว่า pin กัด) |
| `c1-manager-pin.txt` | MANAGER ยังถูก 403 หลังทำ Step 3b ถูกวิธี | 10 passed |
| `c1-regression.txt` / `c1-ratchet.txt` / `c1-audit-notnull-red.txt` | lane เดิม 92 passed · ratchet PASS · RED ของ NOT-NULL audit fix | — |
| `c2-red.txt` / `c2-green.txt` | RED→GREEN พลิกเทส opt-in + เสียบ 4 ประตู | behavioral fails → เขียว |
| `c2-jest-skip.txt` | integration m1-submit-enforcement (HAS_DB) | skip — **PENDING(staging)** |
| `c2-regression.txt` / `c2-ratchet.txt` | lane กว้าง เขียว · ratchet PASS | — |
| `c2-full-suite.txt` | ความพยายาม full suite ของ implementer (heap 2GB) | OOM — แทนที่ด้วย gate-local-full.txt |
| `c3-door5-red.txt` / `c3-door5-green.txt` | **ประตูที่ 5** (audit F1 CRITICAL): PUT /:id/revision — RED 4 เคสก่อน gate → GREEN 17/17 | 4 failed → 17 passed |
| `c3-regression.txt` | lane กว้างหลัง fix | 275 passed / 0 failed |
| `gate-local-full.txt` | `LOCAL_GATE_FULL=1` heap 3GB ที่ **SHA `3bdd1019`** (ยืนยันจากบรรทัด gate-attestation ในไฟล์ · wrapper โดน kill หลัง suite summary — note ท้ายไฟล์) | probes แดง 3 baseline เดิมของ main (`deploy-drift`/`gate-attestation`/`main-attestation-audit`) · suite **7453 passed / 1 failed / 118 skipped (HAS_DB)** — ตัวแดงเดียว = `pdf-ssrf-interception` (PDF renderer ของเครื่อง — `git diff main...HEAD` ไม่มี path pdf, ยืนยันใน session) |

**เรื่องที่ส่งถึงโต๊ะ operator (บันทึกใน BACKLOG-FOUND.md ท้ายไฟล์):**
1. **F2** — ช่อง re-point `entityId` ที่ `POST /api/applications/prepare` (id ใน body) — 3 ทางเลือก รอเคาะ
2. **F4** — tier-check ให้ **TIER=B** ขัดกับ plan ที่ประกาศ C (path-based classifier ไม่เห็นคำ auth/permission ใน path) — probe-vs-plan conflict ตาม CLAUDE.md §8 · ระหว่างรอ: ปฏิบัติแบบ Tier C (operator merge)

สถานะที่ห้ามเคลม: AC2/AC3 ระดับ DB (แถว AuditLog จริง + GRANT จริง) = PENDING(staging) · full-gate attestation ของ `3bdd1019` ยังไม่มี
