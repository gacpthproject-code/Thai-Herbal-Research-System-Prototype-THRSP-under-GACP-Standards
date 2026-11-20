## 1. `rulesAt` — signature, dimensions, where-clause, return, ordering

**File:** `/home/ubuntu/work/GACP-Certification-Application/apps/backend/services/requirement-rule-service.js`, lines **166-196**. Exported at line 376.

```js
async function rulesAt(
    { at, holderType, requestType, plantCode, landTenure, areaType, certScope } = {},
    client = prisma,
) {
    const asOf = at === undefined || at === null ? new Date() : toDate(at, 'at');
    const asked = {
        landTenure: normalizeCaseDimension('landTenure', landTenure),
        areaType: normalizeCaseDimension('areaType', areaType),
        certScope: normalizeCaseDimension('certScope', certScope),
    };

    const where = {
        effectiveFrom: { lte: asOf },
        AND: [
            { OR: [{ effectiveTo: null }, { effectiveTo: { gt: asOf } }] },
            dimensionClause('holderType', holderType),
            dimensionClause('requestType', requestType),
            dimensionClause('plantCode', plantCode),
            dimensionClause('landTenure', asked.landTenure),
            dimensionClause('areaType', asked.areaType),
            dimensionClause('certScope', asked.certScope),
        ],
    };

    return client.requirementRule.findMany({
        where,
        // Deterministic order so the snapshot stamped on an application is
        // byte-stable for the same set of rules.
        orderBy: [{ slotId: 'asc' }, { effectiveFrom: 'asc' }],
    });
}
```

- **Arity:** `rulesAt.length === 0` (both params defaulted). Call as `rulesAt({...}, tx)`.
- **Dimensions accepted (6):** `holderType`, `requestType`, `plantCode`, `landTenure`, `areaType`, `certScope`. Plus `at` (Date|string; `undefined`/`null` → `new Date()`; invalid → throws, see §3).
- **`client`** defaults to the module-level `prisma` (line 24); the submit gate passes its tx — real precedent at `services/application-document-requirements.js:201`: `await rulesAt({ at: new Date(), holderType, requestType }, client)`.
- **`dimensionClause` (lines 80-85)** is the NULL-means-all wildcard:
  ```js
  function dimensionClause(field, value) {
      if (value === null || value === undefined || value === '') {
          return { [field]: null };
      }
      return { OR: [{ [field]: null }, { [field]: value }] };
  }
  ```
  Unnamed dimension → **pins the column to `null`** (only dimension-agnostic rules match). Named → `NULL OR exact`.
- **Window semantics:** closed exactly *at* the instant → out; starting exactly at it → in.
- **Returns:** `Promise<RequirementRule[]>` — **raw Prisma rows, no select/projection, no post-filter**. `isRequired:false` rows come back and the caller must filter (the submit gate does: `application-document-requirements.js:205`).

**Row shape** (from `/home/ubuntu/work/GACP-Certification-Application/apps/backend/prisma/schema/requirement-rule.prisma:34-96`, `@@map("requirement_rules")`):

| field | type | notes |
|---|---|---|
| `id` | String (uuid) | line 35 |
| `createdAt` | DateTime | line 36 |
| `holderType` | String? | `INDIVIDUAL\|JURISTIC\|COMMUNITY_ENTERPRISE`, line 44 |
| `requestType` | String? | `NEW\|RENEWAL\|REPLACEMENT`, line 48 |
| `plantCode` | String? | line 51 |
| `landTenure` | String? | line 55 |
| `areaType` | String? | line 57 |
| `certScope` | String? | line 59 |
| `slotId` | String (required) | canonical form, line 68 |
| `isRequired` | Boolean `@default(true)` | line 70 |
| `maxDocumentAgeMonths` | Int? | **inert — nothing reads it yet** (lines 72-77) |
| `effectiveFrom` | DateTime | line 80 |
| `effectiveTo` | DateTime? | NULL = in force, line 82 |
| `createdBy` | String | line 86 |
| `reason` | String? | line 87 |
| `closedBy` | String? | line 88 |
| `closedAt` | DateTime? | line 89 |

