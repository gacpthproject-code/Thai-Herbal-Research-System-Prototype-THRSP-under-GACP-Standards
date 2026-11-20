# Login Front Door Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make /auth the front door everyone sees, with every OAuth button's state read live from the backend registry — ThaID/หมอพร้อม primary per ministry mandate, mock demo on staging, nothing hardcoded.

**Architecture:** One new states-only GET endpoint exposes `getAuthProviders()` (which was written for exactly this and never mounted). The chooser fetches it, renders enabled/coming_soon per provider, and generalises its existing ThaID handler to every provider through the same authorize-url flow. A staging slot marker lets the registry's mock provider enable on the staging box (which runs NODE_ENV=production) without weakening the real-production lockout. The marketing root becomes a redirect to /auth.

**Tech Stack:** Express + supertest (backend unit), Next.js App Router + RTL/jest (web-app), docker-compose staging overlay, deploy per `docs/operations/runbooks/build-images-on-the-box.md`.

**Spec:** `docs/superpowers/specs/2026-08-14-login-front-door-design.md` (operator-approved 2026-08-14)

## Global Constraints

- **Run `bash scripts/probes/tier-check.sh` AFTER committing each task** — it reads the committed diff, not the index; staged-only answers `(no changed files) TIER=A`, which is silence, not a tier.
- **RED before GREEN on every behavior change** (CLAUDE.md §5 ชั้น B) — run the failing test, keep the output.
- **`deploy-drift` is now a blocking ci probe.** Every merge to main turns the gate red until staging is rebuilt+redeployed (~2 min warm). The plan therefore ends with the deploy box, and intermediate commits stay on the feature branch.
- **Windows dev machine:** prefix bash commands with `export PATH="/c/Program Files/nodejs:$PATH"`; jest runs here (proven), Docker does not.
- **States only, never config:** the new endpoint must expose `{key, state}` and nothing else — `getProviderConfig()` carries secrets and is backend-internal (`auth-providers.js:163` comment, pinned by `auth-providers-config.test.js`).
- **The real-production mock lockout must survive:** after Task 2, `NODE_ENV=production` WITHOUT the staging slot marker must still force mock to `coming_soon`, and `docker-compose.production.yml` must never contain the marker — both pinned by tests.

---

## File Structure

| File | |
|---|---|
| `apps/backend/routes/api/auth/auth-idp.js` | **modify** — add `GET /providers` (~10 lines) |
| `apps/backend/__tests__/unit/auth-idp-providers-endpoint.test.js` | **create** |
| `apps/backend/config/auth-providers.js` | **modify** — staging-slot awareness for mock/staging_only |
| `apps/backend/__tests__/unit/auth-providers-config.test.js` | **modify** — slot cases |
| `apps/backend/__tests__/unit/staging-slot-compose-pin.test.js` | **create** — compose files pin |
| `docker-compose.staging.yml` | **modify** — `GACP_DEPLOY_SLOT=staging` on backend-staging |
| `apps/web-app/src/app/auth/_components/login-chooser.tsx` | **modify** — state-driven |
| `apps/web-app/src/app/auth/_components/__tests__/login-chooser.test.tsx` | **modify** — state matrix |
| `apps/web-app/src/app/(marketing)/page.tsx` | **replace** — `redirect('/auth')` |

---

### Task 1: `GET /api/auth/idp/providers`

**Files:**
- Create: `apps/backend/__tests__/unit/auth-idp-providers-endpoint.test.js`
- Modify: `apps/backend/routes/api/auth/auth-idp.js`

**Interfaces:**
- Consumes: `getAuthProviders()` from `config/auth-providers.js:150` → `[{key, state}]`.
- Produces: `GET /api/auth/idp/providers` → `200 {"success":true,"data":{"providers":[{"key":"local","state":"enabled"},...]}}`. Task 3's chooser consumes this shape verbatim.

- [ ] **Step 1: Write the failing test**

Mirror the mounting idiom of `auth-idp-routes.test.js` (express app + supertest):

