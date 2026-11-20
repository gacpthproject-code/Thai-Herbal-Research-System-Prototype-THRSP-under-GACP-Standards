# DTAM remittance removal plan — 2026-09-29
Read-only sweep, main @ 8368dfd4. Operator order 2026-09-11 "ถอดออกทั้งระบบ" — not yet done.
No file outside this report was touched. No batch was opened, no bank ref recorded (L3/§8 respected).

## Inventory (file:line — live consumer? — touches money rows?)
| Item | Location | Live caller | Money rows |
|---|---|---|---|
| Service | `services/checkout/dtam-remittance-service.js` (569L, 8 exports) | route + job require it | yes — writes `dtam_remittance_batches`, transitions `checkout_orders.dtam_remittance_status` |
| Route | `routes/api/finance/dtam-remittance.js`, mounted `routes/api/index.js:247` | ACCOUNT_DTAM/SYSTEM_ADMIN_DTAM callers only (no web-app page found — `grep -rn dtam-remittance apps/web-app/src` = 0 hits, no nav) | yes (POST batches/remit/reconcile) |
| Job | `jobs/dtam-remittance-batch-job.js`; registered `jobs/scheduler.js:283-305` (cron `0 2 1 * *` Asia/Bangkok, **live, unconditional**) | scheduler | yes — `openMonthlyBatches` inserts `DtamRemittanceBatch` rows monthly if any order is PENDING |
| Status vocab | `shared/dtam-remittance-status.js` | service + migration CHECK constraint mirror it | n/a |
| **Write path still firing today** | `services/checkout/checkout-settlement-service.js:318` sets `dtamRemittanceStatus: 'PENDING'` inside the settlement tx, on **every** settled order | live, every checkout settle | **yes — this is the still-running write** |
| Prisma model | `prisma/schema/billing.prisma:1240-1268` `DtamRemittanceBatch` → `dtam_remittance_batches`; `CheckoutOrder.dtamPayableAmount:1173`, `.dtamRemittanceStatus:1218`, `.remittanceBatchId:1219-1220`; `Organization.dtamRemittanceBatches` (`tenancy.prisma:135`) | — | yes |
| Migration | `20260802150000_wave1_checkout_engine_expand/migration.sql:17-18,43-129,184-189` — **rollback SQL already written in the comment** (`DROP CONSTRAINT`, `DROP TABLE`) | applied, frozen (APPLIED-IS-FROZEN.md) | yes |
| Error codes | `shared/error-codes.js:875-996` — 13 `REMITTANCE_*`/`DTAM_REMITTANCE_*` entries | route/service throw them | n/a |
| Accounting | `services/journal-accounts.js:43`, `chart-of-accounts-service.js:185-198` — account `2151-001 เจ้าหนี้ กรมการแพทย์แผนไทยฯ`, credited on settlement | **not remittance-batch specific — it's the underlying liability booking; distinct concern, see decision needed below** | yes |
| Tests | `__tests__/unit/dtam-remittance-{pipeline,route}.test.js`, `dtam-remittance-batch-job.test.js`, `scheduler-dtam-remittance-registration.test.js` (direct); mocks in `finance-tenant-wall`, `finance-write-guard-pin`, `finance-read-parity-notes-quotes`, `finance-fix1-hygiene` (indirect, must update not just delete) | — | — |
| Docs | `docs/operations/runbooks/dtam-remittance.md`, `GOALS.md:35` (G1 item 4 — marked `[x]` done, now reversed), `evidence/G1-item4-remittance/README.md` (historical, keep) | — | — |
| Fixtures | `scripts/reset-uat-data.js:61` truncates `dtamRemittanceBatch` | — | — |
| **Adjacent, NOT in scope** | `services/financial-export-service.js:232-274` `buildGovRemittanceReport` — a *different*, pre-one-fee GOV/PLATFORM revenue-split report over invoices, not `dtam_remittance_batches`. Likely dead post one-fee ruling but is a separate question — flagging only. | — | — |

## Answers
**(a) Does any code path still WRITE remittance rows today?** Yes, two: (1) every settlement sets `checkout_orders.dtam_remittance_status='PENDING'` (`checkout-settlement-service.js:318`); (2) the monthly cron job is registered and would INSERT `dtam_remittance_batches` rows on the 1st at 02:00 Bangkok if any order is PENDING. The manual route (open/remit/reconcile/dissolve) has no evidence of having ever been pressed — no web-app UI calls it — but it is reachable by any ACCOUNT_DTAM-role token.

**(b) Delete outright (code, pre-production, no history to preserve) vs. needs migration:**
- *Delete now* (Tier C — money path per L5/path-guard, operator merge): service, route + mount line, job + scheduler block, status-vocab file, 13 error-code entries, the four direct test files, the `dtamRemittanceStatus:'PENDING'` write in `checkout-settlement-service.js:318`, `reset-uat-data.js:61` line, the runbook, GOALS.md G1 item 4 line (governance-docs-follow-every-change).
- *Needs expand/contract migration* (separate DESTRUCTIVE PR, operator-run data check first, per L3/§8 "execute remittance" is an escalation trigger — reading counts is not): `DROP TABLE dtam_remittance_batches`; `DROP COLUMN checkout_orders.dtam_remittance_status, remittanceBatchId` + its FK/CHECK/indexes; drop the `Organization.dtamRemittanceBatches` relation and the two Prisma models. The rollback SQL is already drafted in the migration file's own comment (`20260802150000_...:17-18`).
- **Not the same thing, needs an explicit operator ruling**: `dtamPayableAmount` and the `2151-001` liability account. These book what the company owes DTAM under the principal treatment (operator 2026-09-05) — a real accounting fact independent of whether a batch-tracking UI exists. "ถอดออกทั้งระบบ" could mean drop the whole liability model too, or only the batch/oversight *pipeline*. Recommend keeping the liability booking and removing only the pipeline, but this is the operator's call, not the sweeper's.

**(c) `journalEntryId` TEXT-vs-UUID backlog item (BACKLOG-FOUND.md 2026-08-28):** moot if the table is dropped — no `ALTER COLUMN` fix needed, close the backlog line as superseded once the contract migration lands.

## drain-complete note
`scripts/probes/drain-complete.sh` checks `payment_transactions WHERE gateway <> 'STRIPE'` (the legacy slip drain) — **unrelated table**, does not cover `dtam_remittance_batches`. No probe exists for this table's drain. Before PR3, run (read-only, not an agent-authored probe change): `SELECT count(*) FROM dtam_remittance_batches;` and `SELECT count(*), dtam_remittance_status FROM checkout_orders GROUP BY 2;` against staging (lqmvduxipfjygeitwufe) and demo (spbdkellhyndyexljuar) — both currently DB-unreachable from this session, so this is `PENDING`, not `DONE`.

## Proposed PR order
1. **PR1 — code removal** (Tier C, operator merge): stop the write in settlement, delete service/route/job/scheduler entry/status-vocab/error-codes, update the four indirect test files' mocks, update runbook + GOALS.md + BACKLOG-FOUND.md moot-note. Prisma schema/DB untouched (expand-before-contract).
2. **PR2 — data check** (report only, no code change): run the two counts above on staging+demo, publish results.
3. **PR3 — contract migration**, labeled `DESTRUCTIVE`, operator merges only: drop the columns/table/relation per PR2's result; if any row is non-null/non-empty, operator decides disposition first.

## Status
PENDING — inventory + manifest complete; no probe run in this session (DB unreachable), no code changed.
