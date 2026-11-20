#!/usr/bin/env bash
# Item 2 (wizard readable text): helper text 13px and darker, scoped to wizard steps 1-6.
set -euo pipefail
cd "${1:?worktree root}/apps/web-app/src"
S=app/health/applications/new/_steps/steps
FILES=("$S"/step1-request-type.tsx "$S"/step2-identity.tsx "$S"/step3-site-land.tsx "$S"/step4-variety-purpose.tsx "$S"/step5-plans-docs.tsx "$S"/step6-review.tsx "$S"/requirement-slot-card.tsx components/holder/holder-picker.tsx)
sed -i -E 's/(^|[" `])text-(xs\b|\[1[01]px\])/\1text-[13px]/g; s/(^|[" `])text-muted-foreground\b/\1text-foreground\/80/g' "${FILES[@]}"
grep -c 'text-\[13px\]\|text-foreground/80' "${FILES[@]}"
