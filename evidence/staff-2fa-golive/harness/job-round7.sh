#!/usr/bin/env bash
# Round 7 heavy job (one heavy.sh slot) on the merged head of chore/staff-2fa-golive: the real-Postgres staff-2FA suites
# (plain, then with a scratch Redis), the always-on-notices suite the branch touched, the mocked MFA/auth suites and the
# suites that cover the files both sides of the merge changed, each file solo. Scratch Postgres 17 + Redis 7 on loopback;
# secrets in 0600 files under $J, never argv.
set -uo pipefail
umask 077
export PATH=/home/ubuntu/.nvm/versions/node/v24.21.0/bin:$PATH
J=/tmp/staff-2fa-golive/round7; L=$J/logs; W=/home/ubuntu/work/wt-2fa
PG=s2fa7-pg; RD=s2fa7-redis
HEAD=$(git -C "$W" rev-parse HEAD)
mkdir -p "$L" "$J/keys"
echo "job start $(date +%H:%M:%S) head=$HEAD (round 7) node=$(node --version) mem_avail_mb=$(free -m | awk '/Mem:/{print $7}')" > "$L/job.txt"
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
  printf 'export DATABASE_URL=postgresql://postgres:%s@127.0.0.1:%s/gacp_s2fa7\n' "$pw" "$PGPORT"
  printf 'export ENCRYPTION_KEY=%s\n' "$(openssl rand -hex 16)"
  printf 'export HEALTH_JWT_SECRET=%s\nexport PROVIDER_JWT_SECRET=%s\n' "$(rnd)" "$(rnd)"
} > "$J/db.env"
REDIS_SCRATCH=redis://127.0.0.1:$RDPORT
ready=0
for i in $(seq 1 30); do docker exec "$PG" pg_isready -U postgres -d gacp_s2fa7 >/dev/null 2>&1 && { ready=1; break; }; sleep 2; done
[ "$ready" = 1 ] || { echo "postgres never became ready" >> "$L/job.txt"; exit 4; }
# shellcheck disable=SC1091
source "$J/db.env"
case "$DATABASE_URL" in *127.0.0.1:$PGPORT/gacp_s2fa7) ;; *) echo "scratch DATABASE_URL assertion failed" >> "$L/job.txt"; exit 2;; esac
export PAYMENT_ADAPTER=mock NODE_OPTIONS=--max-old-space-size=3072 SIGNING_KEY_DIR="$J/keys" NODE_ENV=test
(cd "$W/apps/backend" && npx prisma migrate deploy --schema prisma/schema > "$L/migrate.txt" 2>&1); mig=$?
[ "$mig" = 0 ] || { echo "migrate deploy failed (exit $mig): $(grep -iE 'error|P10' "$L/migrate.txt" | head -2 | tr '\n' ' ')" >> "$L/job.txt"; exit 4; }
echo "scratch db on 127.0.0.1:$PGPORT redis on 127.0.0.1:$RDPORT migrate ok" >> "$L/job.txt"

runjest() { # $1 label, $2... test files (each call is one solo jest run)
  local label=$1; shift
  (cd "$W/apps/backend" && npx jest --config jest.config.cjs --runInBand "$@" 2>&1 \
    | grep -vE '^\s+at |node_modules/|^\s*$' > "$L/$label.txt"; echo "jest exit ${PIPESTATUS[0]}" >> "$L/$label.txt")
  local summary; summary=$(grep -E '^Tests:' "$L/$label.txt" | head -1)
  case "$summary" in *passed*|*failed*) ;; *) summary="$summary SKIPPED-ONLY (no database?)";; esac
  echo "$label: $summary $(tail -1 "$L/$label.txt") | failed: $(grep -E '^\s+✕' "$L/$label.txt" | sed 's/^ *✕ //' | cut -c1-90 | tr '\n' ';')" >> "$L/job.txt"
}
label_of() { basename "$1" .test.js; }

DB_SUITES="__tests__/integration/staff-2fa-sessions-revoked-real-postgres.test.js
__tests__/integration/staff-2fa-one-code-rebind-real-postgres.test.js
__tests__/integration/staff-2fa-emergency-reset-real-postgres.test.js
__tests__/integration/staff-2fa-backup-code-rebind-real-postgres.test.js
__tests__/integration/staff-doors-force-2fa-setup-real-postgres.test.js
__tests__/integration/always-on-notices-cannot-be-muted-real-postgres.test.js"
REDIS_SUITES="__tests__/integration/staff-2fa-sessions-revoked-real-postgres.test.js
__tests__/integration/staff-2fa-one-code-rebind-real-postgres.test.js
__tests__/integration/staff-2fa-backup-code-rebind-real-postgres.test.js"
MOCKED_SUITES="__tests__/unit/pdpa-final-sweep.test.js
__tests__/integration/mfa-challenge-binding.test.js
__tests__/integration/mfa-roundtrip.test.js
__tests__/integration/mfa-verify-guards.test.js
__tests__/unit/a-locked-out-officer-can-still-enrol.test.js
__tests__/unit/auth-idp-thaid-session.test.js
__tests__/unit/disabled-account-cannot-hold-session.test.js
__tests__/unit/jti-decentralized-verify-sites.test.js
__tests__/unit/mfa-reenrol-hardening.test.js
__tests__/unit/mfa-setup-reenrol.test.js
__tests__/unit/mint-mfa-challenge-token.test.js
__tests__/unit/second-factor-doors.test.js
__tests__/unit/the-enrolment-loop-closes-end-to-end.test.js
__tests__/unit/staff-2fa-emergency-reset-refuses.test.js
__tests__/unit/staff-mint-boundary-forces-second-factor.test.js
__tests__/unit/notification-preferences-service.test.js"
MERGE_TOUCHED_SUITES="__tests__/unit/closing-review-fixes.test.js
__tests__/unit/no-email-leftovers-after-review.test.js
__tests__/unit/no-self-service-password-reset.test.js
__tests__/unit/refresh-token-blocklist.test.js
__tests__/unit/session-epoch-refresh.test.js
__tests__/unit/error-codes-catalog.test.js
__tests__/unit/error-codes-source-pointers.test.js"

for f in $DB_SUITES; do runjest "db-$(label_of "$f")" "$f"; done
for f in $REDIS_SUITES; do GACP_TEST_REDIS_URL=$REDIS_SCRATCH runjest "redis-$(label_of "$f")" "$f"; done
for f in $MOCKED_SUITES; do runjest "mocked-$(label_of "$f")" "$f"; done
for f in $MERGE_TOUCHED_SUITES; do runjest "merged-$(label_of "$f")" "$f"; done
echo "suites: $(grep -c ': Tests:' "$L/job.txt") run, $(grep -c 'failed,' "$L/job.txt") with failures" >> "$L/job.txt"
