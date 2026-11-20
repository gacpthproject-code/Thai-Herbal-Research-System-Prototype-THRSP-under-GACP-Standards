# R2 — คำตัดสินปิด gap ทั้งหมด (operator 2026-08-03, verbatim + confirm รอบสอง)
> ปิดหมวด 3 ของ `gap-report.md` ครบ 9 ข้อ + มติใหม่ PAYMENT CLOSURE + ยืนยัน carry-scope
> **ลำดับ implement ที่สั่ง: กลไก 1 (correction loop) → กลไก 2 (reopen) — AUTH-01 P3-P5 ต่อคิวหลัง ไม่สลับ**
> supersession: PAYMENT CLOSURE **ทับ FINAL ข้อ 1 บางส่วน** (pending ยังไม่มี expiry ราย invoice — แต่เคสค้างเกินเกณฑ์ถูกปิดแบบยกเลิก) · D-2 **ยกเลิกกติกา "แก้ไม่เกิน 3 ครั้ง"** ถาวร

## คำตัดสิน (verbatim)

**D-1**: reopen = ฟรี (เปิดเคสเดิมต่อ ไม่ start billing chain ใหม่) / เคสยกเลิก/ไม่เข้าข่าย reopen = ยื่นคำขอใหม่ปกติ จ่ายใหม่กรอกใหม่ — สอง path แยกขาด test pin
→ **ยืนยันรอบสอง = ทาง (ก)**: เปิดเคสใหม่ผูก `reopenedFrom`, เคสเก่า terminal ตลอดไป, ฟรี — ขอบเขต carry:
- **Carry** = ข้อเท็จจริงว่างวดใดชำระแล้ว (paid milestones) ยกมาเป็น reference ของเคสใหม่ เพื่อ (1) ไม่ mint invoice ซ้ำสำหรับงวดที่จ่ายแล้ว (2) ไม่ start billing chain ใหม่ (3) เคสใหม่เดินต่อจาก stage ที่เคสเก่าตกได้เลย
- **ไม่ carry** = ตัว Invoice/Payment records ของเคสเก่า ยังผูกเคสเก่าตามเดิม ห้ามย้าย ห้าม mutate (append-only + สมการเงินเดิมไม่แตะ) — เคสใหม่อ้างผ่าน reopenedFrom เท่านั้น
- ถ้าเคสใหม่เดินไปถึงงวดที่เคสเก่ายังไม่ได้จ่าย → mint invoice ใหม่ตามปกติในเคสใหม่ (ราคา ณ ปัจจุบัน)
- **Test pin**: reopen แล้วยอดเงินรวมที่เกษตรกรจ่ายทั้งสองเคสรวมกัน = ยอดที่ควรจ่ายครั้งเดียวพอดี — ห้ามจ่ายซ้ำงวดใดงวดหนึ่ง และห้ามหลุดงวดใดงวดหนึ่ง

**D-2**: ยกเลิกกติกา "แก้ไม่เกิน 3 ครั้ง" — ถอน `SUBMISSION_THRESHOLD` + `RESUBMISSION` fee, grep-pin no reference, อัปเดตข้อความ `APPLICATION_EXPIRED` ตาม D-1

**D-3**: reopen-eligible = เฉพาะเคสปิดโดย cron R2 marker `closedReason=CORRECTION_DEADLINE_EXPIRED` — writer เก่า/auto-cancel = BACKLOG แยก

**D-4**: role ตาม stage + assigned-only: reviewer ที่ถือเคส (ตกขั้นตรวจเอกสาร) / Audit ที่ถือเคส (ตกขั้นลงพื้นที่) — role อื่นหรือคนใน role ที่ไม่ได้ถือเคส = ปฏิเสธ test pin

**D-5**: `legalHold`/`retainUntil` EXPAND — เอกสารความจำนง + reopen note ติด hold อัตโนมัติ, `detachAllByUploader` ข้าม hold, ระยะเก็บพ่วงถามนิติกร

