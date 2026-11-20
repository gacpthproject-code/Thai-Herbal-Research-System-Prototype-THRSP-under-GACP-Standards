# role-workflow-auditor · ฝั่งผู้ยื่น (`health` ยื่นในนามผู้ถือ) + งานอัตโนมัติของระบบ · 2026-10-07

- โค้ดที่ตรวจ: main `ff941271` (checkout หลัก `/home/ubuntu/work/GACP-Certification-Application`) · เลขบรรทัดในรายงานนี้อ้าง ณ `ff941271` เท่านั้น (ขยับทุก commit ให้ยึดชื่อ symbol เป็นหลัก)
- เกณฑ์: เส้นงาน 12 ขั้นที่ operator ยืนยัน 2026-10-06 · กฎการแก้ไข 2026-10-07 (5 วันทำการ/รอบ ไม่จำกัดรอบ เลยกำหนด = ยกเลิกอัตโนมัติ แสดง "ยกเลิก (เลยกำหนด)") · เงื่อนไขการชำระ v1.3 · ชนิดการคืนเงิน (คำสั่ง 20, 22) · คำสั่ง 24-31 ใน preferences.md
- ไม่ซ้ำข้อที่รายงานบทบาทเจ้าหน้าที่ 2026-10-06 รายงานไปแล้ว (dispatcher/reviewer-inspector/approver-finance/staff-reads) — ข้อที่แตะกันจะอ้างรหัสเดิมแทน
- รายการงาน (scope-modules.md) ใช้เป็นแค่ป้ายรหัสงาน ความถูกต้องตัดสินด้วยมติปัจจุบัน (คำชี้แจง operator 2026-10-07)

## สถานะการตรวจ

- โค้ด: ตรวจครบ 12 ขั้น + งานตั้งเวลา + ทุกขาใน `ALLOWED_TRANSITIONS`
- staging จริง: **บางส่วนเท่านั้น** · `GET /api/health` → `revision b74a31ff` (build 2026-10-06T17:46Z) = **ตามหลัง main 20 commit** (ยังไม่มี: เงื่อนไข v1.3 `8899081e`, ป้ายสถานะปิด `346ef533`, สิทธิ์เจ้าหน้าที่ `9c0d5c45`/`56800d8b`) · การอ่านไฟล์บัญชีทดสอบใน `~/work/state` **ถูกระบบสิทธิ์ปฏิเสธ** (Credential Materialization) จึงหยุดตามคำสั่ง 11 ไม่หาทางอ้อม ⇒ เดินได้เฉพาะหน้าที่ไม่ต้องล็อกอิน (ภาพ 8 ภาพ + `pages.json` ใน `reports/role-workflow-auditor/2026-10-07-applicant/`) และ GET สาธารณะ: `/api/auth/idp/providers` (local เปิด, thaid/healthid/providerid = coming_soon), `/api/certificate-validity` (12 เดือน มีวันมีผล 2026-09-11 = ค่ามีวันที่กำกับ ถูกตามคำสั่ง 24), `/api/public/verify/TH-GACP-NOPE` (ตอบ NOT_FOUND ถูกต้อง)
- ไม่มีการยื่น ไม่มีการจ่าย ไม่มีการเขียนใด ๆ

Status: **PENDING** — ส่วนโค้ดเสร็จ · ส่วนเดินจริงแบบล็อกอิน = BLOCKED(operator: อนุญาตให้ agent อ่านไฟล์บัญชีทดสอบ หรือ operator ล็อกอินให้ แล้วส่ง session ที่ใช้ได้เฉพาะ GET)

## คำตัดสินรายขั้น (มุมผู้ยื่น)

