# R2 FINAL — GAP ANALYSIS (read-only)

Branch ยืนยัน: `docs/decisions-crossref` — ทุกข้ออ้างจากไฟล์ที่เปิดอ่านจริงใน session นี้ (root = `/home/user/GACP-Certification-Application`, ย่อว่า `<R>` หลังอ้างครั้งแรก)

---

## 1. ตาราง gap ต่อ requirement

### ข้อ 1 — จ่ายช้า = ค้าง pending ไม่มี expiry (sweep — รายงานอย่างเดียว)

| ชั้น | ของจริง | สถานะเทียบ FINAL |
|---|---|---|
| State machine | `PENDING_DOC_FEE → {PHASE_1_SLIP_UNDER_REVIEW, DOC_FEE_PAID}` และ `PENDING_AUDIT_FEE → {PHASE_2_SLIP_UNDER_REVIEW, AUDIT_FEE_PAID}` เท่านั้น — **ไม่มี edge ไป EXPIRED จากสถานะรอจ่าย** (`/home/user/GACP-Certification-Application/apps/backend/services/workflow-transition-service.js:54,62`); EXPIRED edge มีเฉพาะจาก `REVISION_REQUESTED:59` และ `CAR_PENDING:66` | ✅ ตรง FINAL |
| `phase1Status/phase2Status` | ค่า `EXPIRED` มีใน**คอมเมนต์** schema (`<R>/apps/backend/prisma/schema/application.prisma:66`) แต่ **ไม่มี writer ตัวไหนเขียน** — writer มีแค่ `PROCESSING` (`<R>/apps/backend/services/payment-service-phase-flow.js:182`) และ `PAID` (`<R>/apps/backend/services/payment-service.js:121-126`) | ✅ ไม่มี expiry จริง (comment เน่า) |
| `phase1ExpiresAt/phase2ExpiresAt` | เขียนจริง (TTL 60 นาที: `INVOICE_EXPIRY_MINUTES` `<R>/apps/backend/config/business-rules.js:125` → `payment-service-phase-flow.js:161,184`) แต่ใช้แค่เป็นเงื่อนไข **reuse invoice เดิม** (`:139`) — หมดแล้วแค่ mint invoiceId ใหม่ ไม่ปิดเคส | ✅ soft-TTL, ไม่มีผลปิดเคส |
| `PaymentTransaction.expiredAt` | stamp ไว้ (`payment-service-phase-flow.js:210`; คอลัมน์ `<R>/apps/backend/prisma/schema/billing.prisma:349`) — **ไม่มี job/โค้ดตัวไหนอ่าน** (grep ทั้ง backend: มีแต่ writer) | ✅ dead column |
| CheckoutOrder | vocab มี `PENDING_PAYMENT→EXPIRED` (`<R>/apps/backend/shared/checkout-status.js:42-43`) แต่ **ไม่มี writer ฝั่งเรา** — re-entry reuse order เดิม (`<R>/apps/backend/services/checkout/stripe-checkout-service.js:119-123`); `payment_failed` → order คง PENDING_PAYMENT retryable (`<R>/apps/backend/services/checkout/checkout-settlement-service.js:254-276`); เฉพาะ `payment_intent.canceled` **จากฝั่ง Stripe** จึงเขียน `CANCELLED` (`:278-291`) | ⚠️ residual: gateway-side cancel สะท้อนเข้า order ได้ แต่ **ไม่แตะสถานะ application** |
| Jobs ทั้ง 8 ตัว (`<R>/apps/backend/jobs/`) | `payment-reminder-job.js:17-19` ประกาศ "NEVER writes invoice/payment state, OVERDUE derived-only" · `sla-processor.js:34` monitor เฉพาะ `AUDIT_CONFIRMED/DOC_APPROVED/SUBMITTED/AUDIT_FEE_PAID` (แจ้งเตือนอย่างเดียว, **ไม่รวมสถานะรอจ่าย**) · `slip-sla-monitor` = สลิปค้างตรวจ (ฝั่งเจ้าหน้าที่) · `revision-deadline-checker` = แก้เอกสาร/CAR เท่านั้น · `scheduler.js:114-126` expire เฉพาะ **Subscription** (คนละโดเมน) · `waiver-sla-escalation`, `work-activity-sla-monitor`, `pdpa-retention` ไม่แตะเคสรอจ่าย | ✅ ไม่มี cron expire เคสค้างจ่าย |
| Stripe adapter/config | `<R>/apps/backend/config/stripe.js` — ไม่มี expiry config; `<R>/apps/backend/services/payment/stripe-adapter.js` — grep `expire` = 0 hit | ✅ ฝั่งเราไม่ตั้ง expiry (TTL ของ PromptPay QR เป็นพฤติกรรมฝั่ง Stripe เอง) |
| Invoice | `FORFEITED` writer เดียวคือ `forfeitRevenue()` (`<R>/apps/backend/services/invoice/invoice-finance-ops.js:103-116`) — เป็น manual finance op, ไม่มี caller อัตโนมัติ (caller เดียว: `<R>/apps/backend/services/invoice-service.js:687-691`) | ✅ ไม่มี auto-forfeit |

**สรุปข้อ 1: โค้ดปัจจุบันตรง FINAL อยู่แล้ว** — ไม่มี expiry แอบบนเส้นทางจ่ายช้าที่ระดับ application ทุกชั้น; residual 2 จุดที่ควรบันทึก: (ก) gateway-side `payment_intent.canceled` → CheckoutOrder CANCELLED (ข) comment `EXPIRED` ใน `application.prisma:66` ที่ไม่มีจริง

### ข้อ 2 — นาฬิกา 5 วันทำการ

