# CODE TRACE — QUOTATION lifecycle × payment rails (F-G4-64)

Repo: `c:/Users/charo/Documents/GitHub/GACP-Certification-Application`
Branch at trace time: `fix/review-step-shared-dedupe-lens`
Method: read-only (`sed`/`grep` only). No git mutation, no `--apply`, no DB write, no `.env` read, `apps/backend/keys` untouched.
Every claim below carries a `file:line`. Anything I could not verify is marked **UNVERIFIED**.

---

## 0. HEADLINE

**On the CHECKOUT rail the quotation is decorative.** The Stripe checkout service never
reads a `Quotation` row, never calls `getFrozenPhaseFees`, and has no acceptance gate. It
recomputes the price live — and it resolves the scope count from a *different source* than
the quotation did. Three independent divergence channels are open (§5). The one gate that
does exist (`QUOTATION_NOT_ACCEPTED`) lives only on the SLIP rail (§2), and the one
consumer that honours the frozen price (`ensurePhaseInvoices`) is switched **off** by the
same env flag that turns checkout **on** (§3.4).

---

## 1. THE QUOTATION ITSELF

### 1.1 Storage

`Quotation` model: `apps/backend/prisma/schema/billing.prisma:721` → table `quotations`
(`billing.prisma:809`).

Money columns are `Decimal(15,2)` (`billing.prisma:741-743`): `subtotal`, `vat`,
`totalAmount`. Per-phase split lives in `installments Json?` (`billing.prisma:751`).
Lifecycle column (`billing.prisma:754`):

```prisma
status String @default("DRAFT") // DRAFT | SENT | ACCEPTED | REJECTED | EXPIRED | INVOICED
```

**There is no Prisma `enum QUOTATION_STATUS`** — I grepped every `.prisma` under
`apps/backend/prisma/` and the only hit for the model was `billing.prisma:721`; the enum
grep returned nothing. The creating migration confirms the column is bare TEXT with **no
CHECK constraint** — `prisma/migrations/20260516010000_add_journal_quotation_receipt_seq_bank_accounts/migration.sql:120`:

```sql
"status" TEXT NOT NULL DEFAULT 'DRAFT',
```

(only an index on it, `:142-143`; the migration contains no `CHECK` clause at all). The
vocabulary is therefore enforced **only in JS**:

`apps/backend/services/quotation-service.js:88-96`
```js
const QUOTATION_STATUS = Object.freeze({
    DRAFT: 'DRAFT', SENT: 'SENT', PENDING: 'PENDING', ACCEPTED: 'ACCEPTED',
    REJECTED: 'REJECTED', EXPIRED: 'EXPIRED', INVOICED: 'INVOICED',
});
```

Note the drift: the JS set has **7** values, the schema comment lists **6** — `PENDING` is
in the code but absent from the schema comment (`billing.prisma:754`). `PENDING` is the
value actually written at issue time (`quotation-service.js:559`), so the schema comment is
the stale one.

Uniqueness/idempotency support: `@@index([applicationId, issuerType])`
(`billing.prisma:803`), `quotationNumber String @unique` (`billing.prisma:737`).

### 1.2 Issuance — WHERE and WHEN

**Two doors, both on first submit only, both fire-and-forget.**

| Door | Call site | Guard |
|---|---|---|
| `POST /api/applications/submit` | `apps/backend/routes/api/applications/applications.js:1211` | `if (isInitialSubmit)` — `applications.js:1210`; `isInitialSubmit = currentStatus === 'DRAFT'` (`applications.js:1001`) |
| `submitRevision` service door | `apps/backend/services/application-service/application-review-revision-methods.js:317` | `if (isDraftSubmit)` — `:316`; `isDraftSubmit = app.status === 'DRAFT'` (`:123`) |

Route mount: `applications.js:845` (`router.post('/submit', authenticateHealth, requireConsent, …)`).

Both are `.catch()`-swallowed and only `logger.warn` on failure
(`applications.js:1214-1219`, `application-review-revision-methods.js:320-326`). **A
quotation failing to issue does not fail the submit.** REVISION_REQUESTED / CAR_PENDING
resubmits deliberately skip issuance — "quotations are issued exactly once per application
lifecycle" (`application-review-revision-methods.js:314-315`).

### 1.3 What one issuance writes

`issueQuotationsForApplication` — `quotation-service.js:456`.

1. Load application, selecting `formData`, `cultivationScopeCount`, `totalAreaTypes`,
   `organizationId` (`:464-479`).
2. Idempotency probe: any non-deleted row for the application → return existing,
   **untouched, never repriced** (`:495-520`). Under W14 one row suffices; pre-W14
   applications legitimately hold a DTAM+PLATFORM pair and are returned under their own
   keys (`:505-513`).
3. Fee math: `const fees = _resolveBillableFees(application);` (`:528`).
4. **ONE row** created (`:550-566`):

```js
subtotal:    fees.serviceFeeTotal,                    // :555
vat:         fees.vatTotal,                           // :556
totalAmount: fees.serviceFeeTotal + fees.vatTotal,    // :557
installments: installments.company,                   // :558
status:      QUOTATION_STATUS.PENDING,                // :559
```

`issuerType` is always `PLATFORM` (`:552`) because "PLATFORM already IS the company"
(`quotation-service.js:19-22`). `validUntil` = issue + 30 days (`:116`, `:531-533`).

### 1.4 The status transition table — who can flip what

| From | To | Function | Who |
|---|---|---|---|
| — | `PENDING` | `issueQuotationsForApplication` `:559` | SYSTEM, on first submit |
| `DRAFT`/`PENDING`/`SENT` | `ACCEPTED` | `markQuotationAccepted` `:648` | **applicant only** |
| `ACCEPTED` | `INVOICED` | `markQuotationInvoiced` `:699` | **no production caller — see below** |

