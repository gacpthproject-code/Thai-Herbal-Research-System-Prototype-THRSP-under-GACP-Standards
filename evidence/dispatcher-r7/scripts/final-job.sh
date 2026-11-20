#!/usr/bin/env bash
# Round 7 checks at the worktree's committed head, one heavy slot: targeted backend tests (every test file
# that loads a backend file this round touched) on the round-7 scratch database, the security reviewer's
# probes P1-P8, the round-7 screens, then web jest (whole) and web tsc. Run under ~/work/state/heavy.sh.
set -uo pipefail
wt=/home/ubuntu/work/wt-dispatcher
state=/tmp/dispatcher-r7
head=$(git -C "$wt" rev-parse --short=9 HEAD)
out=$state/final/$head
mkdir -p "$out"
log() { echo "[final] $(date -u +%FT%TZ) $*" >> "$state/final.progress"; }
log "start head=$head dirty=$(git -C "$wt" status --porcelain -- apps packages | wc -l)"

if [ "${SKIP_BACKEND:-}" != 1 ]; then
  ( cd "$wt/apps/backend" && . "$state/scripts/backend-env.sh" \
    && node node_modules/jest/bin/jest.js --config jest.config.cjs --maxWorkers=2 --ci $(cat "$state/targeted-backend.txt") \
       --json --outputFile="$out/backend-targeted.json" > "$out/backend-targeted.log" 2>&1; echo "exit=$?" >> "$out/backend-targeted.log" )
  git -C "$wt" checkout -- evidence/payer-block 2>/dev/null
  log "backend targeted $(grep -E '^Tests:' "$out/backend-targeted.log") $(tail -1 "$out/backend-targeted.log")"
fi
if [ "${SKIP_PROBES:-}" != 1 ]; then
  PAYMENT_ADAPTER=mock bash /tmp/dispatcher-r5/probe-run.sh "$head" "$out/probes" > "$out/probes-run.log" 2>&1
  log "probes exit=$?"
fi
if [ "${SKIP_SHOTS:-}" != 1 ]; then
  bash "$state/scripts/shots-run.sh" "$head" "$out/screens" > "$out/shots-run.log" 2>&1
  log "screens $(tail -1 "$out/screens/playwright.txt" 2>/dev/null) $(grep -E 'passed|failed' "$out/screens/playwright.txt" | tail -2 | tr '\n' ' ')"
fi
if [ "${SKIP_WEB:-}" != 1 ]; then
  ( cd "$wt/apps/web-app" && export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH NODE_OPTIONS=--max-old-space-size=3072 \
    && node node_modules/jest/bin/jest.js --maxWorkers=2 --ci --silent --json --outputFile="$out/web-jest.json" > "$out/web-jest.log" 2>&1; echo "jest-exit=$?" >> "$out/web-jest.log"
    node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json > "$out/web-tsc.log" 2>&1; echo "tsc-exit=$?" >> "$out/web-tsc.log" )
  log "web $(tail -1 "$out/web-jest.log") $(tail -1 "$out/web-tsc.log")"
fi
git -C "$wt" checkout -- evidence/payer-block 2>/dev/null
log "end head=$head dirty=$(git -C "$wt" status --porcelain -- apps packages | wc -l)"
