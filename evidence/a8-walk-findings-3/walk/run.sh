#!/usr/bin/env bash
# usage: LABEL=before TREE=<main checkout> run.sh | LABEL=after run.sh   (run under ~/work/state/heavy.sh)
set -uo pipefail
S=$(dirname "$(readlink -f "$0")")
EVWT=$(git -C "$S" rev-parse --show-toplevel)
WT=${TREE:-$EVWT}
LABEL=${LABEL:?set LABEL=before or LABEL=after}
RUN=${RUN_DIR:-$(mktemp -d)}
EV=$EVWT/evidence/a8-walk-findings-3/screenshots
BPORT=8097 WPORT=3097
export DATABASE_URL='postgresql://postgres:pw@127.0.0.1:55440/gacp_walk?schema=public'
export NODE_ENV=development REQUIRE_MFA_FOR_PRIVILEGED=false UPLOAD_DIR=$RUN/uploads LOG_TO_FILE=false
export SIGNING_KEY_DIR=$RUN/signing-key RSA_PRIVATE_KEY_PASSPHRASE=$(openssl rand -hex 24)
export NODE_OPTIONS=--max-old-space-size=3072

GROUPS_STARTED=()
start_group () { local log=$1; shift; setsid "$@" > "$log" 2>&1 9>&- < /dev/null & GROUPS_STARTED+=("$!"); }
kill_groups () {
  for g in "${GROUPS_STARTED[@]}"; do kill -TERM -- "-$g" 2>/dev/null; done
  sleep 3
  for g in "${GROUPS_STARTED[@]}"; do kill -KILL -- "-$g" 2>/dev/null; done
  GROUPS_STARTED=()
}
trap 'kill_groups' EXIT
trap 'exit 143' TERM INT
port_free () { ! ss -ltn "sport = :$1" | grep -q LISTEN; }
wait_http () { local url=$1 n=0; until [ "$(curl -s -m 30 -o /dev/null -w '%{http_code}' "$url")" = 200 ]; do n=$((n+1)); [ $n -gt 240 ] && { echo "timeout waiting $url"; return 1; }; sleep 2; done; }

mkdir -p "$EV" "$RUN/uploads" "$RUN/signing-key"
echo "== leg $LABEL tree=$WT ($(git -C "$WT" rev-parse --short HEAD)) backend:$BPORT web:$WPORT logs:$RUN"
port_free $BPORT && port_free $WPORT || { echo "port $BPORT or $WPORT already in use; refusing"; exit 1; }
docker exec walkfix3-db psql -U postgres -d gacp -tAc 'drop database if exists gacp_walk' >/dev/null 2>&1
docker exec walkfix3-db psql -U postgres -d gacp -tAc 'create database gacp_walk' >/dev/null
(cd "$WT/apps/backend" && npx prisma migrate deploy 2>&1 | tail -1)
start_group "$RUN/backend.log" env -C "$WT/apps/backend" PORT=$BPORT HOST=127.0.0.1 CORS_ORIGIN=http://127.0.0.1:$WPORT node server.js
wait_http "http://127.0.0.1:$BPORT/api/health" || { tail -30 "$RUN/backend.log"; exit 1; }
start_group "$RUN/web.log" env -C "$WT/apps/web-app" INTERNAL_API_URL=http://127.0.0.1:$BPORT NEXT_PUBLIC_API_URL=http://127.0.0.1:$WPORT node node_modules/next/dist/bin/next dev -p $WPORT -H 127.0.0.1
wait_http "http://127.0.0.1:$WPORT/auth/provider/login" || { tail -30 "$RUN/web.log"; exit 1; }
(cd "$WT/apps/backend" && timeout 300 node "$S/fixture.js" "$RUN/fixture.json" 9>&-) || exit 1
timeout -k 10 1800 node "$S/walk.js" "http://127.0.0.1:$WPORT" "http://127.0.0.1:$BPORT" "$RUN/fixture.json" "$EV" "$LABEL" "$WT/apps/backend" 9>&-
rc=$?
grep -E "audits/schedules|reviewer-assignments|holder" "$RUN/backend.log" | grep -vi "password" | tail -8
exit $rc
