-- งานของผู้จัดคิว (workType SCHEDULING) ของขั้นหนึ่ง เสร็จเมื่อคำขอพ้นขั้นนั้น (คำสั่ง 27, operator 2026-10-06)
--
-- ก่อน 2026-10-09 ไม่มีประตูไหนปิดงานนี้เมื่อมอบผู้ตรวจเอกสารหรือนัดตรวจ งานของคำขอที่พ้นคิวไปนานแล้ว
-- จึงค้างเปิดและนับเป็นงานเลยกำหนดของผู้จัดคิวตลอดไป (role-workflow audit 2026-10-06 dispatcher D6)
-- ตั้งแต่นี้ตัวเขียนสถานะปิดงานให้ทุกครั้งที่คำขอพ้นขั้น (services/application-status-writer.js)
-- migration นี้ปิดงานที่ค้างจากก่อนหน้านั้น โดยบอกเหตุ ไม่ระบุผู้ปิด เพราะไม่รู้ว่าใครเป็นคนพาคำขอออก
--
-- กำหนดเวลาของงานจัดคิวเป็นค่ามีวันที่กำกับนับวันทำการใน config/business-rules.js DISPATCHER แล้ว
-- แถวชั่วโมงของ SCHEDULING ใน sla_policies จึงเป็นแหล่งที่สองที่ไม่มีผลแต่ผู้ดูแลยังแก้ได้ ลบทิ้ง
--
-- idempotent: รันซ้ำไม่เปลี่ยนอะไร
-- rollback: งานที่ปิดแล้วไม่เปิดคืน (ปิดเพราะคำขอพ้นขั้นไปแล้วจริง) · แถว sla_policies คืนได้ด้วย
--   INSERT INTO "sla_policies" ("id","workType","targetHours","warningHours","escalationHours","labelTH","labelEN","updatedAt")
--   VALUES ('sla_scheduling','SCHEDULING',24,16,48,'จัดคิว/มอบหมาย','Scheduling / Assignment',now());

UPDATE "work_activities" AS wa
SET "state" = 'CANCELLED',
    "cancelledAt" = now(),
    "cancelReason" = 'ปิดย้อนหลัง: คำขอพ้นขั้นตอนที่รอผู้จัดคิวไปแล้ว',
    "updatedAt" = now()
FROM "applications" AS a
WHERE wa."applicationId" = a."id"
  AND wa."workType" = 'SCHEDULING'
  AND wa."state" IN ('TODO', 'CLAIMED', 'IN_PROGRESS')
  AND a."status" <> wa."triggeredAtStage";

DELETE FROM "sla_policies" WHERE "workType" = 'SCHEDULING';
