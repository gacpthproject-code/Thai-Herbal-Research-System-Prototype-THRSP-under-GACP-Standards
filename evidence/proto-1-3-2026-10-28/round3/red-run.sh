#!/usr/bin/env bash
# RED on 3a2c0f1bc + the new tests only: unit files need no DB (prisma mocked).
set -u
W=/home/ubuntu/work/wt-proto13
OUT=$W/evidence/proto-1-3-2026-10-28/round3/red-n1-n3-on-3a2c0f1bc.txt
export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH NODE_OPTIONS=--max-old-space-size=3072
{
  echo "sha $(git -C $W rev-parse HEAD) node $(node -v)"
  cd $W/apps/backend
  timeout 900 npx jest --config jest.config.cjs __tests__/unit/standards-requirement-comparison.test.js __tests__/unit/standards-comparison-requires-login.test.js 2>&1
  echo "backend jest exit $?"
  cd $W/apps/web-app
  timeout 900 node node_modules/jest/bin/jest.js src/__tests__/standards-compare-copy-order-154.test.ts 2>&1
  echo "web jest exit $?"
} > "$OUT"
grep -E "✕|✓|Tests:|Suites:|exit" "$OUT"
