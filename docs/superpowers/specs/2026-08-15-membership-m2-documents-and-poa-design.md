# M2 — แฟ้มเอกสารองค์กร + กติกาเอกสารเป็นข้อมูล + ที่ปรึกษา/มอบอำนาจ (2026-08-15 — rev.2 หลังรีวิว senior-swe)

## 1. หลักการ (คำตอบ operator จากรอบ grill 2026-08-15 — ลายลักษณ์อักษรครบ 8 ข้อ)

| # | คำวินิจฉัย |
|---|---|
| G1 | **ฟาร์มเป็นของ entity เสมอ** — `ownerId` บุคคล = legacy รอ drain · ก้าวแรก M1.5 H3, drain เต็มเวฟหลัง M2 |
| G2 | **รายการเอกสารบังคับ = ข้อมูลในฐานข้อมูล มีผลตามวันที่** — เจ้าหน้าที่กรมฯ แก้ได้ไม่ต้อง deploy · คำขอถูกตัดสินด้วยชุดกติกา ณ วันยื่น |
| G3 | **POA ต่อ entity + วันหมดอายุ + ถอนได้** — ทุกการยื่นบันทึกว่าใช้ POA ฉบับไหน |
| G4 | **เอกสารทะเบียนองค์กร: แฟ้มองค์กร + เกณฑ์ความสด + สำเนาเข้าสำนวนอัตโนมัติ** — เกณฑ์ความสดเป็นข้อมูล ปรับได้ |
| G5 | **ที่ปรึกษาต้องมีบัญชียืนยัน ThaID แล้วเท่านั้น** |
| G6 | **OWNER เท่านั้น** แต่งตั้ง/เชิญที่ปรึกษา |
| G7 | **สังกัดคำขอตายตั้งแต่เกิด** — สร้างผิดหมวก = ลบสร้างใหม่ · เปลี่ยนมือภายใน = ไม่กระทบ · โอนข้าม entity: ใบ+ฟาร์มตาม transfer workflow (รอระเบียบกรมฯ), คำขอกลางทาง = ยกเลิกแล้วยื่นใหม่ |
| G8 | **ลำดับ: M1.5 ก่อน แล้วค่อย M2** — M2 assume M1.5 ปิดแล้ว (ทางเข้า entity องค์กรเดิม = invite เท่านั้น) |

Scope M2 = ชั้นข้อมูล + ชั้นสิทธิ์ + จุดบังคับที่ endpoint · UI = M4 · สภาพโค้ดอ้าง `reports/design-doctor/2026-08-15-sweep.md` (จุดสำคัญ: gate เอกสารวันนี้ = "มี 1 ไฟล์" `canonical-application-validator.js:282-285` · นิยามเอกสารบังคับกระจาย **4 ชุด**ที่ไม่คุยกัน — hardcode/ตาราง DB ทางตัน (SC-06)/journey.js/FE+mobile · slot `COMPANY_REG`/`COMMUNITY_CERT` มีแล้วใน `document-slots.js` · invite PENDING→accept มีครบ · grant ผูก membership ACTIVE ไม่มี expiry)

## 2. เสา 1 — แฟ้มเอกสารองค์กร (Entity Document Vault)

