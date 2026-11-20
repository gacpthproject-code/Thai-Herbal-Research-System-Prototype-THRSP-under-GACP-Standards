#!/usr/bin/env bash
# Final GREEN on the merged branch head: item 1/4 tests + neighbours, item 2 tests, item 5 fixed test at seven clocks, web tests and tsc.
set -uo pipefail
umask 077
export PATH=/home/ubuntu/.nvm/versions/node/v24.21.0/bin:$PATH
R=/home/ubuntu/work/state/reviews/launch-guards-1-runs; L=$R/logs/final; mkdir -p "$L"
BR=/home/ubuntu/work/wt-guards1; PG=lg1-pg; PGPORT=5441
log() { echo "$(date +%H:%M:%S) $*" | tee -a "$L/job.txt"; }
cleanup() { docker rm -f -v "$PG" >/dev/null 2>&1; rm -f "$BR/apps/backend/jest.pin.config.cjs"; rm -rf "$BR/apps/backend/public/uploads"; log "job end"; }
trap cleanup EXIT
log "job start head=$(git -C $BR rev-parse --short HEAD)"
fresh_pg() {
  docker rm -f -v "$PG" >/dev/null 2>&1
  docker run -d --name "$PG" -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=lg1 -p 127.0.0.1:$PGPORT:5432 postgres:17-alpine >/dev/null || exit 4
  for i in $(seq 1 60); do docker exec "$PG" psql -U postgres -d lg1 -tAc 'select 1' >/dev/null 2>&1 && break; sleep 1; done
  (cd "$BR/apps/backend" && npx prisma migrate deploy > "$L/migrate.txt" 2>&1) || { log "migrate failed"; exit 4; }
}
export DATABASE_URL="postgresql://postgres@127.0.0.1:$PGPORT/lg1?schema=public"; export TEST_DATABASE_URL="$DATABASE_URL"
runjest() { local label=$1; shift
  (cd "$BR/apps/backend" && NODE_OPTIONS=--max-old-space-size=3072 npx jest --runInBand "$@" 2>&1 | grep -vE '^\s+at |^\s*$' | sed -E 's/("dedupeKey":")[0-9a-f]{20,}"/\1<hash>"/g' > "$L/$label.txt"; echo "jest exit ${PIPESTATUS[0]}" >> "$L/$label.txt")
  log "$label: $(grep -E '^Tests:' "$L/$label.txt" | head -1) | $(tail -1 "$L/$label.txt") | failed: $(grep -E '^\s+✕' "$L/$label.txt" | sed 's/^ *✕ //' | cut -c1-110 | tr '\n' ';')"
}
fresh_pg
runjest item1 __tests__/unit/refusal-waits-for-appeal-setup.test.js __tests__/integration/approver-decision-tools-real-postgres.test.js __tests__/integration/approver-decides-a-file-that-did-not-pass-real-postgres.test.js __tests__/integration/admin-doors-around-the-certification-decision-real-postgres.test.js
NEIGH=$(cd "$BR/apps/backend" && grep -rlE "terminal-letter-template|decision-letter-service|certification-decision-service|certification-decision-file-service|admin/config|system-config-controller|appeal-setup|provider/auditor'|certification-refusals|error-codes|closing-jobs|jobs/scheduler|correction-deadline-sweep|payment-closure-job|revision-deadline-checker" __tests__ | grep -E '\.test\.js$' | grep -vE "refusal-waits-for-appeal-setup|approver-decision-tools-real|approver-decides-a-file-that-did-not-pass|admin-doors-around-the-certification" | tr '\n' ' ')
# shellcheck disable=SC2086
runjest neighbours $NEIGH
cat > "$BR/apps/backend/jest.pin.config.cjs" <<CFG
const base = require('./jest.config.cjs');
module.exports = { ...base, setupFilesAfterEnv: [...base.setupFilesAfterEnv, '$R/bin/pin-clock.setup.js'] };
CFG
for pin in real 2026-10-22T01:00:00Z 2026-10-22T04:30:00Z 2026-10-22T06:00:00Z 2026-10-22T09:30:00Z 2026-10-22T12:00:00Z 2026-10-22T16:30:00Z; do
  for n in 1 2 3; do
    out="$L/item5-${pin//:/-}-$n.txt"
    if [ "$pin" = real ]; then unset PIN_CLOCK; else export PIN_CLOCK="$pin"; fi
    (cd "$BR/apps/backend" && NODE_OPTIONS=--max-old-space-size=3072 npx jest -c jest.pin.config.cjs --runInBand __tests__/integration/field-audit-clock-real-postgres.test.js 2>&1 | grep -vE '^\s+at ' > "$out"; echo "jest exit ${PIPESTATUS[0]}" >> "$out")
    log "item5 pin=$pin run=$n: $(grep -E '^Tests:' "$out" | head -1) | failed: $(grep -E '^\s+✕' "$out" | sed 's/^ *✕ //' | cut -c1-90 | tr '\n' ';')"
  done
done
unset PIN_CLOCK
(cd "$BR/apps/web-app" && NODE_OPTIONS=--max-old-space-size=3072 npx jest src/app/provider/certification-decisions src/app/health/planting/new src/lib/__tests__/refusal-copy-names-no-official-or-channel.test.tsx > "$L/web.txt" 2>&1; echo "jest exit $?" >> "$L/web.txt")
log "web: $(grep -E '^Tests:' "$L/web.txt" | head -1) | $(tail -1 "$L/web.txt")"
(cd "$BR/apps/web-app" && NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit -p tsconfig.json > "$L/web-tsc.txt" 2>&1; echo "tsc exit $?" >> "$L/web-tsc.txt")
log "web tsc: $(tail -1 $L/web-tsc.txt) errors=$(grep -c 'error TS' $L/web-tsc.txt)"
