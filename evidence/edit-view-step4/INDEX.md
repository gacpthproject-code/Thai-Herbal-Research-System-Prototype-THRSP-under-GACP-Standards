# หน้าแก้ไขคำขอ ([id]/edit) ทำคำตอบขั้น 4 หาย — หลักฐานเดินประตูจริง (2026-10-28)

เดินด้วย `harness/run.sh` (Postgres 17 ชั่วคราว + backend + next dev จาก tree นี้ + Chromium) สองครั้ง
บนโค้ดเดียวกันยกเว้นการแก้

| | แดง (`red/`, head c84940ec3 = main) | เขียว (`green/`, หลังแก้) |
|---|---|---|
| `GET /applications/:id` ส่ง varieties/varietiesNote/processing ให้หน้าแก้ไข | null ทั้งสาม (`record.json → editDoorEchoes`) | ครบตามที่เก็บ |
| ขั้น 4 บนจอหลังกด "เริ่มแก้ไขคำขอ" (`step4-1440x900.png`, `step4-390x844.png`) | ว่างทุกช่อง | สายพันธุ์ แหล่งที่มา จำนวน หน่วย ครบ |
| การบันทึกแรกหลังเริ่มแก้ไข ก่อนผู้ยื่นแก้อะไร (`draftPostsBeforeEdit`) | ส่ง varieties [] · processing null · serviceTypes [] | ส่งค่าที่เก็บครบ |
| เก็บบนเซิร์ฟเวอร์หลังแก้จำนวน 400 → 450 (`storedAfterEditViaDraftDoor`) | แถวพันธุ์เหลือแต่ 450 ช่องอื่นว่าง · processing null | แถวเดิม + 450 · processing · หมายเหตุ ครบ |
| `step4Survived` | false | true |

เทสต์: `red/jest-*.log` (แดงก่อนแก้) · `green/checks-*.log` (jest backend 38/38, web 156/156 แล้ว 117/117 หลัง tsc ผ่าน, eslint, tsc exit 0)
