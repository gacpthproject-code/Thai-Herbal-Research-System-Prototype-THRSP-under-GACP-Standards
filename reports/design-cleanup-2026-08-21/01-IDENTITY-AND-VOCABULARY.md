# 01 — ตัวตนผู้ยื่นคำขอ, การผูกทีม, และคำศัพท์ (เอกสารตัดสินใจ)

วันที่: 2026-08-21 · ขอบเขต: อ่านโค้ดอย่างเดียว (read-only) · ไม่ได้รันแอป ไม่ได้รัน test ไม่ได้แตะ DB
ทุกข้อความที่เป็นข้อเท็จจริงมี `file:line` กำกับ · ข้อไหนตรวจไม่ได้เขียนว่า **ยังไม่ได้ตรวจ** ใน §6

---

## 1. คำตอบตรง ๆ ต่อ 3 คำถาม

### A. คนเดียวยื่นได้ทั้ง บุคคลธรรมดา / นิติบุคคล / วิสาหกิจชุมชน หรือไม่ · ทีมผูกกับฟาร์มหรือเจ้าของฟาร์ม

**คำตอบ 1 ประโยค: ได้ — ระบบออกแบบมาให้คนเดียวถือหลายตัวตนผู้ยื่นพร้อมกัน และทีมผูกกับ "ตัวตนผู้ยื่น (Entity/workspace)" ไม่ใช่ฟาร์ม และไม่ใช่ตัวเจ้าของฟาร์ม สิ่งที่คุณเจอไม่ใช่ล็อกในกฎ แต่เป็นประตูทางเข้าที่ UI ซ่อนไว้**

**"คุณเข้าใจถูกหรือเทสผิดที่" — เทสผิดที่ครับ แต่ระบบก็ผิดด้วย ในคนละจุด**

โค้ดที่ตัดสิน:

- คุณเทสในหน้า wizard ขั้น "ข้อมูลทั่วไป" ซึ่ง **ออกแบบมาให้แสดงชนิดผู้ยื่นแบบอ่านอย่างเดียว** เมื่อมี workspace ที่ active อยู่ — `apps/web-app/src/app/health/applications/new/_steps/steps/general-step.tsx:240-247` (`lockedApplicantType && activeEntity ?` → แสดง `ActiveWorkspaceCard`) คอมเมนต์เหนือบรรทัด 236-239 เขียนไว้ตรง ๆ ว่า "the applicantType is locked to the workspace; switching workspace happens via the dashboard header" ตัวเลือก 3 ทาง (บุคคลธรรมดา/วิสาหกิจชุมชน/นิติบุคคล) ที่บรรทัด 251-277 คือ fallback ที่ปกติไม่โผล่ **สวิตช์ตัวจริงอยู่นอก wizard**
- schema อนุญาตชัดเจน: `Entity.type` เป็นตัวแยกชนิดผู้ยื่น 3 ค่า — `apps/backend/prisma/schema/entity.prisma:35` (`type String // INDIVIDUAL | JURISTIC | COMMUNITY_ENTERPRISE`) และคอมเมนต์หัวไฟล์ `entity.prisma:13-18` เขียนเป้าหมายไว้เป็นตัวหนังสือว่า "One User … can act for multiple Entities — e.g., a person can be both an individual farmer AND the director of a registered company AND the president of a community enterprise"
- ข้อบังคับที่ **ไม่มี**: ไม่มี unique ใด ๆ ที่ผูก Entity กับ user คนเดียว — uniqueness ที่มีคือ `@@unique([type, thaiCitizenIdHmac])`, `@@unique([type, juristicIdHash])`, `@@unique([type, communityRegNoHash])` (`entity.prisma:109-111`) ซึ่งกันแค่ "คนละคนแย่งเลขทะเบียนเดียวกัน" และ membership unique ที่ **คู่** `@@unique([userId, entityId])` (`entity.prisma:156`) → คนหนึ่งถือได้ไม่จำกัด
- คนสมัครสมาชิกเป็น "บุคคล" เสมอ: `apps/backend/services/prisma-auth-service.js:645` ฮาร์ดโค้ด `accountType: 'INDIVIDUAL'` และคอมเมนต์ `:611-616` ระบุว่านิติบุคคล/วิสาหกิจชุมชน "ไม่ใช่คน ไม่ต้องสมัคร" — จะเกิดเป็นแถว Entity ตอนยื่นคำขอ
- backend รองรับจริง: `POST /api/entities` สร้าง workspace ชนิด JURISTIC/COMMUNITY_ENTERPRISE ได้โดยผู้ใช้ที่ล็อกอินแล้ว (`apps/backend/routes/api/entities/index.js:209-226`, service `entity-service.js:1824-1840`) และใบสมัครถูกผูกกับ workspace ที่ active ทุกครั้งที่กด save — `apps/backend/routes/api/applications/applications.js:1054` (`const nextEntityId = req.activeEntity?.entityId || application.entityId;`)

**เส้นทางที่ใช้ได้จริงวันนี้:** `/health/workspaces` → "สร้าง workspace ใหม่" → `/health/workspaces/new` เลือก นิติบุคคล หรือ วิสาหกิจชุมชน (`apps/web-app/src/app/health/workspaces/new/page.tsx:100-114`) แล้วค่อยเริ่มยื่นคำขอ — banner ใน wizard จะเปลี่ยนตาม workspace เอง
ข้อจำกัดจริง (ไม่ใช่ความเข้าใจผิด): เลขนิติบุคคลต้องตรง `/^0\d{12}$/` และเลขวิสาหกิจชุมชนต้องตรง `/^\d{11}$/` (`workspaces/new/page.tsx:49,53`) และถ้ามีคนจดเลขนั้นไปแล้วจะได้ 409 `ENTITY_ALREADY_REGISTERED` (`routes/api/entities/index.js:239-241`)

**ทำไมคุณหาไม่เจอ — 3 จุดที่ระบบผิดจริง**

1. ประตูเดียวที่เหลือชื่อว่า "ทีมงาน" คำอธิบาย "เชิญเพื่อนร่วมงานและจัดการสมาชิกทีม" และอยู่ tier `secondary` คือแถว "เมนูเพิ่มเติม" ไม่ใช่ตารางไทล์หลัก — `apps/web-app/src/lib/navigation/nav-config.ts:146-154` + `apps/web-app/src/app/health/home/client-view.tsx:46-47,68-72` ป้ายนี้อ่านว่า "จัดการพนักงาน" ไม่ได้อ่านว่า "ยื่นในนามบริษัท"
2. ลิงก์ "+ สร้าง workspace ใหม่" ใน dropdown ถูกลบตั้งใจในรอบ tile-home-nav Task 7 — `apps/web-app/src/components/layout/entity-switcher.tsx:224-231` (คอมเมนต์ระบุว่าลบตามกฎ N2 และให้ไปที่ไทล์ "ทีมงาน" แทน)
3. คำใบ้ใน wizard บอกว่า "ต้องการเปลี่ยน workspace? เลือกจากเมนูบนหัวเว็บ" (`apps/web-app/src/lib/i18n/dictionaries/sections/th-wizard.ts:419`) แต่ชิปบนหัวเว็บถูก **disable** เมื่อผู้ใช้มี workspace เดียว — `entity-switcher.tsx:115` (`const isMulti = entities.length > 1;`) และ `:153` (`disabled={!isMulti}`) → คำใบ้ชี้ไปที่ปุ่มที่กดไม่ได้ตลอดกาล

