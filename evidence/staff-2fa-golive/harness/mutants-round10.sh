#!/usr/bin/env bash
# unit-level mutants on the scratch tree; each mutant is applied, tested, then restored from git
set -uo pipefail
export PATH=/home/ubuntu/.nvm/versions/node/v24.21.0/bin:$PATH
M=/home/ubuntu/.claude/jobs/ca14327e/tmp/round10/mut-tree; OUT=/home/ubuntu/work/wt-2fa/evidence/staff-2fa-golive/round10/runs
LIB=scripts/ops/lib/staff-2fa-host.sh
mutate() {
  local name=$1 file=$2 from=$3 to=$4
  ( cd "$M" && python3 -c 'import sys;p,a,b=sys.argv[1:];s=open(p).read();assert s.count(a)>=1,"pattern missing";open(p,"w").write(s.replace(a,b))' "$file" "$from" "$to" ) || { echo "$name: pattern missing" ; return; }
  ( cd "$M/apps/backend" && STAFF_2FA_SHIM_DIR=/home/ubuntu/.claude/jobs/ca14327e/tmp/round10 npx jest --config jest.config.cjs __tests__/unit/staff-2fa-ops-scripts-host-bound.test.js 2>&1 | grep -E '✕|^Tests:' ) > "$OUT/mutant-$name.txt"
  echo "$name: $(grep '^Tests:' "$OUT/mutant-$name.txt")"
  git -C "$M" checkout -q -- "$file"
}
mutate M1-unanchored-staging scripts/ops/mfa-flag-on-staging.sh '=~ ^[0-9]{8}-[0-9]{6}$ ]]' '=~ [0-9]{8}-[0-9]{6} ]]'
mutate M1-unanchored-demo scripts/ops/mfa-flag-on-demo.sh '=~ ^[0-9]{8}-[0-9]{6}$ ]]' '=~ [0-9]{8}-[0-9]{6} ]]'
mutate L1-env-override $LIB 'S2FA_STATE_DIR=/home/ubuntu/work/state/ops/staff-2fa' 'S2FA_STATE_DIR=${STAFF_2FA_STATE_DIR:-/home/ubuntu/work/state/ops/staff-2fa}'
mutate L2-raw-slot $LIB 'S2FA_SCRIPT=$1; S2FA_SLOT=; S2FA_EVENT=$3' 'S2FA_SCRIPT=$1; S2FA_SLOT=${2:-}; S2FA_EVENT=$3'
mutate L2-awk-v $LIB "S2FA_WANT=\${2:-} awk -F'\\t' '!/^#/ && NF && \$1==ENVIRON[\"S2FA_WANT\"]'" "awk -F'\\t' -v s=\"\${2:-}\" '!/^#/ && NF && \$1==s'"
mutate I1-no-start $LIB '  s2fa_log start - 2>/dev/null || { echo "เขียน $S2FA_LOG ไม่ได้ จึงไม่เริ่มงาน" >&2; exit 1; }
' ''
git -C "$M" status --short
