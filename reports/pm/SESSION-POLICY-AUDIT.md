# SESSION POLICY AUDIT (A-lane, read-only)

**Owner:** PM · **Date:** 2026-08-05 · **Method:** read-only research workflow (3 agents, file:line-verified) · **Base:** main HEAD 266cb35b
**Scope:** operator FYI 2026-08-05 — session mechanism, role split, remember-me proposal vs AUTH-01 cutover. Propose only; nothing implemented.

---

## 1. Session mechanism (from code)

Session = **JWT in an httpOnly cookie** (no server session store; stateless). Four cookies:

| cookie | audience | httpOnly | Secure | sameSite | path | maxAge | domain |
|---|---|---|---|---|---|---|---|
| `auth_token` (access) | health | ✅ | `isSecureCookie()` | lax | `/` | **24h** | none (host-only) |
| `refresh_token` | health only | ✅ | `isSecureCookie()` | lax | `/` | **7d** | none |
| `provider_token` (access) | provider | ✅ | `isSecureCookie()` | lax | `/` | **8h** | none |
| `csrf_token` (double-submit) | health only | ❌ (by design) | `isSecureCookie()` | lax | `/` | 24h | none |

Sources: `apps/backend/controllers/auth-controller/auth-controller.js:17-61` (setAuthCookies/setCsrfCookie) · `routes/api/auth/auth-provider.js:245-252` · `utils/cookie-security.js:16-21`.

- **JWT TTLs**: health access `24h` (`jwt-security.js:130`), provider access `12h` (`:121`), refresh `7d` hard-coded (`:204-211`, no env override).
- **Refresh (health)**: real server route `POST /auth/health/refresh` (`auth-health.js:134`) — single-use rotation + Redis reuse-detection/blocklist (`auth-session-security-handlers.js:435-499`). Client auto-refresh timer fires 5 min before expiry with bounded backoff (`auth-service.ts:370-512`).
- **No `domain`** attribute → host-only cookies (no subdomain sharing).

## 2. Role split — health (farmer) vs provider (staff): **different by design**

| | Health (เกษตรกร) | Provider (เจ้าหน้าที่) |
|---|---|---|
| access cookie | `auth_token` **24h** | `provider_token` **8h** |
| access JWT TTL | 24h | 12h |
| refresh | `refresh_token` 7d + rotation + reuse-detection + client auto-refresh | **NONE — by design**; re-login on expiry (`auth-service.ts:442-449` "Provider session refresh is disabled"; `auth-idp.js:219-221`) |
| csrf_token | set at login | **NOT set** (see gap G4) |
| httpOnly / secure / sameSite | identical (shared `isSecureCookie()`, lax, httpOnly) | identical |

So the two audiences already have **very different session lengths** — health is long+refreshable, provider is short+no-refresh. The operator's target ("staff short session, citizens optional 7-day") is **half-built already**: provider is short; health is *already 7-day unconditionally* (see §4).

## 3. Gaps found (security-relevant)

| # | gap | evidence | severity |
|---|---|---|---|
| G1 | **No server-side idle/inactivity timeout** for either role — sessions live their full absolute TTL regardless of inactivity. The only 30-min idle timeout is **client-side JS** (localStorage + timers), bypassable by any direct API/cookie replay | `auth-service.ts` (client-only); no backend equivalent | **medium** |
| G2 | **No absolute session-lifetime cap for health** — every `/refresh` mints a fresh 7-day refresh token, so an active tab keeps a session alive **indefinitely** | `jwt-security.js:204-211` + rotation `auth-session-security-handlers.js:481` | medium |
| G3 | **Secure flag conditional on `NODE_ENV==='production'`** — staging (NODE_ENV=staging/unset) gets **non-Secure cookies** unless `COOKIE_SECURE=true` is set. Worse, the Next.js BFF re-implements the same policy **independently** (`session-cookie.ts:13-22`) with **no override env** → BFF cookies non-Secure on staging regardless | `utils/cookie-security.js:16-21` + `apps/web-app/src/app/api/session/session-cookie.ts:13-22` | **medium (staging exposure)** |
| G4 | **Provider flows set no `csrf_token`** — if any provider mutation route relies on the double-submit csrf cookie the way health routes do, that protection is absent at issuance (⚠ **unverified** — needs a check of what the CSRF middleware requires on provider routes) | `auth-provider.js`/`auth-idp.js` (no setCsrfCookie call) | **flag — verify** |
| G5 | **MFA-completion hard-codes 8h cookie maxAge regardless of role** — a health MFA user gets a 24h JWT in an 8h cookie (cookie expires before the token); provider gets 12h token in 8h cookie | `routes/api/identity/mfa.js:548-581` | low (inconsistency) |
| G6 | **provider_token cookie 8h < provider JWT 12h** — cookie drops 4h early; the two knobs drift (one env-configurable, one hard-coded literal duplicated in 2 files) | `auth-provider.js:250`, `auth-idp.js:65-66` | low |
| G7 | **BFF `session-cookie.ts` hard-codes 7d maxAge** for auth_token/provider_token — already inconsistent with the backend's 24h/8h | `session-cookie.ts:13-23` | low (drift) |

