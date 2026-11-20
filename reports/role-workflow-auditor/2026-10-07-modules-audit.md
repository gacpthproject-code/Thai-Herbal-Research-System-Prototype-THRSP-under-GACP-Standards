# role-workflow-auditor · ตรวจโมดูลที่เหลือ (ผู้ดูแลระบบ · หน้าสาธารณะ · T&T · ระบบร่วม · ต้นแบบตามสัญญา) · 2026-10-07

- โค้ดที่อ่าน: main `ff941271a` (worktree หลัก) · อ่านอย่างเดียว ไม่ได้แก้โค้ด
- staging และ demo ยังเดิน `b74a31ff` (`GET /api/health` → `revision`) ⇒ **staging ตามหลัง main** ของที่ merge หลัง b74a31ff (staff-access, closed-state-labels, v1.3) ยังไม่ขึ้น
- staging: ยิงเฉพาะ GET สาธารณะ และถ่ายภาพหน้าสาธารณะ 6 หน้า (`reports/role-workflow-auditor/2026-10-07-modules/*.png`) · **ไม่มีบัญชีเจ้าหน้าที่ของ staging** ใน `~/work/state` (ไฟล์ qa-credentials เป็นของ scratch stack) ⇒ ทุกหน้าที่ต้องล็อกอินตรวจจากโค้ดเท่านั้น
- เครื่องนี้คือโฮสต์ staging ⇒ ดู cron/backup/Prometheus จริงได้ (อ่านอย่างเดียว ไม่พิมพ์ค่า env)
- ใช้รายการ M01–M23 ของ operator เป็นแค่ checklist ว่ามีโมดูลอะไร · ตัดสิน "ถูก/ผิด" ด้วยมติปัจจุบัน (preferences.md, memory) เท่านั้น
- ชื่อบทบาทใช้คำ canonical จาก `apps/backend/shared/canonical-rbac.js` · `CANONICAL_ROLES`
- **สถานะรวม: PENDING** — หลักฐานคือการอ่านโค้ดกับ GET จริงบน staging ไม่มี probe ที่ตั้งชื่อไว้รันใน session นี้

---

## คำตอบสั้น

ข้อที่หนักที่สุด 6 ข้อ:

1. **ผู้ดูแลกรม (`system_admin_dtam`) แก้ค่าตั้งระบบได้ทุกคีย์ ไม่มีรายการคีย์ที่อนุญาต** และค่าที่แก้มีผลกับทุกองค์กร · คีย์ที่แก้ได้รวมถึง `audit_chain_baselines` (ปิดการตรวจการปลอมแก้บันทึก audit) และ `ocr_bypass_enabled` (ทำให้บัญชีที่สมัครใหม่ ACTIVE ทันทีโดยไม่ต้องยืนยันตัวตน)
2. **การแบ่งสิทธิ์ตั้งบทบาท (คำสั่งข้อ 13) ยังไม่มีบนเซิร์ฟเวอร์** ผู้ดูแลกรมตั้ง `finance_officer_platform` ได้ ส่วนผู้ดูแลบริษัทเปลี่ยนบทบาทของผู้ใช้ที่มีอยู่แล้วไม่ได้เลย
3. **การให้สิทธิ์รายคน (GRANT) ไม่มีรายการต้องห้าม** ผู้ดูแลกรมให้ `field_inspector` อ่านบัญชีได้ หรือให้ตรวจเอกสารได้ ซึ่งขัดมติ 2026-09-27 และคำสั่งข้อ 27
4. **การพักใช้/เพิกถอนใบรับรองยังไม่ใช่งานของผู้อนุมัติ** (ขัดคำสั่งข้อ 29) ประตูเพิกถอนมีแค่ของผู้ดูแลกรมกับผู้ดูแลบริษัท และไม่มีประตูพักใช้เลย
5. **ฐานข้อมูลสมุนไพรตามสัญญา (ต้นแบบที่ 5) ว่างทั้งบน staging และ demo** คือ 0 ชนิด 0 รายการ จากเป้า 300 รายการ × 6 ชนิด · ส่วนเอกสารตรวจรับตามสัญญาถูกถอดออกจาก tree ไปแล้ว
6. **ระบบเฝ้าระวังไม่ได้เฝ้า backend** เป้า `gacp-backend` ใน Prometheus อยู่ในสถานะ down เพราะหาชื่อ `backend` ไม่เจอ · มีกฎแจ้งเตือน 0 ข้อ และ alertmanager 0 ตัว

ส่วนที่ทำงานถูกต้อง (ตรวจแล้ว):
- gacpth.com มีม่านบังและ noindex
- ตาราง PlantUnit ถูกลบออกจาก schema แล้ว
- เปิดรอบปลูกได้เฉพาะเมื่อมีใบรับรอง
- หน้าสแกนล็อตไม่ส่งพิกัด GPS และไม่ส่ง id ภายใน
- pre-check เอกสารเป็นแบบเตือนอย่างเดียว ไม่บล็อก
- แจ้งเตือนเป็นในแอปอย่างเดียว ไม่มีไลบรารีอีเมลหรือ SMS
- ยืนยันคำขอลบบัญชี (PDPA) ผ่านแจ้งเตือนในแอป
- backup รันทุกวันจริง
- คำขออนุโลมห้ามอนุมัติเรื่องของตัวเอง

---

## A. ผู้ดูแลระบบ (`system_admin_dtam` / `system_admin_platform`)

