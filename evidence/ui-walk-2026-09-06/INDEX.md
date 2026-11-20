# กดจริงผ่านเบราว์เซอร์ — หน้าสแกนสาธารณะของผู้ซื้อ (2026-09-06)

Chromium จริง (Playwright), viewport 390×844 (โทรศัพท์ — เพราะคนสแกนถุงถือโทรศัพท์),
locale th-TH · สแตกจริงในเครื่อง: backend :8099 · Next dev :3099 · Postgres ใช้แล้วทิ้ง :55450

หน้าล็อต — สคริปต์: `press-script.mjs` · ผล: `press-after.json` · ข้อความทั้งหน้า:
`page-text-after.txt` · ภาพ: `public-scan-mobile.png`

หน้ารุ่นเก็บเกี่ยว — สคริปต์: `press-batch-script.mjs` · ภาพ: `public-scan-batch-mobile.png`
ผลที่วัดได้: `showsFarmName/showsAddress/showsLab = true` · `leaksLatitude/leaksOwnerName = false`
· 849 ตัวอักษร · การ์ด COA พูดว่า "ผลวิเคราะห์ของรุ่น" ไม่ใช่ของล็อต — คำกล่าวอ้างคนละอัน

## สิ่งที่การกดครั้งแรกเปิดโปง

| | กดครั้งแรก | หลังแก้ |
|---|---|---|
| `showsFarmName` | true | true |
| `showsAddress` | **false** | **true** |
| `showsLab` | **false** | **true** |
| `leaksLatitude` | false | false |
| `leaksOwnerName` | false | false |
| ความยาวข้อความ | 538 | 717 |

ที่อยู่และ COA อยู่ใน payload ของประตู `/api/trace/:qr` มาตั้งแต่ T12/T13 แล้ว — แต่หน้าที่
ผู้ซื้อเปิดจริงเรียก **คนละประตู**: `GET /api/trace/lot/:id` ซึ่งเขียน projection ของตัวเอง
และยังตอบเหมือนก่อนมติ · **"เมื่อสแกนต้องเห็น" ไม่ได้แปลว่า "อยู่ใน JSON"** และไม่ได้แปลว่า
"อยู่ใน JSON ของประตูใดประตูหนึ่ง"

## สิ่งที่ตัดออกจากหน้า

`แปลงและพื้นที่: -` และ `รอบปลูก: -` — เซิร์ฟเวอร์เลิกส่ง `source` ตามมติ 2026-09-05
(ชื่อแปลงพาชื่อคนมาได้) แต่หน้าจอยังเรนเดอร์สองแถวที่ตอบได้แค่ขีดตลอดกาล · ขีดบอกผู้ซื้อว่า
แพลตฟอร์มถืออยู่แต่ไม่บอก ทั้งที่ความจริงคือไม่ได้เก็บไว้บนหน้าสาธารณะเลย

## สัญญาที่เครื่องถือไว้แทนย่อหน้านี้

- `apps/backend/__tests__/integration/both-public-scan-paths-agree.test.js` — กด handler จริง
  ของทั้งสองประตูบนแถวจริง · mutation: route ไม่ตีพิมพ์ → แดง · select ไม่ขอ labResults → แดง
- `apps/backend/__tests__/unit/public-farm-projection.test.js` — คิวรีต้องขอทุกคอลัมน์ที่ตีพิมพ์
  และห้ามขอเกิน · mutation ทั้งสองทาง → แดง
- `apps/web-app/src/app/trace/__tests__/public-scan-page-declares-only-what-it-gets.test.ts`
  — หน้าจอห้ามประกาศรับของที่เซิร์ฟเวอร์เลิกส่ง
