#!/usr/bin/env bash
# เปิด REQUIRE_MFA_FOR_PRIVILEGED บน staging (คำสั่ง 86 ข้อ 1 · 105 ข้อ 4)
# การรันเป็น deploy: หลังคำว่า "deploy" เท่านั้น · exit 0 เปิดและตัดแล้ว · 1 backend ไม่ healthy · 2 ปฏิเสธ (ดู stderr)
# ใช้:      bash scripts/ops/mfa-flag-on-staging.sh
# rollback: bash scripts/ops/mfa-flag-on-staging.sh rollback [STAMP]
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib/staff-2fa-host.sh"
MODE=${1:-apply}
s2fa_bind mfa-flag-on-staging.sh staging "$([ "$MODE" = rollback ] && echo flag-on-rollback || echo flag-on)"
case "$MODE" in apply|rollback) ;; *) s2fa_refuse "usage: mfa-flag-on-staging.sh [apply|rollback [STAMP]]" "bad usage";; esac
[ -z "${2:-}" ] || [[ $2 =~ ^[0-9]{8}-[0-9]{6}$ ]] || s2fa_refuse "STAMP must look like 20261020-224500" "bad stamp"
MARKER=$S2FA_STATE_DIR/flag-on.staging.done
cd "$S2FA_PLATFORM_DIR"
s2fa_container_check
TAG=$S2FA_TAG
DC=(docker compose --env-file .env.staging -f docker-compose.production.yml -f docker-compose.staging.yml)
OVERLAY_HARDCODED_FALSE='^ *- REQUIRE_MFA_FOR_PRIVILEGED=false *$'
oldest_backup() { ls -1tr "$1".bak-mfa-* 2>/dev/null | head -1; }

