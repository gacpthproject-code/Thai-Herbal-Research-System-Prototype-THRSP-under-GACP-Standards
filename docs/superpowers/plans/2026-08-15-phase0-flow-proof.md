# Phase 0 — พิสูจน์ท่อไม่รั่ว (End-to-End Flow Proof) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (operator สั่งแล้ว: implementer 1 ตัวทำทั้งเฟส → auditor ตัวใหม่ context ว่างตรวจ) — steps ใช้ checkbox (`- [ ]`)
> **ชนิดงาน: VERIFICATION** — ยกสแตก / กดจริง / เก็บหลักฐาน เท่านั้น **ห้ามแก้โค้ดแอปทุกไฟล์** เจอบั๊ก = บันทึก FINDING พร้อมหลักฐานแล้วเดินต่อตามกติกา §V — การซ่อมเป็นใบแยก รอ operator สั่ง
> ข้อเท็จจริงทุกข้อในแผนนี้ตรวจจากโค้ดจริงบน branch `feat/m2a-requirement-engine` @ `d2dd3097` (2026-08-15) — ถ้าของจริงตอนรันขัดกับแผน **เชื่อของจริง บันทึกส่วนต่างเป็น FINDING** ห้ามฝืนให้ตรงแผน

**Goal:** ตอบคำถามเดียว: คำขอ GACP 1 ใบเดินจาก สมัคร → ใบรับรอง บนสแตกจริง (Postgres จริง + UI จริง) ได้หรือไม่ — ทุกครั้งที่สถานะเปลี่ยนต้องพิสูจน์ครบ 3 อย่างพร้อมกัน (คอลัมน์ DB + audit row + หน้าจอ)

> **Amendment A มีผลบังคับ (2026-08-15 บ่าย):** สภาพแวดล้อมรันเปลี่ยนจาก Docker local → **QA stack บนเซิร์ฟเวอร์ผ่าน SSH** (operator สั่ง + เคาะผ่าน AskUserQuestion) — Task 0.2/1/2/16/17 อ่านฉบับแก้ใน §Amendment A ท้ายไฟล์ · ส่วนอื่นทั้งหมด (protocol §II, เกณฑ์ §IV, กฎหยุดงาน §V, seam, สคริปต์) คงเดิมทุกตัวอักษร

**Architecture:** docker-compose dev stack (5 containers) → Playwright ขับ UI จริงทุก role, video+trace เปิดทุก scenario (config ใหม่แยกตามแบบอย่าง `playwright.walkthrough.config.ts`) → ทุก checkpoint ดูด row จริงจาก Postgres ผ่าน `docker compose exec psql` แนบคู่ screenshot → ทดสอบรอยต่อ A/B/C → verdict ตามเกณฑ์ที่เขียนล่วงหน้าใน §IV

**Tech Stack:** Docker Desktop (Windows) · docker-compose.yml (postgres:15/redis/backend:8000/frontend:3000/nginx:8080) · Prisma migrate/seed · Playwright ^1.57 (chromium) · psql ใน container (ไม่ต้องมี psql บน host)

---

## I. Global Constraints (ทุก task ต้องถือ)

| # | กติกา | ที่มา |
|---|---|---|
| G-1 | status vocab: `DONE(probe:<name>)` / `PENDING` / `BLOCKED(operator:<need>)` เท่านั้น — DONE จากความจำ = fabricated | CLAUDE.md §2 |
| G-2 | ทุก claim ต้องมี artifact ที่รันจริงใน session — ไม่มีหลักฐาน = เขียน PENDING/BLOCKED ไม่ใช่คำอธิบาย | CLAUDE.md L1 |
| G-3 | ห้าม paste secret ทุกชนิดลง evidence/report — key อ้างชื่อ env var, รหัสผ่าน seed อ้าง `apps/backend/prisma/seed-gacp.js:38-42` เท่านั้น | CLAUDE.md L2 |
| G-4 | ห้ามแก้ตัวเลขเงิน/แถวเงินใน DB ด้วยมือทุกกรณี — เงินเกิดจาก flow ของแอปเท่านั้น · ห้ามตั้ง live key (`sk_live` โผล่ = หยุดทันที รายงาน) — G1 hard gate | CLAUDE.md L3, GOALS.md:37 |
| G-5 | **path ที่เขียนได้มีแค่:** `evidence/phase0/**` · `apps/web-app/e2e-phase0/**` (ไฟล์ใหม่) · `apps/web-app/playwright.phase0.config.ts` (ไฟล์ใหม่) · root `.env` + `docker-compose.phase0.yml` (ไฟล์ runtime, **ไม่ commit**) — จบทุก task รัน `git status --porcelain` ถ้ามีไฟล์นอกรายการนี้ถูกแก้ = **หยุดทันที รายงาน** | mission |
| G-6 | **ห้ามใช้ `/api/e2e/*` backdoor** (reset/approve-documents/pass-audit) ในทุก scenario — ใช้แล้วหลักฐานเป็นโมฆะ เพราะไม่ได้พิสูจน์ท่อจริง | mission |
| G-7 | ห้ามแตะแถว seed เดิม (APP-68-001/002/003, somchai/somying) — ทุก scenario ใช้ farmer สมัครใหม่ของตัวเอง | isolation |
| G-8 | tier ตัดสินโดย `bash scripts/probes/tier-check.sh` เท่านั้น ห้ามประเมินเอง · merge = operator (คาด TIER=C เพราะชื่อไฟล์ evidence มีคำเงิน — ดู §VII) | CLAUDE.md L5 |
| G-9 | ทุก artifact กำกับ SHA + วันที่ (Asia/Bangkok) ใน note.md/INDEX ของ segment นั้น | HARNESS.md §4.4 |
| G-10 | test ใหม่ห้ามมี `.skip`/`.only` ทุกรูปแบบ (probe no-skip นับ) — scenario ที่ทำไม่ได้ = แยกไฟล์ ไม่รัน + บันทึก BLOCKED ใน INDEX | CLAUDE.md L4 |

**การตัดสินใจที่ฝังในแผน (operator เคาะโดยการอนุมัติแผนนี้):**
- **D-P1** เส้นหลักจ่ายเงินด้วย **slip rail** (UI ครบทุกคลิก ไม่พึ่ง Stripe network) — เหตุ: โค้ดปัจจุบัน Stripe rail เป็น PromptPay-only ที่ FE ไม่มีตัว confirm (`stripe-checkout-service.js:241-244` mandate D3 + ไม่มี @stripe-js ใน web-app) · Stripe test mode → webhook พิสูจน์แยกเป็น Task 17 เต็มรูป
- **D-P2** fault injection ของ Seam B ใช้ `REVOKE INSERT ON quotations FROM gacp` บน DB ทิ้งได้ของ local stack (ไม่แก้ค่าเงินใดๆ) + restore ทันทีหลังจบ — การอนุมัติแผนนี้ = อนุญาตคำสั่งคู่นี้คำสั่งเดียวเท่านั้น
- **D-P3** สแตกรันบน branch `feat/m2a-requirement-engine` @ SHA ที่ pin ตอน Task 0 (branch นี้มี origin/main ทั้งหมด + M2a ที่ audit PASS แล้ว — ไม่รอ merge)
- **D-P4** วิดีโอ + trace เปิดทาง config ใหม่ `playwright.phase0.config.ts` (Playwright ไม่มี `--video` CLI flag — พิสูจน์แล้วจาก `--help`; แบบอย่างเดียวกับ walkthrough config)

---

## II. CHECKPOINT PROTOCOL (ใช้กับทุก C## ใน §III)

ทุกจุดที่คาดว่าสถานะเปลี่ยน ต้องเก็บครบ **3 อย่างพร้อมกัน** — ขาดข้อใดข้อหนึ่ง = checkpoint นั้น **FAIL** (เกณฑ์ operator: "คอลัมน์ในตารางเปลี่ยน + audit row เกิด + หน้าจอฝั่งที่เกี่ยวข้องเปลี่ยน"):

1. **คอลัมน์ DB** — ก่อนและหลังกด (แทน `<APP>` และ `<CP>`; รันจาก repo root):
```powershell
docker compose -f docker-compose.yml exec -T postgres psql -U gacp -d gacp_db -P pager=off -x -c "SELECT id, ""applicationNumber"", status, ""reviewerId"", ""auditorId"", ""schedulerId"", version, ""updatedAt"", ""formData""->>'workflowState' AS workflow_state FROM applications WHERE id='<APP>';" > evidence/phase0/<seg>/<CP>-db-before.txt
```
   (ไฟล์ `-db-after.txt` หลังกด · ชื่อคอลัมน์จริงยืนยันครั้งเดียวด้วย `\d applications` ใน Task 1 step 8 — ถ้าต่างจากนี้ให้แก้ query แล้วบันทึกใน note.md)
2. **audit row** — หลังกด:
```powershell
docker compose -f docker-compose.yml exec -T postgres psql -U gacp -d gacp_db -P pager=off -x -c "SELECT * FROM audit_logs WHERE ""resourceId""='<APP>' ORDER BY timestamp DESC LIMIT 5;" > evidence/phase0/<seg>/<CP>-audit.txt
```
   ค่าที่คาดต่อ checkpoint อยู่ในตาราง §III คอลัมน์ "audit ที่คาด" — 3 แบบ: `canonical` (action=APPLICATION_STATUS_TRANSITION), `ad-hoc` (action เฉพาะกิจ เช่น REVIEWER_ASSIGNED — หลุมที่รู้แล้ว บันทึกแต่ไม่ FAIL ถ้า row มีจริง), `observe` (โค้ดยังไม่ยืนยัน — บันทึกของจริง) · **ไม่มี row ใดเลย = FAIL** (นี่คือหลุม fail-open ที่ operator ต้องเห็น — `application-status-writer.js:74-87`)
3. **หน้าจอ** — `page.screenshot({ path, fullPage: true })` ฝั่ง role ที่กด (ก่อน+หลัง) และฝั่งที่ควรเห็นผล (เช่น farmer เห็นสถานะใหม่) + video/trace ของ scenario ทั้งก้อนจาก config

ทุก segment มี `note.md`: SHA, เวลา (Asia/Bangkok), URL ที่กด, ผล 3/3 หรือรายการที่ขาด · **log อย่างเดียวใช้เป็นหลักฐานแทน 3 ข้อนี้ไม่ได้** (ใช้ log เป็นหลักฐานเสริมได้ เช่น seam B)

## III. แผนที่สถานะที่คาด (จาก `apps/backend/services/workflow-transition-service.js:47-91,99-196`)