| ขั้น | เรื่อง | คำตัดสิน | หลักฐาน (file:line · symbol) |
|---|---|---|---|
| 0 | สมัคร/ล็อกอิน | **ใช้ได้** (รหัสผ่านชั่วคราว) | `routes/api/auth/auth-health.js:59,113` · ไม่มีลืมรหัสผ่าน/รีเซ็ตทางอีเมล-SMS (`auth-health.js:116`, `shared/schemas/auth-schemas.js:127`) ✓ · 2FA เป็น TOTP (`routes/api/identity/mfa.js`) ไม่ใช่อีเมล/SMS = ไม่ใช่ finding · ThaiD/หมอพร้อมมีประตู (`auth-idp.js:435-477`) แต่ staging ตอบ coming_soon (ตามแผน) |
| 0b | ผู้ถือ | **ใช้ได้** | ยื่นต้องระบุผู้ถือตอนสร้างร่าง (`use-auto-save.ts` `buildDraftPayload` entityId) · นิติบุคคล/วิสาหกิจที่ผูกกับบุคคลถูกปฏิเสธ (`application-requirements-service.js:113` `holderMismatchIssue`) และที่ออกใบ (`certificate-service.js` `resolveHolderForIssuance`) · คำขอแบบบุคคลธรรมดาถือเองได้ ตรงตามมติ 2026-09-07 (มติห้ามเฉพาะบริษัท/วิสาหกิจถูกบันทึกเป็นบุคคล) — ดู Q1 |
| 1 | แบบฟอร์ม กทล.1 → SUBMITTED → PENDING_DOC_FEE | **บางส่วน** | ลักษณะพื้นที่ 3 คำ ✓ (`step3-site-land-config.ts:42` `AREA_TYPE_OPTIONS`) · วัตถุประสงค์ตรวจที่ประตู (`application-requirements-service.js:628` `assessPurposes`) ✓ · **ไม่มีตัวเลือก "ที่ดินญาติ/ได้รับยินยอม"** (D7) · autosave ส่ง `expectedVersion` แต่เซิร์ฟเวอร์ไม่ใช้ (D10) |
| 2 | ใบเสนอราคา 7 วันทำการ + ยอมรับเงื่อนไข | **ใช้ได้** | `config/business-rules.js:324` `QUOTATION_VALIDITY_BUSINESS_DAYS: 7` · ยอมรับต้องมี `SUBMIT_APPLICATION` บนผู้ถือ (`quotations.js:417`) · ด่านเงื่อนไขการชำระอ่านความยินยอมจาก `UserConsent` เวอร์ชัน `payment-terms-th-v1.3` (`middleware/consent-manager.js:78`, `services/billing/payment-terms-gate.js`) ไม่เชื่อ body |
| 3 | M1 PromptPay → webhook → DOC_FEE_PAID + ใบเสร็จ/ใบกำกับอัตโนมัติ | **ใช้ได้ แต่ผู้ยื่นไม่ได้รับแจ้ง** | PromptPay อย่างเดียว (`stripe-checkout-service.js:859`) ✓ · settle + เลขใบเสร็จ TAX-PRD ในทรานแซกชันเดียว (`checkout-settlement-service.js:374,428`) ✓ · **ไม่มีแจ้งเตือนชำระสำเร็จถึงผู้ยื่น** (D4) · ค้างจ่ายไม่ถูกปิดถ้ายังไม่เคยกดจ่าย (D3) |
| 4 | ผู้จัดคิวมอบผู้ตรวจเอกสาร | ใช้ได้ (ฝั่งผู้ยื่น) | แจ้งผู้ยื่นที่ `scheduler-assign-reviewer-handler.js:183` · ฝั่งเจ้าหน้าที่ดูรายงาน dispatcher |
| 5 | ส่งแก้ → ผู้ยื่นแก้คำขอเดิม → ส่งกลับ / เลยกำหนด → EXPIRED | **ใช้ได้ (หลัก) · มีประตูซ้อน** | กำหนด 5 วันทำการจาก config (`workflow-side-effects.js:49` `PAYMENT.REVISION_DEADLINE_BUSINESS_DAYS`), สิ้นวันทำการเวลาไทย (`utils/working-days.js:471` `addWorkingDays`) ✓ · ไม่จำกัดรอบ ✓ · cron ทุกชั่วโมง (`jobs/scheduler.js` → `revision-deadline-checker.js` `checkExpiredDeadlines`) ✓ แจ้งผู้ยื่น ✓ · ป้าย "ยกเลิก (เลยกำหนด)" (`lib/constants/workflow-states.ts:63`) ✓ บน main · ประตู `/api/revision-deadline` ขัดกฎ (D6) · เตือนก่อนครบกำหนดไม่มีตัวตั้งเวลาในโค้ด (D8) |
| 6-7 | PENDING_AUDIT_FEE → M2 → AUDIT_FEE_PAID | ใช้ได้ / เหมือนขั้น 3 | แจ้งให้จ่ายงวด 2 (`document-reviews.js:587` `notifyDocumentApproved`, `workflow-side-effects.js:289`) ✓ · ชำระแล้วไม่แจ้ง (D4) · ไม่กดจ่ายไม่ถูกปิด (D3) |
| 8 | นัดตรวจ → AUDIT_CONFIRMED แจ้งผู้ยื่น | ใช้ได้ (ผู้ยื่นเท่านั้น) | `services/audit/audit-schedule-notices.js` `notifyAuditScheduled` ส่งถึง `farmerUserId` + ผู้ตรวจ · ไม่ถึงผู้ถือ (D5) |
| 9 | ผลตรวจแปลง → CAR_PENDING → ผู้ยื่นส่งหลักฐาน → CAR_REVIEWING | **เสีย (แจ้งเตือน) · บางส่วน (ส่งหลักฐาน)** | ประตูหลักของผู้ตรวจ (`/api/audit/onsite/:auditId/decision`) ส่งแจ้งผลไปที่ `healthId` แทน User.id ⇒ ผู้ยื่นไม่รู้ว่ามี CAR (D1) · ส่งหลักฐานแล้วแจ้งผู้ตรวจพื้นที่**ทุกคนทุกองค์กร** (D2) |
| 10-11 | อนุมัติ → ออกใบ → CERTIFIED | ใช้ได้ (ผู้ยื่นเท่านั้น) | แจ้งผู้ยื่นตอนออกใบ (`workflow-side-effects.js:380`) และ CERTIFIED (`:319`) · ไม่ถึงผู้ถือ ขัดคำสั่ง 29 (D5) · อายุใบจากตารางกฎ (`certificate-validity-rule-service.js`) ✓ หน้า FAQ อ่านค่า ไม่เขียน "1 ปี" ตายตัว ✓ |
| 12a | ดูใบ / PDF / verify | ใช้ได้ | `/api/certificates/my` อ่านตามผู้ถือ (`certificates.js:257` `holderScopeOf`) · PDF/QR ต้อง `PRINT_QR` บนผู้ถือ (`certificates.js:467`) · verify สาธารณะตอบจริงบน staging |
| 12b | รอบปลูก + QR หลังได้ใบ | ใช้ได้ | สร้างรอบปลูกต้องมีใบที่ยังมีผล (`services/planting-service.js` `createCycle` "Active certificate is required") · สิทธิ์ `CYCLE_CREATE` ที่ฟาร์ม (`planting-cycles.js` POST /) · ประตูล็อตจำกัดเจ้าของฟาร์ม (T&T แช่แข็ง) ไม่แตะ |
| 12c | ต่ออายุ | **เสีย** | D9 |
| — | อนุโลมเปิดเคส (waiver) | บางส่วน | ผู้ยื่นได้รับแจ้งเมื่ออนุมัติ (`waiver-reopen.js:131`) · ผู้ยื่นขอเองไม่ได้ (ออกแบบให้ผู้ตรวจขอ) · หน้าจออนุมัติไม่มี (approver-finance F13) · ข้อความแจ้ง EXPIRED ชวนติดต่อขออนุโลมแม้กรณีค้างจ่าย ซึ่งเปิดไม่ได้ (D12) |
| — | ผู้ยื่นถอนคำขอเอง | **ไม่มีประตู** | ลบได้เฉพาะร่าง (`applications.js:1914`) · ดู Q3 |

