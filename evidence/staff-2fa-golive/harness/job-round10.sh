#!/usr/bin/env bash
# Round 10 heavy job (one heavy.sh slot). usage: job-round10.sh <tree> <label> [full|l3]
set -uo pipefail
umask 077
export PATH=/home/ubuntu/.nvm/versions/node/v24.21.0/bin:$PATH
W=$1; LABEL=$2; FULL=${3:-}  # FULL: full | l3
J=/tmp/staff-2fa-golive/round10-$LABEL; L=$J/logs
PG=s2fa10-$LABEL-pg; RD=s2fa10-$LABEL-redis
HEAD=$(git -C "$W" rev-parse HEAD)
mkdir -p "$L" "$J/keys"
echo "job start $(date +%H:%M:%S) head=$HEAD (round 10 $LABEL) node=$(node --version) mem_avail_mb=$(free -m | awk '/Mem:/{print $7}')" > "$L/job.txt"
cleanup() {
  docker rm -f -v "$PG" "$RD" >/dev/null 2>&1
  rm -rf "$J/keys" "$J/pg.env" "$J/db.env"
  echo "job end $(date +%H:%M:%S)" >> "$L/job.txt"
}
trap cleanup EXIT

pw=$(openssl rand -hex 16)
printf 'POSTGRES_PASSWORD=%s\n' "$pw" > "$J/pg.env"
docker run -d --name "$PG" -p 127.0.0.1::5432 --env-file "$J/pg.env" postgres:17-alpine >/dev/null || { echo "postgres container did not start" >> "$L/job.txt"; exit 4; }
docker run -d --name "$RD" -p 127.0.0.1::6379 redis:7-alpine >/dev/null || { echo "redis container did not start" >> "$L/job.txt"; exit 4; }
PGPORT=$(docker port "$PG" 5432/tcp | head -1 | sed 's/.*://'); RDPORT=$(docker port "$RD" 6379/tcp | head -1 | sed 's/.*://')
[ -n "$PGPORT" ] && [ -n "$RDPORT" ] || { echo "could not read container ports" >> "$L/job.txt"; exit 4; }
rnd() { openssl rand -hex 24; }
{
  printf 'export DATABASE_URL=postgresql://postgres:%s@127.0.0.1:%s/gacp_s2fa10\n' "$pw" "$PGPORT"
  printf 'export ENCRYPTION_KEY=%s\n' "$(openssl rand -hex 16)"
  printf 'export HEALTH_JWT_SECRET=%s\nexport PROVIDER_JWT_SECRET=%s\n' "$(rnd)" "$(rnd)"
} > "$J/db.env"
REDIS_SCRATCH=redis://127.0.0.1:$RDPORT
ready=0
for i in $(seq 1 30); do docker exec "$PG" pg_isready -U postgres -d gacp_s2fa10 >/dev/null 2>&1 && { ready=1; break; }; sleep 2; done
[ "$ready" = 1 ] || { echo "postgres never became ready" >> "$L/job.txt"; exit 4; }
# shellcheck disable=SC1091
source "$J/db.env"
case "$DATABASE_URL" in *127.0.0.1:$PGPORT/gacp_s2fa10) ;; *) echo "scratch DATABASE_URL assertion failed" >> "$L/job.txt"; exit 2;; esac
export PAYMENT_ADAPTER=mock NODE_OPTIONS=--max-old-space-size=3072 SIGNING_KEY_DIR="$J/keys" NODE_ENV=test
(cd "$W/apps/backend" && npx prisma migrate deploy --schema prisma/schema > "$L/migrate.txt" 2>&1); mig=$?
[ "$mig" = 0 ] || { echo "migrate deploy failed (exit $mig): $(grep -iE 'error|P10' "$L/migrate.txt" | head -2 | tr '\n' ' ')" >> "$L/job.txt"; exit 4; }
echo "scratch db on 127.0.0.1:$PGPORT redis on 127.0.0.1:$RDPORT migrate ok" >> "$L/job.txt"

runjest() {
  local label=$1; shift
  (cd "$W/apps/backend" && STAFF_2FA_SHIM_DIR=/home/ubuntu/.claude/jobs/ca14327e/tmp/round10 npx jest --config jest.config.cjs --runInBand "$@" 2>&1 \
    | grep -vE '^\s+at |node_modules/|^\s*$' > "$L/$label.txt"; echo "jest exit ${PIPESTATUS[0]}" >> "$L/$label.txt")
  local summary; summary=$(grep -E '^Tests:' "$L/$label.txt" | head -1)
  case "$summary" in *passed*|*failed*) ;; *) summary="$summary SKIPPED-ONLY (no database?)";; esac
  echo "$label: $summary $(tail -1 "$L/$label.txt") | failed: $(grep -E '^\s+✕' "$L/$label.txt" | sed 's/^ *✕ //' | cut -c1-110 | tr '\n' ';')" >> "$L/job.txt"
}
label_of() { basename "$1" .test.js; }

DB_SUITES="__tests__/integration/staff-2fa-sessions-revoked-real-postgres.test.js"
UNIT_SUITES="__tests__/unit/staff-2fa-ops-scripts-host-bound.test.js
__tests__/unit/staff-sessions-revoke-approved-events.test.js
__tests__/unit/follows-emergency-reset.test.js"
if [ "$FULL" = full ]; then
  DB_SUITES="$DB_SUITES
__tests__/integration/staff-2fa-emergency-reset-real-postgres.test.js
__tests__/integration/staff-doors-force-2fa-setup-real-postgres.test.js"
  UNIT_SUITES="$UNIT_SUITES
__tests__/unit/staff-2fa-emergency-reset-refuses.test.js
__tests__/unit/privacy-notice-audit-log-ip.test.js
__tests__/unit/pdpa-final-sweep.test.js"
fi
if [ "$FULL" = l3 ]; then
  runjest "db-l3-concurrency" __tests__/integration/staff-2fa-sessions-revoked-real-postgres.test.js -t "review L3"
  exit 0
fi
for f in $DB_SUITES; do runjest "db-$(label_of "$f")" "$f"; done
[ "$FULL" = full ] && GACP_TEST_REDIS_URL=$REDIS_SCRATCH runjest "redis-staff-2fa-sessions-revoked-real-postgres" __tests__/integration/staff-2fa-sessions-revoked-real-postgres.test.js
for f in $UNIT_SUITES; do runjest "unit-$(label_of "$f")" "$f"; done
echo "suites: $(grep -c ': Tests:' "$L/job.txt") run, $(grep -c 'failed,' "$L/job.txt") with failures" >> "$L/job.txt"
