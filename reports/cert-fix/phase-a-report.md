# cert-fix Phase A — fail-closed onsite evidence gate — 2026-08-16

Status: DONE(probe: `npx jest audit-onsite -i` in this session — see output below)

## Bug (verified)

`apps/backend/services/audit-onsite-service.js` `submitDecision()` guarded the
onsite-evidence checks with `typeof prisma.farmAuditPhoto?.count === 'function'`
(and the `farmAuditChecklistItem` equivalent). `FarmAuditPhoto` and
`FarmAuditChecklistItem` do not exist as Prisma models — confirmed by grepping
`apps/backend/prisma/schema/*.prisma` for `^model (FarmAuditPhoto|FarmAuditChecklistItem|AuditChecklist)\b`:
only `AuditChecklist` (system.prisma:295) matched. So `prisma.farmAuditPhoto` is
always `undefined` in this deployment, the guard is always `false`, both checks
were silently skipped, and a `PASS` decision minted a certificate
(AUDIT_CONFIRMED → AUDIT_PASSED, the trigger for downstream cert auto-gen) with
zero photos and zero checklist items recorded.

## Fix

`apps/backend/services/audit-onsite-service.js:780-810` (was :780-804). The
evidence gate now:
1. Runs **only** when `decision === DECISIONS.PASS` (a FAIL goes to
   CAR_PENDING and needs no evidence — untouched).
2. Is **fail-closed**: if either model's `.count` is not a function, throws
   `Error` with `err.code = 'EVIDENCE_CAPTURE_UNAVAILABLE'` instead of
   skipping.
3. Otherwise runs the original `INSUFFICIENT_PHOTOS` / `INCOMPLETE_CHECKLIST`
   checks unchanged (same messages, same codes).

Nothing else in `submitDecision` was touched — confirmed by `git diff` on the
source file: the only hunk is the evidence-gate block (lines 780-810 pre-fix →
post-fix). The cert-mint path (`_targetStateForDecision`, the `carDueAt`/
`carFormData` computation, the `$transaction` block that writes the audit row
+ calls `writeApplicationStatus`, the CAR deadline seed, and the fanout call)
is byte-for-byte unchanged below the gate.

## TDD evidence

### RED (pre-fix) — proves the hole

New test in `apps/backend/__tests__/services/audit-onsite-service.test.js`,
`submitDecision > cert-integrity: fail-closed evidence gate`, run before the
source edit:

```
● ... CERT-INTEGRITY: PASS with unprovisioned evidence models throws
  EVIDENCE_CAPTURE_UNAVAILABLE (fail-closed) and never reaches cert mint

  expect(received).rejects.toMatchObject()
  Received promise resolved instead of rejected
  Resolved to value: {"audit": {..., "status": "COMPLETED", ...},
    "notify": {...}, "transition": {"id": "app-1", "status": "AUDIT_PASSED"}}

Tests: 1 failed, 32 passed, 33 total
```

A PASS with zero evidence models resolved and transitioned the application to
`AUDIT_PASSED` — the exact bug.

Two pre-existing tests were also confirmed green pre-fix by relying on the
same loophole (prisma mocks that omit `farmAuditPhoto`/`farmAuditChecklistItem`
and assert a PASS succeeds):
- `__tests__/unit/audit-onsite-car-deadline.test.js` — "PASS → does NOT seed a
  CAR deadline and does NOT override formData"
- `__tests__/unit/audit-onsite-ownership.test.js` — "allows the assigned
  auditor" (submitDecision describe block)

```
PASS __tests__/unit/audit-onsite-car-deadline.test.js (2/2)
PASS __tests__/unit/audit-onsite-ownership.test.js (8/8)
```

### GREEN (post-fix)

```
cert-integrity: fail-closed evidence gate
  √ CERT-INTEGRITY: PASS with unprovisioned evidence models throws
    EVIDENCE_CAPTURE_UNAVAILABLE (fail-closed) and never reaches cert mint
  √ FAIL decision unaffected: unprovisioned evidence models do not throw
    (a FAIL needs no evidence)
  √ PASS with evidence present (provisioned models, sufficient counts)
    passes the gate

Test Suites: 1 passed, 1 total
Tests:       33 passed, 33 total
```

Full audit-onsite surface after the fix + the two test updates below:

