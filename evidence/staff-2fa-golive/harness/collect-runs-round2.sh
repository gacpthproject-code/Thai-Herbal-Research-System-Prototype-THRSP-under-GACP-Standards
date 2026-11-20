#!/usr/bin/env bash
# Copy the round-2 heavy job's outputs into the evidence tree: the valid run under runs/, the two voided
# runs' summaries under runs-void-1/ and runs-void-2/. Stack frames are dropped, every 13-digit run is
# masked (the seed's scratch sign-in number in order 10's shape, log ids' epoch milliseconds by name), and
# each file is scanned with gitleaks on its own (order 82). Any finding or any surviving 13-digit run
# refuses the whole copy.
set -euo pipefail
J=/tmp/staff-2fa-golive/round2; W=/home/ubuntu/work/wt-2fa; E=$W/evidence/staff-2fa-golive/round2
grep -q "job end" "$J/logs/job.txt" || { echo "job not finished"; exit 1; }

copy() { # $1 source file, $2 destination file
  grep -vE '^\s+at |node_modules/' "$1" \
    | sed -E 's/^QA_ID=([0-9])[0-9]{8}([0-9]{4})$/QA_ID=\1-XXXX-XXXX-X-\2/; s/LOG-[0-9]{13}-/LOG-<epoch-ms>-/g' > "$2"
}
rm -rf "$E/runs" "$E/runs-void-1" "$E/runs-void-2"
mkdir -p "$E/runs" "$E/runs-void-1" "$E/runs-void-2"
for f in "$J"/logs/*; do copy "$f" "$E/runs/$(basename "$f")"; done
for f in job.txt heavy.out migrate.txt qa-script-flag-on.txt serve-flag-on.log; do copy "$J/logs-void-run-1/$f" "$E/runs-void-1/$f"; done
for f in job.txt heavy.out migrate.txt; do copy "$J/logs-void-run-2/$f" "$E/runs-void-2/$f"; done

bad=0
for f in "$E"/runs/* "$E"/runs-void-1/* "$E"/runs-void-2/*; do
  if grep -qE '(^|[^0-9])[0-9]{13}([^0-9]|$)' "$f"; then echo "$(basename "$f"): a 13-digit run survived"; bad=1; fi
  r=$(gitleaks detect --no-git --no-banner --no-color --redact --source "$f" 2>&1 | grep -E "leaks found|no leaks" | tail -1)
  echo "$f: $r"
  case "$r" in *"no leaks"*) ;; *) bad=1;; esac
done
[ "$bad" = 0 ] || { echo "refused: see the lines above"; rm -rf "$E/runs" "$E/runs-void-1" "$E/runs-void-2"; exit 2; }
echo "collected $(find "$E/runs" "$E/runs-void-1" "$E/runs-void-2" -type f | wc -l) files"
