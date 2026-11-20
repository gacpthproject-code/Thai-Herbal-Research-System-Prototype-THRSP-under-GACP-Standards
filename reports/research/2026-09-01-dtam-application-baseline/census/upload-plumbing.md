# Census: upload-plumbing — 2026-09-01

Reader scope: ทุกจุดใน wizard step files ที่เรียก upload, backend draft-document doors,
uploads-security-headers middleware, และ id vocabulary สองชุด (M1_*/CHANOTE ฝั่งขา-ต้น vs
LICENSE_*/LAND_TITLE ฝั่ง step 8). Legal authority = `reports/research/2026-09-01-dtam-application-baseline/facts.md` เท่านั้น.
Read-only census; no file outside this directory touched, no test run.

Files read in full (paths abbreviated, root = `C:/Users/charo/Documents/GitHub/GACP-Certification-Application`):

- `apps/web-app/src/app/health/applications/new/_steps/steps/documents-step-config.tsx`
- `apps/web-app/src/app/health/applications/new/_steps/steps/documents-step.tsx`
- `apps/web-app/src/app/health/applications/new/_steps/steps/documents-step-dedupe.ts`
- `apps/web-app/src/app/health/applications/new/_steps/steps/review-completeness.ts`
- `apps/web-app/src/app/health/applications/new/_steps/steps/plant-selection-step.tsx` + `plant-selection-config.ts` + `plant-selection-config-panels.tsx` (documents section)
- `apps/web-app/src/app/health/applications/new/_steps/steps/general-step-applicant-sections.tsx` (+ general-step.tsx docs state)
- `apps/web-app/src/app/health/applications/new/_steps/steps/farm-info-step.tsx` (upload handlers) + `farm-info-plots-land-sections.tsx` + `farm-info-form-sections.tsx` (water test)
- `apps/web-app/src/app/health/applications/new/_steps/steps/production-info-seed-sources-panel.tsx` + `production-info-step.tsx` (evidence counter)
- `apps/web-app/src/app/health/applications/new/_steps/steps/review-step.tsx` + `review-step-helpers.ts` (documents merge/summary)
- `apps/web-app/src/components/feature/inline-document-upload.tsx`, `document-uploader.tsx`
- `apps/web-app/src/lib/services/draft-document-upload.ts`, `client-upload-check.ts`, `preview-document.ts`
- `apps/web-app/src/constants/options.ts` (LAND_DOCUMENT_OPTIONS)
- `packages/validation/src/upload-rules.js` (slot table + alias fold — the platform-wide slot inventory)
- `apps/backend/middleware/uploads-security-headers.js`
- `apps/backend/routes/api/applications/applications.js` (POST/GET/DELETE `/draft-documents`, `receiveDraftDocument`, `toUploadedFileUrl`)
- `apps/backend/routes/api/applications/wizard.js` (second door `/api/wizard/draft-documents`)
- `apps/backend/routes/api/applications/validation-slot-utils.js`

## 1. บัญชีพื้นผิวอัพโหลดทั้งหมด (ทุกปากที่รับไฟล์จริง)

