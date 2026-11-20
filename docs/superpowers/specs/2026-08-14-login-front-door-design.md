# ใบ E1 — เปิดประตูหน้าใหม่: /auth เป็นหน้าแรก · ป้ายสถานะ OAuth อ่านจากทะเบียนจริง

**วันที่:** 2026-08-14 · **สถานะ:** PENDING — รอ operator รีวิว spec ก่อนเขียนแผน implement

## 1. ปัญหา — ของดีที่สร้างแล้วแต่ไม่มีใครเห็น

การสำรวจ 2026-08-14 พบว่างานล็อกอินแบบใหม่**สร้างเสร็จเกินครึ่งแล้ว** แต่ถูกตัดขาดจากผู้ใช้สามจุด:

| # | ข้อเท็จจริง | ที่อยู่ |
|---|---|---|
| 1 | หน้าเลือกทางเข้าแบบใหม่ (การ์ดเกษตรกร/เจ้าหน้าที่ + ปุ่ม ThaID ทั้งสองฝั่ง) **มีจริง มีเทสต์** — แต่ mount ที่ `/auth` ซึ่ง**ไม่มีเส้นทางไหนพาไปถึง**: `/` เสิร์ฟหน้า marketing, ลิงก์ล็อกอินทุกจุดชี้ตรงไปฟอร์มเก่า | `apps/web-app/src/app/auth/page.tsx` + `_components/login-chooser.tsx` |
| 2 | ป้าย "เร็ว ๆ นี้" ของ ThaID เป็น **hardcode**: `const THAID_AWAITING_CREDENTIALS = true` — ต่อให้ operator ใส่ key ครบ ป้ายก็ไม่หาย | `login-chooser.tsx:164` |
| 3 | backend มี**ทะเบียนสถานะ provider ที่ fail-closed สมบูรณ์อยู่แล้ว** (`enabled / staging_only / coming_soon` · env ไม่ครบ = ปิดเอง · mock เป็น enabled ไม่ได้บน production โดย logic) — แต่**ไม่มี endpoint ให้ frontend อ่าน** มีแต่ `POST authorize-url/callback` | `apps/backend/config/auth-providers.js` · `routes/api/auth/auth-idp.js:359,387` |

⇒ สิ่งที่ operator ขอ (*"อะไรใช้ได้เปิดเลย อะไรรอ key ขึ้นข้อความ"*) ไม่ใช่ของใหม่ —
มันคือการ**ต่อสายสามเส้นที่ขาด** ระหว่างของที่สร้างไว้แล้ว

## 2. การตัดสินใจของ operator (2026-08-14 — เป็นลายลักษณ์อักษร)

1. **`/` → `/auth`** — หน้าเลือกทางเข้าเป็นหน้าแรกที่ทุกคนเห็น · หน้า marketing เดิมพ้นจาก
   root (ยังเข้าถึงได้ที่ URL ตรง `/about` `/pricing` ฯลฯ — เนื้อ landing เดิมเข้าคิว SWEEP)
2. **mock เปิดเฉพาะ staging** เพื่อ demo flow OAuth ครบวงจรระหว่างรอ key จริง
3. provider ที่รอของจริง**ต้องมองเห็นพร้อมป้ายบอกตามจริง** ไม่ใช่ซ่อน:
   ThaID = "รอ credentials จากกรมการปกครอง" · หมอพร้อม (healthid) = "รอการอนุมัติเชื่อมต่อ"

## 3. การเปลี่ยนแปลง — 5 ชิ้น

### 3.1 `GET /api/auth/idp/providers` (backend — ชิ้นเดียวที่เพิ่ม API)
ตอบ `{ providers: { local: 'enabled', thaid: 'coming_soon', ... } }` — **สถานะเท่านั้น
ไม่มี config/URL/secret** · ไม่ต้อง auth (หน้า login ยังไม่มี session) · ค่าต้องมาจาก
ตัว resolve จริงของทะเบียน (ตัวเดียวกับที่ authorize-url ใช้ตัดสิน) ไม่ใช่อ่าน DEFAULT_STATES
ดิบ — มิฉะนั้นป้ายจะโกหกเมื่อ env ไม่ครบ

### 3.2 login-chooser อ่านสถานะจริง (frontend)
- ลบ `THAID_AWAITING_CREDENTIALS` — แทนด้วย fetch `GET /api/auth/idp/providers` ตอน mount
- ปุ่มต่อ provider ตามสถานะ: `enabled` = กดได้จริง · `coming_soon` = การ์ดเห็นได้ + ป้าย
  ข้อความตามข้อ 2.3 + กดแล้วไม่พาไปไหน (ไม่ใช่ปุ่มที่ดูกดได้แล้วพัง) · `staging_only` =
  แสดงเฉพาะเมื่อทะเบียนตอบว่า enabled ที่นั่น พร้อมป้าย **"DEMO"** ชัดเจน
