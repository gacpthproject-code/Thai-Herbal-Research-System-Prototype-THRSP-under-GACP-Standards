# fix/filing-fields-enforced: กทล.1 ข้อ ๒-๓ บังคับทั้งฝั่งจอและฝั่งเซิร์ฟเวอร์ (คำสั่ง 143(4))

- ฐาน: `origin/main` ที่ `c84940ec3` · ชั้น B · brief `~/work/state/reviews/brief-filing-fields-enforced.md`
- ทุกการรันผ่าน `~/work/state/heavy.sh` บน Postgres ชั่วคราว `ff-pg` (127.0.0.1:55533, มีแค่ migration + กฎ seed 2 แถว) · `PAYMENT_ADAPTER=mock` · ไม่มีค่าลับใน argv · backend ของ worktree ฟังเฉพาะ 127.0.0.1:18443 (preload `bind-localhost.js`)

## ข้อบกพร่อง

wizard ปล่อยให้ยื่นได้โดยไม่มี สายพันธุ์ (ข้อ ๓) · พิกัดที่ตั้ง · ปริมาณการปลูก (ต้น/รอบ, รอบ/ปี) และเซิร์ฟเวอร์รับ · ส่วนสิทธิในที่ดิน + ประเภท/เลขที่เอกสารสิทธิ์ จอบังคับอยู่แล้วแต่เซิร์ฟเวอร์ไม่บังคับ

## การแก้

ประกาศชุดเดียว `packages/validation/src/filing-fields.js` (`siteFieldGaps`, `varietyGaps`, ตารางคำสิทธิในที่ดิน `LAND_TENURE_BY_INPUT` ย้ายมาจาก application-requirements-service) อ่านโดย

- เซิร์ฟเวอร์: `validation/canonical-application-validator.js` ต่อท้าย `errorsByStep['5']` (`step5.land_tenure` `land_document_type` `land_document_number` `landlord_name` `coordinates` `plants_per_cycle` `cycles_per_year`) และ `errorsByStep.varieties` (`varieties.name`) เฉพาะคำขอรูป กทล.1 · ทุกประตู (/submit, /:id/revision-resubmit, /:id/car) ผ่าน `judgeFiling` ตัวเดียวจึงได้ 422 APPLICATION_INCOMPLETE เหมือนกัน
- จอ: `step3CanProceed` / `step4CanProceed` (ปุ่มถัดไปและยามเส้นทางอ่านตัวเดียวกัน) · ข้อความไทยใต้ช่องเมื่อค่าที่พิมพ์ไม่ใช่สิ่งที่แบบฟอร์มถาม หรือเมื่อออกจากช่องที่ยังว่าง

## ลำดับ commit (เทสต์ที่ล้มมาก่อนการแก้)

| commit | อะไร | ผล |
|---|---|---|
| เทสต์ | unit + ประตูจริง (backend) · gate ขั้น 3/4 + ข้อความบนจอ (web) | `runs/red-summary.txt`: backend ล้ม 49/57 · web ล้ม 16/37 บนโค้ด c84940ec3 (ค่าที่ต่างคือคำตอบจริง เช่น 422 แทน 200, true แทน false ไม่ใช่โหลดไม่ผ่าน) |
| แก้ | ประกาศชุดเดียว + เซิร์ฟเวอร์ + จอ + fixture เก่าที่ยังไม่มีฟิลด์ (`scripts/fix-fixtures.py` anchor ละหนึ่งครั้ง) | `runs/green-summary.txt`: ประตูจริง 30/30 (3 ประตู × 9 ฟิลด์ที่ขาด + 3 ควบคุม) · ชุดข้างเคียง backend 212/212 ใน 14 ชุด · web `_steps` 578/578 ใน 48 ชุด · tsc web ผ่าน · eslint ไฟล์ที่แก้ 0 error |

## ทางเดินบนจอจริง (`runs/walk-output.txt`, `scripts/shots.js`)

