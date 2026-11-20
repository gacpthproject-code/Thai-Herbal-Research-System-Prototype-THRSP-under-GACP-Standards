# Payment Rail Inventory — slip (legacy) vs Stripe (current) — 2026-08-16

Operator context (2026-08-16): Phase 0 was built on the slip rail under the mistaken
belief it was the current line; the current line is the Stripe gateway, slip is
legacy and draining. This is a **flag-only inventory** — nothing was deleted or
edited outside this file. Scope: payment/checkout/billing/slip zone only.

All findings below were re-verified by grep/read in this session (no claim is
carried over from memory or another agent's report without independent re-check).

## Headline findings (read this first)

1. **The `drain-complete` probe cannot currently reach 0, structurally, regardless
   of real drain state.** Its SQL counts `payment_transactions` rows with
   `gateway <> 'STRIPE'` and a non-terminal `status`. The slip rail's only writer
   of that table (`payment-service-phase-flow.js:201-213`) stamps every Phase-1
   payment `gateway:'BANK_TRANSFER', status:'PENDING'` at initiation — and
   **nothing in the codebase ever updates that status afterward**. The function
   that actually settles a slip payment (`payment-slip-service.js` `approveSlip`,
   line 1173-1180) updates `Invoice.status`, never `PaymentTransaction`. See §4.
2. **Root env templates (`.env.local.example`, `.env.production.example`) document
   the wrong gateway entirely** — `PAYMENT_GATEWAY=MOCK`/`OMISE`,
   `PAYMENT_GATEWAY_PROVIDER=PROMPTPAY`, and frame `PAYMENT_WEBHOOK_SECRET` as
   "the" production webhook secret. None of `STRIPE_SECRET_KEY`,
   `STRIPE_WEBHOOK_SECRET`, `STRIPE_CHECKOUT_ENABLED`, `PAYMENT_ADAPTER` appear in
   either root template (grep-confirmed 0 hits) even though those are the vars
   the current rail actually reads. This is very likely the direct cause of the
   Phase-0 confusion operator is asking about. See §2.
3. Mobile app (`apps/mobile-app`) has **zero Stripe/checkout code anywhere** — its
   entire payment surface is the slip rail. Slip cannot be purged until mobile
   ships a Stripe path or is otherwise retired. See §1.4.
4. The operator brief's premise that `createPhase2Payment` is "kept, still
   exported + unit-tested but uncalled" is **stale** — it was fully removed in
   the Wave 0 purge (`c0a12195`, 2026-08-02). Only comments referencing its
   removal remain. See §3.

---

## 1. Two rails — routes / services / UI, CURRENT vs LEGACY

### 1.1 Backend routes

| item | file:line | class | flag/route | หมายเหตุ |
|---|---|---|---|---|
| `POST /payments/slip/upload` | `apps/backend/routes/api/finance/payment-slips.js:201` (mounted `routes/api/index.js:158`) | LEGACY (draining) | none, always on | mobile app's **only** payment-write path — see §1.4 |
| `GET /payments/slip/pending` | `payment-slips.js:316` | LEGACY | none | provider review queue (ACCOUNT_DTAM/ACCOUNT_PLATFORM/ADMIN) |
| `GET /payments/slip/by-application/:id` | `payment-slips.js:346` | LEGACY | none | |
| `GET /payments/slip/:id/file` | `payment-slips.js:374` | LEGACY | none | file header comment (`payment-slips.js:6`) documents a `GET /:id` route that **does not exist in code** — grep for `router.get('/:id'` returns 0 matches. Stale doc comment, not dead code. |
| `POST /payments/slip/:id/approve` | `payment-slips.js:460` | LEGACY | none | → `slipService.approveSlip` → `Invoice.status='paid'` (`payment-slip-service.js:1173-1180`) — does **not** touch `payment_transactions` (§4) |
| `POST /payments/slip/:id/reject` | `payment-slips.js:557` | LEGACY | none | |
| `POST /payments/create` | `routes/api/finance/payments.js:160` | LEGACY (Phase-1 canonical entry) | none | resolves phase, phase‑2 branch → 410 (below); phase‑1 → `createPhase1Payment` |
| `POST /payments/phase1/:applicationId` | `payments.js:298` | LEGACY | none | same writer as `/create`; mobile's sole Phase‑1 init call (`payment_service.dart` has no other) |
| `POST /payments/phase2/:applicationId` | `payments.js:388-396` | **DEAD (intentional tombstone)** | none | always `410 PHASE_2_PAYMENT_DEPRECATED` since 2026‑06‑09. Adversarial check: grepped `apps/backend/__tests__` for `/phase2`, `PAYMENT_PHASE2_CREATE_DEPRECATED` at the request level — **0 hits**. No request-level test would catch this tombstone being silently removed. |
| `POST /payments/checkout` | `payments.js:409-454` | **CURRENT (Stripe)** | `STRIPE_CHECKOUT_ENABLED` (§2) | 503 `STRIPE_CHECKOUT_DISABLED` when flag off. Adversarial check: grepped `__tests__` for a request-level hit on this route — **0 hits**; only service-level coverage (`__tests__/unit/stripe-checkout-engine.test.js`). |
| `POST /webhooks/stripe` | `routes/api/webhooks/stripe.js:35` (mounted `routes/api/index.js:162`) | **CURRENT (Stripe)** | none, always mounted | file comment (`stripe.js:23-24`) claims the route "refuses to register at all when STRIPE_WEBHOOK_SECRET is missing (fail-closed)" — **re-verified false this session**: `router.post('/stripe', ...)` at line 35 registers unconditionally; the secret is only read per-request inside `adapter.verifyWebhookSignature` (`stripe-adapter.js:68`). Independently matches an existing filed finding (`BACKLOG-FOUND.md:57`, 2026-08-04) — not new, but re-confirmed fresh. Comment-vs-code mismatch, not dead code. |

### 1.2 Backend services

| item | file:line | class | หมายเหตุ |
|---|---|---|---|
| `services/payment-slip-service.js` (~1300+ lines) | whole file | LEGACY, live | canonical slip PENDING→PAID engine. Confirmed **zero** references to `paymentTransaction`/`payment_transactions` anywhere in the file. |
| `createPhase1Payment` | `services/payment-service-phase-flow.js:74-236` | LEGACY, live | sole writer of slip-side `payment_transactions` rows (`gateway:'BANK_TRANSFER'`, line 201-213) |
| `services/payment-service.js` | whole file | LEGACY entry point, live | exports `CONFIG, PAYMENT_TYPES, PAYMENT_STATUS, PAYMENT_METHODS, createPhase1Payment, syncPhaseStatusesFromInvoices, getInvoiceSettlementsForApplication` (module.exports at `:169-184`) — clean, no dead exports. `createPhase2Payment` **fully removed**, confirmed by 0 definition matches repo-wide; only mentions are comments (`payments.js:22,207,384`) and a test comment confirming removal (`__tests__/unit/payment-phase-flow-canonical-totals.test.js:58`). |
| `services/checkout/stripe-checkout-service.js` | whole file | **CURRENT**, live | creates `CheckoutOrder` + `PaymentTransaction{gateway:'STRIPE'}` (`:216`) |
| `services/checkout/checkout-settlement-service.js` | whole file | **CURRENT**, live | the **only** code in the repo that ever moves a `payment_transactions` row to a terminal status (`:164`, `:263`, both `status:'SUCCESS'` on Stripe webhook confirm) |
| `services/checkout/checkout-schedule-service.js` | whole file | **CURRENT**, live | due-date/reminder scheduling for checkout milestones |
| `services/payment/payment-adapter.js`, `stripe-adapter.js`, `mock-payment-adapter.js` | whole files | **CURRENT** (adapter seam), live | `mock-payment-adapter.js` is an intentional QA/E2E double (header comment, `mock-payment-adapter.js:4-7`), selected only via `PAYMENT_ADAPTER=mock`; not dead. |
| `config/payment-fees.js` | whole file (164 lines) | **DEAD (mostly)**, survives Wave 0 | See §3 — partially trimmed by Wave 0 (102 lines removed per `c0a12195` diff stat) but file still exists (7715 bytes, confirmed on disk). Only `PAYMENT_FEES.VAT_RATE` has live readers; already tracked as a dup-source in `AUDIT_LEDGER.md` L-002/L-055 (not a new finding — corroborated fresh this session). |
| `modules/billing/internal/payment-constants.js` `CONFIG.gateway.{publicKey,secretKey,webhookSecret}` | `:52-56` | **DEAD**, new finding this session | fed by `PAYMENT_PUBLIC_KEY`/`PAYMENT_SECRET_KEY`/`PAYMENT_WEBHOOK_SECRET`. Grepped all of `apps/backend` for `.gateway.` / `CONFIG.gateway` — 0 readers. The adjacent comment ("`webhookSecret` is still consumed by `payment-service.verifyWebhookSignature`") is itself stale: that function does not exist anywhere in `payment-service.js` (0 matches for `function verifyWebhookSignature`). |
| `_generatePhase1Invoice` | `services/application-service/application-phase-invoice-methods.js:495` | LIVE, not dead | operator brief asked to check this. Confirmed called from `application-draft-query-methods.js:129` — reachable, not orphaned. |

### 1.3 web-app UI

| item | file:line | class | flag | หมายเหตุ |
|---|---|---|---|---|
| `/health/payments` (`page.tsx` + `client-view.tsx`) | `apps/web-app/src/app/health/payments/` | LEGACY (slip) UI, live | none | renders `SlipUploadModal` (imported `client-view.tsx:25`), `PaymentInvoiceCard`, `TwoCardPaymentSection`, `SlipHistorySection` — all confirmed live-imported, not dead |
| `/health/payments/checkout` (`page.tsx` + `client-view.tsx`) | `apps/web-app/src/app/health/payments/checkout/` | **CURRENT (Stripe) UI, INCOMPLETE** | `NEXT_PUBLIC_CHECKOUT_UI_ENABLED` | `page.tsx:34` calls `notFound()` when flag off; entry button on `/health/payments` only renders when flag true (`client-view.tsx:298`). F-GATEWAY-UI reconfirmed: the "created" success state (`checkout/client-view.tsx:182-244`) shows order + fee breakdown and a "back to payments" button — **no Payment Element, QR, or redirect anywhere in the 303-line file** (grepped `PaymentElement|loadStripe|Elements|window.location` — 0 hits), and `apps/web-app/package.json` has **no `@stripe/*` package installed at all**. Confirms INCOMPLETE, not merely unfinished-looking. |
| `/provider/accounting/slip-review-modal.tsx` + `slip-queue-summary-cards.tsx` | `apps/web-app/src/app/provider/accounting/` | LEGACY (slip) UI, live | none | imported by `accounting-dashboard-client.tsx:57,62` |

### 1.4 Flutter (`apps/mobile-app`)

| item | file:line | class | หมายเหตุ |
|---|---|---|---|
| `PaymentScreen` + `PaymentService` | `lib/presentation/features/application/screens/payment_screen.dart`, `.../services/payment_service.dart` | LEGACY (slip), **100% of mobile's payment surface** | routed 3× in `lib/core/router/app_router.dart:185,192,227`. `PaymentService` calls only `/applications/:id/quotations`, `/invoices/my`, `/payments/bank-accounts/active`, `/consent`, `/payments/slip/by-application/:id`, `/payments/slip/upload`. Grepped all of `apps/mobile-app/lib` for `checkout|Checkout|stripe|Stripe` — **0 matches**. Mobile cannot be part of a slip purge until it gets a Stripe path. |
| Two older Flutter payment stacks | (already deleted) | DEAD, already purged | Wave 0 (`c0a12195`, 2026-08-02) deleted `apps/mobile-app/lib/features/payment/{screens,providers,data}/*` and `lib/presentation/screens/payment_screen.dart` (173 lines) as zero-importer dead code — commit message confirms "both zero-importer Flutter payment stacks". No further action — already gone. |

---

## 2. Feature flags in the payment zone

| flag | default | who reads | gates | ควรลบเมื่อไหร่ |
|---|---|---|---|---|
| `STRIPE_CHECKOUT_ENABLED` | `"false"` (`apps/backend/.env.example:180`) | `config/stripe.js:34-36` → `payments.js:411` | `POST /payments/checkout` (503 when off) | **This is the drain-then-purge flag** (comment at `payments.js:405-407`: "the legacy slip surface... continues serving in-flight applications until they drain"). Do not remove until slip genuinely drains — but see §4, that state is currently unmeasurable. |
| `NEXT_PUBLIC_CHECKOUT_UI_ENABLED` | unset → false, exact `'true'` only, no trim/case-fold (`checkout-mode.ts:42-44`) | `checkout-mode.ts`, `checkout/page.tsx:34`, `health/payments/client-view.tsx:298` | renders `/health/payments/checkout` route + its entry button | same drain gate; additionally cannot be flipped on for real users yet regardless of drain state — the UI behind it is INCOMPLETE (§1.3) |
| `PAYMENT_ADAPTER` | `"stripe"` (`apps/backend/.env.example:181`; fails closed on unknown value, `config/stripe.js:67-68`) | `services/payment/payment-adapter.js:53-65` | selects `stripe-adapter.js` vs `mock-payment-adapter.js` | keep — legitimate test seam, unrelated to slip/Stripe drain |
| `PAYMENT_GATEWAY` (root `.env.local.example:53`, values `MOCK`/commented `OMISE`) | `MOCK` | **nobody** — grepped all of `apps/` (excl. node_modules) for `PAYMENT_GATEWAY` as a code read (not just string match) — 0 code readers | nothing | **STALE.** Pre-Stripe gateway generation template var. Prime suspect for the exact Phase‑0 confusion operator described. |
| `PAYMENT_GATEWAY_PROVIDER=PROMPTPAY` (commented) | `.env.production.example:89` | nobody found | nothing | STALE, same family as above |
| `PAYMENT_PUBLIC_KEY` / `PAYMENT_SECRET_KEY` / `PAYMENT_WEBHOOK_SECRET` | root `.env.local.example:54-56`; `PAYMENT_WEBHOOK_SECRET` also `required: 'production'` in `config/secrets.js:167-170` | `modules/billing/internal/payment-constants.js:52-56` defines `CONFIG.gateway.*` from these — **0 readers of `CONFIG.gateway.*` anywhere** (§1.2) | nothing currently | **STALE but load-bearing at boot**: `config/secrets.js` still requires `PAYMENT_WEBHOOK_SECRET` in production (blocks boot if unset per the validator) even though nothing verifies a signature against it. Root `.env.production.example:84-87` frames it as *the* "PAYMENT GATEWAY" section, "used to verify HMAC signature on incoming webhooks" — with **zero mention of `STRIPE_WEBHOOK_SECRET`** anywhere nearby or in the file. This exact confusion was already caught once operator-side: `BACKLOG-FOUND.md:75` (2026-08-05, `[C1-STRIPE]`) records the operator nearly pasting a real `whsec_...` into `PAYMENT_WEBHOOK_SECRET` instead of `STRIPE_WEBHOOK_SECRET`. Re-confirmed independently this session — not fixed since. |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | only in `apps/backend/.env.example:178-179` | `config/stripe.js:43-64` | Stripe checkout + webhook — the vars the **current** rail actually needs | Grepped root `.env.local.example` and `.env.production.example` for `STRIPE` — **0 hits in either file**. The production-critical vars for the current rail are undocumented at the root template level. |

---

## 3. Dead / incomplete code (beyond Wave 0)

- **Wave 0 purge** (`c0a12195`, 2026-08-02, PR #718) already removed 52 adversarially-confirmed dead payment artifacts: `services/payment-legacy-service.js` (45 lines), `services/payment-service-webhook-flow.js` (477 lines), `services/payment-webhook-service.js` (212 lines), two zero-importer Flutter payment stacks, `apps/web-app/.../quote-step.deprecated.tsx` (201 lines), and an orphan Prisma schema (`PaymentAudit`, `PaymentReconciliation`, `IssuerBankAccount` + 3 dead `Application` columns), among others (`git show --stat c0a12195`, 66 files touched). Confirmed via `git log --oneline -- apps/backend/config/payment-fees.js` that this same commit trimmed (not fully deleted) `config/payment-fees.js`.
- **`config/payment-fees.js`** — survives Wave 0, still 164 lines. Only `PAYMENT_FEES.VAT_RATE` is read in production code (4 call sites: `accounting-service.js:377`, `financial-export-service.js:188`, `journal-entry-service.js:249`, `split-payment-calculator.js:102` — all grep-confirmed fresh this session). `computePhaseBreakdown` (`:118-162`, 45 lines) has **0 production callers** — its only reference outside the file itself is its own test (`__tests__/unit/split-payment-calculator.test.js:17-55`), which calls it directly rather than through any real caller chain. This duplicate-fee-table condition is **already tracked**: `AUDIT_LEDGER.md` L-002 (P1, ratchet `dup [fee-table]`) and L-055 (P2, notes the probe actually reports 3 sources — `business-rules.js`, `payment-fees.js`, `modules/billing/internal/fee-service.js:23` — not 2). Not claiming this as new; flagging because `VAT_RATE`'s live-reader status directly matters for any purge decision on this file.
- **`CONFIG.gateway.{publicKey,secretKey,webhookSecret}`** (`payment-constants.js:52-56`) — new finding, see §1.2/§2.
- **`createPhase2Payment`** — fully removed, not merely orphaned; operator brief's premise is stale (§ headline #4).
- **F-GATEWAY-UI** — reconfirmed INCOMPLETE with stronger evidence (no stripe-js import, no `@stripe/*` dependency) — see §1.3.
- **Doc-comment mismatches found in-zone** (not dead code, but exactly the "confusion" class operator is worried about): `payment-slips.js:6` documents a `GET /:id` route that isn't implemented; `webhooks/stripe.js:23-24` documents fail-closed-at-boot behavior that isn't implemented (re-confirmation of `BACKLOG-FOUND.md:57`).

---

## 4. `drain-complete` probe — what it checks, and why it can't pass yet

`scripts/probes/drain-complete.sh:6-7`:
```sql
SELECT count(*) FROM payment_transactions
WHERE gateway <> 'STRIPE' AND status NOT IN ('SUCCESS','FAILED','CANCELLED')
```
Registered `manual`, operator-only, needs real `DATABASE_URL` + `psql` (`scripts/probes/probe-registry.txt:44`: "ต้องต่อ DB production; agent/CI ไม่มีสิทธิ์"). It **is** wired into `scripts/check-done.sh:12`'s `DEFAULT` probe set (confirmed by reading the file fresh this session), so every routine run attempts it and reports `blocked` (per the script's own `blocked "needs DATABASE_URL..."` branch) in any agent/CI context — that part is working as designed, fail-safe, not a bug.

The bug is upstream of the query, in what writes the table it reads:

- `payment_transactions.gateway` comment (`prisma/schema/billing.prisma:322`) says `"STRIPE, PROMPTPAY, TRUEMONEY, etc."` — but grepped all of `apps/backend` for any `gateway: 'PROMPTPAY'` / `'TRUEMONEY'` / `'KSHER'` literal — **0 matches**. Only two gateway values are ever actually written: `'STRIPE'` (`stripe-checkout-service.js`) and `'BANK_TRANSFER'` (`payment-service-phase-flow.js:205`, the slip rail).
- The **only** writer of a `'BANK_TRANSFER'` row is `createPhase1Payment` (`payment-service-phase-flow.js:201-213`), called from `POST /payments/create` and `POST /payments/phase1/:applicationId` — every time an applicant starts a Phase-1 payment. It is created `status:'PENDING'`.
- The **only** code that ever moves a `payment_transactions.status` to a terminal value is `checkout-settlement-service.js:164,263` (`status:'SUCCESS'`) — exclusively on the Stripe webhook settlement path.
- `payment-slip-service.js` — the file that actually settles a slip payment (`approveSlip`, updates `Invoice.status='paid'` at `:1173-1180`) — was grepped in full for `paymentTransaction`/`payment_transactions`: **0 matches**. It never touches this table.

**Consequence**: every `BANK_TRANSFER` row created since this code path existed stays `status:'PENDING'` forever, whether or not the underlying application was fully paid, certified, and closed months ago. The probe's count is the **cumulative historical count of every Phase-1 slip-flow payment ever initiated**, not "applications still mid-flight on the slip rail." Under the current code, this number can only grow, never reach 0 — so `drain-complete` cannot function as the go/no-go signal for purging the slip rail, independent of whether slip usage has actually stopped. This needs an operator decision before "run drain-complete, purge at 0" is a workable process — options (not implemented, flag only): (a) make `payment-slip-service.js` update `payment_transactions.status` on approve/reject, or (b) point the probe at a different signal (e.g. non-terminal `PaymentSlip.status` count, or `Invoice.status` joined to `paymentMethod='BANK_TRANSFER'`).

---

## 5. Proposed cleanup order (proposal only — not executed)

1. Rewrite root `.env.local.example` / `.env.production.example` to carry `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_CHECKOUT_ENABLED` / `PAYMENT_ADAPTER` (matching `apps/backend/.env.example:178-181`) and drop `PAYMENT_GATEWAY`/`OMISE`/`PAYMENT_GATEWAY_PROVIDER`/`PAYMENT_PUBLIC_KEY`/`PAYMENT_SECRET_KEY`/`PAYMENT_WEBHOOK_SECRET`. Docs-only, Tier A, highest impact-to-effort for killing exactly the confusion operator named.
2. Remove `CONFIG.gateway.{publicKey,secretKey,webhookSecret}` from `payment-constants.js` and drop `PAYMENT_WEBHOOK_SECRET` from `config/secrets.js`'s production-required list (0 readers, confirmed). Touches the secrets catalog / boot validator → Tier C, operator merge.
3. Fix or remove the `webhooks/stripe.js:23-24` fail-closed-at-boot comment to match actual behavior.
4. **Before `drain-complete` can gate anything**: resolve the `payment-slip-service.js` ↔ `payment_transactions.status` disconnect (§4) — operator decision, not an agent edit.
5. Only after (4): slip-rail purge (`payment-slips.js`, `payment-slip-service.js`, mobile `PaymentScreen`) becomes evaluable against a real `drain-complete = 0`. Mobile also needs a Stripe path first, or an explicit decision to retire mobile payment separately.
6. `computePhaseBreakdown`/rest of `config/payment-fees.js` beyond `VAT_RATE` — removal already covered by open ledger items L-002/L-055; needs operator ratchet-baseline sign-off, not a fresh finding.

---

**Status: DONE(session grep/read verification, this session, apps/backend + apps/web-app + apps/mobile-app) — probe:drain-complete itself not run (needs operator prod DB access, out of agent permission per registry).**
No files outside this report were created, edited, or deleted.
