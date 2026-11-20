## M2 — a renewal paid through the card rail was charged the phase-2 price — 2026-08-23

Status: DONE(probe:jest __tests__/unit/checkout-renewal-price.test.js)

### What I established before fixing (the report the task asked for first)

**A renewal does reach this rail, and M2 is the only milestone it can arrive with.**

- `services/renewal-service.js:232` — `RENEWAL_ENTRY_STATE = 'PENDING_AUDIT_FEE'`; the renewal
  application is created directly in that state (`createPayload.status`, line 364). It never walks
  DRAFT/SUBMITTED/PENDING_DOC_FEE (`RENEWAL_SKIPPED_STATES`, lines 239-246).
- `services/checkout/stripe-checkout-service.js:41` — `PAYABLE_STATES.M2` contains
  `PENDING_AUDIT_FEE`; `PAYABLE_STATES.M1` (line 40) does not. So a renewal offered M1 is refused
  409 `CHECKOUT_MILESTONE_NOT_PAYABLE`, and M2 is the only milestone that gets through.
- `routes/api/finance/payments.js:409-434` — `POST /api/payments/checkout` is the single caller of
  `createCheckoutForApplication` (grep across `apps/backend`: the only non-test callers are that
  route and the service itself). It takes `milestone` from the body, defaulting to `'M1'`.
- So today the renewal either 409s (no `?milestone`, since the FE link
  `apps/web-app/src/app/health/payments/client-view.tsx:354` omits it) or, with `?milestone=M2`,
  mints an order at the phase-2 price. Both outcomes are wrong; the second is the money bug.

**There is no second rail that prices a renewal correctly, and no third milestone to add.**

- `services/quotation-service.js:262-300` already prices renewals right — `_isRenewal` reads
  `formData.renewalOf` and calls `calculateRenewalFee` — and it deliberately books the single charge
  into the **PHASE_2 slot** (comment at lines 240-257) so that
  `services/checkout/checkout-settlement-service.js:47-48` (`M1 → DOC_FEE_PAID`,
  `M2 → AUDIT_FEE_PAID`) keeps working with no settlement change.
- That decides the fix: **a renewal-aware breakdown, not a third milestone.** A new milestone would
  have to be taught to settlement, and settlement is out of scope. What was wrong here was only the
  price, not the slot.
- `modules/billing/internal/fee-service.js:250-256` — `calculateRenewalFee` already exists and goes
  through the same `buildPhaseFee` as the phase fees; exported via `modules/billing/index.js:36`.
  The checkout service simply never called it.

**Has a renewal ever actually been billed?** NOT ESTABLISHED. I could not read the live database:
the command that would have shown me the configured `DATABASE_URL` was denied by the permission
classifier, and I did not work around it. So I cannot claim either that this has cost real money or
that it has not. **A human should query Supabase read-only for**
`checkout_orders` rows whose `application.formData->>'renewalOf'` is not null — any such row with
`total_payable_amount = 29425 × scopes` was underbilled by 5,885 per scope. Under the house rule
"existing rows keep their numbers", those rows are not to be recomputed; they are an operator
decision.

### Root cause

`breakdownForMilestone` had exactly two prices and no way to express a third:

```js
const fees = feeService.calculateApplicationFees(feeContext);
const phase = milestone === 'M1' ? fees.phase1 : fees.phase2;
```

`fees.phase2` is the 25,000-per-scope audit instalment of a *new* application. A renewal is a single
30,000-per-scope charge. Grossed up identically (state + 10% platform + 7% VAT on the whole service
fee) that is 29,425 charged where 35,310 is owed — **5,885 short per cultivation scope**, and the
invoice, the three line items and the PaymentIntent all inherited the same wrong number, so nothing
downstream could have caught it.

### The fix

`services/checkout/stripe-checkout-service.js`

- `:44-61` — `RENEWAL_MILESTONE = 'M2'` with the reasoning above written down next to it.
- `:88-93` — `isRenewal(application)` reads `formData.renewalOf`, the same marker
  `renewal-service.js:334` writes and `quotation-service.js:263` reads. One marker, three readers,
  no new field.
- `:95-115` — a renewal takes `feeService.calculateRenewalFee(feeContext)`; everything else takes
  the unchanged `calculateApplicationFees` phase pair. The fee context is built exactly as before,
  so scope resolution is identical on both branches — only the rate differs.
- `:106-109` — a renewal offered anything other than M2 is refused 409
  `CHECKOUT_RENEWAL_SINGLE_CHARGE`. Defence in depth: `PAYABLE_STATES.M1` already refuses it today,
  but if that list is ever widened a renewal must still never be charged a 5,885 "first instalment"
  it does not have.
- `:117-128` — **the sum guard is untouched and still runs on the renewal path.** It compares
  `dtamFeeAmount + platformFeeNet + platformFeeVat` against `phase.phaseTotal`, and `phase` is now
  whichever of the two the branch picked. Because `calculateRenewalFee` returns the same
  `buildPhaseFee` shape, the guard holds by construction — and the new test asserts the sum on the
  created row as well, so the guard cannot be silently defeated.

