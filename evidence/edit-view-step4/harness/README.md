# หน้าแก้ไขคำขอ ([id]/edit) ทำคำตอบขั้น 4 หาย — เครื่องมือเดินประตูจริง

เดินตามที่ผู้ยื่นทำจริง: ยื่นร่างที่มีคำตอบขั้น 4 ผ่าน `POST /api/applications/draft` → เปิด
`/health/applications/<id>/edit` ในเบราว์เซอร์ → กด "เริ่มแก้ไขคำขอ" → ดูขั้น 4 → แก้หนึ่งช่อง →
รอ autosave → อ่านคำขอกลับจากเซิร์ฟเวอร์ ผลอยู่ใน `../<label>/record.json` และภาพหน้าจอข้าง ๆ

## เตรียมครั้งเดียว

```bash
docker run -d --name gacp-editstep4-pg -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=gacp_editstep4 \
  -p 127.0.0.1:55497:5432 postgres:17-alpine
# apps/backend/.env ของ worktree นี้: สำเนาของ .env หลักที่เปลี่ยน DATABASE_URL เป็นฐานนี้, PORT=8097,
# NODE_ENV=development, REDIS_URL ชี้พอร์ตว่าง, ENABLE_QUEUE/ENABLE_CACHE=false, ENABLE_OCR_BYPASS=true
cd apps/backend && DATABASE_URL='postgresql://postgres@127.0.0.1:55497/gacp_editstep4?schema=public' npx prisma migrate deploy
DATABASE_URL='postgresql://postgres@127.0.0.1:55497/gacp_editstep4?schema=public' node ../../evidence/edit-view-step4/harness/seed-org.cjs
```

## รัน

```bash
~/work/state/heavy.sh evidence/edit-view-step4/harness/run.sh <label>
```

`run.sh` เปิด backend (8097) และ `next dev` (3097) จาก tree นี้ รอจนตอบ แล้วรัน `walk.mjs` จบแล้วปิดทั้งคู่
ด้วย process group ของตัวเอง ไม่แตะ container ของ staging

## อ่านผล

- `record.json` → `editDoorEchoes` คือสิ่งที่ `GET /applications/:id` ส่งให้หน้าแก้ไข, `step4OnScreen` คือค่าที่
  เห็นในขั้น 4 หลังกดเริ่มแก้ไข, `autosave.sentStep4` คือสิ่งที่ autosave ส่งหลังแก้หนึ่งช่อง,
  `storedAfterEditViaDraftDoor` คือสิ่งที่เซิร์ฟเวอร์เก็บหลังจากนั้น, `step4Survived` คือคำตัดสิน
- `step4-1440x900.png`, `step4-390x844.png` ขั้น 4 หลังโหลดจากหน้าแก้ไข
