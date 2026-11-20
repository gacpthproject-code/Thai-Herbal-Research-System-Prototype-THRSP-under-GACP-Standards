# Settlement Resilience — Design

**Date:** 2026-08-16
**Status:** Design approved (brainstorming, 5/5 sections) — pending spec review → writing-plans
**Tier:** C (money / auth / schema / migration) — operator merges (L3, CLAUDE.md)
**Origin:** Phase 0 flow-proof (`docs/superpowers/plans/2026-08-15-phase0-flow-proof.md`). The Stripe money path was run on real Postgres + real Stripe for the first time; the run found two application bugs (fixed) and one settlement-resilience gap (this design).

---

## 1. Problem

Phase 0 drove one application from register → submit → checkout → PaymentIntent → PromptPay authorize → `payment_intent.succeeded` webhook on real infrastructure. The webhook settlement never completed. Root-cause analysis (confirmed by experiment) found the settlement is not idempotent-retryable and has no reconciliation backstop. Three gaps, each verified in code this session:

| Gap | Evidence | Effect in production |
|---|---|---|
| **a — a failed settle cannot retry** | `routes/api/webhooks/stripe.js:59-60`: on redelivery the event insert hits P2002 and returns `200 duplicate` **without checking whether the row was ever processed**. The comment at `:20-21` claims "the un-stamped dedup row lets the retry re-process safely" — the code does not implement it. | Any settle failure (crash, deploy mid-tx, DB blip, timeout) stores the event un-processed; every Stripe redelivery no-ops. The order stays `PENDING_PAYMENT` forever. |
| **b — no reconciliation backstop** | `jobs/` holds only `payment-reminder-job` (sends reminders) and `payment-closure-job` (marks EXPIRED). Neither re-drives a succeeded-PI-but-unsettled order against Stripe. | Nothing heals a missed settle. Stripe (source of truth) is never consulted after the webhook. |
| **c — unbounded synchronous settle tx** | `services/checkout/checkout-settlement-service.js:145`: `prisma.$transaction(async (tx) => …)` with **no timeout option** — Prisma default 5000ms. The tx does 10–20 sequential writes. | Under DB latency or load the tx exceeds 5s and aborts with P2028 (reproduced this session: default → FAIL P2028 at ~5s; `{timeout:30000}` → ran the full duration). Combined with gap a, the payment is captured but never settled. |

A fourth interaction compounds the harm: `jobs/payment-closure-job.js` marks an application `EXPIRED / PAYMENT_ABANDONED` when its invoice is still `PENDING` and past due. A paid-but-unsettled order keeps its invoice `PENDING`, so after the reminder window **the closure job would expire an application the customer already paid for**.

There is also a latent concurrency defect independent of the gaps above: `checkout-settlement-service.js:96` reads the order and `:112` checks `status === 'SETTLED'` **outside** the transaction — a check-then-act race. Two concurrent deliveries can both read `PENDING` and both post the journal.

**Not a dev-only artifact.** Supabase's ap-southeast-2 latency from Thailand (~320–530 ms/round-trip, measured) makes gap c fire on every run. Production co-locates Postgres with the backend (<5 ms/round-trip), so the same tx finishes in ~100–300 ms — the trigger is *rarer*, not absent. Crashes, deploys, load spikes, and transient errors all produce failed or slow settles in production, and none of them recover today.

## 2. Goals / Non-goals

**Goals (must-be only):**
1. Exactly-once settlement — the journal posts once, never zero (stranded), never twice (double-post), even under retry and concurrency.
2. Retryable — a failed settle re-drives to completion; the webhook dedup distinguishes *processed* from merely *seen*.
3. Reconciled — a periodic backstop consults Stripe (source of truth) and re-drives any succeeded-PI-but-unsettled order.
4. Bounded — the settle tx carries an explicit timeout; slow money work does not block the webhook ACK.
5. No paid order is ever closed as abandoned.

