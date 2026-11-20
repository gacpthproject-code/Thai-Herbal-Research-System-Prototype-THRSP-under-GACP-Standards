# fix/submit-doors-same-gates (ขั้นที่ 01 หน่วยที่ 2): ทุกประตูที่พาคำขอเข้าคิวรันด่านชุดเดียวกัน

- brief: `~/work/state/reviews/brief-step01-unit2.md` และ `brief-step01-unit2-takeover.md` (รับงานต่อ 2026-10-20 ผู้ทำก่อนหน้าหยุดเพราะโควตาเมื่อ 2026-10-14 โดยยังไม่ commit อะไร)
- ฐาน: d8155a48a (fix/submit-door-truth ก่อนรวม main) · รวม fix/submit-door-truth 18c6e9ac9 (ที่รวม main 4b549f17c แล้ว) ใน 249683156
- ทุกการรันผ่าน `~/work/state/heavy.sh` บน Postgres ชั่วคราวของงานนี้ (127.0.0.1:55531) · PAYMENT_ADAPTER=mock · ไม่มีค่าลับใน argv

## ลำดับ commit (เทสต์ที่ล้มมาก่อนการแก้เสมอ)

| commit | อะไร |
|---|---|
| b3b9c461f | เทสต์ใหม่ `filing-doors-run-one-gate-list-real-postgres` (17 ข้อ) + `test-support/filed-application.js` |
| 8114c4238 | m2a AC1 บุคคล / AC3 ปิดกฎ ตรวจที่ตัวตนของกฎ (ข้อ 4) |
| 0826c8d5e | ด่านชุดเดียว `judgeFiling` ที่ /submit, /:id/revision-resubmit, /:id/car และ requireConsent ที่สองประตูหลัง (ข้อ 2) |
| 7baa2f60b | ผู้ติดต่อหน้างานบังคับกับคำขอรูปเก่าด้วย (ข้อ 3) |
| 61e32a940 | ลบ PUT /:id/revision ทั้งสองขา (ข้อ 1) |
| 27f1dbdba | /draft และ /prepare เลิกรับ steps แบบเก่า, GET /draft เลิกส่ง steps (ข้อ 5) |
| f11e8b345 | แก้ไฟล์เทสต์ #67 ที่ร่างเดิมตัดไม่หมดจน parse ไม่ผ่าน |
| 646b9dc2f, cdd200cc0, 2688bd79e | เทสต์ประตูกู้ของผู้ดูแล แล้วด่านในตัวเขียนสถานะ (409 FILING_IS_THE_APPLICANTS) · ถอดออกใน d873e7d44 (ดูหัวข้อด่านในตัวเขียนสถานะ) |
| 249683156 | รวม fix/submit-door-truth 18c6e9ac9 |
| 3c08b493a, 96174d3f8 | ตัวชี้รหัสข้อผิดพลาดหลังรวม + คอมเมนต์ที่ยังอ้าง submitRevision |
| e996acade, 6b3fd7f1d | รอบ no-comments (ลบ 50 เขียนใหม่ 1) + deslop (stepPrerequisiteMessage, NO_CONTACT) |
| d873e7d44 | ถอดด่านในตัวเขียนสถานะและเทสต์ของมัน |
| b9c1e3ea1 | รวม fix/submit-door-truth bbfb9f382 (หลักฐาน gate ของ coordinator) |
| 35bc84cc6 | fixture ของชุดเทสต์ main/U2 ที่ขับประตูยื่นซ้ำ ให้ตรงกฎใหม่ |

## RED บนโค้ด d8155a48a (commit b3b9c461f)

`runs/door-red-b3b9c461f.summary.txt` · คำตอบจริงของแต่ละประตู `runs/door-answers-red-b3b9c461f.json`: ล้ม 14 ผ่าน 3 (ตัวควบคุม)

