#!/usr/bin/env bash
# usage: run-walk.sh <phase> [steps...] — runs inside the phase the held job has up ($R/phase names it).
set -uo pipefail
R=/home/ubuntu/work/state/reviews/a8-walk-fixes-1-runs
export PATH=/home/ubuntu/.nvm/versions/node/v24.21.0/bin:$PATH
read -r name tree < "$R/phase" || { echo "no phase up"; exit 2; }
[ "$name" = "$1" ] || { echo "phase up is $name, not $1"; exit 2; }
shift
# shellcheck disable=SC1091
source "$R/private/env.sh"
export DATABASE_URL="postgresql://postgres@127.0.0.1:5436/a8f1?schema=public"
cd "$tree/apps/backend" || exit 2
mkdir -p "$R/$name"
for s in "${@:-fixtures revision reviewerByApi reviewer inspect car}"; do
  for step in $s; do
    if [ "$step" = fixtures ]; then node "$R/bin/fixtures.js" "$name" 2>&1 | tail -3; else node "$R/bin/walk.js" "$name" "$step" 2>&1 | tail -15; fi
    echo "== $step exit ${PIPESTATUS[0]}"
  done
done
