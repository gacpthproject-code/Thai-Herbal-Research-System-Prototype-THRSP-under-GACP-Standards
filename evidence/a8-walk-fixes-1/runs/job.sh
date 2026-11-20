#!/usr/bin/env bash
# A8 walk fixes 1: backend RED (b87b0a956, tests on main code) and GREEN (branch head), web tsc,
# then a held scratch stack (PG17 + Redis + backend + next dev + one Chromium) for the browser
# walk: phase "main" (88bd8f820) then phase "branch". Each phase holds until $R/stop-<phase> exists.
set -uo pipefail
umask 077
export PATH=/home/ubuntu/.nvm/versions/node/v24.21.0/bin:$PATH
R=/home/ubuntu/work/state/reviews/a8-walk-fixes-1-runs; L=$R/logs; P=$R/private
RED=/home/ubuntu/work/wt-a8fix1-red; BR=/home/ubuntu/work/wt-a8fix1; MAINT=/home/ubuntu/work/wt-a8fix1-main
PG=a8f1-pg; RD=a8f1-redis; PGPORT=5436; RDPORT=6386; BPORT=8711; WPORT=3711
mkdir -p "$L" "$P"
log() { echo "$(date +%H:%M:%S) $*" | tee -a "$L/job.txt"; }
SRV=; WEB=; BRW=
killpid() { [ -n "$1" ] || return 0; kill -TERM "$1" 2>/dev/null; for i in $(seq 1 20); do kill -0 "$1" 2>/dev/null || return 0; sleep 0.5; done; kill -KILL "$1" 2>/dev/null; }
stop_stack() { killpid "$SRV"; SRV=; pkill -TERM -P "$WEB" 2>/dev/null; killpid "$WEB"; WEB=; }
cleanup() { stop_stack; killpid "$BRW"; docker rm -f -v "$PG" "$RD" >/dev/null 2>&1; rm -rf "$P" "$R/ws"; for t in "$BR" "$MAINT"; do rm -f "$t/apps/backend/keys/private.pem" "$t/apps/backend/keys/public.pem"; done; log "job end"; }
trap cleanup EXIT
log "job start branch=$(git -C $BR rev-parse --short HEAD) red=$(git -C $RED rev-parse --short HEAD) main=$(git -C $MAINT rev-parse --short HEAD) mem_avail_mb=$(free -m | awk '/Mem:/{print $7}')"

fresh_pg() {
  docker rm -f -v "$PG" >/dev/null 2>&1
  docker run -d --name "$PG" -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=a8f1 -p 127.0.0.1:$PGPORT:5432 postgres:17-alpine >/dev/null || { log "pg did not start"; exit 4; }
  for i in $(seq 1 60); do docker exec "$PG" psql -U postgres -d a8f1 -tAc 'select 1' >/dev/null 2>&1 && return 0; sleep 1; done
  log "pg never ready"; exit 4
}
export DATABASE_URL="postgresql://postgres@127.0.0.1:$PGPORT/a8f1?schema=public"
export TEST_DATABASE_URL="$DATABASE_URL"

runjest() { # $1 tree $2 label $3.. files
  local tree=$1 label=$2; shift 2
  (cd "$tree/apps/backend" && NODE_OPTIONS=--max-old-space-size=3072 npx jest --runInBand "$@" 2>&1 | grep -vE '^\s+at |^\s*$' > "$L/$label.txt"; echo "jest exit ${PIPESTATUS[0]}" >> "$L/$label.txt")
  log "$label: $(grep -E '^Tests:' "$L/$label.txt" | head -1) | $(tail -1 "$L/$label.txt") | failed: $(grep -E '^\s+✕' "$L/$label.txt" | sed 's/^ *✕ //' | cut -c1-100 | tr '\n' ';')"
}
CHANGED="__tests__/integration/officer-review-round-trip.test.js __tests__/integration/inspector-not-passed-waits-for-the-approver-real-postgres.test.js __tests__/unit/document-review-service.test.js __tests__/unit/document-review-doors.test.js"

fresh_pg
(cd "$RED/apps/backend" && npx prisma migrate deploy > "$L/migrate-red.txt" 2>&1) || { log "migrate failed"; exit 4; }
# shellcheck disable=SC2086
runjest "$RED" red-backend $CHANGED
fresh_pg
(cd "$BR/apps/backend" && npx prisma migrate deploy > "$L/migrate-branch.txt" 2>&1) || { log "migrate failed"; exit 4; }
# shellcheck disable=SC2086
runjest "$BR" green-backend $CHANGED
NEIGH=$(cd "$BR/apps/backend" && grep -rlE "routes/api/audit/onsite|inspection-result-service|auditor-audit-decision-handler|application-document-review-service|routes/api/applications/requirements|routes/api/provider/document-reviews|error-codes|revision-resubmit|requested-papers" __tests__ | grep -vE "officer-review-round-trip|inspector-not-passed-waits|document-review-service.test|document-review-doors.test" | tr '\n' ' ')
# shellcheck disable=SC2086
runjest "$BR" green-neighbours $NEIGH
(cd "$BR/apps/web-app" && NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit -p tsconfig.json > "$L/web-tsc.txt" 2>&1; echo "tsc exit $?" >> "$L/web-tsc.txt")
log "web tsc: $(tail -1 $L/web-tsc.txt) errors=$(grep -c 'error TS' $L/web-tsc.txt)"
(cd "$MAINT/apps/web-app" && NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit -p tsconfig.json > "$L/web-tsc-main.txt" 2>&1; echo "tsc exit $?" >> "$L/web-tsc-main.txt")
log "web tsc main: $(tail -1 $L/web-tsc-main.txt) errors=$(grep -c 'error TS' $L/web-tsc-main.txt)"

