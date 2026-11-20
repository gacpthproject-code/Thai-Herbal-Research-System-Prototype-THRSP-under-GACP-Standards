# F-A8c-08 ต่ออายุแล้วรอบปลูกค้างกับใบเดิม · หลักฐาน

สาขา `fix/renewal-keeps-farm` จาก origin/main 9bd6053ea · ชั้นงาน B (`scripts/probes/tier-check.sh`)

## ต้นเหตุ

1. คำขอต่ออายุไม่มี `farmId` ประตูยื่นจึงสร้างฟาร์มใหม่
   (`apps/backend/services/application-service/application-farm-materialization.js:167` บน 9bd6053ea, `farm.create` ที่ :187)
2. ออกใบต่ออายุ: ตัวหาฟาร์มอ่าน `formData.farmId` จึงชี้ฟาร์มใหม่
   (`apps/backend/services/certificate-service.js:799` บน 9bd6053ea)
3. `moveOpenCycles` กรอง `farmId: successor.farmId` จึงไม่ย้ายรอบใดเลย
   (`apps/backend/services/certificate/renewal-supersede.js:57` บน 9bd6053ea)

## ภาพ (มือถือ 390×844, Postgres ชั่วคราว, ประตูร่างและยื่นจริงผ่าน HTTP)

| ไฟล์ | สิ่งที่ควรเห็น |
|---|---|
| `screenshots/before-cycle-page.png` | โค้ด 9bd6053ea: ป้าย "ยังไม่ผูกใบรับรองที่ใช้งานได้" ปุ่มเก็บเกี่ยวกดไม่ได้ (ตรงกับที่ walk เจอบน staging) |
| `screenshots/before-record.json` | ใบเดิม 167/2569 กับใบใหม่ 168/2569 ชี้ฟาร์มต่างกัน ผู้ถือมี 2 ฟาร์ม รอบปลูกยังอยู่กับใบเดิม |
| `screenshots/after-cycle-page.png` | โค้ดที่แก้: ไม่มีป้ายเตือน ปุ่ม "เก็บเกี่ยว/สร้างลอต" กดได้ |
| `screenshots/after-record.json` | ใบ 170/2569 และ 171/2569 ชี้ฟาร์มเดียวกัน ผู้ถือมี 1 ฟาร์ม รอบปลูกอยู่กับใบใหม่ |

ขั้นของเจ้าหน้าที่ระหว่างยื่นถึงออกใบ (ชำระเงิน นัดตรวจ ตรวจพื้นที่) บันทึกด้วย service ของ tree เดียวกันใน `walk/walk.js` แบบเดียวกับชุดทดสอบ ไม่ได้เดินผ่านหน้าเจ้าหน้าที่

## Log

| ไฟล์ | ผล |
|---|---|
| `logs/red-c1d9f6f17.log` | ก่อนแก้ 5 ล้ม 2 ผ่าน: farmId ใหม่, ใบใหม่ชี้ฟาร์มใหม่, เก็บเกี่ยว 400 HARVEST_CERTIFICATE_RENEWED |
| `logs/mutations-96999f75b.log` | ถอดการแก้ทีละจุด: ประตูยื่น 3 ล้ม · ออกใบ 1 ล้ม · ไม่ตรวจผู้ถือ 1 ล้ม |
| `logs/affected-96999f75b.log` | 119 ชุดที่แตะโมดูลที่แก้: 116 ผ่าน 2 ล้ม (5 เทสต์) |
| `logs/baseline-9bd6053ea-two-suites.log` | สองชุดที่ล้มก็ล้มบน 9bd6053ea ด้วยเทสต์เดียวกันทั้ง 5 จึงไม่ใช่ความล้มเหลวใหม่ |
| `logs/heal-cli-scratch.log` | สคริปต์ heal ปฏิเสธเมื่อไม่มี DATABASE_URL และโหมดแผนไม่เขียนอะไร |
| `logs/red-heal-8c3246996.log` | เทสต์ heal ชุดใหม่บนสคริปต์เดิม: 11 ล้ม (แผนไม่มีแปลง ไม่ข้ามใบใหม่ที่ไม่มีผล/คนละผู้ถือ/แปลงใช้ร่วม) |
| `logs/green-heal.log` | หลังแก้ heal: 20/20 ผ่าน |
| `logs/mutations-heal-cef2ae7b9.log` | ถอดทีละจุด 9 จุด ล้มทุกจุด: MH1 heal ไม่ re-check certificateId · MH2 heal ย้ายแค่ certificateId (พฤติกรรมเดิม: รอบหายจากรายการ) · MH3 ไม่ดูสถานะใบใหม่ · MH4 ไม่ดูผู้ถือ · MH5 ไม่ดูแปลงใช้ร่วม · MH6 ไม่ย้ายล็อต · MS1 moveOpenCycles ไม่ re-check · MS2 ใส่ตัวกรอง farmId กลับ · MD1 ประตูยื่นไม่ส่ง holderScope |
| `logs/green-heal-final.log` | 7 ชุด (รวม error-codes-source-pointers และ error-codes-catalog) 159/159 ผ่าน |
| `logs/green-final.log` | 5 ชุด (ชุดใหม่, renewal-supersede ทั้ง unit และ Postgres จริง, submit-materialises, scripts-never-write-hashed) 132/132 ผ่าน |

## heal กับกลุ่มฟาร์มที่สอง (รอบแก้ตามรีวิว I1)

ใบต่ออายุที่ออกก่อนแก้ชี้ฟาร์มที่สอง และ Certificate.farmId อยู่ใน hash ที่ลงนามจึงแก้ไม่ได้
สคริปต์จึงย้ายรอบปลูกที่เปิดอยู่ไปใบใหม่ **และ** ฟาร์มของใบใหม่ พร้อมแปลงที่รอบนั้นใช้ และล็อตเก็บเกี่ยวที่รอบนั้นเคยออก
ในทรานแซกชันเดียวต่อคู่ ข้ามคู่ (พร้อมเหตุผล) เมื่อใบใหม่ไม่มีผล ผู้ถือไม่ตรง หรือแปลงถูกรอบที่เปิดอยู่อื่นใช้ร่วม
รอบที่ปิดแล้วอยู่กับใบเดิมและฟาร์มเดิมเป็นประวัติ ค่าเริ่มต้นดูอย่างเดียว `--apply` เป็นของ operator
