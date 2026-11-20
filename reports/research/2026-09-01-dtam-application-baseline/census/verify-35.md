# verify-35 — SKEPTIC check: option tokens VERTICAL_RACK / HYDROPONIC / AEROPONIC (+UNREACHABLE_BY_WIZARD)

Item under challenge (census verdict: **CUT**):
- File: `apps/web-app/src/app/health/applications/new/_steps/steps/cultivation-tokens.ts:31-33` (canonical type), `:53-60` (synonyms), `:112` (UNREACHABLE_BY_WIZARD)
- UI currently shows: nothing — these are internal tokens. The wizard's cultivation picker offers only กลางแจ้ง / โรงเรือน / อาคารควบคุม (`plant-selection-config.ts:234-256`, `MainCultivationType = 'outdoor'|'greenhouse'|'indoor'` at `hooks/domain-types.ts:7`). The file itself declares the three tokens unreachable at `cultivation-tokens.ts:112`.

## What I tried in order to refute the CUT

1. **Re-read facts.md (the legal baseline).** ส่วนที่ ๒ "ลักษณะพื้นที่" on the กทล.1 form is exactly: ☐ กลางแจ้ง (Outdoor) ☐ อาคาร/โรงเรือนระบบปิด (Indoor) ☐ โรงเรือนทั่วไป (Greenhouse) ☐ อื่น ๆ ระบุ (facts.md:22). No VERTICAL_RACK, HYDROPONIC, or AEROPONIC category exists on the form. The "other" case is free text, not a fixed platform token. Ruling 2 (facts.md:68): wizard options beyond DTAM's needs = cut. The wizard already models the form's free-text case as `AreaType = 'OUTDOOR'|'INDOOR'|'GREENHOUSE'|'OTHER'` (`_steps/hooks/use-wizard-state.ts:27`), so nothing DTAM asks for is lost by cutting the three tokens.
2. **Checked what the tokens actually gate.** Only two rule rows name them: `documents-step-config.tsx:383` — NUTRIENT_SPEC "สเปกสารละลายธาตุอาหาร" fires on `['HYDROPONIC','AEROPONIC']`; and `documents-step-config.tsx:373` — SOIL_TEST's list includes `VERTICAL_RACK` redundantly (OUTDOOR/GREENHOUSE/INDOOR already cover every reachable selection). NUTRIENT_SPEC appears in no facts.md row: not in กทล.1 ส่วนที่ ๓ (A1-A8, facts.md:35-43), not in the qualification groups, and facts.md:63 says lab results are not mandatory at submission (กรมปกติไม่ตรวจแล็บ). A rule with no DTAM basis, keyed on tokens no applicant can produce, is a dead rule twice over.
3. **Searched the repo for any other named Thai-law basis.** `docs/requirements/*`: hydroponic/aeroponic appear only as **วัสดุปลูก (growing-medium)** options for cultivation-cycle record-keeping (`dtam-requirements-analysis.md:114`, `dtam-implementation-status.md:38-39`) — facts.md §3 (ข้อ 1, facts.md:60) puts บันทึกปัจจัยการผลิต at audit day, not application day. The named laws in `docs/requirements/gacp-document-requirements-research.md:459-461` (พ.ร.บ. 2542, ประกาศ สธ. สมุนไพรควบคุม 2565, กฎกระทรวง ม.44-46) are cited for the licence obligation generally — none requires distinguishing hydroponic/aeroponic/vertical cultivation on the application, and none requires a nutrient-solution spec at filing. `apps/backend/routes/api/system/config.js:255-264` lists HYDROPONIC/AEROPONIC in a generic `/cultivation-methods` endpoint — platform code, no legal citation, different vocabulary (CONVENTIONAL/ORGANIC/GAP…). `packages/validation/src/upload-rules.js:145` maps NUTRIENT_SPEC→PDF — plumbing, not a basis. `apps/backend/prisma/schema/gacp-compliance.prisma:55-56` uses the words only inside a mediumType comment for post-cert cycle records. **No named basis found.**
4. **Prior independent analysis agrees.** `reports/design-cleanup-2026-08-21/04-WIZARD-VS-DTAM.md:48` ("HYDROPONIC/AEROPONIC/VERTICAL_RACK ในกติกาขั้น 8 เลือกไม่ถึง → NUTRIENT_SPEC ตาย") and `:134` (NUTRIENT_SPEC = **ตัด**, "dead rule").

## Refutation result: FAILED — the CUT stands

- No กทล.1 field or attachment names these categories (facts.md:22 has อื่น ๆ as free text; ส่วนที่ ๓ has no nutrient-spec document).
- No other named Thai-law or ministry-system basis in the repo requires them at application time.
- The tokens are unreachable by construction (`cultivation-tokens.ts:107-112`), so even the "useful for review" argument has nothing to stand on — they have never influenced a single application.

## Scope notes (do not over-cut)

1. **The module survives; only the three tokens and their dead rule go.** The `outdoor/greenhouse/indoor` synonym mappings and `cultivationMatches()` in the same file are load-bearing for A4 (แบบแปลนอาคาร/โรงเรือน — facts.md:38, Indoor/Greenhouse only, `documents-step-config.tsx:259`), a genuine กทล.1 attachment. Cut = remove `VERTICAL_RACK|HYDROPONIC|AEROPONIC` from `CanonicalCultivation`, their SYNONYMS rows, `UNREACHABLE_BY_WIZARD`, the NUTRIENT_SPEC rule (`documents-step-config.tsx:375-384`), and `VERTICAL_RACK` from the SOIL_TEST list (`:373`).
2. **Different surface, different census row:** `PLANTING_MATERIAL_OPTIONS` values 'HYDROPONIC'/'AEROPONIC' (`src/constants/options.ts:84-85`, วัสดุปลูก in production-info-step) are not this item and are not judged here.
3. **Cross-area flag confirmed and forwarded:** the comment at `cultivation-tokens.ts:14-17` claims the regulator requires both แปลนอาคารหรือแปลนโรงเรือน and **ผลตรวจดินหรือวัสดุปลูก**. The first is true (A4, facts.md:38). The second contradicts facts.md:63 (ผลแล็บไม่ใช่เอกสารบังคับวันยื่น) — the SOIL_TEST/lab-document rules belong to the document-rules reader; the comment should be corrected when that verdict lands.

## Verdict

**UPHELD: CUT** — no DTAM basis (facts.md:22 ส่วนที่ ๒ ลักษณะพื้นที่ = Outdoor/Indoor/Greenhouse/อื่น ๆ ระบุ free text; ruling 2) and no other named Thai-law basis anywhere in the repo. Tokens are self-declared unreachable; the one rule they gate (NUTRIENT_SPEC) has no legal row and can never fire. Cut the tokens and the dead rule together, keeping the module's reachable mappings that serve A4/A4′.
