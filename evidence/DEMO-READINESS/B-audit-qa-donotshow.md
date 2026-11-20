# DEMO-READINESS ครึ่ง B (ข้อ 2, 3, 6, 7) — 2026-08-04

Repo: `/home/user/GACP-Certification-Application` · branch `docs/payment-scheduler-reality-check` · HEAD `d7977c1f`
โหมด: อ่านอย่างเดียว · ไม่แก้ไฟล์ใดในรีโป · ไม่ยิง HTTP ไป staging/production · ไม่รัน playwright
สเปก: `QUEUE.md:147-239`

---

# ข้อ 2 — DEMO-READINESS AUDIT 6 หมวด

## หมวด ก — DTAM Next / placeholder / Lorem / TODO / ภาษาอังกฤษปนที่ควรเป็นไทย

| # | finding | file:line | ระดับความน่าอาย |
|---|---|---|---|
| ก-1 | grep-pin `dtam.?next` ฝั่ง FE = **0 จุด** · ฝั่ง backend = **14 จุด** (สเปกบอก 13 จุด ผลรันจริงได้ 14) ทุกจุดเป็น comment/ชื่อ migration/ชื่อ partner ของ integration ไม่ใช่ข้อความบนจอ | รันจริง: `grep -rniE "dtam.?next" apps/web-app/src` = 0 · `apps/backend` = 14 (เช่น `apps/backend/prisma/schema/trace.prisma:262`, `apps/backend/services/partner-access-log.js:4`, `apps/backend/routes/api/integration/interoperability.js:66`) | ไม่นับเป็นข้อผิดตามสเปก |
| ก-2 | Lorem ipsum — **ไม่พบ** | pattern: `grep -rni "lorem ipsum\|lorem" apps/web-app/src apps/backend` = 0 hit | — |
| ก-3 | `TODO`/`FIXME` ใน `apps/web-app/src` (ไม่รวม test) = 23 บรรทัด แต่ **ทุกบรรทัดคือค่า enum `'TODO'` ของ work-activity state ที่แปลไทยแล้วว่า "รอรับงาน"** ไม่ใช่โค้ดค้าง | `apps/web-app/src/app/provider/work/client-view.tsx:38,118` · `apps/web-app/src/app/provider/work/[id]/client-view.tsx:37,77` | ต่ำ (ไม่โผล่เป็นคำว่า TODO บนจอ) |
| ก-4 | **backend ส่งคำว่า `Internal server error` เป็นค่าของฟิลด์ `messageTh`** (ฟิลด์ข้อความไทย) เมื่อเกิด 5xx · FE อ่าน `messageTh` เป็นลำดับแรก | `apps/backend/server.js:418` (`messageTh: statusCode >= 500 ? 'Internal server error' : null`) → เข้าที่ `apps/web-app/src/lib/api/api-client.ts:316` (`errorData?.messageTh \|\| errorData?.message \|\| errorData?.error`) | **สูง** — ถ้ามี 500 กลางเดโม ผู้ชมเห็นภาษาอังกฤษล้วน |
| ก-5 | ศัพท์เทคนิคอังกฤษบนหน้าเกษตรกร: `<code>legal hold</code>` | `apps/web-app/src/app/health/profile/privacy/page.tsx:246` | กลาง |
| ก-6 | สแกน JSX text node ภาษาอังกฤษล้วนใต้ `apps/web-app/src/app/health` (เกณฑ์: ≥2 คำ, ≥7 ตัวอักษร) พบ **4 จุด** — 2 จุดเป็นข้อความ error ของ React ใน comment, 1 จุดคือ ก-5, 1 จุดคือ `PDF, JPG, PNG` (ชื่อสกุลไฟล์ ยอมรับได้) | `apps/web-app/src/app/health/applications/new/_steps/steps/farm-info-plots-land-sections.tsx:240` · `apps/web-app/src/app/health/planting/new/new-planting-cycle-summary.tsx:45,48` | ต่ำ |
| ก-7 | `check-thai-copy-style.js` / `check-banned-terms.js` / `check-ui-a11y-baseline.js` ผ่านทั้งหมด (ผลรันจริงในเซสชันนี้) | `[thai-copy-style] OK` · `[banned-terms] Repository scan passed` · `[ux-ui-baseline] PASS (15 ActionIcon tags verified)` | — |
| ก-8 | `check-i18n-reachability.js`: **891 จาก 2059 Thai leaves ไม่ถูกเรียกใช้ (43.3%)** และ budget = 891 พอดี (แตะเพดาน) | ผลรันจริง: `[i18n-reachability] 891 of 2059 Thai leaves unreached (43.3%), budget 891` · baseline: `scripts/ci/i18n-reachability-baseline.json` | ต่ำต่อเดโม (ไม่เห็นบนจอ) แต่แปลว่า dictionary มีของตายเกือบครึ่ง |

## หมวด ข — ปุ่ม/เมนูกดแล้วไม่ไปไหน + `check-orphan-api-routes.js` ครอบอะไร

**ผลรันจริง**: `node scripts/ci/check-orphan-api-routes.js` → `[orphan-api-routes] OK: no orphan route files detected` (exit 0)

**มันครอบอะไรจริง — วัดเป็นตัวเลข**

| ข้อเท็จจริง | หลักฐาน |
|---|---|
| walker อ่านเฉพาะไฟล์ `.js` **ระดับบนสุด** ของ `apps/backend/routes/api/` ไม่เดินลง subdirectory | `scripts/ci/check-orphan-api-routes.js:54-56` (`fs.readdirSync(apiDir).filter(entry => entry.isFile())`) |
| ไฟล์ระดับบนสุดมีแค่ **2 ไฟล์** (`health.js`, `index.js`) จาก **181 ไฟล์ `.js`** ทั้งต้นไม้ | รันจริง: `ls apps/backend/routes/api/*.js` = 2 · `find apps/backend/routes/api -name '*.js'` = 181 |
| หัก ignore list (`index.js`, `provider-cms.js`) แล้วเหลือไฟล์ที่ถูกประเมินจริง = **1 ไฟล์** (`health.js`) | `scripts/ci/check-orphan-api-routes.js:19-23` + จำลองด้วย node แล้วได้ `=> files actually evaluated for orphan-ness: 1` |
| ⇒ ความครอบคลุมจริง = **1/181 ไฟล์ (0.55%)** ผลเขียวไม่ได้แปลว่าไม่มี orphan | คำนวณจากสองแถวบน |
| ignore list ยังกัน `provider-cms.js` ทั้งที่ไฟล์นั้น **ย้ายไปอยู่ `routes/api/system/provider-cms.js` แล้ว** — เป็น config ตายที่ไม่กันอะไร | `scripts/ci/check-orphan-api-routes.js:22` · `find apps/backend/routes -name provider-cms.js` = `apps/backend/routes/api/system/provider-cms.js` |
| จุดบอด mount detection ที่ **บันทึกไว้แล้ว** — regex `require('./x')` ที่ `:31` มองไม่เห็น `createLazyRouter(modulePath)` ทำให้ถ้าขยาย walker จะได้ orphan ปลอม 15 ไฟล์ | `BACKLOG-FOUND.md:42` (operator ตัดสินแล้วว่าไม่ขยายจนกว่าจะแก้ mount detection) · `apps/backend/routes/api/provider/index.js:5-14` |

**มันไม่ครอบอะไรเลย**
- ไม่ครอบ **frontend route/ปุ่ม/เมนู** แม้แต่บรรทัดเดียว (สคริปต์แตะเฉพาะ `apps/backend/routes/api`) ⇒ คำถาม "ปุ่มกดแล้ว 404" ตอบด้วยสคริปต์นี้ไม่ได้
- ไม่ครอบ route ที่ mount แล้วแต่ handler พัง / ต้องสิทธิ์ที่ไม่มีใครมี
- ไม่ครอบ subdirectory ทั้ง 23 โฟลเดอร์ใต้ `apps/backend/routes/api/`

**ตรวจ dead link ฝั่ง FE เองแทน (สคริปต์ที่ผมเขียนชั่วคราวใน scratchpad ไม่ได้เขียนลงรีโป)**
- วิธี: สร้าง route set จากทุกไฟล์ `page.tsx`/`route.ts` ใต้ `apps/web-app/src/app` (รองรับ route group `(x)` และ dynamic `[x]`) แล้วจับคู่กับทุก `href="/..."`, `push('/...')`, `replace('/...')` ใน `apps/web-app/src` (ไม่รวม `__tests__`)
- **ผล: dead internal link = 0 จุด** · จุดเดียวที่สคริปต์เตือนคือ `apps/web-app/src/components/layout/Footer.tsx:39` (`/sitemap.xml`) ซึ่ง **ไม่ใช่ dead** เพราะมีไฟล์จริงที่ `apps/web-app/public/sitemap.xml`
- หมายเหตุที่พบระหว่างทาง: `/sitemap.xml` มีสองแหล่ง — `apps/web-app/src/app/sitemap.ts` (Next generate) และ `apps/web-app/public/sitemap.xml` (static, ชนะ) ระดับความน่าอาย: ต่ำ

## หมวด ค — หน้าที่พังบนมือถือ (เกษตรกรใช้มือถือเป็นหลัก)

> ข้อจำกัดที่ต้องบอกก่อน: ตรวจจาก **โค้ดอย่างเดียว** ไม่ได้ render จริง (ห้ามยิง staging / ห้ามรัน playwright) ⇒ ทุกข้อล่างนี้คือความเสี่ยงจาก markup ไม่ใช่ผลวัดหน้าจอจริง

