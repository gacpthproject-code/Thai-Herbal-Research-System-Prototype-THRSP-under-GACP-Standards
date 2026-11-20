#!/usr/bin/env bash
# Old probe (round 1) vs new probe (round 2) on the review's mutants, each applied to a full copy
# of apps/backend's runtime tree. Prints one line per mutant: old exit, new exit.
set -u
WT="$(cd "$(dirname "$0")/../../.." && pwd)"
OLD_SHA="${1:?old sha}"
BASE=/tmp/rs-probe-compare
rm -rf "$BASE"; mkdir -p "$BASE/old/scripts/probes"
git -C "$WT" show "$OLD_SHA:scripts/probes/admin-side-split.sh" > "$BASE/old/scripts/probes/admin-side-split.sh"
git -C "$WT" show "$OLD_SHA:scripts/probes/_lib.sh" > "$BASE/old/scripts/probes/_lib.sh"
mkdir -p "$BASE/old/apps"; ln -s "$WT/apps/backend" "$BASE/old/apps/backend"
copy() {
  mkdir -p "$1/apps/backend"
  (cd "$WT/apps/backend" && tar cf - --exclude=node_modules --exclude=__tests__ --exclude=tests --exclude=coverage --exclude=storage --exclude=keys routes services controllers middleware shared jobs modules utils cron config constants validation server.js 2>/dev/null) | (cd "$1/apps/backend" && tar xf -)
}
P=apps/backend/routes/api/system/provider.js
U=apps/backend/routes/api/admin/users.js
CHECK='        assertSameSideChange({ actorRole: caller.canonicalRole, target: existing });'
run() { # label dir
  local old new
  ADMIN_SIDE_ROOT="$2" PROBE_OUT_DIR="$BASE/out" bash "$BASE/old/scripts/probes/admin-side-split.sh" >/dev/null 2>&1; old=$?
  ADMIN_SIDE_ROOT="$2" node "$WT/scripts/probes/admin-side-split.js" >"$BASE/new.txt" 2>&1; new=$?
  printf '%-62s old probe exit %s · new probe exit %s · %s\n' "$1" "$old" "$new" "$(head -1 "$BASE/new.txt" | cut -c1-110)"
}
copy "$BASE/ok"; run "control: the real doors" "$BASE/ok"
copy "$BASE/fn1"; node -e '
const fs=require("fs");const f=process.argv[1];let s=fs.readFileSync(f,"utf8");
const chk="        assertSameSideChange({ actorRole: caller.canonicalRole, target: existing });\n\n        // P0-D last-admin guard: deleting";
if(!s.includes(chk)) throw new Error("anchor1 missing");
s=s.replace(chk,"        // P0-D last-admin guard: deleting");
const anchor="        res.json({ success: true, message: \x27Provider account deleted successfully\x27 });";
if(!s.includes(anchor)) throw new Error("anchor2 missing");
s=s.replace(anchor,"        assertSameSideChange({ actorRole: caller.canonicalRole, target: existing });\n"+anchor);
fs.writeFileSync(f,s);' "$BASE/fn1/$P"; run "FN1 DELETE check after the write" "$BASE/fn1"
copy "$BASE/fn2"; sed -i '0,/        assertSameSideChange({ actorRole: caller.canonicalRole, target: existing });/s//        \/\/ side rule: see assertSameSideChange( in canonical-rbac/' "$BASE/fn2/$P"; run "FN2 DELETE check is only a comment" "$BASE/fn2"
copy "$BASE/fn3"; sed -i '0,/        assertSameSideChange({ actorRole: caller.canonicalRole, target: existing });/s//        assertSameSideChange({ actorRole: caller.canonicalRole, target: null });/' "$BASE/fn3/$P"; run "FN3 DELETE check with target:null" "$BASE/fn3"
copy "$BASE/fn4"; mkdir -p "$BASE/fn4/apps/backend/routes/api/platform-admin"
printf '%s\n' "const router=require('express').Router();" "router.patch('/:id/role', async (req,res)=>{ /* writes role, no check */ res.json({}); });" "module.exports=router;" > "$BASE/fn4/apps/backend/routes/api/platform-admin/users.js"
run "FN4 new unlisted router file (review's stub, writes nothing)" "$BASE/fn4"
copy "$BASE/fn4w"; mkdir -p "$BASE/fn4w/apps/backend/routes/api/platform-admin"
printf '%s\n' "const router=require('express').Router();" "const { prisma } = require('../../../services/prisma-database');" "router.patch('/:id/role', async (req,res)=>{ await prisma.user.update({ where: { id: req.params.id }, data: { role: req.body.role } }); res.json({}); });" "module.exports=router;" > "$BASE/fn4w/apps/backend/routes/api/platform-admin/users.js"
run "FN4 new unlisted router file that writes users.role" "$BASE/fn4w"
copy "$BASE/fn5"; printf '%s\n' "router.route('/:id/promote').patch(async (req, res) => res.json({}));" "module.exports = router;" >> "$BASE/fn5/$U"; run "FN5 router.route().patch in an admin router" "$BASE/fn5"
copy "$BASE/fn6"; printf '%s\n' "router.patch('/:id/promote', async (req, res) => res.json({}));" "module.exports = router;" >> "$BASE/fn6/$U"; run "control-red: router.patch in an admin router" "$BASE/fn6"
rm -rf "$BASE"