## ขาสถานะทุกขาใน `services/workflow-transition-service.js` — ตัวกระตุ้นและการแจ้ง

| ขา | ตัวกระตุ้น | แจ้งผู้ยื่น | แจ้งผู้ถือ |
|---|---|---|---|
| DRAFT→SUBMITTED→PENDING_DOC_FEE | `applications.js:890` POST /submit (สองฮอปในทรานแซกชันเดียว) | มี (`createNotification` หลังยื่น) | ไม่มี |
| SUBMITTED→PENDING_AUDIT_FEE (ต่ออายุผ่าน wizard) | `applications.js` ฮอป 2 `entryStateForSubmission` | — | — · **ขานี้ไม่อยู่ใน `ALLOWED_TRANSITIONS`** (ตัวเขียนไม่ assert) (D9) |
| PENDING_DOC_FEE→DOC_FEE_PAID · PENDING_AUDIT_FEE→AUDIT_FEE_PAID | webhook → `checkout-settlement-service.js` + `jobs/settlement-reconcile-job.js` (ทุก 10 นาที) | **ไม่มี** (D4) | ไม่มี |
| PENDING_*_FEE→EXPIRED | `jobs/payment-closure-job.js` (03:00) — เฉพาะเมื่อมี invoice | มี | ไม่มี · **ไม่เคยกดจ่าย = ไม่มีวันถูกปิด** (D3) |
| DOC_FEE_PAID→ASSIGNED_FOR_REVIEW | `scheduler-assign-reviewer-handler.js` | มี | ไม่มี |
| ASSIGNED_FOR_REVIEW→REVISION_REQUESTED / DOC_APPROVED(→PENDING_AUDIT_FEE) | `document-reviews.js` document-decision (+ `applyDocumentApprovalConsequences`) | มี ทั้งสองทาง | ไม่มี |
| REVISION_REQUESTED→ASSIGNED_FOR_REVIEW | `applications.js` POST /submit และ `revision-resubmit.js:111` | มี | ไม่มี |
| REVISION_REQUESTED/CAR_PENDING→EXPIRED | `jobs/revision-deadline-checker.js` (ทุกชั่วโมง) และ `routes/api/system/cron.js:129` (HTTP) | มี | ไม่มี |
| AUDIT_FEE_PAID→AUDIT_CONFIRMED | `scheduler-audit-schedules-post-handler.js:316`, `audit-scheduling-service.js:580` | มี | ไม่มี |
| AUDIT_CONFIRMED→AUDIT_PASSED | ทั้งสองประตูผลตรวจ | มี (ตัวเขียน `application-status-writer.js` ~1479) | ไม่มี |
| AUDIT_CONFIRMED→CAR_PENDING | ประตู onsite (`audit-onsite-service.js` `submitDecision`) / ประตู `auditor-audit-decision-handler.js` | **ประตู onsite: ส่งไม่ถึง** (D1) · ประตู audit-decisions: มี | ไม่มี |
| AUDIT_CONFIRMED→REJECTED | `auditor-audit-decision-handler.js:338`, `workflow-side-effects.js:341` | มี (หัวเรื่องมีอีโมจิ D11) | ไม่มี |
| CAR_PENDING→CAR_REVIEWING | `applications-car.js:150` | — | — · แจ้งผู้ตรวจผิดชุด (D2) |
| CAR_REVIEWING→AUDIT_PASSED / CAR_PENDING | ประตูผลตรวจทั้งสอง | เหมือนแถว AUDIT_CONFIRMED (D1 กระทบด้วย) | ไม่มี |
| AUDIT_PASSED→APPROVED→CERTIFIED | ประตูผู้อนุมัติ → `handleCertificateIssuance` | มี | **ไม่มี — ขัดคำสั่ง 29** (D5) |
| AUDIT_PASSED→CAR_REVIEWING | ผู้ตรวจย้อนผล / ผู้อนุมัติส่งกลับ | ไม่พบการแจ้ง (ผู้ยื่นไม่ต้องทำอะไร — ยอมรับได้) | — |
| EXPIRED→REVISION_REQUESTED / CAR_PENDING | `waiver-reopen-service.js` (SYSTEM) หลังการเงินอนุมัติ | มี | ไม่มี |
| DOC_FEE_PAID / AUDIT_FEE_PAID / AUDIT_CONFIRMED→CANCELLED | `services/refund-service.js:568` | มี (`_notifyApplicant`) | ไม่มี |

