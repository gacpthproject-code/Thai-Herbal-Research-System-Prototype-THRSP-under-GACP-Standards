#!/usr/bin/env bash
# Round 4b verification job. Queue it with: ~/work/state/heavy.sh <this file>
# Every tracked file the job changes (page swaps for the old capture, mutants) is put back
# from HEAD on any exit, signals included; it refuses to start on a tree with tracked changes.
set -uo pipefail
W=/home/ubuntu/work/wt-privacy
OUT=$W/.audit/r4b
EV=$W/evidence/privacy-notice-v13
SHOTS=$EV/screenshots
OLD=f0418ae4e
POLICY='apps/web-app/src/app/(marketing)/privacy-policy/page.tsx'
SHORT='apps/web-app/src/app/privacy/page.tsx'
FOOTER='apps/web-app/src/components/layout/Footer.tsx'
T='src/app/(marketing)/privacy-policy/__tests__'
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
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "tracked files changed before the job; abort" >> "$OUT/30-tree.txt"
  trap - EXIT
  exit 3
fi

web_files() {
  find apps/web-app/src -path '*/node_modules' -prune -o -type f \( "$@" \) -print | sed 's#^apps/web-app/##' | sort
}
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
)
printf '%s\n' "${GREEN_BACKEND[@]}" > "$OUT/33-green-backend-files.txt"
(cd "$W/apps/backend" && ./node_modules/.bin/jest --config jest.config.cjs --runInBand --runTestsByPath "${GREEN_BACKEND[@]}") > "$OUT/33-green-backend.txt" 2>&1
echo "exit $?" >> "$OUT/33-green-backend.txt"

(cd "$W/apps/web-app" && npx tsc -p tsconfig.json --noEmit) > "$OUT/34-web-tsc.txt" 2>&1
echo "exit $?" >> "$OUT/34-web-tsc.txt"

cd "$W/apps/web-app"
PORT=34190
while ss -ltn "sport = :$PORT" | grep -q LISTEN; do PORT=$((PORT + 1)); done
NEXT_TELEMETRY_DISABLED=1 setsid node node_modules/next/dist/bin/next dev -p "$PORT" > "$OUT/35-next-dev.txt" 2>&1 &
DEV=$!
wait_for_marker() {
  local marker=$1 body
  for _ in $(seq 1 150); do
    body=$(curl -s --max-time 60 "http://localhost:$PORT/privacy-policy" || true)
    case "$body" in *"$marker"*) echo found; return 0;; esac
    sleep 2
  done
  echo "missing"
}
redirect_line() {
  curl -s -o /dev/null --max-time 60 -w "%{http_code} %{redirect_url}" "http://localhost:$PORT$1" | sed "s#http://localhost:$PORT##"
}

for f in "$POLICY" "$SHORT" "$FOOTER"; do git -C "$W" show "$OLD:$f" > "$W/$f"; done
echo "old ($OLD) policy page marker id=\"dpo\": $(wait_for_marker 'id="dpo"') on port $PORT" >> "$OUT/36-phases.txt"
for p in /privacy /auth/health/privacy; do echo "old GET $p -> $(redirect_line "$p")" >> "$OUT/36-phases.txt"; done
node "$EV/capture.mjs" "http://localhost:$PORT" "$SHOTS" 05-r4-old \
  '#purpose' '#lawful-basis' '#data-categories' '#recipients' '#retention' '#security' '#dpo' '#updates' > "$EV/05-r4-old-capture.json" 2> "$OUT/37-old-capture.err"
echo "old policy capture exit $?" >> "$OUT/36-phases.txt"
node "$EV/redirect-check.mjs" "http://localhost:$PORT" "$SHOTS" 06-r4b-old /privacy /auth/health/privacy > "$EV/06-r4b-old-redirects.json" 2> "$OUT/37-old-redirects.err"
echo "old redirect check exit $?" >> "$OUT/36-phases.txt"

