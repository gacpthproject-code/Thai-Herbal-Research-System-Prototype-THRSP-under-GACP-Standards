# AUTH-01 — LOGIN FULL: REBRAND + OAuth จริง (Health ID / Provider ID / ThaID)
> operator instruction 2026-08-03 — เก็บ verbatim เพื่อใช้ dispatch เมื่อ precondition ผ่าน
> **PRECONDITION: #721 และ #722 merged แล้วเท่านั้น** (ณ 2026-08-03 ยังไม่ merge ทั้งคู่ — ดู preflight-notes.md)
> หมวดงาน: AUTH/IDENTITY → **merge โดยมือคนเสมอ ไม่มีข้อยกเว้น**

## §A BOOTSTRAP
ตาม PROMPT.md §1 ทุกข้อ + โหลด `frontend-design` skill
ลำดับ dispatch ตาม §3: **AUTHEN-READINESS AUDIT (ก่อน implement)** → spec-reader → PLAN → implementer (แบ่งงานย่อย) → auditor → gates

## §A0 AUTHEN-READINESS AUDIT [AMENDMENT 2026-08-03 — ก่อน implement ทุกอย่าง]
spec-reader ตรวจว่าระบบรองรับ external authen จริงหรือไม่ — ทุกข้อ file:line:
- **(a)** code path ใดผูกตายกับ local credential (password/username) ที่ session จาก OAuth ไม่มี — เช่น re-auth ด้วย password, forgot-password flow ที่เป็น dependency ของ flow อื่น
- **(b)** Identity model: Health ID (เกษตรกร) / Provider ID (เจ้าหน้าที่) มี field รองรับ external subject (CID/sub จาก IDP) แล้ว หรือต้อง EXPAND
- **(c)** จุดที่ assume ว่า user ทุกคน login แบบ local (middleware, audit log, session refresh)
ผลจัดกอง: **(a) แก้ใน AUTH-01 / (b) EXPAND ใน AUTH-01 / (c) backlog** — ถ้าเจอ blocker ที่ทำให้ external authen เดินไม่ได้ = **ธง รายงานก่อน** (STOP)

## §B MANUAL-FIRST RULE (กติกาสูงสุดของงานนี้)
1. ก่อนเขียนโค้ด OAuth ใด ๆ: fetch + อ่านเอกสารทางการให้ครบ:
   - คู่มือเชื่อมต่อ Provider ID ด้วย OAuth Health ID (สำนักสุขภาพดิจิทัล สธ.): https://bdh.moph.go.th/site/wp-content/uploads/2024/07/ (ไฟล์ "คู่มือการเชื่อมต่อระบบ Provider ID ด้วย OAuth Health ID") — ถ้า fetch ตรงไม่ได้ ให้หา mirror บน bdh.moph.go.th / provider.id.th หรือร้องขอไฟล์จาก operator (มี PDF อยู่แล้วจากการยื่นขอ)
   - เอกสาร Health ID สำหรับประชาชน: moph.id.th + พอร์ทัลเอกสารสำหรับประชาชนของ สธ. (URL เต็ม + PDF อยู่กับ operator — บันทึกใน `oauth-registration-status.md`)
   - ThaID: เอกสาร integration ของกรมการปกครอง (bora.dopa.go.th) — ถ้าเอกสาร partner ต้อง login ให้ใช้เท่าที่เผยแพร่สาธารณะ + ธง C1
2. ทุก endpoint / parameter / scope / รูปแบบ profile response ที่ใช้ในโค้ด ต้องอ้างที่มาจากเอกสาร (หน้า/หัวข้อ) ลง `evidence/AUTH-01/manual-citations.md` — **ค่าที่เอกสารไม่ระบุ = ห้ามเดา** ใส่เป็น config ว่าง + ธง BLOCKED
3. โครง flow ที่ยืนยันจากเอกสารแล้ว (authorization code): ปุ่ม Login → redirect ไป Login URL ของ IDP → ผู้ใช้ยืนยันตัวตน → redirect กลับ Redirect URI พร้อม code → frontend อ่าน code ส่ง backend → backend แลก token + ดึง profile → สร้าง session ของเรา