| # | Surface | Slot id(s) | ที่อยู่ | ปลายทาง bytes |
|---|---|---|---|---|
| 1 | Step 2 (plant-selection) เอกสาร M1 ต่อวัตถุประสงค์ — 3 ช่องเสมอ | `M1_PT11`, `M1_PT09`, `M1_PT10` | plant-selection-config.ts:180-205; render plant-selection-config-panels.tsx:386 via `DocumentUploader` | POST `/api/applications/draft-documents` (document-uploader.tsx:113) |
| 2 | Step 4 (general) เอกสารแนบผู้ยื่น — 3-4 ช่องตามประเภท | `id-card`, `house-reg`, `criminal-bg` (บุคคล); `community-reg`, `community-meeting`, `president-id` (วิสาหกิจ); `company-reg`, `director-list`, `director-id`, `power-attorney` (นิติบุคคล) | general-step-applicant-sections.tsx:99-125, 257-284, 445-479 via `InlineDocumentUpload` | POST `/api/applications/draft-documents` (inline-document-upload.tsx:98) — URL เก็บใน `applicantData.*Doc` (general-step.tsx:92-111) **ไม่ใช่** `state.documents` |
| 3 | Step 5 (farm-info) เอกสารสิทธิ์ที่ดิน — checkbox+อัพโหลดต่อชนิด | `CHANOTE`, `NS3`, `SPK`, `OTHER` (+ช่องกรอกชื่อเอกสาร) | options.ts:50-55; render farm-info-plots-land-sections.tsx:167-263; handler farm-info-step.tsx:177-192 | `uploadDraftDocument` → POST `/api/applications/draft-documents` (stepKey `farm_info`) |
| 4 | Step 5 ผลตรวจคุณภาพน้ำ | `WATER_TEST` | farm-info-form-sections.tsx:377-396; handler farm-info-step.tsx:201-219 | เดียวกัน |
| 5 | Step 6 (production) ใบรับรองสายพันธุ์ + เอกสารภพ.4 ต่อแหล่งพันธุ์ | ไม่มี slot id — `certificateFile`, `porPor4File` | production-info-seed-sources-panel.tsx:153-161, 185-193 | **ไม่ไปไหน** — `FileInput` เขียน File ลง React state เท่านั้น ไม่มีการ POST (นับเป็น "แนบหลักฐานแล้ว" ที่ production-info-step.tsx:89-92) — pattern เดียวกับบั๊ก land-title/water-test ที่ repo แก้ไปแล้ว (documents-step-dedupe.ts:10-21) |
| 6 | Step 8 (documents) ช่องเอกสารตามหมวด — ~30 ช่อง | ทุก id ใน documents-step-config.tsx (ดู §3) | documents-step.tsx:90-143, 233-328 | POST `/api/applications/draft-documents` (documents-step.tsx:120), ลบ = DELETE `/draft-documents/:id` (:148) |
| 7 | Step 8 ลิงก์วิดีโอ | `VIDEO_LINK` | documents-step.tsx:268-277 | URL string ใน store — ไม่มี bytes |

Backend doors:
- **POST `/api/applications/draft-documents`** — applications.js:1351-1436. HEALTH-role only (:126-147, :1355), multer `application-drafts` + MAX 20MB (:203-210), magic-byte/slot/decode guard `uploadContentGuard.inspectStoredUpload` (:1379-1388, refused file ถูก unlink), Thai filename recovery (:1397), **replace-by-canonical-slot** (:1412-1415 ผ่าน `getCanonicalSlotId`), dual-write `application_documents` (:1424-1429). GET list :1438; DELETE :1450-1486 ลบทั้ง record และ bytes (B3).
- **POST `/api/wizard/draft-documents`** — wizard.js:178 (+guard :80-116). Door ที่สอง มี content guard เท่ากันแล้ว แต่ **ไม่มี frontend เรียกวันนี้** (wizard.js:68-69) — เป็น door ซ้ำที่ต้องรวมภายหลัง

## 2. Viewer constraints (ruling 6 — คง `Content-Disposition: attachment`, ดูในหน้าเท่านั้น)

- `uploads-security-headers.js:32-63` ตั้ง 4 headers ทุก response ใต้ `/uploads/*`: `nosniff`, **`Content-Disposition: attachment`** (:46), `CORP: same-site` (:52), `Cache-Control: private, no-store` (:60). ตรงตาม ruling 6 ทุกตัวอักษร — **KEEP ห้ามแตะ**.
- Constraint ที่ viewer ทุกตัวต้องเคารพ: top-level navigation ไป `/uploads/...` = บังคับดาวน์โหลด; การ "ดูในหน้า" ต้องเป็น subresource fetch. ทางที่ถูก = `openDocumentPreview` (preview-document.ts:28-51): fetch เป็น blob พร้อม credentials+Bearer → object URL → เปิด. ใช้แล้วใน `InlineDocumentUpload` (:204) และ `DocumentUploader` (:218).
- **จุดที่ฝ่าฝืน**: documents-step.tsx:291 ปุ่ม "เปิด" ใช้ `window.open(file.url, '_blank')` ตรง ๆ กับ `/uploads/...` → เป็น top-level → ผู้ใช้ได้ไฟล์ดาวน์โหลด/แท็บเปล่าแทนการดูในหน้า. ต้องเปลี่ยนเป็น `openDocumentPreview` (ruling 6 + ruling 7 "เห็นเอกสารตัวเองในหน้า").

