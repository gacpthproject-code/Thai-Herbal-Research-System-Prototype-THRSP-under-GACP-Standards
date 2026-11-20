#!/usr/bin/env bash
# Round 3 final: branch backend + web suites on the clean tree of wt-filingfields, plus web tsc and eslint.
set -uo pipefail
WT=/home/ubuntu/work/wt-filingfields
cd "$WT"
echo "sha=$(git rev-parse HEAD) dirty=$(git status --porcelain | wc -l)" > /tmp/ff/r3/final-header.txt
bash /tmp/ff/r3/run-backend-at.sh "$WT" /tmp/ff/r3/final-backend.log \
  __tests__/unit/katorlor1-fields-required-at-submit.test.js \
  __tests__/integration/katorlor1-fields-required-at-every-door-real-postgres.test.js \
  __tests__/integration/replacement-is-not-asked-section-two-real-postgres.test.js \
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
  __tests__/unit/law-dimensions-are-checked-before-written.test.js \
  __tests__/unit/canonical-application-validator.test.js \
  __tests__/unit/applications-submit-canonical-validation.test.js \
  __tests__/unit/applicant-id-checksum-submit-door.test.js \
  __tests__/unit/error-codes-source-pointers.test.js \
  __tests__/unit/error-codes-catalog.test.js
bash /tmp/ff/r3/run-web-at.sh "$WT" /tmp/ff/r3/final-web.log \
  src/app/health/applications/new/_steps src/lib/services src/lib/api src/app/health/applications/preview \
  "revision-answers.test.tsx" "revision-upload-in-place" "revision-state"
cd "$WT/apps/web-app" && NODE_OPTIONS=--max-old-space-size=3072 node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json > /tmp/ff/r3/final-tsc-web.log 2>&1; echo "tsc exit=$?" >> /tmp/ff/r3/final-tsc-web.log
node node_modules/eslint/bin/eslint.js \
  src/app/health/applications/new/_steps/steps/step1-request-type-config.ts \
  src/app/health/applications/new/_steps/steps/step3-site-land-config.ts src/app/health/applications/new/_steps/steps/step3-site-land.tsx \
  src/app/health/applications/new/_steps/steps/step4-variety-purpose-config.ts src/app/health/applications/new/_steps/steps/step4-variety-purpose.tsx \
  src/app/health/applications/new/_steps/hooks/use-application-flow-store.ts > /tmp/ff/r3/final-eslint-web.log 2>&1; echo "eslint exit=$?" >> /tmp/ff/r3/final-eslint-web.log
cd "$WT/apps/backend" && node_modules/.bin/eslint validation/canonical-application-validator.js services/application-requirements-service.js shared/error-codes.js \
  __tests__/integration/replacement-is-not-asked-section-two-real-postgres.test.js > /tmp/ff/r3/final-eslint-backend.log 2>&1; echo "eslint exit=$?" >> /tmp/ff/r3/final-eslint-backend.log
echo done
