#!/usr/bin/env bash
# Fix round 2 against the REAL Stripe test API and the REAL webhook door
# (2026-09-27). Same setup and presses as fix-round-1/reuse-proof.sh (order gets
# intent A; A is canceled in Stripe; the next press mints replacement B), then:
#   4. the real `payment_intent.canceled` event Stripe emitted for A is fetched
#      from /v1/events and delivered LATE to POST /api/v1/webhooks/stripe,
#      signed with this run's webhook secret (the route verifies the signature
#      for real) → the order holding B must stay PENDING_PAYMENT, and the event
#      row must read PROCESSED with error IGNORED:SUPERSEDED_INTENT;
#   5. B is canceled in Stripe and ITS real event delivered the same way → the
#      order must now be CANCELLED;
#   6. scripts/probes/money-equation.sh runs against this database, which now
#      holds real checkout_orders rows.
# Keys: read from apps/backend/.env into shell variables; nothing is printed.
# Usage: late-event-proof.sh <scratch-dir>
set -euo pipefail
SCRATCH="$1"
HERE="$(cd "$(dirname "$0")" && pwd)"
WALK="$HERE/../walk"
TREE="$(cd "$HERE/../../.." && pwd)"
MAIN_ENV=/home/ubuntu/work/GACP-Certification-Application/apps/backend/.env
DBURL='postgresql://gacp:walkpw@127.0.0.1:55461/gacp_walk?schema=public'
B=http://127.0.0.1:8099
source ~/.nvm/nvm.sh >/dev/null; nvm use 24 >/dev/null
SK=$(grep -E '^STRIPE_SECRET_KEY=' "$MAIN_ENV" | head -1 | cut -d= -f2- | tr -d "\"'")
# The key reaches curl through a config on a pipe, never argv (not visible in ps).
stripe_api() { printf 'user = "%s:"\n' "$SK" | curl -s -K - "$@"; }

kill_port() { local pid; pid=$(ss -ltnp "sport = :$1" 2>/dev/null | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2 || true); [ -n "$pid" ] && kill "$pid" && sleep 3 || true; }
cleanup() { kill_port 8099; docker rm -f qr-walk-pg >/dev/null 2>&1 || true; shred -u "$SCRATCH/walk.env" 2>/dev/null || true; }
trap cleanup EXIT

python3 - "$MAIN_ENV" "$SCRATCH" <<'EOF'
import sys, os, secrets
src, out = sys.argv[1], sys.argv[2]
drop = {'DATABASE_URL','PORT','HOST','CORS_ORIGIN','PAYMENT_ADAPTER','STRIPE_CHECKOUT_ENABLED','STRIPE_WEBHOOK_SECRET','REDIS_URL','NODE_ENV','UPLOAD_DIR','LOG_DIR','LOG_TO_FILE'}
lines = [l.rstrip('\n') for l in open(src) if l.split('=',1)[0].strip() not in drop]
lines += ['DATABASE_URL=postgresql://gacp:walkpw@127.0.0.1:55461/gacp_walk?schema=public','PORT=8099','HOST=127.0.0.1',
          'NODE_ENV=development','PAYMENT_ADAPTER=stripe','STRIPE_CHECKOUT_ENABLED=true',
          'STRIPE_WEBHOOK_SECRET=whsec_' + secrets.token_hex(16),  # local only; no webhook is delivered in this proof
          f'SIGNING_KEY_DIR={out}/keys', f'UPLOAD_DIR={out}/uploads', 'LOG_TO_FILE=false']
p = os.path.join(out, 'walk.env'); open(p, 'w').write('\n'.join(lines) + '\n'); os.chmod(p, 0o600)
EOF

