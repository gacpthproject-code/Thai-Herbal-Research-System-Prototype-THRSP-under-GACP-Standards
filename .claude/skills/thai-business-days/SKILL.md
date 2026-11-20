---
name: thai-business-days
description: ตรรกะวันทำการ/วันหยุดราชการไทย + timezone Asia/Bangkok ของ repo นี้. Use when computing or reading a deadline, due date, reminder date, revision/CAR window, quotation validity, overdue check, or when adding a holiday, a working-day helper, or a date assertion in a test.
---

# Thai Business Days (ICT)

**หมายเหตุการอ้างอิง**: อ้างด้วยชื่อ const/function เท่านั้น ไม่อ้างเลขบรรทัด (เลขบรรทัดขยับทุก
commit — ฉบับก่อน 2026-09-27 อ้างเลขบรรทัดแล้วเพี้ยนเกือบทุกจุด) ใช้ `grep -n "<symbol>"` หาเอง

**SSOT เดียว: `apps/backend/utils/working-days.js`** — domain `holiday-calendar`
ใน `scripts/probes/ssot-domains.txt` อนุญาตไฟล์นิยามได้ไฟล์เดียว และ probe
`holiday-single-source` นับไฟล์ใต้ backend ที่**ประกาศ** `RECURRING_/PUBLIC_/EXTRA_HOLIDAYS*`
(pattern การประกาศ ไม่ใช่คำเปล่า — หัวไฟล์ `holiday-single-source.sh` เล่าเหตุ)
· สถานะ: **PASS** (`single calendar source: apps/backend/utils/working-days.js`, รัน 2026-09-27)
· L-001 เผาแล้ว waiver คืนแล้ว (แถว `holiday-single-source` ใน `probe-registry.txt`)

## เมื่อไรใช้

- จะคำนวณ/อ่าน deadline, due date, reminder, overdue, วันหมดยืนราคาใบเสนอราคา
- จะเพิ่มวันหยุด หรือขยายปีในตารางวันหยุด
- จะเขียน test ที่ assert วันที่ (โดยเฉพาะเคสข้ามเที่ยงคืน / ศุกร์ดึก)
- เห็นเลขวัน (5, 7, 15, 3, 30) ใน business logic แล้วสงสัยว่าเป็น hardcode ไหม

## Timezone — ข้อเดียวที่ผิดบ่อยที่สุด

ทุกการตัดสิน "วันไหน / วันทำการไหม" ต้องประเมินใน `Asia/Bangkok` (ICT, UTC+7)
(`DEFAULT_TIME_ZONE` ใน `working-days.js`) และทุกฟังก์ชันรับ `timeZone` เป็นพารามิเตอร์ท้าย

- ห้ามใช้ `date.getDay()` / `date.getDate()` — เป็น UTC-relative
  **ศุกร์ 23:00 ICT = เสาร์ใน UTC** จะถูกนับผิดทันที (คำเตือนในหัวไฟล์ `working-days.js`)
- ตัวที่ถูกคือ `getZonedParts()` ซึ่งใช้ `Intl.DateTimeFormat`
- ไม่ใช่แค่วันทำการ: **ทุก** วัน/เดือน/ปี/เวลาทางธุรกิจเป็นเวลากรุงเทพฯ (operator 2026-09-26
  "เวลาไทยทั้งหมด") — ใช้ `localYear` / `startOfLocalDay` / `localMonthRange` /
  `localWallClock` / `formatLocalTime` ใน `working-days.js` (web: `lib/format/thai-date.ts`)
  · เทส `__tests__/unit/business-dates-go-through-bangkok-helpers.test.js` จับ
  `getFullYear`/`toISOString().slice(0,10)`/`toLocale*` ไม่มี `timeZone` ฯลฯ นอก helper
- ICT ไม่มี DST ⇒ วัน local ยาวคงที่ (ข้อสังเกตใน `checkout-schedule-service.js`)

## ตารางวันหยุด

