#!/usr/bin/env bash
set -uo pipefail
umask 077
export PATH=/home/ubuntu/.nvm/versions/node/v24.21.0/bin:$PATH
T=/home/ubuntu/work/wt-guards1-uploads
EV=$T/evidence/launch-guards-1/item3
L=$EV/logs
P=/tmp/lg1u-private
F=/tmp/lg1u-files
PG=lg1u-pg; RD=lg1u-redis; NG=lg1u-nginx
PGPORT=5441; RDPORT=6391; BPORT=8741; WPORT=3741; NPORT=8941
mkdir -p "$L" "$P" "$F" "$EV/shots"
log() { echo "$(date +%H:%M:%S) $*" | tee -a "$L/job.txt"; }
SRV=; WEB=
killpid() { [ -n "$1" ] || return 0; kill -TERM "$1" 2>/dev/null; for i in $(seq 1 20); do kill -0 "$1" 2>/dev/null || return 0; sleep 0.5; done; kill -KILL "$1" 2>/dev/null; }
cleanup() {
  docker rm -f "$NG" >/dev/null 2>&1
  killpid "$SRV"
  if [ -n "$WEB" ]; then pkill -TERM -P "$WEB" 2>/dev/null; killpid "$WEB"; fi
  for p in $(ss -ltnp 2>/dev/null | grep -E ":($BPORT|$WPORT) " | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u); do killpid "$p"; done
  docker rm -f -v "$PG" "$RD" >/dev/null 2>&1
  rm -f "$T/apps/backend/keys/private.pem" "$T/apps/backend/keys/public.pem"
  rm -rf "$P" "$F" "$T/apps/backend/public/uploads/application-drafts"
  log "job end; listening backend=$(ss -ltn | grep -c ":$BPORT ") web=$(ss -ltn | grep -c ":$WPORT ") nginx=$(ss -ltn | grep -c ":$NPORT "); containers=$(docker ps --format '{{.Names}}' | grep -c '^lg1u-')"
}
trap cleanup EXIT
rm -f "$L"/red-* "$L"/green-[bnsu]* "$L"/retry-* "$L"/enumeration.* "$EV"/shots/*.png
: > "$L/job.txt"
log "job start head=$(git -C $T rev-parse --short HEAD) dirty=$(git -C $T status --porcelain | wc -l) mem_avail_mb=$(free -m | awk '/Mem:/{print $7}')"

docker run -d --name "$PG" -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=lg1u -p 127.0.0.1:$PGPORT:5432 postgres:17-alpine >/dev/null || { log "pg did not start"; exit 4; }
docker run -d --name "$RD" -p 127.0.0.1:$RDPORT:6379 redis:7-alpine >/dev/null || { log "redis did not start"; exit 4; }
for i in $(seq 1 60); do docker exec "$PG" psql -U postgres -d lg1u -tAc 'select 1' >/dev/null 2>&1 && break; sleep 1; done
export DATABASE_URL="postgresql://postgres@127.0.0.1:$PGPORT/lg1u?schema=public"
case "$DATABASE_URL" in *127.0.0.1:$PGPORT/lg1u*) ;; *) log "scratch DATABASE_URL assertion failed"; exit 2;; esac
cd "$T/apps/backend" || exit 4
npx prisma migrate deploy > "$L/migrate.txt" 2>&1 || { log "migrate failed: $(grep -iE 'error' $L/migrate.txt | head -2)"; exit 4; }
NODE_ENV=development node scripts/seed-herb-requirement-rules.js --apply > "$L/seed-herb-rules.txt" 2>&1 || { log "seed failed: $(tail -3 $L/seed-herb-rules.txt)"; exit 4; }
log "migrate ok; herb rules seeded: $(grep -ciE 'filed|created|insert' $L/seed-herb-rules.txt) lines mention a filing"
node "$EV/bin/enumerate.js" "$L/enumeration.json" > /dev/null 2> "$L/enumeration.err" || { log "enumeration failed: $(tail -2 $L/enumeration.err)"; exit 4; }
log "enumeration: $(node -e 'const j=require(process.argv[1]);console.log(`shapes=${j.shapes} blocked=${j.blocked} largest=${j.largest.slots} (required ${j.largest.required})`)' "$L/enumeration.json")"

rnd() { openssl rand -hex 24; }
{
  printf 'export REDIS_URL=redis://127.0.0.1:%s\n' "$RDPORT"
  for k in HEALTH_JWT_SECRET PROVIDER_JWT_SECRET MASTER_ENCRYPTION_KEY HMAC_KEY SESSION_SECRET PAYMENT_WEBHOOK_SECRET RSA_PRIVATE_KEY_PASSPHRASE; do printf 'export %s=%s\n' "$k" "$(rnd)"; done
  printf 'export ENCRYPTION_KEY=%s\n' "$(openssl rand -hex 16)"
  printf 'export PLATFORM_BANK_ACCOUNT_NO=000-0-00000-0\nexport PLATFORM_BANK_NAME=scratch-bank\n'
  printf 'export APP_PUBLIC_URL=http://127.0.0.1:%s\nexport PUBLIC_TRACE_URL=http://127.0.0.1:%s/trace\nexport TRACE_BASE_URL=http://127.0.0.1:%s\n' $NPORT $NPORT $NPORT
  printf 'export STORAGE_PROVIDER=local\nexport PAYMENT_ADAPTER=mock\nexport TRUST_PRIVATE_PROXY_RANGES=true\nexport LOG_LEVEL=info\n'
  printf 'export SIGNING_KEY_FINGERPRINT=\nexport SIGNING_KEY_DIR=%s/keys\n' "$P"
  for k in DB_USER DB_PASSWORD DB_NAME JWT_SECRET DTAM_JWT_SECRET JWT_EXPIRES_IN HOST CORS_ORIGIN E2E_SECRET ENABLE_E2E_ROUTES STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET AUTH_THAID_CLIENT_ID AUTH_THAID_CLIENT_SECRET MFA_CHALLENGE_BIND_ENFORCE LEGACY_NO_JTI_GRACE_UNTIL LEGACY_UNTYPED_TOKEN_GRACE_UNTIL ALLOW_PENDING_SECRETS REQUIRE_MFA_FOR_PRIVILEGED GACP_TEST_REDIS_URL; do printf 'export %s=\n' "$k"; done
} > "$P/env.sh"
mkdir -p "$P/keys"
# shellcheck disable=SC1091
( source "$P/env.sh"; node -e '
  const crypto=require("crypto"),fs=require("fs");
  const {publicKey,privateKey}=crypto.generateKeyPairSync("rsa",{modulusLength:2048,publicKeyEncoding:{type:"spki",format:"pem"},privateKeyEncoding:{type:"pkcs8",format:"pem",cipher:"aes-256-cbc",passphrase:process.env.RSA_PRIVATE_KEY_PASSPHRASE}});
  fs.writeFileSync("keys/private.pem",privateKey,{mode:0o600});fs.writeFileSync("keys/public.pem",publicKey,{mode:0o600});' ) || { log "key failed"; exit 4; }
# shellcheck disable=SC1091
( source "$P/env.sh"; LG1U_PRIVATE=$P node "$EV/bin/fixtures.js" red green retry ) > "$L/fixtures.txt" 2>&1 || { log "fixtures failed: $(tail -2 $L/fixtures.txt)"; exit 4; }
cp /home/ubuntu/work/state/walk/a8-round1/files/sop_manual.pdf "$F/document.pdf"
cp /home/ubuntu/work/state/walk/a8-round1/files/site_photos.jpg "$F/photo.jpg"

# shellcheck disable=SC1091
( source "$P/env.sh"; exec env NODE_ENV=production PORT=$BPORT RV_TREE="$T" node /home/ubuntu/work/state/reviews/a8-walk-fixes-1-runs/bin/launch.js > "$L/backend.log" 2>&1 9>&- ) & SRV=$!
( cd "$T/apps/web-app" && exec env INTERNAL_API_URL=http://127.0.0.1:$BPORT NODE_OPTIONS=--max-old-space-size=3072 npx next dev -p $WPORT -H 127.0.0.1 > "$L/web.log" 2>&1 9>&- ) & WEB=$!
for i in $(seq 1 120); do curl -s -m 2 -o /dev/null "http://127.0.0.1:$BPORT/api/health" && break; sleep 1; done
log "backend $(curl -s -m 2 -o /dev/null -w '%{http_code}' http://127.0.0.1:$BPORT/api/health) cwd=$(readlink /proc/$SRV/cwd)"
for u in /auth/health/login /health/applications/new/step/5 /health/applications/new/step/3 /health/applications/new/step/2; do
  log "warm $u -> $(curl -s -m 300 -o /dev/null -w '%{http_code}' http://127.0.0.1:$WPORT$u)"
done

git -C "$T" show origin/main:nginx/gacp.production.conf > "$P/main.gacp.production.conf"
PROBE_REQUESTS=70
burst_probe() {
  local phase=$1
  for i in $(seq 1 $PROBE_REQUESTS); do
    curl -s -m 10 -o "$P/probe-body" -w '%{http_code} %{content_type}\n' -X POST "http://127.0.0.1:$NPORT/api/applications/draft-documents"
    grep -q 'ปรับปรุง' "$P/probe-body" && echo 'maintenance-page'
  done | sort | uniq -c > "$L/$phase-burst-probe.txt"
}
for phase in red green retry; do
  case $phase in
    red) src="$P/main.gacp.production.conf"; burst= ;;
    green) src="$T/nginx/gacp.production.conf"; burst= ;;
    retry) src="$T/nginx/gacp.production.conf"; burst=5 ;;
  esac
  bash "$EV/bin/scratch-nginx-conf.sh" "$src" "$P/$phase.conf" $NPORT $BPORT $WPORT $burst
  cp "$P/$phase.conf.diff" "$L/$phase-scratch-nginx.diff"
  docker run -d --name "$NG" --network host -v "$P/$phase.conf:/etc/nginx/conf.d/default.conf:ro" -v "$T/nginx/50x.html:/etc/nginx/error-pages/50x.html:ro" nginx:alpine >/dev/null || { log "nginx did not start"; exit 4; }
  for i in $(seq 1 30); do curl -s -m 2 -o /dev/null "http://127.0.0.1:$NPORT/health" && break; sleep 1; done
  curl -s -m 2 -o /dev/null "http://127.0.0.1:$NPORT/health" || { log "phase $phase: nginx not answering: $(docker logs $NG 2>&1 | tail -3)"; exit 4; }
  log "phase $phase: nginx $(docker exec $NG nginx -v 2>&1) upload line: $(grep -E 'zone=api_upload' $P/$phase.conf | tr -s ' ' | tr '\n' ';') status: $(grep -E 'limit_req_status' $P/$phase.conf | tr -s ' ' || echo none)"
  ( source "$P/env.sh"; LG1U_EVIDENCE=$EV LG1U_PRIVATE=$P LG1U_FILES=$F BPORT=$BPORT NPORT=$NPORT node "$EV/bin/walk.js" "$phase" ) >> "$L/job.txt" 2>&1
  log "phase $phase walk exit $?"
  burst_probe "$phase"
  log "phase $phase burst probe: $(tr -s ' ' < $L/$phase-burst-probe.txt | tr '\n' ';')"
  docker logs "$NG" 2>&1 | grep -E 'POST /api/applications/draft-documents' | awk '{print $4, $6, $7, $9}' | sed 's/"//g' > "$L/$phase-nginx-upload-access.txt"
  docker rm -f "$NG" >/dev/null
  sleep 5
done
