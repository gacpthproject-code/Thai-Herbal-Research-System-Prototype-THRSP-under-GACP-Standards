#!/usr/bin/env bash
# RED = test commit 09d31911c's source files, GREEN = head. Fixed sources are committed, so
# restoring them with checkout HEAD is safe.
set -uo pipefail
WT=/home/ubuntu/work/wt-photocoords
OUT=$WT/evidence/approver-photo-coords-mismatch
SRC=(apps/backend/services/audit-onsite-service.js 'apps/web-app/src/app/provider/audits/[id]/inspect/client-view.tsx')
export DATABASE_URL='postgresql://gacp:gacp@127.0.0.1:55434/gacp_e2e_test?schema=public'
export NODE_OPTIONS=--max-old-space-size=3072
mkdir -p "$OUT"

run () {
  local label=$1
  echo "== $label $(git -C "$WT" rev-parse --short HEAD) sources:$2"
  ( cd "$WT/apps/backend" && npx jest --config jest.config.cjs --runInBand \
      __tests__/services/audit-onsite-service.test.js \
      __tests__/integration/approver-decision-tools-real-postgres.test.js 2>&1 | grep -E '✓|✕|Tests:|Suites:|●' ; echo "backend exit ${PIPESTATUS[0]}" )
  ( cd "$WT/apps/web-app" && node node_modules/jest/bin/jest.js --runInBand \
      'src/app/provider/audits/\[id\]/inspect/__tests__/photo-captured-at.test.tsx' 2>&1 | grep -E '✓|✕|Tests:|Suites:|●' ; echo "web exit ${PIPESTATUS[0]}" )
}

cd "$WT"
git checkout 09d31911c -- "${SRC[@]}"
run RED 09d31911c > "$OUT/red.log" 2>&1
git checkout HEAD -- "${SRC[@]}"
git diff --quiet HEAD || { echo "worktree not clean after restore"; exit 1; }
run GREEN HEAD > "$OUT/green.log" 2>&1
grep -E '^== |Tests:|exit' "$OUT/red.log" "$OUT/green.log"
