# SPEC-READER REPORT — R2 SPECIAL REOPEN (EXPAND-only)

Branch ยืนยัน: `/home/user/GACP-Certification-Application/.git/HEAD:1` → `ref: refs/heads/feat/special-reopen`
หมายเหตุเครื่องมือ: session นี้มีแต่ Read/Grep/Glob — **ไม่มี Bash** จึงรัน `git log`/`session-check.sh` ไม่ได้ ทุกข้ออ้างจากไฟล์บนดิสก์เท่านั้น

---

## CONFIRMED

### 1. Renewal pattern — template ของ `createReopenedApplication`

ไฟล์: `/home/user/GACP-Certification-Application/apps/backend/services/renewal-service.js`

| สิ่งที่ถาม | ของจริง | file:line |
|---|---|---|
| signature | `createRenewalApplication({ originalCertificateId, actorId, prisma })` | `renewal-service.js:207` |
| อ่านต้นทาง | `prisma.application.findFirst({ where:{id, isDeleted:false}, select:{ id, healthId, entityId, organizationId, areaType, applicationNumber, formData }})` | `renewal-service.js:266-277` |
| field ที่ set ตอน create | `healthId`, `organizationId`, `status:'DRAFT'`, `applicationNumber`, `areaType`, `formData`, `createdBy: actorId`, `updatedBy: actorId` | `renewal-service.js:305-314` |
| `entityId` | เพิ่มเฉพาะเมื่อ source มีค่า (conditional spread) | `renewal-service.js:315-317` |
| `organizationId` / `healthId` | copy จาก **source application** ตรง ๆ ไม่ derive จาก actor | `renewal-service.js:306-307` |
| การเชื่อมเคสเก่า | **JSON marker ใน formData** ไม่ใช่คอลัมน์: `renewalOf`, `renewalOfCertificateNumber`, `renewalOfExpiryDate`, `renewalSourceApplicationId` | `renewal-service.js:288-296` |
| สถานะเริ่มต้น | `status:'DRAFT'` + `formData.workflowState:'DRAFT'` + `workflowStateUpdatedAt` (stamp คู่กัน) | `renewal-service.js:294-295, 308` |
| การเขียนสถานะ | **ไม่ผ่าน `writeApplicationStatus`** — `prisma.application.create()` ตรง | `renewal-service.js:319` |
| audit | **ไม่มี audit row** — มีแค่ `logger.info` | `renewal-service.js:321-325` |

**applicationNumber allocator — ไม่มีตัวเดียว มี 4 รูปแบบขนานกัน (นี่คือ SSOT breach ที่มีอยู่แล้ว):**
- `renewal-service.js:302-303` → `GACP-REN-{ปีพ.ศ.}-{hex6}` (ประกาศตัวเองว่าเป็น *placeholder*)
- `routes/api/helpers/application-constants.js:259-264` `ensureApplicationNumber(prefix='APP')` → `{prefix}-{ปีพ.ศ.}-{base36 ts}-{hex6}`; เรียกจริงที่ `routes/api/applications/applications.js:234` ด้วย prefix `'APP'`
- `services/application-service/application-draft-query-methods.js:59-62` → `GACP-{ปีพ.ศ.}-{count+1 padded 5}-{ts4}`
- `services/application-service/application-submission-methods.js:131` → `APP-{ค.ศ.}-{ts6}`

**ข้อบังคับของ Application model ที่เคสใหม่ต้องมีเสมอ** (`apps/backend/prisma/schema/application.prisma`):
`applicationNumber String @unique` `:9` · `healthId String` + FK → `User.canonicalId` `:12-13` · `areaType String` (NOT NULL) `:35` · `organizationId String` (NOT NULL) + FK Restrict `:189-190` · `serviceType String @default("new_application")` `:34` · `consentedPDPA Boolean @default(false)` `:39` · `phase1Amount Int @default(5535)` `:65` · `phase2Amount Int @default(27675)` `:80` · `version Int @default(1)` `:50`

### 2. File-upload pipeline ที่จะ reuse

**Entry point ที่ implementer เรียกได้จริง (3 ชั้น):**

1. **multer uploader factory** — `apps/backend/services/storage-service.js:217-248`
   `createUploader(folder, allowedMimeTypes = ['image/jpeg','image/png','application/pdf'], maxFileSizeMB = 20)`
   - validate ชนิด: **mimetype AND extension ต้องตรงกัน** `storage-service.js:191-198` (`isUploadAllowed`) — map ที่ `:154-168`
   - stored filename ไม่เชื่อ `originalname` ใช้ canonical ext จาก mimetype `storage-service.js:207-214`
   - validate ขนาด: `limits:{ fileSize: maxFileSizeMB*1024*1024 }` `storage-service.js:224`
   - reject แบบ `cb(null,false)` + stash `req.uploadRejectionReason`/`req.uploadRejectionCode='UPLOAD_REJECTED'` (ไม่ throw → route ต้องมี `if (!req.file) return 400` เอง) `storage-service.js:235-245`
   - path-confinement helper `resolveWithinUploads()` `storage-service.js:402-415`
   - shared instance (20MB, jpg/png/pdf) `apps/backend/middleware/upload-middleware.js:5-9`
