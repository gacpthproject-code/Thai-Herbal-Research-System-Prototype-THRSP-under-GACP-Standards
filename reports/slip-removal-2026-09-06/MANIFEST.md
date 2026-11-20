# Slip full-removal manifest (mapped 2026-09-06, agent a548de57)

KEY SAFETY FACT: Stripe webhook settlement is FULLY INDEPENDENT of slip code.
Chain: routes/api/webhooks/stripe.js:56 → checkout-settlement-service.js (zero slip) →
writeApplicationStatus PENDING_DOC_FEE→DOC_FEE_PAID :417; receipt :290; journal
recordPaymentEntry :372 (rail-agnostic); invoice in stripe-checkout-service.js:601.
So removing slip cannot break payment.

BANK-RECONCILIATION = SLIP-ONLY (reconciles PaymentSlip vs bank statements; zero
stripe/checkout refs) → DELETE. Stripe reconcile lives in jobs/settlement-reconcile-job.js (keep).

TWO "removes-only-implementation" points:
- controllers/report-controller.js:3,77-82 uses period-revenue.revenueFromApprovedSlips →
  under Stripe-only reads ZERO → RE-SOURCE from checkout SETTLED / journal, don't just strip.
- subscription activation called ONLY from payment-slip-service.js:1558 → after removal nothing
  activates subscriptions; comments say all subscription counts are zero (pre-prod) → neutralize + TODO.

COMPILE-ORDER SPINE (do first): relocate classifyInvoiceSide (delegate to invoice-side.js:53) +
resolveAllowedIssuerSides+ISSUER_SIDE from payment-slip-service.js into services/finance/invoice-side.js;
repoint invoice-helpers.js:66,79,120 and waiver-reopen-service.js:29,262. Keep error code INVALID_REVIEWER_SIDE.

SCHEMA (Tier C, LAST, separate): prisma/schema/billing.prisma:462 model PaymentSlip + relations
billing:122,237,434,517; application.prisma:107-109,124-126,218; tenancy.prisma:142. Drop AFTER all
code refs gone. Migration gated (main-ahead-of-DB). Operator merges.

## SCHEMA DROP — operator's final migration step (NOT done by agent; destructive Tier C)
Code is fully slip-free (grep prisma.paymentSlip empty in live backend; FE removed). The Prisma
models below are now INERT (no code reads/writes them) and harmless; dropping them is a DESTRUCTIVE
migration (DROP TABLE + DROP COLUMN) on the shared prod/demo Supabase — L5 operator territory,
and main is ahead of the DB. Do it as ONE reviewed migration when convenient:
- billing.prisma: model PaymentSlip (462-512); back-relations `slips PaymentSlip[]` on Invoice (122)
  and Subscription (237); `slipsApprovedAgainst PaymentSlip[]` on BankAccount (434).
- application.prisma: phase1SlipId/phase1Slip (107-109), phase2SlipId/phase2Slip (124-126, both
  @unique + FK), paymentSlips (218).
- tenancy.prisma: paymentSlips on Organization (142).
- Consider dropping model BankAccount too (its service/routes/seed are deleted — it exists only for
  the slip transfer-destination flow). Its relations: CheckoutOrder?/Invoice? if any + slipsApprovedAgainst.
- After the schema edit: remove 'PaymentSlip' (and 'BankAccount' if dropped) from
  shared/legal-hold-guard.js LEGAL_HOLD_MODELS (its test pins the list == schema models), and the
  inert slip entries in shared/error-codes.js + shared/canonical-rbac.js + the eslint no-legacy-status
  'paymentSlip' allowlist fixture. Then `prisma validate && prisma generate` + migrate deploy.
