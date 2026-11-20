#!/usr/bin/env bash
# compare a local-gate run against the B1 baseline. Criterion: NO NEW FAILURES.
# NOTE: jest colours its summary when it thinks it has a TTY, so every extractor
# strips ANSI first — a colour code must never be able to hide a failure.
set -u
BASE="${1:?baseline}"; NEW="${2:?new run}"
S="$(mktemp -d)"

decolor() { sed -r 's/\x1b\[[0-9;]*[mGKHF]//g' "$1"; }
ext_suites() { decolor "$1" | grep -oE 'FAIL +__tests__[^ ]+' | tr -s ' ' | sort -u; }
ext_tests() { decolor "$1" | grep -oE '● .*' | sed 's/[[:space:]]*$//' | sort -u; }
ext_probes() { decolor "$1" | grep -E '^  ✗ [a-z0-9-]+: FAIL' | sed 's/[[:space:]]*$//' | sort -u; }
ext_steps()  { decolor "$1" | grep -E '^\[local-gate\] [a-z-]+: (PASS|FAIL)' | sort -u; }
ext_tot()    { decolor "$1" | grep -E '^(Test Suites|Tests):' | tr -s ' '; }

rc=0
for k in probes suites tests; do
  ext_$k "$BASE" > "$S/base.$k"; ext_$k "$NEW" > "$S/new.$k"
  echo "===== $k ====="
  echo "-- baseline: $(wc -l < "$S/base.$k")  new: $(wc -l < "$S/new.$k")"
  newfail=$(comm -13 "$S/base.$k" "$S/new.$k")
  fixed=$(comm -23 "$S/base.$k" "$S/new.$k")
  if [ -n "$newfail" ]; then echo "!! NEW FAILURES (regressions):"; echo "$newfail"; rc=1; else echo "OK — no new $k failures"; fi
  [ -n "$fixed" ] && { echo ".. fixed since baseline:"; echo "$fixed"; }
  echo ""
done

# A run whose jest summary we could not parse is NOT a pass.
if [ -z "$(ext_tot "$NEW")" ]; then
  echo "!! could not parse a jest summary out of the new run — refusing to call this a pass"; rc=1
fi

echo "===== step verdicts (new run) ====="; ext_steps "$NEW"
echo ""; echo "===== totals ====="
echo "baseline: $(ext_tot "$BASE" | tr '\n' ' ')"
echo "new     : $(ext_tot "$NEW" | tr '\n' ' ')"
echo ""
if [ "$rc" -eq 0 ]; then echo "VERDICT: NO NEW FAILURES vs baseline"; else echo "VERDICT: REGRESSION / UNVERIFIABLE — see above"; fi
rm -rf "$S"; exit "$rc"
