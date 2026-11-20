# Remove workspace mode: the holder is chosen per filing, reads follow membership (design)

Date 2026-09-30 · Status: APPROVED — operator answered Q1–Q5 (2026-09-30, "ยืนยันตามคุณแนะนำ": all five as recommended); written spec APPROVED by the operator 2026-09-30 ("อนุมัติ") · Tier C (authz) · no plan is written before approval
Source: operator ruling 2026-09-29 ("เห็นด้วย") · inventory `/home/ubuntu/work/state/workspace-removal-inventory-2026-09-30.md`
(B1-B23, W1-W13 below refer to its rows; every line cited here was re-read on main 07a3aa60)

## 1. Rulings this design is bound by

| Ruling | Effect on the design |
|---|---|
| Remove the active-workspace mode (2026-09-29) | Delete `x-active-entity-id`, `activeEntityMiddleware`, `services/entity-context.js`, the entity dimension of `tenantInjectExtension`, `ActiveEntityProvider`, `entity-switcher.tsx`, `POST /entities/me/switch` |
| Entity stays the legal holder; no schema change | `Application.entityId` and `Farm.entityId` stay the only holder columns; everything else derives through them |
| A company or community enterprise holds its own certificate (2026-09-07) | `holderMismatchIssue()` (`application-requirements-service.js:87`) and `resolveHolderForIssuance()` (`certificate-service.js:2370`) stay unchanged in logic; the system never creates a legal identity from form data |
| Holder chosen explicitly in step 1, validated server-side | The body carries `entityId`; no header, no silent default |
| Co-members see the company's applications, invoices, receipts, certificates | Health reads are keyed on holder membership, not on the filer (`healthId`/`userId`) |
| A filing's holder is fixed at birth: a wrong holder means delete and start again (M2 G7, 2026-08-15) | No re-homing, no "change holder" action |
| Org-model direction C stays possible | One membership predicate, one place; delegation later adds rows to the same set |

## 2. What exists today (verified)

- `bindScopes()` (`middleware/auth-middleware.js:46`) runs `activeEntityMiddleware` after `bindTenant` for every authenticated request, health and staff alike. With no header it binds the user's personal INDIVIDUAL entity (`active-entity-middleware.js:152-156`), and it fails open on error (`:189-195`).
- `applyReadScopes()` (`services/tenant-prisma-extension.js:322-330`) ANDs `entityId = ctx.entityId` into every Application and Farm `findMany`/`findFirst`/`count`/`aggregate`/`groupBy`. Every health list is therefore the intersection of the filer pin and one entity.
- Health reads pin the filer, not the holder: `buildHealthWhereClause` pins `applicant.id` (`application-identity-methods.js:241-247`), `getCertificateForUser` pins `Certificate.userId` (`certificate-service.js:1225`), payments pin `healthId` (`routes/api/finance/payments.js:233`). A co-member can only see company rows through the `personal:false` relax in `buildHealthWhereClause` (`:222-228`), and that relax covers 4 of the Application read methods, not the by-id doors.
- `farm-access.js` already answers "which farms may this user reach" by ACTIVE membership, with no ALS. It is the model for this design.
- `VIEW_FINANCIAL` is defined (`entity-service.js:81`) and enforced nowhere (grep of `apps/backend` and `apps/web-app/src`, 2026-09-30).
- W13, the wizard's step 1, is `apps/web-app/src/app/health/applications/new/_steps/steps/step1-request-type.tsx`. Its "ผู้ยื่นคำขอ" question (`:162-171`) picks a TYPE (`APPLICANT_TYPE_OPTIONS`, `step1-request-type-config.ts:47-63`), not an entity. The entity comes from the header. The file "general-step.tsx" cited in `entity-switcher.tsx:115` does not exist.
- B6 (`executeWizardSubmission`, `application-submission-methods.js:24`) is reached only through `/api/wizard`, which mounts only when `ENABLE_PROVIDER_LEGACY_ALIAS === 'true'` (`routes/api/index.js:368-371`). That flag appears in no compose or env file in the repo (grep: only `ci.yml`, docs and tests). The live submit door (`applications.js` POST `/submit`) already stamps the farm with `draft.entityId` (`applications.js:1192`).
- Read-call census, measured with `grep -E "\.<model>\.(findMany|findFirst|findUnique|…|count|aggregate|groupBy)\("` over `apps/backend/{routes,services,controllers}` without tests: Application 175, Farm 41, Certificate 54, Invoice 62, Quote 14, Quotation 7, CheckoutOrder 4. There are 44 route/controller files that use `authenticateHealth`. Many of these read sites are provider-only; the guard in §4.4 is what separates them, not this count.

