# Node 24 proof — 2026-09-26

BASE sha: `9ce3db3088d8aaa5b21b28ae38c97a9d3644106a` (origin/main at task start)
Worktrees: `/home/ubuntu/work/wt-node24` (branch `chore/node-24`) · `/home/ubuntu/work/wt-node20-proof` (detached control) — both at BASE
Node/pnpm: `v20.20.2` / `8.15.0` (control) vs `v24.21.0` / `8.15.0` (proof) · `nvm alias default` stayed `20` throughout
Install: both sides `pnpm install --frozen-lockfile --config.engine-strict=false` — `Done in 9.1s` (20) / `Done in 11s` (24) · `prisma generate` (v5.22.0) succeeded on both
Signing key (`apps/backend/keys/private.pem`): **key untouched** on both runs (mtime diff empty before/after)

## Comparison

| App | Metric | Node 20 | Node 24 | Match |
|---|---|---|---|---|
| backend | suites (total/passed/skipped/failed) | 875 / 844 / 31 / 0 | 875 / 843 / 31 / 1 | suites/skipped match; failed differs by 1 |
| backend | tests (total/passed/skipped/failed) | 11070 / 10863 / 207 / 0 | 11070 / 10862 / 207 / 1 | total/skipped match; failed differs by 1 |
| backend | failedFiles | `[]` | `["__tests__/integration/pdf-ssrf-interception.test.js"]` | see resolution below |
| backend | jest exit | 0 | 1 | differs (caused by the one file above) |
| web-app | tsc --noEmit exit | 0 | 0 | IDENTICAL |
| web-app | next build (lint-enabled) exit | 0 | 0 | IDENTICAL |
| web-app | jest suites/tests (total/passed) | 387 / 3190 (all passed) | 387 / 3190 (all passed) | IDENTICAL |

## Diff resolution — pdf-ssrf-interception (plan Step 8)

Full-suite run: failed once on Node 24, passed on Node 20. Isolated rerun of `__tests__/integration/pdf-ssrf-interception.test.js` alone, 3× per Node version, each run with a fresh `SIGNING_KEY_DIR`, `--json --outputFile` captured, and key mtime checked before/after — artifacts at `proof/step8-{20,24}-run{1,2,3}.json` (raw jest json + log outside repo: `/home/ubuntu/work/node24-proof-out/step8/{20,24}-run{1,2,3}.{json,log}`):

| Node | run1 | run2 | run3 | key untouched |
|---|---|---|---|---|
| 20 | pass 3/3 (`step8-20-run1.json`) | pass 3/3 (`step8-20-run2.json`) | pass 3/3 (`step8-20-run3.json`) | yes, all 3 runs |
| 24 | pass 3/3 (`step8-24-run1.json`) | pass 3/3 (`step8-24-run2.json`) | pass 3/3 (`step8-24-run3.json`) | yes, all 3 runs |

Per the plan's own criterion ("ตกบน 24 อย่างน้อยหนึ่งรอบ [ของการรันเดี่ยว] และผ่านบน 20 ครบสามรอบ = พังจริง"): Node 24 did **not** fail in any of its 3 isolated runs, so this does not qualify as a real Node-24 break. It reproduces only under the full-suite's memory/CPU pressure and matches the pre-existing local flake already on record (`local-full-suite-needs-3gb-heap.md`: "pdf-ssrf always times out locally"). Conclusion: **known local-infra flake, not a Node 24 regression** — recorded here per Step 8, not treated as a stop condition.

## Verdict

**GO** — Node 24 does not break backend or web-app behavior at BASE. tsc/build/jest counts identical on web-app; backend suite/test/skipped counts identical, the single failed-file diff resolved as flaky (not Node-version-caused).

## Raw logs (outside repo, not committed)

`/home/ubuntu/work/node24-proof-out/` — `backend-{20,24}.log/json`, `webapp-{tsc,build}-{20,24}.log`, `webapp-{20,24}.log/json`, `key-mtime-{before,after}-{20,24}.txt`

## อิมเมจ (Task 4 — build จริงจาก git archive ของสองคอมมิต)

Control = `gacp-backend:proof-node20-9ce3db3088d8` build จาก BASE `9ce3db3088d8aaa5b21b28ae38c97a9d3644106a` (Dockerfile ยังเป็น `node:20-alpine` ที่คอมมิตนี้) · Proof = `gacp-backend:proof-node24-27fb2d5f32bb` + `gacp-frontend:proof-node24-27fb2d5f32bb` build จาก HEAD `27fb2d5f32bbad8498ff321542d65e5f31f7d621` (`chore/node-24` หลัง Task 3 — `node:24-alpine` ทุก stage) · ทั้งสามอิมเมจ build จาก `git archive <sha> | tar -x` ใส่ไดเรกทอรีสะอาด (ไม่ใช่ worktree) — ตรวจแล้วว่า `apps/backend/keys/` มีแต่ `README.md`/`WHY.md` ใต้ quarantine ไม่มีกุญแจจริงหลุดเข้าบิลด์ · tag `proof-*` เท่านั้น ไม่ push ไม่แตะ container/tag ที่รันจริง

