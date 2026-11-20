# Phase 2 Frontend Audit - Provider Portal

Audit basis:
- runtime and code in `apps/web-app`
- provider route protection in `apps/web-app/src/middleware.ts`
- provider navigation shell in `apps/web-app/src/app/provider/components/provider-layout.tsx`
- backend contract checks in `apps/backend/routes/api/provider/*`, `apps/backend/routes/api/provider.js`, `apps/backend/routes/api/reports.js`, `apps/backend/routes/api/system-config.routes.js`, and `apps/backend/routes/api/identity.js`

[Frontend Audit Item]
- ID: FA-PRO-001
- Portal: Provider Portal
- Route/Page: `/provider/*` shared shell
- Main Components: `apps/web-app/src/app/provider/layout.tsx`, `apps/web-app/src/app/provider/components/provider-layout.tsx`, `apps/web-app/src/lib/constants.ts`, `apps/web-app/src/middleware.ts`
- Expected User/Role: authenticated provider provider with role-based access
- API/Dependency Used: provider nav constants, `DashboardLayout`, middleware `providerRouteRoleRules`
- Findings:
  - shared provider layout only sets a DOM attribute and does not own auth or role gating
  - `ProviderLayout` computes `PROVIDER_ROUTE_ROLE_RULES` but never uses them; the comment explicitly says all nav items are shown and access is handled later
  - provider navigation is incomplete for the requested portal scope because it omits `/provider/calendar`, `/provider/certificates`, `/provider/accounting`, `/provider/planting`, `/provider/management`, and `/provider/verification`
  - middleware guards only some provider namespaces and excludes `head_auditor` from `/provider/audits`, even though backend exposes `/api/provider/head-auditor`
- Risk Level: High
- Evidence from code/runtime structure: `apps/web-app/src/app/provider/layout.tsx`, `apps/web-app/src/app/provider/components/provider-layout.tsx`, `apps/web-app/src/lib/constants.ts`, `apps/web-app/src/middleware.ts`, `apps/backend/routes/api/provider/index.js`
- Suspected Failure Mode: users see menu items or route families that do not match their actual permissions, and some valid Provider roles are blocked from frontend routes that backend namespaces already support
- What to inspect next: any route-level guards inside provider child pages that compensate for the shell-level gaps

[Frontend Audit Item]
- ID: FA-PRO-002
- Portal: Provider Portal
- Route/Page: `/provider/dashboard`
- Main Components: `apps/web-app/src/app/provider/dashboard/page.tsx`
- Expected User/Role: provider provider role-specific work queue
- API/Dependency Used: localStorage session keys, `providerApiPaths.reviewerDashboard`, `schedulerDashboard`, `auditorDashboard`, `applicationsList`
- Findings:
  - route depends on `provider_token` and `provider_user` in localStorage instead of a canonical SSR/session read
  - role normalization here differs from middleware; `head_auditor`, `account`, and `admin` users fall back to the generic applications list rather than a dedicated dashboard
  - page copy says the user is an authorized reviewer even when the normalized role is scheduler, auditor, account, or admin
  - loading and error states exist, but they are driven entirely from client-side storage and fetch fallback order
- Risk Level: High
- Evidence from code/runtime structure: `apps/web-app/src/app/provider/dashboard/page.tsx`, `apps/web-app/src/middleware.ts`, `apps/web-app/src/lib/services/auth-service.ts`
- Suspected Failure Mode: some provider roles enter the dashboard successfully but see the wrong queue type or reviewer-specific messaging because role routing is reconstructed locally
- What to inspect next: any provider-role specific dashboard pages outside `/provider/dashboard`

[Frontend Audit Item]
- ID: FA-PRO-003
- Portal: Provider Portal
- Route/Page: `/provider/applications`
- Main Components: `apps/web-app/src/app/provider/applications/page.tsx`
- Expected User/Role: provider provider browsing application inventory
- API/Dependency Used: localStorage auth checks, `fetch(providerApiPaths.applicationsList)`
- Findings:
  - route uses localStorage auth and raw fetch instead of shared provider API helpers
  - fetch failure only logs to console and the page then renders as an empty list without explicit error messaging
  - status chip filters expose only a narrow subset of runtime statuses even though backend returns a wider provider status set
  - route protection is broad provider-auth only, so UI role visibility is not narrowed here
