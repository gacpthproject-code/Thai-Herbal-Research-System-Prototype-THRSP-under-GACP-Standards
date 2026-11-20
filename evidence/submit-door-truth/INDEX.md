# U2 submit-door-truth: หลักฐาน (#67, #47, m1-submit-enforcement, m2a-submit-enforcement)

กิ่ง `fix/submit-door-truth` จาก main 73cda2d9e (โค้ดประตูเดียวกับ 5f8dde8dd ที่ staging และ demo ใช้อยู่) · ชั้นงาน C (`tier-check.sh`: `shared/form-data-ownership.js` = auth-identity)

ทุกการวัดยิง HTTP จริงเข้า backend จาก tree นี้ บน Postgres ชั่วคราวของงานนี้ (127.0.0.1:5439, migrate ครบ 155) ผ่าน `~/work/state/heavy.sh` · `PAYMENT_ADAPTER=mock` · URL ฐานข้อมูลอยู่ในไฟล์ 0600 ไม่เคยอยู่ใน argv · ไม่แตะ staging หรือ demo

## #67 ประตูผู้ยื่นรับเฉพาะช่องที่ฟอร์มประกาศ

เทสต์: `apps/backend/__tests__/integration/applicant-doors-write-only-declared-fields-real-postgres.test.js`
ส่งสามชั้นของ payload แปลกปลอมเข้า POST /draft (สร้าง, บันทึกมีและไม่มีนาฬิกา), POST /prepare (สร้าง, บันทึก), POST /draft-documents (สร้าง, 26 ช่องตามเพดาน multipart 30), PUT /:id/revision แล้วอ่านแถวกลับ:
- คอลัมน์ที่ฟอร์มไม่มี 32 ช่อง (status, organizationId ของอีกองค์กร, healthId/submitterId ของคนอื่น, reviewer/auditor/headAuditor/scheduler, phase1/2 status/amount/paidAt, auditResult, closedReason, legalHold, isDeleted, version, rejectCount, cultivationScopeCount, bundleId, idempotencyKey, submissionHash, standardCode, isPreviewReady, labResultStatus, scheduledDate, createdAt, retainUntil)
- การเขียนซ้อนความสัมพันธ์ 10 แบบ (certificates, documents, paymentTransactions, invoices, quotations, checkoutOrders, workActivities, comments, revisionDeadline, correctionRounds) + connect 5 แบบ · รูปทั้งหมดผ่านการตรวจว่า Prisma รับจริงบน create ที่ rollback (`probes/check-relation-shapes.js`) จึงเป็นการวัดว่า "ถ้ากระจายลง Prisma จะเกิดแถวจริง"
- คีย์ใน formData ที่เซิร์ฟเวอร์อ่านเป็นข้อเท็จจริง 18 คีย์

ผลบนโค้ดก่อนแก้ (`runs/67-red.json`, `runs/red-67.summary.txt`, ที่ 751949959):
- คอลัมน์และความสัมพันธ์: ไม่มีอะไรลงเลยทุกประตู เพราะทุกการเขียน Prisma สร้างจากช่องที่ตั้งชื่อ (`createDraftForHealth`, `updateApplicantDraftColumns`, UPDATE ดิบของการบันทึกมีนาฬิกาที่มีรายการคอลัมน์ตายตัว, `writeApplicationStatus`) · ผู้ถืออื่น 403 ENTITY_PERMISSION_DENIED ไม่สร้างแถว
- formData: /prepare (สร้างและบันทึก) และ PUT /:id/revision เก็บคีย์แปลกปลอมทั้ง 18 คีย์ รวมตราประทับของเซิร์ฟเวอร์ `lastDraftStep`/`draftSaveClock` · /draft ไม่เก็บ (allowlist เดิม)
- คอลัมน์ areaType: /draft สร้างร่างด้วยค่าที่ body ส่งมา ('HACKED' ในการอ่านครั้งแรก `runs/67-first-reading-leftover-test.json`, 'OUTDOOR' ค่าตั้งต้นของเว็บใน RED) ทั้งที่ไม่ได้ติ๊ก

