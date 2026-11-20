# fix/invoice-tax-id — round 2 (security review fixes I1 + I2 + M3)

Summary only. Same setup as round 1 (throwaway Postgres 17,
`ENABLE_PDPA_FIELD_ENCRYPTION=true`, real entity-service create paths,
`SIGNING_KEY_DIR=$(mktemp -d)`, Node 24).

## I1 — PAYER_ID printed the raw `[PII_DECRYPT_FAILED]` marker, unguarded

New suite in `invoice-tax-id-select.test.js`: create a real JURISTIC entity
(genuinely encrypted `juristicId`), then corrupt the stored ciphertext
directly in Postgres (`update entities set "juristicId" = 'enc:v1:not-real-
ciphertext...'`) to force a real decrypt failure on read — the same shape a
rotated key / bit-rot produces.

**RED before the `payerIdPrintable()` shape-guard fix**
(`services/pdf/invoice-template-service.js`, PAYER_ID at both the
invoice/receipt sites): **2 failed, 8 passed, 10 total.**
- `generateInvoicePdf never prints [PII_DECRYPT_FAILED] — the payer value falls back to "-"` — failed: `expect(html).not.toContain('[PII_DECRYPT_FAILED]')`
- `generateReceiptPdf never prints [PII_DECRYPT_FAILED] — the payer value falls back to "-"` — failed, same assertion
- (sanity test that the marker is genuinely produced already passed, proving the RED is real, not a setup bug)

**GREEN after the fix**: whole file, all 3 suites (juristic, individual,
decrypt-failure): **10/10 pass.**

Fix: `payerIdPrintable(payer)` prints `payer.id` only when it has the shape the
printed type actually uses — `/^\d{13}$/` for JURISTIC (same check
`generateTaxInvoicePdf`'s `payerTaxIdSafe` already applied), `/^\d{11}$/` for
COMMUNITY_ENTERPRISE. Anything else (the decrypt marker, or an INDIVIDUAL id
reaching here by some other path) renders `-`.

## I2 — real RED for the COMPANY cases on the true base (05f35c77)

`08f800e6`'s commit message cited `evidence/taxid/{red,green}-output.txt`,
which did not exist; `round1/red-output.txt` (now removed, see M3) ran on
`08f800e6`, where the company cases already passed — not a real base RED.

Produced a genuine one: `git worktree add /home/ubuntu/work/wt-taxid-base
05f35c77` (untouched production code), copied ONLY the final
`invoice-tax-id-select.test.js` into that worktree, `pnpm install` +
`prisma migrate deploy` on the same scratch Postgres (no schema drift between
05f35c77 and this branch), ran the suite there, then removed the worktree.

**Base RED (05f35c77, unmodified production code): 5 failed, 5 passed, 10 total.**
- `invoiceService.getForDocument decrypts the payer tax id onto entity.juristicId` — failed: `entity.juristicId` is `undefined` (never selected)
- `generateInvoicePdf prints the real tax id, not "Tax ID -"` — failed: html did not contain the tax id
- `generateReceiptPdf prints the real tax id, not "Tax ID -"` — failed, same shape
- `generateTaxInvoicePdf prints the real tax id...` — failed: html did not contain the Thai-numeral tax id
- `sanity: the corrupted juristicId genuinely resolves to the [PII_DECRYPT_FAILED] marker on a real read` — failed: `entity.juristicId` is `undefined`, not the marker (base never selects the column at all, so the marker path cannot even be reached — a different, larger gap than round 2's fix, consistent with the whole branch's premise)

The 2 individual-payer tests and 2 decrypt-marker-print tests pass on base too
(base selects neither `thaiCitizenId` nor `juristicId`, so PAYER_ID is always
`-` there already — safe by omission, which is exactly the defect this whole
branch fixes).

## Gate re-runs (all pass, no ratchet increase)
- `invoice-service.test.js` + `prisma-select-field-guard.test.js` +
  `error-codes-source-pointers.test.js`: 48/48 pass.
- `retired-words.sh` / `ratchet.sh` (hardcode=27 todo=53 env-direct=101
  dup-source=0, unchanged) / `no-secret.sh`: PASS.
- `apps/backend/keys/private.pem` mtime unchanged across the whole round.

## Out of scope (left for fix/payer-block-by-type)
- M1 — COMMUNITY_ENTERPRISE payer label text.
- C1 — national ID leaking via the formData fallback path on quotations and
  entity-null applications (a different resolver path than the entity-based
  one this branch fixes).
