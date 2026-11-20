# Census — AREA backend-slots (2026-09-01)

Authority: `reports/research/2026-09-01-dtam-application-baseline/facts.md` (กทล.1 + ข้อกำหนด + 7 rulings). Read end-to-end before any verdict.

Files read IN FULL:
- `apps/backend/constants/document-slots.js` (504 lines)
- `apps/backend/services/application-document-requirements.js` (250 lines)
- `apps/backend/routes/api/applications/validation-slot-utils.js` (60 lines)
- `apps/backend/prisma/migrations/20260815200000_requirement_rules/migration.sql` (86 lines)
- `apps/backend/services/requirement-rule-service.js` (281 lines)
- supporting SSOT (re-exported by validation-slot-utils.js): `packages/validation/src/upload-rules.js` (663 lines)

## 0. Corrections to the task premise (counted, not assumed)

- **DOCUMENT_SLOTS has 39 entries, not 47** (document-slots.js:21-323). Counted by key: 9 licence slots, 2 land, 6 person/juristic, 5 SOP, 2 maps, 5 photos, 2 juristic-extra, 2 renewal, 3 GACP forms, 3 deprecated form aliases.
- One additional slot id, `lab_certificate`, is referenced at document-slots.js:453 in `getObjectiveWarnings` but has **no entry** in DOCUMENT_SLOTS.

## 1. What requirement_rules currently seeds (the actual law the submit gate enforces)

Migration `20260815200000_requirement_rules/migration.sql:79-83` seeds exactly **two** rules:

| id | holderType | slotId | isRequired | maxAge | basis in facts.md |
|---|---|---|---|---|---|
| `m2a-seed-juristic-company-reg` (line 81) | JURISTIC | `company_reg` | true | 6 mo | §2 กลุ่มคุณสมบัติ นิติบุคคล — หนังสือรับรองจดทะเบียน "ออกให้ไม่เกิน 6 เดือน" (the 6-month freshness even matches the form) |
| `m2a-seed-community-cert` (line 82) | COMMUNITY_ENTERPRISE | `community_cert` | true | 6 mo | §2 กลุ่มคุณสมบัติ วิสาหกิจชุมชน — สำเนาหนังสือจดทะเบียนวิสาหกิจชุมชน (the 6-month freshness here is platform practice, not in กทล.1 — กทล.1 asks สถานะยังดำเนินกิจการ + วัตถุประสงค์สอดคล้อง + บัญชีรายชื่อสมาชิก) |

Consequence, verified in code: `assertRequiredDocumentsPresent` (application-document-requirements.js:166-221) reads **only** `rulesAt()` on first submit. So the legally-enforced mandatory set at the submit door today is: *nothing for INDIVIDUAL, company_reg for JURISTIC, community_cert for COMMUNITY_ENTERPRISE*. None of the กทล.1 universal set (A1, A3, A5, A6, A7, A8) is seeded as a rule. The `required: true` flags in DOCUMENT_SLOTS drive other surfaces (wizard/UI helpers `getRequiredSlots`/`getRequiredDocuments`), not this legal gate.

Also verified: `requestType` at the gate is derived as `formData.renewalOf ? 'RENEWAL' : 'NEW'` (application-document-requirements.js:199) — **REPLACEMENT can never be resolved at the gate**, so any REPLACEMENT-dimension rule would be dead law at this door.

## 2. Slot-by-slot census of DOCUMENT_SLOTS (39 entries) vs กทล.1 ส่วนที่ ๓ (facts.md §2)

Alias note (upload-rules.js:178-209): `license_bt11/license_pt11/LICENSE_BT11/LICENSE_PT11` are ONE canonical slot (`license_bt11`); same for bt13/pt13, bt16/pt16, form_09→form_gacp_application, photos_site→photos_exterior. The requirement engine compares canonically on both sides.

### Licence family (9 slots) — the central finding

กทล.1's only licence demand is in the officer checklist (facts.md:56, ส่วน จนท. 1.1): "**ใบอนุญาต/หนังสือสำคัญ กรณีการปลูก/แปรรูปกัญชาที่ต้องได้รับอนุญาตตามกฎหมายที่เกี่ยวข้อง**" — i.e. the *actual licence*, conditionally, and facts.md:75 marks the exact governing statute UNVERIFIED. The platform instead ships 9 slots asking mostly for ภท. *request forms*, two of them `required: true` for cannabis+kratom (kratom violates ruling 5 — cannabis only).

