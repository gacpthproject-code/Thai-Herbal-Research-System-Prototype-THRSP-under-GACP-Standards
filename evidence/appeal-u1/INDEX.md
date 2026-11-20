# หลักฐาน U1: ผู้ตรวจพื้นที่บันทึก "ไม่ผ่าน" แล้วคำขอรอผู้อนุมัติ ไม่ปิด (กิ่ง feat/appeal-u1-u2)

สเปก: `docs/superpowers/specs/2026-10-10-inspector-fail-approver-appeal-design.md` ที่ `e832c8878` แถว U1 ของส่วนที่ 7 · คำตอบ operator คำสั่ง 78(2) (ค8 ปิดสี่ประตูผู้ดูแล และคำบนจอ "ไม่ได้รับการรับรอง")
ฐาน: `origin/main` ที่ `0a23ec877` · งานชั้น C (`scripts/probes/tier-check.sh` พิมพ์ `TIER=C`) · operator เป็นผู้ merge และต้อง merge ติดกับ U2

ทุกการรันที่แตะฐานข้อมูลใช้ Postgres ชั่วคราวของงานนี้เท่านั้น (container `appeal-u1-pg` ที่ 127.0.0.1:55491 ฐาน `gacp_u1` สำหรับเดินจริง และ `gacp_u1_full` ที่สร้างใหม่และ migrate ใหม่สำหรับชุดเทสต์เต็ม) ผ่าน `~/work/state/heavy.sh` พร้อม `PAYMENT_ADAPTER=mock` สคริปต์ห่อตรวจ URL ก่อนรัน และ URL ไม่เคยอยู่ใน argv (คำสั่ง 70) ไม่แตะ staging หรือ demo

## แดงก่อนเขียว ทีละกติกา

| กติกา | เทสต์แดง (commit · ผล) | เขียว |
|---|---|---|
| สี่ประตูผู้ดูแล (status-override, PATCH status, force-status, revert-last-transition) พาคำขอที่ไม่ได้รับการรับรองออกจาก REJECTED ไม่ได้ ทั้งแถวที่ผู้ตรวจปฏิเสธก่อน U1 พร้อมหนังสือ และแถวที่ผู้อนุมัติปฏิเสธผ่านประตูจริง (ค8) | `5c8882aac` · 7 เคสได้ 200 บน main | `52f011b2f` LEFT_ONLY_ALONG_OWN_EDGE |
| ตาราง: ขาเข้า REJECTED มีแค่ของผู้อนุมัติ · AUDIT_NOT_PASSED เป็นผลของผู้ตรวจ ออกได้แค่ทางผู้อนุมัติ · คิวผู้อนุมัติสองสถานะ · ผู้ดูแลพา AUDIT_NOT_PASSED ไป CAR_REVIEWING หรือ CANCELLED ไม่ได้ · force เข้า AUDIT_NOT_PASSED ไม่ได้ | `096bd2c8e` | `c5630f444` |
| ใบงานและภาคสนาม: ไม่ผ่าน = AUDIT_NOT_PASSED ไม่มีหนังสือแจ้งคำสั่ง ล้างตราผ่านค้าง แจ้งผู้อนุมัติ แจ้งผู้ยื่นและผู้ถือพร้อมข้อบกพร่อง · ต้องมีข้อบกพร่อง · REJECT เลิกใช้ · บนโต๊ะให้ไม่ผ่านไม่ได้ · MAJOR ล้างตราผ่าน · คิวผู้อนุมัติแสดงแฟ้ม · ประตูทั่วไปปฏิเสธ | `6bbc325b4` | `e1d08f99a` |
| จอผู้ตรวจสองจอมีผลชุดเดียวกัน หน้าต่างไม่ผ่าน คำบนจอ · รายการสถานะเว็บครบทุกสถานะของเซิร์ฟเวอร์ | `79bd7f67a` · เว็บ 7/7 แดง · backend 2/3 แดง | `9d4a77aa2` `28f57c6c2` |

