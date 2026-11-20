# ใบ E2 — ข้อความและปุ่มหน้า /auth แก้ได้โดย admin ผ่าน SystemConfig ที่มีอยู่

**วันที่:** 2026-08-14 · **สถานะ:** PENDING — ร่างจากการสำรวจโครงจริง รอ operator รีวิว
**ที่มา:** คำสั่ง operator: *"ข้อความ hardcode เป็นไปได้ไหมที่เป็น api ดึงข้อมูล หรือให้ Admin
เปลี่ยนข้อความ หรือเปิด/ปิดปุ่มได้"*

## 1. สิ่งที่มีอยู่แล้ว (สำรวจ 2026-08-14) — E2 คืองานต่อสาย ไม่ใช่สร้างระบบ

| ชิ้น | ที่อยู่ | สถานะ |
|---|---|---|
| endpoint config สาธารณะ (ไม่ต้อง auth) | `GET /api/system-config/public` | ✅ ใช้งานอยู่ |
| admin แก้ค่า | `PUT /api/system-config/:key` (`adminOnly`) | ✅ ใช้งานอยู่ |
| ตาราง | `SystemConfig` (`system.prisma:52`) | ✅ |
| ฝั่ง frontend | `config-context.tsx` · `use-feature-flag.ts` · `system-config-cache.ts` · หน้า `admin/settings` | ✅ ใช้งานอยู่ |
| สถานะปุ่ม OAuth (เปิด/ปิด/รอ) | ทะเบียน `auth-providers.js` + `GET /api/auth/idp/providers` (E1) | ✅ เพิ่งเสร็จ |

## 2. หลักการแบ่งอำนาจ — อะไรแก้ได้จากหน้าจอ อะไรไม่ได้

**สถานะปุ่ม OAuth (enabled/coming_soon) ไม่ย้ายเข้า SystemConfig** — มันเป็นความจริงเชิง
ระบบ (มี credentials จริงไหม) ที่ทะเบียน fail-closed ตัดสินอยู่แล้ว การให้ admin กดเปิดจาก
หน้าจอทั้งที่ env ไม่ครบคือการเชิญ bug ชั้นดี · admin "ปิด" ปุ่มที่ระบบพร้อมได้ (ซ่อนชั่วคราว)
แต่ "เปิด" ปุ่มที่ระบบไม่พร้อมไม่ได้ — enabled จริง = ทะเบียนว่าพร้อม **และ** admin ไม่ได้ซ่อน

**ข้อความ** แก้ได้เต็มที่ผ่าน SystemConfig — ยกเว้นชื่อ provider ตามข้อบังคับ (ThaID,
Health ID, Provider ID) ที่ล็อกเป็นชื่อทางการ

## 3. การเปลี่ยนแปลง

### 3.1 ชุด key ใน SystemConfig (prefix `auth_chooser.`)
- `auth_chooser.copy` — JSON override ข้อความ: title/checklist ของสองการ์ด, ป้ายและ
  ข้อความ dialog ต่อ provider, ข้อความแถบ DEMO · **merge ทับ default ในโค้ดรายฟิลด์**
  (ฟิลด์ที่ไม่ set = ใช้ default) — default ปัจจุบันใน `login-chooser.tsx` ยังอยู่เป็น
  fallback ตลอดไป
- `auth_chooser.hidden_providers` — array ของ provider key ที่ admin สั่งซ่อน (มีผลเป็น
  "ปิด" เท่านั้น ตามหลัก §2)

### 3.2 chooser อ่าน config
fetch `GET /api/system-config/public` เพิ่มจากที่มี (หรือผ่าน `config-context` ที่มีอยู่ —
ตัดสินตอน implement ตาม pattern ที่หน้าอื่นใช้จริง) · **fail-closed ทิศเดียวกับ E1**:
config อ่านไม่ได้/พัง = ใช้ default ในโค้ดทั้งหมด — **หน้า login ห้ามตายหรือผิดรูปเพราะ
CMS ตาย** · validation ฝั่งอ่าน: field แปลกปลอม/type ผิด = ทิ้งรายฟิลด์ ไม่ทิ้งทั้งก้อน

### 3.3 หน้า admin
เพิ่ม section "หน้าเข้าสู่ระบบ" ใน `admin/settings` ที่มีอยู่: ฟอร์มแก้ข้อความรายช่อง (ไม่ใช่
JSON ดิบ) + toggle ซ่อนรายปุ่ม + **ปุ่ม preview เปิด /auth จริง** · ทุกการแก้ผ่าน `PUT`
เดิมซึ่งต้องผ่าน audit log เดิมของ system-config (ตรวจว่ามี — ถ้าไม่มีคือ gap ที่ต้องเพิ่มใน
ใบนี้เพราะข้อความหน้า login ของระบบราชการต้องตอบได้ว่าใครแก้เมื่อไหร่)

### 3.4 เทสต์ (RED-first)
merge รายฟิลด์ + fallback เมื่อ config พัง/ว่าง/type ผิด · hidden ซ่อนได้แต่เปิดของที่
ทะเบียนไม่พร้อมไม่ได้ · ชื่อ provider ตามข้อบังคับ override ไม่ได้ · admin form round-trip

## 4. ไม่ทำในใบนี้
- ไม่แตะทะเบียน OAuth / ไม่เพิ่ม provider state ใหม่
- ไม่ทำ i18n เต็มรูป (โครง copy เป็น key-value รองรับอนาคต แต่ EN ยังไม่ทำ)
- ไม่ทำ CMS หน้าอื่น — เฉพาะ /auth · ถ้าได้ผลค่อยขยายเป็น pattern

## 5. เกณฑ์เสร็จ
admin แก้ข้อความ checklist หนึ่งบรรทัดจากหน้าจอ → refresh /auth เห็นทันทีไม่ deploy ·
ปิด SystemConfig endpoint ทิ้ง → /auth ยังแสดง default ครบถ้วน · audit ตอบได้ว่าใครแก้อะไรเมื่อไหร่
