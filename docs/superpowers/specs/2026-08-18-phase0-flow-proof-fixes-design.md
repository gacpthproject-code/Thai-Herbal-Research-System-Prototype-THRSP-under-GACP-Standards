# Phase 0 Flow-Proof Blocker Fixes — Design Spec

> Source of truth for the bugs: `evidence/phase0/FINDINGS.md` (real-DB Playwright walk, 2026-08-17/18) + `reports/payment-policy/2026-08-18-invoice-family-M2-collision.md` (opus money-flow map). Every root cause below was re-verified in code (file:line) this session, not read from the report.

**Goal:** Repair the five flow-blockers a real-DB press-through found stopping the GACP certification pipeline between "pay installment 2" and "certificate issued," WITHOUT touching money data and WITHOUT bundling the deeper invoice-family reconciliation.

**Why now:** The pipe walks green from register → pay installment 1 → assign auditor → revise → doc-approve → auto-issue installment-2 invoice, then **dies at paying installment 2** — every farmer who paid installment 1 is permanently stuck (no site visit, no certificate). Two more real cracks (a closed revision door on the UI, a lying submit echo) sit on the same path.

## Scope split (by risk + tier)

| # | Finding | Sev | Tier | Merge |
|---|---|---|---|---|
| 1 | CHECKOUT-M2-INVOICE-UNIQUE | 🔴 blocker | C (money) | **operator** |
| 2 | PREVIEW-REVISION-CLOSED | 🔴 blocker | B (FE/route gate) | agent (per §5) |
| 3 | SUBMIT-ECHO-LIES | 🔴 integrity | C (workflow status) | operator |
| 4 | REVIEWER-DROPDOWN-EMPTY | 🟠 | C (identity/role) | operator |
| 5 | REVISION-DOOR-NO-QUOTATION | 🟠 | B/C | with #3 |

## Global Constraints

- **RED-first** for every executable fix — paste the failing test/output before green. Evidence = real run this session (unit/supertest); the live-DB re-walk is the operator's staging step, not claimable in-session.
- **L3 money:** the agent PROPOSES the diff (implements on branch); it never mutates money data and never runs a live charge. **#1, #3, #4 are Tier C → operator merges.**
- **Do NOT bundle the deferred deep items** (Family-A/B reconciliation, orphan-order cleanup, systemic legacy-role data) — they need a real-DB probe + an operator ruling; they are named in §Deferred and stay out of this branch.
- **Money invariants that NO fix may break** (from the money map, verified): (i) journal balance + issuer routing — a checkout serviceType must never contain `STATE_FEE` (or `resolveIssuerType` flips to DTAM and skips the revenue leg — `journal-entry-service.js:183,552`); (ii) exactly one ACTIVE invoice per `(application, milestone)` — never per app forever; (iii) the payment-reminder + abandonment-closure crons must keep matching checkout invoices; (iv) no double-charge, ม.86 receipt correctness preserved.

---

## Fix 1 — CHECKOUT-M2-INVOICE-UNIQUE (🔴 money, Tier C)

**Root (verified):** `services/checkout/stripe-checkout-service.js:165` writes the checkout invoice with a FIXED `serviceType:'CERTIFICATION_CHECKOUT'` (milestone lives only in `invoiceNumber`, `:162`). The partial unique index `uniq_invoice_app_service_active (applicationId, serviceType) WHERE isDeleted=false` (migration `20260701010000`) counts installment-1's still-active invoice, so installment-2's `invoice.create` P2002s. That `invoice.create` (`:160-176`) sits OUTSIDE the P2002→409 try/catch that wraps only `checkoutOrder.create` (`:141-156`) → raw 500. The index was authored to dedup the 4-serviceType `PHASE_x_*` family, not the single-serviceType checkout family.

**Fix (3 parts — all in this task; the money map proved the blast radius):**