No `updatedAt`, no `organizationId`. Indexes: `@@index([slotId])`, `@@index([effectiveFrom, effectiveTo])`.

**Ordering:** `[{ slotId: 'asc' }, { effectiveFrom: 'asc' }]` — deliberately byte-stable for the stamp. Same ordering used by the admin catalog GET (`routes/api/admin/requirement-rules.js:160`).

---

## 2. `RULE_DIMENSIONS` / `normalizeDimension` — and the raw-dimension minor

**`RULE_DIMENSIONS`** — lines **55-59**, exported at line 384, frozen two levels deep:

```js
const RULE_DIMENSIONS = Object.freeze({
    landTenure: Object.freeze(['OWNED', 'STATE_PERMITTED', 'RENTED']),
    areaType: Object.freeze(['OUTDOOR', 'INDOOR', 'GREENHOUSE', 'OTHER']),
    certScope: Object.freeze(['PLANTING', 'PROCESSING']),
});
```

It holds **only the three new case dimensions**. `holderType` / `requestType` vocabularies live in the admin route and are **not** exported from anywhere reusable:
- `HOLDER_TYPES = ['INDIVIDUAL','JURISTIC','COMMUNITY_ENTERPRISE']` — `routes/api/admin/requirement-rules.js:59` (module-local `const`, not exported).
- `REQUEST_TYPES = ['NEW','RENEWAL','REPLACEMENT']` — same file, line 67 (also not exported).

**`normalizeDimension`** — lines **92-98** (trim only, no vocabulary check):
```js
function normalizeDimension(value) {
    if (value === null || value === undefined) { return null; }
    const text = String(value).trim();
    return text === '' ? null : text;
}
```
`null`/`undefined`/`''`/whitespace-only → `null`. Not exported.

**`normalizeCaseDimension`** — lines **106-121** (trim + closed-vocabulary check, throws — see §3). Not exported.

### Who gets what, at HEAD (`fa345c5a`) — the reviewer's minor is **STILL TRUE, and only on the read path**

| dimension | `rulesAt` (READ) | `createRule` (WRITE) |
|---|---|---|
| `holderType` | **RAW** → `dimensionClause('holderType', holderType)` **line 181** | `normalizeDimension(body.holderType)` **line 231** (trimmed) |
| `requestType` | **RAW** — **line 182** | `normalizeDimension(body.requestType)` **line 232** |
| `plantCode` | **RAW** — **line 183** | `normalizeDimension(body.plantCode)` **line 233** |
| `landTenure` | `normalizeCaseDimension` **line 172**, used at 184 | `normalizeCaseDimension` **line 222**, used at 234 |
| `areaType` | `normalizeCaseDimension` **line 173**, used at 185 | `normalizeCaseDimension` **line 223**, used at 235 |
| `certScope` | `normalizeCaseDimension` **line 174**, used at 186 | `normalizeCaseDimension` **line 224**, used at 236 |

So: the write door normalizes all six; **`rulesAt` normalizes only the three new ones and hands `holderType`/`requestType`/`plantCode` straight to `dimensionClause`.** The only laundering they get on the read path is `dimensionClause`'s own `value === ''` branch (line 81), which catches empty string but **not** `'JURISTIC '` (a trailing space would silently query for a value no stored row has — rules stored trimmed by `createRule` would not match, and only NULL-dimension rules would come back).

---

## 3. `createRule`'s refusal path for an unknown dimension word

Thrown by `normalizeCaseDimension`, lines **113-118**, built by `ruleError` (lines **61-67**):

```js
throw ruleError(
    `มิติกติกาไม่อยู่ในชุดค่าที่ระบบรู้จัก: ${field}=${normalized} `
    + `กรุณาแก้เป็นค่าใดค่าหนึ่งใน ${allowed.join(' / ')} แล้วทำรายการอีกครั้ง`,
    'INVALID_RULE_DIMENSION',
    422,
);
```
```js
function ruleError(message, code, status) {
    const err = new Error(message);
    err.status = status;
    err.statusCode = status;
    err.code = code;
    return err;
}
```

