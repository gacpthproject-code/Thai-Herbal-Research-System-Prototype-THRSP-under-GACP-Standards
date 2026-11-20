#!/usr/bin/env bash
# รันงานปิดคำขอของ scheduler ทันทีหนึ่งรอบบน staging ด้วยนาฬิกาจริง (คำสั่ง 118(3))
# ปิดคำขอที่เลยกำหนดส่งแก้/แก้ข้อบกพร่อง งวดที่ค้างชำระเลยระยะผ่อนผัน และลบไฟล์ CAR ที่อัปโหลดแล้วไม่ได้ส่งซึ่งพ้นกำหนดรอบหรือครบ 7 วัน (คำสั่ง 129(3))
# ไม่เลื่อนเวลา ไม่แก้เวลาในฐานข้อมูล · ดูก่อนลบได้ด้วย node scripts/ops/car-staged-files-sweep.js --dry-run ในคอนเทนเนอร์
# usage: scripts/ops/run-closing-jobs.sh staging
set -euo pipefail

HOSTS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/closing-jobs-hosts.tsv"
STATE_DIR=/home/ubuntu/work/state/ops/closing-jobs
LOG=$STATE_DIR/runs.log
REMOTE_DIR=/app/apps/backend
ENTRY=scripts/ops/run-closing-jobs.js
SUMMARY_LINE='^closing-jobs( [A-Za-z]+:([A-Za-z]+=[0-9]+(,[A-Za-z]+=[0-9]+)*|done|failed))+$'
SLOT=
DETAIL=

log() {
  mkdir -p "$STATE_DIR"
  [ -e "$LOG" ] || install -m 0600 /dev/null "$LOG"
  chmod 0600 "$LOG"
  printf '%s\t%s\t%s\t%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(hostname)" "${SLOT:-?}" "$1" "$2" >> "$LOG"
}

log_exit() {
  local rc=$? outcome
  case $rc in 0) outcome=done;; 2) outcome=refused;; *) outcome=failed;; esac
  log "$outcome" "exit=$rc${DETAIL:+ $DETAIL}"
}

refuse() {
  echo "$1" >&2
  DETAIL=$2
  exit 2
}

row=$(WANT=${1:-} awk -F'\t' '!/^#/ && NF && $1==ENVIRON["WANT"]' "$HOSTS")
[ -z "$row" ] || IFS=$'\t' read -r SLOT RUN_FROM CONTAINER SLOT_ENV <<< "$row"
log start - 2>/dev/null || { echo "เขียน $LOG ไม่ได้ จึงไม่เริ่มงาน" >&2; exit 1; }
trap log_exit EXIT

[ -n "$row" ] || refuse "สคริปต์นี้รันได้เฉพาะ staging (usage: run-closing-jobs.sh staging)" "unknown slot"
[ $# -eq 1 ] || refuse "usage: run-closing-jobs.sh staging" "bad usage"
[ "$(hostname)" = "$RUN_FROM" ] || refuse "สคริปต์นี้รันได้เฉพาะบนเครื่อง $RUN_FROM (เครื่องนี้คือ $(hostname))" "wrong host"
docker ps --filter "name=^${CONTAINER}\$" --filter status=running -q | grep -q . \
  || refuse "ไม่พบคอนเทนเนอร์ $CONTAINER ที่กำลังทำงาน" "container not running"
docker exec "$CONTAINER" node -e "process.exit(process.env.GACP_DEPLOY_SLOT==='$SLOT_ENV'?0:1)" \
  || refuse "คอนเทนเนอร์ $CONTAINER ไม่ได้ประกาศ GACP_DEPLOY_SLOT=$SLOT_ENV" "slot env mismatch"
docker exec "$CONTAINER" test -f "$REMOTE_DIR/$ENTRY" \
  || refuse "อิมเมจที่ $CONTAINER รันอยู่ไม่มี $ENTRY ให้ deploy sha ที่มีไฟล์นี้ก่อน" "script not in image"

rc=0
out=$(docker exec -w "$REMOTE_DIR" "$CONTAINER" node "$ENTRY") || rc=$?
printf '%s\n' "$out"
DETAIL=$(printf '%s\n' "$out" | LC_ALL=C grep -E "$SUMMARY_LINE" | tail -1 || true)
DETAIL=${DETAIL#closing-jobs }
[ "$rc" -eq 0 ] || exit 1