| ประตู | ไฟล์ · symbol | ผล |
|---|---|---|
| รายชื่อผู้ใช้ | `routes/api/admin/users.js` · `router.get('/')` → `provider-user-service.js` · `searchAdminUsers` | **ใช้ได้บางส่วน** · ในโค้ดไม่มีเงื่อนไของค์กร แต่ตัวกรองชั้นข้อมูล `services/tenant-prisma-extension.js` · `applyReadScopes` (`TENANT_READ_ORG_SCOPE=true` บน staging) ใส่ `organizationId` ของผู้เรียกให้ ⇒ บน staging เห็นเฉพาะองค์กรตัวเอง |
| ตั้ง/เปลี่ยนบทบาท | `users.js` · `router.patch('/:id/role')`, `'/:id/change-role'` → `admin-user-service.js` · `changeUserRole`, `router.post('/provider')` | **ผิด** (D2) ห้ามแค่ `system_admin_platform` อย่างเดียว |
| ตั้งบทบาท (ผู้ดูแลบริษัท) | `middleware/require-admin.js` · `requireAdmin` รับเฉพาะ `system_admin_dtam` · ผู้ดูแลบริษัทมีแค่ `routes/api/platform-admin/organizations.js` · `POST /:id/users` (สร้างใหม่เท่านั้น) | **ขาด** ผู้ดูแลบริษัทเปลี่ยนบทบาท ปิด หรือเปิดบัญชีที่มีอยู่แล้วไม่ได้ |
| สิทธิ์รายคน | `routes/api/admin/user-permissions.js` · `router.put('/:userId/:permission')` | **ผิด** (D3) |
| องค์กร | `platform-admin/organizations.js` (เฉพาะ `ROLE_GROUPS.PLATFORM_ADMIN_ONLY`) | ใช้ได้ |
| ค่าตั้งระบบ | `routes/api/admin/config.js` · `router.patch('/:key')` และ `routes/api/system/system-config-routes.js` → `controllers/system-config-controller.js` · `updateConfig` | **ผิด** (D1) |
| force / break-glass | `routes/api/admin/applications.js` · `'/:id/status'`, `'/:id/force-status'`, `'/:id/revert-last-transition'` · `routes/api/provider/admin.js` · `status-override`, `batch-actions` | ตามคำสั่งข้อ 31 มีกิ่งกำลังแก้อยู่ · **เพิ่มเข้าขอบเขต**: `revert-last-transition` ย้อนกลับไปลงสถานะที่เป็นการตัดสินของบทบาทอื่นได้ (เช่นย้อนกลับไป `DOC_APPROVED`) · ทั้งสามประตูหาคำขอด้วย id โดยไม่มีเงื่อนไของค์กร (การค้นด้วย id ไม่ถูกตัวกรองชั้นข้อมูลครอบ) |
| ขยายกำหนดแก้ไข | `routes/api/provider/handlers/admin.js` · `adminDeadlineExtension` | **ผิด** (D9) |
| บันทึก audit | `routes/api/admin/audit-log.js` · รับพารามิเตอร์ `organizationId` เพื่ออ่านข้ามองค์กร | บน staging ตัวกรองชั้นข้อมูลเขียนทับค่านี้ด้วยองค์กรของผู้เรียก ⇒ อ่านข้ามองค์กรไม่ได้ · แต่เอกสารใน header ของไฟล์ยังเขียนว่า "admins can audit across tenants" ซึ่งชวนให้เข้าใจผิด |
| คำขออนุโลม (waiver) | `routes/api/provider/waiver-reopen.js` · `services/waiver-reopen-service.js` · `assertApprover` | ใช้ได้ · ห้ามอนุมัติของตัวเอง (`WAIVER_SELF_APPROVAL`) · การเงินทั้งสองฝั่งอนุมัติได้ · คิวจำกัดในองค์กร |
| เพิกถอนใบรับรอง | `routes/api/admin/certificates.js` · `'/:id/revoke'` · `routes/api/integration/interoperability.js` · `'/v1/certificates/:certificateNumber/revoke'` | **ผิด** (D4) |
| เรียกคืนล็อต | `routes/api/admin/lots.js` · `'/:id/recall'` | ใช้ได้ (ต้องระบุเหตุผล + มีบันทึก audit) |
| ประกาศถึงผู้ใช้ | `provider/admin.js` · `broadcast`, `communication-log` | ไม่ได้ตรวจลึก |
| kill switch | ค่า `feature.*` ใน `system-config-controller.js` · `PUBLIC_CONFIG_KEYS` ส่วน kill switch ตัวจริงคือ env (`TENANT_READ_ORG_SCOPE` เป็นต้น) | ใช้ได้บางส่วน · ไม่มีหน้าจอ kill switch ที่มีความหมาย |

## B. หน้าสาธารณะ

| หน้า / ประตู | ผล (staging b74a31ff) |
|---|---|
| `/` landing | 200 · มีตรากรม (`dtam-seal.png`) ตามคำสั่งข้อ 21 · ภาพ `landing.png` |
| `/pricing` | 200 · ตัวเลขดึงจาก `GET /api/pricing/fees` (`app/(marketing)/pricing/page.tsx`) · ไม่พบคำว่าบัตร · ภาพ `pricing.png` |
| `/verify` | 200 · **ไม่มีตรากรม** · ถ้อยคำเชิงเทคนิค "ตามสัญญาข้อมูลกลาง", "ชั้นความเชื่อถือภาครัฐ" (L5) · ภาพ `verify.png` |
| `/api/public/verify/:no` | `routes/api/auth/public.js` · `router.get('/verify/:certificateNumber')` · เลขที่ไม่มีอยู่ตอบ `NOT_FOUND` · ใบที่ไม่ active จะซ่อนข้อมูลฟาร์ม · `applicantName` ถูกปิดบางส่วน · **ไม่ได้ทดสอบกับใบจริง** เพราะเลขใบเก่าบน staging ไม่พบแล้ว (`GACP-TH-2569-85B448` → NOT_FOUND) |
| revisions | `'/verify/:certificateNumber/revisions/:n'` · ไม่ได้ยิง (ต้องมีใบจริง) |
| QR ล็อต `/api/trace/lot/:id` | `routes/api/trace/trace-batch-lot-routes.js` · ใบหมดอายุ/ถูกเพิกถอน → 410 ตอบข้อมูลขั้นต่ำ · `services/trace-service/public-farm.js` · `toPublicFarm` ส่งชื่อฟาร์มและที่อยู่เต็ม (ผ่อนตามมติ 2026-09-05 แบบ "ชั่วคราวเฉพาะช่วงเดโม" — `docs/superpowers/specs/2026-09-05-tnt-data-scope.md` §7) · ไม่ส่ง GPS · ไม่ส่ง id |
| `/privacy` | 200 · **ล้าสมัย** (D8) · ภาพ `privacy.png` |
| noindex | gacpth.com: ม่านบัง + `<meta robots noindex>` + `X-Robots-Tag` ✔ · staging/demo มี `X-Robots-Tag: noindex` ✔ · แต่ `robots.txt` ของ staging/demo ยังเขียน `Allow: /` (L4 — header มีผลเหนือกว่า จึงไม่เสียหาย) |
| `/api/config/plants`, `/api/config/area-types` | **ขัดมติ** (D11) |

## C. การสืบย้อนหลังได้ใบรับรอง (เทียบ spec บน main)