2. **การผูกไฟล์กับ entity** — polymorphic `Attachment` `(resModel, resId, field)`
   - model: `apps/backend/prisma/schema/attachment.prisma:36-85` (fileName/fileUrl/fileSize/mimeType/fileHash/uploadedBy + soft-delete 4 คอลัมน์ + `organizationId` **required** `:68-69`)
   - service: `apps/backend/services/attachment-service.js` → `attach()` `:83-134` (บังคับ `prisma, resModel, resId, fileName, fileUrl, fileSize`), `listForResource()` `:148-172`, `detach()` `:184-206`, `detachAllByUploader()` (PDPA delete-by-uploader) `:219-241`, `findByHash()` `:254-272`
3. **ตัวอย่าง end-to-end ที่ใกล้ที่สุด (upload → row → attachment ใน tx เดียว)** — payment slip
   - uploader 5MB: `apps/backend/routes/api/finance/payment-slips.js:61-63`
   - route: `router.post('/upload', authenticateAny, slipUpload.single('file'), ...)` `:201`
   - สร้าง `fileUrl` จาก `file.path` → `/uploads/slips/{basename}` `:238-240`
   - SHA-256 fail-open `:248-260`
   - `attachmentService.attach({ prisma: tx, resModel:'PaymentSlip', resId: slip.id, field:'fileUrl', ... })` **ใน transaction เดียวกับ create** `apps/backend/services/payment-slip-service.js:658-670`

**PDPA/retention ที่มีอยู่:**
- `Attachment` มี soft-delete + `detachAllByUploader` `attachment-service.js:219-241` แต่ **ไม่มี `retainUntil`/`legalHold`**
- `retainUntil`+`legalHold` มีเฉพาะบน Application (5 ปี) `application.prisma:162-163`, Invoice/Journal (7 ปี) `billing.prisma:112-113, 511-512`, Certificate `certification.prisma:116-117`, User `auth.prisma:161-162`, Organization `tenancy.prisma:71-72`
- masking free-text: `maskThaiIdsInText()` `apps/backend/utils/field-encryption.js:299-307` — ใช้จริงกับ `WaiverReopenRequest.reason`/`decisionNote` `waiver-reopen-service.js:210, 387, 664`
- audit metadata ถูก mask อัตโนมัติก่อน persist+hash `apps/backend/middleware/audit-logger.js:391-394`

### 3. Identity / role surface

- **Role vocabulary จริง**: `CANONICAL_ROLES` ที่ `apps/backend/shared/canonical-rbac.js:33-60` — ค่า Admin คือ **`'admin'`** (`CANONICAL_ROLES.ADMIN` `:34`); มี `PLATFORM_ADMIN: 'platform_admin'` แยกต่างหาก `:38`
- aliases ที่ resolve เป็น admin: `admin`, `super_admin` `canonical-rbac.js:63-64`
- `ROLE_GROUPS.ADMIN_ONLY = ['admin','ADMIN','SUPER_ADMIN']` `canonical-rbac.js:252-254`
- ADMIN ได้ทุก permission `canonical-rbac.js:221`; PLATFORM_ADMIN ก็ได้ทุก permission `:224`
- **middleware ที่มีจริง:**
  - `requireRole(allowedRoles)` `apps/backend/middleware/role-middleware.js:17-67`; export `:273`; re-export จาก auth-middleware `:1003`
  - `requirePermission` — **dead** (อ่าน `req.user.hasPermission` ที่ไม่เคยถูก populate → 403 เสมอ) `role-middleware.js:130-136`
  - `requireEffectivePermission` — GRANT/REVOKE-aware แต่ **ยังไม่ wire เข้า route ไหนเลย** ("Not wired into any live route yet") `role-middleware.js:174-175, 181-220`
  - **`requireCanonicalPermission(permission)`** — นิยามอยู่ที่ `apps/backend/routes/api/provider/handlers/shared.js:31-43`, export `:66` (ไม่ใช่ไฟล์ middleware/) ใช้ `hasPermission(canonicalRole, permission)`
  - auth: `authenticateProvider` `apps/backend/middleware/auth-middleware.js:566` (cookie `provider_token` ก่อน header)
- **Provider ID เก็บที่ไหน**: `User.providerId String?` `apps/backend/prisma/schema/auth.prisma:39` — เป็น **เลขประจำตัวประชาชนของเจ้าหน้าที่** (คู่กับ `providerIdHash`/`providerIdHmac` `:40-42`, index `:253`); `User.canonicalId String @unique` `:45` คือคอลัมน์ที่ใช้ทำ FK ทุกตาราง
- **doctrine ในโค้ดเรื่อง actor id**: `waiver.prisma:31` — *"Requester = the ASSIGNED inspector (User.id UUID — never a national ID)"*; และ `payment-slips.js:276-279` — *"the audit actorId must be a NON-PII stable id (the User UUID), NOT the FK-token/national-ID we stamp into uploadedBy. Keeps audit_logs.actorId free of the national ID"*

### 4. Terminal states SSOT

- `TERMINAL_STATUSES = new Set(['REJECTED','EXPIRED','CANCEL_EXPIRED','CERTIFIED'])`
  `apps/backend/services/application-status-writer.js:131-136`; export `:838`
