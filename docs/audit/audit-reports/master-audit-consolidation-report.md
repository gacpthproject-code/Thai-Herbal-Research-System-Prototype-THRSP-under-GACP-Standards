# Master Audit Consolidation Report

Audit basis:
- Phase 1 runtime mapping: `docs/phase-1-system-map-index.md`
- Phase 2 frontend audit: `docs/phase-2-frontend-audit-index.md`
- Phase 3 backend audit: `docs/phase-3-backend-audit-index.md`
- Phase 4 database audit: `docs/phase-4-database-audit.md`
- Existing implementation task breakdown: `docs/master-audit-implementation-action-plan.md`
- Supporting security and readiness evidence: `docs/security-review.md`, `docs/smoke-test-execution-guide.md`, `docs/release-readiness-closeout-2026-02-22.md`, `docs/preview-deploy-runbook.md`

Consolidation rules:
- `Confirmed` = grounded in active route registration, middleware wiring, imports, handler usage, schema references, or runtime dependency graph.
- `Needs Verification` = not yet safe to treat as implementation truth without traffic, environment, or product-scope confirmation.
- Drift and inconsistency are counted as issues even when the runtime still answers requests.
- Issue IDs below are deduplicated from the detailed audit artifacts; multiple route/page findings can map into one consolidated issue.

## A. Executive Summary

- Total consolidated issues: `30`
- Confirmed issues: `23`
- Needs Verification issues: `7`
- Confirmed severity counts:
  - `Critical`: `9`
  - `High`: `11`
  - `Medium`: `3`
  - `Low`: `0`

Priority distribution:

| Priority | Confirmed | Needs Verification | Total |
| --- | --- | --- | --- |
| P0 | 10 | 1 | 11 |
| P1 | 9 | 3 | 12 |
| P2 | 4 | 2 | 6 |
| P3 | 0 | 1 | 1 |

Current production verdict:
- `No-Go` for full production release.
- Main reason: the repo still has confirmed P0 issues in authz, payment/webhook safety, tenant isolation, evidence durability, workflow-state correctness, and public/runtime data integrity.

Top 10 confirmed blockers:
1. `M-004` Weak or missing backend authorization on privileged routes.
2. `M-013` Payment creation and webhook handling are not safely idempotent or atomic.
3. `M-011` Site analysis and training records have cross-tenant ownership gaps.
4. `M-014` Lab callbacks, offline sync, cron, and DLQ safety are incomplete.
5. `M-006` Health core flows still use wrong contracts and false-success fallbacks.
6. `M-008` Evidence and document uploads are not durably wired end to end.
7. `M-005` Workflow and status dialect drift breaks cross-module transition logic.
8. `M-001` Auth/session boundary is split across frontend, BFF, and backend.
9. `M-017` Payment and QR lookup keys are not durable enough for trusted resolution.
10. `M-003` RBAC normalization differs across middleware, canonical RBAC, and legacy role paths.

Areas that are structurally usable today:
- Some read-only or lower-risk portal shells are present and navigable.
- Admin planting read-only pages and several newer planting screens have clearer loading/empty/error states than older flows.
- Release runbooks, smoke scaffolding, and restore-drill documentation already exist.

Areas that should not be treated as production-ready:
- Payment and webhook path.
- Health renewal, replacement, certificate, and establishment onboarding flows.
- Provider audit evidence and identity verification flows.
- Privileged admin/config/criteria/identity/certificate download boundaries.
- Site analysis and training record tenancy boundaries.
- Public verification and trust surfaces that must return one canonical truth.

## B. Root Cause Buckets

| Root cause bucket | Primary confirmed issues | Why it matters now | Primary owner lanes |
| --- | --- | --- | --- |
| Auth / Session Boundary | `M-001`, `M-002` | Session artifacts, redirects, cookie/header precedence, and proxy forwarding are not canonical. | Security / Architecture review, Frontend, Backend |
| RBAC / Role Drift | `M-003`, `M-004` | Frontend middleware, backend route guards, and legacy role aliases do not agree on who can do what. | Security / Architecture review, Backend, Frontend |
| Frontend-Backend Contract Drift | `M-006`, `M-007`, `M-009`, `M-012` | UI pages call wrong route families, expect stale shapes, or operate against alias/compatibility paths. | Frontend, Backend |
| Database Schema Drift | `M-015`, `M-016`, `M-017`, `M-018`, `M-019` | Schema ownership is split, relations are weak, and migrations do not guarantee one trustworthy DB state. | Database, Backend |
| Workflow / Status Transition Drift | `M-005`, `M-013` | Applicant, provider, billing, and certificate stages do not share one state machine. | Security / Architecture review, Backend |
| Validation / Error Handling Gaps | `M-008`, `M-021` | Users can see successful-looking UI or incomplete audit trails even when durable state is missing. | Frontend, Backend, QA |
| File / Document / Storage Risks | `M-008` | Evidence-backed flows do not always upload real bytes or persist verifiable records. | Frontend, Backend |
| Payment / Webhook / Async Job Risks | `M-013`, `M-014` | Financial and machine-to-machine paths can duplicate, desync, or accept untrusted writes. | Backend, DevOps |
| Traceability / Public Trust Surface Risks | `M-010`, `M-011`, `M-012`, `M-017`, `M-020` | Public QR resolution, planting oversight, and trace data trust depend on inconsistent route and data boundaries. | Backend, Frontend, Database |
| Deployment / Config / Environment Risks | `M-018`, `M-020`, `M-022` | Runtime depends on env, config, queue, and release evidence that are not fully enforced by gates. | DevOps, QA, Backend |
| Legacy Compatibility Risks | `M-009`, `M-023` | Compatibility routes and fallback code keep drift alive and make the runtime harder to reason about. | Security / Architecture review, Backend, Frontend |

## C. Prioritized Issue List

### Confirmed Issues

[Master Audit Issue]
- ID: M-001
- Status: Confirmed
- Title: Auth and session boundary is split across frontend, BFF, and backend
- Root Cause Group: Auth / Session Boundary
- Severity: Critical
- Priority: P0
- Affected Layer: Frontend, BFF, Backend
- Related Modules/Routes/Tables: `apps/web-app/src/middleware.ts`, `apps/web-app/src/lib/services/auth-service.ts`, `/api/[...path]`, `/api/auth/health/[...path]`, `/api/auth/provider/[...path]`, `apps/backend/shared/auth.js`, provider and health portal pages using localStorage auth
- Evidence basis: Phase 2 found repeated localStorage/session reconstruction and non-canonical `/login` redirects; Phase 3 found provider refresh drift and mixed auth assumptions; Phase 1 mapped mixed cookie/bearer precedence.
- User/Business Impact: Users can be redirected incorrectly, lose sessions unpredictably, or operate under the wrong session context.
- Technical Impact: The platform has no single trustworthy session boundary, which makes every auth fix fragile.
- Recommended Fix: Freeze the canonical session contract, align frontend/session middleware, and normalize BFF transport behavior.
- Dependencies: Canonical auth/session contract sign-off.
- Owner Suggestion: Security / Architecture review, Frontend, Backend
- Verification Test: Cross-portal login, refresh, logout, expired-session, and redirect tests for health and provider users.
- Rollback Concern: High if cookie names, token precedence, or refresh behavior changes without migration handling.
- Mapped Implementation Tasks: `T-001`, `T-003`, `T-004`

