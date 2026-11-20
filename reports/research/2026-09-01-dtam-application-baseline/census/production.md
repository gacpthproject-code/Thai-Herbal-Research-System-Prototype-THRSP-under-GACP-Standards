# Census — AREA "production" (wizard step 6: ข้อมูลการผลิต) — 2026-09-01

Reader: production-area census agent (1 of 12). Read-only.
Legal authority: `reports/research/2026-09-01-dtam-application-baseline/facts.md` (กทล.1 + ข้อกำหนด + operator rulings 1-7).

Files read IN FULL:
- `apps/web-app/src/app/health/applications/new/_steps/steps/production-info-step.tsx` (319 lines)
- `apps/web-app/src/app/health/applications/new/_steps/steps/production-info-panels.tsx` (263 lines)
- `apps/web-app/src/app/health/applications/new/_steps/steps/production-info-production-inputs-panel.tsx` (185 lines)
- `apps/web-app/src/app/health/applications/new/_steps/steps/production-info-seed-sources-panel.tsx` (209 lines)
- `apps/web-app/src/app/health/applications/new/_steps/steps/production-info-types.ts` (67 lines)

Supporting reads (option labels only): `apps/web-app/src/constants/options.ts:60-134`, `apps/web-app/src/app/health/applications/new/hooks/domain-types.ts:267-304`.

## Baseline being compared against

กทล.1 ส่วนที่ ๒ ข้อ ๓ (facts.md:25) asks, in total:
- **เมล็ด**: ชื่อพันธุ์ · นำเข้า/ในประเทศ · แหล่งที่มา · ปริมาณ
- **ส่วนอื่นที่ไม่ใช่เมล็ด**: สายพันธุ์ · แหล่งที่มา · ปริมาณ
- กรณีแปรรูป: ส่วนของพืช/สายพันธุ์/แหล่งที่มา/ปริมาณ
- เกิน 2 ส่วนให้แนบรายละเอียดเพิ่ม

ส่วนที่ ๒ ข้อ ๒ (facts.md:24) additionally asks ปริมาณการปลูก (**ต้น/รอบ, รอบ/ปี**) — two numbers in this step map there.

facts.md §3 (วันตรวจ ไม่ใช่วันยื่น): บันทึกการซื้อ/ใช้**ปัจจัยการผลิต** · บันทึกกิจกรรมแปลงปลูก (ข้อ 1); **ใบรับรองวัตถุดิบ** · เอกสารสั่งซื้อ/ใบรับวัตถุดิบ (ข้อ 2). Rulings: (1) required set = กทล.1 exactly; (2) anything beyond DTAM = cut; (5) cannabis only.

## Headline findings

