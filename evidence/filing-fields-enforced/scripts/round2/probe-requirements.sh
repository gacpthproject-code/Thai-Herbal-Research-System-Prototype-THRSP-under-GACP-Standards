#!/usr/bin/env bash
# What the revision page reads for app R: the requirements payload with reviews, slots trimmed to id/satisfied/uploadedAt.
set -uo pipefail
cd /home/ubuntu/work/wt-filingfields/apps/backend || exit 2
set -a; . /tmp/ff/backend.env; set +a
node -r /tmp/ff/r2/walk/bind-localhost.js server.js > /tmp/ff/r2/backend-probe.log 2>&1 &
BE=$!
for i in $(seq 1 90); do curl -sf -o /dev/null http://127.0.0.1:18443/api/health && break; sleep 1; done
R=$(python3 -c "import json;print(json.load(open('/tmp/ff/r2/walk/fixture.json'))['revision'])")
TOKEN=$(python3 -c "import json;print(json.load(open('/tmp/ff/r2/walk/fixture.json'))['token'])")
curl -s -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:18443/api/applications/$R/requirements?includeReviews=1" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); p=d.get('data',d); print('editable', p.get('editable'), 'complete', p.get('complete')); print('requested', p.get('requestedDocuments')); print('slots', [(s['slotId'], s.get('satisfied'), s.get('uploadedAt')) for s in p.get('slots',[])]); print('blocking', p.get('blockingIssues'))"
kill $BE; wait $BE 2>/dev/null