| เรื่อง | ผล |
|---|---|
| PlantUnit | ตารางถูกลบจาก schema แล้ว (`prisma/schema/cultivation.prisma`) · route `/plant-units` ไม่มีแล้ว · **ยังค้าง**: สิทธิ์ `UNIT_MANAGE` ใน `services/entity-service.js` · `CAPABILITIES` และป้าย "ลงแปลงปลูก/จัดการต้นปลูก" ใน `routes/api/entities/member-permissions.js` ซึ่งไม่มีประตูไหนใช้แล้ว (L1) |
| รอบปลูกต้องมีใบรับรองก่อน | `services/planting-service.js` → `PLANTING_REQUIRES_CERTIFICATE` ✔ |
| ล็อต + QR | `routes/api/trace/lots.js` · `router.post('/')` ตรวจความเป็นเจ้าของรุ่น + โควตาน้ำหนัก · QR ผูกกับรอบที่ต้องมีใบรับรองอยู่แล้ว ✔ |
| ผล Lab ไม่บังคับ | ไม่บล็อกขั้นใด (R7) ✔ · หน้าสาธารณะเปิดไฟล์ COA ได้ตามมติ 2026-09-05 แทน R9 (รายการที่ผ่อนไว้ §7) |
| ผู้ติดตามฝั่งเจ้าหน้าที่ | `routes/api/provider/planting.js` · `TRACKING_VIEW_ALL` + `recordFarmDataAccess` ✔ · **มติสองฉบับขัดกัน**: spec T&T §3 เขียนว่าเจ้าหน้าที่ติดตามเห็น "เลขบัตรประชาชนเต็ม — ไม่ mask" แต่คำสั่งข้อ 10 (2026-10-06) ให้เลขบัตรออกจากเซิร์ฟเวอร์ได้แบบปิดบางส่วนเท่านั้น ⇒ ต้องแก้ spec (Q10) |
| ใบหมดอายุ → ป้าย "ผลิตขณะใบยังมีผล" 12 เดือน (คำสั่งข้อ 25.5) | **ยังไม่ได้สร้าง** หน้าล็อตตอบ 410 ทันทีที่ใบหมดอายุ (อยู่ในงานออกแบบใหม่ที่แบ่งเป็นช่วง) |
| พักใช้ใบ → ล็อตเก่าเสียป้าย (คำสั่งข้อ 25.4) | ด่าน 410 มีอยู่ แต่**ไม่มีใครพักใช้ใบได้** (D4) |

## D. ระบบที่ใช้ร่วมกัน

| เรื่อง | ผล |
|---|---|
| แจ้งเตือน | `services/notification-service.js` เขียนแถวแจ้งเตือนในแอป · ไม่มี nodemailer, twilio หรือ firebase ใน backend ✔ · `POST /api/notifications` ใช้สิทธิ์ `system.admin` จากตาราง RBAC ชุดที่สอง `services/security-compliance.js` · `RBACService` (ซ้ำกับ canonical-rbac — L9) |
| PDPA ความยินยอม | `middleware/consent-manager.js` มีแค่หมวดบังคับ + `MARKETING_EMAIL`/`MARKETING_SMS` · ไม่มีหมวดยินยอมเพื่องานวิจัยหรือแบบสำรวจ (D5) |
| PDPA ลบบัญชี | `routes/api/pdpa/erasure.js` + `services/pdpa-erasure-service.js` · ยืนยันผ่าน token ที่ส่งทางแจ้งเตือนในแอป ✔ · แต่**ไม่แตะแถวแบบสำรวจ** (`respondentUserId` ยังผูกตัวคนอยู่) |
| PDPA ขอสำเนาข้อมูลของฉัน | **ไม่มี** ประตูส่งออกข้อมูลของเจ้าของข้อมูล (มีเฉพาะสำเนาบันทึกผู้ตรวจ `/api/applications/:id/audit-notes`) |
| audit log | hash-chain + ตรวจทุกคืนตอน 03:15 (`jobs/scheduler.js` → `runScheduledChainVerification`) · แต่ผู้ดูแลกรมขยับ baseline ได้ (D1) |
| อัปโหลดไฟล์ | `server.js` · `/uploads` ผ่าน `gateSensitiveUploads`, `gateSlipObjectAccess` · ไม่ได้ตรวจลึก |
| cron | `jobs/scheduler.js` (node-cron ในโปรเซส): ตรวจกำหนดแก้ไขทุกชั่วโมง :15 · ใบหมดอายุ 00:00 · SLA งาน :30 · เตือนต่ออายุ 09:00 · PDPA retention 02:30 · chain verify 03:15 · ยกระดับอนุโลม 09:30 · เตือนชำระ 09:00 · ปิดงวดค้างจ่าย 03:00 · reconcile settlement ทุก 10 นาที · pre-check ค้างทุก 5 นาที · บวก `GET /api/cron/auto-cancel` (ต้องมี secret) ซึ่งเป็นตัวเขียนตัวที่สองของการยกเลิกอัตโนมัติ · ไม่มี lock ข้ามอินสแตนซ์ (L8) |
| PDF | ไม่ได้ตรวจในรอบนี้ |
| มือถือ (Flutter) | D10 |

## E. ระบบตามสัญญา C05F680149 (ต้นแบบ 8 รายการ + ชุดข้อมูล)

**เอกสารที่แจกแจงรายการตามสัญญา**: `docs/contract/acceptance-mapping-c05f680149.md` ถูกลบออกจาก tree ใน `1581ba652` ("ถอดเอกสารสัญญา…ประวัติยังอยู่ใน git") · ดูได้ด้วย `git show 1581ba652^:docs/contract/acceptance-mapping-c05f680149.md` · ตามเอกสารนั้นต้นแบบที่ 1 ต้องติดตั้ง 2 จุด (SSRU + กรมฯ)

