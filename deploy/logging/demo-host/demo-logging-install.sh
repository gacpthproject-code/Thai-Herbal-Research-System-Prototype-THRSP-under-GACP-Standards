#!/usr/bin/env bash
# Central log collection on the demo host (119.59.105.140): Loki + Promtail + Grafana.
# Run from the work host. It ssh-es to demo as deploy and uses sudo there.
#
#   demo-logging-install.sh                 dry run (default): reads only, writes nothing on demo
#   demo-logging-install.sh --apply         install or converge /opt/gacp-logging and start the stack
#   demo-logging-install.sh --rollback      stop and remove gacp-loki, gacp-promtail, gacp-grafana; keep data
#   demo-logging-install.sh --rollback --purge   also delete the log volumes, /opt/gacp-logging and the password
#
# Files come from git, never from a working tree: REF (default origin/chore/demo-central-logging,
# use origin/main once merged) : deploy/logging/demo-host/opt/gacp-logging/.
# REPO defaults to ~/work/GACP-Certification-Application.
set -euo pipefail

MODE=dry PURGE=0
for a in "$@"; do
  case "$a" in
    --apply) MODE=apply ;;
    --rollback) MODE=rollback ;;
    --purge) PURGE=1 ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "unknown argument: $a"; exit 2 ;;
  esac
done
[ "$PURGE" = 1 ] && [ "$MODE" != rollback ] && { echo "--purge only goes with --rollback"; exit 2; }

REPO="${REPO:-$HOME/work/GACP-Certification-Application}"
REF="${REF:-origin/chore/demo-central-logging}"
SRC=deploy/logging/demo-host/opt/gacp-logging
git -C "$REPO" fetch -q origin
SHA=$(git -C "$REPO" rev-parse --verify "$REF^{commit}")
PAYLOAD=$(git -C "$REPO" archive --format=tar.gz "$SHA" "$SRC" | base64 -w0)
echo "files: $REF = $SHA : $SRC"

S=(ssh -i "$HOME/.ssh/id_ed25519_newhost" -o IdentitiesOnly=yes deploy@119.59.105.140)
"${S[@]}" "MODE=$MODE PURGE=$PURGE SHA=$SHA SRC=$SRC PAYLOAD=$PAYLOAD bash -s" <<'REMOTE'
set -euo pipefail
DEST=/opt/gacp-logging
PROJECT=gacp-logging
SECRET=$DEST/secrets/grafana-admin-password
EXPECT_IP=119.59.105.140
EXPECT_MACHINE_ID=7be1667015d4403993b5794897c059f7
APP_HEALTHY="gacp-backend-demo gacp-frontend-demo gacp-nginx gacp-minio"
APP_RUNNING="gacp-redis"
OURS="gacp-loki gacp-promtail gacp-grafana"
IMAGES="grafana/loki:2.9.6 grafana/promtail:2.9.6 grafana/grafana:13.0.2"
PLANNED_MEM_MB=896          # 256 loki + 128 promtail + 512 grafana (mem_limit)
MIN_FREE_DISK_GB=20
MIN_AVAIL_AFTER_MB=4096

say() { printf '%s\n' "$*"; }
die() { printf 'STOP: %s\n' "$*"; exit 2; }
payload() { printf '%s' "$PAYLOAD" | base64 -d; }
file_list() { payload | tar -tzf - | grep -v '/$' | sed "s#^$SRC/##"; }
file_body() { payload | tar -xzOf - "$SRC/$1"; }
compose() { docker compose -p "$PROJECT" --project-directory "$DEST" -f "$DEST/docker-compose.yml" "$@"; }

[ "$(cat /etc/machine-id)" = "$EXPECT_MACHINE_ID" ] || die "machine-id is not the demo host's"
ip -4 -o addr | grep -q " $EXPECT_IP/" || die "$EXPECT_IP is not on any interface: not the demo host"
docker inspect gacp-backend-demo >/dev/null 2>&1 || die "no gacp-backend-demo container: not the demo host"
say "host: demo ($EXPECT_IP, machine-id ok)  mode=$MODE  files=$SHA"

app_health() {
  local bad=0 c s
  for c in $APP_HEALTHY; do
    s=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "$c" 2>/dev/null || echo missing)
    [ "$s" = healthy ] || { say "  $c: $s"; bad=1; }
  done
  for c in $APP_RUNNING; do
    s=$(docker inspect -f '{{.State.Status}}' "$c" 2>/dev/null || echo missing)
    [ "$s" = running ] || { say "  $c: $s"; bad=1; }
  done
  s=$(curl -s -o /dev/null -m 10 -w '%{http_code}' http://127.0.0.1:8003/api/health || true)
  [ "$s" = 200 ] || { say "  backend /api/health: $s"; bad=1; }
  return $bad
}

if app_health; then say "app: healthy (${APP_HEALTHY// /, }, $APP_RUNNING running, /api/health 200)"
else [ "$MODE" = rollback ] || die "app is not healthy before the change; nothing done"; say "app: NOT healthy (rollback continues)"; fi

