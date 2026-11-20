# W1-5 — fail-closed revocation + Docker build-context secrets — 2026-08-22

Status: `PENDING` — code + tests GREEN in-session, but this is **Tier C (auth)** so
the operator merges, and one file outside this task's ownership still needs an
operator edit (`scripts/probes/probe-registry.txt`, see §3).

Branch: `fix/design-reproducibility` · no `git add` / `git commit` performed.

---

## FIX 1 — token revocation was fail-OPEN; the fail-CLOSED code was unreachable

### The verified defect

`apps/backend/services/redis-service.js:79-93` (pre-change):

```js
async get(key) {
    if (!this.isConnected) {return null;}          // ← unavailable  → null
    try { ... } catch (error) { return null; }     // ← client error → null
}
```

`get()` has **no throw path at all**. `set()` likewise returns `false`, `del()`
returns `false`. Therefore in `token-revocation-service.js`:

| Function | Line (pre-change) | Written policy | Actual behaviour on a Redis outage |
|---|---|---|---|
| `isRefreshTokenBlocklisted` | 321-331 | "Fail CLOSED" | `get`→null → `Boolean(null)`=**false** → **token accepted**. The `catch` returning `true` was **dead code**. |
| `isSessionFamilyBlocklisted` | 407-416 | "Fails CLOSED" | same — **false** → a replayed RT chain stays usable. Dead `catch`. |
| `invalidateSessionFamily` | 372-390 | "RE-THROW so the caller can 503" | `set`→false, no throw → **write silently dropped**, fresh tokens issued to attacker and victim. Dead `catch`. |
| `isAccessTokenBlocklisted` | 263-274 | fail-OPEN **+ CRITICAL alert** | fails open **silently** — `ACCESS_TOKEN_BLOCKLIST_REDIS_OUTAGE` could never fire. |
| `blocklistAccessToken` / `blocklistRefreshToken` / `revokeRefreshToken` | 141-148 / 295-306 / 103-110 | "logged but not thrown" | not even logged — every `catch` unreachable. |
| `email-otp-service.verifyEmailOtp` | 111-116 | — | `get`→null → reported `EXPIRED`: an honest-sounding answer to a question never asked. |

Blast radius of the headline case: refresh tokens live **7 days**. A Redis
outage made every blocklisted / rotated / reuse-detected refresh token look
valid for the remainder of that window, with no log line anywhere.

And the existing tests were green against this, because they mocked
`redis-service` with a `get` that **throws** — behaviour the real module does
not have. The tests proved a branch production could never reach.

### Design choice — a separate strict accessor

Added to `redis-service.js`: `getStrict` / `setStrict` / `delStrict`, plus an
exported `RedisUnavailableError` (`code: 'REDIS_UNAVAILABLE'`). They reject when
`!isConnected || !client` **and** when the underlying client rejects. `get` /
`set` / `setNX` / `del` / `invalidatePattern` / `getOrSet` keep their exact
graceful-degradation semantics.

Both accessors share one `_read` / `_write` / `_delete` internal, so the cache
path and the authoritative path cannot drift in how they talk to ioredis or
parse the payload.

**Why a strict accessor rather than an availability check** (`isAvailable()`
consulted by the caller), the other option offered:

1. **TOCTOU.** `isAvailable()` reads a flag; the connection can drop between the
   check and the read, and the read then quietly returns `null` — the fail-open
   returns through the back door. A strict accessor makes unavailability a fact
   *about the specific read that just happened*.
2. **Two shapes, one answer.** A production outage has two shapes: never
   connected (`isConnected=false`) and stale-true flag with a rejecting socket.
   `isAvailable()` only models the first. The suite asserts both shapes on every
   authoritative path.
3. **Non-ignorable.** An availability check is an `if` a future contributor can
   forget; the exact class of bug being fixed. A rejection propagates by default
   — forgetting it produces a loud unhandled rejection, not a silent bypass.
