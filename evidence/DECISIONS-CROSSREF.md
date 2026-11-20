# CROSS-REFERENCE — ใบตัดสินใจ D-1..D-13 / E-1..E-8 เทียบมติที่บันทึกไว้แล้ว
> operator สั่ง 2026-08-03: "ข้อไหนที่คำตอบมีอยู่แล้วให้ apply เลย และรายงานว่าเหลือข้อไหนที่ยังไม่เคยตัดสินจริง ๆ"
> SSOT ที่ใช้เทียบ: `evidence/R2-special-reopen/mandate-ssot.md` · `evidence/AUTH-01/mandate.md` · `QUEUE.md:20-22` · doctrine ในโค้ด (Law 3.6/3.9)

## สรุปตัวเลข
| | APPLIED | OPEN (ยังไม่เคยตัดสิน) | รอหนังสือ/เอกสาร |
|---|---|---|---|
| **R2** (D-1..D-13) | **9** | **2** — D-1, D-11 | **2.5** — D-2, D-9 (นิติกรกรมฯ) + ครึ่ง policy ของ D-6 |
| **AUTH-01** (E-1..E-8) | **6** | **1** — E-4 | **1** — E-5 (รอคู่มือ ไม่ใช่รอนิติกร) |

**เหลือที่ต้องให้ operator ตอบจริง ๆ แค่ 3 ข้อ: D-1 (เงิน) · D-11 (ไฟล์แนบ + ชน PDPA) · E-4 (scope ของ §D3 localStorage)**

### คำตอบข้อ 3 ของ operator — ข้อไหนติดกลุ่ม "กฎกระทรวงบังคับ external เท่านั้น/อย่างน้อย"
**ไม่มีข้อไหนใน D-1..D-13 หรือ E-1..E-8 ติดกลุ่มนี้เลย**
คำถามกฎกระทรวงกระทบเฉพาะ **"การถอด local login จริงบน production"** ซึ่ง `evidence/AUTH-01/mandate.md:34` และ `:70` ประกาศไว้เองแล้วว่าเป็น**งานแยกอนาคต ห้ามถอดใน AUTH-01** → ไม่บล็อกงาน implement ใด ๆ ใน AUTH-01 วันนี้ มันกำหนดแค่ **"เมื่อไหร่จะกดปิด local"** ไม่ใช่ "จะสร้างสวิตช์ยังไง"

**สิ่งที่บล็อกจริงคือหนังสือคนละฉบับ** — ต้องแยกให้ชัด ไม่ให้รวมกันแล้วรอเก้อ:
| หนังสือ | บล็อกอะไร |
|---|---|
| **นิติกรกรมฯ** (อำนาจอนุมัติ / นิยาม role เจ้าหน้าที่ / carry-over / waiver coexist) | R2: **D-2**, **D-9**, ครึ่ง policy ของ **D-6** |
| **กฎกระทรวง** (external เท่านั้น vs เป็นอย่างน้อย) | ไม่บล็อกอะไรใน queue ปัจจุบัน — กระทบงานถอด local login ในอนาคต |
| **คู่มือ OAuth ของ IdP** (§B MANUAL-FIRST) | AUTH-01: **E-5** และการยืนยัน BLOCKER-2 (profile คืน CID หรือ pseudonymous sub) |

---

# R2 — D-1..D-13

> ⚠️ **2026-08-03 R2 FINAL ทับหมวดนี้บางส่วน** — ACTIVE requirement คือ `evidence/R2-special-reopen/final-requirements.md` เท่านั้น
> SUPERSEDED: **D-6** (reviewer/Audit กดตรง ไม่มีขาอนุมัติ ไม่มี Account — ดู `legal-basis.md`) · **D-10** (ไม่มี approval record แล้ว — append-only ตาม FINAL ข้อ 4)
> NARROWED: **D-4/D-5** (ต้นทาง = เฉพาะเคสที่ cron FINAL ข้อ 5 ปิด) · **D-2** (ยังรอนิติกร แต่ scope แคบลง)
> ต้องทบทวนใน gap report: **D-7** (FINAL ข้อ 3 บังคับ notification ถึงเกษตรกร)
> ยัง OPEN ตามเดิม: **D-1** (เงิน) · **D-11ข** (PDPA vs immutable — แรงขึ้นเพราะ FINAL ข้อ 6 บังคับแนบเอกสารความจำนง)
> **implementer/auditor ห้ามอ้างรายการ superseded**

