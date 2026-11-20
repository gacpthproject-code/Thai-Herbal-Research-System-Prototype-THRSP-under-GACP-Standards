#!/usr/bin/env bash
# The round-5 screenshots (copy of ../shot-run.sh with overrides): backend from the worktree, web from WEB_DIR
# (default the worktree), against the scratch database. Run under ~/work/state/heavy.sh or inside a job that
# holds it. Leaves no server running. ONLY=<screen,...> reruns some screens.
# Overrides: WEB_DIR, OUT (default evidence/dispatcher-r5/<sha>), SHOT_SHA (default HEAD), SHOT_META.
set -uo pipefail
wt=/home/ubuntu/work/wt-dispatcher
state=/tmp/dispatcher-r5
web_dir=${WEB_DIR:-$wt/apps/web-app}
sha=${SHOT_SHA:-$(git -C "$wt" rev-parse --short=9 HEAD)}
out=${OUT:-$wt/evidence/dispatcher-r5/$sha}
meta=${SHOT_META:-$state/shot.meta}
export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH
set -a; . "$state/shot.env"; set +a
export PORT=8741 INTERNAL_API_URL=http://127.0.0.1:8741 BACKEND_URL=http://127.0.0.1:8741 NODE_OPTIONS=--max-old-space-size=2048

cleanup() {
  [ -n "${web_pid:-}" ] && kill "$web_pid" 2>/dev/null
  [ -n "${api_pid:-}" ] && kill "$api_pid" 2>/dev/null
  sleep 2
  pkill -f "next dev -p 3741" 2>/dev/null
  pkill -f "$wt/apps/backend/server.js" 2>/dev/null
}
trap cleanup EXIT

echo "sha=$sha web_dir=$web_dir dirty=$(git -C "$wt" status --porcelain -- apps packages | wc -l)" > "$meta"
node "$state/shot-seed.js" "$state/shot-fixture.json" || exit 1

(cd "$wt/apps/backend" && exec node "$wt/apps/backend/server.js") > "$state/shot-backend.log" 2>&1 &
api_pid=$!
for i in $(seq 1 90); do curl -fsS -o /dev/null http://127.0.0.1:8741/api/health && break; sleep 2; done
curl -fsS -o /dev/null http://127.0.0.1:8741/api/health || { echo "backend did not start"; exit 1; }

(cd "$web_dir" && exec node node_modules/next/dist/bin/next dev -p 3741 -H 127.0.0.1) > "$state/shot-web.log" 2>&1 &
web_pid=$!
for i in $(seq 1 120); do curl -fsS -o /dev/null http://127.0.0.1:3741/ && break; sleep 3; done

for route in /provider/calendar /provider/audits/x /provider/certificates /provider/certification-decisions/x /health/applications/x /health/applications/new/step/3 /privacy-policy; do
  curl -s -o /dev/null --max-time 300 "http://127.0.0.1:3741$route" || true
done

[ -z "${ONLY:-}" ] && rm -rf "$out"
mkdir -p "$out"
SHOT_WEB=http://127.0.0.1:3741 node "$state/shot-capture.js" "$state/shot-fixture.json" "$out" "${ONLY:-}"
status=$?
echo "screens in $out"
exit $status
