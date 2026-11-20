# W4 — why no farmer could upload a wizard document (root cause + fix)

Date: 2026-08-22 · Branch `fix/wizard-draft-documents` (from `main` @ 22d03e3e)
Input evidence: `reports/design-cleanup-2026-08-21/wizard-walk/` (INDEX.md, walk-meta.json, diag-upload-output.txt)

---

## 1. The exact 400 body

Reproduced with a real UAT-farmer token straight against the backend on :8000
(no Next proxy), PNG fixture, `slotId=M1_PT11`, `stepKey=plant-selection`:

```
POST /api/applications/draft-documents  ->  400
{"success":false,"code":"VALIDATION_ERROR","error":"Failed to upload draft document",
 "message":"Failed to upload draft document","messageTh":"ข้อมูลไม่ถูกต้อง",
 "requestId":"99ad9cdf-640a-4fd3-bb8d-96e1a69e9b8a","timestamp":"2026-08-22T08:43:21.744Z",
 "path":"/api/applications/draft-documents","method":"POST"}
```

The *same* 400 came back from `GET /api/applications/draft-documents` (message
"Failed to list draft documents"), which is the tell: the failure is upstream of
anything to do with the FILE. Nothing about the upload was ever validated.

## 2. The rule that rejected — and it is not a file rule

Neither the MIME allowlist, the size cap, the slot/step enum, nor tenancy.
`applications.js` `POST /draft-documents` calls `findOrCreateApplicationForHealth`
BEFORE it looks at `req.file`, and that helper refuses to create a draft for an
applicant who has no legal-applicant Entity:

```js
// routes/api/applications/applications.js (main @ 22d03e3e, lines 262-274)
const personalEntity = await findUserPersonalEntity(healthIdentity);
const seedEntityId = activeEntity?.entityId || personalEntity?.id || null;
if (!seedEntityId) {
    const err = new Error('ไม่พบผู้ยื่นตามกฎหมาย (entity) ของบัญชีนี้ จึงสร้างคำขอไม่ได้');
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';   // <- the code the wire showed
    throw err;
}
```

`respondError` (shared/api-response.js) honours the explicit 4xx status and the
thrown `code`, but takes the CALLER's fallback message — so the specific Thai
reason above was replaced by the route's generic "Failed to upload draft
document", and `messageTh` came from `DEFAULT_ERROR_MESSAGES.VALIDATION_ERROR`
("ข้อมูลไม่ถูกต้อง"). That is why the wire response named neither the cause nor
the fix, and why this took a full Playwright walk to find.

## 3. Why the applicant had no Entity — the four-link chain

Confirmed against the live database (Supabase, the same DB the walk used):

| Query | Result |
|---|---|
| `user{ id: b17356af-…, email: somchai@gacpth.com }` | `role: "HEALTH"`, `healthId` set, `organizationId` set |
| `entityMembership.findMany({ userId })` | `[]` — no membership at all |
| `user.groupBy(role)` | **`health` × 38**, **`HEALTH` × 2** (somchai, somying — the two seeded applicants) |
| `entity.count({ type: INDIVIDUAL, isDeleted: false })` | 36, with 36 OWNER memberships — every *registered* farmer has one |

1. **`prisma/seed-gacp.js` wrote `role: 'HEALTH'`** — a legacy spelling that
   migration `20260801000000` removed from the column. Commit **b4ac86bf**
   (2026-08-02, "Narrow role filters to canonical-only") explicitly hunted the
   writers that "re-dirtied the canonical column" and fixed two of them
   (`platform-admin/organizations.js`, `e2e-controller.js`) — but its scanner
   (`productionFiles()` in `role-filters-canonical-only.test.js`) walks
   `routes/services/jobs/shared/middleware/controllers` only. **Nobody looked in
   `prisma/`.** The seed kept writing the legacy value, for applicants *and* for
   every officer (`REVIEWER_AUDITOR`, `AUDITOR`, `SCHEDULER`, `ACCOUNTANT`, `ADMIN`).
