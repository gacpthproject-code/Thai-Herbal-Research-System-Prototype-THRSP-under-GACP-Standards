# Phase 4 Database Audit

This phase audits the database layer from runtime truth, using:

- `apps/backend/prisma/schema.prisma`
- `apps/web-app/prisma/schema.prisma`
- `apps/backend/prisma/migrations/*`
- backend runtime fallback paths and entity usage in `apps/backend`
- active web Prisma usage in `apps/web-app`

Verification basis for this phase:

- Active HTTP runtime was verified from `apps/backend/server.js`, which mounts `/api` to `apps/backend/routes/api/index.js` and mounts public `/trace/*` to `apps/backend/routes/public-trace.js`.
- Database-coupled evidence was only counted when it could be traced through `route registration -> middleware/auth wiring -> controller/service import -> Prisma model usage`.
- Schema-only or file-only observations were kept only for migration/schema findings. They were not treated as active runtime evidence unless the corresponding route/service chain was also verified.
- Example of exclusion rule: `apps/backend/routes/api/audit.js` exists on disk, but `apps/backend/routes/api/index.js` mounts `./audits`, not `./audit`, so `audit.js` was not treated as an active route surface in this phase.
- Drift or inconsistency is treated as an issue even when the runtime still responds successfully, still has fallback behavior, or still appears usable from the UI/API surface.

[Database Audit Item]
- ID: DB-001
- Table/Model: Prisma schema surface (`apps/backend/prisma/schema.prisma` and `apps/web-app/prisma/schema.prisma`)
- Related Flow: Web server-side auth, Prisma client generation, and any code path that assumes the web schema copy matches backend runtime
- Findings: The repo keeps two Prisma schema files. The web app instantiates `PrismaClient` in `apps/web-app/src/lib/prisma.ts` and uses it in `apps/web-app/src/lib/auth.ts`, but `apps/web-app/prisma` contains only `schema.prisma` and no migration history. The duplicate schema is already drifted from backend runtime.
- Risk Level: High
- Evidence: `git diff --no-index -- apps/backend/prisma/schema.prisma apps/web-app/prisma/schema.prisma`; `apps/web-app/src/lib/prisma.ts`; `apps/web-app/src/lib/auth.ts`; `apps/web-app/prisma`
- Possible Data Integrity Impact: The web app can generate Prisma types and queries from a stale model snapshot, which increases the chance of silent field omissions, invalid assumptions about relations, and environment-specific query failures.
- What to inspect next: How `@prisma/client` is generated during web builds, and whether any deployment path runs Prisma generate or migrate from `apps/web-app`

[Database Audit Item]
- ID: DB-002
- Table/Model: `Application` / `ApplicationComment`
- Related Flow: Application revision history, rejection comments, provider workflow transitions, and application detail/history views
- Findings: Backend schema defines `Application.comments` and `ApplicationComment`, but the web schema copy omits both. The table was added late in `20260304093000_add_application_comments_table`, then adjusted again in `20260305163000_reconcile_schema_gap_for_migrate_deploy`. Runtime code explicitly falls back when `application_comments` is missing. Inside the model, `auditorId` and `resolvedBy` are plain strings with no FK to `User` or `DTAMPROVIDER`.
- Risk Level: High
- Evidence: Active chain verified from `apps/backend/server.js -> /api -> apps/backend/routes/api/index.js -> /applications and /provider/applications -> apps/backend/routes/api/applications.js` and `apps/backend/routes/api/provider/applications.js` -> Prisma `application.comments` / `applicationComment.create`; provider workflow transition chain verified from `apps/backend/routes/api/provider/index.js -> /applications -> route-registry -> handlers/workflow-transitions-handler.js`; schema/migration side verified from `apps/backend/prisma/schema.prisma`, `apps/web-app/prisma/schema.prisma`, `apps/backend/prisma/migrations/20260304093000_add_application_comments_table/migration.sql`, and `apps/backend/prisma/migrations/20260305163000_reconcile_schema_gap_for_migrate_deploy/migration.sql`
- Possible Data Integrity Impact: Comment history can disappear by environment, revision evidence can be partially persisted, and comment authors/resolvers can become orphaned values with no referential enforcement.
- What to inspect next: Whether any production environments still lack `application_comments`, and whether workflow/reporting code expects provider joins from `auditorId` or `resolvedBy`

