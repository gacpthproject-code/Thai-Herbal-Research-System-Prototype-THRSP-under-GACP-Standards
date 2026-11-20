#!/usr/bin/env bash
# The whole backend suite at the worktree's HEAD in two halves (unit, then integration), 2 workers each.
set -uo pipefail
wt=/home/ubuntu/work/wt-dispatcher
out=/tmp/dispatcher-r6/suites
mkdir -p "$out"
cd "$wt/apps/backend" || exit 2
. /tmp/dispatcher-r6/scripts/backend-env.sh
echo "sha=$(git rev-parse --short=9 HEAD) dirty=$(git status --porcelain -- . ../../packages | grep -v '^??' | wc -l) started=$(date -u +%FT%TZ)" > "$out/backend.meta"
node node_modules/jest/bin/jest.js --config jest.config.cjs --maxWorkers=2 --ci --silent \
  --testPathIgnorePatterns /node_modules/ /.next/ /dist/ /build/ /__tests__/integration/ \
  --json --outputFile="$out/unit.json" > "$out/unit.log" 2>&1
echo "exit=$?" >> "$out/unit.log"
git -C "$wt" checkout -- evidence/payer-block
node node_modules/jest/bin/jest.js --config jest.config.cjs --maxWorkers=2 --ci --silent __tests__/integration/ \
  --json --outputFile="$out/integration.json" > "$out/integration.log" 2>&1
echo "exit=$?" >> "$out/integration.log"
git -C "$wt" checkout -- evidence/payer-block
echo "ended=$(date -u +%FT%TZ)" >> "$out/backend.meta"
