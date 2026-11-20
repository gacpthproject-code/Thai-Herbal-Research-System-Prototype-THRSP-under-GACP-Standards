# Runbook: เดินตรวจทุกระบบย่อยหลัง deploy

คำสั่ง 158(5): ทุกครั้งที่ deploy ต้องเดินตรวจทุกระบบย่อย ไม่ใช่แค่เส้นใบรับรอง 12 ขั้น
ตัวเดินตรวจคือ `scripts/walk/deploy-walk.sh` รันหนึ่งครั้งได้ผลรายแถวเป็น PASS, FAIL หรือ NOT-YET

## รัน

```bash
scripts/walk/deploy-walk.sh https://demo.gacpth.com --target demo --rows identity,accounts,verify,pdpa,subsystems,jobs,finance
scripts/walk/deploy-walk.sh https://demo.gacpth.com --target demo --rows identity,verify,subsystems
scripts/walk/deploy-walk.sh --list
```

- `--rows` เลือกแถว ตามรหัสใน `--list`
- `--out <dir>` ที่เก็บผล ค่าปริยาย `~/work/state/walk/deploy-walk-<target>-<เวลาไทย>`
- `--target demo` ต้องใส่เองทุกครั้งที่ชี้ demo ไม่มีค่าปริยาย

ตัวห่อรันผ่าน `scripts/ops/heavy.sh` (งานหนักทีละงาน · ตั้ง `GACP_HEAVY_SH` เพื่อชี้ตัวอื่นได้) และหยุดเองที่ 3 ชั่วโมง
ถ้าตัวแปร `GACP_HEAVY_HELD` มีค่า ตัวห่อจะไม่เข้า heavy.sh ซ้ำ เพราะแปลว่ามีโปรเซสแม่ถือ lock อยู่แล้ว
`scripts/ops/heavy.sh` export `GACP_HEAVY_HELD=1` ให้คำสั่งลูกเอง (แพตช์ที่เคยรอ operator รวมอยู่ในตัวใหม่แล้ว · คำสั่ง 164)

## ผลลัพธ์

| exit | ความหมาย |
|---|---|
| 0 | ไม่มีแถวไหน FAIL (อาจมีแถว NOT-YET) |
| 1 | มีแถว FAIL อย่างน้อยหนึ่งแถว |
| 2 | ปฏิเสธก่อนเริ่ม: เครื่องไม่รู้จัก, demo ไม่มี `--target demo`, กุญแจ Stripe ไม่ใช่โหมดทดสอบ, ไฟล์ตั้งค่าไม่ใช่ 0600 |

เมื่อสคริปต์ deploy เรียกตัวเดินตรวจเป็นขั้นสุดท้าย สคริปต์ deploy จบด้วย exit ของตัวเดิน
ถ้ามีแถว FAIL สคริปต์ deploy จึงจบด้วย 1 ทั้งที่ deploy สำเร็จแล้ว ดูบรรทัด `DEPLOY DONE` ก่อนสรุปว่า deploy ล้ม

ในโฟลเดอร์ผลมี `result.json`, `result.th.md`, `walk.log`, `probes.log`, `net/actions.jsonl` (ทุกการเขียนที่ส่งไปเครื่อง),
`shots/` และ `net/text/` (ภาพและข้อความหน้าจอที่ปิดชื่อ เลขประจำตัว เบอร์ อีเมลแล้ว)

แถวผ่านเมื่อทุกข้อในแถวมีสถานะ `PASS` ตรงตัวเท่านั้น ข้อที่ยังไม่มี probe เป็น NOT-YET พร้อมเหตุ ไม่นับเป็นผ่าน
ข้อที่ไม่มีสถานะหรือสถานะไม่ใช่ PASS, FAIL, NOT-YET ถูกเปลี่ยนเป็น FAIL และรายละเอียดบอกว่าสถานะเดิมคืออะไร
probe ใน `scripts/probes` ที่ตรวจไม่ได้ (exit 2 BLOCKED) นับเป็น FAIL

## แถว