**ทีมผูกกับอะไร:** ผูกกับ Entity เท่านั้น `EntityMembership` มี FK แค่ `userId` และ `entityId` (`entity.prisma:123-127`) ไม่มี `farmId` และตารางสิทธิ์รายคนก็ไม่มีมิติแปลง/ฟาร์ม — primary key คือ `@@id([membershipId, permission])` (`apps/backend/prisma/schema/entity-member-permission-grants.prisma:46`) ฟาร์มและใบสมัครแขวนอยู่กับ Entity เดียวกัน (`farm.prisma:19-24`, `application.prisma:24-30`) สมาชิกจึงเข้าถึงผ่าน Entity ไม่ใช่ผ่านตัวเจ้าของฟาร์ม
ผลตามมาที่ต้องรู้: รับคำเชิญแล้ว = ได้ทั้ง workspace ทันที ไม่ใช่ได้แค่ฟาร์มเดียว (การรับคำเชิญแค่เปลี่ยนสถานะแถวเดิมเป็น ACTIVE — `entity-service.js:834-849`) และ **ไม่มีที่ไหนให้จำกัดสมาชิกให้เห็นแค่แปลงเดียว**

**ข้อยกเว้นที่ขัดกับหลักนี้ (ของจริง ไม่ใช่ทฤษฎี):** ใบรับรองยังผูกกับ "คน" — `apps/backend/prisma/schema/certification.prisma:17` (`Certificate.userId`) และ list ทั้งสองเส้นกรองด้วย userId (`apps/backend/services/certificate-service.js:912-916` และ `:935-936` ที่ผมเปิดเอง: `where: { userId, isDeleted: false }`) → ADMIN ของ workspace มองไม่เห็นใบรับรองของ workspace ตัวเอง ทั้งที่ schema เตรียมทางไว้แล้ว (`certification.prisma:21-27` farmId FK, `:33-35` holderDisplayName/holderType)

### B. "batch"/"lot" สับสน — ควรเปลี่ยนเป็นภาษาที่ยึด "แปลง" หรือไม่

**คำตอบ 1 ประโยค: ควร และทำได้ถูก — แต่ต้องเปลี่ยนเฉพาะ "ป้ายที่คนอ่าน" เท่านั้น ห้ามแตะค่า `batchNumber`/`lotNumber` ที่เก็บไว้ เพราะมันคือกุญแจ QR สาธารณะที่ถูกเซ็นด้วยลายเซ็นดิจิทัลไปแล้ว**

หลักฐานว่าคำศัพท์พังจริง (ผมนับเองในรอบนี้ `grep -ro … apps/web-app/src`):
`แปลง` 304 ครั้ง · `รอบปลูก` 69 · `ล็อต` 48 · `ชุดเก็บเกี่ยว` 14 · `ลอต` 8 — สะกดสองแบบในโดเมนเดียวกัน กระจายใน 21 ไฟล์ (`grep -rl "ล็อต\|ลอต" apps/web-app/src | wc -l` = 21)
และการชนกันอยู่ใน schema เอง: `apps/backend/prisma/schema/harvest.prisma:3` เขียนคอมเมนต์ว่า "HARVEST BATCH MODEL (Lot การเก็บเกี่ยว)" ขณะที่ `Lot` เป็นอีกโมเดลหนึ่งใน `trace.prisma:10-23` แถมใบรับรองยังสร้าง batch ชื่อ `LOT-{ปี}-{farm}-001` ให้เอง (`apps/backend/services/certificate-service.js:852-855`)

สิ่งที่ **ห้ามแตะ** (identity ที่ต้องคงไว้ใต้ป้าย):

- `batchNumber` / `lotNumber` ถูกฝังในเพย์โหลดที่ sha256 + ต่อ chain + เซ็น RSA ตอนเก็บเกี่ยว (`apps/backend/services/planting-cycle/harvest-capacity-operations.js:230-250`) และการตรวจสอบ **คำนวณจากเพย์โหลดที่เก็บไว้อย่างเดียว ไม่อ่านแถวจริง** (`apps/backend/services/qrcode/qrcode-service.js:489-497`) → ถ้าเปลี่ยนค่าในคอลัมน์ ระบบจะยังตอบว่า "valid" ทั้งที่เลขที่แสดงไม่ตรงกับเลขที่ถูกผนึกไว้ นี่คือกับดักที่อันตรายที่สุดในงานนี้
- เป็นคีย์ค้นสาธารณะโดยตรง: `apps/backend/services/trace-service/resolve-generic.js:200` (batchNumber) และ `:298` (lotNumber)
- เป็น requiredFields ของสัญญาข้อมูลกับหน่วยงานภายนอก `DTAM_TRACEABILITY_SCHEMA_1.0.0` (`apps/backend/routes/api/interoperability/interoperability-contracts.js:24-31`) — แต่ **primaryId คือ UUID** (`:25` batchId, `:29` lotId) ไม่ใช่เลขที่คนอ่าน ความเสี่ยงจากการเปลี่ยน "ป้าย" จึงต่ำกว่าที่กลัว
- พิมพ์ลงสติกเกอร์และเก็บไฟล์ที่ `labels/<lotNumber>.pdf` แล้ว (`apps/backend/services/pdf/lot-label-template-service.js:56-85`) ของที่พิมพ์ไปแล้วเปลี่ยนย้อนหลังไม่ได้
- มาตรฐาน WHO ที่ seed ไว้บังคับ "unique batch numbering" (`apps/backend/prisma/seed-standards.js:26`) — เป็นข้อกำหนดภายนอก ไม่ใช่ทางเลือกของเรา

สิ่งที่ **ยังทำไม่ได้ทันที** สำหรับภาษาแบบยึดแปลง:

- "แปลงที่ 1" **ยังไม่มีอยู่จริง** — `Plot` มีแค่ `name` เป็นข้อความอิสระ ไม่มีคอลัมน์รหัส ไม่มี unique เลย (`apps/backend/prisma/schema/farm.prisma:229-231`; ทั้งโมเดล 219-256 มีแค่ `@@index([farmId])`, `@@index([organizationId])`) ต้องเพิ่มคอลัมน์ = migration
- "จำนวนต้น" ที่หน้า trace สาธารณะวันนี้มาจาก `prisma.plantUnit.count` (`apps/backend/services/trace-service/resolve-plot-cycle.js:192-193`) คือแนวคิด "ต้นรายต้น" ที่ R8 สั่งเลิก — และการเก็บเกี่ยวยัง **บล็อก** ถ้าไม่มี PlantUnit (`apps/backend/routes/api/cultivation/planting-cycles-activity-harvest-routes.js:259-263` และซ้ำอีกเส้นที่ `:274-279`) ต้องย้ายแหล่งข้อมูลไปที่ `PlantingCyclePlot.plannedPlantCount` (`cultivation.prisma:97`) ก่อน ห้ามลบ PlantUnit ก่อน
- โมเดล "รอบปลูก ↔ แปลง" มีสองทางพร้อมกัน: `PlantingCycle.plotId` (`cultivation.prisma:27-28`) กับ `cyclePlots` (`:29`) และมี `plotName`/`plotArea` ที่ประกาศ deprecated ค้างอยู่ (`:32-33`) — ต้องตัดสินก่อนว่าอันไหนคือความจริง ไม่งั้นเปลี่ยนคำศัพท์บนโครงที่ยังไม่นิ่ง
- `HarvestBatch` **ไม่มี** คอลัมน์แปลง — ความสัมพันธ์แปลง→batch ถูกยัดเป็น JSON ในคอลัมน์ `notes` หลังคำนำหน้า `PLOT_HARVEST_META:` (`harvest-capacity-operations.js:139-161`)

คำที่เสนอ อยู่ใน §4

### C. ถ้าเป็น Google/Apple จะออกแบบ "คน vs องค์กร" อย่างไร และเราออกแบบถูกไหม

**คำตอบ 1 ประโยค: ทิศทางเราถูกแล้วและตรงกับที่ Google/Apple ทำ (บัญชีบุคคลถาวร + องค์กรเป็นวัตถุแยก + เป็นสมาชิกพร้อม role + อยู่ได้หลายองค์กร + มีสวิตช์ชัด + ข้อมูลเป็นขององค์กร) — ครบ 3 ข้อ, ครบครึ่ง 2 ข้อ, ขาด 2 ข้อ และข้อที่ขาดคือข้อที่เจ็บที่สุด: ตัวสลับที่ผู้ใช้เห็น กับ "ข้อมูลอยู่กับองค์กรจริงหรือเปล่า"**

| คุณสมบัติแบบ Google/Apple | สถานะเรา | หลักฐาน |
|---|---|---|
| บัญชีบุคคล = ตัวตนถาวร ไม่ผูกกับองค์กร | **มีแล้ว** (และแข็งกว่าเขา) | คนสมัคร = INDIVIDUAL เสมอ `prisma-auth-service.js:645` · unique อยู่บน hash เลขบัตร `auth.prisma:33,38,62` |
| องค์กร/workspace เป็น entity แยก คนเป็น "สมาชิก" พร้อม role | **มีแล้ว** | `Entity` + `EntityMembership` `entity.prisma:118-162` · role OWNER/ADMIN/MANAGER/VIEWER `entity-service.js:53-58` |
| อยู่ได้หลายองค์กรพร้อมกัน | **มีแล้ว (schema+backend)** | `@@unique([userId, entityId])` `entity.prisma:156` · สร้าง workspace ได้ `routes/api/entities/index.js:209-226` |
| ตัวสลับองค์กรที่ชัดเจน มองเห็นตลอด | **มีบางส่วน** | ชิปมีจริง `dashboard-layout.tsx:283` แต่ disable เมื่อมี 1 workspace `entity-switcher.tsx:153` และไม่ถูก render ในหน้า wizard เลย `apps/web-app/src/app/health/layout.tsx:11,21-27` |
| บริบทองค์กรที่เลือกไว้ ถูกส่งถึง server จริง | **ขาด** | เลือกเก็บใน localStorage → ส่งเป็น header `api-client.ts:259-268` แต่ proxy ของ Next สร้าง header ใหม่จากศูนย์และ forward แค่ Content-Type / Authorization / X-User-ID — `apps/web-app/src/app/api/[...path]/route.ts:19-44` (ผมเปิดเองแล้ว: `const headers: Record<string,string> = {}` แล้วเติมทีละอัน) → **ยังไม่ได้พิสูจน์ที่ runtime** แต่ในระดับโค้ดไม่มีทางอื่นให้ header ผ่าน |
| ข้อมูลเป็นขององค์กร อยู่รอดเมื่อคนออกจากองค์กร | **มีบางส่วน** | Application/Farm ถูกกรองด้วย entity `tenant-prisma-extension.js:192-195,288-292` · แต่ **ใบรับรองยังผูกกับคน** `certification.prisma:17` + `certificate-service.js:912-916,935-936` · Farm ยังมี `ownerId` คู่กับ `entityId` `farm.prisma:10-11,19-24` |
| ตัวตนองค์กรถูกยืนยันโดยผู้มีอำนาจ (Google = ยืนยันโดเมน) | **ขาด** | ใครพิมพ์เลขทะเบียนก่อนได้เป็นเจ้าของ คนจริงมาทีหลังได้ 409 `routes/api/entities/index.js:239-241` · ประกาศเป็นความเสี่ยงที่ยอมรับไว้ใน `docs/superpowers/specs/2026-08-15-m1.5-hardening-design.md:23` เลื่อนการยืนยันโดยเจ้าหน้าที่ไป M2 §5 |

**ที่เรา "ต่างโดยชอบธรรม" เพราะกติกาไทย — ห้ามลอก US consumer product**

