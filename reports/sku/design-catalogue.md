# SKU Fee Catalogue — ออกแบบ "แคตตาล็อกสินค้าแบบมีเวอร์ชัน" (versioned product catalogue)

- วันที่: 2026-08-23
- Working tree HEAD ที่อ่านจริง: `bf50c143` (`git rev-parse HEAD`) — **โจทย์ระบุ 6248a0d1 แต่ tree อยู่ที่ bf50c143** ทุก file:line ในเอกสารนี้คือสิ่งที่เปิดจริงบน bf50c143
- สถานะเอกสาร: **SPEC + PROPOSED DIFF เท่านั้น** — ตาม L3 ไม่มีการแก้ไฟล์ใดใต้ `apps/backend/modules/billing`, `apps/backend/config/business-rules.js` หรือ payment path ใด ๆ เขียนเฉพาะไฟล์นี้ใน `reports/`
- หลักฐานเชิงตัวเลขที่รันจริงใน session นี้ (คำสั่ง `node -e` เรียก `apps/backend/modules/billing/internal/fee-service.js` ตรง ๆ):

```
exports: FEE_RATES,PLATFORM_RATE,VAT_RATE,resolveCultivationScopeCount,collectUniqueCultivationMethods,calculatePhase1Fee,calculatePhase2Fee,calculateRenewalFee,calculateApplicationFees
scopes 1 p1 5885 p2 29425 p1state 5000 p1plat 500 p1vat 385 p2state 25000 p2plat 2500 p2vat 1925
  renewal {"state":30000,"plat":3000,"svc":33000,"vat":2310,"total":35310}
scopes 2 p1 11770 p2 58850 p1state 10000 p1plat 1000 p1vat 770 p2state 50000 p2plat 5000 p2vat 3850
  renewal {"state":60000,"plat":6000,"svc":66000,"vat":4620,"total":70620}
scopes 3 p1 17655 p2 88275 p1state 15000 p1plat 1500 p1vat 1155 p2state 75000 p2plat 7500 p2vat 5775
  renewal {"state":90000,"plat":9000,"svc":99000,"vat":6930,"total":105930}
```

ตัวเลขนี้ตรงกับที่ operator ยืนยัน (5,885 / 29,425 / 35,310 ต่อ scope) ทุกหลัก

---

## 0. คำตอบตรง ๆ ต่อ sketch ของ operator

operator เดาไว้ว่า `SKU001 = ยื่นใหม่ งวด 1 · SKU002 = ยื่นใหม่ งวด 2 · SKU003 = ต่อสัญญา`

**โครงถูก — สามเหตุการณ์นั้นมีจริงในโค้ด และเป็นสามเหตุการณ์เดียวที่ระบบเก็บเงินจากคำขอรับรอง** แต่มีสามข้อที่ต้องแก้ก่อนจึงจะ "เป็น" ไม่ใช่ "น่าจะเป็น":

1. **ราคาไม่ผูกกับ SKU ได้ตรง ๆ** — ทุกค่าธรรมเนียมคิด *ต่อรูปแบบการปลูก (cultivation scope)* แล้วคูณ `scopeCount` (`apps/backend/modules/billing/internal/fee-service.js:143` `const stateAmount = ratePerScope * scopeCount;`) SKU หนึ่งบรรทัดจึงเป็น **ราคาต่อหน่วย × จำนวนหน่วย** เสมอ ไม่ใช่ตั๋วราคาตายตัว
2. **รายการเงินที่มีชีวิตในระบบมีมากกว่า 3** — ยังมี subscription PREMIUM รายเดือน/รายปี (`apps/backend/services/subscription/subscription-order-service.js:67-68` `PREMIUM_MONTHLY: 990, PREMIUM_YEARLY: 9900`) และใบเพิ่มหนี้ที่เจ้าหน้าที่พิมพ์ยอดเอง (`apps/backend/services/debit-note-service.js:68-72`) — sketch ไม่ครอบคลุมสองตระกูลนี้
3. **มีราคาที่ประกาศแต่ไม่มีตัวเก็บเงิน** — `expediteFee: 10000` ถูกเสิร์ฟออก public API จริง (`apps/backend/routes/api/finance/pricing.js:210`) โดยความเห็นในไฟล์เดียวกันบรรทัด 208-209 ยอมรับเองว่า "Still NOT SSoT-backed" และยังมี `URGENT_PROCESSING_FEE: 3000` ซ้อนอยู่อีกที่ (`apps/backend/config/payment-fees.js:37`) — ราคาสองตัวคนละเลข ไม่มีตัวไหนเก็บเงินได้ นี่คือรูปแบบเดียวกับ BT11/BT13 ที่ถูกลบไปแล้ว (`apps/backend/config/business-rules.js:95-101`) **ห้ามออก SKU ให้มัน**

---

## 1. หลักการออกแบบ (ทำไมต้องเป็นแคตตาล็อกในฐานข้อมูล ไม่ใช่ค่าคงที่ในโค้ด)

กฎยืนของ operator: **อัตรา/ราคาต้องเป็นข้อมูลที่มีวันที่ ไม่ใช่ค่าคงที่** ปัจจุบันระบบละเมิดข้อนี้สองชั้น:

| ปัญหาที่มีอยู่จริงวันนี้ | หลักฐาน |
|---|---|
| อัตราอยู่ใน object ที่ mutate ได้ ไม่มีคอลัมน์วันที่ | `apps/backend/config/business-rules.js:44-102` (`FEE_DEFAULTS`) แล้ว `const FEES = { ...FEE_DEFAULTS };` ที่ :105 |
| override จาก SystemConfig เขียนทับตอน boot **โดยไม่มี effective date** ค่าใหม่ชนะทุก request ย้อนหลังทันที | `apps/backend/config/business-rules.js:112-156` — และ `catch (_err)` ที่ :153-155 กลืน error เงียบ ๆ |
| SystemConfig ไม่มีคอลัมน์วันที่ให้ผูกด้วยเลย | `apps/backend/prisma/schema/system.prisma:52-62` — มีแค่ `key/value/type/description/updatedBy/updatedAt` |
| เอกสารที่ออกไปแล้วถูก **คำนวณใหม่ตอน render** | `apps/backend/services/pdf/invoice-template-service.js:995` เรียก `calculateApplicationFees(...)` ตอนพิมพ์ PDF ใบเสนอราคา และ `apps/backend/routes/api/applications/quotations.js:159-162` สร้าง lineItems ใหม่ทุกครั้งที่ GET |

ผลคือ: **ถ้าวันนี้แก้ `fee.phase2_per_scope` ใน SystemConfig ใบเสนอราคาที่ออกไปเมื่อวานจะเปลี่ยนตัวเลขเมื่อชาวไร่กดโหลด PDF ซ้ำ** โดยเลขที่เอกสารเท่าเดิม นี่คือสิ่งที่การออกแบบนี้ต้องปิด

หลักที่ยึด 5 ข้อ:

- **P1 ราคาเป็นแถวข้อมูลที่มีวันที่** — ไม่มีตัวเลขค่าธรรมเนียมใน source code อีก (ยกเว้น seed migration ที่เขียนแถวแรก)
- **P2 แถวราคาไม่เคย UPDATE** — ขึ้นราคา = INSERT เวอร์ชันใหม่ + ปิด `effectiveTo` ของเวอร์ชันเก่า ประวัติราคาจึงอ่านย้อนหลังได้ตลอดอายุเก็บเอกสาร 5 ปี (ม.87/3)
- **P3 เอกสารที่ออกแล้วปักหมุดเวอร์ชัน** — ใบเสนอราคาเก็บ `priceVersionId` ต่อบรรทัด ใบวางบิล/ใบเสร็จ **คัดลอก** หมุดนั้นมา ไม่เคย resolve ตามวันที่ใหม่
- **P4 SKU ตั้งชื่อ "เหตุการณ์ที่เก็บเงิน" ไม่ใช่ "องค์ประกอบภาษี"** — 1 SKU = 1 บรรทัดบนเอกสาร; ส่วนแยก state/platform/VAT เป็นคอลัมน์ประกอบของบรรทัดนั้น ไม่ใช่ SKU คนละตัว (เหตุผลอยู่ §2.3)
- **P5 ไม่มี fallback เงียบ** — resolve ราคาไม่ได้ = โยน error ดัง ๆ ห้ามตกกลับไปหาค่าคงที่ (เทียบแบบเดียวกับ probe `no-secret` ที่ fail-loud ตาม CLAUDE.md L2) การกลืน error แบบ `business-rules.js:153-155` คือสิ่งที่ทำให้ราคาผิดเงียบได้

---

## 2. รายการ SKU ฉบับเต็ม