## ✅ APPLIED (มติมีอยู่แล้ว — ไม่ต้องถามซ้ำ)

### D-3 → `createdBy` = **`User.id` (UUID)** ไม่ใช่ `User.providerId`
**มติที่ตอบ**: doctrine ที่บันทึกในโค้ดเอง 2 จุด — `apps/backend/prisma/schema/waiver.prisma:31` *"Requester = the ASSIGNED inspector (User.id UUID — never a national ID)"* และ `apps/backend/routes/api/finance/payment-slips.js:276-279` (audit actorId ต้องเป็น User UUID เพื่อไม่ให้เลขบัตรลง `audit_logs.actorId`)
เป็นกฎที่ระบบตัดสินไปแล้ว ไม่ใช่คำถามใหม่ → คำว่า "Provider ID" ในโจทย์อ่านว่า "ตัวตนของเจ้าหน้าที่" ไม่ใช่ชื่อคอลัมน์ `providerId`

### D-4 → `CANCELLED` = **`CANCEL_EXPIRED`**
**มติที่ตอบ**: SSOT ข้อ 4 "EXPAND-only" ตัดทางเลือก (ค) เพิ่ม state ใหม่เข้า `WORKFLOW_STATES` ออก (= แตะ SSOT ของ state machine) และ `QUEUE.md:21` บันทึกไว้แล้วว่าใช้ `TERMINAL_STATUSES` เป็น SSOT ซึ่งมี `CANCEL_EXPIRED` อยู่ ส่วนทางเลือก (ข) `REJECTED` ถูกแยกเป็นคำถามของตัวเองที่ D-5 อยู่แล้ว
**ผลที่ operator ควรรู้**: `CANCEL_EXPIRED` ถูกประกาศ deprecated ไม่มี code path เขียนแล้ว (`apps/backend/services/workflow-transition-service.js:81-83`) → ในทางปฏิบัติ **เคสต้นทางที่ reopen ได้วันนี้เกือบทั้งหมดคือ `EXPIRED`** ส่วน `CANCEL_EXPIRED` จะเจอเฉพาะ legacy rows

### D-5 → R2 ครอบ **เฉพาะ 2 สถานะที่ระบุ** (`EXPIRED` + `CANCEL_EXPIRED`)
**มติที่ตอบ**: SSOT ข้อ 3 ระบุ 2 ค่า ไม่ใช่ 4 → `REJECTED` และ `CERTIFIED` **อยู่นอก scope R2** (ไม่ใช่ "ห้ามตลอดไป" แต่ไม่ใช่งานนี้)
เหตุผลสนับสนุนจากโค้ด: `CERTIFIED` reopen จะทับ renewal flow ที่มีอยู่ (`apps/backend/services/renewal-service.js:207`) · `REJECTED` reopen = กลับผลการตัดสินของผู้ตรวจ ซึ่งเป็นเรื่องอำนาจอนุมัติ (ธง L1)