| คุณสมบัติ FINAL | ของจริง | gap |
|---|---|---|
| Thai calendar canonical | `<R>/apps/backend/utils/working-days.js` — ICT + วันหยุดราชการ (`:25-67`), `addWorkingDays` คืน end-of-business-day (`:233-253`) — ใช้ทั้ง reject surface (`<R>/apps/backend/routes/api/applications/application-workflow-handlers.js:23,106`), canonical surface (`<R>/apps/backend/routes/api/provider/handlers/workflow-transitions-handler.js:246,281`), CAR service (`<R>/apps/backend/services/car-deadline-service.js:19,34-36`), cron checker (`<R>/apps/backend/jobs/revision-deadline-checker.js:16,104`) | ✅ มีแล้ว — **ยกเว้น** `<R>/apps/backend/routes/api/system/cron.js:5-7` ที่ยังใช้ `services/working-days-service` (holiday-blind ตามคอมเมนต์ Blocker F `application-workflow-handlers.js:18-23`) สำหรับคำนวณ reminder |
| เริ่มนับเมื่อแจ้งผลไม่ผ่านรอบล่าสุด + reset ทุกรอบ | นาฬิกาเริ่มที่ **การเขียนคำตัดสิน**: `dueDate = addWorkingDays(now, 5)` ณ ตอน reject (`application-workflow-handlers.js:104-106`; canonical: `workflow-transitions-handler.js:241-246, 277-281`) แล้ว **upsert ทับ** `RevisionDeadline.revisionDue` ใหม่ทุกรอบ (`application-workflow-handlers.js:202-207`; `<R>/apps/backend/routes/api/provider/handlers/workflow-side-effects.js:38-53, 86-101`; `car-deadline-service.js:55-70`) | ⚠️ reset ทุกรอบ = มีแล้ว; แต่จุดเริ่ม = ตอน**เขียน decision** ไม่ใช่ตอน**แจ้งผล** — notification เป็น best-effort หลัง commit (`workflow-side-effects.js:218-234` มี `.catch` กลืน) และ surface `PATCH /:id/reject` **ไม่ส่ง notification เลย** → นาฬิกาเดินได้ทั้งที่เกษตรกรอาจไม่เคยถูกแจ้ง (ดู AMBIGUOUS A-2) |
| นาฬิกาหยุดระหว่างเคสอยู่ในมือเจ้าหน้าที่ | ไม่มี concept "pause" — แต่ semantics เทียบเท่า: ส่งแก้แล้ว `RevisionDeadline.status → 'SUBMITTED'` (`workflow-side-effects.js:55-67, 103-118`; `<R>/apps/backend/services/application-service/application-review-revision-methods.js:142-152`) → cron scan เฉพาะ `PENDING/EXTENDED` (`revision-deadline-checker.js:49-52`) → นาฬิกาไม่เดินระหว่างรีวิว แล้วรอบใหม่ได้ 5 วันเต็ม | ✅ โดยผล (ไม่ใช่ pause/resume แต่เป็น stop-แล้ว-reset ซึ่งตรงตัวอักษร FINAL "reset ทุกรอบ") |
| นับเลขครั้งต่อ stage | ตัวนับที่มี: (1) `RevisionDeadline.revisionCount` (`<R>/apps/backend/prisma/schema/audit.prisma:124`) — **ตัวเดียวต่อ application (`applicationId @unique` `:119`) ใช้ร่วมกันทั้ง doc-revision และ CAR** (bump ทั้งสอง branch: `workflow-side-effects.js:35,85`; `car-deadline-service.js:54`; `application-workflow-handlers.js:206`) → นับรวม ไม่แยก stage (2) `Application.rejectCount` (`application.prisma:49`) — **ไม่มี writer เหลือ** (grep: มีแต่ read `<R>/apps/backend/routes/api/provider/applications.js:293`) = counter ตาย (3) `formData._revisionHistory[]` append แต่ไม่มีเลขครั้ง (`application-review-revision-methods.js:104-111`) | ❌ **ขาด**: ไม่มี counter ต่อ stage |
| วนไม่จำกัดครั้ง | loop ไม่จำกัดอยู่แล้ว — "Loop limits removed per business rule change 2026-03-22" (`workflow-transition-service.js:200-203`) | ✅ ตรง |
| **จุดชน: ค่าธรรมเนียม resubmission ครั้งที่ 3** | `SUBMISSION_THRESHOLD = 3` (`<R>/apps/backend/modules/billing/internal/payment-constants.js:88`) — export ผ่าน `<R>/apps/backend/services/payment-service.js:40,176` และ `<R>/apps/backend/modules/billing/index.js:40` แต่ **ไม่มี business logic ตัวไหน consume** (ผู้ใช้เดียว = test ตรวจ barrel `<R>/apps/backend/__tests__/unit/modules-billing-barrel.test.js:42`) = **dead config**. ส่วน `RESUBMISSION` fee 5,000 (`business-rules.js:38,122-123`) doc ผูกกับ "deadline หมด → ยื่นใหม่" ไม่ใช่ "reject ครั้งที่ 3" และไม่มี consumer เช่นกัน | ⚠️ **ไม่ live แต่ไม่ตาย**: ไม่ขัด FINAL ในทาง runtime แต่ (ก) config ค้างขัดเจตนา "วนไม่จำกัด" (ข) template `APPLICATION_EXPIRED` บอกเกษตรกรว่าต้อง**จ่ายงวด 1 ใหม่**เมื่อยื่นเคสใหม่ (`<R>/apps/backend/services/notification-service.js:199-205`) = คำถามเงิน → **ธง D-1** |
| SSOT ของเลข 5 | มี ≥4 แหล่ง: `business-rules.js:121` (canonical) · literal `5` + `revisionSlaDays: 5` (`application-workflow-handlers.js:106,133-134`) · `REVISION_SLA_DAYS = 5` (`<R>/apps/backend/routes/api/provider/handlers/workflow-handler-deps.js:39`) · `CAR_SLA_DAYS = 5` (`workflow-transitions-handler.js:39`) · `SLA_DAYS = 5` (`<R>/apps/backend/services/waiver-reopen-service.js:41`) | ⚠️ dup-source (Law 3.5/3.6) — งาน R2 ที่แตะนาฬิกาต้องไม่เพิ่มแหล่งที่ 5+ |

