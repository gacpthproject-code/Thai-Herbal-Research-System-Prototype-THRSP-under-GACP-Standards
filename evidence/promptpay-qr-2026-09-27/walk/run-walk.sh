#!/usr/bin/env bash
# Reproduce the PromptPay walk from an empty scratch database (2026-09-27).
#
# Prerequisites already running (started by hand, see ../INDEX.md):
#   - `next start -p 3099` of this tree's apps/web-app build, INTERNAL_API_URL=http://127.0.0.1:8099
#   - `stripe listen --forward-to http://127.0.0.1:8099/api/v1/webhooks/stripe` (test mode)
# This script owns: the scratch Postgres container qr-walk-pg (:55461) and the
# backend on :8099 (this tree, DOTENV_CONFIG_PATH=$SCRATCH/walk.env).
#
# Secrets: walk.env is assembled OUTSIDE the repo from apps/backend/.env (test
# keys) plus the `stripe listen` signing secret; nothing here prints a value.
#
# Usage: run-walk.sh <scratch-dir-holding-walk.env> <runner-dir-with-node_modules-link>
set -euo pipefail
SCRATCH="$1"; RUNNER="$2"
HERE="$(cd "$(dirname "$0")" && pwd)"
TREE="$(cd "$HERE/../../.." && pwd)"
DBURL='postgresql://gacp:walkpw@127.0.0.1:55461/gacp_walk?schema=public'
source ~/.nvm/nvm.sh >/dev/null; nvm use 24 >/dev/null

kill_port() { # by port owner, never pkill -f
    local pid
    pid=$(ss -ltnp "sport = :$1" 2>/dev/null | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2 || true)
    [ -n "$pid" ] && kill "$pid" && sleep 3 || true
}

echo "== 1. fresh scratch Postgres + migrate deploy"
kill_port 8099
docker rm -f qr-walk-pg >/dev/null 2>&1 || true
docker run -d --name qr-walk-pg -p 127.0.0.1:55461:5432 -e POSTGRES_PASSWORD=walkpw -e POSTGRES_USER=gacp -e POSTGRES_DB=gacp_walk postgres:15-alpine >/dev/null
until docker exec qr-walk-pg pg_isready -U gacp >/dev/null 2>&1; do sleep 1; done; sleep 2
(cd "$TREE/apps/backend" && DATABASE_URL="$DBURL" npx prisma migrate deploy --schema prisma/schema 2>&1 | tail -1)

echo "== 2. backend from this tree on :8099"
(cd "$TREE/apps/backend" && DOTENV_CONFIG_PATH="$SCRATCH/walk.env" nohup node -r dotenv/config server.js > "$SCRATCH/backend.log" 2>&1 &)
until curl -sf http://127.0.0.1:8099/api/health >/dev/null; do sleep 2; done
echo "backend /api/health 200"

nid() { python3 -c "
d=[int(c) for c in '$1']
s=sum(x*w for x,w in zip(d,range(13,1,-1)))
print('$1'+str((11-s%11)%10))"; }
NID_A=$(nid 110020092701); NID_B=$(nid 110020092702)
PW='WalkPay#2026qr'
register() { # $1 nid  $2 extra json
    curl -s -X POST http://127.0.0.1:8099/api/auth/health/register -H 'content-type: application/json' \
      -d "{\"identifier\":\"$1\",\"password\":\"$PW\",\"phoneNumber\":\"08123456${1: -2}\",\"firstName\":\"ทดสอบ\",\"lastName\":\"พร้อมเพย์\",\"accountType\":\"INDIVIDUAL\",\"acceptedTermsOfService\":true,\"acceptedPrivacyPolicy\":true$2}" \
      | python3 -c 'import sys,json; d=json.load(sys.stdin); print("register", d.get("success"), d.get("message") or d.get("error"))'
}
echo "== 3. register two farmers through POST /api/auth/health/register"
register "$NID_A" ',"email":"walk-farmer@example.com"'
register "$NID_B" ''

echo "== 4. seed one payable application each; issue quotations (see issue-quotation-around-F-QT-ISSUER-UNDEFINED.js)"
cd "$TREE/apps/backend"
SEED_A=$(DATABASE_URL="$DBURL" node "$HERE/seed-payable-application.js" "$NID_A" company)
SEED_B=$(DATABASE_URL="$DBURL" node "$HERE/seed-payable-application.js" "$NID_B" personal)
echo "A $SEED_A"; echo "B $SEED_B"
j() { python3 -c "import json,sys; print(json.loads(sys.argv[1])[sys.argv[2]])" "$1" "$2"; }
for S in "$SEED_A" "$SEED_B"; do
    DOTENV_CONFIG_PATH="$SCRATCH/walk.env" DATABASE_URL="$DBURL" node -r dotenv/config "$HERE/issue-quotation-around-F-QT-ISSUER-UNDEFINED.js" "$(j "$S" applicationId)" 2>/dev/null | grep quotationNumber
done

echo "== 5. walk A (full) and walk B (email input)"
rm -f "$HERE"/*.png "$HERE"/*trace.txt
cp "$HERE/walk.mjs" "$RUNNER/walk.mjs"
cd "$RUNNER"
node walk.mjs full "$NID_A" "$PW" "$(j "$SEED_A" entityId)" "$(j "$SEED_A" applicationId)" "$HERE" "A" || true
node walk.mjs email-input "$NID_B" "$PW" - "$(j "$SEED_B" applicationId)" "$HERE" "B" "typed-at-checkout@example.com" || true

echo "== 6. what the database holds afterwards (walk A application)"
APP_A=$(j "$SEED_A" applicationId)
docker exec qr-walk-pg psql -U gacp -d gacp_walk -c "
select a.status as application_status, o.status as order_status, o.\"settledAt\" is not null as settled_at_set,
       i.status as invoice_status, i.\"receiptNumber\", i.\"receiptStatus\", i.\"receiptIssuedBy\",
       t.status as charge_status, t.amount as charge_satang, q.\"quotationNumber\", q.status as quotation_status
from applications a
join checkout_orders o on o.\"applicationId\" = a.id
join invoices i on i.id = o.\"invoiceId\"
join payment_transactions t on t.id = o.\"paymentTransactionId\"
join quotations q on q.id::text = o.quotation_id::text
where a.id = '$APP_A';" \
  -c "select type, status, count(*) from stripe_webhook_events group by 1,2 order by 1;"
