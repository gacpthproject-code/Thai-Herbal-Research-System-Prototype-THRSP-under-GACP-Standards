# L-001 — holiday calendar SSOT collapse (PLAN)

## Survivor (the ONE source)
`apps/backend/utils/working-days.js`
- Owns `RECURRING_HOLIDAYS` (`:42`) + `EXTRA_HOLIDAYS_BY_YEAR` (`:64`), Asia/Bangkok (ICT) evaluation.
- 14 non-test callers (e.g. `services/car-deadline-service.js:19`, `services/checkout/checkout-schedule-service.js:21`,
  `services/audit-scheduling-service.js:44`, `services/waiver-reopen-service.js:34`,
  `jobs/waiver-sla-escalation-job.js:24`, `jobs/revision-deadline-checker.js:16`,
  `jobs/payment-reminder-job.js:35`, `routes/api/helpers/application-payload-builders.js:30`,
  `routes/api/provider/handlers/workflow-handler-deps.js:38`).
- **NOT TOUCHED.** Zero edits to the holiday tables or to any working-days formula.

## Source removed (the duplicate)
`apps/backend/services/working-days-service.js` — `loadHolidaySet()` (`:41-82`) builds a *second*
holiday calendar at runtime from:
  - env `TH_PUBLIC_HOLIDAYS` (`:44`) — `process.env` read
  - `prisma.systemConfig` row `public_holidays_th` (`:57-59`)
Neither source is seeded anywhere in the repo (grep for both tokens hits only this file +
`AUDIT_LEDGER.md` + audit docs) — i.e. the Set is empty in every environment built from this repo,
**with the state of the staging DB / env not yet verified** (operator check pending — L-001 F1).
A hand-set `system_configs.public_holidays_th` row or `TH_PUBLIC_HOLIDAYS` var on a deployed system
would mean that environment WAS holiday-aware on these two endpoints, and this change alters it.
`normalizeHolidayEntries()` (`:30-39`) exists only to feed it.

Removed: `loadHolidaySet`, `normalizeHolidayEntries`, `asArray`, `asObject` (the last two are used
only by the two removed functions).

## Kept byte-identical (non-goal: no formula change)
`toDate`, `toDateKey`, `isWeekend`, `isWorkingDay`, `addWorkingDays`, `countWorkingDays` in
`services/working-days-service.js` — same signatures, same arithmetic. The `holidaySet` parameter
stays (callers may still inject a Set); only the removed *loader* stops manufacturing one.

## Callers updated (drop the removed import only)
- `apps/backend/routes/api/system/system.js:4-8, 44, 50, 57, 64, 71` — `/api/system/working-days`
- `apps/backend/routes/api/system/cron.js:4-7, 92, 128, 169` — `/api/cron/auto-cancel`
Both previously passed `await loadHolidaySet(prisma)` — always an empty Set in a repo-built
environment — into arithmetic whose default for that parameter is already `new Set()`.

## Comment refresh (stale after the removal)
`apps/backend/routes/api/provider/handlers/workflow-handler-deps.js:25-37` — the Blocker F note names
`loadHolidaySet` and `TH_PUBLIC_HOLIDAYS`, APIs that no longer exist. Rationale preserved verbatim in
substance; only the dead API names are updated. This file is the 3rd `grep` hit behind
ratchet `dup-source[holiday-calendar]` even though it defines no calendar.

## Non-goals (explicitly NOT done)
- No change to `RECURRING_HOLIDAYS` / `EXTRA_HOLIDAYS_BY_YEAR` contents.
- No change to any working-days formula, signature, or rounding.
- No re-pointing of `/api/system/working-days` or `/api/cron/auto-cancel` onto the canonical ICT
  engine (that changes returned numbers — a fix, not a dedup). Logged in `BACKLOG-FOUND.md`.
- No touch to payment / auth / schema / migration / operator-owned files.

## Verification
1. `bash scripts/probes/holiday-single-source.sh` FAIL -> PASS
2. `bash scripts/probes/ratchet.sh` — no counter above baseline; `dup-source` must go DOWN
3. `LOCAL_GATE_FULL=1 bash scripts/ci/local-gate.sh` exit 0
