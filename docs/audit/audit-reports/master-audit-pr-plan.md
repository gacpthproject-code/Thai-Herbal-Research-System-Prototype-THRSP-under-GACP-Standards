# Master Audit PR Plan

Basis:
- Source issues: `docs/master-audit-consolidation-report.md`
- Source batches: `docs/master-audit-fix-batch-plan.md`
- Source tasks: `docs/master-audit-implementation-action-plan.md`

Planning rules:
- Only `Confirmed` `P0` and `P1` issues are in scope.
- No PR combines database migration, auth rewrite, and UI refactor together.
- Each PR is limited to one primary blast radius.
- Merge order below is optimized for real dependencies, not for parallel coding throughput.

## Batch 1 = must-fix first

[PR Plan Item]
- PR ID: `PR-01`
- Title: `backend/authz-hardening-privileged-routes`
- Related batch/issues: `FB-01`; `M-003`, `M-004`
- Scope: Tighten backend authorization and canonical permission checks on privileged mounted routes without changing frontend behavior in the same PR.
- Files likely changed: `apps/backend/shared/canonical-rbac.js`, `apps/backend/shared/auth.js`, `apps/backend/middleware/auth-middleware.js`, `apps/backend/middleware/admin-auth-middleware.js`, `apps/backend/routes/api/admin/config.js`, `apps/backend/routes/api/admin/plants.js`, `apps/backend/routes/api/criteria.js`, `apps/backend/routes/api/identity.js`, `apps/backend/routes/api/certificates.js`, `apps/backend/routes/api/audits.js`, `apps/backend/routes/api/auth-health.js`
- Migration required or not: `No`
- Backward compatibility concern: Provider Users or hidden clients currently relying on broad provider auth may lose access immediately.
- Test cases required: negative authz tests for admin/config/plants/criteria/identity/certificate download/MFA/audit reassignment; positive authz tests for intended roles only.
- Reviewer type needed: `Backend`, `Security / Architecture review`
- Merge risk: `High`
- Suggested merge order: `1`

[PR Plan Item]
- PR ID: `PR-02`
- Title: `backend/planting-tenancy-ownership-guards`
- Related batch/issues: `FB-01`; `M-011`
- Scope: Add and enforce farm ownership checks and actor boundary corrections for site analysis and training record routes only.
- Files likely changed: `apps/backend/routes/api/site-analyses.js`, `apps/backend/controllers/site-analysis-controller.js`, `apps/backend/services/site-analysis-service.js`, `apps/backend/routes/api/training-records.js`, `apps/backend/controllers/training-record-controller.js`, `apps/backend/services/training-record-service.js`
- Migration required or not: `No`
- Backward compatibility concern: Existing clients that pass arbitrary `farmId` values may start receiving authorization failures.
- Test cases required: cross-tenant negative tests for create/read/update/delete; farm-owner positive tests; verify-route actor-boundary tests.
- Reviewer type needed: `Backend`, `Security / Architecture review`, `QA`
- Merge risk: `High`
- Suggested merge order: `2`

[PR Plan Item]
- PR ID: `PR-03`
- Title: `backend/workflow-status-contract-normalization`
- Related batch/issues: `FB-02`; `M-005`
- Scope: Normalize backend workflow/status constants and transition validation without introducing schema migration in the same PR.
- Files likely changed: `apps/backend/shared/workflow-state-machine.js`, `apps/backend/constants/status-machine.js`, `apps/backend/services/workflow-transition-service.js`, `apps/backend/routes/api/applications.js`, `apps/backend/routes/api/preview.js`, `apps/backend/routes/api/provider/handlers/workflow-transitions-handler.js`
- Migration required or not: `No`
- Backward compatibility concern: Older clients or records using legacy status names may stop traversing the flow correctly if alias handling is narrowed too early.
- Test cases required: status transition contract tests for applicant, provider review, and preview readiness; invalid-transition rejection tests.
- Reviewer type needed: `Backend`, `Security / Architecture review`, `Frontend`
- Merge risk: `High`
- Suggested merge order: `3`

