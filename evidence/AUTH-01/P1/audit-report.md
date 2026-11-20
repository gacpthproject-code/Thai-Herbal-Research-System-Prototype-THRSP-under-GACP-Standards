# ผล AUDIT — AUTH-01 P1: **FAIL** (3 findings — ไม่มีธง CRITICAL)

ไม่มีประเด็นเงิน/security/PII/data integrity — mock ปิดตายบน `NODE_ENV=production` ทุก combination ที่ผม probe เอง, secret ไม่รั่วทั้ง `getAuthProviders()` และ error message, ไม่มี prisma/user access ใน `services/auth/idp/` + `config/auth-providers.js`, diff ไม่มี schema/migration/route/FE

## Findings

**F1 — Citation fidelity: `client_id` ขา 2 + profile header ผูกค่าเดียวกับขา 1 โดยไม่มี citation รองรับ (แกนหนักสุด)**
- โค้ด: `apps/backend/services/auth/idp/provider-id-adapter.js:216` (ขา 1 Health ID token), `:241` (ขา 2 token exchange), `:277` (header `client-id` ของ profile) — ทั้งสามจุดใช้ `cfg.clientId` จาก env ตัวเดียว `AUTH_PROVIDERID_CLIENT_ID` (`apps/backend/config/auth-providers.js:56,162`)
- SSOT ขัด: `evidence/AUTH-01/manual-citations.md:59` (ขา 1 client_id = ค่าที่ลงทะเบียนกับ Health ID) vs `:78` (ขา 2 `client_id` "**ของระบบ Provider ID**") vs `:95` (B1-CRED ระบุ **สองคู่ credential แยกกัน**: client_id+client_secret (Health ID) และ client_id+secret_key (Provider ID)) — เอกสารไม่มีข้อไหนบอกว่าสองค่านี้เท่ากัน → การผูก env ตัวเดียวคือ "เดา" ที่ mandate §B2 (`mandate.md:22`) สั่งว่าต้องเป็น config ว่าง + ธง BLOCKED แทน
- implementer รู้และบันทึกเองที่ `evidence/AUTH-01/P1/notes.md:52` แต่ implement ต่อ; ข้ออ้าง "dispatch กำหนด env ตัวเดียว" ฟังไม่ขึ้น เพราะงานนี้ขยาย env scheme ของ §D2 ไปแล้วเมื่อ citation ต้องการ (`AUTH_PROVIDERID_SECRET_KEY`, `AUTH_PROVIDERID_TOKEN_EXCHANGE_URL` — `config/auth-providers.js:59`)
- Reproduce: อ่านสามบรรทัดข้างต้นเทียบ manual-citations.md:59,78,95

**F2 — Report integrity: ตัวเลข test ต่อไฟล์ใน notes ผิดจริง (Law 3.2/3.9)**
- `evidence/AUTH-01/P1/notes.md:32` อ้าง "auth-providers-config.test.js (**18** tests) + idp-adapter.test.js (**31** tests)" — รันเองได้ **15** และ **34** (`npx jest __tests__/unit/auth-providers-config.test.js` → "Tests: 15 passed"; `npx jest __tests__/unit/idp-adapter.test.js` → "Tests: 34 passed") ยอดรวม 49 ตรง แต่ตัวเลขแยกไฟล์เป็นเลขที่ไม่ตรงกับของจริง = claim ที่ verify ไม่ผ่าน

**F3 — Test gap: error code จาก [P-OAUTH] ที่มี branch ใน implementation แต่ไม่มี test pin (ขัด plan.md:14 "RED-first ทุก behavior")**
- `provider-id-adapter.js:133-137` — ขา 2 status ≥500 → `AUTH_IDP_UNAVAILABLE` ([P-OAUTH] หน้า 8 "500", `manual-citations.md:80`) — ไม่มี test; ลบ branch นี้ suite ยังเขียว (จะตกไป `AUTH_IDP_EXCHANGE_FAILED` แทน)
- `provider-id-adapter.js:155-161` — profile 401 client ผิด (non-token message, [P-OAUTH] หน้า 12) → `AUTH_IDP_CLIENT_AUTH_FAILED` — ไม่มี test
- `provider-id-adapter.js:176-180` — profile 400 "param ขาด" ([P-OAUTH] หน้า 12, `manual-citations.md:88`) — ไม่มี test
- `provider-id-adapter.js:229-234, 251-256` — envelope ไม่มี `access_token` → `AUTH_IDP_EXCHANGE_FAILED` — ไม่มี test
- Reproduce: grep test names ใน `__tests__/unit/idp-adapter.test.js:216-339` — ไม่มีเคสใดครอบ 4 จุดนี้

