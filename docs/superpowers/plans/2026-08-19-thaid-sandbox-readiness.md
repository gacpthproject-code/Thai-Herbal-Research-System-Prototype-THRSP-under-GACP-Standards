# ThaiD Sandbox Readiness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** ThaiD login testable end-to-end against the DOPA sandbox on the Phase-0 laptop stack, with identity/PII written correctly the first time.

**Architecture:** 5 tasks on `feat/thaid-sandbox-readiness` (off main 6205827e). Spec (binding, carries the 4 council rulings + dissents): `docs/superpowers/specs/2026-08-19-thaid-sandbox-readiness-design.md`.

**Tech Stack:** Express backend (env-driven ThaiD adapter already built), Next.js web-app, Prisma/Supabase, Jest/RTL.

## Global Constraints
- RED-first per task, real in-session runs. Tier C (auth/identity) → operator merges the branch. L2: no secret in any commit (sandbox creds live ONLY in the operator's local .env). Ratchet not raised.
- **R-B transport shape (binding):** the three IdP calls go browser→backend-origin directly (`NEXT_PUBLIC_BACKEND_ORIGIN` default `http://localhost:8000`, `credentials:'include'`). The universal proxy `apps/web-app/src/app/api/[...path]/route.ts` is UNTOUCHED — any change to it is out of scope (its fix is a separate Tier C mission; auto-triggered only if probe P2 fails).
- **R-A shape (binding):** the IdP path returns the SAME `mfaRequired` challenge contract the password path already returns (`prisma-auth-service.js:412-424` shape); no new factor abstraction.
- **R-D shape (binding):** ThaiD `identity_links.subject` = `computeLookupHmac('idp:thaid:' + sub)` — domain-separated, never byte-equal to `users.healthIdHmac`; `provider='local'` semantics unchanged; the audit `subjectHashOf` moves to the same keyed derivation in the same task.
- Existing behavior of the PASSWORD login path must not change in any task (regression suites must stay green).

---

### Task 1: FE callback page + direct-origin IdP transport

**Files:**
- Create: `apps/web-app/src/app/auth/callback/[provider]/page.tsx` (+ client-view if house style requires the server/client split — check `apps/web-app/src/app/auth/` siblings)
- Create: `apps/web-app/src/lib/api/idp-client.ts` — `idpFetch(path, init)` targeting `NEXT_PUBLIC_BACKEND_ORIGIN` (default `http://localhost:8000`) with `credentials:'include'`
- Modify: `apps/web-app/src/app/auth/_components/login-chooser.tsx` — its providers fetch (:260-286) + authorize-url call (:292-308) switch to `idpFetch`
- Test: component tests for the callback page + a login-chooser test asserting the direct-origin transport

**Interfaces:**
- Consumes: `POST {origin}/api/auth/idp/{provider}/callback` with `{code, state}` → today returns `{success, data:{user,...}}` (session cookie via Set-Cookie) or a catalog error (`AUTH_STATE_INVALID`, `AUTH_IDP_*`, `AUTH_AUTOPROVISION_DISABLED`, `AUTH_LINKING_PENDING` 409). After Task 2 it MAY also return the password-path `mfaRequired` challenge shape (`prisma-auth-service.js:412-424` — read it for the exact fields) — build the handling NOW against that existing contract.
- Produces: on success → route by `user.role` the way the password login FE does (find its post-login routing and reuse); on `mfaRequired` → hand off into the existing MFA verify UI (find the password path's MFA screen/flow and reuse it); on error/`error_description` from BORA or a catalog code → render Thai copy (error-translator / error catalog), with a "กลับไปหน้าเข้าสู่ระบบ" action.

- [ ] Steps: RED component test first (page renders error state for `?error=`, posts code/state, routes on success, hands off on mfaRequired) → implement page + idpFetch → switch login-chooser (keep its rendering contract; only transport changes) → GREEN + login-chooser suite still green → commit.

---

### Task 2: R-A — MFA gate at the mint for the IdP path + existing-link rider

**Files:**
- Modify: `apps/backend/services/prisma-auth-service.js` (`issueTokensForAuthenticatedUser` ~:475-522 — `twoFactorEnabled` read at :481)
- Modify: `apps/backend/routes/api/auth/auth-idp.js` (`resolveThaidSession` → the :254 mint call + the response shaping)
- Modify: `apps/backend/services/auth/thaid-identity-service.js` (existing-link branch :123-131 — role assertion / audit visibility rider)
- Test: extend `__tests__/unit/auth-idp-thaid-session.test.js` + the mfa flow suite

**Interfaces:**
- Produces: when the resolved user has `twoFactorEnabled=true`, the IdP callback returns the SAME challenge contract as password login (mint an `mfa_session` via the same helper the password path uses — locate it at `health-auth-profile-handlers.js:168-204` / `shared/mfa-challenge-binding.js`; `/api/mfa/verify` then completes login UNCHANGED). When false → today's behavior byte-identical.
- Rider: the existing-link branch asserts the linked user's role is auto-provisionable-or-explicitly-allowed (reuse `assertAutoProvisionableRole` semantics :78-85 — the implementer investigates whether staff links should 409 `AUTH_LINKING_PENDING` or pass-with-audit; DEFAULT to fail-closed 409 for non-HEALTH roles + an audit row, and record the decision in the report).

- [ ] Steps: RED tests (2FA-enrolled user via ThaiD → mfaRequired challenge, NO tokens; non-enrolled → tokens as today; staff existing-link → fail-closed + audit) → implement → GREEN → run the full auth suites (password path unchanged) → commit.

---

### Task 3: R-D — domain-separated subject HMAC + keyed audit hash

**Files:**
- Modify: `apps/backend/services/auth/thaid-identity-service.js` (subject derivation at link create/lookup — both sides must use the same derivation)
- Modify: `apps/backend/routes/api/auth/auth-idp.js` (`subjectHashOf` :155-157 → keyed derivation via `utils/field-encryption.js` `computeLookupHmac`)
- Modify: `apps/backend/prisma/schema/auth.prisma` (the identity_links comment block ~:344-346 — record which providers store derived subjects; NO column/type change)
- Test: unit tests pinning the derivation

**Interfaces:**
- Produces: `thaidSubjectKey(sub) = computeLookupHmac('idp:thaid:' + sub)` used for BOTH `findUnique({provider:'thaid', subject})` and link creation — deterministic, so the existing `@@unique([provider, subject])` and upsert path work unchanged. `provider='local'` rows untouched (P1 measured the table EMPTY — no backfill anywhere).
- Tests MUST pin: (a) derived subject ≠ `computeLookupHmac(sub)` (domain separation — the anti-join property), (b) same sub → same key (lookup stability), (c) audit metadata carries the keyed hash, never bare SHA-256, and never the raw CID.

- [ ] Steps: RED (the 3 pins above) → implement → GREEN → full idp suites → commit.

---

### Task 4: scope/pid read-path + adapter wire-shape test + INTROSPECT demotion

**Files:**
- Modify: `apps/backend/services/auth/thaid-identity-service.js` (`decodeIdTokenSubject` :48-64 → also return `pid`/`given_name`/`family_name` from the id_token payload; callers fall back to top-level fields)
- Modify: `apps/backend/routes/api/auth/auth-idp.js` (:217-225 — read nationalId from id_token payload FIRST, top-level `raw.pid` as fallback; both shapes tolerated)
- Modify: `apps/backend/config/auth-providers.js` (:71-75 — move `AUTH_THAID_INTROSPECT_URL` out of REQUIRED; keep it consumed if set) + `.env.example` ThaiD block note (recommended scope `openid pid given_name family_name`)
- Create: `apps/backend/__tests__/unit/thaid-adapter.test.js`

**Interfaces:**
- The wire-shape test pins (mocked fetch): Basic-auth header = base64(client_id:client_secret), `application/x-www-form-urlencoded` body with grant_type/code/redirect_uri, authorize-URL params (:141-148), and the §7 error mapping (401 invalid_client/user_denied, 400 invalid_scope/invalid_request, 5xx → AUTH_IDP_*) — per `thaid-adapter.js:80-178`. First sandbox call must NOT be this code's first execution.
- Provider state resolution must be re-tested after the REQUIRED change: with the 6 remaining vars set and INTROSPECT unset → state resolves enabled; with any of the 6 missing → coming_soon (fail-closed preserved).

- [ ] Steps: RED (id_token-only token response resolves identity; top-level-only response still resolves; adapter wire pins; INTROSPECT-optional state) → implement → GREEN → commit.

---

### Task 5: env + docs honesty + the operator sandbox runbook

**Files:**
- Modify: `apps/backend/.env.example` (add `SESSION_SECRET` ≥32-char note near the auth block — it is declared at `config/secrets.js:127-132` with no devFallback and both IdP endpoints fail closed without it)
- Modify: `docs/architecture/2026-05-04-canonical-auth-session-rbac-contract.md` (top-of-file SUPERSEDED banner for §2/§4.3 route shape → points at the shipped generic POST flow + this spec)
- Modify: `apps/backend/shared/canonical-rbac.js` (:98-99 — correct the false "No external IdP is wired" comment; point at config/auth-providers.js as the registry SSOT)
- Create: `docs/operations/thaid-sandbox-smoke-runbook.md`

**Interfaces (runbook contents — real commands, no placeholders):**
1. Transcribe sandbox creds from T-SBX manual p.19 into `apps/backend` env ONLY (L2 — never commit); the 6 required `AUTH_THAID_*` vars with the documented sandbox URLs (manual-citations.md:111-115); `AUTH_THAID_REDIRECT_URI=http://localhost:3000/auth/callback/thaid`; `NEXT_PUBLIC_BACKEND_ORIGIN=http://localhost:8000`; `SESSION_SECRET`.
2. Run the stack with `NODE_ENV=development` (auto-provision fail-closes on production — thaid-identity-service.js:151-156).
3. C1 sequence (operator): `node scripts/backfill-national-id-hmac.js --dry-run` → run → 0-remaining assertion → flip `AUTH_LOOKUP_USE_HMAC=true` (dry-run of 2026-08-19 was clean: 34/6/40, 0 errors).
4. **Probe P2 checklist** (gates R-B): login → BORA sandbox → callback lands on the page; verify in devtools that `idp_state` was set during authorize-url and sent on the callback POST; `provider_token` set; a subsequent proxied `/api` call authenticates. If ANY leg fails → record it and STOP: council conditional flips the ruling to B2 (proxy fix, separate Tier C mission).
5. Capture a view-pack of the first successful round-trip (evidence/AUTH-THAID/ — none has ever existed) + confirm whether `sub`==CID (O3) + note the id_token/pid shape actually returned.
6. The standing gate text: "การเดินจริงของเกษตรกรผ่าน proxy :3000 ยังไม่พิสูจน์จนกว่า route.ts จะส่งต่อ Cookie/Set-Cookie (งาน Tier C แยก)".

- [ ] Steps: docs are Tier A — write, self-check every command against the real files, `local-gate` sanity if quick, commit.

## Self-Review
Spec coverage: R-A→T2, R-B→T1+runbook P2, R-C→runbook §3 (script exists; operator-run), R-D→T3, audit gaps (callback page/T1, scope-pid/T4, SESSION_SECRET+INTROSPECT/T4-T5, wire test/T4, doc honesty/T5). Shared-file overlap: T2/T3/T4 all touch thaid-identity-service.js + auth-idp.js → strictly sequential dispatch (SDD default) resolves; interfaces stated per task. No placeholder steps; exact values live in cited lines the implementer verifies (L1).