1. **Section 4 "ปัจจัยการผลิต" (entire panel, 15 controls) is audit-day material** — facts.md §3 ข้อ 1 names บันทึกการซื้อ/ใช้ปัจจัยการผลิต as record-keeping inspected ณ แปลง. Nothing in กทล.1 ส่วนที่ ๑-๔ asks for fertilizer brand/NPK/usage-date/application-method at submission. Verdict for every row: MOVE_TO_AUDIT.
2. **Seed-source evidence uploads are audit-day too** — ใบรับรองสายพันธุ์ + เลขที่ใบรับรอง map to §3 ข้อ 2 "ใบรับรองวัตถุดิบ"; วันที่ซื้อ maps to "เอกสารสั่งซื้อ/ใบรับวัตถุดิบ". MOVE_TO_AUDIT.
3. **"ภพ.4 รับรอง" slot has no DTAM basis and dubious semantics** — ภ.พ.4 is a VAT-registration designation; the placeholder ("ท.กษ. 1234/2567") suggests an agriculture registry number. No กทล.1 attachment matches. CUT.
4. **ข้อ ๓'s ปริมาณ field is MISSING** — no seed-source row asks ปริมาณ (จำนวนเมล็ด/ต้น) even though กทล.1 asks it for every พันธุ์ entry. Gap to fill when the step is rebuilt.
5. **ข้อ ๓'s นำเข้า/ในประเทศ is approximated by a free-text "แหล่งภูมิศาสตร์ (GEO)"** — should be the form's binary choice. REWORD.
6. **Cannabis-only violations (ruling 5)**: harvest-cycles description says "กัญชา: 2-3 รอบ | กระท่อม: 4-6 รอบ" (panels:159).
7. **False DTAM attributions in copy**: "DTAM: รองรับทั้งดิน, ไฮโดรโปนิกส์, แอโรโปนิกส์" (panels:123), "ตามมาตรฐาน DTAM" (seed panel:39), "เลขทะเบียนปุ๋ย (จากระบบรับรองมาตรฐาน GACP สมุนไพร)" (inputs:107-109 — fertilizer registration is issued under พ.ร.บ.ปุ๋ย by กรมวิชาการเกษตร, not by the GACP certification system). None of these claims appear in facts.md.
8. **Latent UI bug (recorded, not fixed — read-only census)**: inputs panel "ชนิด" Select renders its value as `input.isOrganic ? 'ORGANIC' : 'CHEMICAL'` (inputs:82) but offers a third option `BIO` (options.ts:101) — selecting BIO stores `isOrganic=false` and displays as CHEMICAL; BIO can never display.
9. **Hidden state fields with no DTAM basis**: `irrigationType` (seeded from farm data, step:23-29,57-60), `hasGAPCert`/`hasOrganicCert` (step:62-63) — persisted into productionData but not asked by กทล.1. CUT.
10. **DEMO_MODE skips all validation** (step:240) — demo scaffolding; must not survive to production submission path.

## Full census table

Verdicts: KEEP / CUT / OPTIONAL / CONDITIONAL / MOVE_TO_AUDIT / GENERATE / REWORD. `panels` = production-info-panels.tsx, `step` = production-info-step.tsx, `seed` = production-info-seed-sources-panel.tsx, `inputs` = production-info-production-inputs-panel.tsx, `types` = production-info-types.ts.

### A. Step chrome (production-info-step.tsx)

| # | Item | kind | file:line | UI shows | Verdict | DTAM ref | Note |
|---|---|---|---|---|---|---|---|
| A1 | สรุป "รูปแบบปลูกที่เลือก" | page-section | step:270-273 | echo of cultivation methods from step 2 | KEEP | ส่วนที่ ๒ ลักษณะพื้นที่ | Display-only echo of Outdoor/Indoor/Greenhouse chosen earlier; matches the form's ลักษณะพื้นที่ checkboxes |
| A2 | สรุป "แหล่งพันธุ์ที่แนบหลักฐาน x/y แหล่ง" | page-section | step:274-279 | count of seed rows with certificate/ภพ.4 file | MOVE_TO_AUDIT | facts §3 ข้อ 2 | Counter over uploads that are themselves audit-day evidence; goes wherever the uploads go |
| A3 | สรุป "ปัจจัยการผลิตที่กรอกครบ x/y รายการ" | page-section | step:280-285 | completed production-input rows | MOVE_TO_AUDIT | facts §3 ข้อ 1 | Counter for a panel that is audit-day record-keeping |
| A4 | irrigationType (hidden, seeded from farmData) | field | step:23-29, 57-60 | not rendered in this step; DRIP/SPRINKLER/MANUAL/FLOOD | CUT | — (ruling 2) | Not asked by กทล.1; irrigation belongs to SOP (A8)/production plan (A5) content, not a form field |
| A5 | hasGAPCert (hidden default false) | field | step:63 | not rendered | CUT | — (ruling 2) | No กทล.1 field asks about prior GAP certificate |
| A6 | hasOrganicCert (hidden default false) | field | step:64 | not rendered | CUT | — (ruling 2) | No กทล.1 field |
| A7 | varieties passthrough (PlantVariety[]) | behaviour | step:67-69, 252 | carried through, not editable here | CUT | ส่วนที่ ๒ ข้อ ๓ | Duplicate storage channel for ข้อ ๓ variety names alongside seedSources[].varietyName — unify into the ข้อ ๓ rows |
| A8 | DEMO_MODE validation bypass | behaviour | step:240 | validation skipped entirely in demo | CONDITIONAL | — | Demo scaffolding only; the production submission path must validate the DTAM-aligned required set |
| A9 | validate() required set | behaviour | step:184-237 | requires propagationType ≥1, plantParts ≥1, per-seed sourceType+supplierName | REWORD | ส่วนที่ ๒ ข้อ ๒-๓ | Required set must track the post-census field set: ข้อ ๓ per-source (รูปแบบพันธุ์, ชื่อพันธุ์/สายพันธุ์, แหล่งที่มา, ปริมาณ, นำเข้า/ในประเทศ) + ข้อ ๒ ต้น/รอบ, รอบ/ปี |
| A10 | ปุ่มถัดไป/ย้อนกลับ (step 5 ↔ 7) | behaviour | step:307-313 | ถัดไป / ย้อนกลับ | KEEP | — | Wizard mechanics |
| A11 | intendedUse (declared in step form type, not rendered here) | field | types:44 | — (type slot วัตถุประสงค์การใช้ผลผลิต) | REWORD | ส่วนที่ ๒ วัตถุประสงค์ | DTAM's วัตถุประสงค์ is exactly ☐ เพื่อใช้ทางการแพทย์ ☐ เพื่อการส่งออก; the repo's INTENDED_USE_OPTIONS (options.ts:107-114, 6 ค่า incl. อาหาร/เครื่องสำอาง/วิจัย) exceeds the form — wherever it renders, it must collapse to the two DTAM boxes |