| รหัส | ตรวจอะไร | เขียนข้อมูลไหม |
|---|---|---|
| identity | revision ของ backend เท่ากับ frontend และ `deploy-drift.sh` เฉพาะแถวของเครื่องนี้ | ไม่ |
| cert-path | ยื่น ชำระ จัดคิว ตรวจเอกสาร ชำระ นัด ตรวจพื้นที่ อนุมัติ ออกใบ ผ่านหน้าเว็บจริง | คำขอทดสอบ 1 รายการต่อรอบ |
| finance | ใบเสนอราคา, PromptPay ของ Stripe โหมดทดสอบ, webhook ตัดยอด, ใบเสร็จ, ใบลดหนี้ที่บันทึกไว้, หน้ากระทบยอด, Stripe `/v1/balance` และ SQL ของ `money-equation.sh` กับ `quotation-closure.sh` รันในคอนเทนเนอร์ | ไม่ (นอกจากการชำระใน cert-path) |
| jobs | `SHOW timezone` ของ backend เป็น UTC, `runCorrectionDeadlineSweep` แบบ dryRun ในคอนเทนเนอร์, ใบที่หมดอายุตรวจสาธารณะแล้วไม่ขึ้นว่าใช้ได้, แจ้งเตือนของคำขอทดสอบ | ไม่ |
| tnt | แปลงเลือกได้หลังออกใบเท่านั้น, รอบปลูก, ล็อต, `/api/trace/lot/:id`, หน้า `/trace/lot/:id` | รอบปลูกและล็อตใต้ใบทดสอบ |
| accounts | รหัสผ่านตรง hash, ล็อกอิน, 2FA เจ้าหน้าที่, ตารางสิทธิ์จาก `canonical-rbac.js`, ผู้ยื่นเปิดคำขอของผู้ถือรายอื่นไม่ได้ | ไม่ |
| verify | เลขที่ไม่มีได้ NOT_FOUND, ใบของรอบนี้ใช้ได้และลายเซ็นถูก, หน้า `/verify/<เลข>` | ไม่ |
| pdpa | ประกาศความเป็นส่วนตัว, ความยินยอมอ่านได้เฉพาะเจ้าของ, คำตอบสาธารณะไม่มีข้อมูลบุคคล | ไม่ |
| subsystems | ตารางเทียบมาตรฐานทุกช่องมีเลขข้อและแหล่ง, ระบบแบบสำรวจ, ฐานข้อมูลสมุนไพรมีครบ 6 ชนิดและมีรายการอ้างแหล่ง, บริการตรวจภาพ, เอกสารสถาปัตยกรรมตรงกับโค้ดของ revision ที่เครื่องรัน | ไม่ |

## กติกาที่ตัวเดินตรวจบังคับเอง

- ก่อนเริ่ม `/api/payments/mode` ต้องตอบ `TRIAL` และกุญแจ Stripe ในคอนเทนเนอร์ต้องขึ้นต้น `sk_test_`/`pk_test_` ไม่งั้นไม่เริ่ม
- ค่าของ `STRIPE_SECRET_KEY` และ `DATABASE_URL` ไม่ออกจากคอนเทนเนอร์ ทุกงานที่ต้องใช้สองค่านี้รันในคอนเทนเนอร์ผ่าน `docker exec` และส่งกลับแค่ผล:
  - `container/stripe-keys.js` จำแนกคำนำหน้ากุญแจ คืนแค่ `test`/`live`/`absent`/`unknown` และถ้าขอ ยิง Stripe `/v1/balance` เฉพาะเมื่อกุญแจลับเป็น test คืนแค่ HTTP status
  - `container/money-counts.js` รัน SQL เดียวกับ `scripts/probes/money-equation.sh` และ `quotation-closure.sh` ผ่าน prisma ของ backend คืนแค่จำนวนแถว หรือรหัสข้อผิดพลาดเมื่อนับไม่ได้
  - `container/db-session-timezone.js` รันคำสั่งเดียวกับ `scripts/probes/db-session-timezone.sh` ผ่าน prisma ของ backend คืนแค่ชื่อ zone หรือรหัสข้อผิดพลาด
  - เทสต์ `scripts/walk/deploy-walk.test.js` ล้มเมื่อโค้ดฝั่งเครื่องทำงานอ้างถึงสองค่านี้, เมื่อสคริปต์ในคอนเทนเนอร์ตัวอื่นนอกจาก `stripe-keys.js` อ่าน `process.env` และเมื่อ SQL ในคอนเทนเนอร์ต่างจาก SQL ของ probe
- revision ที่อ่านจาก `/api/health` ต้องเป็น sha 40 ตัว ก่อนส่งให้ `git archive` (เรียกด้วยรายการอาร์กิวเมนต์ ไม่ผ่าน shell)
- ทุกรหัสผ่านถูกเทียบกับ hash ในคอนเทนเนอร์ก่อนล็อกอิน บัญชีที่ไม่ตรงหรือถูกล็อกจะไม่ถูกล็อกอิน ล็อกอินบัญชีละครั้งต่อรอบ ไม่ลองซ้ำ
- 2FA ใช้ได้ 5 ครั้งต่อ 15.5 นาทีร่วมกันทุกรอบ (`~/work/state/walk/.deploy-walk-mfa-slots-<target>.json`) ครบแล้วรอเอง
- ทุกไฟล์ที่เขียนผ่านตัวปิดข้อมูลบุคคลและกุญแจ

