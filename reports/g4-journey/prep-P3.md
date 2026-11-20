# G4 prep — lane P3: phase-0 Playwright specs vs the current fee model — 2026-08-25

Status: DONE(local) — `npx playwright test --config=playwright.phase0.config.ts --list` → 13 tests in
8 files · `npx tsc --noEmit` · `npx eslint` on the 6 changed files → clean.

Read: `apps/web-app/playwright.phase0.config.ts` and all 8 files in `apps/web-app/e2e-phase0/`.
Nothing was run against the live site or the live database. No git command was run.

---

## 1. BEFORE ANY CHANGE — the inventory the lane asked for

### 1.1 Hardcoded money figures in the phase-0 suite: **there are none**

The lane's premise — "figures moved from 5,535 to 5,885, find and update them" — does not hold for
`e2e-phase0/`. Exhaustive scan:

```
$ grep -rn "5535|5,535|5885|5,885|29425|29,425|27500|25000|5000" e2e-phase0/*.ts
  → only Playwright timeouts (waitForTimeout(5000), timeout: 200_000) and source line numbers
$ grep -n "totalAmount|total_payable|dtam_fee|platform_fee|toLocaleString|฿|บาท" e2e-phase0/*.ts
  → SELECT column lists and two boolean equation checks; zero literal amounts
```

Every multi-digit literal in the suite is a timeout, a Thai postcode (`50200`), a phone seed, or a
`file.js:NNN` citation. **The stale figures live outside this lane** (see §4).

**This is the finding, not a null result:** the phase-0 walk contains no assertion that could ever
have gone red on a wrong fee. Its only money checks are the two structural equations at
`helpers.ts:94-95`, `s04-pay-phase2.spec.ts:239-240` and `settlement-resilience.spec.ts:126-127`:

```
total_payable_amount = dtam_fee_amount + platform_fee_net + platform_fee_vat
platform_fee_gross   = platform_fee_net + platform_fee_vat
```

Both balance under the retired formula exactly as well as under the current one
(`5,535 = 5,000 + 500 + 35` is as balanced as `5,885 = 5,000 + 500 + 385`). A regression to the old
VAT base would have walked the whole pipe green. §3 closes that.

### 1.2 Assertions that ARE stale — a count, not a figure

| file:line (pre-change) | assertion | why it is stale |
|---|---|---|
| `s01-register-submit.spec.ts:326` | `expect(quotes.length, 'two quotations (DTAM + PLATFORM)').toBe(2)` | W14 single-issuer (operator ruling 2026-08-22) issues **ONE** quotation row — `quotation-service.js:531-559`, "allocate ONE number and create ONE row". Fails on any application submitted today. |
| `s01-register-submit.spec.ts:311-313` | polling loop `while quotes.length < 2` | same cause; spins the full 7 × 2s before failing. |
| `s07-seams.spec.ts:435-437` | `expect(quotes.length, 'DTAM+PLATFORM quotations exist').toBe(2)` | same cause. |
| `s01:18`, `s07:23,35,195,602`, `s03:470-472` | prose "DTAM+PLATFORM quotations" (plural) | describes the retired two-issuer shape. |

Evidence that ONE row is current, from a real run:

```
$ cd apps/backend && npx jest __tests__/unit/single-issuer-quotation-row.test.js \
    __tests__/unit/single-issuer-end-to-end-figures.test.js
PASS  W14 — issuance writes exactly one quotation
  √ 1 scope(s): one row, from the company, for the full payable
  √ 3 scope(s): one row, from the company, for the full payable
  √ a pre-W14 DTAM+PLATFORM pair is returned untouched, never repriced
Tests: 28 passed, 28 total
```

### 1.3 Assertions that are loose where the goal demands exact

| file:line (pre-change) | assertion |
|---|---|
| `s03-resubmit-approve.spec.ts:521` | `expect(Number(stateInv?.totalAmount ?? 0), 'positive payable').toBeGreaterThan(0)` |
| `s03-resubmit-approve.spec.ts:522-524` | the same for the platform invoice |

G4.0 rule 5 is "ตัวเลขเงินต้องออกมาตรงเป๊ะ". `> 0` passes on 27,535 and on 1.

### 1.4 Fixtures that imply a scope count

| file:line | fixture | scope count it produces |
|---|---|---|
| `s01-register-submit.spec.ts:226` | `cultivationMethods: ['outdoor']` | **1** |
| `s01-register-submit.spec.ts:172` | UI click `กลางแจ้ง` (one button) | **1** |
| `s01-register-submit.spec.ts:251` | `plots: [{ name: 'แปลง A', areaSize: '2', areaUnit: 'Sqm' }]` | does not affect the fee — see §5.1 |
| `s07-seams.spec.ts:279` | `cultivationMethods: ['outdoor']` | **1** |
| `s07-seams.spec.ts:244`, `:302` | one `กลางแจ้ง` click, one plot | **1** |

