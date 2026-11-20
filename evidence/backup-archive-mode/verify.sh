#!/usr/bin/env bash
# RED/GREEN verification for fix/backup-archive-mode.
#
# WHAT "RED" HAS TO MEAN. Running the new test against the new code and watching
# it pass proves nothing: a test that asserts something already true passes on
# day one and would have passed before the fix too. The only thing that proves a
# test can catch this bug is running it against the code that HAS the bug.
#
# That is what this script does: it takes the pre-fix gacp-backup.sh from
# origin/main, runs the branch's selftest against it, and requires the run to
# fail ON THE SPECIFIC ASSERTION about archive permissions. A failure anywhere
# else means the test broke for an unrelated reason and has still not been shown
# to catch anything — that already happened once on 2026-08-14, when the first
# version of this assertion passed against the buggy script because the fake
# docker inherited the script's own umask and was therefore safer than the real
# container it stood in for.
#
# Run from a fresh clone of this branch:
#   bash evidence/backup-archive-mode/verify.sh
#
# Exits 0 only when RED failed for the right reason AND GREEN passed.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="$ROOT/evidence/backup-archive-mode"
SELFTEST="$ROOT/scripts/ops/gacp-backup.selftest.sh"
ASSERTION='ไฟล์ archive เป็น mode 600'

mkdir -p "$OUT"

echo "=== RED/GREEN — fix/backup-archive-mode ==="
echo "branch : $(git -C "$ROOT" rev-parse --abbrev-ref HEAD) @ $(git -C "$ROOT" rev-parse --short HEAD)"
echo "วันที่  : $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "เครื่อง : $(uname -s) $(uname -r)"
echo ""

# POSIX modes are the whole subject of the assertion. On a filesystem that cannot
# express them the selftest SKIPs rather than asserting, so a "pass" here would
# say nothing at all — refuse to produce evidence that looks like proof.
probe="$(mktemp)"; chmod 600 "$probe" 2>/dev/null
mode="$(stat -c '%a' "$probe" 2>/dev/null || stat -f '%Lp' "$probe" 2>/dev/null)"; rm -f "$probe"
if [ "$mode" != "600" ]; then
    echo "ABORT: filesystem นี้ไม่รองรับ POSIX mode (ได้ $mode หลัง chmod 600)."
    echo "       git-bash บน NTFS mount แบบ noacl จะ SKIP assertion ที่เรากำลังพิสูจน์พอดี"
    echo "       ⇒ ต้องรันบน Linux เท่านั้น ผลจากที่นี่ไม่ใช่หลักฐาน"
    exit 2
fi

git -C "$ROOT" fetch --quiet origin main 2>/dev/null \
    || { echo "ABORT: git fetch origin main ล้มเหลว — ไม่มีโค้ดก่อนแก้ให้เทียบ"; exit 2; }

OLD="$OUT/gacp-backup.pre-fix.sh"
git -C "$ROOT" show origin/main:scripts/ops/gacp-backup.sh > "$OLD" \
    || { echo "ABORT: ดึง scripts/ops/gacp-backup.sh จาก origin/main ไม่ได้"; exit 2; }

# If the fix is already on main there is no "before" left to test against, and a
# green RED-run would be meaningless rather than reassuring.
if ! grep -q 'chmod 600 "$OUT/${ARCHIVE}"' "$OLD"; then
    echo "ABORT: origin/main ไม่มีบั๊กแล้ว (ไม่พบบรรทัด chmod หลัง docker run)"
    echo "       แปลว่าการแก้ถูก merge ไปแล้ว ⇒ RED ไม่มีความหมาย ต้องเทียบกับ commit ก่อนหน้าแทน"
    exit 2
fi

# ── RED: the branch's test against main's code ───────────────────────────────
echo "--- RED: เทสต์ของ branch กับสคริปต์ก่อนแก้ (origin/main) ---"
GACP_SELFTEST_TARGET="$OLD" bash "$SELFTEST" > "$OUT/red.txt" 2>&1
red_rc=$?
cat "$OUT/red.txt"
echo "RED exit=$red_rc"
echo ""

# ── GREEN: the branch's test against the branch's code ───────────────────────
echo "--- GREEN: เทสต์เดียวกันกับสคริปต์หลังแก้ ---"
bash "$SELFTEST" > "$OUT/green.txt" 2>&1
green_rc=$?
cat "$OUT/green.txt"
echo "GREEN exit=$green_rc"
echo ""

# ── verdict ──────────────────────────────────────────────────────────────────
problems=""

grep -q "FAIL  $ASSERTION" "$OUT/red.txt" \
    || problems="$problems
  RED ไม่ได้ล้มที่ '$ASSERTION' — เทสต์ยังไม่ได้พิสูจน์ว่าจับบั๊กนี้ได้"

# Everything else must still pass in RED. A run that fails on five assertions
# says the harness broke, not that this one bug was caught.
red_fails="$(grep -c '^  FAIL' "$OUT/red.txt" 2>/dev/null || echo 0)"
[ "$red_fails" = "1" ] \
    || problems="$problems
  RED ล้ม $red_fails ข้อ ควรล้มข้อเดียว — ถ้าล้มหลายข้อแปลว่า harness พัง ไม่ใช่จับบั๊กได้"

[ "$red_rc" != "0" ] \
    || problems="$problems
  RED exit=0 — สคริปต์ที่มีบั๊กผ่านเทสต์ นี่คือกรณีที่เกิดขึ้นจริงเมื่อ 2026-08-14"

grep -q "PASS  $ASSERTION" "$OUT/green.txt" \
    || problems="$problems
  GREEN ไม่ได้ผ่านที่ '$ASSERTION'"

grep -q 'FAIL=0' "$OUT/green.txt" \
    || problems="$problems
  GREEN ยังมีข้อที่ล้ม"

[ "$green_rc" = "0" ] \
    || problems="$problems
  GREEN exit=$green_rc ควรเป็น 0"

if [ -n "$problems" ]; then
    echo "VERDICT: ไม่ผ่าน$problems"
    echo ""
    echo "หลักฐานอยู่ที่ $OUT/red.txt และ $OUT/green.txt — ส่งสองไฟล์นี้มา อย่าสรุปแทน"
    exit 1
fi

echo "VERDICT: ผ่าน"
echo "  RED  — สคริปต์ก่อนแก้ ล้มที่ '$ASSERTION' ข้อเดียว (exit $red_rc)"
echo "  GREEN— สคริปต์หลังแก้ ผ่านทุกข้อ (exit $green_rc)"
echo ""
echo "หลักฐาน: $OUT/red.txt · $OUT/green.txt"
