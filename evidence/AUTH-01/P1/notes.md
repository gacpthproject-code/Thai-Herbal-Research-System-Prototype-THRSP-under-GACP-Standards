# AUTH-01 P1 — notes (2026-08-03)

## สิ่งที่ทำ (ทุกข้อมี file:line)

### 1. Config SSOT — `apps/backend/config/auth-providers.js` (ไฟล์ใหม่ 209 บรรทัด)
- registry 5 provider + state vocab: `PROVIDER_KEYS`/`PROVIDER_STATES` (`config/auth-providers.js:23-24`)
- default states ตาม mandate §D2/§C4/B1-CRED: `DEFAULT_STATES` (`config/auth-providers.js:26-32`)
- mock ปิดบน production **ใน logic**: `getEffectiveState` (`config/auth-providers.js:109-111`) + `assertProviderReady` (`config/auth-providers.js:184-185`)
- fail-closed config ไม่ครบ: `REQUIRED_ENV` (`config/auth-providers.js:47-66`) + downgrade เป็น `coming_soon` (`config/auth-providers.js:112-114`) + `AUTH_PROVIDER_NOT_CONFIGURED` (`config/auth-providers.js:187-191`)
- `getAuthProviders()` คืน `{key, state}` เท่านั้น — ไม่มี secret (`config/auth-providers.js:137-139`)
- `getProviderConfig(key)` ภายใน backend (`config/auth-providers.js:150-176`), `isProviderEnabled` (`config/auth-providers.js:125-130`), `getIdpTimeoutMs` default 10000 override ด้วย `AUTH_IDP_TIMEOUT_MS` (`config/auth-providers.js:141-144`)
- ที่เดียวที่อ่าน `process.env` (idiom `config/stripe.js:38-42`; ratchet env-direct ไม่นับ config/ — ยืนยันแล้ว: counter คงที่ 169)

### 2. Adapter seam — `apps/backend/services/auth/idp/`
- `idp-adapter.js` (48 บรรทัด): factory `getIdpAdapter(key)` แบบ `payment-adapter.js:52-66` + JSDoc contract 3 method (`idp-adapter.js:8-31`); fail-closed ผ่าน `assertProviderReady` (`idp-adapter.js:35-37`); ไม่มี adapter → `AUTH_PROVIDER_NO_ADAPTER` (`idp-adapter.js:42-45`)
- `provider-id-adapter.js` (292 บรรทัด): ตาม [P-OAUTH] เท่านั้น —
  - authorize query 4 param, state บังคับ (`provider-id-adapter.js:187-204`) — [P-OAUTH] หน้า 3
  - ขา 1 token: form-urlencoded 5 field (`provider-id-adapter.js:212-223`), envelope `{status,data,message}` (`provider-id-adapter.js:228-235`) — หน้า 4-5
  - ขา 2 token exchange: JSON `{client_id, secret_key, token_by:"Health ID", token}` (`provider-id-adapter.js:237-247`) — หน้า 7; เคส 400 "This user has not provider id" แยกเป็น `AUTH_PROVIDERID_NOT_FOUND` (`provider-id-adapter.js:117-125`) — หน้า 8
  - profile: GET + headers `Authorization: Bearer` / `client-id` / `secret-key` (`provider-id-adapter.js:271-281`) — หน้า 9; **คืน raw body เท่านั้น** (`provider-id-adapter.js:284`)
  - HTTP ผ่าน global `fetch` + AbortController timeout (idiom `services/sms/sms-service.js:86`) ห่อเป็น `AUTH_IDP_UNAVAILABLE` (`provider-id-adapter.js:48-71`)
  - **ไม่มี** logic linking/user lookup ใด ๆ (ธง D-MANUAL-HASHCID)
