# retire-email-auth — evidence pack (Tier C · auth) — 2026-09-15

มติ operator (2026-09-15, แชต): "เราไม่มีล็อกอินด้วย email หรือ 2FA แบบ email แล้ว ระบบนี้ไม่ได้ใช้จริงด้วย
ต่อไปเราใช้แค่ หมอพร้อม กับ ThaiD" → ปลดปัจจัยที่สองแบบอีเมลและ SMTP email service ออกทั้งชุด
(ไฟล์ + จุดเรียก + เทส + แถวเก่าใน DB) แทนที่จะลบไฟล์เฉย ๆ อย่าง Wave 3 ของ 2026-09-14

branch: `chore/retire-email-auth` (จาก `origin/main` eb2d7f90) · merge = operator (tier-check = C)

## RED → GREEN (ชั้น C ต้อง paste RED ก่อนขอ GREEN)

| artifact | อะไร | ผล |
|---|---|---|
| `red-before-change.txt` | เทสใหม่/แก้แล้ว รันกับโค้ดเดิม (ก่อนแตะ production code) | **13 failed** / 132 passed — ทุกตัวที่ตกคือพฤติกรรมใหม่ (ไฟล์ต้องหาย, route `/email/*` ต้องหาย, mint ต้องปฏิเสธ EMAIL, แถว EMAIL = ไม่ลงทะเบียน, migration ต้องมี, reset password ไม่สร้าง token, web-app ไม่มี email 2FA) |
| `green-after-change.txt` | ชุดเดียวกันหลังแก้ | 141 passed (หลังแก้คอมเมนต์ที่มี path ตัวเดียว) |
| `webapp-red-before-test-rewrite.txt` | เทสหน้า security เดิม (email-OTP chrome) ชนหน้าใหม่ | 1 failed / 3089 passed |
| `webapp-green-after-test-rewrite.txt` | เทสหน้า security ใหม่ + `tsc --noEmit` + eslint ไฟล์ที่แก้ | 2 passed · TSC_EXIT=0 · ESLINT_EXIT=0 |
| `test-output.txt` | full backend unit suite (ไม่ตัด) | **765/766 suites · 9,832/9,833 tests** — ตัวเดียวที่ตกคือ source-pin `closing-review-fixes` (grep หา `user.twoFactorEnabled` ใน prisma-auth-service ซึ่งย้ายไป helper) → แก้เทสให้ตามโค้ด: `closing-review-pin-after-fix.txt` 21/21 · full run สะอาดอยู่ใน attestation ของ full-gate (`suite-green`) |
| `probe-results.json` | probe ทุกตัวจาก `scripts/ci/local-gate.sh` | ratchet PASS · no-secret PASS · no-skip PASS · deploy-drift/main-attestation-audit FAIL (ของเดิม — ต้อง operator deploy/attest) |
| `ratchet-before-after.txt` | ตัวนับจาก probe ไม่ได้พิมพ์มือ | env-direct **113 → 102** (email-service อ่าน process.env ตรง 11 จุด หายไป) · hardcode/todo/dup-source เท่าเดิม |
| `evidence/gate/<sha>.json` | full-gate attestation (รันหลัง commit — ดู commit `evidence(gate): …`) | verdict + รายการ check |

## สิ่งที่เปลี่ยน (สรุป — รายละเอียดใน commit)

- ลบ `services/email-otp-service.js`, `services/email-service.js` (SMTP; production ไม่เคยตั้ง `SMTP_HOST` — "Email sending will be mocked")
- `shared/second-factor.js` ใหม่: `hasUsableSecondFactor(user)` = ประตูล็อกอินทุกบาน (รหัสผ่าน/หมอพร้อม/ThaID) ถามที่เดียว;
  แถว `twoFactorMethod = 'EMAIL'` นับว่าไม่ลงทะเบียน (ไม่มี TOTP seed — ท้าทายไป = ล็อกออกถาวร)
- `shared/mfa-challenge-binding.js`: mint ปฏิเสธทุก method นอกจาก TOTP (`MFA_METHOD_RETIRED`) — fail closed
- `routes/api/identity/mfa.js`: ลบ `/email/setup`, `/email/verify-setup`, limiter, mapper ของ OTP อีเมล, branch EMAIL ใน `/verify` และ `/disable` (747 → 576 บรรทัด)
- `auth-idp.js`, `auth-provider.js`, `health-auth-profile-handlers.js`: ไม่ส่ง OTP ทางอีเมลอีก; challenge = TOTP เท่านั้น
- `identity-service.js`: ลบ `enableEmailMfa`
- `password-management.js` → `requestPasswordReset` ไม่สร้าง token (ไม่มีช่องทางส่ง) ตอบคงที่ว่าให้เข้าด้วย หมอพร้อม/ThaID — anti-enumeration คงเดิม
- migration `20260915180000_retire_email_second_factor`: `UPDATE users … WHERE "twoFactorMethod"='EMAIL'` → enabled=false, method='TOTP', secret/backup NULL
- web-app: `/health/profile/security` เป็นหน้าอธิบาย (ไม่มีแบบฟอร์ม OTP), `provider-api.ts` ไม่มี endpoint email 2FA
- `shared/error-codes.js`: catalog `MFA_METHOD_RETIRED`