## 4. "จดจำฉันไว้" (remember-me) proposal — scope + estimate (propose only)

**Baseline reality that changes the framing:** there is **no short/long distinction to opt into today** — every health login *already* gets the 7-day refresh cookie unconditionally. So the opt-in requires **inventing a new SHORT default for the unchecked case**, not adding a long option. Provider is already short with no refresh (matches the "staff short" goal — no change needed there).

Files a health-only 7-day opt-in (short default when unchecked) would touch:

| file | change | size |
|---|---|---|
| `auth-controller.js` (setAuthCookies) | cookie maxAge from a rememberMe flag | S |
| `jwt-security.js` generateRefreshToken | **add a TTL-override param (none today)** | S |
| `auth-session-security-handlers.js:408-481` | the `/refresh` claim allowlist must **carry `rememberMe`** across rotation or it silently resets to default on first refresh (PDPA-leak-hardened allowlist — must be explicit) | M |
| health login UI (`auth/_components/health-login-page.tsx`) | the checkbox | S |
| `auth-service.ts` | refresh-timer respects the chosen length | S |
| `session-cookie.ts` (BFF) | keep its hard-coded 7d in sync with the chosen policy | S |
| naming | a dead localStorage "remember me" (identifier-only) already occupies the name → collision risk | — |

## 5. Sequencing vs AUTH-01 OAuth cutover — **recommendation: do it WITH E-4/P3, not before**

**E-4 / P3 (session hardening → cookie-only) is UNBLOCKED and is the immediate next step in the AUTH-01 pipeline** (P1, P2 merged — `evidence/AUTH-01/plan.md:23-27`, `orchestration-log.md`). P3 strips localStorage token/refresh/user usage entirely and switches `isAuthenticated()` to ask the server `/me` instead of decoding a local JWT.

Three things all touch the **same session layer**, so doing them separately = rewriting it 2-3×:
1. **Remember-me** (§4) — cookie maxAge + refresh TTL + claim allowlist + FE session logic.
2. **The login-page-redirect-when-authenticated** (operator case 2 / small task 3) — the middleware block that redirects a logged-in user off `/auth/health/login` is **deliberately disabled** (`middleware.ts:191-192`: "Keep disabled to avoid redirect loops when localStorage is empty in another tab") — i.e. it is disabled **because** the session is localStorage-primary. **E-4/P3 (cookie-only) is exactly what makes it safe to re-enable.**
3. **E-4/P3** — the cookie-only migration itself.

**PM recommendation:** fold remember-me + the login-page redirect **into E-4/P3** (or immediately after it on the same session layer). Doing remember-me or the redirect *before* the cookie-only migration reintroduces the redirect-loop bug and forces a second FE session rewrite. Also close G3 (Secure-on-staging) opportunistically in the same pass, since P3 already touches both the backend cookie helper and the BFF `session-cookie.ts`.

---

## 6. Answers to the operator's conditional small tasks (from code, since test results were left blank)

- **Case 2 / small task 3** (logged-in user hits bare URL → nginx 302 → `/auth/health/login`): they **see the login page** (not forwarded to dashboard) — the auto-redirect is disabled at `middleware.ts:191-192`. Task 3 is real **but coupled to E-4** — fold it in (§5), do not do it standalone.
- **Case 3 / small task 4** (logo target): the **dashboard logo already points to `/${role}/dashboard`** (`dashboard-layout.tsx:223`) — correct. Only the **marketing header** logo goes to `/` (`marketing-header.tsx:38`) — low priority, only affects a logged-in user on a marketing page.

## 7. Suggested follow-up tasks (for the operator to prioritize)

- **[merge into E-4/P3]** remember-me (health opt-in 7d / short default) + re-enable login-page redirect + close G3 Secure-on-staging.
- **[verify then maybe fix]** G4 provider csrf — check the CSRF middleware's actual requirement on provider mutation routes.
- **[small hygiene]** G5/G6/G7 maxAge inconsistencies (MFA 8h; provider 8h<12h; BFF 7d) — align once, ideally in the E-4 pass.
- **[decision]** G1/G2 — does the platform want a server-side idle timeout and/or an absolute session cap? Currently neither exists server-side.
