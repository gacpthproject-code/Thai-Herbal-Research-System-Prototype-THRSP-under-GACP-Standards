# L-001 — gate status (read this before believing any "green" in this pack)

`LOCAL_GATE_FULL=1 bash scripts/ci/local-gate.sh` on branch `feat/l001-holiday-ssot`
**exits 1. RESULT: FAIL.** Full transcript: `evidence/l001/local-gate-full-result-fail.txt`
(that file was originally committed as `green-local-gate-full.txt`, which was a wrong name for a
transcript whose last line is `RESULT: FAIL` — renamed under review finding F4).

There are **TWO INDEPENDENT reasons** it is red. Fixing either one alone does not make it green.

| # | Failing step | Cause | Who can clear it |
|---|---|---|---|
| 1 | `probe-gate` | `holiday-single-source` now PASSES but still carries a waiver at `scripts/probes/probe-registry.txt:25`. probe-gate treats a waiver on a passing probe as FAIL by design ("the debt is paid — delete that line"). | **operator only** — `scripts/probes/` is operator-owned (`.github/CODEOWNERS`, Law 3.12) |
| 2 | `unit-suite` | `__tests__/unit/dataset-export-service.test.js › STATIC GUARD: every allowlisted field exists on its Prisma model (DMMF)` throws `TypeError: Cannot read properties of undefined (reading 'datamodel')` — `@prisma/client` was never generated in this container. | **whoever runs the gate** — `prisma generate` on that machine |

## Conditions for a green gate

    1. operator deletes scripts/probes/probe-registry.txt:25
       holiday-single-source  | ci     | waived:2026-09-15 | operator | L-001 — 2 calendar sources; ...
    2. prisma generate is run on the machine executing the gate
    then: LOCAL_GATE_FULL=1 bash scripts/ci/local-gate.sh

## Evidence for each claim

- **Reason 1** — `evidence/l001/local-gate-full-result-fail.txt`, the `probe-gate` step:
  `✗ holiday-single-source: PASSES but still carries a waiver at registry:25. The debt is paid
  — delete that line in this PR. Cover is handed back, never kept.`
- **Reason 2, and that it is NOT caused by this change** —
  `evidence/l001/baseline-dataset-export-failure-at-HEAD.txt`: the same single test fails
  identically at `HEAD f5627c5a` with the L-001 changes stashed. Suite totals in the gate
  transcript: `Tests: 1 failed, 96 skipped, 7308 passed, 7405 total`; the 1 failure is this one.

## What IS green, and only this

- `bash scripts/probes/holiday-single-source.sh` → PASS (`green-holiday-probe.txt`) — FAIL→PASS
  first time; RED in `red-holiday-probe.txt`.
- `bash scripts/probes/ratchet.sh` → PASS, `dup-source 4→2`, no counter above baseline
  (`green-ratchet.txt`; before-state in `red-ratchet.txt`).
- The 10 jest suites touching the changed modules → 198 passed
  (`green-jest-affected-suites.txt`; RED in `red-jest-working-days-service.txt`).
- local-gate steps `banned-terms`, `mojibake`, `green-mask` → PASS.

Per CLAUDE.md §2 the work item is **`BLOCKED`**, not DONE: DoD item 2 ("full suite ผ่าน") is not
met in this environment, and DoD item 3's gate cannot be run clean until reason 1 is cleared.

## Caveats that outlive both reasons

- `local-gate.sh` does not cover integration on real Postgres, E2E/visual, TruffleHog, or CodeQL.
  Its PASS would still not be equivalent to CI green (stated in the script's own header).
- The guards that pin this work are token- and directory-scoped and miss a renamed duplicate
  calendar — proven by mutation in `evidence/l001/f3-mutation-guard-scope.txt` (finding F3).
- Whether any deployed environment had `system_configs.public_holidays_th` or `TH_PUBLIC_HOLIDAYS`
  set by hand is **unverified** (finding F1, operator). If one did, this change alters the numbers
  that `/api/system/working-days` and `/api/cron/auto-cancel` return there.
