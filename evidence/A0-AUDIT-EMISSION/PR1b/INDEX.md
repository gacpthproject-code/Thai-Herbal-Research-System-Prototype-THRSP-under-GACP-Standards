# Evidence pack — PR-A0-1b (fix cycles 1/3 and 2/3 on the audit-by-default writer)

Work item: fix the adversarial-audit findings raised against commit `4f2561f9` (merged as
`2074444e`) — cycle 1: F1 / F2 / F3 / F5 · cycle 2: F-A / F-B / the CERT_AUTO_GEN_ROLLBACK
marker lifted out of BACKLOG-FOUND. Phase: RED → GREEN → EVIDENCE.
Status: **PENDING** — integration execution and merge both wait on a runner (F4 stays out of scope).

## Files in this pack

| file | what it is |
|---|---|
| `red-raw-jest.txt` | cycle 1 — new/strengthened tests run against the **unmodified** writer (HEAD `2074444e`). 5 failing tests — the true RED for F1 and F3. |
| `green-raw-jest.txt` | cycle 1 — same three suites after the fix: 23/23 passing. |
| `full-suite-raw.txt` | cycle 1 — full backend suite WITH the diff. |
| `red-raw-jest-cycle2.txt` | cycle 2 — the two new cases run against commit `5e45df43` (cycle-1 code): 2 failing. |
| `green-raw-jest-cycle2.txt` | cycle 2 — after the F-B / marker fix: 25/25 passing. |
| `full-suite-raw-cycle2.txt` | cycle 2 — full backend suite WITH both cycles applied. |
| `baseline-clean-tree-raw.txt` | full backend suite on the stashed CLEAN tree, same sandbox, same node_modules — the baseline both cycles are compared against. |
| `test-output.txt` | the summaries side by side + the identical failing-suite list + the delta, per cycle. |
| `ratchet-before-after.txt` | ratchet counters before/after each cycle + eslint result on every touched file. |

## What was RED, and where it is proved

`red-raw-jest.txt` (run against HEAD, writer untouched):

```
Tests:       5 failed, 18 passed, 23 total
✕ [F1] audit INSERT failure inside a CALLER tx must not cost the business write
      Expected: "PENDING_DOC_FEE"   Received: "SUBMITTED"
✕ [F1] the caller can keep working in its tx after a failed emission (mint-cert style hop)
      current transaction is aborted, commands ignored until end of transaction block   (25P02)
✕ [F3] cert-hook failure in DEFAULT mode emits the compensating reversal row
      - ["AUDIT_PASSED","SUBMITTED"]   (reversal row missing)
✕ [F3] cert-hook failure inside a CALLER tx: reversal row emitted, caller tx still committable
✕ fail-open: a failing default emission inside a CALLER tx is UNWOUND to a savepoint (not merely swallowed)
      (application-status-writer-audit-default.test.js — the strengthened F2 case)
```

## Tests that were GREEN AT BIRTH — declared PINS, not fixes (Law 3.11 / 3.7)

These never failed on HEAD. They exist to make the harness honest and to lock behaviour
the fix must not break. They are **pins**, and this pack does not claim them as fixes:

* `[harness] a failed INSERT aborts the tx and COMMIT silently rolls it back`
* `[harness] ROLLBACK TO SAVEPOINT clears the abort and keeps pre-savepoint work`
* `[F1] a caller tx that is NOT poisoned still gets its row, committed with the status write`
* `[F1] the caller tx is never left holding an orphan savepoint on success`
* `[F5] bare client + failing emission: the internal tx is unwound and the UPDATE re-applied EXACTLY once`
* `[F5] bare client happy path: UPDATE and audit row land in the SAME commit, version +1`
* `[F3] cert-hook failure with onAudit:false stays silent (tri-state preserved)`
* `[F3] cert-hook failure with an onAudit callback emits via the callback only (no double row)`
* `fail-open: a SUCCESSFUL default emission in a CALLER tx releases its savepoint (no orphan)`

The two `[F5]` pins are the direct answer to finding F5: the old `$transaction` stub could not
tell "unwound then re-applied" from "UPDATE ran twice"; the stateful fake distinguishes them by
the committed `version` (2 = unwind + re-apply, 3 would be applied twice).

