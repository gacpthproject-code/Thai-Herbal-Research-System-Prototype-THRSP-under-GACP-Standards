#!/usr/bin/env bash
# demo-precheck.sh <sha> — ขั้น 0: ตรวจในเครื่องพัฒนาก่อนแตะเครื่อง demo (runbook docs/operations/runbooks/deploy-demo.md)
#   1 sha = origin/main หลัง git fetch · checkout อยู่ที่ sha และ scripts/ ไม่มีการแก้ค้าง
#   2 มี attestation ของ sha เอง หรือของบรรพบุรุษที่ใกล้ที่สุดตามสาย first-parent (ภายใน 50 commit)
#     โดยทุกไฟล์ระหว่างบรรพบุรุษนั้นกับ sha อยู่ใต้ evidence/
#   3 gate-compare ของ sha นั้นเทียบ attestation ก่อนหน้าบนสายเดียวกัน ไม่มีความล้มเหลวใหม่
#     (UNPROVEN ผ่านได้ แต่พิมพ์ทุกแถวให้คนอ่าน · NEW-FAILURES หรือเทียบไม่ได้ = หยุด)
# ไฟล์ attestation และ gate-compare.js อ่านจาก tree ของ sha เอง ไม่ใช่จาก working tree
source "$(dirname "${BASH_SOURCE[0]}")/lib/demo.sh"
one_sha "$@"
sha=$1

git fetch -q origin main || die "git fetch origin main ไม่สำเร็จ"
main=$(git rev-parse origin/main)
[ "$main" = "$sha" ] || die "sha ไม่ใช่ origin/main ตอนนี้ (origin/main = ${main:0:12})"
[ "$(git rev-parse HEAD)" = "$sha" ] || die "checkout นี้ไม่ได้อยู่ที่ sha (HEAD = $(git rev-parse --short=12 HEAD)) · git checkout ก่อน"
[ -z "$(git status --porcelain -- scripts)" ] || die "scripts/ ใน checkout นี้มีการแก้ที่ยังไม่ commit · สคริปต์ที่รันต้องตรงกับ sha"

att=""; base=""
for c in $(git rev-list --first-parent --max-count=50 "$sha"); do
  git cat-file -e "$sha:evidence/gate/$c.json" 2>/dev/null || continue
  if [ -z "$att" ]; then att=$c; else base=$c; break; fi
done
[ -n "$att" ] || die "ไม่มี attestation ใน evidence/gate/ ของ sha นี้หรือบรรพบุรุษภายใน 50 commit"
outside=$(git diff --no-renames --no-ext-diff --name-only "$att" "$sha" | grep -v '^evidence/' || true)
[ -z "$outside" ] || die "ระหว่าง attestation ${att:0:12} กับ sha มีไฟล์นอก evidence/ ($(echo "$outside" | head -5 | tr '\n' ' ')) · ต้องมี gate ของ sha นี้เอง"
[ -n "$base" ] || die "ไม่มี attestation ก่อนหน้า ${att:0:12} ให้ gate-compare เทียบ"

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
git archive "$sha" evidence/gate scripts/ops/gate-compare.js | tar -x -C "$tmp"
rc=0; json=$(node "$tmp/scripts/ops/gate-compare.js" --base "$base" --head "$att" --json) || rc=$?
[ "$rc" -le 1 ] || die "gate-compare เทียบ ${base:0:12} กับ ${att:0:12} ไม่ได้ (exit $rc)"
verdict=$(node -e '
const r = JSON.parse(require("fs").readFileSync(0, "utf8"));
const list = (t, a) => a.length && console.error(`${t}:\n  ${a.join("\n  ")}`);
list("ล้มใหม่ (check)", r.newFailedChecks); list("ล้มใหม่ (เทสต์)", r.newFailedTests);
list("pass กลายเป็น not-run", r.newNotRun); list("UNPROVEN ต้องอ่าน log ทีละแถว", r.unprovenChecks);
console.log(r.verdict);' <<<"$json")
case "$verdict" in
  NO-NEW-FAILURES|UNPROVEN) ;;
  *) die "gate-compare ${base:0:12} → ${att:0:12} ได้ $verdict" ;;
esac
echo "precheck ผ่าน: sha ${sha:0:12} = origin/main · attestation ${att:0:12}$([ "$att" = "$sha" ] || echo ' (ต่างจาก sha แค่ไฟล์ใต้ evidence/)') · gate-compare เทียบ ${base:0:12} ได้ $verdict"
