#!/usr/bin/env bash
# Runs playwright/dispatcher-dialogs-reachable.spec.ts against `next dev` of the worktree's web app.
# Run under ~/work/state/heavy.sh. Leaves no server running.
# usage: pw-run.sh <label> [repo-root]   (repo-root defaults to the worktree; an export of a commit works too)
set -uo pipefail
label="$1"
root="${2:-/home/ubuntu/work/wt-dispatcher}"
web="$root/apps/web-app"
out=/tmp/dispatcher-r6/pw/$label
port=3761
rm -rf "$out"; mkdir -p "$out"
export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH
export NODE_OPTIONS=--max-old-space-size=2048 NEXT_TELEMETRY_DISABLED=1
export BACKEND_URL=http://127.0.0.1:9 INTERNAL_API_URL=http://127.0.0.1:9

cleanup() {
  [ -n "${web_pid:-}" ] && kill "$web_pid" 2>/dev/null
  sleep 2
  pkill -f "next dev -p $port" 2>/dev/null
}
trap cleanup EXIT

echo "root=$root sha=$(cat "$root/.export-sha" 2>/dev/null || git -C "$web" rev-parse --short=9 HEAD) dirty=$(git -C "$web" status --porcelain -- . 2>/dev/null | wc -l) started=$(date -u +%FT%TZ)" > "$out/meta.txt"
(cd "$web" && exec node node_modules/next/dist/bin/next dev -p $port -H 127.0.0.1) > "$out/next.log" 2>&1 &
web_pid=$!
for i in $(seq 1 120); do curl -fsS -o /dev/null "http://127.0.0.1:$port/" && break; sleep 3; done

# Compile each page once before the spec, with a dispatcher cookie so the middleware lets the request through.
token=$(node -e 'const b=(o)=>Buffer.from(JSON.stringify(o)).toString("base64");const n=Math.floor(Date.now()/1000);console.log(b({alg:"HS256",typ:"JWT"})+"."+b({sub:"warm",role:"dispatcher",canonicalRole:"dispatcher",iat:n,exp:n+3600})+".warm")')
for route in /provider/calendar /provider/scheduler/queue /provider/coordinator /provider/scheduler/reassign /provider/scheduler/reviewer-reassign; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 600 -b "provider_token=$token" "http://127.0.0.1:$port$route")
  echo "warm $route $code" >> "$out/meta.txt"
done

cd "$web" && E2E_BASE_URL="http://127.0.0.1:$port" node node_modules/@playwright/test/cli.js test \
  playwright/dispatcher-dialogs-reachable.spec.ts --project=chromium --no-deps --reporter=list --workers=1 \
  --output="$out/results" > "$out/playwright.txt" 2>&1
echo "exit=$?" >> "$out/playwright.txt"
echo "ended=$(date -u +%FT%TZ)" >> "$out/meta.txt"
