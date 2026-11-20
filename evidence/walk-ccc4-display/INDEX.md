# หลักฐาน fix/walk-ccc4-display (ข้อพบจากการเดิน staging ccc4f707d)

ถ่ายจาก stack scratch บนเครื่องนี้ผ่าน heavy.sh วันที่ 2026-11-03 (PG17 + Redis + backend NODE_ENV=production + `next dev` + Chromium ตัวเดียว · สคริปต์ที่ `~/work/state/reviews/walk-ccc4-runs/bin/`) · ไม่แตะ staging หรือ demo · ฐานข้อมูลใหม่ทุกรอบ ข้อมูลทดสอบสร้างด้วย `fixtures.js` (ผู้ยื่น 2 บัญชี เจ้าหน้าที่ 3 บทบาท คำขอ 4 สถานะ ใบรับรอง 2 ใบ) แล้วเดินผ่านหน้าเว็บจริงด้วย `shoot.js`

- `screenshots/before/` ถ่ายจากต้น main 119da7136 (worktree แยก) · `screenshots/after/` ถ่ายจาก working tree ของกิ่งนี้ก่อน commit (ส่วนต่างหลังถ่าย: เปลี่ยนชื่อฟิลด์ภายใน `serviceType` เป็น `requestTypeTh`, ตัด fallback ปฏิทินของตัวนับวันแก้ไข, ชนิดของ `blockingIssues` ใน hook, และการตัดคอมเมนต์ · ไม่มีข้อใดเปลี่ยนสิ่งที่เห็นบนจอในภาพชุดนี้)
- จอคอม 1440×900 จอมือถือ 390×844 · ชื่อและเลข 13 หลักถูกปิดใน DOM ก่อนถ่าย · ข้อมูลทุกตัวเป็นข้อมูลทดสอบที่สร้างขึ้น
- `net.jsonl` ของแต่ละรอบ (ใน `~/work/state/reviews/walk-ccc4-runs/<phase>/`) บันทึก pageerror ทุกตัว, HTTP 4xx/5xx ทุกตัว และ POST `/api/applications/draft` ทุกครั้ง · รอบ after ไม่มี pageerror ไม่มี HTTP ≥ 400
- F6 (edge 520/524) อยู่นอกขอบเขต

