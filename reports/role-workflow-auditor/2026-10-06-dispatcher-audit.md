# role-workflow-auditor · `dispatcher` (ผู้จัดคิว) · 2026-10-06

- ต้นไม้ที่ตรวจ: main `6d5e2711` · และกิ่งที่ยังไม่ merge `fix/rule-change-return-to-applicant` `ad2fdab24` (เฉพาะประตูมอบหมายงาน)
- staging: `GET /api/health` → `revision` = `6d5e27117f7b…` (ตรงกับ main ที่ตรวจ) · login ด้วยบัญชี dispatcher ของ staging (ไฟล์ 0600 ไม่พิมพ์ค่า) ผ่านในครั้งแรก ไม่มีการใส่รหัสผิด
- สิ่งที่รันจริงใน session นี้: GET 22 ประตู (เก็บใน `2026-10-06-dispatcher/net/*.json` ตัดอีเมลและเลข 13 หลักออกแล้ว) · เดินหน้าจอ 13 หน้าด้วย headless browser ผ่าน `heavy.sh` (ภาพ `2026-10-06-dispatcher/*.png`, ข้อความหน้าจอ `net/screen-*.txt`, รายการ API ที่หน้าเรียก `net/screen-api-calls.json`)
- **ไม่ได้กดอะไรที่เขียนข้อมูลบน staging**: จ่ายงาน นัดตรวจ เลื่อนนัด สลับผู้ตรวจ ส่งแจ้งเตือน ปิดงาน ทั้งหมด "ไม่ได้ลองบนระบบจริง" ข้อสรุปเรื่องเหล่านี้มาจากโค้ด ภาพ 03 แค่เปิดหน้าต่างจ่ายงานแล้วกด Esc
- เลขบรรทัดทุกจุดอ้างที่ main `6d5e2711` (จะขยับเมื่อมี commit ใหม่ ให้ยึดชื่อ symbol เป็นหลัก)
- สถานะ: `DONE(probe:staging-dispatcher-get-walk-2026-10-06)` สำหรับส่วนอ่านและส่วนหน้าจอ · ส่วนที่กดเขียนข้อมูลยังเป็น `PENDING` (ต้องเดินบน scratch DB หรือได้รับอนุญาตให้เขียนบน staging)

## คำตอบสั้น

**ยังไม่สมบูรณ์** งานหลักสองอย่างใช้ได้จริง คือจ่ายงานตรวจเอกสาร (ทำได้จริงบน staging รอบ 4 เมื่อเช้า, คำขอ aa75ba6e) และนัดตรวจแปลงจากหน้าปฏิทิน (ดูจากโค้ด) แต่เครื่องมือรอบข้างมีจุดที่ใช้ไม่ได้หรือให้ข้อมูลผิดหลายจุด ได้แก่

1. หน้า "สลับผู้ตรวจประเมิน" รายชื่อผู้ตรวจแปลงว่างเสมอ จึงสลับไม่ได้ (ยืนยันบน staging)
2. ตัวเลข SLA และงานค้างของผู้จัดคิวโตขึ้นเรื่อย ๆ เพราะไม่มีประตูไหนปิดงานจัดคิว (ยืนยันบน staging)
3. ผู้จัดคิวไม่ได้รับแจ้งเตือนเลย เมื่อมีคำขอชำระงวด 1 หรืองวด 2 เพราะฟังก์ชันแจ้งเตือนไม่มีใครเรียก (ยืนยันบน staging: กล่องแจ้งเตือนว่าง ทั้งที่มีคำขอชำระแล้ว 3 รายการ)
4. คิว "ต้องนัดใหม่" ปุ่มส่งไปประตูที่ปฏิเสธสถานะนั้นเสมอ
5. มีสองคิวที่นับไม่ตรงกัน และบน main ยังมีประตูนัดตรวจหนึ่งประตูที่ไม่ตรวจว่าชำระงวด 2 แล้ว
6. การอ่านของผู้จัดคิวหลายประตูยังไม่จำกัดองค์กร (ขัดคำสั่งข้อ 17) และมีเลขประจำตัวประชาชนของเจ้าหน้าที่ออกจากเซิร์ฟเวอร์แบบไม่ปิดบัง (ขัดคำสั่งข้อ 10)
7. ผู้จัดคิวเปิดดูรายละเอียดคำขอ (ที่อยู่แปลง พิกัด) จากหน้าจอไม่ได้ ต้องพิมพ์สถานที่นัดเอง