ผลรันแดง: `red-6bbc325b4.txt` (3 ชุด 31 เทสต์ล้ม รันจาก worktree ที่ปักไว้ที่ commit นั้น ซึ่ง backend ยังเป็นโค้ดของ main) · `red-79bd7f67a-web.txt`
เคสที่ผ่านอยู่แล้วบน main เป็นตัวควบคุม: กู้ AUDIT_NOT_PASSED กลับ AUDIT_CONFIRMED ได้ 200 · ไป EXPIRED ได้ 400 (status-override ใช้ ALLOWED_FORCE_STATUSES มาแล้วจาก decision-truth) · ตัวควบคุมเชิงลบที่ใส่ขาเก่าของผู้ตรวจกลับเข้าตารางแล้วตัวตรวจต้องเห็น

## เดินจริงผ่าน HTTP (`walk-output.txt`)

backend จาก worktree ของกิ่ง ฟังเฉพาะ 127.0.0.1:8191 (สคริปต์ preload `walk-scripts/bind-localhost.js` เพราะ server.js ผูก 0.0.0.0) ต่อฐาน `gacp_u1` ที่ seed ด้วย `seed-all.js` และ `seed-gacp.js` ข้อมูลเดินสร้างด้วย `walk-scripts/fixture.js` เข้าระบบผ่านประตูจริงทั้งสี่บทบาทด้วยบัญชีของ `prisma/seed-gacp.js` · สำเนาใน `walk-scripts/` ต่างจากสคริปต์ที่รันแค่สี่บรรทัดเข้าระบบ: บัญชีและรหัสผ่านย้ายไปอ่านจาก environment เพื่อไม่ให้อยู่ในไฟล์ ส่วน `fixture.js` `bind-localhost.js` และ `walk-output.txt` ตรงกับที่รันทุกไบต์

1. ผู้ตรวจพื้นที่บันทึก "ไม่ผ่าน" บนใบงาน: 200 สถานะ AUDIT_NOT_PASSED
2. ผู้ตรวจพื้นที่บันทึก "ไม่ผ่าน" บนจอภาคสนาม: 200 สถานะ AUDIT_NOT_PASSED
3. ไม่มีข้อบกพร่อง 400 FINDINGS_REQUIRED · คำว่า REJECT 400 · ประตูทั่วไปส่ง REJECTED 422
4. ผู้ยื่นเห็น `dashboardStage: PENDING_DECISION` คำบนจอ "ตรวจประเมินแปลงแล้ว รอการตัดสินให้การรับรอง" และได้แจ้งเตือน "ผลการตรวจพื้นที่: ไม่ผ่าน" ที่บอกข้อบกพร่องและว่าผู้อนุมัติจะพิจารณา
5. คิวผู้อนุมัติแสดงทั้งสองแฟ้มเป็น AUDIT_NOT_PASSED แฟ้มเปิดอ่านได้ (ตัดสินไม่ได้จนกว่า U2) ผู้อนุมัติได้แจ้งเตือน "มีคำขอที่ผู้ตรวจพื้นที่ให้ไม่ผ่าน รอคุณตัดสิน"
6. ผู้ดูแลใช้ status-override พาคำขอที่ถูกปฏิเสธกลับ AUDIT_CONFIRMED: 409 CERTIFICATION_TRACK_LOCKED

## ภาพหน้าจอ (`screenshots/` ทุกภาพมีสองขนาด 390x844 และ 1440x900)

ถ่ายจากเว็บ Next dev ของกิ่ง (127.0.0.1:3191) ต่อ backend ชั่วคราวข้างบน ด้วย Chromium · ผู้ยื่นเข้าระบบผ่านแบบฟอร์มจริงที่ชื่อโฮสต์ localhost เพราะคุกกี้ของผู้ยื่นกลับมาผูกกับชื่อ localhost (ที่ 127.0.0.1 เบราว์เซอร์จึงไม่ส่งคุกกี้กลับ ได้หน้าเข้าสู่ระบบ ตรวจแล้วว่าเป็นเรื่องการตั้งเครื่องทดสอบ)