## ข้อบกพร่อง เรียงตามความรุนแรง

### สูง

**D1. ผู้ยื่นไม่ได้รับแจ้งผลตรวจแปลงที่มีข้อบกพร่อง (CAR) จากประตูหลักของผู้ตรวจ** · [M19, M08-T02]
- `services/audit-onsite-service.js:1566-1570` `submitDecision` เรียก `fanoutService.send({ userId: audit.application.healthId, ... })` · `notification-fanout-service.js:793` ระบุว่า `userId` ต้องเป็น User.id "(NOT canonicalId)" และ `:876-878` หา user ไม่เจอแล้ว `skipping` เงียบ ๆ
- `Application.healthId` คือ FK ไป `User.canonicalId` (คอมเมนต์เดียวกันที่ `revision-deadline-checker.js` แก้ไปแล้วรอบ ralph-iter4)
- ผลที่เกิดจริง: ผู้ตรวจกด FAIL ผ่าน `/api/audit/onsite/:auditId/decision` (หน้าเว็บเรียกที่ `lib/services/audit-service.ts:327`) → คำขอเป็น CAR_PENDING นาฬิกา 5 วันทำการเริ่ม แต่ผู้ยื่นไม่มีแจ้งเตือน → เลยกำหนดแล้วถูกยกเลิกอัตโนมัติโดยไม่รู้ตัว (PASS ไม่โดน เพราะตัวเขียนสถานะแจ้งแยก)
- แก้: แปลง `healthId` → User.id ก่อนส่ง (ทางเดียวกับ `payment-closure-job.js:152` `resolveApplicantUserId`) + เทสต์ที่ล้มก่อนแก้ว่า FAIL สร้างแถว notification ของผู้ยื่นจริง (ไม่ mock fanout)

**D2. ผู้ยื่นส่งหลักฐานแก้ CAR แล้วระบบแจ้งผู้ตรวจพื้นที่ทุกคนทุกองค์กร** · [M19, M08-T02]
- `routes/api/applications/applications-car.js:361-367` ใช้ `listActiveProviders()` (`services/provider-user-service.js:267` ไม่มีตัวกรององค์กร) แล้วส่งเลขคำขอถึงทุก `field_inspector`
- ขัดคำสั่ง 17 (องค์กรใดองค์กรนั้น) และคำสั่ง 29 (CAR พิจารณาโดยผู้ตรวจพื้นที่คนเดิม) · `56800d8b` ("งาน CAR เป็นของผู้ตรวจพื้นที่") ไม่ได้แตะการแจ้งนี้
- แก้: ส่งถึง `application.auditorId` คนเดียว (ไม่มี = ไม่ส่ง + log)

**D3. คำขอที่ยังไม่เคยกด "ชำระ" ไม่มีวันถูกเตือนหรือปิด** · [M05-T09, M04]
- `jobs/payment-closure-job.js:180` และ `payment-reminder-job.js` ทำงานจากแถว `invoice` ที่ `serviceType` ขึ้นต้นด้วย checkout เท่านั้น · ใบแจ้งหนี้มินต์ตอนผู้ยื่นกดจ่าย (`workflow-side-effects.js` คอมเมนต์หลัง auto-chain: "ใบแจ้งหนี้จริงมินต์ที่ /api/payments/checkout ... ตอนผู้ยื่นกดจ่าย")
- ผลที่เกิด: ยื่นแล้วไม่กดจ่าย (หรือเอกสารผ่านแล้วไม่กดจ่ายงวด 2) = ค้าง PENDING_DOC_FEE / PENDING_AUDIT_FEE ตลอดไป ไม่มีเตือน ไม่มีปิด · ขัดเส้นงานขั้น 3 "unpaid past deadline → EXPIRED"
- ต่ออายุโดนหนักสุด: หน้าเปิดแล้วสร้างคำขอ PENDING_AUDIT_FEE ทันที (D9) แล้วค้างไว้กันการต่ออายุครั้งถัดไป (`RENEWAL_ALREADY_IN_PROGRESS`)
- แก้: นับกำหนดจาก `validUntil` ของใบเสนอราคา/เวลาเข้าสถานะ แทนการมีอยู่ของ invoice — ดู Q2

