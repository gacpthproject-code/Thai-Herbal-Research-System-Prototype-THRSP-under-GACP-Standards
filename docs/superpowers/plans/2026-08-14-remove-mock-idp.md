# Remove Mock IdP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ถอนระบบยืนยันตัวตนจำลอง (mock IdP) ชั้นผู้ใช้เห็นออกทั้งหมด โดยย้าย coverage ของเกราะ OAuth ไปพิสูจน์บนเส้น thaid **ก่อน**ลบของเดิม (spec: `docs/superpowers/specs/2026-08-14-remove-mock-idp-design.md`)

**Architecture:** เทสถูกแปลง "พาหนะ" จาก mock → thaid ก่อนเป็นสองงานแรก (เขียวตลอด — พิสูจน์ว่า coverage ไม่ตกก่อนแตะโค้ดจริง) แล้วจึงปัก tombstone pins แบบ RED-first ให้การลบเป็นสิ่งที่ทำให้เทสเขียว จากนั้นลบ backend → frontend → ไฟล์ mock ล้วน ตามลำดับ

**Tech Stack:** Express + supertest + jest (backend) · React 18 createRoot+act (web — **ห้ามใช้ @testing-library** ไม่มีในรีโป) · bash probes

## Global Constraints

- ห้ามมีสตริง "ทดลอง", "จำลอง", "DEMO" render ได้บนหน้า `/auth` ในทุกสถานะ feed (spec §7.1)
- จำนวน `expect(` ใน `auth-idp-routes.test.js` หลังแปลง ≥ ก่อนแปลง — นับจริงเก็บเป็น evidence (spec §4)
- ตัวจำลองระดับ jest (`jest.mock`, `global.fetch` stub) ใช้ได้ — คือ "ชั้นที่ 2" ที่ operator อนุมัติให้คงอยู่
- ทุกคำสั่ง node/jest บน Windows ต้องขึ้นต้น shell ด้วย `export PATH="/c/Program Files/nodejs:$PATH"`
- Tier C (แตะ auth) — **operator merge เท่านั้น** · RED ต้อง paste ก่อนขอ GREEN (CLAUDE.md §5)
- Branch: `feat/remove-mock-idp` แตกจาก `main` ล่าสุด
- ห้ามแตะ: เส้น providerid (`auth-idp-routes.test.js:443-505`), เส้น local/healthid, describe thaid state เดิม (507-549), `middleware/idp-rate-limit.js` (generic อยู่แล้ว — แก้เฉพาะ path ตัวอย่างในเทสของมัน)

---

### Task 1: แปลงพาหนะเทส authorize-url + state anti-CSRF จาก mock → thaid (เขียวตลอด)

**Files:**
- Modify: `apps/backend/__tests__/unit/auth-idp-routes.test.js:95-117` (helpers), `:158-207` (describe authorize-url), `:209-297` (describe state anti-CSRF)

**Interfaces:**
- Produces: `setFullThaidEnv()` (ตั้ง env thaid ครบ 8 ตัว รวม STATE=enabled), `beginFlow(app, provider = 'thaid')` (default เปลี่ยนจาก 'mock'), `mockResolveThaidLogin`, `mockDecodeSubject` — Task 2 ใช้ทั้งสี่ตัวนี้ตามชื่อนี้เป๊ะ

- [ ] **Step 1: เพิ่ม helper + jest.mock ของ thaid-identity-service** — วางถัดจาก `setFullProviderIdEnv` (หลังบรรทัด 106) และวาง jest.mock ไว้กับกลุ่ม jest.mock อื่น (หลังบรรทัด 61):