### D-6 (ครึ่งเทคนิค) → **ห้ามใช้ `requireRole(['admin'])`** ใช้การเช็คในชั้น service แทน
**มติที่ตอบ**: SSOT ข้อ 7 "Admin **เท่านั้น**" — คำว่าเท่านั้นบังคับด้วย `requireRole` ไม่ได้ เพราะมันปล่อย `platform_admin` ผ่านก่อนเช็ค allow-list (`apps/backend/middleware/role-middleware.js:39-42`)
**apply**: เช็ค `normalizeRole(...) === CANONICAL_ROLES.ADMIN` ในชั้น service ตาม precedent ของ waiver (`apps/backend/services/waiver-reopen-service.js:157-163`)
⚠️ **ต้องรู้ว่านี่เดินสวน SEC-PROV-001** ที่ประกาศว่า `platform_admin` = root ที่ผ่านทุก role requirement — ถ้า operator ต้องการให้ platform_admin ทำได้ด้วย สั่งคำเดียวก็กลับได้
**ครึ่ง policy ของ D-6 (ว่า role ที่ถูกต้องคือ Admin จริงไหม) ยัง LEGAL — ธง L2 รอนิติกรกรมฯ** ตาม `QUEUE.md:22`

### D-7 → banner **ฝั่ง provider เท่านั้น** ไม่แตะ payload ของผู้สมัคร
**มติที่ตอบ**: คำสั่ง R2 เดิม "ห้ามให้ผู้สมัครเห็น/เรียก endpoint reopen" (บันทึกไว้ที่ `evidence/R2-special-reopen/mandate-ssot.md` — **บรรทัดนี้ยังไม่เคย persist มาก่อน ขอ operator ยืนยันคำอ้าง**)
**apply**: ไม่เพิ่ม `reopenedFrom`/`reopenedTo` เข้า whitelist ของ `buildApplicationDetailPayload` (`apps/backend/routes/api/helpers/application-payload-builders.js:89-92`) → ธง L1 ไม่ถูกแตะโดยอัตโนมัติ

### D-8 → `reopenedFrom` = **nullable FK จริง** (scalar + back-relation)
**มติที่ตอบ**: SSOT ข้อ 1 "ผูกเคสเก่า" + สเปกเดิมเขียนคำว่า "nullable FK" เอง; SSOT ข้อ 4 "EXPAND-only" ไม่ได้ห้ามเติม field ลง model block — การเติม relation field เป็น additive ไม่มี column ใหม่ฝั่ง array และไม่แตะคอลัมน์เดิม (precedent: FK ที่เติมท้ายไฟล์ใน `apps/backend/prisma/migrations/20260802150000_wave1_checkout_engine_expand/migration.sql:176-195`)
**apply**: `reopenedFrom String?` + `@relation("ApplicationReopen", ...)` + back-relation array บน `Application`; ต้องตั้งชื่อ relation เพราะเป็น self-relation ตัวแรกของสคีมา

### D-10 → void-only = **คอลัมน์ `status ACTIVE|VOIDED` + `voidedAt/voidedBy/voidReason`**
**มติที่ตอบ**: SSOT ข้อ 6 "approval record immutable void-only" — รูปแบบเป็นเรื่องวิศวกรรม ไม่ใช่นโยบาย
ตัด soft-delete ทิ้งเพราะ semantics ผิด (soft-delete ถูก auto-filter ออกจาก read ทั้งหมด = "หายไป" ไม่ใช่ "เป็นโมฆะแต่ยังเห็นได้พร้อมเหตุผล")
**apply**: บังคับ "ไม่มี update path" ที่ชั้น service + test pin (DB-level ทำไม่ได้วันนี้ — RLS ในรีโปเป็น observe-only)

### D-12 → เลขคำขอ **reuse `ensureApplicationNumber()`**
**มติที่ตอบ**: Law 3.6 (SSOT) + ratchet `dup-source` — มี generator 4 รูปแบบขนานอยู่แล้ว การเพิ่มรูปแบบที่ 5 จะดัน counter ขึ้น = CI fail
**apply**: `apps/backend/routes/api/helpers/application-constants.js:259-264` ไม่สร้าง prefix ใหม่

