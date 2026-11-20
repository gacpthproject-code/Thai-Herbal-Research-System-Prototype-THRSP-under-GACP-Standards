#!/usr/bin/env bash
# The round-6 screenshots on the real stack: backend and web from the worktree, against the scratch database.
# Run under ~/work/state/heavy.sh. Leaves no server running. usage: shot-run.sh [out-dir]
set -uo pipefail
wt=/home/ubuntu/work/wt-dispatcher
state=/tmp/dispatcher-r6
sha=$(git -C "$wt" rev-parse --short=9 HEAD)
out=${1:-$wt/evidence/dispatcher-r6/screens-$sha}
export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH
set -a; . "$state/secret/shot.env"; set +a
export PORT=8751 INTERNAL_API_URL=http://127.0.0.1:8751 BACKEND_URL=http://127.0.0.1:8751 NODE_OPTIONS=--max-old-space-size=2048 NEXT_TELEMETRY_DISABLED=1

cleanup() {
  [ -n "${web_pid:-}" ] && kill "$web_pid" 2>/dev/null
  [ -n "${api_pid:-}" ] && kill "$api_pid" 2>/dev/null
  sleep 2
  pkill -f "next dev -p 3751" 2>/dev/null
  pkill -f "$wt/apps/backend/server.js" 2>/dev/null
}
trap cleanup EXIT

mkdir -p "$state/shots"
echo "sha=$sha dirty=$(git -C "$wt" status --porcelain -- apps packages | wc -l) started=$(date -u +%FT%TZ)" > "$state/shots/meta.txt"
node "$state/scripts/shot-seed.js" "$state/secret/shot-fixture.json" || exit 1

(cd "$wt/apps/backend" && exec node "$wt/apps/backend/server.js") > "$state/shots/backend.log" 2>&1 &
api_pid=$!
for i in $(seq 1 90); do curl -fsS -o /dev/null http://127.0.0.1:8751/api/health && break; sleep 2; done
curl -fsS -o /dev/null http://127.0.0.1:8751/api/health || { echo "backend did not start"; exit 1; }

(cd "$wt/apps/web-app" && exec node node_modules/next/dist/bin/next dev -p 3751 -H 127.0.0.1) > "$state/shots/web.log" 2>&1 &
web_pid=$!
for i in $(seq 1 120); do curl -fsS -o /dev/null http://127.0.0.1:3751/ && break; sleep 3; done

# The session cookie goes to curl through a 0600 config file, never through its arguments.
(umask 077; node -e 'const f=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(`cookie = "provider_token=${f.tokens.dispatcher}"`)' "$state/secret/shot-fixture.json" > "$state/secret/curl-cookie.cfg")
for route in /provider/calendar /provider/audits/x; do
  curl -s -o /dev/null --max-time 600 -K "$state/secret/curl-cookie.cfg" "http://127.0.0.1:3751$route" || true
done
rm -f "$state/secret/curl-cookie.cfg"

rm -rf "$out"; mkdir -p "$out"
SHOT_WEB=http://127.0.0.1:3751 node "$state/scripts/shot-capture.js" "$state/secret/shot-fixture.json" "$out"
status=$?
echo "ended=$(date -u +%FT%TZ) capture-exit=$status" >> "$state/shots/meta.txt"
echo "screens in $out"
exit $status
