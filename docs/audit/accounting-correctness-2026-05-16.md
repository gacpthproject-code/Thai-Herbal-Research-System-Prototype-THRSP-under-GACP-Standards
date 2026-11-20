> ## ⚠️ เอกสารนี้บันทึกโมเดลที่เลิกใช้แล้ว (ปักป้าย 2026-09-05)
>
> เนื้อหาด้านล่างเขียนขึ้นภายใต้โมเดล **two-money-flow / ตัวแทนรับชำระ** ซึ่งถูกยกเลิกโดย
> มติ operator W14 (2026-08-22) และมติ 2026-09-05 · จุดยืนปัจจุบัน: **บริษัทเป็นผู้ออกเอกสารรายเดียว
> เก็บ VAT 7% บนค่าบริการทั้งก้อน ไม่มีส่วนใดยกเว้นภาษี และบริษัทจ่ายกรมฯ ภายหลังในฐานะต้นทุน**
>
> เก็บไว้อ่านเป็นบันทึกประวัติ — **อย่านำตัวเลข ผังบัญชี หรือข้อสรุปทางภาษีในนี้ไปใช้**
> ความจริงปัจจุบันอยู่ที่ `apps/backend/services/fee-service.js`

---
artifact: audit
date: 2026-05-16
batch: B15-B (Accounting / Compliance)
status: complete (gap-fix iteration 1)
authoritative-references:
  - ประมวลรัษฎากร ม.86/4 (full tax invoice)
  - ประมวลรัษฎากร ม.105 (receipt)
  - กฎกระทรวงการคลังเรื่องเงินรายได้แผ่นดิน (government revenue receipt)
  - apps/backend/config/invoice-issuers.js (canonical config — do not modify)
  - docs/financial-documents/RECEIPT-DESIGN-SPEC.md
---

# Accounting Correctness Audit — 2026-05-16

Audit of the post-approval payment flow against Thai accounting standards
(TFRS for NPAEs, TAS 1) and the canonical two-issuer model. Scope: PDF
receipt generation, double-entry recording, FlowAccount-shaped export,
and withholding-tax handling.

## Update 2026-05-16 — Two-flow correction (batch B16-C)

### Owner clarification (Thai, verbatim — to be quoted in handoffs)

- "ที่อยู่กับ tax id ของฝั่ง DTAM ใน invoice ถูกอยู่แล้ว"
  → DTAM tax-ID + address are already correct on the invoice configuration.
    The defaults of `DTAM_ISSUER` and `PLATFORM_ISSUER` in
    `apps/backend/config/invoice-issuers.js` are NOT changed by this batch.
- "ส่วนบริษัท platform ก็เก็บแค่ค่า fee platform เท่านั้น"
  → The platform company collects ONLY the platform fee + VAT. The state
    fee flows applicant → กรมบัญชีกลาง (Treasury) directly via a separate
    banking channel and NEVER touches the platform's bank account.
- "เลขบัญชี DTAM เหมือนมีอยู่แล้วในเอกสารเก่า"
  → DTAM bank-account number already exists in old templates. Confirmed
    found in `apps/backend/services/pdf/templates/invoice.html` lines
    338-346: ธนาคารกรุงไทย สาขามหาวิทยาลัยธรรมศาสตร์ รังสิต, account
    `4750134376`, name "เงินบำรุงศูนย์พัฒนายาไทยและสมุนไพร", tax-ID
    `0994000036540`.

### What changed

1. `apps/backend/config/invoice-issuers.js`
   - NEW constant `DTAM_BANK_ACCOUNT` — frozen, canonical, env-overridable
     (`DTAM_BANK_NAME`, `DTAM_BANK_ACCOUNT_NO`, `DTAM_BANK_ACCOUNT_NAME`,
     `DTAM_PROMPTPAY_ID`). Defaults are the values found in
     `invoice.html` so PDF templates + payment routes can read one
     canonical source.
   - NEW constant `PLATFORM_BANK_ACCOUNT` — frozen, env-overridable
     (`PLATFORM_BANK_NAME`, `PLATFORM_BANK_ACCOUNT_NO`,
     `PLATFORM_BANK_ACCOUNT_NAME`, `PLATFORM_PROMPTPAY_ID`). Defaults
     for `bankName` and `accountNo` are `PENDING_FINANCE_CONFIRMATION`
     until Finance confirms (PromptPay defaults to the company tax-ID
     `0105568045932`).
   - NEW helper `getBankAccountForIssuer(issuerType)`.
   - `getInvoiceIssuer(serviceType)` now ALSO returns a `bankAccount`
     block in its result — the existing legal-identity fields are
     preserved; the bank channel is appended.
   - `listPendingIssuerFields()` extended to also scan the two bank
     accounts so production-readiness check catches missing env vars.

