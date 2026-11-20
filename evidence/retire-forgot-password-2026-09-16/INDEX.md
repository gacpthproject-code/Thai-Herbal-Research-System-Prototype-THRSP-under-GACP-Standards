# retire-forgot-password — evidence pack (Tier C · auth) — 2026-09-16

มติ operator (2026-09-16, แชต):
1. "เราไม่มีระบบ forgot ไม่ว่าจะไปอีเมลหรือ sms ทำการเก็บกวาด และ clean ให้สะอาด"
2. "ดำเนินการตามที่คุณแนะนำ" (รอบก่อนเสนอ: ปลดหน้า forgot-password และเก็บ nodemailer/SMTP ที่ค้าง)

branch: `chore/retire-forgot-password` (จาก `origin/main` 00bb27b8) · merge + deploy = operator (tier-check = C)

## ข้อเท็จจริงที่ใช้ตัดสินขอบเขต

| ตรวจ | ผล | ผลต่องานนี้ |
|---|---|---|
| `GET https://demo.gacpth.com/api/auth/idp/providers` (และ staging) 2026-09-16 | `local` enabled · `healthid`, `providerid`, `thaid` = `coming_soon` | **ไม่แตะ password login** — เป็นทางเข้าเดียวที่เปิดอยู่ ปิดแล้วทุกคนเข้าไม่ได้ · หน้า security ต้องไม่บอกว่า หมอพร้อม/ThaID ยืนยันตัวตนให้แล้ว |
| หน้า `/forgot-password` บน main | ส่ง `{phone}`/`{email}` แต่ schema ต้องการ `identifier` → 400 ทุกครั้ง | ไม่เคยรีเซ็ตให้ใครได้จริง ถอดทั้งเส้นไม่ทำให้ใครเสียทางเข้า |
| `force-password-reset` ของเจ้าหน้าที่ | ออก token ให้เจ้าหน้าที่ยื่นให้ผู้ใช้ ใช้ที่ `POST /auth/health/reset-password/:token` · **ไม่มีหน้าเว็บให้กรอก token** | คงไว้ (ไม่ใช่ระบบลืมรหัสผ่าน) และรายงานเป็นเรื่องที่ต้องตัดสิน |

## RED → GREEN

| artifact | อะไร | ผล |
|---|---|---|
| `red-backend.txt` | guard `no-self-service-password-reset.test.js` กับโค้ด main | **11 failed / 11** — ทุกข้อตกด้วย assertion ที่ตั้งใจ (route, handler/service/schema, remediation, web, mobile, OpenAPI, nodemailer, secrets row, env templates, template engine, error codes) |
| `red-webapp.txt` | `src/__tests__/no-forgot-password.test.ts` กับโค้ด main | **5 failed / 5** (sitemap, route constant, public route, page file, ลิงก์หน้าเข้าสู่ระบบ) |
| `red-webapp-security-copy.txt` | เทสหน้า security ที่เพิ่มว่าห้ามอ้าง หมอพร้อม/ThaID ว่าใช้ได้แล้ว | **1 failed** / 3 passed |
| `green-backend.txt` | guard + เทสที่แตะ 9 suites + eslint ไฟล์ที่แก้ | 112/112 · ESLINT_BACKEND_EXIT=0 |
| `green-webapp.txt` | guard + หน้า security + โฟลเดอร์เทสหน้าเข้าสู่ระบบ + eslint + `tsc --noEmit` | 52/52 · ESLINT_WEBAPP_EXIT=0 · TSC_EXIT=0 (รันซ้ำหลังย้าย `.next/types` เก่าที่ gitignore ออก — ไฟล์ generate จาก build เก่ายังชี้หน้าที่ลบ) |
| `test-output.txt` | full backend unit suite (ไม่ตัด) | **768/768 suites · 9,843/9,843 tests** · EXIT=0 |
| `webapp-test-output.txt` | full web-app jest (ไม่ตัด) | **381/381 suites · 3,100/3,100 tests** · EXIT=0 |
| `probe-results.json` | probe ชุดเดียวกับงานก่อนหน้า บน 26a25b4d | ratchet/no-secret/no-skip/tier-check/deploy-drift PASS · gate-attestation FAIL จนกว่า attestation ของ commit นี้จะลง · main-attestation-audit FAIL เดิม (commit เก่าบน main) |
| `ratchet-before-after.txt` | ตัวนับจาก probe | hardcode 25 · todo 53 · env-direct 102 · dup-source 0 — ไม่ขึ้น |
| `evidence/gate/<sha>.json` | full-gate attestation (commit ท้ายสุด) | verdict + รายการ check เทียบ baseline ของ main |

## view-pack (HARNESS.md §4.4)

image frontend จริงรันในเครื่อง ไม่มี backend ไม่มีบัญชีจริง กดด้วย Playwright · หน้า `/health/*` เข้าด้วย cookie ที่มีแค่ role
(middleware ถอด role เท่านั้น) · ทุกภาพมีป้าย build SHA + เวลา UTC · สคริปต์ `screenshots/viewpack-forgot.js` ·
ค่าที่อ่านจากหน้าจอจริงอยู่ใน `screenshots/{before,after}-checks-*.json` · trace (ไม่อยู่ใน git เพราะ `.gitignore` ตัด `*.zip`)
เก็บบนเครื่อง 43.134.175.51 ที่ `/home/ubuntu/work/state/retire-forgot-password-2026-09-16-trace/`

