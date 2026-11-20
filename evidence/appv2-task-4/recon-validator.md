## 1. Exports — `apps/backend/services/application-document-requirements.js` (249 lines, read in full)

`module.exports` at **:242-249**:

| Export | Kind | Exact signature | Returns / value |
|---|---|---|---|
| `collectServerDocumentEvidence` | sync fn | `(application, documentRows = [])` | `Set<string>` of canonical slot ids (lower-case) |
| `assertRequiredDocumentsPresent` | async fn | `({ application, mode, client = prisma } = {})` | `Promise<{ appliedRules: object[], requiredSlotIds: string[], grandfathered: boolean }>`; throws `DocumentRequirementError` (422) or a plain `Error` for a bad mode |
| `buildRequirementSnapshot` | sync fn | `(appliedRules)` | `{ stampedAt: string(ISO), ruleIds: string[], slotIds: string[] }` |
| `DocumentRequirementError` | class | `new DocumentRequirementError(missingSlots)` | see §3 |
| `MODE_FIRST_SUBMIT` | const | `'first-submit'` (**:41**) | |
| `MODE_RESUBMIT` | const | `'resubmit'` (**:42**) | |

Not exported (private, but Task 4 will want them): `isPlainObject` (:77), `formDataOf` (:81), `describeSlot` (:85), `missingFrom` (:144), `resolveHolderType` (:233), `SLOT_LABEL_TH_BY_CANONICAL_ID` (:51).

`buildRequirementSnapshot` detail (**:132-142**): `ruleIds = rules.map(r => r?.id).filter(Boolean)`; `slotIds = [...new Set(rules.map(r => getCanonicalSlotId(r?.slotId)).filter(Boolean))]`. Non-array input → `[]`. Pure except `new Date()`.

## 2. `collectServerDocumentEvidence` (:100-121)

```js
function collectServerDocumentEvidence(application, documentRows = []) {
    const formData = formDataOf(application);
    const evidence = buildUploadedSlotSet(Array.isArray(formData.draftDocuments) ? formData.draftDocuments : []);
    (Array.isArray(documentRows) ? documentRows : []).forEach((row) => {
        const documentType = row?.documentType;
        if (documentType) { evidence.add(getCanonicalSlotId(documentType)); }
    });
    return evidence;
}
```

