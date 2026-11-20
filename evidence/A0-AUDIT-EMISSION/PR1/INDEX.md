# Evidence Pack — PR-A0-1 (audit-by-default writer, tri-state `onAudit`)

work-item: A0-AUDIT-EMISSION / PR-A0-1 · date 2026-08-06 · Tier B (design-decision.md §5)
worktree: `/home/user/GACP-Certification-Application/.claude/worktrees/agent-af83f1241f0725d4b`
branch: `worktree-agent-af83f1241f0725d4b` (committed in-worktree, NOT pushed, NOT merged)

**Status: PENDING.** The integration half of INVARIANT A0 has neither RED nor GREEN
on this box — the Prisma client cannot be generated here (proxy 403) so every
Postgres suite fails to load. Nothing in this pack should be read as DONE.

## Artifact → claim it proves

| Artifact | Proves | Does NOT prove |
|---|---|---|
| `red-output.txt` | 6 unit tests failed on the pre-diff writer (Law 3.11 RED-first) + explicit list of the 4 tests that were green at birth = **pin, not fix** | anything about Postgres behaviour |
| `red-raw-jest.txt` | unedited jest stdout of the RED run (183 lines) | — |
| `test-output.txt` | same 6 tests now pass (10/10); writer-adjacent suites 105/105; full backend suite 7280 passed; clean-tree baseline showing the 11 failing suites fail WITHOUT this diff; lint clean | that the integration suite passes — it is BLOCKED, stated as such |
| `green-raw-jest.txt` | unedited jest stdout of the GREEN run | — |
| `full-suite-raw.txt` | full backend suite stdout, untruncated (21440 lines) | — |
| `baseline-failures-clean-tree.txt` | the 11 pre-existing failures reproduced on `git stash`-ed HEAD | — |
| `ratchet-before-after.txt` | hardcode 43→43 · todo 59→59 · env-direct 169→169 · dup-source 4→4 (probe output, both runs) | — |

## Diff under evidence

| File | Why |
|---|---|
| `apps/backend/services/application-status-writer.js` | the whole mechanism (below) |
| `apps/backend/__tests__/unit/application-status-writer-audit-default.test.js` | NEW — tri-state contract + envelope + tx binding + fail-open |
| `apps/backend/__tests__/integration/status-writer-audit-default-invariant.test.js` | NEW — INVARIANT A0 (1)(2)(3) on real Postgres; self-skips without `DATABASE_URL` |

No other file is touched. Callers, the ESLint rule, `checkout-settlement-service.js`,
`provider/auditor.js` and `auditor-audit-decision-handler.js` are untouched (out of scope).

## Mechanism, with line references

- `application-status-writer.js:253` `resolveAuditEmissionMode()` — the tri-state:
  function → `callback`, `false` → `off`, everything else (incl. omitted/null) → `default`.
- `application-status-writer.js:282` `emitDefaultTransitionAudit()` — the default row goes
  through `statusTransitionAuditHook` (`middleware/audit-logger.js:834-850`), the SSOT
  envelope the six callback-passing callers already use, plus `metadata.actorRole`.
  No second envelope is built in the writer (Law 3.6).
- `application-status-writer.js:555` `applyStatusUpdate(client)` — the pre-existing UPDATE
  (incl. the `P2025 → CONCURRENCY_CONFLICT` mapping) hoisted so it can run against either
  the caller's client or the writer's own tx. Data shape unchanged.
- `application-status-writer.js:615` `useInternalAuditTx` — internal tx only when the writer
  owns the emission AND the client is bare (`$transaction` present) AND the client can carry
  audit rows (`auditLog.create` present). The last condition keeps the ~68 unit-test stubs
  that mock only `application` on exactly their old single-UPDATE path.
- `application-status-writer.js:620-644` — UPDATE + audit INSERT inside one internal tx; on
  audit failure the tx is unwound and the status write is re-applied on the bare client
  (fail-open). Swallowing *inside* the tx was rejected: a failed audit INSERT poisons the
  transaction (25P02, see the lock note at `middleware/audit-logger.js:590-598`), which would
  silently convert an audit hiccup into a rolled-back status write = accidental fail-closed.
- `application-status-writer.js:668` — the caller callback path is untouched and is a no-op
  unless `onAudit` is a function, so exactly one emitter ever runs (no double row).
- Cert hook, applicant fanout and work-activity emission stay OUTSIDE the internal tx —
  unchanged behaviour, as design §2 requires.

## Test → invariant map

Unit (`__tests__/unit/application-status-writer-audit-default.test.js`):

| line | test | clause |
|---|---|---|
| 140 | omitted + bare client → internal tx, emission bound to that tx | §2 (a) + internal tx |
| 159 | envelope: event/from/to/actor/reason + `metadata.actorRole`; `logWithin` NOT called directly (line 186) | §2 (a) envelope + SSOT |
| 189 | omitted + caller tx → emits into the caller's tx, no nesting | §2 (a) |
| 201 | client without `auditLog` → no internal tx, exactly one UPDATE | blast-radius guard (**pin**) |
| 216 | function → callback once, writer emits nothing, no internal tx | §2 (b) (**pin**) |
| 238 | throwing callback still swallowed | fail-open (**pin**) |
| 251 | `false` → silent | §2 (c) (**pin**) |
| 266 | audit failure inside internal tx → status write still lands | fail-open (design §2.3) |
| 284 | audit failure inside caller tx → no throw to caller | fail-open |
| 297 | real UPDATE failure is re-thrown, not mistaken for an audit hiccup | no silent-swallow regression |

Integration (`__tests__/integration/status-writer-audit-default-invariant.test.js`) —
**verdict pending on a runner**:

| line | test | INVARIANT A0 clause |
|---|---|---|
| 106 | no `onAudit` ⇒ Δ = +1 exactly, metadata from/to match | (1) |
| 134 | failure injected after UPDATE before COMMIT ⇒ status unchanged AND Δ = 0 | (2) |
| 157 | retry rejected by the writer's `expectedVersion` guard ⇒ Δ round 2 = 0 | (3) |
| 195 | explicit `onAudit` ⇒ still exactly one row | no double emission |
| 216 | `onAudit:false` ⇒ Δ = 0 while status moves | §2 (c) |

Clause (4) (fail-closed side-effect coupling) is out of scope — it belongs to PR-A0-3/PR-A0-4.

## Known gaps in this pack

- No screenshots / trace: this PR touches no UI or user-visible flow
  (`gacp-view-in-the-loop` applies to UI/flow work). MISSING BY DESIGN, not omitted.
- `probe-results.json`: not regenerated — `scripts/check-done.sh` was not run in this
  session; only `scripts/probes/ratchet.sh` was. MISSING.
- Integration RED/GREEN: MISSING — environment cannot run Postgres suites (see `red-output.txt`).
