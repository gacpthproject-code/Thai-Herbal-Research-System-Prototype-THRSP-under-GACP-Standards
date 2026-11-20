#!/usr/bin/env bash
# Round 4 heavy job (one heavy.sh slot): behavioural RED (round-2 code f806ee7c3 + the round-3/4 test files), GREEN on head (in-memory and real Redis),
# mutants on head, the roster and the flag-on script on seeded data, then the real backend in production
# mode plus the web app for the screenshots. Scratch Postgres + Redis on loopback; every secret in 0600
# files under $J, never in argv; every server is the process we stop (exec; fd 9 of heavy.sh closed).
set -uo pipefail
umask 077
export PATH=/home/ubuntu/.nvm/versions/node/v24.21.0/bin:$PATH
J=/tmp/staff-2fa-golive/round4; L=$J/logs; W=/home/ubuntu/work/wt-2fa; M=/home/ubuntu/work/GACP-Certification-Application
PG=s2fa5-pg; RD=s2fa5-redis
RED_SHA=f806ee7c3; HEAD=$(git -C "$W" rev-parse HEAD)
R=/home/ubuntu/work/wt-2fa-r4-red; X=/home/ubuntu/work/wt-2fa-r4-mut; T=$J/head
SESS=__tests__/integration/staff-2fa-sessions-revoked-real-postgres.test.js
ONE=__tests__/integration/staff-2fa-one-code-rebind-real-postgres.test.js
RESET=__tests__/integration/staff-2fa-emergency-reset-real-postgres.test.js
REBIND=__tests__/integration/staff-2fa-backup-code-rebind-real-postgres.test.js
DOORS=__tests__/integration/staff-doors-force-2fa-setup-real-postgres.test.js
UNITS="__tests__/unit/a-locked-out-officer-can-still-enrol.test.js __tests__/unit/staff-2fa-emergency-reset-refuses.test.js __tests__/unit/session-epoch-refresh.test.js __tests__/unit/staff-mint-boundary-forces-second-factor.test.js __tests__/unit/mfa-setup-reenrol.test.js __tests__/unit/mfa-reenrol-hardening.test.js __tests__/unit/the-enrolment-loop-closes-end-to-end.test.js __tests__/unit/second-factor-doors.test.js __tests__/integration/mfa-roundtrip.test.js __tests__/unit/notification-preferences-service.test.js __tests__/unit/refresh-token-blocklist.test.js __tests__/unit/disabled-account-cannot-hold-session.test.js __tests__/unit/closing-review-fixes.test.js"
mkdir -p "$L" "$J/keys" "$J/shots"
echo "job start $(date +%H:%M:%S) head=$HEAD red=$RED_SHA (round 4)" > "$L/job.txt"
SRV=; WEB=

stop_pid() { # $1 pid; the backend handles SIGTERM itself and may not exit: KILL after five seconds
  local pid=$1
  [ -n "$pid" ] || return 0
  kill -TERM "$pid" 2>/dev/null
  for i in $(seq 1 10); do kill -0 "$pid" 2>/dev/null || break; sleep 0.5; done
  kill -0 "$pid" 2>/dev/null && { kill -KILL "$pid" 2>/dev/null; echo "pid $pid needed SIGKILL" >> "$L/job.txt"; }
  wait "$pid" 2>/dev/null
}
stop_server() { stop_pid "$SRV"; SRV=; }
stop_web() { stop_pid "$WEB"; WEB=; }
cleanup() {
  stop_server; stop_web
  docker rm -f -v "$PG" "$RD" >/dev/null 2>&1
  for t in "$R" "$X"; do git -C "$M" worktree remove --force "$t" 2>/dev/null; done
  rm -rf "$J/keys" "$J/pg.env" "$J/db.env" "$J/env.sh" "$J/state.json" "$T"
  echo "job end $(date +%H:%M:%S)" >> "$L/job.txt"
}
trap cleanup EXIT

