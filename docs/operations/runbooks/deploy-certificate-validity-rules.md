# Deploy: อายุใบรับรองเป็นกฎที่มีวันมีผล (migration 20261006130000)

Migration `apps/backend/prisma/migrations/20261006130000_certificate_validity_rules`
- สร้างตาราง `certificate_validity_rules` (เพิ่มอย่างเดียว: trigger ปฏิเสธ UPDATE/DELETE · เดือนต้องเป็นปีเต็ม 12–120)
  ตั้งต้นด้วยกฎ 12 เดือน มีผลตั้งแต่ 2026-09-11 00:00 เวลาไทย
- เปลี่ยน `certificates."validityYears"` เป็น `"validityMonths"` (แปลงตรงตัว ปี × 12) แล้วลบคอลัมน์เดิม

ระบบยังไม่เปิดใช้จริง จึงไม่ทำแบบ expand/contract: **migrate แล้วเปลี่ยน image ทันที** เป็นคำสั่งเดียวที่ผูกด้วย `&&`.
- image เดิมบนฐานที่ migrate แล้ว: ออกใบรับรองไม่ได้ (เขียน `validityYears` ที่ไม่มีแล้ว) และอ่านใบรับรองล้ม
- image ใหม่บนฐานที่ยังไม่ migrate: boot guard (`config/migration-level-guard.js`) ไม่ยอมเริ่ม
ช่วงระหว่างสองคำสั่งอย่ากดออกใบรับรองหรือแก้ไขใบรับรอง.

staging กับ demo เป็นฐานข้อมูลคนละชุด (Supabase คนละ project) ทำทีละ env: **staging ก่อน ตรวจผ่านแล้วจึง demo**.

## ตัวแปร (ตั้งครั้งเดียว · ไม่มีคำสั่งไหนพิมพ์ URL ออกจอ)
```bash
cd /opt/gacp-platform
SHA=<commit ที่ operator merge>                 # เต็ม 40 ตัว
IMG=ghcr.io/jonmaxmore/gacp-backend:local-${SHA:0:12}
url_of() { grep -E '^DIRECT_URL=' "$1" | head -1 | cut -d= -f2-; }   # session-mode URL (ไม่ใช่ pooled)
```

## 1. staging: สำรอง → migrate → image
สคริปต์ทำ pg_dump → migrate จาก image ใหม่ → recreate และหยุดก่อน recreate ถ้า migrate ล้ม:
```bash
sudo IMAGE_TAG=local-${SHA:0:12} bash scripts/deploy/deploy-staging.sh
```

## 2. demo (เครื่องของ demo): สำรอง → migrate → image ในก้อนเดียว
ทำ pg_dump ตามขั้น 3–4 ของ `deploy-pr3-drop-dtam-remittance-schema.md` (ใต้ `umask 077`) แล้วต่อด้วย:
```bash
DATABASE_URL="$(url_of .env.demo)" DIRECT_URL="$(url_of .env.demo)" \
  docker run --rm --network gacp-network -e DATABASE_URL -e DIRECT_URL "$IMG" \
    sh -c 'cd /app/apps/backend && npx prisma migrate deploy' \
&& DEMO_IMAGE_TAG=local-${SHA:0:12} docker compose --env-file .env.demo \
     -f docker-compose.production.yml -f docker-compose.demo.yml \
     up -d --no-deps backend-demo frontend-demo
```
ห้าม bare `docker compose up -d` · ห้าม `--remove-orphans`.

## 3. ตรวจหลัง deploy (ทุก env ที่ทำ)
แทน `<BASE>` ด้วยโดเมนของ env นั้น และ `<NO>` ด้วยเลขใบรับรองที่ออกแล้วหนึ่งใบ (ถ้ามีใบที่เคยแก้ไข ใช้ใบนั้น):
1. `curl -fsS <BASE>/api/certificate-validity` ต้องได้ `{"months":12,"effectiveFrom":"2026-09-10T17:00:00.000Z"}` ใน `data`
2. `curl -fsS <BASE>/api/public/verify/<NO>` ใบที่ออกก่อน deploy ต้องยังได้ `valid: true` (hash ที่ลงนามไว้ตรวจผ่าน)
3. ใบที่เคยแก้ไข: `curl -fsS <BASE>/api/public/verify/<NO>/revisions/1` ต้องได้ `integrity: "VALID"` ไม่ใช่ `TAMPERED`

ข้อ 2 หรือ 3 ได้ `TAMPERED` = หยุด แจ้ง operator (ห้ามแก้ข้อมูลใบรับรองเอง).

## ถอยกลับ
SQL ในหัวไฟล์ migration (ตรงตัวเพราะทุกใบเป็นปีเต็ม) แล้วปล่อย image เดิม หรือใช้ dump จากขั้น 1–2.
