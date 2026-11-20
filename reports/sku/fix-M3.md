# M3 — no membership fee — 2026-08-23

Status: `DONE(probe:jest __tests__/unit/no-membership-fee.test.js)`
Operator ruling being executed: **"ไม่มีค่าสมาชิก"** (2026-08-23).

---

## 1. The surface, enumerated before anything was deleted

| # | Where | What it did | Action |
|---|---|---|---|
| 1 | `apps/backend/services/subscription/subscription-order-service.js:66-70` | `DEFAULT_PRICING` = `PREMIUM_MONTHLY: 990`, `PREMIUM_YEARLY: 9900` — the price itself | **deleted** (with `resolvePrice`, `buildServiceType`, `generateSubscriptionInvoiceNumber`, `SUBSCRIPTION_SERVICE_TYPES`, `APPLICANT_ROLES`, the unused `feeService` import) |
| 2 | same file, `createSubscriptionOrder()` | the ONLY writer of a `subscriptions` row + a priced `SUBSCRIPTION_*` invoice, `vat: 0` at old `:170` | **deleted** |
| 3 | same file, `createRenewalInvoicesForDueSubscriptions()` | the cron body that **re-billed** an expiring membership | **deleted** |
| 4 | `apps/backend/routes/api/system/subscription-orders.js:44` | `POST /orders` — the "Subscribe" endpoint | **deleted** (route + its error-status ladder) |
| 5 | `apps/backend/routes/api/system/subscription.js:24-71` | `PLAN_CATALOGUE` + `GET /plans` — public, **unauthenticated**, published `priceTHB: 990` | **deleted** |
| 6 | `apps/backend/jobs/scheduler.js` job 7 | registered the auto-renewal cron at 09:00 BKK | **deleted** (job 6, expiry, kept — lapsing costs nobody anything) |
| 7 | `apps/web-app/src/app/health/subscription/{page,client-view}.tsx` | the pricing page: `฿990/เดือน` cards, "เลือกแผนนี้" → `createOrder` → slip upload | **files deleted** |
| 8 | `apps/web-app/src/lib/services/subscription-service.ts` | `getPlans()`, `createOrder()`, `SubscriptionPlan`, `PlansResponse`, `CreateOrderResponse` | **deleted** |
| 9 | `apps/backend/shared/error-codes.js:1797-1855` | `CONTACT_SALES`, `INVALID_TIER`, `INVALID_CYCLE`, `NO_PRICING`, `SUBSCRIPTION_ALREADY_EXISTS` — emitted only by #2 | **deleted** (`FEATURE_LOCKED` kept: feature gate, not a fee) |
| 10 | `apps/backend/services/subscription/entitlements-service.js:119` | `upgradeUrl: '/subscription'` — pointed at the page in #7 | **deleted** |
| 11 | `docs/deployment/production-diagnostic-runbook.md:222`, `docs/operations/level-4-activation.md:87` | smoke-tested `GET /api/subscription/plans` | **repointed to `/api/pricing`** (verified live: HTTP 200) |

Kept on purpose: `activateSubscriptionForInvoice`, `cancelSubscription`, `listSubscriptionsForOrg/ForOwner`, `findOwnedSubscription`, `expireDueSubscriptions`, `GET /orders/my`, `POST /orders/:id/cancel`. None of them can create a charge; all of them exist so a historical row stays readable and can wind down. **Existing rows keep their numbers.**

## 2. The two things established before deleting

**(a) Does any live row exist that was charged a membership fee? — NO.**
Read-only `SELECT`s against the live Supabase pooler (`aws-1-ap-southeast-2.pooler.supabase.com`, `current_database()` = `postgres`), 2026-08-23. No write of any kind was issued.

```
applications: [{"n":120}]        <- sanity: this is the live DB, not a local one
invoices:     [{"n":60}]
subs_total:    [{"n":0}]
subs_by_status: []
sub_invoices:  []                (WHERE "serviceType" LIKE 'SUBSCRIPTION%' OR "subscriptionId" IS NOT NULL)
sub_slips:     [{"n":0}]
sub_checkout:  [{"n":0}]
```

Zero subscriptions, zero subscription invoices, zero slips, zero checkout orders. Nothing was ever billed under this fee, so nothing is being rewritten — only the ability to bill it again is gone.

