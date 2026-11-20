#!/usr/bin/env bash
# a5-accuracy — KPI A5: the standards analyzer agrees with the labelled answer key on >= 95% of
# (case, standard, topic) cells. The key lives in apps/backend/data/standards/a5-answer-key/ and is
# labelled "ยังไม่ผ่านผู้เชี่ยวชาญ" until an expert reviews it; this probe reports that status with the number.
#
# Static: runs the analyzer's pure verdict function in-process, no database, network or keys.
# PASS (0) >= 95% · FAIL (1) below · BLOCKED (2) the answer key is incomplete or the run broke.
# Usage:  bash scripts/probes/a5-accuracy.sh
source "$(dirname "$0")/_lib.sh"

command -v node >/dev/null 2>&1 || blocked "node not found"
if [ -n "${PROBE_OUT_DIR:-}" ]; then OUT="$PROBE_OUT_DIR/a5/a5-accuracy.json"; else OUT="$(mktemp -d)/a5-accuracy.json"; fi
LOG="$(node "$BACKEND/scripts/standards/measure-a5.js" --out "$OUT" 2>&1)"; code=$?
printf '%s\n' "$LOG" | sed -n '1,5p'
SUMMARY="$(printf '%s\n' "$LOG" | grep -m1 '^overall:')"
case "$code" in
    0) pass "A5 $SUMMARY (key: ยังไม่ผ่านผู้เชี่ยวชาญ) · $OUT" ;;
    1) fail "A5 below target: $SUMMARY (key: ยังไม่ผ่านผู้เชี่ยวชาญ) · disagreements in $OUT" ;;
    *) printf '%s\n' "$LOG" | tail -20; blocked "measure-a5.js exited $code — answer key incomplete or the run broke" ;;
esac
