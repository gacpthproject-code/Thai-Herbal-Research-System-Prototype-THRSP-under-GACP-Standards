# Task 2 review (r3) — land papers as a satisfaction family + signal-map rename — 2026-09-04

Verdict: **specCompliant = true · qualityApproved = false** (0 blocker, 1 major, 7 minor)

Branch `feat/application-submission-v2`, commit `226a6085` (parent `8ba5a931`). Everything below was
re-run or re-read here.

## Ran

- `cd apps/backend && npx jest __tests__/unit/slot-catalog-v2.test.js __tests__/unit/upload-slot-canonicalisation.test.js __tests__/unit/application-document-slot-supersession.test.js __tests__/unit/standards-signal-slot-rename.test.js --runInBand` → **4 passed, 183 tests passed**, matching `fix3-test-output.txt`. The two new pair cases print as `✓ SPK does not take the slot away from CHANOTE` and `✓ CHANOTE does not take the slot away from NS3`.
- Neighbours, `apps/backend`: `standards-analyzer-service`, `standards-analyze-routes`, `document-analysis-service`, `draft-document-reupload-replaces-slot`, `error-codes-catalog`, `m2a-doc-requirements`, `m2a-doc-requirements-doors` → **7 passed, 84 tests**.
- `cd apps/web-app && npx jest --testPathPatterns "documents-step-slot-file-rules|review-completeness|documents-step-conditional|documents-step-dedupe|client-upload-check" --runInBand` → **6 passed, 55 tests**.
- `npx jest __tests__/unit/upload-slot-canonicalisation.test.js --runInBand` alone → **84 tests**. The RED file reports `Tests: 22 failed, 77 passed, 99 total`; 99 + 84 = 183, so that suite contributed no failing test to the RED (finding 6).
- **Ruling item 1, by running the module**: `CHANOTE→chanote`, `NS3→ns3`, `SPK→spk`, `OTHER_LAND→other_land`, `OTHER→other`; `LAND_TITLE`, `land_title`, `landTitle`, `land_deed`, `LAND_DEED`, `LAND_RIGHTS` all `→land_rights`. Against the parent blob (`git show 8ba5a931:packages/validation/src/upload-rules.js`) all of `CHANOTE/NS3/SPK/OTHER_LAND` folded to `land_rights`. `slotIdSpellings('SPK')` = `['spk']`, `slotIdSpellings('CHANOTE')` = `['chanote']`, so `application-document-sync.js` can release nothing else. **The r2 BLOCKER is dead.**
- **Ruling item 2, by requiring it**: `require('@gacp/validation/satisfaction-families')` from `apps/backend` resolves to `/packages/validation/src/satisfaction-families.js` and exports `{SATISFACTION_FAMILIES, slotsSatisfying, isSlotSatisfied}`; the table is `{"land_rights":["land_rights","chanote","ns3","spk"]}`. `isSlotSatisfied('land_rights',['NS3'])` = true, `('LAND_RIGHTS',['CHANOTE'])` = true, `('land_rights',['OTHER'])` = false.
- **Ruling item 3, first pin, and it is load-bearing**: `FARM_INFO_LAND = ['CHANOTE','NS3','SPK','OTHER']` (`upload-slot-canonicalisation.test.js:362`) is spread into the fence at `:415`; `STEP8_COMMON` at `:343-345` already carries `LAND_TITLE`, which folds to `land_rights`, so under the parent's fold the fence would have reported `land_rights <- CHANOTE + LAND_TITLE` and failed.
- Signal-map sweep in node: **24 document signal pairs, 17 renamed, 9 distinct dead slots** (`SOP_PEST, SOP_HARVEST, SOP_PROCESSING, SOP_STORAGE, SOP_CULTIVATION, LAND_DEED, LAND_CONSENT, SITE_MAP, FACILITY_MAP`) across **10 requirements**, collapsing to **12 distinct (requirement, canonical slot) pairs** — and exactly one canonical collision, `SOP_MANUAL <- SOP_PEST + SOP_HARVEST + SOP_PROCESSING + SOP_STORAGE + SOP_CULTIVATION`.
- Parent-vs-head causation for finding 1: I compiled `git show 8ba5a931:apps/backend/services/standards-analyzer-service.js` through a `Module` wrapper resolved inside `apps/backend/services` (nothing written to the repo) and ran both. Parent: `ASEAN:Pest Control System => NOT_MET`, `WHO:Drying Protocols => NOT_MET`. Head, same single stored `SOP_MANUAL`: both `MET`.
- NUL fix: `git show` blobs through python — parent 21681 bytes / **1 NUL**, head 22193 bytes / **0 NUL**; line 62 is now `` `${row.applicationId}\x00${row.currentForSlot}` ``.
- Brief Interfaces sweep: of the **37** legacy→canon pairs on the Produces line (`task-2-brief.md:10`), **12 deviate** — `CHANOTE, NS3, SPK, OTHER_LAND, INTERIOR_PHOTOS, IND_HOUSE_REG, house-reg, COM_MEMBER_LIST, JUR_DIRECTOR_LIST, director-list, director-id, JUR_DIRECTOR_ID`.
- **L3**: `git show 226a6085 --name-only` matches nothing under `billing|checkout|finance|migration|.env|prisma/`. **L4**: I re-ran `ratchet.sh`'s `count_hardcode` grep loop by hand (no file written) → **33**, against the `AUDIT_LEDGER.md:6` baseline of 36. The one touched file inside the probe's `BIZ_DIRS` scores **0** hardcode hits at both `8ba5a931` and `226a6085`, so `evidence/ratchet-current.txt` moving 30→33 is a stale snapshot being refreshed, not new debt. The diff adds no `TODO|FIXME|HACK|XXX|process.env|.skip|.only|xit|xdescribe` line. `git status --porcelain` empty after my work.
- Shared DB, **SELECT only** (`$queryRawUnsafe`, no writes, no migrate): `application_documents` = 312 rows / 30 distinct `documentType`; of the slots at issue only `CHANOTE` (14 rows) and `SOP_MANUAL` (8 rows) exist — no `NS3`, `SPK`, `OTHER`, `OTHER_LAND`, `LAND_RIGHTS`, or legacy `SOP_*` rows. `requirement_rules` = 2 rows (`community_cert`/COMMUNITY_ENTERPRISE, `company_reg`/JURISTIC), both open; **no `land_rights` rule is in force**.

