# Master Audit Implementation Action Plan

Audit basis:
- Phase 1 runtime mapping in `docs/phase-1-system-map-index.md` and linked runtime-first docs
- Phase 2 frontend audit in `docs/phase-2-frontend-audit-index.md`
- Phase 3 backend audit in `docs/phase-3-backend-audit-index.md`
- Phase 4 database audit in `docs/phase-4-database-audit.md`
- Supporting runtime-readiness and security artifacts: `docs/security-review.md`, `docs/smoke-test-execution-guide.md`, `docs/release-readiness-closeout-2026-02-22.md`, `docs/preview-deploy-runbook.md`

Planning rules:
- `Confirmed` means the problem was already grounded in mounted routes, middleware wiring, imports, actual handler usage, schema references, or the runtime dependency graph.
- `Needs Verification` means the team should not implement or remove anything before checking live traffic, deployed schema state, or environment behavior.
- Drift and inconsistency are treated as issues even when the current runtime still responds.
- The plan below deduplicates symptoms into implementation work. Each task may cover multiple audit items.

## Epic Overview

| Epic | Root cause groups covered | Primary owner lanes | Confirmed tasks |
| --- | --- | --- | --- |
| EPIC-01 Canonical Auth, Session, and RBAC Boundary | Auth / Session Boundary, RBAC / Role Drift | Security / Architecture review, Backend, Frontend | T-001 to T-004 |
| EPIC-02 Workflow and Status Contract Alignment | Frontend-Backend Contract Drift, Workflow / Status Transition Drift | Security / Architecture review, Backend, Frontend | T-005 to T-008 |
| EPIC-03 Database Schema Governance and Integrity | Database Schema Drift, Deployment / Config / Environment Risks | Database | T-009 to T-011 |
| EPIC-04 Document, Certificate, and Storage Integrity | File / Document / Storage Risks, Validation / Error Handling Gaps | Backend, Frontend | T-012 to T-013 |
| EPIC-05 Planting, Traceability, and Public Trust | Traceability / Public Trust Surface Risks, Frontend-Backend Contract Drift | Backend, Frontend | T-014 to T-016 |
| EPIC-06 Payment, Webhook, and Async Reliability | Payment / Webhook / Async Job Risks, Validation / Error Handling Gaps | Backend, DevOps | T-017 to T-018 |
| EPIC-07 Regression Gates and Legacy Removal | Legacy Compatibility Risks, Deployment / Config / Environment Risks | QA, Security / Architecture review | T-019 to T-020 |

## Confirmed Implementation Backlog

### EPIC-01 Canonical Auth, Session, and RBAC Boundary

[Implementation Action Task]
- Task ID: T-001
- Epic: EPIC-01 Canonical Auth, Session, and RBAC Boundary
- Task Name: Freeze canonical auth, session, redirect, and role contract
- Problem Statement: Runtime currently mixes cookie, bearer, and localStorage session artifacts; provider refresh behavior is not canonical; ThaID emits a non-canonical role value; and frontend/backend role normalization differs across layers.
- Scope: Define the canonical contract for login, refresh, logout, session persistence, redirect allowlist behavior, role dictionary, alias policy, and route-to-role ownership for public, health, provider, and admin surfaces.
- Files/Modules likely affected: `apps/backend/shared/canonical-rbac.js`, `apps/backend/shared/auth.js`, `apps/backend/middleware/auth-middleware.js`, `apps/backend/routes/api/auth-health.js`, `apps/backend/routes/api/auth-provider.js`, `apps/web-app/src/middleware.ts`, `apps/web-app/src/lib/services/auth-service.ts`, `apps/web-app/src/lib/services/auth-service-api.ts`, `apps/web-app/src/app/api/auth/health/[...path]/route.ts`, `apps/web-app/src/app/api/auth/provider/[...path]/route.ts`, `docs/api-path-identity-policy.md`
- Owner: Security / Architecture review
- Dependency: none
- Definition of Done: One signed-off contract exists for session artifacts, refresh behavior, redirect handling, and canonical role names; every mounted route family is mapped to an allowed actor set; alias roles and deprecated session artifacts are explicitly marked.
- Test Cases: Review the contract against `apps/backend/routes/api/index.js` and `apps/web-app/src/middleware.ts`; validate sample login/refresh/logout flows for health and provider users; validate redirect allowlist examples for `redirect` query usage; validate ThaID callback output against the canonical role dictionary.
- Risk if skipped: Auth fixes will land against conflicting assumptions and the repo will continue to recreate session and RBAC drift after each patch.
- Suggested order: 1
- Subtasks:
  1. Inventory active session artifacts and precedence across backend auth middleware, Next proxies, and web middleware.
  2. Publish the canonical role dictionary and alias/deprecation map.
  3. Publish the route protection matrix for `/`, `/auth/*`, `/health/*`, `/provider/*`, `/admin/*`, and key `/api/*` families.

[Implementation Action Task]
- Task ID: T-002
- Epic: EPIC-01 Canonical Auth, Session, and RBAC Boundary
- Task Name: Enforce backend auth guards and canonical permissions on privileged routes
- Problem Statement: Multiple mounted backend surfaces rely on broad provider auth or inconsistent guards, including admin config/plants, criteria mutations, identity review, legacy audit reassignment, certificate download, and MFA verification.
- Scope: Correct backend auth and role enforcement for mounted privileged routes and remove guard ambiguity between health, provider, public, and admin surfaces.
- Files/Modules likely affected: `apps/backend/routes/api/auth-health.js`, `apps/backend/routes/api/auth-provider.js`, `apps/backend/routes/api/certificates.js`, `apps/backend/routes/api/identity.js`, `apps/backend/routes/api/criteria.js`, `apps/backend/routes/api/audits.js`, `apps/backend/routes/api/admin/config.js`, `apps/backend/routes/api/admin/plants.js`, `apps/backend/shared/auth.js`, `apps/backend/shared/canonical-rbac.js`, `apps/backend/middleware/auth-middleware.js`, `apps/backend/middleware/admin-auth-middleware.js`
- Owner: Backend
- Dependency: T-001
- Definition of Done: Provider refresh behavior is either implemented canonically or removed from clients; privileged routes enforce canonical roles or permissions; certificate download is no longer weaker than the rest of the certificate surface; MFA verification is bound to a real auth challenge boundary.
- Test Cases: Negative role tests for `/api/admin/config/*`, `/api/admin/plants/*`, `/api/criteria/*`, `/api/identity/*`, `/api/audits/reassign`, `/api/certificates/:id/download`, and `/api/mfa/verify`; positive tests for intended admin, reviewer, scheduler, auditor, head auditor, and account roles; provider session refresh integration test.
- Risk if skipped: The platform retains privilege-escalation paths, inconsistent provider session behavior, and public exposure of sensitive certificate assets.
- Suggested order: 3
- Subtasks:
  1. Replace broad `authenticateProvider`-only gates with canonical permission or admin-only checks where required.
  2. Resolve provider refresh behavior and remove health-refresh fallback assumptions from provider flows.
  3. Add route-level auth tests for every privileged surface currently called out in Phase 3.