No figure in the suite was asserted that the fee service does not produce, so nothing above falls
under the "report, don't overwrite" rule. The one number that is provably wrong (the quotation
**count** 2) is a stale count from the retired model — corrected, not loosened.

---

## 2. THE FEE MODEL, READ BACK FROM THE SERVICE (not copied from a document)

```
$ cd apps/backend && node -e "const f=require('./modules/billing/internal/fee-service.js'); …"
scopes 1  P1 state 5000  platform 500  vat 385   total 5885
          P2 state 25000 platform 2500 vat 1925  total 29425
scopes 3  P1 state 15000 platform 1500 vat 1155  total 17655
          P2 state 75000 platform 7500 vat 5775  total 88275
whole application (both phases): 1 scope  → subtotal 33,000 vat 2,310 total 35,310
                                 3 scopes → subtotal 99,000 vat 6,930 total 105,930
```

Matches the operator's figures for Farmer A and Farmer B exactly. Every component is linear in
scopeCount — state is a multiple of 5,000, so neither the 10% nor the 7% ever rounds
(`fee-service.js:136-141`, "ROUNDING: none is load-bearing") — which is why a per-scope table × n is
exact at any n.

Where each figure lands in the database:

| row | field | 1 scope |
|---|---|---|
| `quotations` (ONE row, `issuerType='PLATFORM'` = the company) | subtotal / vat / totalAmount | 33,000 / 2,310 / 35,310 |
| `invoices` `PHASE_n_STATE_FEE` | totalAmount (vat 0) | P1 5,000 · P2 25,000 |
| `invoices` `PHASE_n_PLATFORM_FEE` | totalAmount = platform + VAT of the WHOLE service fee | P1 885 · P2 4,425 |
| `checkout_orders` | dtam / net / vat / total | P1 5,000/500/385/5,885 · P2 25,000/2,500/1,925/29,425 |

(`application-phase-invoice-methods.js:436-459`; `stripe-checkout-service.js:115-126`.)

---

## 3. WHAT I CHANGED

Six files, all inside `apps/web-app/e2e-phase0/`. No assertion was loosened: two were corrected, and
four money pins were added where none existed.

**`helpers.ts`** — new shared fee table and helpers, no change to any existing export:
`FEE_PER_SCOPE` (the per-scope figures above, with the derivation and the retired formula named in
the comment), `expectedPhaseFees(phase, n)`, `expectedApplicationTotal(n)`, and
`scopeCountOf(applicationId)`, which reads `applications.totalAreaTypes` — the column the **backend**
stamped at submit (`application-submission-methods.js:142`), never the spec's own fixture. That is
what lets every assertion below hold unchanged for a 1-scope and a 3-scope applicant.

**`s01-register-submit.spec.ts`**
- quotation count `2 → 1`, with the W14 citation and a message naming both failure directions
  (`0` = filed-but-unbillable, `2` = the retired split is back).
- polling loop `< 2 → < 1`; the SELECT now also reads `subtotal, vat`.
- ADDED the money pin at C02: quotation `totalAmount` = `expectedApplicationTotal(scopeCount)`,
  `subtotal` = state + platform of both phases, `vat` = VAT of both phases. The failure message
  prints what the retired formula would have said, so a red test names its own cause.
- new evidence file `C02-fee-model.txt` (expected vs stored).

**`s03-resubmit-approve.spec.ts`**
- the two `toBeGreaterThan(0)` checks → exact: state invoice = `fee2.state`, platform invoice
  = `fee2.platform + fee2.vat`, and their **sum** = `fee2.total`. The two-invoice count assertion at
  `:520` is unchanged and still correct — the STATE + PLATFORM split per phase survives W14; only the
  quotation collapsed to one row.
- new evidence file `C08-fee-model.txt`.

**`s04-pay-phase2.spec.ts`** and **`settlement-resilience.spec.ts`**
- the `eq_total` / `eq_gross` SELECTs now also read `dtam_fee_amount, platform_fee_net,
  platform_fee_vat, total_payable_amount`; the two boolean equation assertions are **kept**, and four
  exact-figure assertions added beneath them (งวด 2 in s04, งวด 1 in the settlement spec), with a
  comment stating why the equations alone cannot detect the retired formula.

**`s07-seams.spec.ts`**
- quotation count `2 → 1`, same message treatment; four prose references to "DTAM+PLATFORM
  quotations" updated to the single-issuer wording.

**`playwright.phase0.config.ts`** — read; nothing to change. It carries no money figure and no
fixture. `workers: 1` / `fullyParallel: false` is load-bearing (the specs share one application row,
and the login limiter is 50 requests / 15 min / IP) and must stay that way for the two-farmer walk
(§5.6).

Verification run in this session:

