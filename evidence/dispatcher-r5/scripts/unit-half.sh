#!/usr/bin/env bash
# The backend unit half alone (everything but integration), round 5, after the reassign mock fix.
cd /home/ubuntu/work/wt-dispatcher/apps/backend || exit 2
export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH
export TEST_DATABASE_URL="$(cat /tmp/dispatcher-r5/db-url)"
export DATABASE_URL="$TEST_DATABASE_URL"
export SIGNING_KEY_DIR=/tmp/dispatcher-r5/signing-keys
export RSA_PRIVATE_KEY_PASSPHRASE="$(cat /tmp/dispatcher-r5/signing-passphrase)"
export NODE_OPTIONS=--max-old-space-size=3072
echo "sha=$(git rev-parse --short=9 HEAD) dirty=$(git status --porcelain -- . | grep -v '^??' | wc -l)" > /tmp/dispatcher-r5/unit2.meta
node node_modules/jest/bin/jest.js --config jest.config.cjs --maxWorkers=2 --ci --silent \
  --testPathIgnorePatterns /node_modules/ /.next/ /dist/ /build/ /__tests__/integration/ \
  --json --outputFile=/tmp/dispatcher-r5/half-unit2.json > /tmp/dispatcher-r5/half-unit2.log 2>&1
echo "exit=$?" >> /tmp/dispatcher-r5/half-unit2.log
git -C /home/ubuntu/work/wt-dispatcher checkout -- evidence/payer-block
