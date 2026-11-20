#!/usr/bin/env bash
# Starts next dev on 3199 against the scratch backend, runs both walks, stops next dev.
set -u
W=/home/ubuntu/work/wt-proto13
E=$W/evidence/proto-1-3-2026-10-28
cd $W/apps/web-app
INTERNAL_API_URL=http://127.0.0.1:8199 NEXT_PUBLIC_API_URL=http://127.0.0.1:3199 setsid npx next dev -p 3199 -H 127.0.0.1 > /tmp/p13src/web.log 2>&1 &
DEV=$!
for i in $(seq 1 60); do curl -s -o /dev/null http://127.0.0.1:3199/ && break; sleep 2; done
cd $W
NODE_PATH=apps/web-app/node_modules node $E/walk.cjs http://127.0.0.1:3199 "$WALK_ID" $E/after "$@"
RC1=$?
WALK_PICK=APP-68-002 NODE_PATH=apps/web-app/node_modules node $E/walk-analyze.cjs http://127.0.0.1:3199 "$WALK_ID" $E/after p1-who-analyze=/provider/standards/who p1-thai-analyze=/provider/standards/thai-fda p1-asean-analyze=/provider/standards/asean
RC2=$?
kill -- -$DEV
echo "walk rc=$RC1 analyze rc=$RC2"
