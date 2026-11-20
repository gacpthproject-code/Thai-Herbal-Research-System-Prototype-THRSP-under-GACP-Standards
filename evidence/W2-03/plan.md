# W2-03 (Q1) — PLAN — Frontend Checkout UI (mock adapter)
> เขียนโดย orchestrator ตาม §3.2 หลัง operator ตัดสิน A1-A7 (ดู orchestration-log 2026-08-02)
> Spec ฐาน: `evidence/W2-03/spec-reader-report.md` (C1-C30, I1-I7) + คำตัดสิน operator

## Scope amendment ทางการ (ground truth สำหรับ auditor)
- ข้อ "แสดงข้อความไทย 409 จาก backend" **แก้เป็น**: "แสดงข้อความไทยจาก **FE error-code map**
  โดย key จาก error code ที่ backend ส่ง" (Policy 5, `error-code-map.ts` pattern — C24)
- Success state = **"สร้างรายการสำเร็จ รอชำระเงิน"** เท่านั้น — ห้ามมีคำ/ภาพสื่อว่าชำระแล้วในโหมด mock (A5)
- Mock seam = `NEXT_PUBLIC_CHECKOUT_API_MODE=live|mock` ตาม pattern `map-tiles.ts` (A3 — คำอ้าง
  "MOPH OAuth mock" ใน mission text ถือว่าแทนด้วย pattern นี้)
- Route `/health/payments/checkout?app=<uuid>&milestone=M1|M2` + ปุ่มเข้า additive 1 จุดหลัง feature flag (A4)
- FE ไม่ตัดสิน milestone/applicationId — ส่ง param ให้ backend ตัดสิน แสดงผลจาก response เท่านั้น (A6+A7)

## ไฟล์ที่จะสร้าง (ทั้งหมดใหม่ — additive)
| ไฟล์ | หน้าที่ |
|---|---|
| `apps/web-app/src/lib/config/checkout-mode.ts` | env-switch: `NEXT_PUBLIC_CHECKOUT_API_MODE` → `'live'|'mock'` default `live`, trim, ค่าอื่น = live (fail-safe ไปทางของจริง) — pattern `map-tiles.ts` (I5) |
| `apps/web-app/src/lib/services/__fixtures__/checkout-fixtures.ts` | fixtures 4 ชุดตาม wire shape จริง: happy (C10/C11 — รวม 1 ชุดที่ตัวเลข**จงใจไม่ sum** ไว้พิสูจน์ no-client-math), 409 `CHECKOUT_ALREADY_IN_PROGRESS`, 5xx `CHECKOUT_FAILED`, timeout (shape ตาม C21) |
| `apps/web-app/src/lib/services/checkout-service.ts` | `createCheckout({applicationId, milestone})`: live → `api.post('/payments/checkout', ...)` (I2); mock → fixture ตาม `mockScenario` (`happy`(default)/`conflict`/`server-error`/`timeout` — รับค่าเฉพาะเมื่อ mode=mock) |
| `apps/web-app/src/app/health/payments/checkout/page.tsx` + `loading.tsx` | route ใหม่ (A4), loading ใช้ `PageSkeleton` (C25) |
| `apps/web-app/src/app/health/payments/checkout/client-view.tsx` | flow: อ่าน `app`/`milestone`/`mockScenario` จาก query → ปุ่มเริ่ม checkout → loading → success/error; breakdown 4 แถวจาก backend fields ตรง ๆ (I1: dtamFeeAmount/platformFeeNet/platformFeeVat/totalPayableAmount), `formatCurrency` th-TH (C27); error map per-component (C24) |
| `apps/web-app/src/app/health/payments/checkout/__tests__/*` | unit + component tests (รายการล่าง) |
| `apps/web-app/playwright/checkout.spec.ts` (ตำแหน่งตาม harness เดิม) | visual evidence: เปิดจริง กดจริง screenshot ครบ 4 state |
| entry: ลิงก์ 1 จุดใน `/health/payments` | additive หลัง flag `NEXT_PUBLIC_CHECKOUT_UI_ENABLED` (default ปิด = หน้าเดิมไม่เปลี่ยนแม้ pixel เดียว) — จุดแตะไฟล์เดิม**จุดเดียว**ที่อนุญาต ห้ามเปลี่ยน slip flow |

