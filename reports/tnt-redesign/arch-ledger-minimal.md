# สถาปัตยกรรม Track & Trace ฉบับออกแบบใหม่ — "บัญชีเหตุการณ์ขั้นต่ำที่พิสูจน์ได้"

**วันที่:** 2026-08-23 · **ผู้เขียน:** agent (สถาปัตยกรรม) · **สถานะ:** ข้อเสนอ — `BLOCKED(operator:decisions-D1..D9)` + `BLOCKED(operator:Thai-lawyer-review)`
**แทนที่:** `docs/superpowers/specs/2026-08-20-planting-tnt-design.md` §4.2 และ §7 (กติกา R10–R14 ยังยืนเกือบครบ — ดู §11)
**ขอบเขต:** ตั้งแต่เมล็ดลงดิน จนถึงโรงงานรับถุง

---

## 0. อ่านก่อน — คำตอบตรง ๆ ต่อคำว่า "ถูกต้อง 100%"

operator สั่งว่า "ออกแบบกันใหม่เอาให้ถูกต้องแบบ 100% เพราะต้องถูกตามกฏหมาย ถูกต้องตามหลัก
Track and Trace และท่าถูกต้อง 100% และต้องทำตามมาตราฐานสูงสุด" — และเหตุผลหลักคือ "ต้องกันข้อพิพาท"

**คำตอบที่ซื่อสัตย์คือ: "ถูกต้องตามกฎหมาย 100%" ไม่มีใครรับรองได้จากหน้าคีย์บอร์ด และผมจะไม่แกล้งทำว่าได้**
สิ่งที่ทำได้จริงและเป็นสิ่งที่เอกสารนี้ทำ คือ:

1. ออกแบบให้ตรงกับ **เกณฑ์ที่กฎหมายไทยเขียนไว้เป็นตัวหนังสือ** (พ.ร.บ.ธุรกรรมทางอิเล็กทรอนิกส์ ม.9, 10, 11, 12, 26)
   แล้วเขียนกำกับทุกจุดว่าข้อออกแบบนั้นตอบเกณฑ์ข้อไหน
2. ยืมคำศัพท์และรูปทรงจาก **มาตรฐานสากลที่ให้สัตยาบันแล้ว** (GS1 EPCIS 2.0 / CBV 2.0) เฉพาะจุดที่ยืมแล้วไม่มีต้นทุน
3. แยกให้ชัดว่าอะไรคือ **ข้อกฎหมาย / แนวปฏิบัติของหน่วยงานกำกับ / มาตรฐานสากล / good practice / การเลือกของเรา**
4. เขียนรายการ **สิ่งที่ยังยืนยันไม่ได้** ไว้ตรง ๆ (§13) และ **จุดที่ทนายไทยต้องเซ็นก่อนใช้จริง** (§14)

**ป้ายกำกับที่ใช้ทั้งเอกสาร:**
`[LEGAL]` ข้อกฎหมาย มีการอ้างอิง · `[REG]` แนวปฏิบัติหน่วยงานกำกับ · `[STD]` มาตรฐานสากล ·
`[GP]` good practice จากระบบที่รันจริง · `[OURS]` การตัดสินใจของเรา ไม่มีใครบังคับ · `[CODE]` ข้อเท็จจริงในโค้ด ตรวจแล้ววันนี้

> **คำเตือนสำคัญที่สุดในเอกสารนี้:** *ไม่มีบรรทัดใดในเอกสารนี้ที่เป็นข้อสรุปเรื่องกฎหมายกัญชาไทยปี 2569*
> การวิจัยพื้นฐานทั้ง 4 เลนไม่มีเลนใดอ่านตัวบทประกาศสมุนไพรควบคุม (กัญชา) พ.ศ. 2568 หรือกฎกระทรวงใด ๆ
> เรื่องกัญชาโดยเฉพาะยังเป็นช่องว่างที่คนต้องไปอ่าน ไม่ใช่ agent (§13 ข้อ U-1)

---

## 1. หลักการออกแบบ 5 ข้อ (ที่มาของทุกอย่างที่ตามมา)

| # | หลัก | เหตุผล |
|---|---|---|
| P1 | **บัญชีเหตุการณ์เดียว ต่อท้ายอย่างเดียว (append-only event log)** — ตารางแถวปัจจุบันทั้งหมดกลายเป็น "มุมมองที่คำนวณได้" (derived view) | `[STD]` EPCIS 2.0 §6.1 หน้า 34: *"There is no mechanism provided in either interface by which an application can delete or modify an EPCIS Event."* — ความเปลี่ยนแปลงไม่ได้เป็นเรื่อง **normative** ไม่ใช่รสนิยม |
| P2 | **สองเวลาเสมอ: เกิดเมื่อไหร่ / บันทึกเมื่อไหร่** และ **โชว์ช่องว่าง ไม่ซ่อน** | `[LEGAL]` พ.ร.บ.ธุรกรรมฯ ม.11 ให้ศาลชั่งน้ำหนัก "วิธีการที่ใช้สร้าง เก็บรักษา" — ระบบที่ฟอกบันทึกย้อนหลังให้ดูเหมือนบันทึกสด คือระบบที่แพ้เมื่อถูกซัก |
| P3 | **เซ็นตอนบรรจุ ไม่ใช่ล็อกแถว** — "แช่แข็ง" = เอกสารที่เซ็นแล้วแจกออกไป ไม่ใช่ flag ในฐานข้อมูลเรา | `[LEGAL]` ม.10: ต้อง "ใช้วิธีการที่เชื่อถือได้ในการรักษาความถูกต้องของข้อความ **ตั้งแต่การสร้างข้อความเสร็จสมบูรณ์**" — flag ในตารางที่เราเขียนเองไม่ใช่ "วิธีการที่เชื่อถือได้" ในความหมายนี้ |
| P4 | **สมดุลมวลเป็นเงื่อนไขบังคับตอนออก QR ใบที่ 2** | `[GP]` ทุกคดีฟอกของที่มีเอกสารเปิดเผย (METRC California burner distros, Michigan 58 ปอนด์ที่มีในระบบแต่ไม่มีบนโลก, Randy Constant USD 142M) เป็นรูปเดียวกัน: ของจริงไหลเข้าภาชนะที่สะอาด — ตัวคุมที่ได้ผลไม่ใช่ป้าย แต่คือ**สมการ** |
| P5 | **ยืมคำศัพท์ ไม่รับมาตรฐานเต็มใบ** — ใช้ bizStep/disposition ของ CBV 2.0 เป็นค่าในคอลัมน์ แต่ไม่สร้าง EPCIS repository, ไม่แตะ GTIN/GLN/SSCC จนกว่าจะมี GS1 Company Prefix จริง | `[STD]`+`[OURS]` GTIN/GLN/SSCC ต้องมี prefix ที่ licence จาก GS1 Thailand และ **ห้าม sublicense** — การมั่วเลขที่หน้าตาเหมือน GS1 คือการผลิตข้อพิพาทที่ operator พยายามกันอยู่ ในนามกรมฯ (§12.3) |

**สรุปสถาปัตยกรรมในหนึ่งบรรทัด:** ตาราง `trace_events` หนึ่งใบ (ต่อท้ายอย่างเดียว, สองเวลา, hash chain ต่อ tenant)
→ มุมมองที่คำนวณจากมันสำหรับ UI/รายงาน → เอกสาร "ใบบันทึกการบรรจุ" ที่เซ็นและแจกออกตอนบรรจุ → สมการสมดุลมวลเป็นประตูของการบรรจุ

---

## 2. IDENTIFIERS — อะไรถูกระบุ ระดับไหน รหัสเข้ารหัสอะไร

### 2.1 สิ่งที่ถูกระบุ มี 5 อย่าง เท่านั้น

| สิ่ง | ระดับ | มี QR? | ประเภทตัวตน (คำศัพท์ EPCIS) | คงอยู่ |
|---|---|---|---|---|
| **แปลง (Plot)** | รายแปลงกายภาพ | **QR ใบที่ 1** | *location* — "ที่ไหน" ตลอดกาล | ถาวร ข้ามฤดู |
| **รอบปลูก (Cycle)** | รายแปลง × รายฤดู | ไม่มี | *object* class-level + เป็น `transformationId` ของสายการผลิตทั้งสาย | ตายเมื่อปิดรอบ |
| **รุ่นเก็บเกี่ยว (HarvestBatch)** | รายการตัดหนึ่งครั้ง (หรือหลายครั้งรวมกันจนปิด batch) | ไม่มี | *object* class-level (lot) | ตายเมื่อปิด batch |
| **ชุดบรรจุ (PackRun)** | การบรรจุหนึ่งครั้ง | ไม่มีของตัวเอง | *object* class-level | ถาวร (เป็นหลักฐาน) |
| **ถุง (PackUnit)** | รายถุง | **QR ใบที่ 2** | *object* instance-level | ถาวร (เป็นหลักฐาน) |

`[STD]` เหตุผลระดับมาตรฐานว่าทำไม QR ใบที่ 1 ต้องเป็น "ที่ไหน" ไม่ใช่ "อะไร": CBV 2.0 §8.2.1 หน้า 70 —
*"Both CBV-Compliant and CBV-Compatible documents SHALL NOT use an SGLN EPC ... as an Object identifier."*
แปลงคือสถานที่ ตัวตนของสถานที่ไม่เปลี่ยนเมื่อพืชเปลี่ยน — นี่คือเหตุผลเชิงหลักการที่ตรงกับสัญชาตญาณภาคสนามของ operator
ใน §7.2 ของ spec เดิมพอดี ("ป้ายถาวรที่ปักไว้หน้าแปลงได้ ไม่ต้องพิมพ์ใหม่ทุกฤดู") — เขามาจากไร่ มาตรฐานมาจากหลักการ ได้คำตอบเดียวกัน

`[CODE]` **ของที่มีอยู่วันนี้ผิดข้อนี้:** QR แปลงถูก mint ด้วย `entityType: 'PLANTING_CYCLE_PLOT'` และ `entityId` =
แถว junction ของ cycle×plot — ตรวจแล้ว 7 จุด: `apps/backend/services/planting-cycle-service.js:401,434` ·
`apps/backend/services/planting-service.js:619,759` · `apps/backend/routes/api/admin/planting.js:281` ·
`apps/backend/services/trace-service/resolve-plot-cycle.js:43,52,60,71,90,167`
และ `apps/backend/prisma/schema/cultivation.prisma` มี `PlantingCyclePlot` `@@unique([cycleId, plotId])`
→ **ฤดูใหม่ = แถวใหม่ = QR ใหม่ = ต้องปักป้ายใหม่ทุกฤดู** ซึ่งตรงข้ามกับ R11/§7.2 พอดี ข้อนี้ต้องแก้

### 2.2 รูปแบบรหัส `[OURS]` — วัดจริงบนเครื่องนี้ ไม่ใช่เดา

**ตัวอักษร:** Crockford Base32 = `0123456789ABCDEFGHJKMNPQRSTVWXYZ` (ตัด I, L, O, U ออก —
กัน 1/I, 0/O สับสน และตัด U กันคำหยาบภาษาอังกฤษโดยบังเอิญ) **ตัวพิมพ์ใหญ่ล้วน**

**เหตุผลที่ต้องพิมพ์ใหญ่ล้วน (วัดแล้ว):** QR alphanumeric mode รับเฉพาะ `0-9 A-Z` และ `space $ % * + - . / :`
ถ้ามีตัวพิมพ์เล็กแม้ตัวเดียว จะตกไปโหมด byte ทันที และกินโมดูลเพิ่มฟรี ๆ

| รหัส | รูปแบบ | ความยาว URL | ECC=H | ขนาดโมดูลที่ QR 50 มม. | ขนาดโมดูลที่ QR 40 มม. |
|---|---|---|---|---|---|
| แปลง | `HTTPS://GACP.GO.TH/P/P7K2M9QX4RT` | 32 | v3 · 29×29 | **1.35 มม.** | 1.08 มม. |
| ถุง | `HTTPS://GACP.GO.TH/K/K7K2M9QX4RTB3N` | 35 | v3 · 29×29 | **1.35 มม.** | 1.08 มม. |
| *(ของเดิมวันนี้)* | `https://…/trace/lot/<uuid v4>` | 70 | v8 · 49×49 | 0.88 มม. | 0.70 มม. |

> วัดเมื่อ 2026-08-23 ด้วย `require('qrcode').create(url,{errorCorrectionLevel})` จาก `apps/backend/node_modules`
> (ไลบรารีของ repo เอง) — ขนาดโมดูลคิดรวม quiet zone 4 โมดูลรอบด้านแล้ว (`size/(n+8)`)
> **ผลที่ต้องอ่านให้ออก:** เปลี่ยนรูปรหัสอย่างเดียว ทำให้เราขึ้น ECC สูงสุด (H — ทนเลอะ ~30%) แล้วยัง**ได้โมดูลใหญ่ขึ้น 53%**
> เทียบกับของเดิมที่ ECC ต่ำกว่า นี่คือของฟรีที่ใหญ่ที่สุดในเอกสารนี้

**โครงรหัส:**
```
แปลง : P + <9 สัญลักษณ์สุ่ม> + <1 check>   →  ตัวอย่าง P7K2M9QX4RT   (สุ่ม 9 ตัว = 45 บิต)
ถุง   : K + <12 สัญลักษณ์สุ่ม> + <1 check>  →  ตัวอย่าง K7K2M9QX4RTB3N (สุ่ม 12 ตัว = 60 บิต)
```
- **แหล่งสุ่ม:** `crypto.randomBytes` เท่านั้น ห้ามใช้เวลา ห้ามใช้ลำดับ ห้ามอนุมานจาก id ในฐานข้อมูล
- **check character:** Luhn mod 32 บนตัวอักษรชุดเดียวกัน (เลือกแทน Crockford check symbol เพราะ Crockford ใช้ `~` `=`
  ซึ่ง **ไม่อยู่ใน** ชุด QR alphanumeric — จะทำให้ตกโหมด byte) จับพิมพ์ผิดหนึ่งตัวและสลับที่ติดกันได้ทันทีที่หน้าเว็บ
  ก่อนยิงฐานข้อมูล → ผู้ตรวจที่พิมพ์รหัสจากป้ายที่สแกนไม่ติดได้ feedback ทันที

**การเดาสุ่ม (guessability):**

| | เอนโทรปี | จำนวนรหัสจริงที่คาดไว้ | โอกาสเดาถูกต่อครั้ง |
|---|---|---|---|
| แปลง 45 บิต | 3.5 × 10¹³ | 10⁵ | 2.8 × 10⁻⁹ |
| ถุง 60 บิต | 1.15 × 10¹⁸ | 10⁸ | 8.7 × 10⁻¹¹ |

`[OURS]` เกณฑ์ที่ผมใช้: **หน้าสาธารณะไม่ใช่ความลับ แต่การไล่นับ (enumeration) เป็นความลับ**
ถ้าใครไล่รหัสถุงได้หมด เขาได้ข้อมูลปริมาณผลผลิตทั้งประเทศแยกรายฟาร์ม ซึ่งเป็นความลับทางการค้าของเกษตรกร
ดังนั้นเอนโทรปีนี้ต้องมาคู่กับ **rate limit ต่อรหัส ไม่ใช่ต่อ IP** (ดู §8.4 — ของเดิมเป็นต่อ IP ล้วน ซึ่งพังทั้งสองทาง)

**การจับคู่กับมาตรฐาน `[STD]`+`[OURS]`:** รูปพาธ `/<คีย์>/<ค่า>` ยืมมาจาก GS1 Digital Link URI Syntax 1.7.0
(ให้สัตยาบัน ส.ค. 2569) โดย **จงใจ** ใช้คีย์ที่ไม่ใช่ GS1 AI (`P`, `K` แทน `414`, `01/21`) เพื่อให้ไม่มีใคร
เข้าใจผิดว่าเราออก GS1 key จริง วันที่ได้ GS1 Company Prefix จาก GS1 Thailand เมื่อไหร่ resolver
เพิ่มพาธ `/414/{gln}` และ `/01/{gtin}/21/{serial}` ขนานกันได้โดยไม่ต้องเปลี่ยนรหัสที่ปักในไร่ไปแล้ว (§9 Phase 7)