[Implementation Action Task]
- Task ID: T-003
- Epic: EPIC-01 Canonical Auth, Session, and RBAC Boundary
- Task Name: Align frontend middleware, session reads, redirects, and navigation with canonical auth rules
- Problem Statement: Public, health, provider, and admin pages reconstruct auth state from localStorage or page-local checks, use non-canonical `/login` redirects, and display route/navigation visibility that does not match backend RBAC.
- Scope: Move route access, redirect behavior, and visible navigation to one canonical session model for the web app.
- Files/Modules likely affected: `apps/web-app/src/middleware.ts`, `apps/web-app/src/lib/services/auth-service.ts`, `apps/web-app/src/lib/services/auth-provider.tsx`, `apps/web-app/src/app/page.tsx`, `apps/web-app/src/app/(auth)/login/page.tsx`, `apps/web-app/src/app/provider/layout.tsx`, `apps/web-app/src/app/provider/components/provider-layout.tsx`, `apps/web-app/src/app/health/layout.tsx`, `apps/web-app/src/app/admin/layout.tsx`, `apps/web-app/src/lib/constants.ts`
- Owner: Frontend
- Dependency: T-001, T-002
- Definition of Done: Web route protection no longer depends on page-local localStorage gates for core portals; canonical login routes are used consistently; navigation visibility matches approved role rules; head-auditor and other supported roles are not blocked incorrectly.
- Test Cases: Browser-route tests for anonymous, health, reviewer, scheduler, auditor, head_auditor, account, and admin users; direct navigation tests to `/health/*`, `/provider/*`, and `/admin/*`; logout and expired-session redirect tests; nav visibility tests for each role.
- Risk if skipped: Even with backend fixes, users will continue to hit dead redirects, hidden valid routes, and UI states that imply permissions they do not have.
- Suggested order: 7
- Subtasks:
  1. Remove `/login` redirect assumptions from page components and use canonical auth entry points.
  2. Replace localStorage-only route checks on critical pages with the shared session/auth layer.
  3. Make provider and admin navigation reflect actual route availability by role.

[Implementation Action Task]
- Task ID: T-004
- Epic: EPIC-01 Canonical Auth, Session, and RBAC Boundary
- Task Name: Normalize Next BFF and proxy transport rules
- Problem Statement: The web BFF layer applies different rules for headers, cookies, queries, body types, and response forwarding; `/api/proxy/*` is especially fragile and may have no confirmed active consumer.
- Scope: Canonicalize Next proxy behavior for request forwarding, cookie handling, query preservation, binary/file responses, and auth precedence.
- Files/Modules likely affected: `apps/web-app/src/app/api/[...path]/route.ts`, `apps/web-app/src/app/api/proxy/[...path]/route.ts`, `apps/web-app/src/app/api/auth/health/[...path]/route.ts`, `apps/web-app/src/app/api/auth/provider/[...path]/route.ts`, `apps/web-app/src/app/api/session/set-cookie/route.ts`, `apps/web-app/src/app/api/auth/set-session-cookie/route.ts`, `apps/web-app/src/lib/api/api-client.ts`, `apps/web-app/src/config/server.config.ts`
- Owner: Frontend
- Dependency: T-001, T-002
- Definition of Done: The BFF has one documented transport policy for headers, cookies, query strings, body types, and response types; file downloads and uploads preserve backend semantics; proxy auth precedence no longer creates cross-context token confusion.
- Test Cases: POST with query string through each proxy family; multipart upload through the chosen canonical proxy; PDF/download response preserving `Content-Disposition`; `Set-Cookie` passthrough tests; auth precedence tests with cookies and explicit bearer headers.
- Risk if skipped: Upload, download, callback, and mixed-auth flows will keep breaking at the proxy layer even after backend contracts are corrected.
- Suggested order: 8
- Subtasks:
  1. Choose the canonical proxy family for generic API traffic and mark legacy proxy behavior for retirement.
  2. Unify header, cookie, and query forwarding across auth and generic proxies.
  3. Add integration tests for binary download, multipart upload, and provider-auth query forwarding.

### EPIC-02 Workflow and Status Contract Alignment

[Implementation Action Task]
- Task ID: T-005
- Epic: EPIC-02 Workflow and Status Contract Alignment
- Task Name: Freeze canonical workflow and status dictionary
- Problem Statement: Applicant, provider, payment, certificate, async, and planting flows all accept overlapping legacy and canonical status dialects, which is the core source of broken transition logic and mismatched frontend badges.
- Scope: Define the canonical set of statuses, phase names, and transition ownership for application, quote, invoice, payment transaction, certificate, planting cycle, harvest batch, and lot flows.
- Files/Modules likely affected: `apps/backend/shared/workflow-state-machine.js`, `apps/backend/constants/status-machine.js`, `apps/backend/services/workflow-transition-service.js`, `apps/backend/routes/api/applications.js`, `apps/backend/routes/api/preview.js`, `apps/backend/routes/api/payments.js`, `apps/backend/services/payment-service*.js`, `apps/backend/services/certificate-service.js`, `apps/web-app/src/app/health/applications/**/*.tsx`, `apps/web-app/src/app/provider/**/*.tsx`, `apps/web-app/src/lib/health-dashboard-stage.ts`
- Owner: Security / Architecture review
- Dependency: T-001
- Definition of Done: A single status dictionary and transition matrix exists, legacy aliases are explicitly listed, and each route family knows which statuses it may read, emit, or normalize temporarily.
- Test Cases: Review of all mounted route families that read or emit workflow status; comparison of frontend badge/action mappings against the approved dictionary; sign-off from Backend, Frontend, Database, QA, and Security / Architecture review.
- Risk if skipped: The team will continue fixing symptoms independently while leaving the central contract drift intact.
- Suggested order: 2
- Subtasks:
  1. Inventory all status values emitted by mounted route families and runtime services.
  2. Approve the canonical dictionary and alias-to-canonical mapping.
  3. Publish the transition ownership matrix for applicant, provider, billing, certificate, and async flows.

