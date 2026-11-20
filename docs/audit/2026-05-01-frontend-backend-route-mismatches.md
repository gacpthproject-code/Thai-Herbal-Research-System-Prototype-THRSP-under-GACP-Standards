# Frontend/Backend Route Mismatch Audit — 2026-05-01

> Triggered by Phase 53–56 (Wave B G6) shipping with a frontend that
> called `/api/provider` while the backend mounted the same routes at
> `/api/provider/directory`. The G6 management page table was empty in
> production for several PRs before anyone noticed. Phase 57 fixed
> that specific path; this audit hunts down the same class of bug
> elsewhere in the app.

## Method

1. Enumerated every unique path passed to `apiClient.get/post/put/
   delete/patch` from `apps/web-app/src/**/*.{ts,tsx}` (92 unique paths).
2. Probed each top-level prefix against `https://gacpth.com/api/...`
   with the actual HTTP method the frontend uses, distinguishing four
   response classes:
   - **200/400/401/403/405** → route exists, handler ran (good — auth
     or validation lives in the handler).
   - **404 with JSON body** → route exists, handler returned 404 for
     missing data (good — that's an application-level decision).
   - **404 with HTML "Cannot GET …" body** → Express 404, route is
     unmounted (bad — true route-mismatch).
   - **5xx** → handler exception (out of scope here).
3. Inspected the response body of every 404 to separate route-missing
   from data-missing.

## Findings

### Group A — Gated behind `ENABLE_PROVIDER_LEGACY_ALIAS`

`apps/backend/routes/api/index.js:186-190` mounts three router files
only when the env flag is `'true'`. The flag defaults to `false` and
is not set in production:

```js
if (process.env.ENABLE_PROVIDER_LEGACY_ALIAS === 'true') {
    router.use('/provider-cms', require('./system/provider-cms'));
    router.use('/wizard', require('./applications/wizard'));
    router.use('/admin', require('./admin'));
}
```

The flag was added per the duplicate-surface inventory
(`docs/architecture/duplicate-surface-inventory.md` Group D4) to gate
deprecated routes during the canonical-path migration. But the
frontend still wires several admin pages directly at `/admin/…`:

| Frontend file | Path called | Page | Impact |
| :--- | :--- | :--- | :--- |
| `lib/services/admin-service.ts` | `GET /admin/plants` | Master-data plants | List empty in UI |
| `lib/services/admin-service.ts` | `POST /admin/plants` | Master-data plants | Create silently fails |
| `lib/services/admin-service.ts` | `PATCH /admin/plants/:id` | Master-data plants | Update silently fails |
| `lib/services/admin-service.ts` | `DELETE /admin/plants/:id` | Master-data plants | Delete silently fails |
| `lib/services/admin-service.ts` | `GET /admin/config` | Master-data config | List empty |
| `lib/services/admin-service.ts` | `PATCH /admin/config/:key` | Master-data config | Update silently fails |
| `app/admin/planting/page.tsx` | `GET /admin/planting-cycles?…` | Admin planting list | Empty list |
| `app/admin/planting/[id]/page.tsx` | `GET /admin/planting-cycles/:id` | Admin planting detail | Detail page broken |
| `app/admin/planting/[id]/page.tsx` | `GET /admin/planting-cycles/:id/plot-qrs` | Admin planting detail | QR list broken |

**Recommendation**: pick one of three resolutions for each path —
1. Move handler from `routes/api/admin/*` to a non-gated mount
   (e.g. under `/api/provider/admin/…` which is already wired and
   admin-protected).
2. Keep handler under `/api/admin/*` and remove the env gate so the
   route is always mounted (and rely on `requireAdmin` middleware
   inside `admin/index.js` for protection).
3. Confirm the page is intentionally retired, mark the page as
   read-only/dead, and remove the call sites.

### Group B — Path prefix doubled in cultivation/plant-units.js

`apps/backend/routes/api/cultivation/plant-units.js` is mounted at
`/api/plant-units` (index.js line 156) but every route inside the
file already starts with `/plant-units/` or `/planting-cycles/`:

```js
// Mount: router.use('/plant-units', require('./cultivation/plant-units'))
// File:  router.post('/plant-units/:id/confirm-planting', ...)
// Result URL: /api/plant-units/plant-units/:id/confirm-planting   ← double
```

Frontend calls `/plant-units/:id/confirm-planting`, which proxies to
`/api/plant-units/:id/confirm-planting` — the un-doubled path. No
handler matches, so every plant-unit lifecycle action returns 404:

| Frontend file | Path called |
| :--- | :--- |
| (planting confirm flow) | `POST /plant-units/:id/confirm-planting` |
| (planting confirm flow) | other `/plant-units/:id/*` actions |

**Recommendation**: drop the inner `/plant-units` and `/planting-cycles`
prefixes inside `cultivation/plant-units.js`. The mount already adds
`/plant-units` for the unit-keyed routes, and the cycle-keyed routes
should move to `cultivation/planting-cycles` (where they conceptually
belong) or get mounted under a separate `/planting-cycles` mount.

### Group C — Frontend calls a path with no backend mount

| Frontend file | Path called | Notes |
| :--- | :--- | :--- |
| `app/health/establishments/new/client-view.tsx:32` | `POST /establishments` | Inline `// Note: Verify endpoint` comment shows the developer was uncertain. Backend has no `/api/establishments` mount. The closest is `/api/farms` (line 150). |

**Recommendation**: rename the call to `/farms` or remove the
establishments/new page if it's superseded by `/health/farms/new`.

### Group D — Documented but not actually called

| Reference | Where |
| :--- | :--- |
| `/api/users/me` | Only in `lib/api/api-client.ts:12` JSDoc example. Not called anywhere. |
| `/api/consumer-feedback` GET | Backend defines POST `/` and GET `/:certificateId`; frontend only calls POST and GET-by-id. The bare GET 404 in my probe was just absence of a list endpoint, which is intentional. |

**Recommendation**: leave Group D alone. `users/me` JSDoc could be
updated to point at `/auth/health/me` or `/auth/provider/me` to avoid
copy-paste hazards, but it's not breaking anything.

## Phase 57 status

`fix(web): Wave B Phase 57 - point provider directory calls at
canonical /provider/directory mount` (commit `6d50ead`) — fixes the
Group A / B / C issues for the provider-directory namespace only:

- 6 path corrections in `apps/web-app/src/app/provider/management/page.tsx`
- 1 path correction in `apps/web-app/src/app/provider/scheduler/reassign/page.tsx`

Pre-fix: `GET /api/provider` → 404 Express, table empty.
Post-fix: `GET /api/provider/directory` → 401 (auth), table populates.

This audit is the follow-up that scopes the remaining mismatches.

## Suggested rollout

Phase 58 (this doc) — landing as a tracking artifact, no code change.

Phase 59 (Group A — admin master data): unblock the master-data and
admin-planting pages. Recommended path: option (1) — move the four
admin sub-routers under `/api/provider/admin/…` so they ride the
existing `requireAdmin` middleware in `routes/api/provider/admin.js`.
This avoids both the env-gate and the legacy-alias semantics.

Phase 60 (Group B — plant-units double prefix): rename routes inside
`cultivation/plant-units.js` to drop the inner prefix. Audit log for
any caller that bypassed the proxy and used the doubled path
directly (e.g. cron, integration tests).

Phase 61 (Group C — establishments): decide the page's fate.

## How to prevent recurrence

A unit test that loads the canonical Express app, walks every
`apiClient.*` call site in `apps/web-app/src/**`, and asserts the
backend has a matching route handler. The route-naming-policy test
(`apps/backend/__tests__/unit/route-naming-policy.test.js`) already
walks the route directory; extending it to cross-reference frontend
call sites would have caught the G6 mismatch before it shipped.

A lighter version: a CI check that greps `apiClient\.\w+\(['"\\\`](/[^'"\`]+)` from
the frontend and runs each unique path through `app._router.stack`
to confirm a handler exists. Keep on the staging deploy job — fast,
no runtime cost on prod.
