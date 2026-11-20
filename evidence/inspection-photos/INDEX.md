# `fix/inspection-photos-stored` — หลักฐาน

ฐาน `origin/main` a5d88227a · ขั้นตอน 08 (ตรวจแปลง) และ 10 (ออกใบรับรอง)

## สรุปสั้น

1. ภาพถ่ายหลักฐานที่ผู้ตรวจพื้นที่อัปโหลดหน้างานไม่เคยถูกเก็บ ประตู `POST /api/audit/onsite/:auditId/photo` รับไฟล์ไว้ในหน่วยความจำ
   บันทึกแถว `Attachment` พร้อม url `/uploads/audits/<auditId>/<เวลา>-<ชื่อไฟล์จากเครื่องผู้ใช้>` และแถว `FarmAuditPhoto` พร้อม hash
   แล้วทิ้งไบต์ไป เป็นแบบนี้ตั้งแต่ commit แรกของฟีเจอร์ (292266ee1, 2026-05-16) ไม่เคยมีการเขียนไฟล์บนเส้นทางนี้
2. ผลคือหน้าจอผู้ตรวจขอลิงก์ชั่วคราวได้ (200) แล้วเปิดลิงก์ได้ 404 แฟ้มตัดสินของผู้อนุมัติชี้ url เดียวกัน และภาพ 5 ภาพของใบรับรอง
   ที่ seed สร้างให้ (APP-68-002) ก็เปิดไม่ได้เช่นกัน ด่านหลักฐานก่อนออกใบนับจาก hash ในแถวเท่านั้น ไม่เคยถามหาไบต์ ใบรับรองจึงออกได้บนภาพที่ไม่มีใครดูได้
3. แก้: เขียนไบต์ผ่าน storage-service ลง `audits/<auditId>/<ชื่อที่เซิร์ฟเวอร์ตั้ง>` ก่อน แล้วค่อยบันทึกแถวด้วย url ที่ที่เก็บไฟล์คืนมา
   hash เดิม ผู้มีสิทธิ์เปิดเท่าเดิม (ACL ยังตัดสินจากแถว Attachment แบบเดิม) ชื่อไฟล์จากเครื่องผู้ใช้ไม่อยู่ใน url อีก และชื่อไทยบนแถวถอดรหัสถูกต้อง
4. ตามความเห็นที่สอง: ถ้าบันทึกแถวไม่สำเร็จหลังเขียนไบต์แล้ว ระบบลบไบต์และปิดแถว Attachment ที่สร้างไป ไม่เหลือไฟล์ที่ไม่มีแถวชี้ถึง

## ไฟล์ในชุดนี้

