# AUTH-01 §A0 — AUTHEN-READINESS AUDIT (read-only)

Branch (จาก `.git/HEAD:1`): `refs/heads/feat/special-reopen`. ไม่มี Bash — ทุกข้อมาจากการเปิดอ่านไฟล์จริงด้วย Read/Grep เท่านั้น

---

# ธง BLOCKER — external authen เดินไม่ได้จนกว่าจะมีคำตัดสิน

### BLOCKER-1 — `User.password` เป็น NOT NULL ไม่มี default
`apps/backend/prisma/schema/auth.prisma:17` → `password String`

ไม่มี `?` ไม่มี `@default`. ทุก `prisma.user.create` ต้องส่ง password. Health ID first-login auto-provision ตาม §D4 (`mandate.md:51`) จึงสร้าง row ไม่ได้เลยโดยไม่แก้ schema หรือไม่ตัดสินใจใส่ค่า sentinel. มี idiom sentinel อยู่แล้วในเรโป (`apps/backend/controllers/auth-controller/auth-session-security-handlers.js:680` → `password: 'PDPA_ANONYMIZED'` พร้อมคอมเมนต์ที่ :603 ว่า "a non-bcrypt sentinel value so no future login can succeed") แต่นั่นคือ sentinel เพื่อ**ปิด** login ไม่ใช่เพื่อ**เปิด** external login — เป็นคนละเจตนา **ต้องให้ operator ตัดสิน** (EXPAND nullable vs sentinel) ก่อน implement — แตะ identity

### BLOCKER-2 — ไม่มีที่เก็บ external subject เลยทั้งสคีมา
เปิด `^model` ทุกไฟล์ใน `apps/backend/prisma/schema/` = 100 models; domain auth มีแค่ `User` (`auth.prisma:3`) และ `UserConsent` (`auth.prisma:261`). **ไม่มี** field `sub`/`iss`/`externalId`, **ไม่มี** ตาราง identity-link, **ไม่มี** โครง "หนึ่ง user หลาย IdP"

ผลตรง ๆ: ทางเดียวที่ link ได้วันนี้คือ match **CID** แล้ว hash เข้าคอลัมน์เดิม (`healthIdHash`/`healthIdHmac`, `auth.prisma:33,38`). ถ้าคู่มือ Health ID (สธ.) / ThaID คืน **pseudonymous `sub` แทน CID** → link ไม่ได้เลยด้วยโครงปัจจุบัน และ §B ห้ามเดา (`mandate.md:22`) ส่วนคู่มือยังไม่ได้อ่าน → **ความเสี่ยงนี้ยังพิสูจน์ไม่ได้ ณ ตอนนี้** — แตะ identity

### BLOCKER-3 — คนเดียวเป็นทั้งเกษตรกรและเจ้าหน้าที่ไม่ได้ แต่ §D4 สั่งให้ ThaID map CID เข้าทั้งสองฝั่ง
`mandate.md:53` — "map CID เข้า identity ทั้งสองฝั่งตามการ์ดที่กดเข้า"

โค้ดปัจจุบันห้ามชัดเจน 3 จุด:
- `apps/backend/services/prisma-auth-service.js:336-338` — `if (user.healthId && user.providerId) throw 'Identity conflict'` (ใน login)
- `apps/backend/routes/api/auth/auth-provider.js:96-103` — provider ที่มี `healthId` = 409 `IDENTITY_CONFLICT`
- `apps/backend/services/auth/password-management.js:33-34, 85-86` — throw เดียวกันใน changePassword/requestPasswordReset

และ register เขียน `idCardHash` (`@unique`, `auth.prisma:62`) = sha256(CID) **ทั้งสองเส้นทาง** (`prisma-auth-service.js:155-159, 225`) → สอง row ของคนเดียวชนกันที่ `idCardHash` — แตะ identity + สิทธิ์

---

# 1. CONFIRMED

## (a) code path ที่ผูกตายกับ local credential

| # | จุด | file:line | พังยังไง |
|---|---|---|---|
| a1 | PDPA S33 ลบบัญชี — บังคับ password | `apps/backend/services/pdpa-service.js:262-268` (`if (!password) throw PDPA_PASSWORD_REQUIRED`), `:297-302` (`bcrypt.compare(password, user.password)`) mounted ที่ `apps/backend/routes/api/auth/auth-health.js:220-227` | external user ไม่มี password → **ใช้สิทธิ์ตามกฎหมาย PDPA ม.33 ไม่ได้เลย** |
| a2 | PDPA export ไม่บังคับ password (ตรงข้าม a1) | `auth-health.js:191-218` | ปกติ — ไม่ใช่ blocker แต่ทำให้ policy re-auth ไม่สม่ำเสมอ |
| a3 | erasure ตัวที่สอง (ไม่ได้ mount) | `auth-session-security-handlers.js:612-659` — `PASSWORD_CONFIRMATION_REQUIRED` ที่ :623-629 + `bcrypt.compare(password, user.password \|\| '')` ที่ :652 | grep `deleteMe`/`me/delete` ใน `apps/backend/routes/` = พบเฉพาะ `auth-health.js:220` ที่เรียก `pdpaService.softDeleteUser` → **ตัวนี้เป็น dead/parallel implementation** = dup-source ของ logic เดียวกัน (แตะ §3.6) |
| a4 | change-password บังคับ oldPassword | `apps/backend/services/auth/password-management.js:27-39` (`bcrypt.compare(oldPassword, user.password)` ที่ :36); route `auth-health.js:178`; schema `apps/backend/shared/schemas/auth-schemas.js:122-125` | external user ไม่มี oldPassword → endpoint ใช้ไม่ได้ |
| a5 | **forgot/reset-password ตั้ง password ให้บัญชีใดก็ได้ที่มี email/phone** | `password-management.js:73-125` (ค้นด้วย `{email}` OR `{phoneNumber}` ที่ :74-81), `:132-179` (`resetPasswordWithToken` เขียน `password: hashedPassword` ที่ :158 โดย**ไม่ตรวจว่าบัญชีนี้เป็น external หรือไม่**); routes `auth-health.js:116, 119-127`; ลิงก์ FE `apps/web-app/src/app/auth/_components/health-login-page.tsx:287` → `/forgot-password` | บัญชีที่สร้างจาก Health ID OAuth (มี email จาก profile) จะถูก "ตั้งรหัสผ่าน" ผ่านเส้นนี้ → **เป็นทางอ้อมรอบ IdP ขณะ local login ยัง `enabled`** |
| a6 | register บังคับ password 3 ชั้น | schema `auth-schemas.js:97-118` (`password: passwordField` ที่ :101), service gate `prisma-auth-service.js:604-611` (`body?.password &&…`), hash `prisma-auth-service.js:194` + write `:238` | เส้นทางสร้างบัญชีเดียวที่มีอยู่ ใช้กับ OAuth first-login (§D4) ไม่ได้ |
| a7 | provider login ผูก bcrypt ตรง ๆ ในไฟล์ route | `apps/backend/routes/api/auth/auth-provider.js:148` — `bcrypt.compare(password, providerUser.password)` (ทั้ง handler อยู่ inline :34-291) | ไม่มี seam ให้เสียบ provider อื่น ต้องเขียน path ใหม่ |
| a8 | health login ผูก password เป็น positional arg | `prisma-auth-service.js:260` `async login(loginId, password, accountType, options)` → `bcrypt.compare` ที่ `:372` | signature ไม่ provider-agnostic |
| a9 | `sessionsRevokedAt` (session epoch) ถูก stamp เฉพาะตอนเปลี่ยน/รีเซ็ต password | นิยาม `auth.prisma:142-149`; เขียนที่ `password-management.js:55` และ `:167`; บังคับใช้ที่ `apps/backend/middleware/auth-middleware.js:221-228, 496-503, 644-651, 890-897` และ `auth-provider.js:425-432` | external session ไม่มีเหตุการณ์ที่ stamp epoch → **ไม่มี lever เพิกถอน session ทั้งชุด** ที่เทียบเท่า |