[Database Audit Item]
- ID: DB-003
- Table/Model: `Application` / `Invoice` / `User`
- Related Flow: Applicant ownership, invoice ownership, and identity-scoped reads across health flows
- Findings: Ownership FKs for `Application.healthId` and `Invoice.healthId` now reference `User.healthId`, not `User.id`. The migration `20260208160000_replace_Applicantid_with_healthid` backfills from the old `ApplicantId` model and then adds FKs to `users.healthId`. In schema, `User.healthId` is `String? @unique`, so workflow ownership depends on a nullable natural-key identity column rather than an immutable primary key.
- Risk Level: High
- Evidence: Active chain verified from `apps/backend/server.js -> /api -> apps/backend/routes/api/index.js -> /applications -> apps/backend/routes/api/applications.js`, where health-scoped reads use `applicationService.resolveHealthIdentity` and then query `application.healthId`; identity resolution chain verified in `apps/backend/services/application-service/application-identity-methods.js`; invoice ownership chain verified from `apps/backend/routes/api/index.js -> /invoices -> apps/backend/routes/api/invoices.js`, which resolves `healthId` from `req.user` and calls `invoiceService.listByApplicant(healthId, ...)`; schema/migration side verified from `apps/backend/prisma/schema.prisma` and `apps/backend/prisma/migrations/20260208160000_replace_Applicantid_with_healthid/migration.sql`
- Possible Data Integrity Impact: If `healthId` changes, is backfilled incorrectly, or is absent on a user record, ownership joins for applications and invoices can detach from the intended account even when `User.id` remains stable.
- What to inspect next: All write paths that can mutate `users.healthId`, and whether any user merge, correction, or identity-reverification flow updates historical ownership safely

[Database Audit Item]
- ID: DB-004
- Table/Model: `UserConsent`
- Related Flow: PDPA consent capture, consent withdrawal, and consent reporting
- Findings: `UserConsent.userId` is a scalar field with no Prisma relation to `User`, and the initial migration creates `user_consents` with indexes and a unique key but no FK to `users`. Runtime actively reads and writes the table through the consent manager.
- Risk Level: High
- Evidence: Active chain verified from `apps/backend/server.js -> /api -> apps/backend/routes/api/index.js -> /consent -> apps/backend/routes/api/consent.js (authenticateHealth)` -> `apps/backend/middleware/consent-manager.js` -> `PrismaClient.userConsent.findFirst/findMany/create/update`; schema/migration side verified from `apps/backend/prisma/schema.prisma` and `apps/backend/prisma/migrations/20260110020726_add_system_config/migration.sql`
- Possible Data Integrity Impact: Orphan consent rows can survive user deletion or identity drift, and consent records can no longer be guaranteed to belong to a currently valid user row.
- What to inspect next: Account deletion flows, any user merge scripts, and compliance/export jobs that assume consent rows are always joinable to `users`

[Database Audit Item]
- ID: DB-005
- Table/Model: `SystemConfig`
- Related Flow: Public configuration, admin configuration listing, pricing lookup, and holiday/working-day calculations
- Findings: Schema defines `SystemConfig.value` as `String` and has no `group` field, but runtime treats `value` as boolean, array, object, or comma-delimited payload depending on caller. `system-config-controller.js` orders by `group`, which is not present in the Prisma model. `working-days-service.js` also has a non-blocking fallback when `systemConfig` is unavailable.
- Risk Level: High
- Evidence: Active chain verified from `apps/backend/server.js -> /api -> apps/backend/routes/api/index.js -> /system-config -> apps/backend/routes/api/system-config.routes.js (authenticateProvider + adminOnly)` -> `apps/backend/controllers/system-config-controller.js` -> `prisma.systemConfig.findMany/update/findUnique`; runtime dependency chain also verified from `apps/backend/routes/api/applications.js`, `apps/backend/routes/api/cron.js`, and `apps/backend/routes/api/system.js` importing `apps/backend/services/working-days-service.js`, which calls `prisma.systemConfig.findUnique`; schema side verified from `apps/backend/prisma/schema.prisma`
- Possible Data Integrity Impact: Config reads can fail at runtime, admin listing can issue invalid Prisma queries, and business logic can silently fall back to env-only values instead of persisted database policy.
- What to inspect next: The live `system_configs` table shape, any manual SQL that introduced a `group` column outside Prisma, and the exact stored format of `public_holidays_th`

