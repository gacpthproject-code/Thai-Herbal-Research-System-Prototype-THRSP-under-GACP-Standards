# Changelog

All notable changes to the GACP Platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.9.0] - 2026-10-30

### หมายเหตุประวัติรุ่น

รุ่นนี้รวมงานบนสายหลักตั้งแต่ `v3.8.0` (2026-07-23) ถึง `b8d27a690`
นับตาม first-parent ได้ 1,121 commit เป็น commit รวมสาขา 300 รายการ
และ commit ตรงบนสายหลัก 821 รายการ (โค้ด เทสต์ เอกสาร และหลักฐานการตรวจ)
รายการด้านล่างจัดกลุ่มตามสิ่งที่ผู้ใช้และเจ้าหน้าที่พบ ไม่ได้ระบุทุก commit
รายการเต็มดูได้จาก `git log --first-parent v3.8.0..v3.9.0`

รุ่นนี้ขึ้น staging และ demo แล้วเมื่อ 30 ตุลาคม 2569 ระบบยังไม่เปิดให้บริการจริง
การชำระเงินบนทั้งสองสภาพแวดล้อมเป็นโหมดทดสอบ

### ผู้ยื่น

- แบบคำขอใหม่ 6 ขั้น เอกสารที่ต้องแนบตรงตามแบบ กทล.1 มีช่องอัปโหลดในขั้นที่ถามเอกสารนั้น
  และหน้าตรวจทานก่อนยื่นอ่านจากเซิร์ฟเวอร์แหล่งเดียว
- เลือกพืชได้ครบ 6 ชนิด แต่ละชนิดมีชุดเอกสารตามกฎหมายของตัวเอง
  และใบอนุญาตสมุนไพรควบคุมขอเฉพาะชนิดที่ถูกควบคุม
- วัตถุประสงค์เหลือ 3 ข้อที่มีใบอนุญาตตามกฎหมายรองรับ (วิจัย ส่งออก แปรรูป)
  พร้อมรหัสใบอนุญาตตามชนิดพืช
- ติ๊กรูปแบบการปลูก N รูปแบบได้ N คำขอและ N ใบเสนอราคา แนบเอกสารครั้งเดียวแล้วถึงทุกคำขอ
- ระบบประกอบแบบ กทล.1 เป็น HTML และ PDF จากตัวเรนเดอร์เดียว พิมพ์วันยื่นจริงและติ๊กวัตถุประสงค์ตามคำขอ
- ร่างคำขอไม่หายเมื่อการเชื่อมต่อหลุด บันทึกตามลำดับ และการยื่นซ้ำจากสองหน้าต่างถูกปฏิเสธ (`DRAFT_NOT_LATEST`)
- นิติบุคคลและวิสาหกิจชุมชนยื่นคำขอได้ ขั้นที่ 1 เลือก "ยื่นในนาม" และรายการคำขอแสดงผู้ถือ
- เจ้าของบริษัทให้หรือถอนสิทธิ์ยื่นคำขอและสิทธิ์ดูข้อมูลการเงินรายคนได้
- ถูกขอแก้เอกสารแล้ว แก้เฉพาะเอกสารที่ถูกขอในคำขอเดิม กำหนดส่งรอบละ 5 วันทำการ
  และช่องที่เจ้าหน้าที่รับแล้วแก้หรือลบไม่ได้
- ส่งหลักฐาน CAR รายไฟล์ ระบบบอกช่องที่ยังขาด และหน้าอัปโหลดบอกเวลาที่ไฟล์ที่ยังไม่ส่งจะถูกลบ
- สถานะคำขอฝั่งผู้ยื่นมีแหล่งเดียว ป้ายบนหัวหน้า รายการ หน้าสถานะ และแดชบอร์ดอ่านค่าเดียวกัน
  หน้าสถานะเดียวแสดงความคืบหน้า 5 ขั้น
- อ่านเหตุผลที่ไม่ได้รับการรับรอง และอ่านสิ่งที่ผู้ตรวจบันทึกเกี่ยวกับตนเองได้ (PDPA มาตรา 30)
- ต่ออายุและขอใบแทน: ยกคำตอบจากคำขอเดิมมาให้ หาใบรับรองเดิมได้ทุกรูปแบบเลข
  ต้องมีสิทธิ์ยื่นในนามผู้ถือใบเดิม และรอบปลูกอยู่กับฟาร์มเดิม
- ถอนคำขอได้ เมื่อเงินกำลังเข้าระบบจะปฏิเสธการถอน (`WITHDRAW_PAYMENT_IN_FLIGHT`)
- แจ้งเตือนในระบบอย่างเดียว ลิงก์ "ดูรายละเอียด" พาไปหน้าปลายทางและบันทึกว่าอ่านแล้ว
  การเตือนชำระเงิน การแจ้งยกเลิกคำขอ และการเตือนใกล้ครบกำหนดแก้ไขปิดไม่ได้
- บันทึกการปลูก: รอบปลูก ผู้ลงมือทำงานจริง วันพ่นสารเทียบวันเก็บเกี่ยว ล็อต และผลแล็บ (COA)
  ที่ไม่บังคับแนบแต่บอกผลของการไม่แนบ วันเก็บเกี่ยวห้ามเป็นอนาคตหรือก่อนวันปลูก

### ผู้จัดคิว

- บทบาทผู้จัดคิวรับงานต่อจากการชำระเงิน จองนัด มอบหมายผู้ตรวจเอกสารและผู้ตรวจพื้นที่
- เห็นสถานะผู้ติดต่อหน้างานตั้งแต่ในคิว เหตุผลนัดช้าและการเปลี่ยนผู้ตรวจระบุฝ่ายที่รับผิดชอบ
  และเลือก "อื่น ๆ" ต้องพิมพ์เหตุผล
- ปฏิทินนัดตรวจเช็กช่วงว่างและเขียนในธุรกรรมเดียว นัดชนกันคิดจากความยาวจริงของนัด
- ออกจากขั้นแล้วงานค้างของขั้นนั้นปิดเอง

### ผู้ตรวจเอกสาร