| # ตามสัญญา | โมดูลจริง | backend · ตาราง | ใครใช้ได้ | ทำงานจริงไหม | PII / ความยินยอม |
|---|---|---|---|---|---|
| 1 วิเคราะห์มาตรฐาน WHO / อย. / อาเซียน | `/provider/standards/*` | `routes/api/certificates/standards.js` · `services/standards-analyzer-service.js` · ตาราง standards | เจ้าหน้าที่ทุกบทบาท (เมนูไม่ตั้งกฎ) · `/:code/analyze/:applicationId` ใช้ `authenticateAny` + holder scope ของผู้ยื่น | **ใช้ได้บางส่วน** · staging มี 4 มาตรฐานและ 10 ประเทศอาเซียน (GET จริง) · การวิเคราะห์ต้องใช้คำขอจริง ซึ่งไม่ได้ทดสอบ · ยังไม่ได้ติดตั้งที่ SSRU/กรมฯ | ต่ำ |
| 2 แบบสำรวจ 4 ภาค + สัมภาษณ์ผู้เชี่ยวชาญ | `/health/surveys`, `/provider/surveys{,/interviews}` | `routes/api/surveys/surveys.js` · `services/survey-service.js` · `prisma/schema/survey.prisma` (5 ตาราง ผูกองค์กร) | ผู้ตอบ: `authenticateAny` · อ่าน/สถิติ/ส่งออก CSV/บทสัมภาษณ์: **เจ้าหน้าที่ทุกบทบาท** · สร้าง/เปิด/ปิด: `system_admin_dtam` | **ไม่ทราบสถานะจริงบน staging** (ต้องล็อกอิน) · โค้ดครบวงจร | **D5** |
| 3.1 วิเคราะห์ text-mining | `survey-service.js` · `getTemplateStats` | — | เจ้าหน้าที่ทุกบทบาท | ใช้ได้บางส่วน (ใช้กฎแบบเบา) | เหมือนข้อ 2 |
| 3.2 / 3.3 คลังข้อมูล + AI | Postgres/REST · analytics, site-analysis | — | — | 3.2 ใช้ได้ · 3.3 ใช้ได้บางส่วน | — |
| 4 สถาปัตยกรรม | RBAC, เข้ารหัสฟิลด์, hash-chain | — | — | ใช้ได้ (มีกลไกจริง) · เอกสารสถาปัตยกรรมอยู่ที่ `ARCHITECTURE.md` | — |
| 5 ฐานข้อมูลสมุนไพร 6 ชนิด ≥300 รายการ/ชนิด | `/health/herbs`, `/provider/herbs` | `routes/api/herbs/herbs.js` · `prisma/schema/herb.prisma` · seed `prisma/seed-herbs.js` | อ่าน: สาธารณะ · เขียน/นำเข้า: `system_admin_dtam` | **ข้อมูลว่างเปล่า** · staging และ demo `GET /api/herbs/coverage` → `totalHerbs:0, totalEntries:0` · seed ไม่อยู่ในขั้นตอน deploy (**D6**) | ต่ำ |
| ภาคผนวก 4 ข้อ 3 ชุดข้อมูลดิบ → Data Lake | `/provider/datasets` | `routes/api/datasets/datasets.js` · `services/dataset-export-service.js` · `data/datasets/dataset-domains.js` (8 โดเมน) | แคตตาล็อก: เจ้าหน้าที่ทุกบทบาท · ส่งออก: `system_admin_dtam` + บันทึก audit | ใช้ได้ (โค้ด) | **D5**: ส่งออกคำตอบแบบสำรวจ + `farmId`/`cycleId` (ระบุตัวฟาร์มย้อนกลับได้) โดยไม่มีหมวดยินยอมเพื่อการวิจัย |
| 6 ตรวจภาพ 3 โมดูล + 7 โรค (≥85%) | `/provider/image-assessment` | `routes/api/audit/image-assessment.js` · `services/image-assessment/*` | `ROLE_GROUPS.AUDIT_STAFF` | **ใช้ได้บางส่วน** · ตัวจำแนกโรคเป็นกฎแบบ heuristic (`disease-classifier.js` · `heuristic-baseline`) ไม่มีโมเดลที่ฝึกแล้ว · ยังไม่ได้วัด 85% · ไม่เก็บผลลงฐานข้อมูล (L10) | ภาพไม่ถูกเก็บ |
| 7 ติดตามย้อนกลับ + QR | ส่วน C ข้างบน + แอปมือถือ | — | — | ใช้ได้ (เว็บ) · มือถือดู D10 · USSD ตัดออกจากขอบเขตแล้ว | ผ่อนไว้ชั่วคราว (B) |
| 8 องค์ความรู้/คู่มือ | `docs/manual/USER-MANUAL.md` · `/health/sop-templates` · `/health/training` | — | — | ใช้ได้บางส่วน · เอกสารตรวจรับถูกถอดออกจาก tree | — |

เมนูฝั่งผู้ยื่นใน `apps/web-app/src/lib/navigation/nav-config.ts` · `FARMER_NAV` (ต่อจากตาราง E):

| เมนู | backend | ผล |
|---|---|---|
| site-analysis | `routes/api/audit/site-analyses.js` · `controllers/site-analysis-controller.js` · `resolveOwnedAnalysis` | **ใช้ได้บางส่วน** (D7) |
| training | `routes/api/documents/training-records.js` · `controllers/training-record-controller.js` | **ใช้ได้บางส่วน** (D7) |
| sop-templates / sop-builder | `routes/api/documents/templates.js`, `sop-documents.js` → `document-service.js` (ผูกกับ `userId`) | ใช้ได้ (เอกสาร SOP เป็นร่างส่วนตัว ไม่ผูก holder) |
| reports ภ.ท.27/28 | `routes/api/documents/report-submissions.js` | **ใช้ได้บางส่วน** (D12) ผู้ยื่นส่งรายงานได้ แต่ไม่มีหน้าจอเจ้าหน้าที่สำหรับตรวจ |
| documents | `/health/documents` | ไม่ได้ตรวจลึก |
| planting | ส่วน C | ใช้ได้ |

---

## ข้อบกพร่อง เรียงตามความรุนแรง

### สูง

**D1 — ประตูค่าตั้งระบบเปิดทุกคีย์และมีผลทั่วระบบ**
- `routes/api/admin/config.js` · `router.patch('/:key')` ทำ `upsert` คีย์อะไรก็ได้
- `controllers/system-config-controller.js` · `updateConfig` (`PUT /api/system-config/:key`) เป็นประตูที่สอง และ**ไม่เขียน audit log**
- `SystemConfig` ไม่อยู่ใน `TENANT_SCOPED_MODELS` ⇒ ค่าที่ผู้ดูแลกรมขององค์กรหนึ่งแก้ มีผลกับทุกองค์กร
- คีย์ที่อันตราย:
  - `audit_chain_baselines` (`services/audit-trail.js` · `_loadPerTenantBaselines`): ขยับเพดานขององค์กรตัวเองให้สูงกว่าแถวล่าสุด แล้วการตรวจทุกคืนจะไม่ตรวจแถวขององค์กรนั้นเลย ⇒ **คนที่ถูก audit ปิดสัญญาณการปลอมแก้ของตัวเองได้**
  - `ocr_bypass_enabled` (`services/prisma-auth-service.js` · `_resolveVerificationStatus`): ผู้สมัครใหม่ได้สถานะ `ACTIVE` โดยไม่ผ่านการยืนยัน
