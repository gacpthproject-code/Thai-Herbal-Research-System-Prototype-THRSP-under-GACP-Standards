# Settlement Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Stripe webhook→settle path idempotent, retryable, and reconciled so a captured payment is never left unsettled.

**Architecture:** Approach C from the design (`docs/superpowers/specs/2026-08-16-settlement-resilience-design.md`). The webhook becomes thin (verify → record event → 200 → kick `settleEvent` in-process). `settleEvent` is the single, idempotent, concurrency-safe settle entry (order `SELECT … FOR UPDATE` inside a bounded tx). A reconcile cron re-drives failures against Stripe (source of truth). A guard stops the closure job from expiring a paid order.

**Tech Stack:** Node.js, Express, Prisma (Postgres), node-cron, Stripe SDK, Jest (unit), Playwright + the `e2e-phase0` harness (real-Postgres + view-in-the-loop).

## Global Constraints

- **Tier C** — every source file here is money / auth-adjacent / schema / migration. The agent flags and proposes diffs; **the operator merges** (CLAUDE.md L3/L5). Do not push to `main`.
- **Accounting math is untouched** — `recordPaymentEntry`, the DTAM/PLATFORM split, VAT 7%, the money equation, and receipt allocation stay byte-for-byte. This plan wraps reliability around the posting only.
- **Expand-before-contract** — the migration only ADDS nullable/defaulted columns and one index. No drop, no rename.
- **No hardcode** — every threshold (tx timeout, max attempts, backoff, reconcile interval, staleness) lives in `config/business-rules.js`, overridable via `SystemConfig`. No magic numbers in logic.
- **Status columns are `String`** — this schema uses no Prisma enums (verified). New status fields are `String` with the allowed values in a trailing comment, matching the existing idiom.
- **RED-first for executable behavior** — paste the failing test before the fix (DoD §5 tier C).
- **Heap for the full local suite** — `NODE_OPTIONS=--max-old-space-size=3072` or it OOMs.
- **Real-infra proof** — the DB truth is read via the `e2e-phase0` harness (`apps/web-app/e2e-phase0/helpers.ts`: `dumpErp`, `stripeConfirmPromptPay`, `stripeTestAuthorize`), not logs.

---

### Task 1: Settlement resilience config

**Files:**
- Modify: `apps/backend/config/business-rules.js`
- Test: `apps/backend/__tests__/unit/settlement-config.test.js`

**Interfaces:**
- Produces: `SETTLEMENT` (frozen object) with `TX_TIMEOUT_MS`, `TX_MAX_WAIT_MS`, `MAX_ATTEMPTS`, `RETRY_BACKOFF_MS` (array), `RECONCILE_STALE_MS`, `RECONCILE_BATCH`; and `loadSettlementFromSystemConfig(prisma)` mirroring `loadFeesFromSystemConfig`.

- [ ] **Step 1: Write the failing test**

```js
// apps/backend/__tests__/unit/settlement-config.test.js
'use strict';
const { SETTLEMENT } = require('../../config/business-rules');

describe('SETTLEMENT config', () => {
  it('exposes bounded-tx + retry defaults', () => {
    expect(SETTLEMENT.TX_TIMEOUT_MS).toBeGreaterThanOrEqual(30000);
    expect(SETTLEMENT.TX_MAX_WAIT_MS).toBeGreaterThanOrEqual(10000);
    expect(SETTLEMENT.MAX_ATTEMPTS).toBeGreaterThanOrEqual(5);
    expect(Array.isArray(SETTLEMENT.RETRY_BACKOFF_MS)).toBe(true);
    expect(SETTLEMENT.RETRY_BACKOFF_MS.length).toBeGreaterThan(0);
    expect(SETTLEMENT.RECONCILE_STALE_MS).toBeGreaterThan(0);
    expect(SETTLEMENT.RECONCILE_BATCH).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`SETTLEMENT` undefined)

Run: `cd apps/backend && npx jest settlement-config -i`
Expected: FAIL — `Cannot read properties of undefined (reading 'TX_TIMEOUT_MS')`.

- [ ] **Step 3: Add the config block** (after the `FEES` block, mirroring its default+override shape)

```js
// config/business-rules.js
const SETTLEMENT_DEFAULTS = {
  TX_TIMEOUT_MS: 30000,      // a financial settle must not abort at Prisma's 5s default under latency/load
  TX_MAX_WAIT_MS: 10000,     // max wait to acquire a tx slot from the pool
  MAX_ATTEMPTS: 6,           // after this many failed settles → DEAD_LETTER + alert
  RETRY_BACKOFF_MS: [60000, 300000, 900000, 3600000, 10800000], // 1m,5m,15m,1h,3h (last repeats)
  RECONCILE_STALE_MS: 300000,   // an un-processed event older than this is eligible for the reconcile sweep
  RECONCILE_BATCH: 100,          // max rows per reconcile run (bounded)
};
const SETTLEMENT = { ...SETTLEMENT_DEFAULTS };

