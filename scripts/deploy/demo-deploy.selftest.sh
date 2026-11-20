#!/usr/bin/env bash
# selftest ของ scripts/deploy/demo-*.sh (runbook deploy-demo.md)
# วาง ssh scp docker git ปลอมไว้หน้า PATH: ssh ปลอมรัน demo-remote.sh ในเครื่องนี้ด้วย HOME ชั่วคราว (ตรรกะฝั่งเครื่องถูกรันจริง)
# docker ปลอมจำ image/container ในโฟลเดอร์ state · git ปลอมบันทึกแล้วเรียก git จริงบน repo ชั่วคราว
# ตรวจ: ลำดับคำสั่ง · ทุกทางที่ต้องหยุด · ค่าลับและ URL ฐานข้อมูลไม่หลุดเข้า argv หรือ output
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
REAL_GIT="$(command -v git)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/home" "$T/state" "$T/out" "$T/demo" "$T/dumps"
export FAKE_LOG="$T/log" FAKE_STATE="$T/state" FAKE_HOME="$T/home"
: > "$FAKE_LOG"
# ค่าปลอมสำหรับจับการรั่ว ประกอบตอนรันเพื่อไม่ให้ gitleaks อ่านเป็นคีย์ในซอร์ส · ค่าที่ได้ยังเป็นสตริงเดิมทุกตัวอักษร
SECRET_PW="$(printf '%s' S3cr3t Pw DoNotLeak)"
REF=spbdkellhyndyexljuar
BE=ghcr.io/jonmaxmore/gacp-backend; FE=ghcr.io/jonmaxmore/gacp-frontend
PREV_SHA=b8d27a690aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; PREV_TAG=local-${PREV_SHA:0:12}

cat > "$T/bin/ssh" <<'SH'
#!/usr/bin/env bash
echo "ssh $*" >> "$FAKE_LOG"
while [ "${1:-}" = -o ]; do shift 2; done
[ "${1:-}" = gacp-demo ] || { echo "fake ssh: unexpected host ${1:-}" >&2; exit 255; }
shift; cd "$FAKE_HOME" && HOME="$FAKE_HOME" exec "$@"
SH
cat > "$T/bin/scp" <<'SH'
#!/usr/bin/env bash
echo "scp $*" >> "$FAKE_LOG"
src="${@: -2:1}"; dst="${@: -1}"
case "$dst" in gacp-demo:*) cp "$src" "$FAKE_HOME/${dst#gacp-demo:}" ;; *) exit 1 ;; esac
SH
cat > "$T/bin/git" <<SH
#!/usr/bin/env bash
echo "git \$*" >> "\$FAKE_LOG"
exec "$REAL_GIT" "\$@"
SH
cat > "$T/bin/docker" <<'SH'
#!/usr/bin/env bash
echo "docker $*" >> "$FAKE_LOG"
S="$FAKE_STATE"; all="$*"
case "$1" in
  build)
    tag=""; prev=""; for a in "$@"; do [ "$prev" = -t ] && tag="$a"; prev="$a"; done
    echo "$tag" >> "$S/images"
    case "$all" in *apps/web-app*) echo "${NEXT_PUBLIC_API_URL:-unset}" > "$S/frontend-api-url" ;; esac
    [ -z "${FAKE_BUILD_WARN:-}" ] || echo "[Warning] One or more build-args [X] were not consumed"
    echo "naming to $tag done" ;;
  image) grep -qxF "${@: -1}" "$S/images" 2>/dev/null ;;
  run)
    case "$all" in
      *GIT_SHA*) cat "$S/image-git-sha" ;;
      *"prisma migrate status"*)
        [ "${DATABASE_URL:-}" = "$(cat "$S/expected-db-url")" ] || { echo "fake prisma: DATABASE_URL not received"; exit 1; }
        echo "Datasource db: connecting with $DATABASE_URL"; echo "retry ${DATABASE_URL/postgresql/PostgreSQL}"; echo "as typed postgresql://u:x@${FAKE_TOOL_PW}@h/db"; echo "spaced postgresql://u:pa ${FAKE_TOOL_PW}@h/db"
        if [ -e "$S/migrated" ]; then echo "2 migrations found in prisma/migrations"; echo "Database schema is up to date!"
        else echo "2 migrations found in prisma/migrations"; echo "Following migrations have not yet been applied:"; echo "20261105120000_user_consent_events"; exit 1; fi ;;
      *"prisma migrate deploy"*) touch "$S/migrated"; echo "All migrations have been successfully applied." ;;
      *) echo "fake docker: unknown run" >&2; exit 1 ;;
    esac ;;
  inspect)
    c="${@: -1}"
    case "$all" in
      *Config.Image*) cat "$S/image-$c" ;;
      *"{{.Image}}"*) echo "id-$(cat "$S/image-$c")${FAKE_ID_SUFFIX:-}" ;;
      *Health.Status*) echo "${FAKE_HEALTH:-healthy}" ;;
    esac ;;
  exec) printf '{"status":"ok","revision":"%s"}\n' "$(cat "$S/rev-$2")" ;;
  compose)
    tag="${FAKE_STUCK_TAG:-${DEMO_IMAGE_TAG:?}}"
    echo "$BE_IMG:$tag" > "$S/image-gacp-backend-demo"; echo "$FE_IMG:$tag" > "$S/image-gacp-frontend-demo"
    rev="${FAKE_STUCK_REV:-$(cat "$S/tagrev-$tag")}"
    echo "${FAKE_STUCK_BE_REV:-$rev}" > "$S/rev-gacp-backend-demo"; echo "$rev" > "$S/rev-gacp-frontend-demo" ;;
  *) echo "fake docker: unknown $1" >&2; exit 1 ;;