## ตารางงานของผู้จัดคิว (ตามแบบที่อนุมัติ)

| # | ขั้น | ผล | หลักฐาน |
|---|---|---|---|
| 1 | เห็นคำขอที่ชำระงวด 1 แล้วในคิว | **ใช้ได้** | `scheduler-dashboard-handler.js` · `schedulerDashboard` คิว `readyForReview` (สถานะ DOC_FEE_PAID) · staging แสดง 2 รายการ (`net/01-dashboard.json`, ภาพ 02) |
| 2 | ได้แจ้งเตือนเมื่อมีงานเข้า | **ขาด** | `services/notification/domain-helpers.js:117` `notifySchedulerNewSubmission` และ `:140` `notifySchedulerReadyForAudit` ไม่มีผู้เรียกในโค้ดเลย · staging: `GET /api/notifications` → `[]` (`net/17-notifications.json`, ภาพ 10) |
| 3 | มอบหมายผู้ตรวจเอกสาร | **ใช้ได้ แต่มีช่องโหว่** | `scheduler-assign-reviewer-handler.js` · `schedulerAssignReviewer` ผ่านจริงบน staging รอบ 4 · ช่องโหว่: ผู้ตรวจปลายทางไม่ถูกจำกัดองค์กร (`:112` `findActiveProviderReviewerById`) และด่านองค์กรปล่อยผ่านเมื่อไม่รู้องค์กร (`:96`) · กิ่ง rule-change แก้ทั้งสองข้อแล้ว (`assertAssignableStaff`, `organizationScope`) |
| 4 | ดูรายละเอียดคำขอก่อนมอบงานหรือนัด | **ขาด** | หน้าเว็บกัน dispatcher ออกจาก `/provider/applications` (`lib/provider-role-config.ts:77`) ปุ่ม "รายละเอียด" จึงถูกซ่อน · เปิด URL ตรงก็เด้งกลับ (ภาพ 11) · ทั้งที่ API `GET /api/provider/applications/:id` ตอบให้ dispatcher ครบ (`net/18-app-detail-aa75.json`) |
| 5 | เห็นคำขอที่ตรวจเอกสารผ่านและชำระงวด 2 แล้ว | **บางส่วน · สองคิวไม่ตรงกัน** | หน้าศูนย์จัดคิวและปฏิทินใช้ `schedulerDashboard` ซึ่งกรอง `phase2Paid` → staging แสดง 0 · หน้า `/provider/scheduler/queue` ใช้ `GET /api/audit/scheduling/queue` (`audit-scheduling-service.js:327` `getSchedulingQueue`) ไม่กรองการชำระ → แสดง APP-68-003 พร้อมปุ่ม "จัดตาราง" (ภาพ 05) ผู้ใช้เห็นตัวเลขสองชุด |
| 6 | นัดตรวจแปลง (เลือกผู้ตรวจ วัน เวลา รูปแบบ) | **ใช้ได้ (หน้าปฏิทิน) · ไม่ได้ลองบน staging** | `scheduler-audit-schedules-post-handler.js` · `schedulerAuditSchedulesPost`: ตรวจวันทำการ, งวด 2 (`isPhase2PaymentConfirmed`), ชนตาราง, ผู้ตรวจแปลง ≠ ผู้ตรวจเอกสาร (`assertInspectorIsNotReviewer`) แล้วเขียนผ่าน `writeApplicationStatus` · ช่องโหว่: ค้นคำขอไม่จำกัดองค์กร (`:114`) และผู้ตรวจถูกจำกัดด้วยองค์กรของผู้กด ไม่ใช่ของคำขอ (`:168`) · กิ่ง rule-change **ไม่ได้แตะ** ประตูนี้ |
| 6b | นัดตรวจจากหน้า "คิวจัดตาราง" | **ผิดบน main** | `audit-scheduling-service.js:443` `assignAuditor` ไม่เช็คการชำระงวด 2 เลย (เช็คแค่สถานะ AUDIT_FEE_PAID) ⇒ บน staging ตอนนี้ APP-68-003 ซึ่งไม่มีหลักฐานชำระงวด 2 กด "จัดตาราง" ได้ (ไม่ได้กดจริง) · กิ่ง rule-change ปิดที่ตัวเขียนสถานะ (`MILESTONES_PAID_BEFORE_STATE.AUDIT_CONFIRMED = ['M1','M2']`) |
| 7 | ผู้ตรวจแปลง ≠ ผู้ตรวจเอกสาร | **ใช้ได้ฝั่งเซิร์ฟเวอร์ · หน้าจอไม่ช่วย** | ทุกประตูเรียก `shared/reviewer-inspector-separation.js` · แต่ dropdown ผู้ตรวจแปลงไม่ตัดผู้ตรวจเอกสารของคำขอนั้นออก ผู้ใช้จะรู้ก็ต่อเมื่อกดบันทึกแล้วโดนปฏิเสธ |
| 8 | เลื่อนนัด (คำขอที่นัดแล้ว) | **ใช้ได้ (โค้ด)** | POST เดียวกันรับ AUDIT_CONFIRMED ได้ (`:140`) |
| 9 | นัดใหม่หลังพบข้อบกพร่องร้ายแรง (คิว "ต้องนัดใหม่") | **เสีย** | คิวนี้คือคำขอที่อยู่ใน CAR_PENDING/CAR_REVIEWING (`queue-utils.js:96` `CAR_LOOP_STATES`) แต่ POST รับแค่ AUDIT_FEE_PAID/AUDIT_CONFIRMED (`:140`) ⇒ ปุ่ม "เลื่อนนัด" ในแท็บนี้ได้ 400 ทุกครั้ง และ `ROLE_TRANSITIONS[DISPATCHER]` ไม่มีขาออกจาก CAR เลย |
| 10 | สลับผู้ตรวจเอกสาร | **บางส่วน** | `scheduler-reviewer-reassign-handler.js` · `schedulerReviewerReassign` เขียนคอลัมน์ `reviewerId` แต่ไม่แก้ `formData.PROVIDERAssignment` (`:201-204`) ⇒ ผู้ตรวจคนเดิมยังเห็นคำขอในคิว (`reviewer-queue-where.js` · `reviewerQueueWhere` และ `application-visibility.js` อ่าน OR กับ `PROVIDERAssignment.reviewerId`) และหน้าผู้จัดคิวยังแสดงชื่อคนเดิม (`queue-utils.js:177` อ่าน `PROVIDERAssignment.reviewerName`) · งานตรวจเอกสารใน work-activity ยังผูกคนเดิม |
| 11 | สลับผู้ตรวจแปลง | **เสีย** | หน้า `/provider/scheduler/reassign` ขอรายชื่อด้วย `'/provider/directory?role=AUDITOR'` (`scheduler/reassign/page.tsx:77`) คำ `AUDITOR` ถูกปลดแล้ว `normalizeRole('AUDITOR')` คืน `null` ตัวกรองจึงไม่ตรงใครเลย · staging: `net/08-directory-AUDITOR.json` → `data: []` ส่วน `role=field_inspector` ได้ 2 คน (`net/09`) |
| 12 | ภาระงานของทีม | **ผิด** | `scheduler.js:132` `/auditor-workload` นับงานด้วย `auditorId` อย่างเดียว (`countAuditorActiveAuditAssignments`) ผู้ตรวจเอกสารจึงเป็น 0 เสมอ · staging: "ทดสอบ ผู้ตรวจเอกสาร" ถืองานอยู่ 1 แต่แสดง 0/5 ว่าง (ภาพ 02) · หน้า `/provider/scheduler/workload` (ledger) นับถูก (2 ครั้ง) ตัวเลขสองหน้าจึงขัดกัน |
| 13 | งานเลยกำหนด / SLA | **ผิด** | งาน SCHEDULING (กลุ่ม dispatcher, SLA 24 ชม.) ถูกสร้างตอนเข้า DOC_FEE_PAID/AUDIT_FEE_PAID แต่การจ่ายงานหรือนัดตรวจไม่ปิดมัน (`application-status-writer.js:1445` ปิดเฉพาะตอนสถานะจบ, `cancelOpenForStage` ไม่มีผู้เรียก) · บน main การจ่ายงานเขียนผ่าน `writeAssignmentColumns` ไม่ผ่านตัวเขียนสถานะด้วย · staging: งาน SCHEDULING ของ aa75ba6e (จ่ายแล้ว) ยัง TODO เลย SLA 145 ชม. และคำขอ APPROVED มีงานจัดคิวเปิดค้าง 2 งาน (`net/14-work-my.json`, ภาพ 09) |
| 14 | เฝ้าระวังเร่งด่วน (ค้างเกินเวลา) | **บางส่วน** | `/urgent-monitor` ใช้ได้ แต่ไม่จำกัดองค์กร และนับ `updatedAt` ไม่ใช่เวลาเข้าสถานะ |
| 15 | แจ้งเตือนผู้ยื่นด้วยมือ | **บางส่วน** | ปุ่ม "แจ้งเตือน" ขึ้นทุกแถวทุกแท็บ แต่เซิร์ฟเวอร์รับเฉพาะ 5 สถานะ (`scheduler.js:193`) แท็บ "รอจัดสรร" และ "นัดแล้ว" จะได้ 400 ข้อความอังกฤษ · ในแท็บ "รอจ่ายงาน" ข้อความที่ส่งคือ "เอกสารของท่านอยู่ระหว่างรอการตรวจสอบ" ติดป้าย WARNING และมีอีโมจิ 📢 ในหัวเรื่อง (`:241`) ผู้ยื่นไม่มีอะไรต้องทำ · ส่งถึงผู้ยื่น ไม่ใช่ผู้ถือ (ขัดข้อเสนอ §2.5) |

