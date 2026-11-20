# company-logo — โลโก้บริษัทตัวจริงลงกระดาษการค้า (2026-09-11)

Tier **C** (`tier-check.sh -` กับรายชื่อไฟล์ของ diff นี้ → `invoice.html` + `routes/api/finance/credit-notes.js`
ติดตาข่าย money) ⇒ **operator merge เท่านั้น** · pack นี้คือของที่เปิดดูแล้วเชื่อได้

## สิ่งที่เกิดขึ้นจริง

`18b94183` (2026-09-06) เดินสายช่องโลโก้บริษัทไว้ครบ แต่เขียนกำกับไว้เองว่ารูปจริงยังไม่มี จึง
**คัดลอกตรากระทรวงมาวางในชื่อ `company-logo.png`** เป็น placeholder ที่ไม่ทำให้อะไรพัง —
ตั้งแต่วันนั้นถึงเมื่อวาน ใบเสนอราคา/ใบวางบิล/ใบเสร็จ/ใบกำกับภาษี ที่ออกในนามบริษัท
**พิมพ์ตราของกระทรวงสาธารณสุข** อยู่ วันนี้ operator ส่งไฟล์จริงมา งานคือใส่ของจริงแทน

## ดูด้วยตา (view-pack)

| ภาพ | เห็นอะไร |
|---|---|
| `screenshots/01-quotation-header-company-logo.png` | หัวใบเสนอราคา เรนเดอร์จาก `templates/quotation.html` ตัวจริง ผ่าน `pdf-assets.getCompanyLogoDataUrl()` ตัวจริง |
| `screenshots/02-tax-invoice-header-company-logo.png` | หัวใบกำกับภาษีเต็มรูป |
| `screenshots/03-receipt-header-company-logo.png` | หัวใบเสร็จรับเงิน |
| `screenshots/04-before-after-at-real-box-sizes.png` | ของเก่า/ของใหม่ วางในกล่อง 56px และ 70px ที่ template ใช้จริง (ขยาย 4 เท่าให้เห็นขอบ) |
| `screenshots/05-quotation-full-page.png` | ใบเสนอราคาทั้งใบ |

ภาพทั้งหมดมาจาก `puppeteer` เรนเดอร์ไฟล์ template จริงในทรีนี้ + ฟอนต์ Sarabun ที่ฝังในเครื่อง
ตัวเลข/ชื่อลูกค้าในภาพเป็นข้อมูลตัวอย่าง (diff นี้ไม่แตะการคำนวณเงินแม้แต่บรรทัดเดียว)

## RED ก่อน GREEN

| ไฟล์ | ผล |
|---|---|
| `red-before-the-change.txt` | ด่านใหม่รันกับทรี**ก่อน**แก้ → **5 ตก 1 ผ่าน** พร้อม sha256 ที่แสดงว่า `company-logo.png` เท่ากับ `gacpthai-logo.png` เป๊ะ |
| `green-guard-and-pdf-assets.txt` | ด่านใหม่ + `pdf-assets` + `certificate-template-service` → **49 ผ่าน 0 ตก** |

ด่าน: `apps/backend/__tests__/unit/company-logo-is-not-the-ministry-seal.test.js`
มีอยู่เพราะ placeholder แบบนี้**ผ่านทุกอย่างที่ระบบมีอยู่**: ไฟล์มีจริง อ่านได้ เป็น PNG ถูกต้อง
`getCompanyLogoDataUrl()` คืน data URI ปกติ และ `pdf-assets.test.js` 74 ตัวเขียวหมด
สิ่งเดียวที่ผิดคือ *ภาพข้างในเป็นตราของอีกนิติบุคคลหนึ่ง* ซึ่งไม่มีเครื่องใดในทรีมองเห็น

## เทียบกับ baseline (มีงาน fee ค้างอยู่ในทรี 89 ไฟล์)

| ไฟล์ | ผล |
|---|---|
| `doc-surface-with-change.txt` | 128 suite ที่ชื่อเข้าเกณฑ์ pdf/invoice/quotation/receipt/certificate/template/document → **10 ตก · 23 เทสตก · 1,317 ผ่าน** |
| `doc-surface-baseline-without-change.txt` | ทรีเดียวกัน **ถอย diff นี้ออก** (คงงาน fee ไว้) → **10 ตก · 23 เทสตก · 1,317 ผ่าน** |
| `baseline-comparison.txt` | รายชื่อ suite ที่ตก **ตรงกันทุกบรรทัด** ⇒ ไม่มีข้อไหนเกิดจาก diff นี้ |

ทั้ง 10 suite ที่ตกพูดเรื่องเดียวกันหมด — `pre-W14 pair`, `state fee VAT-exempt`, `per-side figures`
คือการแยกรัฐ/แพลตฟอร์มที่**งาน fee ที่ยังไม่ commit กำลังรื้ออยู่** ไม่ใช่เรื่องโลโก้
คำว่า `GARUDA` / `ISSUER_LOGO_DATA_URL` / `company-logo` / `logoAlt` ไม่ปรากฏใน output ทั้งสองรอบเลย

การถอย/คืนทำแบบวัดได้: ไฟล์ทั้ง 19 ใบถูก checksum ก่อนถอย และยืนยัน byte-for-byte หลังคืน

## Gate

