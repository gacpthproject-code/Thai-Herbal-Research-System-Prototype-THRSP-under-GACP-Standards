# AUTH-01-A / A4 — CID ลดชั้นเป็น "ข้อมูลการรับรอง" ไม่ใช่กุญแจ resolve session

> **สถานะ: EXPAND เท่านั้น — PR นี้ยังไม่ถอดอะไรทั้งสิ้น**
> ทุกจุดในเอกสารนี้ยังทำงานเหมือนเดิมทุกประการหลัง `20260804013000_add_identity_links`
> เอกสารนี้คือ *รายการของ CONTRACT phase* (PR แยก หลัง drain probe ผ่าน — Law 3.10)
> ไม่ใช่รายการงานที่ทำไปแล้ว

## ปัญหาที่รายการนี้อธิบาย

`users.healthId` / `users.providerId` = **เลขบัตรประชาชน (CID)** (schema/auth.prisma:32,39)
วันนี้มันไม่ได้ทำหน้าที่ "ข้อมูลการรับรองว่าคนนี้คือใคร" อย่างเดียว — มันคือ **กุญแจที่
เปิด session** เพราะ login resolve แถว users จาก hash ของมันตรง ๆ ผลตามมาสองข้อ:

1. ใครถือเลข 13 หลัก + รหัสผ่าน = เข้าได้ ระบบไม่มีชั้นแยกระหว่าง "ยืนยันว่าเป็นใคร"
   กับ "ค้นหาว่าเป็นแถวไหน"
2. คนหนึ่งคนผูก IdP ได้ช่องทางเดียวตลอดชีพ เพราะ `users_single_identity_ck`
   (migrations/20260207120000_identity_guardrails/migration.sql:17) ห้ามแถวเดียวถือ
   ทั้ง healthId และ providerId

`identity_links` แก้ข้อ 2 แล้วในชั้นข้อมูล (พิสูจน์: `evidence/AUTH-01/A/green-a1-a2-a5-sql.txt`
เช็ก C5 — user คนเดียวถือครบสี่ provider โดย constraint เดิมไม่ถูกแตะ) ข้อ 1 คือสิ่งที่
รายการข้างล่างต้องถอด

## จุดที่ยังใช้ CID resolve session (= รายการที่ CONTRACT phase ต้องถอด)

### C-1 — เส้น login หลัก (HEALTH + legacy)
| ที่ | สิ่งที่ทำ |
|---|---|
| `apps/backend/services/prisma-auth-service.js:307-309` | เลือกคอลัมน์ lookup: `idCardHash`/`healthIdHash`/`providerIdHash` (หรือคู่ `*Hmac` เมื่อ `AUTH_LOOKUP_USE_HMAC`) |
| `apps/backend/services/prisma-auth-service.js:311-317` | `whereClause.OR` = hash ของเลขบัตร 3 คอลัมน์ — **นี่คือจุดที่ session ถูก resolve จาก CID** |
| `apps/backend/services/prisma-auth-service.js:318-329` | เมื่อมี hint `healthId`/`providerId` สลับลำดับคอลัมน์ แต่ยังเป็น hash ของ CID ทั้งหมด |
| `apps/backend/services/prisma-auth-service.js:330` | `prisma.user.findFirst({ where: whereClause })` — แถวที่ได้คือเจ้าของ session |
| `apps/backend/services/prisma-auth-service.js:297-303` | บังคับว่า identifier ต้องเป็นเลข 13 หลักเท่านั้น ไม่งั้นปฏิเสธก่อน query — กติกานี้จะไม่จริงอีกต่อไปเมื่อ subject ของ IdP (opaque, ไม่ใช่ 13 หลัก) กลายเป็นกุญแจ |
| `apps/backend/routes/api/auth/auth-health.js:60` | route ต้นทางของเส้นนี้ |

**ถอดเป็น**: resolve ผ่าน `identity_links(provider, subject)` → `userId`
(พิสูจน์ว่าทำได้แล้ว: `__tests__/integration/identity-links.test.js` เทสต์ (6) และ
เช็ก C6 ใน `green-a1-a2-a5-sql.txt` — resolve สำเร็จกับ user ที่ `idCardHash`,
`healthIdHash`, `providerIdHash` เป็น NULL ทั้งสามคอลัมน์)

### C-2 — เส้น login ของเจ้าหน้าที่ (PROVIDER)
| ที่ | สิ่งที่ทำ |
|---|---|
| `apps/backend/routes/api/auth/auth-provider.js:72-75` | เลือก `providerIdHash`/`providerIdHmac` แล้วส่งให้ service |
| `apps/backend/services/provider-user-service.js:386-395` | `findProviderForLoginByHash` — `prisma.user.findFirst({ where: { [providerIdHash|providerIdHmac]: … } })` |

**ถอดเป็น**: `identity_links` provider='providerid' (ต้องรอปลดธง **D-MANUAL-HASHCID**
ก่อน — วันนี้ยังไม่มีสิทธิ์เขียน row ของ provider จริง)