[Implementation Action Task]
- Task ID: T-006
- Epic: EPIC-02 Workflow and Status Contract Alignment
- Task Name: Align backend applicant, provider, billing, and certificate transitions to the canonical state model
- Problem Statement: Mounted applicant, preview, payment, provider workflow, certificate, and async paths still emit or consume incompatible status sets, producing broken readiness checks and dead branches.
- Scope: Apply the canonical workflow/status contract to active backend transition paths and remove logic that depends on mixed legacy/canonical states in the hot path.
- Files/Modules likely affected: `apps/backend/routes/api/applications.js`, `apps/backend/routes/api/preview.js`, `apps/backend/routes/api/payments.js`, `apps/backend/routes/api/quotes.js`, `apps/backend/routes/api/invoices.js`, `apps/backend/routes/api/webhooks.js`, `apps/backend/routes/api/provider/handlers/workflow-transitions-handler.js`, `apps/backend/routes/api/provider/handlers/auditor-audit-decision-handler.js`, `apps/backend/services/workflow-transition-service.js`, `apps/backend/services/payment-service-phase-flow.js`, `apps/backend/services/payment-service-webhook-flow.js`, `apps/backend/services/certificate-service.js`
- Owner: Backend
- Dependency: T-005, T-009
- Definition of Done: Applicant submission, preview readiness, payment creation, review transitions, audit decision, phase-2 billing, and certificate issuance use one status model; unreachable or contradictory branches are removed from active runtime paths.
- Test Cases: End-to-end API transition tests for submit -> preview -> phase-1 payment -> review -> audit -> phase-2 payment -> certificate; negative tests for invalid status transitions; regression tests for quote and invoice generation; async callback tests that reject non-canonical status writes.
- Risk if skipped: Core business flow remains unreliable even if individual UI or DB bugs are patched.
- Suggested order: 10
- Subtasks:
  1. Replace mixed legacy/canonical reads in transition services with one approved mapping.
  2. Remove or quarantine unreachable workflow branches in payment and audit handlers.
  3. Update route-level validations so invalid state transitions fail early and explicitly.

[Implementation Action Task]
- Task ID: T-007
- Epic: EPIC-02 Workflow and Status Contract Alignment
- Task Name: Align health portal workflow screens with active backend contracts
- Problem Statement: Health pages reconstruct workflow state locally, hit wrong route families, keep demo-like fallbacks in renewal and replacement, and expose dead profile/certificate/payment actions.
- Scope: Repair health workflow UI for dashboard, application list/detail, wizard, preview/payment, establishment onboarding, certificates, payments, and profile actions.
- Files/Modules likely affected: `apps/web-app/src/app/health/dashboard/page.tsx`, `apps/web-app/src/app/health/applications/page.tsx`, `apps/web-app/src/app/health/applications/new/**/*`, `apps/web-app/src/app/health/applications/preview/page.tsx`, `apps/web-app/src/app/health/applications/payment/page.tsx`, `apps/web-app/src/app/health/applications/amendment/page.tsx`, `apps/web-app/src/app/health/applications/replacement/page.tsx`, `apps/web-app/src/app/health/applications/renewal/**/*`, `apps/web-app/src/app/health/applications/[id]/**/*`, `apps/web-app/src/app/health/establishments/**/*`, `apps/web-app/src/app/health/certificates/page.tsx`, `apps/web-app/src/app/health/payments/page.tsx`, `apps/web-app/src/app/health/profile/**/*`
- Owner: Frontend
- Dependency: T-003, T-004, T-005, T-006, T-012, T-013
- Definition of Done: Health workflow screens use the active backend contract, stop fabricating success or fallback states, surface real error/empty/loading states, and remove dead actions from profile/certificate/payment flows.
- Test Cases: Health happy path from login to application submission and payment; renewal, replacement, amendment negative/positive flows; certificate listing and download entry; profile-action visibility tests; establishment creation against canonical farm contract.
- Risk if skipped: The primary applicant experience will continue to present false progress, wrong endpoints, and dead controls even after backend fixes exist.
- Suggested order: 11
- Subtasks:
  1. Remove local/demo fallback behavior from renewal, replacement, and payment pages.
  2. Align health application status/action mappings with the approved workflow contract.
  3. Replace health certificate and establishment route calls that currently target the wrong backend namespaces.

[Implementation Action Task]
- Task ID: T-008
- Epic: EPIC-02 Workflow and Status Contract Alignment
- Task Name: Align provider and admin portal screens with active backend contracts and role visibility
- Problem Statement: Provider/admin screens call wrong route families, expose dead buttons, rely on localStorage role parsing, and hide or expose routes inconsistently by role; admin pages also alias into provider surfaces without clear ownership.
- Scope: Repair provider dashboard, applications, audits, calendar, certificates, analytics, accounting, management, settings, verification, and admin alias pages.
- Files/Modules likely affected: `apps/web-app/src/app/provider/dashboard/page.tsx`, `apps/web-app/src/app/provider/applications/**/*`, `apps/web-app/src/app/provider/audits/**/*`, `apps/web-app/src/app/provider/calendar/page.tsx`, `apps/web-app/src/app/provider/certificates/page.tsx`, `apps/web-app/src/app/provider/analytics/page.tsx`, `apps/web-app/src/app/provider/accounting/page.tsx`, `apps/web-app/src/app/provider/management/page.tsx`, `apps/web-app/src/app/provider/settings/system/page.tsx`, `apps/web-app/src/app/provider/verification/**/*`, `apps/web-app/src/app/admin/users/page.tsx`, `apps/web-app/src/app/admin/settings/page.tsx`, `apps/web-app/src/lib/services/provider-api.ts`
- Owner: Frontend
- Dependency: T-002, T-003, T-004, T-005, T-006
- Definition of Done: Provider/admin screens use canonical backend namespaces, role visibility matches backend RBAC, head-auditor and other supported roles are handled intentionally, and visible controls no longer dead-end silently.
- Test Cases: Reviewer, scheduler, auditor, head_auditor, account, and admin UI-path tests; provider analytics against the chosen canonical endpoint; accounting button-action tests; verification approval/rejection UI-path tests; admin users/settings route ownership tests.
- Risk if skipped: provider workflows remain misleading, under-protected, or incomplete, and admin users continue operating through hidden provider-only contracts.
- Suggested order: 12
- Subtasks:
  1. Remove provider/admin page calls to non-canonical route families.
  2. Replace localStorage role gating and raw browser dialogs with consistent portal-state handling.
  3. Re-home or explicitly label admin alias pages that currently route into provider-owned surfaces.

### EPIC-03 Database Schema Governance and Integrity

