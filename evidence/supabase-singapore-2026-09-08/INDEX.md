# ย้าย Supabase ไปสิงคโปร์ — demo + staging · 2026-09-08

> **บันทึกย้อนหลัง ไม่ใช่สภาพปัจจุบัน** (เติม 2026-09-11)
> โปรเจกต์สิงคโปร์คู่ที่วัดในเอกสารนี้ (`bgimfprulgdqsbrndmdm` · `hqdbagvwqpqayvniaatr`)
> **ไม่ได้ถูกใช้แล้ว** — operator ระบุว่าเป็นคนละโปรเจกต์กับที่ตั้งใจ · ของที่ใช้จริงวันนี้คือ
> `lqmvduxipfjygeitwufe` (staging) และ `spbdkellhyndyexljuar` (demo) วัดจาก
> `/opt/gacp-platform/.env.*` ของคอนเทนเนอร์ที่รันอยู่
> ตัวเลข latency ในเอกสารนี้ยังใช้อ้างอิงได้ เพราะเป็นการวัด region ไม่ใช่การวัดโปรเจกต์

## ข้อสมมติที่ค้างอยู่ ถูกพิสูจน์แล้ว
ก่อนย้ายผมบอกว่าจะไม่ย้ายจนกว่าจะวัดสิงคโปร์จริง เพราะเหตุผลทั้งหมดยืนบนตัวเลขที่ยังไม่เคยวัด
operator สร้าง project ให้ วัดแล้วได้ตามนี้:

| | ซิดนีย์/โซล เดิม | สิงคโปร์ ใหม่ |
|---|---|---|
| TCP connect | 243-246 ms | **4-6 ms** |
| `SELECT 1` พอร์ต 5432 | 244 ms | **4 ms** |
| `SELECT 1` พอร์ต 6543 | 1,205 ms | **17 ms** |
| 4 query ต่อกัน | 1,004 ms | **16 ms** |

พอร์ต 6543 (transaction mode) คิด 5 เท่าของ RTT เสมอ — ที่ซิดนีย์คือ 1,205 ms จนใช้ไม่ได้
ที่สิงคโปร์เหลือ 17 ms จึงเลือกใช้ 6543 ได้ ซึ่งปลอดภัยกว่าเรื่องคอนเนกชัน
(session mode เคยทำ EMAXCONNSESSION มาแล้ว) — ปัญหาที่ต้องเลือกหายไปเอง

## ผลจริงที่ผู้ใช้เจอ (ผ่านประตูสาธารณะ demo)
| endpoint | ก่อน | หลัง | เร็วขึ้น |
|---|---|---|---|
| `/api/health` | 2,044 ms | **89 ms** | 23× |
| `/api/invoices/my` | 1,547 ms | **142 ms** | 11× |
| `/api/certificates/my` | 1,016 ms | **197 ms** | 5× |
| `/api/applications/my` | 1,543 ms | **287 ms** | 5× |
| login เต็มเส้น | 6,124 ms | **2,581 ms** | 2.4× |

หน้าสาธารณะทั้งหมดตอบ 200: trace QR 0.33 s · verify ใบรับรอง 0.34 s · trace lot 0.11 s

## สถานะฐานข้อมูลหลังย้าย
| | project | region | พอร์ต |
|---|---|---|---|
| production | <retired-project> | ap-southeast-2 ซิดนีย์ | 5432 (ยังไม่ย้าย) |
| demo | hqdbagvwqpqayvniaatr | **ap-southeast-1 สิงคโปร์** | 6543 |
| staging | bgimfprulgdqsbrndmdm | **ap-southeast-1 สิงคโปร์** | 6543 |

**demo แยกออกจาก production แล้ว** — เดิมใช้ฐานเดียวกัน demo จึงเขียนทับข้อมูล production ได้
ตอนนี้แยกขาด และเพิ่ม `DIRECT_URL` (พอร์ต 5432) ให้ทั้งคู่ `prisma migrate deploy` จะไม่ค้างอีก