[Master Audit Issue]
- ID: M-002
- Status: Confirmed
- Title: Next proxy layer does not preserve one consistent transport contract
- Root Cause Group: Auth / Session Boundary
- Severity: High
- Priority: P1
- Affected Layer: BFF / Proxy Layer
- Related Modules/Routes/Tables: `/api/[...path]`, `/api/proxy/[...path]`, `/api/auth/health/[...path]`, `/api/auth/provider/[...path]`
- Evidence basis: Phase 2 confirmed JSON-only proxy behavior, dropped query params, inconsistent cookie/header forwarding, and lost binary/download semantics.
- User/Business Impact: Uploads, downloads, callbacks, and some auth flows can fail even when backend routes are correct.
- Technical Impact: The web app can mutate backend behavior at the transport layer, making route-level debugging misleading.
- Recommended Fix: Unify request/response forwarding, query preservation, auth precedence, and file-response handling.
- Dependencies: Canonical auth/session contract.
- Owner Suggestion: Frontend
- Verification Test: Multipart upload, PDF download, query-string POST, and `Set-Cookie` passthrough tests through the active proxy family.
- Rollback Concern: Medium because proxy changes can break hidden consumers if legacy paths still exist.
- Mapped Implementation Tasks: `T-004`, `V-001`

[Master Audit Issue]
- ID: M-003
- Status: Confirmed
- Title: Role normalization and route visibility drift across canonical RBAC and legacy aliases
- Root Cause Group: RBAC / Role Drift
- Severity: High
- Priority: P0
- Affected Layer: Frontend, Backend
- Related Modules/Routes/Tables: `apps/backend/shared/canonical-rbac.js`, `apps/web-app/src/middleware.ts`, provider layout/navigation, provider management role forms, ThaID auto-provisioning, legacy `reviewer_auditor` handling
- Evidence basis: Phase 1 and Phase 2 both confirmed disagreement around `reviewer_auditor`, `head_auditor`, and other role aliases; Phase 3 found compatibility paths using raw role strings.
- User/Business Impact: Valid provider can be blocked from the right screens while other users see screens or actions they should not have.
- Technical Impact: Route protection and action visibility cannot be reasoned about from one source of truth.
- Recommended Fix: Publish one role dictionary, normalize aliases once, and align frontend route visibility with backend permissions.
- Dependencies: Canonical auth/session contract.
- Owner Suggestion: Security / Architecture review, Backend, Frontend
- Verification Test: Route and button visibility tests for reviewer, scheduler, auditor, head auditor, account, and admin roles.
- Rollback Concern: Medium because role normalization changes can hide currently visible surfaces.
- Mapped Implementation Tasks: `T-001`, `T-002`, `T-003`

[Master Audit Issue]
- ID: M-004
- Status: Confirmed
- Title: Privileged backend routes still have weak or missing authorization coverage
- Root Cause Group: RBAC / Role Drift
- Severity: Critical
- Priority: P0
- Affected Layer: Backend
- Related Modules/Routes/Tables: `/api/admin/config/*`, `/api/admin/plants/*`, `/api/criteria/*`, `/api/identity/*`, `/api/certificates/:id/download`, `/api/mfa/verify`, legacy `/api/audits/reassign`
- Evidence basis: Phase 3 confirmed provider-auth-only or missing guards on multiple privileged surfaces and a public certificate download gap.
- User/Business Impact: Unauthorized users can access admin/config actions, identity review actions, or sensitive certificate assets.
- Technical Impact: The highest-risk security boundary is not enforced consistently at the route layer.
- Recommended Fix: Apply canonical permissions/admin-only guards and close public/provider auth gaps before any production release.
- Dependencies: Canonical role and permission matrix.
- Owner Suggestion: Backend
- Verification Test: Negative authz tests for every listed route family; positive tests for intended admin or Provider roles only.
- Rollback Concern: Medium because tightening guards can break undocumented consumers.
- Mapped Implementation Tasks: `T-002`, `T-012`, `T-019`

[Master Audit Issue]
- ID: M-005
- Status: Confirmed
- Title: Workflow and status dialects are not canonical across applicant, provider, billing, and certificate flows
- Root Cause Group: Workflow / Status Transition Drift
- Severity: Critical
- Priority: P0
- Affected Layer: Frontend, Backend, Database
- Related Modules/Routes/Tables: `Application.status`, `Invoice.status`, `PaymentTransaction.status`, `Certificate.status`, `/api/applications/*`, `/api/preview/*`, `/api/payments/*`, provider workflow handlers
- Evidence basis: Phase 3 and Phase 4 confirmed multiple active dialects such as `PAYMENT_1_PENDING`, `PENDING_DOC_FEE`, `UNDER_REVIEW`, `WAITING_PAYMENT_2`, and mixed invoice/certificate states.
- User/Business Impact: Users and provider can see the wrong next action or get blocked by downstream modules that interpret the same application differently.
- Technical Impact: Every cross-module flow remains vulnerable to transition bugs until one state model is enforced.
- Recommended Fix: Freeze the canonical workflow/status dictionary and align backend transitions and frontend mappings to it.
- Dependencies: Cross-team approval of the status contract.
- Owner Suggestion: Security / Architecture review, Backend, Frontend
- Verification Test: End-to-end status transition tests from submission to certificate issuance, plus frontend badge/action mapping regression tests.
- Rollback Concern: High because status migration touches filters, reports, dashboards, and old records.
- Mapped Implementation Tasks: `T-005`, `T-006`, `T-007`, `T-008`

[Master Audit Issue]
- ID: M-006
- Status: Confirmed
- Title: Health portal core flows still use wrong contracts and false-success fallbacks
- Root Cause Group: Frontend-Backend Contract Drift
- Severity: Critical
- Priority: P0
- Affected Layer: Frontend
- Related Modules/Routes/Tables: `/health/applications/*`, `/health/establishments/*`, `/health/certificates`, `/health/profile`, `/health/payments`
- Evidence basis: Phase 2 confirmed broken establishment creation path, wrong certificate namespace, renewal demo fallbacks, replacement JSON-only submit, local status reconstruction, and dead profile actions.
- User/Business Impact: Applicants can believe work succeeded when the backend never accepted the request, or they can hit dead-end flows for onboarding and certificates.
- Technical Impact: The main applicant journey is not trustworthy end to end.
- Recommended Fix: Align health pages to mounted backend contracts, remove demo fallback behavior, and wire durable success/error handling.
- Dependencies: Canonical status contract; document upload fix; auth/session alignment.
- Owner Suggestion: Frontend
- Verification Test: Health happy path, renewal, replacement, amendment, establishment creation, certificate listing, and payment handoff tests.
- Rollback Concern: Medium because page-level routing and query contracts will change.
- Mapped Implementation Tasks: `T-007`, `T-013`, `T-019`