Next dev ของ worktree บน :3000 ต่อ backend 127.0.0.1:18443 ฐานข้อมูลชั่วคราว · เข้าระบบด้วยโทเคนของ fixture ผ่าน `/api/session/set-cookie` · เข้าทางขั้น 2 แล้วกดถัดไป

- ขั้น 3: พิมพ์พิกัด "หน้าวัด" จำนวนต้น 0 และออกจากช่องรอบ/ปี ประเภท/เลขที่เอกสารสิทธิ์ที่ว่าง → ข้อความไทย 6 ข้อใต้ช่อง ปุ่มถัดไปกดไม่ได้ (`screenshots/step3-errors-*.png`) · กรอกครบ → ไม่มีข้อความ ปุ่มกดได้ (`step3-complete-*.png`)
- ขั้น 4: เลือกวัตถุประสงค์และชนิดเมล็ดพันธุ์โดยยังไม่ใส่ชื่อ → "กรุณาระบุชื่อสายพันธุ์อย่างน้อยหนึ่งรายการ" ปุ่มกดไม่ได้ (`step4-errors-*.png`) · ใส่ชื่อ → ปุ่มกดได้ (`step4-complete-*.png`)
- ไม่มีคำตอบ 5xx · ภาพเต็มหน้าทั้ง 390x844 และ 1440x900 (แถบขั้นตอนที่ลอยอยู่ทับส่วนกลางของภาพเต็มหน้า เป็นลักษณะของ fullPage capture ไม่ใช่หน้าจอจริง)

## สิ่งที่ไม่ได้ทำ

- ข้อ ๓ ถาม ชนิด/แหล่งที่มา/ปริมาณ ต่อแถวด้วย กฎนี้บังคับแค่ "มีชื่อสายพันธุ์อย่างน้อยหนึ่งรายการ" เพราะจอไม่มีปุ่มลบแถว (STEP4_COPY_TH.removeVariety มีคำแต่ไม่มีปุ่ม) การบังคับทุกช่องของทุกแถวจะทำให้แถวว่างที่ลบไม่ได้กลายเป็นทางตัน
- การต่ออายุ/เติมค่าล่วงหน้า และขั้น 2 ไม่แตะ (กิ่งอื่นถือ)
- ไม่ได้รัน gate เต็ม (brief สั่งไม่รัน)

## รอบ 2 (review `filing-fields-review-dd61c80f9.md` ผล CHANGES · brief `~/work/state/reviews/brief-filing-fields-r2.md`)

ทุกการรันผ่าน `~/work/state/heavy.sh` บน `ff-pg` เดิม · สคริปต์ใน `scripts/round2/` · log ดิบ `/tmp/ff/r2/`

