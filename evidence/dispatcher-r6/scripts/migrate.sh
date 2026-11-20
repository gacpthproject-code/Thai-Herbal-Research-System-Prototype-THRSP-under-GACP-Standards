#!/usr/bin/env bash
# Applies every migration of the worktree's schema to the round-6 scratch Postgres. Prints no URL.
set -uo pipefail
cd /home/ubuntu/work/wt-dispatcher/apps/backend || exit 2
export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH
DATABASE_URL="$(cat "${DB_URL_FILE:-/tmp/dispatcher-r6/secret/db-url}")"
export DATABASE_URL
node node_modules/prisma/build/index.js migrate deploy --schema prisma/schema 2>&1 | sed -E 's#postgres(ql)?://[^ ]*#<db-url>#g' | tail -8
