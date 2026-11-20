# ขอ 3 ลักษณะพื้นที่ ออกใบกี่ใบ — คำตอบจากตัวมาตรฐาน

> operator 2026-09-11: *"ผมคาดว่าตาม iso ควรเป็น 3 ใบ ส่วนนี้ต้องหาข้อมูลเพิ่มเติม"*

ค้นแล้ว · **ISO ชี้ไปที่ใบเดียว** และเขียนกลไกการเพิ่มขอบข่ายไว้ตรง ๆ

---

## 1. ข้อความจริงของ ISO/IEC 17065:2012

อ้างจากเช็กลิสต์ที่ IAS (หน่วยรับรองระบบงาน) เผยแพร่ ซึ่งคัดข้อความของมาตรฐานมาทั้งข้อ

**§7.7.1 — ใบรับรองต้องสื่อสารอะไร**
> The certification body shall provide the client with formal certification documentation
> that clearly conveys, or permits identification of the following:
> (a) the name and address of the certification body;
> (b) the date certification is granted…;
> (c) the name and address of the client;
> **(d) the scope of certification (see 3.10);**
> **(e) the term or expiry date of certification, if certification expires after an established period;**
> (f) any other information required by the certification scheme.

**§7.7.3 — ออกใบเมื่อใด**
> Formal certification documentation shall only be issued after, or concurrent with:
> **(a) the decision to grant or extend the scope of certification (see 7.6.1) has been made;**

**§7.10.3 — เมื่อมีการเปลี่ยนแปลงที่กระทบการรับรอง**
> The actions to implement changes affecting certification shall include, if required:
> (a) evaluation; (b) review; (c) decision;
> **(d) issuance of revised formal certification documentation (see 7.7) to extend or reduce the scope of certification;**

**§7.11** — หัวข้อชื่อ *Termination, **Reduction**, Suspension or Withdrawal of Certification*

---

## 2. อ่านรวมกันแล้วได้อะไร — และเส้นแบ่งที่สำคัญที่สุด

| ข้อความในมาตรฐาน | แปลว่า |
|---|---|
| §7.7.1(d) "**the** scope of certification" | ใบต้องบอกขอบข่ายของตัวเองให้ชัด |
| §7.7.1(e) "the term or expiry date **of certification**" | **หนึ่งอายุต่อหนึ่งใบ** |
| §7.7.3(a) "grant **or extend** the scope of certification" | การขยายขอบข่ายเป็นการตัดสินที่มาตรฐานรับรู้ |
| §7.10.3(d) "issuance of **revised** formal certification documentation … to **extend or reduce** the scope" | **กลไกปริยาย**ของ ISO คือแก้เอกสารของใบเดิม |
| §7.11 "**Reduction** … of Certification" | การรับรองหนึ่งรายการลดขอบข่ายได้ |
| **§7.7.1(f)** "any other information required by the **certification scheme**" | **scheme กำหนดเพิ่มเองได้** |
| **§7.8** สิ่งที่ต้องเผยแพร่ "stipulated by the relevant **scheme(s)**" | เช่นเดียวกัน |

**เส้นแบ่งที่ต้องอ่านให้ถูก และเป็นจุดที่รายงานฉบับร่างแรกนำเสนอแรงเกินไป:**

> ISO กำหนดว่าใบรับรอง **ต้องบอกอะไร** — ไม่ได้กำหนดว่า scheme **ออกกี่ใบ**

§7.10.3(d) อธิบายกลไก*ปริยาย*เมื่อขอบข่ายของการรับรองหนึ่งรายการเปลี่ยน · มันไม่ใช่
ข้อห้ามไม่ให้ scheme นิยามว่า "หนึ่งรูปแบบการปลูก = หนึ่งการรับรอง" ซึ่งเมื่อนิยามแบบนั้นแล้ว
การเพิ่มรูปแบบก็คือ **การรับรองรายการใหม่** ไม่ใช่การขยายขอบข่ายของรายการเดิม

สิ่งที่ ISO บังคับจริงและเราต้องทำให้ครบไม่ว่าเลือกแบบไหน: ใบบอกขอบข่ายชัดจนไม่กำกวม ·
ใบมีอายุ · เมื่อขอบข่ายเปลี่ยนต้องมีประเมิน–ทบทวน–ตัดสิน–ออกเอกสารที่สะท้อนผลนั้น

---

## 3. เอกสารของกรมฯ พูดอะไร

ข้อกำหนดฯ (gacp-2.pdf) ไม่ได้ระบุจำนวนใบ แต่รับรู้เหตุการณ์ "ขอเพิ่ม" ไว้ชัด:

- **ข้อ 4**: *"ผู้ประกอบการจะต้องแจ้งให้กรมทราบโดยทันที ถ้ามีการเปลี่ยนแปลงใดๆ … เช่น สายพันธุ์
  **สถานที่ปลูกและการขอรับรองเพิ่มเติม** เป็นต้น"*
