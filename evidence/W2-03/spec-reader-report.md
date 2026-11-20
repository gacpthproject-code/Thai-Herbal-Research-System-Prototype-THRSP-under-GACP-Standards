# SPEC — Q1 W2-03 Frontend Checkout UI (mock adapter)
> ผลจาก spec-reader dispatch 2026-08-02 (fresh context, read-only) — persist โดย orchestrator ตามที่ส่งกลับ ไม่แก้ไขเนื้อหา

## CONFIRMED

### A. Scope ทางการ (PROMPT-W2-AUTONOMOUS-FLOW.md)
- C1. Scope: หน้า checkout เริ่ม → แสดง state + platform + vat = total จาก backend response เท่านั้น ห้ามคำนวณเงินฝั่ง client — `PROMPT-W2-AUTONOMOUS-FLOW.md:20`
- C2. ต้อง handle `409 CHECKOUT_ALREADY_IN_PROGRESS` → "แสดงข้อความไทยจาก backend ไม่ใช่ generic error" — `PROMPT-W2-AUTONOMOUS-FLOW.md:21` (ดู AMBIGUOUS A1/A2 — ข้อนี้ขัดกับพฤติกรรม backend/api-client จริง)
- C3. ต้องมี loading / error / success / timeout states ครบ — `PROMPT-W2-AUTONOMOUS-FLOW.md:22`
- C4. Mock adapter seam สลับด้วย env var "pattern เดียวกับ MOPH OAuth mock", fixtures ครอบ happy + 409 + 5xx + timeout — `PROMPT-W2-AUTONOMOUS-FLOW.md:23` (ดู AMBIGUOUS A3 — pattern ที่อ้างถึงหาไม่เจอใน repo)
- C5. Out of scope: backend ทุกไฟล์, Real Stripe, Wave 3, error-codes catalog — `PROMPT-W2-AUTONOMOUS-FLOW.md:25-27`; PR ใบใหม่ base จาก branch #721 — `PROMPT-W2-AUTONOMOUS-FLOW.md:29`

### B. Backend contract
- C6. **Endpoint**: `POST /api/payments/checkout` — handler `apps/backend/routes/api/finance/payments.js:409`; router mount `apps/backend/routes/api/index.js:152` (`router.use('/payments', ...)`) ใต้ `/api` ที่ `apps/backend/server.js:326` (alias `/api/v1` ที่ :327)
- C7. **Auth**: middleware `authenticateHealth` (HEALTH portal token เท่านั้น ไม่รับ provider token) — `payments.js:409`, import :11; healthId resolve ไม่ได้ → `401 {success:false, error:'AUTH_ERROR'}` — `payments.js:421-423`
- C8. **Feature flag**: `STRIPE_CHECKOUT_ENABLED !== 'true'` → `503 {success:false, error:'STRIPE_CHECKOUT_DISABLED', message:'Stripe checkout is not enabled in this environment'}` — `payments.js:410-417`, flag ที่ `apps/backend/config/stripe.js:34-36`
- C9. **Request body**: `{ applicationId, milestone }`; applicationId ต้องเป็น UUID ไม่งั้น `400 {error:'APPLICATION_ID_REQUIRED'}` — `payments.js:424-427`; milestone default `'M1'` ผ่าน `String(milestone || 'M1').toUpperCase()` — `payments.js:431`
- C10. **Success 200**: `{ success:true, data:{ checkoutOrderId, paymentIntentId, clientSecret, milestone, breakdown } }` — `payments.js:441` + return shape `apps/backend/services/checkout/stripe-checkout-service.js:262-268`
- C11. **breakdown fields** (บาท, integer): `dtamFeeAmount`, `platformFeeNet`, `platformFeeVat`, `platformFeeGross`, `totalPayableAmount` — `stripe-checkout-service.js:63-82` (สร้างใหม่) และ :126-132 (re-entry จาก order เดิม) สมการ: `dtamFeeAmount + platformFeeNet + platformFeeVat = totalPayableAmount` (drift → 500 `CHECKOUT_BREAKDOWN_DRIFT` — :75-80)
- C12. **Error catch-all ของ route**: `status = error.statusCode || error.status || 500`, `error = error.code || 'CHECKOUT_FAILED'`, `message = safeErrorMessage(error)` — `payments.js:442-453`
- C13. **Error cases จาก service** (ผ่าน C12):
  - `400 CHECKOUT_INVALID_MILESTONE` — `stripe-checkout-service.js:90-92`
  - `404 APPLICATION_NOT_FOUND` (รวม non-owner — ownership อยู่ใน lookup) — :94-105
  - `409 CHECKOUT_MILESTONE_NOT_PAYABLE` (status ไม่อยู่ใน PAYABLE_STATES) — :106-109
  - `409 CHECKOUT_ALREADY_IN_PROGRESS` (P2002 race) ข้อความไทยใน code: `'มีรายการชำระเงินของงวดนี้กำลังดำเนินการอยู่แล้ว กรุณาเปิดหน้าชำระเงินเดิมหรือลองใหม่อีกครั้ง'` — :150-153
  - `500 CHECKOUT_BREAKDOWN_DRIFT` — :75-80
  - adapter ไม่พร้อม: `STRIPE_NOT_CONFIGURED` (`config/stripe.js:43-52`) / `PAYMENT_ADAPTER_INVALID` (`services/payment/payment-adapter.js:62-65`) — ไม่มี statusCode → 500