**D4. ไม่มีแจ้งเตือน "ชำระสำเร็จ / ออกใบเสร็จแล้ว" ถึงผู้ยื่น** · [M19, M05-T03]
- `services/notification/domain-helpers.js:70` `notifyPaymentSuccess` และ `:94` `notifyPaymentFailed` มีผู้เรียก 0 จุด · `checkout-settlement-service.js` ไม่ส่งแจ้งเตือนใด ๆ ถึงผู้ยื่น (มีแค่แจ้งแอดมินกรณีปฏิเสธ `:271`)
- ผู้ยื่นจ่ายผ่าน QR แล้วต้องเปิดหน้าเองเพื่อรู้ว่าเงินเข้า และไม่รู้ว่าใบเสร็จออกแล้ว · คู่กับ dispatcher ข้อ 2 (ผู้จัดคิวไม่ได้แจ้งงานเข้า) แต่คนละผู้รับ
- แก้: เรียกจากหลัง commit ของ settle (best-effort) ส่งถึงผู้ยื่น + ผู้ถือ (ตาม Q4)

**D5. ไม่มีการแจ้งผู้ถือ (holder) ที่ขั้นใดเลย** · [M19]
- ทั้งระบบส่งถึงคนเดียว: ผู้ยื่น (`healthUserId`/`farmerUserId`) หรือ `cert.userId` · `grep holder|EntityMember` ใน `notification-fanout-service.js`, `notification-service.js`, `notification/domain-helpers.js`, `audit/audit-schedule-notices.js`, `certification-decision-notify.js` = 0
- ขัดตรงตัว: คำสั่ง 29 "อนุมัติแล้วจบที่ CERTIFIED ทันทีที่ออกใบ **แจ้งผู้ยื่นและผู้ถือ**" และคำสั่ง 27 (แจ้งเตือนของผู้จัดคิวถึงทั้งผู้ยื่นและผู้ถือ)
- ผลระยะยาว: เตือนใบใกล้หมดอายุ (`jobs/scheduler.js:56`, `cron/renewal-reminder-cron.js:141`) ส่งถึง `cert.userId` คนเดียว ถ้าผู้ยื่นเดิมออกจากบริษัท ไม่มีใครในบริษัทรู้ว่าใบใกล้หมด
- แก้: ตัวช่วยกลางตัวเดียว `notifyApplicantAndHolder(applicationId, notice)` = ผู้ยื่น ∪ สมาชิกผู้ถือที่มีสิทธิ์ `SUBMIT_APPLICATION` (ตัด id ซ้ำ) แล้วใช้ทุกจุด — ขอบเขตผู้รับดู Q4

**D9. ต่ออายุเสียทั้งเส้น** · [M22]
- (ก) หน้า `/health/applications/renewal` สร้างคำขอทันทีที่เปิดหน้า (`app/health/applications/renewal/client-view.tsx:267` `useEffect` → `createRenewal`) ⇒ แค่เปิดดูก็ได้คำขอค้างชำระ 1 ใบ
- (ข) หน้าเดียวกันบอกว่า "ระบบยังรับชำระค่าต่ออายุไม่ได้" (`client-view.tsx:53` `RENEWAL_PAYMENT_WIRED = false`, ป้ายเตือน + ลิงก์ `mailto:`) ทั้งที่ backend จ่าย M2 ของการต่ออายุได้แล้ว (`services/checkout/stripe-checkout-service.js:71` `RENEWAL_MILESTONE`, `:334`) · คอมเมนต์หัวไฟล์อ้างว่า renewal-service "only creates a DRAFT" ซึ่งไม่จริงแล้ว (`renewal-service.js:246,472` สร้างที่ PENDING_AUDIT_FEE)
- (ค) ข้ามการตรวจเอกสาร (`renewal-service.js` หัวไฟล์ W12, `submission-entry-state.js:40` `RENEWAL_ENTRY_STATE`) ขัดมติปัจจุบันคำสั่ง 25 ข้อ 11 "การต่ออายุไม่ข้ามการตรวจเอกสาร — ตรวจสั้น: ใบอนุญาต สิทธิในที่ดิน คำรับรองว่าไม่เปลี่ยนแปลง" · ประตู `/renewals` ไม่ขอเอกสารหรือคำรับรองใดเลย และไม่ผ่านความยินยอมเงื่อนไขก่อนสร้างคำขอที่มีราคา (ด่านเงื่อนไขอยู่ที่ checkout ซึ่งยังป้องกันการตัดเงินอยู่)
- (ง) สองทางสร้างคำขอต่ออายุเขียนสถานะนอกเครื่องสถานะ: สร้างแถวที่ PENDING_AUDIT_FEE ตรง ๆ และ SUBMITTED→PENDING_AUDIT_FEE ไม่อยู่ใน `ALLOWED_TRANSITIONS`
- แก้ตามลำดับ: ถอด auto-create (สร้างเมื่อกดปุ่ม) → ส่งต่อไปหน้า checkout เดิม → ทำเส้นตรวจสั้นตาม proposal ระยะที่วางไว้

### กลาง

