# การเดินประตูจริงหลังแก้ (606662a0a)

เซลล์ = สถานะ HTTP · รหัส · ผลต่อแถวในฐานข้อมูล (· = ไม่ได้เดินกรณีนั้นด้วยผู้ทำคนนี้)

| แถว | ประตู | กรณี | system_admin_dtam | system_admin_platform | finance_officer_platform (มีกลุ่ม system_admin_dtam ค้าง) |
|---|---|---|---|---|---|
| A1 | `POST /api/admin/users/provider` | สร้างเจ้าหน้าที่กรม (dispatcher) | 201 · สร้างแล้ว | 403 · ไม่สร้าง | 403 · ไม่สร้าง |
| A2 | `POST /api/admin/users/provider` | สร้างการเงินบริษัท | 403 CROSS_SIDE_USER_CHANGE_FORBIDDEN · ไม่สร้าง | 403 · ไม่สร้าง | 403 · ไม่สร้าง |
| A3 | `POST /api/admin/users/provider` | สร้างโดยไม่ระบุบทบาท | 400 · ไม่สร้าง | 403 · ไม่สร้าง | 403 · ไม่สร้าง |
| A4 | `PATCH /api/admin/users/:id/role` | เจ้าหน้าที่กรม → field_inspector | 200 · เปลี่ยน | 403 · ไม่เปลี่ยน | 403 · ไม่เปลี่ยน |
| A5 | `PATCH /api/admin/users/:id/role` | การเงินบริษัท → ปิดบัญชี | 403 CROSS_SIDE_USER_CHANGE_FORBIDDEN · ไม่เปลี่ยน | 403 · ไม่เปลี่ยน | 403 · ไม่เปลี่ยน |
| A6 | `PATCH /api/admin/users/:id/disable` | เจ้าหน้าที่กรม | 200 · เปลี่ยน | 403 · ไม่เปลี่ยน | 403 · ไม่เปลี่ยน |
| A7 | `PATCH /api/admin/users/:id/disable` | การเงินบริษัท | 403 CROSS_SIDE_USER_CHANGE_FORBIDDEN · ไม่เปลี่ยน | 403 · ไม่เปลี่ยน | 403 · ไม่เปลี่ยน |
| A8 | `PATCH /api/admin/users/:id/enable` | การเงินบริษัทที่ถูกปิด | 403 CROSS_SIDE_USER_CHANGE_FORBIDDEN · ไม่เปลี่ยน | 403 · ไม่เปลี่ยน | 403 · ไม่เปลี่ยน |
| A9 | `PATCH /api/admin/users/:id/change-role` | เจ้าหน้าที่กรม → certificate_approver | 200 · เปลี่ยน | 403 · ไม่เปลี่ยน | 403 · ไม่เปลี่ยน |
| A10 | `PATCH /api/admin/users/:id/change-role` | การเงินบริษัท → dispatcher | 403 CROSS_SIDE_USER_CHANGE_FORBIDDEN · ไม่เปลี่ยน | 403 · ไม่เปลี่ยน | 403 · ไม่เปลี่ยน |
| B1 | `PUT /api/admin/user-permissions/:id/:permission` | ให้สิทธิ์เจ้าหน้าที่กรม | 200 · เปลี่ยน | 403 · ไม่เปลี่ยน | 403 · ไม่เปลี่ยน |
| B2 | `PUT /api/admin/user-permissions/:id/:permission` | ถอนสิทธิ์การเงินบริษัท | 403 CROSS_SIDE_USER_CHANGE_FORBIDDEN · ไม่เปลี่ยน | 403 · ไม่เปลี่ยน | 403 · ไม่เปลี่ยน |
| B3 | `DELETE /api/admin/user-permissions/:id/:permission` | คืนค่าสิทธิ์การเงินบริษัท | 403 CROSS_SIDE_USER_CHANGE_FORBIDDEN · ไม่เปลี่ยน | 403 · ไม่เปลี่ยน | 403 · ไม่เปลี่ยน |
| C1 | `GET /api/provider/admin/user-groups/:userId` | อ่านกลุ่มของเจ้าหน้าที่กรม | 200 · อ่านได้ | 403 · อ่านไม่ได้ | 403 · อ่านไม่ได้ |
| C2 | `POST /api/provider/admin/user-groups/:userId` | กลุ่ม dispatcher ให้เจ้าหน้าที่กรม | 200 · เปลี่ยน | 403 · ไม่เปลี่ยน | 403 · ไม่เปลี่ยน |
| C3 | `POST /api/provider/admin/user-groups/:userId` | กลุ่มการเงินบริษัทให้เจ้าหน้าที่กรม | 403 CROSS_SIDE_USER_CHANGE_FORBIDDEN · ไม่เปลี่ยน | 403 · ไม่เปลี่ยน | 403 · ไม่เปลี่ยน |
| C4 | `POST /api/provider/admin/user-groups/:userId` | กลุ่มกรมให้การเงินบริษัท | 403 CROSS_SIDE_USER_CHANGE_FORBIDDEN · ไม่เปลี่ยน | 403 · ไม่เปลี่ยน | 403 · ไม่เปลี่ยน |
| C5 | `POST /api/provider/admin/user-groups/:userId` | กลุ่มกรมให้ผู้ขอรับรอง (L4) | 404 · ไม่เปลี่ยน | 403 · ไม่เปลี่ยน | 403 · ไม่เปลี่ยน |
| C6 | `POST /api/provider/admin/user-groups/:userId` | ให้กลุ่ม certificate_approver แก่ตัวเอง (L4) | 403 SELF_ROLE_CHANGE_FORBIDDEN · ไม่เปลี่ยน | 403 · ไม่เปลี่ยน | 403 · ไม่เปลี่ยน |
| C7 | `DELETE /api/provider/admin/user-groups/:userId/:groupCode` | ถอดกลุ่มของการเงินบริษัท | 403 CROSS_SIDE_USER_CHANGE_FORBIDDEN · ไม่เปลี่ยน | 403 · ไม่เปลี่ยน | 403 · ไม่เปลี่ยน |
| D1 | `POST /api/provider/directory` | สร้างเจ้าหน้าที่กรม (dispatcher) | 201 · สร้างแล้ว | 403 CROSS_SIDE_USER_CHANGE_FORBIDDEN · ไม่สร้าง | 403 · ไม่สร้าง |
| D2 | `POST /api/provider/directory` | สร้างการเงินบริษัท | 403 CROSS_SIDE_USER_CHANGE_FORBIDDEN · ไม่สร้าง | 201 · สร้างแล้ว | 403 · ไม่สร้าง |
| D3 | `POST /api/provider/directory` | สร้างโดยไม่ระบุบทบาท (L1) | 400 · ไม่สร้าง | 400 · ไม่สร้าง | 403 · ไม่สร้าง |
| D4 | `PATCH /api/provider/directory/:id` | เจ้าหน้าที่กรม → field_inspector | 200 · เปลี่ยน | 403 CROSS_SIDE_USER_CHANGE_FORBIDDEN · ไม่เปลี่ยน | 403 · ไม่เปลี่ยน |
| D5 | `PATCH /api/provider/directory/:id` | ปิดบัญชีการเงินบริษัท | 403 CROSS_SIDE_USER_CHANGE_FORBIDDEN · ไม่เปลี่ยน | 200 · เปลี่ยน | 403 · ไม่เปลี่ยน |
| D6 | `PUT /api/provider/directory/:id` | แก้ชื่อการเงินบริษัท | 403 CROSS_SIDE_USER_CHANGE_FORBIDDEN · ไม่เปลี่ยน | 200 · เปลี่ยน | 403 · ไม่เปลี่ยน |
| D7 | `POST /api/provider/directory/:id/unlock` | ปลดล็อกการเงินบริษัท | 403 CROSS_SIDE_USER_CHANGE_FORBIDDEN · ไม่เปลี่ยน | 200 · เปลี่ยน | 403 · ไม่เปลี่ยน |
| D8 | `DELETE /api/provider/directory/:id` | ลบการเงินบริษัท | 403 CROSS_SIDE_USER_CHANGE_FORBIDDEN · ไม่เปลี่ยน | 200 · เปลี่ยน | 403 · ไม่เปลี่ยน |
| D9 | `PATCH /api/provider/directory/:id` | ปิดบัญชีผู้ดูแลแพลตฟอร์มอีกคน (ยังเหลือผู้ทำ) (I3) | 403 CROSS_SIDE_USER_CHANGE_FORBIDDEN · ไม่เปลี่ยน | 200 · เปลี่ยน | 403 · ไม่เปลี่ยน |
| D10 | `DELETE /api/provider/directory/:id` | ลบเจ้าหน้าที่กรม | 200 · เปลี่ยน | 403 CROSS_SIDE_USER_CHANGE_FORBIDDEN · ไม่เปลี่ยน | 403 · ไม่เปลี่ยน |
| E1 | `POST /api/platform-admin/organizations/:id/users` | สร้างการเงินบริษัท | 403 AUTHORIZATION_ERROR · ไม่สร้าง | 201 · สร้างแล้ว | 403 AUTHORIZATION_ERROR · ไม่สร้าง |
| E2 | `POST /api/platform-admin/organizations/:id/users` | สร้างผู้ดูแลกรม | 403 AUTHORIZATION_ERROR · ไม่สร้าง | 403 CROSS_SIDE_USER_CHANGE_FORBIDDEN · ไม่สร้าง | 403 AUTHORIZATION_ERROR · ไม่สร้าง |
| F1 | `GET /api/provider/admin/work-config` | รายการกลุ่มผู้รับงาน มีการเงินบริษัทไหม (L3) | 200 · มีการเงินบริษัท: ไม่ · document_reviewer,dispatcher,field_inspector,certificate_approver,finance_officer_dtam,system_admin_dtam | 403 · - | 403 · - |
| F2 | `POST /api/provider/admin/work-config/stage-configs` | ส่งงานกรมให้การเงินบริษัท (L3) | 400 WORK_GROUP_NOT_DTAM_STAFF · ไม่สร้าง | 403 · ไม่สร้าง | 403 · ไม่สร้าง |
| F3 | `POST /api/provider/admin/work-config/stage-configs` | ส่งงานกรมให้ dispatcher | 200 · สร้างแล้ว | 403 · ไม่สร้าง | 403 · ไม่สร้าง |
| G1 | `GET /api/provider/work/my` | เห็นงานจัดคิวของกรม (M1) | 200 · เห็นงาน | 200 · ไม่เห็นงาน | 200 · ไม่เห็นงาน |
| G2 | `GET /api/provider/work/queue?group=dispatcher` | เปิดคิวของ dispatcher (M1) | 200 · เห็นงาน | 403 · ไม่เห็นงาน | 403 · ไม่เห็นงาน |
| G3 | `GET /api/provider/work/:id` | อ่านงานจัดคิวของกรม (M1) | 200 · เห็นงาน | 403 · ไม่เห็นงาน | 403 · ไม่เห็นงาน |
| G4 | `POST /api/provider/work/:id/claim` | รับงานจัดคิวของกรม (M1) | 200 · รับงานแล้ว | 400 · ไม่ได้รับงาน | 400 · ไม่ได้รับงาน |
