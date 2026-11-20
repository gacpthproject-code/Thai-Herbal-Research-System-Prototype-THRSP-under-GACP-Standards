# แก้ 4 ข้อจากการเดิน staging 93982350f (fix/a8-walk-findings-3)

สาขาจาก main 93982350f · Tier B (`scripts/probes/tier-check.sh origin/main` = B) · ไม่มี migration ไม่แตะเงิน

## ต้นเหตุและการแก้

| ข้อ | ต้นเหตุ | แก้ |
|---|---|---|
| PD-02 หน้าผู้ถือขึ้น "บันทึกแล้ว" สีเขียวทั้งที่ลบช่องบังคับ | ประตู `GET /entities/:id` ส่ง `holder.missing` และ `holder.complete` อยู่แล้ว (`presentHolder` → `missingHolderFields(readHolder(...))` กติกาเดียวกับประตูยื่นและประตูออกใบ) แต่หน้า `health/holders/[id]` ไม่อ่าน | หน้าแสดงกล่องเตือน "ข้อมูลผู้ถือยังไม่ครบ ยังขาด ..." ทั้งตอนเปิดและหลังบันทึก · หลังบันทึกที่ยังไม่ครบขึ้น "บันทึกแล้ว แต่ข้อมูลผู้ถือยังไม่ครบ" สีเหลือง · ยังบันทึกบางส่วนได้เหมือนเดิม ไม่มีกติกาซ้ำในเว็บ |
| F-A8-14 นัดชนคำขอที่ตรวจไม่ผ่านแล้วได้ 409 ภาษาอังกฤษ | ประตูปฏิทินมีตัวเช็คชนของตัวเอง (`findAuditorScheduleCandidates` + `hasScheduleCollision`) ที่นับทุกสถานะยกเว้น REJECTED/CANCELLED และตอบ `'Auditor schedule collision detected'` ก่อนถึงตัวเช็คกลาง `_assertSlotAvailable` · ตัวเช็คกลางเองก็นับ AUDIT_NOT_PASSED, CAR_*, AUDIT_PASSED · `answerRefusal` ส่ง `error.message` ภาษาอังกฤษ | ลบตัวเช็คซ้ำทั้งชุด · ตัวเช็คกลาง เพดานต่อวัน และปฏิทินว่างของผู้ตรวจนับเฉพาะ `AUDIT_CONFIRMED` (นัดที่ยังไม่บันทึกผล) · คำตอบปฏิเสธใช้ `messageTh` · ข้อความ AUDITOR_BUSY/OVER_CAP บอกเหตุและทางไปต่อ |
| F-A8c-13 กล่องความคืบหน้ายังขึ้นตรวจเอกสาร "กำลังดำเนินการ" หลังผ่าน | `completeLeftStageWork` ปิดเฉพาะงาน SCHEDULING ของขั้นที่ออก งาน DOC_REVIEW / FIELD_AUDIT / CAR_REVIEW ปิดได้ทางเดียวคือเจ้าหน้าที่กด "ส่งงาน" ซึ่งไม่มีใครกด | ออกจากขั้นแล้วงานที่เปิดอยู่ทุกงานของขั้นนั้นเป็น DONE โดยคนที่พาคำขอออก · รอบแก้ไขใหม่เปิดงานตรวจเอกสารรอบใหม่ |
| F-A8b-06 ใบงานผู้ตรวจพิมพ์ "kratom" | กล่องสรุปคำขออ่าน `formData.plantName \|\| formData.plantId` ตรง ๆ · ประเภทพื้นที่และจังหวัดอ่านคีย์ที่แบบคำขอไม่มีจึงขึ้น "-" | `GET /api/provider/applications/:id` ส่ง `scope { plantName, cultivationTypes, province }` ชื่อพืชจาก `filingPlantName` (ทะเบียนสมุนไพร `plant_species` ชุดเดียวกับใบรับรองและแฟ้มตัดสิน) · ทะเบียนไม่รู้จัก = "ไม่ได้บันทึก" |

## หลักฐาน