1. Google ให้คนหนึ่งมีหลายบัญชีส่วนตัวได้ เรา **ทำไม่ได้และไม่ควรทำ**: ตัวตนคือเลขประจำตัวประชาชน 1 คน = 1 บัญชี บังคับด้วย unique บน hash/HMAC (`auth.prisma:33,38`) และปลายทางคือ ThaiD (`apps/backend/services/auth/thaid-identity-service.js`, `apps/backend/services/auth/idp/thaid-adapter.js` — มีไฟล์จริง) ชั้น "คน" ของเราจึงบางกว่าแต่เชื่อถือได้มากกว่า และการ "สร้างบัญชีที่สองเพื่อยื่นในนามบริษัท" ต้องถูกปิดตาย ไม่ใช่เปิดตาม Google
2. PDPA: เราเก็บ hash/HMAC ไม่เก็บเลขบัตรแบบเปิด (คอมเมนต์ `auth.prisma:23-31` ระบุว่าถอด unique ของคอลัมน์ plaintext ออกตั้งใจ) ดังนั้นกลไก "เชิญเพื่อนด้วยอีเมล/โดเมน" แบบ Google ใช้ไม่ได้ตรง ๆ การเชิญต้องไม่เปิดเผยเลขประจำตัวของสมาชิกให้กันเห็น — ข้อนี้เป็น **การตัดสินใจของ operator** ไม่ใช่ข้อเท็จจริงจากโค้ด
3. เรามีสองชั้นองค์กร ไม่ใช่ชั้นเดียวแบบ Google: `Organization` คือ tenant ผู้รับรอง/หน่วยงาน (`apps/backend/prisma/schema/tenancy.prisma:22-31` — ตัวอย่างในคอมเมนต์คือ "กรมส่งเสริมการเกษตร เชียงใหม่") ส่วน `Entity` คือผู้ยื่น/ผู้ถือใบรับรอง โครงนี้ถูกแล้วสำหรับงานราชการ **แต่ห้ามเอา Organization ไปโผล่ให้เกษตรกรเห็นเด็ดขาด** ไม่งั้นจะกลายเป็นสามชื่อบนหัวเว็บ
4. ใบรับรองเป็นเอกสารทางกฎหมายของ "ผู้ถือ" ไม่ใช่ของคนที่กดยื่น — schema รู้แล้ว (`certification.prisma:31` คอมเมนต์ว่าฟาร์มเป็นผู้ถือ คนแค่ยื่น, `:33-35` holderDisplayName/holderType) เหตุผลที่ต้องทำให้ "ข้อมูลอยู่รอดเมื่อคนออก" จึงหนักกว่าเหตุผลเชิง UX ของ Google มาก

---

## 2. ช่องว่างระหว่าง schema ยอม / backend บังคับ / UI เปิดให้ทำ

| เรื่อง | schema ยอมให้ทำ | backend บังคับ/ทำจริง | UI เปิดให้ทำ | ช่องว่าง |
|---|---|---|---|---|
| คนเดียวถือหลายชนิดผู้ยื่น | ยอมเต็มที่ `entity.prisma:156` ไม่มี cap ใด ๆ | สร้างได้ `routes/api/entities/index.js:209-226`, `entity-service.js:1824-1840` | ซ่อนหลังไทล์ "ทีมงาน" tier secondary `nav-config.ts:146-154` | **UI คือคอขวดเดียว** |
| ชนิดผู้ยื่นของใบสมัคร | `type` เป็น String ธรรมดา ไม่มี enum ไม่มี CHECK `entity.prisma:35` | เขียนจาก active entity ทุกครั้ง `applications.js:1054` | banner อ่านอย่างเดียว `general-step.tsx:240-247` | ค่าที่ 4 สร้างได้ถ้าเลี่ยง service → banner จะ fallback เป็นตัวเลือก 3 ทางเงียบ ๆ |
| การสลับ workspace | — | อ่านจาก header อย่างเดียว, ไม่ตรงกับ membership → 403 `active-entity-middleware.js:110-152` | ชิป disable เมื่อมี 1 workspace `entity-switcher.tsx:153` | proxy ไม่ forward header `route.ts:19-44` → **UI สัญญาสิ่งที่ backend ไม่เห็น** |
| ทีมผูกกับอะไร | Entity เท่านั้น ไม่มี farmId `entity.prisma:123-127`, grants PK `entity-member-permission-grants.prisma:46` | บังคับด้วย capability ฝั่ง server จริง `middleware/farm-ownership.js:95-110`, `application-submit-guard.js:130-176` | matrix มีแต่กลุ่มสิทธิ์ ไม่มีตัวเลือกแปลง `member-permission-matrix-logic.ts:44-70` | จำกัดสมาชิกรายแปลง **ทำไม่ได้ทั้งสามชั้น** |
| ใบรับรองเป็นของใคร | เตรียมทางไว้แล้ว: farmId FK `certification.prisma:21-27`, holderDisplayName/holderType `:33-35` | ยัง filter ด้วย `userId` ทั้งสองเส้น `certificate-service.js:912-916,935-936` | เห็นเฉพาะของตัวเอง | **schema ย้ายแล้ว โค้ดยังไม่ย้าย** — สมาชิก workspace มองไม่เห็นใบรับรองของ workspace |
| ฟาร์มเป็นของใคร | มีทั้ง `ownerId` และ `entityId?` `farm.prisma:10-11,19-24` | สองสูตรตัดสิน: ผู้สร้างแถวได้สิทธิ์เจ้าของทุก role `farm-access.js:162-163` vs เอา fast-path ออกสำหรับฟาร์มใน workspace `entity-effective-permissions-service.js:345-362` | — | REVOKE รายคน **ไม่กันการอ่าน** บนฟาร์มที่คนนั้นสร้างเอง |
| เลขแปลง | ไม่มีคอลัมน์ ไม่มี unique `farm.prisma:229-231` | — | wizard ตั้งชื่อ default `แปลง N` ฝั่ง client `farm-info-step.tsx:385` | "แปลงที่ 1" ยังไม่มีอยู่จริง แปลงชื่อซ้ำกันได้ |
| แปลง ↔ ชุดเก็บเกี่ยว | ไม่มี FK บน HarvestBatch | เขียนเป็น JSON ใน `notes` `harvest-capacity-operations.js:139-161` | หน้า trace แสดง null เมื่อไม่มีข้อมูล `trace-service/common.js:105-122` | ความสัมพันธ์หลักของโดเมนไม่ใช่ FK |
| ต้นรายต้น (R8 สั่งเลิก) | `PlantUnit` ยังอยู่ `cultivation.prisma:117-149` | เก็บเกี่ยว **บล็อก** ถ้าไม่มี PlantUnit `planting-cycles-activity-harvest-routes.js:259-263,274-279` | "จำนวนต้น" มาจาก plantUnit.count `resolve-plot-cycle.js:192-193` · เมนู "ต้นไม้รายต้น" `th-core.ts:81-82` | โค้ดขัดกับ spec ที่อนุมัติแล้ว |
| ข้อกำหนดตรวจย้อนกลับ | seed ไว้ 1 ข้อ `seed-standards.js:26` | ตอบ MET อัตโนมัติทุกใบเพราะเป็น `platform` `standards-analyzer-service.js:99-106` + `standards-signal-map.js:45-49` | แสดงว่า MET | ข้อความ evidence อ้างสาย "รอบปลูก → รุ่นเก็บเกี่ยว → ล็อต" ที่ถ้าเปลี่ยนโมเดลแล้วไม่แก้ จะกลายเป็นคำโฆษณาที่ไม่จริง |
| ตรวจหน้างานข้อ 10.1 (รหัสติดตามล็อต, isCritical) | เก็บ isCritical ลงแถว `audit-onsite-service.js:196` | gate นับ **จำนวนแถว** อย่างเดียว ไม่ดูคำตอบ `onsite-evidence-gate.js:61,102-109` | — | ตอบ FAIL ข้อ critical ก็ยังออกใบรับรองได้ |

