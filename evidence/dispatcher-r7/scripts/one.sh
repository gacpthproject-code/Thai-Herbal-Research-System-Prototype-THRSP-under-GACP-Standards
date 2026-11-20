#!/usr/bin/env bash
# One backend test file (or a few) at the worktree, on the round-7 scratch database. usage: one.sh <outfile> <test path...>
set -uo pipefail
out="$1"; shift
cd /home/ubuntu/work/wt-dispatcher/apps/backend || exit 2
. /tmp/dispatcher-r7/scripts/backend-env.sh || exit 3
node node_modules/jest/bin/jest.js --config jest.config.cjs --runInBand --ci "$@" > "$out" 2>&1
echo "exit=$?" >> "$out"
git -C /home/ubuntu/work/wt-dispatcher checkout -- evidence/payer-block 2>/dev/null
grep -E "✓|✕|Tests:|exit=" "$out"
