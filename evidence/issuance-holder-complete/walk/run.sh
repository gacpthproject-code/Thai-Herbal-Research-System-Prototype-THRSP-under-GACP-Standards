#!/usr/bin/env bash
set -uo pipefail
S=$(dirname "$(readlink -f "$0")")
EVWT=$(git -C "$S" rev-parse --show-toplevel)
WT=${TREE:-$EVWT}
LABEL=${LABEL:?set LABEL=before or LABEL=after}
RUN=${RUN_DIR:-$(mktemp -d)}
EV=$EVWT/evidence/issuance-holder-complete/screenshots
BPORT=8098 WPORT=3098
export DATABASE_URL='postgresql://gacp:gacp@127.0.0.1:55438/gacp_walk?schema=public'
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
docker exec issueholder-db psql -U gacp -d gacp_ih -tAc 'drop database if exists gacp_walk' >/dev/null 2>&1
docker exec issueholder-db psql -U gacp -d gacp_ih -tAc 'create database gacp_walk' >/dev/null
(cd "$WT/apps/backend" && npx prisma migrate deploy 2>&1 | tail -1)
start_group "$RUN/backend.log" env -C "$WT/apps/backend" PORT=$BPORT HOST=127.0.0.1 CORS_ORIGIN=http://127.0.0.1:$WPORT node server.js
wait_http "http://127.0.0.1:$BPORT/api/health" || { tail -30 "$RUN/backend.log"; exit 1; }
start_group "$RUN/web.log" env -C "$WT/apps/web-app" INTERNAL_API_URL=http://127.0.0.1:$BPORT NEXT_PUBLIC_API_URL=http://127.0.0.1:$WPORT node node_modules/next/dist/bin/next dev -p $WPORT -H 127.0.0.1
wait_http "http://127.0.0.1:$WPORT/auth/provider/login" || { tail -30 "$RUN/web.log"; exit 1; }
(cd "$WT/apps/backend" && timeout 300 node "$S/fixture.js" "$RUN/fixture.json" 9>&-) || exit 1
timeout -k 10 1200 node "$S/walk.js" "http://127.0.0.1:$WPORT" "$RUN/fixture.json" "$EV" "$LABEL" 9>&-
rc=$?
APP=$(node -e "console.log(require('$RUN/fixture.json').applicationId)")
echo "== db: $(docker exec issueholder-db psql -U gacp -d gacp_walk -tAc "select a.status || ' certificates=' || (select count(*) from certificates c where c.\"applicationId\"=a.id) || ' farms=' || (select count(*) from farms f where f.\"organizationId\"=a.\"organizationId\") || coalesce(' holder=' || (select c.\"holderDisplayName\" || '/' || c.\"holderType\" from certificates c where c.\"applicationId\"=a.id limit 1), '') from applications a where a.id='$APP'")"
grep -E "Holder incomplete|CERTIFICATE_HOLDER|final-approvals|Created:" "$RUN/backend.log" | tail -6
exit $rc