pw=$(openssl rand -hex 16)
printf 'POSTGRES_PASSWORD=%s\nPOSTGRES_DB=gacp_s2fa5\n' "$pw" > "$J/pg.env"
docker run -d --name "$PG" -p 127.0.0.1::5432 --env-file "$J/pg.env" postgres:17-alpine >/dev/null || { echo "postgres container did not start" >> "$L/job.txt"; exit 4; }
docker run -d --name "$RD" -p 127.0.0.1::6379 redis:7-alpine >/dev/null || { echo "redis container did not start" >> "$L/job.txt"; exit 4; }
PGPORT=$(docker port "$PG" 5432/tcp | head -1 | sed 's/.*://'); RDPORT=$(docker port "$RD" 6379/tcp | head -1 | sed 's/.*://')
[ -n "$PGPORT" ] && [ -n "$RDPORT" ] || { echo "could not read container ports" >> "$L/job.txt"; exit 4; }
rnd() { openssl rand -hex 24; }
{
  printf 'export DATABASE_URL=postgresql://postgres:%s@127.0.0.1:%s/gacp_s2fa5\n' "$pw" "$PGPORT"
  printf 'export ENCRYPTION_KEY=%s\n' "$(openssl rand -hex 16)"
  printf 'export HEALTH_JWT_SECRET=%s\nexport PROVIDER_JWT_SECRET=%s\n' "$(rnd)" "$(rnd)"
} > "$J/db.env"
REDIS_SCRATCH=redis://127.0.0.1:$RDPORT
ready=0
for i in $(seq 1 30); do docker exec "$PG" pg_isready -U postgres -d gacp_s2fa5 >/dev/null 2>&1 && { ready=1; break; }; sleep 2; done
[ "$ready" = 1 ] || { echo "postgres never became ready" >> "$L/job.txt"; exit 4; }
# shellcheck disable=SC1091
source "$J/db.env"
case "$DATABASE_URL" in *127.0.0.1:$PGPORT/gacp_s2fa5) ;; *) echo "scratch DATABASE_URL assertion failed" >> "$L/job.txt"; exit 2;; esac
export PAYMENT_ADAPTER=mock NODE_OPTIONS=--max-old-space-size=3072 SIGNING_KEY_DIR="$J/keys" NODE_ENV=test
(cd "$W/apps/backend" && npx prisma migrate deploy --schema prisma/schema > "$L/migrate.txt" 2>&1); mig=$?
[ "$mig" = 0 ] || { echo "migrate deploy failed (exit $mig): $(grep -iE 'error|P10' "$L/migrate.txt" | head -2 | tr '\n' ' ')" >> "$L/job.txt"; exit 4; }
echo "scratch db on 127.0.0.1:$PGPORT redis on 127.0.0.1:$RDPORT migrate ok" >> "$L/job.txt"

runjest() { # $1 tree, $2 label, $3... test files
  local tree=$1 label=$2; shift 2
  (cd "$tree/apps/backend" && npx jest --config jest.config.cjs --runInBand "$@" 2>&1 \
    | grep -vE '^\s+at |node_modules/|^\s*$' > "$L/$label.txt"; echo "jest exit ${PIPESTATUS[0]}" >> "$L/$label.txt")
  local summary; summary=$(grep -E '^Tests:' "$L/$label.txt" | head -1)
  case "$summary" in *passed*|*failed*) ;; *) summary="$summary SKIPPED-ONLY (no database?)";; esac
  echo "$label: $summary $(tail -1 "$L/$label.txt")" >> "$L/job.txt"
}
link_modules() { for d in node_modules apps/backend/node_modules apps/web-app/node_modules; do ln -sfn "$M/$d" "$1/$d"; done; }
mutant() { # $1 label, $2 file under apps/backend, $3 sed expression, $4... test files (runs in $X); REDIS_FOR_MUTANT=1 adds the real store
  local label=$1 file=$2 expr=$3; shift 3
  git -C "$X" checkout -q -- .
  sed -i "$expr" "$X/apps/backend/$file"
  if git -C "$X" diff --quiet -- "apps/backend/$file"; then echo "$label: mutation did not apply" >> "$L/job.txt"; return; fi
  git -C "$X" diff -- "apps/backend/$file" > "$L/$label.diff"
  if [ "${REDIS_FOR_MUTANT:-0}" = 1 ]; then GACP_TEST_REDIS_URL=$REDIS_SCRATCH runjest "$X" "$label" "$@"; else runjest "$X" "$label" "$@"; fi
  git -C "$X" checkout -q -- .
}