| ไฟล์ | พิสูจน์อะไร |
|---|---|
| `red-walk-main-a5d88227a.txt` | เดินประตูจริงบน main: เข้าสู่ระบบจริง → อัปโหลด 200 (url + hash ตรงไฟล์) → ขอลิงก์ 200 → เปิดลิงก์ 404 → ไฟล์บนดิสก์ 0 → แถวในฐานข้อมูลครบ |
| `seeded-photos-unreadable.txt` | ภาพของใบรับรองที่ seed สร้าง: ขอลิงก์ 200 เปิด 404 · หน้า 404 เป็นของ express เอง (ผ่านด่านลายเซ็นแล้ว แต่ไม่มีไฟล์) |
| `history.txt` | `git log -S`: url ปลอมมาตั้งแต่ 292266ee1 ไม่มี commit ใดเคยเขียนไฟล์บนเส้นทางนี้ |
| `jest-red.txt` | เทสต์ integration (real Postgres ประตูจริงสามบาน) ล้มบนโค้ด main ที่ข้อเดียวที่คาด: `Expected: 200 / Received: 404` ตอนเปิดลิงก์ |
| `jest-green.txt` | เทสต์เดียวกันผ่านหลังแก้ |
| `green-walk-fixed.txt` | เดินประตูจริงบนโค้ดที่แก้แล้ว: เปิดลิงก์ 200 ได้ `image/jpeg` 275,830 ไบต์ sha256 ตรงกับไฟล์ที่ส่ง · ไฟล์อยู่ที่ path ตาม url 1 ไฟล์ · url ใช้ชื่อของเซิร์ฟเวอร์ |
| `suites.txt` | ชุดเทสต์ที่เกี่ยวข้อง 25 ไฟล์ (unit/route/storage/certificate + integration บน real Postgres) หลังแก้: 547/552 ผ่าน ที่ล้ม 5 ข้อ = helper ที่ลืมใส่ 2 ข้อ (แก้แล้ว รันซ้ำผ่าน) + 3 ข้อด้านล่าง |
| `jev-review.md` | ความเห็นที่สอง (คำสั่ง 53): ไม่มี HIGH/CRITICAL · MEDIUM 2 ข้อ ตรวจกับโค้ดแล้วจริงทั้งคู่ ข้อ 2 แก้ในกิ่งนี้ (ลบไบต์และปิดแถวเมื่อบันทึกแถวไม่สำเร็จ) ข้อ 1 เป็นนโยบายเดิมของโหมด MinIO บันทึกเป็นงานต่อ · รอบที่ 2 บน head สุดท้าย |
| `suites-round2.txt` | ชุดเทสต์ที่แตะหลังแก้ตามความเห็นที่สอง: 161/161 ผ่าน (integration ประตูจริงรวมกรณีบันทึกแถวไม่สำเร็จ) |
| `green-walk-final.txt` | เดินประตูจริงบน head สุดท้ายอีกครั้ง (ภาพที่ 3): เปิดลิงก์ได้ไบต์เดิม |
| `integration-failures-vs-main.txt` | 3 ข้อที่ยังล้ม รันโค้ด main a5d88227a บนฐานข้อมูลเดียวกัน ล้มเหมือนกันทุกข้อ (2 ข้ออยู่ใน baseline 23 ชื่อ · 1 ข้อเป็นสคริปต์ซ่อมที่นับแถว APPROVED ของ seed ในฐานข้อมูลทดลองนี้) ความล้มเหลวใหม่จากกิ่งนี้ 0 |

## สิ่งที่พึ่งพาไบต์ (คำถามข้อ 2 ของ brief)

- `services/onsite-evidence-gate.js` นับภาพจาก `FarmAuditPhoto.fileHash` ที่ไม่ซ้ำกัน ไม่เคยเปิดไฟล์ → ก่อนแก้ ใบรับรองออกได้โดยไม่มีภาพให้ใครดู (แก้นี้ไม่เปลี่ยนด่าน แค่ทำให้ไบต์มีอยู่จริง)
- `services/certification-decision-file-service.js` ใส่ `fileUrl` ของแต่ละภาพให้ผู้อนุมัติกดดู → ก่อนแก้กดแล้ว 404
- หน้าจอผู้ตรวจ (`ChecklistItem.tsx` → `SignedImage`) แสดงภาพจาก url ที่ประตูอัปโหลดคืนมา → ก่อนแก้ 404 · หลังเปิดหน้าใหม่ ประตู context คืนเฉพาะ `photoIds` ไม่มี url จึงไม่แสดงภาพ (ช่องว่างเดิม ยังไม่แก้ในกิ่งนี้)
- เส้น CAR ไม่อ่านภาพตรวจแปลง

## สิ่งที่ไม่ได้ทำ

- ไม่มีไฟล์ใต้ `apps/web-app` เปลี่ยน (`git diff --stat origin/main -- apps/web-app` ว่าง) จึงไม่รัน web jest/tsc และไม่มีภาพหน้าจอ
- โหมด MinIO ไม่ได้รันจริง (staging/demo ใช้ `STORAGE_PROVIDER=local`): สัญญาของ key พิสูจน์ด้วย unit test ที่ stub client (`storage-service-no-silent-downgrade.test.js`)
- แถว Attachment เดิมบน staging/demo (รวมภาพที่ seed สร้าง) ยังชี้ไฟล์ที่ไม่มี การแก้นี้ไม่ย้อนหลังให้ เพราะไบต์ไม่เคยถูกเก็บ

