# ปรับเวอร์ชัน · packages · tools — แผนเฟส 3-4 (Node 24 · jest 30 · probe deps-health)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ย้าย Node 20 (หมดอายุ 2026-04-30) ขึ้น 24 ทั้งต้นไม้และอิมเมจ แล้วรวม jest เป็นเมเจอร์เดียว (30) — โดยมี probe `deps-health` ถือเส้นไว้ไม่ให้สองเรื่องนี้ย้อนกลับเงียบ ๆ อีก

**Architecture:** เฟส 3 = สาขา `chore/node-24`: พิสูจน์บน Node 24 ก่อนแตะอะไร (หยุดได้) → สร้าง probe (RED บนต้นไม้) → ปักเมเจอร์ 24 ทุกแหล่ง (GREEN) → build อิมเมจจริงเทียบกับอิมเมจ Node 20 ที่ build จากคอมมิตฐานเดียวกัน → operator merge + deploy staging → demo · เฟส 4 = สาขา `chore/jest-30` แตกจาก main หลังเฟส 3 ลง: probe เพิ่มข้อ jest (RED) → ยก jest (GREEN) พิสูจน์ด้วยตัวเลขชุดเดียวกันก่อน-หลัง

**Tech Stack:** Node 24 (nvm) · pnpm 8.15.0 · Docker `node:24-alpine` · Prisma 5.22.0 · puppeteer 24.35.0 + chromium ของ alpine · sharp 0.35.4 · jest 30.2.0 · bash probes (`scripts/probes/_lib.sh`)

**Spec:** `docs/superpowers/specs/2026-09-26-versions-packages-tools-refresh-design.md` (เฟส 3 · เฟส 4 · probe `deps-health`) · แผนก่อนหน้า: `docs/superpowers/plans/2026-09-26-versions-tools-refresh-phase-1-2.md`

## Global Constraints

