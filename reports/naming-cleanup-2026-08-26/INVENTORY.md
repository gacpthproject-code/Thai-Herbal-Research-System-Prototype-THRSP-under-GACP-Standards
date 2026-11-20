# Two wrong names — inventory and proposed rename

Date: 2026-08-26 · Tier C (schema + migration; operator merges)
Migration written, **not applied**: `apps/backend/prisma/migrations/20260826090000_area_sqm_and_cultivation_scope_expand/migration.sql`

Nothing in this work ran against the live dataset. No git command was run.

---

## 1. `applications.totalAreaTypes` → `cultivationScopeCount`

### What it actually holds

The column does not count area types. Every writer stamps `fees.scopeCount`:

| Direction | Site | What happens |
|---|---|---|
| WRITE | `apps/backend/services/application-service/application-submission-methods.js:142` | `totalAreaTypes: fees.scopeCount` on submit |
| WRITE | `apps/backend/services/application-service/application-draft-query-methods.js:72` | `totalAreaTypes: fees.scopeCount` on draft save |
| WRITE | `apps/backend/services/payment-service-phase-flow.js:128-129` | overwrites with `locked.scopeCount` (the accepted quotation's frozen count) |
| WRITE | `apps/backend/routes/api/preview/preview.js:145-146` | same patch on the preview path |
| WRITE | `apps/backend/prisma/seed-real-fees.js:59` | `totalAreaTypes: scopes.length` |
| SCHEMA | `apps/backend/prisma/schema/application.prisma:54` | `totalAreaTypes Int @default(1)` |
| SCHEMA | `apps/backend/prisma/migrations/20260110020726_add_system_config/migration.sql:69` | original DDL |

`fees.scopeCount` comes from `resolveCultivationScopeCount`
(`apps/backend/modules/billing/internal/fee-service.js:107`), which returns
`collectUniqueCultivationMethods(...).length` — the count of **distinct cultivation
methods** (OUTDOOR / INDOOR / GREENHOUSE), read from `cultivationMethods`, else each
plot's `solarSystem`, else `locationType`/`areaType`, else 1
(`fee-service.js:66-119`). It is never a count of area types.

Readers, all of which rename it to `scopeCount` on the very next line:

| Site | Expression |
|---|---|
| `apps/backend/services/quotation-service.js:277` | `const scopeCount = application.totalAreaTypes \|\| 1` |
| `apps/backend/services/quotation-service.js:298` | `scopeCount: application.totalAreaTypes \|\| 1` |
| `apps/backend/services/quotation-service.js:470` | selects the column |
| `apps/backend/services/pdf/invoice-template-service.js:341-342` | `const scopeCount = Number(invoice.application?.totalAreaTypes)…` |
| `apps/backend/services/pdf/invoice-template-service.js:816-817` | `const taxScopeCount = …` |
| `apps/backend/services/pdf/invoice-template-service.js:1023` | `const scopeCount = …` |
| `apps/backend/routes/api/applications/quotations.js:156,158,229` | select + `const scopeCount = …` |
| `apps/backend/routes/api/applications/application-listing-handlers.js:114-115` | spreads it into the fee context |
| `apps/backend/services/checkout/stripe-checkout-service.js:98` | into the fee context |
| `apps/backend/services/application-service/application-phase-invoice-methods.js:372-378` | parses it into `scopeCount` |
| `apps/backend/routes/api/preview/preview.js:122`, `preview-utils.js:108,333` | into the fee context |
| `apps/backend/services/payment-service-phase-flow.js:105` | into the fee context |
| doc comment | `apps/backend/services/quotation-service.js:33,438,462,520` | already calls it "the canonical scope count" |

Tests (owned by others, listed for completeness — not edited):
`__tests__/unit/` — `stripe-checkout-engine.test.js:102`, `single-issuer-quotation-row.test.js:52`,
`single-issuer-frozen-quotation.test.js:120`, `single-issuer-end-to-end-figures.test.js:52,64`,
`renewal-single-charge-billing.test.js:48,140,162,194,197,245,269,272,275,280`,
`quotation-service.test.js:146,227,476`, `quotation-pdf-per-type.test.js:33`,
`preview-previewable-states.test.js:176,234,268,279,301,311`,
`preview-ownership-token-scope.test.js:132`, `phase-invoice-vat-split.test.js:318,401`,
`fee-service.test.js:53`, `checkout-renewal-price.test.js:61,79`;
`__tests__/integration/` — `quotation-accept-to-phase1-gate-flow.test.js:110`,
`phase-amount-canonical.test.js:164,252,293`.

Front end / e2e: `apps/web-app/e2e-phase0/helpers.ts:60,98-100`,
`s01-register-submit.spec.ts:345`, `s03-resubmit-approve.spec.ts:539`,
`apps/web-app/e2e-g4/g4-helpers.ts:73`, `e2e-g4/a01-register-and-wizard.spec.ts:289,291`.
**No `apps/web-app/src` file and no mobile-app file reads this column** — it never
reaches a UI component; it reaches the user only as a quantity on a quotation,
invoice and receipt PDF.

### Why `cultivationScopeCount` is the correct name

1. **The dead design is what the old name describes.** `totalAreaTypes` sits between
   `batchId` and `areaTypeIndex` (`application.prisma:52-54`) — a scheme where one
   submission fanned out into N sibling applications, one per area type, each knowing
   its index *i* of *n*. I searched every `.js/.ts/.tsx/.prisma` file: nothing writes
   `Application.batchId` or `areaTypeIndex` any more (every `batchId` hit is
   `HarvestBatch`/`Lot`). The name survived its design.
2. **Not `cultivationMethodCount`, even though that is what the resolver counts
   today.** The column is *allowed to disagree* with the current method list. Once a
   quotation is accepted, its scope count is the frozen price-of-record and gets
   written back over the column even though `formData.cultivationMethods` may have
   changed since (`payment-service-phase-flow.js:128-129`, `preview.js:145-146`;
   asserted at `__tests__/integration/phase-amount-canonical.test.js:293`). A column
   called "methodCount" would be lying again, the same way "areaTypes" lies now.
3. **"Scope" is the standard's word and the codebase's word.** GACP certification is
   granted over a ขอบข่าย — a scope. The billing vocabulary is already unanimous:
   `resolveCultivationScopeCount`, `fees.scopeCount`, `options.scopeCount`,
   `locked.scopeCount`, `taxScopeCount`. The column is the only place in the chain
   that uses a different word, and it is the wrong one.

Correct name: **`cultivationScopeCount`** — the proposal holds.

---

## 2. `Plot.area` + `Plot.areaUnit` → `areaSqm`

### The premise "the number is always sqm" is FALSE — this is the finding

`apps/backend/prisma/seed-gacp.js` wrote `area: 1, areaUnit: 'rai'` on **every seed
run**, and `farms.totalArea: 2, areaUnit: 'rai'`. That is *after* migration
`20260725190000_area_to_sqm` converted the stored rows and set the column defaults to
`'sqm'`. So every database seeded since then — demo, preview, CI — was born with
legacy-unit plots again. Reading those rows as square metres understates them by
×1,600: the exact failure this repo already fixed twice (plot-areaunit and
farm-areaunit, both 2026-08-20).

**Fixed in this pass** (`apps/backend/prisma/seed-gacp.js`, meaning-preserving:
2 rai → 3,200 sqm, 1 rai → 1,600 sqm, plus the two `console.log` labels). It was the
last writer of a legacy unit in the product, and removing it is what makes retiring
the unit column reachable at all. It does **not** repair rows already written — the
migration's backfill does that, by converting rather than copying.

Still writing `'rai'`, deliberately not touched: `apps/backend/scripts/update-health1-certified.js:112`.
That script is already dead — it creates a Farm with `userId`, `name` and
`subdistrict` (`:100-113`); the model has `ownerId`, `farmName` and `subDistrict`
(`farm.prisma:10,27,32`), so Prisma rejects it before it reaches the database.
Flagged, not edited: repairing dead code adds risk without removing any.

### Writers

| Site | Unit written |
|---|---|
| `apps/backend/services/planting-service.js:753-762` | `createPlotForFarm` accepts `areaUnit` **only to swallow it** (`areaUnit: _areaUnit`) and always writes `AREA_UNIT` |
| `apps/backend/routes/api/cultivation/plots.js:45,80-81` | passes the caller's `areaUnit` into the above, where it is discarded |
| `apps/backend/services/application-service/application-submission-methods.js:83-91` | `area: submittedAreaSqm(plot.areaSize, plot.areaUnit \|\| AREA_UNIT, …)`, `areaUnit: AREA_UNIT` |
| `apps/backend/services/certificate-service.js:781-786, 792-803` | converts, then writes `AREA_UNIT` (not mine to edit) |
| `apps/backend/prisma/seed-gacp.js:534-556` | **was `'rai'`; now `'sqm'`** |
| `apps/backend/prisma/backfill-plot-codes.js:62` | touches `plotCode` only |
| SCHEMA | `apps/backend/prisma/schema/farm.prisma:249-250` — `area Float` / `areaUnit String @default("sqm")` |
| DDL | `20260110020726_add_system_config/migration.sql:404-416` creates the table: `"area" DOUBLE PRECISION NOT NULL`, `"areaUnit" TEXT NOT NULL DEFAULT 'rai'` — the original default really was rai |
| DDL | `20260725190000_area_to_sqm/migration.sql:55-61, 82` converts the rows and moves the default to `'sqm'` |

### Readers (every one converts, then calls the result `areaSqm`)

| Site | Expression |
|---|---|
| `apps/backend/services/planting/planting-cycle-detail-loader.js:37-38, 98` | `areaSqm: roundSqm(storedAreaToSqm(assignment.plot.area, assignment.plot.areaUnit))` |
| `apps/backend/services/planting-cycle/harvest-capacity-operations.js:336, 356` | `const areaSqm = storedAreaToSqm(Number(plot.area \|\| 0), plot.areaUnit)` |
| `apps/backend/services/planting-service.js:213-214, 227, 376-377, 390, 488-489, 635-636` | `const maxSqm = storedAreaToSqm(plot.area, plot.areaUnit)` — the over-allocation guard |
| `apps/backend/services/certificate-service.js:181-194, 781-786, 801-802` | `submittedAreaSqm(row.area, row.areaUnit, …)` |
| `apps/backend/services/trace-service/resolve-plot-cycle.js:306` | selects `area, areaUnit` (`:210` explains it deliberately publishes the allocated area, not `Plot.area`) |
| `apps/web-app/src/app/health/planting/new/client-view.tsx:237` | `toSqm(plot.area, plot.areaUnit)` |
| `apps/web-app/src/app/health/planting/new/new-planting-cycle-plot-assignment.tsx:57, 103` | `const areaSqm = toSqm(plot.area, plot.areaUnit)` |
| `apps/web-app/src/app/health/planting/new/new-planting-cycle-submit.ts:64` | `const plotAreaSqm = toSqm(plot.area, plot.areaUnit)` |
| `apps/web-app/src/lib/services/planting-service.types.ts:47` | the API already returns `areaSqm: number` |

Readers of the *sibling* unit columns, out of scope for this rename but on the same
fault line: `Farm.areaUnit` (`certificate-service.js:403-411,570-577,693,740`,
`farm-service.js:236-240,286`), `PlantingCycle.areaUnit`
(`planting-service.js:305-306,403-404,455,983`), and
`trace-service/resolve-generic.js:145,258`, which **publishes the unit string to the
public trace page**.

Conversion tables that must stay in agreement: `apps/backend/shared/area-utils.js:40-53`,
`apps/web-app/src/lib/area.ts:82-93`, and the SQL in `20260725190000_area_to_sqm`
(now also in the new migration).

### Why `areaSqm` is the correct name

1. **A number whose meaning lives in another column is the defect, not the spelling.**
   `area-utils.js:1-23` records both times it went wrong: `Farm.areaUnit` unwritten on
   the certificate path so Prisma's `'rai'` default certified 1,600 m² as 1,600 rai;
   and two modules disagreeing about what an *absent* unit meant, making one row either
   1 m² or 1,600 m² depending on the reader. `areaSqm` cannot be separated from its unit.
2. **The codebase has already chosen the name.** Five read sites convert and
   immediately bind the result to `areaSqm`, and the API contract already exposes
   `areaSqm` (`planting-service.types.ts:47`). The column is the only thing still
   called `area`.
3. **`area-utils.js:21-23` states this as the destination**: "Once it has run
   everywhere, `LEGACY_UNIT_TO_SQM` and `storedAreaToSqm` can be deleted and callers
   can read `area` directly." The rename is the last step of a plan already written
   down, not a new idea.

Correct name: **`areaSqm`** — the proposal holds. Retiring `areaUnit` is correct
**as an end state**, but see below.

---

## 3. What is NOT safe to do in one pass

1. **Retiring `Plot.areaUnit` now.** Nobody can currently say "no non-sqm row exists",
   because the seed was manufacturing `rai` rows until today and the 2026-07-25
   migration deliberately skips units it cannot read. The gate is
   `SELECT count(*) FROM "plots" WHERE "areaSqm" IS NULL;` returning 0 — and I am not
   permitted to query the dataset, so **I make no claim about how many rows are
   affected.** Until someone runs that count, dropping the unit column converts an
   unknown number of plots by ×1/1600 silently.
2. **Editing the Prisma schema in the same pass as the migration.** Prisma selects
   every scalar field it knows about, so declaring `areaSqm` / `cultivationScopeCount`
   before the columns exist breaks every plot and application query in the running
   app. Schema and code switch must land *after* the operator applies the migration.
   This is why I edited no `.prisma` file.
3. **Switching readers over.** Same ordering constraint, plus ~40 call sites across
   backend, web app and tests — several in files held by other agents right now
   (`certificate-service.js`, `planting-service.js`, `__tests__`).
4. **The wizard's plot JSON.** `applications.formData` stores plots as
   `{ areaSize, areaUnit }` (`application-submission-methods.js:87`,
   `web-app/src/lib/area.ts:17-19`, `domain-types.ts:108,238`). That is document data
   inside a JSON column — no migration renames it, and the 2026-08-20 heal work
   already treats it as its own surface. It needs a separate decision.
5. **`Farm.areaUnit` and `PlantingCycle.areaUnit`.** The same argument applies to
   `Farm.totalArea`/`cultivationArea` and `PlantingCycle.plotArea`, and
   `resolve-generic.js:145,258` publishes the cycle's unit on the public trace page.
   Deliberately out of scope here; doing all four tables at once is how the ordering
   above gets skipped.

## 4. Order of operations

- **a.** Operator applies `20260826090000_area_sqm_and_cultivation_scope_expand`.
  Additive only; the app does not know the new columns exist, so nothing changes.
  No `migrations/CHANGELOG.md` entry needed (its rule exempts additive migrations);
  the contract migration will need one.
- **b.** Count `plots WHERE "areaSqm" IS NULL` and list their distinct `areaUnit`.
  Repair by hand. Do not widen the ratio table to make them disappear.
- **c.** Prisma schema + code switch, as its own PR.
- **d.** Contract: re-run both backfills (both are written to be idempotent and
  re-runnable), then drop `totalAreaTypes`, `area`, `areaUnit`, and make `areaSqm`
  NOT NULL.