- C14. **ข้อความไทย 409 ถูก sanitizer กลืนก่อนถึง client**: `safeErrorMessage` allowlist เป็นวลีอังกฤษล้วน (`'not found','unauthorized',...,'phase'`) — `apps/backend/shared/api-response.js:132-136`; ข้อความไทยไม่ match วลีใด → คืน fallback `'An error occurred while processing your request'` — :165-178. ดังนั้น wire response 409 จริงคือ `{success:false, error:'CHECKOUT_ALREADY_IN_PROGRESS', message:'An error occurred...'}` — ข้อความไทย**ไม่เคยออกจาก backend** (ขัด C2 โดยตรง)
- C15. **PAYABLE_STATES**: M1 = DRAFT/SUBMITTED/PENDING_DOC_FEE; M2 = DOC_APPROVED/PENDING_AUDIT_FEE — `stripe-checkout-service.js:38-41`
- C16. **MILESTONES vocab**: `['M1','M2']` — `apps/backend/shared/checkout-status.js:29`; statuses `PENDING_PAYMENT/SETTLED/EXPIRED/CANCELLED` — :21-26; SETTLED ได้ทาง verified webhook เท่านั้น — :8-11, :34-38
- C17. **Backend mock seam** (ของ backend ไม่ใช่ FE): `PAYMENT_ADAPTER=mock|stripe` default stripe fail-closed — `config/stripe.js:66-69`, `services/payment/payment-adapter.js:52-66`, mock ที่ `services/payment/mock-payment-adapter.js`