| ชุด | ที่อยู่ | รูปแบบ |
|---|---|---|
| วันหยุดตายตัวรายปี (15 วัน) | `RECURRING_HOLIDAYS` | `MM-DD` |
| วันหยุดจันทรคติ/ชดเชยตามประกาศ รายปี | `EXTRA_HOLIDAYS_BY_YEAR` | `YYYY-MM-DD`, ครอบปี 2025–2027 |
| วันหยุดชดเชยที่ derive เอง | `substituteHolidaysFor(year)` | ชุดวันหยุดตายตัวที่ติดเสาร์-อาทิตย์ได้ชดเชย 1 วัน (กติกาในคอมเมนต์เหนือฟังก์ชัน) |
| วันหยุดพิเศษ (ผู้ดูแลฝั่งกรมเพิ่มได้ คำสั่ง 32) | ตาราง `special_holidays` → `refreshSpecialHolidays` (`services/special-holiday-service.js`) → `setSpecialHolidays` | วันที่กรุงเทพฯ · append-only (trigger ห้าม UPDATE/DELETE/TRUNCATE) |

- ปีสุดท้ายใน `EXTRA_HOLIDAYS_BY_YEAR` = 2027 (ตรวจ 2026-11-03) · ต้องเติม 2028 จากราชกิจจานุเบกษาก่อนกำหนดใด ๆ ข้ามเข้าปี 2028
  (เหตุ (ง) 60 วันทำการ และใบรับรอง 1 ปี จะข้ามปีตั้งแต่ปลายปี 2027)

- ปีที่เกินตาราง: `warnIfExtraHolidayCoverageMissing()` เตือน **ครั้งเดียวต่อปีต่อ process**
  ว่า deadline ที่คำนวณเข้าไปในปีนั้นจะสั้นเกินจริง — วันจันทรคติต้องมาจากราชกิจจานุเบกษา
  **ห้ามเดา** (คอมเมนต์เหนือ `MAX_EXTRA_HOLIDAY_YEAR`)
- `isHoliday` = ตรง `MM-DD` ตายตัว **หรือ** วันชดเชยจาก `substituteHolidaysFor` **หรือ** `YYYY-MM-DD` ของปีนั้น
  **หรือ** อยู่ใน `specialHolidayDates` (วันหยุดพิเศษที่โหลดจากฐาน)
- `isWorkingDay` = ไม่ใช่ Sat/Sun **และ** ไม่ใช่วันหยุด

## พฤติกรรมของ API (จำให้แม่น — ไม่ symmetric)

| ฟังก์ชัน | พฤติกรรม |
|---|---|
| `addWorkingDays(start, n)` | เดินไปข้างหน้า n วันทำการ **ไม่นับวันเริ่ม** แล้วคืน **end-of-business-day** = 23:59:59.999 ตาม local (`endOfLocalDay`) · `n` ติดลบ/ไม่ใช่ตัวเลข = throw |
| `addWorkingDays(d, 0)` | ไม่ขยับวัน แต่ยัง **snap เป็น 23:59:59.999** ของวันนั้น |
| `countWorkingDaysBetween(from, to)` | **exclusive-start**: ไม่นับวันของ `from`; เดินทีละวันแล้วนับเมื่อ local-midnight ของวันถัดไป ≤ `to` · timestamp เท่ากันเป๊ะ → `0` · `to < from` → **ค่าลบ** |
| `calculateRevisionDeadline(start)` | คืน `{ revisionDue, workingDaysAdded }` — `revisionDue = addWorkingDays(start, PAYMENT.REVISION_DEADLINE_BUSINESS_DAYS)` อ่านค่าจาก config ไม่ใช่ literal |
| `getDeadlineStatus(due)` | `urgency`: `expired` / `critical` (≤1) / `high` (≤2) / `normal` + `displayText` ภาษาไทย |
| `minusWorkingDays(date, n)` | ถอยหลัง n วันทำการจากวันกรุงเทพฯ ของ `date` **ไม่นับวันเริ่ม** แล้วคืน **00:00 local** ของวันนั้น · ผู้ใช้: เตือนก่อนครบกำหนดชำระ (`checkout-schedule-service.js`) และเตือนก่อนนัดตรวจพื้นที่ (`dispatcher-rules.visitReminderDayFor`) · ย้ายเข้า SSOT รอบ 4 ของ fix/dispatcher-tools (2026-10-09) |