`markQuotationAccepted` acceptable-set: `quotation-service.js:664-668`. Already-`ACCEPTED`
is an idempotent no-op returning the row (`:672`); anything else throws
`INVALID_QUOTATION_STATUS` (`:676`), which the route maps to **HTTP 409**
(`routes/api/applications/quotations.js:343-348`).

`markQuotationInvoiced` refuses any source but `ACCEPTED` (`:715-720`); `INVOICED` is an
idempotent no-op (`:714`).

**`REJECTED` and `EXPIRED` are dead values.** They exist in `QUOTATION_STATUS` (`:93-94`)
and in the schema comment (`billing.prisma:754`), and the columns `rejectedAt`
(`billing.prisma:757`) and `validUntil` (`billing.prisma:755`) exist — but I found **no
code path that writes either status**, and **no expiry job**: grep for
`QUOTATION_STATUS.REJECTED` / `QUOTATION_STATUS.EXPIRED` across `apps/` returned only the
definition at `quotation-service.js:93-94`. A quotation past `validUntil` stays `PENDING`
forever and remains acceptable (`isAcceptable` — `QuotationReviewSection.tsx:104-106`).

### 1.5 markInvoiced callers

**Production callers: none.** The full grep for `markQuotationInvoiced` across `apps/` and
`scripts/` returned exactly three sites, all tests:
- `apps/backend/__tests__/integration/quotation-accept-to-phase1-gate-flow.test.js:176`
- `apps/backend/__tests__/unit/quotation-service.test.js:354`, `:377`, `:387`

The docstring names the intended caller as "the invoice-generation path (Tier 19)"
(`quotation-service.js:693-694`) — that wiring does not exist. So in production a quotation
terminates at `ACCEPTED`; `INVOICED` is reachable only from tests. This matters for §2:
the slip gate accepts `INVOICED` as a pass state (`payment-slip-service.js:434`), a branch
that production can never reach.

### 1.6 The accept route

`POST /api/applications/:applicationId/quotations/:issuerType/accept` —
`routes/api/applications/quotations.js:280`.

- `authenticateHealth` (`:280`) — **applicant-only by middleware.** Provider roles cannot
  accept on the applicant's behalf; stated as deliberate at `quotations.js:274-278`.
- Ownership gate `isApplicantOwnerOfApplication` (`:292`, defined `:70-91`) — matches
  `application.healthId` against the caller's identity; non-owner gets **404 not 403**
  (`:294`) to avoid leaking existence.
- `issuerType` must be `DTAM` or `PLATFORM` (`:283-289`), else 400.
- Flip: `markQuotationAccepted(row.id, { acceptedBy: req.user?.id })` (`:303`).
- **Side effect**: `applicationService.ensurePhaseInvoices(applicationId, 'PHASE_1')`
  (`:331`), best-effort, failure logged not thrown (`:332-339`). Under the checkout rail
  this is a **no-op** — see §3.4.

Sibling routes: `GET /` list (`:113`) and `GET /:issuerType/pdf` (`:190`), both
`authenticateAny` with role-side filtering via `resolveAllowedIssuerSides` (`:56-63`):
`account_dtam` → DTAM only, `account_platform` → PLATFORM only, everyone else → both.

### 1.7 `getFrozenPhaseFees` — what it does, who consumes it

Definition: `quotation-service.js:414`. Pure half: `_reconstructFrozenFromInstallments`
(`:367`).

It reads the **stored** `installments` JSON and adds up `stateAmount + platformAmount +
vatAmount` per phase (`:392-397`). It **never touches the fee service and has no access to
the rates** — which is precisely what makes a quotation a price of record: a formula change
physically cannot reach a row already written
(`__tests__/unit/single-issuer-frozen-quotation.test.js:19-26`).

Returns `null` (→ caller recomputes) when: no quotation (`:421-423`), or installments are
legacy/un-enriched, i.e. missing any of the four numeric split fields (`:376-383`), or no
`PHASE_2` entry (`:398`). A renewal carries only `PHASE_2`; the absent `PHASE_1` is reported
as explicit zeros with `singleCharge: true` (`:399-406`).

Source row preference: `const source = dtam || platform;` (`:417`) — prefers DTAM.

**Consumers (2 production, both on the slip rail):**

| Consumer | file:line | Behaviour |
|---|---|---|
| Phase-invoice mint | `services/application-service/application-phase-invoice-methods.js:451` | Frozen wins over recompute; divergence logged `[QUOTE_PRICE_DRIFT] … honoring the frozen quote` (`:463-469`) |
| Phase-1 payment init | `services/payment-service-phase-flow.js:46` (`resolveLockedPhaseTotals`, `:33`) | Same: frozen wins, drift logged (`:57-64`) |

Wiring: `services/application-service.js:14,42` and `services/payment-service.js:152,164`.
`createPhase1Payment` is routed at `routes/api/finance/payments.js:219` and `:309`.

**Non-consumers that recompute live instead** — the quotation's own surfaces:
- Quotation PDF: `services/pdf/invoice-template-service.js:1021` calls
  `calculateApplicationFees(...)` at render time. The stored row contributes **only the
  number**: `{ quotationNumber: row.quotationNumber }` (`quotations.js:244`).
- Quotation list API line items: `quotations.js:163`.
- **Stripe checkout: nothing.** See §3.

---

## 2. THE SLIP RAIL — `QUOTATION_NOT_ACCEPTED`

### 2.1 Exact condition

`services/payment-slip-service.js:448` `assertQuotationAcceptedForPhase1Slip({ applicationId, phase, serviceType })`.

Sequence:

1. `if (phase !== 'PHASE_1') { return; }` (`:449`) — **PHASE_2 is never gated.**
2. `const side = classifyInvoiceSide(serviceType)` (`:451`; defined `:217`, delegating to
   `services/finance/invoice-side.js:53`). `null` → gate skipped with a warn (`:452-459`).
3. Lookup `findQuotationsByApplicationId` (`:467`), then row selection (`:478`):
   ```js
   quotation = (side !== 'PLATFORM' && dtam) ? dtam : (platform || dtam);
   ```
   The fallback to `platform` is load-bearing: under W14 `dtam` is `null` for every newly
   quoted application, so the pre-W14 form `side === 'PLATFORM' ? platform : dtam` would
   have made a STATE-side slip find nothing and fall through the fail-open below —
   *weakening* the gate (`:470-477`).
4. Lookup throw → re-thrown **as the gate error**, never a 500, never an open gate
   (`:480-486`).
5. **Legacy fail-open**: `if (!quotation) { warn; return; }` (`:489-495`).
6. **The condition** (`:497`):
   ```js
   if (!QUOTATION_ACCEPTED_STATES.includes(String(quotation.status || '').toUpperCase())) { throw … }
   ```
   with `QUOTATION_ACCEPTED_STATES = Object.freeze(['ACCEPTED', 'INVOICED'])` (`:434`).

So it **fires** iff: phase is `PHASE_1` **AND** serviceType classifies **AND** a
non-deleted quotation row exists **AND** its status is not `ACCEPTED`/`INVOICED`. In
practice that means status `PENDING` (the issue-time value, `quotation-service.js:559`).

### 2.2 Where it is called, and what it protects

Single call site: `payment-slip-service.js:623`, inside `recordApplicationSlipUpload`,
**after** the invoice fetch (`:601`) and **before** the `$transaction` that creates the slip
(`:635`). Service layer on purpose — "so no route can bypass it" (`:612-613`).

Route mapping: `routes/api/finance/payment-slips.js:517` → **HTTP 409**.
Error-code registry: `shared/error-codes.js:2138-2139`.
FE message mapping: `apps/web-app/src/app/health/payments/slip-upload-modal.tsx:89`.

**What it protects:** the "farmer authorises the bill before money moves" semantic — no
Phase-1 slip may be uploaded against an invoice whose quotation the farmer has not pressed
ยอมรับ on. It is a *disclosure* gate, sibling to the payment-terms gate immediately after it
(`assertPaymentTermsAcceptedForSlip`, `:630`, defined `:512`).

**What it does NOT protect:**
- PHASE_2 payments (explicit `return` at `:449`).
- Applications with no quotation row — deliberate legacy fail-open (`:489`).
- **Anything on the checkout rail.** This function is called from exactly one place, and
  that place is the slip upload path. Grep for `quotation` across
  `apps/backend/services/checkout/` returns only two *comment* lines
  (`stripe-checkout-service.js:54-55`) and no code.

---

## 3. THE CHECKOUT RAIL

### 3.1 Session creation — price source

`services/checkout/stripe-checkout-service.js:154` `createCheckoutForApplication({ applicationId, milestone, actor })`.

**Does it read the quotation at all? No.** Verified by grep over the whole directory:
- `grep -rn -i "quotation" apps/backend/services/checkout/` → 2 hits, both prose comments at
  `stripe-checkout-service.js:54-55`.
- `grep -rn -i "frozen|getFrozen" apps/backend/services/checkout/` → **NONE**.

Price source is a **live recomputation**, `breakdownForMilestone` (`:117`):

```js
117 function breakdownForMilestone(application, milestone) {
118     const feeContext = {
119         ...(typeof application.formData === 'object' && application.formData ? application.formData : {}),
120         // Inert: nothing in modules/billing reads this key off the payload — a
121         // stored scope count only takes effect through `options.scopeCount`.
125         cultivationScopeCount: storedCultivationScopeCount(application),
126     };
...
137         phase = feeService.calculateRenewalFee(feeContext);          // renewal
139         const fees = feeService.calculateApplicationFees(feeContext); // new application
140         phase = milestone === 'M1' ? fees.phase1 : fees.phase2;
```

`feeService` is a re-export shim onto `modules/billing`
(`services/fee-service.js:20` → `module.exports = require('../modules/billing')`), so this
is the same calculator the quotation used — **but called with different arguments.** See §5.

Internal consistency check: `totalPayableAmount !== phase.phaseTotal` throws
`CHECKOUT_BREAKDOWN_DRIFT` 500 (`:147-151`). This checks the calculator against itself, not
against the quotation.

### 3.2 Gates on session creation

| Gate | file:line | Effect |
|---|---|---|
| Milestone in `['M1','M2']` | `:155-157` | 400 `CHECKOUT_INVALID_MILESTONE` |
| Ownership folded into lookup | `:161-172` | 404 `APPLICATION_NOT_FOUND` (never 403) |
| Status payable | `:173-176` | 409 `CHECKOUT_MILESTONE_NOT_PAYABLE` |
| Gateway configured | `:180-183` | fail-fast before any row is minted |
| Renewal ⇒ M2 only | `:133-136` | 409 `CHECKOUT_RENEWAL_SINGLE_CHARGE` |
| Env flag | `routes/api/finance/payments.js:410-417` | 503 `STRIPE_CHECKOUT_DISABLED` |

Payable states (`:40-43`):
```js
M1: ['DRAFT', 'SUBMITTED', 'PENDING_DOC_FEE'],
M2: ['DOC_APPROVED', 'PENDING_AUDIT_FEE'],
```

**No quotation gate of any kind.** `DRAFT` and `SUBMITTED` are M1-payable — and a `DRAFT`
application has no quotation at all, since issuance fires on the DRAFT→submitted hop
(`applications.js:1001,1210`). So an applicant can be charged on M1 **before any quotation
row exists**, let alone is accepted.

