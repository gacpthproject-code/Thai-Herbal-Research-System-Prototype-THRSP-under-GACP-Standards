#!/usr/bin/env bash
# One heavy job (order 4) for feat/appeal-u1-u2 at the merged head: full backend suite on a fresh migrated scratch
# database, the web suites related to every web file U1+U2 change, web typecheck, and for every failing test name
# outside main's baseline a solo rerun on the head and the same suite on main's code (same procedure, own fresh DB).
# Database URLs come from 0600 env files and are asserted; none reaches argv (order 70).
set -uo pipefail
S=/home/ubuntu/work/state/reviews/appeal-u2-takeover-2; R="$S/raw"; HEAD_WT=/tmp/u2t2-head; MAIN_WT=/tmp/u2t2-main
HEAD_SHA=114f00a8cfa4f51804939cca9c22786c8ecc05db; MAIN_SHA=1b785c48c75d12e5c236d3a98ca64dc661f76e04
log() { echo "[batch $(date +%H:%M:%S)] $*" | tee -a "$R/batch.log"; }
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"
node -v | grep -q '^v24' || { log "refuse: not node 24"; exit 3; }
export NODE_OPTIONS=--max-old-space-size=4096 PAYMENT_ADAPTER=mock
[ "$(git -C "$HEAD_WT" rev-parse HEAD)" = "$HEAD_SHA" ] && [ -z "$(git -C "$HEAD_WT" status --porcelain)" ] || { log "refuse: head worktree is not clean at $HEAD_SHA"; exit 64; }
[ "$(git -C "$MAIN_WT" rev-parse HEAD)" = "$MAIN_SHA" ] && [ -z "$(git -C "$MAIN_WT" status --porcelain)" ] || { log "refuse: main worktree is not clean at $MAIN_SHA"; exit 64; }

use_db() {
    set -a; . "$S/db-u2t2_full.env"; set +a
    DATABASE_URL="${DATABASE_URL/\/u2t2_full\?/\/$1?}"; TEST_DATABASE_URL="$DATABASE_URL"; export DATABASE_URL TEST_DATABASE_URL
    case "$DATABASE_URL" in postgresql://postgres:*@127.0.0.1:55493/"$1"\?schema=public) ;; *) log "refuse: DATABASE_URL is not the u2t2 scratch $1"; exit 64 ;; esac
}
fresh_db() { # <db> <worktree>
    docker exec appeal-u2t2-pg psql -U postgres -qc "DROP DATABASE IF EXISTS $1" -c "CREATE DATABASE $1" || { log "createdb $1 failed"; exit 65; }
    use_db "$1"
    (cd "$2/apps/backend" && npx prisma migrate deploy --schema prisma/schema) > "$R/migrate-$1.txt" 2>&1 || { log "migrate $1 failed"; exit 65; }
    log "fresh $1 migrated from $(git -C "$2" rev-parse --short HEAD): $(docker exec appeal-u2t2-pg psql -U postgres -d "$1" -tAc 'select count(*) from _prisma_migrations where finished_at is not null') migrations"
}
run_jest() { # <label> <worktree> [jest args...]
    local label="$1" wt="$2"; shift 2
    (cd "$wt/apps/backend" && npx jest --ci --forceExit --json --outputFile="$R/$label.json" "$@") > "$R/$label.txt" 2>&1
    log "$label exit $?: $(grep -E '^Tests:' "$R/$label.txt" | tail -1)"
}

log "start head $HEAD_SHA"
fresh_db u2t2_full "$HEAD_WT"
docker exec appeal-u2t2-pg psql -U postgres -d u2t2_full -tAc "select id, \"workflowStage\", \"workType\", \"candidateGroup\", \"isActive\" from stage_activity_configs where \"workflowStage\" = 'AUDIT_NOT_PASSED'" > "$R/sac-row.txt"
log "U2 task row: $(cat "$R/sac-row.txt")"

run_jest full "$HEAD_WT"
python3 -I "$S/tools/jest-fails.py" "$R/full.json" > "$R/full-fails.txt"
comm -13 "$S/baseline-names.txt" "$R/full-fails.txt" > "$R/new-names.txt"
comm -23 "$S/baseline-names.txt" "$R/full-fails.txt" > "$R/baseline-not-failing.txt"
sed 's/ :: .*//' "$R/new-names.txt" | sort -u > "$R/new-suites.txt"
log "failing names: $(wc -l < "$R/full-fails.txt") · outside main's 8: $(wc -l < "$R/new-names.txt") in $(wc -l < "$R/new-suites.txt") suites · main's names not failing here: $(wc -l < "$R/baseline-not-failing.txt")"

if [ -s "$R/new-suites.txt" ]; then
    fresh_db u2t2_solo "$HEAD_WT"
    while read -r suite; do run_jest "solo-$(basename "$suite" .test.js)" "$HEAD_WT" "$suite"; done < "$R/new-suites.txt"
    fresh_db u2t2_ctl "$MAIN_WT"
    while read -r suite; do
        if [ -f "$MAIN_WT/apps/backend/$suite" ]; then run_jest "control-$(basename "$suite" .test.js)" "$MAIN_WT" "$suite"
        else log "control-$(basename "$suite" .test.js): suite does not exist on main"; fi
    done < "$R/new-suites.txt"
fi

log "web related suites"
mapfile -t WEB < "$S/web-touched.txt"
[ "${#WEB[@]}" -gt 0 ] || { log "refuse: empty web list"; exit 64; }
(cd "$HEAD_WT/apps/web-app" && node node_modules/jest/bin/jest.js --ci --json --outputFile="$R/web.json" --findRelatedTests "${WEB[@]}") > "$R/web.txt" 2>&1
log "web exit $?: $(grep -E '^Test Suites:' "$R/web.txt" | tail -1) · $(grep -E '^Tests:' "$R/web.txt" | tail -1)"
(cd "$HEAD_WT/apps/web-app" && npx tsc --noEmit -p tsconfig.json) > "$R/web-tsc.txt" 2>&1
log "web tsc exit $?: $(grep -c 'error TS' "$R/web-tsc.txt") errors"
log "done"
