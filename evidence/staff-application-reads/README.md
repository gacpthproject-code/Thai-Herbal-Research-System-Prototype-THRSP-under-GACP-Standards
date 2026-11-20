# การอ่านคำขอและเอกสารการเงินของเจ้าหน้าที่

ที่มา: `reports/role-workflow-auditor/2026-10-06-staff-application-reads.md`, security review รอบเดียวกัน และคำสั่ง operator 2026-10-06 ข้อ 10, 14, 17, 18

## สิ่งที่เปลี่ยน

| ข้อ | ประตู | ก่อน (main `43f29927`) | หลัง |
|---|---|---|---|
| F1 | `GET /api/applications/` ฝั่งเจ้าหน้าที่ | `findMany({ isDeleted:false })` ไม่มีตัวกรองแถว | `withVisibility` ตัวเดียวกับประตู provider |
| F2 | `PROVIDER_LISTING_ROLES` | รายชื่อซ้ำ/ขาด | ลบ ตัวกรองตัดสินรายบทบาท |
| F1b + S7 | `GET /api/provider/applications/:applicationId/checklist`, `/sow`, `/activities` | checklist/SOW ไม่ตรวจการมองเห็น · การเงินอ่านได้ทั้งสามประตู | `middleware/require-visible-application.js`: ไม่เห็นคำขอ = 404 · การเงิน = 404 เสมอ (ไม่ใช่ข้อมูลบิล) |
| S1 | `GET /api/provider/applications/queue` | ส่ง `formData`, `healthId` (เลขบัตรประชาชนเมื่อ APP_FK_USE_TOKEN ปิด), อีเมลผู้ยื่น | คอลัมน์เท่านั้น ไม่มี formData/healthId/อีเมล · การเงินได้รูปบิล (id, เลขคำขอ, สถานะ, วันที่, ผู้ถือ) · `reviewerId` อ่านจากคอลัมน์ |
| S2 | `GET /api/provider/applications/:id/audit-timelines` | การเงินถือ `AUDIT_TIMELINE_READ` เห็น workflowHistory | ถอดสิทธิ์นี้จาก `ACCOUNT_BASE_PERMISSIONS` การเงินได้ 403 |
| S4 | `GET /api/audit/onsite/:auditId/context`, `/application/:applicationId/context` | เจ้าหน้าที่ที่ไม่ได้รับมอบหมายอ่านที่อยู่แปลง GPS และคำตอบ checklist ได้ | ต้องมองเห็นคำขอแม่ ไม่เห็น = 404 |
| S6 | `GET /api/fraud-detection/applications/:applicationId/documents`, `POST /api/fraud-detection/documents/:documentId/verify` | ไม่ตรวจการมองเห็น และ POST เขียนผลลงเอกสาร | ต้องมองเห็นคำขอ (การเงินไม่ผ่าน) ไม่เห็น = 404 และไม่เขียนอะไร |
| F3 | `GET /api/provider/applications/:id` ของการเงิน | formData, workflowHistory, อีเมล/โทรศัพท์ | รูปบิลรูปเดียวทั้งสองบทบาท |
| คำสั่ง 17 | ทุกประตูที่ใช้ `withVisibility` และ `GET /api/invoices`, `GET /api/invoices/:id`, `GET /api/quotes` | system_admin_dtam ข้ามองค์กร · บทบาทอื่นพึ่ง tenant extension ซึ่งปิดได้ด้วย `TENANT_READ_ORG_SCOPE=false` | `organizationScope(user)` ใน `shared/application-visibility.js` ใส่องค์กรของผู้เรียกให้ทุกบทบาทยกเว้น system_admin_platform · ไม่มีองค์กร = ปฏิเสธโดยไม่ยิง query |
| คำสั่ง 18 | `GET /api/invoices/:id`, `GET /api/invoices`, `GET /api/quotes`, `GET /api/finance/customer-statement` | ใบแจ้งหนี้ส่งอีเมล+โทรศัพท์ผู้ยื่นและ `healthId` เต็ม 13 หลัก · ใบเสนอราคาส่งอีเมล · statement ส่งโทรศัพท์/อีเมลแบบปิดบางส่วน · ไม่มีที่อยู่ผู้ชำระ | ชื่อผู้ยื่นเท่านั้น ไม่มีอีเมล/โทรศัพท์/`healthId` · เพิ่ม `payer` (ประเภท ชื่อ เลขผู้เสียภาษีนิติบุคคล ที่อยู่) ไม่มีผู้ติดต่อ/โทรศัพท์ · มุมมองของผู้ยื่นเอง (`/invoices/my`, `/applications/:id/statement`, ใบเสนอราคาฝั่งผู้ยื่น, PDF) คงเดิม |
| cleanup | ตัวกรอง field_inspector | กิ่ง `sameReviewerAuditor` ซ้อน | ลบ การแยกผู้ตรวจเอกสาร/ผู้ตรวจแปลงยังบังคับที่ `shared/reviewer-inspector-separation.js` |

