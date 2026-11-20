## tier-check fix round 3 — security re-review — 2026-09-26
Status: DONE(probe:tier-check --selftest) — 258 pass / 0 fail on /home/ubuntu/work/wt-tiercheck @ 68c8b439
Scope: 862aa2c8..68c8b439 · read-only · scratch clone of wt-tiercheck in session scratchpad

### Round-2 findings — reproduced, all CLOSED
- LOW dirty-tree reader unpinned: CLOSED. Mutant `mapfile -t` (drops `-d ''`) → selftest FAILs (2 case fails incl. the new two-dirty-path e2e case).
- LOW e2e case count unchecked: CLOSED. Forcing `selftest_e2e_cases` to emit 0 cases → `FAIL-CASE: end-to-end ran 0 case(s), expected 10`, selftest FAILs.
- LOW quadratic dedup: CLOSED. 3000 untracked files in a real clone (ROOT is the script's own repo, not cwd) classify in 11.1s wall (was 44-68s in round 2's report for the same order of magnitude) via the new associative-array dedup.
- MEDIUM 5 named files (middleware.ts, middleware-helpers.ts, active-entity-middleware.js, entity-context.js, storage-service.js): CLOSED. All 5 → C via new `auth-exact-path` rule, confirmed with `--json`.

### Monotonicity check — round2 (862aa2c8) vs round3 (68c8b439), full tracked tree (7479 paths, same clone, script swapped in place)
Diff of per-path tier: **22 changed, all B→C, zero A→C/A-out/C-out/C→other**. All 22 trace to the new `middleware(s)|ownership|entity-context|scope` tokens or the exact-path list (e.g. `apps/backend/middleware/*.js` now match `auth-identity`) — no unexplained drift from the subshell-removal rewrite (`match_any`/`classify_into` global-var refactor). Confirms the log's own round-3-vs-main claim and additionally isolates it to round2→round3 only.

### package.json / eslint.config.* left at B
Confirmed deliberate: pinned as explicit `B` selftest cases with a comment "operator decides" — a future flip to C is visible as a diff to that line, not silent. Consistent with operator-decision framing; no objection.

### New issues found this round
None (LOW/MEDIUM/HIGH) — no new findings.

### Verdict
APPROVE — no veto. All 4 round-2 items closed with reproduced negative controls; monotonicity holds (B→C only) across round2→round3; package.json/eslint left at B is an explicit, pinned operator decision, not a miss. tier-check remains [MANUAL].
