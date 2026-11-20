# ปิดปุ่มชำระเงินออนไลน์ (ทางเลือก ก.) — staging + demo · 2026-09-10

operator สั่ง 2026-09-10: "merge แล้วเลือก ก." — ทางเลือก ก. คือ
**ซ่อนปุ่มชำระเงินออนไลน์จนกว่าเส้นทาง Stripe จะจ่ายจบได้จริง**

เหตุผล: `apps/web-app` ไม่มี dependency ของ Stripe เลย และ `clientSecret` ที่ backend
คืนมาไม่มี component ไหนใช้ · กดปุ่มแล้วระบบ mint invoice `pending` ทันที ซึ่งเป็นหนี้
ที่ทำให้ปุ่มขึ้นซ้ำ · ไม่มีใครทำให้ปุ่มหายได้เพราะไม่มีใครจ่ายจนจบได้
(รายละเอียด: `reports/payment-ux-2026-09-10/FINDINGS.md`)

## ข้อเท็จจริงที่ต้องรู้ก่อนแก้ซ้ำ

`NEXT_PUBLIC_CHECKOUT_UI_ENABLED` เป็น **build-time ไม่ใช่ runtime** ·
Next ฝังค่าลงบันเดิลตอน build จน `isCheckoutUiEnabled()` (`src/lib/config/checkout-mode.ts:42`)
ถูก minifier fold เป็นค่าคงที่ · **แก้ env ของ container แล้วไม่มีผล ต้อง rebuild อิมเมจ**
`apps/web-app/Dockerfile:70` ตั้ง default ไว้เป็น `true` การปิดจึงต้องส่ง
`--build-arg NEXT_PUBLIC_CHECKOUT_UI_ENABLED=false` ทุกครั้งที่ build
— **build โดยลืม arg นี้ = ปุ่มกลับมาเงียบ ๆ**

## สัญญาณที่ใช้ตัดสิน (สองสถานะ)

| | ค่าที่ fold แล้ว | ความหมาย |
|---|---|---|
| เปิด | `function s(){return!0}` | ปุ่มชำระเงินออนไลน์แสดง |
| ปิด | `function s(){return!1}` | ปุ่มไม่แสดง ขึ้นข้อความแจ้งแทน |

ตัวตรวจ: `verify-flag-off.sh <image>` — exit 0 = ปิดแล้ว · exit 1 = ยังเปิดอยู่
ทดสอบกับอิมเมจเก่า `local-3f5cab202b72` ได้ exit 1 (สถานะแดง) ก่อนใช้ตัดสินของใหม่

## ผลรันจริง 2026-09-10

อิมเมจ build จาก `ac3f3a2178dda374f8a7276b3b1cd059566c7015` (main หลัง merge) BUILT_AT `2026-09-10T03:23:20Z`

```
อิมเมจเก่า ghcr.io/jonmaxmore/gacp-frontend:local-3f5cab202b72
  isCheckoutUiEnabled ถูก fold เป็น: !0 (= true)   → ยังเปิดอยู่   exit=1

อิมเมจใหม่ ghcr.io/jonmaxmore/gacp-frontend:local-ac3f3a2178dd   (staging)
  isCheckoutUiEnabled ถูก fold เป็น: !1 (= false)  → ปิดแล้ว      exit=0

อิมเมจใหม่ ghcr.io/jonmaxmore/gacp-frontend:demo-ac3f3a2178dd    (demo)
  isCheckoutUiEnabled ถูก fold เป็น: !1 (= false)  → ปิดแล้ว      exit=0
```

ตรวจซ้ำจาก **ไฟล์ที่เว็บเสิร์ฟจริง** ไม่ใช่จากอิมเมจอย่างเดียว:

```
GET https://staging.gacpth.com/_next/static/chunks/app/health/applications/new/step/[id]/page-6b9214f07f3b66a2.js
  HTTP 200 · 112,916 ไบต์ · function s(){return!1}   → ปุ่มปิด

GET https://demo.gacpth.com/_next/.../page-6b9214f07f3b66a2.js
  HTTP 200 · 112,916 ไบต์ · function s(){return!1}   → ปุ่มปิด

GET https://staging.gacpth.com/_next/static/chunks/app/health/payments/page-18cd9dfa1ecc2365.js
  HTTP 200 · 49,632 ไบต์
  พบ "ระบบยังไม่เปิดช่องทางชำระเงินในสภาพแวดล้อมนี้"  → ข้อความแทนปุ่มมาแล้ว
  พบ "ถึงกำหนดชำระตอนนี้"                            → งานป้ายงวดที่เพิ่ง merge ติดมาด้วย
```

container หลังสลับ: ทั้งคู่ `GIT_SHA=ac3f3a2178dda374f8a7276b3b1cd059566c7015`, status healthy

## กับดักตอน deploy ที่เจอจริงรอบนี้

- `/opt/gacp-platform/.env.staging` เขียน `STAGING_IMAGE_TAG=main-latest` ซึ่งเป็นอิมเมจ
  **23 ก.ค.** — ถ้าไม่ส่ง tag ทางบรรทัดคำสั่ง จะถอยกลับอิมเมจเก่าเงียบ ๆ
- `docker compose` เตือน orphan containers ทุกครั้งเพราะ staging กับ demo ใช้ project
  `gacp-platform` ร่วมกัน · **ห้ามใส่ `--remove-orphans`** มันจะลบอีกฝั่งทิ้ง
- แตะเฉพาะ `frontend-*` ด้วย `--no-deps` · backend ไม่ต้อง rebuild เพราะ commit ที่ merge
  ไม่แตะ `apps/backend` เลย

## สิ่งที่ยังไม่ได้แก้

1. เข้า `/health/payments/checkout` ตรงทาง URL ยังทำได้ และยัง mint invoice ได้อยู่ —
   การซ่อนปุ่มกันแค่ทางเดินปกติ
2. ข้อความแทนปุ่มบอกว่า "ติดต่อเจ้าหน้าที่เพื่อชำระค่าธรรมเนียม" แต่ไม่มีประตูให้เจ้าหน้าที่
   รับเงินหรือบันทึกว่ารับแล้ว · `POST /api/invoices/:invoiceId/receipt`
   (`routes/api/finance/invoice-payment-handlers.js:33`) ออกใบเสร็จให้ใบที่จ่ายแล้วเท่านั้น
3. ปุ่มจะเปิดกลับเมื่อไหร่/อย่างไร เป็นส่วนหนึ่งของแผนย้ายไป Stripe Checkout Sessions