### 2.3 นับรหัสจริงหนึ่งฤดูของเกษตรกรหนึ่งคน `[OURS]`

สมมติเกษตรกร 3 แปลง ปีละ 2 รอบ เก็บเกี่ยวรอบละ 1 batch บรรจุ batch ละ 40 ถุง × 5 กก.

| | จำนวน | มี QR | พิมพ์ใหม่ทุกฤดูไหม |
|---|---|---|---|
| รหัสแปลง | 3 | ✔ 3 ป้าย | **ไม่** — ปักครั้งเดียวอยู่ได้หลายปี |
| รหัสรอบปลูก | 6 | ✘ | — (โชว์บนหน้าจอ/ใบพิมพ์ ไม่ใช่ QR) |
| รหัส batch | 6 | ✘ | — |
| รหัสชุดบรรจุ | 6 | ✘ | — |
| **รหัสถุง** | **240** | ✔ สติกเกอร์ 240 ใบ | ใช่ (สติกเกอร์เป็นของสิ้นเปลืองอยู่แล้ว) |
| **รวม QR ที่ต้องพิมพ์/ปี** | **243** | | ป้ายถาวร 3 + สติกเกอร์ 240 |

เทียบของเดิมถ้าเป็นรายต้น (R8 ที่เลิกไปแล้ว): 3 แปลง × 100 ต้น × 2 รอบ = **600 ป้ายต่อต้นต่อปี** + 240 ถุง
`[GP]` และหลักฐานว่าทางนั้นพัง: METRC คิด USD 0.45/ต้น ป้ายใช้ซ้ำไม่ได้ บางรายจ่ายถึง USD 100,000/ปี
เกิดคดีฟ้องรัฐโคโลราโด และปี 2568 มีคดี whistleblower กล่าวหาว่าผู้ขายระบบต้านการย้ายไป QR เพราะป้ายทำกำไร
(ข้อกล่าวหา ยังไม่พิสูจน์) ทั้งที่ METRC เองไม่ได้ทำรายต้นในระยะต้นกล้าจริง — immature batch รวมได้ถึง 100 ต้นต่อชื่อเดียว
และแคลิฟอร์เนียยกเว้นป้ายให้พืชที่กำลังตาก/บ่ม/คัด (Cal. Code Regs. tit. 4 §15049)
**สรุป: R8 ถูกต้อง และตอนนี้มีหลักฐานอ้างอิงให้ป้องกันตัวได้แล้ว**

### 2.4 ประเด็นที่ผมขอเถียงกับ ruling — ทำ QR ใบที่ 2 เป็น **รายถุง** ไม่ใช่รายชุดบรรจุ

ดู §11 ข้อ B3 — เถียงเต็ม ๆ ที่นั่น สรุปสั้น: **นี่ไม่ใช่การกลับไปทำรายต้น** รายต้นคือฝั่ง input ทำไม่ได้จริงในไร่
ถุงคือฝั่ง output และเป็น**สิ่งเดียวที่คู่พิพาทถือไว้ในมือจริง ๆ** ถ้าทุกถุงจากการบรรจุครั้งเดียวมี QR เดียวกันหมด
(ก) ชี้ไม่ได้ว่าถุงไหนคือถุงที่พิพาท (ข) นับไม่ได้ว่าออกไปกี่ถุง สมดุลมวลจึงไม่มีตัวหาร
(ค) ถ่ายเอกสาร QR ไปแปะหมื่นถุงแล้วทุกใบ verify ผ่านหมด ซึ่งคือ "QR กลายเป็นเครื่องฟอกของนอกระบบ" ตรงตัวตาม §7.4 ของ spec เดิม
`[OURS]` **ไม่มีข้อบังคับ GS1 ข้อไหนสั่งให้ทำ serialisation** — เลนวิจัยหาแล้วไม่เจอ นี่คือดุลพินิจวิศวกรรม ต้องพูดตรง ๆ แบบนี้กับกรมฯ

**ทางประนีประนอมที่เสนอ:** ผูกกับ `PlantSpecies.group` ที่มีอยู่แล้วในสคีมา
(`apps/backend/prisma/schema/trace.prisma:193` — `group String @default("GENERAL") // HIGH_CONTROL, GENERAL`)
- `HIGH_CONTROL` (กัญชา กระท่อม) → **รายถุงบังคับ**
- `GENERAL` (ขมิ้น ขิง กระชายดำ ไพล) → ให้เลือกได้: รายถุง หรือ รหัสเดียวทั้งชุดบรรจุ
โค้ดต่างกันแค่ "ตอนบรรจุ mint กี่แถว: 1 หรือ N" ที่เหลือเหมือนกันทุกบรรทัด

---

## 3. EVENT MODEL — บันทึกอะไร รูปทรงไหน อะไรแก้ไม่ได้ แก้ยังไง

### 3.1 ตารางเดียว `trace_events`

```prisma
model TraceEvent {
  id             String   @id @default(uuid())      // uuid v7 ฝั่ง client ก็ได้ (idempotency)
  organizationId String                              // tenant — hash chain แยกต่อ tenant
  seq            BigInt                              // ลำดับ monotonic ต่อ tenant, ห้ามมีช่อง

  // WHAT
  eventType      String     // CYCLE_OPENED, HARVESTED, DRIED, PACKED, ... (§3.2)
  cbvBizStep     String?    // urn:epcglobal:cbv:bizstep:… — ยืมคำศัพท์ ไม่ผูกมัด
  cbvDisposition String?    // active | conformant | non_conformant | destroyed | recalled
  subjectType    String     // PLOT | CYCLE | BATCH | PACKRUN | PACKUNIT | CERTIFICATE
  subjectId      String

  // WHEN — สองเวลาบังคับ (P2) + เวลาที่สาม เมื่อบันทึกออฟไลน์
  occurredAt     DateTime   // เกิดจริงในโลก — เกษตรกรประกาศ
  recordedAt     DateTime   @default(now())  // เซิร์ฟเวอร์รับ — นาฬิกาของเรา
  capturedAt     DateTime?  // นาฬิกาเครื่องตอนกดในไร่ (ออฟไลน์) — ระบุว่า "ยืนยันไม่ได้"
  tzOffset       String     @default("+07:00")
  entryMode      String     // LIVE | OFFLINE_SYNC | BACKFILL | OFFICER_ENTERED | IMPORTED
  backfillReason String?    // บังคับเมื่อ occurredAt เก่ากว่า recordedAt เกินหน้าต่างที่ตั้งไว้

  // WHO — ตอบ ม.9(1) "ระบุตัว + แสดงเจตนา"
  actorId        String
  actorType      String     // FARMER | WORKER | OFFICER | SYSTEM
  actorRole      String
  onBehalfOfId   String?    // ลูกจ้างบันทึกแทนผู้ถือใบรับรอง
  attestation    String?    // ข้อความเจตนาที่ผู้กดเห็นและกดยอมรับ (เก็บคำต่อคำที่แสดงตอนนั้น)
  ip             String?
  userAgent      String?
  deviceId       String?
  appVersion     String?

  // WHERE
  locationRef    String?    // รหัสแปลง หรือ รหัสสถานที่แปรรูป
  geo            Json?      // {lat,lng,accuracy} — ภายในเท่านั้น ไม่ขึ้น public (§7)

  // HOW MUCH — ยกออกจาก payload เพราะสมดุลมวลต้อง index ได้
  quantity       Decimal?   @db.Decimal(14,4)
  uom            String?    // KGM | GRM | C62 (ชิ้น/ต้น) — ISO 80000 / UN/ECE Rec.20
  inputs         Json?      // [{subjectType,subjectId,quantity,uom}]
  outputs        Json?      // [{subjectType,subjectId,quantity,uom}]
  transformationId String?  // = รหัสรอบปลูก — ร้อยทุก transformation ของสายเดียวกัน

  // WHY — อำนาจที่ทำให้เหตุการณ์นี้ชอบธรรม
  certificateId  String?
  certSnapshot   Json?      // {number,status,validFrom,validTo} ณ occurredAt — แช่แข็ง
  docRefs        Json?      // [{type:'cert'|'testres', uri, sha256, mediaType}]

  payload        Json

  // CORRECTION — ต่อท้าย ไม่ทับ
  supersedesId   String?    // ชี้ไปที่ event ที่ถูกประกาศว่าผิด
  correctionOf   String?    // event นี้เป็นตัวแทนของ event ไหน
  voidReason     String?

  // INTEGRITY
  prevHash       String
  eventHash      String     @unique   // sha256 ของ canonical JSON (RFC 8785) ของ 25 ฟิลด์ที่กำหนด
  clientEventId  String?               // idempotency key จาก client (ออฟไลน์)

  @@unique([organizationId, seq])
  @@unique([organizationId, clientEventId])
  @@index([subjectType, subjectId, occurredAt])
  @@index([transformationId])
  @@index([eventType, occurredAt])
  @@map("trace_events")
}
```

**"ต่อท้ายอย่างเดียว" ต้องบังคับด้วยเครื่อง ไม่ใช่ด้วยวินัย** `[OURS]`
1. `REVOKE UPDATE, DELETE ON trace_events FROM gacp_app;` — เรามี role สิทธิ์ต่ำ `gacp_app` merge แล้วบน main
   (2026-08-18, ยังเป็น CAPABLE-not-LIVE ต้อง cutover staging ก่อน) นี่คือการใช้งานจริงข้อแรกของมัน
2. trigger `BEFORE UPDATE OR DELETE ... RAISE EXCEPTION` เป็นเข็มขัดเส้นที่สอง เผื่อวันที่ใครรัน migration ด้วย role อื่น
3. probe ใน CI: grep หา `prisma.traceEvent.update|delete` ทั้ง repo = fail (ต่อจากตระกูล ratchet เดิมของ repo)

`[LEGAL]` ทำไมต้องถึงระดับนี้: ม.11 ให้ศาลชั่ง "ลักษณะหรือวิธีการรักษาความครบถ้วนและไม่มีการเปลี่ยนแปลงของข้อความ"
`[CODE]` ของที่มีวันนี้ไม่ผ่านข้อนี้: `apps/backend/prisma/schema/trace.prisma:69-70` ตาราง `trace_qr_security`
มี `updatedAt DateTime @updatedAt` และเป็นแถวธรรมดาที่ Prisma แก้ได้ ไม่มี constraint ใดกัน

### 3.2 ชุดเหตุการณ์ — เท่านี้ ไม่ต้องมากกว่านี้

| eventType | เมื่อไหร่ | subject | inputs → outputs | CBV bizStep `[STD]` |
|---|---|---|---|---|
| `PLOT_REGISTERED` | ขึ้นทะเบียนแปลง (จากข้อมูลที่ผู้ตรวจเห็นตอน onsite) | PLOT | — | `commissioning` |
| `MARKER_ISSUED` / `MARKER_REPRINTED` / `MARKER_REVOKED` | ป้าย QR แปลง | PLOT | — | `other` |
| `CYCLE_OPENED` | สร้างรอบปลูก | CYCLE | → cycle, qty = จำนวนต้น (`C62`) | `commissioning` |
| `CARE_LOGGED` | รดน้ำ/ตรวจ/ตัดแต่ง | CYCLE | — | `other` ⚠️ |
| `INPUT_APPLIED` | ใส่ปุ๋ย/สาร | CYCLE | qty ของสารที่ใช้ | `other` ⚠️ |
| `HARVESTED` | **ตัด** | BATCH | cycle → batch, qty = น้ำหนักสด `KGM` | `creating_class_instance` |
| `WEIGHED` | ชั่งซ้ำ (เกิดกี่ครั้งก็ได้) | BATCH | qty ใหม่ + `basis` | `other` |
| `DRIED` | ตาก/อบเสร็จหนึ่งช่วง | BATCH | สด `KGM` → แห้ง `KGM` | `creating_class_instance` |
| `PROCESSED` | แปรรูปเบื้องต้น (สับ/บด/คัด) | BATCH | แห้ง → แห้ง | `creating_class_instance` |
| `SAMPLED_FOR_LAB` | ตัดตัวอย่างส่งแล็บ | BATCH | qty ที่หายไปจริง | `sampling` |
| `LAB_RESULT_ATTACHED` | แนบผลแล็บ | BATCH | — · `docRefs[testres]` + sha256 | `sampling` + disposition |
| `BATCH_CLOSED` | ปิดรับผลผลิตเข้า batch | BATCH | — | `other` |
| `DISPOSED` | ทำลาย/ของเสีย/สูญหาย | BATCH | qty ที่ออกจากระบบ + เหตุผล | `destroying` |
| `PACKED` | **บรรจุ — จุดแช่แข็ง** | PACKRUN | แห้ง `KGM` → รายการถุง | `packing` |
| `SHIPPED` | ส่งโรงงาน | PACKRUN | — | `shipping` |
| `CERT_STATE_CHANGED` | ใบรับรอง active/หมดอายุ/เพิกถอน | CERTIFICATE | — | `inspecting` + `conformant`/`non_conformant` |
| `RECALL_ISSUED` / `RECALL_LIFTED` | เรียกคืน | BATCH หรือ PACKRUN | — | disposition `recalled` |
| `EVENT_CORRECTED` | ประกาศว่า event เดิมผิด | เหมือน event เดิม | — | (ErrorDeclaration) |

⚠️ `[STD]` **ต้องพูดตรง ๆ:** CBV 2.0 **ไม่มี** ค่าสำหรับ ใส่ปุ๋ย/ให้น้ำ/ตัดแต่ง/สำรวจโรค — ค่าที่ถูกต้องที่สุดคือ `other`
("A business step not identified by any of the values listed in the CBV") ห้ามประดิษฐ์ค่าเองแล้วบอกใครว่าเป็น CBV
ถ้าอยากได้ค่าที่ถูกกว่านี้ ต้องไปถาม GS1 Thailand ว่ามี extension vocabulary ของภาคเกษตรไหม (§13 U-6)

⚠️ `[STD]` **และอีกข้อที่คนมักพลาด:** CBV **ไม่มี** bizStep ชื่อ `harvesting` — การเก็บเกี่ยวถูกยุบเข้า `commissioning`
(CBV 2.0 §7.1.3 หน้า 37: *"encompasses sector-specific process steps including ... harvesting (of fruit/vegetable)"*)
แต่แนวทางภาคเกษตรของ GS1 US เลือกใช้ `creating_class_instance` แทน เพราะการเก็บเกี่ยวผลิต **lot** ไม่ใช่ของชิ้นที่มี serial
เราตาม GS1 US เพราะรูปงานตรงกว่า และบันทึกไว้ตรงนี้ว่าเป็นการเลือก ไม่ใช่ข้อบังคับ

⚠️ `[STD]` `sampling` vs `inspecting`: COA จริงเกิดจากการ**ทำลาย**ตัวอย่าง → `sampling`
(CBV 2.0 §7.1.3 หน้า 41: *"sampled objects are no longer viable in the supply chain"*)
ส่วนการตรวจ onsite ของ GACP ที่ของไม่หาย → `inspecting` ใช้ผิดตัวคือการโกหกว่าของถูกใช้ไปหรือไม่

### 3.3 การแก้ไข — ต่อท้าย ไม่ทับ

`[STD]` รูปแบบมาตรฐานมีอยู่แล้ว ไม่ต้องประดิษฐ์: EPCIS 2.0 §7.4.1.2 หน้า 76 —
*"The semantics of an event containing the ErrorDeclaration element are that all assertions implied by the prior
event are considered to be erroneous, as of the specified declarationTime. The prior event is not modified in any
way, and subsequent queries will return both the prior event and the error declaration."*

