#!/usr/bin/env bash
export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH
cd /home/ubuntu/work/wt-supersede/apps/backend
{ echo "head $(git rev-parse HEAD)"; DATABASE_URL='postgresql://nobody@127.0.0.1:1/none' NODE_OPTIONS=--max-old-space-size=3072 npx jest 2>&1 | grep -E "^(PASS|FAIL) |Tests:|Test Suites:|✕"; echo "jest exit ${PIPESTATUS[0]}"; } > /home/ubuntu/work/state/reviews/renewal-supersede-fix-runs/unit-sweep.log 2>&1
