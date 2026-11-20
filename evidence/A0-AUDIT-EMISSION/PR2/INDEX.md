# Evidence pack — PR-A0-2 (general callers: tx threading + caller #7 migration)

> **Round 2 of this pack.** Audit round 1 returned FAIL (CRITICAL 1 · HIGH 1 ·
> MEDIUM 3 · LOW-MED 1). All six findings are addressed in the follow-up commit;
> the section "Audit round 1 — what each finding cost and what fixed it" at the
> bottom is the entry point for the re-audit. Numbers, RED artefacts and the
> descope decisions below have been updated in place where round 1 made them
> wrong. Status is still **PENDING**.

work-item: A0-AUDIT-EMISSION / PR-A0-2 · date 2026-08-07 · Tier B (design-decision.md §5)
worktree: `/home/user/GACP-Certification-Application/.claude/worktrees/agent-a835af3549aea5a20`
branch: `worktree-agent-a835af3549aea5a20` · base `8e7804d5` · committed in-worktree, **NOT pushed, NOT merged**

**Status: PENDING.** Two things are missing and neither is claimed as done:
clause (2) of INVARIANT A0 (atomicity) has no execution evidence for any PR-A0-2
hop — the integration file self-skips here and has never run anywhere — and merge
needs a runner per tiered-merge (CLAUDE.md 3.1 ข).

## Split decision: ONE PR, not 2a/2b