```
$ npx playwright test --config=playwright.phase0.config.ts --list
Total: 13 tests in 8 files              (every edited spec parses)
$ npx tsc --noEmit -p tsconfig.json     34 pre-existing strict-null errors in e2e-phase0,
                                        none on a line this lane added (checked line by line)
$ npx eslint <the 6 changed files>      clean, no output
```

The specs were NOT executed: they need the running stack, the live database and the Stripe CLI,
which this lane may not touch. Their real-run status is PENDING for the walk lane.

---

## 4. STALE FIGURES THAT ARE REAL BUT OUTSIDE THIS LANE — not touched

| file:line | content |
|---|---|
| `apps/web-app/e2e/checkout-visual.spec.ts:70-72` | `// (5000 + 500 + 35 → 5,535)` and `const HAPPY_TOTAL_TEXT = '5,535';` |
| `apps/web-app/e2e/checkout-visual.spec.ts:107` | test title `happy — success heading + verbatim 5,535 total` |
| `apps/web-app/playwright/fixtures/mock-assets.ts:32` | `amount = '฿5,535.00'` (default slip amount) |
| `apps/web-app/playwright/fixtures/mock-assets.ts:186` | comment `A slip reading ฿5,535 next to an invoice` |

These are the retired platform-only-VAT figures. `checkout-visual.spec.ts` is matched by
`playwright.config.ts` (the CI e2e suite), not by the phase-0 config, so it is a live stale assertion
in a suite the coordinator may run. `mock-assets.ts` belongs to the slip rail that G4.6 retires.
**Recommendation:** fix `checkout-visual.spec.ts` in the round that owns its suite; leave
`mock-assets.ts` to the G4.6 slip removal rather than repainting a number on a path being deleted.

---

## 5. WHAT THE SPECS ASSUME ABOUT THE APPLICANT THAT WILL NOT HOLD — reported, NOT fixed

The suite drives exactly one applicant: an INDIVIDUAL, COMMERCIAL, single-`outdoor`, 5-sqm-farm /
2-sqm-plot cannabis grower, created fresh in `s01` and carried through `evidence/phase0/VARS.md`
(`FARMER_MAIN_ID`, `FARMER_MAIN_APP`). Every later spec reads those two keys.

### 5.1 THE BIG ONE — "three cultivation scopes" means three cultivation **METHODS**, not three plots

The fee is charged per **unique `formData.cultivationMethods` entry**
(`fee-service.js:66-119`, `resolveCultivationScopeCount` → `collectUniqueCultivationMethods`). Plots
matter only as a *fallback* when no method is stated at all, and they are de-duplicated by method
too. Proven:

```
$ node -e "…fee-service…"
B with 3 plots but 1 method  -> scopeCount 1  phase1 5885   phase2 29425
B with 3 distinct methods    -> scopeCount 3  phase1 17655  phase2 88275
A with 1 method              -> scopeCount 1  phase1 5885   phase2 29425
```

So Farmer B's "200 ตร.ม. รวม ซอยเป็น 3 พื้นที่" must be entered as **three different cultivation
methods** — `outdoor` + `greenhouse` + `indoor` — or the platform bills 5,885 instead of 17,655 and
the walk produces the wrong number with nothing complaining. Three plots that are all `outdoor` bill
as ONE scope. The wizard says so itself at
`plant-selection-config-panels.tsx:425`: "คิดค่าธรรมเนียมตามจำนวนรูปแบบการปลูกที่เลือก (ต่อ 1 คำขอ)".

**Decision needed before Farmer B's fixture can be written:** confirm with the operator that
"3 รูปแบบการปลูก" = กลางแจ้ง + โรงเรือน + อาคารควบคุม on one 200-sqm farm. If the operator meant
three *areas* of the same method, 17,655 is unreachable by design and the target figure — not the
code — is what has to change.

### 5.2 Fixtures and selectors that would need to change

| what | file:line | today | Farmer A (EXPORT, 1 scope) | Farmer B (COMMERCIAL, 3 scopes) |
|---|---|---|---|---|
| purpose, UI click | `s01:168` (`s07:241`) | `getByRole('button', { name: /เพื่อการพาณิชย์ในประเทศ/ })` | `/เพื่อการส่งออก/` | unchanged |
| purpose, API fixture | `s01:226` (`s07:279`) | `certificationPurposes: ['COMMERCIAL']` | `['EXPORT']` | unchanged |
| cultivation, UI click | `s01:172` (`s07:244`) | one click `/กลางแจ้ง/` | unchanged | **three clicks** — `กลางแจ้ง`, `โรงเรือน`, `อาคารควบคุม`; it is a multi-select toggle (`plant-selection-step.tsx:195-201`) |
| cultivation, API fixture | `s01:226` (`s07:279`) | `cultivationMethods: ['outdoor']` | unchanged | `['outdoor','greenhouse','indoor']` |
| `areaType` | `s01:225` | `'OUTDOOR'` | unchanged | must stay a single value — `mostControlledMethod()` derives it (`application-submission-methods.js:120-125`); do not hand it an array |
| farm area | `s01:234` | `totalAreaSize: '5'` | `'200'` | `'200'` |
| plots | `s01:251` | one plot, `areaSize: '2'` | one plot, `'200'` | **three plots** summing to 200 (e.g. 67/67/66), each `solarSystem` matching its own method |
| identity | `s01:36` | `thaiId()` — random | operator's fixed `1100100100012` | `1100200200022` |
| names | `s01:40-41`, `:232` | `เฟสศูนย์ พิสูจน์ท่อ` / `ฟาร์มพิสูจน์ท่อ เฟสศูนย์` | per-farmer | per-farmer |
| carry-over keys | `VARS.md` via `saveVars` | one `FARMER_MAIN_*` namespace | needs an A/B prefix | needs an A/B prefix |