- **Class:** plain `Error` (no subclass, no custom `name`).
- **`.code`** = `'INVALID_RULE_DIMENSION'`; **`.status`** and **`.statusCode`** both = `422`.
- **Message language:** **Thai**, and it names both the offending `field=value` and the full allowed set, e.g. `มิติกติกาไม่อยู่ในชุดค่าที่ระบบรู้จัก: landTenure=LEASE กรุณาแก้เป็นค่าใดค่าหนึ่งใน OWNED / STATE_PERMITTED / RENTED แล้วทำรายการอีกครั้ง`. (Every other error from this module — `REQUIREMENT_RULE_INVALID` 400, `REQUIREMENT_RULE_NOT_FOUND` 404, `REQUIREMENT_RULE_ALREADY_CLOSED` 409 — is in English.)
- **Ordering in `createRule`:** slotId check (212-215) → case dimensions (221-225) → actor (227). Words judged before author; nothing written on either refusal.

**Yes — `rulesAt` throws the identical error on the READ path.** Lines 172-174 call the same `normalizeCaseDimension` **before the query runs**, so a `GET /applications/:id/requirements` whose derived `landTenure` is `'LEASE'` rejects with a Thai-language 422 / `INVALID_RULE_DIMENSION`, not an empty result. The T4 handler must catch this: the admin route's existing pattern is `respondFromServiceError` (`routes/api/admin/requirement-rules.js:113-124`) — echo 4xx verbatim, log + generic 500 otherwise.

**Coverage gap worth knowing:** `__tests__/unit/requirement-rule-service.test.js` (15 tests, all passing at HEAD — I ran `npx jest __tests__/unit/requirement-rule-service.test.js`) has **no test asserting the 422 / `INVALID_RULE_DIMENSION` throw** on either path. Grep for `422` / `INVALID_RULE_DIMENSION` in that file returns nothing; only 400/404/409 are asserted (lines 230, 232, 374, 377).

**Export list is pinned** (test lines 385-404): `Object.keys(svc).sort()` must equal `['RULE_DIMENSIONS','closeRule','createRule','rulesAt']`; `svc.insertRule` must be `undefined`; `closeRule.length === 3`, `createRule.length === 2`. **Adding an export to this service breaks that test** — T4's new `application-requirements-service` should be a separate module.

---

## 4. v2 slot rows in `constants/document-slots.js`

**File:** `/home/ubuntu/work/GACP-Certification-Application/apps/backend/constants/document-slots.js`. v2 block header at line **324**; rows span **348-508**; `DOCUMENT_SLOTS` closes at **509**.

**Shape — exactly four keys, verified at runtime for all 25 rows:**
```js
LAND_RIGHTS: {
    slotId: 'land_rights',
    name: '…',          // Thai label, ministry wording
    description: '…',   // Thai, when/what
    sourceHint: '…',    // Thai, "หาได้ที่ไหน" — NEW in v2
},
```
`{slotId, name, description, sourceHint}` — **no `required`, no `requiredFor`, no `conditionalRequired`, no `deprecated`**. That is deliberate (comment lines 334-337: which of these a case must attach is owned by `requirement_rules`, not a constant).

**All 25 v2 KEYS → slotId, with line numbers:**