## เลขวันทั้งหมดมาจาก config (probe `ratchet` counter `hardcode`/`dup-source` · memory `operator-no-hardcode-in-api`)

`apps/backend/config/business-rules.js` — **ห้ามสะกดซ้ำที่อื่น**

| ค่า | ความหมาย |
|---|---|
| `PAYMENT.REVISION_DEADLINE_BUSINESS_DAYS: 5` | หน้าต่างแก้ไข **เอกสาร** (วันทำการ, คำสั่ง 28) — เว็บ mirror `GACP_DOCUMENT_REVISION_DEADLINE_BUSINESS_DAYS` ใน `service-facts.ts` คุมด้วย `frontend-service-facts-mirror.test.js` |
| `CORRECTIVE_ACTION.ONSITE_WINDOW` | หน้าต่างส่งหลักฐานแก้ข้อบกพร่องจาก **การตรวจพื้นที่** ค่ามีวันที่กำกับ: ก่อน 9 ต.ค. 2569 = 5 วันทำการ · ตั้งแต่ 9 ต.ค. 2569 = **30 วันปฏิทิน** (คำสั่ง 56(2a)) ครบสิ้นวันกรุงเทพฯ · อ่านผ่าน `services/correction-windows.js` (`onsiteCorrectionDueAt`) · ไม่มีรายการที่มีผล = throw `CAR_WINDOW_NOT_IN_FORCE` ไม่เดา · เว็บ mirror `GACP_ONSITE_CORRECTION_DEADLINE_CALENDAR_DAYS` |
| `PAYMENT.INVOICE_DUE_BUSINESS_DAYS.M1: 7` / `.M2: 15` | หน้าต่างชำระเงินต่อ milestone (วันทำการ) |
| `PAYMENT.PAYMENT_REMINDER.PRE_DUE_BUSINESS_DAYS: 3` | เตือนล่วงหน้ากี่วันทำการ |
| `PAYMENT.PAYMENT_ABANDONMENT_CLOSE_CALENDAR_DAYS: 30` | **วันปฏิทิน** ไม่ใช่วันทำการ — ปิดคำขอที่ไม่จ่าย |
| `PAYMENT.PAYMENT_CLOSURE_GRACE_AFTER_FINAL_REMINDER` | 7 **วันปฏิทิน** หลังคำเตือนครั้งที่สาม (`OVERDUE_NOTICE`) ส่งถึงผู้รับจริง · ค่ามีวันกำกับ (`effectiveFrom 2026-10-07`) อ่านผ่าน `services/billing/closure-grace.js` · ไม่มีรายการที่มีผล = ตัวปิดไม่ปิด (คำสั่ง 39) |

**คิวผู้จัดคิว — คำสั่ง 27 (operator 2026-10-06) และ 56(1) (2026-10-09)**: ค่ามีวันที่กำกับใน `DISPATCHER` ของ
`config/business-rules.js` ทั้งหมด เปลี่ยนค่า = เพิ่มรายการใหม่ที่ `effectiveFrom` ใหม่กว่า ห้ามแก้รายการเดิม

| register | ความหมาย |
|---|---|
| `QUEUE_TIME_LIMITS` | งานจัดคิวครบกำหนด 1 · เร่งด่วน 2 · วิกฤต 4 · มองล่วงหน้า 3 วันทำการ |
| `OFFICER_WORKLOAD_CAPS` | ผู้ตรวจเอกสาร 5 คำขอที่ถืออยู่ · ผู้ตรวจพื้นที่ 5 นัดในอีก 5 วันทำการ · เกินได้เมื่อยืนยันพร้อมเหตุผล (`services/assignment-policy.js`) |
| `INSPECTOR_DAILY_VISITS` | ผู้ตรวจพื้นที่วันละ 2 นัด ตามวันกรุงเทพฯ ของวันนัด (เดิมเป็นตัวแปร `AUDITOR_MAX_PER_DAY` ถอดแล้ว) |
| `VISIT_REMINDER` | เตือนผู้ยื่นและผู้ถือ 2 วันทำการก่อนวันนัด (`jobs/visit-reminder-job.js`) ปิดไม่ได้ · ยังไม่ลงทะเบียนในตัวตั้งเวลา จนกว่าคำขอเลื่อนนัดของคำสั่ง 65(3) จะ deploy พร้อมกัน |