vocab 20 ค่า (SSOT :18-39): DRAFT SUBMITTED PENDING_DOC_FEE PHASE_1_SLIP_UNDER_REVIEW DOC_FEE_PAID ASSIGNED_FOR_REVIEW REVISION_REQUESTED DOC_APPROVED PENDING_AUDIT_FEE PHASE_2_SLIP_UNDER_REVIEW AUDIT_FEE_PAID AUDIT_CONFIRMED CAR_PENDING CAR_REVIEWING AUDIT_PASSED APPROVED CERTIFIED REJECTED EXPIRED CANCEL_EXPIRED

| C## | transition | ใครกด (บัญชี seed) | ที่กด | audit ที่คาด |
|---|---|---|---|---|
| C01 | (สมัคร+login+DRAFT เกิด) | farmer ใหม่ | /register → wizard | observe |
| C02 | DRAFT→SUBMITTED→PENDING_DOC_FEE (2 hop ใน 1 tx) + quotations 2 แถว | farmer | preview → submit (`applications.js:846-912,982-991`) | canonical ×2 |
| C03 | PENDING_DOC_FEE→PHASE_1_SLIP_UNDER_REVIEW | farmer | /health/payments slip modal (`payment-slips.js:201`) | observe |
| C04 | PHASE_1_SLIP_UNDER_REVIEW→DOC_FEE_PAID | account 4444444444444 | /provider/accounting approve (`payment-slips.js:460`) | observe |
| C05 | DOC_FEE_PAID→ASSIGNED_FOR_REVIEW + reviewerId | scheduler 3333333333333 | /provider/coordinator assign (`scheduler-assign-reviewer-handler.js:35-253`) | **ad-hoc** REVIEWER_ASSIGNED (หลุมรู้แล้ว: เขียนตรง ไม่ผ่าน writer — `NO-DIRECT-STATUS-WRITE-BASELINE.md:3-7`) |
| C06 | ASSIGNED_FOR_REVIEW→REVISION_REQUESTED (+comment บังคับ, revisionDueAt 5 วันทำการ) | reviewer 1111111111111 | /provider/applications/[id] (`workflow-transitions-handler.js:56-269`) | canonical |
| C07 | REVISION_REQUESTED→ASSIGNED_FOR_REVIEW (**reviewerId ต้องไม่เปลี่ยน**) | farmer | edit → resubmit ผ่าน /submit (`applications.js:681-694,929-944`) | canonical |
| C08 | ASSIGNED_FOR_REVIEW→DOC_APPROVED แล้วระบบต่อ →PENDING_AUDIT_FEE + phase-2 invoices | reviewer แล้ว SYSTEM | เดียวกับ C06 (`workflow-side-effects.js:131-183`) | canonical ×2 |
| C09 | PENDING_AUDIT_FEE→PHASE_2_SLIP_UNDER_REVIEW | farmer | slip modal phase 2 | observe |
| C10 | PHASE_2_SLIP_UNDER_REVIEW→AUDIT_FEE_PAID | account | /provider/accounting | observe |
| C11 | AUDIT_FEE_PAID→AUDIT_CONFIRMED (+auditSchedule ใน formData) | scheduler | /provider/scheduler/queue assign auditor (`audit-scheduling-service.js:346-352`) | observe |
| C12 | AUDIT_CONFIRMED→AUDIT_PASSED + **certificate row เกิดที่นี่** (โค้ดปัจจุบัน — ruling D2 บอกผิดที่ ห้ามซ่อมในเฟสนี้ แค่บันทึก) | auditor 2222222222222 | /provider/audits/[id] decision PASS (`auditor-audit-decision-handler.js:45-217`) | canonical + cert (`application-status-writer.js:957-986`) |
| C13 | AUDIT_PASSED→APPROVED | auditor | final-approvals (`auditor.js:61-173`) | canonical |
| C14 | APPROVED→CERTIFIED — **ไม่พบปุ่ม FE เฉพาะ** → ลอง UI /provider/work/[id] ก่อน ไม่มี = FINDING + ปิดท่อด้วย API (edge ถูกกฎ: auditor, `workflow-transition-service.js:156`) | auditor | UI หรือ `POST /api/provider/applications/<APP>/workflow-transitions {"toState":"CERTIFIED","comment":"..."}` | canonical |
| C15 | (view) farmer เห็นใบรับรอง + PDF + หน้า public verify | farmer | /health/certificates, /health/certificates/[id], /verify/[certNo] | — |

## IV. เกณฑ์ผ่าน/ไม่ผ่าน (เขียนล่วงหน้า — ห้ามแก้หลังเริ่มรัน)

- **PASS** = C01–C15 ครบทุกตัว และแต่ละตัวได้ 3/3 ตาม §II และตาราง certificates มีแถวของ FARMER_MAIN_APP และ farmer เปิดดูใบรับรองได้จริงบนจอ
- **FAIL** = checkpoint ใดขาดข้อใดข้อหนึ่งใน 3 (รวมกรณี audit row ไม่เกิดเลย) หรือท่อตัน (สถานะไปต่อไม่ได้ด้วย role ที่ถูกกฎ)
- **ท่อตันกลางทาง**: เก็บหลักฐานสภาพติด (จอ + DB + สิ่งที่กดแล้วไม่ไป) → จบ scenario นั้น → Phase 0 = FAIL — **แต่ทำ Task 14-17 ต่อให้จบ** เพื่อ map รอยรั่วให้ครบในรอบเดียว
- checkpoint ที่ได้ 3/3 แต่พฤติกรรมต่างจากตาราง §III (เช่น audit เป็น ad-hoc แทน canonical ในจุดที่คาด canonical) = **บันทึก FINDING, ไม่ล้ม verdict** ถ้าท่อยังเดิน
- Seam A/B/C (Task 14-16) และ Stripe rail (Task 17) **ไม่นับใน verdict เส้นหลัก** แต่เป็นหลักฐานบังคับ: ทำไม่ได้ = เขียน BLOCKED พร้อมเหตุ ห้ามเงียบ

## V. กฎหยุดงาน (mission law — ไม่ขัด CLAUDE.md จึงมีผลเต็ม)

**ถ้า Phase 0 = FAIL: ห้ามเริ่มงานใหม่ทุกชนิดทั้ง repo จนกว่ารอยรั่วที่พบจะถูกซ่อมและ Phase 0 รันซ้ำผ่าน** — implementer บันทึกใน report + เสนอบรรทัด append ลง HARNESS_LOG.md + เสนอรายการใบซ่อม (1 finding = 1 ใบ) ให้ operator สั่ง — implementer **ห้ามซ่อมเอง** ("เพื่อไม่ให้ซ่อมไปเรื่อยจนไม่รู้ว่าอะไรพังจริง")

## VI. File Structure

```
apps/web-app/playwright.phase0.config.ts     ← config ใหม่ (video on + trace on, แบบ walkthrough)
apps/web-app/e2e-phase0/
  helpers.ts                                  ← login/psql-dump/thai-id/png fixture (โค้ดเต็มใน Task 2)
  s01-register-submit.spec.ts                 ← C01-C02
  s02-pay-phase1-slip.spec.ts                 ← C03-C04
  s03-assign-review-revision.spec.ts          ← C05-C07
  s04-approve-pay2-schedule.spec.ts           ← C08-C11
  s05-audit-approve-certified.spec.ts         ← C12-C15
  seam-a.spec.ts / seam-c.spec.ts / seam-b.spec.ts
evidence/phase0/
  INDEX.md · VARS.md · FINDINGS.md
  00-stack/ · s01/ … s05/ · seam-a/ · seam-b/ · seam-c/ · stripe-rail/ · db-suite/
  playwright-report/ · test-output/           ← video+trace (outputDir ของ config)
docker-compose.phase0.yml + .env             ← runtime เท่านั้น ห้าม commit (เนื้อหาบันทึกใน INDEX แบบไม่มี secret)
```
**Interfaces ระหว่าง task:** `evidence/phase0/VARS.md` รูปแบบ `KEY=value` — คีย์บังคับ: `SHA_UNDER_TEST, FARMER_MAIN_ID, FARMER_MAIN_APP, FARMER_A_ID, FARMER_A_APP, FARMER_B_ID, FARMER_B_APP, FARMER_B2_ID, FARMER_ST_ID, FARMER_ST_APP` (id = เลข 13 หลักที่ generate; APP = uuid จาก DB) — ทุก task อ่านค่าจากไฟล์นี้ ห้ามจำเอง

---

### Task 0: Preflight — เครื่องพร้อมไหม + pin SHA

**Files:** Create `evidence/phase0/00-stack/preflight.txt`, `evidence/phase0/VARS.md`

- [ ] **0.1** `bash scripts/session-check.sh > evidence/phase0/00-stack/preflight.txt 2>&1` (CLAUDE.md §1)
- [ ] **0.2** เช็คเครื่องมือ (ต่อท้ายไฟล์เดิม): `docker --version; docker info | Select-String 'Server Version'; node --version; pnpm --version; git --version` — **node หรือ pnpm ไม่มี = `BLOCKED(operator:ติดตั้ง Node 20 LTS + pnpm 8 บน host — Playwright รันใน container ไม่ได้)` จบเฟสทันที** · Docker ไม่วิ่ง = BLOCKED(operator:เปิด Docker Desktop)
- [ ] **0.3** pin SHA: `git rev-parse HEAD` → เขียน `SHA_UNDER_TEST=<sha>` ลง VARS.md · `git status --porcelain` ต้องว่าง (ยกเว้นไฟล์แผนนี้)
- [ ] **0.4** ยืนยัน tier ล่วงหน้า (กันเข้าใจผิดตอนปิดงาน): `printf '%s\n' docs/superpowers/plans/2026-08-15-phase0-flow-proof.md evidence/phase0/INDEX.md evidence/phase0/stripe-rail/settle.txt apps/web-app/e2e-phase0/s01-register-submit.spec.ts apps/web-app/playwright.phase0.config.ts | bash scripts/probes/tier-check.sh -` → เก็บ output (คาดไฟล์ใต้ stripe-rail/ = C)
- [ ] **0.5** สร้างโฟลเดอร์ evidence ทั้งหมดตาม §VI + INDEX.md โครงเปล่า (หัวแบบ `evidence/M2a/INDEX.md`: H1 + ตาราง |ไฟล์|คืออะไร|ผล| + หัวข้อ "สถานะที่ห้ามเคลม")

### Task 1: ยกสแตก (docker-compose + migrate + seed) — เกณฑ์สำเร็จเขียนล่วงหน้า

