# AUTH-01 P2 — notes (2026-08-03)

## สิ่งที่ทำ (ทุกข้อมี file:line)

### 1. Route ใหม่ — `apps/backend/routes/api/auth/auth-idp.js` (356 บรรทัด)
- `POST /:provider/authorize-url` (`auth-idp.js:260-279`):
  - fail-closed provider ไม่ enabled → 503 `AUTH_PROVIDER_DISABLED` (`auth-idp.js:263-265` — แบบ `payments.js:409-417`)
  - state = `crypto.randomBytes(32).toString('hex')` = 256 bit (`auth-idp.js:271` — เกินเกณฑ์ ≥128bit mandate §D3)
  - state cookie: httpOnly + sameSite lax + secure ตาม `isSecureCookie()` + `maxAge` 10 นาที (`auth-idp.js:115-128`, `auth-idp.js:273-276`)
  - คืน `{ authorizeUrl }` จาก `adapter.getAuthorizeUrl({ state })` (`auth-idp.js:272-277`)
- `POST /:provider/callback` (`auth-idp.js:288-355`):
  - single-use: อ่าน cookie แล้ว `clearCookie` ทันที ไม่ว่าผลเป็นอะไร (`auth-idp.js:300-301`)
  - ตรวจ state: โครง/provider ตรง/ไม่หมดอายุ/HMAC แท้ (`timingSafeEqual`)/ค่าตรง body — fail ทุกแบบตอบ `AUTH_STATE_INVALID` ก้อนเดียว (`auth-idp.js:99-113`, `auth-idp.js:303-307`)
  - `exchangeCode` → `getProfile` ผ่าน adapter P1 (ไม่แตะ contract) (`auth-idp.js:318-329`)
  - profile ต้องมี `account_id` + `hash_cid` ([P-OAUTH] หน้า 10-12) → ขาด = 502 `AUTH_IDP_PROFILE_INCOMPLETE` (`auth-idp.js:331-336`)
  - **mock (non-prod)**: resolver match ทะเบียนที่มีอยู่เท่านั้น ผ่าน `findProviderForLoginByHash(profile.hash_cid)` (reuse `provider-user-service.js:386` — ไม่เขียน lookup ใหม่, Law 3.6); ไม่พบ/fixture not-in-registry → 403 `AUTH_PROVIDERID_NOT_FOUND` messageTh "ไม่พบข้อมูลเจ้าหน้าที่ กรุณาติดต่อผู้ดูแลระบบ" **ไม่มี user.create** (`auth-idp.js:194-210`); mint ผ่าน `issueTokensForAuthenticatedUser` seam (`prisma-auth-service.js:475-522`) + `provider_token` cookie idiom เดิม (`auth-provider.js:245-252`) — token ไม่ออกใน body (`auth-idp.js:218-252`)
  - **providerid จริง**: จบที่ 409 `AUTH_LINKING_PENDING` — ไม่มี require/เรียก module ฝั่ง user ใด ๆ ในเส้นนี้ (lazy require อยู่ใน mock resolver เท่านั้น `auth-idp.js:200-203`, `auth-idp.js:222`) (`auth-idp.js:344-349`)
  - audit ทุกผล: `auditLogger.logAuth('IDP_LOGIN_SUCCESS'|'IDP_LOGIN_FAILURE', ...)` metadata `{ provider, subjectHash, reason }` — subjectHash = sha256(account_id) (`auth-idp.js:160-181`)
- data-sovereignty header note แบบ `auth-health.js:62-66` (`auth-idp.js:15-18`) — ไม่มีคำแบรนด์ต้องห้าม

### 2. Wiring
- mount: `routes/api/index.js:103-106` — `router.use('/auth/idp', require('./auth/auth-idp'))`
- CSRF bypass 2 pattern + คอมเมนต์เหตุผล: `middleware/csrf-middleware.js:43-50` (คงรูปแบบ hardcode list เดิม)
- rate limiter: `server.js:271-276` — `app.use(`${prefix}/auth/idp`, authLimiter)` ทั้ง `/api` และ `/api/v1` ใช้ instance เดียวกับ login (นับ budget ร่วม)

