# W12 — ต่ออายุ: จ่ายครั้งเดียว 30,000 ไม่ตรวจเอกสาร ไปนัดลงพื้นที่

## W12 — 2026-08-22
Status: PENDING (ยังไม่ commit ตามคำสั่ง — worktree `gacp-wt-renewal`, branch `fix/renewal-fee-30k`, rebase บน main 67ef3612 แล้ว)
Did:
- ค่าต่ออายุ 30,000 (ฐานก่อน VAT) มาจาก `config/business-rules.js` FEES.RENEWAL_PER_CERT แหล่งเดียว; API เสิร์ฟยอดที่ต้องชำระจริง 33,210 และบอกว่าเป็นการชำระครั้งเดียว
- คำขอต่ออายุเกิดที่ `PENDING_AUDIT_FEE` ข้ามค่าธรรมเนียมเอกสารและการตรวจเอกสารทั้งหมด พร้อมบันทึก provenance ทั้งบน formData และ audit trail
- ทุกหน้าที่แสดงค่าต่ออายุแสดงทั้งฐานและยอดที่ต้องชำระจริง ไม่มีหน้าไหนโชว์ 30,000 ลอย ๆ อีก
Ratchet: hardcode=30 todo=56 env-direct=122 dup-source=2 เท่ากับ baseline ทุกตัว
Blocked: -
Next: operator ตัดสิน §7 (proposal ฝั่ง checkout/invoice) และ §8 Q1-Q3
Evidence: `W12-RED.txt` `W12-RED-fe-display.txt` `W12-GREEN.txt` `W12-GREEN-fe.txt` `W12-GATES.txt`

---

## 0. มติที่ยึด และประวัติการกลับมติในวันเดียวกัน

วันที่ 2026-08-22 มีมติ 4 ครั้ง ทั้งหมดอยู่ใน `HARNESS_LOG.md` งานนี้ยึดฉบับสุดท้าย:

| commit | มติ | สถานะ |
|---|---|---|
| `2cd92de3` | ค่าต่ออายุ 30,000 · ต่ออายุข้ามการตรวจเอกสาร | ถูกกลับบางส่วน |
| `25ba0869` | กลับมติ: ต่ออายุเดินเส้นเดียวกับคำขอใหม่ | ถูกกลับอีกครั้ง |
| `ba66edbb` | 30,000 คือยอดก่อน VAT และก่อนค่าบริการแพลตฟอร์ม | ยังยืน |
| **`67ef3612`** | **"ต่ออายุ 30,000 ครั้งเดียว และไม่ตรวจเอกสาร นัดลงพื้นที่อย่างเดียว"** | **ยึดฉบับนี้** |
| `851fd516` | ยืนยันอีกครั้ง: 30,000 คือฐานก่อน VAT และแพลตฟอร์ม | ยึดด้วย |

สรุปมติที่ implement: **จ่ายครั้งเดียว ฐาน 30,000 · ไม่มีขั้นตรวจเอกสาร · เข้าขั้นนัดลงพื้นที่โดยตรง**

---

## 1. วิเคราะห์ state machine ก่อนเขียนโค้ด

### 1.1 เส้นทางเดิมของคำขอต่ออายุ (ก่อนงานนี้)

`renewal-service.js:294,308` สร้างคำขอเป็น `DRAFT` แล้วเดินครบทุกสถานะเหมือนคำขอใหม่
(`routes/api/applications/renewals.js:19-22` เขียนไว้ตรง ๆ ว่า "travels the SAME canonical workflow")
ต่างจากคำขอใหม่แค่ marker `formData.renewalOf`

สถานะทั้ง 20 ตัวและ edge ที่ถูกกฎหมายอยู่ที่ `services/workflow-transition-service.js:18-39` และ `:46-89`
map เป็นขั้น S0-S6 ตาม `reports/role-workflow-auditor/2026-08-06-reviewer.md:15-21`:

| ขั้น | สถานะ | ประตู |
|---|---|---|
| S0 | `DRAFT -> SUBMITTED` | HEALTH เดินเอง (`:100`) |
| S1 | `PENDING_DOC_FEE -> DOC_FEE_PAID` | **ประตูเงินที่ 1** webhook settle หรือ ACCOUNT อนุมัติสลิป (`:57`, `:106-110`) |
| S2 | `DOC_FEE_PAID -> ASSIGNED_FOR_REVIEW -> DOC_APPROVED` | **ตรวจเอกสาร** ต้องมี reviewer (`:59-62`) |
| S3 | `DOC_APPROVED -> PENDING_AUDIT_FEE -> AUDIT_FEE_PAID` | **ประตูเงินที่ 2** (`:63-68`) |
| S4 | `AUDIT_FEE_PAID -> AUDIT_CONFIRMED` | **นัดหมายลงพื้นที่** (`:69-70`) |
| S5 | `AUDIT_CONFIRMED -> AUDIT_PASSED -> APPROVED` | ตรวจฟาร์ม + ตัดสิน (`:70-75`) |
| S6 | `APPROVED -> CERTIFIED` | ออกใบรับรอง (`:76`) |

### 1.2 สถานะที่คำขอต่ออายุต้องเข้า และเหตุผลที่ไม่ใช่สถานะถัดไป

คิวนัดหมายลงพื้นที่คือ `AUDIT_FEE_PAID`:
`services/audit-scheduling-service.js:255-270` (`getSchedulingQueue` select ด้วยสถานะนี้) และ
`:450` (`assignAuditor` ปฏิเสธสถานะอื่นทั้งหมด) — นี่คือสถานะที่มติชี้ถึง

**แต่คำขอต่ออายุไม่ได้ถูกสร้างที่นั่น** เพราะคำขอจะไปถึง `AUDIT_FEE_PAID` ได้ทางเดียวคือ**เงินเข้าจริง**:
`checkout-settlement-service.js:45` map M2 -> `AUDIT_FEE_PAID` เมื่อ webhook ยืนยัน และ
`payment-slip-service.js:343` เมื่อเจ้าหน้าที่บัญชีอนุมัติสลิป
ถ้าสร้างคำขอต่ออายุลง `AUDIT_FEE_PAID` ตรง ๆ = พาคำขอผ่านประตูเงินฟรี ๆ ด้วยการเขียน string ลง column
ปลายทางคือใบรับรองที่ได้มาโดยไม่มีใครจ่ายเงิน