---

## Findings

### 1. MAJOR — canonicalising the map side makes one SOP file report two requirements MET
`apps/backend/services/standards-analyzer-service.js:126` (map side: `apps/backend/data/standards/standards-signal-map.js:41` and `:73`)

The r2 MAJOR was fixed the way r2 prescribed — `canonicalDocumentType` at `:50`, applied at `:126`,
`:145` and `:223` — and that genuinely revives 17 dead (requirement, slot) pairs. But five slots the
signal map names as separate evidence all fold onto one canonical id. My sweep found exactly one
collision in the whole map: `SOP_MANUAL <- SOP_PEST + SOP_HARVEST + SOP_PROCESSING + SOP_STORAGE +
SOP_CULTIVATION`. Two of those signals are **primary** (`docs`, the MET tier): `WHO:Drying Protocols`
(`:41`, `docs: ['SOP_HARVEST','SOP_PROCESSING','SOP_STORAGE']`) and `ASEAN:Pest Control System`
(`:73`, `docs: ['SOP_PEST']`, no `docsSecondary`, no form signal). At the parent the comparison was
raw-string, so neither ever fired; now either one fires off any single SOP file.

Failure scenario, on the only path the wizard offers: `documents-step-config.tsx:298` renders exactly
one SOP control (`id: 'SOP_MANUAL'`, required), so every applicant attaches one คู่มือ/SOP.
`deriveDocumentType` stores it as `SOP_MANUAL`. Provider staff open the gap analysis
(`routes/api/certificates/standards.js:73` → `standard-analyze-view.tsx:189-190`) and read
`ASEAN:Pest Control System = MET`, whose own recommendation (`standards-signal-map.js:74`) asks for a
documented vector-control programme with แผนผังจุดวางเหยื่อ and บันทึกการติดตาม — a document the
generic SOP manual's declared scope (`constants/document-slots.js:399`: `ตั้งแต่เตรียมพื้นที่ ปลูก ดูแล เก็บเกี่ยว
จนถึงเก็บรักษาและแปรรูป`) never mentions. The farmer is told a requirement is satisfied for which nothing
was written, so they do not write it.

Reproduced here, real service:

```
--- upload slotId=SOP_STORAGE stored=SOP_MANUAL
    ASEAN:Pest Control System => MET | พบเอกสารหลักฐานหลักในคำขอ: SOP_PEST
    WHO:Drying Protocols      => MET | พบเอกสารหลักฐานหลักในคำขอ: SOP_HARVEST, SOP_PROCESSING, SOP_STORAGE
