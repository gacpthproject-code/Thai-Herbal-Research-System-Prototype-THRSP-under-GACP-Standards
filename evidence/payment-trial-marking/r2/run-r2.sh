#!/usr/bin/env bash
# Round 2 RED -> GREEN and evidence, one heavy job: ~/work/state/heavy.sh timeout 5400 bash run-r2.sh
set -uo pipefail
export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH
export NODE_OPTIONS=--max-old-space-size=3072
MAIN=/home/ubuntu/work/GACP-Certification-Application
WT=/home/ubuntu/work/wt-trialmark
EV=$WT/evidence/payment-trial-marking
RUNS=$EV/runs
RED_SHA=${RED_SHA:-99a522e05}
RED=/tmp/trialmark-r2-red
mkdir -p "$RUNS"
step() { echo "== $(date '+%H:%M:%S') $*"; }

BACK_RED="__tests__/unit/settlement-records-livemode.test.js __tests__/unit/payment-trial-marking.test.js __tests__/unit/payment-success-notice-says-trial.test.js __tests__/unit/invoice-lists-carry-payment-mode.test.js __tests__/unit/refund-notices-say-trial.test.js __tests__/unit/note-papers-read-settlement-mode.test.js"
WEB_RED="src/app/health/payments/__tests__/payments-trial-marks.test.tsx src/app/health/payments/checkout/__tests__/checkout-promptpay-qr.test.tsx src/app/health/payments/checkout/__tests__/checkout-trial-notice.test.tsx src/components/payments/__tests__/trial-document-marks.test.tsx"

backend_jest() { (cd "$1/apps/backend" && timeout 900 npx jest --config jest.config.cjs "${@:2}"); echo "exit=$?"; }
web_jest() { (cd "$1/apps/web-app" && timeout 900 node node_modules/jest/bin/jest.js "${@:2}"); echo "exit=$?"; }

step "RED tree at $RED_SHA"
git -C "$WT" worktree remove --force "$RED" >/dev/null 2>&1
git -C "$WT" worktree add --detach "$RED" "$RED_SHA" >/dev/null 2>&1 || exit 3
ln -sfn "$MAIN/node_modules" "$RED/node_modules"
ln -sfn "$MAIN/apps/backend/node_modules" "$RED/apps/backend/node_modules"
ln -sfn "$MAIN/apps/web-app/node_modules" "$RED/apps/web-app/node_modules"
git -C "$RED" log --oneline -1

step "backend RED"; backend_jest "$RED" $BACK_RED > "$RUNS/r2-backend-red.log" 2>&1
step "web RED"; web_jest "$RED" $WEB_RED > "$RUNS/r2-web-red.log" 2>&1
step "backend GREEN"; backend_jest "$WT" $BACK_RED > "$RUNS/r2-backend-green.log" 2>&1
step "web GREEN"; web_jest "$WT" $WEB_RED > "$RUNS/r2-web-green.log" 2>&1

step "scratch postgres for the refund integration suite"
PW=$(head -c 18 /dev/urandom | base64 | tr -dc A-Za-z0-9)
docker rm -f -v trialmark-scratch >/dev/null 2>&1
docker run -d --name trialmark-scratch -e POSTGRES_PASSWORD="$PW" -e POSTGRES_DB=gacp_e2e_test -p 127.0.0.1:55441:5432 postgres:17-alpine >/dev/null || exit 4
for _ in $(seq 1 60); do docker exec trialmark-scratch psql -U postgres -d gacp_e2e_test -tAc 'select 1' >/dev/null 2>&1 && break; sleep 1; done
export TEST_DATABASE_URL="postgresql://postgres:$PW@127.0.0.1:55441/gacp_e2e_test?schema=public"
(cd "$WT/apps/backend" && DATABASE_URL="$TEST_DATABASE_URL" timeout 600 npx prisma migrate deploy --schema prisma/schema > "$RUNS/r2-scratch-migrate.log" 2>&1; echo "exit=$?" >> "$RUNS/r2-scratch-migrate.log")
step "refund integration RED"; backend_jest "$RED" __tests__/integration/refund-kinds-real-postgres.test.js > "$RUNS/r2-refund-integration-red.log" 2>&1
step "refund integration GREEN"; backend_jest "$WT" __tests__/integration/refund-kinds-real-postgres.test.js > "$RUNS/r2-refund-integration-green.log" 2>&1