# 1. behavioural RED: the round-2 code (f806ee7c3) with the current test files on top. The suites
# jest.mock the proof store by path, which f806ee7c3 lacks, so that one module (no caller there)
# is copied in too; every failure that remains is the old behaviour, not a missing file.
git -C "$M" worktree add --detach "$R" "$RED_SHA" >/dev/null 2>&1 && link_modules "$R"
mkdir -p "$R/apps/backend/services/auth"
for f in "$SESS" "$ONE" "$RESET" services/auth/mfa-rebind-proof-store.js; do cp "$W/apps/backend/$f" "$R/apps/backend/$f"; done
echo "red tree: $RED_SHA + $(git -C "$R" status --porcelain | wc -l) copied files" >> "$L/job.txt"
runjest "$R" red-$RED_SHA-sessions "$SESS"
runjest "$R" red-$RED_SHA-one-code "$ONE"
runjest "$R" red-$RED_SHA-reset "$RESET"

# 2. GREEN on head, in-memory stores then the real Redis
runjest "$W" green-head-sessions "$SESS"
runjest "$W" green-head-one-code "$ONE"
runjest "$W" green-head-reset "$RESET"
runjest "$W" green-head-rebind "$REBIND"
runjest "$W" green-head-doors "$DOORS"
GACP_TEST_REDIS_URL=$REDIS_SCRATCH runjest "$W" green-head-sessions-real-redis "$SESS"
GACP_TEST_REDIS_URL=$REDIS_SCRATCH runjest "$W" green-head-one-code-real-redis "$ONE"
GACP_TEST_REDIS_URL=$REDIS_SCRATCH runjest "$W" green-head-rebind-real-redis "$REBIND"
runjest "$W" green-head-units $UNITS

# 3. mutants on head: each must turn its suite red
git -C "$M" worktree add --detach "$X" "$HEAD" >/dev/null 2>&1 && link_modules "$X"
mutant mutant-R1-reset-no-epoch scripts/ops/staff-2fa-emergency-reset.js "s/twoFactorBackupCodes: null, sessionsRevokedAt: stamp }/twoFactorBackupCodes: null }/" "$SESS"
REDIS_FOR_MUTANT=1 mutant mutant-R2-reset-keeps-redis-slot scripts/ops/staff-2fa-emergency-reset.js "s/await clearStore(store, target.id);/void store;/" "$SESS"
mutant mutant-R3-move-revokes-performer routes/api/identity/mfa.js "s/iat: stampSec,/iat: stampSec - 2,/" "$SESS"
mutant mutant-R4-move-leaves-other-device services/identity-service.js "s/^\(\s*\)sessionsRevokedAt,$/\1sessionsRevokedAt: undefined,/" "$SESS"
mutant mutant-R5-backup-code-not-atomic services/identity-service.js 's/AND "twoFactorBackupCodes" @> ${needle}::jsonb`;/AND true`;/' "$ONE"
mutant mutant-R6-admin-notice-dropped services/identity-service.js "s/await notifySameSideAdmins(tx, user, { ...adminNoticeData, event: 'MOVED' });/void adminNoticeData;/" "$SESS"
mutant mutant-R7-flag-on-no-stamp scripts/ops/staff-sessions-revoke-at-flag-on.js 's/UPDATE "users" SET "sessionsRevokedAt" = ${stamp}/UPDATE "users" SET "updatedAt" = now()/' "$SESS"
mutant mutant-R8-guard-ignores-epoch middleware/mfa-setup-guard.js "s/if (isTokenBeforeSessionEpoch(decoded, user.sessionsRevokedAt)) {/if (false) {/" "$ONE"
REDIS_FOR_MUTANT=1 mutant mutant-R9-proof-reusable services/auth/mfa-rebind-proof-store.js "s/return (await client.del(keyFor(userId))) === 1;/return true;/" "$ONE"
mutant mutant-R10-staff-may-disable routes/api/identity/mfa.js "s/if (staffMayNotDisable(req)) {/if (false) {/" "$ONE"