ผู้อ่านของแต่ละคีย์ (`probes/formdata-key-readers.sh`) และความรุนแรงบนโค้ดที่ deploy อยู่:
- `carDocuments` = บันทึกเจ้าของของไฟล์ `/uploads/car/*` (`middleware/uploads-access.js` resolveCarDocumentOwner, findFirst ไม่มีลำดับ) · วัดจริงในโหมด witness shadow (โหมดของ staging/demo, `probes/car-owner-forgery-probe.test.js`): 5 รอบ (run0-run4) มี 1 รอบ (run3) ที่แถวของผู้โจมตีถูกเลือกก่อน ผู้โจมตีได้ 200 ไฟล์ CAR ของเหยื่อ และเหยื่อได้ 404 · อีก 4 รอบเหยื่อยังเป็นเจ้าของ (`runs/67-car-owner-shadow-run*.json`) · ลำดับตาม heap ของ Postgres · ต้องรู้ชื่อไฟล์ของเหยื่อ (`${Date.now()}-${randomInt(1e9)}`) → ปานกลาง
- `lastDraftStep`, `draftSaveClock`, `_paymentAbandoned` → ต่ำ (กระทบแค่คำขอของตัวเอง)
- `docApprovedAt` (จุดเริ่มนับงวด 2) → ต่ำ: เซิร์ฟเวอร์เขียนทับตอน DOC_APPROVED และแก้ได้อีกแค่ใน CAR_PENDING ซึ่งงวด 2 ชำระแล้ว
- `revisionRequestedAt`, `carRequestedAt` → ต่ำ: เลือกถ้อยคำในประกาศหมดเวลาเท่านั้น กำหนดเวลาจริงอยู่ในคีย์ของเซิร์ฟเวอร์
- `carRequest`, `inspectionMode`, `auditChecklist`, `plantName` → ต่ำ: ค่าสำรองเมื่อคีย์ของเซิร์ฟเวอร์ไม่มี หรือแสดงผลเท่านั้น
- `adminClosure`, `certificateNumber`, `certificateUrl`, `status`, `bundleId`, `reviewerId`, `phase1Status`, `certificates` → ไม่มีผู้อ่าน formData ที่ตัดสินอะไร
- คอลัมน์ `areaType` คำอะไรก็ได้ → ต่ำเมื่ออยู่ลำพัง (ตัวแตกเคสเขียนทับจากที่ติ๊ก) แต่เป็นต้นทางของ #47

แก้ (29d456e4a): `mergeWizardAnswers` = แถวเดิม + คำตอบของวิซาร์ด (WIZARD_OWNED_FORM_DATA_KEYS) ใช้ที่ /draft, /prepare และ PUT /:id/revision ทั้งตัวตรวจเอกสารและตัวเขียน · ลบ `stripServerOwnedKeys`, `applyClientFormData`, `mergeClientFormData`, `pickServerOwnedKeys` · `findOrCreateApplicationForHealth` รับช่องที่ตั้งชื่อ · คอลัมน์ areaType มาจากที่ติ๊กเท่านั้น

## #47 ยื่นแบบ steps เก่าโดยไม่ติ๊กลักษณะพื้นที่

