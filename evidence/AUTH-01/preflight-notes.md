# AUTH-01 — preflight notes (orchestrator, 2026-08-03)
> เขียนตอน stage — **ยังไม่เริ่มงาน** (precondition ไม่ผ่าน) นี่คือของที่ตรวจได้ถูก ๆ ล่วงหน้าเพื่อไม่ให้ spec-reader เสียรอบ

## 1. PRECONDITION — ไม่ผ่าน (ยืนยัน 2026-08-03)
| PR | สถานะจริง |
|---|---|
| #721 `feat/stripe-payment-wave-2` | **open, draft, ยังไม่ merged** (CI เขียว) |
| #722 `feat/w2-03-checkout-ui` | **open, draft, ยังไม่ merged** (CI ยังไม่เคยรัน — base ไม่ใช่ main) |
| #723 `fix/terminal-integrity-hotfix` (R1) | open, draft, CI เขียว — รอ merge (ไม่ใช่ precondition ของ AUTH-01 แต่อยู่คิวก่อน) |

→ AUTH-01 = `BLOCKED(precondition)` ไม่เริ่ม §A bootstrap

## 2. C1 — "DTAM Next footprint" อยู่ที่ deployment ไม่ใช่ในเรโปนี้
- `grep -rniE "dtam.?next"` ใน `apps/web-app/src` + `apps/web-app/public` = **0**
- `grep "dtamnext.one.th"` / `one.th` ใน `apps/**/*.{ts,tsx,dart}` = **0**
- operator ระบุ footprint = `https://uat-dtamnext.one.th/home-page` (deployment URL)
- **สิ่งที่มีจริงในเรโป: 14 จุด ทั้งหมดอยู่ backend และเป็น partner-integration identifier ไม่ใช่ branding**:
  `routes/api/integration/interoperability.js:66,439,463` · `routes/api/interoperability/interoperability-resolve.js:4` · `services/partner-access-log.js:4` · `middleware/rate-limiter.js:64` · `__tests__/unit/interop-resolve.test.js` (`partnerId: 'dtam-next'`, `INTEROP_PARTNER_API_KEYS`)
  → DTAM Next คือ **ระบบพาร์ตเนอร์กลางน้ำ/ปลายน้ำที่เรียก resolver ของเรา** (owner directive 2026-07-08) — **ลบ = พัง integration ที่ใช้งานจริง**

### 2.1 CLARIFIED โดย operator (ภาพหน้าจอ 4 รูป, 2026-08-03)
**DTAM Next = คนละระบบกับ GACP** — เป็นระบบ telemedicine/นัดหมายของกรมการแพทย์แผนไทยฯ ("เชื่อมต่อบริการการแพทย์แผนไทยและการแพทย์ทางเลือก ผ่านระบบนัดหมาย ปรึกษาแพทย์ และติดตามการรักษาออนไลน์") หน้า login ของมันคือ **design reference** ที่ AUTH-01 จะทำตามโครง แต่ต้องเป็น branding GACP ทั้งหมด
→ grep-pin `dtam.?next` = 0 จึงเป็น **guard กันลอก branding เขาติดมา** ไม่ใช่การไล่ลบของเดิมในเรโป (เรโปนี้ = 0 อยู่แล้ว)

**โครงที่เห็นจากภาพ (design reference — ให้ implementer ทำตามโครงนี้ด้วย branding GACP):**
1. **Landing** — โลโก้กรมฯ + wordmark + tagline + badge เวอร์ชัน (`v 1.0`); เส้นคั่น "เข้าใช้งานระบบ"; **สอง card**: ซ้าย **ประชาชน** (โทนเขียว, ไอคอนคน) / ขวา **เจ้าหน้าที่** (โทนส้ม, ไอคอนบัตร) — แต่ละ card มี: หัวข้อ + คำอธิบาย 1-2 บรรทัด + **bullet ✓ 3 ข้อ** + ปุ่ม "เข้าสู่ระบบ" เต็มความกว้าง (เขียวเข้ม / ส้ม); footer: นโยบายความเป็นส่วนตัว | Privacy Notice | เงื่อนไขการใช้งาน | Q&A | ติดต่อสนับสนุน + บรรทัดลิขสิทธิ์กรมฯ
   → GACP: bullet ต้องเขียนใหม่ตาม C3 (ยื่นคำขอ/ติดตามสถานะ/ชำระค่าธรรมเนียม | ตรวจคำขอ/นัดตรวจ/ออกใบรับรอง)