### D-13 → flag คุม **route (fail-closed 503)** · FE อ่านสถานะจาก API · cross-org = **same-org เท่านั้น**
**มติที่ตอบ**: SSOT ข้อ 8 "default OFF" + idiom ของรีโป (`apps/backend/routes/api/finance/payments.js:409-417`)
**apply 3 ข้อ**: (1) flag คุม route ไม่คุม read-side (2) **ไม่มี** `NEXT_PUBLIC_REOPEN_ENABLED` — FE อ่านจาก API response เพราะ FE flag ถูก bake ตอน build (`apps/web-app/Dockerfile:41-42`) การ flip จะต้อง rebuild image ซึ่งขัดเจตนา "flag ที่ปิด/เปิดได้" (3) cross-org reopen = ไม่ได้ (fail closed) เพราะ SSOT ข้อ 7 บอก Admin ซึ่ง tenant-scoped ตาม SEC-PROV-001

## ⛔ LEGAL — รอหนังสือหารือนิติกรกรมฯ (parked โดย operator เอง ไม่ใช่คำถามใหม่)

### D-2 — R2 อยู่ร่วมกับ waiver-reopen อย่างไร (ธง L4)
`QUEUE.md:22` บันทึกไว้แล้ว: *"Waiver-coexist + นิยาม role เจ้าหน้าที่: ค้าง รอหนังสือหารือนิติกรกรมฯ — **ห้าม assume ใน implementation ใด ๆ**"*

### D-9 — carry-over ชนกับ NOT NULL (ธง L3) — **ข้อนี้บล็อก S2 ทั้งก้อน ไม่ใช่บางส่วน**
SSOT ข้อ 5 parked ไว้แล้ว แต่ผลกระทบแรงกว่าที่เคยรายงาน: `Application` บังคับ `healthId`(FK) `:12-13` · `areaType` `:35` · `organizationId`(FK) `:189-190` · `applicationNumber` unique `:9` → **สร้าง row ใหม่ไม่ได้เลยถ้าไม่ carry 4 ค่านี้** ⇒ S2 เขียนไม่ได้จนกว่า L3 จะกลับ

**ทางลัดที่ไม่ preempt นิติกร (เสนอให้ operator ตัดสินได้เลยถ้าเห็นด้วย)**: แยก "คอลัมน์ระบุตัวตนของคำขอ" (`healthId`, `organizationId`, `areaType`, `applicationNumber`) ออกจาก "เนื้อหาคำขอ" (`formData`, เอกสารแนบ) — อนุญาต carry เฉพาะกลุ่มแรกเพื่อให้ row เกิดได้ ส่วนกลุ่มที่สองยังห้ามตามเดิมรอนิติกร
เหตุผล: นิติกรกำลังตอบเรื่อง**เนื้อหาคำขอ**ว่า reuse ได้ไหม ไม่ใช่เรื่องว่าคำขอต้องมีเจ้าของหรือไม่ — เคสใหม่ที่ไม่มี `healthId` คือ row ที่ไม่มีเจ้าของ ซึ่งไม่ใช่ทางเลือกทางเทคนิคอยู่แล้ว
ถ้า operator รับทางนี้ **D-9 ปลดล็อกทันทีโดยไม่ต้องรอหนังสือ** และ S2 เดินได้

## ❓ OPEN — ยังไม่เคยตัดสินจริง ๆ

### D-1 — เคสใหม่จ่ายค่าธรรมเนียมใหม่หรือ reuse ของเดิม **[เงิน]**
ไม่มีมติข้อไหนแตะเรื่องนี้ และ **ไม่ตัดสิน = ตัดสินโดยปริยายว่าเก็บใหม่เต็ม** 5,535 + 27,675 (`apps/backend/prisma/schema/application.prisma:65,80`)
Law 3.4 ห้าม agent ตัดสินเรื่องเงิน → **ผมไม่เสนอทางเลือกในข้อนี้** มีให้เทียบแค่ข้อเท็จจริง: waiver-reopen ที่มีอยู่เลือกทาง **reuse ค่าธรรมเนียมเดิม ไม่ออกใบแจ้งหนี้ใหม่** (`apps/backend/prisma/schema/waiver.prisma:5-7`, `apps/backend/services/waiver-reopen-service.js:98-121`)