| Metric | node20 (control) | node24 (proof) | ผลต่าง |
|---|---|---|---|
| `node --version` | `v20.20.2` | `v24.21.0` | ตามแผน |
| `/etc/alpine-release` | `3.23.4` | `3.24.2` | เพิ่มตาม base image ใหม่ |
| chromium (`chromium-browser --version`) | `Chromium 148.0.7778.178 Alpine Linux` | `Chromium 152.0.7977.82 Alpine Linux` | `/usr/bin/chromium-browser` มีอยู่ทั้งคู่ ตรงกับ `PUPPETEER_EXECUTABLE_PATH` |
| image size (`docker image inspect --format size`) | 1,518,834,681 bytes (≈1.52 GB) | 1,571,406,631 bytes (≈1.57 GB) | ใหญ่ขึ้น ~3.5% |
| sharp | `sharp 0.35.4 vips 8.18.6 234 bytes` PNG จริง | `sharp 0.35.4 vips 8.18.6 234 bytes` PNG จริง — ไบต์เท่ากันทุกไบต์ | เหมือนกัน |
| chromium PDF (ภาษาไทย) | `pdf 28004 bytes` — เปิดแล้วเห็นหัว "ทดสอบ image-smoke" + `v20.20.2` ถูกรูปภาษาไทย | `pdf 28215 bytes` — เปิดแล้วเห็นหัวเดียวกัน + `v24.21.0` ถูกรูปภาษาไทย | ต่างกันเล็กน้อยจาก metadata/เวอร์ชัน chromium — เนื้อหาที่เห็นตรงกัน |
| `prisma migrate deploy` (postgres:17-alpine ชั่วคราว) | `All migrations have been successfully applied.` | `All migrations have been successfully applied.` | เหมือนกัน |
| `GET /api/health` (backend บูตจริง NODE_ENV=development) | `dbStatus":{"status":"connected"...}` | `dbStatus":{"status":"connected"...}` | เหมือนกัน |
| `image-smoke.sh` exit | `0` (PASS, ใส่ major=20 ตรง) | `0` (PASS, ใส่ major=24 ตรง) | ทั้งคู่ PASS — Node 24 ไม่พังอะไรที่ image-smoke ตรวจ |

Selftest ของ `scripts/ops/image-smoke.sh` เอง (ก่อนบิลด์อิมเมจข้างต้น รันกับ `ghcr.io/jonmaxmore/gacp-backend:local-3636bcd8f32a` ที่มีอยู่แล้วในเครื่อง): ใส่ major ถูก (`20`) → PASS 20s · ใส่ major ผิด (`24` กับอิมเมจ v20 จริง) → FAIL exit 1 ที่ข้อ `node-major` เท่านั้น ข้ออื่น PASS ตามจริง — พิสูจน์ว่า script จับความผิดพลาดได้จริงไม่ใช่เขียวมั่ว

Frontend proof (`gacp-frontend:proof-node24-27fb2d5f32bb`, build args แบบ production จริง: `GIT_SHA`/`BUILT_AT`/`NEXT_PUBLIC_PWA_ENABLED=false` เท่านั้น — **ไม่ใส่** `NEXT_PUBLIC_API_URL` ตรงกับ `.github/workflows/production.yml:218-220` ที่ไม่ตั้งตัวแปรนี้เลยตอน build จริง ต่างจาก runbook build บนเครื่อง staging ที่ตั้งไว้): `GET /api/webapp-version` → `{"revision":"27fb2d5f32bbad8498ff321542d65e5f31f7d621","builtAt":"2026-09-26T11:33:46Z"}` ตรง HEAD · `GET /` → `307` ไป `/auth` (พฤติกรรมปกติของแอป ไม่ใช่ error) ตามด้วย `200` ที่ `/auth` · `node --version` ในคอนเทนเนอร์ = `v24.21.0` · ภาพเต็มหน้าอยู่ที่ `image/frontend-node24.png` — เปิดแล้วเห็นหน้า "เข้าสู่ระบบ" จริง ไม่ใช่หน้า error

ไฟล์: `image/facts.txt` · `image/frontend-node24.png` · `image/node20/{pdf.pdf,sharp.png,node-version.log,health.log}` · `image/node24/{pdf.pdf,sharp.png,node-version.log,health.log}`

ข้อจำกัด: (1) `image-smoke.sh` บูต backend ด้วย `NODE_ENV=development` และ postgres/redis ชั่วคราว trust-auth เท่านั้น — ยังไม่พิสูจน์ production mode (ต้อง secret จริง = งาน deploy ของ operator) (2) frontend proof ทดสอบพอร์ตตรง (`127.0.0.1:13024`) ข้าม nginx/โดเมนจริง — ผ่านตรงนี้ยังต้องผ่านบนโดเมนจริงอีกครั้งหลัง deploy staging (3) postgres proof ใช้ `postgres:17-alpine` (เดียวกับที่ image-smoke.sh กำหนด) ไม่ใช่เวอร์ชัน Supabase จริงของ staging/demo
