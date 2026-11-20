#!/usr/bin/env bash
# launch-guards-1 items 1, 4, 5: RED (029ad225b tests on main code), GREEN (branch head) + neighbours, item 5 clock runs,
# then a scratch stack (PG17 + Redis + backend + next dev) per phase for the screenshots: main 88bd8f820, branch.
set -uo pipefail
umask 077
export PATH=/home/ubuntu/.nvm/versions/node/v24.21.0/bin:$PATH
R=/home/ubuntu/work/state/reviews/launch-guards-1-runs; L=$R/logs; P=$R/private
RED=/home/ubuntu/work/wt-guards1-red; BR=/home/ubuntu/work/wt-guards1; MAINT=/home/ubuntu/work/wt-guards1-main
PG=lg1-pg; RD=lg1-redis; PGPORT=5441; RDPORT=6391; BPORT=8741; WPORT=3741
mkdir -p "$L" "$P"
log() { echo "$(date +%H:%M:%S) $*" | tee -a "$L/job.txt"; }
SRV=; WEB=
killpid() { [ -n "$1" ] || return 0; kill -TERM "$1" 2>/dev/null; for i in $(seq 1 20); do kill -0 "$1" 2>/dev/null || return 0; sleep 0.5; done; kill -KILL "$1" 2>/dev/null; }
stop_stack() { killpid "$SRV"; SRV=; if [ -n "$WEB" ]; then pkill -TERM -P "$WEB" 2>/dev/null; pkill -TERM -f "next dev -p $WPORT" 2>/dev/null; killpid "$WEB"; WEB=; fi; }
cleanup() { rm -f "$BR/apps/backend/__tests__/integration/field-audit-clock-debug.test.js"; stop_stack; docker rm -f -v "$PG" "$RD" >/dev/null 2>&1; rm -rf "$P"; for t in "$BR" "$MAINT" "$RED"; do rm -f "$t/apps/backend/keys/private.pem" "$t/apps/backend/keys/public.pem" "$t/apps/backend/jest.pin.config.cjs"; done; log "job end"; }
trap cleanup EXIT
log "job start branch=$(git -C $BR rev-parse --short HEAD) red=$(git -C $RED rev-parse --short HEAD) main=$(git -C $MAINT rev-parse --short HEAD) mem_avail_mb=$(free -m | awk '/Mem:/{print $7}')"

fresh_pg() {
  docker rm -f -v "$PG" >/dev/null 2>&1
  docker run -d --name "$PG" -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=lg1 -p 127.0.0.1:$PGPORT:5432 postgres:17-alpine >/dev/null || { log "pg did not start"; exit 4; }
  for i in $(seq 1 60); do docker exec "$PG" psql -U postgres -d lg1 -tAc 'select 1' >/dev/null 2>&1 && return 0; sleep 1; done
  log "pg never ready"; exit 4
}
export DATABASE_URL="postgresql://postgres@127.0.0.1:$PGPORT/lg1?schema=public"
export TEST_DATABASE_URL="$DATABASE_URL"
migrate() { (cd "$1/apps/backend" && npx prisma migrate deploy > "$L/migrate-$2.txt" 2>&1) || { log "migrate $2 failed"; exit 4; }; }
runjest() { # $1 tree $2 label $3.. files
  local tree=$1 label=$2; shift 2
  (cd "$tree/apps/backend" && NODE_OPTIONS=--max-old-space-size=3072 npx jest --runInBand "$@" 2>&1 | grep -vE '^\s+at |^\s*$' > "$L/$label.txt"; echo "jest exit ${PIPESTATUS[0]}" >> "$L/$label.txt")
  log "$label: $(grep -E '^Tests:' "$L/$label.txt" | head -1) | $(tail -1 "$L/$label.txt") | failed: $(grep -E '^\s+✕' "$L/$label.txt" | sed 's/^ *✕ //' | cut -c1-110 | tr '\n' ';')"
}
runweb() { # $1 tree $2 label $3.. paths
  local tree=$1 label=$2; shift 2
  (cd "$tree/apps/web-app" && NODE_OPTIONS=--max-old-space-size=3072 npx jest "$@" > "$L/$label.txt" 2>&1; echo "jest exit $?" >> "$L/$label.txt")
  log "$label: $(grep -E '^Tests:' "$L/$label.txt" | head -1) | $(tail -1 "$L/$label.txt") | failed: $(grep -E '^\s+✕' "$L/$label.txt" | sed 's/^ *✕ //' | cut -c1-110 | tr '\n' ';')"
}
CHANGED="__tests__/unit/refusal-waits-for-appeal-setup.test.js __tests__/integration/approver-decision-tools-real-postgres.test.js __tests__/integration/approver-decides-a-file-that-did-not-pass-real-postgres.test.js __tests__/integration/admin-doors-around-the-certification-decision-real-postgres.test.js"
WEBT="src/app/provider/certification-decisions src/app/health/planting/new"

fresh_pg; migrate "$BR" branch2
runjest "$BR" green2-backend __tests__/integration/approver-decides-a-file-that-did-not-pass-real-postgres.test.js __tests__/integration/approver-decision-tools-real-postgres.test.js __tests__/unit/refusal-waits-for-appeal-setup.test.js

