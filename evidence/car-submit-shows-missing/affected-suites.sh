#!/usr/bin/env bash
# Affected suites for F-A8c-06 at the worktree's HEAD. Backend real-Postgres suites run against a
# fresh database gacp_test on the scratch container carmissing-db (55437). Run under heavy.sh.
# usage: affected-suites.sh <log>
set -u
LOG=$1
WT=$(git -C "$(dirname "$(readlink -f "$0")")" rev-parse --show-toplevel)
export NODE_OPTIONS=--max-old-space-size=3072
export TEST_DATABASE_URL='postgresql://gacp:gacp@127.0.0.1:55437/gacp_test?schema=public'
docker exec carmissing-db psql -U gacp -d gacp_car -tAc 'drop database if exists gacp_test' >/dev/null
docker exec carmissing-db psql -U gacp -d gacp_car -tAc 'create database gacp_test' >/dev/null
{
  echo "head $(git -C "$WT" rev-parse --short HEAD) dirty-files: $(git -C "$WT" status --porcelain -- apps packages | wc -l)"
  cd "$WT/apps/backend"
  DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy 2>&1 | tail -1
  timeout 1500 npx jest --runInBand \
    __tests__/unit/car-door-not-asked-holder-record.test.js \
    __tests__/unit/katorlor1-fields-required-at-submit.test.js \
    __tests__/unit/submit-doors-answer-every-gate-refusal.test.js \
    __tests__/unit/m1-submit-guard-doors.test.js \
    __tests__/unit/m2a-doc-requirements-doors.test.js \
    __tests__/unit/revision-resubmit-door.test.js \
    __tests__/unit/applications-submit-capability-gate.test.js \
    __tests__/unit/submit-requires-declarations.test.js \
    __tests__/unit/correction-deadline-guard.test.js \
    __tests__/unit/error-codes-catalog.test.js \
    __tests__/unit/error-codes-source-pointers.test.js \
    __tests__/unit/holder-single-source.test.js \
    __tests__/unit/a-company-holds-its-own-certificate.test.js \
    __tests__/integration/car-evidence-per-file-real-postgres.test.js \
    __tests__/integration/car-evidence-notifies-only-its-inspector-real-postgres.test.js \
    __tests__/integration/answer-doors-stop-the-revision-clock-real-postgres.test.js 2>&1
  echo "backend jest exit $?"
  cd "$WT/apps/web-app"
  timeout 900 npx jest \
    'src/app/health/applications/\[id\]/car' 'src/app/health/applications/\[id\]/revision' \
    src/lib/services/__tests__/car-round.test.ts src/lib/services/__tests__/application-requirements.test.ts 2>&1
  echo "web jest exit $?"
  timeout 900 npx tsc --noEmit -p . 2>&1 | tail -5
  echo "web tsc exit ${PIPESTATUS[0]}"
  timeout 600 npx eslint 'src/app/health/applications/[id]/car/client-view.tsx' src/lib/services/car-round.ts \
    'src/app/health/applications/[id]/car/__tests__/per-file-upload.test.tsx' 2>&1 | tail -5
  echo "web eslint exit ${PIPESTATUS[0]}"
} > "$LOG" 2>&1
grep -E "^head|Tests:|exit|Test Suites:" "$LOG"