| slot (file:line) | current Thai label | verdict | citation / note |
|---|---|---|---|
| LICENSE_BT11 (26) | แบบ บท.11 / ภท.11 (คำขออนุญาตสมุนไพรควบคุม) — required:true, cannabis+kratom | **CUT** | Legacy duplicate; alias-folds into the same canonical slot as PT11 (upload-rules.js:193). One slot must survive, reworded — see PT11. |
| LICENSE_BT13 (34) | แบบ บท.13 (ใบอนุญาตแปรรูปสมุนไพรควบคุม) — conditional PROCESSING/MANUFACTURING | **CUT** | Legacy duplicate of PT13 (alias upload-rules.js:195); no กทล.1 ส่วนที่ ๓ row; any processing-licence proof belongs to the one reworded conditional licence slot (จนท. 1.1). |
| LICENSE_BT16 (43) | แบบ บท.16 (คำขอรับใบแทนใบอนุญาต) — conditional REPLACEMENT | **CUT** | กทล.1 ใบแทน case = ใบแจ้งความ (สูญหาย) / ใบรับรองเดิม (ถูกทำลาย) (facts.md:53) — about the GACP certificate, not a herb-control-licence replacement request form. |
| LICENSE_PT09 (55) | แบบ ภ.ท.9 (คำขออนุญาตศึกษาวิจัย) — conditional RESEARCH, STUB | **CUT** | กทล.1 ส่วนที่ ๒ objectives are only ☐ การแพทย์ ☐ ส่งออก (facts.md:21). "RESEARCH" objective has no DTAM basis; slot has none either. |
| LICENSE_PT10 (66) | แบบ ภ.ท.10 (คำขออนุญาตส่งออก) — conditional EXPORT, STUB | **CUT** | ส่งออก is a lawful objective (facts.md:21) but ส่วนที่ ๓ demands no ภท.10 request form at filing. |
| LICENSE_PT11 (77) | แบบ ภ.ท.11 (คำขออนุญาตจำหน่าย/แปรรูป) — required:true, cannabis+kratom, STUB | **REWORD** | The surviving licence slot, with three fixes: (1) it must ask for the **ตัวใบอนุญาต/หนังสือสำคัญ**, not the ภท.11 REQUEST form (facts.md:56 explicitly: "คือ*ตัวใบอนุญาต* ไม่ใช่แบบคำขอ ภท."); (2) conditional ("กรณีที่ต้องได้รับอนุญาตตามกฎหมายที่เกี่ยวข้อง"), not required:true — pending the UNVERIFIED statute check (facts.md:75); (3) drop kratom (ruling 5). |
| LICENSE_PT12 (87) | แบบ ภ.ท.12 (คำขอจำหน่าย/ครอบครอง) — conditional COMMERCIAL/POSSESSION, STUB | **CUT** | No such objectives in กทล.1 ส่วนที่ ๒; no ส่วนที่ ๓ row. Its description even mislabels itself "(กัญชา กทล.1)". |
| LICENSE_PT13 (98) | แบบ ภ.ท.13 (ใบอนุญาตแปรรูป) — conditional PROCESSING/MANUFACTURING | **CUT** | Same reasoning as BT13; folded into the reworded conditional licence slot. |
| LICENSE_PT16 (107) | แบบ ภ.ท.16 (คำขอรับใบแทนใบอนุญาต) — conditional REPLACEMENT | **CUT** | Same as BT16 — the กทล.1 replacement set is ใบแจ้งความ/ใบรับรองเดิม (facts.md:53), neither of which has a slot (see §4 gaps). |

### Land (2)

| slot | label | verdict | citation |
|---|---|---|---|
| LAND_DEED (118) | โฉนดที่ดิน / น.ส.3 / น.ส.4 — required:true | **KEEP** | A1 (facts.md:35, ทุกราย). Label should widen to cover "หนังสืออนุญาตใช้ที่ดินรัฐ" which A1 also accepts. |
| LAND_LEASE (124) | สัญญาเช่าที่ดิน — required:false, no conditional wiring | **CUT** | กทล.1 A2 (facts.md:36) asks for **หนังสือยินยอมจากผู้ให้เช่า/ผู้ให้ใช้ที่ดิน** in the เช่า case — the consent letter (LAND_CONSENT), not the lease contract. No ส่วนที่ ๓ row asks for the contract. |