**ข่าวดีที่ยืนยันแล้ว:** grep `username` ใน `apps/backend/prisma/schema/` (ทั้งโฟลเดอร์) = **0 matches** → ไม่มีคอลัมน์ username ที่ NOT NULL, login key คือเลข 13 หลักผ่าน `*Hash`/`*Hmac` (`prisma-auth-service.js:304-317`, `auth-provider.js:71-75`) → **ข้อ "username เป็น key" ไม่เป็น blocker**

## (b) Identity model

**ความหมายจริงของแต่ละ field (ยืนยันจากคอมเมนต์ + จุดใช้):**

| field | คือ | หลักฐาน |
|---|---|---|
| `healthId` (`auth.prisma:32`) | **เลขบัตรประชาชนไทย 13 หลัก plaintext** ของบัญชีเกษตรกร — ไม่ใช่บัญชี Health ID ของ สธ. | header `auth-health.js:2-3` "Uses Health ID (13-digit Thai ID)"; คอมเมนต์ `auth.prisma:23-31` "CANONICAL IDENTITY … the national ID"; swagger `auth-health.js:43,85-87` |
| `providerId` (`auth.prisma:39`) | เลขบัตรประชาชน 13 หลัก plaintext ของเจ้าหน้าที่ | `auth-provider.js:49-57` บังคับ `/^\d{13}$/` + ข้อความ "Provider ID ต้องเป็นเลขบัตรประชาชน 13 หลัก" |
| `healthIdHash` / `providerIdHash` / `idCardHash` (`auth.prisma:33,40,62`) | **raw SHA-256** ของ CID — คอลัมน์ lookup + ที่เก็บ uniqueness จริง (plaintext `@unique` ถูก DROP ไปแล้ว) | `auth.prisma:24-31`; เขียนที่ `prisma-auth-service.js:155-159`; อ่านที่ `prisma-auth-service.js:304-317`, `auth-provider.js:71-75` |
| `healthIdHmac` / `providerIdHmac` / `idCardHmac` (`auth.prisma:38,42,64`) | **keyed-HMAC** lookup (`computeLookupHmac`) — additive, ใช้เมื่อ `AUTH_LOOKUP_USE_HMAC=true` | `auth.prisma:34-38`; switch `prisma-auth-service.js:21-23` |
| `canonicalId` (`auth.prisma:45`, `String @unique` **NOT NULL**) | **FK key** ที่ทุกตารางชี้มา | `apps/backend/prisma/schema/application.prisma:12-13` (`healthId String` + `@relation(fields:[healthId], references:[canonicalId])`), `:295-296`; อธิบายเต็มที่ `apps/backend/shared/fk-token.js:8-35` |
| `canonicalIdLegacy` (`auth.prisma:55`) | escrow นิ่ง ไม่มีโค้ดอ่าน | `auth.prisma:46-55` |

**สรุปข้อ (b):**
- ❌ **ไม่มี field เก็บ external subject** — ต้อง EXPAND
- ❌ **ไม่มีตาราง/field "หนึ่ง user หลาย IdP"** — ต้องสร้างใหม่ (ยืนยันจากรายชื่อ model ครบทุกไฟล์)
- ⚠️ **unique constraint ที่จะชนตอน link**: `email @unique` (`auth.prisma:16`), `healthIdHash/@unique` (:33), `healthIdHmac @unique` (:38), `providerIdHash @unique` (:40), `providerIdHmac @unique` (:42), `canonicalId @unique` (:45), `idCardHash @unique` (:62), `idCardHmac @unique` (:64), `uuid @unique` (:5)
- ❌ **`password` NOT NULL** → BLOCKER-1

**ผลข้างเคียงที่ยืนยันแล้ว — สอง creation path เขียนคอลัมน์ต่างกัน:**
- `prisma-auth-service.register` เขียน `idCardHash` ทุกครั้ง (`:225`) ทั้ง health และ provider
- `apps/backend/services/provider-user-service.js:125-153` (`createProviderUser`) **ไม่เขียน** `idCardHash` เลย — เขียนแค่ `providerIdHash` (:145) + `providerIdHmac` (:149)

## (c) จุดที่ assume local login

