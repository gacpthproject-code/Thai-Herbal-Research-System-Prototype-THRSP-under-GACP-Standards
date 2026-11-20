#!/usr/bin/env bash
# Rerun the round-4 security reviewer's probes (P1-P8) against the code of <commit>, exported to a
# private snapshot, on the round-5 scratch Postgres. usage: probe-run.sh <commit> <outdir>
set -uo pipefail
wt=/home/ubuntu/work/wt-dispatcher
commit=$(git -C "$wt" rev-parse --short=9 "$1"); outdir="$2"
tree=/tmp/dispatcher-r5/probe-tree
rm -rf "$tree"; mkdir -m 700 -p "$tree" "$outdir"
git -C "$wt" archive "$commit" apps/backend packages | tar -x -C "$tree"
ln -s "$wt/apps/backend/node_modules" "$tree/apps/backend/node_modules"
ln -s "$wt/node_modules" "$tree/node_modules"
cp /tmp/dispatcher-r5/probes/*.test.js "$tree/apps/backend/__tests__/integration/"
cd "$tree/apps/backend"
export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH
export TEST_DATABASE_URL="$(cat /tmp/dispatcher-r5/db-url)"
export DATABASE_URL="$TEST_DATABASE_URL"
export SIGNING_KEY_DIR=/tmp/dispatcher-r5/signing-keys
export RSA_PRIVATE_KEY_PASSPHRASE="$(cat /tmp/dispatcher-r5/signing-passphrase)"
export NODE_OPTIONS=--max-old-space-size=3072
J="node node_modules/jest/bin/jest.js --config jest.config.cjs"
PROBE_ORG_SCOPE=false $J __tests__/integration/sec-r4-contact-probes.test.js > "$outdir/contact-scope-false.txt" 2>&1; echo "exit=$?" >> "$outdir/contact-scope-false.txt"
PROBE_ORG_SCOPE=true $J __tests__/integration/sec-r4-contact-probes.test.js > "$outdir/contact-scope-true.txt" 2>&1; echo "exit=$?" >> "$outdir/contact-scope-true.txt"
$J __tests__/integration/sec-r4-lock-order-probe.test.js > "$outdir/lock-order.txt" 2>&1; echo "exit=$?" >> "$outdir/lock-order.txt"
node /tmp/dispatcher-r5/probes/p7-car-window.js "$tree/apps/backend" > "$outdir/p7-car-window.txt" 2>&1; echo "exit=$?" >> "$outdir/p7-car-window.txt"
echo "commit=$commit" > "$outdir/meta.txt"
grep -h "^PROBE\|^exit=\|✓\|✕" "$outdir"/*.txt
