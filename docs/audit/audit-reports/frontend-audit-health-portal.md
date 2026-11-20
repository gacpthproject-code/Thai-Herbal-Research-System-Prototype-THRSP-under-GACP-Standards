# Phase 2 Frontend Audit - Health Portal

Audit basis:
- runtime and code in `apps/web-app`
- backend contract checks from `apps/backend/routes/api/*.js`
- auth and route gating from `apps/web-app/src/middleware.ts`
- shared client auth/session behavior from `apps/web-app/src/lib/services/auth-service.ts`, `apps/web-app/src/lib/services/auth-provider.tsx`, and `apps/web-app/src/lib/api/api-client.ts`

[Frontend Audit Item]
- ID: FA-HEA-001
- Portal: Health Portal
- Route/Page: `/health/*` shared shell
- Main Components: `apps/web-app/src/app/health/layout.tsx`, `apps/web-app/src/components/layout/dashboard-layout.tsx`, `apps/web-app/src/app/health/loading.tsx`, `apps/web-app/src/lib/constants.ts`
- Expected User/Role: authenticated health user
- API/Dependency Used: `usePathname`, `AuthService.getUser()`, health navigation constants, middleware cookie guard on `/health/:path*`
- Findings:
  - route protection is split between middleware cookie checks and client-side `AuthService.getUser()` or `localStorage` checks inside child pages, so the portal does not have one canonical auth boundary
  - health wizard routes bypass the normal dashboard shell by pathname check in the layout, which changes navigation and page chrome mid-flow
  - shared navigation omits requested surfaces such as `/health/establishments`, `/health/payments`, `/health/site-analysis`, and `/health/training`, while the shell still shows dead controls like notifications and search
  - user menu links to `/health/settings`, which is outside the requested audit scope and indicates legacy shell coupling
- Risk Level: High
- Evidence from code/runtime structure: `apps/web-app/src/app/health/layout.tsx`, `apps/web-app/src/components/layout/dashboard-layout.tsx`, `apps/web-app/src/lib/constants.ts`, `apps/web-app/src/middleware.ts`
- Suspected Failure Mode: inconsistent redirects and visibility rules across health pages, dead shell controls, and users losing navigation continuity when entering or leaving the wizard flow
- What to inspect next: any remaining shared shell components that mount notifications or search behavior

[Frontend Audit Item]
- ID: FA-HEA-002
- Portal: Health Portal
- Route/Page: `/health/dashboard`
- Main Components: `apps/web-app/src/app/health/dashboard/page.tsx`
- Expected User/Role: authenticated health user
- API/Dependency Used: `AuthService.getUser()`, `api.get('/api/applications/my')`
- Findings:
  - page uses client-side auth read instead of relying on the existing middleware/session boundary
  - dashboard logs API errors to console and falls back to an empty data view without explicit error UX
  - status summary collapses only a small subset of backend statuses into local cards, so unmapped workflow states can disappear from the overview
  - quick actions assume `/health/applications/new`, `/health/planting`, and `/health/tracking` are all valid continuation points even when prerequisites are missing
- Risk Level: Medium
- Evidence from code/runtime structure: `apps/web-app/src/app/health/dashboard/page.tsx`
- Suspected Failure Mode: stale or failed application fetch shows a deceptively empty dashboard, and users can be routed into downstream flows without visible readiness checks
- What to inspect next: backend status vocabulary vs local dashboard mapping in `apps/backend/routes/api/applications.js`

[Frontend Audit Item]
- ID: FA-HEA-003
- Portal: Health Portal
- Route/Page: `/health/applications`
- Main Components: `apps/web-app/src/app/health/applications/page.tsx`
- Expected User/Role: authenticated health applicant
- API/Dependency Used: `apiClient.get('/api/applications/my')`, `AuthService.getUser()`
- Findings:
  - page has explicit loading and empty states, but action routing is inconsistent with the rest of the application flow
  - `WAITING_PAYMENT` action loops back to the filtered list route instead of taking the user to payment or invoice handling
  - role visibility is implicit because the page assumes health ownership on every record and does not surface cross-account protection state
  - status badge and action mapping are frontend-local and can drift from backend workflow transitions
- Risk Level: High
- Evidence from code/runtime structure: `apps/web-app/src/app/health/applications/page.tsx`
- Suspected Failure Mode: users stuck in a list-filter loop for payment-required applications, with no clear recovery path from the primary CTA
- What to inspect next: status-to-action mapping against `Application.status` values returned by the backend

[Frontend Audit Item]
- ID: FA-HEA-004
- Portal: Health Portal
- Route/Page: `/health/applications/new`
- Main Components: `apps/web-app/src/app/health/applications/new/page.tsx`, `apps/web-app/src/app/health/applications/new/layout.tsx`
- Expected User/Role: authenticated health applicant starting a new application
- API/Dependency Used: client redirect to step route, `apiClient.get('/applications/config?plantId=...')`, Zustand wizard store, `sessionStorage`
- Findings:
  - entry page is a client-side redirect spinner rather than a direct server route to the first step
  - wizard layout fetches config from `/applications/config` while step pages use `/api/applications/config`, creating path dialect inconsistency inside the same flow
  - failed config fetch silently falls back to a default six-step flow, which hides contract drift instead of surfacing it
  - cancel behavior depends on `sessionStorage` edit flags and defaults to `/health/dashboard`, so navigation outcome is stateful and non-transparent
