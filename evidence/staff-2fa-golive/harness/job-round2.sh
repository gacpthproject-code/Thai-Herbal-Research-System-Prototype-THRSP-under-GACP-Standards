#!/usr/bin/env bash
# Round 2 heavy job: RED on the test commit, GREEN on head (in-memory and real-Redis pending store),
# six mutants on head, round 1's per-door proof rerun (base, three door mutants, head), the roster, and
# the QA script against a server that is the process we stop (exec; fd 9 of heavy.sh closed for it).
# Scratch Postgres + Redis on loopback; every secret stays in 0600 files under $J, never in argv.
set -uo pipefail
umask 077
J=/tmp/staff-2fa-golive/round2; L=$J/logs; W=/home/ubuntu/work/wt-2fa; M=/home/ubuntu/work/GACP-Certification-Application
PG=s2fa3-pg; RD=s2fa3-redis
BASE_SHA=4b549f17c; RED_SHA=8e9ce7fd2; HEAD=$(git -C "$W" rev-parse HEAD)
B=/home/ubuntu/work/wt-2fa-r2-base; R=/home/ubuntu/work/wt-2fa-r2-red; X=/home/ubuntu/work/wt-2fa-r2-mut
DOORS=__tests__/integration/staff-doors-force-2fa-setup-real-postgres.test.js
REBIND=__tests__/integration/staff-2fa-backup-code-rebind-real-postgres.test.js
RESET=__tests__/integration/staff-2fa-emergency-reset-real-postgres.test.js
UNITS="__tests__/unit/mfa-setup-reenrol.test.js __tests__/unit/mfa-reenrol-hardening.test.js __tests__/unit/the-enrolment-loop-closes-end-to-end.test.js __tests__/integration/mfa-roundtrip.test.js __tests__/unit/notification-preferences-service.test.js __tests__/unit/staff-2fa-emergency-reset-refuses.test.js __tests__/unit/second-factor-doors.test.js __tests__/unit/closing-review-fixes.test.js"
PORT=8471
mkdir -p "$L" "$J/keys"
echo "job start $(date +%H:%M:%S) head=$HEAD red=$RED_SHA base=$BASE_SHA" > "$L/job.txt"
SRV=

stop_server() { # the backend handles SIGTERM itself and may not exit; KILL after five seconds
  if [ -n "$SRV" ]; then
    kill -TERM "$SRV" 2>/dev/null
    for i in $(seq 1 10); do kill -0 "$SRV" 2>/dev/null || break; sleep 0.5; done
    kill -0 "$SRV" 2>/dev/null && { kill -KILL "$SRV" 2>/dev/null; echo "server $SRV needed SIGKILL" >> "$L/job.txt"; }
    wait "$SRV" 2>/dev/null; SRV=
  fi
  for i in $(seq 1 20); do ss -ltn 2>/dev/null | grep -q ":$PORT " || return 0; sleep 0.5; done
  echo "port $PORT still busy after stop" >> "$L/job.txt"; return 1
}
cleanup() {
  stop_server
  docker rm -f -v "$PG" "$RD" >/dev/null 2>&1
  for t in "$B" "$R" "$X"; do git -C "$M" worktree remove --force "$t" 2>/dev/null; done
  rm -rf "$J/keys" "$J/pg.env" "$J/db.env" "$J/creds-on" "$J/creds-off"
  echo "job end $(date +%H:%M:%S)" >> "$L/job.txt"
}
trap cleanup EXIT

if ss -ltn 2>/dev/null | grep -q ":$PORT "; then echo "port $PORT busy before start; aborting" >> "$L/job.txt"; exit 3; fi