---

## 3. โมเดลที่ควรเป็น

**ห้าชั้น แยกกันชัด:**

1. **บุคคล (`User`)** — ตัวตนถาวร 1 คน = 1 บัญชี ยืนยันด้วย ThaiD ไม่มีชนิดผู้ยื่นติดตัว (`User.entityType` ประกาศ deprecated แล้วที่ `auth.prisma:10-13` ให้ readers ไปอ่าน `Entity.type` แทน — ปิดงานนี้ให้จบ) บุคคลไม่ถือใบรับรอง ไม่ถือฟาร์ม ถือแค่ "สมาชิกภาพ"
2. **ผู้ยื่นคำขอ / ผู้ถือใบรับรอง (`Entity`)** — 3 ชนิด: บุคคลธรรมดา / นิติบุคคล / วิสาหกิจชุมชน · ทุกคนมี Entity ส่วนตัวอัตโนมัติตั้งแต่สมัคร · คนหนึ่งสร้าง/เข้าร่วมได้หลาย Entity · **นี่คือหน่วยที่เป็นเจ้าของทุกอย่าง**: ฟาร์ม แปลง ใบสมัคร ใบรับรอง เอกสาร
3. **หน่วยงานเจ้าของระบบ (`Organization`)** — tenant ของผู้รับรอง/หน่วยราชการ (`tenancy.prisma:22-31`) **ไม่แสดงต่อเกษตรกรตลอดกาล** ปรากฏเฉพาะฝั่งเจ้าหน้าที่/แอดมิน
4. **ฟาร์ม → แปลง** — ฟาร์มเป็นของ Entity อย่างเดียว (`Farm.entityId` NOT NULL, เลิกใช้ `ownerId` เป็นตัวตัดสินสิทธิ์ เก็บไว้เป็นประวัติ) แปลงต้องมี **เลขแปลงในฟาร์ม** ที่ไม่ซ้ำ
5. **ใบสมัคร → ใบรับรอง** — ใบสมัครผูก `entityId` (ทำแล้ว) ใบรับรองต้องผูก Entity + Farm และเก็บ "คนที่กดยื่น" ไว้เป็นประวัติเท่านั้น (`certification.prisma:32-33` มี submittedByUserId อยู่แล้ว)

**สมาชิกผูกกับอะไร และทำไม**

- สมาชิกผูกกับ **Entity** เสมอ (คงตามที่เป็นอยู่ `entity.prisma:123-127`) เหตุผล: หน่วยที่กฎหมายรับรองคือผู้ยื่น ไม่ใช่แปลงดิน — ใบรับรองออกในนาม Entity (`certificate-service.js:1542` เขียน `holderDisplayName` จาก entity.displayName) ถ้าผูกสมาชิกกับฟาร์ม จะมีคนที่แก้ฟาร์มได้แต่ยื่นคำขอไม่ได้ ซึ่งไม่ตรงกับกระบวนการรับรอง
- role คงเดิม 4 ระดับ (`entity-service.js:53-58`) + ตารางสิทธิ์รายคน — สิทธิ์คำนวณสด ๆ ต่อ request ไม่ฝังใน token
- **ไม่ทำสิทธิ์รายแปลงในเฟสนี้** เพราะต้องเพิ่มมิติใน primary key ของตารางสิทธิ์ (`entity-member-permission-grants.prisma:46`) + เขียน `farmAccessWhere` ใหม่ + แก้ UI matrix = 4 ผิว ถ้าจำเป็นจริงให้เปิดเป็นสเปกแยก
- ผลที่ผู้ใช้ต้องเข้าใจ (ต้องเขียนบอกใน UI): **รับคำเชิญ = เห็นทั้ง workspace** ไม่ใช่แค่ฟาร์มที่ถูกชวน

**บริบท "ตอนนี้อยู่ workspace ไหน" ต้องเป็นของ server ไม่ใช่ของเบราว์เซอร์**

- ปัจจุบัน: localStorage → header → ถูก proxy ตัดทิ้ง (`api-client.ts:259-268` vs `route.ts:19-44`) ผลคือ UI ขึ้นว่า "ยื่นในนาม X" แต่ backend ผูกใบสมัครกับ Entity ส่วนตัว (`applications.js:1054`) และชื่อบนใบรับรองจะเป็นชื่อบุคคล (`certificate-service.js:1542`)
- เป้าหมาย: ให้ proxy forward `x-active-entity-id` (จุดฉีดมี 2 ที่ใน `api-client.ts` — `:259-268` และ `:530-537` ต้องแก้ทั้งคู่) และเก็บตัวเลือกล่าสุดไว้ที่ server เพื่อไม่ให้เปลี่ยนเครื่องแล้วบริบทหาย
- ทุกหน้าที่ผูกผลลัพธ์ทางกฎหมาย (wizard, ยื่น, ใบรับรอง) ต้องแสดงชื่อ Entity ที่ **backend ตอบกลับมา** ไม่ใช่ที่เบราว์เซอร์เดาเอง

---

## 4. คำศัพท์ที่ควรใช้