| ข้อ | before (แดง) | after (เขียว) | สิ่งที่ operator ควรเห็น |
|---|---|---|---|
| F1 | `before/F01-official-docs-desk.png` การ์ดใบรับรองขึ้น "undefined — undefined" ป้าย "renewed" ภาษาอังกฤษ | `after/F01-official-docs-desk.png`, `after/F01-official-docs-phone.png` | ชื่อแปลง · พืช ("แปลงทดสอบ wc4 · ขมิ้นชัน") ป้าย "ต่ออายุแล้ว" / "กำลังใช้งาน" |
| F2 | `before/F02-provider-detail-reviewer-desk.png`, `before/F02-provider-detail-dtam-admin-desk.png` พืช "turmeric" ป้าย "INDIVIDUAL" ที่ตั้งฟาร์ม "-" ประเภทบริการ "-" แผนการผลิต "-" ทุกช่อง | `after/F02-provider-detail-reviewer-desk.png`, `after/F02-provider-detail-dtam-admin-desk.png` | พืช "ขมิ้นชัน" จังหวัด ชื่อแปลง ที่อยู่ ขนาด 1,600 ตร.ม. ประเภทคำขอ "ขอใหม่" การ์ด "ข้อมูลการปลูกตามคำขอ" แสดงเฉพาะข้อที่ผู้ยื่นกรอก ไม่มีป้ายประเภทผู้ยื่นภาษาอังกฤษ |
| F3 | `before/F03-kortorlor1-preview-dark.png` ตัวอย่าง กทล.1 โหมดมืดเป็นตัวหนังสือเข้มบนพื้นมืด | `after/F03-kortorlor1-preview-dark.png`, `after/F03-wizard-step6-desk-dark.png`, `after/F03-wizard-step6-desk-light.png` | แบบฟอร์มอยู่บนพื้นกระดาษขาวทั้งสองธีม อ่านได้ |
| F4 | `before/F04-applications-desk.png`, `before/F04-applications-phone.png` ชื่อฟาร์ม "-" ร่างขึ้น "ยื่นเมื่อ <วันสร้าง>" | `after/F04-applications-desk.png`, `after/F04-applications-phone.png` | ชื่อแปลงบนทุกการ์ด ร่างขึ้น "ยังไม่ได้ยื่น" คำขอที่ยื่นแล้วขึ้นวันที่ยื่นจริง |
| F5 | `before/F05-provider-applications-desk.png` คอลัมน์พืช "turmeric" | `after/F05-provider-applications-desk.png` | คอลัมน์พืช "ขมิ้นชัน" จากทะเบียนพืช |
| F7 | `before/F07-revision-desk.png` "(อีก 8 วัน)" นับวันปฏิทิน · `before/F04-*` ไม่มีตัวนับที่ตรงกับผู้จัดคิว | `after/F07-revision-desk.png`, `after/F04-applications-phone.png` | ทั้งสองหน้าบอก "เหลือ 6 วันทำการ" (กำหนด 11 พ.ย. 2569 จากวันจันทร์ 3 พ.ย. = 8 วันปฏิทิน 6 วันทำการ) นับโดยเซิร์ฟเวอร์ด้วยปฏิทินวันหยุดชุดเดียวกับผู้จัดคิว |
| F8 | `before/F08-provider-certificates-desk.png` ป้าย "renewed" | `after/F08-provider-certificates-desk.png` | ป้าย "ต่ออายุแล้ว" / "กำลังใช้งาน" |
| F9 | `before/F09-system-settings-desk.png` หัวกลุ่ม "undefined" คำอธิบายอังกฤษ | `after/F09-system-settings-desk.png` | หัวกลุ่มไทย (เลขที่ใบรับรอง · ข้อมูลติดต่อ · หน้าจอและเครื่องมือของผู้ยื่น · การสมัครและการเข้าใช้ · บริการที่เปิดให้ยื่น) คำอธิบายไทยทุกแถว |
| F10 | `before/F10-expired-desk.png` โหลดได้ ไม่เกิด pageerror บน stack นี้ | `after/F10-expired-desk.png` ไม่เกิด pageerror | ยังทำซ้ำอาการ React #418 ของ staging ไม่ได้บนเครื่องนี้ (next dev รายงาน hydration mismatch ทุกตัวเป็น console error · รอบนี้ 0 รายการ) · สถานะ PENDING ดูรายงาน |
| F11 | `before/F11-draft-posts.json` เปิดดูขั้น 1→6 โดยไม่แก้อะไร ส่ง POST draft 5 ครั้ง (ทุกขั้นที่เข้า) | `after/F11-draft-posts.json` 0 ครั้ง · `after/F11-b-step1-after-new-desk.png` | การเปลี่ยนขั้นไม่ส่งบันทึก · กรณี "ยังไม่เลือกผู้ถือ" (400 บน staging) พิสูจน์ด้วย unit test เพราะบัญชีทดสอบบนเครื่องนี้มีผู้ถือบุคคลธรรมดาตั้งแต่สมัคร จึงไม่เกิด 400 ทั้งสองรอบ |
| F12 | `before/F12-precheck-card-step2-crop.png` การ์ดที่มีข้อสังเกตพื้นเขียวเหมือนการ์ดเรียบร้อย | `after/F12-precheck-card-step2-crop.png`, `after/F12-precheck-card-step2-desk.png` | การ์ดที่มีข้อสังเกตเป็นพื้นการ์ดธรรมดาขอบเหลือง ต่างจากการ์ดเขียว (แนบแล้วไม่มีข้อสังเกต) และการ์ดพื้นเหลือง (ยังไม่แนบ) |
| F13 | `before/F13-b-step2-desk.png` ขั้น 2 ไม่มีช่องเอกสารและไม่บอกอะไร · `F13-requirements-before-after.jsonl` แถว before: slots 0, blockingIssues AREA_TYPE_UNREADABLE | `after/F13-b-step2-desk.png` · แถว after: slots 11, blockingIssues ว่าง | ขั้น 2 แสดงช่องเอกสารคุณสมบัติของผู้ถือบุคคลธรรมดาตั้งแต่ครั้งแรก แม้ผู้ถือยังกรอกไม่ครบ · ถ้าเซิร์ฟเวอร์ตอบว่าตัดสินไม่ได้ หน้าจะพิมพ์เหตุผลแทนการเงียบ |