| กรณี | คำตอบบนโค้ดเดิม | สถานะหลังกด |
|---|---|---|
| PUT /:id/revision ขา DRAFT | 200 | PENDING_DOC_FEE (ไม่มีใบเสนอราคา ไม่มีคำรับรอง) |
| PUT /:id/revision ขา REVISION_REQUESTED | 200 | ASSIGNED_FOR_REVIEW |
| revision-resubmit: เอาติ๊กพื้นที่ออก / รูปเก่าไม่มีผู้ติดต่อ / วัตถุประสงค์ MEDICAL / ไม่มีคำรับรอง / สมาชิกไม่ให้ความยินยอม | 200 ทุกกรณี | ASSIGNED_FOR_REVIEW |
| car: เอาติ๊กพื้นที่ออก / รูปเก่าไม่มีผู้ติดต่อ / ไม่มีคำรับรอง / ไม่ให้ความยินยอม | 200 ทุกกรณี | CAR_REVIEWING (เก็บไฟล์ CAR ไว้) |
| car: วัตถุประสงค์ MEDICAL | 422 APPLICATION_NOT_JUDGEABLE (ผิดรหัส) | CAR_PENDING |
| /submit รูปเก่าไม่มีผู้ติดต่อ (ยื่นครั้งแรก / ยื่นซ้ำ) | 200 | PENDING_DOC_FEE / ASSIGNED_FOR_REVIEW |

m2a เดิมบนทะเบียนกฎจริง 189 แถว: AC1 บุคคล และ AC3 ปิดกฎ ล้ม (`runs/m2a-old-on-189-rule-register.summary.txt`) · ฉบับใหม่ 5/5 ทั้งทะเบียนจริงและทะเบียนว่าง

## GREEN ทีละ commit (`runs/per-commit-sequence.summary.txt`)

เทสต์ประตู 17 ข้อ + ไฟล์เทสต์ที่ commit นั้นแตะ บนฐานข้อมูลเดียวกัน:
- 0826c8d5e (ด่านชุดเดียว): เทสต์ประตูผ่าน 11/17 ที่เหลือคือ PUT 2 ข้อ (ข้อ 1) และผู้ติดต่อหน้างาน 4 ข้อ (ข้อ 3) · a0-pr2 ล้ม 4 ชื่อซึ่งเป็นชื่อ baseline ของ main · โครงสร้าง `submit-doors-answer-every-gate-refusal` ล้ม 1 เพราะประตู PUT ยังรันด่านเอกสารเองอยู่ จนลบใน 61e32a940
- 7baa2f60b (ผู้ติดต่อหน้างาน): 15/17 เหลือ PUT 2 ข้อ
- 61e32a940 (ลบ PUT): 17/17 · ไฟล์เทสต์ #67 parse ไม่ผ่าน (ร่างเดิมตัดไม่หมด) แก้ใน f11e8b345
- 27f1dbdba (steps เก่า): 45/45

## ด่านในตัวเขียนสถานะ (ปุ่มกู้ของผู้ดูแล)

คำถามจาก brief: ตาราง ALLOWED_FORCE_STATUSES ของประตู force ปิดช่องนี้ได้เองหรือไม่ ถ้าไม่ได้ มีประตูนอกตารางที่ต้องใช้ด่านในตัวเขียนสถานะหรือไม่ (คำสั่ง 31: ผู้ดูแลตัดสินแทนบทบาทอื่นไม่ได้ แต่ยังกู้คำขอที่ค้างเพราะระบบผิดพลาดได้)