- ไม่ได้ยิงทดสอบจริง เพราะเป็นการเขียน

**D2 — การแบ่งสิทธิ์ตั้งบทบาท (คำสั่งข้อ 13) ไม่มีบนเซิร์ฟเวอร์**
- `admin/users.js` · `'/:id/role'` และ `admin-user-service.js` · `changeUserRole` ห้ามแค่ `system_admin_platform` อย่างเดียว ⇒ ผู้ดูแลกรมตั้ง/ถอด `finance_officer_platform` ได้ และตั้ง `system` (บทบาทที่ไม่ใช่คน) ได้ด้วย ส่วนหน้าจอซ่อนตัวเลือกนี้ไว้แต่เซิร์ฟเวอร์รับ
- หน้าจอ `apps/web-app/src/lib/constants/admin-role-options.ts` เสนอ `finance_officer_platform` ให้ผู้ดูแลกรมเลือกได้
- ฝั่งกลับกัน: `require-admin.js` · `requireAdmin` ไม่รับ `system_admin_platform` ⇒ ผู้ดูแลบริษัทเปลี่ยนบทบาทหรือปิดบัญชีการเงินบริษัทที่มีอยู่แล้วไม่ได้
- กิ่ง `fix/staff-access-2` ยังไม่มี commit

**D3 — ให้สิทธิ์รายคนโดยไม่มีรายการต้องห้าม**
- `admin/user-permissions.js` · `router.put('/:userId/:permission')` รับทุกค่าใน `PERMISSION_VALUES`
- สิทธิ์เหล่านี้มีผลจริงผ่าน `requireEffectivePermission`/`requireCanonicalPermission` (54 ประตู) เช่น `ACCOUNTING_DASHBOARD_READ`, `APPLICATION_DOC_REVIEW`
- ผลคือ:
  - ให้ `field_inspector` อ่านบัญชีได้ ⇒ ขัดมติ 2026-09-27
  - ให้ `field_inspector` ตรวจเอกสารได้ ⇒ ขัดคำสั่งข้อ 27 (ด่านแยกคนตรวจเอกสารกับคนตรวจพื้นที่ต่อคำขอยังอยู่ แต่บทบาทไม่แยกกันแล้ว)

**D4 — พักใช้/เพิกถอนใบรับรองไม่ใช่งานของผู้อนุมัติ (คำสั่งข้อ 29)**
- ประตูเพิกถอนมีแค่ `admin/certificates.js` · `'/:id/revoke'` (`system_admin_dtam`) กับ `interoperability.js` · `'/v1/certificates/:certificateNumber/revoke'` ซึ่งไม่บังคับเหตุผล (ค่าเริ่มต้น `ADMIN_MANUAL_REVOCATION`)
- `certificate_approver` ไม่มีประตูใดเลย
- **ไม่มีประตูพักใช้** ทั้งที่ verify และหน้าล็อตรองรับสถานะ SUSPENDED แล้ว (`public-verify-reason.js`) ⇒ คำสั่งข้อ 25.4 ใช้ไม่ได้

**D5 — แบบสำรวจและชุดข้อมูลวิจัย: ไม่มีความยินยอม และเจ้าหน้าที่ทุกคนอ่านได้**
- เจ้าหน้าที่ทุกบทบาท รวมทั้งการเงินและผู้ตรวจพื้นที่ อ่านคำตอบทุกชุด, CSV และบทสัมภาษณ์ (มี `intervieweeName` และ `transcript`) ผ่าน `surveys.js` · `GET /templates/:id/export`, `GET /interviews` ⇒ ขัดคำสั่งข้อ 14 และ 17
- `submitResponse` เก็บ `respondentUserId` แต่ไม่มีข้อความแจ้งหรือการขอยินยอมเพื่อใช้ในงานวิจัย
- `pdpa-erasure-service.js` ไม่ลบหรือตัดความเชื่อมโยงของแถวแบบสำรวจ
- `dataset-domains.js` ส่งคำตอบแบบสำรวจกับ `farmId`/`cycleId` ออกไปยัง Data Lake ของ บพข. โดยไม่มีหมวดยินยอม

**D6 — ฐานข้อมูลสมุนไพรว่าง และเอกสารตรวจรับหายจาก tree**
- staging และ demo ตอบ `coverage` เป็น 0 / 0
- `prisma/seed-herbs.js` ไม่ได้ผูกกับขั้นตอน deploy
- เอกสารแม็ปตรวจรับถูกลบใน `1581ba652`

**D7b — ระบบเฝ้าระวังไม่ทำงาน** (ยิงจริงบนโฮสต์นี้ ผ่าน `127.0.0.1:9090`)
- เป้า `gacp-backend` เป็น down: `lookup backend … no such host` เพราะ Prometheus อยู่แค่ใน `gacp-network` และ backend ชื่อ `gacp-backend-staging`
- `/api/v1/rules` = 0 กฎ · `/api/v1/alertmanagers` = ว่าง
- Sentry: มีชื่อตัวแปร `SENTRY_DSN` ในคอนเทนเนอร์ แต่ไม่ได้ตรวจว่ามีค่าหรือไม่ (เป็นความลับ)

### กลาง

**D7 — บันทึกการอบรมและการวิเคราะห์พื้นที่ใช้ "เจ้าของฟาร์ม" ไม่ใช่สมาชิกของ holder**
- ประตูแบบใช้ id (`/:id` GET/PUT/DELETE, `evaluate-soil`, `compliance-score`) ตรวจด้วย `farm.ownerId === req.user.id` (`resolveOwnedAnalysis` และตัวเทียบใน `training-record-controller.js`) ส่วนประตูรายฟาร์มใช้ `holderReadWhere` (`middleware/farm-ownership.js`)
- ผล: คนสร้างฟาร์มที่ออกจาก holder ไปแล้วยังอ่าน แก้ และลบได้ ส่วนสมาชิกคนอื่นเปิดรายการด้วย id ไม่ได้ ⇒ ขัดข้อ 5 ของ brief
- นอกจากนี้ `GET /api/site-analyses` (`providerOnly`) ส่ง 100 รายการล่าสุดให้เจ้าหน้าที่ทุกบทบาท