ผู้เรียกทาง steps (`steps` 1-9 หรือ `step` + `stepData`): `probes/legacy-step-callers.sh` บน tree ก่อนแก้ (`runs/legacy-step-callers-prefix.txt`): 193 ไฟล์ที่เอ่ยถึงประตูผู้ยื่น มีเครื่องหมาย steps แค่ตัวประตูกับตัวตรวจเอง และเทสต์ 18 ไฟล์ · ไม่มีเว็บ แอปมือถือ สคริปต์ หรือ e2e ส่ง
เทสต์: `apps/backend/__tests__/integration/legacy-step-submit-refused-real-postgres.test.js`
RED ในประวัติ: 9f15a4926 (ก่อนตัวแก้ 3a525dd98) แดงเพราะตัวตรวจแบบเก่าไม่มีกฎลักษณะพื้นที่ (ไม่มี error ที่ขั้น 2) แต่ด่านเอกสารตีกลับก่อนเพราะยังไม่มี ภ.ท.10 จึงไม่ได้แสดงอันตรายจริง · อันตรายจริงวัดด้วยเทสต์ฉบับแนบ ภ.ท.10 (d2003e90e ซึ่ง commit หลังตัวแก้) รันบน tree ผสม = โค้ดผลิตภัณฑ์ก่อนแก้ 751949959 + ไฟล์เทสต์ที่คัดลอกเข้า worktree แยก
ผลบนโค้ดก่อนแก้ (`runs/47-red.json`): POST /submit ได้ 200 PENDING_DOC_FEE เก็บ steps จาก body 9 ขั้น ออกใบเสนอราคา 1 ใบ และขอบข่ายที่ใบรับรองจะได้ (`deriveDimensions(app).areaTypes`, ตัวเดียวกับที่ certificate-service.js เขียนแถว scope) คือ ['OUTDOOR'] จากค่าตั้งต้น · ขา DRAFT ของ PUT /:id/revision ได้ 200 PENDING_DOC_FEE เช่นกัน (ไม่ออกใบเสนอราคา)
แก้ (3a525dd98): ลบทาง steps ใน `validateSubmissionPayload`, `validateAllSteps`, `validateMasterSubmission`, `MASTER_STEP_REQUIRED_FIELDS` และตัวช่วยที่มีแต่มันใช้ · POST /submit ไม่เขียน steps จาก body อีก · กวาดบรรทัด mock ที่ตายแล้ว 26 บรรทัดด้วย `probes/sweep-dead-mocks.py`

## m1-submit-enforcement (4) และ m2a-submit-enforcement (5): ล้าสมัยทั้ง 9

ทั้งสองไฟล์เขียนเองว่า "THIS FILE HAS NEVER EXECUTED" (8f62fbe19, ea0fe9275, 2026-08-15)
- m1: user ไม่มี canonicalId (บังคับตั้งแต่ 20260404080000_add_canonical_id) · บทบาท HEALTH_USER (คำเก่าก่อน 52388976) · คำขอไม่มี healthId/areaType (NOT NULL ตั้งแต่ migration แรก) · อ่าน `metadata.onBehalfOfEntityId` ตรง ๆ แต่ตัวเขียนบันทึกตรวจสอบเก็บ metadata เป็นสตริง JSON (B3 2026-07-06)
- m2a: คำขอไม่มี healthId/areaType · กฎของชุดทดสอบซ้ำกับกฎ company_reg ที่ migration 20260815200000 ใส่ไว้ เคสปิดกฎจึงผ่านไม่ได้ตั้งแต่ต้น · กฎค้างข้ามเคส · วัตถุประสงค์ EXPORT ต้องมี ภ.ท.10
เขียนใหม่บน fixture ร่วม holder-scope (7fb4f4280, 751949959, แก้ต่อใน 6e72a72cf) · ฉบับแรกบนโค้ดที่ไม่แก้ได้ 6/9 (`runs/rewrite-m1-m2a.summary.txt`: m1 อ่าน metadata ที่เก็บเป็นสตริงผิด, m2a บุคคลขาด ภ.ท.10) · ฉบับของ 6e72a72cf บนโค้ดผลิตภัณฑ์ที่ไม่แก้ (751949959 + ไฟล์เทสต์ที่คัดลอก) ผ่าน 9/9 (`runs/prefix-m1-m2a.summary.txt`) = เทสต์ล้าสมัย ผลิตภัณฑ์ถูก

## Mutant ต่อกฎ (`probes/mutants.py`, ผล `runs/mutants.json`)

แต่ละ mutant คืนข้อบกพร่องหนึ่งข้อใน worktree แยก รันเฉพาะชุดที่เกี่ยวข้อง แล้วคืนไฟล์และตรวจว่า tree สะอาดก่อนข้อถัดไป · ทุกข้อแดงที่เคสเป้าหมาย:

| mutant | คืนข้อบกพร่อง | เคสที่แดง |
|---|---|---|
| M67a | /prepare กระจาย body ลง formData | /prepare create, /prepare save |
| M67b | PUT /:id/revision กระจาย formData ของไคลเอนต์ | PUT /:id/revision |
| M67c | /draft create อ่าน areaType จาก body | POST /draft create |
| M67d | /draft create กระจาย body ลง Prisma create | POST /draft create (คอลัมน์/ความสัมพันธ์) |
| M47 | คืนทาง steps ที่ยอมรับ /submit | POST /submit |
| M47rev | ทาง steps + การกระจายของประตูแก้ไข | POST /submit, PUT /:id/revision (DRAFT) |
| Mm1-perm | guard ข้ามการตรวจสิทธิ์ | AC2 คนนอก, AC3 MANAGER, REVOKE |
| Mm1-grant | engine ไม่อ่านแถว GRANT | AC3 MANAGER + GRANT |
| Mm1-revoke | engine ไม่อ่านแถว REVOKE | REVOKE ชนะ OWNER |
| Mm1-noentity | คำขอไม่มีผู้ถือผ่านด่าน entity | 400 VALIDATION_ERROR |
| Mm1-audit | การปฏิเสธไม่เขียนบันทึกตรวจสอบ | สามเคสที่นับแถว FAILURE |
| Mm2a-holder | กฎเฉพาะนิติบุคคลผูกทุกผู้ถือ | AC1 บุคคล |
| Mm2a-evidence | แถว ApplicationDocument ไม่นับเป็นหลักฐาน | AC2 (และ AC1 บุคคล) |
| Mm2a-stamp | ยื่นซ้ำตัดสินด้วยกฎวันนี้ | AC3 ตราประทับ |
| Mm2a-close | กฎที่ปิดแล้วยังทำงาน | AC3 ปิดกฎ |

ตารางนี้คือรอบที่โค้ดสุดท้าย 2ece78bcc (`runs/mutants.json`) · รอบก่อนหน้ารันบน tree ที่มีถดถอยของการบันทึกแบบมีนาฬิกา ผลจึงถูกแทนด้วยรอบนี้
- M67d (POST /draft create กระจายฟิลด์ของ Application จาก body ลง `prisma.application.create`): รอบแรกได้ 500 เพราะ tenant extension ปฏิเสธ organizationId ขององค์กรอื่น (CROSS_TENANT_WRITE) ซึ่งเป็นชั้นป้องกันจริงของคอลัมน์นั้น แต่แดงด้วยเหตุผิด จึงรันซ้ำโดยไม่กระจาย organizationId (`runs/mutant-M67d.txt`): แดงด้วยเหตุที่ถูก ค่าจาก body ลงจริง (status CERTIFIED, phase1/2 PAID, reviewer/auditor/scheduler, healthId ของคนอื่น, legalHold, isDeleted ฯลฯ) และแถวเอกสารปลอมเกิดขึ้น 1 แถว · คอลัมน์และความสัมพันธ์ของเทสต์ประตูจึงเคยถูกเห็นว่าแดงจริง

## GREEN ที่โค้ดสุดท้าย 2ece78bcc (Postgres จริง, HTTP จริง; commit หลังจากนั้นเป็นเอกสารล้วน)