[Implementation Action Task]
- Task ID: T-009
- Epic: EPIC-03 Database Schema Governance and Integrity
- Task Name: Establish single Prisma schema ownership and client generation path
- Problem Statement: The repo keeps an active backend schema and a stale web schema copy; the web app still instantiates PrismaClient and can therefore drift in generated types and queries.
- Scope: Choose one canonical Prisma schema owner, define how the web app consumes the generated client, and stop schema-copy drift from reappearing.
- Files/Modules likely affected: `apps/backend/prisma/schema.prisma`, `apps/web-app/prisma/schema.prisma`, `apps/web-app/src/lib/prisma.ts`, `apps/web-app/src/lib/auth.ts`, root and app-level package scripts that run Prisma generate or build steps
- Owner: Database
- Dependency: none
- Definition of Done: Only one Prisma schema is authoritative for runtime data models; web Prisma usage is either aligned to that source or removed from drift-prone generation; CI prevents schema divergence from merging unnoticed.
- Test Cases: Prisma generate on the chosen canonical path; CI schema-diff guard; web build using the approved Prisma client generation path; smoke test for any web server-side code that still queries Prisma directly.
- Risk if skipped: The codebase keeps generating stale types and hidden query assumptions that do not match backend runtime truth.
- Suggested order: 9
- Subtasks:
  1. Decide the canonical Prisma owner and remove ambiguous generation paths.
  2. Update web server-side Prisma consumption to use the approved model source.
  3. Add CI drift detection between schema and generated client assumptions.

[Implementation Action Task]
- Task ID: T-010
- Epic: EPIC-03 Database Schema Governance and Integrity
- Task Name: Repair critical relations, unique keys, nullable ownership fields, and indexing gaps
- Problem Statement: Core models rely on dangling scalar references, nullable natural-key ownership, non-unique webhook lookup keys, missing QR uniqueness, and missing indexes on heavy runtime paths.
- Scope: Harden relation integrity, unique constraints, nullable-field handling, audit/history coverage, and critical query indexes for application, payment, certificate, trace, and planting entities.
- Files/Modules likely affected: `apps/backend/prisma/schema.prisma`, new Prisma migrations under `apps/backend/prisma/migrations/*`, `apps/backend/services/payment-service-webhook-flow.js`, `apps/backend/services/invoice-service.js`, `apps/backend/services/certificate-service.js`, `apps/backend/services/trace-service/**/*.js`, `apps/backend/services/harvest-service.js`, `apps/backend/middleware/consent-manager.js`
- Owner: Database
- Dependency: T-005, T-009
- Definition of Done: Critical entities have explicit relational integrity or approved denormalization rules; webhook lookup keys and QR identifiers are no longer ambiguous; hot-path planting and trace queries have validated indexes; ownership fields and audit metadata are no longer structurally unsafe.
- Test Cases: Shadow-database migration test; duplicate-data detection scripts for `gatewayRef`, `qrCode`, and `publicUrl`; query-plan checks for harvest and trace endpoints; integration tests covering payment reconciliation, certificate-to-farm joins, and consent/user linkage behavior.
- Risk if skipped: Data can remain internally inconsistent while the app appears to work, especially in payment reconciliation, public trace lookup, and ownership-sensitive reads.
- Suggested order: 13
- Subtasks:
  1. Resolve critical FK or approved-denormalization boundaries for `UserConsent`, `Certificate`, `Invoice`, and ownership fields.
  2. Replace ambiguous uniqueness on payment and QR lookup surfaces with durable business keys.
  3. Add and verify indexes for harvest, trace, and other proven heavy-read paths.

[Implementation Action Task]
- Task ID: T-011
- Epic: EPIC-03 Database Schema Governance and Integrity
- Task Name: Rehearse and clean the migration chain, then remove runtime schema-fallback dependencies
- Problem Statement: The migration chain contains reconcile migrations, placeholder folders, standalone SQL outside normal Prisma flow, and runtime code that still expects missing tables or polymorphic config shapes.
- Scope: Normalize migration history, prove deployability on clean and upgraded databases, and retire fallback code that exists only because schema state is not trusted.
- Files/Modules likely affected: `apps/backend/prisma/migrations/*`, `apps/backend/prisma/migrations/fix_schema_gaps.sql`, `apps/backend/prisma/migrations/add_performance_indexes.sql`, `apps/backend/prisma/migrations/add_farm_audit_enhancements.sql`, `apps/backend/routes/api/applications.js`, `apps/backend/controllers/system-config-controller.js`, `apps/backend/services/working-days-service.js`
- Owner: Database
- Dependency: T-009, T-010
- Definition of Done: Migration history is reproducible across clean and existing databases; standalone SQL usage is either absorbed into migrations or formally retired; runtime fallback branches for missing tables/config shapes are removed or narrowed to audited compatibility windows.
- Test Cases: `prisma migrate deploy` on a clean shadow database; `prisma migrate deploy` on a restored realistic database; regression test for application comments and system config without fallback branches; deployment rehearsal against a cloned environment snapshot.
- Risk if skipped: Environments will continue to diverge and runtime compatibility code will remain necessary, keeping data integrity risk alive.
- Suggested order: 16
- Subtasks:
  1. Inventory every standalone SQL file and placeholder migration folder against deployed history.
  2. Rebuild a reproducible migration path for clean and upgraded environments.
  3. Remove or sharply reduce code paths that assume missing tables or hidden manual schema patches.

### EPIC-04 Document, Certificate, and Storage Integrity

[Implementation Action Task]
- Task ID: T-012
- Epic: EPIC-04 Document, Certificate, and Storage Integrity
- Task Name: Persist and protect backend document verification and certificate issuance/download flows
- Problem Statement: Document verification appears to be in-session only, certificate download is less protected than the rest of the module, provider certificate listing is too broad, and certificate issuance is not concurrency-safe.
- Scope: Make document verification, certificate listing, certificate issuance, and download behavior durable, audited, and permission-correct.
- Files/Modules likely affected: `apps/backend/routes/api/documents.js`, `apps/backend/services/document-analysis-service.js`, `apps/backend/routes/api/certificates.js`, `apps/backend/routes/api/provider/certificates.js`, `apps/backend/services/certificate-service.js`, `apps/backend/services/queue-service.js`
- Owner: Backend
- Dependency: T-001, T-002, T-005, T-010
- Definition of Done: Document verification has a durable persistence/audit story; certificate download honors the same auth boundary as other certificate actions; provider certificate visibility is intentional; issuance does not depend on `count()+1` or silent side-effect failure.
- Test Cases: Auth tests for certificate download; concurrency tests for certificate number generation; document verify request creating durable server-side state; issuance failure-path tests when PDF or planting bootstrap work fails.
- Risk if skipped: Sensitive certificate artifacts remain exposed or inconsistent, and document verification continues to be non-reconstructable.
- Suggested order: 6
- Subtasks:
  1. Close the auth gap on certificate download and certificate listing permissions.
  2. Replace fragile certificate-number generation and non-transactional side-effect handling.
  3. Persist document-verification results or explicitly remove the false impression of durable verification.