put_back_tracked_changes
echo "head policy page marker id=\"privacy-contact\": $(wait_for_marker 'id="privacy-contact"')" >> "$OUT/36-phases.txt"
for p in /privacy /auth/health/privacy /privacy-policy; do echo "head GET $p -> $(redirect_line "$p")" >> "$OUT/36-phases.txt"; done
node "$EV/capture.mjs" "http://localhost:$PORT" "$SHOTS" 05-r4-new \
  '#purpose' '#lawful-basis' '#data-categories' '#recipients' '#retention' '#security' '#privacy-contact' '#updates' > "$EV/05-r4-new-capture.json" 2> "$OUT/38-new-capture.err"
echo "head policy capture exit $?" >> "$OUT/36-phases.txt"
node "$EV/redirect-check.mjs" "http://localhost:$PORT" "$SHOTS" 06-r4b-new /privacy /auth/health/privacy > "$EV/06-r4b-new-redirects.json" 2> "$OUT/38-new-redirects.err"
echo "head redirect check exit $?" >> "$OUT/36-phases.txt"
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
mutate 'W14 section 10 claims ISO 27001 in Thai script' "$POLICY" web "$T/thai-words-only.test.tsx" \
  's/\Qและมีบันทึกการตรวจสอบ\E/และมีบันทึกการตรวจสอบ ตามมาตรฐานไอเอสโอ 27001/'
mutate 'W14b section 10 claims 27001 as a bare number' "$POLICY" web "$T/thai-words-only.test.tsx" \
  's/\Qและมีบันทึกการตรวจสอบ\E/และมีบันทึกการตรวจสอบ ตามมาตรฐาน 27001/'
mutate 'W15 section 12 notice 30 -> 7 days' "$POLICY" web "$T/contact-claims-no-officer-and-no-email.test.tsx" \
  's/\Qล่วงหน้าไม่น้อยกว่า 30 วัน\E/ล่วงหน้าไม่น้อยกว่า 7 วัน/'
mutate 'W16 section 7 account data 5 -> 10 years' "$POLICY" web "$T/retention-matches-the-code.test.tsx" \
  's/\Qจัดเก็บไม่เกิน 5 ปีนับจากวันสร้างบัญชี\E/จัดเก็บไม่เกิน 10 ปีนับจากวันสร้างบัญชี/'
mutate 'W17 section 11 title names the officer again' "$POLICY" web "$T/contact-claims-no-officer-and-no-email.test.tsx" \
  's/\Q11. ช่องทางติดต่อเรื่องข้อมูลส่วนบุคคล\E/11. เจ้าหน้าที่คุ้มครองข้อมูลส่วนบุคคล/'
mutate 'W18 section 12 promises an email notice again' "$POLICY" web "$T/contact-claims-no-officer-and-no-email.test.tsx" \
  's/\Qจะประกาศฉบับใหม่ไว้ที่หน้านี้\E/จะแจ้งผ่านอีเมลและประกาศฉบับใหม่ไว้ที่หน้านี้/'
mutate 'W19 section 10 old two-factor sentence' "$POLICY" web "$T/staff-two-factor-waits-for-the-go-live-gate.test.tsx" \
  's/\Qเจ้าหน้าที่ทุกบัญชีต้องลงทะเบียนและใช้การยืนยันตัวตนสองปัจจัยด้วยแอปยืนยันตัวตนก่อนเข้าใช้งาน\E/ใช้การยืนยันตัวตนสองปัจจัยสำหรับเจ้าหน้าที่ตรวจประเมินและผู้ดูแลระบบ/'
mutate 'W20 section 4 birth date back' "$POLICY" web "$T/says-what-is-kept.test.tsx" \
  's/\Qเลขประจำตัวประชาชน เลขทะเบียนนิติบุคคล\E/เลขประจำตัวประชาชน เลขทะเบียนนิติบุคคล วันเดือนปีเกิด/'
mutate 'W21 section 7 tax documents 7 years again' "$POLICY" web "$T/retention-matches-the-code.test.tsx" \
  's/\Qจัดเก็บไม่น้อยกว่า 5 ปีตามประมวลรัษฎากร มาตรา 87\/3\E/จัดเก็บไม่น้อยกว่า 7 ปี ตามประมวลรัษฎากร/'
