# AUTH-01 — PLAN (ส่วนที่ operator ปลดแล้ว 2026-08-03)
> คำสั่งปลด: "เดินส่วนที่ไม่ติดธงได้เลย — rebrand §C + mock adapter + ส่วน OAuth ที่เอกสาร 1 ก.ค. 67 ครอบ (Provider ID flow ตาม citation)"
> ธงที่ยังปิดอยู่ (ห้ามแตะ): **D-MANUAL-HASHCID** (account-linking Provider ID จริง) · **เอกสาร Health ID ประชาชน** (ฝั่งเกษตรกรทั้งเส้น) · **B1-CRED** (credentials จริง — ทุก provider จริงคง `coming_soon`) · **C5** (asset โลโก้ทางการ — text-only จนกว่าได้ไฟล์)
> คำตอบที่ใช้เป็นฐาน: E-1..E-3, E-6..E-8 (`DECISIONS-CROSSREF.md`) + **E-4 ANSWERED**: token/secret/PII ห้ามแตะ browser storage ทุกกรณี, session = httpOnly cookie เท่านั้น, ยกเว้น UI state ล้วน
> Citations บังคับ: `manual-citations.md` [P-OAUTH] — **endpoint/param ที่ไม่มี citation = ห้ามเขียน** (§B2)

## ลำดับ sub-task (dependency order — implementer ทีละตัวเดียว)

### P1 — AUTH_PROVIDERS config SSOT + adapter seam + Mock IdP (BE ล้วน) — **UNBLOCKED เต็ม**
- `apps/backend/config/auth-providers.js` (config layer เท่านั้นที่อ่าน `process.env` — ratchet env-direct ไม่นับ config/): registry `local | healthid | providerid | thaid | mock` state `enabled|staging_only|coming_soon` — local=`enabled` (TRANSITIONAL ตาม C4), provider จริงทุกตัว=`coming_soon` (B1-CRED), mock=`enabled` เฉพาะ non-prod (§D5)
- env ต่อ provider ตาม §D2: `AUTH_<P>_CLIENT_ID/_CLIENT_SECRET/_REDIRECT_URI/_AUTHORIZE_URL/_TOKEN_URL/_PROFILE_URL` — `.env.example` ใส่ URL ตาม [P-OAUTH] เป็น**คอมเมนต์อ้าง citation** ค่า default ว่าง = fail-closed
- adapter contract เดียว: `getAuthorizeUrl(state)` / `exchangeCode(code)` / `getProfile(token)` — `ProviderIdAdapter` ตาม [P-OAUTH] ส่วนที่ 1+2 (แลก Health ID token → แลก Provider token `services/token` → `services/profile`); `MockIdpAdapter` fixtures ตาม §D5: happy / deny / expired code / profile ขาด field / เจ้าหน้าที่ไม่อยู่ในทะเบียน
- **ไม่มี**: schema change ใด ๆ (EXPAND เลื่อนไปตอน linking ปลด — ออกแบบคอลัมน์ตอนรู้ key จริง), account linking, FE
- RED-first ทุก behavior; gate: ratchet ไม่ขยับ, banned-terms guard สุดท้าย

