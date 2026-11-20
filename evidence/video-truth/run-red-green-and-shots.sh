#!/usr/bin/env bash
# One heavy-lock turn, three artifacts, each a raw jest log that ends with jest's own exit code:
#   jest-red-on-base-copy.txt   the suite at this tree against the landing/help copy of base
#                               e4da286fe (written over the two files, then put back; no stash)
#   jest-green.txt              the suite at this tree
#   shots.txt + *.png           the branch web app alone on a loopback port (no backend: the
#                               validity line prints its own "unavailable" copy)
# usage: ~/work/state/heavy.sh bash evidence/video-truth/run-red-green-and-shots.sh <port>
set -uo pipefail
PORT=${1:?port}
BASE=e4da286fe
WT=/home/ubuntu/work/wt-videotruth
OUT=$WT/evidence/video-truth
TEST=src/__tests__/truthful-copy/applicant-types-are-the-four-holder-types.test.tsx
COPY_FILES=("apps/web-app/src/app/(marketing)/page.tsx" "apps/web-app/src/components/help/faq-data.ts")
KEEP=$(mktemp -d)
cd "$WT"

for f in "${COPY_FILES[@]}"; do
  mkdir -p "$KEEP/$(dirname "$f")"
  cp "$f" "$KEEP/$f"
  git show "$BASE:$f" > "$f"
done
(cd apps/web-app && node node_modules/jest/bin/jest.js "$TEST" > "$OUT/jest-red-on-base-copy.txt" 2>&1; echo "jest exit $?" >> "$OUT/jest-red-on-base-copy.txt")
for f in "${COPY_FILES[@]}"; do cp "$KEEP/$f" "$f"; done
rm -rf "$KEEP"
echo "restored copy files: $(git status --porcelain -- "${COPY_FILES[@]}" | wc -l) dirty (0 expected)"

cd "$WT/apps/web-app"
node node_modules/jest/bin/jest.js "$TEST" > "$OUT/jest-green.txt" 2>&1
echo "jest exit $?" >> "$OUT/jest-green.txt"

DEVLOG=/tmp/video-truth-next-dev-$PORT.log
INTERNAL_API_URL=http://127.0.0.1:9 node node_modules/next/dist/bin/next dev -H 127.0.0.1 -p "$PORT" > "$DEVLOG" 2>&1 &
DEV=$!
for _ in $(seq 1 90); do
  curl -s -o /dev/null "http://127.0.0.1:$PORT/" && break
  sleep 2
done
curl -s -o /dev/null -w "warm GET / -> %{http_code}\n" "http://127.0.0.1:$PORT/" | tee "$OUT/shots.txt"
node "$OUT/faq-shots.mjs" "http://127.0.0.1:$PORT" "$OUT" >> "$OUT/shots.txt" 2>&1
echo "shots exit $?" >> "$OUT/shots.txt"
kill "$DEV" 2>/dev/null; wait "$DEV" 2>/dev/null
pkill -f "next dev -H 127.0.0.1 -p $PORT" 2>/dev/null
grep -E 'Tests:|jest exit|✓|✕' "$OUT/jest-red-on-base-copy.txt" "$OUT/jest-green.txt"; cat "$OUT/shots.txt"