| # | finding | file:line | ระดับความน่าอาย |
|---|---|---|---|
| ค-1 | **ไม่พบ `export const viewport` และไม่พบ `<meta name="viewport">` ในซอร์สทั้งโปรเจกต์** — root layout มีแต่ `export const metadata` · Next 15 App Router ใส่ default viewport ให้เอง แต่ **ยืนยันไม่ได้ในรอบนี้เพราะห้าม build/serve** | pattern ที่ใช้: `grep -rn "export const viewport\|viewport:" apps/web-app/src` = 0 · `grep -rn 'meta name="viewport"' apps/web-app/src apps/web-app/public` = 0 · `apps/web-app/src/app/layout.tsx:34` มีแต่ metadata · `apps/web-app/package.json:45` = `"next": "^15.5.18"` | **ยังไม่ได้ตรวจ** (ต้อง render จริงถึงตอบได้) |
| ค-2 | ตาราง `min-w-[...]` บนหน้าเกษตรกร **มี wrapper `overflow-x-auto` ครบ** — ไม่พบตารางที่คลิปแบบเงียบ | `apps/web-app/src/app/health/planting/[id]/planting-cycle-detail-tabs-section-a-overview-plots.tsx:166-167` · `...-section-a-units.tsx:306-307` | — (ผ่าน) |
| ค-3 | ตารางฝั่ง provider ที่กว้าง 720-900px มี wrapper ครบเช่นกัน | `apps/web-app/src/app/provider/standards/asean/page.tsx:72-73` · `apps/web-app/src/app/provider/herbs/[code]/page.tsx:233-234` · `apps/web-app/src/app/provider/surveys/page.tsx:190-191` | — (ผ่าน) |
| ค-4 | ตารางรายการชำระเงินของเกษตรกรถูกซ่อนบนจอเล็ก (`hidden lg:block`) มี fallback การ์ด ⇒ ปลอดภัย | `apps/web-app/src/app/health/payments/client-view.tsx:476-477` | — (ผ่าน) |
| ค-5 | `grid-cols-3` **ไม่มี responsive prefix** บนหน้าเกษตรกร 2 จุด · จุดแรกใส่จำนวนเงินบาท 3 ช่องในแถวเดียว — บนจอ 360px ได้ช่องละ ~110px ถ้ายอดเป็นหลักล้าน (`฿1,234,567`) เสี่ยงล้น โดยเฉพาะหลัง commit `52fec688` ที่บังคับไม่ให้ตัวเลขบาทตัดบรรทัด | `apps/web-app/src/app/health/billing/client-view.tsx:458` · `apps/web-app/src/app/health/applications/new/_steps/steps/quality-control-step.tsx:90` | กลาง (ยังไม่ได้ยืนยันด้วยการ render) |
| ค-6 | สแกน `w-[NNNpx]` ≥360px แบบไม่มี responsive prefix ใต้ `app/health`, `app/auth`, `components/layout` — **ไม่พบ** · `whitespace-nowrap` บนข้อความไทยยาว — **ไม่พบ** | สคริปต์ python ใน scratchpad: `fixed_w: 0`, `nowrap: 0` | — (ผ่าน) |
| ค-7 | ตาราง 40 จุดทั่วแอปที่ไม่มี `overflow-x-auto` ภายใน 5 บรรทัดก่อนหน้า — ส่วนใหญ่คือ `<Table>` component และหน้า print · ที่อยู่ฝั่งเกษตรกร: `health/training`, `health/sop-templates` (5 ตาราง), `health/planting/[id]/activities` | `apps/web-app/src/app/health/sop-templates/client-view.tsx:185,196,211,222,232` · `apps/web-app/src/app/health/training/client-view.tsx:272` · `apps/web-app/src/app/health/planting/[id]/activities/client-view.tsx:322` | กลาง (ต้อง render จริงถึงยืนยันได้ว่าล้นจริง) |

## หมวด ง — error ที่โผล่ stack trace / ศัพท์เทคนิคให้ผู้ใช้เห็น

| # | finding | file:line | ระดับความน่าอาย |
|---|---|---|---|
| **ง-1** | **staging ส่ง stack trace เต็มกลับให้ client ทุก error** — `isProduction` เช็ค `NODE_ENV === 'production'` เท่านั้น แต่ staging ตั้ง `NODE_ENV=staging` ⇒ `isProduction === false` ⇒ global error handler แนบ `details: { stack: err.stack }` | `apps/backend/server.js:78` (`const isProduction = process.env.NODE_ENV === 'production'`) + `apps/backend/server.js:419` (`details: !isProduction && err.stack ? { stack: err.stack } : null`) + `docker-compose.staging.yml:64` และ `:173` (`NODE_ENV=staging`) | **สูงมาก** |
| ง-2 | ผลพ่วงจาก `NODE_ENV=staging` ตัวเดียวกัน: **CSP ปิดบน staging** และ **Swagger `/api-docs` + `/api-docs/swagger.json` เปิดสาธารณะบน staging** | `apps/backend/server.js:127` (`contentSecurityPolicy: isProduction ? undefined : false`) · `apps/backend/server.js:351` (`const enableApiDocs = !isProduction \|\| ...`) · `apps/backend/server.js:353-357` | **สูง** (ถ้ามีคนพิมพ์ URL ดูระหว่างเดโม) |
| ง-3 | `messageTh` เป็นภาษาอังกฤษเมื่อ 5xx (ดู ก-4) | `apps/backend/server.js:418` | สูง |
| **ง-4** | **`apps/web-app/src/utils/error-translator.ts` ตายที่ runtime — ไม่มี production caller เลย** ตัวไฟล์เขียนบอกเองที่หัวไฟล์ · ยืนยันด้วย grep: ผู้เรียก `translateError` ทั้งหมดอยู่ในไฟล์ test ของตัวเอง | `apps/web-app/src/utils/error-translator.ts:5-13` · `grep -rn "translateError\|error-translator" apps/web-app/src` → ผู้เรียกทั้งหมดคือ `apps/web-app/src/utils/__tests__/error-translator.test.ts` (บรรทัด 6,11,12,13,17,21,26,30,31,35,36) ไม่มีไฟล์ production ไฟล์ใดเลย | สูงในแง่ "อย่าอ้างว่ามีตัวแปลไทย" — ตัวแปลจริงคืออีกไฟล์ |
| ง-5 | ตัวแปลที่ **ทำงานจริง** คือ `toUserFriendlyError` ใน api-client · มีชั้นดักท้ายสุดที่จับ stack trace / file:line / `node_modules/` / `/app/` / ข้อความยาว >300 แล้วเปลี่ยนเป็นข้อความไทย ⇒ **ค่า `.error` ที่ render ไม่มีทางเป็น stack** | `apps/web-app/src/lib/api/api-client.ts:108-135` (แผนที่ไทย) · `:177-185` (ตัวดัก stack/regex `at\s+\w+\s*\(`, `\.(js\|ts\|mjs):\d+`, `node_modules/`, `/app/`, `Error:\s`, `length > 300`) | — (ผ่าน) |
| ง-6 | ช่องว่างระหว่าง ง-1 กับ ง-5: ตัวดักที่ api-client ดูเฉพาะฟิลด์ `.error`/`.message`/`.messageTh` **ไม่ได้ดู `details.stack`** ที่ server.js:419 แนบมา ⇒ UI ไม่ render ก็จริง แต่ stack อยู่ใน network response ที่เปิด DevTools/curl เห็นได้ทันที | `apps/web-app/src/lib/api/api-client.ts:75` (`ENVELOPE_RESERVED_KEYS` เก็บ field อื่นเข้า `.meta` ทั้งหมด รวม `details`) เทียบกับ `apps/backend/server.js:419` | สูง (ถ้าผู้ชมเป็นสายเทคนิค) |
| ง-7 | ฝั่ง backend มี sanitizer `safeErrorMessage` ที่ allowlist ข้อความ + blocklist คำ ORM/path/SQL + จำกัด 160 ตัวอักษร ⇒ ข้อความ 4xx ปลอดภัย | `apps/backend/shared/api-response.js:132-136` (SAFE_ERROR_PHRASES) · `:144-152` (UNSAFE_ERROR_INDICATORS) · `:158` (SAFE_ERROR_MAX_LENGTH=160) · `:165-178` | — (ผ่าน) |
| ง-8 | `apps/backend/shared/error-codes.js` มี 2516 บรรทัด เป็น SSOT ของ code + Thai fallback ตามที่สเปกบอกจริง | `wc -l apps/backend/shared/error-codes.js` = 2516 | — |

## หมวด จ — seed ที่ดูไม่สมจริง (และ "โผล่บนจอไหม")

**แก้พิกัดในสเปกก่อน**: `scripts/seed-test-accounts.js` **ไม่มีอยู่จริง** (pattern: `find . -name "*seed*test*account*"`) ของจริงมี 2 ไฟล์คือ `scripts/db/seed-test-accounts.js` และ `apps/backend/scripts/seed-test-accounts.js` · และเลข `1111111111111` / `2222222222222` **ไม่ได้อยู่ในสองไฟล์นั้น** แต่อยู่ที่ `apps/backend/prisma/seed-gacp.js`

| # | finding | file:line | ระดับความน่าอาย |
|---|---|---|---|
| **จ-1** | **เลขซ้ำหลักเดียวอยู่ใน seed ที่ผูกกับคำสั่ง `seed` จริง** — `pnpm --filter backend seed` = `node prisma/seed-gacp.js && node prisma/seed-bank-accounts.js` | `apps/backend/package.json:75` · `apps/backend/prisma/seed-gacp.js:96` (`providerId: '1111111111111'` — วิชัย ตรวจเอกสาร, REVIEWER_AUDITOR), `:104` (`'2222222222222'` — ประสิทธิ์ ตรวจแปลง, AUDITOR), `:115` (`'2222222222223'`), `:123` (`'3333333333333'` — สุภาพร จัดตาราง, SCHEDULER), `:131` (`'4444444444444'` — ณัฐพล การเงิน, ACCOUNTANT), `:87` (`'9876543210987'` — ADMIN) | — |
| **จ-2** | **โผล่บนจอจริง จุดที่ 1 (แย่ที่สุด)**: dropdown เลือกผู้ตรวจในหน้าปฏิทินของ scheduler แสดงเป็น `ชื่อ (providerId)` ⇒ ผู้ชมจะเห็น `ประสิทธิ์ ตรวจแปลง (2222222222222)` ตอนสาธิตขั้นนัดลงพื้นที่ | `apps/web-app/src/app/provider/calendar/client-view.tsx:103` (``label: `${auditor.fullName}${auditor.providerId ? ` (${auditor.providerId})` : ""}` ``) | **สูงมาก** — อยู่กลาง flow หลักของการเดโม |
| จ-3 | **โผล่บนจอจริง จุดที่ 2**: หน้าโปรไฟล์เจ้าหน้าที่แสดง Provider ID เต็ม ไม่มี mask | `apps/web-app/src/app/provider/profile/page.tsx:196` (`<InfoItem label={... 'Provider ID'} value={profile.providerId \|\| '-'} />`) | สูง |
| จ-4 | **โผล่บนจอจริง จุดที่ 3**: dialog สร้างผู้ใช้ใน admin แสดง providerId ที่เพิ่งสร้างแบบ font-mono | `apps/web-app/src/app/admin/organizations/_components/create-user-dialog.tsx:180` | กลาง |
| **จ-5** | **`scripts/db/seed-test-accounts.js` พังเรื่อง encoding ทั้งไฟล์** — ไฟล์ไม่ใช่ UTF-8 (`file` บอก "Non-ISO extended-ASCII text", decode UTF-8 ล้มที่ byte 0xa6 ตำแหน่ง 7343) และข้อความไทยทุกจุดกลายเป็นเครื่องหมายคำถาม ASCII **723 ตัว** ⇒ ถ้ารันไฟล์นี้ บัญชีที่ seed จะมี `firstName: '?????'` `lastName: '?????'` และขึ้นบนจอเป็น `????? ?????` | `scripts/db/seed-test-accounts.js:76` (`firstName: '?????'`) — ยืนยันด้วย `od -c` ได้ไบต์ `' ? ? ? ? ? '` ทั้งหมดเป็น 0x3f · `:71,77,88-89,97,102-103` ก็เช่นกัน · ไฟล์คู่แฝด `apps/backend/scripts/seed-test-accounts.js` เป็น UTF-8 ถูกต้อง | **สูงมาก ถ้าเผลอรันไฟล์ผิดตัว** |
| จ-6 | **`check-mojibake-encoding.js` มองไม่เห็น จ-5** — รันจริงได้ `[encoding-check] PASS: no mojibake markers or UTF-8 BOM files found` ทั้งที่ไฟล์นั้น decode UTF-8 ไม่ผ่าน | ผลรันจริงในเซสชันนี้ · `scripts/ci/check-mojibake-encoding.js` | สูง (gate ไม่กันของที่ควรกัน) |
| จ-7 | **หัวไฟล์ของ จ-5 สอน usage ที่ผิดและอันตราย**: path ที่เขียนไว้ (`node scripts/seed-test-accounts.js`) ไม่มีอยู่จริง และบรรทัดถัดมาสั่งให้ ssh เข้า **โดเมน production** เพื่อ seed บัญชีทดสอบ | `scripts/db/seed-test-accounts.js:13-15` (`ssh root@gacpth.com "docker exec gacp-backend node scripts/seed-test-accounts.js"`) | **สูง (ความเสี่ยง ไม่ใช่แค่ความน่าอาย)** |
| จ-8 | เลขในไฟล์ seed-test-accounts ทั้งสองตัวเป็น Thai ID ที่ checksum ถูกต้อง ดูสมจริงกว่ามาก (คำนวณจริงได้ `1100000000008` เกษตรกร, `2900000000009` admin, `3900000000007` reviewer, `4900000000005` scheduler, `5900000000003` auditor, `6900000000001` accountant) | `scripts/db/seed-test-accounts.js:44-63` · ยืนยันตรงกับ `docs/contract/evidence/README.md:31` | — (ของดีที่มีอยู่แล้ว) |
| จ-9 | seed scripts เหล่านี้ **เขียนข้อมูลโดยไม่ผ่าน PDPA extension** — บันทึกไว้แล้วใน runbook | `docs/deployment/production-runbook.md:1102` | สูง (ข้อมูล) |
| จ-10 | seed 2 ไฟล์นิยาม `THAI_IDS` ซ้ำกันคนละที่ (Law 3.6 dup-source) | `scripts/db/seed-test-accounts.js:44` และ `apps/backend/scripts/seed-test-accounts.js:45` | ต่ำต่อเดโม |

