# local-gate vs baseline — feat/application-submission-v2 (B1 fix batch)

Criterion (operator, START-HERE step 1): **no new failures vs baseline**.

| | baseline | round 4 (f68e86b1) | round 5 (+ review-layer-2 fixes) |
|---|---|---|---|
| HEAD | d44cbd98 | f68e86b1 | f68e86b1 + fixes |
| probe FAIL | 5 | 5 (same names) | 5 (same names) |
| suites failed | 4 | 3 | 3 |
| tests failed | 8 | 7 | 7 |
| tests passed | 9767 | 9833 | 9839 |
| suites total | 755 | 761 | 761 |

The one suite fixed since baseline is `error-codes-catalog` (e4da61a5, which the
baseline predates). The 3 that remain fail identically on the baseline:
`application-status-writer-cert-hook-evidence-gate`, `auth-idp-providers-endpoint`,
`farm-entityid-stamp`.

- command: `NODE_OPTIONS=--max-old-space-size=3072 LOCAL_GATE_FULL=1 bash scripts/ci/local-gate.sh`
- tier: **B** (`scripts/probes/tier-check.sh`)
- baseline log: `/home/ubuntu/backups/local-gate-b1.txt` (2026-09-04 23:58)
- round 4 log: `/home/ubuntu/backups/local-gate-b1-round4-f68e86b1.txt`
- round 5 log: `/home/ubuntu/backups/local-gate-b1-round5-review2-fixes.txt`
- comparator: `evidence/appv2-B1-gate/compare-gate-vs-baseline.sh <baseline> <run>`
  (strips ANSI before matching — jest colours its summary when it sees a TTY, and a
  colour code must never be able to hide a failure; it also fails loudly if it cannot
  parse a jest summary at all, rather than reporting zero failures)

## round 5 comparison, verbatim
```
===== probes =====
-- baseline: 5  new: 5
OK — no new probes failures

===== suites =====
-- baseline: 4  new: 3
OK — no new suites failures
.. fixed since baseline:
FAIL __tests__/unit/error-codes-catalog.test.js

===== tests =====
-- baseline: 8  new: 7
OK — no new tests failures
.. fixed since baseline:
● shared/error-codes catalog › every discovered code is catalogued (no drift between code and catalog)

===== step verdicts (new run) =====
[local-gate] banned-terms: PASS
[local-gate] green-mask: PASS
[local-gate] mojibake: PASS
[local-gate] probe-gate: FAIL
[local-gate] unit-suite: FAIL

===== totals =====
baseline: Test Suites: 4 failed, 21 skipped, 730 passed, 734 of 755 total Tests: 8 failed, 142 skipped, 9767 passed, 9917 total 
new     : Test Suites: 3 failed, 21 skipped, 737 passed, 740 of 761 total Tests: 7 failed, 142 skipped, 9839 passed, 9988 total 

VERDICT: NO NEW FAILURES vs baseline
```

## secret scan scoped to this branch
```
$ gitleaks detect --source . --log-opts=origin/main..HEAD --redact
4 commits scanned. no leaks found.
```
The 319 whole-history leaks behind the `no-secret` probe FAIL are pre-existing on
main and fail identically in the baseline (AUDIT_LEDGER L-059/L-060).

## signing keys survived the suite
Memory: `npx jest` once rotated `apps/backend/keys` and voided a real certificate.
```
before round 4: 8f2a512e5d341f5fb41fbe4e18d263ea private.pem / 94341a262fb464ac0af6c60db27f1518 public.pem
after  round 5: 8f2a512e5d341f5fb41fbe4e18d263ea private.pem / 94341a262fb464ac0af6c60db27f1518 public.pem
```