**Non-goals (deliberately excluded — YAGNI):**
- No message-queue-based settlement (Approach B). BullMQ/Redis already exists in the deployed environment (`jobs/scheduler.js:22-26` → `services/queue-service.js`, used for SLA), so B would need no *new* infrastructure in production — but it is rejected anyway, for reasons that survive that correction: (1) Redis is absent in the laptop dev environment (no Docker), so a queue-based settle cannot be exercised by the Phase-0 local real-infra proof this whole effort is built on; (2) it would place money settlement behind Redis availability — a dependency the DB-backed path avoids, keeping the money path resilient to a Redis outage; (3) at GACP volume (tens–hundreds of settlements/day) the queue's throughput is unused. Approach C reaches the same money-safety while staying provable locally and independent of Redis on the money path. (Consequence: the `stripe:stripe-projects` provisioning skill has no role here — nothing needs provisioning for C.)
- No change to the accounting logic. `recordPaymentEntry`, the 2-entity DTAM/PLATFORM split, VAT 7%, the money equation, and receipt-number allocation stay byte-for-byte. This design wraps *reliability* around the posting; it does not touch the posting's math.
- No new payment features. Phase 0 forbids them.

## 3. Decision — Approach C (thin webhook + in-process async settle + reconcile)

The chosen shape moves the settle out of the webhook ACK path. Rationale, decided against Approach A (keep the synchronous settle in the webhook + add the same backstops), through the three lenses the operator required:

- **Must-be.** The five money-safety requirements above are identical for A and C except one: *do not run slow money work inside the webhook ACK*. Phase 0 proved the settle can be slow. Keeping it in the webhook (A) preserves a known anti-pattern as the primary path; C places it correctly. C adds no features over A — it is the same feature set, positioned right.
- **Standard.** Stripe documents: return 200 quickly, process heavy work asynchronously, make processing idempotent, reconcile against the API as source of truth. C matches this directly; A works against the first point.
- **ERP.** A and C give identical guarantees (atomic tx + idempotent key + reconcile). C's extracted worker makes the exactly-once journal posting testable in isolation.

A's only edge — marginally simpler control flow — is not a must-be, and C keeps near-instant settlement by kicking the worker in-process immediately after the 200, so A's latency advantage disappears.

## 4. Architecture

```
POST /webhooks/stripe (thin)
  verify signature → upsert stripe_webhook_events (status=RECEIVED)
  → return 200            (ACK fast)
  → kick settleEvent(id) in-process, non-blocking

        │ in-process, immediate            ▲ backstop, every N minutes
        ▼                                   │
  settleEvent(eventId)                 settlement-reconcile-job (cron)
    single source of settle truth        A) events RECEIVED past nextRetryAt → settleEvent
    used by all three entry points       B) orders PENDING_PAYMENT whose PI
                                            Stripe.retrieve = succeeded → settleEvent
                                          (Stripe = source of truth)

  payment-closure-job (guarded)
    before EXPIRE: Stripe.retrieve(PI) succeeded → skip + alert
```

Three units, one responsibility each: the webhook receives, acknowledges, and records; `settleEvent` settles (idempotent, concurrency-safe, bounded); the reconcile job heals against Stripe. The existing settle logic becomes `settleEvent(eventId)`, called identically by the webhook kick, the reconcile job, and any retry — one place posts the journal.

## 5. Event state machine + data flow

**`stripe_webhook_events.status` lifecycle:**

```
RECEIVED ──settle ok──────────────> PROCESSED           (terminal)
   │  ▲
   │  └── retry when now ≥ nextRetryAt ──┐
   └── settle fails → attempts++ ────────┘
   └── attempts > MAX ──────────────────> DEAD_LETTER    (alert operator)
   └── terminal business outcome ───────> PROCESSED + reason  (no retry)
       (amount mismatch, order not found)
```

**Data flow — three entry points, one `settleEvent`:**

