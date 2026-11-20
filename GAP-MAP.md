# GAP-MAP — Golden Path (round 1 WALK)

**Status:** first draft (WALK round — gaps logged, nothing fixed)
**Owner:** PM seat
**Source:** read-only research workflow 2026-08-04 (11 agents, file:line-verified; no code modified)
**Definition of "green hop" (mandate §2):** status flows + notification actually sent + authz actually enforced + audit log actually written. Miss any one = not green.

> This is the WALK deliverable: walk GP-1→10, record every gap, do **not** stop to
> fix. Operator sets HARDEN priority from here. Every claim carries file:line; a
> column that could not be proven from code is a gap, never a guess.

---

## 0. The one thing to read first — payment reality

> **Superseded (2026-10-06).** This section is the 2026-08-04 walk. The slip flow it calls live was removed (2026-09-11). Today the applicant pays through the payment gateway (PromptPay QR), the verified webhook settles the order, the system issues the receipt and moves the application on, and no person approves a payment. See `apps/backend/services/PAYMENT_SERVICES_README.md`.

The **Stripe PromptPay rail is backend-complete but front-end-unbuilt and double-flagged-off.** The live money path today is still the **manual bank-transfer slip flow, which has NO QR the mandate's Golden Path assumes.**

- Real Stripe SDK isolated in `services/payment/stripe-adapter.js` (fail-closed keys `config/stripe.js:43-52`, raw-body HMAC webhook verify `stripe-adapter.js:67-72`); mock seam via `PAYMENT_ADAPTER` (default `stripe`, unknown fails closed).
- Backend settle engine is real end-to-end: PaymentIntent → signed webhook → atomic settle → balanced GL → status advance, money equation holds by construction at 3 layers (`stripe-checkout-service.js:51-83`, DB CHECK `wave1 migration:62-67`, GL assert `journal-entry-service.js:579-590`, amount cross-check `checkout-settlement-service.js:116-125`).
- **But GP-3 renders no Stripe QR:** checkout UI stops at breakdown + "รอชำระเงิน" (`checkout/client-view.tsx:182-244`); `clientSecret` typed but never consumed; `apps/web-app/package.json` has **no `@stripe/stripe-js`**. The confirm step (Stripe Elements / `confirmPromptPayPayment`) — where the QR comes from — is **unbuilt.**
- **Doubly gated off:** `STRIPE_CHECKOUT_ENABLED` default `"false"` (`.env.example:180`) + `NEXT_PUBLIC_CHECKOUT_UI_ENABLED` fail-closed off (`checkout-mode.ts:42-44`). Neither flag is in `docker-compose.production.yml`.
- **PromptPay-only mandate not yet enforced:** `createCheckoutSession` still requests `paymentMethodTypes: ['promptpay','card']` (`stripe-checkout-service.js:241`).
- Legacy direct-to-bank EMVCo PromptPay QR is real+live, but the **PLATFORM bank account number is still a `PENDING` placeholder** (`invoice-issuers.js:403-404`) — finance must fill before any cutover.

**Implication for the WALK:** GP-3/GP-4/GP-6b cannot be walked "full" today without either (a) building the FE Stripe confirm step, or (b) driving settles via `PAYMENT_ADAPTER=mock` for E2E. C1 (Payment Wave 3-4) is the gap-closing work; the FE confirm step + PromptPay-only trim are its core.

---

## 1. GP↔real-status name map (from `services/workflow-transition-service.js`)