### D-11 — ไฟล์แนบหนังสืออนุมัติ — แยกเป็น 2 คำถาม
**(ก) ข้อกำหนดไฟล์ — ผมเสนอ default ได้ ถ้า operator ไม่มีข้อกำหนดเฉพาะ**: บังคับแนบ 1 ไฟล์ · jpg/png/pdf · 5MB ตาม precedent ของ payment slip (`apps/backend/routes/api/finance/payment-slips.js:61-63`) — สั่งเปลี่ยนได้
**(ข) ต้องตัดสิน — ชนกันเองระหว่างสองหลักการที่บันทึกไว้แล้ว**: `Attachment` **ไม่มี `retainUntil`/`legalHold`** และ `detachAllByUploader()` (สิทธิ์ลบตาม PDPA, `apps/backend/services/attachment-service.js:219-241`) จะ soft-delete ไฟล์แนบของ approval ด้วย ถ้าเจ้าหน้าที่คนที่อัปโหลดถูก PDPA-delete
→ **"approval record immutable" (SSOT ข้อ 6) ปะทะ "สิทธิ์ลบข้อมูลตาม PDPA"** — ต้องมีคำตัดสินว่าหนังสืออนุมัติของราชการเข้าข่าย legal-hold หรือไม่

---

# AUTH-01 — E-1..E-8

## ✅ APPLIED

### E-1 → `password String?` (EXPAND ให้ nullable) ไม่ใช้ sentinel
**มติที่ตอบ**: SSOT AUTH-01 ข้อ 2 "Health ID auto-provision เกษตรกรได้" — เป็นไปไม่ได้เลยถ้า `password` ยัง NOT NULL (`apps/backend/prisma/schema/auth.prisma:17`) + SSOT ข้อ 6 "identity model EXPAND ได้"
เลือก nullable เพราะ: การผ่อน NOT NULL คือทิศทาง expand มาตรฐาน (แถวเดิมไม่กระทบ) · sentinel เป็น hardcode (Law 3.5) และทำให้ "ไม่มี password" กับ "ถูก PDPA anonymize" (`apps/backend/controllers/auth-controller/auth-session-security-handlers.js:680`) แยกกันไม่ออก
**งานที่ตามมาบังคับ (ไม่ใช่คำถาม)**: 4 จุดที่เรียก `bcrypt.compare(x, user.password)` ต้อง fail-closed อย่างชัดเจนเมื่อ password เป็น null พร้อม RED test — `apps/backend/services/prisma-auth-service.js:372` · `apps/backend/routes/api/auth/auth-provider.js:148` · `apps/backend/services/pdpa-service.js:297` · `apps/backend/services/auth/password-management.js:36`

### E-2 → "Health ID" = **model เดิม** (`User` + คอลัมน์ `healthId`) IdP เป็นแค่ provider
**มติที่ตอบ**: `evidence/AUTH-01/mandate.md:51` เขียนเองว่า *"ผูก/สร้างบัญชีเกษตรกร (**Health ID model เดิม**) โดย match CID"* → ไม่สร้าง model ใหม่ สิ่งที่ต้องเพิ่มคือ field เก็บ external subject ซึ่ง SSOT ข้อ 6 อนุญาต EXPAND แล้ว

### E-3 → **ไม่แตะ guard identity-conflict ใน AUTH-01**
**มติที่ตอบ**: SSOT ข้อ 4 "ThaID ทำเผื่อ **coming_soon**" + ข้อ 5 "ทุก external provider default coming_soon" → การ map CID สองฝั่งตาม `mandate.md:53` ยังไม่ต้องทำงานจริงในรอบนี้
**apply**: สร้าง adapter + linking logic ไว้ แต่ **ห้ามผ่อน guard** ที่ `apps/backend/services/prisma-auth-service.js:336-338` และ `apps/backend/routes/api/auth/auth-provider.js:96-103` (เป็น security control ที่ทำงานอยู่) → คำถาม "คนเดียวสองบทบาท" เลื่อนไปตอน ThaID จะ enabled จริง = ไม่บล็อก AUTH-01

