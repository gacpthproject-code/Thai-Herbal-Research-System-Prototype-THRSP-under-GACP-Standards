# 🔍 Security & Architecture Audit — GACP Certification Platform

**วันที่:** 2026-05-29
**ผู้ตรวจ:** Senior Software Engineer + Security Reviewer (evidence-based audit)
**Scope:** ทั้ง monorepo — `apps/backend` (Express/JS), `apps/web-app` (Next.js/TS), `apps/mobile-app` (Flutter), `packages/validation`, infra, CI/CD
**โหมด:** READ-ONLY (ไม่มีการแก้ไข/commit/push — เสนอแนวทางแก้ในรายงานเท่านั้น)

> **กฎที่ยึดตลอด:** ทุกข้อมีหลักฐาน `file:line` + โค้ดจริง · แยกระดับความมั่นใจ ✅/⚠️/❓ · ระบุสิ่งที่ "ตรวจสอบไม่ได้" ตามจริง · คำสั่งที่รันอยู่ใน Appendix
>
> **หมายเหตุความซื่อสัตย์:** ระหว่าง audit มีการใช้ sub-agent ช่วยค้นหา แต่ **ทุกข้อค้นพบที่บันทึกในรายงานนี้ผู้ตรวจเปิดอ่านไฟล์ยืนยันเองแล้ว** และได้ **แก้ไขคำกล่าวของ sub-agent ทั้งที่เกินจริงและต่ำเกินจริง** (รายละเอียดในแต่ละ finding)

---

## 1. Executive Summary

แพลตฟอร์มนี้มี **มาตรฐานวิศวกรรมความปลอดภัยสูงกว่าค่าเฉลี่ยอย่างชัดเจน** — ระบบจัดการ secret แบบ fail-closed, JWT ที่ pin algorithm (กัน alg-confusion) + jti revocation, bcrypt+account lockout, MFA, httpOnly cookies, non-root containers, TLS1.2/1.3+HSTS, Next.js CSP + patch CVE-2025-29927, schema ที่ index/constraint ครบ, CI/CD ที่รัน test/coverage/audit จริง, และ unit test **3,511 ข้อผ่านทั้งหมด** ดังนั้น **ไม่พบช่องโหว่ระดับ Critical**

อย่างไรก็ตามพบ **ช่องโหว่ระดับ High จริง 1 รายการ** (server-side HTML/template injection → SSRF ในการสร้าง PDF ผ่านข้อมูลแปลงปลูกที่ผู้สมัครกรอกเอง) ที่ sub-agent มองข้าม, ปัญหา session ที่ logout ไม่ revoke token ฝั่ง server, การเก็บ JWT ใน localStorage, dependency ที่มี advisory ค้าง (รวม 1 high ที่จะทำให้ CI security gate แดง), การ log ข้อมูล sensitive ในแอป mobile, และ **ความไม่ตรงกับ README** หลายจุด (mobile หลายฟีเจอร์ยังเป็น placeholder/dead code ขณะ README อ้าง "Production Ready", OpenAPI ครอบคลุม endpoint จริงเพียงส่วนน้อย, version ไม่ตรง)

### ตารางสรุป findings ตาม severity

| Severity | จำนวน | IDs |
|---|---|---|
| 🔴 Critical | 0 | — |
| 🟠 High | 1 | SEC-001 |
| 🟡 Medium | 8 | SEC-002, SEC-003, SEC-004, SEC-005, ARC-001, MOB-001, MOB-003, CICD-001 |
| 🟢 Low | 12 | SEC-006, SEC-007, SEC-008, SEC-010, SEC-011, ARC-002, ARC-003, ARC-005, MOB-004, CICD-002, CICD-003, QUAL-001 |
| ⚪ Info | 6 | SEC-009, SEC-012, SEC-013, ARC-004, QUAL-002, QUAL-003 |

| Confidence | จำนวน | ความหมาย |
|---|---|---|
| ✅ ยืนยันแล้ว | 24 | เห็นโค้ด/หลักฐานตรงๆ |
| ⚠️ น่าสงสัย | 3 | มีสัญญาณ ต้องตรวจเพิ่ม/ขึ้นกับเงื่อนไข |
| ❓ ตรวจสอบไม่ได้ | ดูหัวข้อ 4 | ข้อมูล/รันไม่พอ |

---

## 2. Findings

### 🟠 SEC-001 — Server-side HTML/Template Injection → SSRF ใน PDF generation
- **Severity:** High · **Confidence:** ✅ (chain การ inject) / ⚠️ (การ escalate เป็น local-file read)
- **Area:** Security
- **Evidence:**
  - `apps/backend/services/pdf/application-template-service.js:74-81` — สร้าง HTML จากข้อมูลผู้ใช้ **โดยไม่ escape**:
    ```js
    const rows = plots.map((p, i) => `
      <tr>
        <td>${p.name || `แปลง ${i + 1}`}</td>
        <td class="r">${p.areaSize || p.area || '-'} ${p.areaUnit || 'ไร่'}</td>
        ...
        <td>${p.gpsCoordinates || p.coordinates || '-'}</td>
      </tr>`).join('');
    ```
  - `application-template-service.js:220` — กำหนดผลลัพธ์ให้ key ที่ลงท้าย `_SECTION`:
    `PLOTS_SECTION: buildPlotsSection(fd), DOCUMENT_LIST: buildDocumentList(...)`
  - `apps/backend/services/pdf/pdf-generator.service.js:91,96-97` — key ที่ลงท้าย RAW_SUFFIX จะถูกใส่ **ดิบ ไม่ escape**:
    ```js
    const RAW_SUFFIXES = ['_HTML','_URL','_ROWS','_SECTION','_LIST','_BG','_COLOR','_DISPLAY'];
    const shouldEscapeValue = !RAW_SUFFIXES.some((s) => keyPath.endsWith(s));
    return shouldEscapeValue ? escapeHtml(value) : String(value);
    ```
  - `pdf-generator.service.js:27,38` — Puppeteer `args:['--no-sandbox','--disable-setuid-sandbox']` + `page.setContent(htmlContent, { waitUntil: 'networkidle0' })` (รอ network → subresource ถูกโหลดจริง)