### B. Info alert + Section 1 "วิธีการเพาะปลูก" (production-info-panels.tsx)

| # | Item | kind | file:line | UI shows | Verdict | DTAM ref | Note |
|---|---|---|---|---|---|---|---|
| B1 | Alert รูปแบบการเพาะปลูกที่เลือก | page-section | panels:65-70 | "รูปแบบการเพาะปลูกที่เลือก: … (เลือกไว้ที่ขั้นตอนที่ 2)" | KEEP | ส่วนที่ ๒ ลักษณะพื้นที่ | Read-only cross-step echo |
| B2 | Section 1) วิธีการเพาะปลูก | page-section | panels:79-177 | "ระบุวิธีขยายพันธุ์ วัสดุปลูก ชนิดดิน และรายละเอียดต้นที่ปลูก" | REWORD | ส่วนที่ ๒ ข้อ ๒-๓ | As a section, only 2 of its 7 controls have a กทล.1 home (ต้น/รอบ, รอบ/ปี → ข้อ ๒); rebuild as ข้อ ๒ ปริมาณการปลูก + fold the propagation split into ข้อ ๓ rows |
| B3 | วิธีการขยายพันธุ์ (multi-select, required) | field | panels:91-117 | ChoiceCard grid, "เลือกได้มากกว่า 1", required * | REWORD | ส่วนที่ ๒ ข้อ ๓ | กทล.1 has no standalone farm-level "วิธีขยายพันธุ์" box; it distinguishes เมล็ด vs ส่วนอื่นที่ไม่ใช่เมล็ด **per พันธุ์ entry** — fold into each ข้อ ๓ source row |
| B4 | — option เมล็ด (Seed) | option | panels:103 (options.ts:61) | เมล็ด (Seed) | KEEP | ส่วนที่ ๒ ข้อ ๓ | = the form's เมล็ด branch |
| B5 | — option กิ่งปักชำ (Cutting) | option | panels:103 (options.ts:62) | กิ่งปักชำ (Cutting) | REWORD | ส่วนที่ ๒ ข้อ ๓ | Sub-case of "ส่วนอื่นที่ไม่ใช่เมล็ด" — fine as a UX refinement inside that branch, not a separate top-level answer |
| B6 | — option เพาะเนื้อเยื่อ (Tissue Culture) | option | panels:103 (options.ts:63) | เพาะเนื้อเยื่อ (Tissue Culture) | REWORD | ส่วนที่ ๒ ข้อ ๓ | Same as B5 |
| B7 | — option กล้าพันธุ์ (Seedling) | option | panels:103 (options.ts:64) | กล้าพันธุ์ (Seedling) | REWORD | ส่วนที่ ๒ ข้อ ๓ | Same as B5 |
| B8 | — option อื่น ๆ | option | panels:103 (options.ts:65) | อื่น ๆ | REWORD | ส่วนที่ ๒ ข้อ ๓ | Same as B5 |
| B9 | วัสดุปลูก (Select) | field | panels:120-128 | "DTAM: รองรับทั้งดิน, ไฮโดรโปนิกส์, แอโรโปนิกส์" | CUT | — (ruling 2) | No กทล.1 field asks growing medium; the "DTAM:" description is a false attribution (nothing in facts.md) — growing-medium detail is SOP/A5 content |
| B10-16 | — options ดิน / กาบมะพร้าว / เพอร์ไลท์ / ร็อควูล / ไฮโดรโปนิกส์ / แอโรโปนิกส์ / ดินผสม-อื่น ๆ | option ×7 | panels:124 (options.ts:79-87) | 7 ค่า | CUT | — (ruling 2) | Fall with B9 |
| B17 | ชนิดดิน (Select) | field | panels:129-136 | "ระบุชนิดดินที่ใช้ปลูก" | CUT | — (ruling 2) | Not in กทล.1; soil-quality matters are audit-day GACP substance / SOP content, and lab soil tests are explicitly NOT required at submission (facts §3: กรมปกติไม่ตรวจแล็บ) |
| B18-24 | — options ดินร่วน / ดินร่วนปนทราย / ดินร่วนเหนียว / ดินทราย / ดินเหนียว / ดินพีท / อื่น ๆ-ไม่ใช้ดิน | option ×7 | panels:133 (options.ts:117-125) | 7 ค่า | CUT | — (ruling 2) | Fall with B17 |
| B25 | ระยะปลูก (TextInput) | field | panels:139-144 | "เช่น 1.5m × 1.5m หรือ 30 ต้น/ตร.ม." | CUT | — (ruling 2) | Not in กทล.1; plant-spacing belongs inside แผนการผลิต (A5) if the platform GENERATEs that plan |
| B26 | จำนวนต้นที่ปลูก (NumberInput) | field | panels:147-155 | description "จำนวนต้นทั้งหมดในฟาร์ม" | REWORD | ส่วนที่ ๒ ข้อ ๒ | กทล.1 asks ปริมาณการปลูก **ต้น/รอบ** (per plot, ข้อ ๒) — semantics "ทั้งหมดในฟาร์ม" is wrong unit; keep the number, fix semantics and attach it to the plot data of ข้อ ๒ |
| B27 | รอบการเก็บเกี่ยว/ปี (NumberInput) | field | panels:156-165 | description "กัญชา: 2-3 รอบ \| กระท่อม: 4-6 รอบ" | REWORD | ส่วนที่ ๒ ข้อ ๒ | Maps to ข้อ ๒ **รอบ/ปี** — keep, but the description names กระท่อม (violates ruling 5 cannabis-only); fix copy |
| B28 | ผลผลิตคาดการณ์ (กก./ปี) (NumberInput) | field | panels:166-174 | "ระบุปริมาณผลผลิตแห้งต่อปี" | CUT | — (A5) | Not a กทล.1 fill field; expected-yield lives in แผนการผลิต/แผนการใช้ประโยชน์ (attachment A5) — capture there if the platform generates A5 |