### Person / applicant (6)

| slot | label | verdict | citation |
|---|---|---|---|
| ID_CARD (132) | สำเนาบัตรประชาชน — required:true | **KEEP** | ส่วน จนท. 1.1 (facts.md:56): ☐ บัตร ปชช.+ทะเบียนบ้านผู้ยื่น/วิสาหกิจ; ส่วนที่ ๑ also collects เลขบัตร ปชช. |
| HOUSE_REG (138) | สำเนาทะเบียนบ้าน — required:true | **KEEP** | Same จนท. 1.1 row; ส่วนที่ ๑.๑ collects เลขรหัสประจำบ้าน. |
| COMPANY_REG (144) | หนังสือรับรองบริษัท (≤6 เดือน) — conditional JURISTIC + COMMUNITY_ENTERPRISE | **CONDITIONAL** | นิติบุคคล qualification row (facts.md:50) — JURISTIC only. **Remove COMMUNITY_ENTERPRISE** from requiredFor: วิสาหกิจชุมชน (ไม่เป็นนิติบุคคล) files COMMUNITY_CERT instead (facts.md:48). Seeded correctly (JURISTIC only) in requirement_rules:81. |
| CRIMINAL_BG (153) | ผลตรวจสอบประวัติอาชญากรรม — required:true | **CUT** | No row anywhere in กทล.1 or ข้อกำหนด. Its own warningText says "GACP Thaiกำหนดให้ต้องมี" — a platform extra, forbidden by ruling 1/2 (facts.md:67-68). |
| LAND_CONSENT (160) | หนังสือยินยอมให้ใช้ที่ดิน — conditional landOwnership=['permitted_use'] | **CONDITIONAL** | A2 (facts.md:36). Wiring bug: A2 binds **เช่า AND ขอใช้ที่ดินผู้อื่น**; the condition covers only `permitted_use`, so the เช่า case escapes. Extend to the rented case (กทล.1 ส่วนที่ ๒ ข้อ ๒ status: เจ้าของ/ได้รับอนุญาตใช้ที่ดินรัฐ/เช่า). |
| GOV_SUPPORT (168) | หนังสือสนับสนุนจากหน่วยงาน — conditional COMMUNITY_ENTERPRISE | **CUT** | No กทล.1 basis. The real per-type letters (มอบหมายดำเนินกิจการแทนวิสาหกิจ; ความร่วมมือผู้รับอนุญาตผลิตยา for individuals; ผู้มีอำนาจทำการแทน for juristic — facts.md:48-50) have NO slots — see §4. |

### SOP (5) — one legal row, five slots

A8 (facts.md:43) asks for **one** คู่มือมาตรฐานการปฏิบัติงาน (SOP), ทุกราย. Ruling 2: excess = cut.

| slot | label | verdict | citation |
|---|---|---|---|
| SOP_CULTIVATION (178) | SOP การปลูก — required:true | **REWORD** | Becomes the single A8 slot "คู่มือมาตรฐานการปฏิบัติงาน (SOP)" (facts.md:43). |
| SOP_HARVEST (184) | SOP การเก็บเกี่ยว — required:true | **CUT** | Content belongs inside the one A8 manual; no separate ส่วนที่ ๓ row. |
| SOP_PROCESSING (190) | SOP การแปรรูป — required:false | **CUT** | Same — processing scope is covered inside A8/A5 for the แปรรูป request type. |
| SOP_STORAGE (196) | SOP การเก็บรักษา — required:true | **CUT** | Same fold into A8. |
| SOP_PEST (202) | SOP การจัดการศัตรูพืช — required:true | **CUT** | Same fold into A8; pest-control *records* are audit-day material (facts.md:61, MOVE_TO_AUDIT territory), not filing-day. |

### Maps (2)

| slot | label | verdict | citation |
|---|---|---|---|
| SITE_MAP (210) | แผนผังแปลงปลูก — required:true | **KEEP** | A3 (facts.md:37). Description should demand the A3 elements: ที่ตั้ง + พิกัด + เส้นทางเข้าถึง + ขนาดแปลง + สิ่งปลูกสร้างใกล้เคียง. |
| FACILITY_MAP (216) | แผนผังอาคาร — required:false, no wiring | **CONDITIONAL** | A4 (facts.md:38) — แบบแปลนอาคาร/โรงเรือน required **only Indoor/Greenhouse**. Currently not wired to ลักษณะพื้นที่ at all; must key off the ส่วนที่ ๒ area-type answer. |

