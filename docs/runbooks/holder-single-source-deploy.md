# Runbook — ทะเบียนผู้ถือแหล่งเดียว (feat/holder-single-source · คำสั่ง 134 งาน 2, 142, 143, 145)

**ผู้ใช้คู่มือ:** coordinator ที่ได้คำว่า "deploy" จาก operator แล้ว รันบน staging ก่อน demo
**ใช้เวลา:** ประมาณ 10 นาทีต่อเครื่อง ไม่รวมเวลา build image
**ความเสี่ยง:** ต่ำ migration เพิ่มคอลัมน์อย่างเดียว ไม่เขียนทับข้อมูลเดิม มี rollback ในหัวไฟล์ migration

---

## สิ่งที่เปลี่ยนสำหรับผู้ใช้

- ผู้ถือใบรับรอง (Entity) เป็นแหล่งเดียวของข้อมูล กทล.1 ส่วนที่ ๑ ใบรับรอง ใบเสร็จ และหน้าจอเจ้าหน้าที่
  ขั้นตอนที่ 2 ของคำขอไม่รับพิมพ์ตัวตนอีก แสดงทะเบียนผู้ถือแบบอ่านอย่างเดียวและลิงก์ "แก้ข้อมูลผู้ถือ"
- ประเภทผู้ถือ 4 แบบ: บุคคลธรรมดา บริษัท ห้างหุ้นส่วน (ใหม่) วิสาหกิจชุมชน
- คำขอ กทล.1 ส่งได้ต่อเมื่อทะเบียนผู้ถือครบ (`HOLDER_INCOMPLETE` ใน `errorsByStep.holder` ของการส่ง 422 `APPLICATION_INCOMPLETE`)

## ข้อควรรู้ก่อน deploy (สำคัญ)

**ร่างคำขอที่มีอยู่ทุกใบจะติดสถานะ "ข้อมูลผู้ถือยังไม่ครบ" ทันทีหลัง deploy** จนกว่าผู้ยื่นจะไปกรอกหน้าทะเบียนผู้ถือ
(`/health/holders/:id`) ให้ครบ เพราะทะเบียนผู้ถือที่สร้างก่อนรุ่นนี้ไม่มี คำนำหน้า สัญชาติ ชื่อ-นามสกุลผู้ลงนาม
แยกช่อง และที่อยู่ติดต่อ ขั้นตอนที่ 2 จะบอกผู้ยื่นว่าขาดอะไร และปุ่มส่งคำขอตอบ 422 พร้อมรายการช่องที่ขาด
สคริปต์ย้ายข้อมูล (ข้อ 4) ช่วยได้เฉพาะร่างที่พิมพ์ค่าตรงกับทะเบียน ใบรับรองที่ออกแล้วไม่ถูกแตะ

ผู้ถือรุ่นเก่าที่เก็บ `payload.director / president / contact` (ชื่อผู้ลงนามเป็นข้อความเดียว) ไม่ถูกย้ายอัตโนมัติ เจ้าของต้องกรอกหน้าทะเบียนผู้ถือเอง

## ลำดับ

### 1. build image จากหัว main ที่รวมกิ่งนี้แล้ว

```
scripts/deploy/build-images.sh <sha>
```

### 2. migration `20261027120000_holder_identity_source` (ลงก่อน restart image ใหม่)

ทดสอบแล้วบน Postgres 17 ชั่วคราว (`~/work/state/reviews/holder-migration-test.out`): apply บนแถวเดิม → ทุกแถวได้ `SELF_DECLARED` →
CHECK ปฏิเสธค่าอื่น → แถว PARTNERSHIP แทรกได้ → rollback ตามหัวไฟล์ → apply ซ้ำได้ · `migrate status` สะอาด

```
# ใน deploy-20260930.sh ขั้น [2/4] [3/4] อยู่แล้ว: สำรองฐาน → migrate status → migrate deploy
docker compose ... run --rm backend sh -lc 'cd /app/apps/backend && npx --no-install prisma migrate deploy --schema prisma/schema'
```

ตรวจหลัง apply:

```sql
select column_name, column_default, is_nullable
from information_schema.columns where table_name = 'entities' and column_name like 'identity%';
-- identitySource  'SELF_DECLARED'  NO
-- identityVerifiedAt  NULL  YES
select "identitySource", count(*) from entities group by 1;   -- ทุกแถว SELF_DECLARED
```

Rollback: SQL ในหัวไฟล์ `apps/backend/prisma/migrations/20261027120000_holder_identity_source/migration.sql` แล้ว deploy image ก่อนหน้า
แถว type `PARTNERSHIP` ที่สร้างระหว่างนั้นจะคงอยู่ image เก่าอ่านเป็นประเภทที่ไม่รู้จัก

### 3. restart backend + frontend ด้วย image ใหม่ (ขั้น [4/4] ของ deploy-20260930.sh)

### 4. ย้ายตัวตนในร่างคำขอเข้าทะเบียนผู้ถือ (เฉพาะที่ตรงกัน)

dry run ก่อนเสมอ อ่านเฉพาะ DRAFT เขียนเฉพาะช่องว่างของทะเบียนผู้ถือที่เลขทะเบียนตรงกับที่ร่างพิมพ์ และชื่อที่พิมพ์ต้องตรงกับชื่อในทะเบียน
ชื่อที่พิมพ์เป็นข้อความเดียว (authorizedSignatory, presidentName) ไม่ถูกแยกเป็นคำนำหน้า/ชื่อ/นามสกุล

