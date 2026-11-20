# user-phone-select — 2026-09-27

Bug: `GET /api/invoices/:id/pdf` and the provider audit-detail read 500 on
staging/demo with `PrismaClientValidationError: Unknown field 'phone' for
select statement on model 'User'`. The User column is `phoneNumber`
(`apps/backend/prisma/schema/auth.prisma:21`).

## Root cause (2 sites, commit 83157701, 2026-08-01 "narrow selects")

- `apps/backend/services/invoice-service.js:327` — `_findOneInvoice` → `applicant.select`
- `apps/backend/services/application-service/application-provider-query-methods.js:342` — `findAuditDetail` → `applicant.select`

Unit suites mock `prisma`, so a mocked `findFirst` returns whatever shape a
test hands it — nothing there validates a `select` against the real schema.

## RED (real Postgres, before the fix)

`red-output.txt` — throwaway Docker container `gacp-phone-pg`
(`postgres:17-alpine`, port 127.0.0.1:5436), `prisma migrate deploy` applied,
`npx jest user-phone-select -i` run against base (main 03ab536a, pre-fix).
All 3 tests fail with the exact staging error:
`Unknown field 'phone' for select statement on model 'User'`.

## Fix

- `invoice-service.js:327` and `application-provider-query-methods.js:342`:
  `phone: true` → `phoneNumber: true`.