async function loadSettlementFromSystemConfig(prisma) {
  try {
    const rows = await prisma.systemConfig.findMany({ where: { key: { startsWith: 'settlement.' } } });
    const keyMap = {
      'settlement.tx_timeout_ms': 'TX_TIMEOUT_MS',
      'settlement.tx_max_wait_ms': 'TX_MAX_WAIT_MS',
      'settlement.max_attempts': 'MAX_ATTEMPTS',
      'settlement.reconcile_stale_ms': 'RECONCILE_STALE_MS',
      'settlement.reconcile_batch': 'RECONCILE_BATCH',
    };
    for (const row of rows) {
      const field = keyMap[row.key];
      if (field) SETTLEMENT[field] = Number(row.value);
    }
  } catch (e) {
    logger.warn('[business-rules] settlement config load skipped', { error: e.message });
  }
}
```

Export both: add `SETTLEMENT` and `loadSettlementFromSystemConfig` to `module.exports`. If `logger` is not already required in this file, require it (`const logger = require('../shared/logger')`).

- [ ] **Step 4: Run it — expect PASS**

Run: `cd apps/backend && npx jest settlement-config -i` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/config/business-rules.js apps/backend/__tests__/unit/settlement-config.test.js
git commit -m "feat(settlement): resilience config (tx timeout, retry backoff, reconcile) — dated, SystemConfig-overridable"
```

---

### Task 2: Schema — event resilience columns + journal idempotency key

**Files:**
- Modify: `apps/backend/prisma/schema/billing.prisma` (models `StripeWebhookEvent` ~:1354, `JournalEntry` ~:562)
- Create: `apps/backend/prisma/migrations/<timestamp>_settlement_resilience/migration.sql`
- Test: `apps/backend/__tests__/integration/settlement-schema.int.test.js` (real Postgres)

**Interfaces:**
- Produces: `stripe_webhook_events.status` (`String @default("RECEIVED")`), `.attempts` (`Int @default(0)`), `.nextRetryAt` (`DateTime?`); `journal_entries.sourceType` (`String?`), `.sourceId` (`String?`) + a partial unique index so at most one live settlement entry exists per order.

- [ ] **Step 1: Write the failing round-trip test** (proves the columns exist on the real DB)

```js
// apps/backend/__tests__/integration/settlement-schema.int.test.js
'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
afterAll(() => prisma.$disconnect());

test('stripe_webhook_events carries status/attempts/nextRetryAt', async () => {
  const id = 'evt_schema_' + Date.now();
  await prisma.stripeWebhookEvent.create({
    data: { id, type: 'test', payload: {}, status: 'RECEIVED', attempts: 0, nextRetryAt: new Date() },
  });
  const row = await prisma.stripeWebhookEvent.findUnique({ where: { id } });
  expect(row.status).toBe('RECEIVED');
  expect(row.attempts).toBe(0);
  await prisma.stripeWebhookEvent.delete({ where: { id } });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`Unknown arg 'status'`)

Run: `cd apps/backend && DATABASE_URL=$(grep '^DATABASE_URL=' ../../.env | cut -d= -f2- | tr -d '\r') npx jest settlement-schema.int -i`
Expected: FAIL — Prisma rejects `status`/`attempts`/`nextRetryAt` (columns absent).

- [ ] **Step 3: Edit the schema (expand-only)**

In `model StripeWebhookEvent`, after `error String?`:
```prisma
  status      String    @default("RECEIVED") // RECEIVED | PROCESSED | FAILED | DEAD_LETTER
  attempts    Int       @default(0)
  nextRetryAt DateTime?
```
Add `@@index([status, nextRetryAt])` beside the existing indexes.

In `model JournalEntry`, after `createdBy String?`:
```prisma
  sourceType String? // e.g. CHECKOUT_SETTLEMENT — the idempotency class of this entry
  sourceId   String? // the order id for a settlement — one live settlement entry per order
```

- [ ] **Step 4: Generate the migration SQL** (expand-only; add the partial unique index by raw SQL — Prisma cannot express a partial index in-schema)

```sql
-- migration.sql
ALTER TABLE "stripe_webhook_events" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'RECEIVED';
ALTER TABLE "stripe_webhook_events" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "stripe_webhook_events" ADD COLUMN "nextRetryAt" TIMESTAMP(3);
CREATE INDEX "stripe_webhook_events_status_nextRetryAt_idx" ON "stripe_webhook_events"("status", "nextRetryAt");
ALTER TABLE "journal_entries" ADD COLUMN "sourceType" TEXT;
ALTER TABLE "journal_entries" ADD COLUMN "sourceId" TEXT;
-- one LIVE settlement journal per order; reversals carry a different sourceType, so they are not blocked
CREATE UNIQUE INDEX "journal_entries_settlement_once"
  ON "journal_entries"("sourceId")
  WHERE "isDeleted" = false AND "sourceType" = 'CHECKOUT_SETTLEMENT';