### ข้อ 3 — Notification บังคับ + จดหมายในระบบเก็บถาวร

| คุณสมบัติ | ของจริง | gap |
|---|---|---|
| ช่องทาง | in-app (Notification row) + email (เฉพาะ type ใน `EMAIL_MAP` `notification-service.js:510-519` — **ไม่มี REVISION_REQUESTED/APPLICATION_EXPIRED ใน map**) + SMS เฉพาะ HIGH/URGENT (`:425-432`) | มี in-app เป็นหลัก |
| แจ้งผลไม่ผ่าน doc-review วันนี้ | canonical surface ส่งครบ: ผลไม่ผ่าน + due date (Thai) + `revisionCategory/revisionMessage/revisionItems/revisionDueAt` ใน metadata (`workflow-side-effects.js:203-235`) | ✅ บน surface เดียว |
| แจ้งผล CAR วันนี้ | (ก) `sendTransitionNotifications` **ไม่มี branch `CAR_PENDING`** (มีแค่ REVISION_REQUESTED/PENDING_AUDIT_FEE/CERTIFIED/REJECTED — `workflow-side-effects.js:200-306`) (ข) auditor decision handler ส่ง notification ภาษาอังกฤษ ไม่มี due date ไม่มีรายการประเด็น (`<R>/apps/backend/routes/api/provider/handlers/auditor-audit-decision-handler.js:259-278`) (ค) `PATCH /applications/:id/reject` (ทั้ง DOC_REVISION และ FIELD_CAR) **ไม่ส่ง notification เลยทั้ง endpoint** (`application-workflow-handlers.js:45-218`) | ❌ **ขาด**: บังคับไม่ได้ — ขึ้นกับ surface ที่เจ้าหน้าที่ใช้ |
| รายการประเด็นต้องแก้ (structured) | `formData.revisionRequest.items` (`workflow-transitions-handler.js:255-263`) + `formData.reviewHistory[].items` (`:309-326`) + notification metadata (`workflow-side-effects.js:229`) — แต่ `revisionItems` เป็น **optional** จาก request body (`workflow-transitions-handler.js:63-65`; บังคับแค่ comment `:91-96`) และ CAR ไม่มี items เลย (`carRequest` มีแค่ message `:290-296`) | ⚠️ มีที่เก็บแต่ไม่บังคับ + ไม่ครอบ CAR |
| จดหมายในระบบเก็บถาวร | **ไม่มี concept นี้** — Notification model ไม่มี soft-delete/retention (`<R>/apps/backend/prisma/schema/system.prisma:3-35`) และถูกลบจริง 3 ทาง: (1) weekly cleanup ลบ notification อ่านแล้ว >30 วัน (`<R>/apps/backend/services/scheduler/job-scheduler.js:88-106`) (2) PDPA erasure `deleteMany` (`<R>/apps/backend/services/pdpa-erasure-service.js:715`) (3) opt-out = **ไม่เขียน row ตั้งแต่แรก** (`notification-service.js:401-415` + prefs `:384-392`) | ❌ **ขาดทั้งแกน**: ไม่มี permanent record; opt-out ทำให้ "แจ้งบังคับ" หายไปเงียบ ๆ ได้ |

### ข้อ 4 — Append-only: enumerate write path ทั้งหมดใน correction flow

**A. จุดที่ append อยู่แล้ว (สอดคล้อง FINAL):**
1. `Application.workflowHistory` — append ทุก transition (`workflow-transition-service.js:383`; ทุก surface spread `[...history, event]`)
2. `ApplicationComment` — **create เท่านั้น** ทั้ง repo (`application-workflow-handlers.js:194`; `<R>/apps/backend/services/application-service/application-provider-query-methods.js:213`; ไม่มี update/delete path — grep ยืนยัน) — แต่ model มี soft-delete 4 คอลัมน์เตรียมไว้ (`application.prisma:229-233`) ยังไม่มี writer
3. `formData.reviewHistory[]` — append พร้อม items (`workflow-transitions-handler.js:309-326`) — **ไม่มีเลขครั้ง**
4. `formData.auditDecisions[]` — append ทุก decision (`auditor-audit-decision-handler.js:219`) — ไม่มีเลขครั้ง
5. `formData.carDocuments[]` — append ไฟล์ CAR ของเกษตรกร (`<R>/apps/backend/routes/api/applications/applications-car.js:191-194`)
6. `formData._revisionHistory[]` — append ตอน resubmit (`application-review-revision-methods.js:104-111`)
7. `AuditLog` — append-only + hash-chain (`<R>/apps/backend/prisma/schema/audit.prisma:3-67`) — แต่ **เขียนเฉพาะเมื่อ caller ส่ง `onAudit`** (ดู B.9)

