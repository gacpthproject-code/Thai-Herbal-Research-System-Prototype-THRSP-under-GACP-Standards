# Evidence — M1 PR-B (feat/m1-holder-readers) — 2026-08-15

Plan: `docs/superpowers/plans/2026-08-15-membership-m1-farm-holds-certificate.md` Tasks B1-B3 · audit: PASS รอบแรก (no findings — auditor รันเทสซ้ำเองทุก lane + ตรวจ green-mask)

| ไฟล์ | คืออะไร | ผล |
|---|---|---|
| `b1-red.txt` / `b1-green.txt` | RED→GREEN ของ `public-verify-holder-display.test.js` (helper mask ตามประเภท + JSON additive + SSR + PDF mapper) | 8 failed → 10 passed |
| `b1-regression.txt` | suites เดิม verify/interop/template รันไม่แก้ | 72+4 passed — ไม่มีเทสเดิมต้องพลิก |
| `b1-ratchet.txt` | ratchet หลัง B1 | PASS (43/59/168/2) |
| `b2-interop-red.txt` / `b2-interop-green.txt` | RED→GREEN interop additive + version bump 1.0.0→1.1.0 | 4 failed → 6 passed |
| `b2-fe-red.txt` / `b2-fe-green.txt` | RED→GREEN หน้าเว็บ verify (label "ผู้ถือใบรับรอง") | 2 failed → 17 passed |
| `b2-regression.txt` / `b2-webcheck.txt` / `b2-ratchet.txt` | regression 95 passed · tsc --noEmit ผ่าน · ratchet PASS | — |
| `b3-red.txt` / `b3-green.txt` | RED→GREEN erasure guard D8 (select holderType + wipe LEGACY_PERSON/INDIVIDUAL, JURISTIC/COMMUNITY ไม่แตะ) | 3 failed → 30 passed |
| `b3-jest-skip.txt` | integration `m1-erasure-holder-survives` บนเครื่องนี้ | skip (HAS_DB) — **PENDING(staging)** |
| `b3-related-suites.txt` / `b3-ratchet.txt` | lane (pdpa\|erasure\|m1-) 233 passed · ratchet PASS | — |
| `gate-local-full.txt` | `LOCAL_GATE_FULL=1` heap 3GB ที่ **SHA `b139beb5`** (ประทับท้ายไฟล์) | probes แดง 3 ตัว baseline เดิมของ main (`deploy-drift`/`gate-attestation`/`main-attestation-audit` — gate-attestation = เงื่อนไข Tier C เปิดอยู่: ต้อง full-gate บน staging) · **unit suite เขียวหมด: 7415 passed / 0 failed / 114 skipped (HAS_DB)** |

สถานะที่ห้ามเคลม: erasure integration บน Postgres จริง (AC4 ระดับ DB) = PENDING(staging) · **view-pack AC6 (ภาพ PDF + หน้า verify ก่อน/หลัง) ยังไม่ทำ — ต้องรันบน staging หลัง deploy** · full-gate attestation ของ `b139beb5` ยังไม่มี
