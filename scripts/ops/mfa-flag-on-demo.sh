#!/usr/bin/env bash
# เปิด REQUIRE_MFA_FOR_PRIVILEGED บน demo (คำสั่ง 86 ข้อ 1 · 105 ข้อ 4)
# การรันเป็น deploy: หลังคำว่า "deploy" เท่านั้น · exit 0 เปิดและตัดแล้ว · 1 backend ไม่ healthy · 2 ปฏิเสธ · 3 overlay ตั้งธงเอง
# ใช้:      bash scripts/ops/mfa-flag-on-demo.sh
# rollback: bash scripts/ops/mfa-flag-on-demo.sh rollback [STAMP]
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib/staff-2fa-host.sh"
MODE=${1:-apply}
s2fa_bind mfa-flag-on-demo.sh demo "$([ "$MODE" = rollback ] && echo flag-on-rollback || echo flag-on)"
case "$MODE" in apply|rollback) ;; *) s2fa_refuse "usage: mfa-flag-on-demo.sh [apply|rollback [STAMP]]" "bad usage";; esac
[ -z "${2:-}" ] || [[ $2 =~ ^[0-9]{8}-[0-9]{6}$ ]] || s2fa_refuse "STAMP must look like 20261020-224500" "bad stamp"
MARKER=$S2FA_STATE_DIR/flag-on.demo.done
[ "$MODE" = rollback ] || [ ! -e "$MARKER" ] \
  || s2fa_refuse "เปิดธงบน demo ไปแล้วเมื่อ $(cat "$MARKER") (UTC) สคริปต์นี้รันได้ครั้งเดียวต่อเครื่อง ถ้าต้องย้อนให้ใช้ rollback" "already applied"
s2fa_container_check
NOTE="$S2FA_EVENT demo tag $S2FA_TAG $(date -u +%Y-%m-%dT%H:%M:%SZ)"