## ตรวจข้อมูลหลัง restore — ตรงกันทุกบรรทัด
staging: users 37 · applications 16 · certificates 1 · invoices 5 · audit_logs 733 · lots 2
         checkout_orders 5 · application_documents 74 · _prisma_migrations 135
demo   : tables 108 · indexes 594 · FK 206 · _prisma_migrations 136 · users 15
         applications 10 · certificates 1 · invoices 3 · audit_logs 1932 · lots 2
         herb_knowledge_entries 1946 · stripe_webhook_events 110

error ตอน restore (320-323 ข้อ) ทั้งหมดเป็น schema ที่ Supabase เป็นเจ้าของและเราไม่ได้ใช้
(`auth`, `storage`, `realtime`, `graphql_public`, `pgbouncer`, `supabase_vault`) — ตรวจแล้วว่า
auth.users = 0, storage.objects = 0, realtime = 0 ก่อนย้าย จึงไม่มีอะไรหาย

## ความผิดพลาดระหว่างทาง และวิธีที่จับได้
ผมยก staging ด้วย `--env-file .env.production` ซึ่ง **ทับ DATABASE_URL ใน .env.staging**
ทำให้ staging ไปต่อฐาน production อยู่ประมาณ 4 นาที
จับได้จากการตรวจ host หลังยก (ควรเป็นสิงคโปร์ แต่ขึ้นซิดนีย์ และ applications เป็น 10 ไม่ใช่ 16)
แก้ทันทีด้วย `--env-file .env.staging` และตรวจย้อนหลังว่าไม่มีการเขียนลง production:
นับรวมเท่าเดิมทุกตาราง · เวลาแก้ล่าสุดของ applications คือเมื่อวาน ของ users คือ 07:54
ซึ่งก่อนหน้าต่างเวลาที่ชี้ผิด (~09:07) ทั้งคู่

**บทเรียน:** compose overlay ของ staging/demo ไม่ได้ใช้ `--env-file` เดียวกัน
staging ต้อง `--env-file .env.staging` · demo อ่าน `.env.demo` เองผ่าน `env_file:` ในไฟล์ compose

## backup
- ก่อนเริ่ม: `/home/ubuntu/backups/supabase-premove-20260908T021114/` (restore พิสูจน์แล้ว)
- ก่อน cutover: `/home/ubuntu/backups/supabase-cutover-20260908T160406/` (dump สด)
- env เดิม: `/home/ubuntu/backups/env.staging.pre-sg.*` และ `env.demo.pre-sg.*`

## ยังต้องทำ
1. **หมุนรหัสผ่านฐานใหม่ทั้งสอง** — รหัสถูกวางลงแชท จึงอยู่ใน transcript แล้ว
2. production ยังอยู่ซิดนีย์ ย้ายเมื่อมี project ที่สาม หรือเมื่อ demo วิ่งนิ่งแล้วหลายวัน
3. ฐานเดิมทั้งสอง **ห้ามลบ** จนกว่าของใหม่จะวิ่งจริงอย่างน้อย 7 วัน


## ภาคสอง — ไม่มี production ในช่วง beta (operator 2026-09-08)

operator ยืนยันว่าตอนนี้เป็น beta **ไม่มี production** · demo คือตัวที่ใช้แทน staging คือที่ทดสอบ

### หยุด production containers
`gacp-backend` และ `gacp-frontend` หยุดแล้ว (stop ไม่ใช่ rm — image และ volume อยู่ครบ)
ก่อนหยุดตรวจแล้วว่า `gacpth.com` ตอบ 403 ทั้งหน้าเว็บและ `/api/health` คือไม่มีใครเข้าถึงได้อยู่แล้ว
หลังหยุด demo/staging ยังตอบ 200 ทั้งคู่

