# PROMPT.md — W2 AUTONOMOUS FLOW (Orchestrator Mode)
======================================================
บทบาทของ context นี้: ORCHESTRATOR เท่านั้น
ถือ: QUEUE state, gate results, รายงานจาก sub-agent
ห้าม: เขียน/แก้โค้ดเองเด็ดขาด — งานโค้ดทุกชิ้น dispatch ผ่าน Task tool
หลักสูงสุด: agent เสนอ, script ตัดสิน — gate deterministic มีอำนาจสุดท้ายเสมอ
======================================================

## §1 BOOTSTRAP (บังคับ ก่อนทุกอย่าง)
1. อ่าน `CLAUDE.md` ทำ session-start protocol ครบ
2. ตรวจว่า agent files มีครบ: `.claude/agents/spec-reader.md`, `.claude/agents/implementer.md`, `.claude/agents/auditor.md` — ขาดตัวไหน = STOP รายงาน ห้ามทำงานแบบไม่มี auditor
3. ตรวจ skills ที่ต้องใช้ (ชื่อตามที่ติดตั้งจริงใน session): `writing-plans`, `test-driven-development`, `systematic-debugging`, `verification-before-completion`, `webapp-testing` + `frontend-design` (สำหรับ Q1), `gacp-design-tokens`, `thai-ui-copy` — ตัวไหนไม่มี ให้บันทึกใน orchestration-log ว่าไม่มี ห้ามเดาว่ามี
4. ยืนยัน git state: head = SHA ที่บันทึกใน `evidence/FLOW-baseline.txt` (anchor ตอนติดตั้ง: `dee5960` — bootstrap ต้องยืนยัน head สดอีกครั้ง), working tree สะอาด, CI ของ head เขียวจริง (run จบแล้ว ไม่ใช่ queued) — ไม่ตรงข้อใด = STOP
5. วัด ratchet baseline สด ณ ตอนนั้น (hardcode / todo / env-direct / dup-source) บันทึกลง `evidence/FLOW-baseline.txt` — ใช้เป็นเพดานของ Q1

## §2 QUEUE (เรียงลำดับ ห้ามข้าม ห้ามขนาน)

### Q1 — W2-03: Frontend Checkout UI (mock adapter) — PR แยกจาก #721
Scope:
- หน้า checkout flow: เริ่ม checkout → แสดงยอด state + platform + vat = total — ตัวเลขแสดงจาก backend response เท่านั้น **ห้ามคำนวณเงินฝั่ง client**
- Handle `409 CHECKOUT_ALREADY_IN_PROGRESS` → แสดงข้อความไทยจาก backend ไม่ใช่ generic error
- Loading / error / success / timeout states ครบ
- Mock adapter seam สลับด้วย env var (pattern เดียวกับ MOPH OAuth mock): fixtures ครอบ happy path + 409 + 5xx + timeout

Out of scope (ห้ามแตะ — เจอปัญหาให้ลง `BACKLOG-FOUND.md` ไม่แก้เอง):
- Backend ทุกไฟล์ | Real Stripe | Wave 3 ทุกส่วน
- Error-codes catalog (`CHECKOUT_*` family) — backlog แยกที่จดไว้แล้ว

PR: **ใบใหม่ base จาก branch ของ #721 — ห้าม push เข้า branch เดิมของ #721**

### Q2 — Wave 3 §4.1 — PR แยกอีกใบ
- เริ่มด้วย dispatch spec-reader อ่าน design doc §4.1 ฉบับจริงใน repo + โค้ดที่เกี่ยว — scope ของ Q2 มาจากผล spec-reader เท่านั้น
- ถ้า spec-reader ส่ง AMBIGUOUS ที่แตะเงิน / identity / สิทธิ์ / ต้องตัดสินใจเชิง product → STOP รายงาน รอคน — ห้ามเดา spec (Law: no fabricated spec)
- Base: ถ้า Q2 ไม่พึ่งโค้ด Q1 → base จาก main; ถ้าพึ่ง → stack บน Q1 แล้วระบุใน PR description

### Q-END
- จบ Q2 → เขียน `evidence/FLOW-REPORT.md` (§7) → **STOP เสมอ**
- ห้ามหางานเพิ่ม ห้าม refactor นอกสั่ง ห้ามวนต่อ

## §3 ต่อ 1 TASK: ลำดับ dispatch (ห้ามสลับ ห้ามข้าม)
1. **spec-reader** → รับ spec (CONFIRMED/INFERRED/AMBIGUOUS พร้อม file:line)
   - AMBIGUOUS ที่ material → STOP ตามกติกา §2
