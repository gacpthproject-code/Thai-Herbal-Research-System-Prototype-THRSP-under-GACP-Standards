#!/usr/bin/env bash
# usage: closure-reason-mutations.sh <worktree> — each mutant must turn at least one new test red.
# Requires a clean, committed tree; restores every file with git checkout after each mutant.
set -uo pipefail
WT=${1:?worktree}
cd "$WT" || exit 2
git diff --quiet || { echo "tree not clean"; exit 2; }
SUITE=$HOME/work/state/scratch/closure-reason-suite.sh
PG=__tests__/integration/staff-access-2-real-postgres.test.js
FILTER='PURPOSE_NOT_IN_SCOPE|code-shaped|no way forward'
run() {
    local name=$1 file=$2 from=$3 to=$4
    python3 - "$file" "$from" "$to" <<'EOF' || { echo "$name: pattern not found"; return; }
import sys
p, a, b = sys.argv[1:]
s = open(p, encoding='utf8').read()
assert s.count(a) == 1, 'pattern count != 1'
open(p, 'w', encoding='utf8').write(s.replace(a, b))
EOF
    local out
    out=$("$SUITE" "$WT" "$PG" -t "$FILTER" 2>&1 | grep -E '^Tests:|✕')
    git checkout -q -- "$file"
    if grep -q '✕' <<<"$out"; then echo "KILLED $name"; else echo "SURVIVED $name"; fi
    echo "$out" | sed 's/^/    /'
}
run "no-next-step" apps/backend/services/application-closure-notify.js \
    'return nextStep ? `${message} ${nextStep}` : message;' 'return message;'
run "next-step-for-every-reason" apps/backend/services/application-closure-notify.js \
    'const nextStep = APPLICATION_CLOSURE_NEXT_STEPS[reasonCode];' 'const nextStep = APPLICATION_CLOSURE_NEXT_STEPS.PURPOSE_NOT_IN_SCOPE;'
run "always-append" apps/backend/services/application-closure-notify.js \
    'return nextStep ? `${message} ${nextStep}` : message;' 'return `${message} ${nextStep}`;'
run "any-code-accepted" apps/backend/shared/application-closure-reasons.js \
    "return typeof code === 'string' && Object.prototype.hasOwnProperty.call(APPLICATION_CLOSURE_REASONS, code);" \
    "return typeof code === 'string' && /^[A-Z_]+\$/.test(code);"
run "code-dropped" apps/backend/shared/application-closure-reasons.js \
    "    PURPOSE_NOT_IN_SCOPE: 'วัตถุประสงค์ที่ระบุในคำขอไม่อยู่ในขอบข่ายการรับรองแล้ว',
" ""
git diff --quiet && echo "tree restored"
