# Remove workspace mode: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Health users read every holder-bearing row whose holder entity they are an ACTIVE member of. They choose the holder explicitly when they file. The active-workspace header, middleware, ALS and switcher are gone.

**Architecture:**
- A new `services/holder-access.js` computes the membership set once per request and returns Prisma where-fragments tagged with a symbol marker.
- Every health read spreads a fragment. A check-only witness in `tenantInjectExtension` counts reads that carry no marker, and throws in tests.
- A real-Postgres door walk proves coverage.
- Writes name their holder in the body, and the permission engine decides.
- Three phases: R1 (backend, behaviour-neutral) → D0/D1 (operator: staff-membership count, heal nulls) → R2 (remove the mode, web picker).

**Tech Stack:** Node 24 · Express · Prisma 5.22.0 / Postgres 17 · prom-client · Next.js 15 / React · jest 30

**Spec:** `docs/superpowers/specs/2026-09-30-remove-workspace-mode-design.md` (APPROVED 2026-09-30, Q1–Q5 as recommended). Inventory: `/home/ubuntu/work/state/workspace-removal-inventory-2026-09-30.md`. Every file:line below was re-read on this worktree (main 07a3aa60 + spec commits).

## Global Constraints

- **Tier C (authz).** The operator merges. Every behaviour task pastes its RED output before GREEN, into `evidence/remove-workspace-mode/<task>/red.txt` and `green.txt`. Both hold summaries only (test names, pass/fail counts), never raw jest logs.
- **Toolchain:** `export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH; unset NODE_OPTIONS`. Plain jest: `cd apps/backend && SIGNING_KEY_DIR=$(mktemp -d) npx jest --config jest.config.cjs <files>`. Web: `cd apps/web-app && npx jest <files>`. Run `pnpm install --frozen-lockfile` once, because the worktree has no `node_modules`.
- **Signing key:** record `stat -c %Y /home/ubuntu/work/GACP-Certification-Application/apps/backend/keys/*.pem` before and after each backend jest run. The value must not change.
- **Real Postgres:** each task names a port. The throwaway container is created with `docker run -d --rm --name ws-pg-$PORT -e POSTGRES_PASSWORD=pg -p $PORT:5432 postgres:17`. Setup steps:
  - Wait until `docker exec ws-pg-$PORT psql -U postgres -c 'select 1'` succeeds.
  - Set `DATABASE_URL=TEST_DATABASE_URL=postgresql://postgres:pg@127.0.0.1:$PORT/postgres`, then run `npx prisma migrate deploy`, then jest with `-i`.
  - Finish with `docker rm -f ws-pg-$PORT`.
  - Real-PG suites use `describeIfTestDatabase` (`test-support/test-database.js`), so the evidence line must show **0 skipped**.
  - Never touch the staging or demo databases.
