# Phase 3 Backend Audit - Applicant Workflow

[Backend Audit Item]
- ID: APP-01
- Endpoint/Module: Mounted applicant workflow at `/api/applications/*`
- Controller/Service/Middleware: `routes/api/applications.js` -> `controllers/wizard-controller.js` and application handlers -> `services/application-service.js` -> `services/workflow-transition-service.js`
- Expected Role: `health` for applicant-owned flows; selected provider roles for review/reject paths
- DB/Queue/External Dependency: `Application`, `ApplicationDraft`, `ApplicationComment`, `RevisionDeadline`, PDF generation
- Findings: The mounted route family is `/api/applications/*`, while `routes/api/wizard.js` and `routes/api/application-flow.js` still exist as parallel compatibility surfaces that are not mounted in `routes/api/index.js`. Runtime therefore has dead or compatibility paths that look canonical in the tree but are not actually active.
- Risk Level: Medium
- Evidence from code/runtime structure: `apps/backend/routes/api/index.js` mounts `/applications` but does not mount `/wizard` or `/application-flow`; both files still export applicant workflow endpoints and controllers.
- Suspected Failure Mode: Frontend or BFF code copied from old assumptions can call non-mounted routes, and maintainers can patch dead files thinking they affect runtime behavior.
- What to inspect next: Open `apps/web-app/src/app/api/[...path]` and service wrappers to confirm whether any client still references `/wizard` or `/application-flow`.

[Backend Audit Item]
- ID: APP-02
- Endpoint/Module: Draft/comment workflow under `/api/applications/draft*` and `/:id/history`
- Controller/Service/Middleware: `routes/api/applications.js` -> application handlers -> Prisma model access
- Expected Role: `health` for own drafts; provider roles for review comment trails
- DB/Queue/External Dependency: `ApplicationDraft`, `ApplicationComment`, `Application`
- Findings: Runtime contains compatibility logic for missing `application_comments` infrastructure. The route handlers catch `P2021` and degrade comment-related behavior when the table is not present, which indicates schema drift between code expectations and deployed database state.
- Risk Level: High
- Evidence from code/runtime structure: `apps/backend/routes/api/applications.js` contains explicit `P2021` handling and guarded comment access; `apps/backend/prisma/schema.prisma` defines `ApplicationComment`, but the runtime path still expects environments where the table may not exist.
- Suspected Failure Mode: Review history appears partially empty, revision comments disappear silently, or application detail/history responses differ across environments depending on schema state.
- What to inspect next: Open migration history under `apps/backend/prisma/migrations` and compare against current production deployment state if available.

[Backend Audit Item]
- ID: APP-03
- Endpoint/Module: Applicant submission and preview progression across `/api/applications/submit`, `/api/applications/prepare`, and `/api/preview/*`
- Controller/Service/Middleware: `routes/api/applications.js` and `routes/api/preview.js` -> `wizard-controller.js` -> `workflow-transition-service.js`
- Expected Role: `health`
- DB/Queue/External Dependency: `Application`, workflow state machine, document summary generation
- Findings: Applicant submission writes legacy status values such as `PAYMENT_1_PENDING`, but preview logic expects earlier workflow states like `REGISTERED`, `SUBMITTED`, `PENDING_DOC_FEE`, and `DOC_FEE_PAID`. The route family is active, yet state assumptions are split between route handlers and workflow helpers.
- Risk Level: High
- Evidence from code/runtime structure: `apps/backend/controllers/wizard-controller.js` sets `PAYMENT_1_PENDING`; `apps/backend/routes/api/preview.js` validates applications against other state buckets; `apps/backend/services/workflow-transition-service.js` normalizes both canonical and legacy states.
- Suspected Failure Mode: A newly submitted application can be rejected by preview/payment/readiness endpoints because downstream modules interpret the same lifecycle differently.
- What to inspect next: Open the remaining preview controller/service functions and compare them against Phase 2 frontend pages that call preview endpoints.

[Backend Audit Item]
- ID: APP-04
- Endpoint/Module: Provider-side reject/revision path `/api/applications/:id/reject`
- Controller/Service/Middleware: `routes/api/applications.js` -> provider-auth middleware -> role middleware / workflow update logic
- Expected Role: `document_reviewer` or other explicitly authorized review role under canonical RBAC
- DB/Queue/External Dependency: `Application`, `RevisionDeadline`, notifications
- Findings: The route is active and provider-authenticated, but the permitted role set is broader than a single canonical reviewer path. Runtime allows multiple provider roles to trigger revision/reject behavior, and the permission model is not expressed through a canonical permission constant the way newer provider handlers do it.
- Risk Level: Medium
- Evidence from code/runtime structure: `apps/backend/routes/api/applications.js` applies provider auth and role checks directly for reject/revision behavior; newer provider handlers use `requireCanonicalPermission(...)`, but this route remains a more direct compatibility-style implementation.
- Suspected Failure Mode: Provider Users outside the intended document review lane can push an application back to revision, leading to inconsistent workflow ownership and audit expectations.
- What to inspect next: Open exact middleware calls around `PATCH /:id/reject` and compare them with `apps/backend/routes/api/provider/handlers/workflow-transitions-handler.js`.

[Backend Audit Item]
- ID: APP-05
- Endpoint/Module: Workflow transition service used by applicant and provider flows
- Controller/Service/Middleware: `services/workflow-transition-service.js` consumed by applications routes and provider workflow handlers
- Expected Role: Depends on caller; transition rules should stay canonical regardless of route
- DB/Queue/External Dependency: `Application`, notification/audit side effects
- Findings: The service normalizes both canonical workflow states and legacy status names, which keeps compatibility alive but also means the runtime still treats old and new state dialects as first-class inputs. This is a contract-drift hotspot between applicant workflow, payment flow, cron flow, and provider workflow transitions.
- Risk Level: High
- Evidence from code/runtime structure: `apps/backend/services/workflow-transition-service.js` contains normalization for `PAYMENT_1_PENDING`, `UNDER_REVIEW`, `WAITING_PAYMENT_2`, and canonical-style states such as `PENDING_DOC_FEE` and `AUDIT_FEE_PAID`.
- Suspected Failure Mode: Different modules transition the same application through semantically equivalent but syntactically different states, causing broken filters, dead queue items, and incorrect next-step decisions.
- What to inspect next: Open any state-machine constants under `apps/backend/constants` that are used by cron, payments, and provider dashboards.