- **Impact / Attack path:** ผู้สมัคร (HEALTH user ที่ login แล้ว) ตั้งชื่อแปลง/พิกัด GPS เป็น HTML เช่น `<img src="http://169.254.169.254/...">` หรือ `<iframe src="http://internal-svc/...">` → เมื่อสร้าง PDF ใบสมัคร (เช่น `GET /api/applications/:id/pdf`) ค่าถูก inject ดิบเข้า template → Puppeteer (Chromium) render พร้อมโหลด network → **SSRF ฝั่ง server** (ยิงไปยัง metadata endpoint/บริการภายใน/MinIO/Redis), inject เนื้อหาปลอมลงในเอกสารราชการ GACP, และอาจ escalate เป็นการอ่านไฟล์ภายในผ่าน `<iframe src="file://...">` (⚠️ Chromium อาจบล็อก file:// จาก origin ของ setContent — ยังไม่ยืนยัน)
  - **สำคัญ:** middleware `sanitize-input.js` กรองเฉพาะ `<script>`, `on\w+=`, `javascript:` → payload `<img src=http://...>`/`<iframe src=...>` (ไม่มี on-handler) **ผ่านได้** จึงไม่ช่วยอุดช่องนี้
- **Recommendation:** escape ทุกค่า user-origin ที่ไหลเข้า section builder — แยก "โครง HTML ที่ทีมสร้าง" ออกจาก "ค่าข้อมูล" โดย escape ค่าข้อมูล (ใช้ `escapeHtml()` ที่มีอยู่แล้วใน pdf-generator) ก่อน interpolate ใน `buildPlotsSection`/`buildDocumentList`/`buildFeeSection`; เพิ่ม CSP ใน HTML template ของ PDF (`default-src 'none'`) และ/หรือรัน Puppeteer ด้วย flag กัน network/ไฟล์ (`--disable-features`, intercept request ปฏิเสธ non-data: URL); ทบทวนการใช้ RAW_SUFFIX `_SECTION` ให้รับเฉพาะ HTML ที่ระบบสร้างล้วน

---

### 🟡 SEC-002 — Logout ไม่ revoke token ฝั่ง server (refresh token อยู่ต่อ 7 วัน)
- **Severity:** Medium · **Confidence:** ✅
- **Area:** Security
- **Evidence:** `apps/backend/controllers/auth-controller/auth-session-security-handlers.js:455-486` — `logout()` ทำเพียง `res.clearCookie(...)` 3 ตัว + เขียน audit log แล้ว return; **ไม่เรียก** `blocklistAccessToken(req.user.jti)` และ **ไม่ revoke refresh token** ทั้งที่ infra มีอยู่และถูกใช้ใน path อื่น (เช่น password-change ที่ `:622-625` เรียก `blocklistAccessToken`)
- **Impact:** หลัง "logout" access token ยัง valid จนหมดอายุ (health 24h / provider 12h) และ **refresh token ยังอยู่ใน Redis allowlist 7 วัน** → สำเนา token ที่หลุด (ผ่าน XSS ดู SEC-003, เครื่องสาธารณะ, หรือดักจับก่อน logout) ยังออก access token ใหม่ได้ถึง 7 วันหลัง logout
- **Recommendation:** ใน `logout()` เรียก `blocklistAccessToken(req.user.jti, <ttl=exp>)` + revoke refresh token / invalidate session family (ฟังก์ชันมีอยู่แล้ว) — ทำให้ logout จบ session ฝั่ง server จริง

---

### 🟡 SEC-003 — เก็บ access + refresh JWT ใน localStorage (XSS-exfiltratable)
- **Severity:** Medium · **Confidence:** ✅
- **Area:** Security
- **Evidence:** `apps/web-app/src/lib/services/auth-service-session.ts:14,42` — `localStorage.getItem/setItem` สำหรับ `ACCESS_TOKEN` และ `REFRESH_TOKEN`
- **Impact:** แม้ backend ตั้ง httpOnly cookie (`setAuthCookies`, auth-controller.js:39-54) ที่ดีแล้ว แต่การ mirror token ลง localStorage ทำให้ JS อ่านได้ → ถ้าเกิด XSS (และ CSP ยังมี `unsafe-inline`/`unsafe-eval` ดู SEC-011) จะดึง refresh token (อายุ 7 วัน) ออกได้ และเมื่อรวมกับ SEC-002 token นั้นใช้ได้แม้ผู้ใช้ logout แล้ว
- **Recommendation:** ใช้ httpOnly cookie เป็นหลักสำหรับ web (มีอยู่แล้ว) และเลิก mirror token (โดยเฉพาะ refresh token) ลง localStorage; ถ้าต้องรองรับ Bearer สำหรับ mobile ให้แยก flow ไม่ให้ web เขียน token ลง storage ที่ JS อ่านได้

---

### 🟡 SEC-004 — Dependency advisories ค้าง 18 รายการ (1 high) — กระทบ CI security gate
- **Severity:** Medium · **Confidence:** ✅
- **Area:** Security / CI-CD
- **Evidence:** `pnpm audit` (รันจริง 2026-05-29) → **18 vulnerabilities: 1 high, 15 moderate, 2 low**
  - high: `rollup` `>=3.0.0 <3.30.0` — Arbitrary File Write via Path Traversal (build-time dep)
  - moderate (บางส่วน): `js-yaml` (prototype pollution), `ajv` (ReDoS), `ws` (mem disclosure), `qs` (DoS), `follow-redirects` (leak auth header on cross-domain redirect — ผ่าน axios), `nodemailer <=8.0.4` (SMTP injection — backend ใช้ `^7.0.12`), `postcss`/`ip-address` (XSS, build), `uuid <11.1.1`, `yaml`, `brace-expansion`, `smol-toml`
  - low: `pm2 <7.0.0` (ReDoS — root ใช้ `^6.0.13`), `nodemailer`
- **Impact:** ส่วนใหญ่เป็น transitive/dev/build-time, exploitability runtime ต่ำ (axios ยิง host hardcoded, email ปิดโดย default) — แต่ CI job `security` ใน `.github/workflows/ci.yml` รัน **`pnpm audit --audit-level=high` แบบ gating** → advisory `rollup` (high) จะทำให้ job นี้ **fail** (หรือมี exception/ค่า advisory ใหม่กว่าครั้งที่ CI รันล่าสุด — ตรวจสถานะ CI จริงไม่ได้ใน read-only)
- **Recommendation:** อัปเดต/override `rollup>=3.30.0`, `nodemailer>=8.0.4`, `pm2>=7`, และ moderate ที่อยู่ใน runtime path; พิจารณาเพิ่ม moderate เข้า gate หลังเคลียร์ high

---

### 🟡 SEC-005 — Mobile: dio LogInterceptor log Authorization header + body แบบไม่มีเงื่อนไข
- **Severity:** Medium · **Confidence:** ✅
- **Area:** Security / Mobile
- **Evidence:** `apps/mobile-app/lib/core/network/dio_client.dart:66-69` — `LogInterceptor(requestBody: true, responseBody: true)` (ไม่ gate ด้วย `kDebugMode`); request interceptor ที่ `:29-31` ใส่ `Authorization: 'Bearer $token'`
- **Impact:** token + body (credentials, PII เช่น เลขบัตร 13 หลัก) ถูกเขียนลง device log ทุก build รวม release → ข้อมูลส่วนบุคคลรั่วบนเครื่องผู้ใช้ (กระทบ PDPA) เทียบกับ `api_service.dart:47` ที่ gate logging ตาม mode แล้ว
- **Recommendation:** gate LogInterceptor ด้วย `if (kDebugMode)` และปิด `requestHeader`/`requestBody`/`responseBody` ใน release; หรือใช้ logger ที่ redact `Authorization`

---

### 🟡 ARC-001 — OpenAPI specs ครอบคลุม endpoint จริงเพียงส่วนน้อย (doc drift)
- **Severity:** Medium · **Confidence:** ✅ (นับได้) / ⚠️ (ตัวเลขไม่ได้ map 1:1)
- **Area:** Architecture
- **Evidence:** `openapi/*.yaml` (8 specs) มี operation ~**47** (`grep '^    (get|post|...)':`) ขณะ backend มี `router.METHOD(` ~**633** จุด (รวม alias `/api` + `/api/v1`) — แม้หักครึ่งสำหรับ alias ก็ยังเป็นสัดส่วนเล็ก; mobile generated client (`lib/generated/api/auth_health`) ที่สร้างจาก specs เป็น **dead code** (ดู MOB-003)
- **Impact:** สัญญา API ไม่สะท้อนระบบจริง → client/integrator ที่อิง spec จะพลาด endpoint ส่วนใหญ่; เสี่ยง drift เมื่อโค้ดเปลี่ยน
- **Recommendation:** ขยาย OpenAPI ให้ครอบคลุม (มี `swagger-jsdoc` อยู่แล้ว — ใช้ JSDoc annotation generate จาก route จริง) หรือระบุชัดว่า spec ครอบคลุมเฉพาะ public contract ใดบ้าง

---

### 🟡 MOB-001 — Mobile release ชี้ไปที่ localhost (ใช้ผิด getter) + port ไม่ตรง backend
- **Severity:** Medium · **Confidence:** ✅
- **Area:** Mobile / Architecture
- **Evidence:**
  - `apps/mobile-app/lib/core/network/dio_client.dart:12` — `static String get _baseUrl => ApiConfig.baseUrl;` (ใช้ `baseUrl` ไม่ใช่ `effectiveBaseUrl`)
  - `apps/mobile-app/lib/core/config/api_config.dart:25-40` — `baseUrl` คืน `http://localhost:3002/api` / `http://10.0.2.2:3002/api` เสมอ; `effectiveBaseUrl`(`:59`)/`productionUrl`(`:53` = `https://152.42.218.251/api`) **ไม่ถูกเรียกใช้โดย dio client**
  - backend ฟังที่ port **8000** (`server.js:76`, docker-compose) ขณะ mobile ใช้ **3002**
- **Impact:** release build ของแอป mobile ชี้ไป localhost (เครื่องตัวเอง) และ port ไม่ตรง backend → **ใช้งานกับ production ไม่ได้จริง**; `productionUrl` เป็น bare IP บน HTTPS (TLS cert ตาม IP มักไม่ผ่านถ้าไม่มี IP SAN)
- **Recommendation:** ให้ `DioClient` ใช้ `ApiConfig.effectiveBaseUrl`, แก้ port ให้ตรง backend/ผ่าน nginx, และตั้ง production URL เป็นโดเมนที่มี cert ถูกต้อง

---

### 🟡 MOB-003 — Mobile หลายฟีเจอร์ยัง placeholder/mock + dead code มาก (ขัด README "Production Ready")
- **Severity:** Medium · **Confidence:** ⚠️ (ประเมินโดย sub-agent + ผู้ตรวจ spot-verify บางจุด)
- **Area:** Mobile
- **Evidence (ตัวอย่าง spot-verified/ระบุ file:line):**
  - มี feature tree **ซ้ำสองชุด**: `lib/presentation/features/*` (active, wire ใน `lib/core/router/app_router.dart`) vs `lib/features/*` (ส่วนใหญ่ dead)
  - placeholder/mock: `application_detail_screen.dart:29-44` (`// TODO: Fetch from API` คืนค่า hardcoded), `application_tracking_screen.dart:17` (`// Mock Data`), `payment_screen.dart:46-55` (ข้าม slip upload — "mock/demo"), `staff_dashboard_screen.dart:156,318` (mock lists), `weather_widget.dart:9` (`'32°C'`)
  - offline sync stub: `lib/core/managers/sync_manager.dart:114-158` (`return true;` แทน API), `offline_provider.dart:133,248` (`// TODO: Implement actual API calls`)
  - dead code: generated client `lib/generated/api/auth_health` (ไม่ถูก import นอก generated/), `lib/features/qr_scanner` + `traceability` (มีโค้ดแต่ไม่ถูก route/instantiate)
- **Impact:** ความสามารถจริงของแอป mobile ต่ำกว่าที่ README สื่อ ("Production Ready v3.0"); มี dead code จำนวนมาก (สับสน/ภาระ maintain)
- **Recommendation:** ทำ feature ที่ค้างให้เสร็จหรือซ่อน entry point, ลบ tree ที่ตายแล้ว (เลือก `presentation/features` เป็น canonical), ปรับ README ให้ตรงสถานะจริง

---

### 🟡 CICD-001 — CI security gate (`pnpm audit --audit-level=high`) จะ fail จาก rollup high
- **Severity:** Medium · **Confidence:** ⚠️ (อนุมานจากผล audit; สถานะ CI run จริงตรวจไม่ได้ใน read-only)
- **Area:** CI-CD
- **Evidence:** `.github/workflows/ci.yml` job `security` → `run: pnpm audit --audit-level=high` (gating); ผล `pnpm audit` ปัจจุบันมี 1 high (`rollup`)
- **Impact:** pipeline จะแดงที่ job security (หรือมี mechanism ข้ามที่ยังไม่พบ) — บล็อก deploy ตาม design ที่ตั้งใจ
- **Recommendation:** เคลียร์ advisory high (ดู SEC-004) แล้ว CI จะผ่าน — ถือเป็น "ระบบ gate ทำงานถูกต้อง" เพียงแต่ debt ยังไม่ถูกล้าง

---

### 🟢 SEC-006 — Input sanitization แบบ regex "ลบทิ้ง" เป็น anti-pattern (bypass ได้ + ทำลายข้อมูล)
- **Severity:** Low · **Confidence:** ✅
- **Area:** Security / Quality
- **Evidence:** `apps/backend/middleware/sanitize-input.js:14-29,42-62` — strip pattern จาก **ทุก string field** ใน body/query รวม `/--\s/g`, `/\/\*[\s\S]*?\*\//g`, `<script>`, `on\w+=`
- **Impact:**
  1. **bypass ได้:** single-pass `replace` ทำ payload ซ้อนกลับมาได้ เช่น `<scr<script>ipt>` → เหลือ `<script>`
  2. **ทำลายข้อมูลจริง:** ชื่อ/ที่อยู่/รหัสผ่านที่บังเอิญมี `-- ` หรือ `/* */` ถูกตัดเงียบๆ
  3. **false sense of security:** ตัวกรองนี้ไม่ได้อุดช่อง SEC-001 (ไม่กรอง `<img>/<iframe>`); การป้องกันจริงอยู่ที่ Prisma (parameterized) + React escaping
- **Recommendation:** เลิกพึ่ง blanket-mutation; validate แบบ context-specific (zod ที่มีอยู่) + escape ตอน output ตาม context; ถ้าต้องคง ให้ทำเป็น *detect+reject* ไม่ใช่ *silent strip*

---

### 🟢 SEC-007 — CORS อนุญาต `http://127.0.0.1:<any port>` พร้อม credentials ทุก environment
- **Severity:** Low · **Confidence:** ✅
- **Area:** Security
- **Evidence:** `apps/backend/server.js:176` — `if (normalizedOrigin.startsWith('http://127.0.0.1:')) { return callback(null, true); }` (อยู่ก่อน allowlist check, ใช้ทั้ง prod/dev) + `credentials: true` (`:182`)
- **Impact:** หน้าเว็บที่รันบน 127.0.0.1 ของเหยื่อ (เช่น dev server/แอปที่ติดตั้งในเครื่อง) ยิง credentialed request ได้ — ความเสี่ยงต่ำ (ต้องมีหน้าเพจรันบน loopback ของเหยื่อ) แต่ไม่ควรเปิดใน production
- **Recommendation:** จำกัดข้อยกเว้น 127.0.0.1 ให้เฉพาะ non-production

---

### 🟢 SEC-008 — Auth rate limit ถูกข้ามถ้ามี env `CI=true`
- **Severity:** Low · **Confidence:** ✅
- **Area:** Security
- **Evidence:** `apps/backend/server.js:191-196` — `shouldSkipAuthRateLimit()` คืน true เมื่อ `NODE_ENV=test` **หรือ `CI=true`** หรือ `DISABLE_AUTH_RATE_LIMIT=true`
- **Impact:** ถ้า `CI` env หลุดไปอยู่ใน runtime production จะปิด brute-force protection ของ login/register
- **Recommendation:** ผูกการข้ามกับ `NODE_ENV !== 'production'` เท่านั้น อย่าใช้ `CI` เป็นเงื่อนไขใน production path

---

### 🟢 SEC-010 — E2E backdoor "fail-open" บน NODE_ENV ที่ไม่ใช่ production
- **Severity:** Low · **Confidence:** ✅
- **Area:** Security
- **Evidence:** `apps/backend/routes/api/index.js:76-78` — mount `/e2e` **เฉพาะเมื่อ `NODE_ENV !== 'production'`** (ดีมากสำหรับ prod); แต่ controller gate `e2e-controller.js:17` คืน 403 เฉพาะเมื่อ `NODE_ENV === 'production'` → บน staging/NODE_ENV ที่ unset endpoint สร้าง user/farm/lot จะเปิด
- **Impact:** ใน prod **ปลอดภัย** (ไม่ mount เลย) แต่บน staging/QA/เครื่องที่ NODE_ENV ไม่ตั้งค่า endpoint สร้างข้อมูลทดสอบเปิดอยู่ (เหมาะกับ test harness แต่เสี่ยงถ้า env นั้นมีข้อมูลจริง/เปิด public)
- **Recommendation:** เปลี่ยน gate เป็น allowlist (`NODE_ENV === 'development' || 'test'`) แทน "บล็อกเฉพาะ production"

---

### 🟢 SEC-011 — CSP ใช้ `script-src 'unsafe-inline' 'unsafe-eval'`
- **Severity:** Low · **Confidence:** ✅
- **Area:** Security
- **Evidence:** `apps/web-app/src/middleware.ts:83` — `"script-src 'self' 'unsafe-inline' 'unsafe-eval'"` (มี comment ระบุเป็น tech debt รอ nonce migration "Phase A6")
- **Impact:** ลดประสิทธิภาพ CSP ในการกัน XSS — ถ้ามี XSS การมี `unsafe-inline` ทำให้ inline script ทำงานได้ (รวมการขโมย token จาก localStorage, ดู SEC-003)
- **Recommendation:** migrate ไป nonce/hash-based script-src ตามที่วางแผนไว้

---

### 🟢 ARC-002 — web-app ประกาศ dependency Prisma แต่ไม่ได้ query DB (vestigial)
- **Severity:** Low · **Confidence:** ✅
- **Area:** Architecture / Quality
- **Evidence:** `git grep '@prisma/client|PrismaClient' apps/web-app/src` → **0 รายการ**; แต่ `apps/web-app/package.json` มี `@prisma/client`+`prisma` และ `Dockerfile:33` รัน `prisma generate`
- **Impact:** สถาปัตยกรรมจริงสะอาด (web-app เป็น thin BFF/proxy → Express เป็น data authority เดียว — **แก้สมมติฐาน "two backends" ใน Phase 0**) แต่มี dependency/ขั้นตอน build ที่ไม่ได้ใช้ → เพิ่ม attack surface/เวลา build โดยไม่จำเป็น
- **Recommendation:** ถ้าไม่ได้ใช้ type จาก generated client จริง ให้ลบ prisma deps + ขั้น generate ออกจาก web-app

---

### 🟢 ARC-003 — `prisma-database.js` เรียก `process.exit(1)` ตอน module-load
- **Severity:** Low · **Confidence:** ✅
- **Area:** Architecture / Tests
- **Evidence:** `apps/backend/services/prisma-database.js:34-39` — `if (!DATABASE_URL) { logger.error(...); process.exit(1); }` ที่ระดับ module load
- **Impact:** anti-pattern — การ `require` module นี้ (ตรงหรือผ่าน chain เช่น audit-logger) จะ **ฆ่า process** ถ้าไม่มี `DATABASE_URL` → ทำให้ unit test ที่เป็น logic ล้วนรันไม่ได้จนกว่าจะตั้ง env (ดู Phase 5); สมมติ "ONLY in Docker" ผูกแน่นกับ deployment เดียว
- **Recommendation:** ย้าย guard ออกจาก module-load ไปไว้ใน init/connect function ที่เรียกตอน bootstrap; โยน error ให้ caller จัดการแทน `process.exit`

---

### 🟢 ARC-005 — Prisma relation JournalEntry↔Invoice ที่ DB สร้าง FK ไม่ได้ (text↔uuid) — ✅ แก้แล้ว
- **Severity:** Low · **Confidence:** ✅
- **Area:** Architecture / Data model · *(พบระหว่างงานทำ CI ให้เขียว — ไม่ใช่ dead code: ระบบบัญชีถูก wire ใช้งานจริง ดู §2.x)*
- **Evidence:** `billing.prisma` เดิมประกาศ relation `JournalEntry.invoice ↔ Invoice.journalEntries` แต่ `Invoice.id` = `String @default(uuid())` (Postgres **text**) ส่วน `JournalEntry.invoiceId` = `String? @db.Uuid` (Postgres **uuid**) → Postgres สร้าง FK ระหว่าง text↔uuid **ไม่ได้** → FK นี้ไม่เคยมีจริงใน DB (ยืนยันด้วย `prisma migrate diff` = drift); โค้ด backend ไม่เคย traverse relation นี้ (`journalEntry.invoice` / `invoice.journalEntries` = 0 usage)
- **Impact:** relation ที่ประกาศไว้ไม่ทำงาน — ไม่มีการบังคับ referential integrity ระดับ DB ระหว่าง `journal_entries`↔`invoices` (เกิด orphan ได้) + เป็นสาเหตุหนึ่งที่ทำให้ **Migration Drift gate** ผ่านไม่ได้
- **Status:** ✅ **แก้แล้ว** — ลบ relation ทั้งสองฝั่ง คง `invoiceId` ไว้เป็น scalar (branch `claude/pensive-fermi-10tuY`); `migrate diff --exit-code` = 0
- **Recommendation:** ถ้าต้องการ FK จริง ให้ทำชนิดคอลัมน์ให้ตรงกันก่อน (เปลี่ยน `Invoice.id` เป็น `@db.Uuid` หรือ `invoiceId` เป็น text) แล้วค่อยประกาศ relation ใหม่

---

### 🟢 MOB-004 — Mobile มี backend URL 2 ชุด + token key 2 ชื่อ
- **Severity:** Low · **Confidence:** ✅
- **Area:** Mobile
- **Evidence:** `dio_client.dart` ใช้ `auth_token` + `ApiConfig.baseUrl`; `apps/mobile-app/lib/core/services/api_service.dart:13,105` ใช้ `baseUrl:'https://api.dtam.go.th'` + token key `jwt_token` (ใช้โดย QR scanner ที่ตายแล้ว + offline_provider stub)
- **Impact:** ความไม่สอดคล้อง — สับสนเรื่อง source of truth ของ auth/endpoint
- **Recommendation:** รวมเป็น client/URL/token-key เดียว ลบ `api_service.dart` ถ้าไม่ใช้

---

### 🟢 CICD-002 — README อ้าง script ที่ไม่มีจริง (`scripts/backup-db.js`)
- **Severity:** Low · **Confidence:** ✅
- **Area:** CI-CD / Docs
- **Evidence:** `README.md:69` → `node scripts/backup-db.js` แต่ไฟล์ไม่มี; ของจริงคือ `apps/backend/scripts/backup-postgresql.js` (อ้างใน `apps/backend/package.json` `"backup"`) — *(หมายเหตุ: gate scripts อื่นที่ README อ้าง เช่น `run-regression-gate.js`, `gate:auth-hardening`, `run-full-journey-suite.js` **มีจริงทั้งหมด ✅**)*
- **Recommendation:** แก้ path ใน README

---

### 🟢 CICD-003 — Test gate รัน jest แค่ subset ที่คัดไว้ → "Test ✅" สื่อ coverage มากกว่าที่รันจริง
- **Severity:** Low · **Confidence:** ✅
- **Area:** CI-CD / Test coverage · *(พบระหว่างงานทำ CI ให้เขียว)*
- **Evidence:** Test gate (`ci.yml:223-225`) และ prod release-test-gate (`production.yml:90`) รัน `jest --testPathPattern '__tests__/(simple|tenant-context|crypto-service|security-nonce|unit/applications-draft|unit/provider-legacy)' --no-coverage` เท่านั้น — comment `ci.yml:211-214` ระบุเองว่า *"Full jest suite has known pre-existing failures (tracked separately as tech debt)"* → `__tests__/integration/` **ไม่ถูกรันใน gate นี้** (ทั้ง dir มีเพียง `reports.test.js` ไฟล์เดียวที่รันแยกใน BI Contract Gate ผ่าน `--runTestsByPath`)
- **Impact:** badge "Test ✅" สะท้อน coverage จริงน้อยกว่าที่สื่อ; ตัวอย่างรูปธรรม — `__tests__/integration/cross-system-audit-to-cert-flow.test.js` **โหลดไม่ได้เลย** (`Cannot find module './helpers/test-db-setup'`; `git ls-files .../helpers/*` = ว่าง) แต่ไม่มี gate จับเพราะไม่ได้รัน — *(หมายเหตุ: รันในเครื่องจริง integration ผ่าน 22/23 suites / 163 tests → ชุดที่ถูกตัดออกมีทั้งของดีและของพัง ปนกัน)*
- **Recommendation:** ทยอยเพิ่ม suite ที่ stabilise แล้วเข้า gate; ซ่อม/ลบ `cross-system-audit-to-cert-flow.test.js` (helper หาย); จัดทำ known-failing list ให้ชัดเพื่อกันการเข้าใจผิดว่า "Test เขียว = ครอบคลุม"

---

### 🟢 QUAL-001 — สัญญาณ quality เล็กน้อย (eslint-disable / console.log / TODO)
- **Severity:** Low · **Confidence:** ✅
- **Area:** Quality
- **Evidence:** `eslint-disable` 120 จุดใน `apps/`, `console.log` 13 จุดใน backend request path (services/routes/controllers/middleware), TODO/FIXME/HACK 192 จุด (29 ใน backend core) — *(เทียบ codebase ~370k LOC ถือว่า density ต่ำ)*; ฝั่ง TS แข็งแรงมาก: `: any` เพียง **5**, `@ts-expect-error` เพียง **1**
- **Impact:** ภาระ maintain เล็กน้อย; `console.log` ใน request path เลี่ยง structured logger (winston) ที่ใช้อยู่
- **Recommendation:** แทน `console.log` ด้วย logger, ทยอยลด eslint-disable; โดยรวมคุณภาพโค้ดดี

---

### ⚪ Info findings

| ID | สรุป | Evidence |
|---|---|---|
| **SEC-009** | short JWT/encryption secret ใน prod แค่ `console.warn` ที่ `jwt-security.js:69-75` + `env-validator.js:102-112` **แต่ถูก backstop** ด้วย `boot-secret-guard.js` (`server.js:28` → `validateSecretsForEnvironment('production')` คืน `TOO_SHORT` → `exit(1)`) จึง **mitigated** | `config/boot-secret-guard.js:120-167`, `secrets.js:656` |
| **SEC-012** | การเทียบ secret ไม่ constant-time (CSRF `csrf-middleware.js:103` ใช้ `!==`; cron `cron.js:96` ใช้ `===`) + cron รับ secret ผ่าน query param (`req.query.secret`, `cron.js:95`) อาจติด access log | ดู file:line |
| **SEC-013** | mobile `productionUrl` เป็น bare IP `https://152.42.218.251/api` (TLS ตาม IP) + dev ใช้ cleartext `http://` | `api_config.dart:53` |
| **ARC-004** | มี `getSecret()` 2 ตัว: ตัวแข็งแรง (`config/secrets.js`) กับตัวอ่อน (`config/env-validator.js:195-201`) อาจสับสนว่าใช้ตัวไหน | ดู file:line |
| **QUAL-002** | version ไม่ตรง: root `package.json` v**2.0.0** vs sub-apps + README v**3.0.0** | `package.json:4` |
| **QUAL-003** | README เปิดเผย dev cred `gacp2024`/`Test1234` — ใช้เฉพาะ dev/CI/seed (ไม่ใช่ production path; production บังคับ secret จริงผ่าน secrets catalog) แต่ควรถอด/หมุนเปลี่ยน | `README.md:20,73-74`; ใช้ใน `backend-qc-golden.yml:20` (CI ephemeral), `seed-test-health-users.js` |

---

## 2.x ✅ Verified Strengths (สิ่งที่ทำได้ดีจริง — ยืนยันจากโค้ด)

> ระบุไว้เพื่อความเป็นธรรม — audit แบบอิงหลักฐานต้องรายงานทั้งจุดอ่อนและจุดแข็ง

- **Secret management แบบ fail-closed** — `config/secrets.js` (catalog + minLength + ไม่มี auto-gen crypto key + dev fallback แยก dev/test เท่านั้น) + `boot-secret-guard.js` ปฏิเสธ boot ใน prod ถ้า secret ขาด/สั้น/เป็น sentinel
- **JWT แข็งแรง** — `jwt-security.js:131` pin `algorithms:[HS256]` (กัน alg-confusion/`none`), jti ทุก token + Redis revocation (allowlist refresh + blocklist access + session-family + reuse detection), secret แยก namespace health/provider, fail-fast ตอน module-load ใน prod (`:227-232`)
- **Login security** — bcrypt 12 rounds, account lockout 5 ครั้ง/15 นาที, lookup ด้วย hash (ไม่มี plaintext), MFA challenge (opaque + signed challenge token), `sanitizeUserPayload` (`auth-controller.js:60-86`) ตัด password/hash/2FA secret ออกจาก response
- **Cookies** — `httpOnly:true, secure, sameSite:'lax'` (`auth-controller.js:39-54`)
- **Object-level authz (กัน IDOR)** — query scope ด้วย `healthId`: `findApplicationByIdForHealth(id, healthId)` → `prisma.application.findFirst({ where:{ ...healthId } })` (`application-applicant-query-methods.js:62-65`) *(spot-check; ดูข้อจำกัดในหัวข้อ 4)*
- **ไม่มี SQLi ใน request path** — routes/services ใช้เฉพาะ `prisma.$queryRaw` **tagged template** (parameterized); `$queryRawUnsafe` มีเฉพาะใน `scripts/` (ops) ด้วย SQL คงที่
- **Next.js proxy ไม่มี SSRF** — `[...path]/route.ts:48` ต่อ path เข้ากับ host คงที่ `INTERNAL_BACKEND_URL`; backend **ไม่ trust** header `X-User-ID` (grep = ว่าง)
- **Infra hardening** — container non-root ทั้งสอง (`apps/backend/Dockerfile:80,101` `USER gacp`; `apps/web-app/Dockerfile:57,77` `USER nextjs`), prod compose ผูก port `127.0.0.1` ทั้งหมด, prod TLS1.2/1.3 + HSTS preload (`deploy/nginx/gacp-platform.conf:39-56`), nginx security headers ครบ, Next.js CSP + patch **CVE-2025-29927** (`middleware.ts:115-119`)
- **CI/CD จริง** — `ci.yml` (~19 jobs) รัน lint/tsc/jest+coverage/migration-drift(`prisma migrate diff`)/boot server+regression/playwright e2e/`pnpm audit` gating; secret ใช้ `${{ secrets.* }}` (ไม่ hardcode ยกเว้น CI postgres ephemeral)
- **Schema แข็งแรง** — 93 models, **285 `@@index`**, 81 `@unique`, **103 `onDelete`**, 72 migrations
- **Tests จริงและเขียว** — backend **unit 3,511 ข้อผ่านทั้งหมด** (185 suites); logic ความปลอดภัยถูก test (secret length, SENTRY gate, RBAC, XFF spoof)
- **TS discipline สูง** — `: any` แค่ 5, `@ts-expect-error` แค่ 1 ใน ~140k LOC

---

## 3. Prioritized Remediation Backlog (impact × effort)

| ลำดับ | Finding | Impact | Effort | เหตุผล |
|---|---|---|---|---|
| 1 | **SEC-001** (PDF injection/SSRF) | สูง | ต่ำ-กลาง | escape ค่าใน 3 builder + ปิด network ของ Puppeteer — แก้ไม่ยาก ผลกระทบสูงสุด |
| 2 | **SEC-002 + SEC-003** (logout + localStorage token) | สูง | ต่ำ | เรียก revoke ที่มีอยู่แล้วใน logout + เลิก mirror refresh token |
| 3 | **SEC-004 / CICD-001** (deps high → CI gate) | กลาง | ต่ำ | bump rollup/nodemailer/pm2 ปลด CI ที่อาจแดง |
| 4 | **SEC-005** (mobile token logging) | กลาง | ต่ำมาก | gate LogInterceptor ด้วย kDebugMode |
| 5 | **MOB-001** (release ชี้ localhost) | สูง (mobile ใช้ไม่ได้จริง) | ต่ำ | สลับไป `effectiveBaseUrl` + แก้ port/โดเมน |
| 6 | **SEC-008 / SEC-010 / SEC-007** (NODE_ENV/CI fail-open) | กลาง | ต่ำ | เปลี่ยนเป็น allowlist `development/test` |
| 7 | **SEC-011** (CSP unsafe-inline) | กลาง | กลาง-สูง | nonce migration (วางแผนไว้แล้ว) |
| 8 | **MOB-003** (mobile placeholder/dead code) | กลาง | สูง | ทำฟีเจอร์ให้เสร็จ/ลบ dead tree + แก้ README |
| 9 | **ARC-001** (OpenAPI drift) | กลาง | กลาง | generate spec จาก JSDoc |
| 10 | **ARC-002/003/004, QUAL-001/002/003, SEC-009/012/013, CICD-002** | ต่ำ | ต่ำ | cleanup/doc/consistency |

---

## 4. "ตรวจสอบไม่ได้" List (❓ / ต้องการอะไรเพิ่ม)

| รายการ | เหตุผล | ต้องการเพื่อตรวจ |
|---|---|---|
| Integration `__tests__/integration` **✅ รันแล้วภายหลัง** (ตอนทำ CI เขียว): **22/23 suites · 163 tests ผ่าน** — 1 suite พังเพราะ helper หาย (ดู CICD-003) · *Playwright e2e + coverage% ยังไม่รันในเครื่อง แต่ E2E gate บน CI เขียว* | Postgres+Redis จริง (พร้อมแล้ว) | (playwright) ติดตั้ง browsers |
| **Flutter build + runtime** ของแอป mobile | ไม่มี Flutter/Dart SDK ในเครื่อง | ติดตั้ง Flutter SDK แล้ว `flutter build` / `flutter test` |
| สถานะ **CI run จริง** **✅ verify แล้วภายหลัง** (เข้าถึง Actions API ได้) | PR #294 — หลังการแก้รอบนี้ functional gate เขียวครบ (Migration Drift / Runtime Readiness / ERP Regression / QC Golden / Test / E2E / Security Audit / Auth Hardening ฯลฯ) | — |
| **IDOR ครบทุก endpoint** | spot-check เฉพาะ applications read path (scope ด้วย healthId ✅); มี ~633 route handlers | ตรวจ authz รายเส้นทาง โดยเฉพาะ finance/certificate/audit/payment-slip |
| **OpenAPI ↔ code diff รายตัว** | นับจำนวน (47 vs ~633) แต่ไม่ได้ map 1:1 | diff ทีละ operation |
| **Secret scan ทั้ง git history** | ไม่มี `gitleaks`; ตรวจเฉพาะ tree ปัจจุบัน (ไม่มี `.env` จริง commit, `.gitignore` ครอบคลุม) | `gitleaks detect` / `git log -p` ทั้งประวัติ |
| **SEC-001 escalate เป็น local-file read** (`file://`) | ขึ้นกับพฤติกรรม Chromium ต่อ origin ของ `setContent` | ทดสอบ payload `<iframe src=file://>` ใน environment ควบคุม |
| **Production "host nginx"** (นอก compose) | `deploy/nginx/*.conf` อยู่ใน repo (มี TLS+HSTS ✅) แต่ config จริงบนเครื่อง host ตรวจไม่ได้ | เข้าถึงเครื่อง production |

---

## 5. Appendix: Commands Run (สรุป)

> เครื่องมือที่ **ไม่มี**: `tokei`/`cloc`/`gitleaks`/`flutter`/`dart` · มี: node v22.22.2, pnpm 8.15.0, docker, jq · network registry/advisory เข้าถึงได้

| # | คำสั่ง (ย่อ) | ผลสรุป |
|---|---|---|
| 1 | `ls -la` / `git ls-files \| wc -l` / per-ext counts | 3,279 ไฟล์; backend ~196k LOC JS, web ~142k TS/TSX, mobile ~28k Dart |
| 2 | `cat .claude/commands/audit-run.md` | skill เขียนไฟล์/spawn agent → ขัด READ-ONLY → ไม่เรียกใช้ |
| 3 | `git log --oneline` / churn | 50 commits, AI-agent-driven (Ralph Loop) |
| 4 | อ่าน `secrets.js`,`env-validator.js`,`boot-secret-guard.js`,`jwt-security.js`,`server.js`,`sanitize-input.js`,`csrf-middleware.js` | ยืนยัน secret/JWT/middleware แข็งแรง |
| 5 | `git grep gacp2024 / ENABLE_E2E_ROUTES / x-user-id / $queryRaw*` | gacp2024=dev/CI; e2e ไม่ mount ใน prod; X-User-ID ไม่ถูก trust; raw SQL ปลอดภัย |
| 6 | `pnpm audit` (+`--json\|jq`) | 18 vulns (1 high rollup, 15 mod, 2 low) |
| 7 | อ่าน proxy `[...path]/route.ts`, `middleware.ts`, nginx confs, Dockerfiles, prod compose | no SSRF; CSP+HSTS+CVE patch; non-root; port localhost-only |
| 8 | อ่าน PDF `application-template-service.js` + `pdf-generator.service.js` | **ยืนยัน SEC-001** (raw `_SECTION` + unescaped user input + puppeteer networkidle0) |
| 9 | `pnpm install --frozen-lockfile --ignore-scripts` + `prisma generate` | สำเร็จ (22.8s) |
| 10 | `npx jest` (auth/rbac/jwt/csrf subset) | **129/129 ผ่าน** |
| 11 | `npx jest __tests__/unit` (DATABASE_URL dummy) | **3,511/3,511 ผ่าน** (185 suites) |
| 12 | อ่าน mobile `dio_client.dart`,`api_config.dart` | ยืนยัน MOB-001, SEC-005 |
| 13 | prisma schema grep (`@@index`,`onDelete`,...) + route/openapi counts | 93 models/285 index; 47 spec ops vs 633 routes |

---
*จบรายงาน — เฟส audit เป็น READ-ONLY ไม่มีการแก้/commit/push; รอการอนุมัติก่อนดำเนินการแก้ไขใดๆ*