- ผู้บริโภค: `apps/backend/routes/api/applications/application-bundles.js:32, 110-113, 269` (R1) · `apps/backend/services/payment-slip-service.js:16, 20-21` · `application-status-writer.js:786`
- R1 evidence ยืนยันว่า R1 **ไม่ได้แก้เนื้อใน set** แค่ import ไปใช้: `evidence/R1-terminal-integrity/plan.md:11`, `evidence/R1-terminal-integrity/report.md:8`
- **`CANCELLED` ของ application ไม่มีจริง** — `WORKFLOW_STATES` ที่ `apps/backend/services/workflow-transition-service.js:18-39` ลงท้ายด้วย `REJECTED`, `EXPIRED`, `CANCEL_EXPIRED` เท่านั้น; `CANCEL_EXPIRED` ถูกประกาศว่า **deprecated, ไม่มี code path เขียนแล้ว** `workflow-transition-service.js:81-83`; `assertCanonicalStatus()` จะโยน `NON_CANONICAL_STATUS` ถ้าเขียนค่านอก list `application-status-writer.js:171-193`
  (`'CANCELLED'` ที่มีในระบบเป็นของโดเมนอื่น: `CheckoutOrder.status` `migrations/20260802150000_.../migration.sql:51` และ `WorkActivity.state` `application-status-writer.js:792-796`)
- **EXPIRED ไม่ terminal จริงในโค้ดปัจจุบัน** — มี edge `EXPIRED → REVISION_REQUESTED | CAR_PENDING` `workflow-transition-service.js:80`, SYSTEM-only `:181-182`, มี fence + break-glass `application-status-writer.js:303-343`, และมี resurrection path ที่ทำงานอยู่จริง `apps/backend/services/waiver-reopen-service.js:406-447`

### 5. Migration idiom EXPAND

- **migration ล่าสุดที่เป็น EXPAND ล้วน**: `apps/backend/prisma/migrations/20260802150000_wave1_checkout_engine_expand/migration.sql`
  - header ประกาศ EXPAND-only + rollback แบบ manual เขียนไว้ในคอมเมนต์ `:1-19`
  - ห่อ `BEGIN;`…`COMMIT;` `:21, 197`
  - `CREATE TABLE IF NOT EXISTS` + inline `CONSTRAINT ..._pkey` + `CHECK` mirroring JS vocab `:25-77`
  - `CREATE UNIQUE INDEX IF NOT EXISTS` / partial unique (สิ่งที่ PSL เขียนไม่ได้) `:79-94`
  - `CREATE INDEX IF NOT EXISTS` ต่อ FK + status + organizationId `:96-100`
  - FK แยกเป็นบล็อกท้ายไฟล์: app-FK `ON DELETE SET NULL`, org-FK `ON DELETE RESTRICT ON UPDATE CASCADE` `:176-195`
- **precedent ที่ใกล้ R2 ที่สุด** (ตาราง approval ผูก application): `apps/backend/prisma/migrations/20260708030000_waiver_reopen_requests/migration.sql:12-60` — CREATE TABLE `:12-30`, FK ผ่าน `DO $$ ... pg_constraint` guard `ON DELETE RESTRICT` `:32-42`, index `applicationId` + `(organizationId,status)` `:44-48`, partial unique 2 ตัว `:53-60`
- **schema folder**: `previewFeatures = ["prismaSchemaFolder"]` `apps/backend/prisma/schema/_base.prisma:7` → แยกไฟล์ต่อโดเมนได้ (precedent: `waiver.prisma` เป็นไฟล์เดี่ยวของโดเมน waiver)
- **tenant scoping**: `TENANT_SCOPED_MODELS` `apps/backend/services/tenant-prisma-extension.js:40-121`; `WaiverReopenRequest` ลงทะเบียนไว้ที่ `:94`; `Attachment` ที่ `:111`; `Application` ที่ `:45`
  - read-scoping ยัง **flag-gated ปิดอยู่**: `orgReadScopeEnabled()` = `process.env.TENANT_READ_ORG_SCOPE === 'true'` `tenant-prisma-extension.js:185-192`, ใช้ที่ `:211-216`
  - write-side inject/verify `organizationId` ทำงานเสมอ (throw `CROSS_TENANT_WRITE`) `tenant-prisma-extension.js:166-182`
  - `ENTITY_SCOPED_MODELS = { Application, Farm }` `:149-152`
  - doctrine ที่เขียนไว้ในโค้ด: service filter คือกำแพงจริง (`waiver.prisma:22-25`, `waiver-reopen-service.js:691-703`)
- **precedent ที่ไม่ tenant-scope โดยเจตนา**: `ApplicationDocument` ไม่มี `organizationId` `apps/backend/prisma/schema/application-document.prisma:21-22`

### 6. Feature flag idiom

- **ไม่มี module feature-flag กลาง** — `apps/backend/config/` มี 13 ไฟล์ ไม่มี `feature-flags.js`
- idiom ที่ใช้จริง: ฟังก์ชัน pure ใน config ต่อโดเมน
  `function isStripeCheckoutEnabled() { return process.env.STRIPE_CHECKOUT_ENABLED === 'true'; }` `apps/backend/config/stripe.js:33-36`, export `:74`
  - คอมเมนต์ในไฟล์ระบุว่า config layer เป็น **ที่เดียวที่อ่าน `process.env`** (ratchet counter: env-direct) `config/stripe.js:38-42`
