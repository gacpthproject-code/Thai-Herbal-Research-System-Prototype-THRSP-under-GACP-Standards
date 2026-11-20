#!/usr/bin/env bash
# The affected backend set once more after the follow-up commit (no database: the integration suites skip here, the refund one ran in run-r2.sh)
set -uo pipefail
export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH
export NODE_OPTIONS=--max-old-space-size=3072
WT=/home/ubuntu/work/wt-trialmark
cd "$WT/apps/backend" && git log --oneline -1 && timeout 900 npx jest --config jest.config.cjs --testPathPatterns '(payment|refund|credit-note|debit-note|invoice|settle|checkout|notification|finance-routes|admin-positive-bypass|receipt|quotation|webhook|stripe|fanout|billing|error-code)'
echo "exit=$?"