**ขั้นตอนของเรา (3 แถว ไม่ใช่ 1 การ UPDATE):**
```
E17  CARE_LOGGED    occurredAt=2026-05-02  payload={ปุ๋ยสูตร A 20 กก.}
                              ↓ ต่อมาพบว่าวันที่ผิด
E44  EVENT_CORRECTED supersedesId=E17  voidReason="กรอกวันผิด — จริงคือ 5 พ.ค."
                                        actorId=…  occurredAt=วันที่กด  recordedAt=now()
E45  CARE_LOGGED    occurredAt=2026-05-05  correctionOf=E17  payload={ปุ๋ยสูตร A 20 กก.}
```
- `E17` **อยู่ตลอดกาล** ทั้งใน DB และในคำตอบของ API สำหรับผู้ตรวจ
- มุมมองที่คำนวณ (derived view) แสดงค่าที่ถูก (5 พ.ค.) พร้อมป้าย **"แก้ไข 12 พ.ค."** กดขยายเห็นค่าเดิม
- หน้า public แสดงแบบเดียวกัน — **ไม่ซ่อนการแก้** เพราะการซ่อนคือสิ่งที่ทำลายน้ำหนักพยานทั้งฉบับเมื่อถูกจับได้
- ⚠️ `[STD]` CBV 2.0 §8.9.2 หน้า 97 เตือนไว้ว่า event ที่เป็น error declaration **ต้องไม่คำนวณ event hash ID ใหม่**
  ให้ใช้ eventID เดิม — เราไม่ได้ทำ EPCIS hash ID เต็มรูป แต่จดไว้เพราะจะสำคัญวันที่ทำ (Phase 7)

**หลัง `PACKED` แก้ยังไง:** แก้ได้ ในความหมายว่าเพิ่ม event แก้ได้เสมอ — แต่ **เอกสารที่เซ็นไปแล้วไม่เปลี่ยน**
(มันเป็นข้อความจริงว่า "ณ วันบรรจุ เรารู้เท่านี้") หน้าเว็บของถุงจะแสดงกล่องที่สองว่า
"มีการแก้ไขข้อมูลต้นทางหลังวันบรรจุ — <วันที่> <เหตุผล>" ผู้ซื้อเห็นทั้งสองอย่าง
`[OURS]` **ข้อนี้ผมยืนยันแม้ขัดกับสัญชาตญาณ "ล็อกคือล็อก"** — ระบบที่แก้ความผิดพลาดไม่ได้เลย
คือระบบที่บังคับให้คนไปโกหกที่อื่นแทน และผู้ตรวจ GACP จะเจอความจริงคนละชุดกับที่อยู่ในระบบ

### 3.4 สองเวลา และการโชว์ของย้อนหลัง

**กติกาบังคับตอนเขียน:**
| เงื่อนไข | ผล |
|---|---|
| `occurredAt > recordedAt + 5 นาที` | **ปฏิเสธ** (เหตุการณ์ในอนาคต) |
| `occurredAt < วันเริ่มรอบปลูก` | **ปฏิเสธ** |
| `occurredAt` อยู่หลัง `PACKED` ของ batch นั้น | **ปฏิเสธ** สำหรับ event ที่กระทบสมดุลมวล; อนุญาตเป็น `EVENT_CORRECTED` เท่านั้น |
| `recordedAt − occurredAt ≤ 24 ชม.` | ไม่มีป้าย |
| `24 ชม. < ช่องว่าง ≤ 30 วัน` | ป้าย **"บันทึกย้อนหลัง N วัน"** บนทุกหน้าที่แสดง event นี้ |
| `ช่องว่าง > 30 วัน` | บังคับกรอก `backfillReason` + ป้าย + ขึ้น dashboard เจ้าหน้าที่ |
| `entryMode = OFFLINE_SYNC` | ป้าย **"บันทึกในแปลงเมื่อ <capturedAt> (นาฬิกาเครื่อง — ยืนยันไม่ได้) · ส่งเข้าระบบ <recordedAt>"** |
| `capturedAt > recordedAt` | เก็บทั้งคู่ + ธง `CLOCK_SKEW` + ป้าย "นาฬิกาเครื่องคลาดเคลื่อน" |

`[GP]` เหตุผลจากภาคสนามจริง: สตง.รัฐโอเรกอนสรุปว่าจุดอ่อนของระบบติดตามไม่ใช่ซอฟต์แวร์ แต่คือ input —
ข้อมูล self-reported, การชั่งไม่สม่ำเสมอ, ช่วงเวลาที่ inventory ยังไม่เข้าระบบ
`[LEGAL]` และเหตุผลทางกฎหมาย: ม.11 ให้ชั่ง "วิธีการที่ใช้สร้าง" — ถ้าเราปล่อยให้บันทึกย้อนหลัง 3 เดือน
ดูเหมือนบันทึกสด แล้วทนายฝ่ายตรงข้ามจับได้ครั้งเดียว **บันทึกทั้งระบบเสียน้ำหนักพร้อมกันหมด**
การโชว์ช่องว่างจึงไม่ใช่การประจานเกษตรกร แต่คือการปกป้องมูลค่าของบันทึกที่ทำตรงเวลา

---

## 4. FREEZE — ผู้ซื้อเห็นอะไร ตรึงเวลายังไง คนนอกทำซ้ำได้ยังไงในอีก 2 ปี

### 4.1 หลัก: แช่แข็งด้วย "เอกสารที่เซ็นแล้วแจกออกไป" ไม่ใช่ "flag ในฐานข้อมูลเรา"

`[CODE]` **ทำไมของเดิมพัง — ตรวจแล้ววันนี้ 3 จุด:**
1. `apps/backend/services/qrcode/qrcode-service.js:366-412` — `registerTraceIntegrity` ทำ **UPDATE ทับแถวเดิม**
   ถ้ามี `TraceQrSecurity` ของ entity นั้นอยู่แล้ว: `const saved = existing ? await prisma.traceQrSecurity.update(…) : await prisma.traceQrSecurity.create(…)` (:388-397)
   → บันทึกที่ "แช่แข็ง" แล้ว ถูกเขียนทับใหม่ทั้ง payload, dataHash, chainHash, signature ได้ทั้งดุ้น
2. `apps/backend/services/qrcode/qrcode-service.js:213-224` — `getPreviousChainHash` หา previous
   จาก `entityType` **อย่างเดียว ข้าม tenant** → โซ่พันข้าม org และเมื่อข้อ 1 เขียนทับ chainHash ของแถวกลางโซ่
   แถวที่ตามหลังก็ชี้ previousHash ที่ไม่มีอยู่จริงอีกต่อไป **โซ่ขาดโดยไม่มีใครรู้**
3. `apps/backend/prisma/schema/trace.prisma:46-47` — `printedAt` ที่คอมเมนต์ว่า "once printed, data cannot be
   modified" ครอบเฉพาะแถว `Lot` เท่านั้น บรรพบุรุษของมันแก้ได้อิสระ:
   `apps/backend/services/harvest-service.js:142,160,311` (`prisma.harvestBatch.update`) และ
   `apps/backend/services/cultivation-log-service.js:152,163` (update **และ delete แบบ hard**)

→ **วันนี้ R13 ("เปลี่ยนตามภายหลังไม่ได้เด็ดขาด") ยังไม่เป็นจริงในโค้ด** และถ้าเราพิมพ์คำนี้บนถุง
ผู้ซื้อคนแรกที่สแกนถุงเดิมสองครั้งห่างกันหลายเดือนแล้วเห็นเนื้อหาต่างกัน = ข้อพิพาทที่เราไม่มีอะไรสู้

### 4.2 "ใบบันทึกการบรรจุ" (ใบ ทบ.) — สิ่งที่เกิดขึ้นตอน `PACKED`

ในทรานแซกชันเดียว (พร้อม `SELECT … FOR UPDATE` บนแถว batch):
```
1) ตรวจสมดุลมวล (§5) — ไม่ผ่าน = ปฏิเสธ ไม่มี QR ออก
2) ประกอบ payload ของใบ ทบ. — ข้อเท็จจริงเต็ม ไม่ใช่ลิงก์ (รายการใน §4.3)
3) canonicalise ด้วย RFC 8785 (JCS)                    ← ห้ามใช้ JSON.stringify เปล่า ๆ
4) recordHash = sha256(canonical)
5) prevHash = eventHash ล่าสุดของ org นี้ ; eventHash = sha256(prevHash + recordHash + header)
6) signature = RSA-SHA256 หรือ Ed25519 ด้วยกุญแจของกรมฯ ; เก็บ keyId + fingerprint
7) self-verify ก่อนคอมมิต — verify signature กับ public key ที่จะเผยแพร่ ไม่ผ่าน = ทั้ง tx ล้ม
8) INSERT trace_events (PACKED) + INSERT packing_records (INSERT-only grants)
9) mint รหัสถุง N ใบ
10) [Phase 5] ขอ RFC 3161 timestamp token ทับ recordHash — ล้มเหลว = ยังคอมมิต แต่ตั้งธง NO_TSA
```

ข้อ 7 ยืมวินัยที่ฝั่งใบรับรองทำถูกแล้วมาใช้: `apps/backend/services/certificate-service.js:1122-1126`
มีการ verify ลายเซ็นกับ public key ที่กำลังจะเก็บ ก่อนออกใบ ไม่ผ่าน = ไม่ออก — ต้องทำแบบเดียวกันตอนบรรจุ

`[LEGAL]` ข้อ 3 ไม่ใช่รายละเอียดจุกจิก: `apps/backend/services/crypto/signature-service.js:161` วันนี้ใช้
`JSON.stringify` เปล่า ๆ ซึ่ง **ไม่ใช่ canonical serialisation** (ลำดับคีย์ การ escape unicode รูปแบบตัวเลข
ขึ้นกับ implementation) → คนสุจริตสองคนคำนวณ hash จากข้อเท็จจริงชุดเดียวกันได้คนละค่า
ซึ่งในห้องพิจารณาคดี **หน้าตาเหมือนการปลอมแปลงเป๊ะ** RFC 8785 มีอยู่เพื่อลบข้อโต้แย้งนี้ทิ้ง

### 4.3 เนื้อในใบ ทบ. — ข้อเท็จจริงเต็ม ไม่ใช่ตัวชี้

```jsonc
{
  "schema": "gacp.dtam.go.th/packing-record/v1",
  "recordId": "PR-2569-000123",
  "packUnitCodes": ["K7K2M9QX4RTB3N", "..."],      // ทุกถุงในชุดนี้ — ผู้ซื้อนับได้
  "packUnitCount": 40,

  "certificate": {                                  // แช่แข็ง: สถานะ ณ วันบรรจุ + ณ วันตัด
    "number": "GACP-TH-2569-85B448",
    "statusAtPacking": "active", "statusAtHarvest": "active",
    "validFrom": "2026-01-15", "validTo": "2029-01-14",
    "verifyUrl": "https://gacp.go.th/verify/GACP-TH-2569-85B448"
  },
  "plot":  { "code": "P7K2M9QX4RT", "subdistrict": "…", "district": "…", "province": "…",
             "area": 1600, "areaUnit": "sqm" },     // ไม่มีพิกัด (§7)
  "cycle": { "code": "C-2569-0007", "species": "TUR", "variety": "…",
             "seedSource": "…", "plantCount": 100, "startDate": "2026-02-01",
             "method": "…", "growingMedium": "…", "waterSource": "…" },

  "massBalance": {                                  // §5 — ตัวเลขที่คนทะเลาะกันมากที่สุด
    "harvestedFresh_kg": 320.0, "dried_kg": 96.0, "dryingLoss_kg": 224.0,
    "dryingLossPct": 70.0, "lossBandForSpecies": [60, 80], "lossFlag": null,
    "sampledForLab_kg": 0.5, "disposed_kg": 1.5,
    "packedThisRun_kg": 40.0, "packedCumulative_kg": 94.0, "remaining_kg": 0.0,
    "basis": "DRY"
  },
  "events": [                                       // timeline เต็ม พร้อมสองเวลา
    {"type":"CYCLE_OPENED","occurredAt":"2026-02-01T08:00+07:00","recordedAt":"2026-02-01T08:04+07:00",
     "entryMode":"LIVE","eventHash":"…"},
    {"type":"HARVESTED","occurredAt":"2026-06-14T06:30+07:00","recordedAt":"2026-06-14T19:02+07:00",
     "entryMode":"OFFLINE_SYNC","capturedAt":"2026-06-14T06:31+07:00","quantity":320,"uom":"KGM","eventHash":"…"},
    {"type":"DRIED","occurredAt":"2026-06-21T…","dryingMethod":"SUN_DRY","dryingDuration_h":168,"…":"…"},
    {"type":"PACKED","occurredAt":"2026-06-28T…","…":"…"}
  ],

  "lab": {                                          // R9 — มี/ไม่มี + วันที่ + ชื่อแล็บ + hash เท่านั้น
    "present": true, "testedOn": "2026-06-24", "laboratory": "…",
    "coaSha256": "ni:///sha256;9f2c…?mt=application/pdf",
    "verificationStatus": "FARMER_UPLOADED",
    "notice": "ไฟล์ COA ไม่เผยแพร่ — ขอจากเกษตรกรโดยตรง แล้วนำไฟล์มาเทียบค่า SHA-256 นี้"
  },
  "holder": { "displayName": "นายส. ส█████", "orgRef": "…" },   // mask ตาม §7
  "photos": [ {"sha256":"…","by":"OFFICER","takenOn":"2026-01-10"} ],  // hash เท่านั้น ไม่ใช่ไฟล์

  "attestation": "ข้าพเจ้ายืนยันว่าข้อมูลข้างต้นเป็นความจริง — <ชื่อ actor> <เวลา>",
  "issuer": { "org": "กรมการแพทย์แผนไทยและการแพทย์ทางเลือก",
              "keyId": "dtam-trace-2026", "keyFingerprint": "SHA256:…",
              "publicKeyUrl": "https://gacp.go.th/.well-known/gacp-trace-keys.json" },
  "integrity": { "canonicalisation": "RFC8785", "recordHash": "…", "prevHash": "…", "eventHash": "…",
                 "signature": "…", "sigAlg": "RSA-SHA256",
                 "timestampToken": "<RFC3161 base64 | null>",
                 "merkleProof": {"treeHead": "…", "path": ["…"], "publishedAt": "…"} },
  "verifierUrl": "https://gacp.go.th/verify-tool",
  "verifierSha256": "…",
  "liveStatusUrl": "https://gacp.go.th/K/K7K2M9QX4RTB3N"
}
```

**เหตุผลของข้อออกแบบสองข้อที่สำคัญที่สุดในบล็อกนี้:**
- **hash ไม่ใช่ไฟล์ สำหรับทุกอย่างที่มี PII** (COA, รูปถ่าย) `[STD]` CBV 2.0 §8.6 หน้า 86 ให้รูป Hash URI มาแล้ว:
  *"users can verify — with a reasonable level of certainty — that the content of a given document ... is authentic.
  For that purpose, they just need to verify if the hash value of the document identified by the bturi is identical
  to the hashValue included in the Hash URI."*
  → **R9 ยังยืนครบ** ไม่มีไฟล์ ไม่มีค่า ไม่มีคำตัดสินผ่าน/ไม่ผ่านบนหน้า public **แต่ได้เพิ่มมาอย่างหนึ่งฟรี ๆ:**
  โรงงานที่ได้ COA มาทาง LINE พิสูจน์ได้เองว่าเป็นไฟล์เดียวกับที่แพลตฟอร์มเห็น วันนี้ภายใต้ R9 เปล่า ๆ
  เกษตรกรยื่น COA ปลอมให้โรงงานได้ และหน้า public ก็ยังขึ้น "มีผลตรวจ ✓" อยู่ดี — ช่องนี้ปิดได้ด้วย hash ตัวเดียว
