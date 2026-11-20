#!/usr/bin/env bash
# Round 4d verification job. Queue it with: ~/work/state/heavy.sh <this file>
# Every tracked file the job changes (the old-page swap, mutants) is put back from HEAD on any
# exit, signals included; it refuses to start on a tree with tracked changes.
set -uo pipefail
W=/home/ubuntu/work/wt-privacy
OUT=$W/.audit/r4d
EV=$W/evidence/privacy-notice-v13
SHOTS=$EV/screenshots
OLD=fd334cde7
OLD_SUMMARY_PAGE=f0418ae4e
POLICY='apps/web-app/src/app/(marketing)/privacy-policy/page.tsx'
SHORT='apps/web-app/src/app/privacy/page.tsx'
FOOTER='apps/web-app/src/components/layout/Footer.tsx'
T='src/app/(marketing)/privacy-policy/__tests__'
OLD_MARKER='ระบบไม่ลบบันทึกเหล่านี้โดยอัตโนมัติ</li>'
NEW_MARKER='ระบบไม่ลบหมายเลขไอพีออกจากบันทึกการตรวจสอบ'
export PAYMENT_ADAPTER=mock
unset DATABASE_URL
DEV=

put_back_tracked_changes() {
  git -C "$W" diff --name-only -z | while IFS= read -r -d '' f; do
    git -C "$W" show "HEAD:$f" > "$W/$f"
  done
}
stop_dev() {
  if [ -n "$DEV" ]; then
    kill -- -"$DEV" 2>/dev/null || kill "$DEV" 2>/dev/null
    for _ in $(seq 1 20); do
      pgrep -g "$DEV" > /dev/null || break
      sleep 0.5
    done
    echo "dev server group $DEV left running: $(pgrep -g "$DEV" | wc -l)" >> "$OUT/36-phases.txt"
    DEV=
  fi
}
on_exit() {
  stop_dev
  put_back_tracked_changes
  {
    echo "tracked changes at exit (empty = clean):"
    git -C "$W" status --porcelain --untracked-files=no
    echo "finished $(date -u +%FT%TZ)"
  } >> "$OUT/30-tree.txt"
}
trap on_exit EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

cd "$W"
{
  echo "started $(date -u +%FT%TZ)"
  echo "HEAD $(git rev-parse HEAD)"
} > "$OUT/30-tree.txt"
: > "$OUT/36-phases.txt"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "tracked files changed before the job; abort" >> "$OUT/30-tree.txt"
  trap - EXIT
  exit 3
fi

web_files() {
  find apps/web-app/src -path '*/node_modules' -prune -o -type f \( "$@" \) -print | sed 's#^apps/web-app/##' | sort
}
RED_WEB='src/app/(marketing)/privacy-policy/__tests__/retention-matches-the-code.test.tsx'
RED_BACKEND=__tests__/unit/privacy-notice-audit-log-ip.test.js
git -C "$W" show "$OLD:$POLICY" > "$W/$POLICY"
echo "RED: page from $OLD, pins from HEAD $(git -C "$W" rev-parse HEAD)" > "$OUT/20-red-web.txt"
(cd "$W/apps/web-app" && node node_modules/jest/bin/jest.js --runInBand --runTestsByPath "$RED_WEB") >> "$OUT/20-red-web.txt" 2>&1
echo "exit $?" >> "$OUT/20-red-web.txt"
echo "RED: page from $OLD, pins from HEAD $(git -C "$W" rev-parse HEAD)" > "$OUT/21-red-backend.txt"
(cd "$W/apps/backend" && ./node_modules/.bin/jest --config jest.config.cjs --runInBand --runTestsByPath "$RED_BACKEND") >> "$OUT/21-red-backend.txt" 2>&1
echo "exit $?" >> "$OUT/21-red-backend.txt"
put_back_tracked_changes

