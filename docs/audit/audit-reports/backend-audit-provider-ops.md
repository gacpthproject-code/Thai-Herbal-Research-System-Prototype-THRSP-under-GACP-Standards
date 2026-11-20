# Phase 3 Backend Audit - Provider Operations

[Backend Audit Item]
- ID: PROVIDER-01
- Endpoint/Module: Canonical provider dashboards and workflow handlers under `/api/provider/*`
- Controller/Service/Middleware: `routes/api/provider/index.js` -> handler modules such as `handlers/reviewer.js`, `handlers/scheduler-dashboard-handler.js`, `handlers/auditor-audit-decision-handler.js`, `handlers/workflow-transitions-handler.js`
- Expected Role: Canonical provider roles such as `document_reviewer`, `scheduler`, `auditor`, `head_auditor`, `admin`
- DB/Queue/External Dependency: `Application`, `RevisionDeadline`, `Notification`, audit logs, certificate issuance
- Findings: The newer provider handler set is mostly aligned with `authenticateProvider + requireCanonicalPermission(...)`, which makes it stronger than legacy provider routes. However, it still has to normalize old status dialects and tolerate missing comment infrastructure, so canonical permission enforcement is layered on top of a compatibility-heavy workflow state model.
- Risk Level: Medium
- Evidence from code/runtime structure: `apps/backend/routes/api/provider/handlers/reviewer.js`, `scheduler-dashboard-handler.js`, `scheduler-audit-schedules-post-handler.js`, `auditor-audit-decision-handler.js`, and `workflow-transitions-handler.js` all use `requireCanonicalPermission(...)` but query legacy and canonical statuses together.
- Suspected Failure Mode: Role gates succeed while queue composition, transition filters, or notifications still operate on stale status names, producing empty or inconsistent provider dashboards.
- What to inspect next: Open additional provider handler files for head-auditor approval and reassignment to confirm whether all write paths use the same permission style.

[Backend Audit Item]
- ID: PROVIDER-02
- Endpoint/Module: Compatibility provider directory routes under `/api/provider/*` from `routes/api/provider.js`
- Controller/Service/Middleware: `routes/api/provider.js` -> direct Prisma queries on `User` and `DTAMPROVIDER` -> raw role checks
- Expected Role: Provider admin for create/update/delete; selected provider provider for read-only directory views
- DB/Queue/External Dependency: `User`, legacy `DTAMPROVIDER`
- Findings: This compatibility surface merges canonical user records with legacy `DTAMPROVIDER` and uses raw role strings like `admin` and `super_admin` inside handlers instead of canonical permission middleware. It therefore bypasses the canonical RBAC layer used elsewhere in provider ops.
- Risk Level: High
- Evidence from code/runtime structure: `apps/backend/routes/api/provider.js` labels `DTAMPROVIDER` as compatibility-only, merges both sources, and guards mutations with direct string comparisons rather than `requireCanonicalPermission(...)` or canonical role normalization.
- Suspected Failure Mode: A provider user with a non-normalized role string may gain or lose access unexpectedly, and read/write behavior diverges between the canonical `/api/provider/*` module tree and the compatibility provider directory route.
- What to inspect next: Compare provider management pages in the web app with the exact provider directory endpoints they call.

[Backend Audit Item]
- ID: PROVIDER-03
- Endpoint/Module: Legacy audit routes `/api/audits/*` and `/api/audits/reassign`
- Controller/Service/Middleware: `routes/api/audits.js`, `routes/api/audits-reassign.js` -> provider auth -> Prisma updates and certificate generation branches
- Expected Role: `scheduler` for scheduling/reassign; `auditor` for result entry; `head_auditor` or `admin` for final approval branches
- DB/Queue/External Dependency: `Application`, certificate service, audit scheduling metadata
- Findings: These audit routes sit outside the canonical provider namespace and are still protected mostly by broad provider auth. Reassignment lacks a scheduler/admin gate, and one decision path compares `newStatus === 'APPROVED'` even though the same route only sets `AUDIT_PASSED` or `CAR_PENDING`, leaving the certificate-generation branch unreachable.
- Risk Level: High
- Evidence from code/runtime structure: `apps/backend/routes/api/audits.js` uses direct provider auth for many actions and has an unreachable `APPROVED` branch after assigning `AUDIT_PASSED` or `CAR_PENDING`; `apps/backend/routes/api/audits-reassign.js` does not add canonical scheduler/admin permission checks.
- Suspected Failure Mode: Provider provider outside the intended lane can reschedule or reassign audits, and legacy audit completion can fail to trigger downstream certificate work because the branch condition is never met.
- What to inspect next: Compare whether the frontend still calls `/api/audits/*` or has fully moved to `/api/provider/*` handlers.

[Backend Audit Item]
- ID: PROVIDER-04
- Endpoint/Module: Provider applications detail and workflow timeline under `/api/provider/applications/*`
- Controller/Service/Middleware: `routes/api/provider/applications.js` -> shared provider handlers -> Prisma access with comment fallback
- Expected Role: Provider roles with application-view or workflow-transition permissions
- DB/Queue/External Dependency: `Application`, `ApplicationComment`, queue/timeline derivation
- Findings: Provider application detail remains partly compatibility-aware because it tolerates missing `application_comments`. This keeps the route resilient across environments but confirms that the provider-facing runtime is operating against potentially stale schema state.
- Risk Level: Medium
- Evidence from code/runtime structure: `apps/backend/routes/api/provider/applications.js` contains the same style of `application_comments` fallback behavior seen in applicant workflow routes.
- Suspected Failure Mode: Timeline panels or revision threads appear incomplete for provider provider, and the same application detail can render differently by environment.
- What to inspect next: Open the exact detail handler and any timeline serializer used by provider dashboards.

[Backend Audit Item]
- ID: PROVIDER-05
- Endpoint/Module: Provider analytics and identity review surfaces
- Controller/Service/Middleware: `routes/api/provider/analytics.js`, `routes/api/identity.js` -> provider auth -> service reads/writes
- Expected Role: Provider roles with analytics view or identity-review authority
- DB/Queue/External Dependency: Aggregated reporting queries, `User`, identity verification artifacts
- Findings: Backend analytics is mounted under `/api/provider/analytics/*`, but the frontend provider analytics page calls `/api/reports/analytics`. Identity review routes (`/api/identity/pending`, `/user/:id`, `/review/:id`) are provider-authenticated only and do not apply canonical role or permission checks, even though the action is sensitive.
- Risk Level: High
- Evidence from code/runtime structure: `apps/backend/routes/api/provider/analytics.js` is the canonical analytics namespace; `apps/web-app/src/app/provider/analytics/page.tsx` calls `/api/reports/analytics`; `apps/backend/routes/api/identity.js` uses `authenticateProvider` alone for provider review routes.
- Suspected Failure Mode: Provider analytics pages hit dead or unrelated paths, and any provider-authenticated user can review identity submissions without a role boundary consistent with canonical RBAC.
- What to inspect next: Open `apps/backend/services/identity-service.js` to see whether it applies internal reviewer-role checks not visible in the route file.
