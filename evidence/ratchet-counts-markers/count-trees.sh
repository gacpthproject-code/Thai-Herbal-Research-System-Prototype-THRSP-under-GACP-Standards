#!/usr/bin/env bash
# Counts the ratchet `todo` marker on any number of commits or directories with three patterns,
# and checks which lines each pattern keeps. The count comes from the probe's own count_todo:
# a copy of scripts/probes/ratchet.sh with only the TODO_RE line replaced runs inside a temp root,
# and a direct grep over the same scope must agree with it.
# Nothing is written inside the checkout or inside a directory you pass: a commit is unpacked with
# `git archive`, a directory is reached through a symlink and only read.
# Usage, from anywhere inside the checkout:  bash evidence/ratchet-counts-markers/count-trees.sh <commit|dir>...
set -u
ROOT=$(git rev-parse --show-toplevel)
PROBE="$ROOT/scripts/probes/ratchet.sh"
WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT
CUR=$(sed -n "s/^TODO_RE='\(.*\)'\$/\1/p" "$PROBE")
OLD='TODO|FIXME|HACK|XXX'
R1='\b(TODO|FIXME|HACK|XXX)\b'
CONTENT=$(<"$PROBE")
BAD=0

probe_todo() { # $1 temp root  $2 pattern  -> the todo count the probe itself reports
    printf '%s\n' "${CONTENT/"TODO_RE='$CUR'"/"TODO_RE='$2'"}" >"$1/scripts/probes/ratchet.sh"
    PROBE_OUT_DIR="$1/out" bash "$1/scripts/probes/ratchet.sh" >/dev/null 2>&1
    sed -n 's/^todo: //p' "$1/out/ratchet-current.txt"
}
hits() { # $1 root  $2 pattern  -> every matching line, same scope and locale as count_todo
    ( cd "$1/apps/backend" && LC_ALL=C grep -rEn "$2" services routes jobs middleware shared config \
        --include='*.js' 2>/dev/null | LC_ALL=C sort )
}
agree() { # $1 label  $2 probe count  $3 file of hits
    [ "$(wc -l <"$3")" = "$2" ] || { echo "!! $1: probe counts $2, direct grep finds $(wc -l <"$3")"; BAD=$((BAD + 1)); }
}

printf '%-34s %6s %6s %7s  %-10s %9s %12s\n' tree old round1 current same-lines old-only current-only
for arg in "$@"; do
    t="$WORK/$(echo "$arg" | tr -c 'A-Za-z0-9\n' _)"; mkdir -p "$t/scripts/probes"
    if sha=$(git -C "$ROOT" rev-parse --verify --quiet "$arg^{commit}"); then
        git -C "$ROOT" archive "$sha" scripts/probes apps/backend | tar -x -C "$t"; label="${sha:0:9}"
    elif [ -d "$arg/apps/backend" ]; then
        cp "$ROOT"/scripts/probes/_lib.sh "$ROOT"/scripts/probes/hardcode-patterns.txt \
           "$ROOT"/scripts/probes/ssot-domains.txt "$t/scripts/probes/"
        ln -s "$(cd "$arg" && pwd)/apps" "$t/apps"; label="dir $(basename "$arg")"
    else echo "!! $arg: neither a commit nor a checkout"; BAD=$((BAD + 1)); continue; fi
    [ -d "$t/apps/backend/services" ] || { echo "!! $arg: apps/backend/services not found, nothing would be scanned"; BAD=$((BAD + 1)); continue; }
    n_old=$(probe_todo "$t" "$OLD"); n_r1=$(probe_todo "$t" "$R1"); n_cur=$(probe_todo "$t" "$CUR")
    hits "$t" "$OLD" >"$t/h-old"; hits "$t" "$R1" >"$t/h-r1"; hits "$t" "$CUR" >"$t/h-cur"
    agree "$label old" "$n_old" "$t/h-old"; agree "$label round1" "$n_r1" "$t/h-r1"; agree "$label current" "$n_cur" "$t/h-cur"
    same=no; cmp -s "$t/h-r1" "$t/h-cur" && same=yes
    old_only=$(LC_ALL=C comm -23 "$t/h-old" "$t/h-cur" | wc -l); cur_only=$(LC_ALL=C comm -13 "$t/h-old" "$t/h-cur" | wc -l)
    printf '%-34s %6s %6s %7s  %-10s %9s %12s\n' "$label" "$n_old" "$n_r1" "$n_cur" "$same" "$old_only" "$cur_only"
done
echo
echo "old     = $OLD   (before order 68(2))"
echo "round1  = $R1   (whole words, no plural)"
echo "current = $CUR   (the TODO_RE line of scripts/probes/ratchet.sh)"
echo "same-lines   = the current pattern keeps exactly the lines the round-1 pattern kept"
echo "old-only     = lines the bare-substring pattern counts and the current one does not"
echo "current-only = lines the current pattern counts and the bare-substring one does not (must be 0)"
[ "$BAD" -eq 0 ]