- Risk Level: High
- Evidence from code/runtime structure: `apps/web-app/src/app/health/applications/new/page.tsx`, `apps/web-app/src/app/health/applications/new/layout.tsx`, `apps/web-app/src/lib/api/api-client.ts`
- Suspected Failure Mode: wizard shape diverges from backend-configured steps without visible warning, and users can land in the wrong exit path when edit-mode session flags are stale
- What to inspect next: backend handler for `/api/applications/config` and wizard state hydration paths

[Frontend Audit Item]
- ID: FA-HEA-005
- Portal: Health Portal
- Route/Page: `/health/applications/new/step/[id]`
- Main Components: `apps/web-app/src/app/health/applications/new/step/[id]/page.tsx`, `use-auto-save.ts`, wizard step components under `steps/*`
- Expected User/Role: authenticated health applicant progressing through the wizard
- API/Dependency Used: `/api/applications/config`, `/api/applications/draft`, `/api/applications/draft-documents`, Zustand store, geolocation, map lazy loading
- Findings:
  - step orchestration merges backend-configured steps with locally injected extended steps, so route truth is partly server-driven and partly hardcoded
  - auto-save hashing does not clearly cover every stored field, which creates a risk that state changes do not trigger persistence even though the payload includes more fields than the hash tracks
  - document removal does not wrap delete failures in a visible error path, which can leave stale files in backend draft state without informing the user
  - farm and document validation are mixed between local state, prerequisite checks, and implicit file metadata assumptions; some uploads are represented in state before the actual backend upload is guaranteed
  - when step configuration is missing, the route shows a generic error panel rather than resolving to `notFound()`
- Risk Level: High
- Evidence from code/runtime structure: `apps/web-app/src/app/health/applications/new/step/[id]/page.tsx`, `apps/web-app/src/app/health/applications/new/hooks/use-auto-save.ts`, `apps/web-app/src/app/health/applications/new/steps/farm-info-step.tsx`, `apps/web-app/src/app/health/applications/new/steps/documents-step.tsx`
- Suspected Failure Mode: draft state drifts from visible wizard state, documents appear removed or saved when the backend state says otherwise, and step order can diverge from runtime config
- What to inspect next: `apps/web-app/src/app/health/applications/new/steps/production-info-step.tsx`, `quality-control-step.tsx`, and backend draft persistence behavior

[Frontend Audit Item]
- ID: FA-HEA-006
- Portal: Health Portal
- Route/Page: `/health/applications/preview`
- Main Components: `apps/web-app/src/app/health/applications/preview/page.tsx`
- Expected User/Role: authenticated health applicant reviewing a prepared application
- API/Dependency Used: `/api/applications/{id}`, `/api/applications/prepare`, `/api/applications/submit`, router query params
- Findings:
  - page supports both local preview and submit-to-payment behavior, so the confirmation action mutates backend workflow state from a preview screen
  - payment handoff uses `app={applicationId}` query syntax while other pages also use `applicationId` or route params, increasing state spread across URL dialects
  - success and error feedback are localized to toast/state inside the page; the destination `/health/payments` is expected to recover context from query params
  - route depends on client-side query state and does not expose a server boundary for missing or invalid `id`
- Risk Level: Medium
- Evidence from code/runtime structure: `apps/web-app/src/app/health/applications/preview/page.tsx`
- Suspected Failure Mode: preview page submits the application successfully but payment page receives partial context, producing a split success state across routes
- What to inspect next: the exact query contract consumed by `/health/payments`

[Frontend Audit Item]
- ID: FA-HEA-007
- Portal: Health Portal
- Route/Page: `/health/applications/payment`
- Main Components: `apps/web-app/src/app/health/applications/payment/page.tsx`
- Expected User/Role: authenticated health applicant paying for a specific application
- API/Dependency Used: `/api/payments/status/:applicationId`, route query params
- Findings:
  - fee amounts are hardcoded by phase in the page, which makes the UI vulnerable to stale pricing or backend quote changes
  - if `applicationId` is missing, the screen can still render from local query params and synthetic defaults rather than blocking the flow
  - page mixes status polling with local phase display logic and does not visibly distinguish backend-fetch failure from a pending or unknown payment state
  - this route overlaps conceptually with `/health/payments`, so payment flow ownership is split
- Risk Level: High
- Evidence from code/runtime structure: `apps/web-app/src/app/health/applications/payment/page.tsx`, `apps/backend/routes/api/payments.js`
- Suspected Failure Mode: users see an incorrect amount or an ambiguous status screen because the page renders even when the live payment contract is unavailable or differs from hardcoded values
- What to inspect next: whether any route still links here instead of `/health/payments`

[Frontend Audit Item]
- ID: FA-HEA-008
- Portal: Health Portal
- Route/Page: `/health/applications/tracking`
- Main Components: `apps/web-app/src/app/health/applications/tracking/page.tsx`
- Expected User/Role: authenticated health applicant tracking application statuses
- API/Dependency Used: `/api/applications/my`, `localStorage` auth checks
- Findings:
  - route uses `localStorage` auth and redirects to `/login`, not the canonical health login path
  - cards summarize progress but do not provide a consistent click-through into the detail route for every item
  - route duplicates concerns already handled by `/health/applications` and `/health/applications/[id]`
  - failure states are shallow and the page can present as a passive dashboard without actionable recovery
