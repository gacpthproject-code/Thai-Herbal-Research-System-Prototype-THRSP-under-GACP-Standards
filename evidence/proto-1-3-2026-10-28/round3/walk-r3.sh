#!/usr/bin/env bash
# Round 3: backend from the tree on 8199 (scratch Postgres), next dev on 3199, then the compare page
# at 1440x900 and 390x844 plus dark mode, the CSV click, and the WHO analyze page (its level labels come from the same table).
set -u
W=/home/ubuntu/work/wt-proto13
E=$W/evidence/proto-1-3-2026-10-28
OUT=$E/round3
export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH
source /tmp/proto13-r3/env.sh
WALK_ID=9876543210987
WALK_PASSWORD=$(node -e "const m=require('fs').readFileSync('$W/apps/backend/prisma/seed-gacp.js','utf8').match(/ADMIN:\s*'([^']+)'/); process.stdout.write(m[1])")
export WALK_PASSWORD
cd $W/apps/backend
setsid node server.js > /tmp/proto13-r3/backend.log 2>&1 &
BE=$!
for i in $(seq 1 60); do curl -s -o /dev/null http://127.0.0.1:8199/api/health && break; sleep 2; done
cd $W/apps/web-app
INTERNAL_API_URL=http://127.0.0.1:8199 NEXT_PUBLIC_API_URL=http://127.0.0.1:3199 setsid npx next dev -p 3199 -H 127.0.0.1 > /tmp/proto13-r3/web.log 2>&1 &
DEV=$!
for i in $(seq 1 60); do curl -s -o /dev/null http://127.0.0.1:3199/ && break; sleep 2; done
cd $W
NODE_PATH=apps/web-app/node_modules node $E/walk.cjs http://127.0.0.1:3199 "$WALK_ID" $OUT p1-compare=/provider/standards/compare
RC1=$?
WALK_PICK=APP-68-002 NODE_PATH=apps/web-app/node_modules node $E/walk-analyze.cjs http://127.0.0.1:3199 "$WALK_ID" $OUT p1-who-analyze=/provider/standards/who
RC2=$?
NODE_PATH=apps/web-app/node_modules node $E/round2/walk-csv.cjs http://127.0.0.1:3199 http://127.0.0.1:8199 "$WALK_ID" $OUT
RC3=$?
kill -- -$DEV; kill -- -$BE
echo "walk rc=$RC1 analyze rc=$RC2 csv+dark rc=$RC3"
