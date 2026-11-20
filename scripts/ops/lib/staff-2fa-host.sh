#!/usr/bin/env bash
# คำสั่ง 105 ข้อ 4

S2FA_HOSTS="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/staff-2fa-hosts.tsv"
S2FA_STATE_DIR=/home/ubuntu/work/state/ops/staff-2fa
S2FA_PLATFORM_DIR=/opt/gacp-platform
S2FA_LOG=$S2FA_STATE_DIR/runs.log
S2FA_SSH_KEY=/home/ubuntu/.ssh/id_ed25519_newhost
S2FA_REMOTE_DIR=/app/apps/backend
S2FA_DETAIL=

s2fa_log() {
  mkdir -p "$S2FA_STATE_DIR"
  [ -e "$S2FA_LOG" ] || install -m 0600 /dev/null "$S2FA_LOG"
  chmod 0600 "$S2FA_LOG"
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$S2FA_SCRIPT" "$(hostname)" "${S2FA_SLOT:-?}" "$S2FA_EVENT" "$1" "$2" >> "$S2FA_LOG"
}

s2fa_exit_log() {
  local rc=$? outcome
  case $rc in 0) outcome=done;; 2) outcome=refused;; *) outcome=failed;; esac
  s2fa_log "$outcome" "exit=$rc${S2FA_DETAIL:+ $S2FA_DETAIL}"
}

s2fa_refuse() {
  [ -n "${S2FA_SCRIPT:-}" ] || { echo "s2fa_bind must run before s2fa_refuse" >&2; exit 70; }
  echo "$1" >&2
  S2FA_DETAIL=$2
  exit 2
}

s2fa_bind() {
  S2FA_SCRIPT=$1; S2FA_SLOT=; S2FA_EVENT=$3
  local row
  row=$(S2FA_WANT=${2:-} awk -F'\t' '!/^#/ && NF && $1==ENVIRON["S2FA_WANT"]' "$S2FA_HOSTS")
  [ -z "$row" ] || IFS=$'\t' read -r S2FA_SLOT S2FA_RUN_FROM S2FA_REACH S2FA_CONTAINER S2FA_SLOT_ENV <<< "$row"
  s2fa_log start - 2>/dev/null || { echo "เขียน $S2FA_LOG ไม่ได้ จึงไม่เริ่มงาน" >&2; exit 1; }
  trap s2fa_exit_log EXIT
  [ -n "$row" ] || s2fa_refuse "ไม่รู้จัก slot '${2:-}' (ใช้ได้: $(awk -F'\t' '!/^#/ && NF {print $1}' "$S2FA_HOSTS" | tr '\n' ' '))" "unknown slot"
  [ "$(hostname)" = "$S2FA_RUN_FROM" ] || s2fa_refuse "สคริปต์นี้สำหรับ $S2FA_SLOT รันได้เฉพาะบนเครื่อง $S2FA_RUN_FROM (เครื่องนี้คือ $(hostname))" "wrong host"
}

s2fa_on_host() {
  case "$S2FA_REACH" in
    local) "$@";;
    "ssh "*) ssh -i "$S2FA_SSH_KEY" -o IdentitiesOnly=yes "${S2FA_REACH#ssh }" "echo $(printf '%q ' "$@" | base64 -w0) | base64 -d | bash";;
  esac
}

s2fa_on_host_stdin() {
  case "$S2FA_REACH" in
    local) "$@";;
    "ssh "*) ssh -i "$S2FA_SSH_KEY" -o IdentitiesOnly=yes "${S2FA_REACH#ssh }" "$*";;
  esac
}

s2fa_container_check() {
  s2fa_on_host docker ps --filter "name=^${S2FA_CONTAINER}\$" --filter status=running -q | grep -q . \
    || s2fa_refuse "ไม่พบคอนเทนเนอร์ $S2FA_CONTAINER ที่กำลังทำงานบน $S2FA_SLOT" "container not running"
  if [ "$S2FA_SLOT_ENV" != - ]; then
    s2fa_on_host docker exec "$S2FA_CONTAINER" node -e "process.exit(process.env.GACP_DEPLOY_SLOT==='$S2FA_SLOT_ENV'?0:1)" \
      || s2fa_refuse "คอนเทนเนอร์ $S2FA_CONTAINER ไม่ได้ประกาศ GACP_DEPLOY_SLOT=$S2FA_SLOT_ENV" "slot env mismatch"
  fi
  S2FA_IMAGE=$(s2fa_on_host docker inspect -f '{{.Config.Image}}' "$S2FA_CONTAINER")
  S2FA_TAG=${S2FA_IMAGE##*:}
  [ -n "$S2FA_TAG" ] && [ "$S2FA_IMAGE" = "ghcr.io/jonmaxmore/gacp-backend:$S2FA_TAG" ] \
    || s2fa_refuse "อ่าน tag ของอิมเมจ $S2FA_CONTAINER ไม่ได้" "image tag unreadable"
  echo "$S2FA_CONTAINER on $S2FA_SLOT runs image tag $S2FA_TAG"
}

s2fa_node_script() {
  s2fa_on_host docker exec "$S2FA_CONTAINER" test -f "$S2FA_REMOTE_DIR/scripts/ops/$1" \
    || s2fa_refuse "อิมเมจ tag $S2FA_TAG ที่ $S2FA_CONTAINER รันอยู่ไม่มี scripts/ops/$1 ให้ deploy sha ที่มีไฟล์นี้ก่อน (สคริปต์ไม่คัดลอกโค้ดจาก checkout)" "script not in image"
  s2fa_on_host docker exec -w "$S2FA_REMOTE_DIR" "$S2FA_CONTAINER" node "scripts/ops/$1" "${@:2}"
}
