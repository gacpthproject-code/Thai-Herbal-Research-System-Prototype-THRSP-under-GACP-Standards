# Auth / Identity Subsystem — Adversarial Audit

Date: 2026-08-16 · Scope: login/auth/identity only · Method: **static read-only code audit** — no server was started, no request was fired, no DB was queried. Every claim below is a code-reading deduction with file:line evidence, not a demonstrated runtime exploit. Where the true answer depends on a live environment variable or live Postgres data that is not in this repository, it is marked **PENDING** per L1 (evidence-or-silence) rather than guessed.

---

## 1. Auth flow map

**Login surfaces** (three independent code paths, not one):

| Path | Endpoint | Identity check | File |
|---|---|---|---|
| Health (citizen) direct login | `POST /api/auth/health/login` | self-typed 13-digit ID + password vs Postgres | `apps/backend/routes/api/auth/auth-health.js:60`, `apps/backend/services/prisma-auth-service.js:260-452` |
| Provider (officer) direct login | `POST /api/auth/provider/login` | self-typed 13-digit ID + password vs Postgres | `apps/backend/routes/api/auth/auth-provider.js:34-291` |
| OAuth IdP (ThaID / Provider ID) | `POST /api/auth/idp/:provider/authorize-url` + `/callback` | real OAuth2 authorization-code | `apps/backend/routes/api/auth/auth-idp.js:1-420` |

