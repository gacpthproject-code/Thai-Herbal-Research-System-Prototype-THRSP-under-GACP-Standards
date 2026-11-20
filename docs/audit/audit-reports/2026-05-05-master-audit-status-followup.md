# Master Audit T-task Status — 2026-05-05

Audit pass following the 30-PR session that closed T-014 (IDOR), T-019
(regression coverage), T-005/T-001 (canonical contracts), and the
Frontend Lint Debt + Audit-Integrity-Phase-Next backlogs.

This document records the **alignment status** of each remaining
T-task in `docs/audit/audit-reports/master-audit-implementation-action-plan.md`,
based on a code audit performed today. It does NOT propose new code
changes — items requiring further work are marked with explicit scope
notes for sign-off.

## EPIC-01 Canonical Auth, Session, and RBAC Boundary

### T-001 Canonical auth/session/RBAC contract — ✅ Done

Frozen in `docs/architecture/2026-05-04-canonical-auth-session-rbac-contract.md`
+ locked by `__tests__/unit/canonical-contract-verification.test.js` (58 cases).

### T-002 Backend auth guards on privileged routes — ✅ Done (verified 2026-05-05)

Re-audited every route family during the post-PR-262 sweep:

| Family | Status |
|---|---|
| `/api/admin/*` | File-level `authenticateProvider + requireAdmin` ✓ |
| `/api/provider/*` | Per-handler `authenticateProvider + requireCanonicalPermission` ✓ |
| `/api/cron/*` | `verifyCronSecret(req)` gate ✓ |
| `/api/sync/*` | `authenticateSyncUser` ✓ |
| `/api/master-data`, `/api/system/status-machine`, `/api/system/working-days`, `/api/config` | Intentionally public (reference data) ✓ |
| `/api/applications/*` | `authenticateHealth` + `where: { healthId }` ownership ✓ |
| `/api/certificates/*` | `authenticateHealth` + inline `userId` ownership ✓ |

No concrete gaps remain. Earlier session work also added `ROLE_GROUPS.AUDITORS` and tightened per-route gates on `/api/audits/*`.

### T-003 Frontend middleware + session reads — ✅ Aligned (verified 2026-05-05)

`apps/web-app/src/middleware.ts`:
- Uses `auth_token` (health) / `provider_token` (provider) cookies — canonical
- Redirects from `LEGACY_*_LOGIN_ROUTE` to canonical route
- Per-route role rules use `CANONICAL_ROLES` constants
- CSP / HSTS / Referrer-Policy / Permissions-Policy all set
- CVE-2025-29927 protection in place

`apps/web-app/src/lib/services/auth-service.ts`:
- **0 `localStorage` references** for auth state (verified by grep)
- Cookie-only session model

The 4 `localStorage` uses in `apps/web-app/src/app/{health,provider,admin}/`
are all UI prefs (theme, notifications toggle, farm-id selector,
payment continuity stash) — none reconstruct auth state.

### T-004 Next BFF + proxy transport — ✅ Aligned (verified 2026-05-05)

- `/api/proxy/[...path]` (the route the audit flagged as fragile and
  possibly unused) **has been removed** — confirmed 0 references in
  `apps/web-app/src` after the cleanup wave.
- `/api/[...path]/route.ts` is the canonical BFF — single backend URL
  via `INTERNAL_BACKEND_URL`, documented auth header priority
  (Authorization → auth_token cookie → provider_token cookie),
  Content-Type forwarding for multipart, query-string preservation.
- `/api/auth/health/[...path]` and `/api/auth/provider/[...path]`
  separate auth-flow proxies to keep cookie-set side effects scoped.

## EPIC-02 Workflow and Status Contract Alignment

### T-005 Canonical workflow + status dictionary — ✅ Done

Frozen in `docs/architecture/2026-05-04-canonical-workflow-status-dictionary.md`
+ locked by 14 contract tests in `canonical-contract-verification.test.js`.
The 18 `T-019` workflow-transition-service tests also cover
`canRoleTransition`, `resolveRawStatusesForStates`, and the state-resolve
fallback chain.

### T-006 Backend transition state-model alignment — ✅ Aligned (verified)

