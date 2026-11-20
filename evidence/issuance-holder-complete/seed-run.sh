#!/usr/bin/env bash
set -u
LOG=$(readlink -f "$1")
WT=$(git -C "$(dirname "$(readlink -f "$0")")" rev-parse --show-toplevel)
KEY=$(mktemp -d /tmp/ih-seed-key-XXXX)
export DATABASE_URL='postgresql://gacp:gacp@127.0.0.1:55438/gacp_seed?schema=public'
export SIGNING_KEY_DIR=$KEY RSA_PRIVATE_KEY_PASSPHRASE=$(openssl rand -hex 24) NODE_ENV=development LOG_TO_FILE=false
docker exec issueholder-db psql -U gacp -d gacp_ih -tAc 'drop database if exists gacp_seed' >/dev/null
docker exec issueholder-db psql -U gacp -d gacp_ih -tAc 'create database gacp_seed' >/dev/null
{
  echo "head $(git -C "$WT" rev-parse --short HEAD) dirty-files: $(git -C "$WT" status --porcelain -- apps packages | wc -l)"
  cd "$WT/apps/backend"
  npx prisma migrate deploy 2>&1 | tail -1
  timeout 300 node prisma/seed-plants.js 2>&1 | tail -1
  timeout 900 node prisma/seed-gacp.js 2>&1 | grep -v -i -E 'password|secret|passphrase|│'
  echo "seed exit ${PIPESTATUS[0]}"
  docker exec issueholder-db psql -U gacp -d gacp_seed -tAc "select 'cert ' || c.\"certificateNumber\" || ' holderType=' || c.\"holderType\" || ' holder=' || c.\"holderDisplayName\" from certificates c join applications a on a.id=c.\"applicationId\" where a.\"applicationNumber\"='APP-68-002'"
} > "$LOG" 2>&1
rm -rf "$KEY"
grep -E "^head|seed exit|^cert |Error|ไม่สามารถ" "$LOG" | head -20