```
$ npx jest audit-onsite -i
PASS __tests__/unit/audit-onsite-routes.test.js
PASS __tests__/unit/audit-onsite-rbac.test.js
PASS __tests__/unit/audit-onsite-ownership.test.js
PASS __tests__/unit/audit-onsite-car-deadline.test.js
PASS __tests__/services/audit-onsite-service.test.js
Test Suites: 5 passed, 5 total
Tests:       100 passed, 100 total
```

`__tests__/integration/cross-system-audit-to-cert-flow.test.js` (the other repo
hit for `submitDecision`) — entire suite is `describe.skip` because
`./helpers/test-db-setup` was never committed (pre-existing, unrelated to this
fix — confirmed by reading the file's own top-of-file comment and rerunning
it): `Test Suites: 1 skipped, 0 of 1 total`. Not modified.

## Existing tests updated (and why)

Both asserted a PASS with **zero evidence provisioned** succeeds — that was
the bug, encoded as expected behavior. Neither test's actual subject is the
evidence gate (one guards the CAR-deadline clock, the other guards
per-auditor ownership), so each was updated to hand `submitDecision` enough
evidence to clear the new gate legitimately, preserving the original
assertions un-weakened:

- `audit-onsite-car-deadline.test.js`: added `makePrismaWithEvidence()`
  (wraps the existing `makePrisma()` and adds `farmAuditPhoto.count`/
  `farmAuditChecklistItem.count` returning sufficient counts); the PASS test
  now uses it. The FAIL test is untouched (FAIL needs no evidence, its bare
  mock stays valid). Updated the stale top-of-file comment that described the
  old skip-when-unprovisioned behavior.
- `audit-onsite-ownership.test.js`: added the same two `.count` mocks
  directly to the `submitDecision` describe block's `prismaFor()`. The
  `AUDIT_AUDITOR_MISMATCH` test is unaffected either way — ownership is
  checked before the evidence gate — but now both tests in the block share
  one prisma shape. Updated the stale top-of-file comment.

No assertion about ownership or the CAR-deadline clock was weakened or
removed — only the evidence-provisioning shape of the input mock changed.

## Ratchet

`bash scripts/probes/ratchet.sh`: `PASS: no counter above baseline — current:
hardcode=43 todo=59 env-direct=168 dup-source=2`.

## Files changed

- `apps/backend/services/audit-onsite-service.js` — the fix (lines 780-810)
- `apps/backend/__tests__/services/audit-onsite-service.test.js` — 3 new
  tests (RED-first)
- `apps/backend/__tests__/unit/audit-onsite-car-deadline.test.js` — evidence
  added to the PASS test's prisma mock + comment update
- `apps/backend/__tests__/unit/audit-onsite-ownership.test.js` — evidence
  added to `prismaFor()` + comment update

## Not done / out of scope

- Did not touch `routes/api/audit/onsite.js` error-code mapping — an
  `EVIDENCE_CAPTURE_UNAVAILABLE` throw currently falls through to the
  generic `400 ONSITE_DECISION_FAILED`-shaped branch (surfaces the real
  `err.code` in the response body, just not a dedicated HTTP status). Not
  part of the Phase A instruction (evidence gate only).
- Comments in `audit-onsite-service.js` (`startInspection`, `submitDecision`
  docblock) reference `auditor-audit-decision-handler.js` as a sibling path
  for CAR-deadline seeding; not inspected for the same evidence-skip pattern
  — out of scope for Phase A, flagging for a possible Phase B look.

---

# Phase A2 — the choke point (2026-08-16)

Status: DONE(probe: `npx jest audit-onsite onsite-evidence-gate certificate-service application-status-writer audits- -i` in this session — 17 suites / 262 tests, see output below)