### Photos (5)

| slot | label | verdict | citation |
|---|---|---|---|
| PHOTOS_EXTERIOR (224) | ภาพถ่ายภายนอก — required:true | **KEEP** | A7 ทุกราย (facts.md:42) + A4′ Outdoor (facts.md:39) + the ภายนอก half of A4 for Indoor/Greenhouse. |
| PHOTOS_INTERIOR (231) | ภาพถ่ายภายใน — required:false, no wiring | **CONDITIONAL** | A4 (facts.md:38): ภาพถ่าย…ภายใน required **only Indoor/Greenhouse**; wire to area type. |
| PHOTOS_STORAGE (238) | ภาพถ่ายคลังเก็บ — required:false | **CUT** | No กทล.1 row; §3 storage items are audit-day records, and even there they are records not photos. |
| PHOTOS_SIGNAGE (245) | ภาพถ่ายป้าย — required:true | **CUT** | No กทล.1/ข้อกำหนด row anywhere; a `required:true` platform extra (ruling 1/2). |
| PHOTOS_SITE (253) | ภาพถ่ายพื้นที่ (รวม) — deprecated | **CUT** | Deprecated legacy; alias-folds into photos_exterior (upload-rules.js:200). |

### Juristic extras (2)

| slot | label | verdict | citation |
|---|---|---|---|
| COMMUNITY_CERT (262) | หนังสือจดทะเบียนวิสาหกิจชุมชน — conditional COMMUNITY_ENTERPRISE | **CONDITIONAL** | วิสาหกิจชุมชน qualification row (facts.md:48). Seeded in requirement_rules:82. Must carry the A-row's full semantics: สถานะยังดำเนินกิจการ + วัตถุประสงค์สอดคล้อง + บัญชีรายชื่อสมาชิก (รหัส สวช.01 is collected in ส่วนที่ ๑.๑). |
| COOP_CERT (270) | หนังสือสำคัญสหกรณ์การเกษตร — conditional AGRICULTURAL_COOP | **CONDITIONAL** | นิติบุคคล row (facts.md:50) lists สหกรณ์การเกษตร registration as an accepted alternative. Dead wiring today: `AGRICULTURAL_COOP` is not an entities.type (migration.sql:36 documents INDIVIDUAL/JURISTIC/COMMUNITY_ENTERPRISE), so the condition can never fire through the requirement engine — fold into the JURISTIC qualification alternatives. |

### Renewal (2)

| slot | label | verdict | citation |
|---|---|---|---|
| RENEWAL_REPORT (280) | รายงานผลการดำเนินการ — conditional RENEWAL | **CONDITIONAL** | กรณีต่ออายุ (facts.md:52): รายงานสรุปผลการดำเนินการที่ผ่านมา. |
| PREVIOUS_CERT (288) | ใบรับรอง GACP เดิม — conditional RENEWAL | **CONDITIONAL** | facts.md:52 says **ต้นฉบับ**ใบรับรองเก่า; description says "สำเนา…ที่หมดอายุ" — align wording to ต้นฉบับ. Renewal also needs แผนการปลูกและเก็บเกี่ยว/แปรรูป + แผนการใช้ประโยชน์ — no slots (§4). |

### GACP forms (3 + 3 aliases)

| slot | label | verdict | citation |
|---|---|---|---|
| FORM_GACP_APPLICATION (298) | แบบคำขอรับรอง GACP — required:true, autoGenerated | **GENERATE** | Correct pattern (already `autoGenerated:true`): the system must produce the filled กทล.1 from wizard data (facts.md §1; ruling 4/7 context). Rename to the real form name "แบบกัญชา กทล.1". |
| FORM_FARM_SUMMARY (305) | แบบสรุปข้อมูลฟาร์ม — required:true, autoGenerated | **CUT** | No DTAM form. Its content (พื้นที่ แปลง GPS) *is* กทล.1 ส่วนที่ ๒ (facts.md:23-24) and rides inside the generated กทล.1. A second required generated doc is platform excess (ruling 2). |
| FORM_SELF_ASSESSMENT (312) | แบบประเมินตนเอง (Self Assessment) 14 หมวด — required:false | **OPTIONAL** | No filing-day basis; already required:false and labeled (ตัวเลือก). Must stay labeled ไม่บังคับ and count for nothing at every gate. |
| FORM_09 (320) / FORM_10 (321) / FORM_11 (322) | แบบฟอร์ม 09/10/11 — deprecated aliases | **CUT** | deprecated:true; the alias table (upload-rules.js:197-199) already folds them; delete the catalog entries. |