```js
'use strict';
/**
 * GET /api/auth/idp/providers — the states-only feed the login chooser renders
 * from. getAuthProviders() (auth-providers.js:150) was documented as "P2
 * endpoint / P4 FE" the day it was written; this is that endpoint, mounted at
 * last. Until it existed the chooser hardcoded THAID_AWAITING_CREDENTIALS=true
 * (login-chooser.tsx:164), so no delivered credential could ever clear a badge.
 *
 * The one property that matters most: STATES ONLY. getProviderConfig() carries
 * client secrets and stays backend-internal; a response that grew a `config`
 * or `url` field would hand the OAuth wiring to every anonymous visitor.
 */
const express = require('express');
const request = require('supertest');

function buildApp() {
    const router = require('../../routes/api/auth/auth-idp');
    const app = express();
    app.use(express.json());
    app.use('/api/auth/idp', router);
    return app;
}

describe('GET /api/auth/idp/providers', () => {
    const saved = { ...process.env };
    afterEach(() => {
        process.env = { ...saved };
        jest.resetModules();
    });

    it('answers 200 with every provider key and its effective state', async () => {
        const res = await request(buildApp()).get('/providers'.replace('/providers', '/api/auth/idp/providers').replace('/api/auth/idp', '')) // supertest hits the app path below
            ;
        const app = buildApp();
        const r = await request(app).get('/api/auth/idp/providers');
        expect(r.status).toBe(200);
        expect(r.body.success).toBe(true);
        const keys = r.body.data.providers.map((p) => p.key).sort();
        expect(keys).toEqual(['healthid', 'local', 'mock', 'providerid', 'thaid']);
        for (const p of r.body.data.providers) {
            expect(['enabled', 'staging_only', 'coming_soon']).toContain(p.state);
        }
    });

    it('reflects the fail-closed resolver, not the raw defaults — thaid without env is coming_soon', async () => {
        delete process.env.AUTH_THAID_CLIENT_ID; // one missing var is enough to fail closed
        jest.resetModules();
        const r = await request(buildApp()).get('/api/auth/idp/providers');
        const thaid = r.body.data.providers.find((p) => p.key === 'thaid');
        expect(thaid.state).toBe('coming_soon');
    });

    it('never leaks anything beyond key and state', async () => {
        const r = await request(buildApp()).get('/api/auth/idp/providers');
        for (const p of r.body.data.providers) {
            expect(Object.keys(p).sort()).toEqual(['key', 'state']);
        }
    });

    it('requires no authentication — the login page has no session yet', async () => {
        const r = await request(buildApp()).get('/api/auth/idp/providers');
        expect(r.status).not.toBe(401);
        expect(r.status).not.toBe(403);
    });
});
```

