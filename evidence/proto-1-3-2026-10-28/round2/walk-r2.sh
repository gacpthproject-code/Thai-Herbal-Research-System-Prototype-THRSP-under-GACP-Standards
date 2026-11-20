#!/usr/bin/env bash
# Round 2: backend from the tree on 8199 (scratch Postgres, env from $P13_ENV), next dev on 3199,
# then the three affected screens at 1440x900 and 390x844, the compare page in dark mode,
# and one real click on "ดาวน์โหลด CSV" through the web origin.
# usage: P13_ENV=<env file> WALK_ID=<providerId> WALK_PASSWORD=... bash walk-r2.sh
set -u
W=/home/ubuntu/work/wt-proto13
E=$W/evidence/proto-1-3-2026-10-28
OUT=$E/round2
source "$P13_ENV"
cd $W/apps/backend
setsid node server.js > /tmp/proto13-r2/backend.log 2>&1 &
BE=$!
for i in $(seq 1 60); do curl -s -o /dev/null http://127.0.0.1:8199/api/health && break; sleep 2; done
cd $W/apps/web-app
INTERNAL_API_URL=http://127.0.0.1:8199 NEXT_PUBLIC_API_URL=http://127.0.0.1:3199 setsid npx next dev -p 3199 -H 127.0.0.1 > /tmp/proto13-r2/web.log 2>&1 &
DEV=$!
for i in $(seq 1 60); do curl -s -o /dev/null http://127.0.0.1:3199/ && break; sleep 2; done
cd $W
NODE_PATH=apps/web-app/node_modules node $E/walk.cjs http://127.0.0.1:3199 "$WALK_ID" $OUT p1-compare=/provider/standards/compare p3-insights=/provider/surveys/insights
RC1=$?
WALK_PICK=APP-68-002 NODE_PATH=apps/web-app/node_modules node $E/walk-analyze.cjs http://127.0.0.1:3199 "$WALK_ID" $OUT p1-who-analyze=/provider/standards/who
RC2=$?
NODE_PATH=apps/web-app/node_modules node $OUT/walk-csv.cjs http://127.0.0.1:3199 http://127.0.0.1:8199 "$WALK_ID" $OUT
RC3=$?
kill -- -$DEV
kill -- -$BE
echo "walk rc=$RC1 analyze rc=$RC2 csv+dark rc=$RC3"