step "backend affected suites GREEN (with the scratch database)"
backend_jest "$WT" --testPathPatterns '(payment|refund|credit-note|debit-note|invoice|settle|checkout|notification|finance-routes|admin-positive-bypass|receipt|quotation|webhook|stripe|fanout|billing)' > "$RUNS/r2-backend-affected-green.log" 2>&1
step "backend affected suites RED tree (baseline for the same set)"
backend_jest "$RED" --testPathPatterns '(payment|refund|credit-note|debit-note|invoice|settle|checkout|notification|finance-routes|admin-positive-bypass|receipt|quotation|webhook|stripe|fanout|billing)' > "$RUNS/r2-backend-affected-red.log" 2>&1
docker rm -f -v trialmark-scratch >/dev/null 2>&1
unset TEST_DATABASE_URL

step "web affected suites GREEN"; web_jest "$WT" src/app/health/payments src/app/health/billing src/app/provider/accounting src/components/payments src/lib/payment src/lib/services > "$RUNS/r2-web-affected-green.log" 2>&1
step "web tsc"; (cd "$WT/apps/web-app" && rm -rf .next/types && timeout 900 npx tsc --noEmit -p tsconfig.json; echo "exit=$?") > "$RUNS/r2-web-tsc.log" 2>&1
step "web eslint on changed files"; (cd "$WT/apps/web-app" && timeout 600 npx eslint src/components/payments/trial-marks.tsx src/lib/payment/payment-mode.ts src/lib/services/payment-service.ts src/app/provider/accounting/accounting-dashboard-client.tsx src/app/provider/accounting/invoice-detail-modal.tsx src/app/health/payments/client-view.tsx; echo "exit=$?") > "$RUNS/r2-web-eslint.log" 2>&1
step "backend eslint on changed files"; (cd "$WT/apps/backend" && timeout 600 npx eslint shared/payment-mode.js services/checkout/checkout-settlement-service.js services/credit-note-service.js services/debit-note-service.js services/invoice-service.js services/notification-fanout-service.js services/notification/application-parties.js services/notification/domain-helpers.js services/pdf/invoice-template-service.js services/refund-service.js __tests__/unit/note-papers-read-settlement-mode.test.js; echo "exit=$?") > "$RUNS/r2-backend-eslint.log" 2>&1

step "papers"; (cd "$WT/apps/backend" && DATABASE_URL=postgresql://render-papers@127.0.0.1:1/none timeout 600 node "$EV/r2/render-reprints.js" "$EV/r2/papers"; echo "exit=$?") > "$EV/r2/papers.log" 2>&1
step "notices"; (cd "$WT/apps/backend" && DATABASE_URL=postgresql://render-papers@127.0.0.1:1/none timeout 120 node "$EV/r2/notices.js" | grep -v '^\S*info\S*:'; echo "exit=$?") > "$EV/r2/refund-notices.txt" 2>&1

step "screens"
cd "$WT/apps/web-app"
NEXT_PUBLIC_PWA_ENABLED=false NEXT_PUBLIC_CHECKOUT_UI_ENABLED=true npx next dev -H 127.0.0.1 -p 3127 > /tmp/trialmark-r2-next.log 2>&1 &
NEXT_PID=$!
trap 'kill $NEXT_PID 2>/dev/null; pkill -f "next dev -H 127.0.0.1 -p 3127" 2>/dev/null; docker rm -f -v trialmark-scratch >/dev/null 2>&1' EXIT
for _ in $(seq 1 120); do curl -s -o /dev/null http://127.0.0.1:3127/ && break; sleep 2; done
timeout 1200 node "$EV/r2/viewpack-r2.js" "$EV/r2/screens" > "$EV/r2/screens.log" 2>&1; echo "exit=$?" >> "$EV/r2/screens.log"
git -C "$WT" worktree remove --force "$RED" >/dev/null 2>&1
step "done"
