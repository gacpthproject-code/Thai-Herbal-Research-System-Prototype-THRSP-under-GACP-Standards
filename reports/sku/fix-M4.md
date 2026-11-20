# M4 — the expedite fee is abolished

Status: DONE(probe:jest __tests__/unit/no-expedite-fee.test.js)
Operator ruling 2026-08-23, verbatim: "ไม่มีค่าสมาชิก ไม่มีค่าเร่งด่วน ไม่มีเคสยกเว้น vat".

## What was there — two prices for one fee, confirmed

| where | value | served to anyone? |
|---|---|---|
| `apps/backend/config/payment-fees.js:37` | `URGENT_PROCESSING_FEE: 3000` | no — grep found zero readers of the constant |
| `apps/backend/routes/api/finance/pricing.js:210` | `expediteFee: 10000` | **yes** — `GET /api/pricing` and `/api/pricing/fees` |
| `apps/web-app/src/constants/fees.ts:35` | `GACP_EXPEDITE_FEE = 10_000` | offline fallback |
| `apps/web-app/src/hooks/use-pricing.ts:40,102` | required field `expediteFee` + `DEFAULT_FEES.expediteFee` | typed contract |
| `openapi/pricing-service.yaml:44,134` | example `10000` + schema property | published contract |

Live confirmation of the contradiction (read-only GET, 2026-08-23):

```
$ curl -s https://preview.gacpth.com/api/pricing/fees
{"success":true,"data":{"applicationFee":5000,"inspectionFee":25000,"renewalFee":30000,
"renewalTotalPerScope":35310,"renewalChargeCount":1,"expediteFee":10000,"currency":"THB",
"platformRate":0.1,"vatRate":0.07,"phase1TotalPerScope":5885,"phase2TotalPerScope":29425,...}}
```

So production advertised 10,000 while the backend fee config priced the same rush service at 3,000. Neither number was SSoT-backed — `pricing.js:208` said so in its own comment ("Still NOT SSoT-backed … carried unchanged").

## Was any live row ever charged an expedite fee? No.

Read-only probe against the live Supabase database (SELECT only; script kept in the session scratchpad, `m4-readonly-probe.js` / `-probe2.js`):

- `invoice_line_items` matching `EXPED|URGENT|เร่งด่วน|expedit|urgent` → **0 rows**
- `invoice_line_items` with `amount IN (3000, 10000)` → **0 rows**
- every line-item code that exists: `DTAM_FEE` (14), `PLATFORM_VAT` (14), `PLATFORM_FEE` (14), `PHASE_2_STATE` (3), `PHASE_2_PLATFORM` (3) — no expedite code
- `journal_entries.description` matching the same pattern → **0 rows**
- distinct `checkout_orders.total_payable_amount` → only `5535` and `27675`; distinct `payment_transactions.amount` → only `553500` / `2767500` satang
- distinct `quotations.totalAmount` → `3210`, `30000`

Nothing to preserve, nothing to unwind. **No existing row is touched by this change.**

## The trap: is the field consumed anywhere?

Checked before deleting the key. `grep -rn "expedite" apps/web-app/src` returned only `constants/fees.ts` and `hooks/use-pricing.ts` — no screen, wizard step or checkout copy ever read `fees.expediteFee`. The only Thai "เร่งด่วน" strings in the UI are unrelated (revocation urgency in `admin/certificates/[id]/detail-view.tsx:413`, watch-list urgency in `provider/coordinator/coordinator-context-panel.tsx:77`, the `urgency` status label). The one consumer of the hook, `health/applications/new/_steps/steps/invoice-step.tsx:73`, reads `applicationFee`/`inspectionFee` only. `PricingFees` object literals: only the spread in `renewal-fee-display.test.tsx` — unaffected by dropping a field.

Also verified `system_configs` holds **no** `pricing_fees` key (14 keys, all `feature.*`/`contact_*`/`marketing_*`/`service_*`/`system_*`), so `GET /api/pricing` serves `defaultFeesPayload()` — the removal actually takes effect live rather than being masked by a stored override.

The key is **removed, not zeroed**: `expediteFee: 0` would still advertise that the option exists.

## RED first

`apps/backend/__tests__/unit/no-expedite-fee.test.js`, before the fix — 9 failed, 2 passed:

```
FAIL __tests__/unit/no-expedite-fee.test.js
  × A. GET /api/pricing/fees publishes no expedite field
  × B. GET /api/pricing (root alias) publishes no expedite field
  × C. no expedite price hides in a nested value either
  × D. PAYMENT_FEES has no expedite/urgent-processing entry
  × E. backend  config/payment-fees.js carries no expedite identifier in live code
  × E. backend  routes/api/finance/pricing.js carries no expedite identifier in live code
  × E. frontend src/constants/fees.ts carries no expedite identifier in live code
  × E. frontend src/hooks/use-pricing.ts carries no expedite identifier in live code
  × E. openapi  pricing-service.yaml carries no expedite identifier in live code
  √ F. the binding per-scope totals are untouched
  √ G. the phase breakdown config still totals 5,885 / 29,425
  ● A: - Array []  + Array [ "expediteFee" ]
  ● D: - Array []  + Array [ "URGENT_PROCESSING_FEE" ]
  ● E (fees.ts): + Array [ "export const GACP_EXPEDITE_FEE = 10_000;" ]
Tests: 9 failed, 2 passed, 11 total
```

F and G passed from the start on purpose: they are the guard proving the removal moves no other number.

## GREEN

```
PASS __tests__/unit/no-expedite-fee.test.js   (11/11)
PASS __tests__/unit/renewal-fee-ssot.test.js  (13/13)
Tests: 24 passed, 24 total
```

Binding numbers re-asserted green and unchanged: phase 1 **5,885**, phase 2 **29,425**, renewal **35,310** per scope, renewal charge count **1**, platform 0.1, VAT 0.07.

Frontend consumer suite, also green after the field left the interface:

```
PASS src/__tests__/renewal-fee-display.test.tsx   Tests: 18 passed
```

## Files changed

- `apps/backend/config/payment-fees.js` — `URGENT_PROCESSING_FEE: 3000` deleted (comment in its place naming the ruling)
- `apps/backend/routes/api/finance/pricing.js` — `expediteFee: 10000` deleted from `defaultFeesPayload()`
- `apps/web-app/src/constants/fees.ts` — `GACP_EXPEDITE_FEE` deleted
- `apps/web-app/src/hooks/use-pricing.ts` — import, `PricingFees.expediteFee`, `DEFAULT_FEES.expediteFee` deleted
- `openapi/pricing-service.yaml` — `expediteFee` removed from the example and the `PlatformFees` schema
- `apps/backend/__tests__/unit/renewal-fee-ssot.test.js` — case J's `expect(d.expediteFee).toBe(10000)` becomes `expect(d).not.toHaveProperty('expediteFee')`
- `apps/backend/__tests__/unit/no-expedite-fee.test.js` — new

## Scope note

`openapi/pricing-service.yaml` is outside the literal file list I was given, but it is the published schema of the exact endpoint field being deleted; leaving it would keep advertising the fee in the API contract. Only the four expedite lines were touched — the file's other staleness (`renewalFee: 15000`, `vatRate: 0`, both wrong today) is **left alone**, not my item. Flagging it for whoever owns the contract docs.

## Not fixed by this change

- The rush *service* as a business concept: nothing in the workflow ever implemented one — there is no expedite flag, no queue-jump path, no wizard offer. Only the price tag existed. Nothing to unwire.
- The stale OpenAPI figures above.
