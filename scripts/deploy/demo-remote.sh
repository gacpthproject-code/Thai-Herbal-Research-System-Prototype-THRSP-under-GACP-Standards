#!/usr/bin/env bash
# demo-remote.sh — ฝั่งเครื่อง demo ของ scripts/deploy/demo-*.sh · ไม่รันตรง
# ส่งเข้า `ssh gacp-demo bash -s -- <ขั้น> <sha> [ค่า]` ทาง stdin (scripts/deploy/lib/demo.sh)
# ทุกขั้นของรอบเก็บสถานะใน ~/gacp-build/<sha12>/ และตรวจว่าขั้นก่อนหน้าจบแล้วก่อนเริ่ม
# DIRECT_URL อ่านจาก .env.demo เข้า env ของ process เท่านั้น ไม่อยู่ใน argv และไม่ถูกพิมพ์
set -euo pipefail
die() { echo "หยุด (เครื่อง demo): $*" >&2; exit 1; }

step="${1:-}"; sha="${2:-}"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || die "sha ไม่ใช่ 40 ตัวอักษร"
s12=${sha:0:12}; tag="local-$s12"
# ค่าปริยายคือค่าจริงของเครื่อง demo · ตัวแปรมีไว้ให้ demo-deploy.selftest.sh ชี้ไปที่โฟลเดอร์ชั่วคราว
: "${DEMO_DIR:=/opt/gacp-platform}" "${DEMO_BACKUP_TOOL:=/usr/local/bin/gacp-demo-pg-backup.sh}"
: "${DEMO_BACKUP_DIR:=/var/backups/gacp/demo/scheduled/daily}" "${DEMO_HEALTH_TIMEOUT:=180}" "${DEMO_POLL:=5}"
BE=ghcr.io/jonmaxmore/gacp-backend; FE=ghcr.io/jonmaxmore/gacp-frontend
PROJECT_REF=spbdkellhyndyexljuar
R="$HOME/gacp-build/$s12"