### C. Frontend ปัจจุบัน
- C18. **App Router** ที่ `apps/web-app/src/app/`; health portal ใต้ `src/app/health/*`
- C19. **ของเดิมที่ Q1 ต้องไม่ทำพัง** (additive): หน้า slip/payment `src/app/health/payments/{page.tsx, client-view.tsx, slip-upload-modal.tsx, loading.tsx}`; components `src/components/payments/{TwoCardPaymentSection, PaymentInvoiceCard, QuotationReviewSection, RefundVisibilitySection, SlipHistorySection}.tsx`; service `src/lib/services/payment-service.ts`; renewal flow `src/app/health/applications/renewal/*`
- C20. **API client**: singleton `api`/`apiClient` — `src/lib/api/api-client.ts:577-581`; auto-prefix `/api` — :271-277; Bearer จาก `AuthService.getToken()` + httpOnly cookie (`credentials:'include'`) — :244-252, :297; CSRF header ทุก mutation — :237-242; `x-active-entity-id` — :259-268; Next proxy `/api/[...path]` แนบ cookie token เป็น Bearer ไป backend — `src/app/api/[...path]/route.ts:12-48`
- C21. **Timeout convention**: default 30000ms, AbortError → `{success:false, error:'Request timeout. Please try again'}` (อังกฤษ ไม่มี status/code) — `api-client.ts:104, 460-466`
- C22. **401 บน endpoint ปกติ** → clear session + redirect login เว้นแต่ส่ง `suppressAuthRedirect:true` — `api-client.ts:302-374, 88-98`
- C23. **api-client ทิ้ง field `message` ของ backend**: error envelope คืน `error` (จาก `data.error || data.message` ผ่าน `toUserFriendlyError`), `status`, `code`, `meta` — `api-client.ts:417-430`; `message` เป็น reserved key ถูก strip ออกจาก meta — :75-85 ⇒ กรณี 409 นี้ `data.error='CHECKOUT_ALREADY_IN_PROGRESS'` (machine code) จะกลายเป็น `.error` ตรง ๆ และ `.message` หายไป
- C24. **Error-code → Thai convention**: per-component map + `resolveErrorCode` — `src/lib/i18n/error-code-map.ts:52-61` (Policy 5, `docs/i18n-policy.md`)
- C25. **Loading/error state convention**: route-level `loading.tsx` + `PageSkeleton` (`src/components/ui/page-skeleton.tsx`, ใช้ใน `health/payments/loading.tsx`); state ท้องถิ่น `loading/error` + inline error banner — `health/payments/client-view.tsx:85-96` + pin ไว้ใน `health/payments/__tests__/payments-states.test.tsx:5-10`; toast = `sonner` (`package.json:52`) ผ่าน `Toaster` mount ที่ `src/app/layout.tsx:157`; primitives (Button/Dialog/ฯลฯ) ที่ `src/components/ui/primitives/`
- C26. **Design tokens + Thai copy**: skills มีจริง — `.claude/skills/gacp-design-tokens/SKILL.md` (leaf tokens, `tailwind.config.cjs:79-85`; ห้าม emerald/zinc/slate ใหม่, ปุ่มข้อความใช้ `bg-leaf-700`) และ `.claude/skills/thai-ui-copy/SKILL.md` (คุณ ไม่ใช่ท่าน, ห้าม em dash, วันที่ผ่าน `src/lib/format/thai-date.ts`, error ต้องบอกสาเหตุ+ทางไป)
- C27. **Currency format precedent**: `formatCurrency` ด้วย `Intl.NumberFormat('th-TH',{currency:'THB'})` — `health/payments/client-view.tsx:32-43`
- C28. **FE fee constants มีอยู่แต่เป็น fallback** — `src/constants/fees.ts:1-49` (`GACP_PHASE1_TOTAL` ฯลฯ); ตาม C1 ห้ามใช้แสดงยอด checkout; มี guard test `src/app/(marketing)/__tests__/no-fabricated-fees.test.ts`
- C29. **ไม่มี Stripe JS ใน web-app**: ไม่มี `@stripe/*` ใน `apps/web-app/package.json:18-55` และไม่มีการใช้ `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` ที่ใดใน web-app (grep ทั้ง app); backend ระบุว่า pk เป็น "FRONTEND variable" ที่ยังไม่มีผู้ใช้ — `config/stripe.js:9-11`
- C30. **Entry points ปัจจุบันสู่การจ่ายเงิน**: sidebar `src/lib/constants.ts:76` (`/health/payments`); application detail CTA สร้าง href `/health/payments?app=..&phase=..` — `src/app/health/applications/[id]/application-detail-page-helpers.ts:127,130` และ `[id]/client-view.tsx:260`; preview page — `health/applications/preview/client-view.tsx:138,419`

## INFERRED

