# verify-27 — SKEPTIC check: 5 disabled plant options (กระท่อม/ขมิ้นชัน/ขิง/ไพล/กระชายดำ)

Item under challenge (census verdict CUT, dtamRef ruling 5 / facts.md:71):
`apps/web-app/src/app/health/applications/new/_steps/steps/plant-selection-config.ts:97` — the five
`enabled: false` entries in `FALLBACK_PLANTS`, rendered as a `details/summary` group
"ตัวเลือกพืชอื่น" with per-card badge "ยังไม่เปิดรับ".

Role: refute the CUT if any named Thai-law or ministry-system basis requires these options at
APPLICATION time for cannabis. Read-only census; no repo file touched except this report.

## 1. Surface census (every option in the challenged item)

| # | file:line | UI shows (Thai) | verdict | citation |
|---|---|---|---|---|
| 1 | plant-selection-config.ts:97-105 (`kratom`) | กระท่อม — badge "ยังไม่เปิดรับ", disabled button | CUT | ruling 5 (facts.md:71) + ruling 2 (facts.md:68); no กทล.1 basis — see §3 |
| 2 | plant-selection-config.ts:106-114 (`turmeric`) | ขมิ้นชัน — "ยังไม่เปิดรับ", disabled | CUT | same |
| 3 | plant-selection-config.ts:115-123 (`ginger`) | ขิง — "ยังไม่เปิดรับ", disabled | CUT | same |
| 4 | plant-selection-config.ts:124-132 (`plai`) | ไพล — "ยังไม่เปิดรับ", disabled | CUT | same |
| 5 | plant-selection-config.ts:133-141 (`black_galangal`) | กระชายดำ — "ยังไม่เปิดรับ", disabled | CUT | same |

Render surface verified: `plant-selection-config-panels.tsx:158-235` — collapsible
`<details>` with summary "ตัวเลือกพืชอื่น" (line 164) + count badge (167-169); each hidden plant
is a `<button disabled>` (178-181) with badge "ยังไม่เปิดรับ" (220-222). The census note's
location claim is accurate. Companion dead weight if cut: the non-cannabis rows of
`PLANT_CODE_ALIAS` (plant-selection-config.ts:262-271) exist only to normalize these codes
(incl. legacy aliases `black_galingale`, `bsd`).

## 2. What the DTAM baseline says (re-read in full)

- กทล.1 has **no plant-selection field at all** — the form itself is titled for
  "พืชกัญชา" (facts.md:4) and every fill-in section (ส่วนที่ ๑, ๒, ๔ — facts.md:9-28) is
  cannabis-specific (ส่วนที่ ๒ ข้อ ๓ says "พันธุ์และส่วนของกัญชาที่ใช้"). There is no row for
  the applicant to choose among herbs.
- Scope note (facts.md:7): the document set covers **กัญชา เท่านั้น**.
- Ruling 2 (facts.md:68): หัวข้อ/ตัวเลือกใน wizard ที่เกินความต้องการ DTAM = ตัด —
  "ความเร็วไม่ใช่ปัญหา ความเกินคือปัญหา".
- Ruling 5 (facts.md:71): เปิดบริการกัญชาอย่างเดียว — พืชอื่นภายหลังเป็น
  **ชุด field/กติกาใหม่ ไม่ reuse ของกัญชา**. Listing the five plants inside the cannabis
  wizard's selector implies exactly the reuse the ruling forbids.

## 3. Refutation attempts — all fail

1. **DTAM pilot contract C05F680149** (docs/contract/pilot-data-sources-2026-07-11.md:2,
   docs/contract/pilot-image-datasets-manifest.md) names the same 6 herbs — but it is the
   AI image-dataset / disease-detection pilot deliverable, not the GACP application form.
   Nothing in it obligates the certification wizard to display other-plant options, least of
   all disabled ones inside a cannabis application.
2. **Internal requirements research** (docs/requirements/gacp-document-requirements-research.md,
   docs/requirements/plant-document-comparison-matrix.md) tabulates per-plant document sets —
   platform research, not a named law; its own matrix shows kratom's documents differ from
   cannabis (5 vs cannabis's set), which *supports* ruling 5's "new field set" position.
3. **Named laws found in the repo**: พ.ร.บ. คุ้มครองและส่งเสริมภูมิปัญญาการแพทย์แผนไทย
   พ.ศ. 2542 ม.44-46 and ประกาศ สธ. เรื่อง สมุนไพรควบคุม (กัญชา) พ.ศ. 2565
   (gacp-document-requirements-research.md:4,459-461) — both are the basis of the ภท. permit
   slots for **cannabis**; neither requires a multi-herb roster in the application.
   The Kratom Plant Act B.E. 2565 (docs/contract/pilot-data-sources-2026-07-11.md:129)
   governs a *kratom* licence flow — a future rule set per ruling 5, not a cannabis-day field.
4. **USER-MANUAL.md:348** (6-herb knowledge base) and
   docs/architecture/membership-system-architecture.md:204 (`canApplyFor` incl. KRATOM) —
   a separate knowledge-base feature and an aspirational architecture doc; neither is a legal
   basis, and ruling 1 (facts.md:67) bars platform extras in the required set.
5. **"Roadmap teaser is harmless"** — vibes, not a basis. The vocabulary's OPTIONAL is for a
   fillable field labeled ไม่บังคับ; these are non-fillable disabled buttons, i.e. pure
   ตัวเลือกเกิน under ruling 2, and they advertise reuse of the cannabis flow that ruling 5
   explicitly rules out.

## 4. Verdict

**UPHELD — CUT** for all five options (and the collapsible "ตัวเลือกพืชอื่น" group that exists
only to hold them). No named Thai-law or ministry-system basis requires them at application
time for cannabis; two operator rulings (2, 5) affirmatively require their removal.
When another plant is onboarded it arrives as its own field/rule set (ruling 5), not by
flipping `enabled: true` on these rows.
