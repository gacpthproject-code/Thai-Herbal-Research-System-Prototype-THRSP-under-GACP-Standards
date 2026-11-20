# เดินสาย T&T บนฐานข้อมูลจริง — 2026-09-05

ทุกบรรทัดในนี้มาจากการยิงประตูจริงผ่าน HTTP บน backend ที่รันจากต้นไม้โค้ดนี้
ต่อฐาน PostgreSQL ที่ **สร้างใหม่จากศูนย์** (`postgres:15-alpine`, 127.0.0.1:55435)
ไม่ใช่ mock และไม่ใช่ฐานเดิมที่มีอะไรค้างอยู่

## ฐานที่ใช้ และสิ่งที่มันพิสูจน์ไปด้วยตัวมันเอง

`prisma migrate deploy` ลงทั้งประวัติจากศูนย์ **ผ่านทั้งหมด รวมสอง migration ที่ยังค้าง**
(`20260901310000`, `20260905120000_batch_lab_results`) — เป็นการพิสูจน์ที่แรงกว่าการ apply
ใบเดียวบนฐานทิ้ง เพราะมันเดินผ่านทุกใบก่อนหน้าตามลำดับจริง

## สิ่งที่การเดินจับได้ และเทสหน่วยจับไม่ได้

| # | อาการ | สาเหตุ | สถานะ |
|---|---|---|---|
| 1 | `POST /harvest-batches/:id/lab-results` → **500** | Prisma client ที่ generate ไว้ไม่มี `batchLabResult` — migrate ไม่ generate ให้ | รัน `prisma generate` แล้วผ่าน · Docker build ทำอยู่แล้ว บันทึกไว้เป็นข้อควรรู้ตอน deploy |
| 2 | หน้าสแกนสาธารณะคืน `address: null` **ทั้งที่ฟาร์มมีที่อยู่** | select ทั้งสามสาขาใน `resolve-generic.js` ไม่ได้ขอคอลัมน์ที่มติเปิด · Prisma คืน `undefined` ไม่ใช่ error ⇒ projection ตีพิมพ์ `undefined ?? null` | **แก้แล้ว** + เทสระดับ select ต่อสาขา (mutation-proved) |
| 3 | `npm run seed` บนฐานใหม่ **ตาย** | fixture อ้างพืชที่ไม่มีในทะเบียน | แก้เป็น cannabis (คอมมิตก่อนหน้า) |
| 4 | ออกใบรับรองบนเครื่องนี้ไม่ได้ | กุญแจเซ็นถอดรหัสไม่ได้ (`bad decrypt`) — ปัญหาค้างที่รู้อยู่ ห้ามแตะ `keys/` | ไม่ใช่ของ batch นี้ · จึงสร้างแถวรอบปลูก/รุ่นตรง แล้วเดิน **ประตู** ซึ่งเป็นสิ่งที่ต้องพิสูจน์ |

ข้อ 2 คือเหตุผลทั้งหมดที่ต้องกดจริง: เทสหน่วยป้อน object ฟาร์มที่มีที่อยู่ครบให้ resolver
มันจึงพิสูจน์ได้แค่ว่า *projection* ตีพิมพ์ถูก ไม่ได้พิสูจน์ว่า *คิวรีไปเอาคอลัมน์นั้นมา*
เป็นความผิดพลาดชนิดเดียวกับ T8 ในชุดเดียวกัน

## ผลแต่ละข้อ

| ข้อ | ประตู | ผล |
|---|---|---|
| T8 | `GET /planting-cycles/:id/plot-qrs` | `plotCode: PLOT-J3TK7-VP4XK` ออกมาพร้อม `seasonalQrCode` แยกชื่อกันชัด — `plot-qrs-both-identities.json` |
| T10 | `POST /harvest-batches/:id/lab-results` | **201** ไฟล์ PDF จริงถูกเก็บ `verificationStatus: FARMER_UPLOADED` — `coa-upload-201.json` |
| T10b | `POST /lots` พร้อม `thcContent`+`testStatus` | **400 `LAB_VALUES_NOT_TYPED`** ข้อความไทยระบุช่องที่ถูกปฏิเสธและชี้ประตูที่ใช้ได้ — `lot-typed-value-refused.json` |
| T10b | `POST /lots` สะอาด | **201** และแถวเกิดโดย `thcContent: null` `testStatus: null` — ไม่มีคำกล่าวอ้างของตัวเอง |
| T12 | `GET /api/trace/<qr>` ไม่ล็อกอิน | ก่อนแก้: `address: null` · หลังแก้: `'99/1 หมู่ 5'`, `'แม่แฝก'`, `'50210'` · **ไม่มี** พิกัด ไม่มี id ภายใน — `public-scan-before-fix.json` เทียบ `public-scan-after-fix.json` |
| T13 | เดียวกัน | `labTest.lot.tested: true` พร้อม `fileUrl` ของ COA และ `FARMER_UPLOADED` — ล็อตสืบทอดจากรุ่นจริง |
| T5 | `GET /provider/planting-cycles` (auditor) | เกิดแถว `FARM_DATA_VIEWED` / `DATA_ACCESS` / `FARM` พร้อม actor, farmId, คำค้น · **ไม่มีชื่อฟาร์มใน log** |

## ข้อควรรู้ตอน deploy (จากข้อ 1)

migration `20260905120000` เพิ่มโมเดลใหม่ ⇒ **environment ใดที่ deploy ต้อง generate Prisma
client ใหม่ด้วย** ไม่ใช่แค่ `migrate deploy` · ถ้าลืม ประตูแนบ COA จะ 500 ทั้งที่ตารางมีอยู่จริง