```

Backfill note (existing rows): existing events get `status='RECEIVED'`; a follow-up one-liner may set already-`processedAt` rows to `PROCESSED` — include it in the migration:
```sql
UPDATE "stripe_webhook_events" SET "status" = 'PROCESSED' WHERE "processedAt" IS NOT NULL;
```

- [ ] **Step 5: Apply + regenerate, then run the test — expect PASS**

Run:
```bash
cd apps/backend
DATABASE_URL=$(grep '^DATABASE_URL=' ../../.env | cut -d= -f2- | tr -d '\r') npx prisma migrate deploy
npx prisma generate
DATABASE_URL=$(grep '^DATABASE_URL=' ../../.env | cut -d= -f2- | tr -d '\r') npx jest settlement-schema.int -i
```
Expected: migrate applies; test PASS.

- [ ] **Step 6: Commit** (operator merges — schema/migration = Tier C)

```bash
git add apps/backend/prisma/schema/billing.prisma apps/backend/prisma/migrations apps/backend/__tests__/integration/settlement-schema.int.test.js
git commit -m "feat(settlement): schema — event status/attempts/nextRetryAt + journal settlement-once partial unique (expand-only)"
```

---

### Task 3: `settleEvent` — bounded tx, FOR-UPDATE idempotency, event bookkeeping

**Files:**
- Modify: `apps/backend/services/checkout/checkout-settlement-service.js` (`settleFromPaymentIntent` ~:95-239; `handleStripeEvent` ~:245)
- Test: `apps/backend/__tests__/unit/settle-event.test.js`

**Interfaces:**
- Consumes: `SETTLEMENT` (Task 1); `stripe_webhook_events.status/attempts/nextRetryAt`, `journal.sourceType/sourceId` (Task 2).
- Produces:
  - `settleFromPaymentIntent({ paymentIntent, eventId })` — unchanged signature; now (a) locks the order `FOR UPDATE` and re-checks `status` INSIDE the tx, (b) passes `{ timeout, maxWait }` to `$transaction`, (c) stamps `sourceType:'CHECKOUT_SETTLEMENT', sourceId: order.id` on the journal via `recordPaymentEntry`'s existing meta.
  - `settleEvent(eventId) → { status:'PROCESSED'|'FAILED'|'DEAD_LETTER', reason? }` — loads the event row, extracts the PI from `payload.data.object`, calls `settleFromPaymentIntent`, and writes the event's `status/attempts/nextRetryAt`.

- [ ] **Step 1: Write failing unit tests** (jest, mock-prisma pattern from `stripe-checkout-engine.test.js`)

```js
// apps/backend/__tests__/unit/settle-event.test.js
'use strict';
process.env.STRIPE_SECRET_KEY = 'sk_test_' + 'x'.repeat(24);
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_' + 'x'.repeat(24);
jest.mock('../../shared/logger', () => { const l = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }; return { ...l, createLogger: () => l }; });

const settled = { id: 'ord_1', status: 'SETTLED' };
const pending = { id: 'ord_1', status: 'PENDING_PAYMENT', totalPayableAmount: 5535, milestone: 'M1',
  invoiceId: 'inv_1', dtamFeeAmount: 5000, platformFeeNet: 500, platformFeeVat: 35, platformFeeGross: 535 };

const tx = {
  $queryRaw: jest.fn(async () => [{ id: 'ord_1', status: 'PENDING_PAYMENT' }]), // FOR UPDATE lock read
  checkoutOrder: { update: jest.fn() }, invoice: { update: jest.fn() },
  paymentTransaction: { update: jest.fn() }, checkoutDocument: { create: jest.fn() },
};
const mockDb = {
  checkoutOrder: { findFirst: jest.fn() },
  stripeWebhookEvent: { findUnique: jest.fn(), update: jest.fn() },
  $transaction: jest.fn(async (cb, opts) => { mockDb.__txOpts = opts; return cb(tx); }),
};
jest.mock('../../services/prisma-database', () => ({ prisma: mockDb }));
jest.mock('../../services/journal-entry-service', () => ({ recordPaymentEntry: jest.fn() }));
jest.mock('../../services/application-status-writer', () => ({ writeApplicationStatus: jest.fn() }));
jest.mock('../../services/receipt-numbering-service', () => ({ allocateReceiptNumber: jest.fn(async () => ({ number: 'N1' })), ISSUER: { PLATFORM: 'PLATFORM', DTAM: 'DTAM' } }));

const svc = require('../../services/checkout/checkout-settlement-service');

beforeEach(() => jest.clearAllMocks());

test('settle passes a bounded timeout to $transaction', async () => {
  mockDb.checkoutOrder.findFirst.mockResolvedValue({ ...pending });
  await svc.settleFromPaymentIntent({ paymentIntent: { id: 'pi_1', amount_received: 553500 }, eventId: 'evt_1' });
  expect(mockDb.__txOpts.timeout).toBeGreaterThanOrEqual(30000);
});

test('an already-SETTLED order is a no-op (idempotent)', async () => {
  mockDb.checkoutOrder.findFirst.mockResolvedValue({ ...settled });
  const r = await svc.settleFromPaymentIntent({ paymentIntent: { id: 'pi_1', amount_received: 553500 }, eventId: 'evt_1' });
  expect(r).toEqual({ settled: true, alreadySettled: true });
  expect(mockDb.$transaction).not.toHaveBeenCalled();
});

test('settleEvent stamps PROCESSED on success', async () => {
  mockDb.stripeWebhookEvent.findUnique.mockResolvedValue({ id: 'evt_1', status: 'RECEIVED', attempts: 0, payload: { data: { object: { id: 'pi_1', amount_received: 553500 } } } });
  mockDb.checkoutOrder.findFirst.mockResolvedValue({ ...settled }); // already settled → clean PROCESSED
  const r = await svc.settleEvent('evt_1');
  expect(r.status).toBe('PROCESSED');
  expect(mockDb.stripeWebhookEvent.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'PROCESSED' }) }));
});

