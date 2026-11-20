# fix/member-role-and-draft-actions (2026-10-06)

ข้อบกพร่องสองข้อที่พบบน staging (main 8a2f801a)

## D3 — ปุ่มเชิญ "ผู้ดูแล (Admin)" ส่งคำบทบาทเจ้าหน้าที่

- สาเหตุ: commit 40f74080 (กวาดคำบทบาท 2026-09-10) เปลี่ยน `<option value="ADMIN">` ในหน้า
  `health/workspaces/[slug]/members/page.tsx` เป็น `system_admin_dtam` ซึ่งเป็นบทบาทเจ้าหน้าที่ ไม่ใช่บทบาทสมาชิก
  (OWNER/ADMIN/MANAGER/VIEWER) ประตู `POST /api/entities/:id/members` ตอบ 400 เจ้าของจึงเชิญผู้ดูแลไม่ได้
- ฝั่ง server ปฏิเสธคำบทบาทเจ้าหน้าที่อยู่แล้ว (400 ไม่เขียนอะไร) ไม่ใช่ข้อบกพร่องที่สอง เพิ่มเทสตรึงไว้
- กวาดทั้ง web และ mobile แล้ว ไม่มีจุดอื่นที่บทบาทสมาชิกถูกเปลี่ยนเป็นคำบทบาทเจ้าหน้าที่
- RED/GREEN: `d3-red.txt` · `d3-green.txt`

## D4 — ปุ่ม "ดำเนินการต่อ" / "ลบร่างคำขอนี้" แสดงกับทุกบทบาท

- ฝั่ง server ตรวจบน Postgres จริงแล้ว ปฏิเสธถูกต้อง: VIEWER แก้/ส่ง/ลบร่าง = 403 · MANAGER ส่ง = 403 ·
  MANAGER ลบร่างของคนอื่น = 403 · MANAGER แก้ร่าง = 200 (ตาม spec) · MANAGER ลบร่างที่ตัวเองสร้าง = 200 (เทสใหม่)
- web: ปุ่มต่อ = สมาชิกที่แก้ไขผู้ถือได้ (`can.edit` จาก /entities/mine) · ปุ่มลบ = OWNER ของผู้ถือ หรือผู้สร้างร่างที่ยังแก้ไขได้
  (กติกาเดียวกับ `holder-access.resolveHolderOwnerOrCreator`) · ผู้ถือที่ไม่อยู่ใน /entities/mine ไม่เห็นทั้งสองปุ่ม
- server ส่ง `submitterId` ในแถวรายการคำขอ เพื่อให้หน้าเว็บรู้ว่าใครสร้างร่าง
- RED/GREEN: `d4-web-red.txt` · `d4-web-green.txt` · `d4-server-red.txt`

## health-door-walk re-record

492 แถวเท่ากันทั้งสองฝั่ง ต่างกัน 6 แถว ทุกแถวมาจาก `submitterId` ในแถวรายการ (mapper เดียวกัน `mapHealthApplication`)

| แถว | เหตุผล |
|---|---|
| A /api/applications | +userA: แถว X/D/D2/Y ส่ง submitterId ของ A ผู้ยื่น |
| A /api/applications/my | +userA: mapper เดียวกับแถวบน |
| B /api/applications | +userA: แถวของ C ที่ A ยื่น B เป็น MANAGER ของ C |
| B /api/applications/my | +userA: mapper เดียวกับแถวบน |
| V /api/applications | +userA: แถวของ C ที่ A ยื่น V เป็น VIEWER ของ C |
| V /api/applications/my | +userA: mapper เดียวกับแถวบน |

ไม่ใช่ข้อมูลใหม่ที่หลุดออกไป: V และ B ได้ userA อยู่แล้วจาก `GET /api/entities/:id/members` (แถวนั้นใน fixture มีป้าย userA) ไม่มีแถวของ stranger S เปลี่ยน

## เลขบัตรในรายชื่อสมาชิก

server ปิดบังก่อนส่ง (`entity-service.listMembersForEntity` → `maskThaiId` รูปแบบ `8-XXXX-XXXX-X-4072`) เลข 13 หลักไม่ถึง browser
ตรึงเพิ่มบนประตูจริง Postgres จริง (holder-scope-real-postgres: "GET /entities/:id/members sends a peer national ID masked by the server")

## รอบสอง (ตามคำสั่ง coordinator 2026-10-06)

### หน้ารายละเอียดคำขอ: ปุ่มขั้นถัดไปตามสิทธิ์ของผู้ถือ

ปุ่มใน action card แสดงเฉพาะเมื่อประตูที่ปุ่มพาไปจะรับคำขอของผู้ใช้คนนี้
- CONTINUE_DRAFT ใช้ `can.edit` (POST /draft, /prepare)
- SUBMIT_REVISION และ SUBMIT_CAR_EVIDENCE ใช้ `can.submit` (revision-resubmit.js และ applications-car.js ถาม SUBMIT_APPLICATION)
- PAY_DOC_FEE และ PAY_AUDIT_FEE ใช้ `can.submit` (finance/payments.js /checkout และ quotations accept ถาม SUBMIT_APPLICATION)
- ผู้ถือที่ไม่อยู่ใน /entities/mine ไม่เห็นปุ่มใดเลย · DOWNLOAD_CERTIFICATE และ REAPPLY ไม่เปลี่ยน เพราะพาไปหน้าอ่านหรือคำขอใหม่

RED/GREEN: `detail-action-red.txt` (ล้ม 14 จาก 20) · `detail-action-green.txt` (20/20)
`renewal-detail-shows-the-renewal.test.tsx` เพิ่มผู้ถือที่จ่ายได้ เพราะเทสนั้นตรวจป้ายปุ่มชำระ

### ChangeRoleModal ใช้รายการบทบาทกลาง

เดิมมีแถว `finance_officer_platform` ซ้ำ (ป้าย "เลกาซี ACCOUNT") ใช้ `DOCUMENT_REVIEWER` และ `HEALTH` ตัวพิมพ์ใหญ่ และไม่มี `certificate_approver`
ตอนนี้ใช้ `ADMIN_ROLE_OPTIONS_FOR_NEW_USER` (8 คำ) ไม่รวม `system_admin_platform` เพราะ `changeUserRole` ปฏิเสธ 403 และไม่รวม `system` เพราะไม่ใช่คน
RED/GREEN: `change-role-red.txt` (ล้ม 4 จาก 9) · `change-role-green.txt`
