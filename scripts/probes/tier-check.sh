#!/usr/bin/env bash
# tier-check — classify a PR's changed files into a MERGE TIER by PATH ONLY.
#
# Mandate 2026-08-04 §4: the tier is decided by this path-based script, never by
# an agent's judgement. Until this probe is merged and wired into CI, every PR
# stays manual-merge.
#
#   Tier A — tests, docs, refactor-no-behavior, UI copy        (auto-merge eligible)
#   Tier B — general business logic / UI / workflow            (auto-merge eligible)
#            NOT touching money / terminal state / the Tier-C surfaces below
#   Tier C — operator-merge FOREVER: money/payment mutation, auth/identity,
#            prisma migration/schema, compose/env/deploy/CI, any secret material,
#            operator-owned governance (CLAUDE.md/HARNESS.md/probes), anything
#            whose rollback is harder than `git revert`.
#
# PRECEDENCE C > B > A, and it is DELIBERATELY C-inclusive: a false C only costs
# a manual merge (safe); a false A could auto-merge a money/auth change (unsafe).
# So a path that plausibly touches a Tier-C surface is classified C.
#
# PR tier = C if ANY changed file is C; else B if ANY file is not A; else A.
#
# Contract (differs from pass/fail probes — this one CLASSIFIES):
#   stdout: `TIER=<A|B|C>` on the last line, preceded by a per-file breakdown.
#   exit 0  = classification succeeded (this is the PASS state)
#   exit 2  = BLOCKED: could not obtain a file list (no base ref / not a repo)
#   `--json` emits {"tier":"C","files":[{"path":..,"tier":..,"reason":..}]}.
#
# Usage:
#   scripts/probes/tier-check.sh                 # diff origin/main...HEAD
#   BASE_REF=origin/develop scripts/probes/tier-check.sh
#   scripts/probes/tier-check.sh --json
#   printf '%s\n' apps/backend/x.js docs/y.md | scripts/probes/tier-check.sh -  # classify a list on stdin
#
# NOTE: tier eligibility is necessary, not sufficient. A Tier-A/B result only
# means the PATHS clear the operator-only net; auto-merge still requires the §4
# conditions (green gates, independent QA approve, ratchet flat, Senior review
# for B, Security pass, Golden Path regression not red).

source "$(dirname "$0")/_lib.sh"
# Byte semantics for every regex below: non-ASCII bytes are "not printable ASCII",
# ranges are byte ranges, and ${p,,} lower-cases ASCII only.
export LC_ALL=C

BASE_REF="${BASE_REF:-origin/main}"
JSON=0
FROM_STDIN=0
SELFTEST=0
for arg in "$@"; do
    case "$arg" in
        --json) JSON=1 ;;
        --selftest) SELFTEST=1 ;;
        -)      FROM_STDIN=1 ;;
        *)      ;;
    esac
done

# ── Tier-C STRUCTURAL patterns — ABSOLUTE. These beat everything, including docs:
# a compose/env/prisma/deploy/governance file is Tier C no matter its extension.
C_STRUCTURAL=(
    "governance|^(CLAUDE|HARNESS|AUDIT_LEDGER|GOALS)\.md$|(^|/)CLAUDE\.md$"
    "governance|(^|/)scripts/probes/"
    "governance|(^|/)scripts/check-done\.sh$"
    "governance|^scripts/ci/|^\.github/CODEOWNERS$|^\.husky/"
    "governance|(^|/)\.claude/(agents|commands)/|(^|/)loop\.sh$|(^|/)scripts/session-check\.sh$"
    "prisma-migration|(^|/)prisma/migrations/"
    "prisma-schema|(^|/)prisma/schema/|\.prisma$"
    "schema-ddl|\.sql$|^scripts/migrations/|(^|/)prisma/sql/"
    "scanner-cover|(^|/)\.(gitleaksignore|trufflehogignore|semgrepignore|dockerignore|snyk)$|(^|/)[^/]*(gitleaks|trufflehog)[^/]*$|(^|/)[^/]*(accepted|allow-?list|exceptions?|waivers?)[^/]*\.(txt|json|ya?ml|toml)$"
    # Exact paths of auth/scoping code whose names no token can reach (round 3).
    # This list only ADDS files to C — it can never lower a tier, so it is not a
    # cover (L6); an agent may extend it. Removing a line needs operator review.
    "auth-exact-path|^(apps/backend/services/storage-service\.js|apps/web-app/src/middleware\.ts|apps/web-app/src/lib/middleware-helpers\.ts|apps/backend/middleware/active-entity-middleware\.js|apps/backend/services/entity-context\.js)$"
    # Operator decision 2026-09-26: package manifests and lockfiles (any depth),
    # npm config and eslint config are C — they redefine gate scripts and husky
    # hooks, change what installs, or switch off the status-write lint rule.
    # lint-staged config (.lintstagedrc*, lint-staged.config.*) is here too: it decides
    # what the pre-commit gate runs, the same reason as .husky/ and package.json.
    "build-config|(^|/)(package\.json|package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|yarn\.lock|\.npmrc|\.yarnrc(\.yml)?|\.pnpmfile\.cjs)$|(^|/)eslint\.config\.[A-Za-z]+$|(^|/)\.eslintrc([.][A-Za-z]+)?$|(^|/)\.eslintignore$|(^|/)\.lintstagedrc(\.(json|js|cjs|mjs|ts|cts|mts|yaml|yml))?$|(^|/)lint-staged\.config\.(js|cjs|mjs|ts|cts|mts)$"
    "gate-runner|(^|/)run-[^/]*gate[^/]*$|^evidence/gate/|^(scripts|apps/[^/]+)/flow-proof(/|[^/]*$)|(^|/)eslint-rules/|(^|/)jest\.config[^/]*$|(^|/)test-database-guard\.[jt]s$"
    "compose|(^|/)docker-compose[^/]*\.ya?ml$"
    "env|(^|/)\.env($|\.)"
    "deploy|^deploy/|(^|/)scripts/deploy/|(^|/)scripts/backup/|(^|/)scripts/maintenance/"
    "infra|(^|/)Dockerfile|^nginx/|(^|/)nginx/|^\.github/workflows/"
    "key-material|\.(pem|key|crt|p12|pfx)$"
)