design-decision.md §3 allowed splitting into 2a (submit hops) / 2b (scheduler +
cron hops) "ถ้าใหญ่". It was not needed and would have cost more than it saved:
the production diff is **three files, ~40 net lines** because nine of the twelve
hops in the task list already passed a tx and needed no change at all
(#13, #14, #15, #18, #19, #20, #21, #22, #24 — see the contract table below).
Splitting would have put the two halves of one inventory into two PRs that both
edit the same test inventory file, i.e. guaranteed rebase churn for no isolation.

## Files in this pack

| file | what it is |
|---|---|
| `red-raw-jest.txt` | the two new behavioural suites run against the **unmodified** callers at `8e7804d5`. 8 failing / 4 green-at-birth. The true RED. |
| `red-raw-jest-admin-harness.txt` | `admin-applications.test.js` with only ITS fix stashed: 3 failing. The harness gap the #7 migration exposed. |
| `green-raw-jest.txt` | the 3 new unit suites + the new integration suite + every pre-existing suite the diff touches: 98 passed, 6 skipped. |
| `full-suite-raw.txt` | full backend suite WITH the diff (untruncated). |
| `baseline-clean-tree-raw.txt` | full backend suite on the CLEAN tree at `8e7804d5`, same sandbox, same node_modules — the baseline compared against. |
| `test-output.txt` | the summaries side by side, the verbatim RED text, the delta, and the explicit "not run here" section. |
| `ratchet-before-after.txt` | ratchet counters before/after + the `no-skip` with/without comparison + eslint on every touched file. |
| `red-raw-jest-f1-work-activity.txt` | **round 1 / F1** — the work-activity fence suite run against the UNFENCED writer: 4 failed / 3 passed, with the status write destroyed (`Expected "SUBMITTED" / Received "DRAFT"`). |
| `red-raw-jest-f5-failure-path.txt` | **round 1 / F5** — the 4 new failure-path cases run against the routes at `188bd438^`: 3 of them red, 1 green-at-birth (a pin). |
| `green-raw-jest-r2.txt` | after the round-1 fixes: the 5 PR-A0-2 suites + all 5 writer suites + the 3 amended suites — 154 passed, 18 skipped. |
| `full-suite-raw-r2.txt` | full backend suite after the round-1 fixes (untruncated). |

## Diff under evidence

**Production (4 files — `application-status-writer.js` added by audit round 1 / F1)**

| File | Why |
|---|---|
| `apps/backend/routes/api/applications/applications.js:670-726` | #8/#9 — the two initial-submit edges now share ONE `prisma.$transaction`. |
| `apps/backend/routes/api/applications/application-bundles.js:352-386` | #12 — the bundle flip and every linked case now share ONE `prisma.$transaction`. |
| `apps/backend/routes/api/admin/applications.js:6-14, 337-348, 360-386, 400-411` | #7 — `onAudit: false` + the canonical row emitted by the caller through `statusTransitionAuditHook({tx})`, fail-closed, next to the pre-existing ADMIN row. |
| `apps/backend/services/application-status-writer.js` | **round 1 / F1 (CRITICAL)** — `emitAuditFailOpen` generalised into `runFencedBestEffort`, and the work-activity block put behind it on its own savepoint. Out of scope by the original dispatch "เว้นแต่จำเป็นจริง"; F1 is that case and the coordinator instructed the fix here. |

**Tests (5 new, 3 pre-existing amended)**

| File | Why |
|---|---|
| `__tests__/unit/a0-pr2-submit-hops-audit-emission.test.js` | NEW — behavioural, #8/#9/#10/#12. RED first. |
| `__tests__/unit/a0-pr2-admin-override-canonical-row.test.js` | NEW — behavioural, #7. RED first. |
| `__tests__/unit/a0-pr2-hop-emission-contract.test.js` | NEW — **PIN**. Static call-site inventory of client + tri-state for all 17 writer calls in the PR-A0-2 files. |
| `__tests__/integration/a0-pr2-per-hop-invariant.test.js` | NEW — table-driven over 6 hops, fires the REAL routers. **STILL NEVER EXECUTED**, self-skips without `DATABASE_URL`. Rewritten in round 1 / F2. |
| `__tests__/unit/a0-pr2-work-activity-fence.test.js` | NEW (round 1 / F1) — stateful-fake proof that a failing work-activity emission no longer costs the caller its transaction. RED first. |
| `__tests__/integration/admin-applications.test.js` | AMENDED — mock completed (`statusTransitionAuditHook`), counts updated 1→2 rows and 2→3 `logWithin` calls, canonical-row assertions ADDED. |
| `__tests__/integration/bundle-terminal-integrity.test.js` | AMENDED — `$transaction` pass-through added to the prisma stub. No assertion changed. |
| `__tests__/unit/applications-submit-canonical-validation.test.js` | AMENDED — `$transaction` pass-through added to a `{ prisma: {} }` stub. No assertion changed. See "green mask found" below. |

Nothing else is touched. `checkout-settlement-service.js`, `provider/auditor.js`,
`auditor-audit-decision-handler.js`, `audits.js`,
`application-provider-query-methods.js` and the ESLint rule are all untouched
(out of scope by the dispatch's non-goals). `application-status-writer.js` WAS
touched — by audit round 1 / F1 only, see the table above and the F1 section
below; the original PR-A0-2 diff did not touch it.

## The double-row ruling for #7 (BACKLOG-FOUND.md:78)

**Decision: keep BOTH rows; put them under ONE failure policy and ONE retry.**

* The canonical `APPLICATION / APPLICATION_STATUS_TRANSITION` row IS wanted at
  this hop. INVARIANT A0 clause (1) covers every live status write, and an admin
  force-transition is the write an auditor is most likely to go looking for.
  Answering "no" would have made the most sensitive general-tier hop the one hop
  invisible to the canonical query.
* The `ADMIN / APPLICATION_STATUS_OVERRIDE` row stays. It is not a duplicate:
  different category, different action, and it is the only carrier of
  `reasonCode` and the admin's `comment`, for which the canonical transition
  envelope has no field.
* The canonical row is emitted **by the caller** (`onAudit: false` + the SSOT
  factory `statusTransitionAuditHook`, `middleware/audit-logger.js:834`), not by
  the writer's default emitter. Reason, and it is a concrete defect not a
  preference: the default emitter is fail-OPEN and savepoint-fenced
  (`application-status-writer.js:367-434`), so a failed INSERT is swallowed —
  invisible to this route's `MAX_TX_ATTEMPTS` loop. Under two concurrent
  overrides the sequence-conflict loser would have had its canonical row silently
  dropped while its ADMIN row was retried and landed: one hop, two rows,
  disagreeing. The retry case in `admin-applications.test.js` now pins the
  corrected behaviour (3 `logWithin` calls across 2 attempts).
* Availability is unchanged. The ADMIN row was already fail-closed on this hop,
  so an audit outage already rolled the override back before PR-A0-1 and still
  does. Nothing that used to commit stops committing.

## Which hops were wrapped, and which deliberately were not

Wrapped (multi-write siblings that CAN join a caller tx): #8, #9, #12.
Already wrapped before this PR (pins): #10, #11, #13, #14, #15, #22, #24.
**Left on the bare client on purpose: #18, #19, #20, #21.**

The reason is uniform and is asserted in
`a0-pr2-hop-emission-contract.test.js`: #18/#20/#21 close their RevisionDeadline
rows through `adminApplicationService.bulkUpdateRevisionDeadlineStatus`, which
holds the **module-level prisma singleton** and takes no client argument
(`services/admin-application-service.js:615-620` — a file outside this PR's
scope). Handing the writer a tx while the siblings stayed on the singleton would
produce a transaction that LOOKS atomic and is not — worse than the honest
bare-client shape, which the writer's own internal tx already covers. #19 has no
DB sibling write at all: its two `createNotification` calls are explicitly
best-effort (`.catch`), so pulling them into a transaction would change their
failure policy rather than fix one.

## What each test form does and does not prove

* **Behavioural** (`a0-pr2-submit-hops-*`, `a0-pr2-admin-override-*`): drives the
  real express handler and asserts which client reached the writer and which
  tri-state was selected. Proves the caller contract. Says nothing about Postgres.
* **Static** (`a0-pr2-hop-emission-contract`): parses the call sites. Proves the
  inventory is complete and that no hop can be silently demoted. Weaker than
  behavioural by construction; it is labelled a PIN in the file itself.
* **Integration** (`a0-pr2-per-hop-invariant`): the only form that could prove
  atomicity — and it **has not run**. See below.

## NOT RUN HERE — stated plainly (Law 3.8)

`__tests__/integration/a0-pr2-per-hop-invariant.test.js` has **never executed**:
not red, not green, on this or any environment. It self-skips without
`DATABASE_URL` and this sandbox has no generated Prisma client at all. The only
thing verified here is that it loads and skips cleanly (6 skipped). Whether its
cases go red against the pre-PR-A0-2 callers is a prediction from reading the
code. **Clause (2) of INVARIANT A0 has zero execution evidence in this pack.**

Two of its six cases are additionally **shape-level, not end-to-end**, and say so
in the file: #8/#9 and the #12 rollback drive the caller's transaction shape
rather than the HTTP route, because the submit route sits behind consent
middleware + entity resolution + full canonical Zod validation, and because a
mid-loop bundle failure is unreachable through the route (the R1a terminal gate
rejects every case the writer's fences would reject). The #7 cases and the #12
happy path DO drive the real routes.

**Per-hop integration for #13, #14, #15, #18, #19, #20, #21, #22, #24 is NOT in
this pack.** PR-A0-2 did not change those call sites and their canonical row comes
from the PR-A0-1 mechanism, whose own integration invariant is
`status-writer-audit-default-invariant.test.js`. Nine more never-executed
harnesses would have added unverified code, not evidence. This is a deliberate
deviation from the dispatch's "integration per-hop" wording and is flagged for the
reviewer rather than papered over.

## Green mask found and closed (reported, not hidden)

`__tests__/unit/applications-submit-canonical-validation.test.js` case (a)
asserts only `expect(r.status).not.toBe(422)`. Its prisma stub was `{ prisma: {} }`,
so once the submit hops moved into `prisma.$transaction` the route threw a
TypeError, returned **500**, and the test still passed — a 500 is also not a 422.
The stub was given a `$transaction` pass-through so the case exercises the path it
was written for. The assertion itself was left alone (changing it is a separate
concern); the weakness is recorded here so it is not mistaken for coverage.

## Known gaps in this pack

* No `probe-results.json`: `scripts/check-done.sh` was not run — only
  `scripts/probes/ratchet.sh` and `scripts/probes/no-skip.sh`. MISSING.
* No screenshots / trace: PR-A0-2 touches no UI (`gacp-view-in-the-loop` applies
  to UI/flow work). MISSING BY DESIGN.
* No CI run: Actions are billing-locked (gacp-debug SKILL.md:27). The
  `LOCAL_GATE_FULL=1 scripts/ci/local-gate.sh` fallback was **not** run either —
  only the raw jest suite, eslint and the two probes above.

---

# Audit round 1 — what each finding cost, and what fixed it

Verdict received: **FAIL — CRITICAL 1 · HIGH 1 · MEDIUM 3 · LOW-MED 1** against
commit `188bd438`. Fixed in the follow-up commit on the same branch (no amend,
no force-push).

## F1 — CRITICAL. PR-A0-2 armed an unfenced best-effort block

Handing the writer a caller transaction (`applications.js:670`,
`application-bundles.js:368`) turned the work-activity block
(`application-status-writer.js`, previously a bare `try/catch`) into a silent
data-loss path: a P2002 on `work_activities_open_unique`, an RLS `WITH CHECK`
rejection or a lock timeout aborts the CALLER's transaction (25P02); the writer
swallows and returns normally; the route's callback ends without throwing;
Prisma COMMITs; Postgres answers an aborted transaction's COMMIT with a silent
ROLLBACK — and the route replies 200 with nothing committed. The audit's reading
was correct and this was reachable in production through both hops PR-A0-2 had
just wrapped.

**Fix.** `emitAuditFailOpen` is generalised into `runFencedBestEffort(client,
run, { context, savepoint, clientIsCapable, wrapBareClientInTx })`, and the
work-activity block now runs behind it on its own savepoint (`a0_work_activity`,
distinct from `a0_audit_emit` so an inner unwind cannot discard the outer
fence's point). `emitAuditFailOpen` is kept as the audit specialisation, with
`wrapBareClientInTx: true` — the work-activity fence passes `false`, because that
block never had an internal transaction and gaining one would change the
standalone contract.

**Standalone behaviour is unchanged and pinned**: on a bare client no savepoint
is attempted (illegal outside a transaction block) and no internal transaction is
opened — two `[pin]` cases assert exactly that.

**RED**: `red-raw-jest-f1-work-activity.txt` — 4 failed / 3 passed, with
`Expected: "SUBMITTED" / Received: "DRAFT"` as the money shot: the status write
destroyed by a cosmetic failure. The three passing cases are declared **pins**.

**Why the round-0 suites could not see it**: a `jest.fn` `$transaction` that just
invokes its callback has no abort semantics. The new
`__tests__/unit/a0-pr2-work-activity-fence.test.js` uses the stateful fake
introduced for PR-A0-1b (statements mutate pending state; a failed statement
poisons the tx; only `ROLLBACK TO SAVEPOINT` recovers it; COMMIT on a poisoned tx
discards silently) extended with the `workActivity` / `stageActivityConfig` /
`slaPolicy` namespaces.

## F2 — HIGH. The integration harness could not have gone red

Correct, and the more serious half of it is that the file said "NEVER EXECUTED"
while *also* being structured so that it could never have failed: it opened its
own transactions, called `writeApplicationStatus` directly and re-implemented the
route bodies inline, so reverting the wrapper would not have moved one assertion.

**Fix.** Rewritten table-driven: six hops (#7, #8/#9, #12, #13, #14, #15), each
fired through its REAL express router over supertest with only auth, consent and
multer stubbed. Clause (2) is injected uniformly by a pass-through
`writeApplicationStatus` that delegates to the real implementation and then
throws on a chosen call index, so the failure lands inside the transaction the
ROUTE opened.

**What is still missing, plainly**: no RED artefact exists for it, and none can
be produced in this sandbox — the suite self-skips without `DATABASE_URL` and
`@prisma/client` has no generated client here, so reverting the wrapper yields
"18 skipped" both times rather than a RED. The structural defect is fixed; the
claim "these now go red on a Postgres runner" is a reading of the code. The
fixtures (formData keys, deadline fields, the bundle/deadline companion rows) are
the least verified part of the whole PR and should be expected to need repair on
the first real run.

## F3 — MEDIUM. A unit test claimed a rollback it could not observe

Renamed to `a failing canonical emission is NOT swallowed — it propagates and the
route 500s`, which is what a pass-through `$transaction` can establish. The
rollback claim now lives only in the integration file. No unit test in this PR
asserts INVARIANT A0 clause (2).

## F4 — MEDIUM (Law 3.2). Two comments claimed atomicity that does not exist

`applications.js` and `application-bundles.js` said the hops and their canonical
rows "land or vanish together". False: the writer emits those rows behind a
fail-OPEN savepoint fence, so a committed hop with no canonical row is reachable
**by design**. Both comments now carry an explicit ATOMIC / BEST-EFFORT split.

The underlying contradiction is NOT resolved silently. INVARIANT A0 clause (1)
("Δ = +1 พอดี") and the fail-open failure policy chosen in §2 of the same
document cannot both be true; that is a design ruling, not an implementer's call.
It is filed as **AMBIGUOUS A6 in `evidence/A0-AUDIT-EMISSION/design-decision.md`**
with three options (reword the invariant + require observability · flip
fail-closed earlier · declare the invariant a post-contract goal) for
senior-swe/operator.

## F5 — MEDIUM. No failure-path case of its own

Four cases added: hop 2 rejecting must not produce a success body; the rejection
must PROPAGATE OUT of the caller transaction (a route that swallowed it inside
the callback would let Prisma commit hop 1 — the exact split state the wrapper
exists to prevent); hop 1 rejecting must not attempt hop 2; and the bundle
equivalent.

**RED**: `red-raw-jest-f5-failure-path.txt`, captured by restoring the two route
files to `188bd438^` and re-running. Three of the four are genuinely red there
(`Expected number of calls: 1 / Received: 0` — no transaction was ever opened;
`- Array ["rolled-back"] / + Array []`). The fourth, `hop 1 rejecting never
attempts hop 2`, is **green at birth = a pin, not a fix**.

## F6 — LOW-MED. A standing promise with nothing behind it

design-decision.md §3 promised per-hop integration for #13-15, #18-22 and #24.
Shipped: #13, #14, #15 (plus #7, #8/#9, #12). Descoped with one reason each in a
new table in design-decision.md §3: #18/#21 sit behind
`requireCanonicalPermission` + a 23-export deps module and were not changed by
this PR; #19 needs an ACTIVE auditor plus a collision-free window; #20 is not a
route at all (it is called by #18); #22 needs WorkActivity + StageActivityConfig
+ group membership seeded consistently; #24 is a service call needing a working
day on the real holiday calendar under a Serializable transaction. All six keep
their call-site contract pin in
`__tests__/unit/a0-pr2-hop-emission-contract.test.js`.

## Files added/changed by the round-1 fixes

| File | Why |
|---|---|
| `apps/backend/services/application-status-writer.js` | F1 — `runFencedBestEffort` + the work-activity fence. **This is the writer, which the PR-A0-2 dispatch put out of scope "เว้นแต่จำเป็นจริง"; F1 is that case, and the coordinator instructed the fix here.** |
| `apps/backend/__tests__/unit/a0-pr2-work-activity-fence.test.js` | NEW — F1 RED→GREEN on the stateful fake |
| `apps/backend/__tests__/integration/a0-pr2-per-hop-invariant.test.js` | F2 — rewritten table-driven against real routes |
| `apps/backend/__tests__/unit/a0-pr2-admin-override-canonical-row.test.js` | F3 — case renamed, claim moved |
| `apps/backend/__tests__/unit/a0-pr2-submit-hops-audit-emission.test.js` | F5 — 4 failure-path cases |
| `apps/backend/routes/api/applications/applications.js` | F4 — comment corrected |
| `apps/backend/routes/api/applications/application-bundles.js` | F4 — comment corrected |
| `evidence/A0-AUDIT-EMISSION/design-decision.md` | F4 — AMBIGUOUS A6 · F6 — descope table |

New evidence files: `red-raw-jest-f1-work-activity.txt`,
`red-raw-jest-f5-failure-path.txt`, `green-raw-jest-r2.txt`,
`full-suite-raw-r2.txt`, plus the appended sections in `test-output.txt` and
`ratchet-before-after.txt`.

## Still open after round 1

* Clause (2) of INVARIANT A0 has **no execution evidence** for any hop. Unchanged
  by these fixes — it needs Postgres.
* AMBIGUOUS A6 (invariant vs fail-open) is a design ruling awaiting
  senior-swe/operator.
* The integration fixtures have never been exercised.
