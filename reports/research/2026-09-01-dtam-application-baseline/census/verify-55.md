# verify-55 — SKEPTIC check: options วัสดุปลูก 7 ค่า (PLANTING_MATERIAL_OPTIONS)

Item under challenge (census verdict: **CUT**, production.md B10-16):
- File: `apps/web-app/src/app/health/applications/new/_steps/steps/production-info-panels.tsx:124` — `data={PLANTING_MATERIAL_OPTIONS}` on the วัสดุปลูก `<Select>` (panels:120-128); values defined at `apps/web-app/src/constants/options.ts:79-87`.
- UI currently shows (7 options, verified against options.ts:80-86): ดิน (Soil) · กาบมะพร้าว (Coco Peat) · เพอร์ไลท์ (Perlite) · ร็อควูล (Rockwool) · ไฮโดรโปนิกส์ (Hydroponic) · แอโรโปนิกส์ (Aeroponic) · ดินผสม/อื่น ๆ — under a Select whose description claims "DTAM: รองรับทั้งดิน, ไฮโดรโปนิกส์, แอโรโปนิกส์" (panels:123).
- Census note: falls together with the parent field (production.md B9: วัสดุปลูก Select, panels:120-128, CUT).

## What I tried in order to refute the CUT

1. **Re-read facts.md (the legal baseline, full text).** กทล.1 ส่วนที่ ๒ is exhaustive ("ทั้งหมดที่ฟอร์มขอ ไม่มีมากกว่านี้", facts.md:20) and asks: วัตถุประสงค์ · ลักษณะพื้นที่ (Outdoor/Indoor/Greenhouse/อื่น ๆ ระบุ) · สถานที่+ที่ตั้ง · เอกสารที่ดิน/การถือครอง/ขนาด/พิกัด/ปริมาณการปลูก · พันธุ์และส่วนของกัญชา (facts.md:21-25). **No field asks growing medium/วัสดุปลูก.** ส่วนที่ ๓ attachments A1-A8 (facts.md:35-43) contain no growing-medium slot either — the nearest homes are A5 แผนการผลิต and A8 SOP, which are *document uploads* the wizard already collects, not a structured select. The "DTAM: รองรับทั้ง..." description on the field is attribution with no row in facts.md.
2. **Tried mapping hydroponics/aeroponics onto a กทล.1 field.** The only candidate is ลักษณะพื้นที่ ☐ อื่น ๆ ระบุ (facts.md:22) — but that is the *area-type* question, covered by the wizard's separate AreaType surface (its own census rows), and its "other" case is free text, not a platform-fixed option list. Same conclusion verify-35.md reached for the HYDROPONIC/AEROPONIC cultivation tokens.
3. **Searched the repo for another named Thai-law or ministry basis.**
   - `docs/requirements/dtam-requirements-analysis.md:24-29` lists วัสดุปลูก as "🔴 ต้องเพิ่ม" — but the document's own source line is "จากคอมเมนต์/บรีฟ" (line 6): an unsourced verbal brief, no named กฎกระทรวง/ประกาศ, no form field. It even asks for *free text, ไม่ต้องล็อค* (line 29) — contradicting the fixed 7-value list under challenge. `dtam-implementation-status.md:30,119`, `dtam-implementation-progress.md:15`, `dtam-implementation-final.md:25,289` all derive from that same brief. Under the task rule, a brief is not a basis; facts.md §4 ruling 1 fixes the application-day set = กทล.1 exactly.
   - `apps/backend/prisma/schema/gacp-compliance.prisma:43-59` (`GrowingMedium`, mediumType comment naming the same 7+1 values) — attached to **PlantingCycle**, i.e. post-certificate cultivation record-keeping, citing "GACP standard", not the application form. facts.md §3 (ข้อ 1, facts.md:60: บันทึกการซื้อ/ใช้ปัจจัยการผลิต · บันทึกกิจกรรมแปลงปลูก) puts production-input records at audit day, not application day. This model is a *different surface* and is untouched by this verdict.
   - `apps/backend/prisma/seed-plants.js:169` ("ผลตรวจวัสดุปลูก", isRequired:true) — contradicts facts.md:63 (กรมปกติไม่ตรวจแล็บ; lab results not mandatory at submission), so it supports the cut rather than refuting it; the lab-slot rules belong to the documents/backend-slots readers.
   - `apps/backend/data/journey-config-standards.js:5` ("วัสดุปลูกและเมล็ดพันธุ์" journey stage) and `apps/backend/scripts/herb-content/data/*.json` (agronomy advice) — educational/journey content, no legal citation, not application fields.
   - facts.md:75 flags the DTAM e-service portal as UNVERIFIED — an unverified possibility cannot serve as a citation.
4. **Checked whether MOVE_TO_AUDIT fits better than CUT.** facts.md §3 names *records of production inputs* as audit-day evidence, and the repo already has the audit-side home (`GrowingMedium` on PlantingCycle). But the census item is an application-wizard option list, and MOVE_TO_AUDIT in this census marks items facts.md §3 names as audit-day *evidence to relocate*; here the audit-side surface already exists separately, so nothing needs moving — the wizard copy is simply excess (ruling 2, facts.md:68). CUT is the precise verdict, matching parent B9.

## Refutation result: FAILED — the CUT stands

- No กทล.1 field or attachment asks growing medium (facts.md:20-25, 35-43); the field's "DTAM:" description is unbacked by the baseline.
- The only repo document claiming DTAM wants it is an unsourced brief ("จากคอมเมนต์/บรีฟ") that itself asks for free text, not this 7-value lock-in — not a named-law basis under the census rules.
- Growing-medium substance still reaches DTAM through A5 (แผนการผลิต, facts.md:40) and A8 (SOP, facts.md:43) uploads at application, and through cycle records at audit day — cutting the select loses nothing the form requires.
- Options are subordinate to their field: parent B9 (วัสดุปลูก Select, panels:120-128) is CUT; a value list cannot outlive the control that renders it.

## Scope notes (do not over-cut)

1. Cut = `PLANTING_MATERIAL_OPTIONS` (options.ts:79-87) together with the B9 Select (panels:119-128 half of the SimpleGrid) and the `plantingMaterial` key in the step's form data/validators. The neighboring ชนิดดิน Select (panels:129-136) and the rest of Section 1 have their own census rows — not judged here.
2. `GrowingMedium` (gacp-compliance.prisma:45-…) is cultivation-phase record-keeping consistent with facts.md §3 — leave it alone.
3. Forwarded: `seed-plants.js:169` ผลตรวจวัสดุปลูก isRequired:true contradicts facts.md:63 — for the backend-slots/documents readers (documents.md SOIL_TEST row already flags the same family).

## Verdict

**UPHELD: CUT** — no DTAM basis (กทล.1 ส่วนที่ ๒ exhaustive per facts.md:20, no growing-medium field; ruling 2, facts.md:68) and no other named Thai-law basis in the repo; the one claiming document is an unsourced brief. The 7 options fall with field B9.
