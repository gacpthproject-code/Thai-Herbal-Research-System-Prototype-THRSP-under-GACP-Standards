#!/usr/bin/env bash
# usage: legacy-step-callers.sh <repo-root>
# Every file outside node_modules/.git/evidence/reports that names an applicant door AND carries a
# step-keyed marker (steps:, 'steps', stepData). The legacy submit branch was chosen by those keys.
root="$1"; cd "$root" || exit 1
grep -rlE "applications/(submit|draft|prepare)|/revision" \
  --include=*.js --include=*.ts --include=*.tsx --include=*.dart --include=*.py --include=*.sh . 2>/dev/null \
  | grep -vE "node_modules|^\./\.git/|^\./\.claude/|^\./evidence/|^\./reports/" | sort > /tmp/legacy-door-files.$$
echo "files naming an applicant door: $(wc -l < /tmp/legacy-door-files.$$)"
while read -r f; do
  if grep -qE "steps\s*:\s*\{|stepData|['\"]steps['\"]" "$f"; then
    case "$f" in
      *__tests__*|*.test.*|*.spec.*|*/e2e*|*/playwright/*) kind=test ;;
      *) kind=PRODUCT-OR-SCRIPT ;;
    esac
    echo "$kind $f"
  fi
done < /tmp/legacy-door-files.$$
rm -f /tmp/legacy-door-files.$$