**B. จุดที่ update-in-place / delete (= ขัด append-only FINAL ข้อ 4):**
1. **`RevisionDeadline` upsert ทับ row เดิมทุกรอบ** — `revisionDue/status/revisionCount` ถูกเขียนทับ (`application-workflow-handlers.js:202-207`; `workflow-side-effects.js:38-53,86-101,109-118,122-129`; `car-deadline-service.js:55-70`; `application-review-revision-methods.js:142-152`; `revision-deadline-guard.js:120-126`; `cron.js:290-299`; `revision-deadline-checker.js:126-129,156-162`; extend route `<R>/apps/backend/routes/api/applications/revision-deadline.js:193-205,305,403`) — ประวัติ deadline ต่อรอบ**ไม่เหลือ** (row เดียวต่อ application)
2. **เอกสารเกษตรกร: replace + hard delete** — upload ทับ slot เดิม (`<R>/apps/backend/routes/api/applications/applications.js:892-896` filter ตัวเก่าออกจาก `formData.draftDocuments` แล้วใส่ตัวใหม่) · `ApplicationDocument` update-in-place ("Replace any prior row" `<R>/apps/backend/services/application-document-sync.js:60-67`) · DELETE จริง: `draftDocuments` ตัด entry + `applicationDocument.deleteMany` (`applications.js:933-943`; `application-document-sync.js:74-81`)
3. **`formData` ของเกษตรกรถูก merge ทับตอน resubmit** — `{...currentFormData, ...formData}` (`application-review-revision-methods.js:99-101`) — เนื้อหาฟอร์มเวอร์ชันก่อนแก้ไม่ถูกเก็บ
4. Latest-pointer overwrite ทุกรอบ: `formData.lastReviewerComment/lastReviewerDecisionType` (`application-workflow-handlers.js:135-136`) · `formData.revisionRequest`/`carRequest` (`workflow-transitions-handler.js:255-263,290-296`) · `formData.auditDecision` (`auditor-audit-decision-handler.js:218`) · `formData.carNotes` (`applications-car.js:195`) · `_lastReviewComment: null` ตอน resubmit (`application-review-revision-methods.js:112`)
5. **Attachment soft-delete** — `detach()`/`detachAllByUploader()` (PDPA) auto-filter ออกจาก read = "delete" ตามนิยามโจทย์ (`<R>/apps/backend/services/attachment-service.js:184-206,219-241` — จากรายงานรอบก่อน ยืนยัน pattern ยังอยู่)
6. **Notification ลบจริง** (ดูข้อ 3) — ถ้า "จดหมายแจ้งผล" จะเป็น record ของ correction flow ก็ขัด append-only วันนี้
7. **waiver reopen ล้าง marker เดิม** — `formData.expiredAt: null` ตอนคืนชีพเคส (`waiver-reopen-service.js:436-441`) = mutate ร่องรอย expiry
8. เลขครั้ง (round number): **ไม่มีใน record ใดเลย** — ใกล้สุดคือ `revisionCount` รวมทุก stage (B.1)
9. **Audit log ของ expiry writer ทุกตัว = ไม่มี** — `writeApplicationStatus` เขียน AuditLog เฉพาะเมื่อส่ง `onAudit` (opt-in — `<R>/apps/backend/services/application-status-writer.js:40-49,222-233`) และ **ไม่มี expiry writer ตัวไหนส่ง**: cron checker (`revision-deadline-checker.js:184-206`), cron route (`cron.js:260-288`), lazy guard (`revision-deadline-guard.js:88-118`), officer-lazy (`workflow-transitions-handler.js:163-194`), CAR-late-submit (`applications-car.js:129-160`) — มีแค่ workflowHistory event ไม่มี hash-chain row

### ข้อ 5 — cron ปิดเคส

| คำถาม | คำตอบ (จากโค้ด) |
|---|---|
| ปิดเป็นสถานะอะไร | `EXPIRED` ผ่าน `buildTransitionUpdate` + `writeApplicationStatus`, actorRole `system`, reasonCode `REVISION_DEADLINE_EXCEEDED` (`revision-deadline-checker.js:173-206`) — **ใช้ reasonCode เดียวกันทั้ง doc-revision และ CAR** (ไม่แยก stage ใน reason; stage ดูได้จาก `fromStatus` ใน history event เท่านั้น) |
| Idempotent? | ✅ โดย scan predicate: อ่านเฉพาะ `RevisionDeadline.status IN (PENDING, EXTENDED)` (`:49-52`) และ flip เป็น `EXPIRED` ใน tx เดียวกับ status write (`:154-207`) + เช็ค app ยังอยู่ revision state (`:118-131`, ไม่อยู่ → COMPLETED) → รันซ้ำไม่เกิดผลซ้ำ — **ต่างกลไกกับ payment-reminder-job** ที่ใช้ durable unique key (`payment-reminder-job.js:10-16,56-76`) |
| Audit log? | ❌ **ไม่เขียน AuditLog** (ไม่ส่ง `onAudit` — ดูข้อ 4 B.9); comment ในไฟล์ (`:133-153`) ที่ว่า writer "handles audit natively" หมายถึง workflowHistory/activity ไม่ใช่ hash-chain |
| Calendar | `getDeadlineStatus` จาก `utils/working-days` (`:16,104`) = ตัว canonical ✅ |
| โครงเทียบ payment-reminder-job (Q2) | เหมือน: cross-tenant scan + per-item fault isolation + per-tenant re-entry; ต่าง: (ก) checker เป็น hourly `'15 * * * *'` **ไม่ระบุ timezone** (`<R>/apps/backend/jobs/scheduler.js:29-39`) vs reminder daily 09:00 Asia/Bangkok (`:262-275`) (ข) dedup คนละกลไก (ค) checker **เขียน state** ส่วน reminder ประกาศห้ามเขียน |
| Notification เมื่อปิด | ✅ ส่ง `APPLICATION_EXPIRED` ถึงเกษตรกร + `REVISION_DEADLINE_EXPIRED` ถึง SCHEDULER/ADMIN (`:216-273`) — best-effort |
| **marker แยก "เคสที่ cron นี้ปิด" จาก EXPIRED เหตุอื่น** | **มี partial marker แต่ไม่ unified — ตัว EXPIRED writer ในเส้น correction มีถึง 5 ตัว คนละ marker:** (1) hourly cron → `formData._autoExpired {expiredAt, reason, deadlineId, originalDeadline}` + actorId `cron-revision-deadline-checker`, deadline→`EXPIRED` (`revision-deadline-checker.js:194-206,156-162`) (2) `GET /api/cron/auto-cancel` → `cancelReason: REVISION_OVERDUE\|CAR_OVERDUE` + `canceledExpiredAt`, actorId `cron`, deadline→`FAILED` (`cron.js:259-299`) (3) lazy guard ตอนเกษตรกร resubmit ช้า → `expiredAt` + `expiredReason: REVISION_OVERDUE`, deadline→`FAILED` (`revision-deadline-guard.js:88-126`) (4) officer-lazy บน canonical transition → `cancelReason` + `canceledExpiredAt`, actorId = **เจ้าหน้าที่** (`workflow-transitions-handler.js:161-205`) (5) CAR submit ช้า → `cancelReason: CAR_OVERDUE` + `carOverdueDetectedOnSubmitAt`, actorId `system:car-deadline` (`applications-car.js:128-172`) — waiver-service เองบันทึกว่า "The four expiry writers stamp slightly different event shapes" (`waiver-reopen-service.js:56-58`; นับจริงวันนี้ = 5) → **นิยาม "เคสที่ถูกปิดโดย cron ข้อ 5" แยกจาก lazy-expiry ไม่ได้ด้วย marker เดียววันนี้** — ดู AMBIGUOUS A-1 |