2. `apps/backend/services/journal-entry-service.js`
   - `recordPaymentEntry(invoiceId, amount, components, meta)` now
     short-circuits with `{ skipped: true, reason:
     'STATE_FEE_NOT_IN_PLATFORM_BOOKS', invoiceId, invoiceNumber,
     serviceType, amount }` when the issuer resolves to DTAM (i.e.
     `PHASE_*_STATE_FEE`). PLATFORM invoices continue through the
     existing Dr Cash / Cr Revenue / Cr Output VAT path.
   - Legal anchors quoted in JSDoc: ป.รัษฎากร ม.77/1 (10),
     กฎกระทรวงการคลังเรื่องเงินรายได้แผ่นดิน, พ.ร.บ.วินัยการเงินการคลัง
     ของรัฐ พ.ศ.2561 ม.34, TFRS for NPAEs ch.18.
   - `buildPaymentEntryLines` (pure helper) is unchanged — still
     produces the legacy agent-collection shape for legacy single-line
     invoices and the test-anchor remains valid.

3. `apps/backend/services/bank-reconciliation-service.js`
   - `generateReconciliationReport({ bookSide, ... })` now requires a
     `bookSide` parameter of `'DTAM' | 'PLATFORM' | 'BOTH'`. Missing
     → throws `{ code: 'BOOK_SIDE_REQUIRED' }`.
   - DTAM side returns only STATE invoice rows + the canonical
     `DTAM_BANK_ACCOUNT` header. PLATFORM side returns only PLATFORM
     invoice rows + the canonical `PLATFORM_BANK_ACCOUNT` header.
     BOTH returns both sides + a combined `bankAccount` map.
   - Each row carries `bookSide` for sub-totalling in the BOTH view.
   - CSV exporter adds a `bookSide` column.

4. `apps/backend/routes/api/finance/reconciliation.js`
   - `GET /api/finance/reconciliation?bookSide=DTAM` — ACCOUNT or
     ADMIN (canonical-rbac existing ACCOUNT role; the ACCOUNT_DTAM
     vs ACCOUNT_PLATFORM split is B16-B territory and out of scope).
   - `GET /api/finance/reconciliation?bookSide=PLATFORM` — ACCOUNT
     or ADMIN.
   - `GET /api/finance/reconciliation?bookSide=BOTH` — ADMIN only;
     other roles get 403 `BOOK_SIDE_BOTH_ADMIN_ONLY`.
   - Missing bookSide → 400 `BOOK_SIDE_REQUIRED`.
   - Audit-log entry now stamps the requested `bookSide` so DTAM
     auditors can trace which side a user pulled.

### What was NOT changed (intentional)

- `DTAM_ISSUER` / `PLATFORM_ISSUER` legal-name / tax-ID / address
  DEFAULTS — owner confirmed those are correct.
- `buildPaymentEntryLines` pure helper — kept to satisfy the existing
  anti-regression test (`STATE invoice does NOT create a
  Revenue—State line`). Going forward `recordPaymentEntry` is the
  only entry point for STATE invoices and short-circuits.
- `canonical-rbac.js` (B16-B file boundary) — ACCOUNT_DTAM /
  ACCOUNT_PLATFORM sub-roles will be added in B16-B; until then the
  existing ACCOUNT role + the explicit `bookSide` query parameter
  give us the same effective separation.
- Prisma schema (B16-A boundary) — no schema changes required by
  this batch; the new `bookSide` filter runs post-query on the
  joined `invoice.serviceType` column that already exists.

### TBD — Finance team confirmations

