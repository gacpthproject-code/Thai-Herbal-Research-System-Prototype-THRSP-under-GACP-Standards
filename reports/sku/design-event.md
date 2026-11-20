# SKU Fee Catalogue — แบบ "หนึ่ง SKU ต่อหนึ่งเหตุการณ์เรียกเก็บเงิน" (event-level)

วันที่: 2026-08-23 · ผู้ออกแบบ: agent (lane: event-level SKU design)
Baseline ที่อ่านจริง: **bf50c143** (`git rev-parse HEAD` รันในเซสชันนี้)
> หมายเหตุ baseline: โจทย์ระบุ main 6248a0d1 แต่ working tree อยู่ที่ bf50c143 — ทุก file:line
> ในเอกสารนี้อ้างจาก bf50c143 ที่เปิดอ่านจริง ถ้าจะ merge บน 6248a0d1 ต้องยืนยันเลขบรรทัดใหม่

สถานะ: **PENDING** — เอกสารออกแบบ ยังไม่มี diff, ยังไม่มีการรันเทส
ขอบเขตตาม L3: อ่านอย่างเดียว ไม่แก้ไฟล์ใดใน `apps/backend/modules/billing/`,
`apps/backend/config/business-rules.js` หรือ payment path ใด ๆ · diff ทุกใบในเอกสารนี้คือ **ข้อเสนอ**
ที่ต้องผ่าน Tier C + operator merge

---

## 0. หลักฐานที่รันจริงในเซสชันนี้ (ตัวเลขทั้งเอกสารกระทบยอดกับผลรันนี้)

```
$ cd apps/backend && node -e "require('./modules/billing/internal/fee-service.js') ..."
scope 1 | P1 state 5000  plat 500  svc 5500  vat 385  total 5885
                 | P2 state 25000 plat 2500 svc 27500 vat 1925 total 29425
                 | REN state 30000 plat 3000 svc 33000 vat 2310 total 35310
scope 2 | P1 total 11770 | P2 total 58850 | REN total 70620
scope 3 | P1 total 17655 | P2 total 88275 | REN total 105930
```

ตรงกับตัวเลขที่ operator ยืนยัน (5,885 / 29,425 / 35,310 ต่อ scope และ 35,310 / 70,620 / 105,930
สำหรับต่ออายุ 1/2/3 scope) ทุกตัว **สมการเดียวที่ผลิตตัวเลขเหล่านี้** อยู่ที่
`apps/backend/modules/billing/internal/fee-service.js:143-147`:

```
stateAmount      = ratePerScope × scopeCount
platformAmount   = round(stateAmount × 0.10)
serviceFeeAmount = stateAmount + platformAmount      ← ค่าบริการ = ฐาน VAT
vatAmount        = round(serviceFeeAmount × 0.07)    ← VAT บนค่าบริการทั้งก้อน
phaseTotal       = serviceFeeAmount + vatAmount      ← ยอดชำระ
```

อัตราอยู่ที่ `apps/backend/config/business-rules.js:46` (PHASE1_PER_SCOPE 5000), `:48`
(PHASE2_PER_SCOPE 25000), `:83` (RENEWAL_PER_SCOPE 30000), `:85` (PLATFORM_RATE 0.10),
`:94` (VAT_RATE 0.07)

**ไม่มีปัญหาการปัดเศษ** — โค้ดยืนยันเองที่ `fee-service.js:136-142`: state เป็นพหุคูณของ 5,000
ทำให้ platform และ VAT ลงตัวเป็นจำนวนเต็มทุก scope (5,500 × 0.07 = 385 พอดี) และเพราะเหตุนี้
งวด 1 + งวด 2 = ต่ออายุ พอดีเป๊ะ (385n + 1,925n = 2,310n)

---

## 1. ตอบคำถาม operator ตรง ๆ ก่อน

คำถาม: *"SKU001 = ยื่นใหม่ งวด 1 , SKU002 = ยื่นใหม่งวด 2 , SKU003 = ต่อสัญญา ใช่หรือเปล่า"*

**โครงถูก — สามเหตุการณ์นั้นมีจริงในโค้ด และเป็นสามเหตุการณ์เดียวที่เรียกเก็บเงินจากคำขอ**
แก้สามจุด:

1. **ไม่ใช่ "ต่อสัญญา" แต่เป็น "ต่ออายุใบรับรอง"** และในโค้ดมันไม่ได้เดินเส้นทางเดิม —
   `renewal-service.js:232` `RENEWAL_ENTRY_STATE = 'PENDING_AUDIT_FEE'` คือการโดดข้าม
   การตรวจเอกสารทั้งขั้นไปที่ประตูจ่ายเงินตรวจพื้นที่เลย
2. **ทุก SKU เป็นราคา "ต่อรูปแบบการปลูก" ไม่ใช่ตั๋วใบเดียว** — `fee-service.js:143`
   คูณ scopeCount ไว้ข้างใน SKU หนึ่งบรรทัดจึงต้องมีคอลัมน์ "จำนวน" เสมอ
   (นี่ยังบังเอิญเป็นตัวปิดช่อง ม.86/4(5) "ปริมาณ" ที่ตอนนี้พิมพ์ 1 ตายตัว —
   `invoice-template-service.js:353-360`)
3. **เลขทึบ SKU001 ไม่ควรใช้** — เหตุผลเต็มใน §3 สรุปสั้น: การที่ operator เองต้อง
   "เดา" ว่า SKU003 คืออะไร คือหลักฐานว่าเลขทึบอ่านไม่ออก

---

## 2. SKU LIST เต็ม