Adversarial review of Phase A found it closed exactly ONE of four paths that
can reach a certificate mint. This phase closes the other three by moving the
check to the ONE place all four converge, plus proves (by test, not
assertion) that a refusal there does not leave a dangling `AUDIT_PASSED`.
Full incident writeup: `HARNESS_LOG.md` (2026-08-16, "VERIFIED CRITICAL:
cert-integrity").

## The three sibling doors (reviewer-verified, file:line)

- `apps/backend/routes/api/audit/audits.js:445-467` — `POST /:id/result`,
  `result==='PASS'` → `AUDIT_PASSED` via `writeApplicationStatus`. No evidence
  check anywhere in the route.
- `apps/backend/routes/api/provider/handlers/auditor-audit-decision-handler.js` —
  `decision==='PASS'` → `AUDIT_PASSED`. Accepts client-supplied `checklist`/
  `evidence` arrays (lines 47-48) but never validates a minimum count.
- `apps/backend/routes/api/provider/auditor.js:130-152` — final-approvals
  calls `certificateService.generateCertificate(...)` **directly**, bypassing
  `writeApplicationStatus`'s hook entirely.

All three — and `submitDecision` — fund through `certificate-service.js`
`generateCertificate`, confirmed by reading the whole function
(`apps/backend/services/certificate-service.js:196-431`): it is the only
place that calls `client.certificate.create`.

## The fix

**New shared module** `apps/backend/services/onsite-evidence-gate.js` —
`assertOnsiteEvidenceSufficient({ prisma, applicationId, minPhotos })`:
1. Looks up the application's onsite audit via
   `prisma.auditChecklist.findFirst({ where: { applicationId }, orderBy: { createdAt: 'desc' } })`
   (most-recent-first — `applicationId` is a plain FK on `AuditChecklist`,
   not unique, so more than one row per application is schema-legal).
2. **No row at all → throws `NO_ONSITE_AUDIT`** (fail-closed: cannot certify
   an application with no recorded onsite audit).
3. Same fail-closed evidence check as Phase A (`EVIDENCE_CAPTURE_UNAVAILABLE`
   / `INSUFFICIENT_PHOTOS` / `INCOMPLETE_CHECKLIST`), lifted verbatim.
4. `CHECKLIST_TEMPLATE_2026`/`DEFAULT_MIN_PHOTOS` stay single-sourced in
   `audit-onsite-service.js`; this module requires it **lazily** (inside the
   function body) to avoid a load-time require cycle, since
   `audit-onsite-service.js` requires this module at its own top level.

**`certificate-service.js`** (`generateCertificate`, after the post-audit-state
gate at the former lines 270-281, before `resolveFarmForCertificate` — i.e.
before any mint/DB write): calls
`assertOnsiteEvidenceSufficient({ prisma: client, applicationId })`. This is
the choke point — every one of the four paths now refuses here.

**`audit-onsite-service.js`** `submitDecision`: refactored to call the same
helper (`assertOnsiteEvidenceSufficient({ prisma, applicationId: audit.application.id, minPhotos })`)
instead of the Phase A inline block — one source of truth, per reviewer
instruction #3. Same error codes/messages preserved (regex-matching existing
tests still pass unmodified).

## RED → GREEN: the choke point itself

`apps/backend/__tests__/unit/certificate-service-evidence-gate.test.js` — drives
the REAL `generateCertificate` (not mocked), `skipInitialAssets: true` to keep
the mock scoped to the evidence gate rather than the unrelated
PlantingCycle/Batch/QR bootstrap.

RED (pre-A2, captured before adding the gate call) — all four insufficient-evidence
cases **genuinely minted**, proving zero evidence checking existed in
`generateCertificate`:
```
× refuses ... unprovisioned: throws EVIDENCE_CAPTURE_UNAVAILABLE
    Received promise resolved instead of rejected
    Resolved to value: {"certificateNumber": "GACP-TH-2569-79CA1B", "id": "cert-new",
      "documentHash": "hmac-sha256:...", "status": "active", ... }
× refuses ... no onsite audit row: throws NO_ONSITE_AUDIT
    Resolved to value: {"certificateNumber": "GACP-TH-2569-863B8F", ...}
× refuses ... photos below minimum: throws INSUFFICIENT_PHOTOS
    Resolved to value: {"certificateNumber": "GACP-TH-2569-21F7C1", ...}
× refuses ... checklist incomplete: throws INCOMPLETE_CHECKLIST
    Resolved to value: {"certificateNumber": "GACP-TH-2569-505732", ...}
Tests: 4 failed, 1 passed, 5 total
```
(The 5th test, sufficient-evidence mints successfully, was never expected to
fail — it is the regression-lock for the legitimate path.)