Nothing else changed. Settlement, the webhook, the invoice shape, the line-item codes, the
`PHASE_2` stamp on the payment transaction (`:269`) and every non-renewal price are byte-identical.

### RED (before the fix)

`npx jest __tests__/unit/checkout-renewal-price.test.js`

```
● one scope: the renewal checkout charges 35,310, not the phase-2 29,425
    - Expected  - 5      + Received  + 5
    -   "dtamFeeAmount": 30000,       +   "dtamFeeAmount": 25000,
    -   "platformFeeGross": 5310,     +   "platformFeeGross": 4425,
    -   "platformFeeNet": 3000,       +   "platformFeeNet": 2500,
    -   "platformFeeVat": 2310,       +   "platformFeeVat": 1925,
    -   "totalPayableAmount": 35310,  +   "totalPayableAmount": 29425,
● two and three scopes: 70,620 and 105,930
    Expected: 70620   Received: 58850
● a renewal is never billed a phase-1 instalment, even if a payable state let it through
    Received promise resolved instead of rejected
    Resolved to value: {"breakdown": {... "totalPayableAmount": 5885}, "milestone": "M1"}

Tests: 3 failed, 1 passed, 4 total
```

The one that passed is the regression guard — a non-renewal M2 was 29,425 before and after.

### GREEN (after the fix)

```
PASS __tests__/unit/checkout-renewal-price.test.js
  √ one scope: the renewal checkout charges 35,310, not the phase-2 29,425 (49 ms)
  √ two and three scopes: 70,620 and 105,930 (27 ms)
  √ a NON-renewal M2 is untouched: still 29,425 at one scope (14 ms)
  √ a renewal is never billed a phase-1 instalment, even if a payable state let it through (4 ms)
Tests: 4 passed, 4 total
```

Neighbouring suites over the same file, unchanged and green:

```
npx jest stripe-checkout-engine money-equation-property payment-limiter-covers-checkout \
         single-issuer-end-to-end-figures
Test Suites: 4 passed, 4 total     Tests: 48 passed, 48 total
```

`npx eslint services/checkout/stripe-checkout-service.js __tests__/unit/checkout-renewal-price.test.js`
→ exit 0, no output.

### Figures that did not move

5,885 / 29,425 new-application phase 1 and phase 2 per scope: asserted before and after by
`checkout-renewal-price.test.js` ("a NON-renewal M2 is untouched") and by the 48 passing tests in
the four neighbouring suites, which include the single-issuer end-to-end figures.
35,310 / 70,620 / 105,930 renewal per 1 / 2 / 3 scopes: now produced by this rail, matching what
`quotation-service` already quoted.

### Outside my assignment — reported, not touched

1. **The same defect on three other rails.** Every other consumer of the fee model still prices a
   renewal as a new application, because they all call `calculateApplicationFees` and read
   `.phase2`, with no `renewalOf` branch:
   - `services/application-service/application-phase-invoice-methods.js:375` (the phase-invoice
     mint / `ensurePhaseInvoices` path the slip rail uses),
   - `services/payment-service-phase-flow.js:107`,
   - `services/pdf/invoice-template-service.js:992-995` (the printed invoice).
   A renewal at PENDING_AUDIT_FEE can also pay by **slip**, and that path goes through the first of
   these. So M2 closes the card rail only; the slip rail and the printed invoice still under-bill a
   renewal by 5,885 per scope. This needs its own authorised item.
2. **A stale figure in a fee-service comment.** `modules/billing/internal/fee-service.js:245` says a
   renewal's payable is "33,210 / 66,420 / 99,630". The code one line below produces
   35,310 / 70,620 / 105,930, which is what the operator confirmed. The comment is wrong, the code is
   right. Comment-only, in a file I do not own — left alone.
3. **A line-item description that the W14 single-issuer model made false.** `DTAM_FEE` is described
   as "ยกเว้นภาษีมูลค่าเพิ่ม ม.77/1(10)" (`stripe-checkout-service.js:224`) while VAT is now charged
   on the whole service fee including that line. It predates this fix and affects new applications
   identically, so changing it is not part of pricing a renewal — but it is a false statement on a
   tax document and should be scheduled.
4. **The FE cannot reach an M2 checkout at all.** The only checkout link
   (`apps/web-app/src/app/health/payments/client-view.tsx:354`) omits `?milestone`, so the route
   defaults to M1 and a renewal gets a 409. Fixing the price does not make the renewal payable from
   the UI; that is a web-app change I do not own.

Files changed:
- `apps/backend/services/checkout/stripe-checkout-service.js`
- `apps/backend/__tests__/unit/checkout-renewal-price.test.js` (new)

No git command was run. No live-database write was made.