pw=$(openssl rand -hex 16)
printf 'POSTGRES_PASSWORD=%s\nPOSTGRES_DB=gacp_s2fa3\n' "$pw" > "$J/pg.env"
# docker picks free loopback ports: a fixed port collided with another agent's scratch database on the first run
docker run -d --name "$PG" -p 127.0.0.1::5432 --env-file "$J/pg.env" postgres:17-alpine >/dev/null || { echo "postgres container did not start" >> "$L/job.txt"; exit 4; }
docker run -d --name "$RD" -p 127.0.0.1::6379 redis:7-alpine >/dev/null || { echo "redis container did not start" >> "$L/job.txt"; exit 4; }
PGPORT=$(docker port "$PG" 5432/tcp | head -1 | sed 's/.*://'); RDPORT=$(docker port "$RD" 6379/tcp | head -1 | sed 's/.*://')
[ -n "$PGPORT" ] && [ -n "$RDPORT" ] || { echo "could not read container ports" >> "$L/job.txt"; exit 4; }
{
  printf 'export DATABASE_URL=postgresql://postgres:%s@127.0.0.1:%s/gacp_s2fa3\n' "$pw" "$PGPORT"
  printf 'export ENCRYPTION_KEY=%s\n' "$(openssl rand -hex 16)"
  printf 'export HEALTH_JWT_SECRET=%s\nexport PROVIDER_JWT_SECRET=%s\n' "$(openssl rand -hex 24)" "$(openssl rand -hex 24)"
} > "$J/db.env"
REDIS_SCRATCH=redis://127.0.0.1:$RDPORT
ready=0
for i in $(seq 1 30); do docker exec "$PG" pg_isready -U postgres -d gacp_s2fa3 >/dev/null 2>&1 && { ready=1; break; }; sleep 2; done
[ "$ready" = 1 ] || { echo "postgres never became ready" >> "$L/job.txt"; exit 4; }
# shellcheck disable=SC1091
source "$J/db.env"
case "$DATABASE_URL" in *127.0.0.1:$PGPORT/gacp_s2fa3) ;; *) echo "scratch DATABASE_URL assertion failed" >> "$L/job.txt"; exit 2;; esac
export PAYMENT_ADAPTER=mock NODE_OPTIONS=--max-old-space-size=3072 SIGNING_KEY_DIR="$J/keys" NODE_ENV=test
(cd "$W/apps/backend" && npx prisma migrate deploy --schema prisma/schema > "$L/migrate.txt" 2>&1); mig=$?
[ "$mig" = 0 ] || { echo "migrate deploy failed (exit $mig): $(grep -iE 'error|P10' "$L/migrate.txt" | head -2 | tr '\n' ' ')" >> "$L/job.txt"; exit 4; }
echo "scratch db on 127.0.0.1:$PGPORT redis on 127.0.0.1:$RDPORT migrate ok" >> "$L/job.txt"

runjest() { # $1 tree, $2 label, $3... test files
  local tree=$1 label=$2; shift 2
  (cd "$tree/apps/backend" && npx jest --config jest.config.cjs --runInBand "$@" 2>&1 \
    | grep -vE '^\s+at |node_modules/|^\s*$' > "$L/$label.txt"; echo "jest exit ${PIPESTATUS[0]}" >> "$L/$label.txt")
  local summary; summary=$(grep -E '^Tests:' "$L/$label.txt" | head -1)
  case "$summary" in *passed*|*failed*) ;; *) summary="$summary SKIPPED-ONLY (no database?)";; esac
  echo "$label: $summary $(tail -1 "$L/$label.txt")" >> "$L/job.txt"
}
link_modules() { for d in node_modules apps/backend/node_modules apps/web-app/node_modules; do ln -sfn "$M/$d" "$1/$d"; done; }
mutant() { # $1 label, $2 file under apps/backend, $3 sed expression, $4... test files (runs in $X)
  local label=$1 file=$2 expr=$3; shift 3
  git -C "$X" checkout -q -- .
  sed -i "$expr" "$X/apps/backend/$file"
  if git -C "$X" diff --quiet -- "apps/backend/$file"; then echo "$label: mutation did not apply" >> "$L/job.txt"; return; fi
  git -C "$X" diff -- "apps/backend/$file" > "$L/$label.diff"
  runjest "$X" "$label" "$@"
  git -C "$X" checkout -q -- .
}

# 1. RED: the test commit carries the tests and none of the implementation
git -C "$M" worktree add --detach "$R" "$RED_SHA" >/dev/null 2>&1 && link_modules "$R"
runjest "$R" red-$RED_SHA-rebind "$REBIND"
runjest "$R" red-$RED_SHA-reset "$RESET"

# 2. GREEN on head
runjest "$W" green-head-rebind "$REBIND"
runjest "$W" green-head-reset "$RESET"
GACP_TEST_REDIS_URL=$REDIS_SCRATCH runjest "$W" green-head-rebind-real-redis "$REBIND"
runjest "$W" green-head-doors "$DOORS"
runjest "$W" green-head-units $UNITS

# 3. mutants on head: each must turn its suite red
git -C "$M" worktree add --detach "$X" "$HEAD" >/dev/null 2>&1 && link_modules "$X"
mutant mutant-M4-script-ignores-unused-codes scripts/ops/staff-2fa-emergency-reset.js "s/if (unused > 0) {/if (false) {/" "$RESET"
mutant mutant-M5-script-touches-another-column scripts/ops/staff-2fa-emergency-reset.js "s/data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorBackupCodes: null },/data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorBackupCodes: null, firstName: 'mutant' },/" "$RESET"
mutant mutant-M6-verify-setup-skips-confirmation routes/api/identity/mfa.js "s/if (req.body.backupCodesSaved !== true) {/if (false) {/" "$REBIND"
mutant mutant-M7-setup-keeps-used-backup-code routes/api/identity/mfa.js "s/await identityService.updateBackupCodes(userId, proof.remainingHashes);/void proof.remainingHashes;/" "$REBIND"
mutant mutant-M8-move-drops-audit-row services/identity-service.js "s/await auditLogger.logWithin({ ...auditEvent, organizationId: user.organizationId }, tx);/void auditEvent;/" "$REBIND"
mutant mutant-M9-script-ignores-side-rule scripts/ops/staff-2fa-emergency-reset.js "s/assertSameSideChange({ actorRole: requester.role, target });/void target;/" "$RESET"