- **Model ใหม่ `EntityDocument`**: `entityId` FK · `docType` (`ORG_REGISTRATION` | `POA`) · `slotId` (slot กลาง: `COMPANY_REG`/`COMMUNITY_CERT` เดิม + **`POA_CONSULTANT` เป็น slot ใหม่** — ยังไม่มีใน `document-slots.js`) · `fileUrl/fileHash/mimeType/fileSize` · **`issuedDate`** (ผู้ใช้กรอก — เจ้าหน้าที่เห็นเทียบตัวเอกสาร) · `expiresAt?` (POA บังคับมี) · `revokedAt?/revokedBy?` · `uploadedBy` · `subjectUserId?` (POA มอบให้ใคร — FK `onDelete: SetNull` เพื่อไม่ให้การลบบัญชีลบหลักฐาน) · audit ทุก create/revoke
- **PDPA:** erasure บัญชีที่ปรึกษา → แถว POA ของเขาถูก **revoke อัตโนมัติ** (stamp revokedAt + เหตุผล ERASURE) — แถวคงอยู่เป็นหลักฐานสำนวน ไฟล์ POA เป็นเอกสารนิติกรรมขององค์กร ไม่ถูกลบตามคน (แนวเดียวกับใบรับรอง M1)
- **เกณฑ์ความสด** ของ `ORG_REGISTRATION`: อายุจาก `issuedDate` ต้องไม่เกินค่าที่กติกา (เสา 3.x ตาราง) กำหนดรายชนิด — ไม่ hardcode
- **สำเนาเข้าสำนวน**: submit ผ่าน → (ก) snapshot รายการที่ใช้ (id + fileHash + issuedDate) ลงคำขอ (ที่เก็บ: §3 ข้อ snapshot) (ข) **สร้างแถว `ApplicationDocument` สำเนาด้วย** — สำนวน self-contained และ fraud scan เห็นเอกสารชุดนี้ (ไม่งั้น vault เป็นจุดบอดของ fraud — รีวิว minor 6)
- **ACL ชั้นไฟล์:** path จัดเก็บใหม่ของ vault ต้องลงทะเบียนกับ `uploads-access` (วันนี้รู้จักแค่ `application-drafts/*`) — อ่านได้ตามสมาชิกภาพ entity · อัปโหลด/ถอน = OWNER (G6)

## 3. เสา 2 — เครื่องกติกาเอกสารเป็นข้อมูล (Requirement Engine)

- **ตารางใหม่ append-only** (รีวิว M-6 — ไม่ต่อยอด `DocumentRequirement` เดิม: schema คีย์ `plantCode` บังคับ+ไม่มี slotId และ `seed-plants.js:273-281` ทำ deleteMany+createMany ทุก reseed ซึ่งจะกวาดแถวที่เจ้าหน้าที่แก้ทิ้ง — ประกาศ `DocumentRequirement` เป็นซาก รอเวฟ cleanup): `RequirementRule` — `holderType?` × `requestType?` × `plantCode?` (มิติไหน null = ทุกค่า) · `slotId` · `isRequired` · **`maxDocumentAgeMonths Int?`** (เกณฑ์ความสดของ slot ฝั่ง vault — รีวิว M-5) · **`effectiveFrom`/`effectiveTo?`** · `createdBy/createdAt` · **แถว immutable**: การแก้ = ปิด `effectiveTo` + insert แถวใหม่ — admin API มีแค่สองท่านี้ (สิทธิ์ DTAM/admin + audit)
- **seed ชุดแรก** = ชุดตามประเภทที่ operator เคาะ: JURISTIC→`COMPANY_REG`, COMMUNITY_ENTERPRISE→`COMMUNITY_CERT`, INDIVIDUAL→ไม่มีเพิ่ม ("อื่นๆ เหมือนกันหมด" = baseline 15 ชนิดเดิมคงที่ ยังไม่ย้ายเข้า engine ในเฟสนี้)
- **จุดบังคับ = submit gate จริงทั้ง 5 ประตู** (เส้นเดียวกับ guard M1): resolve `application.entityId → Entity.type` → โหลดชุดกติกา ณ **วันยื่นครั้งแรก** → เทียบหลักฐาน **server-side เท่านั้น** (`draftDocuments` ∪ `ApplicationDocument` ∪ สำเนา vault) → ขาด = 422 + รายชื่อ slot/เหตุผลความสด · ธง client ใน `formData.documents` ไม่มีน้ำหนัก
- **ประทับชุดกติกา + snapshot ลงคำขอ**: เก็บใน `formData` ด้วย key ที่ประกาศเข้า **`SERVER_OWNED_FORM_DATA_KEYS`** (`form-data-ownership.js` — กัน client ปลอมผ่าน `/prepare` ตาม sweep AP-02): `serverRequirementSnapshot` (รายการ rule ids + วันที่) และ `serverVaultSnapshot` (เอกสาร vault ที่ใช้)
- **Resubmit ทุกประตู (CAR / revision / revision-deadline / bundle):** ตัดสินด้วย **requirement-set ที่ประทับไว้ตอน submit แรก** — กติกาที่เปลี่ยนระหว่างทางไม่ 422 คำขอที่ compliant ตอนยื่น (รีวิว M-9)