### ข้อ 6 — Reopen

| ประเด็น | ของจริง | gap |
|---|---|---|
| Role จริง | reviewer = `CANONICAL_ROLES.DOCUMENT_REVIEWER` (`'document_reviewer'`) / Audit = `AUDITOR` (`'auditor'`) — `<R>/apps/backend/shared/canonical-rbac.js:40-41`; aliases `reviewer/inspector` map เข้าแล้ว (`:68-72`) | ✅ |
| Gate สอง role นี้ที่มีอยู่ | (1) `AUDITOR_ROLES = {DOCUMENT_REVIEWER, AUDITOR}` (`<R>/apps/backend/routes/api/helpers/application-constants.js:217-221`) ใช้ที่ reject endpoint (`application-workflow-handlers.js:47-49`) (2) **precedent ตรงที่สุด**: waiver ผูก role กับ stage แล้ว — reviewer สำหรับ revision-expired / auditor สำหรับ CAR-expired + pin เฉพาะผู้ตรวจที่ได้รับมอบหมาย (`waiver-reopen-service.js:156-167`) (3) `ROLE_TRANSITIONS` แยก edge สอง role (`workflow-transition-service.js:125-150`) | ✅ pattern พร้อม — แต่ FINAL ไม่ได้บอกว่าต้อง assigned-only หรือ role-wide (waiver = assigned-only) → คำถามเปิด |
| สถานะเคสบอก stage ที่ตกได้ไหม | คอลัมน์ status บอกไม่ได้ (EXPIRED เหมือนกัน) — กลไกที่มี: `deriveExpiredFromState()` อ่าน workflowHistory ย้อน + fallback `cancelReason` (`waiver-reopen-service.js:62-79`) | ✅ derivable, reuse ได้ |
| บังคับ 3 อย่าง (note / เอกสารความจำนง / actor+role+เวลา+เคสอัตโนมัติ) | ไม่มี precedent ครบทั้งสาม: waiver มี note ≥20 ตัวอักษร + auto `requestedBy/requesterRole/applicationId/createdAt` แต่ **ไม่มีไฟล์แนบ** (`waiver-reopen-service.js:128-131, 201-213`; Q3 findings ยืนยัน "ไม่มี field เลขที่หนังสือ" `evidence/Q3-reopen-audit/findings.md:67`) · slip มีไฟล์แนบใน tx (pipeline ตามรายงานรอบก่อน `evidence/R2-special-reopen/spec-reader-report.md` CONFIRMED §2 — reuse ได้เลย) แต่ไม่มี note | ⚠️ ต้องประกอบใหม่จากสอง precedent; ไฟล์แนบชน **D-11ข** (Attachment ไม่มี `retainUntil/legalHold`, `detachAllByUploader` PDPA soft-delete ได้ — `attachment-service.js:219-241`) |
| List view precedent | (1) waiver pending queue: `GET /provider/waiver-reopen/requests` — role gate ใน route (`normalizeRole !== ACCOUNT_DTAM/ACCOUNT` → 403) + service org-scoped fail-closed (`<R>/apps/backend/routes/api/provider/waiver-reopen.js:94-113`) (2) slip: `GET /finance/payment-slips/pending` — `authenticateProvider + requireSlipReadAll` + org guard (`<R>/apps/backend/routes/api/finance/payment-slips.js:316-322`) | ✅ pattern มี — แต่ waiver list เป็น **pending-only** ไม่ใช่ "query ย้อนได้ทั้งหมด" ที่ FINAL ข้อ 6 ต้องการ (ตาราง `WaiverReopenRequest` query ได้แต่ไม่มี route ประวัติ) |
| `reopenedFrom` + เคสเก่าคง terminal | ยังไม่มี field ใด ๆ (Q3 findings ข้อ 5, grep ทั้ง repo = 0) — pattern เดิมที่มี: renewal สร้างเคสใหม่ + JSON marker (`renewal-service.js:288-296` ตามรายงานรอบก่อน) | ❌ ต้องสร้าง (D-8 เดิมยังใช้ได้: nullable FK จริง) |
| **ทับกับ waiver-reopen (ธง L4)** — ข้อเท็จจริง | waiver ครอบ**ทุก application ที่ status=EXPIRED ซึ่ง derive ได้ว่า expired จาก REVISION_REQUESTED/CAR_PENDING โดยไม่แยกว่า writer ไหนปิด** (`waiver-reopen-service.js:147-153` + `deriveExpiredFromState:62-79` ที่ normalize ครอบ expiry writer ทุกตัว) → **เคสที่ cron ข้อ 5 ปิด เป็น subset แท้ของเคสที่ waiver ครอบ** = เคสเดียวกันจะมีสองกลไก (waiver: same-case คืนชีพ + reuse เงินเดิม + Account อนุมัติ / R2 FINAL: new-case + reviewer/auditor กดตรง ไม่มี Account) — waiver ทำงานอยู่จริงบน branch นี้ และ template `APPLICATION_EXPIRED` **โฆษณาช่องทาง waiver กับเกษตรกรว่า "อนุมัติโดยฝ่ายบัญชี"** (`notification-service.js:203-205`) | 🚩 รายงานข้อเท็จจริง — ห้ามตัดสิน (L4 ค้างตาม `QUEUE.md:22`) |
| **D-1 (เงิน)** | FINAL ไม่ตอบ — default ปัจจุบัน: เคสใหม่ mint `phase1Amount 5535` / `phase2Amount 27675` (`application.prisma:65,80`) แล้วเดิน billing chain `SUBMITTED→PENDING_DOC_FEE` โดย SYSTEM (`workflow-transition-service.js:165`) = **ไม่ตัดสิน = เก็บใหม่เต็มโดยปริยาย**; เทียบ waiver ที่ reuse เงินเดิม (`waiver-reopen-service.js:98-121`) | 🚩 OPEN — operator ต้องตอบก่อน S2 |