- **การตรวจประเภทที่ 3**: *"ตรวจพิเศษ ที่อาจเกิดขึ้นเมื่อผู้สมัคร**ขอการรับรองเพิ่มเติม**"*

และแบบ กทล.๑ ส่วนที่ ๔ (๓) ให้ผู้ยื่นรับรองตนว่า *"ไม่เปลี่ยนพื้นที่/เมล็ดพันธุ์/ส่วนที่ใช้
**โดยไม่ยื่นคำขอใหม่**"* ⇒ ฝั่งกรมมองการเพิ่มพื้นที่เป็นเหตุให้**ยื่นคำขอใหม่** ซึ่งเข้ากับ
การออกใบแยกโดยตรง

---

## 4. เอกสารกรมไม่ได้ตอบสองข้อนี้

1. ขอ 3 ลักษณะในคำขอเดียว กรมออกใบกี่ใบจริง ๆ และใบพิมพ์ขอบข่ายว่าอย่างไร
2. อายุใบรับรองกี่ปี

ทั้งสองข้อต้องถามกรม — ช่องทางในประกาศ: กองกัญชาทางการแพทย์ 02-591-7007 ต่อ 2406
หรือ 061-421-9701

---

## 5. มติ (operator 2026-09-11)

**ออกใบแยกตามรูปแบบการปลูก** — ผ่านสองรูปแบบ = สองใบ คนละเลข คนละวันหมดอายุ

ISO อนุญาต: §7.7.1(f) และ §7.8 ให้เจ้าของ scheme กำหนด · สิ่งที่ ISO บังคับคือใบต้องบอก
ขอบข่ายให้ชัดและต้องมีอายุ ซึ่งแบบแยกใบทำได้ทั้งสองอย่าง

**เหตุผลที่ชี้ขาด**: เมื่อผลแยกตามรูปแบบได้ (M4) แบบใบเดียวต้องออกฉบับแก้ไขทุกครั้งที่มี
รูปแบบผ่านเพิ่ม ⇒ เอกสารของเลขใบเดิมเปลี่ยนไปเรื่อย ๆ · แบบแยกใบ ใบที่ผ่านแล้วออกได้ทันที
และเอกสารที่ออกไปแล้วไม่ถูกแก้อีก · และทำให้อายุที่นับจากวันที่ผ่านสอดคล้องกันเอง

สิ่งที่ตามมาและรับไว้แล้ว: ฟาร์มหนึ่งถือหลายใบ ⇒ ด่านขอบเขตต้องรวมทุกใบที่ยังมีผล
(ทำแล้ว `91ae7a56`) · ต่ออายุแยกใบ · หน้า verify/QR ต้องบอกรายใบ

รายละเอียดการออกแบบ: `docs/superpowers/specs/2026-09-11-per-scope-certification-design.md`

---

## 6. อายุใบรับรอง — ไม่มีเอกสารฉบับใดระบุ

ค้นทั้งแบบ กทล.1 และข้อกำหนดฯ แล้ว **ไม่มีฉบับใดบอกว่าใบรับรองมีอายุกี่ปี**

โค้ดเดิมเขียน `const validYears = 3; // Standard GACP` — เลขที่ระบบประกาศเอง โดยคอมเมนต์
ทำให้อ่านเหมือนเป็นของมาตรฐาน · ตั้งเป็น **1 ปี** ตามคำสั่ง operator 2026-09-11 และย้ายไปอยู่ที่
`config/business-rules.js` `CERTIFICATE.VALIDITY_YEARS` พร้อมป้าย **UNCONFIRMED** และเหตุผล
ติดกับค่า · ด่าน `certificate-validity-is-sourced` ตรึงว่าเลขไม่กลับไปลอยในฟังก์ชันอีก

ISO §7.7.1(e) บังคับให้**มี**อายุ แต่ไม่ได้กำหนดว่ากี่ปี — ความยาวเป็นของกรมฯ ⇒ ต้องถามกรม

---

## 7. แหล่งอ้างอิง

- ISO/IEC 17065:2012 §7.7 / §7.10 / §7.11 — ข้อความคัดจาก
  [IAS ISO/IEC 17065 Sample Checklist Rev 2.0](https://www.iasonline.org/wp-content/uploads/2021/02/Tab-3-01-Sample-17065-checklist.pdf)
  (ตัวมาตรฐานฉบับเต็มมีลิขสิทธิ์ · [ตัวอย่างทางการ](https://cdn.standards.iteh.ai/samples/46568/740b41d2483d48beb9fc63c6c41fd547/ISO-IEC-17065-2012.pdf) มีแค่สารบัญ)
- [ข้อกำหนดและเงื่อนไขการขอใบรับรอง GACP กัญชา — กรมการแพทย์แผนไทยฯ](https://www.dtam.moph.go.th/wp-content/uploads/dtam-gacp/gacp-2.pdf)
- [แบบ กทล.1](https://www.dtam.moph.go.th/wp-content/uploads/dtam-gacp/gacp-1.pdf)