- **Ratchet:** `bash scripts/probes/ratchet.sh` stays at or below hardcode 26 / todo 53 / env-direct 101 / dup-source 0. New env reads go in `apps/backend/config/` (the env-direct counter reads services/routes/jobs/middleware).
- **Gates:** a backend task runs `LOCAL_GATE_FULL=1 bash scripts/ci/local-gate.sh` and compares the result with the latest main attestation `evidence/gate/8f0f99a2*.json` ("no new failures"). A web task also runs the web jest suite.
- **Copy:** Thai strings are exactly the spec §3.6/§3.7 table values. They follow `.claude/skills/thai-ui-copy/SKILL.md` (คุณ register, no em dash, cause plus next action). No emoji. View-packs follow `.claude/skills/gacp-view-in-the-loop/SKILL.md`, and every screenshot is opened and checked.
- **Operator-only:** deploys, `heal-null-holders.js --apply`, any staging/demo SQL, `probe-registry.txt` signature, merge. The plan prepares commands in `docs/operations/runbooks/2026-09-30-remove-workspace-mode.md`.
- **Branches:** R1 = `feat/holder-read-scope` (Tasks 1–7), cut from main. It merges and deploys alone. R2 = `feat/remove-workspace-mode` (Tasks 8–16), cut from main after R1 merges. Each commit leaves the tree green.
- **Commits:** Thai messages ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01RRHmfYKxvxwbaJYaBnHbhU`.

## Review Focus

1. **Reads inside health POST handlers** (submit, checkout, draft-document upload, bundle ops). The door walk only calls GETs, so these reads meet the witness first in staging. Expected: `gacp_backend_health_read_unscoped_total` stays 0 during an R1 staging walk that includes submit and pay. Pinned in Task 4 (`write doors run clean under witness throw`).
2. **An old browser tab after R2** posts `/applications/draft` without `entityId`. Expected: the 400 `APPLICATION_HOLDER_REQUIRED` copy shows once, auto-save stops, and no retry loop runs. Pinned in Task 15 (`auto-save stops on APPLICATION_HOLDER_REQUIRED`).
3. **A membership is revoked while the draft is open.** The next auto-save with `applicationId=D` returns 404 and creates no new draft (no fallback to "latest open" or personal). Pinned in Task 8 (case 8b).
4. **Counts disagree with lists.** `/applications/my/statuses`, dashboard counters and `count`/`groupBy` sites must use the same fragment as the list, so a co-member's badge equals the rows shown. Pinned in Task 6 (`counts equal list lengths for B`).
5. **PENDING invite or soft-deleted entity.** These grant no reads, and `/entities/mine?include=pending` rows carry `can` all false, so the picker never offers them. Pinned in Task 1 (matrix) and Task 8 (`/mine can flags`).

---

## File Structure

```
apps/backend/services/holder-access.js          NEW  scope, fragments, marker, owner/creator, capability
apps/backend/services/holder-read-witness.js    NEW  check-only: marker present? count/log/throw
apps/backend/config/holder-read-witness.js      NEW  holderReadWitnessMode(): 'off'|'shadow'|'throw'
apps/backend/scripts/heal-null-holders.js       NEW  dry-run default, CSV, --apply (operator)
apps/backend/services/farm-access.js            pure buildFarmAccessWhere + marker + entity.isDeleted filter
apps/backend/services/tenant-prisma-extension.js witness hook; entity dimension removed in R2
apps/backend/middleware/tenant-context-middleware.js  ctx gains principal: 'health'|'staff'
apps/backend/shared/prometheus.js               + Counter gacp_backend_health_read_unscoped_total{model,op}
apps/web-app/src/lib/services/my-entities-provider.tsx  replaces active-entity-provider.tsx (list + refresh only)
apps/web-app/src/components/holder/holder-picker.tsx    NEW  step 1 + farm create + list chips source
scripts/probes/holder-read-scope.sh             NEW  [BUILD] probe, --selftest
docs/operations/runbooks/2026-09-30-remove-workspace-mode.md  NEW  R1 · D0 · D1 · R2 commands
```

---

## R1: backend only, behaviour-neutral (branch `feat/holder-read-scope`)

### Task 1: holder-access service and the marker

**Files:**
- Create: `apps/backend/services/holder-access.js`
- Modify: `apps/backend/services/farm-access.js:71-135` (extract the pure builder; filter deleted entities; mark the result)
- Test: `apps/backend/__tests__/unit/holder-access.test.js`, `apps/backend/__tests__/integration/holder-marker-prisma-real-postgres.test.js`

**Interfaces:**
- Produces:
  - `HOLDER_SCOPED: symbol` = `Symbol.for('gacp.holderScoped')`.
  - `WATCHED_MODELS: ReadonlySet<string>` = Application, Farm, Certificate, Invoice, Quote, Quotation, PaymentTransaction, CheckoutOrder, CheckoutDocument, ApplicationDocument, DocumentPrecheck.
  - `holderScope(req) → Promise<{userId, readIds: string[], editIds: string[]}>`, memoized on `req`.
  - `holderScopeForUser(userId, {activeEntityId?}) → Promise<scope>`.
  - `holderReadWhere(scope, model) → object`. The object carries the marker, and an unknown model throws.
  - `hasHolderMarker(where) → boolean`: top level, or inside `AND`/`OR` one level deep.
  - `markHolderScoped(where) → where`.
  - `assertHolderCapability(userId, entityId, capability) → Promise<void>`.
  - `resolveHolderOwnerOrCreator(app: {entityId, submitterId}, userId) → Promise<boolean>`.
  - farm-access: `buildFarmAccessWhere(userId, anyRoleIds, branchIds) → object` (pure, marked).

- [ ] **Step 1: Write the failing tests.** `holder-access.test.js` uses a mocked `entityMembership.findMany`:
  - `R(user) includes ACTIVE memberships of every role`: OWNER, ADMIN, MANAGER, VIEWER → `readIds` has all four; `editIds` equals `readIds` without the VIEWER entity.
  - `PENDING and REVOKED grant nothing`, and `a soft-deleted entity grants nothing`: the query where contains `entity: { isDeleted: false }` and `status: 'ACTIVE'`.
  - `lookup failure yields [] and logs`.
  - `empty set fails closed`: `holderReadWhere({readIds:[]},'Application')` → `{ entityId: { in: [] } }`.
  - `fragments per model`: exact shapes from spec §3.1. Application `{entityId:{in:ids}}`; Certificate, Invoice, Quote, Quotation, PaymentTransaction, CheckoutOrder, ApplicationDocument and DocumentPrecheck `{application:{entityId:{in:ids}}}`; CheckoutDocument `{checkoutOrder:{application:{entityId:{in:ids}}}}`; Farm deep-equals `buildFarmAccessWhere(userId, ids, ids)`.
  - `marker survives spread`: `hasHolderMarker({ ...holderReadWhere(s,'Invoice'), status:'PAID' }) === true`, `hasHolderMarker({ AND: [frag, {id}] }) === true`, `hasHolderMarker({ id: 'x' }) === false`.
  - `R1 intersection`: `holderScopeForUser(u, {activeEntityId: C})` → `readIds` = `R ∩ {C}`. With no activeEntityId → `R`.
  - `memoized`: two `holderScope(req)` calls → one findMany.
  - `resolveHolderOwnerOrCreator`: creator + ACTIVE MANAGER → true; creator + VIEWER → false; non-creator OWNER → true; non-creator ADMIN → false; lookup throws → false.
- [ ] **Step 2: Write the real-PG pin.** `holder-marker-prisma-real-postgres.test.js` (port **55431**):
  - `Prisma 5.22 ignores the symbol key`: `prisma.application.findMany({ where: { ...holderReadWhere(s,'Application'), isDeleted:false } })` returns the seeded row and does not throw.
  - The same holds through the `tenantInjectExtension` client.
- [ ] **Step 3: Run both; expect FAIL** (`Cannot find module '../../services/holder-access'`). Save red.txt.
- [ ] **Step 4: Implement.**
  - `holderScope` reads `req.activeEntity?.entityId` for the R1 intersection. This line is deleted in Task 12, and it is the only place holder-access touches the mode.
  - `listActiveMemberships` (`farm-access.js:71`) gains `entity: { isDeleted: false }` and stays the single membership query.
  - `farmAccessWhere` delegates to `buildFarmAccessWhere` and returns a marked object.
  - `assertHolderCapability` delegates to `assertEntityActionPermission` (`entity-effective-permissions-service.js:403`).
  - If Step 2 shows Prisma rejects the symbol, switch to the spec's WeakSet fallback (keyed on the fragment's `in` arrays) and record that in green.txt.
- [ ] **Step 5: Run the Task 1 tests plus the existing `farm-access*.test.js`; expect PASS.** Run ratchet. Save green.txt.
- [ ] **Step 6: Commit** `feat(authz): holder-access — ชุดสมาชิกภาพต่อคำขอ + marker`.

### Task 2: the read witness (shadow by default)

**Files:**
- Create: `apps/backend/services/holder-read-witness.js`, `apps/backend/config/holder-read-witness.js`
- Modify: `apps/backend/middleware/tenant-context-middleware.js:69` (ctx gains `principal`); `apps/backend/services/tenant-prisma-extension.js:649-696` (hooks call the witness before `applyReadScopes`); `apps/backend/shared/prometheus.js` (Counter)
- Test: `apps/backend/__tests__/unit/holder-read-witness.test.js`

**Interfaces:**
- Consumes: `hasHolderMarker`, `WATCHED_MODELS` (Task 1).
- Produces:
  - `checkHolderScoped(model, op, args) → void`.
  - `holderReadWitnessMode() → 'off'|'shadow'|'throw'`, read from `HOLDER_READ_WITNESS`. Default `'shadow'`. Task 6 changes the default to `'throw'` when `NODE_ENV==='test'`.
  - Error `code: 'HEALTH_READ_UNSCOPED'`.
  - `req.tenantContext.principal` = `'health'` iff `req.user.canonicalRole === 'health'` (`shared/canonical-rbac.js:59`), else `'staff'`.

- [ ] **Step 1: Write the failing tests.** `holder-read-witness.test.js` runs the hook functions under `runWithTenantContext`:
  - `health + watched model + no marker → counter +1 with labels {model,op} and a warn log with signal HEALTH_READ_UNSCOPED and the caller stack`. Ops are findMany, findFirst, findUnique, findFirstOrThrow, findUniqueOrThrow, count, aggregate and groupBy.
  - `throw mode throws HEALTH_READ_UNSCOPED`.
  - `marker present → nothing`.
  - `staff principal → nothing`.
  - `no tenant ctx (jobs/cron) → nothing`.
  - `unwatched model (User) → nothing`.
  - `witness runs on the caller's args, before applyReadScopes` (the entity ALS overwrite of `entityId` keeps the symbol).
  - `a throwing logger never breaks the read in shadow mode`.
- [ ] **Step 2: Run; expect FAIL.** Save red.txt.
- [ ] **Step 3: Implement.**
  - Add `findFirstOrThrow`/`findUniqueOrThrow` hooks that only call the witness and `query(args)`.
  - The `principal` is set where `req.tenantContext` is built.
- [ ] **Step 4: Run the Task 2 tests, plus `tenant-context.test.js`, `tenant-aggregate-groupby-scope.test.js` and `tenant-read-org-backstop.test.js`; expect PASS.** Save green.txt.
- [ ] **Step 5: Commit** `feat(authz): witness อ่านข้อมูลฝั่งผู้ยื่นที่ไม่มี marker (shadow)`.

### Task 3: convert Application health reads

