#!/usr/bin/env bash
# Full web jest (2 workers) then tsc on the worktree's HEAD, round 6.
set -uo pipefail
wt=/home/ubuntu/work/wt-dispatcher
out=/tmp/dispatcher-r6/suites
mkdir -p "$out"
cd "$wt/apps/web-app" || exit 2
export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH
export NODE_OPTIONS=--max-old-space-size=3072
echo "sha=$(git rev-parse --short=9 HEAD) dirty=$(git status --porcelain -- . ../../packages | grep -v '^??' | wc -l) started=$(date -u +%FT%TZ)" > "$out/web.meta"
node node_modules/jest/bin/jest.js --maxWorkers=2 --ci --silent --json --outputFile="$out/web-jest.json" > "$out/web-jest.log" 2>&1
echo "jest-exit=$?" >> "$out/web-jest.log"
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json > "$out/web-tsc.log" 2>&1
echo "tsc-exit=$?" >> "$out/web-tsc.log"
echo "ended=$(date -u +%FT%TZ)" >> "$out/web.meta"