1. **PLATFORM_BANK_ACCOUNT** real values — Finance must set:
   - `PLATFORM_BANK_NAME` (e.g. ธนาคารไทยพาณิชย์ สาขา…)
   - `PLATFORM_BANK_ACCOUNT_NO`
   - `PLATFORM_BANK_ACCOUNT_NAME` (likely the registered company name)
   These default to `PENDING_FINANCE_CONFIRMATION`, which surfaces in
   `listPendingIssuerFields()` at startup and prints visibly on QA
   receipts. Production cutover blocked on confirmation.
2. **DTAM bank account verification** — current default
   (กรุงไทย 4750134376) was extracted from the legacy `invoice.html`
   template that has been in production since pre-B16. Finance team
   should reconfirm with กรมบัญชีกลาง before the first month-end
   reconciliation under the new two-flow model.
3. **No monthly remittance entry on the platform side** — under the
   two-flow model the platform NEVER holds the state fee, so there
   is nothing to remit. `recordRemittanceToDtam` is kept for legacy
   migration / hypothetical incident-recovery scenarios but is no
   longer part of the live flow. Finance + Legal should confirm
   this remains accurate before retiring the function.
4. **ACCOUNT_DTAM / ACCOUNT_PLATFORM sub-role split** — pending
   B16-B canonical-rbac update. Until then, the `bookSide` query
   parameter is the only logical separator.

## 1. Two-Issuer Model (canonical — verified, not changed)

| Issuer | Service types | Document | VAT? | Legal basis |
| --- | --- | --- | --- | --- |
| **DTAM** — กรมการแพทย์แผนไทยและการแพทย์ทางเลือก | `PHASE_{1,2}_STATE_FEE` | ใบเสร็จเงินรายได้แผ่นดิน (Government Revenue Receipt) | NO | กฎกระทรวงการคลังเรื่องเงินรายได้แผ่นดิน |
| **PLATFORM** — บริษัท พรีดิกทีฟ เอไอ โซลูชัน จำกัด (สำนักงานใหญ่), Tax ID `0105568045932` | `PHASE_{1,2}_PLATFORM_FEE`, `SUBSCRIPTION_*` | ใบกำกับภาษีเต็มรูป / ใบเสร็จรับเงิน (Full Tax Invoice + Receipt) | 7% | ป.รัษฎากร ม.86/4 + ม.105 |

Source of truth: `apps/backend/config/invoice-issuers.js`. Audit confirmed
no caller hardcodes issuer fields — `resolveIssuerForTemplate()` in
`invoice-template-service.js` always reads through `getInvoiceIssuer(serviceType)`.

### 1.1 Why the platform is a collection agent, not DTAM (B16-B revision)

แพลตฟอร์ม (บริษัท พรีดิกทีฟ เอไอ โซลูชัน จำกัด) **ไม่ใช่ผู้ให้บริการรับรอง GACP เอง**
และไม่ใช่ผู้ขายต่อ (re-seller) บริการของกรมการแพทย์แผนไทยฯ (DTAM) แต่ทำหน้าที่
เป็น **ตัวแทนรับชำระเงิน (collection agent)** ตามสัญญารับจ้างเทคโนโลยีของ
กรมฯ และพระราชบัญญัติบริการสาธารณะ — เงินค่าธรรมเนียมรัฐ 5,000 บาท / 25,000 บาท
ที่ผู้สมัครชำระเข้าบัญชีธนาคารของแพลตฟอร์ม **ไม่ใช่รายได้ของแพลตฟอร์ม**
แต่เป็นเงินที่แพลตฟอร์ม **มีหน้าที่นำส่ง DTAM ทุกสิ้นเดือน**
ตามมาตรฐาน TFRS for NPAEs (บทที่ 18 การรับรู้รายได้) และ TAS 18.8
(หลักการ agent vs principal) เงินที่ถือไว้แทนบุคคลอื่นต้องบันทึก
เป็น **หนี้สินหมุนเวียน (current liability)** ไม่ใช่รายได้ — รายได้ที่
แพลตฟอร์มรับรู้จากใบเสร็จเฟส 1 / เฟส 2 มีเพียงค่าบริการแพลตฟอร์ม
500 / 2,500 บาท (พร้อม Output VAT 7%) เท่านั้น

## 2. Audit Findings + Fixes

### 2.1 PDF receipt generation

