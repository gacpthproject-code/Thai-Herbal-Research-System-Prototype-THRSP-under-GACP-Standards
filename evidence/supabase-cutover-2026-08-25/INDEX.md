# ย้าย gacpth.com มาใช้ Supabase — ผลรันจริง 2026-08-25

คำสั่ง operator: "DB ไปที่ superbase หมด" · และ "staging จะเป็น frontend เวอร์ชั่นเก่า
และเราจะ deploy แค่ preview.gacpth.com และ gacpth.com"

## สิ่งที่เปลี่ยน

`.env.production` เปลี่ยน `DATABASE_URL` จาก postgres ในเครื่องเป็น Supabase pooler
(operator รันเอง — ระบบกันไม่ให้ agent แก้ไฟล์ credential บน production)
แล้วสร้าง container ใหม่ด้วย **image เดิม** ไม่ได้ deploy โค้ดใหม่:

```
docker compose --env-file .env.production -f docker-compose.production.yml up -d backend frontend nginx
[+] up 5/5  gacp-backend Started · gacp-nginx Started · frontend/minio/redis unchanged
```

## ยืนยันว่าแอปคุย Supabase จริง

```
sudo docker exec gacp-backend printenv DATABASE_URL
  postgresql://***@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres
```

ตรวจสองชั้นจากในเครื่อง (ข้าม Cloudflare):

```
ตรงเข้า container :8000/api/health
  {"success":true,"version":"3.0.0","database":"postgresql",
   "dbStatus":{"status":"connected","type":"postgresql"}}

ผ่าน docker nginx :8080/api/health (Host: gacpth.com)
  {"success":true,"version":"3.0.0","database":"postgresql",
   "dbStatus":{"status":"connected","type":"postgresql"}}
```

`connected` ไม่ใช่แค่ container ขึ้น — มันต่อฐานที่ URL ชี้ได้จริง

## เรื่อง 403 จากภายนอก — ไม่ใช่ปัญหาของเรา

`https://gacpth.com/` และ `/api/health` ตอบ **403 จาก Cloudflare** ทุก path

```
HTTP/1.1 403 Forbidden
Server: cloudflare
CF-RAY: a303f7acda319c71-SIN
```

access log ของ host nginx: **คำขอ Host=gacpth.com เข้ามา 0 รายการ** ⇒ ถูกตัดที่ขอบ
ไม่ได้วิ่งถึงเครื่อง ⇒ ไม่เกี่ยวกับการย้าย DB · operator แจ้งว่ากำลังปิดเมฆสีส้มของโดเมนนี้
เทียบ: `preview.gacpth.com/api/health` = 200 ปกติ

## สำรองที่มีก่อนแตะอะไร

```
/var/backups/gacp/pre-cutover/supabase-20260824_234745.sql.gz   769K  (ปลายทาง)
~/backups/2026-08-23-pre-supabase-cutover/gacp_db.dump          900K  (ต้นทางเดิม)
~/backups/2026-08-23-pre-supabase-cutover/gacp_staging.dump     1.4M
/opt/gacp-platform/.env.production.bak-precutover                     (ถอย env)
/opt/gacp-platform/docker-compose.production.yml.bak-precutover
/opt/gacp-platform/nginx/gacp.production.conf.bak-precutover
```

## ข้อมูลที่ไม่ได้ย้ายมา — ตามที่ operator อนุมัติ

`gacp_db` เดิมมี 24 บัญชี · 5 คำขอ · 6 สลิป · 2 ใบแจ้งหนี้ ที่ Supabase ไม่มี
(คนละช่วงเวลากันสนิท) ไม่มีใบรับรองและไม่มี checkout_orders ติดอยู่กับชุดนั้น
operator สั่ง "ลบของเก่า และสร้างใหม่ ก็ได้" ⇒ ข้อมูลยังอยู่ในไฟล์สำรอง ไม่อยู่บนเว็บ

## postgres ในเครื่อง — ยังต้องรัน

ตามทาง (ก) ที่ operator เลือก: `gacp-postgres` เลี้ยง `gacp_staging` ให้ชุด staging
ที่แช่แข็งไว้ **ห้ามปิด** · ถอด `profiles: [legacy-db]` ออกจาก compose แล้ว เพราะถ้าอยู่
หลัง profile คนรัน `docker compose up -d` เฉย ๆ จะข้ามมันไปแล้ว staging ตายเงียบ ๆ

## ยังไม่ได้ทำ

- แยก `staging.gacpth.com` ออกจาก `gacpth.com` — วันนี้ทั้งคู่ชี้ 127.0.0.1:8080 ตัวเดียวกัน
  ⇒ deploy gacpth.com แล้ว staging เปลี่ยนตาม ต้องชี้ staging ไป 3001 (`gacp-frontend-staging`)
- ปิด `gacp-pgadmin` และ `gacp-restore-drill` (ปิดได้ ไม่มีโดเมนวิ่งเข้า)
- ลบ volume `gacp-postgres-data` — **ยังไม่ทำ** เป็นทางถอยเดียวของ 24 บัญชี