| ไฟล์ | ผล |
|---|---|
| `ratchet-after.txt` | **PASS** — hardcode=27 todo=55 env-direct=114 dup-source=0 (ไม่มีตัวไหนเกิน baseline) |
| `local-gate-with-change.txt` | **FAIL** — 13 PASS · 1 PENDING · **3 FAIL เดิม** |

สามตัวที่ตกระบุสาเหตุตัวเองไว้ในบรรทัดของมันเอง และไม่มีตัวไหนแตะไฟล์ใน diff นี้:
- `deploy-drift` — image ที่ deploy ตามหลัง main อยู่ 8 commit
- `gate-attestation` — attestation ล่าสุดคลุมถึง `726434ce` แล้วไล่ชื่อไฟล์ที่เปลี่ยนหลังจากนั้นออกมา
  11 ไฟล์ ทั้งหมดเป็นงาน fan-out/documents ของ commit ก่อนหน้า (`5ec4d92e`, `578b60d6`, `eb53622b`)
  — **ไม่มีไฟล์ของ diff นี้อยู่ในรายการ**
- `main-attestation-audit` — ตรวจย้อนหลัง 30 commit บน origin/main และบอกเองว่า
  *"This probe cannot and does not block a merge"*

สามตัวนี้คือชุดเดียวกับที่ `ddd88105` บันทึกไว้ว่า *"8 ผ่าน 3 ตก ไม่มีข้อไหนเกิดจาก diff นี้"*

`tsc --noEmit` ของ `apps/web-app` — exit 0

## ไฟล์ภาพที่ใส่เข้าไป

| ที่ | เดิม | ใหม่ |
|---|---|---|
| `apps/backend/services/pdf/templates/shared/company-logo.png` | ตรากระทรวง 1024×841 · 339 KB | โลโก้บริษัท **512×512 · 171 KB** |
| `apps/web-app/public/images/company-logo.png` | ตรากระทรวง 400×329 · 19.5 KB | โลโก้บริษัท **256×256 · 55 KB** |

ต้นฉบับที่ operator ส่งมา 1254×1254 · 794 KB · RGBA — เตรียมสามขั้น: ตัด alpha < 8 ทิ้ง
(44,743 พิกเซลที่จางกว่า 4% รวมจุดหลงนอกวง — เศษจากการไดคัท) → ครอปเข้าขอบจริงแล้วปาดเป็น
จัตุรัสพร้อมขอบหายใจ 2% → ย่อด้วย LANCZOS
ไฟล์ฝั่ง PDF ถูก base64 ฝังลงในเอกสารการค้า**ทุกใบที่เรนเดอร์** ⇒ ขนาดคือต้นทุนต่อใบ ไม่ใช่ต้นทุนครั้งเดียว
(794 KB → base64 1.06 MB ต่อใบ) เลือกไม่ quantize: 256 สีลงมาเหลือ 51 KB ก็จริง แต่วัดได้
PSNR 37 dB / คลาดสูงสุด 53 จาก 255 ⇒ ไล่สีแตกเป็นแถบบนเอกสารทางการ

## ชื่อที่แก้ไปด้วย เพราะการเปลี่ยนรูปทำให้มันผิดขึ้นมา

`{{GARUDA_DATA_URL}}` → `{{ISSUER_LOGO_DATA_URL}}` (ใบการค้า 6 ใบ + ตัวเรนเดอร์ 5 จุด)
และ → `{{MINISTRY_LOGO_DATA_URL}}` (ใบรับรอง ซึ่งใส่ตรากรมฯ จริง)

ชื่อ "ครุฑ" ผิดมาตั้งแต่ `e76f1f9e` ที่เปลี่ยนครุฑเป็นตรากรมฯ แต่ไม่เปลี่ยนชื่อ · พอ `18b94183`
ให้ใบการค้าใส่โลโก้บริษัท ชื่อก็ห่างจากของจริงไปอีกขั้น · `alt` ของรูปบน `quotation.html`
เขียนว่า `"ตรากระทรวงสาธารณสุข"` — ซึ่งวันนี้จะกลายเป็น screen reader อ่านชื่อกระทรวงทับโลโก้บริษัท
จึงแก้เป็น `"โลโก้ผู้ออกเอกสาร"` เท่ากับอีก 5 ใบ · ฝั่งเว็บ `DtamDocumentLayout` เดิมตรึง alt ไว้ตายตัว
แม้ caller จะสลับรูป จึงเพิ่ม prop `logoAlt` ให้เดินทางไปกับ `logoSrc`

## ที่พบระหว่างทาง — ยังไม่แตะ

- `apps/backend/services/pdf/templates/application-summary.html` ไม่มีตัวโหลดในทรีแล้ว
  (`application-template-service` ถูกลบ 2026-09-05) แต่ไฟล์ template ยังอยู่ — เปลี่ยนชื่อช่องให้
  แล้วเพื่อไม่ให้ `grep GARUDA` ชี้ไปที่ซาก แต่**ยังไม่ลบ** เพราะไม่ใช่ขอบเขตงานนี้
- หัวกระดาษยังเป็นเขียว `#006633` (CI ของแพลตฟอร์ม) อยู่ข้างโลโก้แดง-น้ำเงินของบริษัท
  ชนกันทางสายตา — **เป็นเรื่องดีไซน์ที่ operator ตัดสิน** ไม่ใช่ที่ agent เปลี่ยนเอง