**D8 — นโยบายความเป็นส่วนตัวล้าสมัย** (`apps/web-app/src/app/privacy/page.tsx`)
- `PRIVACY_UPDATED_AT = '26 กุมภาพันธ์ 2026'`
- ไม่ระบุว่าใครเป็นผู้ควบคุมข้อมูล ไม่บอกว่าหน้าสแกน QR เปิดชื่อและที่อยู่ฟาร์ม ไม่บอกการใช้แบบสำรวจ/Data Lake ไม่บอกผู้ประมวลผลข้อมูล และไม่บอกระยะเวลาเก็บ
- หัวหน้าเป็นภาษาอังกฤษ "GACP Registration Portal" และลิงก์ "กลับหน้าสมัครสมาชิก"

**D9 — ประตูขยายกำหนดแก้ไข** `provider/handlers/admin.js` · `adminDeadlineExtension`
- ข้ามแค่เสาร์-อาทิตย์ ไม่ข้ามวันหยุดราชการ (คำสั่งข้อ 28)
- ใส่จำนวนวันได้ไม่จำกัด
- ถ้าไม่มีแถว `revisionDeadline` จะเขียนแค่ประวัติ แต่ตอบเหมือนขยายสำเร็จ
- ไม่มีเงื่อนไของค์กรในการค้นด้วย id

**D10 — แอปมือถือ**
- `apps/mobile-app/lib/core/config/api_config.dart`: build แบบ release ชี้ไป `https://gacpth.com/api/v1` ซึ่งเป็นโดเมนที่มีม่านบัง (ตอบเป็น HTML) ⇒ APK release ใช้งานไม่ได้
- ยังมีขั้นสมัครด้วยรหัสผ่าน (`/register/password`)
- `staff_dashboard_screen.dart` และ `weather_widget.dart` เป็นข้อมูลปลอม แต่ไม่มีใครเรียกใช้ (โค้ดตาย)
- คำสั่งข้อ 29 ให้ใช้เว็บบนมือถือก่อน pilot

**D11 — รายการตั้งค่าสาธารณะขัดมติ** (`routes/api/system/config.js`)
- `/api/config/area-types` คืน 4 ค่า (มี `CONTROLLED`) ขัดมติ "สามคำปิด"
- `/api/config/plants` คืน 8 ค่าที่เขียนตายในโค้ด (HEMP, ANDROGRAPHIS, ALOE_VERA, INDIAN_GOOSEBERRY) ขัดมติหกสมุนไพร
- หน้าเว็บไม่ได้เรียกใช้ ⇒ ควรลบตามหลัก "แบบที่ถูกแทนที่ต้องไม่เหลือร่องรอย"

**D12 — รายงาน ภ.ท.27/28 ไม่มีคนตรวจ**
- ไม่มีหน้าจอเจ้าหน้าที่
- `report-submissions.js` · `PUT /:id/review` → `document-service.js` · `reviewReportSubmission` แก้ด้วย id โดยไม่ตรวจสถานะก่อนหน้าและไม่มีเงื่อนไของค์กร

**D13 — ประตู e2e บน staging**
- `NODE_ENV=staging` ทำให้ mount `/api/e2e` (`reset`, `approve-documents`, `pass-audit`)
- กันไว้ด้วย `E2E_SECRET` ซึ่ง**มีชื่อตัวแปรนี้อยู่ในคอนเทนเนอร์ staging** ⇒ คนที่ถือ secret ปลอมผลตรวจเอกสาร/ผลตรวจแปลงบน staging ได้ (ไม่ได้ยิงทดสอบ — ตัวจำแนกของ harness ปฏิเสธคำสั่ง POST ของผม ซึ่งถูกแล้วเพราะเป็นการเขียน)

**D14 — ชื่อบทบาทบนจอขัดมติ**
- `apps/web-app/src/lib/role-utils.ts`, `admin-role-options.ts` และ `services/security-compliance.js` ยังใช้ "ผู้จัดสรรงานและคิวตรวจ" และ "ผู้ตรวจประเมินแปลง"
- คำสั่งข้อ 27/29 กำหนดว่า "ผู้จัดคิว" และ "ผู้ตรวจพื้นที่"
- `role-utils.ts` ยังมี emoji เป็นไอคอน (ขัดมติห้าม emoji)

**D15 — backup อยู่บนโฮสต์เดียว**
- `supabase-backup.sh` 03:47 (staging + demo, ล่าสุด 2026-10-07 OK) และ `gacp-backup.sh` 03:17 (volumes) เก็บที่ `/var/backups/gacp` บนเครื่องเดียวกันเท่านั้น ไม่มีสำเนานอกเครื่อง
- volumes ของ demo (uploads, signing keys บน 119.59.105.140) ตรวจจากที่นี่ไม่ได้

**D16 — ผู้ดูแลที่ไม่มีองค์กรจะอ่านได้ไม่จำกัด (fail-open)**
- `provider-user-service.js` · `getActiveAdminUserGuard` ไม่ใส่เงื่อนไขเมื่อ `organizationId` ว่าง
- `tenant-context-middleware.js` ไม่ผูก scope เมื่อหาองค์กรไม่ได้ ⇒ ขัดคำสั่งข้อ 17 "ไม่รู้องค์กร = ปฏิเสธ"

### ต่ำ

- **L1** สิทธิ์ `UNIT_MANAGE` และป้ายของมันยังค้างอยู่ (ส่วน C)
- **L2** `admin-application-service.js` คอมเมนต์ยังใช้คำว่า `ACCOUNT_DTAM` · ประตู `revert-last-transition` ควรอยู่ในขอบเขตงานคำสั่งข้อ 31
- **L3** `apps/web-app/e2e/e2e-golden-scenario.spec.ts` ยังยิงสถานะ `APPROVED_DOCUMENT` ซึ่งไม่มีอยู่จริง · `e2e-provider-account.spec.ts` ยังพูดถึง "slip review"
- **L4** `robots.txt` ของ staging/demo เขียน `Allow: /`
- **L5** หน้า `/verify` ไม่มีตรากรมและใช้ศัพท์เทคนิค · ช่อง `issuingAuthority` เขียนตายว่า `'ระบบรับรองมาตรฐาน GACP สมุนไพร'`
- **L6** `fraud-detection.js` · `POST /documents/:id/verify` เปิดให้ `FULL_STAFF` ⇒ การเงินเขียนผลตรวจความถูกต้องของเอกสารได้
- **L7** `admin/users.js` · `maskHealthIdForAdmin` แสดงหลักแรก + หลักสุดท้าย 1 หลัก แต่คำสั่งข้อ 10 กำหนดหลักแรก + 4 หลักท้าย (ปิดมากกว่าที่กำหนด แต่ไม่ตรงกับ `maskThaiId`)
- **L8** cron ไม่มี lock ข้ามอินสแตนซ์ · มีตัวเขียนการยกเลิกอัตโนมัติสองตัว
- **L9** ตาราง RBAC มีสองชุด (`canonical-rbac.js` และ `security-compliance.js` · `RBACService`)
- **L10** ตรวจภาพเป็นแบบ heuristic และไม่เก็บผล