(ลบบรรทัด `.replace(...)` ที่หลงเหลือจากร่างแรกออกก่อนรัน — assertion จริงคือ `request(app).get('/api/auth/idp/providers')`)

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/backend && npx jest __tests__/unit/auth-idp-providers-endpoint.test.js`
Expected: FAIL — 404 (route not mounted), not a module error.

- [ ] **Step 3: Mount the route**

In `auth-idp.js`, before the two POST routes (so `/providers` cannot be swallowed by `/:provider/...` params):

```js
// States-only feed for the login chooser (mandate P2 endpoint / P4 FE —
// config/auth-providers.js:146-149 documented this consumer the day
// getAuthProviders() was written). No auth: the login page has no session yet.
// No cache: the whole point is that setting AUTH_*_STATE or completing a
// provider's env flips the page without a deploy.
router.get('/providers', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data: { providers: getAuthProviders() } });
});
```

Add `getAuthProviders` to the existing require from `config/auth-providers`.

- [ ] **Step 4: Verify GREEN** — same command, 4 tests pass. Also run `npx jest __tests__/unit/auth-idp-routes.test.js` to prove the param routes did not regress.

- [ ] **Step 5: Commit** — `feat(auth): mount the states-only providers endpoint the registry documented`

---

### Task 2: mock บน staging โดยไม่เจาะ production

**Files:**
- Modify: `apps/backend/config/auth-providers.js:95,119-137`
- Modify: `apps/backend/__tests__/unit/auth-providers-config.test.js`
- Create: `apps/backend/__tests__/unit/staging-slot-compose-pin.test.js`
- Modify: `docker-compose.staging.yml` (backend-staging `environment:`)

**Interfaces:**
- Produces: `GACP_DEPLOY_SLOT=staging` เป็น marker เดียวที่แยก staging ออกจาก production ในโดเมน auth-config · Task 5 ตั้งค่านี้ผ่าน compose overlay เท่านั้น

**ภูมิหลังที่ implementer ต้องรู้:** เครื่อง staging รัน `NODE_ENV=production` ⇒ วันนี้ `isProduction()` (`auth-providers.js:95`) คืน true บน staging ⇒ mock โดนบังคับ `coming_soon` และ `staging_only` ไม่มีทาง enable ที่ไหนเลยนอกเครื่อง dev · invariant ใหม่: **"production = NODE_ENV production และไม่มี slot marker"** โดย marker อยู่ได้เฉพาะใน compose overlay ของ staging ซึ่งเป็นไฟล์ Tier C ที่ operator merge — และมีเทสต์ปักไว้ว่าไฟล์ production ห้ามมี

- [ ] **Step 1: RED — เขียนเคสลง `auth-providers-config.test.js`**

```js
describe('staging slot (GACP_DEPLOY_SLOT)', () => {
    it('mock stays coming_soon under NODE_ENV=production with no slot marker — the real-prod lockout', () => {
        process.env.NODE_ENV = 'production';
        delete process.env.GACP_DEPLOY_SLOT;
        jest.resetModules();
        const { getAuthProviders } = require('../../config/auth-providers');
        expect(getAuthProviders().find((p) => p.key === 'mock').state).toBe('coming_soon');
    });

    it('mock enables on the staging slot even though staging runs NODE_ENV=production', () => {
        process.env.NODE_ENV = 'production';
        process.env.GACP_DEPLOY_SLOT = 'staging';
        jest.resetModules();
        const { isProviderEnabled } = require('../../config/auth-providers');
        expect(isProviderEnabled('mock')).toBe(true);
    });

    it('an unexpected slot value changes nothing — only the exact string counts', () => {
        process.env.NODE_ENV = 'production';
        process.env.GACP_DEPLOY_SLOT = 'staging '; // trailing space: not the marker
        jest.resetModules();
        const { isProviderEnabled } = require('../../config/auth-providers');
        expect(isProviderEnabled('mock')).toBe(false);
    });
});
```

(ทำตาม env-save/restore idiom ที่ไฟล์เทสต์นั้นใช้อยู่แล้ว)

- [ ] **Step 2: Run — ต้องเห็นเคสที่สองล้ม** (mock ยัง coming_soon เพราะโค้ดยังไม่รู้จัก slot) และเคสแรกกับสามผ่าน

- [ ] **Step 3: Implement ใน `auth-providers.js`**

```js
/**
 * The staging box runs NODE_ENV=production (its containers reuse the
 * production compose as a base), so NODE_ENV alone cannot tell the two apart.
 * GACP_DEPLOY_SLOT is set to 'staging' ONLY in docker-compose.staging.yml —
 * an operator-merged Tier C file — and staging-slot-compose-pin.test.js pins
 * that the production compose never carries it. Exact match, no trim: a value
 * that is almost the marker is not the marker.
 */