[Master Audit Issue]
- ID: M-007
- Status: Confirmed
- Title: Provider and admin portals still operate against wrong namespaces, weak role visibility, and dead controls
- Root Cause Group: Frontend-Backend Contract Drift
- Severity: High
- Priority: P1
- Affected Layer: Frontend
- Related Modules/Routes/Tables: `/provider/dashboard`, `/provider/analytics`, `/provider/accounting`, `/provider/verification/*`, `/provider/management`, `/admin/users`, `/admin/settings`
- Evidence basis: Phase 2 confirmed provider analytics hitting `/api/reports/analytics`, accounting dead buttons, admin routes aliasing to provider pages, and role gating based on localStorage or missing altogether.
- User/Business Impact: provider can be blocked, misrouted, or shown incomplete/non-working controls during operational work.
- Technical Impact: Portal ownership is ambiguous and feature behavior does not match mounted backend boundaries.
- Recommended Fix: Rewire provider/admin pages to canonical namespaces and align visible actions with backend permissions.
- Dependencies: Canonical RBAC matrix; proxy and session normalization.
- Owner Suggestion: Frontend
- Verification Test: Reviewer, scheduler, auditor, head auditor, account, and admin UI-path tests plus action-button behavior tests.
- Rollback Concern: Medium because some current URLs are aliases over provider-owned surfaces.
- Mapped Implementation Tasks: `T-008`, `T-003`, `T-019`

[Master Audit Issue]
- ID: M-008
- Status: Confirmed
- Title: Evidence and document-backed workflows are not durably wired end to end
- Root Cause Group: File / Document / Storage Risks
- Severity: Critical
- Priority: P0
- Affected Layer: Frontend, Backend
- Related Modules/Routes/Tables: replacement, renewal, CAR uploads, wizard draft documents, provider audit evidence, document verification, storage-backed evidence flows
- Evidence basis: Phase 2 confirmed metadata-only submit paths and hidden delete/upload failures; Phase 3 confirmed document verification returns analysis without a durable record.
- User/Business Impact: Users and provider can believe evidence exists when no durable file or verification trail was actually written.
- Technical Impact: Compliance-critical workflows lack trustworthy document state.
- Recommended Fix: Wire real upload contracts, durable server-side persistence, and visible failure states across all evidence-backed flows.
- Dependencies: Proxy upload handling; document/certificate backend hardening.
- Owner Suggestion: Frontend, Backend
- Verification Test: Multipart upload tests, delete-failure tests, page-reload durability tests, and evidence-required submit blocking.
- Rollback Concern: Medium because storage contract changes can affect existing uploaded-file references.
- Mapped Implementation Tasks: `T-012`, `T-013`, `T-019`

[Master Audit Issue]
- ID: M-009
- Status: Confirmed
- Title: Applicant wizard, draft, and comment flows still depend on compatibility behavior
- Root Cause Group: Frontend-Backend Contract Drift
- Severity: High
- Priority: P1
- Affected Layer: Frontend, Backend, Database
- Related Modules/Routes/Tables: `/api/applications/*`, unmounted `wizard.js`, unmounted `application-flow.js`, `ApplicationDraft`, `ApplicationComment`
- Evidence basis: Phase 3 confirmed unmounted compatibility files and runtime fallback for missing `application_comments`; Phase 2 confirmed wizard config/path dialect inconsistency and silent fallback behavior.
- User/Business Impact: Applicants can move through a wizard shape that does not match active backend configuration, while history/comments vary by environment.
- Technical Impact: Maintainability is low because dead-looking and active-looking paths coexist.
- Recommended Fix: Collapse active applicant flow onto the mounted route family and remove silent compatibility assumptions.
- Dependencies: Canonical workflow/status contract; migration cleanup.
- Owner Suggestion: Backend, Frontend, Database
- Verification Test: Wizard-config load tests, draft/comment persistence tests, and environment-parity tests after migration cleanup.
- Rollback Concern: Medium because some old bookmarks or internal references may still assume compatibility paths.
- Mapped Implementation Tasks: `T-006`, `T-007`, `T-011`, `T-020`

[Master Audit Issue]
- ID: M-010
- Status: Confirmed
- Title: Public verification and trust surfaces can return different truths for the same certificate or trace subject
- Root Cause Group: Traceability / Public Trust Surface Risks
- Severity: High
- Priority: P1
- Affected Layer: Backend, Frontend
- Related Modules/Routes/Tables: `/verify/:certificateNumber`, `/api/certificates/verify/:certificateNumber`, `/api/interoperability/v1/*`, `/trace/*`, `Certificate`, `TraceQrSecurity`
- Evidence basis: Phase 3 confirmed duplicated public verification route families and mixed certificate field expectations; Phase 2 found public trace screens with broken fallback and navigation behavior.
- User/Business Impact: External users can receive inconsistent public trust data depending on which URL they use.
- Technical Impact: Public trust cannot be validated against one canonical source.
- Recommended Fix: Choose one canonical public truth source and align all public verify/trace surfaces or version them explicitly.
- Dependencies: QR/public URL uniqueness hardening.
- Owner Suggestion: Backend, Frontend
- Verification Test: Payload-parity tests for the same certificate/QR across every public route family.
- Rollback Concern: Medium because external links and QR labels may already reference multiple public surfaces.
- Mapped Implementation Tasks: `T-016`, `T-015`, `T-019`

[Master Audit Issue]
- ID: M-011
- Status: Confirmed
- Title: Site analysis and training record routes have cross-tenant ownership gaps
- Root Cause Group: Traceability / Public Trust Surface Risks
- Severity: Critical
- Priority: P0
- Affected Layer: Backend, Frontend
- Related Modules/Routes/Tables: `/api/site-analyses/*`, `/api/training-records/*`, `SiteAnalysis`, `TrainingRecord`, `Farm`
- Evidence basis: Phase 3 confirmed health-auth-only routers with no visible farm ownership enforcement and a mis-scoped verify action.
- User/Business Impact: One health user can potentially read or mutate another tenant's compliance evidence if IDs are known.
- Technical Impact: A core tenancy boundary is broken in a compliance domain.
- Recommended Fix: Enforce farm ownership on every farm-scoped operation and re-home provider verification actions behind the right actor boundary.
- Dependencies: None beyond normal backend auth context.
- Owner Suggestion: Backend
- Verification Test: Cross-tenant negative tests and farm-owner positive tests for create, read, update, delete, and verify actions.
- Rollback Concern: Low to medium because tightening tenancy may reveal hidden data-access assumptions.
- Mapped Implementation Tasks: `T-014`, `T-019`

