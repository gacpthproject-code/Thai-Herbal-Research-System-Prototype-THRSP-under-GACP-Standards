# local-gate round 6 vs baseline — the closing gate for the whole branch

Criterion (operator, START-HERE step 1): **no new failures vs baseline**.

| | baseline | round 5 (B1 fixes) | **round 6 (whole branch)** |
|---|---|---|---|
| HEAD | d44cbd98 | f68e86b1 + fixes | **ed51743d** |
| commits ahead of `origin/main` | 0 | 5 | **59** |
| probe FAIL | 5 | 5 (same names) | **5 (same names)** |
| suites failed | 4 | 3 | **2** |
| tests failed | 8 | 7 | **4** |
| tests passed | 9,767 | 9,839 | **10,327** |
| suites total | 755 | 761 | **822** |

Round 5 covered the five B1 commits only. Round 6 is the first full gate over the
entire branch — 59 commits, including the wizard, the officer surfaces, the
T&T scope work and the กทล.1 renderer.

- command: `NODE_OPTIONS=--max-old-space-size=3072 LOCAL_GATE_FULL=1 bash scripts/ci/local-gate.sh`
- tier: **B** (`scripts/probes/tier-check.sh`)
- baseline log: `/home/ubuntu/backups/local-gate-b1.txt` (2026-09-04 23:58)
- round 6 log: `/home/ubuntu/backups/local-gate-b1-round6-ed51743d.txt` (2026-09-06 06:26)
- comparator: `evidence/appv2-B1-gate/compare-gate-vs-baseline.sh <baseline> <run>`

## comparison, verbatim
```
===== probes =====
-- baseline: 5  new: 5
OK — no new probes failures

===== suites =====
-- baseline: 4  new: 2
OK — no new suites failures
.. fixed since baseline:
FAIL __tests__/unit/application-status-writer-cert-hook-evidence-gate.test.js
FAIL __tests__/unit/error-codes-catalog.test.js

===== tests =====
-- baseline: 8  new: 4
OK — no new tests failures
.. fixed since baseline:
● AUDIT_PASSED auto-issue hook -> REAL generateCertificate -> REAL onsite-evidence-gate (choke point) › cert-gen refuses (EVIDENCE_CAPTURE_UNAVAILABLE — audit row exists but photo/checklist models are not provisioned) -> same refuse-and-revert contract
● AUDIT_PASSED auto-issue hook -> REAL generateCertificate -> REAL onsite-evidence-gate (choke point) › cert-gen refuses (NO_ONSITE_AUDIT) -> writer rolls the status back to fromStatus and re-throws -> caller tx aborts, nothing persists at AUDIT_PASSED
● AUDIT_PASSED auto-issue hook -> REAL generateCertificate -> REAL onsite-evidence-gate (choke point) › control: sufficient evidence -> the real chain mints a certificate and does NOT roll back
● shared/error-codes catalog › every discovered code is catalogued (no drift between code and catalog)

===== step verdicts (new run) =====
[local-gate] banned-terms: PASS
[local-gate] green-mask: PASS
[local-gate] mojibake: PASS
[local-gate] probe-gate: FAIL
[local-gate] unit-suite: FAIL

===== totals =====
baseline: Test Suites: 4 failed, 21 skipped, 730 passed, 734 of 755 total Tests: 8 failed, 142 skipped, 9767 passed, 9917 total 
new     : Test Suites: 2 failed, 30 skipped, 790 passed, 792 of 822 total Tests: 4 failed, 201 skipped, 10327 passed, 10532 total 

VERDICT: NO NEW FAILURES vs baseline
```

## the 59 extra skipped tests are the ones this box cannot run, not tests turned off

`Tests: … 201 skipped` against the baseline's 142 is a +59 jump, and a rising skip
count is exactly how a suite goes quietly green. It is accounted for in full:

- 67 backend test files were added since d44cbd98; **9 of them are database-gated**
  (`describeIfTestDatabase`), which is the whole of the +9 suites-skipped delta
  (21 → 30).