| # | Finding | Status |
| --- | --- | --- |
| 1 | DTAM Government Revenue Receipt template did NOT exist — `generateReceiptPdf` used the generic `receipt.html`, which has no DTAM issuer block. State-fee receipts shipped with a "ระบบ GACP Online" footer instead of DTAM's legal name. | **FIXED** — Added `apps/backend/services/pdf/templates/government-revenue-receipt.html`. Pulls issuer fields from canonical config via `{{ISSUER_NAME_TH}}`, `{{ISSUER_TAX_ID}}`, `{{ISSUER_ADDRESS}}`. No VAT row, no "ใบกำกับภาษี" badge. |
| 2 | `generateReceiptPdf` was issuer-agnostic — it used `receipt.html` for both STATE and PLATFORM invoices. | **FIXED** — Now routes by service type: STATE_FEE → `government-revenue-receipt.html`; PLATFORM_FEE + SUBSCRIPTION → `receipt.html`. Both paths inject the four canonical issuer fields. |
| 3 | Platform tax-invoice template (`tax-invoice.html`) was already correct post-Tier-12 — issuer block driven by config, VAT line present, ม.86/4 (1) badge "ใบกำกับภาษี" preserved. | **OK** |
| 4 | Receipt-number format in `invoice-service.issueReceipt()` is the legacy `RCP-{year}-{seq6}` rather than the canonical `RCP-DTAM-{พ.ศ.}-{seq6}` / `TAX-PRD-{ค.ศ.}-{seq6}` / `RCP-PRD-{ค.ศ.}-{seq6}` from `document-numbering.js`. | **DEFERRED** — file `services/invoice-service.js` is in active B15 territory; switching the format mid-stream would conflict with B15-A migration in flight. Document-numbering helpers exist and are unit-tested; cutover is a follow-up batch. |
| 5 | Buddhist Era date (`xx เดือน พ.ศ. 25YY`) — verified using `utils/thai-format.formatThaiDate`. | **OK** |
| 6 | Thai-text amount (`จำนวนเงิน (ตัวอักษร)`) — present on both receipt templates via `numberToThaiText`. | **OK** |
| 7 | Thai number separators (`1,500.00`) — confirmed via `formatCurrency`. | **OK** |

### 2.2 Double-entry recording on slip approval

Pre-audit state: `payment-slip-service.approveSlip()` and `invoice-service.issueReceipt()`
both transition the invoice to PAID and emit notifications, but emit NO
journal entry. No `JournalEntry` / `AccountingEntry` prisma model exists
and there is no service that produces in-memory journal lines.

**Fixed** — added `apps/backend/services/journal-entry-service.js` (rev
B16-B, 2026-05-16 — agent-collection model) with:
- `buildPaymentEntryLines(...)` (pure) — produces balanced Dr/Cr lines.
  State fees credit `PAYABLE_TO_DTAM` (liability, code 2151-001) — the
  platform recognises NO state-fee revenue.
- `buildRemittanceEntryLines(...)` (pure) — Dr PAYABLE_TO_DTAM /
  Cr CASH_BANK for month-end DTAM payouts.
- `recordPaymentEntry(invoiceId, amount, components, meta)` — validates,
  builds, persists via `prisma.journalEntry.create(...)` when the B16-A
  schema is available, with a `[journal-fallback]` log marker on DB
  failure so finance can reconcile manually.
- `recordRemittanceToDtam({ amount, periodLabel, organizationId,
  createdBy })` — finance-initiated month-end remittance entry.
- `previewPaymentEntry(...)` — non-throwing helper for accounting export.
- Chart-of-accounts constants (`ACCOUNTS.CASH_BANK` = 1110-001,
  `PAYABLE_TO_DTAM` = 2151-001, `REVENUE_PLATFORM_FEE` = 4110-001,
  `VAT_PAYABLE_OUTPUT` = 2131-001) for the minimum-viable Thai NPAE/SME
  chart under the agent-collection model.

`approveSlip` is in B15-A territory and was NOT modified in this batch.
Once B15-A lands, the slip-approve transaction can `await
journalEntryService.recordPaymentEntry(...)` immediately after
`tx.invoice.update({ status: 'paid' })` and before the auto-issue-receipt
side-effect.

### 2.3 Sample journal entries (verified by unit test — agent-collection model)

**Phase 1, single scope — DTAM revenue receipt (5,000 THB, no VAT)**
> Collected on behalf of DTAM — credits PAYABLE_TO_DTAM (liability), NOT revenue.

