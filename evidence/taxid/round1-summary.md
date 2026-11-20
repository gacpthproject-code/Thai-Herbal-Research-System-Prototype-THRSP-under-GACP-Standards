# fix/invoice-tax-id — round 1 (commit ac730b40, on top of 08f800e6)

Summary only — full jest logs are not committed (they carry full rendered HTML +
a base64 logo data URL). Ran on a throwaway Postgres 17 container,
`ENABLE_PDPA_FIELD_ENCRYPTION=true`, real `entity-service.js` create paths (so
`juristicId`/`thaiCitizenId` are genuinely `enc:v1:`-encrypted at rest, not
injected by the test), `SIGNING_KEY_DIR=$(mktemp -d)`, Node 24.

## RED on 08f800e6 (before this round's fix)
`__tests__/integration/invoice-tax-id-select.test.js` (at the round-1 test-file
version — the individual-payer suite only; the decrypt-marker suite did not
exist yet): **2 failed, 5 passed, 7 total**.

Failing (both fail at `expect(html).not.toContain(INDIVIDUAL_NATIONAL_ID)` /
the PAYER_ID value assertion):
- `generateInvoicePdf never prints the national ID, in full or in part, as the payer value`
- `generateReceiptPdf never prints the national ID, in full or in part, as the payer value`

Cause: `getForDocument()`'s entity select carried `thaiCitizenId` (added to fix
the juristic/company tax id), which `applicant-resolver.js` then returned as
`payer.id` for an INDIVIDUAL payer, printed verbatim as PAYER_ID.

## GREEN after removing `thaiCitizenId` from the select (adding `communityRegNo`)
Same file: **7/7 pass**.

## Gate re-runs (all pass, no ratchet increase)
- `invoice-service.test.js` + `prisma-select-field-guard.test.js` +
  `error-codes-source-pointers.test.js`: 48/48 pass (RECEIPT_NOT_ISSUED source
  pointer in `shared/error-codes.js` updated 587→597, drifted by an added
  comment block).
- `retired-words.sh` / `ratchet.sh` (hardcode=27 todo=53 env-direct=101
  dup-source=0, unchanged) / `no-secret.sh`: PASS.
- `apps/backend/keys/private.pem` mtime unchanged across the whole round.