[Implementation Action Task]
- Task ID: T-013
- Epic: EPIC-04 Document, Certificate, and Storage Integrity
- Task Name: Wire frontend evidence and document screens to real upload and failure states
- Problem Statement: Replacement, renewal, CAR, audit evidence, and wizard document flows imply uploaded evidence while some paths only send JSON metadata or hide delete/upload failures.
- Scope: Connect frontend document/evidence UIs to real upload contracts, remove fake success progression, and surface durable failure states across health and provider portals.
- Files/Modules likely affected: `apps/web-app/src/app/health/applications/replacement/page.tsx`, `apps/web-app/src/app/health/applications/renewal/**/*`, `apps/web-app/src/app/health/applications/[id]/car/page.tsx`, `apps/web-app/src/app/health/applications/new/step/[id]/page.tsx`, `apps/web-app/src/app/health/applications/new/hooks/use-auto-save.ts`, `apps/web-app/src/app/provider/audits/[id]/page.tsx`, `apps/web-app/src/app/provider/audits/[id]/audit-decision-modal.tsx`, `apps/web-app/src/app/trace/[qr-code]/page.tsx`
- Owner: Frontend
- Dependency: T-004, T-012
- Definition of Done: Visible document/evidence controls transmit actual file bytes through the chosen upload contract, block or warn clearly on failure, and no longer let the UI claim success when evidence did not persist.
- Test Cases: Multipart upload tests for replacement, renewal, CAR, wizard documents, and provider audit evidence; delete-failure UI tests for wizard documents; page-reload tests proving uploaded evidence is durable; negative tests for blocked submit when required attachments fail.
- Risk if skipped: Users and provider will continue to believe evidence exists when backend storage never received it.
- Suggested order: 14
- Subtasks:
  1. Replace metadata-only submits with the real upload path for each evidence workflow.
  2. Make upload, delete, and retry failures visible in-page rather than toast-only or silent.
  3. Re-test all evidence-backed success screens against a fresh reload, not just optimistic in-memory state.

### EPIC-05 Planting, Traceability, and Public Trust

[Implementation Action Task]
- Task ID: T-014
- Epic: EPIC-05 Planting, Traceability, and Public Trust
- Task Name: Repair backend planting ownership checks and canonical namespace boundaries
- Problem Statement: Health planting/compliance routes allow cross-tenant farm access patterns, verify routes sit behind the wrong actor boundary, and planting namespaces are split across health, provider, and compatibility roots.
- Scope: Enforce farm ownership and actor boundaries for health planting/compliance routes and narrow the active planting namespace story for backend runtime.
- Files/Modules likely affected: `apps/backend/routes/api/farms.js`, `apps/backend/services/farm-service.js`, `apps/backend/routes/api/site-analyses.js`, `apps/backend/controllers/site-analysis-controller.js`, `apps/backend/services/site-analysis-service.js`, `apps/backend/routes/api/training-records.js`, `apps/backend/controllers/training-record-controller.js`, `apps/backend/services/training-record-service.js`, `apps/backend/routes/api/planting-cycles.js`, `apps/backend/routes/api/provider/planting.js`, `apps/backend/routes/api/planting-cycles-unit-plot-routes.js`, `apps/backend/routes/api/planting-cycles-activity-harvest-routes.js`
- Owner: Backend
- Dependency: T-001, T-010
- Definition of Done: Health planting/compliance routes enforce ownership on farm-scoped reads and writes; PROVIDER-only verification actions are no longer reachable through health-only auth; planting namespaces are intentionally scoped and documented.
- Test Cases: Cross-tenant negative tests for site analyses and training records; positive health-owner tests; provider/admin planting access tests; contract tests for health vs provider planting detail endpoints.
- Risk if skipped: Any authenticated health user can continue reading or mutating another tenant's compliance data if IDs are known.
- Suggested order: 4
- Subtasks:
  1. Add and verify farm ownership joins for all site-analysis and training-record operations.
  2. Move or re-gate verification actions so actor boundaries match runtime intent.
  3. Audit root-mounted planting helpers and confirm which ones remain active compatibility surfaces.

[Implementation Action Task]
- Task ID: T-015
- Epic: EPIC-05 Planting, Traceability, and Public Trust
- Task Name: Align web planting, tracking, provider planting, and public trace screens with canonical APIs
- Problem Statement: Health tracking is partly a legacy alias layer, provider planting detail calls health APIs, public trace pages mix demo fallbacks and broken controls, and multiple pages use raw fetch/localStorage context outside the shared client boundary.
- Scope: Repair health planting/tracking pages, provider planting pages, and public trace/verify pages so they use the approved route families and predictable UI state handling.
- Files/Modules likely affected: `apps/web-app/src/app/health/planting/**/*`, `apps/web-app/src/app/health/tracking/**/*`, `apps/web-app/src/app/provider/planting/**/*`, `apps/web-app/src/app/trace/**/*`, `apps/web-app/src/app/verify/page.tsx`, `apps/web-app/src/app/verify-identity/page.tsx`, `apps/web-app/src/lib/services/planting-service.ts`, `apps/web-app/src/lib/services/planting-service.types.ts`
- Owner: Frontend
- Dependency: T-004, T-014, T-016
- Definition of Done: Health planting/tracking routes no longer depend on stale local context or wrong namespaces; provider planting detail uses provider APIs; public trace and verify screens stop using demo-only fallbacks and dead controls; legacy tracking aliases either preserve context correctly or are retired.
- Test Cases: Planting-cycle create/detail/activity flows; provider planting oversight list/detail flows; public trace tests for generic, plant, batch, lot, and plot-cycle routes; error-navigation tests that return to `/trace` rather than `/`; bookmark/deep-link tests for tracking aliases.
- Risk if skipped: Planting and public trace remain fragmented across overlapping, partially broken screens that do not share one contract.
- Suggested order: 17
- Subtasks:
  1. Replace wrong planting and trace endpoint calls with the approved namespace for each actor.
  2. Remove demo fallback logic and inert controls from public trace screens.
  3. Reconcile tracking alias routes with the canonical planting detail and tab-state model.

[Implementation Action Task]
- Task ID: T-016
- Epic: EPIC-05 Planting, Traceability, and Public Trust
- Task Name: Consolidate backend public verification, trust, and QR-resolution contracts
- Problem Statement: Public certificate verification, traceability, and interoperability are split across multiple route families that do not guarantee identical field mappings or lookup semantics; QR/public URL uniqueness is also weak.
- Scope: Consolidate or explicitly govern public verification surfaces for certificates, trace, trust registry, revocation, and QR resolution.
- Files/Modules likely affected: `apps/backend/routes/api/public.js`, `apps/backend/routes/api/certificates.js`, `apps/backend/routes/api/interoperability.js`, `apps/backend/routes/api/trace.js`, `apps/backend/routes/public-trace.js`, `apps/backend/services/trace-service.js`, `apps/backend/services/trace-service/**/*.js`, `apps/backend/services/certificate-service.js`, `apps/backend/services/qrcode/qrcode-service.js`, `apps/backend/prisma/schema.prisma`
- Owner: Backend
- Dependency: T-005, T-010
- Definition of Done: Public certificate verification and trace resolution have one approved contract family or an explicitly versioned split with identical truth sources; QR and public URL lookup behavior is deterministic; trust and revocation endpoints align with certificate truth.
- Test Cases: Compare payload parity across public verify surfaces for the same certificate; QR lookup tests for lot, batch, plant, and plot-cycle routes; revocation and trust-read tests; duplicate QR/publicUrl negative tests after schema hardening.
- Risk if skipped: Public consumers can continue receiving different truths depending on which verification surface they call.
- Suggested order: 18
- Subtasks:
  1. Choose the canonical public truth source for certificate verification and traceability.
  2. Align field mapping and lookup semantics across remaining public surfaces.
  3. Remove or quarantine compatibility lookups that rely on ambiguous `findFirst` or substring matching.

