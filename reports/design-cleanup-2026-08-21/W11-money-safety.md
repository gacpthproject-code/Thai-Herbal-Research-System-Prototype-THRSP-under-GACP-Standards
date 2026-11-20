# W11 money-safety — 2026-08-22

Status: PENDING (worktree only, nothing committed — operator merge, Tier C)
Worktree: `C:/Users/charo/Documents/GitHub/gacp-wt-money` · branch `fix/money-safety-proposals` from `main` @ 94ac46ac

Did:
- **W11-1 `/api/pricing` fails CLOSED** — both catch arms returned `200 {success:true, data: defaultFeesPayload()}` (`routes/api/finance/pricing.js:172-175` and `:199-206` on 94ac46ac). Now `503 PRICING_UNAVAILABLE` + Thai copy stating cause and next action. New catalog row `shared/error-codes.js` (`PRICING_UNAVAILABLE`, 503). Happy path and the no-SystemConfig-row default are untouched (pinned by 2 tests).
- **W11-2 `paymentLimiter` now covers `POST /api/payments/checkout`** — `server.js:325-328` limited `/create`, `/phase1`, `/phase2`, `/slip/upload` but not `/checkout` (`routes/api/finance/payments.js:409`), which mints a Stripe PaymentIntent per call. Existing middleware applied to one more path; no money logic touched.
- **W11-3 fee literals de-duplicated (values unchanged)** — `pricing.js` `computePricing` defaults and `defaultFeesPayload()` now read `FEE_RATES.PHASE1_PER_SCOPE/PHASE2_PER_SCOPE` from `modules/billing`, the same object `calculatePhase1Fee`/`calculatePhase2Fee` bill from. `apps/web-app/src/hooks/use-pricing.ts:86` `vatRate: 0.07` → `GACP_VAT_RATE` from the SSoT module it already imports.
- **W11-4 dead fee table removed** — `apps/backend/constants/service-type-enum.js` deleted. It declared a FOURTH fee table (`fieldInspection: 30000`, `total: 35000`) contradicting the canonical 25,000 / 33,210, with **zero importers** (proof: `W11-PROOF-dead-fee-table.txt`; the repo's own `scripts/review/agent-duplicate-zombie-results.json:162` already flags it "File never imported/required by any other file"; no dynamic loader over `constants/`).
- **9 patches PROPOSED, not applied** — §PROPOSED below. Nothing that writes a payment, invoice, receipt or remittance row was touched (L3).

Ratchet (`scripts/probes/ratchet.sh`, run in this worktree): before `hardcode=36 todo=56 env-direct=122 dup-source=2` → after `hardcode=30 todo=56 env-direct=122 dup-source=2`. PASS, hardcode **down 6**, nothing up.

Blocked:
- `scripts/probes/money-equation.sh` → **BLOCKED(operator: no `psql` on this machine)**. `DATABASE_URL` is set but `command -v psql` is empty, so the probe self-blocks ("no vacuous pass"). Not run, not claimed.
- W11-P4 below is proven statically from the writer; the *live* Postgres confirmation is DB-gated for the same reason.

Next:
1. Operator merges or rejects the 4 applied changes (Tier C — `tier-check.sh` on the file list returns **TIER=C**, driven by `routes/api/finance/pricing.js` (money)).
2. Operator picks which of W11-P1…P9 to authorise; P8 and P4 are the two that still leave a wrong number in front of a user.
3. Run `money-equation.sh` on a machine with `psql`.

Evidence (this directory):
`W11-RED-pricing.txt` · `W11-RED-fee-ssot.txt` · `W11-RED-limiter.txt` · `W11-GREEN-batch.txt` · `W11-GREEN-money-suites.txt` · `W11-PROOF-dead-fee-table.txt` · `W11-ratchet-after.txt`

---

## Files changed (worktree, uncommitted)

```
 D apps/backend/constants/service-type-enum.js        (-107)
 M apps/backend/routes/api/finance/pricing.js
 M apps/backend/server.js
 M apps/backend/shared/error-codes.js
 M apps/web-app/src/hooks/use-pricing.ts
 M evidence/ratchet-current.txt                       (probe artifact, rewritten by ratchet.sh)
?? apps/backend/__tests__/unit/pricing-fail-closed.test.js
?? apps/backend/__tests__/unit/fee-table-ssot.test.js
?? apps/backend/__tests__/unit/payment-limiter-covers-checkout.test.js
```

Intended commit message:

```
fix(money): fail-closed pricing, rate-limit checkout, one fee table

- /api/pricing: an internal error now returns 503 PRICING_UNAVAILABLE with
  Thai copy instead of 200 + unverified default fees. Removes a path that
  quoted an applicant a number the platform never verified. The no-config
  default path is unchanged.
- server.js: paymentLimiter now covers POST /api/payments/checkout, the one
  PaymentIntent-minting payments route that had only the global limiter.
- pricing.js + use-pricing.ts: read the state fees / VAT rate from the
  canonical sources instead of re-spelling the literals. Values identical,
  pinned by fee-table-ssot.test.js.
- delete constants/service-type-enum.js: a fourth, contradicting fee table
  (fieldInspection 30000 / total 35000) with zero importers.

No payment, invoice, receipt or remittance row is written or changed (L3).
Ratchet: hardcode 36 -> 30, others flat.
```

## Tests — RED then GREEN

| suite | RED (on 94ac46ac source) | GREEN (after) |
|---|---|---|
| `pricing-fail-closed.test.js` | 4 failed / 3 passed — both routes `Expected: 503 / Received: 200`, message `""` | 7 passed |
| `fee-table-ssot.test.js` | 1 failed / 3 passed — 7 offenders listed (`service-type-enum.js:26,27,31`, `pricing.js:44,45,147,148`) | 4 passed |
| `payment-limiter-covers-checkout.test.js` | 2 failed / 1 passed — `uncovered: ["/checkout"]` | 3 passed |

RED for `pricing-fail-closed` was captured against the pristine route restored with
`git show 94ac46ac:apps/backend/routes/api/finance/pricing.js`, then the fixed file was put back.
A first RED attempt was **discarded as untrustworthy**: the suite carried a `jest.resetModules()`
that handed the router a second copy of `system-config-service` while the mock pointed at the
first, so the error path was never actually entered. The comment in the suite records this.

Money-adjacent suites (`checkout|settlement|pricing|invoice|receipt|payment|fee|error-codes`):
**62 suites / 568 tests, 0 failed** (`W11-GREEN-money-suites.txt`).

Other gates: `stripe-sdk-isolated` PASS · `settle-webhook-only` PASS · `ratchet` PASS ·
eslint clean on every changed backend file and `use-pricing.ts` · `tsc --noEmit` clean.

## What the applied changes deliberately do NOT fix

- `defaultFeesPayload().renewalFee = 15000` / `expediteFee = 10000` have **no canonical engine
  entry** and disagree with the frontend fallback (`constants/fees.ts:18` declares renewal
  **30,000**). Reconciling them would MOVE a quoted number → W11-P7, proposal only.
- A 503 from `/api/pricing/fees` does **not** reach the applicant as an error today: the wizard
  substitutes its own constants → W11-P8. The backend half alone is not sufficient.

---

# PROPOSED — diffs the operator must approve, NOT applied

Each block is the exact patch, the invariant it protects, the test that would prove it, and the
risk of applying it.

## W11-P1 — `onAudit` best-effort emission has no SAVEPOINT fence (backlog #58)

**Invariant.** A best-effort side-effect must never cost the caller its transaction. The default
emitter already goes through `emitAuditFailOpen` → `runFencedBestEffort`
(`services/application-status-writer.js:421,521-527`), whose own docstring at `:395-401` states
the rule: a bare `try/catch` inside somebody else's transaction turns a cosmetic failure into
Postgres `25P02`, and the caller's COMMIT becomes a silent ROLLBACK with no exception anywhere.
The caller-supplied emitter at `:582-596` is still a bare `try/catch` — the one path the fence
was built for and does not cover. `GOALS.md:33`.

```diff
--- a/apps/backend/services/application-status-writer.js
+++ b/apps/backend/services/application-status-writer.js
@@ -582,17 +582,25 @@
-async function emitBestEffortTransitionAudit(onAudit, envelope) {
+async function emitBestEffortTransitionAudit(onAudit, envelope, client) {
     if (typeof onAudit !== 'function') {return;}
-    try {
-        await onAudit({
-            event: STATUS_TRANSITION_EVENT,
-            ...envelope,
-            timestamp: new Date(),
-        });
-    } catch (e) {
-        // Swallow + log; do NOT re-throw.
-        console.warn(
-            `[application-status-writer] onAudit callback failed (non-fatal): ${e?.message || e}`,
-        );
-    }
+    // A bare try/catch is correct ONLY in autocommit. When `client` is the
+    // caller's tx handle, a failed onAudit leaves the transaction ABORTED
+    // (25P02) and the swallow silently destroys the caller's status UPDATE —
+    // exactly the failure runFencedBestEffort exists to prevent (see :395-401).
+    // Same fence, same savepoint name, same fail-OPEN contract as the default
+    // emitter; a bare client still takes the plain-call path.
+    await emitAuditFailOpen(
+        client,
+        () => onAudit({
+            event: STATUS_TRANSITION_EVENT,
+            ...envelope,
+            timestamp: new Date(),
+        }),
+        'caller-supplied onAudit',
+    );
 }
@@ -915,1 +915,1 @@
-    await emitBestEffortTransitionAudit(onAudit, transitionEnvelope);
+    await emitBestEffortTransitionAudit(onAudit, transitionEnvelope, prisma);
```

**Test that would prove it.** Extend the existing "same savepoint on both ends" unit suite: call
`writeApplicationStatus` with a tx-shaped stub client and an `onAudit` that rejects; assert the
stub recorded `SAVEPOINT a0_audit_emit` → `ROLLBACK TO SAVEPOINT a0_audit_emit`, that the status
UPDATE is still present, and that nothing threw. RED today (no SAVEPOINT is issued at all).

**Risk.** MEDIUM. Behaviour change on every status transition that passes a caller-owned
`onAudit`, which includes the payment-closure and settlement paths. `emitAuditFailOpen` sets
`wrapBareClientInTx: true`, so a caller that today passes a **bare** client would gain a short
internal transaction it did not have — that must be checked per call site before merging, or the
option threaded through as `false` for this path. **Limitation:** the fence stops the caller's
transaction from being poisoned; it does **not** make the caller's emitter write through `tx`.
That is W11-P6, and P1 and P6 should land together.

## W11-P2 — advisory lock behaviour across `ROLLBACK TO SAVEPOINT` (backlog #59)

**Invariant.** `logWithin` takes `pg_advisory_xact_lock(AUDIT_CHAIN_LOCK_NS, hashtext(orgId))`
(`middleware/audit-logger.js:506,606`) to serialise read-tail → assign-sequence → INSERT. Inside
the fence, a failed emission unwinds with `ROLLBACK TO SAVEPOINT a0_audit_emit`
(`application-status-writer.js:357`). Whether that lock is still held afterwards decides if the
caller's remaining work runs under a lock nobody expects to hold.

**No diff proposed — this one needs a fact I cannot obtain in this session.** PostgreSQL
transaction-level advisory locks are released at transaction end; whether a lock acquired inside
a subtransaction survives `ROLLBACK TO SAVEPOINT` is version- and implementation-specific and
must be measured, not asserted. `psql` is not installed here (same blocker as `money-equation`),
so I am not going to write a patch on a guess.

**Test that would prove it.** On a real Postgres: open a tx, `SAVEPOINT s`, take the advisory
lock, force an error, `ROLLBACK TO SAVEPOINT s`, then query
`pg_locks WHERE locktype = 'advisory'` in the SAME transaction and assert whether the row is
still there. Ten lines, one DB, settles it permanently.

**Risk of acting without it.** HIGH — a "fix" for a lock that is already released would add a
spurious unlock; a missing unlock silently serialises every audit write for that org for the
rest of the caller's transaction.

## W11-P3 — `'CERTIFICATION_CHECKOUT'` literal in four source files (backlog #60)

**Invariant.** The prefix is the join key between the two sweeps and the two writers. If one
spelling drifts, `payment-closure-job` stops finding invoices it must close and
`payment-reminder-job` stops reminding — silently, with no test failing.

Sites on 94ac46ac: `jobs/payment-closure-job.js:64` and `jobs/payment-reminder-job.js:49` (each a
private `CHECKOUT_SERVICE_TYPE_PREFIX`), plus the two **writers**
`services/checkout/checkout-settlement-service.js:210` and
`services/checkout/stripe-checkout-service.js:171` (`` `CERTIFICATION_CHECKOUT_${milestone}` ``).

```diff
+++ b/apps/backend/shared/checkout-service-type.js   (new file)
+'use strict';
+/**
+ * The `Invoice.serviceType` family for Stripe checkout invoices.
+ *
+ * Legacy rows carry the bare prefix; F-CHECKOUT-M2 (2026-08-18) added the
+ * milestone-dimensioned `_M1` / `_M2` forms. Readers MUST prefix-match so both
+ * generations are swept; writers MUST go through checkoutServiceType().
+ */
+const CHECKOUT_SERVICE_TYPE_PREFIX = 'CERTIFICATION_CHECKOUT';
+const checkoutServiceType = (milestone) => `${CHECKOUT_SERVICE_TYPE_PREFIX}_${milestone}`;
+module.exports = { CHECKOUT_SERVICE_TYPE_PREFIX, checkoutServiceType };

--- a/apps/backend/jobs/payment-closure-job.js
-const CHECKOUT_SERVICE_TYPE_PREFIX = 'CERTIFICATION_CHECKOUT';
+const { CHECKOUT_SERVICE_TYPE_PREFIX } = require('../shared/checkout-service-type');

--- a/apps/backend/jobs/payment-reminder-job.js
-const CHECKOUT_SERVICE_TYPE_PREFIX = 'CERTIFICATION_CHECKOUT';
+const { CHECKOUT_SERVICE_TYPE_PREFIX } = require('../shared/checkout-service-type');

--- a/apps/backend/services/checkout/stripe-checkout-service.js
-                        serviceType: `CERTIFICATION_CHECKOUT_${milestone}`,
+                        serviceType: checkoutServiceType(milestone),

--- a/apps/backend/services/checkout/checkout-settlement-service.js
-                serviceType: `CERTIFICATION_CHECKOUT_${milestone}`,
+                serviceType: checkoutServiceType(milestone),
```

**Test that would prove it.** A guard test asserting the literal `'CERTIFICATION_CHECKOUT'`
appears in exactly one non-test source file; plus `checkoutServiceType('M2') === 'CERTIFICATION_CHECKOUT_M2'`
to pin the string byte-for-byte. Existing suites
(`payment-closure-toctou-lock.test.js:156`, `payment-reminder-job.test.js:152`,
`journal-entry-service.test.js:76-78`) already assert the produced strings and must stay green
untouched — that is the no-value-changed proof.

**Risk.** LOW for the two job constants. **MEDIUM for the two writers**: they set a column on an
invoice row, so this is a money write path, and `journal-entry-service.resolveIssuerType` routes
PLATFORM vs DTAM off that exact string. A typo in the helper misroutes an issuer. Suggest
splitting: readers first (Tier B-ish), writers as a separate operator-merged patch.

## W11-P4 — `getPaymentAuditTrail`: two OR branches that cannot match, and a comment wrong twice (backlog #61)

**Invariant.** The payment audit trail is the artifact an auditor reads to reconstruct what an
applicant was charged. Silently dropping the slip-flow and invoice/receipt events from it is an
audit-completeness failure, not a cosmetic one.

**Proof (static, from the single sanctioned writer).** `middleware/audit-logger.js:394` does
`const persistedMetadata = JSON.stringify(maskMetadataPii(metadata));` and writes that at `:421`
and `:447`. So `audit_logs.metadata` (a real `Json?` column, `audit.prisma:36`) holds a jsonb
**string scalar**, not an object — `:219-223` says so outright, and
`workflow-audit-timelines-handler.js` `JSON.parse`s it back. Therefore
`metadata->'applicationId'`, which is what Prisma's `{ path: [...], equals }` compiles to, is
always NULL and the two branches at `audit-trail.js:662-668` can never match. Separately, the
comment at `:651` claims the filter "relies on the GIN index on AuditLog.metadata": that index
(`audit.prisma:61`, default `jsonb_ops`) does not serve `->` path lookups either. Every other
`auditLog.create` in the repo is an ops script (`scripts/grant-platform-admin.js:120`,
`scripts/migrate-account-role.js:123`) writing USER-scope rows, so no PAYMENT/INVOICE row with an
object-shaped metadata exists to rescue the branches.

**I did NOT remove them.** Deleting the branches would delete the only surviving record that
PAYMENT and INVOICE events are *supposed* to be in this trail, and would cement the data loss as
intended behaviour. Two honest options:

```diff
  Option A (minimal, matches the stored form — no schema change)
--- a/apps/backend/services/audit-trail.js
@@ -662,6 +662,6 @@
-                    resourceType: 'PAYMENT',
-                    metadata: { path: ['applicationId'], equals: String(applicationId) },
+                    resourceType: 'PAYMENT',
+                    metadata: { string_contains: `"applicationId":"${applicationId}"` },
                 },
                 {
-                    resourceType: 'INVOICE',
-                    metadata: { path: ['applicationId'], equals: String(applicationId) },
+                    resourceType: 'INVOICE',
+                    metadata: { string_contains: `"applicationId":"${applicationId}"` },
                 },
```

Option B (correct, larger): stop stringifying in `audit-logger.js:394`, store a real object,
backfill `audit_logs.metadata`, keep the hash-stability shim at `:219-223` reading both shapes.
Expand-before-contract, its own migration, Tier C.

Either way, replace the `:651` comment:

```diff
-    // We OR together the three scopes in one prisma call so the rows
-    // come back already merged + sorted by sequenceNumber. The
-    // metadata-path JSON filter relies on the GIN index on
-    // AuditLog.metadata (see schema/audit.prisma).
+    // We OR together the three scopes in one prisma call so the rows come back
+    // already merged + sorted by sequenceNumber.
+    //
+    // metadata is persisted as JSON.stringify(...) by the single sanctioned
+    // writer (middleware/audit-logger.js:394), i.e. a jsonb STRING SCALAR — so
+    // a `->` path filter is always NULL, and the GIN index (audit.prisma:61,
+    // jsonb_ops) does not serve `->` lookups regardless. Match on the stored
+    // textual form, not on a path.
```

**Test that would prove it.** On a real Postgres: log one PAYMENT-scope and one INVOICE-scope
event through `auditLogger` carrying `metadata.applicationId`, then assert
`getPaymentAuditTrail(applicationId).events` contains all three resource types. RED today.

**Risk.** Option A: MEDIUM — `string_contains` cannot use the GIN index, so this becomes a
sequential scan over `audit_logs`; it also matches any row whose metadata mentions that id under
a different key. Needs a supporting index (`resourceType, createdAt` already exists at
`audit.prisma:66`) and a row-count check on the real table first. Option B: HIGH (schema +
backfill + hash-chain adjacency) but correct.

## W11-P5 — RevisionDeadline status vocabulary omits `EXPIRED` (#790, backlog #62)

**Invariant.** The schema comment is the vocabulary of record for anyone reading the model. It
lists `PENDING, SUBMITTED, APPROVED, EXTENDED, FAILED` — no `EXPIRED` — while the cron writes
`EXPIRED` every night.

```diff
--- a/apps/backend/prisma/schema/audit.prisma
@@ -125 +125 @@
-  status        String   @default("PENDING") // PENDING, SUBMITTED, APPROVED, EXTENDED, FAILED
+  status        String   @default("PENDING")
+  // PENDING, SUBMITTED, APPROVED, EXTENDED, EXPIRED, FAILED
+  // EXPIRED is written nightly by jobs/revision-deadline-checker.js:166 when the
+  // 5-working-day window lapses; FAILED by
+  // routes/api/applications/applications-car.js:256,
+  // routes/api/provider/handlers/workflow-revision-expirations-handler.js:117,
+  // routes/api/provider/handlers/workflow-transitions-handler.js:207 and
+  // routes/api/system/cron.js:312. Both are live (#790).
```

**Test that would prove it.** A vocabulary test in the same family as
`eslint-rules/no-legacy-status-vocabulary.js`: collect every `status:` literal written to
`revisionDeadline` across `routes/**` and `jobs/**` and assert the set is a subset of the schema
comment's list. RED today (`EXPIRED` is written, not listed).

**Risk.** LOW as written (comment only). But it touches `prisma/schema/**` → Tier C by path, and
the honest follow-up (promoting this to a real enum) is a migration and must not ride along.

## W11-P6 — `payment-closure-job` claims atomicity it does not have (backlog #57)

**Invariant.** `payment-closure-job.js:274` states "Status write + its audit row are atomic
(writeApplicationStatus runs onAudit inside the tx handle)". The callback at `:367-368` calls
`auditLogger.log({...})`, which opens its **own** connection outside `tx`. If the enclosing
`prisma.$transaction` rolls back, the audit row survives and records a close that never happened.
`logWithin(event, tx)` exists for exactly this (`middleware/audit-logger.js:569`).

```diff
--- a/apps/backend/jobs/payment-closure-job.js
@@ -367,3 +367,3 @@
                             onAudit: async (entry) => {
-                                await auditLogger.log({
+                                await auditLogger.logWithin({
                                     category: AuditCategory.APPLICATION,
@@   (same object literal)   @@
-                                });
+                                }, tx);
```

**Test that would prove it.** Force the enclosing `$transaction` to throw after the status write
and assert no `APPLICATION_PAYMENT_ABANDONED` row exists for that application. Needs a real DB.
A cheaper unit RED: assert the `onAudit` callback calls `logWithin` with the same `tx` object the
transaction handed out.

**Risk.** MEDIUM. `logWithin` takes the per-org advisory lock inside the caller's transaction
(`audit-logger.js:606`), lengthening the lock hold for the whole close transaction — under the
nightly sweep that serialises closes per org. Also interacts with W11-P1: land them together, or
the fence and the tx-routing disagree about which client the emitter uses.

## W11-P7 — `renewalFee` / `expediteFee` are not SSoT-backed and the two ends disagree

Backend `routes/api/finance/pricing.js` `defaultFeesPayload()` serves `renewalFee: 15000`;
frontend `apps/web-app/src/constants/fees.ts:18` declares `GACP_RENEWAL_FEE = 30_000` and
`use-pricing.ts:83` uses it as the offline fallback. Whichever path the user hits decides the
number they see. Neither value exists in `config/business-rules.js` or `config/payment-fees.js`,
so there is no canonical answer to converge on.

**No diff.** This is a product question — which is the real renewal fee — and answering it in
code would MOVE a quoted number (L3). Left as a literal with a comment naming the conflict.
Once decided: add `RENEWAL_PER_SCOPE` / `EXPEDITE_PER_SCOPE` to `FEE_DEFAULTS`
(`config/business-rules.js:34`), export via `modules/billing`, and both ends read it.

**Risk of leaving it.** An applicant quoted 15,000 by the API and 30,000 by the marketing page.
**Risk of "fixing" it blind.** Publishing a fee nobody signed off on.

## W11-P8 — the wizard fabricates a quotation when the API refuses (found this session)

W11-1 makes the backend refuse to invent numbers. The wizard still invents them.
`apps/web-app/src/app/health/applications/new/_steps/steps/invoice-step.tsx:73` destructures
`const { fees, loading } = usePricing()` — `error` is discarded — and `:121,128` call
`generateQuotationItems(fees, …)`, which at `hooks/use-pricing.ts:97` does `fees || DEFAULT_FEES`.
So on a 503 the applicant is shown a complete, plausible quotation built from frontend constants,
with no indication anything failed. This is the same defect class as W11-1, one layer up.

```diff
--- a/apps/web-app/src/hooks/use-pricing.ts
@@
-export function generateQuotationItems(fees: PricingFees | null, includeInspection: boolean = false) {
-    const f = fees || DEFAULT_FEES;
+// W11-P8: no silent substitution. A caller that has no verified fees must
+// render an error state, not a quotation built from frontend constants.
+export function generateQuotationItems(fees: PricingFees, includeInspection: boolean = false) {
+    const f = fees;

--- a/apps/web-app/src/app/health/applications/new/_steps/steps/invoice-step.tsx
@@
-  const { fees, loading } = usePricing();
+  const { fees, loading, error, refetch } = usePricing();
@@
+  if (!loading && (error || !fees)) {
+    return <FeeUnavailableNotice message={error} onRetry={refetch} />;
+  }
```

**Test that would prove it.** Component test: mock `/api/pricing/fees` → 503, render
`StepInvoice`, assert no `฿` amount is rendered and the notice is present. RED today (the
quotation renders with 5,000 / 25,000 from constants).

**Risk.** MEDIUM-HIGH. Blocks the invoice step whenever pricing is unreachable, so an applicant
mid-wizard gets a hard stop instead of a wrong number — that is the intended trade, but it is a
user-visible flow change and per CLAUDE.md §5 a UI/flow change needs a **view-pack**, which I
cannot produce in this session. Also needs a copy review (thai-ui-copy) for the notice.

## W11-P9 — `withholdingTaxApplicable` is hardcoded `false` on every row

`services/audit-trail.js:636,687,690` stamps `withholdingTaxApplicable: false` on the
response and on every event, with a comment pointing at `config/invoice-issuers.js` Tier 9 and
`services/wht-service.js:5-10,501-505` (a stub). For a corporate customer that must withhold, the
API asserts as fact that WHT does not apply.

**No diff.** WHT is a tax-policy decision (`05-BACKLOG.md` §3-28 marks it "product decision
first"), and inventing a withholding rate is precisely the L3 prohibition. Minimum honest change,
if the operator wants one now: rename the field or make it `null` (= "not determined") rather
than `false` (= "determined not to apply") — that is still an API contract change and belongs in
its own patch.

**Risk of leaving it.** A downstream consumer treats "false" as a determination.
**Risk of changing it.** Every current consumer reads a boolean; `null` is falsy but not `false`.
