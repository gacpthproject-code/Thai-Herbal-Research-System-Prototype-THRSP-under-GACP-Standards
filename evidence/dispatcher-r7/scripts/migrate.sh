#!/usr/bin/env bash
# Applies every migration of the worktree's schema to the round-7 scratch Postgres. Prints no URL.
set -uo pipefail
cd /home/ubuntu/work/wt-dispatcher/apps/backend || exit 2
. /tmp/dispatcher-r7/scripts/backend-env.sh || exit 3
node node_modules/prisma/build/index.js migrate deploy --schema prisma/schema 2>&1 | sed -E 's#postgres(ql)?://[^ ]*#<db-url>#g' | tail -8
