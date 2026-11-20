# คำศัพท์บทบาทสามฝั่ง — หลักฐาน 2026-09-10 (รอบที่สองของวัน)

Baseline: `40f74080` · Tier: **C** (auth/identity — `shared/canonical-rbac.js`)

## คำศัพท์ปลายทาง 10 คำ

| ฝั่ง | คำ |
|---|---|
| ผู้รับบริการ | `health` |
| กรม | `document_reviewer` · `dispatcher` · `field_inspector` · `certificate_approver` · `finance_officer_dtam` · `system_admin_dtam` |
| บริษัท | `finance_officer_platform` · `system_admin_platform` |
| ไม่ใช่คน | `system` |

`health` ไม่เปลี่ยน — operator ทักระหว่างทางว่าผมตีความเกินไป: `health`/`provider` อ้างอิง
หมอพร้อม (Health ID / Provider ID) ที่กระทรวงสาธารณสุขบังคับให้เชื่อมต่อในอนาคต ⇒ ถอน
`applicant` ออกทั้งหมด (40 ไฟล์) และเขียนคอมเมนต์กำกับไว้ทั้งสองฝั่งกันตีความใหม่

**ตัดขาดจากคำเก่า** ไม่มี alias ไม่มีคีย์ deprecated · `normalizeRole('admin')` คืน `null`
โดยเจตนา · ทำได้เพราะทั้งสามฐานถูกล้างและ seed ใหม่ในวันเดียวกัน

## ผลรัน

| ไฟล์ | ผล |
|---|---|
| `backend-suite.txt` | 819/819 suites · 10,382 tests · 0 แดง (31 skipped) |
| `web-suite.txt` | 378/378 suites · 3,072 tests · 0 แดง |
| `web-tsc.txt` | `tsc --noEmit` 0 error |
| `local-gate.txt` | 13 probe — เทียบ baseline เหมือนกันทุกตัว ยกเว้น `gate-attestation` |

`gate-attestation` แดงเพราะไม่มีไฟล์ attestation ของ commit ใหม่ (`evidence/gate/<sha>.json`)
ไม่ใช่เพราะเนื้อ diff — ตรงกับมติ "ไม่ทำ CI" · commit ใหม่ทุกใบจะแดงข้อนี้เหมือนกันหมด
`ratchet` PASS ตัวเลขเท่ากันเป๊ะ: `hardcode=25 todo=55 env-direct=114 dup-source=0`

เส้นทางของสวีตหลังบ้าน: **109 → 68 → 25 → 23 → 17 → 7 → 0 สวีตแดง** (เทสตก 773 → 0)

## เจ็ดจุดที่เป็นโค้ดพังจริง ไม่ใช่เทส

ทั้งหมดเป็นอาการเงียบ — 403 หรือรายชื่อว่างเปล่า ไม่มี error ให้เห็นว่าเป็นเพราะคำ

| ไฟล์ | อาการถ้าปล่อยไว้ |
|---|---|
| `admin-user-actions-helpers.js` `isAdminCaller` | ผู้ดูแลปลดล็อกบัญชีใครไม่ได้เลย |
| `platform-admin/organizations.js` zod enum | สร้างเจ้าหน้าที่ไม่ได้เลยสักคน (400) |
| `quotations.js` — สำเนา `isProviderRole` ในไฟล์ | ฝ่ายบัญชีเปิดใบเสนอราคาไม่ได้ |
| `security-compliance.js` — ตารางบทบาทคู่ขนาน | 403 ทุกคนบนประตูที่คุมด้วย `dashboard.view` |
| `nav-config.ts` (ฝั่งเว็บ) | ผู้ดูแลและฝ่ายการเงินล็อกอินได้แต่เมนูว่างเปล่า |
| `document-reviews.js` · `admin-application-service.js` | ผู้ดูแลข้ามด่านการมอบหมายไม่ได้ / บังคับสถานะไม่ได้ |
| `scheduler-dashboard-handler.js` · `waiver-reopen-service.js` | ตัวนับงานเกินกำหนดเป็นศูนย์ / คิวคำผ่อนผันไม่มีใครรับ |

## สามจุดที่เป็นการ **ขยายอำนาจ** จากการยุบคำเปล่า `account`

คำเปล่า `account` เดิมหมายถึง "ฝ่ายบัญชีทั้งก้อน" — การยุบมันเข้าฝั่งบริษัทตามที่โค้ดเดิม
เขียนเจตนาไว้ ทำให้การเงินของบริษัทได้สิทธิ์ที่เคยเป็นของกลางหรือของกรม เทสจับได้ทั้งสามจุด

| ไฟล์ | สิทธิ์ที่กว้างเกิน | คืนเป็น |
|---|---|---|
| `dtam-remittance.js` `WRITE_ROLES` | การเงินบริษัท **ย้ายเงินส่งกรม** ได้ | ฝั่งกรมเท่านั้น |
| `dtam-accountants.js` | งานของกรมถูกส่งไปให้การเงินบริษัทด้วย | ฝั่งกรมเท่านั้น |
| `quotations.js` `resolveAllowedIssuerSides` | ฝ่ายบัญชีเห็นทั้งสองฝั่ง | จำกัดตามฝั่งของตัวเอง |

## หนึ่งจุดที่ผมทำพังเอง และเทสจับได้

ใส่ `system_admin_platform` ลง `ALL_PROVIDER` / `FULL_STAFF` "เพื่อความสมมาตร" ซึ่งเปิด
ประตูงานทุกบานให้ผู้ดูแลบริษัท — `rbac-matrix-final` 22 เคส NEGATIVE กลายเป็นผ่าน ·
คืนขอบเขตเดิมแล้วพร้อมคอมเมนต์กันใส่กลับ

## ที่ยังไม่ได้ทำ

migration `20260910200000_role_vocabulary_three_sides` เขียนแล้ว **ยังไม่รันบนฐานใด**
และสามฐาน (dev · staging · demo) ยังไม่ได้ล้าง+seed ใหม่ — ต้องทำหลังโค้ดขึ้น ตามลำดับ
ที่พิสูจน์มาแล้วในวันเดียวกัน (`evidence/role-vocabulary-rehearsal-2026-09-10/`)