## 3. Decisions

### 3.1 The membership-set read rule

**Predicate (READ).** Decision: the user may read a holder-bearing row when its holder entity is in
`R(user) = { m.entityId | EntityMembership m: m.userId = user, m.status = 'ACTIVE', m.entity.isDeleted = false }`,
with any role: OWNER, ADMIN, MANAGER or VIEWER. Reason: VIEWER is defined as read-only (`entity.prisma:130-134`), so a read rule that excludes it leaves the role with nothing to do. PENDING and REVOKED memberships are excluded. VIEWER is operator question Q1.

**No filer fallback.** Decision: a row whose holder is null is not readable by anyone on the health side. Reason: a second "or I filed it" branch would keep two ownership models alive forever. Null rows are healed before the switch (§3.5).

**Where it lives.** Decision: a new `apps/backend/services/holder-access.js` that reuses `farm-access.listActiveMemberships` (one membership query), modeled on `farm-access.js`. Reason: one home for "which holders can this user see", next to the farm one it extends.

```
holderScope(req)                      → { userId, readIds, editIds }   memoized on req, one query
holderReadWhere(scope, model)         → Prisma where-fragment (table below), carries HOLDER_SCOPED marker
assertHolderCapability(userId, entityId, capability)  → assertEntityActionPermission (existing engine)
resolveHolderOwnerOrCreator(app, userId)              → boolean, destructive-grade (§3.3)
```

`editIds` is `readIds` minus VIEWER memberships (the S2 floor in `farm-access.js`). An empty set yields an empty result (fail closed). A lookup failure yields `[]` and is logged, as `farm-access` already does.

| Model | Fragment (`ids` = `scope.readIds`) | Why this path |
|---|---|---|
| Application | `{ entityId: { in: ids } }` | the holder column itself |
| Farm | `farmAccessWhere(userId)` unchanged | already membership-based; its solo `entityId: null` branch goes when the NOT NULL follow-up lands |
| Certificate | `{ application: { entityId: { in: ids } } }` | same source the issuer used (`resolveHolderForIssuance` reads `app.entity` first); `applicationId` is NOT NULL |
| Invoice, Quote, Quotation, PaymentTransaction | `{ application: { entityId: { in: ids } } }` | every Invoice has an application (CHECK `invoices_billable_application_chk`, `billing.prisma:12-15`) |
| CheckoutOrder | `{ application: { entityId: { in: ids } } }` | health orders are application orders |
| CheckoutDocument (receipt, tax invoice) | `{ checkoutOrder: { application: { entityId: { in: ids } } } }` | no holder column, derives through the order |
| ApplicationDocument, DocumentPrecheck | `{ application: { entityId: { in: ids } } }` | same |

Every health read site replaces its filer pin (`applicant`, `healthId`, `userId`) with the fragment. By-id reads use `findFirst({ where: { id, ...fragment } })`, never `findUnique` followed by a JavaScript check, so one shape covers every read. `buildHealthWhereClause` and its `strictApplicantPin` option are deleted.

**The in-flight stopgap.** `fix/applicant-receipt-and-billing-scope` changes `/api/invoices/my` to `where = { healthId, application: { entityId: req.activeEntity.entityId } }`. Under this design it becomes `where = { isDeleted: false, ...holderReadWhere(scope, 'Invoice') }`. The `healthId` pin is dropped, so co-members see the company's invoices. The web "reload on workspace switch" from `ef5ec0fb` is removed, and the `?applicationId=` filter stays. Its real-Postgres test (`applicant-billing-workspace-real-postgres.test.js`) is rewritten from header-driven to membership-driven. The branch may merge first, because it is correct under today's model. This work then rewrites its two lines.