### C. Section 2 "ส่วนของพืชที่เก็บเกี่ยว" (production-info-panels.tsx)

| # | Item | kind | file:line | UI shows | Verdict | DTAM ref | Note |
|---|---|---|---|---|---|---|---|
| C1 | Section 2) ส่วนของพืชที่เก็บเกี่ยว | page-section | panels:180-208 | multi-select + count badge | KEEP | ส่วนที่ ๒ ข้อ ๓ | = "ส่วนของกัญชาที่ใช้"; form note: เกิน 2 ส่วนให้แนบรายละเอียดเพิ่ม — UI should surface that rule when >2 selected |
| C2 | plantParts (multi-select, required) | field | panels:191-207 | "เลือกส่วนที่จะเก็บเกี่ยว… (เลือกได้หลายอย่าง)" | KEEP | ส่วนที่ ๒ ข้อ ๓ | Required at ≥1 (step:207-209) — consistent with the form |
| C3 | — option ช่อดอก (Flower) | option | panels:194 (options.ts:70) | ช่อดอก (Flower) | KEEP | ส่วนที่ ๒ ข้อ ๓ | Cannabis part; form field is free-text ระบุส่วน — options are a legitimate UX aid |
| C4 | — option ใบ (Leaf) | option | panels:194 (options.ts:71) | ใบ (Leaf) | KEEP | ส่วนที่ ๒ ข้อ ๓ | |
| C5 | — option เมล็ด (Seed) | option | panels:194 (options.ts:72) | เมล็ด (Seed) | KEEP | ส่วนที่ ๒ ข้อ ๓ | |
| C6 | — option ราก (Root) | option | panels:194 (options.ts:73) | ราก (Root) | KEEP | ส่วนที่ ๒ ข้อ ๓ | |
| C7 | — option ลำต้น (Stem) | option | panels:194 (options.ts:74) | ลำต้น (Stem) | KEEP | ส่วนที่ ๒ ข้อ ๓ | |
| C8 | — option ทั้งต้น (Whole Plant) | option | panels:194 (options.ts:75) | ทั้งต้น (Whole Plant) | KEEP | ส่วนที่ ๒ ข้อ ๓ | |