function isStagingSlot() {
    return process.env.GACP_DEPLOY_SLOT === 'staging';
}
```

แก้สองจุด:
- `getEffectiveState`: `if (key === 'mock' && isProduction() && !isStagingSlot())`
- `stateResolvesEnabled`: `return state === 'staging_only' && (!isProduction() || isStagingSlot());`

เพิ่ม `isStagingSlot` เข้า `module.exports` (ให้เทสต์ compose-pin และผู้ใช้อื่นในโดเมน auth ใช้ตัวเดียวกัน — Law 3.6)

- [ ] **Step 4: GREEN** — ทั้งไฟล์ `auth-providers-config.test.js` ผ่าน รวมเคสเดิมทุกตัว

- [ ] **Step 5: RED — compose pin test ใหม่ `staging-slot-compose-pin.test.js`**

```js
'use strict';
/**
 * The whole safety of the staging slot rests on ONE fact: the marker exists in
 * the staging overlay and nowhere in the production compose. That fact lives
 * in YAML no unit test of auth-providers.js can see, so it is pinned here —
 * the same move as REQUIRED_VOLUMES in gacp-backup.selftest.sh, where the
 * test owns the list instead of deriving it from the thing under test.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

describe('GACP_DEPLOY_SLOT placement', () => {
    it('the staging overlay sets the marker on backend-staging', () => {
        expect(read('docker-compose.staging.yml')).toMatch(/GACP_DEPLOY_SLOT=staging/);
    });

    it('the production compose never mentions the marker at all', () => {
        expect(read('docker-compose.production.yml')).not.toMatch(/GACP_DEPLOY_SLOT/);
    });
});
```

Run: เคสแรก **ต้องล้ม** (ยังไม่ได้แก้ compose) เคสสองผ่าน

- [ ] **Step 6: เพิ่มใน `docker-compose.staging.yml`** ใต้ `environment:` ของ service `backend-staging` (บรรทัดเดียว, คอมเมนต์ชี้มาที่เทสต์ pin):

```yaml
      # Marks this container as the staging slot for auth-providers.js —
      # enables the mock IdP here while NODE_ENV stays production. Pinned by
      # __tests__/unit/staging-slot-compose-pin.test.js: this line must exist
      # here and must never appear in docker-compose.production.yml.
      - GACP_DEPLOY_SLOT=staging
```

- [ ] **Step 7: GREEN ทั้งสองไฟล์เทสต์ → Commit** — `feat(auth): a staging slot marker lets mock enable where NODE_ENV lies`

---

### Task 3: chooser อ่านสถานะจริง

**Files:**
- Modify: `apps/web-app/src/app/auth/_components/login-chooser.tsx`
- Modify: `apps/web-app/src/app/auth/_components/__tests__/login-chooser.test.tsx`

**Interfaces:**
- Consumes: `GET /api/auth/idp/providers` (Task 1 — ผ่าน nginx `/api/auth/` → backend โดยตรง เส้นเดียวกับ `authorize-url` ที่ใช้อยู่แล้วที่ `:175`)
- แผนที่ option → registry key: `health-id→healthid` · `provider-id→providerid` · `thaid-*→thaid`

**สิ่งที่เปลี่ยนใน component (อ่าน `login-chooser.test.tsx` เดิมก่อน แล้วต่อยอด idiom เดียวกัน):**

- [ ] **Step 1: RED — เทสต์ matrix สถานะ** (mock `global.fetch` ตอบ providers ตามเคส):

```tsx
const providersResponse = (states: Record<string, string>) => ({
    ok: true,
    json: async () => ({
        success: true,
        data: { providers: Object.entries(states).map(([key, state]) => ({ key, state })) },
    }),
});

it('enabled provider: no badge, click starts the real authorize flow', async () => {
    global.fetch = jest.fn()
        .mockResolvedValueOnce(providersResponse({ local: 'enabled', healthid: 'enabled', providerid: 'coming_soon', thaid: 'coming_soon', mock: 'coming_soon' }) as never);
    render(<LoginChooser />);
    const healthBtn = await screen.findByRole('button', { name: /เข้าด้วย Health ID/ });
    expect(within(healthBtn).queryByText(/รอการเชื่อมต่อ/)).toBeNull();
});

it('coming_soon provider: visible, badged, and the click opens the waiting dialog naming the blocker', async () => {
    global.fetch = jest.fn()
        .mockResolvedValueOnce(providersResponse({ local: 'enabled', healthid: 'coming_soon', providerid: 'coming_soon', thaid: 'coming_soon', mock: 'coming_soon' }) as never);
    render(<LoginChooser />);
    const thaidBtn = (await screen.findAllByRole('button', { name: /เข้าด้วย ThaID/ }))[0];
    expect(within(thaidBtn).getByText('รอการเชื่อมต่อ')).toBeInTheDocument();
    fireEvent.click(thaidBtn);
    expect(await screen.findByText(/กรมการปกครอง/)).toBeInTheDocument();
});

it('mock enabled: the DEMO strip appears; mock coming_soon: it does not exist at all', async () => { /* two renders, assert presence/absence of 'ทดลองระบบ (DEMO)' */ });