**Provider and staff routes stay unaffected.**
- (a) The predicate is explicit, and only health handlers call it. Nothing ambient is left that could touch a staff request.
- (b) Today staff reads get the ALS filter only when the staff account holds an OWNER membership on an INDIVIDUAL entity. Otherwise the middleware returns `null` and binds nothing (`active-entity-middleware.js:164-167`). Personal entities are created only at health registration and in the HEALTH-only `/mine` heal, so staff accounts have none. Removing the ALS therefore removes nothing from staff reads. Deploy step D0 proves this: a read-only count of staff users holding any ACTIVE membership, expected 0. If the count is not 0, those reads widen to what the staff member's organization and RBAC already allow, which is the intended staff view.
- (c) The witness (§3.1 guard) runs only when `req.user.canonicalRole === 'health'` (`shared/canonical-rbac.js:59`), not on the middleware name. `authenticateHealth` also serves a provider branch (`application-listing-handlers.js:62-92`).
- (d) The org dimension (`getTenantContext`, `TENANT_READ_ORG_SCOPE`) is untouched.

**The guard: no read may be missed.** B4 is removed only after all three parts below are in place.

1. **Runtime witness (shadow in staging, throw in tests).** `tenantInjectExtension` loses its entity dimension and gains a check-only hook. On a health request, a read of a watched model (the table above) whose `where` does not carry the `HOLDER_SCOPED` symbol marker counts `health_read_unscoped_total{model,op}` and logs the caller stack. Under `NODE_ENV=test` it throws. The marker is an enumerable symbol key, and object spread copies it (`{ ...fragment, status }`). The witness walks `AND`/`OR` one level deep. The first implementation task pins, with a real-Postgres test, that Prisma 6 ignores the symbol key. If Prisma rejects the key, the fallback is a WeakSet of the helper's `in` arrays. The principal kind (`health`/`staff`) is added to the existing tenant context object. No new ALS is created.
2. **Door walk on real Postgres.** A new integration test enumerates every GET route behind `authenticateHealth` from the Express router stack. It calls each route as a co-member and as a stranger against the §5 fixture, with the witness in throw mode. A route whose path parameter is not in the test's param-to-fixture map fails the test. A new health GET door therefore cannot arrive without being walked.
3. **Probe `holder-read-scope` `[BUILD]`** (`scripts/probes/holder-read-scope.sh`, `--selftest` both directions). It fails if `apps/` spells any of `x-active-entity-id`, `req.activeEntity`, `entity-context`, `runWithEntityContext`, `getEntityContext`, `ACTIVE_ENTITY_MISMATCH` or `gacp.activeEntityId`. The one exception is the storage-key cleanup line in §3.6. `retired-words` does not read `apps/`, so it cannot do this job.

What the guard does NOT see:
- a read that no test and no staging traffic executes;
- `$queryRaw` and `$executeRaw`;
- rows reached through `include`/`select` of an unwatched parent (for example `user.applications`);
- farm children such as Plot, PlantingCycle and HarvestBatch, which `farm-access` guards already cover;
- POST, PUT and DELETE handlers' internal reads, which the walk does not call (their writes are gated by §3.2-3.3);
- a fragment built from the wrong user's scope;
- unit tests that mock `prisma`, where the witness never runs at all.

### 3.2 Writes and choosing the holder

