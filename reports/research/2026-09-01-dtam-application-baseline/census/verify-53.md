# verify-53 — skeptic check: varieties passthrough (PlantVariety[])

Item under challenge (census proposal):
- Behaviour: `varieties` — `PlantVariety[]` carried through the production step with no editing UI ("PlantVariety[] ถูก carry ผ่านโดยแก้ไขไม่ได้ในหน้านี้")
- File: `apps/web-app/src/app/health/applications/new/_steps/steps/production-info-step.tsx:67`
- Census verdict: **CUT** — "ช่องเก็บชื่อพันธุ์ซ้ำซ้อนกับ seedSources[].varietyName — รวมเหลือแถว ข้อ ๓ ชุดเดียว" (dtamRef ส่วนที่ ๒ ข้อ ๓)

## Verdict: UPHELD — CUT

## What was checked (refutation attempts)

1. **Does DTAM ask for a variety list?** Yes — facts.md §1 ส่วนที่ ๒ ข้อ ๓: เมล็ด (ชื่อพันธุ์ · นำเข้า/ในประเทศ · แหล่งที่มา · ปริมาณ) · ส่วนอื่นที่ไม่ใช่เมล็ด (สายพันธุ์ · แหล่งที่มา · ปริมาณ). But the form asks for **one** table, and the wizard already implements it as the editable seedSources rows: `production-info-seed-sources-panel.tsx:104-124` (ชื่อสายพันธุ์ `varietyName`, ประเภทสายพันธุ์ `strainType`, แหล่งภูมิศาสตร์ `geoOrigin`, plus supplier/certificate/ภพ.4 slots). This item is a **second, parallel structure for the same legal table** — the DTAM row does not require it twice, and ruling 2 (facts.md §4: ความเกินคือปัญหา) says the surplus copy goes.
2. **Is the passthrough live UI at all?** No. `production-info-step.tsx:67` destructures no setter (`const [varieties] = useState<PlantVariety[]>(state.productionData?.varieties || [])`) and repo-wide grep of `apps/web-app/src` finds no component that creates or edits a `PlantVariety` — the only references are the type (`hooks/domain-types.ts:258`), the `ProductionData.varieties` field (`domain-types.ts:280`), and this step's load/save pair (`:67-68`, `:252`). For any application started in the current UI the array is always `[]`; it can only re-save what a legacy draft carried.
3. **Does anything downstream depend on it as the primary source?** No — the display layer already unified the two:
   - `components/application/application-document-view.tsx:268-272` reads `seedSources` first and falls back to `varieties` **only when seedSources is absent** (legacy drafts); `:537` renders `seed.varietyName || seed.name` in one merged ข้อ ๓ table.
   - `_steps/steps/review-step-helpers.ts:323-324` ("จำนวนสายพันธุ์ที่บันทึก" / "ชื่อสายพันธุ์ที่บันทึก") reads only `varieties` — always `0` / empty for anything typed in the current UI. These are dead review rows that go with the cut.
   - `provider/applications/[id]/print/client-view.tsx:341` renders ชื่อสายพันธุ์ from the scalar `productionData.varietyName`, which `domain-types.ts:281` itself marks "Deprecated but kept for compatibility" — same legacy family, not a basis.
4. **Any other named Thai-law/ministry basis for a separate variety list at application time?** None found:
   - `docs/requirements/dtam-implementation-progress.md:16` and the dtam-* analyses map พันธุ์พืช + เอกสาร + ภพ.4 to **SeedSource** — the repo's own DTAM mapping already treats seedSources as the ข้อ ๓ implementation.
   - หนังสือรับรองสายพันธุ์ as a required attachment exists only for kratom (`apps/backend/prisma/seed-plants.js:191`, plantCode 'KRA'; `docs/requirements/plant-document-comparison-matrix.md:40`) — out of scope under operator ruling 5 (cannabis only), and the cannabis seed-certificate slot already lives on the seedSources row (`certificateNo`/`certificateFile`).
   - `apps/backend/validation/application-schemas.js:91-102` (legacy phase-1 step 2, single `strain_name`) is the platform's own old schema — one scalar, not a second list, and not a legal citation.
   - `apps/backend/prisma/schema/cultivation.prisma:24,139` variety fields belong to post-certificate planting-cycle/traceability records — facts.md §3 puts cultivation records at audit day, not application day, so no MOVE_TO_AUDIT reading either (facts.md §3 names no variety register at all).

## Caveat for the consolidation (does not rescue this item)

กทล.1 ข้อ ๓ asks **ปริมาณ** and **นำเข้า/ในประเทศ** per seed variety. The dying `PlantVariety` carried `{quantity, sourceType: 'SELF'|'BUY'|'IMPORT'}` (`domain-types.ts:258-264`), while the surviving `SeedSource` (`production-info-types.ts:19-37`) has **no explicit ปริมาณ field and no นำเข้า/ในประเทศ flag** — its `sourceType` holds propagation type (panel `:71-78` uses `PROPAGATION_OPTIONS`) and `geoOrigin` is free text. The merged "แถว ข้อ ๓ ชุดเดียว" must gain ปริมาณ + นำเข้า/ในประเทศ on the seedSources row, or the cut orphans two DTAM-required data points. That is a note on the seedSources KEEP row, not a reason to keep an invisible duplicate array that no user can fill.

## Why not KEEP / REWORD / OPTIONAL

- KEEP would preserve two parallel structures for one legal table — contradicts ruling 1 (required set = กทล.1 exactly) and ruling 2; and this copy has no edit surface, so it cannot even satisfy ข้อ ๓ for a new applicant.
- REWORD needs a rendered label to fix; this is invisible state, nothing to reword.
- OPTIONAL is for user-facing nice-to-haves; dead plumbing is not one.

## Conclusion

ข้อ ๓ variety data is required, but its home is the single editable seedSources row set the census keeps; the `PlantVariety[]` passthrough is an uneditable duplicate with no independent DTAM row and no other citable Thai-law basis. **CUT is correct**, with the consolidation caveat above (ปริมาณ + นำเข้า/ในประเทศ must land on the surviving seedSources row).