kill_port 8099
docker rm -f qr-walk-pg >/dev/null 2>&1 || true
docker run -d --name qr-walk-pg -p 127.0.0.1:55461:5432 -e POSTGRES_PASSWORD=walkpw -e POSTGRES_USER=gacp -e POSTGRES_DB=gacp_walk postgres:15-alpine >/dev/null
until docker exec qr-walk-pg pg_isready -U gacp >/dev/null 2>&1; do sleep 1; done; sleep 2
(cd "$TREE/apps/backend" && DATABASE_URL="$DBURL" npx prisma migrate deploy --schema prisma/schema 2>&1 | tail -1)
(cd "$TREE/apps/backend" && DOTENV_CONFIG_PATH="$SCRATCH/walk.env" nohup node -r dotenv/config server.js > "$SCRATCH/backend-reuse.log" 2>&1 &)
until curl -sf $B/api/health >/dev/null; do sleep 2; done

NID=$(python3 -c "
d=[int(c) for c in '110020092703']; s=sum(x*w for x,w in zip(d,range(13,1,-1))); print('110020092703'+str((11-s%11)%10))")
PW='WalkPay#2026qr'
curl -s -X POST $B/api/auth/health/register -H 'content-type: application/json' \
  -d "{\"identifier\":\"$NID\",\"password\":\"$PW\",\"phoneNumber\":\"0812345603\",\"firstName\":\"ทดสอบ\",\"lastName\":\"ใช้ซ้ำ\",\"accountType\":\"INDIVIDUAL\",\"acceptedTermsOfService\":true,\"acceptedPrivacyPolicy\":true,\"email\":\"reuse-proof@example.com\"}" >/dev/null
cd "$TREE/apps/backend"
SEED=$(DATABASE_URL="$DBURL" node "$WALK/seed-payable-application.js" "$NID" personal)
APP=$(python3 -c "import json,sys;print(json.loads(sys.argv[1])['applicationId'])" "$SEED")
DOTENV_CONFIG_PATH="$SCRATCH/walk.env" DATABASE_URL="$DBURL" node -r dotenv/config "$WALK/issue-quotation-around-F-QT-ISSUER-UNDEFINED.js" "$APP" 2>/dev/null | grep quotationNumber >/dev/null

JAR="$SCRATCH/jar.txt"; rm -f "$JAR"
curl -s -c "$JAR" -b "$JAR" -X POST $B/api/auth/health/login -H 'content-type: application/json' -d "{\"identifier\":\"$NID\",\"password\":\"$PW\"}" >/dev/null
csrf() { awk '$6=="csrf_token"{print $7}' "$JAR" | tail -1; }
post() { curl -s -c "$JAR" -b "$JAR" -X POST "$B$1" -H 'content-type: application/json' -H "x-csrf-token: $(csrf)" -d "$2"; }
post "/api/applications/$APP/quotations/PLATFORM/accept" '{}' | python3 -c 'import sys,json; print("accept quotation:", json.load(sys.stdin).get("success"))'
post "/api/consent" '{"category":"PAYMENT_TERMS","granted":true}' | python3 -c 'import sys,json; print("payment-terms consent:", json.load(sys.stdin).get("success"))'

press() { # prints: order, intent, status, sha256(client secret)[:12]
    post /api/payments/checkout "{\"applicationId\":\"$APP\",\"milestone\":\"M1\"}" | python3 -c '
import sys,json,hashlib
d=json.load(sys.stdin); x=d.get("data") or {}
cs=x.get("clientSecret"); h=hashlib.sha256(cs.encode()).hexdigest()[:12] if cs else None
print(json.dumps({"success":d.get("success"),"error":d.get("error"),"order":x.get("checkoutOrderId"),"intent":x.get("paymentIntentId"),"status":x.get("paymentIntentStatus"),"clientSecretSha256_12":h}))'
}
T0=$(date +%s)
search() { # every intent created since this proof started, filtered to this order's metadata
    stripe_api -G https://api.stripe.com/v1/payment_intents -d "created[gte]=$((T0-5))" -d limit=100 \
      | python3 -c 'import sys,json; o=sys.argv[1]; d=[p for p in json.load(sys.stdin).get("data",[]) if p["metadata"].get("checkoutOrderId")==o]; print("stripe list (created since start, metadata.checkoutOrderId=order) → %d intent(s): %s" % (len(d), ", ".join(p["id"]+"="+p["status"] for p in reversed(d))))' "$1"
}

echo "== press 1 (first mint)"; P1=$(press); echo "$P1"
ORDER=$(python3 -c "import json,sys;print(json.loads(sys.argv[1])['order'])" "$P1"); PI_A=$(python3 -c "import json,sys;print(json.loads(sys.argv[1])['intent'])" "$P1")
echo "== press 2 (re-entry)"; press
search "$ORDER"
echo "== confirm PI_A server-side with PromptPay (a QR now exists)"
stripe_api -X POST "https://api.stripe.com/v1/payment_intents/$PI_A/confirm" -d 'payment_method_data[type]=promptpay' -d 'payment_method_data[billing_details][email]=reuse-proof@example.com' \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print("PI_A after confirm:", d.get("status"), (d.get("next_action") or {}).get("type"), "livemode="+str(d.get("livemode")))'
echo "== press 3 (re-entry while a QR is live)"; press
search "$ORDER"
echo "== cancel PI_A in Stripe (webhook NOT delivered: no stripe listen in this proof)"
stripe_api -X POST "https://api.stripe.com/v1/payment_intents/$PI_A/cancel" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("PI_A:", d.get("status"))'
echo "== press 4 (the one replacement)"; press
echo "== press 5 (retry of the replacement: idempotent)"; press
search "$ORDER"
docker exec qr-walk-pg psql -U gacp -d gacp_walk -tAc "select 'order '||id||' status='||status||' intent='||stripe_payment_intent_id from checkout_orders"
WHSEC=$(grep -E '^STRIPE_WEBHOOK_SECRET=' "$SCRATCH/walk.env" | cut -d= -f2-)
PI_B=$(docker exec qr-walk-pg psql -U gacp -d gacp_walk -tAc "select stripe_payment_intent_id from checkout_orders where id='$ORDER'")
deliver() { # $1 intent id: fetch Stripe's real payment_intent.canceled event for it, sign it, POST it to the local webhook door
    stripe_api -G https://api.stripe.com/v1/events -d type=payment_intent.canceled -d "created[gte]=$((T0-5))" -d limit=20 > "$SCRATCH/events.json"
    python3 - "$1" "$SCRATCH/events.json" "$WHSEC" "$B/api/v1/webhooks/stripe" <<'PY'
import sys, json, time, hmac, hashlib, urllib.request
pi, path, secret, url = sys.argv[1:5]
ev = next(e for e in json.load(open(path))["data"] if e["data"]["object"]["id"] == pi)
body = json.dumps(ev).encode()
t = str(int(time.time()))
sig = hmac.new(secret.encode(), (t + ".").encode() + body, hashlib.sha256).hexdigest()
req = urllib.request.Request(url, data=body, method="POST", headers={"content-type": "application/json", "stripe-signature": f"t={t},v1={sig}"})
with urllib.request.urlopen(req) as r:
    print(f"delivered {ev['id']} ({ev['type']} for {pi}) -> HTTP {r.status}")
PY
}
state() {
    docker exec qr-walk-pg psql -U gacp -d gacp_walk -tAc "select 'order status='||status||' current_intent='||stripe_payment_intent_id from checkout_orders where id='$ORDER'"
    docker exec qr-walk-pg psql -U gacp -d gacp_walk -tAc "select 'event '||id||' '||type||' status='||status||' error='||coalesce(error,'-') from stripe_webhook_events order by \"receivedAt\""
}
echo "== LATE delivery of Stripe's canceled event for superseded PI_A (order now holds $PI_B)"
sleep 3
deliver "$PI_A"
state
echo "== cancel the CURRENT intent PI_B in Stripe, deliver its canceled event"
stripe_api -X POST "https://api.stripe.com/v1/payment_intents/$PI_B/cancel" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("PI_B:", d.get("status"))'
sleep 3
deliver "$PI_B"
state
echo "== money-equation probe against this database"
( cd "$TREE" && DATABASE_URL="postgresql://gacp:walkpw@127.0.0.1:55461/gacp_walk" bash scripts/probes/money-equation.sh 2>&1 | tail -1 )
docker exec qr-walk-pg psql -U gacp -d gacp_walk -tAc "select 'checkout_orders rows: '||count(*) from checkout_orders"
