#!/usr/bin/env bash
# demo-walk.sh baseline|post|compare <sha> — เดินตรวจ demo ของรอบ deploy (runbook docs/operations/runbooks/deploy-demo.md ขั้น 1 และ 7)
# ล็อกเครื่อง แถว และที่เก็บผลไว้ในสคริปต์ สิทธิ์รายสคริปต์ของ operator จึงขยายไปแถวที่เขียนข้อมูลไม่ได้
#   baseline  เดินก่อนแตะเครื่อง → ~/work/state/walk/demo-<sha12>-baseline
#   post      เดินหลัง demo-up.sh → ~/work/state/walk/demo-<sha12>-post
#   compare   walk-compare.js ของสองโฟลเดอร์ (exit 1 = มี FAIL ใหม่ ต้อง rollback)
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
die() { echo "หยุด: $*" >&2; exit 1; }
[ "$#" -eq 2 ] || die "ใช้: demo-walk.sh baseline|post|compare <sha>"
[[ "$2" =~ ^[0-9a-f]{40}$ ]] || die "อาร์กิวเมนต์ที่สองต้องเป็น sha เต็ม 40 ตัวอักษรตัวพิมพ์เล็ก"
out="$HOME/work/state/walk/demo-${2:0:12}"
case "$1" in
  baseline|post)
    [ ! -e "$out-$1/result.json" ] || die "มีผล $1 ของรอบนี้อยู่แล้ว ($out-$1) · ย้ายออกเองก่อนถ้าต้องเดินใหม่ จะได้ไม่ทับผลที่ใช้เทียบ"
    exec "$here/deploy-walk.sh" https://demo.gacpth.com --target demo \
      --rows identity,accounts,verify,pdpa,subsystems,jobs,finance --out "$out-$1" ;;
  compare)
    [ "$out-post/result.json" -nt "$out-baseline/result.json" ] || die "ผล post ต้องใหม่กว่าผล baseline ของรอบเดียวกัน"
    exec node "$here/walk-compare.js" "$out-baseline/result.json" "$out-post/result.json" ;;
  *) die "ขั้นต้องเป็น baseline, post หรือ compare" ;;
esac