## §C SCOPE ส่วนที่ 1 — REBRAND (คงจาก UI-01 ทุกข้อ)
- **C1** ถอด "DTAM Next" หมดจด: โลโก้/ชื่อ/tagline/copy/favicon/meta/dialog dev-prod ที่อ้าง `dtamnext.one.th` — grep-pin `dtam.?next` (ci) = 0 ใน `src/` + `public/`
  - **operator ระบุ footprint: https://uat-dtamnext.one.th/home-page** (2026-08-03)
- **C2 [ANSWERED 2026-08-03]** ชื่อทางการระบบ = **"ระบบรับรองมาตรฐาน GACP"** — **SSOT ของทั้งหน้า login** (ตามที่ใช้จริงใน `docs/api/openapi.json:6`, คู่มือเกษตรกร, หน้า login มือถือ) ใช้จนกว่าจะมีชื่อตามสัญญาแจ้งเปลี่ยน + ตรากรมการแพทย์แผนไทยฯ ที่ระบบใช้อยู่ — **ห้าม generate โลโก้**
- **C3** สอง card: เกษตรกร/ผู้ประกอบการ (Health ID + ThaID) | เจ้าหน้าที่ (Provider ID + ThaID) — bullet เขียนใหม่ตรงบริบท GACP (ยื่นคำขอ/ติดตามสถานะ/ชำระค่าธรรมเนียม | ตรวจคำขอ/นัดตรวจ/ออกใบรับรอง)
- **C4 [AMENDED 2026-08-03 — compliance กฎกระทรวง]** local login เปลี่ยนจาก "คงไว้ถาวร" เป็น **TRANSITIONAL — ต้องถอดได้ด้วย config**:
  - local login เข้า `AUTH_PROVIDERS` เป็น **provider หนึ่ง เท่าเทียมตัวอื่น** (local: `enabled` ตอนนี้ | Health ID (สธ.)/ThaID: `coming_soon` รออนุมัติ)
  - **Test pin สอง state**: (i) local enabled (วันนี้) (ii) local disabled + Health ID (สธ.)/ThaID enabled (ปลายทาง) — พิสูจน์ว่า flip config แล้วทุก flow หลัก (ยื่นคำขอ / ตรวจ / ชำระเงิน / ออกใบรับรอง) **ยังเดินครบด้วย session จาก external authen**
  - UI copy ฝั่ง local login: **"ช่องทางชั่วคราวระหว่างรอเชื่อมต่อระบบยืนยันตัวตนกลาง"**
  - **ห้ามถอด local login จริงใน AUTH-01** — การถอด production = งานแยกอนาคต เงื่อนไข: Health ID (สธ.)+ThaID enabled บน prod แล้ว + ผ่าน parallel run ที่ operator กำหนด
- **C5** Asset ปุ่ม/โลโก้ Health ID, Provider ID, ThaID: **จากแหล่งทางการเท่านั้น** ทุกไฟล์ลงที่มาใน `evidence/AUTH-01/asset-sources.md` — หาไม่ได้ = ปุ่ม text-only + ธงให้ operator ขอจากหน่วยงาน **ห้ามวาดเลียนแบบ**
- **C6** A11y + responsive ตาม UI-01 เดิม: WCAG AA, keyboard ครบ, modal มี focus trap, มือถือ first-class ปุ่ม ≥44px, env badge แทน dialog เดิม