if [ "$MODE" = rollback ]; then
  if [ -f "$DEST/docker-compose.yml" ]; then
    if [ "$PURGE" = 1 ]; then sudo docker compose -p "$PROJECT" --project-directory "$DEST" -f "$DEST/docker-compose.yml" down -v
    else sudo docker compose -p "$PROJECT" --project-directory "$DEST" -f "$DEST/docker-compose.yml" down; fi
  else
    for c in $OURS; do docker rm -f "$c" >/dev/null 2>&1 && say "removed $c" || true; done
    docker network rm gacp-logging-network >/dev/null 2>&1 || true
    [ "$PURGE" = 1 ] && docker volume rm gacp-logging-loki-data gacp-logging-grafana-data gacp-logging-promtail-positions 2>/dev/null || true
  fi
  if [ "$PURGE" = 1 ]; then sudo rm -rf "$DEST"; say "purged: volumes, $DEST, Grafana password"; else say "kept: volumes gacp-logging-*, $DEST (re-apply resumes from the same data)"; fi
  for c in $OURS; do docker inspect "$c" >/dev/null 2>&1 && die "$c still exists"; done
  app_health && say "app: healthy after rollback" || { say "app: NOT healthy after rollback (logging stack is gone; look at the app itself)"; exit 1; }
  say "ROLLBACK DONE"; exit 0
fi

say "--- resources"
avail_mb=$(awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo)
total_mb=$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)
free_gb=$(df -BG --output=avail /var/lib/docker | tail -1 | tr -dc 0-9)
running_ours=0; for c in $OURS; do docker inspect "$c" >/dev/null 2>&1 && running_ours=1; done
say "  memory: total ${total_mb} MB, available ${avail_mb} MB; stack hard cap ${PLANNED_MEM_MB} MB (mem_limit)"
say "  app caps today: $(for c in $APP_HEALTHY $APP_RUNNING; do docker inspect -f '{{.Name}}={{.HostConfig.Memory}}' "$c"; done | awk -F= '{sub("/","",$1); printf "%s %d MB, ", $1, $2/1048576}')"
say "  disk free under /var/lib/docker: ${free_gb} GB (need >= ${MIN_FREE_DISK_GB})"
[ "$running_ours" = 1 ] || [ $((avail_mb - PLANNED_MEM_MB)) -ge $MIN_AVAIL_AFTER_MB ] || die "less than ${MIN_AVAIL_AFTER_MB} MB would stay available"
[ "$free_gb" -ge "$MIN_FREE_DISK_GB" ] || die "not enough disk"
for p in 3100 3200; do
  if ss -ltn "sport = :$p" | grep -q LISTEN; then
    owner=$(docker ps --filter "publish=$p" --format '{{.Names}}')
    case "$owner" in gacp-loki|gacp-grafana) say "  port 127.0.0.1:$p: ours ($owner)";; *) die "port $p is taken by '${owner:-a host process}'";; esac
  else say "  port 127.0.0.1:$p: free"; fi
done
docker info --format '{{json .SecurityOptions}}' | grep -q selinux && say "  note: dockerd has SELinux on; promtail runs with label=disable" || say "  dockerd SELinux support: off (host is Enforcing, containers run unconfined as the app does)"

say "--- images"
for i in $IMAGES; do
  if docker image inspect "$i" >/dev/null 2>&1; then say "  $i: present"
  elif [ "$MODE" = dry ]; then docker manifest inspect "$i" >/dev/null 2>&1 && say "  $i: will pull (found on registry)" || say "  $i: will pull (registry check failed: pull may fail)"
  else docker pull -q "$i" >/dev/null || die "pull $i failed"; say "  $i: pulled"; fi
done

say "--- files under $DEST"
changed=""
for f in $(file_list); do
  if [ -f "$DEST/$f" ]; then
    if diff -q <(file_body "$f") "$DEST/$f" >/dev/null; then say "  $f: unchanged"
    else say "  $f: CHANGED"; diff -u "$DEST/$f" <(file_body "$f") | sed 's/^/    /' || true; changed="$changed $f"; fi
  else say "  $f: new ($(file_body "$f" | wc -l) lines, root:root 0644)"; changed="$changed $f"; fi
done
if sudo -n test -f "$SECRET" 2>/dev/null; then say "  secrets/grafana-admin-password: exists, kept (never printed)"
else say "  secrets/grafana-admin-password: will be generated on demo (openssl rand -base64 32, root:root 0640, never printed)"; fi

say "--- compose (rendered, validated)"
file_body docker-compose.yml | docker compose -p "$PROJECT" --project-directory "$DEST" -f - config -q && say "  docker compose config: valid"
file_body docker-compose.yml | docker compose -p "$PROJECT" --project-directory "$DEST" -f - config --format json \
  | python3 -c 'import json,sys; d=json.load(sys.stdin)
