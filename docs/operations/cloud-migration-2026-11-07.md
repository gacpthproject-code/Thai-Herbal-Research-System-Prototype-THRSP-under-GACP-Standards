# ย้ายงานมา Claude Code cloud — สำรวจสถานะ 2026-11-07

> ที่มา: operator 2026-11-07 สั่งย้ายงานมาทำบน cloud session ให้วิจัยงานค้าง/กำลังทำ/ถัดไป อ่าน CLAUDE.md HARNESS และเอกสาร
> ตรวจระบบ/ไฟล์ที่ไม่ใช้ และนำสกิล/ปลั๊กอินที่จำเป็นมาด้วย · ฐาน: main `4364b408` · ทุกข้อมีอ้างอิง ไม่มีการลบไฟล์ใดในรอบนี้

## 1. สิ่งที่หายไปตอนย้ายเครื่อง (ไม่อยู่ใน repo)
| ของ | ใช้ทำอะไร | สถานะบน cloud |
|---|---|---|
| `~/.claude/orchestrate/gacp/` (`preferences.md` = คำสั่งถาวร "คำสั่ง NN", `units.tsv`, `gates.md`, `status.md`) | บัญชีงาน orch + คำสั่งถาวร | **หาย — สำคัญที่สุด** ต้องให้ operator คัดลอกมา |
| `~/work/state/heavy.sh` | ล็อกงานหนักทีละงาน (fd 9, `GACP_HEAVY_HELD`) | ไม่มี source ใน repo · ใน container เดียวแทนด้วย `flock` ได้ |
| `~/work/state/gate/{gate-locked,run-gate,compare}.sh`, `evidence-pack.py`, `main-baseline` | รัน gate, เทียบ "ไม่มีความล้มเหลวใหม่", สร้าง evidence pack | ไม่มี — แกนคือ `scripts/ci/full-gate.sh` · compare/evidence-pack ต้องเขียนใหม่ |
| `~/work/state/reviews/` | brief + รายงานผู้ตรวจอิสระ | ไม่มี · attestation ของ gate หลัง 10-28 (110d5ed96, e3991ee93, 6939f1d29) ไม่อยู่ใน `evidence/gate/` |
| auto-memory ~15 คีย์ (เช่น `no-ci-by-operator-decision`, `local-full-suite-needs-3gb-heap`) | ความรู้สะสม | ไม่มี · ควร export เป็นเอกสาร |
| plugin `pstack@pstack-claude` (poteto-mode/poteto-agent/orch) | วิธีทำงานหลัก (HARNESS.md §1) | **ประกาศใน `.claude/settings.json` แล้ว** ติดตั้งอัตโนมัติ session ถัดไป |
| plugin `ponytail` | operator ขอให้นำมาด้วย | ประกาศใน `.claude/settings.json` แล้ว · กติกา CLAUDE.md ชนะเมื่อขัดกัน (เช่น คอมเมนต์ `shortcut:` vs สกิล `no-comments`) |

## 2. เครื่องมือมองเห็นและกดจริง (เพิ่มใน `.mcp.json`)
- `computer` = `cu-desktop mcp` เดสก์ท็อป Linux ของ container: เปิด Chrome จริง คลิก พิมพ์ ภาพหน้าจอ อัดวิดีโอ (`cu-desktop record`) — พิสูจน์แล้ว: อัด demo.gacpth.com 16 วินาที ดึงเฟรมด้วย ffmpeg แล้วเปิดดูได้
- `playwright` = `@playwright/mcp@0.0.84` (ปักรุ่น) ใช้ Chromium ที่ติดตั้งไว้ `/opt/pw-browsers` กดตาม DOM, ภาพเก็บที่ `evidence/_mcp-scratch/` (ignored)
- Playwright library + ffmpeg มีในเครื่องอยู่แล้ว ใช้กับชุด e2e เดิม (`apps/web-app/e2e-g4`) ได้
- ควบคุมเครื่องของ operator: ต้องเปิด Remote Control/Computer use ในแอป Claude desktop บนเครื่องนั้น (ตอนนี้ `list_computer_folders` ว่าง)

