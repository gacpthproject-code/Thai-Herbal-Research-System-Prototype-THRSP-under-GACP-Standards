# RLS Phase 1 — ชุดคำสั่งพร้อมวาง (operator รันบน staging เท่านั้น)

ที่มา: `docs/operations/rls-phase1-gacp-app-cutover.md` (ตัดมาเฉพาะคำสั่ง เรียงตามลำดับจริง)
กติกา: **ทุกกล่องด้านล่างรันบนเครื่อง staging ผ่าน SSH ทั้งหมด** — ห้ามวางลงเครื่อง Windows (บทเรียน HARNESS_LOG 2026-08-14: คำสั่งคนละเครื่องในคำตอบเดียวกันทำ deploy key ถูกเขียนทับ)
เตรียมก่อน: รหัสของ superuser `gacp` (จาก password manager) · เปิด password manager ไว้รับค่าใหม่

## ขั้น 1 — ตั้ง ADMIN_DATABASE_URL (superuser)

```bash
export ADMIN_DATABASE_URL="postgresql://gacp:<รหัสของ gacp>@<host>:5432/<db>?schema=public"
```

## ขั้น 2 — provision role `gacp_app` (idempotent, ไม่แตะ policy)

```bash
cd /opt/gacp-platform
APPPW="$(openssl rand -hex 24)"
psql "$ADMIN_DATABASE_URL" -v apppw="$APPPW" -f apps/backend/scripts/rls/gacp-app-provision.sql
echo "APPPW generated — copy it into the password manager now (it is not printed again)"
```

**เก็บ `$APPPW` เข้า password manager ทันที** (ต้องใช้ขั้น 4) — ห้าม echo ค่าออกมา ห้ามเขียนลงไฟล์ที่ commit

## ขั้น 3 — probe ต้อง PASS ก่อนไปต่อ (ประตูตัดสิน)

```bash
cd /opt/gacp-platform
DATABASE_URL="$ADMIN_DATABASE_URL" node apps/backend/scripts/rls/gacp-app-coverage-probe.js
```

- ได้ `PASS: gacp_app has full DML on every public base table.` → ไปขั้น 4
- ได้ `FAIL: ...` พร้อมรายชื่อตาราง → **หยุด** รันขั้น 2 ซ้ำ (idempotent) แล้ว probe ใหม่ · ยังไม่ผ่านอีก = ส่งรายชื่อตารางกลับมาให้ agent วิเคราะห์
- **เก็บ output ทั้งก้อนไว้เป็นหลักฐาน** (จะเป็นคู่เทียบกับ `probe-against-real-catalog-no-role.txt` ที่ตอนนี้ FAIL 104 ตาราง)

## ขั้น 4 — cutover staging (แก้ env + recreate ห้าม restart)

แก้ `/opt/gacp-platform/.env.staging` เพิ่มสองบรรทัด (**ห้ามแตะ `DB_USER`**):

```
APP_DB_USER=gacp_app
APP_DB_PASSWORD=<ค่า APPPW จากขั้น 2>
```

```bash
cd /opt/gacp-platform
docker compose --env-file .env.staging \
  -f docker-compose.production.yml -f docker-compose.staging.yml \
  up -d --force-recreate --no-deps backend-staging
```

## ขั้น 5 — smoke + เฝ้า log ≥ 1 วันทำการ

```bash
docker logs gacp-backend-staging --tail 200 -f | grep -i 'permission denied for table'
```

smoke ที่ต้องกดจริง: login · อ่าน+เขียน application 1 รอบ · checkout 1 รอบ · Stripe webhook 1 ครั้ง
**เจอ `permission denied for table` แม้บรรทัดเดียว = rollback ทันที** แล้วกลับไปหาตารางที่หลุดด้วย probe ขั้น 3

## Rollback ทันที (ถ้าต้อง)

ลบ/คอมเมนต์สองบรรทัด `APP_DB_USER` + `APP_DB_PASSWORD` ออกจาก `.env.staging` แล้ว recreate ด้วยคำสั่งเดียวกับขั้น 4 — `${APP_DB_USER:-gacp}` จะกลับไปใช้ superuser เดิม

---

## สิ่งที่ agent ทำให้แล้ว (ไม่ต้องทำซ้ำ)

- ยืนยันว่า **probe ไม่ใช่ guard ปลอม**: รันกับ Postgres จริงที่ยังไม่มี role → `FAIL` พร้อมรายชื่อ **104 ตาราง** (`probe-against-real-catalog-no-role.txt`) — ถ้ามันจะ PASS ลอยๆ มันจะ PASS ตั้งแต่รอบนั้นแล้ว
- อ่าน runbook ครบและถอดคำสั่งมาเรียงตามลำดับจริง (ไม่มีการเดา — ทุกกล่องตรงกับต้นฉบับ)

## สิ่งที่ agent ทำแทนไม่ได้ (และไม่ควรทำ)

ขั้น 2/4/5 แตะเครื่องที่โฮสต์ container ของ **production** ด้วย (`staging-box-topology.md`) · ขั้น 5 ต้องเฝ้าต่อเนื่อง ≥1 วันทำการ ซึ่งยาวกว่าอายุ session ของ agent · CLAUDE.md L5 + `.claude/agents/infra-devops.md` กำหนดให้ agent เสนอคำสั่ง ไม่ใช่รันเอง