**Files:** Create `evidence/phase0/00-stack/{env-setup.txt,up.txt,ps.txt,migrate.txt,migrate-verify.txt,seed.txt,seed-all.txt,health.txt,ready.txt,schema-applications.txt,login-smoke.png}`

- [ ] **1.1** `Copy-Item .env.local.example .env` แล้ว `docker compose -f docker-compose.yml config --quiet` → exit 0 (ถ้า error 'DB_PASSWORD is required' = .env ไม่ครบ — docker-compose.yml:14-16)
- [ ] **1.2** `docker volume create gacp-postgres-data` (volume เป็น external — docker-compose.yml:123-126 — ไม่สร้างก่อน up ไม่ขึ้น)
- [ ] **1.3** `docker compose -f docker-compose.yml up -d --build 2>&1 | Tee-Object evidence/phase0/00-stack/up.txt` — build ครั้งแรกบน Windows อาจนานมาก (ไม่มีตัวเลขอ้างอิงใน repo) — ห้ามฆ่ากลางคัน
- [ ] **1.4** รอ healthy แล้ว `docker compose -f docker-compose.yml ps > evidence/phase0/00-stack/ps.txt` → เกณฑ์: gacp-postgres และ gacp-backend แสดง `(healthy)` ครบ 5 containers Started
- [ ] **1.5** migrate: `docker compose -f docker-compose.yml exec backend npx prisma migrate deploy 2>&1 | Tee-Object evidence/phase0/00-stack/migrate.txt` → exit 0
- [ ] **1.6** verify: `docker compose -f docker-compose.yml exec -T postgres psql -U gacp -d gacp_db -c "SELECT count(*) FILTER (WHERE finished_at IS NOT NULL) AS ok, count(*) FILTER (WHERE finished_at IS NULL) AS failed FROM _prisma_migrations;" > evidence/phase0/00-stack/migrate-verify.txt` → เกณฑ์: failed=0 และ ok = จำนวน dir ใน `apps/backend/prisma/migrations` (นับสดตอนรัน — ตอนเขียนแผนคือ 118)
- [ ] **1.7** seed 2 ชั้น: `docker compose -f docker-compose.yml exec backend npx prisma db seed 2>&1 | Tee-Object evidence/phase0/00-stack/seed.txt` (คาดบรรทัด 'GACP Thai Seed Complete!' + ตารางบัญชี — seed-gacp.js:523-537) แล้ว `docker compose -f docker-compose.yml exec backend node prisma/seed-all.js 2>&1 | Tee-Object evidence/phase0/00-stack/seed-all.txt` (คาด '[seed-all] all config seeds completed.' — ไม่รันตัวนี้ wizard/มาตรฐาน/เลขใบเสร็จพังเงียบ — seed-all.js:59-67) · ถ้า `db seed` fail ใน image ให้ใช้ fallback ที่ production ใช้: `exec backend node prisma/seed-gacp.js` + `exec backend node prisma/seed-bank-accounts.js` (production.yml:276-286)
- [ ] **1.8** เก็บ schema จริงไว้ปรับ query: `... exec -T postgres psql -U gacp -d gacp_db -c "\d applications" > evidence/phase0/00-stack/schema-applications.txt` (+ `\d audit_logs`, `\d quotations`, `\d certificates`, `\d payment_slips`, `\d invoices` ต่อท้ายไฟล์เดียวกัน)
- [ ] **1.9** health ผ่าน nginx: `curl.exe -s http://localhost:8080/api/health > evidence/phase0/00-stack/health.txt` → 200 `"status":"OK"` · `curl.exe -s http://localhost:8080/api/health/ready > evidence/phase0/00-stack/ready.txt` → เป้า READY; **ถ้า 503 NOT_READY**: อ่านชื่อ check ที่ fail ในคำตอบ — ถ้าเป็น secret ที่ dev compose ไม่ส่ง (เช่น ENCRYPTION_KEY — compose ส่ง env แค่ 9 ตัว docker-compose.yml:46-56): สร้าง `docker-compose.phase0.yml` เติม env นั้นจาก .env แล้ว `docker compose -f docker-compose.yml -f docker-compose.phase0.yml up -d backend` → เช็คซ้ำ เก็บทั้งสองผล — แก้ไม่ได้ = BLOCKED(operator:<check ที่ fail>)
- [ ] **1.10** login smoke ด้วยตา: เปิด http://localhost:8080 → /auth/health/login → login ด้วย healthId `1100100100012` (รหัสอ้าง seed-gacp.js:41) → ถึง /health/dashboard → screenshot เก็บ `login-smoke.png`
- [ ] **1.11** **เกณฑ์ Task 1 สำเร็จ (ครบทุกข้อ):** ① 5 containers up, postgres+backend healthy ② migrations ok=ทั้งหมด failed=0 ③ seed 2 ชั้นจบด้วยบรรทัดสำเร็จ ④ /api/health 200 ⑤ ready READY หรือบันทึกเหตุ+ผลการแก้ ⑥ login smoke ผ่านด้วยภาพ — ขาดข้อไหน = แก้ให้ได้ก่อนไปต่อ หรือ BLOCKED

### Task 2: Harness — config + helper (ไฟล์ใหม่เท่านั้น)

**Files:** Create `apps/web-app/playwright.phase0.config.ts`, `apps/web-app/e2e-phase0/helpers.ts`
**Interfaces → ทุก spec:** `login(page, {kind:'health'|'provider', id})` · `dump(seg, cp, phase, appId)` · `auditDump(seg, cp, appId)` · `thaiId()` · `pngFixture(dir)` · `saveVars(k,v)` / `readVars()`

- [ ] **2.1** `cd apps/web-app; pnpm install; npx playwright install chromium` (host — จาก Task 0.2 ยืนยันแล้วว่ามี node/pnpm)
- [ ] **2.2** เขียน `apps/web-app/playwright.phase0.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test';
// แบบอย่าง: playwright.walkthrough.config.ts (video+trace เต็ม, workers:1 — login rate-limit 50/15นาที/IP)
const EVIDENCE = process.env.PHASE0_EVIDENCE_DIR ?? '../../evidence/phase0';
export default defineConfig({
  testDir: '.',
  testMatch: ['e2e-phase0/**/*.spec.ts'],
  timeout: 20 * 60 * 1000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: `${EVIDENCE}/playwright-report`, open: 'never' }]],
  outputDir: `${EVIDENCE}/test-output`,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:8080',
    video: 'on',
    trace: 'on',
    screenshot: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```
- [ ] **2.3** เขียน `apps/web-app/e2e-phase0/helpers.ts`:
```ts
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Page } from '@playwright/test';

export const REPO = resolve(__dirname, '../../..');
export const EV = join(REPO, 'evidence/phase0');
const ALLOWED = new Set(['applications','audit_logs','quotations','invoices','payment_slips',
  'payment_transactions','checkout_orders','certificates','users','stripe_webhook_events']);

export function psql(sql: string): string {
  if (!/^\s*(SELECT|\\d)/i.test(sql)) throw new Error('SELECT/\\d only — G-4');
  const t = sql.match(/FROM\s+([a-z_]+)/i)?.[1];
  if (t && !ALLOWED.has(t)) throw new Error(`table ${t} not in allowlist`);
  return execFileSync('docker', ['compose','-f','docker-compose.yml','exec','-T','postgres',
    'psql','-U','gacp','-d','gacp_db','-P','pager=off','-x','-c', sql],
    { cwd: REPO, encoding: 'utf8' });
}
export function dump(seg: string, cp: string, phase: 'before'|'after', appId: string) {
  mkdirSync(join(EV, seg), { recursive: true });
  writeFileSync(join(EV, seg, `${cp}-db-${phase}.txt`),
    psql(`SELECT id, "applicationNumber", status, "reviewerId", "auditorId", "schedulerId",
      version, "updatedAt", "formData"->>'workflowState' AS workflow_state
      FROM applications WHERE id='${appId}';`));
}
export function auditDump(seg: string, cp: string, appId: string) {
  writeFileSync(join(EV, seg, `${cp}-audit.txt`),
    psql(`SELECT * FROM audit_logs WHERE "resourceId"='${appId}' ORDER BY timestamp DESC LIMIT 5;`));
}
export function thaiId(): string { // mod-11 checksum (แบบเดียวกับ e2e-golden-scenario.spec.ts:26-32)
  const d = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10));
  d.push((11 - (d.reduce((s, n, i) => s + n * (13 - i), 0) % 11)) % 10);
  return d.join('');
}
export function pngFixture(dir: string): string { // 1x1 PNG สำหรับ upload เอกสาร/สลิป
  const p = join(dir, 'fixture.png');
  writeFileSync(p, Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64'));
  return p;
}
export function saveVars(k: string, v: string) { appendFileSync(join(EV, 'VARS.md'), `${k}=${v}\n`); }
export function readVars(): Record<string, string> {
  return Object.fromEntries(readFileSync(join(EV, 'VARS.md'), 'utf8')
    .split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
}
export async function login(page: Page, o: { kind: 'health'|'provider'; id: string; pw: string }) {
  if (o.kind === 'health') { // selector จริง: health-login-page.tsx:270,299
    await page.goto('/auth/health/login');
    await page.fill('#identifier', o.id); await page.fill('#password', o.pw);
    await page.click('button[type="submit"]'); await page.waitForURL('**/health/**');
  } else {                    // provider-login-page.tsx:189,211
    await page.goto('/auth/provider/login');
    await page.fill('#provider-id', o.id); await page.fill('#provider-password', o.pw);
    await page.click('button[type="submit"]'); await page.waitForURL('**/provider/**');
  }
}
```
   (รหัสผ่าน: spec อ่านจาก env `PHASE0_SEED_PW_APPLICANT` / `PHASE0_SEED_PW_OFFICER` / `PHASE0_SEED_PW_ADMIN` ที่ implementer ตั้งจากค่าใน seed-gacp.js:38-42 ก่อนรัน — ห้ามเขียนค่าลงไฟล์ใดๆ)
- [ ] **2.4** ทดสอบ harness: spec ชั่วคราวว่าง 1 ตัวรัน `npx playwright test --config=playwright.phase0.config.ts` → มี video/trace โผล่ใน `evidence/phase0/test-output/` แล้วลบ spec ชั่วคราว
- [ ] **2.5** `git status --porcelain` → ต้องมีแค่ path ใน G-5

### Task 3 (S1): สมัคร + login + draft เกิด — C01

**Files:** Create `apps/web-app/e2e-phase0/s01-register-submit.spec.ts`, `evidence/phase0/s01/*`

