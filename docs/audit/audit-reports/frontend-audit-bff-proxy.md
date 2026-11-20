# Phase 2 Frontend Audit - BFF and Proxy Layer

Audit basis:
- runtime and code in `apps/web-app/src/app/api`
- shared backend URL resolution in `apps/web-app/src/config/server.config.ts`
- request behavior in `apps/web-app/src/lib/api/api-client.ts`
- session persistence in `apps/web-app/src/lib/services/auth-service.ts`

[Frontend Audit Item]
- ID: FA-BFF-001
- Portal: BFF / Proxy Layer
- Route/Page: `/api/[...path]`
- Main Components: `apps/web-app/src/app/api/[...path]/route.ts`
- Expected User/Role: generic web and mobile callers using the primary Next API proxy
- API/Dependency Used: `cookies()`, `INTERNAL_BACKEND_URL`, request body streaming, auth precedence `Authorization > auth_token > provider_token`
- Findings:
  - proxy auth precedence allows an explicit `Authorization` header to override both health and provider cookies, which broadens the chance of cross-context token confusion
  - proxy does not forward the incoming `Cookie` header to backend and instead reconstructs only an authorization bearer token from selected cookies
  - response returns only `Content-Type`, dropping other backend headers such as `Set-Cookie`, `Content-Disposition`, cache headers, and download metadata
  - route handles binary bodies and responses better than `/api/proxy`, but it still has no retry or timeout behavior
- Risk Level: High
- Evidence from code/runtime structure: `apps/web-app/src/app/api/[...path]/route.ts`, `apps/web-app/src/lib/api/api-client.ts`
- Suspected Failure Mode: file downloads or cookie-setting responses work incorrectly through the generic proxy, and callers can accidentally send the wrong auth identity when local header injection overrides cookie state
- What to inspect next: runtime consumers that expect preserved backend headers, especially PDF and file-download flows

[Frontend Audit Item]
- ID: FA-BFF-002
- Portal: BFF / Proxy Layer
- Route/Page: `/api/proxy/[...path]`
- Main Components: `apps/web-app/src/app/api/proxy/[...path]/route.ts`
- Expected User/Role: generic fallback proxy route for JSON API calls
- API/Dependency Used: `getBackendCandidates()`, JSON request parsing, backend retry loop, cookie/auth header passthrough
- Findings:
  - route always assumes JSON by setting `Content-Type: application/json` and parsing request bodies with `request.json()`, so multipart/form-data and other non-JSON payloads are not preserved
  - query parameters are appended only for `GET`; non-GET methods drop the original query string entirely
  - backend responses are always parsed as JSON and wrapped in `NextResponse.json`, so binary and non-JSON responses are degraded into synthetic JSON messages
  - no direct consumer of `/api/proxy/*` was found in the inspected `apps/web-app/src` tree
- Risk Level: Critical
- Evidence from code/runtime structure: `apps/web-app/src/app/api/proxy/[...path]/route.ts`, `apps/web-app/src/config/server.config.ts`, repo search for `/api/proxy/`
- Suspected Failure Mode: callers that rely on query parameters, uploads, or binary responses silently break through this proxy, and the route may remain untested because no active frontend consumer was found
- What to inspect next: whether this route is still intended for production traffic or is now legacy infrastructure

[Frontend Audit Item]
- ID: FA-BFF-003
- Portal: BFF / Proxy Layer
- Route/Page: `/api/auth/health/[...path]`
- Main Components: `apps/web-app/src/app/api/auth/health/[...path]/route.ts`
- Expected User/Role: health auth flows proxied through Next
- API/Dependency Used: `getBackendCandidates()`, forwarding headers (`Cookie`, `X-Forwarded-For`, `X-Real-IP`, `Forwarded`, `User-Agent`, `X-Request-ID`), `getSetCookieHeaders()`
- Findings:
  - health auth proxy is more robust than the generic proxies because it retries backend candidates, avoids self-proxy loops, and forwards multiple context headers
  - route only supports `GET` and `POST`, and request-body handling is JSON-only
  - proxy does not forward an incoming `Authorization` header, so any caller expecting bearer auth on these auth endpoints must rely on cookies or request body instead
  - backend outage is flattened into a generic `503 Auth service unavailable`, which hides backend status detail from the caller
- Risk Level: Medium
- Evidence from code/runtime structure: `apps/web-app/src/app/api/auth/health/[...path]/route.ts`, `apps/web-app/src/config/server.config.ts`
- Suspected Failure Mode: health auth flows generally work, but less common endpoints needing non-JSON payloads or bearer-header forwarding fail in ways that collapse into a generic service-unavailable state
- What to inspect next: actual consumers of `GET /api/auth/health/*` beyond login/refresh/logout paths

[Frontend Audit Item]
- ID: FA-BFF-004
- Portal: BFF / Proxy Layer
- Route/Page: `/api/auth/provider/[...path]`
- Main Components: `apps/web-app/src/app/api/auth/provider/[...path]/route.ts`
- Expected User/Role: provider auth flows proxied through Next
- API/Dependency Used: `getBackendCandidates()`, provider auth backend forwarding, local `set-cookie` branch for `provider_token`
- Findings:
  - provider auth proxy does not preserve the incoming query string when forwarding requests to backend
  - route supports only `GET` and `POST`, with JSON-only body parsing
  - unlike the health auth proxy, it forwards fewer contextual headers and has a dedicated local `set-cookie` branch that duplicates session-cookie behavior already present elsewhere
  - local `set-cookie` handling writes `provider_token` as `httpOnly: false` and `secure: false`, which keeps it readable but weakens boundary consistency
- Risk Level: High
- Evidence from code/runtime structure: `apps/web-app/src/app/api/auth/provider/[...path]/route.ts`, `apps/web-app/src/app/api/session/set-cookie/route.ts`, `apps/web-app/src/app/api/auth/set-session-cookie/route.ts`
- Suspected Failure Mode: provider auth endpoints that depend on query params or stronger cookie semantics behave inconsistently, and session-cookie behavior drifts because multiple routes can set essentially the same cookie
- What to inspect next: whether any provider auth callback or redirect flow currently depends on dropped query parameters

BFF / Proxy summary:
- routes checked:
  - `/api/[...path]`
  - `/api/proxy/[...path]`
  - `/api/auth/health/[...path]`
  - `/api/auth/provider/[...path]`
- routes not yet checked:
  - none within the requested BFF / Proxy scope
- layer-level risk concentration:
  - overlapping proxy routes implement different rules for headers, cookies, bodies, retries, and query handling
  - `/api/proxy/*` is the most fragile route family and has no confirmed active consumer in the inspected frontend tree
  - auth cookie/session handling is duplicated across dedicated proxy branches and separate session-cookie routes
  - for deeper confirmation around live traffic paths and duplicate cookie setters, `ต้องเปิดดูไฟล์/route/component เพิ่ม` in current login/logout consumers and any external clients using `/api/proxy/*`