## ไม่ได้แตะ (ตั้งใจ)

- `SMTP_PASSWORD` ใน `config/secrets.js` คงไว้ (optional, ไม่มีใครอ่าน) เพราะ `secrets-catalog` / `env-example` tests ผูกอยู่ — ถอดในรอบ config cleanup
- `notification-fanout-service` retired ช่อง EMAIL/SMS อยู่แล้ว (2026-08-13) — ไม่เกี่ยว
- password login ทั้งระบบ (AUTH-01) ยังอยู่ — งานนี้ปลดเฉพาะ "อีเมล": OTP, reset link
- คอลัมน์ `twoFactorMethod` ยังอยู่ (expand-before-contract) — contract เมื่อไม่มีโค้ดอ่าน

## รอบ review ก่อน merge (2026-09-16 · commit d6e109a1)

operator สั่ง: "review + merge chore/retire-email-auth → main … หลัง merge: deploy staging/demo ตามปกติ"
review 10 มุม (bug 5 มุม + reuse/simplification/efficiency/altitude/conventions): 2 มุมรันเป็น agent แยก อีก 8 มุม
ทำใน session เดียวกันหลัง agent ชน usage limit · ยืนยันทุกข้อกับโค้ดจริงก่อนนับ · พบ 14 ข้อ แก้ 11 ข้าม 3

| # | ข้อค้นพบ | ผล |
|---|---|---|
| 1 | `/health/profile/security` สัญญาว่า "เข้าสู่ระบบใหม่ ระบบจะยกเลิกการเข้าสู่ระบบเดิมทั้งหมด" ซึ่งไม่จริง (`sessionsRevokedAt` ถูกประทับเฉพาะเปลี่ยน/รีเซ็ตรหัสผ่าน, เจ้าหน้าที่เปลี่ยนสถานะ/บทบาท, PDPA) และบอกว่า "ไม่มีรหัสผ่านในระบบนี้" ทั้งที่ `/health/settings` ยังเปลี่ยนรหัสผ่านได้ | แก้ข้อความ + เทส |
| 2 | ฟอร์มยืนยัน 2FA บอกทุกคนว่า "หากใช้ Email OTP รหัสจะถูกส่งไปยังอีเมล" + branch `OTP_EXPIRED`/`OTP_TOO_MANY` ที่ backend ไม่ส่งแล้ว | แก้ + เทส |
| 3 | `POST /auth/health/reset-password` ยังตอบ "ระบบได้ส่งลิงก์เปลี่ยนรหัสผ่านไปแล้ว" ทิ้งข้อความของ service | controller ตอบข้อความของ service + เทส |
| 4 | pack ชั้น C ไม่มี view-pack (CLAUDE.md §5 "pack เต็ม + view-pack") | เพิ่ม `screenshots/` + trace ด้านล่าง |
| 5 | `GET /api/mfa/status` ยังอ่านอีเมลและตอบ `hasEmail` ให้หน้าที่ถูกลบแล้ว | ลบ + เทส |
| 6 | คอมเมนต์/select ใน identity-service อธิบายโค้ดที่ไม่มีแล้ว | แก้ + เทส |
| 7 | คอมเมนต์ค้างใน mfa.js ("Test helper", "now 503s") | แก้ + เทส |
| 8 | catalog: `MFA_METHOD_MISMATCH.source` ชี้ mfa.js:459 (จริง :368) · `OTP_EXPIRED`/`OTP_TOO_MANY`/`MFA_STORE_UNAVAILABLE` ไม่มีผู้ส่ง | แก้ source + ลบ 3 รายการ + เทส (อ่านบรรทัดตาม source จริง) |
| 9 | เทสหน้า security assert บน mock ของ module ที่หน้าไม่ได้ import (ไม่มีวันตก) | แทนด้วยเทสอ่าน source |
| 10 | คอมเมนต์เทส entities-management-routes อ้าง mock/pin ที่ลบไปแล้ว | แก้คอมเมนต์ |
| 11 | `.github/workflows/ci.yml` testPathPattern ยังชี้ `unit/email-otp-service` | ลบออก |
| 12 | `RETIRED_SECOND_FACTOR_METHODS` array ตัวเดียว | ข้าม: เปลี่ยนเป็น allow-list = เปลี่ยน semantics ของค่าที่ไม่รู้จัก และใน DB ไม่มีค่าอื่น |
| 13 | ด่าน `MFA_METHOD_RETIRED` ใน `/verify` ซ้ำกับ mint + null-secret guard | ข้าม: defense in depth บนเส้น auth; challenge ที่ออกก่อน deploy (อายุ 5 นาที) ได้ข้อความตรงเหตุ |
| 14 | `nodemailer` / SMTP ใน `.env*.example` / `SMTP_PASSWORD` ยังค้าง | ข้าม: รอบ config cleanup (หัวข้อ "ไม่ได้แตะ") |

เจอเพิ่มจาก view-pack: `CardContent` ของ primitive มี `sm:pt-0` ที่ `p-6` ไม่ทับ ข้อความจึงติดเส้นแบ่งบนจอกว้าง → `sm:pt-6`

