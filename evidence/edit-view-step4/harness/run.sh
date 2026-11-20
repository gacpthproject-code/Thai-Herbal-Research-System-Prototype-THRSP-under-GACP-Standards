#!/usr/bin/env bash
# usage: ~/work/state/heavy.sh evidence/edit-view-step4/harness/run.sh <label>
# One heavy job: backend (apps/backend/.env of this tree, scratch Postgres on 55497) + Next dev,
# then walk.mjs, then both servers are stopped by their own process groups. The Postgres
# container is started and migrated beforehand (see README.md in this directory).
set -uo pipefail
LABEL=${1:?label}
export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH
TREE=$(cd "$(dirname "$0")/../../.." && pwd)
OUT="$TREE/evidence/edit-view-step4/$LABEL"
mkdir -p "$OUT"
echo "tree $TREE head $(git -C "$TREE" rev-parse HEAD) dirty-files: $(git -C "$TREE" status --porcelain | grep -v '^?? evidence/' | wc -l)" | tee "$OUT/head.txt"

cd "$TREE/apps/backend"
setsid node server.js > "$OUT/backend.log" 2>&1 &
BACKEND_PGID=$!
cd "$TREE/apps/web-app"
INTERNAL_API_URL=http://127.0.0.1:8097 NEXT_PUBLIC_API_URL=http://127.0.0.1:3097 NODE_OPTIONS=--max-old-space-size=3072 \
  setsid npx next dev -p 3097 > "$OUT/next.log" 2>&1 &
NEXT_PGID=$!

stop() {
  kill -TERM -- -"$NEXT_PGID" 2>/dev/null
  kill -TERM -- -"$BACKEND_PGID" 2>/dev/null
  sleep 3
  kill -KILL -- -"$NEXT_PGID" 2>/dev/null
  kill -KILL -- -"$BACKEND_PGID" 2>/dev/null
}
trap stop EXIT

for i in $(seq 1 120); do curl -sf -o /dev/null http://127.0.0.1:8097/api/health && break; sleep 1; done
echo "backend answered after ${i}s"
for i in $(seq 1 300); do curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3097/auth/health/login | grep -q '^200$' && break; sleep 1; done
echo "next answered after ${i}s"

node "$TREE/evidence/edit-view-step4/harness/walk.mjs" "$LABEL"
EXIT=$?
echo "walk exit $EXIT" | tee -a "$OUT/head.txt"
exit $EXIT
