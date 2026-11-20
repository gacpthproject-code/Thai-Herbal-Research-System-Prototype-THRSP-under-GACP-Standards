# W14 — single-issuer fee model — 2026-08-23

Status: PENDING (implemented on `feat/single-issuer-fee-model`, NOT committed — Tier C, operator merge)

One-line result: the formula and the single-issuer model are implemented and proven at 35,310 / 70,620 / 105,930 across pricing → quotation → billing note → receipt → settlement; frozen quotations keep their old numbers; full backend suite has FEWER failures than main; `money-equation` is BLOCKED (needs a real DB) and there is no rendered-PDF/view-pack evidence yet.
Authority: operator ruling 2026-08-22 — HARNESS_LOG.md `c28355ea` (model) + `d1c33ea0` (figures confirmed). Continuing L3 exception.
Worktree: `C:/Users/charo/Documents/GitHub/gacp-wt-fees` · branch `feat/single-issuer-fee-model` from main `d1c33ea0`

---

## 1. The ruling, restated

| | Retired | New |
|---|---|---|
| Issuers | DTAM (state fee, VAT-exempt) + PLATFORM (platform fee + VAT) | **The COMPANY only** |
| Documents per application | 2 quotations, 2 settlement documents, 2 transfers | **1 of each** |
| ค่าบริการ | — | ราคาเต็ม (state) + ค่าแพลตฟอร์ม (10% of state) |
| VAT base | platform portion only | **the whole ค่าบริการ** |
| Payable @1/2/3 scopes | 33,210 / 66,420 / 99,630 | **35,310 / 70,620 / 105,930** |

The farmer pays the company. The company settles with DTAM separately, outside this system.

### Canonical fixture table (the operator's own arithmetic, confirmed)

| scopes | | ราคาเต็ม | ค่าแพลตฟอร์ม | ค่าบริการ | VAT 7% | **ยอดชำระ** |
|---|---|---|---|---|---|---|
| 1 | phase 1 | 5,000 | 500 | 5,500 | 385 | **5,885** |
| 1 | phase 2 | 25,000 | 2,500 | 27,500 | 1,925 | **29,425** |
| 1 | single charge | 30,000 | 3,000 | 33,000 | 2,310 | **35,310** |
| 2 | phase 1 / phase 2 / single | 60,000 | 6,000 | 66,000 | 4,620 | 11,770 / 58,850 / **70,620** |
| 3 | phase 1 / phase 2 / single | 90,000 | 9,000 | 99,000 | 6,930 | 17,655 / 88,275 / **105,930** |

---

## 2. Consumer map (written before the code changed)

Every site that reads the old model. `†` = changed; the rest were verified as reading through a changed source and needing no edit of their own.

**Fee definition (3 sources — ratchet `dup-source` domain `fee-table`)**
- † `apps/backend/modules/billing/internal/fee-service.js:109` `buildPhaseFee` — **THE formula**. One change here moves every consumer below.
- † `apps/backend/config/business-rules.js` — `FEE_DEFAULTS`, SystemConfig key map, the fee-structure comment table.
- † `apps/backend/config/payment-fees.js` — third table. Only `VAT_RATE` is read by production (accounting/journal/financial-export/split-payment, all rate-only reverse-derivation); its `PHASE_*_TOTAL` / `TOTAL_STANDARD_FEE` constants were stale-but-live-looking and were updated so no one reads 33,210 later.

**Issuer identity**
- † `apps/backend/config/invoice-issuers.js` — `getInvoiceIssuer` (all service types → company), `shouldChargeVat` (always true), collection-agent fine print deleted.
- † `apps/backend/routes/api/finance/issuers.js:70` — stopped serving `collectedByPlatform` / `collectionAgentNoteTH`.

**Quotation**
- † `apps/backend/services/quotation-service.js` — one row instead of a pair; `_buildInstallments`; `_resolveBillableFees` (renewal branch was missing `serviceFeeTotal` → wrote `NaN`, caught by test); the `reviewerSide` DTAM/PLATFORM separation at the old `:644`.
- `apps/backend/services/quotation-line-items.js` — derives from `fees`, follows automatically.
- `apps/backend/routes/api/applications/quotations.js`, read `{dtam, platform}`; `dtam` is now `null` for new applications. The quotations route handles null; the slip service did NOT — see §7.5.

