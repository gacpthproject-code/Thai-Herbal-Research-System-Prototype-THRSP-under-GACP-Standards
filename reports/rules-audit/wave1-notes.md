# wave 1A — orphaned CI checks vs the real gate (2026-08-14 rules audit)

Stage: rewire orphaned `scripts/ci/check-*.js` into `scripts/ci/full-gate-checks.txt`.
Run on branch `chore/rules-wave1`, HEAD `fd61813835f3`, host DESKTOP-I55JPKN (Windows dev box —
NOT the staging gate box; per-check dependency notes below flag where that matters).

## Outcome of this stage: 0 rows added to full-gate-checks.txt — a row alone wires nothing

`full-gate.sh:1114` dispatches each check row to a bash function: `fn="do_${id//-/_}"`, called at
`:1115`. There is no lookup guard (`declare -F` / `type -t` appear nowhere in the file) and no
`source` of any extension directory. Exit-code mapping at `:1116` is `0=pass · 2|3=not-run ·
anything else=fail`, and a missing bash function exits **127**:

    $ bash -c 'set -u; fn="do_check_thai_locations"; { "$fn" >/dev/null 2>&1; code=$?; } || true; echo $code'
    127

So a row added without its `do_*` implementation makes the check **FAIL on every real gate run** —
required rows would redden the whole gate on the staging box and make every commit unattestable.

Worse, the dry mode cannot catch this. `full-gate.sh:1108` skips execution for any id outside
`DRY_SAFE` and files it as `pass`. Observed, with a one-row list naming a check that has no `do_`
function:

    $ printf 'check | thai-copy-style | required | bogus row with no do_ function\n' >bogus-checks.txt
    $ FULL_GATE_OUT_ROOT=... GATE_CHECKS_FILE=bogus-checks.txt FULL_GATE_DRY_RUN=1 bash scripts/ci/full-gate.sh
    [full-gate] sha=fd61813835f3dbf311c217c97b316500b723462b host=DESKTOP-I55JPKN dry_run=1 ...
    [full-gate] thai-copy-style      pass
    PASS    (1): thai-copy-style

That green `pass` is for a check that does not exist. Adding 16 such rows would have produced a
16-line PASS list that proves nothing in dry runs and a red gate in real ones — the phantom-guardrail
class this repo already counts in AUDIT_LEDGER.md. Rows are therefore withheld until the matching
`do_*` functions land in `full-gate.sh` in the SAME change.

Why that change was not made here: `full-gate.sh` is gate-runner logic (L6 — ships with a passing
`--selftest`), and its selftest cannot be validated on this machine. `python3` resolves to the Windows
Store alias stub, so every attestation write aborts with exit 3:

    $ python3 -c 'print("py-ok")'
    Python was not found; run without arguments to install from the Microsoft Store, ...
    $ bash scripts/ci/full-gate.sh --selftest
    full-gate --selftest: 19 assertion(s) FAILED     (exit 1)

A full-gate.sh edit must be made and selftested where python3 works (the staging box).

The invariant this stage refused to break, measured: every one of the 15 `check` rows in
full-gate-checks.txt today has its implementation (`bash -n scripts/ci/full-gate.sh` OK; each id
mapped to `do_<id>` and grepped in full-gate.sh — 15/15 OK, 0 MISSING). Adding rows without
functions would have made this file the first place where a listed check has no code behind it.

## Verified candidates (existence + invokers + run on this tree)

Invokers checked by grep over `.github/workflows`, `package.json`, `apps/web-app/package.json`,
`scripts/ci/local-gate.sh`, `scripts/ci/full-gate.sh`, `scripts/ci/full-gate-checks.txt`,
`scripts/ci/probe-gate.js`, `scripts/probes`, `.husky`, `scripts/check-done.sh`.
**None of the 19 appears in local-gate.sh, full-gate.sh, full-gate-checks.txt, probe-gate.js,
probes, .husky or check-done.sh** — every automated invoker is a dead workflow; the rest are manual
`package.json` scripts. The audit's "orphaned" claim holds for all of them.

