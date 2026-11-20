# verify-58 — SKEPTIC check: ระยะปลูก (TextInput) — CUT

Date: 2026-09-01 · Role: skeptic (refute-the-cut) · Item under challenge:

| file:line | UI shows (Thai) | proposed verdict | proposed basis |
|---|---|---|---|
| apps/web-app/src/app/health/applications/new/_steps/steps/production-info-panels.tsx:139-144 | label "ระยะปลูก", placeholder "เช่น 1.5m × 1.5m หรือ 30 ต้น/ตร.ม." (free text, optional, no validator) | CUT | ruling 2 — ไม่มีใน กทล.1; ถ้าจะมีที่ไหนคือเนื้อหา A5 |

## Verdict: **UPHELD — CUT stands**

## What I tried, to refute it

1. **facts.md §1 ส่วนที่ ๒ ข้อ ๒ (the only quantitative plot block in กทล.1).** The form asks: ประเภทเอกสารที่ดิน · สถานะการถือครอง · ขนาดพื้นที่ (ตารางเมตร) · ค่าพิกัดภูมิศาสตร์ · **ปริมาณการปลูก (ต้น/รอบ, รอบ/ปี)** — facts.md:24. Planting *quantity* is asked (and maps to the sibling fields B26/B27 `treeCount`/`harvestCycles`); planting *spacing/density* is not asked anywhere in ส่วนที่ ๑, ๒ or ๔. facts.md §1 states ส่วนที่ ๒ is "ทั้งหมดที่ฟอร์มขอ ไม่มีมากกว่านี้" (facts.md:20).
2. **facts.md §2 attachments A1–A8.** The nearest home is A5 แผนการผลิต (facts.md:40) — but A5 is an *uploaded plan document*; spacing would be prose content inside it, not a standalone wizard field. That matches the census note verbatim and does not rescue the field.
3. **data/standards/gacp-thailand.json:142** — checkpoint "ระยะปลูกเหมาะสมกับชนิดพืช" under the planting checkpoints (139-145, alongside "มีแผนผังแปลงปลูก", "บันทึกวันเวลาปลูก"). This is the standards-requirements set used for audit-day gap analysis — GACP *substance the auditor judges at the site*, not a กทล.1 fill field. Ruling 1 (facts.md:67) pins the application-day required set to กทล.1 exactly; a standards checkpoint is not an application-form basis. It also cannot upgrade the verdict to MOVE_TO_AUDIT under the vocabulary, because facts.md **§3** (the audit-day list, facts.md:59-64) names บันทึกกิจกรรมแปลงปลูก and other records — it does not name ระยะปลูก as an application-time deliverable to relocate; the field as it exists has nothing to "move".
4. **apps/backend/config/plant-density.js:23-63** — the platform's own spacingCm/plantsPerSqm table. Its cited authorities are "มาตรฐาน GACP สากล (WHO Guidelines)" and commercial vendors "Emerald Harvest, Advanced Nutrients" (plant-density.js:9-12) — no named กฎกระทรวง/ประกาศ. It exists to cap PlantUnit QR minting, a feature the operator ordered removed 2026-08-25 (R8 retired per-plant tracking). A platform quota citing vendor grow guides is not a Thai-law basis.
5. **apps/backend/constants/document-slots.js:5-28** — the ภท.09/10/11/12/13/16 licence-form family under กฎกระทรวง พ.ศ. 2559 governs controlled-herb *licences*; nothing there asks for planting spacing.
6. **Consumer trace.** `plantSpacing` has **zero backend matches** (grep over apps/backend: no validator, no analyzer, no generated document reads it). Frontend-only: stored via `handleChange` (panels:143), typed at production-info-types.ts / domain-types.ts, echoed in application-document-view.tsx:503 and application-document-edit-config.ts:105. It is collected, stored unread, and displayed back. The earlier deep-dive reached the same conclusion independently: reports/design-cleanup-2026-08-21/04-WIZARD-VS-DTAM.md:90,186 ("ไม่มีใน DTAM", "ตัด").

## Why not the other verdicts

- **KEEP** — no กทล.1 row to cite; ส่วนที่ ๒ ข้อ ๒ asks quantity, not spacing.
- **OPTIONAL** — would need a "useful" defense; ruling 2 says excess is the problem, and the field is free text mixing two incompatible semantics (distance vs density) that no reviewer or machine reads.
- **CONDITIONAL** — no named case (เช่า/Indoor/นิติบุคคล/ต่ออายุ…) makes spacing appear in กทล.1.
- **MOVE_TO_AUDIT** — facts.md §3 does not name it (see point 3).
- **GENERATE** — only defensible *if and when* the platform generates A5 from wizard data; that is the A5 item's design decision, not a basis for keeping this field today. If A5-generation is later adopted, a structured spacing/density input may return as an input to that generator — a new field under a new verdict, not a rescue of this one.
- **REWORD** — nothing to reword into; there is no DTAM field with different semantics behind this label.

## Consequential fields in the same block (context only, verdicts owned by production.md)

B25 falls together with its unread free-text neighbors (B9 วัสดุปลูก, B17 ชนิดดิน — both CUT in production.md:73-75); B26/B27 (treeCount/harvestCycles) stay as the real กทล.1 ปริมาณการปลูก fields (REWORD, production.md:77-78). Cutting B25 leaves the กทล.1 ข้อ ๒ data intact.

**Conclusion: upheld = true. CUT, per ruling 2 (facts.md:67-68) — no กทล.1 field, no facts.md §3 row, and no other named Thai-law basis found in docs/, apps/backend/constants, config, shared, prisma, or data/standards.**
