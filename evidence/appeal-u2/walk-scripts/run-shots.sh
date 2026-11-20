#!/usr/bin/env bash
# Runs inside heavy.sh. The dev server starts with fd 9 closed so it can never keep heavy.sh's lock after the job ends.
set -uo pipefail
W=/home/ubuntu/work/state/reviews/appeal-u2-takeover/walk
set -a; . "$W/walk.env"; set +a
export WEB_BASE="${WEB_BASE:-http://localhost:3192}"
"$W/start-web.sh" 9>&- > "$W/web.log" 2>&1 &
WEB=$!
for i in $(seq 1 120); do grep -q "Ready in" "$W/web.log" && break; sleep 1; done
for u in /auth/provider/login /auth/health/login; do curl -s -o /dev/null --max-time 240 "http://127.0.0.1:3192$u"; done
cd /home/ubuntu/work/wt-appeal/apps/web-app
rc=0; node - < "$W/shots.js" > "$W/shots.log" 2>&1 || rc=$?
kill "$WEB" 2>/dev/null; fuser -k 3192/tcp 2>/dev/null
tail -3 "$W/shots.log"; exit $rc