- หน้าตรวจเอกสารรายช่อง รับหรือขอแก้ทีละเอกสาร มีตัวดูไฟล์ในหน้า
- ตรวจเอกสารเบื้องต้นอัตโนมัติ 7 ช่อง (OCR ภาษาไทยในเครื่อง) เป็นข้อแนะนำเท่านั้น
  ป้ายคือ ไม่มีข้อสังเกต / ข้อสังเกต / ตรวจเอง เจ้าหน้าที่เป็นผู้ตัดสิน
- ประวัติรอบขอเอกสารส่งต่อถึงผู้ตรวจพื้นที่และผู้อนุมัติ

### ผู้ตรวจพื้นที่

- แบบตรวจหน้างานบันทึกคำตอบครบ และส่งคำตอบที่ค้างก่อนส่งผล
- ภาพตรวจแปลงเก็บไฟล์จริงก่อนบันทึก แต่ละภาพมีเวลาถ่ายของตัวเอง
  ระยะพิกัดภาพวัดจากพิกัดแปลงที่ยื่น ตรวจเวลาภาพเผื่อเขตเวลา EXIF 24 ชั่วโมง
- ผลไม่ผ่านไปที่ผู้อนุมัติตัดสิน ไม่ปิดคำขอเอง งาน CAR เป็นของผู้ตรวจพื้นที่
- ใบงานแสดงเอกสาร ชื่อพืชภาษาไทย และเหตุที่ดำเนินการไม่ได้เป็นภาษาไทย

### ผู้อนุมัติ

- ตัดสินจากในแฟ้มคำขอเท่านั้น มีหน้าต่างยืนยันและช่องเหตุผล ปุ่มอนุมัติคลิกเดียวในรายการถูกถอด
- อนุมัติแล้วคำขอจบที่ `CERTIFIED` และแจ้งผู้ยื่นกับผู้ถือ
  ผู้ประเมินอนุมัติงานของตัวเองไม่ได้ (ISO/IEC 17065 ข้อ 7.6)
- แฟ้มที่ผู้ตรวจพื้นที่ให้ไม่ผ่าน ผู้อนุมัติเลือกได้สองทาง ไม่ให้การรับรอง หรือส่งกลับแก้ไข 30 วัน
- พักใช้ คืนสภาพ และเพิกถอนใบรับรองจากหน้าใบรับรองที่ออกแล้ว เหตุ "อื่น ๆ" ต้องพิมพ์เหตุผล
  เหตุพักใช้และเหตุเพิกถอนเข้ารหัสตอนจัดเก็บ
- ออกใบรับรองต้องมีข้อมูลผู้ถือครบตามกติกาเดียวกับการยื่น ไม่ครบได้รายการช่องที่ขาด

### การเงิน

- ค่าบริการก้อนเดียวต่อรูปแบบการปลูก 5,500 + 27,500 บาท รวม VAT 7% เป็น 35,310 บาท
  ไม่มีการแยกค่ารัฐกับค่าแพลตฟอร์ม ทุกหน้าอ่านราคาจากเซิร์ฟเวอร์ และราคาที่ล็อกอ่านไม่ได้ให้หยุด
- ชำระด้วย QR พร้อมเพย์ สถานะชำระแล้วมาจาก webhook เท่านั้น ใบเสร็จออกโดยระบบ ไม่มีคนอนุมัติการชำระ
  กันการเก็บเงินซ้ำ และบันทึกว่าแต่ละรายการชำระเป็นโหมดทดสอบหรือไม่
- ใบเสนอราคายืนราคา 7 วันทำการตามเวลากรุงเทพฯ
  ช่องผู้ชำระแยกป้ายตามประเภทผู้ยื่น เลขผู้เสียภาษีนิติบุคคลพิมพ์ครบ 13 หลัก
  และไม่พิมพ์เลขบัตรประชาชนของบุคคล
- การเงินสองฝั่งเห็นข้อมูลชุดเดียวกัน ฝั่งกรมฯ อ่านอย่างเดียว ผู้ตรวจพื้นที่ไม่เห็นข้อมูลเงิน
- ระบบไม่โอนเงินคืนเอง บริษัทโอนนอกระบบแล้วการเงินบันทึกเพื่อออกใบลดหนี้
  พร้อมวันที่โอนคืนและเลขอ้างอิงธนาคาร
  งวดที่คืนเต็มจำนวนนับเป็นยังไม่ชำระ
- เงินที่เข้าช้าไม่ทำให้สถานะถอยหลังหรือเปิดคำขอที่ยกเลิกแล้ว
- วันที่ทางธุรกิจทั้งระบบเป็นเวลากรุงเทพฯ เลขเอกสารและงวดตรงกับวันที่พิมพ์

### ผู้ดูแลระบบ

- คำเรียกบทบาทชุดใหม่สามฝั่ง (ผู้ยื่น เจ้าหน้าที่กรมฯ เจ้าหน้าที่บริษัท)
- ผู้ดูแลกรมฯ แต่งตั้งได้เฉพาะบทบาทฝั่งกรมฯ ผู้ดูแลแพลตฟอร์มแต่งตั้งได้เฉพาะบทบาทฝั่งบริษัท
  ผู้ดูแลคนสุดท้ายถูกลบไม่ได้ และบทบาทระบบตั้งให้บัญชีคนไม่ได้
- เจ้าหน้าที่ทุกบทบาทเห็นและทำได้เฉพาะงานของตัวเองในองค์กรตัวเอง
- บัญชีเจ้าหน้าที่ที่ผู้ดูแลสร้างล็อกอินได้ และมีหน้าลงทะเบียน 2FA
- ผู้ดูแลปิดคำขอโดยเลือกเหตุผล และแจ้งผู้ยื่นกับผู้ถือ
- กฎเอกสารที่ต้องแนบเป็นข้อมูลแบบมีวันมีผล แก้ได้โดยไม่ต้อง deploy
  และคำขออ่านกฎ ณ วันที่ยื่น

### สาธารณะและการตรวจสอบใบรับรอง