# ── Tier-A patterns. Consulted AFTER structural-C but BEFORE keyword-C, so a
# doc/test ABOUT money or auth (e.g. docs/.../secret-rotation.md, a payment
# .test.js) is Tier A — it cannot mutate money or auth at runtime.
A_PATTERNS=(
    "test|(^|/)__tests__/|(^|/)tests?/|\.(test|spec)\.[jt]sx?$|(^|/)e2e/|(^|/)playwright/"
    "docs|^docs/|(^|/)[A-Za-z0-9._-]*\.md$"
)

# ── Tier-C KEYWORD patterns — only reached for non-structural, non-doc, non-test
# files, i.e. actual CODE that touches a money/auth/secret surface.
C_KEYWORD=(
    "money|(^|/)(payment|payments|invoice|invoicing|checkout|billing|finance|accounting|remittance)([/.]|$)"
    "money|(stripe|ksher|promptpay|webhook)"
    "auth-identity|(^|/)(auth|identity|rbac|permission|permissions|jwt|session|oauth|thaid)([/.-]|$)"
    "auth-identity|(auth-middleware|jwt-security|canonical-rbac|tenant-context|tenant-prisma)"
    "secret-material|(secrets?\.[jt]s|(^|/)secrets?/|-secret-|secret-guard|boot-secret)"
)

# ── Tier-C TOKEN keywords (added 2026-09-26). C_KEYWORD above only matched a
# keyword as a WHOLE path segment (`payment/`, `payment.js`), so the real money
# code — `payment-service.js`, `fee-service.js`, `invoice-issuers.js`,
# `business-rules.js`, `auth_repository.dart`, `sessionStore.js` — classified B.
# Here a keyword counts as a TOKEN: bounded by start, `/`, `.`, `-`, `_` or end,
# matched against the path after camelCase is split into tokens and lower-cased
# (`OutputVatReport.tsx` → `output-vat-report.tsx`). A keyword inside a longer
# word does not count: `consumer-feedback.js` has no `fee` token.
# A keyword list, not a path list, so a NEW money/auth file is covered by name.
# Boundaries also include ( ) [ ] @ + and space (Next.js `(auth)/`, `[paymentId]/`),
# and after a keyword a digit (`oauth2-client`, `payments2/`).
# Not applied (TOKEN_SKIP) on a few EXACT paths where nothing can move money or
# change who is let in at runtime: the artifact trees (evidence/, reports/,
# .playwright-mcp/ — run output and screenshots), the two test-harness roots the
# A patterns do not know (testsprite_tests/, apps/web-app/e2e-walkthrough/), the
# web-app i18n dictionaries (copy) and the web-app global stylesheets. Such a file
# keeps the tier it had before the token rules existed — C_KEYWORD still applies.
# __fixtures__/ and __mocks__/ are NOT skipped: a fixture can ship in the bundle
# (checkout-fixtures.ts is imported by checkout-service.ts).
TOKEN_PRE=$'(^|[][/._()@+ \t\n-])'
TOKEN_POST=$'([][/._()@+ \t\n0-9-]|$)'
C_TOKEN=(
    "money|${TOKEN_PRE}(pay|payments?|bills?|billing|charges?|charged|txns?|transactions?|wallets?|ledgers?|acct|accounts?|invoices?|invoicing|checkouts?|finance|financial|accounting|remittances?|remit|fees?|quotations?|quotes?|receipts?|refunds?|settlements?|settle[sd]?|settling|vat|tax(es)?|wht|prices?|priced|mispriced|pricing|payouts?|journals?|general-ledger|(credit|debit)-notes?|chart-of-accounts|period-close|bank|subscriptions?|money|business-rules|stripe|ksher|promptpay|webhooks?|paid|credits?|costs?|amounts?|gateways?)${TOKEN_POST}"
    "auth-identity|${TOKEN_PRE}(auth|authn|authz|authentication|authorization|identity|identities|rbac|permissions?|jwt|sessions?|oauth|thaid|idp|morprom|login|logout|signin|signout|sign-in|sign-out|passwords?|passwd|mfa|2fa|otp|totp|second-factor|csrf|cookies?|roles?|tenants?|rls|revocation|users|admin-users?|provider-users?|user-lookup|pwd|(refresh|access|reset)-tokens?|signup|sign-up|invites?|invitations?|national-id|certificate-issu[a-z]*|cron|access|acls?|user|e2e|security|sso|oidc|saml|passkeys?|middlewares?|ownership|entity-context|scopes?|scoped|scoping)${TOKEN_POST}"
    "secret-material|${TOKEN_PRE}(secrets?|creds?|credentials?|signing-key|signing|signatures?|private-key|passphrase|api-keys?|hmac|encrypt|encrypted|encryption|decrypt|decryption|crypto|rekey|re-key|apikeys?|kms|vault|signers?)${TOKEN_POST}"
)
TOKEN_SKIP='^(testsprite_tests|apps/web-app/e2e-walkthrough|apps/web-app/src/lib/i18n/dictionaries)/|^apps/web-app/src/styles/[^/]+\.css$'
# Artifact roots are skipped only for INERT files (round 2): a script kept under
# evidence/ or .playwright-mcp/ can still delete invoices when someone runs it.
ARTIFACT_ROOTS='^(evidence|reports|\.playwright-mcp)/'
ARTIFACT_INERT='\.(md|txt|log|png|jpe?g|gif|webp|svg|pdf|webm|mp4|mov|json|csv|tsv|html?|xml|har|zip|gz)$'
# A code file whose name is not printable ASCII cannot be read by the ASCII
# tokens (`services/ค่าธรรมเนียม.js`), so it is C rather than silently B.
NON_ASCII=$'[^ -~]'
CODE_EXT='\.(js|jsx|ts|tsx|mjs|cjs|sh|bash|py|sql|dart|go|rb|java|kt|swift|ps1|prisma|html?)$'

