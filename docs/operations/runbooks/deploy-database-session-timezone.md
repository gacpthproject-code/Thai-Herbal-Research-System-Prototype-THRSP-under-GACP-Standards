# ทำให้ทุก session ของฐานข้อมูลเป็น UTC

migration `20261107120000_database_session_timezone_utc` สั่ง `ALTER DATABASE <ชื่อฐาน> SET timezone TO 'UTC'`
ไม่แตะตารางและไม่แตะแถวข้อมูล ค่าที่เขียนไปแล้วคงเดิม

ทำไมต้องมี: คอลัมน์เวลาเป็น `timestamp(3)` ไม่มี zone และ Prisma อ่านค่าเป็น UTC โค้ดที่เอาเวลาจาก Postgres
(`NOW()`, trigger, default ของคอลัมน์) จึงถูกต้องเฉพาะเมื่อ session เป็น UTC

## ก่อน migrate

รันบนเครื่องปลายทาง อ่านจาก env file ของเครื่องนั้น อ่านอย่างเดียว ห้ามพิมพ์ URL ลงบรรทัดคำสั่ง URL เดินทางผ่าน environment
แบบเดียวกับ `scripts/deploy/deploy-staging.sh` จึงไม่อยู่ใน argv ของ `docker` และ shell history
stderr ถูกทิ้งเพราะ psql ยก URL หรือรหัสผ่านมาในข้อความ error ได้ ไม่มีผลออกมาเลยแปลว่าอ่านค่าไม่ได้
สาเหตุอาจเป็นต่อฐานไม่ได้ หรือ URL มี parameter ที่ libpq ไม่รู้จัก เช่น `?schema=public` ทั้งสองแบบ psql จบด้วย rc 2 และเงียบเหมือนกัน
ถ้า URL มี `?schema=public` ให้ตัดออกก่อน

```bash
ENV_FILE=.env.staging   # เครื่อง demo ใช้ .env.demo
TOOL_URL="$(grep -E '^DIRECT_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | sed -E "s/^[\"']//;s/[\"'[:space:]]+$//")"
PGURL="$TOOL_URL" docker run --rm -i -e PGURL postgres:17-alpine sh -c 'psql "$PGURL" -X -tA -f -' 2>/dev/null <<'SQL'
SHOW timezone;
SELECT current_user, pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname = current_database();
SELECT coalesce(r.rolname, '(ทุก role)') AS role, coalesce(d.datname, '(ทุกฐาน)') AS database, s AS setting
  FROM pg_db_role_setting x
  LEFT JOIN pg_roles r ON r.oid = x.setrole
  LEFT JOIN pg_database d ON d.oid = x.setdatabase
  CROSS JOIN LATERAL unnest(x.setconfig) AS s
 WHERE s ILIKE 'timezone=%';
SQL
```

อ่านผลทีละบรรทัด

1. บรรทัดแรกคือ zone ปัจจุบัน จดลงบันทึก deploy ถ้าไม่ใช่ `UTC` แถวเก่าที่เขียนด้วยเวลาของ Postgres คลาดอยู่แล้วและ migration นี้ไม่ซ่อม
   แจ้ง operator ก่อน migrate และดูหัวข้อ pooler ด้านล่าง
2. บรรทัดที่สองต้องได้ผู้ใช้ที่ migrate เป็นเจ้าของฐาน ไม่งั้น migration ล้มด้วย `must be owner of database`
3. บรรทัดถัดไปที่ขึ้นต้นด้วยชื่อ role คือค่าระดับ role ซึ่งชนะค่าระดับฐาน ต้องไม่มี บรรทัด `(ทุก role)` คือค่าระดับฐานเองและไม่เป็นปัญหา

ผลที่อ่านจาก demo เมื่อ 2026-11-07 ผ่าน Prisma connection ของคอนเทนเนอร์ backend เอง: `show timezone` = `UTC` ไม่มีค่า timezone ระดับ role ใน
`pg_db_role_setting` (0 จาก 10 แถว) role `postgres` เป็นเจ้าของฐานและไม่ใช่ superuser, Postgres 17.6 ยังไม่ได้อ่านจาก staging

## ถ้า migrate ล้ม

Prisma จะบันทึกว่า migration ค้าง และ `migrate deploy` รอบถัดไปจะตอบ P3009 แก้สาเหตุก่อน แล้วปลดด้วย image ใหม่