- **Step 1 picker.** Decision: the list comes from `GET /entities/mine`. That route gains one field per row, `can: { edit, submit, createFarm }`, computed by the effective-permissions engine (role ∪ `permissions[]` ∪ GRANT − REVOKE). Reason: `/mine` today returns only the legacy `permissions[]` array (`entity-service.js:1322`), so the client cannot know grants. `edit` = not VIEWER.
- **Create.** Decision: `POST /applications/draft` (and every door that can create a draft) without `applicationId` requires `body.entityId`. Missing → 400 `APPLICATION_HOLDER_REQUIRED`. Not in `editIds` → 403 `ENTITY_PERMISSION_DENIED`. No default to the personal entity. Reason: the silent default is the same defect as the header default.
- **Derived applicant type.** Decision: the server writes `formData.applicantType = Entity.type` at create, and `applicantType` joins `SERVER_OWNED_FORM_DATA_KEYS`. Reason: the paper's declared type and the holder can then never disagree on a new filing. Both holder checks stay as the backstop for old rows.
- **Submit.** Unchanged: `application-submit-guard.js` already checks SUBMIT_APPLICATION on the application's own `entityId` (B13). Only the `activeEntityId` audit field is dropped. `onBehalfOfEntityId` stays.
- **Draft edits** (`/draft`, `/prepare`, draft-documents): the caller must hold the application's `entityId` in `editIds`. MANAGER can fill in a draft but not submit it, per the standing decision recorded at `entity-service.js:144-149`.
- **`/prepare` never re-homes (B11).** Decision: delete `nextEntityId = req.activeEntity?.entityId || application.entityId` (`applications.js:1567`). `entityId` is never written after create, and a body `entityId` on `/prepare` is ignored and stripped. Reason: M2 G7.
- **Changing a draft's holder.** Decision: not allowed. The wizard offers "ลบฉบับร่างนี้แล้วเริ่มใหม่" instead. Reason: M2 G7 ("สร้างผิดหมวก = ลบสร้างใหม่"), and uploaded documents and requirement slots are keyed to the holder type.
- **Reads never create.** Decision: `GET /draft-documents` and `DELETE /draft-documents/:id` (`applications.js:1727, 1739`) stop calling `findOrCreateApplicationForHealth`. They require `applicationId`, and a missing draft returns 404. Reason: a read that writes can create a draft under a holder nobody chose.
- **Resume without an id.** `GET /draft` without an id returns the caller's own latest open draft (`submitterId = me`, holder in `editIds`). All writes carry an explicit id. The auto-heal of null drafts to the personal entity (`applications.js:400-408`) is deleted. It never checked the declared type, so it could make a person the holder of a company filing. The §3.5 script replaces it.
- **Farm create (B7/B8).** Decision: `POST /farms` requires `body.entityId`, and FARM_CREATE on that entity is always checked, including on the personal entity, where OWNER holds it by role. `createFarm` takes `entityId` as a required argument and throws without it. Reason: one rule instead of "gate only when personal:false" (`farms.js:174`).
- **Wizard-created farm (B6).** Decision: delete the legacy `/api/wizard` door (`routes/api/applications/wizard.js`, `wizard-controller` submit and prepare, `executeWizardSubmission`) and its flag branch. Reason: it has no holder input, it mounts in no deployed environment, and the platform is pre-production. The live door already stamps `draft.entityId`.

### 3.3 Destructive and owner-only actions (replaces `strictApplicantPin`, B5)

| Action | Who | Reason |
|---|---|---|
| Delete a draft (`DELETE /draft/:id`) | the draft's creator (`submitterId`) with an ACTIVE non-VIEWER membership on its holder, or the holder's OWNER | the same rule `resolveFarmOwnerAccess` already applies to farm delete (`farm-access.js:185-205`) |
| Remove a draft document | anyone in `editIds` for that application | editing a draft, not destroying it; the verdict lock (`applications.js:1747-1749`) still applies |
| Delete a bundle or remove an application from it (`application-bundles.js:386, 618`) | same as delete a draft | same grade |
| Withdraw a submitted application | no such door exists (grep 2026-09-30); if one is added, OWNER only | out of scope |
| Revision and CAR resubmit (`PUT /:id/revision`, CAR doors) | SUBMIT_APPLICATION on the holder, through the existing submit guard | a resubmit is a submit |
| Start a checkout for an application | SUBMIT_APPLICATION on the holder (operator question Q3) | paying commits the entity to the filing |
| Membership admin | unchanged (`entities/index.js`, `member-permissions.js`) | already keyed by entity id, not by the header |