| artifact | อะไร | ผล |
|---|---|---|
| `review-red-backend.txt` | เทสใหม่/ขยาย รันกับโค้ดก่อนแก้ | **5 failed** / 10 passed — ทุกตัวที่ตกคือข้อ 3, 5, 6-7, 8 |
| `review-red-webapp.txt` | เทสฟอร์ม 2FA + หน้า security กับโค้ดก่อนแก้ | **3 failed** / 4 passed — ข้อ 1, 2 |
| `review-green-backend.txt` | ชุดเดียวกันหลังแก้ + eslint | 15/15 · eslint 0 error (1 warning เดิมบน main: `authenticateProvider` unused) |
| `review-green-webapp.txt` | ชุดเดียวกันหลังแก้ + eslint + `tsc --noEmit` | 7/7 · ESLINT_EXIT=0 · TSC_EXIT=0 |
| `test-output-review-round.txt` | full backend unit suite (ไม่ตัด) | **767/767 suites · 9,839/9,839 tests** · EXIT=0 |
| `webapp-test-output-review-round.txt` | full web-app jest suite (ไม่ตัด) | **380/380 suites · 3,094/3,094 tests** · EXIT=0 |
| `probe-results-review-round.json` | probe ชุดเดียวกับรอบแรก | ratchet/no-secret/no-skip/tier-check PASS · gate-attestation FAIL จนกว่า full-gate ของ commit นี้จะลง (commit ถัดไป) · deploy-drift/main-attestation-audit FAIL เดิม |
| `ratchet-before-after.txt` | บรรทัด review round จาก probe | hardcode=25 todo=53 env-direct=102 dup-source=0 — ไม่ขึ้น |

### view-pack (HARNESS.md §4.4)

รัน image frontend จริงในเครื่อง (ไม่มี backend ไม่มีบัญชีจริง) แล้วกดด้วย Playwright: หน้าเข้าสู่ระบบผู้ขอรับรอง → กรอกเลขบัตร/รหัสผ่านทดสอบ →
คำตอบ login ถูก route ของ Playwright ตอบเป็น `mfa_required` → ฟอร์ม 2FA → กรอก 123456 · หน้า security เข้าด้วย cookie ที่มีแค่ role
(middleware ถอด role เท่านั้น ผู้ตรวจลายเซ็นคือ backend ซึ่งไม่มีในรอบนี้) · ทุกภาพมีป้าย build SHA + เวลา UTC มุมขวาล่าง · สคริปต์: `screenshots/viewpack.js`

| ภาพ | build | เห็นอะไร |
|---|---|---|
| `screenshots/before-01-mfa-challenge-a838720d72b8.png` | a838720d (ก่อน review) | "หากใช้ Email OTP รหัสจะถูกส่งไปยังอีเมลที่ลงทะเบียน (หมดอายุใน 5 นาที)" |
| `screenshots/after-01-mfa-challenge-d6e109a1a058.png` | d6e109a1 | "เปิดแอป authenticator ในโทรศัพท์ของคุณเพื่อดูรหัส 6 หลัก" |
| `screenshots/before-02-health-security-a838720d72b8.png` | a838720d | "…แล้วเข้าสู่ระบบใหม่ — ระบบจะยกเลิกการเข้าสู่ระบบเดิมทั้งหมดให้" · "จึงไม่มีรหัสผ่าน…" · ข้อความติดเส้นแบ่ง |
| `screenshots/after-02-health-security-d6e109a1a058.png` | d6e109a1 | ไม่มีคำสัญญาทั้งสอง · "หากสงสัยว่ามีผู้อื่นใช้บัญชีของคุณ กรุณาติดต่อเจ้าหน้าที่ DTAM" · ระยะห่างถูก |
| `screenshots/{before,after}-checks-*.json` | — | ค่าที่สคริปต์อ่านจากหน้าจอ: before `mentionsEmailOtp=true promisesSessionRevokeOnRelogin=true saysNoPassword=true` → after ทั้งหมด `false`, `mentionsAuthenticator=true saysContactStaff=true` |
| trace (ไม่อยู่ใน git: `.gitignore` ตัด `*.zip`) | d6e109a1 | Playwright trace ของ 2 ฉาก เก็บบนเครื่อง 43.134.175.51 ที่ `/home/ubuntu/work/state/retire-email-auth-2026-09-15-trace/after-0{1,2}-*.zip` (`npx playwright show-trace <zip>`) |

### ยังค้าง (นอกขอบเขตงานนี้)

- หน้า `/forgot-password` ยังเสนอส่งลิงก์รีเซ็ตทางอีเมล/SMS และพังอยู่แล้วบน main (ส่ง `{phone}`/`{email}` แต่ schema ต้องการ `identifier` → 400 ทุกครั้ง) —
  ควรปลดพร้อมประตูรหัสผ่านชั่วคราว (AUTH-01) · `POST /reset-password/:token` ต้องคงไว้ เพราะการ "บังคับรีเซ็ตรหัสผ่าน" โดยเจ้าหน้าที่ยังออก token
