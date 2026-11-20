#!/usr/bin/env bash
# usage: pg-jest.sh <log> <jest args...> — throwaway postgres:17-alpine on 127.0.0.1:5434 (trust auth, loopback only),
# migrate deploy from the worktree, run jest against it, remove the container. Run under ~/work/state/heavy.sh.
set -u
LOG=$1; shift
NAME=gacp-supersede-fix-scratch
docker rm -f -v $NAME >/dev/null 2>&1
docker run -d --name $NAME -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=gacp_test -p 127.0.0.1:5434:5432 postgres:17-alpine >/dev/null || exit 3
for i in $(seq 1 60); do docker exec $NAME psql -U postgres -d gacp_test -tAc 'select 1' >/dev/null 2>&1 && break; sleep 1; done
export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH
export TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:5434/gacp_test?schema=public'
cd "${TREE:-/home/ubuntu/work/wt-supersede}/apps/backend"
{
  echo "head $(git rev-parse HEAD) dirty-files: $(git status --porcelain | wc -l)"
  DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy 2>&1 | tail -3
  NODE_OPTIONS=--max-old-space-size=3072 npx jest --runInBand "$@" 2>&1
  echo "jest exit $?"
} > "$LOG"
docker rm -f -v $NAME >/dev/null 2>&1
tail -5 "$LOG"
