#!/usr/bin/env bash
# jest on a given worktree's backend against the scratch Postgres; URL enters through the environment only.
# usage: run-backend-at.sh <worktree> <log> <jest args...>
set -uo pipefail
WT=$1; LOG=$2; shift 2
cd "$WT/apps/backend" || exit 2
set -a; . /tmp/ff/pg.env; set +a
export TEST_DATABASE_URL="$DATABASE_URL" PAYMENT_ADAPTER=mock NODE_OPTIONS=--max-old-space-size=3072
echo "[run-backend] $(date +%T) sha=$(git rev-parse HEAD) dirty=$(git status --porcelain | wc -l) jest $*" > "$LOG"
npx jest --config jest.config.cjs "$@" >> "$LOG" 2>&1
echo "[run-backend] exit=$? $(date +%T)" >> "$LOG"
