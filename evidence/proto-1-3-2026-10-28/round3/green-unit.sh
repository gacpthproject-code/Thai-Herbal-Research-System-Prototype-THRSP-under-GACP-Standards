#!/usr/bin/env bash
set -u
W=/home/ubuntu/work/wt-proto13
OUT=$W/evidence/proto-1-3-2026-10-28/round3/green-unit-typecheck-lint.txt
export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH NODE_OPTIONS=--max-old-space-size=3072
{
  echo "node $(node -v) tree: $(git -C $W status --short | wc -l) changed files on $(git -C $W rev-parse --short HEAD)"
  cd $W/apps/backend
  timeout 900 npx jest --config jest.config.cjs __tests__/unit/standards-requirement-comparison.test.js __tests__/unit/standards-comparison-requires-login.test.js 2>&1
  echo "backend jest exit $?"
  cd $W/apps/web-app
  timeout 900 node node_modules/jest/bin/jest.js src/__tests__/standards-compare-copy-order-154.test.ts 2>&1
  echo "web jest exit $?"
  timeout 1200 npx tsc --noEmit -p tsconfig.json 2>&1; echo "tsc exit $?"
  timeout 600 npx eslint --max-warnings=0 src/app/provider/standards/compare/page.tsx src/__tests__/standards-compare-copy-order-154.test.ts 2>&1; echo "eslint web exit $?"
  cd $W/apps/backend
  timeout 600 npx eslint services/standards-analyzer-service.js data/standards/gacp-requirement-comparison.js __tests__/unit/standards-requirement-comparison.test.js __tests__/unit/standards-comparison-requires-login.test.js 2>&1; echo "eslint backend exit $?"
} > "$OUT"
grep -E "✕|Tests:|Suites:|exit|error" "$OUT" | head -30