| ภาพ | สิ่งที่ควรเห็น |
|---|---|
| `01-job-sheet-at-a-visit-offers-not-passed` | ใบงานตอนลงพื้นที่ ปุ่ม ผ่าน · ข้อบกพร่องเล็กน้อย (ให้แก้ไข) · ข้อบกพร่องสำคัญ (ให้แก้ไข) · ไม่ผ่าน ไม่มีปุ่ม "ปฏิเสธคำขอ" |
| `02-not-passed-dialog-confirm-disabled` | หน้าต่าง "บันทึกผลไม่ผ่าน" ข้อความ "ผลนี้จะส่งให้ผู้อนุมัติพิจารณา คุณไม่ได้ปิดคำขอ ..." ปุ่มยืนยันกดไม่ได้เพราะยังไม่มีข้อบกพร่อง |
| `03-not-passed-dialog-with-a-finding` | ใส่ข้อที่พบและแนวทางแก้ไขแล้ว ช่องทั้งสองขึ้น "จำเป็น" ปุ่ม "ยืนยันบันทึกผลไม่ผ่าน" กดได้ |
| `04-job-sheet-after-not-passed-waits-for-approver` | หลังบันทึก ใบงานปิดสำหรับผู้ตรวจ แถบ "ส่งผลไม่ผ่านให้ผู้อนุมัติแล้ว รอการตัดสิน" |
| `05-approver-queue-lists-files-that-did-not-pass` | คิวผู้อนุมัติ หัวข้อ "คำขอที่ตรวจประเมินแปลงแล้ว รอการตัดสิน" แถวมีป้าย "ไม่ผ่านตรวจ รอตัดสิน" |
| `06-applicant-list-stage-words` | รายการคำขอของผู้ยื่น แถวที่ถูกปฏิเสธใช้คำ "ไม่ได้รับการรับรอง" (แถวที่ไม่ผ่านอยู่ถัดลงไปนอกจอ ดูภาพ 07) |
| `07-applicant-detail-not-passed-waits-for-decision` | หน้าคำขอที่ไม่ผ่าน คำอธิบายว่าผู้อนุมัติจะพิจารณาว่าจะไม่ให้การรับรองหรือให้แก้ไขข้อบกพร่อง |
| `08-applicant-detail-refused-word` | หน้าคำขอที่ถูกปฏิเสธ ป้าย แถบขั้นตอน และข้อความใช้คำว่า "ไม่ได้รับการรับรอง" · ภาพนี้เผยข้อบกพร่องเดิม: กล่องเขียว "คำขอหมดเวลาแก้ไขและถูกยกเลิก" เป็นข้อความของคำขอที่เลยกำหนด ไม่จริงสำหรับคำขอที่ถูกปฏิเสธ (ส่งต่อ U2 ที่ทำการ์ดของคำขอที่ไม่ได้รับการรับรอง) · บรรทัดลำดับเหตุการณ์ "โดย: ผู้ตรวจพื้นที่" มาจากแถวทดสอบที่จำลองรูปก่อน U1 |

ไม่มีภาพ (MISSING): ขั้นตัดสินผลของจอตรวจภาคสนาม เพราะไปถึงได้หลังเริ่มตรวจด้วย GPS ตอบรายการตรวจ และถ่ายภาพครบ การเปลี่ยนแปลงของจอนั้นพิสูจน์ด้วยเทสต์เว็บ (`inspector-records-not-passed.test.tsx`) และประตูของมันพิสูจน์ด้วยการเดินจริงข้อ 2

## ชุดเทสต์และ probe