**Session mechanism — ยืนยันทั้ง BE และ FE:**

| ชั้น | ข้อเท็จจริง | file:line |
|---|---|---|
| BE health | cookie `auth_token` httpOnly, sameSite lax, 24h | `apps/backend/controllers/auth-controller.js:42-48` |
| BE health | cookie `refresh_token` httpOnly, 7d | `auth-controller.js:51-57` |
| BE csrf | cookie `csrf_token` **httpOnly: false** (double-submit) | `auth-controller.js:19-25` |
| BE provider | cookie `provider_token` httpOnly, 8h | `auth-provider.js:246-252` |
| BE อ่าน token | **cookie-first แล้วค่อย Bearer header** | `auth-middleware.js:426-429` (health), `:574-577` (provider), `:768-771` (any) |
| **FE** | **token เก็บใน `localStorage['accessToken']`** | `apps/web-app/src/lib/services/auth-service-session.ts:37-46` (`localStorage.setItem`), `:61-66`; key ที่ `apps/web-app/src/lib/services/auth-service.types.ts:2` |
| **FE** | **user object เก็บใน `localStorage['user']`** | `auth-service-session.ts:81-83` + types `:4` |
| **FE** | cookie ถูกตั้งโดย **client POST token ไปที่ Next route** | `apps/web-app/src/lib/services/auth-service.ts:268-281` → `apps/web-app/src/app/api/session/set-cookie/route.ts:18-55` → `apps/web-app/src/app/api/session/session-cookie.ts:13-23` (`httpOnly: cookieName !== 'csrf_token'`) |
| FE middleware | อ่าน cookie แล้ว decode JWT เอาบทบาท | `apps/web-app/src/middleware.ts:166, 180, 196, 210` + `apps/web-app/src/lib/middleware-helpers.ts:72-79` |

**Middleware auth ทั้งหมด (`apps/backend/middleware/auth-middleware.js`)** — ไม่มีตัวไหนอ่าน password ตอน request; ทุกตัวเป็น JWT-based:
- `authenticateHealth` `:423-554` · `authenticateProvider` `:566-706` · `authenticateAny` `:763-924` · `optionalAuth` `:716-754` · `requireVerification` `:931-963` · `authorize` (deprecated) `:984-999`
- endpoint ที่ verify token เองนอก middleware กลาง: `auth-provider.js:319-459` (`GET /auth/provider/me`)

→ **middleware ไม่ assume local login โดยตรง** แต่ assume ว่า session = JWT ที่มี claim `id`/`role`/`canonicalRole`/`organizationId` (`prisma-auth-service.js:484-503`)

**จุดที่ assume จริง (นอก middleware):**
| # | จุด | file:line |
|---|---|---|
| c1 | session refresh มีเฉพาะฝั่ง health | route `auth-health.js:134`; handler `auth-session-security-handlers.js:155-…`; **FE ปิด refresh สำหรับ provider ชัดเจน** `apps/web-app/src/lib/services/auth-service.ts:377-380` และ `:443-449` |
| c2 | provider ไม่มี refresh token — logout เพิกถอน AT ตรง ๆ | `auth-provider.js:299-316` + คอมเมนต์ `:300-302` "Provider sessions carry no separate refresh-token cookie" |
| c3 | **provider login ไม่มี audit log เลย** (มีแค่ `logger.info`) | `auth-provider.js:257` — ตรงข้ามกับ health ที่มี `LOGIN_SUCCESS` `apps/backend/controllers/auth-controller/health-auth-profile-handlers.js:230-238` และ `LOGIN_FAILURE` `:264-275` |
| c4 | audit actor: `actorId` + `actorType` (`USER\|PROVIDER\|SERVICE\|SYSTEM` default `USER`) + `actorRole` | `apps/backend/prisma/schema/audit.prisma:22-25`; signature `apps/backend/middleware/audit-logger.js:637-652`; **ไม่มีคอลัมน์ "provider ที่ใช้ login"** |
| c5 | ที่ทางเดียวสำหรับข้อมูล provider/CID hash = `metadata Json?` ซึ่ง**อยู่ใน hash chain แล้ว** (v2) | `audit.prisma:36`; hashed ที่ `audit-logger.js:421`, `:446` |
| c6 | CSRF bypass hardcode เฉพาะ 2 login endpoint | `apps/backend/middleware/csrf-middleware.js:40-44` |
| c7 | rate limiter mount ตาม path ตรง ๆ | `apps/backend/server.js:269-273` |
| c8 | consent gate 403 `CONSENT_REQUIRED` | `apps/backend/middleware/consent-manager.js:353-392`; mount จุดเดียวที่ `apps/backend/routes/api/applications/applications.js:500` (`POST /submit`); bypass prefix มี `/api/auth/` `:333` |
| c9 | บัญชีใหม่ default `PENDING_VERIFICATION` + gate `status==='ACTIVE'` | `auth.prisma:122`; `prisma-auth-service.js:130-137`; gate `auth-middleware.js:931-963` |

## (d) [§F0.3] route/session path ปัจจุบัน + ผู้อ้างอิงทั้งหมด

**ไฟล์ทั้งหมดใน `apps/web-app/src/app/auth/`** (9 ไฟล์):

| path ที่ export | ไฟล์ |
|---|---|
| `/auth/health/login` | `apps/web-app/src/app/auth/health/login/page.tsx:1-3` → re-export `@/app/auth/_components/health-login-page` |
| `/auth/provider/login` | `apps/web-app/src/app/auth/provider/login/page.tsx:1-3` → re-export `@/app/auth/_components/provider-login-page` |
| `/auth/health/terms` | `apps/web-app/src/app/auth/health/terms/page.tsx:1-3` → re-export `@/app/terms/page` |
| `/auth/health/privacy` | `apps/web-app/src/app/auth/health/privacy/page.tsx:1-3` → re-export `@/app/privacy/page` |
| `/auth/clear-session` | `apps/web-app/src/app/auth/clear-session/page.tsx:7-47` |
| (component) | `_components/health-login-page.tsx` (359 บรรทัด), `_components/provider-login-page.tsx` (263), `_components/mfa-challenge-form.tsx`, `_components/__tests__/mfa-challenge-form.test.tsx` |