## RED → GREEN (Postgres จริง `postgres:17-alpine` พอร์ต 55531, migrate deploy 146 migrations)

`apps/backend/__tests__/integration/staff-application-reads-real-postgres.test.js` ยิงผ่าน `server.js` ด้วย JWT จริง ทำให้ `authenticate*` และ tenant middleware ตัวจริงทำงาน ไม่มี mock บนทางของ request ส่วน list และเอกสารการเงินรันสองรอบ คือ tenant extension เปิด และปิดด้วย kill-switch

- `red.txt` คือไฟล์เทสเดียวกันบน main `43f29927` (worktree แยก) ล้ม 51 ผ่าน 34 จาก 85
  - ที่ผ่านบน main คือพฤติกรรมที่ต้องคงไว้ เช่น ผู้ที่ได้รับมอบหมายยังอ่าน checklist/SOW/onsite ได้, reviewer/inspector/approver ยังได้รายละเอียดเต็ม, เอกสารการเงินกันองค์กรอื่นได้เมื่อ tenant extension เปิด
- `green.txt` คือ branch นี้ ผ่าน 85/85

## ใครเห็นอะไรหลังแก้

ทุกบทบาทยกเว้น system_admin_platform อ่านเฉพาะ `organizationId` ของตัวเอง ไม่มีองค์กร = ไม่เห็นอะไร และกฎนี้ไม่ขึ้นกับ tenant extension

| บทบาท | รายการ/คิวคำขอ | รายละเอียดคำขอ | checklist · SOW · activities · onsite · fraud scan | audit-timelines | ใบแจ้งหนี้ / ใบเสนอราคา |
|---|---|---|---|---|---|
| field_inspector | ใบที่ `auditorId`/`headAuditorId`/`reviewerId` = ตัวเอง | เต็ม | ใบที่มองเห็น | ใบที่มองเห็น | ไม่มีสิทธิ์ |
| document_reviewer | ใบที่ `reviewerId` (คอลัมน์หรือ formData) = ตัวเอง | เต็ม | ใบที่มองเห็น | ใบที่มองเห็น | ไม่มีสิทธิ์ |
| dispatcher | DOC_FEE_PAID, ASSIGNED_FOR_REVIEW, AUDIT_FEE_PAID, AUDIT_CONFIRMED | เต็ม | ใบที่มองเห็น | ใบที่มองเห็น | ไม่มีสิทธิ์ |
| certificate_approver | AUDIT_PASSED, APPROVED, CERTIFIED, CAR_REVIEWING | เต็ม | ใบที่มองเห็น | ใบที่มองเห็น | ไม่มีสิทธิ์ |
| finance_officer_dtam และ finance_officer_platform (ชุดเดียวกัน) | PENDING_DOC_FEE, DOC_FEE_PAID, PENDING_AUDIT_FEE, AUDIT_FEE_PAID · คิวเป็นรูปบิล | รูปบิล | 404 | 403 | องค์กรตัวเอง · ชื่อผู้ยื่น + `payer` ไม่มีอีเมล/โทรศัพท์/เลขบัตร |
| system_admin_dtam | ทุกใบในองค์กรตัวเอง | เต็ม | ใบที่มองเห็น | ใบที่มองเห็น | องค์กรตัวเอง |
| system_admin_platform | ดูหมายเหตุ | องค์กรตัวเอง (วัดตอน extension เปิด) | ใบที่มองเห็น | ใบที่มองเห็น | ดูหมายเหตุ |

หมายเหตุ system_admin_platform: ตัวกรองไม่จำกัดองค์กร แต่บนประตูจริงที่ผ่าน tenant middleware ตัว tenant extension ยังจำกัดให้เหลือองค์กรตัวเองเมื่อเปิดอยู่ (ค่าเริ่มต้น) จึงข้ามองค์กรได้จริงเฉพาะเมื่อ `TENANT_READ_ORG_SCOPE=false` ทั้งบนรายการคำขอและใบแจ้งหนี้ ส่วนรายละเอียดคำขอวัดเฉพาะตอน extension เปิด ซึ่งได้องค์กรตัวเอง วัดจากเทส `system_admin_platform: the filter does not narrow it…`, `…narrowed to its own organization by the tenant extension` และ `…opens either organization’s invoice only when the tenant extension is off` ถ้าต้องการให้ข้ามองค์กรได้จริง ต้องตัดสินที่ tenant extension ซึ่งอยู่นอกขอบเขตงานนี้

