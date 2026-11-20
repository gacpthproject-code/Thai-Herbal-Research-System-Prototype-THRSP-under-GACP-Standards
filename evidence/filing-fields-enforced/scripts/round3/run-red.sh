#!/usr/bin/env bash
# Round 3 RED: the committed tests at the tests commit (detached worktree wt-ff-red), fix absent.
set -uo pipefail
bash /tmp/ff/r3/run-backend-at.sh /home/ubuntu/work/wt-ff-red /tmp/ff/r3/red-backend.log \
  __tests__/unit/katorlor1-fields-required-at-submit.test.js \
  __tests__/integration/replacement-is-not-asked-section-two-real-postgres.test.js
bash /tmp/ff/r3/run-web-at.sh /home/ubuntu/work/wt-ff-red /tmp/ff/r3/red-web.log \
  src/app/health/applications/new/_steps/__tests__/step3-gate-asks-what-step3-collects.test.ts \
  src/app/health/applications/new/_steps/__tests__/step4-gate-asks-for-a-variety.test.ts \
  src/app/health/applications/new/_steps/steps/__tests__/katorlor1-field-errors-show-inline.test.tsx
echo done