- `mock-idp-adapter.js` (173 บรรทัด): deterministic in-memory ไม่แตะ network; fixtures 5 ชุด `MOCK_FIXTURE_CODES` (`mock-idp-adapter.js:28-34`); raw เลียน envelope [P-OAUTH] หน้า 7-8 (`mock-idp-adapter.js:136-145`); profile เฉพาะ field ที่ citation ระบุชื่อเป๊ะ (`mock-idp-adapter.js:65-81`); เคส staff-not-in-registry ใช้ `_mock.in_registry=false` (`mock-idp-adapter.js:77`, `mock-idp-adapter.js:91-93`)

### 3. Error catalog — `apps/backend/shared/error-codes.js:2359-2455`
12 codes ใหม่: `AUTH_PROVIDER_UNKNOWN` `AUTH_PROVIDER_DISABLED` `AUTH_PROVIDER_NOT_CONFIGURED` `AUTH_PROVIDER_NO_ADAPTER` `AUTH_IDP_ACCESS_DENIED` `AUTH_IDP_CODE_EXPIRED` `AUTH_IDP_CODE_INVALID` `AUTH_IDP_CLIENT_AUTH_FAILED` `AUTH_IDP_TOKEN_INVALID` `AUTH_PROVIDERID_NOT_FOUND` `AUTH_IDP_EXCHANGE_FAILED` `AUTH_IDP_UNAVAILABLE` — `node scripts/extract-error-codes.js --validate` = "VALIDATION OK - catalog has 289 entries; 289 codes reconciled."

### 4. `.env.example:183-226`
Block AUTH ครบทุก provider ค่า default ว่าง; URL จริงเป็นคอมเมนต์พร้อมเลขหน้า [P-OAUTH] (Health ID base หน้า 2, authorize หน้า 3, token หน้า 4, Provider base หน้า 6, exchange หน้า 7, profile หน้า 9); healthid PROFILE_URL คงว่าง + คอมเมนต์ BLOCKER-2 ห้ามเดา (`.env.example:206`)

### 5. Tests (RED-first, Law 3.11)
- `__tests__/unit/auth-providers-config.test.js` (18 tests) + `__tests__/unit/idp-adapter.test.js` (31 tests)
- RED: 49/49 fail ด้วย assertion จริง (stub exports เปล่าก่อน implement) — `evidence/AUTH-01/P1/red-output.txt`
- ระหว่าง RED พบ 2 test เขียวแต่กำเนิด (negative-only assertion) → เสริม positive assertion (`auth-providers-config.test.js:184`, `idp-adapter.test.js:402`) แล้วรัน RED ใหม่จน 49/49 แดงครบ — ไม่มี born-green pin หลงเหลือ
- GREEN: 60/60 (รวม error-codes-catalog regression 11 tests) — `evidence/AUTH-01/P1/test-output.txt`
- ไม่มี `.skip`/`.only` (Law 3.7)
- pin สำคัญ: raw-profile-only (`idp-adapter.test.js:316` toStrictEqual), no-secret-in-list (`auth-providers-config.test.js:181-196`), mock-never-enabled-on-prod (`auth-providers-config.test.js:104-111`)

## สิ่งที่**จงใจไม่ทำ** + ธงกำกับ
| ไม่ทำ | เหตุ/ธง |
|---|---|
| HealthIdAdapter / ThaIdAdapter | นอก scope P1 (plan.md P1 ระบุ ProviderIdAdapter + MockIdpAdapter เท่านั้น); healthid ไม่มี profile endpoint ประชาชนในเอกสาร (BLOCKER-2) |
| Account linking / user lookup / `user.create` ใด ๆ | ธง **D-MANUAL-HASHCID** — adapter คืน raw profile เท่านั้น (test pin: `idp-adapter.test.js:316`) |
| Schema/migration | plan.md P1:13 "ไม่มี schema change ใด ๆ" |
| Routes / FE | P2/P4 |
| PKCE / refresh token / revoke / re-auth param | [P-OAUTH] ไม่กล่าวถึง — manual-citations.md:96 "ห้าม implement" (mandate §B2) |
| ฟิลด์ชื่อ-สกุลใน mock profile | citation (manual-citations.md:87) ระบุแค่ "ชื่อ-สกุล th/en" ไม่ให้ชื่อ field เป๊ะ → ไม่เดา (§B2); ใส่เมื่อ citation ขยาย |
| flip provider จริงเป็น enabled | ธง **B1-CRED** — default `coming_soon` + fail-closed ครบ |
| ตรวจ profile ครบ field ในชั้น adapter (`AUTH_IDP_PROFILE_INCOMPLETE`) | เป็นหน้าที่ consumer P2 (adapter = raw เท่านั้น); code นี้ยังไม่เพิ่มใน catalog เพราะยังไม่มี emit site |