- ตาราง ALLOWED_FORCE_STATUSES เป็นรายการ "ปลายทาง" ล้วน ไม่รู้สถานะต้นทาง ตัด PENDING_DOC_FEE / ASSIGNED_FOR_REVIEW / CAR_REVIEWING ออกจากตารางจะปิดการกู้ที่ถูกต้องไปด้วย (เช่น SUBMITTED→PENDING_DOC_FEE ที่ค้างระหว่างสองจังหวะของการยื่น)
- `POST /api/provider/applications/:id/workflow-transitions` แบบ force ไม่อ่านตารางนี้เลย (workflow-transitions-handler.js) จึงเป็นประตูนอกตาราง
- วัดก่อนแก้ที่ 646b9dc2f (`runs/rescue-doors-answers-red-646b9dc2f.json`): ทั้ง 5 ประตู force-status, PATCH status, status-override, workflow-transitions force และ revert-last-transition ตอบ 200 และพาคำขอจาก DRAFT / REVISION_REQUESTED / CAR_PENDING เข้า PENDING_DOC_FEE / ASSIGNED_FOR_REVIEW / CAR_REVIEWING ทั้ง 14 กรณี (ร่างที่ไม่เคยยื่นกลายเป็นรอชำระโดยไม่มีคำรับรองและไม่มีใบเสนอราคา) · ตัวควบคุม SUBMITTED→PENDING_DOC_FEE 200
- ผู้เดินขาเหล่านี้นอกประตูผู้ยื่น (grep): webhook และ cron เขียนเป็น SYSTEM ไปสถานะชำระแล้ว / EXPIRED · ต่ออายุยื่นผ่าน /submit · e2e-controller เขียน PENDING_AUDIT_FEE เป็น SYSTEM · สคริปต์ heal เขียน CERTIFIED · ประตูมอบงาน (DOC_FEE_PAID→ASSIGNED_FOR_REVIEW) ไม่ได้ออกจากสถานะที่ผู้ยื่นแก้ได้ · ไม่มีผู้เดินในผลิตภัณฑ์รายใดโดนด่านนี้
- ลองแก้ที่ตัวเขียนสถานะ (cdd200cc0): บุคคลที่ไม่ใช่ผู้ยื่นเดินขา DRAFT→SUBMITTED/PENDING_DOC_FEE/DOC_FEE_PAID, REVISION_REQUESTED→ASSIGNED_FOR_REVIEW, CAR_PENDING→CAR_REVIEWING ไม่ได้ (409 FILING_IS_THE_APPLICANTS) · หลังแก้ทั้ง 14 กรณี 409 คำขออยู่ที่เดิม การกู้ SUBMITTED→PENDING_DOC_FEE ยัง 200 (`runs/rescue-doors-answers-green-cdd200cc0.json`)
- ชุดเทสต์เต็มบน 6b3fd7f1d วัดผลกระทบได้ว่าขัดกับการออกแบบที่ main รวมแล้ว: `application-status-writer-stops-the-revision-clock` ปักว่า "ผู้ดูแล force REVISION_REQUESTED→ASSIGNED_FOR_REVIEW เป็นการกู้ ไม่ใช่การตอบ" (review-loop รอบ 2) และ WF-F7 ห้าข้อของ `application-status-writer` เดิน DRAFT→SUBMITTED โดยไม่ระบุบทบาท
- ตัดสิน: ถอดออก (d873e7d44) ตามข้อ 2 ของ brief เพราะผลกระทบเป็นเรื่องนโยบาย (ขาไหนนับเป็นการกู้ตามคำสั่ง 31) ไม่ใช่แค่ fixture และตรวจให้ครบไม่ทันในเวลา · ช่องที่วัดแล้วยังเปิดอยู่บน main และกิ่งนี้ เป็นงานหน่วยถัดไป · probe เพิ่มเติม (`runs/probe-force-skips-6b3fd7f1d.json`): force จาก DRAFT ไปสถานะหลังจากนั้นถูกด่านงวดชำระปฏิเสธ (409 MILESTONE_NOT_PAID) แต่ REVISION_REQUESTED→PENDING_AUDIT_FEE และ CAR_PENDING→AUDIT_CONFIRMED ผ่าน 200

## ทางเดินประตูจริง (`runs/walk-35bc84cc6.json`)

backend ของหัว 35bc84cc6 บน 127.0.0.1:18331 (ตรวจด้วย ss ว่าฟังแค่ loopback) ฐานข้อมูลชั่วคราว:
- เว็บ: บันทึกร่างครั้งแรกระบุผู้ถือ 200 · อัปโหลด 2 ใบ 200 · บันทึกอัตโนมัติพร้อมนาฬิกา 200 · /prepare 200 · ยื่นพร้อมคำรับรอง 200 PENDING_DOC_FEE
- PUT /:id/revision: 404 ROUTE_NOT_FOUND
- ผู้ตรวจเอกสารขอเพิ่ม → REVISION_REQUESTED (รอบที่ 96174d3f8 ซึ่งยังมีด่านในตัวเขียนสถานะ ผู้ดูแลกด force-status ได้ 409 FILING_IS_THE_APPLICANTS)
- ผู้ยื่นเอาติ๊กพื้นที่ออกแล้วส่งกลับ: 422 APPLICATION_INCOMPLETE ขั้น 2 · ติ๊กคืนแล้วส่งกลับ 200 ASSIGNED_FOR_REVIEW
- รอบ 2 ส่งกลับผ่าน /submit: 200 ASSIGNED_FOR_REVIEW · แถวสุดท้ายมี declarationsAcceptedAt และ serverRequirementSnapshot