## ข้อบกพร่อง เรียงตามความรุนแรง

### สูง

**D1. ประตูนัดตรวจจากหน้า "คิวจัดตาราง" ไม่เช็คการชำระงวด 2 (main)**
- `services/audit-scheduling-service.js:443` `assignAuditor` (เรียกจาก `routes/api/audit/scheduling.js` `POST /assign`, หน้า `/provider/scheduler/queue`) ตรวจแค่ว่าสถานะเป็น AUDIT_FEE_PAID
- ผลจริงบน staging: APP-68-003 อยู่ใน AUDIT_FEE_PAID แต่ไม่มีหลักฐานชำระงวด 2 (`schedulerDashboard` จึงไม่นับ) หน้า "คิวจัดตาราง" แสดงพร้อมปุ่ม "จัดตาราง" (ภาพ 05) ถ้ากดจะนัดผู้ตรวจลงแปลงที่ยังไม่จ่ายเงิน ขัดมติ 2026-09-27 "ใบงานถึงผู้ตรวจหลังจ่ายแล้วเท่านั้น"
- กิ่ง `fix/rule-change-return-to-applicant` ปิดเรื่องนี้ที่ตัวเขียนสถานะแล้ว ⇒ merge กิ่งนั้นแล้วเรื่องนี้ปิด (ควรเติมเทสต์ที่ประตู `/audit/scheduling/assign` โดยตรง)

