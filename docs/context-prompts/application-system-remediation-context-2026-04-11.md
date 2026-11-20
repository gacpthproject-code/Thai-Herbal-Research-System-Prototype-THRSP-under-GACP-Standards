# Context Engineering Prompt: Application System Remediation

คุณกำลังเข้ามารับงานแก้ระบบ `application / document submission` ของแพลตฟอร์ม GACP Thai ที่อยู่ในสถานะมี runtime drift ระหว่าง frontend, backend, workflow state, billing lifecycle, preview, tracking, และ document templates

## Mission
ทำให้ระบบ application กลับมาเป็นระบบเดียวจากต้นจนจบ โดยยึด business truth ต่อไปนี้เป็นแกน:

1. ค่าบริการต้องแยกชัดเจนเป็น
   - ค่าบริการตรวจสอบเอกสาร 5,000 บาท
   - ค่าบริการลงตรวจพื้นที่ 25,000 บาท
2. ระบบต้องรองรับ split billing อย่างสอดคล้องทุก surface
   - quotation
   - invoice
   - receipt
   - tax invoice
   - preview
   - payment page
   - application detail
   - provider/admin views
3. process ของ application ต้องเป็น canonical flow เดียว ไม่ยอมให้มี status dialect หลายชุดปะปน
4. UX/UI ต้องสะท้อน process จริง ไม่ใช่ local success หรือ mock success
5. เมื่อเคสจบ ต้องมี primitive สำหรับ case tracking ที่ชัดเจนและใช้ร่วมกันได้ทุกเอกสารและทุกหน้าที่เกี่ยวข้อง

## Current Truth You Must Respect

### A. Database / runtime facts
- production มี application จำนวน 36 records
- production มี `formData.workflowState` ไม่ตรงกับ `state` จำนวน 22 records
- production มี invoice 40 records แต่ quote เพียง 4 records
- production ใช้ invoice split service types จริงแล้ว:
  - `PHASE_1_STATE_FEE`
  - `PHASE_1_PLATFORM_FEE`
  - `PHASE_2_STATE_FEE`
  - `PHASE_2_PLATFORM_FEE`

### B. Canonical domain direction
- `Application.state` ต้องเป็น workflow truth หลัก
- `status` และ `formData.workflowState` ต้องเป็น synced projection ไม่ใช่ source ที่แข่งกันเอง
- financial lifecycle เป้าหมายคือ:
  - Quotation
  - Invoice
  - Receipt
  - Tax Invoice

### C. Known drift you must fix, not preserve
- `apps/backend/routes/api/finance/quotes.js` ยังใช้ vocabulary เก่า เช่น `quote_sent`, `awaiting_payment`
- file เดียวกันยังเขียน field ที่ไม่ตรงกับ schema ปัจจุบัน เช่น `quote.invoiceId` และ `ApplicantNotes`
- `apps/backend/routes/api/applications/application-bundles.js` อ้าง field schema คนละรุ่น เช่น `userId`, `bundleType`, `totalFee`, `paymentStatus`
- `apps/web-app/src/app/health/applications/[id]/client-view.tsx` ยังใช้ `GACP_PHASE1_TOTAL` และ `GACP_PHASE2_TOTAL` แบบ hardcoded แทน settlement จริง
- `apps/backend/routes/api/preview/preview-financial-utils.js` auto-prepare เฉพาะ phase 1
- `apps/web-app/src/app/health/applications/new/sections/payment-section.tsx` ยังเป็น mock/local success flow
- `apps/web-app/src/app/health/applications/new/layout.tsx` ยังขับด้วย `new-legacy` implementation
- tracking case ยังยึด `applicationNumber` เป็นหลัก ยังไม่มี tracking primitive ชัดเจนระดับ case

## Non-Negotiable Outcomes
1. ผู้ใช้ต้องเห็นการแยกรายจ่ายเหมือนกันทุกหน้าและทุกเอกสาร
2. quote/invoice/receipt/tax invoice ต้องมาจาก chain เดียวกัน ไม่ใช่บาง flow มี quote บาง flow ข้าม quote
3. ไม่มีหน้าจอใดแสดงยอด hardcoded ถ้ายอดจริงขึ้นกับจำนวนรูปแบบปลูกหรือ settlement จริง
4. ไม่มี route ที่อ้าง field ไม่อยู่ใน schema ปัจจุบันค้างอยู่ใน live surface
5. preview ต้องเป็น “official pre-submit / pre-payment review surface” ที่ครบตาม process จริง ไม่ใช่ snapshot บาง phase
6. tracking ต้องรองรับเลขติดตามเคสที่เป็น domain primitive ชัดเจน
7. legacy implementation ที่ยังขับ runtime ต้องถูกจัดการอย่างชัดเจน:
   - migrate
   - redirect
   - quarantine
   - หรือ delete

## Required Workstreams

### Workstream 1: Canonical Application Domain
- freeze canonical workflow states สำหรับ applicant lifecycle
- สร้าง single source of truth สำหรับ state transition
- remove or isolate legacy status dialects จาก live routes
- ทำ data reconciliation plan สำหรับ records ที่ `formData.workflowState` ไม่ตรงกับ `state`