4. **Zero blast radius on cache callers.** Adding a method cannot change
   `cache-service` or `reports.js`. Changing `get()`'s contract would have
   touched every cache call site in the repo.

Cost, stated plainly: two ways to read from Redis, so a caller can pick the
wrong one. Mitigated by the doc block at the top of `redis-service.js` (the
"if the answer decides whether a credential is honoured" rule), a
`_mapOtpFailure`-style comment at each converted call site, and the regression
suite that runs the real service.

### Every caller audited

Authoritative = the answer decides whether a credential is honoured.

| Caller | file:line | Verdict | Action |
|---|---|---|---|
| `isRefreshTokenBlocklisted` | token-revocation-service.js:382 | **AUTHORITATIVE** | → `getStrict`. Now genuinely fails CLOSED (returns `true`). **Behaviour changed.** |
| `isSessionFamilyBlocklisted` | token-revocation-service.js:475 | **AUTHORITATIVE** | → `getStrict`. Now genuinely fails CLOSED. **Behaviour changed.** |
| `invalidateSessionFamily` | token-revocation-service.js:437 | **AUTHORITATIVE (write)** | → `setStrict`. Now genuinely re-throws, so the `/refresh` 503 branch is live. **Behaviour changed.** |
| `isAccessTokenBlocklisted` | token-revocation-service.js:316 | **AUTHORITATIVE** | → `getStrict`. Verdict unchanged (documented fail-OPEN kept), but the CRITICAL alert now fires. See §1.1. |
| `blocklistAccessToken` | token-revocation-service.js:171 | **AUTHORITATIVE (write)** | → `setStrict`; catch now logs **and** emits the same SecOps alert. Still non-throwing, so `/logout` cannot 500. |
| `blocklistRefreshToken` | token-revocation-service.js:352 | **AUTHORITATIVE (write)** | → `setStrict`. Documented "logged but not thrown" is now real. No behaviour change. |
| `revokeRefreshToken` | token-revocation-service.js:128 | **AUTHORITATIVE (write)** | → `delStrict`. Its warn now fires. Residual noted in §1.2. |
| `isRefreshTokenValid` (allowlist) | token-revocation-service.js:107 | **AUTHORITATIVE** | → `getStrict`. Verdict already correct by construction (absent = invalid); the outage is now logged instead of being indistinguishable from a revoked token. |
| `consumeMfaChallenge` | token-revocation-service.js:518 | **AUTHORITATIVE** | → `getStrict`. Verdict unchanged (`null` = not honoured); outage now logged. |
| `issueMfaChallenge` | token-revocation-service.js:499 | **AUTHORITATIVE (write)** | → `setStrict`. Was handing back a challenge token the store never persisted. No production caller today. |
| `issueRefreshToken` | token-revocation-service.js:82 | **AUTHORITATIVE (write)** | **LEFT ON `set` DELIBERATELY** — see §1.2. |
| `revokeAllUserTokens` | token-revocation-service.js:143 | **AUTHORITATIVE (write)** | Unchanged — uses `redisService.client` directly, so its `catch` is already reachable. |
| `email-otp-service.verifyEmailOtp` | email-otp-service.js:126 | **AUTHORITATIVE** | → `getStrict`; new reason `STORE_UNAVAILABLE`. **Behaviour changed** (was `EXPIRED`). |
| `email-otp-service.issueEmailOtp` (store) | email-otp-service.js:65 | **AUTHORITATIVE (write)** | Unchanged — already checked `stored === false` and refused to email a dead code. Correct as written. |
| `email-otp-service.issueEmailOtp` (throttle read) | email-otp-service.js:55 | **CACHE / anti-abuse** | Unchanged. This is the 30s anti-email-bomb window, not an auth decision; failing open re-issues a code, it never accepts one. `mfaEmailSendLimiter` (5/15min per IP) is the backstop and degrades to in-memory rather than off. |
| `mfa.js` jti replay guard | routes/api/identity/mfa.js:586 | **AUTHORITATIVE, documented fail-OPEN** | → `getStrict`. Verdict unchanged; see §1.3. |
| `routes/api/documents/reports.js` (7 sites) | reports.js:31,51,76,93,116,124,152,308 | **CACHE** | Unchanged. Dashboard stats; a miss re-queries Postgres. |
| `notification-fanout-service` (4 sites) | notification-fanout-service.js:151,176,192,957 | **CACHE / dedupe** | Unchanged. Already guards on `isAvailable()` with an in-process Map shim; degrading to non-dedupe is the documented R5-A contract. |
| `server.js` / `scripts/deploy/server-backup.js` | server.js:399,474,505 · server-backup.js:127,166 | **HEALTH / LIFECYCLE** | Unchanged. `isAvailable()` for a health payload; `connect`/`disconnect`. |

