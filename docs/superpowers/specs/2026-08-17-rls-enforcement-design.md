# RLS Enforcement (ADR-014 Phase E.2) — Design

**Date:** 2026-08-17
**Status:** Design — pending review → writing-plans
**Tier:** C (auth / tenant-isolation / schema / DB-role / migration) — operator merges; **and** GOALS G3 "reviewer #2 for Tier C" + the prototype's own "owner + org-#2 gate" apply to the cutover.
**Origin:** platform audit 2026-08-16 finding C2 (RLS = observe-only; by-id ops unscoped → cross-tenant read/write). GOALS G2 mandates "decide RLS in 1 week: implement OR fix the ADR to tell the truth." This spec is the *implement* path.

---

## 1. Problem (verified in code)

Tenant isolation is **observe-only by design and never enforced**:
- The DB has RLS ENABLED on ~52 tenant tables, but the per-table policy calls `rls_observe_check(...)` whose **live prod body is `SELECT TRUE`** (migration `20260502060000_rls_quiet_observe_only`) — it logs cross-tenant access, enforces nothing. Comments say "Replace with strict equality in Phase E.2" — never done.
- The app extension (`services/tenant-prisma-extension.js`) org-scopes **reads only** (`applyReadScopes`, findMany/findFirst/count), **fails open** on null context, and is flag-gated. It explicitly does NOT scope the **by-id verbs** (`findUnique/update/delete`) — comment `:210`: "by-id defense via RLS+GUC = Phase E.2 follow-up."
- **The real gap:** by-id ops have NO tenant isolation. An authenticated user in org A can `findUnique`/`update`/`delete` an org-B row by id (ids are uuids but leak through URLs, exports, references). Reads are scoped but fail-open.

**Two blockers to real enforcement (per the prototype + ADR-014):**
1. The app DB role `gacp` is **SUPERUSER + BYPASSRLS** → all policies are ignored regardless.
2. Nothing sets the `app.tenant_id` GUC per request, and Prisma's pooled auto-commit means a naive `SET LOCAL` runs on a different connection than the query.

## 2. The mechanism is already proven (do not re-derive)

`apps/backend/scripts/rls/` contains a **staging-only, reversible prototype that proves the enforcement mechanism** — this design productionizes it; it does not invent it:
- `prototype-staging-setup.sql` — creates a least-priv `gacp_app` role (NOSUPERUSER NOBYPASSRLS), grants DML on the RLS tables, installs the **enforcing** `rls_observe_check` body (`app.rls_bypass='on' OR row_org_id = current_setting('app.tenant_id', true)`), FORCEs RLS. Has a REVERT block. Refuses to run against prod `gacp_db`.
- `prototype-probe.js` — the A–E proof matrix: real org → scoped rows; fake org → 0 rows (isolation); no `set_config` → 0 rows (**fail-closed**); `app.rls_bypass=on` → full (escape hatch); broken callback form → GUC never reaches the read (proves the batch form is required).
- `extension-reference.md` — the corrected `tenant-prisma-extension` E.2.2 form (the app wiring), with every gotcha documented.

**The one pattern that makes it work** (no pgbouncer needed):
```js
prisma.$transaction([
  prisma.$executeRawUnsafe(`SELECT set_config('app.tenant_id', $1, true)`, ctx.organizationId),
  query(args),                       // the BOUND query from the EXTENDED client
]).then(([, result]) => result);
```
Array (batch) `$transaction` → both run on the same pinned connection in one tx, so the `SET LOCAL` GUC is live for the query; `set_config(..., true)` dies at COMMIT (no cross-request leak); `query(args)` is the extended client's bound query (keeps PDPA-decrypt + soft-delete).

## 3. Design — two layers, productionizing the prototype

### Layer 1 — DB (migration, from `prototype-staging-setup.sql`)
- **Least-priv app role `gacp_app`** (NOSUPERUSER NOBYPASSRLS) + DML grants on every RLS-enabled table + sequence/usage grants.
- **Swap `rls_observe_check` body** from `SELECT TRUE` to the enforcing form (`app.rls_bypass='on' OR row_org_id = current_setting('app.tenant_id', true)`), `STABLE` so the planner doesn't fold it.
- **`FORCE ROW LEVEL SECURITY`** on the tenant tables (so even the table owner is subject to the policy).
- Reversible: carry the REVERT (restore `SELECT TRUE` IMMUTABLE, NO FORCE, drop role) as a paired down-migration.