**SSOT ของ route:** `apps/web-app/src/lib/constants/auth-routes.ts:1-8` — `HEALTH_LOGIN_ROUTE='/auth/health/login'`, `PROVIDER_LOGIN_ROUTE='/auth/provider/login'`, alias legacy `/login`, `/provider/login` (`:3-4`)

**ผู้อ้างอิงครบทุกตัว (ยืนยันด้วย grep symbol ในซอร์ส ไม่ใช่ string):**

| ผู้อ้างอิง | file:line | บทบาท |
|---|---|---|
| Next middleware — redirect legacy | `apps/web-app/src/middleware.ts:142-147` | `/login`→`/auth/health/login`, `/provider/login`→`/auth/provider/login` |
| Next middleware — gate `/health/*` | `middleware.ts:166-189` | redirect + `?redirect=<pathname>` |
| Next middleware — gate `/provider/*`+`/admin/*` | `middleware.ts:196-229` | redirect + ลบ cookie `provider_token` ที่ :222 |
| api-client 401 handler | `apps/web-app/src/lib/api/api-client.ts:359-367` | `?expired=true` |
| session-timeout redirect | `apps/web-app/src/lib/services/auth-service-activity.ts:41-42, 103-104` | ผ่าน `resolveLoginPath` |
| `resolveLoginPath` | `apps/web-app/src/lib/services/auth-service-session.ts:56-59` | |
| endpoint ที่ FE ยิงจริง (**path เดียวกับ FE route**) | `apps/web-app/src/lib/services/auth-service-api.ts:61-62` | `apiClient.post(HEALTH_LOGIN_ROUTE\|PROVIDER_LOGIN_ROUTE, payload)` |
| dashboard logout | `apps/web-app/src/components/layout/dashboard-layout.tsx:147` | |
| `useRequireAuth` default | `apps/web-app/src/lib/services/auth-provider.tsx:152` | |
| public-route allowlist | `apps/web-app/src/lib/role-utils.ts:229-241` | `requiresAuth()` |
| sitemap | `apps/web-app/src/app/sitemap.ts:21-22` | |
| redirect stub `/login` | `apps/web-app/src/app/(auth)/login/page.tsx:2-5` | |
| redirect stub `/provider/login` | `apps/web-app/src/app/provider/login/page.tsx:2-5` | |
| ลิงก์ข้ามพอร์ทัลในหน้า login | `health-login-page.tsx:345` | |
| ลิงก์ในหน้าอื่น | `apps/web-app/src/app/health/documents/[id]/client-view.tsx:36`, `health/applications/renewal/client-view.tsx:166`, `health/applications/[id]/preview/client-view.tsx:40`, `health/applications/[id]/client-view.tsx:104` | |
| clear-session | `auth/clear-session/page.tsx:35` | |
| **e2e** | `apps/web-app/e2e/helpers/auth.ts:33-37` — `goto('/auth/health/login')` + selector `#identifier`/`#password`/`button[type="submit"]`; ใช้โดย `e2e/auth.setup.ts:18-21` (storageState) | |
| **e2e provider ×4** | `apps/web-app/e2e/helpers/provider-auth.ts:14-21, 42-47, 70-75, 98-103` — `goto('/auth/provider/login')` + selector `#provider-id`/`#provider-password` | |
| **จำกัด layout** | `apps/web-app/src/app/__tests__/auth-shell-split-scope.test.ts:80-94` — ทุกหน้าที่ใช้ `.gov-auth-page` **ต้องมี** `gov-auth-hero` หรือ `gov-auth-form-panel` มิฉะนั้น test fail | |
| เอกสาร | `API-REFERENCE.md:11,14`; `docs/architecture/flow-runtime-matrix.md:16` | |

**endpoint BE ที่หน้า login เรียก** (mount: `apps/backend/routes/api/index.js:101-102` → `/auth/health`, `/auth/provider`):

| method + path | file:line |
|---|---|
| `POST /api/auth/health/login` | `apps/backend/routes/api/auth/auth-health.js:60` |
| `POST /api/auth/health/register` | `auth-health.js:113` |
| `POST /api/auth/health/reset-password` | `auth-health.js:116` |
| `POST /api/auth/health/reset-password/:token` | `auth-health.js:119` |
| `POST /api/auth/health/check-identifier` | `auth-health.js:130` |
| `POST /api/auth/health/refresh` | `auth-health.js:134` |
| `POST /api/auth/health/logout` | `auth-health.js:149` |
| `GET /api/auth/health/me` | `auth-health.js:176` |
| `POST /api/auth/health/change-password` | `auth-health.js:178` |
| `DELETE /api/auth/health/me/delete` | `auth-health.js:220` |
| `POST /api/auth/provider/login` | `apps/backend/routes/api/auth/auth-provider.js:34` |
| `POST /api/auth/provider/logout` | `auth-provider.js:299` |
| `GET /api/auth/provider/me` | `auth-provider.js:319` |
| Next-only: `POST /api/session/set-cookie` / `clear-cookie` | `apps/web-app/src/app/api/session/set-cookie/route.ts:18`, `.../clear-cookie/route.ts` |

**Mobile (อยู่ในเรโป)** — เรียก **endpoint BE** ตรง ไม่ผ่าน FE route: `apps/mobile-app/lib/data/repositories/auth_repository_impl.dart:152` (`/auth/health/login`), `:238` (`/auth/provider/login` \| `/auth/health/login`), `:70,110` (`/auth/health/register`), `:309` (`/auth/health/me`)

**⚠ ไม่มี test ตัวไหนที่ pin route path ทั้งชุดอยู่แล้ว** — grep `HEALTH_LOGIN_ROUTE|PROVIDER_LOGIN_ROUTE|/auth/health/login|/auth/provider/login` ใน `apps/web-app/src/**/__tests__/**` เจอแค่ 3 จุดที่แตะโดยบังเอิญ (`lib/api/__tests__/api-client-unavailable-copy.test.ts:68`, `components/__tests__/a11y-fixes-top-pages.test.tsx:75`, `app/health/official-documents/__tests__/official-documents-envelope.test.tsx:45`) → §F0.3 "pin ด้วย test" คือ**งานที่ยังไม่มี**

