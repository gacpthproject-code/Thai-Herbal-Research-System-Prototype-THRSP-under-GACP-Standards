#!/usr/bin/env bash
# Each mutant breaks the code one way; the named pin must fail; the file is restored from a copy.
# S2 (entity name never cleared) was dropped after 2dabdab95 moved the name out of PERSONAL_ENTITY_DATA; B1 and B2 cover it.
set -uo pipefail
S=${PDPA_SCRATCH:-/tmp/pdpa-fix}
W=$S/with-db.sh
B=/home/ubuntu/work/wt-pdpa/apps/backend
OUT=${1:-$S/runs/mutants.txt}; : > "$OUT"
NEG=__tests__/unit/privacy-notice-section7-no-automatic-deletion.test.js
SCHEMA=__tests__/unit/account-anonymization-covers-every-column.test.js
PG=__tests__/integration/account-anonymization-real-postgres.test.js
JOB=__tests__/unit/pdpa-retention-job.test.js
YEARS=__tests__/unit/tax-document-retention-is-five-years.test.js
run() { # name file mode payload tests...
  local name=$1 file=$2 mode=$3 payload=$4; shift 4
  cp "$B/$file" $S/mutant.bak
  if [ "$mode" = append ]; then printf '\n%s\n' "$payload" >> "$B/$file"; else sed -i "$payload" "$B/$file"; fi
  if cmp -s $S/mutant.bak "$B/$file"; then echo "== $name: MUTATION DID NOT APPLY" >> "$OUT"; return; fi
  echo "== $name ($file): $(diff $S/mutant.bak "$B/$file" | grep '^[<>]' | head -2 | tr '\n' ' ')" >> "$OUT"
  (cd "$B" && $W npx jest --config jest.config.cjs --runInBand "$@" 2>&1) | grep -E '^\s+(✓|✕)|^Tests:|would make' >> "$OUT"
  cp $S/mutant.bak "$B/$file"
  cmp -s $S/mutant.bak "$B/$file" && echo "restored: yes" >> "$OUT" || echo "restored: NO" >> "$OUT"
}
run N1-job-deletes-documents jobs/payment-closure-job.js append 'async function mutantN1(prisma) { await prisma.applicationDocument.deleteMany({ where: {} }); }' $NEG
run N2-transitive-raw-audit-delete services/document-precheck/clear-text.js append 'async function mutantN2(tx) { await tx.$executeRawUnsafe("DELETE FROM audit_logs WHERE 1=0"); }' $NEG
run N3-cron-deletes-a-file cron/renewal-reminder-cron.js append 'async function mutantN3(fs, p) { await fs.promises.unlink(p); }' $NEG
run N4-job-clears-formData jobs/site-contact-request-job.js append 'async function mutantN4(tx, id) { await tx.application.update({ where: { id }, data: { formData: null } }); }' $NEG
run S1-user-laserCode-forgotten services/account-anonymization.js sed '/^        laserCode: null,$/d' $SCHEMA $PG
run P1-sweep-query-outside-withDeletedRows jobs/pdpa-retention-job.js sed 's/withDeletedRows(async () => prisma.user.findMany/withDeletedRows(() => prisma.user.findMany/' $PG
run A1-erasure-audit-without-role services/pdpa-erasure-service.js sed '761s/^        actorRole,$/        actorRole: undefined,/' $PG
run B1-payer-name-cleared-at-once services/account-anonymization.js sed 's/const keepName = await payerNameOnTaxDocumentInRetention(tx, entityId, now);/const keepName = false;/' $PG
run B2-kept-name-never-revisited jobs/pdpa-retention-job.js sed 's/displayName: { not: ERASED },/displayName: ERASED,/' $PG
run J1-company-entity-swept-as-personal services/account-anonymization.js sed "s/where: { userId, role: 'OWNER', entity: { type: 'INDIVIDUAL' } },/where: { userId, role: 'OWNER' },/" $PG
run T1-door-count-scoped-to-request-tenant services/account-anonymization.js sed "s#^const { withoutTenantScope } = require('./tenant-context');#const withoutTenantScope = (fn) => fn();#" $PG
run C1-credit-note-date-ignored services/account-anonymization.js sed '/^                { creditNotes: { some: issuedSince } },$/d' $PG
run F1-tax-retention-seven-years services/account-anonymization.js sed 's/^const TAX_DOCUMENT_RETENTION_YEARS = 5;$/const TAX_DOCUMENT_RETENTION_YEARS = 7;/' $PG
run F1b-notice-says-seven-years services/notification-fanout-service.js sed 's/(เก็บรักษาไม่น้อยกว่า 5 ปี) และจะถูก/(เก็บรักษา 7 ปี) และจะถูก/' $YEARS
run F2a-drafts-kept services/account-anonymization.js sed 's/const drafts = await tx.applicationDraft.deleteMany({ where: { userId } });/const drafts = { count: 0 };/' $PG
run F2b-notifications-kept services/account-anonymization.js sed 's/const notifications = await tx.notification.deleteMany({/const notifications = await tx.notification.count({/' $PG
run F2c-survey-answers-kept services/account-anonymization.js sed 's/const surveyResponses = await anonymiseResponsesOfUser(tx, userId);/const surveyResponses = 0;/' $PG
run F3-hold-not-rechecked-in-write services/account-anonymization.js sed 's/where: { id: userId, legalHold: false, isAnonymized: false },/where: { id: userId, isAnonymized: false },/' $JOB
run O2a-consent-ip-kept services/account-anonymization.js sed 's/const consents = await tx.userConsent.updateMany({ where: { userId }, data: NO_REQUEST_CONTEXT });/const consents = { count: 0 };/' $PG
run O2b-event-ip-kept services/account-anonymization.js sed 's/where: { actorUserId: userId }, data: NO_REQUEST_CONTEXT,/where: { actorUserId: userId }, data: {},/' $PG
run O2c-switch-ip-kept services/account-anonymization.js sed 's/const contextSwitches = await tx.entityContextSwitch.updateMany({ where: { userId }, data: NO_REQUEST_CONTEXT });/const contextSwitches = { count: 0 };/' $PG
run O3-avatar-file-kept services/account-anonymization.js sed 's/const avatarDeleted = await deleteAvatarFile(before?.privacySettings?.avatar);/const avatarDeleted = false;/' $PG
echo "exit=0" >> "$OUT"