**(b) Does removing the path break a route the frontend still calls? — NO, once the pricing page goes with it.**
- `GET /api/subscription/plans` — one caller: `health/subscription/client-view.tsx:99`. Deleted in the same change. It was live and unauthenticated on preview right up to this change: `curl https://preview.gacpth.com/api/subscription/plans` → **HTTP 200**, `"priceTHB":990`.
- `POST /api/subscription/orders` — one caller: `client-view.tsx:128`. Same page.
- `GET /api/subscription/orders/my` — still called by `provider/accounting/accounting-dashboard-client.tsx:164`. **Route kept**, so that tab still works (it now always renders empty, which is true).
- `POST /api/subscription/orders/:id/cancel` — still called by `subscription-cancel-modal.tsx:43`. **Route kept.**
- No nav entry pointed at `/subscription`; the only in-repo link was `entitlements-service.js:119`'s `upgradeUrl`, removed. Playwright's `**/api/subscriptions/my**` mocks (`account-fixtures.ts:609`, `dtam-fixtures.ts:984`) are a *different, plural* path and match nothing real.
- Typecheck: `npx tsc --noEmit` in `apps/web-app` → **zero errors under `src/`**. (Stale `.next/types/**` entries for the deleted page are build output; the same staleness already exists for `trace/plant/[qr-code]`, which is likewise absent from `src/`.)

## 3. RED first

`apps/backend/__tests__/unit/no-membership-fee.test.js`, written before any source change, run against the unmodified tree:

```
● M3 — no membership fee is offered or charged › POST /api/subscription/orders no longer exists
● M3 — no membership fee is offered or charged › GET /api/subscription/plans no longer publishes a priced catalogue
● M3 — no membership fee is offered or charged › the order service exports no price table and no order-minting function
● M3 — no membership fee is offered or charged › no membership price literal survives anywhere in the fee surface
● M3 — no membership fee is offered or charged › the membership pricing page is gone from the frontend
● M3 — no membership fee is offered or charged › the frontend client can no longer create an order or fetch plans
● M3 — no membership fee is offered or charged › the auto-renewal cron (which re-bills a subscription) is unregistered
Test Suites: 1 failed, 1 total
Tests:       7 failed, 7 total
```

## 4. GREEN

```
√ POST /api/subscription/orders no longer exists (94 ms)
√ GET /api/subscription/plans no longer publishes a priced catalogue (17 ms)
√ the order service exports no price table and no order-minting function (2 ms)
√ no membership price literal survives anywhere in the fee surface (4 ms)
√ the membership pricing page is gone from the frontend (2 ms)
√ the frontend client can no longer create an order or fetch plans (2 ms)
√ the auto-renewal cron (which re-bills a subscription) is unregistered (3 ms)
Test Suites: 1 passed, 1 total
Tests:       7 passed, 7 total
```

Every suite that touched the deleted code, re-run:

```
backend  (8 suites: no-membership-fee, subscription-orders-owner-scope,
          payment-slip-subscription-owner-idor, role-filters-canonical-only,
          error-codes-catalog, n-plus-one-batching, scheduler-renewal-job,
          payment-reminder-job)              → 8 passed, 80 tests passed
backend  (5 payment-slip suites that mock the service) → 5 passed, 37 passed
web-app  (subscription-service-decimal-coercion, x4-fix-d-a11y-polish,
          slip-review-modal-reject-preset, nav-role-rules) → 4 passed, 94 passed
eslint   (11 backend + 2 web-app touched files)          → clean, no output
```

## 5. The bound figures did NOT move

```
__tests__/unit/single-issuer-fee-model.test.js
__tests__/unit/single-issuer-end-to-end-figures.test.js
__tests__/unit/single-issuer-quotation-row.test.js
__tests__/unit/two-money-flow-contract.test.js
Test Suites: 4 passed, 4 total
Tests:       127 passed, 127 total
```

Nothing in this change reads or writes `fee-service`, the pricing API, quotations, invoices for applications, or VAT. new p1 = 5,885 · new p2 = 29,425 · renewal = 35,310 per scope, unchanged.

## 6. Collateral test edits (all forced by the deletion, none loosened)