จึงเลือก **`PENDING_AUDIT_FEE`** ซึ่งเป็นประตูเงินที่อยู่ติดกับคิวนัดหมายพอดี
จากตรงนี้ path settlement เดิมพาต่อไป `AUDIT_FEE_PAID` เหมือนคำขอใหม่ทุกประการ
**ไม่มี edge ใหม่ ไม่แตะโค้ด settlement แม้บรรทัดเดียว (L3)**

### 1.3 ประตูที่ข้าม เทียบกับประตูที่ยังบังคับ

**ข้ามโดยนโยบาย** (บันทึกไว้ทั้งบน formData และ audit trail):
`SUBMITTED` · `PENDING_DOC_FEE` · `PHASE_1_SLIP_UNDER_REVIEW` · `DOC_FEE_PAID` ·
`ASSIGNED_FOR_REVIEW` · `DOC_APPROVED` — คือค่าธรรมเนียมเอกสาร และการตรวจเอกสาร

**ยังบังคับครบ:**

| ประตู | ที่ | หมายเหตุ |
|---|---|---|
| ประตูเงินที่ 2 | `checkout-settlement-service.js:45`, `payment-slip-service.js:343` | คำขอต่ออายุเริ่มตรงหน้าประตูนี้พอดี ไม่มีทางลัด |
| นัดหมายลงพื้นที่ | `audit-scheduling-service.js:255-270`, `:450` | scheduler หยิบงานเหมือนคำขอปกติ |
| ตรวจฟาร์มจริง + ตัดสิน | `AUDIT_CONFIRMED -> AUDIT_PASSED` | |
| หลักฐานตรวจหน้างานก่อนออกใบรับรอง | `services/onsite-evidence-gate.js:1-34` | fail-closed ภายใน `certificate-service.generateCertificate` ครอบทุก path ที่ mint ใบรับรอง |
| เจ้าของใบรับรองเท่านั้น | `renewal-service.js:241-243` | `FORBIDDEN_NOT_OWNER` 403 |
| ใบรับรองต้อง ACTIVE | `renewal-service.js:245-252` | `CERT_NOT_ACTIVE` 409 |
| ใบรับรองต้องยังไม่หมดอายุ | `renewal-service.js:254-262` | `CERT_ALREADY_EXPIRED` 409 |

### 1.4 สิ่งที่พบระหว่างพิสูจน์: `AUDIT_CONFIRMED` ไม่ใช่คอขวด

ตอนเขียนเทส "ต่ออายุต้องไปถึง CERTIFIED ไม่ได้ถ้าไม่ตรวจฟาร์ม" ตั้งสมมุติฐานว่าตัด `AUDIT_CONFIRMED`
ออกจากกราฟแล้ว `CERTIFIED` ต้องไปไม่ถึง **ผลคือไปถึงได้** เพราะ edge waiver-reopen
`EXPIRED -> CAR_PENDING` (`workflow-transition-service.js:88` มติ owner 2026-07-08) พาไป
`CAR_REVIEWING -> AUDIT_PASSED` โดยไม่ผ่าน `AUDIT_CONFIRMED` เลย

คอขวดจริงคือ **`AUDIT_PASSED`** (ตัดออกแล้ว `CERTIFIED` ไปไม่ถึง — พิสูจน์ใน `W12-RED.txt`)
และเข้าได้จาก `AUDIT_CONFIRMED` กับ `CAR_REVIEWING` เท่านั้น
⇒ **กราฟสถานะอย่างเดียวไม่การันตีว่ามีการตรวจหน้างานจริง** ตัวที่การันตีคือ `onsite-evidence-gate.js`
ซึ่งเป็นเหตุผลที่ประตูนั้นมีอยู่ เทสจึงปักทั้งสองอย่าง: คอขวด `AUDIT_PASSED` และการที่ gate ยังต่ออยู่กับ mint path

---

## 2. ค่าธรรมเนียม

### 2.1 แหล่งเดียว
```
config/business-rules.js  FEES.RENEWAL_PER_CERT = 30000   <- แหล่งเดียว (override: fee.renewal_per_cert)
        |
        +- modules/billing/internal/fee-service.js  FEE_RATES.RENEWAL_PER_CERT
        |        +- routes/api/finance/pricing.js
        |             renewalFee          = 30,000  (ฐานก่อน VAT)
        |             renewalTotalPerCert = 33,210  (ยอดที่ต้องชำระจริง)
        |             renewalChargeCount  = 1
        |                  +- GET /api/pricing/fees -> use-pricing.ts -> ทุกหน้าจอ
        |
        +- apps/web-app/src/constants/fees.ts  GACP_RENEWAL_FEE = 30_000  <- MIRROR (fallback)
                 GACP_RENEWAL_PAYABLE_TOTAL = withPlatformAndVat(GACP_RENEWAL_FEE)
```

30,000 -> 33,210 คำนวณด้วย `grossUpStateFee` ใน `pricing.js` ซึ่งเป็นสามบรรทัดเดียวกับ
`modules/billing/internal/fee-service.js:98-102` (`buildPhaseFee`) ที่ใบแจ้งหนี้จริงใช้:
`platform = round(state * 10%)` · `vat = round(platform * 7%)` · `total = state + platform + vat`
เทสเคส H เอาสูตรนี้ไปคำนวณ 5,000 และ 25,000 ซ้ำ แล้วต้องได้ 5,535 และ 27,675 ตรงกับที่ engine ให้ —
ถ้า engine เปลี่ยนสูตรเมื่อไหร่ เทสแดงทันที ไม่ใช่การเทียบกับเลขที่พิมพ์มือ

**ไม่ประกาศเลข 30,000 ซ้ำที่ไหนอีกเลย** เคส F เดินไฟล์ `.js` ทั้ง backend แล้วยืนยันว่า
มีแค่ `config/business-rules.js` ที่นิยามจำนวนเงินค่าต่ออายุได้

