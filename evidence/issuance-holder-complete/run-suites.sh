#!/usr/bin/env bash
set -u
LOG=$(readlink -f "$1"); shift
WT=$(git -C "$(dirname "$(readlink -f "$0")")" rev-parse --show-toplevel)
export NODE_OPTIONS=--max-old-space-size=3072
# A copied apps/backend/.env carries RSA_PRIVATE_KEY_PASSPHRASE and jest reads that file in some
# suites and not others, so the scratch signing key would be sealed under one passphrase and opened
# under another. Pin every suite to the tree's dev passphrase, as in a clean clone with no .env.
RSA_PRIVATE_KEY_PASSPHRASE=$(cat "$WT/apps/backend/keys/.dev-signing-passphrase")
export RSA_PRIVATE_KEY_PASSPHRASE
export TEST_DATABASE_URL='postgresql://gacp:gacp@127.0.0.1:55438/gacp_test?schema=public'
docker exec issueholder-db psql -U gacp -d gacp_ih -tAc 'drop database if exists gacp_test' >/dev/null
docker exec issueholder-db psql -U gacp -d gacp_ih -tAc 'create database gacp_test' >/dev/null
{
  echo "head $(git -C "$WT" rev-parse --short HEAD) dirty-files: $(git -C "$WT" status --porcelain -- apps packages | wc -l)"
  cd "$WT/apps/backend"
  DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy 2>&1 | tail -1
  timeout 2400 npx jest --runInBand "$@" 2>&1
  echo "backend jest exit $?"
} > "$LOG" 2>&1
grep -E "^head|Tests:|exit|Test Suites:" "$LOG"
