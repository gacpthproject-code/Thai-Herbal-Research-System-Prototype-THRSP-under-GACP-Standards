# AUTH-01 — manual-citations (mandate §B2)
> ทุก endpoint / parameter / scope / รูปแบบ response ที่จะใช้ในโค้ด ต้องอ้างที่มา (เอกสาร + หัวข้อ/หน้า) จากไฟล์นี้
> "ค่าที่เอกสารไม่ระบุ = ห้ามเดา" (`evidence/AUTH-01/mandate.md:22`)

## สถานะเอกสารต่อ provider
| Provider | เอกสาร | สถานะ |
|---|---|---|
| **ThaID** | ครบ 2 เล่ม (Sandbox + Production) — citations ข้างล่าง | ✅ ได้แล้ว 2026-08-03 → **ธง C1-THAID-DOC ปลด** |
| **Health ID (สธ.)** | [P-OAUTH] ครอบ **ขา authorize+token ของ Health ID แล้ว** (ส่วนที่ 1) แต่**ไม่มี profile endpoint ฝั่งประชาชน** → เอกสาร Health ID สำหรับประชาชนตาม mandate §B1 ยังต้องได้เพิ่มเพื่อปิด BLOCKER-2 ฝั่งเกษตรกร (ลิงก์ shared_token เดิมถูกถอน) | ⚠️ บางส่วน — รอเอกสารประชาชน |
| **Provider ID (สธ.)** | ✅ **ได้ไฟล์แล้ว 2026-08-03** — operator อัปโหลด PDF ตรง ([P-OAUTH] ข้างล่าง) หลังลิงก์ bdh.moph.go.th โหลดไม่ได้จาก environment | ✅ citations ครบ → หมวด "Provider ID + OAuth Health ID" |

---

# Health ID (สธ.) — ลิงก์ที่ได้รับจาก operator (2026-08-03) + บริบท shared_token

> ⛔ **WITHDRAWN บางส่วน 2026-08-03 (operator สองข้อความต่อกัน)**: "ไม่ต้องใช้บริบทสยามมณีแล้ว" แล้วตามด้วย **"ใช้ลิงก์ล่าสุด"**
> การตีความที่บันทึก: **บริบท shared_token/สยามมณีข้างล่าง = ถอน** (คงไว้เป็นประวัติ implementer/auditor ห้ามอ้าง; คำถาม scope (ก)/(ข)/(ค) ปิดโดยการถอน) แต่ **ลิงก์ล่าสุด = คู่มือ Provider ID OAuth Health ID บน bdh.moph.go.th ยัง ACTIVE** เป็นแหล่งเอกสารตาม mandate §B1
> สถานะการเข้าถึง: environment นี้ยังเปิดลิงก์ไม่ได้ (CONNECT 403 — retry ล่าสุดหลังคำสั่ง "ใช้ลิงก์ล่าสุด" ก็ยังถูก block) → ปลดได้ 2 ทาง: (1) operator อัปโหลดไฟล์ PDF ตรง แบบ ThaID (2) เพิ่ม `bdh.moph.go.th` ใน allowed domains ของ environment network policy แล้วสั่งให้ผม fetch ใหม่

## ลิงก์ 2 รายการ (ยังเปิดไม่ได้จาก environment นี้ — ห้ามใช้เขียนโค้ดจนกว่าจะได้อ่านฉบับเต็ม)
| # | เอกสาร | URL | ผล fetch |
|---|---|---|---|
| 1 | คู่มือ shared_token Health ID (Google Docs) | `https://docs.google.com/document/d/1GH3-7UX8GTAjhBtvM_UzOH25iEtjO41B/edit` | ⛔ proxy gateway ตอบ 403 ที่ชั้น CONNECT (`docs.google.com:443`) ทั้ง curl และ WebFetch — บันทึกใน `__agentproxy/status` recentRelayFailures 2026-08-03T08:44Z |
| 2 | คู่มือการเชื่อมต่อระบบ Provider ID ด้วย OAuth Health ID (PDF, bdh.moph.go.th — ตรงกับที่ mandate §B1 อ้าง) | `https://bdh.moph.go.th/site/wp-content/uploads/2024/07/...Provider-ID...OAuth-Health-ID-.pdf` | ⛔ เดียวกัน (`bdh.moph.go.th:443`) |

