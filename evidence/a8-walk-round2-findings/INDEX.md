# a8-walk-round2-findings · หลักฐาน

สาขา `fix/a8-walk-round2-findings` บน main a1a0362bf · ชั้นงาน B (`scripts/probes/tier-check.sh` ตอบ TIER=B) · ข้อค้นพบมาจากรายงานเดินรอบ 2 (`~/work/state/reviews/a8-walk-round2-report.md`)

คำขอที่ใช้พิสูจน์คือ APP-2569-MVUOY4RI-746DB8 (cd15ff15) บน staging สถานะ CERTIFIED ขมิ้นชัน ผู้ถือเป็นนิติบุคคล วัตถุประสงค์ ศึกษาวิจัย ใน `formData.submittedAt` มีค่า 2026-10-30T08:10:55Z

## ผลต่อข้อ

| ข้อ | ก่อนแก้ | หลังแก้ | เทสต์ที่ล้มก่อนแก้ |
|---|---|---|---|
| 1 F-A8c-01 วันที่ยื่นใน กทล.1 | `pdf-text/before-katorlor1-cd15ff15.txt` บรรทัด 12 "วันที่ยื่น ยังไม่ได้ยื่น" | `pdf-text/after-katorlor1-cd15ff15.txt` บรรทัด 12 "วันที่ยื่น 30 ตุลาคม 2569" · `shots/after-01-k1-filing-date.png` | `apps/backend/__tests__/unit/katorlor1-prints-the-filing-date.test.js` (ก่อนแก้ล้ม 5 จาก 6) |
| 2 F-A8c-02 วัตถุประสงค์ใน กทล.1 | "☐ เพื่อประโยชน์ทางการแพทย์ ☐ เพื่อการส่งออก" ไม่มีช่องไหนติ๊ก | "☑ ศึกษาวิจัย ☐ ส่งออกเพื่อการค้า ☐ แปรรูปหรือจำหน่ายเพื่อการค้า" · `shots/after-02-k1-purpose-row.png` | `apps/backend/__tests__/unit/katorlor1-purpose-line.test.js` (ก่อนแก้ล้ม 7 จาก 10) |
| 3 ป้ายสถานะหัวหน้าตัวอย่าง | `pdf-text/before-preview-header-walk.txt` "สถานะ: CERTIFIED" | "สถานะ: ได้รับใบรับรอง GACP" และวันที่ยื่นเป็นวันยื่นจริง · `shots/after-03-preview-header.png` | `apps/web-app/.../preview/__tests__/preview-header-speaks-thai.test.tsx` (ก่อนแก้ล้ม 3 จาก 3) |
| 4 F-A8c-03 ปุ่ม "แก้ไขและส่งข้อมูลใหม่" | `shots/before-04-detail-cta-lands.png` ไปหน้า /edit | ไป `/health/applications/<id>/revision` | `apps/web-app/.../__tests__/detail-summary-reads-the-filing-as-stored.test.ts` และ `detail-action-follows-holder.test.tsx` ที่เปลี่ยน href ที่คาดเป็น /revision |
| 5 F-A8b-04 กล่องข้อมูลคำขอ | `shots/before-05-detail-after-submit.png` มี "-" สี่ช่อง | `shots/after-05-detail-application-box.png` ชื่อผู้ยื่น (ปิดชื่อ) นิติบุคคล แปลงขมิ้นชันทดสอบ-A8 รอบสอง 200 ตร.ม. | `detail-summary-reads-the-filing-as-stored.test.ts` (ก่อนแก้ล้ม 6 จาก 7) |

ข้อ 4 ไม่มีภาพหลังแก้จากของจริง เพราะ staging ไม่มีคำขอสถานะ REVISION_REQUESTED ในตอนนี้ และการสร้างใหม่ต้องเขียนข้อมูลลง staging หลักฐานหลังแก้ของข้อนี้คือเทสต์ที่เรนเดอร์หน้ารายละเอียดใน jsdom แล้วหาลิงก์ `/revision`

## ทำภาพอย่างไร

- `tools/render-k1.js` เรนเดอร์ กทล.1 จากแถวคำขอของ staging (อ่านอย่างเดียวผ่านคอนเทนเนอร์ backend พร้อมผลเครื่องมือเอกสาร) สองรอบ คือด้วยไฟล์ของ main a1a0362bf และด้วยไฟล์ของสาขา แล้วใช้ `pdftotext` ข้อความที่เก็บไว้ตัดมาแค่หัวฟอร์มกับแถววัตถุประสงค์ ส่วนที่ ๑ ไม่ได้เก็บ
- `tools/shoot.js` เปิดหน้าเว็บของสาขา (`next dev` ผ่าน heavy.sh) แล้วส่งต่อทุกคำขอ GET `/api/*` ไป staging ด้วยเซสชันของผู้ยื่นที่ล็อกอินผ่านหน้าจริง คำขออื่นที่ไม่ใช่ GET ถูกตัด ไม่มีการเขียนอะไรลง staging ยกเว้นตัว `/katorlor1` ซึ่งตอบด้วย HTML จากตัวเรนเดอร์ของสาขา เพราะ staging ยังรันโค้ด main รายการคำขอทั้งหมดอยู่ใน `shots/requests.txt`
- ชื่อ เลขประจำตัว และเบอร์โทรถูกแทนเป็น [ปิดชื่อ] / [ปิดไว้] ก่อนถ่ายภาพ
- ไม่เก็บภาพเต็มหน้าของตัวอย่าง เพราะแถวที่ดึงตรงจากฐานข้อมูลยังไม่ได้ถอดรหัสฟิลด์ที่เข้ารหัสไว้ ส่วนที่ ๑ ในภาพนั้นจึงไม่ตรงกับที่ผู้ใช้เห็น และไม่เกี่ยวกับข้อ 1-5