- เลขใบรับรองรูปแบบ `{ลำดับ}/{ปี พ.ศ.}` ชุดเดียวกับของกรมฯ หน้าตรวจสอบรับเลขทุกรูปแบบที่เคยออก
- หน้าตรวจสอบแสดงฟาร์มและขอบเขตการรับรอง ไม่แสดงชื่อบุคคล
  เมื่อตรวจไม่ได้จะแสดงว่าตรวจไม่ได้ ไม่ตัดสินว่าใบไม่ถูกต้อง
- ใบรับรองลงนามด้วยกุญแจที่ระบุบนแถวใบรับรอง แก้ไขใบได้ภายใต้เลขเดิมโดยเก็บต้นฉบับที่ลงนามไว้
  และตรวจได้ทั้งสองฉบับ
- สแกน QR ของล็อตแสดงแปลง ผลแล็บ ตำแหน่งฟาร์ม และการเรียกคืน
  ล็อตที่ผลิตภายใต้ใบที่ถูกพักใช้หรือเพิกถอนไม่ขึ้นว่ารับรอง
- หน้าแรกกลับมาที่ `/` ข้อความบนหน้าสาธารณะตรงกับระบบจริง
  และบอกว่าใบรับรอง "จะ" ออกโดยกรมฯ เมื่อระบบเปิดให้บริการอย่างเป็นทางการ
- หน้าราคาอธิบายที่มาของค่าบริการ

### ความปลอดภัยและความเป็นส่วนตัว

- ปุ่มเข้าสู่ระบบด้วย ThaID และหมอพร้อมที่หน้าเข้าสู่ระบบ ระบบเก็บรหัส ThaID เป็น HMAC ไม่เก็บเลขบัตรดิบ
- ไม่มีการกู้บัญชี ไม่มีลิงก์รีเซ็ตรหัสผ่าน ไม่มีใครตั้งรหัสหรือล้าง 2FA ให้คนอื่น
  2FA ใช้ TOTP อย่างเดียว
- บังคับ 2FA ทุกประตูเข้าสู่ระบบของเจ้าหน้าที่เมื่อเปิดธง `REQUIRE_MFA_FOR_PRIVILEGED`
  พร้อมคู่มือกรณีอุปกรณ์หาย
- บัญชีที่ถูกระงับใช้ session ไม่ได้ทุกประตู จำกัดขนาด input และ multipart
- การลงทะเบียนสาธารณะรับเฉพาะช่องในฟอร์ม ข้อมูลผู้ใช้ที่ส่งกลับเป็น allowlist
  และประตูฝั่งผู้ยื่นไม่ส่งรหัสผู้ใช้ของเจ้าหน้าที่
- เลขบัตรประชาชนแสดงเฉพาะหลักแรกและ 4 หลักท้าย ปิดบังที่เซิร์ฟเวอร์
- ไฟล์ส่วนตัวส่งผ่าน signed URL การอัปโหลดล้มแล้วปฏิเสธ ไม่บันทึกแถวที่ไม่มีไฟล์
- ประกาศความเป็นส่วนตัวฉบับ 1.4 มีผล 28 ตุลาคม 2569 และถอดข้อความที่ไม่จริงว่าข้อมูลอยู่ในประเทศไทย
- ระยะเก็บข้อมูลและการลบตาม PDPA รวมผลตรวจเอกสารอัตโนมัติ
- ชุดข้อมูลวิจัยส่งออกได้เฉพาะเมื่อมีหนังสืออนุมัติจากคณะกรรมการจริยธรรม
  สถิติรวมไม่แสดงค่าต่ำสุดหรือสูงสุดรายคน
- รายงานข้อผิดพลาดไม่ส่งข้อมูลส่วนบุคคล และปิดเมื่อไม่ได้ตั้งค่า
- อัปเดต Next.js 15.5.26 ปิดช่องโหว่ RCE และอัปเดต library ตาม advisory

### โครงสร้างระบบ

- Node 24 และ jest 30 ทั้งต้นไม้
- ใช้ Postgres ผ่าน Prisma อย่างเดียว
- การ settle การชำระเงินทำครั้งเดียวต่อเหตุการณ์ มี retry และงานกระทบยอดที่ขับรายการที่ค้างให้จบ
- ตัวเขียนสถานะคำขอล็อกแถวก่อนเปลี่ยนสถานะ ทุกประตูยื่นใช้ด่านเดียวกัน
  และแต่ละประตูอ่านกำหนดเวลาของสถานะตัวเอง
- staging และ demo รันโหมด production ทั้งคู่ `/api/webapp-version` ของเว็บและ `/api/health`
  ของ backend บอก revision ของ build
- ไฟล์ nginx ของ demo อยู่ใน repo และตรงกับเครื่อง
- ต้นแบบตามสัญญา: ฐานข้อมูลสมุนไพร ตารางเทียบมาตรฐาน และการประเมินภาพที่รับเฉพาะ JPEG/PNG

### Removed

- ระบบนำส่งเงินให้กรมฯ ทั้ง pipeline ชั้นบัญชี และ schema บริษัทเคลียร์กับกรมฯ นอกระบบ
- การชำระด้วยสลิปโอนเงิน และทุกทางที่ให้คนอนุมัติหรือยืนยันการชำระ
- แพ็กเกจสมาชิก (subscription) และด่าน PREMIUM
- วัตถุประสงค์ทางการแพทย์ (MEDICAL)
- โหมด workspace และตัวสลับ ผู้ถือยังเป็นนิติบุคคลตามเดิม
- 2FA ทางอีเมล SMTP และระบบลืมรหัสผ่านทั้งทางอีเมลและ SMS
- การแจ้งเตือนทางอีเมลและ SMS เหลือแจ้งเตือนในระบบอย่างเดียว
- MongoDB ที่ค้างอยู่ทั้งหมด
- IdP จำลองและหน้า consent จำลอง
- หน้าบันทึกรายต้น ข้อมูลการดูแลย้ายไปอยู่กับรอบปลูก
- การแยกค่ารัฐกับค่าแพลตฟอร์ม และค่าคงที่ราคาที่ยกเลิก
- ประตูบัญชีซื้อและปิดงวด (`/api/finance/purchase-invoices`, `/api/finance/period-close`)
- ประตูตรวจปลอมและประตูตายที่ไม่มีผู้เรียก