### 3.4 The certificate PRINT_QR gate (B14)

Decision: `GET /certificates/:id/download` reads the certificate with `holderReadWhere`, so a stranger gets 404. It then calls `assertEntityActionPermission({ entityId: certificate.application.entityId, userId, permission: 'PRINT_QR' })`. A missing membership or a denial returns 403 `ENTITY_PERMISSION_DENIED`, fail closed. Reason: today the gate runs only when `req.activeEntity` exists (`certificates.js:399`), and it uses the role without grants. The engine honors GRANT and REVOKE. The same gate applies to any other health door that returns the certificate's QR image. The implementer lists those doors in the plan.

### 3.5 Legacy rows with a null `entityId`

Measured 2026-09-30:
- staging: Application 3/6 null, Farm 2/4 null;
- demo: Application 0/2 null, Farm 2/3 null.

Decision: heal by script before the switch, and delete only what no rule can place. Reason: the rows are few and some may back specimen certificates. Deleting a row with a certificate needs cascade decisions, while a heal is additive and old code tolerates it.

- Script `apps/backend/scripts/heal-null-holders.js`. It runs dry by default and writes a CSV (row id, chosen entity, rule, evidence) to `evidence/`. `--apply` is run by the operator, because it writes to the shared DB.
- Application rule: if `formData.applicantType` is INDIVIDUAL or absent, and the filer (`Application.healthId` → User) has exactly one OWNER membership on an INDIVIDUAL entity, the holder is that entity. Otherwise the row is not healed.
- Farm rule: first, the `entityId` of an application whose certificate names this farm (`Certificate.farmId`), if that is not null. Otherwise, the owner's single personal INDIVIDUAL entity, by the same test.
- A row the rules cannot place goes on a list for the operator. For example: declared JURISTIC with no matching entity, or two candidate entities. A DRAFT on that list is deleted on the operator's word. A non-draft is the operator's call (Q2).
- Deploy gate D1: `count(*) WHERE "entityId" IS NULL` on `applications` and `farms` returns 0 on the target DB before the new backend image starts.
- `NOT NULL` on both columns is a separate Tier C follow-up (see non-goals). The gate stands in for it until then.

### 3.6 Web UI

- **Switcher.** Delete W1-W7 and W9: `ActiveEntityProvider` switching state, the api-client header blocks (`api-client.ts:350-359, 638-647`), both proxies (`app/api/[...path]/route.ts:57-60`, `proxy-forward.ts:95-98`), the `ACTIVE_ENTITY_MISMATCH` branch, and `entity-switcher.tsx` together with its mount at `dashboard-layout.tsx:327`. Keep a `useMyEntities()` hook (the `/mine` list plus `refresh`) and the `EntityMembership` type.
- **Step 1 ("ยื่นในนาม").** Replace the three type cards "ผู้ยื่นคำขอ" with a holder question. The type then follows from the chosen entity. Choice cards show the entity's `displayName`, a type line and the user's role.

| Case | Thai UI string |
|---|---|
| Question title | ยื่นในนาม |
| Help line | ใบรับรองจะออกในนามที่คุณเลือก และเปลี่ยนภายหลังไม่ได้ |
| Type line: own INDIVIDUAL / JURISTIC / COMMUNITY_ENTERPRISE | ตัวคุณเอง (บุคคลธรรมดา) / นิติบุคคล / วิสาหกิจชุมชน |
| Exactly one editable entity (stated as a fact, the pattern of the one-plant line `step1-request-type.tsx:177-184`) | ยื่นในนาม {displayName} · ใบรับรองจะออกในนามนี้ |
| Card with `edit` but no `submit` | คุณกรอกคำขอในนามนี้ได้ แต่ผู้มีสิทธิ์ยื่นต้องเป็นผู้กดยื่น |
| VIEWER card (disabled) | คุณมีสิทธิ์ดูอย่างเดียวในนามนี้ |
| Link to `/health/workspaces/new` | เพิ่มนิติบุคคลหรือวิสาหกิจชุมชน |
| Chip on steps 2-6 | ยื่นในนาม {displayName} |
| Under the chip | ถ้าเลือกผิด ให้ลบฉบับร่างนี้แล้วเริ่มคำขอใหม่ |

