#!/usr/bin/env bash
# Negative controls for `scripts/probes/ratchet.sh --selftest`, todo-counter cases F to Q.
# Each mutation changes ONE literal in a copy of the probe kept in a temp root (nothing is
# written inside the checkout), runs that copy's --selftest, and checks that exactly the
# expected cases go red. A case that stays green under the mutation it is meant to catch
# would pin nothing.
# Usage, from anywhere inside the checkout:  bash evidence/ratchet-counts-markers/negative-controls.sh
set -u
ROOT=$(git rev-parse --show-toplevel)
SRC="$ROOT/scripts/probes/ratchet.sh"
WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/scripts/probes"
cp "$ROOT/scripts/probes/_lib.sh" "$ROOT/scripts/probes/ssot-domains.txt" "$WORK/scripts/probes/"
MUT="$WORK/scripts/probes/ratchet.sh"
CONTENT=$(<"$SRC")
RE="TODO_RE='\\b((TODO|FIXME|HACK)s?|XXX)\\b'"
BAD=0

run() { # $1 label  $2 literal to replace  $3 replacement  $4 cases expected to go red
    case "$CONTENT" in *"$2"*) ;; *) echo "!! $1: literal to mutate not found: $2"; BAD=$((BAD + 1)); return;; esac
    printf '%s\n' "${CONTENT/"$2"/"$3"}" >"$MUT"
    local got
    got=$(PROBE_OUT_DIR="$WORK/out" bash "$MUT" --selftest 2>&1 | sed -n 's/^\*\*\* \([A-Z]\) FAILED.*/\1/p' | tr '\n' ' ' | sed 's/ $//')
    if [ "$got" = "$4" ]; then echo "OK   $1 -> red: ${got:-none}"; else echo "FAIL $1 -> red: ${got:-none} (expected: ${4:-none})"; BAD=$((BAD + 1)); fi
}

run "unmutated probe"                     "$RE" "$RE"                                         ""
echo
echo "the pattern"
run "M0 old pattern (bare substrings)"    "$RE" "TODO_RE='TODO|FIXME|HACK|XXX'"               "F G H I J K L M N O"
run "M1 blind counter (never matches)"    "$RE" "TODO_RE='a^b'"                               "G H I J N O P Q"
run "M2 drops XXX"                        "$RE" "TODO_RE='\\b((TODO|FIXME|HACK)s?)\\b'"       "J O"
run "M3 drops HACK"                       "$RE" "TODO_RE='\\b((TODO|FIXME)s?|XXX)\\b'"        "I O Q"
run "M4 drops FIXME"                      "$RE" "TODO_RE='\\b((TODO|HACK)s?|XXX)\\b'"         "H O Q"
run "M5 drops TODO"                       "$RE" "TODO_RE='\\b((FIXME|HACK)s?|XXX)\\b'"        "G N O P"
run "M6 left boundary only"               "$RE" "TODO_RE='\\b((TODO|FIXME|HACK)s?|XXX)'"      "F G H I J K L M N O"
run "M7 XXX only when no X touches it"    "$RE" "TODO_RE='\\b((TODO|FIXME|HACK)s?)\\b|(^|[^X])XXX([^X]|\$)'" "L"
run "M8 comment lines only"               "$RE" "TODO_RE='^[[:space:]]*(//|\\*|/\\*).*\\b((TODO|FIXME|HACK)s?|XXX)\\b'" "O"
echo
echo "the plural clause"
run "M16 no plural (whole words, round 1)" "$RE" "TODO_RE='\\b(TODO|FIXME|HACK|XXX)\\b'"         "P Q"
run "M17 no plural for TODO"              "$RE" "TODO_RE='\\b(TODO|(FIXME|HACK)s?|XXX)\\b'"   "P"
run "M18 no plural for FIXME"             "$RE" "TODO_RE='\\b(FIXME|(TODO|HACK)s?|XXX)\\b'"   "Q"
run "M19 no plural for HACK"              "$RE" "TODO_RE='\\b(HACK|(TODO|FIXME)s?|XXX)\\b'"   "Q"
run "M20 plural also with a capital S"    "$RE" "TODO_RE='\\b((TODO|FIXME|HACK)[sS]?|XXX)\\b'" "K"
echo
echo "the locale pin"
run "M9 no LC_ALL=C pin"                  'LC_ALL=C grep -rEn "$TODO_RE"' 'grep -rEn "$TODO_RE"' "N"
echo
echo "the scan scope and how matches are counted"
run "M10 scans services/ only"            '"${dirs[@]}" "$backend/shared" "$backend/config"' '"$backend/services"' "O"
run "M11 business dirs lose middleware"   ' "$BACKEND/middleware")'  ')'                      "O"
run "M12 loses shared/"                   ' "$backend/shared"'        ''                       "O"
run "M13 counts files, not lines (-l)"    '-rEn "$TODO_RE"'           '-rEl "$TODO_RE"'        "O Q"
run "M14 first match per file (-m1)"      '-rEn "$TODO_RE"'           '-rEn -m1 "$TODO_RE"'    "O Q"
run "M15 skips nested directories"        '-rEn "$TODO_RE"'           '-rEn --exclude-dir=nested "$TODO_RE"' "O"
echo
[ "$BAD" -eq 0 ] && { echo "negative controls: all as expected"; exit 0; }
echo "negative controls: $BAD unexpected result(s)"; exit 1
