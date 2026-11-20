# T-017 Payment / Webhook / Cron Hardening — Status — 2026-05-05

Audit pass for **T-017 — Harden payment creation, webhooks, lab
callbacks, offline sync, and cron safety** (master-audit-implementation-action-plan.md).

This document records the alignment status of T-017's three subtasks.
**All three subtasks are substantially complete** — the concerns the
original audit raised have been addressed by intervening waves
(M-014 sync auth fix, M-016/M-017 unique-key constraints, the cron
secret enforcement). This audit confirms each one.

## Subtask 1 — Stable idempotency keys (replace timestamp-only)

### Webhook idempotency — ✅ closed

`PaymentTransaction.gatewayRef` has a `@unique` constraint added in
migration `20260306200000_add_unique_constraints_audit_m016_m017`
(audit issue M-017). Webhook re-delivery from the gateway re-uses the
same `gatewayRef`, so duplicate processing fails the unique INSERT
with a clean P2002 error path that the handler interprets as "already
processed" rather than a system fault.

The webhook handler in `services/payment-service-webhook-flow.js`
also has an explicit pre-check for prior processing before mutating
state.

### `idempotencyKey` field — ✅ in place

`PaymentTransaction.idempotencyKey String? @unique` (in `billing.prisma:280`)
provides a second idempotency lever for the **payment creation** path
when the gateway sends the same logical request twice (e.g., retry from
a flaky network).

## Subtask 2 — Webhook + callback atomicity

### Webhook signature verification — ✅ closed

`server.js:84` captures `req.rawBody` via `express.json({verify})` so
the HMAC verification has access to the unparsed bytes
(parser-modified payloads can fail signature checks otherwise).

`services/payment-webhook-service.js:36` exports `verifyWebhookSignature`
with three formats supported:
- Plain hex digest
- `sha256=<hex>` named-algorithm form
- Stripe-style `t=<ts>,v1=<hmac(ts.payload)>` (timestamp + payload binding)

`services/payment-service-webhook-flow.js:47` rejects webhooks where
`verifyWebhookSignature(verifyInput, signature)` returns false BEFORE
any DB write.

### Atomic state transitions — ✅ in place via canonical writers

The PR-WF-1 canonical-status-writer ratchet (CHANGELOG 3.2.0) means
every workflow status mutation goes through `writeApplicationStatus`,
which either succeeds atomically or throws — no half-applied state
between status + history + side-effects.

## Subtask 3 — Authenticated callback + cron boundaries

### Cron secret enforcement — ✅ closed

`routes/api/system/cron.js:88-97` `verifyCronSecret(req)` rejects when
`CRON_SECRET` env var is **not set** (returns false → handler responds
401 `CRON_SECRET_INVALID`). The original audit's concern that
"cron auto-cancel can run unauthenticated when secrets are absent" is
inverted by this fail-closed default.

### Sync JWT verify-before-inspect — ✅ closed (M-014)

`routes/api/system/sync.js:7-24` includes the explicit comment:

> Determines whether to use provider or health auth based on known
> cookie presence or Authorization header format — **without decoding
> the JWT before verification (audit fix M-014)**.

Dispatch decisions read **cookie names** (`provider_token` /
`auth_token`), not the JWT contents. The actual verification happens
inside `authenticateProvider` / `authenticateHealth` which call
`jwtConfig.verifyToken` with the correct audience.

### Lab callbacks — N/A

The original audit listed `routes/api/callbacks.js` as a target
file, but no such route exists in the current codebase. The
"lab callback" surface mentioned was either:
- a future feature that was descoped before implementation, or
- a label for the `/api/sync/offline` flow that is already
  protected by `authenticateSyncUser` (see above)

`labResults` and `labResultStatus` exist as data fields on Application
(read by trace + cert flows for display) but no inbound webhook
route writes them. There is no T-017 fix needed here.

## Summary

- Subtask 1 (idempotency): ✅ closed — gatewayRef unique + idempotencyKey unique
- Subtask 2 (atomicity): ✅ closed — signature verify + canonical-status-writer
- Subtask 3 (auth boundaries): ✅ closed — cron secret + sync M-014 + webhook HMAC

T-017 is substantially complete. **No code changes recommended** in this
PR. Every concrete concern from the original audit has been addressed
by intervening waves.

## What's not in scope (deferred)

- Mid-flight failure compensating actions (e.g., partial PDF gen + cert
  row written): tracked under T-012 deferred items, not T-017.
- Queue durability + DLQ runbook formalization: belongs in T-018
  (release gates) which is also substantially complete via CI.

## Next on the order

T-020 — retire legacy routes / aliases. Will require parity proof per
endpoint (operator step) + a deprecation window before any legacy
alias can be removed.