```
[webhook]  verify → upsert event
             ├─ P2002 & existing.status = PROCESSED  → 200 duplicate (truly done)
             └─ P2002 & existing unprocessed         → 200 + re-drive     ← fixes gap a
           inserted RECEIVED → 200 → kick settleEvent async
[reconcile] (A) events RECEIVED past nextRetryAt / stale → settleEvent    ← fixes gap b
            (B) orders PENDING_PAYMENT, Stripe.retrieve(PI)=succeeded,
                no PROCESSED event yet → settleEvent
[closure]   before EXPIRE → Stripe.retrieve(PI)=succeeded → skip + alert  ← fixes gap c-compound
```

**Exactly-once under concurrency (the ERP core):**

- **Layer 1 (must-be):** replace the outside-tx status check with an in-tx row lock. The first statement inside the settle tx is `SELECT … FOR UPDATE` on the order; re-check `status`. If already `SETTLED`, no-op. Concurrent settles (kick vs redelivery vs reconcile) serialize on the lock; the losers see `SETTLED` and stop. The whole bundle (order + invoice + journal + docs + status) is therefore exactly-once, gated by the order row.
- **Layer 2 (defense-in-depth, approved):** a partial unique index on the journal so the database refuses a second settlement entry even if layer 1 is bypassed. Keyed on a new `sourceType` + `sourceId`, `WHERE isDeleted = false AND sourceType = 'CHECKOUT_SETTLEMENT'` — a legitimate reversal carries a different `sourceType`, so the index does not block it.

**Schema delta (Tier C — expand-only migration, operator merges):**

| Table | Add | Necessity |
|---|---|---|
| `stripe_webhook_events` | `status` enum, `attempts Int @default(0)`, `nextRetryAt DateTime?` | must-be (retry / dead-letter) |
| `journal_entries` | `sourceType String?`, `sourceId String?` + partial unique index | defense-in-depth (layer 2) |

The migration only adds nullable / defaulted columns and one index; it drops and renames nothing (expand-before-contract). `stripe_webhook_events` currently exposes only `processedAt?` and `error?` (`billing.prisma:1354`); `journal_entries.reference` is `@@index`, not `@@unique` (`:565, :580`), and `isDeleted` soft-delete with reversing entries preferred (`:576`) is why layer 2 keys on `sourceType`, not on `reference`.

## 6. Components / files

`settleEvent(eventId)` is the single seam. The webhook and the reconcile job record and call; neither knows the settle internals.

| # | File | State | Responsibility | Tier |
|---|---|---|---|---|
| 1 | `routes/api/webhooks/stripe.js` | modify | verify → upsert event → 200 fast → kick `settleEvent` async; P2002+PROCESSED = duplicate, P2002+unprocessed = re-drive | C |
| 2 | `services/checkout/checkout-settlement-service.js` | modify | extract `settleEvent(eventId)` — re-entrant, idempotent, order `FOR UPDATE`, bounded tx, updates event status/attempts; existing logic moves under it | C |
| 3 | `jobs/settlement-reconcile-job.js` | new | backstop cron: (A) retry stale RECEIVED events, (B) re-drive orders whose PI Stripe reports succeeded; bounded batch, fault-isolated per row | C |
| 4 | `jobs/payment-closure-job.js` | modify | before EXPIRE, `Stripe.retrieve(PI)` succeeded → skip + alert | C |
| 5 | `jobs/scheduler.js` | modify | register the reconcile job (interval from config) | C |
| 6 | `prisma/schema/billing.prisma` + migration | new | the schema delta above (expand-only) | C |
| 7 | `config/business-rules.js` | modify | backoff schedule, MAX attempts, reconcile interval + staleness thresholds, tx timeout — dated config, never hardcoded constants | C |
| 8 | tests (`e2e-phase0/**`, unit) | new | Section 9 | A/B |

**Interface:**

```
settleEvent(eventId) → { status: 'PROCESSED' | 'FAILED' | 'DEAD_LETTER', reason? }
  callers: webhook kick · reconcile-job (A, B) · retry
  depends on: prisma tx (order FOR UPDATE) · stripe-adapter.getPaymentIntent · recordPaymentEntry(tx)
```

## 7. Error handling + edge cases