## ชุดเทสต์เทียบ main

ชุดเต็มรอบแรกบน 6b3fd7f1d (ผ่าน heavy.sh ฐานข้อมูลชั่วคราวที่มีแค่ migration, PAYMENT_ADAPTER=mock, รันในโปรเซสเดียว): หน่วยความจำ 3 GB หมดหลังรันไป 1,087 จาก 1,123 ชุด (`full-6b3fd7f1d` ไม่มีรายงาน JSON) · ชุดที่ล้ม 25 ชุด แยกตามสาเหตุ:
- ชื่อ baseline ของ main 77eb1503 (16 ชื่อ integration): a0-pr2 (1) 4 ชื่อ, onsite-decision-mint 2 ชื่อ, status-writer-audit-default (F3) 1 ชื่อ · m1/m2a ผ่าน
- สภาพแวดล้อมของรอบนี้: กุญแจลงนามใน /tmp ชนกับ worktree อื่น (approver-decision-tools, public-verify-scope, redesign-p0, onsite-evidence-unfreeze, final-approval-audit-fail-closed, ใบรับรองใน onsite) · PAYMENT_ADAPTER=mock ทับเทสต์หน่วยของ Stripe (stripe-checkout-engine, checkout-*) · puppeteer หมดเวลา (finance-paper-text, invoice-documents-fit-one-page) · pool รอธุรกรรม (certificate-number-allocation) · document-precheck/extract หมดเวลา
- ด่านในตัวเขียนสถานะ: application-status-writer WF-F7 5 ข้อ และ stops-the-revision-clock 1 ข้อ → ถอดด่านใน d873e7d44
- fixture เก่าที่ไม่ผ่านกฎใหม่ของกิ่งนี้: officer-review-round-trip, rule-change-return-to-applicant, renewal-wizard-holder-gate, renewal-takes-the-short-document-check, the-farmer-can-answer-the-defect-list, submit-requires-declarations → แก้ใน 35bc84cc6

รอบยืนยันหัวเทียบหัวควบคุม (`runs/verify-head-vs-control.summary.txt`): ชุดที่ล้มหรือไม่ถึงในรอบแรก บวกชุดของประตู ด้วยกุญแจลงนามส่วนตัว (SIGNING_KEY_DIR) บนฐานข้อมูลใหม่ที่มีแค่ migration
- หัว 35bc84cc6 integration 26 ชุด: ล้ม 8 ชื่อ = 7 ชื่อ baseline ของ main (a0-pr2 4, onsite-decision-mint 2, status-writer-audit-default F3 1) + holder-write-doors-witness 1 ชื่อ (fixture รูปเก่าไม่มีผู้ติดต่อหน้างาน แก้ใน cc8f63100 แล้วรันซ้ำบน cc8f63100: witness + เทสต์ประตู 20/20 `runs/witness-and-doors-cc8f63100.summary.txt`)
- หัว 35bc84cc6 unit/อื่น 40 ชุด: ล้ม 4 ชุด 13 ชื่อ ทั้งหมดเป็น Stripe/checkout (stripe-checkout-engine, checkout-requires-accepted-quotation, checkout-renewal-price, checkout-hands-the-browser-a-publishable-key)
- หัวควบคุม bbfb9f382 (U2 ที่ coordinator gate แล้ว) ชุดเดียวกับที่ล้มในรอบแรก: integration ล้ม 7 ชื่อ baseline เดียวกัน · unit ล้ม 4 ชุด Stripe/checkout 13 ชื่อเดียวกันทุกตัว → เกิดจาก PAYMENT_ADAPTER=mock ที่ brief บังคับในรอบที่มีฐานข้อมูล ไม่ใช่จากกิ่งนี้ (gate ของ coordinator ไม่บังคับค่านี้และชุดเหล่านี้ผ่านบน main)
- กุญแจลงนาม puppeteer และ pool ที่ล้มในรอบแรก ผ่านทั้งหมดเมื่อใช้กุญแจส่วนตัวและรันเป็นชุดเล็ก
- เทียบชื่อ baseline ของ main 77eb1503 (16 ชื่อ integration): ชื่อที่ยังล้มบนหัวคือ 7 ชื่อเดียวกับหัว U2 ที่ gate แล้ว · m1 4 ชื่อ และ m2a 5 ชื่อผ่าน · ไม่มีชื่อใหม่นอกจาก witness ที่แก้แล้ว