### 2.2 ทำไมคราวนี้ประกาศเป็นค่าคงที่ ทั้งที่รอบก่อนบอกว่าไม่ควร
รอบที่มติยังเป็น "สองเฟส" 30,000 มีค่าเท่ากับ PHASE1 + PHASE2 พอดี การประกาศแยกจึงเป็นเลขตัวที่สาม
ที่ลอยออกจากสองตัวที่มันประกอบขึ้นมาได้ **มติสุดท้ายเปลี่ยนเรื่องนี้**: ต่ออายุจ่ายครั้งเดียว
ไม่ได้เดินสองเฟส 30,000 จึงเป็นค่าธรรมเนียมของตัวเอง ที่ operator ขยับได้อิสระ
(ที่มันบังเอิญเท่ากับ 5,000 + 25,000 วันนี้ เขียนกำกับไว้ในโค้ดแล้วว่าเป็นความบังเอิญ ไม่ใช่นิยาม)

### 2.3 การแสดงผล: ไม่มีหน้าไหนโชว์ 30,000 ลอย ๆ อีก
ของเดิมทั้งสามหน้าโชว์ 30,000 เป็นยอดสุทธิ และใบเสนอราคายังเขียนกำกับว่า
`"(ราคารวมภาษีมูลค่าเพิ่ม)"` ซึ่งไม่จริงเลยทั้งประโยค

| หน้าจอ | เดิม | ใหม่ |
|---|---|---|
| `renewal/quotation-step.tsx` | 30,000 เป็น "รวมทั้งสิ้น" | ฐาน 30,000 + ค่าบริการและ VAT 3,210 = 33,210 |
| `renewal/invoice-step.tsx` | 30,000 เป็น "ยอดรวมที่ต้องชำระ" + ตัวอักษรไทย | 33,210 เป็นยอดที่ต้องชำระ + ตัวอักษรไทยตามยอดจริง + หมายเหตุว่าชำระครั้งเดียว |
| `renewal/payment-step.tsx` | `฿30,000` ใต้ "จำนวนเงินที่ต้องชำระ" | `฿33,210.00` พร้อมบรรทัดแยกฐานและส่วนเพิ่ม |

ทุกหน้าอ่านผ่าน `useRenewalFee()` (`hooks/use-pricing.ts`) ซึ่งคืนรูป `{ base, payable, chargeCount }`
เจตนาคือ**เข้าถึงฐานเดี่ยว ๆ ไม่ได้** ต้องได้ payable ติดมาด้วยเสมอ ค่ามาจาก API ก่อน
ถ้า API ยังไม่ตอบจึงใช้ค่าคงที่ที่ถูกล็อกไว้ให้เท่ากัน

คำที่ใช้ตามกฎ `thai-ui-copy`: ใช้ **คุณ** ไม่มี em dash เว้นวรรคไทย/อังกฤษ ("ก่อน VAT")
เลขจัดรูปด้วย formatter กลางที่มีอยู่แล้ว `formatCurrency` / `formatNumber` (`lib/utils.ts:63,72`) ไม่สร้างใหม่
token/primitive เดิมทั้งหมด ไม่เพิ่มสีหรือ spacing นอกระบบ

### 2.4 คำขอใหม่ไม่ถูกแตะ และหนี้ที่ปิดไปด้วย
แผงประมาณการของคำขอใหม่ (`plant-selection-config-panels.tsx:473-486`) ยังแยก
"ค่าตรวจเอกสาร (งวดที่ 1)" และ "ค่าลงพื้นที่ (งวดที่ 2)" เหมือนเดิมทุกบรรทัด (ปักไว้ในเทส)

แต่ `plant-selection-config.ts:274` เดิม alias
`export { GACP_RENEWAL_FEE as CULTIVATION_FEE_PER_METHOD }` และผู้ใช้คือ
`plant-selection-step.tsx:140` `selectedMethodCount * CULTIVATION_FEE_PER_METHOD`
คือ **ประมาณการของคำขอใหม่อ่านค่าต่ออายุ** ทั้งคู่เท่ากับ 30,000 วันนี้ ตัวเลขบนจอจึงถูกโดยบังเอิญ
เมื่อค่าต่ออายุกลายเป็นเลขที่ operator ขยับได้เอง ความบังเอิญนี้จะกลายเป็นบั๊กเงียบทันที
เปลี่ยน alias เป็น `GACP_PER_TYPE_TOTAL` **ค่าไม่เปลี่ยน (30,000 -> 30,000)**
ปักด้วยเทสที่ตรวจ *ชื่อ* ไม่ใช่ *ค่า* เพราะค่าเท่ากันจึงตรวจด้วยค่าไม่ได้

---

## 3. การบันทึกว่าข้ามขั้น ไม่ใช่การกระโดดเงียบ

บันทึกสองที่ ตั้งใจให้ซ้ำกัน:

1. **บนตัวคำขอเอง** (`renewal-service.js` `renewalFormData`) — `documentReviewSkipped: true`,
   `documentReviewSkipReason: 'RENEWAL_FAST_PATH_OPERATOR_RULING_2026_08_22'`,
   `workflowStatesSkipped: [...]`, `workflowEntryState`, `renewalOf`, `renewalOfCertificateNumber`
2. **ใน audit trail** — `auditLogger.log` action `RENEWAL_FAST_PATH_ENTRY` category `APPLICATION`
   metadata มีใบรับรองต้นทาง สถานะที่เข้า และรายการสถานะที่ข้าม

การเขียน audit เป็น best-effort ตาม contract เดียวกับ `audit-scheduling-service` และ
`audit-onsite-service`: sink ล่มต้องไม่ทำให้ผู้ยื่นเสียคำขอ **แต่ข้อมูลไม่หาย** เพราะสำเนาถาวรอยู่บน
formData แล้ว มีเทสยืนยันทั้งกรณี sink ปกติและ sink ล่ม

---

## 4. RED และ GREEN ทุกเทส

### 4.1 backend — `W12-RED.txt` -> `W12-GREEN.txt`
RED (ก่อนแก้โค้ด): **15 failed / 11 passed**
- `renewal-fee-ssot.test.js` 8 failed / 4 passed — `FEE_RATES.RENEWAL_PER_CERT` undefined,
  API ตอบ 15000, `renewalTotalPerCert` / `renewalChargeCount` ไม่มี,
  เคส F ชี้ `routes/api/finance/pricing.js:190  renewalFee: 15000,`