Everything else in the applicant fixture (`applicantType: 'INDIVIDUAL'`, `plantId: 'cannabis'`,
`serviceType: 'NEW'`, `totalAreaUnit: 'Sqm'`, plot `areaUnit: 'Sqm'`) is already correct for both
farmers and must not be relaxed — the `Sqm` fields are the plot-areaunit dead-end fix
(`s01:235-250`).

### 5.3 What does NOT need to change (checked, so nobody re-litigates it)

- `s01:169` `expect(input[type=file]).toHaveCount(3)` — the M1 document set is identical for
  COMMERCIAL, EXPORT and RESEARCH (`plant-selection-config.ts:180-231`), so EXPORT still shows 3.
- the quotation count (now 1) is per application, not per scope.
- the phase-invoice count (2 components per phase) is per phase, not per scope.
- `certificates` — one per application for both farmers.
- side note for whoever writes Farmer B: selecting `greenhouse` / `indoor` flips `BUILDING_PLAN` from
  optional to required at the wizard's document step
  (`documents-step-config.tsx:261-270`, `REQUIRE_WHEN_MATCHED`). The phase-0 specs route around that
  step via `POST /api/applications/prepare`, so they are unaffected — a hand-driven UI walk is not.

### 5.4 Parameterise or write a second spec?

Recommendation: **parameterise**, do not fork. The differences are five fixture values plus "click N
buttons instead of one". A second spec would duplicate ~1,900 lines across s01/s03/s04/s07 and
guarantee drift. Concretely: lift the applicant fixture into a `FARMERS` record in `helpers.ts` keyed
`A`/`B`, select it with an env var (`PHASE0_FARMER=A|B`), and prefix the `VARS.md` keys with it.
Every money assertion this lane added already reads its scope count from the database, so it needs no
per-farmer variant.

### 5.5 A divergence the coordinator should know about before the walk

The checkout rail and the invoice mint resolve scopeCount differently:

```
$ node -e "…"   # ctx = { cultivationMethods:['outdoor'], totalAreaTypes:3 }
checkout-style (stripe-checkout-service.js:95-110, no options.scopeCount)      -> 1 → 5,885 / 29,425
invoice-mint   (application-phase-invoice-methods.js:372-380, options.scopeCount) -> 3 → 17,655 / 88,275
```

`stripe-checkout-service.js:96-98` spreads `totalAreaTypes` into the fee context, but
`resolveCultivationScopeCount` never reads that key — it reads `cultivationMethods`. The invoice mint
passes it as `options.scopeCount`, which IS read. A clean walk keeps the two agreeing (both trace
back to the same submit), but they can disagree by 3× if `formData.cultivationMethods` is edited
after submit; and the invoice mint additionally honours the *frozen quotation*
(`application-phase-invoice-methods.js:395-419`) while the checkout always recomputes. The new
exact-figure assertions turn that into a red test instead of a silently wrong charge.
**Not fixed here** — money-path code, L3 / Tier C.

### 5.6 Sequencing

`playwright.phase0.config.ts:29-30` pins `workers: 1` / `fullyParallel: false` because the specs
share one application row. Two farmers must therefore be walked as **two sequential runs**, not one
parallel run — and the login rate limiter (50 requests / 15 min / IP, config comment `:17`) is the
second reason. Two farmers × roughly seven farmer/officer logins each sits close enough to that
ceiling to watch if a run is retried.

---

## 6. NOT DONE / NEXT

- The edited specs have not been executed. Real-run status is PENDING until the walk lane runs them
  against the stack; this lane may not.
- `apps/web-app/e2e/checkout-visual.spec.ts:70-72,107` still asserts the retired 5,535 — outside this
  lane, listed in §4 for the coordinator.
- §5.1 needs an operator confirmation before Farmer B's fixture can be written.
- §5.5 is a money-path finding for a Tier C round, not for the walk.
