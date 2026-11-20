#!/usr/bin/env bash
# One heavy job: baseline on origin/main, three mutants, head GREEN, roster proof, QA-script proof.
# Scratch Postgres + Redis on loopback; every secret stays in 0600 files under $J, never in argv.
set -uo pipefail
umask 077
J=/tmp/staff-2fa-golive; L=$J/logs; W=/home/ubuntu/work/wt-2fa; M=/home/ubuntu/work/GACP-Certification-Application
BASE_SHA=4b549f17c; HEAD=$(git -C "$W" rev-parse HEAD)
B=/home/ubuntu/work/wt-2fa-base; X=/home/ubuntu/work/wt-2fa-mut
TEST=__tests__/integration/staff-doors-force-2fa-setup-real-postgres.test.js
mkdir -p "$L" "$J/keys"
echo "job start $(date +%H:%M:%S) head=$HEAD" > "$L/job.txt"

cleanup() {
  [ -n "${SRV:-}" ] && kill "$SRV" 2>/dev/null
  docker rm -f -v s2fa-pg s2fa-redis >/dev/null 2>&1
  git -C "$M" worktree remove --force "$B" 2>/dev/null; git -C "$M" worktree remove --force "$X" 2>/dev/null
  rm -rf "$J/keys" "$J/pg.env" "$J/db.env" "$J/creds-on" "$J/creds-off"
  echo "job end $(date +%H:%M:%S)" >> "$L/job.txt"
}
trap cleanup EXIT

pw=$(openssl rand -hex 16)
printf 'POSTGRES_PASSWORD=%s\nPOSTGRES_DB=gacp_s2fa\n' "$pw" > "$J/pg.env"
{
  printf 'export DATABASE_URL=postgresql://postgres:%s@127.0.0.1:55491/gacp_s2fa\n' "$pw"
  printf 'export REDIS_URL=redis://127.0.0.1:63791\n'
  printf 'export ENCRYPTION_KEY=%s\n' "$(openssl rand -hex 16)"
  printf 'export HEALTH_JWT_SECRET=%s\nexport PROVIDER_JWT_SECRET=%s\n' "$(openssl rand -hex 24)" "$(openssl rand -hex 24)"
} > "$J/db.env"
docker run -d --name s2fa-pg -p 127.0.0.1:55491:5432 --env-file "$J/pg.env" postgres:17-alpine >/dev/null
docker run -d --name s2fa-redis -p 127.0.0.1:63791:6379 redis:7-alpine >/dev/null
for i in $(seq 1 30); do docker exec s2fa-pg pg_isready -U postgres -d gacp_s2fa >/dev/null 2>&1 && break; sleep 2; done
# shellcheck disable=SC1091
source "$J/db.env"
case "$DATABASE_URL" in *127.0.0.1:55491/gacp_s2fa) ;; *) echo "scratch DATABASE_URL assertion failed" >> "$L/job.txt"; exit 2;; esac
export PAYMENT_ADAPTER=mock NODE_OPTIONS=--max-old-space-size=3072 SIGNING_KEY_DIR="$J/keys" NODE_ENV=test
(cd "$W/apps/backend" && npx prisma migrate deploy --schema prisma/schema 2>&1 | tail -2) > "$L/migrate.txt"

runjest() { # $1 tree, $2 label
  (cd "$1/apps/backend" && npx jest --config jest.config.cjs --runInBand "$TEST" 2>&1 \
    | grep -vE '^\s+at |node_modules/|^\s*$' > "$L/$2.txt"; echo "jest exit ${PIPESTATUS[0]}" >> "$L/$2.txt")
  echo "$2: $(grep -E '^Tests:' "$L/$2.txt" | head -1) $(tail -1 "$L/$2.txt")" >> "$L/job.txt"
}
link_modules() { for d in node_modules apps/backend/node_modules apps/web-app/node_modules; do ln -sfn "$M/$d" "$1/$d"; done; }

git -C "$M" worktree add --detach "$B" "$BASE_SHA" >/dev/null 2>&1 && link_modules "$B"
cp "$W/apps/backend/$TEST" "$B/apps/backend/$TEST"
runjest "$B" base-main-4b549f17c

git -C "$M" worktree add --detach "$X" "$HEAD" >/dev/null 2>&1 && link_modules "$X"
mutant() { # $1 label, $2 file, $3 sed expression
  git -C "$X" checkout -q -- .
  sed -i "$3" "$X/apps/backend/$2"
  if git -C "$X" diff --quiet -- "apps/backend/$2"; then echo "$1: mutation did not apply" >> "$L/job.txt"; return; fi
  git -C "$X" diff -- "apps/backend/$2" > "$L/$1.diff"
  runjest "$X" "$1"
}
mutant mutant-M1-provider-door-ignores-flag routes/api/auth/auth-provider.js \
  "s/const requireMfa = process.env.REQUIRE_MFA_FOR_PRIVILEGED === 'true';/const requireMfa = false;/"
mutant mutant-M2-health-door-no-portal-check controllers/auth-controller/health-auth-profile-handlers.js \
  "s/expectedPortal: 'HEALTH',/expectedPortal: undefined,/"
mutant mutant-M3-thaid-links-staff services/auth/thaid-identity-service.js \
  "s/if (normalizeRole(role) !== CANONICAL_ROLES.HEALTH) {/if (false) {/"
git -C "$X" checkout -q -- .

runjest "$W" green-head-"$HEAD"

export QA_PASSWORD
QA_PASSWORD=$(openssl rand -base64 18)
(cd "$W/apps/backend" && node "$W/evidence/staff-2fa-golive/harness/seed-staff-states.js") > "$L/seed.txt" 2>&1
QA_ID=$(grep '^QA_ID=' "$L/seed.txt" | cut -d= -f2)
(cd "$W/apps/backend" && node scripts/ops/staff-mfa-roster.js) > "$L/roster.txt" 2>&1
echo "roster exit $?" >> "$L/roster.txt"

serve() { # $1 flag value, $2 log
  (cd "$W/apps/backend" && REQUIRE_MFA_FOR_PRIVILEGED="$1" PORT=8471 node "$W/evidence/staff-2fa-golive/harness/serve-doors.js" > "$L/$2" 2>&1) &
  SRV=$!
  for i in $(seq 1 30); do curl -s -m 2 -o /dev/null http://127.0.0.1:8471/api/health && break; sleep 1; done
}
serve true serve-flag-on.log
printf '%s\n%s\n' "$QA_ID" "$QA_PASSWORD" > "$J/creds-on"; chmod 600 "$J/creds-on"
{ bash "$W/scripts/ops/qa-staff-2fa.sh" http://127.0.0.1:8471 "$J/creds-on"; echo "exit $?"; } > "$L/qa-script-flag-on.txt" 2>&1
kill "$SRV" 2>/dev/null; wait "$SRV" 2>/dev/null; SRV=
serve false serve-flag-off.log
printf '%s\n%s\n' "$QA_ID" "$QA_PASSWORD" > "$J/creds-off"; chmod 600 "$J/creds-off"
{ bash "$W/scripts/ops/qa-staff-2fa.sh" http://127.0.0.1:8471 "$J/creds-off"; echo "exit $?"; } > "$L/qa-script-flag-off.txt" 2>&1
kill "$SRV" 2>/dev/null; wait "$SRV" 2>/dev/null; SRV=
unset QA_PASSWORD
echo "qa flag on: $(cat "$L/qa-script-flag-on.txt" | tr '\n' ' ')" >> "$L/job.txt"
echo "qa flag off: $(cat "$L/qa-script-flag-off.txt" | tr '\n' ' ')" >> "$L/job.txt"
