# Live proofs 2026-08-20 — specimen f866374a ได้ใบรับรอง + PDF cold-start fix พิสูจน์สด

การกดจริงทั้งหมดผ่าน Playwright บน stack จริง (next dev :3000 → backend :8000 dev-mode → Supabase)
ไม่มี API fallback ไม่มี seed/force script · คนกด: auditor seed `2222222222222` และ farmer walk-1 (reset รหัสโดยอนุมัติ operator)

## Part 1 — AUDIT_CONFIRMED → AUDIT_PASSED + mint (ใบค้าง walk-1)

| Artifact | พิสูจน์อะไร |
|---|---|
| `screenshots/01-auditor-job-sheet-AUDIT_CONFIRMED.png` | job sheet APP-2569-MSYUKZAQ-D69D9D ก่อนกด — ปุ่ม "ผ่าน (PASS)" ปรากฏที่สถานะ AUDIT_CONFIRMED |
| `screenshots/02-pass-decision-modal-filled.png` | modal ตัดสิน + บันทึกเหตุผลที่พิมพ์จริง |
| `screenshots/03-after-pass-confirm.png` | หน้าหลังกด "ยืนยัน PASS" — POST /audit-decisions → **200 OK** |
| `db-proof-audit-passed.txt` | DB จริงหลังกด: status **AUDIT_PASSED** (03:20:43Z) + certificates row **GACP-TH-2569-85B448** active (03:20:49Z) — evidence gate ผ่านด้วยหลักฐาน walk-1 (5 รูป + 24 ข้อ) และ strict areaUnit readers ผ่านเพราะ heal plot+farm |

## Part 2 — PDF cold-start fix (restart backend → กดดาวน์โหลดครั้งแรก)

| Artifact | พิสูจน์อะไร |
|---|---|
| `pdf-cold-start-timeline.txt` | บรรทัด log จริงทั้งสอง boot: boot1 accepting 03:09:46Z → warm-up complete 03:10:13Z (~27s) · **boot2 (restart เพื่อพิสูจน์)** accepting 03:27:09Z → warm-up complete 03:27:44.9Z (launch 35.8s ถูกจ่ายตอน boot ไม่ใช่ตอน request) · full log (`backend-boot*.log`) เก็บ local ใน dir นี้ — `*.log` ติด gitignore |
| `screenshots/05-cert-detail-before-restart-mobile.png` | หน้า cert ของ farmer (mobile 390×844) ก่อน restart — ปุ่มดาวน์โหลดพร้อม |
| `screenshots/06-first-download-after-restart-success.png` | กดครั้งแรกหลัง restart (03:27:53Z) — สำเร็จ ไม่มี error box |
| `GACP-TH-2569-85B448.pdf` | ไฟล์ที่ browser ดาวน์โหลดจริงจากการกดครั้งแรก (452KB, %PDF-1.4) — **GET /download → 200 OK ใน 3,684ms** (performance entry; เทียบ walk-2 ที่กดครั้งแรก = 503) |

## ปิดวง

| Artifact | พิสูจน์อะไร |
|---|---|
| `screenshots/04-farmer-certificates-list-mobile.png` | farmer เห็นใบในรายการของตัวเอง (mobile) |
| `screenshots/07-public-verify-valid.png` | portal สาธารณะ /verify/GACP-TH-2569-85B448: "ใบรับรองถูกต้องและยังมีผลบังคับใช้" |
| `screenshots/08-cert-detail-desktop-1920.png` | หน้า cert detail ที่ 1920×1080 — layout desktop 2 คอลัมน์ + nav เต็ม (ภาพ 04-06 ที่แคบ/ยาวคือ mobile viewport 390×844 + fullPage ตามกติกา view-in-the-loop ไม่ใช่แอปไม่รองรับ desktop) · QR บนหน้านี้เป็น QR จริง (client-side จาก verify URL) |
| `screenshots/09-public-verify-desktop-1920.png` | หน้า verify ที่ 1920×1080 — หมายเหตุ: กล่อง "สแกนเพื่อตรวจสอบ" บนหน้านี้เป็นไอคอนประดับ ไม่ใช่ QR จริง (FINDING — บันทึกใน BACKLOG-FOUND.md 2026-08-20) |

## ข้อจำกัด/ของที่ยังเปิดอยู่ (ตามจริง)

- badge "ยืนยันลายเซ็นดิจิทัลไม่ได้" บนหน้า verify = follow-up PKI เดิม (RSA_PRIVATE_KEY_PASSPHRASE ยัง sentinel → hash-only signing) ไม่ใช่ regression ใหม่
- เส้น retry ตอน "request ชน browser ที่กำลัง launch" ไม่ได้ถูกยิงสดรอบนี้ — warm-up เสร็จ 9 วิ ก่อนกด (เส้นนั้น cover โดย unit test certificate-download-cold-start-retry.test.js)
- แถว AuditChecklist ของ specimen มี completedItems=0/totalItems=0 ทั้งที่ item rows จริง = 24 — counter บนแถวแม่ไม่ sync (gate นับ rows จริง จึงไม่กระทบ) — บันทึกเป็นข้อสังเกต
- stack boot ด้วย NODE_ENV=development override (.env เป็น production + secret sentinel = refuse) · farmer walk-1 ถูก reset รหัส (คำอนุมัติ operator ใน session 2026-08-20) — account สังเคราะห์ @example.test
- cert mint ที่ AUDIT_PASSED = สภาพโค้ดปัจจุบัน (ruling D2 ต้องการย้ายไป CERTIFIED — ยังเปิดอยู่ ไม่ได้แก้ในรอบนี้)
