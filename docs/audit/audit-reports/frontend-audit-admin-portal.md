# Phase 2 Frontend Audit - Admin Portal

Audit basis:
- runtime and code in `apps/web-app/src/app/admin`
- admin route protection in `apps/web-app/src/middleware.ts`
- backend contract checks in `apps/backend/routes/api/admin/*`, `apps/backend/routes/api/provider.js`, and `apps/backend/routes/api/system-config.routes.js`

[Frontend Audit Item]
- ID: FA-ADM-001
- Portal: Admin Portal
- Route/Page: `/admin/*` shared shell
- Main Components: `apps/web-app/src/app/admin/layout.tsx`
- Expected User/Role: admin user
- API/Dependency Used: local admin nav links, middleware `/admin` role rule
- Findings:
  - admin layout is a visual shell only and does not own auth/session checks
  - mobile sidebar is hidden with no visible mobile replacement nav, so navigation continuity degrades on small screens
  - admin nav links mix native admin pages with aliases that redirect to provider-owned surfaces
  - role visibility is enforced mainly by middleware, not by the layout itself
- Risk Level: Medium
- Evidence from code/runtime structure: `apps/web-app/src/app/admin/layout.tsx`, `apps/web-app/src/middleware.ts`
- Suspected Failure Mode: admin users on mobile lose clear navigation between sections, and route ownership is obscured because the shell does not distinguish admin-native vs provider-alias pages
- What to inspect next: whether a responsive admin nav exists outside this layout

[Frontend Audit Item]
- ID: FA-ADM-002
- Portal: Admin Portal
- Route/Page: `/admin/dashboard`
- Main Components: `apps/web-app/src/app/admin/dashboard/page.tsx`
- Expected User/Role: admin user landing on console overview
- API/Dependency Used: static quick-action card links only
- Findings:
  - dashboard is a static index page and does not load live admin metrics or system state
  - quick actions link directly into provider and admin aliases, so it acts as a routing hub rather than an operational dashboard
  - grid uses a fixed `grid-cols-2` layout without a smaller breakpoint fallback
  - page does not surface auth context, role confirmation, or recent admin actions
- Risk Level: Low
- Evidence from code/runtime structure: `apps/web-app/src/app/admin/dashboard/page.tsx`
- Suspected Failure Mode: admins see a dashboard label but receive only static entry cards, with cramped layout on narrow screens and no real operational signal
- What to inspect next: whether an admin metrics backend exists that is not used by this page

[Frontend Audit Item]
- ID: FA-ADM-003
- Portal: Admin Portal
- Route/Page: `/admin/users`
- Main Components: `apps/web-app/src/app/admin/users/page.tsx`
- Expected User/Role: admin managing users
- API/Dependency Used: server redirect to `/provider/management`
- Findings:
  - route does not use the dedicated backend admin users namespace and instead redirects to the provider management page
  - admin user management therefore inherits provider directory behavior, provider role dialects, and provider API contracts
  - route ownership is split: URL says admin, runtime UI/API say provider management
  - no admin-specific context or warning is shown before redirecting
- Risk Level: High
- Evidence from code/runtime structure: `apps/web-app/src/app/admin/users/page.tsx`, `apps/web-app/src/app/provider/management/page.tsx`, `apps/backend/routes/api/admin/users.js`, `apps/backend/routes/api/provider.js`
- Suspected Failure Mode: admins expect canonical admin user operations but are silently routed into a provider-PROVIDER management surface with different API scope and role vocabulary
- What to inspect next: whether `/api/admin/users` is intended to replace `/api/provider` for this route

[Frontend Audit Item]
- ID: FA-ADM-004
- Portal: Admin Portal
- Route/Page: `/admin/settings`
- Main Components: `apps/web-app/src/app/admin/settings/page.tsx`
- Expected User/Role: admin managing system settings
- API/Dependency Used: server redirect to `/provider/settings/system`
- Findings:
  - route is an alias to the provider system-settings page rather than an admin-native settings surface
  - redirect hides the fact that runtime behavior depends on provider layout, provider nav, and provider optimistic state logic
  - backend also has admin config surfaces, but the frontend route does not use them directly
  - no route-level explanation is given for the alias behavior
