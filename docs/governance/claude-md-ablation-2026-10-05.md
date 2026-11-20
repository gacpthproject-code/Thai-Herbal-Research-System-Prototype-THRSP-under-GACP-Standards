# CLAUDE.md v3 ฉบับเต็ม — ถอดออกจาก CLAUDE.md ตอน ablation 2026-10-05

คำสั่ง operator 2026-10-05:
1. ลบกฎที่สั่งว่าให้คิดแบบไหน ตอบแบบไหน เก็บไว้แค่ว่าเราเป็นใคร เป้าหมายของงานคืออะไร และแบบไหนเรียกว่าเสร็จ
2. ใช้ฉบับเบาจริง 1 วัน
3. ถ้า Claude พลาดเรื่องเดิมซ้ำ ค่อยเติมกฎข้อนั้นกลับ

วิธีเติมกลับ: เมื่อพลาดซ้ำ ให้คัดข้อที่ตรงจากฉบับเต็มด้านล่าง ใส่กลับใน CLAUDE.md
พร้อมบันทึก HARNESS_LOG.md (วันที่ · พลาดอะไร · หลักฐาน · ข้อที่เติม) · merge = operator

## สมุดพลาดซ้ำ (เติมระหว่างทดลอง — ครั้งแรกจดไว้ก่อน ครั้งที่สองจึงเติมกฎ)
| วันที่ | พลาดอะไร | หลักฐาน | ตรงกับข้อเดิม | เติมแล้ว? |
|---|---|---|---|---|

## สิ่งที่ยังบังคับอยู่โดยไม่ต้องมีในข้อความ
probe ทุกตัว (status-vocab, ratchet, no-secret, retired-words, report-integrity, probe-gate, tier-check ฯลฯ)
และ .husky/pre-commit ยังรันเหมือนเดิม การถอดข้อความไม่ได้ปิดเครื่องตัวไหน

---

## ฉบับเต็มก่อนถอด (main 16ad1304, ทุกตัวอักษร)