## 3. ความพร้อมรัน gate บน cloud
| ต้องการ | ตอนนี้ |
|---|---|
| Node 24 (`package.json` engines, `.nvmrc`) | 22 — ต้องติดตั้ง |
| `pnpm install` | ยังไม่ติดตั้ง |
| Postgres server (`GATE_PG_ADMIN_URL`) | มีแต่ client |
| gitleaks (`secret-scan-deep` บังคับ) | ไม่มี |
| git ประวัติเต็ม (tier-check, gate-attestation) | shallow — ต้อง `git fetch --unshallow` |
| probe `deploy-drift` ต้องถึง staging | staging ปิดแล้ว → probe จะแดงจนกว่าจะชี้ใหม่ |
| ทรัพยากร | 4 core / 15 GB (เท่าเครื่อง staging เดิม 4 core / 14 GB, gate ~4.2 GB) — พอ |

## 4. สถานะงาน (สร้างจาก git + เอกสาร เพราะบัญชี orch หาย)
**เสร็จล่าสุด (merged main):** soil/วัสดุปลูก คำสั่ง 159 (`4364b408`) · A5 analyzer (`22ec4189`) · deploy-walk runner คำสั่ง 158(5) (`6c60ffef`) · ลิงก์เอกสารยินยอม (`4bf32086`) · A5 harness (`4f5e1b15`) · ปิดรั่วข้ามองค์กร analyze (`30627008`) · ทบทวนสกิล 72 ข้อ (`119da713`) · v3.9.0 deploy staging+demo ที่ `b8d27a69`