- [ ] **3.1** spec ส่วนที่ 1: `id = thaiId()` → saveVars('FARMER_MAIN_ID', id) → เปิด `/register` เดิน wizard 4 ขั้น (field ตาม schema `auth-schemas.js`: ชื่อ/สกุล/อีเมล/เบอร์/เลข 13 หลัก/รหัสผ่าน/consent — selector ดูจาก `apps/web-app/src/app/(auth)/register/page.tsx` ตอนรัน; **ถ้า wizard block ทาง**: fallback สมัครผ่าน `POST /api/auth/health/register` แล้ว login ผ่าน UI — บันทึกเป็น deviation ใน note.md พร้อมภาพจุดที่ block) → screenshot ทุก step
- [ ] **3.2** login ด้วย `login(page,{kind:'health', id,...})` → screenshot dashboard
- [ ] **3.3** สร้างคำขอ: /health/applications/new → wizard step 1→9 (consent, เลือกพืช, ข้อมูลทั่วไป, ฟาร์ม, การผลิต, QC, **อัปโหลดเอกสาร ≥1 ไฟล์ด้วย `pngFixture()`** — ไม่มีเอกสาร submit ตกที่ validator `canonical-application-validator.js:279-285`; ถ้า .png ถูกปฏิเสธดู ALLOWED_FILE_TYPES ใน .env แล้วสลับ fixture เป็นชนิดที่รับ, review) — draft autosave ผ่าน `POST /api/applications/draft`
- [ ] **3.4** ดึง APP id: `psql("SELECT id,status FROM applications WHERE ...")` — where ด้วยเลขบัตร/เจ้าของ ตาม schema จริงจาก Task 1.8 → saveVars('FARMER_MAIN_APP', id) → `dump('s01','C01','after', app)` → เกณฑ์: status=DRAFT
- [ ] **3.5** รัน spec → ผ่าน → `git status` guard → commit เฉพาะ spec ใหม่: `git add apps/web-app/e2e-phase0 apps/web-app/playwright.phase0.config.ts && git commit -m "test(phase0): s01 register+draft harness"` (evidence commit รวบตอน Task 19)

### Task 4 (S2): ยื่นคำขอ — 2 hop + ใบเสนอราคา — C02

**Files:** Modify `s01-register-submit.spec.ts` (ต่อ) · Create `evidence/phase0/s01/C02-*`

- [ ] **4.1** `dump('s01','C02','before', APP)` (คาด DRAFT)
- [ ] **4.2** UI: preview → กดยื่น (FE ยิง `POST /api/applications/submit` แล้วพาไป /health/payments — `preview/client-view.tsx:100-140`) → screenshot ก่อน/หลัง
- [ ] **4.3** `dump after` → เกณฑ์: status=PENDING_DOC_FEE (2 hop ใน tx เดียว `applications.js:846-912`) · `auditDump` → เกณฑ์: canonical 2 แถว (DRAFT→SUBMITTED, SUBMITTED→PENDING_DOC_FEE)
- [ ] **4.4** ใบเสนอราคา (fire-and-forget — รอ ≤10s แล้ว query): `psql("SELECT id,\"issuerType\",status,\"totalAmount\" FROM quotations WHERE \"applicationId\"='<APP>';")` → เกณฑ์: 2 แถว DTAM+PLATFORM (`quotation-service.js:431-464`) — ยอดคาดที่ scopeCount=1: DTAM 5000, PLATFORM 535 (ห้ามพิมพ์เลขนี้ลง assertion แบบ hardcode — อ่านจาก breakdown ที่หน้าจอเทียบ DB แล้วบันทึกภาพ+dump คู่กัน)
- [ ] **4.5** จอ farmer /health/payments: QuotationReviewSection แสดง 2 ใบ → screenshot = ครบ 3/3 ของ C02

### Task 5 (S3): จ่ายงวด 1 ด้วยสลิป — C03, C04

**Files:** Create `apps/web-app/e2e-phase0/s02-pay-phase1-slip.spec.ts`, `evidence/phase0/s02/*`

- [ ] **5.1** (farmer) /health/payments → ถ้า UI ต้องกดสร้าง invoice ก่อน ให้กดตาม flow (`POST /api/payments/create {phase:'1'}` — `payments.js:160`) → slip modal: แนบ `pngFixture()` + กรอก bankRef/วันโอน/ยอด (ยอดอ่านจากหน้าจอ) → submit (`payment-slips.js:201`) — ก่อนกด `dump('s02','C03','before')`, หลังกด `dump after` + `auditDump` → เกณฑ์: PHASE_1_SLIP_UNDER_REVIEW · ปุ่มสลิปไม่ทำงาน/ไม่มี bank account = ตรวจ seed-bank-accounts (Task 1.7) ก่อนสรุป FINDING
- [ ] **5.2** (account) login provider `4444444444444` → /provider/accounting → เปิดสลิป → อนุมัติ (`payment-slips.js:460`) — dump before/after + audit → เกณฑ์: DOC_FEE_PAID · screenshot จอ account และจอ farmer ที่สถานะเปลี่ยน = C04
- [ ] **5.3** รัน spec s02 → เขียน note.md ทั้ง segment

### Task 6 (S4): แจกงานให้ reviewer — C05 (จุด audit-hole ที่รู้แล้ว)

**Files:** Create `apps/web-app/e2e-phase0/s03-assign-review-revision.spec.ts`, `evidence/phase0/s03/*`

- [ ] **6.1** (scheduler `3333333333333`) /provider/coordinator → assign modal → เลือก reviewer `1111111111111` → ยืนยัน (`POST /api/provider/scheduler/reviewer-assignments` — ต้องอยู่ DOC_FEE_PAID ไม่งั้น 409)
- [ ] **6.2** dump before/after → เกณฑ์: ASSIGNED_FOR_REVIEW + `reviewerId` = uuid ของ reviewer (จับคู่กับ `psql("SELECT id,email FROM users WHERE ...")` ครั้งเดียวเก็บใน note) · auditDump → **คาด: ไม่มี canonical row, มี ad-hoc REVIEWER_ASSIGNED** (`scheduler-assign-reviewer-handler.js:189-210` + workflowHistory ใน formData) — มี row = C05 ผ่านตามเกณฑ์ operator + บันทึก FINDING "hop นี้ไม่เขียน canonical" · ไม่มี row ใดเลย = FAIL
- [ ] **6.3** (reviewer) login → /provider/reviewer → งานโผล่ในคิว → screenshot = จอฝั่งรับ

### Task 7 (S5): reviewer ส่งกลับแก้ — C06

- [ ] **7.1** (reviewer) เปิด /provider/applications/[APP] → ขอแก้ไข (toState REVISION_REQUESTED + ข้อความบังคับ — ไม่ใส่ = 422 ที่ `workflow-transitions-handler.js:96-101`) → dump/audit → เกณฑ์: REVISION_REQUESTED + canonical row + `revisionDueAt` ถูก stamp (+5 วันทำการไทย — ดูค่าแล้วบันทึก ไม่ต้อง assert วันที่เป๊ะในเฟสนี้)
- [ ] **7.2** จอ farmer: /health/applications badge ส่งกลับแก้ + กำหนดเวลา → screenshot

### Task 8 (S6): farmer แก้แล้วยื่นกลับ — ต้องกลับคนเดิม — C07

- [ ] **8.1** `dump before` (จับ `reviewerId` ปัจจุบันไว้เทียบ)
- [ ] **8.2** (farmer) /health/applications/[APP]/edit → wizard re-entry → แก้ field ใดๆ 1 จุด → ยื่นกลับ (FE ใช้ `POST /api/applications/submit` — RESUBMIT_TARGET `applications.js:681-694`)
- [ ] **8.3** dump after + audit → เกณฑ์ 3 ข้อ: status=ASSIGNED_FOR_REVIEW · canonical row (action REVISION_RESUBMITTED per `applications.js:929-944`) · **`reviewerId` เท่าเดิมทุกตัวอักษร** (กลไก "กลับคนเดิม" เป็น implicit — ไม่มีโค้ด reroute, คอลัมน์ต้องไม่ถูกล้าง — `reviewer-queue-where.js:29-69`)
- [ ] **8.4** (reviewer) คิว /provider/reviewer เห็นใบเดิมกลับมา → screenshot

### Task 9 (S7): อนุมัติเอกสาร → ระบบต่อท่อไปงวด 2 — C08

- [ ] **9.1** (reviewer) อนุมัติ (toState DOC_APPROVED) → dump/audit → เกณฑ์: status ปลายทาง = **PENDING_AUDIT_FEE** (SYSTEM auto-chain `workflow-side-effects.js:131-183`) + canonical 2 แถว (DOC_APPROVED และ PENDING_AUDIT_FEE) + invoice phase 2 เกิด: `psql("SELECT id,phase,status,\"totalAmount\" FROM invoices WHERE \"applicationId\"='<APP>';")`
- [ ] **9.2** จอ farmer: /health/payments โชว์งวด 2 → screenshot

### Task 10 (S8): จ่ายงวด 2 ด้วยสลิป — C09, C10

- [ ] **10.1** ทำซ้ำแบบ Task 5 กับ phase 2 (slip upload → PHASE_2_SLIP_UNDER_REVIEW → account อนุมัติ → AUDIT_FEE_PAID) — dump/audit/screenshot ครบทั้ง 2 checkpoint · หมายเหตุโค้ด: `POST /api/payments/create` phase 2 = 410 deprecated (`payments.js:202-217`) — invoice ถูก mint แล้วจาก C08 จึงอัปสลิปได้เลย ถ้า UI เรียก create แล้วเจอ 410 = บันทึกภาพเป็น FINDING

### Task 11 (S9): นัดลงพื้นที่ — C11

- [ ] **11.1** (scheduler) /provider/scheduler/queue (filter default AUDIT_FEE_PAID) → assign auditor `2222222222222` + วัน/เวลา/สถานที่/โหมด ONSITE (ONSITE ต้องมี location/mapLink — `scheduler-audit-schedules-post-handler.js:41-92`) → dump/audit → เกณฑ์: AUDIT_CONFIRMED + `formData->auditSchedule` มีนัด (ไม่มีตารางนัดแยก — เก็บ dump formData ส่วนนี้ด้วย)
- [ ] **11.2** จอ auditor: /provider/audits เห็นนัด → screenshot

### Task 12 (S10): ผลตรวจ PASS — C12 (+จุดเกิดใบรับรอง per โค้ดปัจจุบัน)