- `renewal-fast-path.test.js` 7 failed / 7 passed — สร้างเป็น `DRAFT`, ไม่มี provenance, ไม่มี audit row
  (เทส guard 4 ตัว expired/revoked/not-owner/not-found **เขียวตั้งแต่ RED** เพราะประตูเหล่านั้นมีอยู่แล้วบน main)

GREEN: **27 passed / 27** (13 + 14)

### 4.2 frontend — `W12-RED-fe-display.txt` -> `W12-GREEN-fe.txt`
RED: ทั้ง suite แดง (ย้อน 8 ไฟล์กลับด้วยการคัดลอกไฟล์ ไม่ใช่ `git checkout --` เพราะ worktree
ถือการแก้ที่ยังไม่ commit) — constant ที่ต้องใช้ยังไม่มี และทั้งสามหน้ายังพิมพ์ฐานลอย ๆ
GREEN: **18 passed / 18**

### 4.3 ชุดที่รันครบ และการเทียบ baseline
รายละเอียดเต็มใน `W12-GATES.txt`:
- unit battery 115 suites: branch 10 failed / 1300 passed · baseline @67ef3612 12 failed / 1271 passed
  failure ของ branch เป็น **subset** ของ baseline ⇒ ไม่มี failure ใหม่
- web-app 30 suites / 202 tests ผ่านหมด
- tsc 62 บรรทัดเท่า baseline · eslint สะอาด · ratchet เท่าเดิมทุกตัว · integrity ผ่านหมด
- thai-copy-style 8 warning เท่ากับ baseline

**ไม่มีเทสเดิมถูกลด อ่อนลง หรือลบ** เทสเดิมที่เข้ารหัสสมมุติฐาน "renewal เดินเส้นเดียวกัน"
ไม่มีอยู่จริงบน main (ค้นแล้วไม่พบ) มีแต่ *prose* ใน docstring 2 ที่ ซึ่งแก้ให้ตรงความจริงแล้ว:
`routes/api/applications/renewals.js:19-22` และหัวไฟล์ `services/renewal-service.js`

---

## 5. ไฟล์ที่แตะ

| ไฟล์ | ทำอะไร |
|---|---|
| `apps/backend/config/business-rules.js` | `RENEWAL_PER_CERT: 30000` + keyMap `fee.renewal_per_cert` |
| `apps/backend/modules/billing/internal/fee-service.js` | `FEE_RATES.RENEWAL_PER_CERT` |
| `apps/backend/routes/api/finance/pricing.js` | `grossUpStateFee()`; เสิร์ฟ `renewalFee` / `renewalTotalPerCert` / `renewalChargeCount` |
| `apps/backend/services/renewal-service.js` | entry state `PENDING_AUDIT_FEE` + provenance + audit row + แก้ docstring |
| `apps/backend/services/audit-scheduling-service.js` | export `SCHEDULING_QUEUE_STATUS` และใช้แทน literal 3 จุด |
| `apps/backend/routes/api/applications/renewals.js` | แก้ docstring ที่ยังบอกว่าเดินเส้นเดียวกัน |
| `apps/web-app/src/constants/fees.ts` | `GACP_RENEWAL_PAYABLE_TOTAL` (derived) + `GACP_RENEWAL_CHARGE_COUNT` |
| `apps/web-app/src/hooks/use-pricing.ts` | `renewalTotalPerCert` / `renewalChargeCount` + `resolveRenewalFee` + `useRenewalFee` |
| `apps/web-app/src/app/health/applications/renewal/{quotation,invoice,payment}-step.tsx` | แสดงฐาน + ยอดที่ต้องชำระจริง |
| `apps/web-app/src/lib/i18n/dictionaries/sections/{th,en}-health.ts` | `renewal.fee.*` ชุดใหม่ + แก้ `vatNote` ที่ไม่จริง |
| `.../new/_steps/steps/plant-selection-config.ts` | ตัดการพึ่งค่าต่ออายุออกจากประมาณการคำขอใหม่ (ค่าไม่เปลี่ยน) |
| `apps/backend/__tests__/unit/renewal-fee-ssot.test.js` | ใหม่ 13 เทส |
| `apps/backend/__tests__/unit/renewal-fast-path.test.js` | ใหม่ 14 เทส |
| `apps/web-app/src/__tests__/renewal-fee-display.test.tsx` | ใหม่ 18 เทส |

**ไม่แตะ**: settlement / webhook / ledger / quotation-service / invoice-service / checkout ทุกไฟล์

---

## 6. การเรียกเก็บเงินจริง: APPLIED แล้ว (เดิมเป็นข้อเสนอ)

**สถานะเปลี่ยน 2026-08-22**: operator อนุมัติ ("Q1 จัดการทั้งหมดให้เรียบร้อบ") และบันทึกเป็น
**ข้อยกเว้น L3 ครั้งเดียว** ที่ `HARNESS_LOG.md` commit `eabfc020`
ข้อความข้างล่างนี้คือ diff ที่ถูกอนุมัติ เก็บไว้เป็นบันทึกว่าอนุมัติอะไรไป และทำจริงตามนั้นแค่ไหน

### 6.1 ข้อเสนอที่ถูกอนุมัติ (ข้อความเดิม เก็บไว้เป็นหลักฐาน)

> ทุกวันนี้คำขอต่ออายุยืนอยู่ที่ `PENDING_AUDIT_FEE` แล้วสาย checkout/quotation จะออกใบเรียกเก็บ
> **ตามสูตรงวดที่ 2 (27,675) ไม่ใช่ 33,210** เพราะ `quotation-service.js:251-255` สร้างบรรทัด
> `PHASE_2` จาก `calculatePhase2Fee` เสมอ
>
> 1. `quotation-service.js` — เมื่อ `formData.renewalOf` มีค่า ให้สร้าง quotation แบบงวดเดียว
>    บรรทัด state = `FEE_RATES.RENEWAL_PER_CERT` บรรทัด platform = 10% VAT = 7% ของ platform
>    และ **ไม่สร้างบรรทัด PHASE_1 เลย**
> 2. `phase-billing-service.js` — ต้องมี service type สำหรับงวดเดียวของการต่ออายุ
>    หรือ map การต่ออายุเข้ากับคู่ `PHASE_2_STATE_FEE` / `PHASE_2_PLATFORM_FEE` ที่มีอยู่แล้ว
> 3. checkout ที่พาไป `AUDIT_FEE_PAID` ต้องผูกกับ quotation ใบใหม่นั้น