- I1. **Mapping breakdown → label ใน scope** (มั่นใจสูง): state = `dtamFeeAmount`, platform = `platformFeeNet`, vat = `platformFeeVat`, total = `totalPayableAmount`; `platformFeeGross` = net+vat เป็น field เสริม — จาก comment โครงสร้าง M1/M2 "DTAM audit fee + platform fee + 7% VAT" `stripe-checkout-service.js:9-13` และสมการ :52-61, :73-75 รวมถึง invoice line items DTAM_FEE/PLATFORM_FEE/PLATFORM_VAT — :173-208
- I2. **วิธีเรียกจาก FE** (มั่นใจสูง): เพิ่ม method ใน service ชั้น `src/lib/services/` ที่เรียก `api.post('/payments/checkout', {applicationId, milestone})` — ตาม pattern ทุก method ใน `payment-service.ts:345-475` (auto-prefix `/api` ทำให้ URL เต็มคือ `/api/payments/checkout` ผ่าน Next proxy)
- I3. **การ branch 409/503 ฝั่ง FE** (มั่นใจสูง): ใช้ `res.code` / `res.status` จาก envelope (`api-client.ts:46-64, 422-429`) + per-component error map ตาม `error-code-map.ts` pattern (`slip-review-modal` เป็นต้นแบบ — comment `error-code-map.ts:5-11`)
- I4. **Env var ฝั่ง FE ต้องเป็น `NEXT_PUBLIC_*` และ inline ตอน build** (มั่นใจสูง): precedent ทั้งหมดใน FE เป็น NEXT_PUBLIC (`src/lib/config/map-tiles.ts:48,57,86`; `pwa-service-worker-guard.tsx:5`; Dockerfile:39-42 ระบุ build-args) — mock seam ฝั่ง FE จึงเป็น build-time switch ไม่ใช่ runtime
- I5. **Pattern module env-config ที่ควรเลียน** (มั่นใจกลาง): `src/lib/config/map-tiles.ts` — อ่าน env ใน function, trim, fallback ชัดเจน, มี unit test ครอบ (`__tests__/map-tiles.test.ts`) — เป็น env-switch pattern เดียวที่มีใน FE lib
- I6. **Timeout state ต้องแปลงเป็นไทยใน component** (มั่นใจกลาง): api-client คืน string อังกฤษ (C21) และ convention Thai-copy บังคับ error ไทยบอกสาเหตุ+ทางไป — component เดิมทำ mapping เองผ่าน fallback ของ `resolveErrorCode`
- I7. **Rate limiter ไม่ครอบ `/checkout`** (มั่นใจสูง อ่านจากโค้ดตรง): `paymentLimiter` ครอบเฉพาะ create/phase1/phase2/slip-upload — `apps/backend/server.js:286-289` — เป็น backend finding สำหรับ `BACKLOG-FOUND.md` (out of scope Q1)

## AMBIGUOUS