- Risk Level: Medium
- Evidence from code/runtime structure: `apps/web-app/src/app/provider/applications/page.tsx`, `apps/backend/routes/api/provider/applications.js`
- Suspected Failure Mode: provider provider interpret a failed data load as “no applications found” and lose visibility into statuses not represented by the frontend chips
- What to inspect next: whether the route should be role-specific or intentionally common across provider roles

[Frontend Audit Item]
- ID: FA-PRO-004
- Portal: Provider Portal
- Route/Page: `/provider/applications/[id]`
- Main Components: `apps/web-app/src/app/provider/applications/[id]/page.tsx`, `review-decision-modal.tsx`
- Expected User/Role: document reviewer or other authorized provider provider
- API/Dependency Used: localStorage auth checks, `providerApiPaths.applicationDetail`, `applicationWorkflowTransitions`
- Findings:
  - route again depends on localStorage auth and raw fetch instead of the shared provider/session layer
  - review decision availability is determined by application status only; the page does not do its own role-aware UI gating
  - review submit failure is surfaced with `alert(...)`, which is inconsistent with the rest of the provider UI
  - documents tab only checks resolved URLs from form data and treats their presence as document availability without deeper contract validation
- Risk Level: High
- Evidence from code/runtime structure: `apps/web-app/src/app/provider/applications/[id]/page.tsx`, `apps/web-app/src/app/provider/applications/[id]/review-decision-modal.tsx`, `apps/backend/routes/api/provider/applications.js`
- Suspected Failure Mode: unauthorized or non-reviewer provider can reach the screen and see workflow actions, while failed review submissions collapse into blocking browser alerts
- What to inspect next: backend permission checks inside `providerRouteHandlers.applicationsWorkflowTransitions`

[Frontend Audit Item]
- ID: FA-PRO-005
- Portal: Provider Portal
- Route/Page: `/provider/applications/[id]/print`
- Main Components: `apps/web-app/src/app/provider/applications/[id]/print/page.tsx`
- Expected User/Role: provider provider printing application packet
- API/Dependency Used: localStorage auth, raw fetch to `/api/provider/applications/:id`, `window.print()`
- Findings:
  - print page is fully client-side and requires browser state before any content appears
  - fetch failure only leaves a plain not-found text block with no retry or structured error state
  - route uses `window.print()` directly and does not confirm print stylesheet or browser readiness beyond inline page styles
  - print view reconstructs large amounts of application schema locally, which increases stale-shape risk
- Risk Level: Medium
- Evidence from code/runtime structure: `apps/web-app/src/app/provider/applications/[id]/print/page.tsx`
- Suspected Failure Mode: provider can open the print route but fail to load or print a record cleanly because the page depends on a fragile client fetch plus a large local schema projection
- What to inspect next: whether print output still matches current application schema for newer fields

[Frontend Audit Item]
- ID: FA-PRO-006
- Portal: Provider Portal
- Route/Page: `/provider/audits`
- Main Components: `apps/web-app/src/app/provider/audits/page.tsx`
- Expected User/Role: auditor or auditor-admin queue
- API/Dependency Used: `providerApiPaths.auditorDashboard`, `auditorStartInspection`, local `PROVIDERRequest`
- Findings:
  - route is an auditor dashboard, not a generic audits index, so the route name is broader than the actual runtime role intent
  - middleware allows `/provider/audits` for `admin` and `auditor` only, excluding `head_auditor` even though backend exposes a dedicated head-auditor namespace
  - page uses its own `PROVIDERRequest` helper and localStorage token model instead of the shared API client
  - queue actions can mutate backend state from the list screen via “Start inspection”