[Database Audit Item]
- ID: DB-006
- Table/Model: `Certificate`
- Related Flow: Certificate issuance, verification, farm linkage, and certificate backfills
- Findings: `Certificate.farmId` is a required scalar but has no Prisma relation or DB FK to `Farm`. The model stores both `farmId` and denormalized farm snapshot fields (`farmName`, `province`, `district`, `subDistrict`, `ApplicantName`, `cropType`, `farmSize`), while certificate issuance logic resolves farms at runtime.
- Risk Level: High
- Evidence: Active chain verified from `apps/backend/server.js -> /api -> apps/backend/routes/api/index.js -> /certificates -> apps/backend/routes/api/certificates.js` (download path imports `../../services/certificate-service`) and `-> /audits -> apps/backend/routes/api/audits.js`, plus provider workflow chains from `apps/backend/routes/api/provider/handlers/auditor-handler-deps.js` and `apps/backend/routes/api/provider/handlers/workflow-handler-deps.js`, all calling `apps/backend/services/certificate-service.js`; schema side verified from `apps/backend/prisma/schema.prisma`; backfill/runtime repair usage verified from `apps/backend/scripts/backfill-certificate-farm-plots.js`
- Possible Data Integrity Impact: Certificates can point at non-existent or wrong farm IDs, while snapshot fields continue to look valid, making trust, reporting, and later joins disagree with the actual farm record set.
- What to inspect next: Certificate verify endpoints and any reporting queries that assume `certificates.farmId` can always be joined back to `farms`

[Database Audit Item]
- ID: DB-007
- Table/Model: `Invoice`
- Related Flow: Billing, manual payment marking, receipt issuance, and payment reconciliation
- Findings: `Invoice.paymentTransactionId` is a nullable string with no Prisma relation and no FK to `PaymentTransaction`. Runtime writes the field directly in `invoice-service.js`, but there is no DB-level guarantee that the referenced transaction exists or belongs to the same application.
- Risk Level: High
- Evidence: Active chain verified from `apps/backend/server.js -> /api -> apps/backend/routes/api/index.js -> /invoices -> apps/backend/routes/api/invoices.js`, which imports `../../services/invoice-service` and exposes list, PDF, payment, and receipt flows; payment-sync dependency chain also verified from `apps/backend/routes/api/index.js -> /payments -> apps/backend/routes/api/payments.js`, which imports `syncPhaseStatusesFromInvoices` from `../../services/payment-service`; persistence logic verified in `apps/backend/services/invoice-service.js`, which writes `paymentTransactionId` directly; schema side verified from `apps/backend/prisma/schema.prisma`
- Possible Data Integrity Impact: Invoices can retain dangling or cross-linked payment IDs, which can distort receipt flows, billing reports, and payment traceability without raising relational errors.
- What to inspect next: Reporting code that joins invoices and payment transactions, and any cleanup or backfill script that assumes `paymentTransactionId` is trustworthy

[Database Audit Item]
- ID: DB-008
- Table/Model: `PaymentTransaction`
- Related Flow: Payment creation, webhook processing, idempotency, and reconciliation
- Findings: Runtime webhook flow finds transactions with `findFirst({ where: { gatewayRef: invoiceId } })`, but schema only indexes `gatewayRef`; it is not unique. The model has a unique `idempotencyKey`, but payment creation builds it from `${applicationId}-PHASE1-${Date.now()}` or `${applicationId}-PHASE2-${Date.now()}`, which is uniqueness-oriented rather than stable replay idempotency. `gatewayRef` is also nullable even though webhook matching depends on it.
- Risk Level: Critical
- Evidence: Active chain verified from `apps/backend/server.js -> /api -> apps/backend/routes/api/index.js -> /payments -> apps/backend/routes/api/payments.js` importing `../../services/payment-service`, which delegates to `apps/backend/services/payment-service-phase-flow.js` and creates `prisma.paymentTransaction` rows; webhook path verified from `apps/backend/routes/api/index.js -> /webhooks -> apps/backend/routes/api/webhooks.js` importing `handleWebhook` from `../../services/payment-service`, which delegates to `apps/backend/services/payment-service-webhook-flow.js` and resolves transactions by `gatewayRef`; schema/migration side verified from `apps/backend/prisma/schema.prisma` and `apps/backend/prisma/migrations/20260222072000_reconcile_schema_backlog_for_preview_regression/migration.sql`
- Possible Data Integrity Impact: A replayed or ambiguous gateway reference can update the wrong transaction, duplicate payment rows can still represent the same business attempt, and webhook safety depends on application logic rather than a hard relational/key boundary.
- What to inspect next: Real gateway payload uniqueness guarantees, existing duplicate `gatewayRef` counts, and whether payment reconciliation depends on one-to-one transaction matching

