# R2 SPECIAL REOPEN — ใบตัดสินใจที่ค้าง (operator เท่านั้น)
> ที่มา: `evidence/R2-special-reopen/spec-reader-report.md` (spec-reader, fresh context)
> กติกาที่บังคับให้หยุด: operator R2 rule "🚩 ธง BLOCKED-ON-LEGAL … **ห้าม assume ทุกกรณี**" + `CLAUDE.md` §7 (escalation: แตะเงิน / ขัด doctrine) + `CLAUDE.md` §3.2 (ห้าม fabricate spec)
> orchestrator ตรวจสอบซ้ำเองทุกข้อในตารางนี้แล้ว — ทุกบรรทัดมี file:line ที่เปิดดูจริงใน session นี้

## สรุปสถานะ
S1–S5 **ทุกข้อ**มี dependency บนคำตอบข้างล่างอย่างน้อย 1 ข้อ → ไม่มี sub-task ไหนที่ implement ได้โดยไม่ assume
ยกเว้นชิ้นเดียว (§ท้ายไฟล์) ที่ตัดสินแล้วแต่ไม่มีค่าถ้าส่งเดี่ยว

---

## กลุ่ม 1 — แตะเงิน (CLAUDE.md §7 escalation ตรง ๆ)

### D-1 · เคสใหม่จากการ reopen ต้องจ่ายค่าธรรมเนียมใหม่หรือไม่ (spec-reader A-6)
โจทย์ R2 ไม่พูดถึงเงินเลย แต่ **ไม่ตัดสิน = ตัดสินโดยปริยายว่าเก็บใหม่เต็ม**:
`Application.phase1Amount Int @default(5535)` (`apps/backend/prisma/schema/application.prisma:65`) และ
`phase2Amount Int @default(27675)` (`:80`) จะติดมากับ row ใหม่ แล้วเดิน billing chain ปกติ
(`SUBMITTED → PENDING_DOC_FEE` โดย SYSTEM, `apps/backend/services/workflow-transition-service.js:165`)

| ทางเลือก | ผล |
|---|---|
| (ก) จ่ายใหม่เต็ม | ผู้สมัครถูกเรียกเก็บ 5,535 + 27,675 ซ้ำ จากเคสที่เจ้าหน้าที่เป็นคนเปิดให้ |
| (ข) reuse การชำระของเคสเดิม | มี precedent จริง — waiver ทำแบบนี้ (`apps/backend/prisma/schema/waiver.prisma:5-7`, `apps/backend/services/waiver-reopen-service.js:98-121`) |
| (ค) ยกเว้นค่าธรรมเนียม | ต้องมีฐานอำนาจ |

**orchestrator ไม่เสนอทางเลือกในข้อนี้** — Law 3.4 (NO MONEY MUTATION by agent) + §7

### D-2 · R2 อยู่ร่วมกับ waiver-reopen เดิมอย่างไร (A-5 — ธง L4)
waiver-reopen **ทำงานอยู่จริงบน main**: `EXPIRED → REVISION_REQUESTED|CAR_PENDING`
(`workflow-transition-service.js:80`, SYSTEM-only `:181-182`) execute ที่ `waiver-reopen-service.js:406-447`
once-per-application ล็อกด้วย partial unique (`apps/backend/prisma/migrations/20260708030000_waiver_reopen_requests/migration.sql:53-60`)

ต้องตัดสิน 4 ข้อย่อย: R2 อยู่ร่วม/แทนที่ · เคสที่ใช้ waiver ไปแล้วขอ R2 ได้ไหม · R2 กิน once-only counter ของ waiver ไหม · เงินฝั่ง R2 ตาม D-1 ต่างจาก waiver ที่ reuse เงินเดิมไหม

---

## กลุ่ม 2 — แตะ identity / PDPA

### D-3 · `createdBy = "Provider ID"` ในโจทย์ หมายถึงค่าไหน (A-3)
`User.providerId` ในสคีมาอยู่ในบล็อกเลขประจำตัวประชาชนของเจ้าหน้าที่
(`apps/backend/prisma/schema/auth.prisma:39-42` — คู่กับ `providerIdHash`/`providerIdHmac` รูปแบบเดียวกับ `healthIdHmac` `:38`)
และ repo มี doctrine เขียนห้ามไว้ตรง ๆ 2 จุด:
- `apps/backend/prisma/schema/waiver.prisma:31` — *"Requester = the ASSIGNED inspector (User.id UUID — never a national ID)"*
- `apps/backend/routes/api/finance/payment-slips.js:276-279` — audit actorId ต้องเป็น User UUID เพื่อไม่ให้เลขบัตรลง `audit_logs.actorId`

**ข้อเสนอ orchestrator: `createdBy = User.id (UUID)`** ตาม doctrine ที่มีอยู่ — ถ้าตีความตามตัวอักษรว่าเป็น `providerId` จริง จะเป็นเลขบัตรประชาชนถาวรในตารางที่โจทย์ประกาศว่า immutable (audit mask ให้เฉพาะ metadata `apps/backend/middleware/audit-logger.js:391-394` — คอลัมน์ในตารางไม่ถูก mask)

