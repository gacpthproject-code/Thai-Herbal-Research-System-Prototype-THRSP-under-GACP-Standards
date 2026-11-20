#!/usr/bin/env bash
export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH
R=/home/ubuntu/work/state/reviews/renewal-supersede-fix-runs
cd /home/ubuntu/work/wt-supersede/apps/web-app
{ echo "head $(git rev-parse HEAD)"; npx tsc --noEmit -p .; echo "tsc exit $?"; } > $R/final-tsc.log 2>&1
{ echo "head $(git rev-parse HEAD)"; node node_modules/jest/bin/jest.js src/app/trace src/lib/verify src/app/verify; echo "jest exit $?"; } > $R/final-web-jest.log 2>&1
$R/stack/run-visual.sh > $R/final-visual.log 2>&1; echo "visual exit $?" >> $R/final-visual.log