**D-6**: append-only ครอบ `applications.js:892-943` + review-revision merge → version/supersede เฉพาะ correction flow

**D-7**: โค้ด waiver ห้ามแตะ (L4) — แก้เฉพาะ template โฆษณา waiver เป็นข้อความกลาง REVERSIBLE

**D-8**: นาฬิกา 5 วันทำการเริ่มที่ transaction บันทึกผล+ออกจดหมาย (atomic — ออกจดหมายไม่ได้ = transition ไม่สำเร็จ)

**D-9**: extend notification เดิม `kind=OFFICIAL_LETTER` เก็บถาวร ไม่สร้าง entity ใหม่ — visibility ตาม case-access เดิม

**PAYMENT CLOSURE (มติใหม่ แก้มติ "ค้างไม่จำกัด" เดิม)**: เคสค้างจ่ายเกิน 30 วันปฏิทินหลัง due date + reminder ครบ 3 ตัว → cron ปิดเป็นยกเลิก — marker แยกจาก correction-expiry (`PAYMENT_ABANDONED`) ไม่เข้าข่าย reopen: กลับมา = ยื่นใหม่จ่ายใหม่ — **ตัวเลข 30 วัน REVERSIBLE** pending คำตอบกรม พ่วงคำถามเข้าชุดนิติกร

## คำถามชุดนิติกร (สะสมจากคำตัดสินรอบนี้ — operator ถือ)
1. ระยะเก็บ (`retainUntil`) ของเอกสารความจำนง + reopen note (D-5)
2. เกณฑ์ 30 วัน PAYMENT CLOSURE (ยืนยัน/แก้ตัวเลข)
3. ของเดิม: L4 waiver coexist · L3 carry-over เนื้อหาคำขอ

---

## คำตัดสินเพิ่ม 2026-08-03 — TERMINAL_DECISION letter (ปิดธงจาก M2, verbatim)

**REJECT terminal ต้องมีจดหมาย** — template แยก `OFFICIAL_LETTER` ชนิด `TERMINAL_DECISION` (คนละชุดองค์ประกอบกับ correction letter):

องค์ประกอบบังคับของ terminal letter:
1) ผลการพิจารณา (ไม่ผ่าน/ไม่รับรอง) + stage ที่ตัดสิน
2) เหตุผลประกอบ (จากบันทึกผลของเจ้าหน้าที่ — **field บังคับ ไม่ใช่ optional**)
3) สิทธิ์ของผู้ยื่น: ยื่นคำขอใหม่ได้ (flow ปกติ จ่ายใหม่ตาม D-1)
4) ข้อความสิทธิ์โต้แย้ง/อุทธรณ์คำสั่งทางปกครอง — ใช้ template กลาง placeholder ไว้ก่อน (ระยะเวลา/ช่องทางอุทธรณ์ที่แน่นอน = พ่วงถามนิติกรในชุดเดิม เพราะขึ้นกับกฎหมายเฉพาะของการรับรอง GACP) — **ห้าม fabricate เลขวัน/ช่องทางเอง** ระหว่างรอใช้ข้อความ:
   > "ทั้งนี้ ท่านมีสิทธิ์โต้แย้งคำสั่งตามที่กฎหมายกำหนด สอบถามรายละเอียดได้ที่ <ช่องทางติดต่อกรม>"

- **ไม่มีกำหนดส่ง** (เคส terminal ไม่มี deadline ให้ใคร)
- **Atomic** กับ transition เดียวกับ correction letter (D-8 หลักเดิม): ออกจดหมายไม่ได้ = REJECT ไม่สำเร็จ
- **เก็บถาวร legal hold ตาม D-5 อัตโนมัติ** (จดหมายชนิดนี้คือหลักฐานคำสั่งทางปกครองตัวจริง)

