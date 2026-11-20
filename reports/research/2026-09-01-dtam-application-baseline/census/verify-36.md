# verify-36 — SKEPTIC check: `waterSource` (flat state key, no UI) — 2026-09-01

Item under challenge:
- `apps/web-app/src/app/health/applications/new/_steps/steps/farm-info-step.tsx:77` — `waterSource: ''` in the FarmData default state
- Current UI label: (ไม่มี — legacy state key, ไม่มี control ใดผูกกับ key นี้)
- Proposed verdict: **CUT** ("Superseded by waterSourceDetail; no กทล.1 basis either way. Dead key in FarmData.")

## Refutation attempts (all failed)

### 1. Is there a กทล.1 basis?
facts.md §1 ส่วนที่ ๒ is declared exhaustive ("ทั้งหมดที่ฟอร์มขอ ไม่มีมากกว่านี้"): วัตถุประสงค์ · ลักษณะพื้นที่ · ชื่อสถานที่ · ข้อมูลแปลงปลูก (เอกสารที่ดิน/ถือครอง/ขนาด/พิกัด/ปริมาณปลูก) · พันธุ์และส่วนของกัญชา. **No water-source field.** Attachments A1–A8 (facts.md §2): none is a water-source declaration. facts.md §3 goes further: ผลตรวจน้ำ/ดิน/แล็บ **ไม่ใช่เอกสารบังคับตอนยื่น** (กรมปกติไม่ตรวจแล็บ). So DTAM's own baseline places even the strongest water item outside application day.

### 2. Is there another named Thai-law basis in the repo?
- `docs/requirements/dtam-requirements-analysis.md:16-22` claims water source is a DTAM requirement — but its own header says the source is "จากคอมเมนต์/บรีฟ" (line 6), not a named กฎกระทรวง/ประกาศ or the กทล.1 form. Vibes-level under census rules; superseded by facts.md (the coordinator's full-text extract).
- `docs/standards/tas-3502-2561-records-and-traceability.md:29` — มกษ. names water/soil **analysis records**, conditionally ("กรณี...สภาวะเสี่ยง"), as record-keeping — audit-day territory per facts.md §3, and about the test record, not a source-type form field. Not an application-time basis.
- Regex sweep of docs/ for (กฎกระทรวง|ประกาศ|พ.ร.บ.) near แหล่งน้ำ: **no matches.**
- `apps/backend/data/standards/standards-signal-map.js:61,99` maps `farmData.waterSource` into THAI_GACP:GAP Guidelines and FDA:Water Quality gap-analysis signals — the platform's own scoring feature, which per operator ruling 1/2 (facts.md §4: required set = กทล.1 exactly, platform extras = ตัด) counts for nothing at application time.

### 3. Is the key actually dead?
Write side: **yes, dead.** No UI control and no `handleChange('waterSource', …)` anywhere in apps/web-app/src (regex sweep: zero matches for any write to `formData.waterSource`). The key is initialized to `''` at farm-info-step.tsx:77 and never touched again; `handleNext` (line 551) spreads it out still empty. The real UI is `waterSourceDetail` (state at line 135, controls in farm-info-form-sections.tsx:323-382), censused as its own items.

Read side: **not dead — and that strengthens the cut.** Readers of the always-empty flat key:
- `apps/web-app/src/app/provider/applications/[id]/print/client-view.tsx:318` — provider print page renders `renderField('แหล่งน้ำ', farmData?.waterSource)` → always empty for wizard applications (type at print-page-types.ts:72).
- `apps/backend/services/application-service/application-submission-methods.js:81` — copies `farmData.waterSource` into `Farm.waterSource` (nullable column, `apps/backend/prisma/schema/farm.prisma:51`) → always `''`.
- `apps/backend/data/standards/standards-signal-map.js:61,99` — the gap-analysis signal reads a key the wizard never populates, i.e. the signal is **already broken today**.
- Config-string listings: `apps/backend/data/journey-config-matrix.js:10,41,106,151`, `journey-config-standards.js:40`; type decls at `apps/web-app/src/app/health/applications/new/hooks/domain-types.ts:160,245`.
- Distinct surface, not this item: `apps/backend/validation/application-schemas.js:212` `water_source_type` sits in the legacy canonical step6Schema (การเพาะปลูก), a separate census item.

## Verdict

**UPHELD — CUT.** No กทล.1 field, no attachment row, and no named Thai legal instrument anywhere in the repo requires a water-source declaration at application time for cannabis; facts.md §3 explicitly excludes even water test results from the mandatory submission set. The only repo claims to the contrary trace to an unsourced brief. MOVE_TO_AUDIT would be wrong: facts.md §3 does not name "แหล่งน้ำ" — it names water *test results*, which belong to the separate `waterSourceDetail.hasWaterTest`/WATER_TEST items.

Engineering rider for the cutter (does not change the verdict): the cut must also sweep the flat key's readers — client-view.tsx:318, application-submission-methods.js:81, the journey-config strings, domain-types.ts:160/245 — and re-point standards-signal-map.js:61,99 at `waterSourceDetail.sourceType` (or whatever survives for that item), since those signals currently read a field that is never filled.