**Files:**
- Modify:
  - `services/application-service/application-draft-query-methods.js:175-360` (`getDraft`, `getHealthApplications`, `getHealthUserApplications`, `getById`, `findForPaymentOwnership:320`, `findOwnedApplicationForApplicant:339`)
  - `services/application-service/application-applicant-query-methods.js:104,125,341`
  - `routes/api/applications/application-listing-handlers.js:102-240`
  - `application-workflow-handlers.js` (health GETs)
  - `requirements.js`, `renewals.js`, `revision-resubmit.js`, `applications-car.js`, `audit-notes.js`, `application-bundles.js:104-120,222-260`, `routes/api/preview/preview.js`
- Test: `apps/backend/__tests__/unit/application-health-reads-carry-holder-marker.test.js`

**Interfaces:**
- Consumes: `holderScope`, `holderReadWhere` (Task 1).
- Produces: health read methods take `{ holderScope }` in their existing `options` bag, in place of the filer identity. Staff callers pass nothing and keep their current where.

- [ ] **Step 1: Write the failing test.** A prisma double records `args`. For each converted method, called with a scope:
  - `where carries HOLDER_SCOPED`;
  - `where has no applicant/healthId/userId pin`;
  - `by-id reads use findFirst({ where: { id, ...fragment } })`, never `findUnique`.
  - `deleteDraft keeps its strict filer pin AND the fragment in R1`. Task 9 replaces it.
- [ ] **Step 2: Run; expect FAIL.** Save red.txt.
- [ ] **Step 3: Implement.** Routes pass `await holderScope(req)`. `buildHealthWhereClause` (`application-identity-methods.js:199-265`) stays for `deleteDraft` only until Task 9.
- [ ] **Step 4: Run the new test plus every existing test importing the touched files (`grep -l` the module names under `__tests__`). Expect PASS.** Update mocks that asserted the old filer where. Save green.txt.
- [ ] **Step 5: Commit** `refactor(authz): อ่านคำขอฝั่งผู้ยื่นผ่าน holderReadWhere`.

### Task 4: convert certificate, document, pre-check and finance reads (main's doors)

**Files:**
- Modify:
  - `services/certificate-service.js:1203` (`listCertificatesForUser`) and `:1222` (`getCertificateForUser`, today pinned on `userId` at `:1225`)
  - `routes/api/certificates/certificates.js:188,289,377`
  - `services/document-service.js:202,288`
  - `routes/api/applications/requirements.js` (ApplicationDocument, DocumentPrecheck)
  - `services/planting-service.js:1000`
  - `services/quote-service.js:146`, `routes/api/finance/quotes.js:117`
  - `routes/api/applications/quotations.js:139,261`
  - `routes/api/finance/payments.js:233` (`findForPaymentOwnership` → fragment)
  - `services/checkout/stripe-checkout-service.js:421-427` (the `healthId` pin → `holderReadWhere(scope,'Application')`, scope passed in `actor.holderScope`)
- Test: `apps/backend/__tests__/unit/cert-finance-reads-carry-holder-marker.test.js`, `apps/backend/__tests__/integration/holder-write-doors-witness-real-postgres.test.js`

**Interfaces:**
- Consumes: Task 1, Task 2.
- Produces: `getCertificateForUser(certificateId, scope, {select, include})` and `listCertificatesForUser(scope)`. The signatures change from `userId` to `scope`. `createCheckoutForApplication({ applicationId, milestone, actor: { id, holderScope, role } })`.

- [ ] **Step 1: Write the failing tests.**
  - Unit: the same three assertions as Task 3, applied to each method above.
  - Real-PG (port **55432**, witness forced `throw` via `HOLDER_READ_WITNESS=throw`) drives supertest through the real auth middleware as a health user with header C. It covers: POST `/applications/draft`, POST `/applications/draft-documents`, POST `/applications/submit`, POST `/payments/checkout` (mock adapter), and POST `/bundles`.
  - `write doors run clean under witness throw`: every call returns its normal status, with no `HEALTH_READ_UNSCOPED`.
- [ ] **Step 2: Run; expect FAIL** (unit: marker missing; real-PG: `HEALTH_READ_UNSCOPED` on the first unconverted internal read). Save red.txt with the list of model/op/stack lines the witness named.
- [ ] **Step 3: Convert every read the witness names.** Internal reads reached from a health request take `{ holderScope }` and spread the fragment. Staff callers of the same service functions pass nothing. This is a money path (L3): code only, no data writes, and the operator merges.
- [ ] **Step 4: Run both plus `gacp-payment-invariants`-area suites (`grep -l stripe-checkout-service __tests__`); expect PASS.** Save green.txt.
- [ ] **Step 5: Commit** `refactor(authz): ใบรับรอง/เอกสาร/การเงินฝั่งผู้ยื่นอ่านตามผู้ถือ`.

### Task 5: convert the in-flight billing doors (`listForWorkspace`, `assertHealthOwnsInvoice`)

**Dependency:** `fix/applicant-receipt-and-billing-scope` has merged to main and this branch is rebased on it. If it has not, report `BLOCKED(operator: merge fix/applicant-receipt-and-billing-scope)`, because R1 cannot close without it: its receipt door is a health GET the walk will find.

**Files:**
- Modify: `apps/backend/services/invoice-service.js` (`listForWorkspace({healthId,status,activeEntity})` → `listForHolders({ scope, status })`); `apps/backend/routes/api/finance/invoice-helpers.js` (`assertHealthOwnsInvoice(invoiceId, healthIdentity)` → `findHealthInvoice(invoiceId, scope)`); `apps/backend/routes/api/finance/invoices.js` (`/my`, `/my/:invoiceId/receipt/pdf`, `/:invoiceId/pdf`)
- Test: rewrite `__tests__/integration/applicant-billing-workspace-real-postgres.test.js` → `applicant-billing-holder-real-postgres.test.js`; update `applicant-billing-membership-real-postgres.test.js` and `__tests__/unit/applicant-billing-doors.test.js`

**Interfaces:**
- Produces:
  - `listForHolders({ scope, status }) → Invoice[]`, with where = `{ isDeleted: false, ...holderReadWhere(scope,'Invoice') }` plus the status filter. There is no `healthId` pin and no null-entity branch.
  - `findHealthInvoice` → `findFirst({ where: { id, isDeleted:false, ...fragment } })`. A missing row throws `statusCode 404` for strangers and deleted rows alike.

- [ ] **Step 1: Rewrite the real-PG tests (port 55433) as membership-driven.**
  - `co-member B lists C's invoices filed by A`. In R1 B sends header C, because the R1 intersection holds until Task 12, which drops the header.
  - `stranger gets 404 on invoice pdf and receipt pdf`: it was 403 on the branch.
  - `REVOKED member gets 404`.
  - `null-entity invoice is invisible to its filer` (spec §3.1 "no filer fallback").
- [ ] **Step 2: Run; expect FAIL** (403 ≠ 404; the filer still sees the null row). Save red.txt.
- [ ] **Step 3: Implement.** The web `?applicationId=` filter is untouched. The web reload on workspace switch (`ef5ec0fb`) is removed in Task 14.
- [ ] **Step 4: Run; expect PASS.** Save green.txt.
- [ ] **Step 5: Commit** `refactor(billing): /invoices/my และใบเสร็จอ่านตามผู้ถือ (แทน workspace)`.

### Task 6: health door walk and witness throw-in-tests