[Master Audit Issue]
- ID: M-012
- Status: Confirmed
- Title: Planting namespaces, deep links, and provider detail contracts are split and inconsistent
- Root Cause Group: Frontend-Backend Contract Drift
- Severity: High
- Priority: P1
- Affected Layer: Frontend, Backend
- Related Modules/Routes/Tables: `/api/planting-cycles/*`, `/api/provider/planting-cycles/*`, root-mounted plot/unit helpers, `/provider/planting/[id]`, tracking alias routes, generated `/verify/farm/:id` links
- Evidence basis: Phase 2 confirmed provider planting detail calling health routes and linking to non-existent trace routes; Phase 3 confirmed split planting namespaces and mismatched generated verify links.
- User/Business Impact: provider and health users can land on broken planting detail or trace routes even when the underlying data exists.
- Technical Impact: Planting runtime still spans canonical and compatibility route families.
- Recommended Fix: Choose actor-specific canonical planting routes, align deep links, and retire legacy alias surfaces after parity is proven.
- Dependencies: Planting tenancy fix; public trust contract selection.
- Owner Suggestion: Backend, Frontend
- Verification Test: Health planting and provider planting detail tests, deep-link tests, and route-existence checks for generated public links.
- Rollback Concern: Medium because bookmarks and QR links may already exist for older paths.
- Mapped Implementation Tasks: `T-014`, `T-015`, `T-020`

[Master Audit Issue]
- ID: M-013
- Status: Confirmed
- Title: Payment creation and webhook handling are not safely idempotent or atomic
- Root Cause Group: Payment / Webhook / Async Job Risks
- Severity: Critical
- Priority: P0
- Affected Layer: Backend, Database
- Related Modules/Routes/Tables: `/api/payments/create`, `/api/payments/phase1/*`, `/api/payments/phase2/*`, `/api/webhooks/payment*`, `PaymentTransaction`, `Invoice`, `Application`
- Evidence basis: Phase 3 confirmed status drift between routes and services, webhook success on failure paths, narrow idempotency, and non-transactional multi-step updates; Phase 4 confirmed weak key design on `PaymentTransaction`.
- User/Business Impact: Payments can be double-processed, mismatched, or marked successful while application/invoice state is still wrong.
- Technical Impact: Financial correctness depends on best-effort application logic instead of durable guarantees.
- Recommended Fix: Align payment state machine, add stable business idempotency, and make callback updates atomic or compensating.
- Dependencies: Canonical workflow/status contract; DB uniqueness hardening.
- Owner Suggestion: Backend, Database
- Verification Test: Duplicate webhook replay tests, mid-flight failure tests, and full phase-1/phase-2 billing integration tests.
- Rollback Concern: High because payment state reconciliation on existing records may be required.
- Mapped Implementation Tasks: `T-006`, `T-017`, `T-010`

[Master Audit Issue]
- ID: M-014
- Status: Confirmed
- Title: Async callbacks, offline sync, cron, and DLQ paths are not hardened enough for production
- Root Cause Group: Payment / Webhook / Async Job Risks
- Severity: Critical
- Priority: P0
- Affected Layer: Backend, DevOps
- Related Modules/Routes/Tables: `/api/callbacks/lab-result`, `/api/sync/offline`, `/api/cron/auto-cancel`, `queue-service`, `webhook-dlq`, scheduler jobs
- Evidence basis: Phase 3 confirmed unauthenticated or weakly protected callback paths, offline sync decoding before verification, optional cron secret behavior, and best-effort DLQ exposure.
- User/Business Impact: Machine-originated writes can be spoofed or dropped, and retry safety is not guaranteed.
- Technical Impact: Background reliability depends heavily on environment luck and tolerant startup behavior.
- Recommended Fix: Authenticate/signed callback boundaries, verify JWTs before use, enforce cron secrets, and make queue/DLQ activation explicit.
- Dependencies: Environment and deploy gate enforcement.
- Owner Suggestion: Backend, DevOps
- Verification Test: Callback auth tests, offline-sync auth tests, cron secret tests, DLQ enqueue/replay drills.
- Rollback Concern: Medium because some integrations may currently rely on permissive behavior.
- Mapped Implementation Tasks: `T-017`, `T-018`, `T-019`

[Master Audit Issue]
- ID: M-015
- Status: Confirmed
- Title: Prisma schema ownership is duplicated between backend and web
- Root Cause Group: Database Schema Drift
- Severity: High
- Priority: P1
- Affected Layer: Database, Frontend
- Related Modules/Routes/Tables: `apps/backend/prisma/schema.prisma`, `apps/web-app/prisma/schema.prisma`, `apps/web-app/src/lib/prisma.ts`, `apps/web-app/src/lib/auth.ts`
- Evidence basis: Phase 4 confirmed active web Prisma usage and drift between the schema copy and backend runtime model, with no matching web migration history.
- User/Business Impact: Server-side web behavior can fail or silently omit fields in ways that differ from backend runtime.
- Technical Impact: The repo has more than one data-model source of truth.
- Recommended Fix: Establish one canonical Prisma owner and one client-generation path.
- Dependencies: None.
- Owner Suggestion: Database
- Verification Test: Schema-diff CI check, canonical Prisma generate path, and smoke tests for any remaining web Prisma reads.
- Rollback Concern: Low to medium because build or server-side auth helpers may depend on current generation behavior.
- Mapped Implementation Tasks: `T-009`

[Master Audit Issue]
- ID: M-016
- Status: Confirmed
- Title: Core relational integrity still relies on natural keys and dangling scalar references
- Root Cause Group: Database Schema Drift
- Severity: High
- Priority: P1
- Affected Layer: Database, Backend
- Related Modules/Routes/Tables: `Application.healthId`, `Invoice.healthId`, `User.healthId`, `UserConsent.userId`, `Certificate.farmId`, `Invoice.paymentTransactionId`
- Evidence basis: Phase 4 confirmed ownership via nullable `User.healthId`, no FK on `UserConsent`, and dangling scalar references on certificate and invoice models.
- User/Business Impact: Ownership and compliance records can detach from the intended account or related record without obvious runtime failure.
- Technical Impact: Data repair and join correctness are harder than they should be for core business entities.
- Recommended Fix: Harden ownership and relation integrity with explicit relational or approved denormalization rules.
- Dependencies: Canonical schema owner and migration rehearsal.
- Owner Suggestion: Database
- Verification Test: FK/dangling-reference checks, ownership migration tests, and integration tests for application, invoice, consent, and certificate joins.
- Rollback Concern: Medium because data backfills may be needed before constraints can be enforced.
- Mapped Implementation Tasks: `T-010`, `T-011`