| ฉาก | ก่อน: 00bb27b8 (main ที่รันอยู่บน demo/staging) | หลัง: 26a25b4d |
|---|---|---|
| หน้าเข้าสู่ระบบผู้ขอรับรอง | ลิงก์ "ลืมรหัสผ่าน?" 1 ลิงก์ (`before-01-health-login-*.png`) | ไม่มีลิงก์ ไม่มีคำว่าลืมรหัสผ่าน (`after-01-*`) |
| เปิด `/forgot-password` ตรง ๆ | HTTP 200 หน้าเสนอส่งลิงก์ทาง SMS หรืออีเมล (`before-02-*`) | HTTP 404 หน้าไม่พบ (`after-02-*`) |
| `/health/profile/security` | อ้างว่า "ยืนยันตัวตนด้วย หมอพร้อม หรือ ThaID" (`before-03-*`) | บอกว่าเข้าด้วยเลขบัตร + รหัสผ่าน หมอพร้อม/ThaID ยังไม่เปิดใช้ ไม่มีการรีเซ็ตทางอีเมลหรือ SMS (`after-03-*`) |

## สิ่งที่เปลี่ยน

- **backend**: ถอด `POST /auth/health/reset-password` (ขอรีเซ็ต), `resetPasswordSchema`, `passwordResetRequestSchema`/`passwordResetSchema`
  (ไม่มี caller), `requestPasswordReset` ใน controller/service; `INVALID_PASSWORD.remediation` เลิกชี้ `/api/auth/forgot-password`;
  คอมเมนต์ limiter/audit/profile ที่ยังพูดถึงการรีเซ็ตทางอีเมล
- **web**: ลบหน้า `(auth)/forgot-password`, ลิงก์ "ลืมรหัสผ่าน?", `FORGOT_PASSWORD_ROUTE`, public route, sitemap, i18n `forgotPassword`,
  รายการหน้าใน `e2e/carpet-pages.spec.ts`; หน้า `/health/profile/security` บอกตามจริงว่าเข้าด้วยเลขบัตร + รหัสผ่าน หมอพร้อม/ThaID ยังไม่เปิดใช้
- **mobile**: ลบ `forgot_password_screen.dart` (ไม่เคยถูก route), route `/forgot-password`, ปุ่ม "ลืมรหัสผ่าน?" สองหน้า,
  generated client `auth_health` ส่วน `requestPasswordReset`/`verifyEmail`/`RequestPasswordResetRequest` (แพ็กเกจนี้ไม่มีใคร import)
- **OpenAPI** `openapi/auth-health.yaml`: ลบ `/request-password-reset` และ `/verify-email/{token}` (backend ไม่มี route นี้)
- **อีเมล/SMS ที่ค้าง**: `nodemailer` + override, แถว `SMTP_PASSWORD`, `services/email-template-engine.js` (ไม่มี require),
  error codes `NOT_PROVISIONED`/`INVALID_BODY`/`INVALID_RECIPIENT`/`INVALID_SUBJECT`, บล็อก EMAIL/SMTP/SMS ใน `.env*.example`,
  `scripts/security/*`, `scripts/deploy/local-deploy.ps1`, `docker-compose.qa.yml`
- **docs**: คู่มือผู้ใช้ `.md` และ `.docx` (บท 1.3 "เข้าสู่ระบบไม่ได้" ติดต่อเจ้าหน้าที่, ลบภาพหน้ากู้คืนรหัสผ่าน, เลื่อนเลขภาพ 6–61 เป็น 5–60;
  `.docx` แก้ XML ตรง ๆ เพราะสคริปต์ที่สร้างไม่อยู่ใน repo), FAQ ผู้ขอรับรอง, `platform-urls`, `canonical-inventory`,
  `flow-runtime-matrix`, `ARCHITECTURE.md`, `docs/api/error-codes.md` (แก้เฉพาะจุด — generate ใหม่ทั้งไฟล์ได้ 1,700 บรรทัดเพราะไฟล์ค้างมานาน)
- `BACKLOG-FOUND.md`: ปิด 2 รายการ (error codes 4 ตัว, แถว `SMTP_PASSWORD`)

## ไม่ได้แตะ (ตั้งใจ)

- **password login** (`local`) — ทางเข้าเดียวที่เปิดบน demo วันนี้
- **token รีเซ็ตที่เจ้าหน้าที่ออก** + `POST /reset-password/:token` + `passwordResetLimiter` — ไม่มีหน้าให้ผู้ใช้กรอก token ต้องให้ operator ตัดสินว่าจะสร้างหน้า หรือถอดทั้งเส้น
- consent "รับข่าวสารทาง SMS" ใน `middleware/consent-manager.js` — เป็นวัตถุประสงค์ PDPA ที่มีบันทึกความยินยอมผูกอยู่
- `monitoring/alertmanager` / Grafana SMTP — การแจ้งเตือนฝั่ง ops ไม่ใช่ผู้ใช้ และ alertmanager ไม่ได้รันอยู่
- รายงาน/เอกสารลงวันที่ (`docs/audit*`, `reports/*`, `CHANGELOG.md`, `test-reports/api-inventory.json`) — เป็นประวัติ
- `openapi/auth-health.yaml` path `/api/auth/health/reset-password` (token ใน body) ไม่ตรงกับ route จริง `/:token` มาก่อนแล้ว
