#!/usr/bin/env bash
# One heavy slot for the round-5 finish, in order: web jest and tsc at HEAD; the success-slot autosave defect
# reproduced in a browser on e2d5c1645 (hydration fixed, autosave not yet paused); the full screenshot run at
# HEAD; the security reviewer's probes P1-P8 at HEAD. Every step uses the scratch database in turn, never two
# at once. Run under ~/work/state/heavy.sh.
set -uo pipefail
wt=/home/ubuntu/work/wt-dispatcher
state=/tmp/dispatcher-r5
fin=$state/finish
export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH
head=$(git -C "$wt" rev-parse --short=9 HEAD)
log() { echo "[final-job] $(date -Is) $*" >> "$fin/final-job.progress"; }

log "start head=$head dirty=$(git -C "$wt" status --porcelain -- apps packages | wc -l)"
(cd "$wt/apps/web-app" && NODE_OPTIONS=--max-old-space-size=3072 node node_modules/jest/bin/jest.js --maxWorkers=2 --ci --silent \
  --json --outputFile="$fin/web-full3.json" > "$fin/web-full3.log" 2>&1; echo "jest-exit=$?" >> "$fin/web-full3.log")
(cd "$wt/apps/web-app" && NODE_OPTIONS=--max-old-space-size=3072 node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json \
  > "$fin/tsc3.log" 2>&1; echo "tsc-exit=$?" >> "$fin/tsc3.log")
log "web $(tail -1 "$fin/web-full3.log") $(tail -1 "$fin/tsc3.log")"

exp=$state/web-e2d5c1645
rm -rf "$exp"; mkdir -m 700 -p "$exp"
git -C "$wt" archive e2d5c1645 apps/web-app packages | tar -x -C "$exp"
ln -s "$wt/apps/web-app/node_modules" "$exp/apps/web-app/node_modules"
ln -s "$wt/node_modules" "$exp/node_modules"
rm -rf "$fin/flip-shots"
ONLY=success WEB_DIR="$exp/apps/web-app" OUT="$fin/flip-shots" SHOT_META="$fin/flip.meta" SHOT_SHA=e2d5c1645 DIAG_TAG=e2d5c1645 \
  bash "$fin/shot-run2.sh" > "$fin/flip-run.log" 2>&1
log "flip repro at e2d5c1645 exit=$?"

SHOT_SUCCESS_TRACE=1 DIAG_TAG="$head" bash "$fin/shot-run2.sh" > "$fin/final-shots.log" 2>&1
log "final shots at $head exit=$?"

if [ -s "$state/probes-at-$head/meta.txt" ]; then log "probes at $head already taken"; else
  bash "$state/probe-run.sh" "$head" "$state/probes-at-$head" > "$fin/probes-run.log" 2>&1
  log "probes at $head exit=$?"
fi
git -C "$wt" checkout -- evidence/payer-block 2>/dev/null
log "end"