→ เข้าแผนเป็น **M3b** (ถัดจาก M3 — ใช้โครง template/จุด mint เดียวกับ M2/M3)
→ **คำถามชุดนิติกรเพิ่มรายการที่ 4**: ระยะเวลา + ช่องทางอุทธรณ์คำสั่งทางปกครองของการรับรอง GACP (ได้คำตอบ → แทน placeholder ที่จุดเดียวใน template)
→ หมายเหตุ orchestrator: ความ "เก็บถาวร" ได้จาก M1 แล้ว (kind ยกเว้นทั้ง 3 เส้นลบ); คอลัมน์ `legalHold` อย่างเป็นทางการมากับ D-5 EXPAND ในกลไก 2 แล้ว terminal letter ติด hold อัตโนมัติ — ถ้าต้องการคอลัมน์ hold บน Notification เร็วกว่านั้น operator สั่งได้

## แผนกลไก 1 (correction loop) — sub-tasks เรียง dependency
- **M1 — OFFICIAL_LETTER (D-9)**: EXPAND `Notification.kind` (default ค่าเดิม) + ยกเว้น 3 เส้นลบเฉพาะ kind นี้ (cleanup `job-scheduler.js:88-106` / PDPA `pdpa-erasure-service.js:715` / opt-out `notification-service.js:401-415`) + test pin ทั้งสามเส้น
- **M2 — atomic decision+letter (D-8)**: จุดเขียนคำตัดสินทุก surface (canonical `workflow-transitions-handler.js`, CAR branch, `PATCH /reject` `application-workflow-handlers.js`) mint จดหมายใน tx เดียวกับ status write — จดหมายล้ม = transition ล้ม (RED pin) + เนื้อจดหมายครบ: ผลไม่ผ่าน/รายการประเด็น/กำหนดส่ง/ช่องทาง — พึ่ง M1
- **M3 — round counter ต่อ stage + SSOT เลข 5 (FINAL ข้อ 2)**: append รายรอบ (EXPAND — ไม่ทับ `RevisionDeadline` row เดิม), เลขครั้งเข้าไปในจดหมาย M2, ยุบแหล่งเลข 5 ให้เหลือ config เดียว
- **M3b — TERMINAL_DECISION letter (คำตัดสิน 2026-08-03 ข้างบน)**: template แยก 4 องค์ประกอบ (เหตุผลเป็น field บังคับ — ไม่มี = throw = REJECT ล้ม), atomic กับ REJECT transition, ไม่มีกำหนดส่ง, placeholder อุทธรณ์รอนิติกร — พึ่ง M2 (จุด mint) + M3 (stage vocab)
- **M4 — cron marker + audit (D-3)**: `revision-deadline-checker` เขียน `closedReason=CORRECTION_DEADLINE_EXPIRED` (unified marker ใหม่) + `onAudit` hook (hash-chain) — writer เก่า 4 ตัว + `/api/cron/auto-cancel` **ไม่แตะ** → ลง BACKLOG-FOUND
- **M5 — PAYMENT CLOSURE cron**: job ใหม่โครงเดียวกับ `payment-reminder-job` (idempotent, dedup, Thai calendar) — เงื่อนไข: pending >30 วันปฏิทินหลัง due (config REVERSIBLE) + reminder log ครบ 3 type → ปิดเคส marker `PAYMENT_ABANDONED` + audit + จดหมาย (kind M1) — ไม่เข้าข่าย reopen (pin)
- **M6 — D-2 ถอน dead config**: ลบ `SUBMISSION_THRESHOLD`/`RESUBMISSION` + grep-pin no-reference + แก้ `APPLICATION_EXPIRED` message ตาม D-1/D-7 (ข้อความกลาง REVERSIBLE — โค้ด waiver ไม่แตะ)
- **M7 — append-only correction records (D-6)**: version/supersede เอกสารเกษตรกร + formData merge เฉพาะ correction flow — EXPAND-before-CONTRACT
> กลไก 2 (reopen — D-1/D-3/D-4/D-5 + reopenedFrom + list view + conservation pin) เริ่มหลังกลไก 1 ปิด