2. **Dialog dev/prod** (คือ "dialog dev-prod ที่อ้าง dtamnext.one.th" ใน C1) — modal ไอคอนตกใจแดง: "โปรดอ่าน : คุณต้องการใช้งาน ระบบทดสอบ dev-dtamnext.one.th ใช่หรือไม่?" + คำอธิบายว่าข้อมูลอาจถูกรีเซ็ต + ปุ่ม "ไม่ใช่ ต้องการไปยัง Production(...)" / "ใช่"
   → **C6 สั่งแทนด้วย env badge** (ไม่ใช้ modal บล็อกทาง)
3. **ประชาชน → เลือกช่องทาง**: การ์ดเดียว "กรุณาเลือกช่องทางการเข้าสู่ระบบ" + ปุ่ม **"เข้าสู่ระบบด้วย Health ID"** (โลโก้ HEALTH iD) + **"เข้าสู่ระบบด้วย ThaID"** (โลโก้ ThaID) + ลิงก์ "← กลับหน้าหลัก"
4. **เจ้าหน้าที่ → เลือกช่องทาง**: **"เข้าสู่ระบบด้วย Provider ID"** (โลโก้ PROVIDER iD) + **"เข้าสู่ระบบด้วย ThaID"** + ลิงก์ "สมัครเป็นผู้ดูแลระบบ" + "← กลับหน้าหลัก"

**Asset ที่ต้องหา (C5)** — ภาพยืนยันว่ามีโลโก้ทางการ 3 ตัวใช้จริง: `HEALTH iD`, `PROVIDER iD`, `ThaID` → ต้องได้จากแหล่งทางการเท่านั้น ลงที่มาใน `asset-sources.md` **ห้ามวาดเลียนแบบจากภาพนี้**

**[ANSWERED 2026-08-03]** หน้า login ปัจจุบัน = **แทนที่** ด้วยโครงนี้ ไม่ทำหน้าซ้อน — โดย dev/local login เดิมต้องอยู่ในโครงใหม่ และ **route/session path ที่ระบบอื่นอ้างถึงห้ามเปลี่ยน** (spec-reader ต้อง enumerate ผู้อ้างอิงทั้งหมดก่อน + pin ด้วย test)
**grep-pin `dtam.?next` = 0 scope ที่ `apps/web-app/src` + `public/` เท่านั้น — ห้ามขยายไป backend เด็ดขาด (14 จุดนั้นคือ partner integration ที่ใช้งานจริง)**

## 3. C2 — ชื่อทางการระบบ — ANSWERED 2026-08-03: **"ระบบรับรองมาตรฐาน GACP"** (SSOT ทั้งหน้า login)
หลักฐานที่ใช้เสนอและ operator ยืนยัน:
- `docs/api/openapi.json:6` ("API Documentation สำหรับระบบรับรองมาตรฐาน GACP")
- `docs/contract/farmer-manual/GACP-Farmer-Manual.md:1`
- `apps/mobile-app/.../login_screen.dart:141` (title ปัจจุบันของหน้า login มือถือ)
- `docs/operations/handoff-2026-04.md:3`
→ **operator ยืนยันแล้ว** ใช้เป็น SSOT จนกว่าจะมีชื่อตามสัญญาแจ้งเปลี่ยน

## 4. Surface ของ login ปัจจุบัน (ข้อมูลดิบให้ spec-reader ต่อยอด)
- Web: `apps/web-app/src/app/auth/{health,provider,_components,clear-session}` — `_components/provider-login-page.tsx` มีการอ้าง thaid/health.id/provider.id อยู่แล้ว
- Backend auth: `apps/backend/routes/api/auth/{auth-health.js,auth-provider.js,public.js}`
- **ไม่มี OAuth surface เดิมเลย** (`grep -rlni "oauth"` ใน `apps/backend/{services,routes}` = 0) → D1-D5 คือของใหม่ทั้งหมด ไม่มี seam เดิมให้ต่อ

## 5. "UI-01" — RESOLVED 2026-08-03
operator ยืนยัน: **ไม่มี artifact แยก** — เนื้อหา UI-01 ถูกกลืนเข้า §C ของ AUTH-01 แล้ว implementer อ่านฉบับเดียวจบ **ห้ามไปตามหา**
"modal ทางการ" (§D2) ได้สเปกเต็มแล้ว: หัว "ขออภัยในความไม่สะดวก" + เนื้อความตาม D2 + ปุ่มเดียว "รับทราบ" + ปิดแล้ว focus กลับปุ่มต้นทาง
→ ข้อ 3 (ชื่อระบบ) และข้อนี้ **ปิดแล้ว** เหลือคำถามเปิด 0 ข้อสำหรับ §C