esac
SH
cat > "$T/bin/gacp-demo-pg-backup.sh" <<'SH'
#!/usr/bin/env bash
echo "backup-tool" >> "$FAKE_LOG"
n=$(ls "$DEMO_BACKUP_DIR" | wc -l)
head -c "${FAKE_DUMP_BYTES:-5000}" /dev/urandom | gzip -1 > "$DEMO_BACKUP_DIR/gacp_20261108_0000$((n + 10)).sql.gz"
echo "Backup of postgresql://postgres.x:${FAKE_TOOL_PW:-pw}@host/db complete"
SH
chmod +x "$T/bin/"*
export BE_IMG=$BE FE_IMG=$FE
export FAKE_TOOL_PW="$SECRET_PW" PATH="$T/bin:$PATH" DEMO_DIR="$T/demo" DEMO_BACKUP_TOOL="$T/bin/gacp-demo-pg-backup.sh" DEMO_BACKUP_DIR="$T/dumps" DEMO_HEALTH_TIMEOUT=2 DEMO_POLL=0.2
URL_OK="postgresql://postgres.$REF:$SECRET_PW@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"
URL_OTHER="postgresql://postgres:$SECRET_PW@db.otherprojectref000000.supabase.co:5432/postgres"
env_demo() { printf 'NODE_ENV=production\nDATABASE_URL="%s"\nDIRECT_URL="%s"\n' "${2:-$1}" "$1" > "$T/demo/.env.demo"; echo "$1" > "$T/state/expected-db-url"; }
env_demo "$URL_OK"
head -c 3000 /dev/urandom | gzip -1 > "$T/dumps/gacp_20261107_022300.sql.gz"
reset_demo() {
  echo "$BE:$PREV_TAG" > "$T/state/image-gacp-backend-demo"; echo "$FE:$PREV_TAG" > "$T/state/image-gacp-frontend-demo"
  echo "$PREV_SHA" > "$T/state/rev-gacp-backend-demo"; echo "$PREV_SHA" > "$T/state/rev-gacp-frontend-demo"
  echo "$PREV_SHA" > "$T/state/tagrev-$PREV_TAG"; echo "$BE:$PREV_TAG" >> "$T/state/images"; echo "$FE:$PREV_TAG" >> "$T/state/images"
}
reset_demo