test('settleEvent stamps FAILED + schedules retry when settle throws', async () => {
  mockDb.stripeWebhookEvent.findUnique.mockResolvedValue({ id: 'evt_2', status: 'RECEIVED', attempts: 0, payload: { data: { object: { id: 'pi_2', amount_received: 553500 } } } });
  mockDb.checkoutOrder.findFirst.mockResolvedValue({ ...pending });
  mockDb.$transaction.mockRejectedValueOnce(new Error('P2028 timeout'));
  const r = await svc.settleEvent('evt_2');
  expect(r.status).toBe('FAILED');
  expect(mockDb.stripeWebhookEvent.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED', attempts: 1, nextRetryAt: expect.any(Date) }) }));
});
```

- [ ] **Step 2: Run — expect FAIL** (`svc.settleEvent is not a function`; `__txOpts` undefined)

Run: `cd apps/backend && npx jest settle-event -i` → FAIL.

- [ ] **Step 3: Enhance `settleFromPaymentIntent`** — lock + bounded tx + journal source key

Add `const { SETTLEMENT } = require('../../config/business-rules');` at the top.

Replace the `prisma.$transaction(async (tx) => {` opening (~:145) so the FIRST statement locks and re-checks the order, and pass options at the close:
```js
await prisma.$transaction(async (tx) => {
    // Concurrency-safe idempotency: lock the order row and re-check under the lock.
    // Concurrent settles (webhook kick, Stripe redelivery, reconcile) serialize here;
    // the losers see SETTLED and stop, so the whole bundle is exactly-once.
    const [locked] = await tx.$queryRaw`SELECT id, status FROM checkout_orders WHERE id = ${order.id} FOR UPDATE`;
    if (!locked || locked.status === 'SETTLED') return; // already done under the lock
    // …unchanged body (order update, invoice, journal, docs, status)…
}, { timeout: SETTLEMENT.TX_TIMEOUT_MS, maxWait: SETTLEMENT.TX_MAX_WAIT_MS });
```
In the `recordPaymentEntry(...)` call, add to its meta object: `sourceType: 'CHECKOUT_SETTLEMENT', sourceId: order.id` (defense-in-depth layer 2; `recordPaymentEntry` already forwards its meta onto the JournalEntry create — if it does not, pass these through the same meta bag it already receives). Do not change any amount.

- [ ] **Step 4: Add `settleEvent`** (event wrapper — loads event, calls the core, stamps status/attempts)

```js
function nextBackoff(attempts) {
  const b = SETTLEMENT.RETRY_BACKOFF_MS;
  return b[Math.min(attempts, b.length - 1)];
}

async function settleEvent(eventId) {
  const ev = await prisma.stripeWebhookEvent.findUnique({ where: { id: eventId } });
  if (!ev) return { status: 'FAILED', reason: 'EVENT_NOT_FOUND' };
  if (ev.status === 'PROCESSED') return { status: 'PROCESSED', reason: 'ALREADY' };
  const paymentIntent = ev.payload?.data?.object;
  try {
    const result = await settleFromPaymentIntent({ paymentIntent, eventId });
    const terminal = result.settled === false && result.reason; // AMOUNT_MISMATCH / ORDER_NOT_FOUND
    await prisma.stripeWebhookEvent.update({
      where: { id: eventId },
      data: { status: 'PROCESSED', processedAt: new Date(), error: terminal || null, nextRetryAt: null },
    });
    return { status: 'PROCESSED', reason: terminal || undefined };
  } catch (err) {
    const attempts = (ev.attempts || 0) + 1;
    const dead = attempts >= SETTLEMENT.MAX_ATTEMPTS;
    await prisma.stripeWebhookEvent.update({
      where: { id: eventId },
      data: { status: dead ? 'DEAD_LETTER' : 'FAILED', attempts, error: err.message,
        nextRetryAt: dead ? null : new Date(Date.now() + nextBackoff(attempts)) },
    });
    if (dead) logger.error('[settle] DEAD_LETTER — operator action required', { eventId, attempts, error: err.message });
    return { status: dead ? 'DEAD_LETTER' : 'FAILED', reason: err.message };
  }
}
```
Add `settleEvent` to `module.exports`. Route `handleStripeEvent`'s `payment_intent.succeeded` case through `settleEvent(event.id)` (it already has the event id) rather than calling `settleFromPaymentIntent` directly, so the event bookkeeping is consistent.

- [ ] **Step 5: Run — expect PASS**

Run: `cd apps/backend && npx jest settle-event -i` → PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/services/checkout/checkout-settlement-service.js apps/backend/__tests__/unit/settle-event.test.js
git commit -m "feat(settlement): settleEvent — bounded tx + FOR-UPDATE exactly-once + retry/dead-letter bookkeeping"
```

---

### Task 4: Thin webhook — retryable dedup + async kick

**Files:**
- Modify: `apps/backend/routes/api/webhooks/stripe.js`
- Test: `apps/backend/__tests__/unit/stripe-webhook-dedup.test.js`

**Interfaces:**
- Consumes: `settleEvent(eventId)` (Task 3); `stripe_webhook_events.status` (Task 2).
- Produces: a webhook that returns 200 after recording the event and kicks `settleEvent` without awaiting; a redelivery of a PROCESSED event → `200 duplicate` (no re-settle); a redelivery of an unprocessed (RECEIVED/FAILED) event → re-drive.

- [ ] **Step 1: Write failing tests**

```js
// apps/backend/__tests__/unit/stripe-webhook-dedup.test.js
'use strict';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_' + 'x'.repeat(24);
jest.mock('../../shared/logger', () => { const l = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }; return { ...l, createLogger: () => l }; });

const mockDb = { stripeWebhookEvent: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() } };
jest.mock('../../services/prisma-database', () => ({ prisma: mockDb }));
const settleEvent = jest.fn(async () => ({ status: 'PROCESSED' }));
jest.mock('../../services/checkout/checkout-settlement-service', () => ({ settleEvent, handleStripeEvent: jest.fn() }));
const event = { id: 'evt_9', type: 'payment_intent.succeeded', data: { object: { id: 'pi_9' } } };
jest.mock('../../services/payment/payment-adapter', () => ({ getPaymentAdapter: () => ({ verifyWebhookSignature: () => event }) }));

const request = require('supertest');
const express = require('express');
function app() { const a = express(); a.use((req, _r, n) => { req.rawBody = Buffer.from('{}'); n(); }); a.use('/webhooks', require('../../routes/api/webhooks/stripe')); return a; }

beforeEach(() => jest.clearAllMocks());

test('fresh event → 200, records RECEIVED, kicks settleEvent', async () => {
  mockDb.stripeWebhookEvent.create.mockResolvedValue({});
  const res = await request(app()).post('/webhooks/stripe').set('stripe-signature', 't').send({});
  expect(res.status).toBe(200);
  expect(mockDb.stripeWebhookEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'RECEIVED' }) }));
  expect(settleEvent).toHaveBeenCalledWith('evt_9');
});

test('redelivered PROCESSED event → 200 duplicate, no re-settle', async () => {
  mockDb.stripeWebhookEvent.create.mockRejectedValue({ code: 'P2002' });
  mockDb.stripeWebhookEvent.findUnique.mockResolvedValue({ id: 'evt_9', status: 'PROCESSED' });
  const res = await request(app()).post('/webhooks/stripe').set('stripe-signature', 't').send({});
  expect(res.status).toBe(200);
  expect(settleEvent).not.toHaveBeenCalled();
});

test('redelivered unprocessed event → re-drives', async () => {
  mockDb.stripeWebhookEvent.create.mockRejectedValue({ code: 'P2002' });
  mockDb.stripeWebhookEvent.findUnique.mockResolvedValue({ id: 'evt_9', status: 'FAILED' });
  const res = await request(app()).post('/webhooks/stripe').set('stripe-signature', 't').send({});
  expect(res.status).toBe(200);
  expect(settleEvent).toHaveBeenCalledWith('evt_9');
});
```

- [ ] **Step 2: Run — expect FAIL** (current code no-ops on any P2002; never calls `settleEvent`)

Run: `cd apps/backend && npx jest stripe-webhook-dedup -i` → FAIL.

- [ ] **Step 3: Rewrite the route body** (verify unchanged; replace dedup + dispatch)

```js
const { settleEvent } = require('../../../services/checkout/checkout-settlement-service');
// …signature verify unchanged, producing `event`…

// 2. Insert-first dedup. A P2002 is a REDELIVERY: re-drive only if unprocessed.
try {
    await prisma.stripeWebhookEvent.create({ data: { id: event.id, type: event.type, payload: event, status: 'RECEIVED' } });
} catch (err) {
    if (err && err.code === 'P2002') {
        const existing = await prisma.stripeWebhookEvent.findUnique({ where: { id: event.id } });
        if (existing && existing.status === 'PROCESSED') {
            return res.status(200).json({ success: true, duplicate: true });
        }
        // unprocessed (RECEIVED / FAILED) → fall through to re-drive
    } else {
        logger.error('[stripe-webhook] event store insert failed', { eventId: event.id, error: err.message });
        return res.status(500).json({ success: false, error: 'EVENT_STORE_UNAVAILABLE' });
    }
}

// 3. ACK fast, then settle OUT of the request path (in-process, non-blocking).
res.status(200).json({ success: true, received: true });
setImmediate(() => {
    settleEvent(event.id).catch((e) =>
        logger.error('[stripe-webhook] async settle failed (reconcile will retry)', { eventId: event.id, error: e.message }));
});
```
Remove the old synchronous `handleStripeEvent` + stamp block (steps 3+4 in the old comment). Settlement + stamping now live in `settleEvent`; the reconcile cron (Task 5) is the backstop for the crash-after-200 window.

- [ ] **Step 4: Run — expect PASS** (add `supertest` to devDeps if absent: `npm i -D supertest`)

Run: `cd apps/backend && npx jest stripe-webhook-dedup -i` → PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/routes/api/webhooks/stripe.js apps/backend/__tests__/unit/stripe-webhook-dedup.test.js
git commit -m "feat(settlement): thin webhook — 200-fast + async settleEvent kick + retryable dedup (processed vs seen)"
```

---

### Task 5: Reconcile cron — the Stripe-truth backstop

**Files:**
- Create: `apps/backend/jobs/settlement-reconcile-job.js`
- Modify: `apps/backend/jobs/scheduler.js` (register, mirroring the lazy-require blocks)
- Test: `apps/backend/__tests__/unit/settlement-reconcile.test.js`

**Interfaces:**
- Consumes: `settleEvent(eventId)` (Task 3); `settleFromPaymentIntent` (Task 3); `SETTLEMENT` (Task 1); `getPaymentIntent` from `services/payment/payment-adapter`.
- Produces: `runSettlementReconcile() → { retriedEvents, reDrivenOrders, deadLettered, errors }`.

- [ ] **Step 1: Write failing tests**

```js
// apps/backend/__tests__/unit/settlement-reconcile.test.js
'use strict';
jest.mock('../../shared/logger', () => { const l = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }; return { ...l, createLogger: () => l }; });
const mockDb = {
  stripeWebhookEvent: { findMany: jest.fn(async () => []) },
  checkoutOrder: { findMany: jest.fn(async () => []) },
};
jest.mock('../../services/prisma-database', () => ({ prisma: mockDb }));
jest.mock('../../services/tenant-context', () => ({ withoutTenantScope: (fn) => fn(), runWithTenantContext: (_c, fn) => fn() }));
const settleEvent = jest.fn(async () => ({ status: 'PROCESSED' }));
const settleFromPaymentIntent = jest.fn(async () => ({ settled: true }));
jest.mock('../../services/checkout/checkout-settlement-service', () => ({ settleEvent, settleFromPaymentIntent }));
const getPaymentIntent = jest.fn();
jest.mock('../../services/payment/payment-adapter', () => ({ getPaymentAdapter: () => ({ getPaymentIntent }) }));

const { runSettlementReconcile } = require('../../jobs/settlement-reconcile-job');
beforeEach(() => jest.clearAllMocks());

test('query A retries a stale unprocessed event', async () => {
  mockDb.stripeWebhookEvent.findMany.mockResolvedValueOnce([{ id: 'evt_a' }]);
  const s = await runSettlementReconcile();
  expect(settleEvent).toHaveBeenCalledWith('evt_a');
  expect(s.retriedEvents).toBe(1);
});

test('query B re-drives an order whose PI Stripe reports succeeded', async () => {
  mockDb.checkoutOrder.findMany.mockResolvedValueOnce([{ id: 'ord_b', stripePaymentIntentId: 'pi_b', organizationId: 'org' }]);
  getPaymentIntent.mockResolvedValue({ id: 'pi_b', status: 'succeeded', amount_received: 553500 });
  const s = await runSettlementReconcile();
  expect(settleFromPaymentIntent).toHaveBeenCalledWith(expect.objectContaining({ paymentIntent: expect.objectContaining({ id: 'pi_b' }) }));
  expect(s.reDrivenOrders).toBe(1);
});

test('query B skips an order whose PI is NOT succeeded', async () => {
  mockDb.checkoutOrder.findMany.mockResolvedValueOnce([{ id: 'ord_c', stripePaymentIntentId: 'pi_c', organizationId: 'org' }]);
  getPaymentIntent.mockResolvedValue({ id: 'pi_c', status: 'requires_payment_method' });
  const s = await runSettlementReconcile();
  expect(settleFromPaymentIntent).not.toHaveBeenCalled();
  expect(s.reDrivenOrders).toBe(0);
});
```

- [ ] **Step 2: Run — expect FAIL** (module absent)

Run: `cd apps/backend && npx jest settlement-reconcile -i` → FAIL — cannot find module.

- [ ] **Step 3: Implement the job**

```js
// apps/backend/jobs/settlement-reconcile-job.js
'use strict';
const { prisma } = require('../services/prisma-database');
const logger = require('../shared/logger');
const { withoutTenantScope, runWithTenantContext } = require('../services/tenant-context');
const { SETTLEMENT } = require('../config/business-rules');
const { settleEvent, settleFromPaymentIntent } = require('../services/checkout/checkout-settlement-service');
const { getPaymentAdapter } = require('../services/payment/payment-adapter');

async function runSettlementReconcile() {
  const summary = { retriedEvents: 0, reDrivenOrders: 0, deadLettered: 0, errors: 0 };
  const now = Date.now();

  // Query A — unprocessed events due for retry (nextRetryAt reached, or never kicked and now stale).
  const events = await prisma.stripeWebhookEvent.findMany({
    where: {
      status: { in: ['RECEIVED', 'FAILED'] },
      OR: [
        { nextRetryAt: { lte: new Date(now) } },
        { nextRetryAt: null, receivedAt: { lt: new Date(now - SETTLEMENT.RECONCILE_STALE_MS) } },
      ],
    },
    orderBy: { receivedAt: 'asc' }, take: SETTLEMENT.RECONCILE_BATCH,
  });
  for (const ev of events) {
    try { const r = await settleEvent(ev.id); summary.retriedEvents += 1; if (r.status === 'DEAD_LETTER') summary.deadLettered += 1; }
    catch (e) { summary.errors += 1; logger.error('[reconcile] event retry failed', { eventId: ev.id, error: e.message }); }
  }

  // Query B — orders captured by Stripe but not settled locally (Stripe = source of truth).
  const adapter = getPaymentAdapter();
  const orders = await withoutTenantScope(() => prisma.checkoutOrder.findMany({
    where: {
      status: 'PENDING_PAYMENT',
      stripePaymentIntentId: { not: null },
      createdAt: { lt: new Date(now - SETTLEMENT.RECONCILE_STALE_MS) },
    },
    take: SETTLEMENT.RECONCILE_BATCH,
  }));
  for (const order of orders) {
    try {
      const pi = await adapter.getPaymentIntent(order.stripePaymentIntentId);
      if (!pi || pi.status !== 'succeeded') continue; // not captured → leave for the closure sweep
      await runWithTenantContext({ organizationId: order.organizationId }, () =>
        settleFromPaymentIntent({ paymentIntent: pi, eventId: null }));
      summary.reDrivenOrders += 1;
    } catch (e) { summary.errors += 1; logger.error('[reconcile] order re-drive failed', { orderId: order.id, error: e.message }); }
  }

  logger.info('[reconcile] settlement reconcile complete', summary);
  return summary;
}

module.exports = { runSettlementReconcile };
```

Note: `settleFromPaymentIntent` must tolerate `eventId: null` (it only logs the id — confirm no `eventId.` dereference; the amount cross-check + order lookup are PI-driven). Query B does not stamp an event; the order status is the source of truth, and any lingering event is resolved by query A (it will see the order SETTLED and stamp PROCESSED).

- [ ] **Step 4: Register in `scheduler.js`** (add after the Payment Closure block, same lazy-require idiom; interval every 10 min)

```js
    // 15. Settlement Reconcile — every 10 min. Re-drives unprocessed webhook
    // events and captured-but-unsettled orders against Stripe (source of truth),
    // so a failed/slow settle always heals. Idempotent (order FOR-UPDATE).
    this.jobs.push(
      cron.schedule('*/10 * * * *', async () => {
        logger.info('[Cron] Running Settlement Reconcile');
        try {
          const { runSettlementReconcile } = require('./settlement-reconcile-job');
          const summary = await runSettlementReconcile();
          logger.info('[Cron] Settlement Reconcile result:', summary);
        } catch (error) {
          logger.error('[Cron] Settlement Reconcile failed:', error);
        }
      }, { timezone: 'Asia/Bangkok' }),
    );
```

- [ ] **Step 5: Run — expect PASS**

Run: `cd apps/backend && npx jest settlement-reconcile -i` → PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/jobs/settlement-reconcile-job.js apps/backend/jobs/scheduler.js apps/backend/__tests__/unit/settlement-reconcile.test.js
git commit -m "feat(settlement): reconcile cron — retry stale events + re-drive captured-but-unsettled orders (Stripe=truth)"
```

---

### Task 6: Closure-job guard — never expire a paid order

**Files:**
- Modify: `apps/backend/jobs/payment-closure-job.js` (candidate loop ~:173-205, before the close tx)
- Test: `apps/backend/__tests__/unit/payment-closure-paid-guard.test.js`

**Interfaces:**
- Consumes: `getPaymentIntent` from the payment adapter; `checkoutOrder` (by `invoiceId`).
- Produces: a third money-safety guard — before closing, if the invoice's checkout order has a Stripe PI reporting `succeeded`, the case is skipped and an alert is logged.

- [ ] **Step 1: Write the failing test** (unit-level guard function)

```js
// apps/backend/__tests__/unit/payment-closure-paid-guard.test.js
'use strict';
jest.mock('../../shared/logger', () => { const l = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }; return { ...l, createLogger: () => l }; });
const mockDb = { checkoutOrder: { findFirst: jest.fn() } };
jest.mock('../../services/prisma-database', () => ({ prisma: mockDb }));
const getPaymentIntent = jest.fn();
jest.mock('../../services/payment/payment-adapter', () => ({ getPaymentAdapter: () => ({ getPaymentIntent }) }));
const { isInvoicePaidAtGateway } = require('../../jobs/payment-closure-job');

beforeEach(() => jest.clearAllMocks());

test('returns true when the order PI is succeeded at Stripe', async () => {
  mockDb.checkoutOrder.findFirst.mockResolvedValue({ id: 'o1', stripePaymentIntentId: 'pi_1' });
  getPaymentIntent.mockResolvedValue({ status: 'succeeded' });
  expect(await isInvoicePaidAtGateway('inv_1')).toBe(true);
});

test('returns false when there is no captured PI', async () => {
  mockDb.checkoutOrder.findFirst.mockResolvedValue({ id: 'o1', stripePaymentIntentId: 'pi_1' });
  getPaymentIntent.mockResolvedValue({ status: 'requires_payment_method' });
  expect(await isInvoicePaidAtGateway('inv_1')).toBe(false);
});
```

- [ ] **Step 2: Run — expect FAIL** (`isInvoicePaidAtGateway` not exported)

Run: `cd apps/backend && npx jest payment-closure-paid-guard -i` → FAIL.

- [ ] **Step 3: Add the guard function + call it before the close**

```js
// payment-closure-job.js — new helper
const { getPaymentAdapter } = require('../services/payment/payment-adapter');

async function isInvoicePaidAtGateway(invoiceId) {
  const order = await prisma.checkoutOrder.findFirst({ where: { invoiceId }, select: { stripePaymentIntentId: true } });
  if (!order || !order.stripePaymentIntentId) return false;
  try {
    const pi = await getPaymentAdapter().getPaymentIntent(order.stripePaymentIntentId);
    return pi && pi.status === 'succeeded';
  } catch (e) {
    // Fail SAFE: if Stripe is unreachable, do NOT close (better a late close than closing a paid case).
    logger.warn('[payment-closure] gateway check failed — skipping close this run', { invoiceId, error: e.message });
    return true;
  }
}
module.exports.isInvoicePaidAtGateway = isInvoicePaidAtGateway;
```

In the candidate loop, after guard #2 (`allRemindersSent`) and before `runWithTenantContext`:
```js
        // Money-safety guard #3 (gateway truth) — a captured payment must never be
        // closed as abandoned even if the local invoice still reads PENDING
        // (a settle that failed/stalled). Stripe is the source of truth.
        if (await isInvoicePaidAtGateway(invoice.id)) {
            summary.skipped += 1;
            logger.error('[payment-closure] PAID-but-unsettled case — skipped close + alert', { invoiceId: invoice.id, applicationId: app.id });
            continue;
        }
```

- [ ] **Step 4: Run — expect PASS**

Run: `cd apps/backend && npx jest payment-closure-paid-guard -i` → PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/jobs/payment-closure-job.js apps/backend/__tests__/unit/payment-closure-paid-guard.test.js
git commit -m "feat(settlement): closure-job guard — never expire an order whose Stripe PI succeeded (fail-safe)"
```

---

### Task 7: End-to-end proof on real Postgres (view-in-the-loop)

**Files:**
- Create: `apps/web-app/e2e-phase0/settlement-resilience.spec.ts`
- Uses: `apps/web-app/e2e-phase0/helpers.ts` (`login`, `dump`, `dumpErp`, `stripeConfirmPromptPay`, `stripeTestAuthorize`, `psql`, `thaiId`, `saveVars`)
- Evidence: `evidence/phase0/settlement/**` (video, trace, DB dumps, ERP dumps)

**Interfaces:**
- Consumes: the full stack up (backend on :8000 with the Stripe env + all tasks merged, frontend on :3000, `stripe listen`) and the built harness.

- [ ] **Step 1: Write the acceptance spec** (the Phase-0 C04 that was blocked, now with resilience assertions)

This spec consumes the fresh app produced by the existing `e2e-phase0` s01/s02 setup (register → API-draft → submit → checkout → PI), which saves `FARMER_MAIN_APP` via `saveVars`. Run it in the same suite so those specs execute first (`npx playwright test e2e-phase0` runs files in order); it reads the app id from `readVars()` and the PI straight off the `checkout_orders` row — no placeholders. A fresh app is required each run because a spent PI cannot be re-authorized.

```ts
// apps/web-app/e2e-phase0/settlement-resilience.spec.ts
import { test, expect } from '@playwright/test';
import { dumpErp, psql, stripeConfirmPromptPay, stripeTestAuthorize, readVars } from './helpers';

test('captured payment settles once, journal balances', async ({ page }) => {
  const appId = readVars().FARMER_MAIN_APP;                 // saved by the s01/s02 setup
  expect(appId, 'run e2e-phase0 s01/s02 first — FARMER_MAIN_APP missing').toBeTruthy();
  const pi = JSON.parse(psql(
    `SELECT stripe_payment_intent_id AS pi FROM checkout_orders WHERE "applicationId"='${appId}';`))[0]?.pi;
  expect(pi, 'no PaymentIntent on the checkout order').toBeTruthy();

  const url = stripeConfirmPromptPay(pi);
  await stripeTestAuthorize(page, url);

  // settle completes (bounded tx on real Postgres now fits): poll until SETTLED
  await expect.poll(async () => JSON.parse(psql(
    `SELECT status FROM checkout_orders WHERE "applicationId"='${appId}';`))[0]?.status,
    { timeout: 60000 }).toBe('SETTLED');

  const app = JSON.parse(psql(`SELECT status FROM applications WHERE id='${appId}';`))[0];
  expect(app.status).toBe('DOC_FEE_PAID');

  dumpErp('settlement', 'C04', appId); // journal balanced + receipt + event PROCESSED — inspect the pack
  const journals = JSON.parse(psql(
    `SELECT je.reference, je."totalDebit", je."totalCredit" FROM journal_entries je
     WHERE je.reference IN (SELECT "invoiceNumber" FROM invoices WHERE "applicationId"='${appId}');`));
  expect(journals.length).toBe(1);                         // exactly one settlement entry
  expect(journals[0].totalDebit).toEqual(journals[0].totalCredit); // balanced
  saveVars('SETTLE_APP', appId);
});
```

- [ ] **Step 2: Bring the stack up + run — capture RED first if it fails, then GREEN**

Run (from repo root, with the Stripe env loaded as in the Phase-0 runs):
```bash
cd apps/web-app && npx playwright test e2e-phase0/settlement-resilience.spec.ts --trace on
```
Expected after Tasks 1–6 are merged and the backend restarted: PASS, `checkout_orders=SETTLED`, `applications=DOC_FEE_PAID`, one balanced journal, receipt issued, event `PROCESSED`. Attach the `test-results/**/{video.webm,trace.zip}` + the `evidence/phase0/settlement/` dumps.

- [ ] **Step 3: Reconcile + closure-guard integration checks** (seed a paid-but-unsettled order on the real DB, then run each job)

```bash
# reconcile heals a captured-but-unsettled order → SETTLED
cd apps/backend && node -e "require('./jobs/settlement-reconcile-job').runSettlementReconcile().then(s=>console.log(s))"
# closure guard leaves the paid case alone
node -e "require('./jobs/payment-closure-job').runPaymentClosureSweep().then(s=>console.log(s))"
```
Expected: reconcile reports `reDrivenOrders>=1`; the closure sweep skips the paid case (not EXPIRED — verify via `psql` on the application status).

- [ ] **Step 4: Assemble the evidence pack + INDEX**

Write `evidence/phase0/settlement/INDEX.md` linking the video, trace, and every before/after DB + ERP dump, with one line per claim → artifact (qc-evidence discipline).

- [ ] **Step 5: Commit** (tests/evidence = Tier A/B)

```bash
git add apps/web-app/e2e-phase0/settlement-resilience.spec.ts evidence/phase0/settlement
git commit -m "test(settlement): real-Postgres proof — settle once + journal balanced + reconcile heals + closure-guard holds"
```

---

## Handoff / merge

All of Tasks 1–6 touch Tier C (money / schema). Bundle them on a branch off `feat/m2a-requirement-engine` and hand the operator the merge line (`! git push origin <branch>:main …`) with the full evidence pack from Task 7 attached. Do NOT self-merge. The two Phase-0 hotfixes already on `feat` (`dfb68258` apiVersion, `a3342a14` toSatang) ride along in the same operator review.

## Self-review notes (checked against the spec)

- **Spec coverage:** gap a → Task 4 (dedup) ; gap b → Task 5 (reconcile) ; gap c → Task 3 (bounded tx) + Task 1 (timeout config) ; TOCTOU race → Task 3 (FOR UPDATE) ; layer-2 journal idempotency → Task 2 (partial unique) + Task 3 (sourceType/sourceId) ; closure hazard → Task 6 ; error taxonomy (retryable/terminal/dead-letter) → Task 3 ; view-in-the-loop → Task 7. All covered.
- **Interfaces consistent:** `settleEvent(eventId)` produced in Task 3, consumed in Tasks 4/5; `SETTLEMENT` produced in Task 1, consumed in Tasks 3/5; `isInvoicePaidAtGateway` produced+consumed in Task 6.
- **Open confirmation for the implementer:** verify `recordPaymentEntry`'s meta bag forwards `sourceType/sourceId` onto the `JournalEntry` create; if it does not, thread them through the same meta parameter it already accepts (Task 3, Step 3) — no amount changes.