[PR Plan Item]
- PR ID: `PR-04`
- Title: `backend/payment-webhook-logic-hardening`
- Related batch/issues: `FB-02`; `M-013`
- Scope: Fix payment creation and webhook logic for idempotency, atomicity, and route/service contract alignment without database migration in the same PR.
- Files likely changed: `apps/backend/routes/api/payments.js`, `apps/backend/routes/api/webhooks.js`, `apps/backend/services/payment-service-phase-flow.js`, `apps/backend/services/payment-service-webhook-flow.js`, `apps/backend/services/invoice-service.js`
- Migration required or not: `No`
- Backward compatibility concern: In-flight payments or replay behavior may change; operational reconciliation notes may be needed.
- Test cases required: payment create tests for phase 1 and phase 2; webhook replay tests; partial-failure recovery tests; invoice/application state sync tests.
- Reviewer type needed: `Backend`, `QA`
- Merge risk: `High`
- Suggested merge order: `4`

[PR Plan Item]
- PR ID: `PR-05`
- Title: `backend/async-callback-cron-safety`
- Related batch/issues: `FB-02`; `M-014`
- Scope: Harden lab callbacks, offline sync auth verification order, cron secret enforcement, and queue/DLQ safety checks without mixing in payment schema changes.
- Files likely changed: `apps/backend/routes/api/callbacks.js`, `apps/backend/routes/api/sync.js`, `apps/backend/routes/api/cron.js`, `apps/backend/services/queue-service.js`, `apps/backend/jobs/webhook-dlq-processor.js`, `apps/backend/jobs/scheduler.js`
- Migration required or not: `No`
- Backward compatibility concern: External callbacks and cron callers may need updated credentials or signing expectations.
- Test cases required: callback auth/signature tests; offline sync JWT verification tests; cron secret tests; DLQ enqueue/replay tests.
- Reviewer type needed: `Backend`, `DevOps`, `Security / Architecture review`
- Merge risk: `High`
- Suggested merge order: `5`

## Batch 2 = next safest

[PR Plan Item]
- PR ID: `PR-06`
- Title: `database/payment-transaction-key-hardening`
- Related batch/issues: `FB-03`; `M-017`
- Scope: Introduce the minimum payment transaction key/index changes needed for durable webhook lookup and idempotency support.
- Files likely changed: `apps/backend/prisma/schema.prisma`, new migration under `apps/backend/prisma/migrations/*`, `apps/backend/services/payment-service-webhook-flow.js`, `apps/backend/services/payment-service-phase-flow.js`
- Migration required or not: `Yes`
- Backward compatibility concern: Existing duplicate or null `gatewayRef` rows may block migration and require pre-merge cleanup scripts.
- Test cases required: schema migration on shadow DB; restored DB rehearsal; duplicate `gatewayRef` detection; webhook lookup regression tests.
- Reviewer type needed: `Database`, `Backend`
- Merge risk: `High`
- Suggested merge order: `6`

[PR Plan Item]
- PR ID: `PR-07`
- Title: `database/ownership-and-relation-integrity-hardening`
- Related batch/issues: `FB-03`; `M-016`
- Scope: Harden ownership and critical relation integrity for user/application/invoice/consent/certificate references without touching UI or auth layers.
- Files likely changed: `apps/backend/prisma/schema.prisma`, new migration under `apps/backend/prisma/migrations/*`, `apps/backend/middleware/consent-manager.js`, `apps/backend/services/certificate-service.js`, `apps/backend/services/invoice-service.js`
- Migration required or not: `Yes`
- Backward compatibility concern: Existing orphan or malformed rows can make the migration fail or require staged data cleanup.
- Test cases required: relation-integrity migration tests; orphan-row detection scripts; ownership-join regression tests for applications and invoices.
- Reviewer type needed: `Database`, `Backend`
- Merge risk: `High`
- Suggested merge order: `7`

