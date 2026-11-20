#!/usr/bin/env bash
# One heavy slot at the final head, in order: the reachability spec on RED_ROOT (an export of the test commit,
# when set) and on the worktree (GREEN), the real-stack
# screenshots, the security reviewer's probes P1-P8, then web jest and tsc. The screenshots use their own
# database (gacp_r6_shots); the probes use the suite database. Run under ~/work/state/heavy.sh.
set -uo pipefail
wt=/home/ubuntu/work/wt-dispatcher
state=/tmp/dispatcher-r6
head=$(git -C "$wt" rev-parse --short=9 HEAD)
log() { echo "[final-job] $(date -u +%FT%TZ) $*" >> "$state/final-job.progress"; }

log "start head=$head dirty=$(git -C "$wt" status --porcelain -- apps packages | wc -l)"
[ -n "${RED_ROOT:-}" ] && { bash "$state/scripts/pw-run.sh" "red-$(cat "$RED_ROOT/.export-sha")" "$RED_ROOT" > "$state/pw-red2.log" 2>&1; log "red spec on $RED_ROOT $(tail -1 "$state/pw/red-$(cat "$RED_ROOT/.export-sha")/playwright.txt")"; }
[ "${SKIP_GREEN:-}" = 1 ] || { bash "$state/scripts/pw-run.sh" "green-$head" > "$state/pw-green.log" 2>&1; log "green spec $(tail -1 "$state/pw/green-$head/playwright.txt")"; }
[ "${SKIP_SHOTS:-}" = 1 ] || { bash "$state/scripts/shot-run.sh" "$wt/evidence/dispatcher-r6/screens-$head" > "$state/shots-run.log" 2>&1; log "screens exit=$?"; }
[ "${SKIP_PROBES:-}" = 1 ] || { bash /tmp/dispatcher-r5/probe-run.sh "$head" "$state/probes-at-$head" > "$state/probes-run.log" 2>&1; log "probes exit=$?"; }
[ "${SKIP_WEB:-}" = 1 ] || { bash "$state/scripts/web-full.sh"; log "web $(tail -1 "$state/suites/web-jest.log") $(tail -1 "$state/suites/web-tsc.log")"; }
git -C "$wt" checkout -- evidence/payer-block 2>/dev/null
log "end"