### Workstream 2: Financial Lifecycle Consolidation
- define canonical financial entities and transitions:
  - phase 1 quotation
  - phase 1 invoice
  - phase 1 receipt
  - phase 1 tax invoice
  - phase 2 quotation
  - phase 2 invoice
  - phase 2 receipt
  - phase 2 tax invoice
- ensure applicant/provider/admin ใช้ contract เดียวกัน
- stop direct invoice-only flows ที่ข้าม quote หากขัดกับ business process ที่ต้องการ
- remove stale codepaths in `quotes.js`

### Workstream 3: Split Fee Consistency
- ยืนยันและทำให้ทุก surface แสดง:
  - ค่าบริการตรวจสอบเอกสาร
  - ค่าบริการลงตรวจพื้นที่
  - platform fee
  - VAT
- detail page, preview page, payment page, PDFs, and reports ต้องใช้ settlement/config จริง ไม่ใช่ constant fallback ใน runtime path

### Workstream 4: Preview and UX/UI
- redesign preview contract ให้ครอบคลุมทั้ง case lifecycle ที่ผู้ใช้ต้องเห็นก่อนตัดสินใจ
- ยกเลิก success-like mock interactions ใน applicant payment wizard
- ensure payment and success states มาจาก backend confirmation เท่านั้น
- unify visual language ระหว่าง wizard, preview, detail, tracking, and payments

### Workstream 5: Tracking and Case Closure
- introduce canonical `trackingNumber` or equivalent case-tracking primitive
- make it available in:
  - application detail
  - tracking page
  - quotation
  - invoice
  - receipt
  - tax invoice
  - provider/admin search surfaces
- define case-closure rules:
  - approved
  - certified
  - cancelled / expired
  - rejected

### Workstream 6: Legacy Surface Rationalization
- audit every live route or page that still depends on `new-legacy`
- decide explicit fate for each:
  - keep temporarily with wrapper
  - migrate now
  - hard redirect
  - remove
- do not leave “new route backed by legacy internals” without explicit technical note and deprecation path

## Constraints
- preserve existing production data
- avoid destructive migration without reconciliation script
- prefer additive migration + backfill + cutover
- maintain backward compatibility only where it does not perpetuate dialect drift in live business logic
- if a compatibility alias is kept temporarily, document owner, cutoff condition, and removal plan

## Deliverables Expected From Dev
1. architecture note of the canonical application + billing + tracking model
2. implementation plan grouped by workstream
3. code changes
4. data migration/backfill scripts if needed
5. regression tests covering:
   - applicant happy path
   - phase 1 financial lifecycle
   - phase 2 financial lifecycle
   - revision path
   - tracking display
   - preview completeness
   - provider/admin finance actions
6. release note describing behavior changes

## Acceptance Criteria
- no live applicant page uses hardcoded fee totals where runtime settlement is required
- no live finance route writes status or fields outside the canonical schema/contract
- preview supports the required official review experience and reflects both current and next financial steps correctly
- quote and invoice generation is deterministic and traceable per phase
- every invoice/receipt/tax invoice can be tied back to application id + application number + case tracking number
- data reconciliation for state/workflow drift is complete or explicitly blocked with documented fallback
- application detail, tracking, preview, and payment pages all agree on current case status and next action

## Start Here
1. Read:
   - [application-system-deep-audit-2026-04-11.md](C:/Users/USER/Documents/GitHub/GACP-Certification-Application/docs/audit-reports/application-system-deep-audit-2026-04-11.md)
2. Inspect first:
   - [application.prisma](C:/Users/USER/Documents/GitHub/GACP-Certification-Application/apps/backend/prisma/schema/application.prisma)
   - [billing.prisma](C:/Users/USER/Documents/GitHub/GACP-Certification-Application/apps/backend/prisma/schema/billing.prisma)
   - [quotes.js](C:/Users/USER/Documents/GitHub/GACP-Certification-Application/apps/backend/routes/api/finance/quotes.js)
   - [payments.js](C:/Users/USER/Documents/GitHub/GACP-Certification-Application/apps/backend/routes/api/finance/payments.js)
   - [preview.js](C:/Users/USER/Documents/GitHub/GACP-Certification-Application/apps/backend/routes/api/preview/preview.js)
   - [preview-financial-utils.js](C:/Users/USER/Documents/GitHub/GACP-Certification-Application/apps/backend/routes/api/preview/preview-financial-utils.js)
   - [client-view.tsx](C:/Users/USER/Documents/GitHub/GACP-Certification-Application/apps/web-app/src/app/health/applications/%5Bid%5D/client-view.tsx)
   - [payment-section.tsx](C:/Users/USER/Documents/GitHub/GACP-Certification-Application/apps/web-app/src/app/health/applications/new/sections/payment-section.tsx)
   - [tracking/client-view.tsx](C:/Users/USER/Documents/GitHub/GACP-Certification-Application/apps/web-app/src/app/health/applications/tracking/client-view.tsx)

## Final Instruction
อย่าปรับเพียง label หรือ UI surface เดี่ยว ๆ ให้ดูเหมือนถูกต้อง แต่ต้องแก้ให้ business flow, schema contract, runtime state, document lifecycle, และ user-facing UX กลายเป็นระบบเดียวกันจริง