token_skipped() {
    local path="$1"
    [[ $path =~ $TOKEN_SKIP ]] && return 0
    [[ $path =~ $ARTIFACT_ROOTS ]] && [[ $path =~ $ARTIFACT_INERT ]] && return 0
    return 1
}

match_any() {
    # match_any <path> <pattern-array-name> ; on match sets MATCH_REASON, returns 0.
    # Bash ERE (same POSIX ERE as `grep -E`). No fork: results go through globals,
    # not $(...), so a 3000-file list classifies in seconds (round 3).
    local path="$1"; local -n arr="$2"
    local entry regex
    for entry in "${arr[@]}"; do
        regex="${entry#*|}"
        if [[ $path =~ $regex ]]; then
            MATCH_REASON="${entry%%|*}"; return 0
        fi
    done
    return 1
}

token_path() {
    # camelCase → kebab tokens, then lower-case: JWTSecurity → jwt-security,
    # sessionStore → session-store, PaymentInvoiceCard → payment-invoice-card.
    local p="$1"
    while [[ $p =~ ^(.*[A-Z])([A-Z][a-z].*)$ ]]; do p="${BASH_REMATCH[1]}-${BASH_REMATCH[2]}"; done
    while [[ $p =~ ^(.*[a-z0-9])([A-Z].*)$ ]]; do p="${BASH_REMATCH[1]}-${BASH_REMATCH[2]}"; done
    TOKEN_PATH="${p,,}"
}

classify_into() {
    # classify_into <path> ; sets CLS_TIER and CLS_REASON.
    # Precedence: structural-C > A > keyword-C > token-C > B.
    local path="$1"
    CLS_TIER=C
    if match_any "$path" C_STRUCTURAL; then CLS_REASON="$MATCH_REASON"; return; fi
    if match_any "$path" A_PATTERNS; then CLS_TIER=A; CLS_REASON="$MATCH_REASON"; return; fi
    if match_any "$path" C_KEYWORD; then CLS_REASON="$MATCH_REASON"; return; fi
    if ! token_skipped "$path"; then
        token_path "$path"
        if match_any "$TOKEN_PATH" C_TOKEN; then CLS_REASON="$MATCH_REASON"; return; fi
        if [[ $path =~ $NON_ASCII ]] && [[ $path =~ $CODE_EXT ]]; then
            CLS_REASON=non-ascii-code-path; return
        fi
    fi
    CLS_TIER=B; CLS_REASON=business-logic-or-ui
}

classify_file() {
    # echoes "<tier>\t<reason>" for one path (used by --selftest).
    classify_into "$1"
    printf '%s\t%s' "$CLS_TIER" "$CLS_REASON"
}

