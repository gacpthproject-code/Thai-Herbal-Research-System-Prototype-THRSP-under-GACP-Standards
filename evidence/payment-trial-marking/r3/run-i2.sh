#!/usr/bin/env bash
# I-2 (settle keeps invoice metadata written after its read): the unit suite and the real-Postgres suite
# at the checked-out commit, on a scratch database. usage: ~/work/state/heavy.sh timeout 1800 bash run-i2.sh <red|green>
# `affected` runs the backend money suites instead (same pattern as r2/run-r2.sh), with the database.
set -uo pipefail
LABEL=${1:?red, green or affected}
export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH
export NODE_OPTIONS=--max-old-space-size=3072
WT=/home/ubuntu/work/wt-trialmark
LOG=$WT/evidence/payment-trial-marking/runs/r3-i2-$LABEL.log
trap 'docker rm -f -v trialmark-i2-scratch >/dev/null 2>&1' EXIT
{
  git -C "$WT" log --oneline -1
  PW=$(head -c 18 /dev/urandom | base64 | tr -dc A-Za-z0-9)
  docker rm -f -v trialmark-i2-scratch >/dev/null 2>&1
  docker run -d --name trialmark-i2-scratch -e POSTGRES_PASSWORD="$PW" -e POSTGRES_DB=gacp_e2e_test -p 127.0.0.1:55442:5432 postgres:17-alpine >/dev/null || exit 4
  for _ in $(seq 1 60); do docker exec trialmark-i2-scratch psql -U postgres -d gacp_e2e_test -tAc 'select 1' >/dev/null 2>&1 && break; sleep 1; done
  export TEST_DATABASE_URL="postgresql://postgres:$PW@127.0.0.1:55442/gacp_e2e_test?schema=public"
  cd "$WT/apps/backend"
  DATABASE_URL="$TEST_DATABASE_URL" timeout 600 npx prisma migrate deploy --schema prisma/schema 2>&1 | tail -2
  if [ "$LABEL" = affected ]; then
    timeout 1500 npx jest --config jest.config.cjs --testPathPatterns '(payment|refund|credit-note|debit-note|invoice|settle|settlement|checkout|notification|finance-routes|admin-positive-bypass|receipt|quotation|webhook|stripe|fanout|billing|error-code|dtam-accounting|dtam-remittance)'
  else
    timeout 900 npx jest --config jest.config.cjs __tests__/unit/settlement-records-livemode.test.js __tests__/integration/settlement-keeps-invoice-metadata-real-postgres.test.js
  fi
  echo "exit=$?"
} > "$LOG" 2>&1
echo "$LOG"