## 3. Id vocabulary สองชุด (สองปาก) — และสะพานที่มี/ไม่มี

ชุดขา-ต้น (step 2/4/5): `M1_PT11 M1_PT09 M1_PT10` · `id-card house-reg criminal-bg community-reg community-meeting president-id company-reg director-list director-id power-attorney` · `CHANOTE NS3 SPK OTHER` · `WATER_TEST`.
ชุด step 8 (documents-step-config.tsx): `IND_ID_CARD IND_HOUSE_REG` · `COM_SVC01 COM_TVC03 COM_MEMBER_LIST COM_PRESIDENT_ID COM_MEETING_DOC COM_HOUSE_CODE` · `JUR_COMPANY_REG JUR_DIRECTOR_LIST JUR_DIRECTOR_ID JUR_POA JUR_TAX_REG JUR_COMPANY_CERT` · `LICENSE_PT11 LICENSE_PT9 LICENSE_PT10 CRIMINAL_BG` · `REG_FORM LAND_TITLE LAND_CONSENT` · `SITE_MAP BUILDING_PLAN EXTERIOR_PHOTOS` · `PRODUCTION_PLAN SECURITY_PLAN INTERIOR_PHOTOS` · `SOP_MANUAL CP_CCP_TABLE INPUT_REPORT EQUIPMENT_CALIBRATION` · `GACP_CERTIFICATE STRAIN_CERTIFICATE PROVIDER_TRAINING PROVIDER_TEST` · `SOIL_TEST NUTRIENT_SPEC WATER_TEST FLOWER_TEST LAB_CERTIFICATE` · `DESTINATION_CERT VIDEO_LINK ADDITIONAL_DOCS`.

สะพานที่มีอยู่:
- Frontend-only: `STEP2_TO_STEP8_DOC_ID` (documents-step-dedupe.ts:58-62) map `M1_PT09→LICENSE_PT9`, `M1_PT10→LICENSE_PT10`, `M1_PT11→LICENSE_PT11`; land files ที่มี `fileUrl` → ซ่อน `LAND_TITLE` (:88-91); `waterTestFileUrl` → ซ่อน `WATER_TEST` (:93-95). Review step 9 ใช้ lens เดียวกัน (review-completeness.ts:47-63, review-step.tsx:155).
- Shared package: `SLOT_ALIAS_GROUPS` + `getCanonicalSlotId` (upload-rules.js:178-250) — fold case/`-`/`.`; ครอบ `id_card/ID_CARD/idCardDoc`, `criminal_bg/CRIMINAL_BG/criminalBgDoc`, `land_deed/LAND_TITLE`, `license_pt09/PT9/pt09` ฯลฯ. Backend re-export ที่ validation-slot-utils.js:20-24. Replace-on-reupload ใน POST /draft-documents ใช้ fold นี้ (applications.js:1412-1415).