---

## คำถามนโยบาย (พร้อมคำตอบที่แนะนำ)

| # | คำถาม | คำตอบที่แนะนำ |
|---|---|---|
| Q1 | ค่าตั้งระบบ: ใครแก้คีย์ไหนได้ | ใช้รายการคีย์ที่อนุญาต (เฉพาะ `feature.*`) · `audit_chain_baselines` และ `ocr_bypass_enabled` ห้ามแก้ผ่านหน้าจอ ให้แก้ด้วย migration หรือขั้นตอน ops เท่านั้น · ลบประตูที่สอง `/api/system-config/:key` |
| Q2 | ใครเปลี่ยนบทบาทของบัญชีฝั่งบริษัทที่มีอยู่แล้ว | ผู้ดูแลบริษัทเท่านั้น (เปิดประตูเปลี่ยน/ปิด/เปิดบัญชีให้ในขอบเขตบทบาทฝั่งบริษัท) · ผู้ดูแลกรมแตะบัญชีฝั่งบริษัทไม่ได้เลย · ห้ามตั้ง `system` ผ่านประตูของคน |
| Q3 | การให้สิทธิ์รายคน | ห้ามให้สิทธิ์การเงินกับบทบาทที่ไม่ใช่การเงิน · ห้ามให้ `APPLICATION_DOC_REVIEW` กับ `field_inspector` · หรือปิดการให้สิทธิ์ทั้งระบบจนหลัง pilot |
| Q4 | พักใช้/เพิกถอนใบรับรอง | ให้เป็นประตูของ `certificate_approver` พร้อมเหตุผลจากรายการตายตัว · ถอดประตูของผู้ดูแลกรม · ประตู interoperability ต้องบังคับใส่เหตุผล |
| Q5 | ใครเห็นคำตอบแบบสำรวจ/บทสัมภาษณ์ | ข้อมูลดิบ: `system_admin_dtam` เท่านั้น · บทบาทอื่นเห็นแค่สถิติรวม · เพิ่มข้อความแจ้งและการยินยอมเพื่อการวิจัยก่อนตอบ · ตอนส่งออกไป Data Lake ให้ตัด `respondentUserId` และแปลง `farmId` เป็นรหัสแฝง |
| Q6 | ข้อมูลฐานสมุนไพร | deploy ครั้งหน้าให้ seed 6 ชนิด · เนื้อหา ≥300 รายการ/ชนิดเป็นงานของทีมวิจัย ผ่านช่องนำเข้า |
| Q7 | เอกสารตรวจรับตามสัญญาที่ถูกถอดออก (operator 2026-10-07: วันตรวจรับเลื่อนได้ ไม่ติดตามในระบบ) | เก็บไว้ใน repo ส่งมอบ PREDICTIVE และทำแผนที่ใหม่ให้ตรงระบบปัจจุบัน |
| Q8 | ควรมีประตูขยายกำหนดแก้ไขหรือไม่ | ถอดออก (คำสั่งข้อ 28 กำหนด 5 วันทำการ/รอบ และแก้ได้ไม่จำกัดรอบ) · ถ้าจะเก็บไว้ ให้ใช้เฉพาะกรณีระบบผิดพลาด และนับวันหยุดราชการด้วย |
| Q9 | แอปมือถือ | แช่แข็งจนหลัง pilot ตามคำสั่งข้อ 29 · แก้ URL ของ release ไม่ให้ชี้ไปโดเมนที่มีม่าน · ลบหน้าจอที่เป็นข้อมูลปลอม |
| Q10 | spec T&T §3 "เลขบัตรเต็ม" ขัดคำสั่งข้อ 10 | ทำตามคำสั่งข้อ 10 (ปิดบางส่วน) แล้วแก้ spec · และกำหนดวันคืนค่าการผ่อนที่อยู่/COA บนหน้าสาธารณะก่อน pilot เกษตรกรจริง |
| Q11 | `E2E_SECRET` บน staging | ถอดออกจาก env ของ staging · ใส่กลับเฉพาะช่วงที่รัน e2e |
| Q12 | แจ้งเตือนจากระบบเฝ้าระวังส่งไปที่ไหน และ backup นอกเครื่อง | แก้เป้า Prometheus (ต่อเข้า `gacp-staging-network` หรือแก้ชื่อเป้า) · เพิ่มกฎ backend-down และ 5xx · คัดลอก backup ข้ามไปเก็บอีกโฮสต์หนึ่งทุกวัน |

---

## ตารางทุกงาน M01–M23

ความหมายของสถานะ: works = ใช้ได้ · partial = ใช้ได้บางส่วน · missing = ไม่มี · broken = พัง · mock = ข้อมูลปลอม · not checked = ไม่ได้ตรวจ
(ใน M13 ผู้ตรวจ "me" = agent นี้)