| ไฟล์ | อะไร |
|---|---|
| `red-backend.txt` | ก่อนแก้: `staff-doors-walk-findings-real-postgres.test.js` 12/12 ล้มบน Postgres จริง |
| `red-holder-page.txt` · `red-worksheet.txt` | ก่อนแก้: เทสต์หน้าผู้ถือ 3/3 ล้ม · เทสต์ใบงาน 2/2 ล้ม |
| `mutation-check.txt` | คืนชุดสถานะเดิมของตัวเช็คกลาง: 4 ข้อของ F-A8-14 ล้ม · คืนการปิดเฉพาะ SCHEDULING: 3 ข้อของ F-A8c-13 ล้ม |
| `green-related-backend.txt` | หลังแก้: 85 ชุดที่แตะไฟล์ที่เปลี่ยน · 1519 ผ่าน 47 ล้มใน 2 ชุด (approver-decision-tools 44, holder-record 3) ซึ่งล้มเท่ากันบน main 93982350f (`main-approver-decision-tools.txt` 44 ล้ม; holder-record 3 ล้มบน main รันในเซสชันนี้) |
| `green-web.txt` | เว็บ: holders, provider/audits, provider/calendar, step2 = 35 ชุด 146 ผ่าน · eslint ไฟล์ที่แตะไม่มี error |
| `walk/before-run.txt` + `screenshots/before-*.png` | main 93982350f ในเบราว์เซอร์: บันทึกเบอร์ว่างได้ "บันทึกแล้ว" อย่างเดียว · กล่องความคืบหน้าขึ้นตรวจเอกสารกำลังดำเนินการหลัง DOC_APPROVED · นัดทับคำขอ AUDIT_NOT_PASSED ได้ 409 "Auditor schedule collision detected" · ใบงาน "พืช kratom ประเภทพื้นที่ - จังหวัด -" |
| `walk/after-run.txt` + `screenshots/after-*.png` | สาขา e122c4e65: กล่องเตือนช่องที่ขาด "โทรศัพท์" ทั้งหลังบันทึกและหลังโหลดใหม่ · ตรวจเอกสารใบสมัคร "เสร็จสิ้น" · นัดเดียวกันได้ 201 AUDIT_CONFIRMED · ใบงาน "พืช กระท่อม ประเภทพื้นที่ กลางแจ้ง จังหวัด นนทบุรี" |

ขั้นตรวจเอกสารผ่านใน walk เขียนด้วย `writeApplicationStatus` โดยผู้ตรวจเอกสาร (`walk/advance.js`) ซึ่งเป็นตัวเขียนสถานะที่ประตูตรวจเอกสารใช้ ไม่ได้กดผ่านหน้าตรวจเอกสารรายฉบับ · ข้อความ 409 ภาษาไทยของนัดที่ยังกันช่องจริง (AUDIT_CONFIRMED) พิสูจน์ด้วยเทสต์ที่ยิงประตู HTTP บน Postgres จริง ไม่ได้ถ่ายภาพ

walk ทั้งสองขาใช้ next dev + backend จากต้นไม้ที่ระบุ บน Postgres ทิ้งได้ `walkfix3-db` และ key ลงนามชั่วคราวใน /tmp ไม่แตะ staging หรือ demo

## สิ่งที่ไม่ได้แก้ในรอบนี้

- งาน DOC_REVIEW / FIELD_AUDIT / CAR_REVIEW ที่ค้างเปิดอยู่แล้วบน staging (เช่น APP-2569-MVUC4COL-789F69) ยังขึ้นกำลังดำเนินการ การแก้นี้ปิดเฉพาะงานของการเปลี่ยนสถานะครั้งถัดไป ล้างของเก่าต้องเป็นสคริปต์ข้อมูลแยก
- เพดานนัดต่อวันตอนนี้นับเฉพาะนัดที่ยังไม่บันทึกผล นัดที่ผู้ตรวจบันทึกผลแล้วในวันเดียวกันไม่นับรวม
- หน้าสลับผู้ตรวจ (`scheduler/reassign`, `scheduler/reviewer-reassign`) และรายการคำขอฝั่งเจ้าหน้าที่ยังส่งรหัสพืช (`resolvePlantType`, `audits-reassign.js`) เป็นข้อบกพร่องชนิดเดียวกับ F-A8b-06 ที่ยังเหลือ

