# AUTH-01 §A0 — ธง BLOCKER + ใบตัดสินใจที่ค้าง (operator เท่านั้น)
> ที่มา: `evidence/AUTH-01/A0-authen-readiness-audit.md` (spec-reader, fresh context)
> กติกาที่บังคับให้หยุด: mandate §A0 บรรทัด 15 — *"ถ้าเจอ blocker ที่ทำให้ external authen เดินไม่ได้ = **ธง รายงานก่อน** (STOP)"*
> orchestrator เปิดไฟล์ยืนยันเองทุกข้อในหน้านี้แล้ว (Law 3.9) — ไม่ได้รับ report ของ agent เป็น ground truth

---

## สรุป: external authen **เดินไม่ได้วันนี้** — ติด 3 จุดที่แตะ identity ทั้งหมด

### ⛔ BLOCKER-1 · `User.password` เป็น NOT NULL
`apps/backend/prisma/schema/auth.prisma:17` → `password String` (ไม่มี `?` ไม่มี `@default`)
**orchestrator ยืนยันเอง: ตรง**

ผลตรง ๆ: §D4 (`mandate.md:51`) สั่งให้ Health ID first-login **สร้างบัญชีได้** — แต่ `prisma.user.create` ทุกครั้งต้องส่ง password → **สร้าง OAuth user ไม่ได้เลย**

| ทางเลือก | ราคา |
|---|---|
| (ก) EXPAND `password String?` | ต้องไล่ทุกจุดที่ `bcrypt.compare(x, user.password)` จะได้ `undefined` — พบ 4 จุด: `apps/backend/services/prisma-auth-service.js:372`, `apps/backend/routes/api/auth/auth-provider.js:148`, `apps/backend/services/pdpa-service.js:297`, `apps/backend/services/auth/password-management.js:36` (มีแค่ `apps/backend/controllers/auth-controller/auth-session-security-handlers.js:652` ที่กัน `\|\| ''` ไว้แล้ว) |
| (ข) sentinel ค่าคงที่ | ไม่แตะ schema แต่แยก "ไม่มี password" ออกจาก "ถูก PDPA anonymize" ไม่ได้ (idiom เดิมใช้ sentinel เพื่อ**ปิด** login ที่ `auth-session-security-handlers.js:680`) + เป็น hardcode ที่ต้องเข้า constants ตาม Law 3.5 |

### ⛔ BLOCKER-2 · ไม่มีที่เก็บ external subject เลยทั้งสคีมา
grep field ชื่อ `sub`/`iss`/`externalId`/`subject` ใน `apps/backend/prisma/schema/` = **0 hit**
**orchestrator ยืนยันเอง: ตรง (grep คืนค่าว่าง)**

ทางเดียวที่ link บัญชีได้วันนี้คือ **match CID** แล้ว hash ลงคอลัมน์เดิม (`auth.prisma:33,38`)
→ **ถ้าคู่มือ Health ID (สธ.) / ThaID คืน pseudonymous `sub` แทน CID จะ link ไม่ได้เลย**
ข้อนี้ยัง**พิสูจน์ไม่ได้** เพราะยังไม่ได้อ่านคู่มือ และ §B (`mandate.md:22`) ห้ามเดา → เป็นเหตุผลอิสระอีกข้อที่ต้องได้คู่มือก่อน implement

### ⛔ BLOCKER-3 · คนเดียวเป็นทั้งเกษตรกรและเจ้าหน้าที่ไม่ได้ แต่ §D4 สั่งให้ ThaID map ทั้งสองฝั่ง
`mandate.md:53` — "map CID เข้า identity ทั้งสองฝั่งตามการ์ดที่กดเข้า"
โค้ดห้ามไว้ชัด **orchestrator เปิดดูเองทั้ง 3 จุด: ตรง**
- `apps/backend/services/prisma-auth-service.js:336-338` — `if (user.healthId && user.providerId) throw 'Identity conflict'`
- `apps/backend/routes/api/auth/auth-provider.js:96-103` — 409 `IDENTITY_CONFLICT`
- `apps/backend/services/auth/password-management.js:33-34, 85-86` — throw เดียวกัน

และ register เขียน `idCardHash` = sha256(CID) **ทั้งสอง authType** (`prisma-auth-service.js:155-159, 225`) ลงคอลัมน์ `idCardHash String? @unique` (`auth.prisma:62`) → สอง row ของคนเดียวชนกันที่ unique
*หมายเหตุที่ orchestrator เพิ่มเอง: คอลัมน์นี้อยู่ใต้หัวข้อ "LEGACY FIELDS (Marked for Deprecation)" (`auth.prisma:60`) และเป็น nullable — การชนจึงเกิดเพราะ register **ยังเขียนมันอยู่** ไม่ใช่เพราะ schema บังคับ*

---

## ใบตัดสินใจ (ต้องตอบก่อนเข้า PLAN)

