#!/usr/bin/env bash
# Sends every request in rows.txt through the real nginx config on high ports and writes
# matrix.tsv: request, expected, got. Besides ports, file paths and the token, the rewrite drops
# `listen [::]` and `default_server`, and the wrapper adds `set_real_ip_from 127.0.0.1`.
# The two upstreams are stubs that echo. Nothing here touches a server.
#
#   NGINX_BIN=/path/to/nginx BASE=<commit before the fix> evidence/nginx-exempt-map/run-matrix.sh
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(git -C "$HERE" rev-parse --show-toplevel)
NGINX_BIN=${NGINX_BIN:-nginx}
BASE=${BASE:-16ed718b5}
WORK=$(mktemp -d /tmp/ngx-matrix.XXXXXX)
trap 'rm -rf "$WORK"' EXIT
D=deploy/nginx/demo-host/etc/nginx/conf.d

rewrite_conf() {
  sed -E -e 's/listen 80( default_server)?;/listen 127.0.0.1:18080;/' -e '/listen \[::\]/d' \
    -e 's/listen 443 ssl http2( default_server)?;/listen 127.0.0.1:18443 ssl http2;/' \
    -e "s#ssl_certificate( +)[^;]+;#ssl_certificate $R/o.pem;#" \
    -e "s#ssl_certificate_key( +)[^;]+;#ssl_certificate_key $R/o.key;#" \
    -e "s#/etc/nginx/gacp-gate-token\[.\]conf#$R/gate-token.conf#" \
    -e "s#/etc/nginx/gacp-demo-token\[.\]conf#$R/demo-token.conf#" \
    -e "s#/var/www/certbot#$R/certbot#" -e "s#/usr/share/nginx/gacpth-notice#$R/notice#" \
    -e 's#127\.0\.0\.1:8081#127.0.0.1:18081#' -e 's#127\.0\.0\.1:8080#127.0.0.1:18082#'
}

# The map as the first trial proposed it: normalised key, end anchors, ACME token class.
uri_trial() {
  sed -E -e 's/^map \$request_uri \$gacp_prelaunch_exempt/map $uri $gacp_prelaunch_exempt/' \
    -e 's/^( *)~\^\/__access-check 1;/\1~^\/__access-check$ 1;/' \
    -e 's/^( *)~\^\/__gate 1;/\1~^\/__gate$ 1;/' \
    -e 's/^( *)~\^\/\\\.well-known\/acme-challenge\/ 1;/\1~^\/\\.well-known\/acme-challenge\/[A-Za-z0-9_-]+$ 1;/'
}

start_nginx() { # platform-file staging-file demo-file
  R=$WORK/run; rm -rf "$R"; mkdir -p "$R/logs" "$R/tmp" "$R/certbot/.well-known/acme-challenge" "$R/notice"
  openssl req -x509 -newkey rsa:2048 -nodes -keyout "$R/o.key" -out "$R/o.pem" -days 1 -subj /CN=t 2>/dev/null
  echo '"testtoken" 1;' > "$R/gate-token.conf"
  echo '"demotoken" 1;' > "$R/demo-token.conf"
  echo 'ACME-TOKEN' > "$R/certbot/.well-known/acme-challenge/tok-EN_123"
  echo 'NOTICE' > "$R/notice/index.html"
  rewrite_conf < "$1" > "$R/00.conf"
  rewrite_conf < "$3" > "$R/demo.conf"
  rewrite_conf < "$2" > "$R/staging.conf"
  cat > "$R/nginx.conf" <<EOF
pid $R/nginx.pid;
error_log $R/logs/error.log warn;
events { worker_connections 64; }
http {
  access_log off;
  client_body_temp_path $R/tmp/a; proxy_temp_path $R/tmp/b; fastcgi_temp_path $R/tmp/c; uwsgi_temp_path $R/tmp/d; scgi_temp_path $R/tmp/e;
  set_real_ip_from 127.0.0.1;
  include $R/00.conf;
  include $R/demo.conf;
  include $R/staging.conf;
  server { listen 127.0.0.1:18081; location / { default_type text/plain; return 200 "STAGING-UPSTREAM raw=\$request_uri\n"; } }
  server { listen 127.0.0.1:18082; location / { default_type text/plain; return 200 "DEMO-UPSTREAM raw=\$request_uri\n"; } }
}
EOF
  "$NGINX_BIN" -p "$R" -c "$R/nginx.conf" -t 2>&1 | grep -E 'emerg|test failed' && exit 2
  "$NGINX_BIN" -p "$R" -c "$R/nginx.conf" 2>/dev/null
  for _ in 1 2 3 4 5 6 7 8 9 10; do [ -s "$R/nginx.pid" ] && break; sleep 0.1; done
  [ -s "$R/nginx.pid" ] || { echo "nginx did not start"; exit 2; }
}

