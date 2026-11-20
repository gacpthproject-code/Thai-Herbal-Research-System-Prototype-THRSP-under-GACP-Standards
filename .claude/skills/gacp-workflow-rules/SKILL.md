---
name: gacp-workflow-rules
description: กติกา state machine ของคำขอ GACP — 19 สถานะ, edge ที่ถูกกฎหมาย, role ไหนเดิน edge ไหนได้. Use when touching application status, workflow transitions, S0-S6 stage mapping, role permissions on a transition, checkout order status, or when a status string appears in a query/test/report. Also: the document pre-check (8 slots, warn-only, never a workflow gate).
---

# GACP Workflow Rules

SSOT ของ state machine คือ `apps/backend/services/workflow-transition-service.js`
เท่านั้น (domain `workflow-status-vocab` ใน `scripts/probes/ssot-domains.txt` —
มีไฟล์นิยามได้ไฟล์เดียว) ห้ามเดาสถานะ ห้าม copy ตารางไปไว้ที่อื่น

**หมายเหตุการอ้างอิงในไฟล์นี้**: อ้างด้วยชื่อ const/function/object-key เท่านั้น
ไม่อ้างเลขบรรทัด (เลขบรรทัดขยับทุก commit — ใช้ `grep -n "<symbol>"` เพื่อหาบรรทัดจริงเสมอ)

## เมื่อไรใช้

- จะเขียน/แก้ transition, เพิ่มสถานะ, เพิ่มสิทธิ์ role
- จะ query `status` / เขียน test ที่ hardcode ชื่อสถานะ
- จะ map "ขั้นตอน S0–S6" ในรายงาน/UI
- เจอชื่อสถานะแปลกๆ ใน log แล้วไม่แน่ใจว่ามีจริงไหม

## 19 สถานะ (`WORKFLOW_STATES`)

`DRAFT` `SUBMITTED` `PENDING_DOC_FEE` `DOC_FEE_PAID`
`ASSIGNED_FOR_REVIEW` `REVISION_REQUESTED` `DOC_APPROVED` `PENDING_AUDIT_FEE`
`AUDIT_FEE_PAID` `AUDIT_CONFIRMED` `CAR_PENDING`
`CAR_REVIEWING` `AUDIT_PASSED` `AUDIT_NOT_PASSED` `APPROVED` `CERTIFIED` `REJECTED` `EXPIRED`
`CANCELLED`

`PHASE_1_SLIP_UNDER_REVIEW` / `PHASE_2_SLIP_UNDER_REVIEW` **ถูกถอดแล้ว** (2026-09-11,
memory `slip-and-account-approve-retired`) — comment เหนือ `WORKFLOW_STATES` บอกว่า
0 แถวยืนยันแล้วบนทั้งสาม DB ก่อนลบ (ยืนยันได้จากโค้ดวันนี้แค่ว่าค่านั้นไม่อยู่ใน array
แล้ว — ตัวเลข "0 แถว" มาจาก comment ของ commit ที่ลบ ไม่ใช่สิ่งที่ agent เช็คซ้ำได้จาก repo)
และอยู่ใน `LEGACY_STATUS_SPELLINGS` (`eslint-rules/no-legacy-status-vocabulary.js`) ห้ามกลับมา

ค่าอื่นทั้งหมด = defect. `normalizeWorkflowStateInput()` **fail-closed** คืน `null`
ไม่ resolve alias ให้อีกแล้ว และ `status` column กับ canonical state เป็น
vocabulary เดียวกัน (`buildTransitionUpdate()` เขียน `nextLegacyStatus = nextState`
ตรงๆ ไม่มี lookup คั่นกลาง)

## Transition map (`ALLOWED_TRANSITIONS`)

| from | → to ที่ถูกกฎหมาย |
|---|---|
| `DRAFT` | `SUBMITTED` |
| `SUBMITTED` | `PENDING_DOC_FEE`, `DOC_FEE_PAID` (เฉพาะคำขอต่ออายุ ไม่มีค่าตรวจเอกสาร มติ 2026-09-07 · ตัวเขียนสถานะปฏิเสธคำขอที่ไม่ใช่ต่ออายุด้วย `PAYMENT_NOT_SETTLED` ใน `assertRenewalSkipsOnlyTheDocumentFee`) |
| `PENDING_DOC_FEE` | `DOC_FEE_PAID`, `EXPIRED`, `CANCELLED` (ผู้ยื่นถอน ไม่คืนเงิน คำสั่ง 32) |
| `DOC_FEE_PAID` | `ASSIGNED_FOR_REVIEW`, `CANCELLED` |
| `ASSIGNED_FOR_REVIEW` | `DOC_APPROVED`, `REVISION_REQUESTED` |
| `REVISION_REQUESTED` | `ASSIGNED_FOR_REVIEW`, `EXPIRED` |
| `DOC_APPROVED` | `PENDING_AUDIT_FEE` |
| `PENDING_AUDIT_FEE` | `AUDIT_FEE_PAID`, `EXPIRED` |
| `AUDIT_FEE_PAID` | `AUDIT_CONFIRMED`, `CANCELLED` |
| `AUDIT_CONFIRMED` | `AUDIT_PASSED`, `AUDIT_NOT_PASSED`, `CAR_PENDING`, `CANCELLED` |
| `CAR_PENDING` | `CAR_REVIEWING`, `EXPIRED` |
| `CAR_REVIEWING` | `AUDIT_PASSED`, `CAR_PENDING`, `AUDIT_CONFIRMED` (ลงพื้นที่ซ้ำ ผู้จัดคิวนัด เฉพาะเมื่อผู้ตรวจขอ) |
| `AUDIT_PASSED` | `APPROVED`, `CAR_REVIEWING`, `REJECTED` |
| `AUDIT_NOT_PASSED` | `REJECTED`, `CAR_PENDING` (ผู้อนุมัติตัดสินแฟ้มที่ผู้ตรวจพื้นที่ให้ไม่ผ่าน คำสั่ง 56(2)) |
| `APPROVED` | `CERTIFIED` |
| `EXPIRED` | `REVISION_REQUESTED`, `CAR_PENDING` (waiver-reopen เท่านั้น) |
| `CERTIFIED` / `REJECTED` / `CANCELLED` | ∅ terminal |