### E-6 → forgot/reset/change-password **ผูกกับสถานะของ provider `local`**
**มติที่ตอบ**: SSOT ข้อ 1 "local login = TRANSITIONAL **provider**" + `mandate.md:32` test pin state (ii) "local disabled + external enabled" — ถ้า local ปิดแล้วแต่ยัง reset password ได้ สถานะ disabled ก็ไม่มีความหมาย
**apply 2 ข้อ**: (1) เมื่อ `local` ไม่ `enabled` → ปิด `POST /reset-password`, `/reset-password/:token`, `/change-password` ทั้งชุด (2) ขณะ local ยัง enabled → ปฏิเสธ reset สำหรับบัญชีที่มี external subject (ทำได้เพราะ E-1/SSOT ข้อ 6 เพิ่ม field นั้นแล้ว) ปิดช่องอ้อมรอบ IdP ที่ `apps/backend/services/auth/password-management.js:73-125, 154-168`

### E-7 → **โค้ดคือ SSOT ของ route path** เอกสาร architecture เน่า
**มติที่ตอบ**: `mandate.md:68` ระบุเกณฑ์เอง — "route path + session path **ที่ระบบอื่นอ้างถึง** ห้ามเปลี่ยน" ⇒ เกณฑ์คือผู้อ้างอิงจริง (โค้ด FE, e2e, mobile) ไม่ใช่เอกสาร
**apply**: pin `/auth/health/login` + `/auth/provider/login` ตาม `apps/web-app/src/lib/constants/auth-routes.ts:1-2`; `docs/architecture/2026-05-04-canonical-auth-session-rbac-contract.md:99-105` (ที่เขียน `/auth/health-login` และ `/auth/thaid/callback` ซึ่งไม่มีจริง) → **backlog แก้เอกสาร ไม่ใช่แก้โค้ด**

### E-8 → "ห้าม auto-provision Provider ID" = **เฉพาะเส้นทาง OAuth**
**มติที่ตอบ**: SSOT ข้อ 3 อยู่ในบริบท §D4 ซึ่งเป็นหัวข้อ account linking ของ OAuth + `mandate.md:73` ระบุ out of scope = "role/permission logic เดิม"
**apply**: test ของ auditor check #4 ต้องผูกกับ OAuth path เท่านั้น ไม่ครอบ `apps/backend/services/provider-user-service.js:125-153` (admin API) และ `apps/backend/routes/api/system/provider.js:548` ซึ่งเป็นการสร้างโดยมนุษย์ที่มีอยู่ก่อน

## 📄 รอเอกสาร (ไม่ใช่รอนิติกร)

### E-5 — re-auth ของ external session สำหรับ PDPA ม.33
`mandate.md:22` §B บังคับ "ค่าที่เอกสารไม่ระบุ = ห้ามเดา" — การ re-auth ผ่าน IdP ต้องรู้ว่าคู่มือรองรับ prompt/re-authentication parameter หรือไม่
สถานะปัจจุบัน: external user **ใช้สิทธิ์ ม.33 ไม่ได้เลย** เพราะ `apps/backend/services/pdpa-service.js:262-268, 297-302` บังคับ password
→ ปลดล็อกได้ทันทีที่อ่านคู่มือจบ ไม่ต้องรอหนังสือราชการ

## ❓ OPEN — ยังไม่เคยตัดสินจริง ๆ

