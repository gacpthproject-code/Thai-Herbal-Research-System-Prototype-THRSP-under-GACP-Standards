# API + Database Audit — 2026-09-08

รายงานฉบับเต็ม: `REPORT.html`
artifact: https://claude.ai/code/artifact/0447f1d4-9af3-4895-b169-143bd512c40c

## ขอบเขต
648 route handler · 187 route file · 107 Prisma model · 108 ตาราง · 594 index · 206 FK
ตรวจบนระบบที่รันอยู่จริง ไม่ใช่อ่านโค้ดอย่างเดียว

## ผล
89 ข้อค้นพบ · ผ่านการหักล้าง 73 · ถูกปฏิเสธ 1 · **ยังไม่ได้ตรวจสอบ 15**
(agent ตรวจสอบของ lane schema-cleanliness ชนโควตารายสัปดาห์ — 15 ข้อนั้นทำเครื่องหมาย `unverified`
ใน findings.json **ยังไม่ควรใช้ตัดสินใจ**)

Critical 20 · Performance 21 · Contract 32

## สิ่งที่วัดได้ (ไม่ใช่การอ่านโค้ด)
| | |
|---|---|
| TCP ไปฐานข้อมูล | 244 ms (ตอนอยู่ซิดนีย์) |
| `SELECT 1` | 244 ms — เท่าระยะทางเป๊ะ |
| `count(*)` ทั้งตาราง | 251 ms — งานจริงในฐาน ≈ 7 ms |
| query ต่อ request | ~4-5 (นับด้วย pg_stat_statements) |
| OpenAPI ครอบคลุม | 48/648 = 7.4% |
| route file ที่อ้าง validator | 3/187 |
| findMany ที่มี pagination | 90/435 |
| POST ที่คืน 201 | 45/205 |
| `$transaction` | 67 ไฟล์ 122 จุด (จุดแข็ง) |

**ข้อค้นพบที่เปลี่ยนลำดับทั้งรายงาน:** `count(*)` กับ `SELECT 1` ใช้เวลาเท่ากัน แปลว่า
งานในฐานข้อมูลเกือบเป็นศูนย์ — index ที่ประหยัด 5 ms ไม่มีความหมายเมื่อรอบเดินทางราคา 244 ms
รายงานจึงเรียงตามจำนวนรอบเดินทาง ไม่ใช่ตามตำรา index

## แก้ไปแล้วในวันเดียวกัน
- `API-01` + `ERR-01` — 404 คืน HTML และ 404 ทั้งที่ผิดแค่ method → commit `fe289fea`
  (middleware/api-not-found.js เดิน router stack ตอบ 405 พร้อม Allow header · RED ก่อน 9 เทส)
- `CORS` — ปฏิเสธ origin ตอบ 500 → `callback(null, false)` · commit `fe289fea`
- `AUTH-01` ครึ่งหนึ่ง — 488 ms ของ middleware เหลือ ~8 ms จากการย้ายฐานไปสิงคโปร์
- `DB-01 (lane 5)` — ข้อคอนเนกชัน **ตกไป** เพราะย้ายมาใช้ transaction mode แล้ว
  ทดสอบเอง 30/30 ผ่านทั้ง demo และ staging

## ข้อที่หนักที่สุดและยังไม่ได้แก้
**VAL-01 — ตัวกรอง input ลบข้อความไทยทิ้งเงียบ ๆ ก่อนบันทึก** (พิสูจน์โดยรัน middleware ตัวจริง)
```
"สวนพงษ์ภูวนาท -- แปลงที่ 1"          -> "สวนพงษ์ภูวนาท แปลงที่ 1"
"onsite=ตรวจแล้ว"                     -> "ตรวจแล้ว"          ← หายทั้งคำ
"ปุ๋ยสูตร 15-15-15 /* ใช้ตามฉลาก */"  -> "ปุ๋ยสูตร 15-15-15 "  ← หมายเหตุหายทั้งก้อน
```
ไม่มี error ไม่มีคำเตือน ผู้ใช้เห็นว่าบันทึกสำเร็จ

## ไฟล์
| ไฟล์ | คืออะไร |
|---|---|
| `REPORT.html` | รายงานฉบับเต็ม |
| `findings.json` | 89 ข้อ พร้อม verdict (sound / REJECTED / unverified) file:line และโค้ดแก้ |
| `endpoint-probe.json` | ผลยิง 22 endpoint จริง: status, เวลา, ขนาด, envelope, header |