- those 9 hold **59 tests** — 55 plain `test(...)` plus `staff-scope-contract`'s
  `describe.each` over three staff roles × 2 tests, which counts as 6 where the file
  shows 2. 55 − 2 + 6 = 59, the exact delta.
- `git diff d44cbd98..HEAD` adds **no** `describe.skip`, `it.skip`, `test.skip`,
  `xit` or `xdescribe` anywhere in `apps/backend` or `apps/web-app`.

They skip because this machine has no test database:

```
[jest-globalsetup] local test database is NOT reachable:
[jest-globalsetup] Suites that need a database will report it; unit tests are unaffected.
```

That is also the proof this run did **not** write to the shared Supabase database
that prod and preview both use: `apps/backend/.env` still points there, and
`jest.globalsetup.js` refused to attest it, so every suite that would have written
skipped instead. Same posture as the baseline run — which is what makes the two
comparable at all.

## the two suites still failing both fail identically on the baseline
`auth-idp-providers-endpoint` and `farm-entityid-stamp`. Two of the baseline's four
are now fixed: `error-codes-catalog` (by e4da61a5) and
`application-status-writer-cert-hook-evidence-gate`.

## secret scan scoped to this branch
```
$ gitleaks detect --source . --log-opts=origin/main..HEAD --redact
59 commits scanned. no leaks found.
```
The whole-history leaks behind the `no-secret` probe FAIL are pre-existing on main
and fail identically in the baseline (AUDIT_LEDGER L-059/L-060).

## signing keys survived the suite
Memory: `npx jest` once rotated `apps/backend/keys` and voided a real certificate.
```
before: 8db3682b66b03b05efc7bddce0e73fe8 private.pem / f0c36f7313461a44aa548dfb45d522bc public.pem
after : 8db3682b66b03b05efc7bddce0e73fe8 private.pem / f0c36f7313461a44aa548dfb45d522bc public.pem
```
These are a fresh local pair. The pair that changed on 2026-09-05 was the
bad-decrypt one now held in `apps/backend/keys/quarantine-2026-09-05-orphaned-passphrase/`,
which was checked against all three real databases before being moved and signs
nothing anywhere.

---

# Round 7 — re-run after the layer-2 security review changed source

Round 6 was the closing gate for the branch as it stood. The layer-2 security review
(`security-review-layer2-2026-09-06.md`) then found and fixed a real defect in
`routes/api/cultivation/harvest-batches.js`, so round 6's verdict no longer covered
the tree. Re-run on `2404d591`.

| | baseline | round 6 | **round 7** |
|---|---|---|---|
| HEAD | d44cbd98 | ed51743d | **2404d591** |
| probe FAIL | 5 | 5 (same names) | **5 (same names)** |
| suites failed | 4 | 2 | **2** |
| tests failed | 8 | 4 | **4** |
| tests passed | 9,767 | 10,327 | **10,330** |

The +3 are the three RED tests written for the COA fix.

## comparison, verbatim
```
===== probes =====
-- baseline: 5  new: 5
OK — no new probes failures

===== suites =====
-- baseline: 4  new: 2
OK — no new suites failures
.. fixed since baseline:
FAIL __tests__/unit/application-status-writer-cert-hook-evidence-gate.test.js
FAIL __tests__/unit/error-codes-catalog.test.js

===== tests =====
-- baseline: 8  new: 4
OK — no new tests failures
.. fixed since baseline:
● AUDIT_PASSED auto-issue hook -> REAL generateCertificate -> REAL onsite-evidence-gate (choke point) › cert-gen refuses (EVIDENCE_CAPTURE_UNAVAILABLE — audit row exists but photo/checklist models are not provisioned) -> same refuse-and-revert contract
● AUDIT_PASSED auto-issue hook -> REAL generateCertificate -> REAL onsite-evidence-gate (choke point) › cert-gen refuses (NO_ONSITE_AUDIT) -> writer rolls the status back to fromStatus and re-throws -> caller tx aborts, nothing persists at AUDIT_PASSED
● AUDIT_PASSED auto-issue hook -> REAL generateCertificate -> REAL onsite-evidence-gate (choke point) › control: sufficient evidence -> the real chain mints a certificate and does NOT roll back
● shared/error-codes catalog › every discovered code is catalogued (no drift between code and catalog)

===== step verdicts (new run) =====
[local-gate] banned-terms: PASS
[local-gate] green-mask: PASS
[local-gate] mojibake: PASS
[local-gate] probe-gate: FAIL
[local-gate] unit-suite: FAIL

===== totals =====
baseline: Test Suites: 4 failed, 21 skipped, 730 passed, 734 of 755 total Tests: 8 failed, 142 skipped, 9767 passed, 9917 total 
new     : Test Suites: 2 failed, 30 skipped, 790 passed, 792 of 822 total Tests: 4 failed, 201 skipped, 10330 passed, 10535 total 

VERDICT: NO NEW FAILURES vs baseline
```