| ข้อ | สิ่งที่แก้ | ที่ | เทสต์ |
|---|---|---|---|
| I1 | ประตู CAR ส่งหลักฐานของแบบฟอร์มที่รับไปแล้ว ไม่ใช่การยื่นใหม่ จึงไม่ถามฟิลด์ข้อ ๒-๓ (`refilesTheForm = from !== 'CAR_PENDING'`) ประตู /submit และ revision-resubmit ยังถามเหมือนเดิม | `services/application-filing-gates.js` · `validation/application-submission-validator.js` · `validation/canonical-application-validator.js` | ประตูจริง: CAR ที่ขาด 9 แบบ → 200 CAR_REVIEWING · unit `refilesTheForm:false` |
| I2 | ข้อความไทยรายช่องจาก `errorsByStep` ชนะประโยคกลาง `messageTh` (`submitGateRefusalTh` ลำดับใหม่ · `refusedFields`) · ผลลัพธ์ REFUSED ถือ `fields` · ขั้น 6 แสดงรายการพร้อมลิงก์ "ไปแก้ที่ขั้น N" (`stepForRefusedKey`) · หน้าแก้ไขเอกสารเดิมแสดง `res.error` ดิบแล้วถูก `load()` ล้างทิ้ง ตอนนี้แสดงชื่อช่องและปุ่มแก้ไขข้อมูลในคำขอ | `lib/services/application-requirements.ts` · `submit-and-hand-over.ts` · `step6-review-state.ts` · `step6-review.tsx` · `[id]/revision/client-view.tsx` + `revision-state.ts` | 422 ของจริงผ่าน envelope ของ api-client · unit ลำดับ · step 6 render · หน้าแก้ไขเอกสาร (mount จริง) · ภาพ `screenshots/round2/revision-refused-*` |
| M1 | รัน RED ของเทสต์ที่ commit แล้วบน base c84940ec3 ใน worktree แยก: ควบคุมผ่าน 3/3 ประตู ล้มเฉพาะกรณีขาดฟิลด์ (200 แทน 422) 45/65 · สาเหตุรอบ 1: log RED ชี้ `require('../../server')` บรรทัด 171 แต่ไฟล์ที่ commit อยู่บรรทัด 179 = รอบ 1 รันร่างเทสต์ก่อน commit ไม่ใช่ฐานข้อมูลเปลี่ยน | `runs/round2-base-red-summary.txt` | |
| M3 | `plantsPerCycle`/`cyclesPerYear` ติด `certScope: 'PLANTING'` ในประกาศเดียว (`siteFieldsFor`) ไม่มี scope = PLANTING ตาม default ของ engine (`application-requirements-service.js:382`) จึงไม่เปลี่ยนคำขอต่ออายุ (M2 คงเดิม) | `packages/validation/src/filing-fields.js` · จอ: `step3CanProceed(farmData, certScope)` ดอกจันของสองช่องนี้อ่าน `volumeAsked` | unit PROCESSING/ไม่มี scope · gate ขั้น 3 |
| M4 | ร่างที่กลับมาเปิด/ถูกเด้งกลับ: ขั้น 3 ที่เริ่มกรอกแล้ว (`siteStarted` = เครื่องหมายเดียวกับ `isKatorlor1Filing`) บอกทุกช่องที่ขาดทันทีเมื่อร่างมาถึง (`hydrating` จาก `resumePending`) · ขั้น 4 ที่เลือกวัตถุประสงค์แล้วบอกช่องสายพันธุ์ทันที | `step3-site-land.tsx` · `step4-variety-purpose.tsx` | render แรก · ภาพ `screenshots/round2/step3-resumed-gaps-*`, `step4-resumed-gap-*` |
| M5 | พิกัดรับเฉพาะทศนิยม `^[+-]?\d+(\.\d+)?$` ต่อค่า (1e1, 0x10, 18,7883 ไม่ผ่าน) | `filing-fields.js` | unit 3 กรณี |
| M6 | ช่องของขั้น 3 รายงานใต้ `errorsByStep['3']` / `step3.<path>` · ฝั่งเว็บ `stepForRefusedKey` ยังอ่านคีย์เก่า `'5'` เป็นขั้น 3 · catalog remediation ของ APPLICATION_INCOMPLETE บอกคีย์ | `canonical-application-validator.js` · `step6-review-state.ts` · `shared/error-codes.js` | unit + ประตูจริง (`step3.*`) |
| M2 | ไม่แตะ (ต่ออายุ/ใบแทนยังถูกถามทุกฟิลด์ รอ operator) | | |

ลำดับ: เทสต์ล้มก่อน (`runs/round2-red-summary.txt`: backend 49/65 · web 16/146 + หน้าแก้ไขเอกสาร 1/3) → แก้ → เขียว (`runs/round2-green-summary.txt`) · ทางเดินจริง `runs/round2-walk-output.txt` (เข้าทางขั้น 2 แล้วถัดไปอย่างที่ผู้ยื่นกลับมาเปิดร่าง ไม่พิมพ์อะไร → 6 ข้อความ ปุ่มดับ · ขั้น 4 กลับเข้ามาใหม่ → ข้อความสายพันธุ์ · หน้าแก้ไขเอกสาร กดส่งกลับ → ชื่อช่องภาษาไทย + ปุ่มแก้ไขข้อมูลในคำขอ ไม่มีรหัสดิบ ไม่มี 5xx)

