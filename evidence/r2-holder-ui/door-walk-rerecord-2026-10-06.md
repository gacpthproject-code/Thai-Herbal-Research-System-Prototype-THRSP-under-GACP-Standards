# health-door-walk: re-record หลัง fix/r2-holder-ui (2026-10-06)

gate ของ 4985b4ce พบ suite ใหม่ที่ล้ม 1 ตัว คือ health-door-walk-real-postgres (9 แถวต่าง) ทั้ง 9 แถวมาจาก D1/D2 โดยตรง

วิธีทำ: scratch Postgres 17 (migrate deploy) รันบน tree ของ branch นี้ (รวม allowlist ของ /me แล้ว)
บันทึกด้วย HEALTH_DOOR_WALK_RECORD แล้ว diff รายแถวกับ fixture เดิม 492 แถวเท่ากันทั้งสองฝั่ง ต่างกัน 9 แถว
ไม่มีแถวใดเป็น 500 ไม่มีแถวของ stranger S เปลี่ยน (เทส "S ไม่ได้รับ id ของ C หรือ A" และ "S ถูกปฏิเสธ" ผ่าน)
allowlist ของ login และ /me ไม่ทำให้แถวไหนขยับ (walk ไม่ได้ติดป้ายค่าที่ถูกตัดออก)

| แถว | เดิม | ใหม่ | เหตุผล |
|---|---|---|---|
| A /api/applications | D D2 X Y | C D D2 PA X Y | D1: แถวส่ง entityId ของผู้ถือ (C ของ X/D/D2, PA ของ Y ซึ่งเป็นผู้ถือส่วนตัวของ A เอง) |
| A /api/applications/my | D D2 X Y | C D D2 PA X Y | D1: เหมือนแถวบน (mapper เดียวกัน) |
| A /api/applications/:id | X | C X | D2: payload รายละเอียดส่ง entityId ของ X (C ซึ่ง A เป็น OWNER) |
| B /api/applications | D D2 X | C D D2 X | D1: entityId C ของแถว C เอง B เป็น MANAGER ของ C |
| B /api/applications/my | D D2 X | C D D2 X | D1: เหมือนแถวบน |
| B /api/applications/:id | X | C X | D2: entityId ของ X |
| V /api/applications | D D2 X | C D D2 X | D1: entityId C V เป็น VIEWER ของ C |
| V /api/applications/my | D D2 X | C D D2 X | D1: เหมือนแถวบน |
| V /api/applications/:id | X | C X | D2: entityId ของ X |

ป้ายใหม่ทุกตัวเป็น id ของผู้ถือที่ผู้เรียกเป็นสมาชิก ACTIVE และอยู่ในแถวของผู้ถือนั้นเอง ไม่ใช่ข้อมูลนอกขอบเขต
ผลหลัง re-record: health-door-walk 10/10 และชุด R2 อีก 5 suite ผ่านรวม 158/158 บน Postgres จริง
