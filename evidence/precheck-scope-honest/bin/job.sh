#!/usr/bin/env bash
set -euo pipefail
umask 077
T=${1:?tree}; LABEL=${2:?label}
HERE=$(cd "$(dirname "$0")" && pwd)
EV=$(dirname "$HERE")
L=$EV/logs; P=/tmp/psh-private-$LABEL
PG=psh-pg-$LABEL; RD=psh-redis-$LABEL
PGPORT=5471; RDPORT=6421; BPORT=8771; WPORT=3771
INVOICE=/home/ubuntu/work/wt-precheckscope/apps/backend/__tests__/fixtures/document-precheck/corpus/producer_supervision_letter--invoice.pdf
mkdir -p "$L" "$P" "$EV/shots" "$EV/text"
log() { echo "$(date +%H:%M:%S) [$LABEL] $*" | tee -a "$L/$LABEL-job.txt"; }
SRV=; WEB=
killpid() { [ -n "$1" ] || return 0; kill -TERM "$1" 2>/dev/null || true; for i in $(seq 1 20); do kill -0 "$1" 2>/dev/null || return 0; sleep 0.5; done; kill -KILL "$1" 2>/dev/null || true; }
cleanup() {
  set +e
  killpid "$SRV"
  if [ -n "$WEB" ]; then pkill -TERM -P "$WEB" 2>/dev/null; killpid "$WEB"; fi
  for p in $(ss -ltnp 2>/dev/null | grep -E ":($BPORT|$WPORT) " | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u); do killpid "$p"; done
  docker rm -f -v "$PG" "$RD" >/dev/null 2>&1
  rm -f "$T/apps/backend/keys/private.pem" "$T/apps/backend/keys/public.pem"
  rm -rf "$P" "$T/apps/backend/public/uploads/application-drafts"
  log "job end; listening backend=$(ss -ltn | grep -c ":$BPORT ") web=$(ss -ltn | grep -c ":$WPORT ") containers=$(docker ps --format '{{.Names}}' | grep -c "^psh-")"
}
trap cleanup EXIT
rm -f "$L/$LABEL"-*.txt "$EV/shots/$LABEL"-*.png "$EV/text/$LABEL"-*.txt
log "job start tree=$T head=$(git -C "$T" rev-parse --short HEAD) dirty=$(git -C "$T" status --porcelain | wc -l)"

docker run -d --name "$PG" --memory=1g -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=psh -p 127.0.0.1:$PGPORT:5432 postgres:17-alpine >/dev/null
docker run -d --name "$RD" -p 127.0.0.1:$RDPORT:6379 redis:7-alpine >/dev/null
for i in $(seq 1 60); do docker exec "$PG" psql -U postgres -d psh -tAc 'select 1' >/dev/null 2>&1 && break; sleep 1; done
export DATABASE_URL="postgresql://postgres@127.0.0.1:$PGPORT/psh?schema=public"
cd "$T/apps/backend"
npx prisma migrate deploy > "$L/$LABEL-migrate.txt" 2>&1 || { log "migrate failed"; exit 4; }