---

## กลุ่ม 3 — แตะสิทธิ์ (ธง L1/L2 — ผูกกับหนังสือหารือนิติกรกรมฯ)

### D-4 · `CANCELLED` ไม่มีอยู่จริงในระบบ (A-1)
โจทย์: "EXPIRED และ CANCELLED = terminal ทั้งคู่"
ของจริง: `WORKFLOW_STATES` (`workflow-transition-service.js:18-39`) จบที่ `REJECTED`, `EXPIRED`, `CANCEL_EXPIRED`
— **ไม่มี `CANCELLED`** และ `CANCEL_EXPIRED` ถูกประกาศว่า deprecated ไม่มี code path เขียนแล้ว (`:81-83`)
(ค่า `'CANCELLED'` ที่มีในระบบเป็นของโดเมนอื่น: `CheckoutOrder.status`, `WorkActivity.state`)

| ทางเลือก | ผล |
|---|---|
| (ก) `CANCELLED` = `CANCEL_EXPIRED` | เคสต้นทางที่จะเจอจริงมีแต่ legacy rows |
| (ข) `CANCELLED` = `REJECTED` | เปิดช่องกลับผลการตัดสินของผู้ตรวจ (ผูก D-5) |
| (ค) เพิ่ม `CANCELLED` เป็น state ใหม่ | **ไม่ใช่ EXPAND ล้วนแล้ว** — แตะ SSOT ของ state machine |

### D-5 · ขอบเขต terminal ที่ reopen ได้ (A-2)
`TERMINAL_STATUSES = {REJECTED, EXPIRED, CANCEL_EXPIRED, CERTIFIED}` (`apps/backend/services/application-status-writer.js:131-136`)
โจทย์ระบุแค่ 2 → ต้องตัดสิน `REJECTED` (= เลี่ยงผลผู้ตรวจ) และ `CERTIFIED` (= ทับ renewal flow ที่มีอยู่ `apps/backend/services/renewal-service.js:207`)

### D-6 · "Admin เท่านั้น" — ไม่มี middleware ตัวไหนแปลว่า "เท่านั้น" (A-4 — ธง L2)
`requireRole(['admin'])` **ปล่อย `platform_admin` ผ่านก่อนเช็ค allow-list เลย**
(`apps/backend/middleware/role-middleware.js:39-42` — `if (normalizedUserRole === CANONICAL_ROLES.PLATFORM_ADMIN) return next();`)
และ `roleMiddleware.superAdminOnly` = ตัวเดียวกับ `adminOnly` (`:92-95`)
เพิ่มเติมที่ชนกัน: AUDIT-001 **ถอด ADMIN ออกจาก decision path ของ waiver โดยเจตนา**
(`apps/backend/shared/canonical-rbac.js:296-300`, `apps/backend/services/waiver-reopen-service.js:250-256`)
→ R2 ที่ให้ Admin เป็นผู้อนุมัติ กำลังเดินสวน precedent นั้น

**ข้อเสนอ orchestrator (ถ้า L2 ยังไม่กลับ):** ไม่ใช้ `requireRole` — เช็ค `normalizeRole(...) === CANONICAL_ROLES.ADMIN` ในชั้น service แบบ waiver (`waiver-reopen-service.js:157-163`) เพื่อไม่ให้ `platform_admin` ได้สิทธิ์นี้โดยไม่มีใครสั่ง

### D-7 · banner (S5) แสดงฝั่งไหน (A-12 — ธง L1)
`buildApplicationDetailPayload` เป็น payload ของ **ผู้สมัคร** และ whitelist `formData` ไว้โดยเจตนา
(`apps/backend/routes/api/helpers/application-payload-builders.js:38-93`, whitelist `:89-92`)
→ วันนี้ **ไม่มี** `reopenedFrom`/`reopenedTo` หลุดออก response

| ทางเลือก | ผล |
|---|---|
| (ก) banner บนหน้า provider เท่านั้น | ไม่ต้องแตะ applicant payload |
| (ข) บนหน้า applicant ด้วย | ต้องเปิด field เข้า whitelist = ผู้สมัครเห็นว่ามีเคสใหม่ถูกเปิดแทนตน **ก่อน**ที่ธง L1 (อำนาจอนุมัติ) จะปิด |

---

## กลุ่ม 4 — รูปแบบทางเทคนิคที่เปลี่ยนนิยาม "EXPAND ล้วน"

### D-8 · `reopenedFrom` เป็นอะไร (A-8 + I-2)
FK จริงบน Prisma self-relation **บังคับให้เพิ่ม back-relation field ใน `Application` model block** (แก้ block ของ model เดิม — additive แต่ขัดข้อ "ห้ามแตะ schema เดิม" เชิงตัวอักษร)