### 2.1 รูปแบบรหัส และเหตุผลที่ **ไม่** ใช้ SKU001/002/003

**รูปแบบที่เลือก: `<FAMILY>-<EVENT>[-<SEQ>]` เป็นตัวอักษรพูดได้ (speaking code)**
เช่น `GACP-NEW-P1`, `GACP-NEW-P2`, `GACP-RENEW`, `SUBS-PREMIUM-M`

เหตุผล 5 ข้อ (เรียงตามน้ำหนัก):

1. **คนอ่านใบเสร็จคือเจ้าหน้าที่การเงินที่ต้องกระทบยอดกับ กรมการแพทย์แผนไทยฯ** ช่องรหัสอยู่ติดกับคำอธิบายภาษาไทยอยู่แล้ว `SKU002` ไม่เพิ่มข้อมูลอะไรเลยให้คนที่ถืออยู่ในมือ ส่วน `GACP-NEW-P2` ตรวจสอบตัวเองได้ทันทีว่าใบนี้คืองวด 2 ของคำขอใหม่ — รหัสพูดได้คือ **การควบคุมภายในที่อ่านออกโดยไม่ต้องเปิดตาราง lookup**
2. **บ้านนี้ใช้ vocabulary แบบพูดได้ทั้งระบบอยู่แล้ว** — repo ไม่มี Prisma enum แม้แต่ตัวเดียว ใช้ String + CHECK + frozen JS module พร้อมค่าที่อ่านออก เช่น `PHASE_1_STATE_FEE` (`apps/backend/config/invoice-issuers.js:225-230`), `MILESTONES = ['M1','M2']` (`apps/backend/shared/checkout-status.js`) การใส่รหัสตัวเลขทึบเข้าไปจะเป็น vocabulary เดียวในระบบที่อ่านไม่ออก
3. **รหัสลำดับบนเอกสารมีอยู่แล้วและเป็นคนละเรื่อง** — เลขที่เอกสารต้องเรียงลำดับตาม ม.86/4(4) และมี allocator ของตัวเองที่ทำงานอยู่ (`apps/backend/services/receipt-numbering-service.js:70-75` แม็พ `RCP-DTAM / TAX-PRD / RCP-PRD / CN-PRD / DN-PRD`) การมีเลขลำดับสองชุดบนกระดาษใบเดียวชวนให้เข้าใจผิดว่ารหัสสินค้า = เลขที่เอกสาร **กฎเหล็ก: รหัส SKU ห้ามถูกใช้ derive เลขที่เอกสาร และกลับกัน**
4. **การเพิ่ม SKU ในอนาคตไม่บังคับให้เรียงเลขใหม่** — ถ้าวันหนึ่งมี "ค่าตรวจซ้ำ" ขึ้นมาจริง `GACP-REAUDIT` แทรกได้เลย ขณะที่ `SKU004` บอกแค่ว่ามันมาทีหลัง
5. **รหัสห้ามเข้ารหัสวิธีคิดภาษี** — ห้ามมี SKU ชื่อแนว `*-EXEMPT` เด็ดขาด เพราะวันนี้ยังมีข้อความอ้างยกเว้น VAT ค้างอยู่บนบรรทัดจริง (`apps/backend/services/checkout/stripe-checkout-service.js:191` `'ค่าธรรมเนียมกรมการแพทย์แผนไทยฯ (ยกเว้นภาษีมูลค่าเพิ่ม ม.77/1(10))'` และ :212 `'ภาษีมูลค่าเพิ่ม 7% (ของค่าบริการแพลตฟอร์ม)'`) ทั้งที่ W14 เก็บ VAT บนค่าบริการทั้งก้อน (`fee-service.js:146` `const vatAmount = Math.round(serviceFeeAmount * VAT_RATE);`) รหัสที่ฝังคำว่า EXEMPT จะทำให้ข้อความเท็จนี้กลายเป็นถาวร

**ข้อยกเว้นที่ยอมให้ operator**: ถ้าต้องการเลขสั้นสำหรับพูดทางโทรศัพท์ ให้เพิ่มคอลัมน์ `shortCode` (เช่น `N1`, `N2`, `R`) เป็น **alias** ที่ unique — แต่ `code` ที่พิมพ์บนเอกสารและที่ระบบใช้ join คือรหัสพูดได้ ไม่ใช่ alias

### 2.2 ตาราง SKU — ค่าธรรมเนียมที่ "เก็บเงินได้จริง" (LIVE)

หน่วยราคาทุกแถวคือ **ต่อ 1 cultivation scope** ยอดจริงบนเอกสาร = ราคาต่อหน่วย × `scopeCount`

| รหัส SKU | ชื่อไทย | English | Trigger (ที่โค้ดเก็บเงินจริง) | หน่วย | state / หน่วย | platform 10% / หน่วย | ค่าบริการ (ฐาน VAT) | VAT 7% | ยอดชำระ / หน่วย |
|---|---|---|---|---|---|---|---|---|---|
| `GACP-NEW-P1` | ค่าตรวจสอบเอกสาร คำขอใหม่ (งวดที่ 1) | New application — instalment 1, document review | `POST /api/payments/checkout {milestone:'M1'}` จากสถานะ `DRAFT/SUBMITTED/PENDING_DOC_FEE`; หรือรางสลิปผ่าน `ensurePhaseInvoices('PHASE_1')` | ต่อ scope | 5,000 | 500 | 5,500 | 385 | **5,885** |
| `GACP-NEW-P2` | ค่าตรวจประเมินพื้นที่ คำขอใหม่ (งวดที่ 2) | New application — instalment 2, field audit | `POST /api/payments/checkout {milestone:'M2'}` จาก `DOC_APPROVED/PENDING_AUDIT_FEE`; auto-mint ตอน transition `DOC_APPROVED` | ต่อ scope | 25,000 | 2,500 | 27,500 | 1,925 | **29,425** |
| `GACP-RENEW` | ค่าต่ออายุใบรับรอง (เก็บครั้งเดียว) | Certificate renewal — single charge | `POST /api/applications/renewals` → Application เกิดที่ `PENDING_AUDIT_FEE` พร้อม `formData.renewalOf` | ต่อ scope | 30,000 | 3,000 | 33,000 | 2,310 | **35,310** |

หลักฐานอัตราและ trigger:
- อัตรา: `apps/backend/config/business-rules.js:46` (`PHASE1_PER_SCOPE: 5000`), `:48` (`PHASE2_PER_SCOPE: 25000`), `:83` (`RENEWAL_PER_SCOPE: 30000`), `:85` (`PLATFORM_RATE: 0.10`), `:94` (`VAT_RATE: 0.07`)
- สมการ: `apps/backend/modules/billing/internal/fee-service.js:143-147` — `stateAmount = ratePerScope * scopeCount` → `platformAmount = Math.round(stateAmount * PLATFORM_RATE)` → `serviceFeeAmount = stateAmount + platformAmount` → `vatAmount = Math.round(serviceFeeAmount * VAT_RATE)` → `phaseTotal = serviceFeeAmount + vatAmount`
- ฟังก์ชันต่อ SKU: `fee-service.js:209-216` (phase1), `:218-225` (phase2), `:250-258` (renewal)
- renewal เข้าที่สถานะไหน: `apps/backend/services/renewal-service.js:232` `const RENEWAL_ENTRY_STATE = 'PENDING_AUDIT_FEE';`
- renewal ไม่ออกบรรทัด PHASE_1: `apps/backend/services/quotation-service.js:336-340` (`if (fees.phase1) { company.push(...) }` แล้ว push PHASE_2 เสมอ)

**ยอดรวมตาม scopeCount (กระทบยอดกับผลรันจริงด้านบน ทุกช่อง):**

| SKU | 1 scope | 2 scopes | 3 scopes |
|---|---|---|---|
| `GACP-NEW-P1` | 5,885 | 11,770 | 17,655 |
| `GACP-NEW-P2` | 29,425 | 58,850 | 88,275 |
| รวมคำขอใหม่ (P1+P2) | 35,310 | 70,620 | 105,930 |
| `GACP-RENEW` | 35,310 | 70,620 | 105,930 |

สังเกตที่ต้องบันทึกไว้กันคนมารายงานว่าเป็นบั๊ก: **คำขอใหม่กับต่ออายุยอดรวมเท่ากันพอดี** เพราะฐาน renewal ต่อ scope (30,000) = 5,000 + 25,000 ต่างกันที่ *ตารางเก็บเงิน* ไม่ใช่ยอด — เรื่องนี้เขียนไว้แล้วที่ `apps/backend/config/business-rules.js:70-75`

### 2.3 ทำไม SKU = "เหตุการณ์เก็บเงิน" ไม่ใช่ 3 บรรทัด state/platform/VAT