2. **Orchestrator เขียน PLAN** ลง `evidence/<task-id>/plan.md`: ไฟล์ที่จะสร้าง/แก้ทุกไฟล์, test list, จุดที่คาด RED แดงเพราะอะไร, test ที่คาดว่า "เขียวแต่กำเนิด" ต้องเปิดเผยตรงนี้ตาม Law 3.11 (pin ไม่ใช่ fix)
3. **implementer** → ทีละงานย่อยตาม PLAN (RED มีหลักฐานจริง → GREEN)
   - แนบ spec + scope + out-of-scope ให้ครบใน dispatch
   - implementer ห้ามอ่าน design doc เอง (กัน scope creep จากตีความเอง)
4. **auditor** (fresh context) → รับแค่ spec + diff + evidence
   - PASS → ไป gate | FAIL → กลับข้อ 3 พร้อม findings (นับ fix cycle)
5. **Gate scripts** (§4) → ผ่านครบ → REPORT → task ถัดไป

## §4 AUTO-ADVANCE GATE (ผ่านครบทุกข้อจึงไหลต่อ — script ตัดสิน)
1. `check-done.sh` คืน `DONE(probe:ratchet)`
2. CI ของ head ที่ push เขียวจริง รอ run จบ — queued/running ไม่นับ
3. Full suite ผ่าน baseline: fail ได้เฉพาะ `dataset-export-service.test.js` (environment-blocked เดิม, เขียวบน CI) — fail อื่นใด = ไม่ผ่าน
4. Ratchet ไม่ถอยจาก baseline ที่วัดสดตอนเริ่ม task นั้น (ไม่ใช้ตัวเลข pin)
5. Evidence ครบ: plan, red-output, test-output, ratchet-before-after, orchestration-log, report ใน `evidence/<task-id>/`
6. REPORT เขียน + commit แล้ว

ข้อใดไม่ผ่าน → fix cycle หรือ STOP ตาม §5 — orchestrator ไม่มีอำนาจ override

## §5 CIRCUIT BREAKER (STOP ทันที + รายงาน + ออกจาก loop)
- Fix cycle (auditor FAIL หรือ CI แดง) ครบ **3 รอบ**บน head/ประเด็นเดียวกัน แล้วยังไม่ผ่าน
- Full suite เกิด fail ใหม่ที่วินิจฉัยแล้วชี้ไปโค้ดนอก scope งานปัจจุบัน
- Ratchet ถอยและการแก้ต้องแตะไฟล์นอก scope
- เจอประเด็น security / data integrity / การเงินคำนวณผิด — ไม่ว่าเล็กแค่ไหน
- ต้องตัดสินใจที่ spec ไม่ระบุและผลต่างมีนัย (เงิน, identity, สิทธิ์)
- Task เดียวเกิน **MAX_HOURS=8** ชม. wall-clock หรือ loop เกิน **MAX_ITER=40** รอบ

เงื่อนไข STOP สะอาด: ไม่มี uncommitted changes ค้าง, branch push แล้ว, รายงานระบุ: ติดอะไร / ลองอะไรไปแล้ว / เสนอทางเลือกอะไร

## §6 HARD GUARDRAILS (ทุก role รวม orchestrator — ไม่มีข้อยกเว้น)
- ห้าม merge, deploy, force-push, แตะ `main` ตรง ๆ
- ห้าม fabricate ข้อมูล/spec/ผล test/คะแนน — ทุก claim มี file:line หรือ output จริง (verify-before-claim)
- ห้ามลบ/แก้ evidence ของงานก่อนหน้า
- ห้ามขยาย scope เกิน QUEUE — ของน่าทำลง `BACKLOG-FOUND.md`
- ห้าม agent ตัวใดแก้ gate scripts (`check-done.sh`, ratchet, CI config)

## §7 รายงาน (เขียนเพื่อคนที่ไม่ได้นั่งดู)
- ทุก dispatch → 1 บรรทัดใน `evidence/<task-id>/orchestration-log.md`: เวลา | role | mandate ย่อ | ผลกลับ (PASS/FAIL/สรุป 1 ประโยค)
- ต่อ task → REPORT format W2-02: Did / Found / Ratchet / Next / Evidence / Check-in
- จบ queue หรือ STOP → `evidence/FLOW-REPORT.md`: งานไหนจบ/ติดอะไร | PR ไหนเปิดรอ review | BACKLOG-FOUND สรุป | section แยก: **การตัดสินใจทั้งหมดที่ทำแทนคน พร้อมเหตุผล**
- ทุก PR: description ครบพอ review ได้โดยไม่ต้องถาม (scope, การตัดสินใจ, วิธี verify, ลิงก์ evidence)

## §8 CHECK-IN
- หลัง push ทุกครั้ง: ตั้ง check-in 20 นาที ตรวจ CI head ใหม่ + review comment + mergeability — แดง = fix cycle ผ่าน implementer (orchestrator ไม่แก้เอง)

## §9 สิ่งที่โหมดนี้ไม่ทำแทนคุณ
- Merge — ทั้งสอง PR จบที่ "เปิดรอ review" เสมอ
- อนุมัติ scope ใหม่นอก QUEUE — ต่อให้ auditor/spec-reader เสนอก็ลง backlog
