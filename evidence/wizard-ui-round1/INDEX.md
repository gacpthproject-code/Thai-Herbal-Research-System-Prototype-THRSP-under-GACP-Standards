# หลักฐาน · หน้าตาแบบคำขอ รอบ 1 (ข้อ 1, 2, 4, 6)

operator อนุมัติ 2026-10-31 · branch `fix/wizard-choice-checkboxes` · โค้ดที่ตรวจ `19c25410e` บนฐาน main `53976fc5e`
ชั้นงานตาม `scripts/probes/tier-check.sh`: **C** (ไฟล์ `step2-identity.tsx` และ `e2e-g4/g4-helpers.ts` ถูกจัดเป็น auth-identity ตามชื่อทาง แม้ที่แก้เป็นแค่ class ตัวหนังสือและตัวช่วยเทสต์) ⇒ operator merge

## เปลี่ยนอะไร
| ข้อ | ของจริงบนจอ |
|---|---|
| 1 | ตัวเลือกเลือกได้หลายข้อ (วัตถุประสงค์ ขั้น 4 · ลักษณะพื้นที่ปลูก ขั้น 3) มีช่องติ๊กที่วาดจริง ว่าง → มีเครื่องหมายถูก · ตัวเลือกข้อเดียว (ประเภทคำขอ ยื่นในนาม ชนิดพืช ขั้น 1 · สิทธิในที่ดิน ขั้น 3 · เมล็ด/ส่วนขยายพันธุ์ ในประเทศ/นำเข้า ขั้น 4 · คำรับรองการเปลี่ยนแปลงของคำขอต่ออายุ ขั้น 6) มีวงกลม ว่าง → มีจุด · กระเบื้องขนาดเดิม · role=checkbox/radio + aria-checked + กลุ่มมีชื่อ · Space ติ๊ก, ลูกศรเลื่อนในกลุ่มวงกลม, เส้นโฟกัสรอบกระเบื้อง · สถานะบอกด้วยรูป (ถูก/จุด) ไม่ใช่สีอย่างเดียว |
| 2 | ชื่อตัวเลือกที่ยังไม่เลือกใช้สีตัวหนังสือปกติ · ตัวหนังสือรอง ขั้น 1-6 แถบขั้น หัวแบบฟอร์ม ป้าย "ไม่บังคับ" และปุ่ม "แทนที่ไฟล์ / ลบไฟล์" 13px (ขนาด label เล็กสุดของ DESIGN.md) และเข้มขึ้น · หัวแบบฟอร์มโหมดมืดอ่านออกแล้ว (เดิมสีดำบนพื้นมืด) |
| 4 | "ยื่นคำขอ" และ "ถัดไป" ใช้ปุ่ม primary ตัวเดียวกัน (Button variant primary, leaf-700) · ช่องคำรับรอง ส่วนที่ ๔ ความยินยอมของระบบ และช่องยืนยันผู้ติดต่อแปลง ใช้ช่องติ๊กตัวเดียวกับข้อ 1 สีของแบรนด์ |
| 6 | คำอธิบายขั้นตรวจทาน "ตรวจข้อมูลทั้งหมดก่อนยื่นคำขอ" (เดิม "ตรวจสอบสิ่งที่เซิร์ฟเวอร์บันทึกไว้ก่อนยืนยันส่ง") |

ต้องรู้: ปุ่ม "ถัดไป" ทุกขั้นเปลี่ยนหน้าตาด้วย จากปุ่มไล่สีเขียวเข้มมุมมน เป็นปุ่มแคปซูลสี leaf-700 แบบเดียวกับปุ่มหลักทั้งแอป เพราะเลือกให้ทั้งสองปุ่มใช้ primitive ตัวเดียว · ปุ่มยื่นคำขอเดิมสี leaf-600 คอนทราสต์ 3.57:1 ไม่ผ่าน AA ตอนนี้ 5.0:1
ไม่เปลี่ยน: ค่าที่บันทึก, แบบ กทล.1, ไม่มีตัวเลือกการแพทย์, ไม่มีอีโมจิ

