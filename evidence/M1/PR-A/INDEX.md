# Evidence — M1 PR-A (feat/m1-holder-expand) — 2026-08-15

Plan: `docs/superpowers/plans/2026-08-15-membership-m1-farm-holds-certificate.md` Tasks A1-A3

| ไฟล์ | คืออะไร | ผล |
|---|---|---|
| `a1-prisma-generate.txt` | `npx prisma generate --schema prisma/schema` หลังเพิ่ม 3 field | exit 0 |
| `a2-jest-skip.txt` | `m1-holder-backfill.test.js` บนเครื่อง dev (ไม่มี DATABASE_URL) | skip ตาม HAS_DB pattern — **DB-side = PENDING(staging)** |
| `a3-red.txt` | RED ก่อน implement: `certificate-holder-resolver.test.js` | 3 failed (`resolveHolderForIssuance is not a function`) |
| `a3-green.txt` | GREEN หลัง implement | 3 passed |
| `a3-regression.txt` | เทสเดิม `certificate-service` ทั้งชุด | 30 passed / ไม่มีแดงเพิ่ม |
| `a5-red.txt` | tripwire การต่อสาย (F7 re-audit): `certificate-issuance-holder-wiring.test.js` รันกับ service เวอร์ชันก่อน A3 (`git checkout 010f1b13 -- ...`) | 2 failed — พิสูจน์ว่าเทสจับการถอนสายได้จริง |
| `a5-green.txt` | ไฟล์เดียวกัน รันกับ HEAD ขณะนั้น (`4426934f`) | 2 passed |
| `a6-mutantB-red.txt` | mutation ปิดรู F9: ถอน `include: { entity: true }` ของ findFirst เส้น reuse-by-address ชั่วคราว แล้วรัน tripwire ที่เพิ่มเคส address แล้ว | 1 failed (เคส address) — รูที่ mutant B เคยลอดถูกปิด |
| `a6-green.txt` | restore แล้วรันซ้ำ | 3 passed |
| `a4-tier-check.txt` | `scripts/probes/tier-check.sh` บน diff ของ branch | **TIER=C** (prisma structural) = operator merge |
| `a4-local-gate-full.txt` | `LOCAL_GATE_FULL=1 local-gate.sh` ที่ **SHA `66ad38ad`** (โค้ดตัวสุดท้ายของ PR — SHA ประทับท้ายไฟล์) · NODE_OPTIONS=--max-old-space-size=3072 (heap default 2GB ตาย OOM รันไม่จบ — กับดักใหม่ของเครื่อง 8GB) | probes แดง **3 ตัว**: `deploy-drift` (เครื่องนี้ยิง gacpth.com ไม่ถึง — network) · `main-attestation-audit` (หนี้เก่าบน main: 13/13 gated commits ไม่มี attestation) · **`gate-attestation` — ยังไม่มี full-gate attestation ของ SHA นี้: นี่คือเงื่อนไข Tier C ที่ยังเปิดอยู่ ต้องรัน `scripts/ci/full-gate.sh` บนเครื่อง staging (runbook: `docs/operations/runbooks/full-gate-on-staging.md`) ก่อน/พร้อมการ merge — ไม่ใช่ noise** · unit suite: **7392 passed / 1 failed / 112 skipped (HAS_DB)** — ตัวแดงเดียวคือ `pdf-ssrf-interception.test.js` (timeout 60s; รอบก่อนแดง 3 เคส รอบนี้ 1 = ความไม่เสถียรของ PDF renderer บนเครื่องนี้) · `git diff main...HEAD --name-only | grep -i pdf` = ว่าง — branch ไม่แตะ path PDF ใดๆ |

สถานะที่ห้ามเคลม: backfill จริงบน Postgres (AC5) — ต้องรันบน staging เท่านั้น (เครื่องนี้ไม่มี DB — ตรวจแล้ว: ไม่มี DATABASE_URL / port 5432 ปิด / ไม่มี docker) · เทส PDF ข้างบนต้องเห็นเขียวบนเครื่องที่ render PDF ได้ (staging/CI) ก่อนถือว่าปิดสนิท · full-gate attestation ของ `66ad38ad` ยังไม่มี (ดูแถว a4)