```bash
DATABASE_URL="$TOOL_URL" DIRECT_URL="$TOOL_URL" \
  docker run --rm --network gacp-network -e DATABASE_URL -e DIRECT_URL "$IMG" \
  sh -c 'cd /app/apps/backend && npx prisma migrate resolve --rolled-back 20261107120000_database_session_timezone_utc'
```

## ลำดับ

1. `migrate deploy` ตามขั้นตอน deploy ปกติ
2. เริ่ม backend ใหม่ ค่านี้มีผลเฉพาะ connection ที่เปิดหลัง migrate connection เดิมใน pool ของ Prisma ยังเป็นค่าเก่า
   ลำดับ `migrate deploy` แล้ว `up -d --no-deps` ด้วย image ใหม่ครอบข้อนี้อยู่แล้ว ถ้า image ไม่เปลี่ยนให้ `restart` เอง
3. เดินตรวจ: แถว `jobs` ข้อ `db-session-timezone` อ่าน `SHOW timezone` จาก prisma ของ backend ในคอนเทนเนอร์ ต้องได้ `UTC`
   รันเดี่ยวได้ด้วย `scripts/walk/deploy-walk.sh <base-url> --target <เครื่อง> --rows jobs`

## ย้อนกลับ

`--rolled-back` ใช้กับ migration ที่ล้มเท่านั้น ถ้า migration สำเร็จแล้วและต้องถอย คำสั่งอยู่ที่หัวไฟล์
`apps/backend/prisma/migrations/20261107120000_database_session_timezone_utc/migration.sql` หัวข้อ `Rollback (manual)`

## ฐานที่ต่อผ่าน Supabase pooler

`DATABASE_URL` ของ staging และ demo ผ่าน transaction pooler ซึ่งถือ connection ฝั่ง server ไว้เอง restart backend
จึงไม่ได้เปิด session ใหม่ที่ฐาน ถ้าค่าเดิมไม่ใช่ UTC ผลที่อ่านผ่าน pooler อาจยังเป็นค่าเก่าจนกว่า pooler จะเปิด connection ใหม่
ถ้า `SHOW timezone` ผ่าน `DATABASE_URL` เป็น `UTC` อยู่แล้วก่อน migrate ข้อนี้ไม่มีผล

## หลังกู้ฐานจาก dump

`pg_dump` ที่ไม่มี `--create` ไม่พกค่าระดับฐานมาด้วย ฐานที่สร้างใหม่แล้วกู้เข้าไปจึงไม่มีค่านี้ แต่มี `_prisma_migrations` ติดมา
migration จึงไม่รันซ้ำ และ probe จะ FAIL ให้เจ้าของฐานสั่งเอง แล้วเริ่ม backend ใหม่ การกู้ทับฐานเดิมไม่กระทบค่านี้

```sql
DO $$ BEGIN EXECUTE format('ALTER DATABASE %I SET timezone TO ''UTC''', current_database()); END $$;
```

## probe

```bash
DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2-)" bash scripts/probes/db-session-timezone.sh
```

ค่าต้องเป็น URL ที่ backend ใช้ อ่านจาก env file ไม่พิมพ์ลงบรรทัดคำสั่ง probe ลอกช่องว่างที่ติดมา และลอกเครื่องหมายคำพูดเฉพาะเมื่อครบคู่หัวท้าย
ถ้าได้ BLOCKED `query failed` แปลว่าต่อฐานไม่ได้ และ probe ไม่แสดงข้อความของ psql เพราะอาจมีรหัสผ่าน
ถ้าได้ BLOCKED `DATABASE_URL must name its own target` แปลว่า URL ไม่ใช่ `postgresql://host[:port]/database` เช่น ไม่มี host ไม่มีชื่อฐาน
มีเครื่องหมายคำพูดนำหน้าข้างเดียว หรือมี parameter ที่ย้ายปลายทาง (`host` `hostaddr` `port` `dbname` `user` `service`) URL ที่ไม่ระบุ port ใช้ 5432
probe ไม่ใช้ตัวแปร `PG*` ของ shell และไม่อ่าน `~/.psqlrc` ปลายทางมาจาก URL อย่างเดียว

ค่า `Etc/UTC` นับเป็น FAIL ตั้งใจให้เป็นแบบนั้น เพราะหมายความว่าค่าระดับฐานหายไป และเครื่องปลายทางแค่บังเอิญ default ใกล้เคียง