## จุดที่ spec ไม่ครอบ (บันทึกไว้ ไม่เดา ไม่ block)
1. **client_id ขา Health ID vs ขา Provider ID**: [P-OAUTH] หน้า 7 บอก token-exchange `client_id` เป็น "ของระบบ Provider ID" ส่วน authorize ใช้ client ของ Health ID — dispatch กำหนด env `AUTH_PROVIDERID_CLIENT_ID` ตัวเดียว จึง implement ใช้ค่าเดียวทั้งสองขา; ถ้า credentials จริง (B1-CRED) ออกมาเป็นคนละค่า ต้องเพิ่ม env อีกตัว (จุดแก้: `config/auth-providers.js:54-59` + `provider-id-adapter.js:243-247`)
2. **โครง response ขา 2**: citation หน้า 7-8 ไม่ระบุว่าห่อ envelope `{status,data,message}` แบบขา 1 หรือไม่ → implement อ่านแบบ flat ตาม field ที่ citation ไล่ชื่อ (`access_token`...`login_by`); `messageOf()` อ่าน message ได้ทั้งสองทรงเผื่อ error body (`provider-id-adapter.js:34-46`)
3. **ความหมาย `staging_only`**: mandate §D2 ให้ vocab แต่ไม่นิยาม → pin เป็น "enabled เฉพาะ NODE_ENV !== 'production'" (`config/auth-providers.js:118-123` + test `auth-providers-config.test.js:152-158`) — operator ทบทวนได้
4. mock authorize/callback path (`/auth/mock-idp/*` ใน `config/auth-providers.js:73-77`) เป็น seam — P2 เป็นผู้ mount route จริง เปลี่ยนได้ที่ config จุดเดียว

## Gates (ผลจริง)
- Jest ไฟล์ใหม่ + catalog: 60/60 PASS (`test-output.txt`)
- `scripts/probes/ratchet.sh`: PASS — hardcode 43→43, todo 59→59, env-direct 169→169, dup-source 4→4
- ESLint 7 ไฟล์ที่แตะ: exit 0
- `extract-error-codes.js --validate`: OK (289 reconciled)
- full unit round + banned-terms: รันก่อน commit (ผลใน report)

---
[CORRECTION 2026-08-03 — audit F2] ตัวเลข test ต่อไฟล์ในหัวข้อ 5 บรรทัด "auth-providers-config.test.js (18 tests) + idp-adapter.test.js (31 tests)" ผิด — ตัวเลขที่ถูกต้อง ณ ตอนจบ P1 คือ auth-providers-config 15, idp-adapter 34 (รวม 49 ตรงตามเดิม; auditor รันยืนยันแล้ว — audit-report.md F2) · หลังรอบ fix cycle 1/3 (เพิ่ม pin F1 1 + F3 5 ใน idp-adapter, pin F1 1 ใน auth-providers-config): auth-providers-config 16, idp-adapter 40 = 56 (รันจริง 2026-08-03: "Tests: 16 passed" / "Tests: 40 passed" — evidence/AUTH-01/P1/fix-red-output.txt ท้ายไฟล์) — เนื้อความเดิมข้างบนคงไว้ตามกติกา append-only