วันนี้ตารางบรรทัดสินค้าละเอียดกว่าที่ operator วาดไว้หนึ่งชั้น — 1 การเก็บเงินระเบิดเป็น 3 แถว (`DTAM_FEE` / `PLATFORM_FEE` / `PLATFORM_VAT`, `apps/backend/services/checkout/stripe-checkout-service.js:189-215`) ตัดสินให้ SKU อยู่ที่ระดับ **การเก็บเงิน** ด้วยเหตุผล:

1. หลัง W14 มี **ผู้ออกเอกสารรายเดียว** และค่าบริการทั้งก้อนคือ supply ที่ต้องเสีย VAT (`business-rules.js:34-38`) การแยก state ออกเป็นบรรทัดขายต่างหากคือการฟื้นแบบจำลองสองผู้ออกที่ถูกยกเลิกไปแล้ว
2. ม.86/4(6) ต้องการให้ **แยกยอด VAT ให้ชัดแจ้ง** — ซึ่งทำที่บล็อกยอดรวม ไม่ใช่ที่บรรทัดสินค้า และ `buildTotalsRowsHtml` ทำถูกอยู่แล้ว (`apps/backend/services/pdf/invoice-template-service.js:155-182` ออก 3 แถว: ค่าบริการ / VAT 7% / ยอดรวม โดยไม่มี branch ตาม issuer)
3. การแบ่ง state/platform ยังจำเป็น — แต่จำเป็นสำหรับ **กระทบยอดกับ DTAM ภายนอกระบบ** ไม่ใช่สำหรับชาวไร่ จึงเก็บเป็น *คอลัมน์ประกอบของบรรทัด* (`stateAmount`, `platformAmount`) ไม่ใช่บรรทัดแยกที่พิมพ์ออกกระดาษ

### 2.4 SKU ตระกูลที่ 2 — Subscription (LIVE แต่ operator ยังไม่ได้ตัดสินเรื่อง VAT)

| รหัส SKU | ชื่อไทย | English | Trigger | หน่วย | ราคา | VAT ที่โค้ดเขียนวันนี้ | ยอดชำระ |
|---|---|---|---|---|---|---|---|
| `SUBS-PREMIUM-M` | แพ็กเกจพรีเมียม รายเดือน | Premium subscription, monthly | `POST /api/subscription/orders` | ต่อองค์กร ต่อเดือน | 990 | **0** | 990 |
| `SUBS-PREMIUM-Y` | แพ็กเกจพรีเมียม รายปี | Premium subscription, yearly | เส้นทางเดียวกัน | ต่อองค์กร ต่อปี | 9,900 | **0** | 9,900 |
| `SUBS-ENTERPRISE-M` | แพ็กเกจองค์กร รายเดือน | Enterprise, monthly | เส้นทางเดียวกัน | ต่อองค์กร ต่อเดือน | — | — | **ไม่มีราคาในโค้ด** |
| `SUBS-ENTERPRISE-Y` | แพ็กเกจองค์กร รายปี | Enterprise, yearly | เส้นทางเดียวกัน | ต่อองค์กร ต่อปี | — | — | **ไม่มีราคาในโค้ด** |

- ราคา: `apps/backend/services/subscription/subscription-order-service.js:66-71` — `PREMIUM_MONTHLY: 990`, `PREMIUM_YEARLY: 9900`, `ENTERPRISE_MONTHLY: null`, `ENTERPRISE_YEARLY: null`
- ENTERPRISE โยน `CONTACT_SALES` ที่ `:78-84` → ในแคตตาล็อกต้องเป็นแถว `priceMode = 'QUOTE_ONLY'` **ที่ไม่มีแถวราคาเลย** ห้ามเดาตัวเลขใส่
- VAT = 0 บนใบแจ้งหนี้ subscription: `subscription-order-service.js:170` (`vat: 0`) — เทียบกับค่าธรรมเนียมคำขอที่คิด 7% ทุกใบ
- **ข้อนี้ยกเป็นคำถามถึง operator ไม่ใช่ finding**: ผมไม่พบคำวินิจฉัยใดครอบคลุม subscription ทั้งทางเก็บและทางไม่เก็บ ภายใต้ตรรกะ W14 (บริษัทเดียว ขายบริการทั้งก้อน) การไม่เก็บ VAT ค่าสมาชิกดูขัดกัน แต่ **ผมจะไม่ใส่ VAT ลงไปเอง** — แคตตาล็อกจึงตั้งฟิลด์ `vatTreatment` ให้สองแถวนี้เป็น `AS_STORED` (ลอกตามที่โค้ดทำวันนี้ = 0) และมี TODO ผูกกับคำสั่ง operator

### 2.5 SKU ตระกูลที่ 3 — รายการปรับปรุงที่เจ้าหน้าที่พิมพ์ยอดเอง

| รหัส SKU | ชื่อไทย | English | Trigger | หน่วย | ราคา |
|---|---|---|---|---|---|
| `ADJ-DEBIT` | รายการเพิ่มหนี้ (ระบุยอดโดยเจ้าหน้าที่) | Debit note line, operator-keyed | `POST` route ใบเพิ่มหนี้ โดย `ACCOUNT_PLATFORM`/`ADMIN` | ต่อรายการ | **ไม่มีสูตร** — `subtotal`/`vat` เป็นพารามิเตอร์ที่ผู้เรียกส่งมา |

- reason codes: `apps/backend/services/debit-note-service.js:68-72` — `ADDITIONAL_CHARGE`, `CORRECTION`, `LATE_FEE`
- ตรวจยอดแค่ว่าไม่ติดลบ/ไม่เป็นศูนย์: `debit-note-service.js:188-201`
- **`LATE_FEE` เป็นแค่ป้ายเหตุผล ไม่ใช่ค่าปรับที่คำนวณได้** ไม่มีอัตรา ไม่มี grace period ไม่มีการนับวันที่ไหนในระบบ ทางเดินของงานเลยกำหนดชำระเป็นแบบ **ไม่แตะเงิน** คือปิดคำขอทิ้ง (`apps/backend/config/business-rules.js:296` `PAYMENT_ABANDONMENT_CLOSE_CALENDAR_DAYS: 30`) → **ห้ามออก SKU ค่าปรับล่าช้าจนกว่าจะสร้างตัวเก็บเงินก่อน**

### 2.6 สิ่งที่ **ปฏิเสธไม่ให้เป็น SKU** (และเหตุผล)

| ตัวเลขในโค้ด | ที่อยู่ | ทำไมไม่ให้เป็น SKU |
|---|---|---|
| `expediteFee: 10000` | `apps/backend/routes/api/finance/pricing.js:210` | ประกาศออก public API แต่ไม่มี code path ใดเก็บเงินได้ ความเห็นบรรทัด 208-209 ยอมรับเองว่าไม่มี fee-table entry |
| `URGENT_PROCESSING_FEE: 3000` | `apps/backend/config/payment-fees.js:37` | ค่าเร่งด่วนตัวที่สอง คนละราคากับข้างบน ไม่มีผู้อ่าน |
| `RE_SUBMISSION_FEE: 5000` | `apps/backend/config/payment-fees.js:36` และซ้ำที่ `business-rules.js:258-260` | ประกาศสองที่ ไม่มีผู้อ่าน มี test ในบ้านเรียกมันเองว่า dead |
| `FEE_PER_APPLICATION = 30000` | `apps/backend/routes/api/applications/application-bundles.js:49` | เป็น `pricingPreview` ที่แสดงผลอย่างเดียว ข้ามเครื่องคิดค่าธรรมเนียม และ **ต่ำกว่ายอดจริง 5,310/scope** |
| `CULTIVATION_FEE_PER_METHOD` (30,000) บน wizard | `apps/web-app/src/constants/fees.ts:91` → `.../plant-selection-step.tsx:140` | แสดง state fee ล้วน ไม่รวม platform + VAT ให้ชาวไร่ดูตอนเลือกจำนวน scope |
| BT11 / BT13 (50,000) | ลบไปแล้ว — `apps/backend/config/business-rules.js:95` | ไม่มีเหลือ ยืนยันด้วยการเปิดไฟล์ |

ทั้งหกรายการต้อง **เลือกอย่างใดอย่างหนึ่ง: สร้างตัวเก็บเงินจริง แล้วค่อยออก SKU หรือลบทิ้งแบบ BT11/BT13** ห้ามยกขึ้นชั้นวางราคาโดยไม่มีเครื่องคิดเงินอยู่ข้างหลัง

---

## 3. SKU ปรากฏบนเอกสารอย่างไร