- เทสต์ประตู #67: 10/10 (`runs/67-green.json`, `runs/final-67.summary.txt`) · รวมเคสที่ตรวจว่าการเขียนซ้อนทั้ง 10 แบบ Prisma รับจริง · ทุกประตูตอบ 200 ไม่มีคอลัมน์ ความสัมพันธ์ หรือคีย์ formData แปลกปลอมลง · areaType ของร่างใหม่ = UNDECLARED เมื่อไม่ได้ติ๊ก · ประตูแก้ไขเพิ่ม WorkActivity ของตัวเองพอดี 1 แถว
- เทสต์ #47: 2/2 (`runs/47-green.json`) · ทั้งสองประตู 422 APPLICATION_INCOMPLETE ที่ขั้น 2 คำขอยังเป็น DRAFT ไม่เก็บ steps ไม่ออกใบเสนอราคา
- ทางเดินประตูจริง (`apps/backend/__tests__/integration/applicant-submit-walk-web-and-mobile-real-postgres.test.js`): ผ่าน 2/2 ทั้งที่หัวกิ่ง (`runs/walk-web-mobile-green.json`) และบนโค้ดก่อนแก้ (`runs/walk-web-mobile-prefix.json`) · เว็บ = บันทึกครั้งแรกระบุผู้ถือ → อัปโหลด 2 ช่อง → บันทึกคำตอบครบพร้อมนาฬิกา (ติ๊กกลางแจ้ง มีผู้ติดต่อหน้างาน) → ยื่นด้วย id + นาฬิกา + ยอมรับ = 200 PENDING_DOC_FEE เคสเดียว areaType OUTDOOR สร้าง farm ประทับเวลายอมรับและชุดกฎ · มือถือ = /prepare ด้วย body ตามแอปจริงเก็บครบ 14 คีย์ · ส่วนที่แอปมือถือ (แช่แข็ง) ทำเองไม่ได้ เหมือนกันทั้งก่อนและหลังแก้: /prepare ครั้งแรกโดยไม่มีร่าง 400 APPLICATION_HOLDER_REQUIRED และการยื่นตามที่แอปส่ง 422 ขาด ภ.ท.10 (แอปไม่อัปโหลดเอกสารเข้าช่อง)
- m1 4/4 และ m2a 5/5 ผ่านในชุด integration ที่หัวกิ่ง

## ถดถอยที่เจอระหว่างทาง (แก้แล้ว)

29d456e4a ตัด `serviceType` ออกจากข้อมูลที่บันทึก แต่ UPDATE ดิบของการบันทึกแบบมีนาฬิกา (ทางที่ autosave ของเว็บใช้) เขียนทุกคอลัมน์ที่ได้รับ จึงเขียน NULL ชน NOT NULL ตอบ 500 · เทสต์หน่วย mock ตัวเขียนจึงไม่เห็น เทสต์ประตูบน Postgres จริงเห็น (`runs/green-67.summary.txt`) · แก้ใน 08fbec655

## ชุดเทสต์และจำนวน

- หน่วย: 54 ชุด 742 เคส ผ่านทั้งหมด (`runs/unit-54-suites.summary.txt`) · ชุด error-code catalog + source pointer 17/17
- integration 28 ไฟล์ที่แตะประตูยื่น/บันทึก/แก้ไข หรือโมดูลที่เปลี่ยน ที่โค้ดสุดท้าย: 3 ไฟล์ของกิ่ง 14/14 และอีก 25 ไฟล์ 245/249 (`runs/final-integ.summary.txt`) ล้มแค่ officer-review-round-trip 4 ชื่อ (baseline ของ main, หน่วย U3) · baseline บน DB เดียวกันที่โค้ดก่อนแก้ (`runs/base-integ.summary.txt`) ล้ม officer-review-round-trip 4 ชื่อเหมือนกัน และ holder-scope 3 ชื่อจาก process jest กำพร้าที่วิ่งซ้อน ~20 วินาที (รันซ้ำสะอาด 76/76, `runs/base-holder-scope-rerun.summary.txt`) → ไม่มีความล้มเหลวใหม่ และ 9 ชื่อของ m1/m2a ออกจากรายการล้ม
- ratchet: PASS todo 33 (baseline 33) hardcode 26 env-direct 93 dup-source 0 (`runs/ratchet.txt`, คืนไฟล์ evidence/ratchet-current.txt หลังรัน) · tier-check: TIER=C (`runs/tier-check.txt`)
- error codes: หลังการตัดคอมเมนต์ ตัวชี้ 6 รหัสเลื่อน ชี้ใหม่ด้วย `probes/repoint-error-codes.py` และสร้าง docs ใหม่ด้วย `--markdown` (c92242229) · `--validate` 463 รายการตรงกัน · ชุด catalog + source pointer 17/17

## งานที่ยังเปิด (ไม่ได้แก้ในกิ่งนี้)