2. **The seed also creates no personal INDIVIDUAL Entity**, breaking the Wave-B
   Phase-68 invariant ("every health user has one"). Registration
   (`prisma-auth-service.js:244`) creates it in the same transaction; the seed
   never did.
3. **The self-heal that exists exactly for this case was disabled by link 1.**
   `entity-service.listMembershipsForUserWithHeal` (the `GET /api/entities/mine`
   read path) compared the RAW column value: `user.role !== CANONICAL_ROLES.HEALTH`.
   `'HEALTH' !== 'health'` → skip. So the one mechanism designed to repair
   "users created outside registration (seeds, e2e, scripts)" skipped precisely
   those users. The same guard had already been broken once in the opposite
   direction (b4ac86bf fixed it from uppercase to lowercase); the raw compare
   made it re-breakable by any single dirty writer.
4. **No Entity → hard 400 on every wizard write.** `if (!seedEntityId) throw`
   landed in **8f62fbe1** (2026-08-15, "feat(submit): the four doors now ask in
   whose name"). Before it, a draft was created with a null `entityId` and the
   upload succeeded (the applicant hit the wall later, at submit).

## 4. FE vs BE contract diff

**None.** Read side by side:

| | sends / expects |
|---|---|
| FE `inline-document-upload.tsx:66-75` | `file`, `slotId`, `stepKey`, optional `draftId`, `applicationId` |
| FE `lib/services/draft-document-upload.ts` (the single upload path) | same field names |
| BE `applications.js` `POST /draft-documents` | `upload.single('file')` + `payload.slotId` / `payload.stepKey` |

Identical — which is why the standalone `diag-upload.js` repro (hand-built
multipart, zero FE code involved) failed identically. No dictionary key, config
entry or wizard de-clutter commit is implicated, and neither
`documents-step.tsx` nor `inline-document-upload.tsx` needs a change for THIS
defect.

(One FE honesty bug the walk found is real, separate, and NOT fixed here:
`inline-document-upload.tsx:53` sets local `file` state before the request and
never clears it on failure — the failure path only calls `onChange(null, null)`,
which clears the PARENT value while `hasLocalSelection` stays true, so the card
keeps showing the filename and a ลบออก button. That is why the same failure was
loud on step 2 and silent on step 3.)

## 5. Regression or pre-existing?

**Pre-existing, not a regression from today's merges.**

| Date | Commit | Effect on this account |
|---|---|---|
| ≤ 2026-03-12 | d4f956c4 | seed writes `role: 'HEALTH'` (and never an Entity) |
| 2026-08-02 | **b4ac86bf** | heal guard narrowed to canonical-only → **self-heal silently stops working for seeded applicants** |
| 2026-08-15 | **8f62fbe1** | missing Entity becomes a hard 400 → **wizard uploads start failing** |
| 2026-08-16 | (seed run) | somchai / somying created in this DB, already broken |
| 2026-08-22 | 432c84be (U4, today) | changed only the SYMPTOM: the applicant step now shows "โหลดพื้นที่ทำงานไม่สำเร็จ" and blocks, where it previously let the farmer pick a type by hand |

So the commit that made the wizard fail is **8f62fbe1 (2026-08-15)**, acting on
data poisoned by **b4ac86bf (2026-08-02)** on top of a long-standing seed defect.
Today's merges (`1e12c628` proxy header forwarding, `432c84be` U4) are innocent —
`x-active-entity-id` and `ACTIVE_ENTITY_MISMATCH` are not involved at all; the
repro fails with no such header present.

**Blast radius:** the 2 seeded UAT applicants, and any environment provisioned by
`prisma/seed-gacp.js`. The 38 self-registered farmers in this DB all have their
Entity and are unaffected — "blocked for everyone" is true for every *seeded*
farmer, not for every farmer.

## 6. The workspace banner (second symptom)

Same root cause, one hop earlier. `GET /api/entities/mine` returned
`{"success":true,"data":[]}` — a 200 with an empty list, not a 4xx — because the
self-heal (link 3) skipped. The FE then does exactly what commit 432c84be told it
to: `activeEntity === null` after loading finished can only mean the fetch failed
or every membership is non-ACTIVE (the Phase-68 invariant says a health user
always has one), so `entity-switcher.tsx:120` and `general-step.tsx:281` render
"โหลดพื้นที่ทำงานไม่สำเร็จ". The FE reasoning is sound; the invariant it trusts
was the thing that was broken. **Not a regression** — the underlying empty list
predates today; only the wording and the blocking behaviour are new.

## 7. The fix

Three production changes, all in the backend. Validation is **not** loosened —
the entity requirement stays exactly as strict as 8f62fbe1 made it.

1. **`apps/backend/prisma/seed-gacp.js`** — stop writing legacy role spellings
   (`CANONICAL_ROLES.HEALTH` / `.ADMIN`; officers become `document_reviewer` /
   `auditor` / `scheduler` / `account` — the same values `normalizeRole()` has
   always produced at login, so no role MEANING changes), repair an
   already-dirty row on re-seed through a GUARDED spelling repair (never the
   upsert's unconditional `update:` clause — see §11), and call
   `ensurePersonalIndividualEntity()` for each applicant so a seeded farmer
   satisfies the Phase-68 invariant the same way a registered one does.
2. **`apps/backend/services/entity-service.js`** — the self-heal guard normalises
   before comparing (`normalizeRole(user.role) !== CANONICAL_ROLES.HEALTH`).
   Whether a system invariant gets repaired must not hinge on one writer's
   casing. This is an in-memory comparison, not a DB filter: the narrowed query
   filters from b4ac86bf are untouched, and `normalizeRole` returns null for a
   non-role so nothing else widens.
3. **`apps/backend/routes/api/applications/applications.js` + `shared/api-response.js`
   + `shared/error-codes.js`** — the refusal now carries
   `code: 'APPLICANT_ENTITY_MISSING'` with a real Thai message, instead of a bare
   `VALIDATION_ERROR` on a request where nothing the client sent was invalid.
   The code is the one field `respondError` passes through untouched, so it is
   where the cause has to live.

Test-side: `prisma/seed-gacp.js` is added to the WRITERS list in
`role-filters-canonical-only.test.js` — the structural gap that let this through
was that the seed was a `User.role` writer nobody scanned.

Files changed (all under `apps/backend/`):

```
prisma/seed-gacp.js                                       (fix 1)
services/entity-service.js                                (fix 2)
routes/api/applications/applications.js                   (fix 3)
shared/api-response.js                                    (fix 3)
shared/error-codes.js                                     (fix 3)
__tests__/unit/wizard-blocked-by-missing-personal-entity.test.js   NEW
__tests__/unit/entity-mine-self-heal.test.js              +2 cases
__tests__/unit/role-filters-canonical-only.test.js        +seed in WRITERS
__tests__/unit/applications-submit-capability-gate.test.js  updated for the new code
```

## 8. RED → GREEN

RED (before the fix), `apps/backend`, 3 suites — 9 failures, one per link:

```
× legacy-spelled HEALTH row still heals (the seed wrote it that way)
× prisma/seed-gacp.js writes a canonical role
    Received: ["prisma/seed-gacp.js writes 'HEALTH'", "prisma/seed-gacp.js writes 'ADMIN'"]
× no `role:` literal in the seed is a legacy spelling
× the applicant rows are seeded as the canonical HEALTH role
× re-running the seed repairs an already-dirty role column
× each seeded applicant gets their personal INDIVIDUAL entity
× findOrCreateApplicationForHealth throws a specific code, not bare VALIDATION_ERROR
× the code carries a Thai default message (not the internal-error fallback)
× the code is catalogued
Test Suites: 3 failed, 3 total   Tests: 9 failed, 35 passed, 44 total
```

GREEN (after), same 3 suites plus the two suites that guard the files touched:

```
Test Suites: 5 passed, 5 total   Tests: 61 passed, 61 total
  wizard-blocked-by-missing-personal-entity.test.js  (new)
  entity-mine-self-heal.test.js
  role-filters-canonical-only.test.js
  error-codes-catalog.test.js
  seed-officer-roles-canonical.test.js
```

Regression sweep — every suite in `apps/backend/__tests__` that references any
of the five changed modules (73 suites):

```
Test Suites: 2 failed, 3 skipped, 68 passed, 70 of 73 total
Tests:       2 failed, 24 skipped, 1096 passed, 1122 total
```

Both failures accounted for, neither is a new defect:

1. `applications-submit-capability-gate.test.js` — *"no active entity and no
   personal entity → 400 VALIDATION_ERROR"* pinned the old error code. This is a
   deliberate contract change (§7 item 3), so the test was updated to
   `APPLICANT_ENTITY_MISSING` + a Thai-message assertion. The refusal it guards
   is unchanged: still 400, still `createDraftForHealth` never called.
   Re-run: `Test Suites: 1 passed · Tests: 17 passed`.
2. `tenant-scope-drift.test.js` — *"every model with a REQUIRED organizationId is
   in the registry or documented in KNOWN_DRIFT"*. **Pre-existing on `main`**:
   the same single test fails identically in the untouched checkout
   (`Tests: 1 failed, 3 passed, 4 total`), and none of the five changed files is
   a prisma model or the registry. Not introduced here, not fixed here.

## 9. LIVE proof

Fixed code booted from this branch on **:8001** (real Supabase DB, real UAT
farmer login). The **:8000** backend the walk used was left running on UNCHANGED
code, so the only thing that changes for it is the DB state the heal repaired.

```
### STEP 1 — GET /api/entities/mine on the FIXED backend (:8001)
status= 200
{"success":true,"data":[{"id":"4aab81a8-0bb7-4e93-93eb-230272484eff","type":"INDIVIDUAL",
 "displayName":"สมชาย เกษตรทอง","slug":"entity-b17356af","status":"ACTIVE","role":"OWNER",
 "membershipStatus":"ACTIVE","isPersonal":true, ...}]}

### STEP 2 — POST /api/applications/draft-documents on the ORIGINAL backend (:8000)
status= 200
{"success":true,"data":{"applicationId":"7e330258-7a61-45a0-8847-48faed6cb8f9",
 "draftId":"7e330258-7a61-45a0-8847-48faed6cb8f9",
 "documentId":"ec4c4d38-d87c-4483-80c1-b5a30e079abb","fileName":"pixel.png",
 "fileUrl":"/uploads/application-drafts/1787389613989-…png","mimeType":"image/png","size":68}}

### STEP 3 — GET /api/applications/draft-documents on :8000
status= 200  documents: [{ slotId:"M1_PT11", stepKey:"plant-selection", fileName:"pixel.png", … }]

### STEP 4 — GET /api/entities/mine on :8000 (the banner's source)
status= 200  data: [ the personal INDIVIDUAL entity ]  ← was `[]`, the banner's cause
```

Same account, same fixture, same endpoint that returned 400 an hour earlier:
**400 → 200**, and the empty workspace list that produced the red banner is now
populated. The `:8000` code did not change — the heal on `:8001` repaired the DB
state, which is proof that the missing Entity was the whole cause.

**The seed's new step, proven against the same live DB** on the OTHER seeded
applicant (`somying@gacpth.com`), whom the `/entities/mine` heal had not touched
— running exactly what the fixed seed now runs per applicant:

```
require(entity-service) from the seed path: OK, typeof ensurePersonalIndividualEntity = function
BEFORE user: {"id":"ecd2ec97-f77e-4838-8f2a-367de959e84a","role":"HEALTH"}
BEFORE memberships: 0
AFTER role: health
ensurePersonalIndividualEntity -> {"entityId":"e87594a7-…","fresh":true,"displayName":"สมหญิง ปลูกดี"}
AFTER memberships: [{"entityId":"e87594a7-…","role":"OWNER","status":"ACTIVE"}]
```

The full `node prisma/seed-gacp.js` was deliberately NOT run: sections 4-6 rewrite
sample applications, ERP fixtures and an active certificate in a database another
agent is working in. The applicant section is proven above, function for function.

### The walk now continues — steps 5-9 are reachable

Same UAT farmer, real browser, real `:3000` → `:8000` stack (backend code
unchanged), fresh UI login. Raw: `W4-after/w4-ui-proof.txt`, screenshots in
`W4-after/`:

```
LOGIN: ok http://localhost:3000/health/dashboard
STEP2_URL: .../new/step/2
STEP2_FILE_INPUTS_FILLED: 3
STEP2_HAS_UPLOAD_ERROR: false          ← was 3× "Failed to upload draft document"
STEP2_UPLOADED_COUNTER: 3/3 อัปโหลดแล้ว ← was 0/3
STEP2_NEXT_DISABLED: false             ← was disabled
STEP3_URL: .../new/step/4
STEP3_HAS_WORKSPACE_BANNER: false      ← was a permanent red "โหลดพื้นที่ทำงานไม่สำเร็จ"
STEP3_HAS_UPLOAD_ERROR: false
STEP4_URL: .../new/step/5              ← the step the walk could not reach
STEP4_IS_STILL_APPLICANT: false        ← the URL-skip guard no longer bounces
```

`w4-step4-reached.png` shows step 5 **สถานที่ปลูกและแปลง** rendering its five
sections (farm basics, GPS, water source, plots, land-title documents), with
steps 1-3 ticked green in the stepper. The walk's headline finding — "there is
currently no way to reach steps 5 through 9" — no longer holds.

## 10. Not fixed here (follow-ups)

- `inline-document-upload.tsx` renders a failed upload as attached
  (`setFile()` before the request, no rollback) — the reason step 3 failed
  silently while step 2 failed loudly. Separate FE fix.
- The seeded officer accounts in any already-seeded DB keep their legacy role
  strings until something repairs them; while they do, they are invisible to
  the canonical-only filters b4ac86bf narrowed (reviewer/scheduler/accountant
  notification fan-out). A re-seed now repairs the SPELLING safely (§11), but
  a re-seed is not a targeted repair tool — it reloads sample applications,
  ERP fixtures and a certificate too, so it is an operator decision on a live
  database, not a fix to reach for per account.
- Which side of the Tier-16 ACCOUNT split the seeded finance officer belongs
  to (`account_dtam` vs `account_platform`) is still undecided: the fixture
  creates the legacy union role `account` on a fresh DB and the seed refuses
  to touch an already-split row. Operator call, recorded by
  `scripts/migrate-account-role.js` (§11).
- `safeErrorMessage`'s allowlist is English-only, so ANY thrown Thai
  user-facing message is scrubbed to a generic fallback. Worked around here via
  the error code; the general case is still a hole.


---

## 11. Fix round — review of 416809bf (2026-08-22)

Engineering approve, security approve with one required fix. Both findings were
correct; neither is about the root cause, both are about the repair mechanism.

### REQUIRED — the seed could revert an audit-logged operator decision

`role` was in all three upsert `update:` clauses so a re-seed would repair rows
holding pre-`20260801000000` spellings. **An upsert update is unconditional**, and
the finance fixture names the legacy union role `'account'`. On any database where
`scripts/migrate-account-role.js` had already split ACCOUNT into ACCOUNT_DTAM /
ACCOUNT_PLATFORM — one audit-logged decision per account — the next
`node prisma/seed-gacp.js` would have silently reverted it, no audit row, nothing
in the output to notice. The reviewer is right: that is a worse defect than the
one being fixed, because it destroys information instead of withholding it.

Fixed by narrowing the repair to what it honestly is — **a spelling repair**:

- `role` removed from **every** `update:` clause (applicants, admin, officers).
- New pure module **`apps/backend/shared/role-spelling-repair.js`**.
  `resolveRoleSpellingRepair(storedRole, seedRole)` returns a value to write only
  when the stored value normalises to the **same** canonical role the fixture
  names and merely spells it the old way. A value that normalises to a
  *different* canonical role (a migrated split, a deliberate promotion) or does
  not normalise at all (unknown / quarantined) returns `null` — reported in the
  seed's log line, never overwritten.
- `repairSeededUserRow()` in the seed applies it per account, after the upsert.

`'account'` stays the value the fixture CREATES on a fresh database, with a
comment saying why: which side of the Tier-16 split this officer belongs to is an
operator decision recorded by the migration script, not something a seed should
decide silently. That is now a documented operator follow-up rather than a silent
guess — and it can no longer regress a migrated row either way.

### NIT — the seed could abort on one bad row

`ensurePersonalIndividualEntity` was called bare, and `organizationId` was never
repaired, so a pre-Phase-D row with a null `organizationId` threw
"user.organizationId is required" and took the whole seed down — admin, officers
and every fixture after it. Fixed twice over: `repairSeededUserRow` fills a null
`organizationId` from the seeded org, and the entity ensure is caught per account
and printed next to the account it belongs to (visible, not fatal).

### Remediation text corrected

`error-codes.js` `APPLICANT_ENTITY_MISSING` and §10 above no longer recommend a
blind full re-seed as a fix for one account. They point at the `/entities/mine`
self-heal for a single user and `scripts/backfill-entities.js` for a batch, and
say explicitly not to use the seed for this — it reloads fixtures unrelated to
the account in question.

### RED → GREEN (fix round)

The new guard test run against the **reviewed commit's** seed
(`git show 416809bf:apps/backend/prisma/seed-gacp.js`):

```
RED CHECK against committed 416809bf — update: clauses found = 10
  OFFENDER ->  update: { password: applicantPw, … role: CANONICAL_ROLES.HEALTH, }
  OFFENDER ->  update: { password: adminPw,     … role: CANONICAL_ROLES.ADMIN, }
  OFFENDER ->  update: { password: officerPw,   … role: o.role, }
offending clauses = 3 => test WOULD HAVE FAILED (RED)
try/catch around ensurePersonalIndividualEntity present = false
organizationId repair present = false
```

GREEN after the fix — the five W4 suites plus the role/seed guards:

```
role-spelling-repair-never-reverts-a-split.test.js   (new — 13 cases)
wizard-blocked-by-missing-personal-entity.test.js
entity-mine-self-heal.test.js
role-filters-canonical-only.test.js
applications-submit-capability-gate.test.js
error-codes-catalog.test.js
seed-officer-roles-canonical.test.js
Test Suites: 7 passed, 7 total   Tests: 89 passed, 89 total
```

The new suite pins the exact regression the reviewer found — *"a migrated
ACCOUNT_PLATFORM row survives a re-seed unchanged"* — plus ACCOUNT_DTAM,
promotions, unknown/quarantined values, and the source-level contract that no
`update:` clause writes `role` and that every account goes through the guard.

### Files added/changed in this round

```
apps/backend/shared/role-spelling-repair.js                                  NEW
apps/backend/prisma/seed-gacp.js                                             guarded repair, resilient ensure
apps/backend/shared/error-codes.js                                           remediation text
apps/backend/__tests__/unit/role-spelling-repair-never-reverts-a-split.test.js  NEW
apps/backend/__tests__/unit/wizard-blocked-by-missing-personal-entity.test.js   re-pinned to the guarded contract
reports/design-cleanup-2026-08-21/W4-wizard-upload-root-cause.md             this section
```
