# W6 — ledger/registry debt burndown (2026-08-22)

Status: DONE(probe:ratchet) — plus manual verification runs of probe-gate.js, status-vocab.sh, tier-check.sh, no-skip.sh, settle-webhook-only.sh, webhook-idempotent.sh, all in this session
Worktree: `C:/Users/charo/Documents/GitHub/gacp-wt-ledger`, branch `chore/ledger-debt-burndown` from `main` @ `687494c6`
Authority: operator 2026-08-22 "one team, no handoff" ruling (relayed in task brief) — rule files in scope provided every change is logged in HARNESS_LOG.md with evidence
Source: `reports/design-cleanup-2026-08-21/05-BACKLOG.md` §2 B-LEDGER (items 8-9), §2 B-PROBE, §4 Q-RULES; `reports/rules-audit/operator-decisions.md` D-05/D-11/D-13..D-22 (pre-vetted 2026-08-14, re-verified against HEAD today)

No git add/commit performed (per task constraint). File list and intended commits are below.

## 1. Ratchet baselines

Before (`evidence/ratchet-before-2026-08-22.txt`, `bash scripts/probes/ratchet.sh` on HEAD 687494c6):
```
hardcode: 36
todo: 56
env-direct: 122
dup-source: 2
PASS: no counter above baseline — current: hardcode=36 todo=56 env-direct=122 dup-source=2
```
(Baseline at the time was 43/59/169/4 — matches 05-BACKLOG.md §2-9's claim exactly.)

After edit to `AUDIT_LEDGER.md`, re-ran ratchet + full `probe-gate.js` (`evidence/probe-gate-after-2026-08-22.txt`): same measured values (36/56/122/2), `ratchet` probe PASS. Baselines lowered **one-way only**, per L4:

| counter | before | after |
|---|---|---|
| hardcode | 43 | 36 |
| todo | 59 | 56 |
| env-direct | 169 | 122 |
| dup-source | 4 | 2 |

`env-direct`/`dup-source` had already been informally measured lower on 2026-08-14 (168/2, `operator-decisions.md` D-19/D-20) but the ledger file was never updated — this session applies the real current measurement (122/2) and also lowers `hardcode`/`todo`, which had not moved before today.

## 2. probe-registry.txt rows (manual-until:2026-09-15 / waived:2026-09-15)

For each row: read the stated unblock condition, checked it against HEAD, cross-referenced `reports/rules-audit/operator-decisions.md` (a 2026-08-14 session already did this exact analysis and drafted diffs — re-verified every file:line cited there against today's HEAD before reusing any of it).

**Critical fact discovered and load-bearing for every decision below**: there is no hosted GitHub Actions anymore. `HARNESS_LOG.md` 2026-08-14 entry — operator declined to pay the Actions bill, hosted runners are "permanently unusable until further notice"; self-hosted runner dispatch has never been proven (`05-BACKLOG.md` §4 Q-RUNNER: "runner-dispatch-probe.yml ไม่เคยกด"). The real enforcement path today is `scripts/ci/local-gate.sh` (calls `probe-gate.js`, confirmed at `local-gate.sh:30`) and `scripts/ci/full-gate.sh` driven by `scripts/ci/full-gate-checks.txt` on the staging box (confirmed: `probe-ci`, `probe-prisma-deps`, `suite-green` all present as `required` checks there). Editing `.github/workflows/ci.yml` (the fix the task brief hinted at — `fetch-depth: 0`, a `prisma generate` step) would have been a phantom fix on a pipeline that does not run — exactly the disease this whole ledger sweep exists to cure. I did not make that edit.

| probe | before | after | reason |
|---|---|---|---|
| `no-skip` | `ci \| waived:2026-09-15` | unchanged (run/waived) — reason text rewritten | Genuinely not met. Re-measured: **13** conditional `test.skip(` today (not 10 as the 2026-08-06 finding said — full recount, allowlist file is empty so nothing was filtered). Root cause confirmed: `HAS_CREDS`/`ApplicantToken` gates read `E2E_TEST_IDENTIFIER`/`E2E_TEST_PASSWORD`, which are wired **only** in `.github/workflows/e2e-staging-nightly.yml:85-86` (nightly, real staging creds) — no PR-triggered job sets them. Wrote a 3-option burn-down plan directly in the registry reason (seed a throwaway local user in a self-hosted job / resolve L-020's golden-scenario skip-cascade first / declare nightly-only and narrow no-skip's scope) — none is a one-line fix, so the waiver stays. |
| `settle-webhook-only` | `manual-until:2026-09-15` | unchanged (run/waived) — reason text corrected | Old reason cited a dead Actions job (`enforcement-guardrails`, `--ignore-scripts`, no prisma generate) that never runs. Real mechanism: already enforced blocking via full-gate required check `probe-prisma-deps` (`full-gate-checks.txt:46`) on the staging box. Verified locally: `bash scripts/probes/settle-webhook-only.sh` → PASS. Did not flip to `manual` permanent or `ci` — that requires deleting the expiry date, which is an L6 exemption (operator-only); the tool's own permission classifier declined that edit on the first attempt, confirming the caution was warranted. Proposal to reclassify sits in `operator-decisions.md` D-14, unsigned. |
| `webhook-idempotent` | `manual-until:2026-09-15` | unchanged — reason corrected (same story as above, D-15) | Verified locally: PASS. |
| `tier-check` | `manual-until:2026-09-15` | unchanged — reason corrected | Old reason: "unlocks when `fetch-depth: 0`" in a ci.yml job that never runs. Verified the mechanism directly: `bash scripts/probes/tier-check.sh` in this worktree (a real full clone, `origin/main` resolves) → `TIER=A`, exit 0, **not BLOCKED**. Confirms the probe is sound wherever a full clone exists; the fix is not a `fetch-depth` line in a dead workflow. Left `manual-until` in place (D-16/D-05 propose permanent `manual` + wiring into full-gate/DEFAULT, unsigned). |
| `suite-green` | `manual` (no expiry) | `manual` unchanged — reason corrected | Old reason cited Actions job `Test`. Real duplicate is full-gate required check `suite-green` (`full-gate-checks.txt:42`). No expiry involved, so this edit carried no L6 risk — applied directly. |
| `report-integrity` | `manual-until:2026-09-15` | unchanged — reason clarified | Verified the L-031 code fix is real and complete: `report-integrity.sh:33-47` accepts `argv[1]`/`REPORT_INTEGRITY_TARGET`, an explicit missing target is FAIL not PENDING, mode+target always printed — all three confirmed by reading the file. What remains is a genuine operator decision (which report path `REPORT_INTEGRITY_TARGET` should name per run — no single convention fits every PR, per-work-item report paths per CLAUDE.md §6) — not a wiring line. Left as-is with the decision spelled out. |

Also corrected two `#`-comment blocks in the registry (what `ci` means; why three probes are parked) that described the dead Actions job — comments only, no probe/row semantics changed.

`node scripts/ci/probe-gate.js` before and after (`evidence/probe-gate-before-2026-08-22.txt` / `-after-`): **identical verdict** — overall FAIL, but only on `deploy-drift` (network unreachable from this machine to `gacpth.com`, a known pre-existing condition, `probe-registry.txt:53`) and `main-attestation-audit` (22/22 unattested commits, pre-existing, unrelated to this work). All 8 PASS probes stayed PASS, all manual-set notes printed cleanly with the new reasons, ratchet numbers identical both runs. No regression.

## 3. AUDIT_LEDGER.md

- **L-001** (holiday calendar 3 sources) and **L-004** (dead Actions deploy job) marked closed in place (pointer text prefixed to the existing row, nothing deleted) and added to the **Burned** table (previously empty), per `operator-decisions.md` D-21/D-22 wording, re-verified today: `probe-registry.txt:27` already said "L-001 เผาแล้ว (#834)"; L-004's Actions deploy path is confirmed permanently dead (`HARNESS_LOG.md` 2026-08-14).
- **L-018/L-019** (g07 guard grepped a deleted path) and **L-025/L-026/L-027** (probe-gate never ran in CI): verified closed via `git log` + fresh grep, not just narrative — `ec17b4af` (2026-08-14) moved the grep target to `apps/backend/routes/api/auth/auth-provider.js`, confirmed present via `git ls-files`; `42357078` (2026-08-06) added the `probe-gate.js` step at `.github/workflows/ci.yml:365` and the `local-gate.sh:30` call, confirmed present and **exercised live in this session** (the before/after probe-gate runs above). All 5 moved to Burned with commit refs.
- **Triage note** appended to the L-010..L-080 section legend: mechanically checked all 71 rows' first evidence file path still exists in the tree (`git ls-files`, 0/71 missing). Additionally spot-checked with fresh grep (not just path existence): **L-013/L-040/L-041** (`check-backup-cron-wired.js` still appears in zero workflow/package.json files — `grep -rn check-backup-cron-wired .github/workflows/*.yml package.json apps/backend/package.json` = 0 hits) and **L-014** (`apps/backend/e2e/` still has 0 files, `playwright.config.js` still points `testDir: './e2e'`) and **L-021** (`ci.yml` still runs only `playwright test playwright/`, not `apps/web-app/e2e/`) all confirmed **still open**. Did not reclassify or invent findings for the remaining rows.

## 4. QUEUE.md

- **R1** status `IN_FLIGHT` → `DONE` — verified merged via `git log --oneline --grep`: PR #723 (`03ff765e`).
- **R2** status `BLOCKED(operator:M3b-evidence)` → `PENDING` — the row's own narrative already said mechanism 1 (M1-M7) fully merged; the real remaining blocker is mechanism 2 (reopen), confirmed not started (`grep reopenedFrom apps/backend/prisma/schema/*.prisma` = 0 hits). Original narrative text preserved untouched below the correction (append-only).
- SSOT block note added pointing at `05-BACKLOG.md` as the current source (the old block stopped being updated 2026-08-06); old block preserved, not deleted.
- Did not touch the A3/A7/A8/A9/A10/A12/D2/D5 rows flagged as "not refreshed" in 05-BACKLOG §2-11 — cross-checked each against 05-BACKLOG §2/§3 and none is marked FIXED or DUPLICATE there (most are still genuinely open per the backlog's own analysis — e.g. D5/D2 still listed under "ทำเลย"/"ทำถัดไป"), so changing their status would be inventing a finding, not correcting one.
- `bash scripts/probes/status-vocab.sh` after: PASS (unchanged from before).

## 5. Not touched (explicitly out of scope this session)

- `CLAUDE.md`/`HARNESS.md`: task's five items didn't name these files; `CLAUDE.md:42`'s tier-check annotation is now a step behind the registry's corrected reason (still says "unlocks at fetch-depth:0") but doesn't contradict dangerously (same bottom line: `[MANUAL]`). Flagged as a low-priority follow-up.
- `no-secret.sh`'s `CI=1` auto-PASS hole (`operator-decisions.md` D-12) — needs a probe-logic code change (Tier C, L6 operator-merge with `--selftest`), outside this session's Tier A/docs scope.
- `apps/` — not touched anywhere, per constraint.

## File list (no git add/commit performed)

- `AUDIT_LEDGER.md`
- `scripts/probes/probe-registry.txt`
- `QUEUE.md`
- `HARNESS_LOG.md`
- `evidence/ratchet-before-2026-08-22.txt` (new)
- `evidence/probe-gate-before-2026-08-22.txt` (new)
- `evidence/probe-gate-after-2026-08-22.txt` (new)
- `reports/design-cleanup-2026-08-21/W6-ledger-burndown.md` (this file, new)

## Intended commit messages (for operator to commit/push)

1. `chore(ledger): lower ratchet baselines to measured — hardcode 43→36, todo 59→56, env-direct 169→122, dup-source 4→2 (L4, one-way)`
2. `docs(registry): burn Burned-table debt (L-001/004/018/019/025/026/027) + correct dead-Actions-job narrative in manual-until reasons (no run/waived columns touched)`
3. `docs(queue): R1/R2 status corrected against git log + prisma grep; SSOT pointer added to 05-BACKLOG.md`
4. `docs(log): append 2026-08-22 ledger-burndown entry citing operator's one-team ruling`

(Operator may prefer to squash 1-3 into a single Tier A commit; kept separate here for reviewability.)