- Risk Level: High
- Evidence from code/runtime structure: `apps/web-app/src/app/provider/audits/page.tsx`, `apps/web-app/src/middleware.ts`, `apps/backend/routes/api/provider/auditor.js`, `apps/backend/routes/api/provider/head-auditor.js`
- Suspected Failure Mode: a legitimate head-auditor user is blocked at the frontend while admins land in an auditor-only queue model that does not represent their actual workflow
- What to inspect next: whether a head-auditor frontend route exists outside the requested scope

[Frontend Audit Item]
- ID: FA-PRO-007
- Portal: Provider Portal
- Route/Page: `/provider/audits/[id]`
- Main Components: `apps/web-app/src/app/provider/audits/[id]/page.tsx`, `audit-decision-modal.tsx`, `provider-audit-job-sheet-config.ts`
- Expected User/Role: auditor handling an active audit job
- API/Dependency Used: `providerApiPaths.applicationDetail`, `applicationAuditTimelines`, `auditorDashboard`, `auditorStartInspection`, `auditorDecision`, local `PROVIDERRequest`
- Findings:
  - initial page guard accepts `provider_token` or `accessToken`, but the shared `PROVIDERRequest` helper only forwards `provider_token`, so later API calls can lose auth when the page itself already passed
  - audit evidence upload UI compresses selected photos, but submit payload sends only file metadata JSON and never uploads the actual image bytes
  - route contains invalid nested `<p>` markup in the action footer, which is a hydration/render integrity risk
  - action visibility depends on queue flags, but the page still exposes print and link actions regardless of broader role or state context
- Risk Level: Critical
- Evidence from code/runtime structure: `apps/web-app/src/app/provider/audits/[id]/page.tsx`, `apps/web-app/src/app/provider/audits/[id]/audit-decision-modal.tsx`, `apps/web-app/src/app/provider/audits/[id]/provider-audit-job-sheet-config.ts`, `apps/backend/routes/api/provider/auditor.js`
- Suspected Failure Mode: auditors believe they submitted evidence-backed decisions, but backend receives only metadata; additionally, some sessions pass route entry and then fail later API calls because token forwarding is inconsistent
- What to inspect next: whether backend audit decision handler expects multipart evidence or a separate upload contract

[Frontend Audit Item]
- ID: FA-PRO-008
- Portal: Provider Portal
- Route/Page: `/provider/calendar`
- Main Components: `apps/web-app/src/app/provider/calendar/page.tsx`
- Expected User/Role: scheduler or admin managing audit schedules
- API/Dependency Used: `api.get(providerApiPaths.schedulerDashboard)`, `api.get(providerApiPaths.schedulerAuditors)`, `api.post(providerApiPaths.schedulerAuditSchedules)`
- Findings:
  - route relies on middleware for access control and does not do its own redirect or provider identity validation
  - load errors surface only as notifications and empty dashboard state, not as a persistent page-level error panel
  - schedule modal performs only local validation before submit and does not surface field-specific backend validation results
  - provider navigation does not include this route even though it is part of the requested portal scope
- Risk Level: Medium
- Evidence from code/runtime structure: `apps/web-app/src/app/provider/calendar/page.tsx`, `apps/web-app/src/middleware.ts`, `apps/backend/routes/api/provider/scheduler.js`
- Suspected Failure Mode: scheduler users can reach the route from a direct URL but are left with transient toast failures and no clear recovery when scheduling APIs reject or partially fail
- What to inspect next: backend error payload shape for schedule collisions and auditor availability conflicts

[Frontend Audit Item]
- ID: FA-PRO-009
- Portal: Provider Portal
- Route/Page: `/provider/certificates`
- Main Components: `apps/web-app/src/app/provider/certificates/page.tsx`
- Expected User/Role: provider provider monitoring certificate lifecycle, admin for bulk notify
- API/Dependency Used: localStorage role parsing, `providerApiPaths.certificatesDashboard`, `certificatesBulkNotify`
- Findings:
  - page visibility is broad, but the notify button is gated only by role parsed from localStorage session payload
  - route has no explicit redirect if provider auth state is missing or malformed and depends on middleware plus raw fetch behavior
  - page exposes summary and expiring-list views but no deeper certificate action routing
  - last-sync indicator shows a date-only stamp derived locally, not the backend response time