stop_nginx() { kill "$(cat "$R/nginx.pid")"; sleep 0.2; }

send() { # host port ip extra path -> prints "code marker"
  local host=$1 port=$2 ip=$3 extra=$4 path=$5 scheme=https code body loc cookie out
  [ "$port" = 80 ] && scheme=http
  local p=18443; [ "$port" = 80 ] && p=18080
  # shellcheck disable=SC2086
  code=$(curl -sk --http1.1 --path-as-is --max-time 5 -o "$WORK/body" -D "$WORK/hdr" -w '%{http_code}' \
    --resolve "$host:$p:127.0.0.1" -H "CF-Connecting-IP: $ip" $extra "$scheme://$host:$p$path")
  body=$(head -1 "$WORK/body" | tr -d '\r')
  loc=$(grep -i '^location:' "$WORK/hdr" | tr -d '\r' | cut -d' ' -f2 | sed -E 's/:18443//')
  cookie=$(grep -i '^set-cookie:' "$WORK/hdr" | tr -d '\r' | sed -E 's/^[^:]+: *([a-z_]+)=.*/\1/')
  out=$code
  case $body in
    STAGING-UPSTREAM*) out="$out STAGING-UPSTREAM" ;;
    DEMO-UPSTREAM*) out="$out DEMO-UPSTREAM" ;;
    remote_addr=*) out="$out check" ;;
    ACME-TOKEN) out="$out acme" ;;
    NOTICE) out="$out notice" ;;
  esac
  case $body in *-UPSTREAM*[.%]*|*-UPSTREAM*raw=//*) out="$out fwd=${body#* raw=}" ;; esac
  [ -n "$loc" ] && out="$out -> $loc"
  [ -n "$cookie" ] && out="$out cookie:$cookie"
  printf '%s' "$out"
}

run_variant() { # label platform staging demo
  start_nginx "$2" "$3" "$4"
  : > "$WORK/$1.got"
  while IFS='|' read -r host port ip extra path expected; do
    case $host in ''|'#'*) continue ;; esac
    send "$host" "$port" "$ip" "$extra" "$path" >> "$WORK/$1.got"; echo >> "$WORK/$1.got"
  done < "$HERE/rows.txt"
  stop_nginx
}

git -C "$REPO" show "$BASE:$D/00-gacp-platform.conf" > "$WORK/shipped-00.conf"
uri_trial < "$WORK/shipped-00.conf" > "$WORK/trial-00.conf"
cmp -s "$WORK/shipped-00.conf" "$WORK/trial-00.conf" && { echo 'uri_trial changed nothing'; exit 2; }
ST=$REPO/$D/staging.gacpth.com.conf DM=$REPO/$D/demo.gacpth.com.conf

run_variant shipped "$WORK/shipped-00.conf" "$ST" "$DM"
run_variant uri_trial "$WORK/trial-00.conf" "$ST" "$DM"
run_variant fixed "$REPO/$D/00-gacp-platform.conf" "$ST" "$DM"
run_variant old_copy "$REPO/deploy/nginx/gacp-platform.conf" "$REPO/deploy/nginx/staging.gacpth.com.conf" "$DM"

OUT=${OUT:-$HERE/matrix.tsv}
printf 'host\tport\tvisitor\textra\trequest\texpected\tgot_fixed\tverdict\tgot_old_copy\tgot_uri_trial\tgot_shipped\n' > "$OUT"
grep -vE '^(#|$)' "$HERE/rows.txt" | paste -d'|' - "$WORK/fixed.got" "$WORK/old_copy.got" "$WORK/uri_trial.got" "$WORK/shipped.got" |
while IFS='|' read -r host port ip extra path expected fixed old trial shipped; do
  verdict=PASS; [ "$fixed" = "$expected" ] || verdict=FAIL
  # The old copy has its own vhost, so only the status code compares, and it has no apex notice.
  case $host in
    gacpth.com|www.gacpth.com) ;;
    *) [ "${old%% *}" = "${expected%% *}" ] || verdict=FAIL-old-copy ;;
  esac
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$host" "$port" "$ip" "$extra" "$path" "$expected" "$fixed" "$verdict" "$old" "$trial" "$shipped" >> "$OUT"
done
rows=$(($(wc -l < "$OUT") - 1)); bad=$(cut -f8 "$OUT" | grep -c FAIL)
echo "rows=$rows fail=$bad"
# Empty or cut-short rows.txt writes no FAIL, so zero failures alone proves nothing.
[ "$rows" -ge 105 ] || { echo "rows=$rows is below the 105 this matrix covers"; exit 1; }
[ "$bad" -eq 0 ]
