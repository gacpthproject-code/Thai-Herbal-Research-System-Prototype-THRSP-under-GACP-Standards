# verify-45 — SKEPTIC check: "water irrigationType" (farm-info wizard) — proposed CUT

Item under challenge (census proposal, farm.md row 34): field at
`apps/web-app/src/app/health/applications/new/_steps/steps/farm-info-form-sections.tsx:327-333`,
UI shows "ระบบให้น้ำหลัก (ระดับฟาร์ม)" — น้ำหยด/สปริงเกลอร์/รดน้ำด้วยมือ/ท่วมขัง, verdict CUT.

Role: skeptic — tried to REFUTE the cut by finding any named Thai-law or
ministry-system basis requiring irrigation-system type at APPLICATION time for cannabis.

## Verdict: **UPHELD — CUT**

## 1. The item's full surface (this field and everything it renders)

Labels resolved from `apps/web-app/src/lib/i18n/dictionaries/sections/th-wizard.ts`
and `apps/web-app/src/constants/options.ts`.

| # | Surface | file:line | Current Thai label | Verdict | Citation |
|---|---|---|---|---|---|
| 1 | Select ระบบให้น้ำหลัก (not required; no conditional branches) | farm-info-form-sections.tsx:327-333 · th-wizard.ts:474 | "ระบบให้น้ำหลัก (ระดับฟาร์ม)" / placeholder "เลือกระบบให้น้ำ" | CUT | facts.md §1 ส่วนที่ ๒ is exhaustive ("ทั้งหมดที่ฟอร์มขอ ไม่มีมากกว่านี้") — no irrigation/water field; §2 A1-A8 — no irrigation attachment; ruling 1-2 (required set = กทล.1 exactly, เกิน = ตัด). |
| 1a | option DRIP | options.ts:34 | "ระบบน้ำหยด (Drip)" | CUT | Falls with parent. |
| 1b | option SPRINKLER | options.ts:35 | "สปริงเกลอร์ (Sprinkler)" | CUT | Falls with parent. |
| 1c | option MANUAL | options.ts:36 | "รดน้ำด้วยมือ (Manual)" | CUT | Falls with parent. |
| 1d | option FLOOD | options.ts:37 | "ท่วมขัง (Flood)" | CUT | Falls with parent. |

The Select renders unconditionally inside the water section for every applicant
type, plant, and area type — no conditional branch narrows it (the section's only
conditional, otherSourceType at :336-350, belongs to the sibling sourceType field,
censused in verify-43). The value binds to `waterSourceDetail.irrigationType`.

Cross-file surfaces carrying the same field (for the coordinator's cut list, censused
elsewhere): `application-document-edit-config.ts:94` (officer/edit view, label
"ระบบให้น้ำ", same IRRIGATION_OPTIONS) and the review-step water block
(review-step-helpers-core.ts, noted in verify-43). options.ts:32 claims the constant
is "ใช้ทั้ง farm-info-step และ production-info-step" — production's irrigation surface
is in the production census, not this item.

## 2. Refutation attempts — all failed

1. **กทล.1 itself** — facts.md §1 ส่วนที่ ๒ (the exhaustive list: วัตถุประสงค์,
   ลักษณะพื้นที่, ชื่อสถานที่, เอกสารที่ดิน/การถือครอง/ขนาด/พิกัด/ปริมาณการปลูก, พันธุ์):
   no irrigation field. §2 attachments A1-A8 + qualification docs: none is an
   irrigation item. The เจ้าหน้าที่ checklist at the end of กทล.1 (facts.md
   บรรทัด 56-57): no irrigation row.
2. **A5 (แผนการผลิต) / A8 (SOP)** — irrigation practice may appear *inside* those
   uploaded documents, but they are document uploads the applicant authors; DTAM
   nowhere asks for a structured farm-level irrigation-type answer. A wizard Select
   is a platform extra on top of the form — exactly what ruling 2 cuts. GENERATE
   does not apply: the filled กทล.1 has no irrigation blank to populate.