- **การเรียกที่ route**: require แบบ lazy ในตัว handler แล้ว fail-closed 503 พร้อม error code
  `apps/backend/routes/api/finance/payments.js:409-417` (`STRIPE_CHECKOUT_DISABLED`)
- **`.env.example` idiom**: `STRIPE_CHECKOUT_ENABLED="false"   # <คำอธิบายว่า true ทำอะไร / อะไรคือ fallback>` `apps/backend/.env.example:180`; อีกตัวอย่าง `EMAIL_ENABLED="false"` `:111-112`
- flag แบบเดียวกันในชั้น data: `TENANT_READ_ORG_SCOPE` `tenant-prisma-extension.js:185-192`; `AUDIT_HASH_HMAC` `audit-logger.js:404`; `AUTH_LOOKUP_USE_HMAC` (อ้างที่ `auth.prisma:36-37`)
- **FE flag idiom**: `process.env.NEXT_PUBLIC_PWA_ENABLED === 'true'` `apps/web-app/src/app/layout.tsx:74` — ประกาศเป็น build ARG/ENV ใน `apps/web-app/Dockerfile:41-42, 65-66` และ `apps/web-app/next.config.ts:17, 48` (FE flag ถูก bake ตอน build)

### 7. Audit log idiom

- module: `apps/backend/middleware/audit-logger.js` — export `{ auditLogger, AuditCategory, AuditSeverity, ResourceType, statusTransitionAuditHook }` `:852-858`
- **API 2 ตัว**:
  - `auditLogger.logWithin(event, tx)` — **บังคับ tx**, ไม่กลืน error `:569-578`
  - `auditLogger.log(event)` — path ปกติ (ทั้งคู่ share `_buildAuditRow` เพื่อไม่ให้ drift `:344-351`)
- envelope: `{ category, action, severity, actorId, actorRole, actorType, resourceType, resourceId, ipAddress, userAgent, metadata, result, errorCode, errorMessage }` `audit-logger.js:352-374`
- hash-chain: `previousHash`+`sequenceNumber` ต่อ organization `:330-341`; metadata ถูก mask แล้วค่อย hash (`persistedMetadata`) `:391-394`
- **helper สำหรับ status write**: `statusTransitionAuditHook({ tx, metadata })` `:834-850` → คืน callback ที่เรียก `logWithin(..., tx)`
- **ตัวอย่างการเรียกจริงที่ใกล้ R2 ที่สุด (hash-chain + tx เดียว)**: `apps/backend/services/waiver-reopen-service.js:406-447` โดยเฉพาะ `onAudit: statusTransitionAuditHook({ tx, metadata: auditMetadata })` `:419`; ตัว `auditMetadata` ประกอบที่ `:327-333` (`waiverRequestId, reasonCode, requestedBy, approvedBy, approverSide`)
- ตัวอย่าง direct `logWithin` นอก writer: `application-status-writer.js:667-683` (`CERT_AUTO_GEN_ROLLBACK`)

### 8. Banner / read-side (S5)

- **หน้า FE (applicant)**: `apps/web-app/src/app/health/applications/[id]/page.tsx:13-19` (server wrapper) → `apps/web-app/src/app/health/applications/[id]/client-view.tsx`
  - fetch 3 ตัว: `/applications/{id}`, `/applications/{id}/status`, `/applications/{id}/history` `client-view.tsx:120-122`
  - copy มาจาก i18n dict: `const detailCopy = dict.health.applicationDetail` `client-view.tsx:89` (`useLanguage()` `:30`); dictionary ที่ `apps/web-app/src/lib/i18n/dictionaries/sections/th-health.ts` + `en-health.ts` (มี parity test `apps/web-app/src/lib/i18n/__tests__/dictionary-parity.test.ts`)
- **หน้า FE (provider)**: `apps/web-app/src/app/provider/applications/[id]/page.tsx`
- **BE endpoint ที่ FE เรียก**: `router.get('/:id', authenticateHealth, ...)` `apps/backend/routes/api/applications/application-workflow-handlers.js:220-242` → คืน `buildApplicationDetailPayload(app)` `:237`
- **payload builder**: `apps/backend/routes/api/helpers/application-payload-builders.js:38-` — คืน `id, applicationId, applicationNumber, healthId, serviceType, areaType, certificationPurpose(s), previousCertNumber, consentedPDPA, status, workflowState, workflowStateUpdatedAt, submittedAt, phase1/2Status|Amount|PaidAt, createdAt, updatedAt, steps, formData(whitelist)` `:52-93`
  → **ยืนยัน: ไม่มี `reopenedFrom`/`reopenedTo` ใน response** และ builder ใช้ **whitelist ของ formData โดยเจตนา** (`:89-92`) ดังนั้นถ้าเก็บ marker ไว้ใน formData มันจะ **ไม่หลุดออก response เอง**
- error-code catalogue idiom (R1 ใช้): `apps/backend/shared/error-codes.js:1409-1416` (`code/httpStatus/messageEn/messageTh/source/remediation`) + helper `lookup()`+`sendErrorResponse()` ที่ `apps/backend/routes/api/applications/application-bundles.js:119-127`