### 3.3 What session creation writes

One `$transaction` (`:213-311`) minting four rows:
- `checkoutOrder` (`:214`) — status `PENDING_PAYMENT`, breakdown columns.
- `invoice` (`:233`) — `serviceType: CERTIFICATION_CHECKOUT_{M1|M2}` (`:240`, built by
  `checkoutInvoiceServiceType` `:77`), `subtotal: dtamFeeAmount + platformFeeNet` (`:241`),
  `vat: platformFeeVat` (`:242`), `totalAmount: totalPayableAmount` (`:243`), `status: 'pending'`.
- 3 × `invoiceLineItem` (`:246-291`) — `DTAM_FEE` (non-taxable), `PLATFORM_FEE` (taxable),
  `PLATFORM_VAT`.
- `paymentTransaction` (`:293`) — `idempotencyKey: checkout:{orderId}` (`:301`).

`P2002` anywhere in the block → 409 `CHECKOUT_ALREADY_IN_PROGRESS` (`:313-318`).

Then the gateway session (`:325`), `paymentMethodTypes: ['promptpay']` only (`:329-331`),
`idempotencyKey: checkout:{order.id}` (`:339`).

### 3.4 Settlement — `checkout-settlement-service.js`

`settleFromPaymentIntent({ paymentIntent, eventId })` — `:126`.

**Does it touch quotations? No.** The `quotation` grep over the directory (§3.1) covers this
file: zero hits. It never reads, never flips `ACCEPTED → INVOICED`, never validates against
the quoted total.

Pre-flight: order lookup (`:129`), `alreadySettled` short-circuit (`:145`), and an amount
cross-check **against the order's own `totalPayableAmount`**, not against the quotation
(`:149-157`) — mismatch returns `AMOUNT_MISMATCH` and settles nothing.

Inside one `$transaction` (`:181-313`), after a `SELECT … FOR UPDATE` re-check (`:185-188`):

1. **CheckoutOrder** → `status:'SETTLED'`, `settledAt`, `dtamRemittanceStatus:'PENDING'` (`:192-200`).
2. **Invoice** (`:226-238`): `status:'paid'`, `paidAt`, `paymentMethod:'STRIPE'`, and the
   **receipt columns** — `receiptNumber` (the single `TAX-PRD` number allocated at `:172`),
   `receiptStatus:'ISSUED'`, `receiptIssuedAt`, `receiptIssuedBy:'stripe-webhook'`.
   `status` deliberately stays the raw `'paid'`, not `'RECEIPT_ISSUED'`, because credit-note,
   debit-note, refund and WHT services all test `status !== 'paid'` (`:212-224`).
3. **PaymentTransaction** → `SUCCESS` + `gatewayRef` + `paidAt` (`:240-249`).
4. **Journal entry** `recordPaymentEntry` with `sourceType:'CHECKOUT_SETTLEMENT'`,
   `sourceId: order.id` (`:252-284`).
5. **CheckoutDocument** — one `PLATFORM_TAX_INVOICE` row (`:286-294`).
6. **Application status** via `writeApplicationStatus`, actor `stripe-webhook` / `SYSTEM`
   (`:297-310`), target from `SETTLED_TARGET_STATE` (`:53-56`): `M1 → DOC_FEE_PAID`,
   `M2 → AUDIT_FEE_PAID`.

All timestamps share one `settledAt` instant (`:176`).

**The switch that decouples the rails.** `ensurePhaseInvoices` — the accept route's side
effect (`quotations.js:331`) and the *only* production consumer of `getFrozenPhaseFees` on
the mint path — returns early when the checkout rail is on:

`application-phase-invoice-methods.js:406-423`
```js
if (splitInvoicingRetired()) { … return { phase, skipped: 'CHECKOUT_RAIL', … }; }
```
`splitInvoicingRetired` resolves to `phase-billing-service.js:210-212`:
```js
function isPhaseSplitInvoicingRetired() { return isStripeCheckoutEnabled(); }
```

So **the same env flag that enables checkout disables the frozen-price honouring code**
(`:440-470`) — the `return` at `:415` is *before* any fee computation or the
`getFrozenPhaseFees` call at `:451`.

### 3.5 Routes

- `POST /api/payments/checkout` — `routes/api/finance/payments.js:409`, `authenticateHealth`.
  Body `{ applicationId, milestone }`; milestone defaults to `'M1'` (`:432`). Flag check
  first (`:410-417`), then `resolveHealthId` (`:420`), UUID validation (`:426`), then
  `createCheckoutForApplication` (`:429`). Audit events `CHECKOUT_INTENT_CREATED` (`:437`) /
  `CHECKOUT_INTENT_FAILED` (`:444`).
- Webhook → settlement: `routes/api/webhooks/stripe.js:56` imports `settleEvent`,
  `handleStripeEvent`.

---

## 4. THE WEB SURFACE

### 4.1 `QuotationReviewSection.tsx` (381 lines)

`apps/web-app/src/components/payments/QuotationReviewSection.tsx`.

Rendered from the payments page at `app/health/payments/client-view.tsx:449`, with
`applicationId={appFilter || activeApplicationId}` (`:450`) — i.e. it prefers the `?app=`
deep-link target — and `onAccepted={() => void loadPayments()}` (`:451`).

Three render states:
- **Hidden** when both sides are null and not loading (`:317`) — pre-submit applicants see
  nothing.
- **Loading** skeleton with the text "กำลังโหลดใบเสนอราคา" (`:326-341`). F-G4-55: the old
  loading header instructed the farmer to accept a quotation on a CERTIFIED application over
  two empty grey boxes (`:319-324`).