# repo ชั่วคราว: c0 → c1 (โค้ด) → c2 (attestation ของ c0 และ c1 ใต้ evidence/ เท่านั้น)
R="$T/repo"; mkdir -p "$R/scripts/ops" "$R/apps" "$R/evidence/gate/fails"
g() { "$REAL_GIT" -C "$R" "$@"; }
g init -q -b main && g config user.email t@t && g config user.name t
cp "$REPO_ROOT/scripts/ops/gate-compare.js" "$R/scripts/ops/"
mkdir -p "$R/scripts/deploy/lib"; for f in "$HERE"/demo-*.sh; do [[ "$f" == *selftest* ]] || cp "$f" "$R/scripts/deploy/"; done; cp "$HERE/lib/demo.sh" "$R/scripts/deploy/lib/"
printf '#!/usr/bin/env bash\necho "image-smoke $1" >> "$FAKE_LOG"\necho "image-smoke: PASS"\n' > "$R/scripts/ops/image-smoke.sh"
echo 1 > "$R/apps/x.txt"; echo r > "$R/README"; g add -A && g commit -qm c0; C0=$(g rev-parse HEAD)
echo 2 > "$R/apps/x.txt"; g commit -qam c1; C1=$(g rev-parse HEAD)
attest() { # sha status
  printf '{"sha":"%s","timestamp_utc":"2026-11-08T00:00:00Z","dirty":false,"dry_run":false,"checks":[{"id":"suite-green","status":"%s","required":true}]}\n' "$1" "$2" > "$R/evidence/gate/$1.json"
  { echo "# failing tests at $1 (gate-compare --write-fails, 2026-11-08T00:01:00.000Z)"; [ "$2" = pass ] || printf 'suite-green\tA › breaks\n'; } > "$R/evidence/gate/fails/$1.txt"
}
attest "$C0" pass; attest "$C1" pass; g add -A && g commit -qm c2; C2=$(g rev-parse HEAD)
"$REAL_GIT" clone -q --bare "$R" "$T/origin.git"; g remote add origin "$T/origin.git"; g fetch -q origin
echo "$C2" > "$T/state/image-git-sha"; echo "$C2" > "$T/state/tagrev-local-${C2:0:12}"

BAD=0
# run <name> <want-exit> <cmd...> · output → $T/out/<name>
run() {
  local name="$1" want="$2"; shift 2
  (cd "$R" && "$@") > "$T/out/$name" 2>&1; local got=$?
  if [ "$got" = "$want" ]; then echo "--- $name → exit $got"; else echo "*** $name: exit $got, want $want"; sed 's/^/    /' "$T/out/$name" | tail -15; BAD=$((BAD + 1)); fi
}
says() { grep -qF -- "$2" "$T/out/$1" || { echo "*** $1: output does not say '$2'"; sed 's/^/    /' "$T/out/$1" | tail -8; BAD=$((BAD + 1)); }; }
in_order() { # patterns must appear in the log in this order
  local from=0 p n
  for p in "$@"; do
    n=$(awk -v f="$from" -v p="$p" 'NR > f && index($0, p) { print NR; exit }' "$FAKE_LOG")
    [ -n "$n" ] || { echo "*** order: '$p' not found after log line $from"; BAD=$((BAD + 1)); return; }
    from=$n
  done
}
mark() { wc -l < "$FAKE_LOG"; }
since() { tail -n +"$(( $1 + 1 ))" "$FAKE_LOG"; }
D="$R/scripts/deploy"

# ── ทางปกติทั้งเส้น ──────────────────────────────────────────────────────────
run precheck-ok 0 bash "$D/demo-precheck.sh" "$C2"
says precheck-ok "${C1:0:12}"
run ship-ok 0 bash "$D/demo-ship-source.sh" "$C2"
run build-ok 0 bash "$D/demo-build.sh" "$C2"
run backup-ok 0 bash "$D/demo-db-backup.sh" "$C2"
run migrate-ok 0 bash "$D/demo-migrate.sh" "$C2"
run up-ok 0 bash "$D/demo-up.sh" "$C2"
in_order "git fetch" "git rev-list" "git archive $C2 evidence/gate" \
  "git archive --format=tar.gz" "ssh -o BatchMode=yes gacp-demo bash -s -- prep $C2" "scp " "bash -s -- src-ok $C2" \
  "bash -s -- build $C2" "docker build -f apps/backend/Dockerfile" "docker build -f apps/web-app/Dockerfile" \
  "docker run --rm --entrypoint sh $BE:local-${C2:0:12}" "docker run --rm --entrypoint sh $FE:local-${C2:0:12}" "image-smoke $BE:local-${C2:0:12}" \
  "bash -s -- backup $C2" "backup-tool" \
  "bash -s -- migrate $C2" "prisma migrate status" "prisma migrate deploy" "prisma migrate status" \
  "bash -s -- up $C2" "docker inspect -f {{.Config.Image}} gacp-backend-demo" "docker compose --env-file .env.demo" "Health.Status"