**D2. เลขประจำตัวประชาชนของเจ้าหน้าที่ออกจากเซิร์ฟเวอร์แบบไม่ปิดบัง (ขัดคำสั่งข้อ 10)**
- `GET /api/provider/scheduler/reviewers` (`scheduler-assign-reviewer-handler.js` · `schedulerReviewers`) และ `GET /api/provider/scheduler/auditors` (`scheduler-auditors-handler.js` · `schedulerAuditors`) ส่ง `providerId` เต็ม 13 หลัก · staging ยืนยัน (`net/04`, `net/05` ช่องนี้ถูกตัดเป็น `<13d>` ตอนเก็บ) ขณะที่ `/api/provider/directory` ส่งแบบปิดบัง `9-XXXX-XXXX-X-0033`
- หน้าปฏิทินพิมพ์เลขนี้ลงใน dropdown ผู้ตรวจ: `calendar/client-view.tsx` · `auditorOptions` (`label: fullName (providerId)`)
- ตัวจ่ายงานเขียนเลขดิบลง `formData.PROVIDERAssignment.reviewerProviderId` (`scheduler-assign-reviewer-handler.js` ขั้น 5) ซึ่งกลับออกไปทาง `GET /api/provider/applications/:id` (`net/18` พบที่ path นี้)