| Mandate name | Real enum(s) | Note |
|---|---|---|
| SUBMITTED | `SUBMITTED` | exists literally (`:19-21`) |
| PENDING_DOC_FEE | `PENDING_DOC_FEE` | exists literally (`:21`); exits → `PHASE_1_SLIP_UNDER_REVIEW` (slip) or `DOC_FEE_PAID` (Stripe direct, `:54`) |
| (paid, doc) | `DOC_FEE_PAID` | SYSTEM-only edge (`:164-171`) |
| ASSIGNED_FOR_REVIEW | `ASSIGNED_FOR_REVIEW` | scheduler edge |
| (approved) | `DOC_APPROVED` | reviewer approve; auto-chains → `PENDING_AUDIT_FEE` |
| REVISION_REQUESTED | `REVISION_REQUESTED` | ↔ `ASSIGNED_FOR_REVIEW` loop, **unlimited rounds** (`:200-203`); day-5 → `EXPIRED` |
| (audit fee due) | `PENDING_AUDIT_FEE` | invoice #2 = a **pair** `PHASE_2_STATE_FEE` + `PHASE_2_PLATFORM_FEE` |
| (paid, audit) | `AUDIT_FEE_PAID` | SYSTEM edge (`:171`) |
| AUDIT_CONFIRMED | `AUDIT_CONFIRMED` | scheduler edge (`:129-132`) |
| (PASS) | `AUDIT_PASSED` | **certificate + QR mint on THIS write**, not on CERTIFIED |
| CERTIFIED | `APPROVED → CERTIFIED` | two further MANUAL auditor edges; **nothing auto-advances to CERTIFIED** (`:141,149`) |

**Two mandate/code mismatches to decide (GP-8, GP-9):**
1. **GP-8:** the ISO/IEC 17065 §7.6 two-person `AUDIT_PASSED→APPROVED` gate was **deliberately removed** (product decision 2026-06-05, `workflow-transition-service.js:143-149`). One auditor's single PASS press = decision **and** certificate issuance. S6 is a human press (mandate satisfied), but the implied "S6 then separate certify" does not exist. Accepted risk — confirm it stays.
2. **GP-9:** certificate + QR exist from `AUDIT_PASSED`; `CERTIFIED` adds nothing and nothing forces the `AUDIT_PASSED→APPROVED→CERTIFIED` walk → status reports keyed on `CERTIFIED` **undercount issued certs**.

---

## 2. Per-hop gap table

Columns = the mandate's 4: **Code** (proven path) · **Notif** (real send?) · **Authz** (who, proven) · **Audit** (canonical row?). ✅ proven green · ⚠️ partial/at-risk · ❌ gap.