- `apps/backend/utils/applicant-resolver.js:88`: the one production consumer
  that read `applicant.phone` off these results (feeds the invoice/receipt/
  tax-invoice PDF templates' `payer.phone`, currently unused by any
  template's HTML but kept correct) — now reads `applicant.phoneNumber`.
  `fd.phone` / `person.phone` (wizard formData, not the User relation) were
  left untouched — those keys are genuinely `phone` on disk.
- `apps/backend/__tests__/unit/applicant-resolver.test.js`: one fixture wrote
  `applicant: { phone: '...' }`, the same wrong shape a mock lets through
  silently — updated to `phoneNumber` to match the real Prisma User shape.
- Grepped the whole web app (`apps/web-app`, `apps/mobile-app`) for any
  reader of `applicant.phone`/`invoice.applicant.phone` from these two API
  responses: none found. `audit-application-tab-panel.tsx:59` reads
  `application.applicant?.phone`, but that panel is fed by
  `GET /api/provider/applications/:id`, a different route/query that already
  used `phoneNumber` correctly and returns `health`/`Applicant` (capitalized)
  — never lowercase `applicant`. That branch is dead pre-existing FE code,
  unrelated to this bug class; logged to `BACKLOG-FOUND.md` (2026-09-27
  entry), not fixed (out of this diff's scope).

## Class guard (static, no DB)

`apps/backend/scripts/check-prisma-select-fields.js` +
`apps/backend/__tests__/unit/prisma-select-field-guard.test.js`: reads
`Prisma.dmmf` and scans every `.js` file under
`config/constants/controllers/cron/jobs/middleware/modules/routes/services/
shared/storage/utils/validation/prisma` for
`<relation>: { select: { <key>: true } }` blocks (brace-depth tracked, so a
nested relation's own select is judged against ITS target model, not the
outer one). A relation-field NAME that points at more than one model
schema-wide is skipped rather than guessed at (no false positives); every
unambiguous name is checked against every model, not User-only.

- **RED proof (fixture, no repo revert needed):** a `phone: true` fixture
  under `applicant`/`auditor` is flagged with the exact `{relationField,
  targetModel: 'User', key: 'phone'}` shape.
- **RED proof against the real files:** `git stash` of the two fixed lines,
  re-run → the scanner reports both original file:line hits verbatim
  (`services/invoice-service.js:327`, `.../application-provider-query-
  methods.js:342`), then `git stash pop` restored the fix. Not committed —
  transient verification only.
- **GREEN (item 4 — whole-backend sweep, all models):** zero violations
  across the entire backend today. No other wrong select key found.

## Gate

- Backend full suite: `SIGNING_KEY_DIR=$(mktemp -d) NODE_OPTIONS=--max-old-space-size=3072 npx jest -i`
  → `Test Suites: 34 skipped, 871 passed, 871 of 905 total` /
  `Tests: 227 skipped, 11455 passed, 11682 total`. Zero failures.
  `apps/backend/keys/private.pem` mtime unchanged (epoch 1788623435,
  before and after).
- New integration test (real Postgres, throwaway container):
  `TEST_DATABASE_URL=postgresql://t:***@127.0.0.1:5436/gacp_e2e_test npx jest user-phone-select -i`
  → 3 passed.
- Class guard unit test: `npx jest prisma-select-field-guard -i` → 9 passed.
- `scripts/probes/retired-words.sh` → PASS.
- `scripts/probes/ratchet.sh` → PASS, no counter above baseline
  (hardcode=27 todo=53 env-direct=101 dup-source=0 — unchanged).
- `scripts/probes/no-secret.sh` → PASS (layer1 grep 0 hits, layer2 gitleaks clean).
- `scripts/probes/tier-check.sh` → `TIER=C` (invoice-service.js is a money
  path) — operator merge per CLAUDE.md L5.
- `error-codes-source-pointers.test.js` (KNOWN_PREEXISTING_DRIFT baseline):
  passed unchanged as part of the full suite run above — this diff does not
  touch `shared/error-codes.js` or grow that baseline.

## Container cleanup

`docker rm -f gacp-phone-pg` run at the end of this task; no throwaway
container left running.

## Fix round 1 (2026-09-27 review — `.superpowers/sdd/2026-09-26-side-fixes/phone-review.md`)

Important finding: the class guard's real scope was narrower than its
docstring/report claimed — it only recognized `<relation>: { select: {} }`,
missing top-level `select`/`omit` on a bare direct call, and `where` keys
entirely, and it was pure text matching with no comment/string awareness.

- Extended `scripts/check-prisma-select-fields.js`: literal direct calls
  `prisma.<model>.<op>({...})` / `tx.<model>.<op>({...})` are now checked for
  top-level `select`/`omit` (any key) and top-level `where` (SCALAR-valued
  keys only — an object or array value, i.e. an operator/relation
  filter/`AND`/`OR`/`NOT`, is explicitly skipped, not guessed at).
  `AND`/`OR`/`NOT` are hardcoded-skipped unconditionally (they are Prisma's
  own DSL keywords, never real field names on any model — needed because a
  variable-valued `OR: someArray` doesn't textually look like an array).
- Added `stripCommentsAndStrings`: blanks `//`/`/* */` comments and
  string/template-literal CONTENTS (keeping the delimiter characters and
  every line break, so line numbers and "is this a scalar" both stay
  correct) before any regex runs. Required after the real backend sweep hit
  false positives straight out of prose: a file:line reference in a comment
  (`prisma/schema/auth.prisma:181`), a quoted `"read: true"` inside a doc
  comment, a template literal `` `BATCH:${trimmedBugRef}` ``.
- Rewrote the module docstring as an exact CATCHES / DOES-NOT-CATCH list
  (9 explicit non-caught shapes, e.g. dynamic select variables, `where`
  operator objects, non-literal receivers) instead of a summary.
- RED-first for every new shape: `evidence/.../fix-round-1-red.txt` — the
  new test file's new probes run against the round-0 scanner (stubbed
  `buildModelClientPropertyMap`/`scanSourceForInvalidDirectCalls` returning
  empty) → 6 of the 6 new capability tests fail (`✕`); the pre-existing
  relation-select probes still pass unchanged. After the real implementation:
  same probes → 31/31 pass (`npx jest prisma-select-field-guard -i`).
- **Ran the widened guard over the whole backend (item 4).** Found 12 raw
  hits; triaged every one:
  - 3 were false positives from comment/string prose — gone after adding
    `stripCommentsAndStrings` (`jobs/pdpa-retention-job.js` x2,
    `services/customer-statement-service.js`, `services/waiver-reopen-
    service.js`, `services/pdpa-service.js`).
  - 2 were false positives from a variable-valued `OR:` key — gone after
    hardcoding the `AND`/`OR`/`NOT` skip (`routes/api/interoperability/
    interoperability-resolve.js` x2).
  - **1 real, clearly-wrong "Unknown field" bug — FIXED and landed**:
    `controllers/report-controller.js` (`avgReviewDays`): queried/selected
      `Application.submittedAt`, a column that doesn't exist (only
      `healthId`/`createdAt`/`updatedAt`, etc.) — the `try/catch` around it
      always hit the catch, so this report stat was silently ALWAYS 0.
      Fixed to `createdAt`, matching the sibling `avgAuditDays` block three
      lines below in the SAME file, and the `submittedAt: application.
      createdAt` convention used everywhere else in the codebase.
  - **1 real, clearly-wrong bug found — fix WRITTEN then REVERTED (operator
    correction, T&T freeze)**: `services/trace-service/queries.js`
    (`findPlotCycleByQrCode`, both lookups, lines 20/37) queried
    `TraceQrSecurity.isActive`, a column that doesn't exist — the real
    column is `status: String @default("ACTIVE")`
    (`prisma/schema/trace.prisma:86`), the exact convention every sibling
    call site already uses (`services/qrcode/qrcode-service.js`,
    `services/trace-service/resolve-plot-cycle.js`). The fix
    (`status: 'ACTIVE'`) was written and proven correct, then reverted:
    the T&T (trace) area is under a standing freeze — nothing there may
    land until the operator confirms the unfreeze, regardless of how safe
    or dead the specific line is (this function has zero route callers).
    `services/trace-service/queries.js` is now byte-for-byte identical to
    `03ab536a` again (`git diff 03ab536a -- .../queries.js` empty).
    Logged to `BACKLOG-FOUND.md` with the freeze noted explicitly.
  - **1 real, clearly-wrong bug found — NOT fixed, logged instead**:
    `middleware/role-middleware.js:263` (`canAccessApplication`) selects
    `Application.userId`, which doesn't exist. Left unfixed because (a) the
    function has zero route callers (dead/unwired auth middleware — grepped
    the whole backend) and (b) the correct fix is not a same-shape rename:
    the comparison `application.userId === req.user.id` likely needs to be
    `application.healthId === req.user.canonicalId` instead (Application's
    real applicant FK is `healthId`, which stores `User.canonicalId`, not
    `User.id`) — an auth-semantics judgment call, not a mechanical fix, out
    of scope for a select-gap fix round. Logged to `BACKLOG-FOUND.md`
    (2026-09-27, "user-phone-select, fix round 1").
  - Both un-landed findings (role-middleware.js:263, and the two
    queries.js:20/37 call sites) are named entries — 3 total — in the guard
    test's `KNOWN_PREEXISTING_VIOLATIONS` baseline (mirrors
    `error-codes-source-pointers.test.js`'s `KNOWN_PREEXISTING_DRIFT`
    idiom) — fails loud if a NEW violation appears or if any of these three
    silently disappears without the baseline being updated.
  - **Exact scope after fixes: 0 NEW violations; exactly 3 known, named,
    logged pre-existing violations remain (not silently masked).**
- Re-ran full gate after the revert: backend full suite
  `SIGNING_KEY_DIR=$(mktemp -d) NODE_OPTIONS=--max-old-space-size=3072
  npx jest -i` →
  `Test Suites: 34 skipped, 871 passed, 871 of 905 total` /
  `Tests: 227 skipped, 11477 passed, 11704 total`, zero failures
  (`prisma-select-field-guard.test.js` itself: 31/31 passed, included in
  that total); `private.pem` mtime unchanged (epoch 1788623435, before and
  after this round too). `ratchet.sh` PASS (hardcode=27 todo=53
  env-direct=101 dup-source=0, unchanged). `retired-words.sh`/`no-secret.sh`
  PASS. `tier-check.sh` → `TIER=C` (unchanged — `invoice-service.js` still
  the money-path file driving the tier).
- Evidence: `fix-round-1-red.txt` (the RED proof described above).