```js
// ค่า placeholder ล้วน — ไม่ใช่ credential จริง (B1-CRED); โครงเดียวกับ setFullProviderIdEnv
function setFullThaidEnv() {
    process.env.AUTH_THAID_STATE = 'enabled';
    process.env.AUTH_THAID_CLIENT_ID = 'test-thaid-client';
    process.env.AUTH_THAID_CLIENT_SECRET = 'test-thaid-client-secret-value';
    process.env.AUTH_THAID_REDIRECT_URI = 'https://gacp.example/auth/callback/thaid';
    process.env.AUTH_THAID_AUTHORIZE_URL = 'https://thaid.example/api/v2/oauth2/auth/';
    process.env.AUTH_THAID_TOKEN_URL = 'https://thaid.example/api/v2/oauth2/token/';
    process.env.AUTH_THAID_INTROSPECT_URL = 'https://thaid.example/api/v2/oauth2/introspect/';
    process.env.AUTH_THAID_SCOPE = 'pid given_name family_name';
}
```

```js
// route-level suite: identity policy ของ thaid มี suite ของตัวเองแล้ว — ที่นี่
// mock ทั้ง service เพื่อทดสอบว่า ROUTE ทำอะไรกับผลลัพธ์/error ของมัน
const mockResolveThaidLogin = jest.fn();
const mockDecodeSubject = jest.fn();
jest.mock('../../services/auth/thaid-identity-service', () => ({
    resolveThaidLogin: (...a) => mockResolveThaidLogin(...a),
    decodeIdTokenSubject: (...a) => mockDecodeSubject(...a),
}));
```

- [ ] **Step 2: เปลี่ยน default พาหนะ** — บรรทัด 109: `async function beginFlow(app, provider = 'mock')` → `provider = 'thaid'`
- [ ] **Step 3: แปลง describe authorize-url (158-207)**
  - เคส 171 (`mock บน NODE_ENV=production → 503`): **ลบทิ้ง** (Task 3 มี tombstone แทน)
  - เคส 178 (SECRET หาย): เพิ่ม `setFullThaidEnv();` บรรทัดแรก แล้วยิง `/api/auth/idp/thaid/authorize-url` (เดิมยิง mock)
  - เคส 185 + 199: เพิ่ม `setFullThaidEnv();` บรรทัดแรก · เปลี่ยนชื่อเคส 185 เป็น `'thaid enabled → 200 {authorizeUrl} + state ≥256bit + httpOnly cookie อายุ ≤10 นาที'` · assertion เดิมคงทุกตัว (adapter thaid จริงประกอบ URL จาก env — ไม่มี network ในขานี้)
- [ ] **Step 4: แปลง describe state anti-CSRF (209-297)** — ทุกเคสเพิ่ม `setFullThaidEnv();` เป็นบรรทัดแรก (beginFlow ใช้ default ใหม่แล้ว) · เคส (ค) single-use (235): รอบแรกหลัง state ผ่านจะไปถึง `adapter.exchangeCode` — stub ก่อนยิงรอบแรก:

```js
global.fetch.mockResolvedValueOnce(jsonResponse(401, { error: 'access_denied' }));
```

  รอบแรก assert `expect(first.status).toBe(403)` (ผ่านชั้น state ไปตายที่ IdP — พิสูจน์ว่า state ถูกบริโภคแล้ว) · รอบสอง (ไม่ต้อง stub — ตายก่อนถึง adapter) assert `AUTH_STATE_INVALID` เหมือนเดิม
