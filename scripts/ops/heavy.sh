#!/usr/bin/env bash
# heavy.sh — one heavy job at a time on this machine (full suites, tsc, playwright, dev server, gate).
# Replaces ~/work/state/heavy.sh, which lived outside the repo and was lost with the old machine
# (order 164(1)). Behaviour kept from what the repo documents about the old one:
#   - the lock is an flock held on fd 9 for the life of the command;
#   - GACP_HEAVY_HELD=1 is exported to the command, so a nested wrapper (scripts/walk/deploy-walk.sh)
#     runs directly instead of waiting on the lock its own parent holds (the patch at
#     docs/operations/runbooks/deploy-walk.md "heavy.sh.patch", applied here);
#   - waits for the lock up to HEAVY_WAIT seconds (default 3h), then exits 75 (EX_TEMPFAIL).
# Usage: scripts/ops/heavy.sh <command> [args...]      e.g. scripts/ops/heavy.sh timeout 7200 bash scripts/ci/full-gate.sh
#        scripts/ops/heavy.sh --status                  who holds the lock (exit 0 free, 1 held)
#        scripts/ops/heavy.sh --selftest
set -uo pipefail

LOCK="${HEAVY_LOCK:-${XDG_RUNTIME_DIR:-/tmp}/gacp-heavy.lock}"
WAIT="${HEAVY_WAIT:-10800}"

selftest() {
  local d; d="$(mktemp -d)"; trap 'rm -rf "$d"' RETURN
  local me="${BASH_SOURCE[0]}" fails=0
  # 1. runs the command and passes its exit code through
  HEAVY_LOCK="$d/l" bash "$me" bash -c 'exit 7'; [ $? -eq 7 ] || { echo "FAIL exit passthrough"; fails=$((fails+1)); }
  # 2. exports GACP_HEAVY_HELD=1 to the command
  out="$(HEAVY_LOCK="$d/l" bash "$me" bash -c 'echo "$GACP_HEAVY_HELD"')"
  [ "$out" = 1 ] || { echo "FAIL GACP_HEAVY_HELD not exported ($out)"; fails=$((fails+1)); }
  # 3. a second job waits; with HEAVY_WAIT=1 it gives up with 75
  HEAVY_LOCK="$d/l" bash "$me" sleep 3 & local bg=$!; sleep 0.5
  HEAVY_LOCK="$d/l" HEAVY_WAIT=1 bash "$me" true; local c=$?
  [ $c -eq 75 ] || { echo "FAIL contended lock gave $c, want 75"; fails=$((fails+1)); }
  # 4. --status reports held while the first job runs, free after
  HEAVY_LOCK="$d/l" bash "$me" --status >/dev/null; [ $? -eq 1 ] || { echo "FAIL --status while held"; fails=$((fails+1)); }
  wait "$bg"
  HEAVY_LOCK="$d/l" bash "$me" --status >/dev/null; [ $? -eq 0 ] || { echo "FAIL --status when free"; fails=$((fails+1)); }
  # 5. no command = usage error 2
  HEAVY_LOCK="$d/l" bash "$me" >/dev/null 2>&1; [ $? -eq 2 ] || { echo "FAIL no-arg exit"; fails=$((fails+1)); }
  [ $fails -eq 0 ] && echo "heavy.sh selftest: PASS (5 cases)" || { echo "heavy.sh selftest: FAIL ($fails)"; return 1; }
}

case "${1:-}" in
  --selftest) selftest; exit $? ;;
  --status)
    exec 9>>"$LOCK"
    if flock -n 9; then echo "free ($LOCK)"; exit 0; fi
    echo "held ($LOCK): $(cat "$LOCK.owner" 2>/dev/null || echo unknown)"; exit 1 ;;
  ""|-h|--help) sed -n 2,13p "${BASH_SOURCE[0]}" >&2; exit 2 ;;
esac

if [ -n "${GACP_HEAVY_HELD:-}" ]; then exec "$@"; fi   # parent already holds the lock

exec 9>>"$LOCK"
if ! flock -w "$WAIT" 9; then
  echo "heavy.sh: lock busy for ${WAIT}s (held by: $(cat "$LOCK.owner" 2>/dev/null || echo unknown))" >&2
  exit 75
fi
printf '%s pid=%s %s\n' "$(date -Is)" "$$" "$*" > "$LOCK.owner"
export GACP_HEAVY_HELD=1
"$@"
rc=$?
: > "$LOCK.owner"
exit $rc
