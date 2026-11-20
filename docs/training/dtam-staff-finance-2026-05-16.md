# Finance Team Training

**Audience**: finance officers on both sides (`finance_officer_dtam`, `finance_officer_platform`)
**Rewritten**: 2026-10-06 (operator ruling: no person approves a payment). The 2026-05-16 version described a slip-review queue, bank-transfer checks and manual receipts. None of that exists.

---

## 1. How an applicant pays

1. The applicant opens the payment page for a fee milestone and accepts the payment terms.
2. The applicant pays through the payment gateway (Stripe checkout: PromptPay QR, card only when the operator enables it). Staging and demo run in test mode.
3. The gateway sends a signed webhook. The platform verifies the signature, and `checkout-settlement-service.js` settles the order. It is the only code that writes `SETTLED`.
4. The same settlement issues the receipt / tax invoice and posts the journal entry.
5. The application moves on by itself: `PENDING_DOC_FEE` to `DOC_FEE_PAID`, `PENDING_AUDIT_FEE` to `AUDIT_FEE_PAID`.

No person approves, confirms, verifies, holds or marks a payment paid. There is no bank transfer, no slip upload, no slip queue, no manual receipt and no invoice hold or release. A status write to `DOC_FEE_PAID` or `AUDIT_FEE_PAID` from anyone but the system is refused with `PAYMENT_NOT_SETTLED` (409) unless a settled order for that milestone exists. Admin force-status does not offer the paid states.

---

## 2. What finance officers do

Both finance roles see the same billing data (operator 2026-09-11). Open **ธุรกรรมการเงิน** (`/provider/accounting`).

- View invoices, payment status and the receipts the system issued.
- Run reports: general ledger, tax (VAT), AR aging, and exports.
- Watch webhook exceptions (settlements the pipeline could not complete) and report them. Do not fix money rows by hand.

`finance_officer_dtam` is read-only (operator 2026-09-27).

`finance_officer_platform` also keeps the company-side accounting records:

- credit notes and debit notes
- refunds, recorded as accounting records
- withholding-tax certificates
- purchase invoices (input VAT)
- journal drafts
- period close

---

## 3. Fee-waiver reopen approval

When an inspector asks to reopen an expired application, either finance role approves or declines the request. The reopened application reuses the payment already settled. No new invoice is raised. You cannot approve a request you filed yourself.

This is a waiver decision. It is not a payment approval.

---

## 4. Quick reference

- Payment settles only from the verified gateway webhook.
- Receipts are issued by that settlement. Nobody issues one by hand.
- Finance views and reports. Finance does not approve payments.