**Pricing / checkout / settlement**
- `apps/backend/routes/api/finance/pricing.js` — builds from the canonical engine; correct with no edit (verified by test, not assumed).
- `apps/backend/services/checkout/stripe-checkout-service.js:71-73` — reads `phase.stateAmount/platformAmount/vatAmount`; follows automatically.
- † `apps/backend/services/checkout/checkout-settlement-service.js` — two split documents → one company tax invoice for the whole ค่าบริการ. **Trigger untouched.**

**Documents / PDF**
- † `apps/backend/services/pdf/invoice-template-service.js` — `detectIssuerSide`, `buildTotalsRowsHtml`, `buildQuotationTotalsRowsHtml`, `buildItemsRows` (vestigial `issuerSide` param removed), `deriveInvoiceAmounts`.
- Templates `quotation/invoice/receipt/tax-invoice/credit-note/debit-note/government-revenue-receipt.html` — **no edit needed**: they contain no hardcoded issuer or VAT figures; every issuer field and totals block is injected by the service above. The collection-agent fine print was never in the HTML — it lived only in `invoice-issuers.js` and the `issuers.js` route.

**Payment gate**
- † `apps/backend/services/payment-slip-service.js:467` — picked its quotation with `side === 'PLATFORM' ? platform : dtam`. See §7.5: this became a **gate weakening** and was fixed.

