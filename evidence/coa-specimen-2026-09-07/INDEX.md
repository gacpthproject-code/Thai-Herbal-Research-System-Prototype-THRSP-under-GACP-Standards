# COA ตัวอย่าง → PDF → ไฟล์แนบบนหน้าสแกนสาธารณะ — 2026-09-07

มติ operator: "ตัว COA ที่เราออกแบบไว้แล้ว ให้ทำการแปลเป็นไฟล์ PDF แล้วดาวน์โหลดมาใช้เป็นไฟล์แนบ
ตอนให้บุคคลทั่วไปเห็นเมื่อสแกนดูข้อมูลฟาร์ม"

## ของที่ทำ
| ไฟล์ | คืออะไร |
|---|---|
| `services/pdf/templates/coa-specimen.html` | แผ่น COA พร้อมพิมพ์ A4 แปลจาก `docs/design/artifacts/2026-09-05-coa-anatomy.html` |
| `services/pdf/coa-specimen-template-service.js` | เรนเดอร์เป็น PDF ด้วย puppeteer ตัวเดิมของ repo + การ์ดที่ปฏิเสธโฮสต์ที่ไม่รู้จัก |
| `scripts/attach-specimen-coa.js` | แนบไฟล์เข้ารุ่นเก็บเกี่ยว ผ่าน `buildLabResultRow` ตัวเดียวกับประตูอัปโหลดจริง |

## หลักฐานที่กดจริง (scratch stack: backend :8099 + frontend :3099 + postgres :55450)
| ไฟล์ | พิสูจน์อะไร |
|---|---|
| `01-coa-sheet.png` | แผ่น COA ที่เรนเดอร์ออกมา — ลายน้ำ "ไม่ใช่รายงานผลการวิเคราะห์จริง" อยู่ครบ |
| `coa-specimen-sample.pdf` | ไฟล์ PDF จริง 135,369 bytes เปิดได้ |
| `02-public-scan-batch.png` | หน้าสแกนรุ่นเก็บเกี่ยว — การ์ด "ผลวิเคราะห์ (COA)" มีลิงก์เปิดไฟล์ |
| `03-public-scan-lot.png` | หน้าสแกนล็อต (ประตูที่ QR บนถุงพาไป) — ไฟล์เดียวกัน |

ผลกดจริง:
- `GET /api/trace/batch/<id>` (ไม่ต้องล็อกอิน) → `labTest.batch.latest.fileUrl = /uploads/lab-results/TR-SPECIMEN-69000001.pdf`
- `GET /api/trace/lot/<id>` (ไม่ต้องล็อกอิน) → ไฟล์เดียวกัน (ล็อตสืบทอด COA จากรุ่น)
- `GET /uploads/lab-results/TR-SPECIMEN-69000001.pdf` ไม่ล็อกอิน → `HTTP 200 · application/pdf · 135320 bytes`
- เบราว์เซอร์จริงทั้งสองหน้า: `<a href>` ชี้ไฟล์นั้นจริง (ไม่ใช่แค่มีใน JSON)

## เส้นที่ไม่ข้าม
แพลตฟอร์มไม่ใช่ห้องปฏิบัติการ เอกสารนี้จึงบอกตัวเองว่าเป็นตัวอย่างสามชั้น: ลายน้ำในเทมเพลต ·
ชื่อผู้ออกมีคำว่า (ตัวอย่าง) · เลขที่รายงานขึ้นต้น `TR-SPECIMEN-` · และตัวสร้างปฏิเสธที่จะทำงาน
บนโฮสต์ที่ไม่ใช่ demo/staging/local (รวมถึง `gacpth.com` เปล่า ๆ) เว้นแต่ตั้ง `ALLOW_SPECIMEN_COA=true`

เทส: `__tests__/unit/coa-specimen-is-never-mistakable-for-a-real-report.test.js` 11 ผ่าน ·
mutation: ปิดการ์ด → 3 แดง ใส่คืน → เขียว

## บนเดโมจริง (deploy 2026-09-07, main 5c2c9162)
| ไฟล์ | พิสูจน์อะไร |
|---|---|
| `04-demo-public-scan-live.png` | https://demo.gacpth.com/trace/batch/5c508e31-… — การ์ด COA พร้อมลิงก์ใช้งานได้ |

- `/api/health` → `revision 5c2c9162`, `builtAt 2026-09-06T19:46:42Z`, db connected
- `GET /api/trace/batch/5c508e31-…` (ไม่ล็อกอิน) → `tested:true`, ไฟล์ + ชื่อผู้ออก "(ตัวอย่าง)"
- `GET https://demo.gacpth.com/uploads/lab-results/TR-SPECIMEN-69000019.pdf` → `200 · application/pdf · 103839 bytes`
- เบราว์เซอร์จริง: `<a href="/uploads/lab-results/TR-SPECIMEN-69000019.pdf">` อยู่บนหน้า
- หมายเหตุ: หน้าเดโมหลัง recreate มี cold start ~30 วิ ครั้งแรก ("กำลังตรวจสอบข้อมูล…") — ครั้งแรกที่กดหลัง deploy ต้องรอ

## ชื่อฟาร์ม — จาก "Certified Farm" กลับมาเป็นชื่อจริง (2026-09-07)
operator เห็นจากหน้าสแกนว่าฟาร์มถูกเรียกว่า "Certified Farm" ซึ่งไม่ใช่ชื่อของใครเลย

| ไฟล์ | พิสูจน์อะไร |
|---|---|
| `05-coa-matches-the-real-farm.png` | COA ของ BATCH-2569-000001 พิมพ์ "สวนสมชาย · หนองหาร สันทราย เชียงใหม่ · GACP-TH-2569-8189D1" — ทุกช่องอ่านจากฐานข้อมูลของฟาร์มนั้น ไม่มีค่าคงที่ |
| `06-scan-shows-the-thai-farm-name.png` | หน้าสแกนสาธารณะแสดงชื่อไทย และไม่มีคำว่า Certified Farm เหลืออยู่ |

สามชั้นที่ทำ:
1. create ปฏิเสธเมื่อคำขอไม่ระบุชื่อ — `CERTIFICATE_FARM_NAME_MISSING` 422 (ข้อความไทย)
2. reuse ถือว่าชื่อค่าตายตัวเก่าคือ "ยังไม่มีชื่อ" แล้วเติมชื่อจากคำขอให้เอง (ซ่อมตัวเองรอบถัดไป)
3. `scripts/repair-platform-named-farms.js` จ่ายหนี้แถวที่ออกใบไปแล้ว — dry-run ก่อน แล้ว `--apply`
   บน scratch: ซ่อม 2 แถว ข้าม 0 · ชื่อบนใบรับรองที่เซ็นไปแล้วไม่ถูกแก้ (ต้องออกฉบับแก้ไข)