## รันซ้ำ (ใต้ `~/work/state/heavy.sh`)
- walk: `LABEL=after evidence/a8-walk-findings-3/walk/run.sh` · ขา before เพิ่ม `TREE=<checkout ของ main>`
- เทสต์ DB: `DATABASE_URL=TEST_DATABASE_URL=<postgres ที่ migrate แล้ว> npx jest --config jest.config.cjs __tests__/integration/staff-doors-walk-findings-real-postgres.test.js -i`

## gate
- `gate-locked.sh 6c58114eb` แล้ว `compare.sh`: ใหม่หนึ่งชุด `error-codes-source-pointers` เพราะตัวชี้ใน `error-codes.js` ถูก remap ก่อนลบคอมเมนต์ แก้ใน 5b8bc77bc (remap ครั้งเดียวจากค่าของ main) เทสต์นี้ผ่าน 5/5
- `gate-locked.sh 5b8bc77bc` แล้ว `compare.sh`: 1209 ชุด 15865 ผ่าน 19 ล้มใน 4 ชุด · สามชุด (a0-pr2-per-hop-invariant, onsite-decision-mint-e2e, status-writer-audit-default-invariant) ล้มบน gate ของ main 110d5ed96 เหมือนกัน · ชุดที่สี่ `finance-paper-text-inside-print-margin` ล้มด้วย `TimeoutError: Navigation timeout of 30000 ms exceeded` ของ Chromium ระหว่าง gate · รันซ้ำเดี่ยวใต้ heavy.sh บนหัวเดียวกันผ่าน 12/12 (`gate-rerun-finance-paper.txt`) และสาขานี้ไม่แตะ PDF หรือ template เอกสารการเงิน จึงนับเป็นความล้มเหลวจากโหลดเครื่อง ไม่ใช่ความล้มเหลวใหม่
- gitleaks ใหม่ของสาขานี้ 8 รายการ อยู่ใน commit 6c58114eb ไฟล์ `green-related-backend.txt` และ `main-approver-decision-tools.txt` เป็น `dedupeKey` ของการแจ้งเตือน (sha256 hex ของคีย์กันแจ้งซ้ำ ไม่ใช่ค่าลับ) ไฟล์ปัจจุบันปิดเป็น `[hash]` แล้ว แต่ยังอยู่ในประวัติ commit นั้น · ที่เหลือเป็นของ evidence สาขาอื่น (payment-trial-marking, issuance-holder-complete, renewal-keeps-farm)

## รอบแก้ 1 ตามรีวิว (หัวโค้ด e3ed6da89)

| ข้อ | ต้นเหตุ | แก้ |
|---|---|---|
| I1 นัดชนวัดนัดเดิมด้วยความยาวของนัดใหม่ | `_assertSlotAvailable` คิดเวลาจบของนัดเดิมจาก `durationMinutes` ของการจองใหม่ | ตัวหานัดของวัน (`_findAuditorVisitsOnDate`) อ่าน `formData.auditSchedule.estimatedDuration` ของแต่ละนัด ไม่มีค่า = 120 นาที แล้ววัดนัดเดิมด้วยความยาวของมันเอง |
| M1 เพดานต่อวันเลิกนับนัดที่บันทึกผลแล้ว | สาขานี้เปลี่ยนชุดสถานะของตัวเช็คกลางเป็น AUDIT_CONFIRMED อย่างเดียว ทั้งการชนและเพดาน | เพดานนับชุดเดิมก่อนสาขานี้ (ทุกสถานะยกเว้น REJECTED, CANCELLED, APPROVED, CERTIFIED) การชนเวลานับเฉพาะ AUDIT_CONFIRMED · ปฏิทินว่าง (`overCapDays`) นับวันเต็มด้วยเงื่อนไขเดียวกันผ่าน `auditorVisitsBetween` ส่วน `busySlots` ยังเป็นนัดที่กันช่องจริงเท่านั้น |
| M2 งานที่ปิดตอนออกจากขั้นให้เครดิตคนพาคำขอออกทุกงาน | `completeLeftStageWork` เขียน `completedBy` = ผู้เปลี่ยนสถานะทุกงาน | ให้เครดิตเฉพาะงานที่ `candidateGroup` ตรงกับบทบาทของผู้เปลี่ยนสถานะ งานกลุ่มอื่นปิดด้วย `completedBy` null แบบเดียวกับที่ระบบปิด |
| M3 หน้าผู้ถือ `holder.missing.map` | คำตอบที่ไม่มี `missing` ทำให้หน้าพัง | `(holder.missing ?? [])` |
| เทสต์การเงิน | ไม่มีเทสต์ยืนยันว่าบทบาทการเงินไม่ได้ `scope` | เพิ่มเทสต์ทั้งสองบทบาทการเงินบน Postgres จริง |

