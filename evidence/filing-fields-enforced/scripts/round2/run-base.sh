#!/usr/bin/env bash
# M1: the committed doors test and unit test, copied onto base c84940ec3 in a detached worktree, run
# against the same scratch Postgres. The control filing must pass; only the field cases may fail.
set -uo pipefail
BASE=/home/ubuntu/work/wt-ff-base
BR=/home/ubuntu/work/wt-filingfields
cd "$BASE" || exit 2
cp "$BR/apps/backend/__tests__/integration/katorlor1-fields-required-at-every-door-real-postgres.test.js" apps/backend/__tests__/integration/
cp "$BR/apps/backend/__tests__/unit/katorlor1-fields-required-at-submit.test.js" apps/backend/__tests__/unit/
LOG=/tmp/ff/r2/base-red-backend.log
echo "[run-base] base=$(git rev-parse HEAD) tests-from=$(git -C "$BR" rev-parse HEAD) $(date +%T)" > "$LOG"
cd apps/backend || exit 2
set -a; . /tmp/ff/pg.env; set +a
export TEST_DATABASE_URL="$DATABASE_URL" PAYMENT_ADAPTER=mock NODE_OPTIONS=--max-old-space-size=3072
npx jest --config jest.config.cjs __tests__/unit/katorlor1-fields-required-at-submit.test.js __tests__/integration/katorlor1-fields-required-at-every-door-real-postgres.test.js >> "$LOG" 2>&1
echo "[run-base] exit=$? $(date +%T)" >> "$LOG"