**Files:**
- Create: `apps/backend/__tests__/integration/health-door-walk-real-postgres.test.js`, `apps/backend/__tests__/integration/fixtures/holder-scope-fixture.js`
- Modify: `apps/backend/config/holder-read-witness.js` (default `'throw'` when `NODE_ENV==='test'`)

**Interfaces:**
- Produces: `seedHolderScopeFixture(prisma) → { orgId, users: {A,B,V,S,F,O2}, entities: {C,PA,PS}, apps: {X,D,Y,D2}, invoiceX, receiptX, certX, tokens }`, the spec §4 fixture. Task 12 reuses it.

- [ ] **Step 1: Write the walk (port 55434).**
  - Collect every GET layer from `app._router.stack` (recurse into routers) whose stack contains a handle named `authenticateHealth` or `authenticateAny`. Walking `authenticateAny` too closes the health doors on `/certificates/:id`, quotations and `/entities`.
  - A map `PARAM → fixture id` covers `:id`, `:applicationId`, `:invoiceId`, `:certificateId`, `:documentId` and the rest. `a route whose param is not in the map fails the test`.
  - Call each route as B (R1: header C) and as S. Assertions: `no HEALTH_READ_UNSCOPED`; `S never gets X/D/invoiceX/certX ids in any body`; `S by-id → 404`.
  - `counts equal list lengths for B` (Review Focus 4): `/applications/my/statuses` totals equal `/applications/my` length, and dashboard counters equal their lists.
- [ ] **Step 2: Flip the test default to `throw`. Run the walk plus the whole `__tests__/integration` set on 55434; expect FAIL** on each door the walk names. Save red.txt with the door list.
- [ ] **Step 3: Convert each named door** in the file that owns it, using the same rule as Tasks 3–4.
- [ ] **Step 4: Run the walk, the full integration set on real PG, and `LOCAL_GATE_FULL=1 local-gate.sh`; expect PASS** with no new failures against the main attestation. Save green.txt.
- [ ] **Step 5: Commit** `test(authz): เดินทุกประตู GET ฝั่งผู้ยื่นบน Postgres จริง + witness throw ในเทส`.

### Task 7: heal script, D0/D1 runbook, R1 release

**Files:**
- Create: `apps/backend/scripts/heal-null-holders.js`, `docs/operations/runbooks/2026-09-30-remove-workspace-mode.md`
- Test: `apps/backend/__tests__/unit/heal-null-holders-rules.test.js`, `apps/backend/__tests__/integration/heal-null-holders-real-postgres.test.js`

**Interfaces:**
- Produces: `planHeal(prisma) → { rows: Array<{table:'applications'|'farms', id, chosenEntityId|null, rule, evidence}> }` and `applyHeal(prisma, plan)`. The CLI writes `evidence/heal-null-holders/<db-label>-<ISO>.csv`, and `--apply` is required to write.

- [ ] **Step 1: Write the failing tests.** Rules from spec §3.5:
  - `INDIVIDUAL or absent applicantType + filer has exactly one OWNER INDIVIDUAL membership → that entity`.
  - `JURISTIC declared → unplaced`.
  - `two candidates → unplaced`.
  - `farm: certificate's application entityId wins`, then `single personal entity`, else `unplaced`.
  - `dry run writes nothing` (row counts equal before and after, real PG port 55435).
  - `--apply fills only null columns and never overwrites`.
  - `unplaced DRAFT rows are listed with rule 'UNPLACED_DRAFT_DELETE_ON_OPERATOR_WORD'`; non-drafts get `'UNPLACED_OPERATOR_DECIDES'` (Q2).
- [ ] **Step 2: Run; expect FAIL.** Save red.txt.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run; expect PASS.** Save green.txt.
- [ ] **Step 5: Write the runbook.** Sections:
  - **R1 deploy.** Image and restart as usual. Then run one staging walk: login, list, open, submit, pay (test mode). Read `gacp_backend_health_read_unscoped_total` and expect 0.
  - **D0**, run inside `BEGIN READ ONLY`:
    ```sql
    SELECT count(*) FROM entity_memberships m JOIN users u ON u.id = m."userId" WHERE m.status = 'ACTIVE' AND u.role <> 'health';
    ```
    Expected 0.
  - **D1:** `node scripts/heal-null-holders.js` (dry), then review the CSV, then `--apply`. Then check:
    ```sql
    SELECT (SELECT count(*) FROM applications WHERE "entityId" IS NULL) apps, (SELECT count(*) FROM farms WHERE "entityId" IS NULL) farms;
    ```
    Expected `0 | 0` on staging and on demo.
  - A note that D0/D1 may run before the R1 deploy, because both use the old code. Running them first also keeps invoices and certificates of null-entity applications visible to their filers between R1 and D1.
- [ ] **Step 6: Commit** `feat(ops): heal-null-holders (dry-run) + runbook R1/D0/D1`. R1 ends here and goes to the operator for merge and deploy.

---

## R2: remove the mode (branch `feat/remove-workspace-mode`, after R1 is on main and D1 = 0 on both DBs)

**Header rule until Task 12.** In Tasks 8–11 the middleware and the R1 intersection still exist. So:
- A real-PG test actor acting on company C sends `x-active-entity-id: C`.
- A non-member sends no header, because the middleware would 403 it before the rule under test runs.

Task 12 deletes the middleware and removes these headers from every test.

### Task 7b: planting attachments get their own door (C4, operator 2026-09-30 "ทำทางแยก")

Operator ruled C4: the planting-activity page stops riding on `/applications/draft-documents`, before R2 ships. This is the first R2 task, so Task 8 can make that door strict. The T&T freeze is lifted for exactly this door and its hook, by the operator's direct ruling. Nothing else in the planting or T&T area changes.

**Files:**
- Modify: `apps/web-app/src/app/health/planting/[id]/activities/use-planting-activities-page.ts:106,138`.
- Create: an attachment route under the existing cultivation router. The implementer picks the path next to the activity routes. It takes the planting cycle id and never an `applicationId`.
- Test: `__tests__/integration/planting-attachment-door-real-postgres.test.js`, plus a web unit test for the hook.

**Interfaces:**
- Consumes the existing farm gates: `assertFarmActionPermission` and the capability already used for activity writes in `services/planting-cycle-service.js` (~:504-576). The implementer names the exact capability in the report. It reuses the storage and scan path the draft-documents door uses today, with no second upload pipeline.
- Produces `POST` (upload) and `DELETE` (remove) for an attachment scoped to a cycle the caller may write. The response shape matches what the hook reads today, so the page UI does not change.

- [ ] **Step 1: RED on real Postgres.** Every case below must fail before the change:
  - A farm member with the write capability uploads and deletes: 201 and 200.
  - VIEWER: 403.
  - Stranger: 404.
  - The upload creates **no** Application row (count before equals count after).
  - A source scan of the hook shows no `/applications/draft-documents` string.
- [ ] **Step 2:** Implement the door and switch the hook.
- [ ] **Step 3:** GREEN. The existing `planting/[id]/__tests__/entity-permission-gating.test.ts` still passes. Add a view-pack: an upload on the planting page against a local stack, before and after, in light and dark.
- [ ] **Step 4:** Commit. Until this task is merged, the R2 deploy stays `BLOCKED(operator: planting-attachment door)`.

### Task 8: the holder is chosen explicitly (create, prepare, resume, `/mine`)

