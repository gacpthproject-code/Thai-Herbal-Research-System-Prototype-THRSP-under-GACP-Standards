# ความเห็นที่สองจาก Jev (คำสั่ง 53, 72) — กิ่ง fix/inspection-photos-stored

รอบที่ 1: head 52042e2d8 เทียบฐาน a5d88227a (merge-base; origin/main ในเครื่องขยับไป 66c93bbef แล้ว จึงส่ง merge-base ให้สคริปต์ที่ diff แบบสองจุด) · 2026-10-13 22:43+0700 · ค่าใช้จ่าย USD 0.16 · ไม่มี HIGH/CRITICAL · MEDIUM 2 ข้อ

## คำตอบของ Jev (ตามตัวอักษร)

NO HIGH OR CRITICAL FINDINGS

### 1. MEDIUM — Local fallback uploads are subsequently signed against MinIO
- **Location:** `apps/backend/services/storage-service.js:263–293, 316–325, 482–491`
- **Defect:** `putUploadsObject` can save a photo locally after a MinIO write failure, but `createSignedObjectUrl` selects MinIO solely from configuration and credentials rather than the backend that actually holds the photo.
- **Failure scenario:** With MinIO configured and local fallback allowed, an assigned inspector uploads a photo during a temporary MinIO write failure. Lines 290–293 save it locally, and the application records the `/uploads/audits/...` URL. When a subsequent download is signed, lines 482–491 return a MinIO URL without checking whether the object exists there. The download fails because the photo exists only on disk, preventing staff from viewing successfully submitted inspection evidence.

### 2. MEDIUM — Failed photo submissions leave permanently untracked photo bytes
- **Location:** `apps/backend/services/audit-onsite-service.js:990–992, 1040–1057, 1085–1098`
- **Defect:** Photo bytes are persisted before the database writes, without cleanup if a subsequent write fails.
- **Failure scenario:** An assigned inspector submits a valid image and GPS coordinates but supplies `gps.capturedAt = "not-a-date"`. Line 992 constructs an invalid `Date`; lines 1040–1044 nevertheless persist the image under a newly generated object name. The later Prisma create at lines 1085–1098 rejects the invalid timestamp, and the request fails without deleting the stored image. Retrying creates another object, leaving inspection photographs retained outside the successfully recorded photo set and consuming storage on every failed attempt.
## ตรวจกับโค้ดแล้ว

1. MEDIUM ข้อ 1 (เขียนลงดิสก์เพราะ MinIO ล้ม แล้วลิงก์ชั่วคราวชี้ MinIO): จริงตามโค้ด แต่เป็นนโยบายเดิมที่ uploadBuffer และ createSignedObjectUrl ใช้มาก่อนกิ่งนี้ (storeBytes ย้ายนโยบายมาโดยไม่เปลี่ยน) เกิดได้เฉพาะเมื่อตั้ง STORAGE_PROVIDER=minio นอก production หรือเปิด STORAGE_ALLOW_LOCAL_FALLBACK=true ใน production · staging/demo ใช้ local (คำสั่ง 60(b)) และ production ค่าเริ่มต้นโยนข้อผิดพลาดแทนการเขียนลงดิสก์ (cloudStorageRequired) · ไม่มีหลักฐานรันจริงในโหมด MinIO ในงานนี้ จึงไม่แก้ในกิ่งนี้ บันทึกเป็นงานต่อ: ให้การออกลิงก์ดูว่าไบต์อยู่ที่ไหนจริง หรือตัด fallback ในโหมด dev

2. MEDIUM ข้อ 2 (บันทึกแถวไม่สำเร็จหลังเขียนไบต์แล้ว ไฟล์ค้าง): จริงตามโค้ด ทำซ้ำได้บนประตูจริงด้วย gps.capturedAt = "not-a-date" (Prisma ปฏิเสธ Date ที่ไม่ถูกต้อง) · แก้แล้วในกิ่งนี้: ถ้าบันทึกแถวไม่สำเร็จ ระบบลบไบต์ที่เขียนไป (deleteUploadsObject) และทำ tombstone แถว Attachment ที่สร้างไปแล้ว (detach) แล้วจึงโยนข้อผิดพลาดเดิม · เทสต์: integration บนประตูจริง (จำนวนไฟล์ในโฟลเดอร์และจำนวนแถว Attachment ที่ยังใช้ได้ไม่เปลี่ยน) + unit ของ service และ storage

## รอบที่ 2: head 6f5356f1d เทียบฐาน a5d88227a · 2026-10-13 22:51+0700 · USD 0.20

ไม่มี HIGH/CRITICAL · MEDIUM 1 ข้อ = ข้อ 1 ของรอบแรก (fallback ลงดิสก์ในโหมด MinIO แล้วลิงก์ชี้ MinIO) ซึ่งบันทึกเป็นงานต่อไว้แล้วข้างต้น · ข้อ 2 ของรอบแรกไม่ถูกยกขึ้นอีกหลังแก้

คำตอบตามตัวอักษร:

NO HIGH OR CRITICAL FINDINGS

### 1. MEDIUM — Local-fallback photos become unreadable after MinIO recovers
- **Location:** `apps/backend/services/storage-service.js:278–293, 316–325, 501–510`; `apps/backend/services/audit-onsite-service.js:1040–1055`
- **Defect:** The photo-upload path discards the actual storage backend, so a photo saved locally during an allowed MinIO fallback is subsequently given a signed MinIO URL pointing to a nonexistent object.
- **Failure scenario:** Configure MinIO with local fallback permitted (`STORAGE_ALLOW_LOCAL_FALLBACK=true`). An assigned inspector uploads a valid photo while MinIO rejects the write before storing the object. `storeBytes` saves the bytes locally, and `uploadPhoto` successfully records the attachment and photo using `/uploads/audits/...`. After MinIO recovers, `createSignedObjectUrl` chooses MinIO solely from configuration and credentials, without consulting where that photo was stored. Fetching the resulting signed URL returns 404: the inspection evidence is recorded successfully but cannot be retrieved through the signed-download mechanism.