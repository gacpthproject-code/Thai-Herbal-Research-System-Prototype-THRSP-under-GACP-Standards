#!/usr/bin/env bash
# Branch suites (same 7 files as rounds 1-2) + the new web test, on Node 24, scratch Postgres, at the final code sha.
set -u
W=/home/ubuntu/work/wt-proto13
export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH NODE_OPTIONS=--max-old-space-size=3072
source /tmp/proto13-r3/env.sh
SHA=$(git -C $W rev-parse HEAD)
OUT=$W/evidence/proto-1-3-2026-10-28/round3/final-jest-at-$SHA.txt
{
  echo "sha $SHA clean=$(git -C $W status --short | grep -v '^?? evidence/' | wc -l) node $(node -v)"
  cd $W/apps/backend
  timeout 1500 npx jest --config jest.config.cjs \
    __tests__/unit/standards-analyze-routes.test.js \
    __tests__/unit/standards-comparison-requires-login.test.js \
    __tests__/unit/standards-requirement-comparison.test.js \
    __tests__/unit/standards-analyzer-service.test.js \
    __tests__/unit/stakeholder-insight-service.test.js \
    __tests__/integration/standards-analysis-real-postgres.test.js \
    __tests__/integration/stakeholder-insights-real-postgres.test.js 2>&1
  echo "backend jest exit $?"
  cd $W/apps/web-app
  timeout 600 node node_modules/jest/bin/jest.js src/__tests__/standards-compare-copy-order-154.test.ts 2>&1
  echo "web jest exit $?"
} > "$OUT"
grep -E "✕|Tests:|Suites:|exit|skipped" "$OUT"