- **ตัวเลข ไม่ใช่ลิงก์** `[LEGAL]` ม.8/ม.12: ต้อง "เข้าถึงและนำกลับมาใช้ได้โดยความหมายไม่เปลี่ยนแปลง"
  เอกสารที่เขียนว่า "สแกนดูที่เว็บ" มีค่าเป็นศูนย์ในวันที่เว็บไม่อยู่ ซึ่งเป็นวันที่คนต้องใช้มันพอดี

### 4.4 ผู้ซื้อเห็นอะไร — สองกล่อง แยกกันชัด

หน้าเว็บของรหัสถุงแบ่งเป็นสองส่วนที่ **ห้ามปนกัน**:

```
┌─ ภาพแช่แข็ง ณ วันบรรจุ 28 มิ.ย. 2569 ─────────── [ลงลายเซ็นดิจิทัลแล้ว ✓] ─┐
│  ใบรับรอง GACP-TH-2569-85B448 · สถานะ ณ วันบรรจุ: ใช้ได้ · ณ วันตัด: ใช้ได้ │
│  แปลง … ต.… อ.… จ.…  ·  ขมิ้นชัน  ·  ปลูก 1 ก.พ. 69  ·  ตัด 14 มิ.ย. 69     │
│  ตาก SUN_DRY 168 ชม.  ·  สด 320 กก. → แห้ง 96 กก.  ·  ถุงนี้ 1 กก. จาก 40 ถุง │
│  ผลตรวจแล็บ: มี · 24 มิ.ย. 69 · <ชื่อแล็บ> · SHA-256 9f2c…  [ไฟล์ไม่เผยแพร่]  │
│  [ดาวน์โหลดใบบันทึกการบรรจุ (.json)]  [ดาวน์โหลดใบ PDF]  [วิธีตรวจสอบเอง]     │
└──────────────────────────────────────────────────────────────────────────┘
┌─ สถานะ ณ วันนี้ 23 ส.ค. 2569 (ข้อมูลปัจจุบัน ไม่ใช่ส่วนที่แช่แข็ง) ────────┐
│  ⚠ ใบรับรองถูกเพิกถอนเมื่อ 1 ส.ค. 2569 — <เหตุผลที่ mask แล้ว>              │
│  ⚠ มีการแก้ไขข้อมูลต้นทางหลังวันบรรจุ 2 รายการ [ดู]                        │
└──────────────────────────────────────────────────────────────────────────┘
```
`[OURS]` นี่คือคำตอบต่อความขัดแย้งภายใน spec เดิม: R13 บอก "แช่แข็ง" §4.4 บอก "แสดงสถานะจริงเสมอ"
**ถูกทั้งคู่ แต่คนละเรื่อง** — ถ้าเอามารวมช่องเดียว ของที่แช่แข็งจะกลายเป็นของที่เปลี่ยนได้เงียบ ๆ และตกข้อ ม.10 ทันที

### 4.5 คนนอกทำซ้ำได้ยังไงในอีก 2 ปี — 4 ขั้น ไม่ต้องโทรหาเรา

1. เปิดไฟล์ `.json` ที่ตัวเองถือ → canonicalise ด้วย RFC 8785 → `sha256` → ต้องตรงกับ `integrity.recordHash`
2. ดึง public key จาก `https://gacp.go.th/.well-known/gacp-trace-keys.json` (**ต้องอยู่นอกฐานข้อมูลเรา**
   และควรมีใบรับรองใต้ NRCA — `[REG]` Thailand National Root CA ดำเนินการโดย ETDA, CA ที่ได้รับการยอมรับต้องผ่าน
   WebTrust audit) → เทียบ fingerprint กับที่พิมพ์บนเอกสาร → verify `integrity.signature` เหนือ `eventHash`
3. [Phase 5] verify RFC 3161 token → ได้คำยืนยันจากบุคคลที่สามว่า **เอกสารนี้มีอยู่ก่อนวันที่นั้นจริง**
   `[STD]` RFC 3161 คือ *"proof that a datum existed before a particular time"* ·
   `[STD]` เทียบ eIDAS Art. 41: *"An electronic time stamp shall be admissible as evidence of the integrity of the
   data to which it relates and of the fact that the data existed at a particular time."* (เป็นตัวเปรียบเทียบ ไม่ผูกพันไทย)
4. [Phase 5] verify Merkle inclusion proof เทียบกับ signed tree head ที่เผยแพร่นอกโครงสร้างพื้นฐานของเรา
   `[STD]` RFC 6962 (Certificate Transparency): *"As soon as two conflicting Signed Tree Heads for the same log
   are detected, this is cryptographic proof of that log's misbehavior"*
   — **ข้อนี้คือคำตอบต่อกรณีที่ operator กลัวจริง ๆ: กรมฯ เองถูกกล่าวหาว่าแก้บันทึกของเกษตรกร**
   tree head ที่ขัดกันสองใบ = หลักฐานทางคณิตศาสตร์ว่าโกง / การไม่มีเลย = เกราะป้องกันกรมฯ จากข้อกล่าวหาเท็จ

**เครื่องมือตรวจ:** สคริปต์ไฟล์เดียว ~200 บรรทัด ไม่มี dependency นอกจาก stdlib ของ Node/Python
เผยแพร่พร้อม sha256 ของตัวเองที่พิมพ์อยู่บนใบ ทบ. `[REG]` แนวปฏิบัติ digital forensics ไทยคาดหวังพอดีข้อนี้:
"an independent third party should be able to examine those processes and achieve the same result"

### 4.6 ต้องแก้พฤติกรรมของ endpoint ตรวจสอบสาธารณะ

`[CODE]` วันนี้ `apps/backend/routes/api/trace/trace-verification-routes.js:36-81` คืน **ค่า boolean ที่ผู้ถูกกล่าวหาคำนวณเอง**
(`valid`, `signatureValid`, `hashValid`, `chainValid`) โดยไม่คืน payload, ไม่คืน signature bytes, ไม่คืน public key
→ เมื่อข้อกล่าวหาคือ "แพลตฟอร์มแก้บันทึก" endpoint นี้มีค่าเท่ากับศูนย์พอดี
**ต้องคืน:** payload ที่เซ็น + signature + algorithm + keyId + timestamp token + inclusion proof
เก็บ boolean ไว้ได้ในฐานะความสะดวก **แต่ห้ามเรียกมันว่าหลักฐาน**

---

## 5. MASS BALANCE — เลขคณิตที่กันการบรรจุเกินที่เก็บเกี่ยว

### 5.1 สมการ

หน่วยเป็นกิโลกรัมทั้งหมด (`KGM`) ทุกตัวเลขมาจาก event ไม่มีตัวไหนพิมพ์มือลงคอลัมน์

```
คลังสด  (FRESH POOL) ของ batch B
  F_in     = Σ quantity ของ HARVESTED ที่ output เข้า B
  F_out    = Σ input ของ DRIED / PROCESSED ที่กินของสดจาก B
  F_avail  = F_in − F_out − Σ DISPOSED(basis=FRESH) − Σ SAMPLED(basis=FRESH)

คลังแห้ง (DRY POOL)
  D_in     = Σ output ของ DRIED / PROCESSED ของ B
  D_loss   = F_out − D_in                       ← การสูญเสียจากการทำแห้ง คำนวณ ไม่ใช่กรอก
  D_avail  = D_in − Σ DISPOSED(basis=DRY) − Σ SAMPLED(basis=DRY) − Σ PACKED_input(basis=DRY)

*** ประตูตอน PACKED (ตรวจในทรานแซกชันเดียวกัน พร้อม SELECT … FOR UPDATE บนแถว batch) ***
  packInput ≤ D_avail + ε            (หรือ ≤ F_avail หากขายสด, basis=FRESH)
  Σ(unitWeight × unitCount) + packWaste = packInput ± ε
  ε = 0.001 กก.
```

**แถบสูญเสียจากการทำแห้ง** `[OURS]` — `dryingLossPct = D_loss / F_out`
ตรวจกับแถบต่อชนิดพืช เก็บเป็น **ข้อมูลลงวันที่ ไม่ใช่ค่าคงที่ในโค้ด** (ตามกติกา operator เรื่อง no-hardcode)
ตาราง `species_drying_band(speciesCode, effectiveFrom, minPct, maxPct, source)`
- อยู่นอกแถบ → **ตั้งธง ไม่บล็อก** เกษตรกรกรอกเหตุผล ผู้ตรวจเห็นบน dashboard
- `[GP]` เหตุผลที่ไม่บล็อก: แคลิฟอร์เนียแสดงคูน้ำทั้งสองฝั่ง — คำพิพากษา ธ.ค. 2568 (แหล่งเป็นคู่ความ ยังไม่ยืนยันเลขคดี)
  ว่าการมีข้อมูลแต่ไม่ทำ automated irregularity flag = ไม่ compliant · แต่การที่ variance นำไปสู่การพักใบอนุญาต
  ก็ผลักให้ผู้ประกอบการโกหกตัวเลขเพื่อเอาตัวรอด → **variance = ธง + ช่องอธิบาย + นาฬิกา ไม่ใช่การเพิกถอนอัตโนมัติ และไม่ใช่การผ่านเงียบ**

### 5.2 ⚠️ ต้องพูดตรง ๆ กับกรมฯ: สมดุลมวลไม่ใช่ข้อบังคับของ GS1

`[STD]` **ผลการค้นเชิงลบที่ยืนยันแล้ว:** grep คำว่า "mass balance", "reconcile", "yield", "shrink" ทั่วทั้ง
EPCIS 2.0 (229 หน้า), CBV 2.0 (124 หน้า) และแนวทาง FSMA 204 ของ GS1 US (54 หน้า) → **ศูนย์ครั้งทั้งสามฉบับ**
EPCIS บันทึก input และ output อย่างซื่อสัตย์ แต่**ไม่บังคับความสัมพันธ์ทางเลขคณิตระหว่างกันเลย**
→ ห้ามบอกกรมฯ ว่า "GS1 กำหนดให้ทำสมดุลมวล" นี่คือ `[OURS]` + `[GP]`
สิ่งที่มาตรฐานให้เราคือ**เงื่อนไขตั้งต้น**: ทุกการบริโภคเป็น `inputQuantityList` ที่มี UOM ชัดเจนบนสาย `transformationId`
เดียวกัน ยอดคงเหลือจึงคำนวณได้ — ซึ่งสคีมาปัจจุบันทำไม่ได้

### 5.3 ของที่มีอยู่แล้วและทำถูกแล้ว — อย่าเขียนใหม่

`[CODE]` `apps/backend/services/traceability-service.js:547-660` `createLotWithQuotaCheck` ทำถูกมากแล้ว:
จับ row lock ด้วย `SELECT "id" FROM "harvest_batches" WHERE "id" = $1 FOR UPDATE` ก่อน,
คำนวณน้ำหนักที่ใช้ไปใหม่**ในขอบเขตที่ล็อกแล้ว**, ตัด lot ที่ soft-delete ออกจากผลรวม, และที่สำคัญที่สุด
**fail closed เมื่อ limit ไม่เป็นบวก** (`if (!(limitWeight > 0)) throw LOT_WEIGHT_QUOTA_EXCEEDED`)
พร้อมคอมเมนต์อธิบายบั๊กเดิมที่ batch น้ำหนักศูนย์เคยหลุดผ่านการตรวจไปทั้งดุ้น
→ **เก็บตรรกะนี้ทั้งก้อน** เปลี่ยนแค่แหล่งของ `limitWeight`: จาก `Number(batch.dryWeight || batch.freshWeight || 0)`
(:578 — คอลัมน์ที่แก้ได้อิสระ) เป็น `D_avail` ที่คำนวณจาก event log

### 5.4 กรณีขอบ

| กรณี | พฤติกรรม |
|---|---|
| **ชั่งซ้ำหลังตาก** | `WEIGHED` เป็น event ใหม่ ไม่ใช่การแก้คอลัมน์ ยอดคำนวณใหม่ทั้งสาย |
| **ชั่งซ้ำแล้วได้น้อยลงจนติดลบ** (บรรจุไปแล้วเกินยอดใหม่) | ถุงที่ออกไปแล้ว **ไม่ถูกลบล้างย้อนหลัง** (มันเป็นข้อความจริงว่าตอนนั้นเรารู้เท่านั้น) แต่ batch ขึ้นธง `NEGATIVE_BALANCE`, ห้ามบรรจุเพิ่ม, ขึ้น dashboard เจ้าหน้าที่, และกล่อง "สถานะวันนี้" ของทุกถุงจาก batch นั้นแสดงคำเตือน |
| **เก็บเกี่ยวหลายครั้ง (partial harvest)** | `HARVESTED` หลาย event เข้า batch เดียวได้ จนกว่าจะมี `BATCH_CLOSED` · `[OURS]` ปิดอัตโนมัติ 90 วันหลัง HARVESTED ครั้งสุดท้าย (`[GP]` METRC ใช้ 45 วัน — ตัวเลขจาก wiki ของรัฐ ไม่ใช่ตัวบท เราตั้งของเราเองเป็นข้อมูลลงวันที่) หลังปิดรับได้แค่ `DISPOSED` กับการแก้ไข |
| **batch ตกเกณฑ์ (reject)** | `LAB_RESULT_ATTACHED` disposition `non_conformant` หรือ `QC_REJECTED` → บรรจุถูกบล็อก · `[STD]` ใช้ `persistentDisposition` เพื่อให้ "ตก" เป็นสถานะที่ต้องถูกเพิกถอนอย่างชัดแจ้ง ไม่ใช่หมดอายุเงียบ ๆ |
| **ตกเกณฑ์หลังส่งถุงไปแล้ว** | ดู §8.5 |
| **ขายสด ไม่ตาก** | ไม่มี `DRIED` → `basis = FRESH`, `D_avail` ไม่ถูกใช้, ใบ ทบ. ระบุ `basis` ชัด |
| **ผสมหลาย batch ในการบรรจุครั้งเดียว** | `PACKED` มี `inputs[]` หลายรายการ หักจากแต่ละ batch ตามจำนวนที่ระบุ ใบ ทบ. แสดงทุกต้นทาง · `[OURS]` ถ้า operator ไม่ต้องการให้ผสม ตั้งเป็น policy ระดับ scheme ได้ (บล็อกเมื่อ `inputs.length > 1`) |

### 5.5 รอยรั่วที่ยังต้องอุด — ยอดบนสุดของสายยังไม่ถูกยึด

`[CODE]` `apps/backend/prisma/schema/harvest.prisma:22` `cycleId String?` (ยอมให้เก็บเกี่ยวโดยไม่มีรอบปลูก) และ
`apps/backend/prisma/schema/cultivation.prisma:18-19` `certificateId String?` (ยอมให้รอบปลูกไม่มีใบรับรอง)
→ วันนี้ระบบ**สร้าง QR ให้ของที่ไม่มีรอบปลูกและไม่มีใบรับรองอยู่ข้างหลังได้** นี่ไม่ใช่ความเสี่ยงอนาคต มันคือสถานะปัจจุบัน
และเป็นรูเดียวกับที่มิชิแกนเจอ (มีของใน METRC 58 ปอนด์ที่หาไม่เจอในโลกจริง)
→ ทั้งคู่ต้อง NOT NULL หลัง backfill (Phase 6) และ `freshWeight` ต้องถูกตรวจกับพื้นที่แปลง × จำนวนต้น
เป็น **ธง** (ไม่ใช่บล็อก) เพราะไม่งั้นเกษตรกรประกาศ `freshWeight` เท่าไหร่ก็ได้แล้วโควตา lot ก็เคารพตามนั้น

---

## 6. CERTIFICATE — ณ วันตัด vs ณ วันนี้

### 6.1 กติกา