### EPIC-06 Payment, Webhook, and Async Reliability

[Implementation Action Task]
- Task ID: T-017
- Epic: EPIC-06 Payment, Webhook, and Async Reliability
- Task Name: Harden payment creation, webhooks, lab callbacks, offline sync, and cron safety
- Problem Statement: Payment creation and webhook flows disagree on phases and statuses, webhook handling is not fully atomic or idempotent, lab callbacks lack real authenticity checks, offline sync inspects JWTs before verifying them, and cron auto-cancel can run unauthenticated when secrets are absent.
- Scope: Fix reliability and safety boundaries for active async and callback surfaces in backend runtime.
- Files/Modules likely affected: `apps/backend/routes/api/payments.js`, `apps/backend/routes/api/webhooks.js`, `apps/backend/routes/api/callbacks.js`, `apps/backend/routes/api/sync.js`, `apps/backend/routes/api/cron.js`, `apps/backend/services/payment-service-phase-flow.js`, `apps/backend/services/payment-service-webhook-flow.js`, `apps/backend/services/queue-service.js`, `apps/backend/jobs/webhook-dlq-processor.js`, `apps/backend/jobs/scheduler.js`
- Owner: Backend
- Dependency: T-001, T-005, T-010
- Definition of Done: Payment and callback flows use stable idempotency semantics, transactional state changes where required, authenticated or signed callback boundaries, and explicit fail-safe behavior when cron or queue protections are not configured.
- Test Cases: Duplicate webhook replay tests; mid-flight failure tests that assert atomic or compensating behavior; lab callback auth/signature tests; offline-sync auth-verification tests; cron endpoint tests with and without secret configuration; DLQ enqueue and replay tests.
- Risk if skipped: Financial state, application state, and machine-to-machine callback safety remain vulnerable to duplication, desync, or abuse.
- Suggested order: 5
- Subtasks:
  1. Replace timestamp-only idempotency assumptions with stable business replay keys where required.
  2. Ensure webhook and callback handlers do not return success while leaving core writes inconsistent.
  3. Enforce authenticated/signed machine callbacks and secret-guarded cron execution.

[Implementation Action Task]
- Task ID: T-018
- Epic: EPIC-06 Payment, Webhook, and Async Reliability
- Task Name: Enforce queue durability, environment invariants, and release gates for critical runtime paths
- Problem Statement: Queue and cron behavior are partially optional at runtime, DLQ activation is not guaranteed, release-readiness evidence is tied to an older SHA, and deployment gates do not yet fail on all audited runtime risks.
- Scope: Add deploy-time and startup-time enforcement for critical env settings, queue worker activation, readiness checks, and release evidence refresh.
- Files/Modules likely affected: `docker-compose.production.yml`, `docker-compose.local-prod.yml`, `.env.production.example`, `apps/backend/server.js`, `apps/backend/services/queue-service.js`, `apps/backend/jobs/scheduler.js`, `scripts/production-readiness-check.js`, `scripts/run-regression-gate.js`, `docs/preview-deploy-runbook.md`, `docs/preview-deploy-checklist.md`, `docs/release-readiness-closeout-2026-02-22.md`
- Owner: DevOps
- Dependency: T-017
- Definition of Done: Deployment and startup fail fast when required async protections or env keys are missing; queue/DLQ and cron activation are observable; release-readiness evidence is re-run on the actual release SHA, not reused blindly from older rehearsals.
- Test Cases: Compose/config validation with required env omissions; startup health checks proving queue/DLQ/cron state; release gate run against the current target SHA; backup/restore rehearsal plus smoke-test execution on the new release candidate.
- Risk if skipped: The app may pass a nominal deploy while silently missing the workers, secrets, or runtime evidence needed for safe production behavior.
- Suggested order: 15
- Subtasks:
  1. Turn critical async/runtime assumptions into explicit deployment gates.
  2. Expose or record queue, DLQ, and cron activation state in release evidence.
  3. Refresh release-readiness and smoke evidence on the actual release candidate SHA.

### EPIC-07 Regression Gates and Legacy Removal

[Implementation Action Task]
- Task ID: T-019
- Epic: EPIC-07 Regression Gates and Legacy Removal
- Task Name: Expand regression coverage for all production-critical audited paths
- Problem Statement: Many current failures are cross-layer regressions that are not blocked by one test suite today, especially around auth boundaries, role visibility, uploads, payments, public trace, and privileged provider actions.
- Scope: Build regression coverage across backend integration, frontend E2E, smoke journeys, and release-gate checks for the audited hot paths.
- Files/Modules likely affected: `tests/smoke/**/*`, frontend E2E suites under the web app test tree, `apps/backend/__tests__/integration/**/*`, `apps/backend/__tests__/unit/**/*`, `docs/smoke-test-execution-guide.md`, `docs/uat-checklist-planting-runtime.md`, `docs/track-trace-public-qr-test-plan.md`
- Owner: QA
- Dependency: T-002, T-003, T-004, T-006, T-013, T-014, T-017
- Definition of Done: CI or release gates cover the audited critical paths with executable tests; each confirmed P0/P1 issue cluster has at least one regression test or smoke stage that would fail if the defect returns.
- Test Cases: Health happy path; provider review/audit path; admin config/planting guard checks; payment webhook replay; certificate download authorization; planting ownership negative tests; public trace parity tests; identity review authorization tests.
- Risk if skipped: The team may fix the audit backlog once and then regress the same production-critical issues in the next release.
- Suggested order: 19
- Subtasks:
  1. Turn each confirmed P0/P1 audit cluster into one explicit test owner and one executable regression.
  2. Add smoke stages for auth, payment, provider workflow, planting, and public verification.
  3. Make the critical regression suite part of release gating rather than optional QA follow-up.