### Phantom slot

| slot | where | verdict | citation |
|---|---|---|---|
| `lab_certificate` | document-slots.js:453 (warning only, no DOCUMENT_SLOTS entry) | **CUT** | Blocks filing (`canProceedWithout:false`) for the export objective — directly contradicts ข้อกำหนด §3 (facts.md:63): กรม**ไม่ตรวจแล็บ**โดยปกติ ⇒ ผลแล็บ/ใบรับรองแล็บไม่ใช่เอกสารบังคับตอนยื่น. |

## 3. Behaviour census (helper functions and the gate)

| behaviour (file:line) | what it does today | verdict | citation / note |
|---|---|---|---|
| `getRequiredSlots` (document-slots.js:326) + `getRequiredDocuments` (347) | UI-side required-set computation from the catalog flags | **KEEP** (mechanism) | Content must follow the slot verdicts above; every `plantTypes: ['cannabis','kratom']` row loses kratom (ruling 5, facts.md:71). |
| `requiresLicense` (document-slots.js:338) | `['cannabis','kratom']` ⇒ licence needed | **REWORD** | Cannabis only (ruling 5), and "licence" must mean the conditional actual-licence proof (จนท. 1.1), not an unconditional ภท.11 demand. |
| `getObjectiveWarnings` — unconditional ภท.11 block (426-430) | Always pushes "ต้องยื่นแบบ ภ.ท.11", `canProceedWithout:false` | **CUT** | No กทล.1 basis to hard-block filing on a ภท. request form; facts.md:56 makes licence proof conditional and about the licence itself. |
| `getObjectiveWarnings` — RESEARCH→PT09 (433-441) | Warns to file ภ.ท.9 for "เพื่อวิจัย" | **CUT** | RESEARCH is not a กทล.1 objective (facts.md:21). |
| `getObjectiveWarnings` — EXPORT→PT10 (444-451) | Warns to file ภ.ท.10 for export | **CUT** | ส่งออก objective is lawful; the ภท.10 filing demand is not in ส่วนที่ ๓. |
| `getObjectiveWarnings` — EXPORT→lab_certificate (452-457) | Hard-blocks export objective without lab cert | **CUT** | Contradicts ข้อกำหนด §3 (facts.md:63). |
| `getObjectiveWarnings` — REPLACEMENT→PT16 (460-466) | Hard-requires ภ.ท.16 for replacement | **REWORD** | The กทล.1 ใบแทน set is ใบแจ้งความ (สูญหาย) / ใบรับรองเดิม (ถูกทำลาย) (facts.md:53). |
| `canProceedWithObjectives` (478-491) | Gate built on the warnings above | **REWORD** | Mechanism fine; inputs must become the corrected warning set. |
| `assertRequiredDocumentsPresent` (application-document-requirements.js:166-221) | The 422 submit gate: dated rules on first submit, frozen snapshot on resubmit, per-slot missing list | **KEEP** | Supports จนท. 1.4 "ขอเอกสารเพิ่ม**เป็นรายการ**" (facts.md:57) and AC3 filing-date law. Two notes: requestType mapping at line 199 never yields REPLACEMENT; grandfather branch at 186-190 lets pre-M2a resubmits through by design. |
| `collectServerDocumentEvidence` (application-document-requirements.js:100-121) | Evidence = server-owned draftDocuments + ApplicationDocument rows; refuses client `formData.documents` | **KEEP** | Sound (AC2). |
| `SLOT_LABEL_TH_BY_CANONICAL_ID` (application-document-requirements.js:51-59) | 422 carries the catalog's Thai label | **KEEP** | Labels follow the catalog — after the catalog is cut to the กทล.1 set the refusals speak the ministry's names automatically. |
| `buildUploadedSlotSet` (validation-slot-utils.js:26-46) | Canonicalises uploaded slot ids | **KEEP** | Note the `entry.id` fallback (line 38): a draftDocuments entry missing slotId/type records its UUID as a "slot" — inert against required lists but worth pinning when the catalog shrinks. |
| SSOT re-export (validation-slot-utils.js:20-24) | One canonicaliser for browser + server | **KEEP** | The alias groups (upload-rules.js:178-209) are what make CUT verdicts safe to execute without breaking stored documents. |
| `rulesAt` (requirement-rule-service.js:98-117) | Law as of an instant, NULL-means-all dims | **KEEP** | Correct machinery for "judged by the law in force on filing day". |
| `insertRule`/`closeRule` (requirement-rule-service.js:130-272) | Append-only writes with audit rows; no update/delete | **KEEP** | This is the door through which every verdict above becomes dated law (close + insert), no deploy needed. |