if [ "${SKIP_ITEM5:-0}" != 1 ]; then
cp "$R/bin/field-audit-clock-debug.test.js" "$BR/apps/backend/__tests__/integration/field-audit-clock-debug.test.js"
cat > "$BR/apps/backend/jest.pin.config.cjs" <<CFG
const base = require('./jest.config.cjs');
module.exports = { ...base, setupFilesAfterEnv: [...base.setupFilesAfterEnv, '$R/bin/pin-clock.setup.js'] };
CFG
for pin in ${PINS:-real 2026-10-22T01:00:00Z 2026-10-22T04:30:00Z 2026-10-22T06:00:00Z 2026-10-22T09:30:00Z 2026-10-22T12:00:00Z 2026-10-22T16:30:00Z}; do
  fresh_pg; migrate "$BR" item5
  for n in $(seq 1 ${REPS:-3}); do
    out="$L/item5dbg-${pin//:/-}-$n.txt"
    if [ "$pin" = real ]; then unset PIN_CLOCK; else export PIN_CLOCK="$pin"; fi
    (cd "$BR/apps/backend" && NODE_OPTIONS=--max-old-space-size=3072 npx jest -c jest.pin.config.cjs --runInBand __tests__/integration/field-audit-clock-debug.test.js 2>&1 | grep -vE '^\s+at ' > "$out"; echo "jest exit ${PIPESTATUS[0]}" >> "$out")
    log "item5dbg pin=$pin run=$n: $(grep -E '^Tests:' "$out" | head -1) $(grep -o 'DEBUG409.*' "$out" | cut -c1-400) | failed: $(grep -E '^\s+✕' "$out" | sed 's/^ *✕ //' | cut -c1-90 | tr '\n' ';')"
  done
done
unset PIN_CLOCK
rm -f "$BR/apps/backend/jest.pin.config.cjs" "$BR/apps/backend/__tests__/integration/field-audit-clock-debug.test.js"
fi

[ "${SKIP_WALK:-0}" = 1 ] && exit 0
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

phase() { # $1 name $2 tree
  local name=$1 tree=$2
  fresh_pg; migrate "$tree" "walk-$name"
  # shellcheck disable=SC1091
  ( source "$P/env.sh"; RV_TREE="$tree" node -e '
    const crypto=require("crypto"),fs=require("fs"),path=require("path");
    const {publicKey,privateKey}=crypto.generateKeyPairSync("rsa",{modulusLength:2048,publicKeyEncoding:{type:"spki",format:"pem"},privateKeyEncoding:{type:"pkcs8",format:"pem",cipher:"aes-256-cbc",passphrase:process.env.RSA_PRIVATE_KEY_PASSPHRASE}});
    const dir=path.join(process.env.RV_TREE,"apps/backend/keys"); fs.mkdirSync(dir,{recursive:true});
    fs.writeFileSync(path.join(dir,"private.pem"),privateKey,{mode:0o600});fs.writeFileSync(path.join(dir,"public.pem"),publicKey,{mode:0o600});' ) || { log "key failed"; return 4; }
  # shellcheck disable=SC1091
  ( source "$P/env.sh"; cd "$tree/apps/backend" && node "$R/bin/fixtures.js" "$name" >> "$L/fixtures-$name.txt" 2>&1 ) || { log "fixtures $name failed: $(tail -2 $L/fixtures-$name.txt)"; return 4; }
  log "fixtures $name: $(tail -1 $L/fixtures-$name.txt)"
  # shellcheck disable=SC1091
  ( source "$P/env.sh"; cd "$tree/apps/backend" && exec env NODE_ENV=production PORT=$BPORT RV_TREE="$tree" node "$R/bin/launch.js" > "$L/serve-$name.log" 2>&1 9>&- ) & SRV=$!
  ( cd "$tree/apps/web-app" && exec env INTERNAL_API_URL=http://127.0.0.1:$BPORT NODE_OPTIONS=--max-old-space-size=3072 npx next dev -p $WPORT -H 127.0.0.1 > "$L/web-$name.log" 2>&1 9>&- ) & WEB=$!
  for i in $(seq 1 120); do curl -s -m 2 -o /dev/null "http://127.0.0.1:$BPORT/api/health" && break; sleep 1; done
  for i in $(seq 1 180); do curl -s -m 5 -o /dev/null "http://127.0.0.1:$WPORT/" && break; sleep 1; done
  log "phase $name up: backend=$(curl -s -m 2 -o /dev/null -w '%{http_code}' http://127.0.0.1:$BPORT/api/health) web=$(curl -s -m 60 -o /dev/null -w '%{http_code}' http://127.0.0.1:$WPORT/)"
  ( cd "$tree/apps/backend" && WPORT=$WPORT node "$R/bin/walk.js" "$name" not-set > "$L/walk-$name.txt" 2>&1 ); log "walk $name not-set exit $? $(tail -1 $L/walk-$name.txt)"
  if [ "$name" = branch ]; then
    # shellcheck disable=SC1091
    ( source "$P/env.sh"; cd "$tree/apps/backend" && node scripts/set-appeal-setup.js --effective-from "$(TZ=Asia/Bangkok date +%F)" --time-limit-days 15 --channel "ยื่นหนังสืออุทธรณ์ต่อเจ้าหน้าที่ผู้ออกคำสั่ง (ข้อความทดสอบบนฐานข้อมูลชั่วคราว)" --source-ref "ทดสอบ-scratch" --apply > "$L/set-appeal-$name.txt" 2>&1 ); log "set-appeal-setup exit $? $(tail -1 $L/set-appeal-$name.txt)"
    ( cd "$tree/apps/backend" && WPORT=$WPORT node "$R/bin/walk.js" "$name" appeal-set >> "$L/walk-$name.txt" 2>&1 ); log "walk $name appeal-set exit $?"
  fi
  stop_stack
  log "phase $name down; listening backend=$(ss -ltn | grep -c ":$BPORT ") web=$(ss -ltn | grep -c ":$WPORT ")"
}
phase main "$MAINT"