## หมวด ฉ — flow ที่ตันกลางทาง (น่าอายที่สุดตอนสาธิต)

**วิธีตรวจ**: โหลด `ALLOWED_TRANSITIONS` + `ROLE_TRANSITIONS` จาก `apps/backend/services/workflow-transition-service.js` ด้วย node แล้วคำนวณ incoming edge / role owner / terminal จริง (ไม่ใช่อ่านเอา) · ผลรันจริง:
- states ไม่มี incoming edge เลย (นอกจาก DRAFT): **`CANCEL_EXPIRED`**
- edges ที่ไม่มี role ใดถือ: **ไม่มี** (ทุก edge มีเจ้าของอย่างน้อย 1 role)
- terminal states (ไม่มี outgoing): **`CERTIFIED`, `REJECTED`, `CANCEL_EXPIRED`**

| # | flow ตัน | file:line | ระดับความน่าอาย |
|---|---|---|---|
| **ฉ-1** | **ยืนยันข้อที่สเปกบอก**: `PENDING_AUDIT_FEE` ไม่มี edge ไป `EXPIRED` — ออกได้แค่ `PHASE_2_SLIP_UNDER_REVIEW` กับ `AUDIT_FEE_PAID` เท่านั้น ⇒ คำขอที่ไม่จ่ายค่าตรวจ **ค้างตลอดกาล ไม่มีวันหมดอายุ** · `PENDING_DOC_FEE` เป็นแบบเดียวกัน | `apps/backend/services/workflow-transition-service.js:62` (`PENDING_AUDIT_FEE: new Set(['PHASE_2_SLIP_UNDER_REVIEW', 'AUDIT_FEE_PAID'])`) · `:54` (`PENDING_DOC_FEE`) เทียบกับ `:59` และ `:66` ที่มี `'EXPIRED'` | **สูง** |
| **ฉ-2** | **ยืนยันข้อที่สเปกบอก**: `CAR_REVIEWING` กลับไปนัดลงพื้นที่ใหม่ไม่ได้ — ออกได้แค่ `AUDIT_PASSED` กับ `CAR_PENDING` **ไม่มี edge กลับไป `AUDIT_CONFIRMED`** และไม่มี edge ไป `REJECTED` ⇒ ถ้า CAR รอบสองไม่ผ่านจริง ผู้ตรวจทำได้แค่โยนกลับ `CAR_PENDING` วนไปเรื่อย ๆ จนกว่า cron จะ expire | `apps/backend/services/workflow-transition-service.js:67` (`CAR_REVIEWING: new Set(['AUDIT_PASSED', 'CAR_PENDING'])`) · edge หมดอายุที่ใช้ได้คือ `:66` `CAR_PENDING: new Set(['CAR_REVIEWING', 'EXPIRED'])` | **สูง** |
| **ฉ-3 (ใหม่)** | **`AUDIT_CONFIRMED` ไม่มีทางหมดอายุและไม่มีทางยกเลิก** — ออกได้ 3 ทาง (`AUDIT_PASSED`/`CAR_PENDING`/`REJECTED`) ซึ่ง **ทั้งสามถือโดย auditor เท่านั้น** ⇒ ถ้านัดลงพื้นที่แล้วผู้ตรวจไม่ไป/ไม่บันทึกผล เคสค้างที่สถานะ "ยืนยันนัดตรวจ" ถาวร ไม่มี cron แตะ | `apps/backend/services/workflow-transition-service.js:65` · role owner ที่ `:136-138` (AUDITOR ถือทั้งสาม edge) · ไม่มี `AUDIT_CONFIRMED->EXPIRED` ใน `:47-84` | **สูง** |
| **ฉ-4 (ใหม่)** | **`SUBMITTED` และ `DOC_APPROVED` ออกได้โดย SYSTEM เท่านั้น** — ไม่มี human role ใดถือ edge นี้ ⇒ ถ้า auto-advance พลาด (เช่นสร้าง invoice ไม่สำเร็จ) เคสค้างที่ "ยื่นแล้ว" / "เอกสารผ่าน" และ **เจ้าหน้าที่หน้าจอไหนก็ดันต่อไม่ได้** ต้องใช้ admin force เท่านั้น | `apps/backend/services/workflow-transition-service.js:49` และ `:60` (edge) · `:164-166` (`SYSTEM` ถือ `'SUBMITTED->PENDING_DOC_FEE'`, `'DOC_APPROVED->PENDING_AUDIT_FEE'`) · ทางออก admin: `:265-268` + `force` flag ใน `buildTransitionUpdate` | **สูง** |
| **ฉ-5 (ใหม่)** | **ประตูจ่ายเงินสองบานถือโดย Stripe webhook (SYSTEM) เท่านั้น แต่ Stripe ปิดอยู่** — `PENDING_DOC_FEE->DOC_FEE_PAID` และ `PENDING_AUDIT_FEE->AUDIT_FEE_PAID` เขียนไว้ว่า "settle โดย payment_intent.succeeded เท่านั้น ไม่มี human role ถือ" ⇒ บน staging ที่ไม่มี env Stripe เลย **ทางออกเดียวที่เดินได้จริงคือเส้นสลิป** ถ้าผู้สาธิตเผลอไปเส้นออนไลน์จะตันที่ 503 | `apps/backend/services/workflow-transition-service.js:167-171` · gate ที่ `apps/backend/routes/api/finance/payments.js:409-417` (ตอบ 503 `STRIPE_CHECKOUT_DISABLED`) · `apps/backend/config/stripe.js:34-36` · ไม่มี `STRIPE_*` ใน `docker-compose.staging.yml` และ `docker-compose.production.yml` (grep ได้ 0 hit ทั้งสองไฟล์) | **สูง** |
| **ฉ-6 (ใหม่)** | **ผู้ยื่นยกเลิกคำขอเองไม่ได้เลย ไม่ว่าสถานะไหน** — `DRAFT` ออกได้ทางเดียวคือ `SUBMITTED` และ HEALTH ถือแค่ 5 edge ที่ไม่มี edge ยกเลิก | `apps/backend/services/workflow-transition-service.js:48` · `:93-99` (`ROLE_TRANSITIONS[HEALTH]` = 5 edge: `DRAFT->SUBMITTED`, `REVISION_REQUESTED->ASSIGNED_FOR_REVIEW`, `CAR_PENDING->CAR_REVIEWING`, และ 2 edge อัปสลิป) | กลาง (แต่ถ้าผู้ชมถามจะตอบไม่ได้) |
| **ฉ-7 (ใหม่)** | **`CANCEL_EXPIRED` เป็น state ผี** — ไม่มี incoming edge ใดในทั้งเครื่อง (ยืนยันด้วยการคำนวณ) แต่ยังถูกประกาศออก public API `GET /api/system/status-machine` พร้อม label ไทย "ยกเลิก/หมดอายุ" ⇒ ถ้ามีคนสร้าง UI จาก endpoint นี้จะได้สถานะที่ไม่มีทางเกิด | `apps/backend/shared/status-machine-contract.js:55` · `apps/backend/services/workflow-transition-service.js:83` (`CANCEL_EXPIRED: new Set()`) และ `:38` (ยังอยู่ใน `WORKFLOW_STATES`) · `apps/backend/routes/api/index.js:71` mount `/system` | กลาง |
| ฉ-8 | **`REJECTED` เข้าได้จาก `AUDIT_CONFIRMED` ทางเดียว** — ผู้ตรวจเอกสารปฏิเสธคำขอไม่ได้ ทำได้แค่ขอแก้ไข (`REVISION_REQUESTED`) วนกัน ⇒ เดโม "เคสถูกปฏิเสธตอนตรวจเอกสาร" ทำไม่ได้ · **เป็น design ที่เขียนอธิบายไว้ในโค้ดแล้ว ไม่ใช่บั๊ก** | `apps/backend/services/workflow-transition-service.js:65` · เอกสารในโค้ดที่ `apps/backend/routes/api/provider/work.js:53-58` และ `apps/backend/routes/api/provider/handlers/workflow-side-effects.js:284-289` | กลาง (ต้องเตรียมคำตอบ) |
| ฉ-9 | **`CERTIFIED` เป็น terminal ไม่มี outgoing** — การเพิกถอนใบรับรองทำผ่าน route แยกที่แตะแค่ตาราง Certificate **สถานะ application ยังเป็น CERTIFIED เหมือนเดิม** ⇒ ถ้าเดโมเพิกถอนแล้วกลับไปดูหน้าคำขอ จะเห็นว่า "ได้รับใบรับรอง" อยู่ | `apps/backend/services/workflow-transition-service.js:70` (`CERTIFIED: new Set()`) · route เพิกถอน `apps/backend/routes/api/integration/interoperability.js:392-410` (เรียก `certificateService.revokeCertificate` ไม่แตะ application status) | กลาง |
| ฉ-10 | ทางออกเดียวที่ยัง "เดินจบ" ได้จริงคือ `EXPIRED` ผ่าน cron รายชั่วโมงนาทีที่ 15 (เฉพาะ `REVISION_REQUESTED` และ `CAR_PENDING`) — และ waiver-reopen พา `EXPIRED` กลับได้ 1 ครั้ง โดย SYSTEM | `apps/backend/jobs/scheduler.js:28-39` (`cron.schedule('15 * * * *')` → `checkExpiredDeadlines`) · `apps/backend/services/workflow-transition-service.js:80` (`EXPIRED: new Set(['REVISION_REQUESTED','CAR_PENDING'])`) และ `:181-182` (SYSTEM-only) | — |