- Risk Level: Medium
- Evidence from code/runtime structure: `apps/web-app/src/app/health/applications/tracking/page.tsx`
- Suspected Failure Mode: users bounce between duplicate tracking surfaces with inconsistent auth redirects and incomplete navigation to the real workflow detail pages
- What to inspect next: whether this page is still linked from any current health navigation entry

[Frontend Audit Item]
- ID: FA-HEA-009
- Portal: Health Portal
- Route/Page: `/health/applications/amendment`
- Main Components: `apps/web-app/src/app/health/applications/amendment/page.tsx`
- Expected User/Role: certificate owner requesting amendment
- API/Dependency Used: `/api/certificates/:id`, `/api/applications`
- Findings:
  - flow creates a new application off a selected certificate, but submit error handling is not surfaced as a durable inline state
  - step completion state is locally driven and appears to over-advance relative to the visible step count
  - no explicit validation ties amendment reason fields back to backend-required fields beyond the submit payload
  - user has to understand certificate context before entering the flow; route does not recover gracefully from missing or invalid certificate query state
- Risk Level: Medium
- Evidence from code/runtime structure: `apps/web-app/src/app/health/applications/amendment/page.tsx`, `apps/backend/routes/api/certificates.js`, `apps/backend/routes/api/applications.js`
- Suspected Failure Mode: amendment submission fails after the UI indicates the flow has advanced, leaving the user unsure whether a new application was created
- What to inspect next: backend validation for amendment `serviceType`

[Frontend Audit Item]
- ID: FA-HEA-010
- Portal: Health Portal
- Route/Page: `/health/applications/replacement`
- Main Components: `apps/web-app/src/app/health/applications/replacement/page.tsx`
- Expected User/Role: certificate owner requesting replacement
- API/Dependency Used: `/api/certificates/:id`, `/api/applications`
- Findings:
  - route collects replacement-related files such as police report or damaged certificate, but the submit path only posts JSON and never uploads those files
  - submit failure is not represented as a strong inline error state
  - UI implies document-backed replacement workflow, while the backend request actually loses the attachments
  - auth and certificate selection rely on local client flow rather than a server-validated route guard
- Risk Level: Critical
- Evidence from code/runtime structure: `apps/web-app/src/app/health/applications/replacement/page.tsx`, `apps/backend/routes/api/applications.js`
- Suspected Failure Mode: users complete the replacement form believing evidence was submitted, but the backend receives no attachment payload and the application is incomplete
- What to inspect next: whether any upload route was intended to be called from this screen

[Frontend Audit Item]
- ID: FA-HEA-011
- Portal: Health Portal
- Route/Page: `/health/applications/renewal`
- Main Components: `apps/web-app/src/app/health/applications/renewal/page.tsx`, renewal step components
- Expected User/Role: certificate owner renewing a certificate
- API/Dependency Used: `/api/certificates/my`, `/api/quotes`, `/api/invoices`, localStorage fallback state
- Findings:
  - route still redirects to `/login` from local client auth checks instead of using the health auth route
  - missing-certificate fallback links to `/certificates` instead of `/health/certificates`
  - upload and payment confirmation parts of the flow include demo-like local fallbacks and synthetic success progression even when API calls fail
  - route stores payment and renewal state in localStorage, which can outlive the actual backend workflow state
- Risk Level: Critical
- Evidence from code/runtime structure: `apps/web-app/src/app/health/applications/renewal/page.tsx`, `apps/web-app/src/app/health/applications/renewal/upload-step.tsx`, `apps/web-app/src/app/health/applications/renewal/payment-step.tsx`
- Suspected Failure Mode: renewal flow shows a successful progression while backend quote, invoice, or payment confirmation has not actually completed
- What to inspect next: the renewal-specific backend endpoints and whether this UI is still an active production flow

[Frontend Audit Item]
- ID: FA-HEA-012
- Portal: Health Portal
- Route/Page: `/health/applications/[id]`
- Main Components: `apps/web-app/src/app/health/applications/[id]/page.tsx`
- Expected User/Role: application owner
- API/Dependency Used: `/api/applications/:id`, localStorage auth checks, local status/action mapping
- Findings:
  - route uses `localStorage.getItem('user')` and redirects to `/login`, bypassing the canonical auth/session helpers used elsewhere
  - payment summary and fee logic are derived from local heuristics and hardcoded totals rather than a quote or invoice source of truth
  - sidebar CTA to payment history drops application scoping and routes to the global payment page
  - status-to-action behavior is duplicated again here and may drift from both list page and backend workflow state
- Risk Level: High
- Evidence from code/runtime structure: `apps/web-app/src/app/health/applications/[id]/page.tsx`
- Suspected Failure Mode: detail page shows stale payment facts or offers actions that do not match the real backend state because both auth and business mapping are locally reconstructed
- What to inspect next: `application-detail-page-config.ts` and backend invoice/quote availability for application detail

[Frontend Audit Item]
- ID: FA-HEA-013
- Portal: Health Portal
- Route/Page: `/health/applications/[id]/edit`
- Main Components: `apps/web-app/src/app/health/applications/[id]/edit/page.tsx`
- Expected User/Role: application owner editing a draft or revision request
- API/Dependency Used: `/api/applications/:id`, wizard store hydration, `sessionStorage`
- Findings:
  - route allows edit only for selected statuses, but the guard is client-side after data fetch
  - backend data is coerced into wizard defaults such as `cannabis` or `NEW` when values are missing or unsupported, which can silently rewrite semantics
  - edit mode relies on `sessionStorage` flags to change wizard behavior
  - page assumes schema compatibility between application detail payload and wizard store shape even though the app contains schema drift indicators elsewhere
