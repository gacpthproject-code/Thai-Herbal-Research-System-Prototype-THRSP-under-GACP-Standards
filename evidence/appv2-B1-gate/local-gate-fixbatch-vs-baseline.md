# Full local gate — fix batch (F-WALK-03/01/05) vs B1 baseline — 2026-09-06

Run: `LOCAL_GATE_FULL=1 scripts/ci/local-gate.sh` at feat/fee-per-cultivation-type a012005f
(baseline: /home/ubuntu/backups/local-gate-b1.txt · compare: compare-gate-vs-baseline.sh)

## VERDICT: NO NEW FAILURES vs baseline — and strictly better
| | baseline | this run |
|---|---|---|
| probe FAIL | 5 | 5 (same names) |
| suites failed | 4 | **2** |
| tests failed | 8 | **4** |
| tests passing | 9,767 | **10,432** |

Fixed since baseline (by this batch's commits, verified in the sweep):
- `application-status-writer-cert-hook-evidence-gate.test.js` — all 3 cert-hook/evidence-gate
  cases now green (NO_ONSITE_AUDIT rollback, EVIDENCE_CAPTURE_UNAVAILABLE, control mint)
- `error-codes-catalog.test.js` — no drift between code and catalogue

Signing keys `apps/backend/keys/*.pem` mtime-identical before/after the run (1788623435).
Raw log: local-gate-fixbatch-2026-09-06.txt