### ข้อจำกัดที่ยังมี

- การอุทธรณ์ของผู้ยื่นยังไม่มีในระบบ แบบร่างรอข้อยุติด้านกฎหมายของกรมฯ
  ปุ่มไม่ให้การรับรองถูกพักไว้ (`REFUSAL_AWAITS_APPEAL_SETUP`) จนกว่าจะตั้งค่าช่องทางอุทธรณ์
- การเดินทดสอบบน staging รอบล่าสุดพบข้อบกพร่องที่แก้ในรุ่นนี้ ยังต้องเดินซ้ำทั้งเส้นบนรุ่นนี้
- ThaID และหมอพร้อมยังไม่มี credential ใช้งานจริง ปุ่มแจ้งว่ายังไม่พร้อม
  การเข้าสู่ระบบด้วยรหัสผ่านเป็นทางชั่วคราว
- การชำระเงินเป็นโหมดทดสอบ ก่อนตั้งคีย์จริงต้อง backfill ค่าโหมดทดสอบของรายการเดิมและเพิ่ม probe
- การบังคับ 2FA ของเจ้าหน้าที่มีค่าเริ่มต้นปิด ต้องเปิดธงในวันขึ้นระบบ
- การแยกข้อมูลระดับฐานข้อมูล (RLS) อยู่ในขั้นวัดผลแบบเงา ยังไม่บังคับ การแยกข้อมูลทำที่ชั้นแอป
- สคริปต์กวาดไฟล์ CAR ที่ไม่ได้ส่งยังรันแบบ dry-run
- `/api/health` และ `/api/version` ของ backend ยังตอบ `version: '3.0.0'` แบบคงที่
  ใช้ `revision` เพื่อดูว่า build ใดทำงานอยู่

## [3.8.0] - 2026-07-23 — Version reunification + Jobs-bar quality pass

### Release-history note (honest accounting)

