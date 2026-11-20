# verify-5 — skeptic check: อัพโหลดผลตรวจประวัติอาชญากรรม (CUT?)

Item under challenge:
- `apps/web-app/src/app/health/applications/new/_steps/steps/general-step-applicant-sections.tsx:119`
- UI shows: `ผลตรวจประวัติอาชญากรรม (ถ้ามี)` / EN `Criminal Background Check`, `required={false}`, slot `criminal-bg` → `criminalBgDoc` (INDIVIDUAL branch, line 31)
- Census verdict: **CUT** — no basis in facts.md

## Refutation attempts (all run this session, read-only)

### 1. facts.md re-read (whole file, 76 lines)
No criminal-record item anywhere: not in ส่วนที่ ๑/๒/๔ fields, not in ส่วนที่ ๓ attachments (A1–A8 + qualification docs, facts.md:30-53), not in the officer checklist (facts.md:55-57), not in §3 audit-day records. The word อาชญากรรม does not appear in facts.md. The only licence-adjacent row is the officer checklist's "ใบอนุญาต/หนังสือสำคัญ กรณีการปลูก/แปรรูปกัญชาที่ต้องได้รับอนุญาตตามกฎหมายที่เกี่ยวข้อง" (facts.md:56) — that is the *licence itself*, conditional, and facts.md:75 marks even that rule UNVERIFIED pending the exact ฉบับ.

### 2. Repo search for another named Thai-law basis
Searched docs/, apps/backend (constants, routes, controllers), apps/backend/prisma, apps/web-app/src for อาชญากรรม/criminal. Findings:

| Source | What it says | Is it a named-law basis? |
|---|---|---|
| `docs/requirements/official-gacp-requirements-dtam.md:104,150,188` | Lists "ผลตรวจสอบประวัติอาชญากรรม" as a required attachment (ใบรับรองจาก สตช.) | **No.** Research doc dated 10 ธ.ค. 2568; header cites only "DTAM website" + พ.ร.บ.คุ้มครองและส่งเสริมภูมิปัญญาการแพทย์แผนไทย พ.ศ. 2542 generically — no clause, no form field, no ประกาศ/กฎกระทรวง tied to the criminal-record row. Superseded by the coordinator's 2026-09-01 full-text extract of the actual กทล.1 PDF (facts.md), which has no such attachment. |
| `apps/backend/constants/document-slots.js:153-159` | `CRIMINAL_BG` slot, `required: true`, warningText "GACP Thaiกำหนดให้ต้องมีผลตรวจประวัติอาชญากรรม" | **No.** Uncited platform assertion; contradicts กทล.1 ส่วนที่ ๓. The claim "GACP Thai กำหนด" is false per facts.md — the ข้อกำหนด (gacp-2.pdf, read in full) contains no such requirement. |
| `apps/backend/routes/api/applications/validation.js:194-201,342-348,384` | Counts `criminal_bg` toward completion, high-priority warning "ต้องได้จาก สตช. อายุไม่เกิน 3 เดือน" | **No.** Same uncited chain; the "3 เดือน" age rule cites nothing. |
| `apps/backend/controllers/master-data-controller.js:39-46` | "หนังสือผลตรวจประวัติอาชญากรรม" in the COMMERCIAL purpose doc list, beside แบบ ภ.ท.11 | **No.** Hardcoded master-data (operator already ruled: no hardcode in API). Even taken at face value it describes the ภท.11 licence door under พ.ร.บ.ภูมิปัญญาฯ/สมุนไพรควบคุม — a different agency process, not the กทล.1 GACP application; the กทล.1 asks only for the resulting licence, conditionally (facts.md:56). No ประกาศ clause named anywhere in the repo for it. |
| `docs/audit-reports/2026-07-25-data-sovereignty-audit.md:206` | Dead links to criminal.police.go.th in old Flutter step_7 — handler commented out | Dead code, not a basis. |
| `apps/backend/prisma` | No matches | — |

Downstream copies of the same slot (would need cutting together, listed for the coordinator): `documents-step-config.tsx:207`, `general-step-types.ts:38`, `general-step.tsx:104`, `application-document-helpers.ts:60`, `provider-application-detail-config.ts:122`, `print-page-config.ts:29`, `provider-audit-job-sheet-config.ts:172`, plus backend slot/validation rows above and tests `x2-fix-a-documents-tab.test.tsx:93`, `x2-fix-a-detail-config.test.tsx:90,118`, `document-slots.test.js`, `upload-slot-canonicalisation.test.js`.

### 3. Could the verdict soften to OPTIONAL?
The wizard label already says "(ถ้ามี)" and `required={false}` — but OPTIONAL requires genuine usefulness that "counts for nothing". Here the backend contradicts the UI: `document-slots.js` marks it `required: true` and validation.js docks the completion percentage and fires a high-priority warning falsely attributed to "GACP Thai". Ruling 1 (ชุดบังคับ = กทล.1 ส่วนที่ ๓ เท่านั้น) + ruling 2 (ของเกิน = ตัด, ความเกินคือปัญหา) leave no room: an uncited slot that misinforms farmers a police certificate is legally required is exactly the excess ruling 2 targets. If a future verified ฉบับ of the licensing ประกาศ turns out to demand it, that belongs to the licence door, not the GACP application — and facts.md:75 already parks that as UNVERIFIED.

## Verdict
**UPHELD — CUT** (`general-step-applicant-sections.tsx:119`, "ผลตรวจประวัติอาชญากรรม (ถ้ามี)").
Citation: facts.md §2 (กทล.1 ส่วนที่ ๓ complete attachment list, rows A1–A8 + qualification docs — no criminal record), facts.md §4 rulings 1+2. No other named Thai-law basis exists in the repo; every in-repo assertion chains back to the uncited Dec-2025 research doc superseded by the facts.md full-text extract.
