#!/usr/bin/env bash
# evidence-complete — the work item's evidence pack has every required artifact.
# WORK_ITEM=<id> required; UI_ITEM=1 additionally requires trace/video/screenshots/crawler.
source "$(dirname "$0")/_lib.sh"
[ -z "${WORK_ITEM:-}" ] && pending "set WORK_ITEM=<id>"
DIR="$ROOT/evidence/$WORK_ITEM"
MISSING=""
for f in test-output.txt probe-results.json ratchet-before-after.txt; do
    [ -s "$DIR/$f" ] || MISSING="$MISSING $f"
done
if [ "${UI_ITEM:-0}" = "1" ]; then
    for d in trace video screenshots; do
        { [ -d "$DIR/$d" ] && [ -n "$(ls -A "$DIR/$d" 2>/dev/null)" ]; } || MISSING="$MISSING $d/"
    done
    [ -s "$DIR/crawler-report.json" ] || MISSING="$MISSING crawler-report.json"
fi
[ -z "$MISSING" ] && pass "pack complete: $DIR"
fail "missing in $DIR:$MISSING"