### E-1 · [identity] `password` — EXPAND nullable หรือ sentinel (BLOCKER-1)
ดูตารางราคาข้างบน **ไม่มีข้อเสนอจาก orchestrator** — เป็นการเปลี่ยนสัญญาของ identity model

### E-2 · [identity] "Health ID" ในโจทย์ หมายถึงอะไร (A-3 ในรายงาน)
ในเรโป `User.healthId` = **เลขบัตรประชาชน 13 หลัก plaintext** ของบัญชีเกษตรกร (`auth.prisma:32`, header `apps/backend/routes/api/auth/auth-health.js:2-3`)
ใน mandate "Health ID (สธ.)" = **IdP ของสำนักสุขภาพดิจิทัล** (`mandate.md:19`)
→ §D4 เขียนว่า "ผูก/สร้างบัญชีเกษตรกร (Health ID model เดิม) โดย match CID" อ่านได้ 2 ทาง: ใช้คอลัมน์เดิมเป็น key หรือสร้าง model ใหม่ **ผลต่างคือ EXPAND กี่ตาราง และ FK ชนหรือไม่**

### E-3 · [identity + สิทธิ์] คนเดียวสองบทบาท — อนุญาตหรือไม่ (BLOCKER-3)
| ทางเลือก | ผล |
|---|---|
| (ก) ห้ามต่อ | ThaID card เจ้าหน้าที่กับ card ประชาชนต้องเป็นคนละคนเสมอ — ขัด §D4 ตามตัวอักษร |
| (ข) อนุญาตสองแถว | ต้องแก้ lookup ที่ไม่ deterministic ก่อน (`prisma-auth-service.js:311-330` — `findFirst` ไม่มี `orderBy` บน `OR` ที่รวม `idCardHash`) |
| (ค) หนึ่งแถวหลาย role | รื้อ portal separation ซึ่งเป็น security control ที่ทำงานอยู่ (`apps/backend/middleware/auth-middleware.js:629-637`, `prisma-auth-service.js:345-357`) |

### E-4 · [identity + สิทธิ์] §D3 "ห้าม localStorage/sessionStorage ทุกกรณี" ปะทะ "ตาม session mechanism เดิม"
`mandate.md:48` เขียนสองอย่างในประโยคเดียวกัน — แต่ **mechanism เดิมคือ localStorage-primary จริง**
**orchestrator เปิดดูเอง: ตรง** — `apps/web-app/src/lib/services/auth-service-session.ts:37-46` (`localStorage.setItem`) และ `:61-66` (access token), `:81-83` (user object); cookie ถูกตั้งทีหลังโดย client POST ไป `apps/web-app/src/app/api/session/set-cookie/route.ts`
ถ้าเลือก cookie-only สำหรับ external: `AuthService.isAuthenticated()` (`apps/web-app/src/lib/services/auth-service.ts:316-329`) อ่าน localStorage → **external user จะถูกมองว่าไม่ล็อกอินที่ฝั่ง FE ทั้งที่ cookie ใช้ได้** = ต้องแก้ session layer ทั้งชั้น (และกระทบ mobile ที่แนบ Bearer)

### E-5 · [สิทธิ์ตามกฎหมาย] re-auth ของ external session คืออะไร
PDPA ม.33 (ลบบัญชี) บังคับ password วันนี้ (`apps/backend/services/pdpa-service.js:262-268, 297-302`, mount `auth-health.js:220-227`)
→ **external user ใช้สิทธิ์ตามกฎหมายไม่ได้** ถ้าไม่กำหนด factor ทดแทน (ยิง OAuth ซ้ำ ต้องมี citation จากคู่มือ / ใช้ MFA ที่มีอยู่ / ไม่ re-auth เลย)

### E-6 · [identity + สิทธิ์] forgot-password เป็นทางอ้อมรอบ IdP
`apps/backend/services/auth/password-management.js:73-125` หา user ด้วย email/phone แล้ว `:132-179` เขียน `password` ใหม่ **โดยไม่ตรวจว่าบัญชีนั้นเป็น external**
**orchestrator เปิดดูเอง: ตรง** — `prisma.user.update({ data: { password: hashedPassword, ... } })` ไม่มีเงื่อนไข provider
→ ทำให้ test pin state (ii) ของ §C4 ("local disabled + external enabled") ไม่มีความหมาย ถ้ายังเปิดเส้นนี้ไว้

### E-7 · SSOT ของ route path — เอกสารขัดโค้ด (ผูกกับ §F0.3 "ห้ามเปลี่ยน path")
`docs/architecture/2026-05-04-canonical-auth-session-rbac-contract.md:99-105` ประกาศ canonical = `/auth/health-login`, `/auth/provider-login`, `/auth/thaid/callback`
โค้ดจริง = `/auth/health/login`, `/auth/provider/login` (`apps/web-app/src/lib/constants/auth-routes.ts:1-2`) และ `/auth/thaid/callback` **ไม่มีอยู่จริง**
→ ต้องตัดสินว่าอันไหนคือ SSOT **ก่อน** pin test ตาม §F0.3 ไม่งั้น pin ผิดฝั่ง