# ── --selftest (L6): proves the classifier in BOTH directions — money/auth code
# that must be C, and money/auth docs/tests (A) + ordinary code (B) that must NOT
# be dragged into C. Some paths are synthetic (not in the tree): each pins
# one boundary rule (camelCase, `_`, a keyword inside a longer word).
SELFTEST_CASES=(
    # ── money code → C (the 2026-09-26 miss list: all were B on 38d0b22d)
    "C apps/backend/config/business-rules.js"
    "C apps/backend/config/invoice-issuers.js"
    "C apps/backend/config/payment-fees.js"
    "C apps/backend/jobs/dtam-remittance-batch-job.js"
    "C apps/backend/jobs/payment-closure-job.js"
    "C apps/backend/jobs/payment-reminder-job.js"
    "C apps/backend/jobs/settlement-reconcile-job.js"
    "C apps/backend/routes/api/applications/quotations.js"
    "C apps/backend/services/fee-service.js"
    "C apps/backend/services/invoice-service.js"
    "C apps/backend/services/payment-service.js"
    "C apps/backend/services/payment-constants.js"
    "C apps/backend/services/payment-utils.js"
    "C apps/backend/services/payment-service-phase-flow.js"
    "C apps/backend/services/phase-billing-service.js"
    "C apps/backend/services/purchase-invoice-service.js"
    "C apps/backend/services/quotation-issuance-on-submit.js"
    "C apps/backend/services/pdf/invoice-template-service.js"
    "C apps/backend/services/pdf/templates/quotation.html"
    "C apps/backend/services/pdf/templates/receipt-tax-invoice.html"
    "C apps/backend/prisma/seed-real-fees.js"
    "C apps/backend/prisma/seed-receipt-sequences.js"
    "C apps/backend/scripts/backfill-invoice-metadata-json.js"
    "C apps/backend/scripts/bind-checkout-receipts-to-invoices.js"
    "C apps/backend/scripts/close-quotations-settled-before-gate.js"
    "C apps/backend/scripts/audit/invoice-vat-audit-report.js"
    "C apps/backend/services/refund-service.js"
    "C apps/backend/services/receipt-numbering-service.js"
    "C apps/backend/services/split-payment-calculator.js"
    "C apps/backend/services/quotation-service.js"
    "C apps/backend/services/quote-service.js"
    "C apps/backend/services/vat-report-service.js"
    "C apps/backend/services/wht-service.js"
    "C apps/backend/services/journal-entry-service.js"
    "C apps/backend/services/general-ledger-service.js"
    "C apps/backend/services/credit-note-service.js"
    "C apps/backend/services/chart-of-accounts-service.js"
    "C apps/backend/shared/checkout-status.js"
    "C apps/backend/shared/dtam-remittance-status.js"
    "C apps/web-app/src/constants/fees.ts"
    "C apps/web-app/src/hooks/use-pricing.ts"
    "C apps/backend/scripts/repair-scope-mispriced-2026-09-10.js"
    "C apps/web-app/src/lib/services/checkout-service.ts"
    "C apps/web-app/src/app/health/applications/renewal/payment-step.tsx"
    "C apps/web-app/src/components/shared/InvoiceSummaryCard.tsx"
    "C apps/mobile-app/lib/presentation/features/application/screens/payment_screen.dart"
    # ── auth / identity / secret code → C
    "C apps/backend/controllers/auth_controller.js"
    "C apps/backend/services/sessionStore.js"
    "C apps/backend/controllers/auth-controller/health-auth-profile-handlers.js"
    "C apps/backend/middleware/mfa-service.js"
    "C apps/backend/middleware/mfa-setup-guard.js"
    "C apps/backend/utils/password-policy.js"
    "C apps/backend/shared/second-factor.js"
    "C apps/backend/services/provider-user-service.js"
    "C apps/backend/services/admin-user-service.js"
    "C apps/backend/services/user-lookup-service.js"
    "C apps/backend/middleware/role-middleware.js"
    "C apps/backend/middleware/csrf-middleware.js"
    "C apps/backend/utils/cookie-security.js"
    "C apps/backend/services/token-revocation-service.js"
    "C apps/backend/services/rls-shadow-metrics.js"
    "C apps/mobile-app/lib/domain/repositories/auth_repository.dart"
    "C apps/backend/config/signing-key-policy.js"
    # ── already C before the fix — must stay C
    "C apps/backend/services/identity-service.js"
    "C apps/backend/routes/api/webhooks/stripe.js"
    "C apps/backend/routes/api/finance/invoices.js"
    "C apps/backend/prisma/schema/billing.prisma"
    "C apps/backend/middleware/auth-middleware.js"
    "C evidence/qr-and-tnt-2026-09-07/stripe-final.png"
    "C CLAUDE.md"
    "C scripts/probes/tier-check.sh"
    # ── docs / tests ABOUT money or auth → A (cannot mutate at runtime)
    "A apps/backend/__tests__/unit/payment-service.test.js"
    "A apps/web-app/src/lib/services/__tests__/checkout-service.test.ts"
    "A apps/backend/services/PAYMENT_SERVICES_README.md"
    "A apps/backend/modules/billing/README.md"
    "A docs/x/payment.md"
    "A docs/x/auth-flow.md"
    # ── ordinary code → B (the fix must not turn everything into C)
    "B apps/web-app/src/components/ui/button.tsx"
    "B apps/backend/services/herb-service.js"
    "B apps/backend/services/plot-service.js"
    "B apps/backend/routes/api/integration/consumer-feedback.js"
    "B apps/backend/services/feedback-service.js"
    "B apps/web-app/src/app/coffee-break/page.tsx"
    "B apps/web-app/src/lib/private-route.ts"
    "B apps/backend/utils/syntax-check.js"
    "B apps/backend/services/author-profile.js"
    "B apps/backend/services/unsettled-queue.js"
    "B apps/web-app/src/lib/acknowledgereceipt.ts"
    "B apps/backend/services/application-service/reviewer-queue-order.js"
    "B apps/web-app/src/lib/design-tokens.ts"
    "B apps/backend/scripts/apply-reconcile-test.js"
    # ── TOKEN_SKIP: narrow path rules only — artifacts, test harness, copy, styles
    "B evidence/one-service-fee-2026-09-11/suite-after.txt"
    "B reports/design-cleanup-2026-08-21/W11-RED-pricing.txt"
    "B testsprite_tests/TC-BE-001_Health_login_endpoint_returns_success_for_valid_credentials.py"
    "B apps/web-app/e2e-walkthrough/role-routes.ts"
    "B apps/web-app/src/lib/i18n/dictionaries/sections/th-auth.ts"
    "B apps/web-app/src/styles/globals-components-auth.css"
    # ── ...a skipped path that C_KEYWORD already caught stays C
    "C testsprite_tests/TC-BE-002_Payment_webhook_callback_returns_structured_diagnostics.py"
    # ── ...and the same words OUTSIDE those exact paths are C (round 1: no broad skips)
    "C apps/web-app/src/lib/services/__fixtures__/checkout-fixtures.ts"
    "C apps/backend/services/__mocks__/payment-adapter.js"
    "C apps/backend/i18n/dictionaries/payment-th.js"
    "C apps/web-app/src/components/shared/payment-card.module.css"
    "C apps/backend/e2e-walkthrough/payment-seed.js"
    # ── round 1 HIGH 2: secret / crypto / identity code named by the reviewer
    "C apps/backend/services/crypto/signature-service.js"
    "C apps/backend/shared/encryption.js"
    "C apps/backend/utils/field-encryption.js"
    "C apps/backend/middleware/partner-api-key.js"
    "C apps/backend/routes/api/system/cron.js"
    "C apps/backend/scripts/backfill-national-id-hmac.js"
    "C apps/backend/scripts/pdpa/rekey-audit-scalars.js"
    "C apps/backend/scripts/rekey-canonicalid.js"
    # ── Next.js route groups: ( ) are token boundaries
    "C apps/web-app/src/app/(auth)/layout.tsx"
    "C apps/web-app/src/app/(auth)/register/register-actions.ts"
    "B apps/web-app/src/app/(marketing)/about/page.tsx"
    # ── round 1 MEDIUM: governance runners + ledgers beat the docs→A rule
    "C scripts/ci/probe-gate.js"
    "C scripts/ci/local-gate.sh"
    "C scripts/ci/check-green-mask-assertions.js"
    "C scripts/ci/full-gate.sh"
    "C scripts/ci/full-gate-checks.txt"
    "C .github/CODEOWNERS"
    "C .husky/pre-commit"
    "C AUDIT_LEDGER.md"
    "C GOALS.md"
    "C HARNESS.md"
    "C apps/backend/CLAUDE.md"
    "C scripts/probes/probe-registry.txt"
    "C scripts/probes/README.md"
    "A HARNESS_LOG.md"
    "A .claude/skills/gacp-debug/SKILL.md"
    # ── round 1 MEDIUM: schema / DDL outside prisma/migrations
    "C apps/backend/prisma/sql/audit_logs_partition.sql"
    "C apps/backend/prisma/sql/README.md"
    "C scripts/migrations/normalize-application-statuses.js"
    "C scripts/db/some-cleanup.sql"
    "C docs/x/example.sql"
    "C apps/backend/__tests__/fixtures/seed.sql"
    # ── round 1 LOW: more money / auth / secret tokens
    "C apps/backend/services/bill-run.js"
    "C apps/backend/services/charge-service.js"
    "C apps/web-app/src/app/api/pay/route.ts"
    "C apps/backend/services/txn-log.js"
    "C apps/backend/services/transaction-service.js"
    "C apps/backend/services/wallet.js"
    "C apps/backend/services/assignment-ledger-service.js"
    "C apps/backend/services/acct-utils.js"
    "C apps/web-app/src/app/health/account/erasure/page.tsx"
    "C apps/backend/services/pwd-reset.js"
    "C apps/backend/services/cred-store.js"
    "C apps/backend/services/credential-vault.js"
    "C apps/backend/services/refresh-token.js"
    "C apps/backend/services/api-key-service.js"
    "C apps/backend/utils/hmac.js"
    "C apps/backend/scripts/pdpa/backfill-encrypt-user-pii.js"
    "C apps/backend/utils/crypto-utils.js"
    "C apps/web-app/src/components/shared/SignaturePad.tsx"
    "C apps/web-app/src/app/signup/page.tsx"
    "C apps/web-app/src/components/forms/sign-up-form.tsx"
    "C apps/backend/services/invite-member.js"
    "C apps/backend/services/certificate-issuance-service.js"
    # ── a digit or [ ] after a keyword is still a boundary
    "C apps/backend/services/oauth2-client.js"
    "C apps/backend/routes/payments2/index.js"
    "C apps/web-app/src/app/health/[paymentId]/page.tsx"
    # ── round 2 HIGH 1: authz code — access / user / acl / e2e door / security
    "C apps/backend/services/farm-access.js"
    "C apps/backend/middleware/uploads-access.js"
    "C apps/backend/shared/user-groups.js"
    "C apps/backend/services/user-group-service.js"
    "C apps/backend/scripts/force_verify_user.js"
    "C apps/backend/scripts/seed-test-user.js"
    "C apps/backend/routes/api/system/e2e.js"
    "C apps/backend/controllers/e2e-controller.js"
    "C apps/backend/services/security-compliance.js"
    "C apps/backend/services/acl-rules.js"
    "C apps/backend/services/oidc-client.js"
    "C apps/backend/services/sso-callback.js"
    "C apps/backend/services/kms-signer.js"
    "C apps/backend/services/vault-client.js"
    "C apps/backend/services/apikey.js"
    "C apps/web-app/src/lib/passkey.ts"
    "C apps/backend/services/gateway-adapter.js"
    "C apps/backend/services/mark-paid.js"
    "C apps/backend/services/credit-balance.js"
    "C apps/backend/services/cost-model.js"
    "C apps/backend/services/amount-utils.js"
    "B apps/backend/services/accessibility-helper.js"
    "B apps/web-app/src/lib/username-format.ts"
    "B apps/backend/services/useragent-parser.js"
    # ── round 2 HIGH 2: scanner / waiver covers are operator-only (L6) → C
    "C .gitleaksignore"
    "C .trufflehogignore"
    "C .gitleaks.toml"
    "C config/gitleaks.toml"
    "C .semgrepignore"
    "C .dockerignore"
    "C apps/web-app/.dockerignore"
    "C security/vulnerability-exceptions.json"
    "C scripts/dependency-audit-accepted.txt"
    "C config/secret-scan-allowlist.txt"
    "C scripts/probes/no-skip-allowlist.txt"
    "C evidence/SECRET-SCAN-HONEST/gitleaks-remaining.json"
    "B .gitignore"
    "A apps/backend/__tests__/unit/applications-draft-formdata-allowlist.test.js"
    # ── round 2 MEDIUM: gate runners / enforcement config beat the test→A rule
    "C scripts/test/run-regression-gate.js"
    "C scripts/test/run-auth-hardening-gate.js"
    "C evidence/gate/0123456789abcdef0123456789abcdef01234567.json"
    "C scripts/flow-proof.sh"
    "C apps/web-app/flow-proof/walk.ts"
    "B evidence/flow-proof/2026-08-07/report.html"
    "C apps/backend/eslint-rules/no-direct-application-status-write.js"
    "C apps/backend/eslint-rules/no-cross-module-internal.test.js"
    "C apps/backend/eslint-rules/NO-DIRECT-STATUS-WRITE-BASELINE.md"
    "C apps/backend/jest.config.cjs"
    "C jest.config.cjs"
    "C apps/web-app/jest.config.mjs"
    "C apps/backend/test-support/test-database-guard.js"
    "A scripts/test/regression-helpers.test.js"
    # ── round 2 MEDIUM: artifact roots skip only NON-executable files
    "C .playwright-mcp/iter-quote-verify.js"
    "C evidence/x/cleanup-invoices.js"
    "C reports/x/fix-payment.sh"
    "C evidence/x/payment-probe.py"
    "B evidence/x/payment-notes.txt"
    "B .playwright-mcp/staging-payments-FIXED-1440.png"
    "B reports/x/invoice-audit.json"
    # ── round 2: non-ASCII code file names cannot be read by ASCII tokens → C
    "C apps/backend/services/ค่าธรรมเนียม.js"
    "A docs/ค่าธรรมเนียม.md"
    "B evidence/x/ภาพหน้าจอ.png"
    # ── round 2 LOW: newline / tab inside a path is a token boundary
    $'C apps/backend/services/ok\npayment.js'
    $'C apps/backend/services/ok\tpayment.js'
    # (non-code extension, so only the LF/TAB boundary — not the non-ASCII rule — can catch these)
    $'C apps/backend/config/ok\npayment.yaml'
    $'C apps/backend/config/ok\tpayment.yaml'
    # ── round 3: auth/scoping code with neutral names — exact-path list
    "C apps/backend/services/storage-service.js"
    "C apps/web-app/src/middleware.ts"
    "C apps/web-app/src/lib/middleware-helpers.ts"
    "C apps/backend/middleware/active-entity-middleware.js"
    "C apps/backend/services/entity-context.js"
    "B apps/web-app/src/lib/storage-service.ts"
    # ── round 3 tokens: middleware / ownership / entity-context / scope
    "C apps/backend/middleware/require-admin.js"
    "C apps/backend/middleware/farm-ownership.js"
    "C apps/backend/shared/form-data-ownership.js"
    "C apps/backend/services/certified-scope.js"
    "C apps/backend/services/tenant-scoped-query.js"
    "B apps/backend/services/telescope-view.js"
    "B apps/backend/services/landscape-map.js"
    # ── operator decision 2026-09-26: package manifests, lockfiles, npm config and
    #    eslint config are C (they redefine gate scripts / husky hooks, change what
    #    installs, or switch off the status-write lint rule)
    "C package.json"
    "C apps/backend/package.json"
    "C apps/web-app/package.json"
    "C packages/validation/package.json"
    "C packages/some-lib/package.json"
    "C pnpm-lock.yaml"
    "C apps/web-app/pnpm-lock.yaml"
    "C package-lock.json"
    "C yarn.lock"
    "C pnpm-workspace.yaml"
    "C .npmrc"
    "C apps/web-app/.npmrc"
    "C apps/backend/eslint.config.js"
    "C apps/web-app/eslint.config.mjs"
    "C eslint.config.cjs"
    "C eslint.config.ts"
    "C .eslintrc"
    "C .eslintrc.js"
    "C .eslintrc.cjs"
    "C .eslintrc.json"
    "C .eslintrc.yml"
    "C .eslintrc.yaml"
    "C apps/web-app/.eslintrc.json"
    "C .eslintignore"
    "C apps/web-app/eslint-rules/no-raw-color.js"
    # lint-staged config decides what the pre-commit gate runs (same reason as .husky/)
    "C .lintstagedrc"
    "C .lintstagedrc.json"
    "C .lintstagedrc.js"
    "C .lintstagedrc.cjs"
    "C .lintstagedrc.mjs"
    "C .lintstagedrc.yaml"
    "C .lintstagedrc.yml"
    "C apps/web-app/.lintstagedrc.json"
    "C lint-staged.config.js"
    "C lint-staged.config.cjs"
    "C lint-staged.config.mjs"
    "C lint-staged.config.ts"
    "C apps/backend/lint-staged.config.js"
    "B apps/web-app/src/lib/lint-staged-summary.ts"
    "A docs/x/lint-staged.config.md"
    # ...but names that only contain these words stay where they were
    "B apps/web-app/src/lib/package-json-utils.ts"
    "B apps/backend/services/eslint-report-parser.js"
    "A docs/x/package.json.md"
    "A apps/backend/__tests__/fixtures/package.json.test.js"
    # ── ...but the new words inside longer words stay B
    "B apps/web-app/src/lib/display-utils.ts"
    "B apps/backend/services/payload-validator.js"
    "B apps/web-app/src/components/ui/discharge-note.tsx"
    "B apps/backend/services/accountability-report.js"
    "B apps/backend/services/herb2-service.js"
)