- **Takes**: `application` — only `application.formData` is touched (`formDataOf` at :81 returns `{}` for a non-plain-object). `documentRows` — array of `{ documentType }`; anything not an array is treated as `[]`; rows without a truthy `documentType` are skipped. **Nothing else on the row is read** — not `currentForSlot`, not `supersededAt`, not `verificationStatus`.
- **Returns**: a **`Set<string>`**, values are **canonical, lower-case** slot ids. Not a Map, no labels, no file info.
- **The fold**: both branches go through `getCanonicalSlotId` (`packages/validation/src/upload-rules.js:436-439`), which calls `normalizeSlotId` (**:411-418**: `String(value||'').trim().replaceAll('-','_').replaceAll('.','_').toLowerCase()`) then looks up `SLOT_ALIAS_LOOKUP` (**:420-431**), falling back to the normalized string when unknown. So `'LAND_TITLE'`, `'land_deed'`, `'landTitle'` all → `'land_rights'`; `'COMPANY_REG'` → `'juristic_reg_6m'`; `'LICENSE_PT11'` → `'controlled_herb_license'` (verified by running the fold, see §4).
- **draftDocuments branch**: `buildUploadedSlotSet` (`routes/api/applications/validation-slot-utils.js:27-47`) takes the id from `entry.slotId || entry.type || entry.id` for objects, or the string itself, skips falsy, and canonicalizes. **`entry.id` is a real hazard for a new caller** — the upload route writes `documentId`, not `id` (`applications.js:1418`), so today no UUID leaks in; a caller that hands it `Application.attachments` entries would, because those carry `id: draftDoc.documentId` (`wizard-controller-helpers.js:113-114`).
- Deliberately **not** read: `formData.documents` (the client's checklist) — header comment :19-22, pinned by a test.

## 3. `assertRequiredDocumentsPresent` (:166-221) and its 422

Error class, **:66-75**, verbatim:

```js
class DocumentRequirementError extends Error {
    constructor(missingSlots) {
        super('เอกสารบังคับยังไม่ครบ กรุณาแนบเอกสารที่ระบุก่อนส่งคำขอ');
        this.name = 'DocumentRequirementError';
        this.status = 422;
        this.statusCode = 422;
        this.code = 'APPLICATION_INCOMPLETE';
        this.missingSlots = missingSlots;
    }
}
```

**There is no `.details`.** The payload field is `missingSlots`, an array of `{ slotId, labelTH }` built by `describeSlot` (:85-88) via `missingFrom` (:144-154) — canonical id + Thai label, de-duplicated, evidence-satisfied slots removed. Registered in `apps/backend/shared/error-codes.js:1108-1115` (`httpStatus: 422`, `source: 'services/application-document-requirements.js:72'`).

The other throw (**:167-171**) is a **plain `Error`**, no status/code: `application-document-requirements: mode must be 'first-submit' or 'resubmit' (got <JSON>)`.

**Every caller in the repo** (grep over `--include=*.js --include=*.ts`, node_modules excluded):

| File | Call | Mode | Catch |
|---|---|---|---|
| `routes/api/applications/applications.js` | :1020 (route `POST /submit` at :845) | `isInitialSubmit ? MODE_FIRST_SUBMIT : MODE_RESUBMIT` (:1022); stamps at :1025 | `instanceof` :1028 → `respondMissingDocuments(res, docErr)` (:94-101) |
| `routes/api/applications/application-workflow-handlers.js` | :470 | `isFirstSubmit ? … : …` (:472); stamps :475 | `instanceof` :478 → inline `res.status(422).json({...})` |
| `routes/api/applications/application-bundles.js` | :476, once per linked app | `MODE_FIRST_SUBMIT` (:478); stamps :480 | `instanceof` :483 → inline 422 |
| `routes/api/applications/applications-car.js` | :274 | `MODE_RESUBMIT` | `instanceof` :276 → inline 422 |
| `routes/api/applications/revision-deadline.js` | :384 | `MODE_RESUBMIT` | `instanceof` :386 → inline 422 |

All five 422 bodies are byte-identical in shape:

```js
{ success: false, error: 'APPLICATION_INCOMPLETE', code: 'APPLICATION_INCOMPLETE',
  message: docErr.message, missingSlots: docErr.missingSlots }
```

Every catch is `if (docErr instanceof DocumentRequirementError) { … } throw docErr;` — **anything else the service throws escapes to the route's outer handler** (`applications.js:1268-1269` → `respondError`). See §6.

Test callers (mocks that pin the return shape — a rewire must keep `{ appliedRules }` resolvable): `__tests__/integration/bundle-terminal-integrity.test.js:58`, `__tests__/unit/applications-submit-capability-gate.test.js:83`, `.../a0-pr2-submit-hops-audit-emission.test.js:106`, `.../m1-submit-guard-doors.test.js:127`, `.../quotation-issuance-submit-doors-wiring.test.js:137-138`. Behaviour suites: `__tests__/unit/m2a-doc-requirements.test.js` (:122-354) and `__tests__/integration/m2a-submit-enforcement.test.js` (:104-168). Baseline run this session: `npx jest --testPathPattern "m2a-doc-requirements" --runInBand` → **2 suites, 44 tests, all pass**.

## 4. `SLOT_LABEL_TH_BY_CANONICAL_ID` (:51-59)

```js
const SLOT_LABEL_TH_BY_CANONICAL_ID = (() => {
    const map = new Map();
    Object.values(DOCUMENT_SLOTS).forEach((slot) => {
        if (slot?.slotId && slot?.name) { map.set(getCanonicalSlotId(slot.slotId), slot.name); }
    });
    return map;
})();
```

Catalog: `apps/backend/constants/document-slots.js` (`DOCUMENT_SLOTS` at :21, closes :509). Only `slot.name` is used — `description` and `sourceHint` (present on every v2 entry, e.g. `LAND_RIGHTS` :348-353) are **not** in this map, so Task 4's `slots[i].description/sourceHint` must read the catalog directly.

Unknown id → `describeSlot` (:87) falls back to `labelTH = canonical`, i.e. **the raw id is shown to the applicant as its own Thai label**. (Verified: `'totally_unknown'` → `{slotId:'totally_unknown', labelTH:'totally_unknown'}`.)

I rebuilt the map by running the exact code above against the real catalog + fold (script in scratchpad, not in the repo):

- **64 catalog entries collapse to 39 map keys.** 17 canonical ids receive 2-6 entries; **the last catalog entry wins** (plain `map.set` overwrite in `Object.values` order).
- Three of those overwrites are **wrong for a user-facing lens**: the deprecated aliases at `document-slots.js:320-322` sit *after* the real entries, so today
  - `form_gacp_application` → `"แบบฟอร์ม 09"` (not `"แบบคำขอรับรอง GACP"`)
  - `form_farm_summary` → `"แบบฟอร์ม 10"`
  - `form_self_assessment` → `"แบบฟอร์ม 11"`
- The other 14 collisions happen to land on the v2 label (LAND_DEED :118 loses to LAND_RIGHTS :348, etc.), which is the desired outcome — but by ordering, not by rule.
- Ids with **no label at all** include the land-family members that are deliberately unfolded: `CHANOTE` → `'chanote'`, `NS3` → `'ns3'`, `SPK` → `'spk'` all return the bare id as `labelTH`.

## 5. How REQUIRED is decided today (:173-218)

**Resubmit branch (:178-192)**: reads `formData.serverRequirementSnapshot`. If it is not a plain object or `stamp.slotIds` is not an array → `logger.warn('[M2a] resubmit without a requirement snapshot — grandfathered (application …)')`, `grandfathered = true`, `requiredSlotIds` stays `[]` (nothing enforced, **no DB read at all**). Otherwise `requiredSlotIds = stamp.slotIds` (raw strings, canonicalized later in `missingFrom`).

**First-submit branch (:193-207)** — the whole rule query:

```js
const holderType = await resolveHolderType(application, client);      // :195
const requestType = formData.renewalOf ? 'RENEWAL' : 'NEW';           // :199
const rules = await rulesAt({ at: new Date(), holderType, requestType }, client);  // :201
appliedRules = rules.filter((rule) => rule?.isRequired !== false);    // :205
requiredSlotIds = appliedRules.map((rule) => rule.slotId);            // :206
```

- **Dimensions passed: only `holderType` and `requestType`.** `plantCode`, `landTenure`, `areaType`, `certScope` are never passed. In `rulesAt` (`services/requirement-rule-service.js:166-196`) an omitted dimension becomes `dimensionClause(field, undefined)` → `{ [field]: null }` (:80-85) — i.e. **only rules whose column is NULL can match**. Consequence: every row of the กทล.1 seed set carries `plantCode: 'cannabis'` (`scripts/seed-cannabis-requirement-rules.js:199`), so **not one of those 23 rules can ever fire at the submit gate as it is wired today**. Same for the `landTenure/areaType/certScope` rows.
- `holderType` comes from `resolveHolderType` (:233-240): `client.entity.findUnique({ where: { id: application.entityId }, select: { type: true } })` → `entity?.type || null`; no `entityId` → `null` (documented fail-open, :226-231). Note the Task 4 plan wants `application.entity?.type || formData.applicantType` — a different source.
- `requestType` is derived **only** from `formData.renewalOf` (a genuinely server-owned key — `shared/form-data-ownership.js:82-86`). The gate can therefore produce `'NEW'` or `'RENEWAL'` and **never `'REPLACEMENT'`**, and never reads `formData.requestType`.
- **No rule row at all** → `requiredSlotIds.length === 0` → the `if` at :209 is skipped entirely: **no `applicationDocument.findMany`, no evidence collection, no error — the submit passes.** "No law" = "nothing required", silently.
- When there is at least one required slot (:209-218): `client.applicationDocument.findMany({ where: { applicationId: application.id }, select: { documentType: true } })` — **all rows of the application, superseded ones included** (`prisma/schema/application-document.prisma:71-80` defines `currentForSlot`/`supersededAt`; neither is filtered). Then `missingFrom(requiredSlotIds, collectServerDocumentEvidence(application, documentRows))` and throw if non-empty.

Live law, read SELECT-only from the DB `apps/backend/.env` points at: **exactly 2 rows**, both from migration `20260815200000_requirement_rules`:
`{holderType:'JURISTIC', requestType:null, plantCode:null, slotId:'company_reg', isRequired:true, maxDocumentAgeMonths:6, effectiveFrom:2026-08-15, effectiveTo:null}` and `{holderType:'COMMUNITY_ENTERPRISE', …, slotId:'community_cert', …}`. The cannabis seed has **not** been applied (its dry-run evidence at `evidence/appv2-task-3/dry-run-revalidate.txt` shows all 23 rows still `INSERT`).

## 6. What breaks on dimensions the rule table has never seen — plus two live blockers

**(a) A word outside the closed vocabulary → a 422 with the WRONG code, or a 500.** If Task 4 starts passing case dimensions, `rulesAt` runs `normalizeCaseDimension` (`requirement-rule-service.js:106-121`) *before* any query and throws `ruleError(...)` with `status/statusCode = 422`, `code = 'INVALID_RULE_DIMENSION'`, message `มิติกติกาไม่อยู่ในชุดค่าที่ระบบรู้จัก: <field>=<value> กรุณาแก้เป็นค่าใดค่าหนึ่งใน <allowed> …`. That is **not** a `DocumentRequirementError`, so all five doors `throw docErr`; `respondError` (`shared/api-response.js:283-300`) honours the 4xx and returns 422 with `code: 'INVALID_RULE_DIMENSION'` — a shape no frontend branches on and with no `missingSlots`. The closed sets are `RULE_DIMENSIONS` (`:55-59`): `landTenure ∈ OWNED|STATE_PERMITTED|RENTED`, `areaType ∈ OUTDOOR|INDOOR|GREENHOUSE|OTHER`, `certScope ∈ PLANTING|PROCESSING`. `null`/`undefined`/`''`/whitespace-only are safe (→ NULL wildcard, :92-98). `holderType`/`requestType`/`plantCode` are **not** validated — a bogus value there silently matches only NULL-dimension rules.
The wizard's existing vocabulary does not match: `routes/api/applications/validation.js:221-245` uses `landOwnership ∈ 'owned'|'leased'|'permitted_use'` — none of which is a legal `landTenure` value. Any mapping must land on the three words above or on `null`, never pass through raw.

**(b) LIVE BLOCKER — `rulesAt()` currently throws P2022 against this database.** Migration `apps/backend/prisma/migrations/20260901300000_requirement_rule_case_dims/migration.sql` (adds `landTenure`/`areaType`/`certScope`) is **not applied**: `information_schema` shows 14 columns on `requirement_rules` with none of the three, and the newest row in `_prisma_migrations` is `20260828100000_quotation_acceptance_snapshot_expand`. Verified by calling the real `rulesAt({at:new Date(), holderType:'JURISTIC', requestType:'NEW'})` read-only:

```
errcode: P2022 | meta: {"modelName":"RequirementRule","column":"requirement_rules.landTenure"}
```

`P2022` is not in `classifyPrismaError` (`shared/api-response.js:229-247` → `default: null`), so it becomes a **500** — meaning **every first submit against this DB returns 500 "Failed to submit application"** today, and Task 4's new lens will hit the same wall the moment it calls `rulesAt`. Applying that migration is a Tier C / operator action, not something the implementer can do; the unit suite is green because `requirementRule.findMany` is mocked (`__tests__/unit/m2a-doc-requirements.test.js:32-37`).

**(c) The second upload door writes evidence the gate cannot see.** `routes/api/applications/wizard.js:178-180` → `controllers/wizard-controller.js:19-116` writes `ApplicationDraft.formData.uploadedDocuments` (:84-93) and then `mergeApplicationAttachments` (`controllers/wizard-controller-helpers.js:82-133`), which writes **`Application.attachments`** — never `Application.formData.draftDocuments` and never an `application_documents` row. The only writers of `formData.draftDocuments` in the whole backend are `applications.js:1418` (upload) and `:1461` (delete). So a file uploaded through the wizard door is invisible to `collectServerDocumentEvidence` and 422s at submit while the wizard shows it green. (An operator-run `scripts/backfill-application-documents.js:32-60` can retro-convert `attachments` into rows; nothing does it automatically.) Also note `mergeApplicationAttachments` compares slots by **raw string** (:104-110), unlike everything else.

**(d) Smaller edges in the target file itself.** `client` is used unguarded at :210 and :235 — a caller passing a tx handle without `applicationDocument`/`entity` throws a `TypeError` that escapes as 500. `missingFrom` (:144-154) drops falsy canonical ids silently, so a rule row with `slotId: ''` is a rule that demands nothing. `assertRequiredDocumentsPresent` reads `application.id` at :211 only — a row without `id` yields a `findMany` on `applicationId: undefined`. And on the resubmit path the stamp is trusted verbatim: `stamp.slotIds` entries are canonicalized at compare time but never validated against the catalog.