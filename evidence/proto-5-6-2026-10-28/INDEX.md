# ต้นแบบที่ 5 และ 6 ให้พร้อมสาธิต (2026-10-28) · สาขา feat/proto-5-6-finish

ทุกการรันผ่าน `~/work/state/heavy.sh` · Postgres ชั่วคราว `proto56-pg` (127.0.0.1:5434) · backend ของ worktree ฟัง 127.0.0.1:18444 · Next dev :3000 · ไม่มีค่าลับใน argv หรือในไฟล์นี้

| เรื่อง | ไฟล์ | ผล |
|---|---|---|
| ตัวจำแนกกฎสีเดิมบนภาพจริง | `p6-baseline-rule-v2.json` + `p6-baseline-rule-v2-eval.js` | 3/418 (0.7%) ตอบยอดเหี่ยว 386 ภาพ |
| ลองครั้งแรก softmax | `p6-eval-softmax-v1.json` | 327/418 (78.2%) |
| รุ่นที่ส่ง disease-trees-v1 | `p6-eval-disease-trees-v1.json` (คำทายทุกภาพ) | 374/418 (89.5%) · พืชที่ไม่เคยเห็น 315/1,200 (26.3%) |
| เทสต์ใหม่บนโค้ดก่อนแก้ | `red-on-origin-main.txt` | backend ล้ม 25/34 บน ac977e18e |
| coverage จาก API จริง | `api-herbs-coverage.json` | 6 ชนิด 97 รายการ มีแหล่งทั้ง 97 |
| เดินจอ | `walk-output.txt` + `screenshots/` (18 ภาพ 1440x900 และ 390x844) + `scripts/` | exit 0 ไม่มี 4xx/5xx จาก /api |

## รอบ 2 (order 154 · รีวิว b28ad346d → CHANGES)

| เรื่อง | ไฟล์ | ผล |
|---|---|---|
| RED ของเทสต์ใหม่บน b28ad346d | `red-round2.txt` | backend 6 ล้ม (I1 2, M2 3, M3 1) · web 1 ล้ม (M5) · M6 จับการสลับฟีเจอร์ได้ขณะ disease-classifier.test.js ยังผ่าน |
| เดินจอซ้ำหลังแก้ | `walk-output-round2.txt` + `screenshots/` (18 ภาพ ถ่ายใหม่ทั้งชุด) + `scripts/shots.js` | exit 0 · KRATOM หมวดกฎหมายมีป้ายแหล่งข่าว 4 รายการ · ผู้ตรวจพื้นที่เห็นปุ่มเขียน 0 ปุ่มบน /provider/herbs/TURMERIC · การ์ดรุ่นไม่มี "ขึ้นไป" และบอกว่ายังไม่ได้วัดบนสมุนไพร 6 ชนิด |
| coverage หลัง seed ใหม่ | `api-herbs-coverage.json` | 6 ชนิด 97 รายการ มีแหล่งทั้ง 97 (เนื้อหา LEGAL 10 รายการมีป้ายแหล่งข่าว) |
| ชุดเทสต์ที่ sha สุดท้าย | `round2-suites.txt` | ดูไฟล์ |

M4 (กลุ่ม AUDIT_STAFF กว้างกว่าคำบนจอ) ไม่แก้ในรอบนี้: มีอยู่ก่อนสาขา เครื่องมือ stateless ไม่อ่านข้อมูลใคร จึงไม่มีการรั่ว รอตัดสินตอนทำ L10 ตามที่รีวิวเสนอ