### D. Section 3 "แหล่งที่มาพันธุ์พืช" (production-info-seed-sources-panel.tsx)

| # | Item | kind | file:line | UI shows | Verdict | DTAM ref | Note |
|---|---|---|---|---|---|---|---|
| D1 | Section 3) แหล่งที่มาพันธุ์พืช | page-section | seed:34-204 | repeatable source rows, subtitle "ตามมาตรฐาน DTAM" | KEEP | ส่วนที่ ๒ ข้อ ๓ | This is the wizard home of ข้อ ๓. **Missing field: ปริมาณ** (asked by ข้อ ๓ for every entry) — must be added on rebuild. Subtitle "ตามมาตรฐาน DTAM" is vague self-attribution; state the real basis (กทล.1 ส่วนที่ ๒ ข้อ ๓) |
| D2 | ปุ่มเพิ่มแหล่งที่มา | behaviour | seed:41-47 | เพิ่มแหล่งที่มา | KEEP | ส่วนที่ ๒ ข้อ ๓ | Form allows multiple entries; เกิน 2 ส่วน = แนบรายละเอียดเพิ่ม (platform can GENERATE that annex from rows 3+) |
| D3 | ปุ่มลบแหล่งเมล็ดพันธุ์ (per row) | behaviour | seed:59-66 | trash icon | KEEP | — | Row mechanics; last row is re-seeded empty (step:158-163) |
| D4 | ประเภทแหล่งที่มา (Select, required; data = PROPAGATION_OPTIONS reused) | field | seed:71-78 | เมล็ด/กิ่งปักชำ/เพาะเนื้อเยื่อ/กล้าพันธุ์/อื่น ๆ | REWORD | ส่วนที่ ๒ ข้อ ๓ | Label says "ประเภทแหล่งที่มา" but the data is propagation forms — the ข้อ ๓ split is **เมล็ด vs ส่วนอื่นที่ไม่ใช่เมล็ด**; relabel to รูปแบบพันธุ์ที่ใช้ with those two branches (propagation form as sub-detail). Options not re-listed here — same 5 values as B4-B8 (options.ts:60-66), default 'SEED' (types:51) |
| D5 | ชื่อผู้จำหน่าย (TextInput, required) | field | seed:79-86 | "ชื่อร้าน/บริษัท" | REWORD | ส่วนที่ ๒ ข้อ ๓ | = the form's แหล่งที่มา, but "ผู้จำหน่าย" wrongly presumes purchase — a source can be self-produced/received; relabel แหล่งที่มา (free text) |
| D6 | ที่อยู่ผู้จำหน่าย (ถ้ามี) | field | seed:90-95 | "จังหวัด/อำเภอ" | OPTIONAL | ส่วนที่ ๒ ข้อ ๓ | Elaborates แหล่งที่มา; already labeled ถ้ามี — must count for nothing |
| D7 | เบอร์โทรผู้จำหน่าย (ถ้ามี) | field | seed:96-101 | "0xx-xxx-xxxx" | CUT | — (ruling 2) | No ข้อ ๓ basis; supplier phone is not part of แหล่งที่มา |
| D8 | ชื่อสายพันธุ์ (ตามเอกสาร) | field | seed:105-110 | "เช่น Thai Stick, Critical Kush" | KEEP | ส่วนที่ ๒ ข้อ ๓ | = ชื่อพันธุ์ (เมล็ด) / สายพันธุ์ (ส่วนอื่น) |
| D9 | ประเภทสายพันธุ์ (Select) | field | seed:111-117 | Sativa/Indica/Hybrid/Local/Unknown | CUT | — (ruling 2) | กทล.1 does not ask sativa/indica classification |
| D10-14 | — options Sativa / Indica / Hybrid (ลูกผสม) / พันธุ์ท้องถิ่น (Local) / ไม่ทราบ | option ×5 | seed:114 (options.ts:129-133) | 5 ค่า | CUT | — (ruling 2) | Fall with D9 |
| D15 | แหล่งภูมิศาสตร์ (GEO) | field | seed:118-123 | "จังหวัด/ประเทศต้นกำเนิดพันธุ์" | REWORD | ส่วนที่ ๒ ข้อ ๓ | The form asks a binary **นำเข้า/ในประเทศ** (for เมล็ด) — replace free-text GEO with that choice (+ ระบุประเทศ when นำเข้า as UX detail) |
| D16 | วันที่ซื้อ (date) | field | seed:126-131 | date input | MOVE_TO_AUDIT | facts §3 ข้อ 2 | Purchase dates belong to เอกสารสั่งซื้อ/ใบรับวัตถุดิบ — inspected ณ แปลง, not filed at submission |
| D17 | checkbox มีเอกสารรับรองสายพันธุ์ | option | seed:137-142 | accordion toggle | MOVE_TO_AUDIT | facts §3 ข้อ 2 | "ใบรับรองวัตถุดิบ" is named audit-day evidence; not a กทล.1 ส่วนที่ ๓ attachment |
| D18 | เลขที่ใบรับรอง | field | seed:147-152 | "เช่น CERT-2024-001" | MOVE_TO_AUDIT | facts §3 ข้อ 2 | Falls with D17 |
| D19 | อัปโหลดใบรับรอง (FileInput .pdf/.jpg/.jpeg/.png) | upload-surface | seed:153-161 | "เลือกไฟล์ PDF หรือรูปภาพ" | MOVE_TO_AUDIT | facts §3 ข้อ 2 | Falls with D17 |
| D20 | checkbox ภพ.4 รับรอง | option | seed:169-174 | accordion toggle | CUT | — (ruling 2) | No กทล.1 attachment matches; "ภพ.4" is a VAT-form designation while the placeholder suggests an agriculture registry — semantics unverifiable and no DTAM basis either way |
| D21 | เลขทะเบียนภพ.4 | field | seed:179-184 | "เช่น ท.กษ. 1234/2567" | CUT | — (ruling 2) | Falls with D20 |
| D22 | อัปโหลดเอกสารภพ.4 (FileInput) | upload-surface | seed:185-193 | "เลือกไฟล์ PDF หรือรูปภาพ" | CUT | — (ruling 2) | Falls with D20 |