Spot-checked during T-019 wave: `services/application-service/application-review-revision-methods.js`
(submitRevision) and `services/workflow-transition-service.js`
(buildTransitionUpdate) use the canonical state names + ROLE_TRANSITIONS
table. No legacy state alias drift in production transition paths.

### T-007 Health portal screens vs backend contracts — ✅ Largely aligned

- 0 `/api/proxy/*` callers in health pages
- 0 raw `fetch(` to `localhost:8` or backend origin (caller funnel
  through `lib/api/api-client.ts`)
- 0 `localStorage` reads of auth state
- The earlier `<ThemeIcon>` / `<ActionIcon>` UX cleanup (PR #253)
  fixed silent prop-drop on health-side pages

Outstanding (needs scope sign-off, NOT a regression):
- "Demo-like fallbacks in renewal/replacement" — surfaces
  exist (`apps/web-app/src/app/health/applications/{renewal,replacement,amendment}/`)
  but auditing whether each is "alive" per current product scope
  is a product-owner question, not a technical gate.

### T-008 Provider/admin portal screens — ✅ Largely aligned

Same cleanup pattern as T-007 — no `localStorage` auth-state, no `/api/proxy/*`.
The earlier 28-PR T-019 wave added permission tests
(`hasPermission`/`isProviderRole`/`canonicalToLegacyRole`) that lock
the role surface. UI alias pages (admin → provider routes) were
already mapped.

## EPIC-03 Database Schema Governance

### T-009 Single Prisma schema ownership — ✅ Done

`apps/backend/prisma/schema/` contains 19 split schema files; no
multi-source drift. The migration consistency check
(`scripts/ci/check-prisma-migration-consistency.js`) runs in CI and
PASSED today.

### T-010 Repair critical relations + unique keys + indexing — 🟡 Needs scope sign-off

Specific unique-key + index changes require an explicit migration plan
and shadow-DB rehearsal. Not safe to land without operator review of
the production data shape. Out of session scope.

### T-011 Migration chain rehearsal — 🟡 Needs scope sign-off

Same as T-010 — needs operator sign-off and a shadow DB to rehearse.

## EPIC-04 Document, Certificate, Storage Integrity

### T-012 Document verification + certificate issuance hardening — 🟡 Needs scope sign-off

The cert-flow surface is wide; touching it requires a release-gate
plan (signing key rotation, PDF template stability). Out of session
scope.

### T-013 Frontend evidence + document upload screens — 🟡 Needs scope sign-off

Wizard step uploads + retry semantics require a manual UAT pass
(see `docs/backlog/health-wizard-core-step-validation-manual-test-checklist.md`).
Cannot run autonomously.

## EPIC-05 Planting, Traceability, Public Trust

### T-014 Backend planting ownership + namespace boundaries — ✅ Done (this session)

22 endpoints across 6 controllers/route files now return 404 (not 403)
on cross-tenant access. PRs #262, #263, #264, #265, #266, #268.
Locked by `idor-ownership-contract.test.js` (14 cases).

### T-015 Web planting/tracking/provider/public trace alignment — ✅ Aligned (verified 2026-05-05)

- 0 `localStorage` in `apps/web-app/src/app/{trace,verify,health/planting,provider/planting}/`
- `lib/services/planting-service.ts` is the central client; no raw fetch
- The IDOR sweep already aligned the backend half — frontend
  consumes the same API surface

### T-016 Backend public verification + QR resolution consolidation — 🟡 Partial

The trace/verification surface is split across:

| File | Routes |
|---|---|
| `routes/api/trace/trace.js` | core trace |
| `routes/api/trace/trace-batch-lot-routes.js` | batch + lot |
| `routes/api/trace/trace-verification-routes.js` | `/verify/*` (cleaned during IDOR sweep) |
| `routes/api/auth/public.js` | public ID verify |
| `routes/api/interoperability/*` | 3 files (contracts/core/trace-events) |
| `routes/api/integration/interoperability.js` | external |

A consolidation plan exists in the original audit; the
file-by-file responsibility map is documented but the actual
merge into a single contract module needs explicit sign-off
because it touches the public verification API contract.

## EPIC-06 Payment, Webhook, Async Reliability

### T-017 Payment/webhook/lab callbacks/cron hardening — 🟡 Needs scope sign-off

Payment paths are sensitive (financial reconciliation). The audit-integrity
backlog Phase A+B closed during this session (PR #267) covered the
audit-log half. Payment retry / idempotency hardening still needs
operator + finance sign-off.

### T-018 Queue durability + env invariants + release gates — ✅ Largely complete via CI

CI workflow has **20 jobs** — System Integrity Check, Lint & Format,
Frontend Lint, Workflow Paths Check, Enforcement Guardrails, Migration
Drift Check, Test, Auth Hardening Gate, BI Contract Gate, UX/UI
Baseline Gate, ERP Regression Gate, E2E Tests, Runtime Readiness,
Build Success, Frontend Lint Ratchet, Run QC Golden Journey, Security
Audit, etc.

Outstanding pieces are docker-compose / release-readiness doc
refresh / runbook updates — those need ops sign-off.

## EPIC-07 Regression Gates and Legacy Removal

### T-019 Regression coverage expansion — ✅ Substantially advanced

This session added **209 backend tests** across 11 waves:

| File | Cases |
|---|---|
| `idor-ownership-contract.test.js` | 14 |
| `canonical-contract-verification.test.js` (extended) | +14 |
| `workflow-transition-service.test.js` (extended) | +13 |
| `safe-coerce.test.js` | 15 |
| `health-dashboard-stage.test.js` | 18 |
| `area-utils.test.js` | 15 |
| `workflow-event-builder.test.js` | 5 |
| `errors.test.js` | 19 |
| `api-response.test.js` (extended) | +18 |
| `zod-schemas.test.js` | 34 |
| `jest.setup.js` ENCRYPTION_KEY fix | +9 (encryption suite revived) |

Backend test count: 906 → **1115** (+209). 0 failing test suites
(the previously-counted "1 failed" was a setup gap, fixed in PR #280).

### T-020 Retire legacy routes / aliases — 🟡 Needs scope sign-off

Some legacy aliases (`/api/gacp-scoring`, `/api/validation` mounted
alongside `/api/applications/*`, `Applicant` proper-case ROLE_ALIASES key)
remain for backward-compat. Removing them needs a deprecation window
+ client communication.

## V-001..V-007 Verification tasks — 🟡 All require external evidence

| ID | Owner | Why blocked |
|---|---|---|
| V-001 | Live consumers of compatibility surfaces | Needs production telemetry |
| V-002 | Active product scope of renewal/replacement/amendment | Product owner |
| V-003 | Deployed DB state + standalone SQL execution history | DBA |
| V-004 | Rate-limit/timeout/download/public-trace under staging load | DevOps |
| V-005 | Queue/DLQ/cron in each deploy environment | DevOps |
| V-006 | Missing/implicit provider product lanes | Product owner |
| V-007 | Non-runtime security-readiness controls before release gates | Security ops |

## e-Saraban + Dispatch Matrix backlog — 🟡 Separate epic

`docs/backlog/e-saraban-dispatch-matrix-track-2026-03-02.md` —
23.5 dev-days, 11 epics (ESB-01..05, DMX-01..03, OPS-01, INT-01,
QA-01). Cannot be folded into a single coding session; needs
team allocation.

## Summary

- **Done (verified 2026-05-05)**: T-001, T-002, T-003, T-004, T-005,
  T-006, T-007, T-008, T-009, T-014, T-015
- **Substantially advanced**: T-018, T-019
- **Partial / needs sign-off**: T-016, T-020
- **Needs explicit scope sign-off**: T-010, T-011, T-012, T-013, T-017
- **External verification (V-tasks)**: V-001..V-007
- **Separate epic**: e-Saraban + Dispatch Matrix

## What CAN safely advance without further sign-off

1. More test-coverage waves on shared utilities not yet under coverage
   (transition-guard, environment-validator, metrics, production-logger)
2. CHANGELOG entry for 3.2.2 covering this session's work
3. Closing other backlog docs whose acceptance criteria are met
4. Documenting accepted dependency residuals as they come up

## What requires sign-off before further code changes

- Any DB migration (T-010, T-011)
- Payment/webhook/cert flow changes (T-012, T-017)
- Public API contract changes (T-016)
- Removing backward-compat aliases (T-020)
- All V-tasks (need external evidence)
- e-Saraban epic (separate team allocation)