---

# ข้อ 3 — VISUAL EVIDENCE PACK: ประเมิน PR #686 (ยังไม่ถ่ายใหม่)

**สิ่งที่ทำได้โดยไม่ fetch**: commit `a406eaf968d05f8774ce45cd4ec34f9988125905` มีอยู่ใน object store ท้องถิ่นแล้ว (`git cat-file -t` = `commit`) ⇒ อ่าน tree/INDEX/run-log ได้ตรง ๆ · **ไม่ได้รัน `git fetch` และไม่ได้แตะ working tree**

**ข้อเท็จจริงพื้นฐาน (ผลรันจริง)**
- commit: `a406eaf9` · `2026-07-16 10:20:34 +0700` · `docs(screenshots): full-system screenshot pack — 180 images, every page every role`
- merge-base กับ main = `670d1e10` · main เดินไปแล้ว **293 commits** ตั้งแต่นั้น (รายงานเดิม `evidence/STALE-PR-REVIEW-2026-08-04.md:119` เขียน 268 — ตัวเลขนั้นเก่าไปแล้ว)
- ไฟล์ในแพ็ก 182 รายการ = ภาพ 180 + `INDEX.md` + `run-log.json`
- run-log: `capturedAt: 2026-07-16T03:13:48.970Z` · `base: https://staging.gacpth.com` · catalog 180 รายการ · status `OK` 172 / `REDIRECT` 8

**นับ commit บน main ที่แตะไฟล์หน้าจอหลัง 2026-07-16 (ตัด `__tests__` ออก)**

| หมวดภาพ | จำนวนภาพ | ไฟล์ที่เปลี่ยนหลัง 16 ก.ค. | commit |
|---|---|---|---|
| 01-public | 25 | 37 | 18 |
| 02-farmer | 68 | 101 | 19 |
| 03-admin | 53 | 17 | 6 |
| 04-reviewer + 05-scheduler + 06-auditor + 07-accounting (`app/provider`) | 33 | 99 | 13 |
| shared `components/` (กระทบทุกหมวด) | — | 63 | 22 |
| `styles/` + `globals.css` + `layout.tsx` (กระทบทุกภาพ) | — | 4 | 7 |
| 08-public-dynamic | 1 | — | — |

**commit ที่ตัดสินว่า "ทั้งแพ็กใช้ไม่ได้" ไม่ใช่แค่หน้า auth**