mutate 'W22 section 7 logs kept 1 year again' "$POLICY" web "$T/retention-matches-the-code.test.tsx" \
  's/\Qจัดเก็บตลอดอายุการให้บริการของระบบเพื่อการตรวจสอบย้อนหลัง ระบบไม่ลบบันทึกเหล่านี้โดยอัตโนมัติ\E/จัดเก็บ 1 ปีตามแนวปฏิบัติด้านความมั่นคงปลอดภัยสารสนเทศ/'
mutate 'W23 section 6 says the department issues certificates now' "$POLICY" web "$T/department-is-an-independent-controller.test.tsx" \
  's/\Qได้รับข้อมูลคำขอจากบริษัทเพื่อพิจารณาคำขอรับรอง\E/ได้รับข้อมูลคำขอจากบริษัทเพื่อออกใบรับรอง/'
mutate 'W24 section 3 drops the disclosure basis' "$POLICY" web "$T/department-is-an-independent-controller.test.tsx" \
  's/\Q ซึ่งรวมถึงการเปิดเผยข้อมูลคำขอแก่กรมการแพทย์แผนไทยและการแพทย์ทางเลือกเพื่อพิจารณาคำขอตามที่ผู้ยื่นคำขอขอรับการรับรอง\E//'
mutate 'W25 section 11 drops the department route' "$POLICY" web "$T/department-is-an-independent-controller.test.tsx" \
  's/\n\s*\x27คำขอใช้สิทธิเกี่ยวกับข้อมูลที่กรม[^\n]*//'
mutate 'W26 research claims answers cannot identify anyone' "$POLICY" web "$T/research-uses-consented-survey-answers-only.test.tsx" \
  's/\Qรหัสอ้างอิงคำตอบถูกแทนด้วยรหัสแฝงโดยไม่มีรหัสบัญชีของผู้ตอบ\E/คำตอบถูกทำให้ระบุตัวตนไม่ได้/'
mutate 'W27 research store deletes within 30 days' "$POLICY" web "$T/research-uses-consented-survey-answers-only.test.tsx" \
  's/\Qต้องลบคำตอบนั้นภายใน 90 วัน\E/ต้องลบคำตอบนั้นภายใน 30 วัน/'
mutate 'W28 research drops the never-used clause' "$POLICY" web "$T/research-uses-consented-survey-answers-only.test.tsx" \
  's/\Q ข้อมูลคำขอ ข้อมูลฟาร์ม และข้อมูลการปลูกไม่นำไปใช้เพื่อการวิจัย\E//'
mutate 'W29 research names the funder' "$POLICY" web "$T/research-uses-consented-survey-answers-only.test.tsx" \
  's/\Qที่ดำเนินการร่วมกับมหาวิทยาลัยราชภัฏสวนสุนันทา\E/ที่ได้รับทุนจาก บพข. ร่วมกับมหาวิทยาลัยราชภัฏสวนสุนันทา/'

mutate 'M7 User.retainUntil 5 -> 10 years' apps/backend/prisma/schema/auth.prisma backend "__tests__/unit/privacy-notice-account-retention.test.js" \
  's/(\n  retainUntil DateTime \@default\(dbgenerated\("\(now\(\) \+ \x27)5 years/${1}10 years/'
mutate 'M8 farm-operation data gets a research ruling' apps/backend/data/datasets/research-use-bases.js backend "__tests__/unit/privacy-notice-research-use.test.js" \
  's/FARM_OPERATION: Object\.freeze\(\[\]\)/FARM_OPERATION: Object.freeze([{ effectiveFrom: "2026-01-01", inForce: true }])/'
mutate 'M9 withdrawn-list deletion duty 90 -> 30 days' apps/backend/data/datasets/dataset-domains.js backend "__tests__/unit/privacy-notice-research-use.test.js" \
  's/\Qให้เสร็จภายใน 90 วัน\E/ให้เสร็จภายใน 30 วัน/'
mutate 'M10 responseId leaves without a pseudonym' apps/backend/data/datasets/dataset-domains.js backend "__tests__/unit/privacy-notice-research-use.test.js" \
  's/(\{ field: \x27responseId\x27, )publish: PUBLISH\.PSEUDONYM, /$1/'