[Database Audit Item]
- ID: DB-009
- Table/Model: `Application` / `Invoice` / `Quote` / `PaymentTransaction` / `Certificate` / `PlantingCycle` / `HarvestBatch` / `Lot`
- Related Flow: End-to-end workflow state transitions, billing transitions, certificate lifecycle, and planting/trace operations
- Findings: Statuses are modeled as free-form strings across major entities instead of Prisma enums. Runtime uses multiple dialects at the same time, including `PENDING_DOC_FEE`, `DOC_FEE_PAID`, `PAYMENT_1_PENDING`, `UNDER_REVIEW`, `WAITING_PAYMENT_2`, `QUOTE_SENT`, `AWAITING_PAYMENT`, and lower-case invoice/certificate states. Some code comments already indicate uncertainty about whether certain values are supported.
- Risk Level: High
- Evidence: Active chains verified from mounted route families in `apps/backend/routes/api/index.js`, especially `/applications`, `/payments`, `/quotes`, `/invoices`, `/certificates`, `/harvest-batches`, and `/provider/*`; concrete runtime mappings verified in `apps/backend/routes/api/applications.js`, `apps/backend/routes/api/quotes.js`, `apps/backend/services/invoice-service.js`, and `apps/backend/services/payment-service-webhook-flow.js`; canonical and legacy status dialect sources verified from `apps/backend/shared/workflow-state-machine.js` and `apps/backend/constants/status-machine.js`; schema side verified from `apps/backend/prisma/schema.prisma`
- Possible Data Integrity Impact: Invalid or legacy state values can be stored without schema resistance, leading to broken filters, mismatched frontend badges, incorrect reports, and workflow branches that stop recognizing persisted records.
- What to inspect next: A distinct-value inventory from live data for each status column, and every frontend mapping that assumes a canonical subset of those statuses

[Database Audit Item]
- ID: DB-010
- Table/Model: `AuditLog`
- Related Flow: Security audit trail, workflow audit trail, compliance retention, and operational debugging
- Findings: `AuditLog` is intentionally denormalized with scalar `actorId` and `resourceId` and no FKs. Active runtime logging flows go through `middleware/audit-logger.js` and `services/audit-trail.js`, which both write via Prisma and preserve a hash chain. A separate file-based fallback path exists inside the audit logger itself when DB writes fail. A standalone `routes/api/audit.js` file also exists on disk, but it is not mounted by `routes/api/index.js`, so it was not treated as an active HTTP surface for this phase.
- Risk Level: Medium
- Evidence: Active chain verified from `apps/backend/server.js -> /api -> apps/backend/routes/api/index.js -> providerRouter auditMiddleware`, auth controllers, and other route handlers importing `apps/backend/middleware/audit-logger.js`; persistence chain verified from `apps/backend/services/audit-trail.js -> auditLogger.log -> prisma.auditLog.findFirst/create`; mounted audit read/manage surface verified from `apps/backend/routes/api/index.js -> /audit and /audits -> apps/backend/routes/api/audits.js`; schema side verified from `apps/backend/prisma/schema.prisma`
- Possible Data Integrity Impact: Audit completeness can diverge between DB-backed records and file-backed fallback logs, and actor/resource referential integrity cannot be enforced or repaired by the database alone.
- What to inspect next: Which runtime paths still write through the file-backed route layer, and whether retention/export tooling reads only `audit_logs` or also consumes fallback files

[Database Audit Item]
- ID: DB-011
- Table/Model: `HarvestBatch`
- Related Flow: Harvest logging, lot generation, planting trace, and provider/admin planting oversight
- Findings: `HarvestBatch` is queried by `farmId` and `cycleId` in runtime services, but the schema only indexes `batchNumber` and `status`. The model has only `isDeleted` for soft delete state and sparse audit metadata (`recordedBy`, `notes`) without `deletedAt`, `deletedBy`, or richer history fields.
- Risk Level: High
- Evidence: Active chain verified from `apps/backend/server.js -> /api -> apps/backend/routes/api/index.js -> /harvest-batches -> apps/backend/routes/api/harvest-batches.js (authenticateHealth)` -> `apps/backend/services/harvest-service.js` and direct `prisma.harvestBatch` writes; downstream runtime usage verified from `apps/backend/services/gacp-scoring-service.js` and `apps/backend/services/traceability/auto-first-cycle-trace.js`; schema side verified from `apps/backend/prisma/schema.prisma`
- Possible Data Integrity Impact: Farm/cycle-scoped harvest queries can degrade as volume grows, and deletion or correction events can remove business visibility without leaving a sufficiently reconstructable history trail.
- What to inspect next: Query plans for farm/cycle harvest endpoints and whether downstream trace/report features rely on historical harvest records after soft deletion