- [ ] **12.1** (auditor) /provider/audits/[APP] → decision PASS + notes (`auditor-audit-decision-handler.js:45-217`) → dump/audit → เกณฑ์: AUDIT_PASSED + canonical row
- [ ] **12.2** ใบรับรอง: `psql("SELECT id,\"certificateNumber\",status,\"applicationId\" FROM certificates WHERE \"applicationId\"='<APP>';")` → **โค้ดปัจจุบัน mint ที่นี่** (`application-status-writer.js:957-986`) — มีแถว = บันทึก + หมายเหตุ ruling D2 (GAP-MAP.md:117: ที่ถูกควรมีผลที่ CERTIFIED) — **ห้ามซ่อม แค่บันทึก** · ไม่มีแถว = observe ต่อที่ C13/C14 แล้วบันทึกจุดที่เกิดจริง

### Task 13 (S11): อนุมัติขั้นสุดท้าย → CERTIFIED → farmer เห็นใบ — C13, C14, C15

- [ ] **13.1** (auditor) final approval (`POST .../final-approvals` — `auditor.js:61-173` ผ่าน UI /provider/audits) → dump/audit → APPROVED = C13
- [ ] **13.2** ปิดท่อ APPROVED→CERTIFIED: **ลอง UI ก่อน** (/provider/work/[APP] หรือปุ่มใดๆ ฝั่ง auditor) — ไม่พบปุ่ม (ตามที่ research ไม่พบ) = screenshot จุดที่ควรมี + **FINDING F-UI-CERT: hop สุดท้ายไม่มีประตู UI** → ปิดด้วย API (edge ถูกกฎ auditor): `POST /api/provider/applications/<APP>/workflow-transitions {"toState":"CERTIFIED","comment":"Phase0 close"}` → dump/audit → CERTIFIED = C14
- [ ] **13.3** C15 (view): จอ farmer /health/certificates มีใบ → เปิดรายละเอียด → ดาวน์โหลด PDF (`GET /api/certificates/:id/download`) เก็บไฟล์ลง evidence/phase0/s05/ → หน้า public /verify/[certNo] ขึ้นผลถูกใบ → screenshot ทั้งสามจอ
- [ ] **13.4** **สรุป verdict เส้นหลักตาม §IV ลง INDEX ทันที** (ก่อนทำ seam) — นับ 3/3 ราย checkpoint

### Task 14 (Seam A): DRAFT มุดประตู revision → ค้าง SUBMITTED — มีทางไปจ่ายเงินไหม

**Files:** Create `apps/web-app/e2e-phase0/seam-a.spec.ts`, `evidence/phase0/seam-a/*`
คาดจากโค้ด (พิสูจน์บน DB จริงคือภารกิจ): ประตูรับ DRAFT (`application-review-revision-methods.js:63-69`) เขียน SUBMITTED (:97-98) ไม่ต่อ hop-2 ไม่ออกใบเสนอราคา (ทั้งไฟล์ไม่มี quotation call) · ทางออกเดียวของ SUBMITTED เป็นของ SYSTEM (`workflow-transition-service.js:49,171-172`)