Both direct-login routes: bcrypt compare (cost 12, `password-management.js:18`, `prisma-auth-service.js:33` — OWASP baseline), per-account lockout after 5 failed attempts / 15-min cooldown (`prisma-auth-service.js:376-390`; provider portal's lockout was a documented historical gap, closed per `auth-provider.js:124-145`), optional TOTP/email-OTP 2FA gate before token issuance (`auth-provider.js:178-224`, `prisma-auth-service.js:404-424`), rate-limited via `authLimiter` (5/15min, Redis-or-memory, `middleware/rate-limiter.js:141-145`) — confirmed wired at the server boundary (Swagger doc `auth-health.js:57-58`; limiter module exists and is imported across the codebase, `Grep` hit in `server.js`).

**Session/JWT**: HS256, **separate secrets per portal** (`HEALTH_JWT_SECRET`/`JWT_SECRET` vs `PROVIDER_JWT_SECRET`/`DTAM_JWT_SECRET`), refuse-boot in production if either secret is missing, loud `logger.error` (not silent, not refuse-boot) if the two secrets are identical (`apps/backend/config/jwt-security.js:59-95`). Dev-only fallback secret is an obviously-fake string, gated to `NODE_ENV∈{development,test}` (`jwt-security.js:97-117`). JWT payload deliberately **excludes** the national ID — `req.user.healthId/providerId/canonicalId` are re-resolved server-side from the DB after verification (`middleware/auth-middleware.js:156-207`, `prisma-auth-service.js:426-432`). Session cookies are `httpOnly, secure (prod), sameSite=lax` (`auth-controller.js:39-61`, `auth-provider.js:246-252`). Session-epoch invalidation: `sessionsRevokedAt` stamped on every password change/reset; any token with `iat` before that instant is rejected even if never individually blocklisted (`auth-middleware.js:209-228`, `password-management.js:49-56`). Redis-backed JTI revocation blocklist is checked **before** the DB lookup on every protected call (`auth-provider.js:381-398`). No session-fixation issue found: tokens are minted fresh per login (`issueTokensForAuthenticatedUser`, `prisma-auth-service.js:475-522`), no pre-auth session ID is reused post-auth.

**Logout**: clears `auth_token`/`refresh_token`/`csrf_token` cookies and blocklists the JTI server-side (`auth-session-security-handlers.js` — 8+ `clearCookie('csrf_token', ...)` call sites; provider logout at `auth-provider.js:299-316` calls `revokeSessionFromRequest`). **Refresh**: rotates tokens and re-mints the CSRF cookie (`auth-session-security-handlers.js:481-519`).

**Verdict on this layer**: mechanically solid, above-average for the codebase. No plaintext password storage, no obvious JWT misuse, no missing rate-limit, no session fixation. The real problems are one layer up — *who* is allowed to claim a given national ID in the first place (§3) — and in the data-protection layer underneath it (§4).

One low-severity code smell: `apps/backend/routes/api/auth/auth-provider.js:105` — `if (!['PROVIDER', 'PROVIDER'].includes(...))`, a duplicated array literal, almost certainly leftover from an edit. Functionally harmless (still only admits `'PROVIDER'`) but signals unreviewed copy-paste in a security gate.

---

## 2. DB tables (`apps/backend/prisma/schema/*.prisma`)

Core identity model is coherent and reasonably complete:

- **`User`** (`auth.prisma:3-284`) — one row per Thai citizen. Carries `healthId`/`providerId` (mutually exclusive, enforced by CHECK `users_single_identity_ck`, `migrations/20260207120000_identity_guardrails/migration.sql:16-19`, `NOT VALID` so pre-existing rows aren't retroactively checked), lockout fields, 2FA fields, session-epoch field, PDPA retention/legal-hold/anonymization fields, and ~15 explicitly `@deprecated` legacy company/community columns (`auth.prisma:83-102`) that are documented migration debt, not silent rot.
- **`Entity`** (`entity.prisma:28-116`) — the legal-applicant model (INDIVIDUAL/JURISTIC/COMMUNITY_ENTERPRISE), separate from `User`. One citizen can own/manage multiple entities via **`EntityMembership`** (`entity.prisma:118-162`, roles OWNER/ADMIN/MANAGER/VIEWER). This User-vs-Entity split (Wave B Phase 62/66/67) is a legitimate, well-reasoned design for "farm has employees" / multi-applicant-per-person cases — not a defect.
- **`RoleGroup`/`UserGroupMembership`** (`user-groups.prisma`), **`UserPermissionGrant`** (`user-permission-grants.prisma`), **`EntityMemberPermissionGrant`** (`entity-member-permission-grants.prisma`) — a coherent, consistently-templated GRANT/REVOKE overlay on top of role baselines, read live per request (not baked into the JWT), REVOKE-wins semantics. No structural issue found.
- **`IdentityLink`** (`auth.prisma:330-363`) — the OAuth-IdP linking table (`provider` ∈ {local, healthid, providerid, thaid}, `@@unique([provider, subject])`). Explicitly documented as opaque/no-PII (`subject` must never be a raw national ID).
- **`UserConsent`** — PDPA consent audit trail, FK'd to `User` with `onDelete: Restrict` so consent history survives account deletion.

No missing core table found. One data-model red flag worth flagging to the operator directly: `User.canonicalId` (`auth.prisma:44-55`) **is the plaintext national ID today** (pre-re-key) and is used as the **foreign key** for `Application`, `Invoice`, `ApplicationBundle`, etc. — meaning the national ID is structurally fanned out as a join key across the schema, not confined to one column. A `canonicalIdLegacy` escrow + `APP_FK_USE_TOKEN` re-key mechanism exists to fix this but its rollout state is the same PENDING as §4.

---

## 3. ThaID / หมอพร้อม (MorPrompt) — IS IT REAL?

**Split verdict — the two are not the same thing and are not equally real:**

### หมอพร้อม / "Health ID" — **NOT REAL. UI-only.**
The login chooser (`apps/web-app/src/app/auth/_components/login-chooser.tsx:96-101`) shows a "Health ID" button subtitled **"ยืนยันตัวตนด้วยหมอพร้อม (Health ID ของ สธ.)"** — i.e. the UI explicitly brands this as หมอพร้อม. But the backend adapter registry has **zero code behind it**: `getIdpAdapter()` only recognizes `'providerid'` and `'thaid'` — any other key, including `'healthid'`, falls through to `throw ... AUTH_PROVIDER_NO_ADAPTER` (`apps/backend/services/auth/idp/idp-adapter.js:32-45`). There is no `health-id-adapter.js` file anywhere in the repo. The provider registry also defaults `healthid: 'coming_soon'` (`config/auth-providers.js:28`), and the chooser's own copy says why: **"ระบบยังรอการอนุมัติเชื่อมต่อจากสำนักสุขภาพดิจิทัล สธ."** (`login-chooser.tsx:232-233`) — still waiting for MOPH's approval/credentials. Net: the หมอพร้อม button is a disabled placeholder wired to nothing; even flipping every env var on would not make it work, because the adapter function itself has no branch for it.

### ThaID (DOPA/BORA citizen digital ID) — **REAL code, not yet live.**
`apps/backend/services/auth/idp/thaid-adapter.js` is a genuine OAuth2 authorization-code client built directly against the government's published sandbox/production API spec (cited §6.1-6.3 throughout): real authorize-URL construction, real token exchange with HTTP Basic client auth, real token introspection (ThaID has no separate profile endpoint), AbortController timeouts, and a full BORA error-code catalog. `thaid-identity-service.js` implements a careful linking policy: existing `IdentityLink` wins → else match by keyed-HMAC national-ID lookup (citizen-role-only, privileged accounts explicitly refused, `assertAutoProvisionableRole`, lines 78-85) → else auto-provision a fresh citizen account, **fail-closed in production** (`isProduction()` check, lines 151-156). This is not a mock. However: it requires 7 env vars (`AUTH_THAID_CLIENT_ID/SECRET/REDIRECT_URI/AUTHORIZE_URL/TOKEN_URL/INTROSPECT_URL/SCOPE`, `config/auth-providers.js:71-75`) that the UI itself says have not arrived: **"ระบบยังรอ credentials จากกรมการปกครอง"** (`login-chooser.tsx:231`). Whether those 7 vars are actually populated on the real staging/production hosts is **PENDING** — not visible from this repo (they are runtime secrets, correctly not committed).

### Provider ID (MOPH officer OAuth) — real adapter, deliberately inert.
`provider-id-adapter.js` exists and is registered, but the callback handler **always returns 409 `AUTH_LINKING_PENDING`** and is test-pinned to never touch `prisma.user` (`auth-idp.js:407-413`) — the hash_cid algorithm is flagged as unconfirmed with MOPH (`D-MANUAL-HASHCID`). So even a fully-configured Provider-ID OAuth completion cannot log anyone in today.

### The load-bearing consequence
Because หมอพร้อม has no adapter and ThaID is waiting on government credentials, **the only login path that works in this deployment today is the direct 13-digit-ID + password path** — which performs **zero verification that the person typing a national ID actually owns it** (see §5, F5). "ThaID/หมอพร้อม" is not fake marketing on a system with no plan — the ThaID engineering is real and spec-correct — but as shipped, GACP applicant identity is 100% self-declared, format-validated (Mod-11 checksum) only, never checked against any Thai government identity source.

---

## 4. PDPA / secret handling

**Design exists and is unusually thorough** (`apps/backend/services/prisma-pdpa-extension.js`, 1184 lines): AES-256-GCM field-level encryption (`utils/field-encryption.js:49-106`, random 12-byte IV, authenticated), a generic recursive `enc:v1:`-prefixed decrypt walker that covers nested Prisma includes, and — critically — **`healthId` and `providerId` are in the active encrypt set** (`PHASE_3_NATIONAL_ID_COLUMNS`, `prisma-pdpa-extension.js:141-148`), alongside `idCard`, `taxId`, `Entity.thaiCitizenId`, `Entity.juristicId`, `Application.formData` (deep-walked for embedded IDs), `Invoice.notes`, `Certificate.revokedReason`, etc. This is not a stub design.

**But the entire apparatus is opt-in, default OFF:**
```
apps/backend/services/prisma-pdpa-extension.js:868
    if (process.env.ENABLE_PDPA_FIELD_ENCRYPTION !== 'true') { return prismaClient; }
```
`docker-compose.production.yml:162` and `docker-compose.staging.yml:122` both ship `ENABLE_PDPA_FIELD_ENCRYPTION=${ENABLE_PDPA_FIELD_ENCRYPTION:-false}` — i.e. the **checked-in default is off** unless an out-of-repo `.env` overrides it. Same pattern for the companion lookup-hash flag `AUTH_LOOKUP_USE_HMAC` (`docker-compose.production.yml:142`, `staging.yml:108`, both default `false`; `apps/backend/.env.example:78` also ships `"false"`).

**Direct contradiction found**: the operator-facing contract manual claims these are live —
> `docs/contract/manual/01-identity-health-id.md:38`: *"ON (LIVE prod+staging)"* for `AUTH_LOOKUP_USE_HMAC`
> `docs/contract/manual/01-identity-health-id.md:130`: *"สถานะ: national-ID-at-rest COMPLETE, LIVE prod"*

— and two migration comments assert the same (`migrations/20260629020000_add_entity_thaicitizenid_hmac/migration.sql:43`: *"already on prod+staging from H-4"*; `migrations/20260630000000_.../migration.sql:37`: *"already ON in [prod]"*). This is either (a) accurate — a real `.env` on the live hosts sets both flags `true` and this repo's compose defaults are just safe fallbacks — or (b) the manual and migration comments overclaim, and every Thai national ID plus every other PII column listed above is sitting **plaintext** in the production Postgres dump right now. **I cannot resolve this from the repository alone — this is PENDING and should be checked directly against the live containers' actual environment** (e.g. `printenv ENABLE_PDPA_FIELD_ENCRYPTION` / `AUTH_LOOKUP_USE_HMAC` on the running prod/staging boxes), not re-derived from more code reading.

**The HMAC backfill script does exist and is safety-gated**: `apps/backend/scripts/backfill-national-id-hmac.js` populates the `*Hmac` columns and refuses to let the flag flip until every active row has one (`:230`: *"ASSERTION FAILED: active rows still missing *Hmac. Do NOT flip AUTH_LOOKUP_USE_HMAC."*). A companion `docs/deployment/production-runbook.md` documents a staged cutover (flip encryption only *after* the backfill, step 6). The tooling is real; whether it has been *run* against production and the flag actually flipped is the same PENDING as above.

**Consequence if the flags are in fact still off in production**: the lookup hash for national IDs is unkeyed `SHA-256(nationalID)` (`prisma-auth-service.js:301-309`, `auth-provider.js:71-74`). A 13-digit Thai ID with a Mod-11 checksum has roughly 10^11 valid values — brute-forceable offline against a leaked hash column in a practical timeframe on commodity GPU hardware. `utils/field-encryption.js:150-153` documents this exact risk as the reason the keyed-HMAC (`computeLookupHmac`) column was built — but it is dormant unless `AUTH_LOOKUP_USE_HMAC=true`.

---

## 5. RLS stub + NODE_ENV=staging cross-check (GOALS.md gaps)

**RLS = `SELECT TRUE`, confirmed, and confirmed to include `users`.** `migrations/20260502060000_rls_quiet_observe_only/migration.sql:39-50` redefines the shared policy predicate:
```sql
CREATE OR REPLACE FUNCTION rls_observe_check(table_name TEXT, row_org_id TEXT)
RETURNS BOOLEAN LANGUAGE SQL IMMUTABLE AS $$
    SELECT TRUE;
$$;
```
`migrations/20260430130000_rls_phase_e1_extend_remaining_tables/migration.sql:28-96` applies `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + a policy built on that function to a 44-table list that explicitly includes `'users'` (line 73). So Postgres reports RLS as "enabled" on `users`, but the policy allows every row to every query — this is RLS **theater**, not enforcement, exactly as GOALS.md states, and it specifically covers the identity table this audit is about.

The actual (partial) backstop is application-layer, not DB-layer: `apps/backend/services/tenant-prisma-extension.js` auto-injects/verifies `organizationId` on `create`/`createMany`/`upsert` and — as of a 2026-08 change — now also filters `findMany`/`findFirst`/`count`/`aggregate`/`groupBy` reads by the bound tenant context (`orgReadScopeEnabled()`, default on, lines 192-234). But **by design it does not touch `findUnique`/`update`/`delete`** (lines 18-23, 283-289: *"by-id; deferred to RLS phase"*) — and since the DB-level RLS those operations were deferred to is the permissive stub above, **any by-id Prisma call against `users` (or the other 48 listed tables) that isn't manually organization-checked in application code has no tenant-isolation backstop at all today.** I did not enumerate every by-id call site in the auth/identity surface to check for a concrete cross-org IDOR (that would need either a full grep sweep or a live two-tenant test, both out of scope for this pass) — flagging the structural gap, not a proven exploit.

**`NODE_ENV=staging` guard-bypass**: found evidence this was a *known, already-remediated* class of bug for at least the surfaces checked. `apps/backend/routes/api/system/e2e.js:19-24` documents the exact failure mode GOALS.md describes ("previously gated ONLY by NODE_ENV, leaving them open & unauthenticated on staging") and now requires a fail-closed constant-time-compared `E2E_SECRET` regardless of environment. `__tests__/unit/server-staging-debug-surfaces.test.js:196-221` (suite tagged `[P0-1]`) asserts staging keeps the *same* hardened posture as production for CSP/COEP, error-detail leakage, and Swagger exposure. Within the auth subsystem specifically, `middleware/auth-middleware.js` has exactly one `NODE_ENV` branch and it only affects `NODE_ENV==='test'` (line 52) — no staging-only relaxation found there. I did **not** sweep the rest of the codebase for other staging-only bypasses (GOALS.md may be referring to surfaces outside auth/identity) — PENDING for a full-repo sweep, but within this audit's scope (auth/identity) I found no live instance of it.

---

## Findings summary

| # | Finding | Severity | Evidence |
|---|---|---|---|
| F1 | DB-level RLS on `users` (+48 tables) is `SELECT TRUE` — permissive, not enforcing. App-layer extension explicitly skips by-id ops. | **Critical** | `migrations/20260502060000/migration.sql:39-50`, `migrations/20260430130000/migration.sql:73,89-96`, `tenant-prisma-extension.js:18-23,283-289` |
| F2 | PDPA field encryption (incl. `healthId`/`providerId`) is opt-in via `ENABLE_PDPA_FIELD_ENCRYPTION`, checked-in default `false`; operator-facing contract manual + 2 migration comments claim it's live in prod — unverifiable from repo. | **Critical (PENDING live check)** | `prisma-pdpa-extension.js:868`, `docker-compose.production.yml:162`, `docs/contract/manual/01-identity-health-id.md:38,130` |
| F3 | The only currently-functional login path performs zero identity verification — any Mod-11-valid 13-digit number is accepted as a real national ID. | **High** | `prisma-auth-service.js:73-109`, `shared/schemas/auth-schemas.js` (healthLoginSchema) |
| F4 | ThaID's auto-link-by-national-ID (step 3 of `resolveThaidLogin`) will silently attach a real citizen's ThaID login to a **pre-existing, attacker-seeded account** if one was self-registered earlier with that citizen's ID — no re-verification, no notice. Logical finding from code reading, not a demonstrated exploit; becomes live the moment ThaID is switched on. | **High** | `thaid-identity-service.js:132-145` combined with F3 |
| F5 | Default national-ID lookup hash is unkeyed SHA-256 (`AUTH_LOOKUP_USE_HMAC` default `false`) — brute-forceable offline against a leaked hash column; keyed-HMAC replacement exists but is dormant by default. Same prod/staging live-value uncertainty as F2. | **Medium (PENDING live check)** | `prisma-auth-service.js:301-309`, `docker-compose.production.yml:142`, `field-encryption.js:150-153` |
| F6 | หมอพร้อม/"Health ID" IdP button has zero backend adapter — cannot function even if fully configured. | **High** (truth-in-representation / roadmap risk, not an exploit) | `idp-adapter.js:32-45`, `auth-providers.js:28`, `login-chooser.tsx:96-101` |
| F7 | Duplicate array literal in provider-role gate (dead code, not a live bug). | **Low** | `auth-provider.js:105` |
| F8 | `User.canonicalId` is the plaintext national ID used as an FK across the schema (Application/Invoice/etc.); re-key mechanism exists but rollout state ties to the same F2 PENDING. | **Medium** | `auth.prisma:44-55` |

## What is solid (for balance, not to offset the above)
Password hashing (bcrypt-12), JWT design (portal-separated secrets, no embedded PII, session-epoch + JTI revocation), account lockout, rate limiting, 2FA, logout/cookie hygiene, and the User/Entity/EntityMembership/permission-grant data model are all competently built — see §1 and §2. The identity-*verification* and data-protection-*activation* layers are where the gap between "engineered" and "enforced" lives.