**หน่วยนับ (unit) มีค่าเดียวสำหรับ SKU ที่ใช้งานจริงทั้งสามตัว: `PER_SCOPE` (ต่อรูปแบบการปลูก)**
ไม่มี SKU ใดเป็น per-certificate เพราะ operator แก้ไว้ชัดแล้ว (บันทึกไว้ในโค้ดที่
`business-rules.js:59-64`: "ฟาร์ม 1 รูปแบบ 30000 / 2 รูปแบบ 60000 / 3 รูปแบบ 90000 … ไม่ว่าใหม่
หรือต่อ ต้องคิดเงินแยกรูปแบบการปลูก")

### 2.1 ตาราง SKU (ราคาต่อ 1 scope)

| SKU code | ชื่อไทย (พิมพ์บนเอกสาร) | English name | หน่วย | ค่าธรรมเนียมรัฐ | ค่าแพลตฟอร์ม 10% | ค่าบริการ (ฐาน VAT) | VAT 7% | **ยอดชำระ/scope** | สถานะ |
|---|---|---|---|---|---|---|---|---|---|
| `GACP-NEW-P1` | ค่าบริการรับรองมาตรฐาน GACP งวดที่ 1 (ตรวจสอบเอกสาร) | GACP certification service — instalment 1 (document review) | ต่อรูปแบบการปลูก | 5,000 | 500 | 5,500 | 385 | **5,885** | ACTIVE |
| `GACP-NEW-P2` | ค่าบริการรับรองมาตรฐาน GACP งวดที่ 2 (ตรวจประเมินพื้นที่) | GACP certification service — instalment 2 (field audit) | ต่อรูปแบบการปลูก | 25,000 | 2,500 | 27,500 | 1,925 | **29,425** | ACTIVE |
| `GACP-RENEW` | ค่าบริการต่ออายุใบรับรองมาตรฐาน GACP (ชำระครั้งเดียว) | GACP certificate renewal — single charge | ต่อรูปแบบการปลูก | 30,000 | 3,000 | 33,000 | 2,310 | **35,310** | ACTIVE |
| `GACP-EXPEDITE` | ค่าบริการเร่งด่วน | Expedited processing | **ยังไม่กำหนด** | **ยังไม่กำหนด** | — | — | — | **ระบุไม่ได้** | **DRAFT — ห้ามออกเอกสาร** |

### 2.2 ยอดรวมตามจำนวน scope (กระทบยอดกับผลรันใน §0)

| SKU | 1 scope | 2 scopes | 3 scopes |
|---|---|---|---|
| `GACP-NEW-P1` | 5,885 | 11,770 | 17,655 |
| `GACP-NEW-P2` | 29,425 | 58,850 | 88,275 |
| ยื่นใหม่ รวมสองงวด | 35,310 | 70,620 | 105,930 |
| `GACP-RENEW` | 35,310 | 70,620 | 105,930 |

> ที่ยื่นใหม่กับต่ออายุได้ยอดรวมเท่ากันไม่ใช่บั๊ก — `business-rules.js:71-77` อธิบายไว้เอง:
> ฐานต่ออายุ 30,000 = 5,000 + 25,000 ต่างกันที่ **ตารางการชำระ** ไม่ใช่จำนวนเงิน

### 2.3 Trigger ของแต่ละ SKU (state machine ยิงตรงไหน)

| SKU | Trigger ที่โค้ดยิงจริง | file:line |
|---|---|---|
| `GACP-NEW-P1` | `POST /api/payments/checkout {milestone:'M1'}` จากสถานะ DRAFT / SUBMITTED / PENDING_DOC_FEE · หรือรางสลิป `ensurePhaseInvoices('PHASE_1')` | route `apps/backend/routes/api/finance/payments.js:399-429`; สถานะที่จ่ายได้ `apps/backend/services/checkout/stripe-checkout-service.js:41`; คำนวณ `fee-service.js:209-216` |
| `GACP-NEW-P2` | `POST /api/payments/checkout {milestone:'M2'}` จาก DOC_APPROVED / PENDING_AUDIT_FEE · และ auto-mint ตอน transition เข้า DOC_APPROVED | `apps/backend/routes/api/provider/handlers/workflow-side-effects.js:164-176`; คำนวณ `fee-service.js:218-225` |
| `GACP-RENEW` | `POST /api/applications/renewals` สร้าง Application ที่ `PENDING_AUDIT_FEE` พร้อม `formData.renewalOf` · quotation-service แตกกิ่งที่ marker นี้ | `apps/backend/services/renewal-service.js:232`; route `apps/backend/routes/api/applications/renewals.js:72`; แตกกิ่ง `apps/backend/services/quotation-service.js:262-264`, `:278`; คำนวณ `fee-service.js:250-258` |
| `GACP-EXPEDITE` | **ไม่มี trigger ในโค้ด** | ดู §2.4 |

### 2.4 `GACP-EXPEDITE` — ทำไมอยู่ในแคตตาล็อกแต่ห้ามออกเอกสาร

ต้องพูดตรง ๆ: **ค่าเร่งด่วนไม่มีคนเก็บเงิน และในโค้ดมีสองราคาที่ขัดกันเอง**

- `apps/backend/config/payment-fees.js:37` — `URGENT_PROCESSING_FEE: 3000`
- `apps/backend/routes/api/finance/pricing.js:210` — `expediteFee: 10000` ซึ่งถูก **เสิร์ฟออก
  public API จริง** (`GET /api/pricing`, `GET /api/pricing/fees`) และคอมเมนต์ในไฟล์เดียวกันที่
  `:208-209` ยอมรับเองว่า "Still NOT SSoT-backed: expedite has no canonical fee-table entry"
- frontend มิเรอร์ที่ `apps/web-app/src/constants/fees.ts:35` `GACP_EXPEDITE_FEE = 10_000`
  แล้วส่งต่อผ่าน `apps/web-app/src/hooks/use-pricing.ts:40,102`
- grep ทั้ง `apps/backend` + `apps/web-app` หา `URGENT_PROCESSING_FEE|expediteFee|GACP_EXPEDITE_FEE`
  (รันในเซสชันนี้) ได้ผลเพียง 4 บรรทัดข้างต้น + assertion หนึ่งตัวใน
  `__tests__/unit/renewal-fee-ssot.test.js:209` — **ศูนย์จุดที่สร้าง invoice / checkout order /
  payment transaction**

นี่คือรูปแบบเดียวกับ BT11/BT13 เป๊ะ ๆ คือ "ราคาติดบนชั้นวางโดยไม่มีเครื่องคิดเงินอยู่หลังชั้น"
ต่างกันตรงที่อันนี้ **ประกาศออก public endpoint** ซึ่งแย่กว่าค่าคงที่ตายเงียบ ๆ

ข้อเสนอ (operator ตัดสิน 1 ใน 2 ทาง):
- **(ก) สร้างเครื่องเก็บเงินก่อน** แล้วค่อยเปิด SKU: ต้องตัดสินหน่วยนับ (ต่อคำขอ หรือ ต่อ scope),
  ราคาเดียว (3,000 หรือ 10,000), ตำแหน่งใน state machine, และมันขึ้น VAT เหมือน SKU อื่นหรือไม่
- **(ข) ลบทิ้งทั้งคู่แบบ BT11/BT13** — ลบ `payment-fees.js:37`, `pricing.js:210`,
  `fees.ts:35`, `use-pricing.ts:102` และ assertion ในเทส

จนกว่าจะตัดสิน SKU นี้อยู่สถานะ `DRAFT` และ **catalogue guard ต้อง reject การออกเอกสารที่อ้าง
`GACP-EXPEDITE`** (ดู §5.3)

### 2.5 สิ่งที่มีคนเก็บเงินจริงแต่ **อยู่นอก** แคตตาล็อกนี้ (ต้องบอก ไม่ใช่เงียบ)

แคตตาล็อกนี้ครอบเฉพาะเหตุการณ์เรียกเก็บเงินบน state machine ของ "คำขอ" ยังมีอีกสองตระกูลเงินที่
ทำงานอยู่จริงและ sketch ของ operator ไม่ได้ครอบ:

| ตระกูล | จำนวน | หลักฐาน | เหตุที่กันออก |
|---|---|---|---|
| Subscription PREMIUM รายเดือน / รายปี | 990 / 9,900 บาท **แบน ไม่ต่อ scope และเขียน `vat: 0`** | `apps/backend/services/subscription/subscription-order-service.js:67-68`, invoice mint `:161-175` (`vat: 0`) | คนละ product family: ไม่ผูกคำขอ ไม่คูณ scope · **จองรหัส `SUB-PREMIUM-M` / `SUB-PREMIUM-Y` ไว้** เพื่อไม่ให้ใครไปตั้งชื่อชนกัน |
| Debit note (เพิ่มหนี้หลังออกใบกำกับ) | **operator พิมพ์จำนวนเงินเอง** | `apps/backend/services/debit-note-service.js:243` (subtotal/vat เป็นพารามิเตอร์), `:188-201` (ตรวจแค่ไม่ติดลบ) | ไม่มีสูตร จึงไม่มีราคาที่จะใส่ใน SKU ได้ · ใช้ `reasonCode` เดิม |

**คำถามที่ต้องให้ operator ตัดสิน (ไม่ใช่ finding):** subscription 990 บาทออกใบแจ้งหนี้ด้วย
`vat: 0` ขณะที่ค่าบริการคำขอทุกตัวคิด VAT 7% — ภายใต้ตรรกะ W14 (บริษัทเดียวขายทั้งก้อน) มันดูไม่เข้ากัน
แต่ไม่มีคำวินิจฉัยเรื่อง subscription ในโค้ดหรือใน log จึงยกธง ไม่ตัดสินเอง

### 2.6 ค่าธรรมเนียมที่ **ไม่มีในโค้ด** — ห้ามใส่ใน price list

grep ทั้ง repo (รันในเซสชันนี้ + lane enumeration) ยืนยันว่า **ไม่มี** สูตรค่าปรับล่าช้า
ค่าตรวจซ้ำ หรือค่าแก้ไข อยู่ที่ใดเลย · `LATE_FEE` มีอยู่แค่เป็น label ของ debit note
(`debit-note-service.js:67-71`) โดยไม่มีอัตรา ไม่มี grace period ไม่มีการนับวัน ·
การจัดการคำขอค้างจ่ายเป็น **non-monetary**: ปิดคำขอ ไม่ใช่คิดเพิ่ม
(`business-rules.js:296` `PAYMENT_ABANDONMENT_CLOSE_CALENDAR_DAYS: 30`)

`RE_SUBMISSION_FEE 5000` (`payment-fees.js:36` และซ้ำอีกที่ `business-rules.js:258-260`) เป็น
ค่าคงที่ตายที่ไม่มีผู้อ่าน — **ไม่ออก SKU ให้**

---

## 3. NUMBERING — เลือก speaking code ไม่ใช่ SKU001

### 3.1 รูปแบบที่เลือก

```
GACP-<EVENT>[-<SEQ>]
       │        └─ งวดที่ ใช้เฉพาะเหตุการณ์ที่แบ่งงวด (P1, P2)
       └─ NEW | RENEW | EXPEDITE
```

ข้อบังคับของรูปแบบ: `^[A-Z][A-Z0-9-]{2,31}$` · ตัวพิมพ์ใหญ่ทั้งหมด · ห้ามมีตัวเลขที่สื่อ "ลำดับที่
เท่าไหร่ในแคตตาล็อก" · ห้ามฝังราคา ปี หรือ scope ไว้ในรหัส

### 3.2 เหตุผล 5 ข้อ ว่าทำไมไม่ใช่ SKU001/002/003

1. **operator เองต้องเดา** — คำถามตั้งต้นจบด้วย "อันนี้ผมแค่เดา" นั่นคือหลักฐานเชิงประจักษ์
   ว่าเลขทึบต้องพึ่งตารางแปลถึงจะอ่านออก เสมียนที่ถือใบเสร็จอยู่ในมือไม่มีตารางนั้น
2. **ของเดิมในระบบพูดได้อยู่แล้ว** — ค่าที่อยู่ใน `invoice_line_items.code` จริงวันนี้คือ
   `DTAM_FEE`, `PLATFORM_FEE`, `PLATFORM_VAT` (`stripe-checkout-service.js:189,199,209`) และ
   `PHASE_2_STATE` / `PHASE_2_PLATFORM` (สร้างด้วย template literal ที่
   `application-phase-invoice-methods.js:109`) การใส่ตัวเลขทึบเข้าไปคือการถอยหลัง
3. **รหัสห้ามชนกับ "เลขที่เอกสาร"** — ม.86/4(4) บังคับให้ใบกำกับภาษีมีเลขลำดับของตัวเอง
   ถ้า SKU เป็นตัวเลขล้วน โอกาสที่คนอ่าน (หรือคนเขียนโค้ด) จะสับสนระหว่าง "SKU003" กับ
   "เลขที่ใบกำกับ 003" สูงเกินจำเป็น ตัวอักษรตัดปัญหานี้ทิ้งด้วยรูปทรง
4. **รหัสตามลำดับตัวเลขบังคับให้มี "ทะเบียนกลาง"** ที่ต้องมีคนออกเลขถัดไป — เพิ่ม SKU ใหม่
   ต้องไปถามว่าเลขล่าสุดคืออะไร รหัสพูดได้เพิ่มได้เองโดยไม่ต้องประสาน
5. **diff อ่านง่ายกว่า** — `code: 'GACP-RENEW'` ใน PR ตรวจได้ด้วยตา `code: 'SKU003'` ต้องเปิด
   ตารางอีกใบ ซึ่งเป็นภาระที่กฎ "หลักฐาน > คำอธิบาย" ไม่ควรสร้างเพิ่ม

### 3.3 ขีดจำกัดที่ยอมรับ (ไม่กลบ)

รหัสพูดได้ยาวกว่า และ **ไม่เรียงลำดับตามธรรมชาติ** ถ้าวันหนึ่งต้องเรียงรายงานตาม "ลำดับสินค้า"
ต้องใช้คอลัมน์ `sortOrder` แยก ไม่ใช่เรียงตามรหัส · ออกแบบไว้ใน §5.1 แล้ว

### 3.4 ข้อจำกัดทางกฎหมายที่รหัสต้องเคารพ (3 ข้อ)

จาก ป.รัษฎากร ม.86/4 และ ป.86/2542:

1. **SKU ไม่ใช่ของบังคับตามกฎหมาย** — ไม่มีมาตราใดสั่งให้มีรหัสสินค้า ดังนั้นมันเป็นเครื่องมือ
   ควบคุมภายในล้วน ๆ ออกแบบให้คนของเราอ่านได้เป็นหลัก
2. **SKU ห้ามแทนที่คำบรรยายภาษาไทย** — ม.86/4(5) บังคับ ชื่อ ชนิด ประเภท ปริมาณ และมูลค่า
   ต้องปรากฏบนหน้าเอกสาร รหัสเป็นได้แค่คอลัมน์เสริม
3. **SKU ห้ามใช้เป็นเลขที่เอกสาร** — ม.86/4(4) เลขลำดับใบกำกับเป็นคนละ field ที่ต้อง
   เรียงลำดับเข้มงวด ผู้จัดสรรที่ถูกต้องมีอยู่แล้วคือ `receipt_sequences`
   (`apps/backend/prisma/schema/billing.prisma:658-682`)

---

## 4. SKU ปรากฏบนเอกสารอย่างไร

### 4.1 กติกากลาง: หนึ่ง SKU = หนึ่งบรรทัด

```
จำนวน (qty)      = scopeCount                              ← เลิกพิมพ์ 1 ตายตัว
ราคา/หน่วย       = ค่าบริการต่อ scope (state + platform)   ← 5,500 / 27,500 / 33,000
จำนวนเงิน        = qty × ราคา/หน่วย = ค่าบริการทั้งก้อน     ← เท่ากับ Invoice.subtotal
VAT 7%           = อยู่ในบล็อกยอดรวม ไม่ใช่บรรทัดสินค้า
ยอดชำระ          = จำนวนเงิน + VAT
```

**ทำไมราคา/หน่วยเป็น "ค่าบริการ" ไม่ใช่ "ค่าธรรมเนียมรัฐ":** เพราะ W14 บอกว่าบริษัทเดียวขาย
ค่าบริการทั้งก้อน ฐาน VAT คือค่าบริการ (`fee-service.js:145-146`) การพิมพ์ 5,000 เป็นราคา/หน่วย
แล้วเก็บ VAT บน 5,500 คือเอกสารที่กระทบยอดกับตัวเองไม่ได้

**หารลงตัวเสมอ** — state หารด้วย scope ลงตัวโดยนิยาม (คูณเข้ามา) และ platform = 10% ของ state
จึงลงตัวตาม ไม่มีเศษให้ต้องมีกฎดูดเศษ (ยืนยันด้วยผลรัน §0: 2 scope → 11,000/2 = 5,500 พอดี)

### 4.2 หน้าตาแต่ละเอกสาร (ตัวอย่าง: ต่ออายุ 3 รูปแบบการปลูก = 105,930)

**ใบเสนอราคา** (`apps/backend/services/pdf/templates/quotation.html:110-115` — 6 คอลัมน์:
ลำดับที่ | รายการ | จำนวน | หน่วย | ราคา/หน่วย | จำนวนเงิน)

```
1 | ค่าบริการต่ออายุใบรับรองมาตรฐาน GACP (ชำระครั้งเดียว)   |  3 | รูปแบบการปลูก | 33,000.00 |  99,000.00
    [GACP-RENEW]
    รายละเอียด: พืชที่ขอรับรอง … · ระบบปลูก OUTDOOR, GREENHOUSE, INDOOR
    ค่าธรรมเนียมรัฐ 30,000 + ค่าแพลตฟอร์ม 10% 3,000 ต่อรูปแบบ
                                              ค่าบริการ    99,000.00
                                              ภาษีมูลค่าเพิ่ม 7%   6,930.00
                                              จำนวนเงินทั้งสิ้น  105,930.00
```

หมายเหตุ 2 ข้อที่ต้องแก้พร้อมกัน:
- วันนี้ quotation PDF พิมพ์ **หนึ่งบรรทัดต่อหนึ่งรูปแบบการปลูก** โดย qty = `1` ตายตัวและ
  หน่วย = `'คำขอ'` (`invoice-template-service.js:1028-1034`) → เปลี่ยนเป็นบรรทัดเดียว
  qty = scopeCount หน่วย = 'รูปแบบการปลูก'
- บล็อกยอดรวมแบบ W14 (ราคาเต็ม / ค่าแพลตฟอร์ม 10% / ค่าบริการ / VAT / ยอดรวม) **เขียนไว้แล้ว**
  ที่ `invoice-template-service.js:190-227` แต่ `quotation.html` ไม่มี `{{TOTALS_ROWS_HTML}}`
  เลยแม้แต่ที่เดียว → โค้ดนั้นเป็น dead code ต้องเสียบ placeholder เข้าไป

**ใบวางบิล/ใบแจ้งหนี้** (`invoice.html:496-500` — 5 คอลัมน์: # | รายการ | จำนวน | ราคา/หน่วย | มูลค่า)

```
1 | ค่าบริการต่ออายุใบรับรองมาตรฐาน GACP (ชำระครั้งเดียว)   |  3 | 33,000.00 |  99,000.00
    [GACP-RENEW] · คำขอเลขที่ GACP-2569-xxxx
                                   ค่าบริการ / Service fee        99,000.00
                                   ภาษีมูลค่าเพิ่ม 7% / VAT        6,930.00
                                   ยอดที่ต้องชำระทั้งสิ้น         105,930.00
```

บล็อกยอดรวมของใบวางบิล/ใบเสร็จ **ถูกต้องตาม W14 อยู่แล้ว** — `invoice-template-service.js:155-182`
พิมพ์ 3 แถวและไม่แตกกิ่งตาม issuer อีกแล้ว ไม่ต้องแก้

**ใบเสร็จรับเงิน** (`receipt.html:268-272` — คอลัมน์เดียวกับใบวางบิล) — บรรทัดสินค้าเหมือนกันทุกช่อง
เปลี่ยนแค่ป้ายยอดรวมเป็น "ยอดที่รับชำระทั้งสิ้น" ซึ่ง `:159-161` ทำให้แล้ว

### 4.3 การเปลี่ยนแปลงจริงในตัว renderer (เล็กมาก — นี่คือจุดขายของ angle นี้)

`buildItemsRows()` ที่ `invoice-template-service.js:336-360` **คำนวณ `perScope` ไว้อยู่แล้ว**
ที่บรรทัด `:341-344` แต่เอาไปโยนใส่บล็อกข้อความอิสระ แทนที่จะใส่คอลัมน์ qty/unitPrice

```diff
- <td class="r">1</td>
- <td class="r">${formatCurrency(amts.subtotal)}</td>
- <td class="r">${formatCurrency(amts.subtotal)}</td>
+ <td class="r">${scopeCount || 1}</td>
+ <td class="r">${formatCurrency(perScope ?? amts.subtotal)}</td>
+ <td class="r">${formatCurrency(amts.subtotal)}</td>
```

สามบรรทัด · ปิดช่อง ม.86/4(5) "ปริมาณ" · ยอดรวมไม่ขยับแม้แต่สตางค์เดียว (qty × unitPrice =
subtotal ตามนิยาม) · **แต่แตะ money path จึงเป็น Tier C — เสนอเท่านั้น**

ส่วนคำบรรยาย: `serviceTypeLabel()` (`:261-277`) เปลี่ยนจาก map แบบ hardcode ไปอ่าน
`skuCode → catalogue.nameTH` โดย fallback เดิม `'ค่าธรรมเนียม GACP'` (`:276`) ยังอยู่

> **บั๊กที่การเปลี่ยนนี้เปิดโปง:** ใบวางบิลของรางเช็คเอาต์ที่ใช้งานอยู่วันนี้พิมพ์แค่
> `'ค่าธรรมเนียม GACP'` เพราะ `serviceType` ที่ checkout เขียนคือ
> `CERTIFICATION_CHECKOUT_M1|M2` (`stripe-checkout-service.js:171`) ซึ่งไม่มีอยู่ใน map เลย
> → ตกลง fallback ทุกใบ เกษตรกรจึงไม่เห็นคำว่า "งวดที่ 1" หรือ "ต่ออายุ" บนใบวางบิลจริง

### 4.4 บรรทัดที่ต้อง**ถอนออก** พร้อมกัน (ปัญหาทางภาษี ไม่ใช่ความสวยงาม)

`stripe-checkout-service.js:189-215` เขียน line item 3 แถวต่อใบ โดย
- แถว 1 `'ค่าธรรมเนียมกรมการแพทย์แผนไทยฯ (ยกเว้นภาษีมูลค่าเพิ่ม ม.77/1(10))'` `isTaxable:false`
- แถว 3 `'ภาษีมูลค่าเพิ่ม 7% (ของค่าบริการแพลตฟอร์ม)'`

ทั้งสองข้อความบรรยายสูตรที่ถูกยกเลิกไปแล้ว จำนวนเงินที่เขียนลงแถว 3 คือ `phase.vatAmount` ซึ่ง
`fee-service.js:146` คำนวณจากค่าบริการ**ทั้งก้อน** — เอกสารจึงระบุฐานภาษีผิดจากที่คิดจริง
`fee-service.js:176-178` เขียนคอมเมนต์เตือนเรื่องนี้ไว้เองว่า ถ้อยคำเก่า "would now be a false
statement on a tax document" แต่ writer ฝั่ง checkout ไม่ได้ถูกแก้ตาม

**ข่าวดี:** วันนี้ PDF **ไม่ได้อ่าน** line item ทั้งสามแถวเลย (`buildItemsRows` ไม่แตะ
`invoice.lineItems`) ข้อความเท็จจึงยังไม่ถูกพิมพ์ออกไป **แต่มันอยู่ในฐานข้อมูล 14 แถวต่อข้อความ**
และการออกแบบ SKU ที่ทำให้ PDF เริ่มอ่าน line item จะทำให้มันโผล่ทันที → §5.2 จึงกำหนดว่า
การ backfill ต้องเขียนคำบรรยายใหม่ ไม่ใช่แค่แปะรหัสทับของเดิม

---

## 5. SCHEMA — map ลงตารางที่มีอยู่ + expand-before-contract

### 5.1 map ลงของเดิม

| สิ่งที่ SKU ต้องเก็บ | ตาราง/คอลัมน์ที่มีอยู่แล้ว | พอไหม |
|---|---|---|
| รหัส SKU บนบรรทัดเอกสาร | `invoice_line_items.code` (text NOT NULL, ไม่มี CHECK ไม่มี FK ไม่มี enum — `billing.prisma:174`) | **พอ** แต่ต้องเพิ่ม CHECK + ล้างคำศัพท์ที่ชนกัน 3 ชุด |
| จำนวน (scope) | `invoice_line_items.quantity` Int default 1 (`billing.prisma:177`) | **พอ** แต่ 100% ของแถว live เป็น 1 เพราะ writer ฝั่ง checkout ฮาร์ดโค้ด |
| ราคา/หน่วย | `invoice_line_items.unitPrice` Decimal(15,2) (`billing.prisma:181`) | **พอ** — วันนี้ = amount เพราะ qty = 1 |
| SKU ระดับ "ใบ" | `invoices.serviceType` (String ไม่มี CHECK — `billing.prisma:26`) | **ไม่พอ** — มันเป็น de-dup key ของ partial unique index `uniq_invoice_app_service_active` และถูก **parse** เป็น routing (`stripe-checkout-service.js:169-171` เตือนว่าถ้ามีคำว่า `STATE_FEE` จะพลิก issuer เป็น DTAM แล้วข้าม journal entry) → **ห้ามเปลี่ยนความหมายของคอลัมน์นี้** |
| SKU บนใบเสนอราคา | `quotations.installments` Json (`billing.prisma:747`) — วันนี้ key ด้วย `phase` | **ไม่พอ** — ต้องเพิ่ม key `skuCode` เข้าไปใน object เดิม (Json ขยายได้โดยไม่ต้อง migrate) |
| SKU บน checkout order | `checkout_orders.milestone` (CHECK จำกัด M1\|M2) | **ไม่พอ** — DB ห้ามค่า renewal อยู่แล้ว ดู §5.4 |
| ราคาที่มีวันบังคับใช้ | **ไม่มี** — `business-rules.js:112-160` อ่าน SystemConfig ด้วย key ล้วน ไม่มีคอลัมน์วันที่ | **ต้องสร้างใหม่** |
| แคตตาล็อกสินค้า/price book | **ไม่มีเลยทั้ง DB** | **ต้องสร้างใหม่** |

**ไม่มี Prisma enum แม้แต่ตัวเดียวทั้ง schema** และนั่นคือการตัดสินใจที่บันทึกไว้
(`apps/backend/shared/checkout-status.js`: "Executive decision R1 chose String + CHECK over a
Prisma enum so the state-machine enforcement machinery … keeps one pattern") → **SKU ต้องเดินตาม
house pattern เดิม: String + Postgres CHECK + โมดูล vocabulary ที่ freeze ไว้ + boot assertion**
ห้ามเป็น enum ตัวแรกของบ้าน

### 5.2 ลำดับ expand → contract

**E0 — vocabulary module (ไม่แตะ DB, Tier B)**
สร้าง `apps/backend/shared/sku-catalogue.js`: `Object.freeze` รายการ SKU พร้อม
`{ code, nameTH, nameEN, unit, status, priceVersionKey, sortOrder }` + `assertKnownSku()` +
boot-time totality assertion แบบเดียวกับ `checkout-status.js` · **ไม่มีตัวเลขราคาในโมดูลนี้**
ราคายังอ่านจาก `business-rules.js` ตัวเดียวเหมือนเดิม (ไม่ละเมิด SSoT และไม่ใช่ money mutation)

**E1 — เพิ่มคอลัมน์ nullable (Tier C, additive ล้วน)**
```
ALTER TABLE invoice_line_items ADD COLUMN "skuCode" text NULL;
ALTER TABLE invoices            ADD COLUMN "skuCode" text NULL;
ALTER TABLE quotations          ADD COLUMN "skuCode" text NULL;
ALTER TABLE checkout_orders     ADD COLUMN "skuCode" text NULL;
```
ยังไม่มี CHECK ยังไม่มี NOT NULL · reader เดิมทุกตัวไม่รู้จักคอลัมน์นี้จึงไม่พัง

**E2 — dual-write (Tier C)**
writer ทั้งสองตัวประทับ `skuCode` เพิ่ม โดยไม่แตะ `code` เดิม:
- `stripe-checkout-service.js:184-220` → ทั้ง 3 แถวได้ `skuCode` **เดียวกัน** (แถวเหล่านั้นคือ
  องค์ประกอบของ *ค่าใช้จ่ายเดียว*) resolve จาก milestone + `formData.renewalOf`
- `application-phase-invoice-methods.js:105-115` → เช่นกัน จาก phase
- `quotation-service.js:333-339` → เพิ่ม key `skuCode` ลงในทุก entry ของ `installments`

**E3 — backfill (Tier C, read-modify-write บนแถวเก่า)**
map แบบ deterministic ไม่มีการเดา:

| ที่มา (ของจริงใน DB วันนี้) | → skuCode |
|---|---|
| `invoices.serviceType` = `PHASE_1_STATE_FEE` \| `PHASE_1_PLATFORM_FEE` \| `CERTIFICATION_CHECKOUT_M1` | `GACP-NEW-P1` |
| `= PHASE_2_STATE_FEE` \| `PHASE_2_PLATFORM_FEE` \| `CERTIFICATION_CHECKOUT_M2` | `GACP-NEW-P2` |
| `= CERTIFICATION_CHECKOUT` (รูปแบบเก่าไม่มี suffix) | **ไม่ backfill** — ปล่อย NULL แล้วให้ operator ตัดสินรายใบ |
| ใบที่ `application.formData.renewalOf` มีค่า | `GACP-RENEW` |

> **ข้อจำกัดที่ต้องบอก:** ในฐานข้อมูลจริงวันนี้ **ไม่มีแถว renewal เลยสักแถว** — checkout order
> ทั้ง 15 ใบราคา 5,535 / 27,675 ซึ่งเป็นสูตรที่ถูกยกเลิกไปแล้วทั้งหมด การ map บรรทัดสุดท้าย
> จึงยังพิสูจน์กับข้อมูลจริงไม่ได้ ต้องพิสูจน์ตอนกดจริง

การ backfill นี้ **ไม่แก้จำนวนเงินของแถวเก่าแม้แต่บาทเดียว** — 5,535/27,675 คือราคาที่ออกไปแล้ว
ภายใต้สูตรเก่า และ `quotation-service.js:506-509` ระบุไว้เองว่าการ reprice ของเก่า "is exactly
what must not happen"

**E4 — เปิด CHECK (Tier C)**
เมื่อ backfill ครบ (นับได้ = 0 แถวที่ควรมีค่าแต่ยัง NULL):
```
ALTER TABLE invoice_line_items ADD CONSTRAINT invoice_line_items_sku_check
  CHECK ("skuCode" IS NULL OR "skuCode" IN ('GACP-NEW-P1','GACP-NEW-P2','GACP-RENEW'));
```
`GACP-EXPEDITE` **ไม่อยู่ใน CHECK** จนกว่าจะมีเครื่องเก็บเงิน — DB จึงเป็นตัวห้ามเอง ไม่ต้อง
พึ่งวินัยคน (ตรงกับหลัก "เครื่องบังคับแทนวินัยคน")

**E5 — renderer อ่าน SKU (Tier C)** — diff ใน §4.3 + เปลี่ยน `serviceTypeLabel` ไปอ่าน catalogue
+ **เขียนคำบรรยาย line item ใหม่** ให้เลิกอ้าง ม.77/1(10)

**C1 — contract (ใบแยก หลัง drain ครบ)**
- `code` เลิกเป็นแหล่งความจริง เหลือเป็น legacy alias
- ยุบ 3 แถวต่อใบเหลือ 1 แถวต่อ SKU (state/platform ยังแยกอยู่ในคอลัมน์
  `checkout_orders.dtam_fee_amount` / `platform_fee_net` ที่ฝ่ายบัญชีอ่าน — ไม่หายไปไหน)
- ลบค่าคงที่ตาย: `payment-fees.js:36,37`, `business-rules.js:258-260`, `application-bundles.js:49`
  (`FEE_PER_APPLICATION = 30000` ที่เสิร์ฟ `pricingPreview` ให้ทุก bundle โดยไม่มีใครเก็บเงิน)

### 5.3 catalogue guard (เครื่องบังคับ ไม่ใช่กฎบนกระดาษ)

probe ใหม่ `sku-catalogue` `[BUILD]` — ทำให้ merge ไม่ผ่านเมื่อ:
1. มี string literal ที่หน้าตาเป็น SKU code อยู่นอก `shared/sku-catalogue.js`
2. มี SKU สถานะ `DRAFT` ปรากฏใน writer path ใด ๆ
3. `nameTH` ในแคตตาล็อกกับ `serviceTypeLabel` ให้คำตอบต่างกันสำหรับ SKU เดียวกัน
4. มี CHECK constraint กับ frozen module ไม่ตรงกัน (totality assertion ตอน boot)

### 5.4 สิ่งที่การออกแบบนี้ **ไม่ได้แก้** (ต้องพูดออกมา)

- `checkout_orders.milestone` มี CHECK `IN ('M1','M2')` และ unique index open-order ผูกกับ
  `(applicationId, milestone)` → **renewal ไม่มีช่องของตัวเองในตารางนี้** SKU มาแปะทับไม่ได้
  แก้ปัญหานี้ วันนี้ renewal ถูกยัดผ่านช่อง PHASE_2 โดยตั้งใจ (`quotation-service.js:270-296`)
  SKU ทำให้มันมี**ชื่อ**ที่ถูกต้องบนเอกสาร แต่ไม่ได้ให้มัน**มีช่องของตัวเอง**ใน state machine
- `checkout_documents.documentType` ยังมี CHECK จำกัดแค่ 2 ชนิดตามโมเดลสองผู้ออกเอกสารที่เลิกใช้
  (`PLATFORM_TAX_INVOICE`, `DTAM_DISBURSAL_RECEIPT`) พร้อมข้อมูลจริง 20 แถว — งานคนละใบ
- **บั๊กเรียกเก็บเงินขาดของ renewal ผ่านราง Stripe**: `breakdownForMilestone`
  (`stripe-checkout-service.js:63-69`) เรียก `calculateApplicationFees` โดยไม่ดู
  `formData.renewalOf` เลย ขณะที่ `renewal-service.js:232` ส่ง renewal เข้า `PENDING_AUDIT_FEE`
  ซึ่งเป็นสถานะจ่ายได้ของ M2 (`stripe-checkout-service.js:41`) → เก็บ 29,425 แทน 35,310
  **ขาดไป 5,885 ต่อ scope**
  การออกแบบ SKU **ช่วยเชิงโครงสร้าง**: ถ้า checkout ต้อง resolve `skuCode` ก่อนคิดเงิน จุดแตกกิ่ง
  renewal จะมีที่อยู่จุดเดียวและ resolver ตัวนั้นทดสอบได้ **แต่มันเป็นการแก้ money logic → L3
  ห้าม agent แตะ เสนอเป็น diff แยกใบ และต้องมี view-pack จากการกดจริงก่อน**
- **scopeCount ยุบเป็น 1 เงียบ ๆ บนราง Stripe + preview**: ทั้งสองสร้าง fee context ที่มี
  `totalAreaTypes` แต่ไม่ส่ง `options.scopeCount` ขณะที่ `resolveCultivationScopeCount`
  (`fee-service.js:107-119`) อ่านแค่ `options.scopeCount` แล้วถอยไปนับ `cultivationMethods`
  — **ไม่เคยอ่าน `formData.totalAreaTypes`** · เรื่องนี้กระทบ SKU โดยตรงเพราะ qty บนเอกสาร
  ของผมคือ scopeCount: ถ้า resolver ให้ 1 ขณะที่ `application.totalAreaTypes` เป็น 3 เอกสาร
  จะพิมพ์ qty ไม่ตรงกับที่เก็บเงิน · **กติกาบังคับของดีไซน์นี้: qty บนเอกสารต้องมาจากตัวเลข
  scopeCount ตัวเดียวกับที่คิดเงิน ห้ามคำนวณซ้ำคนละที่**

---

## 6. ราคาเปลี่ยนหลังออกใบเสนอราคาไปแล้ว จะเกิดอะไรขึ้น

### 6.1 วันนี้เป็นอย่างไร (ข้อเท็จจริง)

**ส่วนที่ freeze แล้วจริง:** แถว `Quotation` เก็บ `subtotal` / `vat` / `totalAmount` /
`installments` ไว้ (`quotation-service.js:545-559`) · ออกซ้ำเป็น idempotent คืนแถวเดิมโดยไม่แตะ
(`:493-517`) · การ mint invoice ตามงวดเคารพราคาที่ freeze ไว้ และ log
`[QUOTE_PRICE_DRIFT] … honoring the frozen quote` เมื่อไม่ตรง
(`application-phase-invoice-methods.js:375-419`)

**ส่วนที่ recompute สด — สามหน้าจอ:**
1. **การเก็บเงินจริง** — `stripe-checkout-service.js:64-83` เรียก `calculateApplicationFees`
   และ **ไม่เคย** เรียก `getFrozenPhaseFees` เลย
2. **PDF ใบเสนอราคา** — `invoice-template-service.js:995` คำนวณใหม่ตอน render รับมาจากแถวเก็บ
   เพียง "เลขที่" อย่างเดียว
3. **API รายการใบเสนอราคา** — `routes/api/applications/quotations.js:158-163` สร้าง line item
   ใหม่ทุกครั้งที่ GET

**ผลลัพธ์วันนี้:** ถ้าเปลี่ยนอัตรากลางคัน ใบเสนอราคาที่ออกไปแล้วจะ **โหลดซ้ำแล้วได้ราคาใหม่**
และ **เก็บเงินจริงตามราคาใหม่** ขณะที่แถวในฐานข้อมูลกับเลขที่เอกสารยังเป็นของเดิม
ซ้ำร้าย `business-rules.js:112-160` อ่าน override จาก SystemConfig โดย **ไม่มีคอลัมน์วันบังคับใช้เลย**
— ค่าล่าสุดชนะทุก request — และ `catch` ที่ `:153-155` กลืน error เงียบ ๆ

### 6.2 กติกาที่เสนอ

**หลัก: ราคาที่ผูกพันคือ "เวอร์ชันราคาที่ประทับบนเอกสาร" ไม่ใช่อัตราปัจจุบัน**

ตารางใหม่ `sku_price_versions`:

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `id` | uuid PK | |
| `skuCode` | text | ตรงกับ CHECK เดียวกับ §5.2 E4 |
| `effectiveFrom` | timestamptz NOT NULL | Asia/Bangkok |
| `effectiveTo` | timestamptz NULL | NULL = ยังใช้อยู่ |
| `stateRatePerScope` | Decimal(15,2) | |
| `platformRate` / `vatRate` | Decimal(6,4) | |
| `signedBy` | text NOT NULL | operator เท่านั้น (สอดคล้อง L6) |

+ partial unique index กันช่วงเวลาซ้อนทับต่อ 1 skuCode

**ลำดับการทำงาน 4 ข้อ:**

1. **ตอนออกใบเสนอราคา** ประทับ `skuPriceVersionId` ลงในแต่ละ entry ของ `installments`
   (Json ขยายได้ ไม่ต้อง migrate) เพิ่มจาก `stateAmount/platformAmount/vatAmount/scopeCount`
   ที่ `_buildInstallments` เก็บอยู่แล้ว (`quotation-service.js:322-339`)
2. **ทุกเอกสารปลายทาง** (ใบวางบิล ใบเสร็จ ใบกำกับ) อ่านเวอร์ชันจากใบเสนอราคาที่ผูกอยู่
   **ห้ามอ่านอัตราปัจจุบัน** → ปิดช่อง recompute ทั้งสามข้างต้น
3. **การเก็บเงินจริง** ต้องอ่านเวอร์ชันเดียวกัน — คือทำให้ `stripe-checkout-service` เรียก
   `getFrozenPhaseFees` เหมือนที่ phase-invoice mint ทำอยู่แล้ว (money path, Tier C)
4. **อายุใบเสนอราคา 30 วัน** (`quotation-service.js:115` `DEFAULT_VALIDITY_DAYS = 30`) เป็นตัวจำกัด
   ความรับผิด: หมดอายุ → ออกใหม่ที่เวอร์ชันปัจจุบัน · วันนี้ `validUntil` ถูกเขียนแต่ **ไม่มี
   ใครอ่านก่อน recompute** (renderer และ route ไม่แตะ `validUntil` หรือ `status` เลย)
   → ต้องบังคับใช้จริง

**เคสที่ต้องตอบให้ชัดตั้งแต่ตอนนี้:**

| สถานการณ์ | ผลลัพธ์ตามกติกานี้ |
|---|---|
| ยื่นใหม่ จ่ายงวด 1 แล้ว ราคางวด 2 ขึ้น | งวด 2 คิดตามเวอร์ชันบนใบเสนอราคาเดิม เพราะเป็น *ใบเสนอราคาเดียว 2 งวด* — ยืนยันจาก `_buildInstallments` ที่ผลิตทั้งสองงวดพร้อมกัน |
| ใบเสนอราคาหมดอายุแล้วเกษตรกรเพิ่งมาจ่าย | บล็อกไว้ ให้ออกใบใหม่ที่ราคาปัจจุบัน — ต้องมีข้อความไทยที่บอกเหตุผล ไม่ใช่ error ดิบ |
| ราคาลด หลังออกใบไปแล้ว | ยังผูกราคาเดิม — ถ้าจะคืนส่วนต่างต้องออก credit note ซึ่งเป็นการตัดสินของ operator (`credit_notes` วันนี้มี 0 แถว = ไม่เคยถูกใช้จริงเลย) |
| แถวเก่าที่ราคาสูตรเดิม (5,535 / 27,675 — 15 ใบใน DB จริง) | ห้าม reprice เด็ดขาด backfill ให้ `skuPriceVersionId` ชี้ไปที่เวอร์ชัน `W13-LEGACY` ที่ `effectiveTo` ปิดแล้ว |

**ข้อจำกัดที่ต้องพูด:** ตารางเวอร์ชันไม่ช่วยอะไรเลยถ้า `loadFeesFromSystemConfig` ยังอ่าน key
เปล่า ๆ อยู่ ต้องแก้ให้เป็น version reader พร้อมกัน ไม่งั้นได้ระบบเวอร์ชันที่มีทางลัดข้าม
· และช่องข้ามที่ใหญ่กว่านั้นคือ `pricing.js:229-230` ที่ให้ blob ชื่อ `pricing_fees` ใน
SystemConfig **ทับ payload ราคาสาธารณะทั้งก้อน** โดยไม่ผ่าน `buildPhaseFee` เลย — ต้องปิดหรือ
บังคับให้ผ่าน catalogue

---

## 7. สามข้อโต้แย้งที่แรงที่สุดต่อดีไซน์ของตัวเอง

### ข้อโต้แย้งที่ 1 — "SKU ระดับเหตุการณ์ทำให้เอกสารเหลือบรรทัดเดียว ซ่อนค่าธรรมเนียมรัฐ 5,000 ที่เกษตรกรควรเห็น"

นี่คือข้อโต้แย้งที่แรงที่สุด และมันมีน้ำหนักจริง: ค่าธรรมเนียมรัฐคือเงินที่ปลายทางไปกรม
เกษตรกรมีสิทธิ์เห็นว่าจ่ายให้รัฐเท่าไหร่ จ่ายให้บริษัทเท่าไหร่

**คำตอบ:**
(ก) **กฎหมายไม่ได้บังคับให้แตกต้นทุน** — ม.86/4(5) บังคับ ชื่อ/ชนิด/ประเภท/ปริมาณ/มูลค่า ของ
*สิ่งที่ขาย* ไม่ใช่โครงสร้างต้นทุนของผู้ขาย
(ข) **การพิมพ์แยกบรรทัดคือการรื้อฟื้นโมเดลสองผู้ขายที่ operator ยกเลิกไปแล้ว** และวันนี้บรรทัด
นั้นแบกคำกล่าวอ้างเท็จอยู่จริง (`stripe-checkout-service.js:191` อ้าง ม.77/1(10) บนยอดที่ถูก
คิด VAT แล้ว) — ทางเลือก "แยกบรรทัด" ในทางปฏิบัติแปลว่า "พิมพ์คำกล่าวอ้างยกเว้น VAT ต่อไป"
ซึ่งภายใต้ ม.86/4(6) คือการระบุฐานภาษีผิดบนเอกสารภาษี
(ค) **ความโปร่งใสไม่หายไป** — ย้ายไปอยู่ในบล็อก "รายละเอียดสินค้า" ซึ่งมีอยู่แล้วและ
เป็นข้อความบรรยาย ไม่ใช่บรรทัดภาษี (`apps/backend/services/pdf/product-detail-builder.js:78-130`)
เขียนเป็น "ค่าธรรมเนียมรัฐ 30,000 + ค่าแพลตฟอร์ม 10% 3,000 ต่อรูปแบบ" ได้ตรงไปตรงมา
(ง) **ฝ่ายบัญชียังแยกได้เหมือนเดิม** — `checkout_orders.dtam_fee_amount` / `platform_fee_net`
ยังอยู่ครบ และ `journal_lines` ก็ยังลง 2151-001 กับ 4110-001 แยกกันเหมือนเดิม

**สิ่งที่ผมยอมรับว่ายังไม่ปิด:** ถ้า operator ตัดสินว่าเกษตรกร*ต้อง*เห็นสองบรรทัด ดีไซน์นี้รองรับได้
โดยให้ SKU มี sub-component (STATE/PLATFORM) พิมพ์เป็นบรรทัดย่อยที่**ไม่มีคำกล่าวอ้างภาษี**
แต่มันเพิ่มงานที่ renderer และขัดกับเป้า "แก้น้อยที่สุด" ที่ผมเลือกไว้

### ข้อโต้แย้งที่ 2 — "ทำไมไม่ทำ SKU ระดับบรรทัด ในเมื่อ `invoice_line_items.code` มี 3 แถวรออยู่แล้ว ของคุณต้องไปแก้ writer"

จริง: ระดับบรรทัดคือที่ที่ `code` อยู่ตอนนี้ การทำ SKU ระดับบรรทัดแทบไม่ต้องเพิ่มคอลัมน์เลย

**คำตอบ:**
(ก) **คำศัพท์ระดับบรรทัดมีอยู่แล้วสามชุดที่ขัดกันเอง** — คอมเมนต์ schema โฆษณา
`DOC_REVIEW/FIELD_AUDIT/PLATFORM_FEE/VAT` (`billing.prisma:174`), writer ฝั่ง checkout เขียน
`DTAM_FEE/PLATFORM_FEE/PLATFORM_VAT`, writer ฝั่ง phase-mint **ต่อสตริงเอาตอนเขียน**
`${PHASE}_${COMPONENT}` (`application-phase-invoice-methods.js:109`) · ในข้อมูลจริงมีแค่
`PLATFORM_FEE` ตัวเดียวที่ทับกับคอมเมนต์ — การเพิ่มชุดที่ 4 ที่ระดับเดียวกันเกือบแน่นอนว่า
จะกลายเป็นชุดที่ 4 ที่ขัดกับอีกสามชุด แทนที่จะแทนที่มัน
(ข) **ระดับเหตุการณ์เป็นระดับเดียวที่ writer ทั้งสองเห็นตรงกัน** — ทั้งคู่รู้ milestone/phase และ
รู้ `formData.renewalOf` → derive ได้แบบไม่กำกวมสำหรับ **ทุกแถวที่มีอยู่** ซึ่งเป็นเงื่อนไขที่ทำให้
backfill ใน §5.2 E3 เป็นไปได้จริง ระดับบรรทัด backfill ไม่ได้เพราะแถวเก่า 40 จาก 60 ใบ
**ไม่มี line item เลย**
(ค) **คำถามที่ธุรกิจถามจริงตอบไม่ได้ที่ระดับบรรทัด** — "เกษตรกรรายนี้จ่ายค่าต่ออายุไปเท่าไหร่"
ที่ระดับบรรทัดต้องรวม 3 แถวข้าม 2 writer ที่ใช้คำศัพท์คนละชุด ที่ระดับเหตุการณ์คือ
`WHERE skuCode = 'GACP-RENEW'`
(ง) **ระดับบรรทัดไม่ได้ถูกพิมพ์ออกเอกสารอยู่ดี** — `buildItemsRows` ไม่อ่าน `invoice.lineItems`
เลย การลงทุนกับ vocabulary ที่ไม่มีใครเห็นคือการลงทุนผิดที่

### ข้อโต้แย้งที่ 3 — "แคตตาล็อกจะโกหกทันทีที่มีคนเปลี่ยน rate — คุณผูกราคาไว้กับ config ที่ไม่มีวันบังคับใช้"

ถูกต้อง และนี่คือจุดอ่อนที่ใหญ่ที่สุดของดีไซน์นี้ ผมไม่แก้ตัว

**คำตอบ:**
(ก) **แคตตาล็อกไม่เคลมว่ารู้ราคา — มันเคลมว่ารู้ "เวอร์ชันราคา"** โมดูล `sku-catalogue.js`
ใน E0 จึง **ไม่มีตัวเลขเงินอยู่ข้างในเลย** ตัวเลขยังอยู่ที่ `business-rules.js` แห่งเดียว
ถ้าใครเปลี่ยน rate แคตตาล็อกไม่ผิด เพราะมันไม่เคยอ้างตัวเลข
(ข) **แต่นั่นยังไม่พอ** และผมพูดตรง ๆ ว่าดีไซน์นี้ **พึ่งพา** `sku_price_versions` (§6.2)
ถ้า operator ไม่อนุมัติตารางนั้น สิ่งที่ได้คือ "ชื่อสินค้าที่ดีขึ้นบนราคาที่ยังลอยอยู่"
ซึ่งดีกว่าเดิมแต่ไม่ใช่ระบบราคา
(ค) **มีทางลัดสองทางที่ต้องปิดพร้อมกัน ไม่งั้นเวอร์ชันไร้ความหมาย** —
`loadFeesFromSystemConfig` ที่ `catch` เงียบ (`business-rules.js:153-155`: โหลดพลาด → ตกกลับ
default โดยไม่มีสัญญาณเตือน) และ blob `pricing_fees` ที่ทับ payload ราคาสาธารณะทั้งก้อน
(`pricing.js:229-230`) · ทั้งสองอย่างต้องถูกปิดหรือบังคับให้ผ่าน catalogue
(ง) **ระหว่างที่ยังไม่มีตารางเวอร์ชัน** กติกาชั่วคราวที่บังคับได้ทันทีคือ:
**ห้ามเปลี่ยน rate ระหว่างที่มีใบเสนอราคา status PENDING ค้างอยู่** — ตรวจได้ด้วย query เดียว
และเป็น operator decision ไม่ใช่โค้ด

---

## 8. สรุปสิ่งที่ต้องอนุมัติ และสิ่งที่ยังพิสูจน์ไม่ได้

**operator ต้องตัดสิน 5 เรื่อง**
1. รหัสพูดได้ (`GACP-NEW-P1`) หรือรหัสตัวเลข (`SKU001`) — §3
2. `GACP-EXPEDITE`: สร้างเครื่องเก็บเงิน หรือ ลบทิ้งแบบ BT11/BT13 — §2.4
3. subscription 990/9,900 คิด VAT หรือไม่ (วันนี้เขียน `vat: 0`) — §2.5
4. อนุมัติตาราง `sku_price_versions` หรือรับกติกาชั่วคราว "ห้ามเปลี่ยน rate ขณะมีใบค้าง" — §6.2
5. เกษตรกรต้องเห็นค่าธรรมเนียมรัฐแยกบรรทัดหรือไม่ — §7 ข้อ 1

**ยังพิสูจน์ไม่ได้ (PENDING — ห้ามเคลมเป็น DONE)**
- ทุก diff ในเอกสารนี้เป็น **ข้อเสนอ** ไม่มีไฟล์ใดถูกแก้ · L3 รักษาไว้ครบ
- หลักฐานที่รันจริงมีอย่างเดียวคือการเรียก `fee-service.js` ตรง ๆ (§0) · **ไม่ได้รันเทสสวีท
  ไม่ได้ query ฐานข้อมูล ไม่ได้ render PDF สักใบ ไม่ได้กด checkout จริง**
- บั๊ก renewal-ผ่าน-Stripe และบั๊ก scopeCount ยุบเป็น 1 (§5.4) เป็น **การอ่านโค้ด + รันฟังก์ชัน**
  ยังไม่ได้พิสูจน์แบบ end-to-end ต้องมี view-pack จากการกดจริงก่อนกลายเป็นใบแก้
- การ map `renewalOf → GACP-RENEW` ใน backfill (§5.2 E3) **ยังไม่มีข้อมูลจริงให้ทดสอบ** เพราะ
  ในฐานข้อมูลยังไม่มีแถว renewal สักแถว
- baseline mismatch: อ่านที่ bf50c143 ไม่ใช่ 6248a0d1 ตามที่โจทย์ระบุ