**Frontend**
- † `apps/web-app/src/constants/fees.ts` — `withPlatformAndVat` rewritten; `isTaxable` flipped to true on both line items; `gacpServiceFee` exported.
- † `apps/web-app/src/app/(marketing)/terms-of-service/page.tsx` — the **binding ToS** recomputed VAT inline as `base × 10% × 7%` and stated the state fee was VAT-exempt under ม.77/1(10). Both false; rewritten to derive from the helper.
- † `apps/web-app/src/app/(marketing)/pricing/page.tsx` — `vatPart` helper used the retired formula; the per-scope line read "รัฐ … (ยกเว้น VAT)".
- † `apps/web-app/src/app/health/payments/client-view.tsx` — told the farmer "โอน 2 ครั้ง (รัฐ + แพลตฟอร์ม)". One transfer now.
- † `apps/web-app/src/lib/i18n/dictionaries/sections/th-health.ts` — "โอนเข้าบัญชีของกรม" (transfer to the *department's* account). The farmer pays the company.
- † `apps/web-app/src/app/health/payments/slip-upload-modal.tsx` — refund note routed the state portion through the department's process.
- **Not changed:** the provider/accounting back-office views (`accounting-dashboard-client.tsx`, `daily-cash`, `reconciliation`, `ArAgingReport`, `wht/applicability-probe`) still speak of a DTAM book side / Wallet A. The company genuinely still tracks a DTAM liability internally, so those labels remain meaningful; they are staff-facing, not farmer-facing. Restructuring the two-book accounting UI is beyond this ruling. **Follow-up item.**

**Other**
- † `apps/backend/scripts/extract-error-codes.js` — the new `code: 'STATE_FEE'` line item was misread as an error code by the catalog scanner.
- `preview-financial-utils.js`, `application-phase-invoice-methods.js`, `product-detail-builder.js` — read `targetFee.*`, follow automatically. See §7 for the one structural oddity left in place.

---

## 3. Rounding

**There is none, and that is the point.** No residue-absorption rule was needed or added.

state is always a multiple of 5,000, so:
- platform = 10% of state → integer
- ค่าบริการ = 11/10 × state → integer, always a multiple of 5,500
- VAT = 7% of a multiple of 5,500 → integer (5,500 × 0.07 = 385 exactly)

`Math.round` is applied per component (never to the sum), but at the configured rates it never actually rounds. The identity **phase1 + phase2 == single charge** therefore falls out of plain arithmetic — 385n + 1,925n = 2,310n — and holds exactly at every scope count, not just the three confirmed ones. Pinned for scopes 1–24 in `single-issuer-fee-model.test.js`.

**Caveat, stated rather than hidden:** the rates are SystemConfig-overridable (`fee.platform_rate`, `fee.vat_rate`). An override to a rate that makes these products non-integral could introduce a ≤1-satang divergence between the two phases and the single charge. That is a property of the override, not of this change, and it is not currently guarded.

---

## 4. Invariants — retired vs kept

From `.claude/skills/gacp-payment-invariants/SKILL.md`:

**RETIRED by the ruling (2)**
1. **Two tax IDs / two issuers.** DTAM no longer issues any farmer-facing document. Its constant survives *only* as the settlement counterparty for the remittance liability the company owes. `getInvoiceIssuer` returns the company for every service type.
2. **Per-issuer separation** (`ACCOUNT_DTAM` must never see a `PLATFORM` quotation). One issuer, one ledger, one signing key — nothing left to separate. `reviewerSide` is still *honoured* where passed, so historical DTAM rows do not become newly visible as a side effect of a pricing change; it simply matches nothing newly issued.

Also retired, following from those: "VAT คิดจากค่าบริการเท่านั้น (ไม่รวมค่าธรรมเนียมรัฐ)"; the two-transfer / two-slip model; the collection-agent notation.

**KEPT, and how**
| Invariant | How preserved |
|---|---|
| **Money equation** `total = dtam_fee + platform_net + platform_vat` | The VAT *base* changed; the *shape* did not. Verified against the Wave-1 DB CHECK (migration `20260802150000`) — **no migration required**. Re-pinned by the 1,000-case property test and asserted directly in the end-to-end suite. |
| **SETTLED comes only from webhooks** | Settlement trigger, signature verification, dedup and the amount cross-check are **untouched**. Only the amounts read and the documents written changed. `settle-webhook-only` probe run — see §6. |
| **Stripe SDK in one file** | Untouched. `stripe-sdk-isolated` PASS. |
| **Idempotency (3 layers)** | Untouched at the PaymentIntent and webhook layers. Quotation idempotency *tightened*: previously "both rows exist"; now any existing row blocks re-issue, so an application cannot receive a second differently-numbered price. |
| **Ratchet down-only** | `ratchet.sh` PASS, no counter above baseline (hardcode=33 todo=56 env-direct=122 dup-source=2). |
| **Receipt-number gaps are legal** | Unchanged; settlement now burns one number per settle instead of two. |

---

## 5. Frozen quotations — what happens to the old ones

**Behaviour implemented: they keep their frozen numbers. Only new quotations use the new formula.**

Re-pricing an outstanding quotation upward would bill a farmer more than the document in their hands — possibly one they have already accepted. That is a broken quote, not a rounding detail.

**The mechanism is structural, not a version flag.** `_reconstructFrozenFromInstallments` reads `stateAmount` / `platformAmount` / `vatAmount` out of the STORED installments and adds them. It never calls the fee service and has no access to the rates, so a formula change physically cannot reach a row already written.

**Honest note on RED/GREEN here:** this property already held on main. `single-issuer-frozen-quotation.test.js` is a *characterization* test — it passed on first run against the new code. It is not a RED→GREEN cycle and is not presented as one. Its value is locking the property against the obvious future "improvement" (recomputing VAT from the stored platform amount to fix up legacy rows), which would silently reprice every outstanding quotation. It asserts a genuine old-shape snapshot (`vatAmount: 35` = 7% of 500) still reprices to 33,210 while today's engine says 35,310, and that a made-up installment matching no formula the platform ever had still reads back exactly as stored.

Pre-W14 applications keep their DTAM+PLATFORM **pair** on disk; issuance returns them untouched and creates nothing to "correct" them (`single-issuer-quotation-row.test.js`).

---

## 6. Evidence

**RED first — the formula.** `single-issuer-fee-model.test.js` against unmodified code: **16 failed / 4 passed**, showing the old numbers against the new expectations (`Expected 105930, Received 99630`; `Expected 35310, Received 33210`). After `buildPhaseFee`: **20/20 GREEN**.

**RED first — the issuer.** `single-issuer-documents.test.js` against unmodified code: **9 failed / 8 passed** (`Expected "DTAM", Received "PLATFORM"` inverted; fine-print assertions failing). After: **20/20 GREEN**.

**RED first — end to end.** `single-issuer-end-to-end-figures.test.js`: **12 failed / 9 passed** (stages 1/3/4). After the PDF layer: **21/21 GREEN**.

**New suites — 5 files, 89 tests, all green**
| Suite | Covers |
|---|---|
| `single-issuer-fee-model.test.js` | the formula; the two-phases-sum-to-single identity at scopes 1–24; the DB money equation |
| `single-issuer-end-to-end-figures.test.js` | **pricing API == quotation == billing note == receipt == settlement** at 35,310 / 70,620 / 105,930 |
| `single-issuer-documents.test.js` | one issuer; VAT everywhere; fine print gone; stored-zero-VAT regression |
| `single-issuer-quotation-row.test.js` | one row, right amounts, idempotency, legacy pair untouched |
| `single-issuer-frozen-quotation.test.js` | frozen old-formula quotations keep their numbers |

**Probes**
- `ratchet.sh` — **PASS**, no counter above baseline.
- `stripe-sdk-isolated.sh` — **PASS**.
- `settle-webhook-only.sh` — **PASS** (`only services/checkout/checkout-settlement-service.js writes SETTLED; settle test green`). It failed on the first run because the settle test still pinned the retired two-document behaviour; after moving that test to the ruling, `stripe-checkout-engine.test.js` is 22/22. The probe's own invariant — `status: 'SETTLED'` written in exactly one file — was never touched.
- `money-equation.sh` — **BLOCKED(operator: needs real Postgres + psql)**. It samples live `checkout_orders` rows and refuses to pass vacuously. Not run. Its equation is asserted at the service level instead, which is not the same thing and is not claimed to be.

**Typecheck / lint**
- `npx tsc --noEmit -p tsconfig.json` from `apps/web-app`: **62 lines — exactly the e2e-phase0 baseline**, no new errors.
- `eslint` on every changed backend file: **clean** (one `no-unused-vars` warning surfaced and was fixed by removing the now-vestigial `issuerSide` parameter).

**Frontend suite** — `apps/web-app`: **302 suites / 2,272 tests, all green.**

**Full backend suite** — baseline on main `d1c33ea0`: **17 suites / 41 tests failing**, all DB- or env-dependent (pdf-ssrf, tenant-isolation, prelaunch-gate, auth-idp, cert-issuance, …). Several are flaky between runs — the failing SET shifts run to run — so the comparison is "no NEW money-path failure", not set equality. Branch result in §9 — **14 suites / 38 tests, fewer than baseline**.

**`local-gate.sh`** — **FAIL, identically to main**, on two probes unrelated to this work. Both were re-run against main to confirm rather than assumed:
- `deploy-drift` — staging is 251 commits behind, and `gacpth.com` is unreachable from this machine (a network condition, which the probe itself says is "not a verdict about the deployment — but not a pass either").
- `main-attestation-audit` — 18/18 gated commits on origin/main carry no full-gate attestation; a pre-existing repo-wide condition that by its own words "cannot and does not block a merge".

No new gate failure is introduced by this branch. `no-secret` reports BLOCKED (honest, not gating); `no-skip` is FAIL-but-waived by the operator to 2026-09-15 (L-006), unchanged.

---

## 7. What I could not verify, and one thing left deliberately alone

1. **`money-equation` probe** — needs a real DB. BLOCKED, not run, not claimed.
2. **No real-Postgres proof.** Every quotation/checkout/settlement assertion runs against stubbed Prisma. The *decisions* (which rows, what amounts) are proven; the *writes* are not. A DB-backed walk is a separate, operator-gated run.
3. **No rendered-PDF proof.** The totals/line builders are asserted as HTML strings; no Puppeteer render and no view-pack. For a change that alters what a farmer's receipt says, **a view-pack should gate the merge** (CLAUDE.md §5 tier B/C).
4. **The STATE/PLATFORM invoice-component split still exists** in `application-phase-invoice-methods.js`: the STATE component is minted with `vatAmount: 0` and the phase's entire VAT rides on the PLATFORM component. The **totals are correct** (they sum to the right payable) and tests pass, but with one issuer the split is now an internal artifact rather than two documents. I left it in place — collapsing it touches the invoice-family mint and its unique indexes, which is a bigger structural change than this ruling asked for. **Worth a follow-up item.** It is also what made the `deriveInvoiceAmounts` bug below dangerous.
5. **Two bugs this change created, both caught and fixed** — recorded because both nearly shipped:
   - **Fabricated VAT.** Removing the `isStateSide` branch from `deriveInvoiceAmounts` left a stored `vat: 0` falling through to the legacy reverse-derivation `total × 7/107`, which would have **printed ~327 THB of VAT on a 5,000 THB line that was never taxed**. Fixed by treating a *present* value (including zero) as authoritative and reverse-deriving only a genuinely absent one. Guarded by a direct test on the now-exported `deriveInvoiceAmounts`.
   - **Weakened payment gate.** `payment-slip-service` selected its quotation with `side === 'PLATFORM' ? platform : dtam`. Once `dtam` became `null` for every newly-quoted application, a STATE-side slip found no row and fell through the *legacy fail-open* path — **letting a farmer pay before accepting any quotation at all**. Fixed to resolve the single company row (still preferring the side-specific row for pre-W14 pairs). Guarded by a named regression test in `quotation-accept-to-phase1-gate-flow.test.js`. This one is worth dwelling on: it turned a security-relevant gate off *silently*, via a null, with no test failing until an integration suite happened to destructure the missing field.
6. **`walletA`/`walletB`** in `payment-fees.js` and `SystemConfig` rows under the deleted `fee.bt11_cultivation` / `fee.bt13_processing` keys: orphan rows in a deployed DB are now ignored rather than loaded. No data migration was written to delete them — they are inert.
7. **`serviceFee` field name in `payment-fees.js`** still means "the platform 10%", not ค่าบริการ. Left alone deliberately so this stays a money change rather than a rename sweep; called out here because the name now reads misleadingly next to the new vocabulary.

---

## 8. Files changed (no git add, no commit)

**Source (16)**
```
apps/backend/modules/billing/internal/fee-service.js      ← THE formula
apps/backend/config/business-rules.js                     ← BT11/BT13 deleted; comment table
apps/backend/config/invoice-issuers.js                    ← one issuer; fine print deleted
apps/backend/config/payment-fees.js                       ← third table de-staled
apps/backend/services/quotation-service.js                ← one quotation
apps/backend/services/checkout/checkout-settlement-service.js ← one document
apps/backend/services/pdf/invoice-template-service.js     ← single-issuer rendering
apps/backend/routes/api/finance/issuers.js                ← agent notation removed
apps/backend/scripts/extract-error-codes.js               ← STATE_FEE line-item code
apps/backend/services/payment-slip-service.js             ← gate fix (see §7.5)
apps/web-app/src/constants/fees.ts                        ← FE mirror
apps/web-app/src/app/(marketing)/terms-of-service/page.tsx  ← binding ToS clause
apps/web-app/src/app/(marketing)/pricing/page.tsx           ← public pricing copy
apps/web-app/src/app/health/payments/client-view.tsx        ← 'transfer twice' removed
apps/web-app/src/app/health/payments/slip-upload-modal.tsx  ← refund note
apps/web-app/src/lib/i18n/dictionaries/sections/th-health.ts ← 'department's account'
```

**Tests — new (5)**
```
apps/backend/__tests__/unit/single-issuer-fee-model.test.js
apps/backend/__tests__/unit/single-issuer-end-to-end-figures.test.js
apps/backend/__tests__/unit/single-issuer-documents.test.js
apps/backend/__tests__/unit/single-issuer-quotation-row.test.js
apps/backend/__tests__/unit/single-issuer-frozen-quotation.test.js
```

**Tests — updated to the ruling (18)**
```
fee-service.test.js · fee-service-phase-total.test.js · fee-table-ssot.test.js
money-equation-property.test.js · payment-phase-flow-canonical-totals.test.js
pricing-two-money-flow.test.js · renewal-fee-ssot.test.js
renewal-single-charge-billing.test.js · quotation-service.test.js
invoice-issuers.test.js · invoice-template-single-issuer.test.js
two-money-flow-contract.test.js · phase-invoice-vat-split.test.js
split-payment-calculator.test.js · stripe-checkout-engine.test.js
integration/quotation-accept-to-phase1-gate-flow.test.js
integration/production-smoke.test.js
web-app/src/__tests__/renewal-fee-display.test.tsx
```
Each carries an inline note saying what it used to assert and which ruling changed it. The `renewal-single-charge-billing.test.js` GOLDEN block — which explicitly says "must never be updated to match" — records that every applicant's bill *did* change, by operator ruling, and that the state and platform amounts are unchanged as the check that it was the intended change.

---

## 9. Full-suite comparison (the number that decides "no new failures")

| | Suites failing | Tests failing | Tests passing |
|---|---|---|---|
| **main `d1c33ea0`** (baseline) | 17 | 41 | 8,198 |
| **`feat/single-issuer-fee-model`** | **14** | **38** | **8,273** |

Fewer failures than the baseline, and 75 more tests passing.

Every one of the 14 remaining failures is either in the baseline set or verified flaky:
- **13 of 14 are in the baseline failing set verbatim** — `a0-pr2-per-hop-invariant`, `m1-erasure-holder-survives`, `m1-submit-enforcement`, `m2a-submit-enforcement`, `pdf-ssrf-interception`, `renewal-service`, `audit-onsite-wire-contract`, `auth-idp-providers-endpoint`, `certificate-farm-resolution`, `certificate-issuance-holder-wiring`, `prelaunch-access-gate`, `sc-ten-1-auditor-tenant-scope`, `tenant-scope-drift`.
- **`status-writer-audit-default-invariant`** is the one not in the baseline list. **Re-run in isolation: 7/7 PASS.** It fails only under full-suite parallel load — flaky, not caused by this change.
- **`renewal-service`** deserved a second look because it is renewal-related. **Run on main it fails identically** — same test, same assertion, `Expected "DRAFT", Received "PENDING_AUDIT_FEE"`. Pre-existing; this work does not touch it.

Three baseline failures are GONE on the branch (`cert-issuance-atomicity-be-t1`, `payment-closure-be`, `tenant-isolation-cross-org-be`). They are DB-flaky rather than fixed by this work, and are not claimed as fixes.

**Money-adjacent suites specifically — all green:**
`fee-service` · `fee-service-phase-total` · `fee-table-ssot` · `money-equation-property` (1,000 seeded cases) · `payment-phase-flow-canonical-totals` · `pricing-two-money-flow` · `renewal-fee-ssot` · `renewal-single-charge-billing` · `quotation-service` · `quotation-accept-to-phase1-gate-flow` · `invoice-issuers` · `invoice-template-single-issuer` · `invoice-template-issuer-wiring` · `two-money-flow-contract` · `phase-invoice-vat-split` · `phase-fee-breakdown` · `split-payment-calculator` · `stripe-checkout-engine` · `production-smoke` · `backfill-platform-invoice-vat` · `quotation-line-items` · plus the 5 new W14 suites.

## 10. Intended commits

```
feat(fees)!: one issuer, VAT on the whole service fee — 35,310 / 70,620 / 105,930

BREAKING: every applicant's payable rises by 7% of the state fee.
ค่าบริการ = ราคาเต็ม + ค่าแพลตฟอร์ม 10%; ยอดชำระ = ค่าบริการ + VAT 7% of ALL of it.
The company is the sole issuer of quotation, billing note and receipt; the
two-issuer (DTAM/PLATFORM) split, its per-issuer quotations, its per-issuer
installments and its collection-agent fine print are retired. Frozen
quotations keep their old numbers. No schema migration: the checkout money
equation holds unchanged.

Operator ruling 2026-08-22 — HARNESS_LOG.md c28355ea, figures confirmed d1c33ea0.
Continuing L3 exception.
```
```
chore(fees): delete BT11_CULTIVATION / BT13_PROCESSING and their SystemConfig keys

50,000 each, declared and key-mapped but never charged anywhere.
Operator: "เราไม่มี 50000 บาทนะ". The license_bt11/bt13 DOCUMENT SLOTS are a
different thing and are untouched.
```
```
test(fees): pin the single-issuer model end to end

Five new suites; fifteen existing suites moved to the ruling with inline notes
on what each used to assert.
```
