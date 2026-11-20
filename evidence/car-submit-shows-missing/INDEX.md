# F-A8c-06 · ส่งหลักฐาน CAR ไม่ได้เพราะทะเบียนผู้ถือไม่ครบ และหน้าไม่บอกว่าขาดอะไร

สาขา `fix/car-submit-shows-missing` จาก main 9bd6053ea · Tier B (`scripts/probes/tier-check.sh`)

## ต้นเหตุ
ประตู `POST /api/applications/:id/car` เรียก `judgeFiling` ซึ่งเรียก `validateFilingCompleteness` ด่านนี้ข้ามข้อ ๒-๓ ที่ประตู CAR อยู่แล้ว (`refilesTheForm=false`, c8bc354af) แต่การตรวจทะเบียนผู้ถือ (กทล.1 ส่วนที่ ๑) ไม่ได้ตามธงเดียวกัน คำขอที่ยื่นก่อนมีทะเบียนผู้ถือจึงได้ 422 `APPLICATION_INCOMPLETE` 8 ช่อง หน้า CAR อ่านแค่ `meta.messageTh` จึงแสดงประโยคทั่วไป

## ตัดสินใจ
- (b) ทะเบียนผู้ถือเป็นส่วนหนึ่งของแบบฟอร์มที่ผ่านการตรวจเอกสารแล้ว หลักฐาน CAR เป็นการแก้ไขหน้างาน ไม่ใช่ยื่นแบบฟอร์มใหม่ ประตู CAR จึงไม่ถาม ประตูยื่นครั้งแรกและส่งกลับหลังแก้เอกสารยังถามครบ
- (a) หน้า CAR แสดงทุกช่องที่ 422 ระบุเป็นรายการ พร้อมปุ่ม "แก้ไขข้อมูลในคำขอ" ไป `/health/applications/:id/edit` เหมือนหน้าแก้เอกสาร เพราะประตู CAR ยังถามขั้น 2 และ 5 ของแบบฟอร์ม

## หลักฐาน
| ไฟล์ | อะไร |
|---|---|
| `red.log` | เทสต์ใหม่สองชุดล้มบนต้นไม้ที่ยังไม่แก้ (cc1796654) |
| `green.log`, `affected-suites.log` | หลังแก้ 8d0c131f0: backend 16 ชุด 198 ผ่าน (รวม real-Postgres 3 ชุด) · web 8 ชุด 54 ผ่าน · tsc และ eslint ผ่าน |
| `walk/before-run.log`, `screenshots/before-02-after-send.png` | 9bd6053ea: ส่งได้ 422 holder 8 ช่อง จอขึ้น "กรุณากรอกข้อมูลให้ครบถ้วนก่อนส่งคำขอ" |
| `walk/after-run.log`, `screenshots/after-02-after-send.png` | 8d0c131f0 ผู้ถือเดิมไม่ครบ: ส่งได้ 200 · DB `CAR_REVIEWING carDocuments=1 staged=0` |
| `walk/after-missing-run.log`, `screenshots/after-missing-02-after-send.png` | 8d0c131f0 ขาดลักษณะพื้นที่ปลูก: 422 จอแสดงชื่อช่องพร้อมปุ่มไปแก้ · ไฟล์ยังอยู่ (`staged=1`) |

walk ทุกขาเดินผ่านประตูจริงในเบราว์เซอร์ (next dev + backend จากต้นไม้นี้) บน Postgres ทิ้งได้ `carmissing-db` ไม่แตะ staging หรือ demo · รันซ้ำ: `LABEL=after evidence/car-submit-shows-missing/walk/run.sh` ใต้ `~/work/state/heavy.sh`
