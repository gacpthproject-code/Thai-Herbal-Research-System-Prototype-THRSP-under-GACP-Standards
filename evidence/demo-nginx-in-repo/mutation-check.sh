#!/usr/bin/env bash
# Each mutation must turn nginx-exposure.test.js red; the files are restored after every run.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
D="$ROOT/deploy/nginx/demo-host/etc/nginx/conf.d"
EDGE="$D/00-gacp-platform.conf"; DEMO="$D/demo.gacpth.com.conf"
PAGE="$ROOT/deploy/nginx/demo-host/usr/share/nginx/gacpth-notice/index.html"
BAK="$(mktemp -d)"; cp "$EDGE" "$DEMO" "$PAGE" "$BAK/"
export E0="$BAK/00-gacp-platform.conf" D0="$BAK/demo.gacpth.com.conf" P0="$BAK/index.html"
restore() { cp "$E0" "$EDGE"; cp "$D0" "$DEMO"; cp "$P0" "$PAGE"; }
trap 'restore; rm -rf "$BAK"' EXIT
FAILED=0

run() {  # run <name> <python statement over s (00 file), d (demo vhost) and p (notice page)>
  restore
  python3 -I - "$2" "$E0" "$D0" "$P0" "$EDGE" "$DEMO" "$PAGE" <<'PY'
import sys
code, e0, d0, p0, e1, d1, p1 = sys.argv[1:]
s = open(e0, encoding='utf-8').read(); d = open(d0, encoding='utf-8').read(); p = open(p0, encoding='utf-8').read()
exec(code)
open(e1, 'w', encoding='utf-8').write(s); open(d1, 'w', encoding='utf-8').write(d); open(p1, 'w', encoding='utf-8').write(p)
PY
  if cmp -s "$EDGE" "$E0" && cmp -s "$DEMO" "$D0" && cmp -s "$PAGE" "$P0"; then echo "MUTATION DID NOT APPLY: $1"; FAILED=1; return; fi
  local out; out="$(cd "$ROOT/apps/backend" && npx jest __tests__/unit/nginx-exposure.test.js 2>&1)"
  if grep -q '^Tests:.* failed' <<<"$out"; then
    echo "RED  $1  ($(grep '^Tests:' <<<"$out" | tr -s ' '))"
  else
    echo "GREEN (mutation survived)  $1"; FAILED=1
  fi
}

G='    set $gacp_apex "";\n    if ($host ~* "^(www\\.)?gacpth\\.com$") { set $gacp_apex "1"; }\n    if ($uri ~ "^/verify/") { set $gacp_apex "${gacp_apex}v"; }\n    if ($gacp_apex = "1v") { return 302 https://demo.gacpth.com$request_uri; }\n    if ($gacp_apex = "1") { rewrite ^ /__gacp_notice last; }\n'
DENY='    if ($gacp_bare_domain_deny) { return 403; }\n'

run "drop the guard from both listeners"      "s = s.replace('$G', '')"
run "move the guard after the deny"           "s = s.replace('$G', '').replace('$DENY', '$DENY' + '$G')"
run "verify 302 becomes 301"                  "s = s.replace('return 302 https://demo.gacpth.com', 'return 301 https://demo.gacpth.com')"
run "verify redirect drops the request uri"   "s = s.replace('https://demo.gacpth.com\$request_uri;', 'https://demo.gacpth.com/;')"
run "verify match loses its trailing slash"   "s = s.replace('\"^/verify/\"', '\"^/verify\"')"
run "verify match becomes case-insensitive"   "s = s.replace('\$uri ~ \"^/verify/\"', '\$uri ~* \"^/verify/\"')"
run "host match loses its start anchor"       "s = s.replace('\"^(www\\\\.)?gacpth', '\"(www\\\\.)?gacpth')"
run "notice rewrite removed (falls through)"  "s = s.replace('    if (\$gacp_apex = \"1\") { rewrite ^ /__gacp_notice last; }\n', '')"
run "notice location loses internal"          "s = s.replace('        internal;\n        default_type text/html;', '        default_type text/html;')"
run "notice location loses noindex"           "s = s.replace('        add_header X-Robots-Tag \"noindex, nofollow, noarchive\" always;\n        add_header Cache-Control', '        add_header Cache-Control')"
run "notice root points elsewhere"            "s = s.replace('root /usr/share/nginx/gacpth-notice;', 'root /usr/share/nginx/html;')"
run "notice location proxies to the app"      "s = s.replace('try_files /index.html =404;', 'proxy_pass http://docker_nginx_http;')"
run "notice page text changed"                "p = p.replace('ระบบอยู่ระหว่างการพัฒนาและทดสอบ', 'ระบบพร้อมใช้งาน')"
run "notice page drops noindex meta"          "p = p.replace('<meta name=\"robots\" content=\"noindex,nofollow\">', '')"
run "demo vhost also claims gacpth.com"       "d = d.replace('server_name demo.gacpth.com;', 'server_name demo.gacpth.com gacpth.com;', 1)"
run "demo vhost becomes default_server"       "d = d.replace('listen 80;', 'listen 80 default_server;', 1)"
run "demo 443 location / stops proxying"      "d = d.replace('proxy_pass http://127.0.0.1:8080;', 'return 404;')"
run "demo deny row comes back"                "s = s.replace('\$gacp_demo_deny {\n    default 0;', '\$gacp_demo_deny {\n    default 0;\n    \"1:0:0\" 1;')"

restore
[ "$FAILED" = 0 ] && echo "PASS: every mutation turned the suite red" || { echo "FAIL"; exit 1; }
