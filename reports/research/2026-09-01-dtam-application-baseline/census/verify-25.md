# verify-25 — skeptic check: หมวดเลือกพืชหลัก (plant picker)

- **Item under challenge**: `apps/web-app/src/app/health/applications/new/_steps/steps/plant-selection-config-panels.tsx:79` — section "1) เลือกพืชหลัก — เลือกเฉพาะชนิดพืชที่เปิดให้ยื่นคำขอในระบบ", proposed **CUT** (dtamRef: ruling 5, facts.md:71)
- **Role**: skeptic — tried to refute the CUT by finding any named Thai-law / ministry-system basis requiring plant selection at application time for cannabis
- **Result**: **UPHELD — CUT stands.** No refuting basis found.

## 1. Refutation attempts and why each failed

| # | Candidate basis | Where checked | Why it does NOT rescue the picker |
|---|---|---|---|
| 1 | กทล.1 itself has a plant field? | facts.md §1 (ส่วนที่ ๑, ๒, ๔ — "ทั้งหมดที่ฟอร์มขอ ไม่มีมากกว่านี้", facts.md:20) | The form is titled **"แบบกัญชา กทล 1"** (facts.md:4) — cannabis-specific by construction. No plant-species field exists anywhere in ส่วนที่ ๑–๔. |
| 2 | กทล.1 ส่วนที่ ๒ ข้อ ๓ "พันธุ์และส่วนของกัญชาที่ใช้" (facts.md:25) | facts.md:25 | That is **variety within cannabis** (ชื่อพันธุ์เมล็ด, สายพันธุ์, แหล่งที่มา, ปริมาณ) — a different item, mapped to the cultivation step ("ที่มาพันธุ์", plant-selection-config.ts:306). A species picker is not that field and cutting the picker loses none of it. |
| 3 | "Keep it for future herbs" (kratom/turmeric rows exist in FALLBACK_PLANTS, plant-selection-config.ts:87-142) | facts.md:71 (ruling 5) | Ruling 5 explicitly says other plants later = **ชุด field/กติกาใหม่ ไม่ reuse ของกัญชา** — the future-proofing argument is pre-rejected by the operator. |
| 4 | กฎกระทรวง พ.ศ. 2559 (สมุนไพรควบคุม / ภท. forms) | `apps/backend/constants/document-slots.js:8-31` | That กฎกระทรวง governs the **ภท. licence forms** (a separate census item — the M1/licence slots). Its `requiredFor.plantTypes: ['cannabis','kratom']` gating is platform config, not a form field asking the applicant to choose a species. With scope fixed to cannabis, the licence rule attaches directly; no picker needed. |
| 5 | "ประกาศGACP Thai Platform พ.ศ. 2568" | document-slots.js:8 | The platform's **own** announcement — not Thai law, not a ministry system. Cannot be a basis under ruling 1 (facts.md:67). |
| 6 | Backend schema requires plantId? | `apps/backend/prisma/schema/application.prisma:305` (`plantId String?`) | Nullable, internal linkage. An internal system need is satisfiable by a constant (cannabis) and is not a legal basis by the census rules. |
| 7 | Docs naming a law for species choice | grep docs/ for เลือกพืช/ชนิดพืช/กฎกระทรวง/ประกาศ | All hits describe the current system's own behavior (manuals, walkthroughs, QA scripts) — self-referential, not a legal source. `docs/requirements/official-gacp-requirements-dtam.md:213` lists พ.ร.บ.กัญชา กัญชง as a **draft (ร่าง 2567)** — a draft bill about cannabis, not a species-selection requirement. |
| 8 | DTAM e-service upload list | facts.md:75 | Marked **UNVERIFIED** by the coordinator (domain unreachable) — cannot be cited as a basis. |

## 2. Verdict on the assigned item

**CUT — upheld.**
- Citation: facts.md:71 (ruling 5 — เปิดบริการกัญชาอย่างเดียว, พืชอื่น = ชุดใหม่ไม่ reuse) + facts.md:67-68 (ruling 1 — required set = กทล.1 เท่านั้น; ruling 2 — เกิน DTAM = ตัด) + facts.md:4 (กทล.1 คือ "แบบกัญชา" — ไม่มีช่องเลือกพืช).
- Scope of the cut matches the proposal: the whole section at panels.tsx:79-238 — the featured plant grid (line 96-155), the radio circles, the "พร้อมยื่น / ยังไม่เปิดรับ" badges (lines 143-145, 220-222), and the collapsed "ตัวเลือกพืชอื่น" details block (lines 158-235, 5 disabled herbs). Every surface in it exists only to choose among species; with cannabis as the fixed scope, none has a DTAM or Thai-law basis.
- **Implementation caveat (not a basis to keep the UI)**: the picker currently derives `availableServiceTypes` per plant (plant-selection-config.ts:23, cannabis → NEW/RENEWAL/MODIFY) which feeds the section-2 filter (panels.tsx:258). When the picker is cut, service-type options must source from the fixed cannabis scope. `selectedPlantId` becomes a constant (`cannabis`).