for n,s in d["services"].items():
  print("  %-8s %-24s mem_limit=%dMB cpus=%s ports=%s" % (n, s["image"], int(s.get("mem_limit",0))//1048576, s.get("cpus"), ",".join("%s:%s->%s" % (p.get("host_ip"), p.get("published"), p.get("target")) for p in s.get("ports",[])) or "none"))'
if [ "$running_ours" = 1 ]; then say "  running now: $(docker ps -a --filter label=com.docker.compose.project=$PROJECT --format '{{.Names}} {{.Status}}' | paste -sd ';')"
else say "  running now: none of $OURS"; fi

if [ "$MODE" = dry ]; then
  say "DRY RUN DONE: nothing written on demo. --apply would create the files above, pull missing images, start $OURS."
  exit 0
fi

say "--- apply"
exec 9>/tmp/gacp-logging-install.lock
flock -n 9 || die "another demo-logging-install run holds the lock"
rollback_now() {
  say "STOP: $1 -- removing the logging stack again (data volumes kept)"
  sudo docker compose -p "$PROJECT" --project-directory "$DEST" -f "$DEST/docker-compose.yml" down 2>&1 | sed 's/^/  /' || true
  for c in $OURS; do docker inspect "$c" >/dev/null 2>&1 && say "  $c still exists: remove by hand (docker rm -f $c)"; done
  app_health && say "app: healthy after removal" || say "app: NOT healthy after removal"
  exit 1
}
tmp=$(sudo mktemp -d); trap 'sudo rm -rf "$tmp"' EXIT
payload | sudo tar -xzf - -C "$tmp"
sudo install -d -o root -g root -m 0755 "$DEST"
for f in $(file_list); do sudo install -d -o root -g root -m 0755 "$DEST/$(dirname "$f")"; done
sudo install -d -o root -g root -m 0750 "$DEST/secrets"
ts=$(date +%Y%m%d-%H%M%S)
for f in $changed; do
  sudo test -f "$DEST/$f" && sudo cp -p "$DEST/$f" "$DEST/$f.bak-$ts"
  sudo install -o root -g root -m 0644 "$tmp/$SRC/$f" "$DEST/$f"; say "  wrote $DEST/$f"
done
if ! sudo test -s "$SECRET"; then
  sudo sh -c "umask 077; openssl rand -base64 32 | tr -d '\n' > '$SECRET'"
  sudo test -s "$SECRET" || die "could not generate the Grafana password (openssl rand)"
  sudo chown root:root "$SECRET"; sudo chmod 0640 "$SECRET"
  say "  generated $SECRET (root:root 0640, not printed)"
fi
# A changed bind-mounted config is a new inode the running container cannot see, and
# compose's config hash ignores file contents, so changed files force a recreate.
recreate=""; [ -n "$changed" ] && [ "$running_ours" = 1 ] && recreate=--force-recreate
sudo docker compose -p "$PROJECT" --project-directory "$DEST" -f "$DEST/docker-compose.yml" up -d $recreate 2>&1 | sed 's/^/  /' || rollback_now "docker compose up failed"

for i in $(seq 1 24); do
  l=$(docker inspect -f '{{.State.Health.Status}}' gacp-loki 2>/dev/null || true)
  g=$(docker inspect -f '{{.State.Health.Status}}' gacp-grafana 2>/dev/null || true)
  p=$(docker inspect -f '{{.State.Status}}' gacp-promtail 2>/dev/null || true)
  [ "$l" = healthy ] && [ "$g" = healthy ] && [ "$p" = running ] && break
  sleep 5
done
[ "$l" = healthy ] && [ "$g" = healthy ] && [ "$p" = running ] || rollback_now "stack not healthy after 120 s (loki=$l grafana=$g promtail=$p)"
say "  stack: gacp-loki healthy, gacp-grafana healthy, gacp-promtail running"

code=$(sudo cat "$SECRET" | { IFS= read -r pw || true; printf 'user = "admin:%s"\n' "$pw" | curl -s -o /dev/null -w '%{http_code}' -K - http://127.0.0.1:3200/api/datasources/uid/gacp-demo-loki; } || true)
[ "$code" = 200 ] || rollback_now "Grafana admin login with the generated password returned $code"
say "  grafana: admin login with the generated password works, Loki datasource provisioned"

for i in $(seq 1 18); do
  vals=$(curl -s -m 5 http://127.0.0.1:3100/loki/api/v1/label/container/values || true)
  printf '%s' "$vals" | grep -q '"gacp-backend-demo"' && break
  sleep 5
done
printf '%s' "$vals" | grep -q '"gacp-backend-demo"' || rollback_now "no gacp-backend-demo lines in Loki after 90 s"
say "  loki: containers seen = $(printf '%s' "$vals" | python3 -c 'import json,sys; print(", ".join(json.load(sys.stdin)["data"]))')"

app_health || rollback_now "app not healthy after start"
say "app: healthy after start"
for c in $OURS; do docker inspect -f '  {{.Name}} mem_limit={{.HostConfig.Memory}} ports={{json .HostConfig.PortBindings}}' "$c"; done
say "APPLY DONE files=$SHA"
REMOTE