แต่ละงวดมี**ขาเดียว**สู่สถานะจ่ายแล้ว — webhook ที่ยืนยันแล้ว ไม่มีขามนุษย์คู่กันแล้ว
(comment เหนือ `ALLOWED_TRANSITIONS.PENDING_DOC_FEE`/`PENDING_AUDIT_FEE`: "Wave 2
(Stripe-only mandate) ... nobody approves a payment", ไม่มี slip อีกต่อไป)

## ใครเดิน edge ไหนได้ (`ROLE_TRANSITIONS`)

Role string ตาม `apps/backend/shared/canonical-rbac.js` (`CANONICAL_ROLES`, โมเดล
สามฝั่ง operator 2026-09-10, memory `role-vocabulary-three-sides` — **ไม่มี** `admin` /
`auditor` / `scheduler` / `account` เปล่า ๆ เป็น role string ที่ระบบรู้จักอีกแล้ว —
ยืนยันว่าไม่มีคีย์ `admin` ใน `CANONICAL_ROLES`/`ROLE_ALIASES` จริง)

| role (`ROLE_TRANSITIONS[CANONICAL_ROLES.X]`) | edge ที่ถือ |
|---|---|
| `HEALTH` (บุคคลทั่วไป — ผู้ยื่น, **ไม่ใช่**เกษตรกร: บริษัทถือใบรับรองเองได้, memory role-words-health-and-provider) | `DRAFT→SUBMITTED`, `REVISION_REQUESTED→ASSIGNED_FOR_REVIEW`, `CAR_PENDING→CAR_REVIEWING`, `PENDING_DOC_FEE→CANCELLED`, `DOC_FEE_PAID→CANCELLED` (ถอนคำขอก่อนผู้ตรวจเอกสารเริ่ม ไม่คืนเงิน `closedReason = CANCELLED_BY_APPLICANT` คำสั่ง 32 · `routes/api/applications/application-withdraw.js`) |
| `FINANCE_OFFICER_DTAM` / `FINANCE_OFFICER_PLATFORM` | **ชุดว่าง — ตั้งใจ** ไม่มีขาเดินสถานะเลยตั้งแต่ slip ถูกถอด (ดูหมายเหตุใต้ตาราง) |
| `DOCUMENT_REVIEWER` | `ASSIGNED_FOR_REVIEW→{DOC_APPROVED, REVISION_REQUESTED}` · แก้ช่องในคำขอโดยไม่เปลี่ยนสถานะ (`PATCH /api/provider/applications/:id/form-fields`) เขียนเมื่อ `version` และ `formData` ยังเป็นค่าที่อ่านไว้เท่านั้น ชนกันแล้วอ่านใหม่และวางเฉพาะช่องที่ตัวเองแก้ (ไม่เกิน `EDIT_ATTEMPTS` 3 รอบ แล้ว 409 `APPLICATION_STATE_CHANGED`) ผู้ตรวจสองคนแก้คำขอเดียวกันพร้อมกัน ช่องที่ทั้งคู่แก้จะเป็นค่าของคนที่เขียนทีหลัง ช่องอื่นของคนแรกยังอยู่ (last writer wins ระดับช่อง) |
| `DISPATCHER` | `DOC_FEE_PAID→ASSIGNED_FOR_REVIEW`, `AUDIT_FEE_PAID→AUDIT_CONFIRMED`, `CAR_REVIEWING→AUDIT_CONFIRMED` (นัดลงพื้นที่ซ้ำ คำสั่ง 27 และ 29: ตัวเขียนสถานะตรวจใต้ล็อกแถวทุกประตูว่า `formData.reinspection` เป็น `REQUESTED` ของผู้ตรวจพื้นที่คนปัจจุบัน (`requestedBy` = `auditorId`) ไม่ใช่ = 400 `REINSPECTION_NOT_REQUESTED` และไม่เปลี่ยนผู้ตรวจ = 409 `REINSPECTION_SAME_INSPECTOR` (`assertSecondVisitWasAskedFor`) · นัดได้จากประตูปฏิทิน `POST /api/provider/scheduler/audits/schedules` เท่านั้น ประตูเปลี่ยนสถานะทั่วไปตอบ 409 `REINSPECTION_USE_CALENDAR` แม้ `force` · ประตูนัดเดิม `/api/audits/schedule` และ `PATCH /api/audits/:id/schedule` ลบแล้ว 2026-10-09 · การนัดทุกครั้ง (รวมเลื่อนนัด) ล็อกแถว อ่านใหม่ และเขียนเฉพาะเมื่อสถานะกับ `version` ยังเป็นค่าที่อ่านไว้ ไม่งั้น 409 `APPLICATION_STATE_CHANGED` · ตัวเขียนสถานะเองปฏิเสธคนที่เขียนไป `AUDIT_CONFIRMED` จากสถานะที่ไม่ใช่สถานะในแถวแล้ว (`assertWriteStartsWhereTheRowIs`)) |
| `FIELD_INSPECTOR` | `AUDIT_CONFIRMED→{AUDIT_PASSED, CAR_PENDING, AUDIT_NOT_PASSED}` (ไม่ผ่านไม่ปิดคำขอ ผู้อนุมัติตัดสิน คำสั่ง 56(2)), `CAR_REVIEWING→{AUDIT_PASSED, CAR_PENDING}`, `AUDIT_PASSED→CAR_REVIEWING` (ย้อนผลตัวเอง) · ไม่มีขาตรวจเอกสาร (คำสั่ง 27) · ระหว่าง `CAR_REVIEWING` บันทึกผล `REINSPECT` ได้ (สถานะไม่เปลี่ยน ตั้ง `formData.reinspection` เป็น `REQUESTED` ต้องมีเหตุผล เขียนแบบ compare-and-set บน `version` กดซ้อนกัน = 409) · `reinspection` มีชีวิตเฉพาะใน `CAR_REVIEWING`: นัดแล้วเป็น `BOOKED` ออกจาก `CAR_REVIEWING` ทางอื่นตัวเขียนสถานะปิดเป็น `CLOSED` (`closeUnbookedSecondVisit`) · คีย์นี้เป็นของเซิร์ฟเวอร์ (`SERVER_OWNED_FORM_DATA_KEYS`) |
| `CERTIFICATE_APPROVER` | `AUDIT_PASSED→{APPROVED, REJECTED, CAR_REVIEWING}` (ตีกลับให้ทบทวน), `APPROVED→CERTIFIED`, `AUDIT_NOT_PASSED→{REJECTED, CAR_PENDING}` · ทุกขาจากแฟ้มในคิวตัดสินผ่านด่านแยกหน้าที่ และเดินผ่านประตูของแฟ้มตัดสินเท่านั้น |
| `SYSTEM` | auto-advance หลัง submit/doc-approve (รวม `SUBMITTED→DOC_FEE_PAID` ของคำขอต่ออายุ), **settle จาก webhook**, cron expiry (revision/CAR deadline + payment-abandonment), waiver-reopen, ปิดคำขอเป็น `CANCELLED` เมื่อการเงินบันทึกการคืนเงินกรณีบริษัทหรือรัฐยกเลิกบริการ (`refund-service.recordProviderCancellationRefund`, คำสั่ง 22) |

- **`FINANCE_OFFICER_DTAM`/`FINANCE_OFFICER_PLATFORM` ถือชุดว่างโดยตั้งใจ** — เดิมสองบทบาทนี้
  ถือขาอนุมัติจ่ายเงินเป็นขาเดียวที่มี แต่ขานั้นถูกถอดทิ้ง 2026-09-11 พร้อมมติเลิกใช้ทั้งเส้น
  (memory `slip-and-account-approve-retired`) — การจ่ายเป็น Stripe checkout + settle ด้วย
  webhook (`checkout-settlement-service.js`) ไม่มีคนอนุมัติการจ่ายอีกแล้ว ชุดว่างคือความจริงของงาน
  ไม่ใช่ของที่ลืมเติม ห้ามลบสองคีย์นี้ทิ้ง
- **ชุดว่างไม่ได้แปลว่าเดินได้ทุกขา** — มีสองทางเช็คคนละแบบ:
  - **ทางอ่าน** `canTransition(from, to, {actorRole})`: ถ้า role นั้นไม่มีคีย์ใน
    `ROLE_TRANSITIONS` เลย (เช่น role แปลกๆ หรือ `SYSTEM_ADMIN_PLATFORM` ที่ไม่มีแถว)
    จะ**ข้าม**การเช็ค role แล้วตอบตาม edge-legality เท่านั้น — ผ่อนปรนจริง (comment ในโค้ด
    เรียกพฤติกรรมนี้ว่า "ADMIN falls through" ทั้งที่ `admin` ไม่ใช่ role string จริงแล้ว)
  - **ทางเขียนจริง** `buildTransitionUpdate()` เรียก `canRoleTransition()` ซึ่ง**fail-closed**:
    ไม่มีคีย์ = `permissions` เป็น `undefined` = คืน `false` = throw "Role X cannot
    transition" ทันที ⇒ role ที่ไม่มีแถวใน `ROLE_TRANSITIONS` **เดินไม่ได้เลยสักขาบนทางเขียนจริง**
    (`FINANCE_OFFICER_DTAM`/`FINANCE_OFFICER_PLATFORM` มีแถวแต่เป็นชุดว่าง = เดินไม่ได้เหมือนกัน
    คนละเหตุผล — คีย์มีแต่ Set ว่าง vs ไม่มีคีย์เลย)
  - อย่าพูดว่า "role ไม่มีแถว = เดินได้ทุกขา" เฉยๆ โดยไม่บอกว่าจริงแค่ทาง `canTransition`
    อ่านเดี่ยวๆ — เขียนจริงต้องผ่าน `buildTransitionUpdate()` ซึ่งปิดประตูนั้น
- **`force` เป็นของ `SYSTEM_ADMIN_DTAM` เท่านั้น** — `buildTransitionUpdate()` throw
  "Only admin can force workflow transition" ทันทีถ้า `canonicalRole !==
  CANONICAL_ROLES.SYSTEM_ADMIN_DTAM` **ไม่มี role อื่นตั้ง force ได้เลย** ไม่ใช่
  `system_admin_platform` ไม่ใช่ "admin" (ไม่มี role string นี้อยู่จริง)
- **สถานะที่เป็นการตัดสิน ประตูกู้สถานการณ์ตั้งให้ไม่ได้** (คำสั่ง 31, operator 2026-10-07 "ไม่ให้ทำ"):
  `DECISION_STATES` = `DOC_APPROVED`, `REVISION_REQUESTED` (ผู้ตรวจเอกสาร), `AUDIT_PASSED`,
  `AUDIT_NOT_PASSED` (ผู้ตรวจพื้นที่), `CAR_PENDING` (ผู้ตรวจพื้นที่ + ผู้อนุมัติ), `REJECTED` (ผู้อนุมัติคนเดียว, คำสั่ง 56(2)), `APPROVED`, `CERTIFIED`
  (ผู้อนุมัติ) · เจ้าของแต่ละสถานะอ่านจาก `shared/decision-states.js` (`DECISION_STATE_OWNERS` ตรึงให้ตรงกับ
  `ROLE_TRANSITIONS` ด้วยเทสต์ และทุกสถานะที่มีบทบาทมนุษย์บทบาทเดียวเดินเข้าต้องอยู่ในตารางหรือใน
  `NOT_DECISION_STATES` พร้อมเหตุผล) · ตัวเขียนสถานะปฏิเสธผู้เขียนที่ไม่ใช่เจ้าของด้วย
  `DECISION_STATE_NOT_FORCEABLE` (409) ทุกประตู ทุกสถานะต้นทาง: force-status, PATCH status, status-override,
  workflow force, revert · SYSTEM เขียนสถานะการตัดสินได้เฉพาะตามขาของตัวเองใน `ROLE_TRANSITIONS`
  (เช่น waiver reopen `EXPIRED→REVISION_REQUESTED`) ทางลัด e2e ไป `APPROVED`/`CERTIFIED` จึงถูกปฏิเสธ ·
  batch ไม่มี REQUEST_DOCUMENTS แล้ว · ประตูกู้ยังพาคำขอที่ค้างไปสถานะที่ไม่ใช่การตัดสินได้
- **ผู้ดูแลปิดคำขอที่ผู้ยื่นแก้เองไม่ได้ = `CANCELLED` + เหตุจากรายการตายตัว** (คำสั่ง 35, 2026-10-07): ส่ง
  `closureReasonCode` (คีย์ของ `shared/application-closure-reasons.js`) ทุกประตูของผู้ดูแล ไม่มี = 400
  `APPLICATION_CLOSURE_REASON_REQUIRED` · บันทึก `closedReason = CANCELLED_BY_ADMIN` + `formData.adminClosure`
  · ข้อความอิสระเป็นแค่บันทึกภายใน ไม่ใช่เหตุ · แจ้งเตือนถึงผู้ยื่นใช้ป้ายของรหัส ต่อด้วยขั้นต่อไปจาก
  `APPLICATION_CLOSURE_NEXT_STEPS` เฉพาะรหัสที่ระบบเปิดทางให้จริง (ตอนนี้มีแค่ `PURPOSE_NOT_IN_SCOPE`
  วัตถุประสงค์ที่ถอดแล้ว เช่น MEDICAL: ผู้มีสิทธิ์ยื่นในนามผู้ขอรับรองยื่นคำขอใหม่ด้วยวัตถุประสงค์ที่ยังรับรองได้ พร้อมใบอนุญาตที่วัตถุประสงค์นั้นกำหนด) · **ไม่มี break-glass reopen จาก `EXPIRED` แล้ว** ทางออกเดียวคือเคสอนุโลม
  (waiver reopen) · **ไม่มีประตูต่อเวลาแก้ไข** (`/provider/admin/deadline-extension` และ
  `PUT /revision-deadline/:id/extend` ถูกลบ, คำสั่ง 28/32) · กฎเหตุปิดนี้ใช้กับ `system_admin_dtam` /
  `system_admin_platform` เท่านั้น ผู้ยื่นที่ถอนคำขอส่ง `closedReason` ของตัวเอง (`CANCELLED_BY_APPLICANT`)
  และ writer ไม่เขียนทับ
- **คนไม่พาคำขอออกจากจุดที่ปิดแล้ว** (คำสั่ง 30 และ 34(4), 2026-10-07) — บังคับที่ writer ทุกประตู
  (`assertPersonMayLeaveStoredStatus`) อ่านสถานะจริงในแถว ไม่เชื่อ `fromStatus` ของผู้เรียก · SYSTEM ผ่าน:
  `CANCELLED` ปิดถาวร คนย้ายออกไม่ได้ ไม่ว่ามีการคืนเงินหรือไม่ = 409 `APPLICATION_CANCELLED_FINAL` ·
  จาก `AUDIT_PASSED`/`APPROVED`/`CERTIFIED` ไม่มีใครปิดเป็น `CANCELLED` และหลังออกใบแล้ว
  (`APPROVED`/`CERTIFIED`) คนออกได้เฉพาะขาของบทบาทตัวเองใน `ROLE_TRANSITIONS` = 409
  `CERTIFICATION_TRACK_LOCKED` · ผู้ดูแลไม่เพิกถอนใบรับรอง ประตู workflow force จึงไม่ revoke อีกแล้ว
  การพักใช้/เพิกถอนเป็นของผู้อนุมัติใบรับรองพร้อมเหตุ
- **สองด่านของการรับรอง (ISO/IEC 17065 §7.6)**: `FIELD_INSPECTOR` บันทึกผลตรวจ,
  `CERTIFICATE_APPROVER` ตัดสินให้การรับรอง — คนละคนเสมอ operator สั่งแยกกลับ 2026-09-10
  (F-CERT-SOD) หลังจากมติ 2026-06-05 ให้ผู้ตรวจหน้างานคนเดียวออกใบเองถูกยกเลิก — **ห้าม
  อ่านโค้ดเก่า/ความจำที่บอกว่า auditor คนเดียวออกใบได้** ไม่ตรงกับโค้ดวันนี้อีกแล้ว
  (`buildTransitionUpdate()` มีด่าน `certificationDecisionRefusal()` เมื่อ
  `nextState === 'APPROVED'` — comment เหนือด่านนี้เล่าเรื่องมติกลับทั้งสองรอบ)

## ฝ่ายการเงิน — มติ operator

| มติ | สัญลักษณ์ในโค้ด |
|---|---|
| `finance_officer_dtam` กับ `finance_officer_platform` อ่านมุมมองบัญชีชุดเดียวกัน ไม่มีตัวกรองฝั่ง (2026-09-11) | merge แล้ว — `invoiceVisibleSide()`/`invoiceSideWhere()` เดิมที่แคบการอ่านถูกลบทั้งตัวจาก `routes/api/finance/invoice-helpers.js` (คอมเมนต์หัวไฟล์อธิบายเหตุ) · ขาเขียน hold/release ถูกลบแล้ว 2026-10-06 · `BOOKS_READ_ROLES` ของ `services/finance/company-books-access.js` มีทั้งสองบทบาทการเงินเท่ากัน · ใบกำกับภาษีซื้อ งบ และการปิดงวดถูกถอดทั้งประตูแล้ว (คำสั่ง 59 บัญชีทำนอกระบบ · `4fa34cb59`) |
| `finance_officer_dtam` **อ่านอย่างเดียว** — ไม่ปิดงวด ไม่ลงสมุดรายวันด้วยมือ ไม่ทำ WHT ไม่สร้างใบภาษีซื้อ ไม่คืนเงิน ไม่ระงับ/ปลดระงับ ไม่ออกใบเสร็จ (2026-09-27 "กรมฯ ดูอย่างเดียว") | merge แล้ว — `ACCOUNT_BASE_PERMISSIONS` (`shared/canonical-rbac.js`) เป็นสิทธิ์อ่านกับออกรายงาน · `RECEIPT_ISSUE` ถูกลบทั้งตัว 2026-10-06 ไม่มีบทบาทไหนออกใบเสร็จ ระงับใบแจ้งหนี้ หรืออนุมัติการชำระ |
| ข้อยกเว้นของ "ชุดเดียวกัน" (คำสั่ง 57 และคำสั่ง 64 ค6 ข้อ ก): เลขผู้เสียภาษีของผู้ซื้อแบบเต็มเห็นได้เฉพาะ `finance_officer_platform` บทบาทอื่นเห็นแบบปิดเลข (ตัวแรก + 4 ตัวท้าย) · ประตู PDF เอกสารการเงินฝั่งเจ้าหน้าที่ (ใบเสนอราคา ใบเสร็จ/ใบกำกับภาษี ใบลดหนี้ ใบเพิ่มหนี้) เปิดเฉพาะ `finance_officer_platform` ในองค์กรของตัวเอง บทบาทอื่นได้ 403 `FINANCE_PAPER_COMPANY_FINANCE_ONLY` · ประตูใบแจ้งหนี้ฝั่งเจ้าหน้าที่ไม่ส่ง `metadata` · ห้ามเสนอ diff ที่ทำให้สองบทบาทได้เลขเต็มหรือ PDF เท่ากัน | merge แล้ว (B0) — `readsFullTaxIds` (`FULL_TAX_ID_ROLES`) / `assertDownloadsFinancePapers` (`services/finance/company-books-access.js`) · `payerTaxBlockFor` (`services/finance/billing-select.js`) |
| อนุมัติ waiver-reopen ได้ทั้งสองบทบาท · อนุมัติเรื่องตัวเองไม่ได้ (2026-09-27) | merge แล้ว — `waiver-reopen.js` เปิดให้ทั้งสองบทบาทการเงิน (`listWaiverApproverIds`/`waiver-approvers.js`) · `WAIVER_SELF_APPROVAL` (`waiver-reopen-service.js`) กันอนุมัติเรื่องตัวเอง |
| `field_inspector` **ไม่มีสิทธิ์อ่านการเงิน/บัญชีเลย** (2026-09-27) — ใบงานตรวจถึงมือผู้ตรวจหลังจ่ายแล้วเท่านั้น ("ถ้าไม่จ่ายใบงานก็ไม่ถูกเปิดต่อ") ผู้ตรวจจึงไม่ต้องเห็นบิล | merge แล้ว — `ROLE_PERMISSIONS[FIELD_INSPECTOR]` ไม่มีสิทธิ์การเงิน (สิทธิ์ `PAYMENT_SLIP_*` ถูกลบทั้งชุด 2026-10-06) · ไม่อยู่ใน `BOOKS_READ_ROLES` ของ `company-books-access.js` |

- ใบเสร็จไม่มีคนออก — ระบบออกตอน settle (สกิล `gacp-payment-invariants` หัวข้อมติ 2026-09-27) · ประตูออกด้วยมือถูกลบแล้ว 2026-10-06
- `PENDING_DOC_FEE → DOC_FEE_PAID` และ `PENDING_AUDIT_FEE → AUDIT_FEE_PAID` เดินโดย SYSTEM ตอน webhook settle เท่านั้น · `application-status-writer.js` ปฏิเสธการเขียนสองสถานะนี้จากผู้เขียนอื่นด้วย `PAYMENT_NOT_SETTLED` (409) ถ้าไม่มี checkout order `SETTLED` ของงวดนั้น · force-status ของแอดมินไม่มีสองสถานะนี้ให้เลือก
- `GET /api/invoices/:invoiceId` เคย 500 จาก `classifyInvoiceSide` ที่ไม่มี export (`d5350740`, 2026-09-06) — **แก้แล้ว** `fix/finance-one-view` รอบแก้ 1 (`e5da42ba`) `invoice-helpers.js` export `classifyIssuerSide` (คนละชื่อ) และ `routes/api/finance/invoices.js` ไม่ import ชื่อเก่าแล้ว
- ราคาใบเสนอราคาเห็นได้เฉพาะผู้ยื่น + การเงินทั้งสองบทบาท + แอดมิน · PII เกินใน invoice ปิดแล้ว · ประตูสมุดบัญชีที่เหลือเช็คองค์กรผ่าน `organizationScope` ใน `company-books-access.js` (ประตูใบซื้อถูกถอดแล้ว คำสั่ง 59)

## ผู้ใช้ฝั่งสุขภาพเห็นอะไร — สมาชิกของ holder (R2, 2026-09-30)

สิ่งที่ผู้ใช้ฝั่งสุขภาพ (health role) เห็น = แถวที่ holder อยู่ในเซตสมาชิก ACTIVE ของตน (ทุก role รวม VIEWER) — `apps/backend/services/holder-access.js` (`holderScopeForUser`, `holderReadWhere`) · ไม่มี workspace ที่ใช้งานอยู่ ไม่มีการสลับ ไม่มี filer fallback · holder ของคำขอเลือกครั้งเดียวที่ขั้นตอนที่ 1 และเปลี่ยนไม่ได้ (ผิด = ลบฉบับร่างแล้วเริ่มใหม่) · ใครทำอะไรได้ยังเป็นของ per-permission engine ที่ holder: ยื่น/ชำระเงิน = `SUBMIT_APPLICATION`, พิมพ์ QR = `PRINT_QR`, ต่ออายุ/ขอใบแทน = `SUBMIT_APPLICATION` บน holder ต้นทางและต้องเป็น holder เดียวกับใบเดิม (สมาชิกที่มีสิทธิ์ทำได้ ไม่ต้องเป็นผู้ยื่นเดิม; ต่ออายุค้างได้ครั้งละหนึ่งคำขอต่อใบ) · ประตูเขียนล็อตยังจำกัดเจ้าของฟาร์ม เพราะ T&T แช่แข็ง

ไฟล์ของคำขอใต้ `/uploads` ใช้กติกาการอ่านชุดเดียวกับประตู JSON ทั้งตอนเปิดด้วยเซสชันและตอนออกลิงก์ลายเซ็น (`apps/backend/middleware/uploads-access.js` `authorizeUploadsObject`, ผลรีวิวความปลอดภัย M4): เอกสารผู้ยื่น (`application-drafts/`) และหลักฐาน CAR (`car/`) อ่านได้เมื่อเป็นสมาชิก ACTIVE ของ holder ของคำขอ (ค้นไฟล์ผ่าน `holderReadWhere`) ผู้ยื่นหรือผู้อัปโหลดที่ออกจากบริษัทแล้วอ่านไม่ได้ · ภาพหลักฐานตรวจพื้นที่ (`audits/`) ไม่มีประตูฝั่งสุขภาพ · เจ้าหน้าที่อ่านเมื่อ `isApplicationVisibleTo` ให้ (องค์กรเดียวกัน ไม่ทราบองค์กร = ปฏิเสธ ขอบเขตบทบาท ฝ่ายการเงินไม่อ่านเอกสาร) · คีย์ formData ที่ ACL อ่านเป็นรายการไฟล์ของคำขอ (`draftDocuments`, `carDocuments`) เป็นคีย์ของเซิร์ฟเวอร์ (`shared/form-data-ownership.js`): /prepare, submit และ revision ตัดทิ้ง ประตูอัปโหลดเขียนเอง (ผลรีวิว ff0caf457 M1) · `/uploads` เปิดสาธารณะเฉพาะ `lab-results/` โฟลเดอร์ที่ไม่รู้จักปิด (`uploads-classification.js` ผลรีวิว M3) และเสิร์ฟเฉพาะไฟล์ปกติที่อยู่ในโฟลเดอร์นั้นจริง symlink หรือไฟล์ใต้โฟลเดอร์ที่ลิงก์ออกไปได้ 404 (ผลรีวิว ff0caf457 L2) · ใบรับรอง PDF ได้จาก `GET /api/certificates/:id/download` ที่สร้างใหม่ทุกครั้ง ไม่เก็บสำเนา และเจ้าหน้าที่ยังไม่มีประตู PDF ใบรับรอง

## Invariant ที่ห้ามละเมิด

1. **สองประตูเงินเปิดด้วย SYSTEM เท่านั้น** — `ROLE_TRANSITIONS[CANONICAL_ROLES.SYSTEM]`
   ถือ `PENDING_DOC_FEE→DOC_FEE_PAID` และ `PENDING_AUDIT_FEE→AUDIT_FEE_PAID` ไม่มี
   role มนุษย์ถือ · ตัวเดินจริงคือ Stripe webhook (ดูสกิล `gacp-payment-invariants`) ·
   ประตูเขียนสถานะก็กันซ้ำ: ไม่ใช่ SYSTEM และไม่มี order `SETTLED` = 409 `PAYMENT_NOT_SETTLED`
2. **EXPIRED reopen เป็นของ SYSTEM เท่านั้น** — `EXPIRED→REVISION_REQUESTED` /
   `EXPIRED→CAR_PENDING` เดินโดย `waiver-reopen-service.js` หลังฝ่ายการเงินอนุมัติคำขอยกเว้นค่าธรรมเนียม
   (waiver ไม่ใช่การอนุมัติการชำระเงิน) ·
   **อนุมัติได้ทั้งสองบทบาท** (มติ 2026-09-27, merge `fix/finance-one-view` `6adfbdd8`):
   `APPROVER_ROLES` มีสองบทบาท และ `assertApprover()` ไม่ตรวจ issuer side อีกแล้ว — เช็คแค่
   role อยู่ใน `APPROVER_ROLES`, ไม่ใช่ผู้ยื่นเรื่องเอง (`WAIVER_SELF_APPROVAL`), และ active
   จริง (`isActiveWaiverApprover`) · ปลายทางต้อง derive จาก snapshot ฝั่งเซิร์ฟเวอร์ ห้ามให้
   caller เลือก (comment เหนือ `ALLOWED_TRANSITIONS.EXPIRED`)
3. **3 สถานะบังคับ comment** — `REVISION_REQUESTED`, `CAR_PENDING`, `REJECTED`
   (`REQUIRES_COMMENT_TARGETS`, บังคับใน `buildTransitionUpdate()`) ยกเว้นเมื่อ `force`
4. **แก้ฟอร์มได้ 3 สถานะ** — `DRAFT`, `REVISION_REQUESTED`, `CAR_PENDING`
   (`EDITABLE_STATUSES`, อ่านผ่าน `isApplicationEditable()`)
5. **revision/CAR loop ไม่จำกัดรอบ** — ตัวคุมคือ deadline ไม่ใช่ตัวนับรอบ: แก้เอกสาร 5 วันทำการ (คำสั่ง 28) ·
   แก้ข้อบกพร่องจากการตรวจพื้นที่ 30 วันปฏิทินตั้งแต่ 9 ต.ค. 2569 (คำสั่ง 56(2a), `CORRECTIVE_ACTION.ONSITE_WINDOW`)
   (comment ถัดจาก `EDITABLE_STATUSES`: "Loop limits removed per business rule change
   2026-03-22") ดูสกิล `thai-business-days` · แต่ละรอบได้เตือน 48/24 ชั่วโมงของตัวเอง (`jobs/correction-deadline-sweep.js`
   ทุกชั่วโมงใน `jobs/scheduler.js`) และผู้จัดคิวแจ้งเตือนด้วยมือได้รอบละครั้ง (คำสั่ง 56(1) 3.2)
5b. **ผู้จัดคิวและผู้ตรวจพื้นที่ไม่ได้รับอีเมลและเบอร์ของผู้ยื่น** (คำสั่ง 29, 56(3)) — `shared/applicant-contact.js` เป็น
   **รายการที่อนุญาต** (ตัวตนตาม กทล.1 · สถานที่ปลูก · ส่วนของคำขอที่ระบุชื่อ) ไม่ใช่รายการที่ซ่อน ช่องที่ไม่ได้ระบุไม่ถึงสองบทบาทนี้ ·
   ใช้ทั้งประตูรายละเอียด (และหน้าพิมพ์) และ `changedFields` ในประวัติการตรวจสอบ (เหลือแค่ชื่อช่องกับ `changed: true`) ·
   ประตูเริ่มตรวจ/บันทึกผลตอบแค่ `{ id, applicationNumber, status }` · แดชบอร์ดใบรับรองไม่ส่งอีเมล/เบอร์และอ่านเฉพาะองค์กรตัวเอง ·
   ผู้ติดต่อหน้างานอ่านได้ทาง `GET /api/provider/applications/:id/site-contact` เท่านั้น บันทึก `SITE_CONTACT_VIEWED` ทุกครั้ง
   บันทึกไม่ได้ไม่แสดง ตอบ `Cache-Control: no-store` · สลับผู้ตรวจพื้นที่ใน `CAR_PENDING`/`CAR_REVIEWING` ต้องมีเหตุผลจากรายการ
   (คำสั่ง 60(a), `shared/dispatcher-reasons.js`) · ทุกเหตุผลของนัดเลยกำหนดและเปลี่ยนผู้ตรวจระหว่างแก้มีฝ่าย
   (ผู้ยื่น / หน่วยตรวจ / เหตุสุดวิสัย, อื่น ๆ = ยังไม่จัดฝ่าย) ผู้ยื่นเห็นใน `recordedReasons` ของหน้าคำขอ และเปลี่ยนเพราะมีส่วนได้เสีย
   ขึ้น `impartialityFlags` ในแฟ้มผู้อนุมัติ (คำสั่ง 65(1)) · `_reassignmentHistory` เป็นของเซิร์ฟเวอร์
5c. **ผู้ติดต่อหน้างานบังคับ** (คำสั่ง 65(2)) — ชื่อ + เบอร์โทรไทย และถ้าเป็นคนอื่นต้องยืนยันว่าแจ้งแล้ว กฎเดียวที่
   `@gacp/validation/site-contact` ใช้ทั้ง wizard ขั้น 3 และประตูยื่น · ผู้ยื่นแก้ได้ถึงก่อนวันนัด
   (`PATCH /api/applications/:id/site-contact`, `shared/site-contact-window.js`) · คำขอที่ยังไม่มี: คิวผู้จัดคิวบอก
   `siteContactGiven: false` และงานทุกชั่วโมง `jobs/site-contact-request-job.js` แจ้งผู้ยื่นและผู้ถือครั้งเดียว (`SITE_CONTACT_REQUESTED`)
6. **CheckoutOrder เป็นคนละ state machine** — `apps/backend/shared/checkout-status.js`
   (`CHECKOUT_STATUSES`: `PENDING_PAYMENT`/`SETTLED`/`EXPIRED`/`CANCELLED`, map ที่
   `ALLOWED_CHECKOUT_TRANSITIONS`), `SETTLED` เป็น terminal, มี boot-time totality
   assert (`assertCheckoutVocabularyIsTotal()`, รันตอน `require()`)
   milestone→สถานะคำขอ: `M1→DOC_FEE_PAID`, `M2→AUDIT_FEE_PAID`
   (`SETTLED_TARGET_STATE` ใน `apps/backend/services/checkout/checkout-settlement-service.js`)
7. **กติกาเปลี่ยนหลังยื่น = ส่งกลับในคำขอเดิม** (มติ operator 2026-10-06 ข้อ 16) — เมื่อตัวคำนวณเอกสาร
   คืน `blockingIssues` (เช่น วัตถุประสงค์ที่ถูกถอด) ประตูตัดสินผลตรวจเอกสารไม่รับคำขอ
   (`DOCUMENT_CHECK_BLOCKED`) และให้ `REQUEST_MORE` เดิน edge เดิม `ASSIGNED_FOR_REVIEW→REVISION_REQUESTED`
   ได้โดยไม่ต้องมีช่องเอกสาร (`decideDocumentOutcome` ใน `application-document-review-service.js`)
   ผู้ยื่นแก้คำตอบในวิซาร์ดแล้วยื่นผ่าน `/applications/submit` ซึ่งเดิน `REVISION_REQUESTED→ASSIGNED_FOR_REVIEW`
   ไม่ออกใบเสนอราคาหรือคำสั่งชำระใหม่ (ออกเฉพาะขา `DRAFT`) · ไม่มีสถานะใหม่ ใช้ได้กับกติกาทุกข้อในอนาคต
   · ยื่นกลับแล้วล้าง `_lastReviewComment` · ข้อที่ผู้ยื่นแก้เองไม่ได้ (`applicantCanFix()` ใน
   `application-requirements-service.js`: `APPLICANT_TYPE_NOT_THE_HOLDER`, `PLANT_LAW_NOT_FILED`) ส่งกลับไม่ได้
   (`DOCUMENT_CHECK_NEEDS_ADMIN`) หน้าเจ้าหน้าที่ซ่อนปุ่มส่งกลับและบอกให้แจ้งผู้ดูแลระบบ
   พิสูจน์ที่ `__tests__/integration/rule-change-return-to-applicant-real-postgres.test.js`
8. **ไม่มีประตูไหนพาคำขอข้ามงวดที่ยังไม่ได้ชำระ** (รีวิวความปลอดภัย 2026-10-06 F1) —
   `MILESTONES_PAID_BEFORE_STATE` ใน `application-status-writer.js`: ตั้งแต่ `ASSIGNED_FOR_REVIEW` ถึง
   `AUDIT_FEE_PAID` ต้องจ่าย M1 แล้ว · ตั้งแต่ `AUDIT_CONFIRMED` ถึง `CERTIFIED` ต้องจ่ายทั้ง M1 และ M2 ·
   คำขอต่ออายุ (`isRenewalFiling`) ไม่มี M1 จึงต้องจ่ายเฉพาะ M2 (มติ 2026-09-07) ·
   "จ่ายแล้ว" = order `SETTLED` ที่ใบแจ้งหนี้ผ่าน `isInvoicePaid` (คืนเงินเต็มจำนวน = ยังไม่จ่าย) ·
   ใช้กับทุกผู้เขียนรวม SYSTEM · ทางออก (`EXPIRED`, `REJECTED`) ไม่ถูกกัน · ไม่ผ่าน = 409 `MILESTONE_NOT_PAID`
   · ประตู `POST /api/provider/admin/batch-actions` รับเฉพาะสถานะต้นทางของ action (`BATCH_ACTION_EDGES`
   มี `ASSIGN` (`DOC_FEE_PAID → ASSIGNED_FOR_REVIEW`) อย่างเดียว การขอเอกสารเพิ่มเป็นคำตัดสินของผู้ตรวจเอกสาร
   ไม่มีทางลัดแบบ batch คำสั่ง 31 · action อื่น = 400) เฉพาะองค์กรของผู้เรียก
   (`organizationScope` ใน `shared/application-visibility.js`) ปฏิเสธทั้งชุดก่อนเขียน และ ASSIGN
   เขียนคอลัมน์ `reviewerId`
   พิสูจน์ที่ `__tests__/integration/no-door-skips-the-payment-real-postgres.test.js`
   · **ทุกประตูเขียนสถานะผ่าน `writeApplicationStatus()`** (N2): ผลของ `buildTransitionUpdate()`
   ใช้ได้แค่แยก `const { status, ...extras } = transition.updateData` แล้วส่งเข้าตัวเขียน · ส่งต่อทั้งก้อน
   (`data: transition.updateData` หรือ `...transition.updateData`) lint `gacp/no-direct-application-status-write`
   ปฏิเสธ · ประตู assign-reviewer, audits/schedule, final-approvals, reject-to-auditor พิสูจน์ที่
   `__tests__/integration/status-doors-honor-paid-milestones-real-postgres.test.js`
9. **ขอบเขตองค์กรมีที่เดียว** (คำสั่ง 17, N4): `organizationScope(user)` ใน `shared/application-visibility.js`
   คืน `{ organizationId }` · `null` = ข้ามองค์กร (`system_admin_platform` เท่านั้น) · `DENY_ALL` = ไม่มีองค์กร
   ตอบด้วย `answerNoOrganization(res)` (400 `NO_ORGANIZATION`) · ประตูเจ้าหน้าที่ใส่ fragment นี้ในการค้นเอง
   ไม่พึ่ง tenant extension · `findByIdOrApplicationNumber(id, organizationWhere)` บังคับรับ scope
10. **ส่งกลับให้ผู้ยื่นแก้ได้เฉพาะข้อที่จัดประเภทไว้** (N5): `BLOCKING_APPLICANT_CAN_FIX` ใน
   `application-requirements-service.js` ต้องมีทุก blocking code · code ที่ไม่มีในตาราง = แก้ไม่ได้ =
   ส่งกลับไม่ได้ ให้ผู้ดูแลระบบจัดการ (เทสต์ `blocking-codes-classified.test.js` อ่านซอร์สหา code ที่ยังไม่จัด)
11. **`REJECTED` เป็นของ `CERTIFICATE_APPROVER` คนเดียว และต้องมีการอุทธรณ์ที่มีผลแล้ว** (คำสั่ง 56(2), 78(2)) —
   probe `rejected-approver-only` กันไม่ให้บทบาทอื่นถือขา `REJECTED` · `certification-decision-service.js` เขียน
   `REJECTED` ได้เมื่อ `appealSetupInForce()` (`shared/appeal-setup.js`, คีย์ `appeal.setup`: ช่องทาง ที่มา วันมีผล
   จำนวนวันยื่นอุทธรณ์ไม่เกิน 365) คืนค่าที่มีผล ณ วันนั้นเท่านั้น ไม่มี = 409 `REFUSAL_AWAITS_APPEAL_SETUP` ·
   มติ 56: อุทธรณ์ภายใน 15 วัน ผู้อนุมัติคนอื่นตัดสิน · ห้ามใส่ค่าเริ่มต้นของการอุทธรณ์ในโค้ด

## กับดักที่รู้แล้ว

| กับดัก | ความจริง |
|---|---|
| เห็น `CANCEL_EXPIRED` | **เปลี่ยนชื่อเป็น `CANCELLED` แล้ว** (2026-10-06, migration `20261006120000_rename_cancel_expired_to_cancelled`) ชื่อเดิมอยู่ใน `LEGACY_STATUS_SPELLINGS` ห้ามกลับมา · `CANCELLED` = ปิดคำขอ ไม่ใช่คำตัดสิน (`NOT_DECISION_STATES.CANCELLED` ใน `shared/decision-states.js`) มีสามทาง: ผู้ยื่นถอนก่อนผู้ตรวจเอกสารเริ่ม (`PENDING_DOC_FEE`/`DOC_FEE_PAID`, ไม่คืนเงิน, `CANCELLED_BY_APPLICANT`, คำสั่ง 32) · ผู้ดูแลปิดพร้อมเหตุจากรายการ (`CANCELLED_BY_ADMIN`, คำสั่ง 35) · SYSTEM ปิดหลังฝ่ายการเงินบันทึกคืนเงินกรณีบริษัทหรือรัฐยกเลิกบริการ (`DOC_FEE_PAID`/`AUDIT_FEE_PAID`/`AUDIT_CONFIRMED`, คำสั่ง 22) · มีการคืนเงินหรือไม่ดูจาก `closedReason` และ `metadata.refund` ไม่ใช่จากสถานะ |
| `AWAITING_SCHEDULE`, `SCHEDULED`, `AUDIT_SCHEDULED`, `FINAL_APPROVED` | **legacy vocabulary ที่ถูกแบน** — อยู่ใน `LEGACY_STATUS_SPELLINGS` (`apps/backend/eslint-rules/no-legacy-status-vocabulary.js`) · รายงาน farmer เขียน S4 ว่า "AWAITING_SCHEDULE → AUDIT_CONFIRMED" (`reports/role-workflow-auditor/2026-08-06-farmer.md:17`) ซึ่ง**ไม่ตรงกับ state machine** — ใช้ mapping ของ reviewer แทน |
| หา "ตาราง S0–S6" ในโค้ด | **ไม่มีไฟล์ไหนนิยาม S0–S6** — ยืนยันที่ `reports/role-workflow-auditor/2026-08-06-reviewer.md:11` · mapping ที่ใช้อ้างได้คือตารางใน `reviewer.md:15-21` (S1/S3 = สองประตูเงิน, S4 = `AUDIT_CONFIRMED`) |
| คิดว่า `AUDIT_PASSED→APPROVED` ไม่มีผู้อนุมัติคนที่สอง (มติ 2026-06-05) | **มติกลับแล้ว 2026-09-10 (F-CERT-SOD)** — `CERTIFICATE_APPROVER` ถือทั้ง `AUDIT_PASSED→APPROVED` และ `APPROVED→CERTIFIED` แยกจาก `FIELD_INSPECTOR` ผู้บันทึกผลตรวจ ตาม ISO/IEC 17065 §7.6 อย่างเดิม |
| คิดว่า cert mint ยังผูกอยู่กับ route ของ auditor เท่านั้น | mint จริงอยู่ใน `writeApplicationStatus()` (`apps/backend/services/application-status-writer.js`) — เงื่อนไข `toStatus === 'APPROVED' && autoIssueCertificate !== false` เรียก `certificateService.generateCertificate()` เป็น side effect ของการเขียนสถานะ APPROVED **ทุกทาง** ไม่ใช่แค่ทาง route เดียว |
| ส่ง status ตัวพิมพ์เล็ก/ชื่อเก่าเข้ามาแล้วคาดว่าระบบแปลงให้ | ไม่แปลงแล้ว — alias table ถูกถอด, ค่าที่ไม่ canonical จาก `normalizeWorkflowStateInput()` = `null` = defect |
| ให้ `FINANCE_OFFICER_DTAM`/`FINANCE_OFFICER_PLATFORM` เดิน edge อะไรก็ได้เพราะ "เป็นฝ่ายการเงิน" | เดินไม่ได้เลยบนทางเขียนจริง — ชุดว่างใน `ROLE_TRANSITIONS` ไม่ใช่ของลืมเติม (ดูหัวข้อก่อนหน้า) ถ้าเจอ role นี้หลุดผ่านทุก edge บนทางเขียนจริง แปลว่าแถวถูกลบไปจากตาราง ให้รายงาน ไม่ใช่แก้ตาม |
| แก้เงิน/สิทธิ์เพราะ transition ต้องการ | หยุด — CLAUDE.md หัวข้อ 'ขอบเขตที่ห้ามข้าม' (เงิน/สิทธิ์ = ชั้น C, operator merge) · flag + เสนอ diff เท่านั้น |
| เชื่อว่า `withoutTenantScope(() => prisma.x.y(...))` รันแบบไม่มี tenant เพราะเทสหน่วยเขียว | ก่อน 2026-09-29 **ไม่จริง**: PrismaPromise เริ่มตอนผู้เรียก await (หลัง `storage.run` จบ) จึงรันใต้ tenant ของผู้เรียก — S6/S7 พังเงียบ · ตอนนี้ `withoutTenantScope` (`services/tenant-context.js`) เรียก `.then` เองภายใน run · fake client ที่เป็น `async` ทำงานทันที จึงมองไม่เห็นปัญหานี้ — พิสูจน์ด้วย PrismaClient จริง (`__tests__/unit/without-tenant-scope-lazy.test.js`) · `runWithTenantContext`/`withoutEntityScope` ยังรูปเดิม (BACKLOG-FOUND) |

## Document pre-check (ตรวจเอกสารเบื้องต้น)

ตรวจไฟล์ที่ผู้ยื่นอัปโหลดอัตโนมัติ แล้ว**เตือน**ผู้ยื่นและเจ้าหน้าที่ — ไม่ใช่สถานะใหม่ ไม่เดิน edge ใด
- **ขอบเขต 8 ช่อง** — key ของ `CATALOG` (`apps/backend/services/document-precheck/catalog.js`): โฉนด · สัญญาเช่า ·
  หนังสือยินยอมใช้ที่ดิน · หนังสือรับรองนิติบุคคล · บัตรประชาชน · ทะเบียนบ้าน · ใบรับรองเดิม ·
  หนังสือการกำกับดูแลของผู้รับอนุญาตผลิต (`producer_supervision_letter`, facts.md:49 · เพิ่ม 2026-10-31 · ไม่มี cross-match
  เพราะไม่มีที่มาบอกว่าเทียบช่องไหน) · ช่องอื่นได้ `precheck: null` เสมอ · เพิ่มช่อง = เพิ่ม `CATALOG` + เอกสารในชุดทดสอบ
  (`scripts/document-precheck/make-corpus.js`) + label ใน `labels.json` — `document-precheck-accuracy.test.js` ล้มถ้า
  ช่องใดใน `CATALOG` ไม่มีเอกสารในชุดทดสอบ
- **ไฟล์ที่ไม่มีผลตรวจต้องบอกตรง ๆ** (operator 2026-10-31) — ไฟล์ที่แนบแล้วแต่ไม่มีแถว pre-check (`precheck: null`
  เช่นช่องนอกขอบเขต) แสดง `PRECHECK_NOT_RUN_TH` "ช่องนี้ระบบไม่ได้ตรวจเบื้องต้น เจ้าหน้าที่จะตรวจเอง"
  (`packages/validation/src/precheck-copy.js`) ทั้งการ์ดผู้ยื่นและหน้าตรวจเอกสารของเจ้าหน้าที่ · ห้ามเงียบ เพราะเงียบอ่านว่าผ่าน ·
  ยกเว้นเมื่อ server อ่านแถว pre-check ไม่ได้ (`precheckUnavailable: true` ทุกช่อง) เพราะตอนนั้น null ไม่ได้แปลว่าไม่ได้ตรวจ ·
  วลีของช่อง `producer_supervision_letter` ยาวพอไม่ให้ใบอนุญาตผลิตหรือเอกสารที่มีคำว่า "กำกับดูแล" ลอย ๆ ได้ MATCH
- **log** — รันหนึ่งครั้ง = บรรทัด `precheck run` หนึ่งบรรทัด (precheckId · slot · applicationId · status DONE/FAILED/
  RETRY/SUPERSEDED · durationMs · check+result ของแต่ละธง) ห้ามใส่ reasonTH/snippet/ข้อความในเอกสาร · อัปโหลดช่องนอก
  ขอบเขต = `precheck skipped: slot out of scope`
  · **คำขอแบบ กทล.1 v2**: ช่อง `id_house_reg` (บัตร+ทะเบียนบ้าน) ได้ key `id_card` เสมอ — `id_card` พับเป็น
  `id_house_reg` ส่วน `house_reg` ไม่พับ (`catalogKeyFor` ใน `services/document-precheck/service.js` · pin ใน
  `__tests__/unit/document-precheck/service.test.js` ด้วย `expect(service.catalogKeyFor('id_house_reg')).toBe('id_card')`) ⇒ ไฟล์ในช่อง v2 ตรวจด้วยกฎบัตรประชาชน (วลีบัตรประชาชน ·
  ชื่อ + เลข 4 ตัวท้าย) · กฎของ `house_reg` (วลีทะเบียนบ้าน) รันเฉพาะช่อง `house_reg` แบบเดิม ⇒ ทะเบียนบ้านที่อัปโหลด
  ในช่อง v2 ได้ DOC_TYPE NOT_FOUND (ข้อสังเกต ไม่บล็อก) · ยังไม่ตัดสิน (BACKLOG-FOUND "Task 6 M4")
- **ทำในเครื่องเท่านั้น** — tesseract.js + tessdata ไทย/อังกฤษที่อยู่ในรีโปและอิมเมจ (`apps/backend/data/tessdata`
  ตรึง sha256 ใน README ข้างไฟล์) เพื่อให้อ่านไทยได้ทุกครั้งโดยไม่ดาวน์โหลดตอนรันและได้ผลเหมือนกันทุกเครื่อง ·
  ห้ามส่งเอกสารไปบริการภายนอก
- **ธงไม่บล็อกอะไรเลย** — ไม่แตะ `Application.status` ไม่กันการส่งคำขอ ไม่เป็นเงื่อนไขของ edge ใด · เจ้าหน้าที่ตัดสินด้วย
  ปุ่มผ่าน/ไม่ผ่านเดิม · แถวคำตัดสินเก็บ `precheckId` ที่ server เลือก (`currentDonePrecheckId`) ไม่อ่านจาก body ·
  ผู้ยื่นกด "ยืนยันว่าเอกสารถูกต้อง" = บันทึกเวลาอย่างเดียว
- **ลายมือชื่อ/ตรา = คนตรวจ** — check `SIGNATURE` ได้ `MANUAL` เสมอ
- **ป้ายบนแถวเจ้าหน้าที่** (มติ operator 2026-09-28 · `PRECHECK_OFFICER_COPY_TH`): PASS/MATCH = "ไม่มีข้อสังเกต"
  (ห้ามใช้ "ผ่าน" — คำว่าผ่านเป็นของคำตัดสินเจ้าหน้าที่) · ผลอื่น = "ข้อสังเกต" · MANUAL = "ตรวจเอง" · บรรทัดหัวบล็อก
  "ผลตรวจอัตโนมัติเป็นข้อสังเกตเบื้องต้น การตัดสินเป็นของเจ้าหน้าที่" · เหตุผล NOT_FOUND ของ backend ผู้ยื่นเห็นด้วย จึงเขียนเป็น
  "…เจ้าหน้าที่จะตรวจสอบเพิ่มเติม" ไม่สั่งเจ้าหน้าที่
- **เกณฑ์เป็น ratchet** — `OCR_CONFIDENCE_MIN` / `NAME_SIMILARITY_MIN` และพื้นความแม่นใน
  `apps/backend/__tests__/fixtures/document-precheck/thresholds.json` · ยกพื้นขึ้นได้ · ลดพื้น = operator + HARNESS_LOG
  (แถว `precheck-accuracy` ใน HARNESS.md §4.2)
- **คิวรันทีละงาน** (`precheckQueue.process(1, …)` ใน `services/queue-service.js`) — เหตุผลเป็นตัวเลขที่วัดในอิมเมจจริง:
  `evidence/document-precheck-task-10/INDEX.md` · backend ของ staging/demo ใช้ limit 1G (มติ operator 2026-09-29,
  `docker-compose.staging.yml` และ `docker-compose.demo.yml`) เพราะ OCR หนึ่งงานกินถึง ~211–319 MiB · OCR จำกัด 10 หน้า
  (`EXTRACT_OPTIONS.maxPages` ใน `services/document-precheck/service.js`)
- **PDPA** — `extractedText` กับ `evidenceSnippet` ถูกล้างโดย `clearPrecheckText`
  (`services/document-precheck/clear-text.js`) สองทาง: retention sweep (`jobs/pdpa-retention-job.js`) เมื่อผู้ใช้พ้นระยะเก็บ
  และ erasure ตามคำขอเจ้าของ (`executeErasure` ขั้น 2b ใน `services/pdpa-erasure-service.js`, ใน transaction เดียวกัน —
  ผู้ใช้ที่ถูก erasure เป็น isDeleted แล้ว sweep จะไม่เห็นอีก) · คำขอที่ติด legal hold ไม่แตะ · แถวที่ยัง PENDING
  ถูกทำเป็น FAILED + ธงล้มเหลวก่อนล้าง เพื่อให้ job ที่ค้างคิวเขียนข้อความกลับไม่ได้ (การเขียน DONE ต้องการ PENDING)
- **ลบไฟล์ = pre-check ของไฟล์นั้นเลิกเป็นปัจจุบัน** — `DELETE /draft-documents/:documentId` เรียก `retireForDocument`
  (SUPERSEDED + ล้าง `extractedText`/`evidenceSnippet` ผูก applicationId+organizationId) · ล้มเหลวไม่เปลี่ยน response ของการลบ
- **ไม่มีแถวค้าง PENDING จาก Bull** — handler `failed` ใน `services/queue-service.js` ตัดสินจาก `job.isFailed()`
  (Bull fail งานที่ stall เกินเพดานโดยไม่นับ attempt) · ที่ยังค้างได้: job หายไปกับ Redis / DB ล่มระหว่าง `markFailed`
  (ยังไม่มีตัวกวาด — BACKLOG-FOUND "final review M4")
- **VALIDITY** (`rules/validity.js`): ครบกำหนด = วันที่เลขเดียวกัน 6 เดือนถัดไป ถ้าเดือนนั้นไม่มีวันนั้นใช้วันสุดท้ายของเดือน
  (31 ส.ค. → 28/29 ก.พ. · ป.พ.พ. ม.193/5 วรรคท้าย) · ปฏิทินกรุงเทพ

## ก่อนแก้ไฟล์นี้

`workflow-transition-service.js` — tier ของไฟล์นี้คือค่าที่ `scripts/probes/tier-check.sh`
พิมพ์ออกมาจริง**ตอนรัน**เท่านั้น (CLAUDE.md หัวข้อ 'แบบไหนเรียกว่าเสร็จ') **ห้ามเขียนว่าเป็น Tier C ตายตัวหรือ Tier B
ตายตัว** — เชื่อ output ที่รันจริงตอนนั้น ไม่ใช่ค่าที่เอกสารนี้จำมาจากรอบก่อน · แก้ค่าใน
`ROLE_TRANSITIONS` คือการเปลี่ยนกฎ workflow/governance เสมอ ไม่ว่า tier-check จะคืนชั้นใด —
รายงาน operator ก่อน (CLAUDE.md หัวข้อ 'ขอบเขตที่ห้ามข้าม') ห้าม merge เอง · เพิ่มสถานะ = เพิ่ม row ใน
`ALLOWED_TRANSITIONS` **และ** `ROLE_TRANSITIONS` พร้อมกัน ไม่งั้นได้ dead state