## NOT RUN HERE — self-skipping / non-loading (stated plainly, Law 3.8)

`__tests__/integration/status-writer-audit-default-invariant.test.js` — the two new cases
(`(F1) audit INSERT failure inside a CALLER tx ⇒ the status write still COMMITS` and
`(F3) cert-hook failure in DEFAULT mode ⇒ a compensating reversal row exists`) have **never
executed**. In this sandbox the suite does not even load: `@prisma/client` has no generated
client (`Cannot find module '.prisma/client/default'` — gacp-debug SKILL.md:21), and the whole
describe self-skips without `DATABASE_URL` anyway.

**Correction (cycle 2, finding F-A — the cycle-1 wording of this section was wrong).** It said
their "RED and GREEN count on a runner". As first written, the `(F1)` case could not have gone
red on ANY environment: the proxy stubbed only `auditLog.create`, while `logWithin` reads the
chain tail first (`middleware/audit-logger.js:611` → `getLastHash` :327 →
`client.auditLog.findFirst`). `findFirst` was undefined, so a TypeError was raised **before** the
poisoning statement ran — the transaction was never aborted and the old writer's plain swallow
passed the case. The proxy is now a pass-through that wraps only `create`, runs the failing
statement in the same transaction and then delegates, so the writer meets the real 25P02 raised by
the real INSERT after the real critical path (lock → tail read → insert).

What is claimed now, exactly: **these two integration cases have not run anywhere yet** — not red,
not green. Whether they go red on the pre-fix writer is a prediction from reading the code, and it
is only settled by a runner with Postgres (design-decision.md §4, R-R2-1: skipped = did not pass
the gate). F4 (integration never executed) remains open by mandate.

## Cycle 2 — what changed (findings F-A, F-B, and the item lifted from BACKLOG-FOUND)

* **F-A** — integration proxy rewritten to pass-through
  (`status-writer-audit-default-invariant.test.js:57-92`); INDEX claim corrected above.
* **F-B** — the cert revert and its compensating row now share ONE internal transaction on a bare
  client via `applyWithDefaultAuditInInternalTx` (`application-status-writer.js:451-478`), the same
  mechanism the forward write uses. Previously the reversal row was emitted in autocommit, so the
  audit chain's **xact** advisory lock (`audit-logger.js:606`) was released before the tail read it
  exists to protect (:593-606) and the row was not atomic with the revert UPDATE.
  RED: `red-raw-jest-cycle2.txt` — the received statement stream is `autocommit:UPDATE application`,
  `autocommit:SELECT pg_advisory_xact_lock`, `autocommit:INSERT auditLog`.
* **item 3 (was BACKLOG-FOUND, now fixed)** — the `CERT_AUTO_GEN_ROLLBACK` marker no longer calls
  `logWithin(event, prisma)` bare; it goes through the shared fence `emitAuditFailOpen`
  (`application-status-writer.js:367-434`, call site :1040): savepoint inside a caller tx, short internal transaction
  on a bare client. RED case: `[cycle2-3] the CERT_AUTO_GEN_ROLLBACK marker must not poison the
  caller tx either`.

Cycle-2 files: `red-raw-jest-cycle2.txt`, `green-raw-jest-cycle2.txt`, `full-suite-raw-cycle2.txt`,
plus the cycle-2 sections appended to `test-output.txt` and `ratchet-before-after.txt`.
The two new cycle-2 tests were **RED on commit 5e45df43** before the fix (raw output attached);
neither is a pin.

## Environment caveat

This worktree shipped without `node_modules`. `node_modules` and `apps/backend/node_modules` are
symlinks into the sibling worktree `.claude/worktrees/agent-af83f1241f0725d4b` after verifying
both `package.json` files are byte-identical. Both full-suite runs (diff and baseline) used that
same tree, so the comparison is apples-to-apples; the absolute failure count (14 suites / 35
tests) is therefore this sandbox's number, not the 12-suite number recorded in PR-A0-1's commit
message from a different environment.