**ทางแก้ตาม mandate §B1** ("ถ้า fetch ตรงไม่ได้ ... ร้องขอไฟล์จาก operator"): ขอให้ operator **อัปโหลดไฟล์ PDF ตรงเข้า session** แบบเดียวกับที่ทำกับ ThaID 2 เล่ม (เส้นทางนั้นใช้ได้จริงแล้ว)

## บริบทที่ operator ให้มา (verbatim — ตัวอย่างระบบสยามมณีขึ้นแอปกลาง สธ. — ชื่อแบรนด์แอป redact ตาม banned-terms guard)
> ฝั่งแอปกลาง สธ. จะทำการส่ง shared_token HealthID ไปให้ตอนกดเปิดแอปสยามมณี โดยทางแอปสยามมณีจะต้องทำรับ parameter นี้ไว้:
> `shared_token={token จากระบบ health id}` และนำ shared_token ที่ได้รับจากแอปกลาง สธ. **ไปเช็คกับ API HealthID**

### สิ่งที่บริบทนี้บอก (บันทึกเป็นข้อสังเกต — ยังไม่ใช่ citation)
1. **นี่คือ flow ที่สาม** นอกเหนือจาก authorization-code ที่ mandate §B3 ยืนยันไว้: เป็น **app-launch handoff** (แอปกลาง สธ. → เปิดแอป partner พร้อม `shared_token` → partner เอา token ไป validate server-side กับ API ของ Health ID) — ไม่มี redirect/callback ของ OAuth
2. mandate ปัจจุบัน (§C/§D) **ไม่มีข้อไหนครอบ flow นี้** — "ขึ้นแอปกลาง สธ." เป็น scope ใหม่ที่ operator ต้องสั่งว่า (ก) อยู่ใน AUTH-01 (ข) งานแยกอนาคต (ค) แค่บริบทประกอบการอ่านคู่มือ
3. ถ้าจะรองรับ: จุดรับ `shared_token` ฝั่งเราต้องเป็น endpoint ใหม่ + validate ผ่าน backend เท่านั้น (สอดกับ §D3 confidential-client posture) และ **ทุก endpoint/parameter ต้องมี citation จากคู่มือ shared_token ก่อน** — ตอนนี้ยังเขียนโค้ดไม่ได้ (§B2: ค่าที่เอกสารไม่ระบุ = ห้ามเดา)
4. คำถามที่คู่มือต้องตอบ (เตรียมไว้สำหรับตอนได้ไฟล์): endpoint validate คืออะไร (UAT/prod) · request format (header? query? body?) · response มี CID ไหม field ชื่ออะไร (**= คำตอบ BLOCKER-2 ฝั่ง Health ID**) · TTL ของ shared_token · error codes · ต้องลงทะเบียน client/API key อะไรก่อน

---

# Provider ID + OAuth Health ID — สำนักสุขภาพดิจิทัล สธ. **[P-OAUTH]**

## เอกสารอ้างอิง (operator อัปโหลดตรง — ไม่ commit PDF ลงรีโป ตามนโยบายเดียวกับ ThaID; เก็บ SHA-256 แทน)
| รหัสอ้าง | ชื่อเอกสาร | วันที่ | หน้า | SHA-256 |
|---|---|---|---|---|
| **[P-OAUTH]** | คู่มือการเชื่อมต่อระบบ Provider ID ด้วย OAuth ของ Health ID | 1 กรกฎาคม 2567 | 15 | `874a29f81e7af879...8ee242d410` |

## ส่วนที่ 1 — Health ID (หน้า 2-5)
| ขา | UAT | Production |
|---|---|---|
| Base URL (หน้า 2) | `https://uat-moph.id.th` | `https://moph.id.th` |
| Authorize (GET, หน้า 3) | `{HealthID-URL}/oauth/redirect` | เดียวกัน |
| Token (POST, หน้า 4) | `{HealthID-URL}/api/v1/token` | เดียวกัน |

**Flow ที่เอกสารกำหนด (หน้า 2 ขั้นตอน 1-5)**: ปุ่ม Login → redirect ไป authorize URL → ผู้ใช้ login สำเร็จ → redirect กลับ `redirect_uri` พร้อม `code` → **frontend อ่าน code ส่ง backend → backend แลก token** — ตรงกับ mandate §B3 + §D3 (confidential client) ทุกข้อ

