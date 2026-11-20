# fix/invoice-tax-id — round 3 (security review Important finding)

Summary only. `SIGNING_KEY_DIR=$(mktemp -d)`, Node 24.

## Finding

The JURISTIC tax-id guard added in round 2 (`isPrintableJuristicTaxId`, née a
`/^\d{13}$/` shape check) accepted two wrong inputs: a checksum-INVALID
13-digit string (e.g. `0105561234561`, which fails the DOPA mod-11 checksum),
and a national-ID-shaped value (`1100000000008`) even when `applicantType`
says `'juristic'` — a personal ID is also exactly 13 digits.

## Fix

One shared predicate, `isPrintableJuristicTaxId(id)` (invoice-template-
service.js), used at all three JURISTIC print sites: `payerIdPrintable`
(PAYER_ID on invoice/receipt), `buildReceiptContext`'s `payerTaxId`
(tax-invoice's PAYER_TAX_ID_TH), and `generateTaxInvoicePdf`'s
`payerTaxIdSafe` (tax-invoice's PAYER_TAX_ID). It requires BOTH a valid
DOPA mod-11 checksum (`isThaiIdChecksumValid`, imported from the single
source `@gacp/validation/thai-id-checksum` — not re-implemented; `ratchet.sh`
dup-source stayed at 0) AND a leading digit of `'0'` (the juristic/company
registration-number convention; a personal ID's first digit is 1-8).

The COMMUNITY_ENTERPRISE 11-digit shape rule is unchanged and stays scoped to
`payerIdPrintable` only — it never fed the tax-invoice buyer tax id before
this round and does not now.

## RED-first (new unit file: `invoice-template-payer-tax-id-guard.test.js`)

Unit-level (no DB — the DB/PDPA-encryption path is the existing real-DB
integration file's job, kept unchanged). Fixtures set `invoice.entity`
directly; `generateInvoicePdf`/`generateReceiptPdf`/`generateTaxInvoicePdf`
called with `{ upload: false, htmlOnly: true }`.

**RED before the shared-predicate fix: 6 failed, 3 passed, 9 total.**
- `a checksum-INVALID company id never prints` — `generateInvoicePdf`,
  `generateReceiptPdf`, `generateTaxInvoicePdf`: all 3 failed (the invalid id
  printed instead of `-`).
- `a national-ID-shaped value on a JURISTIC payer never prints` —
  `generateInvoicePdf`, `generateReceiptPdf`, `generateTaxInvoicePdf`: all 3
  failed (the national id printed — confirmed by the Thai-numeral-grouped
  form on the tax invoice, proving the value genuinely reached the render).
- `a valid company id still prints (no regression)` — all 3 already passed
  (unaffected by the bug, confirming the RED is scoped to the two bad-input
  classes only).

**GREEN after the fix: 9/9 pass.**

## Gate re-runs (all pass, no ratchet increase)

- Real-DB integration file (`invoice-tax-id-select.test.js`), unchanged,
  re-run on a fresh scratch Postgres 17 (`prisma migrate deploy` clean):
  **10/10 pass**, same as round 2.
- `invoice-service.test.js` + `prisma-select-field-guard.test.js` +
  `error-codes-source-pointers.test.js` + this round's new unit file:
  **57/57 pass**. `shared/error-codes.js` pointers shifted again by the new
  comment blocks: `INVALID_ISSUER_SIDE` 868→892, `QUOTATION_PHASE_NOT_PRICED`
  1353→1381 (fixed). `RECEIPT_NOT_ISSUED` (invoice-service.js, untouched this
  round) stayed at 597.
- `retired-words.sh` / `ratchet.sh` (hardcode=27 todo=53 env-direct=101
  dup-source=0, unchanged) / `no-secret.sh`: PASS.
- `apps/backend/keys/private.pem` mtime unchanged across the whole round.
