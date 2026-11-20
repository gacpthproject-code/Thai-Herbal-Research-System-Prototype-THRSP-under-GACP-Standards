#!/usr/bin/env bash
# scratch postgres :5434 + backend from tree :8090 + next dev :3090 + chromium shots; everything stopped at the end.
set -u
H=/home/ubuntu/work/wt-supersede/evidence/renewal-supersede-fix3/harness; OUT=/home/ubuntu/work/state/reviews/renewal-supersede-fix3-runs/visual; mkdir -p $OUT; rm -f $OUT/*
NAME=gacp-supersede-fix-scratch
export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH
cleanup() { [ -n "${WEB:-}" ] && pkill -TERM -P $WEB 2>/dev/null; kill ${WEB:-} ${API:-} 2>/dev/null; sleep 2; pkill -f "next dev -p 3090" 2>/dev/null; docker rm -f -v $NAME >/dev/null 2>&1; }
trap cleanup EXIT
docker rm -f -v $NAME >/dev/null 2>&1
docker run -d --name $NAME -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=gacp_visual -p 127.0.0.1:5434:5432 postgres:17-alpine >/dev/null || exit 3
for i in $(seq 1 60); do docker exec $NAME psql -U postgres -d gacp_visual -tAc 'select 1' >/dev/null 2>&1 && break; sleep 1; done
export DATABASE_URL='postgresql://postgres@127.0.0.1:5434/gacp_visual?schema=public'
(cd /home/ubuntu/work/wt-supersede/apps/backend && npx prisma migrate deploy > $OUT/migrate.log 2>&1)
OUT=$OUT/seed.json PORT=8090 node $H/seed-and-serve.js > $OUT/api.log 2>&1 & API=$!
for i in $(seq 1 180); do grep -q "^ready" $OUT/api.log 2>/dev/null && break; kill -0 $API 2>/dev/null || break; sleep 1; done
grep -q "^ready" $OUT/api.log || { echo "api not ready"; tail -20 $OUT/api.log; exit 4; }
(cd /home/ubuntu/work/wt-supersede/apps/web-app && BACKEND_URL=http://127.0.0.1:8090 INTERNAL_API_URL=http://127.0.0.1:8090 NODE_OPTIONS=--max-old-space-size=3072 npx next dev -p 3090 > $OUT/web.log 2>&1) & WEB=$!
for i in $(seq 1 180); do curl -s -o /dev/null http://127.0.0.1:3090/ && break; sleep 2; done
node $H/shots.js http://127.0.0.1:3090 $OUT $OUT/seed.json
cat $OUT/seed.json