---

## INFERRED

| # | ข้อสรุป | อนุมานจาก | ความมั่นใจ |
|---|---|---|---|
| I-1 | ที่วาง `ReopenApproval` ที่ตรง idiom ที่สุดคือ **ไฟล์ prisma ใหม่ต่อโดเมน** ไม่ใช่ยัดใน `application.prisma` | `waiver.prisma` เป็นไฟล์เดี่ยวของโดเมน waiver ทั้งไฟล์ + `_base.prisma:7` เปิด `prismaSchemaFolder` | สูง |
| I-2 | ถ้าใช้ `reopenedFrom` เป็น **Prisma relation จริง** ต้องเพิ่ม **2 field** บน `Application` (scalar + back-relation array) เพราะ Prisma บังคับ self-relation ต้องมีทั้งสองข้าง | ไม่พบ self-relation ใดในทั้ง `apps/backend/prisma/schema/` (grep `parentId`/self-relation = ไม่พบ); คู่เทียบ `Certificate.renewedCertificateId`/`previousCertificateId` เป็น **scalar เปล่า ไม่มี `@relation`** `certification.prisma:84-85` | สูง |
| I-3 | `ReopenApproval` ควรมี `organizationId String` (required, ไม่มี default) + ลงทะเบียนใน `TENANT_SCOPED_MODELS` ตาม precedent | `waiver.prisma:22-26` + `tenant-prisma-extension.js:94`; ถ้าไม่ใส่ write-side จะไม่ inject org และไม่มีกำแพง | สูง |
| I-4 | route ใหม่จะอยู่ใต้ `/api/provider/...` และใช้ `router.use(authenticateProvider)` + gate role ในตัว handler/service (ไม่ใช่ `requireRole` ที่ router-level) | precedent เดียวกันทั้งไฟล์ `apps/backend/routes/api/provider/waiver-reopen.js:31, 96-103` (BE-authoritative, "All role/SoD gates live in services/" `:14-15`) | สูง |
| I-5 | `REOPEN_ENABLED` จะไม่มี config module ให้เกาะ ต้องสร้างไฟล์ config ใหม่ (หรือ export ฟังก์ชันจากไฟล์ service ของ R2) เพราะไม่มี feature-flags กลาง | `apps/backend/config/*` 13 ไฟล์ ไม่มี feature-flags; `config/stripe.js:33-36` เป็น pattern เดียวที่มี | สูง |
| I-6 | `createdBy` ของ approval ในความหมายที่โค้ดใช้จริงคือ **`User.id` (UUID)** ไม่ใช่ `User.providerId` | `waiver.prisma:31` ระบุชัด "User.id UUID — never a national ID"; `payment-slips.js:276-279` ระบุ policy เดียวกัน; `WaiverReopenRequest.requestedBy/decidedBy` ถูกป้อนด้วย `user.id` `waiver-reopen-service.js:205, 381-383` | สูง (แต่ขัดกับถ้อยคำโจทย์ → ดู A-3) |
| I-7 | ถ้าจะทำ audit "ทุก field ของ approval" ตาม idiom → `auditLogger.logWithin(event, tx)` ในทรานแซคชันเดียวกับ create, `category: AuditCategory.APPLICATION`, `resourceType: ResourceType.APPLICATION` | `application-status-writer.js:667-683` + `audit-logger.js:834-850` | กลาง-สูง (ยังไม่มี `AuditCategory` ค่าที่เหมาะกับ reopen โดยเฉพาะ) |
| I-8 | เคสใหม่ที่สร้างที่ S0 = `status:'DRAFT'` + `formData.workflowState:'DRAFT'` (ต้อง stamp คู่ ไม่งั้น transition ถัดไป 422) | `renewal-service.js:294-295, 308`; เหตุผลอธิบายไว้ที่ `application-status-writer.js:349-371` (Bug 3.1) | สูง |
| I-9 | filter "เคสต้นทางที่เป็น terminal" ฝั่ง BE ต้อง reuse `TERMINAL_STATUSES` (ห้าม re-list) ตามที่ R1 เพิ่งทำ | `application-bundles.js:109-113` + `evidence/R1-terminal-integrity/plan.md:11` (อ้าง Law 3.6) | สูง |
| I-10 | ข้อความไทยของ banner ฝั่ง FE ต้องเข้า i18n dict (มี parity test บังคับ th/en) | `client-view.tsx:89` + `apps/web-app/src/lib/i18n/__tests__/dictionary-parity.test.ts` | สูง |

---

## AMBIGUOUS

### A-1 · `CANCELLED` ของ application ไม่มีอยู่จริง — doc ขัดโค้ด **[MATERIAL: สิทธิ์/workflow]**
โจทย์: "EXPIRED และ CANCELLED = terminal ทั้งคู่". โค้ด: `WORKFLOW_STATES` ไม่มี `CANCELLED` (`workflow-transition-service.js:18-39`); สิ่งที่มีคือ `CANCEL_EXPIRED` ซึ่งถูกประกาศว่า deprecated ไม่มี writer เหลือแล้ว (`:81-83`).
ทางตีความ: (ก) `CANCELLED` = `CANCEL_EXPIRED` → reopen source ที่มีจริงจะเจอแต่ legacy rows (ข) `CANCELLED` = `REJECTED` (ค) `CANCELLED` เป็น state ใหม่ที่ต้องเพิ่มเข้า `WORKFLOW_STATES` → ไม่ใช่ EXPAND ล้วนแล้ว.
ผลต่าง: ทั้ง 3 ทางให้ชุดเคสต้นทางที่ต่างกันสิ้นเชิง และทาง (ค) แตะ SSOT ของ state machine.