# End-to-end selftest (round 2): runs a COPY of this script — the real file-list
# builder AND the real reader — against a scratch git repo, so swapping the
# reader (e.g. `mapfile -t` on NUL data) or losing renames / -z / the dirty-tree
# rule fails here. Echoes "<want> <got> <scenario>" per scenario.
selftest_e2e_cases() {
    local self_dir d out i
    self_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    d="$(mktemp -d)" || { echo "C setup-failed mktemp"; return; }
    local pout="$d.out"; mkdir -p "$pout"
    (
        unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR
        g() { git -C "$d" -c user.name=selftest -c user.email=selftest@invalid \
                -c commit.gpgsign=false -c core.hooksPath=/dev/null "$@"; }
        g init -q && g checkout -q -b base || exit 1
        mkdir -p "$d/services" "$d/scripts/probes" "$d/docs" "$d/deploy" "$d/lib" || exit 1
        cp "$self_dir/tier-check.sh" "$self_dir/_lib.sh" "$d/scripts/probes/" || exit 1
        for i in $(seq 1 30); do printf 'exports.fee%s = %s;\n' "$i" "$i"; done > "$d/services/payment-service.js"
        printf 'base\n' > "$d/docs/readme.md"
        g add -A && g commit -q -m base || exit 1
        # w-reader: a doc sorted BEFORE the money file (a collapsed reader keeps only the first path)
        g checkout -q -b w-reader base && printf 'x\n' > "$d/README2.md" && printf 'exports.x = 1;\n' >> "$d/services/payment-service.js" \
            && g add -A && g commit -q -m r || exit 1
        g checkout -q -b w-rename base && g mv services/payment-service.js services/svc.js \
            && printf 'exports.extra = 1;\n' >> "$d/services/svc.js" && g add -A && g commit -q -m mv || exit 1
        g checkout -q -b w-thai base && printf 'echo\n' > "$d/deploy/ค่าบริการ.sh" && g add -A && g commit -q -m th || exit 1
        g checkout -q -b w-ctrl base && printf 'x\n' > "$d/lib/ok"$'\n'"payment.js" && printf 'x\n' > "$d/docs/tab"$'\t'"here.md" \
            && g add -A && g commit -q -m ctrl || exit 1
        g checkout -q -b w-docs base && printf 'y\n' > "$d/docs/y.md" && g add -A && g commit -q -m docs || exit 1
    ) >/dev/null 2>&1 || { echo "C setup-failed scratch-repo"; rm -rf "$d" "$pout"; return; }
    run_copy() {   # run_copy <branch> [args...] — prints the copy's full stdout
        local br="$1"; shift
        ( unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR
          git -C "$d" checkout -q "$br" >/dev/null 2>&1 || exit 9
          BASE_REF=base PROBE_OUT_DIR="$pout" bash "$d/scripts/probes/tier-check.sh" "$@" 2>&1 )
    }
    last() { printf '%s\n' "$1" | tail -1; }
    out="$(run_copy w-reader)";  echo "TIER=C $(last "$out") reader:README2.md+payment-service.js"
    out="$(run_copy w-rename)";  echo "TIER=C $(last "$out") rename:payment-service.js->svc.js"
    out="$(run_copy w-thai)";    echo "TIER=C $(last "$out") non-ascii:deploy/ค่าบริการ.sh"
    out="$(run_copy w-ctrl)";    echo "TIER=C $(last "$out") newline-path:lib/ok<LF>payment.js"
    out="$(run_copy w-ctrl --json)"
    if [[ $out == *[[:cntrl:]]* ]] || [[ $out != *'\n'* ]] || [[ $out != *'\t'* ]]; then
        echo "valid-json invalid json-control-chars"
    else
        echo "valid-json valid-json json-control-chars"
    fi
    out="$(run_copy w-docs)";    echo "TIER=A $(last "$out") clean-docs-only"
    printf 'exports.dirty = 1;\n' >> "$d/services/payment-service.js"
    out="$(run_copy w-docs)";    echo "TIER=C $(last "$out") dirty-unstaged:payment-service.js"
    git -C "$d" add services/payment-service.js >/dev/null 2>&1
    out="$(run_copy w-docs)";    echo "TIER=C $(last "$out") dirty-staged:payment-service.js"
    git -C "$d" reset -q --hard >/dev/null 2>&1
    printf 'x\n' > "$d/services/refund-service.js"
    out="$(run_copy w-docs)";    echo "TIER=C $(last "$out") dirty-untracked:refund-service.js"
    # two dirty paths, the doc sorting FIRST: a collapsing dirty-list reader keeps only the doc
    rm -f "$d/services/refund-service.js"
    printf 'more\n' >> "$d/docs/readme.md"; printf 'exports.two = 1;\n' >> "$d/services/payment-service.js"
    out="$(run_copy w-docs)";    echo "TIER=C $(last "$out") dirty-two-paths:docs/readme.md+payment-service.js"
    rm -rf "$d" "$pout"
}