GREEN (post-A2):
```
PASS __tests__/unit/certificate-service-evidence-gate.test.js
  √ refuses ... unprovisioned: throws EVIDENCE_CAPTURE_UNAVAILABLE, no Certificate row created
  √ refuses ... no onsite audit row: throws NO_ONSITE_AUDIT, no Certificate row created
  √ refuses ... photos below minimum: throws INSUFFICIENT_PHOTOS, no Certificate row created
  √ refuses ... checklist incomplete: throws INCOMPLETE_CHECKLIST, no Certificate row created
  √ mints successfully when evidence is sufficient
Tests: 5 passed, 5 total
```
Each refusal case also asserts `prisma.certificate.create` was never called —
only ONE "Farm created for cert" log line appears in the post-fix run (from
the sufficient-evidence case), versus four in the RED run.

The shared helper itself: `apps/backend/__tests__/services/onsite-evidence-gate.test.js`,
11 tests including the reviewer's flagged missing case (see below) and a
multiple-audit-rows-per-application case (most-recent-first).

## The missing case the reviewer flagged: exactly ONE model present

Both the standalone helper test and a new case in
`audit-onsite-service.test.js`'s `submitDecision` cert-integrity block assert
that a partial deployment (only `farmAuditPhoto` OR only
`farmAuditChecklistItem` provisioned, never both) still throws
`EVIDENCE_CAPTURE_UNAVAILABLE`. This was already correct by construction (the
Phase A code used `||` across two negated checks), so this test is a
regression-lock rather than a bug find — it passed immediately once the
shared helper existed, which is expected: the logic was lifted verbatim, not
rewritten.

## Rollback-behavior finding — the reviewer's central question

**Question**: when `generateCertificate` throws inside
`application-status-writer.js`'s AUDIT_PASSED auto-issue hook (`:967-1010`+),
does the application end up genuinely refused, or dangling at `AUDIT_PASSED`
with no certificate?

**Verdict: REFUSED, not dangling** — for every live route. Proven, not
asserted, by a new test file that leaves `certificate-service` **unmocked**
(the existing `application-status-writer-cert-hook.test.js` mocks it, so it
only proves the writer's rollback *contract* for an arbitrary thrown error,
never actually exercising the real gate):

`apps/backend/__tests__/unit/application-status-writer-cert-hook-evidence-gate.test.js`
— real `writeApplicationStatus` → real `generateCertificate` → real
`assertOnsiteEvidenceSufficient`, called the same way every live route calls
it (`prisma.$transaction(async (tx) => writeApplicationStatus({ prisma: tx, ... }))`):

```
√ cert-gen refuses (NO_ONSITE_AUDIT) -> writer rolls the status back to
  fromStatus and re-throws -> caller tx aborts, nothing persists at AUDIT_PASSED
√ cert-gen refuses (EVIDENCE_CAPTURE_UNAVAILABLE) -> same refuse-and-revert contract
√ control: sufficient evidence -> the real chain mints a certificate and does NOT roll back
Tests: 3 passed, 3 total
```

Mechanics confirmed by assertion, not just the error code: `tx.application.update`
is called exactly **twice** on refusal — call 1 writes `AUDIT_PASSED`, call 2
reverts to `fromStatus` (`AUDIT_CONFIRMED`) at the same `{id}` — and the
writer re-throws (`wrapped.code` = the real gate's code, e.g.
`NO_ONSITE_AUDIT`). `tx.certificate.create` is never called on refusal. On the
control (sufficient-evidence) run, exactly **one** `application.update` call
happens (no revert) and `certificate.create` fires once — this run exercises
the REAL (unskipped) `createInitialAssets` bootstrap too (PlantingCycle +
HarvestBatch + QR), proving the fix does not regress the legitimate
auto-issue flow at its most realistic depth.

Because every live route (`audits.js`, `auditor-audit-decision-handler.js`,
`audit-onsite-service.js`) threads a real `tx` handle into
`writeApplicationStatus` this same way, a re-thrown error inside that `tx`
callback aborts the **entire** Prisma transaction in production — nothing
commits, not even the writer's own manual revert step (moot once the
transaction never commits at all). That specific claim rests on Prisma's own
documented transaction semantics (throw inside `$transaction`'s callback
aborts it), not on anything newly proven here.

