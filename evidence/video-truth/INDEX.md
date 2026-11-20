# fix/video-truth: FAQ สาธารณะบอกประเภทผู้ถือครบ 4

ทุกการรันผ่าน `~/work/state/heavy.sh` บน worktree ของสาขา (ไม่แตะ main checkout, staging, demo) · ไฟล์ jest ทุกไฟล์เป็น log ดิบทั้งก้อน ปิดท้ายด้วย exit code ของ jest เอง

| ไฟล์ | อะไร |
|---|---|
| `jest-red-on-base-copy.txt` | เทสต์ของต้นไม้นี้ รันบนข้อความหน้าแรกและศูนย์ช่วยเหลือของ base e4da286fe (สคริปต์เขียนสองไฟล์นั้นทับชั่วคราวแล้วคืนค่า ไม่ใช้ stash): 2 ล้ม 1 ผ่าน ไม่มี "ห้างหุ้นส่วน" ทั้งสองหน้า · jest exit 1 |
| `jest-green.txt` | ต้นไม้นี้: 3 ผ่าน · jest exit 0 |
| `faq-desktop-1440x900.png` · `faq-mobile-390x844.png` | ส่วน FAQ ทั้งก้อน (element) ทุกข้อเปิดอยู่ |
| `faq-first-answer-desktop-1440x900.png` · `faq-first-answer-mobile-390x844.png` | viewport ที่เลื่อนการ์ด "ใครยื่นคำขอได้บ้าง" มากลางจอ (หน้าใช้ scroll-behavior: smooth จึงต้องเลื่อนแบบ instant ก่อนถ่าย) |
| `landing-full-*.png` | หน้าแรกทั้งหน้า |
| `shots.txt` | ข้อความคำตอบข้อแรกที่สคริปต์อ่านจาก DOM และตำแหน่งการ์ด |
| `faq-shots.mjs` · `run-red-green-and-shots.sh` | รันซ้ำได้: `~/work/state/heavy.sh bash evidence/video-truth/run-red-green-and-shots.sh <port>` · web app ของสาขาบน 127.0.0.1:<port> ไม่มี backend ในสแตก (INTERNAL_API_URL ชี้ port ที่ปิด) ข้ออายุใบรับรองจึงแสดงข้อความ unavailable ของหน้าเอง · log ของ next dev เขียนลง /tmp ไม่อยู่ในชุดนี้ |

ข้อความใบเสร็จ (`RECEIPT_TH`) ไม่เปลี่ยนบนสาขานี้: "ในนามบริษัท" คือผู้ออกเอกสารตาม `docs/legal/payment-terms-th-v1.3.md` §4 และเป็นจริงสำหรับผู้ชำระทุกประเภท