## (e) local login = provider หนึ่งใน AUTH_PROVIDERS

**seam ที่มีอยู่แล้วและ reuse ได้ (ตัวเดียว):**
`apps/backend/services/prisma-auth-service.js:475-522` `issueTokensForAuthenticatedUser(user, options)` — docblock ที่ `:454-468` เขียนไว้ตรงตัว:
> "Extracted from login() so **any future flow that has already proven identity by other means** issues the EXACT same HEALTH_JWT session… **Callers MUST have already verified the credential / token. This method does NOT check passwords, lockout, or portal**"

มันมิ้นต์ AT+RT พร้อม `sessionFamilyId` และเลือก secret จาก role (`:506-507`)

**แต่ seam นี้ยังไม่ใช่ SSOT:** `auth-provider.js:227-243` มิ้นต์ token **เอง inline** ด้วย `jwtConfig.generateToken(...)` payload ต่างจาก seam ชัดเจน — ไม่มี `sessionFamilyId`, ไม่มี `accountTier`, ไม่มี `twoFactorEnabled`, ไม่มี refresh token → **สองจุดมิ้นต์ที่ drift แล้ววันนี้**

**โครง login handler ปัจจุบัน = ผูกกับ password ตรง ๆ ทั้งสองฝั่ง:**
- health: route `auth-health.js:60` → `AuthController.login` (`health-auth-profile-handlers.js:132-283`) → `AuthService.login(loginId, password, …)` (`prisma-auth-service.js:260`) — `password` เป็น positional arg ตัวที่ 2
- provider: `auth-provider.js:34-291` ทั้งก้อนอยู่ในไฟล์ route ไม่มี service layer

**idiom adapter ของเรโป (ตัวเทียบตามโจทย์):** `apps/backend/services/payment/payment-adapter.js:52-66` — `getPaymentAdapter()` อ่าน kind จาก config (`config/stripe.js#getPaymentAdapterKind`) → `require` implementation ต่อตัว → **fail closed** โยน `PAYMENT_ADAPTER_INVALID` เมื่อไม่รู้จัก (`:62-65`); interface อธิบายที่ `:6-13`; implementation `stripe-adapter.js` / `mock-payment-adapter.js` (`:16-19`)

**สถานะ OAuth surface ปัจจุบัน = ศูนย์ (ยืนยันแล้ว):**
- grep `\boauth\b|\bopenid\b|authorization_code|client_secret` ใน `apps/backend/` → hit เดียวที่ไม่ใช่ payment/test คือคอมเมนต์ `apps/backend/config/secrets.js:126,131` (`SESSION_SECRET` description "Session signing secret (cookies, OAuth state)") — **ไม่มีโค้ด OAuth ใช้มันเลย**
- `Glob apps/backend/routes/auth/**` = **No files found** → path `routes/auth/thaid` ที่เอกสารอ้างไม่มีจริง
- ไม่มี `AUTH_PROVIDERS` ที่ไหนในเรโป
- `THAID_CLIENT_SECRET`/`THAID_STATE_SECRET` ปรากฏเฉพาะใน `docs/security/secrets-catalog-2026-05-16.md:53,66` **ไม่มีใน `apps/backend/config/secrets.js`**
- Firebase IdP เคยมีและถูกถอดออกด้วยเหตุผล data-sovereignty — คอมเมนต์ห้ามนำ foreign IdP กลับมาที่ `auth-health.js:62-66`, `auth-provider.js:293-296`, `apps/web-app/src/lib/services/auth-service-api.ts:23-38`, CSP `apps/web-app/src/middleware.ts:100-104`

**JWT ขยาย claim ได้:** `apps/backend/config/jwt-security.js:181-202` — payload เป็น caller-supplied spread; `tokenType:'access'` ถูก stamp ที่ `:201`; audience/issuer แยกต่อ portal `:119-135`

---

# 2. INFERRED

| # | ข้อสรุป | อนุมานจาก | ความมั่นใจ |
|---|---|---|---|
| I1 | คนที่มีทั้งบัญชี health และ provider (สอง row) จะ login provider ไม่ผ่านแบบ**สุ่ม** | `prisma-auth-service.js:311-329` สร้าง `whereClause.OR` ที่รวม `idCardCol` เสมอ → `findFirst` (`:330`) ไม่มี `orderBy` → Postgres ไม่การันตีลำดับ → อาจได้ row health มาก่อน → ชน portal guard `:348-350` throw | สูง (โค้ดชัด, semantics ของ `findFirst` ไร้ `orderBy` เป็นความจริงมาตรฐาน) |
| I2 | บัญชีที่ auto-provision จาก Health ID จะ **403 CONSENT_REQUIRED ตอนยื่นคำขอ** | `consent-manager.js:373-381` เช็ค `hasRequiredConsents`; consent ถูกบันทึกเฉพาะตอน register (`health-auth-profile-handlers.js:90-100`); gate อยู่ที่ `applications.js:500` — ตรงกับ flow "ยื่นคำขอ" ที่ §C4 test pin บังคับ (`mandate.md:32`) | สูง |
| I3 | บัญชีที่ auto-provision จะติด `PENDING_VERIFICATION` | `auth.prisma:122` default; `prisma-auth-service.js:134` set ตาม OCR bypass; gate `auth-middleware.js:948-957` | สูง (ขึ้นกับว่า OAuth path จะเรียก `register()` หรือเขียน user เอง) |
| I4 | `bcrypt.compare(x, 'SENTINEL')` คืน `false` ไม่ throw จึงเป็นทางที่ใช้ได้ทางเทคนิค | อนุมานจาก `auth-session-security-handlers.js:603` ที่บอกว่า sentinel ทำให้ "no future login can succeed" (แปลว่าโค้ดวิ่งผ่านและได้ false) | กลาง — **ยังไม่มี test pin ในเรโป ต้อง RED-first ตาม §3.11** |
| I5 | เพิ่ม claim `authProvider` ลง JWT ได้โดยไม่แตะ verify | `jwt-security.js:198-201` spread payload ตรง; `auth-middleware.js:506-515, 654-662` `...decoded` เข้า `req.user` | สูง |
| I6 | บันทึก provider + CID hash ลง audit ได้โดย**ไม่ต้อง migrate** ผ่าน `metadata` | `audit.prisma:36`; ผ่าน `logAuth(..., metadata)` `audit-logger.js:637-651`; metadata อยู่ใน hash v2 (`audit-logger.js:421`) และถูก mask PII (`audit-logger.js:~391`) | สูง |
| I7 | OAuth callback ต้องเพิ่ม 3 อย่างพร้อมกัน ไม่งั้นพัง/ไม่ปลอดภัย: CSRF bypass entry, rate limiter entry, consent bypass (มีอยู่แล้วจาก prefix `/api/auth/`) | `csrf-middleware.js:40-44`; `server.js:269-273`; `consent-manager.js:333-334` | สูง |
| I8 | seam `issueTokensForAuthenticatedUser` ใช้กับ Provider ID OAuth ได้เลย (มันเลือก secret provider เองที่ `:506`) แต่จะทำให้ provider session **เปลี่ยนพฤติกรรม** (ได้ refresh token ที่วันนี้ไม่มี) | `prisma-auth-service.js:506-521` vs `auth-provider.js:227-252` (ไม่มี RT) + FE ปิด provider refresh `auth-service.ts:377-380` | กลาง-สูง — เป็น behavior change ต้องมี ruling |
| I9 | หน้า login ใหม่ตาม §C3 (สอง card ไม่มี hero) จะทำ test `auth-shell-split-scope` แดง ถ้าใช้ class `.gov-auth-page` | `apps/web-app/src/app/__tests__/auth-shell-split-scope.test.ts:80-94` | สูง |

