All mutations reverted, tree clean. Here is my verdict.

# FAIL

No CRITICAL (no money / security / data-integrity surface touched).

---

## F4 (new, introduced by `c0ab377b`) — the "broadened" pin was silently **narrowed**, and the narrowing hits the exact constant names this repo uses

`/home/user/GACP-Certification-Application/apps/backend/__tests__/unit/correction-round.test.js:410`

```js
const SLA_LITERAL = /\b(?:SLA_DAYS|slaDays|businessDays)\s*=\s*\d/;
```

The pre-fix regex was `/SLA_DAYS\s*=\s*\d/` (no `\b`), which matched **any** suffix spelling as a substring. Adding `\b` before `SLA_DAYS` kills that: `_` is a word character, so there is no boundary in `REVISION_SLA_DAYS`, `CAR_SLA_DAYS`, `DOC_SLA_DAYS`.

Coverage delta (run directly):

| source line | pre-fix pin | post-fix pin |
|---|---|---|
| `const REVISION_SLA_DAYS = 5;` | caught | **missed** |
| `const CAR_SLA_DAYS = 5;` | caught | **missed** |
| `const DOC_SLA_DAYS = 7;` | caught | **missed** |
| `const SLA_DAYS = 5;` | caught | caught |

These are not hypothetical names — they are the two constants M3 itself converted to config reads (`routes/api/provider/handlers/workflow-handler-deps.js` `REVISION_SLA_DAYS`, `workflow-transitions-handler.js` `CAR_SLA_DAYS`). The per-file pins at `correction-round.test.js:369-378` cover only those two specific files by path; the general grep-pin — the one whose whole job is catching a *new* second source anywhere under `services/routes/jobs/scripts/utils` — no longer can.

**Mutation proof (both directions, on the same tree):**

```bash
printf '\nconst REVISION_SLA_DAYS = 5;\nvoid REVISION_SLA_DAYS;\n' >> apps/backend/services/car-deadline-service.js

cd apps/backend && npx jest --config jest.config.cjs __tests__/unit/correction-round.test.js
#   Tests: 27 passed, 27 total          <- GREEN with a live second source present
#   including "grep-pin: no revision-SLA day literal ... (L4)"  ✓

git show 7192f47d:apps/backend/__tests__/unit/correction-round.test.js \
  > apps/backend/__tests__/unit/zz-oldpin-probe.test.js
cd apps/backend && npx jest --config jest.config.cjs __tests__/unit/zz-oldpin-probe.test.js -t 'grep-pin'
#   ✕  offenders = [ "services/car-deadline-service.js" ]   <- RED at zz-oldpin-probe.test.js:407
```

The pin that existed *before* the fix cycle catches the regression; the pin *after* the fix cycle does not. That is an assertion reduction (CLAUDE.md Law 3.7) shipped inside the commit whose stated purpose was strengthening that very assertion.

**Compounding — the claim does not match the change.**
`/home/user/GACP-Certification-Application/evidence/R2-special-reopen/M3/notes.md:147`

> `pattern (:410): /\b(?:SLA_DAYS|slaDays|businessDays)\s*=\s*\d/` — ครอบ default-parameter spelling ด้วย (และครอบ `@param` JSDoc default ที่สะกดเลขซ้ำ)

The change is presented as broadening on two axes with no mention that it narrows on a third. `notes.md:141-145` states the old pin was "แคบทั้งสองแกน" and the new one fixes both — the net coverage loss on `<PREFIX>_SLA_DAYS` is nowhere in the evidence pack (Law 3.9).

---

## Everything else in the dispatch — verified closed, ran/read myself

**F1 closed.** `node scripts/ci/check-thai-copy-style.js` → `[thai-copy-style] OK` exit 0. `apps/backend/shared/correction-letter-template.js:78` is English-only with the citation intact (`FINAL item 2 + D-8`). Independent sweep: ran the gate's own `findViolations()` over every `.js` file in `2375ce2c..c0ab377b` **with the skip-list bypassed** → 3 hits, all three are Thai `test()`/`describe()` names inside `correction-round.test.js:148,183,361`; test files are excluded by declared design (`scripts/ci/check-thai-copy-style.js:32-35, 76-83`) and 2 of the 3 predate this commit. Zero hits in any production file.