ช่องโหว่ "สองปาก" ที่ **ไม่มีสะพาน** (server เก็บเป็นคนละ slot / UI ถามซ้ำ):
1. `M1_*` ↔ `LICENSE_*` — ไม่อยู่ใน `SLOT_ALIAS_GROUPS` เลย → server-side `draftDocuments` เก็บ ภท.11 ได้สองแถว (M1_PT11 + LICENSE_PT11) ถ้าผู้ใช้ผ่านทั้งสอง step; มีแค่ frontend map กันถามซ้ำ.
2. `CHANOTE/NS3/SPK/OTHER` ↔ `LAND_TITLE` — ไม่ aliased; สะพานเป็น frontend เท่านั้น.
3. Step 4 ↔ step 8 applicant docs: `id-card` aliased กับ `ID_CARD/idCardDoc` แต่ **ไม่ใช่** `IND_ID_CARD`; `house-reg`≠`IND_HOUSE_REG`; `community-reg`≠`COM_SVC01`; `community-meeting`≠`COM_MEETING_DOC`; `president-id`≠`COM_PRESIDENT_ID`; `company-reg`≠`JUR_COMPANY_REG`; `director-list`≠`JUR_DIRECTOR_LIST`; `director-id`≠`JUR_DIRECTOR_ID`; `power-attorney`≠`JUR_POA`. ยิ่งกว่านั้น step 4 เก็บ URL ใน `applicantData.*Doc` ซึ่ง `satisfiedRequirementIds` ไม่อ่าน (อ่านเฉพาะ `state.documents`+`farmData`) → **เกษตรกรถูกถามอัพโหลดบัตรประชาชน/หนังสือรับรองซ้ำสองครั้ง** (step 4 แล้ว step 8) และไฟล์ค้างเป็นสอง slot ใน draftDocuments.

## 4. คำตัดสินรายช่อง (เทียบ facts.md)

ดูตาราง structured output ที่ส่งคืน — สรุปหัวใจ:

- **KEEP ตรง กทล.1**: LAND_TITLE(A1)+CHANOTE/NS3/SPK/OTHER, LAND_CONSENT(A2 เช่า), SITE_MAP(A3), BUILDING_PLAN(A4 Indoor/Greenhouse), EXTERIOR_PHOTOS(A4′/A7), SOP_MANUAL(A8), เอกสารคุณสมบัติวิสาหกิจ/นิติบุคคล (COM_SVC01, member list, JUR_COMPANY_REG≤6เดือน, JUR_DIRECTOR_LIST, ผู้มีอำนาจ/มอบอำนาจ), บัตร ปชช.+ทะเบียนบ้าน (ส่วน จนท. 1.1).
- **REWORD สำคัญ**: PRODUCTION_PLAN และ SECURITY_PLAN เป็น A5/A6 "ทุกราย" แต่ wizard ตั้ง `required:false` → ต้องบังคับ; LICENSE_PT11 ทั้งสองปาก (M1_PT11 + LICENSE_PT11) ถามหา "แบบคำขอ ภท." ทั้งที่ ส่วน จนท. 1.1 ต้องการ **ตัวใบอนุญาต** (facts.md:56) → ช่องเดียว, CONDITIONAL, เปลี่ยน semantics; COM_MEETING_DOC/community-meeting ควรเป็น "หนังสือมอบหมายดำเนินกิจการแทนวิสาหกิจ" (ส่วนที่ ๓ กลุ่มคุณสมบัติ); COM_HOUSE_CODE เป็น "เลขรหัสประจำบ้าน" = ช่องกรอกในส่วนที่ ๑.๑ ไม่ใช่ไฟล์ PDF.
- **GENERATE**: REG_FORM ("แบบคำขอรับรองมาตรฐาน GACP") คือกทล.1 ที่กรอกแล้ว — ระบบต้องสร้างจากข้อมูล wizard ไม่ใช่ให้อัพโหลด (ruling 4/7 + รากที่ 1).
- **OPTIONAL (ห้ามบังคับ, ไม่นับคะแนน)**: WATER_TEST (วันนี้ `required:true` — facts §3: ผลแล็บไม่บังคับตอนยื่น), SOIL_TEST, FLOWER_TEST, ADDITIONAL_DOCS.
- **MOVE_TO_AUDIT**: INPUT_REPORT (บันทึกปัจจัยการผลิต = ของวันตรวจ, facts §3 ข้อ 1), VIDEO_LINK (คำอธิบายเองบอก "ส่งเพิ่มได้ตอนตรวจภาคสนาม").
- **CUT (ไม่มีฐาน DTAM)**: M1_PT09, M1_PT10, LICENSE_PT9, LICENSE_PT10, CRIMINAL_BG + criminal-bg, CP_CCP_TABLE, EQUIPMENT_CALIBRATION (`required:true` แต่ label "(ถ้ามี)"), GACP_CERTIFICATE (E-learning), STRAIN_CERTIFICATE, PROVIDER_TRAINING/TEST, NUTRIENT_SPEC, LAB_CERTIFICATE, DESTINATION_CERT, JUR_TAX_REG (ภ.พ.20), JUR_COMPANY_CERT (บริคณห์สนธิ), COM_TVC03 หรือ COM_MEMBER_LIST (ซ้ำกันเอง — เหลือหนึ่ง), seed-source certificate/ภพ.4 uploads (ส่วนที่ ๒ ข้อ ๓ ให้ "กรอก" พันธุ์/แหล่งที่มา ไม่ใช่แนบ; อีกทั้ง plumbing พังอยู่แล้ว — ไม่เคยอัพโหลดจริง).