| สิ่งที่รัน | ผล |
|---|---|
| backend เต็มชุดที่ `9d4a77aa2` บนฐานใหม่ (`full-suite-summary.txt`) | ดูหัวข้อ "เทียบกับ main" |
| ชุดที่ล้มรันซ้ำบนโค้ดของ main และบน commit สุดท้าย (`control-and-reverify.txt`) | ดูหัวข้อ "เทียบกับ main" |
| เว็บ jest เป้าหมาย (ใบงาน ภาคสนาม คิวผู้อนุมัติ ขั้นผู้ยื่น) | ผ่านทั้งหมด |
| web tsc | ดูหัวข้อ "เทียบกับ main" |
| `scripts/probes/rejected-approver-only.sh` (`probe-rejected-approver-only.txt`) | --selftest 8 เคสครบสองทิศ · กิ่ง PASS · backend ของ main FAIL (auditor-audit-decision-handler.js) |
| `scripts/probes/ratchet.sh` | PASS hardcode 26 · todo 33 · env-direct 93 · dup-source 0 (`ratchet-after.txt` · ไฟล์ snapshot ที่ commit บน main ยังเป็น 40/98 ค้างมาก่อน `ratchet-before-main-snapshot.txt`) |
| `scripts/probes/tier-check.sh` | TIER=C |
| `scripts/ci/probe-gate.js` (`probe-gate.txt`) | 25 probe ผ่าน 16 ล้ม 8 · probe ใหม่ rejected-approver-only ผ่าน · ทั้ง 8 ตัวที่ล้มไม่ได้อ่านไฟล์ที่กิ่งนี้แก้ (gate-attestation รอ gate ของ coordinator · no-secret เจอ 1 รายการใน commit `c3582d6a6` ของกิ่ง fix/submit-door-truth ซึ่งไม่ใช่บรรพบุรุษของกิ่งนี้ · ที่เหลือเป็นของเครื่องและของ main) · gitleaks ช่วง origin/main..HEAD ของกิ่งนี้ 15 commit ไม่พบ |
| local gate ขั้นเร็ว: banned-terms, mojibake, ratchet --selftest, research-dataset selftest | ผ่าน · green-mask ล้มด้วย 4 ไฟล์เทสต์ที่กิ่งนี้ไม่ได้แตะ (dispatcher-defaults, dispatcher-lock-order, finance-integrity, survey-one-response) |
| `scripts/docs/check-architecture.js` ขั้น architecture-doc ของ local gate (`architecture-check.txt`) | ที่ `5ecf744fa` K3 ล้ม (เอกสารไม่มี AUDIT_NOT_PASSED ป้าย REJECTED ยังเป็น "ปฏิเสธ" แผนภาพไม่ตรงโค้ด) ซึ่ง main ผ่าน · แก้แล้วด้วยการสร้างแผนภาพใหม่จากโค้ดและเติมตารางสถานะใน `docs/architecture/README.md` (สเปก 5.9): K3 ผ่าน · K5 ล้มเหมือน main (`/api/dispatch-due` ไม่อยู่ในเอกสาร ไม่เกี่ยวกับกิ่ง) · selftest ล้ม 8 เคสเดียวกับ main ที่วัดบน checkout ชั่วคราวของ `0a23ec877` |
| `extract-error-codes.js --markdown` แล้ว `--validate` | 465/465 · เทสต์รหัสข้อผิดพลาดผ่าน |

## เทียบกับ main