# 4. round 1's per-door proof, rerun: base, the three door mutants, head (head ran in step 2)
git -C "$M" worktree add --detach "$B" "$BASE_SHA" >/dev/null 2>&1 && link_modules "$B"
cp "$W/apps/backend/$DOORS" "$B/apps/backend/$DOORS"
runjest "$B" doors-base-main-$BASE_SHA "$DOORS"
mutant mutant-M1-provider-door-ignores-flag routes/api/auth/auth-provider.js "s/const requireMfa = process.env.REQUIRE_MFA_FOR_PRIVILEGED === 'true';/const requireMfa = false;/" "$DOORS"
mutant mutant-M2-health-door-no-portal-check controllers/auth-controller/health-auth-profile-handlers.js "s/expectedPortal: 'HEALTH',/expectedPortal: undefined,/" "$DOORS"
mutant mutant-M3-thaid-links-staff services/auth/thaid-identity-service.js "s/if (normalizeRole(role) !== CANONICAL_ROLES.HEALTH) {/if (false) {/" "$DOORS"

# 5. the roster on seeded data, then the QA script with the flag on and off
export QA_PASSWORD
QA_PASSWORD=$(openssl rand -base64 18)
(cd "$W/apps/backend" && node "$W/evidence/staff-2fa-golive/harness/seed-staff-states.js") > "$L/seed.txt" 2>&1
QA_ID=$(grep '^QA_ID=' "$L/seed.txt" | cut -d= -f2)
[ -n "$QA_ID" ] || { echo "seed produced no QA account; QA runs skipped" >> "$L/job.txt"; exit 5; }
(cd "$W/apps/backend" && node scripts/ops/staff-mfa-roster.js) > "$L/roster.txt" 2>&1
echo "roster exit $?" >> "$L/roster.txt"

serve() { # $1 flag value, $2 log. exec: the subshell becomes node, so $! is the server. 9>&-: the heavy lock stays out of it.
  (cd "$W/apps/backend" && exec env REQUIRE_MFA_FOR_PRIVILEGED="$1" PORT=$PORT node "$W/evidence/staff-2fa-golive/harness/serve-doors.js" > "$L/$2" 2>&1 9>&-) &
  SRV=$!
  for i in $(seq 1 30); do curl -s -m 2 -o /dev/null "http://127.0.0.1:$PORT/api/health" && break; sleep 1; done
  echo "serve flag=$1 pid=$SRV comm=$(ps -o comm= -p "$SRV" 2>/dev/null) listeners=$(ss -ltnp 2>/dev/null | grep -c ":$PORT ")" >> "$L/job.txt"
}
serve true serve-flag-on.log
printf '%s\n%s\n' "$QA_ID" "$QA_PASSWORD" > "$J/creds-on"; chmod 600 "$J/creds-on"
{ bash "$W/scripts/ops/qa-staff-2fa.sh" "http://127.0.0.1:$PORT" "$J/creds-on"; echo "exit $?"; } > "$L/qa-script-flag-on.txt" 2>&1
stop_server; echo "after stop (on): listeners=$(ss -ltn 2>/dev/null | grep -c ":$PORT ")" >> "$L/job.txt"
serve false serve-flag-off.log
printf '%s\n%s\n' "$QA_ID" "$QA_PASSWORD" > "$J/creds-off"; chmod 600 "$J/creds-off"
{ bash "$W/scripts/ops/qa-staff-2fa.sh" "http://127.0.0.1:$PORT" "$J/creds-off"; echo "exit $?"; } > "$L/qa-script-flag-off.txt" 2>&1
stop_server; echo "after stop (off): listeners=$(ss -ltn 2>/dev/null | grep -c ":$PORT ")" >> "$L/job.txt"
unset QA_PASSWORD
echo "qa flag on: $(tr '\n' ' ' < "$L/qa-script-flag-on.txt")" >> "$L/job.txt"
echo "qa flag off: $(tr '\n' ' ' < "$L/qa-script-flag-off.txt")" >> "$L/job.txt"