## 5. ช่องที่ กทล.1 ต้องการแต่ **ไม่มีในระบบ** (gap — สำหรับ coordinator)

- บุคคลธรรมดา: "หนังสือแสดงว่าดำเนินการภายใต้ความร่วมมือ/กำกับดูแลของผู้รับอนุญาตผลิตยา..." (facts §2 กลุ่มคุณสมบัติ) — ไม่มี slot ใดเลย.
- วิสาหกิจ: "หนังสือมอบหมายให้ดำเนินกิจการแทนวิสาหกิจ" — ไม่มีตรง ๆ (ใกล้สุดคือ meeting-minutes ที่ควร REWORD ไปเป็นตัวนี้).
- กรณีต่ออายุ (`serviceType: RENEWAL` มีใน wizard): ต้นฉบับใบรับรองเก่า · แผนปลูก/แปรรูป · แผนใช้ประโยชน์ · รายงานสรุปผลการดำเนินการ — ไม่มี slot ชุดต่ออายุ.
- กรณีใบแทน: ไม่มีทั้ง service type และ slot (ใบแจ้งความ/ใบรับรองเดิม).
- A6 ครึ่งหลัง "วิธีนำส่วนของกัญชาที่เหลือไปใช้ประโยชน์" — SECURITY_PLAN พูดถึงแต่ความปลอดภัย.

## 6. Plumbing behaviours ที่ต้องคงไว้ (KEEP — เครื่องบังคับที่ดีอยู่แล้ว)

- Magic-byte 3 ชั้น + ชั้น 4 decode ฝั่ง server, ceiling 20MB, floor 1,835 bytes, refusal ภาษาไทยบอกเหตุ+ทางแก้ (upload-rules.js:583-632, applications.js:1379-1388).
- Slot table + alias fold เดียวทั้ง browser/server (upload-rules.js:77-153, 178-250) — "หนึ่งบรรทัดหนึ่งไฟล์ตอบว่า slot รับอะไร".
- "URL จาก server เท่านั้นคือหลักฐานว่าไฟล์ถึง" — uploadDraftDocument (draft-document-upload.ts:17-21), dedupe rule (documents-step-dedupe.ts:16-21), review completeness (review-completeness.ts:14-15).
- Replace-by-slot ตอน re-upload + ลบ bytes ตอน DELETE (applications.js:1403-1415, 1468-1479).
- HEALTH-role gate บน upload doors (applications.js:104-147).

## 7. นอกขอบเขตแต่พบระหว่างอ่าน

- invoice-step.tsx:340 / submission-claim.ts:20,66 อ้างการอัพโหลดสลิปที่หน้า `/health/payments` — พื้นผิวอัพโหลดเงิน อยู่นอก area นี้ (ผู้อ่าน area payment ควรเก็บ).
- `RESEARCH` purpose (plant-selection) ไม่มีใน กทล.1 ส่วนที่ ๒ (มีแค่ การแพทย์/ส่งออก) — เป็นของ reader area plant-selection แต่กระทบ conditional ของ LICENSE_PT9 ที่ CUT ไปแล้ว.
- `/api/wizard/draft-documents` เป็น door ซ้ำที่ไม่มีผู้เรียกฝั่ง frontend — ควรพิจารณายุบเหลือ door เดียว (ไม่ใช่ประเด็น DTAM แต่เป็นหนี้ plumbing).