[Master Audit Issue]
- ID: M-017
- Status: Confirmed
- Title: Payment and QR lookup keys are not durable enough for trusted resolution
- Root Cause Group: Database Schema Drift
- Severity: Critical
- Priority: P0
- Affected Layer: Database, Backend
- Related Modules/Routes/Tables: `PaymentTransaction.gatewayRef`, `PaymentTransaction.idempotencyKey`, `TraceQrSecurity.qrCode`, `TraceQrSecurity.publicUrl`
- Evidence basis: Phase 4 confirmed non-unique payment webhook lookup keys, timestamp-oriented idempotency keys, and ambiguous QR/public URL uniqueness on trace security records.
- User/Business Impact: A payment webhook can update the wrong transaction, and public trace can resolve the wrong entity.
- Technical Impact: High-risk lookup paths depend on non-durable or ambiguous keys.
- Recommended Fix: Introduce durable business uniqueness for payment and QR resolution paths and migrate existing data safely.
- Dependencies: Schema ownership and migration rehearsal.
- Owner Suggestion: Database, Backend
- Verification Test: Duplicate-key detection, webhook replay tests, and QR-resolution parity tests before and after schema change.
- Rollback Concern: High because existing duplicated records may require reconciliation.
- Mapped Implementation Tasks: `T-010`, `T-016`, `T-017`

[Master Audit Issue]
- ID: M-018
- Status: Confirmed
- Title: System configuration model and runtime usage do not match
- Root Cause Group: Deployment / Config / Environment Risks
- Severity: Medium
- Priority: P2
- Affected Layer: Backend, Database
- Related Modules/Routes/Tables: `SystemConfig`, `/api/system-config`, `/api/system`, `working-days-service`
- Evidence basis: Phase 4 confirmed runtime expecting polymorphic values and a `group` field that do not match the Prisma model.
- User/Business Impact: Admin config reads or policy-driven behavior can silently fall back to defaults or fail unexpectedly.
- Technical Impact: The runtime cannot trust its own config storage model.
- Recommended Fix: Align schema, controller usage, and config consumers to one explicit data shape and source of truth.
- Dependencies: Schema cleanup and migration rehearsal.
- Owner Suggestion: Database, Backend
- Verification Test: Config read/write tests, working-days service tests, and deploy-time config-schema validation.
- Rollback Concern: Low to medium because config value migration may be needed.
- Mapped Implementation Tasks: `T-010`, `T-011`

[Master Audit Issue]
- ID: M-019
- Status: Confirmed
- Title: Migration chain fragility keeps runtime fallback behavior alive
- Root Cause Group: Database Schema Drift
- Severity: High
- Priority: P1
- Affected Layer: Database, Backend
- Related Modules/Routes/Tables: `apps/backend/prisma/migrations/*`, standalone SQL files, fallback code in applications and config services
- Evidence basis: Phase 4 confirmed reconcile migrations, placeholder migration folders, standalone SQL beside Prisma migrations, and runtime code that still expects missing tables or schema gaps.
- User/Business Impact: Environment-to-environment behavior can differ even if the same code is deployed.
- Technical Impact: Runtime safety depends on compatibility branches rather than a trustworthy migration history.
- Recommended Fix: Rehearse and clean the migration chain, then remove schema-gap fallback code.
- Dependencies: Environment schema-state verification and canonical schema ownership.
- Owner Suggestion: Database
- Verification Test: Clean-db and upgraded-db migration rehearsals, plus fallback-removal regression tests.
- Rollback Concern: High because schema migration rollback paths must be rehearsed before production use.
- Mapped Implementation Tasks: `T-011`, `V-003`

[Master Audit Issue]
- ID: M-020
- Status: Confirmed
- Title: Performance and state-race risks are present on hot trace and planting paths
- Root Cause Group: Deployment / Config / Environment Risks
- Severity: Medium
- Priority: P2
- Affected Layer: Frontend, Backend, Database
- Related Modules/Routes/Tables: `HarvestBatch`, `TraceQrSecurity`, health planting detail screens, public trace screens, Next proxy timeout behavior
- Evidence basis: Phase 2 found large client-only planting/trace pages with race-prone effects and missing timeout behavior; Phase 4 confirmed missing farm/cycle indexes on harvest paths.
- User/Business Impact: Slow or unstable pages can look empty, stale, or inconsistent under load.
- Technical Impact: Hot runtime paths can degrade before obvious correctness alarms fire.
- Recommended Fix: Add proven indexes, reduce client-side race windows, and add timeout-aware transport and regression tests.
- Dependencies: Schema hardening and planting/trust contract alignment.
- Owner Suggestion: Frontend, Backend, Database
- Verification Test: Query-plan checks, client race regression tests, and staging load checks on trace and planting flows.
- Rollback Concern: Low to medium depending on index rollout and frontend state-model changes.
- Mapped Implementation Tasks: `T-010`, `T-015`, `V-004`

[Master Audit Issue]
- ID: M-021
- Status: Confirmed
- Title: Audit and verification trails are not fully singular or durable
- Root Cause Group: Validation / Error Handling Gaps
- Severity: Medium
- Priority: P2
- Affected Layer: Backend
- Related Modules/Routes/Tables: `AuditLog`, `audit-logger`, file fallback logs, identity review actions
- Evidence basis: Phase 3 and Phase 4 confirmed DB audit logging with a file fallback path, denormalized actor/resource references, and identity review paths that may pass incomplete reviewer identity metadata.
- User/Business Impact: Sensitive or compliance-relevant actions may not be reconstructable from one canonical audit source.
- Technical Impact: Operational forensics and compliance evidence become harder to trust.
- Recommended Fix: Make one canonical audit write path and ensure actor identity is complete on sensitive actions.
- Dependencies: Authz tightening and schema hardening.
- Owner Suggestion: Backend, Database
- Verification Test: Audit-write failure-path tests, identity-review actor attribution tests, and retention/export checks against DB-only truth.
- Rollback Concern: Medium if downstream tooling still reads file-based fallback artifacts.
- Mapped Implementation Tasks: `T-002`, `T-010`, `T-019`

[Master Audit Issue]
- ID: M-022
- Status: Confirmed
- Title: Regression and release gates do not yet block the audited runtime risks
- Root Cause Group: Deployment / Config / Environment Risks
- Severity: High
- Priority: P1
- Affected Layer: QA, DevOps, Backend, Frontend
- Related Modules/Routes/Tables: smoke journeys, backend integration tests, release readiness scripts, preview/prod runbooks
- Evidence basis: The repo already has smoke and readiness artifacts, but current audits still found critical defects that are not guaranteed to fail the existing release gate path; release evidence also references an older validated SHA.
- User/Business Impact: The same production-blocking defects can re-enter later releases without an automated stop.
- Technical Impact: Fixes are not protected by release-quality guardrails.
- Recommended Fix: Turn every confirmed P0/P1 cluster into an executable regression or deploy gate and rerun release evidence on the actual release candidate.
- Dependencies: P0 implementation work and current release-candidate environment.
- Owner Suggestion: QA, DevOps
- Verification Test: CI/release-gate execution covering authz, payment, uploads, planting tenancy, public trust, and callback paths.
- Rollback Concern: Low; the main change is stricter gating, not runtime behavior.
- Mapped Implementation Tasks: `T-018`, `T-019`