| check script | exit | verdict on this tree | live invokers found | runtime deps on the gate box |
|---|---|---|---|---|
| check-access-allowlist.js | 0 | PASS | topology-guard.yml:47 (dead), package.json:27 (manual) | node only |
| check-closing-patterns.js | 0 | PASS | package.json:35 (manual) | node only |
| check-data-sovereignty.js | 0 | PASS | ci.yml:58 (dead) | node only |
| check-enforcement-guardrails.js | 1 → 0 | PASS only with DATABASE_URL set | ci.yml:342 (dead) | `npx prisma validate` + DATABASE_URL (G-06) |
| check-frontend-lint-ratchet.js | 1 | **FAIL** | frontend-lint-ratchet.yml:49 (dead) | pnpm + web-app node_modules |
| check-frontend-provider-api-usage.js | 0 | PASS | package.json:20 (manual) | node only |
| check-hardcoded-tax-ids.js | 0 | PASS | package.json:36 (manual) | node only |
| check-i18n-reachability.js | 0 | PASS (at budget, 0 headroom) | ci.yml:131 (dead) | resolves `typescript` from apps/web-app → web-app deps installed |
| check-identity-field-usage.js | 0 | PASS | ci.yml:51 (dead), package.json:65 (manual) | node only |
| check-infra-contracts.js | 0 | PASS | infrastructure-contract-guard.yml:42, production.yml:77 (dead), package.json:28 | node only |
| check-no-new-eslint-warnings.js | 0 | PASS **vacuously** on this HEAD | production.yml:134 (dead), package.json:32 | eslint + a HEAD with lintable changes |
| check-orphan-api-routes.js | 0 | PASS | package.json:19 (manual) | node only |
| check-prisma-migration-consistency.js | 0 | PASS, strict half skipped | package.json:30 (manual) | SHADOW_DATABASE_URL for the SQL-drift half |
| check-production-topology.js | 0 | PASS | topology-guard.yml:44, production.yml:74 (dead), package.json:26 | node only |
| check-tenant-conventions.js | 0 | PASS | production.yml:123 (dead), package.json:25 | node only |
| check-thai-copy-style.js | 1 | **FAIL** | ci.yml:123 (dead) | node only |
| check-thai-locations.js | 0 | PASS | ci.yml:66 (dead) | node only |
| check-vulnerability-exceptions.js | 0 | PASS (1 active exception) | ci.yml:797 (dead) | node only — reads the lockfile, does NOT run `pnpm audit` |
| check-webapp-jest-module-mode.js | 0 | PASS | ci.yml:195 (dead), package.json:38 | node only |

## Checks failing on the current tree

These must be wired **non-blocking** (`advisory`) when the rows land, or the debt fixed first.

**check-thai-copy-style.js — exit 1**

    [thai-copy-style] 2 issue(s):
      apps/web-app/src/app/auth/_components/login-chooser.tsx:240  [em-dash]  Thai separates clauses with a space, not an em dash (—)
        ไม่ได้ —
      apps/backend/shared/notification-view.selftest.js:44  [em-dash]  Thai separates clauses with a space, not an em dash (—)
        === ผล: PASS=0 FAIL=1 (โมดูลยังไม่มี — นี่คือ RED ที่ถูกต้อง) ===

**check-frontend-lint-ratchet.js — exit 1** (needs `pnpm` on PATH; with pnpm 8.15.0 present)

    Frontend lint ratchet: baseline = 0 warning(s) (last updated 2026-05-18).
    Running: pnpm --filter web-app run lint ...
    Frontend lint ratchet: FAIL — 2 ESLint error(s) detected. Errors are never allowed regardless of warning ratchet.

    (source, from `pnpm --filter web-app run lint`:)
    apps/web-app/src/app/provider/management/__tests__/create-officer-payload.test.ts
      65:34  error  A `require()` style import is forbidden  @typescript-eslint/no-require-imports
      66:22  error  A `require()` style import is forbidden  @typescript-eslint/no-require-imports
    ✖ 13 problems (2 errors, 11 warnings)          [baseline = 0 warnings → the warning ratchet is also 11 over]