**D3. การอ่านของผู้จัดคิวไม่จำกัดองค์กร (ขัดคำสั่งข้อ 17)**
- `schedulerDashboard` (`scheduler-dashboard-handler.js:30`, comment ใน `application-visibility.js` ยอมรับว่าประตูนี้ "queries directly")
- `/urgent-monitor`, `/auditor-workload`, `/applications/:id/send-reminder` ใน `routes/api/provider/scheduler.js` (query ใน `listStuckApplications`, `listActiveAuditors`, `findReminderTargetApplication` ไม่มี `organizationId`) ⇒ ส่งแจ้งเตือนถึงผู้ยื่นขององค์กรอื่นได้ด้วย id
- `schedulerAuditSchedulesGet` (`scheduler-audit-schedules-get-handler.js`) และรายชื่อ `listReviewerCandidates`, `listAuditorsForScheduler`
- `schedulerReassignableReviewers` (`listReassignableReviewers`) และ `GET /api/audits/reassign/reassignable` (`audits-reassign.js:51`, `listReassignableAudits`)
- ประตูเขียน `schedulerAuditSchedulesPost` (`:114` ค้นคำขอทุกองค์กร) และ `schedulerReviewerReassign` / `audits-reassign POST` (ใช้ `orgId ? … : { id }` คือไม่รู้องค์กรก็ผ่าน) · คำสั่งข้อ 17 บอก "ไม่รู้องค์กร = ปฏิเสธ"
- staging มีองค์กรเดียว จึงพิสูจน์การรั่วข้ามองค์กรบนระบบจริงไม่ได้ ข้อนี้มาจากโค้ด
- กิ่ง rule-change แก้เฉพาะ `schedulerAssignReviewer` และ `/api/audits/schedule`, `/api/audits/:id/schedule` ที่เหลือยังค้าง

**D4. สลับผู้ตรวจแปลงไม่ได้: รายชื่อว่าง**
- `apps/web-app/src/app/provider/scheduler/reassign/page.tsx:77` ใช้ `role=AUDITOR` · `routes/api/system/provider.js` `GET /` → `matchesRoleFilter` → `normalizeRole('AUDITOR') = null` → ไม่ตรงใคร
- staging: `net/08-directory-AUDITOR.json` = `[]` · ทางแก้: ใช้ `GET /api/provider/scheduler/auditors` ตัวเดียวกับหน้าปฏิทิน (มีด่านสิทธิ์ `APPLICATION_SCHEDULE` อยู่แล้ว)

**D5. ผู้จัดคิวไม่ได้รับแจ้งเตือนว่ามีงานเข้า**
- `notifySchedulerNewSubmission` / `notifySchedulerReadyForAudit` (`services/notification/domain-helpers.js:117`, `:140`) ไม่มีผู้เรียก ตัวตัดสถานะหลังชำระ (`checkout-settlement-service.js`) ไม่แจ้ง dispatcher
- ถ้าเปิดใช้ ต้องแก้สองฟังก์ชันนี้ก่อน: ไม่จำกัดองค์กร (`findMany` ทุกองค์กร), มีอีโมจิ 📋 🔍 ในหัวเรื่อง

### กลาง

**D6. ตัวเลข SLA ของผู้จัดคิวโตไม่หยุด** — งาน SCHEDULING ไม่ถูกปิดเมื่อจ่ายงานหรือนัดตรวจ (ตาราง ขั้น 13) · ตัวเลข "งานเลยกำหนด / ผิด SLA" ในหน้าแรกจึงไม่ใช่ความจริง และหน้า "คิวงาน" มีงานค้างของคำขอที่อนุมัติแล้ว

**D7. คิว "ต้องนัดใหม่" ทำอะไรต่อไม่ได้** (ตาราง ขั้น 9) · ต้องตัดสินก่อนว่าข้อบกพร่องร้ายแรงต้องลงแปลงซ้ำหรือไม่ (ดูคำถามนโยบาย Q2)

**D8. สลับผู้ตรวจเอกสารแล้วข้อมูลเก่าค้าง** (ตาราง ขั้น 10) · ผลคือผู้ตรวจคนเดิมยังเห็นคำขอ (ตัดสินไม่ได้เพราะ REV-11 อ่านคอลัมน์ แต่เห็นข้อมูลผู้ยื่น) · หน้าผู้จัดคิวแสดงชื่อคนเดิม · งาน DOC_REVIEW ยังผูกคนเดิม จึงนับ SLA ผิดคน