mutate 'M11 an application domain leaves without a ruling' apps/backend/data/datasets/dataset-domains.js backend "__tests__/unit/privacy-notice-research-use.test.js" \
  's/(const DATASET_DOMAINS = \[\n)/${1}    { key: \x27applications\x27, model: \x27Application\x27, basis: RESEARCH_BASIS.SURVEY_STRUCTURE, fields: [], withheld: [] },\n/'
mutate 'M12 an older consent version is accepted' apps/backend/data/datasets/dataset-domains.js backend "__tests__/unit/privacy-notice-research-use.test.js" \
  's/Object\.freeze\(\[\x27research-survey-notice-th-v3\x27\]\)/Object.freeze([\x27research-survey-notice-th-v2\x27, \x27research-survey-notice-th-v3\x27])/'
MOVED='src/app/privacy/__tests__/moved-to-privacy-policy.test.tsx'
mutate 'W30 /privacy renders the old summary page again' "$SHORT" web "$MOVED" \
  "\$_ = qx(git -C '$W' show '$OLD:$SHORT')"
mutate 'W31 /privacy redirects temporarily (307) instead of permanently' "$SHORT" web "$MOVED" \
  's/permanentRedirect/redirect/g'
mutate 'W32 /privacy redirects to the terms page' "$SHORT" web "$MOVED" \
  "s#'/privacy-policy'#'/terms'#"
mutate 'W33 the footer links /privacy again' "$FOOTER" web "$MOVED" \
  "s#href: '/privacy-policy'#href: '/privacy'#"
mutate 'W34 the sitemap lists /privacy again' apps/web-app/src/app/sitemap.ts web "$MOVED" \
  "s#(\n\s*\{ path: '/terms',[^\n]*)#\$1\n    { path: '/privacy', priority: 0.5, changeFrequency: 'yearly' },#"
mutate 'W35 the retired contact sentence comes back in a source file' apps/web-app/src/app/terms/page.tsx web "$MOVED" \
  's#^#// กรณีต้องการสอบถามเพิ่มเติม สามารถติดต่อหน่วยงานเจ้าของระบบผ่านช่องทางราชการที่ประกาศ\n#'
mutate 'W36 a mobile screen links the old address' apps/mobile-app/lib/main.dart web "$MOVED" \
  "s#\\z#\nconst legacyPrivacyUrl = 'https://gacpth.com/privacy';\n#"
mutate 'W37 section 7 item 3 back to 10 years after expiry' "$POLICY" web "$T/retention-matches-the-code.test.tsx" \
  's/\Qจัดเก็บเพื่อการตรวจสอบย้อนหลัง ระบบไม่ลบข้อมูลเหล่านี้โดยอัตโนมัติ ส่วนชื่อและที่อยู่ของผู้ยื่นคำขอบนใบรับรองจัดเก็บไม่น้อยกว่า 5 ปีนับจากวันออกใบรับรอง\E/จัดเก็บไม่น้อยกว่า 10 ปีนับจากวันสิ้นอายุใบรับรอง/'
mutate 'W38 section 7 item 3 says the name goes automatically after 5 years' "$POLICY" web "$T/retention-matches-the-code.test.tsx" \
  's/\Qเฉพาะเมื่อผู้ยื่นคำขอใช้สิทธิขอลบข้อมูลและยืนยันคำขอหลังครบ 5 ปีแล้ว\E/โดยอัตโนมัติเมื่อครบ 5 ปี/'
mutate 'W39 section 7 catch-all line comes back' "$POLICY" web "$T/retention-matches-the-code.test.tsx" \
  's/(\n(\s*)\x27บันทึกการตรวจสอบและบันทึกความปลอดภัย:[^\n]*)/$1\n$2\x27เมื่อพ้นระยะเวลาที่กำหนด ระบบจะดำเนินการลบหรือทำให้ข้อมูลไม่สามารถระบุตัวบุคคลได้\x27,/'
mutate 'M13 Certificate.retainUntil 5 -> 10 years' apps/backend/prisma/schema/certification.prisma backend \
  __tests__/unit/privacy-notice-certificate-retention.test.js \
  's/(\n  retainUntil DateTime \@default\(dbgenerated\("\(now\(\) \+ \x27)5 years/${1}10 years/'
echo "finished $(date -u +%FT%TZ)" >> "$MUT"