ทางเดินของผู้ยื่นใน M2 ที่ coordinator ยกตัวอย่าง (ผู้ยื่นส่งแก้แล้วปิดงาน DOC_REVIEW) ไม่เกิดจริงตาม `stage_activity_configs` ปัจจุบัน เพราะงาน DOC_REVIEW ปิดตอนผู้ตรวจเอกสารออกจาก ASSIGNED_FOR_REVIEW และไม่มีงานที่เปิดที่ REVISION_REQUESTED · เทสต์จึงใช้กรณีที่เกิดจริง คือผู้ตรวจพื้นที่ย้อนผลตัวเอง AUDIT_PASSED→CAR_REVIEWING ซึ่งปิดงาน FINAL_APPROVAL ของผู้อนุมัติ

| ไฟล์ | อะไร |
|---|---|
| `red-fix-round-1-backend.txt` | ก่อนแก้ (หัว bdd0a8313 + เทสต์ใหม่) 3/18 ล้ม: นัด 4 ชั่วโมงไม่กัน 12:00 · เพดานไม่นับนัดที่ตัดสินแล้ว · งาน FINAL_APPROVAL ได้เครดิตเป็นผู้ตรวจพื้นที่ · เทสต์การเงินผ่านตั้งแต่ก่อนแก้ (เป็นเทสต์กันถอย) |
| `red-fix-round-1-holder-page.txt` | ก่อนแก้: คำตอบที่ไม่มี `missing` ทำหน้าพัง TypeError 1/4 ล้ม |
| `green-fix-round-1-backend.txt` · `green-fix-round-1-holder-page.txt` | หลังแก้: 5 ชุด 99 ผ่าน (รวม error-codes-source-pointers) · หน้าผู้ถือ 4/4 |
| `mutation-fix-round-1.txt` | ย้อนแต่ละการแก้ทีละจุด: I1 ล้ม 1 · เพดานนับเฉพาะ AUDIT_CONFIRMED ล้ม 1 · การชนนับนัดที่ตัดสินแล้วล้ม 4 · เครดิตทุกงานล้ม 1 · ถอดทางแยกการเงินล้ม 2 |
| `related-fix-round-1-backend.txt` | `--findRelatedTests` ของสามไฟล์ service: 229 ชุด 3386 ผ่าน 7 ล้มใน 3 ชุด (a0-pr2-per-hop-invariant, onsite-decision-mint-e2e, status-writer-audit-default-invariant) ซึ่งล้มบน gate ของ main 110d5ed96 เหมือนกัน |

สภาพแวดล้อม: Prisma client ที่ใช้ร่วมใน checkout หลักสร้างไว้ 2026-10-09 ไม่มี `Entity.identitySource` ประตูรายละเอียดของการเงินจึงตอบ 500 เมื่อรันเทสต์ด้วย client นั้น · รอบนี้ให้ worktree มี `@prisma/client` + `.prisma` ของตัวเอง generate จาก schema ของสาขา ไม่แตะ client ที่ใช้ร่วม

gate รอบแก้ 1: `gate-locked.sh e3ed6da89` แล้ว `compare.sh` · 1209 ชุด 15883 ผ่าน 7 ล้มใน 3 ชุด · ไม่มีความล้มเหลวใหม่เทียบ gate ของ main 110d5ed96 (สามชุดเดิม a0-pr2-per-hop-invariant, onsite-decision-mint-e2e, status-writer-audit-default-invariant) · gitleaks ไม่มีรายการใหม่จาก commit ของรอบนี้ (8 รายการของสาขายังเป็น dedupeKey ใน 6c58114eb ตามเดิม)
