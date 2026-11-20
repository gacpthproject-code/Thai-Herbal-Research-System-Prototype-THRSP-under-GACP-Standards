## tier-check fix round 2 — security re-review — 2026-09-26
Status: DONE(probe:tier-check --selftest) — 241 pass / 0 fail, exit 0, re-run in this session on /home/ubuntu/work/wt-tiercheck @ 862aa2c8
Scope: 0266e1d5..862aa2c8 · read-only · scratch repos in the session scratchpad · HARNESS_LOG diff is append-only (+10/-0) · evidence diff: no secret patterns

### (1) Round-1 findings — reproduced end to end (scratch repo, BASE_REF=base, a copy of the branch script): all CLOSED
- HIGH authz: CLOSED. farm-access, uploads-access, user-groups, user-group-service, force_verify_user, migrate-user-types, seed-test-user, e2e.js, e2e-controller, security-compliance all → C. storage-service.js → B (acknowledged; see recommendations).
- HIGH .gitleaksignore: CLOSED. .gitleaksignore, .semgrepignore, .dockerignore → C (scanner-cover).
- MEDIUM governance-at-A / enforcement-at-B: CLOSED. run-regression-gate, run-auth-hardening-gate, evidence/gate/*.json, flow-proof.sh, web-app/flow-proof, eslint-rules, jest.config.js, test-database-guard → C.
- MEDIUM production reader not exercised: CLOSED. Mutations of the copy run by --selftest: `mapfile -t` → 2 FAIL · `while read` without -d '' → 5 FAIL · first-file-only → 6 FAIL · renames on → 1 · no -z → 2 · last-wins aggregation → 1 · no json escape → 1. Negative control: `while IFS= read -r -d ''` (the correct reader) → 241/0 PASS.
- MEDIUM artifact-root skip: CLOSED. .playwright-mcp/iter-quote-verify.js → C. Unmatched scripts such as evidence/x/run.mjs and reports/y/fix.sh → B, not A.
- LOW newline/JSON: CLOSED. `lib/ok<LF>payment.yaml` → C. `--json` with \x01, \r, `"` and `\` parses under python json.
- LOW dirty tree: CLOSED. unstaged, staged, untracked and worktree-deleted money files → C, and two dirty paths (doc + money) → C.
- LOW path-only: CLOSED for Thai code names (non-ascii-code-path → C) and for apikey/passkey/sso/oidc/signer/kms/vault/amount/cost/gateway/credit/paid. `order` → B (not added).

### (4) Whole tree vs main 38d0b22d: 7471 paths (union of both ls-tree), stdin mode, both classifiers
main A 2722 / B 4232 / C 517 → branch A 2708 / B 3876 / C 887 · A→C 14 · B→C 356 · **moved to A: 0 · moved out of C: 0**

### (3) Dirty tree: no silent low tier, and no BLOCKED that exits 0
- Every `blocked` exits 2 (_lib.sh), including a failed git diff HEAD or ls-files. The only exit-0 path with no signal is "(no changed files) TIER=A", and it needs both the committed range and the working tree to be empty.
- LOW: the dirty-tree reader `mapfile -d '' -t DIRTY_ARR` (tier-check.sh:567) is not pinned. Mutating it to `mapfile -t` still gives 241/0 PASS, and a real tree with dirty docs/a.md + payment-service.js then returns **TIER=A**. Every e2e dirty case has one path. Fix: add a case with two dirty paths where the doc sorts first.
- LOW: the e2e case count is not asserted. With no e2e output the selftest gives 232/0 PASS; with an early return it gives 233/0 PASS. Fix: fail when ne != 9.
- LOW: the dedup (:570-575) is quadratic. 1000 untracked files take 12 s and 3000 take 68 s. A timeout exits non-zero, so this is not a silent PASS.
- INFO: `--json` has no dirty marker (the NOTE is only printed in text mode). assume-unchanged edits and paths listed in .git/info/exclude are hidden, but they cannot be committed, so the PR tier is not affected. A path that is not valid UTF-8 yields JSON that is not strict UTF-8, and the tier is still C.

### (5) Money/auth/governance still A/B — pre-existing on main, not regressions
- MEDIUM (exists but does not protect): the pointer to a C enforcer is B. Root package.json `gate:auth-hardening` → run-auth-hardening-gate.js (C), `prepare: husky` (.husky C), `test`, `lint`. apps/backend/eslint.config.js:80 `'gacp/no-direct-application-status-write': 'error'` can be set to off by a B-tier PR, although eslint-rules/ is C.
- MEDIUM (path-only): apps/web-app/src/middleware.ts (the /admin + /provider route gate), src/lib/middleware-helpers.ts (decideProviderRouteAccess), backend middleware/active-entity-middleware.js (the 403 tamper defence) and services/entity-context.js (withoutEntityScope) → B. In total, 53 B-tier code files contain requireRole, timingSafeEqual, createHmac, jwt, stripe. or prisma.invoice/payment/receipt/quotation/refund.
- LOW: run-regression-gate.js (C) spawns scripts/test/validate-health-planting-flow.js, which is A. This follows from the "tests are A" policy.

### Recommendations for the three items left at B (operator decides)
- `.gitignore`: keep it B. It only governs untracked files, which cannot be in a PR. no-secret.sh:41 (`ls-files -co`) and gitleaks read tracked files and history, and a committed .env is structural C. 18 commits touched it since 2026-06-01.
- `package.json` (root + apps/* + packages/*): make it C. It redefines gate entry points, `test`, `lint` and `prepare`, and adding a dependency is a supply-chain change. Cost: 30 of 1797 commits since 2026-06-01 touched one. Add eslint.config.* on the same grounds. Treating lockfiles the same way is optional.
- `storage-service.js`: make it C with an exact-path list of security files whose names are neutral. The list would also hold middleware.ts, middleware-helpers.ts, active-entity-middleware.js and entity-context.js. No token can reach these files.

### Verdict
APPROVE-WITH-NOTES — no veto. All round-1 findings are closed and pinned. The round is monotone (0 to A, 0 out of C). The new LOW items are about how well the selftest pins the code, not about current behaviour. tier-check is still [MANUAL].