it('fetch failure fails closed: every IdP button shows ตรวจสถานะไม่ได้ and only local login proceeds', async () => {
    global.fetch = jest.fn().mockRejectedValueOnce(new Error('down'));
    render(<LoginChooser />);
    expect(await screen.findAllByText('ตรวจสถานะไม่ได้')).not.toHaveLength(0);
});

it('the hardcoded flag is gone', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'login-chooser.tsx'), 'utf8');
    expect(src).not.toMatch(/THAID_AWAITING_CREDENTIALS/);
});
```

- [ ] **Step 2: รันให้ล้ม** — เคส hardcode-gone ล้มแน่ (flag ยังอยู่) เคส matrix ล้มเพราะ component ไม่ fetch providers

- [ ] **Step 3: Implement**
  1. เพิ่ม `providerKey: 'healthid' | 'providerid' | 'thaid'` ในทุกรายการของ `DOORS[].idpOptions`
  2. ลบ `THAID_AWAITING_CREDENTIALS` (`:164`) · เพิ่ม state:
     `const [providerStates, setProviderStates] = useState<Record<string, string> | null | 'error'>(null)` + `useEffect` fetch `GET /api/auth/idp/providers` → map `{key: state}` · reject/parse-fail → `'error'`
  3. generalise `beginThaid` (`:175`) เป็น `beginIdp(providerKey, label)` — เปลี่ยน URL เป็น `` `/api/auth/idp/${providerKey}/authorize-url` `` พฤติกรรม fallback เดิมคงไว้ทุกบรรทัด
  4. ปุ่ม (`:280-306`): `enabled` → `onClick={() => void beginIdp(option.providerKey, option.label)}` ไม่มีป้าย · `coming_soon` → ป้าย `รอการเชื่อมต่อ` + click เปิด dialog เดิม (`setActiveIdp`) ซึ่งข้อความใน dialog ระบุผู้ที่รอ: thaid = "รอ credentials จากกรมการปกครอง" · healthid/providerid = "รอการอนุมัติเชื่อมต่อจากสำนักสุขภาพดิจิทัล สธ." · `null` (กำลังโหลด) → ปุ่ม disabled ไม่มีป้าย · `'error'` → ป้าย `ตรวจสถานะไม่ได้` + dialog อธิบาย
  5. แถบ DEMO ใต้สอง door — render เฉพาะ `providerStates?.mock === 'enabled' || providerStates?.mock === 'staging_only'` โดยตัดสิน enable ด้วยกติกาเดียวกับปุ่มอื่น: ป้าย **DEMO** เด่น + `beginIdp('mock', 'DEMO')`
  6. ลำดับตามข้อบังคับ (spec §3.5): Health ID/Provider ID เป็น `primary: true` อยู่แล้ว ✓ · local link มี "(ชั่วคราว)" อยู่แล้ว ✓ — เพิ่มบรรทัดใต้ local link: `ช่องทางชั่วคราวระหว่างรอการเชื่อมต่อระบบยืนยันตัวตนกลาง`

- [ ] **Step 4: GREEN + ทั้ง suite เดิมของไฟล์ผ่าน** — `npx jest src/app/auth/_components/__tests__/login-chooser.test.tsx`
- [ ] **Step 5: `npx tsc --noEmit`** exit 0
- [ ] **Step 6: Commit** — `feat(web): the chooser reads provider states from the registry instead of a frozen constant`

---

### Task 4: `/` → `/auth`

**Files:**
- Modify: `apps/web-app/src/app/(marketing)/page.tsx` (แทนทั้งไฟล์)
- Modify: ลิงก์ login ในผิว marketing — หา: `grep -rn "HEALTH_LOGIN_ROUTE\|/auth/health/login" "apps/web-app/src/app/(marketing)" apps/web-app/src/components --include=*.tsx | grep -v __tests__`

- [ ] **Step 1:** แทน `(marketing)/page.tsx` ด้วย:

```tsx
import { redirect } from 'next/navigation';