## §D SCOPE ส่วนที่ 2 — OAuth INTEGRATION จริง
- **D1** Adapter ต่อ provider หลัง seam เดียว: `HealthIdAdapter` / `ProviderIdAdapter` / `ThaIdAdapter` + `MockIdpAdapter` — contract เดียวกัน: `getAuthorizeUrl(state)` / `exchangeCode(code)` / `getProfile(token)` — สลับด้วย config ต่อ provider
- **D2** Config ต่อ provider (SSOT เดียว): state `enabled | staging_only | coming_soon` + env ต่อ provider: `AUTH_<P>_CLIENT_ID` / `_CLIENT_SECRET` / `_REDIRECT_URI` / `_AUTHORIZE_URL` / `_TOKEN_URL` / `_PROFILE_URL`
  - ค่า production ยังไม่มี (รออนุมัติ): **ทุก provider จริงตั้งต้น `coming_soon`**, mock = enabled เฉพาะ non-prod
  - UI อ่าน state เดียวกัน: `coming_soon` → modal ทางการ ("อยู่ระหว่างการเชื่อมต่อระบบ และจะเปิดให้บริการเร็ว ๆ นี้...") ตาม UI-01 เดิม
- **D3** Backend flow (**confidential client — บังคับ**):
  - แลก code ที่ backend เท่านั้น — `client_secret` **ห้ามปรากฏใน frontend bundle ทุกกรณี** (auditor grep build output จริง)
  - `state` param: random ≥128bit ผูก session, ตรวจตอน callback, **ใช้ครั้งเดียว** — RED test พิสูจน์ว่า callback ที่ state ผิด/ซ้ำ ถูกปฏิเสธ
  - PKCE: ใส่ถ้า manual ระบุว่ารองรับ (อ้าง citation) — ไม่ระบุ = ไม่ใส่ + จดใน manual-citations ว่าเอกสารไม่กล่าวถึง
  - Redirect URI: **exact match จาก allowlist ใน config** — ห้ามรับจาก request
  - Token: เก็บ server-side เท่านั้น, session ของเราเป็น httpOnly cookie ตาม session mechanism เดิม (spec-reader ยืนยัน mechanism ก่อน) — **ห้าม localStorage/sessionStorage ทุกกรณี**
  - Error paths ครบ: ผู้ใช้กด deny / code หมดอายุ / IDP ล่ม / profile ไม่ครบ field → ข้อความไทยทางการต่อกรณี ผ่าน error-code map convention
- **D4** Account linking (นโยบายที่ operator ตัดสินแล้ว — implement ตามนี้):
  - **Health ID** → ผูก/สร้างบัญชีเกษตรกร (Health ID model เดิม) โดย match CID จาก profile — first login ยังไม่มีบัญชี: สร้างได้ พร้อมพาเข้า flow กรอกข้อมูลเพิ่มที่ระบบมีอยู่
  - **Provider ID** → match กับทะเบียนเจ้าหน้าที่ที่มีอยู่เท่านั้น **ห้าม auto-provision** — ไม่พบ: "ไม่พบข้อมูลเจ้าหน้าที่ กรุณาติดต่อผู้ดูแลระบบ" + audit log
  - **ThaID** → build ครบทั้ง adapter + linking (map CID เข้า identity ทั้งสองฝั่งตาม card ที่กดเข้า) แต่ state = `coming_soon` จนกว่าการอนุมัติกลับมา — "ทำเผื่อ" ตามคำสั่ง operator
  - ทุก login สำเร็จ/ล้มเหลว → audit log (provider, CID hash, ผล, เวลา)
- **D5** Mock IDP สำหรับ dev/test: ทำตาม contract เดียวกับ manual (authorize→code→token→profile) ให้ E2E วิ่งได้ครบ flow โดยไม่แตะระบบจริง — fixtures: happy / deny / expired code / profile ขาด field / เจ้าหน้าที่ไม่อยู่ในทะเบียน

## §E ธง (หยุดส่วนนั้น เดินส่วนอื่น รายงานใน REPORT)
- **B1-CRED**: ค่า production (client_id/secret/redirect URI ที่อนุมัติ) ยังไม่มา — flip เป็น `enabled` ทำไม่ได้จนกว่า operator ส่ง credentials + สั่งเอง (บันทึกสถานะคำขอลง `evidence/AUTH-01/oauth-registration-status.md`: Health ID (สธ.) + ThaID = ยื่นแล้ว รออนุมัติ — operator เติมเลขที่/วันที่)
- **C1-THAID-DOC**: เอกสาร integration ThaID ฉบับ partner เข้าไม่ถึง → adapter สร้างตามโครง OAuth มาตรฐาน + config ว่าง + test กับ mock แล้วธงรอเอกสารจริงมา verify ก่อนเปิด
- **D-MANUAL**: จุดใดที่ manual ไม่ระบุและจำเป็นต่อความถูกต้อง → ธง **ห้ามเดา**