| งาน | ผู้ตรวจ | สถานะ |
|---|---|---|
| M01-T01 wizard | applicant agent | not checked (ในรายงานนี้) |
| M01-T02 autosave | applicant agent | not checked |
| M01-T03 v2 กทล.1 | applicant agent | not checked |
| M01-T04 หน้าสถานะ | applicant agent | not checked |
| M02-T01 อัปโหลดรายช่อง | applicant agent | not checked |
| M02-T02 ตรวจชนิดไฟล์ / signed URL | applicant agent | not checked |
| M03-T01 ตรวจรายฉบับ | 2026-10-06 audit | ดูรายงาน reviewer-inspector |
| M03-T02 รอบแก้ไข | 2026-10-06 audit | ดูรายงานนั้น |
| M03-T03 รายการ + แดชบอร์ด | 2026-10-06 audit | ดูรายงานนั้น |
| M04 state machine | — | not checked |
| M05-T01..T08 | — | not checked (audit การเงิน 2026-10-06 ครอบเฉพาะมุมมองของบทบาท) |
| M05-T09 หน้าชำระของผู้ยื่น | applicant agent | not checked |
| M06-T01 / T02 | — | not checked |
| M06-T03 หน้าบัญชีเดียวกันทั้งสองฝั่ง | 2026-10-06 audit | ดูรายงาน approver-finance |
| M07-T01 PDF | — | not checked |
| M07-T02 PKI | me (บางส่วน) | partial — ช่อง signature มีในคำตอบ verify แต่ไม่มีใบจริงบน staging ให้ทดสอบ |
| M07-T03 verify สาธารณะ | me | works (ใบที่ไม่พบ) / not checked (ใบจริง) · L5 |
| M07-T04 พักใช้/เพิกถอน | me | **broken** (D4: ไม่มีพักใช้ ไม่มีประตูของผู้อนุมัติ) |
| M07-T05 ด่านหลักฐานหน้างาน | 2026-10-06 audit | ดูรายงาน approver |
| M08-T01..T04 | 2026-10-06 audit | ดูรายงาน reviewer-inspector / dispatcher |
| M09-T01 ฟาร์ม + แปลง | me | not checked (ลึก) |
| M09-T02 รอบปลูก/บันทึก/เก็บเกี่ยว | me | works (ด่านใบรับรอง) · L1 |
| M09-T03 ล็อต + QR + หน้าสแกน | me | works · ผ่อนไว้ชั่วคราว (Q10) · ป้าย 12 เดือน missing |
| M09-T04 Lab/COA + เรียกคืน | me | works (โค้ด) |
| M09-T05 หน้าติดตามของเจ้าหน้าที่ | me | works · spec ขัดคำสั่งข้อ 10 (Q10) |
| M10 แอปมือถือ | me | **broken** (release URL) + mock ที่เป็นโค้ดตาย (D10) |
| M11-T01 pre-check 7 ช่อง | me | works (โค้ดเป็นแบบเตือนอย่างเดียว) |
| M11-T02 OCR บัตร / จัดประเภทเอกสาร | me | not checked |
| M12-T01 ตรวจภาพ 3 โมดูล | me | partial (heuristic, L10) |
| M12-T02 ภาพซ้ำ/ทุจริต | me | partial (L6) |
| M13-T01 วิเคราะห์มาตรฐาน | me | partial (มีข้อมูลบน staging · ยังไม่ติดตั้ง 2 จุด) |
| M13-T02 แบบสำรวจ + สัมภาษณ์ + text-mining | me | partial (D5 · สถานะบน staging ไม่ทราบ) |
| M13-T03 ฐานสมุนไพร | me | **broken / empty** (D6) |
| M13-T04 ส่งออกชุดข้อมูล + พจนานุกรมข้อมูล | me | partial (D5 ความยินยอม) |
| M13-T05 เอกสารตรวจรับ | me | **missing จาก tree** (มีใน git `1581ba652^`) |
| M14-T01 บันทึกการอบรม | me | partial (D7) |
| M14-T02 SOP builder/แม่แบบ | me | works |
| M14-T03 วิเคราะห์พื้นที่ | me | partial (D7) |
| M15-T01 multi-tenancy | me | partial (backstop ใช้ได้ · D16 fail-open · D1 config ทั่วระบบ) |
| M15-T02 holder + สมาชิก | me | partial (D7 ใช้ owner ไม่ใช่ holder) |
| M15-T03 RLS shadow | — | not checked |
| M15-T04 ถอดตัวสลับพื้นที่ทำงาน | me | works (เหลือแค่คอมเมนต์ + การลบ localStorage) |
| M16-T01 canonical-rbac | me | partial (D2, D3, L9) |
| M16-T02 10 บทบาท + ผู้อนุมัติ | me | partial (D14 ป้ายชื่อ) |
| M17-T01 ID/รหัสผ่าน | — | not checked |
| M17-T02 ThaiD | — | not checked |
| M17-T03 หมอพร้อม | — | not checked |
| M17-T04 2FA ของเจ้าหน้าที่ | — | not checked (มี `routes/api/identity/mfa.js`) |
| M17-T05 OCR ยืนยันตัวตน | — | not checked |
| M18-T01 ความยินยอม + นโยบาย | me | partial (D5, D8) |
| M18-T02 ลบบัญชี / ส่งออกข้อมูลของฉัน | me | ลบบัญชี works · ส่งออก **missing** |
| M18-T03 เข้ารหัสฟิลด์ + HMAC | — | not checked |
| M19 แจ้งเตือนในแอป | me | works (ในแอปอย่างเดียว) |
| M20-T01 compose/nginx | me | works (คอนเทนเนอร์ healthy · staging ตามหลัง main) |
| M20-T02 เฝ้าระวัง | me | **broken** (D7b) |
| M20-T03 backup อัตโนมัติ | me | works (ทุกวัน) · partial (ไม่มีนอกเครื่อง D15) |
| M21-T01 UAT/E2E | me | partial (มี 29 spec · ไม่ได้รันใน session นี้ · L3) |
| M21-T02 gate/probe | — | not checked |
| M21-T03 security hardening | — | not checked |
| M22 ต่ออายุ | applicant agent | not checked |
| M23-T01 กฎเป็นข้อมูล | me | works (ประตู `admin/requirement-rules.js`) |
| M23-T02 ตัววาด กทล.1 | — | not checked |
| M23-T03 หกสมุนไพร | me | partial (D11 รายการสาธารณะ 8 ค่า) |
| หน้าผู้ดูแลระบบ (นอกรายการ) | me | partial (D1, D2, D3, D9, D16) |

## ไฟล์หลักฐาน
- ภาพหน้าจอ: `reports/role-workflow-auditor/2026-10-07-modules/{landing,pricing,verify,verify-unknown,privacy,trace-unknown-lot}.png`
- การยิงจริง (GET): `staging.gacpth.com/api/health` (`b74a31ff`) · `/api/herbs/coverage` (0/0 ทั้ง staging และ demo) · `/api/standards` (4) · `/api/standards/asean/comparison` (10) · `/api/config/plants` (8) · `/api/config/area-types` (4) · `/api/public/verify/x` (NOT_FOUND) · gacpth.com (ม่าน + noindex)
- โฮสต์ staging: Prometheus `127.0.0.1:9090` (targets/rules/alertmanagers) · `/var/log/gacp/backup-*.log` · root crontab
- เอกสารสัญญา: `git show 1581ba652^:docs/contract/acceptance-mapping-c05f680149.md`
