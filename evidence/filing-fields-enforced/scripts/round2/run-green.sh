#!/usr/bin/env bash
# Round 2 GREEN: the RED files plus round 1's neighbour suites, web tsc, eslint on the changed files.
set -uo pipefail
cd /home/ubuntu/work/wt-filingfields
echo "sha=$(git rev-parse HEAD) dirty=$(git status --porcelain | wc -l)" > /tmp/ff/r2/green-header.txt
bash /tmp/ff/run-backend.sh /tmp/ff/r2/green-backend.log \
  __tests__/unit/katorlor1-fields-required-at-submit.test.js \
  __tests__/integration/katorlor1-fields-required-at-every-door-real-postgres.test.js \
  __tests__/integration/filing-doors-run-one-gate-list-real-postgres.test.js \
  __tests__/integration/applicant-submit-walk-web-and-mobile-real-postgres.test.js \
  __tests__/integration/filing-legs-read-their-own-clock-real-postgres.test.js \
  __tests__/unit/submit-judges-the-filing-the-wizard-actually-writes.test.js \
  __tests__/unit/submit-materialises-the-farm-the-certificate-names.test.js \
  __tests__/unit/holder-single-source.test.js \
  __tests__/unit/site-contact-is-required-at-submit.test.js \
  __tests__/unit/v2-filing-must-carry-structured-farm-location.test.js \
  __tests__/unit/katorlor1-template.test.js \
  __tests__/unit/katorlor1-section-two-prints-what-was-asked.test.js \
  __tests__/unit/certificate-reads-the-wizard-site.test.js \
  __tests__/unit/a-certified-plot-keeps-the-area-the-filing-declared.test.js \
  __tests__/unit/requirement-rule-service.test.js \
  __tests__/unit/application-requirements-service.test.js \
  __tests__/unit/canonical-application-validator.test.js \
  __tests__/unit/applications-submit-canonical-validation.test.js \
  __tests__/unit/applicant-id-checksum-submit-door.test.js
bash /tmp/ff/run-web.sh /tmp/ff/r2/green-web.log \
  src/app/health/applications/new/_steps src/lib/services src/lib/api src/app/health/applications/preview \
  "revision-answers.test.tsx" "revision-upload-in-place" "revision-state"
cd apps/web-app && NODE_OPTIONS=--max-old-space-size=3072 node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json > /tmp/ff/r2/tsc-web.log 2>&1; echo "tsc exit=$?" >> /tmp/ff/r2/tsc-web.log
node node_modules/eslint/bin/eslint.js \
  src/lib/services/application-requirements.ts src/lib/services/submit-and-hand-over.ts \
  src/app/health/applications/new/_steps/steps/step6-review-state.ts src/app/health/applications/new/_steps/steps/step6-review.tsx \
  "src/app/health/applications/[id]/revision/client-view.tsx" "src/app/health/applications/[id]/revision/revision-state.ts" \
  src/app/health/applications/new/_steps/steps/step3-site-land-config.ts src/app/health/applications/new/_steps/steps/step3-site-land.tsx \
  src/app/health/applications/new/_steps/steps/step4-variety-purpose.tsx src/app/health/applications/new/_steps/hooks/use-application-flow-store.ts \
  src/lib/api/__tests__/api-client-filing-refusal.test.ts > /tmp/ff/r2/eslint-web.log 2>&1; echo "eslint exit=$?" >> /tmp/ff/r2/eslint-web.log
cd ../backend && node_modules/.bin/eslint validation/canonical-application-validator.js validation/application-submission-validator.js services/application-filing-gates.js > /tmp/ff/r2/eslint-backend.log 2>&1; echo "eslint exit=$?" >> /tmp/ff/r2/eslint-backend.log
echo done