mapfile -t GREEN_WEB < <(web_files \
  -path '*privacy-policy/__tests__/*.test.tsx' \
  -o -path '*/app/privacy/__tests__/*.test.tsx' \
  -o -path '*/app/trace/__tests__/*.test.ts' -o -path '*/app/trace/__tests__/*.test.tsx' \
  -o -path '*/__tests__/truthful-copy/*.test.ts' -o -path '*/__tests__/truthful-copy/*.test.tsx' \
  -o -path '*(marketing)/__tests__/*.test.ts' -o -path '*(marketing)/__tests__/*.test.tsx' \
  -o -name 'funding-acknowledgment.test.tsx' -o -name 'Footer.test.tsx' -o -name 'finance-copy-a3.test.ts' \
  -o -name 'payments-does-not-promise-online-payment.test.tsx' \
  -o -name 'checkout-does-not-promise-online-payment.test.tsx' -o -name 'invoice-step-prints-the-server-issuer.test.tsx' \
  -o -name 'dictionary-parity.test.ts' \
  -o -name 'auth-shell-split-scope.test.ts' -o -name 'currency-never-wraps.test.ts' \
  -o -name 'camera-only-on-verify-paths.test.ts' -o -name 'no-per-plant-source-references.test.ts' \
  -o -name 'no-screen-imports-a-literal-fee.test.ts' -o -name 'thai-staff-copy-has-no-english-jargon.test.ts' \
  -o -name 'x5-fix-c-force-status-consolidation.test.ts' -o -name 'no-route-shadows-a-live-step.test.ts' \
  -o -name 'no-event-read-inside-state-updater.test.ts' -o -name 'select-empty-value-guard.test.ts' \
  -o -name 'sentry-config.test.ts' -o -name 'closed-state-labels.test.ts' -o -name 'colour-classes-must-exist.test.ts')
[ "${#GREEN_WEB[@]}" -gt 0 ] || { echo "empty web list" >> "$OUT/30-tree.txt"; exit 4; }
printf '%s\n' "${GREEN_WEB[@]}" > "$OUT/31-green-web-files.txt"
(cd "$W/apps/web-app" && node node_modules/jest/bin/jest.js --runInBand --runTestsByPath "${GREEN_WEB[@]}") > "$OUT/32-green-web.txt" 2>&1
echo "exit $?" >> "$OUT/32-green-web.txt"

GREEN_BACKEND=(
  __tests__/unit/privacy-notice-account-retention.test.js
  __tests__/unit/privacy-notice-certificate-retention.test.js
  __tests__/unit/pdpa-erasure-respects-certificate-retention.test.js
  __tests__/unit/privacy-notice-research-use.test.js
  __tests__/unit/frontend-service-facts-mirror.test.js
  __tests__/unit/privacy-notice-platform-admin-reads-own-organization.test.js
  __tests__/unit/privacy-notice-site-contact-stages.test.js
  __tests__/unit/one-vat-rate-one-company-name.test.js
  __tests__/unit/invoice-issuers.test.js
  __tests__/unit/single-issuer-documents.test.js
  __tests__/unit/invoice-template-single-issuer.test.js
  __tests__/unit/finance-contact-email-mirror.test.js
  __tests__/unit/tenant-read-org-backstop.test.js
  __tests__/application-visibility.test.js
  __tests__/unit/consent-version-matches-the-published-document.test.js
  __tests__/unit/dataset-research-basis.test.js
  __tests__/unit/dataset-export-service.test.js
  __tests__/unit/pdpa-retention-job.test.js
  __tests__/unit/privacy-notice-audit-log-ip.test.js
  __tests__/unit/audit-log-viewer-handler.test.js
  __tests__/audit-log-viewer-handler.test.js
  __tests__/unit/require-admin-middleware.test.js
)
printf '%s\n' "${GREEN_BACKEND[@]}" > "$OUT/33-green-backend-files.txt"
(cd "$W/apps/backend" && ./node_modules/.bin/jest --config jest.config.cjs --runInBand --runTestsByPath "${GREEN_BACKEND[@]}") > "$OUT/33-green-backend.txt" 2>&1
echo "exit $?" >> "$OUT/33-green-backend.txt"

