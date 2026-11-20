# fix/filing-legs-truth: ขาการยื่นแก้ไขอ่านนาฬิกาของสถานะตัวเอง และทุกประตูใช้กฎชุดเดียว

- brief: `~/work/state/reviews/brief-filing-legs-truth.md` (ข้อ f/F1, F2, c/C1, B2 ของการตรวจอิสระ `unit2-and-manual-delta-review-48815f6db.md`) · ฐาน 48815f6db (fix/submit-doors-same-gates)
- ทุกการรันผ่าน `~/work/state/heavy.sh` บน Postgres ชั่วคราวของงานนี้ (127.0.0.1:55640/gacp_flt, 159 migrations) · PAYMENT_ADAPTER=mock · ไม่มีค่าลับใน argv · กุญแจลงนามส่วนตัว (SIGNING_KEY_DIR)
- บันทึกการตัดสินใจ: `decisions.tsv`

## ข้อบกพร่องและการแก้

| ข้อ | เดิม | แก้ที่ | พิสูจน์ด้วย |
|---|---|---|---|
| F1 นาฬิกาผิดตัว | ขา CAR_PENDING ของ POST /submit อ่าน revisionDueAt ของรอบเอกสาร คำขอที่มีค่าเก่าค้างกลายเป็น EXPIRED ขณะที่ /:id/car ตอบ 200 | `services/application-service/correction-deadline-guard.js` ขั้นเดียวที่ทุกประตูเรียกผ่าน `judgeFiling`: อ่าน `correctionDueAtOf(status, formData)` (REVISION_REQUESTED → revisionDueAt, CAR_PENDING → carDueAt) แล้วค่อยแถว RevisionDeadline ที่ยังเปิด · ขา CAR_PENDING ของ /submit ถูกลบ (หลักฐาน CAR ยื่นพร้อมไฟล์ที่ /:id/car เท่านั้น ตามคำสั่ง 27) · wizard ใน CAR_PENDING บันทึกคำตอบแล้วพาไปหน้าส่งหลักฐาน | `filing-legs-read-their-own-clock-real-postgres` กลุ่ม CAR_PENDING 4 ข้อ + กลุ่มเลยกำหนด 2 ข้อ · mutant MA |
| F2 ข้ามกฎเอกสาร | ขา REVISION_REQUESTED ของ /submit ไม่ตรวจว่าเอกสารที่เจ้าหน้าที่ขอถูกแทนที่แล้ว | `services/application-service/requested-papers.js` กฎเดียวใน `judgeFiling` ทั้งสองประตู · รอบที่ขอแก้คำตอบโดยไม่ขอเอกสารผ่านได้ทั้งสองประตู (เดิมประตู resubmit ปฏิเสธ "ไม่พบรายการเอกสาร") | กลุ่ม REVISION_REQUESTED 6 ข้อ (ซอง 409 REVISION_INCOMPLETE เท่ากันทั้งสองประตูแบบ toEqual) · mutant MB |
| นาฬิกาค้าง | revisionDueAt ไม่เคยถูกล้างหลังตอบรอบ | `withRevisionAnswered` (เดิม withReviewNoteAnswered) ล้าง `_lastReviewComment`, `revisionDueAt`, `revision_due_at` ในการเขียนเดียวกับสถานะ ทั้งสองประตู | ข้อ "with the paper replaced" ทั้งสองประตู |
| C1 ผู้ติดต่อหน้างาน | การ์ดแก้ไม่ได้ใน CAR_PENDING ทั้งที่ประตู CAR เรียกร้องผู้ติดต่อ และลงแปลงซ้ำนัดได้จากสถานะนั้น | `shared/site-contact-window.js` เพิ่ม CAR_PENDING, CAR_REVIEWING (การนัดลงแปลงซ้ำพาคำขอกลับไป AUDIT_CONFIRMED พร้อมวันนัด กฎวันนัดเดิมจึงคุมต่อ) | `applicant-keeps-the-site-contact-current` ข้อใหม่ · mutant MC |
| B2 โค้ดตาย | mergeMasterSteps / normalizeStepPayload ไม่มีผู้เรียกจริง คอมเมนต์อ้างด่านที่ลบแล้ว | ลบทั้งสองฟังก์ชันและ 13 รายการใน jest.mock · buildStepResponse เลือกอาเรย์ไฟล์เองโดยผลลัพธ์เท่าเดิม | ชุด unit 23 ไฟล์ที่แตะ |

การยกเลิกเพราะเลยกำหนดบันทึกเป็นการกระทำของระบบทั้งสองนาฬิกา (actorRole system) ในธุรกรรมเดียวกับการปิดแถว RevisionDeadline เหมือน cron และ sweep · รหัสใหม่ `CAR_DEADLINE_EXCEEDED` (ประตู CAR เดิมตอบเลยกำหนดโดยไม่มีรหัส) · `--validate` 463 รหัสตรงกัน

## ลำดับ commit (เทสต์ที่ล้มมาก่อนการแก้)

ดู `git log 48815f6db..HEAD` · 0f1bbf60f คือเทสต์ RED · การลบโค้ดตาย (B2) และหน้าต่างผู้ติดต่อ (C1) ตามมา · แล้วจึงการแก้หลักฝั่ง backend · แล้ว web · แล้วหลักฐาน

## ผลรัน (`runs/`)

