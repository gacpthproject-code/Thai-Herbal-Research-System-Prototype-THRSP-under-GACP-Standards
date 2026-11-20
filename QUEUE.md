# QUEUE — W2 AUTONOMOUS FLOW task state (orchestrator ถือไฟล์นี้ agent อื่นอ่านอย่างเดียว)

> กติกาเต็ม: `PROMPT-W2-AUTONOMOUS-FLOW.md` | ทุก dispatch ลง `evidence/<task-id>/orchestration-log.md`
> เรียงลำดับ ห้ามข้าม ห้ามขนาน — implementer มีได้ทีละตัวเดียวบน repo

| # | Task | Spec source | Status | Fix cycles | Branch/PR |
|---|---|---|---|---|---|
| Q1 | W2-03 — Frontend Checkout UI (mock adapter) | `PROMPT-W2-AUTONOMOUS-FLOW.md` §2 Q1 + amendments (orchestration-log 2026-08-02) | `DONE(probe:ratchet)` + auditor PASS — report: `evidence/W2-03/report.md` | 0/3 | PR #722 (draft, base branch #721) — retarget `main` หลัง #721 merge เพื่อให้ CI รัน |
| Q2 | Wave 3 §4.1 — payment schedule (milestone → invoice → due date) | `evidence/W3-41/spec-reader-report.md` + decisions (orchestration-log) | `DONE(probe:ratchet)` + auditor PASS — report: `evidence/W3-41/report.md`; gate CI = "รอ retarget" ตามคำสั่ง operator | 0/3 | อยู่ใน PR #722 (ต้อง stack บน mint fix — แยก PR ย้อนหลังต้อง force-push ซึ่งต้องห้าม) |
| Q3 | REOPEN-READINESS AUDIT (read-only — ห้ามแก้โค้ดทุกไฟล์) | `evidence/Q3-reopen-audit/mandate.md` | `DONE` — auditor PASS รอบ 3; report: `evidence/Q3-reopen-audit/report.md` | 2/3 | ไม่มี diff โค้ด — findings.md ครบหลัง integrate 3 รอบ; gate §4 ข้อ 5-6 ผ่าน |
| Q-END | เขียน `evidence/FLOW-REPORT.md` แล้ว **STOP** | `PROMPT-W2-AUTONOMOUS-FLOW.md` §2 | `DONE` — `evidence/FLOW-REPORT.md` (2026-08-03) | — | STOP: ไม่หางานต่อ รอ operator |