---

# 3. AMBIGUOUS — ต้องให้คนตัดสิน

### A1 · [เงิน/identity/สิทธิ์] §D3 "ห้าม localStorage/sessionStorage ทุกกรณี" ปะทะ "ตาม session mechanism เดิม"
`mandate.md:48` เขียนสองอย่างในประโยคเดียวกันที่ขัดกันเมื่อเทียบโค้ดจริง: mechanism เดิม **คือ localStorage-primary** (`auth-service-session.ts:37-46, 61-66, 81-83`) แล้วค่อย POST token ไปให้ Next route ตั้ง cookie (`auth-service.ts:268-281` → `set-cookie/route.ts:45-47`) ส่วนเอกสารในเรโปเองประกาศว่า localStorage คือ anti-pattern ที่ "scheduled for removal" (`docs/architecture/2026-05-04-canonical-auth-session-rbac-contract.md:40-46`)

ทางตีความ:
- **(i)** OAuth session เป็น cookie-only เท่านั้น → เกิด session model สองแบบในแอปเดียว; `AuthService.isAuthenticated()` (`auth-service.ts:316-329`) อ่าน localStorage → external user จะถูกมองว่า "ไม่ล็อกอิน" ที่ฝั่ง FE ทั้งที่ cookie ใช้ได้ → **ต้องแก้ FE session layer ทั้งชั้น**
- **(ii)** ย้ายทุก session ออกจาก localStorage → กระทบ Bearer-header path ของ mobile (`auth_repository_impl.dart:152,238`) และ provider ที่ FE แนบ Bearer จาก stored token (คอมเมนต์ `auth-middleware.js:568-573`) — และ §F บอกว่า "Backend อื่นนอก auth module" out of scope ซึ่งกำกวมว่า session layer นับหรือไม่
- **(iii)** localStorage เฉพาะ local login → ขัดตัวอักษร "ทุกกรณี"

### A2 · route SSOT ขัดกันระหว่างเอกสารกับโค้ด
`docs/architecture/2026-05-04-canonical-auth-session-rbac-contract.md:99-105` ประกาศ canonical routes = `/auth/health-login`, `/auth/provider-login`, `/auth/thaid/callback` และ `:105` "Any code that redirects to bare `/login` is a bug" · โค้ดจริงใช้ `/auth/health/login`, `/auth/provider/login` (`auth-routes.ts:1-2`) และ **มี** redirect `/login` (`middleware.ts:142-143`) · `/auth/thaid/callback` **ไม่มีอยู่จริง** (`Glob apps/backend/routes/auth/**` = ว่าง) ทั้งที่เอกสารเดียวกันบรรยาย role normalization ของมันไว้ละเอียดที่ `:136-143`

§F0.3 (`mandate.md:68`) สั่ง "ห้ามเปลี่ยน route path" — ถ้าเอกสารนี้คือ SSOT แปลว่า route ปัจจุบันผิดอยู่แล้ว; ถ้าโค้ดคือ SSOT แปลว่าเอกสารเน่า **ต้องตัดสินว่าอันไหนคือ SSOT ก่อน pin test**

### A3 · [identity] "Health ID" หมายถึงอะไร
ในเรโป `User.healthId` = เลขบัตรประชาชน 13 หลัก (`auth.prisma:32`, `auth-health.js:2-3`) · ใน mandate "Health ID (สธ.)" = IdP ของสำนักสุขภาพดิจิทัล (`mandate.md:19`) · §D4 `mandate.md:51` เขียน "ผูก/สร้างบัญชีเกษตรกร (**Health ID model เดิม**) โดย match CID"

ตีความได้ 2 ทาง: (i) ใช้คอลัมน์ `healthId` เดิมเป็น key (สอดคล้องกับ "match CID") หรือ (ii) สร้าง model ใหม่ชื่อ Health ID สำหรับ IdP ผลต่างคือ EXPAND schema กี่ตัวและ FK ชนหรือไม่

### A4 · [identity/สิทธิ์] คนเดียวเป็นทั้งเกษตรกรและเจ้าหน้าที่ — อนุญาตหรือไม่
§D4 `mandate.md:53` สั่งให้ ThaID map CID เข้าทั้งสองฝั่ง แต่โค้ด**ห้าม**ที่ `prisma-auth-service.js:336-338`, `auth-provider.js:96-103`, `password-management.js:33-34, 85-86` และ constraint `idCardHash @unique` (`auth.prisma:62`) + write ที่ `prisma-auth-service.js:155, 225`