### 6.2 ทำจริงอย่างไร

**(1) quotation-service.js — quotation งวดเดียว ไม่มีบรรทัด PHASE_1**

- `_isRenewal(application)` อ่าน `formData.renewalOf` อย่างเดียว
- `_resolveBillableFees(application)` แยกทาง: ต่ออายุได้ `{ phase1: null, phase2: calculateRenewalFee() }`
  พร้อม `stateTotal / platformTotal / vatTotal / grandTotal` รูปเดียวกับ `calculateApplicationFees`
  เพราะแถว quotation อ่านฟิลด์พวกนี้ตรง ๆ
- `_buildInstallments` ข้ามบรรทัด PHASE_1 เมื่อ `fees.phase1` เป็น null
  คำขอปกติยังได้สองบรรทัดเหมือนเดิมทุกตัวอักษร
- ทั้งสองจุดที่เคยเรียก `calculateApplicationFees` ตรง ๆ (ทางปกติ และ `_completePartialIssuance`)
  เรียกผ่าน `_resolveBillableFees` แทน จึงไม่มีทางที่ทางใดทางหนึ่งลืมเคสต่ออายุ

**(2) phase-billing-service.js — ไม่ต้องแก้ และนี่คือเหตุผล**

เลือก **map เข้ากับคู่ `PHASE_2_STATE_FEE` / `PHASE_2_PLATFORM_FEE` ที่มีอยู่แล้ว**
ไม่สร้าง service type ใหม่ เพราะ **settlement เป็นคนตัดสินว่า checkout ที่จ่ายแล้วแปลว่าอะไร**:
`checkout-settlement-service.js` map checkout งวดที่ 2 (M2) ไปเป็น `AUDIT_FEE_PAID`
ซึ่งเป็นสถานะที่คำขอต่ออายุต้องไปให้ถึงเพื่อเข้าคิวนัดหมาย
service type ใหม่จะต้องไปสอน settlement ให้รู้จัก = แตะ settlement logic = ต้องห้าม
การใช้ช่อง PHASE_2 เดิมทำให้ settlement, การออก invoice, ใบเสร็จ และ edge M2 → `AUDIT_FEE_PAID`
ทำงานต่อได้โดยไม่ต้องแก้อะไรเลย และ `getCanonicalServiceTypeForComponent('PHASE_2', ...)`
ครอบทั้งสองส่วนอยู่แล้ว จึงไม่มีบรรทัดไหนใน `phase-billing-service.js` ต้องเปลี่ยน

**(3) checkout ที่พาไป AUDIT_FEE_PAID ผูกกับ quotation ใบนั้นแล้ว**

ยอด checkout งวดที่ 2 มาจาก `payment-service-phase-flow.js` บรรทัด
`const phase2Amount = locked.phase2Total` โดย `locked` มาจาก `resolveLockedPhaseTotals`
ซึ่งอ่าน `getFrozenPhaseFees` และ **ราคาที่ถูก freeze ชนะเสมอ**
เดิม `getFrozenPhaseFees` คืน `null` เมื่อไม่มีครบทั้งสองงวด แปลว่า quotation ต่ออายุงวดเดียว
จะถูกมองว่าเป็นแถว legacy แล้ว **recompute ใหม่เป็น 27,675** ซึ่งคือบั๊กเดิมทั้งดุ้น
จึงแยกตัวอ่านออกมาเป็นฟังก์ชันบริสุทธิ์ `_reconstructFrozenFromInstallments` ที่:
รับ quotation ที่มีแต่ PHASE_2 ว่าเป็นราคาสมบูรณ์ · รายงานงวดที่ 1 เป็นศูนย์อย่างชัดเจน
(ผู้ใช้ปลายทางทุกตัวยังเห็นรูปเดิม) · และติดธง `singleCharge`
ผลคือ checkout ที่พาไป `AUDIT_FEE_PAID` คิด 33,210 โดยอัตโนมัติ **ไม่แตะ settlement แม้บรรทัดเดียว**

**(4) การคำนวณอยู่ที่เดียว**

`calculateRenewalFee()` เพิ่มใน `modules/billing/internal/fee-service.js` และเรียก
`buildPhaseFee` ตัวเดียวกับที่งวด 1 และงวด 2 ใช้ (เพิ่มพารามิเตอร์ `label` เพื่อไม่ให้บรรทัด
ต่ออายุเขียนว่า "Phase 2" บนใบแจ้งหนี้ ไม่แตะเลขแม้แต่บาทเดียว) และ pin `scopeCount: 1`
ตามคำตอบ Q2 ของ operator
`grossUpStateFee` ที่ `pricing.js` เคยมีเป็นสำเนาของสูตรนั้น **ถูกลบทิ้ง** route อ่าน
`calculateRenewalFee()` แทน ⇒ จอกับใบแจ้งหนี้ตรงกัน**โดยโครงสร้าง** ไม่ใช่โดยบังเอิญ
อัตรา VAT และแพลตฟอร์มไม่ถูกประกาศซ้ำที่ไหนเลย

### 6.3 หลักฐาน

**สามตัวเลขตรงกัน** — `__tests__/unit/renewal-single-charge-billing.test.js`
วัดจาก code path จริงทั้งสามทาง ไม่ใช่จาก literal:

| ตัวเลข | มาจาก | ค่า |
|---|---|---|
| จอ / API | `GET /api/pricing/fees` → `renewalTotalPerCert` | **33,210** |
| quotation | `_resolveBillableFees(app).grandTotal` | **33,210** |
| settlement | `_reconstructFrozenFromInstallments(...)` → `phase1.phaseTotal + phase2.phaseTotal` | **0 + 33,210 = 33,210** |

เทสข้อสุดท้ายยืนยันด้วย `new Set([screen, quotation, settlement]).size === 1`
บรรทัด quotation ที่เก็บจริง: DTAM = 30,000 (state, ยกเว้น VAT) · PLATFORM = 3,210 (platform 3,000 + VAT 210)
และ `installments.dtam.map(i => i.phase)` = `['PHASE_2']` เท่านั้น ไม่มี PHASE_1