--- PARENT logic, same stored SOP_MANUAL
    ASEAN:Pest Control System => NOT_MET | ยังไม่พบหลักฐานสำหรับข้อกำหนดนี้ในคำขอ
    WHO:Drying Protocols      => NOT_MET | ยังไม่พบหลักฐานสำหรับข้อกำหนดนี้ในคำขอ
```

Blast radius today: 8 `SOP_MANUAL` rows exist in the shared DB, so eight applications flip to two new
MET verdicts. The new sweep cannot see this — `standards-signal-slot-rename.test.js:66-77` asserts
only positives (`status` by tier, plus `evidence` containing the map spelling) and its single negative
control is `CRIMINAL_BG` (`:79-86`).

Fix: demote the two primary SOP signals now that all five SOP classes are one file — move
`SOP_HARVEST/SOP_PROCESSING/SOP_STORAGE` from `docs` to `docsSecondary` at `standards-signal-map.js:41`
and `SOP_PEST` at `:73` (that entry then has none, like `ASEAN:Waste Management`), so a folded SOP asks
for the officer (NEEDS_REVIEW) instead of asserting compliance. The sweep derives its expectation from
the tier at `standards-signal-slot-rename.test.js:74`, so it stays green. Then add the negative case
the sweep is missing: an upload of `SOP_STORAGE` must not report `ASEAN:Pest Control System` as MET.

### 2. MINOR — the evidence line names documents that are not in the application
`apps/backend/services/standards-analyzer-service.js:131` (same shape at `:152`)

`:126`/`:145` now match through `canonicalDocumentType`, but `:131`/`:152` still join
`primaryHits`/`secondaryHits`, which are the **map's** slot names. Before this diff a hit meant the row
literally carried that string, so the sentence was true; now every map spelling that folds onto the one
stored id is listed.

Failure scenario: an applicant attaches one SOP manual and provider staff read
`พบเอกสารหลักฐานหลักในคำขอ: SOP_HARVEST, SOP_PROCESSING, SOP_STORAGE` — three documents claimed on
file where there is one — rendered verbatim at `standard-analyze-view.tsx:189-190`. Same class with a
single retired name: I ran it and got `stored LAND_RIGHTS | THAI_GACP:Farm Registration =>
NEEDS_REVIEW | ...(เอกสารรอง: LAND_DEED)` and `stored BUILDING_PLAN_PHOTOS | FDA:Sanitary Facilities
=> NEEDS_REVIEW | ...(เอกสารรอง: FACILITY_MAP)` — slot ids the wizard no longer renders. Of 19
(requirement, canonical-slot) groups, 3 inflate the count and 9 report a stale alias.

This is display copy, not a decision — `status`, `summary` and `readinessPct`
(`standards-analyzer-service.js:265`, shown only as a tile at `standard-analyze-view.tsx:165`) are
unaffected, and the parent's sentence for the same application was worse ("no evidence found" for a
document that was attached). Fix: join the canonical ids actually present, deduped — e.g.
`[...new Set((mapping.docs||[]).map(canonicalDocumentType).filter(s => documentTypes.has(s)))]` at
`:126`/`:145` — so one file is named once, by the slot the row carries.

### 3. MINOR — the family omits the ruling's `other_land`, and the wizard already counts an `OTHER` land upload as the land right
`packages/validation/src/satisfaction-families.js:51` · `apps/web-app/src/app/health/applications/new/_steps/steps/documents-step-dedupe.ts:88-91`

Ruling item 2 (`task-2-brief.md:84`) enumerates the family as `{land_rights, chanote, ns3, spk,
other_land, land_title}`. What shipped is `['land_rights','CHANOTE','NS3','SPK']`. `land_title` is
covered by the fold; `other_land` is covered by nothing — this diff removed it from the alias group and
did not add it to the family. That specific id is inert (`grep -rn OTHER_LAND` over `.js/.ts/.tsx`
outside `evidence/` returns zero hits, and the DB holds no such row), so the deviation costs nothing on
its own. The live half is the adjacent judgement the module header argues at `:36-41`: the wizard's
fourth land card, id `OTHER` (`options.ts:54`), canon `other`, is deliberately excluded. The client
disagrees in code — `documents-step-dedupe.ts:88-91` adds `LAND_TITLE` to the satisfied set for **any**
`farmData.landDocuments.files` entry with a `fileUrl`, no type filter, and `documents-step.tsx:75-77`
then filters that requirement out of the rendered list.

Failure scenario: a farmer whose only paper is a เอกสารสิทธิ์อื่น ๆ ticks อื่น ๆ and uploads it;
`farm-info-step.tsx:177-180` posts `slotId: 'OTHER'` (accepted — `acceptedTypeForSlot('OTHER')` =
BOTH), it is stored as `OTHER`, and step 8 never asks for the land document again. When T4 wires
`isSlotSatisfied` as `task-4-brief.md:71-78` binds it to, the server answers `land_rights` unsatisfied
for that same application — I ran it: `isSlotSatisfied('land_rights',['OTHER'])` = false. That is a
client-says-ครบ / server-says-ไม่ครบ split for one applicant class. Not live today: `requirement_rules`
holds only `community_cert` and `company_reg`, and the first `land_rights` rule is the unapplied seed at
`scripts/seed-cannabis-requirement-rules.js:122`.

The exclusion is disclosed in the report (`task-2-report.md:344-346`) but nowhere ratified: the three
BINDING carry-over sections state the family as `land_rights | chanote | ns3 | spk`
(`task-4-brief.md:73-74`, `task-6-brief.md:41-44`, `task-7-brief.md:32-35`) and mention neither
`other_land` nor the `OTHER` decision. Fix: record the exclusion in the T4/T7 carry-over with the
module header's reason and a note that T7's single land control must migrate anything filed under
`other`; and either add `OTHER` to the family or teach `documents-step-dedupe.ts:88-91` to hide
`LAND_TITLE` only for land files whose slot is actually in it, so the two sides answer the same
question. Also correct the header claim at `satisfaction-families.js:38-39` that an `OTHER` upload "is
re-asked in the v2 card" — the shipping wizard suppresses that re-ask.

### 4. MINOR — ruling item 3's second pin was not taken even at the level where it was free
`packages/validation/src/satisfaction-families.js:77`

Ruling item 3 joins two pins with AND; the second is "a new requirements-service test asserts a cycle
carrying only an `NS3` upload reports `land_rights` satisfied". No test in the diff touches
`isSlotSatisfied` — the destructure at `upload-slot-canonicalisation.test.js:451-453` takes only
`SATISFACTION_FAMILIES` and `slotsSatisfying`, and a repo-wide grep finds the predicate has **zero
callers and zero assertions**. The service-level version of that test is genuinely T4's (ruling item 2
gives the engine to T4, and `services/application-document-requirements.js:144-149` still tests
`evidence.has(canonical)` with no family), and the deferral is bound in writing at
`task-4-brief.md:77-78` — but the module-level assertion costs two lines and passes today.

Failure scenario: T4 wires `resolveApplicationRequirements` to `isSlotSatisfied` as instructed. Nothing
in the tree asserts the predicate's contract — that it folds the *uploaded* ids before comparing
(`:78-80`) and tolerates an empty list. If a later edit dropped that `.map(getCanonicalSlotId)`, an
application whose land paper is stored as `CHANOTE` (14 such rows exist today) would report
`land_rights` unsatisfied and the farmer would be asked for a document already on the server — with
every suite in the repo still green.

Fix: two lines beside the existing family tests — `expect(isSlotSatisfied('land_rights', ['NS3'])).toBe(true)`
and `expect(isSlotSatisfied('land_rights', ['criminal_bg'])).toBe(false)` — leaving the cycle-level test
as T4's promised addition.

### 5. MINOR — two of the four new family pins cannot fail
`apps/backend/__tests__/unit/upload-slot-canonicalisation.test.js:455` (and `:471`)

`SATISFACTION_FAMILIES` is built at `satisfaction-families.js:46-57` by mapping every member through
`getCanonicalSlotId` and de-duplicating with `new Set`, so by the time a test can read the table every
member is already canonical and already distinct. `:455` ("a family is not a fold: every member is its
own canonical slot") re-canonicalises and hunts for duplicates — impossible after a Set of canonical
ids. `:471` asserts `getCanonicalSlotId(member) === member`, true for any idempotent fold and already
pinned separately at `:311-316`. The report bills these as the pins "that a family is not a fold"
(`task-2-report.md:347-348`), and `task-6-brief.md:44` / `task-7-brief.md:35` point implementers at this
block as the fence.

Failure scenario, run here: I replicated the module's construction verbatim with a colliding member
list `['land_rights','CHANOTE','LAND_TITLE','land_deed','NS3']` — it builds as
`{"land_rights":["land_rights","chanote","ns3"]}` (two declared members silently vanish) and both
shipped assertions return PASS. So a future task that lists two spellings of one paper as family
members, or adds a second family whose members were folded together in the same commit, gets a green
fence. Only `:477` is load-bearing, and it is hardcoded to `land_rights`.

Fix: assert against the **raw** declaration — export the pre-normalised member literals (or fold at
lookup time) so the test can check that no two declared members share a canonical id; that is the
property the T6/T7 carry-over relies on, and the construction erases it before the test can see it.
Then delete `:471`, which duplicates `:311-316`.

### 6. MINOR — the fence pin the ruling named has no RED artifact; one of the four RED suites never ran
`evidence/appv2-task-2/fix3-red-a.txt:568-570` (headline claim at `task-2-report.md:372`)

The RED is presented as "4 suites, 22 failed / 99". Three suites produced genuine behavioural failures
against unmodified production code — I counted the `✕` lines: 17 standards-signal, 2 supersession pair
cases, 3 slot-catalog fold assertions = 22. The fourth, `upload-slot-canonicalisation`, produced **zero**
failing tests: `● Test suite failed to run — Cannot find module '@gacp/validation/satisfaction-families'`.
That suite is exactly where ruling item 3's fence pin lives (`FARM_INFO_LAND` at `:362`, used at `:415`),
so the change the ruling named as the pin has no failing artifact behind it. The arithmetic is honest
(99 + the suite's 84 tests = 183 green), but the headline reads as four suites failing on behaviour.

Failure scenario: a gate reviewer accepts "4 red → 4 green" as proof the fence addition was RED-first.
It was not executed against the old fold at all; had `FARM_INFO_LAND` carried a misspelled id (which
folds to itself and can never collide), the suite would have gone green on the first run and nobody
would know. The pin is in fact sound — I confirmed against the parent blob that `CHANOTE` and
`LAND_TITLE` both folded to `land_rights` there, so the fence would have failed — but that is my
reconstruction, not the artifact's.

Fix: say in the report that the fourth suite's RED is a module-resolution error, and attach a second RED
capture of the fence alone (run against the parent's `upload-rules.js`, or with the new module stubbed).

### 7. MINOR — three numbers/citations in the report and the carry-over briefs do not match the tree
`/home/ubuntu/work/appv2-briefs/task-2-report.md:339` · `:353` · `/home/ubuntu/work/appv2-briefs/task-4-brief.md:83`

Three L1 nits, all verified by reading the cited lines:

1. `task-2-report.md:339` cites the reverted group at `upload-rules.js:321-331`. Line 321 is
   `// if one of them is folded early is` and line 331 is `// while both chips stayed green. Only the
   SPELLINGS of the slot itself fold in`; the group literal is at **`:334-335`**. The diff's own 11 new
   comment lines pushed it down and the number was carried over from r2.
2. `task-2-report.md:353` says "RED showed **12 dead signals**". 12 is a real count — I measured 12
   distinct (requirement, canonical slot) pairs among the renamed signals — but the RED it cites shows
   **17** failing signal cases across 9 distinct slots and 10 requirements. The unit is not stated, so
   the number and its artifact disagree.
3. `task-4-brief.md:83` records "The **11** legacy ids that do not fold" and then names 12 (nine ids
   plus `CHANOTE`/`NS3`/`SPK`); `task-2-report.md:360` repeats "11". My sweep of the brief's Produces
   line also measures 12 — but a different 12: the accepted list adds `COM_TVC03` (never on the Produces
   line) and omits `OTHER_LAND` (which the Produces line did name, and which now folds to itself and
   matches nothing).

Failure scenario: the coordinator opens `upload-rules.js:321-331` to verify the blocker fix and finds
comment prose; T6/T7 work an accepted-deviation list that is missing the one id the brief promised
would count. Fix: cite `:334-335` for the group, state the unit and the measured figure for the signal
count, correct 11→12, and add `OTHER_LAND` to the accepted list with a line saying no surface writes it.

### 8. MINOR — an existing passing test's fixture silently changed meaning
`apps/backend/__tests__/unit/standards-analyzer-service.test.js:103`

The test at `:103-113` feeds `documents: [{ documentType: 'SOP_PEST' }]` and asserts only that
`Pesticide Residues` is NEEDS_REVIEW. That still holds — but in the same `result` object the WHO
standard's third requirement, `Drying Protocols` (`whoStandard()` at `:53`), moved from NOT_MET to MET,
because `:223` now canonicalises the fixture to `SOP_MANUAL`. I ran both: `PARENT fixture
{documentType:SOP_PEST} -> Drying Protocols: NOT_MET` / `HEAD ... : MET | พบเอกสารหลักฐานหลักในคำขอ:
SOP_HARVEST, SOP_PROCESSING, SOP_STORAGE`. Nothing asserts it, so the suite goes green over the
behaviour change finding 1 is about.

Failure scenario: whoever fixes finding 1 by re-tiering the SOP signals sees no failure here and gets
no signal that this suite ever covered the case; a later reader takes `:103` as the pin for "an SOP is
secondary-only evidence", which it no longer is. Fix: add the sibling assertion for `Drying Protocols`
to that test so the chosen tier is pinned where a reader looks for it, and note in the name that
`SOP_PEST` is a legacy row the upload path can no longer write.

---

## Notes that are not findings

- **Ruling item 1 is satisfied exactly.** The group at `upload-rules.js:334-335` is the slot's own
  spellings only. Nothing forbidden was folded, and I proved the destruction is gone at the door rather
  than trusting the tests: `slotIdSpellings('SPK')` = `['spk']`, so `application-document-sync.js`
  releases nothing else, and the two new supersession pair cases pass.
- **Ruling item 2 is satisfied in substance.** It is a real shared module with its own package export
  subpath, importable from both apps (`apps/web-app/jest.config.mjs` maps `^@gacp/validation/(.*)$` to
  the same directory), and it is genuinely off the upload path — no runtime code requires it — which is
  the property the ruling was buying: listing a paper there can never delete another one. The one
  enumerated member missing is finding 3.
- **Ruling item 3's second pin is the reason I nearly failed spec compliance, and did not.** Taken
  literally the ruling asks for a requirements-service test in this pass; taken with item 2 (which
  assigns the engine and the family's consumer to Task 4), that test cannot be written in T2 without
  doing T4's work, since the engine does not read the family. The deferral is recorded in a BINDING
  carry-over at `task-4-brief.md:71-78`, restating the ruling's NS3 assertion verbatim as T4's
  obligation, together with the sequencing pin at `:79-82` (do not let the T3 seed `--apply` run before
  T4 wires the family). I read that as item 3 met to the limit of T2's scope, with the remainder tracked
  rather than dropped — hence `specCompliant = true`, and finding 4 for the module-level assertion that
  was free and not taken. **If the coordinator reads item 3 strictly, this call flips.**
- **Ruling item 4 is met**, and the fix is the one r2 prescribed word for word ("canonicalise both
  sides… that also revives the `SOP_*` and `FACILITY_MAP` signals"). 17 dead pairs now fire. Null safety
  is intact: `getCanonicalSlotId(undefined|null|'')` returns `''`, which `:224`'s `.filter(Boolean)`
  drops, so a null `documentType` still cannot crash `analyzeApplication`. Finding 1 is that the
  prescribed fix over-matches on the one collapsed group, not that the fix was wrong in kind.
- **A second lens filed the SOP behaviour as "five distinct SOP slots made interchangeable" and that
  framing was refuted, correctly.** The `sop_* → sop_manual` fold pre-exists this diff (it is at
  `upload-rules.js:353-360` and identically at the parent), no surface offers a `SOP_PEST`/`SOP_STORAGE`
  upload control, and `routes/api/applications/validation.js` already treats the five as interchangeable
  through `hasUploadedSlot`. What survives, and what finding 1 reports, is narrower: the analyzer was
  the last reader still disagreeing with the platform's own fold, and the fix moved it from
  never-firing to firing at the **MET** tier for a topic (`Pest Control System`) the surviving document
  does not claim to cover.
- **A lens also filed "nothing reads the satisfaction family" as a MAJOR; that was refuted** and I agree
  — a family with no T2 consumer is the ruling's own design (item 2, "cleaner" option), the plan assigns
  `application-document-requirements.js` to Task 4, and the wizard behaviour it leans on
  (`documents-step-dedupe.ts`) is untouched by this diff, which contains zero `apps/web-app` files. The
  live residue is findings 3 and 4.
- **A sixth upload surface exists that the fence does not know about**, and it is not this diff's:
  `apps/mobile-app/lib/presentation/features/application/screens/wizard_steps/step_7_documents.dart:79`
  posts `slotId: doc.label` — Thai label sentences as slot ids — to the same `/applications/draft-documents`
  door. No collision with any web id (each label folds to its own canonical), so nothing is destroyed;
  but the fence's header claims "every upload control the wizard renders", and it means the web wizard.
  Worth a line in the fence header and a defect against whoever owns the mobile wizard.
- **`OTHER_LAND` is dead in code and in data**, which is why finding 3 is a MINOR and not a MAJOR: zero
  code references, zero rows in a 312-row `application_documents` table.
- **Laws.** L3: no diff under `services/billing`, `services/checkout` or `routes/api/finance`, no
  migration folder, no `.env`. L4: hardcode 33 vs the `AUDIT_LEDGER.md:6` baseline of 36 — no rise, and
  the `evidence/ratchet-current.txt` 30→33 is a stale-file refresh (the sole touched file inside the
  probe's `BIZ_DIRS` scores 0 hardcode hits at both revisions). Status vocabulary in the report
  (`DONE(probe:ratchet)`, `Blocked: -`) is in-vocabulary.
- **MINOR 4 from r2 is fully closed**: the committed blob carries 0 NUL bytes, `:62` is `\x00`, and the
  file is text again going forward (this commit's own `--numstat` still shows `- -` only because the
  *parent* blob is binary).
- **Not run here, and it must run at the batch gate**: the DB-writing suites (`m2a-requirement-seed`,
  `m2a-submit-enforcement`). The database is shared with production; I ran SELECT-only queries and no
  suite that writes.