> ⚠️ **แก้ 2026-08-04 หลัง audit รอบ 3 — ย่อหน้าเดิมของหัวข้อนี้อ้างเกินจริง**
> เคยเขียนว่าข้อห้าม "ห้ามเขียน row ของ provider จริง" มี grep-pin เทสต์ที่ 4 และ 5
> คอยจับ · **เทสต์ทั้งสองตัวถูกถอดออกแล้ว** เพราะจับผิดโค้ดที่ถูกต้อง (ไฟล์ที่ **อ่าน**
> `identity_links` แล้วมี `prisma.user.update` ที่ไม่เกี่ยวข้องอยู่ในไฟล์เดียวกันจะแดง)
> รายละเอียด `evidence/AUTH-01/A/audit-round3-verdict.md`
>
> **ข้อห้ามนี้ไม่มีเครื่องมืออัตโนมัติบังคับแล้ว** — ตัวบังคับคือคำสั่ง operator +
> **code review ของคน** บน PR ที่ปลดธง · CI ไม่ได้ตรวจข้อนี้เลย
>
> pin ที่เหลือ (เทสต์ 1-3) ตรึงได้แค่ *"ไม่มีการอ่าน `provider_id` แล้วเขียนลง
> `providerId*` ในระยะใกล้กันในไฟล์เดียว"* และ **ไม่ครอบ** การเขียนผ่านตัวแปร /
> พารามิเตอร์ / computed key / destructure-rename + shorthand / raw SQL ที่ชื่อคอลัมน์
> อยู่ใน double quote / dataflow ข้ามไฟล์ · งานที่จะปิดช่องนี้จริงคือ **AST-based check**
> ที่ตอบได้ว่า "อะไรคือการเขียน" เชิงโครงสร้าง (BACKLOG — auditor สามรอบชี้ตรงกัน)

> ⚠️ `subject` ของ provider='providerid' **ห้าม**เป็น MOPH `provider_id`
> (เลขใบประกอบวิชาชีพ) และ **ห้าม**ถูกเขียนลง `users.providerId` (เลขบัตรประชาชน)
> — คนละของกัน คำสั่ง operator ห้าม map เข้าหากันเด็ดขาด

### C-3 — identity ที่ middleware แนบให้ทุก request หลัง login
| ที่ | สิ่งที่ทำ |
|---|---|
| `apps/backend/middleware/auth-middleware.js:162-172` | `fetchIdentityFromDb` select `healthId`, `providerId`, `healthIdHmac`, `providerIdHmac` |
| `apps/backend/middleware/auth-middleware.js:185-188` | `canonicalId = providerIdHmac ?? healthIdHmac` (flag ON) หรือ `healthId ?? providerId` (flag OFF) — **CID กลายเป็น FK key ของทั้งระบบ** |
| `apps/backend/middleware/auth-middleware.js:193-200` | fallback อ่าน `decoded.healthId` / `decoded.providerId` จาก JWT รุ่นเก่า |
| `apps/backend/middleware/auth-middleware.js:510,658,835,902` | แนบ `providerId` ลง `req.user` ให้ทุก handler ปลายทาง |

**หมายเหตุขอบเขต**: จุดนี้ผูกกับ Detokenize STAGE A/B/C (re-key `canonicalId`) ซึ่งเป็น
mission คนละตัว — CONTRACT ของ AUTH-01 ต้อง**ไม่**ไปแตะลำดับ re-key นั้นเอง แต่ต้อง
รอให้ `canonicalId` เลิกเป็นค่าที่ derive จาก CID ก่อน ไม่งั้นถอด login ได้แต่ FK key
ยังเป็น CID อยู่ดี

### C-4 — จุดที่ยัง lookup ผู้ใช้/นิติบุคคลด้วย CID (ไม่ใช่ session resolve โดยตรง แต่ตกค้างในเส้นเดียวกัน)
| ที่ | สิ่งที่ทำ |
|---|---|
| `apps/backend/services/user-lookup-service.js:191-205` | `findUserByProviderIdSecurely` — หา user จาก `providerIdHash`/`providerIdHmac` (`:193-199`) แล้ว fallback เป็น plaintext `providerId` (`:201-205`) |
| `apps/backend/services/user-lookup-service.js:112-164` | `findUserByHealthIdSecurely` — คู่แฝดฝั่ง healthId: hash lookup ที่ `:148-152` (`healthIdHash`/`healthIdHmac`) แล้ว fallback plaintext `healthId` ที่ `:160-164` **นี่คือตัวที่ caller เยอะที่สุดในรายการนี้** |
| `apps/backend/services/user-lookup-service.js:217-220` | `resolveUserIdFromHealthIdSecurely` — wrapper ที่คืนแค่ `user.id` ทำให้ caller ปลายทางไม่รู้ตัวว่ากำลัง resolve ด้วย CID |
| `apps/backend/services/prisma-auth-service.js:549-574` | `checkIdentifierExists` — เส้น **สมัคร**: resolve จาก `idCardHmac`/`idCardHash` (`:571`), `taxIdHmac`/`taxIdHash` (`:564`), `communityRegistrationNoHmac`/`communityRegistrationNoHash` (`:567`) แล้ว `prisma.user.findFirst({ where })` ที่ `:574` — CID ตัดสิน "มีคนนี้แล้วหรือยัง" ตั้งแต่ก่อนมี user |
| `apps/backend/middleware/active-entity-middleware.js:89-108` | หา Entity ของผู้ใช้จาก `computeLookupHmac(reqUser.healthId)` → `thaiCitizenIdHmac`/`thaiCitizenIdHash` |
| `apps/backend/routes/api/admin/users.js:210` | ค้นหา user ในหน้าแอดมินด้วย `computeLookupHmac(queryDigits)` |

