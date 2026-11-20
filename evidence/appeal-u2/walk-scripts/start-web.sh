#!/usr/bin/env bash
set -euo pipefail
export INTERNAL_API_URL=http://127.0.0.1:8192 BACKEND_URL=http://127.0.0.1:8192 NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=3072
cd /home/ubuntu/work/wt-appeal/apps/web-app
exec node node_modules/next/dist/bin/next dev -p 3192 -H 127.0.0.1
