# HARNESS.md — GACP AI Harness Architecture (operator-owned)
> ไฟล์นี้ + `scripts/check-done.sh` + `scripts/probes/probe-registry.txt` (cover rows) เป็นของ operator — agent แก้เมื่อ operator สั่ง+log, merge = operator
> `scripts/probes/*.sh` (probe logic): agent สร้าง/แก้ผ่าน PR + `--selftest` + adversarial review ได้ (CLAUDE.md v3 L6)
> หลักออกแบบเดียว: **harness ไม่เชื่อ self-report — ทุกอย่างตรวจด้วย probe ของจริง หรือ artifact ที่ตาเห็น**
---
## 1. ARCHITECTURE
```
operator
  │ สั่งงาน · ตัดสินนโยบาย · คำว่า merge / deploy · ถือ key · เซ็น cover
  ▼
orchestrator = session หลักของ Claude Code ที่รันคู่มือ Orchestrate ของ pstack:poteto-mode
  │ อ่าน CLAUDE.md และคำสั่งถาวร docs/governance/standing-orders.md (สร้างใหม่ 2026-11-07 แทน preferences.md ที่หายไปกับเครื่องเดิม) ทุกครั้งที่เริ่ม session และหลังสรุปบริบท (hook พิมพ์ after-compact.md)
  │ บัญชีงานด้วย orch ใน ~/.claude/orchestrate/gacp (units.tsv · gates.md · inbox/ · status.md) บนเครื่องพัฒนา · บันทึกเหตุการณ์ใน todo.md · บัญชีนี้อยู่นอก repo จึงเริ่มใหม่บนเครื่องใหม่จากรายการงานใน docs/operations/cloud-migration-2026-11-07.md §4 (ของเดิมหายกับเครื่อง staging 2026-11)
  │ เขียน brief ต่อหน่วยงานที่ reports/reviews/brief-*.md (ใน repo · ผ่าน gitleaks ก่อน commit)
  │ delegate
  ▼
sub-agent = pstack:poteto-agent ทุกตัว (worker และผู้ตรวจอิสระ) · จำนวนพร้อมกันไม่จำกัดตราบที่เครื่องไหว (operator 2026-11-07 แทนเพดาน 3 ตัว)
  │ worker: หนึ่งกิ่งหนึ่ง worktree · เทสต์ล้มก่อนแก้ · งานหนักผ่าน scripts/ops/heavy.sh · push เฉพาะกิ่งของตัวเอง
  │ ผู้ตรวจอิสระ: อ่านอย่างเดียวตามเลข commit · คัดค้าน (veto) ได้
  │ รายงานกลับเป็นข้อความ + artifact ใน evidence/
  ▼
gate: scripts/ops/heavy.sh timeout 7200 bash scripts/ci/full-gate.sh <sha> (env: scripts/ops/wsl-setup.sh --gate-env) (รายการด่านใน scripts/ci/full-gate-checks.txt · ด่าน probe-ci = scripts/ci/probe-gate.js รัน scripts/probes/* ตรวจของจริง ไม่อ่าน status ที่ agent เขียน)
        ──► scripts/ops/gate-compare.js และ scripts/ops/evidence-pack.js เทียบกับ gate ล่าสุดของ main (attestation evidence/gate/<sha>.json + รายชื่อเทสต์ที่ล้ม evidence/gate/fails/<sha>.txt)
        │
        ├─ ไม่มีความล้มเหลวใหม่ + ผู้ตรวจไม่คัดค้าน → ขอคำว่า merge → รวมเข้า main → gate main อีกครั้ง → push
        └─ มีความล้มเหลวใหม่หรือถูกคัดค้าน → brief รอบแก้ (บันทึก HARNESS_LOG.md ถ้าเป็น failure pattern ใหม่)
```
### บทบาทและโมเดล (operator 2026-10-09 · 2026-10-14 · 2026-10-20)
- sub-agent ทุกตัวเรียกเป็น `pstack:poteto-agent` และ brief ชี้คำสั่งถาวร · `.claude/agents/*` ยังอยู่ใน repo แต่โปรแกรมไม่ได้เรียกใช้
- โมเดลตามค่าตั้งต้นของ poteto: แก้บั๊ก perf hillclimb และการตัดสินที่ยากที่สุด = fable · feature refactoring งานเขียนและการตัดสินทั่วไป = opus
- ผู้ตรวจใช้ Claude เท่านั้น บนโมเดลคนละรุ่นกับผู้เขียน · โมเดลที่เต็มโควตาย้ายบทบาทไป opus หรือ sonnet แล้วย้ายกลับเมื่อโควตาคืน
- orchestrator ไม่แก้โค้ดเอง · ทำเองได้เฉพาะ merge ที่ไม่ชน การรวม HARNESS_LOG.md ใบรับรอง gate และเอกสารกติกาตามคำสั่ง operator · conflict ในโค้ดเป็นงานของ worker
- orch ไม่ใช้ `ledger.tsv` เพราะตารางนั้นผูกกับเลข pull request แต่โปรแกรม push กิ่งโดยไม่เปิด pull request · สถานะและ sha ของ unit คือสถานะการตรวจ · รายงานผลตรวจอยู่ที่ reports/reviews/ · ไม่ใช้ `orch standing` เพราะคำสั่งถาวรหนึ่งข้อมีหลายบรรทัด
- `scripts/check-done.sh` ใช้รัน probe ทีละตัวจาก skill และ command · gate เต็มรัน probe ทั้งชุดผ่านด่าน probe-ci
### Permission matrix
| ไฟล์/พื้นที่ | orchestrator | sub-agents | operator |
|---|---|---|---|
| CLAUDE.md, HARNESS.md, probe-registry (cover rows), check-done.sh | แก้เมื่อ operator สั่ง+log (L6) | read | **merge/เซ็น** |
| scripts/probes/*.sh (probe logic) | PR + selftest + review (L6) | เสนอ diff | merge ตาม tier |
| waiver / manual(-until) / baseline ขึ้น (= การให้ cover) | — (ลบได้เฉพาะแถวหนี้จ่ายแล้วที่ probe-gate ชี้ + แนบ PASS) | — | **เซ็นเท่านั้น** |
| src/, tests/ | ไม่แก้เอง (เขียน brief) · merge ที่ไม่ชนได้ | worker: write บนกิ่งและ worktree ของตัวเอง · ผู้ตรวจ: read | write |
| reports/, evidence/ | write | write (ของตัวเอง) | read |
| HARNESS_LOG.md, AUDIT_LEDGER.md | append-only | append-only | write |
| ข้อมูลเงินใน DB | read/flag | read/flag | **mutate** |
| merge ชั้น A/B เข้า main | ลงมือหลังได้คำว่า merge เท่านั้น (push main ต้องมีคำว่า merge ตาม CLAUDE.md) | — | **ตัดสินเท่านั้น** (คำว่า merge) |
| merge Tier C · deploy · keys | ลงมือหลังได้คำว่า merge / deploy เท่านั้น ตาม runbook | — | **ตัดสินเท่านั้น** (คำว่า merge / deploy) |
| สั่งงานบนเซิร์ฟเวอร์ demo (เครื่องทดสอบ · ไม่มีชุด staging ตั้งแต่ 2026-11-08) | หลังคำว่า deploy: รันตาม `docs/operations/runbooks/deploy-demo.md` ผ่าน ssh ผู้ใช้ deploy จากเครื่องพัฒนา · post walk ต้องไม่มี FAIL ใหม่เทียบ baseline ของรอบ ไม่งั้น rollback (คำสั่ง 164 แก้ 2026-11-08) · งานแก้โครงสร้าง (compose overlay, env, nginx) ใช้สคริปต์ที่ operator อนุมัติ และสิทธิ์ของ Claude Code ระบุชื่อสคริปต์ทีละตัวใน .claude/settings.local.json (operator 2026-10-14) · ระบบสิทธิ์ปฏิเสธ = หยุดแล้วรายงาน ไม่หาทางอ้อม · คำสั่งคนละเครื่องห้ามอยู่บล็อกเดียวกัน (HARNESS_LOG.md 2026-08-14) | — | SSH ตรงได้ · เพิ่มหรือถอนสิทธิ์รายสคริปต์ |
## 2. STATUS & TRUST MODEL
- Status 3 ค่า (CLAUDE.md §2) — ค่าอื่นทั้งหมด invalid · enforcement: probe `status-vocab`
- **Trust chain: operator > probe > orchestrator > sub-agent** — ชั้นล่างขัดชั้นบน = เชื่อชั้นบน + รายงานความขัดแย้งเป็น incident
- **Artifact ที่ตาเห็น (§4.4) ขัดกับคำอธิบายใน report = เชื่อ artifact** — คำอธิบายไม่ใช่หลักฐาน
- Sub-agent report เรื่อง DONE = แค่ input; check-done ต้อง re-probe เองก่อนนับ
## 3. PHASE GATES — ตามชั้น (tier จาก `scripts/probes/tier-check.sh` เท่านั้น)
```
ชั้น A:  PLAN(1 บรรทัดใน PR) → GREEN(local-gate) → REPORT
ชั้น B:  PLAN → RED(เฉพาะ executable behavior) → GREEN → AUDIT → EVIDENCE(artifact §4.4) → REPORT
ชั้น C:  เหมือน B + RED ต้อง paste ก่อนขอ GREEN + evidence pack เต็ม §5 + operator merge
```
| Phase | Exit criteria (machine-checkable) |
|---|---|
| PLAN | ชั้น A: 1 บรรทัดใน PR body · ชั้น B/C: plan file — scope, acceptance criteria, **non-goals** |
| RED | ชั้น B/C ที่เปลี่ยน executable behavior: test ใหม่ + output ที่ **fail จริง** แนบไว้ — ไม่เคย fail = ไม่นับ · ชั้น C: paste RED ก่อนขอ GREEN |
| GREEN | ชั้น A: `local-gate.sh` exit 0 · ชั้น B/C: full suite exit 0 + test count ≥ baseline + lint + typecheck + **ratchet ไม่เพิ่ม** |
| AUDIT | ชั้น B/C: sub-agent ที่เกี่ยวข้องรันแล้ว finding = 0 หรือ operator acknowledge |
| EVIDENCE | ชั้น B: artifact ตามงาน (test output / view-pack §4.4) · ชั้น C: evidence pack ครบ §5 |
| REPORT | รูปแบบ CLAUDE.md §6 (≤ 40 บรรทัด) · ผ่าน probe `report-integrity` เมื่อเสียบแล้ว |
## 4. PROBE REGISTRY
> ทะเบียนจริง: `scripts/probes/probe-registry.txt` (บังคับโดย `scripts/ci/probe-gate.js`) · probe logic ใหม่/แก้ = PR + selftest + review (L6) · cover rows = operator เซ็น
### 4.1 Integrity (ทุก iteration)
| Probe | ตรวจ | ผ่านเมื่อ |
|---|---|---|
| `suite-green` | รัน full suite จริง | exit 0 **และ** test count ≥ baseline (กัน test หาย) |
| `no-skip` | grep `.skip\|.only\|xit(\|xdescribe(` ใน tests/ | 0 hit (นอก allowlist ที่ operator เซ็น) |
| `no-secret` | gitleaks + grep `sk_\|whsec_\|pk_live` | 0 hit · ไม่มี deep scanner = BLOCKED ไม่ใช่ PASS |
| `status-vocab` | ทุก `DONE(probe:X)` ใน QUEUE.md + reports/** | X มีจริงในทะเบียน (มี selftest ในไฟล์ — แบบอย่างของ L6) |
| `report-integrity` | parse report ที่ระบุ target ชัดเจน | claim ข้อเท็จจริง/ตัวเลขมี reference; status เป็น 1 ใน 3 ค่า |
### 4.2 Ratchet — เผาหนี้ทางเดียว (หัวใจของการแก้ปัญหา hardcode)
กลไก: `AUDIT_LEDGER.md` เก็บ baseline count ต่อ counter — probe นับใหม่ทุก run:
**นับได้มากกว่า baseline = fail ทันที** / นับได้น้อยกว่า = อัปเดต baseline ลง (ratchet ลงอย่างเดียว — ปรับขึ้น = operator + incident entry เท่านั้น)
| Counter | นับอะไร |
|---|---|
| `hardcode` | magic number/string ใน business logic: ตัวเลขเงิน/เปอร์เซ็นต์/วัน, URL, ID หน่วยงาน, ชื่อนิติบุคคล — pattern ใน `probes/hardcode-patterns.txt` |
| `dup-source` | จำนวน source ต่อ SSOT domain (`probes/ssot-domains.txt`): holiday calendar, status vocab, fee table, entity names, role identifiers — ต้อง = 1 ต่อ domain |
| `todo` | เครื่องหมายหนี้เป็นคำเต็ม `\b((TODO\|FIXME\|HACK)s?\|XXX)\b` (นับรูปพหูพจน์ s ตัวเล็ก `TODOs` `FIXMEs` `HACKs` ด้วย · ไม่ติดกับตัวอักษรอังกฤษ (A-Z a-z) ตัวเลข ขีดล่าง หรือ X ตัวอื่น · ตัวอักษรไทยไม่กัน (`LC_ALL=C`)) ใน `apps/backend/{services,routes,jobs,middleware,shared,config}/**/*.js` นับทีละบรรทัด · ไม่นับหน้ากากเลขบัตร `X-XXXX-XXXX-X-1234` (คำสั่ง 68(2)) · ยังนับ `'TODO'` ที่เป็นค่าข้อมูล (สถานะของ WorkActivity) · `--selftest` ในไฟล์ตรึงขอบเขตและกติกานี้ไว้ และ `scripts/ci/local-gate.sh` รันมันเป็นขั้น `ratchet-selftest` |
| `env-direct` | `process.env.X` นอก config module |
| `dead-route` | route ที่ประกาศแต่ไม่มี test ครอบ + ไม่มี UI ชี้ถึง (ยังไม่มีตัวนับเชิงกล) |
| `error-code-pointer` | `source` file:line ใน `apps/backend/shared/error-codes.js` ที่ไฟล์ไม่มีจริง หรือ ±2 บรรทัดไม่มีชื่อ code — ตัวนับคือ jest `apps/backend/__tests__/unit/error-codes-source-pointers.test.js` (main ตั้งแต่ 87b197bf) · **baseline อยู่ในไฟล์เทสเอง** (`KNOWN_PREEXISTING_DRIFT` = 209 จาก 395, 2026-09-26) ไม่ใช่ AUDIT_LEDGER.md · pointer นอก baseline เพี้ยน = fail · แถวใน baseline ที่แก้แล้วหรือ code หายแล้วแต่ไม่ลบ = fail · ลด = ลบแถวในคอมมิตที่แก้ pointer นั้น · **ปรับขึ้น = operator + log** เหมือน baseline อื่น — ยังไม่มีเครื่องล็อกที่ operator เซ็น (ไฟล์เทสแก้ได้ใน PR ปกติ) ⇒ ระหว่างนี้ตัวกันคือ review |
| `precheck-accuracy` | ความแม่นของตรวจเอกสารเบื้องต้นบนชุดเอกสารสังเคราะห์ (`apps/backend/__tests__/fixtures/document-precheck/corpus` + `labels.json`) — precision/recall ต่อ check + รวม และอัตรา UNREADABLE (DOC_TYPE/CROSS_MATCH/VALIDITY นับเฉพาะไฟล์ที่ความจริงอ่านได้) · **ชุดสังเคราะห์: พื้นนี้กันถอยหลังเท่านั้น ไม่ใช่ตัวเลขความแม่นของ production** · ตัวนับคือ jest `apps/backend/__tests__/integration/document-precheck-accuracy.test.js` (ไม่ใช้ DB · อยู่ในชุด `jest __tests__/integration` ของ full-gate `integration-pg`) · **ทิศกลับกับ counter อื่น: เป็นพื้น (floor)** อยู่ใน `thresholds.json` ข้างไฟล์ labels ไม่ใช่ AUDIT_LEDGER.md · ค่าต่ำกว่าพื้น (หรือ UNREADABLE เกินเพดาน) = fail · **ยกพื้นขึ้น = ปกติ** · **ลดพื้น/ยกเพดาน = operator + log** · ค่า `OCR_CONFIDENCE_MIN`/`NAME_SIMILARITY_MIN` เปลี่ยนได้เมื่อรัน `node scripts/document-precheck/accuracy-report.js --sweep` แล้วพื้นไม่ตก · ยังไม่มีเครื่องล็อกที่ operator เซ็น (thresholds.json แก้ได้ใน PR ปกติ) ⇒ ระหว่างนี้ตัวกันคือ review · เหตุผลที่ตั้งพื้น: `evidence/document-precheck-task-9/INDEX.md` |
Burn-down quota: ทุก iteration ที่ไม่ใช่ hotfix เผาหนี้ ≥ 1 รายการจาก ledger — งานใหม่อย่างเดียวโดยหนี้ไม่ลด = AUDIT ไม่ผ่าน
### 4.3 Domain (payment)
| Probe | ผ่านเมื่อ |
|---|---|
| `stripe-sdk-isolated` | `from 'stripe'` เจอเฉพาะ StripeAdapter ไฟล์เดียว |
| `no-public-financial-pdfs` | ไม่มีโค้ดเขียนเอกสารการเงินที่ระบบสร้างลง `gacp-pdfs` · `classifyUploadsPath` จัด `gacp-pdfs/` เป็น sensitive · เมื่อตั้ง `PROBE_UPLOADS_DIR` (ตรวจหลังย้ายไฟล์ตอน deploy) อ่านรากโฟลเดอร์ uploads ทั้งหมดตาม symlink (`find -L`) ไม่มีไฟล์เหลือใต้ `<uploads>/gacp-pdfs` และไม่มีชื่อแบบเอกสารการเงินในโฟลเดอร์ที่ classifier จัดเป็นสาธารณะ · โฟลเดอร์ไม่มีจริง อ่านไม่ได้ ไม่มีโฟลเดอร์ที่รากของ uploads ต้องมี หรือมีโฟลเดอร์ย่อยที่อ่านไม่ได้ = BLOCKED ไม่ใช่ PASS · volume ของ docker อ่านได้เฉพาะ root จึงรันด้วย `sudo env "PATH=$PATH" PROBE_UPLOADS_DIR=/var/lib/docker/volumes/<volume>/_data bash scripts/probes/no-public-financial-pdfs.sh` · PASS ของการตรวจเครื่องต้องมีคำว่า "read in full" |
| `webhook-idempotent` | ยิง event ซ้ำ → side effect = 1 |
| `settle-webhook-only` | ไม่มี code path อื่น set SETTLED |
| `holiday-single-source` | calendar source = 1 |
| `rejected-approver-only` | ไฟล์ที่เขียน REJECTED มีเฉพาะ `services/certification-decision-service.js` · ขาเข้า REJECTED ใน ROLE_TRANSITIONS มีเฉพาะของผู้อนุมัติ และตรงกับ DECISION_STATE_OWNERS (คำสั่ง 56(2)) |
| `stripe-keys-ready` | ยิง Stripe test-mode API จาก env สำเร็จจริง — ก่อนหน้านั้น BLOCKED เสมอ ห้าม DONE |
| `drain-complete` | SQL: legacy non-terminal orders = 0 |
| `money-equation` | sample orders จาก DB: total = dtam + net + vat ทุก row |
| `crawler-clean` | crawler-report.json: dead/404/console-error = 0 |
| `evidence-complete` | evidence dir ครบชนิดไฟล์ + ไม่ empty |
### 4.4 View-in-the-loop evidence — หลักฐานชั้นหนึ่ง (operator 2026-08-07)
- **view-pack** ต่อ work item ที่แตะ UI/flow: screenshot ต่อ step จากการ**กดจริง** + trace/วิดีโอ + `INDEX.md` ที่ operator เปิดไล่ดูได้โดยไม่อ่านโค้ด · ทุกภาพกำกับ build SHA + วันที่
- น้ำหนัก: งาน UI/flow → view-pack **เท่ากับหรือมากกว่า** test log · สองอย่างขัดกัน = เชื่อสิ่งที่ตาเห็น + เปิด incident
- enforcement: ขยาย `evidence-complete` — งาน UI ที่ screenshots/ ว่าง = FAIL `[BUILD]`
- เป้าถัดไป: flow-proof harness — E2E ผลิต visual walkthrough ทั้งเส้น UI → API → DB หนึ่งหน้าต่อรอบ QA อัตโนมัติ
### 4.5 Probe ที่ v3 สั่งสร้าง (`[BUILD]` — เรียงคุ้มก่อน)
| Probe | ตรวจอะไร | รับใช้กฎ |
|---|---|---|
| `path-guard` (รันผ่าน local-gate/full-gate — ไม่มี CI ตามมติ operator) | PR แตะ path Tier C/operator-owned โดยไม่มีการรับรองที่ operator เซ็น (ไม่ใช่ label บน GitHub PR — ไม่มี CI ให้ติด label แล้ว) = FAIL | L5, L6 |
| `money-write-guard` | write ตาราง payment/invoice/journal นอก allowlist writer ที่ operator เซ็น | L3 |
| `report-size` | report ต่อ work item ≤ 40 บรรทัด | L1 (ฆ่า rationale inflation) |
| `probe-selftest` | ทุก `scripts/probes/*.sh` ที่แตะใน PR ต้องมี `--selftest` และรันผ่าน | L6 |
| `queue-freshness` | status ใน QUEUE.md เทียบ git log จริง — merged แล้วยังเขียนค้าง = FAIL | L1 (operator ขอ 2 ครั้ง — HARNESS_LOG.md:80-81) |
| `evidence-complete` (ขยาย) | งาน UI: screenshots/ ไม่ว่าง + INDEX.md + SHA/วันที่ | §4.4 |
| `holder-read-scope` | ทุก read ของฝั่งสุขภาพที่คืนแถวมี holder ต้องผ่าน `holderReadWhere` (`services/holder-access.js`) — ไม่มี active-entity, ไม่มี filer fallback; read ที่อ่านโดยไม่มี fragment = FAIL (spec 2026-09-30-remove-workspace-mode §3.7 · Task 14 สร้าง) | L4 |
## 5. EVIDENCE PACK (ชั้น C เต็มชุด · ชั้น B เอาเฉพาะ artifact ที่ตรงงาน · ชั้น A ไม่ต้อง)
```
evidence/<work-item>/
  trace/  video/  screenshots/  crawler-report.json     ← view-pack (§4.4)
  test-output.txt        # สรุปผล full suite (จำนวนต่อชุด + ชื่อเทสต์ที่ล้มทุกชื่อ + ที่อยู่ log ดิบบนเครื่องทำงาน)
  probe-results.json     # output ทุก probe รอบนั้น
  ratchet-before-after.txt
```
รายงาน = index ชี้ artifact; operator เปิด trace/ภาพดูเอง = view-in-the-loop จริง
- log ดิบของ full suite ไม่ commit เพราะมีสตริงคล้ายคีย์ (idempotency key, hash) ที่ทำให้ secret scan ทั้งประวัติแดงถาวรจนกว่า operator จะ waive (2026-10-14)
- สรุป test-output.txt probe-results.json และ ratchet-before-after.txt สร้างด้วย `node scripts/ops/evidence-pack.js <head_sha> <main_gate_sha> <evidence_dir> [notes]` ซึ่งอ่าน attestation และ log ของ gate ทั้งสองหัวโดยตรง · log ดิบอยู่บนเครื่องพัฒนาที่ evidence/gate/logs/<sha>/ (gitignored)
- ไฟล์ใน evidence/ ทุกไฟล์ผ่าน `gitleaks detect --no-git --no-banner --redact --source <file>` ก่อน commit
## 6. `/audit-system` — Deep Audit Command (รันใน repo จริง)
> รันครั้งแรกเพื่อสร้าง baseline แล้วรันซ้ำทุกสัปดาห์/ทุก wave · Read-only ทั้งหมด — output คือ `AUDIT_LEDGER.md`
ขั้นตอนบังคับ (ทุกข้อ output จริง + file:line):
1. **Inventory** — โครง repo, entry points, route ทั้งหมดต่อ app, Prisma models ↔ ตารางจริง, cron/jobs ทั้งหมด
2. **Hardcode scan** — pattern ทุกชุดใน `hardcode-patterns.txt` + AST-based scan → จัดกลุ่ม: เงิน > กติกาเวลา > identifiers > ข้อความ
3. **SSOT violations** — logic/ข้อมูลซ้ำสองที่: diff hash ของ function คล้ายกัน, ค่าคงที่เดียวกันหลายไฟล์
4. **Config drift** — `process.env` ทุกจุด vs config module vs `.env.example`
5. **Dead code / dead route** — route ไม่มี test + ไม่มี referrer, export ไม่มี import, feature flag ค้าง
6. **Test quality** — test ไม่มี assertion, mock จนไม่ทดสอบอะไร, coverage hole ใน payment/auth path
7. **Auth matrix** — ทุก route × ทุก role จาก middleware จริง — เทียบกับที่ตั้งใจ
8. **Migration hygiene** — migration แก้ย้อนหลัง, drift ระหว่าง schema กับ DB
9. **Output**: `AUDIT_LEDGER.md` — ทุก finding: id, severity (เงิน/ความปลอดภัย = P0), file:line, proposed fix, effort — แล้วตั้ง baseline counters
## 7. HARNESS_LOG.md PROTOCOL
- Append-only — loop เพี้ยน / ละเมิดกติกา / probe ขัด report: บันทึก อาการ, root cause, probe ที่ควรเพิ่ม
- ทุก entry จบด้วยหนึ่งในสอง: (a) probe/pin ใหม่ที่เสนอ หรือ (b) `no-action + เหตุผล`
- Pattern เดิมเกิดซ้ำโดยไม่มี probe ใหม่ = harness ล้มเหลว ยกเป็น P0
## 8. CHANGE CONTROL (v3 — L6)
- **ไฟล์กติกา** (CLAUDE.md, HARNESS.md, registry cover rows, check-done.sh): operator สั่ง+log → agent แก้ได้ · merge = operator · PR แยกจากงาน feature
- **Probe logic** (`scripts/probes/*.sh`): agent สร้าง/แก้ผ่าน PR แยก + `--selftest` พิสูจน์ fail-case และ pass-case + adversarial review · ห้ามแตะ waiver/baseline ในใบเดียวกัน
- **Waiver ที่หนี้จ่ายแล้ว**: probe-gate ชี้ "ผ่านแล้วให้ลบ" → agent ลบบรรทัดนั้นได้เอง — diff มีแค่บรรทัดที่ถูกชี้ + แนบ output PASS ใน PR
- **Ratchet baseline ปรับขึ้น**: operator แก้เอง + entry ใน HARNESS_LOG.md เท่านั้น
- หน่วยงานจบ → unit ใน orch เปลี่ยนเป็น merged หรือ deployed · brief และรายงานคงอยู่ที่ reports/reviews/ · probe ใหม่ของหน่วยนั้นลงทะเบียนใน `scripts/probes/probe-registry.txt` ตามข้อ probe logic ด้านบน