```
docker compose ... exec backend sh -lc 'cd /app/apps/backend && node scripts/holder/backfill-holder-from-drafts.js'
# อ่านบรรทัดสุดท้าย: {"mode":"dry-run","drafts":N,"MAPPED":a,"NOTHING_TO_MAP":b,"NO_IDENTIFIER":c,"IDENTIFIER_MISMATCH":d,"CONFLICT":e,"VERIFIED":f,"UNKNOWN_TYPE":g}
# บรรทัด CONFLICT ระบุ applicationId และช่องที่ขัดกัน ไม่พิมพ์ค่าข้อมูลส่วนบุคคล
```

ส่งตัวเลขให้ operator ก่อน แล้วจึง

```
docker compose ... exec backend sh -lc 'cd /app/apps/backend && node scripts/holder/backfill-holder-from-drafts.js --apply'
docker compose ... exec backend sh -lc 'cd /app/apps/backend && node scripts/holder/backfill-holder-from-drafts.js'   # รอบสอง: MAPPED ต้องเป็น 0
```

รันซ้ำได้ (idempotent) จำกัดองค์กรได้ด้วย `--org=<organizationId>`

### 4ข. นับผู้ถือบริษัทรุ่นเก่าที่เลขทะเบียนเป็นของห้างหุ้นส่วน (อ่านอย่างเดียว · operator ตัดสิน)

ประตูใหม่ปฏิเสธเลขที่หลักที่ 4 เป็น 2 หรือ 3 ใต้ประเภท "บริษัท" แต่แถว JURISTIC ที่สร้างก่อนคำสั่ง 145 ไม่ถูกตัดสินซ้ำ
และยังใช้งานเป็นบริษัทต่อไป คอลัมน์ `juristicId` เข้ารหัสไว้ จึงนับผ่าน prisma (ถอดรหัสตอนอ่าน) ไม่ใช่ SQL
สคริปต์อ่านอย่างเดียว ไม่พิมพ์เลขทะเบียน

```
docker compose ... exec backend sh -lc 'cd /app/apps/backend && node scripts/holder/count-partnership-kind-juristic.js'
# {"total":N,"byKind":{"2":a,"3":b,"5":c,"7":d},"other":e,"unreadable":f,"partnershipKind":a+b}
# เติม --ids เมื่อต้องการ entity id ของแถวที่เป็นของห้างหุ้นส่วน
```

ส่งตัวเลขให้ operator แล้วรอคำตัดสิน จะเปลี่ยนประเภทแถวเหล่านั้นเป็น PARTNERSHIP หรือคงไว้ ระบบไม่เปลี่ยนให้เอง

### 5. ตรวจหลัง deploy

- เข้าสู่ระบบผู้ยื่น → `/health/holders/<id>` แสดงประเภท เลขทะเบียน (เลขบัตรประชาชนถูกปิดบัง) และช่องตามประเภท
- คำขอใหม่ ขั้นตอนที่ 2 แสดงทะเบียนผู้ถือแบบอ่านอย่างเดียว ไม่มีช่องกรอกตัวตน
- `GET /api/provider/applications/:id` มี `holder` และหน้าคำขอฝั่งเจ้าหน้าที่แสดงการ์ด "ผู้ถือใบรับรอง" (บุคคลที่สมัครด้วยรหัสผ่านขึ้น "ยังไม่ยืนยันตัวตน")
- `docs/api/error-codes.md` มี `HOLDER_FIELD_LOCKED` `HOLDER_VALIDATION_FAILED` `INVALID_HOLDER_TYPE` `HOLDER_INCOMPLETE`

## กติกาเลขทะเบียน (คำสั่ง 145)

- วิสาหกิจชุมชน: รับเป็นข้อความตามหนังสือสำคัญ สวช.01 (ตัวเลข ขีด และ /) ต้องมีตัวเลขอย่างน้อย 1 หลัก ยาวไม่เกิน 40 ตัวอักษร ไม่กำหนดรูปแบบ เจ้าหน้าที่ตรวจกับเอกสารแนบ
- เลขทะเบียนนิติบุคคล 13 หลักของกรมพัฒนาธุรกิจการค้า หลักที่ 4 บอกประเภท: 2 ห้างหุ้นส่วนสามัญนิติบุคคล · 3 ห้างหุ้นส่วนจำกัด · 5 บริษัทจำกัด · 7 บริษัทมหาชนจำกัด
  ห้างหุ้นส่วนรับ 2 หรือ 3 บริษัทรับ 5 หรือ 7 เลขอื่นถูกปฏิเสธพร้อมบอกประเภทที่ต้องเลือก
- ห้างหุ้นส่วนสามัญที่ไม่ได้จดทะเบียนไม่เป็นนิติบุคคล (ป.พ.พ. มาตรา 1015, 1064, 1079) เป็นผู้ถือไม่ได้ หน้าสร้างผู้ถือบอกให้จดทะเบียนก่อนหรือยื่นในนามบุคคลธรรมดา
- ชื่อผู้ลงนาม: ห้างหุ้นส่วน "หุ้นส่วนผู้จัดการ" · บริษัท "กรรมการผู้มีอำนาจลงนาม" · วิสาหกิจชุมชน "ประธานวิสาหกิจชุมชน"