rc=0
s2fa_on_host_stdin "MODE=$MODE STAMP='${2:-}' NOTE='$NOTE' bash -s" <<'REMOTE' || rc=$?
set -euo pipefail
cd /opt/gacp-platform
DC=(docker compose --env-file .env.demo -f docker-compose.production.yml -f docker-compose.demo.yml)
IMAGE=$(docker inspect -f '{{.Config.Image}}' gacp-backend-demo)
TAG=${IMAGE##*:}
[ -n "$TAG" ] && [ "$IMAGE" = "ghcr.io/jonmaxmore/gacp-backend:$TAG" ] || { echo "cannot read the demo backend image tag - stop"; exit 2; }
echo "demo backend runs tag $TAG (same image is kept)"
flag_on_in_container() {
  docker exec gacp-backend-demo node -e 'process.exit(process.env.REQUIRE_MFA_FOR_PRIVILEGED==="true"?0:1)'
}
report() {
  if flag_on_in_container; then echo "REQUIRE_MFA_FOR_PRIVILEGED เปิดแล้ว: ใช่"; else echo "REQUIRE_MFA_FOR_PRIVILEGED เปิดแล้ว: ไม่ใช่"; fi
}
recreate() {
  DEMO_IMAGE_TAG=$TAG "${DC[@]}" up -d --no-deps backend-demo 2>&1 | grep -v 'orphan containers' | tail -3
  s=starting
  for i in $(seq 1 36); do s=$(docker inspect -f '{{.State.Health.Status}}' gacp-backend-demo); [ "$s" = healthy ] && break; sleep 5; done
  echo "backend-demo: $s restarts=$(docker inspect -f '{{.RestartCount}}' gacp-backend-demo)"
  report
  [ "$s" = healthy ]
}
record() {
  docker exec gacp-backend-demo test -f /app/apps/backend/scripts/ops/staff-sessions-revoke-at-flag-on.js \
    || { echo "อิมเมจ tag $TAG ไม่มี scripts/ops/staff-sessions-revoke-at-flag-on.js ให้ deploy sha ที่มีไฟล์นี้ก่อน" >&2; exit 2; }
  docker exec -w /app/apps/backend gacp-backend-demo node scripts/ops/staff-sessions-revoke-at-flag-on.js --event "$1" --note "$NOTE"
}
revoke() {
  flag_on_in_container || { echo "ธงยังอ่านว่าไม่เปิดในคอนเทนเนอร์ จึงไม่ตัด session" >&2; exit 1; }
  record flag-on \
    || { rc=$?; echo "ธงเปิดแล้ว แต่การตัด session ถูกปฏิเสธหรือล้มเหลว (exit $rc) session ที่ออกก่อนหน้านี้ใช้ได้จนหมดอายุ 12 ชั่วโมง" >&2; exit "$rc"; }
}
if [ "$MODE" = rollback ]; then
  oldest_backup() { ls -1tr .env.demo.bak-mfa-* 2>/dev/null | head -1; }
  if [ -n "$STAMP" ]; then B=".env.demo.bak-mfa-$STAMP"; else B=$(oldest_backup); fi
  [ -n "$B" ] && [ -f "$B" ] || { echo "no backup to restore - stop"; exit 2; }
  cp -p "$B" .env.demo
  echo "restored $B"
  recreate || { echo "backend-demo not healthy after rollback"; exit 1; }
  ! flag_on_in_container || { echo "ธงยังอ่านว่าเปิดหลัง rollback" >&2; exit 1; }
  record flag-off \
    || { rc=$?; echo "ย้อนธงแล้ว แต่บันทึกการย้อนธงในฐานข้อมูลไม่สำเร็จ (exit $rc) marker ยังอยู่ ให้รัน rollback ซ้ำ" >&2; exit "$rc"; }
  exit 0
fi
grep -q 'REQUIRE_MFA_FOR_PRIVILEGED=' docker-compose.demo.yml && { echo "docker-compose.demo.yml names the flag itself (environment beats env_file) - stop, edit the overlay first"; exit 3; } || true
if grep -qx 'REQUIRE_MFA_FOR_PRIVILEGED=true' .env.demo && [ "$(grep -c '^REQUIRE_MFA_FOR_PRIVILEGED=' .env.demo)" = 1 ]; then
  echo ".env.demo already turns the flag on: nothing backed up or edited"
  flag_on_in_container || recreate || { echo "backend-demo not healthy"; exit 1; }
  revoke
  exit 0
fi
TS=$(date +%Y%m%d-%H%M%S)
cp -p .env.demo ".env.demo.bak-mfa-$TS"
echo "backup .env.demo.bak-mfa-$TS ($(stat -c '%a %U' ".env.demo.bak-mfa-$TS"))"
echo "env lines naming the flag before: $(grep -c '^REQUIRE_MFA_FOR_PRIVILEGED=' .env.demo || true)"
if grep -q '^REQUIRE_MFA_FOR_PRIVILEGED=' .env.demo; then
  sed -i 's/^REQUIRE_MFA_FOR_PRIVILEGED=.*/REQUIRE_MFA_FOR_PRIVILEGED=true/' .env.demo
else
  [ -z "$(tail -c1 .env.demo)" ] || printf '\n' >> .env.demo
  printf 'REQUIRE_MFA_FOR_PRIVILEGED=true\n' >> .env.demo
fi
echo "env lines naming the flag after: $(grep -c '^REQUIRE_MFA_FOR_PRIVILEGED=' .env.demo)"
"${DC[@]}" config -q && echo "compose config valid"
recreate || { echo "backend-demo not healthy"; exit 1; }
revoke
REMOTE
echo "public: $(curl -s -o /dev/null -w '%{http_code}' --max-time 10 https://demo.gacpth.com/api/health)"
if [ "$rc" = 0 ]; then
  if [ "$MODE" = rollback ]; then rm -f "$MARKER"; S2FA_DETAIL="tag=$S2FA_TAG marker=removed"
  else date -u +%Y-%m-%dT%H:%M:%SZ > "$MARKER"; chmod 0600 "$MARKER"; S2FA_DETAIL="tag=$S2FA_TAG marker=written"; fi
fi
exit "$rc"
