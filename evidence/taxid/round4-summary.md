# fix/invoice-tax-id — round 4 (security review blocker: dropped digits)

Summary only. `SIGNING_KEY_DIR=$(mktemp -d)`, Node 24.

## Finding

`utils/thai-numerals.js` `formatThaiTaxId` grouped a 13-digit tax id as
`normalized[0]-normalized[1]-normalized.slice(2,6)-normalized.slice(6,10)-normalized[12]`
— 1+1+4+4+1 = **11 digits**, silently dropping positions 11-12 (0-indexed
10-11). The header comment claimed the Revenue Department's grouping
"skips position 11", which is false: the real convention is 1-4-5-2-1
(X-XXXX-XXXXX-XX-X), keeping all 13 digits. On `main` this was invisible
because the one caller, `PAYER_TAX_ID_TH`, always printed `'-'` (fixed by
this whole branch); this branch is what first prints a real company tax id
through it (`invoice-template-service.js` `buildReceiptContext` — the
production receipt path — and `generateTaxInvoicePdf`), so merging as-is
would print a WRONG tax id on real company receipts and tax invoices.

## Fix

Regrouping changed to
`normalized[0]-normalized.slice(1,5)-normalized.slice(5,10)-normalized.slice(10,12)-normalized[12]`
(1-4-5-2-1, all 13 digits). Deleted the false "quirk" comment; rewrote the
JSDoc header + `@example` lines to the correct grouping and to record the
history (why an earlier version was wrong, so it isn't silently
reintroduced).

## RED-first

Per the coordinator's instruction, the existing asserts (integration file
+ unit-guard file) compared against `formatThaiTaxId(...)` itself — circular,
would pass under any grouping. Both changed to assert the LITERAL expected
string instead (`arabicToThai('0-1055-61234-56-0')` for the shared fixture
`0105561234560`). Added a new dedicated regression test in
`__tests__/unit/thai-numerals.test.js` asserting BOTH the literal expected
string AND that every one of the 13 input digits appears, in order, in the
output (round-trip through `thaiToArabic` + strip separators). Also updated
the two PRE-EXISTING pinned tests in that file (`0105568045932` →
`๐-๑๐๕๕-๖๘๐๔๕-๙๓-๒`, was pinned to the wrong 11-digit `๐-๑-๐๕๕๖-๘๐๔๕-๒`).

**RED before the fix** (`__tests__/unit/thai-numerals.test.js` +
`__tests__/unit/invoice-template-payer-tax-id-guard.test.js`): **4 failed, 26
passed, 30 total** — both pre-existing pinned tests, the new digit-preservation
regression test, and the tax-invoice "valid company id still prints" unit
test (now asserting the literal string) all failed against the old 11-digit
grouping.

**GREEN after the fix**: **30/30 pass.**

## Grep sweep for other callers/pins of the old form

Only 5 files reference `formatThaiTaxId` in the whole repo: the function
itself, and the 3 test files already updated above, plus
`invoice-template-service.js` (2 call sites, unchanged — they just call the
function, they don't pin its output literally). No other caller or test
pins the old 11-digit form.

Found, NOT fixed (different function, correct arithmetic, only its own
comment is mislabelled the same way — out of scope, logged in
`BACKLOG-FOUND.md`): `certificate-template-service.js` `maskNationalId`
masks the middle 5 digits for the certificate PDF; its slicing already
covers all 13 positions correctly (masked, not dropped) — only its comment
says "1-1-4-4-1" too.

## Full-gate addendum — `invoice-pdf-truth.test.js` fixture broken by the round-3 checksum guard

The full-gate run on `2a7e716b` found ONE new failure not in the main
baseline: `invoice-pdf-truth.test.js` › "labels a juristic payer with
company-name / Tax ID, never person labels" — the fixture's company id
`0105558123456` fails the DOPA mod-11 checksum (confirmed:
`isThaiIdChecksumValid('0105558123456')` → `false`), so round 3's
`isPrintableJuristicTaxId` guard correctly renders `-` instead of printing
it — the fixture was wrong, not the guard. Grepped the whole backend for
`0105558123456`: only this one file, two lines (the fixture and its
assertion). Fixed by swapping the fixture to the same checksum-VALID,
leading-`0` id already reused across this branch's other fixtures
(`0105561234560`, named `VALID_JURISTIC_TAX_ID_FIXTURE`) and asserting the
literal value. The guard was NOT weakened. Grepped for the same class more
broadly (`applicantType.*JURISTIC` + `taxId` across all test files) — every
other juristic-taxId fixture either already passes the checksum or is
consumed by a function this branch's guard doesn't touch (e.g.
`applicant-resolver.test.js` calls `resolveApplicantInfo` directly, never
`invoice-template-service.js`'s `payerIdPrintable`/`payerTaxIdSafe`).
`invoice-pdf-truth.test.js` re-run: **18/18 pass**.

## Gate re-runs (all pass, no ratchet increase)

- Real-DB integration file (`invoice-tax-id-select.test.js`), re-run on a
  fresh scratch Postgres 17 with the corrected literal assertion:
  **10/10 pass**.
- `invoice-service.test.js` + `error-codes-source-pointers.test.js` +
  `prisma-select-field-guard.test.js` + `invoice-template-payer-tax-id-guard.test.js`
  + `thai-numerals.test.js` + `invoice-pdf-truth.test.js`: **96/96 pass** —
  this round touched no line inside `invoice-service.js` /
  `invoice-template-service.js`, so no source-pointer drift this time.
- `retired-words.sh` / `ratchet.sh` (hardcode=27 todo=53 env-direct=101
  dup-source=0, unchanged) / `no-secret.sh`: PASS.
- `apps/backend/keys/private.pem` mtime unchanged across the whole round.