[Master Audit Issue]
- ID: M-023
- Status: Confirmed
- Title: Legacy compatibility surfaces remain active and continue to generate drift
- Root Cause Group: Legacy Compatibility Risks
- Severity: High
- Priority: P2
- Affected Layer: Frontend, Backend
- Related Modules/Routes/Tables: unmounted wizard/application-flow files, `routes/api/provider.js`, legacy `/api/audits/*`, tracking aliases, root-mounted plot/unit helper routes, `DTAMPROVIDER` compatibility reads
- Evidence basis: Phase 1 and Phase 3 mapped multiple compatibility paths and legacy identity/model readers that are still present in runtime or code paths.
- User/Business Impact: Some user journeys and support procedures can still depend on stale paths; others are confused by shadow/alias behavior.
- Technical Impact: Teams cannot tell quickly which path is canonical and which one is tolerated legacy behavior.
- Recommended Fix: Verify live consumers, deprecate explicitly, then remove or block compatibility-only paths after parity is proven.
- Dependencies: Consumer verification and regression coverage.
- Owner Suggestion: Security / Architecture review, Backend, Frontend
- Verification Test: Traffic verification, canonical replacement tests, and alias-removal route checks.
- Rollback Concern: Medium because some hidden consumers may still use legacy paths.
- Mapped Implementation Tasks: `T-020`, `V-001`

### Needs Verification Issues

[Master Audit Issue]
- ID: NV-001
- Status: Needs Verification
- Title: Hidden consumers of proxy and compatibility route families may still exist
- Root Cause Group: Legacy Compatibility Risks
- Severity: High
- Priority: P1
- Affected Layer: Frontend, Backend, DevOps
- Related Modules/Routes/Tables: `/api/proxy/*`, legacy `/api/audits/*`, `routes/api/provider.js`, tracking aliases, root-mounted plot/unit helpers
- Evidence basis: Repo search did not show active frontend callers for some paths, but traffic-level confirmation was not available.
- User/Business Impact: Removing or tightening these surfaces without verification can break unobserved consumers.
- Technical Impact: Legacy cleanup remains risky until live usage is known.
- Recommended Fix: Verify live consumers and hit patterns before deprecation or removal.
- Dependencies: Staging or production route telemetry.
- Owner Suggestion: DevOps
- Verification Test: Route-hit inventory and consumer classification over an agreed time window.
- Rollback Concern: High if deprecation proceeds without traffic evidence.
- Mapped Implementation Tasks: `V-001`, `T-020`

[Master Audit Issue]
- ID: NV-002
- Status: Needs Verification
- Title: Product scope of renewal, replacement, and amendment branches is not fully confirmed
- Root Cause Group: Frontend-Backend Contract Drift
- Severity: Medium
- Priority: P1
- Affected Layer: Frontend, Backend, QA
- Related Modules/Routes/Tables: health renewal, replacement, and amendment routes
- Evidence basis: Audit found demo-like and partially broken behavior, but repo evidence alone does not prove whether each branch is still a required production flow or a retirement candidate.
- User/Business Impact: Engineering may either overinvest in legacy flows or accidentally retire active ones.
- Technical Impact: Backlog scope can remain misaligned with actual product commitments.
- Recommended Fix: Run UAT and product-scope confirmation before finalizing scope for these branches.
- Dependencies: Product owner and business owner confirmation.
- Owner Suggestion: QA
- Verification Test: Staging UAT and current navigation review.
- Rollback Concern: Low; the main risk is planning the wrong scope.
- Mapped Implementation Tasks: `V-002`

[Master Audit Issue]
- ID: NV-003
- Status: Needs Verification
- Title: Deployed databases may diverge materially from repo migration history
- Root Cause Group: Database Schema Drift
- Severity: High
- Priority: P0
- Affected Layer: Database
- Related Modules/Routes/Tables: deployed schemas, `_prisma_migrations`, standalone SQL history
- Evidence basis: Repo migration history is already fragile, but actual deployed schema state was not directly inspected in this audit turn.
- User/Business Impact: Schema changes can be planned against the repo while production/staging databases differ in critical ways.
- Technical Impact: DB hardening work can fail or corrupt data if deployed-state assumptions are wrong.
- Recommended Fix: Diff each deployed environment before executing irreversible schema work.
- Dependencies: Backup or metadata access to deployed environments.
- Owner Suggestion: Database
- Verification Test: Schema diff, migration-history export, and restore-based comparison.
- Rollback Concern: High if schema work proceeds without environment verification.
- Mapped Implementation Tasks: `V-003`, `T-010`, `T-011`

[Master Audit Issue]
- ID: NV-004
- Status: Needs Verification
- Title: Real rate-limit, timeout, and binary-download behavior under staging load is not fully confirmed
- Root Cause Group: Deployment / Config / Environment Risks
- Severity: Medium
- Priority: P2
- Affected Layer: Backend, BFF, QA
- Related Modules/Routes/Tables: auth endpoints, trace endpoints, Next proxies, public file/download paths
- Evidence basis: Code review found gaps and uncertainty, but staging or local-prod load behavior across the full proxy stack was not exercised in this turn.
- User/Business Impact: Public or auth surfaces can fail differently under load than code review suggests.
- Technical Impact: Performance and safety assumptions remain partially untested.
- Recommended Fix: Run staging load and behavior checks through the real ingress/proxy stack.
- Dependencies: Production-like environment and test tooling.
- Owner Suggestion: QA
- Verification Test: Burst, timeout, and binary-download checks through the full route stack.
- Rollback Concern: Low.
- Mapped Implementation Tasks: `V-004`

[Master Audit Issue]
- ID: NV-005
- Status: Needs Verification
- Title: Queue, DLQ, and cron activation may differ by environment
- Root Cause Group: Payment / Webhook / Async Job Risks
- Severity: High
- Priority: P1
- Affected Layer: DevOps, Backend
- Related Modules/Routes/Tables: `queue-service`, DLQ worker, scheduler jobs, env flags
- Evidence basis: Repo code shows optional or tolerant worker startup, but environment-by-environment activation was not confirmed.
- User/Business Impact: Some environments may be missing durable retries or scheduled enforcement even if code expects them.
- Technical Impact: Async reliability work can be designed against the wrong deployment assumptions.
- Recommended Fix: Verify worker and cron activation in each target environment before relying on them.
- Dependencies: Environment access and worker logs.
- Owner Suggestion: DevOps
- Verification Test: Worker inventory, DLQ replay drill, and cron execution verification.
- Rollback Concern: Medium if environments differ and changes assume uniform activation.
- Mapped Implementation Tasks: `V-005`, `T-018`