## รอบ 2 (2026-10-21) — ปิดข้อ F1 F4 F5 F6 F7 F9 ของความเห็นที่สอง + merge main 744b63d0a

ไฟล์ใต้ `round2/`:

| ไฟล์ | พิสูจน์อะไร |
|---|---|
| `key-guard-red-green.txt` | F5: กุญแจ `audits/../slips/x.jpg` และ `audits/x/../../gacp-certificates/x.pdf` เขียนลงโฟลเดอร์ของผู้อื่นบนดิสก์จริงก่อนแก้ (4 กุญแจหลุด) → หลังแก้ถูกปฏิเสธทั้งหมดด้วย STORAGE_BAD_KEY |
| `mutant-M2-f4-red.txt` | F4: เทสต์ใหม่ล้มกับ mutant ที่กลืน error ของ storage แล้วบันทึกแถวต่อ ("resolved instead of rejected") ในสำเนา scratch · ผ่านบนโค้ดจริง |
| `f7-file-count-red.txt` / `f7-file-count-green.txt` | F7: เทสต์ seed ทิ้งไฟล์ 15 ไฟล์ต่อรอบใต้ public/uploads/audits (0→15, 15→30) → หลังใส่ stub 30→30 |
| `f1-repoint.txt` | F1: ผลสคริปต์ชี้ตัวชี้รหัสใหม่ (13 + 6 ตัว) และผล --validate |
| `real-postgres-red-green.txt` | F9 บนประตูจริง (real Postgres): โฟลเดอร์อ่านอย่างเดียว ตอบ code EACCES ก่อนแก้ → STORAGE_UPLOAD_FAILED + ประโยคไทยหลังแก้ · ชุดเทสต์ที่แตะบน head สุดท้าย |

## รอบ 3 (2026-10-21) — ความล้มเหลวใหม่ 2 ข้อของ gate 462025c7d + N1 N2 N3 + merge main f8c7149c1

ไฟล์ใต้ `round3/`:

| ไฟล์ | พิสูจน์อะไร |
|---|---|
| `item1-timer-path-red-green.txt` | เทสต์ §7 ล้มบน 462025c7d (storage-service.js:334/577/593 อยู่บนเส้นทางตั้งเวลา ผ่าน correction-deadline-sweep → … → onsite-evidence-gate → audit-onsite-service) → ผ่านหลังย้ายแบบตรวจไปโมดูลข้อมูล และ storage-service/audit-onsite-service/attachment-service ไม่อยู่บนเส้นทางนั้นแล้ว |
| `item2-quotation-solo.txt` | quotation-states-both-instalments รันเดี่ยวบน real Postgres ผ่าน 18/18 ทั้งกิ่งและ main cea595670 · ที่ล้มใน gate คือ PDF timeout 30 s ใต้โหลดของ suite-green และขั้น integration-pg ของ gate เดียวกันผ่าน |
| `n1-red-green.txt` | เทสต์ใหม่: ใน transaction ไม่ detach (แดง: called 1) → เขียว 48/48 · real Postgres ไม่มี log "photo cleanup failed" |
| `integration-photos.txt` | integration ภาพ/ด่าน/ผู้อนุมัติ 6 ไฟล์บน real Postgres: 37/39 ที่ล้ม 2 ข้อเป็น onsite-decision-mint-e2e ซึ่งล้มแบบเดียวกันบน baseline main |
| `item4-mc-mb-scratch-minio.txt` | คำสั่งใน checklist (ส่วน exec ใน container) บน MinIO scratch: สร้าง bucket ชื่อที่ไม่ใช่ค่าเริ่มต้นได้ รันซ้ำได้ ไม่ต้องมี alias local |
| `error-codes-repoint.txt` | ตัวชี้ error-codes ที่เลื่อนจากการย้ายแบบตรวจ (13 ตัว) และผล --validate |