### E. Section 4 "ปัจจัยการผลิต" (production-info-production-inputs-panel.tsx) — ALL MOVE_TO_AUDIT

facts.md §3 ข้อ 1: "บันทึกการซื้อ/ใช้ปัจจัยการผลิต" is วันตรวจ ณ แปลง evidence. No กทล.1 field or attachment asks for it at submission.

| # | Item | kind | file:line | UI shows | Verdict | DTAM ref | Note |
|---|---|---|---|---|---|---|---|
| E1 | Section 4) ปัจจัยการผลิต | page-section | inputs:36-183 | "ปุ๋ย ยาป้องกันศัตรูพืช สารปรับปรุงดิน และสารชีวภัณฑ์ที่ใช้ในการผลิต" | MOVE_TO_AUDIT | facts §3 ข้อ 1 | Whole panel = บันทึกการซื้อ/ใช้ปัจจัยการผลิต; belongs in the post-cert cultivation-records surface, not the application |
| E2 | ปุ่มเพิ่มปัจจัยการผลิต | behaviour | inputs:45-47 | เพิ่มปัจจัยการผลิต | MOVE_TO_AUDIT | facts §3 ข้อ 1 | |
| E3 | Empty-state alert | behaviour | inputs:52-54 | "ไม่มีปัจจัยการผลิต (หากใช้เกษตรอินทรีย์ 100% ไม่ต้องเพิ่ม)" | MOVE_TO_AUDIT | facts §3 ข้อ 1 | Copy also unreachable in practice: state re-seeds a default row when the last is removed (step:177-182) |
| E4 | ปุ่มลบปัจจัยการผลิต (per row) | behaviour | inputs:61-67 | trash icon | MOVE_TO_AUDIT | facts §3 ข้อ 1 | |
| E5 | ประเภท (Select, default FERTILIZER) | field | inputs:72-78 | ปุ๋ย/วัสดุปรับปรุงดิน/สารป้องกันกำจัดศัตรูพืช/อื่น ๆ | MOVE_TO_AUDIT | facts §3 ข้อ 1 | Default 'FERTILIZER' at types:59 |
| E6-9 | — options ปุ๋ย / วัสดุปรับปรุงดิน / สารป้องกันกำจัดศัตรูพืช / อื่น ๆ | option ×4 | inputs:74 (options.ts:90-95) | 4 ค่า | MOVE_TO_AUDIT | facts §3 ข้อ 1 | |
| E10 | ชนิด (Select bound to boolean isOrganic) | field | inputs:79-85 | อินทรีย์/เคมี/ชีวภาพ | MOVE_TO_AUDIT | facts §3 ข้อ 1 | BUG (recorded only): value renders `isOrganic ? 'ORGANIC' : 'CHEMICAL'` — the BIO option can be picked but never displays and stores as CHEMICAL |
| E11-13 | — options อินทรีย์ (Organic) / เคมี (Chemical) / ชีวภาพ (Bio-fertilizer) | option ×3 | inputs:81 (options.ts:98-102) | 3 ค่า | MOVE_TO_AUDIT | facts §3 ข้อ 1 | |
| E14 | ยี่ห้อ | field | inputs:89-94 | "เช่น ปุ๋ยตรากระต่าย" | MOVE_TO_AUDIT | facts §3 ข้อ 1 | |
| E15 | ชื่อสินค้า | field | inputs:95-101 | "เช่น NPK 15-15-15" | MOVE_TO_AUDIT | facts §3 ข้อ 1 | |
| E16 | เลขทะเบียนปุ๋ย (จากระบบรับรองมาตรฐาน GACP สมุนไพร) — FERTILIZER only | field | inputs:106-113 | "เช่น ท.6/2567" | MOVE_TO_AUDIT | facts §3 ข้อ 1 | Label semantics also wrong: fertilizer registration numbers are issued under พ.ร.บ.ปุ๋ย (กรมวิชาการเกษตร), not "ระบบรับรองมาตรฐาน GACP สมุนไพร" — REWORD if it survives on the audit surface |
| E17 | สูตร NPK (ถ้ามี) — FERTILIZER only | field | inputs:116-121 | "15-15-15" | MOVE_TO_AUDIT | facts §3 ข้อ 1 | |
| E18 | ปริมาณที่ใช้ — FERTILIZER only | field | inputs:122-129 | NumberInput | MOVE_TO_AUDIT | facts §3 ข้อ 1 | Usage quantity = usage record |
| E19 | หน่วย — FERTILIZER only | field | inputs:130-141 | kg/g/L/mL | MOVE_TO_AUDIT | facts §3 ข้อ 1 | Options inline in file (not from constants) |
| E20-23 | — options กิโลกรัม (kg) / กรัม (g) / ลิตร (L) / มิลลิลิตร (mL) | option ×4 | inputs:132-137 | 4 ค่า | MOVE_TO_AUDIT | facts §3 ข้อ 1 | |
| E24 | วันที่ใช้ — FERTILIZER only | field | inputs:144-150 | date input | MOVE_TO_AUDIT | facts §3 ข้อ 1 | A usage date is by definition a cultivation-activity record |
| E25 | วิธีการใส่ — FERTILIZER only | field | inputs:151-162 | โรยทั่ว/หยอดหลุม/ฉีดพ่น/ผสมน้ำรด | MOVE_TO_AUDIT | facts §3 ข้อ 1 | Options inline in file |
| E26-29 | — options โรยทั่ว / หยอดหลุม / ฉีดพ่น / ผสมน้ำรด | option ×4 | inputs:153-158 | 4 ค่า | MOVE_TO_AUDIT | facts §3 ข้อ 1 | |
| E30 | แหล่งที่มา (Select) | field | inputs:167-176 | ซื้อจากร้านค้า/ผลิตเอง | MOVE_TO_AUDIT | facts §3 ข้อ 1 | Purchase provenance = purchase record |
| E31-32 | — options ซื้อจากร้านค้า / ผลิตเอง | option ×2 | inputs:169-172 | 2 ค่า | MOVE_TO_AUDIT | facts §3 ข้อ 1 | |

