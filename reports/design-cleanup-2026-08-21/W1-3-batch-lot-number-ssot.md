## W1-3 — batch/lot identifier SSOT — 2026-08-22
Status: DONE(probe: jest __tests__/unit/{harvest-identifiers-ssot,certificate-service-batch-number-format,trace-resolve-legacy-batch-number-format}.test.js + 19 related suites; ratchet.sh)

### Generators found (before)
| # | File:line | Prefix | Mechanism | Live caller? |
|---|---|---|---|---|
| 1 | `certificate-service.js:852` | `LOT-` | hardcoded `-001` tail | YES — cert auto-issue |
| 2 | `harvest-service.js:103` (`createBatch`) | `LOT-` | `count()+1` (racy) | NO — 0 callers anywhere in repo |
| 3 | `harvest-service.js:264` (`_buildBatchNumberFromSequence`) | `BATCH-` | `harvest_batch_number_seq` (safe) | YES — `POST /cultivation/harvest-batches` |
| 4 | `traceability-service.js:369` (`buildBatchNumber`) | `BATCH-` | `count()+1` (racy) | NO — feeds only `auto-first-cycle-trace.js`, itself 0 runtime callers (per its own test file's comment) |
| 5 | `planting-cycle-service.js:166` (`buildBatchNumber`) | `BATCH-` | `harvest_batch_number_seq` (safe) | YES — plot-capacity harvest route (`harvest-capacity-operations.js`) |

Lot-number duplication: `traceability-service.js:385` and `planting-cycle-service.js:144` defined
byte-for-byte identical `buildLotNumber(batchNumber, index)` (comment on the former literally said
"Kept in lockstep with planting-cycle-service.buildLotNumber").

### SSOT chosen and why
Promoted generator #5 (`planting-cycle-service.js` `buildBatchNumber`) — transaction-scoped
PostgreSQL sequence (`harvest_batch_number_seq`, migration `20260425100000_add_numbering_sequences`),
already the best/safest implementation and already live. Extracted verbatim into new module
`apps/backend/shared/harvest-identifiers.js`, alongside the also-duplicated `buildLotNumber`.
Every call site now imports from there instead of defining its own:
- `certificate-service.js` — line 852 rewritten to `await buildBatchNumber(client)`.
- `harvest-service.js` — `createBatch()` (dead code) and `_buildBatchNumberFromSequence()` both
  delegate to the SSOT instead of re-deriving.
- `traceability-service.js` / `planting-cycle-service.js` — local `buildBatchNumber`/`buildLotNumber`
  definitions deleted, re-exported from the SSOT import (all downstream deps-injection call sites —
  `harvest-capacity-operations.js`, `auto-first-cycle-trace.js` — unchanged).

### New format (documented in shared/harvest-identifiers.js header)
- `HarvestBatch.batchNumber` = `BATCH-{year}-{seq:06d}` e.g. `BATCH-2026-000123` (fallback
  `BATCH-{year}-{ts36}-{rand}` only if the sequence is unavailable). NEVER `LOT-`.
- `Lot.lotNumber` = `{batchNumber with BATCH→LOT}-{A..Z|NN}` e.g. `LOT-2026-000123-A`, derived from
  its parent batch — unchanged behaviour, still the correct "ชุดบรรจุ" prefix.

### RED → GREEN
- RED: `reports/design-cleanup-2026-08-21/W1-3-RED.txt` — new module missing;
  `certificate-service.js` minted `LOT-2569-FARM-001` (real hardcoded string, collides across calls).
- GREEN: `reports/design-cleanup-2026-08-21/W1-3-GREEN-full.txt` — 22 suites / 164 tests pass,
  including the 3 new W1-3 suites, `harvest-batch-number-race`, `lot-number-suffix-race`,
  `auto-trace-actor-identity-mask`, `interop-resolve`, `certificate-service`.

### Old-format resolution proof
`__tests__/unit/trace-resolve-legacy-batch-number-format.test.js` — a HarvestBatch stored with
`batchNumber: 'LOT-2569-A1B2-001'` (pre-fix shape) still resolves 200/`HARVEST_BATCH` via
`resolve-generic.js`'s exact-string `{ batchNumber: qrCode }` match — passed unchanged, before and
after the fix (characterization test; resolver never touched). Existing
`__tests__/unit/interop-resolve.test.js:224` already covered the same invariant on the
interoperability route.

### Guard added (operator-requested)
Extended `harvest-identifiers-ssot.test.js` with a static scan across `services/`, `routes/`,
`shared/` for any future `batchNumber = `/`: 'LOT-...'` literal — sanity-checked against the two
historical bug lines, then run for real: zero offenders.

### Tests updated vs preserved
- No existing test pinned the old `LOT-...-001`/`LOT-farmId-year-NNN` format as an intentional
  behavior spec (only `interop-resolve.test.js` used it, deliberately, as a legacy-resolution
  fixture — preserved unchanged).
- 3 new test files added (listed above); 0 existing tests edited.

### Ratchet / scope
`bash scripts/probes/ratchet.sh` → PASS, no counter above baseline (hardcode=36 todo=56
env-direct=122 dup-source=2 — unchanged from baseline; the fee-table dup is pre-existing/unrelated).
`certificate-service.js` diff is 2 hunks (import + the one batchNumber line + comment) — no other
issuance/evidence/signing logic touched.

Blocked: -
Next: superseded by fix round 1 below.
Evidence: reports/design-cleanup-2026-08-21/W1-3-RED.txt, W1-3-GREEN-full.txt; source at
apps/backend/shared/harvest-identifiers.js

---

## W1-3 fix round 1 — Gregorian-vs-Buddhist-Era year — 2026-08-22
Status: DONE(probe: jest 22 suites/168 tests + ratchet.sh — both re-run clean after the fix)

### Finding (review on commit a1c0bad7)
The initial SSOT minted `BATCH-${new Date().getFullYear()}-...` — Gregorian year (2026). This
system's identifier convention is Buddhist Era (BE): certificate numbers are
`GACP-TH-{BE year}-...` (certificate-service.js, `getFullYear() + 543`), and every batch row
minted before this SSOT existed is `LOT-{BE year}-...` (2569). A new `BATCH-2026-000001` next to a
`GACP-TH-2569-...` certificate and an old `LOT-2569-...` batch reintroduced exactly the
cross-labeling confusion this work item was ordered to eliminate. This was wrong in both format
branches of `buildBatchNumber` (the sequence path and the non-transactional fallback).

### Fix
- Added ONE exported helper, `thaiYear(date = new Date())` → `date.getFullYear() + 543`, in
  `apps/backend/shared/harvest-identifiers.js`. Both format branches of `buildBatchNumber` (sequence
  path and fallback) now call it instead of computing the year inline. `buildLotNumber` needed no
  change — it never computes a year of its own; it only re-derives whatever year is already present
  in its input `batchNumber` (BATCH→LOT prefix swap), so it is BE-consistent automatically once
  `buildBatchNumber` is.
- Documented the fallback format explicitly in the module header (FALLBACK FORMAT section): it
  triggers only when `nextval('harvest_batch_number_seq')` is unavailable/throws, and its shape
  (`BATCH-{BE year}-{ts36}-{rand}`) intentionally differs from the sequence shape
  (`BATCH-{BE year}-{seq:06d}`) because there is no sequence value to zero-pad — left as documented
  rather than made to conform, since the two mechanisms have different collision guarantees
  (sequence: guaranteed unique; fallback: statistical) and a visibly different shape makes a
  fallback-minted number auditable later.
- `certificate-service.js:342` and `:827` (certificate number and cycle-name year) both switched to
  the same `thaiYear()` helper — pure one-line substitutions in both spots (`import { thaiYear }`
  added to the existing `shared/harvest-identifiers` import; `new Date().getFullYear() + 543`
  replaced with `thaiYear()`; nothing else in either function touched, confirmed by a 2-hunk diff
  plus the import line). No ripple beyond the RHS expression at each site.

### Tests
- `harvest-identifiers-ssot.test.js`: added a `thaiYear` describe block (BE conversion off an
  explicit date; defaults to now via `jest.useFakeTimers`); added a test pinning that
  `buildBatchNumber` mints the BE year for a mocked `2026-03-10` system date
  (`BATCH-2569-000001`, asserted NOT to match `^BATCH-2026-`); updated the fallback test the same
  way; updated all `buildLotNumber` example fixtures from `BATCH-2026-...`/`LOT-2026-...` to
  `BATCH-2569-...`/`LOT-2569-...`; added one test proving `buildLotNumber` has no independent year
  logic (a Gregorian-shaped input passes through unchanged apart from the prefix swap). 12 tests
  total in this file (was 8).
  - One self-inflicted flake caught and fixed before commit: the first draft of the BE-conversion
    test used a UTC `'2025-12-31T23:59:59Z'` string, which under a positive-UTC-offset timezone
    (this machine, Asia/Bangkok = UTC+7) rolls over to 2026-01-01 local time — `.getFullYear()`
    legitimately returned 2026, not 2025. Not a `thaiYear()` bug; fixed by constructing the test
    dates from local (year, month, day, hour) components at midday instead of boundary-adjacent UTC
    timestamps.
- `certificate-service-batch-number-format.test.js`: unchanged — its regex (`/^BATCH-\d{4}-\d{6}$/`)
  already matched a 4-digit year of any epoch, so it required no edit and stayed green through the
  fix.
- `trace-resolve-legacy-batch-number-format.test.js`: unchanged, as required (legacy-resolution
  characterization test; already used a BE-year old-format fixture `LOT-2569-A1B2-001`).

### Re-verification
- `jest __tests__/unit/harvest-identifiers-ssot.test.js` → 12/12 pass
  (reports/design-cleanup-2026-08-21/W1-3-fix1-a.txt).
- Same 22 suites as the original W1-3 GREEN run → 22 suites / 168 tests pass
  (reports/design-cleanup-2026-08-21/W1-3-fix1-GREEN-full.txt).
- `bash scripts/probes/ratchet.sh` → PASS, counters unchanged (hardcode=36 todo=56 env-direct=122
  dup-source=2).
- `npx eslint` on all touched files → clean (no output).

Blocked: -
Next: none.
Evidence: reports/design-cleanup-2026-08-21/W1-3-fix1-a.txt, W1-3-fix1-GREEN-full.txt
