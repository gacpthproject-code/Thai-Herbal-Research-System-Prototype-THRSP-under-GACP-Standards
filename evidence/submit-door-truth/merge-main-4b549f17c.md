# รวม main 4b549f17c เข้า fix/submit-door-truth (2026-10-20)

- ก่อนรวม: หัวกิ่ง d8155a48a · main 4b549f17c · ฐานร่วม 73cda2d9e
- merge commit: e2f6f6cca (merge commit ไม่ใช่ rebase) · แก้ตัวชี้รหัสข้อผิดพลาดที่เลื่อนเพราะการรวม: d7a8a76d3
- main ที่รับเข้ามา: fix/review-loop-round-trip (นาฬิกาแก้ไขหยุดในตัวเขียนสถานะ, ประตูส่งกลับและ PUT /:id/revision เคลียร์บันทึกผู้ตรวจผ่าน withReviewNoteAnswered, cron หมดเวลาแก้ไขเขียนสถานะก่อนแถวกำหนดเวลา) และ fix/uploads-fail-closed (/uploads ปิดเป็นค่าตั้งต้นและผูกเจ้าของ, carDocuments เป็นคีย์ของเซิร์ฟเวอร์, ลบ resolveCarDocumentOwner) รวมถึง fix/hermetic-test-env และ governance ที่ main มีอยู่แล้ว

## ไฟล์ที่ชนกัน 4 ไฟล์

### apps/backend/shared/form-data-ownership.js
- กิ่งนี้: ลบ deny-list ทั้งชุด (stripServerOwnedKeys, pickServerOwnedKeys, applyClientFormData, mergeClientFormData) เพราะทุกประตูของผู้ยื่นเขียน formData ผ่าน allowlist เดียว `mergeWizardAnswers` (routes/api/helpers/application-constants.js) · เหลือแค่รายชื่อ SERVER_OWNED_FORM_DATA_KEYS
- main: เพิ่ม `carDocuments` ในรายชื่อคีย์ของเซิร์ฟเวอร์ และเพิ่ม `withReviewNoteAnswered` (ตั้ง `_lastReviewComment` เป็น null เมื่อผู้ยื่นส่งกลับ)
- ที่เก็บ: รายชื่อคีย์ของ main (มี carDocuments) · ฟังก์ชัน withReviewNoteAnswered กับตัวช่วย isPlainObject ที่มันใช้ · export เหลือ `withReviewNoteAnswered` และ `SERVER_OWNED_FORM_DATA_KEYS` · ไม่คืน deny-list เพราะหลังรวมแล้วไม่มีผู้เรียกเลย (grep ทั้ง apps/backend ไม่พบชื่อทั้งสี่)

### apps/backend/services/application-service/application-review-revision-methods.js
- กิ่งนี้: ตัวรวมคำตอบของประตู PUT /:id/revision ใช้ `mergeWizardAnswers` และตัวตรวจความครบใช้ `validateFilingCompleteness`
- main: ห่อ formData ที่จะเขียนด้วย `withReviewNoteAnswered` แทนการตั้ง `_lastReviewComment: null` เอง และย้ายการหยุดนาฬิกาแก้ไข (revisionDeadline.updateMany) เข้าไปในตัวเขียนสถานะ
- ที่เก็บ: `withReviewNoteAnswered({ ...mergeWizardAnswers(currentFormData, formData), ... })` · import ทั้งสองตัว · การลบ updateMany ของ main (รวมเข้ามาเองโดยไม่ชน) · ตัวตรวจ validateFilingCompleteness ของกิ่ง

### apps/backend/routes/api/applications/applications.js
- กิ่งนี้: ลบ import `stripServerOwnedKeys` (/prepare ใช้ mergeWizardAnswers แทน) และเลิกเก็บ `steps` ตอนส่งกลับ
- main: import `withReviewNoteAnswered` และห่อ formData ของการส่งกลับใน /submit
- ที่เก็บ: `const { withReviewNoteAnswered } = require(...)` ตัวเดียว · บล็อกส่งกลับใน /submit รวมได้เอง (ไม่มี steps และห่อด้วย withReviewNoteAnswered)