ตัวเลือกค่าที่มีผลคือ `services/dispatcher-rules.js` (`queueTimeLimitsAt`, `schedulingDueAt`, `waitingUrgency`,
`urgencyOf`, `officerWorkloadCapsAt`, `dailyVisitCapOn`, `visitReminderDayFor`) · หน้าเฝ้าระวังนับจากวันที่คำขอเข้าขั้น
(`formData.workflowStateUpdatedAt`) เฉพาะขั้นที่เจ้าหน้าที่ถือ นัดตรวจขึ้นเตือนเมื่อเลยวันนัดโดยไม่มีผลเท่านั้น ·
วันที่ต้องตรวจภายใน = `addWorkingDays(ชำระงวด 2, 60)` ตามเงื่อนไขชำระเงิน v1.3 (`shared/refund-kinds.companyInspectionDeadline`) ·
แถว `SCHEDULING` ใน `sla_policies` ถูกลบแล้ว (migration `20261009090000`) · งาน `FIELD_AUDIT` นับเวลาจากวันนัด ไม่ใช่วันจอง
(`work-activity-service.moveVisitClock` เมื่อเลื่อนนัด) · จอเจ้าหน้าที่แสดง "เหลือ/เลยกำหนด N วันทำการ" ไม่ใช่ชั่วโมง

**ใบเสนอราคา — มติ operator 2026-09-27: ยืนราคา 7 วันทำการ ไม่นับวันออก ตามเวลากรุงเทพฯ**
`quotation-service.js` เรียก `addWorkingDays(issueDate, PAYMENT.QUOTATION_VALIDITY_BUSINESS_DAYS)` (ไม่นับวันเริ่มอยู่แล้ว)
กับค่าจาก config ไม่ใช่ literal — เลิกใช้ `DEFAULT_VALIDITY_DAYS` แบบ `Date + N * 24 * 3600 * 1000`
ที่ให้วันปฏิทินแล้ว

## due-date ของ payment คำนวณที่ไหน

`apps/backend/services/checkout/checkout-schedule-service.js` เป็นชั้นเดียวที่
ต่อ config เข้ากับปฏิทิน (ประกาศเจตนาในหัวไฟล์) และไม่มีข้อมูลปฏิทินของตัวเอง

- กำหนดชำระ = `milestoneDueDate()` = `computeDueDate(clockStart, milestone)` = `addWorkingDays(จุดเริ่มนาฬิกา, INVOICE_DUE_BUSINESS_DAYS[งวด])`
  milestone ที่ไม่มี config → โยน `SCHEDULE_UNKNOWN_MILESTONE` ไม่ใช่ default
- จุดเริ่มนาฬิกา (`milestoneClockStart`, คำสั่ง 32) **ไม่ใช่วันสร้าง order หรือใบแจ้งหนี้**: M1 = วันออกใบเสนอราคา ·
  M2 = วันเอกสารผ่าน (`formData.docApprovedAt` แล้ว fallback ประวัติ `DOC_APPROVED`) · ต่ออายุ = fallback สุดท้ายเป็นวันออกใบเสนอราคา ·
  ไม่มีจุดเริ่มในบันทึก = `null` ห้ามเดา · มีใบแจ้งหนี้แล้วใช้ `dueDate` บนใบ
- ตอนสร้าง order (`createCheckoutForApplication()` ใน `stripe-checkout-service.js`) ใช้ `milestoneDueDate(...)` และใช้
  `computeDueDate(new Date(), ...)` เป็นทางสำรองเท่านั้น · ตัวเตือนและตัวปิดอ่านงวดค้างจาก `services/billing/unpaid-milestones.js`