## เทสต์
- เขียนก่อนแก้ แดงบน main ทั้ง 13 ข้อ: `red-on-main.txt` · เขียวบน branch 13/13: `green-on-branch.txt`
  - `apps/web-app/src/app/health/applications/new/_steps/steps/__tests__/wizard-choice-groups-show-tick-boxes.test.tsx` วัตถุประสงค์เป็น checkbox พร้อมสถานะ, ไม่มีการแพทย์, เมล็ด/แหล่งกำเนิดเป็น radiogroup, ลูกศรเลื่อนทั้งตัวเลือกและโฟกัส, ลักษณะพื้นที่เป็น checkbox, สิทธิที่ดินเป็น radiogroup, ช่องคำรับรองเป็นตัวเดียวกับช่องวัตถุประสงค์ (class เท่ากันทุกตัว ไม่มี input checkbox ของเบราว์เซอร์), ปุ่มยื่นคำขอและถัดไปมี class ของ variant primary, คำอธิบายขั้น 6
  - `.../__tests__/step1-choices-are-radios.test.tsx` ประเภทคำขอ ยื่นในนาม (ตัวที่ดูอย่างเดียวกดไม่ได้) ชนิดพืช เป็น radiogroup
- ชุดที่แตะ รันบนเครื่องทำงาน (applications/new, holder, application-flow, establishments) หลังรอบแก้: ผ่านทั้งหมดยกเว้น 2 ไฟล์ที่ตกบน main ด้วยเมื่อรันจาก worktree (`preview/__tests__/resubmit-button-renders.test.tsx`, `_components/__tests__/application-step-page-url-skip-guard.test.tsx`) · ใน gate ที่เช็กเอาต์สะอาด สองไฟล์นี้ผ่าน
- e2e `e2e-g4/a01v2-wizard.spec.ts`, `playwright/a-z-lifecycle.mjs`, `e2e-g4/g4-helpers.ts` ปรับตัวเลือกจาก aria-pressed เป็น label + role=checkbox/radio (ไม่ได้รัน e2e รอบนี้)

## ภาพ (`screenshots/`)
เดินด้วย next dev จาก tree ผ่าน proxy อ่านอย่างเดียวไป staging (`scripts/shoot.js`) · ชื่อ ชื่อบริษัท เลขบัตร เบอร์ อีเมล เลขคำขอ ปิดไว้ก่อนถ่าย · proxy ปฏิเสธการเขียนทุกครั้ง ผ่านเฉพาะ GET และ login (`proxy-summary.txt`) จึงขึ้น "บันทึกไม่สำเร็จ" ที่หัวจอ
- ก่อน (main `53976fc5e`): `before-{desktop,mobile}-light-step{1..6}.png`, `before-{desktop,mobile}-dark-step4.png`, `*-step4-purpose-crop.png`
- หลัง: `after-{desktop,mobile}-{light,dark}-step{1..6}.png`, `*-step4-purpose-crop.png`
- คีย์บอร์ด: `after-*-step4-keyboard-checkbox-focus.png`, `after-*-step4-keyboard-radio-focus.png` · ผลวัด `keyboard/*.json`: Space ติ๊ก/เอาติ๊กออก, ลูกศรซ้ายจากวงกลมที่เลือกอยู่ย้ายโฟกัสและเลือก "เมล็ดพันธุ์", Tab เข้ากลุ่มวงกลมลงที่ตัวที่เลือกอยู่ตัวเดียว, เส้นโฟกัส 2px สีวงแหวนรอบกระเบื้อง
- desktop 1440, mobile 390 (ภาพ 2x)

## คอนทราสต์ (`contrast.json`, `scripts/contrast.mjs` คำนวณจาก token ใน globals.css)
ทุกคู่ผ่าน AA ทั้งสองโหมด เช่น ตัวหนังสือรองบนพื้นขั้น 6.2 → 9.3:1 (สว่าง), 6.5 → 10.3:1 (มืด) · หัวแบบฟอร์มสว่าง 2.6 → 9.5:1 · เครื่องหมายที่เลือกแล้วบนกระเบื้อง 4.6:1 (สว่าง) 5.4:1 (มืด) · ขอบช่องว่าง 4.7:1 / 6.3:1