## Environment-dependent, not tree-dependent

**check-enforcement-guardrails.js** fails bare (`Results: 6 passed, 1 failed`, G-06 `prisma validate`
→ `P1012 Environment variable not found: DATABASE_URL`) and passes with the variable present:

    $ DATABASE_URL="postgresql://gate@localhost:5432/gacp_gate_probe" node scripts/ci/check-enforcement-guardrails.js
    G-06: Prisma schema validates
    Results: 7 passed, 0 failed        (exit 0)

Its `do_check_enforcement_guardrails` must run through the gate's `in_backend`-style env (scratch
DATABASE_URL), like `do_prisma_generate` does. Note the audit's separate G-07 finding (grep target
`apps/backend/routes/api/auth-provider.js` moved to `routes/api/auth/auth-provider.js`) is NOT fixed
here — G-07 still prints PASS over a file list that no longer resolves; that is a code fix, out of
this stage's scope.

## Candidates excluded from wiring, with reason

- **check-backup-cron-wired.js** — exit 0, but it asserts `scripts/deploy/deploy-production.sh`
  invokes `scripts/backup/install-cron.sh` (both verified present, `:25-26`). The audit's point stands:
  that script is not the deploy path in use. Wiring it as-is buys a true statement about a file nobody
  runs; retargeting is code work, not a row.
- **check-max-lines.js** — `package.json:33` runs it `--mode=delta --warn=500` with no `--max`, so it
  cannot exit non-zero for size. Wiring it required would need the npm script changed too (out of scope).
- **validate-workflow-paths.js** — validates `.github/workflows/*`, artifacts that never execute. The
  audit proposes retire/retarget, not wiring.
- **production-readiness-check.js** — the audit asks for a reframing rewrite, not a row.
- **`pnpm audit` half of the vulnerability-exception pair** — `check-vulnerability-exceptions.js`
  deliberately reads the lockfile instead of `pnpm audit --json` (`:30`). Wiring "the audit gate" is a
  second, separate check needing network egress on the gate box.

## What the next stage needs (in one change, selftested on the box)

For each id added to full-gate-checks.txt, a matching function in `full-gate.sh` next to
`do_probe_ci` (`:1013`), running inside the gate's clean checkout `$WORK`, e.g.

    do_check_thai_copy_style() {
        (cd "$WORK" && node scripts/ci/check-thai-copy-style.js) \
            || { REASON="check-thai-copy-style found Thai typography issues — see log"; return 1; }
    }

plus a `--selftest` case proving an unimplemented row can no longer be reported `pass` in a dry run
(the hole demonstrated above). Verified stale cross-reference while here: full-gate-checks.txt:40
cites `probe-registry.txt:35-36`, but those rows now sit at `probe-registry.txt:37-38`.

---

# wave 1B — broken guards repaired, phantom guards buried (2026-08-14 rules audit)

Stage: repair/retarget/delete rows from `evidence/rules-audit-2026-08-14/raw-result.txt`
(`fixable_by_agent: true`, mechanism broken). Same branch `chore/rules-wave1`, HEAD `cca3d65d`,
same Windows dev box. Every row below was re-verified in this session before being touched; each
guard was run BEFORE and AFTER.

## 1. check-enforcement-guardrails.js G-07 — repaired (was passing over 0 files)

Verified first, not taken on faith:

    $ git grep -rn "token" -- "apps/backend/routes/api/auth-provider.js" ; echo "exit=$?"
    exit=1                                   <- no output: file not tracked, grep() swallows it as []
    $ git grep -rn "token" -- "apps/backend/routes/api/auth/auth-provider.js" | wc -l
    31                                       <- the file the route moved to (a9778bfd domain split)