[ "$(cat "$T/home/gacp-build/${C2:0:12}/previous-tag")" = "$PREV_TAG" ] || { echo "*** previous-tag not recorded as $PREV_TAG"; BAD=$((BAD + 1)); }
[ "$(cat "$T/state/frontend-api-url")" = "https://demo.gacpth.com" ] || { echo "*** frontend not built with the demo API URL"; BAD=$((BAD + 1)); }
grep -q "^docker compose" "$FAKE_LOG" || { echo "*** compose never ran"; BAD=$((BAD + 1)); }
if grep "^docker compose" "$FAKE_LOG" | grep -v -- "up -d --no-deps backend-demo frontend-demo$" | grep -q .; then echo "*** a compose call was not 'up -d --no-deps backend-demo frontend-demo'"; BAD=$((BAD + 1)); fi
! grep -q -- "--remove-orphans" "$FAKE_LOG" || { echo "*** --remove-orphans used"; BAD=$((BAD + 1)); }
says up-ok "$PREV_TAG"
says migrate-ok "postgresql://***@"

# rerun ของ up หลังสำเร็จ: ไม่เขียน previous-tag ทับด้วย tag ใหม่
run up-again 0 bash "$D/demo-up.sh" "$C2"
[ "$(cat "$T/home/gacp-build/${C2:0:12}/previous-tag")" = "$PREV_TAG" ] || { echo "*** a second up overwrote previous-tag"; BAD=$((BAD + 1)); }

# ── rollback ────────────────────────────────────────────────────────────────
m=$(mark)
run rollback-ok 0 bash "$D/demo-rollback.sh" "$C2"
since "$m" | grep -q "^docker compose" || { echo "*** rollback did not run compose"; BAD=$((BAD + 1)); }
[ "$(cat "$T/state/image-gacp-backend-demo")" = "$BE:$PREV_TAG" ] && [ "$(cat "$T/state/rev-gacp-frontend-demo")" = "$PREV_SHA" ] \
  || { echo "*** rollback did not bring $PREV_TAG back"; BAD=$((BAD + 1)); }
FAKE_STUCK_REV=$C2 run rollback-revision-mismatch 1 bash "$D/demo-rollback.sh" "$C2"
says rollback-revision-mismatch "revision"

# ── ทางที่ต้องหยุด ──────────────────────────────────────────────────────────
m=$(mark)
run arg-not-a-sha 1 bash "$D/demo-build.sh" "https://example.invalid/x"
says arg-not-a-sha "sha"
run arg-missing 1 bash "$D/demo-up.sh"
run arg-extra 1 bash "$D/demo-migrate.sh" "$C2" extra
! since "$m" | grep -q "^ssh" || { echo "*** a bad argument still reached ssh"; BAD=$((BAD + 1)); }

run precheck-wrong-sha 1 bash "$D/demo-precheck.sh" "$C1"
says precheck-wrong-sha "origin/main"
m=$(mark)
run ship-wrong-sha 1 bash "$D/demo-ship-source.sh" "$C1"
! since "$m" | grep -q "^scp" || { echo "*** ship sent a sha that is not origin/main"; BAD=$((BAD + 1)); }

echo "# local edit" >> "$R/scripts/deploy/demo-up.sh"
m=$(mark)
run up-dirty-wrapper 1 bash "$D/demo-up.sh" "$C2"
says up-dirty-wrapper "scripts/deploy"
! since "$m" | grep -q "^ssh" || { echo "*** an edited wrapper still reached ssh"; BAD=$((BAD + 1)); }
"$REAL_GIT" clone -q "$R" "$T/clean"
echo "# local edit" >> "$R/scripts/deploy/demo-up.sh"
(cd "$T/clean" && bash "$D/demo-up.sh" "$C2") > "$T/out/up-dirty-wrapper-from-clean-cwd" 2>&1 && { echo "*** an edited wrapper passed when run from a clean checkout's cwd"; BAD=$((BAD + 1)); }
g checkout -q -- scripts/deploy/demo-up.sh
echo 'echo planted' > "$R/scripts/deploy/lib/planted.sh"
run up-untracked-file 1 bash "$D/demo-up.sh" "$C2"
says up-untracked-file "scripts/deploy"
rm -f "$R/scripts/deploy/lib/planted.sh"
echo "# local edit" >> "$R/scripts/deploy/demo-remote.sh"
run precheck-dirty-scripts 1 bash "$D/demo-precheck.sh" "$C2"
says precheck-dirty-scripts "scripts/"
g checkout -q -- scripts/deploy/demo-remote.sh