### HARNESS_LOG.md
- เก็บทั้งสองฝั่ง รายการของ main ก่อน แล้วตามด้วยรายการ U2 ของกิ่งนี้
- ตรวจด้วยสคริปต์: จำนวนบรรทัดแต่ละแบบ = ฐาน + ส่วนที่ main เพิ่ม + ส่วนที่กิ่งเพิ่ม พอดี (1,388 บรรทัด ขาด 0 เกิน 0)

## ไฟล์ที่ทั้งสองฝั่งแก้แต่ git รวมได้เอง
- `.gitleaksignore`: ทั้งสองฝั่งเพิ่มบรรทัดยกเว้นเดียวกัน (คำสั่ง 83) จึงเหลือบรรทัดเดียว ไม่ซ้ำ
- `apps/backend/shared/error-codes.js`, `docs/api/error-codes.md`, `__tests__/unit/application-review-revision-methods.test.js`, `__tests__/unit/applications-prepare-server-owned-fields.test.js`: รวมได้โดยไม่ชน

## รหัสข้อผิดพลาด
- `node apps/backend/scripts/extract-error-codes.js --validate`: 463 รายการตรงกันทั้งบน e2f6f6cca และ d7a8a76d3
- `--markdown` บน e2f6f6cca ได้ไฟล์เท่าเดิมทุกไบต์
- ชุด error-codes-source-pointers จับได้ 1 ตัวชี้ที่หลุด: DRAFT_NOT_LATEST ชี้ applications.js:919 แต่หลังรวมโค้ดอยู่ที่ :922 (main เองผ่านเพราะบรรทัดคอมเมนต์ :920 อยู่ในช่วง ±2) · แก้ใน d7a8a76d3 และสร้าง docs ใหม่ด้วย `--markdown`

## ชุดเทสต์ (heavy.sh, Postgres ชั่วคราวที่มีแค่ migration, PAYMENT_ADAPTER=mock)
รายชื่อ 92 ไฟล์: ชุดของ U2 (integration 28 ไฟล์ที่ U2 รัน และ unit ที่ U2 แก้), ชุดของ review-loop (round-trip, หยุดนาฬิกา, cron และ revision 13 ไฟล์), ชุด uploads ที่แตะ form-data-ownership.js หรือ carDocuments, ชุดที่ jest `--findRelatedTests` ชี้จากไฟล์ที่รวม และชุด error-code catalog กับตัวชี้

| หัว | integration | unit |
|---|---|---|
| e2f6f6cca (merge) | 37 ไฟล์ 346/346 | 55 ไฟล์ 688/689 (ล้ม 1 = ตัวชี้ DRAFT_NOT_LATEST) |
| d7a8a76d3 (แก้ตัวชี้) | ไม่ได้รันซ้ำ (เปลี่ยนแค่บรรทัดในแคตตาล็อกและ docs) | error-codes-source-pointers + error-codes-catalog 17/17 |

ที่ควรดู:
- officer-review-round-trip 10/10 (บน U2 ก่อนรวมล้ม 4 ชื่อ ซึ่งเป็น baseline ที่ review-loop แก้แล้ว)
- answer-doors-stop-the-revision-clock-real-postgres 12/12 · uploads-acl-follows-read-model-real-postgres 10/10
- ชุดของ U2: applicant-doors-write-only-declared-fields 10/10 · legacy-step-submit-refused 2/2 · applicant-submit-walk-web-and-mobile 2/2 · m1-submit-enforcement 4/4 · m2a-submit-enforcement 5/5

## หมายเหตุ
- รอบเทสต์เขียนทับไฟล์หลักฐานที่ track อยู่ใน `evidence/payer-block/after/` (ผลของเทสต์เอกสารการเงิน) จึงคืนไฟล์เหล่านั้นด้วย `git restore` ก่อน commit ไม่มีไฟล์ใดของงานนี้อยู่ในนั้น
- ไม่มี migration ใหม่จากฝั่งใด (`apps/backend/prisma` ไม่เปลี่ยนเทียบฐานร่วม)
