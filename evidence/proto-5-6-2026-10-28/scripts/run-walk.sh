#!/usr/bin/env bash
# One heavy job: the worktree backend on 127.0.0.1:18444 and its Next dev server on :3000,
# the Playwright walk, then both are stopped. Runs under ~/work/state/heavy.sh.
set -uo pipefail
WT=/home/ubuntu/work/wt-proto56
LOG=/tmp/proto56/walk
set -a; . /tmp/proto56/secret/backend.env; set +a
cd "$WT/apps/backend" || exit 2
node --require "$LOG/bind-localhost.js" server.js > "$LOG/backend.log" 2>&1 &
BE_PID=$!
for i in $(seq 1 90); do curl -s -o /dev/null http://127.0.0.1:18444/api/herbs && break; sleep 1; done
curl -s http://127.0.0.1:18444/api/herbs/coverage > "$LOG/coverage.json"
cd "$WT/apps/web-app" || exit 2
env -u DATABASE_URL -u JWT_SECRET -u PROVIDER_JWT_SECRET -u ENCRYPTION_KEY -u SESSION_SECRET -u HMAC_KEY -u AUDIT_HASH_KEY \
  NEXT_PUBLIC_API_URL=http://127.0.0.1:18444 INTERNAL_API_URL=http://127.0.0.1:18444 NODE_OPTIONS=--max-old-space-size=3072 NEXT_TELEMETRY_DISABLED=1 PORT=3000 NODE_ENV=development \
  node node_modules/next/dist/bin/next dev -p 3000 -H 127.0.0.1 > "$LOG/next.log" 2>&1 &
NEXT_PID=$!
for i in $(seq 1 180); do grep -q "Ready" "$LOG/next.log" 2>/dev/null && break; sleep 1; done
for r in /health/herbs /health/herbs/KRATOM /provider/herbs /provider/herbs/TURMERIC /provider/image-assessment; do curl -s -o /dev/null -m 300 "http://127.0.0.1:3000$r"; done
WALK_WEB_URL=http://localhost:3000 node "$LOG/shots.js"
STATUS=$?
pkill -P "$NEXT_PID" 2>/dev/null; kill "$NEXT_PID" "$BE_PID" 2>/dev/null; wait "$NEXT_PID" "$BE_PID" 2>/dev/null
for i in $(seq 1 10); do (ss -ltn | grep -qE ':3000 |:18444 ') || break; sleep 1; done
echo "walk exit=$STATUS"
exit $STATUS