| จุด | ตรวจอะไร | ไม่ผ่านแล้วยังไง |
|---|---|---|
| `CYCLE_OPENED` | ใบ active **ณ วันนี้** + คุ้มครองแปลงนี้ + คุ้มครองชนิดพืชนี้ | **บล็อก** (R2/R3) |
| `CARE_LOGGED` / `INPUT_APPLIED` | ไม่ตรวจ | บันทึกได้เสมอ — ข้อเท็จจริงต้องบันทึกได้ (spec §4.1 เดิม) |
| `HARVESTED` | ใบ active **ณ `occurredAt`** ไม่ใช่ ณ วันนี้ | **ไม่บล็อก** แต่ตั้งธง `UNCERTIFIED_HARVEST` บน batch ตลอดกาล |
| `PACKED` | อ่านธงจาก batch | บรรจุได้ แต่ใบ ทบ. และหน้า public เขียนตรง ๆ ว่า **"เก็บเกี่ยวนอกช่วงที่ใบรับรองคุ้มครอง"** |

`[OURS]` เหตุผลที่ `HARVESTED` ไม่บล็อก: ห้ามบล็อกการบันทึกความจริง ถ้าบล็อก เกษตรกรจะเลื่อนวันตัดในระบบ
ให้เข้าช่วงที่ใบยัง active — เราจะได้ข้อมูลปลอมแทนที่จะได้ข้อมูลจริงพร้อมธง ธงมีค่ามากกว่า
`[LEGAL]` และ §7.4 ข้อ 3 ของ spec เดิมสั่งข้อนี้ไว้แล้ว: "ต้องตรวจว่าใบ active ณ วันเก็บเกี่ยว ไม่ใช่แค่ active วันนี้"

`[CODE]` **สิ่งที่มีแล้วและใช้ได้:** ประตูใบรับรองทำงานจริงและมีเทสต์ —
`apps/backend/__tests__/integration/generic-trace-cert-gate.test.js` (:124 `expect(out.body.verification.reason).toBe('certificate_expired')`)
เทียบสถานะแบบ case-insensitive และคืน 410 · **สิ่งที่ยังไม่มี:** การเทียบกับวันเก็บเกี่ยว มันเทียบกับ "ตอนนี้" อย่างเดียว

### 6.2 ใบหมดอายุ / ถูกเพิกถอน กลางฤดู หรือ หลังขายไปแล้ว

- บันทึก `CERT_STATE_CHANGED` เป็น event หนึ่งใบ ไม่ใช่การอ่านค่าคอลัมน์อย่างเดียว
- **ถุงที่บรรจุก่อนวันเพิกถอน:** กล่องแช่แข็งยังเขียนว่า "ณ วันบรรจุ ใบมีสถานะ active" ตลอดกาล
  เพราะ**นั่นคือความจริง** และเป็นสิ่งที่ปกป้องทั้งเกษตรกรและผู้ซื้อสุจริต
  กล่องสถานะวันนี้ขึ้นคำเตือนเพิกถอนพร้อมวันที่และเหตุผลที่ mask แล้ว
- **เริ่มรอบใหม่:** ทำไม่ได้จนใบกลับมา active (ตาม spec §4.1 เดิม — ยังยืน)
- **รอบที่เปิดอยู่:** บันทึกต่อได้ (ยังยืน)

### 6.3 ⚠️ ข้อเสนอให้เปลี่ยนพฤติกรรมปัจจุบัน — เลิกคืน 410 แบบว่างเปล่า

`[CODE]` วันนี้เมื่อใบถูกเพิกถอน/หมดอายุ resolver คืน **410 โดยไม่มี trace field ใด ๆ** เลย
`[OURS]` **ผมเสนอให้เปลี่ยน** เป็น 200 พร้อมแบนเนอร์แดงเต็มหน้า และเนื้อหาแช่แข็งครบ เหตุผลสามข้อ:
1. โรงงานที่ซื้อของไปแล้ว **ต้องการหลักฐานตอนใบถูกเพิกถอนมากกว่าตอนปกติ** — การลบหน้าทิ้งคือการทำลายหลักฐานของผู้ซื้อ
2. หน้าว่างเปล่าทำให้โรงงานสรุปว่าแพลตฟอร์มกำลังปิดบัง = ข้อพิพาทที่เราสร้างเอง
3. spec §4.4 เขียนไว้เองว่า "เลขใบ + **สถานะจริงเสมอ** (active/หมดอายุ/เพิกถอน) + ลิงก์ verify"
   → โค้ดปัจจุบันขัดกับ ruling ของ operator เอง ผมเข้าข้าง ruling

---

## 7. PRIVACY — ใครเห็นอะไร และการสแกนเพื่ออัปเดตโดยที่รหัสไม่เคยเป็นกุญแจ

### 7.1 ตารางสิทธิ์เห็น

| ข้อมูล | สาธารณะ | ผู้ซื้อ (ถือใบ ทบ.) | เจ้าของ | เจ้าหน้าที่ |
|---|---|---|---|---|
| ต./อ./จ. ของแปลง | ✔ | ✔ | ✔ | ✔ |
| พิกัดแม่นยำ | ✘ | ✘ | ✔ | ✔ |
| ชื่อผู้ถือ | mask (`นายส. ส█████`) | mask | เต็ม | เต็ม |
| เบอร์/LINE | **default ไม่แสดง** เกษตรกรเปิดเอง | เหมือนสาธารณะ | ✔ | ✔ |
| ชนิดพืช/สายพันธุ์ | ✔ | ✔ | ✔ | ✔ |
| ชื่อสาร/สูตรปุ๋ย | ✘ — แสดงแค่ประเภท (อินทรีย์/เคมี) + จำนวนครั้ง + ครั้งสุดท้ายก่อนเก็บกี่วัน | เหมือนสาธารณะ | ✔ | ✔ |
| ผลแล็บ | มี/ไม่มี + วันที่ + ชื่อแล็บ | + `coaSha256` | ไฟล์เต็ม | ไฟล์เต็ม |
| ค่าผลตรวจ (THC/CBD/ความชื้น/โลหะหนัก) | ✘ | ✘ | ✔ | ✔ |
| น้ำหนัก | ของถุงนี้ + จำนวนถุงทั้งชุด | + สรุปสมดุลมวลของ batch | บัญชีเต็ม | บัญชีเต็ม |
| รายละเอียด care log | สรุปนับ | สรุปนับ | เต็ม | เต็ม |
| ธง (backfill / variance / recall) | ✔ **ทุกธงที่กระทบผู้ซื้อ ต้องเห็น** | ✔ | ✔ | ✔ + เหตุผลเต็ม |
| รูปถ่าย | รูป onsite ป้าย "ถ่ายโดยผู้ตรวจ" + รูปเกษตรกร ป้าย "จากเกษตรกร" | เหมือนสาธารณะ + sha256 | เต็ม | เต็ม |

`[CODE]` **ระเบิดที่ต้องปลดก่อน:** `apps/backend/prisma/schema/trace.prisma:31-36` — ตาราง `Lot`
ยังถือ `labTestReportUrl`, `thcContent`, `cbdContent`, `moistureContent`, `testStatus`
อยู่บน**แถวเดียวกับที่หน้า public ฉายออกมา** R9 คือคำสัญญาเกี่ยวกับพื้นผิวสาธารณะ และห้าคอลัมน์นี้นั่งอยู่บนแถวนั้นพอดี
→ ย้ายออกจาก `Lot` ทั้งหมด (Phase 6) และก่อนหน้านั้นต้องมีเทสต์พิสูจน์ว่าไม่มี projection สาธารณะใด serialise ห้าฟิลด์นี้

### 7.2 สแกนเพื่ออัปเดต — R14 แบบเข้มขึ้น

**หลัก: QR บรรจุแค่ "ที่อยู่สาธารณะ" ไม่เคยบรรจุ token, ไม่เคยบรรจุความลับ, ไม่เคยเป็นกุญแจ**

```
คนแปลกหน้าถ่ายรูป QR ไปสแกน  →  GET /P/P7K2M9QX4RT  →  หน้า public เท่านั้น เขียนอะไรไม่ได้
เจ้าของล็อกอินอยู่แล้วสแกน    →  GET /P/P7K2M9QX4RT  →  หน้า public + ปุ่ม "อัปเดตแปลงนี้"
                                  (เซิร์ฟเวอร์เห็น session → ตรวจว่า org ของ session เป็นเจ้าของแปลงนี้
                                   → ตรวจว่ามีรอบเปิดอยู่ → เรนเดอร์ปุ่ม)
กดปุ่ม → POST พร้อม CSRF token ไปยัง route ที่ผ่าน auth ตามปกติ
```

`[OURS]` **ห้าม redirect ไปยัง URL ภายในเมื่อพบ session** — เพราะถ้าเครื่องนั้นเป็นของคนอื่นที่บังเอิญล็อกอินค้าง
เรากำลังเปิด id ภายในให้เขา และเพราะ redirect ทำให้พฤติกรรมของ URL เดียวกันต่างกันตามผู้ถือ ซึ่งยากต่อการเทสต์
**เรนเดอร์หน้าเดียวกันเสมอ ต่างกันแค่มีปุ่มหรือไม่มี**

`[CODE]` **ห้ามสร้าง scanner ในเว็บ** — วันนี้ jsQR ปรากฏแค่ในเทสต์ (`apps/web-app/src/components/ui/__tests__/qr-image.decode.test.ts`)
และนั่นคือคำตอบที่ถูก: กล้องของ Android และ iOS ถอด QR แล้วเปิด URL ให้เองอยู่แล้ว
การทำ in-page scanner = เพิ่ม permission prompt ให้คนมือเปื้อนดินกลางแดด แลกกับศูนย์

**การมอบอำนาจให้ลูกจ้าง** `[OURS]` — เพิ่ม role `WORKER` ที่ผูกกับแปลง เชิญด้วย short-code
(สอดคล้องกับ org-model direction C ที่บันทึกไว้: เชิญผ่าน in-app notification, add-by phone/short-code
ไม่ใช่เลขบัตร ปชช.) event บันทึก `actorId = ลูกจ้าง`, `onBehalfOfId = ผู้ถือใบ`
ถ้าไม่ทำข้อนี้ ทางออกที่เกิดจริงในโลกคือแชร์รหัสผ่าน ซึ่งแย่กว่าสำหรับข้อพิพาททุกมิติ
`[GP]` แคลิฟอร์เนียเขียนกฎนี้ไว้ตรง ๆ: *"No account manager or user shall share their login, username, or password,
with any other individual for any reason."* (4 CCR §15048) — แต่กฎห้ามเฉย ๆ โดยไม่ให้ทางที่ถูกต้อง คือกฎที่คนละเมิด

### 7.3 PDPA `[LEGAL]` + `[OURS]`

- ฐานการเก็บรักษาบันทึกที่แช่แข็ง: PDPA ม.33 ยกเว้นสิทธิลบให้แก่การเก็บ "เพื่อการก่อตั้งสิทธิเรียกร้องตามกฎหมาย
  การปฏิบัติตามหรือการใช้สิทธิเรียกร้องทางกฎหมาย หรือการยกขึ้นต่อสู้สิทธิเรียกร้อง" (อ้างจากแหล่งรอง ต้องตรวจกับราชกิจจาฯ)
  → **ต้องประกาศฐานนี้ไว้ล่วงหน้าในนโยบาย ไม่ใช่ไปคิดตอนถูกฟ้อง**
- **การออกแบบที่ทำให้ความขัดแย้งนี้ไม่เกิดตั้งแต่แรก:** เอา PII ออกจาก payload ที่เซ็น เก็บแต่ hash
  → คำขอลบข้อมูลกับความเปลี่ยนแปลงไม่ได้ **ไม่ชนกัน** เพราะไฟล์ที่มี PII อยู่คนละที่ ลบได้ ส่วน hash ไม่ใช่ PII
- ชื่อบุคคลบนหน้า public: mask ตาม pattern หน้า verify เดิม
- **ยังต้องให้ทนายตัดสิน:** การเผยแพร่หน้า trace ที่ผูกกับฟาร์มที่ระบุตัวได้ มีฐานทางกฎหมายอะไร
  และถ้าเป็น "ความยินยอม" ที่ถอนได้ → "แช่แข็งตลอดกาล" กับสิทธิถอนความยินยอมชนกันทันที ใครชนะ (§14)

---

## 8. FAILURE & EDGE CASES

### 8.1 บันทึกออฟไลน์

`[CODE]` วันนี้ **มีศูนย์** และเป็นนโยบายที่ตั้งใจปิด: `apps/web-app/src/components/runtime/pwa-service-worker-guard.tsx:5`
(`const isPwaEnabled = process.env.NEXT_PUBLIC_PWA_ENABLED === 'true';`) และ `apps/web-app/public/sw.js:24`
(`await self.registration.unregister();`) · IndexedDB มีใช้ แต่ผูกกับ draft ของแบบฟอร์มคำขอเท่านั้น
`[CODE]` มีแอป Flutter ที่มี dependency ครบ (`mobile_scanner`, `sqflite`, `hive`, `connectivity_plus`)
แต่ README ยังเป็นเทมเพลต `flutter create` — **ห้ามอ้างว่าแอปนี้ถูกใช้งานจริง จนกว่าจะมีใครพิสูจน์**

**ออกแบบ:**
```
คิวในเครื่อง (IndexedDB / sqflite) เก็บ: clientEventId (uuid v7) · eventType · occurredAt (ผู้ใช้กรอก)
                                          capturedAt (นาฬิกาเครื่อง) · geo · รูป · payload
sync  →  POST พร้อม clientEventId
         เซิร์ฟเวอร์: recordedAt = now() · entryMode = OFFLINE_SYNC · เก็บ capturedAt ตามที่ได้มา
                       @@unique([organizationId, clientEventId]) → ส่งซ้ำ = 200 คืน event เดิม (idempotent)
```
`[LEGAL]` และข้อสำคัญที่สุด: **ห้ามฟอกบันทึกออฟไลน์ให้ดูเหมือนบันทึกสด** `capturedAt` ต้องถูกป้ายว่า
"นาฬิกาเครื่อง — ยืนยันไม่ได้" ทุกที่ที่แสดง เพราะเราไม่มีทางรู้ว่าเครื่องตั้งเวลาถูก
`[OURS]` แต่บันทึกออฟไลน์ที่ป้ายชัด **มีน้ำหนักมากกว่า** บันทึกที่ทำจากความจำตอนเย็น และนั่นคือทางเลือกจริงในไร่

**หน้าสแกนสาธารณะต้องเป็น server-rendered** `[CODE]` วันนี้เป็น client island ที่ยิง fetch อีกรอบ
(`apps/web-app/src/app/trace/[qr-code]/page.tsx:13-19` + `apps/web-app/src/app/trace/trace-fetch.ts:80`)
→ บนสัญญาณอ่อนในชนบท ผู้ซื้อเห็นจอขาวตอนที่ QR ควรจะสร้างมูลค่าพอดี

### 8.2 ป้ายแปลงหาย/พัง

| กรณี | ทำอะไร |
|---|---|
| ป้ายชำรุด/หาย ไม่มีเหตุสงสัย | `MARKER_REPRINTED` — **รหัสเดิม** พิมพ์ใหม่ ประวัติต่อเนื่อง |
| สงสัยว่าถูกขโมยไปสวมรอย | `MARKER_REVOKED` + `MARKER_ISSUED` รหัสใหม่ · รหัสเก่า **ไม่ลบ** แต่หน้าเก่าขึ้น "รหัสนี้ถูกยกเลิกเมื่อ …" + ลิงก์ไปรหัสใหม่ · รหัสเก่าเขียนอะไรไม่ได้ตลอดกาล · **ห้ามนำรหัสเก่าไปใช้ซ้ำกับแปลงอื่นเด็ดขาด** |

`[GP]` ทำไมต้องคิดถึงเรื่องนี้ตั้งแต่วันนี้: รหัสพื้นที่ปลูกทุเรียนเวียดนามคือระบบเดียวกับเราแต่เดินหน้าไปก่อน 4 ปี
และกำลังถูกปลอม — ผู้ประกอบการปลอมหนังสือมอบอำนาจและตราประทับบริษัทเพื่อใช้รหัสของผู้ปลูกรายอื่น
จีนตั้งธง 400+ รหัส ระงับ 167 รหัส (ม.ค. 2568 – พ.ค. 2569)
→ **ผลต่อการออกแบบ: QR แปลงต้องไม่กล่าวอ้างอะไรเกี่ยวกับ "ของ" เลย** มีแต่ QR ถุงเท่านั้นที่กล่าวอ้างถึงของ
และหน้าแปลงต้องเขียนภาษาไทยชัด ๆ ว่า "รหัสนี้ระบุแปลงปลูก ไม่ได้ระบุสินค้าที่ท่านถืออยู่"