- ส่งต่อ coordinator: โค้ดที่ deploy อยู่ (5f8dde8dd) ให้ผู้ยื่นปลอมบันทึกเจ้าของไฟล์ CAR ของคนอื่นได้ (ปานกลาง ต้องรู้ชื่อไฟล์สุ่ม) · กิ่งนี้ปิดทางเขียนแล้ว แต่ `resolveCarDocumentOwner` ยังอ่านแบบไม่มี scope และไม่มีลำดับ · จะ hotfix หรือรอ merge เป็นการตัดสินของ coordinator
- ข้อเสนอของ no-comments ที่ต้องออกแบบหรืออยู่นอก diff: F2/F3 รวม allowlist และรายการคีย์ของเซิร์ฟเวอร์ไว้ใน shared/ ที่เดียว · F4 ประตูแก้ไข merge สองครั้งจากการอ่านสองครั้ง · F5 UPDATE ดิบของการบันทึกแบบมีนาฬิกาเขียนรายการคอลัมน์ตายตัว (ต้นเหตุของถดถอยใน 29d456e4a) · F9 export เพดาน field ของ multipart · F12 บันทึกตรวจสอบเก็บ metadata เป็นสตริง · F13 ชื่อ key ของ fixture · F14 helper แนบเอกสารร่วม · F15 การแยกกฎของ m2a ด้วยโครงสร้าง · F18 mock factory ที่ระบุทุก stub

- ช่องที่ยังเปิดของขั้นที่ 01: คำขอที่ไม่มี farmData.siteName/siteAddress/areaSqm ถูกตัดสินด้วย step 5 แบบเก่า ซึ่งไม่บังคับผู้ติดต่อหน้างาน (คำสั่ง 65(2), 73) และไม่บังคับอำเภอ/ตำบล · หลักฐาน: เคส PUT /:id/revision ของเทสต์ประตูผ่านด่านความครบถ้วนด้วย formData ที่ไม่มีผู้ติดต่อหน้างาน · แนะนำเป็นหน่วยถัดไป (เปลี่ยนกฎการยื่นของรูปคำขอนั้น กระทบ fixture หลายชุด)
- ประตู PUT /:id/revision ไม่มีไคลเอนต์ในผลิตภัณฑ์ (เว็บใช้ POST /:id/revision-resubmit) แต่ `apps/web-app/e2e-phase0/s07-seams.spec.ts` ยังเรียก · ขา DRAFT ของมันเป็นประตูยื่นที่สองที่ไม่แตกเคสตามลักษณะพื้นที่และไม่สร้าง farm · ตอนนี้ถูกกฎ canonical ตัดสินแล้ว · ควรลบขา DRAFT ตามคำสั่ง 12 พร้อมแก้ spec นั้น
- /draft และ /prepare ยังรับข้อมูลรายขั้นแบบเก่า (`steps`, `step` + `stepData`) ลง formData.steps ไม่มีไคลเอนต์จริงส่งและไม่มีผู้อ่านใช้ตัดสินแล้วหลัง #47
- `resolveCarDocumentOwner` อ่านแบบไม่มี holder scope และไม่มีลำดับ (witness แจ้งเตือน) · หลังกิ่งนี้มีแต่เซิร์ฟเวอร์ที่เขียน carDocuments แต่การหาเจ้าของควรผูกกับแถวที่อัปโหลดจริง
- แอปมือถือ (แช่แข็ง): สร้างร่างเองไม่ได้ตั้งแต่ R2 (400 APPLICATION_HOLDER_REQUIRED) และคำขอรูป canonical เดิมถูกตัดสินด้วย step 5 แบบเก่าซึ่งไม่บังคับผู้ติดต่อหน้างาน (คำสั่ง 65(2)) และไม่บังคับอำเภอ/ตำบลที่ใบรับรองต้องใช้
- คอลัมน์ serviceType รับข้อความอะไรก็ได้ตอนสร้างร่าง ใช้แสดงผลและนับในรายงานเท่านั้น (ต่ำ)
- ไฟล์ตายฝั่งเว็บ `use-application-form-store.ts` + `hooks/auto-save-indicator.tsx` ไม่มีใครนำเข้า
- ขา DRAFT ของ PUT /:id/revision ในรอบ RED ไม่ออกใบเสนอราคา (เรียก issueQuotationOnSubmit โดยไม่ส่ง holderScope) ยังไม่ได้ไล่สาเหตุ