BEFORE (`node scripts/ci/check-enforcement-guardrails.js`, exit 1 only because G-06 needs DATABASE_URL):

    G-07: No token in provider login response body
    Results: 6 passed, 1 failed

AFTER (`DATABASE_URL=... node scripts/ci/check-enforcement-guardrails.js`, exit 0):

    G-01: No localStorage auth in provider/admin pages (200 files searched)
    G-02: No raw fetch with Bearer + localStorage (937 files searched)
    G-03: No duplicate role alias maps (2788 files searched)
    G-04: Schema single source (29 .prisma files, all under apps/backend/prisma/schema/)
    G-05: No direct req.user._id usage (use req.user.id) (1432 files searched)
    G-06: Prisma schema validates
    G-07: No token in provider login response body (1 file searched)
    Results: 7 passed, 0 failed

Two changes, not one: the path is fixed AND an empty target is now a FAILURE for every grep-based
guard (`targetFiles()` + `checkGrep()`), mirroring what G-04 already does for the .prisma list. Each
guard also prints how many files it searched, so "passed over nothing" is visible in the log.

Proof the new contract bites — same script, G-07 pointed back at the pre-move path (temp copy, deleted
after the run):

    G-07: No token in provider login response body — nothing to check
       Search path "apps/backend/routes/api/auth-provider.js" matches 0 tracked files: this guard has been
       passing over an empty set. Repoint it at the path the code moved to, or delete it.
    Results: 6 passed, 1 failed          (exit 1)

G-07 finds 0 real violations on the current tree — the retarget is a **pin, not a fix**: it makes the
guard mean something again, it does not report new debt.

## 2. check-backup-cron-wired.js — retargeted, and it goes RED. That is a real finding.

Retargeted rather than deleted, because the deploy path it should have been watching does exist:
`docs/operations/runbooks/build-images-on-the-box.md:57` runs
`sudo IMAGE_TAG=local-<sha> bash scripts/deploy/deploy-staging.sh`, and
`deploy-staging-manual.md:70` runs the same script. deploy-production.sh stays in the list because the
rotation runbooks still drive it (rotate-database-credential.md, secret-rotation-full.md, ghcr-pat-rotation.md).

BEFORE (exit 0):

    [backup-cron-wired] PASS: deploy-production.sh invokes install-cron.sh (daily backup schedule is wired).

AFTER (exit 1):

    [backup-cron-wired] OK: scripts/deploy/deploy-production.sh invokes install-cron.sh
    [backup-cron-wired] FAIL: deploy path(s) that do NOT invoke scripts/backup/install-cron.sh:
      - scripts/deploy/deploy-staging.sh
          executed by: docs/operations/runbooks/build-images-on-the-box.md:57 · deploy-staging-manual.md:70 (the on-box deploy in use)