**D6. ประตู `/api/revision-deadline/*` ขัดกฎการแก้ไขและไม่มีหน้าจอเรียก** · [M03-T02 ฝั่งผู้ยื่น]
- `routes/api/applications/revision-deadline.js:201` POST รับ `daysAllowed` จาก body (ค่าเริ่ม 5 แต่ส่งค่าอื่นได้) · `:340` `/extend` ให้ผู้ตรวจต่อเวลา +3 วันทำการซ้ำได้ (ขัด "5 วันทำการต่อรอบ" ถ้า operator ไม่ได้ตั้งใจให้มีการต่อเวลา — Q5)
- `:169` `/submit` ของผู้ยื่นเปลี่ยนแค่แถว deadline เป็น SUBMITTED ไม่เดินสถานะคำขอ ⇒ คำขอค้าง REVISION_REQUESTED และ cron ข้าม (อ่านเฉพาะ PENDING/EXTENDED) = ไม่มีวันถูกยกเลิก · ไม่มีหน้าเว็บเรียกประตูนี้เลย (`grep revision-deadline apps/web-app/src` = 0)
- แก้: ลบ POST/`/submit`/`/extend` (คำสั่ง 12) เหลือ GET ถ้ายังมีคนอ่าน

**D7. ไม่มีทางยื่นสำหรับ "ที่ดินของญาติ/ผู้อื่นที่ยินยอมให้ใช้"** · [M01-T03]
- `step3-site-land-config.ts:24` `LAND_TENURE_OPTIONS` มีแค่ เป็นเจ้าของ / ได้รับอนุญาตจากรัฐ / เช่า · คำสั่ง 24: ที่ดินญาติ = ต้องมีหนังสือยินยอม · proposal ข้อ 7 กำหนดตัวเลือก "ใช้ที่ดินของผู้อื่น (เช่า หรือได้รับยินยอม รวมญาติ คู่สมรส มรดก)"
- ผู้ยื่นที่ใช้ที่ญาติวันนี้ต้องเลือก "เป็นเจ้าของ" (ผิดและระบบไม่ขอหนังสือยินยอม) หรือ "เช่า" (ผิดข้อเท็จจริง) · ฝั่งเซิร์ฟเวอร์รองรับคำ `CONSENT` แล้ว (`application-requirements-service.js:149` `LAND_TENURE_BY_INPUT`) แต่หน้าจอไม่ส่ง
- อยู่ในแผน redesign ระยะที่อนุมัติแล้ว — บันทึกไว้เป็นช่องว่างที่ยังเปิด

**D8. เตือนก่อนครบกำหนดแก้ไข (48/24 ชม.) ไม่มีตัวตั้งเวลาในโค้ด** · [M19]
- เตือนอยู่ใน `routes/api/system/cron.js:129` (`GET /auto-cancel` ใช้ header `CRON_SECRET`) ซึ่งต้องมีตัวยิงจากภายนอก · `jobs/scheduler.js` ไม่มีงานนี้ · เข้า host staging ไม่ได้ (SSH publickey denied) จึงยืนยันไม่ได้ว่ามี crontab ภายนอก
- ประตูนี้ยังยกเลิกคำขอซ้อนกับ `revision-deadline-checker` (สองตัวเขียน EXPIRED คนละกติกา อ่านกำหนดจาก formData ก่อน)
- แก้: ย้ายส่วนเตือนเข้า `jobs/scheduler.js` แล้วลบประตู HTTP

**D10. ล็อกเวอร์ชันของ autosave ส่งแต่ไม่ถูกใช้** · [M01-T02]
- เว็บส่ง `expectedVersion` (`use-auto-save.ts` `buildDraftPayload`) · `POST /api/applications/draft` (`applications.js:639`) ไม่อ่านค่านี้ ใช้ `draftSaveClock` ต่อ session (`application-applicant-query-methods.js` คอมเมนต์ "another session is not compared (last writer wins)")
- ผลที่เกิด: สมาชิกผู้ถือสองคน (หรือสองแท็บต่าง session) แก้ร่างเดียวกัน คนหลังทับคนแรกเงียบ ๆ — R2 เปิดให้สมาชิกทุกคนเห็นคำขอของผู้ถือแล้ว กรณีนี้จึงเกิดได้จริง
- แก้: ปฏิเสธ 409 เมื่อ `expectedVersion` ไม่ตรง (ถ้าส่งมา) หรือเลิกส่งแล้วบันทึกว่าตั้งใจ

**D13. ประตูยื่นแบบชุด (bundles) ยังเปิดและพาคำขอไปค้างที่ SUBMITTED** · [M01-T01]
- `routes/api/applications/application-bundles.js:461` POST `/:id/submit` เมาท์สองที่ (`routes/api/index.js:126,154`) ไม่มีหน้าเว็บเรียก · ไม่มี `requireConsent` · เขียนสมาชิกชุดเป็น SUBMITTED โดยไม่มีใบเสนอราคา/ทางจ่าย (คอมเมนต์ที่ `applications.js` "a bundle bills once" แต่ไม่มีที่เรียกเก็บ) ⇒ คำขอค้างถาวร
- แก้: ลบทั้งไฟล์ (คำสั่ง 12)

**D14. เตือนใบใกล้หมดอายุส่งซ้ำทุกวัน 30 วัน** · [M19, M22]
- `jobs/scheduler.js:40-90` ทุกเที่ยงคืนส่ง `CERTIFICATE_EXPIRING` ทุกใบที่หมดภายใน 30 วัน ไม่มีตัวกันซ้ำ (`sendNotification` ไม่ dedupe) · ซ้อนกับ `renewal-reminder-cron` (60/30/15 วัน มีกันซ้ำ) ⇒ ผู้ยื่นได้ ~30 ข้อความ + 2 ข้อความซ้อน
- แก้: ลบงานในข้อ 0:00 ให้เหลือ renewal-reminder ตัวเดียว

