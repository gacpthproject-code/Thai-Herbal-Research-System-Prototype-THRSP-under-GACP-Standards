# Phase 2 Frontend Audit - Public and Auth

Audit basis:
- runtime and code in `apps/web-app`
- auth and route gating from `apps/web-app/src/middleware.ts`
- auth session behavior from `apps/web-app/src/lib/services/auth-service.ts`
- API calls and route shells from page files in `apps/web-app/src/app`

[Frontend Audit Item]
- ID: FA-PUB-001
- Portal: Public/Auth
- Route/Page: `/`
- Main Components: `apps/web-app/src/app/page.tsx`, `apps/web-app/src/components/runtime/splash-view.tsx`
- Expected User/Role: public visitor
- API/Dependency Used: `useRouter`, client-only progress state, global middleware redirect from `/login` to `/auth/health/login`
- Findings:
  - entry page is a client-only splash screen with artificial progress and delayed navigation rather than a server redirect or auth-aware landing page
  - splash always pushes to `/login`, which then depends on middleware to redirect again to `/auth/health/login`
  - no loading/error fallback exists for the splash transition itself; if client navigation fails, the page can remain stuck on the progress UI
  - no check is made for an existing authenticated session before redirecting
- Risk Level: Medium
- Evidence from code/runtime structure: `apps/web-app/src/app/page.tsx`, `apps/web-app/src/components/runtime/splash-view.tsx`, `apps/web-app/src/middleware.ts`
- Suspected Failure Mode: extra redirect hop on every entry, possible stuck splash on client-side navigation failure, authenticated users still hit the splash path before route protection resolves later
- What to inspect next: `apps/web-app/src/lib/services/auth-provider.tsx` and whether any SSR redirect exists outside this route

[Frontend Audit Item]
- ID: FA-PUB-002
- Portal: Public/Auth
- Route/Page: `/(auth)/layout`
- Main Components: `apps/web-app/src/app/(auth)/layout.tsx`
- Expected User/Role: public auth user
- API/Dependency Used: none; pass-through layout only
- Findings:
  - layout is a no-op wrapper and does not provide auth-specific error boundary, metadata, suspense boundary, or route-level shell
  - any shared auth UX contract is duplicated in each page instead of centralized here
- Risk Level: Low
- Evidence from code/runtime structure: `apps/web-app/src/app/(auth)/layout.tsx`
- Suspected Failure Mode: inconsistent auth page behavior and duplicated logic/styles across auth pages
- What to inspect next: auth-specific shared component usage across `/(auth)` pages

[Frontend Audit Item]
- ID: FA-PUB-003
- Portal: Public/Auth
- Route/Page: `/(auth)/login`
- Main Components: `apps/web-app/src/app/(auth)/login/page.tsx`, `AuthService`, `useLanguage`
- Expected User/Role: health applicant
- API/Dependency Used: `AuthService.login()` -> `apps/web-app/src/lib/services/auth-service-api.ts` -> `/auth/health/login`
- Findings:
  - form validation only checks `identifier` non-empty and password min length; it does not validate identifier shape (email, etc.) or allowed identifier format
  - redirect target comes directly from `searchParams.get('redirect')` without visible allowlist normalization in this page
  - page is fully client-side and depends on `AuthService.saveSession()` to dual-write cookie and localStorage state after login
- Risk Level: Medium
- Evidence from code/runtime structure: `apps/web-app/src/app/(auth)/login/page.tsx`, `apps/web-app/src/lib/services/auth-service-api.ts`, `apps/web-app/src/lib/services/auth-service.ts`, `apps/backend/routes/api/auth-health.js`
- Suspected Failure Mode: weak client validation, inconsistent redirect behavior when `redirect` contains stale or unexpected values
- What to inspect next: whether identifier-format validation should be tightened on the client to give faster feedback than waiting for the server

