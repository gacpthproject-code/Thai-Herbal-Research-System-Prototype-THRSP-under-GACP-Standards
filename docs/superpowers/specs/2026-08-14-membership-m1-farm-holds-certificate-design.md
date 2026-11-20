# M1 — ใบรับรองเป็นของฟาร์ม + กติกา "ใครยื่นในนามใคร" (2026-08-14)

## 1. หลักการ (คำสั่ง operator จากรอบ grill 2026-08-14 — ลายลักษณ์อักษรทั้งสามข้อ)

1. **สมัครเสรี** — บัญชีบุคคล = กุญแจเข้าประตู ไม่มีด่านตอนสมัคร ไม่มีการพิสูจน์ตัวตนชั่วคราว
   (คำตอบ grill ข้อ 3: "รอ ThaID อย่างเดียว" — ด่านจริงคือการตรวจเอกสาร + ตรวจแปลงหน้างาน)
2. **เข้มตอนยื่น** — "เราจะเน้นไปที่ใครยื่นเอกสาร แล้วยื่นเอกสารในนามอะไร"
3. **ใบรับรองออกในนามฟาร์ม ไม่ใช่บุคคล** — ฟาร์มเปลี่ยนมือ ใบติดฟาร์ม
   (เงื่อนไขการโอนตามระเบียบกรมฯ — operator เช็กกับกรมภายหลัง, ระบบออกแบบเผื่อ)

Scope M1 = ชั้นข้อมูล + ชั้นสิทธิ์เท่านั้น · UI ทั้งหมดไป M4 (รอ design survey)

## 2. สภาพปัจจุบัน (ตรวจแล้วจากโค้ดจริง 2026-08-14)

| ข้อเท็จจริง | ที่มา |
|---|---|
| `Certificate.userId` เป็น FK ถึง **บุคคล** ควบคู่ `farmId` + สตริงแช่แข็ง `applicantName` | `prisma/schema/certification.prisma:17-29` |
| `Application.entityId` ชี้ "ผู้ยื่นตามกฎหมาย" อยู่แล้วตั้งแต่ Phase 66 · draft ใหม่เติมจาก workspace ที่ active | คอมเมนต์ `auth.prisma` (Wave D Phase 5a) |
| Entity + EntityMembership + entity-member-permission-grants มีครบ | `prisma/schema/entity*.prisma` |
| PDPA erasure เก็บ field แสดงผลของใบรับรองไว้แล้ว (ไม่ลบตามคน) | `routes/api/index.js` คอมเมนต์ Iter 27 |

ปัญหาเดียวของโครงวันนี้: **น้ำหนักเจ้าของใบอยู่ที่คน** (userId + ชื่อคนบนใบ) — ขัดหลักข้อ 3

## 3. แบบเป้าหมาย

### 3.1 ใบรับรอง — expand ก่อน ห้าม contract ในใบนี้ (guidance §4)

- **เพิ่ม** `Certificate.submittedByUserId String?` backfill = ค่า `userId` เดิมทุกแถว —
  ความหมายใหม่ของ "คน" บนใบ: *ผู้ยื่นในบันทึก* ไม่ใช่เจ้าของ
- **เพิ่ม** `Certificate.holderDisplayName String?` backfill = ชื่อ Entity/ฟาร์มของใบนั้น
  (จาก `farm` → entity ของ application ที่ออกใบ; แถวที่หาไม่ได้ = ใช้ `applicantName` เดิมแล้วบันทึกจำนวนไว้ใน evidence)
- `userId` + `applicantName` **คงอยู่ห้ามลบ** (ประวัติศาสตร์ + rollback) — ใบ contract แยกทีหลัง drain
- ทุก reader ที่แสดง "ชื่อผู้ถือใบรับรอง" (PDF template, หน้า verify สาธารณะ, dashboard)
  เปลี่ยนมาอ่าน `holderDisplayName` — ชื่อคนไม่ปรากฏเป็นเจ้าของใบอีก

### 3.2 กติกาการยื่น — enforcement ที่ endpoint ไม่ใช่ที่ UI

จุดบังคับ: ทุก endpoint ที่ **สร้าง/ยื่น** คำขอ (submit) ต้องผ่านครบสามข้อ ไม่งั้น 403:
1. คำขอมี `entityId` (ยื่นในนามหน่วยไหน) — ไม่มี = VALIDATION_ERROR
2. ผู้ยื่นเป็น**สมาชิกของ entity นั้น** (EntityMembership active) **หรือ**ถือ permission grant
   ที่ครอบการยื่น (โครง entity-member-permission-grants เดิม — M1 ใช้ grant ที่มีอยู่
   ตรง ๆ, การเชิญที่ปรึกษา+หลักฐานมอบอำนาจ = M2)
3. audit log บันทึก `actorId` + `onBehalfOfEntityId` ทุกครั้ง — "ใครทำในนามใคร"

Read path ไม่แตะใน M1 (สิทธิ์การเห็นข้อมูลตาม workspace เดิม)

### 3.3 ฟาร์มเปลี่ยนมือ — ความพร้อมโดยไม่สร้างฟีเจอร์

M1 ไม่สร้าง workflow โอน (รอระเบียบกรมฯ) แต่ต้อง**พิสูจน์ด้วยเทส**ว่าโครงรองรับ:
เมื่อสมาชิกเดิมของ entity ถูกปิดบัญชี/ลบ (PDPA) → ใบรับรองของฟาร์มยัง valid,
ยัง verify ได้สาธารณะ, `holderDisplayName` ยังแสดงถูก — ไม่มี path ไหน invalidate ใบตามคน

## 4. Acceptance criteria (พฤติกรรมทั้งหมด — RED ก่อนเสมอ, Tier C)

1. ออกใบใหม่ → `holderDisplayName` = ชื่อ entity, `submittedByUserId` = ผู้ยื่น
2. ยื่นโดยไม่มี `entityId` → 400 · ยื่นใน entity ที่ตนไม่ใช่สมาชิก/ไม่มี grant → 403 + audit FAILURE
3. ยื่นด้วย grant ที่ครอบ → สำเร็จ + audit บันทึก onBehalfOf
4. ลบผู้ใช้ (PDPA erasure) → ใบของฟาร์ม verify ได้เหมือนเดิม ชื่อผู้ถือไม่เปลี่ยน
5. migration: expand-only + backfill ครบทุกแถว (นับแถว before/after แนบ evidence) ·
   รันบน Postgres จริงบนเครื่อง staging เท่านั้น — รันบนเครื่อง dev ไม่ได้ = สถานะ PENDING ห้ามเคลม
6. PDF ใบรับรอง + หน้า verify สาธารณะ แสดงชื่อฟาร์มเป็นผู้ถือ — view-pack บังคับ (ภาพก่อน/หลัง)

## 5. นอกขอบเขต

- UI/เมนูทุกจอ (M4 — รอ design survey) · การเชิญที่ปรึกษา + หลักฐานมอบอำนาจ (M2) ·
  first-login token เจ้าหน้าที่ (M3) · workflow โอนฟาร์ม (รอระเบียบกรมฯ) ·
  การลบคอลัมน์เก่า (ใบ contract แยก) · ThaID auto-link (มีเส้นอยู่แล้วใน thaid-identity-service)