[ "${SKIP_WALK:-0}" = 1 ] && exit 0

# ---- held stack for the browser walk ----
docker rm -f -v "$RD" >/dev/null 2>&1
docker run -d --name "$RD" -p 127.0.0.1:$RDPORT:6379 redis:7-alpine >/dev/null || { log "redis did not start"; exit 4; }
rnd() { openssl rand -hex 24; }
{
  printf 'export REDIS_URL=redis://127.0.0.1:%s\n' "$RDPORT"
  for k in HEALTH_JWT_SECRET PROVIDER_JWT_SECRET MASTER_ENCRYPTION_KEY HMAC_KEY SESSION_SECRET PAYMENT_WEBHOOK_SECRET RSA_PRIVATE_KEY_PASSPHRASE; do printf 'export %s=%s\n' "$k" "$(rnd)"; done
  printf 'export ENCRYPTION_KEY=%s\n' "$(openssl rand -hex 16)"
  printf 'export PLATFORM_BANK_ACCOUNT_NO=000-0-00000-0\nexport PLATFORM_BANK_NAME=scratch-bank\n'
  printf 'export APP_PUBLIC_URL=http://localhost:%s\nexport PUBLIC_TRACE_URL=http://localhost:%s/trace\nexport TRACE_BASE_URL=http://localhost:%s\n' $WPORT $WPORT $WPORT
  printf 'export STORAGE_PROVIDER=local\nexport PAYMENT_ADAPTER=mock\nexport TRUST_PRIVATE_PROXY_RANGES=true\nexport LOG_LEVEL=info\n'
  printf 'export SIGNING_KEY_FINGERPRINT=\nexport SIGNING_KEY_DIR=%s/keys\n' "$P"
  for k in DB_USER DB_PASSWORD DB_NAME JWT_SECRET DTAM_JWT_SECRET JWT_EXPIRES_IN HOST CORS_ORIGIN E2E_SECRET ENABLE_E2E_ROUTES STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET AUTH_THAID_CLIENT_ID AUTH_THAID_CLIENT_SECRET MFA_CHALLENGE_BIND_ENFORCE LEGACY_NO_JTI_GRACE_UNTIL LEGACY_UNTYPED_TOKEN_GRACE_UNTIL ALLOW_PENDING_SECRETS REQUIRE_MFA_FOR_PRIVILEGED GACP_TEST_REDIS_URL; do printf 'export %s=\n' "$k"; done
} > "$P/env.sh"
mkdir -p "$P/keys"
(cd "$R/bin" && node browser-server.js > "$L/browser.txt" 2>&1) & BRW=$!

phase() { # $1 name $2 tree
  local name=$1 tree=$2
  rm -f "$R/stop-$name"
  fresh_pg
  (cd "$tree/apps/backend" && npx prisma migrate deploy > "$L/migrate-walk-$name.txt" 2>&1) || { log "walk migrate failed"; return 4; }
  # shellcheck disable=SC1091
  ( source "$P/env.sh"; RV_TREE="$tree" node -e '
    const crypto=require("crypto"),fs=require("fs"),path=require("path");
    const {publicKey,privateKey}=crypto.generateKeyPairSync("rsa",{modulusLength:2048,publicKeyEncoding:{type:"spki",format:"pem"},privateKeyEncoding:{type:"pkcs8",format:"pem",cipher:"aes-256-cbc",passphrase:process.env.RSA_PRIVATE_KEY_PASSPHRASE}});
    const dir=path.join(process.env.RV_TREE,"apps/backend/keys"); fs.mkdirSync(dir,{recursive:true});
    fs.writeFileSync(path.join(dir,"private.pem"),privateKey,{mode:0o600});fs.writeFileSync(path.join(dir,"public.pem"),publicKey,{mode:0o600});' ) || { log "key failed"; return 4; }
  # shellcheck disable=SC1091
  ( source "$P/env.sh"; cd "$tree/apps/backend" && exec env NODE_ENV=production PORT=$BPORT RV_TREE="$tree" node "$R/bin/launch.js" > "$L/serve-$name.log" 2>&1 9>&- ) & SRV=$!
  ( cd "$tree/apps/web-app" && exec env INTERNAL_API_URL=http://127.0.0.1:$BPORT NODE_OPTIONS=--max-old-space-size=3072 npx next dev -p $WPORT -H 127.0.0.1 > "$L/web-$name.log" 2>&1 9>&- ) & WEB=$!
  for i in $(seq 1 120); do curl -s -m 2 -o /dev/null "http://127.0.0.1:$BPORT/api/health" && break; sleep 1; done
  log "phase $name up: backend=$(curl -s -m 2 -o /dev/null -w '%{http_code}' http://127.0.0.1:$BPORT/api/health) web pid=$WEB tree=$(git -C $tree rev-parse --short HEAD); waiting for $R/stop-$name"
  echo "$name $tree" > "$R/phase"
  local until=$(( $(date +%s) + 7200 ))
  while [ ! -e "$R/stop-$name" ] && [ "$(date +%s)" -lt "$until" ]; do sleep 5; done
  rm -f "$R/phase"
  stop_stack
  log "phase $name down; listening backend=$(ss -ltn | grep -c ":$BPORT ") web=$(ss -ltn | grep -c ":$WPORT ")"
}
phase main "$MAINT"
phase branch "$BR"
touch "$R/stop-browser"