### A-2 · ขอบเขต terminal ที่ reopen ได้ ยังไม่ปิด **[MATERIAL: สิทธิ์]**
`TERMINAL_STATUSES` มี 4 ค่า (`application-status-writer.js:131-136`) แต่โจทย์ระบุแค่ 2. ยังไม่ตัดสินว่า `REJECTED` (ถูกปฏิเสธจากการตรวจ) และ `CERTIFIED` (ออกใบรับรองไปแล้ว) เปิดเคสต่อเนื่องได้หรือไม่ — ถ้า `CERTIFIED` ได้ จะทับกับ renewal flow ที่มีอยู่ (`renewal-service.js:207`), ถ้า `REJECTED` ได้ จะเป็นช่องเลี่ยงผลการตัดสินของผู้ตรวจ.

### A-3 · `createdBy = "Provider ID"` — คำนี้ชนกับ PII doctrine ของ repo **[MATERIAL: identity / PDPA]**
`User.providerId` = เลขบัตรประชาชนของเจ้าหน้าที่ (`auth.prisma:39-42`). โค้ดมี doctrine เขียนไว้ตรง ๆ ห้ามเก็บค่านี้ในฟิลด์ actor/audit (`waiver.prisma:31`, `payment-slips.js:276-279`).
ทางตีความ: (ก) "Provider ID" = `User.id` UUID (ตาม I-6) (ข) = `User.canonicalId` (ค่าที่ใช้ทำ FK, `auth.prisma:45` — แต่กำลังอยู่ระหว่าง re-key detokenize `auth.prisma:46-55`) (ค) = `User.providerId` จริง ๆ ตามตัวอักษร → จะยิงเลขบัตรลง approval row + audit metadata (audit จะ mask ให้บางส่วน `audit-logger.js:391-394` แต่คอลัมน์ในตารางไม่ mask).
ผลต่าง: ทางเลือก (ค) = PII leak ถาวรในตารางที่ประกาศว่า immutable.

### A-4 · "Admin เท่านั้น" (ธง L2) ไม่มี middleware ตัวไหนแปลว่า "เท่านั้น" **[MATERIAL: สิทธิ์]**
`requireRole(['admin'])` จะ **ปล่อย `platform_admin` ผ่านโดยไม่เช็ค list เลย** (`role-middleware.js:40-42`); `ROLE_GROUPS.ADMIN_ONLY` ยังรวม raw string `'SUPER_ADMIN'` (`canonical-rbac.js:252-254`); `roleMiddleware.superAdminOnly` = `requireRole(['admin'])` ตัวเดียวกับ `adminOnly` (`role-middleware.js:92-95`).
ทางตีความ: ยอมรับ platform_admin / ไม่ยอมรับ (ต้องเช็ค `normalizeRole(...) === CANONICAL_ROLES.ADMIN` เองแบบ waiver `waiver-reopen-service.js:157-163`) — เกี่ยวกับธง L2 โดยตรง.
เพิ่มเติม: `AUDIT-001` ในโค้ดถอด ADMIN ออกจาก decision path โดยเจตนา (`canonical-rbac.js:296-300`, `waiver-reopen-service.js:250-256`) — R2 กำลังจะเดินสวนทาง precedent นั้น.

### A-5 · ความสัมพันธ์กับ waiver-reopen เดิม (ธง L4) **[MATERIAL: สิทธิ์ + เงิน]**
มี resurrection path ที่ **ทำงานอยู่จริงบน branch นี้**: `EXPIRED → REVISION_REQUESTED|CAR_PENDING` (`workflow-transition-service.js:80, 181-182`) executed by `waiver-reopen-service.js:406-447`, once-per-application ล็อกด้วย partial unique (`migrations/20260708060000_waiver_once_only_leniency_scope/`, base `20260708030000_.../migration.sql:53-60`), SoD = inspector ยื่น + DTAM accountant อนุมัติ (`waiver-reopen-service.js:11-21, 247, 250-279`), และ **reuse ค่าธรรมเนียมเดิม ไม่ออกใบแจ้งหนี้ใหม่** (`waiver.prisma:5-7`, `waiver-reopen-service.js:98-121`).
ยังไม่ตัดสิน: R2 อยู่ร่วมกับ waiver หรือแทนที่ · เคสที่เคยใช้ waiver ไปแล้วขอ R2 ได้ไหม · R2 ควร consume/นับ once-only counter ของ waiver ไหม · ทำไม R2 ต้องเป็น Admin ในขณะที่ waiver ระบุ "ADMIN ไม่อยู่ในเส้นทางนี้" (`waiver-reopen-service.js:126, 253`).