- Risk Level: High
- Evidence from code/runtime structure: `apps/web-app/src/app/health/applications/[id]/edit/page.tsx`, `apps/web-app/src/app/health/applications/new/hooks/use-application-flow-store.ts`
- Suspected Failure Mode: opening an old or differently-shaped application mutates it into current wizard defaults before the user understands what changed
- What to inspect next: exact backend payload variants used by legacy applications

[Frontend Audit Item]
- ID: FA-HEA-014
- Portal: Health Portal
- Route/Page: `/health/applications/[id]/car`
- Main Components: `apps/web-app/src/app/health/applications/[id]/car/page.tsx`
- Expected User/Role: application owner responding to corrective action requests
- API/Dependency Used: raw `fetch` to `/api/applications/:id/car`, bearer token from `localStorage`
- Findings:
  - route bypasses shared API client and sends bearer auth directly from `localStorage`
  - validation only ensures at least one file exists; field-level semantics and required metadata are minimal
  - page has submit loading state, but error handling is basic and tightly coupled to this one raw fetch path
  - file upload behavior is isolated from the rest of the document subsystem
- Risk Level: Medium
- Evidence from code/runtime structure: `apps/web-app/src/app/health/applications/[id]/car/page.tsx`
- Suspected Failure Mode: CAR uploads fail or authorize differently from the rest of the app because the route uses its own token transport and validation contract
- What to inspect next: backend expectations for CAR file metadata and auth headers

[Frontend Audit Item]
- ID: FA-HEA-015
- Portal: Health Portal
- Route/Page: `/health/applications/[id]/preview`
- Main Components: `apps/web-app/src/app/health/applications/[id]/preview/page.tsx`
- Expected User/Role: application owner previewing a generated application document
- API/Dependency Used: `/api/applications/:id`, direct PDF download path `${NEXT_PUBLIC_API_URL || '/api'}/applications/:id/pdf`, `localStorage.user.token`
- Findings:
  - route again relies on `localStorage` auth and `/login` redirects
  - PDF download bypasses shared API transport and reads token from a nested localStorage user shape that is not guaranteed to match current session storage
  - page assumes download endpoint and session token format without an intermediate probe or robust fallback
  - success state is limited to opening the PDF or surfacing a transient error
- Risk Level: High
- Evidence from code/runtime structure: `apps/web-app/src/app/health/applications/[id]/preview/page.tsx`
- Suspected Failure Mode: authenticated users can view the preview screen but fail to download the PDF because the token shape or API base path does not match the current runtime session model
- What to inspect next: whether this PDF route is still active in backend runtime

[Frontend Audit Item]
- ID: FA-HEA-016
- Portal: Health Portal
- Route/Page: `/health/applications/new/success`
- Main Components: `apps/web-app/src/app/health/applications/new/success/page.tsx`
- Expected User/Role: applicant finishing the new application wizard
- API/Dependency Used: `localStorage` keys `last_application_id` and `last_payment_data`
- Findings:
  - page is driven primarily by localStorage snapshots rather than a fresh backend read
  - displayed redirect countdown text is not backed by an actual redirect effect
  - success details can be stale, missing, or spoofed by prior localStorage state
  - links route to tracking and dashboard without validating whether the application exists in the backend
- Risk Level: High
- Evidence from code/runtime structure: `apps/web-app/src/app/health/applications/new/success/page.tsx`
- Suspected Failure Mode: user lands on a success screen that looks authoritative even when the underlying application/payment state was not actually committed
- What to inspect next: whether the wizard still links to this page in all success paths

[Frontend Audit Item]
- ID: FA-HEA-017
- Portal: Health Portal
- Route/Page: `/health/establishments`
- Main Components: `apps/web-app/src/app/health/establishments/page.tsx`
- Expected User/Role: health user managing certified establishments or farms
- API/Dependency Used: `/api/certificates/my`, `/api/farms/my`
- Findings:
  - route gates establishment access on existing certificates rather than on farm ownership or profile eligibility
  - if the user has no certificate, the page blocks the establishment list/create flow and routes toward application creation
  - this creates a domain dependency where establishment management appears downstream of certification instead of being a prerequisite
  - navigation continuity is weak because establishments are not present in the main health nav
- Risk Level: High
- Evidence from code/runtime structure: `apps/web-app/src/app/health/establishments/page.tsx`, `apps/backend/routes/api/certificates.js`, `apps/backend/routes/api/farms.js`
- Suspected Failure Mode: users who should create or manage farms before certification are blocked by certificate-gating logic and cannot enter the expected setup flow
- What to inspect next: business intent for establishment access vs farm onboarding

[Frontend Audit Item]
- ID: FA-HEA-018
- Portal: Health Portal
- Route/Page: `/health/establishments/new`
- Main Components: `apps/web-app/src/app/health/establishments/new/page.tsx`
- Expected User/Role: health user creating a new establishment or farm
- API/Dependency Used: `apiClient.post('/establishments', formData)`
- Findings:
  - frontend posts to `/establishments`, but inspected backend runtime exposes `/api/farms` and no matching establishments route was found
  - submitted field names such as `name`, `type`, and `areaSize` do not match backend farm creation payload shape
  - page lacks an explicit auth guard and depends on ambient portal access only
  - validation is mostly HTML `required` level and does not align with backend location/address requirements
