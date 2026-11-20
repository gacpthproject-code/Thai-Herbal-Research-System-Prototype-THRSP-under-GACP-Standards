## tier-check fix round 1 — security re-review — 2026-09-26
Status: DONE(probe:tier-check --selftest) — 169 pass / 0 fail, exit 0, re-run in this session on /home/ubuntu/work/wt-tiercheck @ 0266e1d5
Scope: fa996cb8..0266e1d5 · read-only · scratch repos under the session scratchpad (not in the tree)

### (1) Round-0 findings — reproduced in a scratch git repo with the branch script
- HIGH 1 rename: CLOSED. git mv payment-service.js→svc.js (+edit, and pure 100% rename, and with `diff.renames=copies` in config) lists both paths → TIER=C. Deleting a money file → C.
  Thai path `deploy/ค่า.sh` arrives unquoted → C. Mutation controls: drop `--no-renames` → selftest 1 FAIL; drop `-z` → 1 FAIL.
- HIGH 2 secret/auth + `(auth)`: CLOSED for every file named. `apps/web-app/src/app/(auth)/login/page.tsx` → C; the 8 named files are selftest cases and pass.
- MEDIUM fixtures/governance/sql: CLOSED. `__fixtures__/checkout-fixtures.ts` → C · `scripts/ci/probe-gate.js` → C · `prisma/sql/drop.sql` and a root `misc.sql` → C.
- LOW tokens/boundaries: CLOSED. All listed tokens are present. `oauth2-client`, `payments2/`, `[paymentId]` → C. Mutating TOKEN_PRE back to `/._-` → 3 FAIL.

### (4) Whole tree vs main 38d0b22d (7464 paths: union of main and branch ls-files, both classifiers, stdin mode)
main A 2720 / B 4227 / C 517 → branch A 2716 / B 3957 / C 791. Moves: B→C 270, A→C 4. **Moved to A: 0. Moved out of C: 0.**
(The --json output from main's classifier is not valid JSON over the full tree, because main does not escape paths. The branch output parses.)

### (5) -z handling
- Spaces, `"`, Thai: OK, and the JSON escapes `"` and `\`. Empty diff → `(no changed files) TIER=A` exit 0. Bad BASE_REF → BLOCKED exit 2. A git diff failure → BLOCKED.
- MEDIUM (a check that exists but does not protect): the selftest drives `changed_files` with its own `mapfile -d ''`, but the production reader
  `mapfile -d '' -t FILES_ARR < "$LIST_TMP"` (tier-check.sh:439) is never exercised. Mutate it to `mapfile -t` and the selftest still PASSes,
  while a real PR touching README2.md + payment-service.js returns **TIER=A** (the NUL-joined list collapses to its first path). Fix: route both through one function, or have the selftest run the script end to end with BASE_REF in the scratch repo.
- LOW: a newline in a path is not a token boundary (`services/ok\npayment.js` → B). --json does not escape control chars (newline/tab), so it emits invalid JSON.
- LOW (pre-existing, L1): changes that are staged or uncommitted are ignored. A dirty tree with a payment edit reports `(no changed files) TIER=A`. Report BLOCKED or warn when the index or tree is dirty.

### (2) Money/auth/secret/governance still A or B after this round
- HIGH (authz): the central authz predicates are B, because `access`/`user`(singular)/`acl` are not tokens:
  apps/backend/services/farm-access.js ("THE single home for may this user act on this farm") · apps/backend/middleware/uploads-access.js (object ACL + traversal gate on uploads) ·
  apps/backend/shared/user-groups.js + services/user-group-service.js (role groups) · scripts/force_verify_user.js · scripts/migrate-user-types.js · scripts/seed-test-user.js.
  Also B: routes/api/system/e2e.js + controllers/e2e-controller.js (the E2E_SECRET-gated bulk-DB door, which writes money and user rows), services/security-compliance.js (HMAC + timingSafeEqual),
  and services/storage-service.js (signed-URL HMAC — no path token can catch it; this is the path-only limit).
- HIGH (L2 cover): `.gitleaksignore` (1110 lines) → B. gitleaks honours it in no-secret.sh:100 and full-gate secret-scan-deep, so one B-tier PR can add a secret together with its fingerprint. Covers are operator-only (L6).
- MEDIUM (governance at A): scripts/test/run-regression-gate.js (the gate that .github/workflows/ci.yml:799 runs) and scripts/test/run-auth-hardening-gate.js (`gate:auth-hardening`) → **A**, because `(^|/)tests?/` wins.
  evidence/gate/*.json (attestations; they carry `accepted_by` operator allowances that gate-attestation.sh honours) → B.
- MEDIUM (enforcement at B): scripts/flow-proof.sh + apps/web-app/flow-proof/** (full-gate check flow-proof-full), apps/*/eslint-rules/*.js (status-write guards),
  jest.config.* (can skip suites), apps/backend/test-support/test-database-guard.js, .semgrepignore, .dockerignore.
- LOW (the path-only limit): ASCII tokens cannot see Thai-named files (`services/ค่าธรรมเนียม.js` → B; the tree has no such code file yet). `apikey`, `passkey`, `sso`, `oidc`, `signer`, `kms`, `vault`, `order`, `amount`, `cost`, `gateway`, `credit`, `paid` → B.

### (3) The "exact paths only" TOKEN_SKIP — each is a directory prefix, not an exact path
- evidence/, reports/, .playwright-mcp/: a de-facto allowlist for executables. .playwright-mcp/iter-quote-verify.js:31 runs `prisma.invoice.delete` and would be C without the skip. It is B.
  64 js/sh/py/mjs files live under evidence/ and reports/. Fix: skip only non-executable artifact extensions in these roots.
- apps/web-app/src/lib/i18n/dictionaries/: acceptable (the 2 auth files are copy). A new .ts file under it gets B, not A. LOW.
- apps/web-app/src/styles/*.css: exact, acceptable. testsprite_tests/, apps/web-app/e2e-walkthrough/: acceptable. Nothing in web-app/src imports e2e-walkthrough, and C_KEYWORD still applies.

### Verdict
APPROVE-WITH-NOTES — no veto. The round is monotone: 0 files move to A and 0 leave C. Every round-0 finding is closed and each fix has a negative control.
The two HIGH gaps above are pre-existing on main, not regressions. The operator decides whether to fix them in round 2 or as a follow-up. tier-check is still [MANUAL].
Evidence: the commands and outputs are in this session. Scratch data (main.txt, br.json, files-all.txt) is in the session scratchpad and is not persisted.