**คำขอใหม่ไม่ขยับแม้บาทเดียว** — golden values ในไฟล์เดียวกัน เทียบกับผลที่คำนวณจาก
worktree `gacp-wt-w12base` ที่ checkout ไว้ที่ main `67ef3612` (ก่อนการแก้นี้) ตรงกันทุกฟิลด์:

| scope | DTAM | PLATFORM | totals |
|---|---|---|---|
| 1 | PHASE_1 5,000 · PHASE_2 25,000 | PHASE_1 535 · PHASE_2 2,675 | 30,000 / 3,000 / 210 / **33,210** |
| 3 | PHASE_1 15,000 · PHASE_2 75,000 | PHASE_1 1,605 · PHASE_2 8,025 | 90,000 / 9,000 / 630 / **99,630** |

**ต่ออายุคิดต่อใบรับรอง** (คำตอบ Q2 ของ operator) — ฟาร์มที่มี 3 รูปแบบการปลูก
ยังได้ฐาน 30,000 และยอดชำระ 33,210 ขณะที่คำขอใหม่ 3 รูปแบบเป็น 90,000 เทสปักทั้งคู่ไว้คู่กัน

**เทสเดิมที่ต้องแก้ 1 จุด — แจ้งชัด ๆ**:
`apps/backend/__tests__/unit/quotation-service.test.js:469-474`
`expect(frozen).toEqual({...})` ปักรูปร่างแบบตายตัว การเพิ่มฟิลด์ `singleCharge` ทำให้ตก
**จำนวนเงินทุกตัวในนั้นไม่เปลี่ยนแม้บาทเดียว** เพิ่มแค่ `singleCharge: false` เข้าไปในความคาดหวัง
พร้อมคอมเมนต์อธิบายว่าเพิ่มเมื่อไรและทำไม

## 7. คำถามที่ operator ตัดสินแล้ว

**Q1 — ให้ใบแจ้งหนี้จริงเก็บ 30,000 ครั้งเดียวหรือไม่** → **อนุมัติ** ทำแล้วทั้งหมด ดู §6
บันทึกเป็นข้อยกเว้น L3 ครั้งเดียวที่ `HARNESS_LOG.md` `eabfc020`

**Q2 — ต่อใบรับรอง หรือคูณจำนวนรูปแบบการปลูก** → **ต่อใบรับรอง ไม่คูณ**
ตรงกับที่ implement ไว้แล้ว และเพิ่มเทสปักไว้ว่าฟาร์ม 3 รูปแบบยังจ่ายฐาน 30,000
(`renewal-single-charge-billing.test.js`) เพื่อไม่ให้ใครมา "แก้" ให้กลายเป็นการคูณภายหลัง

**Q3 — ตัดขั้นตอนอัปโหลดเอกสารในหน้าต่ออายุ** → **สั่งให้ตัด แต่ยังไม่ได้ตัด**
เพราะทำ view-pack ไม่ได้จริง ๆ ในรอบนี้ รายละเอียดเต็มและหลักฐานการพยายามอยู่ที่
`reports/design-cleanup-2026-08-21/W12-viewpack/INDEX.md`
สรุป: dev server ของ branch รันได้ (:3100) แต่ session จำลองของชุด E2E ไม่ผ่าน route guard
และ spec เดิม `playwright/renewal-flow.spec.ts` ที่ไม่ได้แตะเลย ก็ตกแบบเดียวกันทั้งบน :3100
(branch) และ :3000 (main) ⇒ harness แดงทั้งเครื่อง ไม่ใช่เรื่องของ branch นี้
คำสั่งระบุชัดว่าถ้าทำหลักฐานไม่ได้ ให้ปล่อยขั้นตอนไว้ ห้ามอ้างหลักฐานที่ไม่มี จึงปล่อยไว้
ตรวจแล้วว่า**ไม่มีโค้ดฝั่ง backend อ่านเอกสารพวกนั้นเลย**: route ต่ออายุอ่านแค่
`originalCertificateId || certificateId` ส่วน `documentIds` ที่ wizard ส่งไปถูกทิ้ง

**Q4 — เลขคำขอ `GACP-REN-`** → **ปล่อยให้เป็นเลขถาวร** ตรงกับที่ทำไว้

**Q5 — เอกสาร `docs/audit/renewal-workflow-2026-05-16.md`** → **แก้แล้ว**
เพิ่ม §0 อธิบายเส้นทางปัจจุบัน (ไม่ตรวจเอกสาร, เข้าที่ `PENDING_AUDIT_FEE`, จ่ายครั้งเดียวฐาน 30,000,
ประตูที่ยังบังคับ, และเหตุผลที่ไม่สร้างที่ `AUDIT_FEE_PAID`) พร้อมกล่อง SUPERSEDED ลงวันที่
อ้าง `67ef3612` / `851fd516` **ไม่ลบไดอะแกรมเดิม** แต่ทำเครื่องหมายว่าเป็นบันทึกประวัติศาสตร์

### ยังค้าง

- **Q3 (ตัดขั้นตอนอัปโหลด)** รอ E2E harness ใช้งานได้ ขั้นตอนที่ต้องทำเขียนไว้ครบใน
  `W12-viewpack/INDEX.md` แล้ว
- **บั๊กที่เจอระหว่างทาง ยังไม่แก้**: wizard ต่ออายุ POST ไปที่ `/api/applications/renewal`
  (เอกพจน์) แต่ backend mount ไว้ที่ `/renewals` (พหูพจน์) ยิงจริงกับ backend ที่รันอยู่แล้ว
  ได้ **404 กับเอกพจน์ และ 401 กับพหูพจน์** แปลว่าปุ่มสร้างคำขอต่ออายุใช้ไม่ได้จริงมาตลอด
  spec E2E ที่ mock endpoint นี้ไว้บังหน้าไว้ ไม่แก้ในรอบนี้เพราะอยู่ในไฟล์เดียวกับขั้นตอน
  upload ที่ตัดไม่ได้ ควรแก้พร้อมกันตอนทำ Q3

---

## 9. รอบ 3 (2026-08-22 ช่วงท้าย) — Q2 แก้ใหม่, ปิดบั๊ก 404, ตัดขั้นตอนอัปโหลด

### 9.1 Q2 ถูกแก้: คิดต่อรูปแบบการปลูก ไม่ใช่ต่อใบรับรอง

