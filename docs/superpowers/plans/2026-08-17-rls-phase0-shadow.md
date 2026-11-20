# RLS Phase 0 (Shadow / Measure-First) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Measure — in prod, before any enforcement — how often the tenant context is missing and how often a query *would* cross tenants, so the eventual RLS enforce flip is data-driven, not blind. **Zero enforcement, zero lockout risk, zero DB/role change.**

**Architecture:** Pure APP-LAYER measurement in `tenant-prisma-extension.js`, Prisma-native (no Postgres NOTICE capture — Prisma's Rust engine swallows them; no `SET LOCAL`/GUC yet). Two signals: (1) a **missing-context** counter — a tenant-scoped op ran with no resolvable tenant context and was not an intentional `withoutTenantScope`; (2) a **would-be-blocked cross-tenant** counter — a scoped read returned a row whose `organizationId` ≠ the request's tenant, i.e. a row RLS enforcement would have hidden. Both are structured log events an ops dashboard aggregates. The DB observe policy stays `SELECT TRUE` (unchanged), the app role stays as-is, and the E.1 read-scoping stays on.

**Tech Stack:** Node, Prisma client extension (`$allModels.query`), `shared/logger` (winston), AsyncLocalStorage tenant context (`services/tenant-context`), Jest.

## Global Constraints (from the spec, verbatim)
- **This is Phase 0 ONLY.** Do NOT flip the RLS policy to enforcing, do NOT change the DB role to `gacp_app`, do NOT set `app.tenant_id`/`SET LOCAL`, do NOT `FORCE ROW LEVEL SECURITY`. Those are Phases 1–3, separately planned + reviewer#2-gated.
- **Zero behaviour change to query results.** Measurement only — every event is a log line; no query is filtered, blocked, or altered by this plan (the E.1 `applyReadScopes` read-inject stays exactly as-is; do not touch it).
- **Distinguish intentional `withoutTenantScope` from a genuine missing context** — only the latter is the metric. Use the existing marker `services/tenant-context` sets for `withoutTenantScope` (verify it in Task 1; do not guess).
- Tier C (tenant-isolation-adjacent) — commit to a branch, operator merges. No secrets in logs (log org ids, never row contents).
- Keep events cheap + bounded — no unbounded logging that floods prod (sample or rate-limit if a path is hot; note it).

---

## File structure
- Modify: `apps/backend/services/tenant-prisma-extension.js` — add two measurement hooks; the E.1 logic stays.
- Create: `apps/backend/services/rls-shadow-metrics.js` — the structured-event emitter (one place, so the log shape is consistent + dashboard-parseable).
- Test: `apps/backend/__tests__/unit/rls-shadow-metrics.test.js`.

---

### Task 1: Missing-context metric

**Files:**
- Create: `apps/backend/services/rls-shadow-metrics.js`
- Modify: `apps/backend/services/tenant-prisma-extension.js`
- Test: `apps/backend/__tests__/unit/rls-shadow-metrics.test.js`

**Interfaces:**
- Produces: `emitMissingContext({ model, action })` and `emitWouldBeBlocked({ model, action, rowOrgId, contextOrgId })` — both log one structured `rls-shadow` event via `shared/logger`.

- [ ] **Step 1: Verify the withoutTenantScope marker (no guess).** Read `services/tenant-context.js`: how does `withoutTenantScope()` mark its run vs a plain missing context? (e.g. a sentinel value / a separate `isBypass` flag in the AsyncLocalStorage store.) The missing-context metric must fire ONLY when the context is genuinely absent, NOT during an intentional `withoutTenantScope`. Record the exact accessor.

- [ ] **Step 2: Write the failing test** (`rls-shadow-metrics.test.js`)

```js
'use strict';
const logger = require('../../shared/logger');
jest.mock('../../shared/logger', () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn(), createLogger: () => ({ warn: jest.fn() }) }));
const { emitMissingContext } = require('../../services/rls-shadow-metrics');

test('emitMissingContext logs one structured rls-shadow event with model+action, no row data', () => {
  emitMissingContext({ model: 'Application', action: 'findUnique' });
  expect(logger.warn).toHaveBeenCalledTimes(1);
  const [msg, meta] = logger.warn.mock.calls[0];
  expect(msg).toMatch(/rls-shadow/i);
  expect(meta).toMatchObject({ signal: 'MISSING_CONTEXT', model: 'Application', action: 'findUnique' });
  expect(JSON.stringify(meta)).not.toMatch(/password|content|payload/i); // no row data
});
```

- [ ] **Step 3: Run it — expect FAIL** (`Cannot find module rls-shadow-metrics`). `cd apps/backend && npx jest rls-shadow-metrics -i`

- [ ] **Step 4: Implement `rls-shadow-metrics.js`**

```js
'use strict';
const logger = require('../shared/logger');
// Phase-0 shadow signals. Structured so an ops dashboard can aggregate:
// signal=MISSING_CONTEXT → a tenant-scoped op ran with no tenant context (would fail-closed under enforcement).
// signal=WOULD_BE_BLOCKED → a scoped read returned a row from another org (enforcement would have hidden it).
function emitMissingContext({ model, action }) {
  logger.warn('[rls-shadow] missing tenant context on a tenant-scoped op', { signal: 'MISSING_CONTEXT', model, action });
}
function emitWouldBeBlocked({ model, action, rowOrgId, contextOrgId }) {
  logger.warn('[rls-shadow] cross-tenant row would be blocked under enforcement', { signal: 'WOULD_BE_BLOCKED', model, action, rowOrgId, contextOrgId });
}
module.exports = { emitMissingContext, emitWouldBeBlocked };
```

- [ ] **Step 5: Wire the missing-context hook into the extension.** In `tenant-prisma-extension.js`, in the read/by-id verbs on tenant-scoped models, when there is NO tenant context AND it is not an intentional `withoutTenantScope` (per Step 1's accessor), call `emitMissingContext({ model, action })`. **Do not change what the op returns** — emit, then proceed exactly as today. Add a small test that a tenant-scoped op with a null (non-bypass) context triggers `emitMissingContext` and still returns the underlying result.

- [ ] **Step 6: Run tests — expect PASS.** Commit.

---

### Task 2: Would-be-blocked cross-tenant metric (post-read comparison)

**Files:**
- Modify: `apps/backend/services/tenant-prisma-extension.js`
- Test: `apps/backend/__tests__/unit/rls-shadow-crosstenant.test.js`

**Interfaces:**
- Consumes: `emitWouldBeBlocked` (Task 1).

- [ ] **Step 1: Write the failing test** — a `findFirst`/`findUnique` on a tenant-scoped model whose returned row has `organizationId` ≠ the context's `organizationId` triggers `emitWouldBeBlocked` (and the row is STILL returned — shadow, not enforcement).

```js
// mock tenant context → org 'A'; mock the query to resolve a row with organizationId 'B'
// call the extension's findFirst wrapper; assert emitWouldBeBlocked called with rowOrgId 'B', contextOrgId 'A',
// AND the wrapper still returns the row (no filtering).
```

- [ ] **Step 2: Run it — expect FAIL.**

- [ ] **Step 3: Implement.** In the tenant-scoped read verbs (`findUnique/findFirst`; for `findMany` sample or scan the returned array), AFTER `query(args)` resolves, if there IS a tenant context, compare each returned row's `organizationId` to the context's; on mismatch call `emitWouldBeBlocked(...)`. Return the result unchanged. Guard cost: only compare when the model actually has `organizationId` and a context exists; for `findMany`, cap the scan (e.g. first N rows) to stay cheap on large reads — note the cap in a comment.

- [ ] **Step 4: Run tests — expect PASS.** Commit.

---

### Task 3: Shadow GUC wiring (prove the mechanism + measure latency — still ZERO enforcement)

**Files:**
- Modify: `apps/backend/services/tenant-prisma-extension.js`
- Reference: `apps/backend/scripts/rls/extension-reference.md` (the proven form)
- Test: `apps/backend/__tests__/integration/rls-shadow-guc.int.test.js`

**Interfaces:**
- Produces: `withTenantGuc` / `withBypassGuc` (from `extension-reference.md`) applied to the by-id verbs, **with the DB policy still permissive `SELECT TRUE`** — so the GUC is set per op but nothing is enforced.

- [ ] **Step 1** — Copy the `withTenantGuc`/`withBypassGuc` helpers from `scripts/rls/extension-reference.md` verbatim (batch-array `$transaction([set_config('app.tenant_id', …, true), query(args)])`). Confirm `client` in the `$allModels` hook is the EXTENDED client on the installed `@prisma/client` version (Task note in the reference); if not, capture the extended prisma via closure.
- [ ] **Step 2 (RED)** — Integration test on real Postgres (`REQUIRE_DB=1`): with a tenant context, a `findUnique` runs and `SELECT current_setting('app.tenant_id', true)` inside the same op returns the context's org (proving the GUC reached the query connection); the row is STILL returned (policy permissive). A `withoutTenantScope` op sets `app.rls_bypass='on'`. Run, expect FAIL (helpers not wired).
- [ ] **Step 3** — Wire the by-id verbs (`findUnique/update/delete/upsert`) through `withTenantGuc`/`withBypassGuc`. **In-tx call sites** (services already inside an interactive `$transaction`, e.g. `writeApplicationStatus`): do NOT nest a batch `$transaction` — issue `SET LOCAL` once at the top of the existing tx (`tx.$executeRawUnsafe(...)`); enumerate those sites (grep `\$transaction`) and list them in the report. Reads keep the E.1 `applyReadScopes` (defense-in-depth) unchanged.
- [ ] **Step 4 (GREEN)** — run the integration test; confirm GUC is set + results unchanged. **Benchmark**: capture the latency delta of the 2-statement form on a read-heavy path (a `findMany` loop) and record it in the report — this is the number that gates whether the enforce phases proceed as-is or need optimization.
- [ ] **Step 5** — Commit.

---

### Task 4: Phase-0 readout (exit criteria)

**Files:**
- Create: `apps/backend/scripts/rls/phase0-readout.md` (how to read the two metrics from logs) + a note in the report.

- [ ] **Step 1** — Document the exact log query/aggregation for the two signals (`MISSING_CONTEXT`, `WOULD_BE_BLOCKED`) — the ops dashboard filter, and the **exit criteria**: (a) `MISSING_CONTEXT` rate in prod driven to **zero** (every authenticated path sets context) before Phase 2's enforce; (b) a complete `WOULD_BE_BLOCKED` map (which model/action/route) — the real cross-tenant surface, to fix or confirm-legitimate before enforcing. Commit.

---

## Self-review
- **Spec coverage:** spec §5 Phase 0 = "wire NOTICEs to observability" + "GUC wiring in shadow." This plan realizes the observability via the Prisma-native app-layer signals (Tasks 1–2, since Prisma swallows NOTICEs — a deviation the plan justifies + is *stronger*: no infra, exact model/action attribution) and the shadow GUC wiring in Task 3, still zero-enforcement. §5 "no enforcement/no lockout" honored throughout. Exit criteria (missing-context→0, cross-tenant map) in Task 4.
- **Placeholder scan:** the withoutTenantScope accessor + the `client`-is-extended check are explicit *verify* steps (named + reasoned), not placeholders. No TBDs.
- **Type consistency:** `emitMissingContext`/`emitWouldBeBlocked` signatures consistent Task 1↔2; `withTenantGuc`/`withBypassGuc` come verbatim from `extension-reference.md`.
- **Deviation flagged for the operator:** cross-tenant is measured by app-layer post-read comparison (Task 2) rather than DB NOTICEs — cleaner + Prisma-native, and it cannot catch a cross-tenant *write*'s target row the way a DB policy would; that gap is exactly what the Phase-3 canary (real enforce on one table) closes, and is acceptable for Phase-0 *measurement*.
