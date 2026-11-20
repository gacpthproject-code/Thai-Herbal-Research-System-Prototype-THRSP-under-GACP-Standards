#!/usr/bin/env bash
# Trim a jest log to its header, failing test names, and the Tests:/Suites: counts.
# usage: summarize.sh <log> [<log>...]
for LOG in "$@"; do
  echo "## $LOG"
  head -1 "$LOG"
  grep -E "^(PASS|FAIL) " "$LOG" | sed 's/ ([0-9.]* s)//' | sort | uniq -c | awk '{print $2, $1}' | sort | tr '\n' ' '; echo
  grep -E "^\s+● " "$LOG" | grep -v "Console" | sed 's/^\s*//' | sort -u | head -60
  grep -E "^(Tests|Test Suites):" "$LOG"
  tail -1 "$LOG"
  echo
done
