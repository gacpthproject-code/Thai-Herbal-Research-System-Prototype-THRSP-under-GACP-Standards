# verify-7 — SKEPTIC check: จำนวนสมาชิก (COMMUNITY) — 2026-09-01

Assigned item (census proposal under challenge):

| field | file:line | UI shows | proposed verdict | proposed citation |
|---|---|---|---|---|
| จำนวนสมาชิก (COMMUNITY) | apps/web-app/src/app/health/applications/new/_steps/steps/general-step-applicant-sections.tsx:173-179 | `Input type="number"` label "จำนวนสมาชิก (คน)", min=1, not marked required, bound to `formData.memberCount` (renders only when `applicantType === 'COMMUNITY'`, line 132) | CUT | ไม่มีใน ๑.๑ — บัญชีรายชื่อสมาชิกเป็นเอกสารแนบจดทะเบียน (§2) |

## Refutation attempts (all run this session, read-only)

1. **facts.md ส่วนที่ ๑.๑ (วิสาหกิจชุมชน) re-read** — field list is: ชื่อประธาน · ชื่อวิสาหกิจ · เลขบัตร ปชช. ประธาน · สัญชาติ · รหัสทะเบียน สวช.01 · เลขรหัสประจำบ้าน · ที่อยู่ตามทะเบียนบ้าน · โทรศัพท์มือถือ · อีเมล (ถ้ามี) (facts.md:14). **No member-count field.** Also checked ส่วนที่ ๒ (facts.md:20-25) and the officer checklist (facts.md:56-57) — no count asked anywhere on กทล.1.
2. **facts.md §2 attachment row** — วิสาหกิจชุมชน (ไม่เป็นนิติบุคคล): สำเนาหนังสือจดทะเบียนวิสาหกิจชุมชน "…+ บัญชีรายชื่อสมาชิก" (facts.md:48). The member roster reaches DTAM as part of the registration-certificate attachment; the count is derivable from that document, so a wizard number field adds nothing DTAM asks for. Confirms the census note verbatim.
3. **Repo-wide search for another Thai-law/ministry basis** —
   - `memberCount` hits only: wizard UI + types (`general-step-applicant-sections.tsx`, `general-step-types.ts`, `domain-types.ts`), a pass-through payload builder (`apps/backend/services/entity-service.js:1487-1491` — stores `memberCount` if present, `null` otherwise; no validation, no legal comment), print view (`provider/applications/[id]/print/*`), entity tests, and prior reports. No constants, no prisma requirement, no seed rule.
   - `จำนวนสมาชิก` in docs/: only the master brief's "สมัครสมาชิก" (onboarding signup — unrelated).
   - Searched for a พ.ร.บ.ส่งเสริมวิสาหกิจชุมชน / minimum-member basis (`สมาชิกไม่น้อยกว่า`, `7 คน`, `ส่งเสริมวิสาหกิจชุมชน`…): 2 hits, both false positives (unrelated prose in reports/planting-audit/QR-MODEL-DECISION.md:183 and evidence/R2-special-reopen/gap-report.md:117). Even in principle, the minimum-member rule governs *registration with กรมส่งเสริมการเกษตร* — evidenced at GACP time by the registration certificate attachment itself (facts.md:48), not by a self-declared number.
   - `docs/requirements/official-gacp-requirements-dtam.md` — lists the วิสาหกิจ registration document among attachments; no member-count field.
4. **Prior independent analysis agrees** — reports/design-cleanup-2026-08-21/04-WIZard-VS-DTAM.md:59 (wizard-vs-DTAM table): กทล.1 §1.1 has ชื่อ+ที่อยู่+รหัสทะเบียน สวช.01, "**ไม่** วันที่จด/จำนวนสมาชิก" → "**ตัด** วันที่จด/จำนวนสมาชิก (บัญชีรายชื่อสมาชิกเป็นไฟล์อยู่แล้ว)".
5. **OPTIONAL considered and rejected** — operator ruling 2 (facts.md:68): wizard items beyond DTAM's ask = ตัด, "ความเกินคือปัญหา". The count is pure duplication of an attachment DTAM already requires; keeping it even as ไม่บังคับ contradicts ruling 1-2 and the census's uniform treatment of redundant self-declared numbers.

## Verdict

**UPHELD — CUT.** No named กทล.1 field, no ข้อกำหนด clause, and no other named Thai-law/ministry basis anywhere in the repo requires a member count at application time for cannabis. Citation: facts.md ส่วนที่ ๑.๑ (line 14, closed field list — count absent) + facts.md §2 วิสาหกิจชุมชน attachment row (line 48 — บัญชีรายชื่อสมาชิก is part of the registration-certificate attachment) + operator ruling 1-2 (facts.md:67-68).

Side note for the coordinator (same conditional branch, already covered elsewhere): the sibling field "วันที่จดทะเบียน" (general-step-applicant-sections.tsx:165-171) fails on identical grounds per 04-WIZARD-VS-DTAM.md:59 — not part of this item's verdict.