## §F0 คำตอบ operator 2026-08-03 (ground truth — เหนือกว่าการตีความใด ๆ)
1. **ชื่อระบบ**: "ระบบรับรองมาตรฐาน GACP" (ดู C2)
2. **"UI-01" ทุกจุดที่ mandate อ้าง = เนื้อหาที่ถูกกลืนเข้า §C แล้ว ไม่มี artifact แยกใน repo** — implementer อ่าน AUTH-01 ฉบับเดียวจบ **ห้ามไปตามหา UI-01**
   - **"modal ทางการ" (§D2) สเปกเต็ม**: หัวข้อ **"ขออภัยในความไม่สะดวก"** + เนื้อความตามที่ระบุใน D2 + **ปุ่มเดียว "รับทราบ"** ปิดแล้ว **focus กลับไปที่ปุ่มต้นทาง** (a11y — สอดคล้อง C6 focus trap)
3. **หน้า login ปัจจุบัน `apps/web-app/src/app/auth/*` = แทนที่ด้วยโครงใหม่ ไม่ทำหน้าซ้อน** โดยมีเงื่อนไขบังคับ:
   - **dev/local login เดิมต้องอยู่ในโครงใหม่** (ตาม C4 amended — เป็น provider ใน AUTH_PROVIDERS)
   - **route path + session path ที่ระบบอื่นอ้างถึง ห้ามเปลี่ยน** → spec-reader ต้อง enumerate ผู้อ้างอิงทั้งหมดก่อน (redirect ใน middleware, ลิงก์จากหน้าอื่น, e2e/test fixtures, mobile app, เอกสาร) แล้ว pin ด้วย test
4-5. local login TRANSITIONAL + §A0 audit — ดู C4 (amended) และ §A0 ข้างบน
6. **การถอด local login จริงบน production = งานแยกอนาคต** เงื่อนไขครบ 3 ข้อ: external enabled บน prod + parallel run ตามที่ operator กำหนด + **คำยืนยันจากกฎกระทรวง/กรมว่า "ต้องใช้ external เท่านั้น" หรือ "เป็นอย่างน้อย"** — **ห้ามถอดใน AUTH-01**

## §F OUT OF SCOPE
Backend อื่นนอก auth module | role/permission logic เดิม | R2 ทุกส่วน | หน้าอื่นนอก login flow (ยกเว้น shared branding ตาม C1)

## §G EVIDENCE + AUDITOR แกนพิเศษ
Evidence: plan, red-output, test-output, `manual-citations.md`, `asset-sources.md`, `oauth-registration-status.md`, screenshots ทุก state ทุก viewport (desktop+390px), orchestration-log, report

Auditor ตรวจเพิ่ม (**รันเอง ไม่เชื่อรายงาน**):
1. grep `dtam.?next` = 0 (scope `apps/web-app/src` + `public/` เท่านั้น — backend 14 จุดคือ partner integration ห้ามแตะ)
2. grep `client_secret`/token ใน frontend build output = 0
3. state-CSRF test แดงจริงก่อนแก้ (RED มีหลักฐาน)
4. Provider ID ไม่มี path auto-provision — พิสูจน์ด้วย test
5. ทุก endpoint ในโค้ดมี citation ใน manual-citations.md — ไม่มี = FAIL
6. Provider จริงทุกตัว default `coming_soon` บน production config = pin
7. **[AMENDED] local login = provider ใน AUTH_PROVIDERS; test สอง state — local enabled (วันนี้) + local disabled/external enabled (ปลายทาง) ทุก flow หลักเดินครบด้วย session external; regression ของ local login เดิมผ่าน**
