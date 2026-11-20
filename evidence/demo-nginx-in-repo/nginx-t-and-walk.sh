#!/usr/bin/env bash
# nginx -t and a request walk on deploy/nginx/demo-host/ in throwaway containers (--network none).
#   edge:      nginx:1.24.0, the host nginx version on the demo host (AlmaLinux rpm 1.24.0)
#   container: nginx:alpine image da954fb959a3, the same image id gacp-nginx runs on the demo host
# A throwaway self-signed certificate stands in for /etc/ssl/cloudflare/origin.{pem,key}. Containers
# and the certificate are removed on exit. The walk's zz-walk.conf trusts CF-Connecting-IP from
# loopback so a request can arrive as an address outside the allowlist.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
M="${DEMO_HOST_TREE:-$ROOT/deploy/nginx/demo-host}"
W="$(mktemp -d)"; EDGE="demo-edge-t-$$"; CONT="demo-container-t-$$"
trap 'docker rm -f "$EDGE" "$CONT" >/dev/null 2>&1; rm -rf "$W"' EXIT
FAILED=0

openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=gacpth.com -keyout "$W/origin.key" -out "$W/origin.pem" 2>/dev/null
chmod 644 "$W/origin.key"

echo "## edge: nginx -t ($(docker run --rm --entrypoint nginx nginx:1.24.0 -v 2>&1))"
NOTICE_DIR=(-v "$M/usr/share/nginx/gacpth-notice:/usr/share/nginx/gacpth-notice:ro")
EDGE_MOUNTS=(-v "$M/etc/nginx/nginx.conf:/etc/nginx/nginx.conf:ro" -v "$M/etc/nginx/conf.d:/etc/nginx/conf.d:ro" -v "$W:/etc/ssl/cloudflare:ro" "${NOTICE_DIR[@]}")
docker run --rm --network none "${EDGE_MOUNTS[@]}" --entrypoint nginx nginx:1.24.0 -t 2>&1 || FAILED=1

echo "## container: nginx -t ($(docker run --rm --entrypoint nginx nginx:alpine -v 2>&1), image $(docker image inspect nginx:alpine --format '{{.Id}}' | cut -c8-19))"
docker run --rm --network none --add-host backend:127.0.0.1 --add-host frontend:127.0.0.1 \
  -v "$M/opt/gacp-platform/nginx/gacp.production.conf:/etc/nginx/conf.d/default.conf:ro" \
  -v "$M/opt/gacp-platform/nginx/50x.html:/etc/nginx/error-pages/50x.html:ro" \
  -v "$W:/etc/nginx/ssl:ro" --entrypoint nginx nginx:alpine -t 2>&1 || FAILED=1

echo "## edge: request walk"
printf 'set_real_ip_from 127.0.0.1;\n' >"$W/zz-walk.conf"
mkdir "$W/conf.d" && cp "$M"/etc/nginx/conf.d/*.conf "$W/zz-walk.conf" "$W/conf.d/"
docker run -d --name "$EDGE" --network none -v "$M/etc/nginx/nginx.conf:/etc/nginx/nginx.conf:ro" -v "$W/conf.d:/etc/nginx/conf.d:ro" -v "$W:/etc/ssl/cloudflare:ro" "${NOTICE_DIR[@]}" --entrypoint nginx nginx:1.24.0 -g "daemon off;" >/dev/null
sleep 1
walk() {  # walk <scheme> <host> <path> <client ip or -> <want status> <want location or -> <want body text or ->
  local scheme="$1" host="$2" p="$3" ip="$4" want="$5" loc="$6" text="$7" port hdr=() out status got
  port=$([ "$scheme" = https ] && echo 443 || echo 80)
  [ "$ip" = - ] || hdr=(-H "CF-Connecting-IP: $ip")
  out="$(docker exec "$EDGE" curl -sk --max-time 5 "${hdr[@]}" --resolve "$host:$port:127.0.0.1" -w '\n@@%{http_code} %{redirect_url}' "$scheme://$host$p")"
  status="$(grep '^@@' <<<"$out" | tail -1 | cut -c3- | cut -d' ' -f1)"; got="$(grep '^@@' <<<"$out" | tail -1 | cut -s -d' ' -f2-)"
  if [ "$status" = "$want" ] && [ "$got" = "$([ "$loc" = - ] || echo "$loc")" ] && { [ "$text" = - ] || grep -qF -- "$text" <<<"$out"; }; then
    echo "ok    $scheme://$host$p as ${ip/-/loopback}: $status ${got}"
  else
    echo "FAIL  $scheme://$host$p as ${ip/-/loopback}: got $status ${got:-<none>}, want $want $([ "$loc" = - ] || echo "$loc") $([ "$text" = - ] || echo "+ body '$text'")"; FAILED=1
  fi
}
NOTICE='<p>ระบบอยู่ระหว่างการพัฒนาและทดสอบ</p>'
OUTSIDER=8.8.8.8
for scheme in http https; do
  for ip in - "$OUTSIDER"; do
    for host in gacpth.com www.gacpth.com GACPTH.COM Www.GacpTh.Com; do
      for p in / /login /api/v1/health /api/auth/login /verify /VERIFY/abc /trace/lot/1; do walk "$scheme" "$host" "$p" "$ip" 200 - "$NOTICE"; done
      walk "$scheme" "$host" '/verify/TH-GACP-1-2569?x=1&y=2' "$ip" 302 'https://demo.gacpth.com/verify/TH-GACP-1-2569?x=1&y=2' -
    done
  done
done
walk https gacpth.com.evil.test / "$OUTSIDER" 403 - -
walk https localhost /verify/abc "$OUTSIDER" 403 - -
walk https localhost / - 502 - -
walk http demo.gacpth.com '/verify/abc?x=1' "$OUTSIDER" 301 'https://demo.gacpth.com/verify/abc?x=1' -
walk https demo.gacpth.com /verify/abc "$OUTSIDER" 502 - -
walk https demo.gacpth.com / "$OUTSIDER" 502 - -
echo "   (502 = proxied to 127.0.0.1:8080, which has no container in this walk)"
echo "## non-GET on gacpth.com (nginx answers; nothing reaches the app)"
for req in "POST /api/auth/login" "PUT /api/v1/x" "POST /verify/abc"; do
  set -- $req
  docker exec "$EDGE" curl -sk -o /dev/null --max-time 5 -X "$1" -H "CF-Connecting-IP: $OUTSIDER" --resolve gacpth.com:443:127.0.0.1 -w "$1 https://gacpth.com$2 as $OUTSIDER: %{http_code} %{redirect_url}\n" "https://gacpth.com$2"
done
echo "## notice headers and body"
docker exec "$EDGE" curl -sk -D- -o /dev/null --resolve gacpth.com:443:127.0.0.1 https://gacpth.com/ | tr -d '\r' | grep -iE '^(HTTP|content-type|content-length|x-robots-tag|cache-control|strict-transport-security|x-frame-options|x-content-type-options|referrer-policy|permissions-policy)'
served="$(docker exec "$EDGE" curl -sk --resolve gacpth.com:443:127.0.0.1 https://gacpth.com/api/v1/health | sha256sum | cut -c1-16)"
repo="$(sha256sum <"$M/usr/share/nginx/gacpth-notice/index.html" | cut -c1-16)"
[ "$served" = "$repo" ] && echo "ok    body of gacpth.com/api/v1/health is index.html byte for byte ($repo)" || { echo "FAIL  body $served, index.html $repo"; FAILED=1; }

[ "$FAILED" = 0 ] && echo "PASS" || { echo "FAIL"; exit 1; }