- deploy ทุกชนิด และ merge Tier C = operator เท่านั้น (CLAUDE.md L5) · agent **เขียนขั้น deploy ให้ operator รัน ไม่รันเอง** · push main ได้เฉพาะหลังคำว่า "merge" และตรวจด้วย `git ls-remote origin main` เสมอ · ไม่มี push ในแผนนี้นอกจากนั้น
- tier ตัดสินด้วย `scripts/probes/tier-check.sh` เท่านั้น — Dockerfile · docker-compose · `.github/workflows` · `scripts/probes/` = Tier C (วัดจาก C_STRUCTURAL ใน tier-check.sh:54-65)
- cover ทุกรูป (waiver, manual, baseline ขึ้น) = operator (L6) · แถว `ci` ใหม่ในทะเบียน probe ไม่ใช่ cover
- ไม่อัปเมเจอร์ใดนอกจาก Node และ jest (spec "สิ่งที่แบบนี้ไม่ทำ") — ทุกครั้งที่ lockfile เปลี่ยน ต้องพิสูจน์ว่าไม่มี (ชื่อ, เมเจอร์) ใหม่นอกตระกูล jest
- ปัก `node:24-alpine` **ห้ามใช้ `node:lts-alpine`** (tag `lts` กระโดดไป 26 เองวันที่ 2026-10-28) · `engines.node` = `"24.x"` · `.nvmrc` = `24`
- ถ้า Node 24 ทำอะไรพังใน Task 1: **หยุด รายงาน** — ถอยไป 22 ต้องมีมติ operator ไม่ตัดสินเอง
- ห้ามแตะโค้ดเงิน (L3)
- ก่อนและหลังรัน jest ทุกครั้ง: จด mtime ของ `/home/ubuntu/work/GACP-Certification-Application/apps/backend/keys/private.pem` (กุญแจจริง ต้องเท่าเดิม) · ตั้ง `SIGNING_KEY_DIR` เป็นไดเรกทอรีใหม่ทุกรอบ (`mktemp -d`) ไม่ใช้ค่าปริยายของ jest.setup.js:146
- backend full suite ต้องมี `NODE_OPTIONS=--max-old-space-size=3072`
- เกณฑ์ gate = "ไม่มีความล้มเหลวใหม่" เทียบ attestation ล่าสุดของ main ใน `evidence/gate/` (ณ วันเขียน = `09884dabbbfe6db95891d3a61dcb3b80f785b22e.json` ตก 5: `suite-green` `integration-pg` `secret-scan-deep` `probe-ci` `integration-no-skip`) — เทียบทั้งชื่อ check และเหตุผล ไม่ใช่แค่ชื่อ
- หลักฐานจำนวนเทส = suites / tests / skipped / รายชื่อไฟล์ที่ตก **เท่ากันก่อน-หลัง** ไม่ใช่แค่ "เขียว"
- ห้ามพิมพ์ค่า env/secret ออกหน้าจอ · log ดิบเก็บนอกรีโป คอมมิตเฉพาะสรุป
- ท้ายข้อความคอมมิตทุกใบ:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01RRHmfYKxvxwbaJYaBnHbhU
  ```

## ข้อเท็จจริงที่วัดแล้ว (2026-09-26 บน main 38d0b22d) — ใช้ในแผน ไม่ต้องวัดซ้ำก่อนเริ่ม

**ที่ปัก Node วันนี้ — 21 แหล่ง เป็น 20 ทั้งหมด** (ผลรัน `deps-health` ร่างของแผนนี้กับต้นไม้จริง):
- `apps/backend/Dockerfile:7,59` · `apps/web-app/Dockerfile:7,79` — `FROM node:20-alpine` (builder + runner)
- `docker-compose.qa.yml:42,78` — `image: node:20-alpine`
- `package.json:134` `"node": "20.x"` · `apps/backend/package.json:70` `"node": "20.x"` · **`apps/web-app/package.json` และ `packages/validation/package.json` ไม่มี engines**
- `.nvmrc` = 20 · **`.node-version` = 20 อีกไฟล์** · `.npmrc` = `engine-strict=true` (+ คอมเมนต์บรรทัด 1-3 อ้าง 20.x / node:20-alpine)
- `.github/workflows`: `NODE_VERSION` ที่ ci.yml:21 · production.yml:70 · e2e-staging-nightly.yml:36 · staging-walkthrough.yml:42 · `node-version` literal ที่ frontend-lint-ratchet.yml:42 · infrastructure-contract-guard.yml:39 · backend-qc-golden.yml:56 (+คอมเมนต์ :53) · carpet-bomb-test.yml:30,67 · topology-guard.yml:41 · generate-api-clients.yml:41
- ข้อความอื่น: `scripts/ops/run-walkthrough.sh:76` "install Node 20.x first" · `scripts/security/aws-secrets-manager.js:145` มี `FROM node:18-alpine` อยู่ใน string ที่สคริปต์พิมพ์ (ไม่ใช่ Dockerfile — แผนนี้ไม่แตะ)

**engine-strict กัดจริง** (ทดลองใน scratch: engines 24.x + engine-strict บน Node 20 → `pnpm install` exit 1 "Unsupported engine") ⇒ วันนี้ `pnpm install` บน Node 24 **ล้มทันที** ถ้าไม่ใส่ `--config.engine-strict=false` · หลัง merge เฟส 3 กลับกัน: เครื่อง/worktree ที่ยังเป็น Node 20 จะ install ไม่ได้

**Node:** เครื่องมี nvm ติดตั้งแค่ v20.20.2 (`nvm alias default` → 20) · pnpm อยู่ใต้ v20 เท่านั้น (`~/.nvm/versions/node/v20.20.2/bin/pnpm`) · Node 24 ล่าสุด = v24.21.0 (2026-09-07) · ตาราง nodejs/Release schedule.json: 20 end 2026-04-30 · 22 end 2027-04-30 · **24 lts 2025-10-28 · maintenance 2026-10-20 · end 2028-04-30** · 26 lts 2026-10-28
- โค้ดของเราไม่เรียก API ที่ Node 22-24 ถอด (grep 0 จุด: `util.is*` `crypto.createCipher` `createSecurePair` `new Buffer(` `process.binding` `SlowBuffer` `url.parse(` `fs.rmdir recursive` `assert.CallTracker`)

**native / engines (จาก pnpm-lock.yaml):** prisma + @prisma/client + @prisma/engines 5.22.0 `engines >=16.13` · `binaryTargets = ["native","debian-openssl-3.0.x","linux-musl-openssl-3.0.x"]` (`prisma/schema/_base.prisma:6`) · sharp 0.35.4 `>=20.9.0` (มาจาก `pnpm.overrides` ราก — `apps/backend/package.json:47` ยังเขียน `^0.34.5`) · puppeteer 24.35.0 `>=18` ใช้ chromium ของ alpine (`PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser`, Dockerfile:81-82) · next 15.5.26 `>=20` · jest 30.2.0 `^18.14 || ^20 || ^22 || >=24` · อิมเมจ backend ติดตั้งด้วย `--ignore-scripts` (Dockerfile:18)

**jest:** backend `jest ^29.7.0` คู่ `babel-jest ^30.2.0` · web-app `jest ^30.2.0` + `ts-jest ^29.4.6` (peer `jest: ^29.0.0 || ^30.0.0` — resolve กับ jest 30.2.0 อยู่แล้ว, backend ไม่ใช้ ts-jest) · **`package.json` ราก ก็มี `jest ^29.7.0`** + `jest.config.cjs` รากชี้ projects → backend · lockfile มี jest 29.7.0 + 30.2.0 และ babel-jest 29.7.0 + 30.2.0
- breaking ของ jest 30 ในเทส backend (863 ไฟล์): matcher alias ที่ถูกถอด (`toBeCalled` `toBeCalledWith` `lastCalledWith` `toReturn*` `toThrowError` ฯลฯ) **0 จุด** · snapshot **0 ไฟล์** · `genMockFromModule` 0 · `jest.restoreAllMocks` **6 ไฟล์** (พฤติกรรมเปลี่ยนใน 30 — ดูก่อนถ้าตัวเลขขยับ): lot-quota-counts-printed-tombstones · auth-idp-routes · certificate-farm-resolution · server-boot-secret-sentinel · wizard-draft-document-path-confinement · invoice-route-ordering
- flag ที่เปลี่ยนชื่อ `--testPathPattern` → `--testPathPatterns`: **`package.json:51` `test:smoke:api` ใช้ชื่อใหม่อยู่แล้ว ⇒ พังวันนี้บน 29.7.0** (วัด: `Unrecognized option "testPathPatterns"` exit 1) · ชื่อเก่าอยู่ที่ `.github/workflows/ci.yml:510,574` · `production.yml:145`
- ที่เรียก jest CLI: `scripts/probes/suite-green.sh:6` (parse บรรทัด `^Tests:`) · `settle-webhook-only.sh:130` + `webhook-idempotent.sh:5` (`-t`) · `scripts/ci/local-gate.sh:38` (`--ci --silent`) · `scripts/ci/full-gate.sh:969` (`--json --outputFile` แล้วอ่าน `numPassedTests` `numPendingTests`) · `scripts/ci/production-readiness-check.js:122`

**pnpm audit (วันนี้):** critical 0 · high 15 · moderate 11 · low 4 · `pnpm.auditConfig.ignoreCves` = CVE-2026-14257 · **exit code ใช้ไม่ได้**: มีช่องโหว่ = 1 และออฟไลน์ = 1 เหมือนกัน · ออฟไลน์ด้วยค่าปริยายลองซ้ำเกิน 60 วินาที · `--config.fetch-retries=0` ตอบ `{"error":{"code":"ECONNREFUSED",…}}` ใน 0.6 วินาที

**gate / deploy:** attestation ล่าสุดบน main = `09884dab` (2026-09-25, node v20.20.2) · suite-green ในนั้น: 868 suites / 10,782 tests / 33 failed / 54 skipped (รวม integration บน Postgres จริง) · probe-ci ตกเพราะ gate-attestation · main-attestation-audit · no-secret · probe-gate ถือ BLOCKED/PENDING เป็น "note ไม่ gate" (probe-gate.js:224) · probe ทุกไฟล์ใน `scripts/probes/*.sh` ต้องมีแถวในทะเบียนพอดีหนึ่งแถว ไม่งั้น gate FAIL
- คอนเทนเนอร์ที่รันอยู่: `gacp-{backend,frontend}-{staging,demo}` บน `local-3636bcd8f32a` (= tag ย้อนกลับ) · **ไม่มีคอนเทนเนอร์แยกของ gacpth.com บนเครื่องนี้**
- `~/work/state/deploy-rce-patch-20260926.sh <staging|demo> <tag>`: ตรวจ DIRECT_URL ว่าเป็นโปรเจกต์ถูกตัว → pg_dump สำรอง + ตรวจ marker → `prisma migrate status` → `migrate deploy` ด้วยอิมเมจใหม่ → `compose up -d --no-deps` เฉพาะ backend+frontend ของ env นั้น · ย้อนกลับ = รันซ้ำด้วย tag เดิม · ไม่มีส่วนไหนผูกกับ RCE นอกจากคอมเมนต์หัวไฟล์ ⇒ ใช้ซ้ำได้ตรง ๆ
- build อิมเมจบนเครื่อง: `docs/operations/runbooks/build-images-on-the-box.md` (tag `local-<sha12>` · frontend ต้องมี `--build-arg NEXT_PUBLIC_API_URL/…PWA_ENABLED/…CHECKOUT_UI_ENABLED`) · web-app Dockerfile:74 ใช้ `next build --no-lint`

**สูตรพิสูจน์อิมเมจ (`scripts/ops/image-smoke.sh` ใน Task 4) รันจริงแล้วกับอิมเมจ Node 20 ที่ใช้งานอยู่** (`local-3636bcd8f32a`, 31 วินาที): node v20.20.2 · sharp 0.35.4 / vips 8.18.6 สร้าง PNG · chromium เรนเดอร์ PDF ภาษาไทยได้ (เปิดดูแล้ว ตัวอักษรไทยถูก) · `prisma migrate deploy` "All migrations have been successfully applied" บน postgres:17-alpine ชั่วคราว · `/api/health` `dbStatus: connected` · ใส่เมเจอร์ที่คาดผิด (24) → FAIL exit 1 ถูกต้อง · ไม่เหลือคอนเทนเนอร์/เครือข่ายค้าง
**ร่าง probe `deps-health` (Task 2 + 6) รันแล้ว:** selftest 15/15 · ปิดข้อ node-eol หรือ jest-major ทีละข้อ → เคสของข้อนั้นเป็น ✗ (เคสไม่ได้ผ่านลอย ๆ) · กับต้นไม้จริง: FAIL 2 ข้อ — `node-eol: Node 20 หมดอายุ 2026-04-30 — เลยมา 149 วัน` · `jest-major: (29 30)`

## สิ่งที่แผนนี้ตีความเพิ่มจาก spec (เหตุผลจากการวัดข้างบน)

1. **จุดปักมากกว่าที่ spec นับ** — spec ระบุ Dockerfile / engines ทั้งสาม / .nvmrc / workflows · ต้นไม้จริงมี `.node-version` และ `docker-compose.qa.yml` ด้วย และ web-app ไม่มี engines ⇒ แผนแก้ทั้งหมด และ probe อ่านทั้งหมด
2. **jest ต้องยกที่รากด้วย** — spec นับ backend กับ web-app · รากมี `jest ^29.7.0` ⇒ ถ้าไม่ยก probe ข้อ jest-major ไม่มีวันเขียว
3. **probe ลงทะเบียน `ci` ตั้งแต่เฟส 3 ด้วย 3 ข้อ (node-pin · node-eol · audit)** แล้วเฟส 4 เพิ่มข้อ jest-major · เพราะ probe-gate FAIL ทันทีถ้ามี `.sh` ที่ไม่ลงทะเบียน และถ้าลงทะเบียนพร้อมข้อ jest ในเฟส 3 มันจะแดงจนจบเฟส 4 (ต้องใช้ waiver = operator) — แบบนี้ "สร้างในเฟส 3 เปิดใช้ครบในเฟส 4" ตาม spec โดยไม่ต้องขอ cover
4. **เพิ่ม `scripts/ops/image-smoke.sh`** — spec สั่ง "build อิมเมจจริงและบูต backend ในคอนเทนเนอร์" · ใช้สามครั้ง (อิมเมจคุม Node 20 · อิมเมจ Node 24 · หลังเฟส 4) และ operator ใช้ซ้ำได้ ⇒ เป็นไฟล์ ไม่ใช่คำสั่งยาวที่พิมพ์ซ้ำ
5. **เพิ่ม `scripts/tools/jest-summary.js`** — เกณฑ์ "จำนวนเท่าเดิม" ต้องเทียบด้วยเครื่อง (diff สองไฟล์) ไม่ใช่ตาอ่าน log
6. **ปลายทาง deploy = staging → demo** · spec เขียน "→ gacpth.com" ด้วย แต่เครื่องนี้มีแค่คอนเทนเนอร์ -staging/-demo ⇒ เป็นคำถามถึง operator (ท้ายแผน) ไม่ใช่ขั้นที่แผนเดาเอง
7. **`@types/node` คงที่ `^20`** (`apps/web-app/package.json:65`) — ยกเป็น 24 = เมเจอร์ของแพ็กเกจอื่น ซึ่ง spec ห้ามในเฟส 1-4 · types ของ 20 เป็นเซ็ตย่อยของ runtime 24 จึงไม่ผิด แค่ไม่เห็น API ใหม่ · คำถามถึง operator

## แผนที่ไฟล์

| ไฟล์ | หน้าที่ | Task |
|---|---|---|
| `scripts/tools/jest-summary.js` (ใหม่) | ย่อผล `jest --json` ให้ diff กันได้ | 1 |
| `evidence/node24-2026-09-26/` (ใหม่) | สรุปผลพิสูจน์ 20 vs 24 + ผลอิมเมจ + INDEX.md | 1, 4 |
| `scripts/probes/deps-health.sh` (ใหม่) | probe — Node เมเจอร์เดียว/ไม่หมดอายุ · audit ไม่มี critical · (เฟส 4) jest เมเจอร์เดียว | 2, 6 |
| `scripts/probes/node-release-schedule.txt` (ใหม่) | ข้อมูลวันหมดอายุ Node — ไม่ใช่ literal ในสคริปต์ | 2 |
| Dockerfile ×2 · compose.qa · package.json ×3 · .nvmrc · .node-version · .npmrc · workflows ×10 · run-walkthrough.sh · probe-registry.txt | ปัก 24 + ลงทะเบียน probe | 3 |
| `scripts/ops/image-smoke.sh` (ใหม่) | พิสูจน์ native modules + บูตในอิมเมจจริง | 4 |
| package.json ราก + backend · pnpm-lock.yaml · workflows ×2 | jest 30 + flag ใหม่ | 7 |
| `evidence/jest30-<วันที่>/` (ใหม่) | ตัวเลขก่อน-หลัง | 7 |

---

## เฟส 3 — สาขา `chore/node-24`

### Task 1: พิสูจน์บน Node 24 ก่อนเปลี่ยนอะไร — จุดหยุดได้

**Files:**
- Create: `scripts/tools/jest-summary.js`
- Create: `evidence/node24-2026-09-26/proof/{backend,webapp}-{20,24}.summary.json` · `proof/checks.txt` · `INDEX.md`

**Interfaces:**
- Produces: worktree `/home/ubuntu/work/wt-node24` (สาขา `chore/node-24`, node_modules ติดตั้งด้วย Node 24) · worktree คุม `/home/ubuntu/work/wt-node20-proof` (detached, Node 20) · `BASE` = sha ของ origin/main ที่ทั้งสองแตกออกมา (ใช้ใน Task 4 เป็นอิมเมจคุม) · `node scripts/tools/jest-summary.js <jest-json>` → JSON `{suites,suitesFailed,suitesSkipped,suitesRuntimeError,tests,passed,failed,skipped,todo,failedFiles[]}` · log ดิบใน `OUT=/home/ubuntu/work/node24-proof-out`

- [ ] **Step 1: worktree สองตัวที่คอมมิตเดียวกัน**

```bash
R=/home/ubuntu/work/GACP-Certification-Application
git -C $R fetch origin && BASE=$(git -C $R rev-parse origin/main) && echo "BASE=$BASE"
git -C $R worktree add -b chore/node-24 /home/ubuntu/work/wt-node24 "$BASE"
git -C $R worktree add --detach /home/ubuntu/work/wt-node20-proof "$BASE"
mkdir -p /home/ubuntu/work/node24-proof-out
```
Expected: สอง worktree ที่ `git rev-parse HEAD` = BASE · จด BASE ไว้ในรายงาน (Task 4 ใช้)

- [ ] **Step 2: ติดตั้ง Node 24 โดยไม่เปลี่ยน default ของเครื่อง**

```bash
source ~/.nvm/nvm.sh
nvm install 24 --no-progress
nvm alias default 20          # default ของเครื่องเปลี่ยนเมื่อ operator สั่งใน Task 5 เท่านั้น
nvm use 24 && npm install -g pnpm@8.15.0
node --version && pnpm --version | tee /home/ubuntu/work/node24-proof-out/versions-24.txt
```
Expected: `v24.x.y` (วัดวันเขียน: v24.21.0) · `8.15.0` · `nvm alias default` ยังชี้ 20

- [ ] **Step 3: ติดตั้ง dependency ทั้งสองฝั่งด้วยคำสั่งเดียวกัน**

`--config.engine-strict=false` จำเป็นฝั่ง 24 เพราะ engines ยังเป็น 20.x (ข้อเท็จจริง engine-strict ข้างบน) — ใส่ทั้งสองฝั่งให้สมมาตร **ไม่คอมมิตอะไรที่ปิด engine-strict**

```bash
cd /home/ubuntu/work/wt-node20-proof && source ~/.nvm/nvm.sh && nvm use 20 >/dev/null && pnpm install --frozen-lockfile --config.engine-strict=false 2>&1 | tail -3
cd /home/ubuntu/work/wt-node24     && source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && pnpm install --frozen-lockfile --config.engine-strict=false 2>&1 | tail -3
```
Expected: ทั้งสองจบ `Done in …` · postinstall `prisma generate` ผ่าน (Prisma 5.22 บน 24 คือความเสี่ยงหลักที่ spec ชี้ — ถ้าตกตรงนี้ = หยุดตาม Step 9)

- [ ] **Step 4: เขียน `scripts/tools/jest-summary.js` ใน wt-node24**

```js
#!/usr/bin/env node
// jest-summary — ย่อผล `jest --json` ให้เหลือสิ่งที่เทียบกันได้ระหว่างสองรอบ (Node 20 vs 24 · jest 29 vs 30)
// ตัวเลขทุกตัวมาจาก jest เอง · failedFiles เรียงแล้ว path ตัดเหลือหลัง apps/<app>/ ให้เทียบข้าม worktree ได้
// ใช้: node scripts/tools/jest-summary.js <jest-json>  → พิมพ์ JSON (diff สองไฟล์นี้ตรงๆ ได้)
const path = require('path');
const j = require(path.resolve(process.argv[2]));
const short = (n) => n.replace(/^.*?\/apps\/(backend|web-app)\//, '');
console.log(JSON.stringify({
  suites: j.numTotalTestSuites,
  suitesFailed: j.numFailedTestSuites,
  suitesSkipped: j.numPendingTestSuites,
  suitesRuntimeError: j.numRuntimeErrorTestSuites,
  tests: j.numTotalTests,
  passed: j.numPassedTests,
  failed: j.numFailedTests,
  skipped: j.numPendingTests,
  todo: j.numTodoTests,
  failedFiles: j.testResults.filter((r) => r.status === 'failed').map((r) => short(r.name)).sort(),
}, null, 1));
```
(รันแล้วกับไฟล์เทสเดียวบน main: พิมพ์ `suites 1 · tests 2 · passed 2 · failedFiles []`)

- [ ] **Step 5: backend full suite — Node 20 แล้ว Node 24 (ทีละรอบ ห้ามขนาน: 3 GB heap ต่อรอบ)**

รันเบื้องหลัง ใช้เวลานาน · แทน `<V>` ด้วย `20` (ใน wt-node20-proof) แล้ว `24` (ใน wt-node24):

```bash
OUT=/home/ubuntu/work/node24-proof-out; KEY=/home/ubuntu/work/GACP-Certification-Application/apps/backend/keys/private.pem
cd <worktree>/apps/backend && source ~/.nvm/nvm.sh && nvm use <V> >/dev/null
stat -c '%y' $KEY > $OUT/key-mtime-before-<V>.txt
export SIGNING_KEY_DIR="$(mktemp -d /tmp/gacp-jest-key-<V>-XXXXXX)"
NODE_OPTIONS=--max-old-space-size=3072 npx jest --silent --forceExit --json --outputFile=$OUT/backend-<V>.json > $OUT/backend-<V>.log 2>&1; echo "jest exit=$?"
stat -c '%y' $KEY > $OUT/key-mtime-after-<V>.txt; diff $OUT/key-mtime-before-<V>.txt $OUT/key-mtime-after-<V>.txt && echo "key untouched"
node /home/ubuntu/work/wt-node24/scripts/tools/jest-summary.js $OUT/backend-<V>.json > $OUT/backend-<V>.summary.json
```
Expected: `key untouched` ทั้งสองรอบ · มีไฟล์ summary ทั้งสอง (exit ของ jest ไม่ใช่เกณฑ์ — เกณฑ์คือ Step 7)

- [ ] **Step 6: web-app — tsc · next build ที่เปิด lint · jest (ทั้งสอง Node)**

```bash
OUT=/home/ubuntu/work/node24-proof-out
cd <worktree>/apps/web-app && source ~/.nvm/nvm.sh && nvm use <V> >/dev/null
npx tsc --noEmit -p tsconfig.json > $OUT/webapp-tsc-<V>.log 2>&1; echo "tsc-<V> exit=$?" | tee -a $OUT/checks.txt
NEXT_TELEMETRY_DISABLED=1 pnpm exec next build > $OUT/webapp-build-<V>.log 2>&1; echo "build-<V> exit=$?" | tee -a $OUT/checks.txt
node node_modules/jest/bin/jest.js --json --outputFile=$OUT/webapp-<V>.json > $OUT/webapp-<V>.log 2>&1
node /home/ubuntu/work/wt-node24/scripts/tools/jest-summary.js $OUT/webapp-<V>.json > $OUT/webapp-<V>.summary.json
```
`next build` **ไม่ใส่ `--no-lint`** (38d0b22d ทำให้ lint-enabled build เขียวแล้ว) · build ล้มเพราะ env ที่เครื่องไม่มี = BLOCKED รายงานตามจริง ห้ามเลี่ยง
Expected: `tsc-20 exit=0` `tsc-24 exit=0` `build-20 exit=0` `build-24 exit=0`

- [ ] **Step 7: เทียบ — เครื่องตัดสิน**

```bash
cd /home/ubuntu/work/node24-proof-out
diff backend-20.summary.json backend-24.summary.json && echo "backend IDENTICAL"
diff webapp-20.summary.json webapp-24.summary.json && echo "webapp IDENTICAL"
grep -E 'exit=' checks.txt
```
Expected: `backend IDENTICAL` · `webapp IDENTICAL` · exit ของ tsc/build ตรงกันทั้งสองฝั่ง

- [ ] **Step 8: ถ้า diff ไม่ว่าง — แยก flaky ออกจากของพังจริง**

สำหรับทุกไฟล์ที่อยู่ใน `failedFiles` ฝั่งเดียว: รันเดี่ยวสามรอบทั้งสอง Node
```bash
for i in 1 2 3; do SIGNING_KEY_DIR=$(mktemp -d) NODE_OPTIONS=--max-old-space-size=3072 npx jest <ไฟล์> --silent --forceExit 2>&1 | grep -E '^Tests:'; done
```
ตกบน 24 อย่างน้อยหนึ่งรอบ และผ่านบน 20 ครบสามรอบ = **พังจริง** · ตกทั้งสองฝั่ง (เช่น pdf-ssrf ที่ timeout ในเครื่องเสมอ) = ของเดิม บันทึกไว้

- [ ] **Step 9: จุดหยุด** — ถ้ามีอย่างใดอย่างหนึ่ง: ไฟล์พังจริงจาก Step 8 · จำนวน tests/suites/skipped ต่างกัน · tsc/build ต่างกัน · install/prisma generate ตกบน 24 → **หยุดทั้งแผน** เขียน `Status: BLOCKED(operator: Node 24 ทำ <อะไร> พัง — ถอยไป 22 หรือแก้ต้นเหตุ ต้องมีมติ)` แนบ path ของ log · ห้ามแก้เองเพื่อให้ผ่าน

- [ ] **Step 10: คอมมิตหลักฐาน (สรุปเท่านั้น log ดิบอยู่นอกรีโป)**

```bash
cd /home/ubuntu/work/wt-node24 && E=evidence/node24-2026-09-26/proof && mkdir -p $E
cp /home/ubuntu/work/node24-proof-out/{backend,webapp}-{20,24}.summary.json /home/ubuntu/work/node24-proof-out/checks.txt $E/
```
`evidence/node24-2026-09-26/INDEX.md` — ตารางเดียว: แถว backend / web-app · คอลัมน์ Node 20 / Node 24 (suites · tests · failed · skipped · tsc · build) · บรรทัด BASE sha · เวอร์ชัน node/pnpm · "key untouched" · ตำแหน่ง log ดิบ
```bash
git add scripts/tools/jest-summary.js evidence/node24-2026-09-26
git commit -m "evidence(node24): พิสูจน์ก่อนเปลี่ยน — backend + web-app บน Node 20 กับ 24 ที่คอมมิตเดียวกัน ตัวเลขเท่ากัน

<ตัวเลขจาก INDEX.md: suites/tests/failed/skipped ทั้งสองฝั่ง · tsc/build exit>
jest-summary.js ย่อผล jest --json ให้ diff กันได้ — ใช้ซ้ำในเฟส 4

<attribution lines>"
```

### Task 2: probe `deps-health` (node-pin · node-eol · audit) — RED บนต้นไม้

**Files:**
- Create: `scripts/probes/node-release-schedule.txt`
- Create: `scripts/probes/deps-health.sh`

**Interfaces:**
- Consumes: wt-node24 จาก Task 1
- Produces: `bash scripts/probes/deps-health.sh` → exit 0 PASS / 1 FAIL (พิมพ์ทุกข้อที่ตก) / 2 BLOCKED · `--selftest` · env fixture `DEPS_HEALTH_ROOT` `DEPS_HEALTH_SCHEDULE` `DEPS_HEALTH_TODAY` `DEPS_HEALTH_AUDIT_JSON` · ฟังก์ชันภายใน `check_node_pin` `check_node_eol` `check_audit` `major_of` `tracked` `rel` + ตัวสะสม `FAILS` `BLOCKS` `WARNS` (Task 6 เพิ่ม `check_jest_major` ที่ใช้ของเหล่านี้)

- [ ] **Step 1: ไฟล์ข้อมูล** — วันหมดอายุเป็นข้อมูล ไม่ใช่ literal ในสคริปต์ (หลัก operator "ไม่ hardcode")

`scripts/probes/node-release-schedule.txt`:
```
# node-release-schedule — วันหมดอายุของ Node แต่ละเมเจอร์ (ข้อมูล ไม่ใช่ literal ในสคริปต์)
# อ่านโดย scripts/probes/deps-health.sh · ที่มา: https://raw.githubusercontent.com/nodejs/Release/main/schedule.json
# คัดลอกเมื่อ 2026-09-26 · เพิ่มแถวเมื่อจะย้ายเมเจอร์ — ห้ามแก้วัน end ให้ probe เขียว (วันมาจาก nodejs/Release เท่านั้น)
# รูปแบบ: <major> | <lts> | <maintenance> | <end>
20 | 2023-10-24 | 2024-10-22 | 2026-04-30
22 | 2024-10-29 | 2025-10-21 | 2027-04-30
24 | 2025-10-28 | 2026-10-20 | 2028-04-30
26 | 2026-10-28 | 2027-10-20 | 2029-04-30
```

- [ ] **Step 2: สคริปต์ + selftest** — `scripts/probes/deps-health.sh`:

```bash
#!/usr/bin/env bash
# deps-health — เวอร์ชันของเครื่องมือหลักต้องพูดเสียงเดียวกัน และต้องยังไม่หมดอายุ
#
# ทำไมมี: Node 20 หมดอายุ 2026-04-30 แล้ว production ยังรันต่ออีกห้าเดือนโดยไม่มีใครรู้
# (spec docs/superpowers/specs/2026-09-26-versions-packages-tools-refresh-design.md) ·
# และ jest สองเมเจอร์อยู่ในรีโปเดียว (backend ^29 คู่ babel-jest ^30 · web-app ^30)
#
# FAIL เมื่อ:
#   node-pin   เมเจอร์ Node ใน Dockerfile* · docker-compose*.yml (image: node:) · engines.node
#              ของทุก package.json · .nvmrc · .node-version · .github/workflows (ค่า literal)
#              ไม่ตรงกัน · หรือไม่ได้ปักเมเจอร์ (node:lts-alpine, engines ">=20") · หรือไม่มี .nvmrc
#   node-eol   เมเจอร์นั้นเลยวัน end ใน node-release-schedule.txt (เตือนล่วงหน้า 60 วัน — ไม่ FAIL)
#   audit      pnpm audit มี critical
# BLOCKED เมื่อ: pnpm audit ตอบไม่ได้ (ออฟไลน์/registry ล่ม — ไม่ใช่ PASS) · เมเจอร์ไม่มีในไฟล์ข้อมูล
# FAIL ชนะ BLOCKED: ถ้ามีทั้งสองอย่าง exit 1
#
# ไม่อ่าน (พิมพ์ทุกครั้ง): node_modules/ · .claude/worktrees/ · ค่า ${{ env.X }} ใน workflow
# (อ่านเฉพาะตัวที่ประกาศ literal) · Node ที่ติดตั้งบนเครื่อง (node --version) · high/moderate ของ audit
# ใช้:  bash scripts/probes/deps-health.sh [--selftest]
#       DEPS_HEALTH_ROOT DEPS_HEALTH_SCHEDULE DEPS_HEALTH_TODAY DEPS_HEALTH_AUDIT_JSON = fixture
source "$(dirname "$0")/_lib.sh"
SCAN_ROOT="${DEPS_HEALTH_ROOT:-$ROOT}"
SCHEDULE="${DEPS_HEALTH_SCHEDULE:-$(cd "$(dirname "$0")" && pwd)/node-release-schedule.txt}"
TODAY="${DEPS_HEALTH_TODAY:-$(TZ=Asia/Bangkok date +%F)}"
WARN_DAYS=60

FAILS=(); BLOCKS=(); WARNS=()

# find ที่ตัด node_modules / .git / worktree ซ้อน / build output ทิ้ง
tracked() { # $@ = find predicates
    find "$SCAN_ROOT" \( -name node_modules -o -name .git -o -name .next -o -path "$SCAN_ROOT/.claude/worktrees" \) -prune -o \( "$@" \) -type f -print 2>/dev/null
}
rel() { printf '%s' "${1#"$SCAN_ROOT"/}"; }
major_of() { # "24" "24.x" "^24.1" "24-alpine" "v24.21.0" → 24 · อย่างอื่น → ว่าง
    printf '%s' "$1" | sed -nE 's/^[v^~]?([0-9]+)([.-].*)?$/\1/p'
}

check_node_pin() {
    local rows="" f line tag m v
    while IFS= read -r f; do
        while IFS= read -r line; do
            tag="$(printf '%s' "$line" | sed -nE 's/^[[:space:]]*FROM[[:space:]]+node:([^[:space:]]+).*/\1/p')"
            [ -z "$tag" ] && continue
            m="$(major_of "$tag")"
            [ -z "$m" ] && { FAILS+=("node-pin: $(rel "$f"): FROM node:$tag ไม่ปักเมเจอร์ (tag lts/current จะกระโดดเมเจอร์เอง)"); continue; }
            rows+="$m $(rel "$f") FROM node:$tag"$'\n'
        done < "$f"
    done < <(tracked -name 'Dockerfile*')
    while IFS= read -r f; do
        while IFS= read -r tag; do
            m="$(major_of "$tag")"
            [ -z "$m" ] && { FAILS+=("node-pin: $(rel "$f"): image node:$tag ไม่ปักเมเจอร์"); continue; }
            rows+="$m $(rel "$f") image node:$tag"$'\n'
        done < <(sed -nE 's/^[[:space:]]*image:[[:space:]]*["'\'']?node:([^"'\''[:space:]]+).*/\1/p' "$f")
    done < <(tracked -name 'docker-compose*.yml' -o -name 'docker-compose*.yaml')
    local root_engines=0
    while IFS= read -r f; do
        v="$(node -e 'const p=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write((p.engines&&p.engines.node)||"")' "$f" 2>/dev/null)"
        [ -z "$v" ] && continue
        [ "$f" = "$SCAN_ROOT/package.json" ] && root_engines=1
        m="$(major_of "$v")"
        [ -z "$m" ] && { FAILS+=("node-pin: $(rel "$f"): engines.node \"$v\" ไม่ใช่การปักเมเจอร์ (ใช้รูป \"24.x\")"); continue; }
        rows+="$m $(rel "$f") engines.node=$v"$'\n'
    done < <(tracked -name package.json)
    [ "$root_engines" = 1 ] || FAILS+=("node-pin: package.json (ราก) ไม่มี engines.node")
    if [ -f "$SCAN_ROOT/.nvmrc" ]; then
        v="$(tr -d '[:space:]' < "$SCAN_ROOT/.nvmrc")"; m="$(major_of "$v")"
        [ -z "$m" ] && FAILS+=("node-pin: .nvmrc \"$v\" ไม่ใช่การปักเมเจอร์") || rows+="$m .nvmrc=$v"$'\n'
    else
        FAILS+=("node-pin: ไม่มี .nvmrc")
    fi
    if [ -f "$SCAN_ROOT/.node-version" ]; then
        v="$(tr -d '[:space:]' < "$SCAN_ROOT/.node-version")"; m="$(major_of "$v")"
        [ -z "$m" ] && FAILS+=("node-pin: .node-version \"$v\" ไม่ใช่การปักเมเจอร์") || rows+="$m .node-version=$v"$'\n'
    fi
    while IFS= read -r f; do
        while IFS= read -r v; do
            m="$(major_of "$v")"; [ -n "$m" ] && rows+="$m $(rel "$f") node-version=$v"$'\n'
        done < <(sed -nE 's/^[[:space:]]*(node-version|NODE_VERSION):[[:space:]]*["'\'']?([0-9][^"'\''[:space:]]*).*/\2/p' "$f")
    done < <(tracked -path '*/.github/workflows/*' \( -name '*.yml' -o -name '*.yaml' \))

    [ -n "$rows" ] || { BLOCKS+=("node-pin: ไม่พบที่ปัก Node สักแห่ง — ตรวจศูนย์แหล่ง = ไม่ได้ตรวจ"); return; }
    echo "node-pin: $(printf '%s' "$rows" | grep -c .) แหล่ง"
    printf '%s' "$rows" | sed 's/^/  /'
    local majors; majors="$(printf '%s' "$rows" | awk 'NF{print $1}' | sort -u)"
    if [ "$(printf '%s\n' "$majors" | grep -c .)" -gt 1 ]; then
        FAILS+=("node-pin: เมเจอร์ไม่ตรงกัน ($(printf '%s' "$majors" | tr '\n' ' ')) — แหล่งที่ต่างจากส่วนใหญ่:
$(printf '%s' "$rows" | awk -v top="$(printf '%s' "$rows" | awk 'NF{print $1}' | sort | uniq -c | sort -rn | awk 'NR==1{print $2}')" 'NF && $1!=top' | sed 's/^/    /')")
    fi
    NODE_MAJOR="$(printf '%s' "$rows" | awk 'NF{print $1}' | sort | uniq -c | sort -rn | awk 'NR==1{print $2}')"
}

check_node_eol() {
    [ -n "${NODE_MAJOR:-}" ] || return
    [ -f "$SCHEDULE" ] || { BLOCKS+=("node-eol: ไม่มีไฟล์ข้อมูล $SCHEDULE"); return; }
    local eol left
    eol="$(awk -F'|' -v m="$NODE_MAJOR" '$1 !~ /^[[:space:]]*#/ { gsub(/[[:space:]]/,"",$1); gsub(/[[:space:]]/,"",$4); if ($1==m) print $4 }' "$SCHEDULE" | head -1)"
    [ -n "$eol" ] || { BLOCKS+=("node-eol: Node $NODE_MAJOR ไม่มีแถวใน $(basename "$SCHEDULE") — เพิ่มจาก nodejs/Release schedule.json"); return; }
    left=$(( ( $(date -d "$eol" +%s) - $(date -d "$TODAY" +%s) ) / 86400 ))
    if [ "$left" -lt 0 ]; then
        FAILS+=("node-eol: Node $NODE_MAJOR หมดอายุ $eol — เลยมา $((-left)) วัน (วันนี้ $TODAY)")
    elif [ "$left" -le "$WARN_DAYS" ]; then
        WARNS+=("node-eol: Node $NODE_MAJOR จะหมดอายุ $eol — เหลือ $left วัน เริ่มย้ายเมเจอร์")
        echo "node-eol: Node $NODE_MAJOR หมดอายุ $eol (เหลือ $left วัน)"
    else
        echo "node-eol: Node $NODE_MAJOR หมดอายุ $eol (เหลือ $left วัน)"
    fi
}

check_audit() {
    local json
    if [ -n "${DEPS_HEALTH_AUDIT_JSON:-}" ]; then
        json="$(cat "$DEPS_HEALTH_AUDIT_JSON" 2>/dev/null)"
    else
        command -v pnpm >/dev/null 2>&1 || { BLOCKS+=("audit: ไม่มี pnpm บนเครื่อง"); return; }
        # exit code ของ pnpm audit ใช้ไม่ได้: เจอช่องโหว่ = 1 · ออฟไลน์ = 1 เหมือนกัน (วัด 2026-09-26)
        # fetch-retries=0: ค่าปริยายลองซ้ำจนเกิน 60 วินาทีเมื่อออฟไลน์ (วัด 2026-09-26)
        json="$(cd "$SCAN_ROOT" && timeout 120 pnpm audit --json --config.fetch-retries=0 2>/dev/null)"
    fi
    local verdict
    verdict="$(printf '%s' "$json" | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
  let j; try { j=JSON.parse(s) } catch { console.log("BLOCKED\tตอบไม่เป็น JSON (ออฟไลน์/หมดเวลา?)"); return }
  if (j.error) { console.log("BLOCKED\t"+(j.error.code||"error")+": "+(j.error.message||"").slice(0,160)); return }
  const v=j.metadata&&j.metadata.vulnerabilities
  if (!v) { console.log("BLOCKED\tไม่มี metadata.vulnerabilities ในผล audit"); return }
  const line="critical="+v.critical+" high="+v.high+" moderate="+v.moderate+" low="+v.low
  if (v.critical>0) {
    const names=Object.values(j.advisories||{}).filter(a=>a.severity==="critical").map(a=>a.module_name+" — "+a.title)
    console.log("FAIL\t"+line+" · "+names.join(" · ")); return }
  console.log("OK\t"+line)
})' 2>/dev/null)"
    case "${verdict%%$'\t'*}" in
        OK)      echo "audit: ${verdict#*$'\t'}" ;;
        FAIL)    FAILS+=("audit: ${verdict#*$'\t'}") ;;
        *)       BLOCKS+=("audit: ${verdict#*$'\t'}") ;;
    esac
    local ign
    ign="$(node -e 'const p=require(process.argv[1]);const i=(p.pnpm&&p.pnpm.auditConfig&&p.pnpm.auditConfig.ignoreCves)||[];process.stdout.write(i.join(" "))' "$SCAN_ROOT/package.json" 2>/dev/null)"
    [ -n "$ign" ] && echo "audit: ไม่นับ (pnpm.auditConfig.ignoreCves ใน package.json): $ign"
}

if [ "${1:-}" = "--selftest" ]; then
    TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT; BAD=0; CASES=0
    printf '20 | 2023-10-24 | 2024-10-22 | 2026-04-30\n24 | 2025-10-28 | 2026-10-20 | 2028-04-30\n' > "$TMP/sched.txt"
    printf '{"metadata":{"vulnerabilities":{"info":0,"low":1,"moderate":2,"high":3,"critical":0}}}' > "$TMP/audit-ok.json"
    printf '{"advisories":{"1":{"module_name":"next","title":"RCE","severity":"critical"}},"metadata":{"vulnerabilities":{"info":0,"low":0,"moderate":0,"high":0,"critical":1}}}' > "$TMP/audit-crit.json"
    printf '{"error":{"code":"ECONNREFUSED","message":"request to http://127.0.0.1:9/ failed"}}' > "$TMP/audit-off.json"
    mk() { # $1 dir  $2 major (ทุกแหล่ง)
        mkdir -p "$1/apps/backend" "$1/.github/workflows"
        printf 'FROM node:%s-alpine AS builder\nFROM node:%s-alpine AS runner\n' "$2" "$2" > "$1/apps/backend/Dockerfile"
        printf '{"name":"root","engines":{"node":"%s.x"}}\n' "$2" > "$1/package.json"
        printf '{"name":"backend","engines":{"node":"%s.x"}}\n' "$2" > "$1/apps/backend/package.json"
        printf '%s\n' "$2" > "$1/.nvmrc"
        printf 'env:\n  NODE_VERSION: '\''%s.x'\''\njobs:\n  a:\n    steps:\n      - uses: actions/setup-node@v4\n        with:\n          node-version: ${{ env.NODE_VERSION }}\n' "$2" > "$1/.github/workflows/ci.yml"
        printf 'services:\n  qa:\n    image: node:%s-alpine\n' "$2" > "$1/docker-compose.qa.yml"
    }
    check() { # $1 ป้าย $2 root $3 exit ที่คาด $4 ข้อความที่ต้องเห็น $5 วันนี้ $6 ไฟล์ audit
        local out code; CASES=$((CASES+1))
        out="$(DEPS_HEALTH_ROOT="$2" DEPS_HEALTH_SCHEDULE="$TMP/sched.txt" DEPS_HEALTH_TODAY="${5:-2026-09-26}" \
               DEPS_HEALTH_AUDIT_JSON="${6:-$TMP/audit-ok.json}" bash "$0" 2>&1)"; code=$?
        if [ "$code" != "$3" ] || ! printf '%s' "$out" | grep -q -- "$4"; then
            echo "  ✗ $1 — คาด exit $3 + '$4' ได้ exit $code"; printf '%s\n' "$out" | sed 's/^/      /'; BAD=1; return; fi
        echo "  ✓ $1"
    }
    A="$TMP/a"; mk "$A" 24;                                                check "24 ทุกแหล่ง ยังไม่หมดอายุ audit สะอาด = PASS" "$A" 0 "PASS"
    B="$TMP/b"; mk "$B" 24; sed -i 's/node:24-alpine AS runner/node:20-alpine AS runner/' "$B/apps/backend/Dockerfile"
                                                                           check "Dockerfile stage หนึ่งค้าง 20 = FAIL ชี้ไฟล์" "$B" 1 "apps/backend/Dockerfile FROM node:20"
    C="$TMP/c"; mk "$C" 24; sed -i 's/node:24-alpine AS builder/node:lts-alpine AS builder/' "$C/apps/backend/Dockerfile"
                                                                           check "node:lts-alpine = FAIL ไม่ปักเมเจอร์" "$C" 1 "ไม่ปักเมเจอร์"
    D="$TMP/d"; mk "$D" 24; printf '{"name":"root","engines":{"node":">=20"}}\n' > "$D/package.json"
                                                                           check "engines แบบช่วง (>=20) = FAIL" "$D" 1 "ไม่ใช่การปักเมเจอร์"
    E="$TMP/e"; mk "$E" 24; rm "$E/.nvmrc";                                check "ไม่มี .nvmrc = FAIL" "$E" 1 "ไม่มี .nvmrc"
    F="$TMP/f"; mk "$F" 24; printf '  NODE_VERSION: '\''20'\''\n' >> "$F/.github/workflows/ci.yml"
                                                                           check "workflow literal ค้าง 20 = FAIL" "$F" 1 "ci.yml node-version=20"
    G="$TMP/g"; mk "$G" 20;                                                check "20 ทุกแหล่ง วันนี้ 2026-09-26 = FAIL หมดอายุ" "$G" 1 "หมดอายุ 2026-04-30"
    H="$TMP/h"; mk "$H" 24;                                                check "24 เหลือ < 60 วัน = PASS + เตือน" "$H" 0 "WARN" "2028-03-15"
    I="$TMP/i"; mk "$I" 22;                                                check "เมเจอร์ไม่มีในไฟล์ข้อมูล = BLOCKED" "$I" 2 "ไม่มีแถว"
    J="$TMP/j"; mk "$J" 24;                                                check "audit มี critical = FAIL ชื่อแพ็กเกจ" "$J" 1 "next — RCE" "" "$TMP/audit-crit.json"
    K="$TMP/k"; mk "$K" 24;                                                check "audit ออฟไลน์ = BLOCKED ไม่ใช่ PASS" "$K" 2 "BLOCKED" "" "$TMP/audit-off.json"
    L="$TMP/l"; mk "$L" 20;                                                check "ออฟไลน์ + หมดอายุ = FAIL ชนะ BLOCKED" "$L" 1 "หมดอายุ" "" "$TMP/audit-off.json"
    echo "selftest: $CASES เคส"; [ "$BAD" = 0 ] || exit 1
    echo "PASS: selftest ครบทั้งสองทิศ"; exit 0
fi

echo "ไม่อ่าน: node_modules/ .claude/worktrees/ · \${{ env.X }} ใน workflow · Node ที่ติดตั้งบนเครื่อง · high/moderate ของ audit"
NODE_MAJOR=""
check_node_pin
check_node_eol
check_audit
for w in "${WARNS[@]}"; do echo "WARN: $w"; done
if [ "${#FAILS[@]}" -gt 0 ]; then
    for b in "${BLOCKS[@]}"; do echo "(และ BLOCKED: $b)"; done
    fail "${#FAILS[@]} ข้อ
$(printf '  %s\n' "${FAILS[@]}")"
fi
[ "${#BLOCKS[@]}" -gt 0 ] && blocked "$(printf '%s · ' "${BLOCKS[@]}")"
pass "Node $NODE_MAJOR ตรงกันทุกแหล่ง · ยังไม่หมดอายุ · audit ไม่มี critical"
```

- [ ] **Step 3: selftest ทั้งสองทิศ**

Run: `bash scripts/probes/deps-health.sh --selftest`
Expected: 12 บรรทัด `✓` · `selftest: 12 เคส` · `PASS: selftest ครบทั้งสองทิศ` exit 0

- [ ] **Step 4: พิสูจน์ว่าเคสแบกน้ำหนักจริง (mutation)** — ปิดข้อ node-eol ในสำเนาแล้วรัน selftest ของสำเนา

```bash
sed 's/^check_node_eol$/: check_node_eol/' scripts/probes/deps-health.sh > scripts/probes/mut-tmp.sh
bash scripts/probes/mut-tmp.sh --selftest | grep -E '✗|selftest:'; rm scripts/probes/mut-tmp.sh
```
Expected: ✗ อย่างน้อยที่ "20 ทุกแหล่ง … หมดอายุ" · "เหลือ < 60 วัน" · "ไม่มีแถว" · "FAIL ชนะ BLOCKED" (วัดตอนเขียนแผน: 4 เคสนี้ ✗) · `git status` ไม่มี mut-tmp.sh เหลือ

- [ ] **Step 5: RED บนต้นไม้จริง**

Run: `bash scripts/probes/deps-health.sh; echo "exit=$?"`
Expected: `node-pin: 21 แหล่ง` (20 ทั้งหมด) · `audit: critical=0 …` · `FAIL: 1 ข้อ` `node-eol: Node 20 หมดอายุ 2026-04-30 — เลยมา <N> วัน` · `exit=1` · ถ้า audit เป็น BLOCKED (ไม่มีเน็ต) ต้องพิมพ์ `(และ BLOCKED: audit: …)` และ exit ยังเป็น 1

- [ ] **Step 6: commit (ยังไม่ลงทะเบียน — ลงใน Task 3 ตอนเขียว)**

```bash
git add scripts/probes/deps-health.sh scripts/probes/node-release-schedule.txt
git commit -m "probe(deps-health): Node เมเจอร์เดียว · ไม่หมดอายุ · audit ไม่มี critical — selftest 12 เคส · RED บนต้นไม้ (Node 20 เลย EOL <N> วัน)

วันหมดอายุอ่านจาก node-release-schedule.txt (nodejs/Release schedule.json) ไม่ใช่ literal
audit: exit code ใช้แยกออฟไลน์กับเจอช่องโหว่ไม่ได้ (ทั้งคู่ = 1) จึงอ่าน JSON · ออฟไลน์ = BLOCKED

<attribution lines>"
```

### Task 3: ปัก Node 24 ทั้งต้นไม้ + ลงทะเบียน probe — GREEN (Tier C)

**Files:**
- Modify: `apps/backend/Dockerfile:7,59` · `apps/web-app/Dockerfile:7,79` · `docker-compose.qa.yml:42,78`
- Modify: `package.json:134` · `apps/backend/package.json:70` · `apps/web-app/package.json` (เพิ่ม engines)
- Modify: `.nvmrc` · `.node-version` · `.npmrc:1-3` (คอมเมนต์)
- Modify: `.github/workflows/{ci,production,e2e-staging-nightly,staging-walkthrough,frontend-lint-ratchet,infrastructure-contract-guard,backend-qc-golden,carpet-bomb-test,topology-guard,generate-api-clients}.yml`
- Modify: `scripts/ops/run-walkthrough.sh:76` · `scripts/probes/probe-registry.txt`

**Interfaces:**
- Consumes: `deps-health.sh` จาก Task 2
- Produces: ต้นไม้ที่ `deps-health` PASS ด้วย `Node 24` · แถวทะเบียน `deps-health | ci`

(dry-run คำสั่ง Step 1 บนสำเนาต้นไม้ตอนเขียนแผน: 20 ไฟล์ · web-app diff มีแค่บล็อก engines · Step 3 grep ว่าง · `deps-health` PASS)

- [ ] **Step 1: แก้ทุกแหล่ง**

```bash
cd /home/ubuntu/work/wt-node24
sed -i 's/^FROM node:20-alpine /FROM node:24-alpine /' apps/backend/Dockerfile apps/web-app/Dockerfile
sed -i 's/image: node:20-alpine/image: node:24-alpine/' docker-compose.qa.yml
sed -i 's/"node": "20.x"/"node": "24.x"/' package.json apps/backend/package.json
node -e 'const f="apps/web-app/package.json",fs=require("fs");const p=JSON.parse(fs.readFileSync(f,"utf8"));p.engines={node:"24.x"};fs.writeFileSync(f,JSON.stringify(p,null,2)+"\n")'
printf '24\n' > .nvmrc; printf '24\n' > .node-version
sed -i -e 's/is a pin (20.x)/is a pin (24.x)/' -e 's/node:20-alpine)/node:24-alpine)/' .npmrc
sed -i -e "s/NODE_VERSION: '20.x'/NODE_VERSION: '24.x'/" -e "s/NODE_VERSION: '20'/NODE_VERSION: '24'/" \
       -e "s/node-version: '20'/node-version: '24'/" -e "s/node-version: 20$/node-version: 24/" \
       -e "s/both Dockerfiles (node:20-alpine)/both Dockerfiles (node:24-alpine)/" .github/workflows/*.yml
sed -i 's/install Node 20.x first/install Node 24.x first (.nvmrc)/' scripts/ops/run-walkthrough.sh
```

- [ ] **Step 2: ดู diff ด้วยตา** — `git diff --stat` · `git diff apps/web-app/package.json` ต้องมีแค่บล็อก engines ที่เพิ่ม (ถ้า JSON.stringify จัดรูปทั้งไฟล์ใหม่ = ย้อนแล้วแทรกด้วยมือ) · `git diff .npmrc` แตะแค่คอมเมนต์ ไม่แตะ `engine-strict=true`

- [ ] **Step 3: ของค้างต้องเป็นศูนย์**

Run: `git grep -nE "node:20|node-version: *'?20|NODE_VERSION: *'20|\"node\": \"20" -- ':!docs' ':!evidence' ':!reports' ':!*.md' ':!pnpm-lock.yaml'`
Expected: ไม่มีผลลัพธ์

- [ ] **Step 4: engine-strict กัดทั้งสองทิศ** (พิสูจน์ว่า pin ใหม่มีผลจริง ไม่ใช่แค่ข้อความ)

```bash
BASE=<sha จาก Task 1 Step 1>
cd /home/ubuntu/work/wt-node24 && source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && pnpm install --frozen-lockfile 2>&1 | tail -2; echo "node24 exit=$?"
cd /home/ubuntu/work/wt-node20-proof && git checkout -q --detach chore/node-24 && nvm use 20 >/dev/null && pnpm install --frozen-lockfile 2>&1 | grep -m1 -E 'Unsupported engine|ERR_PNPM'; git checkout -q --detach "$BASE"
```
Expected: node24 `Done`/`Already up to date` exit 0 (ไม่ต้องมี flag แล้ว) · node20 พิมพ์ `Unsupported engine` หรือ `ERR_PNPM_UNSUPPORTED_ENGINE` · `git diff --quiet pnpm-lock.yaml` (lockfile ไม่เปลี่ยน)

- [ ] **Step 5: ลงทะเบียน probe** — เพิ่มบรรทัดนี้ใน `scripts/probes/probe-registry.txt` ต่อจากแถว `status-vocab` (หมวด "รันใน CI"):

```
deps-health            | ci     | -                 | -        | เวอร์ชันเครื่องมือหลักพูดเสียงเดียวกันและยังไม่หมดอายุ (spec 2026-09-26-versions-packages-tools-refresh-design) — Node เมเจอร์เดียวทุกแหล่ง: Dockerfile/compose/engines ทุก package.json/.nvmrc/.node-version/workflows · ไม่เลยวัน end ใน node-release-schedule.txt (เตือน 60 วัน) · pnpm audit ไม่มี critical (ออฟไลน์ = BLOCKED ไม่ใช่ PASS) · เฟส 4 เพิ่ม jest เมเจอร์เดียว · --selftest 12 เคสสองทิศ
```

- [ ] **Step 6: GREEN**

```bash
bash scripts/probes/deps-health.sh; echo "exit=$?"
bash scripts/probes/deps-health.sh --selftest | tail -1
node scripts/ci/probe-gate.js 2>&1 | grep -E 'deps-health|probe-gate: (PASS|FAIL)|✗'
printf '%s\n' $(git diff --name-only origin/main...HEAD) | bash scripts/probes/tier-check.sh - | tail -1
```
Expected: `PASS: Node 24 ตรงกันทุกแหล่ง · ยังไม่หมดอายุ · audit ไม่มี critical` (node-eol "เหลือ ~580 วัน") · selftest PASS · probe-gate ไม่มี `✗ deps-health` (✗ ที่เหลือต้องเป็นเซตย่อยของ baseline: gate-attestation · main-attestation-audit · no-secret) · `TIER=C`

- [ ] **Step 7: commit**

```bash
git add apps/backend/Dockerfile apps/web-app/Dockerfile docker-compose.qa.yml package.json apps/backend/package.json \
  apps/web-app/package.json .nvmrc .node-version .npmrc .github/workflows scripts/ops/run-walkthrough.sh scripts/probes/probe-registry.txt
git commit -m "chore(node): 20 → 24 ทุกแหล่ง — node:24-alpine (ปักเมเจอร์ ไม่ใช้ lts) · engines 24.x · .nvmrc/.node-version 24 · workflows

Node 20 หมดอายุ 2026-04-30 · 24 = Active LTS ถึง 2026-10-20 · end 2028-04-30
deps-health: RED (node-eol) → GREEN · ลงทะเบียน ci · engine-strict: Node 20 install ไม่ได้แล้ว (วัดใน Step 4)
พิสูจน์ก่อนเปลี่ยน: evidence/node24-2026-09-26/INDEX.md

<attribution lines>"
```

### Task 4: อิมเมจจริง — Node 24 เทียบอิมเมจคุม Node 20 ที่ build จากคอมมิตฐานเดียวกัน

**Files:**
- Create: `scripts/ops/image-smoke.sh`
- Create: `evidence/node24-2026-09-26/image/{node20,node24}/` (pdf.pdf · sharp.png · node-version.log · health.log) · `image/frontend-node24.png` · `image/facts.txt` · อัปเดต `INDEX.md`

**Interfaces:**
- Consumes: `BASE` จาก Task 1 · HEAD ของ `chore/node-24` หลัง Task 3
- Produces: `bash scripts/ops/image-smoke.sh <backend-image> <out-dir> [major]` → exit 0/1/2 · อิมเมจ `gacp-backend:proof-node20-<BASE12>` `gacp-backend:proof-node24-<HEAD12>` `gacp-frontend:proof-node24-<HEAD12>` (tag proof-* ไม่ใช่ tag deploy — tag deploy ของจริง operator build จาก main หลัง merge ใน Task 5)

shell ไม่จำตัวแปรข้ามคำสั่ง — **ทุก Step ตั้งแต่ Step 2 เริ่มด้วย**:
```bash
BASE=<sha จาก Task 1 Step 1>; H=$(git -C /home/ubuntu/work/wt-node24 rev-parse HEAD)   # HEAD หลัง Task 3 (Task นี้คอมมิตครั้งเดียวที่ Step 7)
F=/home/ubuntu/work/wt-node24/evidence/node24-2026-09-26/image; O=/home/ubuntu/work/node24-proof-out/image
```

- [ ] **Step 1: เขียน `scripts/ops/image-smoke.sh`** (รันแล้วกับ `local-3636bcd8f32a`: PASS 31 วินาที · ใส่ major 24 → FAIL ถูกต้อง)

```bash
#!/usr/bin/env bash
# image-smoke — พิสูจน์ว่า backend image หนึ่งใบรัน native modules ได้จริง และบูตตอบ /api/health
#
# ทำไมมี: การย้าย Node เมเจอร์ (20 → 24) เปลี่ยน ABI/musl ที่ sharp · prisma engine · chromium พึ่ง
# เทสใน jest ไม่เห็นสิ่งนี้เลย (รันบน node ของเครื่อง ไม่ใช่ใน alpine) — ต้องรันในอิมเมจจริง
#
# ทำอะไร (ทั้งหมดบน docker network แยก ชื่อ smoke-<pid> · ไม่แตะ DB/Redis จริงตัวใด):
#   1 node --version ในอิมเมจ
#   2 sharp สร้าง PNG จริง → <out>/sharp.png
#   3 chromium (puppeteer ผ่าน pdf-generator.service) เรนเดอร์ภาษาไทย → <out>/pdf.pdf
#   4 postgres:17-alpine ชั่วคราว (trust auth) + redis:7-alpine ชั่วคราว → prisma migrate deploy
#     ด้วยอิมเมจนี้ → บูต backend (NODE_ENV=development) → GET /api/health ต้องได้ database ตอบ
# ไม่ทำ: production mode (ต้องมี secret จริง — นั่นคือ deploy staging ของ operator) · frontend image
# ใช้:  bash scripts/ops/image-smoke.sh <backend-image> <out-dir> [เมเจอร์ Node ที่คาด]
# exit: 0 ทุกข้อผ่าน · 1 ข้อใดข้อหนึ่งตก (พิมพ์ว่าข้อไหน) · 2 ใช้ผิด/ไม่มี docker
set -u
IMG="${1:?backend image}"; OUT="${2:?out dir}"; WANT="${3:-}"
command -v docker >/dev/null || { echo "ไม่มี docker"; exit 2; }
docker image inspect "$IMG" >/dev/null 2>&1 || { echo "ไม่มีอิมเมจ $IMG"; exit 2; }
mkdir -p "$OUT"; chmod 777 "$OUT"
NET="smoke-$$"; PG="$NET-pg"; RD="$NET-redis"; BE="$NET-be"; PORT=$((18000 + $$ % 1000))
cleanup() { docker rm -f "$BE" "$PG" "$RD" >/dev/null 2>&1; docker network rm "$NET" >/dev/null 2>&1; }
trap cleanup EXIT
BAD=0
step() { local n="$1"; shift; if "$@" >"$OUT/$n.log" 2>&1; then echo "  ✓ $n"; else echo "  ✗ $n — $OUT/$n.log"; tail -5 "$OUT/$n.log" | sed 's/^/      /'; BAD=1; fi; }
inimg() { docker run --rm --entrypoint "$@"; }

echo "image-smoke: $IMG"
step node-version inimg node "$IMG" --version
sed 's/^/      /' "$OUT/node-version.log"
if [ -n "$WANT" ] && ! grep -qE "^v$WANT\." "$OUT/node-version.log"; then echo "  ✗ node-major — คาด $WANT"; BAD=1; fi
step sharp inimg node -w /app/apps/backend -v "$OUT:/out" "$IMG" -e \
  "const s=require('sharp');s({create:{width:120,height:40,channels:3,background:'#006633'}}).png().toFile('/out/sharp.png').then(i=>console.log('sharp',s.versions.sharp,'vips',s.versions.vips,i.size,'bytes'))"
step chromium-pdf inimg node -w /app/apps/backend -v "$OUT:/out" "$IMG" -e \
  "const g=require('./services/pdf/pdf-generator.service.js');g.generatePDF('<h1>ทดสอบ image-smoke</h1><p>'+process.version+'</p>').then(b=>{require('fs').writeFileSync('/out/pdf.pdf',b);console.log('pdf',b.length,'bytes');return g.close()}).then(()=>process.exit(0),e=>{console.error(e);process.exit(1)})"

docker network create "$NET" >/dev/null
docker run -d --name "$PG" --network "$NET" -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=gacp postgres:17-alpine >/dev/null
docker run -d --name "$RD" --network "$NET" redis:7-alpine >/dev/null
URL="postgresql://postgres@$PG:5432/gacp"
for _ in $(seq 1 30); do docker exec "$PG" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
step migrate-deploy docker run --rm --network "$NET" -e DATABASE_URL="$URL" -e DIRECT_URL="$URL" \
  --entrypoint sh "$IMG" -c 'cd /app/apps/backend && npx prisma migrate deploy'
grep -v 'npm notice' "$OUT/migrate-deploy.log" | tail -1 | sed 's/^/      /'
docker run -d --name "$BE" --network "$NET" -p "127.0.0.1:$PORT:8000" -e NODE_ENV=development \
  -e DATABASE_URL="$URL" -e DIRECT_URL="$URL" -e REDIS_URL="redis://$RD:6379" "$IMG" >/dev/null
health() { for _ in $(seq 1 90); do curl -sf "http://127.0.0.1:$PORT/api/health" && return 0; sleep 2; done; return 1; }
step health health
sed 's/^/      /' "$OUT/health.log"; echo
docker logs "$BE" >"$OUT/backend-boot.log" 2>&1
[ "$BAD" = 0 ] && { echo "image-smoke: PASS"; exit 0; }
echo "image-smoke: FAIL"; exit 1
```

- [ ] **Step 2: build จากคอมมิต (git archive) ไม่ใช่จาก working tree** — สองคอมมิต สามอิมเมจ

```bash
cd /home/ubuntu/work/wt-node24; TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
for ref in "$BASE" "$H"; do d=/home/ubuntu/work/node24-build-${ref:0:12}; rm -rf $d; mkdir -p $d; git archive "$ref" | tar -x -C $d; done
cd /home/ubuntu/work/node24-build-${BASE:0:12} && docker build -f apps/backend/Dockerfile --build-arg GIT_SHA=$BASE --build-arg BUILT_AT=$TS -t gacp-backend:proof-node20-${BASE:0:12} . 2>&1 | tail -2
cd /home/ubuntu/work/node24-build-${H:0:12} && docker build -f apps/backend/Dockerfile --build-arg GIT_SHA=$H --build-arg BUILT_AT=$TS -t gacp-backend:proof-node24-${H:0:12} . 2>&1 | tail -2
cd /home/ubuntu/work/node24-build-${H:0:12} && docker build -f apps/web-app/Dockerfile --build-arg GIT_SHA=$H --build-arg BUILT_AT=$TS \
  --build-arg NEXT_PUBLIC_API_URL=https://staging.gacpth.com --build-arg NEXT_PUBLIC_PWA_ENABLED=false --build-arg NEXT_PUBLIC_CHECKOUT_UI_ENABLED=true \
  -t gacp-frontend:proof-node24-${H:0:12} . 2>&1 | grep -E 'build-args were not consumed|naming to|ERROR' 
```
Expected: สามอิมเมจ build สำเร็จ · ไม่มี `build-args were not consumed` (กับดักข้อ 2 ใน runbook) · ถ้า `apk add chromium` หรือ `pnpm install --frozen-lockfile` ตกบน node:24-alpine = หยุด รายงาน log

- [ ] **Step 3: ข้อเท็จจริงของอิมเมจ** — alpine / chromium / ขนาด (เทียบกับอิมเมจคุม)

```bash
mkdir -p $F
for img in gacp-backend:proof-node20-${BASE:0:12} gacp-backend:proof-node24-${H:0:12}; do
  echo "== $img"; docker run --rm --entrypoint sh $img -c 'node --version; cat /etc/alpine-release; chromium-browser --version; ls -l /usr/bin/chromium-browser | cut -c1-80'
  docker image inspect $img --format 'size={{.Size}}'
done | tee $F/facts.txt
```
Expected: node v20 vs v24 · `/usr/bin/chromium-browser` มีอยู่ในอิมเมจ 24 (ตรงกับ `PUPPETEER_EXECUTABLE_PATH`) — ถ้าไม่มี = Step 4 จะตกที่ chromium-pdf

- [ ] **Step 4: image-smoke ทั้งคุมและจริง**

```bash
cd /home/ubuntu/work/wt-node24
bash scripts/ops/image-smoke.sh gacp-backend:proof-node20-${BASE:0:12} $O/node20 20; echo "exit=$?"
bash scripts/ops/image-smoke.sh gacp-backend:proof-node24-${H:0:12}   $O/node24 24; echo "exit=$?"
```
Expected: ทั้งคู่ `image-smoke: PASS` exit 0 · node24: `v24.…` · sharp 0.35.4 · `All migrations have been successfully applied.` · health `"dbStatus":{"status":"connected"…}` · ถ้าคุม PASS แต่ 24 FAIL = Node 24 ทำพัง → หยุด (Global Constraints) · ถ้าคุมก็ FAIL = ปัญหาของสูตร/เครื่อง ไม่ใช่ Node รายงานตามจริง

- [ ] **Step 5: ดูด้วยตา** — เปิด `$O/node24/pdf.pdf` (ต้องเห็นหัว "ทดสอบ image-smoke" ภาษาไทยถูกรูป + บรรทัด `v24.…`) และ `$O/node24/sharp.png` (แถบเขียว #006633) · เทียบกับของ node20

- [ ] **Step 6: frontend อิมเมจ 24 บูตและเสิร์ฟหน้า**

```bash
docker run -d --name fe-node24-proof -p 127.0.0.1:13024:3000 gacp-frontend:proof-node24-${H:0:12}
for i in $(seq 1 30); do curl -sf http://127.0.0.1:13024/api/webapp-version && break; sleep 2; done; echo
curl -s -o /dev/null -w 'GET / → %{http_code}\n' http://127.0.0.1:13024/
docker exec fe-node24-proof node --version
cd /home/ubuntu/work/wt-node24/apps/web-app && npx playwright screenshot --full-page http://127.0.0.1:13024/ $F/frontend-node24.png
docker rm -f fe-node24-proof
```
Expected: webapp-version มี `GIT_SHA` = H · `GET / → 200` · `v24.…` · ไฟล์ png เปิดแล้วเห็นหน้าแรกจริง (ไม่ใช่หน้า error) · ข้อจำกัดที่ต้องเขียนใน INDEX: ทดสอบพอร์ตตรง ข้าม nginx (runbook: ผ่านตรงนี้ยังต้องผ่านบนโดเมนจริงหลัง deploy)

- [ ] **Step 7: คอมมิตหลักฐาน**

```bash
cd /home/ubuntu/work/wt-node24
for v in node20 node24; do mkdir -p $F/$v; cp $O/$v/{pdf.pdf,sharp.png,node-version.log,health.log} $F/$v/; done
```
เพิ่มหมวด "อิมเมจ" ใน `evidence/node24-2026-09-26/INDEX.md`: ตาราง node20 | node24 × (node · alpine · chromium · ขนาด · sharp · pdf · migrate · health) + ลิงก์ไฟล์ + ข้อจำกัด (development mode, พอร์ตตรง)
```bash
git add scripts/ops/image-smoke.sh evidence/node24-2026-09-26
git commit -m "evidence(node24): อิมเมจจริง — sharp · chromium PDF ภาษาไทย · prisma migrate + health บน node:24-alpine เท่ากับอิมเมจคุม Node 20

image-smoke.sh: native modules + บูตในอิมเมจ บนเครือข่าย docker แยก ไม่แตะ DB จริง
<ผลสองแถวจาก INDEX>

<attribution lines>"
```

### Task 5: ปิดเฟส 3 — gate · ส่ง operator · ขั้น deploy ที่ operator รัน

**Files:**
- Create: `evidence/gate/<sha>.json` (ใบแยก)

**Interfaces:**
- Consumes: สาขา `chore/node-24` หลัง Task 4
- Produces: สาขาพร้อม merge (Tier C) · ชุดคำสั่ง deploy สำหรับ operator · main ที่ Node 24 (หลัง operator merge) — เฟส 4 แตกจากตรงนี้

- [ ] **Step 1: local-gate เต็มบน Node 24**

Run: `cd /home/ubuntu/work/wt-node24 && source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && NODE_OPTIONS=--max-old-space-size=3072 LOCAL_GATE_FULL=1 SIGNING_KEY_DIR=$(mktemp -d) bash scripts/ci/local-gate.sh 2>&1 | grep -E "^\[local-gate\] [a-z0-9-]+: "`
Expected: ไม่มี FAIL ใหม่เทียบ main — `probe-gate` ตกได้เฉพาะเหตุผลเดิม (gate-attestation · main-attestation-audit · no-secret) · `deps-health` ต้องไม่อยู่ในรายการ ✗

- [ ] **Step 2: attestation บน Node 24** (full-gate ติดตั้งใน checkout สะอาดด้วย engine-strict — เป็นหลักฐานเพิ่มว่า pin ใช้ได้)

```bash
export GATE_PG_ADMIN_URL="$(node -e "const u=require('fs').readFileSync('/home/ubuntu/work/GACP-Certification-Application/apps/backend/.env','utf8').match(/^DATABASE_URL=\"?([^\"\n]+)/m)[1];const p=new URL(u);p.pathname='/postgres';p.search='';process.stdout.write(p.toString())")"
NODE_OPTIONS=--max-old-space-size=3072 bash scripts/ci/full-gate.sh 2>&1 | sed -n '/^===== full-gate/,$p'
```
เทียบกับ attestation ล่าสุดของ main:
```bash
att(){ node -e 'const j=require(process.argv[1]);console.log("node",j.versions.node);for(const c of j.checks) if(c.status==="fail") console.log(c.id+"\t"+String(c.reason||"").slice(0,110))' "$1"; }
LATEST=$(git log origin/main --format=%H | while read c; do [ -f evidence/gate/$c.json ] && echo $c && break; done)
att evidence/gate/$LATEST.json; echo ---; att evidence/gate/$(git rev-parse HEAD).json
```
Expected: ใบใหม่ `node v24.…` · ชุด fail เป็นเซตย่อยของใบล่าสุดของ main (วันเขียน: suite-green · integration-pg · secret-scan-deep · probe-ci · integration-no-skip) และเหตุผลไม่ใหม่ · ตัวเลข suite-green ใน log ต้องไม่ต่ำกว่าใบเดิม · คอมมิต `evidence/gate/<sha>.json` เป็นใบแยก

- [ ] **Step 3: สรุปถึง operator (≤ 40 บรรทัด ตาม CLAUDE.md §6)** — Status · ตัวเลขจาก INDEX · tier C · คำขอ "merge" · คำถามเปิดท้ายแผนข้อ 1-3

- [ ] **Step 4 (operator): merge** — หลังคำว่า "merge": `git ls-remote origin main` ต้องเท่ากับ sha ที่ merge แล้ว

- [ ] **Step 5 (operator): เปลี่ยน Node ของเครื่องให้ตรงกับ main** — หลัง merge ทุก worktree ที่ `pnpm install` จาก main ต้องเป็น 24 (engine-strict)
```bash
source ~/.nvm/nvm.sh && nvm alias default 24 && nvm use 24 && npm install -g pnpm@8.15.0 && node --version
```
สาขาที่ยังค้างบน engines 20.x (เช่น `chore/tools-refresh`, wave2/*) จะ install บน 24 ไม่ได้จนกว่าจะ rebase/merge main — ใช้ `nvm use 20` ใน worktree นั้นชั่วคราว

- [ ] **Step 6 (operator): build อิมเมจ deploy จาก main** — ตาม `docs/operations/runbooks/build-images-on-the-box.md` หมวด build ทุกบรรทัด (clone สะอาดที่ `/tmp/gacp-build` → `SHA=$(git rev-parse HEAD)` → `docker build` backend + frontend tag `local-${SHA:0:12}` พร้อม build-arg ชุดเดิม) แล้วรันพิสูจน์บนอิมเมจที่จะ deploy จริง (Step 6-9 ใช้ `SHA` ตัวนี้ — ตั้งใหม่ทุก shell: `SHA=$(git -C /tmp/gacp-build rev-parse HEAD)`):
```bash
bash /tmp/gacp-build/scripts/ops/image-smoke.sh ghcr.io/jonmaxmore/gacp-backend:local-${SHA:0:12} /tmp/node24-deploy-smoke 24
```
Expected: `image-smoke: PASS`

- [ ] **Step 7 (operator): จด tag ย้อนกลับ ก่อนแตะอะไร**
```bash
docker ps --format '{{.Names}} {{.Image}}' | grep -E 'gacp-(backend|frontend)-(staging|demo)'
```
(วันเขียน: ทั้งสี่ตัว `local-3636bcd8f32a`) · ไม่มี migration ใหม่ในเฟสนี้ ⇒ ย้อนด้วย tag เดิมปลอดภัย

- [ ] **Step 8 (operator): staging** — สคริปต์เดิมใช้ได้ตรง ๆ (รับ env + tag · ไม่มีส่วนไหนผูกกับ RCE นอกจากคอมเมนต์):
```bash
sudo bash ~/work/state/deploy-rce-patch-20260926.sh staging local-${SHA:0:12}
docker exec gacp-backend-staging node --version
docker exec gacp-backend-staging curl -s localhost:8000/api/health
docker exec gacp-frontend-staging node --version
cd /tmp/gacp-build && bash scripts/probes/deploy-drift.sh; echo "exit=$?"
```
Expected: สคริปต์จบ `DEPLOY DONE env=staging` · `v24.…` ทั้งสองคอนเทนเนอร์ · health `connected` · แถว staging ไม่อยู่ใน FAIL ของ deploy-drift · **ดูด้วยตา**: เปิด staging ในเบราว์เซอร์ ล็อกอิน แล้วดาวน์โหลด PDF ใบรับรอง 1 ใบ (เส้นที่ใช้ chromium ในอิมเมจจริงบน production mode) — ภาพหน้าจอ + PDF เก็บใน `evidence/node24-2026-09-26/staging/`
ย้อนกลับ: `sudo bash ~/work/state/deploy-rce-patch-20260926.sh staging local-3636bcd8f32a` (หรือ tag จาก Step 7)

- [ ] **Step 9 (operator): demo** — หลัง staging ผ่านตามดุลยพินิจ operator: คำสั่งเดียวกับ Step 8 แทน `staging` ด้วย `demo` (คอนเทนเนอร์ `gacp-backend-demo` `gacp-frontend-demo`)

---

## เฟส 4 — สาขา `chore/jest-30` (แตกจาก main หลังเฟส 3 merge และเครื่องเป็น Node 24)

### Task 6: `deps-health` เพิ่มข้อ jest-major — RED บนต้นไม้

**Files:**
- Modify: `scripts/probes/deps-health.sh` (เพิ่มฟังก์ชัน · mk ใน selftest · 3 เคส · การเรียก · ข้อความ pass)
- Modify: `scripts/probes/probe-registry.txt` (ข้อความแถว deps-health เท่านั้น — `run`/`waived`/`signed-by` ไม่แตะ)

**Interfaces:**
- Consumes: `deps-health.sh` จาก Task 2 (`tracked` `rel` `major_of` `FAILS` `BLOCKS` · `mk`/`check` ใน selftest)
- Produces: `check_jest_major` — อ่าน `jest`/`babel-jest` ใน dependencies+devDependencies ของทุก package.json และ `/jest@N` `/babel-jest@N` ใน `pnpm-lock.yaml` · FAIL เมื่อเมเจอร์ > 1 · BLOCKED เมื่อไม่พบเลย

- [ ] **Step 1: worktree**
```bash
R=/home/ubuntu/work/GACP-Certification-Application; git -C $R fetch origin
git -C $R worktree add -b chore/jest-30 /home/ubuntu/work/wt-jest30 origin/main
cd /home/ubuntu/work/wt-jest30 && source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && pnpm install --frozen-lockfile 2>&1 | tail -1
```

- [ ] **Step 2: เพิ่มฟังก์ชัน** — วางก่อนบรรทัด `if [ "${1:-}" = "--selftest" ]; then`:

```bash
check_jest_major() {
    local rows="" f line name spec m
    while IFS= read -r f; do
        while IFS=' ' read -r name spec; do
            [ -z "$name" ] && continue
            m="$(major_of "$spec")"
            [ -z "$m" ] && { FAILS+=("jest-major: $(rel "$f"): $name \"$spec\" อ่านเมเจอร์ไม่ได้"); continue; }
            rows+="$m $(rel "$f") $name@$spec"$'\n'
        done < <(node -e 'const p=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const d={...p.dependencies,...p.devDependencies};for(const n of ["jest","babel-jest"]) if(d[n]) console.log(n+" "+d[n])' "$f" 2>/dev/null)
    done < <(tracked -name package.json)
    if [ -f "$SCAN_ROOT/pnpm-lock.yaml" ]; then
        while IFS= read -r line; do
            rows+="${line##*@} pnpm-lock.yaml ${line# }"$'\n'
        done < <(grep -oE '^  /?(jest|babel-jest)@[0-9]+' "$SCAN_ROOT/pnpm-lock.yaml" | sed -E 's#^ +/?##' | sort -u)
    fi
    [ -n "$rows" ] || { BLOCKS+=("jest-major: ไม่พบ jest ใน package.json หรือ pnpm-lock.yaml — ตรวจศูนย์แหล่ง = ไม่ได้ตรวจ"); return; }
    echo "jest-major: $(printf '%s' "$rows" | grep -c .) แหล่ง"
    printf '%s' "$rows" | sed 's/^/  /'
    local majors; majors="$(printf '%s' "$rows" | awk 'NF{print $1}' | sort -u)"
    [ "$(printf '%s\n' "$majors" | grep -c .)" -gt 1 ] && \
        FAILS+=("jest-major: jest/babel-jest มีหลายเมเจอร์ ($(printf '%s' "$majors" | tr '\n' ' '))")
}
```

- [ ] **Step 3: selftest — fixture มี jest 30 เป็นปกติ + 3 เคสใหม่**

ใน `mk()` แทนสองบรรทัด package.json ด้วยสามบรรทัดนี้ (ไม่งั้นทุกเคสเดิมจะกลายเป็น BLOCKED "ไม่พบ jest"):
```bash
        printf '{"name":"root","engines":{"node":"%s.x"},"devDependencies":{"jest":"^30.2.0"}}\n' "$2" > "$1/package.json"
        printf '{"name":"backend","engines":{"node":"%s.x"},"devDependencies":{"jest":"^30.2.0","babel-jest":"^30.2.0"}}\n' "$2" > "$1/apps/backend/package.json"
        printf 'lockfileVersion: '\''6.0'\''\npackages:\n  /babel-jest@30.2.0(@babel/core@7.29.0):\n  /jest@30.2.0(@types/node@24.0.0):\n' > "$1/pnpm-lock.yaml"
```
ต่อจากเคส `L` (ก่อน `echo "selftest: $CASES เคส"`):
```bash
    M="$TMP/m"; mk "$M" 24; sed -i 's/"jest":"\^30.2.0","babel/"jest":"^29.7.0","babel/' "$M/apps/backend/package.json"
                                                                           check "backend jest ^29 ข้าง babel-jest ^30 = FAIL" "$M" 1 "apps/backend/package.json jest@^29.7.0"
    N="$TMP/n"; mk "$N" 24; printf '  /jest@29.7.0:\n' >> "$N/pnpm-lock.yaml"
                                                                           check "package.json 30 แต่ lockfile ยังมี jest@29 = FAIL" "$N" 1 "pnpm-lock.yaml jest@29"
    O="$TMP/o"; mk "$O" 24; printf '{"name":"root","engines":{"node":"24.x"}}\n' > "$O/package.json"
                printf '{"name":"backend","engines":{"node":"24.x"}}\n' > "$O/apps/backend/package.json"; rm "$O/pnpm-lock.yaml"
                                                                           check "ไม่มี jest เลย = BLOCKED ไม่ใช่ PASS" "$O" 2 "ไม่พบ jest"
```
ส่วน run: เพิ่ม `check_jest_major` ระหว่าง `check_node_eol` กับ `check_audit` · แก้บรรทัดสุดท้ายเป็น
```bash
pass "Node $NODE_MAJOR ตรงกันทุกแหล่ง · ยังไม่หมดอายุ · jest เมเจอร์เดียว · audit ไม่มี critical"
```
และหัวไฟล์หมวด FAIL เพิ่มบรรทัด `#   jest-major jest/babel-jest ใน package.json ใดๆ หรือใน pnpm-lock.yaml มีมากกว่าหนึ่งเมเจอร์`

- [ ] **Step 4: selftest + mutation**
```bash
bash scripts/probes/deps-health.sh --selftest | tail -2
sed 's/^check_jest_major$/: check_jest_major/' scripts/probes/deps-health.sh > scripts/probes/mut-tmp.sh
bash scripts/probes/mut-tmp.sh --selftest | grep -E '✗|selftest:'; rm scripts/probes/mut-tmp.sh
```
Expected: `selftest: 15 เคส` · `PASS: selftest ครบทั้งสองทิศ` · mutation: ✗ ที่เคส M N O ทั้งสาม (วัดตอนเขียนแผน)

- [ ] **Step 5: RED บนต้นไม้**

Run: `bash scripts/probes/deps-health.sh; echo "exit=$?"`
Expected: `jest-major: 8 แหล่ง` (ราก ^29.7.0 · web-app ^30.2.0 · backend jest ^29.7.0 + babel-jest ^30.2.0 · lockfile jest@29 jest@30 babel-jest@29 babel-jest@30) · `FAIL: 1 ข้อ` `jest-major: jest/babel-jest มีหลายเมเจอร์ (29 30)` · `exit=1`

- [ ] **Step 6:** แถว deps-health ใน registry: แทน "เฟส 4 เพิ่ม jest เมเจอร์เดียว · --selftest 12 เคสสองทิศ" ด้วย "jest/babel-jest เมเจอร์เดียวทั้ง package.json และ lockfile · --selftest 15 เคสสองทิศ" · commit
```bash
git add scripts/probes/deps-health.sh scripts/probes/probe-registry.txt
git commit -m "probe(deps-health): เพิ่มข้อ jest-major — selftest 15 เคส · RED บนต้นไม้ (29 + 30)

<attribution lines>"
```

### Task 7: jest ^30 ที่รากและ backend — ตัวเลขเท่าเดิมก่อน-หลัง

**Files:**
- Modify: `package.json` (devDependencies.jest) · `apps/backend/package.json:64` · `pnpm-lock.yaml`
- Modify: `.github/workflows/ci.yml:510,574` · `.github/workflows/production.yml:145` (`--testPathPattern` → `--testPathPatterns`)
- Create: `evidence/jest30-<YYYY-MM-DD>/{backend,webapp}-{before,after}.summary.json` · `lock-majors.txt` · `INDEX.md`

**Interfaces:**
- Consumes: `scripts/tools/jest-summary.js` (Task 1) · `scripts/ops/image-smoke.sh` (Task 4) · `deps-health` (Task 6)
- Produces: ต้นไม้ที่ jest เมเจอร์เดียว (30) · `deps-health` PASS

- [ ] **Step 1: ตัวเลขก่อน (jest 29 · Node 24)**
```bash
OUT=/home/ubuntu/work/jest30-proof-out; mkdir -p $OUT; KEY=/home/ubuntu/work/GACP-Certification-Application/apps/backend/keys/private.pem
cd /home/ubuntu/work/wt-jest30/apps/backend && source ~/.nvm/nvm.sh && nvm use 24 >/dev/null
stat -c '%y' $KEY > $OUT/key-before.txt; npx jest --listTests | wc -l > $OUT/listtests-before.txt
SIGNING_KEY_DIR=$(mktemp -d) NODE_OPTIONS=--max-old-space-size=3072 npx jest --silent --forceExit --json --outputFile=$OUT/backend-before.json > $OUT/backend-before.log 2>&1
node ../../scripts/tools/jest-summary.js $OUT/backend-before.json > $OUT/backend-before.summary.json
cd ../web-app && node node_modules/jest/bin/jest.js --json --outputFile=$OUT/webapp-before.json > $OUT/webapp-before.log 2>&1
node ../../scripts/tools/jest-summary.js $OUT/webapp-before.json > $OUT/webapp-before.summary.json
git -C /home/ubuntu/work/wt-jest30 show HEAD:pnpm-lock.yaml > $OUT/lock-before.yaml
```

- [ ] **Step 2: RED ของพฤติกรรม** — สคริปต์ที่เขียนด้วยชื่อ flag ของ jest 30 พังอยู่บน 29

Run: `cd /home/ubuntu/work/wt-jest30 && pnpm run test:smoke:api 2>&1 | grep -m1 -E 'Unrecognized option|Test Suites:'`
Expected: `Unrecognized option "testPathPatterns". Did you mean "testPathPattern"?` (วัดบน 29.7.0 ตอนเขียนแผน) — แปะ output นี้ในรายงาน

- [ ] **Step 3: ยก jest**
```bash
cd /home/ubuntu/work/wt-jest30
sed -i 's/"jest": "\^29.7.0"/"jest": "^30.2.0"/' package.json apps/backend/package.json
git diff -U0 package.json apps/backend/package.json | grep -E '^[-+] '
pnpm install 2>&1 | tail -3
```
Expected: diff แสดงสองบรรทัด `-"jest": "^29.7.0"` / `+"jest": "^30.2.0"` · install สำเร็จ

- [ ] **Step 4: ไม่มีเมเจอร์ใหม่นอกตระกูล jest** (spec: ไม่อัปเมเจอร์อื่นในเฟส 1-4)
```bash
lockmajors(){ grep -E "^  /" "$1" | sed -E 's#^  /##; s#:$##; s#\(.*##' | sed -E 's#^(@?[^@]+)@([0-9]+)\..*#\1 \2#' | sort -u; }
OUT=/home/ubuntu/work/jest30-proof-out
{ echo "== (ชื่อ เมเจอร์) ที่เพิ่งมี"; comm -13 <(lockmajors $OUT/lock-before.yaml) <(lockmajors pnpm-lock.yaml)
  echo "== ที่หายไป";           comm -23 <(lockmajors $OUT/lock-before.yaml) <(lockmajors pnpm-lock.yaml); } | tee $OUT/lock-majors.txt
```
ts-jest (web-app เท่านั้น) ต้องยังรับ 30: `grep -A12 '^  /ts-jest@' pnpm-lock.yaml | grep -E '^ +jest:'` → `jest: ^29.0.0 || ^30.0.0` (วัดตอนเขียนแผน)
Expected: "ที่เพิ่งมี" ว่าง หรือมีแต่ตระกูล jest (`jest*` `@jest/*` `babel-jest` `babel-plugin-jest-hoist` `babel-preset-jest` `expect` `pretty-format` `diff-sequences`/`jest-diff` ฯลฯ) — web-app ใช้ jest 30 อยู่แล้ว จึงคาดว่าว่าง · "ที่หายไป" = ชุด jest 29 · มีชื่ออื่น = หยุด ถาม operator

- [ ] **Step 5: flag ชื่อใหม่ใน workflows**
```bash
sed -i "s/--testPathPattern '/--testPathPatterns '/" .github/workflows/ci.yml .github/workflows/production.yml
git grep -nE -- "--testPathPattern\b[^s]|--testPathPattern '" -- ':!docs' ':!evidence' ':!reports' ':!*.md'
```
Expected: grep ไม่มีผล (เหลือแค่ `--testPathPatterns`)

- [ ] **Step 6: GREEN ของพฤติกรรม + probe**
```bash
pnpm run test:smoke:api 2>&1 | grep -m1 -E 'Unrecognized option|Test Suites:'
bash scripts/probes/deps-health.sh | tail -3; echo "exit=${PIPESTATUS[0]}"
```
Expected: บรรทัดแรกเป็น `Test Suites: …` (jest รันไฟล์ได้แล้ว — ผลของเทส smoke เองรายงานตามจริง ไม่ใช่เกณฑ์) · `jest-major: 4 แหล่ง` เป็น 30 ทั้งหมด · `PASS: … jest เมเจอร์เดียว …` exit 0

- [ ] **Step 7: ตัวเลขหลัง — ต้องเท่าเดิม**
```bash
OUT=/home/ubuntu/work/jest30-proof-out; KEY=/home/ubuntu/work/GACP-Certification-Application/apps/backend/keys/private.pem
cd /home/ubuntu/work/wt-jest30/apps/backend
npx jest --listTests | wc -l > $OUT/listtests-after.txt
SIGNING_KEY_DIR=$(mktemp -d) NODE_OPTIONS=--max-old-space-size=3072 npx jest --silent --forceExit --json --outputFile=$OUT/backend-after.json > $OUT/backend-after.log 2>&1
node ../../scripts/tools/jest-summary.js $OUT/backend-after.json > $OUT/backend-after.summary.json
stat -c '%y' $KEY > $OUT/key-after.txt
cd ../web-app && node node_modules/jest/bin/jest.js --json --outputFile=$OUT/webapp-after.json > $OUT/webapp-after.log 2>&1
node ../../scripts/tools/jest-summary.js $OUT/webapp-after.json > $OUT/webapp-after.summary.json
cd $OUT && diff listtests-before.txt listtests-after.txt && diff backend-before.summary.json backend-after.summary.json && diff webapp-before.summary.json webapp-after.summary.json && diff key-before.txt key-after.txt && echo "ALL IDENTICAL"
```
Expected: `ALL IDENTICAL` — จำนวนไฟล์เทส · suites · tests · passed · failed · skipped · todo · รายชื่อไฟล์ที่ตก เท่ากันหมด · กุญแจจริงไม่ถูกแตะ

- [ ] **Step 8: ถ้าไม่เท่า** — ไล่ทีละไฟล์ที่ต่าง เริ่มจาก 6 ไฟล์ที่เรียก `jest.restoreAllMocks` (รายชื่อในข้อเท็จจริง) และอ่าน https://jestjs.io/docs/upgrading-to-jest30 หัวข้อที่ตรงกับ error · แก้เทสได้เฉพาะการปรับให้เข้ากับ API ของ 30 **ห้ามลด assertion ห้าม skip** (L4 `no-skip` · `check-green-mask-assertions.js`) · RED-first: แปะ output ที่ตกบน 30 ก่อนแก้ · แก้แล้วกลับไป Step 7 จน `ALL IDENTICAL` · ถ้าตัวเลขเปลี่ยนเพราะ jest 30 นับต่างโดยชอบ (ไม่ใช่เทสหาย) → หยุด เขียนเหตุผลพร้อมหลักฐาน ให้ operator ตัดสิน

- [ ] **Step 9: probe/สคริปต์ที่เรียก jest CLI ยังอ่านผลได้**
```bash
cd /home/ubuntu/work/wt-jest30
bash scripts/probes/settle-webhook-only.sh | tail -1; bash scripts/probes/webhook-idempotent.sh | tail -1
grep -E '^Tests:' /home/ubuntu/work/jest30-proof-out/backend-after.log | tail -1
node -e 'const j=require("/home/ubuntu/work/jest30-proof-out/backend-after.json");console.log("numPassedTests",j.numPassedTests,"numPendingTests",j.numPendingTests)'
```
Expected: สอง probe `PASS:` (`-t` ยังใช้ได้) · บรรทัด `Tests: … N total` รูปเดิม (suite-green.sh:10 parse ได้) · สองคีย์ที่ full-gate.sh:969-981 อ่านเป็นตัวเลข ไม่ใช่ `undefined`

- [ ] **Step 10: อิมเมจ backend ติดตั้ง lockfile ใหม่ได้** (อิมเมจติดตั้ง devDependencies ด้วย — Dockerfile:18 `--filter=gacp-backend...`)
```bash
H=$(git rev-parse HEAD); d=/home/ubuntu/work/jest30-build-${H:0:12}; rm -rf $d; mkdir -p $d; git archive HEAD | tar -x -C $d
cd $d && docker build -f apps/backend/Dockerfile --build-arg GIT_SHA=$H -t gacp-backend:proof-jest30-${H:0:12} . 2>&1 | tail -1
bash /home/ubuntu/work/wt-jest30/scripts/ops/image-smoke.sh gacp-backend:proof-jest30-${H:0:12} /home/ubuntu/work/jest30-proof-out/image 24
```
Expected: build สำเร็จ · `image-smoke: PASS`

- [ ] **Step 11: คอมมิต**
```bash
cd /home/ubuntu/work/wt-jest30; E=evidence/jest30-$(date +%F); mkdir -p $E
cp /home/ubuntu/work/jest30-proof-out/{backend,webapp}-{before,after}.summary.json /home/ubuntu/work/jest30-proof-out/lock-majors.txt $E/
```
`$E/INDEX.md`: ตารางก่อน/หลัง (listTests · suites · tests · failed · skipped) + RED/GREEN ของ `test:smoke:api` + lock-majors + image-smoke
```bash
git add package.json apps/backend/package.json pnpm-lock.yaml .github/workflows/ci.yml .github/workflows/production.yml $E
git commit -m "chore(jest): backend + ราก ^29 → ^30 — jest เมเจอร์เดียวทั้งรีโป

ตัวเลขก่อน-หลังเท่ากันทุกช่อง: <suites/tests/skipped จาก INDEX>
test:smoke:api ใช้ --testPathPatterns (ชื่อของ 30) พังบน 29 → รันได้แล้ว
workflows: --testPathPattern → --testPathPatterns · lockfile ไม่มีเมเจอร์ใหม่นอกตระกูล jest
deps-health: RED (jest-major 29 30) → GREEN

<attribution lines>"
```

### Task 8: ปิดเฟส 4 — gate · ส่ง operator

**Files:**
- Create: `evidence/gate/<sha>.json` (ใบแยก)

**Interfaces:**
- Consumes: สาขา `chore/jest-30` หลัง Task 7
- Produces: สาขาพร้อม merge (Tier C: workflows + scripts/probes)

- [ ] **Step 1: local-gate เต็ม + attestation** — คำสั่งเดียวกับ Task 5 Step 1-2 ทุกตัวอักษร รันใน `/home/ubuntu/work/wt-jest30`:
```bash
cd /home/ubuntu/work/wt-jest30 && source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && NODE_OPTIONS=--max-old-space-size=3072 LOCAL_GATE_FULL=1 SIGNING_KEY_DIR=$(mktemp -d) bash scripts/ci/local-gate.sh 2>&1 | grep -E "^\[local-gate\] [a-z0-9-]+: "
export GATE_PG_ADMIN_URL="$(node -e "const u=require('fs').readFileSync('/home/ubuntu/work/GACP-Certification-Application/apps/backend/.env','utf8').match(/^DATABASE_URL=\"?([^\"\n]+)/m)[1];const p=new URL(u);p.pathname='/postgres';p.search='';process.stdout.write(p.toString())")"
NODE_OPTIONS=--max-old-space-size=3072 bash scripts/ci/full-gate.sh 2>&1 | sed -n '/^===== full-gate/,$p'
att(){ node -e 'const j=require(process.argv[1]);console.log("node",j.versions.node);for(const c of j.checks) if(c.status==="fail") console.log(c.id+"\t"+String(c.reason||"").slice(0,110))' "$1"; }
LATEST=$(git log origin/main --format=%H | while read c; do [ -f evidence/gate/$c.json ] && echo $c && break; done)
att evidence/gate/$LATEST.json; echo ---; att evidence/gate/$(git rev-parse HEAD).json
```
Expected: ชุด fail เป็นเซตย่อยของใบล่าสุดของ main (ซึ่งตอนนี้คือใบของเฟส 3) · `integration-pg` / `integration-no-skip` อ่าน JSON ของ jest 30 ได้ (มีตัวเลข ไม่ใช่ "no integration jest report to read") · คอมมิต `evidence/gate/<sha>.json` เป็นใบแยก

- [ ] **Step 2: สรุปถึง operator (≤ 40 บรรทัด)** — Status · ตัวเลขก่อน/หลัง · RED/GREEN ของ `test:smoke:api` · tier C · คำขอ "merge" · คำถามข้อ 4

- [ ] **Step 3 (operator): merge** — ตรวจด้วย `git ls-remote origin main`

- [ ] **Step 4 (operator): deploy หรือไม่** — เฟสนี้เปลี่ยนเฉพาะ devDependencies (ตระกูล jest — `lock-majors.txt`) runtime ไม่เปลี่ยน · ตัวเลือก: ไม่ deploy แยก ให้ติดไปกับ deploy ครั้งถัดไป หรือ deploy ด้วยขั้นเดียวกับ Task 5 Step 6-9 · operator ตัดสิน

---

## คำถามเปิดถึง operator

1. **เปลี่ยน Node default ของเครื่องเป็น 24 ทันทีหลัง merge เฟส 3 (Task 5 Step 5) ใช่ไหม** — engine-strict ทำให้ main install บน 20 ไม่ได้ และสาขาที่ยังค้างบน 20.x (chore/tools-refresh, wave2/*) install บน 24 ไม่ได้จนกว่าจะ rebase
2. **gacpth.com เป็นเป้า deploy ที่สามหรือไม่** — spec เขียน staging → demo → gacpth.com แต่เครื่องนี้มีแค่คอนเทนเนอร์ -staging/-demo (docker ps 2026-09-26) · แผนเขียนแค่ staging → demo
3. **`@types/node` คง `^20`** (types ของ 20 บน runtime 24 — ไม่ผิด แค่ไม่เห็น API ใหม่) หรือให้ยกเป็น `^24` ในเฟส 3 ถือเป็นส่วนของการย้าย Node
4. **`deps-health` เป็น `ci`** ⇒ advisory critical ใหม่ตัวไหนก็ตามที่ประกาศวันไหน จะทำให้ local-gate ของทุกสาขาแดงจนกว่าจะแพตช์ — ตาม spec แต่ขอยืนยันว่ารับพฤติกรรมนี้ (ทางออกคือแพตช์ ไม่ใช่ waiver)
5. pnpm 8.15 เองก็เก่า (ไม่อยู่ในขอบเขต "ไม่อัปเมเจอร์อื่น") — บันทึกไว้เป็นงานของเฟส 5