operator แก้คำตอบเดิม (`HARNESS_LOG.md` `8b8d581f`):
"ฟาร์ม 1 รูปแบบ 30000 / 2 รูปแบบ 60000 / 3 รูปแบบ 90000 ราคารวม ต้องแบบนี้
ไม่ว่าใหม่ หรือต่อ ต้องคิดเงินแยกรูปแบบการปลูก"

สิ่งที่แก้:

- `FEES.RENEWAL_PER_CERT` → **`FEES.RENEWAL_PER_SCOPE`** และ SystemConfig key
  `fee.renewal_per_cert` → **`fee.renewal_per_scope`**
  ชื่อเดิมกลายเป็นชื่อที่หลอกคนอ่าน จึงเปลี่ยนทั้งคู่
- **ไม่ทิ้งค่าที่อาจตั้งไว้แล้ว**: key เก่ายัง map เข้าฟิลด์เดียวกันได้ และ loader
  เรียงให้ key เก่าถูก apply ก่อน key ใหม่เสมอ ดังนั้นถ้ามีทั้งสองแถวในฐานข้อมูล
  แถวชื่อใหม่ชนะแน่นอน ไม่ขึ้นกับลำดับที่ Postgres คืนมา
- การคูณ **ใช้เส้นเดียวกับงวด 1 และงวด 2**: `calculateRenewalFee(formData, options)`
  เรียก `resolveCultivationScopeCount` แล้วส่งเข้า `buildPhaseFee` เหมือนกันเป๊ะ
  ไม่ได้เขียนการคูณขึ้นมาใหม่อีกชุด
- `renewalTotalPerCert` → `renewalTotalPerScope` ทั้ง API และฝั่ง frontend
  (`GACP_RENEWAL_PAYABLE_TOTAL` → `GACP_RENEWAL_PAYABLE_PER_SCOPE`)

### 9.2 ตัวเลขที่พิสูจน์แล้ว ทุกจำนวนรูปแบบ

| รูปแบบการปลูก | ฐานก่อน VAT | ยอดที่ต้องชำระ |
|---|---|---|
| 1 | 30,000 | **33,210** |
| 2 | 60,000 | **66,420** |
| 3 | 90,000 | **99,630** |

และ **สามตัวเลขยังตรงกันทุกระดับ scope** (จอ == quotation == settlement)
ยืนยันด้วย `new Set([screen, quotation, settlement]).size === 1` ที่ scope 1, 2, 3
ใน `renewal-single-charge-billing.test.js`

เทสเดิมที่ปักว่า "3 รูปแบบยังจ่ายฐาน 30,000" ถูก **กลับด้าน** ไม่ใช่ลบทิ้ง
เพื่อให้เห็นในประวัติว่าความหมายเปลี่ยนเมื่อไหร่และเพราะอะไร

**คำขอใหม่ไม่ขยับ**: golden values ทั้ง 1 และ 3 รูปแบบยังเท่าเดิมทุกฟิลด์
(DTAM 5,000/25,000 · PLATFORM 535/2,675 · รวม 33,210 สำหรับ 1 รูปแบบ และ
15,000/75,000 · 1,605/8,025 · รวม 99,630 สำหรับ 3 รูปแบบ)

### 9.3 ผลที่ตามมา ที่ควรรู้ก่อนมีคนไปเจอเองแล้วคิดว่าเป็นบั๊ก

เพราะฐานต่ออายุต่อรูปแบบ (30,000) **เท่ากับ** งวด 1 + งวด 2 ต่อรูปแบบ (5,000 + 25,000)
**การต่ออายุกับการยื่นใหม่จึงมียอดรวมเท่ากันสำหรับฟาร์มเดียวกัน**
สิ่งที่ต่างไม่ใช่จำนวนเงิน แต่คือ **จังหวะการจ่าย**: ต่ออายุจ่ายครั้งเดียว
คำขอใหม่แบ่งจ่ายสองงวด มีเทสยืนยันข้อนี้ไว้ตรง ๆ แล้ว
(`a renewal and a NEW application come to the same total for the same farm`)

### 9.4 บั๊ก 404 ที่ปุ่มต่ออายุ — แก้แล้ว

`client-view.tsx` POST ไปที่ `/api/applications/renewal` (เอกพจน์) แต่ route mount
ที่ `/renewals` ยิงจริงกับ backend ของ branch: **เอกพจน์ 404 / พหูพจน์ 401**
⇒ ปุ่มนี้ไม่เคยทำงานจริงกับ backend ตัวจริงเลย spec E2E ที่ mock URL เอกพจน์ไว้
คือสิ่งที่ปิดบังไว้ (เทสเห็นด้วยกับบั๊ก แทนที่จะเห็นด้วยกับ server)

**แก้ที่ฝั่ง caller** ไม่ใช่ฝั่ง route เพราะ contract ของ route ถูกอยู่แล้ว:
- URL → `/api/applications/renewals`
- body → `{ originalCertificateId }` เท่านั้น
  (เดิมส่ง `{ previousApplicationId, certificateId, documentIds }` — route อ่านแค่
  `originalCertificateId || certificateId` และทิ้งที่เหลือ ตัว `certificateId`
  จึงเคยใช้ได้โดยบังเอิญผ่านทาง fallback แต่ชื่อ canonical คือ `originalCertificateId`)

**guard ที่ขาดไป และสำคัญกว่าตัวแก้**: `src/__tests__/renewal-endpoint-contract.test.ts`
อ่าน **ไฟล์ route จริง** ไม่ใช่ fixture แล้วบังคับสามอย่าง: URL ที่ caller เรียก ต้องตรงกับ
path ที่ backend mount · ทุก field ที่ caller ส่ง ต้องเป็น field ที่ route อ่านจริง ·
และไม่มี URL เอกพจน์หลงเหลือ RED ก่อนแก้: 9 ตก / 2 ผ่าน

### 9.5 ตัดขั้นตอนอัปโหลดเอกสารแล้ว (Q3)

ลบ `upload-step.tsx` · ลบ `REQUIRED_DOCS` 4 รายการ · `RenewalStep` เหลือ
`'quotation' | 'invoice' | 'payment' | 'success'` · wizard เปิดที่ใบเสนอราคา และ
สร้างคำขอต่ออายุเองทันทีที่โหลดใบรับรองเสร็จ (ไม่มีปุ่มให้กดแล้ว) · ปุ่มย้อนกลับของ
ใบเสนอราคาไปหน้ารายการใบรับรอง · ลบ `upload-step-back-confirm.test.tsx` ที่ทดสอบ
component ที่ไม่มีแล้ว · แก้ `playwright/renewal-flow.spec.ts` ทั้ง URL ที่ mock และ
ขั้นตอน upload ที่หายไป

