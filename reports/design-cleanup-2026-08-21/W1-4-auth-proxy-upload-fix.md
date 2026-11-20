# W1-4 — auth proxy destroys uploads — 2026-08-22

Status: DONE(probe: manual jest + tsc + eslint + live proofs, this session)

## Root cause (file:line)

`apps/web-app/src/app/api/auth/health/[...path]/route.ts` is what Next.js selects
over the generic `src/app/api/[...path]/route.ts` for every `/api/auth/health/*`
request (more-specific segment wins). Its `forwardToBackend`/`POST` (pre-fix,
lines ~23-24, ~98-104) had three defects, duplicated byte-for-byte in
`src/app/api/auth/provider/[...path]/route.ts` (~lines 26-27, 117-123):

1. `headers['Content-Type'] = 'application/json'` hardcoded — overwrote the
   multipart boundary on every request.
2. `POST` did `await request.json()` and set `body = undefined` in the
   `catch` — a multipart body always throws there, so it was silently
   dropped.
3. Only `Cookie`, `X-Forwarded-For`, `X-Real-IP`, `Forwarded`, `User-Agent`,
   `X-Request-ID` were forwarded — never the incoming `Authorization`
   header, so Bearer-token clients (Flutter app, scripts, tests) got
   `401 NO_TOKEN` from `apps/backend/middleware/auth-middleware.js:425-426`
   even with a valid token.

Backend confirms the priority: `authenticateHealth` reads
`req.cookies?.auth_token` first, `Authorization` header second
(`auth-middleware.js:424-427`); `authenticateProvider` is the same shape for
`provider_token` (`~569-576`). A fourth, related gap surfaced during live
proof (c): neither route forwarded `x-csrf-token`, so a cookie-authenticated
POST (the double-submit CSRF check in
`apps/backend/middleware/csrf-middleware.js`, which activates whenever
`auth_token`/`provider_token` is present) 403'd with `CSRF_MISMATCH` even
after the header fix. `src/app/api/auth/change-password/route.ts` already
forwarded this header — the health/provider routes never did.

## Fix and the one-implementation decision

Extracted the identical header/body/response logic that was pasted twice
into `apps/web-app/src/app/api/auth/_lib/proxy-forward.ts`
(`buildForwardHeaders`, `readForwardBody`, `parseBackendBody`,
`buildProxyResponse`, `getSetCookieHeaders`). Both
`auth/health/[...path]/route.ts` and `auth/provider/[...path]/route.ts` now
import from it — ONE implementation for what was two copies of the same bug.

`buildForwardHeaders` copies the incoming `Content-Type` verbatim (defaults
to JSON only when absent), forwards `Authorization` when present or maps
the named auth cookie (`auth_token` / `provider_token`) to a Bearer header
otherwise, keeps the raw `Cookie` header forward, and now also forwards
`x-csrf-token`. `readForwardBody` reads the body once via
`request.arrayBuffer()` — buffered, not streamed, because each route's
`forwardToBackend` retries across multiple backend URL candidates
(`getBackendCandidates()`) and a `ReadableStream` can only be consumed once;
an `ArrayBuffer` can be reused per retry attempt while still carrying the
exact original bytes (no `request.json()` round-trip).

Chose NOT to delegate to the generic proxy's `proxyRequest`
(`src/app/api/[...path]/route.ts`) itself: it has materially different
behavior (single backend URL, no timeout/AbortController, no
multi-candidate retry, no `X-Forwarded-For`/`User-Agent`/etc. forwarding,
no Set-Cookie passthrough) that the health/provider routes rely on. Folding
health/provider into it would mean changing that shared, widely-used file's
behavior for every other `/api/*` route — a bigger, riskier change than the
task's "if extraction stays small" bar. `src/app/api/[...path]/route.ts`
was left untouched.

## RED then GREEN

`route.test.ts` written for both routes first; ran against the unfixed code:
6 failures for the exact expected reasons (Content-Type overwritten,
Authorization not forwarded, cookie not mapped) — `Content-Type` came back
as `"application/json"` instead of the multipart boundary, `Authorization`
came back `undefined`. Added the CSRF-forwarding line separately, disabled
it, reran just that test (RED: `Authorization`... `x-csrf-token` →
`undefined`), then restored it (GREEN). Full suite after fix:

```
Test Suites: 6 passed, 6 total
Tests:       30 passed, 30 total
```
(covers `src/app/api` — health/provider proxy tests, change-password, generic proxy)

## Live proofs (real commands, real output)

Registered a fresh health user via `POST :8000/api/auth/health/register`
(mod-11-valid synthetic Thai ID) since no seeded credentials existed.

- (a) `POST :3000/api/auth/health/login` → `200`, `Set-Cookie: auth_token=...; refresh_token=...; csrf_token=...` (HttpOnly). No `next dev` restart needed — the dev server hot-picked up the route/module changes.
- (b) `POST :3000/api/auth/health/me/avatar` with `Authorization: Bearer <accessToken>`, multipart PNG → `200`, `data.profileImage` returned; file confirmed on disk at `apps/backend/public/uploads/<name>.png`, 70 bytes, matching the fixture.
- (c) Same endpoint with a curl cookie jar (`auth_token`/`csrf_token` cookies, `x-csrf-token` header) instead of Bearer → `200`; file confirmed on disk. (First attempt without `x-csrf-token` forwarding returned `403 CSRF_MISMATCH` — this is what surfaced defect #4 above.)
- (d) 2.5 MB PNG (2,621,440 bytes) via `:3000` with Bearer → `200`; file on disk is 2,621,440 bytes — exact match, multer's 20 MB limit not hit.

All four requests were served by the running `:3000`/`:8000` stack; uploaded
files are under `apps/backend/public/uploads/` (gitignored, left in place).

## Verification

- `npx tsc --noEmit -p tsconfig.json`: 62 lines of errors, all inside the
  pre-existing `e2e-phase0/*.spec.ts` baseline — zero new lines.
- `npx eslint` on `src/app/api/auth/**/*.ts`: clean, zero output.
- `jest src/app/api`: 6 suites / 30 tests passed (includes the two new route
  test files, the pre-existing generic-proxy and change-password suites).

## Provider route verdict

`src/app/api/auth/provider/[...path]/route.ts` had the identical defect
(same hardcoded Content-Type, same `request.json()` body-eating catch, no
Authorization/`x-csrf-token` forwarding) and is fixed the same way, sharing
the same `_lib/proxy-forward.ts` helper. Its local `set-cookie` branch
(plain-JSON, never forwarded to the backend) was left untouched and is
covered by a regression test.

## Files

- `apps/web-app/src/app/api/auth/_lib/proxy-forward.ts` (new — shared helper)
- `apps/web-app/src/app/api/auth/health/[...path]/route.ts` (fixed)
- `apps/web-app/src/app/api/auth/health/[...path]/route.test.ts` (new)
- `apps/web-app/src/app/api/auth/provider/[...path]/route.ts` (fixed)
- `apps/web-app/src/app/api/auth/provider/[...path]/route.test.ts` (new)

Next: none blocking. Not fixed (pre-existing, out of scope): the generic
proxy's binary GET response passthrough goes through `.text()`/`String()`
in `parseBackendBody`/`buildProxyResponse`, which would corrupt a binary
GET response body if one existed on these routes — no such GET endpoint is
in use today (avatar is fetched by static `/uploads/*` URL, not through this
proxy), so left alone rather than expanding scope.
