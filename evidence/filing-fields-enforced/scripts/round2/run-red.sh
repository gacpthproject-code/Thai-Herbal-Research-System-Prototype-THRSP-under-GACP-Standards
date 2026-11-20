#!/usr/bin/env bash
# Round 2 RED at dd61c80f9 + tests: backend unit + doors on the scratch Postgres, then the web files.
set -uo pipefail
cd /home/ubuntu/work/wt-filingfields
echo "sha=$(git rev-parse HEAD) dirty=$(git status --porcelain | wc -l)" > /tmp/ff/r2/red-header.txt
bash /tmp/ff/run-backend.sh /tmp/ff/r2/red-backend.log __tests__/unit/katorlor1-fields-required-at-submit.test.js __tests__/integration/katorlor1-fields-required-at-every-door-real-postgres.test.js
bash /tmp/ff/run-web.sh /tmp/ff/r2/red-web.log \
  src/lib/api/__tests__/api-client-filing-refusal.test.ts \
  src/lib/services/__tests__/application-requirements.test.ts \
  src/lib/services/__tests__/submit-and-hand-over.test.ts \
  src/app/health/applications/new/_steps/steps/__tests__/step6-review-state.test.ts \
  src/app/health/applications/new/_steps/steps/__tests__/step6-review.test.tsx \
  src/app/health/applications/new/_steps/steps/__tests__/katorlor1-field-errors-show-inline.test.tsx \
  src/app/health/applications/new/_steps/__tests__/step3-gate-asks-what-step3-collects.test.ts \
  "src/app/health/applications/[id]/revision/__tests__/revision-answers.test.tsx"
echo done