## เทสเดิมที่แก้ตาม

- ตรึงกติกาเดิม ปรับตามกติกาใหม่: `__tests__/application-visibility.test.js`, `unit/h17-application-visibility-scope.test.js`, `unit/h17-verify-adversarial.test.js`, `unit/workflow-audit-timelines-handler.test.js` (ผู้ใช้ต้องมีองค์กร), `unit/finance-side-separation.test.js` (ไม่มี AUDIT_TIMELINE_READ), `unit/customer-statement-service.test.js`
- ประตูการเงินรับ `viewer`: `unit/finance-billing-select.test.js`, `unit/invoice-quote-pii-overfetch.test.js`, `unit/invoice-service.test.js`, `unit/invoice-route-ordering.test.js`, `unit/finance-read-parity.test.js` · ตัวตรวจรูป query ยอมให้รายละเอียดใบแจ้งหนี้และรายการใบเสนอราคาอ่าน formData ภายในเพื่อคำนวณที่อยู่ผู้ชำระ การพิสูจน์ว่า formData ไม่ออกถึงผู้เรียกอยู่ที่เทสระดับ body ในไฟล์เดียวกันและในเทส Postgres
- `integration/user-phone-select.test.js` เดิมตรึงว่ารายละเอียดใบแจ้งหนี้ของเจ้าหน้าที่มีโทรศัพท์ผู้ยื่น ซึ่งคำสั่ง 18 ห้าม จึงเปลี่ยนเป็นตรึงว่าไม่มี (ทาง PDF `getForDocument` ยังมีโทรศัพท์ตามเดิม)
- `integration/staff-scope-contract.test.js`, `staff-chain-assign-then-see.test.js`: ผู้ใช้ในเทสต้องมีองค์กร · เทส "ไม่เห็นคำขอขององค์กรอื่น" เดิมใส่องค์กรใน where เองจึงพิสูจน์อะไรไม่ได้ ตอนนี้ไม่ใส่ ให้ตัวกรองกันเอง
- `integration/holder-scope-real-postgres.test.js` case 9 แถวที่ยืนยันการรั่วเดิม ขยับตามกติกาใหม่
- `unit/audit-onsite-routes.test.js` mock middleware การมองเห็น (พิสูจน์บน Postgres จริงในไฟล์ใหม่แล้ว)
- `docs/api/error-codes.md` และ pointer `RECEIPT_NOT_ISSUED` เลื่อนตามบรรทัด

## ผลรันรวม

วัดที่ commit `1c2f943a` บน Postgres จริงตัวเดียวกัน (55531) ผ่าน `~/work/state/heavy.sh`

| ชุด | main `43f29927` | branch | baseline gate |
|---|---|---|---|
| `__tests__/integration` (`--runInBand`) suites ล้ม / tests ล้ม / skipped | 9 / 31 / 13 (ไม่นับไฟล์เทสใหม่ ซึ่งล้ม 51 บน main) | 7 / 26 / 13 · ทุกแถวที่ล้มล้มบน main ด้วย | 9 / 31 / 13 |
| backend jest เต็ม (`npx jest --silent --forceExit` แบบ suite-green) tests ล้ม | ไม่ได้รันเต็มบน main รอบนี้ | 28 จาก 13,410 | 33 |
| web jest | | 3853/3853 ผ่าน | |
| web tsc | | exit 0 | |

แถวที่ล้มบน branch: integration 7 ไฟล์ (a0-pr2-per-hop-invariant 7, m2a-submit-enforcement 5, m1-submit-enforcement 4, officer-review-round-trip 4, m1-erasure-holder-survives 3, onsite-decision-mint-e2e 2, status-writer-audit-default-invariant 1) ล้มเท่ากันบน main · `unit/renewal-fast-path` 1 ล้มบน main ด้วยเมื่อรันเดี่ยว · `unit/document-precheck/extract` 1 (เทสจับเวลา child process) ผ่านในรอบเต็มก่อนหน้าบนโค้ดเดียวกันทุกไฟล์ที่ test นี้แตะ งานนี้ไม่แตะ document-precheck