# CLAUDE.md — GACP-Certification-Application (v3 — operator-instructed 2026-08-07)
> คำสั่ง operator (บันทึก HARNESS_LOG.md:185-195 + เพิ่มเติมบ่ายวันเดียวกัน): ลดกฎ/ระเบียบ · เครื่องบังคับแทนวินัยคน ·
> "ต้องเทสจริงๆ เห็นจริง และทดสอบ และกดมันจริงๆ ไม่ใช่แค่เขียนโค๊ดและหาเหตุผลซัพพอท" (view-in-the-loop)
> **หลักสูงสุด (คงจาก v2)**: กฎที่ไม่มีเครื่องบังคับ = กฎร่าง · ป้าย: `[ACTIVE]` เครื่องทำให้ merge ไม่ผ่านได้จริง ·
> `[MANUAL]` มีกลไกแต่คนสั่งรัน · `[BUILD]` ระบุ probe ที่ต้องสร้างแล้ว ยังไม่มีไฟล์ (รายการ HARNESS.md §4.5)
> **หลักใหม่ v3**: **หลักฐาน > คำอธิบาย** — artifact ที่เปิดดูแล้วเชื่อได้ (ผลรันจริง/ภาพ/วิดีโอ/trace) ชนะคำอธิบายเสมอเมื่อขัดกัน ·
> เอกสารยาวกว่า diff = สัญญาณเสีย ไม่ใช่ผลงาน
---
## 0. ตารางเทียบ v2 → v3 (ตรวจย้อนได้ — เหตุผลเต็ม: `reports/orchestrator/2026-08-07-rule-reform-v3/RATIONALE.md`)
| v2 | ไปที่ v3 | เหตุผลย่อ |
|---|---|---|
| 3.1 tiered merge / no auto-deploy | **L5** — คงเข้ม | Tier C + deploy คือความเสี่ยงจริง ไม่ผ่อน |
| 3.2 + 3.9 + 3.8 | **ยุบเป็น L1** | สามข้อคือเรื่องเดียว: claim ต้องมีหลักฐานรันจริง (route-around = รายงานเท็จรูปหนึ่ง) |
| 3.3 no secret | **L2** — คงเข้ม | operator ไม่ได้สั่งผ่อน · near-miss จริง (HARNESS_LOG.md:59-64) |
| 3.4 no money mutation | **L3** — คงเข้ม + ผูก G1 hard gate | ห้ามผ่อนตามคำสั่ง · GOALS.md G1 สั่งบันทึกเป็นกติกา |
| 3.5 + 3.6 + 3.7 | **ยุบเป็น L4** | ทั้งหมดคือ ratchet ตระกูลเดียว เครื่องนับอยู่แล้ว |
| 3.10 expand-before-contract | **guidance §4** | ไม่มีเครื่องตรวจ · migration เป็น Tier C อยู่แล้ว operator เห็นทุกใบ |
| 3.11 red-first | **DoD §5 ชั้น B/C เฉพาะ executable behavior** | docs ไม่มี behavior ให้ fail — บังคับ = ผลิตพิธีกรรม |
| 3.12 operator-owned | **L6 เขียนกฎได้ ยกเว้นกฎไม่ได้** | ผ่อนฝั่งซ่อม/สร้าง probe · คงเข้มฝั่งให้ cover + merge Tier C |
| §1 protocol 4 ขั้น | **§1 เหลือ 2 ขั้น** | ประกาศไฟล์ล่วงหน้า = พิธีกรรม — tier-check ตัดสินจาก diff จริงอยู่แล้ว |
| §2 status 3 ค่า | **§2 คงเดิมทุกตัวอักษร** | probe `status-vocab` คุมได้จริงแล้ว (เขียวบน main 2026-08-07) |
| §4 DoD เดียวทุกงาน | **§5 DoD ตามชั้น** | full suite กับ docs = ต้นทุนสูงไม่ลดความเสี่ยง (HARNESS_LOG.md:194) |
| §5 report 8 ช่อง | **§6 สั้นลง + เพดานบรรทัด** | ฆ่า rationale inflation (HARNESS_LOG.md:178-183) |
| §7 escalation | **§8 คงเดิมทุกข้อ** | จุดที่มนุษย์ต้องตัดสิน — ไม่แตะ |
## 1. SESSION START
1. รัน `bash scripts/session-check.sh` — เครื่องพิมพ์ branch/diff/probe summary เอง (แผน: SessionStart hook รันให้อัตโนมัติ)
2. response แรก: branch + งานที่จะทำ (1-2 บรรทัดพอ) · มี mission file → อ่านต่อ, ไฟล์นี้ชนะเมื่อขัดกัน
## 2. STATUS (คงจาก v2 ทุกตัวอักษร — enforcement: probe `status-vocab` `[ACTIVE]`)
| ค่า | เงื่อนไข |
|---|---|
| `DONE(probe:<name>)` | probe ผ่านจริง **ใน session นี้** — แนบ output |
| `PENDING` | ยังไม่เสร็จ / กำลังทำ |
| `BLOCKED(operator:<need>)` | รอ operator — ระบุสิ่งที่ต้องการชัดเจน |
ห้ามค่าอื่น · DONE จากความจำ/report เก่า/status ที่ agent อื่นเขียน = fabricated = ละเมิด L1
## 3. LAWS — 6 ข้อ (ละเมิด = หยุดงานทันที รายงาน รอ operator)
| # | กฎ | Enforcement |
|---|---|---|
| L1 | **EVIDENCE-OR-SILENCE** — ทุก claim เชิงข้อเท็จจริง (status, ตัวเลข, ผล test, "ตรวจแล้ว/ไม่มี X") ต้องมี artifact ที่รันจริงใน session · infra พัง = รายงานตามจริง ห้าม route-around · ไม่มีหลักฐาน = เขียน PENDING/BLOCKED ไม่ใช่เขียนคำอธิบาย (จาก 3.2+3.9+3.8) | `status-vocab` `[ACTIVE]` · `report-integrity` `[ACTIVE]` (registry: กอง ci) · `report-size` `[BUILD]` · `retired-words` `[ACTIVE]` |
| L2 | **NO SECRET** in code/log/report/context — รวม redact webhook payload (จาก 3.3 — ไม่ผ่อน) | `no-secret` `[ACTIVE]` fail-loud เมื่อ deep scanner ไม่มี — ห้าม PASS เงียบ · layer2 gitleaks ใน no-secret · .husky/pre-commit ปฏิเสธ commit ที่มีโทเคนดิบใน evidence/reports (ไม่ redact เอง) ชี้ให้รัน `scripts/redact-evidence-tokens.js` |
| L3 | **NO MONEY MUTATION by agent** — อ่าน/flag/เสนอ diff เท่านั้น · **live payment key ห้ามตั้งจนกว่า G1 (GOALS.md) เขียวครบ — hard gate ไม่ใช่ backlog** (จาก 3.4 — เข้มขึ้น) | `money-write-guard` `[BUILD]` · ระหว่างนี้ path เงินทุกใบ = Tier C = operator merge (tier-check C_KEYWORD) · `settle-webhook-only` `[ACTIVE]` · `money-equation` `[MANUAL]` |
| L4 | **RATCHET ลงทางเดียว** — hardcode / dup-source / todo / env-direct / skip / green-mask: ตัวนับเพิ่มแม้ตัวเดียว = fail · baseline ปรับขึ้น = operator + log เท่านั้น (จาก 3.5+3.6+3.7) | `ratchet` `[ACTIVE]` · `no-skip` `[ACTIVE]` · `check-green-mask-assertions.js` `[ACTIVE]` · `holiday-single-source` `[ACTIVE]` · `error-codes-source-pointers.test.js` `[ACTIVE]` (jest ใน full suite · baseline อยู่ในไฟล์เทส — HARNESS.md §4.2) · `document-precheck-accuracy.test.js` `[ACTIVE]` (jest ใน full-gate integration · พื้นอยู่ใน `apps/backend/__tests__/fixtures/document-precheck/thresholds.json` · ลดพื้น = operator + log — HARNESS.md §4.2 `precheck-accuracy`) |
| L5 | **TIERED MERGE / NO AUTO-DEPLOY** — tier ตัดสินโดย `scripts/probes/tier-check.sh` เท่านั้น ห้ามประเมินเอง · ชั้น A/B agent merge ตามเงื่อนไข §5 · **Tier C + deploy ทุกชนิด = operator ตลอดไป** · ไม่มี CI ตามมติ operator (2026-08-14 · ย้ำ 2026-09-10, commit db62d5c0) — เกณฑ์คือ §5 (จาก 3.1) | `tier-check` `[MANUAL]` จัดชั้นเท่านั้น (tier ตัดสินโดย output ของมันตรงตามกฎข้างต้น — รันจริงในกอง ci, ยังไม่อยู่ใน DEFAULT ของ check-done.sh, ไม่ทำให้ merge ไม่ผ่านเอง — มีกลไกแต่คนสั่งรัน) · `path-guard` `[BUILD]` · deploy: `workflow_dispatch` only + promote `if:false` (#775) เป็น config เดิมในไฟล์ workflow ที่ยังบล็อกอยู่ถ้า Actions กลับมารัน — ไม่มี hosted Actions รันจริงตั้งแต่ 2026-08-14 จึงไม่มี auto-deploy ทางใดเลยตอนนี้ (เพราะไม่มี CI รัน ไม่ใช่เพราะ guard นี้บล็อก) |
| L6 | **เขียนกฎได้ ยกเว้นกฎไม่ได้** — agent สร้าง/แก้ probe logic ได้ผ่าน PR ที่มี `--selftest` (พิสูจน์ทั้งเคส fail และ pass) + adversarial review · **operator-only: การให้ cover ทุกรูป (waiver, manual(-until), baseline ขึ้น) + merge Tier C** — เพราะนั่นคือการยกเว้นกฎ ไม่ใช่การเขียนกฎ · waiver ที่หนี้จ่ายแล้ว (probe-gate ชี้ "ผ่านแล้วให้ลบ"): agent ลบบรรทัดนั้นได้เอง diff ต้องมีแค่บรรทัดนั้น + แนบ output PASS · CLAUDE.md/HARNESS.md: แก้ได้เมื่อ operator สั่งเป็นลายลักษณ์อักษร + บันทึก log, merge = operator (จาก 3.12) | `probe-gate.js` บังคับ signed-by=operator กับ cover ทุกแถว + ชี้ waiver ที่หนี้จ่ายแล้ว `[ACTIVE]` · `probe-selftest` `[BUILD]` · `path-guard` `[BUILD]` |
## 4. GUIDANCE (แนะนำ — ไม่ block ไม่ต้องเขียนอธิบายว่าทำไมไม่ทำ)
- expand-before-contract (เดิม 3.10): migration expand ก่อน, contract แยกใบหลัง drain — ผู้ตรวจคือ Tier C review
- red-first กับงาน non-executable (docs/skill/report): ไม่บังคับ — ที่บังคับอยู่ใน §5 ชั้น B/C
- รู้สึกต้องอธิบายเกิน ~10 บรรทัด = สัญญาณให้ไปทำ artifact ให้ดูแทน
## 5. DEFINITION OF DONE — ตามชั้น (tier จาก `tier-check.sh` เท่านั้น)
| ชั้น | gate บังคับ | RED-first | artifact บังคับ (เปิดดูแล้วเชื่อได้) |
|---|---|---|---|
| **A** — docs/reports/evidence/tests-only/skills | `scripts/ci/local-gate.sh` + เทียบผลกับ attestation ล่าสุดของ main ที่ `evidence/gate/<sha>.json` ("ไม่มีความล้มเหลวใหม่" — คนเทียบ ไม่มีสคริปต์คำนวณ diff ให้) + review ≥1 ชั้น — **ไม่ต้อง full suite** | — | ผล local-gate ใน session |
| **B** — โค้ดทั่วไป | `LOCAL_GATE_FULL=1 local-gate.sh` + reviewer เทียบผลกับ attestation ล่าสุดของ main ที่ `evidence/gate/<sha>.json` ("ไม่มีความล้มเหลวใหม่" — คนเทียบ ไม่มีสคริปต์คำนวณ diff ให้) + `engineering:review` + `security-review` | บังคับเมื่อเปลี่ยน executable behavior — แนบ output ที่ fail จริง | test output จริง · งาน UI/flow: **view-pack** (HARNESS.md §4.4) — น้ำหนัก ≥ test log |
| **C** — เงิน/auth/identity/schema/migration/compose/secret/governance | ทั้งหมดของ B + paste RED ก่อนขอ GREEN + evidence pack เต็ม (HARNESS.md §5) + **operator merge** | บังคับเสมอ (reference pattern: M4 — HARNESS_LOG.md:120-130) | pack เต็ม + view-pack |
- หลักฐานขัดกับคำอธิบาย = เชื่อหลักฐาน · งานที่ต้องพิสูจน์บน Postgres จริงแต่รันไม่ได้ใน session = PENDING ห้ามเคลม
## 6. REPORT (ต่อ work item — เพดาน **40 บรรทัด**: enforcement `report-size` `[BUILD]`, ระหว่างนี้ reviewer ตีกลับ)
```
## <work-item> — <date>
Status: <ตาม §2>
Did:     <bullet — file:line เฉพาะ claim ข้อเท็จจริง/ตัวเลข/ผลรัน bullet เชิงบรรยายไม่ต้อง>
Ratchet: <เฉพาะงานที่แตะ src/ — ตัวเลขจาก probe ห้ามพิมพ์มือ>
Blocked: <ตามจริง หรือ ->
Next:    <1-3 ข้อ>
Evidence: <path — งาน UI/flow ชี้ view-pack INDEX>
```
ห้าม: คำประเมินตัวเอง ("เรียบร้อยดี", "มั่นใจ") · เดา root cause โดยไม่มี log · เขียนเหตุผลชดเชยหลักฐานที่ไม่มี
## 7. FILE MAP
```
CLAUDE.md                  ← กฎถาวร (แก้ตาม L6 · merge = operator)
HARNESS.md                 ← สถาปัตยกรรม harness + probe registry (เงื่อนไขเดียวกัน)
HARNESS_LOG.md             ← append-only incident log (agent เขียนเพิ่มได้ ห้ามแก้ย้อน)
GOALS.md                   ← เข็มทิศ G0-G3 — v3 ผูก L3 กับ G1 hard gate
AUDIT_LEDGER.md            ← findings + ratchet baselines (ปรับขึ้น = operator เท่านั้น — L6)
scripts/probes/*.sh        ← probe logic — agent แก้/สร้างผ่าน PR + selftest + review (L6)
scripts/probes/probe-registry.txt ← ทะเบียน + cover rows — เซ็นโดย operator เท่านั้น (L6)
scripts/check-done.sh · scripts/ci/local-gate.sh · scripts/ci/probe-gate.js ← ตัวรัน gate
.claude/agents/*.md · .claude/commands/*.md ← sub-agent specs / commands
.claude/skills/SUPERPOWERS-ATTRIBUTION.md (skills ที่ vendor มา) ← default only — CLAUDE.md ข้อใดก็ตาม ชนะ skill ที่ vendor มาเมื่อขัดกัน
```
## 8. ESCALATION — หยุดแล้วถามทันที (คงจาก v2 ทุกข้อ)
- ต้องแตะเงินจริง / refund / execute remittance
- probe ขัดกับ report ของ agent ใดๆ (เชื่อ probe, รายงานความขัดแย้ง)
- อยาก disable guardrail "ชั่วคราว" ไม่ว่าเหตุผลใด
- เจอ secret ใน git history — ห้ามแก้เงียบ ต้องรายงานก่อนเพราะของจริงคือ rotate key
- งานที่กำลังทำจะทำให้ ratchet counter เพิ่ม และหาทางเลี่ยงไม่ได้