- ชุดเต็มของ backend ที่ `9d4a77aa2` บนฐานใหม่: 1,119 ชุด ล้ม 26 ชุด 78 เทสต์ (`full-suite-summary.txt`) แล้วไล่ทีละชุด
- 26 ชุดนั้นรันซ้ำสองรอบบนฐานใหม่ ด้วย environment เดียวกัน (`control-and-reverify.txt`): บนโค้ด backend ของ main ล้ม 10 ชุด 33 เทสต์ · บน commit สุดท้าย `5ecf744fa` ล้ม 10 ชุด 33 เทสต์ ชื่อตรงกันทุกชื่อ ล้มบนกิ่งแต่ไม่ล้มบน main = 0 ชื่อ
- ในนั้น 20 ชื่อคือ 20 ชื่อเดิมของ main (gate `d7477d642` integration-pg) ยังล้มครบ 20 ไม่มีชื่อใหม่ อีก 13 ชื่อ (stripe-checkout-engine, checkout-requires-accepted-quotation, checkout-renewal-price, checkout-hands-the-browser-a-publishable-key) ล้มบนโค้ดของ main ด้วยเหมือนกัน เพราะงานนี้รันด้วย `PAYMENT_ADAPTER=mock` ตามคำสั่ง ไม่เกี่ยวกับกิ่ง
- อีก 16 ชุดล้มในรอบเต็มแต่ไม่ล้มในสองรอบที่รันซ้ำ:
  - 12 ชุดเป็นเทสต์ที่ตรึงกติกาเก่า (ขาปฏิเสธของผู้ตรวจ · FAIL ภาคสนามที่เคยเป็น CAR · stub ที่ตอบแถวผิด) ปรับตามคำสั่ง 12 ใน `1e1ea2f99` (9 ชุด) และ `009d63bca` (car-result-reaches-applicant-and-holder, onsite-car-window, auditor-decision-car-deadline-guard)
  - error-codes-source-pointers: จุดชี้บรรทัดเลื่อนเพราะโค้ดที่แก้ แก้ใน `dd6e727ae`
  - auditor-no-scoring-gate: หมายเหตุ "human PASS/FAIL only" หายจากใบงานใน `e1d08f99a` ใส่คืนใน `009d63bca` ไม่ได้แก้เทสต์
  - field-audit-clock (บรรทัด 77 ได้ 409 แทน 201) และ quotation-states-both-instalments (PDF ?phase=1 ตอบ 500) เป็นอาการเดียวกับ gate ของ main (#65 และ #61) ผ่านทั้งสองรอบที่รันซ้ำ กิ่งนี้ไม่แตะไฟล์ของสองชุดนี้
- ระหว่างไล่ชุดเหล่านี้ รอบตรวจซ้ำเจอข้อบกพร่องจริงหนึ่งข้อ: ใบงานตอบคำปฏิเสธของตัวเขียนผลตรวจเป็น "Certificate could not be issued" แก้ใน `5ecf744fa`
- ชุดที่แตะไฟล์ที่แก้หลังรอบเต็ม 61 ชุดที่ `5ecf744fa`: ล้มเพียง onsite-decision-mint-e2e 2 ชื่อ ซึ่งอยู่ใน 20 ชื่อเดิมของ main
- finance-paper-text-inside-print-margin ซึ่งอยู่ในรายชื่อชุดที่ล้มของ main (`fails-d7477d64`) ผ่านในรอบเต็มของกิ่งนี้
- web: เทสต์เป้าหมาย 27 ชุดผ่าน · `tsc --noEmit` ผ่านที่ `009d63bca` (หลังจากนั้นแก้แต่ backend)

## สิ่งที่ U1 ไม่ได้ทำ และส่งต่อ

- ประตูตัดสินของผู้อนุมัติสำหรับแฟ้มที่ไม่ผ่าน (`certification-refusals` รับ AUDIT_NOT_PASSED และประตูใหม่ `certification-corrections`) เป็นของ U2 ระหว่างนี้แฟ้มเปิดอ่านได้แต่ `decidable: false`
- งานในคิว (WorkActivity) ของผู้อนุมัติที่ AUDIT_NOT_PASSED ไม่ถูกสร้าง เพราะ `stage_activity_configs` มีแถว FINAL_APPROVAL เฉพาะ AUDIT_PASSED และแถวนี้ใส่ด้วย migration (สเปก 5.9 เขียนว่าสร้างงานแบบเดียวกัน) U1 ห้าม migration จึงหยุดตรงนี้และรายงาน คิวตัดสินและแจ้งเตือนผู้อนุมัติอ่านจากสถานะจึงทำงานครบ
- แอปมือถือไม่ต้องแก้: อ่านขั้นจากเซิร์ฟเวอร์ ไม่แปลงสถานะเอง (แอปแช่แข็ง คำสั่ง 34(9))