ผลเทสต์ (รันบนกิ่งนี้ ไม่ใช่ชุดเต็ม): เทสต์ใหม่ 14 ไฟล์ แดงก่อนแก้ทุกไฟล์ (F3 และ F13-backend พิสูจน์แดงบนต้น main ใน worktree แยก) · โฟลเดอร์ข้างเคียงฝั่งเว็บ 73 ไฟล์ 670 ข้อผ่าน · ฝั่ง backend 49 ไฟล์ 611 ข้อผ่าน (หลังเพิ่ม `plantSpecies` ใน prisma จำลองของ h17) · `tsc --noEmit` ฝั่งเว็บ 0 error · eslint ไฟล์ที่แก้ 0 warning · เทสต์ที่แดงอยู่แล้วบน main และยังแดง: `resubmit-button-renders`, `application-step-page-url-skip-guard`

gitleaks ทั้งโฟลเดอร์: no leaks found

## รอบแก้ 1 (2026-11-03 หลังรีวิวอิสระ)

ถ่ายซ้ำบน stack scratch รอบ `after-r1b` (ชุดสคริปต์เดิม fixtures เดิม) จาก working tree ของกิ่งหลังแก้ตามรีวิว · รอบนี้ 0 pageerror 0 HTTP ≥ 400 (`~/work/state/reviews/walk-ccc4-runs/after-r1b/net.jsonl`)

| ข้อรีวิว | ก่อน (รอบแรก) | หลัง (รอบแก้ 1) | สิ่งที่ operator ควรเห็น |
|---|---|---|---|
| M1 | `after/F02-provider-detail-reviewer-desk.png` แถว "สิทธิในที่ดิน" พิมพ์รหัส "OWN" | `after-r1/F02-provider-detail-reviewer-desk.png`, `after-r1/F02-provider-detail-dtam-admin-desk.png` | แถว "สิทธิในที่ดิน" อ่านว่า "เป็นเจ้าของที่ดินเอง" (fixture เก็บคำสะกดเก่า `OWN`) · รหัสนอกรายการจะพิมพ์ "ค่าที่บันทึกไม่อยู่ในรายการ" ไม่พิมพ์รหัสอังกฤษ (พิสูจน์ด้วยเทสต์) |
| M5 | `after/F09-system-settings-desk.png` สวิตช์ทุกแถวรวมคีย์ STRING/JSON และสวิตช์ขึ้น "เปิด" ทุกแถวแม้ค่าที่เก็บเป็น `false` · คำอธิบาย `feature.permit_forms` มีข้อความภายในทีม | `after-r1/F09-system-settings-desk.png` | คีย์ STRING/JSON (`certificate.number.*`, `contact_support_phone`) แสดงค่าที่เก็บแบบอ่านอย่างเดียว ไม่มีสวิตช์ · สวิตช์ปิดจริงที่ `feature.export_documents` `feature.permit_forms` `marketing_banner_active` `system_maintenance_mode` · คำอธิบาย `feature.permit_forms` ไม่มีวงเล็บภายในทีม |
| I1 | หน้าแก้ไขเอกสารพิมพ์ "เหลือ N วันทำการ" ให้กำหนด CAR ที่เป็นวันปฏิทิน (fixture ของ stack นี้ไม่มีคำขอ CAR_PENDING จึงไม่มีภาพ) | เทสต์ route + หน้า: `requirements-counts-the-window-in-its-own-unit.test.js`, `revision-working-days.test.tsx` | CAR_PENDING ส่ง `calendarDaysLeft` (วันปฏิทินกรุงเทพ 30 วัน) และ `workingDaysLeft: null` หน้าพิมพ์ "เหลือ 30 วัน" · REVISION_REQUESTED ยังพิมพ์ "เหลือ N วันทำการ" |