- Risk Level: Critical
- Evidence from code/runtime structure: `apps/web-app/src/app/health/establishments/new/page.tsx`, `apps/backend/routes/api/farms.js`
- Suspected Failure Mode: create-establishment submission fails against runtime backend contract or creates unusable partial data because both the endpoint and schema are mismatched
- What to inspect next: whether any proxy rewrite or legacy backend route handles `/establishments`

[Frontend Audit Item]
- ID: FA-HEA-019
- Portal: Health Portal
- Route/Page: `/health/establishments/[id]`
- Main Components: `apps/web-app/src/app/health/establishments/[id]/page.tsx`
- Expected User/Role: health user viewing a specific farm or establishment
- API/Dependency Used: `/api/farms/:id`
- Findings:
  - route reads the runtime farm endpoint and is therefore semantically different from the create page under the same route family
  - page has loading and error treatment, but its terminology stays mixed between establishment and farm
  - cycle navigation forwards to `/health/planting/:id`, which is coherent for runtime planting but reinforces the mixed vocabulary
  - embedded map iframe is built directly from location state without a richer fallback
- Risk Level: Medium
- Evidence from code/runtime structure: `apps/web-app/src/app/health/establishments/[id]/page.tsx`, `apps/backend/routes/api/farms.js`
- Suspected Failure Mode: users can view an existing farm through the establishment route family but cannot create one through the matching create screen because the namespace is internally inconsistent
- What to inspect next: whether any other health pages link to farm records as establishments or vice versa

[Frontend Audit Item]
- ID: FA-HEA-020
- Portal: Health Portal
- Route/Page: `/health/planting`
- Main Components: `apps/web-app/src/app/health/planting/page.tsx`
- Expected User/Role: health user with eligible farm/certificate entering planting-cycle management
- API/Dependency Used: `plantingService.getMyCycles()`, `localStorage.currentFarmId`
- Findings:
  - entry guard depends on `localStorage` farm selection, yet the actual fetch ignores that selected farm and loads all user cycles
  - route redirects to `/health/establishments` when no farm id is stored, even though the list API itself is not farm-scoped from the page
  - error and empty states are collapsed into a generic no-cycles presentation
  - main portal nav and tracking legacy routes both point here, making it the canonical planting list even though its prerequisites are client-state dependent
- Risk Level: High
- Evidence from code/runtime structure: `apps/web-app/src/app/health/planting/page.tsx`, `apps/web-app/src/lib/services/planting-service.ts`
- Suspected Failure Mode: valid users with cycles but no localStorage farm context are incorrectly bounced away from the page, while users with stale farm context still see unrelated cycles
- What to inspect next: backend support for farm-scoped cycle listing vs `getMyCycles()`

[Frontend Audit Item]
- ID: FA-HEA-021
- Portal: Health Portal
- Route/Page: `/health/planting/new`
- Main Components: `apps/web-app/src/app/health/planting/new/page.tsx`, `new-planting-cycle-submit.ts`
- Expected User/Role: health user creating a planting cycle
- API/Dependency Used: `plantingService.getEligibleFarms()`, `plantingService.createCycle()`, local step state
- Findings:
  - page uses the shared planting service and shows prerequisite blockers, which is more coherent than older health screens
  - a full-screen `absolute inset-0 ... bg-white/50` overlay is rendered from the page tree and appears capable of covering interaction even outside a conditional loading branch
  - route depends on eligible-farm filtering, so users without an active certificate are blocked here even if they can navigate from generic planting CTAs
  - success flow is local and assumes the create-cycle contract stays aligned with the page summary state
- Risk Level: High
- Evidence from code/runtime structure: `apps/web-app/src/app/health/planting/new/page.tsx`, `apps/web-app/src/app/health/planting/new/new-planting-cycle-submit.ts`
- Suspected Failure Mode: the page looks available but remains partially or fully overlaid, or users hit the route from generic CTAs only to discover prerequisite blocks after entering the screen
- What to inspect next: runtime rendering of the overlay branch and any conditional class toggles around it

[Frontend Audit Item]
- ID: FA-HEA-022
- Portal: Health Portal
- Route/Page: `/health/planting/[id]`
- Main Components: `apps/web-app/src/app/health/planting/[id]/page.tsx`, `use-planting-cycle-detail-data-loader.ts`, `use-planting-cycle-detail-actions.ts`, `use-planting-cycle-detail-derived.ts`, detail tab components and modals
- Expected User/Role: health user operating a planting cycle
- API/Dependency Used: `plantingService.getCycleById()`, `listActivities()`, `listPlotCycleQrs()`, `getCycleIntegrity()`, `listPlantUnits()`, `generateUnits()`, `bulkConfirmPlantUnits()`, `generatePlotCycleQrs()`, `reconcilePlantUnits()`, harvest actions, query-string driven tab state
- Findings:
  - route is a large client-only orchestration surface with many parallel async reload paths and query-parameter driven state, which raises client/server boundary and state-race complexity
  - loader auto-generates plot QR codes during data load if any plot QR is missing, so simply opening the page can mutate backend state
  - status summaries may be computed from page-local unit rows when cycle summary data is absent, which can make visible totals depend on pagination/filter state instead of full-cycle truth
  - many notifications are toast-only; when an action partially fails, the persistent route state does not always explain what changed
  - some modal text and labels appear to be subject to encoding issues in source/output, which is a UI integrity risk but needs runtime confirmation
  - route behavior spans overview, plots, units, activities, trace, QR preview, bulk confirm, and harvest in one screen, so local state coupling is very high
