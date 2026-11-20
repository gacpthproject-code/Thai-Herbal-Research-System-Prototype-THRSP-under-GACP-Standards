#!/usr/bin/env bash
# Round 6 heavy job (one heavy.sh slot): scratch Postgres on loopback, migrate, then four jest runs.
# RED = the always-on test as committed at HEAD (ee59a6e72) against the current code; GREEN = the fixed test;
# dispatcher-lock-order alone once; mfa-verify-guards once. Every secret in 0600 files, never in argv.
set -uo pipefail
umask 077
export PATH=/home/ubuntu/.nvm/versions/node/v24.21.0/bin:$PATH
J=/tmp/staff-2fa-golive/round6; L=$J/logs; W=/home/ubuntu/work/wt-2fa; PG=s2fa6-pg
mkdir -p "$L" "$J/keys"
echo "job start $(date +%H:%M:%S) head=$(git -C "$W" rev-parse HEAD)" > "$L/job.txt"
cleanup() { docker rm -f -v "$PG" >/dev/null 2>&1; rm -rf "$J/keys" "$J/pg.env" "$W/apps/backend/__tests__/integration/zz-red-always-on.test.js"; echo "job end $(date +%H:%M:%S)" >> "$L/job.txt"; }
trap cleanup EXIT
pw=$(openssl rand -hex 16)
printf 'POSTGRES_PASSWORD=%s\nPOSTGRES_DB=gacp_s2fa6\n' "$pw" > "$J/pg.env"
docker run -d --name "$PG" -p 127.0.0.1::5432 --env-file "$J/pg.env" postgres:17-alpine >/dev/null || { echo "postgres did not start" >> "$L/job.txt"; exit 4; }
PGPORT=$(docker port "$PG" 5432/tcp | head -1 | sed 's/.*://')
ready=0; for i in $(seq 1 30); do docker exec "$PG" pg_isready -U postgres -d gacp_s2fa6 >/dev/null 2>&1 && { ready=1; break; }; sleep 2; done
[ "$ready" = 1 ] || { echo "postgres never ready" >> "$L/job.txt"; exit 4; }
export DATABASE_URL="postgresql://postgres:${pw}@127.0.0.1:${PGPORT}/gacp_s2fa6"
export ENCRYPTION_KEY=$(openssl rand -hex 16) HEALTH_JWT_SECRET=$(openssl rand -hex 24) PROVIDER_JWT_SECRET=$(openssl rand -hex 24)
export PAYMENT_ADAPTER=mock NODE_OPTIONS=--max-old-space-size=3072 SIGNING_KEY_DIR="$J/keys" NODE_ENV=test
(cd "$W/apps/backend" && npx prisma migrate deploy --schema prisma/schema > "$L/migrate.txt" 2>&1) || { echo "migrate failed" >> "$L/job.txt"; exit 4; }
runjest() { local label=$1; shift
  (cd "$W/apps/backend" && npx jest --config jest.config.cjs --runInBand "$@" 2>&1 | grep -vE '^\s+at |node_modules/|^\s*$' > "$L/$label.txt"; echo "jest exit ${PIPESTATUS[0]}" >> "$L/$label.txt")
  echo "$label: $(grep -E '^Tests:' "$L/$label.txt" | head -1) $(tail -1 "$L/$label.txt")" >> "$L/job.txt"; }
git -C "$W" show HEAD:apps/backend/__tests__/integration/always-on-notices-cannot-be-muted-real-postgres.test.js > "$W/apps/backend/__tests__/integration/zz-red-always-on.test.js"
runjest red-always-on-head __tests__/integration/zz-red-always-on.test.js
rm -f "$W/apps/backend/__tests__/integration/zz-red-always-on.test.js"
runjest green-always-on __tests__/integration/always-on-notices-cannot-be-muted-real-postgres.test.js
runjest green-dispatcher-lock-order-alone __tests__/integration/dispatcher-lock-order-real-postgres.test.js
runjest green-mfa-verify-guards __tests__/integration/mfa-verify-guards.test.js
