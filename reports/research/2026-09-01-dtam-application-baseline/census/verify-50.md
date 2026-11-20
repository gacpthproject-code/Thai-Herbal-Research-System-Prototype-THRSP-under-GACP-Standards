# verify-50 — SKEPTIC check: "irrigationType (hidden)" (production-info-step) — proposed CUT

Date: 2026-09-01 · Checker: skeptic subagent (read-only census)
Item under challenge (production.md row A4):

> {"name":"irrigationType (hidden)","kind":"field","file":"apps/web-app/src/app/health/applications/new/_steps/steps/production-info-step.tsx","line":57,"currentTh":"ไม่ render ใน step นี้ — seed จาก farmData (DRIP/SPRINKLER/MANUAL/FLOOD)","verdict":"CUT","dtamRef":"ruling 2"}

Mandate: refute the CUT if any named Thai-law or ministry-system basis requires
irrigation-system type at APPLICATION time for cannabis. Vibes/"useful for review"
do not count.

## 1. What the code actually does (re-read this session)

`production-info-step.tsx`:
- :23-24 — `IrrigationType` union + `IRRIGATION_VALUES = ['DRIP','SPRINKLER','MANUAL','FLOOD']`
- :26-29 — `normalizeIrrigationType()` guard
- :57-60 — on first load (no stored draft) the default form state seeds
  `irrigationType` from `state.farmData?.waterSourceDetail?.irrigationType`
- No render surface, no label, no handler for it anywhere in this step
  (`ProductionInfoPanels` receives `formData`; the irrigation key is carried only
  as state) — and :249-258 persists it into `productionData` via `setProductionData`.

So the item is exactly as censused: a hidden pass-through field, Thai label
"ไม่ render ใน step นี้", values DRIP/SPRINKLER/MANUAL/FLOOD.

## 2. DTAM baseline (facts.md re-read in full)

1. **§1 ส่วนที่ ๒** is declared exhaustive ("ทั้งหมดที่ฟอร์มขอ ไม่มีมากกว่านี้",
   facts.md:20-25): วัตถุประสงค์ · ลักษณะพื้นที่ · ชื่อสถานที่ · ข้อมูลแปลง
   (เอกสารสิทธิ์, การถือครอง, ขนาด, พิกัด, ปริมาณปลูก) · พันธุ์/ส่วนของกัญชา.
   **No irrigation/water-system field.**
2. **§2 A1-A8** (facts.md:32-43): no irrigation attachment. Irrigation *practice*
   is content that lives INSIDE A5 (แผนการผลิต) and A8 (SOP) — documents the
   applicant uploads whole; the form nowhere asks a structured irrigation-type
   question. This matches the census note verbatim.
3. **จนท. checklist** (facts.md:55-57): no irrigation row.
4. **Rulings 1-2** (facts.md:67-68): required set = กทล.1 ส่วนที่ ๓ exactly;
   anything beyond DTAM's ask = ตัด.

## 3. Repo search for any OTHER named-law basis (the refutation attempt)

1. `docs/requirements/dtam-requirements-analysis.md:22` marks "รูปแบบการให้น้ำ"
   as 🟡 ต้องเพิ่ม — but its own header (:6) says the source is
   "จากคอมเมนต์/บรีฟ" — an unnamed briefing, no กฎกระทรวง/ประกาศ/form cited.
   Same for `dtam-implementation-final.md:125` and
   `dtam-implementation-status.md:18-22`. These are the platform's pre-baseline
   gap analyses; the operator's 2026-09-01 rulings (facts.md §4) supersede them
   and pin the set to กทล.1 exactly. Not a legal basis.
2. `data/standards/gacp-thailand.json:151-165` — "การให้น้ำ" appears as an
   **audit standard** requirement whose evidence is "บันทึกการให้น้ำ,
   แผนภูมิระบบน้ำ" — i.e. record-keeping shown on inspection day, the very
   category facts.md §3 assigns to วันตรวจ ณ แปลง, not วันยื่น. Supports the
   cut, does not refute it.
3. `apps/backend/validation/application-schemas.js:213` —
   `irrigation_method: requiredString('วิธีการให้น้ำ')` in `step6Schema`. This is
   **platform-authored** wizard validation, not a cited law; the same schema
   (:215-216) also requires soil/water analysis dates, which facts.md §3
   explicitly says are NOT application-time documents ("ผลตรวจน้ำ/ดิน …
   ไม่ใช่เอกสารบังคับตอนยื่น") — demonstrating this schema over-asks and is
   itself census target material, not authority.
4. `apps/backend/prisma/schema/farm.prisma:49` `irrigationType String?` — an
   optional DB column; storage is not a legal requirement.
5. Grep across docs/, apps/backend/constants, shared/, prisma for
   irrigation-adjacent Thai law: no named กฎกระทรวง/ประกาศ/พ.ร.บ. clause found
   that makes irrigation-system type an application-day field for cannabis.
6. Sibling check **verify-45** already upheld CUT on the *visible* farm-level
   counterpart (`farm-info-form-sections.tsx:327-333`, the very
   `waterSourceDetail.irrigationType` this hidden field seeds from), after the
   same named-law sweep. Cutting the source Select and keeping a hidden copy of
   its value would be incoherent.

## 4. Vocabulary check — is CUT the right word (not MOVE_TO_AUDIT/OPTIONAL)?

- MOVE_TO_AUDIT is for items facts.md §3 names as audit-day **evidence**
  (records, logs). §3 names บันทึกการให้น้ำ-type records, but this item is not a
  record-upload slot — it is a structured enum field silently persisted into the
  application payload. There is no audit surface to move a hidden seed to.
- OPTIONAL would still surface it; it is not surfaced at all and counts for
  nothing already — the honest disposition of a field with no DTAM basis is CUT
  (delete the seed at :57-60 and the type plumbing at :23-29 together with the
  farm-level Select cut in verify-45, one coherent removal).

## 5. Verdict

| # | Item | file:line | UI shows | Verdict | Citation |
|---|---|---|---|---|---|
| 1 | irrigationType (hidden state field, seeded from farmData) | production-info-step.tsx:23-29, 57-60 | ไม่ render ใน step นี้ (DRIP/SPRINKLER/MANUAL/FLOOD) | **CUT — UPHELD** | facts.md §1 ส่วนที่ ๒ (exhaustive, no irrigation field) + §2 A1-A8 (no irrigation attachment; practice content belongs inside A5/A8 documents) + rulings 1-2; no named Thai-law basis found in repo (§3 above); consistent with verify-45 on the source Select |

upheld = true. No correction to the census row.
