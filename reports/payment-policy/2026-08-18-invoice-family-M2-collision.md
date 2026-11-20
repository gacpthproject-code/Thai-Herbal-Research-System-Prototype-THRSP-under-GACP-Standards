# Invoice-family M2 collision — money-flow map + fix proposal

Date: 2026-08-18 · Branch: evidence/phase0-flow-proof (code == main) · Mode: READ-ONLY static investigation
Status: PENDING (investigation complete via in-session static reads; no probe run — data-dependent items flagged §6)
Fix decision: BLOCKED(operator: L3 money-path / Tier C — choose option §4 + merge; agent proposes diff only)

Every factual claim below is `file:line` from an in-session Read. Runtime/data-dependent claims are flagged, not asserted.

---

## TL;DR

- **Canonical verdict: SPLIT / half-migrated — neither family is canonical across all consumers.**
  Family B (`CERTIFICATION_CHECKOUT`) is the canonical **settlement + journal + receipt** family for the new
  Stripe checkout rail (it is what gets paid, books the GL, and issues the ม.86 split receipts). Family A
  (`PHASE_x_STATE_FEE` / `PHASE_x_PLATFORM_FEE`) is what almost every **read/advance/dashboard** consumer still
  resolves — and under the checkout rail those Family-A rows are minted but **never marked paid**. The comment
  "replaces the per-phase pair" (`stripe-checkout-service.js:159`) states an intent that the code has **not**
  carried out: the pair is still auto-minted (`workflow-side-effects.js:175`).

- **Exact-string-read blast radius of renaming the write = exactly 2 production readers**, both cron jobs, both
  Prisma equality reads: `payment-reminder-job.js:117` and `payment-closure-job.js:180` (+ their two tests).
  Every other reader of the checkout serviceType is substring/suffix-based and is robust to an `_M1/_M2` suffix.

- **Recommended fix (1 line of intent):** milestone-dimension the checkout invoice `serviceType`
  (`'CERTIFICATION_CHECKOUT'` → `` `CERTIFICATION_CHECKOUT_${milestone}` ``) at the write site
  `stripe-checkout-service.js:165`, and widen the 2 cron filters from equality to
  `startsWith:'CERTIFICATION_CHECKOUT'`. No schema/migration change — the existing partial index already permits
  distinct serviceTypes per app. Do **not** bundle the deeper Family-A/B reconciliation into this unblock.

- **Top 3 invariants the fix must not break:** (1) journal balance / issuer routing — the new name must **not**
  contain the substring `STATE_FEE` or `resolveIssuerType` flips it to DTAM and **skips the whole revenue
  entry** (`journal-entry-service.js:183,552`); (2) one active checkout invoice per **(app, milestone)** — not
  per app forever; (3) the reminder + abandonment-closure crons must keep matching checkout invoices.

---

## §0 The collision mechanism (proven from static read)

The write that collides — fixed serviceType, milestone only in the invoiceNumber:
- `stripe-checkout-service.js:162` `invoiceNumber: \`INV-CO-...-${milestone}\`` (milestone encoded)
- `stripe-checkout-service.js:165` `serviceType: 'CERTIFICATION_CHECKOUT'` (milestone **absent**)

The index that rejects M2:
- `prisma/migrations/20260701010000_uniq_invoice_app_servicetype/migration.sql:87-89` —
  `CREATE UNIQUE INDEX uniq_invoice_app_service_active ON invoices (applicationId, serviceType) WHERE isDeleted = false AND applicationId IS NOT NULL`.
- Predicate is `isDeleted = false` only — a **paid** M1 invoice is still "active" (status `'paid'` is not
  soft-deleted), so it permanently occupies the `(app,'CERTIFICATION_CHECKOUT')` slot.