### 9.6 `documentIds` — ตัดสินว่าอย่างไร

FE **เลิกส่ง** แล้ว ฝั่ง backend **ไม่ต้องแก้อะไร** เพราะไม่เคย "รับ" มาตั้งแต่แรก:
route อ่านเฉพาะ `originalCertificateId || certificateId` ไม่มีบรรทัดไหนแตะ
`documentIds` เลย จึงไม่มีโค้ดให้ลบ และการไปเพิ่มโค้ดปฏิเสธ field ที่ไม่รู้จัก
จะเป็นการเพิ่มพื้นที่ผิดพลาดโดยไม่ได้อะไรกลับมา
สิ่งที่ทำแทนคือ **เทสบังคับว่าทุก field ที่ caller ส่งต้องเป็น field ที่ route อ่านจริง**
(§9.4) ซึ่งกันปัญหาเดิมได้ตรงจุดกว่า: ปัญหาไม่ใช่ว่า server รับ field เกิน
แต่คือ client ส่งของที่ไม่มีใครอ่านแล้วเข้าใจว่าตัวเองทำงานอยู่

### 9.7 การกดจริงบนฐานข้อมูลจริง

`W12-REAL-PRESS.txt` — เรียก `createRenewalApplication` (ฟังก์ชันเดียวกับที่ route
ที่ผ่าน auth เรียก) ด้วยใบรับรองจริง `GACP-TH-2569-85B448` และเจ้าของจริง
ผลบนฐานข้อมูลจริง: `status = PENDING_AUDIT_FEE` · provenance ครบทุก field ·
audit row `RENEWAL_FAST_PATH_ENTRY` เขียนสำเร็จ 1 แถว · แถวที่บันทึกจริงคิดเงินเป็น
DTAM `PHASE_2` 30,000 + PLATFORM 3,210 = 33,210 ไม่มีบรรทัด PHASE_1
(ฟาร์มนี้มี 1 รูปแบบการปลูก) · ลบทิ้งด้วย soft-delete หลังเก็บหลักฐาน

**การกดจริงจับบั๊กที่เทสจับไม่ได้**: รอบแรก audit row **เขียนไม่ลง** เพราะ
`AuditLog.actorRole` เป็น NOT NULL ใน schema แต่โค้ดไม่ได้ส่งไป
unit test มองไม่เห็นเพราะ mock ตัว logger ไว้ จึงไม่เคยเจอ constraint จริง
แก้แล้ว (ส่ง `actorRole`) และ **เพิ่มเทสที่อ่าน `prisma/schema/audit.prisma`
เพื่อหา column ที่ NOT NULL แล้วเทียบกับ payload จริง** เพื่อไม่ให้ mock ปิดตาได้อีก

### 9.8 หนี้ที่แก้ไปด้วยเพราะการกดจริง/เทสรวม

`currency-never-wraps.test.ts` เป็น guard ว่าเลขเงินต้องไม่ถูกตัดกลางบรรทัด
ตอนแรกเปลี่ยนหน้าชำระเงินไปใช้ `formatCurrency` ซึ่งพิมพ์สัญลักษณ์ ฿ เอง
ทำให้ element นั้น **หลุดจากสายตา guard** ทั้งที่ยังแสดงเงินอยู่ (นับได้ 7 จาก 8 ที่ต้องมี)
ไม่ได้ลด floor ของ guard แต่**คืนรูปแบบที่ guard ตรวจได้** โดยใช้ ฿ เป็น literal
คู่กับ `formatNumber` ซึ่งเป็น formatter กลางเดิมของ repo


---

## 8. commit ที่ตั้งใจจะทำ (ยังไม่ commit)

1. `fix(money): renewal fee is one 30,000 charge from the canonical fee table`
   — business-rules.js, fee-service.js, pricing.js + `renewal-fee-ssot.test.js` — **Tier C, operator merge**
2. `feat(renewal): enter at the site-visit payment gate, no document review`
   — renewal-service.js, audit-scheduling-service.js, renewals.js + `renewal-fast-path.test.js`
3. `fix(renewal-ui): show the amount payable, not the pre-VAT base`
   — fees.ts, use-pricing.ts, สามหน้า wizard, i18n สองไฟล์ + `renewal-fee-display.test.tsx`
4. `fix(fees): a new application's estimate must not read the renewal fee`
   — plant-selection-config.ts (ค่าไม่เปลี่ยน แยกใบให้ operator ตัดออกได้)
5. `fix(money): bill a renewal once, and bind the checkout to that quotation`
   — fee-service.js (`calculateRenewalFee`), billing/index.js, pricing.js,
   quotation-service.js + `renewal-single-charge-billing.test.js`
   + การแก้รูปร่างที่ `quotation-service.test.js:469-474` — **Tier C, operator merge**
   (อนุมัติแล้ว: ข้อยกเว้น L3 ครั้งเดียว `HARNESS_LOG.md eabfc020`)
6. `docs(renewal): supersede the Iter 26 workflow diagram`
   — `docs/audit/renewal-workflow-2026-05-16.md`
7. `fix(renewal): renewal fee is charged per cultivation scope`
   — business-rules.js (RENEWAL_PER_SCOPE + legacy config key), fee-service.js,
   pricing.js, quotation-service.js + inverted scope tests — **Tier C**
8. `fix(renewal): the renewal button posts to an endpoint that exists`
   — client-view.tsx + `renewal-endpoint-contract.test.ts`
9. `feat(renewal): cut the document-upload step`
   — upload-step.tsx deleted, types.tsx, client-view.tsx,
   playwright/renewal-flow.spec.ts, upload-step-back-confirm.test.tsx deleted
10. `fix(renewal): audit row was failing the actorRole NOT NULL constraint`
   — renewal-service.js + schema-derived audit-shape test
11. `docs(report): W12 — renewal single-charge fee + fast path`
   — รายงานนี้ + evidence + `W12-viewpack/INDEX.md`