เทสต์ที่แดงอยู่แล้วบน base (ไม่ใช่ของกิ่งนี้): `preview/__tests__/resubmit-button-renders.test.tsx` "renders the resubmit button for a CAR_PENDING application" ล้มบน c84940ec3 เช่นกัน (`runs/round2-green-summary.txt` ท้ายไฟล์)

## รอบ 3 (คำสั่ง 147 · brief `~/work/state/reviews/brief-filing-fields-r3.md` · งานวิจัย `research-renewal-defaults-2026-10-28.md` §3-4)

ทุกการรันผ่าน `~/work/state/heavy.sh` · Postgres ชั่วคราว `ff-pg` สร้างใหม่ด้วย `scripts/round3/scratch-db.sh` (migration อย่างเดียว ทะเบียนกฎมี 2 แถว M2A ที่ migration seed ให้ เหมือนรอบ 1-2) · log ดิบ `/tmp/ff/r3/` · สคริปต์ `scripts/round3/`

| ข้อ | สิ่งที่แก้ | ที่ | เทสต์ |
|---|---|---|---|
| ใบแทนไม่ถูกถามส่วนที่ ๒ | ประกาศชุดเดียว `filing-fields.js` รับ "ชนิดของคำขอ" (`certScope` + ชนิดคำขอ) · `requestTypeOf` อ่าน `replacementOf` > `requestType` > `renewalOf` แบบเดียวกับ `deriveDimensions` ซึ่งย้ายมาเรียกตัวเดียวกัน · `siteFieldsFor`/`siteFieldGaps`/`varietyGaps` คืนว่างสำหรับ REPLACEMENT · เซิร์ฟเวอร์ส่ง formData ทั้งก้อน ทุกประตูที่ผ่าน `judgeFiling` จึงปล่อยใบแทน | `packages/validation/src/filing-fields.js` · `validation/canonical-application-validator.js` · `services/application-requirements-service.js` | หน่วย (requestTypeOf 7 กรณี + validator) · ประตูจริง `replacement-is-not-asked-section-two-real-postgres` 8 กรณี (ใบแทนไม่มีช่องเลย → รับที่ /submit และ revision-resubmit · ต่ออายุขาดพิกัด/สายพันธุ์ → 422 บอกชื่อช่อง · ต่ออายุครบ → รับ) |
| จอไม่กั้นใบแทน | `step3CanProceed`/`step3FieldErrors`/`step4CanProceed`/`varietyRowsError` รับ `FilingKind` · ร้าน (`isStepComplete`) ส่ง `requestType` · ดอกจันของพิกัด ปริมาณ เอกสารสิทธิ์ หัวข้อสิทธิในที่ดิน ชื่อเจ้าของที่ดิน และชื่อสายพันธุ์ อ่านจากประกาศ (`siteFieldAsked`/`asksSectionTwo`) · ลบ `volumeAsked` ที่ไม่มีผู้เรียก | `step3-site-land-config.ts` · `step4-variety-purpose-config.ts` · `use-application-flow-store.ts` · `step3-site-land.tsx` · `step4-variety-purpose.tsx` | gate ขั้น 3/4 + ยามเส้นทาง · render ขั้น 3/4 |
| บรรทัดยกมาของต่ออายุ | `RENEWAL_CARRIED_OVER_TH` = "ข้อมูลยกมาจากคำขอครั้งก่อน กรุณาตรวจและยืนยัน" (`carriedOverNotice`) แสดง `role="status"` บนขั้น 3 และ 4 เฉพาะ RENEWAL | `step1-request-type-config.ts` · ขั้น 3/4 | render · ภาพเดินจอ |
| error-code pointers (ขอบเขตเพิ่มจาก coordinator) | gate เต็มของ f74b1287b พบ `error-codes-source-pointers` ล้มใหม่: `REQUIREMENTS_RESOLUTION_FAILED` 560→541 และ `PLANT_NOT_DECLARED` 590→571 ใน application-requirements-service.js (บรรทัดเลื่อนจากรอบ 1 และรอบนี้) ชี้ใหม่ด้วย `evidence/submit-door-truth/probes/repoint-error-codes.py` แล้ว `--markdown` | `shared/error-codes.js` · `docs/api/error-codes.md` | `error-codes-source-pointers` + `error-codes-catalog` ผ่านในรอบสุดท้าย |