หลักร่วมสามใบ: **1 SKU = 1 บรรทัด**, `จำนวน = scopeCount`, `ราคา/หน่วย = ค่าบริการต่อ scope (state + platform, ก่อน VAT)`, `จำนวนเงิน = จำนวน × ราคา/หน่วย`, **VAT อยู่ในบล็อกยอดรวม แยกให้ชัดตาม ม.86/4(6)**

รหัส SKU พิมพ์เป็น **คอลัมน์เสริม** ข้างคำอธิบายภาษาไทย — **ห้ามใช้แทนคำอธิบาย** เพราะ ม.86/4(5) บังคับ ชื่อ/ชนิด/ประเภท/ปริมาณ/มูลค่า และ ป.86/2542 ข้อ 9(1) ให้ทางออกเป็น "เอกสารแนบ" ไม่ใช่ "รหัส" (รหัสสินค้าเป็นการควบคุมภายใน ไม่ใช่ข้อกำหนดตามกฎหมาย)

### 3.1 ใบเสนอราคา (ใบเสนอราคา / quotation.html)

ตารางวันนี้มี 6 คอลัมน์: `ลำดับที่ | รายการ | จำนวน | หน่วย | ราคา/หน่วย | จำนวนเงิน (บาท)` (`apps/backend/services/pdf/templates/quotation.html:110-115`)

ตัวอย่างคำขอใหม่ 3 scopes:

```
ลำดับ  รหัส          รายการ                                        จำนวน  หน่วย  ราคา/หน่วย   จำนวนเงิน
 1     GACP-NEW-P1   ค่าตรวจสอบเอกสาร คำขอใหม่ (งวดที่ 1)              3    ระบบปลูก    5,500.00    16,500.00
                     ├ พืช: กัญชา · ระบบปลูก: OUTDOOR, GREENHOUSE, INDOOR
                     └ ราคาเต็ม 5,000 + ค่าแพลตฟอร์ม 10% 500 ต่อระบบ
 2     GACP-NEW-P2   ค่าตรวจประเมินพื้นที่ คำขอใหม่ (งวดที่ 2)           3    ระบบปลูก   27,500.00    82,500.00
                     └ ราคาเต็ม 25,000 + ค่าแพลตฟอร์ม 10% 2,500 ต่อระบบ

                                          ค่าบริการ                              99,000.00
                                          ภาษีมูลค่าเพิ่ม 7%                       6,930.00
                                          ยอดรวมทั้งสิ้น                         105,930.00
        แคตตาล็อกราคา: PRICEBOOK-2026-001 (มีผล 2026-08-23)   ยืนราคาถึง: 2026-09-22
```

กระทบยอด: 16,500 + 82,500 = 99,000 ; VAT = round(99,000 × 0.07) = 6,930 ; รวม 105,930 = 17,655 + 88,275 ✓ ตรงกับผลรันจริง

**สิ่งที่เปลี่ยนจากของเดิม 3 อย่าง**
1. วันนี้ `จำนวน` ถูก hardcode เป็น `'1'` และ `หน่วย` เป็น `'คำขอ'` (`apps/backend/services/pdf/invoice-template-service.js:1030-1031`) แล้วออกบรรทัดละ 1 ระบบปลูก — เปลี่ยนเป็น 1 บรรทัดต่อ SKU โดยใส่ `scopeCount` ลงช่องจำนวนจริง ๆ (แก้ช่อง "ปริมาณ" ตาม ม.86/4(5) ไปในตัว)
2. บล็อกยอดรวมแบบ W14 มีอยู่แล้วในโค้ด (`invoice-template-service.js:190-227` `buildQuotationTotalsRowsHtml` ออก ราคาเต็ม/ค่าแพลตฟอร์ม 10%/ค่าบริการ/VAT 7%/ยอดรวม) แต่ **เป็น dead code** — `quotation.html` ไม่มี `{{TOTALS_ROWS_HTML}}` เลย และ `generateQuotationPdf` ไม่เคยเซ็ตค่าให้ → ต้องต่อสายเข้ากับ template
3. เพิ่มบรรทัด footer ระบุ **รหัสแคตตาล็อกและวันมีผล** — นี่คือสิ่งที่ทำให้ "ราคานี้มาจากไหน" ตอบได้ในปีหน้า

### 3.2 ใบวางบิล / ใบแจ้งหนี้ (invoice.html)

ตารางวันนี้ 5 คอลัมน์: `# | รายการ / Description | จำนวน Qty | ราคา/หน่วย Unit Price | มูลค่า Total` (`apps/backend/services/pdf/templates/invoice.html:496-500`)

```
 #   รหัส          รายการ                                        จำนวน   ราคา/หน่วย    มูลค่า
 1   GACP-NEW-P2   ค่าตรวจประเมินพื้นที่ คำขอใหม่ (งวดที่ 2)          3     27,500.00   82,500.00
                   └ คำขอเลขที่ APP-... · ฟาร์ม ... · 3 ระบบปลูก

                                    ค่าบริการ / Service fee              82,500.00
                                    ภาษีมูลค่าเพิ่ม 7% / VAT              5,775.00
                                    ยอดที่ต้องชำระทั้งสิ้น                88,275.00
```

**สิ่งที่เปลี่ยน**: วันนี้ `buildItemsRows` พิมพ์บรรทัดเดียวเสมอ โดย `<td class="r">1</td>` ตายตัว และเอา `subtotal` ทั้งก้อนมาเป็นราคา/หน่วย (`invoice-template-service.js:352-359`) → ฟาร์ม 3 ระบบเลยพิมพ์ "จำนวน 1 × 82,500" แทน "3 × 27,500" ตัวเลข `perScope` ถูกคำนวณไว้แล้วที่ `:344` แต่ถูกส่งไปโชว์ในบล็อกข้อความเสริมแทนที่จะลงช่องจำนวน — SKU + quantity แก้ช่องนี้พอดี

**และที่สำคัญกว่า**: วันนี้บรรทัดบนใบวางบิลของรางเช็คเอาต์อ่านไม่รู้เรื่องเลย เพราะ `serviceType` ถูกเขียนเป็น `CERTIFICATION_CHECKOUT_${milestone}` (`apps/backend/services/checkout/stripe-checkout-service.js:171`) ซึ่งไม่มีใน map ที่ `invoice-template-service.js:261-277` → ตกไปที่ fallback `'ค่าธรรมเนียม GACP'` ที่ `:276` **ชาวไร่ได้ใบวางบิลที่ไม่บอกว่าเป็นงวดไหน** — `skuCode` เป็น key ที่แม่นกว่า `serviceType` สำหรับหาคำอธิบาย เพราะมันคือรหัสของสิ่งที่ขาย ไม่ใช่รหัสของ route

### 3.3 ใบเสร็จรับเงิน (receipt.html)

คอลัมน์เหมือนใบวางบิลทุกช่อง (`apps/backend/services/pdf/templates/receipt.html:268-272`) และใช้ `buildItemsRows(invoice)` ตัวเดียวกัน (`invoice-template-service.js:689`) → SKU line ลงตัวเองอัตโนมัติเมื่อแก้ที่ `buildItemsRows` ที่เดียว

ต่างที่บล็อกยอดรวมพิมพ์ "ยอดที่รับชำระทั้งสิ้น" แทน "ยอดที่ต้องชำระทั้งสิ้น" (`invoice-template-service.js:159-161`)

**กับดักที่ต้องปิดพร้อมกัน**: `generateReceiptPdf` เลือก template จาก substring — `isStateFee = serviceType.includes('STATE_FEE')` แล้วสลับไปใช้ `government-revenue-receipt.html` พร้อมข้อความ `VAT_TEXT = 'ยกเว้น / Exempt'` (`invoice-template-service.js:638, 691, 721`) ตราบใดที่รางเดิมยังสร้างใบแจ้งหนี้ฝั่ง STATE อยู่ (`apps/backend/services/application-service/application-phase-invoice-methods.js:436-459` เรียก `_ensurePhaseInvoiceComponent` สองครั้ง STATE/PLATFORM) ระบบจะยังออกใบเสร็จ "ยกเว้น VAT" ให้ยอดที่ถูกเก็บ VAT ไปแล้ว **แคตตาล็อกไม่แก้เรื่องนี้ให้ — ต้องแก้แยกใบ และควรแก้ก่อน**

### 3.4 ตารางแม็พ SKU → คำอธิบายที่พิมพ์

