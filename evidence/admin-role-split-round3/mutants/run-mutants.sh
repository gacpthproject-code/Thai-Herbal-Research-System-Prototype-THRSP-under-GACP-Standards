#!/usr/bin/env bash
# Each mutant edits one committed file in the worktree, runs one test file, then restores the file from HEAD.
set -uo pipefail
WT=/home/ubuntu/work/wt-rolesplit
B=$WT/apps/backend
OUT=/tmp/rolesplit-r3/mut
cd $WT
[ -z "$(git status --porcelain -- apps/backend)" ] || { echo "backend tree not clean, refusing"; exit 2; }
mutate() { # name file perl-substitution test
  local name=$1 file=$2 expr=$3 test=$4
  perl -0pi -e "$expr" "$B/$file"
  if git diff --quiet -- "apps/backend/$file"; then echo "$name: substitution did not apply"; return; fi
  timeout 900 /home/ubuntu/work/state/rolesplit-r3/bjest.sh "$test" > "$OUT/$name.txt" 2>&1
  git show "HEAD:apps/backend/$file" > "$B/$file"
  echo "$name: $(grep -E '^Tests:' "$OUT/$name.txt")"
  git diff --quiet -- "apps/backend/$file" || echo "$name: RESTORE FAILED"
}
RACE=__tests__/integration/last-admin-race-real-postgres.test.js
UNIT=__tests__/admin-user-service.test.js
mutate A-no-lock services/provider-user-service.js 's/        await tx\.\$executeRaw`SELECT pg_advisory_xact_lock\([^\n]*\n//' $RACE
mutate E-lock-per-target services/admin-user-service.js 's/withLastAdminLock\(\{ role: adminRole, organizationId: scope \}/withLastAdminLock({ role: adminRole, organizationId: existing.id }/' $RACE
mutate F-users-door-bypass routes/api/admin/users.js 's/const updated = await adminUserService\.updateKeepingAnAdmin\(\{\n            existing,\n            organizationId: req\.user\?\.organizationId,\n            data: updateData,\n        \}\);/await adminUserService.updateKeepingAnAdmin({ existing, organizationId: req.user?.organizationId, data: { updatedBy: updateData.updatedBy } });\n        const updated = await require("..\/..\/..\/services\/provider-user-service").updateAdminUser(id, updateData);/' $RACE
mutate B-decide-on-stale-row services/admin-user-service.js 's/await assertNotLastActiveAdmin\(\{ existing: current, organizationId: scope \}, tx\)/await assertNotLastActiveAdmin({ existing, organizationId: scope }, tx)/' $UNIT
mutate C-count-off-the-transaction services/admin-user-service.js 's/excludeUserId: existing\.id,\n    \}, client\);/excludeUserId: existing.id,\n    });/' $UNIT
git status --short -- apps/backend