[Frontend Audit Item]
- ID: FA-PUB-004
- Portal: Public/Auth
- Route/Page: `/(auth)/register`
- Main Components: `apps/web-app/src/app/(auth)/register/page.tsx`, `AuthService`
- Expected User/Role: new health applicant
- API/Dependency Used: `AuthService.register()` -> `/auth/health/register`
- Findings:
  - route is a client-side multi-step wizard with only local state; step progress is not reflected in URL, so refresh loses current step context
  - `identifier` validation uses `min(13)` and input `maxLength={13}` but does not enforce exact digits or checksum
  - registration payload writes both `identifier` and `healthId` and hardcodes `accountType: 'INDIVIDUAL'`
  - no identifier availability check is performed even though `checkIdentifierWithAuthApi()` exists in the auth service layer
  - success flow uses `setTimeout(() => router.push('/auth/health/login'), 3000)` without cleanup
  - back link points to `/login`, relying on middleware canonical redirect rather than linking directly to `/auth/health/login`
- Risk Level: Medium
- Evidence from code/runtime structure: `apps/web-app/src/app/(auth)/register/page.tsx`, `apps/web-app/src/lib/services/auth-service-api.ts`
- Suspected Failure Mode: invalid identifiers accepted client-side, duplicate or conflicting identity submissions, state loss on refresh during multi-step registration
- What to inspect next: backend registration validation in `apps/backend/controllers/auth-controller/health-auth-profile-handlers.js`

[Frontend Audit Item]
- ID: FA-PUB-005
- Portal: Public/Auth
- Route/Page: `/(auth)/forgot-password`
- Main Components: `apps/web-app/src/app/(auth)/forgot-password/page.tsx`
- Expected User/Role: public user with existing health account
- API/Dependency Used: `apiClient.post('/auth/health/reset-password', ...)`
- Findings:
  - page provides explicit phone/email mode toggle, client validation, loading, success, and error states
  - form hides after success, so retry requires using the explicit retry action; that part is implemented
  - no rate-limit UX, resend cooldown, or server-side field-level feedback is shown on repeated attempts
  - page assumes reset flow only for health users; no equivalent provider recovery path is exposed here
- Risk Level: Low
- Evidence from code/runtime structure: `apps/web-app/src/app/(auth)/forgot-password/page.tsx`, `apps/backend/routes/api/auth-health.js`
- Suspected Failure Mode: repeated password reset attempts can feel like silent throttling if backend rate-limits without richer UI feedback
- What to inspect next: whether provider reset flow exists anywhere in `apps/web-app/src/app/auth/provider`

[Frontend Audit Item]
- ID: FA-PUB-006
- Portal: Public/Auth
- Route/Page: `/(auth)/register/success`
- Main Components: `apps/web-app/src/app/(auth)/register/success/page.tsx`
- Expected User/Role: newly registered public user
- API/Dependency Used: `useSearchParams`, `Suspense`
- Findings:
  - page reads display name from query string only; there is no server-verified session read
  - link returns to `/login`, again relying on middleware to canonicalize to `/auth/health/login`
  - account type text is hardcoded to individual/health semantics regardless of query input
  - loading fallback exists for `Suspense`, which is better than the other auth pages
- Risk Level: Low
- Evidence from code/runtime structure: `apps/web-app/src/app/(auth)/register/success/page.tsx`
- Suspected Failure Mode: success screen can display stale or spoofed name from URL query string and does not confirm persisted registration state
- What to inspect next: whether any page links to this route with trusted query data

[Frontend Audit Item]
- ID: FA-PUB-007
- Portal: Public/Auth
- Route/Page: `/auth/health/login`
- Main Components: `apps/web-app/src/app/auth/health/login/page.tsx`
- Expected User/Role: health applicant
- API/Dependency Used: re-export of `/(auth)/login`
- Findings:
  - route is only an alias wrapper with `dynamic = 'force-dynamic'`
  - actual behavior lives in another page, which means frontend audit and route ownership are split between alias and implementation file
- Risk Level: Low
- Evidence from code/runtime structure: `apps/web-app/src/app/auth/health/login/page.tsx`
- Suspected Failure Mode: route alias drift if implementation changes and alias-specific expectations are added later
- What to inspect next: whether other health auth pages follow the same alias pattern