| แนวคิด | คำที่ใช้อยู่วันนี้ | คำไทยที่เสนอ | ใครเห็น | ตัวตนทางเทคนิคที่ต้องคงไว้ และเหตุผล |
|---|---|---|---|---|
| Entity (ตัวตนผู้ยื่น) | "workspace" / "ทีมงาน" | **ผู้ยื่นคำขอ** (หัวเว็บ: "ยื่นในนาม: …") | เกษตรกร + เจ้าหน้าที่ | `Entity.id`, `Entity.type` (`entity.prisma:35`) และ slug คงเดิม — slug อยู่ใน URL ที่แชร์กันแล้ว |
| Entity.type = INDIVIDUAL | บุคคลธรรมดา | **บุคคลธรรมดา** (คงเดิม) | เกษตรกร | ค่าสตริง `INDIVIDUAL` ห้ามเปลี่ยน — เป็นเงื่อนไขของ personal-entity fallback (`active-entity-middleware.js:152-156`) |
| Entity.type = COMMUNITY_ENTERPRISE | วิสาหกิจชุมชน / alias `COMMUNITY` ในฟอร์ม | **วิสาหกิจชุมชน** | เกษตรกร | ต้องเลือกสตริงเดียว: schema/API ใช้ `COMMUNITY_ENTERPRISE` แต่ฟอร์ม wizard ใช้ alias `COMMUNITY` — ถ้ารวมต้องแก้ map ทั้งสองฝั่งพร้อมกัน ไม่งั้น map เอกสารที่ต้องใช้จะเลือกสาขาผิดเงียบ ๆ |
| Organization (tenant) | หน่วยงาน | **ไม่แสดง** | ภายในเท่านั้น | `Organization.slug/code` ใช้ routing (`tenancy.prisma:28-30`) — ห้ามโผล่ในหน้าเกษตรกร |
| Farm | ฟาร์ม / สถานประกอบการ | **ฟาร์ม** | เกษตรกร + เจ้าหน้าที่ | `Farm.entityId` เป็นตัวตัดสินสิทธิ์ ไม่ใช่ `ownerId` |
| Plot | แปลง (304 ครั้ง — ใช้ถูกอยู่แล้ว) | **แปลง** เป็นคำหลักของทั้งระบบ | เกษตรกร + เจ้าหน้าที่ + ผู้บริโภค | ต้องเพิ่มรหัสแปลง — ปัจจุบันมีแค่ `name` (`farm.prisma:229-231`) |
| เลขแปลง | ไม่มี | **แปลงที่ 1, 2, 3** (ไม่ซ้ำภายในฟาร์ม) | ทุกคน | ต้องเป็นคอลัมน์ใหม่ + unique(farmId, code) ไม่ใช่ชื่ออิสระ |
| PlantingCycle | รอบปลูก (69 ครั้ง) | **รอบปลูก** (คงเดิม) | เกษตรกร + เจ้าหน้าที่ | ต้องตัดสินก่อนว่า `plotId` หรือ `cyclePlots` คือความจริง (`cultivation.prisma:27-29`) |
| จำนวนต้นในแปลง | "จำนวนต้น" จาก plantUnit.count | **จำนวนต้น** = ตัวเลขเฉย ๆ | เกษตรกร + ผู้บริโภค | ต้องเปลี่ยนแหล่งเป็น `PlantingCyclePlot.plannedPlantCount` (`cultivation.prisma:97`) · ระวังมีคอลัมน์ที่สามคือ `PlantingCycle.estimatedPlantCount` (`:51`) |
| HarvestBatch | "ชุดเก็บเกี่ยว" 14 / "Batch" ปนอังกฤษ / คอมเมนต์เรียก "Lot" | **การเก็บเกี่ยว ครั้งที่ N** (เกษตรกร) · **ชุดเก็บเกี่ยว** (เจ้าหน้าที่) | เกษตรกร + เจ้าหน้าที่ | `batchNumber` = ภายใน + คีย์ QR สาธารณะ ห้ามเปลี่ยนค่า (`qrcode-service.js:489-497`, `resolve-generic.js:200`, `interoperability-contracts.js:26`) |
| Lot (ชุดบรรจุ) | "ล็อต" 48 / "ลอต" 8 | **ชุดบรรจุ** (เลิกใช้ ล็อต/ลอต ทั้งคู่) | เกษตรกร + ผู้ซื้อ | `lotNumber` คงค่าเดิม — พิมพ์ลงสติกเกอร์ไปแล้ว (`lot-label-template-service.js:56-85`) และมี print-lock (`routes/api/trace/lots.js:386-393`) |
| PlantUnit | "ต้นไม้รายต้น" ในเมนู (`th-core.ts:81-82`) | **ไม่แสดง** (เลิกตาม R8) | ภายในเท่านั้น | ลบออกจากคำได้ แต่ **ห้ามลบโมเดล/route ก่อน** ปลดบล็อกเก็บเกี่ยวและเปลี่ยนแหล่ง "จำนวนต้น" |
| role ในทีม | เจ้าของ/ผู้ดูแล/ผู้จัดการ/ผู้ดู (`entity-switcher.tsx:39-42`) | คงเดิม | เกษตรกร | ค่า OWNER/ADMIN/MANAGER/VIEWER คงเดิม (`entity-service.js:53-58`) |
| "ล็อตการผลิต" ใน wizard | ป้ายขั้นตอนที่ไม่มีขั้นตอนจริง | **ลบทิ้ง** | — | ไม่มีอะไรเขียนข้อมูลนี้ หน้า review แสดงเป็น 0 ตลอด |

**กติกาเดียวที่ต้องจำ:** เปลี่ยนได้เฉพาะ "คำที่คนอ่าน" ค่าที่เก็บใน DB / ที่อยู่ใน QR / ที่ส่งให้หน่วยงานภายนอก **คงเดิมทุกตัวอักษร**

---

## 5. งานที่ต้องทำ (เรียงลำดับ)

### ชั้น 0 — ต้องตัดสินก่อน (BLOCKED ที่ operator เท่านั้น)

| # | คำถามที่ต้องตอบ | ทำไมเราตัดสินเองไม่ได้ |
|---|---|---|
| O1 | ใบรับรองเป็นของ Entity/ฟาร์ม หรือของคนที่ยื่น | เป็นเอกสารทางกฎหมาย การแก้ตัวกรองอ่านจะขยายว่าใครโหลด PDF ใบรับรองได้ (`certificate-service.js:912-916,935-936`) |
| O2 | ให้ใส่ลิงก์ "สร้างผู้ยื่นใหม่" กลับเข้าแถบหัวเว็บได้ไหม | Task 7 ลบออกตั้งใจตามกฎ N2 (`entity-switcher.tsx:224-231`) การใส่กลับ = เปิดกฎที่เพิ่งปิด |
| O3 | เดินหน้า R8 (เลิกต้นรายต้น) เมื่อไหร่ | การถอด PLANT_UNIT ออกจากสัญญา `DTAM_TRACEABILITY_SCHEMA_1.0.0` (`interoperability-contracts.js:32-35`) เป็น MAJOR bump ต่อ partner และ route สาธารณะ `/api/trace/plant/:qrCode` (`routes/api/trace/trace.js:179`) ยังเปิดอยู่ |
| O4 | ยอมรับ "ใครจดก่อนได้ก่อน" ต่อ หรือบังคับให้เจ้าหน้าที่ยืนยันตัวตนนิติบุคคลตั้งแต่ตอนนี้ | ความเสี่ยงถูกประกาศไว้แล้วและเลื่อนไป M2 §5 (`docs/superpowers/specs/2026-08-15-m1.5-hardening-design.md:23`) |
| O5 | คำที่ผู้ซื้อเห็นบนสติกเกอร์: "ชุดบรรจุ" หรือคงคำเดิม | ของพิมพ์ไปแล้วอยู่ในตลาด (`lot-label-template-service.js:85`) |
| O6 | R10 (ป้ายผูกกับแปลง) อนุมัติหรือพัก | เอกสาร `docs/superpowers/specs/2026-08-21-plot-tag-mobile-recording-addendum.md` สถานะ PENDING และยังไม่ถูก commit |
| O7 | ตอบ FAIL ข้อ critical 10.1 ควรบล็อกการออกใบรับรองไหม | วันนี้ gate นับแถวอย่างเดียว (`onsite-evidence-gate.js:102-109`) ขณะที่คอมเมนต์ `audit-onsite-service.js:159` บอกว่า critical FAIL = FAIL รวม — เป็น gate ของใบรับรอง = operator |
| O8 | การเชิญสมาชิกจะระบุตัวคนด้วยอะไร (ห้ามเปิดเผยเลขประจำตัวตาม PDPA) | เป็นข้อกำหนดคุ้มครองข้อมูล ไม่ใช่ข้อเท็จจริงในโค้ด |