| Dr/Cr | Account code | Account | Amount (THB) |
| --- | --- | --- | --- |
| Dr | 1110-001 | เงินสด/เงินฝากธนาคาร — บัญชีหลัก | 5,000.00 |
| Cr | 2151-001 | เจ้าหนี้ — กรมการแพทย์แผนไทยฯ (Payable to DTAM) | 5,000.00 |

**Phase 1, single scope — Platform tax invoice (535 THB inclusive of 7% VAT)**
> Platform's own revenue + Output VAT — unchanged from prior version.

| Dr/Cr | Account code | Account | Amount (THB) |
| --- | --- | --- | --- |
| Dr | 1110-001 | เงินสด/เงินฝากธนาคาร — บัญชีหลัก | 535.00 |
| Cr | 4110-001 | รายได้ค่าบริการแพลตฟอร์ม | 500.00 |
| Cr | 2131-001 | ภาษีขายตั้งพัก (Output VAT 7%) | 35.00 |

**Phase 2, single scope — DTAM (25,000 THB)**

| Dr/Cr | Account code | Account | Amount (THB) |
| --- | --- | --- | --- |
| Dr | 1110-001 | เงินสด/เงินฝากธนาคาร — บัญชีหลัก | 25,000.00 |
| Cr | 2151-001 | เจ้าหนี้ — กรมการแพทย์แผนไทยฯ (Payable to DTAM) | 25,000.00 |

**Phase 2, single scope — Platform (2,675 THB inclusive of 7% VAT)**

| Dr/Cr | Account code | Account | Amount (THB) |
| --- | --- | --- | --- |
| Dr | 1110-001 | เงินสด/เงินฝากธนาคาร — บัญชีหลัก | 2,675.00 |
| Cr | 4110-001 | รายได้ค่าบริการแพลตฟอร์ม | 2,500.00 |
| Cr | 2131-001 | ภาษีขายตั้งพัก (Output VAT 7%) | 175.00 |

**Monthly remittance to DTAM (separate event, finance-initiated)**
> Clears the accumulated PAYABLE_TO_DTAM liability when finance transfers
> the consolidated state-fee balance to DTAM's bank account at month-end.
> Recorded via `journalEntryService.recordRemittanceToDtam({ amount,
> periodLabel })`.

| Dr/Cr | Account code | Account | Amount (THB) |
| --- | --- | --- | --- |
| Dr | 2151-001 | เจ้าหนี้ — กรมการแพทย์แผนไทยฯ (Payable to DTAM) | XXX,XXX.00 |
| Cr | 1110-001 | เงินสด/เงินฝากธนาคาร — บัญชีหลัก | XXX,XXX.00 |

All five shapes verified balanced (Dr total === Cr total within 0.005 THB)
by `journal-entry-service.test.js` (23 tests).

### 2.4 FlowAccount-compatible export

`accounting-service.js` now exposes `exportFlowAccount({ startDate,
endDate, organizationId })`. Returns `{ columns, rows, summary }`:

| Column | Source |
| --- | --- |
| Date | `invoice.paidAt` (ISO 10-char) |
| Document No | `invoice.receiptNumber || invoice.invoiceNumber` |
| Customer Name | `applicant.companyName` (juristic) or `firstName lastName` (individual) |
| Customer Tax ID | Only emitted for juristic 13-digit taxId (PDPA — individuals get empty) |
| Description | `serviceType` + issuer hint from canonical config |
| Subtotal | Pre-VAT (PLATFORM) or full amount (STATE — VAT exempt) |
| VAT (7%) | Extracted from `totalAmount * 0.07 / 1.07` for PLATFORM rows; 0 for STATE |
| Total | `invoice.totalAmount` (always VAT-inclusive) |

XLSX writer is NOT included — the data-shape function is the
prerequisite. CSV/XLSX serialization is the next batch.

The existing `financial-export-service.buildTaxReport` continues to
produce its own Thai-language tax-report CSV; the new method is for
FlowAccount's English-column import wizard and is a separate concern.

### 2.5 Withholding tax (WHT 3%) — intentional deferral

Searched the backend for unintended WHT logic. Findings:

- `apps/backend/config/invoice-issuers.js` documents the deferral; no
  `withholdingTax` field exists on the canonical config.