[Frontend Audit Item]
- ID: FA-PUB-008
- Portal: Public/Auth
- Route/Page: `/auth/provider/login`
- Main Components: `apps/web-app/src/app/auth/provider/login/page.tsx`, `apps/web-app/src/app/provider/login/page.tsx`
- Expected User/Role: provider provider
- API/Dependency Used: `AuthService.login()` -> `/auth/provider/login`
- Findings:
  - auth route file is a re-export; actual implementation lives under `/provider/login/page.tsx`
  - provider form validates `providerId` shape client-side and shows loading/error states
  - successful login forces `window.location.href = '/provider/dashboard'` and does not preserve or honor any `redirect` query
  - no provider forgot-password or reset flow is exposed from this page
  - page depends on `AuthService.saveSession()` to infer provider session from returned user payload
- Risk Level: Medium
- Evidence from code/runtime structure: `apps/web-app/src/app/auth/provider/login/page.tsx`, `apps/web-app/src/app/provider/login/page.tsx`, `apps/web-app/src/lib/services/auth-service-api.ts`
- Suspected Failure Mode: provider users redirected away from intended destination after login, and account recovery is a dead end from the UI
- What to inspect next: any provider recovery route or admin-issued reset flow in the provider portal

[Frontend Audit Item]
- ID: FA-PUB-010
- Portal: Public/Auth
- Route/Page: `/trace`
- Main Components: `apps/web-app/src/app/trace/page.tsx`
- Expected User/Role: public verifier
- API/Dependency Used: client-side router push only; downstream trace fetch happens in child routes
- Findings:
  - search form does not validate route type and always pushes generic `/trace/{input}`
  - login CTA points to `/login`, relying on middleware redirect instead of canonical `/auth/health/login`
  - `isSearching` is set before navigation but never reset locally if client navigation fails
  - page provides no inline error state for malformed IDs
- Risk Level: Low
- Evidence from code/runtime structure: `apps/web-app/src/app/trace/page.tsx`, `apps/web-app/src/middleware.ts`
- Suspected Failure Mode: malformed user input creates dead-end trace URLs with no pre-validation and no local recovery besides browser navigation
- What to inspect next: route-level handling for invalid generic trace IDs in `/trace/[qr-code]`

[Frontend Audit Item]
- ID: FA-PUB-011
- Portal: Public/Auth
- Route/Page: `/trace/[qr-code]`
- Main Components: `apps/web-app/src/app/trace/[qr-code]/page.tsx`
- Expected User/Role: public verifier
- API/Dependency Used: `fetch('/api/trace/${qrCode}')`, `useDisclosure`
- Findings:
  - page mixes real fetch behavior with a hardcoded `demo-id` mock fallback inside production component logic
  - comment notes `if (!res.ok)` but does not actually throw, creating a silent-failure branch that still tries to parse JSON
  - share button is rendered but no click handler is attached, which makes it a dead button
  - loading and error states exist, but transport failures and backend-not-found states are collapsed into generic messaging
- Risk Level: High
- Evidence from code/runtime structure: `apps/web-app/src/app/trace/[qr-code]/page.tsx`
- Suspected Failure Mode: users hit a trace URL that returns non-OK or malformed data and get inconsistent behavior due to the non-throwing fetch branch; share CTA is inert
- What to inspect next: remaining lower-half UI in this page for other inactive controls or hidden sections

[Frontend Audit Item]
- ID: FA-PUB-012
- Portal: Public/Auth
- Route/Page: `/trace/plant/[qr-code]`
- Main Components: `apps/web-app/src/app/trace/plant/[qr-code]/page.tsx`
- Expected User/Role: public verifier
- API/Dependency Used: `fetch('/api/trace/plant/${qrCode}')`
- Findings:
  - page has explicit loading, empty/error, and success states
  - error state routes back to `/`, not `/trace`, which breaks context for the public trace flow
  - print action uses `window.print()` without checking browser environment or print stylesheet readiness
  - page is large client-rendered UI driven by a single effect and local state, so all trace rendering waits for client fetch
- Risk Level: Medium
- Evidence from code/runtime structure: `apps/web-app/src/app/trace/plant/[qr-code]/page.tsx`
- Suspected Failure Mode: verifier loses trace flow context on error and gets bounced to the splash entry instead of the trace index
- What to inspect next: any print-specific CSS or PDF fallback for public trace pages