### E-4 — §D3 "ห้าม localStorage/sessionStorage ทุกกรณี" ปะทะ "ตาม session mechanism เดิม"
`mandate.md:48` เขียนสองอย่างที่ขัดกันในประโยคเดียว และ mechanism เดิม**คือ localStorage-primary จริง** (`apps/web-app/src/lib/services/auth-service-session.ts:37-46, 61-66, 81-83`)
นี่ไม่ใช่คำถามเทคนิค แต่เป็น **คำถาม scope**:

| ทางเลือก | ผล |
|---|---|
| (ก) OAuth session = cookie-only **และแก้ FE session layer ให้ cookie-first อยู่ใน AUTH-01** | ตรงตัวอักษร §D3 แต่ scope โตขึ้นมาก — `AuthService.isAuthenticated()` (`apps/web-app/src/lib/services/auth-service.ts:316-329`) อ่าน localStorage อยู่ ถ้าไม่แก้ external user จะถูกมองว่าไม่ล็อกอิน; กระทบ mobile ที่แนบ Bearer จาก token ที่เก็บไว้ |
| (ข) OAuth session = cookie-only **แต่แก้ FE session layer เป็นงานถัดไป** | AUTH-01 จบเร็ว แต่ระหว่างนั้น external login จะยังใช้จริงไม่ได้เต็ม |
| (ค) ยอมให้ external session ใช้ localStorage เหมือนเดิมชั่วคราว | ขัด §D3 ตรง ๆ — ต้องเป็นคำสั่ง operator ชัดเจน ผมจะไม่เลือกเอง |

**[ANSWERED 2026-08-03 — operator, verbatim]**: *"เลือกทางที่เข้มสุด — token/secret/PII ห้ามแตะ browser storage ทุกกรณี, session = httpOnly cookie เท่านั้น, ยกเว้นได้เฉพาะ UI state ล้วน (ภาษา, layout)"*
→ **เข้มกว่าทุกทางเลือก**: ครอบ**ทุก session ทุก provider** (รวม local เดิม) ไม่ใช่แค่ OAuth — ต่างจาก (ก) ที่จำกัด OAuth + "cookie-first" (ยังเผื่อ fallback ได้) ขณะที่คำตัดสินคือ **cookie-only + ห้ามทุกกรณี** → บันทึกตามถ้อยคำจริง ไม่ map เข้า (ก); สามทางเลือกถูก paste กลับให้ operator ตามที่สั่งแล้ว (2026-08-03)
→ ผลต่อ scope: งานถอน `localStorage` ออกจาก FE session layer ทั้งชั้น (`apps/web-app/src/lib/services/auth-service-session.ts:37-46, 61-66, 81-83` + ผู้อ่านทุกจุด เช่น `auth-service.ts:316-329`) **เข้ามาอยู่ใน AUTH-01** — จัดเป็น sub-task P3 ใน `evidence/AUTH-01/plan.md`; ที่อนุญาตเหลือเฉพาะ UI state ล้วน (ภาษา/layout — ไม่มี token/PII)

---

## บันทึกกระบวนการ
- **R2 ไม่เคยมีไฟล์ mandate ในรีโป** (ต่างจาก AUTH-01) — คำสั่ง R2 อยู่ในบทสนทนาอย่างเดียว ทำให้ 1 ข้อที่ apply (D-7) อ้างอิงบรรทัดที่ยังไม่ persist → สร้าง `evidence/R2-special-reopen/mandate-ssot.md` ปิดช่องว่างนี้แล้ว **ขอ operator ยืนยันคำอ้างในไฟล์นั้น**
- ทุกข้อที่ขึ้น APPLIED มาจาก **มติที่มีอยู่แล้ว + doctrine ในโค้ด** ไม่ใช่การเลือกของ orchestrator; ข้อที่เป็นการเลือกเชิงวิศวกรรม (D-10 รูปแบบ void, D-11(ก) ข้อกำหนดไฟล์, D-12 generator, D-13 รูปแบบ flag) เขียนเหตุผลกำกับไว้ทุกข้อและสั่งกลับได้