[PR Plan Item]
- PR ID: `PR-08`
- Title: `database/trace-qr-uniqueness-hardening`
- Related batch/issues: `FB-03`; `M-017`
- Scope: Harden QR/public URL uniqueness and lookup semantics for public trace resolution only.
- Files likely changed: `apps/backend/prisma/schema.prisma`, new migration under `apps/backend/prisma/migrations/*`, `apps/backend/services/trace-service/queries.js`, `apps/backend/services/trace-service/resolve-plot-cycle.js`, `apps/backend/services/qrcode/qrcode-service.js`
- Migration required or not: `Yes`
- Backward compatibility concern: Old duplicate QR/public URL data may need reconciliation before migration can succeed.
- Test cases required: duplicate QR/publicUrl detection; migration rehearsal; QR-resolution parity tests across lot/batch/plant/plot-cycle.
- Reviewer type needed: `Database`, `Backend`
- Merge risk: `High`
- Suggested merge order: `8`

[PR Plan Item]
- PR ID: `PR-09`
- Title: `backend/document-verification-and-certificate-issuance-hardening`
- Related batch/issues: `FB-05`; `M-008`
- Scope: Make backend document verification durable and remove fragile certificate issuance behavior without changing frontend health screens in the same PR.
- Files likely changed: `apps/backend/routes/api/documents.js`, `apps/backend/services/document-analysis-service.js`, `apps/backend/routes/api/certificates.js`, `apps/backend/routes/api/provider/certificates.js`, `apps/backend/services/certificate-service.js`
- Migration required or not: `No`
- Backward compatibility concern: Certificate generation timing or verification payload shape may change for callers expecting current best-effort behavior.
- Test cases required: document verify persistence tests; certificate issuance concurrency tests; certificate generation failure-path tests.
- Reviewer type needed: `Backend`, `QA`
- Merge risk: `Medium`
- Suggested merge order: `9`

[PR Plan Item]
- PR ID: `PR-10`
- Title: `frontend/web-session-boundary-cleanup`
- Related batch/issues: `FB-04`; `M-001`
- Scope: Align web middleware, login redirects, session reads, and role-based route entry behavior without changing proxy forwarding rules in the same PR.
- Files likely changed: `apps/web-app/src/middleware.ts`, `apps/web-app/src/lib/services/auth-service.ts`, `apps/web-app/src/lib/services/auth-provider.tsx`, `apps/web-app/src/app/page.tsx`, `apps/web-app/src/app/(auth)/login/page.tsx`, provider and health layout shells
- Migration required or not: `No`
- Backward compatibility concern: Existing browser sessions may need re-login if cookie or redirect assumptions change.
- Test cases required: anonymous-to-protected redirect tests; health/provider login and logout tests; expired-session redirect tests; nav visibility smoke tests.
- Reviewer type needed: `Frontend`, `Backend`
- Merge risk: `Medium`
- Suggested merge order: `10`

[PR Plan Item]
- PR ID: `PR-11`
- Title: `frontend/next-proxy-transport-normalization`
- Related batch/issues: `FB-04`; `M-002`
- Scope: Normalize the active Next proxy family for header, query, cookie, upload, and download forwarding without touching page-level UI flows in the same PR.
- Files likely changed: `apps/web-app/src/app/api/[...path]/route.ts`, `apps/web-app/src/app/api/proxy/[...path]/route.ts`, `apps/web-app/src/app/api/auth/health/[...path]/route.ts`, `apps/web-app/src/app/api/auth/provider/[...path]/route.ts`, `apps/web-app/src/app/api/session/set-cookie/route.ts`, `apps/web-app/src/app/api/auth/set-session-cookie/route.ts`, `apps/web-app/src/config/server.config.ts`
- Migration required or not: `No`
- Backward compatibility concern: Hidden consumers of `/api/proxy/*` or current cookie behavior may break if transport rules tighten.
- Test cases required: multipart upload passthrough; PDF/download header preservation; POST-with-query passthrough; `Set-Cookie` passthrough; provider auth query forwarding tests.
- Reviewer type needed: `Frontend`, `Backend`
- Merge risk: `High`
- Suggested merge order: `11`

## Batch 3 = follow-up stabilization

