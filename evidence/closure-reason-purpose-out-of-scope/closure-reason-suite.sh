#!/usr/bin/env bash
# usage: closure-reason-suite.sh <worktree> <jest file>...
# Runs the named backend jest files against a throwaway postgres:17-alpine on 127.0.0.1:5434,
# migrated with the worktree's own schema, then removes the container.
set -uo pipefail
WT=${1:?worktree}; shift
NAME=gacp-closurereason-scratch
PW=$(head -c 18 /dev/urandom | base64 | tr -dc A-Za-z0-9)
docker rm -f -v "$NAME" >/dev/null 2>&1
trap 'docker rm -f -v "$NAME" >/dev/null 2>&1' EXIT
docker run -d --name "$NAME" -e POSTGRES_PASSWORD="$PW" -e POSTGRES_DB=gacp_e2e_test -p 127.0.0.1:5434:5432 postgres:17-alpine >/dev/null || exit 3
for _ in $(seq 1 60); do docker exec "$NAME" psql -h 127.0.0.1 -U postgres -d gacp_e2e_test -tAc 'select 1' >/dev/null 2>&1 && break; sleep 1; done
export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH
export TEST_DATABASE_URL="postgresql://postgres:$PW@127.0.0.1:5434/gacp_e2e_test?schema=public"
export DATABASE_URL="$TEST_DATABASE_URL"
cd "$WT/apps/backend" || exit 2
npx prisma migrate deploy >/dev/null 2>&1 || { echo "migrate deploy failed"; exit 4; }
NODE_OPTIONS=--max-old-space-size=3072 npx jest --ci --forceExit "$@" 2>&1 | grep -v -i "postgres:"
exit "${PIPESTATUS[0]}"