- Risk Level: High
- Evidence from code/runtime structure: `apps/web-app/src/app/admin/settings/page.tsx`, `apps/web-app/src/app/provider/settings/system/page.tsx`, `apps/backend/routes/api/system-config.routes.js`, `apps/backend/routes/api/admin/config.js`
- Suspected Failure Mode: admins believe they are using a dedicated admin settings page while the runtime actually depends on a provider-owned configuration UI with different navigation and state assumptions
- What to inspect next: whether `/api/admin/config` is deprecated or simply unused by the frontend

[Frontend Audit Item]
- ID: FA-ADM-005
- Portal: Admin Portal
- Route/Page: `/admin/planting`
- Main Components: `apps/web-app/src/app/admin/planting/page.tsx`
- Expected User/Role: admin monitoring planting integrity read-only
- API/Dependency Used: localStorage `provider_token`, raw fetch to `/api/admin/planting-cycles?page=1&limit=100`
- Findings:
  - route uses raw fetch plus localStorage token instead of a shared admin/provider API client
  - loading, error, and empty states exist, which is better than several alias pages
  - admin page remains read-only and consistent with backend intent, but token handling is still client-local
  - button navigation to detail is explicit and valid
- Risk Level: Medium
- Evidence from code/runtime structure: `apps/web-app/src/app/admin/planting/page.tsx`, `apps/backend/routes/api/admin/planting.js`
- Suspected Failure Mode: page behavior is mostly coherent, but stale or missing localStorage auth can break the route even though middleware/cookies already exist as the main route guard
- What to inspect next: whether admin pages should share the same API helper/session layer as provider pages

[Frontend Audit Item]
- ID: FA-ADM-006
- Portal: Admin Portal
- Route/Page: `/admin/planting/[id]`
- Main Components: `apps/web-app/src/app/admin/planting/[id]/page.tsx`
- Expected User/Role: admin reviewing a specific planting cycle
- API/Dependency Used: localStorage `provider_token`, raw fetch to `/api/admin/planting-cycles/:id` and `/api/admin/planting-cycles/:id/plot-qrs`
- Findings:
  - route has working load/error/read-only summary flow, but still depends on raw fetch and localStorage token transport
  - summary panel contains invalid nested `<p>` markup across multiple rows, which is a hydration/render integrity risk
  - route does not use `notFound()` or a stronger missing-record boundary; it falls back to alert/error text in-place
  - tabs are simple and coherent, but state is entirely client-driven
- Risk Level: Medium
- Evidence from code/runtime structure: `apps/web-app/src/app/admin/planting/[id]/page.tsx`, `apps/backend/routes/api/admin/planting.js`
- Suspected Failure Mode: admin detail page renders unstable markup or hydration warnings, and broken auth/data state resolves into a generic in-page error instead of a clearer route-level failure
- What to inspect next: runtime browser rendering of the summary tab and whether similar invalid markup exists in other admin pages

Admin Portal summary:
- routes checked:
  - `/admin/*` shared shell
  - `/admin/dashboard`
  - `/admin/users`
  - `/admin/settings`
  - `/admin/planting`
  - `/admin/planting/[id]`
- routes not yet checked:
  - none within the requested Admin Portal scope
- portal-level risk concentration:
  - admin URL space is partly a facade over provider-owned pages, especially `/admin/users` and `/admin/settings`
  - route protection is middleware-heavy while page-level auth/session handling remains inconsistent
  - admin planting pages are the clearest native admin runtime, but still use raw fetch and localStorage token transport
  - for deeper confirmation on alias ownership and config migration intent, `ต้องเปิดดูไฟล์/route/component เพิ่ม` around admin-vs-provider responsibility boundaries