**One honest exception, not silently omitted**: `apps/backend/prisma/seed-approve.js`
and `apps/backend/controllers/e2e-controller.js` call `writeApplicationStatus({ prisma, ... })`
with a **bare** (non-transactional) client — confirmed by grep, neither wraps
the call in its own `prisma.$transaction`. For that shape the writer's
forward-write and revert are two independent, sequential statements (not one
atomic unit) — still always ends at `fromStatus` when the revert itself
succeeds (this exact scenario, including the revert-also-fails case, is
already covered by the pre-existing `rollback failure is swallowed (logged),
original cert error still re-thrown` test in
`application-status-writer-cert-hook.test.js`), but is not DB-atomic the way
the tx-threaded routes are. Neither script ever created an `AuditChecklist`
row for its fake-approved applications, so **both are now blocked by
`NO_ONSITE_AUDIT`** — a real behavior change for these dev/seed/E2E paths,
flagged here rather than fixed (out of scope: not a live user-facing route).

## Full regression sweep

```
$ npx jest audit-onsite onsite-evidence-gate certificate-service application-status-writer audits- -i
Test Suites: 17 passed, 17 total
Tests:       262 passed, 262 total
```
Includes the pre-existing `certificate-service.test.js` (read-side methods,
untouched by this change), all four `application-status-writer-*.test.js`
files (including the generic mocked rollback-contract tests, still green),
all four `audits-*.test.js` route-wiring files (including "Blocker H", which
independently pins that `audits.js` hands `writeApplicationStatus` the exact
tx-threaded shape this fix's rollback proof depends on), and every
`audit-onsite*`/`onsite-evidence-gate` file from Phase A.

## Ratchet

`bash scripts/probes/ratchet.sh`: unchanged —
`hardcode=43 todo=59 env-direct=168 dup-source=2`, `PASS: no counter above baseline`.

## Files changed (Phase A2)

- `apps/backend/services/onsite-evidence-gate.js` — new shared helper
- `apps/backend/services/certificate-service.js` — the choke-point gate call
  (before `resolveFarmForCertificate`)
- `apps/backend/services/audit-onsite-service.js` — `submitDecision`
  refactored to call the shared helper (DRY)
- `apps/backend/__tests__/services/onsite-evidence-gate.test.js` — new,
  11 tests
- `apps/backend/__tests__/unit/certificate-service-evidence-gate.test.js` —
  new, 5 tests (the choke-point RED→GREEN)
- `apps/backend/__tests__/unit/application-status-writer-cert-hook-evidence-gate.test.js` —
  new, 3 tests (the rollback proof)
- `apps/backend/__tests__/services/audit-onsite-service.test.js` — added the
  one-model-present regression-lock case
- `apps/backend/__tests__/services/audit-onsite-service.test.js` (`makePrismaStub`) —
  `auditChecklist.findFirst` now supports lookup by `applicationId` (the
  shared helper's query shape) in addition to the pre-existing `id` lookup
- `HARNESS_LOG.md` — incident entry appended (2026-08-16, "VERIFIED CRITICAL:
  cert-integrity")

## Not done / out of scope (Phase A2)

- `seed-approve.js` / `e2e-controller.js` not updated to create real onsite
  evidence — they will now fail with `NO_ONSITE_AUDIT` on their fake-approve
  paths (see rollback-behavior section above). Flagged for the operator to
  decide: fix the scripts, or accept the block as correct.
- Did not add a dedicated `NO_ONSITE_AUDIT`/`EVIDENCE_CAPTURE_UNAVAILABLE` →
  HTTP-status mapping in `routes/api/audit/audits.js` or
  `auditor-audit-decision-handler.js` — both already surface *some* non-200
  response (the generic catch-all paths, 4xx/5xx depending on the route), just
  not a dedicated one. Same scope boundary as Phase A's note on
  `routes/api/audit/onsite.js`.
- Did not attempt a supertest-level drive of `audits.js`/`auditor-audit-decision-handler.js`
  themselves (the reviewer's "if feasible" ask). The choke-point proof
  (this section) plus the pre-existing "Blocker H" wiring test
  (`audits-result-transition-audit.test.js`, confirms `audits.js` hands
  `writeApplicationStatus` the real tx-threaded shape) together already
  establish the same conclusion for that specific route without a third,
  largely-redundant mock of the same chain from the Express layer.