echo r2 > "$R/README"; g commit -qam c3; C3=$(g rev-parse HEAD); g push -q origin main
run precheck-non-evidence-diff 1 bash "$D/demo-precheck.sh" "$C3"
says precheck-non-evidence-diff "README"

g rm -rq evidence/gate && g commit -qm c4; C4=$(g rev-parse HEAD); g push -q origin main
run precheck-no-attestation 1 bash "$D/demo-precheck.sh" "$C4"
says precheck-no-attestation "attestation"

g reset -q --hard "$C2"; g mv apps/x.txt evidence/x.txt && g commit -qm c4b; g push -q -f origin main
run precheck-rename-into-evidence 1 bash "$D/demo-precheck.sh" "$(g rev-parse HEAD)"
says precheck-rename-into-evidence "apps/x.txt"

g reset -q --hard "$C2"
for c in "$C0" "$C1"; do
  printf '{"sha":"%s","timestamp_utc":"2026-11-08T00:00:00Z","dirty":false,"dry_run":false,"checks":[{"id":"suite-green","status":"pass","required":true},{"id":"deploy-drift","status":"fail","required":true}]}\n' "$c" > "$R/evidence/gate/$c.json"
  printf '# failing tests at %s (gate-compare --write-fails, 2026-11-08T00:01:00.000Z)\ndeploy-drift\t[check failed — no test names in log]\n' "$c" > "$R/evidence/gate/fails/$c.txt"
done
g add -A && g commit -qm c6; g push -q -f origin main
run precheck-unproven 0 bash "$D/demo-precheck.sh" "$(g rev-parse HEAD)"
says precheck-unproven "UNPROVEN"
says precheck-unproven "deploy-drift"

g reset -q --hard "$C2"; attest "$C1" fail; g add -A && g commit -qm c5; C5=$(g rev-parse HEAD); g push -q -f origin main
run precheck-new-failures 1 bash "$D/demo-precheck.sh" "$C5"
says precheck-new-failures "NEW-FAILURES"

R12="$T/home/gacp-build/${C2:0:12}"
FAKE_DUMP_BYTES=10 run backup-too-small 1 bash "$D/demo-db-backup.sh" "$C2"
says backup-too-small "เล็กกว่า"
ls "$T/dumps" | grep -q 'rejected$' || { echo "*** the too-small dump was not set aside"; BAD=$((BAD + 1)); }
FAKE_DUMP_BYTES=10 run backup-too-small-again 1 bash "$D/demo-db-backup.sh" "$C2"
says backup-too-small-again "เล็กกว่า"
head -c 50 /dev/urandom | gzip -1 > "$T/dumps/gacp_20261108_000001.sql.gz"
FAKE_DUMP_BYTES=1000 run backup-after-crash-leftover 1 bash "$D/demo-db-backup.sh" "$C2"
says backup-after-crash-leftover "gacp_20261107_022300"
rm -f "$T/dumps/gacp_20261108_000001.sql.gz"
run backup-again-ok 0 bash "$D/demo-db-backup.sh" "$C2"

env_demo "$URL_OTHER"; rm -f "$T/state/migrated" "$R12/migrated"
m=$(mark)
run migrate-wrong-ref 1 bash "$D/demo-migrate.sh" "$C2"
says migrate-wrong-ref "$REF"
! since "$m" | grep -q "^docker run" || { echo "*** migrate touched the database with the wrong project ref"; BAD=$((BAD + 1)); }
for bad in "postgresql://postgres:$SECRET_PW@db.$REF.supabase.co:5432/postgres?host=evil.example" \
           "postgresql://postgres:$SECRET_PW@evil.example/postgres#@db.$REF.supabase.co" \
           "postgresql://postgres:$SECRET_PW@evil.example:5432/x?y=@db.$REF.supabase.co" \
           "postgresql://a:b@c@db.$REF.supabase.co/postgres" \
           "postgresql://evil.example/x@db.$REF.supabase.co/postgres" \
           "postgresql://evil.example:5432/@db.$REF.supabase.co" \
           "postgresql://postgres:$SECRET_PW@db.$REF.supabase.co:5432/postgres?%68ost=evil.example" \
           "postgresql://postgres:$SECRET_PW@db.$REF.supabase.co:5432/postgres?h%6Fst=evil.example" \
           "postgresql://postgres:$SECRET_PW@db.$REF.supabase.co:5432,evil.example:5432/postgres" \
           "postgresql://postgres:$SECRET_PW@db.$REF.supabase.co:5432/postgres?options=-chost%3Devil" \
           "mysql://postgres:$SECRET_PW@db.$REF.supabase.co:5432/postgres" \
           "postgresql://postgres.otherref:$SECRET_PW@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"; do
  env_demo "$bad"
  run migrate-crafted-url 1 bash "$D/demo-migrate.sh" "$C2"
  says migrate-crafted-url "$REF"