| # | KEY | slotId | lines |
|---|---|---|---|
| 1 | `LAND_RIGHTS` | `land_rights` | 348-353 |
| 2 | `LANDLORD_CONSENT` | `landlord_consent` | 354-359 |
| 3 | `SITE_MAP_COORDS` | `site_map_coords` | 360-365 |
| 4 | `BUILDING_PLAN_PHOTOS` | `building_plan_photos` | 366-371 |
| 5 | `FIELD_SURROUND_PHOTOS` | `field_surround_photos` | 372-377 |
| 6 | `PRODUCTION_UTIL_PLAN` | `production_util_plan` | 378-383 |
| 7 | `SECURITY_RESIDUE_PLAN` | `security_residue_plan` | 384-389 |
| 8 | `SITE_PHOTOS` | `site_photos` | 390-395 |
| 9 | `SOP_MANUAL` | `sop_manual` | 396-401 |
| 10 | `CONTROLLED_HERB_LICENSE` | `controlled_herb_license` | 404-409 |
| 11 | `ID_HOUSE_REG` | `id_house_reg` | 412-417 |
| 12 | `COMMUNITY_REG_MEMBERS` | `community_reg_members` | 418-423 |
| 13 | `COMMUNITY_ASSIGNMENT` | `community_assignment` | 424-429 |
| 14 | `PRODUCER_SUPERVISION_LETTER` | `producer_supervision_letter` | 430-435 |
| 15 | `JURISTIC_REG_6M` | `juristic_reg_6m` | 436-441 |
| 16 | `JURISTIC_AUTHORITY` | `juristic_authority` | 442-447 |
| 17 | `PREV_CERT_ORIGINAL` | `prev_cert_original` | 450-455 |
| 18 | `RENEWAL_PLAN` | `renewal_plan` | 456-461 |
| 19 | `RENEWAL_UTIL_PLAN` | `renewal_util_plan` | 462-467 |
| 20 | `OPERATION_SUMMARY_REPORT` | `operation_summary_report` | 468-473 |
| 21 | `POLICE_REPORT` | `police_report` | 476-481 |
| 22 | `DAMAGED_CERT` | `damaged_cert` | 482-487 |
| 23 | `WATER_TEST` | `water_test` | 491-496 |
| 24 | `SOIL_TEST` | `soil_test` | 497-502 |
| 25 | `ADDITIONAL_DOCS` | `additional_docs` | 503-508 |

Sub-group comment headers inside the block: `กทล.1 ส่วนที่ ๓ A1-A8` (347), `ส่วนสำหรับเจ้าหน้าที่ ข้อ 1.1` (403), `กลุ่มคุณสมบัติผู้ยื่น` (411), `กรณีต่ออายุ` (449), `กรณีขอใบแทน` (475), `ไม่ใช่เอกสารบังคับตอนยื่น` (489).

### How "optional" is expressed for WATER_TEST / SOIL_TEST / ADDITIONAL_DOCS

**It is NOT machine-readable. There is no flag at all.** Confirmed at runtime: all three have `required === undefined` and key set `[slotId,name,description,sourceHint]`, identical to the other 22.

"Optional" exists only as prose in two places:
1. The section comment, **lines 489-490**:
   `// ── ไม่ใช่เอกสารบังคับตอนยื่น (ข้อกำหนดข้อ 2 และขั้นตอนตรวจข้อ 4-5) ────` / `// กรมโดยปกติไม่ตรวจแล็บ ยกเว้นพบความเสี่ยงปนเปื้อน จึงเป็นช่องเสริม ไม่นับความครบถ้วน`
2. The Thai `description` string of each: WATER_TEST (494) and SOIL_TEST (500) both begin `'ไม่ใช่เอกสารบังคับตอนยื่น แนบได้เมื่อ…'`. ADDITIONAL_DOCS (506) has no such phrase — it says it is for officer-requested extras.

**Consequence for T4:** the "one lens" cannot learn optionality from the catalog. Either (a) it comes from `requirement_rules` (a row with `isRequired:false`, or simply no row), or (b) T4 must introduce the distinction itself. There is no exported v2-key list either — but **`sourceHint` is a clean discriminator**: exactly 25 of the 64 catalog entries have it, and they are exactly these 25 (verified via node). `module.exports` (679-687) is `{DOCUMENT_SLOTS, getRequiredSlots, getAllSlotIds, requiresLicense, getRequiredDocuments, getObjectiveWarnings, canProceedWithObjectives}` — no v2-aware helper.