round() { [ "$(cat "$R/SHA" 2>/dev/null)" = "$sha" ] || die "ไม่มีรอบ $s12 บนเครื่อง (รัน demo-ship-source.sh ก่อน)"; }
need() { [ -e "$R/$1" ] || die "$2"; }
scrub() { sed -E 's#(postgres(ql)?://).*@#\1***@#gI'; }
env_value() {
  local n; n=$(grep -cE "^$1=" "$DEMO_DIR/.env.demo" || true)
  [ "$n" -le 1 ] || die "$1 ปรากฏ $n ครั้งใน .env.demo · ตรวจได้ไม่แน่ว่าตัวไหนถูกใช้"
  grep -E "^$1=" "$DEMO_DIR/.env.demo" | cut -d= -f2- | tr -d "\"'" || true
}
# ชี้ project ของ demo: รูปแบบ URL ต้องตรง allowlist ทั้งเส้น ไม่แยกส่วนเอง (การแยกเองถูกเลี่ยงได้สามรอบ:
# / ในส่วนผู้ใช้, host หลายตัวคั่นจุลภาค, ชื่อ parameter ที่ percent-encode เป็น host)
# host ตรงของ project หรือ pooler ของ Supabase ที่ผู้ใช้เป็น postgres.<ref> · port ตัวเดียว · query ได้เฉพาะคีย์ที่รู้จัก
points_at_demo() {
  local user='([A-Za-z0-9._-]+)' pw='([^@/?#%[:space:],]|%[0-9A-Fa-f]{2})+' host='(db\.'"$PROJECT_REF"'\.supabase\.co|[a-z0-9-]+\.pooler\.supabase\.com)'
  local kv='(pgbouncer|sslmode|connection_limit|connect_timeout|pool_timeout|statement_cache_size)=[A-Za-z0-9_.-]+'
  local re="^postgres(ql)?://$user:$pw@$host(:[0-9]{1,5})?/[A-Za-z0-9_-]+(\\?$kv(&$kv)*)?\$"
  [[ "$1" =~ $re ]] || return 1
  [ "${BASH_REMATCH[4]}" = "db.$PROJECT_REF.supabase.co" ] || [ "${BASH_REMATCH[2]}" = "postgres.$PROJECT_REF" ]
}
newest_dump() { ls -1 "$DEMO_BACKUP_DIR"/gacp_*.sql.gz 2>/dev/null | sort | tail -1 || true; }
compose_up() {
  (cd "$DEMO_DIR" && DEMO_IMAGE_TAG="$1" docker compose --env-file .env.demo \
    -f docker-compose.production.yml -f docker-compose.demo.yml up -d --no-deps backend-demo frontend-demo)
}
revision() { docker exec "$1" wget -qO- "$2" 2>/dev/null | grep -o '"revision":"[0-9a-f]*"' | head -1 | cut -d'"' -f4; }
be_rev() { revision gacp-backend-demo http://127.0.0.1:8000/api/health || true; }
fe_rev() { revision gacp-frontend-demo http://127.0.0.1:3000/api/webapp-version || true; }
image_of() { docker inspect -f '{{.Config.Image}}' "$1" 2>/dev/null || true; }
image_id_of() { docker inspect -f '{{.Image}}' "$1" 2>/dev/null || true; }
health_of() { docker inspect -f '{{.State.Health.Status}}' "$1" 2>/dev/null || true; }
src_sum() { sha256sum "$R/src.tar.gz" | cut -d' ' -f1; }

# รอจนทั้งสอง container ใช้ image ของ tag นี้ healthy และ revision ตรง ไม่งั้นหยุดเมื่อครบเวลา
wait_ready() {
  local want_tag="$1" want_be="$2" want_fe="$3" hint="$4" end=$((SECONDS + DEMO_HEALTH_TIMEOUT)) seen
  while :; do
    local bi fi_ bh fh br fr
    bi=$(image_of gacp-backend-demo); fi_=$(image_of gacp-frontend-demo)
    bh=$(health_of gacp-backend-demo); fh=$(health_of gacp-frontend-demo); br=$(be_rev); fr=$(fe_rev)
    seen="backend ${bi##*:} $bh revision ${br:0:12} · frontend ${fi_##*:} $fh revision ${fr:0:12}"
    if [ "$bi" = "$BE:$want_tag" ] && [ "$fi_" = "$FE:$want_tag" ] && [ "$bh" = healthy ] && [ "$fh" = healthy ] \
      && [ "$br" = "$want_be" ] && [ "$fr" = "$want_fe" ]; then
      echo "พร้อม: $seen"; return 0
    fi
    [ "$SECONDS" -lt "$end" ] || die "ไม่ healthy หรือ image/revision ไม่ตรงภายใน ${DEMO_HEALTH_TIMEOUT} วินาที (ต้องการ $want_tag revision ${want_be:0:12}) · ล่าสุด: $seen · $hint"
    sleep "$DEMO_POLL"
  done
}

case "$step" in
  prep)
    mkdir -p "$R"
    if [ -e "$R/SHA" ]; then round; else echo "$sha" > "$R/SHA"; fi ;;

  src-ok)
    round; need src.tar.gz "ไม่มี source ของรอบนี้"
    want="${3:-}"; [[ "$want" =~ ^[0-9a-f]{64}$ ]] || die "sha256 ที่ส่งมาไม่ถูกรูปแบบ"
    gzip -t "$R/src.tar.gz" || die "src.tar.gz เสีย"
    [ "$(src_sum)" = "$want" ] || die "sha256 ของ source บนเครื่องไม่ตรงกับที่ส่ง"
    rm -f "$R/built" "$R/backup.path" "$R/migrated"
    echo "$want" > "$R/src.sha256"; echo "source ตรง: sha256 ${want:0:16}…" ;;

  build)
    round; need src.sha256 "source ของรอบนี้ยังไม่ได้ยืนยัน (รัน demo-ship-source.sh ก่อน)"
    [ "$(src_sum)" = "$(cat "$R/src.sha256")" ] || die "src.tar.gz เปลี่ยนหลังส่ง · ส่งใหม่ด้วย demo-ship-source.sh"
    rm -f "$R/built" "$R/backup.path" "$R/migrated"; rm -rf "$R/src"; mkdir "$R/src"; tar -xzf "$R/src.tar.gz" -C "$R/src"; cd "$R/src"
    ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    build() {
      local name="$1"; shift
      if ! docker build "$@" > "$R/build-$name.log" 2>&1; then tail -20 "$R/build-$name.log" | scrub >&2; die "build $name ล้ม · log เต็มที่ $R/build-$name.log"; fi
      ! grep -q 'were not consumed' "$R/build-$name.log" || die "build $name มี build-arg ที่ Dockerfile ไม่รับ · image ที่ได้จะปิด flag เงียบ ๆ ($R/build-$name.log)"
    }
    build backend -f apps/backend/Dockerfile --build-arg GIT_SHA="$sha" --build-arg BUILT_AT="$ts" -t "$BE:$tag" .
    # ค่า NEXT_PUBLIC_* ถูกฝังตอน build · ส่งผ่าน env (--build-arg แบบไม่มีค่า) เพื่อไม่ให้ URL อยู่ใน argv
    NEXT_PUBLIC_API_URL=https://demo.gacpth.com NEXT_PUBLIC_PWA_ENABLED=false NEXT_PUBLIC_CHECKOUT_UI_ENABLED=true \
      build frontend -f apps/web-app/Dockerfile --build-arg GIT_SHA="$sha" --build-arg BUILT_AT="$ts" \
      --build-arg NEXT_PUBLIC_API_URL --build-arg NEXT_PUBLIC_PWA_ENABLED --build-arg NEXT_PUBLIC_CHECKOUT_UI_ENABLED -t "$FE:$tag" .
    for img in "$BE:$tag" "$FE:$tag"; do
      got=$(docker run --rm --entrypoint sh "$img" -c 'echo "$GIT_SHA"')
      [ "$got" = "$sha" ] || die "$img มี GIT_SHA '${got:0:12}' ไม่ใช่ $s12"
    done
    bash scripts/ops/image-smoke.sh "$BE:$tag" "$R/smoke" > "$R/image-smoke.log" 2>&1 \
      || { tail -20 "$R/image-smoke.log" | scrub >&2; die "image-smoke ไม่ผ่าน · log ที่ $R/image-smoke.log"; }
    touch "$R/built"; echo "build ผ่าน: $BE:$tag และ $FE:$tag · GIT_SHA ตรง · image-smoke ผ่าน" ;;

  backup)
    round; rm -f "$R/backup.path" "$R/migrated"
    # dump ฐานเทียบถูกตรึงครั้งแรกของรอบ · รันซ้ำหลังล้มจึงเทียบกับไฟล์เดิม ไม่ใช่ dump เล็กที่เพิ่งถูกปฏิเสธ
    if [ ! -s "$R/backup.baseline" ]; then
      first=$(newest_dump); [ -n "$first" ] || die "ไม่พบ dump ก่อนหน้าใน $DEMO_BACKUP_DIR ให้เทียบขนาด"
      echo "$first" > "$R/backup.baseline"
    fi
    base=$(cat "$R/backup.baseline"); [ -f "$base" ] || die "dump ที่ใช้เทียบ ($base) หายไปแล้ว"
    base_size=$(stat -c %s "$base"); before=$(newest_dump)
    (cd /tmp && "$DEMO_BACKUP_TOOL") 2>&1 | scrub > "$R/backup.log" || { tail -5 "$R/backup.log" >&2; die "backup ล้ม"; }
    new=$(newest_dump)
    [ -n "$new" ] && [ "$new" != "$before" ] || die "backup ไม่ได้สร้างไฟล์ใหม่ใน $DEMO_BACKUP_DIR"
    reject() { mv "$new" "$new.rejected"; die "$1 · ย้ายไฟล์เป็น $new.rejected"; }
    gunzip -t "$new" 2>/dev/null || reject "gunzip -t ไม่ผ่าน: $new"
    size=$(stat -c %s "$new")
    [ "$size" -ge "$base_size" ] || reject "dump ใหม่ $size ไบต์ เล็กกว่า dump ก่อนหน้า $base_size ไบต์ ($base)"
    echo "$new" > "$R/backup.path"; echo "backup ผ่าน: $new ($size ไบต์ · ก่อนหน้า $base_size ไบต์) · gunzip -t ผ่าน" ;;

  migrate)
    round
    need built "ยังไม่ได้ build รอบนี้ (รัน demo-build.sh ก่อน)"
    need backup.path "ยังไม่มี backup ของรอบนี้ (รัน demo-db-backup.sh ก่อน)"
    rm -f "$R/migrated"
    for name in DIRECT_URL DATABASE_URL; do
      v=$(env_value "$name"); [ -n "$v" ] || die "ไม่มี $name ใน $DEMO_DIR/.env.demo"
      points_at_demo "$v" || die "$name ใน .env.demo ไม่ได้ชี้ project $PROJECT_REF · ไม่แตะฐาน"
    done
    unset v
    DATABASE_URL=$(env_value DIRECT_URL); export DATABASE_URL
    prisma() { docker run --rm -e DATABASE_URL --entrypoint sh "$BE:$tag" -c "cd /app/apps/backend && npx prisma migrate $1" 2>&1 | scrub; }
    st=$(prisma status || true); grep -v 'npm notice' <<<"$st" || true
    grep -Eq 'migrations? found' <<<"$st" || die "migrate status อ่านฐานไม่ได้"
    ! grep -Eq 'P3009|P3018|have failed' <<<"$st" || die "มี migration ที่ล้มค้างบนฐาน · ให้ operator ตัดสิน"
    prisma deploy > "$R/migrate.log" || { tail -20 "$R/migrate.log" | scrub >&2; die "migrate deploy ล้ม · ห้าม up · operator ตัดสิน restore จาก $(cat "$R/backup.path")"; }
    after=$(prisma status || true)
    grep -q 'Database schema is up to date' <<<"$after" || die "หลัง migrate deploy ฐานยังไม่ up to date"
    touch "$R/migrated"; echo "migrate ผ่าน: project $PROJECT_REF up to date ด้วย $BE:$tag" ;;

  up)
    round; need migrated "ยังไม่ได้ migrate รอบนี้ (รัน demo-migrate.sh ก่อน)"
    for img in "$BE:$tag" "$FE:$tag"; do docker image inspect "$img" > /dev/null 2>&1 || die "ไม่มี image $img บนเครื่อง"; done
    bi=$(image_of gacp-backend-demo); fi_=$(image_of gacp-frontend-demo)
    if [ -s "$R/previous-tag" ]; then
      prev=$(cat "$R/previous-tag")
      { [ "$bi" = "$BE:$prev" ] || [ "$bi" = "$BE:$tag" ]; } && { [ "$fi_" = "$FE:$prev" ] || [ "$fi_" = "$FE:$tag" ]; } \
        || die "demo รัน ${bi##*:} / ${fi_##*:} ซึ่งไม่ใช่ previous-tag ($prev) หรือ tag ของรอบนี้ · รอบนี้เก่าแล้ว เริ่มรอบใหม่"
    else
      prev=${bi##*:}
      [ -n "$bi" ] && [ "$bi" = "$BE:$prev" ] && [ "$fi_" = "$FE:$prev" ] \
        || die "backend ($bi) กับ frontend ($fi_) ไม่ได้ใช้ tag เดียวกัน · ย้อนด้วยสคริปต์ไม่ได้ ให้ operator ตัดสิน"
      [ "$prev" != "$tag" ] || die "demo รัน $tag อยู่แล้ว ไม่มี tag ก่อนหน้าให้บันทึก"
      for img in "$BE:$prev" "$FE:$prev"; do docker image inspect "$img" > /dev/null 2>&1 || die "image ก่อนหน้า $img ไม่อยู่บนเครื่อง · ย้อนไม่ได้ ไม่ขึ้น"; done
      br=$(be_rev); fr=$(fe_rev)
      [ -n "$br" ] && [ -n "$fr" ] || die "อ่าน revision ของ $prev ไม่ได้ · rollback จะตรวจ revision ไม่ได้ ไม่ขึ้น"
      echo "$br" > "$R/previous-revision-backend"; echo "$fr" > "$R/previous-revision-frontend"
      image_id_of gacp-backend-demo > "$R/previous-image-backend"; image_id_of gacp-frontend-demo > "$R/previous-image-frontend"
      echo "$prev" > "$R/previous-tag.tmp" && mv "$R/previous-tag.tmp" "$R/previous-tag"
    fi
    echo "previous-tag: $prev"
    compose_up "$tag" > "$R/up.log" 2>&1 || { tail -20 "$R/up.log" | scrub >&2; die "compose up ล้ม · ย้อนด้วย scripts/deploy/demo-rollback.sh $sha"; }
    wait_ready "$tag" "$sha" "$sha" "ย้อนด้วย scripts/deploy/demo-rollback.sh $sha"
    echo "up ผ่าน: demo รัน $tag" ;;

  rollback)
    round; need previous-tag "ไม่มี previous-tag ของรอบ $s12 (demo-up.sh ยังไม่ได้บันทึก) · ย้อนด้วยสคริปต์ไม่ได้"
    prev=$(cat "$R/previous-tag")
    [[ "$prev" =~ ^[A-Za-z0-9._-]+$ ]] || die "previous-tag อ่านไม่ได้"
    bi=$(image_of gacp-backend-demo); fi_=$(image_of gacp-frontend-demo)
    { [ "$bi" = "$BE:$tag" ] || [ "$bi" = "$BE:$prev" ]; } && { [ "$fi_" = "$FE:$tag" ] || [ "$fi_" = "$FE:$prev" ]; } \
      || die "demo รัน ${bi##*:} / ${fi_##*:} ไม่ใช่ tag ของรอบนี้ ($tag) · ย้อนรอบนี้จะข้ามรอบที่ขึ้นทีหลัง ให้ operator ตัดสิน"
    for img in "$BE:$prev" "$FE:$prev"; do docker image inspect "$img" > /dev/null 2>&1 || die "image $img ไม่อยู่บนเครื่องแล้ว"; done
    compose_up "$prev" > "$R/rollback.log" 2>&1 || { tail -20 "$R/rollback.log" | scrub >&2; die "compose up ของ $prev ล้ม · operator ต้องเข้าดูเอง"; }
    wait_ready "$prev" "$(cat "$R/previous-revision-backend")" "$(cat "$R/previous-revision-frontend")" "operator ต้องเข้าดูเอง"
    [ "$(image_id_of gacp-backend-demo)" = "$(cat "$R/previous-image-backend")" ] && [ "$(image_id_of gacp-frontend-demo)" = "$(cat "$R/previous-image-frontend")" ] \
      || die "tag $prev ชี้ image คนละตัวกับที่รันก่อน up · operator ต้องเข้าดูเอง"
    echo "rollback ผ่าน: demo กลับมารัน $prev (image และ revision เดิม) · ฐานไม่ถูกแตะ" ;;

  *) die "ไม่รู้จักขั้น '$step'" ;;
esac