| SKU | คำอธิบายบนเอกสาร (ไทย) | English (สำหรับ export/ผู้สอบบัญชี) | หน่วยที่พิมพ์ |
|---|---|---|---|
| `GACP-NEW-P1` | ค่าตรวจสอบเอกสาร คำขอใหม่ (งวดที่ 1) | Document review fee — new application, instalment 1 | ระบบปลูก |
| `GACP-NEW-P2` | ค่าตรวจประเมินพื้นที่ คำขอใหม่ (งวดที่ 2) | Field audit fee — new application, instalment 2 | ระบบปลูก |
| `GACP-RENEW` | ค่าต่ออายุใบรับรองมาตรฐาน GACP | Certificate renewal fee | ระบบปลูก |
| `SUBS-PREMIUM-M` | ค่าบริการแพ็กเกจพรีเมียม (รายเดือน) | Premium subscription — monthly | เดือน |
| `SUBS-PREMIUM-Y` | ค่าบริการแพ็กเกจพรีเมียม (รายปี) | Premium subscription — yearly | ปี |
| `ADJ-DEBIT` | รายการเพิ่มหนี้ตามใบเพิ่มหนี้ | Debit note adjustment | รายการ |

หมายเหตุที่ต้องเขียนไว้: `GACP-RENEW` ถูกยัดลงช่อง `PHASE_2` ในโครงข้างล่าง (`apps/backend/services/quotation-service.js:271-299` และ `fee-service.js:250-258` ที่ส่ง `phase:'PHASE_2'`) ทำให้ตัวสร้างข้อความเสริมพิมพ์ "งวดที่ 2 · ค่าตรวจประเมินพื้นที่" ทับลงบนเอกสารต่ออายุ (`apps/backend/services/pdf/product-detail-builder.js:32-35`) — **`skuCode` ต้องเป็นตัวชี้ขาดข้อความ ไม่ใช่ `phase`** นี่คือเหตุผลเชิงปฏิบัติข้อหนึ่งที่ต้องมี SKU

---

## 4. แม็พลงตารางที่มีอยู่ + schema change แบบ expand-before-contract

### 4.1 ของที่มีอยู่แล้ว และรับได้แค่ไหน

| สิ่งที่ต้องเก็บ | คอลัมน์ที่มีอยู่ | รับได้ไหม |
|---|---|---|
| รหัส SKU บนบรรทัด | `invoice_line_items.code` — `String` NOT NULL ไม่มี CHECK ไม่มี FK (`apps/backend/prisma/schema/billing.prisma:174`) | **ใช้ได้เลย** — แต่ปัจจุบันเป็น free text ที่มีผู้เขียน 2 รายคนละ vocabulary |
| จำนวน scope | `invoice_line_items.quantity Int @default(1)` (`billing.prisma:177`) | **ใช้ได้เลย** — วันนี้เป็น 1 บน 100% ของแถวจริง |
| ราคาต่อหน่วย | `invoice_line_items.unitPrice Decimal(15,2)` (`billing.prisma:184`) | ใช้ได้ |
| แยก state/platform ของบรรทัด | **ไม่มี** | ต้องเพิ่ม |
| เวอร์ชันราคาที่เอกสารใช้ | **ไม่มีที่ไหนเลยทั้งฐานข้อมูล** | ต้องเพิ่ม |
| ตารางแคตตาล็อก/ราคา | **ไม่มี** — ไม่มีตาราง product / price-book / fee-catalogue ในฐานข้อมูล | ต้องสร้าง |
| ราคาที่แช่แข็งของใบเสนอราคา | `quotations.installments Json?` (`billing.prisma:747`) เก็บ `{phase, amount, stateAmount, platformAmount, vatAmount, scopeCount}` (`quotation-service.js:333-339`) | **ใกล้เคียงที่สุดที่มี** — แต่ key เป็น phase ไม่ใช่ SKU และไม่มีเวอร์ชันราคา |

vocabularies ที่ชนกันอยู่แล้ว 4 ชุด (ต้องประกาศให้ชัดว่า SKU มาแทนหรือมา alias ตัวไหน มิฉะนั้นกลายเป็นชุดที่ 5):
1. คอมเมนต์ใน schema: `"DOC_REVIEW", "FIELD_AUDIT", "PLATFORM_FEE", "VAT"` (`billing.prisma:174`) — **เป็นนิยายทั้งหมด ไม่มีในข้อมูลจริงยกเว้น `PLATFORM_FEE`**
2. ผู้เขียน A (เช็คเอาต์): `'DTAM_FEE' / 'PLATFORM_FEE' / 'PLATFORM_VAT'` (`stripe-checkout-service.js:189, 199, 209` ในบล็อก `:184-220`)
3. ผู้เขียน B (phase mint): ต่อสตริงตอนเขียน `` code: `${normalizedPhase}_${normalizedComponent}` `` และ description ภาษาอังกฤษ `` `${normalizedPhase.replace('_',' ')} ${normalizedComponent.toLowerCase()} fee` `` (`application-phase-invoice-methods.js:108-111`)
4. `invoice-issuers.js:225-230`: `PHASE_1_STATE_FEE / PHASE_1_PLATFORM_FEE / PHASE_2_STATE_FEE / PHASE_2_PLATFORM_FEE`

**คำประกาศ**: SKU มาแทนชุด 1–3 บน *แถวใหม่* และ **alias** ชุดเดิมสำหรับแถวเก่า ส่วนชุด 4 (`serviceType`) **ไม่แตะ** — เพราะมันเป็น dedup key จริง ๆ (partial unique index `uniq_invoice_app_service_active` บน `(applicationId, serviceType)`) และมี substring match ที่คุมการลง journal อยู่ (`stripe-checkout-service.js:169-171` เตือนไว้เองว่าห้ามให้สตริงมีคำว่า `STATE_FEE` ไม่งั้น issuer พลิกเป็น DTAM แล้ว journal entry ถูกข้าม)

### 4.2 EXPAND — ระยะที่ 1 (เพิ่มอย่างเดียว ไม่ลบ ไม่แก้พฤติกรรม)

**ตารางใหม่ 2 ตาราง** (String + CHECK ตามแบบของบ้าน ไม่มี Prisma enum ทั้ง repo — ยืนยันด้วย `grep -c '^enum ' *.prisma` ไม่มีไฟล์ไหนได้ค่าบวก และเหตุผลบันทึกไว้ที่ `apps/backend/shared/checkout-status.js`)

```prisma
/// แคตตาล็อกสินค้า/บริการ — "ขายอะไร" ไม่มีราคาอยู่ในนี้เลย
model FeeSku {
  code           String   @id                     // 'GACP-NEW-P1' — speaking code
  shortCode      String?  @unique                 // 'N1' — alias สำหรับพูดปากเปล่าเท่านั้น
  nameTH         String                           // พิมพ์บนเอกสารตาม ม.86/4(5)
  nameEN         String
  unit           String                           // 'SCOPE' | 'MONTH' | 'YEAR' | 'ITEM'
  unitLabelTH    String                           // 'ระบบปลูก' | 'เดือน' | 'ปี' | 'รายการ'
  family         String                           // 'CERTIFICATION' | 'SUBSCRIPTION' | 'ADJUSTMENT'
  priceMode      String                           // 'CATALOGUE' | 'QUOTE_ONLY' | 'OPERATOR_KEYED'
  vatTreatment   String                           // 'STANDARD_7' | 'AS_STORED'
  isActive       Boolean  @default(true)
  legacyCodes    String[]                         // ['DTAM_FEE','PHASE_2_STATE'] — สำหรับอ่านแถวเก่า
  createdAt      DateTime @default(now())
  prices         FeeSkuPrice[]
  @@map("fee_skus")
}

/// แถวราคาแบบมีวันที่ — ไม่เคย UPDATE ขึ้นราคา = INSERT แถวใหม่
model FeeSkuPrice {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  skuCode        String
  sku            FeeSku   @relation(fields: [skuCode], references: [code])
  versionNo      Int                              // 1, 2, 3 … ต่อ SKU
  effectiveFrom  DateTime @db.Timestamptz(6)
  effectiveTo    DateTime? @db.Timestamptz(6)     // null = เวอร์ชันที่ใช้อยู่
  stateRate      Decimal  @db.Decimal(15, 2)      // ราคาเต็มต่อหน่วย
  platformRate   Decimal  @db.Decimal(6, 4)       // 0.1000
  vatRate        Decimal  @db.Decimal(6, 4)       // 0.0700
  currency       String   @default("THB")
  pricebookRef   String                           // 'PRICEBOOK-2026-001' — พิมพ์บนเอกสาร
  authorityRef   String                           // 'HARNESS_LOG.md@c28355ea' อ้างคำสั่ง operator
  publishedBy    String
  createdAt      DateTime @default(now())
  @@unique([skuCode, versionNo])
  @@index([skuCode, effectiveFrom])
  @@map("fee_sku_prices")
}
```