[Implementation Action Task]
- Task ID: T-020
- Epic: EPIC-07 Regression Gates and Legacy Removal
- Task Name: Retire legacy routes, compatibility models, aliases, and fallback-only surfaces after parity is proven
- Problem Statement: The runtime still carries unmounted workflow files, compatibility provider directory routes, legacy audit routes, tracking aliases, root-mounted planting helpers, DTAMPROVIDER compatibility reads, and status/role aliases that keep drift alive.
- Scope: Remove or formally deprecate legacy runtime surfaces once the canonical path replacements are implemented and verified.
- Files/Modules likely affected: `apps/backend/routes/api/wizard.js`, `apps/backend/routes/api/application-flow.js`, `apps/backend/routes/api/provider.js`, `apps/backend/routes/api/audits.js`, `apps/backend/routes/api/planting-cycles-unit-plot-routes.js`, `apps/backend/routes/api/planting-cycles-activity-harvest-routes.js`, `apps/backend/jobs/sla-monitor.js`, `apps/web-app/src/app/health/tracking/**/*`, `apps/web-app/src/app/admin/users/page.tsx`, `apps/web-app/src/app/admin/settings/page.tsx`, `docs/deprecation-register.md`
- Owner: Security / Architecture review
- Dependency: T-006, T-008, T-011, T-016, T-019
- Definition of Done: Every retained compatibility surface has a named consumer and sunset window; dead or superseded surfaces are removed or blocked; deprecation notes and rollback rules exist for each retired path.
- Test Cases: Traffic/consumer verification before removal; regression tests proving canonical replacements cover the retired behavior; route-404/redirect tests for removed aliases; smoke suite pass without compatibility paths.
- Risk if skipped: The repo will continue to carry duplicate behavior that confuses maintainers and keeps contract drift active.
- Suggested order: 20
- Subtasks:
  1. Verify real consumers for each compatibility path before removing anything.
  2. Remove dead surfaces and convert required survivors into explicitly versioned/deprecated contracts.
  3. Update deprecation records, release notes, and rollback rules for every retired route family.

## Needs Verification Workstream

These items should be handled separately from confirmed implementation work. The goal is to reduce change risk before deprecating, migrating, or hardening assumptions that depend on live traffic or environment state.

[Implementation Action Task]
- Task ID: V-001
- Epic: Verification Workstream
- Task Name: Verify live consumers of compatibility and proxy surfaces
- Problem Statement: Several fragile or legacy route families appear unused from repo code, but live traffic could still depend on them.
- Scope: Confirm consumers and hit patterns for `/api/proxy/*`, legacy `/api/audits/*`, compatibility `routes/api/provider.js`, root-mounted plot/unit helpers, tracking aliases, and duplicate public verification surfaces.
- Files/Modules likely affected: runtime logs, ingress logs, API metrics, `apps/web-app/src/app/api/proxy/[...path]/route.ts`, `apps/backend/routes/api/provider.js`, `apps/backend/routes/api/audits.js`
- Owner: DevOps
- Dependency: access to staging or production traffic telemetry
- Definition of Done: Each candidate compatibility surface has an evidence-backed list of active consumers, hit frequency, and safe-removal window.
- Test Cases: Log-based route-hit inventory; consumer-origin classification; one-week or agreed sample window review.
- Risk if skipped: The team may remove or tighten a path that still has hidden consumers.
- Suggested order: V1
- Subtasks:
  1. Capture route-hit counts and top callers.
  2. Classify each surface as active, dormant, or dead.
  3. Feed the result into T-020 before any removal.

[Implementation Action Task]
- Task ID: V-002
- Epic: Verification Workstream
- Task Name: Verify active product scope of renewal, replacement, amendment, and demo-like UI branches
- Problem Statement: Some health workflow pages still behave like demo or compatibility flows, but the repo alone does not prove whether product wants them hardened or retired.
- Scope: Confirm whether renewal, replacement, amendment, and similar branches are production-required, limited-scope, or legacy-only.
- Files/Modules likely affected: `apps/web-app/src/app/health/applications/renewal/**/*`, `apps/web-app/src/app/health/applications/replacement/page.tsx`, `apps/web-app/src/app/health/applications/amendment/page.tsx`, related backend routes under `apps/backend/routes/api/applications.js`
- Owner: QA
- Dependency: product owner or business owner confirmation, staging accounts with relevant data
- Definition of Done: Each flow is tagged as active, retire, or hold; corresponding backlog tasks are re-scoped accordingly.
- Test Cases: Manual UAT on staging; route discoverability review from current navigation; product-signoff checklist.
- Risk if skipped: Engineering may spend time hardening flows that should be retired or accidentally remove flows still required for production.
- Suggested order: V2
- Subtasks:
  1. Run manual UAT for each branch.
  2. Compare findings with current navigation and support expectations.
  3. Record product-scope status before final implementation commitment.

[Implementation Action Task]
- Task ID: V-003
- Epic: Verification Workstream
- Task Name: Verify deployed database state and standalone SQL execution history
- Problem Statement: Repo migrations already show fragility, but actual deployed environments may contain extra manual SQL or partially applied reconcile migrations.
- Scope: Compare each deployed environment against repo migrations, `_prisma_migrations`, and standalone SQL history before applying schema-hardening work.
- Files/Modules likely affected: live databases, `apps/backend/prisma/migrations/*`, `apps/backend/prisma/migrations/*.sql`
- Owner: Database
- Dependency: read access to staging and production metadata or backups
- Definition of Done: Each environment has a schema diff report, migration-history report, and list of manual SQL applied outside Prisma if any.
- Test Cases: `_prisma_migrations` inventory; schema diff against canonical Prisma model; restore-and-compare exercise from a recent backup.
- Risk if skipped: Database fixes may be planned against repo history while deployed environments differ materially.
- Suggested order: V3
- Subtasks:
  1. Export migration history from each environment.
  2. Compare schema shape and indexes against repo truth.
  3. Document manual divergence before T-010 and T-011 execution.

[Implementation Action Task]
- Task ID: V-004
- Epic: Verification Workstream
- Task Name: Verify rate-limit, timeout, download, and public-trace behavior under staging load
- Problem Statement: Some security/readiness documents claim broad controls, but the current audited runtime still leaves uncertainty around actual rate-limit coverage, timeout behavior, and file-download handling under load.
- Scope: Exercise auth, trace, download, and proxy surfaces under staging or local-prod load to confirm real runtime behavior.
- Files/Modules likely affected: `apps/backend/server.js`, `apps/backend/middleware/auth-rate-limiters-middleware.js`, `apps/web-app/src/app/api/[...path]/route.ts`, `apps/web-app/src/app/api/auth/*`, public trace routes
- Owner: QA
- Dependency: staging or local-prod environment that mirrors production ingress and proxy behavior
- Definition of Done: The team has measured results for rate limits, timeouts, binary downloads, and public trace behavior on the actual route stack.
- Test Cases: Burst traffic against auth and trace endpoints; file-download tests through the Next proxy; slow-backend timeout tests; trace verification sanity checks.
- Risk if skipped: Security or performance assumptions could remain untested until real users hit them in production.
- Suggested order: V4
- Subtasks:
  1. Script the high-risk public and auth endpoints.
  2. Run them through the full proxy stack.
  3. Record actual failure and recovery behavior.

