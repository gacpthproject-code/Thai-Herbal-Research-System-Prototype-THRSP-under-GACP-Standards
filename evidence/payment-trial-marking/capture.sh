#!/usr/bin/env bash
set -uo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
OUT="$ROOT/evidence/payment-trial-marking"
mkdir -p "$OUT/papers"
cd "$ROOT/apps/backend" && DATABASE_URL=postgresql://render-papers@127.0.0.1:1/none node "$OUT/render-papers.js" "$OUT/papers" > "$OUT/papers/render.log" 2>&1 || echo "render-papers failed" >> "$OUT/papers/render.log"
cd "$ROOT/apps/web-app"
NEXT_PUBLIC_PWA_ENABLED=false NEXT_PUBLIC_CHECKOUT_UI_ENABLED=true npx next dev -H 127.0.0.1 -p 3127 > /tmp/trialmark-next.log 2>&1 &
NEXT_PID=$!
trap 'kill $NEXT_PID 2>/dev/null; pkill -f "next dev -H 127.0.0.1 -p 3127" 2>/dev/null' EXIT
for _ in $(seq 1 120); do curl -s -o /dev/null http://127.0.0.1:3127/ && break; sleep 2; done
node "$OUT/viewpack.js" "$OUT/screens"