#### §1.1 — the access-token policy: kept, but the operator should re-decide

The Sprint-8 SECURITY POLICY block chose option (B) *fail-OPEN plus a
high-severity SecOps alert* over (A) fail-CLOSED, on the explicit grounds that
SecOps gets paged. **That page could not fire.** The whole argument for (B)
rested on a compensating control that did not exist, so the platform has been
running bare fail-open since Sprint 8.

Per the brief the policy is a documented product decision and has **not** been
flipped. The alert is now real (both on the read path and, newly, when the
revocation *write* is dropped). A `W1-5 AMENDMENT` paragraph recording this sits
in the policy block itself.

**Operator: this is the moment to re-decide (A) / (B) / (C).** The trade-off is
now honest for the first time.

#### §1.2 — residual, deliberately not fixed: `issueRefreshToken`

`issueRefreshToken` keeps the cache accessor, so its `catch { throw }` stays
unreachable. On a Redis outage, login issues a refresh token that was never
allowlisted — **dead on arrival**, because `isRefreshTokenValid()` rejects it.
That direction is **fail-safe** (a useless credential, not a bypass), so it is
not a security hole; it is a silent UX cliff. Converting it makes `/login`
itself 500 during an outage, which is a far larger blast radius and requires
editing `prisma-auth-service.js:532` — **outside this task's file ownership**.
Flagged in-code and here. **Operator decision needed:** 503 at login, or a
session that silently cannot refresh.

Same shape, smaller: `revokeRefreshToken` now *logs* when a logout-time
revocation is dropped, but still returns normally. A logout during an outage
leaves the RT alive in the allowlist and usable again once Redis returns. Making
`/logout` 503 is a product decision, not a mechanical fix.

#### §1.3 — OTP / MFA

- `verifyEmailOtp` returns `{ ok: false, reason: 'STORE_UNAVAILABLE' }` when the
  store cannot answer. **Never `ok: true`** — asserted against every code shape.
- `mfa.js` `/verify` grew `mapOtpFailure(reason)` (extracted so the outage branch,
  unreachable in a route test, has a direct guard; exported as `_mapOtpFailure`).
  `STORE_UNAVAILABLE` → **503 `MFA_STORE_UNAVAILABLE`**, not 401: the credential
  was not rejected, it could not be checked.
- Thai copy: `ระบบยืนยันรหัสไม่พร้อมใช้งานชั่วคราว จึงยังตรวจสอบรหัสของคุณไม่ได้ กรุณารอสักครู่แล้วลองใหม่อีกครั้ง`
  — cause + next action, `คุณ` register, no em dash, no `ท่าน`, and deliberately
  **not** "your code is wrong" (we do not know that) and **not** "request a new
  code" (during an outage a new one cannot be stored either). Asserted by test.
  `node scripts/ci/check-thai-copy-style.js` flags 6 pre-existing issues in files
  outside this change and **none** in it.