### ต่ำ (ถ้อยคำ ซาก)

- **D11** อีโมจิในหัวข้อแจ้งเตือนถึงผู้ยื่น: `notification-service.js:188` "⛔", `:205` "⏳", `:153-202` (📅📋📝⏰🚨) · `workflow-side-effects.js:345` "❌" — ขัดมติไม่ใช้อีโมจิ
- **D12** ข้อความ `APPLICATION_EXPIRED` (`notification-service.js:189-194`) ใช้กับทั้งเลยกำหนดแก้ไขและค้างจ่าย แต่ชวน "ติดต่อขอเปิดเคสอนุโลม" แม้กรณีค้างจ่ายซึ่งเปิดไม่ได้ (`payment-closure-job` closedReason PAYMENT_ABANDONED) และเรียกผู้อนุมัติว่า "ฝ่ายบัญชี" · ใช้ "ท่าน" ในแจ้งเตือนที่ไม่ใช่การคืนเงิน (`workflow-side-effects.js:271`, `:380`) ขัดคำสั่ง 26 · ปนคำ "ใบสมัคร" กับ "คำขอ"
- **D15** หน้าเข้าสู่ระบบบน staging เขียน "สำหรับประชาชน / เกษตรกร" (ภาพ 02) — `health` = บุคคลทั่วไป ไม่ใช่เกษตรกร
- **D16** ซากในคอมเมนต์/เส้นทางเก่า: หัวไฟล์ `routes/api/applications/quotations.js:9` "Two-issuer billing model DTAM → state fee" (ถอดแล้ว) · `services/billing/payment-terms-gate.js` อ้าง slip rail/`payment-slip-service` · `services/payment-service-phase-flow.js` (`/payments/create` → `createPhase1Payment`) ยังมินต์ `phase1InvoiceId INV-…` "ที่ slip-flow ต้องใช้" และเขียนสถานะด้วย `actorRole: 'HEALTH'` ตัวพิมพ์ใหญ่ — ยังถูกเรียกจาก `lib/services/submit-and-hand-over.ts:144` จึงลบทันทีไม่ได้ ต้องตัดออกจากเส้นยื่นก่อน · `routes/api/system/provider.js` คอมเมนต์ `PLATFORM_ADMIN`
- **D17** ปฏิทินวันหยุดเป็นตารางในโค้ด (`utils/working-days.js:45,80` `EXTRA_HOLIDAYS_BY_YEAR`) — วันหยุดพิเศษที่ ครม. ประกาศกะทันหัน (คำสั่ง 28 ให้ข้าม) ต้อง deploy ถึงจะนับ ⇒ Q6

### ไม่ใช่ finding (ตรวจแล้วถูก)

- ไม่พบ active entity / `x-active-entity-id` / "สลับพื้นที่ทำงาน" ที่ใช้งาน (`my-entities-provider.tsx:55` แค่ลบค่าเก่าใน localStorage) · หน้า `/health/workspaces` เป็นรายการผู้ถือ ไม่ใช่ตัวสลับ
- ทุก read ฝั่งผู้ยื่นที่ตรวจ (submit, quotations, revision, CAR, certificates/my, download) ผ่าน `holderScope`/`holderReadWhere`
- ไม่พบเส้นทางจ่ายแบบมีคนอนุมัติ, DTAM remittance, 2FA/รีเซ็ตรหัสทางอีเมล-SMS ในเส้นผู้ยื่น · ช่องทางจ่าย = PromptPay อย่างเดียว
- อายุใบรับรองเป็นค่ามีวันที่กำกับ (staging ตอบ 12 เดือน) · ป้าย EXPIRED/CANCELLED บน main ถูกตามคำสั่ง 30 (staging ยังไม่มีชุดนี้)

## คำถามนโยบาย (พร้อมคำตอบที่แนะนำ)

