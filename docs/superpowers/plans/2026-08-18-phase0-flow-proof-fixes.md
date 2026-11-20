# Phase 0 Flow-Proof Blocker Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Repair the 5 flow-blockers `evidence/phase0/FINDINGS.md` found on the real-DB walk, so the certification pipeline runs past "pay installment 2."

**Architecture:** Four independent fixes on `fix/phase0-flow-proof-blockers` (off main 2239af00). Spec: `docs/superpowers/specs/2026-08-18-phase0-flow-proof-fixes-design.md`. Money map (exact #1 diffs + invariants): `reports/payment-policy/2026-08-18-invoice-family-M2-collision.md`.

**Tech Stack:** Node/Express backend, Prisma (Postgres/Supabase), Next.js web-app, Jest/supertest.

## Global Constraints

- **RED-first** every executable fix — show the failing test before green; evidence = real in-session run. The live-DB re-walk is the operator's staging step (not claimable here).
- **Tier C (Tasks 1, 3, 4) → operator merges.** L3: implement = propose diff; never mutate money data / run a live charge.
- **Money invariants (Task 1) that must hold:** (i) checkout serviceType must NOT contain `STATE_FEE` (or `resolveIssuerType`→DTAM skips the revenue GL leg — `journal-entry-service.js:183,552`); (ii) one ACTIVE invoice per `(application, milestone)`, never per app; (iii) payment-reminder + payment-closure crons keep matching checkout invoices; (iv) no double-charge, ม.86 receipt intact.
- **Do NOT touch the deferred deep items** (Family-A/B reconciliation, orphan-order cleanup, systemic legacy-role data) — spec §Deferred.
- Ratchet must not increase.

---

## Task 1: Fix #1 CHECKOUT-M2-INVOICE-UNIQUE (🔴 money, Tier C)

**Files:**
- Modify: `apps/backend/services/checkout/stripe-checkout-service.js` (~:141-227 the create block, :165 serviceType)
- Modify: `apps/backend/services/checkout/checkout-settlement-service.js:204` (journal provenance — mirror for consistency)
- Modify: `apps/backend/jobs/payment-reminder-job.js` (:47 const, :117 where), `apps/backend/jobs/payment-closure-job.js` (:62 const, :180 where)
- Test: `apps/backend/__tests__/**` (new: milestone-distinct-invoice + cron-prefix-match + atomic-create + same-milestone-409); update `__tests__/integration/payment-closure-be.test.js:30`, `__tests__/unit/payment-reminder-job.test.js:149`

**Interfaces:**
- Produces: checkout invoices with `serviceType = \`CERTIFICATION_CHECKOUT_${milestone}\`` (e.g. `_M1`,`_M2`). Consumers that read the checkout serviceType by prefix/substring are unaffected; the two crons switch to `startsWith`.

- [ ] **Step 1: RED — a second checkout at a different milestone must not P2002.** Write a test: seed an application with an ACTIVE `CERTIFICATION_CHECKOUT_M1` invoice; call the checkout path for milestone M2; assert a distinct invoice row is created (no unique-constraint error, no 500). Run → FAIL (today it P2002s → 500).

- [ ] **Step 2: Milestone-dimension the write** — `stripe-checkout-service.js:165`:
```js
// Milestone-dimensioned so M1 and M2 are distinct rows under the partial
// unique index uniq_invoice_app_service_active (applicationId, serviceType).
// MUST NOT contain 'STATE_FEE' (resolveIssuerType would flip to DTAM and skip
// the revenue entry). _M1/_M2 keep the PLATFORM default.
serviceType: `CERTIFICATION_CHECKOUT_${milestone}`,
```
Mirror at `checkout-settlement-service.js:204` (same replacement — journal provenance consistency).

- [ ] **Step 3: Widen the two cron readers** (equality → prefix). In BOTH `payment-reminder-job.js` and `payment-closure-job.js`:
```js
// Prefix covers legacy 'CERTIFICATION_CHECKOUT' + milestone-dimensioned _M1/_M2.
const CHECKOUT_SERVICE_TYPE_PREFIX = 'CERTIFICATION_CHECKOUT';
// ...in the where clause:
serviceType: { startsWith: CHECKOUT_SERVICE_TYPE_PREFIX },
```
Update the two literal-asserting tests to the prefix behavior (assert both a legacy `CERTIFICATION_CHECKOUT` and a `CERTIFICATION_CHECKOUT_M2` invoice are matched).

- [ ] **Step 4: Atomicity — wrap order+invoice(+lines)+charge in one `$transaction`** (`stripe-checkout-service.js` ~:141-227). Today `checkoutOrder.create` commits before `invoice.create` can throw → orphan `PENDING_PAYMENT` order (invoiceId=null) → retry hits settlement with null invoiceId → DEAD_LETTER. Wrap the create sequence so a failure leaves neither. Keep the P2002→409 translation covering the whole block (a genuine same-`(app,milestone)` double-submit still returns the readable 409, never a 500). Write a test: force the invoice step to throw → assert NO orphan checkoutOrder remains (both exist or neither).

- [ ] **Step 5: GREEN + invariant checks.** All new tests pass. Add/confirm: a same-`(app,milestone)` double-create returns 409 (not 500); the new serviceType contains no `STATE_FEE` (issuer routing unchanged — a test asserting `resolveIssuerType('CERTIFICATION_CHECKOUT_M2')` is the PLATFORM path). Run the checkout/settlement/journal test suites — journal still balances.

- [ ] **Step 6: Commit** (Tier C — operator merges later):
```bash
git add apps/backend/services/checkout/ apps/backend/jobs/payment-reminder-job.js apps/backend/jobs/payment-closure-job.js apps/backend/__tests__/
git commit -m "fix(checkout): milestone-dimension checkout invoice serviceType — unblock installment-2 payment (F-CHECKOUT-M2)"
```

---

## Task 2: Fix #2 PREVIEW-REVISION-CLOSED (🔴 FE gate, Tier B)

**Files:**
- Modify: `apps/backend/routes/api/preview/previewable-statuses.js:19-25`
- Verify/Modify: `apps/web-app/src/app/health/applications/preview/client-view.tsx:425-450` (resubmit button status guard)
- Test: preview-route test + FE resubmit-button test

**Interfaces:**
- Produces: `REVISION_REQUESTED` and `CAR_PENDING` applications become previewable → the resubmit button (preview-page-only) renders.

- [ ] **Step 1: RED** — a preview-route test: a `REVISION_REQUESTED` application requests preview → today blocked ("Application is not in previewable state"). Assert it SHOULD be previewable. Run → FAIL.

- [ ] **Step 2: Add the two active editable states** to `previewable-statuses.js`:
```js
const PREVIEWABLE_STATUSES = Object.freeze(new Set([
    'DRAFT',
    'SUBMITTED',
    'PENDING_DOC_FEE',
    'PHASE_1_SLIP_UNDER_REVIEW',
    'DOC_FEE_PAID',
    'REVISION_REQUESTED',
    'CAR_PENDING',
]));
```
Update the file comment: these are active editable states (mirror `EDITABLE_STATUSES`), distinct from the deliberately-excluded terminal states.

- [ ] **Step 3: Verify the FE resubmit button renders** for these statuses (`preview/client-view.tsx:425-450`). If the button has its own status allow-list, add `REVISION_REQUESTED`/`CAR_PENDING`. Add an FE test (component/apiClient spy) that the resubmit button renders for a `REVISION_REQUESTED` application.

- [ ] **Step 4: GREEN + Commit:**
```bash
git add apps/backend/routes/api/preview/previewable-statuses.js apps/web-app/src/app/health/applications/preview/ apps/backend/__tests__/ apps/web-app/**/__tests__/
git commit -m "fix(preview): allow REVISION_REQUESTED/CAR_PENDING to preview so the resubmit door reopens (F-PREVIEW-REVISION-CLOSED)"
```

---

## Task 3: Fix #3 SUBMIT-ECHO-LIES + Fix #5 REVISION-DOOR-NO-QUOTATION (🔴 workflow integrity, Tier C)

**Files:**
- Modify: `apps/backend/routes/api/applications/applications.js:659-662` (the lying early-return) + the revision door (`PUT /:id/revision` handler — locate it)
- Consult (SSOT, do not fight it): `apps/backend/services/workflow-transition-service.js` `ALLOWED_TRANSITIONS`
- Test: submit-echo-truth test + revision-door target-state test

**Interfaces:**
- Produces: `/submit` never returns a status the DB does not hold; any status change writes an audit row; the revision door produces a canonical state, not bare `SUBMITTED`.

- [ ] **Step 1: Investigate the SSOT first (Ruling 2).** Read `workflow-transition-service.js ALLOWED_TRANSITIONS`: is `SUBMITTED` a valid resting state? Is `SUBMITTED → PENDING_DOC_FEE` a defined edge? What state does a DRAFT resubmit belong in? Record the finding in the report before writing code — it decides Steps 3-4.

- [ ] **Step 2: RED — the echo must not lie.** Test: an application at `SUBMITTED`; call `/submit`; assert the response `status` EQUALS the DB status after the call (today it returns hardcoded `PENDING_DOC_FEE` while DB stays `SUBMITTED`). And assert: if the status changed, an audit row was written (today: 0 rows). Run → FAIL.

- [ ] **Step 3: Fix the echo** (`applications.js:659-662`). Per the SSOT finding:
  - Never echo a hardcoded status. Return the REAL resulting status + the `nextRequiredAction` that status actually implies.
  - If `SUBMITTED` should advance to `PENDING_DOC_FEE`, perform the real transition through the canonical writer (`writeApplicationStatus`/the transition service) with an audit row; if `SUBMITTED` is not a valid resting state, return an accurate actionable response (not fabricated).

- [ ] **Step 4: Fix #5 — the revision door target.** Locate `PUT /:id/revision`; make a DRAFT resubmit land in the canonical post-submit state (the state `/submit`'s DRAFT path produces, or the SSOT's defined target) rather than bare `SUBMITTED`. **Ruling:** if Step 3 already makes any residual `SUBMITTED` coherent + honest + payable, Fix 5 reduces to a test pinning the revision-door target state — record that decision. Do NOT invent a new state.

- [ ] **Step 5: GREEN + Commit:**
```bash
git add apps/backend/routes/api/applications/ apps/backend/__tests__/
git commit -m "fix(submit): /submit returns the real status + audits it; revision door lands canonical (F-SUBMIT-ECHO-LIES, F-REVISION-DOOR)"
```

---

## Task 4: Fix #4 REVIEWER-DROPDOWN-EMPTY (🟠 identity, Tier C)

**Files:**
- Modify: the reviewer-candidate read so it matches legacy + canonical roles — `apps/backend/routes/api/provider/handlers/scheduler-assign-reviewer-handler.js` (the passed role set) and/or `apps/backend/services/provider-user-service.js:236-252` (`listReviewerCandidates`)
- Test: `listReviewerCandidates` includes a legacy-uppercase-role user

**Interfaces:**
- Produces: the scheduler reviewer dropdown lists users regardless of whether their `role` column is canonical or legacy.

- [ ] **Step 1: Confirm the legacy spellings** that exist. Read `normalizeRole` / the canonical-RBAC map to enumerate the legacy spellings that collapse to `document_reviewer` / `auditor` (e.g. `REVIEWER_AUDITOR`, `AUDITOR`, `DOCUMENT_REVIEWER`, mixed case). Use that mapping as the source — do not hardcode a guessed list.

- [ ] **Step 2: RED** — a test: seed a provider user with a legacy uppercase reviewer role; call `listReviewerCandidates`; assert the user is returned. Run → FAIL (today the canonical-only filter excludes it).

- [ ] **Step 3: Defensive read.** Make the candidate query match BOTH canonical AND legacy spellings (expand the role set from the `normalizeRole` inverse map, or normalize on read). The response already returns `canonicalRole: normalizeRole(r.role)` — downstream unaffected. Do NOT mutate the role DATA (Ruling 3: the systemic legacy-role data is a deferred follow-up).

- [ ] **Step 4: GREEN + Commit:**
```bash
git add apps/backend/routes/api/provider/ apps/backend/services/provider-user-service.js apps/backend/__tests__/
git commit -m "fix(scheduler): reviewer dropdown matches legacy + canonical roles (F-REVIEWER-DROPDOWN-EMPTY)"
```

---

## Self-Review

- **Spec coverage:** #1→Task1, #2→Task2, #3+#5→Task3, #4→Task4. All 5 findings mapped. Deferred items excluded (spec §Deferred). ✓
- **Type/name consistency:** serviceType `CERTIFICATION_CHECKOUT_${milestone}` used identically in write (Task1 Step2) + cron prefix (Step3) + issuer-routing invariant (Step5). ✓
- **Placeholder scan:** #1/#2/#4 carry exact code; #3's transition target is intentionally SSOT-resolved (Ruling 2) not guessed — the test pins truth-not-lie + audit regardless of the transition answer. ✓
- **Tier/merge:** Tasks 1,3,4 Tier C (operator merges); Task 2 Tier B. Branch as a whole → operator merges (money+identity). ✓
