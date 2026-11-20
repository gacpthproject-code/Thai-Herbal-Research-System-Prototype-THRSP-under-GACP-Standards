# W9 — planting-flow-truth (B-PLANTING batch) — 2026-08-22

Branch `fix/planting-flow-truth` @ worktree `C:/Users/charo/Documents/GitHub/gacp-wt-planting`, from `main` 9e38a74a.
Status: **PENDING** — diff complete, all touched tests green, not committed/merged (operator decides commit + Tier per `tier-check.sh`).

## Item 1 — No frontend certificate gate on /health/planting (#81 / B4)
Verified: `apps/web-app/src/app/health/planting/layout.tsx` was a 5-line pass-through (confirmed on worktree HEAD).
Change: `layout.tsx` now renders a new client component `planting-cert-gate.tsx` (`PlantingCertGate`), which reuses the
SAME rule/hook the tile-home lock uses — `useNavChips({ chips: false })` → `hasActiveCert`/`certsLoaded`
(`getCertBadgeKind(...) !== 'expired'`, `cert-status.ts`). Locked only when `certsLoaded && !hasActiveCert` (fails
OPEN while unknown/errored, matching `isTileLocked()` in `home/client-view.tsx` and the bottom-nav lock in
`dashboard-layout.tsx`). Locked state shows Thai copy stating cause ("ยังไม่มีใบรับรอง GACP ที่ใช้งานได้") + next
action, with links to `/health/status` (สถานะ) and `/health/home`. `layout.tsx` itself stays a server component
(keeps `export const dynamic = 'force-dynamic'`); the gate logic lives client-side because it needs
`NavCertLockContext`. Server-side enforcement in `planting-service.js` is untouched.
RED/GREEN: `apps/web-app/src/app/health/planting/__tests__/planting-cert-gate.test.tsx` — 5 tests (pending→open,
active-cert→open, no-cert→locked+copy+link, expired-cert→locked, fetch-error→open/fail-open). RED = module not
found; GREEN after implementation.