**Files:**
- Modify:
  - `routes/api/applications/applications.js`: `:367-460` `findOrCreateApplicationForHealth`; `:697-707` `/draft`; `:1515-1570` `/prepare`, including the deletion of `nextEntityId` at `:1567`; `:1593-1633` POST `/draft-documents`; `:1724-1749` GET/DELETE `/draft-documents`; `:1855-1866` GET `/draft`
  - `routes/api/entities/index.js:49-70` (`/mine`), `services/entity-service.js:1348` (`can` per row)
  - `shared/form-data-ownership.js:36` (`applicantType` joins `SERVER_OWNED_FORM_DATA_KEYS`)
  - `shared/error-codes.js` (add `APPLICATION_HOLDER_REQUIRED` 400 with the spec §3.6 Thai string; retire `APPLICANT_ENTITY_MISSING:1312`)
  - delete the six other personal-entity heals: `applications.js:487-495`, `application-workflow-handlers.js:383-392`, `revision-deadline.js:344-352`, `applications-car.js:109-118`, `application-bundles.js:176-185`, `renewals.js:104-120` (see Operator conflicts C3)
- Test: `apps/backend/__tests__/integration/holder-scope-real-postgres.test.js` (created here: cases 6, 7, 8b); `__tests__/unit/entities-mine-can-flags.test.js`; rewrite `applications-prepare-server-owned-fields.test.js`; delete `applications-prepare-active-entity.test.js`

**Interfaces:**
- Consumes: `seedHolderScopeFixture` (Task 6), `holderScope`, `assertHolderCapability` (Task 1).
- Produces:
  - `findOrCreateApplicationForHealth(healthIdentity, reqUser, options, scope)`. With an id it loads through `holderReadWhere` and requires `entityId ∈ scope.editIds`, else 404. Without an id it requires `options.entityId ∈ scope.editIds` and creates. A missing entityId gives 400 `APPLICATION_HOLDER_REQUIRED`; an entityId outside `editIds` gives 403 `ENTITY_PERMISSION_DENIED`.
  - `/mine` rows gain `can: { edit: boolean, submit: boolean, createFarm: boolean }`, computed by `getEffectiveEntityPermissions`, with `edit = role !== 'VIEWER' && membershipStatus === 'ACTIVE'`.

- [ ] **Step 1: Write the failing tests (port 55436).**
  - Case 6: `A /prepare on D with body entityId PA → D.entityId still C, body entityId stripped`.
  - Case 7: `create with entityId C by S → 403`, `by V → 403`, `no entityId → 400 APPLICATION_HOLDER_REQUIRED`.
  - `created draft has formData.applicantType = Entity.type`, and `body applicantType ignored`.
  - `GET /draft-documents without applicationId → 400; missing draft → 404; no row created` (count before equals after).
  - `GET /draft without id returns latest open draft with submitterId = me and holder in editIds`.
  - Case 8b: `A REVOKED on C → POST /draft {applicationId: D} → 404, applications count unchanged`.
  - `/mine can flags`: OWNER `{true,true,true}`, MANAGER `{true,false,false}`, VIEWER `{false,false,false}`, MANAGER with a SUBMIT_APPLICATION GRANT `submit:true`, PENDING (include=pending) all false.
- [ ] **Step 2: Run; expect FAIL.** Save red.txt.
- [ ] **Step 3: Implement.** `activeEntity` stops being passed into `findOrCreateApplicationForHealth`. The middleware still exists until Task 12, and nothing reads it here.
- [ ] **Step 4: Run the new tests, the rewritten unit tests, `error-codes-source-pointers.test.js` and `local-gate`; expect PASS.** Save green.txt.
- [ ] **Step 5: Commit** `feat(authz): เลือกผู้ถือชัดเจนตอนสร้าง · /prepare ไม่ย้ายผู้ถือ · อ่านไม่สร้าง`.

### Task 9: owner-only and destructive rules; delete `buildHealthWhereClause`

**Files:**
- Modify:
  - `services/application-service/application-draft-query-methods.js:203-243` (`deleteDraft` → `resolveHolderOwnerOrCreator`)
  - `application-identity-methods.js:199-270` (delete `buildHealthWhereClause` and `buildHEALTH_USERWhereClause`, plus their exports `:280-281`)
  - draft edits on `/draft`, `/prepare` and draft-documents (require `editIds`)
  - `application-bundles.js:386,618` (see C8)
  - `routes/api/finance/payments.js:502` checkout → `assertHolderCapability(user, app.entityId, 'SUBMIT_APPLICATION')` (Q3)
  - the audit field `activeEntityId`: `application-submit-guard.js:100,125`, `applications.js:466-477,534`, `application-workflow-handlers.js:417,454`, `revision-deadline.js:80,370`, `application-bundles.js:159-167,209`, `applications-car.js:138,186`
- Test: extend `holder-scope-real-postgres.test.js` (cases 3, 4); rewrite `application-entity-scope-where.test.js` → delete (its matrix moved to `holder-access.test.js`); rewrite `applications-submit-capability-gate.test.js`, `application-submit-guard.test.js`

**Interfaces:**
- Consumes: `resolveHolderOwnerOrCreator`, `assertHolderCapability` (Task 1).

- [ ] **Step 1: Write the failing tests (port 55437).**
  - Case 3: `V sees X; V submit D → 403 ENTITY_PERMISSION_DENIED; V edit D → 403`.
  - Case 4: `B (MANAGER, not creator) deletes D → 403; A deletes D → 200; O2 (OWNER) deletes D2 → 200`.
  - `MANAGER edits D → 200, submits D → 403`.
  - `checkout on X by B (no SUBMIT_APPLICATION) → 403; by A → 200 (mock adapter)`.
  - `submit audit row has onBehalfOfEntityId and no activeEntityId`.
  - Unit: `applications-submit-capability-gate` has the same matrix without injecting `activeEntity`.
- [ ] **Step 2: Run; expect FAIL.** Save red.txt.
- [ ] **Step 3: Implement.** The draft-document removal keeps the verdict lock (`applications.js:1747-1760`).
- [ ] **Step 4: Run; expect PASS.** Save green.txt.
- [ ] **Step 5: Commit** `feat(authz): ลบ/แก้/ยื่น/ชำระตามสิทธิ์บนผู้ถือ · ลบ buildHealthWhereClause`.

### Task 10: farm create names its holder; delete the legacy `/api/wizard` door

**Files:**
- Modify: `routes/api/cultivation/farms.js:170-194`; `services/farm-service.js:204-216` (`createFarm(ownerId, data, file, { entityId })`, where `entityId` is required, and delete the `getEntityContext` import `:3` and the fallback `:211`); `routes/api/index.js:371` (remove the `/wizard` line only; `/provider-cms` stays)
- Delete: `routes/api/applications/wizard.js`, `controllers/wizard-controller.js` (if `grep` finds no other importer), and `executeWizardSubmission` in `services/application-service/application-submission-methods.js:24-175`
- Test: rewrite `farm-entityid-stamp.test.js`, `farm-permission-gates.test.js`. Retarget or delete the wizard-submission cases in `__tests__/integration/phase-amount-canonical.test.js`, `__tests__/unit/{submit-materialises-the-farm-the-certificate-names,n-plus-one-batching,plot-code-extension,wizard-draft-document-path-confinement}.test.js`. A case that pins logic still used by `/submit` moves to that door; a case that pins only the wizard door is deleted.