**D9. สองคิว สองความจริง** — `schedulerDashboard` (กรองการชำระ) กับ `getSchedulingQueue` (ไม่กรอง) และ `schedulerAuditSchedulesGet` ที่ `paymentMap` เป็น Map ว่าง (`:61`) ทำให้ `queue=ready_to_schedule` คืนว่างเสมอ (`net/10`) · เป็นปัญหาเดียวกับกิ่ง `fix/scheduler-queue-contract` (2026-06-16) ที่ไม่เคย merge · ควรเหลือคิวเดียว

**D10. ภาระงานผู้ตรวจเอกสารเป็น 0 เสมอ** (ตาราง ขั้น 12)

**D11. หน้าผู้จัดคิวดูรายละเอียดคำขอไม่ได้ และต้องพิมพ์สถานที่นัดเอง** — modal นัดตรวจมีช่อง "สถานที่" ว่าง ทั้งที่คำขอมี `farmData.siteAddress` และ `coordinates` (`net/18`) · `schedulerAuditSchedulesGet` ใช้ `applicant.farms[0]` (`:66`) คือฟาร์มแรกของผู้ยื่น ไม่ใช่แปลงของคำขอ (ข้อเสนอระยะ 2 ผูกแปลงกับคำขอ)

**D12. คิวแสดงชื่อผู้ยื่น ไม่ใช่ผู้ถือ** — `buildSchedulerQueueItem` ใช้ `applicant` ทุกคิว · ข้อเสนอ §2.5 / ระยะ 1 ให้แสดงผู้ถือเป็นหลัก "ยื่นโดย" เป็นบรรทัดรอง · แจ้งเตือนจากการจ่ายงาน นัดตรวจ และส่งแจ้งเตือนด้วยมือ ไปที่ผู้ยื่นทั้งหมด

### ต่ำ (หน้าจอและถ้อยคำ)

- ปุ่ม "แผนที่" ในคิวไม่มี `onClick` หรือ `href` (`coordinator/client-view.tsx:462`) เป็นปุ่มตาย
- ป้าย "หน้างาน" ขึ้นในคำขอที่ยังไม่นัด (ค่าเริ่ม ONSITE จาก `resolveAuditSchedule`) ภาพ 02
- dropdown จ่ายงานแสดงรหัสอังกฤษ `(field_inspector)` `(document_reviewer)` (`coordinator/client-view.tsx:554`, ภาพ 03)
- หน้าสลับผู้ตรวจเอกสาร: หัวคอลัมน์ "ชื่อเกษตรกร" (`reviewer-reassign/page.tsx:138`) ผู้ยื่นคือ "บุคคลทั่วไป" ไม่ใช่เกษตรกร · สถานะแสดงรหัส `ASSIGNED_FOR_REVIEW` (`:152`) · toast "ส่งแจ้งเตือนไปยังเกษตรกร" (`coordinator/client-view.tsx:137`)
- ข้อความอังกฤษบนจอ: "Reviewer Re-assignment", "Re-assignment", "Work Distribution", "Coordinator Dashboard" (ข้อความ error), "SCHEDULING" (ภาพ 04) · ข้อความ error 400 จากเซิร์ฟเวอร์เป็นอังกฤษและถูกส่งขึ้น toast ตรง ๆ
- อีโมจิ: ไอคอน KPI หน้าปฏิทิน 📌 🗓️ 📋 🔄 (`calendar/client-view.tsx:226-229`) · 📆 ใน `lib/role-utils.ts` · 📢 ในหัวแจ้งเตือน
- ชื่อบทบาทภาษาไทยมีสามชื่อ: "ผู้จัดตาราง" / "ผู้จัดสรรงานและคิวตรวจ" (`lib/role-utils.ts`) / "ผู้ประสานงาน (จัดคิว/มอบหมาย)" (หัวหน้าศูนย์จัดคิว) · operator เรียก "ผู้จัดการคิว"
- dropdown ผู้ตรวจเอกสารมีผู้ตรวจแปลงปนอยู่ (`REVIEWER_PICKLIST_ROLES`) ทำให้ "ผู้ตรวจแปลงคนนี้" ถูกกันจากการตรวจแปลงของคำขอนั้นในภายหลัง (ดู Q3)
- ตกค้างจากของที่ถอดแล้ว: comment ใน `schedulerAuditSchedulesPost` ยังบอก "e-mail/SMS fan-out" (เป็นอีเมลแจ้งข้อมูล ไม่ใช่ 2FA จึง**ไม่นับเป็น finding**) · หน้าเจ้าหน้าที่ทุกหน้าเรียก `GET /api/entities/mine` (ภาระเปล่าสำหรับบัญชีเจ้าหน้าที่ ไม่ใช่การสลับพื้นที่ทำงาน) · **ไม่พบ** ปุ่มหรือ route ที่ชี้การอนุมัติสลิป/การชำระเงิน, DTAM remittance หรือ active entity ในพื้นที่ผู้จัดคิว