- The jti replay guard (`mfa.js`) keeps its documented fail-OPEN. It previously
  disambiguated "already used" from "Redis down" via `setNX`-false + a `get`
  whose `null` *also* meant either — right by luck, not construction. `getStrict`
  makes it explicit. It guards replay of an **already-verified** challenge, not
  the code check itself (which now 503s). Flagged for the same operator review.

### RED → GREEN

New suite `apps/backend/__tests__/unit/redis-outage-fail-closed.test.js` mocks
**only `ioredis`** and drives the **real** `redis-service` singleton into both
production outage shapes.

**RED** (`W1-5-RED.txt`) — 27 failed / 22 passed / 49 total, including:

```
● isRefreshTokenBlocklisted → TRUE when the store is not connected
● isRefreshTokenBlocklisted → TRUE when the client rejects
● isSessionFamilyBlocklisted → TRUE when the store is not connected
● invalidateSessionFamily REJECTS when the store is not connected
● emits ACCESS_TOKEN_BLOCKLIST_REDIS_OUTAGE when the store is NOT CONNECTED (previously dead code)
● verifyEmailOtp → STORE_UNAVAILABLE (not EXPIRED) when the store is not connected
```

**GREEN** — 49/49 pass. Broad sweep (`W1-5-GREEN.txt`),
`--testPathPattern "(auth|token|otp|mfa|redis|revoc|blocklist|logout|session|jti|identity)"`:

```
Test Suites: 1 skipped, 45 passed, 45 of 46 total
Tests:       6 skipped, 514 passed, 520 total
```

Baseline for the four originally-related suites was 54 passed; they are now 105
passed (49 new + 2 new email-OTP outage cases). **No test was deleted or
weakened.**

### On replacing the "mock redis to throw" tests — this is a strengthening

The old tests asserted `isRefreshTokenBlocklisted` fails closed *when
`redisService.get` throws*. The real `get` cannot throw, so the assertion was
vacuously satisfiable and the production behaviour was the exact opposite. The
replacements assert the same policy against the condition that actually occurs
(store unavailable), in two shapes, against the real module. Strictly more is
proven, and the one thing the old test "proved" is now proven properly.

The three in-repo fakes were also made faithful rather than merely extended:
they now carry both contracts (`get` never throws; `*Strict` rejects) and drive
outages through a `mockRedisOutage.on` switch, so a fake can no longer lie about
the service's contract. Three further suites had incomplete redis mocks that
broke once the authoritative paths started using strict accessors
(`session-epoch-refresh`, `logout-session-revocation-sec-002`,
`mfa-verify-guards`) — each had the three strict methods added against the same
healthy store. No assertion in any of them was relaxed.

---

## FIX 2 — private keys, env files and farmer uploads were baked into images

### The verified defect — worse than "one future `COPY . .`"

`.dockerignore` (pre-change, 32 lines) excluded only the **context-root** `.env`.
`.dockerignore` patterns are matched with Go's `filepath.Match` against the path
relative to the context root and **do not recurse** the way `.gitignore` does, so
`.env` matched `./.env` and nothing else.

The existing comment in the file reasoned "both Dockerfiles COPY explicit paths,
so none of it ever reached an image". That holds for `backups/` and `evidence/`.
It does **not** hold for `apps/backend`:

- `apps/backend/Dockerfile:28` — `COPY apps/backend ./apps/backend`
- `apps/backend/Dockerfile:96` — `COPY --from=builder /app/apps/backend ./apps/backend` **into the final runtime stage**

So everything under `apps/backend` was already being baked into every image built
from a working checkout. Verified against this tree on 2026-08-22:

- `apps/backend/keys/private.pem` — the certificate-signing private key
- `apps/backend/.env` — Supabase credentials, JWT secrets (untracked + gitignored, so *local-only*; it is not in git history)
- 85 files under `apps/backend/public/uploads/`, including `uploads/slips/` payment slips (PDPA personal data)