### 8.3 รหัสถุงซ้ำ

- **การ mint ซ้ำ:** เป็นไปไม่ได้ — unique constraint ระดับฐานข้อมูล
- **การถ่ายเอกสาร QR ไปแปะซ้ำ:** **ป้องกันไม่ได้ ตรวจจับได้** และต้องพูดตรง ๆ แบบนี้
  - `TraceQrScan` มีอยู่แล้ว (`trace.prisma:103-124`) → สัญญาณ: รหัสถุงเดียวถูกสแกนจากหลายเครือข่าย/หลายจังหวัดหลัง `SHIPPED` → ธง
  - **จำนวนถุงทั้งชุดพิมพ์อยู่บนใบ ทบ. และบนฉลาก** → โรงงานที่รับ 500 ถุงจากชุดที่ระบุว่า 400 ถุง รู้ทันที
  - พิมพ์ **serial อ่านได้ด้วยตา + 4 ตัวแรกของ hash** ใต้ QR → เทียบสองถุงด้วยตาเปล่าได้โดยไม่ต้องมีเน็ต
  - ⚠️ `[GP]` ผู้บริโภคเวียดนามไม่เชื่อ QR ฟาร์มอยู่แล้ว ด้วยเหตุผลนี้เป๊ะ: สงสัยว่าของในถุงตรงกับรหัสจริงไหม
    **ไม่มีระบบดิจิทัลไหนแก้ข้อนี้ได้** สิ่งที่ทำได้คือทำให้การโกงมีต้นทุนและทิ้งร่องรอย

### 8.4 rate limit — ของเดิมพังทั้งสองทาง

`[CODE]` `apps/backend/server.js:230-236, 284` — limiter ตัวเดียว 1000 req / 15 นาที **ต่อ IP** ครอบ `/api` ทั้งหมด
รวมถึง `/api/trace` (ซึ่ง :184 เปิด CORS ไว้)
→ ผู้ให้บริการมือถือไทยใช้ CGNAT (เกษตรกรหลายคนใช้ IP เดียวกัน) และโรงงานที่สแกนถุงเป็นร้อยจาก NAT สำนักงานเดียว
อยู่ในถังเดียวกับทุกคนที่อยู่หลัง NAT นั้น → **ล็อกเอาต์ทั้งฝั่งเกษตรกรและฝั่งผู้ซื้อ** ซึ่งกลายเป็นข้อพิพาท ("QR สแกนไม่ได้")
**แก้:** limiter แยกสำหรับ trace read: เพดานต่อ IP สูงมาก + เพดานต่อ**รหัส**ต่ำ (เช่น 60/นาที/รหัส) + throttle บนรหัสที่ไม่มีอยู่จริง
(กันการไล่นับ ซึ่งเป็นภัยจริงตาม §2.2)

### 8.5 แล็บตกหลังส่งถุงไปแล้ว

```
LAB_RESULT_ATTACHED (non_conformant)  →  RECALL_ISSUED (subject = BATCH)
   → ทุกรหัสถุงจาก batch นั้น: กล่อง "สถานะวันนี้" ขึ้นแบนเนอร์แดง + วันที่ + ขอบเขต
   → ใบ ทบ. ที่เซ็นไปแล้ว ไม่ถูกแก้ ไม่ถูกถอน — มันยังเป็นข้อความจริงว่า ณ วันบรรจุเรารู้เท่านั้น
   → RECALL_LIFTED ถ้ามีการตรวจซ้ำแล้วผ่าน (เป็น event อีกใบ ไม่ใช่การลบ event เดิม)
```
`[OURS]` **ความตึงที่ต้องพูดตรง ๆ:** ไฟล์ที่ผู้ซื้อดาวน์โหลดไปเมื่อ 3 เดือนก่อน **บอกอนาคตไม่ได้**
นั่นคือธรรมชาติของการแช่แข็ง เราจึงต้อง (ก) พิมพ์ `liveStatusUrl` บนใบ ทบ. และบนฉลาก
(ข) เสนอการแจ้งเตือนแบบไม่ต้องล็อกอิน: กรอกอีเมล/LINE ผูกกับรหัสถุง เพื่อรับแจ้งเมื่อสถานะเปลี่ยน
**ข้อ (ข) เป็นการขยาย R6** (โรงงาน = สแกนดูอย่างเดียว) แต่ไม่ใช่การเพิ่ม login — ดู §11 B7

### 8.6 ขายฟาร์ม / เปลี่ยนผู้ถือ

- `HOLDER_CHANGED` เป็น event บนแปลง — ไม่ใช่การ UPDATE คอลัมน์เจ้าของ
- รอบเก่าและถุงเก่า **แช่แข็งชื่อผู้ถือเดิมไว้ตลอดกาล** (มันคือความจริง ณ ตอนนั้น)
- หน้าแปลงแสดงผู้ถือปัจจุบัน + "เปลี่ยนผู้ครอบครองเมื่อ …"
- ผู้ถือใหม่ **เปิดรอบใหม่ไม่ได้จนกว่าจะมีใบรับรองของตัวเอง** — `[LEGAL]`⚠️ ใบรับรอง GACP โอนตามที่ดินได้หรือไม่
  คือคำถามกฎหมาย/ระเบียบกรมฯ ที่ **ผมตอบไม่ได้** และต้องถาม (§14)
- ผู้ถือเดิมเสียสิทธิเขียนบนแปลง แต่ยังอ่านประวัติรอบของตัวเองได้ (เพราะเขาอาจต้องใช้สู้คดี)

### 8.7 แปลงแบ่ง / แปลงรวม

```
PLOT_SPLIT   : parent P7K2M9QX4RT → ปิดรับการเขียนถาวร
               mint P… ใหม่ N รหัส แต่ละอันมี derivedFrom = [P7K2M9QX4RT]
PLOT_MERGED  : parents N รหัส → ปิดรับการเขียน
               mint P… ใหม่ 1 รหัส derivedFrom = [รหัสพ่อแม่ทั้งหมด]
```
- รหัสเก่ายัง resolve ได้ตลอดกาล หน้าเก่าแสดงสายพันธุกรรมของแปลง
- **ห้ามแบ่ง/รวมขณะมีรอบเปิดอยู่บนแปลงใด ๆ ที่เกี่ยวข้อง** — ไม่งั้นสมดุลมวลไม่มีความหมาย
- `[CODE]` วันนี้ทำไม่ได้เลย เพราะ `apps/backend/prisma/schema/farm.prisma:226` — `Plot.farm` เป็น
  `onDelete: Cascade` → ลบฟาร์ม = ลบแปลงจริง ๆ = ป้ายกายภาพที่ปักอยู่ในไร่กลายเป็นเด็กกำพร้า
  และ QR ประวัติศาสตร์ทุกใบที่ resolve ผ่านแปลงนั้นพัง
  → ต้องเป็น `onDelete: Restrict` + soft delete แบบเดียวกับที่ `Certificate` ได้ไปแล้วด้วยเหตุผลเดียวกัน

### 8.8 ตารางกรณีเสียอื่น ๆ

| กรณี | พฤติกรรม |
|---|---|
| กุญแจเซ็นถอดรหัสไม่ได้ (หนี้ที่ค้างอยู่ในบันทึกความจำ: "PKI signing key bad-decrypt → hash-only") | **ปฏิเสธการบรรจุ** ในโปรดักชัน — ห้ามออกใบ ทบ. ที่ไม่มีลายเซ็น · dev/test เท่านั้นที่ยอมให้ hash-only และต้องป้ายชัด |
| `TraceQrSecurity` แถวเก่าที่ `signatureAlgorithm = 'HMAC-SHA256'` (`qrcode-service.js:304-320` ยัง verify ได้) | HMAC คือความลับร่วม — ผู้ verify กับผู้ปลอมคือคนเดียวกัน → **ถือว่าไม่มีลายเซ็น** ในข้อพิพาททุกกรณี และ API ต้องรายงานว่า `UNSIGNED_LEGACY` ไม่ใช่ `valid: true` |
| ไม่มี TSA ตอนบรรจุ | คอมมิตได้ ตั้งธง `NO_TSA` บนใบ ทบ. + job ตามไปขอ token ย้อนหลังแล้วผูกเพิ่ม (เป็น event ใหม่ ไม่แก้ของเดิม) |
| ฐานข้อมูลถูกกู้คืนจาก backup แล้ว seq หาย | โซ่ hash จับได้ทันที (`prevHash` ไม่ต่อ) → ประกาศเป็น incident ไม่ใช่ซ่อม เพราะการซ่อมเงียบ ๆ คือสิ่งเดียวที่ทำลายระบบนี้ได้จริง |
| ACFS QR Trace on Cloud ของ มกอช. อยู่บนถุงเดียวกัน | `[REG]` ระบบตามสอบสมุนไพรของรัฐไทยที่ฟรีและมีอยู่แล้ว → **ต้องตัดสินใจอย่างจงใจ** ว่าจะอยู่ร่วม (สองสติกเกอร์) เชื่อมกัน หรือแยกบทบาท ไม่ใช่ไปค้นพบเอาที่หน้าโกดัง (§14 คำถาม L5) |

---

## 9. MIGRATION — expand-before-contract, ทุกเฟสส่งขึ้นได้เองและมีประโยชน์เอง

> `[CODE]` บริบท: `apps/backend/prisma/migrations` มี **125 รายการ** แล้ว การเพิ่มตาราง/คอลัมน์เป็นงานประจำของ repo นี้
> ความเสี่ยงจริงไม่ใช่ปริมาณ แต่คือต้นไม้รายต้นที่เลิกใช้แล้ว: `plant_units`, `plant_unit_edit_history`,
> `care_logs` (cascade จาก plant_units) + relation ที่ห้อยจาก `PlantingCycle`, `PlantingCyclePlot`, `HarvestBatch`
> — เลิก R8 ให้สะอาด = ตัด 4 relation ไม่ใช่ drop 1 ตาราง

| Phase | ทำอะไร | Tier คาด | ส่งขึ้นแล้วได้อะไรทันที |
|---|---|---|---|
| **0 · ปลดชนวน** | ① ลบ `autoCreateFirstCycleTraceForPassedAudit` + export (`apps/backend/services/traceability/auto-first-cycle-trace.js:69-191`, export ที่ `traceability-service.js:456-460,1092`) — มันสร้าง `HarvestBatch.freshWeight` จาก `declaredHarvestWeight` **ในแบบฟอร์มคำขอ** แล้ว mint Lot ที่มี QR ตอน audit ผ่าน = QR รับรองผลผลิตที่ไม่เคยปลูก ไม่เคยเก็บ ไม่เคยชั่ง · ตรวจแล้วไม่มี caller ในโปรดักชัน (มีแต่ service เองกับเทสต์หนึ่งใบ) → ลบถูก ไม่ใช่ลบเสี่ยง **แต่ต้องเช็กข้อมูลจริงหา marker `AUTO_TRACE_META` ก่อน** ② ปฏิเสธ HMAC บนเส้นทางหลักฐานทุก env ③ quiet zone 4 โมดูล + ECC=H + ออก QR เป็น vector | A/B | ปืนที่จ่อเท้าหายไป · ฉลากสแกนติดขึ้นทันที |
| **1 · `trace_events` + dual-write** | สร้างตาราง + grants append-only + trigger + hash chain ต่อ tenant · ทุก write path เดิม (care log, harvest, drying, lot) **เขียนคู่** ลง event log · **ยังไม่มีใครอ่าน** | C (migration) | เริ่มสะสมร่องรอยจริงตั้งแต่วันแรก · `[CODE]` endpoint `/interoperability/v1/event-contracts/trace-events` มีอยู่แล้วและวันนี้ **ฉาย** event จากแถวที่แก้ได้ (`interoperability-trace-events.js` + `createEvent` ที่ `interoperability-core.js:121-147`) → เปลี่ยนให้อ่านจาก log จริงได้ทันที = สัญญา API ไม่เปลี่ยน แต่คำตอบกลายเป็นของจริง |
| **2 · ตัวตน** | เพิ่ม `plots.publicCode` (nullable ก่อน) · `pack_units` ตารางใหม่ · backfill รหัสให้ของเดิมทั้งหมด · **URL uuid เดิมต้อง resolve ได้ตลอดกาล** ผ่านตาราง alias · เปลี่ยน entityType ของ QR แปลง `PLANTING_CYCLE_PLOT` → `PLOT` (mint ใหม่ ของเก่ายัง resolve) · `Plot.farm onDelete: Restrict` + soft delete | C | **ป้ายถาวรหน้าแปลงเป็นจริงได้** — ชัยชนะภาคสนามอันดับหนึ่งของ operator |
| **3 · สมดุลมวล + แช่แข็ง** ⭐ | บัญชี batch คำนวณจาก event · `PACKED` ผ่านประตูสมการ (เก็บตรรกะ row-lock เดิมทั้งก้อน) · สร้างใบ ทบ. + JCS + เซ็น + self-verify · ตาราง `packing_records` (INSERT-only) · หน้าถุงเรนเดอร์จากใบที่แช่แข็ง · ปุ่มดาวน์โหลด | C | **นี่คือ dispute artefact** ทุกเฟสหลังจากนี้คือการขยายเสียง ไม่ใช่การสร้างของใหม่ |
| **4 · แก้=ต่อท้าย + โชว์ย้อนหลัง + ออฟไลน์** | UI เกษตรกรเหมือนเดิม (ยังดูเหมือนแก้ได้) แต่หลังบ้านต่อท้าย · ป้ายบันทึกย้อนหลัง/ออฟไลน์บน timeline · คิวออฟไลน์บนเว็บ (+ Flutter ถ้ามันมีจริง) | B/C | บันทึกเริ่มมีค่าต่อผู้ตรวจ GACP · เกษตรกรบันทึกในไร่ได้จริง |
| **5 · ยึดกับโลกภายนอก** | RFC 3161 token (ETDA/TEDA ถ้าติดต่อได้ — ต้องถาม `[REG]` ขมธอ. 33-2566 ประกาศ 24 ม.ค. 2566 · ถ้าไม่ได้ ใช้ TSA พาณิชย์) · Merkle tree head รายวันเผยแพร่นอกโครงสร้างของเรา + inclusion proof | C | "คุณจะเขียนเมื่อวานก็ได้" ใช้ไม่ได้อีกต่อไป |
| **6 · contract (การลบ)** | `PlantingCycle.certificateId` NOT NULL · `HarvestBatch.cycleId` NOT NULL (แถวที่ backfill ไม่ได้ ให้ marker `LEGACY_UNLINKED` **ห้ามยัดค่าปลอม**) · `CareLog` ย้ายจาก `plantUnitId` → cycle, `onDelete: Restrict` · ลบ 5 คอลัมน์แล็บออกจาก `Lot` · drop `plant_units` tree · ปิดทาง hard-delete ของ cultivation log | C | หลักฐานหายไม่ได้อีก · R9 ปลอดภัยระดับสคีมา |
| **7 · EPCIS เต็มรูป (ถ้าคุ้ม)** | **เฉพาะเมื่อได้ GS1 Company Prefix** → เพิ่มพาธ `/414/{gln}`, `/01/{gtin}/21/{serial}` ขนานกับของเดิม + EPCIS 2.0 JSON export + EPCIS Event Hash ID ตาม CBV §8.9.2 | C | ระบบของโรงงานที่ใช้ GS1 อ่านของเราได้โดยไม่ต้องคุยกัน |

