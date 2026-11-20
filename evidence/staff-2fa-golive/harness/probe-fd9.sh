#!/usr/bin/env bash
# Proves the serve() line of job-round2.sh without a database: the child that $! names is the exec'd
# command itself, it does not inherit the heavy.sh lock fd, and SIGTERM ends it. The command is `sleep`
# as a stand-in for `node serve-doors.js`; fd inheritance is a property of the shell line, not the program.
set -uo pipefail
LOCK=${1:-/tmp/staff-2fa-golive/round2/fd9-probe.lock}
exec 9>"$LOCK"
echo "this shell holds fd 9 -> $(readlink /proc/$$/fd/9)"

( exec env PROBE=1 sleep 30 9>&- ) &
SRV=$!
sleep 0.3
echo "serve() line: pid=$SRV comm=$(ps -o comm= -p "$SRV") fd9=$(readlink /proc/"$SRV"/fd/9 2>/dev/null || echo closed)"

( exec env PROBE=1 sleep 30 ) &
CTL=$!
sleep 0.3
echo "control without 9>&-: pid=$CTL comm=$(ps -o comm= -p "$CTL") fd9=$(readlink /proc/"$CTL"/fd/9 2>/dev/null || echo closed)"

kill -TERM "$SRV" "$CTL"
wait "$SRV" "$CTL" 2>/dev/null
echo "after SIGTERM: serve pid $( kill -0 "$SRV" 2>/dev/null && echo alive || echo gone ) control pid $( kill -0 "$CTL" 2>/dev/null && echo alive || echo gone )"
exec 9>&-
rm -f "$LOCK"