done
env_demo "$URL_OK" "postgresql://postgres.$REF:$SECRET_PW@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
run migrate-pooler-query-ok 0 bash "$D/demo-migrate.sh" "$C2"
env_demo "postgresql://postgres:p%40ss${SECRET_PW}@db.$REF.supabase.co:5432/postgres"
run migrate-encoded-password-ok 0 bash "$D/demo-migrate.sh" "$C2"
env_demo "$URL_OK"; echo "DIRECT_URL=\"$URL_OTHER\"" >> "$T/demo/.env.demo"
run migrate-duplicate-key 1 bash "$D/demo-migrate.sh" "$C2"
says migrate-duplicate-key "2 ครั้ง"
env_demo "$URL_OK"
mv "$R12/backup.path" "$R12/backup.path.x"
run migrate-without-backup 1 bash "$D/demo-migrate.sh" "$C2"
says migrate-without-backup "demo-db-backup.sh"
mv "$R12/backup.path.x" "$R12/backup.path"
run up-before-migrate 1 bash "$D/demo-up.sh" "$C2"
says up-before-migrate "demo-migrate.sh"
run migrate-again-ok 0 bash "$D/demo-migrate.sh" "$C2"

FAKE_BUILD_WARN=1 run build-unconsumed-arg 1 bash "$D/demo-build.sh" "$C2"
says build-unconsumed-arg "build-arg"
echo "$C1" > "$T/state/image-git-sha"
run build-wrong-git-sha 1 bash "$D/demo-build.sh" "$C2"
says build-wrong-git-sha "GIT_SHA"
echo "$C2" > "$T/state/image-git-sha"
run build-again-ok 0 bash "$D/demo-build.sh" "$C2"
touch "$R12/migrated"

reset_demo; rm -f "$R12/previous-tag"
FAKE_STUCK_REV=$PREV_SHA run up-revision-mismatch 1 bash "$D/demo-up.sh" "$C2"
says up-revision-mismatch "revision"
says up-revision-mismatch "demo-rollback.sh"
reset_demo; rm -f "$R12/previous-tag"
FAKE_STUCK_BE_REV=$PREV_SHA run up-backend-revision-mismatch 1 bash "$D/demo-up.sh" "$C2"
says up-backend-revision-mismatch "revision"
reset_demo; rm -f "$R12/previous-tag"
FAKE_HEALTH=unhealthy run up-unhealthy 1 bash "$D/demo-up.sh" "$C2"
says up-unhealthy "unhealthy"
reset_demo; rm -f "$R12/previous-tag"
FAKE_STUCK_TAG=$PREV_TAG run up-image-not-switched 1 bash "$D/demo-up.sh" "$C2"
says up-image-not-switched "image/revision"
reset_demo; rm -f "$R12/previous-tag"; : > "$T/state/rev-gacp-backend-demo"
run up-previous-revision-unreadable 1 bash "$D/demo-up.sh" "$C2"
says up-previous-revision-unreadable "revision"
[ ! -e "$R12/previous-tag" ] || { echo "*** previous-tag written although the previous revision was unreadable"; BAD=$((BAD + 1)); }
reset_demo; rm -f "$R12/previous-tag"; grep -v "^$BE:$PREV_TAG$" "$T/state/images" > "$T/state/images.x"; mv "$T/state/images.x" "$T/state/images"
run up-previous-image-gone 1 bash "$D/demo-up.sh" "$C2"
says up-previous-image-gone "ย้อนไม่ได้"
reset_demo; rm -f "$R12/previous-tag"; echo "$FE:local-somethingelse" > "$T/state/image-gacp-frontend-demo"
run up-mixed-tags 1 bash "$D/demo-up.sh" "$C2"
[ ! -e "$R12/previous-tag" ] || { echo "*** previous-tag written although the running tags differ"; BAD=$((BAD + 1)); }