## ไฟล์ตั้งค่า (นอก repo)

`~/work/state/walk/deploy-walk.config.json` สิทธิ์ 0600 (เปลี่ยนที่ด้วย `DEPLOY_WALK_CONFIG`) มีหนึ่งส่วนต่อเครื่อง:

```json
{
  "demo": {
    "backendContainer": "gacp-backend-demo",
    "ssh": "deploy@119.59.105.140",
    "totpScript": "<home>/work/state/walk/totp-code.sh",
    "fixtures": "<โฟลเดอร์ไฟล์แนบทดสอบ มี inspection/field-1..5.jpg>",
    "walkApplication": { "holderRx": "<ชื่อผู้ถือของบัญชีเดินตรวจ>", "plant": "ขมิ้นชัน", "contact": "<ชื่อผู้ประสานแปลง>" },
    "accounts": {
      "applicant": { "envFile": "<ไฟล์ 0600 มี WALK_NID WALK_PW WALK_PHONE>" },
      "dispatcher": { "envFile": "<ไฟล์ 0600 มี PROVIDER_ID PASSWORD>" }
    }
  }
}
```

บทบาทที่ต้องมี: `applicant` `dispatcher` `reviewer` `inspector` `approver` `finplat`
บัญชีของ demo ยังไม่มี (ต้องสร้างผ่าน UI/API ของ demo · คำสั่ง 164 ไม่ seed) · บัญชีที่ไม่ได้ตั้งหรือไฟล์ env ยังไม่มี = ข้อที่ต้องล็อกอินเป็น NOT-YET พร้อมชื่อบทบาท ไม่ใช่ FAIL · ไฟล์ตั้งค่าผิดรูปแบบอื่น = exit 2

## หลัง deploy (แก้ 2026-11-08 · ไม่มี staging แล้ว)

deploy ขึ้น demo ตาม [deploy-demo.md](deploy-demo.md): เดินตรวจ baseline ก่อนแตะเครื่อง (ขั้น 1) และเดินแถวเดิมหลัง `demo-up.sh` (ขั้น 7)
แล้วเทียบด้วย `node scripts/walk/walk-compare.js <baseline>/result.json <post>/result.json`
ต้องไม่มี FAIL ใหม่ (แถวที่ baseline เป็น PASS แล้วกลายเป็น FAIL หรือหายไป) ตามคำสั่ง 105(7) และ 158(5) แก้ 2026-11-08 · มี FAIL ใหม่ = `demo-rollback.sh`
แถว cert-path และ tnt ปิดบน demo จนกว่าจะมีบัญชีเดินตรวจของ demo และ operator ตัดสินเรื่องใบทดสอบในหน้าตรวจสอบสาธารณะ

## ข้อจำกัดที่รู้แล้ว

- การบันทึกคืนเงินใหม่และคำขอลบข้อมูลตาม PDPA ยังเป็น NOT-YET
- แถว identity จะ FAIL ทุกครั้งที่ main ขยับหลัง deploy เพราะ `deploy-drift.sh` เทียบกับ `origin/main`
- ตัวเดินจอใน `scripts/walk/steps` มาจากชุดเดินตรวจ A8 รอบ 2 (`~/work/state/walk/round2-a1a0362bf/scripts`) ผูกกับข้อความบนหน้าจอ ถ้าหน้าจอเปลี่ยนคำ ต้องแก้ step ด้วย
- ข้อ "ยกเลิกเมื่อพ้นกำหนด" และ "CAR 30 วัน" ในแถว jobs เป็นการสังเกตสถานะในฐานข้อมูล ไม่ได้กระตุ้น job ให้รันตอนเดินตรวจ
- ภาพหน้าจอใน `shots/` ปิดข้อมูลด้วย regex และรายชื่อที่ตัวเดินเก็บได้จากคำตอบ JSON ชื่อที่ไม่เคยผ่าน JSON ที่ตัวเดินอ่านอาจยังอยู่ในภาพ grep มองไม่เห็นข้อความในภาพ ก่อนส่งโฟลเดอร์ผลต่อให้คนเปิดดูภาพสุ่มอย่างน้อยหนึ่งภาพต่อแถว
