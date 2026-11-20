#!/usr/bin/env bash
# One heavy job: the worktree's Next dev server on :3000 against the loopback backend, the
# Playwright walk, then the dev server is stopped. Runs under ~/work/state/heavy.sh.
set -uo pipefail
WT=/home/ubuntu/work/wt-filingfields
OUT=${WALK_OUT:-/tmp/ff/walk/shots}
cd "$WT/apps/web-app" || exit 2
export NEXT_PUBLIC_API_URL=http://127.0.0.1:18443 INTERNAL_API_URL=http://127.0.0.1:18443 NODE_OPTIONS=--max-old-space-size=3072 NEXT_TELEMETRY_DISABLED=1
node node_modules/next/dist/bin/next dev -p 3000 -H 127.0.0.1 > /tmp/ff/next.log 2>&1 &
NEXT_PID=$!
for i in $(seq 1 120); do grep -q "Ready in\|✓ Ready" /tmp/ff/next.log 2>/dev/null && break; sleep 1; done
grep -q "Ready" /tmp/ff/next.log || { echo "next dev did not become ready"; kill "$NEXT_PID"; exit 3; }
# warm the two routes so the first screenshot is not a compile spinner
curl -s -o /dev/null http://127.0.0.1:3000/health/applications/new/step/3
curl -s -o /dev/null http://127.0.0.1:3000/health/applications/new/step/4
WALK_WEB_URL=http://localhost:3000 WALK_OUT="$OUT" node /tmp/ff/walk/shots.js
STATUS=$?
# stop only this run's process tree: the launcher and its next-server child
pkill -P "$NEXT_PID" 2>/dev/null; kill "$NEXT_PID" 2>/dev/null; wait "$NEXT_PID" 2>/dev/null
for i in $(seq 1 10); do (ss -ltn | grep -q ':3000 ') || break; sleep 1; done
(ss -ltn | grep -q ':3000 ') && echo "WARNING: port 3000 still open after cleanup"
echo "walk exit=$STATUS"
exit $STATUS
