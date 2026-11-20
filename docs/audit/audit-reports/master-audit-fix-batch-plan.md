# Master Audit Fix Batch Plan

Basis:
- Source issues come from `docs/master-audit-consolidation-report.md`
- Task mapping comes from `docs/master-audit-implementation-action-plan.md`
- Scope here includes only `Confirmed` issues with priority `P0` or `P1`

Selection set included in this plan:
- `P0`: `M-001`, `M-003`, `M-004`, `M-005`, `M-006`, `M-008`, `M-011`, `M-013`, `M-014`, `M-017`
- `P1`: `M-002`, `M-007`, `M-009`, `M-010`, `M-012`, `M-015`, `M-016`, `M-019`, `M-022`

Batching rules:
- Do not mix unrelated high-risk changes in one merge stream.
- Fix route-level exposure and data-corruption risk before broad UI refactors.
- Keep frontend, backend, database, auth/RBAC, async jobs, and deployment concerns separated unless the runtime chain is the same.
- Prefer batches that can be regression-tested in isolation.

## Fix Batches

### Batch FB-01

- Batch ID: `FB-01`
- Objective: Close immediate backend authorization, RBAC, and tenant-isolation gaps with the smallest possible blast radius.
- Included Issues: `M-003`, `M-004`, `M-011`
- Why grouped together: All three are route-level backend security boundaries. They share the same fix surface: auth middleware, canonical RBAC, route guards, and farm ownership checks. They do not require large frontend rewrites to land safely.
- Affected Layers: `Backend`, `Auth`, `RBAC`
- Files/Modules likely affected: `apps/backend/shared/canonical-rbac.js`, `apps/backend/shared/auth.js`, `apps/backend/middleware/auth-middleware.js`, `apps/backend/middleware/admin-auth-middleware.js`, `apps/backend/routes/api/admin/config.js`, `apps/backend/routes/api/admin/plants.js`, `apps/backend/routes/api/criteria.js`, `apps/backend/routes/api/identity.js`, `apps/backend/routes/api/certificates.js`, `apps/backend/routes/api/site-analyses.js`, `apps/backend/routes/api/training-records.js`, `apps/backend/services/site-analysis-service.js`, `apps/backend/services/training-record-service.js`
- Dependency / prerequisite: Quick sign-off on canonical role/permission matrix from `T-001`; no schema migration dependency required to start.
- Risk level: `High`
- Required tests before merge: negative authz tests for admin/config/plants/criteria/identity/certificate download; positive role tests for admin and intended Provider roles; cross-tenant negative tests for site analysis and training records; certificate download ownership tests.
- Rollback concern: Tightening guards can lock out paths currently relied on by undocumented users; rollback must preserve audit logs of denied access changes.
- Recommended owner: `Backend` with `Security / Architecture review`
- Mapped implementation tasks: `T-001`, `T-002`, `T-014`, `T-019`

### Batch FB-02

- Batch ID: `FB-02`
- Objective: Make payment, webhook, callback, and async enforcement safe enough that finance and machine-to-machine paths stop corrupting workflow state.
- Included Issues: `M-005`, `M-013`, `M-014`
- Why grouped together: These issues share the same runtime chain: payment creation, webhook handling, lab callbacks, offline sync, cron enforcement, and queue/DLQ behavior. Fixing them together avoids reworking the payment state machine multiple times.
- Affected Layers: `Backend`, `Async jobs`, `Deployment`
- Files/Modules likely affected: `apps/backend/routes/api/payments.js`, `apps/backend/routes/api/webhooks.js`, `apps/backend/routes/api/callbacks.js`, `apps/backend/routes/api/sync.js`, `apps/backend/routes/api/cron.js`, `apps/backend/services/workflow-transition-service.js`, `apps/backend/services/payment-service-phase-flow.js`, `apps/backend/services/payment-service-webhook-flow.js`, `apps/backend/services/queue-service.js`, `apps/backend/jobs/webhook-dlq-processor.js`, `apps/backend/jobs/scheduler.js`
- Dependency / prerequisite: `FB-01` merged; canonical workflow/status matrix approved from `T-005`; no UI dependency required.
- Risk level: `Critical`
- Required tests before merge: phase-1 and phase-2 payment integration tests; webhook replay tests; partial-failure rollback/compensation tests; lab callback auth tests; offline-sync auth verification tests; cron secret tests; DLQ enqueue/replay tests.
- Rollback concern: Payment-state fixes can require reconciliation of in-flight or already-misaligned records; rollback must include payment data inspection and replay strategy.
- Recommended owner: `Backend` with `DevOps` support
- Mapped implementation tasks: `T-005`, `T-006`, `T-017`, `T-018`, `T-019`

### Batch FB-03