- **Lists.** Applications, payments, certificates and farms show every row the user can read, with a "ยื่นในนาม" column. When the user has more than one entity, filter chips appear: "ทั้งหมด" plus one chip per `displayName`. No page has an "active" state any more.
- **Workspaces pages (W10-W12).** Keep them as the management page for "my entities". Remove the "ใช้งานอยู่" marker (`workspaces/page.tsx:276`) and every `setActiveEntity` call. After creating an entity, return to the wizard with that entity preselected when the user came from step 1. Rename the title "Workspace ของคุณ" (`:146`) to "นิติบุคคลและวิสาหกิจชุมชนของคุณ", with the personal row listed first as "ตัวคุณเอง (บุคคลธรรมดา)" (Q5).
- **Per-object permissions (W8).** `useEntityPermissions(entityId)` takes the entity of the object on screen (the farm or the application). Its pure decision functions and cache stay. Callers: `planting/[id]/client-view.tsx:96`, `planting/[id]/activities/use-planting-activities-page.ts:44`, `establishments/new/client-view.tsx:27`. The farm-create page takes `entityId` from a holder field on the form (the same picker component).
- **Stale storage.** One line at app boot removes `gacp.activeEntityId` from localStorage. It is the only allowed spelling of the key (§3.1 probe). An entry in `BACKLOG-FOUND.md` dated 30 days later deletes the line.
- **Error copy.** `APPLICATION_HOLDER_REQUIRED` maps to "ยังไม่ได้เลือกว่าจะยื่นในนามใคร กรุณาเลือกที่ขั้นตอนที่ 1 หากเปิดหน้านี้ค้างไว้ ให้โหลดหน้าใหม่ก่อน".
- All copy follows `thai-ui-copy`: คุณ register, no em dash, cause plus next action, no emoji. Mobile needs no code change (inventory §0.5).

### 3.7 Error codes and documents

- **Retire:**
  - `ACTIVE_ENTITY_MISMATCH` (`shared/error-codes.js:358`).
  - `APPLICANT_ENTITY_MISSING` (`:1312`), replaced by `APPLICATION_HOLDER_REQUIRED` (400). Its remediation points at the switcher.
  - `CAPABILITY_DENIED` on the certificate download door only. The code stays for its other callers.
- **Reword:**
  - The `holderMismatchIssue` message (`application-requirements-service.js:94-96`) and `CERTIFICATE_HOLDER_MISMATCH` (`error-codes.js:1676-1678`, `certificate-service.js:2393-2396`) drop "สลับไปพื้นที่ทำงาน". New Thai: "คำขอนี้ระบุผู้ยื่นเป็น{word} แต่ผูกอยู่กับบุคคล ผู้ถือใบรับรองต้องเป็น{word}เอง กรุณาลบฉบับร่างนี้ แล้วเริ่มคำขอใหม่โดยเลือกยื่นในนาม{word}".
  - The "active entity" remediations of `TENANT_CONTEXT_FAILED`, `CROSS_TENANT_WRITE` and `FORBIDDEN_TENANT` (`:372, :380, :1038`) say "organization", because they are about the org dimension.
- **Regenerate:** `docs/api/error-codes.md` with `scripts/extract-error-codes.js --markdown`. The file is generated, never edited by hand. `error-codes-source-pointers.test.js` must stay green.
- **Contract manual:** `docs/contract/manual/01-identity-health-id.md` (removed from tree 2026-10-05) §4.3 becomes "ผู้ยื่นในนามและสิทธิ์การเห็นข้อมูล". It covers the READ predicate, the step-1 choice, G7 and the file:line of `holder-access.js`.
- **Governance** (memory: governance docs follow every change): HARNESS.md §4.5 adds `holder-read-scope` `[BUILD]`, and `probe-registry.txt` gets the row (operator-signed). `.claude/agents/role-workflow-auditor.md` and the `gacp-workflow-rules` skill each get one paragraph on "what a health role sees = holder membership". CLAUDE.md has no workspace text (grep 2026-09-30), so it needs no change.
- **Schema:** `EntityContextSwitch` stops receiving rows. The table stays, per "no schema change".