- [ ] **Step 1: Write the failing tests.**
  - `createFarm without entityId throws`.
  - `POST /farms passes body.entityId`.
  - `POST /farms without entityId → 400 APPLICATION_HOLDER_REQUIRED`. The same code is used because the copy names step 1: the farm form shows the picker.
  - `FARM_CREATE is checked on every entity, including the personal one; OWNER passes by role; MANAGER → 403`.
  - `GET /api/wizard/* → 404 with ENABLE_PROVIDER_LEGACY_ALIAS=true`.
- [ ] **Step 2: Run; expect FAIL.** Save red.txt.
- [ ] **Step 3: Implement and delete.**
- [ ] **Step 4: Run the touched suites plus `local-gate`; expect PASS.** Save green.txt.
- [ ] **Step 5: Commit** `feat(authz): สร้างฟาร์มระบุผู้ถือ · ถอดประตู /api/wizard`.

### Task 11: certificate PRINT_QR gate (B14) and QR exposure

**Files:**
- Modify: `routes/api/certificates/certificates.js:377-411` (download), `:188-230` (`/my`), `:289-345` (health branch of `/:id`)
- Test: rewrite `certificate-download-cold-start-retry.test.js` (mock the engine, not `req.activeEntity`); extend `holder-scope-real-postgres.test.js`

**Interfaces:**
- Produces: `/certificates/my` and the health `/:id` rows gain `canPrintQr: boolean`, and `qrCode` is `null` when `canPrintQr` is false (C5 default). The download door returns 403 `ENTITY_PERMISSION_DENIED` on denial. `CAPABILITY_DENIED` is retired on this door only.

- [ ] **Step 1: Write the failing tests (port 55438).**
  - `V downloads certX PDF → 403 ENTITY_PERMISSION_DENIED`.
  - `B (MANAGER) → 200`.
  - `V with a PRINT_QR GRANT → 200`.
  - `A with PRINT_QR REVOKE → 403`.
  - `S → 404`.
  - `V /certificates/my row: canPrintQr false, qrCode null`.
- [ ] **Step 2: Run; expect FAIL** (V gets 200 today when no activeEntity is bound). Save red.txt.
- [ ] **Step 3: Implement** with `assertEntityActionPermission({ entityId: certificate.application.entityId, userId, permission: 'PRINT_QR' })`. Doors that return the QR: only these three (grep `qrData|qrCode` in `routes/api/certificates`). The trace routes are public and out of scope.
- [ ] **Step 4: Run; expect PASS.** Save green.txt.
- [ ] **Step 5: Commit** `fix(authz): PRINT_QR ตรวจบนผู้ถือของใบรับรองเสมอ (fail closed)`.

### Task 12: remove the middleware, ALS, entity dimension and `/me/switch`

**Files:**
- Delete: `middleware/active-entity-middleware.js`, `services/entity-context.js`, `scripts/smoke-wave-c.js` (its only job is the ALS), `routes/api/entities/index.js:73-142` (`POST /me/switch`) with `recordContextSwitch` (`entity-service.js:1409`, export `:1941`)
- Modify:
  - `middleware/auth-middleware.js:23,41-47` (`bindScopes` = `bindTenant`)
  - `services/tenant-prisma-extension.js:54,229-236,322-330,622,705-706` (entity dimension and exports removed)
  - `services/application-service/application-submission-methods.js:5`, `application-identity-methods.js:4`
  - the R1 intersection line in `holder-access.js`
  - comments naming the mode in `entity-effective-permissions-service.js:393` and `farm-access.js:111`
- Test:
  - Delete `active-entity-middleware.test.js`, `entity-prisma-extension.test.js`.
  - Drop the `entity-context` mock from `farm-service-edit-permission.test.js` and `tenant-read-org-backstop.test.js`.
  - `personal-entity-determinism-and-invite.test.js`: drop the header parts (`:197,:207`). Keep the determinism of `findPersonalEntityForHealthIdentity` only while it still has a caller after Task 8.
  - Complete `holder-scope-real-postgres.test.js` with cases 1, 2, 5, 8, 9, and walk the door walk without the header.

- [ ] **Step 1: Write the failing cases (port 55439).**
  - Case 1: `B lists X and D not Y; B opens X, invoiceX, receiptX, certX → 200`, with no header.
  - Case 2: `S sees none; 404 on each`.
  - Case 5: `S with x-active-entity-id: C sees nothing, status is never 403 ACTIVE_ENTITY_MISMATCH`.
  - Case 8: `A REVOKED on C → X gone from A's list`.
  - Case 9: `F provider listing returns X, D, Y with and without header`.
  - Door walk: drop the header for B.
