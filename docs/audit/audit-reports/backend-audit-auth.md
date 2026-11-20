# Phase 3 Backend Audit - Auth

[Backend Audit Item]
- ID: AUTH-01
- Endpoint/Module: `/api/auth/health/login`
- Controller/Service/Middleware: `routes/api/auth-health.js` -> `authController.login` -> `services/prisma-auth-service.js::login` -> `middleware/auth-middleware.js`
- Expected Role: `health`
- DB/Queue/External Dependency: `User` table, JWT access/refresh tokens, cookie session issuance
- Findings: The route is a health-only entry point at mount level, but the login service still accepts mixed identity inputs and checks `providerId` inside the shared login path. Validation is inline and minimal, so provider credentials can reach the health login controller before being rejected by service logic.
- Risk Level: Medium
- Evidence from code/runtime structure: `apps/backend/routes/api/auth-health.js` mounts `POST /login` to the generic auth controller; `apps/backend/services/prisma-auth-service.js` contains provider-path rejection logic inside the shared `login()` method instead of route-specific validation.
- Suspected Failure Mode: Frontend or BFF can post a provider-style payload to the health surface and receive service-layer rejection or inconsistent error semantics rather than a strict route-contract failure.
- What to inspect next: Open `apps/backend/controllers/auth-controller.js` and any login DTO validator files to confirm whether route-level schema validation exists elsewhere.

[Backend Audit Item]
- ID: AUTH-02
- Endpoint/Module: `/api/auth/health/refresh` and provider session refresh behavior
- Controller/Service/Middleware: `routes/api/auth-health.js` -> auth refresh handler -> `services/prisma-auth-service.js`; frontend contract in `apps/web-app/src/lib/services/auth-service.ts`
- Expected Role: `health` for health refresh; provider sessions should have a provider-specific refresh surface if supported
- DB/Queue/External Dependency: Refresh token verification, JWT secrets, `User` lookup
- Findings: Runtime exposes a health refresh path, but no matching provider refresh route was found under `/api/auth/provider/*`. The web app auth service uses `/api/auth/health/refresh` as the refresh path for both health and provider sessions, so route contract and session model do not align.
- Risk Level: High
- Evidence from code/runtime structure: `apps/backend/routes/api/auth-provider.js` exposes only `login`, `logout`, and `me`; `apps/web-app/src/lib/services/auth-service.ts` points refresh logic to `/api/auth/health/refresh`; `middleware/auth-middleware.js` separates health cookies (`auth_token`) from provider cookies (`provider_token`).
- Suspected Failure Mode: Provider sessions can fail silent refresh, loop back to login, or be refreshed against the wrong auth boundary depending on which token artifact the client presents.
- What to inspect next: Open any provider-only session utility used by Next route handlers in `apps/web-app/src/app/api/auth/provider/*`.

[Backend Audit Item]
- ID: AUTH-03
- Endpoint/Module: `/api/mfa/verify`
- Controller/Service/Middleware: `routes/api/mfa.js` -> MFA handlers -> audit logging utilities
- Expected Role: Provider user in an MFA challenge flow
- DB/Queue/External Dependency: MFA secret storage, audit log writes
- Findings: The verification endpoint is exposed without provider-auth middleware and accepts `userId` plus `code` directly. Inline validation checks presence/format, but no route-level rate limit, lockout, or challenge-binding was found in the runtime path inspected.
- Risk Level: High
- Evidence from code/runtime structure: `apps/backend/routes/api/mfa.js` protects setup and disable flows with provider auth, while `POST /verify` is the exception path; no dedicated throttling middleware or nonce/challenge middleware is mounted on that route in the inspected files.
- Suspected Failure Mode: Brute-force MFA attempts can target arbitrary user IDs, or a valid code can be replayed outside the original login challenge context.
- What to inspect next: Open the MFA secret persistence service and any shared rate-limit middleware to confirm whether throttling is implemented outside the route file.