| Hop | Code | Notif | Authz | Audit | Top gaps (file:line) |
|---|---|---|---|---|---|
| GP-1a register | ✅ real Postgres write | ❌ no welcome/verify send | ✅ health portal | ⚠️ success only | failed reg writes no audit row (`health-auth-profile-handlers.js:79`) |
| GP-1b login | ✅ real cred check | ⚠️ email-OTP **log-only** if SMTP env absent (`email-service.js:30-31`) | ✅ authLimiter | — | 2FA "sent" is env-conditional |
| GP-1c submit→PENDING_DOC_FEE | ✅ (`applications.js:500`) | ❌ in-app row only; **code comment falsely claims email/SMS fanout** (`:759-762` vs `notification-service.js:310-360`) | ✅ health owner | ❌ **no canonical audit row** — `onAudit` omitted (`applications.js:652,682`); ADR-012 trail is only row-local JSON | `assertTransition` not enabled → illegal edges wouldn't throw |
| GP-1d attach docs | ✅ local disk (`applications.js:261`) | ❌ no receipt | ✅ | ❌ **no audit row for a PDPA-relevant upload/delete** | draft↔fraud-scan sync best-effort divergence (`:900-908`) |
| GP-2 mint invoice #1 | ⚠️ **applicant-triggered** (quotation-accept), not system-mint on live path; true system-mint lived only in the flag-dead `/api/wizard` door, deleted in R2 Task 10 (2026-10-03) | ❌ `INVOICE_RECEIVED` email is **dead code** (`application-draft-query-methods.js:127-136`) | ✅ | ❌ Phase-1 mint writes no audit row (`quotations.js:305-332`) | two parallel "invoice" concepts (Invoice rows vs `phase1InvoiceId`+PaymentTransaction) — don't treat `phase1InvoiceId` as a real FK |
| GP-3 PromptPay QR | ❌ **no Stripe QR rendered** (see §0) | ❌ no checkout-created notice | ⚠️ **no rate limiter** on `POST /api/payments/checkout` (`server.js:301-304`) | — | FE confirm step unbuilt; `['promptpay','card']` not trimmed; legacy PLATFORM bank acct `PENDING` |
| GP-4 webhook settle | ✅ backend real+atomic; money eq holds | ❌ **zero notifications** — farmer no "ชำระสำเร็จ", Account no funds-arrived (`sendApplicationStatusEmail` dead `email-service.js:215`) | ⚠️ no rate limiter on `/api/webhooks/stripe` | ❌ **no canonical audit row on the money-critical hop** (`checkout-settlement-service.js:216-228`) | **Account KPIs invisible:** Wallet A/B tiles filter `PHASE_*_STATE/PLATFORM_FEE`, so `CERTIFICATION_CHECKOUT` Stripe money matches neither (`accounting-service.js:260-277`); SoD misclassifies the mixed invoice wholly PLATFORM (`invoice-side.js:53-64`); **no provider UI for CheckoutOrder / dtamRemittance** (born PENDING, no screen to batch/remit); adapter/engine vocab drift (`checkout.session.completed` vs `payment_intent.*`, `payment-adapter.js:30` vs `checkout-settlement-service.js:248-296`) |
| GP-5a assign→approve | ✅ (`DOC_FEE_PAID→ASSIGNED_FOR_REVIEW→DOC_APPROVED`) | ❌ in-app only | ✅ scheduler/reviewer | ⚠️ **assignment bypasses status writer** (plain `prisma.update`, `application-provider-query-methods.js:164-178`) → no WorkActivity, no writer audit; `REVIEWER_ASSIGNED` audit is post-write best-effort, catch swallowed | no SLA on how long a case sits unassigned in `DOC_FEE_PAID` |
| GP-5b revision (5 biz days) | ✅ loop unlimited; 5-day SSOT `config/business-rules.js:121` | ⚠️ **sticky-return NOT sticky**: notifies first 5 reviewers `take:5` no orderBy (`application-review-revision-methods.js:156-160`); primary resubmit path notifies **no staff**; reminders exist **only behind external HTTP cron** (`/api/cron/auto-cancel`, needs `CRON_SECRET`) | ⚠️ `PUT /:id/revision` guarded by `authenticateAny` not strict health (`application-workflow-handlers.js:14`) | ❌ no audit row on resubmit / reject-revision / expiry (all omit `onAudit`) | **dual working-day SSOT** — reminder math uses legacy holiday-blind engine (`cron.js:4-7`) while deadlines stamped with canonical `utils/working-days.js`; terminal vocab split `EXPIRED` vs `FAILED`; lunar-holiday table ends 2027 |
| GP-6a mint invoice #2 | ✅ real pair mint | ❌ none | ✅ SYSTEM | ❌ no audit row for invoice creation | **mint failure swallowed** (non-fatal try/catch `workflow-side-effects.js:173-183`) → parked in `PENDING_AUDIT_FEE` with no payable invoice, no retry; dual-rail double-billing if Stripe flag on |
| GP-6b 2nd payment | (same rail as GP-3/4) | ❌ silent on Stripe settle | ⚠️ **`PAYMENT_ADAPTER=mock` has no `NODE_ENV` guard** (`config/stripe.js:67-69`) → prod-shaped env could accept fixed public mock-key webhooks | ❌ no audit row on 2nd settle | slip upload doesn't cross-check declared phase vs invoice serviceType (`payment-slip-service.js:536-599`) |
| GP-7 schedule→AUDIT_CONFIRMED | ⚠️ **THREE live status writers** (corrected 2026-08-06 — the 4th was a miscount, see `evidence/A0-AUDIT-EMISSION/design-decision.md` A1/A2; adds `audit-scheduling-service.js:540` missed by round 1), cap on only ONE | ⚠️ auditor notified in-app English only; path 1 doesn't notify auditor at all | ⚠️ `/api/provider/scheduler/audits/schedules` **no cap + no serializable tx** (double-book TOCTOU, `scheduler-audit-schedules-post-handler.js:150-241`); `POST /api/audits/schedule` bypasses canonical writer, **no audit row** (`audits.js:266→314`); `PATCH :362` is **column-only** (no `status` key at `:395-401` — earlier "bypass" claim stale; the un-audited `auditorId` swap at `:401` is a separate A7-class gap) | ❌ audit rows post-commit best-effort (crash between commit and audit-call loses trail) | consolidate to `audit-scheduling-service` path to close the class; `AUDITOR_MAX_CONCURRENT=5` is display-only |
| GP-8 PASS (human) | ✅ **S6 is a human press, no auto-certify bypass** | ⚠️ onsite fanout likely **mis-addressed** (`healthId` passed where `User.id` expected, `audit-onsite-service.js:892-895`) → applicant notif may silently no-op; possible **double** notif on PASS | ✅ AUDITOR role edge | ❌ decision handler writes **no in-tx AuditLog** (post-commit best-effort only, `auditor-audit-decision-handler.js:189-231`) — cert-minting PASS may lack immutable attribution | onsite photo/checklist minimums SKIPPED when models unprovisioned → PASS with zero photos possible |
| GP-9 cert+QR | ✅ mint on `AUDIT_PASSED`; hash+RSA real | ❌ `CERTIFIED` notif renders cert number `'-'` (`workflow-side-effects.js:258-262`) | ⚠️ `final-approvals` does **direct `tx.application.update`** bypassing writer, no audit, no notif (`auditor.js:130-134`) | ❌ no CERTIFICATE-category audit row for issuance | **`documentHash` unkeyed SHA-256** (#619) — RSA sig is the real control but **best-effort at issuance**; key-outage certs are permanently hash-only, indistinguishable from legacy on verify |
| GP-10 public verify | ✅ real lookup + hash recompute + RSA verify | n/a | ✅ public (rate-limit degrades to per-proc memory w/o Redis) | ❌ **no record of verification attempts** — counterfeit-probing/scraping leaves zero trace (`public.js`, cf. trace-QR has `recordTraceScan`) | (also see BACKLOG #73: /verify masking + enumeration issues) |

---

## 3. Cross-cutting themes (one fix each closes many cells)

1. **AUDIT-LOG OPT-IN HOLE (ADR-012) — systemic.** `writeApplicationStatus` emits a canonical audit row only when the caller passes `onAudit` (`application-status-writer.js:222-236`), and **almost every Golden-Path caller omits it** — including the two highest-value events (money settle, PASS/cert). The slip-approve path is the one surface that does it atomically (`statusTransitionAuditHook`). → **queue A7-adjacent / new "audit-emission sweep".**
2. **NOTIFICATION IS IN-APP-ONLY on the path.** `createNotification` = DB row only; `sendNotification` (email + SMS) is used almost nowhere on the Golden Path; email is log-only without SMTP env; SMS default provider is `mock`. Several "notified" claims are dead code. → **A8 NOTIFICATION AUDIT** (start GP-4 pay-success, GP-5b revision, GP-7 schedule, GP-9 cert-issued).
3. **CANONICAL-WRITER BYPASSES.** Assignment (GP-5a), two schedule writers (GP-7), final-approvals (GP-9) all use plain `prisma.update`, skipping WorkActivity + tenant scope + audit. → **A7 AUTHZ SWEEP** should include a "no direct status/column write off-path" pass.
4. **CAPACITY / DOUBLE-BOOK.** `AUDITOR_MAX_PER_DAY=2` enforced on 1 of 4 schedule writers; TOCTOU on the uncapped one. → BACKLOG already filed; C-path scheduling consolidation.
5. **STRIPE FE UNBUILT + PromptPay-only not enforced + mock-in-prod ungated.** → **C1**.

---

## 4. WALK verdict per hop (can it be walked "full" today?)

| Hops | WALK status |
|---|---|
| GP-1a/b, GP-5a, GP-6a, GP-7, GP-8, GP-9, GP-10 | **status flows** but **audit and/or notification columns are ❌** → not "full green" by the mandate's 4-column definition |
| GP-1c/d, GP-2 | status flows; audit ❌ + notification ❌/dead |
| GP-3, GP-4, GP-6b | **cannot walk on the Stripe rail** (FE unbuilt, flags off); walkable only via `PAYMENT_ADAPTER=mock` for E2E, or on the legacy slip rail (no QR) |

**No hop is "full green" today** — every one misses at least the audit-log column, and payment hops miss the code column. The single biggest lever is the ADR-012 audit-emission hole (theme 1): it is the missing column on ~10 of 14 hops.

---

## 5. Queue mapping (feeds QUEUE.md re-sort)

| Gap cluster | Queue task |
|---|---|
| audit-emission hole (theme 1) | **new A-lane task** (propose): audit-emission sweep across Golden-Path writers — highest hop-coverage |
| notification in-app-only (theme 2) | **A8** NOTIFICATION AUDIT (4 start points already scoped) |
| writer bypasses + role×endpoint negative tests (theme 3) | **A7** AUTHZ SWEEP |
| /verify enumeration/masking/no-trace (GP-10 + BACKLOG #73) | **A9** VERIFY-PAGE SECURITY |
| Stripe FE + PromptPay-only + mock-prod guard (§0, GP-3/4/6b) | **C1** Payment Wave 3-4 (BLOCKED(operator:762-run) for live parts) |
| scheduler 4-writer consolidation + cap (GP-7) | C-path (scheduling) |
| working-day dual-SSOT + holiday table 2027 (GP-5b) | B-lane (SSOT dedup) |
| GP-8/GP-9 mandate/code mismatches | **operator decisions** (§6 below) |

---

## 6. Decisions — RESOLVED by operator 2026-08-04

| # | Question | Ruling | Work it creates |
|---|---|---|---|
| D1 | GP-8 single-press issuance | **Keep single-press for demo/staging**, but mark **REVERSIBLE-17065**: before production go-live, re-split "assessor" from "certification decider" (ISO/IEC 17065 independence). | UAT checklist item + ask กรม to confirm (C5) |
| D2 | GP-9 `CERTIFIED` semantics | **REJECTED** — a certificate is valid **only at `CERTIFIED`**, minted atomically with the issuance hook; `AUDIT_PASSED` = **no cert yet**. The "cert live but status ≠ CERTIFIED" window is dual-source-of-truth (Law 3.6) and skews reports. | **Fix task D2** (A-lane): move cert+QR mint from the `AUDIT_PASSED` write to the `CERTIFIED` write, atomic |
| D3 | PromptPay-only trim | **Do now**, small **separate PR (Tier C — money config)** — trim `['promptpay','card']`→`['promptpay']` so nobody extends the card path. | **PR (this session)** |
| D4 | Legacy slip rail retire | **Not yet.** Slip is the only live money rail today. Retire condition = Stripe PromptPay green on Golden Path staging (GP-3,4,6) **+ operator written cutover.** | gates the C1 drain step |
| D5 | `documentHash`/signing | **fail-closed** — key outage ⇒ **no cert issued, no amber certs**. A government cert with an unverifiable signature is worse than a late one; daily volume is low, downtime acceptable. | **Fix task D5** (A-lane): signing fail-closed at issuance |

## 7. C1 PromptPay build contract — operator product decisions 2026-08-04 (all REVERSIBLE)

These bind the C1 (Payment Wave 3-4) build. Docs-answered Stripe facts (webhook truth = `payment_intent.succeeded`, HMAC-SHA256 sig + 5-min tolerance, idempotency by event-id + `data.object.id`+`type`, out-of-order tolerance, THB/satang, min ฿10) are settled — build against them. The operator decisions for the doc-silent gaps:

| # | Gap (Stripe docs silent) | Decision |
|---|---|---|
| S1 | QR/PaymentIntent expiry (Stripe exposes none for PromptPay) | Tie expiry to the **existing invoice due date**: past due → cron **cancels the PaymentIntent via API** + web shows "QR หมดอายุ" with a **request-new-QR** action (new PI, same invoice). Aligns with the existing `PAYMENT_ABANDONED` 30-day. |
| S2 | Can't simulate an expired payment in test mode | Test expiry via **cancel API + time-injection** in an integration test (not Stripe's absent simulate). |
| S3 | Refund needs customer email (async `requires_action`) | **Email becomes a required checkout field** captured **before** PI confirm, stored on the invoice record. |
| S4 | Double-scan/overpayment not refundable via Stripe | Policy: **return outside Stripe via the Account role** (bank transfer) + record a **manual adjustment, append-only**, referenced to **both** PaymentIntents; never delete/edit the original amount. |
| S5 | Unknown/undocumented webhook events | **log-and-hold**: any event not in the allowlist is logged + **alerted**, never processed, never dropped. |

**C1 acceptance now includes:** PromptPay-only method list (D3), CERTIFIED-atomic issuance (D2), fail-closed signing (D5), due-date-bound PI expiry with cancel+reissue (S1/S2), mandatory checkout email (S3), append-only overpayment adjustment (S4), log-and-hold unknown events (S5), and a production `PAYMENT_ADAPTER=mock` guard (GP-6b gap).