(cd "$W/apps/web-app" && npx tsc -p tsconfig.json --noEmit) > "$OUT/34-web-tsc.txt" 2>&1
echo "exit $?" >> "$OUT/34-web-tsc.txt"

cd "$W/apps/web-app"
PORT=34190
while ss -ltn "sport = :$PORT" | grep -q LISTEN; do PORT=$((PORT + 1)); done
NEXT_TELEMETRY_DISABLED=1 setsid node node_modules/next/dist/bin/next dev -p "$PORT" > "$OUT/35-next-dev.txt" 2>&1 9>&- &
DEV=$!
echo "dev server pid $DEV (own process group) on port $PORT" >> "$OUT/36-phases.txt"
wait_for_marker() {
  local marker=$1 body
  for _ in $(seq 1 150); do
    body=$(curl -s --max-time 60 "http://localhost:$PORT/privacy-policy" || true)
    case "$body" in *"$marker"*) echo found; return 0;; esac
    sleep 2
  done
  echo "missing"
}

git -C "$W" show "$OLD:$POLICY" > "$W/$POLICY"
echo "old ($OLD) page marker: $(wait_for_marker "$OLD_MARKER")" >> "$OUT/36-phases.txt"
node "$EV/capture.mjs" "http://localhost:$PORT" "$SHOTS" 08-r4d-old '#retention' > "$EV/08-r4d-old-capture.json" 2> "$OUT/37-old-capture.err"
echo "old capture exit $?" >> "$OUT/36-phases.txt"

put_back_tracked_changes
echo "head page marker: $(wait_for_marker "$NEW_MARKER")" >> "$OUT/36-phases.txt"
node "$EV/capture.mjs" "http://localhost:$PORT" "$SHOTS" 08-r4d-new '#retention' > "$EV/08-r4d-new-capture.json" 2> "$OUT/38-new-capture.err"
echo "head capture exit $?" >> "$OUT/36-phases.txt"
stop_dev
cd "$W"

MUT=$OUT/40-mutations.txt
echo "HEAD $(git rev-parse HEAD) $(date -u +%FT%TZ)" > "$MUT"
run_test() {
  local side=$1 test=$2
  if [ "$side" = web ]; then
    (cd "$W/apps/web-app" && node node_modules/jest/bin/jest.js --runInBand --runTestsByPath "$test") > "$OUT/41-last.txt" 2>&1
  else
    (cd "$W/apps/backend" && ./node_modules/.bin/jest --config jest.config.cjs --runInBand --runTestsByPath "$test") > "$OUT/41-last.txt" 2>&1
  fi
}
mutate() {
  local label=$1 file=$2 side=$3 test=$4 expr=$5
  perl -0pi -e "$expr" "$W/$file"
  if git -C "$W" diff --quiet -- "$file"; then
    echo "$label | NOT APPLIED | $file" >> "$MUT"
  else
    run_test "$side" "$test"
    local verdict="survived"
    grep -qE "Tests:.*failed" "$OUT/41-last.txt" && verdict="caught"
    echo "$label | $verdict | $test | $(grep -E '^Tests:' "$OUT/41-last.txt" | tail -1)" >> "$MUT"
    grep -E "✕" "$OUT/41-last.txt" | head -3 | sed 's/^/    /' >> "$MUT"
  fi
  put_back_tracked_changes
}
R="$T/retention-matches-the-code.test.tsx"
R="$T/retention-matches-the-code.test.tsx"
P=__tests__/unit/privacy-notice-audit-log-ip.test.js
mutate 'W45 item 2 payer name kept 7 years' "$POLICY" web "$R" \
  's/\Qจนครบ 5 ปีนับจากวันที่ระบบออกเอกสารการเงินฉบับล่าสุด\E/จนครบ 7 ปีนับจากวันที่ระบบออกเอกสารการเงินฉบับล่าสุด/'