- `red-on-48815f6db.summary.txt`: เทสต์ใหม่บนโค้ดฐานที่ไม่ได้แก้ (git archive): filing-legs ล้ม 10/12 (ตัวควบคุม 2 ข้อผ่าน) · site-contact ล้ม 1/6
- `green-doors.summary.txt`: บนต้นไม้ที่แก้แล้ว filing-legs 12/12 · site-contact 6/6 · answer-doors 10/10 · filing-doors 17/17
- `mutants.summary.txt`: MA (CAR_PENDING กลับไปอ่านนาฬิกาแก้ไข) ล้ม 2 ข้อ · MB (ตัดกฎเอกสารออกจาก judgeFiling) ล้ม 1 ข้อ · MC (หน้าต่างผู้ติดต่อไม่มี CAR_*) ล้ม 1 ข้อ · ต้นไม้คืนค่าหลังทุก mutant
- `blast-radius.summary.txt`: 22 ชุด integration ที่แตะประตูเดียวกัน 272/272
- `confirm-db78890e3.summary.txt`: หัวกิ่งหลังรวม main dabc31f07 (งานอุทธรณ์ U1+U2): filing-legs 12/12 · site-contact 6/6 · answer-doors 10/10 · filing-doors 17/17 · unit ที่ใช้นาฬิกา CAR ร่วมกับตัวเปิดรอบของ main (correction-deadline-guard, onsite-correction-has-one-opener, correction-round, auditor-decision-car-deadline-guard, requested-papers, revision-resubmit-door) 60/60 · tier-check เทียบ main TIER=C · ratchet PASS · --validate 468
- `unit-touched.summary.txt`: unit 23 ไฟล์ 345 ข้อ (2 ข้อที่ล้มรอบแรกเป็นเทสต์เอง แก้แล้วผ่าน) · web 57/57 · eslint สะอาด

## หน้าจอจริง (`screens/`)

จับบนหัวกิ่งที่รวม main แล้ว (db78890e3) ด้วย `screens/capture.mjs` (Chromium ของ Playwright ที่ติดตั้งไว้แล้ว) บน backend จากต้นไม้นี้ (127.0.0.1:18340) และ `next dev` (127.0.0.1:3040) ต่อ Postgres ชั่วคราว ผู้ยื่นและคำขอ CAR_PENDING ที่เคยผ่านรอบเอกสารมาก่อน seed ด้วย `screens/seed.js` (ค่าลับลงไฟล์ 0600 ไม่พิมพ์) · ผลเดินใน `screens/walk.json`

| ภาพ | สิ่งที่เห็น |
|---|---|
| `edit-step6-390x844.png`, `edit-step6-1440x900.png` | wizard ขั้นที่ 6 ของคำขอ CAR_PENDING: กล่องเหตุผลของเจ้าหน้าที่ ข้อความ "คำขอนี้รอหลักฐานการแก้ไขข้อบกพร่องจากการตรวจแปลง เมื่อบันทึกคำตอบที่แก้แล้ว ระบบจะพาคุณไปหน้าส่งหลักฐาน" และปุ่ม "บันทึกคำตอบ แล้วไปส่งหลักฐานการแก้ไข" แทนปุ่มส่งคำขอ |
| `car-page-390x844.png`, `car-page-1440x900.png` | หลังกดปุ่ม ระบบพาไป `/health/applications/<id>/car` หัวข้อ "ส่งเอกสารแก้ไข (CAR)" พร้อมหมายเหตุของเจ้าหน้าที่และช่องแนบหลักฐาน สถานะคำขอยังเป็น CAR_PENDING (บันทึกคำตอบผ่าน /draft ไม่ได้ยื่น) |

ไม่มี overflow แนวนอนทั้งสองขนาด (walk.json `horizontalOverflowPx` 0) · รอบแรกของผู้ทำงานคนก่อนจับหน้า CAR ขนาด 1440x900 ติดโครงรอโหลด (heading อ่านได้เป็น footer) จึงเพิ่มการรอหัวข้อจริงใน capture.mjs แล้วจับใหม่ทั้งสองขนาด · ข้อสังเกตนอกขอบเขต: แถบหัว wizard แบบ sticky ที่ 390px ตัดคำ "แก้ไขคำขอรับรอง GACP" เป็นสี่บรรทัด (ของเดิม ไม่ได้แก้ในหน่วยนี้)

## สิ่งที่ยังเปิด

- ประตู resubmit ไม่เขียน CorrectionSubmissionVersion ขณะที่ขา REVISION_REQUESTED ของ /submit เขียน (ต่างกันที่บันทึก ไม่ใช่กฎ)
- cron รายชั่วโมง `revision-deadline-checker.js` และ `correction-deadline-sweep.js` ยังเป็นผู้เขียน EXPIRED อีกสองตัวที่มีรูปแบบของตัวเอง
- การรวมกับ feat/appeal-u1-u2 (รวมแล้วเป็น main dabc31f07 และ merge เข้ากิ่งนี้ที่ db78890e3 ชนเชิงข้อความเฉพาะ HARNESS_LOG.md และ error-codes.md ที่สร้างใหม่): ตัวเปิดรอบ CAR ใหม่ประทับ carDueAt/car_due_at/carRequest.dueAt และแถว RevisionDeadline ด้วยวันครบกำหนด CAR ขั้นอ่านนาฬิกาของกิ่งนี้อ่านตราประทับก่อน แถวที่เปิดอยู่ทีหลัง จึงใช้ด้วยกันได้ · ไฟล์ร่วมมีแค่ error-codes.js (เพิ่มคนละตำแหน่ง)