# 4. the roster and the flag-on script on seeded data (role spelt with case and spaces, one EMAIL row)
export ROUND3_TREE=$W ROUND3_STATE=$J/state.json
(cd "$W/apps/backend" && node "$W/evidence/staff-2fa-golive/harness/seed-round3.js") > "$L/seed.txt" 2>&1 || { echo "seed failed: $(tail -1 "$L/seed.txt")" >> "$L/job.txt"; exit 5; }
(cd "$W/apps/backend" && node -e '
  const { PrismaClient } = require("@prisma/client"); const crypto = require("crypto");
  const s = JSON.parse(require("fs").readFileSync(process.env.ROUND3_STATE, "utf8"));
  (async () => { const p = new PrismaClient();
    const nid = () => { const d = Array.from({ length: 12 }, () => crypto.randomInt(0, 10)); d[0] = 1; const sum = d.reduce((a, x, i) => a + x * (13 - i), 0); d.push((11 - (sum % 11)) % 10); return d.join(""); };
    for (const [role, last, extra] of [[" Document_Reviewer ", "สะกดต่าง", {}], ["dispatcher", "วิธีเดิมที่ปลดแล้ว", { twoFactorEnabled: true, twoFactorMethod: "EMAIL" }]]) {
      const n = nid(); await p.user.create({ data: { canonicalId: `s2fa-r3-x-${last}-${Date.now()}`, password: "x", role, status: "ACTIVE", firstName: "ทดสอบ", lastName: last, email: `s2fa-r3-${last}@example.test`, organizationId: s.orgId, accountType: "PROVIDER", authType: "PROVIDER_ID", providerId: n, providerIdHash: crypto.createHash("sha256").update(n).digest("hex"), ...extra } });
    }
    await p.$disconnect(); })();
') >> "$L/seed.txt" 2>&1
(cd "$W/apps/backend" && node scripts/ops/staff-mfa-roster.js) > "$L/roster-before-flag-on.txt" 2>&1; echo "roster exit $?" >> "$L/roster-before-flag-on.txt"
(cd "$W/apps/backend" && REQUIRE_MFA_FOR_PRIVILEGED=false node scripts/ops/staff-sessions-revoke-at-flag-on.js --note "job-round4 flag off") > "$L/flag-on-script-refused.txt" 2>&1; echo "exit $?" >> "$L/flag-on-script-refused.txt"
(cd "$W/apps/backend" && REQUIRE_MFA_FOR_PRIVILEGED=true node scripts/ops/staff-sessions-revoke-at-flag-on.js --note "job-round4 flag on") > "$L/flag-on-script.txt" 2>&1; echo "exit $?" >> "$L/flag-on-script.txt"
(cd "$W/apps/backend" && node scripts/ops/staff-mfa-roster.js) > "$L/roster-after-flag-on.txt" 2>&1; echo "roster exit $?" >> "$L/roster-after-flag-on.txt"
echo "roster rows (case-variant role found): $(grep -c 'สะกดต่าง' "$L/roster-after-flag-on.txt") · EMAIL row: $(grep -c 'วิธีเดิมที่ปลดแล้ว)' "$L/roster-after-flag-on.txt") · summary: $(grep '^สรุป' "$L/roster-after-flag-on.txt")" >> "$L/job.txt"
echo "flag-on script: $(tail -2 "$L/flag-on-script.txt" | tr '\n' ' ') · refused run: $(tail -1 "$L/flag-on-script-refused.txt")" >> "$L/job.txt"

# 5. the real backend (production mode) from an export of head, then the web app, then the screens
mkdir -p "$T" && (cd "$W" && git archive HEAD apps scripts packages package.json .nvmrc jest.config.cjs tsconfig.json pnpm-workspace.yaml 2>/dev/null | tar -x -C "$T")
link_modules "$T"
export ROUND3_TREE=$T
{
  printf 'export REDIS_URL=%s\n' "$REDIS_SCRATCH"
  for k in MASTER_ENCRYPTION_KEY HMAC_KEY SESSION_SECRET PAYMENT_WEBHOOK_SECRET RSA_PRIVATE_KEY_PASSPHRASE; do printf 'export %s=%s\n' "$k" "$(rnd)"; done
  printf 'export PLATFORM_BANK_ACCOUNT_NO=000-0-00000-0\nexport PLATFORM_BANK_NAME=scratch-bank\n'
  printf 'export APP_PUBLIC_URL=https://round3.invalid\nexport PUBLIC_TRACE_URL=https://round3.invalid/trace\nexport TRACE_BASE_URL=https://round3.invalid\n'
  printf 'export STORAGE_PROVIDER=local\nexport TRUST_PRIVATE_PROXY_RANGES=true\nexport LOG_LEVEL=info\nexport SIGNING_KEY_FINGERPRINT=\n'
  for k in DB_USER DB_PASSWORD DB_NAME JWT_SECRET DTAM_JWT_SECRET JWT_EXPIRES_IN HOST CORS_ORIGIN RATE_LIMIT_WINDOW_MS RATE_LIMIT_MAX_REQUESTS E2E_SECRET ENABLE_E2E_ROUTES ENABLE_SWAGGER STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET MFA_CHALLENGE_BIND_ENFORCE LEGACY_NO_JTI_GRACE_UNTIL LEGACY_UNTYPED_TOKEN_GRACE_UNTIL ALLOW_PENDING_SECRETS; do printf 'export %s=\n' "$k"; done
} > "$J/env.sh"
# shellcheck disable=SC1091
source "$J/env.sh"
node -e '
  const crypto = require("crypto"); const fs = require("fs"); const path = require("path");
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem", cipher: "aes-256-cbc", passphrase: process.env.RSA_PRIVATE_KEY_PASSPHRASE } });
  const dir = path.join(process.env.ROUND3_TREE, "apps/backend/keys"); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "private.pem"), privateKey, { mode: 0o600 }); fs.writeFileSync(path.join(dir, "public.pem"), publicKey, { mode: 0o600 });