- **Loaded**: `h2` "ใบเสนอราคา (Quotation)" (`:353`) plus, **only when
  `somethingToAccept`** (`:348`), the instruction "กรุณาตรวจสอบรายละเอียดค่าบริการ แล้ว
  **ยอมรับใบเสนอราคา** ก่อนชำระเงินงวดที่ 1" (`:356`).

Per-card controls (`QuotationCard`, `:145`):
- Two PDF buttons, phase 1 and phase 2 (`:233-247`).
- **`ยอมรับใบเสนอราคา`** button, rendered only when `isAcceptable(status)` (`:249-261`),
  where `isAcceptable = status === 'PENDING' || 'SENT' || 'DRAFT'` (`:104-106`). Calls
  `PaymentService.acceptQuotation(applicationId, issuerType)` (`:165`), then `onAccepted?.()`
  (`:171`) which re-fetches and bubbles up (`:309-314`).

Status pill at `:87-101`.

**Note the FE still assumes two cards** — `dtam` and `platform` rendered separately
(`:361-378`), header comment "Two quotations per application" (`:11`). Under W14 `dtam` is
always null for new applications (`quotation-service.js:566`), so exactly one card renders.
No bug; stale copy.

### 4.2 The checkout entry — `?app=`

`app/health/payments/client-view.tsx:388-405`. Render condition (`:388`):

```js
isCheckoutUiEnabled() && !loading && activeApplicationId && pendingAmount > 0
```

- `isCheckoutUiEnabled()` — `NEXT_PUBLIC_CHECKOUT_UI_ENABLED === 'true'`, fail-closed
  (`:355-358`, import `:16`).
- `pendingAmount > 0` is the **F-G4-49** fix (`:360-367`): unpaid AND not cancelled AND
  application-scoped (`:269-271`, `:262-265`). Before it, a CERTIFIED application with every
  invoice settled kept showing "ชำระเงินออนไลน์" next to ฿0
  (`evidence/g4-rebuild-2026-08-25/c02/C02-01`, cited at `:363-364`; I did not open that
  image — **UNVERIFIED**).
- Flag OFF + money owed → an amber `role="status"` notice instead of silence, UX-9
  (`:379-386`).

The link (`:400`):
```js
href={`/health/payments/checkout?app=${encodeURIComponent(activeApplicationId)}`}
```