CHECK ที่ผูกใน migration (แบบ String + CHECK ของบ้านนี้):
- `fee_skus_unit_check`: `unit IN ('SCOPE','MONTH','YEAR','ITEM')`
- `fee_skus_price_mode_check`, `fee_skus_family_check`, `fee_skus_vat_treatment_check` ทำนองเดียวกัน
- `fee_sku_prices_window_check`: `effectiveTo IS NULL OR effectiveTo > effectiveFrom`
- **partial unique** `fee_sku_prices_one_open_per_sku` บน `(skuCode)` `WHERE effectiveTo IS NULL` — เปิดค้างได้เวอร์ชันเดียวต่อ SKU (แบบเดียวกับ `checkout_orders_open_per_application_milestone_key` ที่ระบบใช้อยู่)
- `fee_sku_prices_no_overlap` — EXCLUDE constraint ด้วย `tstzrange(effectiveFrom, effectiveTo)` กัน 2 เวอร์ชันทับช่วงเวลากัน

**คอลัมน์ที่เพิ่ม (nullable ทั้งหมด — additive ล้วน)**

| ตาราง | คอลัมน์ใหม่ | เหตุผล |
|---|---|---|
| `invoice_line_items` | `skuCode text NULL` (FK ไป `fee_skus.code`) | รหัสจริง แทน free text |
| | `skuPriceVersionId uuid NULL` (FK ไป `fee_sku_prices.id`) | **หมุดเวอร์ชันราคา** |
| | `stateAmount Decimal(15,2) NULL` | ส่วนราคาเต็ม (ใช้กระทบยอด DTAM ไม่พิมพ์เป็นบรรทัดแยก) |
| | `platformAmount Decimal(15,2) NULL` | ส่วนแพลตฟอร์ม |
| `quotations` | `skuLines Json NULL` | `[{skuCode, priceVersionId, quantity, unitPrice, stateAmount, platformAmount, vatAmount, amount}]` |
| | `pricebookRef text NULL` | พิมพ์บน PDF ตอบคำถาม "ราคานี้มาจากไหน" |
| | `pricePinnedAt timestamptz NULL` | เวลาที่ปักหมุด (ไม่ใช่ `createdAt` เพราะอาจต่างกันได้ในอนาคต) |
| `invoices` | `skuCode text NULL` | SKU หลักของเอกสาร — **`serviceType` ไม่แตะ** เพราะเป็น dedup key + คุม journal |
| | `skuPriceVersionId uuid NULL` | หมุดที่คัดลอกมาจากใบเสนอราคา |
| `checkout_orders` | `skuCode text NULL`, `skuPriceVersionId uuid NULL` | รางเช็คเอาต์ต้องอ้างหมุดเดียวกัน ไม่งั้นสองรางบอกยอดไม่ตรงกัน |

**ไม่แตะในระยะนี้**: `checkout_orders.milestone` CHECK (`M1|M2` เท่านั้น) และคอลัมน์ `dtam_fee_amount / platform_fee_net / platform_fee_vat / platform_fee_gross` พร้อม CHECK สองตัว (`platform_fee_gross = net + vat`, `total = dtam + gross`) — ชื่อมันเป็นซากของโมเดลสองผู้ออก แต่เลข W14 ยังผ่าน CHECK ได้ (2,500 + 1,925 = 4,425 และ 25,000 + 4,425 = 29,425) **การเปลี่ยนชื่อคอลัมน์เงินเป็นงาน Tier C แยกใบ ไม่ปนกับงานนี้**

**Seed migration**: เขียนแถว `versionNo = 1` ให้ 3 SKU หลัก ด้วยค่าที่อ่านจาก `business-rules.js:46,48,83,85,94` ณ วันนี้ พร้อม `effectiveFrom` = วันที่ deploy, `authorityRef = 'HARNESS_LOG.md@c28355ea (W14) + @d1c33ea0 (ยืนยันตัวเลข)'` และ `pricebookRef = 'PRICEBOOK-2026-001'`

### 4.3 MIGRATE — ระยะที่ 2 (เขียนสองทาง อ่านทางเก่า)

1. Backfill `skuCode` บน `invoice_line_items` 48 แถวจาก `code` เดิมผ่าน `legacyCodes` — แต่ `skuPriceVersionId` ของแถวเก่า **ตั้งเป็น NULL ตลอดไป** ห้ามยัดหมุด v1 ให้ เพราะแถวเก่าทุกแถวคิดด้วยสูตรที่เลิกใช้แล้ว (checkout order ที่มีอยู่เป็น 5,535 / 27,675 ทั้งหมด ไม่ใช่ 5,885 / 29,425) การปักหมุด v1 ให้มันจะเป็นการโกหกว่าราคานั้นมาจากแคตตาล็อกนี้
2. ผู้เขียนทั้งสองราย (`stripe-checkout-service.js:184-220` และ `application-phase-invoice-methods.js:70-116`) เขียน **ทั้ง** `code` เดิม **และ** `skuCode` + `skuPriceVersionId` + `stateAmount` + `platformAmount`
3. `fee-service` เพิ่มทางเข้าใหม่ `resolveSkuPrice(skuCode, asOf)` ที่อ่านจากตาราง — โดย **ยังคง** ฟังก์ชันเดิมไว้ครบ อ่านจาก `FEES` เหมือนเดิม
4. probe ใหม่ (agent เขียนได้ตาม L6 ถ้ามี `--selftest`): `sku-catalogue-parity` — ยืนยันว่า `resolveSkuPrice` วันนี้ ให้เลขเท่ากับ `calculateApplicationFees` ทุก scopeCount 1–10 ต่างแม้บาทเดียว = fail

### 4.4 CONTRACT — ระยะที่ 3 (หลัง drain, operator merge ทุกใบ)

1. สลับผู้อ่าน: PDF/quotation/checkout อ่านจาก `skuPriceVersionId` ที่ปักไว้ **แทน** การคำนวณสด (แก้ `invoice-template-service.js:995` และ `quotations.js:159-162`)
2. `business-rules.js` `FEE_DEFAULTS` และ `loadFeesFromSystemConfig` **หยุดถูกอ่านบนเส้นทางเงิน** — เหลือเป็นค่าที่ migration ใช้ seed เท่านั้น พร้อม boot assertion: ทุก SKU ที่ `isActive` ต้อง resolve เวอร์ชันเปิดได้ ไม่งั้น refuse to serve money routes (ตาม P5 ห้าม fallback เงียบ)
3. หยุดเขียนสามบรรทัด `DTAM_FEE / PLATFORM_FEE / PLATFORM_VAT` — เขียนบรรทัดเดียวต่อ SKU
4. ตั้ง `skuCode` เป็น NOT NULL **เฉพาะแถวที่สร้างหลังวัน cutover** ผ่าน partial CHECK (`createdAt >= cutover → skuCode IS NOT NULL`) ไม่ใช่ NOT NULL ทั้งคอลัมน์

**สิ่งที่ไม่ contract เด็ดขาด**: ห้ามลบ/แก้แถว `invoice_line_items`, `invoices`, `checkout_documents` เดิม ม.87/3 บังคับเก็บใบกำกับภาษีและเอกสารประกอบ **ไม่น้อยกว่า 5 ปี** และ +2 ปีถ้าเลิกกิจการ — contract ในงานนี้แปลว่า "หยุดเขียนของเก่า" ไม่ใช่ "ลบของเก่า"

---

## 5. ราคาเปลี่ยนตอนที่ใบเสนอราคาออกไปแล้ว — เกิดอะไรขึ้น

**คำตอบสั้น: ไม่เกิดอะไรกับใบที่ออกไปแล้ว เลย** และนี่คือเหตุผลหลักที่ต้องมีเวอร์ชัน

### 5.1 กลไก

1. **ขึ้นราคา = INSERT ไม่ใช่ UPDATE** — ปิด `effectiveTo` ของ v1 ที่เวลา T แล้ว INSERT v2 ที่ `effectiveFrom = T` ในทรานแซกชันเดียว EXCLUDE constraint กันช่วงทับ partial unique กันเปิดค้างสองเวอร์ชัน **ไม่มี UPDATE บนคอลัมน์ `stateRate` ตลอดกาล** — เพิกถอนราคาที่ประกาศผิดทำโดยตั้ง `effectiveTo = effectiveFrom` (หน้าต่างศูนย์) แล้วออกเวอร์ชันถัดไป ไม่ใช่ลบแถว
2. **ตอนออกใบเสนอราคา ปักหมุด `priceVersionId` ต่อบรรทัด** ลง `quotations.skuLines` พร้อม `pricebookRef` ที่พิมพ์บน PDF
3. **เอกสารทุกใบถัดจากนั้นคัดลอกหมุด ไม่ resolve ใหม่** — ใบวางบิล ใบเสร็จ ใบกำกับภาษี และ checkout order ทั้งหมดรับ `skuPriceVersionId` ต่อกันมา
4. **การ re-render PDF resolve ด้วย version id ไม่ใช่วันที่** → พิมพ์ซ้ำอีก 5 ปีก็ได้เลขเดิม ปิดข้อบกพร่องที่วันนี้ `invoice-template-service.js:995` คำนวณสดตอน render