[PR Plan Item]
- PR ID: `PR-12`
- Title: `frontend/health-application-contract-alignment`
- Related batch/issues: `FB-05`; `M-006`, `M-009`
- Scope: Align health workflow pages, wizard flow, establishment flow, certificates, and payment entry points to active backend contracts without mixing evidence-upload rewiring in the same PR.
- Files likely changed: `apps/web-app/src/app/health/dashboard/page.tsx`, `apps/web-app/src/app/health/applications/page.tsx`, `apps/web-app/src/app/health/applications/new/**/*`, `apps/web-app/src/app/health/applications/preview/page.tsx`, `apps/web-app/src/app/health/applications/payment/page.tsx`, `apps/web-app/src/app/health/applications/[id]/**/*`, `apps/web-app/src/app/health/establishments/**/*`, `apps/web-app/src/app/health/certificates/page.tsx`, `apps/web-app/src/app/health/payments/page.tsx`
- Migration required or not: `No`
- Backward compatibility concern: Existing bookmarked wizard, preview, and payment URLs may need redirect handling or compatibility notes.
- Test cases required: health happy path; establishment create flow; health certificate listing; payment handoff tests; wizard config and draft-state tests.
- Reviewer type needed: `Frontend`, `Backend`, `QA`
- Merge risk: `High`
- Suggested merge order: `12`

[PR Plan Item]
- PR ID: `PR-13`
- Title: `frontend/health-evidence-upload-wiring`
- Related batch/issues: `FB-05`; `M-008`
- Scope: Wire health-side evidence and document screens to real upload contracts and durable failure states without broader navigation or auth cleanup in the same PR.
- Files likely changed: `apps/web-app/src/app/health/applications/replacement/page.tsx`, `apps/web-app/src/app/health/applications/renewal/**/*`, `apps/web-app/src/app/health/applications/[id]/car/page.tsx`, `apps/web-app/src/app/health/applications/new/step/[id]/page.tsx`, `apps/web-app/src/app/health/applications/new/hooks/use-auto-save.ts`
- Migration required or not: `No`
- Backward compatibility concern: Existing client-side cached draft state may not match the new upload path and may need reset handling.
- Test cases required: replacement evidence upload test; renewal upload and payment negative tests; CAR file upload test; draft document delete/retry tests; page reload persistence checks.
- Reviewer type needed: `Frontend`, `Backend`, `QA`
- Merge risk: `Medium`
- Suggested merge order: `13`

[PR Plan Item]
- PR ID: `PR-14`
- Title: `frontend/provider-admin-contract-alignment`
- Related batch/issues: `FB-06`; `M-007`
- Scope: Align provider and admin portal pages to canonical backend namespaces and remove obviously dead operational controls without mixing planting/public trace refactors in the same PR.
- Files likely changed: `apps/web-app/src/app/provider/dashboard/page.tsx`, `apps/web-app/src/app/provider/applications/**/*`, `apps/web-app/src/app/provider/audits/**/*`, `apps/web-app/src/app/provider/analytics/page.tsx`, `apps/web-app/src/app/provider/accounting/page.tsx`, `apps/web-app/src/app/provider/verification/**/*`, `apps/web-app/src/app/admin/users/page.tsx`, `apps/web-app/src/app/admin/settings/page.tsx`, `apps/web-app/src/lib/services/provider-api.ts`
- Migration required or not: `No`
- Backward compatibility concern: Existing provider bookmarks and habits around admin alias pages may need redirect or communication handling.
- Test cases required: reviewer/scheduler/auditor/head-auditor/account/admin route tests; analytics endpoint tests; accounting button tests; identity verification authorization tests.
- Reviewer type needed: `Frontend`, `Backend`, `QA`
- Merge risk: `High`
- Suggested merge order: `14`

[PR Plan Item]
- PR ID: `PR-15`
- Title: `frontend/planting-and-trace-ui-alignment`
- Related batch/issues: `FB-06`; `M-012`
- Scope: Align provider planting detail, health tracking aliases, and public trace page contracts to canonical APIs without changing backend public trust contracts in the same PR.
- Files likely changed: `apps/web-app/src/app/provider/planting/**/*`, `apps/web-app/src/app/health/tracking/**/*`, `apps/web-app/src/app/health/planting/**/*`, `apps/web-app/src/app/trace/**/*`, `apps/web-app/src/lib/services/planting-service.ts`
- Migration required or not: `No`
- Backward compatibility concern: Legacy trace or tracking deep links may need redirect compatibility to avoid breaking bookmarks.
- Test cases required: provider planting detail test; tracking alias redirect tests; public trace navigation/error tests; health planting detail smoke tests.
- Reviewer type needed: `Frontend`, `Backend`
- Merge risk: `High`
- Suggested merge order: `15`

