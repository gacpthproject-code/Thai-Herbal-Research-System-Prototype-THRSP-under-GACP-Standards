# W12 view-pack — browser screenshots NOT produced. The upload step IS cut.

Date: 2026-08-22 · branch `fix/renewal-fee-30k` · worktree `gacp-wt-renewal`

## Where this landed

- **The document-upload step is REMOVED.** `upload-step.tsx` is deleted, the four
  `REQUIRED_DOCS` are gone, and `RenewalStep` no longer has an `'upload'` member.
- **Browser screenshots were still not produced.** The mocked-session E2E harness does
  not hold on this machine, on this branch or on main. That is recorded honestly below.
- **A real press was done instead**, against the live database with the real certificate
  the coordinator named. It is the stronger evidence, and it caught a defect the unit
  tests could not. See `../W12-REAL-PRESS.txt`.

An earlier version of this file said the step had been left in place. That was true when
it was written and is no longer true: the operator subsequently directed that a red
harness is a reason not to *claim* screenshot evidence, not a reason to skip the cut.

## What was proven, and how

| Claim | Evidence |
|---|---|
| The renewal endpoint was 404-ing | Live curl against the branch backend on `:8100`: `POST /api/applications/renewal` → **404**, `POST /api/applications/renewals` → **401** |
| The caller now matches the route | `src/__tests__/renewal-endpoint-contract.test.ts`, which reads the real route file. RED before the fix: 9 failed / 2 passed. GREEN: 11/11 |
| Creation really lands at the fast-path state | `../W12-REAL-PRESS.txt` — real DB, real certificate `GACP-TH-2569-85B448`, `status = PENDING_AUDIT_FEE` |
| The skip is really recorded | Same file — `RENEWAL_FAST_PATH_ENTRY` audit row written, full provenance on `formData` |
| The row really bills the single charge | Same file — DTAM `PHASE_2` 30,000 + PLATFORM 3,210 = 33,210, no `PHASE_1` line |
| The upload step is really gone | `renewal-endpoint-contract.test.ts` asserts the file is absent, `REQUIRED_DOCS` is gone, and the wizard no longer references uploads |
| The wizard still renders and submits | Full web suite: 302 suites / 2272 tests, all pass, including every renewal screen test |

## Why there are no browser screenshots

A capture spec was written against the repo's own mocked-session fixtures
(`playwright/fixtures.ts` — `loginAsHealthUser` + `mockApi`), the same harness
`playwright/renewal-flow.spec.ts` uses, pointed at a dev server built from this branch:

```
cd apps/web-app && npx next dev -p 3100      # branch build, confirmed LISTENING
E2E_BASE_URL=http://localhost:3100 npx playwright test ... --project=chromium --no-deps
```

The branch build serves fine. The seeded session does not survive the `/health/**` route
guard: the wizard heading appears for an instant, then the page is bounced to
`/auth/health/login`. `ATTEMPT-FAILED/what-the-capture-actually-got-login-page.png` is
what the run produced — the login page, not the wizard. It is kept so nobody mistakes
this directory for a real view-pack.

**Not a branch problem.** The untouched `playwright/renewal-flow.spec.ts` fails the same
way against both stacks:

| stack | build | result |
|---|---|---|
| `localhost:3100` | this branch | FAIL — session bounced to login |
| `localhost:3000` | main | FAIL — same |

The `setup` project (`e2e/auth.setup.ts`, a real login) also fails:
`loginAsHealth: not redirected to /health/dashboard ... login failed`. Real credentials
(`E2E_TEST_IDENTIFIER` / `E2E_TEST_PASSWORD`) are not present in `.env`, and the creds
file referred to could not be located anywhere in the workspace. No password was guessed
and none is recorded here. `preview.gacpth.com` is built from main and cannot show branch
code either.

## What is still missing

Only the visual confirmation of the three remaining wizard screens as a human sees them.
Everything behind them is proven by the real press and by the suites above. When the E2E
harness is repaired the capture is a short spec: seed the session, open
`/health/applications/renewal?certId=…`, and screenshot quotation → invoice → payment.