**Authorize params (หน้า 3)**: `client_id` (Y) · `redirect_uri` (Y — ต้องลงทะเบียนกับ Health ID) · `response_type` (Y = `"code"`) · `state` (**N — optional**, "random string ใช้ในการตรวจสอบความสัมพันธ์ระหว่าง request กับ response")
> ⚠️ mandate §D3 บังคับ state ≥128bit ใช้ครั้งเดียว — เอกสารให้เป็น optional แต่**ไม่ห้ามส่ง** → เราส่งเสมอได้ (จุดตรวจของ auditor คงเดิม)

**Token request (หน้า 4)**: `Content-type: application/x-www-form-urlencoded` — body: `grant_type` (Y = `"authorization_code"`) · `code` (Y) · `redirect_uri` (Y) · `client_id` (Y) · `client_secret` (Y — **backend เท่านั้น ตาม §D3**)

**Token response (หน้า 5)**: envelope `{status, data, message}`; data = `access_token` · `token_type` ("Bearer") · `expires_in` (Int — ตัวอย่าง `31535998` ≈ 365 วัน) · `expiration_date` · `account_id` (string — ไอดีของผู้ใช้งาน)
> ⚠️ **ไม่มี CID/เลขบัตรใน response** และ**เล่มนี้ไม่มี profile endpoint ของ Health ID ฝั่งประชาชน** — BLOCKER-2 ฝั่งเกษตรกรยังไม่ปิด ต้องรอเอกสาร Health ID ประชาชน
> ⚠️ ไม่มี `refresh_token` ในเอกสาร — ห้าม implement (จดตาม §D3 "เอกสารไม่ระบุ = ห้ามเดา")

**Error codes (หน้า 5)**: 401 `Credential is required` · 422 `Access grant has denied` / `Code is invalid` / `Redirect uri is invalid` / `Code and Client ID not match.` / `Code has been expired` · 500 `Server error`

## ส่วนที่ 2 — Provider ID (หน้า 6-15)
| ขา | UAT | Production |
|---|---|---|
| Base URL (หน้า 6) | `https://uat-provider.id.th` | `https://provider.id.th` |
| Token exchange (POST, หน้า 7) | `{Provider-URL}/api/v1/services/token` | เดียวกัน |
| Profile (GET, หน้า 9) | `{Provider-URL}/api/v1/services/profile` | เดียวกัน |
| Public key (POST, หน้า 14) | `{Provider-URL}/api/v1/services/public-key` | เดียวกัน |

**ขั้นตอน (หน้า 6)**: เอา `access_token` ของ Health ID มาแลก token ของ Provider ID — **มี Provider ID → 200 OK / ไม่ใช่ Provider → 400 Bad Request "เข้าใช้งานไม่ได้"**
> ✅ ตรงกับ mandate §D4 "Provider ID ห้าม auto-provision — ไม่พบ = ปฏิเสธ" โดยพฤติกรรมของ IdP เอง (ฝั่งเรายังต้อง match ทะเบียนเจ้าหน้าที่ซ้ำอีกชั้น)

**Token exchange request (หน้า 7, JSON)**: `client_id` (Y — ของระบบ Provider ID) · `secret_key` (Y) · `token_by` (Y = `"Health ID"`) · `token` (Y = Health ID access_token)
**Response (หน้า 7-8)**: `access_token` ("Bearer", ตัวอย่าง `expires_in` `86400` = 24 ชม.) · `expiration_date` · `account_id` · `result` · `username` · `login_by` (`"access_token_health_id"`)
**Errors (หน้า 8)**: 400 `This user has not provider id` / `The requested parameter can not used.` · 401 `Authentication is required...` (client_id+secret_key ผิด/ขาด หรือ token_by ไม่ใช่ "Health ID") · 500