### 3. Error catalog — `shared/error-codes.js:2457-2489` (4 codes ใหม่)
`AUTH_STATE_INVALID` (400) · `AUTH_STATE_SECRET_MISSING` (503) · `AUTH_IDP_PROFILE_INCOMPLETE` (502) · `AUTH_LINKING_PENDING` (409 — ข้อความไทยทางการอธิบายว่าการเชื่อมบัญชียังไม่เปิดให้บริการ)
`node scripts/extract-error-codes.js --validate` = "VALIDATION OK - catalog has 293 entries; 293 codes reconciled."

### 4. Tests — `__tests__/unit/auth-idp-routes.test.js` (29 tests)
- RED: 29/29 fail ด้วย assertion จริง (stub router เปล่า → 404/pattern ไม่ตรง) — `evidence/AUTH-01/P2/red-output.txt`
- GREEN: 29/29 + regression P1 (`auth-providers-config` 16, `idp-adapter` 41) + `error-codes-catalog` 11 = 97 passed — `evidence/AUTH-01/P2/test-output.txt`
- state-CSRF ครบสามเคสของ auditor แกน 3: (ก) ไม่มี state (ข) state ผิด (ค) replay รอบสอง + เพิ่ม: ไม่มี cookie / cookie ถูกดัดแปลง / หมดอายุ (Date.now spy)
- pin no-auto-provision (auditor check #4): `prisma.user.*` mock ทุก method ต้องเงียบ + `findProviderForLoginByHash`/`issueTokensForAuthenticatedUser` ไม่ถูกเรียกในเส้น providerid
- ไม่มี `.skip`/`.only` (Law 3.7); ไม่มี test เขียวแต่กำเนิด (RED run เดียวแดงครบ 29)
- regression เพิ่มที่รันจริง: `csrf-middleware` 16 · `public-surface-guards`/`server-boot-receipt-assert`/`audit-onsite-rbac`/`audit-onsite-routes`/`auth-provider-login-codes` รวม 80 passed (ไฟล์ที่ pin source ของ server.js / routes/api/index.js)

## การตัดสินใจ design ที่ spec ไม่ได้ระบุ (ไม่เดา spec — เลือกทางที่แคบที่สุด)
1. **รูปแบบ state cookie**: cookieParser ใน `server.js:294` ไม่ได้ตั้ง secret → ใช้ signed-cookie ของ express ไม่ได้โดยไม่แก้ global behavior จึง sign เองในค่า cookie: `v1.<provider>.<state>.<expiresAtMs>.<HMAC-SHA256(SESSION_SECRET)>` (`auth-idp.js:74-92`) — ผูก provider ใน payload กัน state ข้าม provider; เทียบ HMAC และ state ด้วย `crypto.timingSafeEqual`
2. **SESSION_SECRET ไม่มีค่า** (dev/test ไม่มี devFallback ใน `config/secrets.js:127-132`): fail-closed 503 `AUTH_STATE_SECRET_MISSING` ทั้งสอง endpoint — ไม่เพิ่ม devFallback ใน secrets.js (แตะไฟล์ config กลางเกินจำเป็น); test ตั้ง `process.env.SESSION_SECRET` เอง
3. **"ใช้ครั้งเดียว" = clear cookie ตาม dispatch**: enforcement คือ browser semantics (Set-Cookie ล้างทันทีที่ response แรก) — replay ที่ re-send raw Cookie header เดิมด้วยมือยังผ่าน HMAC ได้ภายในอายุ 10 นาที เพราะไม่มี server-side one-time store; ถ้าต้องการเข้มกว่านี้ (Redis jti ของ state) เป็นงานที่ dispatch ไม่ได้สั่ง — จดไว้ให้ operator ตัดสิน
4. **mock resolver match ด้วย `hash_cid` ตรงกับคอลัมน์ `providerIdHash`** ผ่าน `findProviderForLoginByHash` — เป็น policy ของ mock เท่านั้น (plan.md P2:20); E2E/dev ต้อง seed user ที่ `providerIdHash = sha256('gacp-mock-idp:happy')` (ค่า deterministic จาก `mock-idp-adapter.js:49-51`)
5. **สถานะ HTTP ของ AUTH_IDP_PROFILE_INCOMPLETE = 502** (ข้อมูลจาก upstream ไม่ครบ — แนวเดียวกับ `AUTH_IDP_EXCHANGE_FAILED` envelope ผิดทรง) และ **AUTH_STATE_INVALID = 400** เดียวทุกสาเหตุ ไม่แยก error ราย ชั้น (ไม่ให้ oracle แก่ผู้โจมตี)
6. **mock session = portal เจ้าหน้าที่** (`provider_token` idiom): fixtures ของ mock เป็นโปรไฟล์เจ้าหน้าที่ (ทรง Provider ID ตาม [P-OAUTH] หน้า 10-12) จึงเข้า portal provider; ไม่ตั้ง refresh cookie ตาม idiom เดิมของ portal นี้ (`auth-provider.js:299-316` — "Provider sessions carry no separate refresh-token cookie") แม้ seam จะคืน refreshToken มาด้วย (ทิ้ง ไม่ลง response/cookie)
7. **ACCOUNT_INACTIVE guard ใน mock resolver**: dispatch ไม่ได้ระบุ guard หลัง match — ใส่ขั้นต่ำ (status ACTIVE) ให้สอดกับ provider login (`auth-provider.js:115-122`); guard อื่น (role/accountType/lockout/MFA) ไม่ทำ — mock resolver ไม่ใช่ surface production

## สิ่งที่**จงใจไม่ทำ** + ธง/เหตุผล
| ไม่ทำ | เหตุ/ธง |
|---|---|
| สร้าง/แก้/ค้น user ในเส้น providerid จริง | ธง **D-MANUAL-HASHCID** — test pin `auth-idp-routes.test.js:479-484` |
| PKCE | เอกสารไม่กล่าวถึง — `manual-citations.md:96` "ห้าม implement" (mandate §B2/§D3) |
| refresh token flow | เอกสารไม่มี ([P-OAUTH] หน้า 5 ไม่มี refresh_token; `manual-citations.md:63`) |
| server-side one-time store ของ state | dispatch กำหนด mechanism = clear cookie; ดูข้อ 3 ข้างบน |
| endpoint healthid/thaid | adapter ยังไม่มี (P1 ships providerid+mock เท่านั้น); registry fail-closed 503 อยู่แล้ว |
| GET redirect endpoint ฝั่งเรา | flow ตาม [P-OAUTH] หน้า 2 ขั้น 4-5: frontend อ่าน code แล้ว POST มา — ไม่มี citation ให้ backend รับ GET redirect ตรง |
| schema/migration/FE | นอก scope P2 |

## จุดที่ spec ไม่ครอบ (บันทึก ไม่ block)
- จังหวะ audit เมื่อ `logAuth` ล้มเหลว: เลือก non-fatal (log error, response เดินต่อ — idiom `health-auth-profile-handlers.js` catch รอบ audit) (`auth-idp.js:178-180`)
- `VALIDATION_ERROR` เมื่อไม่มี `code` ใน body ใช้ messageTh เฉพาะกิจ "ไม่พบรหัสยืนยันจากระบบยืนยันตัวตน" (`auth-idp.js:309-315`) — code เดิมของ catalog, ไม่เพิ่ม code ใหม่

## Gates (ผลจริง — รันตามลำดับ dispatch)
1. Jest: 97 passed (29 ใหม่ + 16 auth-providers-config + 41 idp-adapter + 11 catalog) — `test-output.txt`
2. `bash scripts/probes/ratchet.sh`: PASS — hardcode 43→43, todo 59→59, env-direct 169→169, dup-source 4→4
3. `node scripts/extract-error-codes.js --validate`: OK 293/293
4. ESLint 6 ไฟล์ที่แตะ: exit 0
5. `node scripts/ci/check-banned-terms.js`: รันสุดท้ายก่อน commit (ผลใน report)