## 4. Legal items with NO slot in DOCUMENT_SLOTS (the reverse gap)

These are required by กทล.1 ส่วนที่ ๓ but have no catalog entry, so the wizard cannot even collect them and requirement_rules has nothing to point at (the wizard-side upload-rules.js table has keys like PRODUCTION_PLAN/SECURITY_PLAN at lines 130-131, but they have no DOCUMENT_SLOTS counterpart and no alias group, so they canonicalise to ids the catalog does not know):

1. **A5** — แผนการผลิต (ปลูก) + แผนการใช้ประโยชน์/แปรรูป (facts.md:40, ทุกราย)
2. **A6** — มาตรการรักษาความปลอดภัย + วิธีนำส่วนของกัญชาที่เหลือไปใช้ประโยชน์ (facts.md:41, ทุกราย)
3. **บุคคลธรรมดา** — หนังสือแสดงว่าดำเนินการภายใต้ความร่วมมือและกำกับดูแลของผู้รับอนุญาตผลิตยาแผนปัจจุบัน/แผนโบราณ/ผลิตภัณฑ์สมุนไพร (facts.md:49) — the INDIVIDUAL qualification doc; today INDIVIDUAL has zero qualification requirement anywhere
4. **วิสาหกิจชุมชน** — หนังสือแสดงว่าผู้ยื่นได้รับมอบหมายให้ดำเนินกิจการแทนวิสาหกิจ (facts.md:48; ruling 3 explicitly keeps this as an attachment, not a POA feature)
5. **นิติบุคคล** — บัญชีรายชื่อกรรมการ/หุ้นส่วน/สมาชิก + หนังสือแสดงว่าผู้ยื่นเป็นผู้แทน/ผู้มีอำนาจทำการแทน (facts.md:50)
6. **ต่ออายุ** — แผนการปลูกและเก็บเกี่ยว/แปรรูป + แผนการใช้ประโยชน์ (facts.md:52) — only the report and old cert have slots
7. **ใบแทน** — ใบแจ้งความ (กรณีสูญหาย) / ใบรับรองเดิม (กรณีถูกทำลาย/ลบเลือน) (facts.md:53) — the current REPLACEMENT slots point at ภท.16 instead

And in requirement_rules: none of the universal set (A1, A3, A5, A6, A7, A8) exists as a rule, so the legal gate currently under-enforces even against the corrected กทล.1 baseline.

## 5. Summary counts

- 39 catalog slots + 1 phantom: **KEEP 5** (land_deed, id_card, house_reg, site_map, photos_exterior) · **CONDITIONAL 8** (company_reg, land_consent, facility_map, photos_interior, community_cert, coop_cert, renewal_report, previous_cert) · **REWORD 2** (license_pt11 → actual-licence conditional slot; sop_cultivation → single A8 SOP manual) · **GENERATE 1** (form_gacp_application → filled กทล.1) · **OPTIONAL 1** (form_self_assessment) · **CUT 23** (8 licence slots, land_lease, criminal_bg, gov_support, 4 SOP splits, photos_storage, photos_signage, photos_site, form_farm_summary, 3 form aliases, lab_certificate).
- requirement_rules seed: 2 rows, both legally grounded (JURISTIC/company_reg, COMMUNITY_ENTERPRISE/community_cert); the seed set is incomplete against กทล.1 (no universal A-rows, no INDIVIDUAL letter, no RENEWAL/REPLACEMENT rows) and REPLACEMENT cannot even be expressed at the gate (application-document-requirements.js:199).
- 7 legally-required documents have no slot at all (§4).
