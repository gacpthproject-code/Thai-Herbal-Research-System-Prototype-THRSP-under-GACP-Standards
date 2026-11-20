## Security review — tier-check package.json/lockfile/eslint → Tier C — 2026-09-26
Reviewed: worktree /home/ubuntu/work/wt-tc2, branch fix/tier-check-package-json, commit 11cb9bad on main 9ce3db30.
Scope: scripts/probes/tier-check.sh (`build-config` rule + selftest cases), HARNESS_LOG.md entry (append-only).

Checks:
1. Coverage — fed every named form via `tier-check.sh -` (stdin classify), independently:
   package.json (root + 3 nested depths), package-lock.json, yarn.lock, npm-shrinkwrap.json, pnpm-lock.yaml,
   pnpm-workspace.yaml, .npmrc (root + nested), .yarnrc.yml, .pnpmfile.cjs, eslint.config.{js,mjs,cjs,ts},
   .eslintrc / .eslintrc.{js,cjs,json,yml,yaml}, .eslintignore, eslint-rules/** (pre-existing gate-runner),
   .husky/** (pre-existing `governance` rule, unaffected by this diff) — all → C.
   **Gap found**: lint-staged config (.lintstagedrc, .lintstagedrc.json, lint-staged.config.js, incl. nested) is
   still B. Not caught by `build-config`, `gate-runner`, or any other C_STRUCTURAL rule. This form is on the
   task's required list and the diff/report do not mention it.
   jest.config.* already C via pre-existing `gate-runner` rule (untouched, correctly still C).
2. Selftest — ran `bash scripts/probes/tier-check.sh --selftest` in the worktree: 284 pass, 0 fail, matches the
   report. Negative controls present and correct: package-json-utils.ts / eslint-report-parser.js stay B,
   docs/x/package.json.md and a *.test.js named after package.json stay A (word-inside-longer-word discipline
   preserved). Did not independently re-verify the RED-on-main-rules (24 fail) claim beyond trusting the report's
   own RED/GREEN pair, since the current selftest already re-derives it from the live rule set.
3. Whole-tree diff — extracted tier-check.sh + _lib.sh (unchanged) at main 9ce3db30 and at the branch tip into
   isolated dirs, classified all 7,642 tracked paths (git ls-files @ 9ce3db30) through both, diffed line-by-line.
   Exactly 9 paths changed tier, all B→C via the new `build-config` reason, exactly matching the report's list
   (.npmrc, package.json, apps/backend/package.json, apps/web-app/package.json, packages/validation/package.json,
   pnpm-lock.yaml, pnpm-workspace.yaml, apps/backend/eslint.config.js, apps/web-app/eslint.config.mjs). No path
   moved to A, no path left C, no other reason string changed. Confirms the report's tsv claim independently.

Verdict: APPROVE with one gap — coverage is not complete.
Uncaught: lint-staged config forms (.lintstagedrc*, lint-staged.config.*) stay Tier B; should be added to
`build-config` (or a new rule) before/at merge — it can redefine gate scripts the same way husky hooks can.
No unexpected tier move found; the 9-file B→C set is exactly as claimed and no A/C boundary was touched.