## 4. เสา 3 — ที่ปรึกษา + POA

- **role ที่ 5 `CONSULTANT`** (`EntityMembership.role` เป็น String — ไม่ต้อง migrate คอลัมน์) — เข้าทาง invite เดิม (PENDING→accept) · เชิญโดย **OWNER เท่านั้น** (G6) · **precondition งานนี้: รวมนิยาม role เป็น SSOT เดียว (list + ลำดับอาวุโส) ก่อนเพิ่มค่าที่ 5** — sweep ID-09: literal กระจาย ~7 จุด, invite whitelist fail-closed อยู่ที่ `index.js:396-403`
- **G5 บังคับด้วย predicate จริง** (รีวิว M-7 — บัญชี non-ThaID มีจริง: `auth.prisma:335` provider = local|healthid|providerid|thaid): เชิญเป็น CONSULTANT ได้เฉพาะบัญชีที่ `provider = 'thaid'` (หรือ flag การยืนยันตัวตนเทียบเท่าที่ identity-service ประกาศ) — เชิญบัญชี local → ปฏิเสธพร้อมเหตุผล
- default permissions ว่างเปล่า · **อำนาจยื่น = grant + POA valid ครบคู่**: guard M1 ขยาย — ผู้ยื่น role CONSULTANT ต้องมี `EntityDocument(POA, subjectUserId=ผู้ยื่น)` ไม่หมดอายุ/ไม่ถูกถอน ไม่งั้น 403 (`POA_REQUIRED`/`POA_EXPIRED`) · สมาชิกปกติไม่แตะเงื่อนไข POA
- ถอน grant / ถอน POA / หมดอายุ → ครั้งถัดไป 403 ทันที · audit ทุกการยื่น: `onBehalfOfEntityId` + `submittedByUserId` + `metadata.poaDocumentId`
- **ขอบเขต:** "ที่ปรึกษา" = ฝั่งผู้ยื่นเท่านั้น — ไม่แตะนิยาม "role เจ้าหน้าที่รัฐ" (บล็อกรอนิติกร `QUEUE.md:22,295`) และไม่แตะ officer bypass (M1 D13)

## 5. การยืนยันองค์กรผ่านตาเจ้าหน้าที่ (ผู้รับหนี้จาก M1.5 H1 — รีวิว B2)

- entity องค์กรที่สร้างใหม่ (ยังไม่มี `Entity.orgVerifiedAt`) ยื่นคำขอแรกได้ตามปกติ (เอกสารทะเบียนถูกบังคับโดยเสา 3 อยู่แล้ว) แต่ใน review flow ของ**คำขอแรก** เจ้าหน้าที่มี checkpoint ชัดเจน: "เอกสารทะเบียนตรงกับ entity (ชื่อ/เลขทะเบียน) หรือไม่" — ผ่าน → stamp `Entity.orgVerifiedAt/orgVerifiedBy` · ไม่ผ่าน → เส้น revision เดิม
- ผลของ stamp: เป็นหมุดความเชื่อถือให้ทั้งระบบอ้าง (แสดงใน workspace/สำนวนถัดไป) — คำขอถัดไปไม่ต้อง re-verify จนกว่าเอกสารทะเบียนฉบับใหม่เข้าแฟ้ม (เปลี่ยนฉบับ = checkpoint รอบใหม่)
- **เคสถูกยึดก่อน (squat-then-block จาก H1):** เจ้าตัวจริงที่เจอ 409 = เคส dispute ฝั่ง admin (ตรวจ audit row จาก H1 + เอกสารจริง แล้วย้าย OWNER) — **เส้นนี้อยู่ทะเบียนหนี้ให้ operator จัดเวฟ ไม่อยู่ M2** · จุดยืนนี้ = ทางเลือก (ก)-lite ของรีวิว B2: ความเสี่ยงคือ entity ที่ถูกยึดก่อนแล้วเจ้าตัวจริงยังไม่มา dispute — ยอมรับได้เพราะ squat ที่ยื่นคำขอจริงจะตกที่ checkpoint เจ้าหน้าที่ (เอกสารทะเบียนจริงไม่อยู่ในมือ)