1. **Milestone-dimension the write** — `serviceType: \`CERTIFICATION_CHECKOUT_${milestone}\`` at `stripe-checkout-service.js:165`. Distinct `(app, CHECKOUT_M1)` vs `(app, CHECKOUT_M2)` → no collision; the existing index still enforces one-active-per-(app,milestone). No schema/migration change. `_M1`/`_M2` contains no `STATE_FEE` → issuer routing safe (invariant i).
2. **Widen the ONLY two exact-string readers** from Prisma equality to `startsWith:'CERTIFICATION_CHECKOUT'`: `jobs/payment-reminder-job.js:117`, `jobs/payment-closure-job.js:180` (+ update their tests `payment-reminder-job.test.js:149`, `payment-closure-be.test.js:30`). Every other reader is substring/suffix (`journal-entry-service.js:183,200`, `invoice-side.js:60`) and already robust; the accounting dashboard's exact-`in` (`accounting-service.js:266,275`) intentionally ignores checkout invoices. Skipping this widening = reminders + abandonment-closure silently stop matching (invariant iii).
3. **Atomicity — wrap order+invoice(+lines) in one `$transaction`.** Today `checkoutOrder.create` (`:141`) commits BEFORE `invoice.create` (`:160`) throws → an orphan `PENDING_PAYMENT` order with `invoiceId=null`; on retry it reaches settlement with a null invoiceId → `recordPaymentEntry` throws → DEAD_LETTER. Wrapping them removes the orphan class going forward. Keep the P2002→409 translation covering the whole block (so a genuine same-milestone double-submit still returns the readable 409, not a 500).

**Tests (RED-first):** a unit/integration test that a second checkout for the SAME application at a DIFFERENT milestone creates a distinct invoice (no P2002); a test that the two crons still match `CERTIFICATION_CHECKOUT_M1`/`_M2`; a test that a same-(app,milestone) double-create yields 409 not 500; assert order+invoice are atomic (both exist or neither).

**Ruling 1 (family reconciliation OUT of scope):** this task UNBLOCKS the collision only. The `PHASE_x_*` vs `CERTIFICATION_CHECKOUT` divergence (§Deferred a) is NOT touched — do not repoint readers, do not retire a family. The money map explicitly advised against bundling it.

---

## Fix 2 — PREVIEW-REVISION-CLOSED (🔴 FE gate, Tier B)

**Root (verified):** `routes/api/preview/previewable-statuses.js:19-25` `PREVIEWABLE_STATUSES` = `{DRAFT, SUBMITTED, PENDING_DOC_FEE, PHASE_1_SLIP_UNDER_REVIEW, DOC_FEE_PAID}` — missing `REVISION_REQUESTED` and `CAR_PENDING`. But `applications.js EDITABLE_STATUSES` includes both, and the resubmit button lives ONLY on the preview page (`web-app/.../health/applications/preview/client-view.tsx:425-450`). The file comment justifies excluding **terminal** states only — these two are active editable states, so their omission is an oversight, not a decision.

**Fix:** add `'REVISION_REQUESTED'` and `'CAR_PENDING'` to `PREVIEWABLE_STATUSES`. Verify the preview page + the resubmit button actually render for these statuses (the button may have its own status guard — if so, align it). Confirm no preview render path assumes the missing states are absent.

**Test:** a preview-route test that a `REVISION_REQUESTED` / `CAR_PENDING` application is previewable (was 404/blocked, now 200); an FE test (apiClient/spy or component) that the resubmit button renders for these statuses.

---

## Fix 3 — SUBMIT-ECHO-LIES (🔴 workflow integrity, Tier C)

**Root (verified):** `routes/api/applications/applications.js:659-662` — when `currentStatus ∈ {SUBMITTED, PENDING_DOC_FEE}` the endpoint returns a **hardcoded** `status:'PENDING_DOC_FEE'` + `nextRequiredAction:'PAY_PHASE_1'`, writes **no audit row**, and transitions nothing. For an application genuinely stuck at `SUBMITTED` (reached via the revision door, Fix 5), the response LIES (claims `PENDING_DOC_FEE`) and sends the user to a pay screen for a non-payable state; the divergence leaves no audit trace. `RESUBMIT_TARGET` (`:681`) handles DRAFT/REVISION_REQUESTED/CAR_PENDING but not SUBMITTED, so SUBMITTED falls only into the lying early-return.

**Fix direction:** the response must tell the truth and leave a trace.
- Never echo a status the row does not hold — return the REAL `draft.status` (+ the next action that status actually implies).
- If `SUBMITTED` is meant to auto-advance to `PENDING_DOC_FEE`, perform the real transition via the canonical writer with an audit row; if it is not a valid resting state, return an accurate, actionable response (not a fabricated one).

**Ruling 2 (state-machine SSOT):** the implementer resolves "what should happen when an app is `SUBMITTED` and /submit is called again" against `workflow-transition-service.js ALLOWED_TRANSITIONS` (the authority), NOT against the hardcoded echo. Whatever the answer, two things are non-negotiable: (a) the response reflects the actual resulting DB status, (b) any status change writes an audit row. Cost if the transition semantics are misread: caught by the state-machine test + the adversarial review.