`activeApplicationId` = `appFilter` (the page's own `?app=`) else the first payment row with
an applicationId (`:249-253`).

**The entry gates on debt, not on the quotation.** `pendingAmount` is derived purely from
invoice rows (`:269-271`); nothing in the condition at `:388` reads quotation status.

### 4.3 The checkout page

`app/health/payments/checkout/client-view.tsx`. Reads `?app` (`:123`), `?milestone`
(`:124`), `?mockScenario` (`:125`) and passes them through verbatim — "No trimming, no
normalization, no validation — the backend owns all of that. The only decision made here is
the presence check on `app`" (`:120-122`). Calls `createCheckout` (`:137`).

Grep for `quotation|ACCEPTED` across `app/health/payments/checkout/*.tsx` → **no hits.**
The checkout page never mentions the quotation.

### 4.4 What the applicant can press, before and after paying — checkout rail

| Moment | Quotation panel | Checkout entry |
|---|---|---|
| DRAFT (pre-submit) | hidden (`:317`) — no row exists | **visible if any unpaid invoice exists**; M1 is payable from `DRAFT` (`stripe-checkout-service.js:41`) |
| Submitted, `PENDING` | card + `ยอมรับใบเสนอราคา` (`:249`) | visible — **nothing requires the accept first** |
| After accept, `ACCEPTED` | card, no accept button, no instruction (`:348`) | visible while `pendingAmount > 0` |
| After settlement | card persists; `ensurePhaseInvoices` was a no-op so status stays `ACCEPTED` (§1.5) | hidden — `pendingAmount` is 0 |

The applicant can press **ชำระเงินออนไลน์ → pay → settle** without ever pressing
**ยอมรับใบเสนอราคา**. Nothing in §3.2 or §4.2 prevents it.

---

## 5. CAN THE TWO NUMBERS DIVERGE? — YES, THREE WAYS

### 5.1 The two formulas side by side

Both terminate in the same `buildPhaseFee`
(`apps/backend/modules/billing/internal/fee-service.js:121`):

```
stateAmount      = ratePerScope × scopeCount                    fee-service.js:143
platformAmount   = Math.round(stateAmount × PLATFORM_RATE)      fee-service.js:144
serviceFeeAmount = stateAmount + platformAmount                 fee-service.js:145
vatAmount        = Math.round(serviceFeeAmount × VAT_RATE)      fee-service.js:146
phaseTotal       = serviceFeeAmount + vatAmount                 fee-service.js:147
```

Rates: `PHASE1_PER_SCOPE: 5000` (`config/business-rules.js:46`), `PHASE2_PER_SCOPE: 25000`
(`:48`), `RENEWAL_PER_SCOPE: 30000` (`:83`); `PLATFORM_RATE` / `VAT_RATE` read at
`fee-service.js:50-51` from the same `FEES` object.

**The divergence is not in the arithmetic — it is in `scopeCount`.**
`resolveCultivationScopeCount` (`fee-service.js:105-118`) reads **only `options.scopeCount`**;
if absent it counts `collectUniqueCultivationMethods(formData)` (`:113`), else `1` (`:117`).

| | QUOTATION | CHECKOUT |
|---|---|---|
| Entry | `_resolveBillableFees` `quotation-service.js:272` | `breakdownForMilestone` `stripe-checkout-service.js:117` |
| New application | `calculateApplicationFees(application.formData \|\| {}, { scopeCount: storedCultivationScopeCount(application) ?? 1 })` — **`quotation-service.js:298-299`** | `calculateApplicationFees(feeContext)` — **`stripe-checkout-service.js:139`**, `feeContext` built `:118-126` |
| Renewal | `calculateRenewalFee(application.formData \|\| {}, { scopeCount })` — `quotation-service.js:279`, `scopeCount` from `:277` | `calculateRenewalFee(feeContext)` — `stripe-checkout-service.js:137` |
| **`options.scopeCount` passed?** | **YES** — the stored column | **NO — second argument omitted entirely** |
| Effective scope source | `Application.cultivationScopeCount` (fallback `totalAreaTypes`) — `shared/application-scope.js:31` | `collectUniqueCultivationMethods(formData).length`, else `1` — `fee-service.js:113,117` |
| Frozen price consulted? | writes it (`:555-558`) | **never** (§3.1) |

The `cultivationScopeCount` key that checkout puts into `feeContext`
(`stripe-checkout-service.js:125`) is **inert** — the code says so in its own comment
(`:120-124`): "nothing in modules/billing reads this key off the payload." Confirmed against
`resolveCultivationScopeCount` (`fee-service.js:105-118`), which reads `options.scopeCount`
and `payload.cultivationMethods`, never `payload.cultivationScopeCount`.

This is a **known, documented, unfixed** finding: `reports/sku/design-event.md:413-419`
records it as "scopeCount ยุบเป็น 1 เงียบ ๆ บนราง Stripe + preview" — checkout and preview
both build a fee context without `options.scopeCount` while the resolver reads only that.
Left unfixed deliberately: changing it changes what applicants are charged, which is L3
money-mutation territory (`stripe-checkout-service.js:122-124`).

The same inert-key pattern appears at `payment-service-phase-flow.js:104-110` and
`application-phase-invoice-methods.js:429-433` — but those two **do** pass
`options.scopeCount` on the real call (`application-phase-invoice-methods.js:434`,
`{ scopeCount }`), so only the checkout rail actually loses the count.

### 5.2 Divergence channel A — scope-source mismatch (live today, no edit required)

The two rails disagree **at the same instant, on an unchanged application**, whenever
`storedCultivationScopeCount(application) !== collectUniqueCultivationMethods(formData).length`.

Concretely: an application whose `cultivationScopeCount` column is `3` but whose
`formData.cultivationMethods` is absent or collapses to fewer distinct normalized values
(`fee-service.js:200-243` — the collector falls back to `plots[].solarSystem ||
cultivationMethod || locationType`, then to `locationType || areaType`, then returns `[]`).
Quotation bills 3 scopes; checkout bills 1. At W14 rates that is 105,930 quoted vs 35,310
charged — **UNVERIFIED as a live DB occurrence** (I did not query the database; I am
describing the code paths, not a counted row).

Note the direction: this is a *shortfall*, and it is silent — no drift log fires, because
the drift loggers (`[QUOTE_PRICE_DRIFT]`) live in the two slip-rail consumers
(`application-phase-invoice-methods.js:463`, `payment-service-phase-flow.js:57`), and on the
checkout rail the first of those is short-circuited at `:415` and the second is a different
entry point.

### 5.3 Divergence channel B — scope count changes between submit and pay

`Application.cultivationScopeCount` is rewritten on the draft/submission path —
`application-draft-query-methods.js:72` and `application-submission-methods.js:156`, both
`cultivationScopeCount: fees.scopeCount`. A REVISION_REQUESTED resubmit can replace `plots`
wholesale via `applyClientFormData` (`application-review-revision-methods.js:~296`, and see
the F-PLOT-AREAUTNIT note at `:180-191`).

Meanwhile the quotation is issued **once** and is never reissued or repriced: the
idempotency probe returns the existing row untouched (`quotation-service.js:495-520`), and
the resubmit legs skip issuance entirely (`applications.js:1210`,
`application-review-revision-methods.js:316`).

So: quote at 1 scope → applicant revises to 3 scopes → the quotation still says 1 scope,
checkout charges what the *current* formData collapses to. On the slip rail this is caught
and the frozen price wins with a `[QUOTE_PRICE_DRIFT]` warn
(`application-phase-invoice-methods.js:459-469`). **On the checkout rail there is no
comparison and no log.**

### 5.4 Divergence channel C — fee table changes between submit and pay

`business-rules.js:112` `loadFeesFromSystemConfig(prisma)` overlays `fee.*` rows from
`SystemConfig` onto `FEES` at startup. The `where` clause is `key: { startsWith: 'fee.' }`
(`:115-117`) and the key map is `:120-135`. There is **no effective-date column and no
`orderBy` on time** — the only ordering is a legacy-key tiebreak so
`fee.renewal_per_cert` loses to `fee.renewal_per_scope` (`:139-144`); the last matching
row simply overwrites `FEES[feeKey]` (`:145-151`). I confirmed the silent catch directly:

`business-rules.js:152-154`
```js
} catch (_err) {
    // SystemConfig table may not exist yet — use defaults silently
}
```
This matches the report at `reports/sku/design-event.md:445-447` ("ค่าล่าสุดชนะทุก request").

Effect: change a rate, and
- the stored `Quotation` row keeps its numbers (`quotation-service.js:555-557`),
- `getFrozenPhaseFees` keeps returning the old numbers (`:392-397`) — **but only two
  slip-rail consumers ask it**,
- the quotation **PDF** re-renders at the *new* rate (`invoice-template-service.js:1021`),
- the quotation **list API** re-renders line items at the new rate (`quotations.js:163`),
- **checkout charges the new rate** (`stripe-checkout-service.js:139`).

So after a rate change the farmer's own quotation document shows one number, the DB row
holds another, and the card charge is a third. `single-issuer-frozen-quotation.test.js`
pins that the *reader* cannot reprice — it does not pin that the *documents* read it.

### 5.5 Renewal

Renewal is handled correctly on both sides now, and the fix is recent. `renewal-service.js`
creates the application at `PENDING_AUDIT_FEE`, an M2-payable state
(`stripe-checkout-service.js:42`), so M2 is the only milestone a renewal can reach
(`:44-57`). `breakdownForMilestone` branches on `isRenewal` (`:128`) and throws
`CHECKOUT_RENEWAL_SINGLE_CHARGE` for M1 (`:133-136`). Before that fix it priced M2 from
`fees.phase2` — 29,425 instead of 35,310, **short by 5,885 per scope**
(`:129-132`; `checkout-renewal-price.test.js:13-16`).

Residual: the renewal path is subject to the **same** §5.2 scope loss —
`calculateRenewalFee(feeContext)` at `:137` also omits `options.scopeCount`, while
`quotation-service.js:279` passes it.

---

## 6. TESTS THAT PIN ANY OF THIS

**Backend — quotation core**
- `apps/backend/__tests__/unit/quotation-service.test.js` — issuance, idempotency, accept,
  invoiced, `getFrozenPhaseFees` (`:451`)
- `apps/backend/__tests__/unit/single-issuer-quotation-row.test.js`
- `apps/backend/__tests__/unit/single-issuer-frozen-quotation.test.js` — frozen reader
  cannot reprice
- `apps/backend/__tests__/unit/single-issuer-end-to-end-figures.test.js`
- `apps/backend/__tests__/unit/renewal-single-charge-billing.test.js`
- `apps/backend/__tests__/unit/quotation-line-items.test.js`
- `apps/backend/__tests__/unit/quotation-pdf-per-type.test.js`
- `apps/backend/__tests__/unit/invoice-template-single-issuer.test.js`
- `apps/backend/__tests__/unit/retired-vat-formula-never-documented.test.js`

**Backend — the slip gate**
- `apps/backend/__tests__/unit/quotation-gate-phase1-slip.test.js` — PENDING → 409, and
  `:114` "surfaces a lookup failure as QUOTATION_NOT_ACCEPTED (never silently opens)"
- `apps/backend/__tests__/integration/quotation-accept-to-phase1-gate-flow.test.js`
- `apps/backend/__tests__/unit/payment-terms-gate-slip.test.js`
- `apps/backend/__tests__/unit/payment-slip-stage-a2-uploadedby.test.js`
- `apps/backend/__tests__/unit/payment-slip-transferred-at.test.js`

**Backend — checkout rail**
- `apps/backend/__tests__/unit/stripe-checkout-engine.test.js`
- `apps/backend/__tests__/unit/checkout-renewal-price.test.js`
- `apps/backend/__tests__/unit/checkout-vat-line-names-its-base.test.js`
- `apps/backend/__tests__/unit/checkout-vocabulary.test.js`
- `apps/backend/__tests__/unit/checkout-schedule-service.test.js`
- `apps/backend/__tests__/unit/preview-checkout-summary.test.js`
- `apps/backend/__tests__/unit/phase-split-invoices-retired-under-checkout.test.js`
- `apps/backend/__tests__/unit/settle-event.test.js`
- `apps/backend/__tests__/unit/settlement-binds-receipt-number-to-invoice.test.js`
- `apps/backend/__tests__/unit/settlement-reconcile.test.js`
- `apps/backend/__tests__/unit/stripe-webhook-dedup.test.js`
- `apps/backend/__tests__/unit/bind-checkout-receipts-script.test.js`
- `apps/backend/__tests__/unit/payment-adapter.test.js`

**Backend — fee math / frozen price consumers**
- `apps/backend/__tests__/unit/money-equation-property.test.js`
- `apps/backend/__tests__/unit/phase-fee-breakdown.test.js`
- `apps/backend/__tests__/unit/phase-invoice-vat-split.test.js`
- `apps/backend/__tests__/unit/phase-amount-canonical-writers.test.js`
- `apps/backend/__tests__/integration/phase-amount-canonical.test.js`
- `apps/backend/__tests__/integration/phase-invoice-dedupe.test.js`
- `apps/backend/__tests__/unit/renewal-fast-path.test.js`
- `apps/backend/__tests__/unit/pricing-two-money-flow.test.js`
- `apps/backend/__tests__/unit/decimal-parity.test.js`
- `apps/backend/__tests__/unit/journal-entry-service.test.js`
- `apps/backend/__tests__/unit/customer-statement-service.test.js`
- `apps/backend/__tests__/unit/payment-closure-paid-guard.test.js`
- `apps/backend/__tests__/unit/payment-closure-toctou-lock.test.js`

**Backend — submit doors that mock quotation issuance**
- `a0-pr2-submit-hops-audit-emission.test.js`, `applications-route-rbac.test.js`,
  `applications-submit-canonical-validation.test.js`,
  `application-review-revision-methods.test.js`,
  `application-review-revision-farm-areaunit.test.js`,
  `application-review-revision-plot-areaunit.test.js`, `m2a-doc-requirements-doors.test.js`,
  `m2a-revision-formdata-ownership.test.js`, `draft-document-*.test.js` (×3)

**Web**
- `apps/web-app/src/components/payments/__tests__/quotation-review-section.test.tsx`
- `apps/web-app/src/app/health/payments/__tests__/payments-checkout-entry-needs-debt.test.tsx`
- `apps/web-app/src/app/health/payments/__tests__/payments-checkout-entry-flag.test.tsx`
- `apps/web-app/src/app/health/payments/__tests__/payments-checkout-flag-off-notice.test.tsx`
- `apps/web-app/src/app/health/payments/__tests__/payments-checkout-rows-are-phases.test.tsx`
- `apps/web-app/src/app/health/payments/__tests__/payment-terms-consent-gate.test.tsx`
- `apps/web-app/src/app/health/payments/__tests__/detail-modal-shows-receipt.test.tsx`
- `apps/web-app/src/app/health/payments/__tests__/phase-card-shows-receipt.test.tsx`
- `apps/web-app/src/app/health/payments/__tests__/payments-cancelled-rows.test.tsx`
- `apps/web-app/src/app/health/payments/checkout/__tests__/checkout-states.test.tsx`
- `apps/web-app/src/app/health/payments/checkout/__tests__/checkout-page-flag-guard.test.tsx`
- `apps/web-app/src/lib/services/__tests__/checkout-service.test.ts`
- `apps/web-app/src/__tests__/renewal-fee-display.test.tsx`,
  `renewal-endpoint-contract.test.ts`

**E2E** — `e2e-phase0/s01-register-submit.spec.ts`, `s03-resubmit-approve.spec.ts`,
`s07-seams.spec.ts` (`:598` names the issuance seam), `helpers.ts`;
`e2e-g4/a01-register-and-wizard.spec.ts`

### 6.1 The coverage gap

**No test pins the quotation total against the checkout charge through their real code
paths.** The nearest candidate, `single-issuer-end-to-end-figures.test.js`, asserts the
"settlement" stage like this (`:142-155`):

```js
const single = feeService.calculateRenewalFee({}, { scopeCount });   // :147
```

It hand-feeds `options.scopeCount` — the argument the real `breakdownForMilestone` omits
(`stripe-checkout-service.js:137`). The quotation stage next to it goes through the genuine
path, `quotationService._internals.resolveBillableFees(newApplication(scopeCount))` (`:85`,
`:95`), where the fixture sets `totalAreaTypes: scopeCount` (`:52`, `:64`). So the suite
compares *the fee service against itself* at the checkout stage, and the scope-source
mismatch of §5.2 is invisible to it. Its own header concedes the boundary: the real Prisma
writes "need a live Postgres … A real-DB proof is a separate, DB-gated run" (`:17-21`).

`checkout-renewal-price.test.js` likewise drives scope through
`formData.cultivationMethods` (`:63`, `:80`) — the source checkout *does* read — so it too
cannot see the stored-column divergence.

---

## 7. THAI LAW

The code cites, in comments: **ป.รัษฎากร (Revenue Code) ม.86/4** (full-form tax invoice —
`quotation-service.js:54` and `:442`, `billing.prisma:44`), **ม.77/1(10)** (state revenue
VAT-exempt — `quotation-service.js:55`, `:305`, `:440`; `stripe-checkout-service.js:255`),
**ม.86** (formal quotation is not a tax document but must reconcile — `billing.prisma:703`;
one document = one seller — `invoice-template-service.js:1008`,
`QuotationReviewSection.tsx:11`), **ม.86/10** (ใบลดหนี้ / credit note —
`billing.prisma:807`, `:815`), **ม.87/3** (7-year retention — `billing.prisma:820`,
`:958`), **§82** (single canonical bank account for VAT receipts — `billing.prisma:802`),
**ม.82/3 / ม.82/4** (input-VAT credit — `billing.prisma:1112`, `:1115`), plus
**กฎกระทรวงการคลังเรื่องเงินรายได้แผ่นดิน** and **TFRS for NPAEs ch.18**.

**I did not open any authoritative source for these.** I have no verified citation to the
Revenue Code text; every section number above is reported *as quoted by the repository's own
comments*, at the file:line given. Their legal accuracy is **UNVERIFIED**. Note also that
the W14 ruling retired the ม.77/1(10) two-issuer split in practice — the state portion is
now treated as part of the company's VATable supply (`fee-service.js:122-133`) — so the
ม.77/1(10) comments that survive in the code describe the *retired* model.

---

## 8. SUMMARY OF FINDINGS

| # | Finding | Anchor |
|---|---|---|
| F1 | Checkout never reads the quotation — no row read, no `getFrozenPhaseFees`, no acceptance gate | grep over `services/checkout/`; `stripe-checkout-service.js:139` |
| F2 | Checkout drops the stored scope count; quotation uses it | `stripe-checkout-service.js:118-126,139` vs `quotation-service.js:298-299`; resolver `fee-service.js:105-118` |
| F3 | The env flag that enables checkout disables the frozen-price honouring path | `phase-billing-service.js:210-212` → `application-phase-invoice-methods.js:406-423` |
| F4 | `QUOTATION_NOT_ACCEPTED` is slip-only and PHASE_1-only | `payment-slip-service.js:449`, sole call site `:623` |
| F5 | M1 is payable from `DRAFT`/`SUBMITTED`, before a quotation can exist | `stripe-checkout-service.js:41` vs `applications.js:1001,1210` |
| F6 | `markQuotationInvoiced` has no production caller; `INVOICED` unreachable in prod | grep — only 3 test call sites |
| F7 | `REJECTED`/`EXPIRED` are never written; no expiry job despite `validUntil` | grep; `quotation-service.js:93-94`, `billing.prisma:755` |
| F8 | Quotation PDF and list API recompute live — the stored row supplies only the number | `invoice-template-service.js:1021`; `quotations.js:163,244` |
| F9 | Fee overrides have no effective-date column; load errors swallowed silently | `business-rules.js:112-154` (catch at `:152-154`) |
| F10 | No test compares quotation total vs checkout charge through both real paths | `single-issuer-end-to-end-figures.test.js:147` |

F2 is previously known and deliberately unfixed as L3 money-mutation territory
(`stripe-checkout-service.js:120-124`; `reports/sku/design-event.md:413-419`). F1/F3/F5 I did
not find recorded anywhere I read.

**Not verified in this trace** (would need a live DB or a real press, both out of scope
here): whether any production row currently exhibits the §5.2 mismatch; the count of
affected applications; the `evidence/g4-rebuild-2026-08-25/` images cited in code comments;
the legal accuracy of any Revenue Code section number (§7).