| commit | วันที่ | ผลต่อภาพ |
|---|---|---|
| `2edbe77c` (#700) | 2026-07-24 | ข้อความ commit ระบุเอง: "emerald-* retired across **121 files (~780 tokens)**" + badge สีทองเปลี่ยนเป็น deep-bronze + ปุ่ม solid ย้ายไป leaf-700/800 · แตะ `apps/web-app/src/styles/globals.css` และ `globals-components-auth.css` ⇒ **สีเปลี่ยนทั้งระบบ** |
| `2f5a3bf8` (#702) | 2026-07-25 | "**615 user-visible strings** converted to Thai" + "Official MOPH/DTAM seal now renders in **both portal topbars, both login heroes, the favicon**" · **147 files changed, 943 insertions** · เพิ่มไฟล์ `apps/web-app/public/images/dtam-seal.png` ⇒ **ตราหน่วยงานเปลี่ยนทุกหน้า + ข้อความเปลี่ยน 615 จุด** |
| `8797c1f5` (#691) / `767b4cf3` (#692) / `c7d976da` (#697) | 2026-07-23 | auth hero restructure, design-audit remediation, dark mode, v3.8.0 |
| `22a26241` (#707) / `9f5e73f1` | 2026-07-26 | Thai/English purity บน glossary+register, Thai typography rules |
| `0e628404` | 2026-07-26 | ย้าย terms/ + privacy/ ออกจาก auth split layout ⇒ **โครงหน้า 2 หน้าเปลี่ยน** |
| `52fec688` | 2026-07-27 | จำนวนเงินบาทไม่ตัดกลางตัวเลข ⇒ layout ตัวเลขเปลี่ยน |

**ข้อสรุปแยกเป็นหมวด**

| หมวด | จำนวน | คำตัดสิน | เหตุผลที่พิสูจน์ได้ |
|---|---|---|---|
| **01-public** (25) | 25 | **ต้องถ่ายใหม่ทั้งหมด** | โดน `2f5a3bf8` (seal + favicon + login hero) และ `0e628404` (terms/privacy ย้าย layout) และ `22a26241` (register/glossary) ตรง ๆ |
| **02-farmer** (68) | 68 | **ต้องถ่ายใหม่ทั้งหมด** | 101 ไฟล์เปลี่ยนใน `app/health` + โดน token retirement + Thai conversion + `52fec688` (ตัวเลขบาท) |
| **03-admin** (53) | 53 | **ต้องถ่ายใหม่ทั้งหมด** | 17 ไฟล์เปลี่ยนใน `app/admin` + topbar seal (`2f5a3bf8`) อยู่บนทุกภาพ |
| **04/05/06/07-provider** (33) | 33 | **ต้องถ่ายใหม่ทั้งหมด** | 99 ไฟล์เปลี่ยนใน `app/provider` + topbar seal + token retirement |
| **08-public-dynamic** (1) | 1 | **ต้องถ่ายใหม่ และห้ามใช้ภาพเดิมไม่ว่ากรณีใด** | เป็นภาพ **ข้อมูลจริง** — ดูข้อ 7 ล่าง |
| **INDEX.md + run-log.json** | 2 | **เก็บได้แต่ต้องล้าง URL ก่อน** | มี UUID จริงและเลขใบรับรองจริง — ดูข้อ 7 |

**สรุปเป็นประโยคเดียว**: **ไม่มีภาพชุดไหนใน 180 รูปที่ยังใช้ได้แบบไม่มีหมายเหตุ** เพราะสองรายการที่แตะทุกหน้า (design token retirement 121 ไฟล์ + DTAM seal ในทุก topbar/hero/favicon) ลงหลังวันถ่ายทั้งคู่ · ทางเลือกที่ยังเหลือคือ (ค) จาก `evidence/STALE-PR-REVIEW-2026-08-04.md:124` — merge ทั้งก้อนโดยติดป้ายชัดว่า "ภาพ ณ 16 ก.ค. 2569 ไม่ใช่สภาพปัจจุบัน" ซึ่ง **ผมไม่แนะนำสำหรับงานสาธิตต่อหน้ากรมฯ** เพราะตราหน่วยงานในภาพยังเป็น glyph ทั่วไป ไม่ใช่ตรา MOPH/DTAM ที่ใช้จริงตอนนี้

**สิ่งที่ตรวจแล้วว่า "ไม่ใช่ปัญหา"**: เทียบ `finalPath` ทั้ง 180 รายการกับ route ที่มีจริงบน main (สร้าง route set จากทุก `page.tsx` รองรับ route group + dynamic segment) — **route ที่หายไป = 0** ⇒ ภาพไม่ล้าสมัยเพราะ route ถูกลบ แต่ล้าสมัยเพราะหน้าตาเปลี่ยน

---

# ข้อ 6 — คำถามที่ผู้ชมจะถาม + คำตอบพร้อมหลักฐาน

> กติกา: ข้อไหนไม่มีหลักฐาน เขียนตรง ๆ ว่า "ยังไม่ได้วัด" / "ยังไม่ได้ตรวจ"

## Q1. ข้อมูลส่วนบุคคลปลอดภัยแค่ไหน

**คำตอบที่พูดได้**
"เข้ารหัสข้อมูลส่วนบุคคลระดับคอลัมน์ด้วย AES-256-GCM ที่ชั้น Prisma ค้นหาผ่านคอลัมน์แฮชคู่ขนาน และมีงานลบข้อมูลตามระยะเวลาที่ PDPA กำหนดพร้อมกลไก legal hold — **แต่งานลบอัตโนมัตินี้ยังครอบแค่ตารางผู้ใช้ตารางเดียว อีก 5 ตารางยังไม่มี**"

| ประเด็น | หลักฐาน |
|---|---|
| เข้ารหัส at-rest ระดับคอลัมน์ AES-256-GCM ที่ชั้น Prisma extension | `apps/backend/services/prisma-pdpa-extension.js:7-9` · ตัว cipher: `apps/backend/utils/field-encryption.js` (import ที่ `:86`) |
| ชุดคอลัมน์ที่เข้ารหัสจริงของ `User` (Phase 1+2+3 หัก DEFERRED) | `apps/backend/services/prisma-pdpa-extension.js:176-182` (`ALL_USER_PII_COLUMNS`) |
| ขอบเขตต่อ model: `User` + `Certificate` (`address`, `issuedBy`, `signedBy`) | `apps/backend/services/prisma-pdpa-extension.js:184-208` |
| การค้นหาไม่ใช้ค่า plaintext — ใช้คอลัมน์แฮช/HMAC คู่ขนาน (`healthIdHash`, `emailHash`, `juristicIdHash`, `taxIdHash`) | `apps/backend/services/prisma-pdpa-extension.js:64-66`, `:130-136`, `:258-260`, `:817-821` |
| เข้ารหัส PII ระดับ leaf ใน `formData` (JSON) ไม่ใช่ทั้งคอลัมน์ เพื่อไม่พังการ filter | `apps/backend/services/prisma-pdpa-extension.js:47-49` · `apps/backend/utils/formdata-pii.js` |
| PDPA retention sweep รันจริง วันละครั้ง 02:30 | `apps/backend/jobs/scheduler.js:186` (`cron.schedule('30 2 * * *')`) → `:191` (`runPdpaRetentionSweep`) |
| legal hold ทำงาน 2 ชั้น (query predicate + per-row guard) | `apps/backend/jobs/pdpa-retention-job.js:119` (`legalHoldExclusion()`), `:133` (`legalHoldSelection()`), `:148` (`legalHoldSkipped`) · `apps/backend/shared/legal-hold-guard.js:36-40` |
| **สิ่งที่ยังไม่ครอบ (ต้องพูด)**: sweep แตะ `prisma.user` ตารางเดียว ขณะที่ **6 model มีคอลัมน์ `legalHold`** ⇒ `Application`, `Certificate`, `Invoice`, `Organization`, `PaymentSlip` **ยังไม่มี retention sweep เลย** | `apps/backend/jobs/pdpa-retention-job.js:39` (comment ระบุเอง "reads and writes `prisma.user` only") · `:113` (`prisma.user.findMany`) · `:160` (`prisma.user.update`) · `apps/backend/shared/legal-hold-guard.js:86-93` (LEGAL_HOLD_MODELS 6 ตัว) · `:30-33` ("only `User` has a sweep at all; the other five are safe by accident, not by design") |
| **สิ่งที่ยังไม่ครอบ (2)**: `applicantName` บน Certificate ถูก **DEFER ไม่เข้ารหัส** เพราะมี contains-search | `apps/backend/services/prisma-pdpa-extension.js:188-192` |
| **สิ่งที่ยังไม่ครอบ (3)**: สคริปต์ seed/e2e เขียน DB โดยไม่ผ่าน PDPA extension | `docs/deployment/production-runbook.md:1102` |
| **สิ่งที่ยังไม่ครอบ (4)**: staging ส่ง stack trace กลับ client ทุก error (ดู ง-1) | `apps/backend/server.js:78,419` + `docker-compose.staging.yml:64,173` |

## Q2. ใบรับรองปลอมได้ไหม (QR verification)

**คำตอบที่พูดได้ — ห้ามพูดว่า "ปลอมไม่ได้"**
"ใบรับรองมี 2 ชั้น: (1) **ค่าแฮชความครบถ้วน** ที่บอกว่าข้อมูลในระบบถูกแก้ทีหลังหรือไม่ และ (2) **ลายมือชื่อดิจิทัล RSA** ที่บอกว่าเป็นของหน่วยรับรองจริง · ชั้นแรก **ไม่ได้กันการปลอม** เพราะเป็น SHA-256 ที่ไม่มีกุญแจลับ ใครก็คำนวณซ้ำได้ · ชั้นที่สองคือชั้นที่กันการปลอมจริง แต่เรายังไม่พร้อมประกาศว่าเสถียร"

| ประเด็น | หลักฐาน |
|---|---|
| `documentHash` = **SHA-256 ไม่มีกุญแจ** บน JSON ของฟิลด์สาธารณะ (เลขใบรับรอง, ชื่อผู้ขอ, ชื่อแปลง, จังหวัด, วันที่ ฯลฯ) ⇒ **ใครที่รู้ฟิลด์เหล่านี้ recompute ได้ ⇒ hash อย่างเดียวไม่พิสูจน์ความแท้** | `apps/backend/services/certificate-service.js:30-53` โดยเฉพาะ `:52` (`crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex')`) |
| ลายมือชื่อ RSA-SHA256 ทับ `documentHash` = ชั้น non-repudiation จริง | `apps/backend/services/certificate-service.js:349` (คำนวณ hash), `:359` (`signWithLocalKey(certData.documentHash, CERT_KEY_NAMESPACE)`) · `apps/backend/services/crypto/signature-service.js:301-316` |
| **การเซ็นเป็น best-effort — เซ็นไม่สำเร็จก็ยังออกใบรับรอง โดย `signature` เป็น null** | `apps/backend/services/certificate-service.js:353-367` โดยเฉพาะ comment `:354-356` และ catch ที่ `:365-367` |
| ผลคือ verify ตอบ `{ signed: false }` — คือ "ไม่มีลายเซ็น" ไม่ใช่ "ลายเซ็นผ่าน" | `apps/backend/services/certificate-service.js:855-857` |
| API สาธารณะแยกสองค่าออกจากกันชัดเจน (ไม่รวมเป็น "ผ่าน" ค่าเดียว) | `apps/backend/routes/api/auth/public.js:139` (`hashValid`) และ `:140` (`signatureValid: signature.signed ? signature.valid === true : null`) |
| **เหตุผลที่ key ยังไม่เสถียร ข้อ 1**: ถ้า namespaced key ยังไม่ถูก provision ระบบจะ **fallback ไปใช้ default key พร้อม log warn ว่า "Per-issuer separation is INERT"** | `apps/backend/services/crypto/signature-service.js:285-300` โดยเฉพาะ `:288-292` |
| **เหตุผลที่ key ยังไม่เสถียร ข้อ 2**: การ verify ใช้ **default public key เท่านั้น** ไม่ได้เลือกตาม `cert.signatureKeyId` ⇒ วันที่ ops ติดตั้ง namespaced key จริง ใบใหม่จะ verify ไม่ผ่านทันที | `apps/backend/services/certificate-service.js:861-864` (comment เขียนเองว่า "NOTE: verifies with the default public key. When per-issuer cert keys are provisioned (INT-11), thread cert.signatureKeyId through") · `apps/backend/services/crypto/signature-service.js:326-339` |
| passphrase มาจาก secrets layer และ fail-closed ถ้าไม่มี ⇒ ไม่มี passphrase = เซ็นไม่ได้ = ใบขึ้นแบบไม่มีลายเซ็น | `apps/backend/services/crypto/signature-service.js:29-46` · env ที่ compose: `docker-compose.staging.yml:79` และ `docker-compose.production.yml:114` ทั้งคู่เป็น `${RSA_PRIVATE_KEY_PASSPHRASE:-}` (ไม่มีค่า default) |
| ของดีที่พูดได้: **staging persist RSA key ข้าม recreate แล้ว** (ไม่ใช่ key ใหม่ทุก deploy) | `docker-compose.staging.yml:39,46` (volume `gacp_staging_signing_keys`) · `:148` (mount `/app/apps/backend/keys`) — ตรงกับ `keyDir` ที่ `apps/backend/services/crypto/signature-service.js:66` |
| การเพิกถอนใบรับรองสะท้อนในผล verify ทันที (fail closed) | `apps/backend/services/certificate-service.js:834-836` |
| หน้าตรวจสอบสาธารณะ **mask นามสกุลผู้ขอ** แต่ยังแสดง **ชื่อแปลงและจังหวัดเต็ม** | `apps/backend/routes/api/auth/public.js:148` (`maskApplicantName`), `:144` (`farmName`), `:155` (`province`) |

**ประโยคที่ห้ามพูด**: "ปลอมไม่ได้" / "QR ปลอมไม่ได้" / "แฮชกันการปลอมแปลง"
**ประโยคที่พูดได้**: "แฮชตรวจจับการแก้ไขข้อมูลในระบบได้ ส่วนการพิสูจน์ว่าออกโดยหน่วยงานจริงใช้ลายมือชื่อดิจิทัล ซึ่งเราจะประกาศพร้อมใช้เมื่อกระบวนการจัดการกุญแจนิ่งแล้ว"

## Q3. ระบบล่มแล้วยังไง

| ประเด็น | สถานะ | หลักฐาน |
|---|---|---|
| pg_dump ก่อน deploy (production) | **มี** | `scripts/deploy/deploy-production.sh:139` |
| pg_dump ก่อน deploy (staging) | **มี** | `scripts/deploy/deploy-staging.sh:93` |
| pg_dump ใน blue-green deploy | **มี** | `scripts/deploy/deploy-bluegreen.sh:148` |
| สคริปต์สำรองแยกต่างหาก + ตั้ง cron ได้ | **มี** | `scripts/backup/pg-backup.sh:80` · `scripts/backup/backup-system.sh:55` · `scripts/db/backup-database.sh:41` · `scripts/backup/cron.gacp-backup.template` · `scripts/backup/install-cron.sh` |
| คำสั่ง restore | **มี** | `scripts/backup/pg-backup.sh:13` (`./pg-backup.sh --restore <file>`), `:55-59` |
| rollback production แบบสั่งมือ (คืน DB จาก backup ก่อน deploy + สลับ ref + health check) | **มี** | `scripts/deploy/rollback-production.sh:1-31` (หัวไฟล์อธิบาย 7 ขั้น รวมข้อ 4 "Restores the database from the most recent pre-deploy backup") |
| auto-rollback ใน CI | **มี (อ้างอิงในหัวไฟล์)** | `scripts/deploy/rollback-production.sh:5-6` อ้าง `.github/workflows/production.yml` |
| **rollback สำหรับ staging โดยเฉพาะ** | **ยังไม่มี** | pattern: `ls scripts/deploy/` — มีเฉพาะ `rollback-production.sh` ไม่มี `rollback-staging.sh` |
| **บันทึกผลซ้อม restore จริง (drill) ว่าใช้เวลาเท่าไร กู้ได้ครบไหม** | **ยังไม่ได้ตรวจ / ไม่พบ artifact** | pattern: `find . -name "load-test-results-*" -o -iname "*restore*drill*"` = 0 hit ใน `evidence/` |
| **RTO / RPO ที่ประกาศไว้เป็นตัวเลข** | **ยังไม่ได้วัด** | ไม่พบเอกสารที่ระบุ RTO/RPO เป็นตัวเลขในรีโป |

**คำตอบที่พูดได้**: "มีสำรองฐานข้อมูลอัตโนมัติก่อน deploy ทุกครั้ง มีคำสั่ง restore และมีสคริปต์ย้อนเวอร์ชันสำหรับ production ที่คืนฐานข้อมูลให้ด้วย · **แต่ยังไม่ได้ซ้อมกู้คืนจริงและยังไม่ได้ประกาศตัวเลข RTO/RPO**"

## Q4. รองรับผู้ใช้กี่คน

**คำตอบที่ต้องใช้: "ยังไม่ได้วัด"**

| ประเด็น | หลักฐาน |
|---|---|
| มี **runbook** และ **สคริปต์ k6** พร้อมใช้ | `docs/qa/load-test-runbook-2026-05-16.md:1-5` · `scripts/load-test/scenarios.k6.js` · `apps/backend/chaos-tests/scenarios/load-test.yml` |
| มี **เป้าหมาย** ที่ตั้งไว้ (ไม่ใช่ผลวัด): 1000 applicants พร้อมกัน + 50 staff พร้อมกัน · public verify 500-1500 rps | `docs/qa/load-test-runbook-2026-05-16.md:12-15` · `:205` |
| **ไม่มีไฟล์ผลรันแม้แต่ไฟล์เดียว** | pattern: `find . -name "load-test-results-*" -o -name "*k6*result*" -o -name "*k6*.json"` (ตัด node_modules) = **0 hit** · ใน `evidence/` ไม่มีโฟลเดอร์ load/k6/perf |
| เอกสารภายในยอมรับเองว่ายังไม่ได้ทดสอบโหลด | `docs/releases/go-live-gate-2026-06-02.md:120` ("no load test required for 1 farm") · `docs/audit/2026-04-30-workflow-gap-analysis.md:213` ("no load testing; recommendations assume current N (~30 in-flight applications, ~28 staff users, single tenant)") |

**คำตอบที่พูดได้**: "**ยังไม่ได้วัด** เรามีแผนและสคริปต์ทดสอบโหลดพร้อมแล้ว ตั้งเป้าไว้ที่ผู้ยื่นพร้อมกัน 1,000 ราย และเจ้าหน้าที่ 50 คน แต่ยังไม่ได้รันจริงจึงยังไม่มีตัวเลขที่ยืนยันได้ · ปริมาณที่ระบบรองรับอยู่ตอนนี้ตามที่บันทึกไว้คือระดับคำขอราว 30 รายการที่กำลังดำเนินการ และเจ้าหน้าที่ราว 28 คน"

## Q5. เชื่อมระบบยืนยันตัวตนกลาง (Health ID / Provider ID / ThaID) แล้วหรือยัง

**คำตอบ: ยัง**

| ประเด็น | หลักฐาน |
|---|---|
| provider จริงทั้ง 3 ตัว default = `coming_soon` | `apps/backend/config/auth-providers.js:26-32` (`healthid: 'coming_soon'`, `providerid: 'coming_soon'`, `thaid: 'coming_soon'`) |
| เหตุผลที่ระบุในโค้ด: **ยังไม่ได้รับ credentials จริง (ธง B1-CRED)** | `apps/backend/config/auth-providers.js:12` |
| fail-closed 2 ชั้น: (1) ค่านอก vocab → `coming_soon` (2) env ไม่ครบ → `coming_soon` แม้ตั้งเป็น enabled | `apps/backend/config/auth-providers.js:105-109` · `:112-122` โดยเฉพาะ `:118-119` |
| env ที่ต้องครบก่อน enable ได้จริง (healthid 6 ตัว, providerid 9 ตัว, thaid 6 ตัว) | `apps/backend/config/auth-providers.js:52-72` |
| **ยืนยันว่า staging/production ยังไม่ตั้ง env เหล่านี้เลย** | pattern: `grep -n "AUTH_HEALTHID\|AUTH_PROVIDERID\|AUTH_THAID\|AUTH_.*_STATE" docker-compose.staging.yml docker-compose.production.yml` = **0 hit ทั้งสองไฟล์** ⇒ ทั้งสาม provider คงค่า default `coming_soon` |
| `mock` ไม่มีทาง enabled บน production (บังคับใน logic) | `apps/backend/config/auth-providers.js:115-117` |
| ที่เดินได้จริงตอนนี้: `local` (enabled, TRANSITIONAL) + `mock` (enabled เฉพาะ non-production) | `apps/backend/config/auth-providers.js:27,31` · `:11` |
| error code เมื่อผู้ใช้กด provider ที่ยัง coming_soon | `apps/backend/shared/error-codes.js:2378` (`AUTH_PROVIDER_DISABLED`) · `apps/backend/config/auth-providers.js:189` |

**คำตอบที่พูดได้**: "**ยังไม่ได้เชื่อม** ทั้งสามช่องทางอยู่ในสถานะ 'เตรียมเปิด' เพราะยังไม่ได้รับข้อมูลรับรอง (client id/secret และ endpoint) จากหน่วยงานเจ้าของระบบ · โครงสร้างฝั่งเราพร้อมแล้ว ระบบออกแบบให้เปิดได้ด้วยการตั้งค่าอย่างเดียวไม่ต้องแก้โค้ด และถ้าตั้งค่าไม่ครบระบบจะไม่ยอมเปิดให้เอง (กันการเปิดค้างครึ่ง ๆ) · วันนี้ที่ใช้สาธิตคือบัญชีภายในของระบบ"

## Q6. ข้อมูลไปหา DTAM Next อย่างไร

**ตรวจก่อนตอบแล้ว — คำตอบคือ: มีของครบแต่ยัง dormant (ยังไม่มีใครเรียกได้จริง)**

| ประเด็น | หลักฐาน |
|---|---|
| ทิศทางเป็น **pull** ไม่ใช่ push — DTAM Next เป็นฝ่ายเรียก API ของเรา ไม่มีโค้ดยิงออกไปหา DTAM Next | route ทั้งหมดเป็น `router.get`/`router.post` ที่รับเข้า: `apps/backend/routes/api/integration/interoperability.js:90,97,104,157,168,179,197,228,266,285,339,392,445,470` |
| mount จริงที่ `/api/interoperability` | `apps/backend/routes/api/index.js:334` |
| endpoint ที่มีข้อมูล **ทุกตัว** อยู่หลัง `requirePartnerApiKey` | `apps/backend/routes/api/integration/interoperability.js:104` (e-certificate), `:197` (signed-envelope), `:285` (trust/registry), `:339` (trust/revocations), `:445` (universal resolve), `:470` (trace events) |
| middleware **fail-closed**: ไม่มี key ที่ตั้งไว้ = ปฏิเสธทุก request | `apps/backend/middleware/partner-api-key.js:16-18` (comment) · `:28-29` (`if (!raw) { return {}; }`) · `:61-68` (ไม่ match → 401 `PARTNER_KEY_INVALID`) |
| **key ยังไม่ถูกตั้งค่าทั้ง staging และ production** — compose ส่งต่อ env แบบ default ว่าง และ `.env.production.example` ก็ว่าง | `docker-compose.staging.yml:134` (`INTEROP_PARTNER_API_KEYS=${INTEROP_PARTNER_API_KEYS:-}`) · `docker-compose.production.yml:188` (เหมือนกัน) · `.env.production.example:117` (`INTEROP_PARTNER_API_KEYS=` ไม่มีค่า) · `.env.local.example:119` เป็นบรรทัด comment |
| ⇒ **สรุป: dormant** — โค้ด mount แล้ว แต่ partner ทุกรายจะได้ 401 จนกว่าจะมีการออกกุญแจ | สรุปจาก 3 แถวบน |
| endpoint ที่ **เปิดสาธารณะจริง** (ไม่ต้องมี key) คือชุดตรวจสอบใบรับรอง + สัญญาข้อมูล + public key + verify signature | `apps/backend/routes/api/integration/interoperability.js:90,97` (data/event contracts), `:157,168,179` (verify), `:228` (signatures/verify), `:266` (trust/public-key) |
| มี audit trail ของการเข้าถึงโดย partner (เตรียมไว้แล้ว) | `apps/backend/services/partner-access-log.js:4` · schema: `apps/backend/prisma/schema/trace.prisma:262` · migration: `apps/backend/prisma/migrations/20260708150000_partner_access_logs/migration.sql:1` |
| มี rate limit แยกต่อ partner (bucket key ต่อ partner) | `apps/backend/middleware/rate-limiter.js:64` · `apps/backend/routes/api/integration/interoperability.js:64,66` |
| PDPA hygiene: ตัดชื่อผู้ซื้อออกจาก trace event ที่ส่งให้ partner | `apps/backend/routes/api/interoperability/interoperability-trace-events.js:228` |

**คำตอบที่พูดได้**: "เราเตรียมช่องทางเชื่อมข้อมูลแบบหน่วยงานต่อหน่วยงานไว้แล้ว ทั้งการดึงใบรับรอง ทะเบียนความน่าเชื่อถือ รายการเพิกถอน และการสืบย้อน โดยฝั่ง DTAM Next เป็นผู้เรียกเข้ามาพร้อมกุญแจประจำหน่วยงาน · **ตอนนี้ยังไม่เปิดใช้จริง เพราะยังไม่ได้ออกกุญแจให้หน่วยงานใด** ระบบตั้งค่าให้ปฏิเสธทุกคำขอไว้ก่อนจนกว่าจะมีการออกกุญแจอย่างเป็นทางการ · ระบบบันทึกทุกครั้งที่มีการดึงข้อมูลไว้เป็นหลักฐานแล้ว"

## Q7 (คำถามที่เพิ่มเอง — ถ้อยคำที่ operator ตัดสินแล้ว). จ่ายเงินออนไลน์ได้ไหม

**คำตอบ: "ยังไม่เปิด ปัจจุบันใช้โอนและส่งสลิป"**

| หลักฐาน | file:line |
|---|---|
| flag backend ปิด: ต้องเป็นสตริง `'true'` เท่านั้น | `apps/backend/config/stripe.js:34-36` (`return process.env.STRIPE_CHECKOUT_ENABLED === 'true'`) |
| ค่าเริ่มต้นที่ประกาศไว้คือ `"false"` | `apps/backend/.env.example:180` (`STRIPE_CHECKOUT_ENABLED="false"`) |
| endpoint ตอบ 503 เมื่อ flag ปิด | `apps/backend/routes/api/finance/payments.js:409-417` (`STRIPE_CHECKOUT_DISABLED`) |
| flag frontend ปิด (fail-closed) | `apps/web-app/src/lib/config/checkout-mode.ts:42-44` |
| ปุ่มเข้า checkout ซ่อนอยู่หลัง flag นั้น | `apps/web-app/src/app/health/payments/client-view.tsx:298` (`{isCheckoutUiEnabled() && !loading && activeApplicationId ? (`) |
| **ไม่มี env Stripe ใด ๆ ใน compose ทั้งสองไฟล์** | pattern: `grep -n "STRIPE\|stripe" docker-compose.staging.yml docker-compose.production.yml` = **0 hit ทั้งสองไฟล์** |
| **ไม่มี `STRIPE_CHECKOUT_ENABLED` / `NEXT_PUBLIC_CHECKOUT_UI_ENABLED` / `PAYMENT_ADAPTER` ใน compose หรือ `.env.*.example` ระดับ repo root** | pattern: `grep -n "CHECKOUT\|PAYMENT_ADAPTER" docker-compose.staging.yml docker-compose.production.yml .env.production.example .env.local.example` = **0 hit** |
| edge ชำระเงินในเครื่องสถานะเป็นของ webhook (SYSTEM) เท่านั้น ⇒ ถ้าไม่มี Stripe ก็เดินเส้นนี้ไม่ได้ | `apps/backend/services/workflow-transition-service.js:167-171` |
| เส้นที่ **เปิดจริง**: ผู้ยื่นอัปสลิป → เจ้าหน้าที่บัญชีตรวจ | `apps/backend/services/workflow-transition-service.js:97-98` (HEALTH ถือ `PENDING_*_FEE->PHASE_*_SLIP_UNDER_REVIEW`) · `:100-105` (ACCOUNT ถือการอนุมัติ/ปฏิเสธสลิป) · route: `apps/backend/routes/api/index.js:158` (`/payments/slip`) |

**⚠️ ข้อควรระวังที่ต้องบอก operator — ผมพบว่าคำอ้าง "ไม่มีหน้าจอชำระเงินฝั่งผู้ใช้" ในโจทย์ไม่ตรงกับของจริง**
- **หน้าจอชำระเงินออนไลน์มีอยู่จริงและ route เข้าถึงได้ตรง ๆ**: `apps/web-app/src/app/health/payments/checkout/page.tsx` · metadata title = `'ชำระเงินออนไลน์ | GACP'` (`:5`)
- **`page.tsx` ไม่มีการเช็ก flag ใด ๆ** — เรนเดอร์ `<ClientView />` ทันทีที่ `:16-18` · flag คุมแค่ "ปุ่มลิงก์เข้า" ที่หน้ารายการชำระเงิน ไม่ได้คุมตัว route
- `client-view.tsx` ก็ไม่ self-gate (pattern: `grep -n "isCheckoutUiEnabled\|notFound\|redirect" apps/web-app/src/app/health/payments/checkout/client-view.tsx` = **0 hit**)
- ผลจริงเมื่อพิมพ์ URL ตรง: หน้าเรนเดอร์ กดสร้างรายการ → backend ตอบ 503 → FE แปลเป็นไทยว่า "ระบบชำระเงินออนไลน์ยังไม่เปิดใช้งาน กรุณาชำระผ่านช่องทางเดิม..." (`apps/web-app/src/app/health/payments/checkout/client-view.tsx:66-67`) ⇒ **ไม่ถึงขั้นพัง แต่ผู้ชมจะเห็นหน้าชื่อ "ชำระเงินออนไลน์" ที่ใช้ไม่ได้** ⇒ ใส่ไว้ในรายการห้ามโชว์
- **ถ้อยคำ "ยังไม่เปิด ปัจจุบันใช้โอนและส่งสลิป" ยังถูกต้อง 100%** และ **ห้ามพูดว่า "รองรับ Stripe แล้ว"** ทุกรูปประโยค — ยืนยันแล้วว่า env ไม่มีทั้ง staging และ production

---

# ข้อ 7 — ห้ามโชว์

## 7.1 flow ที่ตันกลางทาง (จากข้อ 2 ฉ)

1. **ห้ามเดโมการปล่อยให้คำขอ "หมดอายุ" จากขั้นรอชำระเงิน** — `PENDING_DOC_FEE` / `PENDING_AUDIT_FEE` ไม่มีทางไป `EXPIRED` (`apps/backend/services/workflow-transition-service.js:54,62`)
2. **ห้ามเดโมการเลื่อน/นัดลงพื้นที่ใหม่หลังเข้าขั้น CAR** — `CAR_REVIEWING` กลับไป `AUDIT_CONFIRMED` ไม่ได้ (`:67`)
3. **ห้ามเดโมการยกเลิกนัดตรวจ** — `AUDIT_CONFIRMED` ไม่มี edge ยกเลิก/หมดอายุ (`:65`)
4. **ห้ามเดโมการปฏิเสธคำขอในขั้นตรวจเอกสาร** — `REJECTED` เข้าได้จาก `AUDIT_CONFIRMED` ทางเดียว (`:65`, อธิบายไว้ที่ `apps/backend/routes/api/provider/work.js:53-58`)
5. **ห้ามเดโมการยกเลิกคำขอโดยผู้ยื่นเอง** — ไม่มี edge นี้ในระบบ (`:48`, `:93-99`)
6. **ห้ามพาไปเส้นชำระเงินออนไลน์** — จบที่ 503 (`apps/backend/routes/api/finance/payments.js:409-417`)
7. **ห้ามอ้างสถานะ "ยกเลิก/หมดอายุ" (`CANCEL_EXPIRED`)** ว่าใช้งานได้ — ไม่มีทางไปถึง (`apps/backend/shared/status-machine-contract.js:55` vs `apps/backend/services/workflow-transition-service.js:83`)
8. **ห้ามเดโมการเพิกถอนใบรับรองแล้วกลับไปดูหน้าคำขอ** — สถานะคำขอยังเป็น "ได้รับใบรับรอง" (`apps/backend/services/workflow-transition-service.js:70` vs `apps/backend/routes/api/integration/interoperability.js:392-410`)

## 7.2 หน้าที่ยังไม่เสร็จ / อยู่หลัง flag ที่ปิด

| ห้ามโชว์ | เหตุผล + file:line |
|---|---|
| `/health/payments/checkout` (ชื่อหน้า "ชำระเงินออนไลน์") | route เข้าถึงได้ตรงโดยไม่ผ่าน flag: `apps/web-app/src/app/health/payments/checkout/page.tsx:5,16-18` · backend ตอบ 503: `apps/backend/routes/api/finance/payments.js:409-417` |
| **การเดโมจาก dev server เครื่องนี้ (`apps/web-app/.next` ที่ build ไว้ 2026-08-02 23:27)** | build artifact ท้องถิ่น (gitignored ที่ `apps/web-app/.gitignore:20`, ไม่มี `BUILD_ID` ⇒ `next dev`) ฝังค่า `isCheckoutUiEnabled() { return "true" === 'true'; }` และ `getCheckoutApiMode() { const raw = ("mock" ?? 0).trim(); }` ไว้แล้ว (`apps/web-app/.next/server/app/health/payments/checkout/page.js:1128`) ⇒ **ถ้าสาธิตจากเครื่องนี้ ผู้ชมจะเห็นระบบชำระเงินออนไลน์เปิดอยู่ในโหมด mock = "จ่ายสำเร็จ" ทั้งที่ไม่มีเงินเคลื่อนไหวจริง** — ขัดกับคำตอบ Q7 โดยตรง · **ต้องสาธิตจาก staging เท่านั้น** |
| ปุ่ม/เมนูช่องทางเข้าสู่ระบบด้วย Health ID / Provider ID / ThaID | ทั้งสามยัง `coming_soon`: `apps/backend/config/auth-providers.js:26-32` + ไม่มี env ใน compose (grep = 0 hit) |
| หน้า `/health/export-documents` รายการที่ติดสถานะ `coming_soon` | `apps/web-app/src/app/health/export-documents/client-view.tsx:63,86,97` และตัวเรนเดอร์ที่ `:175` |
| `/api-docs` และ `/api-docs/swagger.json` บน staging | เปิดสาธารณะเพราะ `NODE_ENV=staging`: `apps/backend/server.js:351-357` + `docker-compose.staging.yml:64` |

## 7.3 ข้อมูลจริงของบุคคลจริง — บนจอ / ใน screenshot / ใน URL

| ห้ามโชว์ | หลักฐาน | ระดับ |
|---|---|---|
| **ภาพ `08-public-dynamic/01-verify-cert.png` ของ PR #686** — หมวดนี้ชื่อเต็มว่า "หน้าสาธารณะ (**ข้อมูลจริง**)" และภาพชื่อ "ผลตรวจสอบใบรับรอง**จริง** (GACP-TH-2569-EE29D0)" | `git show a406eaf9:docs/screenshots/full-system-2026-07-16/INDEX.md` บรรทัด `1129` (หัวข้อ), `1131` (ชื่อภาพ), `1133` (`Route: /verify/GACP-TH-2569-EE29D0`), `1135` (แทรกภาพ) · run-log entry เดียวกันใน `run-log.json` | **สูงมาก** |
| หน้านั้นแสดง **ชื่อแปลงและจังหวัดของแปลงจริงแบบเต็ม** (นามสกุลผู้ขอถูก mask แต่ชื่อแปลงไม่ถูก) | `apps/backend/routes/api/auth/public.js:144` (`farmName`), `:155` (`province`), `:148` (mask เฉพาะ applicantName) | สูงมาก |
| **URL ใน INDEX.md ของ #686 มี UUID ของ record จริงบน staging 40 รายการ** — คำขอ, ใบรับรอง, สถานประกอบการ, รอบปลูก, แบบสำรวจ | ตัวอย่างจาก `INDEX.md:408,414,420,426` (`/health/applications/4cea3568-1fe9-46dc-80f1-a65258e99902` + `/preview` `/edit` `/car`) · เพิ่มเติมใน run-log: `/health/certificates/ee47ff3f-e85f-4cb1-9f4f-f58e153f2a98`, `/health/establishments/cfbc92fe-cb64-4d13-ac24-d807822186a0`, `/health/planting/7409f85a-0a7c-4b8b-ba56-8863aff396d6`, `/health/surveys/32042e1d-60ca-49e2-aa87-b85385e9ec02` | **สูงมาก** — ตรงกับข้อห้าม "ทั้งใน URL ที่อาจติดไปกับภาพ" |
| ⇒ **ห้ามแจก PR #686 ทั้งก้อนให้บุคคลภายนอกในสภาพปัจจุบัน** — ต้องตัดหมวด 08 ออก และล้าง UUID ใน INDEX/run-log ก่อน | สรุปจาก 3 แถวบน | — |
| **เลขประจำตัวเจ้าหน้าที่ทรงซ้ำ (`2222222222222` ฯลฯ) โผล่บนจอในหน้านัดหมาย** — เป็นข้อมูลปลอมจึงไม่ผิด PDPA แต่ทำให้ผู้ชมเข้าใจว่าเป็นข้อมูลจริงที่กรอกมั่ว | `apps/web-app/src/app/provider/calendar/client-view.tsx:103` + `apps/backend/prisma/seed-gacp.js:96,104,123,131` | สูง |
| **หน้าโปรไฟล์เจ้าหน้าที่แสดง Provider ID เต็มไม่ mask** — ถ้าเดโมด้วยบัญชีของเจ้าหน้าที่จริง เลขบัตรประชาชน 13 หลักจะขึ้นจอ | `apps/web-app/src/app/provider/profile/page.tsx:196` (ไม่มีการ mask ต่างจาก `apps/backend/services/customer-statement-service.js:176` ที่ mask เป็น `1234*******23`) | **สูงมาก ถ้าใช้บัญชีจริง** |
| **ห้ามเปิด DevTools / ห้ามให้ผู้ชมเห็น response ดิบ** ระหว่างเดโมบน staging | stack trace เต็มอยู่ใน `details.stack` ของทุก 5xx: `apps/backend/server.js:78,419` + `docker-compose.staging.yml:64,173` | สูง |
| **ห้ามรัน `scripts/db/seed-test-accounts.js`** ก่อนหรือระหว่างเดโม | ชื่อ-นามสกุลที่ seed จะเป็น `?????` (ไฟล์ไม่ใช่ UTF-8, 723 ไบต์ `?`): `scripts/db/seed-test-accounts.js:76` และทั้งไฟล์ · และหัวไฟล์สอนให้ ssh เข้า production: `:13-15` | **สูงมาก** |

---

# ขอบเขตที่ตรวจ + สิ่งที่ตรวจไม่ได้

## ตรวจแล้ว (พร้อมวิธี)

| ขอบเขต | วิธี |
|---|---|
| state machine ครบทุก edge + role owner + terminal + reachability | `require()` ตัว `workflow-transition-service.js` เข้ามาใน node แล้วคำนวณ incoming/owner/terminal จริง ไม่ได้อ่านเอา |
| orphan API route scanner | รันสคริปต์จริง + จำลอง walker ด้วย node เพื่อวัดจำนวนไฟล์ที่ถูกประเมินจริง (1/181) |
| CI checker ที่รันได้แบบ read-only 5 ตัว | `check-orphan-api-routes`, `check-mojibake-encoding`, `check-thai-copy-style`, `check-i18n-reachability`, `check-banned-terms`, `check-ui-a11y-baseline` — รันจริงทั้งหมดในเซสชันนี้ |
| dead internal link ฝั่ง FE | สคริปต์ python ใน scratchpad: สร้าง route set จาก `page.tsx`/`route.ts` (รองรับ route group + dynamic) แล้วจับคู่กับ `href`/`push`/`replace` ทุกจุดใน `apps/web-app/src` |
| encoding ของไฟล์ seed | `file` + `od -c` + python byte-level decode |
| PR #686 | อ่าน tree/INDEX/run-log จาก object ท้องถิ่น `a406eaf9` (มีอยู่แล้ว ไม่ต้อง fetch) + `git log --since=2026-07-16` ต่อกลุ่มไฟล์ + เทียบ 180 `finalPath` กับ route set ปัจจุบัน |
| flag/env ของ Stripe, checkout, auth provider, interop | grep ตรงใน `docker-compose.staging.yml`, `docker-compose.production.yml`, `.env.production.example`, `.env.local.example`, `apps/backend/.env.example` |

## ตรวจไม่ได้ และเพราะอะไร

| สิ่งที่ตรวจไม่ได้ | เหตุผล | ผลกระทบต่อความมั่นใจของรายงาน |
|---|---|---|
| **หน้าจอจริงบนมือถือ** (viewport meta ที่ Next inject จริง, การล้นแนวนอนของ `grid-cols-3`, ตาราง 7 จุดในหมวด ค-7) | ห้ามยิง staging + ห้ามรัน playwright + ไม่ build | หมวด ค เป็น **ความเสี่ยงจาก markup ไม่ใช่ผลวัด** — ข้อ ค-1, ค-5, ค-7 ต้องยืนยันด้วยการเปิดจอจริงก่อนสรุป |
| **สถานะ env จริงบน staging host** (มีการตั้ง `INTEROP_PARTNER_API_KEYS`, `STRIPE_*`, `AUTH_*_STATE` ผ่าน `.env` บนเครื่องหรือไม่) | ไม่มีสิทธิ์เข้า host และห้ามยิง HTTP | ทุกข้อสรุปเรื่อง flag อ้างอิงจาก **compose + .env.example ในรีโป** เท่านั้น · ถ้าบนเครื่อง staging มีไฟล์ `.env` ที่ตั้งค่าไว้ ผลจะต่างออกไป — **ต้องให้ operator ยืนยันด้วยการดู env จริงบนเครื่อง** |
| **`NODE_ENV` ที่ container backend-staging รันจริง** | อ่านได้จาก compose (`=staging`) แต่ยืนยัน runtime ไม่ได้ | ง-1/ง-2 (stack trace + swagger เปิด) เป็นข้อสรุปจาก compose — **operator ควรยืนยันด้วยการเรียก 1 endpoint ที่ error แล้วดูว่ามี `details.stack` ไหม** |
| **ข้อมูลจริงบน staging DB** (มีคำขอสถานะไหนบ้าง, ชื่อจริงบุคคลจริงหรือไม่) | อ่าน DB ไม่ได้ | หมวด จ ตอบได้ว่า "โผล่บนจอตรงไหน" แต่ตอบไม่ได้ว่า "ตอนนี้บน staging มีค่าอะไรอยู่" — ทับกับข้อ 4 ที่อีกคนทำ |
| **ผล E2E / screenshot ปัจจุบัน** | ห้ามถ่ายใหม่รอบนี้ตามคำสั่ง | ข้อ 3 ประเมินความล้าสมัยได้ แต่ไม่มีภาพใหม่มาเทียบ |
| **PR #686 บน GitHub (สถานะ CI ปัจจุบัน, comment)** | ห้ามรัน git ที่เปลี่ยนสถานะ จึงไม่ fetch | ใช้ object ท้องถิ่นแทน ซึ่งเพียงพอสำหรับการตัดสินเรื่องความล้าสมัย · แต่ **CI ชุดปัจจุบัน 24 checks ยังไม่ได้รันกับใบนี้** (ตรงกับ `evidence/STALE-PR-REVIEW-2026-08-04.md:142`) |
| **ตัวเลข ratchet ปัจจุบัน** | ไม่ได้รัน `scripts/check-done.sh` (งานนี้ไม่ได้แก้โค้ด จึงไม่มี ratchet delta) | — |
| **inventory cron ครบทุกตัว + ช่วงเวลาปลอดภัยที่สุด** | เป็นข้อ 8 ของอีกคน | ผมแตะเฉพาะ cron ที่เกี่ยวกับ flow ตัน (`apps/backend/jobs/scheduler.js:30` รายชั่วโมงนาที 15, `:186` PDPA 02:30) ไม่ได้ทำ inventory ครบ |

## สิ่งที่ไม่ได้ทำตามข้อห้าม
- **ไม่ได้แก้ไฟล์ใดในรีโป** — คำสั่งที่รันมีแต่ `git status/log/show/ls-tree/cat-file/ls-remote/merge-base/branch`, `node <ci-script>`, `grep`, `find`, `ls`, `file`, `od`, `awk`, `sed -n`, `python3 -` (heredoc, อ่านอย่างเดียว) · `git status --porcelain` ว่างตลอด
- **ไม่ได้แก้ปัญหาที่ตรวจพบแม้แต่ข้อเดียว** — ทุกข้อเป็นรายงานล้วน
- **ไม่ได้รันคำสั่ง git ที่เปลี่ยนสถานะ** — ไม่ `fetch` ไม่ `checkout` ไม่ `add` ไม่ `stash`
- **ไม่ได้ยิง HTTP ไป staging/production**
- **ไม่ได้รัน playwright / ไม่ได้ถ่าย screenshot ใหม่**
- ไฟล์ชั่วคราวที่สร้าง อยู่นอกรีโปทั้งหมด: `<scratchpad>/686-runlog.json`, `<scratchpad>/DEMO-READINESS-B.md`

---

## ภาคผนวก — การตรวจซ้ำโดย orchestrator

เอกสาร A และ B เขียนโดย sub-agent คนละคน · orchestrator สุ่มตรวจ `file:line` เอง **8 จุดต่อฉบับ**
โดยเปิดไฟล์จริงในทรี ไม่ใช่อ่านรายงานแล้วเชื่อ

### ครึ่ง B — 4 จุดที่ผลกระทบสูงสุด

| จุด | อ้างว่า | อ่านจริงได้ | ผล |
|---|---|---|---|
| `apps/backend/server.js:78` + `docker-compose.staging.yml:64,173` + `server.js:419` | staging ส่ง stack trace กลับ client | `const isProduction = process.env.NODE_ENV === 'production';` · compose ตั้ง `NODE_ENV=staging` สองที่ · `details: !isProduction && err.stack ? { stack: err.stack } : null` | **ตรง — เงื่อนไขเป็นจริงเสมอบน staging** |
| `apps/backend/server.js:418` | `messageTh` เป็นอังกฤษ | `messageTh: statusCode >= 500 ? 'Internal server error' : null,` | ตรง |
| `apps/web-app/src/app/health/payments/checkout/page.tsx` | เปิดตรงได้ ไม่มี flag กั้น | ทั้งไฟล์ 20 บรรทัด ไม่มี gate ใด ๆ มีแต่ metadata กับ render `<ClientView />` | ตรง |
| `scripts/db/seed-test-accounts.js` | encoding พังทั้งไฟล์ และ gate ไม่จับ | `file` → `Non-ISO extended-ASCII text` (อีกไฟล์เป็น `UTF-8 text`) · นับ `?` ได้ **723 ตัว** · `:76` = `firstName: '?????'` · `node scripts/ci/check-mojibake-encoding.js` → **`PASS: no mojibake markers or UTF-8 BOM files found`** | **ตรง — gate ตาบอดจริง** |
| `docs/screenshots/full-system-2026-07-16/INDEX.md:1129-1135` (#686) | มีข้อมูลจริงในแพ็กภาพ | `## หน้าสาธารณะ (ข้อมูลจริง)` · `### ผลตรวจสอบใบรับรองจริง (GACP-TH-2569-EE29D0)` · `Route: /verify/GACP-TH-2569-EE29D0` | ตรง |

### ครึ่ง A — 5 จุด

| จุด | อ้างว่า | อ่านจริงได้ | ผล |
|---|---|---|---|
| `deploy/nginx/gacp-platform.conf:71-73,74` | default-deny + QR สาธารณะเข้าไม่ถึง | `default 1;` และคอมเมนต์เหนือมันเขียนเองว่า *"several surfaces that are the point of the platform, including public QR certificate verification, are unreachable while this is 1"* | ตรง |
| `docker-compose.staging.yml:177` | คอมเมนต์อ้างว่า frontend ใช้ แต่ไม่มีใครอ่าน | บรรทัดนั้นคือ `- NEXT_PUBLIC_ENVIRONMENT=staging  # frontend uses this to colour the topbar etc.` · `grep -rn "NEXT_PUBLIC_ENVIRONMENT" apps/web-app/src` → **0 ผลลัพธ์** | ตรง |
| `apps/backend/scripts/reset-for-handoff.js:8` | ไม่มี confirmation ไม่มี production guard | หัวไฟล์เขียน `Usage (on production server):` พร้อมคำสั่ง `docker exec` · `grep -ci "readline\|confirm\|prompt\|NODE_ENV"` = **0** | ตรง |
| `apps/backend/jobs/scheduler.js:30` + จำนวน job | 11 cron ในไฟล์นี้ + hourly ที่ `:30` | `:30` = `cron.schedule('15 * * * *', async () => {` · `grep -c "cron.schedule"` = **11** | ตรง |
| `apps/backend/prisma/seed-gacp.js:96` + `apps/web-app/src/app/provider/profile/page.tsx:196` | เลขซ้ำโผล่ไม่ mask | `providerId: '1111111111111',` · `<InfoItem label={...} value={profile.providerId || '-'} />` ไม่มีการ mask | ตรง |

**ผลรวม 9/9 ตรง** — ไม่พบ claim ที่อ้างบรรทัดผิด

**หมายเหตุความผิดของ orchestrator เอง**: ตอนตรวจ `seed-test-data.js` ผมเดา path เป็น `apps/backend/prisma/` แล้ว `sed` ไม่เจอไฟล์ · ของจริงคือ `apps/backend/scripts/seed-test-data.js` ซึ่ง**เอกสารเขียนถูกอยู่แล้ว** (`:216`, `:231`) — เป็นความผิดของผมที่เดา path ไม่ใช่ของเอกสาร บันทึกไว้เพราะถ้าไม่เขียน ตารางข้างบนจะดูราบรื่นเกินจริง

### สิ่งที่การตรวจซ้ำนี้ยืนยัน**ไม่ได้**
ตรวจว่า**บรรทัดที่อ้างมีเนื้อหาตามที่เขียน** ไม่ได้ตรวจข้อสรุปเชิงระบบทุกข้อ
ข้อที่ยังไม่ได้ยืนยันเอง: จำนวน UUID ของ record จริงใน #686 (เอกสารระบุ 40 รายการ) · ตาราง cron ครบ 13 ตัว (ยืนยันเฉพาะ 11 ตัวใน `scheduler.js`) · ข้อสรุปเรื่องช่วงเวลาปลอดภัย 13:00-14:45 ICT ซึ่งอิงกับ timezone ที่เอกสารเองระบุว่า **ไม่มี `TZ` ตั้งไว้ทั้งใน compose และ Dockerfile** จึงเป็นการอนุมาน ไม่ใช่ค่าที่อ่านได้
