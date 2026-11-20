#!/usr/bin/env bash
# usage: run.sh — next dev + backend from this tree on a throwaway postgres; run under ~/work/state/heavy.sh
set -uo pipefail
S=$(dirname "$(readlink -f "$0")")
WT=$(git -C "$S" rev-parse --show-toplevel)
RUN=$(mktemp -d)
EV=$WT/evidence/closure-reason-purpose-out-of-scope/screenshots
BPORT=8097 WPORT=3097 PGPORT=55439 DB=gacp-closurereason-walk
PW=$(openssl rand -hex 16)
export DATABASE_URL="postgresql://postgres:$PW@127.0.0.1:$PGPORT/gacp_walk?schema=public"
export NODE_ENV=development REQUIRE_MFA_FOR_PRIVILEGED=false UPLOAD_DIR=$RUN/uploads LOG_TO_FILE=false
export SIGNING_KEY_DIR=$RUN/signing-key RSA_PRIVATE_KEY_PASSPHRASE=$(openssl rand -hex 24)
export NODE_OPTIONS=--max-old-space-size=3072 PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH

GROUPS_STARTED=()
start_group () { local log=$1; shift; setsid "$@" > "$log" 2>&1 9>&- < /dev/null & GROUPS_STARTED+=("$!"); }
cleanup () {
  for g in "${GROUPS_STARTED[@]}"; do kill -TERM -- "-$g" 2>/dev/null; done
  sleep 3
  for g in "${GROUPS_STARTED[@]}"; do kill -KILL -- "-$g" 2>/dev/null; done
  docker rm -f -v "$DB" >/dev/null 2>&1
}
trap cleanup EXIT
trap 'exit 143' TERM INT
port_free () { ! ss -ltn "sport = :$1" | grep -q LISTEN; }
wait_http () { local url=$1 n=0; until [ "$(curl -s -m 30 -o /dev/null -w '%{http_code}' "$url")" = 200 ]; do n=$((n+1)); [ $n -gt 240 ] && { echo "timeout waiting $url"; return 1; }; sleep 2; done; }

mkdir -p "$EV" "$RUN/uploads" "$RUN/signing-key"
echo "== tree $WT ($(git -C "$WT" rev-parse --short HEAD)) backend:$BPORT web:$WPORT logs:$RUN"
port_free $BPORT && port_free $WPORT && port_free $PGPORT || { echo "a port is in use; refusing"; exit 1; }
docker rm -f -v "$DB" >/dev/null 2>&1
docker run -d --name "$DB" -e POSTGRES_PASSWORD="$PW" -e POSTGRES_DB=gacp_walk -p 127.0.0.1:$PGPORT:5432 postgres:17-alpine >/dev/null || exit 3
for _ in $(seq 1 60); do docker exec "$DB" psql -h 127.0.0.1 -U postgres -d gacp_walk -tAc 'select 1' >/dev/null 2>&1 && break; sleep 1; done
(cd "$WT/apps/backend" && npx prisma migrate deploy 2>&1 | tail -1)
start_group "$RUN/backend.log" env -C "$WT/apps/backend" PORT=$BPORT HOST=127.0.0.1 CORS_ORIGIN=http://127.0.0.1:$WPORT node server.js
wait_http "http://127.0.0.1:$BPORT/api/health" || { tail -30 "$RUN/backend.log"; exit 1; }
start_group "$RUN/web.log" env -C "$WT/apps/web-app" INTERNAL_API_URL=http://127.0.0.1:$BPORT NEXT_PUBLIC_API_URL=http://127.0.0.1:$WPORT node node_modules/next/dist/bin/next dev -p $WPORT -H 127.0.0.1
wait_http "http://127.0.0.1:$WPORT/auth/provider/login" || { tail -30 "$RUN/web.log"; exit 1; }
(cd "$WT/apps/backend" && timeout 300 node "$S/fixture.js" "$RUN/fixture.json" 9>&-) || exit 1
timeout -k 10 1200 node "$S/walk.js" "http://127.0.0.1:$WPORT" "$RUN/fixture.json" "$EV" 9>&-
rc=$?
APP=$(node -e "console.log(require('$RUN/fixture.json').applicationId)")
echo "== db application: $(docker exec "$DB" psql -U postgres -d gacp_walk -tAc "select status || ' closedReason=' || coalesce(\"closedReason\",'null') || ' adminClosure=' || coalesce(\"formData\"->'adminClosure'->>'reasonCode','null') from applications where id='$APP'")"
echo "== db notices:"
docker exec "$DB" psql -U postgres -d gacp_walk -tAc "select title || ' | ' || message from notifications where metadata->>'applicationId'='$APP'"
exit $rc