Split by **retryable** (transient — back off and retry) vs **terminal** (permanent / business — mark and stop; retrying cannot fix it).

| Case | Kind | Handling |
|---|---|---|
| tx fails mid-way (timeout, DB blip) | retryable | atomic rollback (no partial journal) → FAILED, attempts++, nextRetryAt → reconcile retries |
| redelivery / reconcile races the kick | — | order `FOR UPDATE` serializes; the loser sees SETTLED → no-op; no double-post |
| amount mismatch (PI ≠ expected) | terminal | do not settle; event → PROCESSED + reason (so reconcile B, which excludes PROCESSED events, does not re-drive or re-alert); alert operator once (possible fraud/config); no retry |
| order not found for PI | terminal | event → PROCESSED + reason; alert once; no infinite retry |
| process dies after 200, before kick completes | retryable | event stays RECEIVED → reconcile (staleness) settles it; the backstop covers the crash window |
| repeated failures past MAX attempts | escalate | DEAD_LETTER + alert operator; retry loop stops (no infinite retry, no silent give-up) |
| event-stamp write fails after tx commit | self-heals | order is SETTLED (money truth); a redelivery/reconcile sees SETTLED, re-stamps; money stays correct |
| closure job meets a paid order | guard | Stripe.retrieve = succeeded → skip EXPIRE + alert; a paid application is never closed |

Operator alerts fire on DEAD_LETTER, AMOUNT_MISMATCH, ORDER_NOT_FOUND, and paid-would-be-closed. The reconcile job logs a per-run summary (re-driven, dead-lettered).

## 8. Constraints

- **Tier C throughout** — money, auth-adjacent, schema, migration. Every file merges by the operator (L3). The agent flags and proposes diffs only.
- **Accounting math untouched** — reliability wraps the posting; the posting is unchanged.
- **Expand-before-contract** — the migration only adds; no drop/rename in this design.
- **No hardcode** — every threshold (backoff, MAX attempts, reconcile interval, staleness, tx timeout) is dated config in `config/business-rules.js`.
- **RED-first** — for executable behavior, paste the failing test before the fix (DoD §5 tier C). Money code ships with a full evidence pack.

## 9. Testing

**Unit (RED-first):** `settleEvent` called twice → one journal; dedup (PROCESSED → no-op, RECEIVED → re-drive); retry (fail → FAILED + attempts → next run succeeds); dead-letter after MAX; amount-mismatch → terminal, no retry; tx respects the timeout config.

**Integration on real Postgres (the Phase 0 discipline):**
- full settle completes — SETTLED + DOC_FEE_PAID + journal balanced (`totalDebit == totalCredit`, lines sum) + receipt + event PROCESSED. This is the Phase 0 C04 that was blocked; it now passes because the tx is bounded and runs on real infra.
- re-drive exactly-once — `settleEvent` twice on the real DB → one journal (verified by `dumpErp`).
- reconcile — seed a paid-but-unsettled order → run reconcile → SETTLED + journal.
- closure guard — seed a paid-but-unsettled order → run closure job → not EXPIRED.

**View-in-the-loop:** the end-to-end run (register → submit → checkout → authorize → settle → journal) with video + trace on real infrastructure is this mission's GREEN — the settlement proof Phase 0 set out to witness, now completing because settlement is resilient. It reuses the built `e2e-phase0` harness (`dumpErp`, `stripeConfirmPromptPay`, `stripeTestAuthorize`); the mission adds the resilience assertions.

## 10. Context — what Phase 0 already delivered

Two application bugs, found only by running on real Postgres + real Stripe (mocked tests used JS numbers and a mocked gateway), fixed on `feat` for the operator to merge:

- `dfb68258` — `apiVersion` pinned to an invalid string; every `paymentIntents.create` returned 400. (F-STRIPE-APIVERSION)
- `a3342a14` — `toSatang` rejected a Prisma `Decimal` (Postgres numeric), throwing before settle. (F-SETTLE-TOSATANG)

This design addresses the third finding, F-SETTLE-RESILIENCE, and folds in the compounding closure-job hazard.
