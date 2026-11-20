#!/usr/bin/env bash
set -euo pipefail
in=$1; out=$2; listen=$3; bport=$4; wport=$5; burst=${6:-}
sed -e "s#^    listen 80;#    listen 127.0.0.1:${listen};#" \
    -e "s#^\(    default  *\)backend:8000;#\1127.0.0.1:${bport};#" \
    -e "s#^\(    staging.gacpth.com  *\)backend-staging:8000;#\1127.0.0.1:${bport};#" \
    -e "s#^\(    demo.gacpth.com  *\)backend-demo:8000;#\1127.0.0.1:${bport};#" \
    -e "s#^\(    default  *\)frontend:3000;#\1127.0.0.1:${wport};#" \
    -e "s#^\(    staging.gacpth.com  *\)frontend-staging:3000;#\1127.0.0.1:${wport};#" \
    -e "s#^\(    demo.gacpth.com  *\)frontend-demo:3000;#\1127.0.0.1:${wport};#" \
    -e "s|^    resolver 127.0.0.11 valid=10s ipv6=off;|    # scratch: no Docker DNS|" \
    "$in" > "$out"
if [ -n "$burst" ]; then
  sed -i "s#limit_req zone=api_upload burst=[0-9]* nodelay;#limit_req zone=api_upload burst=${burst} nodelay;#" "$out"
fi
diff -u "$in" "$out" > "$out.diff" || true