- Batch ID: `FB-03`
- Objective: Harden the minimum critical database keys and relations that payment, ownership, and public QR resolution depend on.
- Included Issues: `M-016`, `M-017`
- Why grouped together: These are the smallest DB changes that directly support the P0 backend fixes. They affect ownership joins, payment lookup keys, and QR/public URL trust boundaries, so they should land together with one migration rehearsal path rather than as separate DB churn.
- Affected Layers: `Database`, `Backend`
- Files/Modules likely affected: `apps/backend/prisma/schema.prisma`, `apps/backend/prisma/migrations/*`, `apps/backend/services/payment-service-webhook-flow.js`, `apps/backend/services/invoice-service.js`, `apps/backend/services/certificate-service.js`, `apps/backend/services/trace-service/**/*.js`, `apps/backend/middleware/consent-manager.js`
- Dependency / prerequisite: `FB-02` logic frozen enough to know the final business keys; environment schema verification from `V-003`; backup/restore point prepared.
- Risk level: `Critical`
- Required tests before merge: shadow database migration test; restored database migration test; duplicate `gatewayRef`, `qrCode`, and `publicUrl` detection; ownership join checks for application/invoice/user; QR-resolution parity tests.
- Rollback concern: Schema hardening can fail on existing dirty data; rollback must include reverse migration or restore plan plus duplicate-record inventory.
- Recommended owner: `Database` with `Backend`
- Mapped implementation tasks: `T-010`, `T-011`, `V-003`

### Batch FB-04

- Batch ID: `FB-04`
- Objective: Normalize the web session boundary and Next proxy behavior after backend auth rules are stable.
- Included Issues: `M-001`, `M-002`
- Why grouped together: Both issues are in the web/BFF auth transport layer. They share cookies, bearer precedence, redirect handling, header forwarding, and upload/download passthrough behavior. Fixing them after backend auth hardening reduces churn and false regressions.
- Affected Layers: `Frontend`, `BFF`, `Auth`
- Files/Modules likely affected: `apps/web-app/src/middleware.ts`, `apps/web-app/src/lib/services/auth-service.ts`, `apps/web-app/src/lib/services/auth-service-api.ts`, `apps/web-app/src/lib/services/auth-provider.tsx`, `apps/web-app/src/app/page.tsx`, `apps/web-app/src/app/(auth)/login/page.tsx`, `apps/web-app/src/app/api/[...path]/route.ts`, `apps/web-app/src/app/api/proxy/[...path]/route.ts`, `apps/web-app/src/app/api/auth/health/[...path]/route.ts`, `apps/web-app/src/app/api/auth/provider/[...path]/route.ts`, `apps/web-app/src/app/api/session/set-cookie/route.ts`, `apps/web-app/src/app/api/auth/set-session-cookie/route.ts`
- Dependency / prerequisite: `FB-01` merged; canonical auth/session contract approved from `T-001`.
- Risk level: `High`
- Required tests before merge: health/provider login, refresh, logout, expired-session redirect tests; anonymous-to-protected-route redirect tests; multipart upload passthrough test; PDF/download response header preservation test; provider auth query-string forwarding test.
- Rollback concern: Portal-wide session changes can create login loops or break downloads if cookie/header behavior regresses.
- Recommended owner: `Frontend`
- Mapped implementation tasks: `T-001`, `T-003`, `T-004`

### Batch FB-05

- Batch ID: `FB-05`
- Objective: Stabilize the health applicant journey so the UI stops reporting false success and uses only active backend contracts.
- Included Issues: `M-006`, `M-008`, `M-009`
- Why grouped together: These issues all live in the health-side application flow and share wizard state, document/evidence persistence, draft/comment behavior, and wrong route-family usage. Fixing them together avoids partial UI rewrites that still rely on broken evidence or compatibility behavior.
- Affected Layers: `Frontend`, `Backend`
- Files/Modules likely affected: `apps/web-app/src/app/health/dashboard/page.tsx`, `apps/web-app/src/app/health/applications/page.tsx`, `apps/web-app/src/app/health/applications/new/**/*`, `apps/web-app/src/app/health/applications/preview/page.tsx`, `apps/web-app/src/app/health/applications/payment/page.tsx`, `apps/web-app/src/app/health/applications/replacement/page.tsx`, `apps/web-app/src/app/health/applications/renewal/**/*`, `apps/web-app/src/app/health/applications/[id]/**/*`, `apps/web-app/src/app/health/establishments/**/*`, `apps/web-app/src/app/health/certificates/page.tsx`, `apps/backend/routes/api/applications.js`, `apps/backend/routes/api/documents.js`
- Dependency / prerequisite: `FB-02`, `FB-03`, and `FB-04` merged; backend document/certificate persistence path from `T-012` available.
- Risk level: `High`
- Required tests before merge: health happy path from login to submit; replacement evidence upload test; renewal negative/positive path; amendment submission test; wizard draft save/delete test; health certificate list/download test; establishments create flow test.
- Rollback concern: Health route/query changes can strand users in stale bookmarked wizard or payment URLs.
- Recommended owner: `Frontend` with `Backend` support
- Mapped implementation tasks: `T-006`, `T-007`, `T-012`, `T-013`, `T-019`, `T-020`

