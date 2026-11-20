#!/usr/bin/env bash
# usage: pg-jest2.sh <tree> <log> <jest files...> — scratch postgres:17 on 127.0.0.1:5437, migrate, jest, remove.
set -u
TREE=$1; LOG=$2; shift 2
NAME=a8f1-pg2
docker rm -f -v $NAME >/dev/null 2>&1
docker run -d --name $NAME -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=a8f1b -p 127.0.0.1:5437:5432 postgres:17-alpine >/dev/null || exit 3
for i in $(seq 1 60); do docker exec $NAME psql -U postgres -d a8f1b -tAc 'select 1' >/dev/null 2>&1 && break; sleep 1; done
export PATH=/home/ubuntu/.nvm/versions/node/v24.21.0/bin:$PATH
export DATABASE_URL='postgresql://postgres@127.0.0.1:5437/a8f1b?schema=public' TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:5437/a8f1b?schema=public'
cd "$TREE/apps/backend"
{
  echo "head $(git rev-parse --short HEAD) dirty-files: $(git status --porcelain | grep -v '^??' | wc -l)"
  npx prisma migrate deploy 2>&1 | tail -1
  NODE_OPTIONS=--max-old-space-size=3072 npx jest --runInBand "$@" 2>&1 | grep -vE '^\s+at |^prisma:query'
  echo "jest exit ${PIPESTATUS[0]}"
} > "$LOG"
docker rm -f -v $NAME >/dev/null 2>&1
grep -E "^Tests:|jest exit|^head" "$LOG"; grep -E "^\s+✕" "$LOG" | cut -c1-160