### ข้อ 7 — supersession ครบไหม

**Mark แล้วถูกต้อง:** `evidence/R2-special-reopen/final-requirements.md` · `legal-basis.md` · `mandate-ssot.md:29-34` (REVISION section) · `evidence/DECISIONS-CROSSREF.md:28-33` (banner) · `QUEUE.md:17` (ชี้ ACTIVE ถูก)

**ยังไม่ mark (list ครบ — รายงาน ไม่แก้):**
1. `<R>/evidence/R2-special-reopen/spec-reader-report.md` — **ไม่มี banner ทั้งไฟล์** ทั้งที่มีเนื้อหา superseded: A-4 "Admin เท่านั้น" (`:175-178`), A-5 "ทำไม R2 ต้องเป็น Admin" (`:182`), I-1/I-3 ออกแบบ `ReopenApproval` (`:147,149`), A-9 "approval ชี้เคส" (`:199`), A-10 void idiom (`:202-205`), A-11 ไฟล์แนบ approval/หนังสืออนุมัติ (`:207-209`), A-15 (`:222-223`)
2. `<R>/evidence/R2-special-reopen/blocked-decisions.md` — **ไม่มี banner ทั้งไฟล์**: D-6 + ข้อเสนอ admin-check (`:68-76`), D-10 void-only (`:106-110`), D-11 "ไฟล์แนบหนังสืออนุมัติ" (`:112-115` — FINAL เปลี่ยนเป็น "เอกสารแสดงความจำนงลูกค้า" คนละเอกสาร), D-13 "admin reopen ข้าม org" (`:121-124`)
3. `<R>/evidence/Q3-reopen-audit/mandate.md:4,13` — design เก่า "เลขที่หนังสืออนุมัติ + role เจ้าหน้าที่" ยังเป็นถ้อยคำ active
4. `<R>/evidence/Q3-reopen-audit/findings.md:67,74,90,96` + `report.md:12` — อ้าง "เลขหนังสืออนุมัติ / approval-ref" ของ design เก่า
5. `<R>/evidence/R2-special-reopen/orchestration-log.md:8-9` — log ประวัติอ้าง D-6/ReopenApproval (เป็น append-only log — ให้ operator ตัดสินว่าต้อง annotate หรือยกเว้นโดยธรรมชาติของ log)

(หมายเหตุนอก scope grep ที่สั่ง แต่เป็นถ้อยคำ live ในโค้ด: `notification-service.js:203-205,230,239` — ข้อความถึงเกษตรกร/เจ้าหน้าที่ระบุ "อนุมัติโดยฝ่ายบัญชี" ของ **waiver** — ถูกต้องสำหรับ waiver วันนี้ แต่จะอยู่ร่วมจอกับ R2 "ไม่มี Account ทุกจุด" — ผูกกับ L4)

---

## 2. CONFIRMED / INFERRED / AMBIGUOUS

### CONFIRMED (ทุกข้อมี file:line ข้างบน — สรุปหัวใจ)
- C-1 ไม่มี expiry บนเส้นทางจ่ายช้าที่ระดับ application — state machine/phase columns/jobs/adapter ครบทุกชั้น (ตาราง ข้อ 1)
- C-2 นาฬิกา 5 วันทำการ Thai-calendar + reset ต่อรอบ + หยุดระหว่างรีวิว **มีแล้วโดยพฤติกรรม** (ตาราง ข้อ 2)
- C-3 counter ต่อ stage ไม่มี — `revisionCount` รวม doc+CAR ใน row เดียว (`audit.prisma:119,124`), `rejectCount` ไม่มี writer
- C-4 กติกา "reject ครั้งที่ 3 → fee" **ไม่ live** — `SUBMISSION_THRESHOLD=3` เป็น dead export (`payment-constants.js:88`), loop limit ถูกถอดตั้งแต่ 2026-03-22 (`workflow-transition-service.js:200-203`)
- C-5 notification แจ้งผลไม่ผ่านไม่ bindable วันนี้ — ครบเฉพาะ canonical doc-review surface; CAR และ `PATCH /reject` ขาด (ตาราง ข้อ 3)
- C-6 "จดหมายเก็บถาวร" ไม่มี — Notification ถูกลบได้ 3 ทาง (`job-scheduler.js:95-100`, `pdpa-erasure-service.js:715`, opt-out `notification-service.js:401-415`)
- C-7 correction flow มี write path ที่เป็น update-in-place/delete อย่างน้อย 7 กลุ่ม (ข้อ 4 ส่วน B) — จุดหนักสุด: เอกสารเกษตรกร replace + hard-delete (`applications.js:892-896,933-943`; `application-document-sync.js:60-81`) และ `RevisionDeadline` row เดียว upsert ทับ
- C-8 EXPIRED writer ในเส้น correction มี **5 ตัว** คนละ marker คนละ deadline-terminal-status และ**ไม่มีตัวไหนเขียน AuditLog** (ข้อ 4 B.9, ข้อ 5)
- C-9 waiver-reopen ครอบ superset ของเคสที่ cron ปิด และยัง live + ถูกโฆษณาใน notification template (ข้อ 6)
- C-10 role/stage mapping ของ FINAL ข้อ 6 มี precedent ตรงตัวใน `waiver-reopen-service.js:156-167`