E2E_EXPECTED=10   # scenarios in selftest_e2e_cases — a silent zero (or a short run) FAILS

run_selftest() {
    local c want path got npass=0 nfail=0 total ne=0
    while IFS=' ' read -r want got path; do
        [ -n "$want" ] || continue
        ne=$((ne + 1))
        if [ "$got" = "$want" ]; then
            npass=$((npass + 1))
        else
            nfail=$((nfail + 1))
            printf 'FAIL-CASE: e2e want %s got %s  %s\n' "$want" "$got" "$path"
        fi
    done < <(selftest_e2e_cases)
    if [ "$ne" -ne "$E2E_EXPECTED" ]; then
        nfail=$((nfail + 1))
        printf 'FAIL-CASE: end-to-end ran %s case(s), expected %s\n' "$ne" "$E2E_EXPECTED"
    fi
    for c in "${SELFTEST_CASES[@]}"; do
        want="${c%% *}"; path="${c#* }"
        got="$(classify_file "$path")"; got="${got%%$'\t'*}"
        if [ "$got" = "$want" ]; then
            npass=$((npass + 1))
        else
            nfail=$((nfail + 1))
            printf 'FAIL-CASE: want %s got %s  %q\n' "$want" "$got" "$path"
        fi
    done
    total=$((npass + nfail))
    echo "selftest: ${npass} pass, ${nfail} fail (of ${total}: ${#SELFTEST_CASES[@]} path cases + ${ne} end-to-end cases)"
    [ "$nfail" -eq 0 ] && pass "tier-check selftest" || fail "tier-check selftest"
}