- **A1. [เงิน] ข้อกำหนด "แสดงข้อความไทยจาก backend" ทำไม่ได้ตามที่เขียน — backend ไม่เคยส่งข้อความไทยออกมา**: C2 สั่งให้แสดงข้อความไทย "จาก backend" แต่ C14 พิสูจน์ว่า `safeErrorMessage` (allowlist อังกฤษล้วน `api-response.js:132-136`) แทนที่ข้อความไทยของ 409 ด้วย generic อังกฤษก่อนออกจาก backend ทุกครั้ง ทางเลือก: (ก) แก้ backend (allowlist/bypass) — **ต้องห้ามตาม out-of-scope** `PROMPT-W2:26`; (ข) FE map `CHECKOUT_ALREADY_IN_PROGRESS` → ข้อความไทยชุดเดียวกันใน per-component map (pattern C24 ที่มีอยู่) — แต่เท่ากับ copy ไทยอยู่ฝั่ง FE ไม่ใช่ "จาก backend" และ duplicate ข้อความกับ `stripe-checkout-service.js:152` (แรงเสียดทานกับ Law 3.6 SSOT); (ค) STOP รอ operator ตัดสิน ผลต่าง: (ข) ทำงานได้จริงแต่ตีความ requirement ใหม่, (ก) ผิดกติกา scope
- **A2. [เงิน] แม้ backend ส่งข้อความไทยมาได้ api-client ก็ทิ้ง field `message`**: C23 — `.error` จะเป็น machine code, `message` ถูก strip (`api-client.ts:75, 417-430`) ทางเลือก: แก้ shared `api-client.ts` (ไฟล์กลาง กระทบทั้ง app — เกิน "additive" หรือไม่ไม่มีนิยาม), หรือยอมรับ (ข) ใน A1 ซึ่งไม่ต้องพึ่ง `message` เลย
- **A3. "pattern เดียวกับ MOPH OAuth mock" หาไม่เจอใน repo**: grep `MOPH/MoPH/oauth/mock` ทั้ง `apps/web-app` — ไม่มี env-switched OAuth mock (เจอแค่ branding strings และ Playwright test fixtures `playwright/fixtures/mock-assets.ts` ซึ่งเป็น test-time ไม่ใช่ runtime seam) ตัวที่ใกล้ที่สุด: backend `PAYMENT_ADAPTER=mock|stripe` (C17) และ FE env-config `map-tiles.ts` (I5) ⇒ ชื่อ env var, ตำแหน่งไฟล์ seam, และ semantics ("mock อะไร — mock การเรียก POST /checkout ทั้งก้อน หรือ mock เฉพาะขั้น confirm payment?") ไม่มีที่ใดระบุ — ต้องให้ orchestrator/คน pin ก่อน implement
- **A4. จุด mount หน้าใหม่ + ปุ่มเข้า checkout ไม่ถูกระบุ**: ไม่มี doc ระบุ route (`/health/checkout`? `/health/payments/checkout`?) และไม่ระบุว่าปุ่มอยู่หน้าไหน; entry ปัจจุบันทั้งหมดชี้ `/health/payments?...` (C30) การเพิ่มปุ่มย่อมต้องแตะไฟล์เดิมอย่างน้อยหนึ่งไฟล์ — ขัด/ตึงกับ "additive ห้ามแตะของเดิม" ต้องตีความว่า "แตะเพิ่มปุ่มได้แต่ห้ามเปลี่ยน slip flow" หรือไม่
- **A5. [เงิน] นิยาม "success state" ในโหมด mock adapter**: backend คืน `clientSecret` (C10) แต่ FE ไม่มี Stripe JS (C29), Real Stripe อยู่นอก scope (C5), และ order จะ SETTLED ได้ทาง webhook เท่านั้น (C16) ⇒ หน้า UI จะถือว่าอะไรคือ "success" — แค่ "intent created แสดง breakdown สำเร็จ" หรือจำลองจ่ายจบ? ผลต่างมีนัยต่อสิ่งที่ผู้ใช้เข้าใจว่า "จ่ายแล้ว"
- **A6. การเลือก milestone ฝั่ง UI**: ให้ผู้ใช้เลือก M1/M2, derive จาก application.status ตาม PAYABLE_STATES (C15), หรือ hardcode M1 (backend default — `payments.js:431`)? ไม่มีระบุ; derive ฝั่ง client = logic ธุรกิจซ้ำกับ backend (แรงเสียดทาน SSOT)
- **A7. ที่มาของ `applicationId` ที่หน้า checkout จะใช้**: query param (`?app=` ตาม precedent C30) หรือ path segment — ไม่ระบุ

---

**Material-ambiguity summary**: A1, A2, A5 แตะ **เงิน** โดยตรง (ข้อความ/สถานะบนหน้าจ่ายเงินที่ผู้ใช้ตัดสินใจโอนเงินจากมัน) — โดยเฉพาะ A1 เป็น **ข้อขัดแย้งระหว่าง scope ทางการกับพฤติกรรมโค้ดจริงที่พิสูจน์ได้** (`PROMPT-W2:21` vs `api-response.js:165-178`) และทางแก้ตรง ๆ อยู่ใน out-of-scope; A3, A4, A6 เป็นการตัดสินใจเชิงออกแบบที่ spec ไม่ระบุ (A3 กระทบโครงสร้าง mock seam ทั้งชิ้น) ไม่มีข้อไหนแตะ identity/สิทธิ์โดยตรง (auth ใช้ pattern เดิมครบ C7/C20/C22) ตามกติกา §2/§5 ของ mission: A1+A2 เข้าเงื่อนไข STOP-ปรึกษาคนก่อน dispatch implementer