## Operator queue 2026-08-03 (post-FLOW-REPORT — WAVE PLAN Lane A)
| # | Task | Spec source | Status | Fix cycles | Branch/PR |
|---|---|---|---|---|---|
| R1 | TERMINAL-INTEGRITY HOTFIX (2 จุดจาก Q3): (a) bundle submit block terminal + error code ไทย (b) ปิดรู ESLint guard ครอบ upsert + แก้ seed-gacp | `evidence/Q3-reopen-audit/findings.md` (b)2b + (b)4 + operator instruction 2026-08-03 | `DONE` — merged PR #723 (`03ff765e`); status was stale `IN_FLIGHT` — corrected 2026-08-22 via `git log --grep` (05-BACKLOG.md §2-11) | 0/3 | Merged — PR #723 |
| R2 | SPECIAL REOPEN — **R2 FINAL 7 ข้อ** (no-expiry payment + correction clock 5 วันทำการ + notification บังคับ + append-only + auto-close cron + reopen โดย reviewer/auditor ไม่มีขาอนุมัติ) | **`evidence/R2-special-reopen/final-requirements.md` = ACTIVE เพียงแหล่งเดียว** (ทับ S1-S5/มติเดิม — ดู `legal-basis.md` + banner ใน `DECISIONS-CROSSREF.md`) | `PENDING` — **corrected 2026-08-22** (was `BLOCKED(operator:M3b-evidence)`; stale per 05-BACKLOG.md §2-11 — กลไก 1 all merged, the M3b-evidence blocker this label named is resolved by events below; the real remaining blocker is กลไก 2 (reopen), not started: `grep reopenedFrom apps/backend/prisma/schema/*.prisma` = 0 hits, verified 2026-08-22) · original narrative below, unedited (append-only) — **กลไก 1 เขียนโค้ดครบถึง M3b แล้ว merge เข้า main ทั้งหมด** (M1 #731 · M2 #732 · M3 #733 · M3b #734 ✅) แต่ **M3b ชน circuit breaker 3 cycles บนประเด็น F3 (evidence ไม่ใช่โค้ด)** → orchestrator STOP ตาม CLAUDE.md §7 ไม่ dispatch รอบ 4 · โค้ดผ่านการตรวจครบ 3 รอบ (runtime probe 22 เคส · sweep 44 call site · mutation 5 ตัว · RED reproduce ตรงชุด · gate 5 ตัวเขียว) — ที่ยังค้างคือความซื่อสัตย์ของ evidence pack 1 จุด (`M3b/notes.md:262` + เหตุผลที่ `:545`) ดู `M3b/audit-report-round3.md` · **M4 merged #789 (1cf11cb) — สถานะเดิมอ้าง probe ที่ไม่มีในทะเบียน (ดู HARNESS_LOG 2026-08-06 ข้อ (4) และ `reports/qc-evidence/2026-08-06-m4-m7-thaid.md:97`); แก้ให้ตรงรูปแบบเดียวกับ M5-M7 ที่อ้าง PR+sha ตามจริง · evidence pack ยังขาดตามรายงานเดียวกัน · M5 merged #797+#802 (88bd0a5, 9e16bf9) · M6 merged #798 (5272936) · M7 merged #799 (7ac4aaa) — กลไก 1 ปิดครบ 2026-08-06 · งานถัดไปที่ยังไม่เริ่ม: กลไก 2 (reopen) — เปิดได้เมื่อ operator เคาะ M3b F3 (dossier: `reports/pm/M3B-F3-DOSSIER.md`)** แผนเต็มใน `decisions-final.md` · ลำดับล็อก: กลไก 1 → กลไก 2 → AUTH-01 P3-P5 | **M3b 3/3 — STOP** (M1 0/3 · M2 0/3 · M3 2/3) | ทั้งหมด merged เข้า `main` แล้ว · follow-up = `feat/r2-m3b-followup` |

**คำตอบคำถามค้างจาก operator (2026-08-03) — ground truth:**
- **Reminder retry**: ส่งไม่ confirm → exponential backoff สูงสุด 3 ครั้ง → mark FAILED ลง reminder log (dedup key เดิมกันส่งซ้ำ) + surface รายการ FAILED ให้เจ้าหน้าที่ **ห้าม silent drop** → **งานใหม่ (แก้ payment-reminder-job ของ Q2)** ยังไม่อยู่ใน R1 scope — บันทึก backlog เป็น decided item รอ queue
- **EXPIRED = terminal** ยืนยัน (ตรง design R2 เปิดเคสใหม่ผูกเคสเก่า) — ใช้ `TERMINAL_STATUSES` (มี EXPIRED อยู่แล้ว) เป็น SSOT ใน R1a
- **Waiver-coexist + นิยาม role เจ้าหน้าที่**: ค้าง รอหนังสือหารือนิติกรกรมฯ — **ห้าม assume ใน implementation ใด ๆ** (R2 ธง L2/L4)

| AUTH-01 | LOGIN FULL: REBRAND + OAuth จริง (Health ID / Provider ID / ThaID) | `evidence/AUTH-01/mandate.md` (operator 2026-08-03 + **amendment: local login = transitional provider, §A0 authen-readiness audit ก่อน implement**) | `P2 ปิดแล้ว (auditor PASS, 0/3 cycles) — PR #730 รอ merge` · P3-P5 ต่อคิวหลัง R2 ตามลำดับล็อก — operator ปลด 2026-08-03: rebrand §C + mock adapter + Provider ID OAuth flow ตาม [P-OAUTH]; **E-4 ANSWERED** (เข้มสุด: cookie-only, ห้าม browser storage ทุกกรณี ยกเว้น UI state ล้วน); plan: `evidence/AUTH-01/plan.md` (P1-P5), implementer P1 dispatched บน `feat/auth-01-login`; **ยังหยุด**: linking Provider ID (D-MANUAL-HASHCID), ฝั่งเกษตรกร (รอเอกสาร Health ID ประชาชน), B1-CRED — crossref แล้ว: **APPLIED 6 ข้อ** (E-1..E-3, E-6..E-8) · คู่มือได้แล้ว: **ThaID 2 เล่ม** (BLOCKER-2 ฝั่ง ThaID ปิด — `pid` คืน CID) + **Provider ID OAuth Health ID 15 หน้า** ([P-OAUTH] ใน `manual-citations.md` — BLOCKER-2 ฝั่งเจ้าหน้าที่ตอบบางส่วน: `account_id`+`hash_cid`, ไม่มี CID plaintext, hash algorithm ไม่ระบุ) · เหลือ: เอกสาร Health ID ประชาชน (BLOCKER-2 ฝั่งเกษตรกร), B1-CRED (credentials ทุก provider) | **2/3 — ปิดแล้ว: auditor PASS รอบ 3** (cycle1: F1/F2/F3 → cycle2: F-NEW remediation string; ทั้งหมด mutation-verified) | P1 merged เข้า main แล้ว (#727, `bd2fd417`) — audit report: `evidence/AUTH-01/P1/audit-report.md` — `evidence/AUTH-01/{A0-authen-readiness-audit.md, A0-blockers.md, orchestration-log.md}` · **AUTH/IDENTITY: merge โดยมือคนเสมอ**; ธง B1-CRED/C1-THAID-DOC/D-MANUAL ในตัว |

## Circuit breaker (PROMPT §5)
- fix cycle = auditor FAIL หรือ CI แดง → dispatch implementer รอบใหม่พร้อม findings
- ครบ **3 รอบ**บน head/ประเด็นเดียวกัน → STOP | เงิน/security/data integrity (ธง CRITICAL จาก auditor) → STOP ทันที ไม่ใช่ fix cycle
- MAX_HOURS=8 ต่อ task | MAX_ITER=40 ทั้ง loop

## FLOW-REPORT (ปิด queue หรือ STOP)
`evidence/FLOW-REPORT.md`: งานไหนจบ/ติดอะไร | PR ไหนเปิดรอ review | BACKLOG-FOUND สรุป | การตัดสินใจทั้งหมดที่ทำแทนคน พร้อมเหตุผล

## STANDING RULES (operator สั่ง 2026-08-03 — มีผลกับทุก PR ตั้งแต่ PR ถัดไป)

### R-PR-1 — ทุก PR ต้องมีหัวข้อ "สรุปสำหรับ operator"
วางไว้**บนสุดของ PR body** ก่อนหัวข้ออื่นทั้งหมด · ภาษาไทย · **3 บรรทัด** ตามนี้เป๊ะ ·
**ห้ามใช้ศัพท์โค้ด** (ห้าม file:line, ชื่อฟังก์ชัน, ชื่อตาราง, ชื่อ endpoint, ชื่อ status constant) —
เขียนให้คนที่ไม่ใช่โปรแกรมเมอร์อ่านแล้วเข้าใจว่าเกิดอะไรขึ้นกับระบบจริง

```
## สรุปสำหรับ operator
1. ผู้ใช้จริงเห็นอะไรเปลี่ยน: <...>
2. ถ้าพลาด อะไรพัง กู้ยากแค่ไหน: <...>
3. มีอะไรที่ operator ต้องตัดสินใจไหม: <... หรือ "ไม่มี">
```

- บรรทัด 1 ต้องพูดจากมุมผู้ใช้ (เกษตรกร / เจ้าหน้าที่) ไม่ใช่มุมโค้ด — ถ้าผู้ใช้ไม่เห็นอะไรเปลี่ยนเลย ให้เขียนว่า "ไม่มีอะไรที่ผู้ใช้เห็นเปลี่ยน" แล้วบอกว่าทำไมถึงยังต้องทำ
- บรรทัด 2 ต้องประเมิน **ความยากในการกู้** ตรง ๆ (เช่น "ย้อนได้ด้วยการ revert ไม่มีข้อมูลเสีย" vs "ข้อมูลที่เขียนไปแล้วย้อนไม่ได้ ต้องแก้มือทีละราย")
- บรรทัด 3 ถ้าไม่มีให้เขียน "ไม่มี" ห้ามเว้นว่าง
- หัวข้อเดิมของ template (`.github/PULL_REQUEST_TEMPLATE.md`) ยังต้องกรอกครบเหมือนเดิม — R-PR-1 เป็นส่วน**เพิ่ม** ไม่ใช่ส่วนแทน

> หมายเหตุ: กติกานี้ควรอยู่ใน `CLAUDE.md` แต่ **agent แก้ CLAUDE.md ไม่ได้ (Law 3.12)** —
> diff ที่เสนอให้ operator merge เองอยู่ที่ `evidence/proposed-claude-md-diff-2026-08-03.md`

### R-R2-1 — งาน R2 ทุกกลไกต้องมี integration test บน Postgres จริง (operator สั่ง 2026-08-03)
**mock อย่างเดียวไม่นับผ่าน gate สำหรับงานชุด R2** — ต้องมี **อย่างน้อย 1 integration test ต่อกลไก**
ที่แตะ Postgres จริง:

| กลไก | ต้องมี integration test พิสูจน์ |
|---|---|
| cron ปิดเคส (M4/M5) | cron รันแล้วเคสถูกปิดจริงในฐานข้อมูล + marker/AuditLog ถูกเขียนจริง |
| append-only version (M7) | เขียนทับของเดิมไม่ได้จริงในระดับ DB (constraint/สร้างแถวใหม่) |
| legal hold (D-5) | ข้อมูลที่ถูก hold ไม่ถูกลบจริงเมื่อเส้นลบทำงาน |
| reopen (กลไก 2) | เปิดเคสใหม่ผูกเคสเก่าแล้ว **ยอดเงินรวมสองเคส = ยอดที่ควรจ่ายครั้งเดียว** (conservation pin ตาม D-1) |

- ที่มา: `INFRA REALITY CHECK 2026-08-03` — ทั้งรีโปมี integration test ที่แตะ Postgres จริงแค่ **2 ไฟล์**
  (`__tests__/integration/cert-issuance-atomicity-be-t1.test.js`, `optimistic-lock-wf-f7.test.js`)
  และทั้งคู่ `describe.skip` เองเมื่อไม่มี `DATABASE_URL` ⇒ **ยังไม่เคยรันจริงเลย**
- ขึ้นกับ **R-CI-1** (Postgres service container ใน CI) ก่อน ไม่งั้น test ใหม่จะ skip เงียบเหมือนสองตัวเดิม
- **`.skip` แบบมีเงื่อนไข `HAS_DB` ยังใช้ได้เฉพาะ local** แต่บน CI ต้องรันจริง — ถ้า CI รายงาน skipped
  ถือว่า **ไม่ผ่าน gate**

### R-CI-1 — CI ต้องมี Postgres จริง (operator สั่ง 2026-08-03)
`.github/workflows/ci.yml` ต้องมี Postgres service container + `DATABASE_URL` + `prisma migrate deploy`
+ `prisma generate` ในขั้น setup · **เกณฑ์ผ่าน: 2 integration test ที่ skip อยู่ต้องรันจริง
(ผล run ต้องไม่ใช่ skipped)** · รายละเอียด + สิ่งที่ operator ต้องตั้งเอง: `evidence/CI-POSTGRES/plan.md`

---

## SURVEY-AUDIT — สำรวจระบบ survey ทั้งระบบ (operator สั่ง 2026-08-04)
> **ตำแหน่งในคิว: ท้ายสุด หลัง AUTH-01-B2** — operator ระบุ "งานปัจจุบันเดินตามลำดับเดิม ห้ามแทรก"
> **read-only ห้ามแก้ ห้ามแตะโค้ด ห้ามเสนอ patch** — operator ตัดสินก่อนแล้วค่อยมีงานถัดไป
> ทุกข้อต้องมี `file:line` จากของจริง ไม่ใช่จากความจำหรือจากชื่อไฟล์

### 8 คำถามที่ต้องตอบ
1. **มีอะไรอยู่แล้วบ้าง** — model/ตาราง, endpoint, หน้า UI, เมนู · หรือมีแค่**เมนูเปล่า**ที่ยังไม่มีของหลัง
2. **ใครออกคำถาม** — มี admin UI สร้าง/แก้แบบสอบถามไหม หรือ hardcode / seed / ต้องแก้โค้ดทุกครั้ง
3. **ใครตอบ** — เกษตรกร? เจ้าหน้าที่? ตอบตอนไหนของ workflow (ผูกกับ stage ไหน) บังคับหรือสมัครใจ
4. **ใครดูผล** — มีหน้า dashboard/stats/รายงานไหม role ไหนเห็นได้ · หรือดูได้แค่ query DB ตรง
5. **Export/analytics** — export ได้ไหม (CSV/Excel) ใครกดได้ · **มี audit log ว่าใคร export ข้อมูลใครไปเมื่อไหร่ไหม**
6. ⚠️ **PII** — คำตอบผูกกับตัวบุคคลไหม (`userId`/CID/`applicationId`) หรือ anonymous ·
   ถ้าผูก อยู่ใน scope PDPA retention / legal hold หรือยัง
   (**หมายเหตุที่ต้องตรวจ**: `jobs/pdpa-retention-job.js` แตะ `prisma.user` อย่างเดียว —
   ถ้าคำตอบ survey ผูกบุคคลแต่อยู่คนละตาราง จะไม่ถูก anonymize เลย)
7. ⚠️ **ผลกระทบต่อการตัดสิน** — คำตอบมีผลต่อการรับรอง/คะแนน/การตัดสินเคสไหม ·
   ถ้ามี ต้องอยู่ใน **append-only + audit trail** เหมือน correction flow (R2 กลไก 1)
8. ⚠️ **ความยินยอม** — มีการขอ consent ก่อนเก็บไหม แจ้งวัตถุประสงค์การใช้ข้อมูลไหม

### รูปแบบผลลัพธ์
รายงานเดียว แยก **3 กอง**: **(ก) มีและใช้ได้** · **(ข) มีแต่ไม่ครบ** · **(ค) ยังไม่มีเลย**
ปิดท้ายด้วยข้อเสนอว่าอะไรควรเป็นงานถัดไป — **ข้อเสนอเชิงลำดับความสำคัญเท่านั้น ห้ามเสนอ diff**

### จุดตั้งต้นที่รู้แล้ว (ยังไม่ยืนยัน — ผู้ทำต้องตรวจเอง)
- `apps/web-app/src/config/constants.ts` มีลิงก์ `/health/surveys` อยู่ในเมนู (เห็นจาก System Integrity Check
  ที่ pin ว่า route นี้มีหน้าอยู่จริง) ⇒ **ต้องตรวจว่าหลังเมนูมีของจริงหรือเป็นเมนูเปล่า**
- `apps/web-app/playwright/*` มี spec ชื่อ `farmer-services-carpet` ที่ครอบหน้าบริการฝั่งเกษตรกร —
  อาจมีข้อมูลว่าหน้า survey ถูกทดสอบระดับไหน
- `prisma/schema/survey.prisma` ถูกอ้างถึงใน AUDIT/soft-delete registry drift มาก่อน ⇒ **มี model อยู่จริง
  อย่างน้อยหนึ่งตัว** ต้องไล่ว่ามีกี่ตัวและใครเขียน/อ่านบ้าง

---

## TRACE-AUDIT — สำรวจ seed-to-sale / track & trace ทั้งเส้น (operator สั่ง 2026-08-04)
> **ตำแหน่งในคิว: ต่อจาก SURVEY-AUDIT** — operator ระบุ "งานปัจจุบันเดินตามลำดับเดิม"
> **read-only ห้ามแก้ ห้ามเสนอ patch** — operator ตัดสินก่อน · ทุกข้อต้องมี `file:line` จากของจริง

### 8 คำถามที่ต้องตอบ
1. **INVENTORY** — model/ตาราง (`apps/backend/prisma/schema/trace.prisma` **ยืนยันแล้วว่ามีจริง** + ไฟล์อื่น
   ที่เกี่ยวข้อง เช่น `cultivation.prisma` `harvest.prisma` `farm.prisma` `herb.prisma`), service, endpoint,
   job, หน้า UI, QR generation/verification · **ครอบคลุมระดับไหน: ฟาร์ม / แปลง / ล็อต / ต้น (per-plant)**
2. **LIFECYCLE** — ติดตามได้ตั้งแต่ขั้นไหนถึงขั้นไหน: เพาะ → ปลูก → เก็บเกี่ยว → แปรรูป → จำหน่าย ·
   ขั้นไหนมีจริง ขั้นไหนขาด
3. **QR** — ใครสร้าง ใครสแกน สแกนแล้วเห็นอะไร (public หรือต้อง login) · QR ผูกกับอะไร (ล็อต/ต้น/ใบรับรอง) ·
   **มี verification ป้องกันปลอมไหม** (โยงบทเรียน #619: `documentHash` เป็น unkeyed sha256 ปลอมได้
   signature คือ non-repudiation จริงแต่ key ไม่เสถียร)
4. ⚠️ **ทำไมมองไม่เห็น** — มีทางเข้าใน UI ไหม · อยู่หลัง feature flag ที่ปิดอยู่ไหม ·
   มี route ที่ไม่มีลิงก์ชี้ถึงไหม (orphan route) — **ใช้ `scripts/ci/check-orphan-api-routes.js`
   ที่มีอยู่แล้ว** (ยืนยัน path แล้ว) และรายงานว่ามันครอบอะไร/ไม่ครอบอะไร
5. **เชื่อมกับ DTAM Next** — 13 จุด integration ที่พบก่อนหน้า (ฝั่ง backend ที่ AUTH-01 §C1 ระบุว่า
   **ห้ามแตะ** เพราะเป็น partner integration) ใช้ข้อมูลจาก trace ส่วนไหน · **เส้นนี้ทำงานอยู่จริงหรือ dormant**
6. **เชื่อมกับใบรับรอง** — ใบรับรอง GACP ผูกกับ trace record ไหม · ผู้บริโภคสแกน QR แล้วเห็นสถานะรับรองไหม
   **(operator ระบุว่านี่คือจุดขายจริงของระบบ)**
7. ⚠️ **PII/PDPA** — trace เก็บข้อมูลบุคคลอะไรบ้าง · อยู่ใน retention/legal hold scope หรือยัง ·
   **`jobs/pdpa-retention-job.js` แตะ `prisma.user` อย่างเดียว** ⇒ ถ้า trace เก็บข้อมูลบุคคลคนละตาราง
   จะไม่ถูก anonymize เลย (คำถามเดียวกับ SURVEY-AUDIT ข้อ 6 — ตอบแยกกันคนละระบบ)
8. ⚠️ **Integrity** — trace record แก้ย้อนหลังได้ไหม · **ถ้าได้คือปัญหาใหญ่**: ข้อมูลตามสอบต้อง append-only
   เหมือน correction flow (R2 กลไก 1) · ตรวจว่ามี constraint/trigger/version table ระดับ DB จริงไหม
   หรือพึ่งวินัยของโค้ดอย่างเดียว

### รูปแบบผลลัพธ์
รายงานเดียว แยก **3 กอง**: **(ก) มีและใช้งานได้จริง** · **(ข) มีแต่เข้าไม่ถึง/ไม่ครบ** · **(ค) ยังไม่มี**
ปิดท้าย: ข้อเสนอว่าอะไรควรเป็นงานถัดไปเพื่อให้จุดขายนี้ **"เห็นได้"** — เชิงลำดับความสำคัญเท่านั้น **ห้ามเสนอ diff**

---

## DEMO-READINESS — ทำให้ operator ตรวจเองได้ด้วยตา (operator สั่ง 2026-08-04) — **PRIORITY สูง**
> **ตำแหน่งในคิว: หลัง #744 merge (merge แล้ว `f5543d8a`) → ก่อน P2** ⇒ **เป็นงานถัดไปทันที**
> เป้าหมายที่ operator ระบุ: *"operator ตรวจเองได้ด้วยตา"* — ไม่ใช่รายงานให้ agent อ่าน
> **ห้ามแก้ปัญหาที่ตรวจพบเอง — operator ตัดสินก่อน** (ดูข้อยกเว้นเรื่อง seed ด้านล่าง)

### 1. STAGING WALKTHROUGH GUIDE — เอกสารเดียว **ภาษาไทย ไม่มีศัพท์โค้ด**
ผู้อ่านคือคนที่จะเปิดจอแล้วเดินตาม ไม่ใช่คนที่อ่านโค้ดได้
- **URL staging เข้ายังไง** — มี basic auth / VPN / allowlist IP ไหม ต้องขออะไรจากใคร
- **บัญชีทดสอบครบทุก role**: เกษตรกร 1 · reviewer · Audit · Account · Admin
  พร้อม **วิธี reset** เมื่อข้อมูลเละจากการลองกด
- **เส้นทางเดินทีละหน้าจอ**: ยื่นคำขอ → ชำระเงิน → ตรวจเอกสาร → แก้ไข → นัดลงพื้นที่ →
  ออกใบรับรอง → QR/trace
  **ทุกจุดต้องบอกว่า "ควรเห็นอะไร"** เพื่อให้ operator แยกออกว่าอะไรคือความผิดปกติ
- **ระบุชัดว่า flow ไหน "ยังไม่เปิด"** (อยู่หลัง feature flag / เป็น mock / provider จริงยัง `coming_soon`)
  จะได้ไม่เข้าใจผิดว่าพัง

> ⚠️ **จุดที่คำสั่งขัดกันเอง — ต้องให้ operator เคลียร์ก่อนถึงขั้นนี้**
> ข้อ 1 เขียนว่า *"ถ้ายังไม่มี ให้สร้าง seed พร้อมบอกวิธี reset"* (= เขียนโค้ด)
> แต่บรรทัดปิดท้ายเขียนว่า *"ห้ามแก้เอง operator ตัดสินก่อน"*
> **การอ่านที่ผมใช้จนกว่าจะมีคำสั่งใหม่**: สร้าง/เติม seed บัญชีทดสอบ **ทำได้** เพราะสั่งไว้ตรง ๆ
> และเป็น precondition ของทั้งงาน · ส่วน **ปัญหาที่ตรวจเจอในข้อ 2 ห้ามแก้** ต้องรอ operator
> ถ้าอ่านผิด ให้ operator สั่งแก้ก่อนเริ่มข้อ 1

### 2. DEMO-READINESS AUDIT — สมมติว่าพรุ่งนี้ต้องเปิดให้กรมฯ ดู
| # | หา | หมายเหตุ |
|---|---|---|
| ก | `DTAM Next` / placeholder / Lorem / TODO / **ข้อความอังกฤษปนที่ควรเป็นไทย** | มี grep-pin `dtam.?next` อยู่แล้วใน AUTH-01 §C1 scope FE — ใช้เป็นจุดตั้งต้น แต่ **backend 14 จุด = partner integration ห้ามนับเป็นข้อผิด** |
| ข | ปุ่ม/เมนูที่กดแล้วไม่ไปไหน หรือ 404 (orphan route) | ใช้ `scripts/ci/check-orphan-api-routes.js` (**ยืนยันแล้วว่ามีจริง**) และรายงานด้วยว่ามันครอบ/ไม่ครอบอะไร |
| ค | หน้าที่พังบนมือถือ | **เกษตรกรใช้มือถือเป็นหลัก** — ข้อนี้น้ำหนักสูงกว่าที่ตัวเลขบอก |
| ง | error ที่โผล่ stack trace / ศัพท์เทคนิคให้ผู้ใช้เห็น | เทียบกับ `shared/error-codes.js` + `error-translator.ts` ที่มี Thai fallback อยู่แล้ว |
| จ | seed ที่ดูไม่สมจริง (ชื่อ `test`, `12345`, lorem) | `scripts/seed-test-accounts.js` มี `loginId` ทรง `1111111111111` `2222222222222` — ตรวจว่าโผล่บนจอไหม |
| ฉ | **flow ที่ตันกลางทาง — เริ่มได้แต่จบไม่ได้** | ข้อนี้น่าอายที่สุดตอนสาธิต ควรไล่ด้วยการเดินจริงไม่ใช่การอ่านโค้ด |

### 3. VISUAL EVIDENCE PACK — จาก E2E ที่รันจริงบน CI
- screenshot ทุก step ทุก role เรียงตาม flow เป็นชุดเดียว + video/trace ถ้า playwright เก็บได้
- **ตรวจ #686 ก่อน** (screenshot pack 180 รูป ค้าง 3 สัปดาห์): ยังใช้ได้ไหมหรือต้องถ่ายใหม่
  · ข้อมูลที่มีแล้วใน `evidence/STALE-PR-REVIEW-2026-08-04.md`: ถ่าย 16 ก.ค. · main เดินไป **268 commits**
  ตั้งแต่นั้น รวม **rebrand §C ของ AUTH-01 ที่เปลี่ยนหน้า auth ทั้งชุด** ⇒ ภาพส่วนหนึ่งไม่ตรงแล้ว
  · operator ยังไม่ตัดสินเรื่อง #686 (ทางเลือก ก/ข/ค อยู่ในรายงานนั้น)

### 4. DATA READINESS — staging มีเคสให้เดินดูครบทุกสถานะไหม
ต้องมีของจริงให้กดดูทีละสถานะ: **รอชำระ · รอตรวจ · อยู่ระหว่างแก้ไข · ผ่าน · ปฏิเสธ ·
มีใบรับรอง + QR ที่สแกนแล้วใช้งานได้จริง**
ถ้าไม่ครบ → **เสนอ seed set สำหรับเดโม พร้อมวิธี reset กลับ** (ข้อนี้เข้าข่ายเดียวกับ seed บัญชีทดสอบ
ในข้อ 1 — ดูหมายเหตุเรื่องคำสั่งขัดกันด้านบน)
⚠️ เชื่อมกับข้อ 7: เคสเดโมต้องเป็นข้อมูลสมมติ **ห้ามใช้เคสของบุคคลจริง**

### 5. DEMO SCRIPT — ลำดับการโชว์ที่เล่าเรื่องได้
ตั้งแต่เกษตรกรยื่น จนสแกน QR เห็น trace · ระบุ **เวลาโดยประมาณต่อ step** และ **จุดที่ควรหยุดอธิบาย**
(ไม่ใช่แค่ลำดับคลิก — ต้องเป็นเรื่องเล่าที่คนฟังตามได้ว่าทำไมแต่ละขั้นถึงมีอยู่)

### 6. คำถามที่ผู้ชมจะถาม + คำตอบพร้อมหลักฐาน — **ตอบตามความจริง ห้ามเกินหลักฐาน**
> **กติกาครอบทุกข้อ (operator ยืนยัน 2026-08-04)**: คำตอบทุกข้อ **ต้องมี evidence รองรับ** (`file:line`
> / ผลรันจริง / artifact) · ข้อไหนไม่มีหลักฐาน ให้เขียนคำตอบตรง ๆ ว่า **"ยังไม่ได้วัด" / "ยังไม่ได้ตรวจ"**
> **ห้ามเขียนคำตอบที่ฟังดูดีแต่พิสูจน์ไม่ได้**
> เหตุผลที่ operator ให้: *เอกสารนี้จะถูกพูดต่อหน้าหน่วยงานราชการ — ความเสียหายจากการตอบเกินจริง
> สูงกว่าการตอบว่ายังไม่รู้มาก*
| คำถาม | ต้องตอบด้วยหลักฐานอะไร |
|---|---|
| ข้อมูลส่วนบุคคลปลอดภัยแค่ไหน | encryption-at-rest ของคอลัมน์ไหน · hash/HMAC lookup · PDPA retention + legal hold (`jobs/pdpa-retention-job.js`) · **และต้องบอกด้วยว่าอะไรยังไม่ครอบ** เช่น sweep แตะ `prisma.user` ตารางเดียว |
| ใบรับรองปลอมได้ไหม (QR verification) | ⚠️ **ระวังตอบเกินจริง** — บทเรียน #619: `documentHash` เป็น **unkeyed sha256 ⇒ ปลอมแล้ว recompute ได้** · signature คือ non-repudiation จริงแต่ key ยังไม่เสถียร ⇒ cert ทุกใบขึ้น amber ไม่ใช่เขียว · **ต้องตอบตามนี้ ห้ามพูดว่า "ปลอมไม่ได้"** |
| ระบบล่มแล้วยังไง | backup/restore ที่มีจริง (`pg_dump` ใน `deploy-production.sh`) · rollback ด้วย tag-swap · **ยังไม่มีอะไร = บอกว่ายังไม่มี** |
| รองรับผู้ใช้กี่คน | มีตัวเลข load test จริงไหม — **ถ้าไม่มี ห้ามเดา** ให้ตอบว่ายังไม่ได้วัด |
| เชื่อมระบบยืนยันตัวตนกลาง (Health ID / Provider ID / ThaID) แล้วหรือยัง | **ยัง** — AUTH-01 provider จริงทุกตัวยัง `coming_soon` (B1-CRED) · ที่เดินได้คือ local + mock IdP · ตอบให้ตรงว่าเชื่อมได้เมื่อได้ credentials |
| ข้อมูลไปหา DTAM Next อย่างไร | 13 จุด integration ฝั่ง backend — **ต้องตรวจก่อนว่า dormant หรือทำงานจริง** (คำถามเดียวกับ TRACE-AUDIT ข้อ 5) ห้ามตอบก่อนตรวจ |

### 7. ห้ามโชว์ — ทำเป็นรายการชัดเจน
- flow ที่ตันกลางทาง (ผลจากข้อ 2 ฉ)
- หน้าที่ยังไม่เสร็จ / อยู่หลัง flag ที่ปิด
- **ข้อมูลจริงของบุคคลจริง** — ทั้งบนจอ ทั้งใน screenshot ที่แจก และทั้งใน URL ที่อาจติดไปกับภาพ

### 8. ความเสถียรระหว่างเดโม — สิ่งที่จะเตะเราเองกลางทาง
- **rate limit** ที่อาจเตะผู้สาธิตเอง (กดเร็ว/สลับ role ถี่) — หา config จริงและ threshold
- **session timeout** — ระหว่างหยุดอธิบายยาว ๆ จะหลุด login ไหม
- ⚠️ **cron ที่อาจรันกลางเดโมแล้วเปลี่ยนสถานะเคสที่กำลังโชว์**
  **operator ยืนยัน 2026-08-04**: ถูกแล้วที่ไม่สรุปว่า auto-close มีอยู่ ⇒ **ต้องทำ inventory ของ cron/job
  ที่ลงทะเบียนจริงบน staging ให้ครบทุกตัว** ไม่ใช่ตรวจเฉพาะตัวที่นึกออก
  - ต่อตัวต้องระบุ: **ชื่อ job · `file:line` ที่ลงทะเบียน · เวลาที่รัน (cron expression + timezone) ·
    แตะตาราง/สถานะอะไร · จะเปลี่ยนสถานะเคสเดโมได้ไหม**
  - ผลลัพธ์ต้องตอบคำถามปลายทางให้ได้: **ช่วงเวลาไหนของวันที่ปลอดภัยที่สุดสำหรับเดโม**
  - ตัวที่ยืนยันแล้วว่ามี: **PDPA retention sweep 02:30 ICT** (`jobs/pdpa-retention-job.js`) —
    operator ระบุว่า **มีตัวอื่นให้ตรวจอีก** จุดตั้งต้นคือ `jobs/scheduler.js` (ตัวลงทะเบียน job)
  - **auto-close 5 วันทำการ**: R2 M1–M7 merged ครบ (M4 #789 · M5 #797+#802 · M6 #798 · M7 #799 — 2026-08-05/06) ⇒ auto-close ที่ลงทะเบียนจริงตอนนี้: correction-deadline (M4, `jobs/revision-deadline-checker.js`) **และ** payment-abandoned 30 วัน (M5, `jobs/payment-closure-job.js` 03:00 Asia/Bangkok) — ก่อนเดโมยังต้องตรวจจาก job ที่ลงทะเบียนจริงใน `jobs/scheduler.js` ไม่ใช่จากแผน
    ตรวจจาก job ที่ลงทะเบียนจริง ไม่ใช่จากชื่อไฟล์หรือจากแผน
- **staging เคยล่มไหม** — ดูจากบันทึกที่มี: disk 100% ทำ Redis เขียน AOF ไม่ได้ → auth 401 ทั้ง prod+staging
  (บทเรียนใน BACKLOG/CLAUDE เดิม) · มี prune ใน deploy script แล้วหรือยัง

### รูปแบบผลลัพธ์
**(ก) ต้องแก้ก่อนโชว์ — เรียงตามความน่าอาย** · **(ข) โชว์ได้เลย** · **(ค) ควรบอกล่วงหน้าว่า "ส่วนนี้ยังไม่เปิด"**
**ห้ามแก้เอง** operator ตัดสินก่อน

---

## PAYMENT-SCHEDULER REALITY CHECK — read-only (operator สั่ง 2026-08-04)
> **ตำแหน่งในคิว: หลัง #744 (merge แล้ว) → *ก่อน* DEMO-READINESS**
> เหตุผลที่ operator ให้: **เป็นข้อมูลตั้งต้นของ walkthrough guide** — เขียนคู่มือเดินจอไม่ได้
> ถ้ายังไม่รู้ว่าเงินกับคิวทำงานยังไงจริง ⇒ **งานนี้แทรกขึ้นมาเป็นลำดับแรกแทน DEMO-READINESS**
> **read-only ห้ามแก้** · ทุกข้อมี `file:line`

### 6 คำถาม
1. **Milestone** — มีกี่ตัวจริง ราคาเท่าไหร่ **mint ตอนไหนแต่ละตัว** (พร้อมกัน หรือ M2 mint หลัง M1 ผ่าน) ·
   ⚠️ **ถ้า mint พร้อมกัน: เคสที่ตกตอนตรวจเอกสารจะมีใบแจ้งหนี้ M2 ค้างไหม** — เป็นเงินค้างในระบบที่ไม่ควรมี
2. **Gate การชำระ** — ขั้นไหนบ้างที่ "ต้องจ่ายก่อนถึงเดินต่อ" · ตรงกับ **S0–S6** ตรงไหน
3. **Scheduler** — งานเข้าคิวอัตโนมัติเมื่อจ่ายผ่าน หรือมีคนกดรับ · **ใครเลือกวัน/ผู้ตรวจ/พื้นที่** ระบบจัดให้
   หรือคนจัด · **มี capacity/ปฏิทินผู้ตรวจไหม**
4. **นัดใหม่** — หลังลงพื้นที่ไม่ผ่าน นัดรอบใหม่ต้องจ่ายเพิ่มไหม (**โค้ดปัจจุบันทำอะไร** ไม่ใช่ควรทำอะไร) ·
   ⚠️ **ตรงกับมติ correction loop "วนไม่จำกัดครั้ง" หรือขัดกัน** — ถ้าขัด ต้องรายงานเป็นข้อขัดแย้งเชิงนโยบาย
5. **Zoom vs ลงพื้นที่** — เป็นสองทางเลือกจริงในระบบไหม · ราคาต่างกันไหม · ใครเลือก เลือกได้ตอนไหน
6. **สถานะเงินตอนนี้** — Stripe จริงหรือ `MockPaymentAdapter` · แยก **staging / production** ·
   **เกษตรกรจ่ายจริงได้หรือยัง**

### รูปแบบผลลัพธ์
- **flow เงิน + คิว ตั้งแต่ยื่นถึงออกใบรับรอง เป็นลำดับเดียว อ่านรู้เรื่องสำหรับคนไม่ใช่โปรแกรมเมอร์**
- แยกชัดว่า **อะไรทำงานจริง / อะไรยัง mock หรือ flag ปิด**
- **คำถามที่ต้อง operator ตัดสิน** — โดยเฉพาะข้อ 4 ถ้าโค้ดขัดกับมติ

### หมายเหตุขอบเขต (Law 3.4)
เป็นงานอ่านอย่างเดียวบนเส้นเงิน — **ห้ามแก้ตัวเลข ห้ามแตะ money mutation ใด ๆ** แม้พบว่าผิด
ให้ flag แล้วรายงาน

---

## ลำดับคิวปัจจุบัน — **SSOT ของลำดับงาน** (จัดใหม่รอบ MANDATE v2 · 2026-08-04)
> **2026-08-22 — SSOT ปัจจุบันคือ `reports/design-cleanup-2026-08-21/05-BACKLOG.md`** (214 work item ไม่ซ้ำ,
> ตรวจกับ HEAD จริง 2026-08-22) — บล็อกด้านล่างนี้หยุดอัปเดตตั้งแต่ 2026-08-06 และมีแถวเน่าที่พิสูจน์แล้ว
> (R1/R2 status แก้ข้างล่างแล้ว; A3/A7/A8/A9/A10/A12/D2/D5 ยังตรงกับ 05-BACKLOG ส่วนใหญ่ ไม่ต้องแก้ —
> ดูเลขข้อที่ตรงกันใน 05-BACKLOG.md §2/§3 ก่อนเชื่อบล็อกนี้) — คงบล็อกไว้เป็นประวัติ (append-only), ห้ามลบ
>
> **กติกา (operator ยืนยัน 2026-08-04)**
> 1. บล็อกนี้คือ **แหล่งความจริงเดียวของลำดับงาน** — ขัดกับที่อื่นเมื่อไหร่ **ยึดบล็อกนี้**
> 2. **ทุกครั้งที่มีการแทรกคิว ต้องอัปเดตบล็อกนี้ทันที** ในคอมมิตเดียวกับที่เพิ่มงาน
> 3. คำสั่งเก่าที่มีคำว่า **"งานถัดไปทันที" / "priority สูง" ถือเป็นโมฆะ** เมื่อบล็อกนี้ระบุลำดับใหม่
> 4. **หลักจัดใหม่ (mandate §6)**: งานที่ปิด gap บน Golden Path (`GAP-MAP.md`) มาก่อน · งานนอกเส้น
>    = เลื่อน (ระบุชัด ไม่ยกเลิก) · งานอิสระไม่ชนไฟล์ = parallel lane

### กอง A — ฐาน/ปรับปรุงของเดิม (ปิด gap Golden Path)
1. ~~**A1** CI Postgres service~~ — **DONE (verified บน main 2026-08-05)**: Postgres service `ci.yml:403-416`, DATABASE_URL/generate/migrate `:434-442`, 2 integration test อยู่ใน pattern `:487`, + guard step ตรวจ suite=4 skipped=0 passed>0 `:495-523` (ขยายจริงเกินแผน 2→4). QUEUE เดิมระบุ "ยังไม่ทำ" = stale (เลขาจับได้). B2/R-R2-1 เดินต่อได้เลย
1.0 ✅ **A11-STEP1 DONE (main เขียวแล้ว)** — `deploy-staging`/`promote-deploy-branch` push-trigger ปิดแล้วผ่าน **PR #775 (merged `3f8b7f8c`)**: staging = `workflow_dispatch` only, promote = `if:false` รอ A11 ADR · ยืนยันด้วย CI run 30954259018 = **success, ทั้งสอง job skipped** · เหลือ A11-STEP2 = ADR deploy pipeline เต็ม (Infra+Senior) — promote เปิดคืนได้เมื่อมี ADR + operator สั่ง
2. **A0-AUDIT-EMISSION** (ใหม่จาก GAP-MAP theme 1) — sweep `onAudit` ที่ Golden-Path writers ละไว้ (money settle, PASS/cert, submit, schedule) — **coverage สูงสุด: เป็น column ที่หายบน ~10/14 hop**
3. **A7** AUTHZ SWEEP — role×endpoint ทุกตัวบน Golden Path + negative test จริง + จับ canonical-writer bypass (assignment/schedule/final-approvals)
4. **A8** NOTIFICATION AUDIT — 4 จุด: จ่ายสำเร็จ(GP-4) · ขอแก้(GP-5b) · นัดตรวจ(GP-7) · ใบออก(GP-9) — พิสูจน์ส่งจริงบน staging
5. **A9** VERIFY-PAGE SECURITY — /verify: rate limit, เดา URL/เลขใบ, PDPA over-expose, QR ปลอม, no-trace (GP-10)
5.1 **D2** (operator ruling 2026-08-04) — ย้าย cert+QR mint จาก write `AUDIT_PASSED` ไป write `CERTIFIED` atomic กับ issuance hook · ปิด dual-source Law 3.6 (ใบ live แต่สถานะไม่ใช่ CERTIFIED) — GP-9
5.2 **D5** (operator ruling 2026-08-04) — signing **fail-closed** ตอน issuance: key ล่ม = ไม่ออกใบ ไม่มีใบ amber — GP-9
5.3 ✅ **D-1-CONSERVATION ยืนยันแล้ว (operator 2026-08-05)** → **ปลด R2 กลไก 2 (reopen)**: pin = **per-milestone conservation** (แต่ละงวด = ยกมา[ไม่เก็บซ้ำ] XOR เก็บใหม่ · ห้ามงวดที่ทั้งยกและเก็บ=จ่ายซ้ำ · ห้ามงวดที่ไม่ยกและไม่เก็บ=หลุด · conservation เหนือทางเลือกคน ไม่ใช่เหนือยอดตายตัว) · **งาน**: `reopenedFrom` (self-relation FK) + reopen endpoint + conservation test · **เงื่อนไข (operator)**: conservation test ต้องรันบน **Postgres จริง (หลัง A1 ✅)** + **negative case จงใจสร้างงวดซ้ำ/หลุด → test ต้องแดง** (mock ไม่นับ, R-R2-1) · Tier C (เงิน) → autopilot เตรียมถึง draft · **ลำดับล็อก: กลไก 1 ✅ ปิดครบ (M1-M3b + M4 #789 + M5 #797/#802 + M6 #798 + M7 #799 merged ทั้งหมด — 2026-08-05/06) → กลไก 2 (D-1 ปลดการตัดสินแล้ว + lock order ปลดแล้ว · เงื่อนไขคงเหลือ: operator เคาะ M3b F3 + CI ฟื้นเพื่อปิด gate R-R2-1) → AUTH-01 P3-P5** — D-1-CONSERVATION ยืนยัน = ปลด decision blocker ของกลไก 2 ไม่ใช่ปลดให้ข้าม M4-M7
6. **A10** build version/SHA บนหน้าเว็บ — **ยก priority** (`/api/version` คืน hardcoded `'3.0.0'` วันนี้ = โกหก)
7. **A3** Grafana/Prometheus alert จริง (DB auth fail, container restart, health แดง)
7.1 🚩 **A12 (backup ไม่มี schedule อัตโนมัติเลย — ความเสี่ยงสูง)** — `/etc/cron.d/gacp-backup` ไม่เคยติดตั้ง (operator ยืนยันบน host); `install-cron.sh` มีแต่ไม่มี deploy path เรียก ⇒ ระบบไม่เคยมี DB backup อัตโนมัติ · **fix**: PR #783 (wire install-cron เข้า deploy-production.sh + CI guard `check-backup-cron-wired.js`) · **immediate**: `sudo /opt/gacp-platform/scripts/backup/install-cron.sh` · **host alert** (>25h stale) = A3 · runbook G3 แก้แล้ว (เลิก assume cron มี)
8. **A11** ADR deploy pipeline (Infra+Senior) — main→deploy/production→image→container ใครสั่ง เกณฑ์อะไร ผูก freeze/Tier C
9. **A2** compose เลิก hardcode DATABASE_URL → env_file · **A5** แก้ runbook DB §12.7 · **A4** ลด root ของ loop · **A6** retire seed-test-data.js — (A2/A4/A5 = Tier C / ผูก #762)

### กอง B — คิวเดิม (เดินหลัง A1)
10. ✅ **B1 DONE (2026-08-05)** — รายงานเต็ม `reports/pm/B1-cross-reference.md` (spot-verified กับโค้ด+git @ main 266cb35b). **สรุป**: จาก 8 E-item + 24 D-label เหลือจริงแค่ (ก) มติ operator 1 ข้อที่ block งานใหม่ = **D-1-CONSERVATION** (per-milestone conservation pin — gate เดียวของ R2 กลไก 2; ไม่ block M4-M7) · (ข) รอเอกสาร/creds = E-5, B1-CRED, D-MANUAL-HASHCID · (ค) decided-but-unbuilt = R2 M4-M7, E-1, E-6, E-4/P3 · (ง) hygiene: M3b F3 ruling, D-6/L2 closure note
    > **stale rows ที่ B1 พบ — เชื่อ report แทน**: (1) `:22` waiver-coexist half **RESOLVED** แล้ว (legal-flags-cleared) เหลือแค่ครึ่ง role-definition (2) `:24` "APPLIED 6 ข้อ E-1..E-3,E-6..E-8" = overstate — E-1/E-6 **ยังไม่ implement** (policy answered แต่ code=0) (3) `:24` "#730 รอ merge" = stale, merged `52cd0bc8` แล้ว · **flag needs-a-look**: PR #746 (audit-round3 บอก REJECT แต่ git แสดง merge `0e093d0a`) — reconcile ก่อนเชื่อ narrative ใด
11. **B2** R2 กลไก 1→2 · M4→M7 (แต่ละกลไก integration test บน Postgres จริง ≥1 — หลัง A1)
12. **B3** AUTH-01-B1 ThaID sandbox e2e (parallel กับ B2 ได้) · **B4** งาน 4 ถอดค่าปริยาย (หลังปลด freeze, Tier C) · **B5** seed demo (รอ operator prisma generate + รหัส login)

### กอง C — เส้นทาง production
13. **C1** Payment Wave 3-4 PromptPay-only — **acceptance = GAP-MAP §7 (S1-S5) + D2/D3/D5**: FE Stripe confirm step (สร้างใหม่ — วันนี้ไม่มี QR) · PI expiry ผูก invoice due date + cron cancel + ขอ QR ใหม่ (S1/S2) · email บังคับตอน checkout (S3) · overpayment append-only adjustment ผ่าน Account (S4) · log-and-hold unknown event (S5) · mock-in-prod guard · trim promptpay-only (D3 ทำก่อนแยกใบ) · split invoicing 2 งวด · drain-then-purge (retire slip = D4 รอ operator cutover) — live parts: `BLOCKED(operator:762-run)`
- **D3** trim `['promptpay','card']`→`['promptpay']` — ✅ **DONE merged #774** (bba7b71 / merge 266cb35, 2026-08-04) — ข้อความ "ทำทันที" เดิม = stale (กันงานซ้ำ)
- **C1 WIRING CHECKLIST (operator สั่ง 2026-08-05 — ส่งให้ operator ทำรอบเดียว ไม่ใส่ล่วงหน้าทีละชิ้น)**: (1) `STRIPE_SECRET_KEY` = rk_test (`config/stripe.js:44`) · (2) **`STRIPE_WEBHOOK_SECRET`** = whsec_ จาก Stripe dashboard (`config/stripe.js:56`) — ⚠️ **ไม่ใช่ `PAYMENT_WEBHOOK_SECRET`** (คนละตัว! payment webhook เดิม/Ksher — ใส่ whsec_ ผิดช่องได้ง่าย) · (3) `STRIPE_CHECKOUT_ENABLED='true'` (`config/stripe.js:35`) = **สวิตช์เปิด payment จริง = Wave 3 decision ไม่ใช่แค่ใส่ key** · (4) test mode ก่อน · ⚠️ **ตัวแปรเงิน 3 ชื่อที่ห้ามสับสน**: `STRIPE_SECRET_KEY`≠`PAYMENT_SECRET_KEY`(`payment-constants.js:56`) · `STRIPE_WEBHOOK_SECRET`≠`PAYMENT_WEBHOOK_SECRET`
14. **C2** DTAM Next pull API (contract=Tier C) · **C3** PDPA retention + legal hold · **C4** AUTH-01-B2 MOPH (adapter+mock เตรียมได้) · **C5** UAT checklist กรม → go-live gate

### เลื่อนออกจากเส้นหลัก (ไม่ยกเลิก — mandate §6 "ระบุชัด")
- **DEMO-READINESS**, **PAYMENT-SCHEDULER REALITY CHECK** (ทำไปแล้วบางส่วน — ผล fold เข้า GAP-MAP), **SURVEY-AUDIT**, **TRACE-AUDIT** → หลัง Golden Path เส้นหลักเขียว (เป็น EXT/นอกเส้น)
- probe P2/P3/P4 (settle-webhook-only/ratchet/no-secret เสนอ diff) → คงไว้เป็น backlog probe-precision (Law 3.12)

### เหตุผลที่ย้าย (mandate §6 บังคับระบุ)
- A1 ขึ้นเป็นอันดับ 1: ทุกงาน B2/R-R2-1 ต้องมี Postgres จริงใน CI ก่อน ไม่งั้น test skip เงียบ
- A0-AUDIT-EMISSION แทรกเป็นอันดับ 2 (งานใหม่จาก WALK): GAP-MAP พิสูจน์ว่า audit column หายเกือบทุก hop = ปิดทีเดียวคุ้มสุด
- A7/A8/A9/A10 ขึ้นก่อน B/C: เป็น gap โดยตรงบน Golden Path (mandate: gap-closing มาก่อน)
- DEMO/SURVEY/TRACE-AUDIT ลงไปเป็นนอกเส้น: ไม่ปิด gap บนเส้นหลัก (mandate: นอกเส้น=เลื่อน)

**งานค้างนอกลำดับ (ไม่บล็อกใคร)**: fix รอบ 2 grep-pin A3 · survey shared file-walker
**PR เปิดรอ operator (ตรวจสดจาก GitHub 2026-08-06)**: #560 docs stale-pull race · #766 seed demo (draft — title ระบุ BLOCKED) · #680 herb relabel (LIVE prod, ค้าง ~26 วัน) · #554 docs uploads gotchas (แตะ CLAUDE.md → operator merge เท่านั้น) · #461 CSP beacon (ค้าง ~51 วัน — ต้อง rebase หรือปิด) · #818 work plan (draft) — รายการเดิมของแถวนี้ (#769/team-structure/GAP-MAP+requeue) merge ไปหมดแล้ว; #769 ดู L-077 (merged-but-unwired)