## การตัดสินเรื่องช่องการแพทย์ (ข้อ 2)

แบบ กทล.1 ของกรมพิมพ์วัตถุประสงค์สองช่อง คือ "☐ เพื่อใช้ทางการแพทย์ ☐ เพื่อการส่งออก" (`reports/research/2026-09-01-dtam-application-baseline/facts.md:21` อ่านจาก gacp-1.pdf เมื่อ 2026-09-01 · วันนี้ดาวน์โหลดซ้ำไม่ได้เพราะเว็บกรมกันด้วย Incapsula) โค้ดเดิมพิมพ์ "เพื่อประโยชน์ทางการแพทย์" ซึ่งไม่ตรงกับคำในแบบอยู่แล้ว

สาขานี้เลิกพิมพ์ช่องการแพทย์ และพิมพ์สามวัตถุประสงค์ที่ผู้ยื่นเลือกได้จริงแทน เหตุผลคือ
1. operator สั่งถอดวัตถุประสงค์การแพทย์เมื่อ 2026-10-05 ("เอา เพื่อการแพทย์ออก เอาที่มี ภท. รับรองเท่านั้น") โดยรู้ว่าแบบของกรมมีแค่สองช่อง
2. ช่องที่ไม่มีจอไหนติ๊กได้ ไม่ได้บอกอะไรผู้อ่าน และทำให้คำขอวิจัยหรือแปรรูปดูเหมือนไม่ได้เลือกวัตถุประสงค์ (กรณีขมิ้นชันในรอบเดินนี้ไม่มีอะไรบอกวัตถุประสงค์บนแบบเลย)
3. เคยมีกรณีแบบเดียวกันมาแล้ว คือช่อง "อื่น ๆ ระบุ" ของลักษณะพื้นที่ถูกถอดจากแบบที่ระบบพิมพ์ตามมติ 2026-09-11

ถ้า operator ต้องการให้แบบที่พิมพ์มีช่องตรงกับกระดาษของกรมทุกช่อง ทางเลือกคือพิมพ์ "☐ เพื่อใช้ทางการแพทย์ (ไม่รับแล้ว)" ไว้เป็นช่องแรก แล้วต่อด้วยสามช่องนี้ ส่วนนี้แก้ที่ `PURPOSE_BOXES` จุดเดียว

## Gate

`heavy.sh timeout 7200 gate-locked.sh fdb5aaee0a14c646d96168bcaccc5d26d21df215` แล้ว `compare.sh fdb5aaee0… e3ed6da89…` (gate ล่าสุดของ main):
- ไม่มีความล้มเหลวใหม่ ("NEW failures vs main gate e3ed6da89:" ว่าง)
- ชุดที่ล้มเหมือน main ทุกชุด 3 ชุด 7 เทสต์: `a0-pr2-per-hop-invariant`, `onsite-decision-mint-e2e`, `status-writer-audit-default-invariant` (integration)
- Tests: 7 failed, 52 skipped, 15928 passed (main e3ed6da89: 7 failed, 52 skipped, 15883 passed)
- gitleaks 68 รายการ เท่ากับ main ทุกบรรทัด · workspace-clean, deploy-drift, probe-ci, integration-no-skip ล้มเหมือน main
- ผล: `~/work/state/gate/out/evidence/gate/fdb5aaee0a14c646d96168bcaccc5d26d21df215.json`

## รอบแก้ 1 (ตามรีวิว NOT YET)

กติกาเดียวทุกจอ: วันที่ยื่นคือ `formData.submittedAt` (API ส่งเป็น `submittedAt` หรือ null) ถ้าไม่มีค่านี้ จอไม่เอาวันอื่นมาแทน ร่างแสดง "ยังไม่ได้ยื่น" แถวที่ยื่นแล้วแต่ไม่มีบันทึกวัน (เช่น seed APP-68-002) แสดง "ไม่มีบันทึกวันที่ยื่น" เพราะการพูดว่า "ยังไม่ได้ยื่น" กับคำขอที่อยู่ในขั้นตรวจแล้วเป็นความเท็จ ฝั่งเว็บอยู่ที่ `apps/web-app/src/lib/filing-date.ts` ฝั่ง กทล.1 อยู่ที่ `filingDate()` ใน `katorlor1-template-service.js`

