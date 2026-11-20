# Evidence — quotation validity 30 calendar days → 7 working days (2026-09-27)

Operator ruling, re-confirmed 2026-09-27: "ใบเสนอราคามีกำหนดยืนราคา 7 วันทำการ
นับจากวันที่ออก โดยไม่นับวันที่ออก". Worktree `wt-qtdays`, branch
`fix/quotation-7-working-days`, base main `87b197bf`.

## RED (captured before the fix)
- `red-output.txt` — `apps/backend/__tests__/unit/quotation-validity-seven-working-days.test.js`
  run against the pre-fix `quotation-service.js` (still `DEFAULT_VALIDITY_DAYS = 30`
  calendar days). All 3 cases fail with the wrong `validUntil`.
- `red-output-pdf.txt` — `apps/backend/__tests__/unit/quotation-pdf-prints-validity-date.test.js`
  run with `apps/backend/services/pdf/invoice-template-service.js` and
  `templates/quotation.html` reverted to HEAD (`git stash`) — the template has no
  validity line at all, so both assertions fail.

## GREEN (after the fix)
- `test-output-new-tests.txt` — both new test files passing (5/5) against the
  fixed code.
- `backend-full-suite-output.txt` — full backend jest run (tail of output;
  `NODE_OPTIONS=--max-old-space-size=3072`, fresh `SIGNING_KEY_DIR=$(mktemp -d)`).
  Summary: **858 suites passed / 890 total (32 skipped), 11025 tests passed /
  11246 total (221 skipped), 0 failed** — exit code 0. Baseline on main: 856
  suites / 11020 passed of 11241. The +2 suites / +5 tests are exactly the two
  new test files added by this change; no pre-existing suite regressed.
  `/home/ubuntu/work/GACP-Certification-Application/apps/backend/keys/private.pem`
  mtime confirmed UNCHANGED before and after (1788623435 / 2026-09-05 22:50
  both times) — the signing key did not rotate during this run.
- `web-full-jest-output.txt` — full web-app jest run. **404 suites / 404,
  3298 tests / 3298, 0 failed** — matches the given baseline exactly.
- `web-tsc-output.txt` — `npx tsc --noEmit` on `apps/web-app`, empty (no errors).
- `web-next-build-output.txt` — `npx next build`, exit code 0, all routes
  compiled.

## Gate probes (run from the worktree)
- `retired-words-output.txt` — PASS.
- `ratchet-output.txt` — PASS, current counts (hardcode=27, todo=53,
  env-direct=102, dup-source=0) all below the AUDIT_LEDGER.md baseline
  (36/56/122/2) — not risen.
- `no-secret-output.txt` — PASS (layer1 grep 0 hits, layer2 gitleaks clean).
- `tier-check-output.txt` — `TIER=C` (money path — quotation validity date/text
  in `config/business-rules.js`, `quotation-service.js`, `quotation-gate.js`,
  the PDF template/renderer, and three web-app files). Per CLAUDE.md L5/§5,
  Tier C merges are operator-only.

## Rendered quotation — before / after
- `before.html` — the ใบเสนอราคา HTML (Puppeteer stubbed out; the real
  `templates/quotation.html` + `invoice-template-service.js` run through the
  actual substitution) with the code reverted to HEAD via `git stash`. Line 105
  prints only `วันที่เอกสาร: 27 ก.ย. 2569` — no validity line at all.
- `after.html` — the same render on the fixed code, same row
  (`validUntil = 2026-09-29T16:59:59.999Z`, the 7th working day after Fri
  2026-09-18 per the hand calculation in
  `quotation-validity-seven-working-days.test.js`). Line 105-106 now print
  `วันที่เอกสาร: 27 ก.ย. 2569` and `ยืนราคาถึงวันที่: 29 ก.ย. 2569`.
- Neither file contains the string `30 วัน`.

## Note on this evidence directory's own tier-check row
`tier-check-output.txt` classifies `evidence/.../no-secret-output.txt` as
`(secret-material)` — that is tier-check's filename heuristic reacting to the
word "secret" in the filename, not an actual secret in the file; its content is
just `PASS: layer1 grep: 0 hits · layer2 gitleaks: clean`.