ทางเลือก: (i) ห้ามต่อ → ThaID card เจ้าหน้าที่กับ card ประชาชนต้องเป็นคนละคนเสมอ · (ii) อนุญาตสอง row → ต้องแก้ I1 (lookup ไม่ determinstic) ก่อน · (iii) หนึ่ง row หลาย role → รื้อ portal separation ทั้งชุด (`auth-middleware.js:629-637`, `prisma-auth-service.js:345-357`) ซึ่งเป็น security control ที่มีอยู่

### A5 · [identity/สิทธิ์] `password` NOT NULL — EXPAND หรือ sentinel
(i) EXPAND `password String?` → ต้องไล่ทุก `bcrypt.compare(x, user.password)` ที่จะได้ `undefined` — จุดที่ตรวจพบ: `prisma-auth-service.js:372`, `auth-provider.js:148`, `pdpa-service.js:297`, `password-management.js:36`; มีเพียง `auth-session-security-handlers.js:652` ที่ป้องกันด้วย `|| ''`
(ii) sentinel ค่าคงที่ → ไม่แตะ schema แต่ทำให้ "ไม่มี password" กับ "ถูก anonymize" (`:680`) แยกกันไม่ออก และเป็น hardcode ที่ต้องเข้า constants ตาม §3.5

### A6 · [สิทธิ์/กฎหมาย] re-auth ของ external session คืออะไร
PDPA ม.33 (ลบบัญชี) ปัจจุบันบังคับ password (`pdpa-service.js:264-268, 297`) mandate ไม่ระบุ factor ทดแทน ทางเลือก: (i) ยิง OAuth authorize ซ้ำ (ต้องมี citation จากคู่มือ ซึ่ง §B ห้ามเดา `mandate.md:22`) · (ii) ใช้ MFA ที่มีอยู่ (`apps/backend/routes/api/identity/mfa.js`) · (iii) ปล่อยผ่านโดยไม่ re-auth → session-hijack "ลบบัญชีให้" ตามที่คอมเมนต์ `auth-session-security-handlers.js:599-600` เตือนไว้เอง

### A7 · [identity/สิทธิ์] forgot-password เป็นทางอ้อมรอบ IdP
`password-management.js:73-125` + `:132-179` ตั้ง password ให้บัญชีใดก็ได้ที่มี email/phone โดยไม่ตรวจว่าเป็น external — และ `mandate.md:32` สั่ง test pin state (ii) "local disabled + external enabled" ทางเลือก: (i) ปิด reset สำหรับบัญชี external (ต้องมี field แยก external ก่อน = ผูกกับ BLOCKER-2) · (ii) ปล่อยไว้ = ยอมรับ bypass · (iii) ปิดทั้งหมดเมื่อ local login disabled

### A8 · ขอบเขต "ห้าม auto-provision Provider ID"
`mandate.md:52` ห้ามใน OAuth path แต่ auditor check #4 (`mandate.md:82`) เขียนว่า "Provider ID **ไม่มี path auto-provision** — พิสูจน์ด้วย test" ซึ่งอ่านได้ว่าครอบทั้งเรโป ปัจจุบันมี path สร้าง provider อยู่ 2 ที่: `provider-user-service.js:125-153` (admin API) และ `routes/api/system/provider.js:548` (reset password + create) — ถ้าตีความกว้าง test จะแดงที่ของเดิมที่ไม่เกี่ยวกับ OAuth

### A9 · preflight-notes ขัดกับโค้ด
`preflight-notes.md:47` ระบุ "`_components/provider-login-page.tsx` มีการอ้าง thaid/health.id/provider.id อยู่แล้ว" — เปิดอ่านทั้งไฟล์ (263 บรรทัด) **ไม่มี** และ grep `thaid|health\.id|provider\.id|oauth` ใน `apps/web-app/src` ทั้งโฟลเดอร์ = 0 hit ที่เกี่ยวข้อง (เจอแต่ `formatThaiDate` และคอมเมนต์ `middleware-helpers.ts:69`) → **ไม่มี surface OAuth ฝั่ง FE เลย**

---

# 4. การจัดกองตาม §A0