flag_on_in_container() {
  docker exec gacp-backend-staging node -e 'process.exit(process.env.REQUIRE_MFA_FOR_PRIVILEGED==="true"?0:1)'
}
report() {
  if flag_on_in_container; then echo "REQUIRE_MFA_FOR_PRIVILEGED เปิดแล้ว: ใช่"; else echo "REQUIRE_MFA_FOR_PRIVILEGED เปิดแล้ว: ไม่ใช่"; fi
}
recreate() {
  STAGING_IMAGE_TAG=$TAG "${DC[@]}" up -d --no-deps backend-staging 2>&1 | grep -v 'orphan containers' | tail -3
  s=starting
  for i in $(seq 1 36); do s=$(docker inspect -f '{{.State.Health.Status}}' gacp-backend-staging); [ "$s" = healthy ] && break; sleep 5; done
  echo "backend-staging: $s restarts=$(docker inspect -f '{{.RestartCount}}' gacp-backend-staging)"
  report
  [ "$s" = healthy ]
}
files_turn_it_on() {
  grep -qx 'REQUIRE_MFA_FOR_PRIVILEGED=true' .env.staging \
    && [ "$(grep -c '^REQUIRE_MFA_FOR_PRIVILEGED=' .env.staging)" = 1 ] \
    && ! grep -q "$OVERLAY_HARDCODED_FALSE" docker-compose.staging.yml \
    && grep -q 'REQUIRE_MFA_FOR_PRIVILEGED=\${REQUIRE_MFA_FOR_PRIVILEGED' docker-compose.staging.yml
}
record() {
  s2fa_node_script staff-sessions-revoke-at-flag-on.js --event "$1" --note "$S2FA_EVENT staging tag $TAG $(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
revoke_then_mark() {
  flag_on_in_container || { echo "ธงยังอ่านว่าไม่เปิดในคอนเทนเนอร์ จึงไม่ตัด session" >&2; exit 1; }
  record flag-on \
    || { rc=$?; echo "ธงเปิดแล้ว แต่การตัด session ถูกปฏิเสธหรือล้มเหลว (exit $rc) session ที่ออกก่อนหน้านี้ใช้ได้จนหมดอายุ 12 ชั่วโมง" >&2; exit "$rc"; }
  date -u +%Y-%m-%dT%H:%M:%SZ > "$MARKER"
  chmod 0600 "$MARKER"
  S2FA_DETAIL="tag=$TAG marker=written"
}

if [ "$MODE" = rollback ]; then
  if [ -n "${2:-}" ]; then
    E=".env.staging.bak-mfa-$2"; O="docker-compose.staging.yml.bak-mfa-$2"
  else
    E=$(oldest_backup .env.staging); O=$(oldest_backup docker-compose.staging.yml)
  fi
  [ -n "$E" ] && [ -f "$E" ] && [ -n "$O" ] && [ -f "$O" ] || s2fa_refuse "no backup pair to restore - stop" "no backup pair"
  cp -p "$E" .env.staging
  sudo install -m 0644 -o root -g root "$O" docker-compose.staging.yml
  echo "restored $E and $O"
  recreate || { echo "backend-staging not healthy after rollback"; exit 1; }
  ! flag_on_in_container || { echo "ธงยังอ่านว่าเปิดหลัง rollback" >&2; exit 1; }
  record flag-off \
    || { rc=$?; echo "ย้อนธงแล้ว แต่บันทึกการย้อนธงในฐานข้อมูลไม่สำเร็จ (exit $rc) marker ยังอยู่ ให้รัน rollback ซ้ำ" >&2; exit "$rc"; }
  rm -f "$MARKER"
  S2FA_DETAIL="tag=$TAG marker=removed"
  exit 0
fi

[ ! -e "$MARKER" ] || s2fa_refuse "เปิดธงบน staging ไปแล้วเมื่อ $(cat "$MARKER") (UTC) สคริปต์นี้รันได้ครั้งเดียวต่อเครื่อง ถ้าต้องย้อนให้ใช้ rollback" "already applied"

if files_turn_it_on; then
  echo "files already turn the flag on: nothing backed up or edited"
  flag_on_in_container || recreate || { echo "backend-staging not healthy"; exit 1; }
  revoke_then_mark
  exit 0
fi

TS=$(date +%Y%m%d-%H%M%S)
cp -p .env.staging ".env.staging.bak-mfa-$TS"
sudo cp -p docker-compose.staging.yml "docker-compose.staging.yml.bak-mfa-$TS"
stat -c '%a %U %n' ".env.staging.bak-mfa-$TS" "docker-compose.staging.yml.bak-mfa-$TS"

echo "env lines naming the flag before: $(grep -c '^REQUIRE_MFA_FOR_PRIVILEGED=' .env.staging || true)"
if grep -q '^REQUIRE_MFA_FOR_PRIVILEGED=' .env.staging; then
  sed -i 's/^REQUIRE_MFA_FOR_PRIVILEGED=.*/REQUIRE_MFA_FOR_PRIVILEGED=true/' .env.staging
else
  [ -z "$(tail -c1 .env.staging)" ] || printf '\n' >> .env.staging
  printf 'REQUIRE_MFA_FOR_PRIVILEGED=true\n' >> .env.staging
fi
echo "env lines naming the flag after: $(grep -c '^REQUIRE_MFA_FOR_PRIVILEGED=' .env.staging)"
stat -c '%a %U %n' .env.staging

echo "overlay literal lines before: $(grep -c "$OVERLAY_HARDCODED_FALSE" docker-compose.staging.yml || true)"
if grep -q "$OVERLAY_HARDCODED_FALSE" docker-compose.staging.yml; then
  T=$(mktemp); sed 's/^\( *\)- REQUIRE_MFA_FOR_PRIVILEGED=false *$/\1- REQUIRE_MFA_FOR_PRIVILEGED=${REQUIRE_MFA_FOR_PRIVILEGED:-false}/' docker-compose.staging.yml > "$T"
  sudo install -m 0644 -o root -g root "$T" docker-compose.staging.yml; rm -f "$T"
fi
echo "overlay literal lines after: $(grep -c "$OVERLAY_HARDCODED_FALSE" docker-compose.staging.yml || true)"
echo "overlay forwards the flag: $(grep -q 'REQUIRE_MFA_FOR_PRIVILEGED=\${REQUIRE_MFA_FOR_PRIVILEGED' docker-compose.staging.yml && echo yes || echo no)"
"${DC[@]}" config -q && echo "compose config valid"
recreate || { echo "backend-staging not healthy"; exit 1; }
revoke_then_mark
