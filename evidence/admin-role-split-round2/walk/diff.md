# สิ่งที่เปลี่ยนระหว่างการเดินก่อนและหลังแก้

แถวอื่นทั้งหมดได้ผลเท่าเดิม (ดู before.md และ after.md)

| แถว | ประตู | กรณี | ผู้ทำ | ก่อนแก้ | หลังแก้ |
|---|---|---|---|---|---|
| C5 | `POST /api/provider/admin/user-groups/:userId` | กลุ่มกรมให้ผู้ขอรับรอง (L4) | system_admin_dtam | 200 · เปลี่ยน | 404 · ไม่เปลี่ยน |
| C6 | `POST /api/provider/admin/user-groups/:userId` | ให้กลุ่ม certificate_approver แก่ตัวเอง (L4) | system_admin_dtam | 200 · เปลี่ยน | 403 SELF_ROLE_CHANGE_FORBIDDEN · ไม่เปลี่ยน |
| F1 | `GET /api/provider/admin/work-config` | รายการกลุ่มผู้รับงาน มีการเงินบริษัทไหม (L3) | system_admin_dtam | 200 · มีการเงินบริษัท: ใช่ · finance_officer_dtam,finance_officer_platform,dispatcher,document_reviewer,field_inspector,system_admin_dtam | 200 · มีการเงินบริษัท: ไม่ · document_reviewer,dispatcher,field_inspector,certificate_approver,finance_officer_dtam,system_admin_dtam |
| F2 | `POST /api/provider/admin/work-config/stage-configs` | ส่งงานกรมให้การเงินบริษัท (L3) | system_admin_dtam | 200 · สร้างแล้ว | 400 WORK_GROUP_NOT_DTAM_STAFF · ไม่สร้าง |
| G1 | `GET /api/provider/work/my` | เห็นงานจัดคิวของกรม (M1) | finance_officer_platform (กลุ่ม system_admin_dtam ค้าง) | 200 · เห็นงาน | 200 · ไม่เห็นงาน |
| G2 | `GET /api/provider/work/queue?group=dispatcher` | เปิดคิวของ dispatcher (M1) | finance_officer_platform (กลุ่ม system_admin_dtam ค้าง) | 200 · เห็นงาน | 403 · ไม่เห็นงาน |
| G3 | `GET /api/provider/work/:id` | อ่านงานจัดคิวของกรม (M1) | finance_officer_platform (กลุ่ม system_admin_dtam ค้าง) | 200 · เห็นงาน | 403 · ไม่เห็นงาน |
| G4 | `POST /api/provider/work/:id/claim` | รับงานจัดคิวของกรม (M1) | finance_officer_platform (กลุ่ม system_admin_dtam ค้าง) | 200 · รับงานแล้ว | 400 · ไม่ได้รับงาน |