**Profile request (หน้า 9)**: headers `Authorization: Bearer {provider_access_token}` + `client-id` + `secret-key`; optional params: `moph_center_token` · `moph_idp_permission` (ขอ `is_hr_admin`/`is_director`) · `position_type`
**Profile response (หน้า 10-12) — field เด่นที่เกี่ยวกับ identity**:
- `account_id` (string) — ไอดีผู้ใช้งาน (**candidate external subject ที่เสถียรที่สุดในเอกสาร**)
- **`hash_cid` (string) — "Hash CID ของผู้ใช้งาน"** (ตัวอย่าง = hex 64 ตัว รูปทรง SHA-256) — **เอกสารไม่ระบุ algorithm/salt** → §B2 ห้ามเดา: ถ้าเป็น `sha256(CID)` เพียว จะ match กับ `User.providerIdHash` ของเราได้ตรง ๆ โดยไม่แตะ CID plaintext เลย แต่**ต้องยืนยันกับ สธ. ก่อน** → ธง **D-MANUAL-HASHCID**
- `provider_id` (string) — เลข Provider (ตัวอย่างมีอักษรปนตัวเลข ไม่ใช่เลขบัตร 13 หลัก → **match กับทะเบียนเราด้วยค่านี้ไม่ได้** เพราะ `User.providerId` ของเราคือเลขบัตร)
- ชื่อ-สกุล th/en + `special_title_th/en` + `organization[]` (`business_id`, `position`, `hcode`, `hname_th/eng`, `tax_id`, `license_expired_date`, `expertise`, `is_hr_admin`, `is_director`, `address.*`, `position_type`) + `organization.moph_access_token_idp[_fdh|_pcu]` (MOPH-JWT)
**Errors (หน้า 12)**: 400 param ขาด · 401 `access_token is invalid` / client ผิด · 404 `This user has no provider id` / `The requested resource was not found` · 500 · 503

**Public key (หน้า 14)**: POST body `client_id`+`secret_key` → PEM public key (สำหรับ verify MOPH-JWT)

## ผลต่อธง/BLOCKER (อัปเดต 2026-08-03 หลังอ่าน [P-OAUTH])
- **BLOCKER-2 ฝั่งเจ้าหน้าที่ (Provider ID): ตอบแล้วบางส่วน** — external subject ที่เอกสารให้ = `account_id`; ตัวเชื่อมกับทะเบียนเรา = `hash_cid` (**รอยืนยัน algorithm — ธง D-MANUAL-HASHCID**); ไม่มี CID plaintext ใน response ใด
- **BLOCKER-2 ฝั่งเกษตรกร (Health ID): ยังไม่ปิด** — เล่มนี้ไม่มี profile endpoint ประชาชน → รอเอกสาร Health ID ประชาชน (mandate §B1 รายการ 2)
- **B1-CRED ยังอยู่**: ต้องมี client_id+client_secret (Health ID) และ client_id+secret_key (Provider ID) จากการลงทะเบียน — ยังไม่มีของจริง ทุก provider คง `coming_soon`
- **สิ่งที่เอกสารไม่กล่าวถึง (ห้าม implement — จดตาม §D3/§E)**: PKCE · refresh token · logout/revoke ฝั่ง Health ID · re-auth/prompt parameter (ผูก E-5 PDPA ม.33) · TTL ของ code

---

# ThaID — กรมการปกครอง (สำนักบริหารการทะเบียน)

## เอกสารอ้างอิง (operator ถือไฟล์ — **ไม่ commit ลงรีโป** เพราะหน้า 1 ทั้งสองเล่มประกาศ "เอกสารควบคุม... ห้ามทำสำเนาหรือพิมพ์เผยแพร่... ก่อนได้รับอนุญาต")
| รหัสอ้าง | ชื่อเอกสาร | รุ่น | วันที่ | หน้า | SHA-256 |
|---|---|---|---|---|---|
| **[T-SBX]** | (ร่าง) การพัฒนา API บน Sandbox สำหรับผู้ให้บริการ (Relying Party: RP) | 1.0.0 | 7 ส.ค. 2567 | 19 | `be5f7370...8f15f0c` |
| **[T-PRD]** | การพัฒนา API สำหรับผู้ให้บริการ (Relying Party: RP) | 1.1.0 | 7 ส.ค. 2567 | 17 | `f4e71fae...306f69a6` |

## Endpoints (T-SBX §6 หน้า 7-16 · T-PRD §6 หน้า 7-16)
| ขา | Sandbox [T-SBX] | Production [T-PRD] |
|---|---|---|
| Authorize (GET) | `https://imauthsbx.bora.dopa.go.th/api/v2/oauth2/auth/` (§6.1.1 หน้า 7) | `https://imauth.bora.dopa.go.th/api/v2/oauth2/auth/` (§6.1.1 หน้า 7) |
| Token (POST) | `.../api/v2/oauth2/token/` (§6.2.1 หน้า 10) | `.../api/v2/oauth2/token/` (§6.2.1 หน้า 10) |
| Introspect (POST) | `.../api/v2/oauth2/introspect/` (§6.3.1 หน้า 14) | `.../api/v2/oauth2/introspect/` (§6.3.1 หน้า 14) |
| Revoke (POST) | `.../api/v2/oauth2/revoke/` (§6.4.1 หน้า 16) | `.../api/v2/oauth2/revoke/` (§6.4.1 หน้า 16) |
| OIDC discovery | `https://imauthsbx.bora.dopa.go.th/.well-known/openid-configuration` (§6.2.2 หมายเหตุ หน้า 11) | `https://imauth.bora.dopa.go.th/.well-known/openid-configuration` (§6.2.2 หมายเหตุ หน้า 11) |