- [ ] **14.1** สร้าง farmer#2 (`thaiId()` → FARMER_A_ID) + draft ครบเอกสาร (ซ้ำวิธี Task 3) → FARMER_A_APP — dump before (DRAFT)
- [ ] **14.2** ยิงประตู: `PUT /api/applications/<APP_A>/revision` body `{"formData":{},"notes":"seam-A"}` (Bearer token ของ farmer#2 — ดึงจาก localStorage หลัง UI login ใน spec) → คาด 200 `data.status='SUBMITTED'`
- [ ] **14.3** พิสูจน์ค้าง: dump after (SUBMITTED) · `GET /:id/quotations` → คาด `{dtam:null,platform:null}` · จอ farmer /health/applications badge อะไรโชว์ → screenshot · จอ scheduler: urgent-monitor นับ SUBMITTED เป็นงานค้าง (`scheduler.js:54-62`) → screenshot
- [ ] **14.4** เงินเก็บได้จากสถานะค้างจริงไหม: `POST /api/payments/create {applicationId, phase:'1'}` (rail สลิป — รับ SUBMITTED ที่ `payment-service-phase-flow.js:83`) → บันทึกผลจริง (invoice เกิด?) แล้วลองอัปสลิป → **บันทึกสิ่งที่เกิดตามจริง** (edge PENDING_DOC_FEE→PHASE_1_SLIP จาก SUBMITTED ผิดกฎ — จะ error หรือหลุด = หลักฐานทั้งคู่) — **หยุดแค่สังเกต ห้ามพยายามดันต่อ**
- [ ] **14.5** negative: reviewer ยิง transition ใส่ SUBMITTED → คาด 422 INVALID_TRANSITION → เก็บ response
- [ ] **14.6** FINDING F-A ลง FINDINGS.md: อาการ + artifact ครบ + file:line

### Task 15 (Seam C): กดยื่นซ้ำบนใบที่ค้าง SUBMITTED — จอกับความจริงตรงกันไหม

**Files:** Create `apps/web-app/e2e-phase0/seam-c.spec.ts`, `evidence/phase0/seam-c/*` (ใช้ FARMER_A_APP จาก Task 14)

- [ ] **15.1** dump before (SUBMITTED) → `POST /api/applications/submit {applicationId: APP_A}` → คาด 200 `data.status='PENDING_DOC_FEE'` + `nextRequiredAction='PAY_PHASE_1'` (**ตอบปลอมจาก early-return** `applications.js:659-662` — ไม่เขียนอะไรเลย)
- [ ] **15.2** dump after → คอลัมน์ยัง SUBMITTED · auditDump → ไม่มี row ใหม่ · ทำซ้ำ 2 ครั้ง = ตอบเหมือนเดิมทุกครั้ง
- [ ] **15.3** จอ farmer: กดยื่นจาก UI (ถ้า UI เปิดให้กด) → จอโชว์อะไร vs DB → screenshot คู่ dump = FINDING F-C

### Task 16 (Seam B): ใบเสนอราคาล้มเงียบ — ใครรู้บ้าง

**Files:** Create `apps/web-app/e2e-phase0/seam-b.spec.ts`, `evidence/phase0/seam-b/*`
**ทำท้ายสุดของสาย scenario เสมอ (ก่อน Task 17) — จบแล้วต้อง restore + พิสูจน์ restore**

- [ ] **16.1** เก็บสิทธิ์ก่อน: `... psql -c "\dp quotations" > evidence/phase0/seam-b/grants-before.txt`
- [ ] **16.2** ตัดขา (คำสั่งที่ D-P2 อนุญาต): `docker compose -f docker-compose.yml exec -T postgres psql -U gacp -d gacp_db -c "REVOKE INSERT ON TABLE quotations FROM gacp;"` — ไม่แตะค่าเงินใดๆ ทำให้ INSERT ล้มเท่านั้น (จุดล้มจริง: `quotation-service.js:431` → promise reject → `.catch` ที่ `applications.js:985` กลืนเป็น warn)
- [ ] **16.3** farmer#3 ใหม่ (FARMER_B_ID) draft ครบ → submit ผ่าน UI ปกติ → **คาด: UI สำเร็จสวยงามทุกประการ** (200 + PENDING_DOC_FEE + พาไปหน้า payments)
- [ ] **16.4** พิสูจน์ "ใครรู้": ① `docker compose -f docker-compose.yml logs backend --since 5m | Select-String 'quotation auto-issue failed'` → เก็บบรรทัด warn (หลักฐานว่าร่องรอยเดียวคือ log ที่ไม่มีใครดู) ② `GET /:id/quotations` → `{dtam:null,platform:null}` ③ จอ farmer /health/payments — QuotationReviewSection ว่าง/ค้างยังไง → screenshot ④ จอ account /provider/accounting — เห็นอะไรไหม → screenshot ⑤ audit_logs — มี row แจ้งเหตุไหม (คาด: ไม่มี)
- [ ] **16.5** restore ทันที: `GRANT INSERT ON TABLE quotations TO gacp;` → `\dp quotations` เก็บ grants-after.txt เทียบเท่า before
- [ ] **16.6** พิสูจน์ restore ด้วย farmer#4 (FARMER_B2_ID): submit ใหม่ → quotations 2 แถวโผล่ปกติ → dump
- [ ] **16.7** FINDING F-B: เกษตรกรติดอยู่หน้า "จ่ายเงิน" ที่ไม่มีใบให้จ่าย โดยระบบไม่แจ้งใคร — artifact ①-⑤

### Task 17 (Stripe rail): จ่ายจริงบน Stripe test mode → webhook → SETTLED

**Files:** Create `evidence/phase0/stripe-rail/*` · `docker-compose.phase0.yml` (runtime, ไม่ commit)
**Prerequisites (ขาดข้อใด = เขียน `BLOCKED(operator:sk_test key + stripe CLI)` ลง stripe-rail/BLOCKED.md แล้วข้าม — เส้นหลักไม่ล้มเพราะ task นี้):** ① `STRIPE_SECRET_KEY` (sk_test เท่านั้น) ใน .env — เช็คแบบไม่พิมพ์ค่า: `if ((Get-Content .env | Select-String '^STRIPE_SECRET_KEY=sk_test_').Count -ge 1) {'OK'} else {'STOP'}` — เจอ sk_live = หยุดทั้งเฟส รายงานทันที (G-4) ② `stripe version` ใช้ได้

- [ ] **17.1** เปิดทาง env (compose backend เป็น closed list — docker-compose.yml:46-56): เขียน `docker-compose.phase0.yml`:
```yaml
services:
  backend:
    environment:
      STRIPE_CHECKOUT_ENABLED: "true"
      STRIPE_SECRET_KEY: ${STRIPE_SECRET_KEY:?required}
      STRIPE_WEBHOOK_SECRET: ${STRIPE_WEBHOOK_SECRET:?required}
```
- [ ] **17.2** `stripe listen --forward-to localhost:8080/api/webhooks/stripe` (ปล่อยรันค้าง) → เอา `whsec_...` ที่พิมพ์ออกมาใส่ .env → `docker compose -f docker-compose.yml -f docker-compose.phase0.yml up -d backend` → `bash scripts/probes/stripe-keys-ready.sh` → PASS (นิยาม "test mode มีชีวิต" ของ repo เอง) เก็บ output
- [ ] **17.3** farmer#5 (FARMER_ST_ID) → เดินถึง PENDING_DOC_FEE (ซ้ำ Task 3-4)
- [ ] **17.4** จุดจริงบน UI: เปิด `/health/payments/checkout?app=<FARMER_ST_APP>&milestone=M1` — **คาดตามโค้ด: FE flag `NEXT_PUBLIC_CHECKOUT_UI_ENABLED` ไม่ได้ build เข้า image → notFound()** (`checkout/page.tsx:33-36`) → screenshot = **FINDING F-ST1: เกษตรกรเริ่มจ่าย Stripe จาก UI ไม่ได้ใน build ปัจจุบัน** · ถ้าหน้าเปิดได้: กด 'เริ่มขั้นตอนชำระเงิน' แล้วบันทึกว่าจบแค่ breakdown ไม่มีตัวจ่าย (ไม่มี Payment Element — F-ST2)
- [ ] **17.5** สร้าง checkout ทาง API (ทางที่เหลือ): `POST /api/payments/checkout {"applicationId":"<FARMER_ST_APP>","milestone":"M1"}` (Bearer farmer#5) → เก็บ `checkoutOrderId`, `paymentIntentId`, breakdown → dump `checkout_orders` (PENDING_PAYMENT) — ยอดต้องเท่ากับสมการเงิน (`stripe-checkout-service.js:270-276`)
- [ ] **17.6** ดัน PromptPay test ให้สำเร็จ — ตามลำดับ ลองแล้วบันทึกทุกทาง: ① `stripe payment_methods create --type=promptpay` → `stripe payment_intents confirm <pi> --payment-method=<pm>` → ถ้าได้ next_action ให้เปิด `hosted_instructions_url` ในเบราว์เซอร์ (test mode มีปุ่ม simulate ให้กด = view evidence ชั้นดี — screenshot) ② confirm ไม่ผ่าน/ไม่มีปุ่ม = บันทึกอาการเป๊ะๆ + `BLOCKED(operator:promptpay-test-mode-flow)` — **ห้าม** ใช้ `stripe trigger payment_intent.succeeded` มาหลอก settle (PI ไม่ตรง order — settlement หา order จาก PI id) แต่ยิงได้ 1 ครั้งเพื่อบันทึก negative ว่าระบบไม่ settle มั่ว (`checkout-settlement-service.js:95-125`)
- [ ] **17.7** ถ้า ①สำเร็จ: webhook วิ่งผ่าน stripe listen → เกณฑ์: `checkout_orders` → SETTLED + `stripe_webhook_events` มี event + application → DOC_FEE_PAID (actor stripe-webhook/SYSTEM) + `invoices` paid — dump ครบ + จอ farmer เปลี่ยน → screenshot
- [ ] **17.8** ปิดท้ายด้วย probe เงินบน DB จริง (ครั้งแรกของ repo): `$env:DATABASE_URL='postgresql://gacp:<DB_PASSWORD จาก .env>@127.0.0.1:5432/gacp_db'; bash scripts/probes/money-equation.sh` → คาด PASS '0 rows violate' → เก็บ output ลง stripe-rail/ (อย่าให้ URL มีรหัสหลุดลง evidence — บันทึกแค่ผล)
- [ ] **17.9** (ทำเมื่อ 17.7 สำเร็จเท่านั้น) M2 ซ้ำแบบเดียวกันหลังพาใบถึง PENDING_AUDIT_FEE — ไม่บังคับ ถ้าข้ามให้เขียนเหตุ

### Task 18 (เสริม — ไม่กระทบ verdict): ปลดล็อก 126 เทสที่ skip เพราะไม่มี DB

**Files:** Create `evidence/phase0/db-suite/jest-integration.txt`
(หมายเหตุ scope: operator ไม่ได้สั่งข้อนี้ตรงๆ — ใส่เพราะปิด audit gap "ไม่เคยรันบน Postgres จริง" ด้วยต้นทุนต่ำเมื่อสแตกขึ้นแล้ว — ตัดได้ตอนรีวิวแผน)

- [ ] **18.1** `cd apps/backend; pnpm install; npx prisma generate` (host) แล้ว:
```powershell
$env:DATABASE_URL='postgresql://gacp:<DB_PASSWORD>@127.0.0.1:5432/gacp_db'; $env:NODE_OPTIONS='--max-old-space-size=3072'
npx jest --config jest.config.cjs __tests__/integration --forceExit 2>&1 | Tee-Object ../../evidence/phase0/db-suite/jest-integration.txt
```
   (กลไก skip: `HAS_DB ? describe : describe.skip` — เช่น m2a-requirement-seed.test.js:23-24 · maxWorkers:1 อยู่แล้ว) → บันทึกตัวเลข pass/fail/skip ตามจริง — **เทสแดง = บันทึก ไม่ซ่อม** · pnpm install บน host ล้ม = BLOCKED บันทึกไว้ ไม่บล็อกเฟส

### Task 19: ปิดงาน — INDEX + FINDINGS + report + gate + ส่งตรวจ

- [ ] **19.1** `evidence/phase0/INDEX.md` แบบ `evidence/M2a/INDEX.md`: H1 (work item + branch + SHA + วันที่) · ตาราง |ไฟล์|คืออะไร|ผล| ครบทุก artifact · ตาราง C01-C15 พร้อมผล 3/3 รายตัว · หัวข้อ **"สถานะที่ห้ามเคลม"** (เช่น ทุกอย่างที่ BLOCKED, สิ่งที่พิสูจน์แค่ API ไม่ใช่ UI) · บันทึกเนื้อหา docker-compose.phase0.yml + รายชื่อ env ที่เติม (ชื่ออย่างเดียว)
- [ ] **19.2** `FINDINGS.md`: F-A, F-B, F-C, F-UI-CERT, F-ST1/F-ST2 + ทุก deviation — ต่อ finding: อาการ / artifact paths / file:line / ข้อเสนอใบซ่อม 1 บรรทัด (ห้ามเดา root cause ที่ไม่มี log รองรับ)
- [ ] **19.3** report ≤40 บรรทัดที่ `reports/phase0/2026-08-15-phase0-flow-proof.md` ตาม CLAUDE.md §6 (Status ใช้ vocab §2 เท่านั้น · Evidence ชี้ INDEX)
- [ ] **19.4** gate: `bash scripts/ci/local-gate.sh 2>&1 | Tee-Object evidence/phase0/00-stack/local-gate.txt` — เทียบกับ baseline ของ main (memory: main เองแดงอยู่บางตัว เช่น deploy-drift) — เกณฑ์: **ไม่มี failure ใหม่ที่เกิดจากงานนี้**
- [ ] **19.5** commit evidence ทั้งหมดบน branch `evidence/phase0-flow-proof` (แตกจาก SHA_UNDER_TEST) → `bash scripts/probes/tier-check.sh` เก็บ output (คาด TIER=C จากชื่อไฟล์เงิน — ตามกติกา path เงิน = operator merge อยู่แล้ว) → ห้าม push ขึ้น main เอง — ส่งบรรทัด merge ให้ operator: `! git push origin evidence/phase0-flow-proof:main && git fetch origin main:main`
- [ ] **19.6** ประกาศ verdict PASS/FAIL ตาม §IV + ถ้า FAIL: บังคับใช้ §V (เสนอ HARNESS_LOG append + รายการใบซ่อม) → จบงาน implementer → operator เปิด **auditor ตัวใหม่ context ว่าง** รับแค่ (แผนนี้ + diff + evidence/phase0) — ห้ามรับคำอธิบายนอกไฟล์

---

## Amendment A — รันบน QA stack ผ่าน SSH (2026-08-15 บ่าย, operator สั่ง + เคาะ)

**ทำไมแก้:** เครื่อง operator ไม่มี Docker Desktop · operator สั่งใช้ Docker/DB บนเซิร์ฟเวอร์ · เคาะ (AskUserQuestion): **สแตก = `docker-compose.qa.yml` แยกก้อน** (postgres-qa `gacp_qa`/`gacp_qa_db`:5433, redis-qa:6380, backend-qa:5001, frontend-qa:3001, nginx-qa:8080 — ทั้งหมด bind `127.0.0.1` บนเซิร์ฟเวอร์, volume แยก `qa_postgres_data`) · **การเข้าถึง = SSH จากเครื่องนี้** ไป `root@43.134.175.51`

**⚠️ ความเสี่ยงที่ต้องรู้ (บันทึกไว้เป็นกติกา):** `43.134.175.51` คือ**โฮสต์เดียวกับ production** (deploy-targets.txt: gacp-frontend/gacp-backend prod รันอยู่ที่นี่) — QA stack แยก container/volume/port/db จริง แต่**แชร์ host + docker daemon + ดิสก์** กับ production ดังนั้น:
- **A-LAW-1** ทุกคำสั่ง compose ต้องมี `-f docker-compose.qa.yml` และ project name `gacp-qa` เท่านั้น — ห้ามรัน compose ไม่ระบุไฟล์ (จะไปโดน stack อื่นบนโฮสต์) · ห้าม `docker system prune`, ห้าม `docker compose down -v` ที่ไม่ใช่ project `gacp-qa`, ห้ามแตะ container/volume ชื่อ `gacp-*` ที่ไม่ขึ้นต้น `gacp-qa`
- **A-LAW-2** Seam B `REVOKE INSERT` ทำบน user `gacp_qa` ใน db `gacp_qa_db` เท่านั้น (D-P2 ยังใช้ได้เพราะ QA db แยกจริง) — ตรวจ `SELECT current_database(), current_user;` ต้องได้ `gacp_qa_db / gacp_qa` ก่อน REVOKE ทุกครั้ง ไม่ตรง = หยุด
- **A-LAW-3** ทุกคำสั่ง destructive บนเซิร์ฟเวอร์ (up/down/exec/REVOKE) = **เสนอให้ operator เห็นก่อนรัน** (งานนี้แตะโฮสต์ production ตาม CLAUDE.md §8 "ต้องแตะ server จริง") — infra-devops agent เสนอคำสั่ง operator รัน หรือ operator อนุมัติ SSH allowlist ให้ agent รันเองในขอบ `gacp-qa`

**การเข้าถึง (ยังไม่ปลดล็อก — ดู BLOCKED ท้าย):** SSH allow rule ต้องอยู่ใน `.claude/settings.local.json` — **agent เพิ่มเองไม่ได้ (classifier บล็อก การ self-grant SSH ไปโฮสต์ production คือ boundary ที่ถูกต้อง)** operator เพิ่มเอง (บรรทัดใน BLOCKED)

### A.0 Discovery ก่อน (คำสั่งแรกที่รันได้เมื่อ SSH ปลดล็อก — เก็บลง evidence/phase0/00-stack/server-discovery.txt)
- `ssh root@43.134.175.51 "hostname; docker --version; docker compose version; node --version 2>/dev/null || echo NO_NODE"`
- หา repo บนเซิร์ฟเวอร์: `ssh root@43.134.175.51 "ls -d ~/GACP* /opt/gacp* /srv/gacp* 2>/dev/null; docker inspect gacp-backend --format '{{range .Mounts}}{{.Source}}{{\"\\n\"}}{{end}}' 2>/dev/null"` → ได้ path repo (`REPO_SRV`)
- `ssh root@43.134.175.51 "cd <REPO_SRV> && git fetch && git log -1 --oneline && git status --short"` → ยืนยันสาขา/สะอาด
- **เกณฑ์:** ได้ docker+compose, ได้ `REPO_SRV`, repo ดึง SHA_UNDER_TEST ได้ — ขาดข้อไหน = BLOCKED(operator:<สิ่งที่ขาดบนเซิร์ฟเวอร์>)

### A.1 แทน Task 1 (ยกสแตก) — บนเซิร์ฟเวอร์
- `ssh root@43.134.175.51 "cd <REPO_SRV> && git checkout <SHA_UNDER_TEST>"` (หรือ fetch+checkout branch) — **A-LAW-1 ทุกคำสั่งต่อจากนี้ระบุ `-f docker-compose.qa.yml`**
- up: `ssh root@43.134.175.51 "cd <REPO_SRV> && docker compose -f docker-compose.qa.yml up -d"` (qa backend/frontend รัน `npm install && prisma generate && npm run dev` ในตัว — compose.qa:63,92) → รอ healthy: `docker compose -f docker-compose.qa.yml ps`
- migrate: `ssh root@43.134.175.51 "cd <REPO_SRV> && docker compose -f docker-compose.qa.yml exec -T backend-qa npx prisma migrate deploy"` → verify `_prisma_migrations` (query ผ่าน exec postgres-qa `psql -U gacp_qa -d gacp_qa_db`)
- seed 2 ชั้น: `exec -T backend-qa npx prisma db seed` + `exec -T backend-qa node prisma/seed-all.js`
- health: `ssh root@43.134.175.51 "curl -s http://127.0.0.1:8080/api/health"` (nginx-qa:8080 บนเซิร์ฟเวอร์)
- เกณฑ์สำเร็จ 6 ข้อเดิม (Task 1.11) คงทั้งหมด — แค่ปลายทางเป็น QA บนเซิร์ฟเวอร์

### A.2 Playwright + psql dump — ผ่าน SSH tunnel (ให้ video/trace/screenshot ลงเครื่องนี้)
QA ports bind `127.0.0.1` บนเซิร์ฟเวอร์ → เปิด tunnel จากเครื่องนี้ (คำสั่งค้างไว้ 1 หน้าต่าง):
```
ssh -N -L 8080:127.0.0.1:8080 -L 5433:127.0.0.1:5433 root@43.134.175.51
```
- Playwright: `E2E_BASE_URL=http://localhost:8080` (ผ่าน tunnel → nginx-qa) — config `playwright.phase0.config.ts` เดิม, artifact ลงเครื่องนี้ที่ `evidence/phase0/` ตามเดิม
- helper `psql()`: **แทน `docker compose exec`** ด้วย psql ผ่าน tunnel — `helpers.ts` เพิ่มโหมด server: ถ้า `PHASE0_DB_MODE=tunnel` ให้ยิง `psql "postgresql://gacp_qa:qa_password_123@localhost:5433/gacp_qa_db" -c ...` (ต้องมี psql client บนเครื่องนี้ — ไม่มี = ยิงผ่าน `ssh root@43.134.175.51 "docker compose -f docker-compose.qa.yml exec -T postgres-qa psql -U gacp_qa -d gacp_qa_db -c '...'"`) · allowlist ตาราง + SELECT-only เดิมคงไว้
- **หมายเหตุ creds:** `qa_password_123` เป็นรหัส QA ที่ commit อยู่ใน compose.qa แล้ว (ไม่ใช่ secret production) — อ้าง `docker-compose.qa.yml:13` ได้ ไม่ผิด L2

### A.3 แทน Task 16 (Seam B) — REVOKE บน gacp_qa เท่านั้น (A-LAW-2)
- guard ก่อน: `... exec -T postgres-qa psql -U gacp_qa -d gacp_qa_db -c "SELECT current_database(), current_user;"` ต้อง = `gacp_qa_db / gacp_qa`
- `REVOKE INSERT ON TABLE quotations FROM gacp_qa;` … restore `GRANT INSERT ON TABLE quotations TO gacp_qa;` (แทน user `gacp` เดิม)

### A.4 แทน Task 17 (Stripe rail) — webhook ผ่าน tunnel
- backend-qa ไม่มี Stripe env (compose.qa:45-56) → เพิ่มผ่าน override บนเซิร์ฟเวอร์ `docker-compose.qa.phase0.yml` (STRIPE_CHECKOUT_ENABLED/STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET) — ไฟล์ไม่ commit, วางบนเซิร์ฟเวอร์
- `stripe listen --forward-to http://127.0.0.1:8080/api/webhooks/stripe` รัน**บนเซิร์ฟเวอร์** (ผ่าน ssh) หรือรันบนเครื่องนี้ forward เข้า tunnel — เลือกทางที่ artifact เก็บได้ครบ · sk_test เท่านั้น (เจอ sk_live = หยุด G-4)

### BLOCKED — operator ต้องปลดก่อน implementer เดิน A.0
1. **SSH allowlist** — เพิ่ม 2 บรรทัดใน `.claude/settings.local.json` → `permissions.allow`:
   `"Bash(ssh *root@43.134.175.51*)"` , `"Bash(scp *root@43.134.175.51*)"` (agent เพิ่มเองไม่ได้ — classifier บล็อกถูกต้อง)
2. **ยืนยันความเสี่ยงโฮสต์ production** — operator รับทราบ A-LAW-1/2/3 ว่า QA stack จะรันบนโฮสต์เดียวกับ production (แยก container/db แต่แชร์ host)

---

## Amendment B — topology จริงที่รันได้ (2026-08-16) — **แทนที่ Amendment A ทั้งหมด**

Amendment A (SSH/QA บน droplet) **ถูกยกเลิก** — `43.134.175.51` เป็นโฮสต์ prod+staging ที่แชร์ postgres เดียวกัน (แตะไม่ได้) และ laptop รัน Docker ไม่ไหว จึงลงเอยที่ **laptop รัน node ตรง + Supabase เป็น DB** — พิสูจน์แล้วด้วย login-smoke ผ่าน browser จริง (1 passed 27.7s: เกษตรกร seed → /health + dump users=8 จาก Supabase)

**Topology (ยืนยันทุกชั้น):**
- **DB** = Supabase Postgres (project `<retired-project>`, Session pooler `aws-1-ap-southeast-2.pooler.supabase.com:5432`). `DATABASE_URL` อยู่ใน root `.env` (gitignored). Migrations 118 + `prisma db seed` + `seed-all.js` ลงครบ. **Redis ไม่ต้องมี** (graceful degradation).
- **Backend** :8000 = `cd apps/backend && DATABASE_URL=<.env> ENCRYPTION_KEY=<.env,32ch> NODE_ENV=development PORT=8000 node server.js` → `/api/health/ready`=READY. **ENCRYPTION_KEY ต้องเซ็ต** (32 ตัว) ไม่งั้น ready ค้าง 503.
- **Frontend** :3000 = `cd apps/web-app && BACKEND_URL=http://localhost:8000 INTERNAL_API_URL=http://localhost:8000 npx next dev -p 3000` (same-origin `/api` proxy → :8000). **ต้อง `next dev` ห้าม `next start`** — `output:standalone` ใน next.config สร้าง symlink ที่ Windows ห้าม (EPERM). Playwright `navigationTimeout=200s` รองรับ compile ต่อ route ครั้งแรก.
- **Playwright** = `E2E_BASE_URL=http://localhost:3000 PHASE0_SEED_PW_APPLICANT=... PHASE0_SEED_PW_OFFICER=... PHASE0_SEED_PW_ADMIN=... npx playwright test --config=playwright.phase0.config.ts <spec>`.
- **DB dump** = `helpers.ts psql()` รื้อแล้ว → node+prisma จาก apps/backend (ไม่มี psql client). output เป็น **JSON array ของ row** (แทน psql -x). `dump()`/`auditDump()` ใช้ได้เหมือนเดิม.

**Seed creds (ผ่าน env — จาก `apps/backend/prisma/seed-gacp.js:38-42`, ห้าม commit):** applicant `1100100100012`/`1100200200022` = `PHASE0_SEED_PW_APPLICANT` · reviewer `1111111111111`, auditor `2222222222222`, auditor2 `2222222222223`, scheduler `3333333333333`, account `4444444444444` = `PHASE0_SEED_PW_OFFICER` · admin `9876543210987` = `PHASE0_SEED_PW_ADMIN`.

**สแตกที่รันค้างอยู่ (session นี้):** backend task `bu4377byd` (:8000), frontend `bgwupsmbf` (:3000 next dev) — **ใช้ต่อ ห้าม relaunch เว้นแต่ตาย** (เช็ค `curl :8000/api/health/ready` + `curl :3000/auth`).

**เดลต้าต่อ Task 1/3-17:**
- Task 1 (docker stack) **ถูกแทน** ด้วย bring-up ข้างบน (ทำเสร็จแล้ว session นี้)
- ทุกที่ที่ Task เขียน "docker compose exec psql" → ใช้ `helpers.dump/auditDump` (node+prisma แล้ว)
- **Seam B (Task 16) คำเตือน:** REVOKE INSERT อาจ**ไม่ได้ผล**บน Supabase เพราะ role `postgres` เป็น**เจ้าของตาราง** (owner bypass privilege checks). implementer ต้องหา fault-injection ที่ได้ผลจริง (เช่น `ALTER TABLE quotations RENAME TO quotations_bak` ชั่วคราวแล้ว restore, หรือ trigger ที่ RAISE) ผ่าน node+prisma `$executeRawUnsafe` — หรือถ้าทำไม่ได้บน Supabase pooler = เขียน `BLOCKED` พร้อมเหตุ · ห้ามแตะ prod
- Stripe rail (Task 17): เติม `STRIPE_*` env ตอน launch backend + `stripe listen --forward-to http://localhost:8000/api/webhooks/stripe` · sk_test เท่านั้น

---

## Amendment C — ERP verification + ป้ายซื่อสัตย์ (2026-08-16, operator เคาะหลัง grill)

grill พบ: method เดิมพิสูจน์ **traversability** (flow เดินได้) แต่ (a) **ERP-incomplete** — ดู status ไม่ดูบัญชี, (b) ป้าย infra/scope ไม่ตรง · operator เคาะ: รับ dev/Supabase เป็น **proof ระดับ 1** + **เติม ERP assertion ก่อนเดินต่อ** + ติดป้ายทุกอย่างซื่อสัตย์

### C-1. ERP checkpoint (บังคับเพิ่มเข้า §II ทุก payment settle hop: C04 DOC_FEE_PAID, C10 AUDIT_FEE_PAID, C14/C17 Stripe SETTLED)
แอปสร้าง journal + receipt จริงบน slip approve (`payment-slip-service.js:1199,1309`, fail-closed ผูก invoice-paid) **แต่มี edge documented ที่ journal อาจหาย** (`:1192`) → ทุก payment hop ต้อง **verify ไม่ใช่ assume** · นอกจาก 3/3 เดิม เรียก **`dumpErp(seg,cp,appId)`** (helpers.ts — เขียน+ทดสอบคอลัมน์กับ live DB แล้ว 2026-08-16) เก็บ + assert:
- **Journal balance**: มี `journal_entries` สำหรับ invoice ที่จ่าย (link `reference`=invoiceNumber) · `totalDebit==totalCredit` · `SUM(journal_lines.debit)==SUM(credit)==totalDebit`
- **Money equation** (`checkout_orders`, เส้น Stripe): `total_payable_amount==dtam_fee_amount+platform_fee_net+platform_fee_vat` และ `platform_fee_gross==platform_fee_net+platform_fee_vat`
- **Receipt + 2-entity**: `invoices.receiptNumber` ออก + `receiptStatus` · issuer split ใน `journal_lines.issuer` (DTAM ไม่มี VAT vs PLATFORM มี `taxableAmount`)
- **SETTLED provenance** (Stripe): มี `stripe_webhook_events` row คู่กับ SETTLED
- **เกณฑ์:** journal หาย / unbalanced / equation ผิด / ไม่มี receipt = **payment checkpoint FAIL** (= ERP leak ที่ Phase 0 ต้องจับ, ผูก L3/G1) — ไม่ใช่แค่บันทึกเฉยๆ

### C-2. ป้าย environment (บังคับใน INDEX หัวข้อ "สถานะที่ห้ามเคลม")
"**proof ระดับ 1** = dev-mode functional บน real Postgres (Supabase ap-southeast-2), **ไม่มี Redis** (rate-limit/queue/cache ถูกข้าม), dev-fallback secrets, **ไม่ใช่ instance prod/staging** · **ห้ามเคลม 'พิสูจน์บน production infra'** · ระดับ 2 (staging จริง) = เฟสแยกภายหลัง"

### C-3. ป้าย API-draft (C01 — Option 1 ที่ operator เลือก)
C01 = "front-door มีบั๊ก **blocking**: F-AUTOSAVE (wizard autosave ไม่ยิง) + wizard step 5-9 ซับซ้อน → draft เติมครบผ่าน endpoint จริง **`POST /api/applications/draft`** (ไม่ใช่ /api/e2e backdoor) เพื่อปลด C02-C15" · **ห้ามเคลม "ประตูหน้าเกษตรกรผ่าน UI ครบ"** — เกษตรกรจริงทำ wizard ไม่จบ (F-AUTOSAVE + F-REG-DUP = finding ค้าง รอใบซ่อม)

### C-4. ป้าย scope (ทั้งแผน)
Phase 0 = **code-traversability proof** (state machine ของโค้ดเดินครบบน real Postgres) · **ไม่ใช่ standard-conformance** (โค้ดถูกตาม GACP จริงไหม เช่น ruling D2 cert-mint-point AUDIT_PASSED vs CERTIFIED) = การตรวจแยก (skill gacp-standards-requirements) — จำเป็นแต่ไม่พอ

---

## Amendment D — payment rail = Stripe gateway (ไม่ใช่ slip) (2026-08-16, operator แก้ D-P1)

operator: โปรเจกต์เปลี่ยนมาใช้ **payment gateway (Stripe)** แล้ว — **slip = legacy กำลัง drain ห้ามใช้พิสูจน์** · โค้ดยืนยัน: `PAYMENT_ADAPTER` default=`stripe` (config/stripe.js:68), `.env.example:180` slip = "legacy slip surface / drain-then-purge" · commit `ad86ddf2` "Wave 2 Stripe checkout engine + verified webhook + atomic settle"

**D-P1 (เดิม slip rail) → ยกเลิก · D-P1' = Stripe gateway ด้วย sk_test จริง + CLI** [operator เคาะ 2026-08-16]

### FINDING ใหญ่ (บันทึกเด่นใน FINDINGS.md): **F-GATEWAY-UI**
`apps/web-app/src/app/health/payments/checkout/client-view.tsx:182-244` — สร้าง checkout order ได้ **แต่ไม่มีขั้นตอนจ่ายเงินใน UI**: ไม่มี Payment Element / PromptPay QR / redirect / ปุ่มจ่าย · state "created" จบที่ "รอชำระเงิน" + ปุ่มกลับ (บรรทัด 236 เขียนเองว่า "ยังไม่ถูกเก็บเงินจนกว่าจะทำขั้นตอนถัดไป" — **แต่ขั้นตอนถัดไปไม่มีในโค้ด**) → **เกษตรกรกดจ่ายผ่าน gateway UI ไม่ได้จริง** settle ต้องยิง webhook นอก UI · **นี่คือ Phase 0 finding ระดับประตูจ่ายเงินหลักยังต่อไม่ครบ**

### Payment checkpoints (แทน slip C03-C04 / C09-C10):
- **setup**: `STRIPE_CHECKOUT_ENABLED=true`, `STRIPE_SECRET_KEY=sk_test…` (จาก .env), `STRIPE_WEBHOOK_SECRET` (จาก stripe listen), `PAYMENT_ADAPTER=stripe`, backend restart · frontend restart ด้วย `NEXT_PUBLIC_CHECKOUT_UI_ENABLED=true` · `stripe listen --api-key sk_test… --forward-to http://localhost:8000/api/webhooks/stripe` (ให้ whsec_)
- **C03** (สร้างรายการ): farmer เปิด `/health/payments/checkout?app=<APP>&milestone=M1` → กด "เริ่มขั้นตอนชำระเงิน" → `POST /api/payments/checkout` สร้าง `checkout_orders` PENDING_PAYMENT + PaymentIntent (PromptPay) · dump checkout_orders + screen · **บันทึก F-GATEWAY-UI: จบแค่ "รอชำระเงิน" ไม่มีปุ่มจ่าย**
- **C04** (settle จริง): confirm PaymentIntent (PromptPay **test mode** ผ่าน stripe CLI/API) → webhook `payment_intent.succeeded` ยิงเข้า `/api/webhooks/stripe` → `checkout-settlement-service` → SETTLED + DOC_FEE_PAID + journal + 2 checkout_documents · **`dumpErp('s02','C04',APP)` = ERP verify เต็ม**: money equation (`checkout_orders` เติมเต็ม) + journal balance + receipt + **SETTLED provenance** (`stripe_webhook_events` row มีจริง) · เกณฑ์ ERP ตาม Amendment C-1
- **C09-C10** (งวด 2, M2): ซ้ำแบบเดียวกัน
- **PromptPay test-confirm**: อาจมี complexity (test mode async — PI ไป requires_action) จัดการตอน execution · **ห้ามใช้ `stripe trigger payment_intent.succeeded`** มา fake settle (PI ไม่ตรง order — settlement หา order จาก PI id) · ทำ test-confirm ไม่ได้ = บันทึก `BLOCKED(operator:promptpay-test-confirm)` พร้อมเหตุ ไม่เคลมเกิน

---

## Amendment A (2026-08-15) — server-mode: QA stack บน 43.134.175.51 ผ่าน SSH

Operator สั่ง "Docker หรือ Database ให้ใช้บนเซิร์ฟเวอร์" + เคาะ 2 ข้อ (AskUserQuestion 2026-08-15): ① สแตก = `docker-compose.qa.yml` แยกก้อน ② agent ใช้ SSH จากเครื่องนี้ · เหตุที่ไม่ใช้ staging: postgres ของ staging เป็น**คอนเทนเนอร์เดียวกับ production** (docker-compose.staging.yml:8-11) — migrate/seed/REVOKE บนนั้นต้องห้าม

**D-P5 (แทน D-P3 เฉพาะเรื่องสถานที่รัน):** สแตก = compose project `gacp-qa` (docker-compose.qa.yml — postgres-qa `gacp_qa/gacp_qa_db` :5433, redis-qa :6380, backend-qa :5001 mount source + `npm install && npx prisma generate && npm run dev`, frontend-qa :3001, nginx-qa :8080 — ทุกพอร์ตผูก 127.0.0.1 ฝั่ง server) · SHA under test เดิม (checkout บน server ให้ตรง VARS)

**ขอบเขตเหล็กฝั่งเซิร์ฟเวอร์ (เพิ่มใน G-5):** แตะได้เฉพาะ ① repo checkout ของ mission ② container/volume/network ตระกูล `gacp-qa-*` ③ ไฟล์ runtime ใหม่ `$REPO/docker-compose.phase0.yml` + `$REPO/.env.phase0` (uncommitted) — **ห้ามออกคำสั่งใดๆ ใส่ compose/container ของ production/staging เด็ดขาด แม้ read-only restart** · ทุกคำสั่ง ssh บันทึกบรรทัดคำสั่ง (ไม่ใส่ secret) ลง `evidence/phase0/00-stack/ssh-log.txt`

**A-0 (แทน Task 0.2 ข้อ docker):** `ssh -o BatchMode=yes root@43.134.175.51 "echo SSH_OK; docker --version; docker compose version"` → ไม่ผ่าน = BLOCKED(operator:สิทธิ์ ssh/key) · Docker Desktop local: ไม่ต้องใช้แล้ว

**A-T (tunnel — เปิดค้างตลอด mission, run_in_background):**
```powershell
ssh -N -L 8080:127.0.0.1:8080 -L 3001:127.0.0.1:3001 -L 5001:127.0.0.1:5001 -L 5433:127.0.0.1:5433 root@43.134.175.51
```
พอร์ต local ต้อง**ตรงเลขเป๊ะ** เพราะ browser bundle ฝัง `NEXT_PUBLIC_API_URL=http://localhost:5001` (docker-compose.qa.yml:84) · Playwright: `E2E_BASE_URL=http://localhost:8080`

**A-1 (แทน Task 1.1-1.11):**
- [ ] A-1.1 recon: `ssh ... "docker ps --format '{{.Names}}\t{{.Ports}}'; ss -ltnp | grep -E ':(8080|5433|5001|3001|6380)\b' || true"` — พอร์ต server ตัวไหนถูกใช้อยู่: สร้าง override ฝั่ง server เปลี่ยนเฉพาะเลขพอร์ต host-side ของ gacp-qa แ