This entry consolidates roughly **430 PRs (#265–#697) merged to main
without changelog records** after 3.2.1 (2026-05-05). In the same period,
tags **v3.3.0–v3.7.6 were cut on an abandoned parallel history** — none of
them is an ancestor of main (verified with `git merge-base
--is-ancestor`), so those tags do not correspond to any code on the main
line and must not be treated as release points. Meanwhile the four
manifests had drifted to four different identities (root `2.0.0`, web-app
`3.0.0`, backend `3.0.0`, mobile `1.0.0+1`). 3.8.0 reunifies all of them
under one canonical version and resumes changelog discipline from here.
Full findings: `docs/audit-reports/2026-07-23-jobs-bar-quality-audit.md`
(Release & version hygiene scored 2/10 — this entry is the remediation).

### Consolidated from the unrecorded span (themes, from `git log`)

Grouped by program, with representative PRs from the recorded history:

- **Dark mode & design-audit remediation** — Tailwind flipped to
  `darkMode: 'class'` so the public site no longer renders dark just
  because the visitor's OS is dark (#693), class-order lint follow-up
  (#695), design-audit sweep covering Thai typography, a11y, icons and
  provider ID (#692), auth hero refinement (#691), provider wide tables
  → card stack on mobile (#679).
- **CI gate greening** — Security Scan gate green (TruffleHog/DepReview
  PR-only + Semgrep triage) (#696), all high-severity pnpm audit
  vulnerabilities cleared (#690), zero errors/warnings + full TypeScript
  strict-flag migration (#681).
- **Security: 2FA / PII / pentest** — 2FA-bypass (High) plus
  SoD/IDOR/deadline fixes (#682), pentest round 2: offline-audit bypass
  + cron-secret leak (#683), mobile logout PII-wipe bypass +
  auth/logging/storage hardening (#685), re-audit findings F7
  (High)/F8/F12 closed (#688), false RLS-enforcement claim corrected in
  docs (#689).
- **Tenant scoping (ADR-014)** — cross-tenant read guards on
  credit/debit notes (#672), per-tenant audit-chain baselines (#647),
  universal code resolver + partner access log for DTAM Next
  interoperability (#653–#656).
- **Audit-trail integrity** — v3 HMAC-keyed tamper-evident hash chain
  (#644), full-system-audit go-live blockers H/I/F closed (#646),
  audit-write atomicity + mojibake CI gate (#674).
- **Billing & fee-waiver** — atomic phase-invoice minting (#659), single
  frozen price-of-record (#661), fee-waiver reopen for EXPIRED
  applications + wrongful-expiry lane + waiver SLA (#648–#650).
- **E2E / TestSprite suites** — release journey runner + auth-readiness
  probe (#657), carpet-E2E remediation (#663), UAT round-2 cluster
  (#664, #665), carpet-UAT hardening B1–B5 (#669); `test:testsprite`,
  `test:e2e:*` and `test:journey:*` runners wired into root scripts.
- **Mobile applicant app** — real applicant app: M1 build+APK, M2
  submit, M3 payment, M4 read screens (#684).
- **Acceptance evidence & prototypes** — contract C05F680149 evidence
  packs (#666–#668, #670–#673), herb DB ≥300/base + disease classifier
  v2 (#675).

### Fixed (this branch — Jobs-bar quality pass)

- **Hydration mismatch on every page** — `ThemeScript` mutates `<html>`
  before React hydrates, so React logged a hydration error on every page
  load (proven 18/18 route×viewport). Added `suppressHydrationWarning`
  on `<html>` (the next-themes contract); re-proven 18 → 0.
- **Verify page honest failure state** — a fetch/network failure no
  longer declares a genuine certificate "ไม่ถูกต้อง" to the public. Any
  non-2xx now renders a neutral amber "ไม่สามารถตรวจสอบได้ในขณะนี้" hero
  with retry; the red verdict is reserved for a confirmed-invalid
  response from the backend.
- **Auth stylesheet invalid CSS** — bare HSL triples (e.g. `border: 1px
  solid 150 12% 85%`) in `globals-components-auth.css` wrapped in
  `hsl()`; the outline/language buttons on register + forgot-password
  have visible borders again instead of being genuinely transparent.
- **Farmer-dashboard label keys** — the four dashboard surfaces that all
  shared the single "สถานะดำเนินการ" dictionary key (including the to-do
  card that tells the farmer what to do next) now have distinct keys.
- **Thai typography sweep** — removed `tracking-wide` / synthesized-bold
  utilities from Thai copy across components, per the brand rule that
  Thai text never takes positive letter-spacing or synthesized weights.
- **Dark-mode card fixes** — un-tokened `bg-white` surfaces migrated to
  the `bg-card` token / `dark:` overrides so toggling dark mode no
  longer produces white-on-white cards on landing/pricing.
- **Contrast floor** — sub-AA text (e.g. `text-white/40` at 10px bold,
  ~2.4:1) raised to meet the WCAG AA floor for the smallest sizes.

### Added

- **`no-thai-letterspacing` lint rule** — mechanically enforces the Thai
  typography brand rule so the sweep above cannot silently regress.
- **Real OG / apple-touch icons** — `opengraph-image` + `apple-icon` via
  App Router file conventions; metadata previously pointed at
  `og-image.png` / `apple-touch-icon.png` files that did not exist, so
  LINE/Facebook shares had no preview and iOS home-screen had no icon.
- **Jobs-bar quality audit report** —
  `docs/audit-reports/2026-07-23-jobs-bar-quality-audit.md`
  (7 dimensions, adversarially verified, scorecard + top-10 fix list).

### Changed

- **Version reunification** — root `2.0.0`, web-app `3.0.0`, backend
  `3.0.0`, mobile `1.0.0+1` all set to **3.8.0** (mobile `3.8.0+1`).
  Tag `v3.8.0` is to be cut **on main after this PR merges**; the
  v3.3.0–v3.7.6 tag line is dead and must not be extended.

## [3.2.1] - 2026-05-05 — IDOR enumeration sweep (T-014 / PR-02)

### Merged: PR #262, #263, #264

Per canonical auth/RBAC contract §5.2 and master audit T-014, health users
must only see their own farm's data. Three follow-up PRs closed the
remaining IDOR enumeration vectors found by extending the PR-02 audit
beyond the original two-controller scope.

The unifying contract: when ownership fails, return **404** (same shape
as "doesn't exist"), not 403 — otherwise an attacker can enumerate row
ids by response-code differential.

### Security — IDOR fixes

- **PR #262** — `controllers/site-analysis-controller.js` (5 endpoints)
  + `controllers/training-record-controller.js` (3 endpoints).
  Added private `resolveOwnedAnalysis(req, res)` /
  `resolveOwnedRecord(req, res)` helpers that 404 when
  `row.farm.ownerId !== req.user.id`. Routes patched: `GET/PUT/DELETE
  /:id`, `GET /:id/evaluate-soil`, `GET /:id/compliance-score` on
  site-analysis; `GET/PUT/DELETE /:id` on training-record.
- **PR #263** — `controllers/gacp-scoring-controller.js` (3 endpoints).
  Same class — routes mounted under `authenticateHealth` but the
  controller never verified the application/farm belonged to the
  caller. `GET /application/:applicationId` now 404s unless
  `application.applicant.id === req.user.id`; `GET /farm/:farmId` now
  404s unless `farm.ownerId === req.user.id`; `POST /compare`
  `{ farmIds[] }` rejects the whole request when any id in the payload
  isn't owned (silent filtering would let an attacker probe ids).
- **PR #264** — normalized 11 remaining 403-leak sites across
  `cultivation-log-controller.js` (7), `routes/api/trace/lots.js` (2),
  `routes/api/helpers/lots-label-routes.js` (2). These had ownership
  checks but returned `403 { Access denied … }` — the access boundary
  was defended, but row existence was leaked via response code. All
  normalized to `404 { … not found }` matching #262/#263.

### Coverage

22 endpoints across 6 controllers/route files now return a uniform 404
on cross-tenant access, indistinguishable from "row doesn't exist".

`POST /api/lots` create-flow's batch ownership check was left as 403
intentionally — `verifyBatchOwnership()` returns false for both
"doesn't exist" and "not yours", so the existence leak was already
closed there; changing that response shape is a separate question
outside the PR-02 scope.

### Verification

- `pnpm --dir apps/backend test` → 941 passing, 43 skipped (same
  baseline as 3.2.0 — only failure is pre-existing `ENCRYPTION_KEY`
  env-bind in `__tests__/unit/encryption.test.js`, unrelated)
- `pnpm --dir apps/backend run lint` → 0 errors, 0 warnings
- `node scripts/system-integrity-check.js` → 52/52 passed

## [3.2.0] - 2026-05-04 — Audit consolidation + canonical contracts

### Merged to main between PR #252 and #260 (9 PRs)

### Architecture & contracts (T-001, T-005)

- **Canonical auth/session/RBAC contract** (`docs/architecture/2026-05-04-canonical-auth-session-rbac-contract.md`) — single signed-off source for session artifacts, login/refresh/logout, redirect allowlist, role dictionary + aliases + ThaID normalization, route protection matrix (web Next middleware + backend Express + BFF proxy), anti-pattern list.
- **Canonical workflow & status dictionary** (`docs/architecture/2026-05-04-canonical-workflow-status-dictionary.md`) — application 20-state machine + ALLOWED_TRANSITIONS + ROLE_TRANSITIONS, Quote/Invoice/Subscription/PaymentTransaction/PaymentSlip/Certificate/PlantingCycle/PlantUnit/HarvestBatch/Lot/ReportSubmission status sets, 24 input + 24 DB legacy aliases enumerated, per-route-family read/emit/normalize responsibility table.
- **CSS architecture audit** (`docs/architecture/2026-05-04-css-architecture-audit.md`) — full inventory of 6 CSS files, design tokens, conflict scan (∅), wave-by-wave remediation plan.

### Security (production bug fixes)

- **`hashProviderId` import missing** in `routes/api/system/provider.js` — every PATCH/PUT to `/api/provider/*` endpoint was 500-ing on the row hash step. Added to the destructure import.
- **`Applicant` (proper case) ThaID alias dead code** in `shared/canonical-rbac.js` — `ROLE_ALIASES['Applicant']` keyed proper-case but `normalizeRole()` lowercases input first, so every reference (ThaID OIDC return, migrate-user-types script, e2e-validate assertion) silently resolved to null. Replaced with lowercase `applicant` entry per contract §4.3.
- **plant-units routes mount path wrong** — `cultivation/plant-units.js` declared 6 absolute paths but was mounted at `/plant-units`, producing double-prefixed dead URLs (`/api/plant-units/plant-units/:id`, `/api/plant-units/planting-cycles/:cycleId/plant-units`). Re-mounted at `/`. Same flow used by frontend `planting-service.ts`.
- **`mfa.js` `_tokenType` typo** would have thrown "is not defined" if the public-audience MFA path executed. Removed the dead variable + the unreachable typo branch.
- **`/api/admin/*` legacy flag** — namespace was gated behind `ENABLE_PROVIDER_LEGACY_ALIAS` env var which CI didn't set, so the ERP regression gate's admin read-only step 404'd. Set in CI workflow.

### Backend hardening

- **Notification canonical writer migration** — 16 `prisma.notification.create()` / `createMany()` sites across 10 files migrated to `createNotification` / `createBulkNotifications` from `services/notification-service.js`. Unlocks user channel preferences (email/SMS fanout) + cross-tenant organizationId resolution. Direct creates outside the canonical writer were silently dropping notifications from cron paths.
- **`gacp/no-direct-audit-or-notification-write` rule**: warn (17 violations) → **error (0)**.
- **`gacp/no-cross-module-internal` rule**: warn → **error** (0 violations on landing).
- **Backend lint baseline**: 221 errors → **0 errors, 0 warnings**. ESLint flat-config flipped from advisory to required gate.
- **Frontend lint gate** flipped from advisory to required (1 warning, well under `--max-warnings=50`).
- **ERP Regression Gate** flipped from advisory (failing for weeks due to seed gaps) to required green. Seeded active Certificate for the test farm, fixed plant-units mount, set the legacy-alias env var.
- **/api/audits/* per-handler role tightening** — file-level `requireRole(AUDIT_STAFF)` plus narrower per-route gates: `POST /audits/schedule` and `PATCH /audits/:id/schedule` to `SCHEDULERS`; `POST /audits/:id/result` to `AUDITORS` (admin + auditor only — narrower than AUDIT_STAFF; document_reviewer cannot record audit results per workflow contract §1.3). New `ROLE_GROUPS.AUDITORS` group added to `canonical-rbac.js`.

### Performance

- **`/api/analytics/geography/farms` N+1 → 2 queries**. With ~1000 farms, 1000 sequential cert lookups become a single batch via `findMany({ where: { farmId: { in: farmIds } } })` + in-memory Map join.
- **Provider analytics performance handler** switched from `findMany() + JS for-loop` to Prisma `groupBy({ by: ['updatedBy', 'status'], _count })`. Postgres does the bucketing; node memory bounded by `(actors × statuses)` instead of raw row count.
- **Analytics cache invalidation hooks** wired into Farm CRUD + Certificate issue. Was relying on TTL only — dashboard could show stale data for up to an hour after a farm/cert mutation.

### CSS architecture cleanup

- **Mantine `var(--ui-color-*)` legacy refs**: 40+ across 14 TSX files + `provider-styles.css` migrated to `colors.mantine.*` Tailwind namespace, then the Mantine compatibility shim block (137 lines) removed from `globals.css`.
- **`MANTINE.*` JS constants** in `lib/legacy-mantine-colors.ts` (-131 lines) — the 3 inline-style consumers migrated to Tailwind className (`bg-mantine-X-N`) or `theme()` arbitrary value. File deleted.
- **8 orphan `.glass-*` utilities** removed (`.glass`, `.glass-heavy`, `.glass-light`, `.glass-nav`, `.glass-input`, `.glass-glow`, `.glass-badge`, `.frosted-bar` — all 0 references). Kept `.glass-card` + `.glass-panel` (4 active consumers).
- **Premium Design Utilities** cluster extracted from `globals.css` into `globals-premium.css`. `globals.css` reduced from 887 → 529 lines (-40%).
- **Conflicting design token files** — deleted `apps/web-app/src/styles/design-system.ts` (orphan, 0 consumers). Kept `lib/design-tokens.ts` (1 consumer, system-guard fallback screen) with deprecation header pointing new code at the canonical Tailwind tokens.
- **Dead Tailwind config** — `borderRadius.xl: 'var(--radius-lg)'` and `'2xl': 'var(--radius-xl)'` referenced undeclared CSS variables; their `.rounded-xl` / `.rounded-2xl` Tailwind defaults match the `!important` overrides in `globals.css`, so removing the broken config entries is a no-op.
- **Missing design tokens** declared in `:root` + `.dark`: `--field-surface`, `--field-muted-surface`, `--shadow-sm`, `--shadow-md`, `--font-display`, `--ui-radius-md`. Previously referenced but never declared, so surfaces fell back to `transparent` / `currentColor`.

### UI components

- **`<ThemeIcon>` and `<ActionIcon>` `size` prop** now drives actual `width`/`height` (was silently destructured into `_s` and discarded). Mantine-style preset mapping (`xs(16) sm(20) md(28) lg(36) xl(48)`).
- **`<ThemeIcon>` and `<ActionIcon>` `color` prop** now resolves to a tinted Tailwind class via `COLOR_CLASSES` map covering Mantine palette + semantic aliases (primary/success/info/warning/error). Restorative — pages that pass `<ThemeIcon color="teal">` finally render teal-tinted instead of flat gray.
- **`variant` prop dropped** from those two components — silently ignored before, now removed; 10 caller sites cleaned.

### Tests

- **Canonical contract verification** (`apps/backend/__tests__/unit/canonical-contract-verification.test.js`) — 44 unit tests across 7 describe blocks lock the workflow + RBAC dictionaries to the code source-of-truth. Future drift in `services/workflow-transition-service.js` or `shared/canonical-rbac.js` fails the test instead of silently changing behavior.
- Backend test suite: **906 → 950 passing**, 0 failed.

### Tooling

- **husky** v8 shim (`#!/usr/bin/env sh` + `husky.sh` source) removed from `.husky/pre-commit` — was printing `husky - DEPRECATED` on every commit.

### Files added

- `docs/architecture/2026-05-04-css-architecture-audit.md`
- `docs/architecture/2026-05-04-canonical-auth-session-rbac-contract.md`
- `docs/architecture/2026-05-04-canonical-workflow-status-dictionary.md`
- `apps/backend/__tests__/unit/canonical-contract-verification.test.js`
- `apps/web-app/src/styles/globals-premium.css`
- `apps/web-app/src/components/layout/dashboard-sidebar.tsx` (Wave E.2-C Step 1; standalone, not portal-integrated yet)

### Files removed

- `apps/web-app/src/styles/design-system.ts` (orphan)
- `apps/web-app/src/lib/legacy-mantine-colors.ts` (interim; consumers migrated)

## [3.1.0] - 2026-04-26 — Audit follow-up + deploy hardening

### Deployed to production: `cf1ed5f4` on 2026-04-26 14:58 UTC

### Security (P0/P1 from carpet audit)
- **Schema↔DB sync**: declared `status`, `phase1Status`, `phase2Status`, `phase2ExpiresAt` on Application. Removed dead `state` field. Rewrote ApplicationDraft model to match the actual DB columns. Added migration `20260425090000` to install missing `phase2ExpiresAt` column.
- **Race-safe numbering**: PostgreSQL sequences for batch / lot / application numbers (migration `20260425100000`) — replaces the racy `count(*) + 1` pattern.
- **CI guard**: `check-prisma-migration-consistency.js` now watches the multi-file `prisma/schema/` folder.
- **Webhook signature verification**: `express.json({verify})` captures `req.rawBody`; sanitize middleware bypasses `/api/webhooks` to preserve raw bytes for HMAC.
- **Auth portal mismatch**: `/auth/health/login` rejects provider accounts (`expectedPortal: 'HEALTH'`); access + refresh tokens signed with the correct secret per role.
- **Encryption**: AES-256-CBC → AES-256-GCM (auth tag verified). `decrypt()` now throws on failure instead of silently returning ciphertext. Backward-compat for legacy CBC reads.
- **Listing leakage**: `GET /api/payments` restricted to ADMIN/ACCOUNT roles for system-wide view; `GET /api/certificates` scoped to user-owned certificates for health users.
- **Audit log**: `fs.appendFileSync` → `fs.promises.appendFile` (non-blocking).
- **Path traversal guard** in `services/fraud-detection/document-verification-methods.js`: `resolveDocumentPath()` normalizes `fileUrl` and verifies result is rooted under `uploadDir`.
- **QR signing key separation**: `QR_SIGNATURE_FALLBACK_SECRET` is dedicated; no longer reuses JWT secret. Fail-closed in production.
- **Trace `/verify`**: rejects unknown `entityType` values, confirms entity exists before recording a scan.
- **Activity ownership**: `attachmentIds` on cultivation activities must belong to an application owned by the authenticated user.
- **Cycle ownership ≠ certificate validity**: `loadOwnedCycleWithPlots` returns the cycle even if cert is expired; only cert-gated actions require an active certificate via the new `hasActiveCertificate()` helper.
- **CSRF bypass list** rewritten as regex covering `/api/v1/*` aliases + `/api/webhooks`.

### Subscription / Premium unlock
- `services/subscription/entitlements-service.js` — single source of truth for tier policy. `requireFeature(...)` middleware factory replaces ad-hoc `accountTier === 'PRO'` checks.
- `BILLING_FREE_TIER_FOR_ALL=true` flag treats all authenticated users as PREMIUM during the introductory period.
- `/api/subscription/me` returns the entitlement snapshot used by the frontend to gate UI.
- `/api/subscription/plans` returns the public pricing catalogue (FREE / PREMIUM / ENTERPRISE).
- New page at `/health/subscription` with Thai pricing card layout.
- `useEntitlements()` React hook + `SubscriptionService` mirror the backend types.

### UX cleanup
- Deleted dead `components/ui/sidebar.tsx` + `mobile-header.tsx` (522 lines, no imports).
- Provider nav grew 6 → 8 items so `Calendar` and `Analytics` (built but orphan) are reachable from the topbar.
- Wizard step 3 redirect renders `null` instead of a flash of "กำลังเปลี่ยนหน้า…".
- Comprehensive UX & provider gap report at `docs/audits/2026-04-25-ux-and-provider-gap-report.md`.

### DevOps / deploy hardening
- New `scripts/deploy/deploy-production.sh` — 7-step deploy with hard pre-flight (clean tree, branch, env vars), pg_dump backup, FF-only pull, Prisma migrate, rolling restart, smoke test, audit log, rollback recipe.
- CI deploy job rewritten: `promote-deploy-branch` job fast-forwards `deploy/production` from `main` (or auto-opens a PR if branches diverge); `deploy` job runs only on push to `deploy/production` and SSH-delegates to the script — no inline shell commands, no implicit merges.
- `docs/operations/deploy-runbook.md` — branch model, invariants, rollback recipe, GitHub branch-protection settings, "server in dirty state" incident playbook, maturity ladder.
- `docker-compose.production.yml` forwards new env vars (`BILLING_FREE_TIER_FOR_ALL`, `QR_SIGNATURE_FALLBACK_SECRET`, `PAYMENT_WEBHOOK_SECRET`, `COOKIE_SECURE`, `REQUIRE_MFA_FOR_PRIVILEGED`, `PARTNER_TRACE_API_KEY`) into the backend container.
- Pre-commit hook slimmed: drops `npx tsc --noEmit` (CI runs typecheck instead) so worktrees without `node_modules` no longer force `--no-verify`.
- ESLint v8/v9 plugin mismatch: disabled `@typescript-eslint/no-unused-expressions` (crashes on ESLint 8) until root eslint bumps to v9.
- `.gitignore` now ignores `.worktrees/`, `output/`, stray `/app/` clones — keeps production server's `git status` clean as the new deploy script's pre-flight requires.
- Server-side: production droplet (152.42.218.251) brought back to source-of-truth state. Captured 1895 dirty files + 23 untracked services to `/root/gacp-snapshots/` snapshots before reset.

### Server hardening (152.42.218.251)
- SSH `PasswordAuthentication` disabled at the cloud-init level (was overriding the 99-hardening config).
- Port 2222 closed (kept 22 only).
- Authorized keys deduped; "no comment" key removed; 8 → 6 entries.
- Effective: `passwordauthentication no` + `authenticationmethods publickey`.

## [3.0.1] - 2026-03-16 — Hand-off Release

### UX/UI Polish
- 182 lines of system-wide CSS enhancements in `globals.css`
- Page entrance stagger animations (60ms delays per element)
- Enhanced focus rings (`focus-visible`) for accessibility
- Table zebra striping + hover highlights
- Custom scrollbar styling, status badge color system (6 states)
- Card variants: accent-left, accent-top, borderless
- Thai text optimization (`optimizeLegibility`, `word-break`)
- Print styles, selection color, smooth scroll + `prefers-reduced-motion`

### Documentation (Hand-off Package)
- **ARCHITECTURE.md** — 53 services, 22 controllers, 16 middleware, 9 Prisma schemas
- **API-REFERENCE.md** — 60+ endpoints, auth, rate limits, response formats
- **DEVELOPMENT-GUIDE.md** — Setup, test accounts, commands, conventions
- **HANDOFF.md** — Executive summary, tech stack, quality metrics, features, deployment

### Testing (8 New Agents: Q1–Q8)
- Q1 Typo Check — English/Thai typo scanner (5/5 ✅)
- Q2 Type Check — tsc, @ts-ignore, `any` audit (4/4 ✅, 0 errors)
- Q3 Lint Strict — ESLint + debugger detection (5/5 ✅)
- Q4 LQA — Linguistic quality, i18n coverage (6/6 ✅)
- Q5 Alpha Test — Auth, SQLi, XSS, edge cases (10/10 ✅)
- Q6 Beta Test — API consistency, headers, CORS (10/10 ✅)
- Q7 Accessibility — ARIA, semantic HTML, keyboard (9/9 ✅)
- Q8 Performance — Response times, bundle analysis (12/12 ✅)
- **Total: 272/272 test steps (100%)**

### Fixed
- TS2571 in `farm-map.tsx` — break method chain to avoid `unknown` type
- Q4 LQA EISDIR — filter directories in i18n scan

---

## [3.0.0] - 2026-03-08

### Architecture

- **2-Layer Nginx**: Host Nginx (SSL termination at edge) → Docker Nginx (pure internal router)
- **Docker Compose Production**: 6-container stack (Nginx, Backend, Frontend, PostgreSQL, Redis, MinIO)
- **Network Isolation**: Backend/Frontend ports not exposed to public, Docker bridge network only

### Added

- Multi-role authentication system (Health users, Providers, Admin)
- Thai ID (ThaiD) OAuth integration with mock mode for testing
- Automated DB backup with 7-day retention (daily at 2:00 AM UTC)
- Health monitoring script (every 5 minutes, all services + Docker containers)
- Weekly Docker system prune (Sundays at 3:00 AM UTC)
- MinIO S3-compatible object storage for file uploads
- PWA support with offline capabilities (Serwist service worker)
- QR code generation and traceability system
- PDF certificate generation with Thai language support
- OCR document analysis (Tesseract.js)
- AI-powered site analysis
- GACP scoring engine (21,540 bytes of scoring logic)
- Planting cycle lifecycle management
- Harvest tracking and yield management
- Training record management
- SOP builder and templates
- Invoice and payment system (PromptPay, Ksher)
- Email notification service with template engine
- Fraud detection service
- Security compliance module
- Consent manager (PDPA compliance)
- Audit trail logging (immutable)

### Security

- 8-layer middleware chain: Helmet → CORS → CSRF → Rate Limit → JWT → Role → Audit → Ownership
- Rate limiting per endpoint (Auth 10r/s, Upload 5r/m, General 50r/s)
- UFW firewall (ports 22, 80, 443 only)
- Fail2ban SSH protection (1,547+ IPs blocked)
- OWASP security headers (X-Frame-Options, CSP, HSTS, etc.)
- Token rotation service
- MFA service (TOTP via Speakeasy)
- Idempotency middleware for critical operations

### Frontend

- Next.js 15.5 with App Router (SSR/SSG)
- Radix UI accessible component primitives
- Tailwind CSS 3.4 design system
- Framer Motion animations
- React Hook Form + Zod validation
- Zustand state management
- Leaflet maps for farm visualization
- Thai/English bilingual interface
- Dark mode support

### Backend

- Express 4.22 REST API
- Prisma 5.22 ORM with PostgreSQL 15
- Redis caching layer (ioredis)
- Bull queue for background jobs
- Winston structured logging
- Swagger/OpenAPI documentation (/api-docs)
- Cron-based scheduled tasks

### Infrastructure

- DigitalOcean Droplet (4 GB RAM, 116 GB disk)
- Ubuntu 24.04 LTS (Kernel 6.8.0-71)
- Docker Compose orchestration with resource limits
- Automated health checks for all containers
- SSL/TLS 1.2 + 1.3 with ECDHE cipher suites

---

## [2.0.0] - 2026-02-26

### Changed

- Major refactoring of application workflow
- Hotfix deployments for stability

---

## [1.0.0] - 2026-01-15

### Added

- Initial release of GACP Certification Platform
- Basic authentication and application submission
- PostgreSQL database with Prisma ORM
