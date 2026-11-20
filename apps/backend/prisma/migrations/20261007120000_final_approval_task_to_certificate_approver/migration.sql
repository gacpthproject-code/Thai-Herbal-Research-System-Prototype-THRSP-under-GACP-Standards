-- งาน "อนุมัติออกใบรับรอง" (FINAL_APPROVAL ที่ AUDIT_PASSED) เป็นของผู้อนุมัติใบรับรอง
-- (คำสั่ง 29, operator 2026-10-07; F-CERT-SOD 2026-09-10)
--
-- แถว config นี้ถูก seed ปี 2026-04 ด้วยกลุ่ม 'auditor' แล้วถูกแปลงเป็น 'field_inspector'
-- ตอนเปลี่ยนคำศัพท์บทบาท (20260910120000) งานอนุมัติจึงขึ้นในคิวของผู้ตรวจพื้นที่พร้อมปุ่ม
-- รับงาน/ปิดงาน (live walk 2026-10-07 F2) ทั้งที่ผู้ตรวจพื้นที่ตัดสินให้การรับรองไม่ได้
--
-- ย้ายทั้ง config และงานที่ยังเปิดอยู่ · งานที่มีผู้รับไปแล้ว (assignedUserId) ปล่อยว่าง
-- ให้ผู้อนุมัติหยิบใหม่ · idempotent: รันซ้ำไม่เปลี่ยนอะไร

UPDATE "stage_activity_configs"
SET "candidateGroup" = 'certificate_approver'
WHERE "workType" = 'FINAL_APPROVAL'
  AND "candidateGroup" IS DISTINCT FROM 'certificate_approver';

UPDATE "work_activities"
SET "candidateGroup" = 'certificate_approver',
    "assignedUserId" = NULL,
    "claimedAt" = NULL,
    "state" = 'TODO'
WHERE "workType" = 'FINAL_APPROVAL'
  AND "completedAt" IS NULL
  AND "cancelledAt" IS NULL
  AND "candidateGroup" IS DISTINCT FROM 'certificate_approver';