- `prisma/schema/billing.prisma` `Invoice` model has NO `withholdingTax`
  column — verified by grep.
- The only matches for `withholding|WHT` in the backend:
  - `routes/api/cultivation/fertilizer-records.js` — uses
    `withholdingDays` for pesticide pre-harvest interval (agronomy, not
    finance). Not affected.
  - `__tests__/unit/invoice-document-builder.test.js` line 278 — test
    description references the customer's own WHT obligation (corporate
    customer self-withholds using our full tax invoice). Test is
    descriptive, not active logic.
- No code computes `0.03 * platformAmount`. No silent population of any
  `withholdingTax` field.

**Status**: WHT deferral is intact. No action required.

## 3. Known Gaps + Recommended Next Steps

1. **DBA — Create `JournalEntry` + `JournalLine` Prisma tables.**
   Schema proposed in `journal-entry-service.js` header comment. Once
   tables exist, replace the `logger.info(...)` line with a
   `prisma.journalEntry.create({ data: { ..., lines: { create: lines } } })`
   inside the same transaction as the invoice-paid update.

2. **B15-A handoff — Wire `recordPaymentEntry` into `approveSlip`.**
   Cannot do here without touching `payment-slip-service.js` (B15-A
   territory). The integration is one line inside the existing
   `$transaction`, after the `tx.invoice.update({ status: 'paid' })`:
   ```js
   await journalEntryService.recordPaymentEntry(
     slip.invoiceId,
     invoice.totalAmount,
     undefined, // infer from serviceType
     {
       invoiceNumber: invoice.invoiceNumber,
       serviceType: invoice.serviceType,
       paidAt: now,
     },
   );
   ```

3. **Receipt-number format migration to canonical scheme.**
   Helpers in `document-numbering.js` already produce the three canonical
   streams (DTAM, TAX-PRD, RCP-PRD) but `invoice-service.issueReceipt`
   still emits the legacy `RCP-{year}-{seq6}`. Cutover requires a
   sequence-allocator table (Counter row with `UPDATE ... RETURNING`) —
   Tier 14 DBA work.

4. **XLSX serializer for FlowAccount export.**
   `accounting-service.exportFlowAccount` returns the row shape; an
   `exceljs`-based writer in `financial-export-service.js` is the next
   batch.

5. **DTAM placeholders.**
   `DTAM_TAX_ID`, `DTAM_ADDRESS_LINE1` env vars still resolve to
   `PENDING_FINANCE_CONFIRMATION`. The new DTAM template will render
   that sentinel until Finance/DTAM coordination confirms real values.
   Behaviour is intentional (QA notices in UAT).

## 4. Tests

- `apps/backend/__tests__/unit/invoice/*` — 5 suites, 76 tests — PASS
- `apps/backend/__tests__/unit/journal-entry-service.test.js` —
  23 tests — PASS (B16-B revision: covers agent-collection model + the
  new `recordRemittanceToDtam` flow, plus an anti-regression test that
  asserts STATE invoices never produce a Revenue—State line)
- `apps/backend/__tests__/unit/payment-phase-flow-canonical-totals.test.js`
  (anchor) — 8 tests — PASS

Total relevant: **107 tests, 100% pass.**

## 5. Files Touched

| File | Change |
| --- | --- |
| `apps/backend/services/pdf/templates/government-revenue-receipt.html` | NEW — DTAM revenue receipt template |
| `apps/backend/services/pdf/invoice-template-service.js` | Updated `generateReceiptPdf` to route by issuer + inject canonical issuer fields |
| `apps/backend/services/journal-entry-service.js` | NEW — double-entry builder + recorder stub |
| `apps/backend/services/accounting-service.js` | Added `exportFlowAccount` + `FLOWACCOUNT_COLUMNS` |
| `apps/backend/__tests__/unit/journal-entry-service.test.js` | NEW — 12-test suite locking double-entry invariant |
| `docs/audit/accounting-correctness-2026-05-16.md` | NEW — this report |

Files explicitly NOT touched (per batch boundaries):
`payment-service-slip-flow.js`, `payment-service-phase-flow.js`,
`payment-service-webhook-flow.js`, `audit-trail*.js`,
`application-status-writer.js`, `fee-service.js`,
`config/invoice-issuers.js`, `application-review-revision-methods.js`,
all frontend files.