## 6. AMENDMENT 2026-08-03 (compliance กฎกระทรวง) — ผลต่อ preflight
1. **local login = TRANSITIONAL provider** (ไม่ใช่ "คงถาวร") → `AUTH_PROVIDERS` ต้องครอบ local ด้วย, test pin สอง state (local enabled วันนี้ / local disabled + external enabled ปลายทาง) ทุก flow หลักต้องเดินครบด้วย session จาก external authen, UI copy ระบุว่าเป็นช่องทางชั่วคราว
2. **§A0 AUTHEN-READINESS AUDIT ต้องทำก่อน implement** — จัดกอง (a) แก้ใน AUTH-01 / (b) EXPAND ใน AUTH-01 / (c) backlog; blocker = ธง STOP
3. **ห้ามถอด local login จริงใน AUTH-01** — งานแยกอนาคต เงื่อนไข: external enabled บน prod + ผ่าน parallel run

### Preflight สำหรับ §A0 (ตรวจถูก ๆ ไว้ให้ spec-reader ต่อยอด — ยังไม่ใช่คำตอบ)
สัญญาณจาก surface ที่เห็นแล้ว (ต้องให้ spec-reader ยืนยัน file:line ครบ):
- Local credential surface มีจริง: `apps/backend/routes/api/auth/auth-health.js`, `auth-provider.js`, `public.js` (login flow ปัจจุบันทั้งหมด)
- ยังไม่มี OAuth surface ใด ๆ ใน backend (`grep -rlni "oauth"` ใน `services/`+`routes/` = 0) → external subject field (ข้อ b) **น่าจะยังไม่มี** ต้อง EXPAND — spec-reader ยืนยันกับ schema จริง (`prisma/schema/identity*.prisma` / Health ID + Provider ID model)
- ตัวที่ต้องไล่เป็นพิเศษตามข้อ (a)/(c): re-auth/forgot-password, `middleware/` ที่อ่าน session, audit log ที่บันทึก actor, session refresh/rotate — ทั้งหมดต้องรองรับ session ที่ **ไม่มี password** อยู่เบื้องหลัง

## 7. สถานะคำถามเปิด (2026-08-03 หลัง operator ตอบครบ)
| คำถาม | สถานะ |
|---|---|
| ชื่อทางการระบบ (C2) | **ปิด** — "ระบบรับรองมาตรฐาน GACP" |
| UI-01 อยู่ไหน | **ปิด** — ไม่มี artifact แยก, กลืนเข้า §C แล้ว; modal ได้สเปกเต็ม |
| แทนที่หรือเพิ่มหน้า login | **ปิด** — แทนที่ + ห้ามเปลี่ยน route/session path + local login ต้องอยู่ในโครงใหม่ |
| local login ถาวร/ชั่วคราว | **ปิด** — TRANSITIONAL provider, ถอดจริงเป็นงานอนาคต (เงื่อนไข 3 ข้อ §F0.6) |

**เหลือ blocker เดียว: precondition #721 + #722 merged** (ทั้งคู่ยัง open draft ณ 2026-08-03)
ธงที่จะเจอระหว่างทำ (คาดไว้แล้วใน mandate §E): B1-CRED (credentials ยังไม่มา), C1-THAID-DOC (เอกสาร ThaID partner), D-MANUAL (จุดที่คู่มือไม่ระบุ)

## 8. UPDATE 2026-08-03 — precondition หลัง merge จริง
- **#721 merged** → main = `848d3d5`
- **#722 merged แต่เข้า base เดิม `feat/stripe-payment-wave-2` ไม่ใช่ main** → งาน Q1+Q2 **ยังไม่อยู่บน main** (ยืนยัน: `git merge-base --is-ancestor 213abbb origin/main` = NO; `git ls-tree origin/main` ไม่พบ `checkout-schedule-service.js` / `payment-reminder-job.js`)
- → เปิด **PR #724** (`feat/stripe-payment-wave-2` → `main`) ยกงานขึ้น main — ไม่ rebase ไม่ force-push (branch มีทุก commit ของ main อยู่แล้วยกเว้น merge node)
- **AUTH-01 ยัง BLOCKED จนกว่า #724 merged** — เพราะ AUTH-01 จะแตก branch จาก main และต้องเห็นโครง auth/payment ที่ Q1/Q2 วางไว้ (โดยเฉพาะ route/session path ที่ห้ามเปลี่ยน ตาม §F0.3)