### P2 — BE OAuth routes (authorize redirect + callback) — **UNBLOCKED ยกเว้นปลายทาง linking**
- `state` ≥128bit ผูก session ใช้ครั้งเดียว — **RED พิสูจน์ callback state ผิด/ซ้ำถูกปฏิเสธ** (§D3; เอกสารให้ state เป็น optional แต่ไม่ห้ามส่ง — [P-OAUTH] หน้า 3)
- แลก code ที่ backend เท่านั้น; redirect_uri exact-match จาก config allowlist; error paths ครบ (ผู้ใช้ deny / code หมดอายุ 422 / IdP ล่ม / profile ขาด field) → error-code map ไทยตาม convention `shared/error-codes.js`
- เส้นจริง (providerid): จบที่ **ดึง profile สำเร็จ → ตอบ `AUTH_LINKING_PENDING` (ข้อความไทยทางการ)** — **ห้ามสร้าง/ผูก user row** (ธง D-MANUAL-HASHCID) — test pin: ไม่มี user.create เกิดขึ้น (auditor check #4)
- เส้น mock (non-prod): จบ flow ได้เต็มถึง session (ผ่าน `issueTokensForAuthenticatedUser` seam `prisma-auth-service.js:475-522`) กับ fixture registry ของ mock เอง — ห้ามให้ mock-linking กลายเป็น policy ของ provider จริง
- audit log ทุก login สำเร็จ/ล้มเหลว (provider, subject hash ใน metadata — ห้าม PII); CSRF bypass entry + rate limiter ครอบ endpoint ใหม่ (`csrf-middleware.js:40-44`, `server.js:269-273`)

### P3 — E-4 session hardening (FE) — **UNBLOCKED (คำตอบ E-4 มาแล้ว)**
- ถอน token + user object ออกจาก `localStorage` ทั้งชั้น (`auth-service-session.ts:37-46, 61-66, 81-83` + ผู้อ่านทุกจุด) — session = httpOnly cookie เท่านั้น; `isAuthenticated` เปลี่ยนเป็นถาม server (`/me`)
- เหลือได้เฉพาะ UI state ล้วน (ภาษา/layout); regression: local login เดิมทุก flow ต้องยังเดินครบ; mobile (Bearer) ไม่แตะ — BE ยังรับ header เดิม
- auditor grep build output: token/secret = 0 (§G ข้อ 2)

### P4 — FE rebrand §C — **UNBLOCKED (โหลด frontend-design + gacp-design-tokens + thai-ui-copy)**
- โครงใหม่แทนที่ `apps/web-app/src/app/auth/*` — **route path เดิมห้ามเปลี่ยน** (§F0.3; ผู้อ้างอิงทั้งหมด enumerate แล้วใน `A0-authen-readiness-audit.md` ข้อ (d)) + **เพิ่ม test pin route paths** (ยังไม่มี — A0 ยืนยัน)
- C2 ชื่อ "ระบบรับรองมาตรฐาน GACP" SSOT · C3 สอง card + bullet GACP · C4 local = provider ใน AUTH_PROVIDERS + copy "ช่องทางชั่วคราวระหว่างรอเชื่อมต่อระบบยืนยันตัวตนกลาง" · C6 a11y/44px/focus trap · modal `coming_soon` ตาม §F0.2 (หัวข้อ "ขออภัยในความไม่สะดวก" ปุ่มเดียว "รับทราบ" focus กลับปุ่มต้นทาง)
- FE อ่าน provider states จาก API (endpoint ใหม่อ่าน `AUTH_PROVIDERS`) — ไม่มี `NEXT_PUBLIC_*` flag (flip ต้อง rebuild image)
- C1 grep-pin `dtam.?next` (ci) = 0 ใน `apps/web-app/src` + `public/` เท่านั้น (backend 14 จุด = partner integration ห้ามแตะ) · C5 ปุ่ม text-only + ธงขอ asset ทางการ
- ระวัง `auth-shell-split-scope.test.ts:80-94` (A0 I9) — ห้ามลด assertion เพื่อให้เขียว (Law 3.7)

### P5 — two-state pin (C4 amended)
- test สอง state: (i) local enabled (วันนี้) (ii) local disabled + external (mock) enabled → flow หลัก (ยื่นคำขอ/ตรวจ/ชำระ/ออกใบรับรอง) เดินครบด้วย session จาก external authen; e2e ผ่าน Mock IdP

### หยุดถาวรใน AUTH-01 (รายงานใน REPORT ไม่ implement)
- Provider ID linking จริง (D-MANUAL-HASHCID) · Health ID ฝั่งเกษตรกรทั้งเส้น (รอเอกสารประชาชน) · flip provider จริงเป็น enabled (B1-CRED) · ถอด local login (mandate §F0.6)

## Auditor แกนพิเศษ (mandate §G — รันเอง)
1. `dtam.?next` = 0 (scope FE) 2. `client_secret`/token ใน FE build = 0 3. state-CSRF RED มีหลักฐาน 4. ไม่มี auto-provision path (test) 5. ทุก endpoint มี citation ใน manual-citations.md 6. provider จริง default `coming_soon` = pin 7. two-state pin ผ่าน + regression local เดิมผ่าน
