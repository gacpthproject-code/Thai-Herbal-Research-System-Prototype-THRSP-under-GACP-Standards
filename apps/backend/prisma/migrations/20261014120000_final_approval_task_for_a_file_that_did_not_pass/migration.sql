-- งานตัดสินของผู้อนุมัติใบรับรองเมื่อผู้ตรวจพื้นที่บันทึก "ไม่ผ่าน" (คำสั่ง 56(2) หน่วย U2)
--
-- คำขอที่เข้า AUDIT_NOT_PASSED รอผู้อนุมัติตัดสิน (ไม่ให้การรับรอง หรือส่งกลับให้แก้ไขข้อบกพร่อง) แต่ตารางนี้มีแถว
-- FINAL_APPROVAL เฉพาะของ AUDIT_PASSED งานจึงไม่ขึ้นในคิวงานของผู้อนุมัติ แถวนี้ใช้ชนิดงานและกลุ่มเดียวกับ
-- sac_final_approval (20261007120000) · ข้อมูลอย่างเดียว ไม่แตะโครงสร้าง · รันซ้ำไม่เปลี่ยนอะไร
-- "updatedAt" ใส่เอง เพราะคอลัมน์ไม่มีค่าเริ่มต้นตั้งแต่ 20260502000000_reconcile_drift
--
-- ถอยกลับ: DELETE FROM "stage_activity_configs" WHERE "id" = 'sac_final_approval_not_passed';
-- งานที่สร้างไปแล้วไม่ต้องลบ ตัวเขียนสถานะปิดงานค้างเองเมื่อคำขอถึงสถานะปลายทาง

INSERT INTO "stage_activity_configs"
    ("id", "workflowStage", "workType", "candidateGroup", "displayOrder", "labelTH", "labelEN", "descriptionTH", "updatedAt")
VALUES
    ('sac_final_approval_not_passed', 'AUDIT_NOT_PASSED', 'FINAL_APPROVAL', 'certificate_approver', 0,
     'ตัดสินแฟ้มที่ผู้ตรวจพื้นที่ให้ไม่ผ่าน', 'Decide a file that did not pass the inspection',
     'ไม่ให้การรับรอง หรือส่งกลับให้ผู้ยื่นแก้ไขข้อบกพร่อง', CURRENT_TIMESTAMP)
ON CONFLICT ("workflowStage", "workType") DO NOTHING;