- Risk Level: Medium
- Evidence from code/runtime structure: `apps/web-app/src/app/provider/certificates/page.tsx`, `apps/backend/routes/api/provider/certificates.js`
- Suspected Failure Mode: local role drift hides or shows the notify action incorrectly, and session corruption degrades into fetch failure rather than a clear auth boundary
- What to inspect next: backend authorization inside `certificatesBulkNotify`

[Frontend Audit Item]
- ID: FA-PRO-010
- Portal: Provider Portal
- Route/Page: `/provider/analytics`
- Main Components: `apps/web-app/src/app/provider/analytics/page.tsx`
- Expected User/Role: provider provider viewing analytics dashboards
- API/Dependency Used: raw fetch to `/api/reports/analytics?period=...`
- Findings:
  - frontend analytics page does not use the provider namespace route family and instead calls `/api/reports/analytics`
  - backend provider namespace exposes `/api/provider/analytics/performance`, so the frontend route is contract-coupled to a different service family than the portal naming suggests
  - route has retry/error UI, but it still relies on localStorage token and client-only fetch
  - middleware does not place extra role restrictions on this route even though analytics surfaces often have narrower visibility expectations
- Risk Level: High
- Evidence from code/runtime structure: `apps/web-app/src/app/provider/analytics/page.tsx`, `apps/backend/routes/api/reports.js`, `apps/backend/routes/api/provider/analytics.js`
- Suspected Failure Mode: provider analytics works against one backend family while the canonical provider namespace evolves separately, causing drift between route ownership and actual data source
- What to inspect next: whether `/api/provider/analytics/performance` is intended to replace this page contract

[Frontend Audit Item]
- ID: FA-PRO-011
- Portal: Provider Portal
- Route/Page: `/provider/accounting`
- Main Components: `apps/web-app/src/app/provider/accounting/page.tsx`
- Expected User/Role: account or admin provider managing invoices and receipts
- API/Dependency Used: localStorage auth, raw fetch to `/api/invoices/summary`, `/api/invoices`, `/api/invoices/receipts/exceptions`
- Findings:
  - route bypasses the provider/accounting namespace and talks directly to invoice endpoints
  - fetch failure only logs to console and resets the screen to empty/default financial state without explicit error UI
  - top-level `Export CSV` button has no click handler
  - invoice dialog renders “issue receipt” and “print document” buttons with no handlers, making both actions dead
- Risk Level: High
- Evidence from code/runtime structure: `apps/web-app/src/app/provider/accounting/page.tsx`, `apps/backend/routes/api/invoices.js`, `apps/backend/routes/api/accounting.js`
- Suspected Failure Mode: accounting provider see a polished dashboard but cannot perform key actions from visible controls, and failed data loads can masquerade as zero-balance states
- What to inspect next: whether `/provider/receipts` is the actual active issuance surface and if this page should deep-link there

[Frontend Audit Item]
- ID: FA-PRO-012
- Portal: Provider Portal
- Route/Page: `/provider/planting`
- Main Components: `apps/web-app/src/app/provider/planting/page.tsx`
- Expected User/Role: provider provider overseeing planting-cycle integrity
- API/Dependency Used: `providerApiPaths.plantingCycles('?page=1&limit=100')`
- Findings:
  - route uses the correct provider planting namespace and has clearer loading/empty/error states than many older provider pages
  - route has no extra role guard beyond generic provider access even though it is an oversight surface
  - provider navigation does not expose this page even though it is a maintained scope route
  - search/filter state is local only and not reflected in the URL
- Risk Level: Medium
- Evidence from code/runtime structure: `apps/web-app/src/app/provider/planting/page.tsx`, `apps/backend/routes/api/provider/planting.js`
- Suspected Failure Mode: provider can only reach the planting oversight page from direct links or deep links, and route visibility becomes inconsistent across roles and navigation surfaces
- What to inspect next: whether this page should be linked from dashboard or application detail flows