| finding | กอง | file:line | เหตุผล |
|---|---|---|---|
| `password` NOT NULL | **(b) EXPAND** ⛔BLOCKER | `auth.prisma:17` | ไม่มีทางสร้าง OAuth user ได้เลยถ้าไม่แก้/ไม่ตัดสิน |
| ไม่มี external subject field | **(b) EXPAND** ⛔BLOCKER | `auth.prisma:3-259` (ทั้ง model) | link ได้เฉพาะทาง CID เท่านั้นวันนี้ |
| ไม่มีตาราง user↔หลาย IdP | **(b) EXPAND** | รายชื่อ model ทุกไฟล์ใน `prisma/schema/` | §D1/D4 ต้องมีอย่างน้อย 3 provider |
| `idCardHash @unique` + guard identity-conflict | **(b) EXPAND / ruling** ⛔BLOCKER | `auth.prisma:62`; `prisma-auth-service.js:155,225,336-338`; `auth-provider.js:96-103` | §D4 ThaID ทั้งสองฝั่งชนตรงนี้ |
| lookup `findFirst` ไม่ deterministic กรณีสอง row | **(a) แก้ใน AUTH-01** | `prisma-auth-service.js:311-330` | ThaID dual-card จะทำให้บั๊กแฝงนี้โผล่ |
| register บังคับ password 3 ชั้น | **(a) แก้ใน AUTH-01** | `auth-schemas.js:101`; `prisma-auth-service.js:604-611, 194` | เส้นทางสร้างบัญชีสำหรับ §D4 |
| provider login ผูก bcrypt ใน route | **(a) แก้ใน AUTH-01** | `auth-provider.js:34-291` (`:148`) | ต้องมี seam ก่อนเสียบ Provider ID/ThaID |
| health login ผูก password positional | **(a) แก้ใน AUTH-01** | `prisma-auth-service.js:260, 372` | §C4 local = provider หนึ่ง |
| **provider login ไม่มี audit log** | **(a) แก้ใน AUTH-01** | `auth-provider.js:257` (มีแค่ logger); เทียบ `health-auth-profile-handlers.js:230-238` | §D4 บังคับ audit ทุก login สำเร็จ/ล้มเหลว |
| forgot/reset ตั้ง password ให้บัญชี external ได้ | **(a) แก้ใน AUTH-01** | `password-management.js:73-125, 132-179`; FE `health-login-page.tsx:287` | ทำให้ test pin state (ii) ของ §C4 ไม่มีความหมาย |
| CSRF bypass hardcode 2 endpoint | **(a) แก้ใน AUTH-01** | `csrf-middleware.js:40-44` | callback POST ต้องมี entry ไม่งั้น 403 |
| rate limiter mount ตาม path | **(a) แก้ใน AUTH-01** | `server.js:269-273` | endpoint OAuth ใหม่ไม่มี limiter |
| consent gate 403 กับ user ที่ auto-provision | **(a) แก้ใน AUTH-01** | `consent-manager.js:353-392`; `applications.js:500` | flow "ยื่นคำขอ" ใน test pin §C4 |
| `PENDING_VERIFICATION` + `requireVerification` | **(a) แก้ใน AUTH-01** | `auth.prisma:122`; `prisma-auth-service.js:134`; `auth-middleware.js:931-963` | §D4 "พาเข้า flow กรอกข้อมูลเพิ่ม" ต้องรู้ว่า gate อยู่ตรงไหน |
| PDPA erasure บังคับ password | **(a) แก้ใน AUTH-01** (สิทธิ์ตามกฎหมาย) | `pdpa-service.js:262-302`; `auth-health.js:220-227` | external user ใช้สิทธิ์ ม.33 ไม่ได้ |
| change-password ใช้ไม่ได้กับ external | **(a)** ถ้า UI แสดงอยู่ / **(c)** ถ้าแค่ซ่อน | `password-management.js:27-39`; `auth-health.js:178` | ต้องรู้ว่า UI จะซ่อนหรือไม่ |
| สองจุดมิ้นต์ token drift กันแล้ว | **(a) แก้ใน AUTH-01** | `prisma-auth-service.js:475-522` vs `auth-provider.js:227-252` | §D3 "session ตาม mechanism เดิม" ต้องรู้ว่าอันไหนคือ "เดิม" |
| `sessionsRevokedAt` ไม่มี lever สำหรับ external | **(c) backlog** | `auth.prisma:142-149`; `password-management.js:55,167` | ไม่บล็อก AUTH-01 แต่เป็นช่องเพิกถอน session ที่หายไป |
| provider ไม่มี refresh (T-002 ค้าง) | **(c) backlog** | `auth-provider.js:299-316`; `auth-service.ts:377-380,443-449`; doc `:67` | หนี้เดิม ไม่ใช่ของ AUTH-01 |
| `deleteMe` เป็น dead duplicate ของ erasure | **(c) backlog** (§3.6 dup-source) | `auth-session-security-handlers.js:612-659` vs `pdpa-service.js:262`; grep route = ไม่ mount | ไม่กระทบ external authen โดยตรง |
| `createProviderUser` ไม่เขียน `idCardHash` (ต่างจาก register) | **(c) backlog** | `provider-user-service.js:125-153` vs `prisma-auth-service.js:225` | ทำให้ A4 ซับซ้อนขึ้นแต่ไม่บล็อก |
| เอกสาร `2026-05-04-canonical-auth-session-rbac-contract.md` เน่า (route + ThaID callback ที่ไม่มีจริง) | **(c) backlog** หรือ ruling A2 | doc `:62, 99-105, 136-143` vs `Glob apps/backend/routes/auth/**` = ว่าง | ต้องตัดสิน SSOT ก่อน pin test §F0.3 |
| `THAID_*` ใน secrets-catalog ที่ไม่มีใน secrets.js | **(c) backlog** | `docs/security/secrets-catalog-2026-05-16.md:53,66` vs `apps/backend/config/secrets.js:126-132` | เอกสารเน่า |
| ยังไม่มี test pin route/session path | **(a) แก้ใน AUTH-01** (§F0.3 สั่งตรง) | grep `__tests__` ในหัวข้อ (d) | §F0.3 `mandate.md:68` |
| `auth-shell-split-scope` จะแดงกับ layout สอง-card | **(a) แก้ใน AUTH-01** | `apps/web-app/src/app/__tests__/auth-shell-split-scope.test.ts:80-94` | §3.7 ห้ามลด assertion เพื่อให้เขียว |

---

# 5. บรรทัดสรุป material-ambiguity

**AMBIGUOUS ที่แตะ identity / สิทธิ์ (ไม่มีข้อไหนแตะเงินโดยตรง แต่ A1/A4/A5 กระทบ flow ชำระเงินผ่าน session):**
**A1** (localStorage vs cookie-only — identity + สิทธิ์เข้าถึง) · **A3** (นิยาม "Health ID" — identity) · **A4** (คนเดียวสองบทบาท — identity + สิทธิ์ + portal separation ซึ่งเป็น security control ที่ทำงานอยู่) · **A5** (`password` nullable vs sentinel — identity) · **A6** (re-auth สำหรับ PDPA ม.33 — สิทธิ์ตามกฎหมาย) · **A7** (forgot-password bypass IdP — identity + สิทธิ์)

**BLOCKER-1 / BLOCKER-2 / BLOCKER-3 ทั้งสามแตะ identity โดยตรง** และ §A0 (`mandate.md:15`) สั่ง **STOP รายงานก่อน** → AUTH-01 ไม่ควรเข้า PLAN/implement จนกว่า operator ตัดสิน A3, A4, A5 และยืนยันว่า profile response ของ Health ID (สธ.) คืน **CID** จริง (ต้องอ่านคู่มือตาม §B ก่อน — §B ห้ามเดา `mandate.md:22`)