## 4. Test strategy

**Deleted** (they pin the removed mechanism):
- backend `active-entity-middleware.test.js`, `entity-prisma-extension.test.js`, `applications-prepare-active-entity.test.js`;
- web `active-entity-storage-sync.test.ts`, `active-entity-auth-refetch.test.ts`, `active-entity-clear-on-account-switch.test.ts`, `api-client-active-entity-mismatch.test.ts`, `entity-switcher-workspace-identity.test.tsx`;
- the header-forwarding cases in `app/api/[...path]/route.test.ts:73-111`, `proxy-forward.test.ts:21-37` and `auth/health/[...path]/route.test.ts:211-231`. Each file gets one replacement case: "the proxy does not forward `x-active-entity-id`".

**Rewritten:**

| Test | Becomes |
|---|---|
| `application-entity-scope-where.test.js` | `holder-access.test.js`: role × status matrix, deleted entity, lookup failure → `[]`, marker survives spread |
| `farm-entityid-stamp.test.js` | `createFarm` without `entityId` throws; the route passes `body.entityId` |
| `farm-permission-gates.test.js` | FARM_CREATE is always checked against `body.entityId`, and the OWNER of the personal entity passes by role |
| `applications-submit-capability-gate.test.js` | same matrix, no `activeEntity` injection |
| `application-submit-guard.test.js`, `applications-prepare-server-owned-fields.test.js` | drop `activeEntityId`; add that `entityId` and `applicantType` from the body are stripped on `/prepare` |
| `certificate-download-cold-start-retry.test.js` | mocks the engine instead of `req.activeEntity` |
| `personal-entity-determinism-and-invite.test.js` | drop the header parts; keep the determinism of `findPersonalEntityForHealthIdentity` only if that function still has a caller |
| `farm-service-edit-permission.test.js`, `tenant-read-org-backstop.test.js` | remove the `entity-context` mock |
| web `use-entity-permissions.test.ts` | the pure functions stay; the hook takes `entityId` |
| `applicant-billing-workspace-real-postgres.test.js` (in-flight branch) | membership-driven instead of header-driven |

The registration and personal-entity tests (inventory §3, last bullet) do not change: `ensurePersonalIndividualEntity` stays.

**RED first** (Tier C: paste the failing output before GREEN). There are two new files.

`holder-scope-real-postgres.test.js`, on real Postgres. It runs with `NODE_ENV=test`, so the witness throws on an unscoped read. The fixture:
- company C, with A as OWNER, B as MANAGER and V as VIEWER;
- A's personal entity PA;
- a stranger S who owns a personal entity PS;
- staff user F;
- application X held by C and filed by A, with an invoice, a receipt and a certificate;
- draft D held by C and created by A;
- application Y held by PA.

1. B lists applications and sees X and D, not Y. B opens X, its invoice, the receipt PDF and the certificate: all 200.
2. S lists and sees none of X, D or Y. S gets 404 on X, its invoice, the receipt and the certificate by id.
3. V sees X. When V submits D: 403 `ENTITY_PERMISSION_DENIED`. When V edits D: 403. When V downloads the certificate PDF: 403 (PRINT_QR).
4. When B deletes D: refused. When A deletes D: 200. When a second OWNER O2 deletes another draft of C: 200.
5. S sends `x-active-entity-id: C` and still sees nothing, with no 403 `ACTIVE_ENTITY_MISMATCH`: the header is inert.
6. A calls `/prepare` on D with `entityId: PA` in the body. D's holder is still C.
7. Draft create with `entityId: C` by S: 403. By V: 403. With no `entityId`: 400 `APPLICATION_HOLDER_REQUIRED`.
8. A's membership on C becomes REVOKED. A no longer sees X.
9. F's provider listing returns X, D and Y with or without the header. This is the staff view, unchanged.