- Risk Level: High
- Evidence from code/runtime structure: `apps/web-app/src/app/health/planting/[id]/page.tsx`, `apps/web-app/src/app/health/planting/[id]/use-planting-cycle-detail-data-loader.ts`, `apps/web-app/src/app/health/planting/[id]/use-planting-cycle-detail-actions.ts`, `apps/web-app/src/app/health/planting/[id]/use-planting-cycle-detail-derived.ts`
- Suspected Failure Mode: opening the detail page changes backend QR state automatically, derived counts differ by currently loaded units, or concurrent action/reload flows leave the UI showing a mixed snapshot
- What to inspect next: `apps/web-app/src/app/health/planting/[id]/planting-cycle-detail-modals.tsx`, `planting-cycle-detail-state-view.tsx`, and runtime browser behavior for tab/query synchronization

[Frontend Audit Item]
- ID: FA-HEA-023
- Portal: Health Portal
- Route/Page: `/health/planting/[id]/activities`
- Main Components: `apps/web-app/src/app/health/planting/[id]/activities/page.tsx`, `use-planting-activities-page.ts`
- Expected User/Role: health user recording planting activities
- API/Dependency Used: planting activity APIs through `plantingService`, attachment upload/delete through `/api/applications/draft-documents`
- Findings:
  - page has better explicit loading and error states than many older health screens
  - activity attachments are routed through the application draft document API instead of a planting-specific document path
  - attachment removal and some failed actions rely on toast feedback rather than durable inline state
  - route mixes planting domain behavior with application-domain storage contracts
- Risk Level: High
- Evidence from code/runtime structure: `apps/web-app/src/app/health/planting/[id]/activities/page.tsx`, `apps/web-app/src/app/health/planting/[id]/activities/use-planting-activities-page.ts`, `apps/backend/routes/api/applications.js`
- Suspected Failure Mode: planting activity evidence is stored or deleted through an unrelated draft-document pipeline, causing domain coupling and possible data loss or visibility confusion later
- What to inspect next: whether backend has a dedicated planting attachment contract that the frontend is bypassing

[Frontend Audit Item]
- ID: FA-HEA-024
- Portal: Health Portal
- Route/Page: `/health/tracking`
- Main Components: `apps/web-app/src/app/health/tracking/page.tsx`
- Expected User/Role: health user choosing a tracking surface
- API/Dependency Used: router links only
- Findings:
  - route acts mostly as a landing selector rather than a true operational page
  - one CTA sends the user back into `/health/planting`, which confirms that tracking is partly a legacy alias layer
  - there is no route-level data validation or readiness signal before sending the user deeper into lots or planting
  - navigation duplication makes role visibility and portal mental model less clear
- Risk Level: Low
- Evidence from code/runtime structure: `apps/web-app/src/app/health/tracking/page.tsx`
- Suspected Failure Mode: users interpret tracking as a distinct workflow, but are routed into planting or other legacy routes with different assumptions and state models
- What to inspect next: links that still target the tracking family rather than planting

[Frontend Audit Item]
- ID: FA-HEA-025
- Portal: Health Portal
- Route/Page: `/health/tracking/cycles`
- Main Components: `apps/web-app/src/app/health/tracking/cycles/page.tsx`
- Expected User/Role: health user listing tracked cycles
- API/Dependency Used: server redirect only
- Findings:
  - route is a redirect shell to `/health/planting`
  - no independent UI, loading, or error state exists here
  - route family remains public in the app tree even though it is only a legacy alias
- Risk Level: Low
- Evidence from code/runtime structure: `apps/web-app/src/app/health/tracking/cycles/page.tsx`
- Suspected Failure Mode: external links or bookmarks continue using the legacy path, but ownership of state and analytics is now split between alias and canonical route
- What to inspect next: whether route aliases are still emitted by current navigation

[Frontend Audit Item]
- ID: FA-HEA-026
- Portal: Health Portal
- Route/Page: `/health/tracking/cycles/[id]`
- Main Components: `apps/web-app/src/app/health/tracking/cycles/[id]/page.tsx`
- Expected User/Role: health user opening a tracked cycle detail
- API/Dependency Used: server redirect only
- Findings:
  - route is a redirect shell to `/health/planting/[id]`
  - there is no alias-specific guard or context preservation
  - query state can be lost or simplified during the redirect
- Risk Level: Low
- Evidence from code/runtime structure: `apps/web-app/src/app/health/tracking/cycles/[id]/page.tsx`
- Suspected Failure Mode: bookmarked legacy detail URLs resolve, but users lose the route context that originally lived under the tracking namespace
- What to inspect next: whether lot or plant routes still generate links under this namespace

[Frontend Audit Item]
- ID: FA-HEA-027
- Portal: Health Portal
- Route/Page: `/health/tracking/cycles/[id]/plants`
- Main Components: `apps/web-app/src/app/health/tracking/cycles/[id]/plants/page.tsx`
- Expected User/Role: health user viewing plant records under a cycle
- API/Dependency Used: server redirect only
- Findings:
  - route is another redirect shim into `/health/planting/[id]`
  - alias removes the original sub-route granularity and depends on the planting detail page to infer the correct tab or context
  - no explicit mapping is visible from the old plant list semantics to the new destination state
