#!/usr/bin/env bash
# One leg against the scratch Postgres (carmissing-db on 55437), served from WT at its current
# commit: backend on 8097, next dev on 3097, fresh fixture, browser walk. Run it once on the
# unfixed commit (LABEL=before) and once on the fix (LABEL=after). Each long-lived child gets its
# own session so cleanup kills its whole group; children close fd 9 (the heavy lock).
set -uo pipefail
S=$(dirname "$(readlink -f "$0")")
WT=$(git -C "$S" rev-parse --show-toplevel)
LABEL=${LABEL:?set LABEL=before or LABEL=after}
RUN=${RUN_DIR:-$(mktemp -d)}
EV=$WT/evidence/car-submit-shows-missing/screenshots
BPORT=8097 WPORT=3097
export DATABASE_URL='postgresql://gacp:gacp@127.0.0.1:55437/gacp_car?schema=public'
export NODE_ENV=development REQUIRE_MFA_FOR_PRIVILEGED=false UPLOAD_DIR=$RUN/uploads LOG_TO_FILE=false
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

mkdir -p "$EV" "$RUN/uploads"
echo "== leg $LABEL tree=$WT ($(git -C "$WT" rev-parse --short HEAD)) backend:$BPORT web:$WPORT logs:$RUN"
port_free $BPORT && port_free $WPORT || { echo "port $BPORT or $WPORT already in use; refusing"; exit 1; }
start_group "$RUN/backend.log" env -C "$WT/apps/backend" PORT=$BPORT HOST=127.0.0.1 CORS_ORIGIN=http://127.0.0.1:$WPORT node server.js
wait_http "http://127.0.0.1:$BPORT/api/health" || { tail -30 "$RUN/backend.log"; exit 1; }
start_group "$RUN/web.log" env -C "$WT/apps/web-app" INTERNAL_API_URL=http://127.0.0.1:$BPORT NEXT_PUBLIC_API_URL=http://127.0.0.1:$WPORT node node_modules/next/dist/bin/next dev -p $WPORT -H 127.0.0.1
wait_http "http://127.0.0.1:$WPORT/auth/health/login" || { tail -30 "$RUN/web.log"; exit 1; }
(cd "$WT/apps/backend" && timeout 300 node "$S/fixture.js" "$RUN/fixture.json" 9>&-) || exit 1
timeout -k 10 1200 node "$S/walk.js" "http://127.0.0.1:$WPORT" "$RUN/fixture.json" "$EV" "$LABEL" "$S/evidence-sign.jpg" 9>&-
rc=$?
APP=$(node -e "console.log(require('$RUN/fixture.json').applicationId)")
echo "== db: $(docker exec carmissing-db psql -U gacp -d gacp_car -tAc "select status || ' carDocuments=' || coalesce(jsonb_array_length(\"formData\"->'carDocuments'),0) || ' staged=' || coalesce(jsonb_array_length(\"formData\"->'carStagedFiles'),0) from applications where id='$APP'")"
grep -E "CAR|car|422|APPLICATION_INCOMPLETE" "$RUN/backend.log" | tail -8
exit $rc
