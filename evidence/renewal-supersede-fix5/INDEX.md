# หลักฐานรอบแก้ 5: fix/renewal-supersede

บรีฟ: `~/work/state/reviews/brief-renewal-supersede-fix5.md` · ผลตรวจที่ตอบ: `renewal-supersede-review-1e6939d3c.md` · คำสั่ง 129(5)

## เทสต์แดงแล้วเขียว (Postgres จริง ผ่าน heavy.sh)
- ชุด `apps/backend/__tests__/integration/renewal-supersede-real-postgres.test.js`
- RED ที่ e4fea85e5 (โค้ดเท่า 1e6939d3c): 31 ล้ม 50 ผ่าน · ข้อที่ล้มคือข้อใหม่ทั้งหมด ยกเว้นตัวควบคุมสองชนิด (บันทึกหลังเก็บ 30 วันยังรับ · หน้าสาธารณะไม่มีเครื่องหมาย) ที่ผ่านทั้งก่อนและหลัง
- GREEN: 81 ผ่าน 0 ล้ม
- สรุปผลแต่ละข้อใน `runs/summary.txt`

## ภาพจอเจ้าหน้าที่ (เปิดดูแล้ว)
- `screens/provider-tracking-backdated-390x844.png`, `screens/provider-tracking-backdated-1440x900.png`: จอติดตามการปลูกของผู้ตรวจเอกสาร
- `screens/admin-planting-backdated-390x844.png`, `screens/admin-planting-backdated-1440x900.png`: แท็บสรุปของจอการปลูกของผู้ดูแลระบบกรมฯ
- ทั้งสี่ภาพมีส่วน "รุ่นเก็บเกี่ยวที่บันทึกย้อนหลัง" หนึ่งรุ่น (รุ่นที่บันทึกหลังรอบย้ายไปใบต่ออายุ วันเก็บอยู่ในช่วงใบเดิม) พร้อมป้าย "บันทึกย้อนหลัง" วันเก็บเกี่ยว และเลขใบเดิม · รุ่นที่บันทึกก่อนย้ายและรุ่นที่ผูกใบใหม่ไม่ขึ้น · scrollWidth เท่าความกว้างจอ
- ชุดเครื่องมือ: `harness/run-visual.sh` (Postgres ชั่วคราว + backend จาก tree + next dev + Chromium แล้วปิดทั้งหมด) · token ของเจ้าหน้าที่เขียนไว้นอก repo และลบเมื่อจบ

## ถอยกลับ migration `20261022090000_harvest_batch_backdated_certificate`
```
ALTER TABLE "harvest_batches" DROP CONSTRAINT "harvest_batches_backdatedCertificateId_fkey";
DROP INDEX "harvest_batches_backdatedCertificateId_idx";
ALTER TABLE "harvest_batches" DROP COLUMN "backdatedCertificateId";
```
เพิ่มคอลัมน์ที่ว่างได้อย่างเดียว ไม่แตะแถวเดิม · migrate deploy ผ่านบน Postgres ชั่วคราวทุกการรัน
