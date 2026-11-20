# Integration regressions หลัง merge main f8daa816 (2026-10-05)

เทียบ gate log ของ f4e014f7 กับ baseline 5b9af636 พบ suite ใหม่ที่ล้ม 2 ตัว ทั้งสองตัวเป็นข้อ (a) ไม่ใช่ข้อบกพร่องของโค้ด R2

## renewal-preview-real-postgres (404 แทน 200)
สาเหตุ: เทสของ main สร้างคำขอด้วย healthId อย่างเดียว ไม่มี entityId (ผู้ถือ) ส่วน R2 ถอด filer fallback แล้ว
(holder-access.js: แถวที่ไม่มีผู้ถืออ่านไม่ได้ฝั่ง health) 404 ถูกต้องตามกฎ R2
แก้: เทสสร้าง Entity + EntityMembership OWNER ACTIVE และใส่ entityId ที่คำขอ (โค้ดไม่แตะ)
ผลหลังแก้: 2/2 ผ่านบน Postgres จริง

## health-door-walk (15 แถวต่าง) 
ผลบันทึกใหม่ด้วย HEALTH_DOOR_WALK_RECORD แล้ว diff รายแถว ไม่มีแถวใดเป็น 500 ใหม่ และ stranger S ไม่เปลี่ยน
(เทส "S ไม่ได้รับ id" และ "S ถูกปฏิเสธ" ผ่าน)

ป้าย C เพิ่ม 13 แถว: ตัวตอบมี entityId ของผู้ถือ C ในแถวของ C เอง
- A/B/V /api/farms, /api/farms/my, /api/farms/my/eligible-for-planting (A, B, V อย่างละ 3 ประตู รวม 9 แถว)
- A/B/V /api/certificates/my (3 แถว)
- A /api/applications/draft (1 แถว)
ที่มา: commit 95fc5143 (R2 Task 15, ก่อน merge) ตั้งใจให้ /draft, /certificates/my, /farms/my ส่ง entityId
ให้เว็บใช้ ผู้รับทุกคนเป็นสมาชิก ACTIVE ของ C และแถวเป็นของ C เอง ไม่ใช่ข้อมูลนอกผู้ถือ
fixture บันทึกไว้ที่ Task 12 ก่อน Task 15 จึงยังไม่มีป้ายนี้ (ไม่ใช่ผลจาก merge main)

500 เป็น 200 สองแถว: B และ V /api/lots/:id/qr/print
ที่มา: main 959d6722 แก้ 500 ของประตูนี้ (publicTraceUrlFor) fixture เดิมบันทึก 500 ของทั้ง A/B/V ก่อน merge
หลังแก้ A = 200 อยู่แล้ว B/V อยู่ในผู้ถือเดียวกับฟาร์มของล็อตและอ่านผ่านด่านอ่านเดียวกับ A (getUserFarmIds ตามผู้ถือ)
ผู้ถือคนอื่น (S) ยังได้ 404
ข้อสังเกตให้ operator: ด่านอ่านนี้ไม่ตรวจ PRINT_QR ต่อบทบาท (VIEWER พิมพ์ป้ายล็อตได้) เป็นพฤติกรรมเดิมของด่านอ่านล็อต
ไม่ใช่ของที่ R2 เปลี่ยน QR ของล็อตชี้ไปหน้า public trace อยู่แล้ว ไม่ได้แก้ในรอบนี้

## รันทั้งโฟลเดอร์ integration (scratch Postgres, migrate deploy แล้ว)
108 ผ่าน / 10 ล้ม / 1 ข้าม (119 suite) · 887 ผ่าน / 32 ล้ม
9 ล้มตรงกับ baseline ทั้ง 9 ชื่อ · ตัวที่ 10 onsite-evidence-unfreeze ล้มเพราะแถวชนิดพืช "cannabis" หายจาก DB ที่ใช้ซ้ำข้ามทั้งโฟลเดอร์
(ลำดับ suite ใน DB เดียว) และผ่าน 6/6 เมื่อรันเดี่ยว ไม่เกี่ยวกับ R2