### 5.2 ตารางผลลัพธ์ตามสถานการณ์

| สถานการณ์ | ผลลัพธ์ | เหตุผล |
|---|---|---|
| ราคาเปลี่ยน ใบเสนอราคายังไม่หมดอายุ ยังไม่จ่ายเลย | ใบเดิมคงราคาเดิมจนถึง `validUntil` | ปักหมุดแล้ว; `DEFAULT_VALIDITY_DAYS = 30` ที่ `apps/backend/services/quotation-service.js:115` |
| ราคาเปลี่ยน จ่ายงวด 1 แล้ว งวด 2 มาถึงทีหลัง | **งวด 2 คิดราคาเวอร์ชันเดิม** | ใบเสนอราคาใบเดียวถือทั้งสองงวด (`installments` มีทั้ง PHASE_1/PHASE_2 ที่ `quotation-service.js:336-340`) หมุดครอบทั้งตาราง — ห้ามให้ชาวไร่โดนราคาสองยุคในคำขอเดียว |
| ราคาเปลี่ยน ใบเสนอราคาหมดอายุแล้ว ยังไม่จ่าย | ออกใบใหม่ ปักหมุดเวอร์ชันปัจจุบัน ใบเก่าเป็น `EXPIRED` | สถานะ `EXPIRED` มีอยู่แล้วใน vocabulary (`quotation-service.js:87-95`) แต่ **วันนี้ไม่มีใครอ่าน `validUntil` ก่อน render ใหม่** → ต้องบังคับตอน convert เป็นใบแจ้งหนี้ |
| จำนวน scope เปลี่ยนหลังออกใบเสนอราคา | ไม่ใช่การเปลี่ยนราคา แต่เป็นข้อเท็จจริงทางการค้าใหม่ → **ออกใบเสนอราคาใหม่ ยกเลิกใบเดิม** | `quantity` เปลี่ยน ไม่ใช่ `unitPrice` — ปักหมุดเวอร์ชันเดิมได้ถ้ายังไม่หมดอายุ |
| ออกใบกำกับภาษีไปแล้วและราคาผิด | แก้ด้วย **ใบลดหนี้ (ม.86/10) / ใบเพิ่มหนี้ (ม.86/9)** ห้ามแก้ราคาย้อนหลัง | allocator มีอยู่แล้ว `CN-PRD` / `DN-PRD` (`receipt-numbering-service.js:74-75`) — แต่ `credit_notes` / `debit_notes` **ยังว่างเปล่า ไม่เคยถูกใช้จริงสักครั้ง** |
| ใบเสนอราคาที่ออกก่อนมีแคตตาล็อก (`skuPriceVersionId` = NULL) | ยึด `installments` ที่แช่ไว้เดิม ไม่ resolve แคตตาล็อก | ทางนี้ทำงานอยู่แล้ว: `getFrozenPhaseFees` + `_reconstructFrozenFromInstallments` (`quotation-service.js:366-423`) และ phase-invoice mint เคารพมันจริง (`application-phase-invoice-methods.js:403-419` log `[QUOTE_PRICE_DRIFT]`) |

### 5.3 สิ่งที่การออกแบบนี้ **ไม่** แก้ให้

- **รางเช็คเอาต์ยังไม่เคยอ่านราคาแช่แข็ง** — `getFrozenPhaseFees` มีผู้เรียกแค่ใน `quotation-service.js` และ `application-phase-invoice-methods.js` เท่านั้น ส่วน `stripe-checkout-service.js:63-69` เรียก `calculateApplicationFees` สดทุกครั้ง แคตตาล็อกจะไม่ช่วยอะไรเลยถ้าไม่ต่อสายให้ราง Stripe อ่านหมุดด้วย — **นี่เป็นเงื่อนไขบังคับของงาน ไม่ใช่ nice-to-have**
- **`validUntil` วันนี้เป็นข้อความประดับ** ไม่มี code path ใดตรวจก่อนคำนวณใหม่

---

## 6. สามข้อคัดค้านที่แรงที่สุดต่อการออกแบบนี้เอง

### คัดค้าน 1 — "สองตาราง + หกคอลัมน์ + EXCLUDE constraint เพื่อราคาแค่ 3 ตัวที่ไม่เคยเปลี่ยน มันเกินไป (YAGNI)"

**หนักแน่นตรงไหน**: มี SKU ที่เก็บเงินได้จริง 3 ตัว อัตราถูกตั้งโดยคำสั่งราชการที่เปลี่ยนไม่บ่อย ตอนนี้ `system_configs` ที่ขึ้นต้น `fee%` มี **ศูนย์แถว** ดังนั้นชั้น override ที่มีอยู่แล้วยังไม่เคยถูกใช้เลยแม้แต่ครั้งเดียว การเพิ่มโครงสร้างเพื่อรองรับสิ่งที่ยังไม่เกิดคือ ต้นทุนแน่นอน แลกกับประโยชน์ที่ยังไม่แน่

**คำตอบ**: ต้นทุนจริงไม่ได้อยู่ที่ "ราคาสามตัว" แต่อยู่ที่ **ราคาสามตัวถูกคำนวณใหม่ที่สามพื้นผิว โดยไม่มีใครรู้ว่าเอกสารที่ออกไปใช้ราคาอะไร** — `invoice-template-service.js:995` (render), `quotations.js:159-162` (ทุก GET), `stripe-checkout-service.js:63-69` (ตอนเก็บเงินจริง) และชั้น override ที่กลืน error เงียบ ๆ (`business-rules.js:153-155`) พร้อม override เหมาโหลทั้งก้อนที่ `pricing.js:229-230` (`const stored = await systemConfigService.getValue('pricing_fees'); const fees = stored || defaultFeesPayload();`) — แถว `pricing_fees` แถวเดียวเปลี่ยนราคาที่ประกาศต่อสาธารณะได้ทั้งชุด **โดยไม่ผ่านเครื่องคิดค่าธรรมเนียมเลย** นั่นคือช่องที่มีอยู่แล้ววันนี้ ไม่ใช่ความเสี่ยงสมมุติ

**สิ่งที่ยอมรับ**: ถ้า operator ต้องการฉบับย่อ ตัดได้ 2 อย่างโดยยังรักษาคุณสมบัติหลัก — (ก) รวม `fee_skus` เข้าเป็นคอลัมน์ metadata บน `fee_sku_prices` (เหลือตารางเดียว) และ (ข) ตัด EXCLUDE constraint เหลือ partial unique + application-level check **ห้ามตัด**: `skuPriceVersionId` บนเอกสาร กับกฎห้าม UPDATE แถวราคา เพราะสองข้อนี้คือทั้งหมดของการออกแบบ

---

### คัดค้าน 2 — "ปักหมุดเวอร์ชัน = แช่แข็งบั๊กด้วย"

**หนักแน่นตรงไหน**: วันนี้มีบั๊กที่ยังมีชีวิตอย่างน้อยสองตัวบนเส้นทางเก็บเงิน (สถานะ: static finding จากการอ่านโค้ด + รันฟังก์ชัน **ยังไม่มีการกดจริง** ตาม §2 ของ CLAUDE.md จึงเป็น PENDING ไม่ใช่ DONE):
- ต่ออายุที่จ่ายผ่านราง Stripe ถูกคิดเป็นเรต phase 2 — `stripe-checkout-service.js:63-69` เรียก `calculateApplicationFees` โดยไม่เช็ค `formData.renewalOf` เลย ขณะที่ `quotation-service.js:262-263` เช็ค และ renewal เกิดที่ `PENDING_AUDIT_FEE` ซึ่งอยู่ใน `PAYABLE_STATES.M2` (`stripe-checkout-service.js:41`) → คิด 29,425/scope แทน 35,310/scope
- `scopeCount` ยุบเหลือ 1 บนราง Stripe และ preview — `resolveCultivationScopeCount` อ่านเฉพาะ `options.scopeCount` (`fee-service.js:107-119`) แต่สองที่นั้นไม่ส่ง options มา (`stripe-checkout-service.js:65-69`, `apps/backend/routes/api/preview/preview-utils.js:331-334`)

ถ้าปักหมุดตอนนี้ เอกสารก็จะปักหมุดตัวเลขผิด **แล้วยิ่งแก้ยากขึ้น** เพราะกลายเป็นราคาที่บันทึกไว้อย่างเป็นทางการ