### ข้อสังเกตนอกบทบาท (เจอระหว่างทาง)

- `GET /api/provider/scheduler/audits/schedules` เปิดให้ `ROLE_GROUPS.AUDIT_STAFF` (`:26`) คือผู้ตรวจเอกสารและผู้ตรวจแปลงอ่านตารางนัดทุกคน พร้อมฟาร์มและพิกัด
- `GET /api/audits/reassign/reassignable` ใช้ `providerOnly` ซึ่งรวม `finance_officer_platform` และ `certificate_approver` (ขัดคำสั่งข้อ 14)

## ข้อเสนอแก้ไข (เรียงตามคุณค่า)

### ก. ข้อบกพร่องที่ควรแก้เลย (ไม่ต้องรอมติ)

1. merge กิ่ง `fix/rule-change-return-to-applicant` (ปิด D1 และครึ่งหนึ่งของ D3) แล้วเติมเทสต์ที่ประตู `/audit/scheduling/assign` กับคำขอที่ยังไม่จ่ายงวด 2 (ชั้น C, operator merge)
2. ปิดบังเลขประจำตัวใน `schedulerReviewers` / `schedulerAuditors` ด้วย `maskThaiId` และเลิกเขียน `reviewerProviderId` ลง formData (D2)
3. ใช้ `organizationScope()` กับทุกประตูใน D3 แบบเดียวกับที่กิ่ง rule-change ทำให้ `schedulerAssignReviewer` (ค้นคำขอในองค์กร + `assertAssignableStaff` ด้วยองค์กรของคำขอ)
4. หน้าสลับผู้ตรวจแปลงใช้ `/api/provider/scheduler/auditors` (D4) พร้อมเทสต์ที่ล้มก่อนแก้
5. เมื่อจ่ายงานหรือนัดตรวจ ให้ปิดงาน SCHEDULING ของขั้นนั้น (`completeAdHocActivity` หรือ `cancelOpenForStage`) และให้การจ่ายงานเดินผ่าน `writeApplicationStatus` (กิ่ง rule-change ทำส่วนหลังแล้ว) (D6)
6. ต่อสาย `notifySchedulerNewSubmission` / `ReadyForAudit` จากตัวตัดสถานะหลังชำระ โดยจำกัดองค์กรและเอาอีโมจิออก (D5)
7. สลับผู้ตรวจเอกสาร: แก้ `PROVIDERAssignment` และย้ายงาน DOC_REVIEW ไปคนใหม่ (D8)
8. รวมเป็นคิวเดียว: ให้ `getSchedulingQueue` เป็นแหล่งเดียว (มี `phase2Paid` อยู่แล้ว) และให้หน้าศูนย์จัดคิว ปฏิทิน และคิวจัดตาราง อ่านจากที่เดียว · ลบ `paymentMap` ว่างใน `schedulerAuditSchedulesGet` (D9)
9. ภาระงาน: นับผู้ตรวจเอกสารด้วย `reviewerId` (D10)
10. ปุ่ม "แจ้งเตือน" แสดงเฉพาะสถานะที่เซิร์ฟเวอร์รับ และเอาสถานะ DOC_FEE_PAID ออกจากรายการแจ้งเตือนด้วยมือ (ผู้ยื่นไม่มีอะไรต้องทำ)
11. ถ้อยคำและอีโมจิในหมวด "ต่ำ" ทั้งหมด ตาม `thai-ui-copy`