Excluding them breaks nothing: `docker-compose.production.yml` supplies both
directories as named volumes at runtime (`gacp_signing_keys` → `/app/apps/backend/keys`:206,
`gacp_uploads` → `/app/apps/backend/public/uploads`:201) and the mount shadows the
image contents — so the baked-in dev key was never even *used*, only extractable
from the image layers.

### The fix

Added to `.dockerignore`: `**/*.pem`, `**/*.key`, `**/*.p12`, `**/*.pfx`,
`**/*.crt`, `apps/backend/keys/`, `**/.env`, `**/.env.*`,
`apps/backend/public/uploads/`, `**/public/uploads/` — with a comment block
recording why the previous reasoning did not hold.

### Docker is NOT available on this machine

`docker` is not on `PATH` under either bash or PowerShell, and
`C:\Program Files\Docker` does not exist — Docker Desktop is not installed. The
image-build proof could not be run. Per the brief, a probe was written instead.

### The probe — `scripts/probes/dockerignore-secrets.sh`

Deliberately **not** a string-match probe. `grep -q '\*\*/\*.pem' .dockerignore`
would pass on a `.dockerignore` full of patterns that match nothing — which is
exactly the failure that shipped here (`.env` was present and looked protective).

The probe instead does what Docker does: it **discovers** the sensitive files
that actually exist in the tree (`*.pem|*.key|*.p12|*.pfx|*.crt`, `.env`,
`.env.*`, `public/uploads/*`; not hardcoded, so a key added tomorrow is covered)
and **evaluates the `.dockerignore` rules against each path**, modelling `**`,
trailing-slash directory rules, `!` negation and later-rule-wins precedence —
including the no-implicit-recursion rule that caused the bug. Exit contract
0/1/2 per `_lib.sh`; a missing `.dockerignore` **or** a scan that finds nothing
to test is BLOCKED, never a vacuous PASS.

**RED** — the pre-fix `.dockerignore` (`git show HEAD:.dockerignore`) evaluated
against this repo's real sensitive paths (`W1-5-dockerignore-RED.txt`, exit 1):

```
FAIL: 92 of 93 sensitive file(s) would be shipped in the Docker build context
  - apps/backend/.env
  - apps/backend/keys/private.pem
  - apps/backend/keys/public.pem
  - apps/backend/public/uploads/... (85 files, incl. uploads/slips/)
```

Only the context-root `.env` was excluded.

**GREEN** (`W1-5-dockerignore-GREEN.txt`, exit 0):

```
PASS: 93 sensitive file(s) in the tree, all excluded from the build context by .dockerignore
```

**Selftest** (`W1-5-probe-selftest.txt`, exit 0) — **7/7**, five of them mutations
that re-introduce a real leak and assert the probe goes red:

| Case | Fixture | Expect |
|---|---|---|
| A | the patterns this repo now ships | PASS (baseline — without it an always-fail probe would satisfy every mutation) |
| B | **the original `.dockerignore`, verbatim** | FAIL naming `apps/backend/keys/private.pem` |
| C | keys+uploads handled, `.env` only at root | FAIL naming `apps/backend/.env` (the gitignore-vs-dockerignore trap) |
| D | secrets handled, uploads not | FAIL naming `uploads` |
| E | right patterns, then `!apps/backend/keys/private.pem` | FAIL — precedence modelled, not just presence |
| F | no `.dockerignore` at all | BLOCKED (2) |
| G | nothing sensitive found | BLOCKED (2) — "found nothing" ≠ "nothing leaks" |

### What this probe does not fix

Secrets already in git history (that is `no-secret` + a key rotation); secrets
injected via Dockerfile `ARG`/`ENV` or fetched at build time; file types outside
the sensitive list; anything about a running container. Build context only.

---

## §3 — BLOCKED on the operator: probe registry row

`scripts/ci/probe-gate.js` requires exactly one registry line per
`scripts/probes/*.sh`, and currently reports:

```
probe-gate: registry problems
  - scripts/probes/dockerignore-secrets.sh exists but has NO registry line
```

`scripts/probes/probe-registry.txt` is **operator-signed (L6)** and outside this
task's file ownership, so it was not edited. Suggested row:

```
dockerignore-secrets | ci | - | - | build-context secret guard (W1-5): no *.pem / .env / farmer upload may enter a Docker build context
```

`run: ci` is appropriate — the probe needs no Docker, no DB and no network; it
reads `.dockerignore` and walks the tree in about a second.

---

## Gate state (compare-to-baseline, per MEMORY: local-gate is red on main itself)

| Check | Result | Mine? |
|---|---|---|
| `scripts/probes/ratchet.sh` | **PASS** — hardcode=36 todo=56 env-direct=122 dup-source=2, no counter above baseline | — |
| `eslint` on all 12 changed files | **clean, exit 0** | — |
| `check-mojibake-encoding.js` | **PASS** | — |
| `check-thai-copy-style.js` | 6 issues, all in `entity-service.js` / `notification-view.selftest.js` / `canonical-application-validator.js` | **No** — pre-existing, none in this change |
| `no-secret.sh` | **FAIL** on `apps/backend/.env:160,162` (a `sk_test_` Stripe key) | **No** — pre-existing. That file is **untracked and gitignored** (`git ls-files` finds nothing; `apps/backend/.gitignore:22`), so it is a local dev file, not a git-history secret. This change *reduces* its exposure by keeping it out of images. Value not reproduced here (L2). |
| `probe-gate.js` | **FAIL** — only the missing registry row above | **Yes** — needs the operator (§3) |
| Backend auth/token/otp/mfa/redis sweep | **514 passed, 0 failed, 6 skipped** | — |

Redis was neither started nor stopped on this machine.

---

## Files changed (working tree — not staged, not committed)

Modified:
- `apps/backend/services/redis-service.js`
- `apps/backend/services/token-revocation-service.js`
- `apps/backend/services/email-otp-service.js`
- `apps/backend/routes/api/identity/mfa.js`
- `apps/backend/__tests__/unit/access-token-blocklist.test.js`
- `apps/backend/__tests__/unit/refresh-token-blocklist.test.js`
- `apps/backend/__tests__/unit/email-otp-service.test.js`
- `apps/backend/__tests__/unit/session-epoch-refresh.test.js`
- `apps/backend/__tests__/unit/logout-session-revocation-sec-002.test.js`
- `apps/backend/__tests__/integration/mfa-verify-guards.test.js`
- `.dockerignore`

Created:
- `apps/backend/__tests__/unit/redis-outage-fail-closed.test.js`
- `scripts/probes/dockerignore-secrets.sh`
- `reports/design-cleanup-2026-08-21/W1-5-fail-closed-revocation.md` (this file)
- `reports/design-cleanup-2026-08-21/W1-5-RED.txt`
- `reports/design-cleanup-2026-08-21/W1-5-GREEN.txt`
- `reports/design-cleanup-2026-08-21/W1-5-dockerignore-RED.txt`
- `reports/design-cleanup-2026-08-21/W1-5-dockerignore-GREEN.txt`
- `reports/design-cleanup-2026-08-21/W1-5-probe-selftest.txt`

## Next (operator)

1. Merge decision — Tier C (auth).
2. Add the `dockerignore-secrets` registry row (§3); `probe-gate` is red until then.
3. Re-decide the access-token blocklist fail-mode now that the alert is real (§1.1).
4. Decide `issueRefreshToken` / `revokeRefreshToken` behaviour during an outage (§1.2).
5. If any image was ever built and pushed from a developer checkout, treat
   `apps/backend/keys/private.pem` as disclosed and rotate the certificate
   signing key. The `.dockerignore` fix stops the next image, not the last one.