- **Q1 บุคคลธรรมดาเป็นผู้ถือใบได้ไหม** — มติ 2026-09-07 ห้ามเฉพาะ "บริษัท/วิสาหกิจถูกบันทึกเป็นบุคคล" โค้ดยอมให้คำขอแบบบุคคลถือในนามตัวเอง แต่เส้นงานที่ยืนยัน 2026-10-06 เขียนว่า "ยื่นในนามบริษัทผู้ถือ" · **แนะนำ: ให้บุคคลธรรมดาถือได้** (ใบอนุญาต ภท. ออกให้บุคคลได้ และเกษตรกรรายย่อยคือกลุ่ม pilot) แล้วแก้ถ้อยคำเส้นงานเป็น "ยื่นในนามผู้ถือ (บุคคล/บริษัท/วิสาหกิจ)"
- **Q2 ไม่กดจ่ายนานเท่าไรจึงยกเลิก** — **แนะนำ:** งวด 1 = ใบเสนอราคาหมดอายุ (7 วันทำการ) แล้วตามด้วยเกณฑ์ค้างจ่ายเดิม 30 วันปฏิทิน นับจากวันออกใบเสนอราคาแทนวันมินต์ invoice · งวด 2 = 15 วันทำการจากวันเอกสารผ่าน (ตรง `INVOICE_DUE_BUSINESS_DAYS.M2`) แล้ว 30 วัน · เตือนสามครั้งเดิมนับจากวันเดียวกัน · ผลปิด = EXPIRED แบบเปิดอนุโลมไม่ได้ (เหมือนเดิม)
- **Q3 ผู้ยื่นถอนคำขอเองได้ไหม** — ตอนนี้ไม่มีทาง เงื่อนไข v1.3 พูดถึงการยกเลิกของผู้ยื่น (ไม่คืนเงิน) · **แนะนำ: มีปุ่ม "ถอนคำขอ"** ก่อนผู้ตรวจเอกสารเริ่มงาน → CANCELLED (คำเดียว "ยกเลิก") ไม่คืนเงิน ต้องมี `SUBMIT_APPLICATION` บนผู้ถือ + หน้าต่างยืนยันที่บอกว่าไม่คืนเงิน · หลังเริ่มตรวจแล้วไม่ให้ถอน (ปล่อยให้เดินตามกำหนด)
- **Q4 "แจ้งผู้ถือ" หมายถึงใคร** — **แนะนำ:** สมาชิกผู้ถือที่มีสิทธิ์ `SUBMIT_APPLICATION` (เจ้าของ/ผู้ดูแล) ∪ ผู้ยื่น ตัดคนซ้ำ · ใช้กับ: ชำระสำเร็จ, ส่งแก้/CAR (มีกำหนด), นัดตรวจ, ผลตรวจ, ออกใบ, ยกเลิก/เลยกำหนด, ใบใกล้หมดอายุ · เรื่องภายใน (มอบงาน) ส่งเฉพาะผู้ยื่น
- **Q5 เจ้าหน้าที่ต่อเวลาแก้ไขได้ไหม** — คำสั่ง 28 ไม่พูดถึง · **แนะนำ: ไม่ได้** (กฎเดียว 5 วันทำการ แก้ได้ไม่จำกัดรอบ ทางออกเมื่อเลยกำหนดคืออนุโลมที่มีผู้อนุมัติ) แล้วลบ `/extend`
- **Q6 วันหยุดพิเศษ** — **แนะนำ:** ย้ายวันหยุดเป็นข้อมูลมีวันที่กำกับที่ `system_admin_dtam` เพิ่มได้ (มีบันทึก audit) โดยกำหนดที่ออกไปแล้วไม่ถูกคำนวณใหม่ย้อนหลัง

## ตารางรหัสงาน → สถานะ (มุมผู้ยื่น)

| รหัส | สถานะ | ข้ออ้าง |
|---|---|---|
| M01-T01 wizard + service | บางส่วน | ใช้ได้ในเส้นหลัก · ประตู bundles ค้าง (D13) |
| M01-T02 autosave optimistic lock | บางส่วน | D10 |
| M01-T03 กทล.1 + ตรวจก่อนยื่น | บางส่วน | ที่ดินญาติ/ยินยอมไม่มี (D7) |
| M01-T04 หน้าสถานะผู้ยื่น | ใช้ได้ (main) · staging ยังไม่มีป้ายปิดใหม่ | `lib/constants/workflow-states.ts:63`, `app/health/status/client-view.tsx:96` |
| M02-T01 อัปโหลดรายช่อง | ใช้ได้ (โค้ด) | `applications.js:1620` + `middleware/draft-document-upload.js` |
| M02-T02 ตรวจชนิด/เนื้อไฟล์ + signed URL | ใช้ได้ (โค้ด) | `services/upload-content-guard.js`, `routes/api/files/files.js:46` |
| M05-T01 ใบเสนอราคา + ยอมรับ (7 วันทำการ) | ใช้ได้ | ขั้น 2 · ซากคอมเมนต์ D16 |
| M05-T05 PromptPay QR | ใช้ได้ | `stripe-checkout-service.js:859` |
| M05-T09 หน้าชำระเงิน + ประวัติ | บางส่วน | ไม่แจ้งชำระสำเร็จ (D4) · ไม่กดจ่าย = ค้างตลอด (D3) · ไม่ได้เดินจริง (บัญชีทดสอบถูกปฏิเสธ) |
| M07-T01 PDF ใบรับรอง | ใช้ได้ (โค้ด) | `certificates.js:467` |
| M07-T03 verify ผ่าน QR | ใช้ได้ | staging ตอบจริง |
| M09-T02 รอบปลูกหลังได้ใบ | ใช้ได้ (โค้ด) | `planting-service.js` `createCycle` |
| M09-T03 ล็อต + QR | ใช้ได้ (โค้ด ไม่ได้เดิน) | T&T แช่แข็ง ไม่แตะ |
| M19 แจ้งเตือน | **เสีย** | D1, D2, D4, D5, D8, D11, D12, D14 |
| M22 ต่ออายุ | **เสีย** | D9 |

## ไฟล์หลักฐาน

- ภาพ staging (ไม่ล็อกอิน): `reports/role-workflow-auditor/2026-10-07-applicant/01-landing.png` … `08-renewal-loggedout.png` · ข้อความหน้า + URL ปลายทาง: `pages.json`
- GET สาธารณะที่อ้าง: `/api/health` (revision b74a31ff), `/api/auth/idp/providers`, `/api/certificate-validity`, `/api/public/verify/TH-GACP-NOPE`