## the commits after 2404d591 are docs-only, and covered separately
HEAD at the time of writing is `b92fd48c`, three commits later. `git diff --stat
2404d591..HEAD` touches only `BACKLOG-FOUND.md`,
`docs/proposals/2026-09-06-two-money-decisions.md` and this evidence directory — no
source, so the jest verdict above still holds. The three probes that DO read those
files were run on the final tree rather than assumed:

```
[banned-terms]   Repository scan passed                                    exit=0
[encoding-check] PASS: no mojibake markers or UTF-8 BOM files found        exit=0
[green-mask]     PASS — 1243 file(s) scanned; no net-new masks             exit=0
```

## ratchet (L4)
```
$ bash scripts/probes/ratchet.sh
hardcode: 24 · todo: 56 · env-direct: 114 · dup-source: 0
PASS: no counter above baseline
```

## tier (L5) — decided by the machine, not by me
```
$ bash scripts/probes/tier-check.sh
TIER=C
```
C because the branch touches a prisma migration and schemas, `config/boot-secret-guard.js`,
`services/tenant-prisma-extension.js`, `auth/_components/login-chooser.tsx`,
`services/billing/w14-boundary.js`, `health/payments/client-view.tsx` and `.github/workflows/ci.yml`.
Neither money file changes an amount: `w14-boundary.js` is a refusal guard that holds no
figure, and the payments diff replaces a four-document strip with the three the operator's
own ruling names. **Tier C means the operator merges — L5, no exception.**

---

# Round 8 — after F-APPV2-02 (the door that accepts which law judges the filing)

| | baseline | round 7 | **round 8** |
|---|---|---|---|
| HEAD | d44cbd98 | 2404d591 | **2effe465** |
| probe FAIL | 5 | 5 (same names) | **5 (same names)** |
| suites failed | 4 | 2 | **2** |
| tests failed | 8 | 4 | **4** |
| tests passed | 9,767 | 10,330 | **10,350** |
| suites total | 755 | 822 | **824** |

The +20 tests and +2 suites are F-APPV2-02's own: 15 on the resolver, 5 on the wire.

## comparison, verbatim
```
===== probes =====
-- baseline: 5  new: 5
OK — no new probes failures

===== suites =====
-- baseline: 4  new: 2
OK — no new suites failures
.. fixed since baseline:
FAIL __tests__/unit/application-status-writer-cert-hook-evidence-gate.test.js
FAIL __tests__/unit/error-codes-catalog.test.js

===== tests =====
-- baseline: 8  new: 4
OK — no new tests failures
.. fixed since baseline:
● AUDIT_PASSED auto-issue hook -> REAL generateCertificate -> REAL onsite-evidence-gate (choke point) › cert-gen refuses (EVIDENCE_CAPTURE_UNAVAILABLE — audit row exists but photo/checklist models are not provisioned) -> same refuse-and-revert contract
● AUDIT_PASSED auto-issue hook -> REAL generateCertificate -> REAL onsite-evidence-gate (choke point) › cert-gen refuses (NO_ONSITE_AUDIT) -> writer rolls the status back to fromStatus and re-throws -> caller tx aborts, nothing persists at AUDIT_PASSED
● AUDIT_PASSED auto-issue hook -> REAL generateCertificate -> REAL onsite-evidence-gate (choke point) › control: sufficient evidence -> the real chain mints a certificate and does NOT roll back
● shared/error-codes catalog › every discovered code is catalogued (no drift between code and catalog)

===== step verdicts (new run) =====
[local-gate] banned-terms: PASS
[local-gate] green-mask: PASS
[local-gate] mojibake: PASS
[local-gate] probe-gate: FAIL
[local-gate] unit-suite: FAIL

===== totals =====
baseline: Test Suites: 4 failed, 21 skipped, 730 passed, 734 of 755 total Tests: 8 failed, 142 skipped, 9767 passed, 9917 total 
new     : Test Suites: 2 failed, 30 skipped, 792 passed, 794 of 824 total Tests: 4 failed, 201 skipped, 10350 passed, 10555 total 

VERDICT: NO NEW FAILURES vs baseline
```