### INFERRED
| # | ข้อสรุป | จาก | มั่นใจ |
|---|---|---|---|
| I-1 | รายงานรอบก่อน (renewal pattern / upload pipeline / migration idiom / flag idiom) **ยังใช้ได้ทั้งหมด** — จุดยึดที่ตรวจซ้ำ (canonical-rbac:40-41, application.prisma:65,80, workflow-transition-service:80-83, waiver-reopen-service:406 area) ตรงกับที่รายงานไว้ | spot-check ใน session นี้ | สูง |
| I-2 | ถ้า implement req 5 "cron ปิดเคส + reopen เฉพาะ cron-closed" โดยไม่รวม lazy-expiry writers 4 ตัว → เคสส่วนหนึ่งที่หลุดกรอบ 5 วันเหมือนกันจะ reopen ไม่ได้เพราะถูก lazy writer ปิดก่อน cron รอบถัดไป (hourly window) | โครง writer ทั้ง 5 + cron cadence `scheduler.js:29-39` | สูง |
| I-3 | "แจ้งผลไม่ผ่าน" แบบบังคับ + เก็บถาวร ทำไม่ได้บน Notification model ปัจจุบันโดยไม่แตะ retention/opt-out semantics — เพราะ opt-out ตัด row ที่ต้นทาง | `notification-service.js:401-415` + prefs service | สูง |
| I-4 | Append-only ตาม FINAL ข้อ 4 แบบครบตัวอักษร ("ทุก role ทุกกรณี") กระทบ write path นอก scope reopen (draft document replace/delete เป็น UX ปกติของ wizard) — ขอบเขต "correction flow" ต้องถูกนิยามก่อน implement | ข้อ 4 ส่วน B | สูง |

### AMBIGUOUS (ทางตีความ + ผลต่าง)
- **A-1 · "เคสปิดจากข้อ 5 เท่านั้น" นิยามด้วยอะไร [MATERIAL: สิทธิ์]** — (ก) cron ตัวเดียว (`revision-deadline-checker` — marker `_autoExpired`) → เคสที่ lazy writer 4 ตัวปิด (เหตุเดียวกัน: หลุดกรอบ 5 วัน) reopen ไม่ได้ ทั้งที่พฤติกรรมเกษตรกรเหมือนกัน 100% (ข) นับทุก writer ที่ปิดเพราะ deadline (normalize แบบ `deriveExpiredFromState`) → ต้องมี unified marker ใหม่ (ค) cron route `/api/cron/auto-cancel` นับด้วยไหม (external caller) — ผลต่าง: ชุดเคสต้นทางต่างกันมาก และตัดสินว่าใครมีสิทธิ์ reopen
- **A-2 · นาฬิกาเริ่มที่ "แจ้งผล" หรือ "บันทึกผล" [MATERIAL: สิทธิ์เกษตรกร]** — ปัจจุบัน = บันทึกผล (notification best-effort, บาง surface ไม่ส่งเลย) — ถ้า FINAL แปลว่า "ต้องแจ้งสำเร็จก่อนนาฬิกาเดิน" ต้อง redesign ลำดับ commit/notify; ถ้าแปลว่า "เวลาเดียวกับการบันทึก" ของเดิมใช้ได้แต่ต้องอุด surface ที่ไม่ส่ง
- **A-3 · ขอบเขต append-only [MATERIAL: PDPA]** — "ทุก role ทุกกรณี ไม่มี edit/delete" ครอบแค่ record ผลตรวจ/comment/reopen หรือครอบเอกสารที่เกษตรกรส่งแก้ด้วย — ถ้าครอบเอกสาร: ชน PDPA delete (`detachAllByUploader`, pdpa-erasure) และชน UX replace เอกสารใน draft — ผูก D-11ข
- **A-4 · reviewer/auditor = role-wide หรือ assigned-only [MATERIAL: สิทธิ์]** — waiver precedent = assigned inspector เท่านั้น (`waiver-reopen-service.js:164-167`); FINAL เขียนแค่ role — สองทางให้ blast radius ต่างกัน (ทั้ง org กดได้ vs เฉพาะเจ้าของเคส) และเคสที่ cron ปิดอาจไม่มี reviewer/auditor assigned (ตกก่อน assign ไม่ได้เพราะ REVISION/CAR ต้อง assigned แล้ว — แต่ staff ลาออก/ถูกลบมีจริง)
- **A-5 · waiver coexist (L4 ค้าง) [MATERIAL: เงิน+สิทธิ์]** — เคสกลุ่มเดียวกันมีสองประตู เงินคนละนโยบาย (reuse vs mint ใหม่ default) สอง SoD ขัดกัน (Account-approve vs no-Account) และ template แจ้งเกษตรกรวันนี้ชี้ไปที่ waiver — ห้าม assume ตาม `QUEUE.md:22`
- **A-6 · "จดหมายในระบบ" คืออะไร** — notification ธรรมดาที่ยกเว้น retention/opt-out หรือ entity ใหม่ (letter/permanent record) — ผลต่าง: แตะ PDPA erasure path (`pdpa-erasure-service.js:715`) กับไม่แตะ
- **A-7 · D-7 เดิม (ผู้สมัครห้ามเห็น reopen) vs FINAL ข้อ 3 (ต้องแจ้งเกษตรกร)** — FINAL บังคับแจ้งผลไม่ผ่าน+กำหนดส่ง แต่ไม่พูดว่าเกษตรกรเห็น "เคสใหม่ที่เปิดจาก reopen" ไหม — payload builder ยัง whitelist ปิดอยู่ (ตามรายงานรอบก่อน `application-payload-builders.js:89-92`) — ต้องวางเส้น visibility ใน design