### ข. ปรับปรุงที่เพิ่มคุณค่า (ทำได้หลังข้อ ก.)

1. หน้ารายละเอียดคำขอแบบอ่านอย่างเดียวสำหรับผู้จัดคิว (ผู้ถือ แปลง พิกัด ขอบข่าย สถานะชำระ ผู้ตรวจเอกสาร) โดยไม่มี formData ทั้งก้อน (D11)
2. modal นัดตรวจเติมที่อยู่แปลงและลิงก์แผนที่จากพิกัดของคำขอให้เอง และ dropdown ผู้ตรวจแปลงตัดผู้ตรวจเอกสารของคำขอนั้นออก พร้อมบอกภาระงานและวันว่างของแต่ละคน (`/audit/scheduling/auditor-availability/:id` มีอยู่แล้ว)
3. คิวแสดงผู้ถือเป็นหลัก ตามข้อเสนอระยะ 1 (D12)
4. เวลาค้างคิวนับจากเวลาเข้าสถานะ (ประวัติสถานะ) ไม่ใช่ `updatedAt`
5. ขยายการ walk: เดินขั้นที่กดเขียนข้อมูล (จ่ายงาน นัด เลื่อน สลับ) บน scratch Postgres ตาม memory `walking-the-real-doors…` เพื่อให้ขั้นที่ยังเป็น "ไม่ได้ลองบนระบบจริง" มีผลรัน

### ค. คำถามนโยบายสำหรับ operator

- **Q1 ชื่อบทบาทภาษาไทย**: ตอนนี้มีสามชื่อ ใช้ชื่อไหนเป็นชื่อเดียว ("ผู้จัดคิว" / "ผู้จัดสรรงานและคิวตรวจ" / อื่น)
- **Q2 ข้อบกพร่องร้ายแรง (MAJOR)**: ต้องลงแปลงซ้ำหรือไม่ ถ้าต้อง ผู้จัดคิวต้องมีขานัดจาก CAR_PENDING/CAR_REVIEWING และถ้าไม่ต้อง ควรลบคิว "ต้องนัดใหม่" ออก
- **Q3 ผู้ตรวจแปลงรับงานตรวจเอกสารได้หรือไม่**: โค้ดอนุญาต (`ELIGIBLE_REVIEWER_ROLES`) มติ 2026-10-05 ห้ามคนเดียวทำสองอย่างในคำขอเดียว แต่ไม่ได้บอกเรื่องบทบาท ถ้าอนุญาต คนที่ตรวจเอกสารคำขอนี้จะถูกกันจากการตรวจแปลงคำขอเดียวกัน
- **Q4 การตรวจแบบออนไลน์**: ยังให้เลือกได้ ทั้งที่ออกใบรับรองไม่ได้ (มีคำเตือนแล้ว) จะเก็บไว้หรือถอดออก
- **Q5 SLA ของผู้จัดคิว**: ตอนนี้ 24 ชม. (ตาราง `sla_policies`, `sla_scheduling`) นับชั่วโมงจริงไม่ใช่วันทำการ ยืนยันตัวเลขและหน่วย และเกณฑ์ "เร่งด่วน" 48/96 ชม. ใน `/urgent-monitor` ที่เขียนตายในโค้ด
- **Q6 แจ้งเตือนด้วยมือถึงผู้ยื่น**: ควรส่งถึงผู้ถือ (สมาชิกเจ้าของ/ผู้ดูแล) หรือผู้ยื่น หรือทั้งคู่ ตามข้อเสนอ §2.5
- **Q7 ความจุผู้ตรวจ**: `AUDITOR_MAX_CONCURRENT_AUDITS` ค่าเริ่ม 5 จากตัวแปรสภาพแวดล้อม ควรเป็นข้อมูลที่ตั้งค่าได้และมีวันที่ (memory operator-no-hardcode-in-api) หรือไม่

## ไฟล์หลักฐาน

- ภาพ: `reports/role-workflow-auditor/2026-10-06-dispatcher/01…13-*.png`
- API: `reports/role-workflow-auditor/2026-10-06-dispatcher/net/00…19-*.json`, `screen-*.txt`, `screen-api-calls.json`
