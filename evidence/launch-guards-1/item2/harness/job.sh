#!/usr/bin/env bash
# One heavy.sh slot: scratch Postgres, migrate deploy, then the three item-2 suites.
# usage: ~/work/state/heavy.sh bash job.sh <tree> <label> <out-dir>
set -uo pipefail
umask 077
export PATH=/home/ubuntu/.nvm/versions/node/v24.21.0/bin:$PATH
W=$1; LABEL=$2; OUT=$(realpath -m "$3")
J=/tmp/launch-guards-1-item2/$LABEL
PG=lg1-item2-$LABEL-pg
mkdir -p "$OUT" "$J/keys"
echo "job start $(date +%FT%T%z) head=$(git -C "$W" rev-parse HEAD) dirty=$(git -C "$W" status --porcelain -- apps scripts | wc -l) node=$(node --version)" > "$OUT/job.txt"
cleanup() { docker rm -f -v "$PG" >/dev/null 2>&1; rm -rf "$J"; echo "job end $(date +%FT%T%z)" >> "$OUT/job.txt"; }
trap cleanup EXIT

pw=$(openssl rand -hex 16)
printf 'POSTGRES_PASSWORD=%s\n' "$pw" > "$J/pg.env"
docker run -d --name "$PG" -p 127.0.0.1::5432 --env-file "$J/pg.env" postgres:17-alpine >/dev/null || { echo "postgres did not start" >> "$OUT/job.txt"; exit 4; }
PGPORT=$(docker port "$PG" 5432/tcp | head -1 | sed 's/.*://')
ready=0
for _ in $(seq 1 30); do docker exec "$PG" pg_isready -U postgres -d gacp_lg1i2 >/dev/null 2>&1 && { ready=1; break; }; sleep 2; done
[ "$ready" = 1 ] || { echo "postgres never became ready" >> "$OUT/job.txt"; exit 4; }
export DATABASE_URL="postgresql://postgres:$pw@127.0.0.1:$PGPORT/gacp_lg1i2"
export ENCRYPTION_KEY=$(openssl rand -hex 16) HEALTH_JWT_SECRET=$(openssl rand -hex 24) PROVIDER_JWT_SECRET=$(openssl rand -hex 24)
export PAYMENT_ADAPTER=mock NODE_OPTIONS=--max-old-space-size=3072 SIGNING_KEY_DIR="$J/keys" NODE_ENV=test
(cd "$W/apps/backend" && npx prisma migrate deploy --schema prisma/schema > "$J/migrate.txt" 2>&1) || { echo "migrate deploy failed: $(grep -iE 'error|P10' "$J/migrate.txt" | head -2)" >> "$OUT/job.txt"; exit 4; }
echo "scratch db 127.0.0.1:$PGPORT migrate ok" >> "$OUT/job.txt"

for f in __tests__/unit/closing-jobs-script-host-bound.test.js \
         __tests__/unit/closing-jobs-run-the-scheduler-jobs.test.js \
         __tests__/integration/closing-jobs-real-clock-real-postgres.test.js \
         ${EXTRA_SUITES:-}; do
  label=$(basename "$f" .test.js)
  (cd "$W/apps/backend" && npx jest --config jest.config.cjs --runInBand "$f" 2>&1 \
    | grep -vE '^\s+at |node_modules/' | sed "s#$pw#<pw>#g" > "$OUT/$label.txt"; echo "jest exit ${PIPESTATUS[0]}" >> "$OUT/$label.txt")
  echo "$label: $(grep -E '^Tests:' "$OUT/$label.txt" | head -1) | $(tail -1 "$OUT/$label.txt")" >> "$OUT/job.txt"
done