[Frontend Audit Item]
- ID: FA-PUB-013
- Portal: Public/Auth
- Route/Page: `/trace/batch/[qr-code]`
- Main Components: `apps/web-app/src/app/trace/batch/[qr-code]/page.tsx`
- Expected User/Role: public verifier
- API/Dependency Used: `fetch('/api/trace/batch/${batchId}')`
- Findings:
  - page has loading, error, and success states
  - cancellation guard is implemented incorrectly: `fetchTrace(cancelled = false)` receives a primitive copy, so cleanup changing the outer `cancelled` flag does not stop later state updates
  - summary and table structure are present, but all data loading is client-only
- Risk Level: High
- Evidence from code/runtime structure: `apps/web-app/src/app/trace/batch/[qr-code]/page.tsx`
- Suspected Failure Mode: state update after unmount during route change or quick re-entry, leading to stale render or console warnings
- What to inspect next: whether similar cancellation patterns exist in other public trace pages

[Frontend Audit Item]
- ID: FA-PUB-014
- Portal: Public/Auth
- Route/Page: `/trace/lot/[lot-id]`
- Main Components: `apps/web-app/src/app/trace/lot/[lot-id]/page.tsx`
- Expected User/Role: public verifier
- API/Dependency Used: `fetch('/api/trace/lot/${lotId}')`
- Findings:
  - route has explicit loading, error, and success states
  - unlike batch trace, this page uses the cancellation flag correctly within the effect scope
  - error state sends user back to `/`, not `/trace`, which is inconsistent with trace-home navigation
  - page exposes health planting deep-link metadata through `links` in its type, but route-level UI ownership of authenticated deep links needs more inspection
- Risk Level: Medium
- Evidence from code/runtime structure: `apps/web-app/src/app/trace/lot/[lot-id]/page.tsx`
- Suspected Failure Mode: user loses trace-flow context after error, and authenticated deep links may appear without proper route explanation
- What to inspect next: lower-half UI handling of `links.healthPlantingUnitsUrl` and `requiresAuthentication`

[Frontend Audit Item]
- ID: FA-PUB-015
- Portal: Public/Auth
- Route/Page: `/trace/plot-cycle/[qr-code]`
- Main Components: `apps/web-app/src/app/trace/plot-cycle/[qr-code]/page.tsx`
- Expected User/Role: public verifier
- API/Dependency Used: `fetch('/api/trace/plot-cycle/${qrCode}')`
- Findings:
  - route has explicit loading, error, and success states and uses cancellation flag correctly
  - page renders integrity fields, latest lots, and authenticated deep-link metadata in one public screen, increasing conditional UI complexity
  - route remains fully client-rendered and has no SSR fallback for public trace verification
- Risk Level: Medium
- Evidence from code/runtime structure: `apps/web-app/src/app/trace/plot-cycle/[qr-code]/page.tsx`
- Suspected Failure Mode: stale public data or partial public/private link exposure if backend contract changes around `links` or `integrity`
- What to inspect next: lower-half rendering of integrity and authenticated deep-link CTAs

[Frontend Audit Item]
- ID: FA-PUB-016
- Portal: Public/Auth
- Route/Page: `/verify`
- Main Components: `apps/web-app/src/app/verify/page.tsx`, `apps/web-app/src/components/feature/trust-verifier-portal.tsx`
- Expected User/Role: public verifier
- API/Dependency Used: `/api/interoperability/v1/verification`, `/api/interoperability/v1/trust/*`, `/api/interoperability/v1/signatures/verify`, `/api/interoperability/v1/trace/events/*`
- Findings:
  - page delegates all behavior to one large client component that manually manages every verification workflow with local state
  - no loading skeleton exists at route level; each subsection manages its own fetch lifecycle
  - trust verifier uses only interoperability endpoints in inspected code; no `/api/identity/*` path is used here
  - signature verification path depends on raw JSON input parsing from a textarea, which throws into generic UI error handling when malformed
- Risk Level: Medium
- Evidence from code/runtime structure: `apps/web-app/src/app/verify/page.tsx`, `apps/web-app/src/components/feature/trust-verifier-portal.tsx`
- Suspected Failure Mode: large client-only portal becomes brittle as API contracts drift, and malformed user JSON creates generic rather than field-level feedback
- What to inspect next: remaining lower-half UI of `trust-verifier-portal.tsx` for button disable logic and empty states across every panel