## 6. Acceptance criteria (RED-first ทุกข้อ · ธรรมเนียม Tier C ของ M1)

1. ยื่นในนาม JURISTIC โดย vault ไม่มี `COMPANY_REG` (หรือเกินเกณฑ์ความสดของ rule) → 422 + slot/เหตุผล · COMMUNITY ↔ `COMMUNITY_CERT` · INDIVIDUAL ไม่ถูกเรียกเพิ่ม
2. ธง client (`formData.documents[].uploaded=true` ไร้หลักฐาน server) ไม่ช่วยข้อ 1 · แก้ `serverRequirementSnapshot`/`serverVaultSnapshot` ผ่าน `/prepare` → ถูกทับด้วยค่า server (pin กับ `SERVER_OWNED_FORM_DATA_KEYS`)
3. แก้กติกา (insert แถวใหม่+ปิดแถวเก่า) มีผลเฉพาะคำขอที่ยื่นแรกหลัง `effectiveFrom` · resubmit/CAR/revision ของคำขอเก่าใช้ชุดที่ประทับไว้ — ไม่ 422 เพราะกติกาใหม่
4. เชิญ CONSULTANT: บัญชี local → ปฏิเสธ · บัญชี thaid → PENDING→accept → ยื่นไม่ได้ (403) → grant อย่างเดียว → 403 `POA_REQUIRED` → grant+POA → สำเร็จ + audit (onBehalfOf + poaDocumentId)
5. POA หมดอายุ/ถูกถอน/grant REVOKE → 403 · erasure บัญชีที่ปรึกษา → POA ถูก revoke อัตโนมัติ + คำขอ/ใบเดิมไม่กระทบ
6. สำนวนคำขอที่ผ่าน snapshot ครบสองชนิด + มีแถว `ApplicationDocument` สำเนาจาก vault (fraud scan เห็น) — เปลี่ยนไฟล์ใน vault ทีหลังไม่เปลี่ยนสำนวนเดิม (เทียบ fileHash)
7. คำขอแรกขององค์กรใหม่: เจ้าหน้าที่ tick checkpoint → `orgVerifiedAt` ถูก stamp · เอกสารทะเบียนฉบับใหม่เข้าแฟ้ม → คำขอถัดไปเรียก checkpoint รอบใหม่
8. migration ทั้งหมด expand-only · DB-side = PENDING จนมี artifact จาก staging (กติกา M1 AC5)

## 7. นอกขอบเขต M2

UI ทุกจอ (M4) · OCR/ตรวจเนื้อเอกสารอัตโนมัติ · เชื่อม DBD/DOAE · token-invite ผู้ไม่มีบัญชี · M3 · transfer workflow (G7 บันทึกกติกาคำขอกลางทางแล้ว) · ย้าย baseline 15 ชนิดเข้า engine · เส้น dispute เลขทะเบียนถูกยึด (ทะเบียนหนี้) · cleanup `DocumentRequirement` ซาก + นิยามเอกสารชุด journey.js/mobile (ทะเบียนหนี้ AP-04) · หนี้ sweep ที่เหลือ

## 8. ลำดับก่อสร้าง

**M1.5 → เสา 2 (RequirementRule + gate) → เสา 1 (Vault) → เสา 3 (CONSULTANT+POA) → §5 (checkpoint เจ้าหน้าที่)** — เสา 2 ก่อนเพราะเสา 1 ใช้ `maxDocumentAgeMonths` จากตาราง และเสา 3 ใช้ vault เก็บ POA · §5 ท้ายสุดเพราะพึ่ง vault + review flow
