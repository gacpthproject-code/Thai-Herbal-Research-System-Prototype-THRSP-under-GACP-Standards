# RLS Phase 1 (Role Decouple) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Move the backend's DB connection from the SUPERUSER `gacp` role to a least-privilege `gacp_app` (NOSUPERUSER NOBYPASSRLS) role — with the RLS policy STILL permissive (`SELECT TRUE`) — proving the least-priv role has every grant the app needs, fully decoupled from any enforcement flip.

**Architecture:** A prod-capable, idempotent, **drift-proof** `gacp_app` provisioning SQL (role + DML on ALL public tables + `ALTER DEFAULT PRIVILEGES` for future tables) that does NOT touch the policy or `FORCE` RLS; a CI-able coverage probe that FAILS if any public table is ungranted; a reversible `DATABASE_URL`→`gacp_app` config switch; a separate superuser connection for the operator-run privileged scripts; and a staged, reversible, reviewer#2-gated cutover runbook. The live cutover is staging-gated (no DB in-session, like the Phase-0 GUC proof).

**Tech Stack:** Postgres roles/grants, Prisma (`@prisma/client`), Node, docker-compose, Jest.

## Global Constraints
- **Tier C** (DB role / auth / tenant-isolation) — operator merges; prod cutover = owner **+ reviewer #2** (GOALS G3), staged + reversible.
- **Policy STAYS `SELECT TRUE` — ZERO enforcement in Phase 1.** Do NOT install the enforcing `rls_observe_check` body; do NOT `FORCE ROW LEVEL SECURITY`. Those are Phase 2/3. (The prototype `scripts/rls/prototype-staging-setup.sql` mixes role+grants WITH the enforcing flip + FORCE — Phase 1 takes ONLY the role+grants half.)
- **Grant ALL public base tables, NOT an allow-list.** The prototype's `WHERE c.relrowsecurity = true` (`prototype-staging-setup.sql:106`) is the blocker: it covers ~51 of ~103 tables → the app breaks at boot under `gacp_app`. Use `relkind='r' AND nspname='public'` + `ALTER DEFAULT PRIVILEGES` so FUTURE tables auto-grant (the allow-list already rotted once — `farm_audit_photos`).
- **Role switch = config only** (`DATABASE_URL`); no app code branches on role name (audit-verified 2026-08-17). Reversible: point `DATABASE_URL` back at `gacp` = instant rollback.
- **No superuser ops in runtime code** (audit-verified); the operator-run privileged scripts (TRUNCATE/ALTER/DROP) read a SEPARATE `ADMIN_DATABASE_URL`, never the app's `DATABASE_URL`.
- RED-first. The LIVE `gacp_app` validation (coverage probe + full suite under `gacp_app`) runs on **staging**, operator-run.

## File structure
| File | Responsibility |
|---|---|
| Create `apps/backend/scripts/rls/gacp-app-provision.sql` | Prod-capable role+grants provisioning: role, DML on ALL public tables, sequences, `ALTER DEFAULT PRIVILEGES`. NO policy/FORCE. Idempotent. (Task 1) |
| Create `apps/backend/scripts/rls/gacp-app-coverage-probe.js` | `DATABASE_URL`-gated: asserts `gacp_app` holds SELECT/INSERT/UPDATE/DELETE on every public base table; exits non-zero + lists gaps. (Task 2) |
| Create `apps/backend/__tests__/unit/gacp-app-coverage-probe.test.js` | Unit-tests the probe's gap detection against a mocked catalog. (Task 2) |
| Create `apps/backend/__tests__/unit/gacp-app-provision-sql.test.js` | Structural guard on the SQL (no RLS filter, no policy flip, no FORCE, has default-privileges). (Task 1) |
| Modify `docker-compose.yml` (+`.production`/`.staging`/`.local-prod`) | `DATABASE_URL` role → `gacp_app`, reversible via env. (Task 3) |
| Modify `apps/backend/scripts/clear-for-uat.js`, `scripts/migrate-user-types.js`, `scripts/run-role-canonicalization.sh` | read `ADMIN_DATABASE_URL`. (Task 4) |
| Create `docs/operations/rls-phase1-gacp-app-cutover.md` | Staged, reversible, reviewer#2-gated runbook. (Task 5) |