## Authorization request (ทั้งสองเล่ม §6.1.1)
- `response_type=code` — authorization code flow (ตรง mandate §B3)
- `client_id` — ค่าที่กรมการปกครองออกให้ RP ที่ลงทะเบียนแล้ว
- `redirect_uri` — **ต้องเป็นค่าที่ลงทะเบียนไว้กับกรมการปกครอง** (ตรง mandate §D3 "exact match จาก allowlist")
- `scope` — space-separated; ค่าที่เปิดให้ขอ: `pid`, `name`, `name_en`, `birthdate`, `address`, `given_name`, `middle_name`, `family_name`, `given_name_en`, `middle_name_en`, `family_name_en`, `gender`, `smartcard_code`, `title`, `title_en`, `ial`, `date_of_issuance`, `date_of_expiry`, `house_address`, `openid` (T-SBX หน้า 7-8 ข้อ 1-20 · T-PRD หน้า 7-8 — T-SBX มี `middle_name` ที่ T-PRD 1.1.0 ไม่แสดงเลขข้อ 20)
- `state` — "random string ใช้ในการตรวจสอบความสัมพันธ์ระหว่าง request กับ response" และกติกา §7 ท้ายเล่ม: "ทุก request parameters จะต้องมีการกำหนดค่า ยกเว้นที่ระบุไว้เป็น [optional]" → **`state` = required** (ตรง mandate §D3 state ≥128bit ผูก session ใช้ครั้งเดียว — เอกสารไม่กำหนดความยาว ระบบเรากำหนดเข้มกว่าได้)

## Callback (§6.1.2-6.1.3)
- สำเร็จ: 302 → `{redirect_uri}?code=...&state=...`
- ผู้ใช้ปฏิเสธ/ผิดพลาด: 302 → `{redirect_uri}?error=...&error_description=...&state=...` — error ที่ต้อง handle ตาม mandate §D3 "ผู้ใช้กด deny": `401 user_denied — User denied the request (disapproved)` (§7 ตาราง error ทั้งสองเล่ม)

## Token request (§6.2.1) — **confidential client ตรง mandate §D3**
- Header `Authorization: Basic Base64(client_id:client_secret)` → แลก code ที่ backend เท่านั้น `client_secret` ไม่มีทางอยู่ฝั่ง FE
- Body: `grant_type=authorization_code`, `code`, `redirect_uri` (ค่าเดียวกับตอน authorize)

## Token response (§6.2.2)
- `access_token` — **อายุ 15 นาที** · `token_type: Bearer` · `expire_in` (unix timestamp วินาที) · `scope`
- ไม่ขอ `openid` → ค่าของแต่ละ scope มากับ token response ตรง ๆ (เช่น `"pid": "..."`)
- ขอ `openid` → ได้ `id_token` (JWT, ลง signature โดยกรมการปกครอง, verify ผ่าน `.well-known/openid-configuration`) และ**ค่า scope จะอยู่ใน id_token แทน** (หมายเหตุ ** ของ §6.2.2)
- id_token claims (§6.2.3): `at_hash`, `aud`, `exp`, `iat`, `iss`, `sub`, + scope values

## Introspect (§6.3) / Revoke (§6.4)
- Introspect: POST + Basic auth, body `token=...` → `{ "active": true, "sub": "<เลข 13 หลัก>", "scope": "..." }` (ตัวอย่างในเอกสาร `sub` เป็นเลข 13 หลัก)
- Revoke: POST + Basic auth → `{ "status": "OK", "message": "revoked" }`