### A-6 · เคสใหม่ = ต้องจ่ายเงินใหม่หรือไม่ — โจทย์ไม่พูดถึงเลย **[MATERIAL: เงิน]**
Application ใหม่จะได้ `phase1Amount` default 5535 และ `phase2Amount` default 27675 (`application.prisma:65, 80`) และเดิน billing chain ปกติ (`SUBMITTED→PENDING_DOC_FEE` โดย SYSTEM, `workflow-transition-service.js:165`).
ทางตีความ: (ก) จ่ายใหม่เต็ม (default ถ้าไม่ทำอะไร) (ข) reuse การชำระของเคสเดิมแบบ waiver (`waiver-reopen-service.js:98-121`) (ค) ยกเว้นค่าธรรมเนียม.
ถ้าไม่ตัดสิน ผลลัพธ์คือ (ก) โดยปริยาย — เป็นการตัดสินเรื่องเงินโดยไม่มีใครสั่ง

### A-7 · "ห้าม copy ข้อมูลใด ๆ อัตโนมัติ" ชนกับ NOT NULL constraints (ธง L3)
`Application` บังคับ `healthId`(FK) `:12-13`, `areaType` `:35`, `organizationId`(FK) `:189-190`, `applicationNumber` unique `:9`. เคสใหม่จะสร้างไม่ได้เลยถ้าไม่ carry อย่างน้อย 3 ค่านี้จากต้นทาง (renewal ก็ carry ทั้ง 3 `renewal-service.js:306-310`).
ทางตีความ: "ห้าม copy" หมายถึงเฉพาะ **เนื้อหาคำขอ (formData/documents)** หรือรวมถึง identity columns ด้วย · `entityId` (`:24`) และ `submitterId` (`:31`) นับเป็น identity หรือเนื้อหา · `serviceType`/`consentedPDPA` จะปล่อย default (`:34, 39`) หรือ carry.

### A-8 · รูปแบบ `reopenedFrom`: FK จริง vs scalar เปล่า และนิยาม "EXPAND ล้วน"
โจทย์บอก "nullable FK". ถ้าเป็น FK จริงต้องเพิ่ม back-relation field ใน `Application` model block (I-2) — **เป็นการแก้ block ของ model เดิม** ซึ่งขัดข้อ "ห้ามแตะ schema เดิม" ในเชิงตัวอักษร แม้จะ additive.
ทางเลือกที่มี precedent: scalar เปล่าแบบ `Certificate.previousCertificateId` (`certification.prisma:84-85`) → ไม่ต้องแตะ model อื่นแต่ **ไม่มี referential integrity**; หรือเก็บ marker ใน `formData` แบบ renewal (`renewal-service.js:290`) → ไม่แตะ schema เลย แต่ query "หาเคสที่ reopen จาก X" ต้องสแกน JSON.
ผลต่าง: integrity, ความสามารถ index, และคำนิยาม EXPAND ที่จะถูก probe ตรวจ.

### A-9 · precondition "ต้นทาง terminal จริง" มี race window
`writeApplicationStatus` มี `breakGlassReopen` (`application-status-writer.js:293, 313-314`) และ waiver path ที่พา EXPIRED ออกได้ (`waiver-reopen-service.js:406-447`). ยังไม่ตัดสินว่าต้องมี CAS/`expectedVersion` (`application-status-writer.js:441-443`) หรือ DB constraint กันไม่ให้ approval ชี้เคสที่ออกจาก terminal ไปแล้วหลังผ่าน check.
ถ้าไม่ล็อก: เคสหนึ่งอาจถูกทั้ง waiver-reopen (คืนชีพเคสเดิม) และ R2 (เปิดเคสใหม่) พร้อมกัน.

### A-10 · Immutability + "void พร้อมเหตุผล" ไม่มี idiom ในโค้ด
ไม่พบคอลัมน์/สถานะ VOID ที่ไหน (grep `VOID|voided|reversal` ใน `billing.prisma` → เจอแค่คอมเมนต์ `:551, 598, 932`). สิ่งที่มีคือ soft-delete 4 คอลัมน์ `isDeleted/deletedAt/deletedBy/deleteReason` (`attachment.prisma:62-65`, `application.prisma:157-160`).
ทางตีความ: void = soft-delete (แต่ semantics ต่างกัน: soft-delete ถูก auto-filter ออกจาก read ทั้งหมด) / void = คอลัมน์ status ใหม่ `ACTIVE|VOIDED` / void = แถวใหม่ที่ชี้แถวเก่า.
และ "ไม่มี update path" บังคับที่ไหน — service layer อย่างเดียว หรือ DB trigger/RLS (repo มี RLS migrations `20260429100100_rls_phase_e1_observe_only` แต่เป็น observe-only).

### A-11 · ไฟล์แนบของ approval: `Attachment` vs คอลัมน์ตรง
`Attachment` บังคับ `organizationId` (`attachment.prisma:68`) และเป็น tenant-scoped (`tenant-prisma-extension.js:111`) — ok. แต่: `Attachment` **ไม่มี retention (`retainUntil`/`legalHold`)** และ `detachAllByUploader` (PDPA) จะ soft-delete ไฟล์แนบของ approval ด้วยถ้าเจ้าหน้าที่คนนั้นถูก PDPA-delete (`attachment-service.js:219-241`) — ชนกับ "immutable หลังสร้าง".
ยังไม่ตัดสิน: mimetype/ขนาดที่อนุญาตสำหรับหนังสืออนุมัติ (slip ใช้ 5MB jpg/png/pdf `payment-slips.js:61-63`, ค่า default 20MB `storage-service.js:220`) · ไฟล์แนบบังคับหรือ optional · หลาย field slot หรือหนึ่ง.

