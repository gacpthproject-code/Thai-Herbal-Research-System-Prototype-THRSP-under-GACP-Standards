# verify-47 — SKEPTIC check: "water filtrationTypes" (proposed CUT)

Date: 2026-09-01 · Checker role: skeptic (tried to refute the CUT)

## Item under challenge
| file:line | UI shows (Thai) | proposed verdict |
|---|---|---|
| apps/web-app/src/app/health/applications/new/_steps/steps/farm-info-form-sections.tsx:352-375 | "ระบบกรองน้ำ (เลือกได้หลายรายการ)" — multi ChoiceCards: กรองเกษตร / RO (Reverse Osmosis) / UV (Ultraviolet) / กรองตะกอน / กรองคาร์บอน / ไม่มีการกรอง (apps/web-app/src/constants/options.ts:23-30, `FILTRATION_OPTIONS`) | CUT |

Render condition: unconditional inside the water section (no per-applicant-type or per-area-type branch). Not required by validation; multi-select, default empty.

## What I did to refute it
1. **Re-read facts.md in full.** ส่วนที่ ๒ ("ทั้งหมดที่ฟอร์มขอ ไม่มีมากกว่านี้", facts.md §1 line 20-25) contains no water field of any kind. Attachments A1–A8 + qualification docs (facts.md §2) contain no water-system item. §3 (line 63) goes further: ผลตรวจน้ำ/ดิน/แล็บ are explicitly **not** application-day documents and DTAM ordinarily does no lab checks. "ระบบกรองน้ำ" is also not named in §3's audit-day record list, so MOVE_TO_AUDIT has no citable row either.
2. **Searched the whole repo for a named Thai-law/ministry basis** (`filtration`, `กรองน้ำ` across docs/, apps/backend/constants, shared/, prisma). Findings:
   - `docs/requirements/dtam-requirements-analysis.md:21` marks "ระบบกรองน้ำ (กรองเกษตร/RO/UV)" as "🔴 ต้องเพิ่ม" — **but** its own header (line 6) states its source: "สรุปความต้องการจาก DTAM **(จากคอมเมนต์/บรีฟ)**" — an unattributed verbal brief. No กฎกระทรวง, no ประกาศ, no form number, no clause. Under the census rules a vibes-level brief is not a basis.
   - `docs/requirements/dtam-implementation-progress.md:14,85` and `docs/requirements/dtam-implementation-final.md:24,118-124,288` merely track the implementation of that same uncited brief. Derivative, not independent authority.
   - `apps/backend/prisma/schema/gacp-compliance.prisma:19-20` (`WaterSource.filtrationTypes Json?`) — descriptive comment only, no regulation cited; field is nullable.
   - `apps/backend/routes/api/provider/handlers/application-form-fields-handler.js:14` mentions `filtrationTypes` only as a collection stripped from officer edit patches — plumbing, not a legal basis.
   - `apps/backend/data/journey-config-matrix.js:72,200` lists `airFiltration` (a different field, indoor air) — irrelevant to water filtration and itself uncited.
   - No hit ties filtration to any named ใบอนุญาต obligation, กฎกระทรวง, or ประกาศ สธ. The งกทล.1 officer checklist (facts.md §2 line 56) asks for the *licence* where cultivation law requires one — nothing about water systems.
3. **Considered the alternative verdicts.**
   - KEEP — impossible: no กทล.1 row to cite.
   - OPTIONAL — rejected: OPTIONAL in this census was granted to the water test upload (farm.md item 37) because facts.md §3 *names* lab results. filtrationTypes is named nowhere in facts.md; operator ruling 2 says wizard items beyond DTAM needs = ตัด, and ruling 1 forbids platform extras. An unnamed extra cannot earn OPTIONAL.
   - MOVE_TO_AUDIT — rejected: facts.md §3's audit-day list (บันทึกปัจจัยการผลิต/กิจกรรม/ขาย/ทำความสะอาด/แมลง/ร้องเรียน + lab results) does not name a filtration-system descriptor.
   - CONDITIONAL / GENERATE / REWORD — no named case, nothing to generate, no correct semantics to restore.
   - Note: if the applicant's own SOP (A8) or security/production plans (A5/A6) describe water treatment, that lives inside *their uploaded documents* — it does not justify a platform-mandated structured field.
4. **Cross-checked census consistency.** farm.md items 32-36 CUT the entire water section (section header, sourceType, irrigationType, otherSourceType, filtrationTypes) on the same ground; item 37 (test upload) is OPTIONAL via §3. The proposed verdict matches its siblings.

## Verdict
**UPHELD — CUT.** Citation: facts.md §1 ส่วนที่ ๒ ("ไม่มีมากกว่านี้" — no water field), §2 A1-A8 (no water attachment), §3 line 63 (even water lab results are not application-day), operator rulings 1-2 (required set = กทล.1 exactly; extras = ตัด). The only contrary repo document, docs/requirements/dtam-requirements-analysis.md:21, cites no law — its declared source is "คอมเมนต์/บรีฟ" (header line 6), which the census rules exclude as a basis. Residual note for the coordinator: facts.md line 75 flags the DTAM e-service portal as UNVERIFIED — if that portal is later shown to ask for a water-system descriptor, this item should be revisited; on today's authority it is an extra.