---

### Task 1: `gacp_app` provisioning SQL (role + ALL-tables grants + drift-proof; policy untouched)

**Files:**
- Create: `apps/backend/scripts/rls/gacp-app-provision.sql`
- Test: `apps/backend/__tests__/unit/gacp-app-provision-sql.test.js`

**Interfaces:**
- Produces: a re-runnable SQL that, run by a superuser against any GACP DB, leaves `gacp_app` (NOSUPERUSER NOBYPASSRLS) holding USAGE on schema public + SELECT/INSERT/UPDATE/DELETE on every public base table + USAGE,SELECT on all sequences + EXECUTE on the RLS functions, with `ALTER DEFAULT PRIVILEGES` covering future tables/sequences. It does NOT change the policy body or FORCE RLS. Consumed by: Task 2 (the probe verifies its result), Task 5 (the runbook runs it).

- [ ] **Step 1: Write the failing structural test** — `gacp-app-provision-sql.test.js`:

```javascript
'use strict';
const fs = require('fs');
const path = require('path');
const SQL = fs.readFileSync(path.resolve(__dirname, '../../scripts/rls/gacp-app-provision.sql'), 'utf8');

describe('gacp-app-provision.sql — Phase 1 (role decouple, policy untouched)', () => {
  test('grants ALL public base tables, not the RLS-enabled allow-list', () => {
    expect(SQL).toMatch(/relkind\s*=\s*'r'/);
    expect(SQL).toMatch(/nspname\s*=\s*'public'/);
    expect(SQL).not.toMatch(/relrowsecurity\s*=\s*true/); // the bug we are fixing
  });
  test('is drift-proof: ALTER DEFAULT PRIVILEGES for future tables + sequences', () => {
    expect(SQL).toMatch(/ALTER DEFAULT PRIVILEGES[\s\S]*ON TABLES TO gacp_app/i);
    expect(SQL).toMatch(/ALTER DEFAULT PRIVILEGES[\s\S]*ON SEQUENCES TO gacp_app/i);
  });
  test('does NOT enforce: no policy flip, no FORCE (Phase 1 keeps SELECT TRUE)', () => {
    expect(SQL).not.toMatch(/FORCE ROW LEVEL SECURITY/i);
    // no enforcing body: the prototype's enforcing function reads app.tenant_id in the body
    expect(SQL).not.toMatch(/CREATE OR REPLACE FUNCTION\s+rls_observe_check/i);
  });
  test('role is least-privilege', () => {
    expect(SQL).toMatch(/NOSUPERUSER/);
    expect(SQL).toMatch(/NOBYPASSRLS/);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`Cannot find module '../../scripts/rls/gacp-app-provision.sql'` / file missing). `cd apps/backend && npx jest gacp-app-provision-sql`

- [ ] **Step 3: Write the provisioning SQL** — `gacp-app-provision.sql` (adapted from `prototype-staging-setup.sql` §1-2 but ALL-tables + default-privileges + NO policy/FORCE):

```sql
-- gacp_app provisioning — RLS Phase 1 (role decouple). Policy STAYS SELECT TRUE.
-- Run by a SUPERUSER. Idempotent + re-runnable. Grants DML on ALL public base
-- tables (NOT an allow-list) + ALTER DEFAULT PRIVILEGES so future tables/sequences
-- auto-grant. Does NOT install the enforcing policy or FORCE RLS (Phase 2/3).
--
-- RUN:  psql "$SUPERUSER_DATABASE_URL" -v apppw="$(openssl rand -hex 24)" \
--            -f apps/backend/scripts/rls/gacp-app-provision.sql
--       (capture apppw → it becomes gacp_app's DATABASE_URL, Task 3.)
\set ON_ERROR_STOP on
\if :{?apppw}
\else
  \echo '*** ABORT: pass the gacp_app password via -v apppw=... (openssl rand -hex 24). Never hardcode. ***'
  \quit
\endif

BEGIN;

-- 1. least-privilege login role (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='gacp_app') THEN
    EXECUTE format('CREATE ROLE gacp_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD %L', :'apppw');
  ELSE
    EXECUTE format('ALTER ROLE gacp_app LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD %L', :'apppw');
    RAISE NOTICE 'gacp_app already existed — password reset, least-priv flags reasserted.';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO gacp_app;

-- 2. DML on EVERY public base table (NO relrowsecurity filter — the whole fix).
DO $$
DECLARE r RECORD; n INT := 0;
BEGIN
  FOR r IN
    SELECT c.relname FROM pg_class c
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE c.relkind = 'r' AND ns.nspname = 'public'
    ORDER BY c.relname
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO gacp_app', r.relname);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'Granted DML on % public base tables to gacp_app.', n;
END $$;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gacp_app;
GRANT EXECUTE ON FUNCTION rls_observe_check(TEXT, TEXT) TO gacp_app;
GRANT EXECUTE ON FUNCTION current_tenant_id() TO gacp_app;

-- 3. DRIFT-PROOF: future tables/sequences created by THIS (superuser/migration)
--    role auto-grant to gacp_app, so the coverage can never rot again.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gacp_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO gacp_app;

-- NOTE: the policy body stays SELECT TRUE (migration 20260502060000). NO enforcing
-- flip and NO FORCE ROW LEVEL SECURITY here — enforcement is Phase 2/3.
COMMIT;

DO $$ BEGIN RAISE NOTICE 'gacp_app provisioned (role + all-table grants + default privileges). Policy unchanged (SELECT TRUE). Now run the coverage probe.'; END $$;
```

> **Migration-role caveat (put in the SQL's header comment):** `ALTER DEFAULT PRIVILEGES` only auto-grants tables created by the role that RAN this script. If `prisma migrate deploy` runs as a DIFFERENT role than the one that runs this provisioning, add `FOR ROLE <migration_role>`. The Task-2 probe is the backstop that catches any table the default-privileges missed — run it in CI after every migration.

- [ ] **Step 4: Run it — expect PASS.** `cd apps/backend && npx jest gacp-app-provision-sql` → 4/4 green.

- [ ] **Step 5: Commit.**
```bash
git add apps/backend/scripts/rls/gacp-app-provision.sql apps/backend/__tests__/unit/gacp-app-provision-sql.test.js
git commit -m "feat(rls): gacp_app provisioning — all-table grants + drift-proof default privileges, policy untouched (Phase 1)"
```

---

### Task 2: coverage probe (drift-catcher — fails if any public table is ungranted)

**Files:**
- Create: `apps/backend/scripts/rls/gacp-app-coverage-probe.js`
- Test: `apps/backend/__tests__/unit/gacp-app-coverage-probe.test.js`

**Interfaces:**
- Produces: `findUngrantedTables(prisma) → Promise<Array<{table, missing: string[]}>>` — every public base table on which `gacp_app` lacks any of SELECT/INSERT/UPDATE/DELETE. CLI wrapper (DATABASE_URL-gated) exits 1 + prints the gaps if the array is non-empty, else exits 0. Run in CI after migrations + on staging pre-cutover to prove Task 1's grants are complete.

- [ ] **Step 1: Write the failing unit test** — `gacp-app-coverage-probe.test.js`:

```javascript
'use strict';
const { findUngrantedTables } = require('../../scripts/rls/gacp-app-coverage-probe');

// A fake prisma whose $queryRawUnsafe answers the two catalog queries the probe issues.
function makePrisma({ tables, grants }) {
  return {
    $queryRawUnsafe: jest.fn(async (sql, ...args) => {
      if (/pg_class/.test(sql)) { return tables.map((t) => ({ relname: t })); }
      // role_table_grants lookup for one table (table name is the bound arg)
      const table = args[0];
      return (grants[table] || []).map((p) => ({ privilege_type: p }));
    }),
  };
}

describe('findUngrantedTables', () => {
  const ALL4 = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
  test('returns empty when gacp_app has full DML on every table', async () => {
    const prisma = makePrisma({ tables: ['applications', 'receipt_sequences'], grants: { applications: ALL4, receipt_sequences: ALL4 } });
    expect(await findUngrantedTables(prisma)).toEqual([]);
  });
  test('reports a table that is missing grants (the boot-breaker case)', async () => {
    const prisma = makePrisma({ tables: ['applications', 'receipt_sequences'], grants: { applications: ALL4, receipt_sequences: [] } });
    expect(await findUngrantedTables(prisma)).toEqual([{ table: 'receipt_sequences', missing: ALL4 }]);
  });
  test('reports a partial grant (only SELECT)', async () => {
    const prisma = makePrisma({ tables: ['x'], grants: { x: ['SELECT'] } });
    expect(await findUngrantedTables(prisma)).toEqual([{ table: 'x', missing: ['INSERT', 'UPDATE', 'DELETE'] }]);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (module missing). `cd apps/backend && npx jest gacp-app-coverage-probe`

- [ ] **Step 3: Implement the probe** — `gacp-app-coverage-probe.js` (uses `@prisma/client`, no new dep):

```javascript
'use strict';
const DML = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];

async function findUngrantedTables(prisma) {
  const tables = await prisma.$queryRawUnsafe(
    `SELECT c.relname FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
     WHERE c.relkind='r' AND ns.nspname='public' ORDER BY c.relname`,
  );
  const gaps = [];
  for (const { relname } of tables) {
    // eslint-disable-next-line no-await-in-loop
    const rows = await prisma.$queryRawUnsafe(
      `SELECT privilege_type FROM information_schema.role_table_grants
       WHERE grantee='gacp_app' AND table_schema='public' AND table_name=$1`, relname);
    const have = new Set(rows.map((r) => r.privilege_type));
    const missing = DML.filter((p) => !have.has(p));
    if (missing.length) { gaps.push({ table: relname, missing }); }
  }
  return gaps;
}

module.exports = { findUngrantedTables };

if (require.main === module) {
  (async () => {
    if (!process.env.DATABASE_URL) { console.log('SKIP: no DATABASE_URL'); process.exit(0); }
    // eslint-disable-next-line global-require
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    try {
      const gaps = await findUngrantedTables(prisma);
      if (gaps.length) {
        console.error(`FAIL: ${gaps.length} public tables lack full DML for gacp_app:`);
        for (const g of gaps) { console.error(`  ${g.table}: missing ${g.missing.join(',')}`); }
        process.exit(1);
      }
      console.log('PASS: gacp_app has full DML on every public base table.');
    } finally { await prisma.$disconnect(); }
  })();
}
```

- [ ] **Step 4: Run it — expect PASS.** `cd apps/backend && npx jest gacp-app-coverage-probe` → 3/3.

- [ ] **Step 5: Commit.**
```bash
git add apps/backend/scripts/rls/gacp-app-coverage-probe.js apps/backend/__tests__/unit/gacp-app-coverage-probe.test.js
git commit -m "feat(rls): gacp_app coverage probe — CI drift-catcher for ungranted tables (Phase 1)"
```

---

### Task 3: point `DATABASE_URL` at `gacp_app` (reversible config switch)

**Files:**
- Modify: `docker-compose.yml`, `docker-compose.production.yml`, `docker-compose.staging.yml`, `docker-compose.local-prod.yml` (the `DATABASE_URL`/`DB_USER` assembly — audit cited `docker-compose.yml:49` `${DB_USER:-gacp}`; LOCATE the real lines, they may have drifted)

**Interfaces:**
- Consumes: the `gacp_app` role provisioned in Task 1. Produces: the app's `DATABASE_URL` resolves to `gacp_app` credentials, with a one-env-var rollback to `gacp`.

- [ ] **Step 1: Locate every place `DATABASE_URL` is assembled** — grep `DB_USER`, `DATABASE_URL`, `gacp` in the four compose files + `docs/operations/env-layering.md`. Confirm the audit's claim that role flows from `${DB_USER:-gacp}` and nothing in app code branches on the role name (`grep -rn "gacp'" apps/backend/{services,routes,middleware,config}` — expect no role-name logic).

- [ ] **Step 2: Change the default DB role to `gacp_app`, keeping rollback.** In each compose file, change `${DB_USER:-gacp}` → `${DB_USER:-gacp_app}` so the app connects as `gacp_app` by default, and rollback is a single `DB_USER=gacp` override (document this in the runbook, Task 5). The `gacp_app` password comes from the same secret mechanism the `gacp` password used (the compose `${DB_PASSWORD}` / secret — verify it's the SAME var or add `DB_APP_PASSWORD`; do NOT hardcode).

- [ ] **Step 3: Verify no code path breaks** — run the backend unit suite (`cd apps/backend && npx jest --selectProjects unit 2>/dev/null || npx jest __tests__/unit`) to confirm nothing reads a hardcoded `gacp` role. (The real gacp_app run is staging, Task 5.)

- [ ] **Step 4: Commit.**
```bash
git add docker-compose*.yml
git commit -m "config(rls): default DATABASE_URL role to gacp_app (reversible via DB_USER=gacp) (Phase 1)"
```

---

### Task 4: give operator-run privileged scripts a separate superuser connection

**Files:**
- Modify: `apps/backend/scripts/clear-for-uat.js` (audit cited `:90` reads `DATABASE_URL`, `:161` TRUNCATE), `apps/backend/scripts/migrate-user-types.js` (`:69`/`:81` ALTER/DROP), `apps/backend/scripts/run-role-canonicalization.sh` (`:107` TRUNCATE) — LOCATE the real connection lines.

**Interfaces:**
- Produces: each privileged operator script connects via `process.env.ADMIN_DATABASE_URL` (falling back to `DATABASE_URL` ONLY if unset, with a loud warning), so after the Task-3 cutover (`DATABASE_URL`=gacp_app, which lacks TRUNCATE/ALTER/DROP) these scripts still work when given the superuser URL.

- [ ] **Step 1: Write a failing test** for the connection resolution — `apps/backend/__tests__/unit/admin-db-url-resolution.test.js`:

```javascript
'use strict';
const { resolveAdminDbUrl } = require('../../scripts/lib/admin-db-url');
describe('resolveAdminDbUrl', () => {
  test('prefers ADMIN_DATABASE_URL', () => {
    expect(resolveAdminDbUrl({ ADMIN_DATABASE_URL: 'postgres://super@h/db', DATABASE_URL: 'postgres://app@h/db' }))
      .toEqual({ url: 'postgres://super@h/db', usedFallback: false });
  });
  test('falls back to DATABASE_URL with a warning flag when ADMIN unset', () => {
    expect(resolveAdminDbUrl({ DATABASE_URL: 'postgres://app@h/db' }))
      .toEqual({ url: 'postgres://app@h/db', usedFallback: true });
  });
  test('throws when neither is set', () => {
    expect(() => resolveAdminDbUrl({})).toThrow(/ADMIN_DATABASE_URL/);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (module missing).

- [ ] **Step 3: Implement the shared resolver** — `apps/backend/scripts/lib/admin-db-url.js`:

```javascript
'use strict';
// Privileged operator scripts (TRUNCATE/ALTER/DROP) must NOT use the app's
// gacp_app DATABASE_URL after the Phase-1 cutover — gacp_app lacks those rights.
function resolveAdminDbUrl(env = process.env) {
  if (env.ADMIN_DATABASE_URL) { return { url: env.ADMIN_DATABASE_URL, usedFallback: false }; }
  if (env.DATABASE_URL) { return { url: env.DATABASE_URL, usedFallback: true }; }
  throw new Error('resolveAdminDbUrl: set ADMIN_DATABASE_URL (a superuser connection) for privileged maintenance scripts.');
}
module.exports = { resolveAdminDbUrl };
```

- [ ] **Step 4: Wire each script to it** — in `clear-for-uat.js` + `migrate-user-types.js`, replace the direct `process.env.DATABASE_URL` connection with `const { url, usedFallback } = require('./lib/admin-db-url').resolveAdminDbUrl(); if (usedFallback) console.warn('[admin-db] ADMIN_DATABASE_URL unset — falling back to DATABASE_URL; will FAIL under gacp_app');` and use `url`. For the `.sh` script, read `${ADMIN_DATABASE_URL:-$DATABASE_URL}` with an echoed warning on fallback. (Match each file's existing connection idiom.)

- [ ] **Step 5: Run — expect PASS + no regression** (`npx jest admin-db-url-resolution`, and re-run any existing tests of those scripts). Commit.
```bash
git add apps/backend/scripts/lib/admin-db-url.js apps/backend/scripts/clear-for-uat.js apps/backend/scripts/migrate-user-types.js apps/backend/scripts/run-role-canonicalization.sh apps/backend/__tests__/unit/admin-db-url-resolution.test.js
git commit -m "chore(rls): privileged scripts use ADMIN_DATABASE_URL (superuser), not the app role (Phase 1)"
```

---

### Task 5: cutover runbook (staged, reversible, reviewer#2-gated)

**Files:**
- Create: `docs/operations/rls-phase1-gacp-app-cutover.md`

**Interfaces:** Consumes Tasks 1-4. Produces the operator's staging→prod execution guide. Docs only — no test.

- [ ] **Step 1: Write the runbook** with these exact sections (no placeholders — real commands):
  1. **Pre-req:** a superuser connection (`SUPERUSER_DATABASE_URL`) + a generated `gacp_app` password.
  2. **Provision (staging first):** `psql "$SUPERUSER_DATABASE_URL" -v apppw="$(openssl rand -hex 24)" -f apps/backend/scripts/rls/gacp-app-provision.sql` — capture `apppw`.
  3. **Verify grants:** `DATABASE_URL="$SUPERUSER_DATABASE_URL" node apps/backend/scripts/rls/gacp-app-coverage-probe.js` → must print `PASS`. (Run this in CI after every migration too.)
  4. **Cut over staging:** set `DB_USER=gacp_app` + `DB_APP_PASSWORD=<apppw>`; restart the backend; run the full test suite + smoke the boot-critical paths (login, an application read/write, a checkout, a Stripe webhook) — watch logs for `permission denied for table` for a **stable window** (≥ 1 business day).
  5. **Set `ADMIN_DATABASE_URL`** (the superuser URL) wherever `clear-for-uat`/`migrate-user-types`/`run-role-canonicalization` run.
  6. **Prod cutover** — owner **+ reviewer #2** sign-off (GOALS G3), same steps against prod, in a maintenance window.
  7. **Rollback (instant):** set `DB_USER=gacp` (+ the gacp password) and restart — the app is back on the superuser role; nothing else changed (policy was never touched).
  8. **Explicitly NOT in Phase 1:** the enforcing policy flip + `FORCE RLS` — those are Phase 2/3, separately planned + reviewer#2-gated.

- [ ] **Step 2: Commit.**
```bash
git add docs/operations/rls-phase1-gacp-app-cutover.md
git commit -m "docs(rls): Phase 1 gacp_app cutover runbook — staged, reversible, reviewer#2-gated"
```

---

## Self-review
**Spec coverage (§5 Phase 1 = "move to gacp_app, policy still permissive, prove grants, decoupled, run stable before any policy change"):** role move (Tasks 1+3), policy untouched (Task 1 asserts no flip/FORCE), grants proven (Task 2 probe), decoupled (no enforcement anywhere), stable-window + reversible + reviewer#2 (Task 5). The audit's blocker (allow-list → all-tables) = Task 1; drift-proofing (default privileges + CI probe) = Tasks 1+2; operator-script separation = Task 4. No spec requirement unmapped.

**Placeholder scan:** the SQL, the probe, the resolver, and the tests are complete real code. Tasks 3-4 point at compose/script files whose exact lines the implementer LOCATES (numbers drift) — the change + the test are specified. Task 5 is a docs runbook with real commands. No TBD/"handle edge cases".

**Type consistency:** `findUngrantedTables(prisma) → [{table, missing[]}]` (Task 2) used identically in its test + CLI. `resolveAdminDbUrl(env) → {url, usedFallback}` (Task 4) consistent across resolver + test + callers. The provisioning SQL's grant set (SELECT/INSERT/UPDATE/DELETE) matches exactly what the probe checks for. DRY: one provisioning SQL, one probe, one admin-url resolver.

**YAGNI/reversibility:** no enforcement, no new deps (probe uses `@prisma/client`), rollback = one env var. The live cutover is staging-gated + operator-run — the in-session deliverable is the four artifacts + the runbook, all structurally tested; the real `gacp_app` validation is the probe + full suite on staging.