**Test:** given an app at `SUBMITTED`, /submit's response `status` equals the DB status after the call, and if the status changed an audit row exists; no response ever returns a status the DB does not hold.

---

## Fix 4 — REVIEWER-DROPDOWN-EMPTY (🟠 identity, Tier C)

**Root (verified):** `provider/handlers/scheduler-assign-reviewer-handler.js` passes `[CANONICAL_ROLES.DOCUMENT_REVIEWER, CANONICAL_ROLES.AUDITOR]` with a comment asserting migration `20260801000000` collapsed all legacy spellings — but the operator's real-DB query found live users still holding legacy uppercase (`REVIEWER_AUDITOR`, `AUDITOR`). `listReviewerCandidates` (`provider-user-service.js:236-252`) filters `role IN (passed set)`, so no legacy row matches → empty dropdown → confirm disabled. `normalizeRole` is applied on write, not on this read.

**Fix (defensive read — machine-enforced, not data-trusting):** the candidate query must match BOTH canonical AND known legacy spellings (extend the role set, or normalize on read), so the dropdown is correct regardless of how clean the role column is. The response already carries `canonicalRole: normalizeRole(r.role)` for the UI, so downstream is unaffected.

**Ruling 3 (data is a separate follow-up):** the legacy-role rows are a DATA symptom (canonicalization did not fully take on the live DB) that likely breaks OTHER role-filtered reads too — but auditing/repairing role DATA across the platform is out of scope here (§Deferred c). This fix makes the dropdown correct now; the systemic data question is flagged, not fixed on this branch.

**Test:** `listReviewerCandidates` returns a user holding a legacy uppercase role (was excluded, now included); the canonicalRole in the response is still normalized.

---

## Fix 5 — REVISION-DOOR-NO-QUOTATION (🟠, folds into Fix 3)

**Root (verified from FINDINGS §F-REVISION-DOOR-NO-QUOTATION):** a DRAFT resubmitted through `PUT /:id/revision` lands at `SUBMITTED` with `quotations = 0` — an off-canonical resting state that is the upstream source of the SUBMITTED apps Fix 3 must stop lying about. Not fully stuck (the Stripe checkout mints its own invoice, so payment isn't hard-blocked), hence 🟠.

**Fix:** the revision door should produce the canonical post-submit state the front-door `/submit` produces (or the state the state machine defines for that transition), not a bare `SUBMITTED`. Resolve alongside Fix 3 using the same `workflow-transition-service` SSOT — the two share the SUBMITTED-limbo root. If closing Fix 3 (never echo a false status + audit) already makes the SUBMITTED-limbo path coherent and payable, Fix 5 may reduce to a test that pins the revision-door target state; record that as a ruling during implementation.

---

## Deferred (flagged, NOT this branch — each needs a real-DB probe + an operator ruling)

- **(a) Family A/B divergence:** checkout-paid apps may read `computePhaseSettlement.phasePaid=false` and the invoice dashboard under-counts vs the GL, because the `PHASE_x_*` pair is minted at DOC_APPROVED but never paid under checkout. Severity hinges on whether any HARD gate blocks on `phasePaid` (the Playwright walk advanced past installment 1, suggesting not a hard block — but unproven) and on `STRIPE_CHECKOUT_ENABLED`. Needs a probe + a ruling on which family is canonical end-to-end.
- **(b) Orphan `PENDING_PAYMENT` CheckoutOrders** (invoiceId=null) already created by the operator's failed installment-2 attempts during the walk — count + reconcile (touches money data → operator / accounting-reconciler). Fix 1c stops NEW orphans; existing ones still need cleanup.
- **(c) Systemic legacy-role data:** the live DB holds non-canonical role values (Fix 4's root). Audit whether other role-filtered reads are affected and whether the DB should be canonicalized. Identity/Tier C.

## Definition of Done

- Fixes 1–5 each RED-first with real test output; ratchet not increased.
- Money invariants (§Global) preserved; #1's diff matches the money map's recommendation.
- Tier C (#1,#3,#4, and the branch as a whole) → operator merges. The live-DB re-walk (the real proof the blockers are cleared) is the operator's staging step, referencing `evidence/phase0/FINDINGS.md`.
- Deferred items recorded, not silently absorbed.