- Risk Level: Medium
- Evidence from code/runtime structure: `apps/web-app/src/app/health/tracking/cycles/[id]/plants/page.tsx`
- Suspected Failure Mode: a plant-list deep link resolves to a generic planting detail view without the user landing on the expected units tab or filter scope
- What to inspect next: tab query handling in `/health/planting/[id]` for legacy incoming links

[Frontend Audit Item]
- ID: FA-HEA-028
- Portal: Health Portal
- Route/Page: `/health/tracking/logs`
- Main Components: `apps/web-app/src/app/health/tracking/logs/page.tsx`
- Expected User/Role: health user viewing activity logs
- API/Dependency Used: server redirect only
- Findings:
  - route is a redirect shim and has no independent UI
  - alias suggests logs are still a top-level tracking destination even though the actual activity view now lives under planting detail
  - old information architecture remains in the route tree
- Risk Level: Low
- Evidence from code/runtime structure: `apps/web-app/src/app/health/tracking/logs/page.tsx`
- Suspected Failure Mode: links or users expecting a log index land in a broader planting route that does not preserve the log-specific mental model
- What to inspect next: whether any current page still links directly to `/health/tracking/logs`

[Frontend Audit Item]
- ID: FA-HEA-029
- Portal: Health Portal
- Route/Page: `/health/tracking/lots`
- Main Components: `apps/web-app/src/app/health/tracking/lots/page.tsx`
- Expected User/Role: health user managing lots and QR batches
- API/Dependency Used: raw `fetch` calls, `localStorage.farmId`, lot and batch QR endpoints
- Findings:
  - route bypasses shared API client and depends on `localStorage.farmId`
  - batch and lot fetching fall back toward empty UI when requests fail, so explicit error state is weak
  - polling and QR generation live in this page while other planting/tracking behavior moved into planting detail, creating a split runtime surface
  - there is no clear server-side guarantee that the stored farm id still belongs to the current session
- Risk Level: High
- Evidence from code/runtime structure: `apps/web-app/src/app/health/tracking/lots/page.tsx`
- Suspected Failure Mode: users see an empty lots screen because the route silently trusts stale local farm context and hides network or authorization failures behind an empty state
- What to inspect next: backend lot endpoints and any current UI link into this page from planting detail

[Frontend Audit Item]
- ID: FA-HEA-030
- Portal: Health Portal
- Route/Page: `/health/tracking/plants/[qr-code]`
- Main Components: `apps/web-app/src/app/health/tracking/plants/[qr-code]/page.tsx`
- Expected User/Role: health user viewing a specific plant unit trace page
- API/Dependency Used: raw `fetch` to `/api/plant-units/qr/:qrCode`, `/care-logs`, `/qr/print`
- Findings:
  - route uses raw fetch calls and does not establish an explicit auth redirect before loading
  - page mixes plant detail, care logs, and QR print behavior in a client-heavy component without a strong server boundary
  - navigation to public trace uses `/trace/${plant.batch.qrCode}`, which depends on generic trace route resolution rather than a more explicit batch namespace
  - error treatment exists, but route ownership is inconsistent with the newer planting detail model
- Risk Level: Medium
- Evidence from code/runtime structure: `apps/web-app/src/app/health/tracking/plants/[qr-code]/page.tsx`
- Suspected Failure Mode: plant-unit detail works only for some QR types or auth states, and public-trace handoff can route to the wrong generic trace resolver
- What to inspect next: backend support for `/api/plant-units/qr/:qrCode` and whether this page is still reachable from active UI

[Frontend Audit Item]
- ID: FA-HEA-031
- Portal: Health Portal
- Route/Page: `/health/certificates`
- Main Components: `apps/web-app/src/app/health/certificates/page.tsx`
- Expected User/Role: certificate-owning health user
- API/Dependency Used: `/api/certificates?farmId=...`, `localStorage.farmId`
- Findings:
  - route redirects to establishments if no local farm id is present, even though certificate ownership is a user-level concept
  - frontend calls `/api/certificates?farmId=...`, but inspected backend runtime exposes `/api/certificates` as a provider route and `/api/certificates/my` as the health-user route
  - download button is rendered without a working handler
  - QR preview assumes `selectedCert.qrCode` is directly renderable as an image URL
- Risk Level: Critical
- Evidence from code/runtime structure: `apps/web-app/src/app/health/certificates/page.tsx`, `apps/backend/routes/api/certificates.js`
- Suspected Failure Mode: certificate page fails entirely for normal health users because it hits the wrong backend namespace, and even successful renders contain dead download behavior
- What to inspect next: whether any proxy layer rewrites `/api/certificates` for health users

[Frontend Audit Item]
- ID: FA-HEA-032
- Portal: Health Portal
- Route/Page: `/health/payments`
- Main Components: `apps/web-app/src/app/health/payments/page.tsx`
- Expected User/Role: health user reviewing invoices and payments
- API/Dependency Used: `PaymentService.getMyPayments()`, promptpay and invoice modals, query-driven filtering
- Findings:
  - route uses the shared payment service and has clearer modal structure than older pages
  - filtering depends on query params like `app` and `invoice`, which means deep links are supported but page state is URL-fragmented relative to application detail
  - route overlaps with `/health/applications/payment`, so payment UX remains split between dedicated and global surfaces
  - empty/error/success treatments are better here, but success state still assumes downstream invoice/payment contracts are intact