**ลำดับความคุ้มค่าต่อแรงงาน (ถ้าต้องเลือกทำน้อยกว่านี้):** 3 > 1 > 0 > 2 > 4 > 5 > 6 > 7
เฟส 3 คนเดียวเปลี่ยนผลของข้อพิพาทได้ ที่เหลือคือการทำให้มันแข็งขึ้นและใช้ง่ายขึ้น

---

## 10. การพิมพ์ — สองชิ้น สองรูปแบบความเสียหาย

`[CODE]` ของที่มีแล้ว: สติกเกอร์ 100×100 มม. พร้อม QR 50×50 มม. ทำงานครบตั้งแต่ HTML → PDF
(`apps/backend/services/pdf/lot-label-template-service.js`, `templates/lot-label.html:91-92`,
`routes/api/helpers/lots-label-routes.js` เพดาน 50 ใบ/ครั้ง) — เริ่มจาก "แก้คุณภาพสัญลักษณ์" ไม่ใช่จากศูนย์

**ข้อบกพร่องที่ตรวจแล้ว 3 ข้อ:**
1. **quiet zone ผิดทุกที่** — เทมเพลตใช้ `margin: 1`, service ใช้ `margin: 2` (`qrcode-service.js:143-145, 173-175`)
   `[STD]` ISO/IEC 18004 และ GS1 ต้องการ **4 โมดูล** รอบด้าน
2. **QR เป็นภาพ raster 300 px ที่ถูกยืดไปเป็น 50 มม.** (~152 dpi บนกระดาษ) → ขอบโมดูลถูก resample
   ก่อนถึงหัวพิมพ์ = สาเหตุคลาสสิกของการสแกนไม่ติดบนสติกเกอร์ความร้อน · QR คือ line art **ต้องออกเป็น vector**
3. **ECC ตรึงไว้ที่ `M`** และ caller override ไม่ได้ → ยกเป็น `H` ได้ฟรีตามการวัดใน §2.2

**สองชิ้นที่ต้องแยกกัน:**

| | ป้ายแปลง (QR ใบที่ 1) | ฉลากถุง (QR ใบที่ 2) |
|---|---|---|
| ความเสียหายที่ต้องทน | แดด มรสุม โคลน เครื่องตัดหญ้า หลายปี | มือเปียก ฝุ่น เดือนเดียว |
| วัสดุ `[OURS]` | แผ่นพิมพ์ UV หรือแกะสลักเลเซอร์บนเสาปัก — อยู่ได้หลายปีกว่าอิงค์เจ็ตเคลือบพลาสติก | สติกเกอร์ตามเดิม |
| ขนาด QR | ≥ 50 มม. ECC=H → โมดูล 1.35 มม. (วัดแล้ว) | 40–50 มม. ECC=H → 1.08–1.35 มม. |
| ข้อความใต้ QR | **รหัสอ่านได้ด้วยตา ตัวใหญ่** + "รหัสนี้ระบุแปลงปลูก ไม่ได้ระบุสินค้า" | รหัสถุง + 4 ตัวแรกของ hash + จำนวนถุงทั้งชุด + `liveStatusUrl` |
| ใครพิมพ์ | แพลตฟอร์มออก **PDF เวกเตอร์ขนาดตายตัว** ให้ร้านพิมพ์ระดับอำเภอทำ — อย่าสมมติว่าเกษตรกรมีเครื่องพิมพ์ | เครื่องพิมพ์ฉลากของเกษตรกร/กลุ่ม |

`[STD]` กรอบขนาดที่ควรออกแบบให้อยู่ในนั้น: GS1 UK ระบุ X-dimension ของ QR สำหรับหน่วยผู้บริโภคที่
0.396 มม. (ต่ำสุด) / 0.495 มม. (เป้า) / 0.990 มม. (สูงสุด) — ตัวเลขที่เราวัดได้ (1.08–1.35 มม.) อยู่**เหนือ**เพดานนั้น
ซึ่งเป็นฝั่งที่ถูกสำหรับถุงที่จับด้วยมือเปียก แต่ต้องรู้ตัวว่าเราอยู่นอกกรอบ POS ของ GS1 โดยเจตนา
`[OURS]` ไม่มีข้อมูลราคาจริงของสติกเกอร์/เครื่องพิมพ์/ป้ายเสาในไทย — ทุกอย่างในหัวข้อนี้เป็นเหตุผลเชิงวิศวกรรม
**ต้องไปถามเกษตรกรจริง 2-3 รายและร้านพิมพ์ระดับอำเภอก่อนออกแบบจริง**

---

## 11. จุดที่ออกแบบนี้ขัดกับ ruling ของ operator — พูดตรง ๆ ทีละข้อ

### A. ruling ที่ยืนครบ ไม่แตะ
- **R1** (ข้อมูลในแบบฟอร์มคำขอ = intent ไม่ไหลเข้าเมนูปลูก) — ยืน และเฟส 0 ลบโค้ดที่ละเมิดข้อนี้อยู่ (`auto-first-cycle-trace.js` ใช้ `declaredHarvestWeight` จากแบบฟอร์มคำขอไปสร้าง batch จริง)
- **R2 / R3** (ไม่มีใบ = ไม่มีการบันทึก = ไม่มี QR) — ยืน และแข็งขึ้น เพราะ `CYCLE_OPENED` ที่ไม่มี `certSnapshot` = event ที่ไม่ valid
- **R4 / R5** (ผลแล็บผูก batch, เกษตรกรอัปเอง) — ยืนครบ
- **R8** (เลิกรายต้นถาวร) — ยืน และตอนนี้มีหลักฐานอ้างอิงป้องกันตัว (§2.3)
- **R10** (มี QR สองใบเท่านั้น ไม่มีใบที่สาม) — ยืน · `[STD]` และมาตรฐาน resolver ของ GS1 (1.2.1, ส.ค. 2569) ยืนยันว่าถูก: QR ที่พิมพ์ใบเดียวเสิร์ฟผู้บริโภค/โรงงาน/ผู้ตรวจได้คนละหน้า ผ่าน linkType — **ไม่ต้องมีใบที่สาม ไม่ใช่เพราะเราจำกัด แต่เพราะมาตรฐานออกมาแบบนั้นอยู่แล้ว**
- **R11 / R14** (QR ใบที่ 1 เป็นประตูอัปเดต · สิทธิ์มาจาก session ไม่ใช่จากรหัส) — ยืน และผมขอให้เขียนแรงกว่าเดิม (§7.2)

### B. จุดที่ผมขอเปลี่ยน — เรียงตามความสำคัญ

**B1 · R13 — เปลี่ยน *กลไก* ไม่เปลี่ยน *กติกา*** (สำคัญที่สุด)
ruling: "เนื้อหาที่มันชี้คือภาพแช่แข็ง ณ เวลาบรรจุ เปลี่ยนตามภายหลังไม่ได้เด็ดขาด"
**ผมเห็นด้วยกับกติกา 100% แต่กลไกที่มีวันนี้ทำตามไม่ได้** — และการพิมพ์คำนี้บนถุงทั้งที่ทำไม่ได้ คือการสร้างข้อพิพาทเอง
หลักฐาน 3 บรรทัดที่ §4.1 (registerTraceIntegrity เขียนทับ · โซ่ข้าม tenant · printedAt ครอบแค่แถว Lot ขณะที่
harvest-service และ cultivation-log-service แก้และลบบรรพบุรุษได้อิสระ)
**เสนอ:** แช่แข็งด้วย "เอกสารที่เซ็นและแจกออกไป" แทน "flag ในฐานข้อมูลเรา"
+ แยกกล่อง "ณ วันบรรจุ" กับ "ณ วันนี้" ให้ขาดจากกัน (ไม่งั้นชนกับ §4.4 ของ spec เอง)

**B2 · R12 — ผมขอ *แคบลง* และ *เปิดช่องแก้ไว้ตลอดกาล***
ruling: "ตัดแล้ว = บันทึกการปลูกของรอบนั้นล็อกถาวร แก้ไม่ได้อีก"
เสนอสองการเปลี่ยน:
- **(ก) แคบลง:** ล็อกเฉพาะบันทึก**การปลูก**ของรอบนั้น · บันทึก**หลังการเก็บเกี่ยว** (ตาก/อบ/แปรรูป) อยู่กับ batch
  และเปิดจนถึงวันบรรจุ → **นี่คือคำตอบของช่องว่างที่ spec เดิมเปิดค้างไว้เองใน §7.3** และข้อมูลก็มีที่อยู่แล้ว:
  `apps/backend/prisma/schema/harvest.prisma:46-49` (`isDried`, `dryingMethod`, `dryingTemp`, `dryingDuration`)
  `[STD]` และมาตรฐานรองรับตรง ๆ: EPCIS 2.0 §7.4.5 หน้า 93 — การแปลงที่กินเวลานาน แสดงเป็น
  *"a series of EPCIS events ... A transformationID may be included in two or more TransformationEvents to link them together"*
- **(ข) แก้ได้ตลอดกาล ในความหมายว่า "ต่อท้ายได้ตลอดกาล":** ล็อก ≠ แก้ความผิดพลาดไม่ได้
  ระบบที่แก้ไม่ได้เลย บังคับให้คนไปโกหกที่อื่น และผู้ตรวจจะเจอความจริงคนละชุด
  `[LEGAL]` และในทางกฎหมาย ม.11 ให้ศาลชั่ง "วิธีการที่ใช้สร้าง" ไม่ใช่แค่ "วิธีการที่ใช้ล็อก" —
  ล็อกไม่พิสูจน์อะไรเลยเกี่ยวกับสิ่งที่เกิดขึ้นก่อนล็อก ถ้าเกษตรกรทับวันใส่ปุ๋ยได้อิสระ 3 เดือนแล้วค่อยล็อก
  **บันทึกที่ล็อกแล้วนั้นแทบไม่มีน้ำหนัก** → §7.4 ข้อ 2 ("แก้ = เพิ่มรายการ ไม่ใช่ทับ") ไม่ใช่ของแถม
  มันคือเสาหลัก และควรถูกยกจาก "สิ่งที่ยังต้องมี" ขึ้นเป็นกติกาที่มีหมายเลข

**B3 · R13 ขยาย — QR ใบที่ 2 เป็น *รายถุง* ไม่ใช่รายชุดบรรจุ**
**ไม่ใช่การกลับไปทำ R8** รายต้น = input side ทำไม่ได้จริงในไร่ · ถุง = output side และมีฉลากอยู่แล้ว ต้นทุนส่วนเพิ่ม ≈ 0
ถ้าทุกถุงมี QR เดียวกัน: ชี้ถุงที่พิพาทไม่ได้ · นับที่ออกไปไม่ได้ (สมดุลมวลไม่มีตัวหาร) · ถ่ายเอกสารแล้ว verify ผ่านทุกใบ
`[OURS]` **ไม่มีกฎ GS1 ข้อไหนบังคับ** — ดุลพินิจวิศวกรรมล้วน ๆ ต้องพูดแบบนี้กับกรมฯ
ประนีประนอม: บังคับเฉพาะ `PlantSpecies.group = HIGH_CONTROL` (กัญชา/กระท่อม) ให้เลือกได้ใน `GENERAL`

**B4 · R7 — ผมขอ *ผ่อน* ที่ประตูเข้า และ *เข้ม* ที่ประตูออก**
ruling: "ข้อมูลการปลูก + ข้อมูลแปลงปลูก = บังคับครบทุกช่อง ตั้งแต่สร้างรอบปลูก"
`[GP]` หลักฐานที่ตรงกับผู้ใช้ของเราที่สุดและเป็นข่าวร้ายที่สุด: งานของ Amekawa เรื่อง Q-GAP —
เกษตรกรส้มโอที่ได้ใบรับรองแล้ว **ส่วนใหญ่เลิกทำบันทึก** และ 34 จาก 64 คนไม่เข้าใจว่า GAP มีไว้ทำอะไร ·
งานปี 2566 ที่เชียงใหม่: 39% ได้ใบรับรองโดยผู้ตรวจไม่ได้ดูบันทึกเลย, 56% ได้รับแจ้งล่วงหน้าก่อนการตรวจ "ครั้งแรก",
การตรวจครั้งแรกใช้เวลาเฉลี่ย ~43 นาที
(⚠️ ตัวเลขเหล่านี้มาจากบทคัดย่อ/ผลค้นหา ไม่ได้เปิด PDF ตัวเต็ม — ต้องให้คนอ่านก่อนเอาไปอ้างกับกรมฯ)
**เสนอ:** บังคับตอนสร้างรอบ เฉพาะสิ่งที่ (ก) ใบรับรองพิสูจน์ไว้แล้ว และ (ข) สมการสมดุลมวลต้องใช้:
รหัสแปลง · ชนิดพืช · พื้นที่**พร้อมหน่วย** · วันเริ่มปลูก · จำนวนต้น · เลขใบรับรอง
ที่เหลือ (แหล่งเมล็ด วิธีปลูก วัสดุปลูก แหล่งน้ำ) ให้ทยอยกรอก และ **บังคับครบที่ขั้นบรรจุ** —
ซึ่งเป็นนาทีที่เกษตรกรต้องการอะไรจากเราและยอมจ่ายด้วยข้อมูล
`[OURS]` ทุกช่องบังคับที่ประตูเข้าคือตัวทำนายการเลิกใช้ · เก็บให้ครบตอนที่เขาอยากได้ QR

**B5 · R9 — ขอ *เพิ่ม* ไม่ใช่ *กลับ***
R9 ยืนครบ (ไม่มีไฟล์ ไม่มีค่า ไม่มีคำตัดสินผ่าน/ไม่ผ่านบนหน้า public)
**ขอเพิ่ม `coaSha256`** บนหน้า public และในใบ ทบ. — PII รั่วเท่าเดิมคือศูนย์ (hash ไม่ใช่เนื้อหา)
แต่โรงงานที่ได้ COA ทาง LINE พิสูจน์ได้ว่าเป็นไฟล์เดียวกับที่แพลตฟอร์มเห็น
**วันนี้ช่องนี้เปิดอยู่:** เกษตรกรยื่น COA ปลอมได้ และหน้า public ยังขึ้น "มีผลตรวจ ✓" อยู่ดี

**B6 · พฤติกรรม 410 ตอนใบถูกเพิกถอน — ขอเปลี่ยน** (§6.3)
ไม่ใช่ ruling ของ operator แต่เป็นโค้ดที่ขัดกับ ruling §4.4 ("แสดงสถานะจริงเสมอ") — ผมเข้าข้าง ruling

**B7 · R6 — ขอ *ขยาย* ไม่ใช่ *ยกเลิก***
R6 (โรงงาน = สแกนดูอย่างเดียว ไม่มี login) ยืน · ขอเพิ่มสองอย่างที่ไม่ใช่ login:
(ก) ปุ่มดาวน์โหลดใบ ทบ. (ไฟล์ที่ปลอดภัยต่อสาธารณะโดยการออกแบบ)
(ข) การรับแจ้งเตือนเมื่อสถานะถุงเปลี่ยน โดยกรอกอีเมล/LINE ผูกรหัสถุง — จำเป็นเพราะเอกสารแช่แข็งบอกอนาคตไม่ได้ (§8.5)

---

## 12. สิ่งที่ต้องตัดสินใจก่อนเขียนโค้ดบรรทัดแรก