**กำลังทำ/ครึ่งทาง:**
- A5 = 766/884 = 86.65% เป้า 95% · ชุดคำตอบ 2 ยังไม่วัด · ชุดคำตอบยังไม่ผ่านผู้เชี่ยวชาญ (`evidence/a5/a5-accuracy.json:6`)
- ต้นแบบตามสัญญาที่ walk รายงาน NOT-YET (`scripts/walk/rows/prototypes.js`): p1 รายงานเทียบ, p2 แบบสอบถาม+คู่มือ, p4 SRS, p5 ฐานสมุนไพร 97/1,869, p6 ชุดภาพมีป้าย, p7 APK บนมือถือจริง · ต้นแบบ 3 และ 8 ไม่มีแถว walk
- F10 (React #418 บน staging) แยกเป็นงานต่างหาก (`evidence/walk-ccc4-display/INDEX.md:20`)
- สคริปต์ที่ merge แบบ dry-run (CAR sweep `519b289a`, renewal heal `ee5be350`, holder draft migration) — ไม่มีบันทึกใน repo ว่า apply บน staging/demo แล้ว
- งานที่ merge 11-03/11-04 ไม่มีบันทึก deploy ไป demo

**ถัดไป:**
1. วัด A5 ชุดที่ 2 + ให้ผู้เชี่ยวชาญตรวจชุดคำตอบ
2. เส้นขอใบรับรองให้จบ แล้วขอบเขต T&T/QR
3. TRL5 / UAT ยังไม่มี artifact (ล่าสุด `evidence/uat-2026-09-12`)

**รอ operator:** แพตช์ heavy.sh + deploy script (อยู่ใน `~/work/state/` หาย) · backfill `metadata.livemode=false` ก่อน live key · retention ใบแจ้งหนี้ 7/5 ปี, ข้อมูลผู้ถือใบรับรอง >5 ปี, ลบข้อมูลบุคคลอื่นในคำขอ (`BACKLOG-FOUND.md:926-947`) · deploy งานหลัง v3.9.0 · ที่ตั้ง staging ใหม่ (§6)

**เอกสารที่ค้างไม่ตรง git:** QUEUE.md (ล่าสุด 08-22) · GOALS.md (09-29 เกินรอบ 30 วัน, ยังพูดถึง CI) · GAP-MAP.md (08-04) · `evidence/a5/a5-accuracy.json` ยัง 565/884 · `prototypes.js:83` ว่ายังไม่มี answer key · `docs/governance/claude-md-ablation-2026-10-05.md:99` ชี้ไฟล์ที่ลบแล้ว

## 5. ไฟล์/ระบบที่ไม่ใช้ — ข้อเสนอ (ยังไม่ลบ · ลบจริงแยก PR ตาม tier)
| กลุ่ม | ข้อเสนอ | tier |
|---|---|---|
| `cases_22.tsv`, `results_22.*`, `testsprite.config.js`, `testsprite-full-suite.yml`, `.playwright-mcp/` (6.1M), `.agent/skills` (+ .pyc), `scripts/review/`, สคริปต์ Windows/dev ที่ไม่มีใครอ้าง | ลบ | A/B |
| `PROMPT-W2-AUTONOMOUS-FLOW.md`, `AUDIT-REPORT.md`, `SYSTEM-AUDIT-REPORT.md`, `SYSTEM-REALITY-CHECK.md`, `test-reports/`, `testsprite_tests/`, `infra/`, `tests/smoke` | ย้ายเป็นประวัติ | A/B |
| `PROMPT-PAYMENT-REWORK.md` | เก็บ — โค้ดเงินอ้าง §3.1/§3.3 · ย้ายเข้า docs พร้อมแก้ที่อ้าง | B |
| `loop.sh` + บรรทัด CODEOWNERS · `.claude/agents/*` (14) + `.claude/commands/*` 5 ตัวที่เรียก agent | เลิกใช้ (HARNESS.md:29) — ถอดหรือชี้ใหม่ไป poteto-agent | **C** |
| compose `test.local` (ไม่มีใครอ้าง), `bluegreen`, `qa`, `local-prod`, `preview` | ย้ายเป็นประวัติ · `production`/`staging`/`demo`/`yml` เก็บ | **C** |
| `.github/workflows/*` (Actions ปิดถาวร) | ย้ายเป็นประวัติ — แก้เทสต์ที่อ่าน `ci.yml` ก่อน (`flutter-ci-job.test.js:28`, `thai-copy-style-gate.test.js:227`) | **C** |
| `deploy/post-deploy.*`, `deploy/*.sql`, `scripts/fix-*.sql`, `scripts/db/*.sql`, `scripts/security/*` (AWS), `deploy-prod.*` + สคริปต์ deploy production/bluegreen/preview | ลบ/ย้าย | **C** |
| `apps/mobile-app` (พักตาม ADR-015) | operator ตัดสิน — p7 APK ยังเป็นผลงานตามสัญญา | B |
| `evidence/` 557 MB (วิดีโอ/ล็อกใหญ่) | ย้ายวิดีโอ/ล็อกออกจาก git (LFS หรือที่เก็บนอก) · `evidence/gate/` ต้องเก็บ | C |
- เส้นทาง API กำพร้า: `node scripts/ci/check-orphan-api-routes.js` → `OK: no orphan route files detected`

## 6. staging ใหม่ (staging.gacpth.com ปิดแล้ว)
เครื่อง demo 119.59.105.140: AlmaLinux 8.10 · 10 vCPU · 21 GiB RAM · disk 235 GB (`docs/operations/runbooks/` demo setup §ข้อมูลเครื่อง ณ วันติดตั้ง)
เพดาน memory ต่อชุด (compose production + overlay): backend 1G, postgres 1G, frontend 512M, grafana 512M, pgadmin 512M, ที่เหลือรวม ~1.6G → **~5 GB ต่อชุดเต็ม**
- ทางเลือก ก (แนะนำ): **dev + gate บน cloud container นี้** (4 core/15 GB พอ) · **staging เป็นชุดที่สองบนเครื่อง demo** ใช้ nginx/monitoring ร่วม → แยกเฉพาะ backend/frontend/postgres/redis/minio ~3.5 GB → รวมสองชุด ~9 GB จาก 21 GB
- ทางเลือก ข: staging บน cloud container — ไม่เหมาะเป็น staging จริง เพราะ container ถูกเก็บคืนเมื่อไม่ใช้ และเปิดให้คนนอกเข้าไม่ได้
- ข้อควรระวัง: staging กับ demo ต้องแยก DB, volume, ค่าลับ, Stripe webhook secret, subdomain และ `GACP_DEPLOY_SLOT` · ต้องตรวจ RAM/disk ที่ใช้จริงตอนนี้ก่อน (`free -g`, `df -h`, `docker stats`) — ตัวเลขข้างบนเป็นของวันติดตั้ง · งานบนเครื่องนั้น = deploy ต้องใช้คำว่า "deploy" ของ operator

## 7. สถานะส่งต่อ session ใหม่ (คำสั่ง 165 · 2026-11-07)
> ตั้งบัญชีงาน orch ใหม่จากหัวข้อนี้ + §4 + คำสั่ง 163/164 (`docs/governance/standing-orders.md`)

| หน่วยงาน | กิ่ง / head | สถานะ | ขั้นถัดไป |
|---|---|---|---|
| main | `aaa6b80f6` (fast-forward 2026-11-07 ตามคำว่า merge) | gate baseline ยังไม่จบ (หยุดเพื่อย้าย session) | รัน `scripts/ops/heavy.sh timeout 7200 bash scripts/ci/full-gate.sh aaa6b80f6` จาก clone สะอาด (env จาก `bash scripts/ops/cloud-setup.sh --gate-env`) · commit attestation + `node scripts/ops/gate-compare.js --write-fails aaa6b80f6` |
| เครื่องมือ harness + กติกา (คำสั่ง 164(1)(7)) | `claude/peaceful-galileo-5uum5y` | orchestrator เขียนเอง ยังไม่ผ่านผู้ตรวจ (คำสั่ง 165 ข้อ 6) | ผู้ตรวจอิสระ → gate → evidence pack → ขอ "merge" (Tier C) · PR draft jonmaxmore/gacp-certification-application#861 |
| ชุด staging บนเซิร์ฟเวอร์ demo (164(3)) | กิ่งเดียวกัน (`affc9ed79`…`2bf182165`) | ผู้ตรวจ sonnet APPROVE 2 รอบ · เทสต์ overlay 80/80 | gate → evidence pack → "merge" → "deploy" |
| `feat/walk-rows-extension` | `4fd3d6dd1` (merge main 2aeca8e30 ใช้ --no-verify) | ผู้ตรวจ VETO รอบ 1 → แก้แล้ว 57/57 · รอบแก้ 1/3 | รัน husky ซ้ำ → ผู้ตรวจตรวจรอบ 2 → gate → เดิน `--rows pdpa` บน staging ก่อนนับ DONE |
| `fix/credit-note-application-number` | 11-05 | ยังไม่เริ่ม | merge main → gate + ผู้ตรวจ |
| `feat/staging-test-closure-reason` | 11-05 | ยังไม่เริ่ม | เหมือนกัน |
| `fix/admin-closure-server-owned` | 11-05 | ยังไม่เริ่ม | เหมือนกัน |
| สำรวจเซิร์ฟเวอร์ demo (164(2)) | — | BLOCKED(operator: เพิ่ม public key `gacp-deploy@operator-pc` ใน authorized_keys ของ deploy + ลบ key `gacp-ops@43.134.175.51-to-119.59.105.140`) | operator รัน `scripts/ops/demo-survey.sh` จาก PC แล้วส่ง `demo-survey.txt` · cloud ssh ออกพอร์ต 22 ไม่ได้ |
| คำสั่ง 163 (ทุกบริการ) | — | ผลนับจากโค้ดอยู่ในประวัติ git: `git show 6310070eb:docs/contract/services-inventory-code-2026-11-07.md` | ทำหลัง deploy staging ตามลำดับคำสั่ง 164 · ต้องมีบัญชีเดินตรวจ (สร้างผ่าน UI/API ไม่ seed) |

ข้อเท็จจริงสำคัญ: demo รัน `b8d27a69` (v3.9.0) · ไม่มี migration ใหม่ระหว่าง b8d27a69..4364b408 แต่ main ใหม่มี migration `user_consent_events` จากงาน 11-05 · frontend ต้อง build แยกต่อชุด (`NEXT_PUBLIC_API_URL`) · operator ตัดสินแล้ว: staging ใช้ Postgres ใน container, ไม่ seed ข้อมูลธุรกิจ, Stripe endpoint ใหม่ (ปิด endpoint staging เดิมหลัง §4.10), วันนำเสนอนักลงทุนแจ้งล่วงหน้า ≥3 วัน