| ทางเลือก | precedent | ราคา |
|---|---|---|
| (ก) FK จริง | ไม่มี self-relation ที่ไหนเลยใน `apps/backend/prisma/schema/` | ต้องแตะ `Application` block |
| (ข) scalar เปล่า | `Certificate.renewedCertificateId`/`previousCertificateId` (`apps/backend/prisma/schema/certification.prisma:84-85`) | ไม่มี referential integrity |
| (ค) marker ใน `formData` | renewal ทำแบบนี้ (`renewal-service.js:288-296`) | ไม่แตะ schema เลย แต่ query ต้องสแกน JSON |

### D-9 · "ห้าม copy ข้อมูลอัตโนมัติ" ชนกับ NOT NULL (A-7 — ธง L3)
`Application` บังคับ `healthId`(FK) `:12-13`, `areaType` `:35`, `organizationId`(FK) `:189-190`, `applicationNumber` unique `:9`
→ สร้าง row ใหม่ไม่ได้เลยถ้าไม่ carry อย่างน้อย 3 ค่านี้ (renewal ก็ carry ทั้ง 3 `renewal-service.js:306-310`)
ต้องตัดสิน: "ห้าม copy" = เฉพาะเนื้อหาคำขอ (formData/documents) หรือรวม identity columns · `entityId`/`submitterId` นับข้างไหน

### D-10 · "void พร้อมเหตุผล" ไม่มี idiom ในโค้ด (A-10)
ไม่พบคอลัมน์/สถานะ VOID ที่ไหนในสคีมา; ที่มีคือ soft-delete 4 คอลัมน์ (`apps/backend/prisma/schema/application.prisma:157-160`)
แต่ soft-delete ถูก auto-filter ออกจาก read ทั้งหมด — คนละความหมายกับ "void ที่ยังเห็นได้พร้อมเหตุผล"
ต้องตัดสิน: void = คอลัมน์ status ใหม่ `ACTIVE|VOIDED` / แถวใหม่ชี้แถวเก่า / soft-delete
และ "ไม่มี update path" บังคับที่ชั้นไหน — service เท่านั้น หรือ DB (repo มี RLS แต่เป็น observe-only `20260429100100_rls_phase_e1_observe_only`)

### D-11 · ไฟล์แนบหนังสืออนุมัติ (A-11)
`Attachment` **ไม่มี `retainUntil`/`legalHold`** (มีเฉพาะบน Application/Invoice/Certificate/User/Organization)
และ `detachAllByUploader()` (PDPA delete-by-uploader, `apps/backend/services/attachment-service.js:219-241`) จะ soft-delete ไฟล์แนบของ approval ด้วย ถ้าเจ้าหน้าที่คนนั้นถูก PDPA-delete → **ชนกับ "immutable หลังสร้าง"**
ต้องตัดสิน: บังคับ/optional · mimetype+ขนาด (slip ใช้ 5MB jpg/png/pdf `apps/backend/routes/api/finance/payment-slips.js:61-63`; default 20MB `apps/backend/services/storage-service.js:220`)

### D-12 · เลขคำขอของเคส reopen (A-13)
มี generator 4 รูปแบบขนานกันอยู่แล้ว (รายละเอียด+file:line ใน `spec-reader-report.md` CONFIRMED §1) — เพิ่มรูปแบบที่ 5 เสี่ยง ratchet `dup-source` (Law 3.6)
**ข้อเสนอ orchestrator:** reuse `ensureApplicationNumber()` (`apps/backend/routes/api/helpers/application-constants.js:259-264`) ไม่สร้าง prefix ใหม่

### D-13 · scope ของ `REOPEN_ENABLED` (A-14) และ cross-org (A-15)
flag คุมแค่ route (503 แบบ `apps/backend/routes/api/finance/payments.js:409-417`) หรือคุม read-side/banner ด้วย ·
FE ต้องมี flag แยกไหม (FE flag ถูก bake ตอน build `apps/web-app/Dockerfile:41-42` → flip ต้อง rebuild image) ·
admin reopen ข้าม org ได้ไหม (ถ้าไม่ได้จะโดน `CROSS_TENANT_WRITE` `apps/backend/services/tenant-prisma-extension.js:172-180`)

---

## ชิ้นเดียวที่ตัดสินแล้ว — และเหตุผลที่ยังไม่ส่ง
`apps/backend/config/reopen.js` (`isReopenEnabled()` อ่าน `process.env.REOPEN_ENABLED === 'true'`, default OFF)
ตรง idiom `apps/backend/config/stripe.js:33-36` และ **ไม่ทำให้ ratchet `env-direct` เพิ่ม** — ยืนยันจาก `scripts/probes/ratchet.sh` `count_env_direct()` ซึ่งนับเฉพาะ `services|routes|jobs|middleware` ไม่นับ `config/`

orchestrator เลือก **ยังไม่ส่งเป็น PR เดี่ยว** เพราะ flag ที่ไม่มีอะไรอยู่ข้างหลังยังไม่เปลี่ยนพฤติกรรมระบบ และ D-13 (scope ของ flag) ยังไม่ปิด — จะรวมอยู่ใน PR ของ R2 เมื่อคำตอบกลับมา
**เป็นการตัดสินใจของ orchestrator ไม่ใช่ของ operator — สั่งกลับได้ทันที**
