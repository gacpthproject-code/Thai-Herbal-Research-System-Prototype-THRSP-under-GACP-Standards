#!/usr/bin/env bash
# Web jest on named files at the worktree. usage: web-one.sh <outfile> <test path...>
set -uo pipefail
out="$1"; shift
cd /home/ubuntu/work/wt-dispatcher/apps/web-app || exit 2
export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH
export NODE_OPTIONS=--max-old-space-size=3072
node node_modules/jest/bin/jest.js --runInBand --ci "$@" > "$out" 2>&1
echo "exit=$?" >> "$out"
grep -E "✓|✕|Tests:|exit=" "$out"