### E-8 · ขอบเขต auditor check #4 "Provider ID ไม่มี path auto-provision"
`mandate.md:52` ห้ามใน OAuth path แต่ `mandate.md:82` อ่านได้ว่าครอบทั้งเรโป — ปัจจุบันมี path สร้าง provider อยู่ 2 ที่ที่**ไม่เกี่ยวกับ OAuth**: `apps/backend/services/provider-user-service.js:125-153` (admin API) และ `apps/backend/routes/api/system/provider.js:548`
ถ้าตีความกว้าง test จะแดงที่ของเดิม → ต้องระบุขอบเขต

---

## สิ่งที่ต้องได้จาก operator นอกเหนือจากคำตอบ (ผูกกับ §B MANUAL-FIRST)
**คู่มือ Health ID (สธ.) / Provider ID / ThaID ฉบับจริง** — §B (`mandate.md:18-22`) บังคับว่าทุก endpoint/scope/รูปแบบ profile ต้องมี citation และ **"ค่าที่เอกสารไม่ระบุ = ห้ามเดา"**
ยังไม่มีไฟล์ในเรโป และ BLOCKER-2 ขึ้นกับคำตอบเดียว: **profile response คืน CID จริงหรือคืน pseudonymous sub**

---

## สิ่งที่ §A0 ยืนยันว่า **ไม่ใช่** blocker (ข่าวดี)
- **ไม่มีคอลัมน์ `username`** ที่ NOT NULL — grep `username` ใน `apps/backend/prisma/schema/` = 0 → login key เป็นเลข 13 หลักผ่านคอลัมน์ hash/hmac
- **middleware auth ทั้ง 6 ตัวไม่อ่าน password ตอน request** — เป็น JWT-based ล้วน (`apps/backend/middleware/auth-middleware.js:423, 566, 716, 763, 931, 984`)
- **มี seam ที่ตั้งใจไว้ให้ flow แบบนี้อยู่แล้ว**: `issueTokensForAuthenticatedUser(user, options)` `apps/backend/services/prisma-auth-service.js:475-522` — docblock `:454-468` เขียนเองว่า *"any future flow that has already proven identity by other means"*
- **เพิ่ม claim `authProvider` ลง JWT ได้โดยไม่แตะ verify** (`apps/backend/config/jwt-security.js:198-201`)
- **บันทึก provider + CID hash ลง audit ได้โดยไม่ต้อง migrate** ผ่าน `metadata Json?` (`apps/backend/prisma/schema/audit.prisma:36`) ซึ่งอยู่ใน hash chain แล้ว

## หนี้ที่ §A0 เจอระหว่างทาง (กอง c — backlog ไม่บล็อก AUTH-01)
- **provider login ไม่มี audit log เลย** — grep `auditLogger|logAuth|LOGIN_SUCCESS|LOGIN_FAILURE` ใน `apps/backend/routes/api/auth/auth-provider.js` = **0 hit** (**orchestrator ยืนยันเอง**) ขณะที่ฝั่ง health มีครบ (`apps/backend/controllers/auth-controller/health-auth-profile-handlers.js:230-238, 264-275`) → **แต่ §D4 บังคับ audit ทุก login** จึงถูกจัดเป็นกอง (a) แก้ใน AUTH-01
- สองจุดมิ้นต์ token drift กันแล้ว: seam `prisma-auth-service.js:475-522` vs inline `auth-provider.js:227-252` (ไม่มี refresh token, ไม่มี `sessionFamilyId`)
- `deleteMe` (`auth-session-security-handlers.js:612-659`) เป็น implementation คู่ขนานที่ไม่ได้ mount — dup-source ของ PDPA erasure (Law 3.6)
- `createProviderUser` (`provider-user-service.js:125-153`) ไม่เขียน `idCardHash` ต่างจาก `register` (`prisma-auth-service.js:225`)
- `sessionsRevokedAt` ถูก stamp เฉพาะตอนเปลี่ยน/รีเซ็ต password (`password-management.js:55, 167`) → external session ไม่มี lever เพิกถอนทั้งชุด
- เอกสารเน่า: `THAID_CLIENT_SECRET`/`THAID_STATE_SECRET` อยู่ใน `docs/security/secrets-catalog-2026-05-16.md:53,66` แต่ไม่มีใน `apps/backend/config/secrets.js`

## จุดที่ preflight-notes ของ orchestrator เองผิด — แก้บันทึกไว้
`evidence/AUTH-01/preflight-notes.md:47` เขียนว่า `_components/provider-login-page.tsx` "มีการอ้าง thaid/health.id/provider.id อยู่แล้ว" — §A0 เปิดอ่านทั้งไฟล์ 263 บรรทัดแล้ว **ไม่มี** และ grep ทั้ง `apps/web-app/src` = 0 hit ที่เกี่ยวข้อง
→ **surface OAuth ฝั่ง FE = ศูนย์** ไม่ใช่ "มีอยู่แล้วบางส่วน" ตามที่ preflight เข้าใจ