### ชั้น 1 — UI เท่านั้น (ถูก เร็ว ปลอดภัย · Tier A/B)

1. **U1** เปลี่ยนป้ายและระดับของไทล์ "ทีมงาน" → "ผู้ยื่นคำขอ / ทีมงาน" และย้ายขึ้น tier `primary` (`nav-config.ts:146-154`, `health/home/client-view.tsx:46-47,68-72`)
   *กับดัก:* label และ href ถูก pin ไว้ในเทสต์ (`apps/web-app/src/lib/navigation/__tests__/nav-config.test.ts:107`, `apps/web-app/src/lib/__tests__/health-navigation-workspaces.test.ts:23-25`) ต้องแก้เทสต์พร้อมกันแบบเปิดเผย
2. **U2** แก้คำใบ้ใน wizard ให้ชี้เส้นทางที่มีจริง แทนที่จะชี้ชิปที่กดไม่ได้ (`th-wizard.ts:419` แสดงที่ `general-step.tsx:388-390`)
3. **U3** ใส่ป้ายกำกับให้ชิปหัวเว็บ: "ยื่นในนาม: <ชื่อ>" + role — วันนี้เป็นชื่อลอย ๆ ที่ซ้ำกับชื่อผู้ใช้ข้าง ๆ (`entity-switcher.tsx:164-173` vs `dashboard-layout.tsx:167-168`) และคำอธิบายมีแค่ `title=` ที่ต้อง hover (`entity-switcher.tsx:162`)
   *กับดัก:* ห้ามแก้ `entity-service.js:362-366` เพื่อเปลี่ยนชื่อที่แสดง — ค่านั้นไหลไปเป็นชื่อผู้ถือบนใบรับรอง (`certificate-service.js:1542`, คอลัมน์ `certification.prisma:34`) แก้ที่ชั้น UI เท่านั้น
   *กับดัก:* ถ้าจะทำให้ชิปกดได้ตอนมี workspace เดียว ต้องแก้ ARIA ที่ถูกเทสต์ pin ไว้ และชน O2
4. **U4** ทำสถานะพังให้พูดความจริง: เมื่อโหลด `/entities/mine` ไม่สำเร็จ วันนี้หัวเว็บขึ้น "ไม่มีพื้นที่ใช้งาน" (`entity-switcher.tsx:106-113`) ขณะที่ wizard กลับโชว์ตัวเลือก 3 ทางให้กดได้ (`general-step.tsx:240-247` สาขา else) → ต้องเป็นข้อความเดียวกันและห้ามให้กรอกต่อ
   *กับดัก (ของจริง ไม่ใช่สมมติ):* ในสถานะนี้ผู้ใช้เลือกชนิดผู้ยื่นได้ แต่ `/prepare` จะทับด้วย Entity ส่วนตัวอยู่ดี (`applications.js:1054`) → ฟอร์มกับผู้ยื่นตามกฎหมายแยกจากกันเงียบ ๆ
5. **U5** ล้างคำศัพท์: ล็อต/ลอต → คำเดียวผ่าน dictionary (21 ไฟล์), เก็บ "Batch" ที่ปนอังกฤษออกจากข้อความที่ผู้ใช้เห็น, ลบป้าย "ล็อตการผลิต" ใน wizard
6. **U6** เอาเมนู "ต้นไม้รายต้น" ออกจากคำโฆษณาเกษตรกร (`th-core.ts:81-82`) — **ทำหลัง** M3/O3 เท่านั้น ไม่งั้นตัดหน้าที่ยังทำงานอยู่ทิ้ง

### ชั้น 2 — โค้ด backend/edge ไม่ต้อง migration (RED-first บังคับ)

7. **B1** ให้ proxy forward `x-active-entity-id` (`apps/web-app/src/app/api/[...path]/route.ts:19-44`) — นี่คืองานที่ทำให้ "สลับผู้ยื่น" ทำงานจริงบนเครื่อง deploy
   *กับดัก:* หลังแก้ ผู้ใช้หลาย workspace จะเห็นขอบเขตข้อมูลเปลี่ยนทันที และค่า localStorage เก่าจะเริ่มได้ 403 `ACTIVE_ENTITY_MISMATCH` (`active-entity-middleware.js:110-152`) ต้องมีทางลงให้ค่าที่ค้าง
   *กับดัก:* จุดฉีด header มี 2 ที่ (`api-client.ts:259-268` และ `:530-537`) และ proxy ไม่ forward `Cookie` เลย ถ้าอนาคตจะย้ายไป cookie ต้องแก้ที่เดียวกันนี้
   *เพราะแตะ identity binding โดยตรง → ให้ `tier-check.sh` ตัดสิน tier อย่าเดาเอง*
8. **B2** ย้ายแหล่ง "จำนวนต้น" ในหน้า trace สาธารณะ จาก `plantUnit.count` ไปเป็น `plannedPlantCount` (`resolve-plot-cycle.js:192-193` → `cultivation.prisma:97`)
9. **B3** ปลดบล็อกการเก็บเกี่ยวที่บังคับให้มี PlantUnit (`planting-cycles-activity-harvest-routes.js:259-263,274-279` และเส้นที่สองใน `harvest-capacity-operations.js:62-78`) — **ทำหลัง O3 และหลัง B2**
10. **B4** อัปเดตข้อความ evidence ของข้อกำหนด WHO ให้ตรงโมเดลจริง (`standards-signal-map.js:45-49`)
    *กับดัก:* ห้ามเปลี่ยน **ชื่อ** requirement เด็ดขาด — คีย์ join คือ `${code}:${name}` ถ้าไม่ตรง ผลจะกลายเป็น NEEDS_REVIEW เงียบ ๆ ไม่ใช่ NOT_MET (`standards-analyzer-service.js:79,90-97`)

### ชั้น 3 — ต้อง migration (expand → backfill → contract · Tier C · operator merge)