### F. Conditional render branches checked

- `input.type === 'FERTILIZER'` (inputs:104-165) — fertilizer-only block (E16-E29). Only conditional branch in the inputs panel; other types show only ประเภท/ชนิด/ยี่ห้อ/ชื่อสินค้า/แหล่งที่มา.
- Seed accordion panels render behind checkboxes D17/D20 (always mounted, disclosure only).
- No per-applicant-type or per-area-type branches exist in these five files; the only cross-step conditioning is the read-only cultivation-methods echo (A1/B1).
- Legacy-draft coercion: single-string propagationType → array (step:48-55) — migration behaviour, no census impact.

### G. Gaps vs กทล.1 ข้อ ๓ (things the UI does NOT ask but the form does)

1. **ปริมาณ** per พันธุ์/source entry (เมล็ด: ปริมาณ; ส่วนอื่น: ปริมาณ) — absent everywhere in this step.
2. **นำเข้า/ในประเทศ** as the form's explicit binary — only approximated by free-text GEO (D15).
3. **กรณีแปรรูป: ส่วนของพืช/สายพันธุ์/แหล่งที่มา/ปริมาณ** — no แปรรูป branch in this step (may live in another area's files; flagged for the coordinator's cross-area merge).
4. **เกิน 2 ส่วนให้แนบรายละเอียดเพิ่ม** — no UI handling; candidate GENERATE (platform can render the annex from rows 3+).