# ── Gather the file list.
# changed_files <repo-root> <base-ref> — NUL-separated changed paths, merge-base...HEAD.
changed_files() {
    local root="$1" base="$2" mb
    mb="$(git -C "$root" merge-base "$base" HEAD 2>/dev/null)" || return 1
    [ -n "$mb" ] || return 1
    # --no-renames: a rename lists BOTH paths, so moving payment-service.js to
    # svc.js cannot hide the money path. -z: paths arrive raw — without it git
    # quotes non-ASCII names ("deploy/\340...") and start-anchored rules miss.
    git -C "$root" diff --name-only --no-renames -z "$mb"...HEAD
}

if [ "$SELFTEST" -eq 1 ]; then
    run_selftest
fi

FILES_ARR=()
if [ "$FROM_STDIN" -eq 1 ]; then
    mapfile -t FILES_ARR
else
    if ! git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1; then
        blocked "not a git repository — cannot compute a changed-file list"
    fi
    if ! git -C "$ROOT" rev-parse --verify "$BASE_REF" >/dev/null 2>&1; then
        blocked "operator:base-ref — '$BASE_REF' not found (fetch it, or set BASE_REF=...)"
    fi
    LIST_TMP="$(mktemp)" || blocked "mktemp failed — cannot hold the changed-file list"
    trap 'rm -f "$LIST_TMP"' EXIT
    changed_files "$ROOT" "$BASE_REF" > "$LIST_TMP" || blocked "no merge-base between $BASE_REF and HEAD (or git diff failed)"
    # A dirty tree must not report a lower tier than what is on disk (L1): staged,
    # unstaged and untracked (not ignored) paths are classified too.
    DIRTY_TMP="$(mktemp)" || blocked "mktemp failed — cannot hold the uncommitted-file list"
    trap 'rm -f "$LIST_TMP" "$DIRTY_TMP"' EXIT
    { git -C "$ROOT" diff --name-only --no-renames -z HEAD &&
      git -C "$ROOT" ls-files --others --exclude-standard -z; } > "$DIRTY_TMP" \
        || blocked "could not list uncommitted changes (git diff HEAD / ls-files failed)"
    mapfile -d '' -t DIRTY_ARR < "$DIRTY_TMP"
    mapfile -d '' -t FILES_ARR < "$LIST_TMP"
    NDIRTY=0
    declare -A SEEN=()   # linear dedup (round 3): 3000 untracked files must not take minutes
    for f in "${FILES_ARR[@]}"; do [ -n "$f" ] && SEEN["$f"]=1; done
    for f in "${DIRTY_ARR[@]}"; do
        [ -n "$f" ] || continue
        NDIRTY=$((NDIRTY + 1))
        [ -n "${SEEN["$f"]:-}" ] && continue
        SEEN["$f"]=1; FILES_ARR+=("$f")
    done
    if [ "$NDIRTY" -gt 0 ] && [ "$JSON" -eq 0 ]; then
        echo "NOTE: ${NDIRTY} uncommitted path(s) (staged/unstaged/untracked) are included below"
    fi