| # | คำถาม | ทำไมต้องตัดสินก่อน |
|---|---|---|
| **D1** | QR ใบที่ 2 รายถุง หรือ รายชุดบรรจุ? | เปลี่ยนสคีมา `pack_units` และเปลี่ยนงานพิมพ์ทั้งหมด — ตัดสินหลังปักป้ายไปแล้ว = ต้องกลับไปที่ไร่ |
| **D2** | R7 ผ่อนที่ประตูเข้าหรือไม่? | กระทบ validator ทั้งสองฝั่งและ UX ทั้งหน้า |
| **D3** | R12 แคบลงตาม B2(ก) หรือไม่? | ปิดช่องว่าง §7.3 ของ spec เอง — ถ้าไม่ปิด ข้อมูลตาก/อบไม่มีที่อยู่ |
| **D4** | ใบถูกเพิกถอน: 410 ว่างเปล่า หรือ 200 + แบนเนอร์แดง? | กระทบหลักฐานที่ผู้ซื้อถืออยู่ |
| **D5** | หน้าต่างบันทึกย้อนหลัง: 24 ชม. / 30 วัน ตามที่เสนอ? | ตัวเลขนี้กำหนดว่าอะไรถูกป้ายว่า "ย้อนหลัง" — ควรเป็นข้อมูลลงวันที่ แก้ได้โดย operator |
| **D6** | ปิด batch อัตโนมัติที่ 90 วัน? | กระทบสมดุลมวลและงานเกษตรกรจริง |
| **D7** | แถบสูญเสียจากการทำแห้งต่อชนิดพืช เอาตัวเลขจากไหน? | ผมไม่มีข้อมูล — ต้องมาจากกรมฯ/นักวิชาการ ไม่ใช่จากผม |
| **D8** | GS1 Company Prefix: กรมฯ ถือเองแล้วจัดสรรให้เกษตรกร หรือไม่ทำเลย? | ถ้าไม่ทำเลย ต้อง**ประกาศให้ชัดว่าเป็นระบบรหัสของชาติ ไม่ใช่ GS1** และห้ามพูดคำว่า "มาตรฐานสากล GS1" ที่ไหนเลย |
| **D9** | อยู่ร่วมกับ ACFS QR Trace on Cloud ยังไง? | สองสติกเกอร์บนถุงเดียว = คำถามที่หน้าโกดังว่าใบไหนเชื่อได้ |

### 12.3 ทางลัดที่ไม่ซื่อสัตย์ — ตั้งชื่อไว้เพื่อไม่ให้ใครเดินเข้าไป
เราสามารถใช้ **รูปประโยค** Digital Link บนโดเมนตัวเอง แล้วมั่นเลขที่หน้าตาเหมือน GTIN/GLN ขึ้นมาเอง
มันจะดูถูกและสแกนติด แต่เลขจะไม่ unique ระดับโลก ไม่ได้ออกโดย GS1 และไม่ conformant
→ **การอ้างว่า "ตามมาตรฐาน GS1 / มาตรฐานสากล" จะเป็นความเท็จ**
เมื่อเป้าหมายที่ operator ตั้งคือความถูกต้องตามกฎหมายและการกันข้อพิพาท การออกเลข GS1 ปลอมคือสิ่งที่แย่ที่สุดที่ทำได้
เพราะมันผลิตข้อพิพาทที่เขาพยายามกัน โดยมีชื่อกรมฯ ติดอยู่
**ถ้าไม่มี prefix ทางที่ซื่อสัตย์คือรันระบบรหัสของชาติที่ติดป้ายชัดว่าเป็นของชาติ ไม่ใช่การเลียนแบบ GS1**

---

## 13. สิ่งที่ยืนยันไม่ได้ — ห้ามให้ข้อไหนหลุดเข้าไปเป็น "ข้อเท็จจริง"

| # | ยังไม่ยืนยัน |
|---|---|
| **U-1** | **สถานะกฎหมายกัญชาไทยปี 2569 — ไม่มีเลนวิจัยไหนอ่านตัวบทเลย** ประกาศสมุนไพรควบคุม (กัญชา) พ.ศ. 2568 ประกาศ 25 มิ.ย. 2568 มีผลวันถัดมา (จากผลค้นหา ไม่ได้อ่านตัวบท) · กฎกระทรวงยาเสพติดประเภท 5 พ.ศ. 2569 โผล่ในผลค้นหาแต่ไม่ได้เปิด · **หน้าที่บันทึก/รายงานเฉพาะกัญชา = ช่องว่างเต็ม ๆ** |
| **U-2** | **มกษ. 3502-2561 (GACP พืชสมุนไพร) — ไม่ได้อ่าน** เป็น PDF ที่สภาพแวดล้อมนี้แตกข้อความไม่ได้ · มีหัวข้อ "บันทึกข้อมูล และการตามสอบ" (จากผลค้นหา) แต่**ระยะเวลาเก็บรักษาบันทึกและรายการบันทึกที่ต้องมี = ไม่รู้** ห้ามใครอ้างระยะเวลาเก็บจากเอกสารนี้ |
| **U-3** | **เอกสารเงื่อนไข GACP ของกรมฯ เอง (dtam.moph.go.th/…/gacp-2.pdf) — ดาวน์โหลดแล้วอ่านไม่ได้** นี่คือเอกสารของหน่วยงานที่เราทำระบบให้ และเป็นสิ่งที่ยังไม่ได้อ่านที่สำคัญที่สุด |
| **U-4** | **ระยะเวลาเก็บรักษาบันทึก** ไม่พบกฎไทยข้อไหนที่ระบุ · ตัวเลือกที่ต้องไปตรวจ: มกษ. 3502-2561, ประกาศกัญชา 2568, กฎ 5 ปีทั่วไปของประมวลรัษฎากร, EMA HMPC GACP · **ข้อเสนอชั่วคราวเป็น `[OURS]`: อายุใบรับรอง + 5 ปี** |
| **U-5** | **บริการ e-Timestamping ของ ETDA/TEDA** ยืนยันว่ามีบริการและมีมาตรฐาน (ขมธอ. 33-2566) · **ไม่ยืนยัน**: เป็น production หรือ pilot, เอกชนใช้ได้ไหม, โปรโตคอลเป็น RFC 3161 หรือไม่, ราคา, SLA → ต้องถาม ETDA ตรง ๆ ก่อนผูก Phase 5 |
| **U-6** | GS1 Thailand: ค่าธรรมเนียม, กรมฯ ในฐานะส่วนราชการถือ prefix ได้ไหม, จัดสรรแทนเกษตรกรได้ไหมตามกฎ GS1 — **ไม่ตรวจ** และเป็นตัวแปรเดียวที่ล้มแผนตัวตนทั้งหมดได้ |
| **U-7** | เวอร์ชัน EPCIS: ไฟล์ที่ ref.gs1.org เสิร์ฟระบุ "Release 2.0, Ratified, Jun 2022" แต่ artefacts index ระบุ "EPCIS Standard 2.0.1" — **ไม่ได้ diff** ห้ามพิมพ์เลขเวอร์ชันลงเอกสารทางการจนกว่าจะมีคนเปิด 2.0.1 |
| **U-8** | เอกสาร GS1 ที่เปิดไม่ได้ (403): General Specifications, Global Traceability Standard, EPCIS & CBV Implementation Guideline → ข้อความเรื่องโครงสร้าง SSCC / กลไก AI 254 / โครงหลัก GTIN อิงจาก GLN Allocation Rules และหน้า support ไม่ใช่ GenSpecs |
| **U-9** | ร่าง พ.ร.บ.ธุรกรรมทางอิเล็กทรอนิกส์ฉบับใหม่ (ย้ายภาระพิสูจน์ไปฝั่งผู้โต้แย้งเมื่อใช้ "วิธีการทางอิเล็กทรอนิกส์ที่เชื่อถือได้" ตามมาตรฐาน ETDA) มาจากบล็อกสำนักกฎหมาย 2 แห่ง **ยืนยันบน etda.or.th ไม่ได้** ขั้นตอนในสภา ณ 23 ส.ค. 2569 ไม่ทราบ → **ออกแบบให้ได้ประโยชน์ถ้ามันผ่าน แต่ห้ามอ้างเป็นกฎหมาย** |
| **U-10** | ตัวบท ม.8, ม.12, ม.28 ของ พ.ร.บ.ธุรกรรมฯ และ PDPA ม.33 — ได้เฉพาะข้อความปฏิบัติการ ไม่ได้ทั้งมาตรา · **ต้องตรวจกับราชกิจจานุเบกษาก่อนใส่ในสัญญาหรือคำฟ้อง** |
| **U-11** | ตัวเลข Q-GAP (39% / 56% / 43 นาที / "ส่วนใหญ่เลิกทำบันทึก") มาจากผลค้นหา ไม่ได้เปิด PDF ตัวเต็ม (paywall/403) · DOI ยืนยันแล้ว: 10.1080/03066150.2012.746958 และ 10.3390/agriculture13051105 |
| **U-12** | ไม่พบหลักฐานทั้งสองทางว่ามีเขตอำนาจใดในโลกที่ทำระบบติดตามกัญชา **ระดับแปลง** (ไม่ใช่ระดับต้น) → ทางเลือกของเราป้องกันได้ แต่**ไม่มีมาตรฐานให้ชี้** ต้องพูดว่าเป็น `[OURS]` |
| **U-13** | **ไม่ได้ต่อฐานข้อมูลจริง** ไม่รู้จำนวนแถวของ `plant_units`, `care_logs`, `planting_cycles`, `harvest_batches`, `lots` → ประเมินขนาดงาน migration ไม่ได้ และ**ไม่รู้ว่ามี QR กี่ใบหมุนเวียนอยู่แล้ว** ต้องนับก่อนเขียนแผน migration จริง |
| **U-14** | `autoCreateFirstCycleTraceForPassedAudit` เคยรันในโปรดักชันไหม — ยืนยันได้แค่ว่า**วันนี้ไม่มี caller** ไม่ได้ตรวจ git history หรือข้อมูลจริงหา marker `AUTO_TRACE_META` → **ถ้าเคยรัน อาจมี QR ที่รับรองของที่ไม่เคยมีอยู่จริงหมุนเวียนอยู่** ต้องเช็กก่อนพูดต่อสาธารณะว่า QR ของเราหมายถึงอะไร |
| **U-15** | คำพิพากษาแคลิฟอร์เนีย ธ.ค. 2568 เรื่อง METRC — แหล่งเป็นคู่ความในคดี ไม่ได้ดึงคำสั่งศาลจริง ห้ามอ้างต่อหน่วยงานกำกับ |
| **U-16** | ต้นทุนการพิมพ์จริงในไทย (สติกเกอร์ เครื่องพิมพ์ ป้ายเสา ร้านพิมพ์ระดับอำเภอ) — ไม่มีข้อมูล ทั้งหมดใน §10 เป็นเหตุผลเชิงวิศวกรรม |

---

## 14. จุดที่ทนายไทยต้องเซ็นก่อนใช้จริง — คำถามเฉพาะเจาะจง ไม่ใช่การขอพรทั่วไป

**ชุด A — น้ำหนักพยาน**
- **L1** การจัดวางกุญแจเซ็นของเราเข้าเกณฑ์ ม.26(2) "อยู่ภายใต้การควบคุมของเจ้าของลายมือชื่อโดยไม่มีการควบคุมของบุคคลอื่น" หรือไม่
  ในเมื่อกุญแจอยู่ในที่ที่แอปพลิเคชันอ่านได้เอง? ถ้าไม่ ต้องเป็นการเก็บรักษาแบบไหน (HSM / KMS ที่กรมฯ ถือ policy / กุญแจใต้ NRCA)?
- **L2** แพลตฟอร์มเข้าข่ายข้อสันนิษฐาน ม.25 ตาม พ.ร.ฎ.ว่าด้วยวิธีการแบบปลอดภัยฯ พ.ศ. 2553 ได้ไหม และระดับใด?
  (ข้อสันนิษฐานนี้มีค่ามากกว่าวิศวกรรมทุกบรรทัดในเอกสารนี้รวมกัน)
- **L3** ใบ ทบ. ใช้เป็น "หนังสือ"/ต้นฉบับตาม ม.8 และ ม.10 สำหรับการซื้อขายเกษตรกร–โรงงานได้เอง
  หรือเป็นได้แค่พยานประกอบคู่กับสัญญาแยกต่างหาก?

**ชุด B — ความเป็นส่วนตัวและการเผยแพร่**
- **L4** ฐานทางกฎหมายตาม PDPA ของการเผยแพร่หน้า trace ที่ผูกกับฟาร์มที่ระบุตัวได้ คืออะไร?
  ถ้าเป็น "ความยินยอม" ที่ถอนได้ → **"แช่แข็งตลอดกาล" กับสิทธิถอน ชนกันทันที ใครชนะ?**
- **L5** การทำ hash ของ COA (แทนการปกปิดทั้งหมด) เพียงพอตาม PDPA หรือไม่?
- **L6** ต้องมีข้อความอะไร**บนเอกสารและบนหน้าเว็บ** เพื่อไม่ให้ถูกอ่านว่าเป็นการรับประกันคุณภาพโดยรัฐ
  โดยเฉพาะบรรทัดผลแล็บที่ตาม R9 บอกแค่ว่า "มีผลตรวจ"?
- **L7** ระยะเวลาเก็บรักษาที่ต้องใช้ และ PDPA ม.33 ข้อยกเว้นเรื่องการก่อตั้งสิทธิเรียกร้อง
  ครอบคลุมการที่เราปฏิเสธการลบใบ ทบ. ที่แช่แข็งแล้วหรือไม่?

**ชุด C — เฉพาะโดเมน**
- **L8** **กัญชา:** ภายใต้กฎหมาย/ประกาศที่บังคับใช้ ณ ปี 2569 การบันทึกและ**การเผยแพร่**ข้อมูลการตัด/บรรจุ/ผลแล็บ
  ที่เราเสนอ เป็นสิ่งที่ **อนุญาต / บังคับ / ห้าม**? และมีหน้าที่รายงานต่อหน่วยงานใดเพิ่มเติมไหม? (§13 U-1)
- **L9** ใบรับรอง GACP โอนได้ไหมเมื่อขายฟาร์ม (§8.6)?
- **L10** ระบบของเรากับ QR Trace on Cloud ของ มกอช. — ใครเป็นเจ้าของความจริงเมื่อทั้งสองอยู่บนถุงเดียวกัน?

**และคนต้องอ่าน PDF สองใบที่ agent อ่านไม่ได้:** มกษ. 3502-2561 และเอกสารเงื่อนไข GACP ของกรมฯ (§13 U-2, U-3)

---

## 15. สรุปหนึ่งหน้า

**สิ่งที่สร้าง:** ตาราง `trace_events` หนึ่งใบ ต่อท้ายอย่างเดียว บังคับด้วย DB grants มีสองเวลาเสมอ
มุมมองทั้งหมดคำนวณจากมัน → ประตูสมดุลมวลตอน `PACKED` → เอกสาร "ใบบันทึกการบรรจุ" ที่ canonicalise (RFC 8785)
hash โซ่ เซ็น และ **แจกให้ผู้ซื้อถือ** → หน้าเว็บสองกล่อง แช่แข็ง/ปัจจุบัน แยกขาดจากกัน

**สิ่งที่ไม่สร้าง:** EPCIS repository เต็มรูป · GTIN/GLN/SSCC (จนกว่าจะมี prefix จริง) · scanner ในเว็บ ·
role ห้องแล็บ · login ผู้ซื้อ · การติดตามรายต้น

**การเปลี่ยนที่ให้ผลมากที่สุดต่อแรงที่ลง:** ไม่ใช่ blockchain ไม่ใช่ AI — คือ
**(1) ยื่นไฟล์ที่เซ็นแล้วให้ผู้ซื้อถือ + เผยแพร่กุญแจสาธารณะนอกฐานข้อมูลเรา**
**(2) canonical serialisation + เลิกรับ HMAC บนเส้นทางหลักฐาน**
**(3) แก้ = ต่อท้าย + โชว์บันทึกย้อนหลัง**
**(4) สมดุลมวล** — สี่ข้อนี้เป็นของเราทำเองได้ทันที ไม่ต้องรอใคร

**สถานะที่ซื่อสัตย์:** `BLOCKED(operator:D1..D9)` + `BLOCKED(operator:Thai-lawyer-review L1..L10)` +
`BLOCKED(operator:read มกษ.3502-2561 + เอกสารเงื่อนไข GACP ของกรมฯ)`
**ไม่ใช่ DONE และเอกสารนี้ไม่ได้อ้างว่าถูกต้อง 100% — มันอ้างว่าบอกไว้ครบว่าอะไรยังไม่รู้**