reset_demo; rm -f "$R12/previous-tag"
run up-for-guards 0 bash "$D/demo-up.sh" "$C2"
OTHER=local-0123456789ab; echo "$BE:$OTHER" > "$T/state/image-gacp-backend-demo"; echo "$FE:$OTHER" > "$T/state/image-gacp-frontend-demo"
run up-stale-round 1 bash "$D/demo-up.sh" "$C2"
says up-stale-round "รอบนี้เก่าแล้ว"
run rollback-not-this-round 1 bash "$D/demo-rollback.sh" "$C2"
says rollback-not-this-round "ไม่ใช่ tag ของรอบนี้"
reset_demo; echo "$BE:local-${C2:0:12}" > "$T/state/image-gacp-backend-demo"; echo "$FE:local-${C2:0:12}" > "$T/state/image-gacp-frontend-demo"
FAKE_ID_SUFFIX=-rebuilt run rollback-tag-moved 1 bash "$D/demo-rollback.sh" "$C2"
says rollback-tag-moved "image คนละตัว"

mkdir -p "$T/home/gacp-build/${C1:0:12}"; echo "$C1" > "$T/home/gacp-build/${C1:0:12}/SHA"
run rollback-without-previous-tag 1 bash "$D/demo-rollback.sh" "$C1"
says rollback-without-previous-tag "previous-tag"

# ── demo-walk.sh (ไม่เดินจริง: แค่ทางที่ไม่แตะเครือข่าย) ──────────────────────
W="$REPO_ROOT/scripts/walk/demo-walk.sh"; WH="$T/walkhome/work/state/walk/demo-${C2:0:12}"
mkdir -p "$WH-baseline" "$WH-post"
wres() { printf '{"target":"demo","base":"https://demo.gacpth.com","rows":[{"id":"identity","status":"FAIL"},{"id":"verify","status":"%s"}]}' "$2" > "$1/result.json"; }
run walk-bad-step 1 bash "$W" deploy "$C2"
wres "$WH-baseline" PASS
HOME="$T/walkhome" GACP_HEAVY_HELD=1 DEPLOY_WALK_CONFIG= run walk-baseline-exists 1 bash "$W" baseline "$C2"
says walk-baseline-exists "มีผล baseline"
run walk-bad-sha 1 bash "$W" baseline "$C2; echo x"
wres "$WH-baseline" PASS; touch -d '2026-11-08 00:00' "$WH-baseline/result.json"; wres "$WH-post" PASS
HOME="$T/walkhome" run walk-compare-ok 0 bash "$W" compare "$C2"
wres "$WH-post" FAIL
HOME="$T/walkhome" run walk-compare-new-fail 1 bash "$W" compare "$C2"
says walk-compare-new-fail "verify"
touch -d '2026-11-01 00:00' "$WH-post/result.json"
HOME="$T/walkhome" run walk-compare-post-older 1 bash "$W" compare "$C2"
says walk-compare-post-older "ใหม่กว่า"

# ── ค่าลับ ──────────────────────────────────────────────────────────────────
if grep -rl -- "$SECRET_PW" "$FAKE_LOG" "$T/out" "$T/home" >/dev/null 2>&1; then echo "*** the database password reached argv, output or a file on the box"; grep -rl -- "$SECRET_PW" "$FAKE_LOG" "$T/out" "$T/home"; BAD=$((BAD + 1)); fi
if grep -E "postgres(ql)?://" "$FAKE_LOG" >/dev/null; then echo "*** a database URL reached a command's argv"; BAD=$((BAD + 1)); fi
if grep -E "^docker build.*https?://" "$FAKE_LOG" >/dev/null; then echo "*** a URL reached docker build argv"; BAD=$((BAD + 1)); fi

[ "$BAD" -eq 0 ] && { echo "demo-deploy selftest: PASS"; exit 0; }
echo "demo-deploy selftest: FAIL ($BAD)"; exit 1
