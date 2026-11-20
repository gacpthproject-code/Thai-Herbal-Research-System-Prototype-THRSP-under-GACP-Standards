#!/usr/bin/env bash
# One heavy job: the worktree backend on 127.0.0.1:18443 (scratch Postgres), the fixture, the
# worktree's Next dev on :3000, the Playwright walk; then both servers are stopped.
set -uo pipefail
WT=/home/ubuntu/work/wt-filingfields
D=/tmp/ff/r2/walk
cd "$WT/apps/backend" || exit 2
set -a; . /tmp/ff/backend.env; set +a
node -r "$D/bind-localhost.js" server.js > /tmp/ff/r2/backend.log 2>&1 &
BE_PID=$!
for i in $(seq 1 90); do curl -sf -o /dev/null http://127.0.0.1:18443/api/health && break; sleep 1; done
curl -sf http://127.0.0.1:18443/api/health > /dev/null || { echo "backend did not become ready"; kill "$BE_PID"; exit 3; }
echo "backend ready pid=$BE_PID"
node "$D/fixture.js" || { echo "fixture failed"; kill "$BE_PID"; exit 4; }
cd "$WT/apps/web-app" || exit 2
export NEXT_PUBLIC_API_URL=http://127.0.0.1:18443 INTERNAL_API_URL=http://127.0.0.1:18443 NODE_OPTIONS=--max-old-space-size=3072 NEXT_TELEMETRY_DISABLED=1
node node_modules/next/dist/bin/next dev -p 3000 -H 127.0.0.1 > /tmp/ff/r2/next.log 2>&1 &
NEXT_PID=$!
for i in $(seq 1 120); do grep -q "Ready" /tmp/ff/r2/next.log 2>/dev/null && break; sleep 1; done
grep -q "Ready" /tmp/ff/r2/next.log || { echo "next dev did not become ready"; kill "$NEXT_PID" "$BE_PID"; exit 3; }
for p in 3 4; do curl -s -o /dev/null http://127.0.0.1:3000/health/applications/new/step/$p; done
curl -s -o /dev/null "http://127.0.0.1:3000/health/applications/x/revision"
WALK_WEB_URL=http://localhost:3000 WALK_OUT="$D/shots" node "$D/shots.js"
STATUS=$?
pkill -P "$NEXT_PID" 2>/dev/null; kill "$NEXT_PID" 2>/dev/null; wait "$NEXT_PID" 2>/dev/null
kill "$BE_PID" 2>/dev/null; wait "$BE_PID" 2>/dev/null
for i in $(seq 1 10); do (ss -ltn | grep -qE ':3000 |:18443 ') || break; sleep 1; done
(ss -ltn | grep -qE ':3000 |:18443 ') && echo "WARNING: a port is still open after cleanup"
echo "walk exit=$STATUS"
exit $STATUS