[Master Audit Issue]
- ID: NV-006
- Status: Needs Verification
- Title: Product ownership of head-auditor, identity-review, and admin-native portal lanes is still ambiguous
- Root Cause Group: RBAC / Role Drift
- Severity: Medium
- Priority: P2
- Affected Layer: Frontend, Backend, Product
- Related Modules/Routes/Tables: head-auditor namespace, provider verification flows, admin-native user/config surfaces
- Evidence basis: Code shows partial or inconsistent support, but not a final product decision on whether those lanes need dedicated routes or merged ownership.
- User/Business Impact: UI cleanup can remove a real lane or preserve a lane that should not exist.
- Technical Impact: Portal cleanup and role UX remain underspecified.
- Recommended Fix: Resolve product ownership before final route cleanup.
- Dependencies: Product owner and role-owner confirmation.
- Owner Suggestion: Security / Architecture review
- Verification Test: Role-lane review and product-signoff workshop.
- Rollback Concern: Low.
- Mapped Implementation Tasks: `V-006`, `T-003`, `T-008`

[Master Audit Issue]
- ID: NV-007
- Status: Needs Verification
- Title: Non-runtime security controls in CI/CD and operations are not evidenced by the code audit alone
- Root Cause Group: Deployment / Config / Environment Risks
- Severity: Low
- Priority: P3
- Affected Layer: DevOps, Security
- Related Modules/Routes/Tables: container/image scanning, secret management, external CI/CD controls
- Evidence basis: `docs/security-review.md` lists recommendations, but this audit did not inspect external CI/CD or operations tooling directly.
- User/Business Impact: Teams may assume controls exist or duplicate work without evidence.
- Technical Impact: Security-readiness discussions remain partially speculative.
- Recommended Fix: Verify which non-runtime controls are already enforced and which remain gaps.
- Dependencies: CI/CD and operations access.
- Owner Suggestion: Security / Architecture review
- Verification Test: Pipeline review and operator evidence review.
- Rollback Concern: Low.
- Mapped Implementation Tasks: `V-007`

## D. Implementation Action Plan

Detailed task cards already exist in `docs/master-audit-implementation-action-plan.md`. This section is the consolidated issue-to-execution map used for delivery planning.

### EPIC-01 Canonical Auth, Session, and RBAC Boundary

| Task ID | Task Name | Owner | Dependency | Key subtasks | Definition of Done | Test cases | Closes issues |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `T-001` | Freeze canonical auth, session, redirect, and role contract | Security / Architecture review | none | inventory session artifacts; publish role dictionary; publish route protection matrix | signed-off canonical contract for session artifacts, redirects, and role names | login/refresh/logout/redirect validation for health and provider users | `M-001`, `M-003` |
| `T-002` | Enforce backend auth guards and canonical permissions on privileged routes | Backend | `T-001` | replace broad provider auth; fix provider refresh behavior; add privileged route authz tests | privileged routes enforce intended roles/permissions and public gaps are closed | negative authz tests on admin/config/plants/identity/cert download/MFA/audits | `M-003`, `M-004`, `M-021` |
| `T-003` | Align frontend middleware, session reads, redirects, and navigation | Frontend | `T-001`, `T-002` | remove `/login` drift; replace localStorage-only guards; align nav with roles | web portals share one canonical route/session boundary | direct-route tests across anonymous and all Provider roles; nav visibility tests | `M-001`, `M-003`, `M-006`, `M-007` |
| `T-004` | Normalize Next BFF and proxy transport rules | Frontend | `T-001`, `T-002` | choose canonical proxy family; unify header/cookie/query rules; add upload/download tests | active proxy path preserves intended backend transport semantics | multipart upload, binary download, POST-with-query, cookie passthrough tests | `M-002`, `M-001` |

### EPIC-02 Workflow and Status Contract Alignment

| Task ID | Task Name | Owner | Dependency | Key subtasks | Definition of Done | Test cases | Closes issues |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `T-005` | Freeze canonical workflow and status dictionary | Security / Architecture review | `T-001` | inventory statuses; approve canonical dictionary; publish transition matrix | one approved workflow/status contract exists for core entities | cross-team sign-off and mapping review against mounted routes | `M-005`, `M-013` |
| `T-006` | Align backend applicant, provider, billing, and certificate transitions | Backend | `T-005`, `T-009` | replace mixed state reads; remove dead branches; tighten route-level transition validation | backend hot paths emit and consume one canonical status model | end-to-end submit-to-certificate API transition tests | `M-005`, `M-009`, `M-013` |
| `T-007` | Align health portal workflow screens with active backend contracts | Frontend | `T-003`, `T-004`, `T-005`, `T-006`, `T-012`, `T-013` | remove demo fallbacks; align actions and statuses; fix wrong namespaces | health portal no longer fabricates success or calls stale route families | health happy path, renewal, replacement, amendment, certificate, establishment tests | `M-006`, `M-009` |
| `T-008` | Align provider and admin portal screens with active backend contracts and role visibility | Frontend | `T-002`, `T-003`, `T-004`, `T-005`, `T-006` | remove wrong endpoint calls; replace local role gating; re-home alias pages | provider/admin pages match backend namespaces and role visibility | reviewer/scheduler/auditor/head-auditor/account/admin UI-path tests | `M-007`, `M-012` |

### EPIC-03 Database Schema Governance and Integrity

| Task ID | Task Name | Owner | Dependency | Key subtasks | Definition of Done | Test cases | Closes issues |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `T-009` | Establish single Prisma schema ownership and client generation path | Database | none | decide canonical schema owner; align web Prisma usage; add drift detection | one authoritative Prisma model source remains | schema-diff CI check and canonical Prisma generate path validation | `M-015` |
| `T-010` | Repair critical relations, unique keys, nullable ownership fields, and indexing gaps | Database | `T-005`, `T-009` | harden FKs/approved denormalization; fix business uniqueness; add hot-path indexes | critical data integrity boundaries are explicit and query plans are acceptable | shadow-db migration tests, duplicate-key checks, query-plan checks | `M-016`, `M-017`, `M-018`, `M-020` |
| `T-011` | Rehearse and clean the migration chain, then remove runtime schema fallbacks | Database | `T-009`, `T-010` | inventory standalone SQL; rebuild reproducible migration path; remove schema-gap fallbacks | migration history is reproducible across clean and upgraded DBs | clean-db and restored-db migration rehearsals, fallback-removal regression tests | `M-019`, `M-016`, `M-018` |

### EPIC-04 Document, Certificate, and Storage Integrity

| Task ID | Task Name | Owner | Dependency | Key subtasks | Definition of Done | Test cases | Closes issues |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `T-012` | Persist and protect backend document verification and certificate issuance/download flows | Backend | `T-001`, `T-002`, `T-005`, `T-010` | close auth gap on certificate download; fix issuance concurrency; persist verification state | certificate/document flows are durable, guarded, and auditable | cert download auth tests, issuance concurrency tests, verify persistence tests | `M-004`, `M-008`, `M-021` |
| `T-013` | Wire frontend evidence and document screens to real upload and failure states | Frontend | `T-004`, `T-012` | replace metadata-only submits; expose upload/delete failures; re-test post-refresh durability | evidence-backed UIs upload real bytes and fail loudly when persistence fails | multipart evidence tests, delete failure tests, page-reload durability tests | `M-008`, `M-006` |

### EPIC-05 Planting, Traceability, and Public Trust

