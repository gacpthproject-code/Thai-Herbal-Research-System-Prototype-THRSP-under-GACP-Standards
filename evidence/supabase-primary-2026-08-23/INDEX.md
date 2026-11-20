# Supabase เป็นฐานข้อมูลหลัก — หลักฐานที่รันจริง 2026-08-23

คำสั่ง operator: "DB ต้องไปทำบน superbase เชื่อมต่อกับ superbase และตอนนี้ superbase คือ DB หลักที่ใช้
ไม่ใช่ในเครื่องเซิฟเวอร์"

ทุกบรรทัดข้างล่างเป็นผลรันจริงบนเครื่อง `ubuntu@43.134.175.51` และบน Supabase จริง ไม่ใช่การอธิบาย

---

## 1. เครื่องเซิร์ฟเวอร์ชี้ DB ตัวไหนอยู่ (ก่อนแก้)

```
gacp-backend          -> postgresql://***@postgres:5432/gacp_db?schema=public
gacp-backend-staging  -> postgresql://***@postgres:5432/gacp_staging?schema=public
gacp-backend-preview  -> postgresql://***@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres
```

โดเมนที่วิ่งเข้าแต่ละตัว (host nginx):

```
gacpth.com          -> docker_nginx_http (127.0.0.1:8080) -> gacp-backend   [postgres ในเครื่อง]
staging.gacpth.com  -> 127.0.0.1:8080                     -> gacp-backend   [postgres ในเครื่อง]
preview.gacpth.com  -> 127.0.0.1:3002 / 8002              -> *-preview      [Supabase]
```

ไม่มีโดเมนใดวิ่งเข้า `gacp-backend-staging` / `gacp-frontend-staging` (พอร์ต 8001/3001) — คู่นี้ลอยอยู่เฉย ๆ

## 2. ข้อมูลสองชุดนี้ไม่ทับกัน

| | postgres ในเครื่อง (`gacp_db`) | Supabase |
|---|---|---|
| users | 24 (เข้าใช้จริงทุกบัญชี) | 93 |
| ช่วงเวลาที่สร้างบัญชี | **2026-06-03 → 2026-08-04** | **2026-08-16 → 2026-08-23** |
| applications | 5 | 118 |
| certificates | 0 | 3 |
| checkout_orders | 0 | 15 |
| prisma migrations | 110 | **122** |

ช่วงเวลาไม่ซ้อนกันเลย → Supabase **ไม่ได้มี** 24 บัญชีนั้นอยู่ และสคีมาในเครื่องตามหลัง 12 migration
(ตาราง `herb_species` ในเครื่องถูกแทนด้วย `plant_species` บนสคีมาใหม่แล้ว)

สำรองไว้ก่อนแตะอะไรทั้งสิ้น:

```
~/backups/2026-08-23-pre-supabase-cutover/gacp_db.dump       900K
~/backups/2026-08-23-pre-supabase-cutover/gacp_staging.dump  1.4M
```

## 3. ช่องโหว่ที่เจอระหว่างทาง — ฐานความรู้สมุนไพรว่างเปล่าบน Supabase

`herb_knowledge_entries` มี 1,946 แถวในเครื่อง แต่บน Supabase มี **0 แถว** และเติมไม่ได้ด้วย เพราะ
foreign key `herb_knowledge_entries_herbCode_fkey` ยังชี้ไปที่ `herb_species.code` ขณะที่ตาราง
`herb_species` บน Supabase ว่าง (0 แถว) — ของจริงย้ายไปอยู่ `plant_species` (6 แถว) แล้ว

แก้เฉพาะหน้าโดยไม่แตะสคีมา: เติมตารางแม่แล้วโหลดเนื้อหาตาม

```
to load: herb_species 6 | herb_knowledge_entries 1946
supabase before: herb_species 0 | herb_knowledge_entries 0
herb_species inserted 6 | now 6
herb_knowledge_entries inserted 1946 | now 1946
```

**ยังค้าง**: FK ที่ชี้ผิดตารางเป็นหนี้สคีมา ต้องมี migration แยกใบ (Tier C) ย้าย FK ไป `plant_species.code`
แล้วทิ้ง `herb_species` — ไม่ได้ทำในใบนี้

## 4. Supabase เป็น Postgres 17.6 — client 15 ใช้ไม่ได้

```
pg_dump: error: aborting because of server version mismatch
pg_dump: detail: server version: 17.6; pg_dump version: 15.18
```

จึงตั้ง `PG_CLIENT_IMAGE` เป็น `postgres:17-alpine` ทั้งใน deploy script และ cron สำรอง

## 5. สำรอง Supabase ผ่านสายได้จริง

`scripts/backup/pg-backup.sh` ที่เขียนใหม่ รันจริงบนเครื่อง (ชี้ `.env.preview`):

