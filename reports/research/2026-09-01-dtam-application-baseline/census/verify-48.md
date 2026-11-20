# verify-48 — skeptic check: สรุป "แหล่งพันธุ์ที่แนบหลักฐาน x/y แหล่ง"

Date: 2026-09-01 · Checker: skeptic subagent (read-only) · Item: census A2 (production.md:49)

## Item under challenge

| file:line | UI (Thai) | kind | proposed verdict | dtamRef |
|---|---|---|---|---|
| apps/web-app/src/app/health/applications/new/_steps/steps/production-info-step.tsx:274-278 | "แหล่งพันธุ์ที่แนบหลักฐาน" → `{uploadedSeedEvidenceCount} / {seedSources.length} แหล่ง` | page-section (summary tile) | MOVE_TO_AUDIT | facts §3 ข้อ 2 |

What it actually counts (step.tsx:89-92): seed sources with `certificateFile` (อัปโหลดใบรับรองสายพันธุ์ — seed-sources-panel.tsx:153-161) **or** `porPor4File` (อัปโหลดเอกสารภพ.4 — seed-sources-panel.tsx:185-193). No conditional render branches — the tile renders for every applicant type / plant / area type.

## Refutation attempts (all failed)

1. **กทล.1 application-day attachment?** facts.md §2: ส่วนที่ ๓ = A1-A8 + กลุ่มคุณสมบัติ + ต่ออายุ/ใบแทน. No seed-source certificate, no ภพ.4, nothing supplier-evidence-shaped. FAIL.
2. **กทล.1 fill field?** ส่วนที่ ๒ ข้อ ๓ (facts.md:25) asks to *fill in* พันธุ์/แหล่งที่มา/ปริมาณ — data rows, covered by other census items. It asks for no evidence upload and no attachment count. The tile counts uploads, not the ข้อ ๓ data. FAIL.
3. **Officer checklist?** facts.md:56 — จนท. checks the grower's own ใบอนุญาตปลูก/แปรรูปกัญชาตามกฎหมายที่เกี่ยวข้อง, not seed-supplier evidence. FAIL.
4. **Other named Thai-law basis in the repo?**
   - docs/requirements/dtam-requirements-analysis.md:6,31-37 — the very doc that introduced เอกสารรับรองสายพันธุ์ + ภพ.4 sources them "จากคอมเมนต์/บรีฟ", not from any named กฎกระทรวง/ประกาศ/form. That is a platform extra under operator ruling 1-2.
   - apps/backend/scripts/herb-content/data/CANNABIS.json — all seed/licensing entries are `AI_DRAFT: … ต้องตรวจสอบ`; none requires seed-supplier evidence at application time. Not citable.
   - apps/backend/constants/master-data-constants.js:41 — "เมล็ดพันธุ์และวัสดุขยายพันธุ์" is an **audit scoring category** (weight 15). Supports audit-day, contradicts application-day.
   - ภพ.4 itself (placeholder "ท.กษ. 1234/2567") is a supplier-side registration; no repo document names a law obliging the *applicant* to attach it when filing กทล.1. FAIL.
5. **Citation validity.** facts.md §3 ข้อ 2 (line 61) names ใบรับรองวัตถุดิบ · เอกสารสั่งซื้อ/ใบรับวัตถุดิบ as ตรวจ-ณ-แปลง evidence. A seed-variety certificate is exactly a raw-material certificate. Citation holds.

## Consistency note (not a verdict change)

The tile aggregates two uploads whose census fates differ: D19 ใบรับรอง = MOVE_TO_AUDIT (facts §3 ข้อ 2), D22 ภพ.4 = CUT (ruling 2, production.md:112,115). MOVE_TO_AUDIT is the correct single verdict for the tile — its surviving subject (the raw-material certificate) has a named audit-day home, so CUT would be wrong (it would deny that home) and KEEP is impossible (no ส่วนที่ ๓ row). Implementation caveat: the audit-day incarnation of this counter must count **certificateFile only**; the ภพ.4 half dies with D22 and must not resurface as an audit item.

## Verdict

**UPHELD — MOVE_TO_AUDIT, facts §3 ข้อ 2.** The counter counts uploads that are audit-day record-keeping evidence (ใบรับรองวัตถุดิบ); no กทล.1 field/attachment and no named Thai-law basis in the repo requires it at application time; it goes wherever the uploads go, minus the CUT ภพ.4 half.