' || { echo "scratch signing key failed" >> "$L/job.txt"; exit 4; }
PORT=$(node -e 'const s=require("net").createServer().listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close();})')
WEBPORT=$(node -e 'const s=require("net").createServer().listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close();})')
export PORT
serve() { # $1 flag value, $2 label
  (cd "$T/apps/backend" && exec env NODE_ENV=production REQUIRE_MFA_FOR_PRIVILEGED="$1" node "$W/evidence/staff-2fa-golive/harness/launch-round3.js" > "$L/serve-$2.log" 2>&1 9>&-) &
  SRV=$!
  for i in $(seq 1 60); do curl -s -m 2 -o /dev/null "http://127.0.0.1:$PORT/api/health" && break; sleep 1; done
  echo "serve $2: pid=$SRV comm=$(ps -o comm= -p "$SRV" 2>/dev/null) listening=$(ss -ltn 2>/dev/null | grep -c "127.0.0.1:$PORT ") fd9=$(readlink /proc/"$SRV"/fd/9 2>/dev/null || echo closed) health=$(curl -s -m 2 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/health")" >> "$L/job.txt"
}
serve true flag-on
(cd "$T/apps/web-app" && exec env NODE_ENV=development INTERNAL_API_URL="http://127.0.0.1:$PORT" NEXT_PUBLIC_API_URL="http://127.0.0.1:$WEBPORT" NODE_OPTIONS=--max-old-space-size=3072 npx next dev -p "$WEBPORT" -H 127.0.0.1 > "$L/web.log" 2>&1 9>&-) &
WEB=$!
for i in $(seq 1 120); do curl -s -m 5 -o /dev/null "http://127.0.0.1:$WEBPORT/auth/provider/login" && break; sleep 2; done
echo "web: pid=$WEB comm=$(ps -o comm= -p "$WEB" 2>/dev/null) status=$(curl -s -m 20 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$WEBPORT/auth/provider/login")" >> "$L/job.txt"
# next dev compiles a route on its first request: warm the routes the capture visits so the browser never waits on a compile
for route in /auth/provider/login /provider/dashboard /provider/profile/security /provider/notifications /provider/profile/notifications; do curl -s -m 180 -o /dev/null "http://127.0.0.1:$WEBPORT$route"; done
echo "web routes warmed $(date +%H:%M:%S)" >> "$L/job.txt"
node "$W/evidence/staff-2fa-golive/harness/capture-round3.mjs" "http://127.0.0.1:$WEBPORT" "$J/shots" flag-on > "$L/capture-flag-on.json" 2> "$L/capture-flag-on.err"
echo "capture flag-on: $(grep -c '"name"' "$L/capture-flag-on.json") entries · errors: $(grep -c '"error"' "$L/capture-flag-on.json")" >> "$L/job.txt"
stop_server; echo "after stop (on): listening=$(ss -ltn 2>/dev/null | grep -c "127.0.0.1:$PORT ")" >> "$L/job.txt"
serve false flag-off
node "$W/evidence/staff-2fa-golive/harness/capture-round3.mjs" "http://127.0.0.1:$WEBPORT" "$J/shots" flag-off > "$L/capture-flag-off.json" 2> "$L/capture-flag-off.err"
echo "capture flag-off: $(grep -c '"name"' "$L/capture-flag-off.json") entries · errors: $(grep -c '"error"' "$L/capture-flag-off.json")" >> "$L/job.txt"
stop_server; stop_web
echo "after stop (off): listening=$(ss -ltn 2>/dev/null | grep -c "127.0.0.1:$PORT ") web=$(ss -ltn 2>/dev/null | grep -c "127.0.0.1:$WEBPORT ")" >> "$L/job.txt"
ls "$J/shots" >> "$L/job.txt"