**คำตอบ 2 ชั้น**:
1. **เชิงหลักการ ข้อคัดค้านนี้กลับด้านตัวเอง**: เอกสารภาษีที่ออกไปแล้วซึ่งมีตัวเลขผิด **ต้องแก้ด้วยใบลดหนี้/ใบเพิ่มหนี้ (ม.86/9, ม.86/10) เท่านั้น ไม่ใช่การเปลี่ยนตัวเลขบนเอกสารเดิมเงียบ ๆ** ระบบที่คำนวณสดทุกครั้งจะ "แก้" ตัวเองโดยไม่มีร่องรอย ซึ่งแย่กว่าการแช่แข็งความผิด — เพราะยอดที่รับเงินมาแล้วกับยอดที่พิมพ์ออกมาไม่ตรงกัน โดยไม่มีเอกสารตัวไหนบันทึกส่วนต่าง และวันนี้ `credit_notes` / `debit_notes` **ว่างเปล่าทั้งสองตาราง** แปลว่ากลไกแก้ที่ถูกต้องยังไม่เคยถูกใช้เลย
2. **เชิงลำดับงาน ยอมรับตรง ๆ ว่านี่บังคับลำดับ**: แคตตาล็อกต้อง **ขึ้นทีหลัง** การแก้บั๊กสองตัวข้างบน ไม่งั้น `versionNo = 1` จะปักหมุดเลขที่รางหนึ่งเก็บผิด ลำดับที่เสนอ — (1) กดจริงเก็บ view-pack ยืนยันบั๊กสองตัว → (2) แก้ (Tier C, operator merge) → (3) EXPAND แคตตาล็อก → (4) MIGRATE → (5) CONTRACT **การพลิกลำดับ 2 กับ 3 คือความผิดพลาดที่แพงที่สุดของงานนี้**

---

### คัดค้าน 3 — "SKU ที่ระดับ 'เหตุการณ์เก็บเงิน' ทำให้แยก state/platform หายไปจากบรรทัด แล้วจะกระทบยอดกับ DTAM ยังไง"

**หนักแน่นตรงไหน**: ผังบัญชียังผูกกับโมเดลเดิมแน่นมาก — ค่าธรรมเนียมรัฐลงเป็น **หนี้สิน** ไม่ใช่รายได้ (`journal_lines` บัญชี `2151-001 เจ้าหนี้ กรมการแพทย์แผนไทยฯ (legacy)` ฝั่ง DTAM 19 บรรทัด) และมีบัญชีรายได้เดียวคือ `4110-001 รายได้ค่าบริการแพลตฟอร์ม` ที่รับเฉพาะส่วนแพลตฟอร์ม ยิ่งกว่านั้น `JournalLine.taxableAmount` เขียนคำอธิบายไว้ว่าฐาน VAT คือ "the platform-fee subtotal, NOT the total cash captured" (`billing.prisma:598-603`) ถ้าบรรทัดสินค้ารวม state กับ platform เป็นก้อนเดียว การ post journal ก็ต้องแยกกลับเองอยู่ดี

**คำตอบ**: การออกแบบไม่ได้ทิ้งการแยก — มันย้ายที่ **`stateAmount` และ `platformAmount` เป็นคอลัมน์ของบรรทัด SKU** เก็บครบทุกบาท เพียงแต่ไม่พิมพ์เป็นบรรทัดขายแยกบนกระดาษที่ยื่นให้ชาวไร่ เพราะหลัง W14 ชาวไร่ซื้อ *บริการหนึ่งอย่าง* จากบริษัทหนึ่งราย ตัวกระทบยอดกับ DTAM อ่านผลรวมของ `stateAmount` ได้ตรงกว่าเดิมด้วยซ้ำ — วันนี้ต้องไปเดาจาก `code = 'DTAM_FEE'` ซึ่งเป็น free text ที่ไม่มี CHECK ไม่มี FK และมีผู้เขียนสองรายคนละคำศัพท์

**และคำเตือนที่มาคู่กัน**: ผังบัญชีข้างบนคือ **money logic** — L3 ห้าม agent แตะ เอกสารนี้จึงแค่ชี้ว่ามันขัดกับคำวินิจฉัย W14 (ถ้าบริษัทขายค่าบริการทั้งก้อน ส่วน state ก็ไม่ใช่หนี้สิน pass-through อีกต่อไป) การจัดผังบัญชีใหม่เป็นงานแยกใบ ต้อง operator ตัดสิน และ **ห้ามพ่วงมากับ SKU** — แคตตาล็อกออกแบบให้เป็นกลางต่อผลการตัดสินนั้น เพราะมันเก็บ `stateAmount`/`platformAmount` ไว้ให้ทั้งสองแบบใช้ได้

---

## 7. สิ่งที่ยังไม่ได้พิสูจน์ (ไม่เติมช่องว่าง)

1. **HEAD ไม่ตรงโจทย์** — โจทย์ระบุ `6248a0d1`; tree อยู่ที่ `bf50c143` ทุก file:line คือของ `bf50c143`
2. **ไม่ได้รันชุดทดสอบ ไม่ได้แตะฐานข้อมูล ไม่ได้ render PDF สักใบ** หลักฐานที่รันจริงมีชิ้นเดียวคือการเรียก `fee-service.js` ตรง ๆ ที่แนบไว้ต้นเอกสาร
3. **บั๊กสองตัวใน §6 คัดค้าน 2 เป็น static finding** ยังต้องการการกดจริง + view-pack ก่อนจะกลายเป็นงานแก้
4. **VAT ของ subscription เป็นคำถาม ไม่ใช่ finding** — ไม่พบคำวินิจฉัยครอบคลุมทั้งทางเก็บและไม่เก็บ
5. **ไม่ได้อ่านฝั่งหน้าจอว่า render `line.code` หรือสร้าง label ไทยของตัวเอง** ถ้า FE มี vocabulary ที่สี่ ชุด SKU จริงจะใหญ่กว่าที่นับไว้
6. **ไม่ได้เปิด `checkout_documents.payload` หรือ template ที่ render มัน** จึงไม่ยืนยันว่าการเปลี่ยนคำอธิบายจะไปถึงไฟล์ PDF ที่ชาวไร่ได้จริง
7. **กฎการปัดเศษตามกฎหมายไทย: หาไม่เจอ** ไม่มีใน ม.86/4, ป.86/2542 หรือประกาศอธิบดีฯ ฉบับที่ 39 ที่อ่าน ห้ามเขียนกฎปัดเศษลง spec ว่าเป็นข้อกำหนดกฎหมาย — ในทางปฏิบัติไม่กัดอยู่แล้วเพราะทุกยอดลงตัวเป็นบาทถ้วน (`fee-service.js:136-142` อธิบายเหตุผลไว้เอง)
8. **ม.105/ม.105 ทวิ (ใบเสร็จรับเงิน) ยังไม่ได้เปิดจาก rd.go.th โดยตรง** ต้องตรวจก่อนพิมพ์ข้อความใดลง template
9. **ไม่ได้ผลิต diff** — L3 ผูกอยู่ ทุกข้อเสนอในเอกสารนี้ต้องเป็น Tier C ที่ operator merge

---

## SKU-CATALOGUE-DESIGN — 2026-08-23

Status: PENDING (spec เท่านั้น — ไม่มี probe ให้รัน ไม่มี diff ให้ merge)
Did:
- นิยาม SKU ที่เก็บเงินได้จริง 6 ตัว + ปฏิเสธ 6 ตัวเลขที่ไม่มีตัวเก็บเงิน — ทุกตัวอ้าง file:line ที่เปิดจริง
- ยืนยันตัวเลข 5,885 / 29,425 / 35,310 ต่อ scope ด้วยการรัน `fee-service.js` ใน session นี้ (output แนบต้นเอกสาร)
- เสนอสอง entity ใหม่ (`fee_skus`, `fee_sku_prices`) + คอลัมน์ additive แบบ expand → migrate → contract
Ratchet: ไม่แตะ `src/` — ไม่มีตัวเลข ratchet
Blocked: ต้องรอ operator 2 เรื่อง — (1) VAT ของ subscription (วันนี้ `vat: 0` ที่ `subscription-order-service.js:170`) (2) ยืนยันลำดับ "แก้บั๊กราง Stripe ก่อน แล้วค่อยปักหมุดเวอร์ชัน"
Next:
1. กดจริง + view-pack พิสูจน์บั๊ก renewal-ผ่าน-Stripe และ scopeCount ยุบเหลือ 1
2. แก้สองบั๊กนั้น (Tier C) ก่อนเขียนแถวราคา `versionNo = 1`
3. EXPAND migration + probe `sku-catalogue-parity` (พร้อม `--selftest` ตาม L6)
Evidence: `reports/sku/design-catalogue.md` (เอกสารนี้) · ผลรัน fee-service อยู่ในหัวเอกสาร
