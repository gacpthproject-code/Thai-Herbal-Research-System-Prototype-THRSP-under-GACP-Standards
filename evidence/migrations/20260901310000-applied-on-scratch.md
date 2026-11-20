# migration `20260901310000_application_document_reviews` — พิสูจน์บนฐานทิ้ง

**รัน 2026-09-05** · `postgres:15-alpine` (อิมเมจเดียวกับคอนเทนเนอร์ `gacp-postgres` ของ staging)
คอนเทนเนอร์ใหม่ชื่อ `mig-scratch` พอร์ต 127.0.0.1:55432 · **ไม่แตะฐานข้อมูลใด ๆ ที่มีอยู่**
ทำลายทิ้งหลังทดสอบ

migration นี้อยู่บน main แล้ว (`d3d0748a`) แต่ **ยังไม่ถูก apply ที่ไหนเลย** และ
`config/migration-level-guard.js:130` ปฏิเสธการ boot เมื่อ DB ต่ำกว่าระดับของ tree
⇒ ต้อง apply ก่อน deploy ไม่ใช่หลัง

## 1. apply ได้จริง

สร้างตารางแม่ขั้นต่ำ (`organizations`, `applications`) ให้ FK ยึดได้ แล้ว apply → **สำเร็จ**

## 2. รันซ้ำไม่ได้ — พบและแก้แล้ว

ทุก `CREATE` ในไฟล์มี `IF NOT EXISTS` แต่ `ALTER TABLE ... ADD CONSTRAINT` สองตัวไม่มี
การ apply ซ้ำด้วยมือจึงพังกลางคัน:

```
ERROR:  constraint "application_document_reviews_applicationId_fkey" ... already exists
ERROR:  constraint "application_document_reviews_organization_id_fkey" ... already exists
```

`prisma migrate deploy` ไม่รันซ้ำ migration ที่บันทึกไว้แล้ว จึงไม่โดน — **แต่หัวไฟล์เอง
เชิญชวนให้ apply ด้วยมือ** ("can be applied to a running deployment") ซึ่งเป็นวิธีที่ใช้จริง
ในโปรเจกต์นี้ · แก้โดยห่อด้วย `DO $$ ... IF NOT EXISTS (SELECT FROM pg_constraint) ... $$`
(Postgres ไม่มี `ADD CONSTRAINT IF NOT EXISTS`)

หลังแก้: apply **3 รอบติดกันสะอาด** และนับ constraint ได้ CHECK 4 · FK 2 · PK 1 ไม่ซ้ำ

## 3. ข้อจำกัดบังคับได้จริงตามที่แบบอ้าง — 12/12

| กรณี | ผลที่ต้องได้ | ได้ |
|---|---|---|
| `ACCEPTED` ไม่มีเหตุผล/กำหนดส่ง | ผ่าน | ✓ |
| `MORE_REQUESTED` + เหตุผล ≥10 ตัว + กำหนดส่ง | ผ่าน | ✓ |
| `MORE_REQUESTED` ไม่มีเหตุผล | ปฏิเสธ | ✓ |
| เหตุผลสั้นกว่า 10 ตัวอักษร | ปฏิเสธ | ✓ |
| เหตุผลเป็นช่องว่างล้วน (`btrim`) | ปฏิเสธ | ✓ |
| `MORE_REQUESTED` ไม่มีกำหนดส่ง | ปฏิเสธ | ✓ |
| `verdict` นอกคำศัพท์ปิด | ปฏิเสธ | ✓ |
| `round = 0` | ปฏิเสธ | ✓ |
| slot เดิม round เดิม ซ้ำ | ปฏิเสธ | ✓ |
| slot เดิม **round ใหม่** | ผ่าน | ✓ |
| `applicationId` ที่ไม่มีจริง | ปฏิเสธ | ✓ |
| `organization_id` ที่ไม่มีจริง | ปฏิเสธ | ✓ |

ยิงซ้ำทั้งชุดหลังแก้เรื่องรันซ้ำ — ยัง 12/12 การแก้ไม่ทำให้ข้อจำกัดอ่อนลง

**ที่สำคัญคือแถว "slot เดิม round ใหม่ ผ่าน"** — ถ้า unique index กว้างเกินไป
รอบขอแก้ไขรอบที่สองจะเขียนไม่ได้ และเจ้าหน้าที่จะขอเอกสารเพิ่มครั้งที่สองไม่ได้เลย
เป็นเคสที่ผ่านโดยตั้งใจ ไม่ใช่ผ่านเพราะไม่มีอะไรกั้น