```
[2026-08-23 20:40:00] 🔄 Starting backup of postgresql://aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres...
[2026-08-23 20:40:35] ✅ Daily backup complete: /tmp/backup-test/daily/gacp_20260823_204000.sql.gz (684K)
```

log บอกปลายทางจริง (host + ชื่อฐาน) โดยไม่มี credential หลุด — เดิม log เขียนว่า `gacp_db` ตายตัว
ซึ่งจะกลายเป็นคำโกหกทุกบรรทัดหลังย้ายฐาน

dump ที่ได้มี 139 `CREATE TABLE`

## 6. guard ของ restore ผูกกับปลายทางจริงแล้ว

ของเดิมให้ operator พิมพ์ `DB_NAME` เพื่อเลือกฐาน — แต่หลังย้ายมา Supabase ปลายทางมาจาก `DATABASE_URL`
เสมอ `DB_NAME` เปลี่ยนอะไรไม่ได้เลย ถ้าปล่อยไว้ คนพิมพ์ `DB_NAME=gacp_staging` จะเขียนทับ production
โดยเชื่อว่าไม่ได้ทำ จึงเปลี่ยนให้ยืนยันด้วยชื่อฐานที่ URL ชี้จริง:

```
Error: --restore needs you to confirm the database it will overwrite.

  This restore will DROP AND REPLACE objects in:
      postgresql://aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres
  There is no other target — DATABASE_URL decides, nothing else.

  Confirm by naming that database:
      sudo env RESTORE_TARGET=postgres bash ... --restore <file>
```

## 7. ถ้าปลด pgadmin เฉย ๆ เว็บทั้งเว็บดับ — พิสูจน์แล้ว

`nginx/gacp.production.conf` มี `proxy_pass http://pgadmin:80` ซึ่งเป็นชื่อ upstream ตรง ๆ
nginx resolve ชื่อแบบนี้ตอนโหลด config ครั้งเดียว ไม่ใช่ตอนมี request

รันจริงบน network เปล่าที่ไม่มี pgadmin:

```
=== OLD config, pgadmin absent ===
nginx: [emerg] host not found in upstream "pgadmin" in /etc/nginx/conf.d/default.conf:401
nginx: configuration file /etc/nginx/nginx.conf test failed

=== NEW config, pgadmin absent ===
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

และ config ใหม่ผ่าน `nginx -t` บน `gacp-network` จริงด้วย

## 8. compose ใหม่ผ่านการตรวจ

```
docker compose -f docker-compose.production.yml config --no-interpolate -q  -> exit 0
profiles: legacy-db ติดอยู่กับ postgres และ pgadmin ตามที่ตั้งใจ
```

---

## สิ่งที่ยังไม่ได้ทำ (ต้องรอ operator)

การสลับจริงบนเครื่องยังไม่ได้ทำ เพราะเป็นการเปลี่ยนฐานข้อมูลของโดเมนที่เปิดสาธารณะ และ image ของ
`gacp-backend` ที่รันอยู่เก่ากว่าสคีมา Supabase อยู่ 12 migration — ต้อง deploy จาก main ปัจจุบันพร้อมกัน
ขั้นตอนอยู่ใน `docs/operations/runbooks/supabase-primary-cutover.md`

---

## 9. ยืนยันสดหลังแก้ (2026-08-23, preview.gacpth.com)

preview รัน revision `6248a0d1` และตอบค่าธรรมเนียมใหม่:

```
GET /api/pricing/fees
phase1TotalPerScope: 5885 · phase2TotalPerScope: 29425 · renewalTotalPerScope: 35310
```

ฐานความรู้สมุนไพรใช้งานได้จริงแล้ว (ก่อนแก้ ทั้งสาม endpoint ตอบว่างเปล่า):

```
GET /api/herbs            -> success, count 6
GET /api/herbs/coverage   -> totalEntries 1946 · herbsMeetingTarget 6/6 (เป้า 300 ต่อชนิด)
                             CANNABIS 323 · TURMERIC 312 · GINGER 328 · BLACK_GALINGALE 329 ...
GET /api/herbs/CANNABIS/entries -> total 323 พร้อมเนื้อหาจริง
```

พบระหว่างกด: `?limit=2` ไม่มีผล route ตอบ `pageSize: 50` เสมอ — พารามิเตอร์ชื่อไม่ตรงกับที่ route อ่าน (บั๊กเล็ก ยังไม่แก้)

## 10. ขอบเขต deploy (มติ operator วันเดียวกัน)

deploy เฉพาะ `preview.gacpth.com` · `gacpth.com` / `staging.gacpth.com` แช่เวอร์ชั่นเก่าไว้ตั้งใจ
⇒ `gacp-postgres` ต้องเปิดอยู่ต่อไป · การตัดสวิตช์ในข้อ 1-8 เป็นการเตรียมไว้ ยังไม่ถึงเวลารัน