---

## 3. ต้องให้ operator ตัดสินก่อน implement

1. **[เงิน] D-1** — เคสใหม่จาก reopen จ่ายใหม่เต็ม (default วันนี้: 5,535+27,675 `application.prisma:65,80` + auto billing chain `workflow-transition-service.js:165`) หรือ reuse แบบ waiver (`waiver-reopen-service.js:98-121`) — FINAL ไม่ตอบ; ไม่ตัดสิน = เก็บใหม่เต็มโดยปริยาย
2. **[เงิน] dead config "ครั้งที่ 3"** — `SUBMISSION_THRESHOLD=3` + `RESUBMISSION` fee (`payment-constants.js:88`, `business-rules.js:38,122-123`) ให้ถอนทิ้งหรือคงไว้ — ขัดเจตนา "วนไม่จำกัด" ถ้าใครหยิบไปใช้; รวมถึงข้อความ `APPLICATION_EXPIRED` ที่บอกว่าต้องจ่ายงวด 1 ใหม่ (`notification-service.js:199-205`) ต้องอัปเดตตามคำตอบ D-1
3. **[สิทธิ์] A-1 นิยามเคสต้นทาง** — cron ตัวเดียว / ทุก deadline-expiry writer / รวม `/api/cron/auto-cancel` — และต้องสั่งว่า marker ใหม่เป็นแบบไหน (5 writers วันนี้ 3 marker shape, deadline terminal status 2 แบบ EXPIRED/FAILED)
4. **[สิทธิ์] A-4** — role-wide หรือ assigned-only (waiver precedent = assigned-only)
5. **[PDPA] D-11ข (แรงขึ้น)** — "เอกสารแสดงความจำนงลูกค้า" บังคับแนบ vs `Attachment` ไม่มี `retainUntil/legalHold` + `detachAllByUploader` PDPA ลบได้ (`attachment-service.js:219-241`) + FINAL ข้อ 4 ห้าม delete — ต้องตัดสิน legal-hold
6. **[PDPA/scope] A-3** — ขอบเขต append-only: ครอบเอกสารเกษตรกร (replace/hard-delete วันนี้ `applications.js:892-943`) และ formData merge (`application-review-revision-methods.js:99-101`) ด้วยหรือไม่
7. **[L4 — รอหนังสือนิติกร]** waiver coexist — เคสที่ cron ปิดอยู่ใน scope waiver ทั้งหมด (subset) — ห้าม assume; ถ้า R2 ship ก่อน L4 กลับ ต้องสั่งว่า template ที่โฆษณา waiver (`notification-service.js:203-205`) ทำอย่างไร
8. **[นิยาม] A-2** — นาฬิกาเริ่มที่ "แจ้งผลสำเร็จ" หรือ "บันทึกผล" (กระทบว่าต้อง redesign notify-before-clock หรือไม่)
9. **[nice-to-decide] A-6** — "จดหมายในระบบ" = notification ยกเว้น retention หรือ entity ใหม่; และ D-7 visibility เส้นแบ่ง (A-7)

## 4. ร่างลำดับ implement (S-numbering ใหม่ — เรียงตาม dependency เท่านั้น)

- **S1 — Unified expiry marker + audit** (ฐานของทุกข้อ): นิยาม marker เดียว + `onAudit` hook ให้ expiry writer ตามคำตอบ A-1 — ต้องมาก่อนเพราะ req 6 scope ผูกกับ marker และ req 4 บังคับ audit (RED-first ได้: pin ว่า expiry ทุกตัวมี AuditLog + marker)
- **S2 — นาฬิกา/counter per stage + SSOT เลข 5**: counter ต่อ stage (append รายรอบ ไม่ทับ `RevisionDeadline` เดิม — ต้อง EXPAND ตาม Law 3.10) — พึ่ง S1 (round record ควรเกิดที่เดียวกับ decision write)
- **S3 — Notification บังคับ + จดหมายถาวร**: อุด 3 surface ที่ขาด (CAR branch, auditor handler, PATCH reject) + permanent-letter ตามคำตอบ A-6 — พึ่ง S2 (ต้องมีเลขครั้ง/รายการประเด็นใส่ในจดหมาย)
- **S4 — Append-only correction records**: แปลง write path กลุ่ม B ตาม scope ที่ operator ตัดสิน (A-3) — พึ่ง S2 (เลขครั้ง) และเดิน EXPAND-before-CONTRACT
- **S5 — Cron ปิดเคส hardening**: audit log + marker (จาก S1) + reconcile lazy writers ตาม A-1
- **S6 — Reopen action + บังคับ 3 อย่าง (test pin) + `reopenedFrom`**: พึ่ง S1 (marker), S5, คำตอบ D-1/D-11ข/A-4 และ **D-9 (ธง L3 carry-over — ยังบล็อกการสร้าง row ใหม่ตาม `DECISIONS-CROSSREF.md` D-9)**
- **S7 — Reopen list view + visibility เส้น D-7**: พึ่ง S6
- **S8 — Supersession cleanup เอกสาร** (รายการข้อ 7): อิสระ ทำได้ทันทีที่ operator สั่ง

---

**Material-ambiguity สรุป (STOP-relevant):** **เงิน** — D-1 (default = เก็บใหม่เต็ม), dead resubmission fee config, waiver reuse-เงินเดิม coexist (A-5) · **identity/PDPA** — D-11ข (เอกสารความจำนง vs delete-by-uploader), A-3 (append-only vs PDPA erasure) · **สิทธิ์** — A-1 (นิยามเคสต้นทาง/marker), A-4 (role-wide vs assigned), A-5 (สอง SoD ขัดกันบนเคสกลุ่มเดียว), A-2 (นาฬิกาเดินโดยไม่แจ้ง) — ทั้งหมดต้องได้คำตอบ operator ก่อน dispatch implementer ตาม `CLAUDE.md` §7