`health-door-walk-real-postgres.test.js`: the §3.1 door walk.

**View-pack** (HARNESS.md §4.4), captured on staging after deploy, not from local files (memory: measure after deploy). Each flow is captured in light and dark mode.
- (1) step 1 for a user with one entity (the fact line) and for a user with two (the choice);
- (2) the applications list as A and as co-member B, with the "ยื่นในนาม" column and the chips;
- (3) the payments page and a receipt download as B;
- (4) the certificates list with holder labels, and the VIEWER's refusal message on download;
- (5) the workspaces page without "ใช้งานอยู่";
- (6) the header without the switcher pill;
- (7) a browser with a stale `gacp.activeEntityId`: the key is gone after load.

## 5. Rollout and rollback

- **R1, backend only, behaviour-neutral.** Ship `holder-access.js`, the witness in shadow mode, and every health read converted to `holderReadWhere`, while the ALS is still on. For any request the result is `R(user) ∩ activeEntity`, which equals today's result. R1 deploys alone. The operator checks `health_read_unscoped_total` stays at 0 during one staging walk.
- **D0 and D1.** D0 is the staff-membership count (expected 0). D1 is the heal script: dry run, then the operator's `--apply`, then the null count = 0 on staging and on demo. Both run against the old code, which tolerates the healed rows.
- **R2, backend and web from the same commit, in one operator deploy (backend first, web within the same window).** The middleware, the ALS, the extension's entity dimension and `/me/switch` go. Creates require `body.entityId`, and the web ships the picker and loses the switcher.
  - Can they deploy independently? For reads, yes: R2's backend ignores a stray header, so an old tab keeps reading. For creates, no: an old tab sends no `body.entityId` and gets 400 `APPLICATION_HOLDER_REQUIRED`, whose message tells the user to reload.
  - The reverse order (new web, old backend) would send the body field to a backend that still takes the holder from the header. That is why the two ship from one commit.
- **Rollback.** Redeploy the previous two images together. There is no schema change. The heal writes only fill null columns, which old code accepts (it heals them itself). Drafts created under R2 carry an explicit `entityId`, and the old code reads them unchanged. The only visible regression on rollback is the old switcher returning.

## 6. Non-goals

- Agency delegation and consultant/POA roles (M2 pillar 3): later rows in the same membership set.
- Invite UX changes.
- Any schema change. This covers `NOT NULL` on `Application.entityId`/`Farm.entityId`, dropping `EntityContextSwitch`, and dropping `Certificate.userId`. Each of these is a later Tier C migration.
- Farm transfer: a certificate follows its application's holder until a transfer workflow exists.
- Enforcing `VIEW_FINANCIAL` (Q4).
- Mobile.
- Staff-side scoping.

## 7. Operator questions — answered 2026-09-30: every row decided as recommended

| # | Question | Decision (operator, 2026-09-30) |
|---|---|---|
| Q1 | May a VIEWER read the company's applications, invoices, receipts and certificates? | Yes. VIEWER is the read-only role by definition, and it still cannot edit, submit, pay or print the QR. |
| Q2 | Legacy rows the heal rules cannot place: delete them, or decide row by row? | Delete unplaceable drafts. Decide row by row for a non-draft, especially one with a certificate. Heal everything the rules place (§3.5). |
| Q3 | Who may start a checkout for a company's application? Today only the filer can (`payments.js:233`). | Any member holding SUBMIT_APPLICATION on the holder, the same people who may file. The filer is included while still ACTIVE. |
| Q4 | `VIEW_FINANCIAL` exists but gates nothing. Should finance reads require it? | No. It would hide invoices from MANAGER and VIEWER, which contradicts the 2026-09-29 ruling. Leave it unenforced, and decide under direction C. |
| Q5 | Title for the management page: "นิติบุคคลและวิสาหกิจชุมชนของคุณ" (personal row first as "ตัวคุณเอง (บุคคลธรรมดา)")? | Yes. "Workspace" names the mode being removed. |
