#!/usr/bin/env bash
# Order 138(1) screenshots: scratch Postgres + Redis, the backend and web app from this tree, the repo's
# nginx/gacp.production.conf in front, CAR_UNSENT_SWEEP_ENABLED=true. Run under ~/work/state/heavy.sh.
set -euo pipefail
umask 077
export PATH=/home/ubuntu/.nvm/versions/node/v24.21.0/bin:$PATH
T=/home/ubuntu/work/wt-carsweep
EV=$T/evidence/car-sweep-scope-r2
L=$EV/logs
P=/tmp/csr-private
F=/tmp/csr-files
PG=csr-pg; RD=csr-redis; NG=csr-nginx
PGPORT=5453; RDPORT=6403; BPORT=8753; WPORT=3753; NPORT=8953
CAR_DIR=$T/apps/backend/public/uploads/car
mkdir -p "$L" "$P" "$F" "$EV/shots"
log() { echo "$(date +%H:%M:%S) $*" | tee -a "$L/job.txt"; }
SRV=; WEB=
killpid() { [ -n "$1" ] || return 0; kill -TERM "$1" 2>/dev/null || true; for i in $(seq 1 20); do kill -0 "$1" 2>/dev/null || return 0; sleep 0.5; done; kill -KILL "$1" 2>/dev/null || true; }
cleanup() {
  set +e
  docker logs "$NG" 2>&1 | grep -E '"(POST|DELETE) /api/applications/' | awk '{print $6, $7, $9, $10}' | sed 's/"//g; s#/applications/[0-9a-f-]*/#/applications/<id>/#' | sort | uniq -c > "$L/nginx-access-summary.txt"
  docker rm -f "$NG" >/dev/null 2>&1
  killpid "$SRV"
  if [ -n "$WEB" ]; then pkill -TERM -P "$WEB" 2>/dev/null; killpid "$WEB"; fi
  for p in $(ss -ltnp 2>/dev/null | grep -E ":($BPORT|$WPORT) " | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u); do killpid "$p"; done
  docker rm -f -v "$PG" "$RD" >/dev/null 2>&1
  rm -f "$T/apps/backend/keys/private.pem" "$T/apps/backend/keys/public.pem"
  rm -rf "$P" "$F" "$CAR_DIR"
  log "job end; listening backend=$(ss -ltn | grep -c ":$BPORT ") web=$(ss -ltn | grep -c ":$WPORT ") nginx=$(ss -ltn | grep -c ":$NPORT "); containers=$(docker ps --format '{{.Names}}' | grep -c '^csr-')"
}
trap cleanup EXIT
rm -f "$L"/*.txt "$L"/*.jsonl "$L"/*.json "$EV"/shots/*.png
log "job start head=$(git -C $T rev-parse --short HEAD) dirty=$(git -C $T status --porcelain | wc -l) mem_avail_mb=$(free -m | awk '/Mem:/{print $7}')"
rm -rf "$CAR_DIR"

docker run -d --name "$PG" --memory=1g -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=csr -p 127.0.0.1:$PGPORT:5432 postgres:17-alpine >/dev/null
docker run -d --name "$RD" -p 127.0.0.1:$RDPORT:6379 redis:7-alpine >/dev/null
for i in $(seq 1 60); do docker exec "$PG" psql -U postgres -d csr -tAc 'select 1' >/dev/null 2>&1 && break; sleep 1; done
export DATABASE_URL="postgresql://postgres@127.0.0.1:$PGPORT/csr?schema=public"
cd "$T/apps/backend"
npx prisma migrate deploy > "$L/migrate.txt" 2>&1 || { log "migrate failed"; exit 4; }

rnd() { openssl rand -hex 24; }
{
  printf 'export REDIS_URL=redis://127.0.0.1:%s\n' "$RDPORT"
  for k in HEALTH_JWT_SECRET PROVIDER_JWT_SECRET MASTER_ENCRYPTION_KEY HMAC_KEY SESSION_SECRET PAYMENT_WEBHOOK_SECRET RSA_PRIVATE_KEY_PASSPHRASE; do printf 'export %s=%s\n' "$k" "$(rnd)"; done
  printf 'export ENCRYPTION_KEY=%s\n' "$(openssl rand -hex 16)"
  printf 'export PLATFORM_BANK_ACCOUNT_NO=000-0-00000-0\nexport PLATFORM_BANK_NAME=scratch-bank\n'
  printf 'export APP_PUBLIC_URL=http://127.0.0.1:%s\nexport PUBLIC_TRACE_URL=http://127.0.0.1:%s/trace\nexport TRACE_BASE_URL=http://127.0.0.1:%s\n' $NPORT $NPORT $NPORT
  printf 'export STORAGE_PROVIDER=local\nexport PAYMENT_ADAPTER=mock\nexport TRUST_PRIVATE_PROXY_RANGES=true\nexport LOG_LEVEL=info\nexport CAR_UNSENT_SWEEP_ENABLED=true\n'
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
PDF=$F/evidence.pdf
cp /home/ubuntu/work/state/walk/a8-round1/files/car_evidence.pdf "$PDF"
CSR_PRIVATE=$P CSR_CAR_DIR=$CAR_DIR CSR_PDF=$PDF node "$EV/bin/fixtures.js" > "$L/fixtures.txt" 2>&1 || { log "fixtures failed: $(tail -2 $L/fixtures.txt)"; exit 4; }
log "$(grep "^fixtures:" $L/fixtures.txt)"

( exec env NODE_ENV=production PORT=$BPORT RV_TREE="$T" node /home/ubuntu/work/state/reviews/a8-walk-fixes-1-runs/bin/launch.js > "$L/backend.log" 2>&1 9>&- ) & SRV=$!
( cd "$T/apps/web-app" && exec env INTERNAL_API_URL=http://127.0.0.1:$BPORT NODE_OPTIONS=--max-old-space-size=3072 npx next dev -p $WPORT -H 127.0.0.1 > "$L/web.log" 2>&1 9>&- ) & WEB=$!
for i in $(seq 1 120); do curl -s -m 2 -o /dev/null "http://127.0.0.1:$BPORT/api/health" && break; sleep 1; done
log "backend $(curl -s -m 2 -o /dev/null -w '%{http_code}' http://127.0.0.1:$BPORT/api/health)"
for u in /auth/health/login "/health/applications/x/car"; do
  log "warm $u -> $(curl -s -m 400 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$WPORT$u")"
done

bash "$T/evidence/car-per-file-upload/bin/scratch-nginx-conf.sh" "$T/nginx/gacp.production.conf" "$P/nginx.conf" $NPORT $BPORT $WPORT
cp "$P/nginx.conf.diff" "$L/scratch-nginx.diff"
docker run -d --name "$NG" --network host -v "$P/nginx.conf:/etc/nginx/conf.d/default.conf:ro" -v "$T/nginx/50x.html:/etc/nginx/error-pages/50x.html:ro" nginx:alpine >/dev/null
for i in $(seq 1 30); do curl -s -m 2 -o /dev/null "http://127.0.0.1:$NPORT/health" && break; sleep 1; done
log "nginx $(docker exec $NG nginx -v 2>&1); body limit: $(grep -E 'client_max_body_size' $P/nginx.conf | tr -s ' ' | sort -u | tr '\n' ';')"

for label in desktop mobile; do
  set +e
  CSR_EVIDENCE=$EV CSR_PRIVATE=$P CSR_PDF=$PDF BPORT=$BPORT NPORT=$NPORT node "$EV/bin/walk.js" "$label" >> "$L/job.txt" 2>&1
  log "walk $label exit $?"
  set -e
done
