#!/usr/bin/env bash
# The round-7 screens (I-1 card states, I-8 picker) from an export of <commit>, against `next dev` of that
# export, at 1440x900 and 390x844. Leaves no server running. usage: shots-run.sh <commit> <outdir>
set -uo pipefail
state=/tmp/dispatcher-r7
root=$state/export-shots
out="$2"; port=3771
bash $state/scripts/export-web.sh "$1" "$root" > /dev/null || exit 2
cp $state/scripts/r7-shots.spec.ts "$root/apps/web-app/playwright/r7-shots.spec.ts"
web=$root/apps/web-app
mkdir -p "$out"
export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH
export NODE_OPTIONS=--max-old-space-size=2048 NEXT_TELEMETRY_DISABLED=1
export BACKEND_URL=http://127.0.0.1:9 INTERNAL_API_URL=http://127.0.0.1:9
cleanup() { [ -n "${web_pid:-}" ] && kill "$web_pid" 2>/dev/null; sleep 2; pkill -f "next dev -p $port" 2>/dev/null; }
trap cleanup EXIT
echo "sha=$(cat $root/.export-sha) started=$(date -u +%FT%TZ)" > "$out/meta.txt"
(cd "$web" && exec node node_modules/next/dist/bin/next dev -p $port -H 127.0.0.1) > "$out/next.log" 2>&1 &
web_pid=$!
for i in $(seq 1 120); do curl -fsS -o /dev/null "http://127.0.0.1:$port/" && break; sleep 3; done
token=$(node -e 'const b=(o)=>Buffer.from(JSON.stringify(o)).toString("base64");const n=Math.floor(Date.now()/1000);console.log(b({alg:"HS256",typ:"JWT"})+"."+b({sub:"warm",role:"dispatcher",canonicalRole:"dispatcher",iat:n,exp:n+3600})+".warm")')
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 600 -b "provider_token=$token" "http://127.0.0.1:$port/provider/calendar")
echo "warm /provider/calendar $code" >> "$out/meta.txt"
cd "$web" && E2E_BASE_URL="http://127.0.0.1:$port" node node_modules/@playwright/test/cli.js test \
  playwright/r7-shots.spec.ts --project=chromium --no-deps --reporter=list --workers=1 \
  --output="$out/results" > "$out/playwright.txt" 2>&1
echo "exit=$?" >> "$out/playwright.txt"
echo "ended=$(date -u +%FT%TZ)" >> "$out/meta.txt"