## สิ่งที่เก็บและสิ่งที่ทิ้งจากร่างของผู้ทำก่อนหน้า

ร่างที่รับมา (39 แก้ 6 ลบ 3 ไฟล์ใหม่ ยังไม่ commit) ถูกถือเป็นร่างที่ยังไม่ได้พิสูจน์ ทุกข้อวัดซ้ำบนฐานข้อมูลจริงก่อนเก็บ

เก็บ:
- `services/application-filing-gates.js` (judgeFiling) และการต่อเข้ากับ /submit, /:id/revision-resubmit, /:id/car พร้อม requireConsent ที่สองประตูหลัง
- `purposeRefusalBody` และ `submitGateRefusalBody` ให้ทุกประตูตอบรูปเดียวกัน
- การลบ PUT /:id/revision ทั้งบาน เทสต์ที่ปักประตูนี้ และ s07-seams ที่เปลี่ยนไปยื่นผ่าน /submit (Playwright ของ e2e-phase0 ไม่ได้รันในงานนี้ ต้องใช้ stack จริง)
- ช่องผู้ติดต่อหน้างานใน canonicalStep5Schema (รูปเก่า)
- m2a ที่ตรวจตัวตนของกฎ
- การเลิกรับ steps แบบเก่าที่ /draft และ /prepare และ echo ใน GET /draft (ตรวจซ้ำ: ไม่มีไคลเอนต์ส่ง stepData หรือ steps และ `response.data.steps` ในเว็บมาจาก config ของพืช ไม่ใช่ GET /draft)

ทิ้งหรือแก้:
- ร่างตัดกรณี PUT ในเทสต์ #67 ไม่หมด ไฟล์ parse ไม่ผ่าน แก้ใน f11e8b345
- ด่านในตัวเขียนสถานะ (ร่างมีโค้ดแต่ไม่มีเทสต์): เขียนเทสต์ก่อน (646b9dc2f) วัดช่องได้จริง แล้วถอดทั้งโค้ดและเทสต์ (d873e7d44) เพราะขัดกับการออกแบบกู้ของ main ดูหัวข้อด่านในตัวเขียนสถานะ
- `NO_CONTACT` ในเทสต์ประตูไม่มีใครใช้ ลบ (6b3fd7f1d) · `stepPrerequisiteMessage` ไม่มีผู้เรียกหลังข้อ 5 ลบพร้อมเทสต์หน่วยของมัน
- คอมเมนต์ที่เขียนว่าประตูถูกลบ "2026-10-14" (วันที่ร่าง) ถูกลบในรอบ no-comments

## ยังเปิด