## Item 2 — Retired per-plant UI still present (#82 / B2, R8)
Verified all 5 "ดูรายต้น" locations + trigger + card at current lines (shifted slightly from backlog citation):
`...overview-plots.tsx:217-227,271-281`, `...section-b.tsx:271-282,309-319`, `...section-a-units.tsx:194-204`,
`client-view.tsx:433-435` (trigger) + `:444-463` (ternary incl. upgrade card).
Change: removed all 5 buttons (kept sibling "เปิด Trace"/"Batch ล่าสุด"/QR actions); removed the "ทะเบียนรายต้น" tab
trigger and the entire units-tab ternary (both the gated `SectionAUnits` render and the "เร็ว ๆ นี้" upgrade card) —
`hasCapability('advancedPlantTrace')` is hardcoded false, so this content was already unreachable via UI but still
reachable via `?tab=units` in the URL; removed `'units'` from `TABS` (`planting-cycle-detail-page-config.ts`) so that
URL param now falls back to `overview` instead of a blank/orphaned pane. Cleaned up now-unused imports/props
(`hasCapability`, `useFeatureFlag`/`plantUnitEnabled`, `Sparkles`, `PlantingCycleDetailTabsSectionAUnits`,
`setSelectedCyclePlotId`/`setUnitsPage`/`setActiveTab` where they became dead). Did NOT touch
`planting-cycle-detail-tabs-section-a-units.tsx`'s existence, backend PlantUnit fields, or the 3 harvest gates
(per instruction — R8 explicitly defers that deletion to legacy-sweeper).
RED/GREEN: 3 new test files — `overview-plots-no-per-plant-ui.test.tsx`, `section-b-no-per-plant-ui.test.tsx`
(render + assert button absence/sibling presence), `client-view-no-units-tab.test.ts` (source-regression pattern,
matching this repo's own convention in `renewal-payment-pending.test.tsx` for heavy client-views + a TABS pin).
All RED before the edit (button text found / trigger+card found / TABS included 'units'), GREEN after.

## Item 3 — Plant count read from plantUnit.count instead of plannedPlantCount (#85 / 01-B2, R8)
Verified: `resolve-plot-cycle.js` (~186-193) built `plantUnits.total` from `prisma.plantUnit.count(...)`.
Note: cultivation.prisma:97 `plannedPlantCount` belongs to `PlantingCyclePlot` (the per-plot assignment), already
read into this SAME response as `plot.plannedPlantCount` — there is no separate cycle-level field by that name.
Change: `plantUnits.total` now reads `assignment.plannedPlantCount` (same value as `plot.plannedPlantCount`);
dropped the now-unused `prisma.plantUnit.count` query. Response shape unchanged (same key).
RED/GREEN: `apps/backend/__tests__/unit/trace-plot-cycle-plant-count-ssot.test.js` — pins `plantUnits.total === 120`
(planned) with zero PlantUnit rows, and unchanged even when PlantUnit rows exist. RED (got 0/40) → GREEN (120).

## Item 4 — Public trace search cannot resolve a plot-cycle QR (#84 / B3)
Verified: `resolve-generic.js` cascades PlantingCycle → HarvestBatch → Lot → 404 only; PLANTING_CYCLE_PLOT appears
only in a comment (~line 57), never resolved. The public search page (`trace/client-view.tsx`) always navigates to
`/trace/<code>` → generic resolver; only a real QR-scan URL (`/trace/plot-cycle/<code>`) hits the dedicated
`resolveTraceByPlotCycleQr`/`/api/trace/plot-cycle/:qrCode` route.
Change: `resolve-generic.js` now falls back to `resolveTraceByPlotCycleQr(qrCode, ctx)` (imported from the sibling
module — no circular require) after Lot also misses, returning that result whenever it is not itself a 404 — i.e.
the SAME projection a QR scan gets, not a re-derived copy. True not-found still returns the original generic 404
body (disclaimers/referrals intact). R9 exposure (existence + lab name only) is unchanged — no new fields added.
RED/GREEN: `trace-generic-resolves-plot-cycle-fallback.test.js` — plot-cycle code via generic resolver → 200
`type: 'PLOT_CYCLE'` (RED: 404 → GREEN); unmatched code still 404s with full generic body (regression guard).

## Item 5 — "Duplicated" plot tables (B8)
Verified both tables (`overview-plots.tsx` "plots" tab vs `section-b.tsx` "trace" tab): same row identity
(`perPlotProgress`/`traceDrillDownRows`, 1:1 via `usePlantingCycleTraceRows`) and the same QR map, but NOT the same
content — table 2 carries harvest/lot drill-down columns (`latestBatchUrl`, `latestLots`, lot count) table 1 has
none of, while table 1 carries area/target-count columns table 2 lacks. **Skipped: not collapsed.** They serve
different tasks (plot/QR setup vs. harvest traceability) in two different tabs; 00-CONSOLIDATED.md itself scopes
B8's collapse into the W2-1 implementation plan (6-tab→3-tab restructuring), not this cleanup batch.

## Test / gate summary
- Web: `jest src/app/health/planting src/app/trace` = 74/74 pass; certificates/home/bottom-nav = 34/34 pass.
- Backend: ran all 31 unit tests under `__tests__/unit/*{trace,certificate,planting}*` = 234/242 pass (30/32
  suites). The 2 failing suites (`certificate-farm-resolution.test.js`, `certificate-issuance-holder-wiring.test.js`,
  8 tests, `NO_ONSITE_AUDIT` from `onsite-evidence-gate.js:77`) are PRE-EXISTING RED on `main`, unrelated to this
  batch (no file either touches is in this diff) — tracked as backlog item #1 (Batch B-REDSUITES), not introduced
  here. New tests (`trace-plot-cycle-plant-count-ssot`, `trace-generic-resolves-plot-cycle-fallback`) and existing
  `trace-generic-pii-redaction`/`trace-generic-lab-privacy`/`trace-resolve-legacy-batch-number-format` all pass.
- `npx tsc --noEmit -p apps/web-app/tsconfig.json` = 62 lines, all in `e2e-phase0/*.spec.ts` (unchanged baseline,
  0 new).
- `eslint` clean on every touched file (web + backend).
- `scripts/probes/ratchet.sh` (BACKEND=apps/backend): PASS, hardcode=36 todo=56 env-direct=122 dup-source=2 —
  matches current baseline exactly, no increase.

## Files changed (not committed)
Modified: `apps/backend/services/trace-service/resolve-generic.js`, `resolve-plot-cycle.js`;
`apps/web-app/src/app/health/planting/layout.tsx`,
`.../[id]/client-view.tsx`, `.../[id]/planting-cycle-detail-page-config.ts`,
`.../[id]/planting-cycle-detail-tabs-section-a-overview-plots.tsx`,
`.../[id]/planting-cycle-detail-tabs-section-a-units.tsx`, `.../[id]/planting-cycle-detail-tabs-section-b.tsx`.
New: `apps/web-app/src/app/health/planting/planting-cert-gate.tsx` + 5 new test files (web: `planting-cert-gate`,
`overview-plots-no-per-plant-ui`, `section-b-no-per-plant-ui`, `client-view-no-units-tab`; backend:
`trace-plot-cycle-plant-count-ssot`, `trace-generic-resolves-plot-cycle-fallback`).

## Intended commit messages
1. `fix(planting): gate /health/planting layout on the same cert-lock rule as the tile`
2. `fix(planting): remove retired per-plant UI (buttons, units tab, upgrade card)`
3. `fix(trace): plot-cycle plant count reads plannedPlantCount, not PlantUnit rows`
4. `fix(trace): public search resolves plot-cycle codes via the same resolver a QR scan uses`

## Concerns for operator
- Tier: all 4 changes touch `services/trace-service/*` or `planting/*` — confirm via `tier-check.sh` before merge
  (design doc R1-R9 implies Tier B; none touch money/auth/schema/migration).
- Item 5 explicitly left open pending the W2-1 plan (per 00-CONSOLIDATED.md Wave 2 sequencing) — not a defect in
  this batch, a scope boundary.