[Frontend Audit Item]
- ID: FA-PUB-017
- Portal: Public/Auth
- Route/Page: `/verify-identity`
- Main Components: `apps/web-app/src/app/verify-identity/page.tsx`
- Expected User/Role: public identity verifier
- API/Dependency Used: exact re-export of `/verify`
- Findings:
  - route is not identity-specific in inspected frontend code; it simply re-exports the trust verifier page
  - no `/api/identity/*` usage was found in this route file
  - identity verification semantics promised by route naming are not implemented in the route shell itself
- Risk Level: High
- Evidence from code/runtime structure: `apps/web-app/src/app/verify-identity/page.tsx`, `apps/web-app/src/app/verify/page.tsx`, `apps/web-app/src/components/feature/trust-verifier-portal.tsx`
- Suspected Failure Mode: users land on an identity verification URL and get certificate/trust tooling instead of an identity flow
- What to inspect next: whether an identity verifier component exists elsewhere in `apps/web-app/src/components` and was never wired to this route

[Frontend Audit Item]
- ID: FA-PUB-018
- Portal: Public/Auth
- Route/Page: Shared runtime boundary for Public/Auth routes
- Main Components: `apps/web-app/src/middleware.ts`, `apps/web-app/src/lib/services/auth-service.ts`, `apps/web-app/src/lib/api/api-client.ts`, `apps/web-app/src/app/layout.tsx`, `apps/web-app/src/app/providers.tsx`
- Expected User/Role: public, health applicant, provider provider
- API/Dependency Used: middleware cookie gates, `AuthService`, `apiClient`, global providers
- Findings:
  - middleware canonicalizes `/login` and `/provider/login`, but several frontend pages and services still hardcode `/login`
  - `AuthService.setupCrossTabSync()` redirects logout cases to `/login` instead of `/auth/health/login`
  - `AuthService.refreshToken()` always calls `/api/auth/health/refresh`, even for provider users after syncing `provider_token`
  - root provider stack is fully client-side (`AuthProvider`, `LanguageProvider`, `SystemGuard`), so route experience depends heavily on hydration and browser storage
- Risk Level: High
- Evidence from code/runtime structure: `apps/web-app/src/middleware.ts`, `apps/web-app/src/lib/services/auth-service.ts`, `apps/web-app/src/lib/api/api-client.ts`, `apps/web-app/src/app/layout.tsx`, `apps/web-app/src/app/providers.tsx`
- Suspected Failure Mode: provider sessions inherit health-refresh behavior, cross-tab logout/login paths bounce through non-canonical routes, and client hydration timing affects auth-visible UI
- What to inspect next: `apps/web-app/src/lib/services/auth-provider.tsx` and all provider session refresh assumptions

## Public/Auth portal summary

- routes checked:
  - `/`
  - `/(auth)/layout`
  - `/(auth)/login`
  - `/(auth)/register`
  - `/(auth)/forgot-password`
  - `/(auth)/register/success`
  - `/auth/health/login`
  - `/auth/provider/login`
  - `/trace`
  - `/trace/[qr-code]`
  - `/trace/plant/[qr-code]`
  - `/trace/batch/[qr-code]`
  - `/trace/lot/[lot-id]`
  - `/trace/plot-cycle/[qr-code]`
  - `/verify`
  - `/verify-identity`
  - shared runtime boundary files affecting these routes
- routes not yet checked:
  - none in the requested Public/Auth scope at route-file level
  - deeper component internals still needing more inspection:
    - remaining lower-half UI in `apps/web-app/src/app/trace/[qr-code]/page.tsx`
    - remaining lower-half UI in `apps/web-app/src/components/feature/trust-verifier-portal.tsx`
    - `apps/web-app/src/lib/services/auth-provider.tsx`
- portal risk summary:
  - `/verify-identity` is wired to the same trust portal as `/verify`, not an identity-specific flow
  - public trace routes have inconsistent recovery navigation and at least one dead button
  - shared auth runtime still uses non-canonical `/login` in multiple places and refreshes via health auth even after provider login
