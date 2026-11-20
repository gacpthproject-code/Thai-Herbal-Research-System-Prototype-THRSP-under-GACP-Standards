## W7 preview stack (preview.gacpth.com) — 2026-08-22

Status: BLOCKED(operator:Cloudflare DNS A `preview` → 43.134.175.51 proxied, then Tier C merge)

Did:
- Worktree `C:/Users/charo/Documents/GitHub/gacp-wt-preview`, branch `feat/preview-stack` from main 687494c6. Nothing staged, nothing committed.
- `docker-compose.preview.yml` — 2 services only, `name: gacp-preview`, ports 127.0.0.1:8002/3002, external `gacp-network` for `gacp-redis`, own volumes `gacp-preview-{uploads,storage,signing-keys}`.
- `.env.preview.example`, `deploy/nginx/preview.gacpth.com.conf`, `scripts/deploy/deploy-preview.sh`, `docs/operations/runbooks/preview-stack.md` (Thai).
- `.gitignore` +1 line: `.env.*` also swallowed `.env.preview.example` and `!.env.example` is an exact match, so the template was untrackable. Verified with `git status --short`.
- Preview host allowlisted via env, not code: `PUBLIC_VERIFY_HOST_ALLOWLIST=gacpth.com,staging.gacpth.com,preview.gacpth.com` on the frontend container (`apps/web-app/src/lib/verify/public-verify-url.ts:74-90` — setting the var REPLACES the built-in list, so all three hosts are named). Backend CORS comes from `CORS_ORIGIN`/`FRONTEND_URL`/`APP_PUBLIC_URL` (`apps/backend/server.js:135-140`).
- Volumes: preview gets its OWN, not the staging pair. Those volumes hold files whose rows live in `gacp_staging`; preview reads Supabase, so reuse would show files nothing references and hide files preview rows do reference. It also keeps `docker volume rm gacp_staging_*` during retirement from deleting preview data, and stops two stacks writing one RSA keyDir.
- `NODE_ENV=staging` checked, not assumed: `env-validator.js` treats it as neither production nor development, so NOTHING is validated at boot; `server.js:87` keeps stack traces off and CSP on; `server.js:141+` uses the developer-port CORS defaults plus the env-driven origins.

Blocked:
- Operator only: the Cloudflare DNS record (a) and SSL mode Full. Everything else is coordinator-runnable.
- Tier C merge (compose/env/nginx/deploy) — operator, per L5.

Next:
1. Operator adds DNS; coordinator runs runbook (b)-(f) on the box and pastes real output.
2. Retire `gacp-*-staging` per (g) after preview passes (f). Keep the staging volumes one week.
3. Consider promoting preview to staging per (h) — nginx upstream repoint only, no rebuild.

Evidence (all run in this session, on this laptop):
- `reports/design-cleanup-2026-08-21/W7-compose-parse.txt` — YAML parse + `${}` resolve. `docker compose config` was NOT run: no Docker here.
- `reports/design-cleanup-2026-08-21/W7-script-checks.txt` — `bash -n` PASS; shellcheck NOT INSTALLED, not run; `--help` and unknown-arg paths exercised.
- `reports/design-cleanup-2026-08-21/W7-nginx-xcheck.txt` — every directive in staging's 443 block accounted for in preview's; `nginx -t` was NOT run: no nginx here.
- `reports/design-cleanup-2026-08-21/W7-tier-check.txt` — TIER=C.
- `reports/design-cleanup-2026-08-21/W7-no-secret.txt` — probe run: BLOCKED (layer-1 grep 0 hits, no deep scanner locally).
- `reports/design-cleanup-2026-08-21/W7-slot-pin-test.txt` — `staging-slot-compose-pin.test.js` 2/2 PASS with the new compose file present (that test scans every `docker-compose*.yml`).

### Gate includes the coordinator must confirm on the box before `nginx -t`