/**
 * The root IS the login chooser now — operator decision 2026-08-14: ThaID and
 * MorPromt are the ministry-mandated entry paths, so the first thing anyone
 * sees is the door that carries them. The marketing pages remain reachable at
 * their own URLs (/about, /pricing, ...); the retired landing content is
 * queued for the SWEEP ticket rather than deleted here.
 */
export default function RootRedirect() {
    redirect('/auth');
}
```

- [ ] **Step 2:** ลิงก์ที่ grep เจอ ชี้ `/auth` (เว้น breadcrumb ภายในหน้า login เอง)
- [ ] **Step 3:** สวีทเต็ม web-app: baseline เทียบก่อน/หลังตามวิธี Task 2 ของแผน deploy-drift (main ไม่เขียวเสมอ — เกณฑ์คือ "ไม่แย่ลง") · เทสต์ของหน้า marketing เดิมที่ assert เนื้อ landing จะล้ม → **ย้าย/ปรับให้ assert redirect แทน** ระบุไว้ใน commit
- [ ] **Step 4:** `tsc --noEmit` + Commit — `feat(web): the root is the front door`

---

### Task 5: merge → deploy → พิสูจน์บน staging (operator)

> **การคาด tier ในแผนนี้ผิด และ auditor จับได้** (E1 audit#1 CRITICAL): แผนบอกเป็นนัยว่า
> C จะโผล่ครั้งแรกที่ Task 5 ผ่าน compose — ของจริง `tier-check.sh` ตอบ **C ตั้งแต่ Task 1**
> (`apps/backend/routes/api/auth/**` = auth-identity) และ Task 3 ก็ C ด้วยเหตุเดียวกันฝั่ง
> web · orchestrator ที่เชื่อคำคาดของแผนแทนการวัด อาจ merge งาน auth ระดับ C โดยไม่ผ่าน
> operator — นี่คือเหตุผลที่ L5 เขียนว่า "ห้ามประเมินเอง" และแผนนี้ละเมิดเองเป็นตัวอย่าง

- [ ] tier-check หลัง commit สุดท้าย (**วัดแล้ว: C ทั้งใบ ตั้งแต่ Task 1**) ⇒ **operator merge**
- [ ] deploy ตาม runbook `build-images-on-the-box.md` (กล่องเดียวเดิม — rebuild อุ่น + `deploy-staging.sh` + probe)
- [ ] พิสูจน์ผ่านโดเมนจริง:

```bash
curl -s -o /dev/null -w '/ → %{http_code} %{redirect_url}\n' https://staging.gacpth.com/ && curl -sS https://staging.gacpth.com/api/auth/idp/providers
```

  ต้องเห็น `/ → 307 หรือ 308 ...้/auth` และ providers JSON ที่ `mock` เป็น enabled/staging_only · `thaid/healthid/providerid` = `coming_soon`
- [ ] เดินจริงในเบราว์เซอร์ + เก็บ view-pack (HARNESS.md §4.4): ภาพ /auth ป้ายครบสามแบบ · กด DEMO เดินจนเข้าระบบ · `deploy-drift` เขียวฝั่ง staging
- [ ] เมื่อ key จริงมา (วันหน้า): operator ใส่ env 7 ตัวของ thaid ใน `.env.staging` → restart backend-staging → ป้าย ThaID หายเอง **โดยไม่มี commit ใด** — นั่นคือข้อพิสูจน์สุดท้ายของใบนี้

## Self-review notes
- เทสต์ Step 1 ของ Task 1 มีบรรทัดร่างที่ต้องลบ — ระบุไว้ใต้โค้ดแล้ว
- ชื่อ badge สั้น (`รอการเชื่อมต่อ` / `ตรวจสถานะไม่ได้`) เพราะพื้นที่ป้าย 11px — รายละเอียดเต็มอยู่ใน dialog ตาม spec §2.3
- ไม่แตะ `health-login-page` / `provider-login-page` — ยังเป็นปลายทางของ local link ตามเดิม