**F2 live-literal half closed.** `grep -rn "SLA_DAYS\s*=\s*[0-9]\|businessDays\s*=\s*[0-9]" --include=*.js apps/backend | grep -iv waiver` → only comment text in the test file. Pin genuinely reaches the new dirs — mutation `const SLA_DAYS = 5;` in `apps/backend/scripts/ops/batch-reinstate-wrongful-expiry.js` + `const businessDays = 5;` in `apps/backend/utils/thai-format.js` → RED, both listed. The waiver escape hatch is itself guarded: adding `apps/backend/utils/waiver-temp-probe.js` with `SLA_DAYS = 5` turned `correction-round.test.js:434` RED (list mismatch), so the `startsWith('waiver')` prefix cannot be used as a silent bypass. **L4 intact**: `apps/backend/services/waiver-reopen-service.js:41` still `const SLA_DAYS = 5;`, and `git diff 2375ce2c..a30f927e --name-only | grep -i waiver` is empty.

**F2(3) decision verified independently, not accepted on explanation.** `grep -c require apps/backend/config/business-rules.js` → `0` (exit 1); no cycle possible. Behaviour identical to the removed literal, probed against a hardcoded 5 rather than against config: `calculateRevisionDeadline(start).revisionDue` = `2026-08-10T16:59:59.999Z` = `addWorkingDays(start, 5)`, `workingDaysAdded` = 5; second sample date also equal. `apps/backend/__tests__/unit/working-days.test.js` not in the diff (`git diff 7192f47d..c0ab377b --stat` on that path is empty), 24/24 pass.
(Noted and *not* raised as a finding: `correction-round.test.js:470-473` compares the default against `PAYMENT.REVISION_DEADLINE_BUSINESS_DAYS`, which alone is tautological — but `correction-round.test.js:364-367` and `__tests__/integration/working-days-revision-deadline.test.js:108` pin the config to `5` independently, so the pair is sound.)

**F3 closed.** `evidence/R2-special-reopen/M3/notes.md:3-21` declares retroactive authorship in the header, in the first lines, unambiguously. `gates.txt` carries real output for all 5 gates plus 1b and the full suite. Born-green claims spot-checked against the cited line numbers: `red-output.txt:30, 35, 40, 43` all `✓`, and `red-output-fix1.txt:49` `✓` in the same run where 48/50/51 are `✕`. The fix-cycle RED at `red-output-fix1.txt:60-65` lists exactly the 3 audited files.

**No regression.** 6 M3 suites + `working-days.test.js` in one run: **7 passed, 102 passed / 102** (= 78 + 24, matching gates.txt; 75→78 is +3 added, none removed — `correction-round.test.js` 24→27). `bash scripts/probes/ratchet.sh` → PASS `hardcode=43 todo=59 env-direct=169 dup-source=4`. `node scripts/ci/check-banned-terms.js` → passed, exit 0. `npx eslint` on the 5 touched files → exit 0, no output. `.skip/.only/xit/xdescribe` in the four touched test files → none.

**Scope clean.** `git diff 7192f47d..c0ab377b` = 9 files, each maps to a finding: F1 → `correction-letter-template.js`; F2 → `correction-round.test.js`, both `scripts/ops/*`, `utils/working-days.js`; F3 → `notes.md`, `gates.txt`, `red-output-fix1.txt`; plus `BACKLOG-FOUND.md`. `a30f927e` is `orchestration-log.md` only (+5 lines) — no CLAUDE.md / HARNESS.md / probe / gate file touched anywhere (Law 3.12 intact). The `BACKLOG-FOUND.md` entry records the dead `CORRECTION_ROUND_STAGES` export that the round-1 auditor had already flagged non-blocking — a real out-of-scope finding, not parked work.

**The flagged trap is clear on the axis the dispatch named.** `notes.md:239-243` describes choosing to rewrite its own comment rather than teach the pin to skip comments; the pin does still read raw file text including comments, and I confirmed no comment-skipping was added. The weakening is on a different axis entirely — the `\b` — and was not disclosed.

---

## Tree state

`git status --porcelain` empty · `git worktree list` shows only `/home/user/GACP-Certification-Application  a30f927e [feat/r2-m3-round-counter]`. All four mutations reverted from backups in the scratchpad (`apps/backend/scripts/ops/batch-reinstate-wrongful-expiry.js`, `apps/backend/utils/thai-format.js`, `apps/backend/services/car-deadline-service.js`) and both temporary files removed (`apps/backend/utils/waiver-temp-probe.js`, `apps/backend/__tests__/unit/zz-oldpin-probe.test.js`). No source file was modified as a fix.