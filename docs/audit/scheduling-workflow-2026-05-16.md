# Audit Scheduling Workflow — Iter 25 (2026-05-16)

ขอบเขต: เอกสารนี้อธิบายขั้นตอนการนัดหมายตรวจฟาร์ม (audit scheduling)
ที่เชื่อมต่อจากสถานะ `AUDIT_FEE_PAID` ไปยัง `AUDIT_CONFIRMED`
ใน workflow มาตรฐานของระบบ GACP (canonical workflow ตาม
`apps/backend/services/workflow-transition-service.js`).

อ้างอิงตามแบบแผน Thai workflow ดังนี้:
- กระบวนการ AUDIT_FEE_PAID → AUDIT_CONFIRMED ต้องใช้ผู้ใช้ที่มี role
  `SCHEDULER` หรือ `ADMIN` เท่านั้น (ROLE_TRANSITIONS contract).
- ห้ามนัดหมายในวันเสาร์-อาทิตย์หรือวันหยุดราชการ ตาม
  `utils/working-days.isWorkingDay`.
- การแจ้งเตือนผู้สมัครและผู้ตรวจผ่าน
  `notification-fanout-service` template `AUDIT_SCHEDULED`
  (จาก Iter 23).
- ขีดจำกัดการตรวจต่อวัน 2 รอบ/ผู้ตรวจ/วัน ตามคู่มือ Bureau of Audit
  2566/2.4 (เช้า + บ่าย). ตั้งแต่ 9 ต.ค. 2569 เป็นค่ามีวันที่กำกับ
  `DISPATCHER.INSPECTOR_DAILY_VISITS` (คำสั่ง 56(1) 2.3) ตัวแปร env เดิมถูกถอด.

## แผนภาพ workflow

```
        ┌────────────────────┐
        │   AUDIT_FEE_PAID   │   ← เข้ามาจาก PHASE_2_SLIP_UNDER_REVIEW
        └────────┬───────────┘
                 │
                 │  SCHEDULER เรียก assignAuditor()
                 │  - เลือก auditor (มี role AUDITOR + active)
                 │  - เลือก scheduledDate (อนาคต + working-day)
                 │  - ตรวจ conflict + cap
                 │  - writeApplicationStatus(...) transactional
                 │
                 ▼
        ┌────────────────────┐
        │  AUDIT_CONFIRMED   │   ← notification-fanout AUDIT_SCHEDULED
        └─────┬───────┬──────┘
              │       │
              │       │  HEALTH applicant เรียก requestReschedule()
              │       │  → สร้าง entry ใน
              │       │     Application.formData.rescheduleRequests[]
              │       │     สถานะ = PENDING (status ไม่เปลี่ยน)
              │       │
              │       │  SCHEDULER เรียก approveReschedule()
              │       │  → อัปเดต Application.scheduledDate + auditorId
              │       │  → mark request เป็น APPROVED
              │       │
              │       ▼  (stay in AUDIT_CONFIRMED)
              │
              │  AUDITOR เข้าหน้างาน + ส่งผล (Iter 25-B)
              ▼
   AUDIT_PASSED / CAR_PENDING / REJECTED
```

## Service exports (`apps/backend/services/audit-scheduling-service.js`)

- `getSchedulingQueue({ organizationId, status })`
  - คืน application ที่อยู่ในสถานะ `AUDIT_FEE_PAID` (ค่าเริ่มต้น) ภายใน
    tenant. ใช้กับหน้า queue ของ scheduler.
- `assignAuditor({ applicationId, auditorId, scheduledDate, scheduledTime,
  location, notes, inspectionMode, estimatedDuration, actor })`
  - Atomic `$transaction`: ตรวจ + ตรวจ conflict + transition
    `AUDIT_FEE_PAID → AUDIT_CONFIRMED` ผ่าน `writeApplicationStatus`.
  - หลัง commit: เรียก `notification-fanout-service.send(AUDIT_SCHEDULED)`
    ส่งให้ผู้สมัคร (best-effort).
- `requestReschedule({ applicationId, requestedDate, reason, actor })`
  - HEALTH ผู้เป็นเจ้าของเรื่อง (เช็ค `healthId` ตรง) สร้าง entry
    `formData.rescheduleRequests[]` สถานะ `PENDING`.
  - ไม่เปลี่ยน workflow state — รอ scheduler approve.
- `approveReschedule(rescheduleId, { newDate, newAuditor, actor })`
  - SCHEDULER/ADMIN อัปเดต `Application.scheduledDate` + `auditorId`,
    mark request เป็น `APPROVED`. workflow state คงเป็น `AUDIT_CONFIRMED`.
- `getAuditorAvailability({ auditorId, dateRange })`
  - คืน busy slots พร้อมรายการวันที่เกิน cap — ใช้กับปฏิทินของ scheduler.

## Routes (`apps/backend/routes/api/audit/scheduling.js`)

| Method | Path | Role | คำอธิบาย |
|--------|------|------|----------|
| GET    | `/api/audit/scheduling/queue` | SCHEDULER + ADMIN | คิวรอจัด |
| POST   | `/api/audit/scheduling/assign` | SCHEDULER + ADMIN | นัดหมาย |
| POST   | `/api/audit/scheduling/:applicationId/reschedule` | HEALTH (เจ้าของ) | ขอเลื่อน |
| POST   | `/api/audit/scheduling/:rescheduleId/approve` | SCHEDULER + ADMIN | อนุมัติ |
| GET    | `/api/audit/scheduling/auditor-availability/:auditorId` | SCHEDULER + ADMIN | ปฏิทินผู้ตรวจ |

