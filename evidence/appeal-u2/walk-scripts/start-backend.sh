#!/usr/bin/env bash
# Starts the worktree's backend on 127.0.0.1:$WALK_PORT against the U2 scratch database only.
# The database URL and the generated secrets are read from 0600 files here; nothing reaches argv (order 70).
set -euo pipefail
W=/home/ubuntu/work/state/reviews/appeal-u2-takeover/walk
set -a; . /home/ubuntu/work/state/reviews/appeal-u2-scratch/db.env; set +a
case "$DATABASE_URL" in *@127.0.0.1:55492/gacp_u2\?*) ;; *) echo "refuse: not the U2 scratch database" >&2; exit 64 ;; esac
if [ ! -f "$W/backend.env" ]; then
  umask 077
  { for k in HEALTH_JWT_SECRET PROVIDER_JWT_SECRET JWT_SECRET JWT_REFRESH_SECRET ENCRYPTION_KEY SESSION_SECRET CSRF_SECRET HMAC_KEY; do
      printf '%s=%s\n' "$k" "$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 48)"; done; } > "$W/backend.env"
fi
set -a; . "$W/backend.env"; set +a
export NODE_ENV=development PAYMENT_ADAPTER=mock PORT="${WALK_PORT:-8192}" NODE_OPTIONS=--max-old-space-size=2048
unset TEST_DATABASE_URL
cd /home/ubuntu/work/wt-appeal/apps/backend
exec node -r "$W/bind-localhost.js" server.js