- ผิดพลาดที่วัดได้ (ระดับสูง มีอยู่ก่อนกิ่งนี้): ขา CAR_PENDING ของ POST /submit ใช้ `assertRevisionNotExpired` ซึ่งอ่าน revisionDueAt ของรอบตรวจเอกสาร ไม่ใช่ carDueAt · คำขอที่มี revisionDueAt เก่าค้างจากรอบเอกสาร ยื่นหลักฐาน CAR ผ่าน /submit แล้วถูกยกเลิกเป็น EXPIRED (400 REVISION_DEADLINE_EXCEEDED) ขณะที่คำขอเดียวกันผ่าน POST /:id/car ได้ 200 CAR_REVIEWING (`runs/probe-stale-revision-clock-6b3fd7f1d.json`) · แก้ด้วยขั้น "หมดเวลาหรือยัง แล้วค่อยตัดสิน" ขั้นเดียวที่ทุกประตูยื่นใช้ และอ่านนาฬิกาของสถานะนั้น
- ปุ่มกู้ของผู้ดูแล 5 บานยังพาคำขอจากสถานะที่ผู้ยื่นแก้ได้เข้าคิว (หัวข้อด่านในตัวเขียนสถานะ) · ต้องให้ operator ชี้ว่าขาไหนเป็นการกู้ตามคำสั่ง 31 ก่อน
- ขาส่งกลับของ POST /submit ไม่บังคับให้แนบเอกสารใบที่ผู้ตรวจขอใหม่ (มีแต่ /:id/revision-resubmit ที่เรียก assertRevisionSlotsRefreshed) · ทางเดินรอบ 2 ส่งกลับผ่าน /submit ได้ 200 โดยไม่แนบใหม่
- อำเภอ/ตำบลของคำขอรูปเก่ายังไม่บังคับ (ข้อ 3 บังคับเฉพาะผู้ติดต่อหน้างาน)
- จากรอบ no-comments (ต้องแก้รูปโค้ด ไม่ได้ทำในหน่วยนี้): ความยินยอมอยู่นอก judgeFiling (แต่ละประตูติด requireConsent เอง) · ตัวเขียนสถานะไม่ได้ต้องการผลของ judgeFiling · ชื่อ assertRevisionNotExpired ไม่ตรงกับสิ่งที่ทำ (ยกเลิกคำขอ) · application-workflow-handlers.js เหลือแต่ GET · การ clamp ขั้นของ /draft กระจายสามที่ · r1-task6 คัดลอก helper ของ test-support · dropFilingConsents ควรอยู่ในการเก็บกวาดของ fixture · กิ่ง SEAM B ใน s07-seams หลัง return ไม่เคยรัน · m2a `rulesInForceFor` ทำซ้ำการอ่านของด่าน (ควร export จากด่าน)
- s07-seams (Playwright e2e-phase0) ไม่ได้รันในหน่วยนี้ ต้องใช้ stack จริงและรหัสผ่านทดสอบ
- ตรวจอิสระ (code + security) เป็นขั้นของ coordinator (คำสั่ง 77)

## gate เต็มและผลรันของผู้ตรวจอิสระ (coordinator 2026-10-20)
- `gate-48815f6db/test-output.txt` สรุปชุดเทสต์เต็มของ gate บน 48815f6db เทียบ gate ของ main 18c6e9ac9 · integration-pg ล้ม 7 ชื่อเท่ากับ main ไม่มีชื่อใหม่ · probe ไม่มีตัวล้มใหม่ · gitleaks ไม่มีของใหม่
- รอบขนานมีชุดเดียวที่ล้มเฉพาะบนหัวนี้ คือ registration-sets-no-protected-column ซึ่งกิ่งนี้ไม่ได้แก้ไฟล์ สาเหตุคือรหัสผ่านสุ่มของเทสต์เองมีอักขระเดียวกันติดกันเกินสามตัวจนนโยบายรหัสผ่านปฏิเสธ และรอบ integration-pg ของ gate เดียวกันผ่านชุดนี้ครบ รายละเอียดอยู่ในหมายเหตุท้าย test-output.txt
- `gate-48815f6db/review-batch-48815f6db.txt` ผลรันชุดเทสต์ที่ผู้ตรวจอิสระเตรียมไว้แต่รันไม่ทัน coordinator รันตามเดิมทุกบรรทัด ผลตรงที่ผู้ตรวจคาดทุกตัว (เทสต์ประตู 17/17 · mutant ทั้งห้าตัวทำให้เทสต์แดง · m2a ผ่านทั้งทะเบียนว่างและทะเบียนที่ seed 189 กฎ · answer-doors 11/11 · probe steps เก่าผ่าน)
- `gate-48815f6db/probe-results.json` และ `ratchet-before-after.txt` ผล probe และ ratchet ของ gate