## why the new codes are not in the error catalogue
`PREVIOUS_CERTIFICATE_*` are **notice** codes, not error codes: the draft save SUCCEEDS
and returns them in `data.lawNotice`. Asked the extractor directly rather than assuming —
`extract()` finds 369 codes and none of mine, so `error-codes-catalog` is green because
there is genuinely no drift, not because something was missed.

Leaving them out is the design, not an omission. Each notice carries its own Thai sentence,
so the browser renders `messageTh` and never switches on the code — there is no client-side
lookup table that could fall out of step with a server-side one. That is the same lesson the
requirements refusal taught (d183f506): send the sentence, not a code the client must
translate. The code exists for the log.

---

# Round 9 — after F-TNT-AUDIT-01 (PDPA ม.39 access-log coverage)

| | baseline | round 8 | **round 9** |
|---|---|---|---|
| HEAD | d44cbd98 | 2effe465 | **ddda0e15** |
| probe FAIL | 5 | 5 (same names) | **5 (same names)** |
| suites failed | 4 | 2 | **2** |
| tests failed | 8 | 4 | **4** |
| tests passed | 9,767 | 10,350 | **10,357** |

## comparison, verbatim
```
===== probes =====
-- baseline: 5  new: 5
OK — no new probes failures

===== suites =====
-- baseline: 4  new: 2
OK — no new suites failures
.. fixed since baseline:
FAIL __tests__/unit/application-status-writer-cert-hook-evidence-gate.test.js
FAIL __tests__/unit/error-codes-catalog.test.js

===== tests =====
-- baseline: 8  new: 4
OK — no new tests failures
.. fixed since baseline:
● AUDIT_PASSED auto-issue hook -> REAL generateCertificate -> REAL onsite-evidence-gate (choke point) › cert-gen refuses (EVIDENCE_CAPTURE_UNAVAILABLE — audit row exists but photo/checklist models are not provisioned) -> same refuse-and-revert contract
● AUDIT_PASSED auto-issue hook -> REAL generateCertificate -> REAL onsite-evidence-gate (choke point) › cert-gen refuses (NO_ONSITE_AUDIT) -> writer rolls the status back to fromStatus and re-throws -> caller tx aborts, nothing persists at AUDIT_PASSED
● AUDIT_PASSED auto-issue hook -> REAL generateCertificate -> REAL onsite-evidence-gate (choke point) › control: sufficient evidence -> the real chain mints a certificate and does NOT roll back
● shared/error-codes catalog › every discovered code is catalogued (no drift between code and catalog)

===== step verdicts (new run) =====
[local-gate] banned-terms: PASS
[local-gate] green-mask: PASS
[local-gate] mojibake: PASS
[local-gate] probe-gate: FAIL
[local-gate] unit-suite: FAIL

===== totals =====
baseline: Test Suites: 4 failed, 21 skipped, 730 passed, 734 of 755 total Tests: 8 failed, 142 skipped, 9767 passed, 9917 total 
new     : Test Suites: 2 failed, 30 skipped, 793 passed, 795 of 825 total Tests: 4 failed, 201 skipped, 10357 passed, 10562 total 

VERDICT: NO NEW FAILURES vs baseline
```
