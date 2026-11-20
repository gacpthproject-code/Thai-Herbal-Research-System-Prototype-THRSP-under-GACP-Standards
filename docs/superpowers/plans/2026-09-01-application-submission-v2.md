# Application Submission v2 (กทล.1-exact) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the application-submission system so the required set equals DTAM's กทล.1 exactly: one dated rule engine, one upload pipe, a 6-step wizard, one server-truth review page, and an officer per-slot checklist.

**Architecture:** `requirement_rules` (append-only, dated) gains three nullable dimension columns and becomes the single owner of "required"; a new `GET /applications/:id/requirements` door is the one lens every surface reads. Uploads stay on the existing draft-documents door with server-side alias folding so old uploads keep counting. The wizard is rebuilt as 6 steps with upload-in-context; review collapses to one server-truth page rendering a system-generated กทล.1; officers accept / request-more per slot with due dates (new additive table).

**Tech Stack:** Node/Express + Prisma (backend), Next.js App Router + zustand (web), Jest both sides, Playwright walks.

**Spec:** `docs/superpowers/specs/2026-09-01-application-submission-v2-design.md` (binding authority; its §1 carries the operator's 7 rulings). Facts: `reports/research/2026-09-01-dtam-application-baseline/facts.md`. Census verdicts: `.../mapping.md` + `.../census/*.md`. Approved boards: canvas "โครง Wizard กทล.1".

## Global Constraints

- Required set = กทล.1 ส่วนที่ ๓ exactly (spec §2.1 slot table is exhaustive); OPTIONAL slots never count toward completeness (`review-completeness.ts:14-15` rule is law).
- `requirement_rules` is APPEND-ONLY: new law = insert row(+close old); the only updatable columns are effectiveTo/closedBy/closedAt. Dimension vocabulary: `holderType` INDIVIDUAL|JURISTIC|COMMUNITY_ENTERPRISE · `requestType` NEW|RENEWAL|REPLACEMENT (never 'RENEW') · new `landTenure` OWNED|STATE_PERMITTED|RENTED · new `areaType` OUTDOOR|INDOOR|GREENHOUSE|OTHER — **one value per RULE ROW, a SET per FILING** (กทล.1 ส่วนที่ ๒ prints ลักษณะพื้นที่ as checkboxes, facts.md:22): the lens asks `rulesAt` ONE question carrying every ticked value (`areaType: string[]` → `IN` plus the NULL wildcard) and never collapses the ticks first — ticking Outdoor+Greenhouse owes A4′ AND A4 · new `certScope` PLANTING|PROCESSING · `plantCode` 'cannabis'. NULL = every value (existing engine semantics).
- Slot ids are stored canonical via `getCanonicalSlotId` (lower_snake). New slots (spec §2.1): `LAND_RIGHTS, LANDLORD_CONSENT, SITE_MAP_COORDS, BUILDING_PLAN_PHOTOS, FIELD_SURROUND_PHOTOS, PRODUCTION_UTIL_PLAN, SECURITY_RESIDUE_PLAN, SITE_PHOTOS, SOP_MANUAL, CONTROLLED_HERB_LICENSE, ID_HOUSE_REG, COMMUNITY_REG_MEMBERS, COMMUNITY_ASSIGNMENT, PRODUCER_SUPERVISION_LETTER, JURISTIC_REG_6M, JURISTIC_AUTHORITY, PREV_CERT_ORIGINAL, RENEWAL_PLAN, RENEWAL_UTIL_PLAN, OPERATION_SUMMARY_REPORT, POLICE_REPORT, DAMAGED_CERT` + optional `WATER_TEST, SOIL_TEST, ADDITIONAL_DOCS`.
- Money/quotation/checkout rails (F-G4-64) unchanged — any diff under `services/billing`, `services/checkout`, `finance` routes is out of scope and a reviewer blocker. T&T frozen.
- PDPA file posture: `/uploads` keeps `Content-Disposition: attachment` (`middleware/uploads-security-headers.js:46` untouched); every "view" is an in-page subresource viewer via `openDocumentPreview` (`src/lib/services/preview-document.ts`); `window.open(fileUrl)` is forbidden.
- Thai copy: คุณ register (ท่าน only legal), no em dash in Thai sentences, space before ๆ, Thai/Latin spacing, cause + next action, no raw enum, dates via `formatThaiDate`, spelling **อัปโหลด**. Tokens: leaf/primary/muted/card/destructive per `gacp-design-tokens` (buttons `bg-leaf-700` hover 800, disabled 300); officer accent `officer-700 #0F5F6B`; no emerald/zinc/slate; primitives from `src/components/ui/primitives/`; `role="alert"` on refusals.
- RED-first on every behavior change (paste failing output into the task report); born-green = declared pins. Backend jest from `apps/backend`: `npx jest __tests__/... --runInBand` (jest inherits apps/backend/.env — pin env predicates). Web jest from `apps/web-app`. No full suite per task; batch gate runs the family sweep.
- Ratchet counters may not rise (hardcode=33 todo=56 env-direct=122 dup-source=2); dead guards named by the spec are deleted when touched; new Thai literals live in catalogs/config, not components.
- DEMO_MODE bypasses must not survive on production doors (submit/prepare/review CTA).
- Applied migrations frozen; this plan adds exactly TWO new additive migrations (Task 1, Task 12) — both are the reason the batches containing them are Tier C (operator merge). Never run `prisma migrate reset/dev` against the shared demo DB; write migration SQL by hand in a new folder and apply at the batch gate with `prisma migrate deploy` (coordinator).
- Walk rules: two-state + resumable, `g4psql` SELECT-only, creds via run-g4.sh env, never print passwords, quarantine test-output.
- Reports per task to the dispatch's report path; status vocabulary DONE(probe)/PENDING/BLOCKED only.

## File Structure (locked decomposition)

```
apps/backend/
  prisma/schema/requirement-rule.prisma            (T1 +3 nullable dims)
  prisma/migrations/20260901300000_requirement_rule_case_dims/migration.sql   (T1)
  prisma/schema/application-document-review.prisma (T12 new)
  prisma/migrations/20260901310000_application_document_reviews/migration.sql (T12)
  services/requirement-rule-service.js             (T1 rulesAt gains 3 dims)
  constants/document-slots.js                      (T2 new slots + sourceHint; T15 dead-slot cleanup)
  scripts/seed-cannabis-requirement-rules.js       (T3 new)
  services/application-requirements-service.js     (T4 new — the one lens)
  routes/api/applications/requirements.js          (T4 new route file, mounted in applications.js)
  services/application-document-requirements.js    (T4 reads the same lens)
  routes/api/applications/wizard.js                (T4 delete the dead upload door)
  services/pdf/katorlor1-template-service.js       (T10 new)
  routes/api/applications/application-workflow-handlers.js (T10 pdf door repoint)
  services/application-document-review-service.js  (T12 new)
  routes/api/provider/document-reviews.js          (T12 new)
packages/validation/src/upload-rules.js            (T2 alias folds + slot table rows)
apps/web-app/src/app/health/applications/new/_steps/
  application-flow-config.ts                       (T5 6-step registry)
  steps/step1-request-type.tsx                     (T5 new)
  steps/step2-identity.tsx                         (T6 new)
  steps/step3-site-land.tsx                        (T7 new)
  steps/step4-variety-purpose.tsx                  (T8 new)
  steps/step5-plans-docs.tsx                       (T9 new)
  steps/step6-review.tsx                           (T11 new — the one review page)
  steps/requirement-slot-card.tsx                  (T6 new, shared upload-in-context card)
apps/web-app/src/components/feature/document-viewer-modal.tsx (T9 new)
apps/web-app/src/lib/services/application-requirements.ts     (T4-FE typed client)
apps/web-app/src/app/provider/reviewer/[id]/document-check/   (T13 new officer page)
apps/web-app/src/app/health/applications/[id]/revision/       (T14 slot-scoped fix surface)
walks: apps/web-app/e2e-g4/a01v2-wizard.spec.ts + a02v2-officer-review.spec.ts (T16)
DELETED: steps/submit-step.tsx, steps/documents-step*.tsx|ts, steps/quality-control-*.tsx,
  steps/consent-step.tsx, steps/general-step*.tsx, steps/plant-selection-*.ts(x),
  steps/farm-info-*.tsx|ts, steps/production-info-*.tsx|ts, steps/review-step*.ts(x),
  applications/preview/client-view.tsx (+page), /api/wizard draft-documents door (T11/T15)
```

Execution batches: **B1** = T1-T4 (backend, Tier C: migration) · **B2** = T5-T9 (wizard) · **B3** = T10-T11 (review) · **B4** = T12-T14 (officer, Tier C: migration) · **B5** = T15-T16 (cleanup + walks). Sequential; each batch ends with the family test sweep + /code-review + checkpoint commit.

---

### Task 1: Requirement-rule dimensions for the กทล.1 case matrix

**Files:**
- Modify: `apps/backend/prisma/schema/requirement-rule.prisma` (after `plantCode String?`)
- Create: `apps/backend/prisma/migrations/20260901300000_requirement_rule_case_dims/migration.sql`
- Modify: `apps/backend/services/requirement-rule-service.js:54-110` (dimensionClause callers, rulesAt, createRule whitelist)
- Test: `apps/backend/__tests__/unit/requirement-rules-case-dims.test.js` (new)

**Interfaces:**
- Consumes: existing `rulesAt({ at, holderType, requestType, plantCode }, client)` and `dimensionClause(field, value)` (NULL-dim = wildcard).
- Produces: `rulesAt({ at, holderType, requestType, plantCode, landTenure, areaType, certScope }, client)` — same return shape (array of RequirementRule rows); `createRule` accepts and persists the three new dims with the same normalize/whitelist treatment; vocabulary exported as `RULE_DIMENSIONS = { landTenure: ['OWNED','STATE_PERMITTED','RENTED'], areaType: ['OUTDOOR','INDOOR','GREENHOUSE','OTHER'], certScope: ['PLANTING','PROCESSING'] }`.

- [ ] **Step 1: Write the failing test** (`requirement-rules-case-dims.test.js`)

```js
'use strict';
jest.mock('../../services/prisma-database', () => ({ prisma: { requirementRule: { findMany: jest.fn(), create: jest.fn() } } }));
const { prisma } = require('../../services/prisma-database');
const { rulesAt, createRule, RULE_DIMENSIONS } = require('../../services/requirement-rule-service');

describe('requirement rules — กทล.1 case dimensions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rulesAt filters landTenure/areaType/certScope with NULL-as-wildcard', async () => {
    prisma.requirementRule.findMany.mockResolvedValue([]);
    await rulesAt({ at: new Date('2026-09-02'), landTenure: 'RENTED', areaType: 'INDOOR', certScope: 'PLANTING' });
    const where = prisma.requirementRule.findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual(expect.arrayContaining([
      { OR: [{ landTenure: null }, { landTenure: 'RENTED' }] },
      { OR: [{ areaType: null }, { areaType: 'INDOOR' }] },
      { OR: [{ certScope: null }, { certScope: 'PLANTING' }] },
    ]));
  });

  it('an unknown dimension value is refused, not silently widened', async () => {
    await expect(createRule({ slotId: 'landlord_consent', effectiveFrom: '2026-09-02', createdBy: 'op', landTenure: 'LEASED' }))
      .rejects.toMatchObject({ code: 'INVALID_RULE_DIMENSION' });
  });

  it('vocabulary is the closed set the spec names', () => {
    expect(RULE_DIMENSIONS.landTenure).toEqual(['OWNED', 'STATE_PERMITTED', 'RENTED']);
    expect(RULE_DIMENSIONS.areaType).toEqual(['OUTDOOR', 'INDOOR', 'GREENHOUSE', 'OTHER']);
    expect(RULE_DIMENSIONS.certScope).toEqual(['PLANTING', 'PROCESSING']);
  });
});
```

- [ ] **Step 2: Run it** — `cd apps/backend && npx jest __tests__/unit/requirement-rules-case-dims.test.js --runInBand` → FAIL (`RULE_DIMENSIONS` undefined / where.AND missing the new clauses). Paste output in the report.
- [ ] **Step 3: Schema + migration.** Append to the model after `plantCode String?` (comment style of the file):

```prisma
  // ---- กทล.1 case dimensions (2026-09-01 spec §2.1) — NULL = every value ----
  // Land tenure of the application's site: OWNED | STATE_PERMITTED | RENTED.
  landTenure String?
  // Area type of the site: OUTDOOR | INDOOR | GREENHOUSE | OTHER.
  areaType String?
  // Certification scope requested: PLANTING | PROCESSING.
  certScope String?
```

`migration.sql` (hand-written; additive only):

```sql
-- กทล.1 case dimensions on the append-only rule table (spec 2026-09-01 §2.1).
-- NULL keeps the existing wildcard semantics; no existing row changes meaning.
ALTER TABLE "requirement_rules" ADD COLUMN "landTenure" TEXT;
ALTER TABLE "requirement_rules" ADD COLUMN "areaType" TEXT;
ALTER TABLE "requirement_rules" ADD COLUMN "certScope" TEXT;
```

- [ ] **Step 4: Service.** In `requirement-rule-service.js`: add `const RULE_DIMENSIONS = {...}` (values above, frozen); in `rulesAt` destructure the three new dims and push `dimensionClause('landTenure', landTenure)` etc. beside the existing three; in `createRule`'s input handling, normalize each new dim through the existing `normalizeDimension` and refuse values outside `RULE_DIMENSIONS[field]` with `ruleError('มิติกติกาไม่อยู่ในชุดค่าที่ระบบรู้จัก: <field>=<value>', 'INVALID_RULE_DIMENSION', 422)`; persist them in the create data; export `RULE_DIMENSIONS`.
- [ ] **Step 5: Run to green** — same command → PASS; run the existing neighbours `npx jest __tests__/unit/requirement-rule --runInBand` (must stay green; `prisma generate` first so the client knows the columns: `npx prisma generate`).
- [ ] **Step 6: Commit** — `git add -A apps/backend/prisma apps/backend/services/requirement-rule-service.js apps/backend/__tests__/unit/requirement-rules-case-dims.test.js && git commit -m "feat(requirements): กทล.1 case dimensions on the dated rule table (additive)"`
  (Migration is NOT applied to the demo DB in this task — the coordinator applies at the B1 gate with `npx prisma migrate deploy` and pastes the output.)

### Task 2: Slot catalog v2 + alias folds — one paper, one slot

**Files:**
- Modify: `apps/backend/constants/document-slots.js` (append the v2 slots; do not delete old rows yet — T15 does)
- Modify: `packages/validation/src/upload-rules.js` (SLOT_ALIAS_GROUPS + slot table rows for the new ids)
- Test: `apps/backend/__tests__/unit/slot-catalog-v2.test.js` (new)

**Interfaces:**
- Consumes: `getCanonicalSlotId(id)` (validation-slot-utils re-export of upload-rules fold).
- Produces: every v2 slot listed in Global Constraints exists in `DOCUMENT_SLOTS` as `{ slotId, name, description, sourceHint }` (sourceHint = "หาได้ที่ไหน" copy — NEW FIELD, e.g. CONTROLLED_HERB_LICENSE: `'ยื่นแบบ ภท.10 หรือ ภท.11 กับนายทะเบียน สสจ. จังหวัดที่ตั้งสถานประกอบการ (กรุงเทพฯ ยื่นที่กรมการแพทย์แผนไทยฯ) แล้วนำใบอนุญาตที่ออกแล้วมาแนบ'`); alias folds map legacy ids onto v2 canon: `M1_PT11|LICENSE_PT11|license_bt11 → controlled_herb_license`, `CHANOTE|NS3|SPK|OTHER_LAND|LAND_TITLE|land_deed → land_rights`, `LAND_CONSENT → landlord_consent`, `SITE_MAP → site_map_coords`, `BUILDING_PLAN|INTERIOR_PHOTOS → building_plan_photos`, `EXTERIOR_PHOTOS → site_photos`, `PRODUCTION_PLAN → production_util_plan`, `SECURITY_PLAN → security_residue_plan`, `IND_ID_CARD|id-card|ID_CARD|idCardDoc|IND_HOUSE_REG|house-reg → id_house_reg`, `COM_SVC01|community-reg|COM_MEMBER_LIST → community_reg_members`, `COM_MEETING_DOC|community-meeting → community_assignment`, `COM_PRESIDENT_ID|president-id → id_house_reg`, `JUR_COMPANY_REG|company-reg → juristic_reg_6m`, `JUR_DIRECTOR_LIST|director-list|JUR_POA|power-attorney|director-id|JUR_DIRECTOR_ID → juristic_authority`.
- Note for the reviewer: `required`/`requiredFor` flags on catalog rows are DISPLAY-DEAD after T4 (the engine owns required); new rows carry no `required` field at all.

- [ ] **Step 1: Failing test**

```js
'use strict';
const { DOCUMENT_SLOTS } = require('../../constants/document-slots');
const { getCanonicalSlotId } = require('../../routes/api/applications/validation-slot-utils');

const V2 = ['LAND_RIGHTS','LANDLORD_CONSENT','SITE_MAP_COORDS','BUILDING_PLAN_PHOTOS','FIELD_SURROUND_PHOTOS',
  'PRODUCTION_UTIL_PLAN','SECURITY_RESIDUE_PLAN','SITE_PHOTOS','SOP_MANUAL','CONTROLLED_HERB_LICENSE',
  'ID_HOUSE_REG','COMMUNITY_REG_MEMBERS','COMMUNITY_ASSIGNMENT','PRODUCER_SUPERVISION_LETTER',
  'JURISTIC_REG_6M','JURISTIC_AUTHORITY','PREV_CERT_ORIGINAL','RENEWAL_PLAN','RENEWAL_UTIL_PLAN',
  'OPERATION_SUMMARY_REPORT','POLICE_REPORT','DAMAGED_CERT','WATER_TEST','SOIL_TEST','ADDITIONAL_DOCS'];

describe('slot catalog v2', () => {
  it.each(V2)('%s exists with Thai name and sourceHint', (key) => {
    const slot = DOCUMENT_SLOTS[key];
    expect(slot).toBeDefined();
    expect(slot.slotId).toBe(key.toLowerCase());
    expect(slot.name).toMatch(/[ก-๙]/);
    expect(slot.sourceHint).toMatch(/[ก-๙]/);
  });

  it.each([
    ['M1_PT11', 'controlled_herb_license'], ['LICENSE_PT11', 'controlled_herb_license'],
    ['CHANOTE', 'land_rights'], ['LAND_TITLE', 'land_rights'], ['LAND_CONSENT', 'landlord_consent'],
    ['SITE_MAP', 'site_map_coords'], ['BUILDING_PLAN', 'building_plan_photos'],
    ['EXTERIOR_PHOTOS', 'site_photos'], ['PRODUCTION_PLAN', 'production_util_plan'],
    ['SECURITY_PLAN', 'security_residue_plan'], ['id-card', 'id_house_reg'], ['IND_HOUSE_REG', 'id_house_reg'],
    ['community-reg', 'community_reg_members'], ['COM_MEETING_DOC', 'community_assignment'],
    ['company-reg', 'juristic_reg_6m'], ['power-attorney', 'juristic_authority'],
  ])('legacy %s folds to %s', (legacy, canon) => {
    expect(getCanonicalSlotId(legacy)).toBe(canon);
  });

  it('a v2 id folds to itself', () => {
    expect(getCanonicalSlotId('CONTROLLED_HERB_LICENSE')).toBe('controlled_herb_license');
  });
});
```

- [ ] **Step 2: Run** → FAIL (slots undefined). Paste.
- [ ] **Step 3: Implement.** Append a `// ===== v2 — กทล.1 canonical slots (spec 2026-09-01) =====` block to `DOCUMENT_SLOTS` with all 25 rows ({slotId, name, description, sourceHint} — Thai copy per thai-ui-copy; names verbatim from facts.md §2, e.g. LAND_RIGHTS name `'สำเนาเอกสารสิทธิ์ที่ดิน หรือหนังสืออนุญาตใช้ที่ดินของรัฐ'`). Extend `SLOT_ALIAS_GROUPS` in upload-rules.js with one group per Produces line (each group's first member = the canonical v2 id, matching how existing groups pick their canon), and add the v2 rows to the slot acceptance table (same mime/size policy as the row each replaces; ADDITIONAL_DOCS mirrors the old ADDITIONAL_DOCS row).
- [ ] **Step 4: Run to green** + neighbours: `npx jest __tests__/unit/slot --runInBand` and (from repo root) `cd packages/validation && npx jest 2>/dev/null || npm test` if the package has its own suite; also `cd apps/backend && npx jest __tests__/unit/error-codes-catalog.test.js --runInBand` (must stay green).
- [ ] **Step 5: Commit** — `feat(slots): กทล.1 canonical slot set + legacy alias folds (old uploads keep counting)`

### Task 3: Cannabis rule-set seed (dated data, dry-run first)

**Files:**
- Create: `apps/backend/scripts/seed-cannabis-requirement-rules.js`
- Test: `apps/backend/__tests__/unit/cannabis-rule-rows.test.js` (new — tests the pure row builder)

**Interfaces:**
- Produces: `buildCannabisRuleRows({ effectiveFrom })` exported from the script — returns the exact row set below; CLI runs dry by default (prints table, writes nothing), `--apply` inserts via `createRule` with `createdBy:'seed-cannabis-v1'`, `reason:'spec 2026-09-01 §2.1 (กทล.1 ส่วนที่ ๓)'`, idempotent: skips a row when an OPEN rule with identical (slotId + 4 dims) already exists.
- The row set (plantCode `'cannabis'` on every row; requestType NEW unless noted):

```
land_rights · site_map_coords · production_util_plan · security_residue_plan · site_photos · sop_manual   (no other dims)
landlord_consent            landTenure=RENTED
building_plan_photos        areaType=INDOOR  + a second row areaType=GREENHOUSE
field_surround_photos       areaType=OUTDOOR
                            (rows stay single-valued and this set is correct as seeded; a filing that
                             ticks Outdoor AND Indoor/Greenhouse fires BOTH — the fan-out over ticks
                             belongs to the ASK, not to the rows, so no multi-value rule row is ever
                             written: that would break the append-only law table)
controlled_herb_license     certScope=PROCESSING   (the export-purpose condition is app-side in T4 —
                            'purpose' is not a rule dimension; the door adds it per spec §2.1)
id_house_reg                (no holder dim — every type)
community_reg_members       holderType=COMMUNITY_ENTERPRISE
community_assignment        holderType=COMMUNITY_ENTERPRISE
producer_supervision_letter holderType=INDIVIDUAL
juristic_reg_6m             holderType=JURISTIC
juristic_authority          holderType=JURISTIC
prev_cert_original · renewal_plan · renewal_util_plan · operation_summary_report   requestType=RENEWAL
police_report · damaged_cert    requestType=REPLACEMENT  (either-of pair is resolved app-side in T4)
```

- [ ] **Step 1: Failing test**

```js
'use strict';
const { buildCannabisRuleRows } = require('../../scripts/seed-cannabis-requirement-rules');

describe('cannabis rule rows v1', () => {
  const rows = buildCannabisRuleRows({ effectiveFrom: '2026-09-02T00:00:00Z' });
  it('has exactly 23 rows, all cannabis, all dated', () => {
    expect(rows).toHaveLength(23);
    rows.forEach((r) => { expect(r.plantCode).toBe('cannabis'); expect(r.effectiveFrom).toBe('2026-09-02T00:00:00Z'); });
  });
  it('the six every-case slots carry no case dims', () => {
    const every = rows.filter((r) => !r.holderType && !r.landTenure && !r.areaType && !r.certScope && r.requestType === 'NEW');
    expect(every.map((r) => r.slotId).sort()).toEqual(
      ['id_house_reg', 'land_rights', 'production_util_plan', 'security_residue_plan', 'site_map_coords', 'site_photos', 'sop_manual'].sort());
  });
  it('conditions match the law', () => {
    expect(rows.find((r) => r.slotId === 'landlord_consent').landTenure).toBe('RENTED');
    expect(rows.filter((r) => r.slotId === 'building_plan_photos').map((r) => r.areaType).sort()).toEqual(['GREENHOUSE', 'INDOOR']);
    expect(rows.find((r) => r.slotId === 'field_surround_photos').areaType).toBe('OUTDOOR');
    expect(rows.find((r) => r.slotId === 'producer_supervision_letter').holderType).toBe('INDIVIDUAL');
    expect(rows.filter((r) => r.requestType === 'RENEWAL')).toHaveLength(4);
    expect(rows.filter((r) => r.requestType === 'REPLACEMENT')).toHaveLength(2);
  });
});
```

(Row arithmetic the implementer can check: 7 every-case + 1 rented + 2 building-plan + 1 outdoor + 1 processing-licence + 2 community + 1 individual + 2 juristic + 4 renewal + 2 replacement = **23**.)
- [ ] **Step 2: Run** → FAIL (module missing). Paste.
- [ ] **Step 3: Implement** the script: `buildCannabisRuleRows` pure; `main()` parses `--apply`/`--effective-from=`; dry-run prints a table (slotId + dims) and `DRY RUN — no rows written`; apply loop calls `createRule` per row inside a try that logs skip on existing-open-duplicate (query `rulesAt` for the row's own dims at effectiveFrom and match identical dim tuple). Refuse to run when `NODE_ENV === 'production'` without `--i-know`.
- [ ] **Step 4: Green** + run the script dry against the demo DB from `apps/backend`: `node scripts/seed-cannabis-requirement-rules.js` (prints 23 rows, writes nothing) — paste the table in the report. Do NOT `--apply` in this task; the coordinator applies at the B1 gate.
- [ ] **Step 5: Commit** — `feat(requirements): cannabis กทล.1 rule set v1 as dated data (dry-run seed)`

### Task 4: The one lens — `GET /applications/:id/requirements` + validators read it; second upload door dies

**Files:**
- Create: `apps/backend/services/application-requirements-service.js`
- Create: `apps/backend/routes/api/applications/requirements.js` (mount in `routes/api/applications/applications.js` beside the draft-documents routes)
- Modify: `apps/backend/services/application-document-requirements.js` (derive dims + rule filtering through the new service; keep its 422 shape)
- Delete: the draft-documents door in `apps/backend/routes/api/applications/wizard.js` (and its mount — read wizard.js:60-120 first; if other live routes share the file, delete only the upload route)
- Create: `apps/web-app/src/lib/services/application-requirements.ts` (typed client)
- Test: `apps/backend/__tests__/unit/application-requirements-service.test.js`, `apps/backend/__tests__/integration/requirements-door.test.js`

**Interfaces:**
- Produces (service): `resolveApplicationRequirements(application, documentRows, { at } = {})` → `{ dims, slots, missingRequired, complete }` where `dims = { holderType, requestType, plantCode:'cannabis', landTenure, areaTypes: string[], areaTypeOther: string|null, certScope, purposes }` (`areaTypes` is the ticked set of ลักษณะพื้นที่ — always an array, length 0 when the filing has not said; never a single collapsed value);
  `slots[i] = { slotId, labelTH, description, sourceHint, required, requiredReason, satisfied, fileUrl, fileName, uploadedAt }`;
  `requiredReason ∈ 'ALWAYS'|'RENTED'|'INDOOR'|'GREENHOUSE'|'OUTDOOR'|'PROCESSING'|'PURPOSE'|'HOLDER_TYPE'|'RENEWAL'|'REPLACEMENT'`; OPTIONAL slots appear with `required:false`.
  Dim derivation from the row: holderType = `application.entity?.type || formData.applicantType`; requestType = `formData.requestType` (NEW/RENEWAL/REPLACEMENT; legacy `serviceType:'RENEWAL'` maps to RENEWAL, anything else NEW); landTenure from `formData.farmData.landOwnership` mapping `{'OWNED','เจ้าของ':'OWNED','STATE':'STATE_PERMITTED','RENT','เช่า':'RENTED'}` (unknown → null = wildcard, never a guess); areaTypes from `formData.farmData.areaTypes` (the step-3 checkbox set — a NEW key: `cultivationMethods` is the MONEY declaration that `modules/billing/internal/fee-service.js` bills from, so ลักษณะพื้นที่ must never be implemented by repurposing it) mapping each tick `outdoor→OUTDOOR, indoor|indoor_controlled→INDOOR, greenhouse→GREENHOUSE, other→OTHER` and dropping words outside the vocabulary; when that key is absent (legacy filings) fall back to READING — never writing — `formData.cultivationMethods` together with `formData.plots[].solarSystem`, then the single legacy `locationType || farmData.areaType || application.areaType`; an empty set means one wildcard ask (`areaType: []`), never a guessed value. When two ticks demand the same slot the reason word follows the vocabulary order OUTDOOR, INDOOR, GREENHOUSE, OTHER so the rendered badge is deterministic; certScope = `formData.certScope || 'PLANTING'`; purposes = `formData.certificationPurposes || []`.
  App-side condition on top of rules (spec §2.1): for a controlled herb each selected purpose adds its own issued-licence slot — RESEARCH → `licence_pt09`, EXPORT → `licence_pt10`, PROCESSING → `licence_pt11` — `required:true, requiredReason:'PURPOSE'` (operator ruling 2026-10-05; shared/certification-purposes.js); REPLACEMENT's `police_report`/`damaged_cert` pair → both returned `required:false` with `requiredReason:'REPLACEMENT'` plus top-level `missingRequired` containing the virtual entry `'police_report|damaged_cert'` unless at least one is satisfied.
  Satisfaction reuses `collectServerDocumentEvidence(application, documentRows)` — canonical fold means legacy uploads satisfy v2 slots.
- Produces (route): `GET /api/applications/:id/requirements` (authenticateHealth + owner scope, same lookup pattern as the `/:id/pdf` door) → `{ success:true, data: resolveApplicationRequirements(...) }`.
- Produces (validator): `assertRequiredDocumentsPresent` keeps signature and 422 `DocumentRequirementError` shape but computes `missingSlots` from the SAME service (one lens — the review page, the door and the submit gate can no longer disagree).
- Produces (FE client): `fetchApplicationRequirements(appId): Promise<RequirementsPayload>` with the TS types mirroring the service shape.

- [ ] **Step 1: Failing service tests** (mock prisma + rulesAt with the T3 row set; fixtures: community+rented+indoor app with legacy `CHANOTE` upload) asserting: (a) 11 required slots for that case and `landlord_consent.required===true` with reason RENTED; (b) legacy CHANOTE row satisfies `land_rights`; (c) EXPORT purpose forces the licence; (d) individual case requires `producer_supervision_letter`; (e) `complete===false` names exactly the unsatisfied required slots; (f) OPTIONAL water_test present with required:false and never in missingRequired.

```js
// __tests__/unit/application-requirements-service.test.js — core case
const payload = await resolveApplicationRequirements(app, [{ documentType: 'CHANOTE' }]);
expect(payload.slots.find((s) => s.slotId === 'land_rights')).toMatchObject({ required: true, satisfied: true });
expect(payload.slots.find((s) => s.slotId === 'landlord_consent')).toMatchObject({ required: true, requiredReason: 'RENTED', satisfied: false });
expect(payload.missingRequired).toContain('landlord_consent');
expect(payload.slots.find((s) => s.slotId === 'water_test')).toMatchObject({ required: false });
```

- [ ] **Step 2: Run** → FAIL. Paste. **Step 3:** implement service + route + client; rewire `application-document-requirements.js`; delete the wizard upload door (grep first: `git grep -n "wizard/draft-documents"` — the only caller may be tests; update them). **Step 4:** green: the two new suites + neighbours `npx jest --testPathPattern "application-document-requirements|draft-document|upload" --runInBand`. **Step 5:** Commit — `feat(requirements): one lens for required documents; wizard upload door retired`.

### Task 4b: The lens reads every ลักษณะพื้นที่ tick, and refuses a filing no law can judge (corrects merged T4)

**Why a separate task:** T1-T4 shipped and merged as B1 (`e4da61a5`). Two defects in that
merged code were found by /code-review and by reading the form again, and both are the kind
that ship silently — a filing reports ครบ while a paper the ministry requires was never asked
for. They are corrected before any wizard step is built on the old shape.

**Files:**
- Modify: `apps/backend/services/requirement-rule-service.js` — `rulesAt` accepts a SET on any
  case dimension (`IN` plus the NULL wildcard, one query so the stamped snapshot stays a
  single ordered list); new read door `plantCodesWithRulesAt` answers which plants the
  register actually holds law for. Rule ROWS stay single-valued; `createRule` is untouched.
- Modify: `apps/backend/services/application-requirements-service.js` — `mostControlledAreaType`
  is deleted and replaced by `tickedAreaTypes`; `dims.areaType` becomes `dims.areaTypes: string[]`
  plus `dims.areaTypeOther`; a filing whose plant is unnamed or has no filed law returns
  `blockingIssues` and can never be `complete`.
- Modify: `apps/backend/services/application-document-requirements.js` — new
  `ApplicationNotJudgeableError` (422 `APPLICATION_NOT_JUDGEABLE`), thrown BEFORE the
  missing-document list, because "attach these nine papers" is wrong advice for a filing whose
  plant the ministry has published no list for.
- Modify: `apps/backend/validation/canonical-application-validator.js` — `plant_id` is a closed
  vocabulary (the keys of `config/plant-species-slugs.js`), not any non-empty string.
- Modify: `apps/backend/shared/error-codes.js` · `apps/web-app/src/lib/services/application-requirements.ts`.

**RED-first evidence (2026-09-05):** `กลางแจ้ง + โรงเรือน` lost `field_surround_photos` (A4′) —
measured against the 23 seeded rows, 9 slots instead of 10, `complete:true` with the paper never
asked for. An INDIVIDUAL filing naming a plant with no filed law was asked for 0 slots instead of
9, because the only plant-agnostic rows are `company_reg` and `community_cert`.

**Consequence to state plainly:** the union can only ADD required slots, so nothing that passed
before starts failing — resubmits are judged by their frozen stamp, untouched. But the next FIRST
submit of an open multi-tick draft gains a slot, and a filing whose plant has no rules is now
refused where it used to pass. Both are the corrections, not side effects.

---
### Task 5: Wizard v2 registry + step 1 (ประเภทคำขอและผู้ยื่น)

**Files:**
- Modify: `apps/web-app/src/app/health/applications/new/_steps/application-flow-config.ts` (replace the 9-step list)
- Modify: `apps/web-app/src/app/health/applications/_components/application-step-page.tsx:50-61` (COMPONENT_MAP)
- Create: `apps/web-app/src/app/health/applications/new/_steps/steps/step1-request-type.tsx`
- Test: `apps/web-app/src/app/health/applications/new/_steps/steps/__tests__/step1-request-type.test.tsx`, update `hooks/__tests__/wizard-step-access.test.ts` expectations

**Interfaces:**
- Produces (flow config): 6 entries, keys `request-type | identity | site-land | variety-purpose | plans-docs | review` (+ existing `success` slot kept) with `stepNumber` 1..6; `COMPONENT_MAP = { 'request-type': Step1RequestType, identity: Step2Identity, 'site-land': Step3SiteLand, 'variety-purpose': Step4VarietyPurpose, 'plans-docs': Step5PlansDocs, review: Step6Review, success: StepSuccess }` (Step2-6 land in T6-T11; until each lands, map the key to the existing placeholder pattern the file uses for a missing step — the step-not-found card — so the branch compiles at every task boundary).
- Produces (store contract): step 1 writes `formData.requestType ∈ NEW|RENEWAL|REPLACEMENT`, `formData.certScope ∈ PLANTING|PROCESSING` (asked only when requestType=NEW), `formData.applicantType ∈ COMMUNITY_ENTERPRISE|INDIVIDUAL|JURISTIC`, and for RENEWAL/REPLACEMENT `formData.previousCertificateNumber` (required text). Legacy DRAFT mapping on load: `serviceType:'RENEWAL'→requestType:'RENEWAL'`, absent→NEW; applicantType from the legacy general-step value.
- Old-step redirects: `/step/7 | /step/8 | /step/9` → `/step/6`; `/step/4|5` of old numbering resolve via the registry (no dead routes; wizard-step-access gating updates to 6).
- UI per the approved Main board: three request-type cards, applicant-type selector, RENEWAL/REPLACEMENT branch note "ข้ามขั้น 2-5 ไปชุดเอกสารเฉพาะกรณี" — skip logic: for RENEWAL/REPLACEMENT the stepper shows 1 → 5(เอกสารเฉพาะกรณี) → 6.

- [ ] **Step 1: failing tests** — render Step1: picking วิสาหกิจ+ต่ออายุ requires เลขใบรับรองเดิม before `canProceed`; store receives `{requestType:'RENEWAL', applicantType:'COMMUNITY_ENTERPRISE', previousCertificateNumber:'GACP-TH-2569-XXXXXX'}`; NEW+แปรรูป writes `certScope:'PROCESSING'`; registry test: flow config has exactly the 6 keys above in order.
- [ ] **Step 2:** run → FAIL, paste. **Step 3:** implement (cards with primitives Button/Badge; no raw enum shown — labels ไทยเต็ม). **Step 4:** green + `npx tsc --noEmit -p tsconfig.json` clean on src/. **Step 5:** commit `feat(wizard-v2): 6-step registry + step 1 request type`.

### Task 6: Shared slot card + step 2 (ตัวตนผู้ยื่น)

**Files:**
- Create: `steps/requirement-slot-card.tsx` (shared upload-in-context card)
- Create: `steps/step2-identity.tsx`
- Test: `steps/__tests__/requirement-slot-card.test.tsx`, `steps/__tests__/step2-identity.test.tsx`

**Interfaces:**
- Consumes: `fetchApplicationRequirements(appId)` (T4 client), `uploadDraftDocument` + `openDocumentPreview` (existing libs).
- Produces: `<RequirementSlotCard slot={RequirementSlot} appId onChanged={()=>void}>` — renders name/description/sourceHint, states ยังไม่ได้แนบ (amber) / อัปโหลดแล้ว (leaf soft, filename + "เปิดดูในหน้า" via openDocumentPreview + "แทนที่ไฟล์"), required star only when `slot.required`, optional badge "ไม่บังคับ ช่วยให้วันตรวจเร็วขึ้น" otherwise; upload posts to the draft-documents door with `slotId = slot.slotId`; a11y: the refusal/pending strip is `role="status"`, upload errors `role="alert"`.
- Step 2 renders: identity form fields per applicantType (exact field lists = กทล.1 ส่วนที่ ๑ per facts.md §1 — วิสาหกิจ: ชื่อวิสาหกิจ, ชื่อประธาน, เลขบัตรประธาน, สัญชาติ, รหัส สวช.01, เลขรหัสประจำบ้าน, ที่อยู่, โทรมือถือ, อีเมล(ไม่บังคับ); บุคคล: ชื่อ-สกุล, เลขบัตร, ที่อยู่, โทร, อีเมล+Line ID ไม่บังคับ; นิติบุคคล: ชื่อนิติบุคคล, ผู้มีอำนาจลงนาม, เลขทะเบียน/ผู้เสียภาษี, ที่อยู่, โทร, อีเมลไม่บังคับ) + the qualification RequirementSlotCards filtered from the requirements payload: `['id_house_reg','community_reg_members','community_assignment','producer_supervision_letter','juristic_reg_6m','juristic_authority']` ∩ payload (the engine already scopes by holderType — the step shows what the payload returns for those ids only).

- [ ] **Step 1: failing tests** — slot card: uploaded state shows filename + เปิดดูในหน้า calls `openDocumentPreview` (mock) and NEVER `window.open` (assert spy not called); optional slot shows the ไม่บังคับ badge and no star. Step 2: INDIVIDUAL case renders หนังสือกำกับโดยผู้รับอนุญาตผลิตยา card (the new legal slot) and NOT the juristic cards; วิสาหกิจ case renders สัญชาติ field.
- [ ] **Step 2-5:** RED → implement → green (+tsc, eslint touched files) → commit `feat(wizard-v2): step 2 identity + upload-in-context slot card`.

### Task 7: Step 3 (สถานที่และที่ดิน + เอกสารตามเงื่อนไข)

**Files:** Create `steps/step3-site-land.tsx`; Test `steps/__tests__/step3-site-land.test.tsx`
**Interfaces:** Consumes T4 client + T6 card. Store writes: `farmData.siteName, siteAddress, sitePhone, landDocumentDetail {type,number,volume,page,issuedBy}, landOwnership ∈ OWNED|STATE_PERMITTED|RENTED (+landlordName เมื่อ RENTED), areaTypes ⊆ {OUTDOOR, INDOOR, GREENHOUSE, OTHER} — checkboxes per กทล.1 ส่วนที่ ๒, more than one allowed, at least one required to proceed, no default — plus `areaTypeOther` free text (the form's ☐ อื่น ๆ ระบุ; required only when OTHER is ticked, cleared when it is unticked). Written to `formData.farmData.areaTypes` / `.areaTypeOther`, NOT to `cultivationMethods`, areaSqm:number, coordinates 'lat, lng', plantsPerCycle:number, cyclesPerYear:number` — exactly the กทล.1 ส่วนที่ ๒ ข้อ ๑-๒ fields, nothing else (no ระบบน้ำ, no ผลผลิตคาดการณ์). Changing landOwnership, or ticking/unticking ANY ลักษณะพื้นที่ box, re-fetches requirements and the conditional cards change accordingly (a second tick ADDS a card, it never swaps one for another) (per the approved Step3 board incl. the explainer strip "ถ้าคุณเปลี่ยนเป็น กลางแจ้ง ...").
- [ ] Failing tests: RENTED shows landlordName field + landlord_consent card appears from a payload fixture; switching fixture to OWNED hides it; INDOOR fixture shows building_plan_photos card with badge "เพราะโรงเรือนระบบปิด"; a fixture with BOTH กลางแจ้ง and โรงเรือนทั่วไป ticked shows building_plan_photos AND field_surround_photos at the same time, and unticking กลางแจ้ง removes only field_surround_photos; ticking อื่น ๆ with an empty ระบุ box blocks canProceed with a `role="alert"` message naming the field; unticking every box blocks canProceed; area unit is ตารางเมตร only. RED → implement → green → commit `feat(wizard-v2): step 3 site and land with conditional documents`.

### Task 8: Step 4 (พันธุ์และวัตถุประสงค์)

**Files:** Create `steps/step4-variety-purpose.tsx`; Test `steps/__tests__/step4-variety-purpose.test.tsx`
**Interfaces:** Store writes `certificationPurposes ⊆ ['RESEARCH','EXPORT','PROCESSING']` (checkboxes labelled with the ภ.ท. code, any combination allowed, **no default**, at least one required to proceed), seed/plant-part rows per กทล.1 ข้อ ๓: `varieties:[{kind:'SEED'|'OTHER_PART', name, origin:'DOMESTIC'|'IMPORTED', originCountry?, source, quantity, unit}]` (เกิน 2 แถว → free-text `varietiesNote`), and for certScope=PROCESSING a processing block `{plantPart, strain, source, quantity, unit}`. A purpose selected → inline notice (bg-muted) naming the issued licence(s) that step 5 will ask for.
- [ ] Failing tests: no purpose → cannot proceed and error names the field; a selected purpose raises the licence notice; payload sent to autosave contains no `MEDICAL`/`COMMERCIAL` values anywhere. RED → implement → green → commit `feat(wizard-v2): step 4 variety and purpose — two lawful objectives only`.

### Task 9: Step 5 (แผนงาน เอกสาร และใบอนุญาต) + in-page viewer modal

**Files:** Create `steps/step5-plans-docs.tsx`, `src/components/feature/document-viewer-modal.tsx`; Test `steps/__tests__/step5-plans-docs.test.tsx`, `src/components/feature/__tests__/document-viewer-modal.test.tsx`
**Interfaces:**
- `<DocumentViewerModal file={{url,name,mime}} onClose>` — Dialog primitive; image → `<img>` from objectURL, pdf → `<iframe>` objectURL (subresource loads are exempt from the attachment header per `uploads-security-headers.js:44-46` note); no download triggered on open; ปุ่มรอง "ดาวน์โหลด" explicit. `openDocumentPreview` is refactored to return the blob/objectURL for the modal instead of window.open-ing a tab (keep a `target:'tab'` fallback export for the two legacy call sites until T15 removes them).
- Step 5 renders RequirementSlotCards for `production_util_plan, security_residue_plan, sop_manual` (+`controlled_herb_license` when payload marks it required, with its PROCESSING/PLANTING scope reason line, and the `licence_pt09/10/11` cards a selected purpose requires) + the RENEWAL/REPLACEMENT sets when payload returns them + the optional group under a collapsed "เอกสารไม่บังคับ" section.
- [ ] Failing tests: modal renders `<img>` for image mime and never calls `anchor.click` on open; step 5 with an EXPORT-purpose payload shows the `licence_pt10` card with its sourceHint from the catalog; optional section collapsed by default and its slots show ไม่บังคับ. RED → implement → green → commit `feat(wizard-v2): step 5 plans, SOP, licence + in-page document viewer`.

### Task 10: กทล.1 generator (HTML + PDF)

**Files:**
- Create: `apps/backend/services/pdf/katorlor1-template-service.js`
- Modify: `apps/backend/routes/api/applications/application-workflow-handlers.js:510-540` (PDF door uses the new template)
- Create route: `GET /api/applications/:id/katorlor1` (same auth as `/pdf`) returning `{ success:true, data:{ html } }` — mounted beside it
- Modify: `apps/web-app/src/app/health/applications/[id]/preview/client-view.tsx` (render the generated HTML in place of ApplicationDocumentView; date = `submittedAt || 'ยังไม่ได้ยื่น'` via formatThaiDate; status through the Thai workflow label map)
- Test: `apps/backend/__tests__/unit/katorlor1-template.test.js`

**Interfaces:**
- Produces: `renderKatorlor1Html(application, requirementsPayload)` → HTML string (structure = the approved Katorlor1Doc board: form-code box แบบกัญชา กทล ๑, request-type checkboxes from requestType/certScope, ส่วนที่ ๑ per holderType, ส่วนที่ ๒ site/land/variety with EVERY ticked ลักษณะพื้นที่ box marked (a filing may carry several) and the อื่น ๆ ระบุ free text printed beside its box, ส่วนที่ ๓ checklist rows from `requirementsPayload.slots` with satisfied marks, ส่วนที่ ๔ declarations block + `declarationsAcceptedAt` stamp when present); `renderKatorlor1Pdf(application, requirementsPayload)` → Buffer via the same engine invoice-template-service uses (read that file for the pdf pipeline and reuse it).
- [ ] Failing tests: HTML contains the four ส่วน headers, the community fixture renders สวช.01 and NOT juristic rows, a fixture ticking กลางแจ้ง + โรงเรือนทั่วไป renders TWO marked ลักษณะพื้นที่ boxes and a fixture ticking อื่น ๆ renders its ระบุ text next to the box, unsatisfied required slot renders an unchecked box + "ยังไม่ได้แนบ", satisfied renders ✓ mark; no `undefined`/`null` text anywhere (regex assert). RED → implement → green (+ existing pdf suite `npx jest --testPathPattern "pdf|template" --runInBand` stays green) → commit `feat(katorlor1): the system assembles the official form — HTML and PDF from one renderer`.

### Task 11: Step 6 — the one review page (and the old surfaces die) — **DONE 2026-09-05**

**Files:**
- Create: `steps/step6-review.tsx`
- Modify: `apps/backend/routes/api/preview/preview.js:69-...` — the preview payload gains `requirements` (the T4 service output) and `katorlor1Html`; submit door (`POST /applications/submit` handler) stamps `formData.declarationsAcceptedAt = now` server-side when the payload carries `declarationsAccepted:true` and refuses `DECLARATIONS_REQUIRED` (422, catalogued) otherwise; remove the DEMO_MODE completeness bypass on this door.
- Delete: `steps/submit-step.tsx`, `steps/review-step.tsx`, `steps/review-step-helpers.ts`, `steps/review-completeness.ts` (its two pure functions move into the T4 FE client as `missingRequiredDocumentIds` re-export to keep the review tests' vocabulary), `apps/web-app/src/app/health/applications/preview/` (page + client-view; route becomes `redirect('/health/applications/new/step/6')` shim page.tsx)
- Modify: `shared/error-codes.js` (+`DECLARATIONS_REQUIRED` row 422 Thai copy "กรุณายืนยันคำรับรองทั้ง 5 ข้อและการยินยอมเปิดเผยข้อมูลก่อนยื่นคำขอ")
- Test: `steps/__tests__/step6-review.test.tsx`, `apps/backend/__tests__/integration/submit-requires-declarations.test.js`

**Interfaces:**
- Consumes: preview payload (server truth), T10 HTML, T4 requirements, the UNCHANGED F-G4-64 payment rail (accept quotation → consent → checkout redirect — copy the exact CTA wiring from the current `preview/client-view.tsx:153-245` before deleting it; the wiring moves, the behavior must not).
- Produces: the approved Step6Review board: red missing-card with per-item "ไปแก้ที่ขั้น N" (slot→step map: identity slots→2, land slots→3, plan slots→5, field gaps→their step), inline กทล.1 render + "เปิดดูทั้งฉบับในหน้า" (DocumentViewerModal with the HTML in an iframe srcdoc), the 5+1 declaration checkboxes — the five are กทล.1 ส่วนที่ ๔ (๑)-(๕) verbatim from facts.md:28, and (๓) "ไม่เปลี่ยนพื้นที่/เมล็ดพันธุ์/ส่วนที่ใช้โดยไม่ยื่นคำขอใหม่" is the one with teeth: showing it is only honest once B6 below closes the two-request bypass that lets a certified holder change ลักษณะพื้นที่ with no new filing — ship the display and B6 together, never the display alone (each its own row, server-stamped on submit), fee summary from the preview payload's real breakdown, CTA state machine identical to today's (submit / resubmit / CAR / paid states).
- [ ] Failing tests: FE — incomplete payload renders the red card and a disabled CTA (`bg-leaf-300`), complete payload + all boxes ticked enables it; the page performs ZERO reads of the wizard zustand store (assert component renders from props/fetch only — no `useApplicationFlowStore` import). BE — submit without `declarationsAccepted` → 422 DECLARATIONS_REQUIRED; with it → `formData.declarationsAcceptedAt` stamped (mock now). RED → implement → green (+ `npx jest src/app/health/applications --runInBand` family + error-codes-catalog suite) → commit `feat(wizard-v2): one server-truth review page; browser-truth review surfaces removed`.

### Task 12: Officer per-slot review — table + doors (Tier C batch B4)

**Files:**
- Create: `apps/backend/prisma/schema/application-document-review.prisma` + `prisma/migrations/20260901310000_application_document_reviews/migration.sql`
- Create: `apps/backend/services/application-document-review-service.js`
- Create: `apps/backend/routes/api/provider/document-reviews.js` (mount beside existing provider reviewer routes — find the mount point via `git grep -n "provider/reviewer" apps/backend/routes`)
- Test: `apps/backend/__tests__/unit/document-review-service.test.js`, `__tests__/integration/document-review-doors.test.js`

**Interfaces:**
- Schema:

```prisma
model ApplicationDocumentReview {
  id            String   @id @default(uuid())
  applicationId String
  slotId        String   // canonical
  verdict       String   // ACCEPTED | MORE_REQUESTED
  reason        String?  // Thai, required when MORE_REQUESTED
  dueDate       DateTime? // working-day, required when MORE_REQUESTED
  reviewerId    String
  round         Int      @default(1) // bumps when the applicant resubmits
  createdAt     DateTime @default(now())
  @@unique([applicationId, slotId, round])
  @@index([applicationId])
  @@map("application_document_reviews")
}
```

  migration.sql = the matching CREATE TABLE + indexes (hand-written, additive).
- Doors (officer auth = the same middleware the existing reviewer routes use — read one and copy its guard):
  `GET /api/provider/applications/:id/document-check` → `{ requirements (T4 payload resolved for the app), reviews (current round rows), officerChecklist: {scope:'IN'|'OUT', qualification:'PASS'|'FAIL', overall:'COMPLETE'|'INCOMPLETE'} derived }`
  `POST /api/provider/applications/:id/document-reviews` `{slotId, verdict, reason?, dueDate?}` — upserts the current-round row; MORE_REQUESTED requires reason (Thai, ≥10 chars) + dueDate that `isWorkingDay` (reuse `utils/working-days.js`); audit row per decision.
  `POST /api/provider/applications/:id/document-decision` `{action:'ACCEPT_ALL'|'REQUEST_MORE'}` — ACCEPT_ALL refused unless every required slot's current-round verdict is ACCEPTED (`DOCUMENT_CHECK_INCOMPLETE` 409); REQUEST_MORE refused unless ≥1 MORE_REQUESTED; REQUEST_MORE flips the application to `REVISION_REQUESTED` via the existing workflow-transition service (find the transition helper the current review flow uses and go through it — never a raw status write) + in-app notification to the applicant via `services/notification/domain-helpers.js` pattern (new `notifyDocumentRevisionRequested(application, slots)` listing the slots + due date, Thai copy per rules).
- [ ] Failing tests: MORE_REQUESTED without reason → 422; weekend dueDate → 422 with the working-day message; ACCEPT_ALL with one non-accepted required slot → 409 DOCUMENT_CHECK_INCOMPLETE; REQUEST_MORE writes REVISION_REQUESTED through the transition service (spy) and notifies with the slot list; round bumps on resubmit (service fn `openNextRound(applicationId)` clears nothing, inserts nothing — next POST writes round+1). RED → implement → green (+error-codes rows for the two new codes) → commit `feat(officer): per-slot document review doors on an additive table`.

### Task 13: Officer document-check page

**Files:** Create `apps/web-app/src/app/provider/reviewer/[id]/document-check/page.tsx` + `client-view.tsx`; link it from the existing reviewer application view (read `src/app/provider/reviewer` to find the application detail entry point and add the button "ตรวจเอกสารตาม กทล.1"). Test: `document-check/__tests__/document-check.test.tsx`.
**Interfaces:** Consumes T12 doors + DocumentViewerModal. Produces the approved OfficerReview board: left = 1.1 slot rows (รับแล้ว/กำลังดู/ขอเพิ่ม states, per-slot ดู→viewer, รับเอกสารนี้/ขอเอกสารเพิ่ม actions with reason+dueDate form), 1.2/1.3 cards, 1.4 derived state, decision bar (both buttons wired to the decision door; disabled logic mirrors the backend refusals with `bg-officer-*` tokens); every decision optimistically updates then refetches.
- [ ] Failing tests: fixture with one MORE_REQUESTED renders the amber row + the decision bar enables only "ส่งคำขอเอกสารเพิ่ม"; all-accepted fixture enables "รับคำขอ"; the ดู button calls openDocumentPreview (modal), never window.open. RED → implement → green (tsc+eslint) → commit `feat(officer): document-check page — accept or request-more per slot, viewer in page`.

### Task 14: Farmer slot-scoped revision surface

**Files:** Create `apps/web-app/src/app/health/applications/[id]/revision/page.tsx` + `client-view.tsx`; Modify the application detail (`[id]/client-view.tsx`) to route its REVISION_REQUESTED banner here. Backend: `POST /api/applications/:id/revision-resubmit` (health auth) — refuses unless status REVISION_REQUESTED; verifies every MORE_REQUESTED slot of the current round now has a NEWER draft-document upload than the review row's createdAt (409 `REVISION_INCOMPLETE` naming the slots otherwise); bumps the review round and transitions the application back into the review queue via the same transition service; notifies the officer. Test both sides.
**Interfaces:** Consumes T4 requirements + T12 review rows (exposed to the owner via `GET /api/applications/:id/requirements?includeReviews=1` — extend T4 route with the current-round MORE_REQUESTED rows only; an applicant never sees ACCEPTED-row internals).
- [ ] Failing tests: BE — resubmit with a stale file → 409 listing `landlord_consent`; fresh upload → transition called + officer notified. FE — page lists ONLY the requested slots with reason + due date (formatThaiDate, BE year), upload replaces then the CTA "ส่งกลับให้เจ้าหน้าที่ตรวจ" enables. RED → implement → green → commit `feat(wizard-v2): slot-scoped revision — fix one paper, not the whole filing`.

### Task 15: Cleanup sweep (B5 — คำสั่ง "คลีนให้หมด") — **DONE 2026-09-05**

**Files:** Delete per the spec §6 list everything still standing after T11: `steps/documents-step.tsx`, `documents-step-config.tsx`, `documents-step-dedupe.ts`, `quality-control-step.tsx`, `quality-control-choice-card.tsx`, `consent-step.tsx`, `general-step*.tsx|ts`, `plant-selection-*.ts(x)`, `farm-info-*.tsx|ts`, `production-info-*.tsx|ts`, `address-subdistrict.ts`/`derive-location-type.ts`/`cultivation-tokens.ts` IF now orphaned (`git grep` each), the legacy `openDocumentPreview target:'tab'` fallback, dead DOCUMENT_SLOTS rows (the 27 CUT — keep any row still referenced by alias groups as alias-only entries), their orphaned tests, and stale comments that describe the deleted flow (grep "step 8", "ตรวจทานและส่ง" in guidance files under the wizard tree).
**Constraint:** ratchet may not rise and `check-green-mask-assertions` stays green; every deletion must leave `npx tsc --noEmit` and the family suites green — deletions that break imports get fixed by deleting the dead importer, never by re-adding a shim.
- [ ] Steps: inventory with `git grep -l` per file → delete → `npx tsc --noEmit -p tsconfig.json` + `npx jest src/app/health/applications src/app/provider/reviewer --runInBand` + backend family sweep + `bash scripts/probes/ratchet.sh` (numbers in the report from the probe) → commit `chore(wizard-v2): remove the superseded wizard, review surfaces and dead slots`.

### Task 16: Walks — the wizard and the officer press it for real

**Files:** Create `apps/web-app/e2e-g4/a01v2-wizard.spec.ts`, `apps/web-app/e2e-g4/a02v2-officer-review.spec.ts` (g4 conventions: two-state, resumable, VARS ids, `g4psql` SELECT-only, creds from env; NEVER run them in this task — `npx playwright test --config=playwright.g4.config.ts --list` + `npx tsc` only; the coordinator presses).
**Script (a01v2):** farmer B (or a fresh farmer C minted per a01 rules) files through all 6 steps as วิสาหกิจ+เช่า+Indoor+ส่งออก: asserts step-3 conditional cards appear/disappear when toggling tenure (press both ways) and that adding a second ลักษณะพื้นที่ tick (กลางแจ้ง on top of Indoor) makes field_surround_photos appear ALONGSIDE building_plan_photos rather than replacing it, step-6 red card names the one missing slot then clears after attaching, กทล.1 inline render carries the entered สวช.01, declarations required before CTA, CTA hands over to the payments page (stop there — a03 owns payment). DB asserts via g4psql: draftDocuments rows carry canonical slot ids; `declarationsAcceptedAt` stamped.
**Script (a02v2):** reviewer opens document-check for that application, accepts all but `landlord_consent`, requests more with reason+workday due date → farmer's revision page shows exactly that slot → farmer replaces the file → resubmit → officer sees round 2 and accepts all → decision "รับคำขอ". DB asserts: review rows round 1+2, status transitions real.
- [ ] Steps: write both → `--list` shows them + tsc clean (paste) → commit `test(walks): a01v2 six-step wizard + a02v2 officer per-slot review`.

---

### Task 17: B6 — post-issuance scope lock (กทล.1 ส่วนที่ ๔ (๓) given teeth)

**Status: DONE 2026-09-05.** การแช่แข็ง T&T ถูกปลดโดย operator ("ปลด T&T เลย") และ Task 11
เพิ่งทำให้หน้าจอ *แสดง* คำรับรอง (๓) ให้ผู้ยื่นติ๊ก ⇒ ข้อนี้กลายเป็นหนี้ที่ต้องจ่ายทันที
ตามที่แผนเขียนไว้เองว่าห้ามส่งการแสดงผลโดยไม่มีเครื่องบังคับ · ข้อ 3 (seedSource/varietyName)
ทำไปแล้วใน T1 · ข้อ 1 และ 2 ทำในคอมมิตนี้ผ่าน `services/certified-scope.js` ตัวเดียวที่ทั้งสอง
ประตูเรียก · **เดิม: Blocked by the T&T freeze** — every file below is under
`routes/api/cultivation/*` / `services/planting-service.js`, which the operator froze at
`297ea85d` for the duration of this plan. This task exists so the promise the applicant signs
in T11 is not a promise the platform contradicts; it starts when the freeze lifts.

**The clause:** ส่วนที่ ๔ (๓) — "ไม่เปลี่ยนพื้นที่/เมล็ดพันธุ์/ส่วนที่ใช้โดยไม่ยื่นคำขอใหม่"
(`reports/research/2026-09-01-dtam-application-baseline/facts.md:28`).

**The hole, measured 2026-09-05.** The application record is correctly frozen after issuance
(draft-save, revision and admin-override all refuse a non-DRAFT row). The leak is on the farm
side, and it is two ordinary authenticated requests:
1. `PATCH /api/farms/:id { cultivationMethod: 'INDOOR' }` → 200. `services/farm-service.js:283`
   allow-lists `cultivationMethod`; the only guards are reachability and `EDIT_FARM`. No
   certificate is consulted and no audit row is written.
2. `POST /api/farms/:id/plots { solarSystem: 'INDOOR' }` → 201. The one guard that says
   "certified for" (`routes/api/cultivation/plots.js:74`) compares against
   `farms.cultivationMethod` — the column step 1 just moved — so it now passes.
The farm grows indoors on an outdoor certificate, and nothing downstream can see it: the
Certificate row carries no cultivation method, and `CERTIFICATE_REVISION_FIELDS` cannot express
one. Separately, `services/planting-service.js:367` applies `seedSource` and `varietyName`
OUTSIDE its `isLocked` branch, so a HARVESTED cycle's declared variety can be rewritten after its
batches exist.

**The three changes (each under ~20 lines, no migration):**
1. `routes/api/cultivation/plots.js:74` — resolve the certified method from the certificate's
   source Application (via `certificates.applicationId`), not from the mutable farm column. This
   alone closes the two-step bypass, because step 2 then checks a record step 1 cannot reach.
2. `services/farm-service.js` `updateFarm` — before the allow-list loop, refuse a changed
   `cultivationMethod` while the farm holds an active, non-revoked, non-expired certificate:
   409 `CERTIFIED_SCOPE_LOCKED`, Thai copy pointing at ยื่นคำขอใหม่ (the clause's own answer).
   **Lock `cultivationMethod` ONLY** — `reviseCertificateFromFarm` reads the farm as the source of
   truth for province/district/address (`certificate-service.js:183`), so locking those would
   break the revision door.
3. `services/planting-service.js:365-372` — move `seedSource` and `varietyName` inside `isLocked`.
   Full enforcement of พันธุ์/ส่วนที่ใช้ against the declared list is NOT in this task: it needs a
   canonical variety catalogue the wizard's free-text `varietyName` does not produce. Say so
   rather than half-building it.

**Open for DTAM, not for this plan:** today the only doors out of a live certificate are
revise-location (for the system's own error), revoke and renew. "Amend the scope" is not one of
them, so a refusal has no defined next step to offer the holder beyond a new filing.

**Done 2026-09-05 as part of the T4b correction (the one piece that was in scope):** step 1 no
longer offers the request type "แก้ไขรายละเอียดใบรับรอง — แก้ไขข้อมูลในใบรับรองเดิมโดยไม่เริ่มคำขอใหม่
ทั้งหมด", which was the verbatim negation of (๓) and mapped to no `requestType` the engine knows.
Pinned by `steps/__tests__/no-amendment-without-refiling.test.ts`.

## Self-Review (done before commit)

1. **Spec coverage:** §2.1 engine→T1-T4 · §2.2 pipe→T4/T6-T9 (cards) · §2.3 generator→T10 · §3 wizard→T5-T9 · §4 review→T11 · §5 officer→T12-T14 · §6 cleanup→T15 · §7 compatibility→T4 alias fold + T5 legacy-draft mapping · §8 walks→T16. Gap check: spec's "ทุก slot มีคำอธิบายสองบรรทัด" → T2 sourceHint + T6 card render. No orphan requirement found.
2. **Placeholder scan:** no TBD/TODO; every code step carries real code or an exact named source to copy from (with its path+lines); the two "find the mount point" steps name the grep to run — discovery, not deferral.
3. **Type consistency:** `resolveApplicationRequirements` shape used identically in T4/T6/T10/T11/T12; slot ids lower_snake canonical everywhere; `RULE_DIMENSIONS` vocab matches T3 seed rows and T5/T7 store writes (OWNED/STATE_PERMITTED/RENTED · OUTDOOR/INDOOR/GREENHOUSE/OTHER · PLANTING/PROCESSING · NEW/RENEWAL/REPLACEMENT) — shared vocabulary, DIFFERENT CARDINALITY: a rule ROW carries one `areaType`, a FILING carries `areaTypes: string[]`, and the lens bridges the two by putting every tick into one ask; `requestType` never 'RENEW'.
4. **Known risk carried deliberately:** the licence-pending practice (submit-then-request-more) ships behind the officer door only — no farmer-side hard block — pending DTAM confirmation (spec §2.1 flag).