| จุด | ก่อนแก้ (เทสต์ล้ม) | หลังแก้ | เทสต์ |
|---|---|---|---|
| รายการคำขอฝั่งเจ้าหน้าที่ | แถวไม่มีวันยื่นแสดง "-" (หน้าไม่ล่ม: หน้านี้ใช้ `formatThaiDate` ของ `@/utils/thai-date` ซึ่งรับ null ได้ ไม่ใช่ตัวใน `lib/utils.ts`) | "ไม่มีบันทึกวันที่ยื่น" / "ยังไม่ได้ยื่น" | `provider/applications/__tests__/list-dates-the-filing-it-has.test.tsx` |
| หัวหน้ารายละเอียดของผู้ยื่น | ร่างแสดง "ยื่นเมื่อ 27 ก.ย. 2569" (วันเปิดร่าง) | "ยังไม่ได้ยื่น" | `health/applications/[id]/__tests__/detail-header-dates-the-filing.test.tsx` (ล้ม 2 จาก 3) |
| รายการล่าสุดบนแดชบอร์ดผู้ยื่น | ร่างแสดงวันเปิดร่าง | "ยังไม่ได้ยื่น" · วันที่เป็นเวลาไทย | `health/dashboard/__tests__/dashboard-dates-the-filing.test.tsx` |
| คิวบนแดชบอร์ดเจ้าหน้าที่ | ยืมวันเปิดร่าง/วันนัด/วันแก้ล่าสุดมาแทน | วันยื่นจริง หรือข้อความข้างบน | `provider/dashboard/__tests__/queue-dates-the-filing.test.ts` (ล้ม 2 จาก 3) |
| หน้าเปลี่ยนสถานะฉุกเฉิน | "-" | ข้อความข้างบน | `admin/applications/[id]/force-status/__tests__/force-status-dates-the-filing.test.tsx` |
| หัวหน้าตัวอย่าง | แถวยื่นแล้วไม่มีบันทึกพิมพ์ "ยังไม่ได้ยื่น" | "ไม่มีบันทึกวันที่ยื่น" | `preview-header-speaks-thai.test.tsx` |
| กทล.1 | แถวยื่นแล้วไม่มีบันทึกพิมพ์ "วันที่ยื่น ยังไม่ได้ยื่น" | "วันที่ยื่น ไม่มีบันทึก" | `katorlor1-prints-the-filing-date.test.js` |
| ใบเสนอราคา "ยื่นเอกสารเมื่อวันที่" | อ่านคอลัมน์ที่ไม่มีอยู่จริง พิมพ์ "________" ทุกใบ | วันยื่นจริง | `quotation-prints-the-filing-date.test.js` |
| ตรวจ metadata รูป (fraud) | อ่านคอลัมน์ที่ไม่มี การเทียบวันไม่เคยทำงาน | รูปที่ถ่ายหลังวันอัปโหลดเป็นความผิดปกติ · รูปเก่ากว่าวันยื่นเกิน 1 ปีเป็นคำเตือน · รูปแก้ไขที่ถ่ายหลังวันยื่นไม่ถูกตีว่าผิดปกติ | `fraud-metadata-dates-against-the-filing.test.js` (ล้ม 2 จาก 3) |
| รายละเอียดคำขอของการเงิน | `submittedAt` = `createdAt` | `formData.submittedAt` (formData อ่านฝั่งเซิร์ฟเวอร์เท่านั้น ไม่ส่งออก) | `integration/staff-application-reads-real-postgres.test.js` F3 (รันใน gate) |

ภาพ `shots/before-01-03-kortorlor1-preview.png` ปิดที่อยู่ ที่ตั้ง เลขโฉนด และพิกัดแล้วด้วย `tools/mask-shot.py` · `shots/before-05-detail-after-submit.png` ตรวจแล้วไม่มีที่อยู่ โฉนด หรือพิกัด (มีแค่จังหวัด) จึงไม่ได้แก้ · ภาพเดิมที่ยังไม่ปิดยังอยู่ในประวัติ git ของสาขาที่ commit 457b073a7

### Gate รอบแก้ 1

`heavy.sh timeout 7200 gate-locked.sh a5bd70bea6fe6dc5cad5cdbd84000e476d0b9bcb` แล้ว `compare.sh a5bd70bea… e3ed6da89…`:
- ไม่มีความล้มเหลวใหม่ · ชุดที่ล้ม 3 ชุด 7 เทสต์เหมือน main (`a0-pr2-per-hop-invariant`, `onsite-decision-mint-e2e`, `status-writer-audit-default-invariant`)
- Tests: 7 failed, 52 skipped, 15934 passed · `staff-application-reads-real-postgres` ผ่านบน Postgres จริง
- gitleaks 68 รายการ เท่ากับ main ทุกบรรทัด · workspace-clean, deploy-drift, probe-ci, integration-no-skip ล้มเหมือน main
- ผล: `~/work/state/gate/out/evidence/gate/a5bd70bea6fe6dc5cad5cdbd84000e476d0b9bcb.json`