rnd() { openssl rand -hex 24; }
{
  printf 'export REDIS_URL=redis://127.0.0.1:%s\n' "$RDPORT"
  for k in HEALTH_JWT_SECRET PROVIDER_JWT_SECRET MASTER_ENCRYPTION_KEY HMAC_KEY SESSION_SECRET PAYMENT_WEBHOOK_SECRET RSA_PRIVATE_KEY_PASSPHRASE; do printf 'export %s=%s\n' "$k" "$(rnd)"; done
  printf 'export ENCRYPTION_KEY=%s\n' "$(openssl rand -hex 16)"
  printf 'export PLATFORM_BANK_ACCOUNT_NO=000-0-00000-0\nexport PLATFORM_BANK_NAME=scratch-bank\n'
  printf 'export APP_PUBLIC_URL=http://127.0.0.1:%s\nexport PUBLIC_TRACE_URL=http://127.0.0.1:%s/trace\nexport TRACE_BASE_URL=http://127.0.0.1:%s\n' $WPORT $WPORT $WPORT
  printf 'export STORAGE_PROVIDER=local\nexport PAYMENT_ADAPTER=mock\nexport TRUST_PRIVATE_PROXY_RANGES=true\nexport LOG_LEVEL=info\n'
  printf 'export SIGNING_KEY_FINGERPRINT=\nexport SIGNING_KEY_DIR=%s/keys\n' "$P"
  for k in DB_USER DB_PASSWORD DB_NAME JWT_SECRET DTAM_JWT_SECRET JWT_EXPIRES_IN HOST CORS_ORIGIN E2E_SECRET ENABLE_E2E_ROUTES STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET AUTH_THAID_CLIENT_ID AUTH_THAID_CLIENT_SECRET MFA_CHALLENGE_BIND_ENFORCE LEGACY_NO_JTI_GRACE_UNTIL LEGACY_UNTYPED_TOKEN_GRACE_UNTIL ALLOW_PENDING_SECRETS REQUIRE_MFA_FOR_PRIVILEGED GACP_TEST_REDIS_URL; do printf 'export %s=\n' "$k"; done
} > "$P/env.sh"
mkdir -p "$P/keys"
set +u
# shellcheck disable=SC1091
source "$P/env.sh"
set -u
node -e '
  const crypto=require("crypto"),fs=require("fs");
  const {publicKey,privateKey}=crypto.generateKeyPairSync("rsa",{modulusLength:2048,publicKeyEncoding:{type:"spki",format:"pem"},privateKeyEncoding:{type:"pkcs8",format:"pem",cipher:"aes-256-cbc",passphrase:process.env.RSA_PRIVATE_KEY_PASSPHRASE}});
  fs.writeFileSync("keys/private.pem",privateKey,{mode:0o600});fs.writeFileSync("keys/public.pem",publicKey,{mode:0o600});'
node scripts/seed-herb-requirement-rules.js --apply > "$L/$LABEL-seed-rules.txt" 2>&1 || { log "seed rules failed: $(tail -2 "$L/$LABEL-seed-rules.txt")"; exit 4; }
PSH_PRIVATE=$P node "$HERE/fixtures.js" > "$L/$LABEL-fixtures.txt" 2>&1 || { log "fixtures failed: $(tail -2 "$L/$LABEL-fixtures.txt")"; exit 4; }
log "$(grep '^fixtures:' "$L/$LABEL-fixtures.txt")"

( exec env NODE_ENV=production PORT=$BPORT RV_TREE="$T" node "$HERE/launch.js" > "$L/$LABEL-backend.log" 2>&1 9>&- ) & SRV=$!
( cd "$T/apps/web-app" && exec env INTERNAL_API_URL=http://127.0.0.1:$BPORT BACKEND_URL=http://127.0.0.1:$BPORT NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=3072 npx next dev -p $WPORT -H 127.0.0.1 > "$L/$LABEL-web.log" 2>&1 9>&- ) & WEB=$!
for i in $(seq 1 120); do curl -s -m 2 -o /dev/null "http://127.0.0.1:$BPORT/api/health" && break; sleep 1; done
log "backend $(curl -s -m 2 -o /dev/null -w '%{http_code}' http://127.0.0.1:$BPORT/api/health)"
for u in /auth/health/login /auth/provider/login /health/applications/new/step/2 /provider/reviewer/x/document-check; do
  log "warm $u -> $(curl -s -m 400 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$WPORT$u")"
done

export PSH_PRIVATE=$P PSH_EVIDENCE=$EV PSH_INVOICE=$INVOICE BPORT WPORT
node "$HERE/walk.js" upload "$LABEL" 2>&1 | tee -a "$L/$LABEL-job.txt"
set +e
node "$HERE/walk.js" applicant "$LABEL" 2>&1 | tee -a "$L/$LABEL-job.txt"
node "$HERE/flip.js" 2>&1 | tee -a "$L/$LABEL-job.txt"
node "$HERE/walk.js" reviewer "$LABEL" 2>&1 | tee -a "$L/$LABEL-job.txt"
set -e
grep -E 'precheck run|precheck skipped|Upload\] Accepted' "$L/$LABEL-backend.log" | sed -E 's/\x1b\[[0-9;]*m//g' > "$L/$LABEL-backend-precheck-lines.txt" || true
log "backend lines: $(wc -l < "$L/$LABEL-backend-precheck-lines.txt")"
