#!/usr/bin/env bash
# Two legs against the scratch Postgres: "before" from BEFORE_TREE (no fix; a worktree at origin/main
# with its own generated Prisma client, since a stale shared client 500s the inspect page),
# "after" from the worktree (fix/approver-photo-coords). Every long-lived child starts in its own
# session (setsid), so its process group holds next's workers and chromium too; cleanup kills
# each group on leg end and on any exit of this script. Children close fd 9 (the heavy lock).
set -uo pipefail
S=$(dirname "$(readlink -f "$0")")
RUN=${RUN_DIR:-$(mktemp -d)}

WT=/home/ubuntu/work/wt-photocoords
EV=$WT/evidence/approver-photo-coords-mismatch/screenshots
LEGS=${LEGS:-"before after"}
export DATABASE_URL='postgresql://gacp:gacp@127.0.0.1:55434/gacp_e2e_test?schema=public'
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

run_leg () {
  local label=$1 tree=$2 bport=$3 wport=$4
  echo "== leg $label tree=$tree ($(git -C "$tree" rev-parse --short HEAD)) backend:$bport web:$wport"
  port_free "$bport" && port_free "$wport" || { echo "port $bport or $wport already in use; refusing"; return 1; }
  start_group "$RUN/$label-backend.log" env -C "$tree/apps/backend" PORT=$bport HOST=127.0.0.1 CORS_ORIGIN=http://127.0.0.1:$wport node server.js
  wait_http "http://127.0.0.1:$bport/api/health" || { tail -30 "$RUN/$label-backend.log"; return 1; }
  start_group "$RUN/$label-web.log" env -C "$tree/apps/web-app" INTERNAL_API_URL=http://127.0.0.1:$bport NEXT_PUBLIC_API_URL=http://127.0.0.1:$wport node node_modules/next/dist/bin/next dev -p $wport -H 127.0.0.1
  wait_http "http://127.0.0.1:$wport/auth/provider/login" || { tail -30 "$RUN/$label-web.log"; return 1; }
  (cd "$tree/apps/backend" && timeout 300 node "$S/fixture.js" "$RUN/$label-fixture.json" 9>&-) || return 1
  start_group "$RUN/$label-walk.log" timeout -k 10 1800 node "$S/walk.js" "http://127.0.0.1:$wport" "$RUN/$label-fixture.json" "$EV" "$label" "$tree/apps/backend" "$S/photos"
  local walk=${GROUPS_STARTED[-1]} rc
  wait "$walk"; rc=$?
  cat "$RUN/$label-walk.log"
  return $rc
}

mkdir -p "$EV" "$RUN/uploads"; echo "== logs, fixtures (with scratch passwords) and uploads in $RUN"
rc=0
for leg in $LEGS; do
  case $leg in
    before) run_leg before "${BEFORE_TREE:?set BEFORE_TREE to an origin/main worktree with its own Prisma client}" 8098 3098 ;;
    after) run_leg after "$WT" 8099 3099 ;;
  esac
  r=$?; echo "== leg $leg rc=$r"; rc=$((rc + r))
  kill_groups
done
exit $rc