**FINDING (A12, still open in a new place):** `grep -c install-cron scripts/deploy/deploy-staging.sh` -> `0`.
The only deploy that actually runs on the box never ensures `/etc/cron.d/gacp-backup`. deploy-staging.sh
takes a one-off pre-deploy `pg_dump` of gacp_staging (`:30,90`) — that is a snapshot per deploy, not a
schedule. The check was NOT softened to stay green. Fixing it means adding the idempotent
`"$PROJECT_DIR/scripts/backup/install-cron.sh"` call to deploy-staging.sh (a deploy-path edit — L5
territory, operator's call) and deciding whether the cron should also dump gacp_staging: today
`install-cron.sh:69` -> `pg-backup.sh` defaults `DB_NAME=gacp_db` only (`pg-backup.sh:34`).

## 3. check-orphan-api-routes.js — stale exemption removed, register made self-policing

`apps/backend/routes/api/provider-cms.js` does not exist (deleted in a9778bfd, "organize 80 route files
into 12 domain sub-directories"), yet it sat in `ignoredFiles`. Removed, and an exemption naming a
non-existent file is now a FAIL — an unverifiable exemption also silently covers any future file that
reuses the name.

BEFORE and AFTER are both `exit 0 · [orphan-api-routes] OK: no orphan route files detected` — this is a
**pin, not a fix**. Proof the new rule fires (temp copy with the entry re-added, deleted after the run):

    [orphan-api-routes] FAIL: exemption list names file(s) that do not exist:
     - provider-cms.js (exempt because: stale entry — proof only)          (exit 1)

## 4. scripts/system-integrity-check.js — 3 sections repaired, 1 buried

BEFORE: `51 passed, 0 failed` (exit 0). AFTER: `43 passed, 0 failed` (exit 0). Fewer lines, more
coverage — §6's 14 per-page lines collapsed into 3 aggregate checks while the pages checked went 7 -> 22.

- **§6 Page/ClientView Integrity** — the page list was 7 names frozen in 2026-04 while `app/health` grew
  to 27 route directories. Now enumerated from disk: 22 pages use the ClientView pattern, all 22 have
  their `client-view.tsx` and all 22 are Server Components. An empty enumeration is now a FAIL.
- **§10 Fee Constant Integrity** — deleted `check('fees.ts exists as SSOT', true)`, a literal `true` that
  could never fail. Retargeted `plant-selection-config.ts` from the deleted `new-legacy/steps/` path to
  `app/health/applications/new/_steps/steps/plant-selection-config.ts` (exists; line 274 re-exports
  `GACP_RENEWAL_FEE as CULTIVATION_FEE_PER_METHOD` from `@/constants/fees`, so the duplicate-guard passes
  honestly). All three fee targets must now EXIST or the section fails. Proof, with the path put back to
  `new-legacy` (temp copy): `FAIL: applications/new/_steps/steps/plant-selection-config.ts exists (fee SSOT
  surface) -> Target missing — this guard judges nothing until it is repointed`, exit 1.
- **§14 User-Facing Error Localization** — 2 of its 4 named files were deleted
  (`hooks/use-master-data.ts`, `app/provider/planting/page.tsx`) and were being skipped in silence. Now a
  src-wide scan: **923 files**, 0 offenders. Pin, not a fix — but a file list can no longer rot.
- **§13 Hardcoded Fee Strings — BURIED (deleted), with the debt written down.** Its only target,
  `app/health/help-center.tsx`, is gone; the section printed a heading and executed zero assertions (see
  the BEFORE output: nothing between the "13." heading and the "14." heading). Zero enforcement value,
  verified. The rule it meant to enforce is real and **currently violated** — the same patterns aimed at
  the live surface find 2 hits:

      apps/web-app/src/app/health/payments/slip-upload-modal.tsx:627   "ค่าธรรมเนียมรัฐ (5,000 / 25,000 บาท) ..."
      apps/web-app/src/components/help/faq-data.ts:85                  "ค่าธรรมเนียมรัฐ 5,000 บาท ทำไมต้อง..."

  Restoring it as a src-wide scan therefore reddens `.husky/pre-commit`, which blocks EVERY commit in the
  repo, and the fix is web-app copy plus an operator ruling on whether fee amounts may appear in prose at
  all (dated data, not constants). Out of this stage's commit scope (`scripts/` + `reports/rules-audit`),
  so the section is buried with a tombstone comment naming the two files and the restore condition rather
  than left looking like coverage.
- **file header** — `CI: Runs automatically on every push via GitHub Actions` was false; the invokers are
  `.husky/pre-commit:15` and `package.json:14` (`pnpm doctor`), both verified by grep.

## 5. production-readiness-check.js — a PASS awarded for a dead artifact

`if (fileExists('.github/workflows/production.yml')) pass('CI/CD pipeline configuration present')` —
credit for a file that can never execute. Retargeted at the runbooks that do:

    BEFORE:  [PASS] CI/CD pipeline configuration present
    AFTER:   [PASS] Build/gate pipeline documented as executable runbooks (2)

Both `docs/operations/runbooks/build-images-on-the-box.md` and `full-gate-on-staging.md` verified present;
a missing one is now `fail()`, not `warn()`. Two skip messages that promised cover which does not exist
were corrected in the same file:

    BEFORE:  [SKIP-CI] Backend tests (covered by ci.yml `test` job with real Postgres)
    AFTER:   [SKIP-CI] Backend tests (covered by full-gate required checks suite-green + integration-pg — scripts/ci/full-gate-checks.txt)
    BEFORE:  [SKIP-CI] Docker Compose configuration validation (env vars only present on production host)
             (comment: "The compose file is YAML-linted by the system-integrity job already.")
    AFTER:   [SKIP-CI] Docker Compose configuration validation (... NOT validated anywhere else — run this script without --ci-mode on the box)

The compose claim was checked and is false: `grep -ni compose scripts/system-integrity-check.js` returns
one code comment and no check, and no probe or full-gate row runs `docker compose config`.
Readiness Score (CI subset) is 100% before and after.

## Delete-class rows NOT deleted, with the reason

- **scripts/ci/validate-workflow-paths.js** — DEAD as the audit says (sole invoker `.github/workflows/ci.yml:302`,
  and it validates artifacts that never execute). NOT deleted here: it still has references outside this
  stage's commit scope — `.github/workflows/ci.yml:302`, `docs/ci/preventive-controls.md:17,27` — and
  deleting the file while leaving those in place just moves the dangling reference. Delete it in a change
  that can touch `.github/` and `docs/`.
- **scripts/ci/check-max-lines.js** — DEAD as invoked (`package.json:33` passes `--mode=delta --warn=500`
  with no `--max`, so it cannot exit non-zero for size). Both remedies (give the npm script a `--max`, or
  move it out of the `check:*` namespace) edit `package.json`, outside this stage's commit scope.

## Gate state after the change

`bash scripts/ci/local-gate.sh` -> banned-terms PASS · mojibake PASS · green-mask PASS (841 files, baseline 15)
· probe-gate FAIL on `deploy-drift` (this box cannot reach https://gacpth.com) and
`main-attestation-audit` (pre-existing main baseline). `gate-attestation` PASSes on this branch —
the wave-1 re-audit reran it on HEAD: "no gated path changed vs origin/main (42 file(s) changed,
none matching: ^apps/)" — the earlier claim that it failed for lack of an attestation was wrong
about how the probe treats non-gated commits (corrected 2026-08-14, wave-1 audit finding #3).
The failing probes read no file touched here (scripts/ci/check-backup-cron-wired.js,
check-enforcement-guardrails.js, check-orphan-api-routes.js, production-readiness-check.js,
scripts/system-integrity-check.js).

## Corrections from the wave-1 adversarial audit (2026-08-14)

1. **Stage A wired ZERO checks** — commit `cca3d65d`'s subject overstates; its body says it
   plainly: a row in `full-gate-checks.txt` is not enough, each check id needs a `do_<id>`
   function in `scripts/ci/full-gate.sh` plus a `--selftest` case, and the gate box needs a
   working `python3`. The 19 orphaned checks therefore REMAIN ENFORCED NOWHERE. That work is
   **wave 1.5** and its commit surface must include `full-gate.sh` itself.
2. Teeth tests for the three new guard contracts (checkGrep empty-target=FAIL, orphan-routes
   stale-exemption=FAIL, backup-cron multi-path) are DEFERRED to wave 1.5 on purpose: the
   pattern lives under `apps/backend/__tests__/` (schema-single-source-gate-teeth.test.js) and
   touching `apps/` makes this branch require an on-box full-gate attestation — wave 1.5 will
   need one anyway and carries the tests then. Until then a silent revert of those contracts
   would not turn any suite red — known, accepted, time-boxed.