[Frontend Audit Item]
- ID: FA-PRO-013
- Portal: Provider Portal
- Route/Page: `/provider/planting/[id]`
- Main Components: `apps/web-app/src/app/provider/planting/[id]/page.tsx`
- Expected User/Role: provider provider reviewing a specific planting cycle
- API/Dependency Used: `api.get('/api/planting-cycles/:id')`, placeholder tabs, route link to `/provider/planting/${id}/trace`
- Findings:
  - detail page calls `/api/planting-cycles/:id`, but the inspected backend route is health-authenticated; the provider contract lives under `/api/provider/planting-cycles/:id`
  - action button links to `/provider/planting/${cycleId}/trace`, but no matching route exists in the app tree
  - activity, plant-unit, and oversight-history tabs are mostly placeholders and do not load real oversight data
  - route mixes provider branding with a non-provider backend contract
- Risk Level: Critical
- Evidence from code/runtime structure: `apps/web-app/src/app/provider/planting/[id]/page.tsx`, `apps/backend/routes/api/planting-cycles.js`, `apps/backend/routes/api/provider/planting.js`
- Suspected Failure Mode: provider users can open the detail route but hit authorization failures or incomplete placeholder views because the page is wired to the health planting API and a non-existent trace subroute
- What to inspect next: whether a provider-specific planting detail component exists elsewhere and should replace this page

[Frontend Audit Item]
- ID: FA-PRO-014
- Portal: Provider Portal
- Route/Page: `/provider/management`
- Main Components: `apps/web-app/src/app/provider/management/page.tsx`
- Expected User/Role: admin managing provider provider directory
- API/Dependency Used: localStorage auth, raw fetch to `/api/provider`, `/api/provider/:id`
- Findings:
  - page uses browser `alert()` and `confirm()` for all CRUD outcomes instead of in-app stateful feedback
  - role values are inconsistent between form defaults (`reviewer`, `admin`) and table/filter labels (`REVIEWER_AUDITOR`, `ADMIN`, `ACCOUNTANT`), which is a stale-schema and status-mapping risk
  - backend list endpoint `/api/provider` is readable by any authenticated provider, while the page itself is restricted mainly by middleware
  - validation only checks a few required fields and does not enforce richer provider identity rules before submit
- Risk Level: High
- Evidence from code/runtime structure: `apps/web-app/src/app/provider/management/page.tsx`, `apps/backend/routes/api/provider.js`, `apps/web-app/src/middleware.ts`
- Suspected Failure Mode: admin actions operate on mixed role dialects and provider listings are more broadly accessible at the API layer than the page UI implies
- What to inspect next: exact role values stored in runtime user records and whether the frontend form should use canonical role constants

[Frontend Audit Item]
- ID: FA-PRO-015
- Portal: Provider Portal
- Route/Page: `/provider/settings`
- Main Components: `apps/web-app/src/app/provider/settings/page.tsx`
- Expected User/Role: provider provider entering settings root
- API/Dependency Used: server redirect to `/provider/settings/system`
- Findings:
  - route is only a redirect alias
  - settings root has no independent UI or explanation of admin-only scope
  - route ownership lives entirely in the destination page and middleware
- Risk Level: Low
- Evidence from code/runtime structure: `apps/web-app/src/app/provider/settings/page.tsx`
- Suspected Failure Mode: users hit the settings root from a deep link and are bounced into the system settings page without context or role explanation
- What to inspect next: whether the route should have a landing page or remain an alias

[Frontend Audit Item]
- ID: FA-PRO-016
- Portal: Provider Portal
- Route/Page: `/provider/settings/system`
- Main Components: `apps/web-app/src/app/provider/settings/system/page.tsx`
- Expected User/Role: admin toggling system configuration
- API/Dependency Used: `apiClient.get('/system-config')`, `apiClient.put('/system-config/:key')`, optimistic local state
- Findings:
  - route uses optimistic toggling and then reverts on failure, but there is no per-item pending state so repeated toggles can race
  - failed initial fetch only logs to console; the page can then render as “No configurations found” and blur runtime failure with empty data
  - backend enforces admin-only access, but provider navigation shows settings to all roles
  - page mutates global config context immediately after local optimistic updates, increasing state coupling