## 3. Full census of surfaces in plant-selection-config-panels.tsx

The assigned item is section 1 only; the remaining surfaces in this file are listed for census completeness with skeptic observations (their verdicts belong to their own census items).

| file:line | Surface | Current TH label | This item? | Observation (citation) |
|---|---|---|---|---|
| panels.tsx:79-87 | Section header | "1) เลือกพืชหลัก — เลือกเฉพาะชนิดพืชที่เปิดให้ยื่นคำขอในระบบ" | **YES — CUT** | ruling 5 (facts.md:71); กทล.1 has no plant field |
| panels.tsx:96-155 | Featured plant radio cards (cannabis enabled; kratom in featured/hidden split per store) | "กัญชา" ฯลฯ + radio | **YES — CUT** | same |
| panels.tsx:143-145, 220-222 | Availability badges | "พร้อมยื่น" / "ยังไม่เปิดรับ" | **YES — CUT** | same — badge only exists to serve the multi-plant list |
| panels.tsx:158-235 | Collapsed `<details>` "ตัวเลือกพืชอื่น" + count chip; 5 disabled herbs (กระท่อม ขมิ้นชัน ขิง ไพล กระชายดำ — config.ts:97-142) | "ตัวเลือกพืชอื่น" | **YES — CUT** | same; ruling 5 pre-rejects keeping them for later |
| panels.tsx:240-295 | Section "2) ประเภทบริการ" — radio NEW/RENEWAL/MODIFY (config.ts:144-172) | "ขอรับรองใหม่ / ต่ออายุใบรับรอง / แก้ไขรายละเอียดใบรับรอง" | no (separate item) | กทล.1 header has ประเภทคำขอ รายใหม่/ต่ออายุ/**ใบแทน** (facts.md:18) — MODIFY≠ใบแทน; that item's verifier should weigh KEEP+REWORD |
| panels.tsx:248-253 | Pre-selected hint chip | "เลือกอัตโนมัติจากขั้นตอนที่ 1 สามารถเปลี่ยนได้หากต้องการ" | no | references the plant step; copy must change when section 1 is cut |
| panels.tsx:297-344 | Section "3) วัตถุประสงค์การรับรอง" — multi-select COMMERCIAL/EXPORT/RESEARCH (config.ts:207-232) | "เพื่อการพาณิชย์ในประเทศ / เพื่อการส่งออก / เพื่อการวิจัย" | no (separate item) | กทล.1 ส่วนที่ ๒ purposes are ☐ ทางการแพทย์ ☐ ส่งออก only (facts.md:21) |
| panels.tsx:346-416 | M1 upload slots ภท.11/ภท.09/ภท.10 via DocumentUploader (config.ts:180-205), required-count badges, uploaded-count badge, missing-docs warning | "เอกสาร M1 ที่ต้องแนบ" ฯลฯ | no (separate item) | กทล.1 จนท. checklist asks for the **ใบอนุญาต/หนังสือสำคัญ** itself, "ไม่ใช่แบบคำขอ ภท." (facts.md:56) — REWORD territory for that item's verifier |
| panels.tsx:419-465 | Section "4) รูปแบบการปลูกที่ขอรับรอง" — multi-select outdoor/greenhouse/indoor (config.ts:234-256) | no (separate item) | กทล.1 ส่วนที่ ๒ has ลักษณะพื้นที่ ☐ Outdoor ☐ Indoor ☐ Greenhouse ☐ อื่นๆ (facts.md:22) — form basis exists but as area character, and the "อื่น ๆ ระบุ" option is missing |
| panels.tsx:467-488 | Fee summary panel (methods count × ฿5,000 + ฿25,000, estimated total) | "จำนวนรูปแบบที่เลือก / ค่าตรวจเอกสาร / ค่าลงพื้นที่ / ยอดรวมโดยประมาณ" | no (separate item) | platform payment mechanics, not a กทล.1 field |

## 4. Bottom line

The census's CUT verdict on the plant-picker section is correct and its citation (ruling 5, facts.md:71; กทล.1 is cannabis-specific with no plant field) holds. Eight refutation angles were tried; none produced a named Thai-law or ministry-form basis for a species picker at application time. upheld=true, correctedVerdict=CUT.