M2 checkout path (proven sequence, `stripe-checkout-service.js`):
1. `:107` M2 payable from `PENDING_AUDIT_FEE` (`PAYABLE_STATES.M2`, `:41`). Pass.
2. `:121` `checkoutOrder.findFirst(app, 'M2', PENDING_PAYMENT)` → none → else branch `:134`.
3. `:141` `checkoutOrder.create(app, milestone='M2')` → **succeeds** (CheckoutOrder dedup is per (app,milestone);
   M1's order is `SETTLED`). Wrapped in try/catch for P2002 (`:150-156`).
4. `:160-176` `invoice.create(serviceType:'CERTIFICATION_CHECKOUT')` → M1's paid invoice already holds the slot →
   **P2002**. This create is **NOT** inside a try/catch → raw 500 `Unique constraint failed on (applicationId, serviceType)`.
   Matches the reported bug exactly.

Root cause: the migration was written to dedup the **Family-A pair** (see its own header
`migration.sql:1-9`, "duplicate PHASE_1_STATE_FEE / PHASE_1_PLATFORM_FEE"), where 4 distinct serviceTypes give
4 legal rows/app. Family B reuses **one** fixed serviceType for **both** milestones, so the same index that
allows the 4-row pair allows only **one** checkout invoice per app — forever.

Secondary hazard (see §6): steps 3 and 4 are **separate awaits, not one `$transaction`** — the M2 order commits
before the invoice throws, leaving an orphan `PENDING_PAYMENT` order with `invoiceId=null`.

---

## §1 Are BOTH families created for the same application/phase? — YES (per phase)

Creation timeline (submit → DOC_APPROVED → checkout → settlement):

| When | Family A (PHASE_x pair) | Family B (CERTIFICATION_CHECKOUT) |
|---|---|---|
| Wizard submit | `wizard-controller.js:406` `ensurePhaseInvoices(id,'PHASE_1')` → `PHASE_1_STATE_FEE` + `PHASE_1_PLATFORM_FEE` | — |
| Quotation accept | `quotations.js:323` `ensurePhaseInvoices(id,'PHASE_1')` (idempotent w/ above) | — |
| M1 checkout | — | `stripe-checkout-service.js:160-176` one `CERTIFICATION_CHECKOUT` invoice |
| M1 settle (webhook) | untouched (stays `pending`) | invoice→`paid` `checkout-settlement-service.js:166-171`; status→`DOC_FEE_PAID` `:232-244` |
| DOC_APPROVED | `workflow-side-effects.js:175` `ensurePhaseInvoices(id,'PHASE_2')` → `PHASE_2_STATE_FEE` + `PHASE_2_PLATFORM_FEE` | — |
| M2 checkout | — | **collides** (§0) |
| M2 settle (webhook) | untouched (stays `pending`) | invoice→`paid`; status→`AUDIT_FEE_PAID` `:232-244` |

So for **each** phase the DB holds the Family-A pair **and** (once checkout is used) a Family-B invoice for the
same money. The two families are **not reconciled** with each other. Under the checkout rail the Family-A pair is
minted but **never paid** — it is stale `pending` for the life of the application. This is the double-invoicing
surface; whether it becomes a **double-charge** is gated by the workflow (once M-x settles, the app leaves the
payable state), but the design carries two live invoice records for one obligation.

The mint helper confirms Family-A serviceTypes: `application-phase-invoice-methods.js:219`
`serviceType: canonicalServiceType` from `getCanonicalServiceTypeForComponent` → `phase-billing-service.js:44-61`
(`PHASE_1_STATE_FEE`/`PHASE_1_PLATFORM_FEE`/`PHASE_2_STATE_FEE`/`PHASE_2_PLATFORM_FEE`).

---

## §2 Which family does each money-consumer resolve?

| Consumer | Reads serviceType via | Sees CERTIFICATION_CHECKOUT? | Notes |
|---|---|---|---|
| Settlement (`checkout-settlement-service.js`) | order by `checkoutOrderId`/PI `:99-103`, not serviceType | n/a (resolves the **order**) | writes Family-B invoice `paid` `:166-171`; never touches Family A |
| Journal / ERP (`journal-entry-service.recordPaymentEntry`) | `resolveIssuerType(meta.serviceType)` **substring** `:181-201,551` | YES — falls to PLATFORM default `:200` | books Dr Cash / Cr Payable-DTAM / Cr Revenue / Cr VAT with explicit `components` `checkout-settlement:186-209`. Correct. |
| Phase-advance guard (`computePhaseSettlement.phasePaid`) | `getServiceTypesForPhaseComponent` `phase-billing-service.js:137-141` | **NO** — only PHASE_x + legacy | checkout advances status **directly** `checkout-settlement:232-244`, bypassing this guard. Guard sees only the stale `pending` pair. |
| Phase-2 schedule gate | `computePhaseSettlement(...,'PHASE_2')` `phase2-schedule-gate.js:48-50` | **NO** | reads Family A only |
| Applicant billing / preview | `computePhaseSettlement` `preview.js:159-163` | **NO** | Family A only |
| Accounting monthly dashboard | `serviceType:{in:['PHASE_1_STATE_FEE','PHASE_2_STATE_FEE']}` `accounting-service.js:266` and platform `:275` | **NO** — exact `in` | invoice-based revenue dashboard **misses** checkout invoices (GL via journal still correct) |
| FlowAccount export | `getInvoiceIssuer(inv.serviceType)` `accounting-service.js:389` | throws, but **try/caught** `:388-391` | resilient — blank issuer hint, no crash |
| Money-side classifier (SoD) | `classifyInvoiceSide` **suffix** `invoice-side.js:53-64` | YES → PLATFORM side | robust |
| ม.86 / receipt path (checkout) | split docs keyed by `checkoutOrderId` `checkout-settlement:212-229` | n/a | receipt issuance independent of invoice.serviceType |
| Reminder cron | `serviceType:'CERTIFICATION_CHECKOUT'` **exact** `payment-reminder-job.js:117` | YES (exact) | **breaks on rename** — see §3 |
| Closure cron | `serviceType:'CERTIFICATION_CHECKOUT'` **exact** `payment-closure-job.js:180` | YES (exact) | **breaks on rename** — see §3 |

Key asymmetry: the family that **collects the money and books the GL** (B) is invisible to the family that
**guards phase advance and drives the invoice-based revenue dashboard** (A). The GL is correct via the journal
entry; the invoice-aggregate dashboard (`accounting-service.js:260-277`) diverges from the GL under checkout.

---

## §3 Exact-string reads of `'CERTIFICATION_CHECKOUT'` (blast radius of a rename)

Grep of `apps/backend` (production, non-test) for `CERTIFICATION_CHECKOUT`:
- WRITES: `stripe-checkout-service.js:165`, `checkout-settlement-service.js:204` (journal provenance metadata).
- EXACT-EQUALITY READS (break if the write is renamed):
  - `payment-reminder-job.js:47` const + `:117` `where { serviceType: CHECKOUT_SERVICE_TYPE }` — a rename makes
    this match **nothing** → PRE_DUE/DUE_DATE/OVERDUE reminders silently stop for every checkout invoice.
  - `payment-closure-job.js:62` const + `:180` `where { serviceType: CHECKOUT_SERVICE_TYPE }` — same → abandoned
    checkouts are never auto-closed.
- COMMENT ONLY: `jobs/scheduler.js:257`.
- TESTS asserting the literal (update with the fix): `__tests__/integration/payment-closure-be.test.js:30`,
  `__tests__/unit/payment-reminder-job.test.js:149`.

SUBSTRING / SUFFIX readers — **robust** to an `_M1`/`_M2` suffix, no change needed:
- `journal-entry-service.js:183` `.includes('STATE_FEE')`, `:186` `.includes('PLATFORM_FEE')`, default PLATFORM `:200`.
- `invoice-side.js:60` `endsWith('_STATE_FEE') || includes('STATE_FEE')`, else PLATFORM `:63`.
- `getInvoiceIssuer` (`invoice-issuers.js:454-472`) **throws** for any non-PHASE_x serviceType — but is **never
  called on a checkout invoice in the settlement hot path** (`checkout-settlement-service.js` only imports/re-exports
  it `:36,:407`; split docs use hardcoded legal names `:39-40`). Latent throw sites `pdf/invoice-template-service.js:86`
  and `accounting-service.js:389` (the latter try/caught) are **pre-existing and unchanged** by the rename (both the
  old and new names throw there identically).

Verdict on Q3: the ONLY thing that breaks on a milestone-suffix rename is the two crons (2 files + 2 tests). That
is the entire hard blast radius.

---

## §4 Option space + recommendation (proposal for the operator — L3 / Tier C)

**Option A — milestone-dimension the checkout serviceType (RECOMMENDED).**
Write `` `CERTIFICATION_CHECKOUT_${milestone}` `` (`_M1`/`_M2`).
- Unblocks M2: `(app,'CERTIFICATION_CHECKOUT_M1')` and `(app,'CERTIFICATION_CHECKOUT_M2')` are distinct index keys.
- Dedup preserved at the intended grain: one active invoice per **(app, milestone)** — matching the CheckoutOrder
  index grain (`stripe-checkout-service.js:119-123`), not per app forever.
- No schema/migration change (existing partial index already permits distinct serviceTypes).
- Journal/SoD/classify readers robust (substring/suffix). Split-doc receipts unaffected (keyed by order).
- Blast radius = widen 2 cron filters (equality → `startsWith:'CERTIFICATION_CHECKOUT'`, covers legacy + `_M1/_M2`)
  + 2 tests. Optional: mirror the write at `checkout-settlement-service.js:204` (journal provenance) for consistency.
- Naming constraint: MUST NOT contain `STATE_FEE` (else `resolveIssuerType`→DTAM→journal skipped) and MUST NOT end
  `_STATE_FEE` (else `classifyInvoiceSide`→STATE). `_M1`/`_M2` satisfy both.
- Does NOT by itself fix the Family-A/B divergence (§1/§6) — that is a separate operator decision.

**Option B — checkout writes/settles the Family-A pair (retire Family B invoice).**
Reuses the pair already minted at DOC_APPROVED; reconciles the families so `computePhaseSettlement` and the
invoice dashboard finally see paid checkout money. Blast radius HUGE: rewrites the one-invoice checkout model,
settlement (mark both rows paid), amount cross-check, split-doc engine, and both crons. High L3 risk; not minimal.

**Option C — retire Family A (stop DOC_APPROVED auto-mint; migrate all readers to CERTIFICATION_CHECKOUT).**
Blast radius MASSIVE: `computePhaseSettlement`, `phase2-schedule-gate`, dashboards, `payment-slip-service`,
`preview` billing, and the entire legacy slip rail all read PHASE_x. Rejected as an unblock.

**Option D — index on a milestone column.** Invoice has no milestone column; serviceType is the only phase
discriminator, so this collapses into Option A (encode milestone in serviceType). 

**Option E — soft-delete the paid M1 invoice at settlement to free the slot.** Rejected — soft-deleting a
paid/receipt-bearing row is exactly what the migration's SURVIVOR RULE forbids (`migration.sql:27-34`).

**RECOMMENDATION: Option A**, explicitly framed as a proposal the operator merges (Tier C). Pair it with a
separate operator decision on the Family-A/B reconciliation (§6-1). Proposed diffs (NOT applied):

```diff
# apps/backend/services/checkout/stripe-checkout-service.js  (~line 165)
-                serviceType: 'CERTIFICATION_CHECKOUT',
+                // Milestone-dimensioned so M1 and M2 are distinct rows under the
+                // partial unique index uniq_invoice_app_service_active
+                // (applicationId, serviceType). MUST NOT contain 'STATE_FEE'
+                // (resolveIssuerType would flip to DTAM and skip the revenue entry).
+                serviceType: `CERTIFICATION_CHECKOUT_${milestone}`,
```

```diff
# apps/backend/services/checkout/checkout-settlement-service.js  (~line 204)  [consistency; not correctness-critical]
-                serviceType: 'CERTIFICATION_CHECKOUT',
+                serviceType: `CERTIFICATION_CHECKOUT_${milestone}`,
```

```diff
# apps/backend/jobs/payment-reminder-job.js  (const :47 + where :117)
-const CHECKOUT_SERVICE_TYPE = 'CERTIFICATION_CHECKOUT';
+// Prefix covers legacy 'CERTIFICATION_CHECKOUT' + milestone-dimensioned _M1/_M2.
+const CHECKOUT_SERVICE_TYPE_PREFIX = 'CERTIFICATION_CHECKOUT';
@@ where: {
-            serviceType: CHECKOUT_SERVICE_TYPE,
+            serviceType: { startsWith: CHECKOUT_SERVICE_TYPE_PREFIX },
```

```diff
# apps/backend/jobs/payment-closure-job.js  (const :62 + where :180)
-const CHECKOUT_SERVICE_TYPE = 'CERTIFICATION_CHECKOUT';
+const CHECKOUT_SERVICE_TYPE_PREFIX = 'CERTIFICATION_CHECKOUT';
@@ where: {
-            serviceType: CHECKOUT_SERVICE_TYPE,
+            serviceType: { startsWith: CHECKOUT_SERVICE_TYPE_PREFIX },
```

Companion (operator to weigh): also wrap `checkoutOrder.create` + `invoice.create` + `paymentTransaction.create`
(`stripe-checkout-service.js:141-227`) in one `$transaction` so a future invoice-side failure cannot leave the
orphan order of §6-2. This is a robustness upgrade, not required to unblock M2.

---

## §5 Invariants the fix must NOT break

1. **Journal balance + issuer routing.** `recordPaymentEntry` books a balanced entry only when
   `resolveIssuerType(serviceType) !== DTAM` (`journal-entry-service.js:552`). A checkout name containing
   `STATE_FEE` would resolve DTAM (`:183`) and **skip the entire revenue entry** — cash captured, no GL posting.
   `_M1/_M2` keeps the PLATFORM default (`:200`). Explicit `components` (`checkout-settlement:189-193`) keep the
   3-line split (Payable-DTAM / Revenue / Output-VAT) intact.
2. **One active invoice per (app, milestone)** — not per app. The dedup must hold at the milestone grain (the
   CheckoutOrder index already enforces this for orders; the invoice index must mirror it, which suffix-encoding
   achieves without a schema change).
3. **No double-charge.** Guaranteed independently of the invoice index by the CheckoutOrder (app,milestone) dedup
   (`stripe-checkout-service.js:119-123`) + PaymentIntent idempotency key `checkout:{orderId}`
   (`:224,:253`). The fix must not weaken either.
4. **Receipt ม.86 correctness.** The ม.86/4 PLATFORM_TAX_INVOICE + DTAM_DISBURSAL_RECEIPT are keyed by
   `checkoutOrderId` and numbered from per-issuer sequences (`checkout-settlement:137-144,212-229`) — independent
   of invoice.serviceType. Renaming must not touch this path (Option A does not).
5. **Phase-advance guard unchanged.** `computePhaseSettlement` never reads the checkout serviceType
   (`phase-billing-service.js:137-141`); Option A leaves it exactly as-is. (The pre-existing fact that the guard
   sees only the stale `pending` pair is §6-1, out of scope for the unblock.)
6. **BUGFIX-5.1 dedup intent preserved.** The Family-A pair dedup ("one active PHASE_x per app",
   `migration.sql:1-9,86-89`) is untouched — those serviceTypes do not change; the index stays.
7. **Reminder + closure coverage preserved.** The 2 crons must keep matching checkout invoices — the one thing
   Option A actively changes, hence the paired `startsWith` widening (§4).

---

## §6 Flags — cannot prove from static read (do not guess)

1. **Family-A/B reconciliation is a real, separate design gap (data-dependent severity).** Under the checkout
   rail the DOC_APPROVED-minted `PHASE_2_*` pair (and the submit-minted `PHASE_1_*` pair) stay `pending` forever;
   `computePhaseSettlement.phasePaid` and the invoice dashboard (`accounting-service.js:266,275`) will read them
   as unpaid even though money was collected. Whether this currently harms a live application depends on whether
   any hard gate blocks on `phase2Settlement.phasePaid` for a checkout-paid app — I did not trace every gate to a
   terminal block, and it depends on `STRIPE_CHECKOUT_ENABLED` routing. **Needs operator ruling + a real-DB probe**,
   separate from the M2 unblock.
2. **Orphan CheckoutOrder on the failed M2 attempt (mechanism proven, manifestation runtime-dependent).**
   `checkoutOrder.create` (`stripe-checkout-service.js:141`) commits before `invoice.create` throws (`:160`) —
   not one `$transaction`. A retry then hits `findFirst` (`:121`), reuses the orphan order, **skips invoice
   creation** (`:126` branch), and can reach settlement with `order.invoiceId=null` → `recordPaymentEntry(null,…)`
   throws `invoiceId is required` (`journal-entry-service.js:539-540`) → webhook FAILED→DEAD_LETTER. I cannot
   confirm from static read how many such orphan M2 orders already exist in the DB; **needs a DB query** before/
   after any fix (and argues for the §4 transaction companion).
3. **`STRIPE_CHECKOUT_ENABLED` live state unknown.** `stripe-checkout-service.js:22` says routing is gated by it.
   Whether checkout is the live rail in the environment where the bug was hit is a config/runtime fact, not
   statically provable here.
4. **Latent `getInvoiceIssuer` throw for checkout invoices** at `pdf/invoice-template-service.js:86` (not
   try-caught in the read I did) — only reachable if some generic "render invoice PDF" path targets a checkout
   invoice. Pre-existing; unchanged by Option A (old and new names throw identically). Flag for a follow-up.

---

## Appendix — evidence index (file:line)

- Write (collides): `apps/backend/services/checkout/stripe-checkout-service.js:162,165`
- Journal provenance write: `apps/backend/services/checkout/checkout-settlement-service.js:204`
- Index: `apps/backend/prisma/migrations/20260701010000_uniq_invoice_app_servicetype/migration.sql:1-9,27-34,87-89`
- Family-A creators: `wizard-controller.js:406`, `routes/api/applications/quotations.js:323`,
  `routes/api/provider/handlers/workflow-side-effects.js:175`; mint: `application-phase-invoice-methods.js:187-234`
- Family-A serviceType SSOT: `services/phase-billing-service.js:6-11,44-90`
- Phase-advance guard: `services/phase-billing-service.js:135-190`
- Journal issuer resolver (substring): `services/journal-entry-service.js:181-201,551-552,777-778`
- Issuer config (throws on non-PHASE_x): `config/invoice-issuers.js:454-472`
- SoD classifier (suffix): `services/finance/invoice-side.js:53-84`
- Accounting dashboard (exact `in`): `services/accounting-service.js:260-277`; export try/catch: `:388-391`
- Exact-read crons: `jobs/payment-reminder-job.js:47,117`; `jobs/payment-closure-job.js:62,180`
- Checkout settlement (status advance, split docs): `services/checkout/checkout-settlement-service.js:99-103,166-171,186-209,212-229,232-244`
- Vocabulary SSOT (context): `shared/checkout-status.js:21-46`, `shared/dtam-remittance-status.js:24-42`