### A-12 · S5 banner: แสดงฝั่งไหน และต้องเปิด field ใน response ไหน
โจทย์บอก "UI หน้าเดียวสำหรับ role เจ้าหน้าที่" (form) และ "ไม่มี entry point ฝั่งผู้สมัคร" แต่ banner ไม่ระบุ surface. `buildApplicationDetailPayload` เป็น payload **ของ applicant** (`application-workflow-handlers.js:220`, builder `application-payload-builders.js:38-93`) และ whitelist ไว้โดยเจตนาเพื่อไม่ให้ internal field หลุด (`:89-92`).
ทางตีความ: (ก) banner บนหน้า provider เท่านั้น → ไม่ต้องแตะ applicant payload (ข) บนหน้า applicant ด้วย → ต้องเพิ่ม `reopenedFrom`/`reopenedTo` + เลขที่คำขอใหม่เข้า whitelist = เปิดเผยข้อมูลเชิงบริหารให้ผู้สมัครเห็น.
ผลต่าง: ถ้า (ข) ผู้สมัครจะเห็นว่ามีเคสใหม่ถูกเปิดแทนตน ก่อนที่กฎหมายจะตัดสินอำนาจอนุมัติ (ธง L1).

### A-13 · `applicationNumber` ของเคส reopen ใช้ generator ตัวไหน
มี 4 รูปแบบขนานกัน (ดู CONFIRMED §1). renewal ใช้ prefix เฉพาะ `GACP-REN-` แต่คอมเมนต์เรียกตัวเองว่า placeholder ที่จะถูก consolidator เขียนทับตอน SUBMIT (`renewal-service.js:298-303`) — ขณะที่ `ensureApplicationNumber` ที่อ้างถึงจริง ๆ ถูกเรียกแค่ตอนสร้าง draft ใหม่ (`applications.js:234`) ไม่ใช่ตอน submit. ยังไม่ตัดสินว่า R2 จะใช้ prefix ใหม่ (เพิ่มรูปแบบที่ 5 → เสี่ยง ratchet Law 3.6) หรือ reuse `ensureApplicationNumber('APP')`.

### A-14 · `REOPEN_ENABLED` — scope ของ flag และฝั่ง FE
BE idiom ชัด (`config/stripe.js:33-36`) แต่ยังไม่ตัดสิน: flag คุมแค่ route (503 แบบ `payments.js:411-417`) หรือคุมถึง read-side/banner ด้วย · FE ต้องมี `NEXT_PUBLIC_REOPEN_ENABLED` แยกไหม (FE flag ถูก bake ตอน build `apps/web-app/Dockerfile:41-42` → flip flag ต้อง rebuild image ไม่ใช่แค่ restart) · หรือ FE อ่านจาก API response.

### A-15 · `ReopenApproval` เข้า `TENANT_SCOPED_MODELS` แล้ว cross-org reopen เป็นไปได้ไหม
`Application.organizationId` required. ถ้า approval scoped ที่ org ของเจ้าหน้าที่ แต่เคสต้นทางอยู่คนละ org → write จะโดน `CROSS_TENANT_WRITE` (`tenant-prisma-extension.js:172-180`). ยังไม่ตัดสินว่า admin (tenant-scoped ตาม SEC-PROV-001 `canonical-rbac.js:255-256`) reopen ข้าม org ได้หรือไม่.

---

## สรุป material-ambiguity (สำหรับตัดสิน STOP)

**แตะเงิน:** A-6 (เคสใหม่จ่ายค่าธรรมเนียมใหม่หรือ reuse — ถ้าไม่ตัดสิน default คือเก็บใหม่เต็ม 5535+27675 `application.prisma:65,80`), A-5 (R2 vs waiver ที่ reuse เงินเดิม)
**แตะ identity/PII:** A-3 (`createdBy = Provider ID` = เลขบัตร ปชช. ขัด doctrine `waiver.prisma:31` / `payment-slips.js:276-279`)
**แตะสิทธิ์:** A-1 (`CANCELLED` ไม่มีในระบบ), A-2 (REJECTED/CERTIFIED reopen ได้ไหม), A-4 (`requireRole(['admin'])` ปล่อย `platform_admin` ผ่านฟรี `role-middleware.js:40-42`; ADMIN ถูกถอดจาก decision path โดยเจตนาใน AUDIT-001), A-5 (SoD ชนกับ waiver ที่ระบุ "ADMIN ไม่อยู่ในเส้นทาง"), A-12 (banner ฝั่ง applicant = เปิดเผยการตัดสินใจเชิงบริหารก่อนธง L1 ปิด)

**ธง L1-L4 ที่โค้ดบังคับให้ต้องตัดสิน:** L1 → A-12 · L2 → A-4, A-5 · L3 → A-7 · L4 → A-5, A-9