Mount ที่ `apps/backend/routes/api/index.js` ตามแบบเดียวกับ Iter 23/24
(`/finance/refunds`, `/finance/period-close`).

## Conflict detection rules

ทุกครั้งที่ `assignAuditor` หรือ `approveReschedule` ถูกเรียก ระบบจะตรวจ
2 เงื่อนไขนี้:

1. **AUDITOR_BUSY** — หาช่วง Application อื่นของ auditor ที่มี
   `scheduledDate` ซ้อนทับกับช่วงเวลาที่ขอจัด (window =
   `estimatedDuration` นาที; ค่าเริ่มต้น 120). ไม่นับ status:
   `REJECTED, CANCELLED, CANCEL_EXPIRED, APPROVED, CERTIFIED`.
2. **AUDITOR_OVER_CAP** — หาก auditor มี audit ในวันเดียวกัน ≥
   ค่าที่มีผลในวันนัดของ `DISPATCHER.INSPECTOR_DAILY_VISITS` (2) จะ reject ก่อนตรวจ overlap.

เมื่อเกิด conflict ทั้งสอง service จะ throw error ที่มี
`data.conflictingApplicationId` ให้ frontend แสดงให้ scheduler เห็น
ว่าใครชนกับใคร.

นอกจากนี้ยังตรวจ:
- `scheduledDate` ต้องเป็นอนาคต — VALIDATION_ERROR หากเป็นอดีต.
- ต้องเป็นวันทำการ — NON_WORKING_DAY หากเป็นเสาร์/อาทิตย์/วันหยุด.
- auditor ต้องเป็น active user + canonical role = `AUDITOR`.
- application ต้องอยู่ในสถานะ `AUDIT_FEE_PAID` สำหรับ `assignAuditor`
  และ `AUDIT_CONFIRMED` สำหรับ `requestReschedule`.

## Notification triggers

| เหตุการณ์ | Template | ช่องทาง | ผู้รับ |
|-----------|----------|---------|--------|
| `assignAuditor` สำเร็จ | `AUDIT_SCHEDULED` | IN_APP + EMAIL + SMS | applicant (HEALTH) |
| `approveReschedule` สำเร็จ | `AUDIT_SCHEDULED` | IN_APP + EMAIL + SMS | applicant (HEALTH) |
| `requestReschedule` | — (audit-log entry `AUDIT_RESCHEDULE_REQUESTED`) | — | scheduler ดูจาก dashboard |

การ fanout ทำงานหลังจาก `$transaction` commit สำเร็จเสมอ (best-effort)
— ถ้า fanout fail จะ log warning แต่ไม่ rollback การเปลี่ยน workflow state.

## Storage shape (formData)

ใน Iter 25 ยังไม่มี Prisma migration — ทั้ง schedule และ
reschedule request ถูกเก็บใน `Application.formData` JSON column:

```json
{
  "workflowState": "AUDIT_CONFIRMED",
  "auditSchedule": {
    "auditId": "<uuid>",
    "scheduledDate": "<ISO>",
    "auditorId": "<user-id>",
    "auditorName": "<displayed name>",
    "inspectionMode": "ONSITE | ONLINE_MEET",
    "location": "<string|null>",
    "notes": "<string|null>",
    "estimatedDuration": 120,
    "scheduledBy": "<user-id>",
    "scheduledAt": "<ISO>",
    "rescheduledAt": "<ISO|null>",
    "rescheduledBy": "<user-id|null>"
  },
  "rescheduleRequests": [
    {
      "id": "<uuid>",
      "status": "PENDING | APPROVED | REJECTED",
      "requestedDate": "<ISO>",
      "reason": "<thai-free-text>",
      "requestedBy": "<user-id>",
      "requestedAt": "<ISO>",
      "previousScheduledDate": "<ISO|null>",
      "previousAuditorId": "<user-id|null>",
      "approvedAt": "<ISO|null>",
      "approvedBy": "<user-id|null>",
      "approvedNewDate": "<ISO|null>",
      "approvedNewAuditor": "<user-id|null>"
    }
  ]
}
```

Forward-compatible: เมื่อ schema iteration ในอนาคตเพิ่ม
`RescheduleRequest` เป็น first-class model ข้อมูลเหล่านี้ migrate
เข้า typed column ได้ทันที.

## Tests

`apps/backend/__tests__/unit/audit-scheduling-service.test.js` — 23 cases:

- `assignAuditor` (11): happy path, ADMIN override, role guard,
  past-date guard, weekend guard, INVALID_STATE, AUDITOR_NOT_FOUND,
  AUDITOR_INVALID_ROLE, AUDITOR_OVER_CAP, AUDITOR_BUSY,
  APPLICATION_NOT_FOUND.
- `requestReschedule` (5): happy path, FORBIDDEN_ROLE, INVALID_STATE,
  reason-too-short, FORBIDDEN_OWNER.
- `approveReschedule` (4): happy path, RESCHEDULE_NOT_PENDING,
  RESCHEDULE_NOT_FOUND, past-date guard.
- `getAuditorAvailability` (2): busy + overCapDays, missing dateRange.
- `getSchedulingQueue` (1): filters to AUDIT_FEE_PAID.

ผ่านทั้งหมด. anchor `workflow-transition-service.test.js` +
`payment-phase-flow-canonical-totals.test.js` ผ่านโดยไม่ regression.