3. **[ข้อกำหนด] / MOVE_TO_AUDIT test** — facts.md §3 does NOT name "ระบบให้น้ำ" as
   audit-day evidence. It names บันทึกกิจกรรมแปลงปลูก (activity *records*, e.g. the
   planting module's watering log — see docs/contract/farmer-manual/GACP-Farmer-Manual.md:145,
   which is where การให้น้ำ correctly lives in this platform) and says lab water
   results are not mandatory at filing (บรรทัด 63). A static farm attribute Select
   is neither of those, so MOVE_TO_AUDIT is not available under the vocabulary.
4. **`data/standards/gacp-thailand.json:148-165` (CULT-002 "การให้น้ำ")** — the GACP
   standard's audit checkpoint ("ระบบให้น้ำเหมาะสม", evidence: บันทึกการให้น้ำ,
   แผนภูมิระบบน้ำ). That is assessed at the on-site audit against the standard,
   not asked on the application form. Fails as an application-day basis.
5. **`docs/requirements/dtam-requirements-analysis.md:22`** — the origin of this
   field ("รูปแบบการให้น้ำ (หยด/พ่น/รด) — 🟡 ต้องเพิ่ม"; its Frontend sketch at
   :125 and the Prisma sketch at :105 `irrigationType String? // DRIP, SPRINKLER,
   MANUAL, FLOOD` match the shipped UI one-to-one). Its own header states the
   source: "จากคอมเมนต์/บรีฟ" (line 6) — an unnamed brief, not a named
   กฎกระทรวง/ประกาศ and not the กทล.1 form. Under operator rulings 1-2 an unnamed
   brief cannot outrank the form's full text. Fails. (Same lineage:
   dtam-implementation-final.md:125, a UI sketch, no legal citation.)
6. **Named-instrument sweep (docs/requirements, docs/contract)** — instruments cited
   in the repo near this domain: พ.ร.บ. คุ้มครองและส่งเสริมภูมิปัญญาการแพทย์แผนไทย
   พ.ศ. 2542 (ม.44-46), ประกาศ สธ. เรื่อง สมุนไพรควบคุม (กัญชา) พ.ศ. 2565, ร่าง
   พ.ร.บ. กัญชา กัญชง 2567, มกษ./TAS GAP standards. None makes irrigation-system
   type an application-time requirement for the GACP certificate; the สมุนไพรควบคุม
   licence path is a *licence* attachment on the จนท. checklist (the licence itself,
   facts.md บรรทัด 56), not a data field about irrigation.
7. **Backend contract** — `apps/backend/validation/application-schemas.js` has **no
   `irrigationType` key at all** (grep: no matches): the submit door does not
   validate or require it. No system-of-record obligation binds it either.
8. **DTAM e-service portal** — facts.md บรรทัด 75 marks it UNVERIFIED (unreachable
   during research); an unverified maybe is not a basis.

## 3. Consistency

verify-43 (section-level skeptic pass on "3) ข้อมูลแหล่งน้ำ") independently upheld
CUT for this same Select as its item #2. This check reached the same result from
the item side.

## Conclusion

upheld = **true**. Verdict stays **CUT**, citation: facts.md §1 ส่วนที่ ๒
(ไม่มีมากกว่านี้ — no water/irrigation field) + §2 A1-A8 (no irrigation attachment)
+ ruling 1-2. The only repo documents asking for this field trace to an unnamed
brief ("จากคอมเมนต์/บรีฟ"), and the GACP standard treats การให้น้ำ as an audit-day
checkpoint with *records* as evidence — not named in facts.md §3 as a filing item,
so neither KEEP nor MOVE_TO_AUDIT is available. Not required, counts for nothing
DTAM asks — OPTIONAL would only launder an extra ruling 2 says to cut.