Declared at http scope by `deploy/nginx/gacp-platform.conf`, installed under `/etc/nginx/conf.d`:
`$gacp_prelaunch_blocked_ip` (geo) · `$gacp_prelaunch_exempt` (map) · `$gacp_gate_cookie_ok` (map, which `include`s `/etc/nginx/gacp-gate-token.conf`, root:root 600, untracked) · `$gacp_prelaunch_deny` (map) · `$connection_upgrade` (map) · the `set_real_ip_from` Cloudflare set with `real_ip_header CF-Connecting-IP`. Any one missing → `nginx -t` fails with `unknown variable`, which is the correct way for that to surface.

### Design calls worth a reviewer's attention

1. **Preview bypasses Docker nginx.** Staging proxies to 127.0.0.1:8080 and lets that container pick its upstream from `$host`. Adding preview to that map means editing `nginx/gacp.production.conf`, and reloading it needs `docker restart gacp-nginx` (production stalls 3-5 s — trap #1 in the build runbook). Not worth it for a hidden environment. The cost is paid explicitly: the security-header set, the `/api/session/` → frontend split and the `= /api/webapp-version` carve-out are all restated in the preview vhost.
2. **No rate limiting on preview.** `limit_req_zone api_general/api_auth/api_upload` are declared in Docker nginx's http block and do not exist on the host; naming them in a host vhost fails `nginx -t`. The prelaunch gate (deny by default) is the control. Flagged in the runbook as the first thing to fix if preview is ever opened.
3. **`INTERNAL_API_URL` is set explicitly and must stay set.** `apps/web-app/src/config/server.config.ts:18-32` falls back to `http://backend:8000`, and on this box `backend` is a REAL container — PRODUCTION's, on the shared `gacp-network`. Unset does not fail loudly; it silently proxies preview traffic into production. The staging compose has this same gap today.
4. **No `GACP_DEPLOY_SLOT` in the preview compose, deliberately.** `staging-slot-compose-pin.test.js:39-51` scans every `docker-compose*.yml` by directory discovery and fails if the marker appears anywhere but the staging overlay. Consequence: preview has NO mock IdP and uses the real auth providers. Documented in the runbook.
5. **`NEXT_PUBLIC_*` set only as build-args.** Trap #3: those are inlined by `next build`, so the runtime `NEXT_PUBLIC_API_URL` line the staging compose carries is inert. The preview compose does not repeat it; the deploy script passes `--build-arg NEXT_PUBLIC_API_URL=https://preview.gacpth.com` (bare origin, no `/api` — trap #1) and fails the build if docker reports unconsumed build-args (trap #2).
6. **`.env.preview` is injected into the backend only.** The frontend service has no `env_file`; every value it needs is non-secret and listed explicitly, so the DB URL and the JWT/encryption keys never enter the frontend container.
7. **`BILLING_FREE_TIER_FOR_ALL=true`** is stated in the compose file rather than hidden in the env file, because it changes what fee pages show and preview shares its database with laptop testing. Mirrors staging; reverse it if that is wrong.

### What this does not fix

- **Uploaded files do not follow the database.** Preview shares the Supabase dev DB with the laptop but has its own uploads volume, so document rows written from the laptop have no file on preview and vice versa. A shared object store is the real fix and is out of scope.
- **Old certificate signatures will not verify on preview.** Certificates minted from the laptop were signed by the laptop's RSA keypair and the schema stores only `signatureKeyId`, no public key (`apps/backend/prisma/schema/certification.prisma:99-107`). The runbook has an optional one-time keypair copy, which also requires `RSA_PRIVATE_KEY_PASSPHRASE` to match.
- **Nothing has been run on the box.** `docker compose config` and `nginx -t` are both un-run here, by absence of the tools, not by choice. Every runtime claim in the runbook is PENDING until the coordinator pastes real output.
- **`no-secret.sh` returned BLOCKED, not PASS** (`W7-no-secret.txt`): layer-1 grep passed with 0 hits, but no deep scanner ran locally (gitleaks absent). That is the probe honouring its own fail-loud contract, and it means L2 is unproven here — TruffleHog in CI is layer 2. A targeted grep over the five new files for `postgresql://` with real credentials, `sk_/pk_/whsec_`, JWTs, AWS keys, PEM headers and the redis default password also returned zero hits; neither grep substitutes for the probe.