[Implementation Action Task]
- Task ID: V-005
- Epic: Verification Workstream
- Task Name: Verify queue, DLQ, and cron activation in each deploy environment
- Problem Statement: Repo evidence shows optional or best-effort queue behavior, but actual environment activation must be confirmed before changing or depending on those paths.
- Scope: Confirm queue worker startup, DLQ processor activation, cron enablement, and alerting/health visibility in staging and production-like environments.
- Files/Modules likely affected: `apps/backend/services/queue-service.js`, `apps/backend/jobs/webhook-dlq-processor.js`, `apps/backend/jobs/scheduler.js`, deployment manifests and env files
- Owner: DevOps
- Dependency: environment access and worker logs
- Definition of Done: The team knows exactly which async processors are active in each environment and how failures surface.
- Test Cases: Worker startup verification; DLQ replay drill; cron execution drill; env-flag matrix review.
- Risk if skipped: Implementation may assume durable background processing that is not actually active.
- Suggested order: V5
- Subtasks:
  1. Inventory enabled processors by environment.
  2. Trigger one controlled failure and observe routing to DLQ or fallback.
  3. Feed the findings into T-017 and T-018.

[Implementation Action Task]
- Task ID: V-006
- Epic: Verification Workstream
- Task Name: Verify missing or implicit provider product lanes before portal cleanup
- Problem Statement: Head-auditor, identity-review, and some admin/provider separation decisions are only partially visible in the current web tree and may require explicit route/product decisions before cleanup.
- Scope: Confirm whether dedicated provider routes or dashboards are intended for head auditor, identity review, and admin-native user/config flows.
- Files/Modules likely affected: `apps/web-app/src/app/provider/**/*`, `apps/web-app/src/app/admin/**/*`, `apps/backend/routes/api/provider/head-auditor.js`, `apps/backend/routes/api/identity.js`
- Owner: Security / Architecture review
- Dependency: product-owner confirmation and role-owner interviews
- Definition of Done: Each provider lane is tagged as explicit route, merged route, or deprecated lane; portal-cleanup tasks have a final ownership decision.
- Test Cases: Role-lane review workshop; current-route inventory against canonical provider/admin responsibilities; product-signoff notes.
- Risk if skipped: Frontend cleanup could accidentally erase a real provider workflow or preserve an invalid one.
- Suggested order: V6
- Subtasks:
  1. Identify ambiguous provider lanes.
  2. Decide their product ownership and route model.
  3. Feed the decisions into T-003 and T-008.

[Implementation Action Task]
- Task ID: V-007
- Epic: Verification Workstream
- Task Name: Verify non-runtime security-readiness controls before adding them to release gates
- Problem Statement: Security review notes recommend container scanning, stronger secret management, and related controls, but those controls were not confirmed from the runtime/code path audit itself.
- Scope: Confirm whether image scanning, secret-scanning, secret rotation, and similar non-runtime controls already exist in CI/CD or operations outside the repo.
- Files/Modules likely affected: CI/CD pipelines, deployment automation, secrets-management process docs, `docs/security-review.md`
- Owner: Security / Architecture review
- Dependency: CI/CD and operations access
- Definition of Done: Each non-runtime security control is marked as implemented, partially implemented, or absent, with evidence.
- Test Cases: Pipeline review; operator checklist review; one controlled scan/report run if tooling exists.
- Risk if skipped: The team may either assume security controls exist when they do not, or build duplicate controls without understanding current operations.
- Suggested order: V7
- Subtasks:
  1. Inventory non-runtime security controls currently enforced.
  2. Separate repo-backed controls from process-only controls.
  3. Feed confirmed gaps into later release-hardening work.

## Sprint Breakdown

### Sprint 1

Goal: stabilize production-critical auth, payment, and tenancy boundaries before broader UI or schema cleanup.

- T-001 Freeze canonical auth/session/role contract.
- T-005 Freeze canonical workflow/status dictionary.
- T-002 Enforce backend auth guards and canonical permissions on privileged routes.
- T-014 Repair backend planting ownership checks and canonical namespace boundaries.
- T-017 Harden payment creation, webhooks, lab callbacks, offline sync, and cron safety.
- T-012 Persist and protect backend document verification and certificate issuance/download flows.
- T-003 Align frontend middleware, session reads, redirects, and navigation with canonical auth rules.

### Sprint 2

Goal: align application, provider, and admin contracts with the stabilized backend and start hardening the database model.

- T-004 Normalize Next BFF and proxy transport rules.
- T-009 Establish single Prisma schema ownership and client generation path.
- T-006 Align backend applicant, provider, billing, and certificate transitions to the canonical state model.
- T-007 Align health portal workflow screens with active backend contracts.
- T-008 Align provider and admin portal screens with active backend contracts and role visibility.
- T-010 Repair critical relations, unique keys, nullable ownership fields, and indexing gaps.
- T-013 Wire frontend evidence and document screens to real upload and failure states.

### Sprint 3

Goal: finish schema cleanup, unify public trust surfaces, harden release gates, and remove compatibility debt.

- T-018 Enforce queue durability, environment invariants, and release gates for critical runtime paths.
- T-011 Rehearse and clean the migration chain, then remove runtime schema-fallback dependencies.
- T-016 Consolidate backend public verification, trust, and QR-resolution contracts.
- T-015 Align web planting, tracking, provider planting, and public trace screens with canonical APIs.
- T-019 Expand regression coverage for all production-critical audited paths.
- T-020 Retire legacy routes, compatibility models, aliases, and fallback-only surfaces after parity is proven.

## Blockers and Prerequisites

- Signed-off canonical auth/session/role contract from T-001.
- Signed-off canonical workflow/status contract from T-005.
- Read access to staging or production telemetry for V-001, V-004, and V-005.
- Database metadata or recent restore snapshots for V-003 and T-011 rehearsal work.
- Stable staging accounts for health, reviewer, scheduler, auditor, head auditor, account, and admin roles.
- Mock or non-production payment callback environment for T-017 and T-019.
- Agreement on which health renewal/replacement/amendment flows are in active production scope from V-002.
- Product decision on head-auditor, identity-review, and admin-native portal ownership from V-006.

## Suggested Execution Notes

- Do not start T-006, T-007, T-008, or T-010 without the output of T-005.
- Do not start removal work in T-020 without V-001 and T-019.
- Treat V-003 as mandatory before applying irreversible database changes in T-010 or T-011.
- Treat T-017 and T-018 as the minimum async/reliability baseline before any production push that includes payment or callback changes.