## ตรวจ
- ตรวจอิสระ sonnet รอบ 1: CHANGES (e2e ยังชี้ aria-pressed, ปุ่มถัดไปเปลี่ยนหน้าตา, ข้อย่อย 5 ข้อ) · แก้ใน `19c25410e`
- ตรวจอิสระ sonnet รอบ 2: APPROVE · ความปลอดภัย: ไม่มี dangerouslySetInnerHTML ใหม่ ไม่มีทางข้อมูลใหม่
- eslint ไฟล์ที่แตะ: 0 error (warning ลำดับ class เดิมของไฟล์ ลดจาก 9 เหลือ 6)
- `tsc --noEmit` ของ web-app: รอบแรกเจอ 2 error ใน `choice.tsx` (exactOptionalPropertyTypes กับ `disabled`) แก้แล้ว รอบสอง 0 error · ชุดเทสต์ที่แตะหลังแก้ 67 ชุด 706/706 ผ่าน · การแก้นี้เป็นชนิดข้อมูลอย่างเดียว เกิดหลัง gate `19c25410e`

## gate
`~/work/state/heavy.sh timeout 7200 ~/work/state/gate/gate-locked.sh 19c25410e7fefeeb3c42352baa7c016b33ea7219` แล้ว `compare.sh` เทียบ gate ของ main `110d5ed96`
- suite-green: Tests 15935 ผ่าน, 7 ตก, 52 ข้าม · ตก 3 ชุด เป็น integration ฝั่ง backend ทั้งหมด · **ความล้มเหลวใหม่เทียบ main: ไม่มี** (`test-output.txt`)
- ratchet ไม่ขยับ (`ratchet-before-after.txt`) · ผล probe ทั้งหมด `probe-results.json`
- สถานะ check เทียบ main: เหมือนกันทุกตัว ยกเว้น `deploy-drift` (main pass, รอบนี้ fail) เพราะ staging และ demo ยังรัน `b8d27a690` ขณะที่ origin/main คือ `53976fc5e` (ช้ากว่า 5 commit) ตามที่ probe รายงานใน `probe-results.json` เป็นสถานะของเครื่องที่ deploy ไม่ใช่ของ branch นี้
- secret-scan-deep: 68 รายการที่ไม่อยู่ใน gitleaks-base อยู่ใน 6 commit ที่เป็นบรรพบุรุษของ main `53976fc5e` ทั้งหมด (evidence/payment-trial-marking, issuance-holder-complete, a8-walk-findings-3, renewal-keeps-farm) ไม่มีรายการจาก commit ของ branch นี้ · ไฟล์ข้อความใน evidence นี้ผ่าน `gitleaks detect --no-git` ทุกไฟล์
- gate รอบสองบน `8643b6e34` (หลังแก้ชนิดข้อมูลของ tsc): Tests 15935 ผ่าน 7 ตก 52 ข้าม · ความล้มเหลวใหม่เทียบ main ไม่มี · check เหมือนรอบแรกทุกตัว · gitleaks รายการใหม่อยู่ใน commit ของ main ทั้งหมด (เพิ่ม `212943a3e` evidence/launch-guards-1)
- merge origin/main `20bd48b84` เข้า branch (`07a0a74a3`): ไม่มี conflict ในเนื้อไฟล์ · ย่อหน้าใหม่ "ยังไม่ได้ตรวจ" ของ requirement-slot-card ใช้ `text-[13px] text-foreground/80` · ชุดเทสต์ที่แตะ 67 ชุด 708/708 · tsc web-app rc=0 · ไม่ได้รัน gate เต็มบนหัวที่ merge แล้ว (ตามคำสั่ง coordinator)
- ไม่ได้ทำ: วิดีโอและ trace ของ playwright (มีภาพก่อน/หลังและผลวัดคีย์บอร์ดแทน), e2e a01v2 ไม่ได้รัน