[Database Audit Item]
- ID: DB-012
- Table/Model: `TraceQrSecurity`
- Related Flow: Public trace resolution, QR integrity lookup, legacy trace compatibility, and scan logging
- Findings: The model only enforces uniqueness on `(entityType, entityId)`. `qrCode` is nullable and not unique, and `publicUrl` is required but also not unique. Runtime trace resolution repeatedly uses `findFirst` and `publicUrl contains` compatibility lookups, including legacy path matching.
- Risk Level: High
- Evidence: Active chain verified from `apps/backend/server.js -> /api -> apps/backend/routes/api/index.js -> /trace -> apps/backend/routes/api/trace.js`, which imports `../../services/trace-service`; public redirect chain also verified from `apps/backend/server.js -> /trace -> apps/backend/routes/public-trace.js -> /api/trace/*`; lookup logic verified in `apps/backend/services/trace-service/queries.js` and `apps/backend/services/trace-service/resolve-plot-cycle.js`, which query `prisma.traceQrSecurity.findFirst/findMany`; QR creation path verified in `apps/backend/services/qrcode/qrcode-service.js`; schema side verified from `apps/backend/prisma/schema.prisma`
- Possible Data Integrity Impact: Duplicate or overlapping QR/public URL records can resolve to the wrong trace subject, especially when compatibility fallback paths rely on substring matching rather than a strict unique key.
- What to inspect next: Duplicate counts for `qrCode` and `publicUrl`, plus all backfill scripts that generate `publicUrl` values for old records

[Database Audit Item]
- ID: DB-013
- Table/Model: `SiteAnalysis` / `TrainingRecord`
- Related Flow: Health compliance evidence, establishment readiness, provider verification, and farm-level documentation
- Findings: These evidence models were added via reconcile migration and have farm FKs plus minimal metadata, but no soft delete fields and no full audit/history trail. `SiteAnalysis` has `verifiedBy` and `verifiedAt`; `TrainingRecord` has `recordedBy`; neither model records edit/delete history or retains an ownership snapshot beyond `farmId`.
- Risk Level: Medium
- Evidence: Active chain verified from `apps/backend/server.js -> /api -> apps/backend/routes/api/index.js -> /site-analyses -> apps/backend/routes/api/site-analyses.js` and `-> /training-records -> apps/backend/routes/api/training-records.js`, both protected by `authenticateHealth` and delegated to controller handlers; schema/migration side verified from `apps/backend/prisma/schema.prisma` and `apps/backend/prisma/migrations/20260305163000_reconcile_schema_gap_for_migrate_deploy/migration.sql`
- Possible Data Integrity Impact: Corrections and removals can overwrite evidentiary records without a reconstructable history, which weakens auditability for compliance material that is reused across later review stages.
- What to inspect next: The exact update/delete paths for these models and whether external lab or review workflows ever need point-in-time evidence snapshots

[Database Audit Item]
- ID: DB-014
- Table/Model: Migration chain / schema evolution surface
- Related Flow: Deploy, migrate, schema reconciliation, and environment bootstrap
- Findings: The migration history contains multiple reconcile/backlog migrations (`reconcile_schema_backlog_for_preview_regression`, `reconcile_schema_gap_for_migrate_deploy`), extensive `IF NOT EXISTS` and `DROP CONSTRAINT IF EXISTS` usage, a placeholder migration folder (`add_dtam_requirements`) with no SQL, and standalone SQL files (`add_farm_audit_enhancements.sql`, `add_performance_indexes.sql`, `fix_schema_gaps.sql`) sitting beside timestamped migrations.
- Risk Level: High
- Evidence: `apps/backend/prisma/migrations`; `apps/backend/prisma/migrations/add_dtam_requirements/migration.sql`; `apps/backend/prisma/migrations/20260222072000_reconcile_schema_backlog_for_preview_regression/migration.sql`; `apps/backend/prisma/migrations/20260305163000_reconcile_schema_gap_for_migrate_deploy/migration.sql`
- Possible Data Integrity Impact: Different environments can converge on superficially similar but materially different schemas, which is exactly the condition that keeps runtime fallback code and compatibility logic alive.
- What to inspect next: Prisma migrate history in each deployed environment, shadow database diffs, and whether the standalone SQL files were ever executed outside Prisma migrate