**Trap:** the legacy helpers are v2-blind. `getRequiredSlots` (512-518) filters `if (!slot.required) return false;` and `getRequiredDocuments` (533-600) starts from `slot.required === true` — **every v2 slot is invisible to both**, by design. Do not reuse them for the lens. `getAllSlotIds` (521) *does* include all 64 (that is how the admin route's `KNOWN_SLOT_IDS` at line 52 admits v2 slot ids). No duplicate `slotId` across the 64 entries.

---

## 5. Stale `file:line` cross-references

I resolved every `file:line` token in the two service/route files against the files as they stand at HEAD.

### In `services/requirement-rule-service.js` — **one stale reference**

| line | comment says | reality at HEAD |
|---|---|---|
| **90** | `The admin route trims before it validates (routes/api/admin/requirement-rules.js:70-76)` | **STALE.** `routes/api/admin/requirement-rules.js:70-76` is now the middle of the `CASE_DIMENSION_CHECKS` doc-comment ("The three กทล.1 case dimensions…"). The route's `normalizeDimension` is at **85-92** (docblock 85, function body 86-92). It was correct pre-T1 — at `22ad8ce4` the function sat at exactly 70-76; T1's own +16-line `CASE_DIMENSION_CHECKS` insertion pushed it down. **Correct to `:85-92`.** |

**Verified still accurate (do not touch):**
- line 27 → `services/entity-service.js:27-32` ✅ (27-31 is the ResourceType-has-no-ENTITY-member comment, 32 is the `auditLogger` require).
- line 47 → `routes/api/admin/requirement-rules.js:28-31` ✅ (the `VALIDATION (plan review M6 — "กันกฎหมายใบ้")` block).
- line 52 → `routes/api/admin/requirement-rules.js:59-67` ✅ (`HOLDER_TYPES` at 59 through `REQUEST_TYPES` at 67).
- lines 2-3, 374 carry paths without line numbers; all three targets exist (`docs/superpowers/specs/2026-08-15-membership-m2-documents-and-poa-design.md`, `prisma/schema/requirement-rule.prisma`, `__tests__/unit/requirement-rule-service.test.js`).

### Bonus — the *reverse* direction, both broken by the same T1 diff

`routes/api/admin/requirement-rules.js` points back at the service with pre-T1 line numbers:

| line | comment says | reality at HEAD |
|---|---|---|
| **133** | `…a dimension the caller did not name may only match dimension-agnostic rules (service:54-59)` | **STALE.** `dimensionClause` was at 54-59 pre-T1 (verified in `git show 817e9451`); it is now at **80-85**. |
| **135** | `The window below is the same one rulesAt applies (service:101-109)` | **STALE.** The `where` block was 101-109 pre-T1; it is now at **177-188** (the `effectiveTo` OR clause specifically at 180). |

`routes/api/admin/requirement-rules.js:223` → `services/application-document-requirements.js:201` is **still accurate** (that is the live `rulesAt({ at: new Date(), holderType, requestType }, client)` call the submit gate makes — and the exact call site T4 rewires).

---

### Two facts T4 will need that fall just outside the brief

- **`GET /applications/:id/requirements` does not exist.** Nothing in `routes/api/applications/` serves it; the nearest neighbours are `journey.js:59` `GET /document-requirements`, `journey.js:62` `GET /security-requirements`, `journey.js:79` `GET /step-requirements/:stepNumber` — all catalog-shaped, none application-scoped.
- **The submit gate today asks the law with two dimensions only** (`services/application-document-requirements.js:199-206`): `requestType` is derived as `formData.renewalOf ? 'RENEWAL' : 'NEW'`, `holderType` from `resolveHolderType(application, client)` (line 195), and `landTenure`/`areaType`/`certScope`/`plantCode` are never passed — so every case-dimension rule filed since T1 currently binds **nobody**. That is the gap Task 4 closes, and it is why supplying those three words must be paired with the 422 catch from §3.