## แกนที่รันเองแล้วยืนยันผ่าน (evidence)
- **Tests**: 49/49 + catalog 11 = 60/60 PASS (รันเอง) · ไม่มี `.skip`/`.only` · born-green 2 จุดมี positive assertion จริง (`auth-providers-config.test.js:184` toHaveLength(5), `idp-adapter.test.js:402` expect.any(String))
- **RED**: `evidence/AUTH-01/P1/red-output.txt` = 49 fail / 0 pass ทั้งหมดเป็น assertion failure (เช่น `Expected: "AUTH_PROVIDER_UNKNOWN" / Received: undefined`) line number ตรงไฟล์ปัจจุบัน — ไม่ใช่ module-not-found ล้วน
- **Gates**: `scripts/probes/ratchet.sh` PASS 43/59/169/4 ตรง baseline · `extract-error-codes.js --validate` = 289 reconciled · `check-banned-terms.js` PASS
- **Pre-existing failure**: `dataset-export-service.test.js` fail เหมือนกันเป๊ะ (Prisma.dmmf TypeError, 1 failed/11 passed) ทั้งบน `ea7cbccb` และ `99949d2c` — claim จริง; working tree คืนสภาพสะอาดบน branch tip แล้ว
- **Error mapping ที่มี pin**: ตรง [P-OAUTH] ทุก message ที่ทดสอบ (หน้า 5/8/12) · param/header/Content-Type ทุกตัวที่ส่งขึ้น wire มี citation (ยกเว้น binding ใน F1) · ไม่มี PKCE/refresh/revoke ตาม `manual-citations.md:96`

ไฟล์หลัก: `/home/user/GACP-Certification-Application/apps/backend/services/auth/idp/provider-id-adapter.js` · `/home/user/GACP-Certification-Application/apps/backend/config/auth-providers.js` · `/home/user/GACP-Certification-Application/evidence/AUTH-01/P1/notes.md` · `/home/user/GACP-Certification-Application/evidence/AUTH-01/manual-citations.md`
---

# RE-AUDIT รอบ 2 (fix cycle 1) — FAIL(1)
- F1/F2/F3 ปิดจริงครบ — auditor ยืนยันด้วย mutation เองทุกจุด (ขา 1/ขา 2/profile header, correction append-only +3 บรรทัด, pins 5 จุดแดงตัวต่อตัว)
- **F-NEW**: `shared/error-codes.js:2422` remediation ของ `AUTH_IDP_CLIENT_AUTH_FAILED` ยังชี้ env ผิดคู่ (เหมารวมสองการลงทะเบียนแบบ F1 เดิม ในเอกสาร diagnostic)

# RE-AUDIT รอบ 3 (fix cycle 2, focused F-NEW) — **PASS**
- remediation ใหม่ถูกคู่ถูกขา ครอบ emit points จริงทั้งสาม (leg-1 :77-80, leg-2 :126-131, profile :155-161)
- pin `idp-adapter.test.js:507-520` ผูก string จริง (auditor mutate เอง → แดง → revert); substring ปลอดภัยเพราะ `PID_` คั่น
- sweep 12 codes ตรง claim (3 จุดอ้าง env — อีกสองจุดถูกต้อง) · gates รันเอง: 57/57, ratchet 43/59/169/4, banned-terms, catalog 289
- tree สะอาด @ `ed5a0e1f` — ไม่มี mutation residue
**สรุป: AUTH-01 P1 + fix ปิดที่ fix cycle 2/3 — auditor PASS**