- **overdue เป็นค่า derived ไม่เคย store** — `isInvoiceOverdue` และ where-clause
  `overdueInvoiceWhere` จงใจไม่มีคู่ฝั่ง writer
- reminder 3 ตัว `PRE_DUE` / `DUE_DATE` / `OVERDUE_NOTICE` (`computeReminderDates`) — ตัวที่ตกวันหยุดถูก
  **เลื่อนไปข้างหน้า** ทีละตัวอิสระ (`shiftToWorkingDay`)

## กับดัก

| กับดัก | ความจริง |
|---|---|
| สร้างตารางวันหยุดตัวที่สอง / คัด `RECURRING_HOLIDAYS` ไปไฟล์ใหม่ | probe `holiday-single-source` นับเป็น 2 sources = FAIL และ ratchet `dup-source` จะเพิ่ม = gate แดง (ทั้งสองรันใน probe-gate ทุกครั้งที่รัน local-gate/full-gate) |
| `require('../services/working-days-service')` เพราะชื่อเหมือนกัน | นั่นคือตัว **legacy holiday-BLIND** — ไม่มีตารางวันหยุดของตัวเอง (รับ `holidaySet` ที่ caller ส่งมา ส่วนมากคือเซตว่าง) · วัน/เสาร์อาทิตย์อ่านเป็นวันกรุงเทพฯ ผ่าน `getZonedParts` แล้ว (fix/bangkok-time 2026-09-26) แต่ยังไม่รู้จักวันหยุดราชการ · มี test pin ห้าม require ไว้แล้ว (`apps/backend/__tests__/unit/workflow-reject-deadline-holiday.test.js`) |
| เทียบ deadline ด้วย `<` แล้วงงว่าทำไม "วันสุดท้าย" ยังไม่หมดเขต | deadline คือ 23:59:59.999 ของวันนั้น ไม่ใช่ 00:00 (`endOfLocalDay`) |
| คาดว่า `countWorkingDaysBetween(a, b)` = `-countWorkingDaysBetween(b, a)` | ทิศทางคนละสูตร อย่าสมมติความสมมาตรใน test |
| เขียน `5` / `7` / `15` ลงในโค้ดหรือ label UI | ratchet `hardcode` เพิ่ม · ข้อความบนเว็บอ่านจาก `apps/web-app/src/constants/service-facts.ts` (mirror ของ backend) · เคสจริงที่โดนแล้ว: ตัวเลขค่าธรรมเนียม hardcode ใน label หน้าเว็บ (L-094, `reports/role-workflow-auditor/2026-08-06-farmer.md:190`) · FAQ เคยเขียน CAR 30 วัน (แก้ `cecb8794`) |
| `Date + N * 24 * 3600 * 1000` สำหรับกำหนดที่มติเป็นวันทำการ | ได้วันปฏิทินใน UTC — เคยเป็นบั๊กจริงใน `DEFAULT_VALIDITY_DAYS` ของใบเสนอราคา แก้แล้ว `65813e34` ด้วย `addWorkingDays()` |
| เทสต์ที่ไม่โหลดวันหยุดพิเศษแล้วคาดว่าวันนั้นเป็นวันทำการ | วันหยุดพิเศษอยู่ในฐานข้อมูล โหลดผ่าน `setSpecialHolidays` เทสต์ที่ไม่โหลดจะไม่เห็น · วันที่ประทับลงแถวแล้วไม่คำนวณใหม่เมื่อเพิ่มวันหยุดพิเศษภายหลัง |
| เพิ่มปีในตารางวันหยุดจากปฏิทินบนเว็บ | ต้องอ้างราชกิจจานุเบกษา — คำเตือนในคอมเมนต์เหนือ `MAX_EXTRA_HOLIDAY_YEAR` เขียนไว้ชัดว่าห้ามเดา |

## ตรวจก่อนส่ง

```bash
bash scripts/check-done.sh holiday-single-source ratchet
```
`dup-source` ต้องไม่เพิ่มจาก baseline · `holiday-single-source` ต้อง PASS (1 source)
