# Legacy Sweeper — Dead Code Inventory + Purge Manifest — 2026-08-16

Agent: legacy-sweeper (PROMPT-PAYMENT-REWORK.md §5, Wave 3 §4.2–4.3; `.claude/agents/legacy-sweeper.md`)
Mode: **read-only / FLAG-ONLY**. Nothing deleted or edited outside this file. Every claim below was
grep/read-verified fresh in this session — none carried over from memory or another agent's report
without independent re-check (a prior same-day report, `reports/legacy-sweeper/2026-08-16-payment-rail-inventory.md`,
exists; where it's cited below it was independently re-verified, and one of its headline claims was
found stale — see §8).

Status: **BLOCKED(operator:drain-complete needs production DATABASE_URL+psql)** for every item that
touches the live slip-payment path. Independently-dead items (not part of the slip runtime path) are
marked `PENDING` — ready for operator purge decision, not gated by the DB probe.

---

## 0. Probe evidence (real run, this session)

```
$ bash scripts/probes/drain-complete.sh
BLOCKED: needs DATABASE_URL + psql against the real DB — no vacuous pass
EXIT_CODE=2
```
`scripts/probes/probe-registry.txt:44` — probe is `manual`, operator-only ("ต้องต่อ DB production;
agent/CI ไม่มีสิทธิ์"). Confirmed wired into `scripts/check-done.sh:12` DEFAULT set.

**Structural finding — the probe cannot return 0 even after a real drain (see §2).** This is a
blocking prerequisite the operator needs to resolve before "drain-complete=0 → purge" is a workable
process at all, independent of actual slip usage.

---

## 1. Slip-upload path — full reachability inventory (backend + web-app + Flutter)

**Verdict: 100% live and reachable everywhere it exists. Nothing in this section is a purge
candidate today.** Mobile has no alternative payment path at all.

| Layer | Item | file:line | Reachability chain (adversarial check) |
|---|---|---|---|
| Backend route | `POST /payments/slip/upload` | `apps/backend/routes/api/finance/payment-slips.js:201` | mounted `routes/api/index.js:158`; actively maintained (Tier 16 SoD split comments, RD-UPLOADS-IDOR fix) |
| Backend route | `GET /payments/slip/pending` | `payment-slips.js:316` | same mount; provider review queue |
| Backend route | `GET /payments/slip/by-application/:id` | `payment-slips.js:346` | same mount |
| Backend route | `GET /payments/slip/:id/file` | `payment-slips.js:374` | same mount |
| Backend route | `POST /payments/slip/:id/approve` \| `/reject` | `payment-slips.js:460`, `557` | same mount; posts journal entries, triggers receipt auto-issue |
| Backend service | `services/payment-slip-service.js` | whole file | required by the route above; canonical PENDING→PAID engine |
| Backend service | `createPhase1Payment` | `services/payment-service-phase-flow.js:74-236` | called from `POST /payments/create`, `/payments/phase1/:id` — sole writer of `payment_transactions{gateway:'BANK_TRANSFER'}` |
| web-app UI | `/health/payments` page | `apps/web-app/src/app/health/payments/page.tsx` → `client-view.tsx` | linked from primary nav (`apps/web-app/src/lib/constants.ts:76`, sidebar item "การชำระเงิน") + 4 other pages (applications detail, documents, official-documents, not-found quick-link) |
| web-app UI | `SlipUploadModal` | `apps/web-app/src/app/health/payments/slip-upload-modal.tsx` | imported + rendered `client-view.tsx:25,710` — unconditional, **no flag gates it** (see §6) |
| web-app UI | `SlipHistorySection`, `TwoCardPaymentSection`, `PaymentInvoiceCard`, `QuotationReviewSection`, `RefundVisibilitySection` | `apps/web-app/src/components/payments/*.tsx` | all 5 confirmed imported by `client-view.tsx` or `TwoCardPaymentSection.tsx`; none orphaned |
| web-app UI (finance) | `slip-review-modal.tsx`, `slip-queue-summary-cards.tsx` | `apps/web-app/src/app/provider/accounting/` | imported by `accounting-dashboard-client.tsx:57,62` |
| Flutter | `PaymentScreen` + `PaymentService` | `apps/mobile-app/lib/presentation/features/application/screens/payment_screen.dart`, `.../services/payment_service.dart` | routed 3× — `lib/core/router/app_router.dart:185` (`:id/pay1`), `:192` (`:id/pay2`), `:227` (`/payments`) |
| Flutter | Stripe/checkout code | — | grepped all of `apps/mobile-app/lib` for `checkout\|Checkout\|stripe\|Stripe` — **0 matches**. Mobile's entire payment surface is slip. Cannot be purged until mobile ships a Stripe path or is retired by decision. |

---

## 2. Why `drain-complete` structurally cannot reach 0 (independently re-verified)

`scripts/probes/drain-complete.sh:6-7`:
```sql
SELECT count(*) FROM payment_transactions
WHERE gateway <> 'STRIPE' AND status NOT IN ('SUCCESS','FAILED','CANCELLED')
```
Repo-wide grep for every production write site touching the Prisma `paymentTransaction` model
(`grep -rn "prisma\.paymentTransaction\." apps/backend --include=*.js`, excluding tests) returns
**exactly two hits, both Stripe-side**:
- `apps/backend/services/checkout/stripe-checkout-service.js:216` — `.create()`
- `apps/backend/services/checkout/checkout-settlement-service.js:364` — `.update()` (→ `SUCCESS`)

The slip path's only writer, `payment-service-phase-flow.js:201-213`, creates the row
(`gateway:'BANK_TRANSFER', status:'PENDING'`) and **nothing ever updates it afterward** — confirmed
by reading `payment-slip-service.js` (the file that actually settles a slip via `approveSlip`,
`:1173-1180` updates `Invoice.status`, not `PaymentTransaction`) and by the exhaustive 2-hit grep
above. Every Phase-1 slip payment ever initiated, including ones fully paid/certified/closed months
ago, stays counted forever. The probe as written measures "cumulative slip payments ever started,"
not "orders still mid-flight" — it cannot reach 0 by design, regardless of real drain state.

**This is a prerequisite finding, not a purge item.** Before drain-complete can gate anything, the
operator needs to choose: (a) make slip approval/rejection also terminalize `payment_transactions`,
or (b) repoint the probe at a different signal (e.g. non-terminal `PaymentSlip.status`, or
`Invoice.status` joined on `paymentMethod='BANK_TRANSFER'`). Flag only — not an agent decision (probe
files are operator-owned, CLAUDE.md L6).

---

## 3. Gateway/config remnants — mostly already closed; one live sibling found

| Item | Status | Evidence |
|---|---|---|
| `GATEWAY_PROVIDER('MOCK_PROMPTPAY')` in `config/business-rules.js:180-181` | **Already removed** 2026-06-04 | comment-only now, 0 code |
| Ksher gateway secrets in `config/secrets.js:164-166` | **Already removed** 2026-06-04 | comment-only now |
| `CONFIG.gateway.{publicKey,secretKey,webhookSecret}` in `modules/billing/internal/payment-constants.js:47-52` | **Already removed today** | comment dated `Removed 2026-08-16` in the file itself |
| Root `.env.local.example` / `.env.production.example` `PAYMENT_GATEWAY=MOCK/OMISE`, `PAYMENT_GATEWAY_PROVIDER=PROMPTPAY` | **Already fixed today** | commit `fbd04285` (2026-08-16, "docs(env): payment gateway = Stripe, not MOCK/OMISE/PROMPTPAY — kill the env-template confusion"); re-read fresh this session, both files now correctly document `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/`STRIPE_CHECKOUT_ENABLED`/`PAYMENT_ADAPTER`, no leftover `PAYMENT_GATEWAY=` assignment |
| **`PAYMENT_WEBHOOK_SECRET`** — required-in-production secret catalogued `config/secrets.js:167-172`, framed in `.env.production.example:83-84` as "Still required — inbound webhook HMAC verification" | **NEW finding — likely dead sibling** | `grep -rn "process\.env\.PAYMENT_WEBHOOK_SECRET" apps/backend` → **0 hits** anywhere. Broad HMAC sweep of `apps/backend` found no inbound-webhook verification logic consuming it (only unrelated JWT/PII/QR HMAC uses). Its evident former consumer (`payment-webhook-service.js::verifyWebhookSignature` / the pre-slip gateway webhook route) was already deleted in the Wave-0 purge. This is the exact class of dead-secret the operator just cleaned up in `payment-constants.js` today — this one slipped past that pass because the boot validator entry (`config/secrets.js`) is a different file. **REMOVAL-RISK: risky** — touches the production secret-presence validator (boot blocks if missing), so it's Tier C / operator-only regardless of the code being dead. |
| `PaymentTransaction.gateway` schema comment (`prisma/schema/billing.prisma:322`, `"STRIPE, PROMPTPAY, TRUEMONEY, etc."`) | Stale doc, not code | grepped for literal `'PROMPTPAY'`/`'TRUEMONEY'`/`'KSHER'` gateway values written anywhere — 0 matches. Only `'STRIPE'` and `'BANK_TRANSFER'` are ever written. Comment-only fix, zero risk. |

No other OMISE/PROMPTPAY/gateway-config siblings found (`grep -rniE "\bOMISE\b|\bTRUEMONEY\b|\bKSHER\b"` across `apps/web-app/src` + `apps/backend`, word-boundary — only historical comments remain).

---

## 4. Zero-caller dead code (independently verified, NOT part of the slip runtime path — not gated by drain-complete)

Every row grep-verified for **actual `require()`/import call sites**, not comment/string mentions —
two false leads from naive substring grep were caught and discarded during this sweep (a comment
referencing a filename, and a same-named-but-distinct local function shadowing an import); see §8 for
the methodology note.

| # | Item | file:line | Why dead (adversarial check) | Size | REMOVAL-RISK |
|---|---|---|---|---|---|
| 1 | `requirePermission` export | `apps/backend/middleware/role-middleware.js:137-159` (doc comment `:130-136` already says "effectively dead" — `req.user.hasPermission` is never populated, verified: 0 hits for `.hasPermission =` anywhere) | Checked every one of the 18 files that `require('.../role-middleware')` (prod + test) — all destructure `requireRole`/`adminOnly`/`providerOnly`/`financeOnly`/`auditorOnly`/`requireEffectivePermission`. **Zero** destructure `requirePermission`. (Two live finance routes use a same-named but distinct locally-defined `requirePermission` closure in `invoices.js`/`invoice-payment-handlers.js` — confirmed NOT the same function, false lead ruled out.) | 23 lines | safe |
| 2 | `PAYMENT_STATUS`, `PAYMENT_TYPES` exports | `apps/backend/modules/billing/internal/payment-constants.js:56-70` | Re-exported through `modules/billing/index.js:38` → `services/payment-constants.js` shim → `services/payment-service.js:38,173`. Traced every consumer of `payment-service.js` (`routes/api/finance/payments.js`, `services/invoice-service.js`) — neither destructures `PAYMENT_STATUS`/`PAYMENT_TYPES`. Grepped `PAYMENT_STATUS\.[A-Z_]*` and `PAYMENT_TYPES\.[A-Z_]*` repo-wide — 0 hits outside the definition file. Only reference: `modules-billing-barrel.test.js:40-41`, an object-identity check, not a behavior test. | 20 lines (of 85) | safe (values only — `CONFIG` in the same file IS live via `.invoiceExpiryMinutes`, do not touch that export) |
| 3 | `PAYMENT_METHODS` export (same file) | `payment-constants.js:73-78` | Same re-export chain as #2. Grepped `PAYMENT_METHODS\.[A-Z_]*` repo-wide — the only live hits are a **different, locally-defined** `PAYMENT_METHODS` in `daily-cash-report-service.js:57-60` (distinct enum, legitimately live, not this one — false lead ruled out). This shared one's values (CREDIT_CARD/BANK_TRANSFER/QR_CODE/PROMPTPAY) are never read by dotted access anywhere. | 6 lines | safe |
| 4 | `PAYMENT_METHODS`, `PAYMENT_STATUS`, `PAYMENT_TIMEOUT` sub-keys | `apps/backend/config/payment-fees.js:80-104` (inside the `PAYMENT_FEES` object) | `PAYMENT_FEES` itself has 4 live readers (`accounting-service.js:377`, `financial-export-service.js:188`, `journal-entry-service.js:249`, `split-payment-calculator.js:102`) but **only** for `.VAT_RATE`/phase-fee keys. Grepped `PAYMENT_FEES\.PAYMENT_METHODS\|PAYMENT_FEES\.PAYMENT_STATUS\|PAYMENT_FEES\.PAYMENT_TIMEOUT` repo-wide — 0 hits. Dup-source condition on the parent file already tracked as `AUDIT_LEDGER.md` L-002 (P1) / L-055 — this is a narrower, additional finding (dead sub-keys, not the dup-source itself). | ~25 lines | safe |
| 5 | `computePhaseBreakdown` function | `apps/backend/config/payment-fees.js:118-162` | 0 production callers. Only reference outside its own file: `__tests__/unit/split-payment-calculator.test.js:17` imports and calls it directly — not through any real call chain. | 45 lines | safe |
| 6 | `shared/status-machine.js` (DEPRECATED re-export shim) | `apps/backend/shared/status-machine.js` (whole file, 10 lines) | Its only requirer is `shared/transition-guard.js:10`. Checked `transition-guard.js`'s own consumers (`guardTransition` export) repo-wide — **0 hits** anywhere except its own definition and doc comment. History: `routes/api/finance/quotes.js:9-15` documents the WF-F1 fix (2026-05) that removed the quote flow's `writeApplicationStatus`/`guardTransition` call because it "ALWAYS threw InvalidTransitionError → HTTP 500" — that was the last real caller. Both files have been dead since. | 10 + 61 = 71 lines | safe (2-file chain; delete `transition-guard.js` first or together) |
| 7 | `shared/correction-round-stage.js` `CORRECTION_ROUND_STAGES` export | `:27` (declared), `:81` (exported) | Re-verified fresh this session (originally flagged `BACKLOG-FOUND.md:17`, 2026-08-03, marked non-blocking by a prior auditor — still true 2 weeks later). Repo-wide grep: 0 importers anywhere. | ~3 lines (export line) | safe |
| 8 | 4 disabled analytics routes, all hardwired `501` | `apps/backend/routes/api/system/analytics.js:257` (`/geography/certification-rate`), `:290` (`/trends/applications`), `:323` (`/trends/plant-types`); `apps/backend/routes/api/system/analytics-predictive-performance-routes.js:202` (`/performance/overview`) | Self-documented in-code since 2026-05-03 ("STALE SCHEMA — disabled", "Zero frontend callers verified via repo grep"). Independently re-verified this session: grepped all 4 exact route-path strings across `apps/web-app/src` and `apps/mobile-app/lib` — 0 hits in every case. Routes stay mounted (auth-gated), always return 501; the raw-SQL bodies reference tables/columns that no longer exist. | ~130 lines total (handler bodies, the disabled logic — not the whole file) | needs-drain-check — not a payment drain, but re-enabling is blocked on product sign-off per the routes' own comments; deleting outright (vs. re-implementing) is an operator call, not mechanical |
| 9 | `authenticateDTAM`, `authenticate` (bare alias for `authenticateHealth`), `authorize` | `apps/backend/middleware/auth-middleware.js:981-982` (aliases), `:983-999` (`authorize`) | Grepped every non-test file for `authenticateDTAM` — 0 hits (all 26 hits are test mocks). Grepped for bare `{ authenticate }` destructure from auth-middleware outside tests — 0 hits (one apparent hit in `analytics.js:341` is `authenticateAny: authenticate`, a local rename of a different export — false lead, ruled out). `.authorize(` outside tests — 0 hits; its only test (`auth-guard-allocation.test.js:125`) pins the deprecated alias's own behavior, doesn't exercise a real caller. | ~20 lines | needs-drain-check — 0 production callers but ~26 test files still mock/reference `authenticateDTAM`; removing requires touching those test doubles first (not itself risky, just non-trivial fan-out) |
| 10 | `apps/mobile-app/lib/presentation/features/auth/screens/login_screen_legacy.dart`, `register_screen_legacy.dart` | whole files | Already-gutted stubs: entire file content is `// Legacy file archived.\n// Content removed to prevent duplicate class definitions.` (2 lines each, no class, no logic). Grepped both filenames and any plausible class name across `apps/mobile-app/lib` — 0 importers. | 2 lines each | safe |
| 11 | `apps/backend/services/PAYMENT_SERVICES_README.md:24-35, 100-109` | doc file | Describes `payment-service-webhook-flow.js`, `payment-legacy-service.js`, `payment-webhook-service.js` as present-but-deprecated, and lists deleting them under "Future Plan." All three **do not exist on disk** (`ls apps/backend/services/payment*.js` → only `payment-constants.js`, `payment-service-phase-flow.js`, `payment-service.js`, `payment-slip-service.js`, `payment-utils.js`). They were already removed in the Wave-0 purge (`payment-service.js:11-18`'s own header correctly documents this). Only this standalone README is stale — actively describes files that don't exist, which is exactly the "confusion" class the operator asked to clear. | 109-line file, ~20 stale lines | safe — **doc-only, not gated by drain-complete or Tier C at all** |

---

## 5. Deprecated shims with LIVE callers — do not remove yet (migration incomplete)

| Item | file:line | Live callers (adversarial check) | Action needed before removal |
|---|---|---|---|
| `shared/workflow-state-machine.js` (DEPRECATED re-export) | whole file, 10 lines | `jobs/payment-closure-job.js:48`, `jobs/revision-deadline-checker.js:17` — both destructure `APPLICATION_STATUSES`, both are live cron jobs registered in `scheduler.js` (daily/hourly, confirmed running) | migrate both call sites to `require('../services/workflow-transition-service')` directly, then remove shim |
| `services/payment-constants.js` shim | whole file, 21 lines | exactly 1 caller: `services/payment-service.js:26-40` | migrate that one import to `require('../modules/billing')`, then remove shim (13 other files already import the barrel directly — this is the last straggler) |

---

## 6. Feature-flag findings

- **The flag PROMPT-PAYMENT-REWORK.md §4.2 specifies (`SLIP_UPLOAD_ENABLED`, meant to close slip UI for
  orders created after a cutoff timestamp) does not exist anywhere in code.** Grepped the whole repo —
  0 hits outside the design doc itself. What exists instead is `STRIPE_CHECKOUT_ENABLED` (backend,
  `config/stripe.js:38`) + `NEXT_PUBLIC_CHECKOUT_UI_ENABLED` (frontend, `checkout-mode.ts:42-44`), which
  only gate the **new** Stripe entry point — they never hide the slip-upload UI. Confirmed by reading
  `client-view.tsx:298,710`: `isCheckoutUiEnabled()` wraps only the new Stripe button block; the
  `SlipUploadModal` render at `:710` has no flag/cutoff condition at all. Backend-side, `payment-slip-service.js`
  and the `/upload` route have no cutoff/flag check either (grepped for `cutoff|CUTOFF|SLIP_UPLOAD_ENABLED` — 0
  hits). **Consequence: even if Stripe checkout is fully turned on, every applicant can still choose
  slip-upload with no restriction — the mechanism §4.2 depends on to ever start shrinking the drain
  count doesn't exist yet.** This blocks §4.2 more fundamentally than any dead-code item in this report.
- The Stripe checkout UI itself is **not implementation-complete**: `apps/web-app/package.json` has no
  `@stripe/*` dependency at all, and `checkout/client-view.tsx` (303 lines) has zero references to
  `PaymentElement`/`loadStripe`/`Elements`/any `@stripe` import — the "created" success state shows a
  fee breakdown and a "back to payments" button with no way to actually pay. This is why the flag stays
  off by default (`apps/web-app/Dockerfile:59`, `.env.local.example:61`, `.env.production.example`) —
  not itself dead code, but relevant context for why the drain hasn't started.
- `STRIPE_CHECKOUT_ENABLED` / `NEXT_PUBLIC_CHECKOUT_UI_ENABLED`: correctly a mid-rollout pair, not
  "stuck" — both branches are meaningfully live and intentionally off pending the above. Not a flag to
  flag.
- `PAYMENT_ADAPTER=stripe|mock` (`services/payment/payment-adapter.js:53-65`): legitimate test seam
  (mock adapter for E2E/QA without live keys), not dead, unrelated to the slip/Stripe drain.
- `POST /payments/phase2/:applicationId` (`routes/api/finance/payments.js:203-217`): intentional
  tombstone, not dead code — always returns HTTP 410 `PHASE_2_PAYMENT_DEPRECATED` since 2026-06-09, with
  a clear in-code history comment. A model for what a completed, clean deprecation looks like; cited
  here only as contrast, not a purge candidate.

---

## 7. Purge manifest (proposal only — NOT executed; no deletion commands issued)

Per PROMPT-PAYMENT-REWORK.md §1.7 / legacy-sweeper.md: **nothing below may be deleted before the
gating condition in its Status column is met, AND any actual purge is a separate PR labeled
DESTRUCTIVE for the operator to merge.**

| Item | file:line | Gated by drain-complete? | Status |
|---|---|---|---|
| Entire slip-upload path (§1) | see §1 table | **Yes — and currently unmeasurable** (§2) | BLOCKED(operator: fix probe/write-gap per §2, AND ship mobile Stripe path or retire mobile payment, AND build the missing §4.2 cutoff flag, before any drain timeline exists) |
| `requirePermission` (role-middleware.js:137-159) | not slip-runtime | No — 0 callers already, independent of slip drain | PENDING(operator: approve doc-free code removal) |
| `PAYMENT_STATUS`/`PAYMENT_TYPES`/`PAYMENT_METHODS` (modules/billing/internal/payment-constants.js:56-78) | not slip-runtime | No | PENDING(operator: approve) |
| `PAYMENT_METHODS`/`PAYMENT_STATUS`/`PAYMENT_TIMEOUT` sub-keys + `computePhaseBreakdown` (config/payment-fees.js) | not slip-runtime | No | PENDING(operator: approve — note overlap with open ledger items L-002/L-055 on the same file, coordinate) |
| `shared/status-machine.js` + `shared/transition-guard.js` | not slip-runtime | No | PENDING(operator: approve) |
| `CORRECTION_ROUND_STAGES` (shared/correction-round-stage.js:27,81) | not slip-runtime | No | PENDING(operator: approve — previously logged BACKLOG-FOUND.md:17, still open) |
| 4 disabled analytics routes | not slip-runtime, not payment | No | PENDING(operator: decide re-implement vs. delete — product sign-off question per the routes' own comments, not mechanical) |
| `authenticateDTAM`/`authenticate`/`authorize` aliases (auth-middleware.js:981-999) | not slip-runtime | No | PENDING(operator: approve — requires updating ~26 test mock files first) |
| Flutter `login_screen_legacy.dart` / `register_screen_legacy.dart` | not slip-runtime | No | PENDING(operator: approve — already-empty stub files) |
| `PAYMENT_SERVICES_README.md` stale sections | documentation only | No — not code at all | PENDING(operator: approve doc correction — lowest-risk item in this report) |
| `PAYMENT_WEBHOOK_SECRET` boot-required-secret entry (config/secrets.js:167-172) | not slip-runtime, but Tier C (secrets/boot validator) | No | PENDING(operator: confirm genuinely 0 consumers before touching — this one is Tier C regardless, agent must not propose a diff) |
| `shared/workflow-state-machine.js` shim | not slip-runtime | No — but has 2 live callers | BLOCKED(operator: migrate `payment-closure-job.js:48` + `revision-deadline-checker.js:17` to import `services/workflow-transition-service` directly first) |
| `services/payment-constants.js` shim | not slip-runtime | No — but has 1 live caller | BLOCKED(operator: migrate `payment-service.js:26-40` to `require('../modules/billing')` first) |

---

## 8. Notes on method + cross-check against the same-day prior report

- **Two false-positive traps caught and discarded this session** (documented so the pattern isn't
  re-triggered): (1) case-insensitive grep for `OMISE` matches every JavaScript `Promise` — re-ran
  case-sensitive/word-boundary; (2) plain-string grep for a filename matches **comments** that mention
  it, not just `require()` calls — every "0 callers" claim in §4 was re-checked with a `require\(['"].*name['"]\)`
  pattern before being accepted, and two local-variable/local-function name collisions
  (`requirePermission` redefined locally in `invoices.js`; `authenticate` as a local rename of
  `authenticateAny` in `analytics.js`) were caught this way.
- `reports/legacy-sweeper/2026-08-16-payment-rail-inventory.md` (same-day, different session) was read
  for context and several of its claims were independently re-derived and **confirmed** here (the
  `payment_transactions.status` structural gap in §2 above, the 3 already-deleted gateway-era files in
  §4-#11, the missing `@stripe/*` package, the 410 tombstone on phase2). Its headline finding #2 ("root
  env templates document the wrong gateway... 0 hits for STRIPE_* vars") was **independently found
  stale** — `git log` shows commit `fbd04285`, same day, already fixed exactly that; both root env
  files now read correctly. Flagging this discrepancy rather than silently preferring one report, per
  L1 (evidence over inherited claims) — the operator should treat that report's §2/§5-item-1 and §8
  proposed-order item 1 as already done, not outstanding.