- [ ] **Step 5: รันทั้ง suite ต้องเขียว (การแปลงห้ามเปลี่ยนพฤติกรรมที่ assert)**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && cd apps/backend && npx jest __tests__/unit/auth-idp-routes.test.js 2>&1 | tail -8`
Expected: PASS ทุกเคส (เคสที่ยังเป็น mock ในไฟล์ก็ยังเขียว — โค้ด mock ยังอยู่)
- [ ] **Step 6: Commit** — `git add apps/backend/__tests__/unit/auth-idp-routes.test.js && git commit -m "test(auth): move authorize-url + state anti-CSRF coverage onto the thaid vehicle"`

---

### Task 2: แปลงเทสเส้น session (mock callback describe + audit describe) → thaid

**Files:**
- Modify: `apps/backend/__tests__/unit/auth-idp-routes.test.js:299-441` (describe mock callback), `:551-589` (describe audit), `:58-75` (ลบ helper mock)

**Interfaces:**
- Consumes: `setFullThaidEnv()`, `beginFlow(app)`, `mockResolveThaidLogin`, `mockDecodeSubject`, `STAFF_ROW`, `jsonResponse`, `findAuditCall`, `mockIssueTokens`, `mockPrismaUser`, `sha256` — ทั้งหมดจาก Task 1/ของเดิม

- [ ] **Step 1: เขียน describe ใหม่แทนที่ 299-441 ทั้งก้อน** ชื่อ `'POST /api/auth/idp/thaid/callback — เส้น session จริง (แปลงพาหนะจาก mock — coverage เดิมครบ)'` · helper ภายใน describe:

```js
const THAID_TOKEN_BODY = {
    access_token: 'thaid-access-token', token_type: 'Bearer', expire_in: 300,
    id_token: 'h.p.s', pid: '1234567890123',
    given_name: 'สมศรี', family_name: 'ทดสอบระบบ',
};
async function beginThaidCallback(app, { fetchStatus = 200, fetchBody = THAID_TOKEN_BODY } = {}) {
    setFullThaidEnv();
    const { stateCookie, state } = await beginFlow(app);
    global.fetch.mockResolvedValueOnce(jsonResponse(fetchStatus, fetchBody));
    return request(app).post('/api/auth/idp/thaid/callback')
        .set('Cookie', stateCookie).send({ code: 'real-code-from-redirect', state });
}
```

  เคสในก้อน (พฤติกรรมเดิม → พาหนะใหม่ ตามเกณฑ์ spec §3):
  1. **ไม่มี code (state ผ่าน) → 400 VALIDATION_ERROR** — `setFullThaidEnv(); beginFlow; POST {state}` ไม่มี code (ไม่ stub fetch — ตายก่อนถึง adapter) · assert เดิม
  2. **happy → 200 + provider_token httpOnly cookie + mint ผ่าน issueTokensForAuthenticatedUser**:

```js
mockDecodeSubject.mockReturnValue('thaid-subject-1');
mockResolveThaidLogin.mockResolvedValue(STAFF_ROW);
mockIssueTokens.mockResolvedValue({ token: 'signed-provider-jwt' });
const res = await beginThaidCallback(app);
expect(res.status).toBe(200);
const cookie = (res.headers['set-cookie'] || []).find((c) => c.startsWith('provider_token='));
expect(cookie).toMatch(/HttpOnly/i);
expect(mockResolveThaidLogin).toHaveBeenCalledWith({
    subject: 'thaid-subject-1', nationalId: '1234567890123',
    firstNameTh: 'สมศรี', lastNameTh: 'ทดสอบระบบ',
});
expect(mockIssueTokens).toHaveBeenCalledWith(STAFF_ROW, expect.any(Object));
expect(res.body.data.user.role).toBe('AUDITOR');
```

  3. **happy → body ไม่มี token (E-4)** — stub ชุดเดียวกับข้อ 2 แล้ว: `const body = JSON.stringify(res.body); expect(body).not.toContain('signed-provider-jwt'); expect(body).not.toMatch(/access_token|refresh/i);`
  4. **ทะเบียนไม่พบ (service ปฏิเสธ fail-closed) → 403 + ไม่มี create/upsert/mint + audit FAILURE**:

```js
mockDecodeSubject.mockReturnValue('thaid-subject-1');
mockResolveThaidLogin.mockRejectedValue(Object.assign(
    new Error('citizen auto-provision is disabled here'),
    { code: 'AUTH_AUTOPROVISION_DISABLED' },
));
const res = await beginThaidCallback(app);
expect(res.status).toBe(403);
expect(res.body.code).toBe('AUTH_AUTOPROVISION_DISABLED');
expect(mockPrismaUser.create).not.toHaveBeenCalled();
expect(mockPrismaUser.upsert).not.toHaveBeenCalled();
expect(mockIssueTokens).not.toHaveBeenCalled();
expect(findAuditCall('FAILURE', 'AUTH_AUTOPROVISION_DISABLED')).toBeTruthy();
```

  5. **status ไม่ ACTIVE → 403 ACCOUNT_INACTIVE ไม่ mint** — `mockResolveThaidLogin.mockResolvedValue({ ...STAFF_ROW, status: 'SUSPENDED' });` + `mockDecodeSubject.mockReturnValue('thaid-subject-1');` → assert 403 + `res.body.code === 'ACCOUNT_INACTIVE'` + `mockIssueTokens` ไม่ถูกเรียก + `findAuditCall('FAILURE', 'ACCOUNT_INACTIVE')`
  6. **ผู้ใช้กดปฏิเสธ → 403 AUTH_IDP_ACCESS_DENIED + audit FAILURE** — `beginThaidCallback(app, { fetchStatus: 401, fetchBody: { error: 'access_denied' } })` → assert 403 + code + `findAuditCall('FAILURE', 'AUTH_IDP_ACCESS_DENIED')`
  7. **code ถูก IdP ปฏิเสธ → 401 AUTH_IDP_CODE_INVALID** — `{ fetchStatus: 400, fetchBody: { error: 'invalid_request' } }` → assert 401 + code (พฤติกรรมเดิมของเคส expired: "code ใช้ไม่ได้ = ปฏิเสธก่อน mint")
  8. **id_token ไม่มี subject → 502 AUTH_IDP_PROFILE_INCOMPLETE + audit FAILURE** — stub happy body แต่ `mockDecodeSubject.mockReturnValue(null);` → assert 502 + code + `findAuditCall('FAILURE', 'PROFILE_INCOMPLETE')`

- [ ] **Step 2: แปลง describe audit (551-589)** — เคส 552: ใช้ stub ชุด happy ข้างบน แล้ว assert เดิมทั้งหมดโดยเปลี่ยน subject: `IDP_LOGIN_SUCCESS` + `metadata.subjectHash === sha256('thaid-subject-1')` + `JSON.stringify(call[6])` ไม่มี `'thaid-subject-1'` ดิบและไม่มี `'1234567890123'` · เคส 575 (ทุกเส้นล้มเหลวมี IDP_LOGIN_FAILURE): เปลี่ยน setup ภายในจาก mock fixtures → ยิง 3 เส้นแทน: deny (ข้อ 6), state ผิด (POST callback state มั่ว), no-subject (ข้อ 8) — วนแล้ว assert `findAuditCall('FAILURE')` มีอย่างน้อยหนึ่งรายการต่อเส้น
- [ ] **Step 3: ลบซาก mock ในไฟล์เทส** — บรรทัด 64 (`MOCK_FIXTURE_CODES` import), 72-75 (`mockHashCidOf`), 58-61 (`mockFindByHash` + jest.mock provider-user-service — ผู้ใช้เดียวคือเคส mock ที่เพิ่งแทนที่)
- [ ] **Step 4: รัน suite ต้องเขียวทั้งไฟล์** — คำสั่งเดียวกับ Task 1 Step 5 · Expected: PASS (โค้ด mock ฝั่ง prod ยังอยู่ — เทสที่เหลือไม่ได้เรียกมันแล้ว)
- [ ] **Step 5: นับ assertion เก็บ evidence** —

Run: `git show main:apps/backend/__tests__/unit/auth-idp-routes.test.js | grep -c "expect(" && grep -c "expect(" apps/backend/__tests__/unit/auth-idp-routes.test.js`
Expected: ตัวเลขหลัง ≥ ตัวเลขก่อน — เก็บ output ลง `evidence/remove-mock-idp/assertion-count.txt`
- [ ] **Step 6: Commit** — `git add -A apps/backend/__tests__ evidence/remove-mock-idp && git commit -m "test(auth): move the OAuth session coverage onto the thaid vehicle — assertion count kept"`

---

### Task 3: Tombstone pins — RED ก่อนลบ

**Files:**
- Modify: `apps/backend/__tests__/unit/auth-idp-routes.test.js` (แทนเคส 171+300 เดิมที่ลบไป), `apps/backend/__tests__/unit/auth-providers-config.test.js:37,75-77,85-114,217,241-269`, `apps/backend/__tests__/unit/auth-idp-providers-endpoint.test.js:37`

> **แก้รายการหลัง implement (audit 2026-08-14 MINOR — รายการเดิมผิดข้อเท็จจริง):** การลบโค้ด mock
> ใน Task 4 ทำให้ต้องแตะไฟล์เทสอีก **สาม** ไฟล์ที่ไม่มีในรายการเดิม — จดไว้ให้ blast radius ตรงจริง:
> - `apps/backend/__tests__/unit/idp-adapter.test.js` — import mock adapter ที่ `:21` ⇒ suite crash ตั้งแต่ load ถ้าไม่แก้ (เอาเฉพาะเคสที่เป็นพฤติกรรมของ mock ออก: `expect(` 91 → 60; เส้นกลาง AUTH_PROVIDER_DISABLED ยังอยู่ที่ `:110`)
> - `apps/backend/__tests__/unit/identity-provider-naming-collision.test.js` — sanity floor พึ่ง token `provider_id` ใน mock-idp-adapter.js:69 ที่ถูกลบ
> - `apps/backend/__tests__/unit/oauth-clientid-hardcode-guard.test.js` — sanity floor พึ่ง literal `client_id` ใน MOCK_DEFAULTS ที่ถูกลบ
>
> สองไฟล์หลังถูก **ปล่อยแดง** ใน commit `b11e7f49` แล้วซ่อมในคอมมิต "fix: act on the T3T4 audit" (ดู Task 4 Step 5b)
> · ไฟล์ประกอบที่แตะด้วย: `BACKLOG-FOUND.md`, `evidence/remove-mock-idp/*`

- [ ] **Step 1: เขียน tombstone ใน auth-idp-routes.test.js** (วางท้าย describe authorize-url):

```js
it("tombstone: 'mock' ไม่อยู่ใน registry แล้ว → 503 ทั้งสอง endpoint (operator 2026-08-14)", async () => {
    const app = buildApp();
    const a = await request(app).post('/api/auth/idp/mock/authorize-url');
    expect(a.status).toBe(503);
    expect(a.body.code).toBe('AUTH_PROVIDER_DISABLED');
    const b = await request(app).post('/api/auth/idp/mock/callback').send({});
    expect(b.status).toBe(503);
});
```

- [ ] **Step 2: แก้ list expectations เป็นโลกไม่มี mock**
  - `auth-providers-config.test.js:75-77`: `toEqual(['local', 'healthid', 'providerid', 'thaid'])` ทั้งสองบรรทัด + เพิ่ม `expect(PROVIDER_KEYS).not.toContain('mock');`
  - `auth-idp-providers-endpoint.test.js:37`: `toEqual(['healthid', 'local', 'providerid', 'thaid'])`
  - เคสพฤติกรรมเฉพาะ mock ใน config test (85, 93, 107-109, 113-114, 217, 241, 252, 261, 269): **ลบเคส/บรรทัด** — ยกเว้นเคส `|| isStagingSlot()` ที่ใช้ thaid เป็นพาหนะอยู่แล้ว (คงไว้) · เคสไหนเทสพฤติกรรมกลาง (state จาก env, fail-closed เมื่อ env ไม่ครบ) แต่ใช้ mock เป็นพาหนะ → เปลี่ยนพาหนะเป็น thaid + `setFullThaidEnv` ภายในเคส
- [ ] **Step 3: รันสามไฟล์ — ต้อง RED เฉพาะ tombstone/list** —

Run: `npx jest __tests__/unit/auth-idp-routes.test.js __tests__/unit/auth-providers-config.test.js __tests__/unit/auth-idp-providers-endpoint.test.js 2>&1 | tail -12`
Expected: FAIL — tombstone (mock ยัง enabled = 200) + list ยังมี 'mock' · **paste output ลง `evidence/remove-mock-idp/red-backend.txt`** (Tier C: RED ก่อน GREEN)
- [ ] **Step 4: Commit ร่วมกับ Task 4** (RED+GREEN อยู่ commit เดียว — ดู Task 4 Step 6)

---

### Task 4: ลบ mock ฝั่ง backend

**Files:**
- Delete: `apps/backend/services/auth/idp/mock-idp-adapter.js`
- Modify: `apps/backend/routes/api/auth/auth-idp.js` (docblock 17, 29-34 · resolveMockSession 185-251 · branch 475-477), `apps/backend/services/auth/idp/idp-adapter.js:23,42-46`, `apps/backend/config/auth-providers.js:13-14,23,34,42,57,82-89,116-122,148,195-196,227,232`, `apps/backend/.env.example:194`, `apps/backend/__tests__/unit/idp-adapter.test.js` (บังคับ — import ที่ `:21` ตายพร้อมโมดูล), `apps/backend/__tests__/unit/identity-provider-naming-collision.test.js` + `apps/backend/__tests__/unit/oauth-clientid-hardcode-guard.test.js` (sanity floor ของทั้งคู่พึ่ง specimen ที่ถูกลบ — ดูกล่องใน Task 3)

- [ ] **Step 1: auth-idp.js** — ลบฟังก์ชัน `resolveMockSession` ทั้งก้อนพร้อม docblock (185-251) · ลบ `if (provider === 'mock') { return await resolveMockSession(req, res, profile, subjectHash); }` (475-477) · docblock หัวไฟล์: ลบ bullet mock (30-34) และตัด ", mock สำหรับ non-prod" (17)
- [ ] **Step 2: idp-adapter.js** — ลบ branch `if (providerKey === 'mock')` (42-44) + บรรทัดคอมเมนต์ 23 · แก้ข้อความ error (46): `(providerid|thaid)`
- [ ] **Step 3: config/auth-providers.js** — `PROVIDER_KEYS` → `['local', 'healthid', 'providerid', 'thaid']` · ลบ key `mock` จาก `DEFAULT_STATE`(34), `STATE_ENV`(42), `REQUIRED_ENV`(57) · ลบ `MOCK_DEFAULTS` ทั้งก้อน (82-89) และ branch `if (key === 'mock')` (195-196) · ลบ `isMockLockedOut` (116-122) กับ call sites (148, 232 — เงื่อนไขเหลือแค่ตัวถัดไป) · แก้คอมเมนต์ 13-14, 227 ไม่ให้พูดถึง mock **ระวัง:** `isStagingSlot()` ยังถูกใช้โดย state `staging_only` — ห้ามลบ
- [ ] **Step 4: `.env.example`** — ลบบรรทัด `# AUTH_MOCK_STATE=""`
- [ ] **Step 5: รันเทส backend ที่แตะทั้งหมด — ต้องเขียวหมดรวม tombstone** —

Run: `npx jest __tests__/unit/auth-idp-routes.test.js __tests__/unit/auth-providers-config.test.js __tests__/unit/auth-idp-providers-endpoint.test.js __tests__/unit/idp-rate-limit.test.js 2>&1 | tail -8`
Expected: PASS ทั้งหมด
- [ ] **Step 5b (เพิ่มหลัง audit 2026-08-14): ซ่อม sanity floor สองตัวที่เสีย specimen ไปพร้อม mock** — การลบ mock ทำให้ non-vacuity floor ของสอง guard แดง และ "ผ่อนให้เขียว" จะทำให้ทั้งคู่เขียวแบบว่าง · แทน specimen ที่หายด้วยของที่แข็งกว่า: ปลูก specimen เอง แล้วบังคับให้ pipeline ตัวจริงจับให้ได้ (ไม่ใช่รอให้โค้ด production บังเอิญมีตัวอย่าง) · เงื่อนไขผ่าน = mutation test: ทำลาย regex/walker ทีละชิ้นแล้ว floor ต้องแดงทุกชิ้น (เก็บลง `evidence/remove-mock-idp/mutation-floor.txt`)

Run: `npx jest __tests__/unit/identity-provider-naming-collision.test.js __tests__/unit/oauth-clientid-hardcode-guard.test.js 2>&1 | tail -6`
Expected: PASS ทั้งสอง suite
- [ ] **Step 6: Commit** — `git add -A apps/backend evidence/remove-mock-idp && git commit -m "feat(auth): remove the mock IdP from the backend — tombstones RED then GREEN"`

---

### Task 5: หน้า /auth — reverse pin แล้วรื้อแถบ DEMO

**Files:**
- Modify: `apps/web-app/src/app/auth/_components/__tests__/login-chooser.test.tsx:209-224,333-376`, `apps/web-app/src/app/auth/_components/login-chooser.tsx:55,231-240,291,312-331,503-529` (+import `PlayCircle` ถ้าไม่มีผู้ใช้อื่น)

- [ ] **Step 1: เขียน reverse pin (RED)** — แทนเคส 209-224 สองเคส และ**แทนเนื้อใน describe 333-376** (โครง demoContainer/demoRoot คงไว้ใช้ต่อ) ด้วยชุดนี้:

```tsx
const FORBIDDEN = ['ทดลอง', 'จำลอง', 'DEMO'];
async function expectNoDemoCopy() {
    for (const word of FORBIDDEN) {
        expect(demoContainer!.textContent).not.toContain(word);
    }
}
// feed stub แบบเดียวกับที่ describe หลักใช้: fetch คืน payload ทะเบียน provider
function stubFeed(data: unknown) {
    global.fetch = jest.fn(() =>
        Promise.resolve({ ok: true, json: () => Promise.resolve({ data }) }),
    ) as unknown as typeof fetch;
}
it('stale backend ที่ยังส่ง mock:enabled มา — หน้าต้องไม่ render คำต้องห้ามใด ๆ', async () => {
    stubFeed({ providers: [
        { key: 'thaid', state: 'coming_soon', enabled: false },
        { key: 'healthid', state: 'coming_soon', enabled: false },
        { key: 'local', state: 'enabled', enabled: true },
        { key: 'mock', state: 'enabled', enabled: true },
    ] });
    await mountBare();
    await expectNoDemoCopy();
});
it('ทุกสถานะ feed (loading / error / ปกติ) — ไม่มีคำต้องห้าม', async () => {
    // loading: fetch ไม่ resolve
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    await mountBare();
    await expectNoDemoCopy();
});
```

  (`mountBare` = helper ที่ describe 333-376 มีอยู่แล้ว · `stubFeed` = โค้ดข้างบน วางใน describe เดียวกัน)
- [ ] **Step 2: รันต้อง RED** —

Run: `cd apps/web-app && npx jest src/app/auth/_components/__tests__/login-chooser.test.tsx 2>&1 | tail -8`
Expected: FAIL — เคส stale-backend เจอ "ทดลองระบบ (DEMO)" · paste ลง `evidence/remove-mock-idp/red-chooser.txt`
- [ ] **Step 3: รื้อ chooser** — ลบบรรทัด 55 (`MOCK_KEY`) · ลบ `mock:` ออกจาก `BLOCKER` (235) และตัด `| typeof MOCK_KEY` ทั้งสามจุด (231, 240, 314) · ลบ 326-331 (`mockStatus`/`showDemo`) · ลบ JSX 503-529 ทั้งก้อน · ลบ `PlayCircle` จาก import lucide ถ้าไม่เหลือผู้ใช้ · แก้คอมเมนต์ 291 ตัด "including the demo mock"
- [ ] **Step 4: รันเขียว + tsc** —

Run: `npx jest src/app/auth 2>&1 | tail -6 && npx tsc --noEmit 2>&1 | tail -3`
Expected: PASS ทั้งโฟลเดอร์ · tsc = 0 error
- [ ] **Step 5: Commit** — `git add -A apps/web-app/src/app/auth && git commit -m "feat(web): the /auth chooser drops the DEMO strip — reverse pin holds every feed state"`

---

### Task 6: ลบไฟล์ mock ล้วนฝั่ง web + ล้าง path ตัวอย่าง + ประตู grep

**Files:**
- Delete: `apps/web-app/src/app/auth/mock-idp/` (ทั้ง directory: authorize/page.tsx, callback/page.tsx, __tests__/mock-idp-pages.test.tsx), `apps/web-app/src/lib/navigation.ts`
- Modify: `apps/backend/__tests__/unit/idp-rate-limit.test.js:48-55`

- [ ] **Step 1: ลบ directory + navigation.ts** — `git rm -r apps/web-app/src/app/auth/mock-idp apps/web-app/src/lib/navigation.ts`
- [ ] **Step 2: แก้ path ตัวอย่างใน idp-rate-limit.test.js** — บรรทัด 48-55: `/mock/authorize-url|/mock/callback|/mock/anything` → `/thaid/authorize-url|/thaid/callback|/thaid/anything` (ทั้งด้านยิงและด้าน expect — middleware เป็น generic ไม่แตะ)
- [ ] **Step 3: ประตู grep (spec §7.5)** —

Run: `grep -rn "mock-idp\|MOCK_KEY\|MOCK_FIXTURE_CODES\|resolveMockSession\|AUTH_MOCK_STATE\|hardNavigate" apps/ | grep -v node_modules`
Expected: **0 บรรทัด** — เก็บ output (ว่าง) ลง `evidence/remove-mock-idp/grep-clean.txt` ด้วย `... || echo "CLEAN: no matches"`
- [ ] **Step 4: รันชุดเต็มฝั่งที่แตะ + ratchet** —

Run: `cd apps/web-app && npx jest src/app/auth 2>&1 | tail -4 && npx tsc --noEmit 2>&1 | tail -2 && cd ../backend && npx jest __tests__/unit 2>&1 | tail -6 && cd ../.. && bash scripts/probes/ratchet.sh 2>&1 | tail -3`
Expected: เขียวหมด · ratchet PASS (ตัวนับมีแต่ลดหรือเท่าเดิม)
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(web): delete the mock consent pages — nothing simulated is reachable anywhere"`

---

### Task 7: Evidence + gate + ส่งมอบ

**Files:**
- Create: `evidence/remove-mock-idp/INDEX.md`

- [ ] **Step 1: เขียน INDEX.md** — ตาราง: spec AC ทั้ง 7 ข้อ → หลักฐานชี้ไฟล์/output (AC1-6 จาก session นี้ · AC7 = ช่องว่างรอ operator เดินจริงหลัง deploy พร้อมชื่อภาพ)
- [ ] **Step 2: full gate (fallback ช่วง Actions ล็อก)** —

Run: `LOCAL_GATE_FULL=1 bash scripts/ci/local-gate.sh 2>&1 | tail -20`
Expected: ไม่มี failure ใหม่เทียบ main (main baseline เขียวตั้งแต่ scan-tests batch) — ถ้ามี suite แดงที่ไม่แตะงานนี้ ให้บันทึกใน INDEX.md ว่าแดงบน main ด้วยหรือไม่ พร้อมหลักฐาน
- [ ] **Step 3: ลบ branch โมฆะ** — `git push origin --delete fix/seed-mock-demo-officer && git branch -D fix/seed-mock-demo-officer` (spec §1 ประกาศโมฆะแล้ว)
- [ ] **Step 4: push + tier-check + รายงาน §6 + ขอ operator merge (Tier C)** — แนบ: RED สองไฟล์, assertion-count, grep-clean, ผล gate · หลัง merge: กล่อง rebuild+deploy จาก runbook `docs/operations/runbooks/build-images-on-the-box.md` แล้ว operator เดิน AC7 (เพิ่มพนักงานผ่าน `/provider/management` → ล็อกอินรหัสผ่าน → ภาพเข้า view-pack)