- `.env.example` ฝั่ง web-app (ถ้ามีไฟล์อยู่แล้ว): เพิ่มชื่อ env 2 ตัว (names only)
- Error map ในหน้า checkout ครอบ: `CHECKOUT_ALREADY_IN_PROGRESS` (ไทย — ถ้อยคำเดียวกับ backend source :152), `CHECKOUT_MILESTONE_NOT_PAYABLE`, `APPLICATION_NOT_FOUND`, `CHECKOUT_INVALID_MILESTONE`, `STRIPE_CHECKOUT_DISABLED`, timeout, fallback — ทุกข้อความตาม `thai-ui-copy` (บอกสาเหตุ+ทางไป, "คุณ")

## Test list + RED ที่คาด
| Test | คาด RED เพราะ |
|---|---|
| `checkout-mode.test.ts` — default live / mock เฉพาะ 'mock' / trim | module ยังไม่มี (import fail = แดงจริง) |
| `checkout-service.test.ts` — live: เรียก `api.post('/payments/checkout', {applicationId, milestone})`; mock: คืน fixture ตาม scenario; ไม่แตะ endpoint อื่น | module ยังไม่มี |
| `checkout-states.test.tsx` — loading แสดง skeleton/spinner; success แสดงตัวเลข**ตรงตาม response ทุกหลัก** (รวม fixture ที่จงใจไม่ sum → ต้อง render ตามนั้น = พิสูจน์ไม่มี client math); success copy = "สร้างรายการสำเร็จ รอชำระเงิน" และ**ไม่มี**คำว่า "ชำระเงินสำเร็จ/จ่ายแล้ว/ชำระแล้ว"; 409 → ข้อความไทยจาก map; 5xx/503 → error ไทย; timeout → ข้อความไทย | หน้า/component ยังไม่มี |
| Playwright `checkout.spec.ts` — mode=mock: happy กดปุ่มจริงเห็น breakdown, conflict เห็นไทย 409, server-error, timeout — screenshot ทุก state ลง `evidence/W2-03/screenshots/` | หน้ายังไม่มี |

**เขียวแต่กำเนิด**: ไม่คาดว่ามี — ทุก test ชี้ behavior ใหม่ทั้งหมด (module/page ยังไม่ existed) ถ้า implementer พบ test ใดเขียวแต่กำเนิดต้องประกาศเป็น pin ตาม Law 3.11

## Out-of-scope (ห้ามแตะ — เจอปัญหา → BACKLOG-FOUND.md)
- backend ทุกไฟล์ | `@stripe/*` / Stripe JS | Wave 3 | error-codes catalog
- `src/lib/api/api-client.ts` (ไฟล์กลาง) | หน้า/component slip เดิมทั้งหมด (C19) ยกเว้นลิงก์ additive 1 จุดที่ระบุ
- `src/constants/fees.ts` — ห้าม import ในหน้า checkout (C28/C1)

## ลำดับ dispatch
1. **D1 implementer**: lib layer — checkout-mode + fixtures + checkout-service + unit tests (RED→GREEN)
2. **D2 implementer**: UI layer — route + client-view + states + error map + entry link + component tests (RED→GREEN)
3. **D3 implementer**: Playwright visual evidence — เปิดจริง กดจริง screenshots + trace
4. **auditor** (fresh): spec + diff + evidence → PASS/FAIL
5. Gates §4 → REPORT

## Acceptance (machine-checkable)
1. Unit + component tests ใหม่ทั้งหมดเขียว หลังมี red-output จริงต่อไฟล์
2. Full FE suite (`apps/web-app` jest) ผ่าน ≥ baseline — ไม่มี fail ใหม่
3. Playwright screenshots ครบ 4 state ใน evidence pack
4. Ratchet delta 0 จาก `evidence/FLOW-baseline.txt`
5. grep pin: ไม่มี arithmetic บน breakdown fields ใน client-view (ไม่มี `+`/`*` กับ amount fields), ไม่มี import `constants/fees` ในหน้า checkout