- Risk Level: Medium
- Evidence from code/runtime structure: `apps/web-app/src/app/health/payments/page.tsx`, `apps/web-app/src/lib/services/payment-service.ts`
- Suspected Failure Mode: users receive different payment status narratives depending on whether they land here from an app detail page or from the older application payment route
- What to inspect next: all links into this page from application routes and invoice modals

[Frontend Audit Item]
- ID: FA-HEA-033
- Portal: Health Portal
- Route/Page: `/health/profile`
- Main Components: `apps/web-app/src/app/health/profile/page.tsx`, `change-password-modal.tsx`
- Expected User/Role: authenticated health user managing profile
- API/Dependency Used: `AuthService.getUser()`, dormant `apiClient.post('/auth/health/change-password')` in modal component
- Findings:
  - page is mostly a display screen reading client session state rather than live profile data
  - edit-profile button, avatar camera button, and change-password button are rendered without active behavior
  - a change-password modal component exists in the route folder but is not mounted by the page
  - role label is hardcoded as `HEALTH_USER Member`, which is another vocabulary drift signal
- Risk Level: High
- Evidence from code/runtime structure: `apps/web-app/src/app/health/profile/page.tsx`, `apps/web-app/src/app/health/profile/change-password-modal.tsx`
- Suspected Failure Mode: users assume profile actions exist because the controls are visible, but the buttons are dead and no backend mutation path is actually connected
- What to inspect next: whether a newer profile editing route exists outside this page

[Frontend Audit Item]
- ID: FA-HEA-034
- Portal: Health Portal
- Route/Page: `/health/site-analysis`
- Main Components: `apps/web-app/src/app/health/site-analysis/page.tsx`
- Expected User/Role: health user recording site analysis records
- API/Dependency Used: raw `fetch` with `localStorage.token`, `/api/farms`, `/api/site-analyses/farm/:farmId`
- Findings:
  - route bypasses shared auth and API clients, using bearer token from `localStorage`
  - create/update/delete flows do not present strong inline success or error feedback
  - route assumes the health user can fetch farm options directly and then site analyses by farm id, but validation is minimal
  - state management is local and modal-driven, with no stronger recovery from failed persistence
- Risk Level: Medium
- Evidence from code/runtime structure: `apps/web-app/src/app/health/site-analysis/page.tsx`, `apps/backend/routes/api/site-analyses.js`, `apps/backend/routes/api/farms.js`
- Suspected Failure Mode: save or delete operations fail silently enough that the table appears stale or misleading after modal close
- What to inspect next: exact backend auth contract for site analysis endpoints and whether `localStorage.token` matches current session handling

[Frontend Audit Item]
- ID: FA-HEA-035
- Portal: Health Portal
- Route/Page: `/health/training`
- Main Components: `apps/web-app/src/app/health/training/page.tsx`
- Expected User/Role: health user managing training records
- API/Dependency Used: raw `fetch` with `localStorage.token`, training record CRUD endpoints
- Findings:
  - route again bypasses shared API transport and auth helpers
  - no strong inline error or success state is shown for save/delete operations
  - validation and submit busy state are shallow compared with the amount of user-entered record data
  - page structure is functional, but contract safety relies heavily on backend responses while the UI offers limited recovery if something fails
- Risk Level: Medium
- Evidence from code/runtime structure: `apps/web-app/src/app/health/training/page.tsx`, `apps/backend/routes/api/training-records.js`
- Suspected Failure Mode: users leave the page believing records were persisted or updated when the backend write failed and the UI only partially refreshed
- What to inspect next: training payload validation rules in backend runtime

Health Portal summary:
- routes checked:
  - `/health/*` shared shell
  - `/health/dashboard`
  - `/health/applications`
  - `/health/applications/new`
  - `/health/applications/new/step/[id]`
  - `/health/applications/preview`
  - `/health/applications/payment`
  - `/health/applications/tracking`
  - `/health/applications/amendment`
  - `/health/applications/replacement`
  - `/health/applications/renewal`
  - `/health/applications/[id]`
  - `/health/applications/[id]/edit`
  - `/health/applications/[id]/car`
  - `/health/applications/[id]/preview`
  - `/health/applications/new/success`
  - `/health/establishments`
  - `/health/establishments/new`
  - `/health/establishments/[id]`
  - `/health/planting`
  - `/health/planting/new`
  - `/health/planting/[id]`
  - `/health/planting/[id]/activities`
  - `/health/tracking`
  - `/health/tracking/cycles`
  - `/health/tracking/cycles/[id]`
  - `/health/tracking/cycles/[id]/plants`
  - `/health/tracking/logs`
  - `/health/tracking/lots`
  - `/health/tracking/plants/[qr-code]`
  - `/health/certificates`
  - `/health/payments`
  - `/health/profile`
  - `/health/site-analysis`
  - `/health/training`
- routes not yet checked:
  - none within the requested Health Portal scope
- portal-level risk concentration:
  - mixed auth/session models across cookie middleware, `AuthService`, `localStorage`, and raw bearer fetches
  - multiple broken or high-risk contracts in establishment creation, certificates, replacement, renewal, and payment subflows
  - legacy route families under `/health/tracking/*` remain active as aliases or split surfaces
  - wizard, planting, and certificate flows contain several local-state fallbacks that can show success-like UI without strong backend confirmation
  - for deeper confirmation inside the largest routes, `ต้องเปิดดูไฟล์/route/component เพิ่ม` on selected subcomponents under `/health/applications/new/*` and `/health/planting/[id]`