ลำดับ: เทสต์ล้มก่อนบน 084419f99 ใน worktree แยก (`runs/round3-red-summary.txt`: backend 12/54 ล้ม ค่าที่ต่างคือ 422 แทน 200 และ requestTypeOf ไม่มี · web 7/52 ล้ม) → แก้ → รันเต็มครั้งแรกที่ 90c1e1f37 (`runs/round3-run1-summary.txt`) เจอ 3 อย่าง: ดอกจันชื่อสายพันธุ์ยังอยู่สำหรับใบแทน (ของจริง แก้แล้ว) · ต่ออายุที่ /submit เข้าที่ DOC_FEE_PAID ไม่ใช่ PENDING_DOC_FEE (`submission-entry-state.js` ต่ออายุไม่มีค่าธรรมเนียมเอกสาร เทสต์คาดผิด) · ใบแทนที่ /submit ถูกปฏิเสธเพราะ fixture ไม่ได้แนบ ภ.ท. 10 ที่วัตถุประสงค์ส่งออกขอจากทุกคำขอ (ไม่ใช่ช่องส่วนที่ ๒) → ภาพเดินจอชี้ดอกจันหัวข้อสิทธิในที่ดินอีกจุด แก้ที่ 59912b9d7 → FINAL บน tree สะอาด 59912b9d7 (`runs/round3-final-summary.txt`): backend 23 ชุด 414/414 · web 104/105 ชุด 1101/1102 (ที่ล้มคือ `preview/resubmit-button-renders` CAR_PENDING ซึ่งแดงบน base c84940ec3 อยู่แล้ว ดูรอบ 2) · tsc web ผ่าน · eslint 0 error

ทางเดินบนจอจริง (`runs/round3-walk-output.txt`, `scripts/round3/walk/`, ภาพ `screenshots/round3/`): ร่าง D ของผู้ถือ C เป็น RENEWAL ของใบรับรองจริงที่สร้างไว้ ขั้น 3 กรอกครบ เลือกวัตถุประสงค์แล้วไม่มีสายพันธุ์ · เข้าทางขั้น 2 แล้วถัดไป: ขั้น 3 ขึ้นบรรทัดยกมา ค่าเดิมอยู่ในช่อง ดอกจันครบ ถัดไปกดได้ (`renewal-step3-*`) · ขั้น 4 ขึ้นบรรทัดยกมา + "กรุณาระบุชื่อสายพันธุ์..." ถัดไปดับ (`renewal-step4-*`) · พลิกร่างเดียวกันเป็น REPLACEMENT ที่ไม่มีช่องข้อ ๒ เลย: ขั้น 3 ไม่มีข้อความใต้ช่อง ดอกจัน 0 ทั้ง 5 ช่อง ไม่มีบรรทัดยกมา ถัดไปกดได้ (`replacement-step3-*`) · ขั้น 4 ไม่มีสายพันธุ์ ดอกจัน 0 ถัดไปกดได้ และกดแล้วถึงขั้น 5 (`replacement-step4-*`) · ไม่มี 5xx · ภาพเต็มหน้า 390x844 และ 1440x900

ไม่ได้ทำ (ตาม brief): เส้นออกใบแทนเอง (ข้ามขั้น 3-4 ทั้งขั้น ออกจากใบเดิม) รอคำตอบกรม · ไม่พึ่งกิ่ง renewal-prefill (ac977e18e) · `git merge-tree` กับ main ท้องถิ่น ac977e18e ไม่พบ conflict marker
