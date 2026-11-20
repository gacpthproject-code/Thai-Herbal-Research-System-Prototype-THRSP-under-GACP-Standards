#!/usr/bin/env bash
# Every suite that names the changed service, the decision file, or the inspect page.
set -uo pipefail
WT=${WT:-/home/ubuntu/work/wt-photocoords}
export DATABASE_URL='postgresql://gacp:gacp@127.0.0.1:55434/gacp_e2e_test?schema=public'
export NODE_OPTIONS=--max-old-space-size=3072
cd "$WT/apps/backend" || exit 1
FILES=$(grep -rl -E "certification-decision-file|decision-file|audit-onsite-service|reviewPhotoProvenance|verifyGpsAgainstFarm" __tests__ --include=*.js | sort)
echo "== backend: $(echo "$FILES" | wc -l) files"
timeout 3000 npx jest --config jest.config.cjs $FILES 2>&1 | tail -60
echo "backend exit ${PIPESTATUS[0]}"
cd "$WT/apps/web-app" || exit 1
echo "== web-app"
timeout 1200 node node_modules/jest/bin/jest.js 'src/app/provider/audits' 'src/app/provider/certification-decisions' 2>&1 | tail -40
echo "web exit ${PIPESTATUS[0]}"
