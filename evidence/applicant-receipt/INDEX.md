# evidence/applicant-receipt — fix/applicant-receipt-and-billing-scope

| file | what it holds |
|---|---|
| red-output.txt | every RED run of this branch: command, counts, and the failing assertion lines only (2026-09-29 P1/P2/P5/P6, 2026-09-30 §3.3 one paper, 2026-09-30 review round 1) |
| test-output.txt | every GREEN run: command, suite and test counts, probe lines, tier-check selftest, tsc / next build exit codes (latest first) |
| view-pack/INDEX.md | the receipt / tax invoice paper rendered from Postgres rows (company and community enterprise), the one-page before/after, and the intercepted payments-page render |

Raw jest output is not kept here (review I-2); it is in the git history of this branch.
The full suite's rewrite of `evidence/payer-block/after/*` is restored after each run and is not part of this branch.