**ที่ต้องหยุดเพราะอะไร ไม่ใช่แค่ความสะอาด:** คอนเทนเนอร์นั้นรัน settlement-reconcile cron
ทุก 10 นาที และ**เขียนลงฐานซิดนีย์ซึ่งตอนนี้เป็น rollback ของ demo** — ปล่อยไว้ rollback
จะค่อย ๆ เพี้ยนจาก snapshot ที่ demo ถูกสร้างมา

### ตัดเส้นทางไปซิดนีย์
`.env.production` DATABASE_URL และ DIRECT_URL เปลี่ยนเป็นค่าที่ต่อไม่ได้
(`127.0.0.1:1/RETIRED_NO_PRODUCTION_DB`) พร้อมเหตุผล 6 บรรทัด — เลือกแบบนี้แทนการลบบรรทัด
เพราะ `docker-compose.production.yml:92` ใช้ `${DATABASE_URL:?}` ถ้าลบ compose จะ parse ไม่ผ่าน
และยกแม้แต่ frontend ของ demo/staging ไม่ได้ · **ล้มดัง ๆ ดีกว่าเงียบแล้วเขียนผิดฐาน**
ตรวจแล้ว: compose ของ demo และ staging ยัง parse ผ่านทั้งคู่

### บั๊ก Stripe ที่เจอระหว่างทาง — demo รับเงินไม่ได้เลย
`docker-compose.demo.yml:110-113` ประกาศ `- STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY:-}` ใน
`environment:` ซึ่ง**ชนะ `env_file:`** และ `${STRIPE_SECRET_KEY}` อ่านจาก `--env-file`
(คือ `.env.production` ที่ไม่มีตัวแปร Stripe เลย) → **ค่าว่างทับ key จริงที่อยู่ใน `.env.demo`**

อาการ: demo รายงานว่าไม่มี STRIPE_SECRET_KEY ทั้งที่ `.env.demo` มี key 107 อักขระเหมือน staging
และ cron ล้มทุก 10 นาทีด้วย `STRIPE_SECRET_KEY is not configured` ตั้งแต่เมื่อวาน

นี่คือกับดักที่คอมเมนต์เหนือ `env_file:` ในไฟล์เดียวกันเตือนไว้เอง ("Listing them one by one,
as the staging overlay does, is how staging lost RSA_PRIVATE_KEY_PASSPHRASE") — แล้วอีกสามบรรทัด
ถัดมาก็ทำแบบนั้นพอดี · `PAYMENT_ADAPTER` โดนแบบเดียวกัน (`.env.demo` = `stripe` แต่คอนเทนเนอร์ได้ว่าง)

แก้โดยเอาทั้งสี่ตัวออกจาก `environment:` ให้ `env_file` เป็นคนให้ค่า
หลังแก้: `PAYMENT_ADAPTER=stripe · STRIPE_SECRET_KEY 107 อักขระ · CHECKOUT=true`
และ reconcile รอบถัดมา **errors 0** (เดิม 1 ทุกรอบ)

order `0b8bff25` ยัง `PENDING_PAYMENT` และ `reDrivenOrders: 0` — ถูกต้อง แปลว่าถาม Stripe แล้ว
Stripe ตอบว่ายังไม่มีการจ่ายจริง ระบบไม่ได้สร้างการชำระเงินขึ้นมาเอง

### สถานะสุดท้าย
```
demo      สิงคโปร์ hqdbagvwqpqayvniaatr  :6543  15ms   ← ตัวที่ใช้จริงตอนนี้
staging   สิงคโปร์ bgimfprulgdqsbrndmdm  :6543  19ms
production หยุดแล้ว — beta ไม่มี production
ซิดนีย์   <retired-project>  เก็บเป็น rollback ห้ามลบจนถึง 2026-09-15
โซล      <retired-project>  เก็บเป็น rollback ห้ามลบจนถึง 2026-09-15
```