11. **M1** เพิ่มรหัสแปลง: `Plot.code` (nullable) → backfill จากลำดับในฟาร์ม → unique(farmId, code) → UI แสดง "แปลงที่ N" (`farm.prisma:229-231`)
12. **M2** ย้ายสิทธิ์การอ่านใบรับรองจาก `userId` ไปเป็น entity/farm scope โดยเก็บ `userId` ไว้เป็นประวัติ (`certification.prisma:17,32-33`; ตัวกรอง `certificate-service.js:912-916,935-936`) — **หลัง O1**
13. **M3** เพิ่ม FK แปลงบน `HarvestBatch` แล้ว backfill จาก JSON ใน `notes` โดย **ยังอ่าน notes ต่อไป** จนกว่าจะ drain (`harvest-capacity-operations.js:139-161`; ผู้อ่าน: `routes/api/trace/trace-batch-lot-routes.js:88-92,144-155,279-287`)
    *กับดัก:* คำนำหน้า `PLOT_HARVEST_META:` ถูกประกาศซ้ำสองไฟล์ (`planting-cycle-service.js:654`, `trace-service/common.js:33`) แตะแล้วชน ratchet dup-source
    *กับดัก:* การลงทะเบียน integrity เป็น best-effort มี `.catch(warn)` ครอบ (`harvest-capacity-operations.js:259-261`) → บางแถวมีแค่ notes ถ้าตัด notes ก่อน backfill ข้อมูลแปลงหายโดยไม่มี error
14. **M4** ตัดสินและรวมเส้นเชื่อม "รอบปลูก ↔ แปลง" ให้เหลือทางเดียว (`cultivation.prisma:27-29`, ทิ้ง `plotName`/`plotArea` ที่ `:32-33`)
    *กับดัก:* ลบแปลงวันนี้ทำให้ `PlantUnit.cyclePlotId` ถูก set null (`cultivation.prisma:128`) → เก็บเกี่ยว 400 ทันที เป็นกับดักข้อมูลที่มีอยู่แล้วโดยไม่ต้องเปลี่ยนคำศัพท์อะไรเลย
15. **M5** เก็บ "ผู้ยื่นที่เลือกล่าสุด" ไว้ฝั่ง server เพื่อไม่ให้บริบทหายเมื่อเปลี่ยนเครื่อง — ทำหลัง B1
16. **M6** ปิดงาน `User.entityType` ที่ประกาศ deprecated ไว้ (`auth.prisma:10-13`) — contract phase เท่านั้น หลังยืนยันว่าไม่มีผู้อ่าน

### กับดักรวมที่ต้องเขียนไว้ในทุกใบ PR ของงานนี้

- **ห้ามเปลี่ยนค่า `batchNumber`/`lotNumber` ที่บันทึกแล้ว** — การตรวจลายเซ็นคำนวณจากเพย์โหลดที่เก็บไว้อย่างเดียว จะยังตอบ "valid" ทั้งที่เลขไม่ตรงกัน (`qrcode-service.js:489-497`)
- **ห้ามเปลี่ยนจำนวนข้อใน `CHECKLIST_TEMPLATE_2026`** โดยไม่มีแผนย้ายข้อมูล — gate ออกใบรับรองอ่านความยาว array ตรง ๆ (`onsite-evidence-gate.js:61`) เพิ่มข้อ = บล็อกการออกใบรับรองของทุกงานตรวจที่ทำค้างไว้ทันที และ itemCode เป็นส่วนหนึ่งของคีย์ unique
- **ห้ามเพิ่มโมเดลเข้า `ENTITY_SCOPED_MODELS` ลอย ๆ** — จะฉีด `entityId` เข้าไปใน where ของทุก findMany/findFirst/count เงียบ ๆ (`tenant-prisma-extension.js:192-195,285-302`) และการฉีดเป็น where ระดับบนสุดเท่านั้น เงื่อนไขที่เขียนเป็น relation ซ้อน (เช่นตาราง cultivation) จะไม่ถูกจำกัดอยู่ดี
- **ห้ามเปิดตัวเลือกชนิดผู้ยื่นใน wizard กลับมาเป็นแบบกดได้** ตราบใดที่ `/prepare` ยังทับค่าจาก active entity (`applications.js:1054`)

---

## 6. สิ่งที่ยังไม่ได้ตรวจ (พูดตรง ๆ)

1. **ไม่ได้รันอะไรเลย** — ไม่ได้เปิดแอป ไม่ได้ต่อ DB ไม่ได้รัน test/probe ในรอบนี้ ทุกข้อความข้างบนคือการอ่านซอร์สเท่านั้น ตามกติกา §2 ของ repo สถานะงานนี้คือ PENDING ไม่ใช่ DONE
2. **ผลจริงของการที่ proxy ตัด `x-active-entity-id`** — ระดับโค้ดไม่มีทางอื่นให้ header ผ่าน (`route.ts:19-44` สร้าง header map จากศูนย์) แต่ **ยังไม่เคยเห็นด้วยตาว่าเกิดอะไรบนเครื่อง staging** ต้องกดจริงหนึ่งรอบก่อนใช้ข้อนี้ตัดสินใจใหญ่
3. **`Certificate` มีคอลัมน์ `entityId` แล้วหรือยัง** — ผมไม่ได้เปิดตรวจในรอบนี้ (มีรายงานจาก lane อื่นว่ามีการ stamp entity ตอนออกใบรับรอง แต่ผมไม่ยืนยัน) ต้องเช็คก่อนวางแผน M2
4. **ใบสมัครที่ยื่นไปแล้วจะหายจากรายการเมื่อสลับ workspace หรือไม่** — จากโค้ด (`application-identity-methods.js:222-228` + `tenant-prisma-extension.js:288-292`) น่าจะหาย แต่ยังไม่ได้เห็นจริง — และถ้าจริง นี่จะเป็น "ล็อก" อันที่สองที่ผู้ใช้เจอ
5. **`apps/mobile-app` ไม่ได้อ่านเลย** และไม่ได้อ่าน dictionary ภาษาอังกฤษ — ตัวเลขคำศัพท์ทั้งหมดนับเฉพาะ `apps/web-app/src`
6. **หน้าจอมาตรฐานแสดง `nameTH` "รุ่นผลิต" ให้ผู้ใช้เห็นหรือไม่** ไม่ได้ตรวจ — คำนี้พบเฉพาะใน seed (`seed-standards.js:26`) ไม่พบใน `apps/web-app/src`
7. **สถานะการอนุมัติของ R10** — ไฟล์ addendum ยังเป็น untracked ในรอบนี้ ผมอ่านเนื้อหาไม่ครบและไม่ยืนยันสถานะ
8. **สแนปช็อตของ working tree** — มี agent อื่นแก้ไฟล์ในเช็คเอาต์เดียวกันระหว่างที่ผมอ่าน ตัวเลขนับคำและเลขบรรทัดคือภาพ ณ 2026-08-21 ต้องเช็คซ้ำก่อนลงมือแก้
