Task 15 view evidence. Real Next dev server on this tree, Chromium 390x844, backend mocked at the browser with page.route (no backend ran). Script was scratch, not committed.
| file | what to see |
|---|---|
| 01-step1-one-holder.png | one editable entity: fact line "ยื่นในนาม สมชาย ใจดี · ใบรับรองจะออกในนามนี้", no choice, link เพิ่มนิติบุคคลหรือวิสาหกิจชุมชน |
| 02-step1-three-holders.png | 4 memberships: personal first, ?holder=e-c preselected (green), community card with the "ผู้มีสิทธิ์ยื่นต้องเป็นผู้กดยื่น" note, VIEWER card greyed with "คุณมีสิทธิ์ดูอย่างเดียวในนามนี้" |
| 03a-chip-step2.png | chip on step 2: ยื่นในนาม บริษัท สมุนไพรไทย จำกัด + hint + ลบฉบับร่างนี้แล้วเริ่มใหม่ |
| 03-chip-confirm.png | after pressing the delete action: ยืนยันลบฉบับร่าง / ไม่ลบ |
| 04-farm-create-holder-field.png | farm-create form: holder field on top, company card chosen-able, community card disabled "คุณไม่มีสิทธิ์เพิ่มสถานที่ปลูกในนามนี้" |
NOT shown: the red "เกิดข้อผิดพลาด" card in 03*.png is step 2's own body failing against the mock API (every unmocked GET returns an empty list), not the chip. The bottom nav bar floating mid-page in 04 is a full-page-screenshot artifact of a fixed element. The list pages (holder chips, column) are covered by jest render tests only, no screenshot.