| Task ID | Task Name | Owner | Dependency | Key subtasks | Definition of Done | Test cases | Closes issues |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `T-014` | Repair backend planting ownership checks and canonical namespace boundaries | Backend | `T-001`, `T-010` | add farm ownership joins; re-gate provider verification actions; audit compatibility helpers | planting/compliance routes enforce tenant boundaries and actor ownership | cross-tenant negative tests and actor-boundary tests | `M-011`, `M-012` |
| `T-015` | Align web planting, tracking, provider planting, and public trace screens with canonical APIs | Frontend | `T-004`, `T-014`, `T-016` | replace wrong endpoint calls; remove demo fallback logic; reconcile tracking aliases | planting and public trace UI no longer depends on stale local context or dead routes | planting detail/activity tests, provider planting tests, public trace route tests | `M-010`, `M-012`, `M-020` |
| `T-016` | Consolidate backend public verification, trust, and QR-resolution contracts | Backend | `T-005`, `T-010` | choose canonical public truth source; align field mappings; remove ambiguous compatibility lookups | public verify/trace contracts return one deterministic truth | cross-surface payload parity tests and QR-resolution tests | `M-010`, `M-017` |

### EPIC-06 Payment, Webhook, and Async Reliability

| Task ID | Task Name | Owner | Dependency | Key subtasks | Definition of Done | Test cases | Closes issues |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `T-017` | Harden payment creation, webhooks, lab callbacks, offline sync, and cron safety | Backend | `T-001`, `T-005`, `T-010` | add stable idempotency; enforce atomic callback behavior; authenticate machine callbacks | payment and callback paths are idempotent, authenticated, and fail-safe | webhook replay tests, callback auth tests, cron secret tests, offline sync auth tests | `M-013`, `M-014`, `M-017` |
| `T-018` | Enforce queue durability, environment invariants, and release gates | DevOps | `T-017` | fail fast on missing env; expose queue/DLQ/cron state; refresh release evidence on target SHA | deploy/startup fail when critical runtime assumptions are missing | config validation, worker-state checks, release-gate run on actual candidate SHA | `M-014`, `M-022` |

### EPIC-07 Regression Gates and Legacy Removal

| Task ID | Task Name | Owner | Dependency | Key subtasks | Definition of Done | Test cases | Closes issues |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `T-019` | Expand regression coverage for all production-critical audited paths | QA | `T-002`, `T-003`, `T-004`, `T-006`, `T-013`, `T-014`, `T-017` | convert P0/P1 clusters into executable regressions; extend smoke paths; enforce release-gate coverage | every confirmed P0/P1 cluster has an automated or scripted release gate | health happy path, provider workflow, authz, payment, planting tenancy, public trace tests | `M-004`, `M-006`, `M-008`, `M-011`, `M-013`, `M-014`, `M-022` |
| `T-020` | Retire legacy routes, compatibility models, aliases, and fallback-only surfaces | Security / Architecture review | `T-006`, `T-008`, `T-011`, `T-016`, `T-019` | verify consumers; remove dead surfaces; update deprecation and rollback notes | compatibility surfaces are either retired or explicitly versioned with named consumers | traffic verification, alias-removal tests, smoke suite without legacy paths | `M-009`, `M-012`, `M-023` |

### Verification Workstream

| Task ID | Task Name | Owner | Dependency | Key output |
| --- | --- | --- | --- | --- |
| `V-001` | Verify live consumers of proxy and compatibility surfaces | DevOps | telemetry access | evidence-backed consumer map before legacy removal |
| `V-002` | Verify product scope of renewal, replacement, and amendment branches | QA | product confirmation | active vs retire decision for health branch scope |
| `V-003` | Verify deployed database state and standalone SQL history | Database | DB metadata or backups | environment-specific schema diff before DB hardening |
| `V-004` | Verify rate-limit, timeout, and binary-download behavior under staging load | QA | production-like env | runtime proof for proxy/perf/security behavior |
| `V-005` | Verify queue, DLQ, and cron activation per environment | DevOps | worker logs and env access | async-runtime activation matrix |
| `V-006` | Verify head-auditor, identity-review, and admin-native lane ownership | Security / Architecture review | product and role-owner review | final role-lane ownership decision |
| `V-007` | Verify non-runtime CI/CD and operations security controls | Security / Architecture review | CI/CD and ops access | evidenced list of implemented vs missing non-runtime controls |

## E. Recommended Test Plan After Fix

Must-pass suites before re-evaluating release readiness:

1. Auth and session boundary suite
   - health login, provider login, refresh, logout, expired-session redirect
   - route protection and nav visibility across all provider/admin roles

2. Privileged authorization suite
   - negative and positive authz tests for admin config, admin plants, criteria, identity review, certificate download, MFA, and legacy audit reassignment

3. Core workflow and billing suite
   - submit -> preview -> payment phase 1 -> review -> audit -> payment phase 2 -> certificate
   - invalid state-transition rejection cases
   - webhook replay and partial-failure recovery cases

4. Document and evidence durability suite
   - replacement, renewal, CAR, wizard documents, provider audit evidence
   - page reload after upload
   - delete failure and retry behavior

5. Planting and tenancy suite
   - site analysis and training cross-tenant negative tests
   - health planting create/detail/activity
   - provider planting oversight list/detail

6. Public trust and trace suite
   - verify one certificate or QR across all supported public surfaces
   - trace lot, batch, plant, and plot-cycle parity checks
   - broken-link and error-navigation checks back to `/trace`

7. Database and migration suite
   - clean-db migrate deploy
   - restored-db migrate deploy
   - duplicate payment/QR key detection
   - relation-integrity checks for consent, ownership, certificate, and invoice joins

8. Release-gate suite
   - production-readiness scripts on the actual release candidate SHA
   - queue/DLQ/cron activation proof
   - backup/restore rehearsal
   - smoke test run with recorded artifacts

## F. Production Go/No-Go Verdict

Verdict:
- `No-Go` for production at the current audited state.

Why this is still No-Go:
- Confirmed P0 issues remain in authorization, payment/webhook safety, tenant isolation, evidence durability, workflow correctness, and key data-integrity boundaries.
- Release gates do not yet guarantee those defects will block a bad release.
- Database hardening and migration verification are not yet complete enough to support safe irreversible schema work.

Minimum conditions to move from No-Go to conditional Go:
1. All confirmed P0 issues are fixed and retested.
2. `NV-003` and `NV-005` are closed with environment evidence.
3. Release evidence is rerun on the exact target release SHA, not inherited from older rehearsals.
4. The test plan in Section E passes without waived failures on authz, payment, tenancy, evidence, or public trust paths.
5. Rollback and database restore rehearsal are confirmed for the same release window.

Conditional Go boundary after that:
- A limited preview or tightly controlled production release can be reconsidered only after the P0 set is closed, the environment verification items are complete, and release gates are updated to fail on the newly covered risks.

Current recommendation:
- Continue under remediation mode using this report plus `docs/master-audit-implementation-action-plan.md` as the delivery baseline.