- **fetch ล้ม = แสดงเฉพาะ local login + ข้อความว่าตรวจสถานะไม่ได้** — ห้ามเดา ห้ามแสดง
  ปุ่ม OAuth ที่ไม่รู้สถานะ (fail-closed ทิศเดียวกับ backend)
- เพิ่มการ์ด "เข้าแบบ demo" เมื่อ mock enabled — เดินผ่าน `authorize-url → callback` จริง
  ของ provider mock เพื่อให้ demo คือ flow เดียวกับของจริง ไม่ใช่ทางลัดพิเศษ

### 3.3 `/` → `/auth`
`(marketing)/page.tsx` เปลี่ยนเป็น `redirect('/auth')` · ลิงก์ login ใน navbar/หน้าอื่น
ชี้ `/auth` · redirect เดิม (`(auth)/login`, `/provider/login`) คงไว้ — bookmark เก่าไม่ตาย

### 3.4 mock บน staging
เครื่อง staging รัน `NODE_ENV=production` ⇒ **ต้องตรวจก่อนว่า logic "mock ห้าม enabled บน
production" แยก staging ออกอย่างไร** (`APP_ENV`? host?) — ถ้าแยกไม่ได้ นี่คืองานแก้ที่ต้องทำ
ในใบนี้ โดยรักษา invariant เดิม: **production จริงต้องไม่มีทางเปิด mock ได้ ไม่ว่า env ไหน**

### 3.5 UX ของหน้า /auth — ลำดับตามข้อบังคับ ไม่ใช่ตามความสะดวก
**operator แจ้ง 2026-08-14: ThaID และหมอพร้อมเป็นข้อบังคับกระทรวง** ⇒ ลำดับบนหน้า:
1. **ThaID / หมอพร้อม = ทางเข้าหลัก** — ปุ่มใหญ่สุด อยู่บนสุดของการ์ดแต่ละฝั่ง
   แม้ระหว่างสถานะ `coming_soon` ก็ต้องอยู่ตำแหน่งหลักพร้อมป้าย — การซ่อนของที่บังคับ
   คือการสื่อสารผิดว่าระบบไม่รองรับ
2. **email/password (local) = ทางชั่วคราว** — ลดระดับสายตาเป็นทางรอง พร้อมข้อความ
   "ช่องทางชั่วคราวระหว่างรอการเชื่อมต่อ" · สอดคล้อง backend ที่ประกาศ local เป็น
   TRANSITIONAL อยู่แล้ว (`auth-providers.js:11` — ถอดได้ด้วย `AUTH_LOCAL_STATE`
   โดยไม่ต้องแตะโค้ดเมื่อวันนั้นมาถึง)

ที่เหลือ: copy ไทยตามหมอพร้อม · ป้ายสถานะต่างกันด้วยสายตาไม่ใช่แค่ข้อความ ·
responsive มือถือ (เกษตรกรใช้มือถือเป็นหลัก) · **ไม่ redesign ทั้งหน้า** — โครงการ์ด
ที่ออกแบบไว้แล้วดีอยู่

## 4. สิ่งที่ใบนี้ **ไม่** ทำ
- ไม่ใส่ credentials จริงของ ThaID/หมอพร้อม — เมื่อ key มา operator ใส่ env แล้วป้ายเปลี่ยนเอง
  โดยไม่ต้องแตะโค้ด (นั่นคือทั้งประเด็นของ 3.1/3.2)
- ไม่ลบหน้า marketing / ฟอร์ม login เก่า — เข้าคิว **ใบ SWEEP** (สำรวจปูพรมทั้งรีโป แยก spec)
- ไม่แตะ mobile app
- ไม่ deploy production

## 5. การทดสอบ (RED-first ทุกข้อที่เปลี่ยน behavior)
1. endpoint ใหม่: สถานะสะท้อน resolve จริง (env ครบ/ไม่ครบ) · ไม่มี field เกินสถานะ
2. chooser: สาม state × สอง audience render ถูก · fetch ล้ม → เหลือ local + ข้อความ
3. `/` redirect ไป `/auth` · redirect เก่ายังทำงาน
4. mock: invariant "production เปิดไม่ได้" ต้องมีเทสต์ที่พยายามเปิดแล้วล้มเห็น ๆ
5. view-pack (HARNESS.md §4.4): เดินจริงบน staging — ภาพหน้า /auth ทั้งสาม state

## 6. เกณฑ์เสร็จ
เปิด `staging.gacpth.com` → เห็นหน้าเลือกทางเข้า → ปุ่ม ThaID มีป้าย "รอ credentials" ·
หมอพร้อมมีป้าย "รอการอนุมัติ" · การ์ด DEMO กดแล้วเดินครบวงจรจนเข้าระบบ ·
ทั้งหมดโดย**ไม่มีสถานะใดถูกพิมพ์ตายในโค้ด frontend**