[PR Plan Item]
- PR ID: `PR-16`
- Title: `backend/public-trust-contract-consolidation`
- Related batch/issues: `FB-07`; `M-010`
- Scope: Consolidate backend public verification and trust route behavior without combining in Prisma ownership or migration-cleanup work.
- Files likely changed: `apps/backend/routes/api/public.js`, `apps/backend/routes/api/certificates.js`, `apps/backend/routes/api/interoperability.js`, `apps/backend/routes/api/trace.js`, `apps/backend/routes/public-trace.js`, `apps/backend/services/trace-service/**/*.js`, `apps/backend/services/certificate-service.js`
- Migration required or not: `No`
- Backward compatibility concern: Public URLs, QR flows, or external consumers of verify endpoints may require deprecation handling or response-shape notes.
- Test cases required: payload parity checks across all public verification surfaces; QR-resolution tests; revocation/trust-read tests.
- Reviewer type needed: `Backend`, `Security / Architecture review`, `QA`
- Merge risk: `Medium`
- Suggested merge order: `16`

[PR Plan Item]
- PR ID: `PR-17`
- Title: `database/prisma-schema-ownership-alignment`
- Related batch/issues: `FB-07`; `M-015`
- Scope: Remove duplicated Prisma ownership ambiguity and align the web app to the canonical schema/generation path without mixing runtime migration cleanup in the same PR.
- Files likely changed: `apps/backend/prisma/schema.prisma`, `apps/web-app/prisma/schema.prisma`, `apps/web-app/src/lib/prisma.ts`, `apps/web-app/src/lib/auth.ts`, package scripts that run Prisma generate
- Migration required or not: `No` for runtime schema shape; `Build/config` change only
- Backward compatibility concern: Web build or server-side auth helpers may fail if they assume the old Prisma generation path.
- Test cases required: canonical Prisma generate path check; web build check; server-side auth smoke tests; schema-drift CI guard.
- Reviewer type needed: `Database`, `Frontend`
- Merge risk: `Medium`
- Suggested merge order: `17`

[PR Plan Item]
- PR ID: `PR-18`
- Title: `database-migrations-and-release-gate-cleanup`
- Related batch/issues: `FB-07`; `M-019`, `M-022`
- Scope: Clean migration-chain hygiene and strengthen release/readiness gates without mixing public trust route changes or web UI changes in the same PR.
- Files likely changed: `apps/backend/prisma/migrations/*`, `apps/backend/prisma/migrations/*.sql`, `scripts/production-readiness-check.js`, `scripts/run-regression-gate.js`, `tests/smoke/**/*`, `docs/preview-deploy-runbook.md`, `docs/preview-deploy-checklist.md`
- Migration required or not: `Yes` for migration-chain cleanup and rehearsal support
- Backward compatibility concern: Deployment workflows and migrate-deploy expectations may change; operators need updated runbook steps.
- Test cases required: clean-db and restored-db migrate rehearsals; release gate execution on target SHA; smoke suite pass; restore drill validation.
- Reviewer type needed: `Database`, `DevOps`, `QA`
- Merge risk: `High`
- Suggested merge order: `18`

## Suggested Merge Sequence

1. `PR-01`
2. `PR-02`
3. `PR-03`
4. `PR-04`
5. `PR-05`
6. `PR-06`
7. `PR-07`
8. `PR-08`
9. `PR-09`
10. `PR-10`
11. `PR-11`
12. `PR-12`
13. `PR-13`
14. `PR-14`
15. `PR-15`
16. `PR-16`
17. `PR-17`
18. `PR-18`

Parallelization notes:
- `PR-01` and `PR-02` can be coded in parallel but should still merge in the listed order.
- `PR-06`, `PR-07`, and `PR-08` should not merge until the business-key logic in `PR-04` and `PR-05` is stable.
- `PR-12` to `PR-15` should not start merge review until `PR-10` and `PR-11` stabilize session and proxy behavior.