### Batch FB-06

- Batch ID: `FB-06`
- Objective: Align provider/admin operations with canonical backend contracts and remove broken operational surfaces in provider workflows.
- Included Issues: `M-007`, `M-012`
- Why grouped together: Both issues are PROVIDER-facing contract drift problems. They affect provider/admin route ownership, wrong namespace usage, route visibility, planting detail flows, and dead operational controls. They should be fixed after auth/BFF foundations are stable so provider UI work does not build on a moving session boundary.
- Affected Layers: `Frontend`, `Backend`
- Files/Modules likely affected: `apps/web-app/src/app/provider/dashboard/page.tsx`, `apps/web-app/src/app/provider/applications/**/*`, `apps/web-app/src/app/provider/audits/**/*`, `apps/web-app/src/app/provider/analytics/page.tsx`, `apps/web-app/src/app/provider/accounting/page.tsx`, `apps/web-app/src/app/provider/planting/**/*`, `apps/web-app/src/app/provider/verification/**/*`, `apps/web-app/src/app/admin/users/page.tsx`, `apps/web-app/src/app/admin/settings/page.tsx`, `apps/backend/routes/api/provider/**/*`, `apps/backend/routes/api/provider.js`
- Dependency / prerequisite: `FB-01` and `FB-04` merged; PROVIDER-lane ownership decision from `V-006` if head-auditor/admin-native surfaces are still ambiguous.
- Risk level: `High`
- Required tests before merge: reviewer/scheduler/auditor/head-auditor/account/admin route access tests; provider analytics endpoint test; accounting action-button tests; provider planting detail test against canonical API; admin alias route behavior tests.
- Rollback concern: provider portals may already have hidden manual workflows or bookmarks to current alias pages.
- Recommended owner: `Frontend` with `Backend` support
- Mapped implementation tasks: `T-008`, `T-014`, `T-015`, `V-006`

### Batch FB-07

- Batch ID: `FB-07`
- Objective: Finish P1 stabilization on public trust, schema governance, and release gating so future releases stop reintroducing the same failures.
- Included Issues: `M-010`, `M-015`, `M-019`, `M-022`
- Why grouped together: These are structural stabilization tasks rather than immediate exposure hotfixes. They affect public verification truth, schema ownership, migration cleanliness, and release gate enforcement. They are safer after the direct production-critical path is already stabilized.
- Affected Layers: `Backend`, `Database`, `QA`, `Deployment`
- Files/Modules likely affected: `apps/backend/routes/api/public.js`, `apps/backend/routes/api/certificates.js`, `apps/backend/routes/api/interoperability.js`, `apps/backend/routes/api/trace.js`, `apps/backend/services/trace-service/**/*.js`, `apps/backend/prisma/schema.prisma`, `apps/web-app/prisma/schema.prisma`, `apps/web-app/src/lib/prisma.ts`, `apps/backend/prisma/migrations/*`, `scripts/production-readiness-check.js`, `scripts/run-regression-gate.js`, `tests/smoke/**/*`, `docs/preview-deploy-runbook.md`
- Dependency / prerequisite: `FB-03` complete for schema trust; `FB-05` and `FB-06` far enough along that public and portal contracts are not still moving.
- Risk level: `Medium`
- Required tests before merge: public verify/trace parity tests; clean-db and restored-db migration rehearsals; schema-drift CI check; release-gate run on target SHA; smoke suite covering authz, payment, planting, and public trust.
- Rollback concern: Public trust route consolidation and migration cleanup can affect external links or deployment playbooks if done without release-note discipline.
- Recommended owner: `Database`, `Backend`, `QA`, `DevOps`
- Mapped implementation tasks: `T-009`, `T-011`, `T-016`, `T-018`, `T-019`

## Recommended Execution Order

- Batch 1 = must-fix first
  - `FB-01`
  - Reason: closes live authorization and tenancy exposure with the lowest cross-layer blast radius.

- Batch 2 = next safest
  - `FB-02`
  - `FB-03`
  - Reason: keeps the next wave mostly in backend/database territory and stabilizes payment/async correctness before broader UI rewiring.

- Batch 3 = follow-up stabilization
  - `FB-04`
  - `FB-05`
  - `FB-06`
  - `FB-07`
  - Reason: these batches depend on the earlier backend and DB boundaries being stable, and they include broader frontend, proxy, public trust, and release-gate changes.