**caller ของ `findUserByHealthIdSecurely` (ต้องถอดพร้อมกัน ไม่งั้นเหลือเส้นเงียบ)** —
รายการเต็มจาก `grep -rn "findUserByHealthIdSecurely\|resolveUserIdFromHealthIdSecurely"`
บน `apps/backend/{services,routes,middleware,jobs,utils,controllers,shared,modules}`:

| caller | บรรทัดที่เรียก |
|---|---|
| `apps/backend/services/pdpa-erasure-service.js` | `:213` (require `:95`) |
| `apps/backend/services/entity-service.js` | `:1672` (require `:18`) |
| `apps/backend/services/decision-letter-service.js` | `:70` (require `:48`) |
| `apps/backend/services/customer-statement-service.js` | `:333` (require `:69`) |
| `apps/backend/services/traceability-service.js` | `:208` (require `:2`) |
| `apps/backend/services/application-service/application-draft-query-methods.js` | `:140` (require `:3`) |
| `apps/backend/services/application-service/application-identity-methods.js` | `:91`, `:152` (inject ผ่าน default arg `:76`) |
| `apps/backend/routes/api/audit/audits.js` | `:300` (require `:43`) |
| `apps/backend/routes/api/provider/handlers/shared.js` | `:28` — ผ่าน `resolveUserIdFromHealthIdSecurely` (require `:2`) |
| `apps/backend/routes/api/finance/quotes.js` | `:60` — ผ่าน `resolveUserIdFromHealthIdSecurely` (require `:33`) |

**ถอดเป็น**: จุดที่เป็น "ค้นหาเพื่อแสดงผล/ผูก entity" ไม่จำเป็นต้องถอดพร้อม session
แต่ต้องอยู่ในรายการ ไม่งั้น CID จะยังเป็นกุญแจ de-facto ต่อไปหลัง login ถอดเสร็จ
โดยเฉพาะ `findUserByHealthIdSecurely` ที่มี caller 8 จุด และ `checkIdentifierExists`
ที่อยู่บนเส้นสมัคร — ทั้งสองตัวนี้ทำให้ CID ยังเป็นกุญแจ "หาแถวไหน" แม้ login จะเลิกใช้แล้ว

### C-5 — จุดที่ **เขียน** CID hash ตอนสมัคร (ต้องถอดเป็นลำดับสุดท้าย)
| ที่ | สิ่งที่ทำ |
|---|---|
| `apps/backend/services/prisma-auth-service.js:152-167` | คำนวณ `idCardHash` / `healthIdHash` / `providerIdHash` (+ `*Hmac`) |
| `apps/backend/services/prisma-auth-service.js:232-237` | เขียนลง `users` ตอน `user.create` |
| `apps/backend/services/prisma-auth-service.js:214-220` | `canonicalId` ถูก derive จาก hmac ของ CID ตอนสร้าง |

**ถอดเป็น**: `user.create` + `identityLink.create(provider='local', subject=user.id)`
ในทรานแซกชันเดียว คอลัมน์ CID เหลือไว้เป็น "ข้อมูลการรับรอง" (เก็บ/แสดง/ตรวจสอบ)
ไม่ใช่กุญแจ

## ลำดับที่ CONTRACT ต้องเดิน (ห้ามสลับ)

1. เขียน `identity_links(provider='local')` ให้ user ใหม่ทุกคนตอนสมัคร (EXPAND ต่อ — ยังไม่ถอดอะไร)
2. login resolve ผ่าน `identity_links` ก่อน แล้ว fallback ไปเส้น hash เดิม (dual-read)
3. drain probe: ไม่มี request ไหน fallback ถึงเส้นเดิมอีก ติดต่อกัน ≥ 1 production release
4. ถอด C-1 / C-2 (CONTRACT จริง)
5. C-3 รอ Detokenize STAGE A/B/C แล้วค่อยถอด
6. C-4 / C-5 ปิดท้าย

## ข้อที่ยัง **ไม่**อยู่ในรายการนี้ (นอกขอบเขต AUTH-01-A)

- ธง **D-MANUAL-HASHCID** ยังไม่ปลด → ห้ามเขียน row ของ provider จริงลง `identity_links`
  (evidence/AUTH-01/plan.md:3) — ข้อ 1 ข้างบนจึงจำกัดที่ `provider='local'` เท่านั้น
- ธง **B1-CRED** → provider จริงทุกตัวยัง `coming_soon` (config/auth-providers.js:26-32)
- การถอด local login ทั้งเส้น = หยุดถาวรใน AUTH-01 (mandate §F0.6; plan.md:39)