### Layer 2 — App (the E.2.2 extension wiring, from `extension-reference.md`)
- **Connect as `gacp_app`**, not the superuser `gacp` (else BYPASSRLS makes all of this inert). A new `DATABASE_URL` role.
- Rewrite `tenant-prisma-extension.js`: wrap the **by-id verbs** (`findUnique/update/delete`, and `upsert`'s update branch) and the read verbs in `withTenantGuc(client, ctx.organizationId, args, query)` when a tenant context exists, or `withBypassGuc(client, args, query)` (sets `app.rls_bypass='on'`) when `getTenantContext()` is null (the `withoutTenantScope` escape hatch for platform-admin / cron / system).
- **In-tx call sites** (e.g. `writeApplicationStatus` runs inside an interactive `$transaction`): a batch `$transaction` cannot nest inside an interactive one — for those, issue `SET LOCAL` once at the top of the *existing* tx (`tx.$executeRawUnsafe(set_config...)`) and run inner queries on that `tx`. Enumerate these call sites during writing-plans.
- **Keep the E.1 write-inject + `applyReadScopes` PERMANENTLY** — belt-and-suspenders: the DB (RLS) is the authoritative wall, the app layer is the second wall. Two independent layers is the top-tier posture; do NOT remove the app layer after cutover.

## 4. Risks & decisions (operator must weigh)

- **Role change is the highest-risk step.** Moving the app off SUPERUSER to `gacp_app` will break any op that quietly relied on superuser (raw DDL at runtime, cross-schema, `SET ROLE`, etc.). Requires an audit of what the app does at runtime beyond DML. **Fail mode if a needed grant is missing = the app errors, not a data leak** (fail-closed) — but it's an availability risk.
- **Fail-closed lockout.** A user request whose org context isn't resolved → GUC unset → policy matches nothing → 0 rows / write fails. This is the correct posture but will surface every place the tenant context is not reliably set. Must inventory + guarantee context on all authenticated routes before flipping.
- **Latency.** Every scoped op becomes a 2-statement transaction (one round-trip). Read-heavy dashboards must be benchmarked on staging before the prod gate.
- **Scope: ~52 tables.** Staged: prove on `applications` (FORCE) first, then extend.
- **Cross-tenant legitimate reads** (public verify, partner API, reconciliation) must route through `withBypassGuc` / `withoutTenantScope` — inventory them so they don't break.

## 5. Rollout — measured, progressive, reversible (top-tier discipline, NOT a big-bang flip)

**Principle** (where Google SRE "measure-before-enforce / progressive rollout / error budgets" and Apple's "defense-in-depth / caution" converge): decouple the two risky changes, shadow-measure before enforcing, canary per table, instant rollback, and never bus-factor-1 on a security-critical prod cutover. "Strict" here means rollout *discipline*, not speed.

**Phase 0 — Shadow mode (FIRST — highest leverage, lowest risk).** The observe-only policy already `RAISE NOTICE`s on every cross-tenant access and every missing `app.tenant_id` — the team built this hook but never wired it to observability. Connect those NOTICEs to metrics/alerts (parse the backend log or add a counter), deploy the GUC-setting wiring in **shadow** (set `app.tenant_id` per op but keep the policy permissive `SELECT TRUE`), and run in prod for a measurement window. **Exit criteria:** (a) a complete map of which code paths trigger cross-tenant NOTICEs, and (b) the missing-context NOTICE rate driven to **zero** (every authenticated path reliably sets the tenant context). No enforcement is on → no lockout risk. This turns the eventual flip from blind to measured.

**Phase 1 — Decouple the role change (no isolation risk).** Move the app to the least-priv `gacp_app` role with the policy STILL permissive (`SELECT TRUE`). This proves `gacp_app` has every grant the app needs, in isolation — a missing grant surfaces as an app error, never a data-behaviour change. Run stable for a window before any policy change. **Do NOT bundle the role change with the enforcement flip** — decoupled, you always know which of the two risky changes broke something.

**Phase 2 — Fix every missing-context path** found in Phase 0. Flip enforce only once the prod missing-context rate is 0 (else fail-closed = a real user lockout).

**Phase 3 — Per-table canary enforce, with an instant kill-switch.** Flip the enforcing policy on ONE table (`applications`) first; monitor isolation metrics + error rate; then expand table-by-table across the ~52. A flag / one-statement revert restores observe-only instantly. **Never big-bang all tables at once.**

**Permanent — defense-in-depth + continuous verification.** App-layer E.1 scoping stays on FOREVER alongside RLS (two independent walls). CI-gated probe A–E + a 2-org isolation integration test (`REQUIRE_DB=1`, GOALS G2) as required gates. A prod canary that periodically attempts a cross-tenant read and alerts if it ever succeeds. Benchmark read-heavy paths before each enforce step.

**Non-negotiable gate for prod enforce:** owner **+ reviewer #2** sign-off. GOALS G3 lists reviewer #2 as still-open (bus-factor 1) — **resolve that first**; a solo prod flip of multi-tenant isolation is itself an unacceptable risk that neither Google nor Apple would allow. Plus: the REVERT migration staged, the kill-switch documented + tested, and Phase-0 shadow data clean.

## 6. Testing

- The prototype probe A–E (mechanism) — already exists; wire it into CI against a 2-org staging fixture.
- New integration (`REQUIRE_DB=1`, real Postgres): 2-org fixture, assert isolation across findUnique/findMany/update/delete/upsert/raw; assert `withoutTenantScope`/admin/cron/public still see what they must; assert an unset-context request fails closed.
- Keep the app suite green with the extension rewrite (the read-scope tests + the by-id additions).

## 7. Open items for the operator

- Confirm the **role migration** is acceptable (app loses superuser) — or scope a narrower grant set.
- Confirm the **cutover gate** (owner + reviewer #2) and who reviewer #2 is (GOALS G3 lists this as still-open).
- This is a large, staged mission: **writing-plans should split it along the Phase 0–3 rollout** — (a) shadow-mode observability + the GUC-setting wiring, policy still permissive (no enforcement, no lockout risk); (b) the `gacp_app` role migration decoupled, policy still permissive; (c) the fix-missing-context sweep + CI-wired probe + 2-org `REQUIRE_DB=1` integration; (d) the per-table canary enforce + kill-switch + prod canary. Each independently testable; every prod *enforce* step is owner **+ reviewer #2** gated (resolve reviewer #2 first).