- [ ] **Step 2: Run; expect FAIL** (case 1 without the header sees PB only; case 5 gets 403). Save red.txt.
- [ ] **Step 3: Delete and modify as listed.** Grep `apps/backend` for `activeEntity|entity-context|runWithEntityContext|getEntityContext|ACTIVE_ENTITY_MISMATCH`: zero hits outside tests.
- [ ] **Step 4: Run the real-PG suites, the full integration set and `LOCAL_GATE_FULL=1 local-gate.sh`; expect PASS** with no new failures. Run ratchet: env-direct must not rise (the middleware's one `process.env` read goes). Save green.txt.
- [ ] **Step 5: Commit** `feat(authz): ถอด active-entity middleware / ALS / /me/switch`.

### Task 13: error codes, documents and governance

**Files:**
- Modify:
  - `apps/backend/shared/error-codes.js`: delete `ACTIVE_ENTITY_MISMATCH:358`; reword the remediations of `TENANT_CONTEXT_FAILED`, `CROSS_TENANT_WRITE` and `FORBIDDEN_TENANT` (`:372,:380,:1038`) to say "organization"; `CERTIFICATE_HOLDER_MISMATCH:1672-1679` gets the spec §3.7 message and a remediation without "switch".
  - `services/application-requirements-service.js:94-96` and `services/certificate-service.js:2393-2396` get the spec §3.7 Thai string, with `{word}` filled as today.
  - `docs/api/error-codes.md`, regenerated by `node apps/backend/scripts/extract-error-codes.js --markdown`.
  - `docs/contract/manual/01-identity-health-id.md:185-189` (removed from tree 2026-10-05): §4.3 becomes "ผู้ยื่นในนามและสิทธิ์การเห็นข้อมูล", with the READ predicate, the step-1 choice, G7, and `holder-access.js` file:line.
  - `HARNESS.md` §4.5: add a `holder-read-scope` `[BUILD]` row (spec §3.7). Task 14 builds the probe.
  - `.claude/agents/role-workflow-auditor.md` and `.claude/skills/gacp-workflow-rules/SKILL.md`: one paragraph each on "what a health role sees = holder membership (`services/holder-access.js`)".
  - `HARNESS_LOG.md`: append one entry.
- Test: `__tests__/unit/error-codes-source-pointers.test.js`; a new `__tests__/unit/holder-copy-has-no-switch-wording.test.js`

- [ ] **Step 1: Write the failing test.** `holder-copy-has-no-switch-wording`:
  - `holderMismatchIssue(JURISTIC formData, 'INDIVIDUAL').message` equals the spec §3.7 string with `{word}` = นิติบุคคล.
  - The same holds for the `CERTIFICATE_HOLDER_MISMATCH` error thrown by `resolveHolderForIssuance`.
  - No `shared/error-codes.js` entry contains `สลับ`, `switch active entity` or `ACTIVE_ENTITY_MISMATCH`.
- [ ] **Step 2: Run; expect FAIL.** Save red.txt.
- [ ] **Step 3: Apply the error-code and documentation changes, then regenerate `docs/api/error-codes.md`.**
  - Confirm with `grep -n "workspace\|active entity" CLAUDE.md` that CLAUDE.md needs no change, and record the output.
  - Check that `bash scripts/probes/tier-check.sh` classifies `apps/backend/services/holder-access.js` as C. If it does not, add the path to the `auth-exact-path` pattern (`tier-check.sh:72`) with a selftest case.
- [ ] **Step 4: Run both tests and `node scripts/ci/probe-gate.js`; expect PASS.** Save green.txt.
- [ ] **Step 5: Commit** `docs(governance): ถอดคำ workspace ออกจาก error codes/คู่มือ/agent/skill`.

### Task 14: web — remove the switcher and header plumbing

**Files:**
- Delete: `components/layout/entity-switcher.tsx` and its mount at `components/layout/dashboard-layout.tsx:19,327`; `lib/services/active-entity-provider.tsx`
- Create: `lib/services/my-entities-provider.tsx`, with `MyEntitiesProvider`, `useMyEntities(): { entities: EntityMembership[], isLoading, error, refresh }`, the `EntityMembership` type (with `can`), and the one-line boot cleanup `localStorage.removeItem('gacp.activeEntityId')` in try/catch
- Modify:
  - `app/providers.tsx:5,16-22`
  - `lib/api/api-client.ts:82-103,350-359,511,638-647` (header blocks and the `ACTIVE_ENTITY_MISMATCH` branch)
  - `app/api/[...path]/route.ts:57-60`, `app/api/auth/_lib/proxy-forward.ts:95-98`
  - `lib/services/auth-service.ts:305-319`, `lib/services/auth-service-session.ts:82-97`
  - `lib/services/use-entity-permissions.ts:235-262` (`useEntityPermissions(entityId: string | null)`; delete `isPersonalWorkspaceMembership:88-93`), and its callers `app/health/planting/[id]/client-view.tsx:96`, `app/health/planting/[id]/activities/use-planting-activities-page.ts:44`, `app/health/establishments/new/client-view.tsx:27`
  - `app/health/workspaces/page.tsx:66-70,146,276`, `workspaces/new/page.tsx:37,71`, `workspaces/[slug]/members/page.tsx:55,104`
  - `app/health/payments/client-view.tsx` (drop the workspace-switch reload from `ef5ec0fb`)
- Create: `scripts/probes/holder-read-scope.sh` with `--selftest`, and its `scripts/probes/probe-registry.txt` row `holder-read-scope | ci | - | - | <reason>` in the same commit (probe-gate requires a row for every `.sh`). The operator signs at merge.
- Test:
  - Delete `active-entity-storage-sync.test.ts`, `active-entity-auth-refetch.test.ts`, `active-entity-clear-on-account-switch.test.ts`, `api-client-active-entity-mismatch.test.ts`, `entity-switcher-workspace-identity.test.tsx`.
  - In `app/api/[...path]/route.test.ts:73-111`, `app/api/auth/_lib/proxy-forward.test.ts:21-37` and `app/api/auth/health/[...path]/route.test.ts:211-231`, replace the forwarding cases with one case each: `the proxy does not forward x-active-entity-id`.
  - `use-entity-permissions.test.ts`: the pure functions stay; add `the hook fetches /entities/:entityId/my-permissions for the entityId it is given`.
  - Add `my-entities-provider.test.tsx`: `stale gacp.activeEntityId is removed on mount`.

- [ ] **Step 1: Write the probe `--selftest` and the replacement tests.**
  - The probe FAILs when `apps/` spells any of `x-active-entity-id`, `req.activeEntity`, `entity-context`, `runWithEntityContext`, `getEntityContext`, `ACTIVE_ENTITY_MISMATCH` or `gacp.activeEntityId`. It excludes `node_modules`, `.next`, `*.test.*` and `__tests__/` (see C6).
  - The single allowed line is the cleanup in `my-entities-provider.tsx`, matched by exact file and text.
  - Selftest cases: `planted hit in a temp tree → FAIL`, `cleanup line alone → PASS`, `hit in a *.test.ts → PASS`, `cleanup text in another file → FAIL`, `mktemp failure → BLOCKED`.
- [ ] **Step 2: Run the selftest (PASS), the probe on the tree (FAIL: the web files listed above) and the replacement tests (FAIL: proxies still forward; the provider does not exist).** Save red.txt.
- [ ] **Step 3: Implement and delete.** On the workspaces page, the title becomes "นิติบุคคลและวิสาหกิจชุมชนของคุณ", the personal row is listed first as "ตัวคุณเอง (บุคคลธรรมดา)", "ใช้งานอยู่" and every `setActiveEntity` call are removed, and after creating an entity from step 1 the user returns to `/health/applications/new?holder=<id>`.
- [ ] **Step 4: Run the web jest suite, `bash scripts/probes/holder-read-scope.sh` and `node scripts/ci/probe-gate.js`; expect PASS.** Save green.txt.
- [ ] **Step 5: Commit** `feat(web): ถอดตัวสลับ workspace และ header · useMyEntities · probe holder-read-scope`.

### Task 15: web — step 1 "ยื่นในนาม", chip, lists, farm-create holder

**Files:**
- Create: `apps/web-app/src/components/holder/holder-picker.tsx` (`HolderPicker({ entities, value, onChange, purpose: 'file'|'farm' })`)
- Modify:
  - `app/health/applications/new/_steps/steps/step1-request-type.tsx:162-171` (replace the type cards with `HolderPicker`)
  - `step1-request-type-config.ts:47-63` (delete `APPLICANT_TYPE_OPTIONS`)
  - `_steps/hooks/use-application-flow-store.state-types.ts:47` (`applicantType` becomes `holderEntityId: string | null`; the type derives from the entity)
  - `use-application-flow-store.ts:22,223-235`
  - `_steps/hooks/use-auto-save.ts:281` (first save sends `entityId`; stops on `APPLICATION_HOLDER_REQUIRED`)
  - the step 2-6 layout (chip)
  - `lib/i18n/error-code-map.ts` (`APPLICATION_HOLDER_REQUIRED` → the spec §3.6 string)
  - lists: `app/health/applications/client-view.tsx`, `app/health/payments/client-view.tsx`, `app/health/certificates/client-view.tsx`, `app/health/establishments/client-view.tsx` (a "ยื่นในนาม" column; chips "ทั้งหมด" plus one per `displayName` when there is more than one entity)
  - `app/health/certificates/client-view.tsx:480-500` and `[id]/client-view.tsx:306` (hide the QR action when `canPrintQr` is false, C5)
  - `app/health/establishments/new/client-view.tsx:60` (`HolderPicker purpose='farm'`, body `entityId`)
- Test: `apps/web-app/src/components/holder/__tests__/holder-picker.test.tsx`, `app/health/applications/new/_steps/__tests__/step1-holder.test.tsx`, `_steps/hooks/use-auto-save.test.tsx` (extend)

- [ ] **Step 1: Write the failing tests.** Exact strings from spec §3.6:
  - `title ยื่นในนาม and help line ใบรับรองจะออกในนามที่คุณเลือก และเปลี่ยนภายหลังไม่ได้`.
  - `type lines ตัวคุณเอง (บุคคลธรรมดา) / นิติบุคคล / วิสาหกิจชุมชน`.
  - `exactly one editable entity → fact line ยื่นในนาม {displayName} · ใบรับรองจะออกในนามนี้, no choice`.
  - `edit but no submit → คุณกรอกคำขอในนามนี้ได้ แต่ผู้มีสิทธิ์ยื่นต้องเป็นผู้กดยื่น`.
  - `VIEWER card disabled with คุณมีสิทธิ์ดูอย่างเดียวในนามนี้`.
  - `link เพิ่มนิติบุคคลหรือวิสาหกิจชุมชน → /health/workspaces/new?returnTo=wizard`.
  - `?holder=<id> preselects`.
  - `chip ยื่นในนาม {displayName} with ถ้าเลือกผิด ให้ลบฉบับร่างนี้แล้วเริ่มคำขอใหม่`.
  - `action ลบฉบับร่างนี้แล้วเริ่มใหม่ calls DELETE /applications/draft/:id, then returns to step 1 with no holder selected`. There is no "change holder" control anywhere (spec §3.2).
  - `first auto-save body has entityId`.
  - `auto-save stops on APPLICATION_HOLDER_REQUIRED` (one error shown, no further POST within 3 debounce windows).
  - `list chips appear only with more than one entity`.
- [ ] **Step 2: Run; expect FAIL.** Save red.txt.
- [ ] **Step 3: Implement** with design tokens only (`.claude/skills/gacp-design-tokens`). No emoji.
- [ ] **Step 4: Run the web suite; expect PASS.** Save green.txt.
- [ ] **Step 5: Commit** `feat(web): ขั้นที่ 1 เลือก "ยื่นในนาม" · ป้ายผู้ถือในรายการ · ฟอร์มฟาร์มระบุผู้ถือ`.

### Task 16: R2 release pack

**Files:**
- Modify: `docs/operations/runbooks/2026-09-30-remove-workspace-mode.md` (R2 section), `BACKLOG-FOUND.md` (entry dated 2026-10-30: "delete the `gacp.activeEntityId` cleanup line in my-entities-provider.tsx and its probe allowance")
- Create: `evidence/remove-workspace-mode/INDEX.md`, `evidence/remove-workspace-mode/view-pack/INDEX.md` (after the operator's deploy)

- [ ] **Step 1: Write the R2 runbook section.**
  - Preconditions: D0 = 0 and D1 = `0 | 0` on the target DB, recorded with date and the operator's name.
  - Build both images from one SHA. Deploy the backend, then the web within the same window.
  - Post-deploy: `gacp_backend_health_read_unscoped_total` = 0 after the view-pack walk.
  - Rollback: redeploy both previous images together (spec §5).
- [ ] **Step 2: Run the final gates.** `LOCAL_GATE_FULL=1 bash scripts/ci/local-gate.sh`, the web suite, all real-PG suites (ports 55431–55439, each container removed afterwards), `ratchet.sh`, `holder-read-scope.sh`, and `tier-check.sh` (expect C). Write the summaries into `evidence/remove-workspace-mode/INDEX.md`.
- [ ] **Step 3: Hand off** to the operator for merge and deploy with `Status: PENDING` (view-pack not yet captured).
- [ ] **Step 4: After the operator's deploy,** capture the spec §4 view-pack on staging (flows 1–7, light and dark). Open every screenshot and record in `view-pack/INDEX.md` what each one shows. Commit `evidence(view-pack): ถอดโหมด workspace บน staging`.

---

## Operator rulings 2026-09-30

"C1 ยืนยัน / C4 ทำทางแยก / C5 ยืนยัน / C8 คงไว้ / subagent":
- **C1:** the intersection in `holderScope` stays until Task 12.
- **C4:** a separate planting-attachment door, built in Task 7b before R2.
- **C5:** `canPrintQr`, a null `qrCode` and a hidden QR action.
- **C8:** bundles stay owned by the filer, and §3.3 applies to each application in them.
- **Execution:** subagent-driven.

Also adopted: D0 and D1 run before the R1 deploy, so the filers of null-holder rows never lose sight of their invoices and certificates.

## Operator conflicts found while re-verifying (spec vs code)

- **C1:** Spec §5 says R1 equals `R(user) ∩ activeEntity` "for any request". The ALS narrows only Application and Farm (`tenant-prisma-extension.js:229-232`), so certificate and finance reads would widen in R1. The plan intersects in `holderScope` while the middleware exists (Task 1), and Task 12 removes the intersection.
- **C2:** The repo runs Prisma 5.22.0 (`apps/backend/package.json:24,43`), not Prisma 6. Task 1 pins the symbol behaviour on 5.22.
- **C3:** Besides `applications.js:400-408` there are six more personal-entity auto-heals with the same defect: `applications.js:487`, `application-workflow-handlers.js:383`, `revision-deadline.js:344`, `applications-car.js:109`, `application-bundles.js:176` and `renewals.js:104`. Task 8 deletes all of them, and a renewal whose source has no holder is refused.
- **C4:** The planting-activity page uploads attachments through `/applications/draft-documents` without an `applicationId` (`use-planting-activities-page.ts:106,138`), so today it rides on or creates an application draft. Under spec §3.2 this becomes 400/404 after R2. Operator ruling needed: give it its own door before R2 ships, or ship R2 with that upload knowingly broken. Until then, the R2 deploy is `BLOCKED(operator: planting-attachment door)`.
- **C5:** The QR is rendered client-side from the certificate number on the list and detail pages (`certificates/client-view.tsx:494`, `[id]/client-view.tsx:306`), and `/certificates/my` returns `qrCode` (`certificates.js:220`), so gating only the PDF leaves the QR in reach of a VIEWER. The plan's default (Tasks 11 and 15) returns `canPrintQr`, nulls `qrCode` and hides the QR action. The operator must confirm.
- **C6:** The spec's probe bans `x-active-entity-id` in all of `apps/`, but spec §4 requires tests that send it (proxy cases, holder-scope case 5). The plan's probe excludes test files.
- **C7:** The in-flight branch answers a non-member with 403 (`assertHealthOwnsInvoice`), while spec §4 case 2 wants 404. `applicant-billing-membership-real-postgres.test.js` (not named in the spec) must be rewritten too (Task 5).
- **C8:** `ApplicationBundle` has no holder column (it is keyed on the filer `healthId`, `application-bundles.js:53-67`) and has no web UI. The plan keeps bundle ownership with its filer and applies §3.3 to each application inside it. Alternative: retire bundles.
- **C9:** `farm-access.listActiveMemberships` (`:71-86`) does not filter `entity.isDeleted`. Adding the filter to meet spec §3.1 also narrows farm reads. There is no entity-delete door today, so this has no live effect.
- **C10:** Health reads also pass through `authenticateAny` GETs (`certificates.js:289`, `quotations.js:139,261`, `entities/index.js`). The walk covers both middlewares, not only `authenticateHealth`.
- **Line drifts (no ruling needed):** `/mine` `permissions[]` is at `entity-service.js:1323` (spec: `:1322`). The metric is named `gacp_backend_health_read_unscoped_total` to match `shared/prometheus.js`.