- `n-plus-one-batching.test.js` — the `subscription renewal cron — prefetched probes` describe block covered the deleted function; removed with a note in its place. Remaining 5 tests pass.
- `scheduler-renewal-job.test.js` — cron block count `13 → 12`; the 09:00 BKK registrations `3 → 2`; the renewal-reminder callback is now the **first** 09:00 block, not the second. Assertions kept, indices corrected.
- `payment-reminder-job.test.js` — same count changes (`13 → 12`, morning calls `3 → 2`).
- `role-filters-canonical-only.test.js` — dropped the `subscription-order-service.js :: APPLICANT_ROLES` row (that constant only fed the deleted cron's healthId fallback).
- `subscription-service-decimal-coercion.test.ts` — the `createOrder` half of one test replaced by a test that `createOrder`/`getPlans` are **undefined**; `cancelOrder` coercion still asserted.

## 7. Found, NOT owned, NOT touched — hand up

1. **`services/pdf/invoice-template-service.js:310-322`** — `buildItemsRows()` has a subscription branch whose own comment says *"Subscription invoices are a single line — no phase split, **no VAT** breakdown"*. That is a VAT-exempt render path, which contradicts the 2026-08-23 ruling *"ไม่มีเคสยกเว้น vat"*. It is now unreachable (no `SUBSCRIPTION_*` invoice can be created, none exists), but the code still says VAT can be skipped. Removing it is receipt/PDF territory — not my file.
2. **`services/pdf/invoice-template-service.js:271-274`** — Thai labels `ค่าสมาชิกแผน Premium (รายเดือน/รายปี)` etc., plus `isSubscriptionInvoice()` at `:282`. Same reasoning.
3. **`services/chart-of-accounts-service.js:240-247`** — GL account `4120 รายได้ค่าสมัครสมาชิก / Subscription Revenue`, `vatRelevant: true`. A revenue account for a fee that no longer exists. Chart-of-accounts is money-ledger schema; leaving it is also the conservative choice for historical journal reads.
4. **`services/receipt-numbering-service.js:317`**, **`services/vat-report-service.js:990`**, **`services/split-payment-calculator.js:99`** — `SUBSCRIPTION_*` classification branches, all now unreachable.
5. **`apps/web-app/src/app/provider/accounting/accounting-dashboard-client.tsx`** — the `แพ็กเกจสมาชิก` tab and the `SUBSCRIPTION` slip-phase filter (`:77`, `:91`, `:631`, `:658`). It only *displays* history and its backing routes were kept, so it still works; with zero rows it is permanently empty. Deleting the tab is a UI decision for the operator, and that file is heavily shared.
6. **`apps/web-app/src/lib/services/accounting-service.ts:692-693`** — the same GL account mirrored on the frontend (`รายได้ค่าสมาชิก · Subscription`).
7. **Schema**: the `subscriptions` table, `invoices.subscriptionId`, `payment_slips.subscriptionId`, `checkout_orders.subscriptionId` and their CHECK constraints all remain. Dropping them is Tier C migration work and would destroy the ability to read history; not attempted.
8. **`reports/sku/SKU-SPEC.md:133-136,159,578`, `reports/sku/design-catalogue.md:114-119`, `design-component.md:74-78`, `design-event.md:138`** — the SKU catalogue still lists `SUBS-PREMIUM-M/-Y` as `ACTIVE` at 990/9,900 and still carries the open question *"Q2 — ค่าสมาชิก 990/9,900 เสีย VAT หรือไม่"* as `UNRULED`. **Q2 is now answered by deletion: the fee does not exist.** Those are another work item's deliverables; someone owns updating them.
9. **`docs/architecture/2026-04-28-billing-flow-review.md:86`** and **`docs/architecture/2026-04-28-server-hygiene-audit-results.md:53`** — dated historical documents that describe the 990/mo plan and a `GET /api/subscription/plans` 200 result. Left as history.
10. `BILLING_FREE_TIER_FOR_ALL` and the FREE/PREMIUM/ENTERPRISE **feature gates** survive untouched. They gate features, they do not price anything, and there is no longer any way to buy a tier — it is granted or not.

## 8. Files changed

```
apps/backend/services/subscription/subscription-order-service.js   (rewritten: charge paths removed)
apps/backend/services/subscription/entitlements-service.js         (upgradeUrl + header)
apps/backend/routes/api/system/subscription.js                     (PLAN_CATALOGUE + GET /plans removed)
apps/backend/routes/api/system/subscription-orders.js              (POST /orders removed)
apps/backend/jobs/scheduler.js                                     (job 7 removed)
apps/backend/shared/error-codes.js                                 (5 dead codes removed)
apps/backend/__tests__/unit/no-membership-fee.test.js              (NEW — the RED test)
apps/backend/__tests__/unit/n-plus-one-batching.test.js
apps/backend/__tests__/unit/scheduler-renewal-job.test.js
apps/backend/__tests__/unit/payment-reminder-job.test.js
apps/backend/__tests__/unit/role-filters-canonical-only.test.js
apps/web-app/src/app/health/subscription/page.tsx                  (DELETED)
apps/web-app/src/app/health/subscription/client-view.tsx           (DELETED)
apps/web-app/src/lib/services/subscription-service.ts
apps/web-app/src/lib/services/__tests__/subscription-service-decimal-coercion.test.ts
docs/deployment/production-diagnostic-runbook.md
docs/operations/level-4-activation.md
```

No git command was run. No row anywhere was written. `ALLOW_REMOTE_TEST_DATABASE` was never set; the read-only probe was a standalone node script, never a jest run.