mutate 'W46 item 2 counts from the end of the accounting period' "$POLICY" web "$R" \
  's/\Qนับจากวันที่ระบบออกเอกสารการเงินฉบับล่าสุดของผู้ชำระเงินรายนั้น\E/นับจากวันสิ้นรอบระยะเวลาบัญชี/'
mutate 'W47 item 2 loses the payer-name sentence' "$POLICY" web "$R" \
  's/\Q มาตรา 87\/3 ชื่อผู้ชำระเงิน\E[^\x27]*/ มาตรา 87\/3/'
mutate 'W48 item 4 names one reader role only (web pin)' "$POLICY" web "$R" \
  's/\Qมีเฉพาะผู้ดูแลระบบและผู้ดูแลแพลตฟอร์ม\E/มีเฉพาะผู้ดูแลระบบ/'
mutate 'W49 item 4 names one reader role only (backend pin)' "$POLICY" backend "$P" \
  's/\Qมีเฉพาะผู้ดูแลระบบและผู้ดูแลแพลตฟอร์ม\E/มีเฉพาะผู้ดูแลระบบ/'
mutate 'W50 item 4 says anonymization clears the IP (backend pin)' "$POLICY" backend "$P" \
  's/\Qระบบไม่ลบหมายเลขไอพีออกจากบันทึกการตรวจสอบ\E/ระบบลบหมายเลขไอพีออกจากบันทึกการตรวจสอบ/'
mutate 'M14 ipAddress leaves the v2 hash payload' apps/backend/middleware/audit-logger.js backend "$P" \
  's/\n\s*ipAddress: ipAddress \?\? null,//'
mutate 'M15 platform admin no longer bypasses requireRole' apps/backend/middleware/role-middleware.js backend "$P" \
  's/if \(normalizedUserRole === CANONICAL_ROLES\.SYSTEM_ADMIN_PLATFORM\) \{/if (false) {/'
mutate 'M16 requireAdmin admits company finance' apps/backend/middleware/require-admin.js backend "$P" \
  's/if \(canonicalRole !== CANONICAL_ROLES\.SYSTEM_ADMIN_DTAM\)/if (canonicalRole !== CANONICAL_ROLES.SYSTEM_ADMIN_DTAM \&\& canonicalRole !== CANONICAL_ROLES.FINANCE_OFFICER_PLATFORM)/'
mutate 'M17 ADMIN_ONLY gains the dispatcher' apps/backend/shared/canonical-rbac.js backend "$P" \
  's/(ADMIN_ONLY: \[\n\s*CANONICAL_ROLES\.SYSTEM_ADMIN_DTAM,)/$1\n    CANONICAL_ROLES.DISPATCHER,/'
mutate 'M18 a new route reads audit_logs directly' apps/backend/routes/api/admin/users.js backend "$P" \
  's/\z/\nasync function peek(prisma) { return prisma.auditLog.findMany({ take: 1 }); }\nvoid peek;\n/'
mutate 'M19 a new route calls the canonical reader' apps/backend/routes/api/admin/users.js backend "$P" \
  's/\z/\nasync function peek(s) { return s.listAuditEvents({}); }\nvoid peek;\n/'
mutate 'M20 anonymization clears audit-log IP' apps/backend/services/pdpa-erasure-service.js backend "$P" \
  's/\z/\nasync function clearAuditIp(tx, id) { return tx.auditLog.updateMany({ where: { actorId: id }, data: { ipAddress: null } }); }\nvoid clearAuditIp;\n/'
mutate 'M21 the admin router mounts audit-log before its guard' apps/backend/routes/api/admin/index.js backend "$P" \
  's/(router\.use\(authenticateProvider\);\n)/$1router.use(\x27\/audit-log\x27, require(\x27.\/audit-log\x27));\n/'
echo "finished $(date -u +%FT%TZ)" >> "$MUT"