fi

json_str() {
    # JSON string body: escape \ and ", and every control byte as \uXXXX / \n / \t.
    local s="${1//\\/\\\\}" out="" c i
    s="${s//\"/\\\"}"
    if [[ $s != *[[:cntrl:]]* ]]; then printf '%s' "$s"; return; fi
    for ((i = 0; i < ${#s}; i++)); do
        c="${s:i:1}"
        case "$c" in
            $'\n') out+='\n' ;;
            $'\t') out+='\t' ;;
            $'\r') out+='\r' ;;
            [[:cntrl:]]) out+="$(printf '\\u%04x' "'$c")" ;;
            *) out+="$c" ;;
        esac
    done
    printf '%s' "$out"
}

# ── Classify.
PR_TIER="A"
BREAKDOWN=""
JSON_FILES=""
NFILES=0
for f in "${FILES_ARR[@]}"; do
    [ -n "$f" ] || continue
    NFILES=$((NFILES + 1))
    classify_into "$f"
    tier="$CLS_TIER"; reason="$CLS_REASON"
    BREAKDOWN="${BREAKDOWN}  ${tier}  ${f}  (${reason})"$'\n'
    JSON_FILES="${JSON_FILES}{\"path\":\"$(json_str "$f")\",\"tier\":\"${tier}\",\"reason\":\"${reason}\"},"
    case "$tier" in
        C) PR_TIER="C" ;;
        B) [ "$PR_TIER" != "C" ] && PR_TIER="B" ;;
    esac
done

if [ "$NFILES" -eq 0 ]; then
    # No changed files: a no-op PR. Report as Tier A (nothing to gate on).
    if [ "$JSON" -eq 1 ]; then echo '{"tier":"A","files":[]}'; else echo "(no changed files)"; echo "TIER=A"; fi
    exit 0
fi

if [ "$JSON" -eq 1 ]; then
    printf '{"tier":"%s","files":[%s]}\n' "$PR_TIER" "${JSON_FILES%,}"
else
    printf '%s' "$BREAKDOWN"
    echo "TIER=${PR_TIER}"
fi
exit 0