## ✅ คำตอบ BLOCKER-2 (ฝั่ง ThaID): **CID มีให้จริง**
- scope `pid` = "หมายเลขประจำตัวประชาชน 13 หลัก" (§6.1.1 ทั้งสองเล่ม) — มากับ token response หรือใน id_token
- ตัวอย่าง introspect `sub` = เลข 13 หลัก → subject ของ ThaID คือ CID ไม่ใช่ pseudonymous id
→ account linking ตาม `mandate.md:53` (match CID) **ทำได้กับ ThaID** — เหลือยืนยันฝั่ง Health ID (สธ.) / Provider ID จากคู่มือของ สธ. เท่านั้น

## ⚠️ สิ่งที่เอกสาร**ไม่**กล่าวถึง (mandate §D3/§E: ห้ามเดา — จดไว้ตรงนี้ตามคำสั่ง)
| เรื่อง | ผลต่อ implementation |
|---|---|
| **PKCE** (`code_challenge`/`code_verifier`) — ไม่ปรากฏทั้งสองเล่ม | ตาม §D3: "ไม่ระบุ = ไม่ใส่ + จดใน manual-citations ว่าเอกสารไม่กล่าวถึง" → **ThaID adapter ไม่ใส่ PKCE** |
| `nonce` สำหรับ OIDC — ไม่ปรากฏ | ไม่ใส่; กัน replay ด้วย `state` ใช้ครั้งเดียวฝั่งเรา |
| `prompt`/`max_age`/re-authentication parameter — ไม่ปรากฏ | **กระทบ E-5**: บังคับ re-auth ผ่าน ThaID ทำได้แค่ "เริ่ม authorize flow ใหม่" ซึ่งผู้ใช้ต้องยืนยันในแอปทุกครั้งอยู่แล้ว แต่ไม่มี parameter รับประกัน fresh authentication |
| อายุ `refresh_token` / endpoint refresh | **เอกสารขัดกันเอง**: T-PRD ประวัติรุ่น 0.0.04 (18 ธ.ค. 2563) เขียน "นำ Refresh Token ออก" แต่ตัวอย่าง §6.2.2 ทั้งสองเล่มยังแสดง `"refresh_token"` และตาราง §7 มี error `invalid_refresh_token` 3 รายการ — **ห้ามพึ่ง refresh token จนกว่าจะยืนยันกับกรมการปกครอง**; ออกแบบโดยถือว่า access token อายุ 15 นาทีคือทั้งหมดที่มี (session ของเราเป็นของเราเอง ไม่ผูกอายุ token ของ IdP) |
| ความยาว/รูปแบบ `state` | เอกสารบอกแค่ "random string" → ใช้เกณฑ์ mandate §D3 (≥128bit) ซึ่งเข้มกว่า |

## Sandbox (T-SBX §8-9 หน้า 18-19)
- Sandbox มี**เว็บไซต์ยืนยันตัวตนแทนแอป ThaID** — แก้เลขประจำตัวประชาชนได้ ข้อมูลอื่นคงที่ → ใช้ทำ E2E จริงกับ UAT ได้โดยไม่ต้องมีแอป
- credential กลางของ Sandbox (api_key / client_id / client_secret / basic_token) พิมพ์อยู่ใน **T-SBX หน้า 19** — เป็น credential สาธารณะที่กรมฯ แจกใน manual แต่**ไม่คัดลอกมาลงรีโป** (Law 3.3 no-secret; ใช้จาก `.env` local เท่านั้น) · redirect_uri กับ credential ชุดนี้ "กำหนดเป็นอะไรก็ได้"
- การขึ้นทะเบียน production: หนังสือราชการถึงกรมการปกครอง อนุมัติโดยอธิบดีเท่านั้น (§3-4 ทั้งสองเล่ม) → สถานะคำขอของเราติดตามใน `oauth-registration-status.md` (ธง B1-CRED ยังอยู่จนกว่า credentials production จะมา)

## ผลต่อธง
- **C1-THAID-DOC → ปลด** (ได้เอกสาร partner จริงทั้ง UAT+Production แล้ว adapter สร้างตามเอกสารได้เลย ไม่ใช่ "โครง OAuth มาตรฐาน + รอ verify" อีกต่อไป)
- **B1-CRED → ยังอยู่** (client_id/secret production ของเรายังไม่ออก — ThaID ยังต้อง `coming_soon` ตาม SSOT)
- **D-MANUAL → แคบลง** เหลือเฉพาะแถว "ไม่กล่าวถึง" ในตารางข้างบน + คู่มือ Health ID/Provider ID ที่ยังไม่มา