- Risk Level: High
- Evidence from code/runtime structure: `apps/web-app/src/app/provider/settings/system/page.tsx`, `apps/backend/routes/api/system-config.routes.js`, `apps/web-app/src/app/provider/components/provider-layout.tsx`
- Suspected Failure Mode: non-admin users see a visible settings entry that resolves into redirects or failures, while admins can trigger rapid toggle races without item-level locking
- What to inspect next: `useConfig()` consumers that react to rapid config updates

[Frontend Audit Item]
- ID: FA-PRO-017
- Portal: Provider Portal
- Route/Page: `/provider/verification`
- Main Components: `apps/web-app/src/app/provider/verification/page.tsx`
- Expected User/Role: identity review provider
- API/Dependency Used: `useAuth()`, raw fetch to `/api/identity/pending`
- Findings:
  - imported `useAuth()` result is effectively unused for route gating
  - route has no persistent error state; failed fetch simply leaves an empty list after loading
  - neither middleware nor backend route applies a narrower role guard than generic provider authentication
  - provider navigation does not expose this route even though it is active
- Risk Level: High
- Evidence from code/runtime structure: `apps/web-app/src/app/provider/verification/page.tsx`, `apps/backend/routes/api/identity.js`, `apps/web-app/src/middleware.ts`
- Suspected Failure Mode: any provider provider with a token can access pending identity-verification requests, and data-load failures are misread as “no pending verifications”
- What to inspect next: intended role ownership for manual identity review

[Frontend Audit Item]
- ID: FA-PRO-018
- Portal: Provider Portal
- Route/Page: `/provider/verification/[id]`
- Main Components: `apps/web-app/src/app/provider/verification/[id]/page.tsx`
- Expected User/Role: identity review provider approving or rejecting a verification request
- API/Dependency Used: raw fetch to `/api/identity/user/:id` and `/api/identity/review/:id`, browser `confirm()` and `alert()`
- Findings:
  - page uses direct approve/reject actions with browser alerts and confirms instead of durable in-app state
  - route has no explicit role guard and backend endpoint is only protected by provider authentication, not reviewer/admin role constraints
  - reject flow only enforces a non-empty note client-side and has no richer validation or recovery
  - evidence images are rendered directly from returned paths without stronger URL validation or file-type handling
- Risk Level: Critical
- Evidence from code/runtime structure: `apps/web-app/src/app/provider/verification/[id]/page.tsx`, `apps/backend/routes/api/identity.js`
- Suspected Failure Mode: provider provider outside the intended identity-review role can approve or reject applicant verification, and operator feedback is limited to blocking browser dialogs
- What to inspect next: whether audit logging and role checks exist deeper inside `identityService.reviewUser`

Provider Portal summary:
- routes checked:
  - `/provider/*` shared shell
  - `/provider/dashboard`
  - `/provider/applications`
  - `/provider/applications/[id]`
  - `/provider/applications/[id]/print`
  - `/provider/audits`
  - `/provider/audits/[id]`
  - `/provider/calendar`
  - `/provider/certificates`
  - `/provider/analytics`
  - `/provider/accounting`
  - `/provider/planting`
  - `/provider/planting/[id]`
  - `/provider/management`
  - `/provider/settings`
  - `/provider/settings/system`
  - `/provider/verification`
  - `/provider/verification/[id]`
- routes not yet checked:
  - none within the requested Provider Portal scope
- portal-level risk concentration:
  - provider shell/navigation and middleware role rules are not aligned, especially for hidden routes and `head_auditor`
  - several routes still rely on localStorage and raw fetch instead of a canonical provider session/API layer
  - critical broken flows exist in audit evidence submission, provider planting detail contract selection, and identity verification role exposure
  - multiple visible controls are dead or incomplete, especially in accounting and some deep-link routes
  - for deeper confirmation on some supporting internals, `ต้องเปิดดูไฟล์/route/component เพิ่ม` around provider analytics replacement intent and backend permission handlers for workflow transitions and identity review
