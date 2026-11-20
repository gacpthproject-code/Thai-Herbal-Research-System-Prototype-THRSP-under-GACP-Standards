# Revoked / Suspended / Expired Certificate Consequences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "is this under certification?" one live computation read by every planting, harvest, QR and public-trace door, so a revoked / suspended / expired / superseded certificate tells the truth everywhere instead of hiding the farmer's own cycles and painting a green GACP shield for consumers.

**Architecture:** One pure function `certificateCoverage(certificate, options)` in `apps/backend/services/trace-service/common.js` extends the existing `evaluateCertGate` and becomes the single definition. Public trace resolvers gate on it and answer one unified HTTP 410 body; the web trace pages classify that body as a new `'uncovered'` outcome and render a red hero with a verify link instead of "ไม่พบข้อมูล". The planting service stops filtering cycles out of the farmer's list and instead ships a `coverage` object per cycle, while every *new* artefact (cycle, harvest cut, batch, lot, plot QR) requires coverage. Nothing is deleted and no flag is stored: revoke, suspend, reinstate and renew all take effect at read time.

**Tech Stack:** Node 20 + Express + Prisma (`apps/backend`), Next.js 15 App Router + React 19 + Tailwind (`apps/web-app`), Jest for both, Playwright for the G4 walk (`apps/web-app/e2e-g4`).

**Binding spec:** `docs/superpowers/specs/2026-08-28-revoked-certificate-consequences-design.md`
**Research (every file:line re-verified against HEAD — corrections noted per task):** `reports/research/2026-08-28-f-g4-56/facts.md`
**Parent spec:** `docs/superpowers/specs/2026-08-20-planting-tnt-design.md` — R2 `:17`, R3 `:18`, revocation rule `:52`, public page `:76`, cut-date rule `:144`

## Global Constraints

Copied verbatim from the spec (§1, §3, §5, `CLAUDE.md`, `.claude/skills/thai-ui-copy/SKILL.md`, `.claude/skills/gacp-design-tokens/SKILL.md`). **Every task's requirements implicitly include this section.**

- **Coverage is computed live at read time.** Spec §1: "สถานะ 'อยู่ภายใต้การรับรอง' คำนวณสดจากใบรับรอง ณ เวลาที่ถาม ทุกจุด — ไม่มี flag บน cycle/lot/QR ที่ต้องไปตั้งตอน revoke และไม่มีทางเลือกรายใบสำหรับ admin". No denormalised column, no backfill, no migration that stamps state onto cycles / lots / QR seals.
- **No feature flag.** There is no `process.env` switch, no `if (FEATURE_X)`, no gradual rollout. The gate is either the code's behaviour or it is not shipped.
- **No admin per-certificate choice.** Revoke / suspend / reinstate keep exactly the inputs they have today. Nothing gains a "also revoke the QR codes?" option.
- **Nothing is deleted.** Spec §3.1: "ล็อต/QR ที่มีอยู่แล้วไม่ถูกลบ (หลักฐานทาง T&T คงอยู่)". Spec §3.4: "QR seal (`TraceQrSecurity`) คงสถานะ ACTIVE ... ไม่ revoke seal เพราะ reinstate ต้องกลับมาได้เอง". No row is soft-deleted, no `TraceQrSecurity.status` is flipped, no `Plot.qrRevokedAt` is written by this work.
- **`renewed` follows the successor.** Spec §3.5: "cycle ที่ `certificateId` = ใบเก่า และใบเก่ามี `renewedCertificateId` → `certificateCoverage` ตอบ `covered` ตามใบใหม่ (ตามผ่านลิงก์ successor) · ไม่ย้าย FK (ประวัติคงเดิม)". The `PlantingCycle.certificateId` FK is never re-pointed.
- **Thai copy rules.** Address the user as **คุณ**, never ท่าน. **No em dash (—) in Thai strings**; separate clauses with a space. Space between Thai and Latin ("ของ GACP"). Space before ๆ. Every error names **the cause and the next action**, never a bare apology. Dates through `apps/web-app/src/lib/format/thai-date.ts`, never inline `toLocaleDateString('th-TH')`. No `tracking-*`, `uppercase` or `font-black` on Thai-bearing elements (ESLint `apps/web-app/eslint-rules/no-thai-letterspacing.js` enforces it).
- **Design tokens.** Red states use `text-destructive` / `bg-destructive/5` / `border-destructive/20` (the tokens `trace/batch/[qr-code]/client-view.tsx:170-183` already uses), never raw `red-*` in new code. Surfaces `bg-card`, neutrals `text-foreground` / `text-muted-foreground` / `bg-muted`. Action green is the `leaf` token set, never `emerald-*`.
- **The ratchet must not rise.** `bash scripts/check-done.sh ratchet` before and after every task; hardcode / dup-source / todo / env-direct / skip / green-mask counters may fall or stay flat, never rise by even one. No `.skip`, no deleted assertion, no `try {} catch {}` that masks a green.
- **Tier C.** T&T + certificate lifecycle. Full CI green on a runner (or the `LOCAL_GATE_FULL=1 scripts/ci/local-gate.sh` fallback with two review layers), RED pasted before GREEN on every task, full evidence pack, and **the merge is the operator's**. Never self-merge.
- **Jest reads `apps/backend/.env`.** `@prisma/client` loads it, so flags and `DATABASE_URL` leak into unit tests. Pin predicates explicitly inside each test instead of relying on ambient env, and re-run any suite you touch a second time with the relevant flag blanked. Integration suites that self-skip without `DATABASE_URL` count as **not run** — say so rather than claiming a pass.
- **Signing keys must outlive the run.** `npx jest` has previously rotated `apps/backend/keys/*.pem` and voided a live certificate. Before and after any backend test run in T8, record `ls -l apps/backend/keys/*.pem` (mtime) and stop and report if it changed.
- **Full backend suite needs heap.** `NODE_OPTIONS=--max-old-space-size=3072` or it OOMs; `pdf-ssrf` always times out locally and is not your regression.
- **The Playwright walk never writes to the database except through the real UI.** `g4psql()` (`apps/web-app/e2e-g4/g4-helpers.ts:53`) already throws on anything that is not a `SELECT`. Every state change in C07 is a real press on a real page. A public trace page load *does* increment `TraceQrSecurity.scanCount` and write an audit row (`apps/backend/services/qrcode/qrcode-service.js`) — that is a write **through the real UI** and is allowed; a script that mutates rows is not.

---

## File Structure

**Backend — created**

| File | Responsibility |
|---|---|
| `apps/backend/__tests__/unit/certificate-coverage.test.js` | Every reason of `certificateCoverage`, successor follow-through, `asOf` |
| `apps/backend/__tests__/integration/plot-cycle-trace-cert-gate.test.js` | `/api/trace/plot-cycle/:qr` gates like its siblings |
| `apps/backend/__tests__/unit/planting-coverage-list.test.js` | list returns every cycle + coverage; create/harvest/lot/QR require it |
| `apps/backend/__tests__/unit/cancel-uncovered-cycle.test.js` | the cancel door |
| `apps/backend/__tests__/unit/certificate-lifecycle-notifications.test.js` | revoke / suspend / reinstate notify the holder |

**Backend — modified**

| File | Change |
|---|---|
| `services/trace-service/common.js` | add `certificateCoverage` + `resolveCertificateCoverage`, unify the 410 body, delete dead `buildCertificateSnapshot` |
| `services/trace-service/resolve-plot-cycle.js` | select the certificate, gate, drop `verification:{valid:true}` |
| `services/trace-service/resolve-generic.js` | 3 gate sites use the unified body |
| `routes/api/trace/trace-batch-lot-routes.js` | 2 gate sites use the unified body |
| `services/planting-service.js` | stop filtering; ship `coverage`; gate `createCycle`; add `cancelUncoveredCycle` |
| `services/planting-cycle/harvest-capacity-operations.js` | coverage at the cut date |
| `routes/api/cultivation/planting-cycles-activity-harvest-routes.js` | same gate on the legacy door |
| `routes/api/cultivation/planting-cycles.js` | wire the cancel route |
| `routes/api/cultivation/planting-cycles-plot-routes.js` | gate plot-QR generation |
| `routes/api/trace/lots.js` | gate lot creation |
| `services/certificate-service.js` | notify on revoke / suspend / reinstate |
| `services/notification/domain-helpers.js` | `notifyCertificateCoverageChanged` |
| `services/notification-service.js` | 3 `NotifyType` keys |
| `services/planting-cycle-service.js` | delete the two dead guards |
| `shared/error-codes.js` | `CERTIFICATE_NOT_COVERING` |

**Web — created**

| File | Responsibility |
|---|---|
| `src/app/trace/trace-uncovered-copy.ts` | pure reason → Thai copy map (one source for four pages) |
| `src/app/trace/trace-uncovered.tsx` | the red hero + verify link + successor link |
| `src/app/trace/__tests__/trace-uncovered.test.tsx` | copy per reason, links, successor |
| `src/app/health/planting/__tests__/coverage-badge.test.tsx` | the farmer-side label |

**Web — modified:** `src/app/trace/trace-fetch.ts` (+ its test), the four `client-view.tsx` under `src/app/trace/**`, `src/app/health/planting/client-view.tsx`, `src/app/health/planting/new/client-view.tsx`, `src/app/health/planting/[id]/plot-signs/client-view.tsx`, `src/lib/services/planting-service.ts` + `.types.ts`.

**Walk — created:** `apps/web-app/e2e-g4/c07-revoked-certificate-consequences.spec.ts`.

---

## Interfaces (shared across tasks — exact shapes)

Everything below is defined in **Task 1** and **Task 3** and consumed by later tasks verbatim.

```js
/**
 * @typedef {'revoked'|'suspended'|'expired'|'renewed'|'missing'} CoverageReason
 *
 * @typedef {Object} CertificateCoverage
 * @property {boolean}       covered                     true only when the certificate (or its successor) is in force at `asOf`
 * @property {CoverageReason|null} reason                null when covered
 * @property {string|null}   certificateNumber           the number of the certificate that was ASKED about (never the successor's)
 * @property {string|null}   successorCertificateNumber  set only when the asked-about certificate carries a successor
 * @property {string|null}   verifyUrl                   `/verify/<certificateNumber>`, or null when there is no certificate
 * @property {boolean}       gated                       covered === false AND reason !== 'missing' — see the note below
 * @property {(type: string) => object} minimalBody      the unified HTTP 410 body (Task 3)
 */

/** Pure. No I/O. `options.successor` must be pre-loaded by the caller when following a renewal. */
function certificateCoverage(certificate, options = {}) // options: { asOf?: Date|string|null, successor?: object|null }

/** Async companion: loads the successor row when needed, then delegates to the pure function. */
async function resolveCertificateCoverage(certificate, options = {}) // options: { asOf?: Date|string|null, client?: PrismaClient }

/** Kept, unchanged signature, now a thin wrapper. Existing callers and their mocks keep working. */
function evaluateCertGate(cert) // → { gated, isValid, certExpired, status, minimalBody }
```

**Why `gated` is not simply `!covered`:** a trace with **no certificate at all** must keep answering HTTP 200 (an un-certified trace is not a withdrawn one — pinned by `apps/backend/__tests__/integration/generic-trace-cert-gate.test.js:139,152`). So `reason: 'missing'` means `covered:false, gated:false`. Public resolvers branch on `gated`; the planting / harvest / QR doors branch on `covered`.

**The unified HTTP 410 body** (spec §3.2, produced by `coverage.minimalBody(type)`):

```js
{
  success: false,
  type,                                  // 'PLANTING_CYCLE' | 'HARVEST_BATCH' | 'LOT' | 'PLOT_CYCLE'
  code: 'CERTIFICATE_NOT_COVERING',
  reason,                                // 'revoked' | 'suspended' | 'expired' | 'renewed'
  certificateNumber,                     // string
  verifyUrl,                             // '/verify/<certificateNumber>'
  successorCertificateNumber,            // string | null
  verification: { valid: false, scannedAt, reason: `certificate_${reason}` },
  certificate: { reference, status, issuedDate, expiryDate },
  message,                               // reason-specific Thai + ' / ' + English
}
```

No farm, plot, cycle or lot field ever appears in it (spec §3.2: "ไม่เปิดเผยข้อมูลฟาร์ม/แปลง/lot").

**The error code** (Task 9): `CERTIFICATE_NOT_COVERING`, `httpStatus: 409`. Backend doors throw `Object.assign(new Error(th), { code: 'CERTIFICATE_NOT_COVERING', statusCode: 409, reason, certificateNumber, verifyUrl, successorCertificateNumber })`.

**The web outcome** (Task 4), in `apps/web-app/src/app/trace/trace-fetch.ts`:

```ts
export interface TraceUncoveredCoverage {
  reason: 'revoked' | 'suspended' | 'expired' | 'renewed' | 'missing';
  certificateNumber: string | null;
  verifyUrl: string | null;
  successorCertificateNumber: string | null;
}

export type TraceFetchOutcome<T extends TraceEnvelope> =
  | { kind: 'ok'; payload: T }
  | { kind: 'uncovered'; coverage: TraceUncoveredCoverage }
  | { kind: 'not-found'; message: string | null }
  | { kind: 'unavailable' };
```

**The farmer-side coverage object** on every cycle summary (Task 5), JSON-serialised — `minimalBody` is a function and is **not** part of it:

```ts
export type CycleCoverage = {
  covered: boolean;
  reason: 'revoked' | 'suspended' | 'expired' | 'renewed' | 'missing' | null;
  certificateNumber: string | null;
  successorCertificateNumber: string | null;
  verifyUrl: string | null;
};
```

---

## Contradictions found in the spec — DO NOT resolve silently

Raise these with the operator before merging. Each one is implemented below in the conservative direction, and the plan says which.

1. **Cut-date coverage cuts both ways (spec §3.1 vs §3.2 intent).** §3.1 says a harvest cut needs `covered:true` **"ณ วันตัด"** (as at the cut date, quoting parent spec `:144`). Read literally, a farmer under a certificate revoked on 2026-08-27 may still record a harvest back-dated to 2024 — the revocation buys nothing. Read as "and also now", the parent spec's own wording ("ไม่ใช่แค่ active วันนี้" — *not merely* active today) is honoured. **This plan implements BOTH: coverage must hold at `new Date()` AND at the cut date.** Task 5 marks the line.
2. **The C07 press in spec §4(b) needs a door §3.1 closes.** §4 requires a real press: "กดสร้าง cycle ใหม่ใต้ CAE820 → ถูกปฏิเสธด้วยข้อความไทย". But `/health/planting/new` filters the certificate picker to active certificates only (`apps/web-app/src/app/health/planting/new/client-view.tsx:82-91`), so a revoked certificate is unselectable and the refusal is unreachable through the UI. **This plan makes the picker list every certificate of the farm with its coverage label, keeps uncovered ones selectable, and lets the SERVER refuse** — so the press exists and the server stays the only gate. If the operator prefers an unselectable option, C07 step (b) must be rewritten to assert the absence instead.
3. **`buildDormantPlotBody` still hardcodes `verification: { valid: true }`** (`apps/backend/services/trace-service/resolve-plot-cycle.js:222`). Spec §3.2 orders the hardcode removed from the plot resolver but describes only the open-cycle body. A dormant plot has no cycle and therefore no certificate to ask about. **This plan leaves that line alone** (removing it is an unspecified behaviour change) and instead makes the web shield conditional on `data.certificate?.covered === true`, so a dormant plot shows no GACP claim either. Flagged for the operator.
4. **Spec §4 promises a notification press it then forbids.** §4(e) asks C07 to show the in-app notification, then rules: "ห้ามแตะใบจริงเพิ่ม; พิสูจน์ notification ด้วย unit + route test เท่านั้น และระบุใน ledger". **This plan follows the second half:** T8 is proven by tests only, C07 does not press revoke, and the ledger entry records why.
5. **Reason vocabulary vs successor state.** §1 fixes the reason set at `revoked|suspended|expired|renewed|missing`, and §3.5 says a `renewed` certificate answers "ตามใบใหม่". If the successor is itself revoked, the honest reason is `revoked`, not `renewed`. **This plan reports the successor's own reason** and always carries `successorCertificateNumber`, so the page can still offer the forward link. Flagged.

---

### Task 1: `certificateCoverage` — the single definition

**Files:**
- Modify: `apps/backend/services/trace-service/common.js:207-286` (delete `buildCertificateSnapshot` at `:207-220`, add `certificateCoverage` + `resolveCertificateCoverage`, rewrite `evaluateCertGate` at `:242-274` as a wrapper, update `module.exports` at `:288-309`)
- Test: `apps/backend/__tests__/unit/certificate-coverage.test.js` (create)

> **Pointer corrections against HEAD:** facts.md cites `evaluateCertGate` at `common.js:242-274` — correct. `buildCertificateSnapshot` at `:207-220` and its export at `:306` — correct. The file is 309 lines.

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `certificateCoverage(certificate, options)`, `resolveCertificateCoverage(certificate, options)`, both exported from `services/trace-service/common.js`, returning the `CertificateCoverage` shape in the Interfaces section above. `evaluateCertGate(cert)` keeps its old five-key shape (`gated`, `isValid`, `certExpired`, `status`, `minimalBody`) so no existing caller or mock breaks. `minimalBody` is filled in by Task 3 — Task 1 leaves it byte-identical to today's.

- [ ] **Step 1: Write the failing test**

Create `apps/backend/__tests__/unit/certificate-coverage.test.js`:

```js
/**
 * certificateCoverage — the single definition of "is this under certification
 * right now" (spec docs/superpowers/specs/2026-08-28-revoked-certificate-
 * consequences-design.md §1).
 *
 * Pure: no prisma, no clock beyond `asOf`. The DB-import modules call
 * process.exit(1) without DATABASE_URL, so both are mocked before the require.
 */
'use strict';

jest.mock('../../server', () => ({ prisma: {} }));
jest.mock('../../services/prisma-database', () => ({ prisma: {} }));

const { certificateCoverage } = require('../../services/trace-service/common');

const FUTURE = new Date(Date.now() + 365 * 24 * 3600 * 1000);
const PAST = new Date(Date.now() - 24 * 3600 * 1000);

const cert = (over = {}) => ({
    id: 'cert-1',
    certificateNumber: 'GACP-TH-2569-AAAAAA',
    status: 'active',
    expiryDate: FUTURE,
    issuedDate: PAST,
    isDeleted: false,
    revokedAt: null,
    suspendedAt: null,
    reinstatedAt: null,
    renewedCertificateId: null,
    ...over,
});

describe('certificateCoverage', () => {
    it('covers a live certificate and exposes its verify URL', () => {
        const c = certificateCoverage(cert());
        expect(c.covered).toBe(true);
        expect(c.reason).toBeNull();
        expect(c.gated).toBe(false);
        expect(c.certificateNumber).toBe('GACP-TH-2569-AAAAAA');
        expect(c.verifyUrl).toBe('/verify/GACP-TH-2569-AAAAAA');
        expect(c.successorCertificateNumber).toBeNull();
    });

    it("accepts the UPPERCASE spelling too (rows are stored 'active')", () => {
        expect(certificateCoverage(cert({ status: 'ACTIVE' })).covered).toBe(true);
    });

    it('reports revoked', () => {
        const c = certificateCoverage(cert({ status: 'revoked', revokedAt: PAST }));
        expect(c).toMatchObject({ covered: false, reason: 'revoked', gated: true });
    });

    it('reports suspended', () => {
        const c = certificateCoverage(cert({ status: 'suspended', suspendedAt: PAST }));
        expect(c).toMatchObject({ covered: false, reason: 'suspended', gated: true });
    });

    it('reports expired, and expiry beats the status word', () => {
        const c = certificateCoverage(cert({ status: 'active', expiryDate: PAST }));
        expect(c).toMatchObject({ covered: false, reason: 'expired', gated: true });
    });

    it("reports missing for a null certificate, and does NOT gate (an un-certified trace is not a withdrawn one)", () => {
        const c = certificateCoverage(null);
        expect(c).toMatchObject({
            covered: false, reason: 'missing', gated: false,
            certificateNumber: null, verifyUrl: null,
        });
    });

    it('reports renewed with no successor loaded', () => {
        const c = certificateCoverage(cert({ status: 'renewed', renewedCertificateId: 'cert-2' }));
        expect(c).toMatchObject({ covered: false, reason: 'renewed' });
        expect(c.successorCertificateNumber).toBeNull();
    });

    it('follows a renewal to a LIVE successor: covered, but still named by the OLD number', () => {
        const c = certificateCoverage(
            cert({ status: 'renewed', renewedCertificateId: 'cert-2' }),
            { successor: cert({ id: 'cert-2', certificateNumber: 'GACP-TH-2569-BBBBBB' }) },
        );
        expect(c.covered).toBe(true);
        expect(c.reason).toBeNull();
        expect(c.certificateNumber).toBe('GACP-TH-2569-AAAAAA');
        expect(c.successorCertificateNumber).toBe('GACP-TH-2569-BBBBBB');
        expect(c.verifyUrl).toBe('/verify/GACP-TH-2569-AAAAAA');
    });

    it("follows a renewal to a REVOKED successor: reports the successor's own reason, keeps the forward link", () => {
        const c = certificateCoverage(
            cert({ status: 'renewed', renewedCertificateId: 'cert-2' }),
            { successor: cert({ id: 'cert-2', certificateNumber: 'GACP-TH-2569-BBBBBB', status: 'revoked', revokedAt: PAST }) },
        );
        expect(c).toMatchObject({ covered: false, reason: 'revoked' });
        expect(c.successorCertificateNumber).toBe('GACP-TH-2569-BBBBBB');
    });

    it('never follows a second hop (a successor pointing onward is read as-is, not chased)', () => {
        const c = certificateCoverage(
            cert({ status: 'renewed', renewedCertificateId: 'cert-2' }),
            { successor: cert({ id: 'cert-2', certificateNumber: 'GACP-TH-2569-BBBBBB', status: 'renewed', renewedCertificateId: 'cert-3' }) },
        );
        expect(c).toMatchObject({ covered: false, reason: 'renewed' });
    });

    it('treats a soft-deleted certificate as missing', () => {
        expect(certificateCoverage(cert({ isDeleted: true }))).toMatchObject({ reason: 'missing', gated: false });
    });

    describe('asOf — the historical question (parent spec :144)', () => {
        const revokedOn = new Date('2026-08-27T00:00:00Z');
        const revoked = cert({ status: 'revoked', revokedAt: revokedOn });

        it('was covered BEFORE the revocation landed', () => {
            expect(certificateCoverage(revoked, { asOf: new Date('2026-08-01T00:00:00Z') }).covered).toBe(true);
        });

        it('is not covered ON or AFTER the revocation date', () => {
            expect(certificateCoverage(revoked, { asOf: revokedOn }).covered).toBe(false);
            expect(certificateCoverage(revoked, { asOf: new Date('2026-08-28T00:00:00Z') }).reason).toBe('revoked');
        });

        it('a legacy revoked row with no revokedAt is uncovered at every date', () => {
            const legacy = cert({ status: 'revoked', revokedAt: null });
            expect(certificateCoverage(legacy, { asOf: new Date('2020-01-01T00:00:00Z') }).reason).toBe('revoked');
        });

        it('a suspension that was later lifted does not shadow a date after the reinstatement', () => {
            const c = cert({
                status: 'active',
                suspendedAt: new Date('2026-01-01T00:00:00Z'),
                reinstatedAt: new Date('2026-02-01T00:00:00Z'),
            });
            expect(certificateCoverage(c, { asOf: new Date('2026-01-15T00:00:00Z') }).reason).toBe('suspended');
            expect(certificateCoverage(c, { asOf: new Date('2026-03-01T00:00:00Z') }).covered).toBe(true);
        });

        it('expiry is evaluated against asOf, not against today', () => {
            const c = cert({ expiryDate: new Date('2026-06-01T00:00:00Z') });
            expect(certificateCoverage(c, { asOf: new Date('2026-05-01T00:00:00Z') }).covered).toBe(true);
            expect(certificateCoverage(c, { asOf: new Date('2026-07-01T00:00:00Z') }).reason).toBe('expired');
        });
    });
});

describe('evaluateCertGate stays byte-compatible for its existing callers', () => {
    const { evaluateCertGate } = require('../../services/trace-service/common');

    it('keeps the five-key shape', () => {
        const g = evaluateCertGate(cert({ status: 'revoked', revokedAt: PAST }));
        expect(Object.keys(g).sort()).toEqual(['certExpired', 'gated', 'isValid', 'minimalBody', 'status'].sort());
        expect(g.gated).toBe(true);
        expect(g.isValid).toBe(false);
        expect(g.status).toBe('revoked');
    });

    it('a null cert is never gated', () => {
        expect(evaluateCertGate(null).gated).toBe(false);
    });

    it('an expired cert reports certExpired', () => {
        expect(evaluateCertGate(cert({ expiryDate: PAST })).certExpired).toBe(true);
    });
});
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
cd apps/backend && npx jest __tests__/unit/certificate-coverage.test.js
```

Expected: FAIL — `TypeError: certificateCoverage is not a function`.

- [ ] **Step 3: Delete the dead `buildCertificateSnapshot` (ratchet dead-route, spec §5)**

In `apps/backend/services/trace-service/common.js`, delete lines `207-220` in full:

```js
function buildCertificateSnapshot(cert) {
    if (!cert) { return null; }
    const isValid = cert.status === 'ACTIVE' && new Date(cert.expiryDate) > new Date();
    ...
}
```

and delete the `buildCertificateSnapshot,` line from `module.exports` (currently `:306`). Leave this comment in its place:

```js
// `buildCertificateSnapshot` was deleted on 2026-08-28. It built the
// { number, status, isValid } shape the plot page was missing, was exported and
// never imported by anything, and carried the uppercase-casing bug the gate was
// written to fix (`cert.status === 'ACTIVE'` against rows stored 'active'), so its
// isValid was false for every live certificate. certificateCoverage below is the
// replacement, and it has callers.
```

- [ ] **Step 4: Write `certificateCoverage` + `resolveCertificateCoverage`**

Insert into `apps/backend/services/trace-service/common.js`, replacing the whole `evaluateCertGate` block:

```js
/**
 * THE definition of "is this thing under certification at a given moment"
 * (spec docs/superpowers/specs/2026-08-28-revoked-certificate-consequences-design.md §1).
 *
 * Computed LIVE, every time, from the certificate row. There is deliberately no
 * flag on a cycle, a lot or a QR seal that a revoke would have to go and set:
 * revoke, suspend, reinstate and renew therefore take effect at the next read and
 * are reversible by definition.
 *
 * PURE. `options.successor` is pre-loaded by the caller (Certificate.renewedCertificateId
 * is a plain scalar, NOT a Prisma relation — there is nothing to `include`), which is
 * what lets every reason be unit-tested without a database.
 *
 * @param {object|null} certificate
 * @param {{ asOf?: Date|string|null, successor?: object|null }} [options]
 * @returns {import('./common').CertificateCoverage}
 */
function certificateCoverage(certificate, options = {}) {
    const asOf = options.asOf ? new Date(options.asOf) : new Date();
    const number = certificate?.certificateNumber || null;

    // A missing (or soft-deleted) certificate is NOT a withdrawn one. It reports
    // covered:false so the planting/harvest/QR doors refuse, but gated:false so the
    // public trace of an un-certified batch keeps answering 200 — the behaviour
    // pinned by __tests__/integration/generic-trace-cert-gate.test.js:139,152.
    if (!certificate || certificate.isDeleted === true) {
        return buildCoverage({ covered: false, reason: 'missing', number: null, successorNumber: null, certificate: null });
    }

    const status = String(certificate.status || '').trim().toLowerCase();
    const successorNumber = options.successor?.certificateNumber || null;

    // ── Renewal: the answer belongs to the successor (spec §3.5). ONE hop only —
    // a successor that itself points onward is read as it stands, never chased, so
    // a cycle in the register can never spin this function.
    if (status === 'renewed') {
        if (!options.successor) {
            return buildCoverage({ covered: false, reason: 'renewed', number, successorNumber: null, certificate });
        }
        const onward = certificateCoverage(options.successor, { asOf });
        return buildCoverage({
            covered: onward.covered,
            // The successor's OWN reason, not a blanket 'renewed': if the renewal was
            // itself revoked, "ถูกเพิกถอน" is the true sentence.
            reason: onward.covered ? null : (onward.reason === 'missing' ? 'renewed' : onward.reason),
            number,
            successorNumber: options.successor.certificateNumber || null,
            certificate,
        });
    }

    // ── Expiry is a date comparison, so it answers the historical question directly.
    if (certificate.expiryDate && new Date(certificate.expiryDate) < asOf) {
        return buildCoverage({ covered: false, reason: 'expired', number, successorNumber, certificate });
    }

    // ── Revocation. The timestamp is what makes `asOf` meaningful: before revokedAt
    // the certificate really was in force. A legacy row that carries the status but no
    // timestamp is uncovered at every date — never assume it was fine "back then".
    if (status === 'revoked') {
        const revokedAt = certificate.revokedAt ? new Date(certificate.revokedAt) : null;
        if (!revokedAt || revokedAt <= asOf) {
            return buildCoverage({ covered: false, reason: 'revoked', number, successorNumber, certificate });
        }
    }

    // ── Suspension, including a window that was later lifted. Read from the
    // timestamps rather than the status word so a reinstated certificate stops
    // shadowing dates after the reinstatement.
    const suspendedAt = certificate.suspendedAt ? new Date(certificate.suspendedAt) : null;
    const reinstatedAt = certificate.reinstatedAt ? new Date(certificate.reinstatedAt) : null;
    const insideSuspension = !!suspendedAt && suspendedAt <= asOf && (!reinstatedAt || reinstatedAt > asOf);
    if (status === 'suspended' || insideSuspension) {
        return buildCoverage({ covered: false, reason: 'suspended', number, successorNumber, certificate });
    }

    if (status !== 'active') {
        // Any other stored word (a value nobody has written yet) fails CLOSED as
        // 'revoked' rather than reading as covered. `Certificate.status` is a free-text
        // String (prisma/schema/certification.prisma:53), so this branch is reachable.
        return buildCoverage({ covered: false, reason: 'revoked', number, successorNumber, certificate });
    }

    return buildCoverage({ covered: true, reason: null, number, successorNumber, certificate });
}

/**
 * Async companion. Loads the successor row when — and only when — the certificate
 * says it was renewed, then hands the pure function everything it needs.
 * This is what every non-test caller uses.
 */
async function resolveCertificateCoverage(certificate, options = {}) {
    const client = options.client || prisma;
    let successor = null;
    if (String(certificate?.status || '').trim().toLowerCase() === 'renewed' && certificate?.renewedCertificateId) {
        successor = await client.certificate.findUnique({
            where: { id: String(certificate.renewedCertificateId) },
            select: {
                id: true, certificateNumber: true, status: true, expiryDate: true, issuedDate: true,
                isDeleted: true, revokedAt: true, suspendedAt: true, reinstatedAt: true, renewedCertificateId: true,
            },
        }).catch(() => null);
    }
    return certificateCoverage(certificate, { asOf: options.asOf, successor });
}

/**
 * Kept for the callers and test mocks that already speak this shape
 * (resolve-generic.js:134,245,322 · trace-batch-lot-routes.js:64,204 ·
 * __tests__/integration/generic-trace-cert-gate.test.js:39). One definition
 * underneath, two vocabularies on top.
 */
function evaluateCertGate(cert) {
    const coverage = certificateCoverage(cert);
    return {
        gated: coverage.gated,
        isValid: coverage.covered,
        certExpired: coverage.reason === 'expired',
        status: coverage.reason === 'missing' ? 'invalid' : (String(cert?.status || '').trim().toLowerCase() || 'invalid'),
        minimalBody: coverage.minimalBody,
    };
}
```

And the builder that assembles the object (Task 3 fills in `minimalBody`; for now it keeps today's body byte-for-byte so nothing downstream moves):

```js
function buildCoverage({ covered, reason, number, successorNumber, certificate }) {
    const verifyUrl = number ? `/verify/${encodeURIComponent(number)}` : null;
    return {
        covered,
        reason,
        certificateNumber: number,
        successorCertificateNumber: successorNumber || null,
        verifyUrl,
        // 'missing' means "nobody claimed certification here", which is not the same
        // as "certification was withdrawn". Only the second withdraws the page.
        gated: !covered && reason !== 'missing',
        minimalBody(type) {
            const certExpired = reason === 'expired';
            return {
                success: false,
                type,
                verification: {
                    valid: false,
                    scannedAt: new Date().toISOString(),
                    reason: certExpired ? 'certificate_expired' : `certificate_${reason}`,
                },
                certificate: {
                    reference: certificate?.certificateNumber,
                    status: String(certificate?.status || '').trim().toLowerCase() || 'invalid',
                    issuedDate: certificate?.issuedDate,
                    expiryDate: certificate?.expiryDate,
                },
                message: certExpired
                    ? 'ใบรับรองหมดอายุแล้ว / Certificate has expired'
                    : 'ใบรับรองไม่อยู่ในสถานะใช้งาน / Certificate is not active',
            };
        },
    };
}
```

Add to `module.exports`: `certificateCoverage,` and `resolveCertificateCoverage,`.

- [ ] **Step 5: Run the new test and the two sibling suites**

```bash
cd apps/backend && npx jest \
  __tests__/unit/certificate-coverage.test.js \
  __tests__/integration/generic-trace-cert-gate.test.js \
  __tests__/integration/batch-lot-route-cert-gate.test.js
```

Expected: all three PASS. The two sibling suites must be green **unchanged** at this task — Task 1 alters no body and no status string. If `generic-trace-cert-gate.test.js:127` (lowercase-active → 200) goes red, the casing normalisation is wrong; if `:139` or `:152` (un-certified → 200) goes red, the `gated`/`missing` split is wrong.

- [ ] **Step 6: Confirm the ratchet did not rise**

```bash
cd ../.. && bash scripts/check-done.sh ratchet
```

Expected: no counter higher than the `AUDIT_LEDGER.md` baseline. Paste the output.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/services/trace-service/common.js apps/backend/__tests__/unit/certificate-coverage.test.js
git commit -m "feat(cert): one live definition of certificate coverage, successor included"
```

---

### Task 2: the plot sign stops asserting GACP certification

**Files:**
- Modify: `apps/backend/services/trace-service/resolve-plot-cycle.js` — `ASSIGNMENT_INCLUDE` at `:56-71`, the resolver body around `:466-476` (after the assignment resolves), the success body's `verification` at `:640`, and the exports at `:667-677`
- Test: `apps/backend/__tests__/integration/plot-cycle-trace-cert-gate.test.js` (create)

> **Pointer corrections against HEAD:** facts.md cites the success body at `:566-644` and the hardcoded `verification: { valid: true, ... }` at `:640` — both correct. `ASSIGNMENT_INCLUDE` is `:56-71` — correct. The file is 677 lines, not the 690 facts.md reports; the `qrRevokedAt` 410 is at `:313-317` and `buildRevokedSignBody` at `:251-265`.

**Interfaces:**
- Consumes: `resolveCertificateCoverage(certificate, { asOf?, client? })` and the `CertificateCoverage` shape from Task 1.
- Produces: `GET /api/trace/plot-cycle/:qrCode` answers **410** with `coverage.minimalBody('PLOT_CYCLE')` when `coverage.gated`, and on the 200 path adds to `data`:
  ```js
  certificate: {
    number: string|null, status: string|null, covered: boolean,
    reason: string|null, verifyUrl: string|null, successorCertificateNumber: string|null,
  }
  ```
  and replaces the hardcoded `verification: { valid: true }` with `verification: { valid: coverage.covered, scannedAt }`. Task 4's plot-cycle page reads `data.certificate.covered`.

- [ ] **Step 1: Write the failing test — spec §4 RED (1)**

Create `apps/backend/__tests__/integration/plot-cycle-trace-cert-gate.test.js`:

```js
/**
 * RED (1) of the spec's §4: today GET /api/trace/plot-cycle/<qr> for a cycle under
 * a REVOKED certificate answers 200 with a hardcoded `verification:{valid:true}`
 * and full farm/plot/crop data (resolve-plot-cycle.js:640), because the resolver
 * never asks about the certificate at all. The real register holds exactly this:
 * GACP-TH-2569-CAE820 was revoked on 2026-08-27 and still owns two cycles.
 *
 * It must gate like every sibling door (resolve-generic.js:134,245,322;
 * trace-batch-lot-routes.js:64,204) and answer the unified 410.
 *
 * The DB-import modules call process.exit(1) without DATABASE_URL, so `common` is
 * mocked — with the REAL certificateCoverage pulled through requireActual.
 */
'use strict';

jest.mock('../../server', () => ({ prisma: {} }));
jest.mock('../../services/prisma-database', () => ({ prisma: {} }));

const realCommon = jest.requireActual('../../services/trace-service/common');

jest.mock('../../services/trace-service/common', () => ({
    prisma: {
        plot: { findUnique: jest.fn() },
        plantingCyclePlot: { findFirst: jest.fn(), findUnique: jest.fn() },
        traceQrSecurity: { findFirst: jest.fn(), findMany: jest.fn() },
        harvestBatch: { findMany: jest.fn() },
        certificate: { findUnique: jest.fn() },
    },
    qrcodeService: {
        generatePublicTraceUrl: (p) => `https://trace.test/${p}`,
        recordTraceScan: jest.fn().mockResolvedValue({ available: false, valid: null }),
    },
    logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
    formatThaiDate: (x) => (x ? String(x) : null),
    parseJsonMetaFromNotes: () => null,
    normalizeSourceFromPayload: () => ({}),
    buildIntegrityPayload: () => ({ available: false }),
    SAFETY_DISCLAIMER: 'disclaimer',
    FDA_REFERRAL: 'fda',
    PLOT_HARVEST_META_PREFIX: 'PLOT_HARVEST_META:',
    TRACE_NOT_FOUND_MESSAGE: 'not found',
    logPublicTraceAccess: jest.fn().mockResolvedValue(undefined),
    getRequestIp: () => '127.0.0.1',
    // REAL, under test:
    certificateCoverage: realCommon.certificateCoverage,
    resolveCertificateCoverage: realCommon.resolveCertificateCoverage,
    evaluateCertGate: realCommon.evaluateCertGate,
}));

const common = require('../../services/trace-service/common');
const { resolveTraceByPlotCycleQr } = require('../../services/trace-service/resolve-plot-cycle');

const ctx = { requestIp: '127.0.0.1', userAgent: 'jest', originalUrl: '/api/trace/plot-cycle/QR' };
const FUTURE = new Date(Date.now() + 365 * 24 * 3600 * 1000);
const PAST = new Date(Date.now() - 24 * 3600 * 1000);

function certRow(over = {}) {
    return {
        id: 'cert-1', certificateNumber: 'GACP-TH-2569-CAE820', farmId: 'farm-1',
        status: 'active', expiryDate: FUTURE, issuedDate: PAST, isDeleted: false,
        revokedAt: null, suspendedAt: null, reinstatedAt: null, renewedCertificateId: null,
        ...over,
    };
}

function assignmentRow(cert) {
    return {
        id: 'cyclePlot-1', cycleId: 'cycle-1', plotId: 'plot-1',
        allocatedAreaSqm: 200, plannedPlantCount: 10,
        plot: { id: 'plot-1', name: 'แปลงกลางแจ้ง 1', solarSystem: 'OUTDOOR', plotCode: 'PLOT-BEJAD-M4SR7' },
        cycle: {
            id: 'cycle-1', cycleName: 'รอบที่ 1/2567 ฤดูแล้ง', status: 'PLANTED',
            startDate: PAST, expectedHarvestDate: null, cultivationType: 'OUTDOOR', farmId: 'farm-1',
            farm: { id: 'farm-1', farmName: 'ไร่ใจดีสมุนไพรไทย', district: 'เมือง', province: 'เชียงใหม่' },
            plantSpecies: { code: 'cannabis', nameTH: 'กัญชา', nameEN: 'Cannabis', requiresLicense: false },
            certificateId: cert ? cert.id : null,
            certificate: cert,
        },
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    common.prisma.plot.findUnique.mockResolvedValue(null);
    common.prisma.traceQrSecurity.findFirst.mockResolvedValue({
        id: 'seal-1', entityId: 'cyclePlot-1', payload: null, publicUrl: null, qrCode: 'QR',
    });
    common.prisma.traceQrSecurity.findMany.mockResolvedValue([]);
    common.prisma.harvestBatch.findMany.mockResolvedValue([]);
});

describe('GET /api/trace/plot-cycle/:qrCode — the field sign tells the truth', () => {
    it('410s a cycle under a REVOKED certificate, with the unified body and no farm data', async () => {
        common.prisma.plantingCyclePlot.findUnique.mockResolvedValue(
            assignmentRow(certRow({ status: 'revoked', revokedAt: PAST })),
        );

        const out = await resolveTraceByPlotCycleQr('QR', ctx);

        expect(out.status).toBe(410);
        expect(out.body.code).toBe('CERTIFICATE_NOT_COVERING');
        expect(out.body.reason).toBe('revoked');
        expect(out.body.type).toBe('PLOT_CYCLE');
        expect(out.body.certificateNumber).toBe('GACP-TH-2569-CAE820');
        expect(out.body.verifyUrl).toBe('/verify/GACP-TH-2569-CAE820');
        expect(out.body.verification.valid).toBe(false);
        // No land is published behind a withdrawn certificate.
        expect(JSON.stringify(out.body)).not.toContain('ไร่ใจดีสมุนไพรไทย');
        expect(JSON.stringify(out.body)).not.toContain('PLOT-BEJAD-M4SR7');
        expect(out.body.data).toBeUndefined();
    });

    it('410s a SUSPENDED certificate too', async () => {
        common.prisma.plantingCyclePlot.findUnique.mockResolvedValue(
            assignmentRow(certRow({ status: 'suspended', suspendedAt: PAST })),
        );
        const out = await resolveTraceByPlotCycleQr('QR', ctx);
        expect(out.status).toBe(410);
        expect(out.body.reason).toBe('suspended');
    });

    it('410s an EXPIRED certificate too', async () => {
        common.prisma.plantingCyclePlot.findUnique.mockResolvedValue(
            assignmentRow(certRow({ expiryDate: PAST })),
        );
        const out = await resolveTraceByPlotCycleQr('QR', ctx);
        expect(out.status).toBe(410);
        expect(out.body.reason).toBe('expired');
    });

    it('follows a RENEWED certificate to its live successor and stays 200, carrying the forward link', async () => {
        common.prisma.plantingCyclePlot.findUnique.mockResolvedValue(
            assignmentRow(certRow({ status: 'renewed', renewedCertificateId: 'cert-2' })),
        );
        common.prisma.certificate.findUnique.mockResolvedValue(
            certRow({ id: 'cert-2', certificateNumber: 'GACP-TH-2569-E5960D' }),
        );

        const out = await resolveTraceByPlotCycleQr('QR', ctx);

        expect(out.status).toBe(200);
        expect(out.body.data.certificate.covered).toBe(true);
        expect(out.body.data.certificate.number).toBe('GACP-TH-2569-CAE820');
        expect(out.body.data.certificate.successorCertificateNumber).toBe('GACP-TH-2569-E5960D');
        expect(out.body.data.verification.valid).toBe(true);
    });

    it('200s a live certificate and publishes it, so the page can paint the shield from data', async () => {
        common.prisma.plantingCyclePlot.findUnique.mockResolvedValue(assignmentRow(certRow()));
        const out = await resolveTraceByPlotCycleQr('QR', ctx);
        expect(out.status).toBe(200);
        expect(out.body.data.certificate).toMatchObject({
            number: 'GACP-TH-2569-CAE820', covered: true, reason: null,
            verifyUrl: '/verify/GACP-TH-2569-CAE820',
        });
        expect(out.body.data.verification.valid).toBe(true);
    });

    it('a cycle with NO certificate stays 200 but claims nothing (covered:false, valid:false)', async () => {
        common.prisma.plantingCyclePlot.findUnique.mockResolvedValue(assignmentRow(null));
        const out = await resolveTraceByPlotCycleQr('QR', ctx);
        expect(out.status).toBe(200);
        expect(out.body.data.certificate.covered).toBe(false);
        expect(out.body.data.certificate.reason).toBe('missing');
        expect(out.body.data.verification.valid).toBe(false);
    });

    it('drops a certificate belonging to a DIFFERENT farm, same as resolve-generic.js:242-244', async () => {
        common.prisma.plantingCyclePlot.findUnique.mockResolvedValue(
            assignmentRow(certRow({ farmId: 'farm-OTHER' })),
        );
        const out = await resolveTraceByPlotCycleQr('QR', ctx);
        expect(out.status).toBe(200);
        expect(out.body.data.certificate.reason).toBe('missing');
        expect(out.body.data.certificate.number).toBeNull();
    });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd apps/backend && npx jest __tests__/integration/plot-cycle-trace-cert-gate.test.js
```

Expected: FAIL. The first test reports `Expected: 410, Received: 200` and `out.body.data.certificate` is `undefined` — the resolver never asked.

- [ ] **Step 3: Select the certificate on the assignment**

In `apps/backend/services/trace-service/resolve-plot-cycle.js`, extend `ASSIGNMENT_INCLUDE` (`:56-71`). Both lookup paths share this object, so a plot-code scan and a legacy cycle-plot QR scan cannot disagree about the certificate:

```js
    cycle: {
        select: {
            id: true, cycleName: true, status: true,
            startDate: true, expectedHarvestDate: true, cultivationType: true,
            // farmId is selected alongside the farm object because the cross-farm
            // check compares it with the CERTIFICATE's farmId — the same hardening
            // resolve-generic.js:242-244 applies before it trusts a cert.
            farmId: true,
            farm: { select: { id: true, farmName: true, district: true, province: true } },
            plantSpecies: { select: { code: true, nameTH: true, nameEN: true, requiresLicense: true } },
            certificateId: true,
            // Everything certificateCoverage reads, and nothing else: the public body
            // publishes only the number and the coverage verdict.
            certificate: {
                select: {
                    id: true, certificateNumber: true, farmId: true, status: true,
                    issuedDate: true, expiryDate: true, isDeleted: true,
                    revokedAt: true, suspendedAt: true, reinstatedAt: true, renewedCertificateId: true,
                },
            },
        },
    },
```

- [ ] **Step 4: Gate, immediately after the assignment resolves**

Add the import at the top of the file (it already destructures from `./common`):

```js
const {
    prisma,
    qrcodeService,
    logger,
    formatThaiDate,
    parseJsonMetaFromNotes,
    normalizeSourceFromPayload,
    buildIntegrityPayload,
    SAFETY_DISCLAIMER,
    FDA_REFERRAL,
    PLOT_HARVEST_META_PREFIX,
    TRACE_NOT_FOUND_MESSAGE,
    resolveCertificateCoverage,
} = require('./common');
```

Then, in `resolveTraceByPlotCycleQr`, **immediately after** the `if (!securityRecord?.entityId || !assignment?.cycle) { return 404 }` block (currently `:466-476`) and **before** `logPublicScan` / `recordTraceScan`, insert:

```js
    // ── Certificate gate (spec §3.2) ──
    //
    // The field sign was the one public door that never asked. It published farm
    // name, district, plot code and crop, and stamped `verification:{valid:true}`
    // as a literal — so a plot whose certificate had been revoked showed a scanner
    // a green "แหล่งปลูกได้รับการรับรอง GACP" shield. The same gate the lot and
    // batch doors have used since PR-1.9 now runs here, from the same definition.
    //
    // Cross-farm hardening first, mirroring resolve-generic.js:242-244: a
    // certificate that belongs to a different farm than the cycle is DROPPED, not
    // trusted. Dropping it yields reason 'missing', which does not gate — an
    // un-certified plot page is not a withdrawn one.
    const certRow = assignment.cycle.certificate
        && String(assignment.cycle.certificate.farmId || '') === String(assignment.cycle.farmId || '')
        ? assignment.cycle.certificate
        : null;
    const coverage = await resolveCertificateCoverage(certRow, { client: prisma });

    if (coverage.gated) {
        // Logged like every other scan outcome, so "someone scanned a withdrawn
        // sign" is readable later — that is the row worth having.
        await logPublicScan(assignment.id, {
            entityType: 'PLOT_CYCLE',
            qrCode: securityRecord.qrCode || qrCode,
            plotCode: assignment.plot?.plotCode || null,
            cycleId: assignment.cycleId,
            certificateNotCovering: coverage.reason,
        }, ctx);
        return { status: 410, body: coverage.minimalBody('PLOT_CYCLE') };
    }
```

- [ ] **Step 5: Publish the certificate and stop hardcoding the verdict**

In the `publicData` object, replace the single line at `:640`:

```js
                verification: { valid: true, scannedAt: new Date().toISOString() },
```

with:

```js
                // The number and the verdict, never a literal. `covered` is what the
                // page reads before it is allowed to paint a GACP shield; parent spec
                // :76 asks for "เลขใบ + สถานะจริงเสมอ + ลิงก์ verify".
                certificate: {
                    number: coverage.certificateNumber,
                    status: certRow ? String(certRow.status || '').trim().toLowerCase() : null,
                    covered: coverage.covered,
                    reason: coverage.reason,
                    verifyUrl: coverage.verifyUrl,
                    successorCertificateNumber: coverage.successorCertificateNumber,
                },
                verification: { valid: coverage.covered, scannedAt: new Date().toISOString() },
```

Check `redactPublicPlotPayload` (`:127-183`): the controlled-species redaction must **not** strip `certificate` — the certificate number is public on `/verify` already and withholding it would leave the scanner unable to check the claim. Confirm by reading the function; if it uses an allow-list, add `certificate` to it.

- [ ] **Step 6: Run the new test, then the whole plot-cycle family**

```bash
cd apps/backend && npx jest \
  __tests__/integration/plot-cycle-trace-cert-gate.test.js \
  __tests__/unit/trace-plot-cycle-plant-count-ssot.test.js \
  __tests__/unit/trace-resolves-plot-code.test.js \
  __tests__/integration/planting-plot-trace.test.js
```

Expected: PASS. `trace-plot-cycle-plant-count-ssot.test.js` and `trace-resolves-plot-code.test.js` build their own assignment fixtures — if either goes red with `certificate is undefined`, add `certificateId: null, certificate: null, farmId: 'farm-1'` to that fixture's `cycle` object rather than weakening the gate. A cycle fixture with no certificate lands on `missing` → not gated → the existing 200 assertions stand.

- [ ] **Step 7: Ratchet + commit**

```bash
cd ../.. && bash scripts/check-done.sh ratchet
git add apps/backend/services/trace-service/resolve-plot-cycle.js apps/backend/__tests__/integration/plot-cycle-trace-cert-gate.test.js
git commit -m "fix(trace): the plot sign asks about the certificate before claiming GACP"
```

---

### Task 3: one 410 body, four resolvers

**Files:**
- Modify: `apps/backend/services/trace-service/common.js` — the `minimalBody` inside `buildCoverage` (added in Task 1)
- Modify: `apps/backend/__tests__/integration/generic-trace-cert-gate.test.js:159-169` (the body-shape contract) and `apps/backend/__tests__/integration/batch-lot-route-cert-gate.test.js:115-130`
- Read-only confirmation: `apps/backend/services/trace-service/resolve-generic.js:134-135,245-246,322-323`, `apps/backend/routes/api/trace/trace-batch-lot-routes.js:64-83,204-215` — these already call `evaluateCertGate(...).minimalBody(type)`, so they inherit the new body with **no edit**

> **Pointer corrections against HEAD:** all five gate sites verified present at the lines facts.md gives. `generic-trace-cert-gate.test.js:164-168` asserts the exact key set of the 410 body — that assertion is the thing this task deliberately changes, and it must be updated, never deleted.

**Interfaces:**
- Consumes: `buildCoverage` / `certificateCoverage` from Task 1.
- Produces: the **unified 410 body** documented in the Interfaces section. Task 4's `classifyTraceResponse` keys off `body.code === 'CERTIFICATE_NOT_COVERING'`; Task 2's plot resolver already emits it.

- [ ] **Step 1: Write the failing test**

Replace the body-shape block in `apps/backend/__tests__/integration/generic-trace-cert-gate.test.js` (currently `:159-169`) with:

```js
    it('the 410 body is ONE shape across every resolver, and it names the reason', async () => {
        // Spec §3.2: { code, reason, certificateNumber, verifyUrl, successorCertificateNumber? }
        // on top of the original success/type/verification/certificate/message envelope,
        // which the web pages and the batch route both still read.
        common.prisma.plantingCycle.findFirst.mockResolvedValue(cycleRow({
            certificateNumber: 'GACP-TH-2569-CAE820',
            status: 'revoked', revokedAt: past, expiryDate: future, issuedDate: past, isDeleted: false,
        }));
        const out = await resolveTraceByGenericQr('QR', ctx);
        const genericBody = out.body;

        expect(Object.keys(genericBody).sort()).toEqual([
            'certificate', 'certificateNumber', 'code', 'message', 'reason',
            'success', 'successorCertificateNumber', 'type', 'verification', 'verifyUrl',
        ].sort());
        expect(Object.keys(genericBody.verification).sort()).toEqual(['reason', 'scannedAt', 'valid'].sort());
        expect(Object.keys(genericBody.certificate).sort())
            .toEqual(['expiryDate', 'issuedDate', 'reference', 'status'].sort());

        expect(genericBody.code).toBe('CERTIFICATE_NOT_COVERING');
        expect(genericBody.reason).toBe('revoked');
        expect(genericBody.certificateNumber).toBe('GACP-TH-2569-CAE820');
        expect(genericBody.verifyUrl).toBe('/verify/GACP-TH-2569-CAE820');
        expect(genericBody.successorCertificateNumber).toBeNull();
    });

    it('the Thai message names WHICH withdrawal it was, not a blanket "not active"', async () => {
        // G10: revoked, suspended and renewed all read 'ใบรับรองไม่อยู่ในสถานะใช้งาน'
        // before this. A consumer holding a bag cannot act on a sentence that fits
        // three different situations.
        const cases = [
            [{ status: 'revoked', revokedAt: past }, 'ใบรับรองถูกเพิกถอน'],
            [{ status: 'suspended', suspendedAt: past }, 'ใบรับรองถูกระงับชั่วคราว'],
            [{ status: 'active', expiryDate: past }, 'ใบรับรองหมดอายุแล้ว'],
        ];
        for (const [over, expected] of cases) {
            common.prisma.plantingCycle.findFirst.mockResolvedValue(cycleRow({
                certificateNumber: 'GACP-TH-2569-CAE820',
                status: 'active', expiryDate: future, issuedDate: past, isDeleted: false, ...over,
            }));
            const out = await resolveTraceByGenericQr('QR', ctx);
            expect(out.status).toBe(410);
            expect(out.body.message).toContain(expected);
            // No em dash in Thai copy (thai-ui-copy skill).
            expect(out.body.message).not.toContain('—');
        }
    });
```

In `apps/backend/__tests__/integration/batch-lot-route-cert-gate.test.js`, update the key-set assertion at `:127` the same way and add, after `:129`:

```js
        expect(res.body.code).toBe('CERTIFICATE_NOT_COVERING');
        expect(res.body.reason).toBe('revoked');
        expect(res.body.verifyUrl).toBe(`/verify/${res.body.certificateNumber}`);
```

- [ ] **Step 2: Run both suites and watch them fail**

```bash
cd apps/backend && npx jest \
  __tests__/integration/generic-trace-cert-gate.test.js \
  __tests__/integration/batch-lot-route-cert-gate.test.js
```

Expected: FAIL — the key-set assertion reports the five old keys, and `body.code` is `undefined`.

- [ ] **Step 3: Widen `minimalBody` in `buildCoverage`**

In `apps/backend/services/trace-service/common.js`, replace the `minimalBody` written in Task 1 with:

```js
        /**
         * The ONE HTTP 410 body every public trace door answers with (spec §3.2).
         *
         * The original five keys stay exactly where they were: the web pages read
         * `message`, and __tests__/integration/generic-trace-cert-gate.test.js pins
         * that the generic resolver and the dedicated batch/lot routes answer the
         * same object. The five new ones are what the page needs in order to say
         * something true — WHICH withdrawal it was, whose certificate, where to
         * check it, and where the current document lives if there is one.
         *
         * Deliberately carries no farm, plot, cycle or lot field. A withdrawn
         * certificate must not keep publishing the land behind it.
         */
        minimalBody(type) {
            return {
                success: false,
                type,
                code: 'CERTIFICATE_NOT_COVERING',
                reason,
                certificateNumber: number,
                verifyUrl,
                successorCertificateNumber: successorNumber || null,
                verification: {
                    valid: false,
                    scannedAt: new Date().toISOString(),
                    reason: `certificate_${reason}`,
                },
                certificate: {
                    reference: certificate?.certificateNumber,
                    status: String(certificate?.status || '').trim().toLowerCase() || 'invalid',
                    issuedDate: certificate?.issuedDate,
                    expiryDate: certificate?.expiryDate,
                },
                message: COVERAGE_MESSAGES[reason] || COVERAGE_MESSAGES.revoked,
            };
        },
```

and add the message table above `buildCoverage`, replacing the generic sentence G10 flagged:

```js
/**
 * Reason-specific public copy (spec §3.2 bullet 3). Thai first, then the English
 * half the /trace pages have always shown after ' / '. Each line names the cause
 * and the next action, per .claude/skills/thai-ui-copy/SKILL.md; no em dashes.
 */
const COVERAGE_MESSAGES = Object.freeze({
    revoked: 'ใบรับรองถูกเพิกถอน ข้อมูลย้อนกลับของสินค้านี้จึงไม่แสดง คุณตรวจสอบสถานะใบรับรองได้จากลิงก์ตรวจสอบ / This certificate has been revoked',
    suspended: 'ใบรับรองถูกระงับชั่วคราว ข้อมูลย้อนกลับของสินค้านี้จึงยังไม่แสดง คุณตรวจสอบสถานะใบรับรองได้จากลิงก์ตรวจสอบ / This certificate is suspended',
    expired: 'ใบรับรองหมดอายุแล้ว ข้อมูลย้อนกลับของสินค้านี้จึงไม่แสดง คุณตรวจสอบสถานะใบรับรองได้จากลิงก์ตรวจสอบ / Certificate has expired',
    renewed: 'ใบรับรองฉบับนี้ถูกแทนที่ด้วยฉบับต่ออายุแล้ว คุณดูฉบับปัจจุบันได้จากลิงก์ด้านล่าง / This certificate has been superseded by a renewal',
    missing: 'ไม่พบใบรับรองที่ผูกกับแหล่งปลูกนี้ / No certificate is linked to this growing site',
});
```

**Note for the implementer:** `expired` used to produce `verification.reason: 'certificate_expired'` through the `certExpired` branch. It still does, because `reason` is literally `'expired'` and the template is `` `certificate_${reason}` ``. Confirm `generic-trace-cert-gate.test.js:124` (`expect(out.body.verification.reason).toBe('certificate_expired')`) stays green without editing it.

- [ ] **Step 4: Run the four backend suites that read this body**

```bash
cd apps/backend && npx jest \
  __tests__/integration/generic-trace-cert-gate.test.js \
  __tests__/integration/batch-lot-route-cert-gate.test.js \
  __tests__/integration/plot-cycle-trace-cert-gate.test.js \
  __tests__/integration/trace-batch-lot-cross-farm-cert.test.js \
  __tests__/unit/certificate-coverage.test.js
```

Expected: all PASS. `trace-batch-lot-cross-farm-cert.test.js` asserts the cross-farm drop → 200 un-gated; it must not move.

- [ ] **Step 5: Ratchet + commit**

```bash
cd ../.. && bash scripts/check-done.sh ratchet
git add apps/backend/services/trace-service/common.js apps/backend/__tests__/integration/generic-trace-cert-gate.test.js apps/backend/__tests__/integration/batch-lot-route-cert-gate.test.js
git commit -m "fix(trace): one 410 body that says which withdrawal it was"
```

---

### Task 4: the four public trace pages say "เพิกถอน", not "ไม่พบข้อมูล"

**Files:**
- Create: `apps/web-app/src/app/trace/trace-uncovered-copy.ts`
- Create: `apps/web-app/src/app/trace/trace-uncovered.tsx`
- Create: `apps/web-app/src/app/trace/__tests__/trace-uncovered.test.tsx`
- Modify: `apps/web-app/src/app/trace/trace-fetch.ts:28-70` (envelope type, outcome union, `classifyTraceResponse`)
- Modify: `apps/web-app/src/app/trace/__tests__/trace-fetch.test.ts:42`
- Modify: `apps/web-app/src/app/trace/[qr-code]/client-view.tsx:48-53,85-98`
- Modify: `apps/web-app/src/app/trace/batch/[qr-code]/client-view.tsx:119,170-190`
- Modify: `apps/web-app/src/app/trace/lot/[lot-id]/client-view.tsx:131,164-182`
- Modify: `apps/web-app/src/app/trace/plot-cycle/[qr-code]/client-view.tsx:148-160,183-200,295-298`

> **Pointer corrections against HEAD:** `trace-fetch.ts` is 92 lines and maps 410 to `'not-found'` at `:62-63` — correct. The unconditional green shield is at `plot-cycle/[qr-code]/client-view.tsx:295-298` — correct. The generic page's red card is `[qr-code]/client-view.tsx:85-98` (facts.md says `:86-98`); the batch card is `batch/[qr-code]/client-view.tsx:170-190` (facts.md says `:177-182`); the lot card is `lot/[lot-id]/client-view.tsx:164-182` (facts.md's `:284-300` is its status badge, a different block).

**Interfaces:**
- Consumes: the unified 410 body from Task 3 (`code`, `reason`, `certificateNumber`, `verifyUrl`, `successorCertificateNumber`) and, on the plot-cycle 200 path, `data.certificate.covered` from Task 2.
- Produces:
  ```ts
  // trace-fetch.ts
  export interface TraceUncoveredCoverage { reason: 'revoked'|'suspended'|'expired'|'renewed'|'missing'; certificateNumber: string|null; verifyUrl: string|null; successorCertificateNumber: string|null }
  export type TraceFetchOutcome<T> = { kind:'ok'; payload:T } | { kind:'uncovered'; coverage: TraceUncoveredCoverage } | { kind:'not-found'; message: string|null } | { kind:'unavailable' }
  // trace-uncovered-copy.ts
  export function uncoveredCopy(reason: TraceUncoveredCoverage['reason']): { title: string; body: string }
  // trace-uncovered.tsx
  export function TraceUncovered({ coverage }: { coverage: TraceUncoveredCoverage }): JSX.Element
  ```

- [ ] **Step 1: Write the failing tests — spec §4 RED (5) and (2)**

Add to `apps/web-app/src/app/trace/__tests__/trace-fetch.test.ts`, **replacing** the existing case at `:42` (which pins 410 to `not-found`):

```ts
    it('410 carrying the coverage code is UNCOVERED, not not-found (RED 5)', () => {
        // Before: trace-fetch.ts:62-63 mapped every 410 to 'not-found', so a consumer
        // holding a real bag from a revoked farm was told the product does not exist.
        const outcome = classifyTraceResponse(410, {
            success: false,
            code: 'CERTIFICATE_NOT_COVERING',
            reason: 'revoked',
            certificateNumber: 'GACP-TH-2569-CAE820',
            verifyUrl: '/verify/GACP-TH-2569-CAE820',
            successorCertificateNumber: null,
            message: 'ใบรับรองถูกเพิกถอน ...',
        });
        expect(outcome).toEqual({
            kind: 'uncovered',
            coverage: {
                reason: 'revoked',
                certificateNumber: 'GACP-TH-2569-CAE820',
                verifyUrl: '/verify/GACP-TH-2569-CAE820',
                successorCertificateNumber: null,
            },
        });
    });

    it('410 WITHOUT the coverage code stays not-found (the revoked plot sign, resolve-plot-cycle.js:251)', () => {
        // buildRevokedSignBody() answers 410 for Plot.qrRevokedAt: a lost or stolen
        // SIGN, a different trigger with no certificate behind it. It keeps its own copy.
        expect(classifyTraceResponse(410, {
            success: false,
            message: 'ป้ายรหัสแปลงนี้ถูกยกเลิกแล้ว กรุณาติดต่อเจ้าของแปลงเพื่อขอป้ายใหม่ / This plot sign has been revoked',
            verification: { valid: false, reason: 'plot_sign_revoked' },
        })).toEqual({
            kind: 'not-found',
            message: 'ป้ายรหัสแปลงนี้ถูกยกเลิกแล้ว กรุณาติดต่อเจ้าของแปลงเพื่อขอป้ายใหม่ / This plot sign has been revoked',
        });
    });

    it('a 5xx carrying the coverage code is still unavailable (a verdict needs the 410)', () => {
        expect(classifyTraceResponse(503, { success: false, code: 'CERTIFICATE_NOT_COVERING', reason: 'revoked' }))
            .toEqual({ kind: 'unavailable' });
    });

    it('a 410 with an unknown reason falls back to revoked rather than rendering blank', () => {
        const outcome = classifyTraceResponse(410, {
            success: false, code: 'CERTIFICATE_NOT_COVERING', reason: 'wat',
            certificateNumber: 'X', verifyUrl: '/verify/X', successorCertificateNumber: null,
        });
        expect(outcome.kind).toBe('uncovered');
        expect((outcome as { coverage: { reason: string } }).coverage.reason).toBe('revoked');
    });
```

Create `apps/web-app/src/app/trace/__tests__/trace-uncovered.test.tsx` (repo pattern: `react-dom/client` + `act`, no `@testing-library` — see `health/planting/__tests__/planting-cert-gate.test.tsx:22-29`):

```tsx
/**
 * RED (2) of the spec's §4: the public trace pages must name the withdrawal and
 * offer a way to check it, instead of the red "ไม่พบข้อมูลผลิตภัณฑ์" card that
 * asserts the product does not exist.
 */
import * as React from 'react';
import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { TraceUncovered } from '../trace-uncovered';
import { uncoveredCopy } from '../trace-uncovered-copy';

declare global { var IS_REACT_ACT_ENVIRONMENT: boolean | undefined }
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
});

function render(ui: React.ReactElement) {
    act(() => { root.render(ui); });
    return container;
}

describe('uncoveredCopy', () => {
    it('names each withdrawal distinctly', () => {
        expect(uncoveredCopy('revoked').title).toBe('ใบรับรองของแหล่งปลูกนี้ถูกเพิกถอน');
        expect(uncoveredCopy('suspended').title).toBe('ใบรับรองของแหล่งปลูกนี้ถูกระงับชั่วคราว');
        expect(uncoveredCopy('expired').title).toBe('ใบรับรองของแหล่งปลูกนี้หมดอายุแล้ว');
        expect(uncoveredCopy('renewed').title).toBe('ใบรับรองฉบับนี้ถูกแทนที่ด้วยฉบับต่ออายุ');
        expect(uncoveredCopy('missing').title).toBe('ไม่พบใบรับรองที่ผูกกับแหล่งปลูกนี้');
    });

    it('never claims the product does not exist, and follows the Thai copy rules', () => {
        for (const reason of ['revoked', 'suspended', 'expired', 'renewed', 'missing'] as const) {
            const { title, body } = uncoveredCopy(reason);
            expect(`${title} ${body}`).not.toContain('ไม่พบข้อมูลผลิตภัณฑ์');
            expect(`${title} ${body}`).not.toContain('—');  // no em dash
            expect(`${title} ${body}`).not.toContain('ท่าน');     // คุณ register only
            expect(body.length).toBeGreaterThan(20);              // cause + next action
        }
    });
});

describe('TraceUncovered', () => {
    it('shows the revoked headline, the certificate number and the verify link', () => {
        const el = render(<TraceUncovered coverage={{
            reason: 'revoked',
            certificateNumber: 'GACP-TH-2569-CAE820',
            verifyUrl: '/verify/GACP-TH-2569-CAE820',
            successorCertificateNumber: null,
        }} />);

        expect(el.textContent).toContain('ใบรับรองของแหล่งปลูกนี้ถูกเพิกถอน');
        expect(el.textContent).toContain('GACP-TH-2569-CAE820');
        expect(el.textContent).toContain('ตรวจสอบใบรับรอง');
        expect(el.textContent).not.toContain('ไม่พบข้อมูลผลิตภัณฑ์');
        expect(el.querySelector('a[href="/verify/GACP-TH-2569-CAE820"]')).not.toBeNull();
    });

    it('offers the successor link when the certificate was renewed', () => {
        const el = render(<TraceUncovered coverage={{
            reason: 'renewed',
            certificateNumber: 'GACP-TH-2569-CAE820',
            verifyUrl: '/verify/GACP-TH-2569-CAE820',
            successorCertificateNumber: 'GACP-TH-2569-E5960D',
        }} />);
        expect(el.textContent).toContain('ดูฉบับปัจจุบัน');
        expect(el.querySelector('a[href="/verify/GACP-TH-2569-E5960D"]')).not.toBeNull();
    });

    it('renders without a certificate number and offers no dead link', () => {
        const el = render(<TraceUncovered coverage={{
            reason: 'missing', certificateNumber: null, verifyUrl: null, successorCertificateNumber: null,
        }} />);
        expect(el.textContent).toContain('ไม่พบใบรับรองที่ผูกกับแหล่งปลูกนี้');
        expect(el.querySelectorAll('a').length).toBe(0);
    });

    it('uses destructive tokens and no Thai letter-spacing', () => {
        const el = render(<TraceUncovered coverage={{
            reason: 'revoked', certificateNumber: 'X', verifyUrl: '/verify/X', successorCertificateNumber: null,
        }} />);
        const html = el.innerHTML;
        expect(html).toContain('destructive');
        expect(html).not.toMatch(/\bbg-red-\d/);
        expect(html).not.toMatch(/\btext-red-\d/);
        expect(html).not.toMatch(/tracking-(wide|wider|widest)/);
        expect(html).not.toMatch(/\buppercase\b/);
        expect(html).not.toMatch(/font-black/);
    });
});
```

- [ ] **Step 2: Run both and watch them fail**

```bash
cd apps/web-app && npx jest src/app/trace/__tests__/trace-fetch.test.ts src/app/trace/__tests__/trace-uncovered.test.tsx
```

Expected: FAIL — `Cannot find module '../trace-uncovered'`, and the 410 case reports `{ kind: 'not-found' }`.

- [ ] **Step 3: Write the copy map**

Create `apps/web-app/src/app/trace/trace-uncovered-copy.ts`:

```ts
/**
 * Public copy for a trace whose certificate no longer covers it.
 *
 * One table, four pages. Mirrors the reason table the /verify page has had since
 * F-G4-57 (src/app/(public)/verify/[cert-number]/verify-view.tsx:105-133), which was
 * the only surface in the product that ever told anyone a certificate was revoked;
 * this is the same set of sentences aimed at a consumer holding a bag.
 *
 * Rules (.claude/skills/thai-ui-copy/SKILL.md): คุณ register, no em dash, a space
 * between Thai and Latin, and every line names the cause AND the next action.
 */
import type { TraceUncoveredCoverage } from './trace-fetch';

export type UncoveredReason = TraceUncoveredCoverage['reason'];

const COPY: Record<UncoveredReason, { title: string; body: string }> = {
  revoked: {
    title: 'ใบรับรองของแหล่งปลูกนี้ถูกเพิกถอน',
    body: 'หน่วยรับรองเพิกถอนใบรับรองของแหล่งปลูกนี้แล้ว ระบบจึงไม่แสดงข้อมูลย้อนกลับของสินค้า คุณตรวจสอบสถานะใบรับรองได้จากปุ่มด้านล่าง',
  },
  suspended: {
    title: 'ใบรับรองของแหล่งปลูกนี้ถูกระงับชั่วคราว',
    body: 'ใบรับรองอยู่ระหว่างถูกระงับ ระบบจึงยังไม่แสดงข้อมูลย้อนกลับของสินค้า หากใบรับรองกลับมามีผล หน้านี้จะแสดงข้อมูลอีกครั้งเอง คุณตรวจสอบสถานะได้จากปุ่มด้านล่าง',
  },
  expired: {
    title: 'ใบรับรองของแหล่งปลูกนี้หมดอายุแล้ว',
    body: 'ใบรับรองที่ผูกกับสินค้านี้หมดอายุแล้ว ระบบจึงไม่แสดงข้อมูลย้อนกลับ คุณตรวจสอบวันหมดอายุและสถานะล่าสุดได้จากปุ่มด้านล่าง',
  },
  renewed: {
    title: 'ใบรับรองฉบับนี้ถูกแทนที่ด้วยฉบับต่ออายุ',
    body: 'ใบรับรองฉบับที่ผูกกับสินค้านี้ถูกแทนที่แล้ว คุณดูฉบับปัจจุบันได้จากลิงก์ด้านล่าง',
  },
  missing: {
    title: 'ไม่พบใบรับรองที่ผูกกับแหล่งปลูกนี้',
    body: 'ระบบไม่พบใบรับรอง GACP ที่ผูกกับแหล่งปลูกของสินค้านี้ จึงยืนยันการรับรองให้ไม่ได้ คุณขอเอกสารรับรองจากผู้ขายได้โดยตรง',
  },
};

export function uncoveredCopy(reason: UncoveredReason) {
  return COPY[reason] ?? COPY.revoked;
}
```

- [ ] **Step 4: Write the hero**

Create `apps/web-app/src/app/trace/trace-uncovered.tsx`:

```tsx
'use client';

/**
 * The public answer when a certificate no longer covers the thing that was scanned.
 *
 * It replaces the red "ไม่พบข้อมูลผลิตภัณฑ์" card, which asserted the product does
 * not exist and was the wrong sentence in every direction: the product exists, the
 * consumer is holding it, and what changed is the certification. Parent spec :76
 * asks for "เลขใบ + สถานะจริงเสมอ + ลิงก์ verify", which is exactly this.
 *
 * Distinct from trace-unavailable.tsx (neutral amber, "ไม่สามารถตรวจสอบได้ในขณะนี้"),
 * which is for a backend that could not answer. This one IS the answer.
 */
import Link from 'next/link';
import { ShieldOff } from 'lucide-react';

import { Button } from '@/components/ui/primitives/button';
import { Card, CardContent } from '@/components/ui/primitives/card';

import type { TraceUncoveredCoverage } from './trace-fetch';
import { uncoveredCopy } from './trace-uncovered-copy';

export function TraceUncovered({ coverage }: { coverage: TraceUncoveredCoverage }) {
  const { title, body } = uncoveredCopy(coverage.reason);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-16">
      <Card className="w-full max-w-md overflow-hidden rounded-2xl border-destructive/20 shadow-xl">
        <CardContent className="space-y-5 bg-destructive/5 p-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <ShieldOff className="h-8 w-8" />
          </div>

          <h1 className="text-xl font-bold text-foreground">{title}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>

          {coverage.certificateNumber ? (
            <p className="text-sm font-bold tabular-nums text-foreground">
              เลขที่ใบรับรอง {coverage.certificateNumber}
            </p>
          ) : null}

          {coverage.verifyUrl ? (
            <Button asChild className="h-12 w-full rounded-xl font-bold">
              <Link href={coverage.verifyUrl}>ตรวจสอบใบรับรอง</Link>
            </Button>
          ) : null}

          {coverage.successorCertificateNumber ? (
            <Button asChild variant="outline" className="h-12 w-full rounded-xl font-bold">
              <Link href={`/verify/${coverage.successorCertificateNumber}`}>
                ดูฉบับปัจจุบัน {coverage.successorCertificateNumber}
              </Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

export default TraceUncovered;
```

- [ ] **Step 5: Teach `trace-fetch.ts` the new outcome**

In `apps/web-app/src/app/trace/trace-fetch.ts`, replace `:28-36`:

```ts
export interface TraceEnvelope {
    success?: boolean;
    message?: string;
    /** Set only by the certificate gate's 410 (services/trace-service/common.js). */
    code?: string;
    reason?: string;
    certificateNumber?: string | null;
    verifyUrl?: string | null;
    successorCertificateNumber?: string | null;
}

/** What the page needs in order to say something true about a withdrawn certificate. */
export interface TraceUncoveredCoverage {
    reason: 'revoked' | 'suspended' | 'expired' | 'renewed' | 'missing';
    certificateNumber: string | null;
    verifyUrl: string | null;
    successorCertificateNumber: string | null;
}

export type TraceFetchOutcome<T extends TraceEnvelope> =
    | { kind: 'ok'; payload: T }
    | { kind: 'uncovered'; coverage: TraceUncoveredCoverage }
    | { kind: 'not-found'; message: string | null }
    | { kind: 'unavailable' };

const UNCOVERED_REASONS = ['revoked', 'suspended', 'expired', 'renewed', 'missing'] as const;
```

and insert this branch **immediately before** the existing `if (status === 400 || status === 404 || status === 410)` at `:62`:

```ts
    // A 410 carrying the certificate gate's own code is a DIFFERENT verdict from
    // "not found": the record exists and the certification behind it was withdrawn.
    // Keyed on the code, not on the status, because 410 also answers a revoked plot
    // SIGN (Plot.qrRevokedAt, resolve-plot-cycle.js:251), which has no certificate
    // behind it and keeps its own copy.
    if (status === 410 && payload.code === 'CERTIFICATE_NOT_COVERING') {
        const raw = String(payload.reason || '');
        const reason = (UNCOVERED_REASONS as readonly string[]).includes(raw)
            ? (raw as TraceUncoveredCoverage['reason'])
            // An unrecognised reason still means "withdrawn"; falling back to the
            // strongest wording is safer than rendering an empty card.
            : 'revoked';
        return {
            kind: 'uncovered',
            coverage: {
                reason,
                certificateNumber: payload.certificateNumber ?? null,
                verifyUrl: payload.verifyUrl ?? null,
                successorCertificateNumber: payload.successorCertificateNumber ?? null,
            },
        };
    }
```

Update the module docblock at `:1-26`: add `'uncovered'` to the outcome list and delete the "410 + envelope (cert revoked/expired gate ...)" clause from the `'not-found'` bullet.

- [ ] **Step 6: Wire all four pages**

Each page takes the same three edits. **Generic** — `apps/web-app/src/app/trace/[qr-code]/client-view.tsx`:

```tsx
// imports
import { fetchTraceEnvelope, type TraceUncoveredCoverage } from '../trace-fetch';
import { TraceUncovered } from '../trace-uncovered';

// state, next to `unavailable`
const [uncovered, setUncovered] = useState<TraceUncoveredCoverage | null>(null);

// inside fetchTraceData, replacing :49-53
const outcome = await fetchTraceEnvelope<TraceApiResponse>(`/api/trace/${qrCode}`);
if (outcome.kind === 'unavailable') {
    setUnavailable(true);
} else if (outcome.kind === 'uncovered') {
    setUncovered(outcome.coverage);
} else if (outcome.kind === 'not-found') {
    setError(outcome.message || 'ไม่พบข้อมูลผลิตภัณฑ์');
} else {
    setTraceData(outcome.payload);
}
setLoading(false);

// render, right after the `if (unavailable)` branch and BEFORE `if (error || !traceData)`
if (uncovered) {
    return <TraceUncovered coverage={uncovered} />;
}
```

**Batch** — `apps/web-app/src/app/trace/batch/[qr-code]/client-view.tsx`: identical three edits around `:119` and before the `ไม่พบข้อมูลการตรวจสอบย้อนกลับ` card at `:170`; import path `'../../trace-uncovered'`.

**Lot** — `apps/web-app/src/app/trace/lot/[lot-id]/client-view.tsx`: identical, around `:131` and before the `ไม่พบข้อมูลล็อตสินค้า` card at `:164`; import path `'../../trace-uncovered'`.

**Plot-cycle** — `apps/web-app/src/app/trace/plot-cycle/[qr-code]/client-view.tsx`: identical around `:148-160` and before the `ไม่พบข้อมูล Trace` card at `:183`; import path `'../../trace-uncovered'`. **Plus the shield.** First extend the response type so `data.certificate` exists:

```ts
// alongside the other fields of PlotCycleTraceResponse['data']
certificate?: {
  number: string | null;
  status: string | null;
  covered: boolean;
  reason: 'revoked' | 'suspended' | 'expired' | 'renewed' | 'missing' | null;
  verifyUrl: string | null;
  successorCertificateNumber: string | null;
} | null;
```

then replace the unconditional block at `:295-298`:

```tsx
              <div className="flex items-center gap-2 rounded-xl border border-primary/10 bg-primary/5 p-3 text-xs font-bold text-primary">
                <ShieldCheck className="h-4 w-4" />
                แหล่งปลูกได้รับการรับรอง GACP
              </div>
```

with:

```tsx
              {/*
                The shield was a literal: no conditional, no data binding, and the
                backend behind it never asked either, so a plot whose certificate had
                been revoked showed a scanner "แหล่งปลูกได้รับการรับรอง GACP". It now
                paints only from the server's own verdict and carries the certificate
                number, so the claim is checkable.
                A gated certificate never reaches this render (the page returns
                TraceUncovered above); what remains is covered:true, or a plot with no
                certificate at all, which now claims nothing.
              */}
              {data.certificate?.covered ? (
                <div className="space-y-2 rounded-xl border border-primary/10 bg-primary/5 p-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-primary">
                    <ShieldCheck className="h-4 w-4" />
                    แหล่งปลูกได้รับการรับรอง GACP
                  </div>
                  {data.certificate.number ? (
                    <p className="text-[11px] font-medium text-muted-foreground">
                      เลขที่ใบรับรอง {data.certificate.number}{' '}
                      {data.certificate.verifyUrl ? (
                        <Link href={data.certificate.verifyUrl} className="font-bold text-primary underline">
                          ตรวจสอบใบรับรอง
                        </Link>
                      ) : null}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs font-medium text-muted-foreground">
                  แปลงนี้ยังไม่มีใบรับรอง GACP ที่ผูกไว้ในระบบ คุณขอเอกสารรับรองจากผู้ขายได้โดยตรง
                </div>
              )}
```

- [ ] **Step 7: Run the web tests, then lint**

```bash
cd apps/web-app && npx jest src/app/trace
npx jest src/app/health/planting
npm run lint
```

Expected: PASS, and `lint` clean (`--max-warnings=0`). The lint run is not optional: `no-thai-letterspacing` is the machine behind the typography rule.

- [ ] **Step 8: Ratchet + commit**

```bash
cd ../.. && bash scripts/check-done.sh ratchet
git add apps/web-app/src/app/trace
git commit -m "fix(trace): a withdrawn certificate reads as withdrawn, not as missing"
```

---

### Task 5: the farmer keeps the record, and starts nothing new without cover

**Files:**
- Modify: `apps/backend/services/planting-service.js` — `CYCLE_STATUSES` `:52`, `listByFarm` `:137-158`, `listByOwner` `:159-183`, `createCycle`'s certificate block `:270-305`, `getCycleSummaryInclude` `:495-544`, `decorateCycleSummary` `:1020-1066`; add `cancelUncoveredCycle` and `coverageForCycle`
- Modify: `apps/backend/services/planting-cycle-service.js:159-162` (`isReservedCycleStatus`), `:212` (the docblock naming a function that does not exist), `:309-336` (`verifyOwnedCycle`)
- Modify: `apps/backend/services/planting-cycle/harvest-capacity-operations.js:31-61`
- Modify: `apps/backend/routes/api/cultivation/planting-cycles-activity-harvest-routes.js:222-242`
- Modify: `apps/backend/routes/api/cultivation/planting-cycles.js` (the cancel route)
- Modify: `apps/backend/routes/api/cultivation/planting-cycles-plot-routes.js:35-77`
- Modify: `apps/backend/routes/api/trace/lots.js:108-160`
- Test: `apps/backend/__tests__/unit/planting-coverage-list.test.js`, `apps/backend/__tests__/unit/cancel-uncovered-cycle.test.js` (both create)

> **Pointer corrections against HEAD:** facts.md calls the R15 guard `assertNoOpenCycle` at `:71-121`; at HEAD it is **`assertPlotsHaveNoOpenCycle`** at `:73-121`. `isActiveCertificateStatus` `:122-124` and `getActiveCertificateWhere` `:125-135` — correct. `createCycle` begins at `:193` (facts.md says `:270`); its certificate block is `:270-305` — correct. `harvest-capacity-operations.js:53-60` — correct. The dead `hasActiveCertificate` is `:274-281`, the `requireActiveCert` option `:323-331` — correct.

**Interfaces:**
- Consumes: `resolveCertificateCoverage` (Task 1); the literal `'CERTIFICATE_NOT_COVERING'` (catalogued by Task 9, which adds the entry and its test).
- Produces:
  - every cycle summary carries `coverage: CycleCoverage` (shape in the Interfaces section) — read by Task 6
  - `plantingService.cancelUncoveredCycle(cycleId, { reason, actorId })` returns the updated cycle row
  - `plantingService.coverageForCycle(cycleId)` returns a `CertificateCoverage` — used by Task 7
  - `plantingService.buildNotCoveringError(coverage, action)` returns the shared refusal `Error` — used by Task 7
  - `POST /api/cultivation/planting-cycles/:id/cancel-uncovered`, body `{ reason: string }`; 200 on success, 400 `CANCEL_REASON_REQUIRED`, 409 `CYCLE_STILL_COVERED` / `CYCLE_NOT_OPEN`, 404 `CYCLE_NOT_FOUND`
  - cycle status `'CANCELLED_UNCOVERED'`: in `CYCLE_STATUSES`, absent from `OPEN_CYCLE_STATUSES`
  - refusals throw `{ code:'CERTIFICATE_NOT_COVERING', statusCode:409, reason, certificateNumber, verifyUrl, successorCertificateNumber }`

- [ ] **Step 1: Write the failing list/create test — spec §4 RED (3) and (4)**

Create `apps/backend/__tests__/unit/planting-coverage-list.test.js`:

```js
/**
 * RED (3) and (4) of the spec's §4.
 *
 * (3) planting-service.js:137-183 hard-filters both list methods on an ACTIVE,
 *     unexpired certificate, so a cycle under a revoked one silently vanishes from
 *     the farmer's list. Parent spec :52 says the opposite ("บันทึกรอบเดิมต่อได้"):
 *     you cannot record on a cycle you cannot see, and the R15 guard then refuses a
 *     new cycle by naming the invisible one (facts.md §3.2, G4).
 * (4) createCycle's gate exists but planting-cycle-service.js's requireActiveCert has
 *     zero callers (facts.md §3.6, G13). This gives it one.
 *
 * jest loads apps/backend/.env through @prisma/client, so every predicate here is
 * pinned on the fixture rather than on ambient env.
 */
'use strict';

const mockPrisma = {
    plantingCycle: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    certificate: { findUnique: jest.fn(), findFirst: jest.fn() },
    farm: { findFirst: jest.fn() },
    plot: { findMany: jest.fn() },
    $transaction: jest.fn(),
};
jest.mock('../../services/prisma-database', () => ({ prisma: mockPrisma }));
jest.mock('../../server', () => ({ prisma: mockPrisma }));
jest.mock('../../services/farm-access', () => ({ farmAccessWhere: async () => ({ ownerId: 'user-1' }) }));

const plantingService = require('../../services/planting-service');

const FUTURE = new Date(Date.now() + 365 * 24 * 3600 * 1000);
const PAST = new Date(Date.now() - 24 * 3600 * 1000);

const cert = (over = {}) => ({
    id: 'cert-1', certificateNumber: 'GACP-TH-2569-CAE820', farmId: 'farm-1',
    status: 'active', expiryDate: FUTURE, issuedDate: PAST, isDeleted: false,
    revokedAt: null, suspendedAt: null, reinstatedAt: null, renewedCertificateId: null, ...over,
});

const cycleRow = (certificate) => ({
    id: 'cycle-1', cycleName: 'รอบที่ 1/2567 ฤดูแล้ง', status: 'PLANTED',
    farmId: 'farm-1', certificateId: certificate ? certificate.id : null, certificate,
    startDate: PAST, expectedHarvestDate: null, plotArea: 200, areaUnit: 'sqm',
    estimatedPlantCount: 10, cultivationType: 'OUTDOOR', plotId: 'plot-1',
    farm: { id: 'farm-1', farmName: 'ไร่ใจดีสมุนไพรไทย' },
    plantSpecies: { id: 'p1', code: 'cannabis', nameTH: 'กัญชา', nameEN: 'Cannabis' },
    cyclePlots: [], batches: [], _count: { batches: 0, cultivationLogs: 0, cyclePlots: 0 },
});

beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.certificate.findUnique.mockResolvedValue(null);
});

describe('listByOwner / listByFarm return every cycle, labelled (RED 3)', () => {
    it('returns a cycle whose certificate was REVOKED, labelled uncovered', async () => {
        mockPrisma.plantingCycle.findMany.mockResolvedValue([
            cycleRow(cert({ status: 'revoked', revokedAt: PAST })),
        ]);

        const rows = await plantingService.listByOwner('user-1');

        expect(rows).toHaveLength(1);
        expect(rows[0].coverage).toEqual({
            covered: false,
            reason: 'revoked',
            certificateNumber: 'GACP-TH-2569-CAE820',
            successorCertificateNumber: null,
            verifyUrl: '/verify/GACP-TH-2569-CAE820',
        });
    });

    it('no longer asks the database to filter on certificate status at all', async () => {
        mockPrisma.plantingCycle.findMany.mockResolvedValue([]);
        await plantingService.listByOwner('user-1');
        const where = mockPrisma.plantingCycle.findMany.mock.calls[0][0].where;
        // The whole bug was here: `certificate: getActiveCertificateWhere(now)` plus
        // `certificateId: { not: null }` made the row unmatchable.
        expect(where.certificate).toBeUndefined();
        expect(where.certificateId).toBeUndefined();
    });

    it('listByFarm behaves identically', async () => {
        mockPrisma.plantingCycle.findMany.mockResolvedValue([
            cycleRow(cert({ status: 'suspended', suspendedAt: PAST })),
        ]);
        const rows = await plantingService.listByFarm('farm-1');
        expect(rows[0].coverage.reason).toBe('suspended');
        expect(mockPrisma.plantingCycle.findMany.mock.calls[0][0].where.certificate).toBeUndefined();
    });

    it('labels a covered cycle as covered', async () => {
        mockPrisma.plantingCycle.findMany.mockResolvedValue([cycleRow(cert())]);
        const rows = await plantingService.listByOwner('user-1');
        expect(rows[0].coverage).toMatchObject({ covered: true, reason: null });
    });

    it('labels a cycle with no certificate as missing, and never crashes on it', async () => {
        mockPrisma.plantingCycle.findMany.mockResolvedValue([cycleRow(null)]);
        const rows = await plantingService.listByOwner('user-1');
        expect(rows[0].coverage).toMatchObject({ covered: false, reason: 'missing', certificateNumber: null });
    });

    it('still refuses to trust a certificate belonging to another farm', async () => {
        mockPrisma.plantingCycle.findMany.mockResolvedValue([cycleRow(cert({ farmId: 'farm-OTHER' }))]);
        const rows = await plantingService.listByOwner('user-1');
        expect(rows[0].coverage.reason).toBe('missing');
    });

    it('follows a renewal, so a re-certified farm keeps working without moving the FK', async () => {
        mockPrisma.plantingCycle.findMany.mockResolvedValue([
            cycleRow(cert({ status: 'renewed', renewedCertificateId: 'cert-2' })),
        ]);
        mockPrisma.certificate.findUnique.mockResolvedValue(
            cert({ id: 'cert-2', certificateNumber: 'GACP-TH-2569-E5960D' }),
        );
        const rows = await plantingService.listByOwner('user-1');
        expect(rows[0].coverage).toMatchObject({
            covered: true, reason: null,
            certificateNumber: 'GACP-TH-2569-CAE820',
            successorCertificateNumber: 'GACP-TH-2569-E5960D',
        });
    });

    it('does not leak the 410 body builder onto the wire', async () => {
        mockPrisma.plantingCycle.findMany.mockResolvedValue([cycleRow(cert())]);
        const rows = await plantingService.listByOwner('user-1');
        expect(Object.keys(rows[0].coverage).sort()).toEqual([
            'certificateNumber', 'covered', 'reason', 'successorCertificateNumber', 'verifyUrl',
        ].sort());
    });
});

describe('createCycle needs a covering certificate (RED 4)', () => {
    const payload = () => ({
        farmId: 'farm-1', certificateId: 'cert-1', plantSpeciesId: 'p1',
        cycleName: 'รอบใหม่', startDate: new Date().toISOString(),
        plotAssignments: [{ plotId: 'plot-1', allocatedAreaSqm: 100, plannedPlantCount: 10 }],
    });

    beforeEach(() => {
        mockPrisma.farm.findFirst.mockResolvedValue({ id: 'farm-1', ownerId: 'user-1' });
        mockPrisma.plot.findMany.mockResolvedValue([
            { id: 'plot-1', name: 'แปลงกลางแจ้ง 1', areaSqm: 200, area: 200, areaUnit: 'sqm', solarSystem: 'OUTDOOR' },
        ]);
    });

    it('refuses a REVOKED certificate with CERTIFICATE_NOT_COVERING', async () => {
        mockPrisma.certificate.findUnique.mockResolvedValue(cert({ status: 'revoked', revokedAt: PAST }));

        await expect(plantingService.createCycle(payload())).rejects.toMatchObject({
            code: 'CERTIFICATE_NOT_COVERING',
            statusCode: 409,
            reason: 'revoked',
            certificateNumber: 'GACP-TH-2569-CAE820',
            verifyUrl: '/verify/GACP-TH-2569-CAE820',
        });
    });

    it('the Thai message names the cause and the next action, with no em dash', async () => {
        mockPrisma.certificate.findUnique.mockResolvedValue(cert({ status: 'revoked', revokedAt: PAST }));
        const err = await plantingService.createCycle(payload()).catch((e) => e);
        expect(err.message).toContain('ถูกเพิกถอน');
        expect(err.message).toContain('คุณ');
        expect(err.message).not.toContain('—');
        expect(err.message).not.toContain('ท่าน');
    });

    it('refuses SUSPENDED and EXPIRED with their own reasons', async () => {
        mockPrisma.certificate.findUnique.mockResolvedValue(cert({ status: 'suspended', suspendedAt: PAST }));
        await expect(plantingService.createCycle(payload())).rejects.toMatchObject({ reason: 'suspended' });

        mockPrisma.certificate.findUnique.mockResolvedValue(cert({ expiryDate: PAST }));
        await expect(plantingService.createCycle(payload())).rejects.toMatchObject({ reason: 'expired' });
    });

    it('accepts a renewed certificate whose successor is live', async () => {
        mockPrisma.certificate.findUnique
            .mockResolvedValueOnce(cert({ status: 'renewed', renewedCertificateId: 'cert-2' }))
            .mockResolvedValueOnce(cert({ id: 'cert-2', certificateNumber: 'GACP-TH-2569-E5960D' }));
        mockPrisma.$transaction.mockImplementation(async (fn) => fn({
            plantingCycle: { create: async () => ({ id: 'new-1' }), findMany: async () => [] },
            plantingCyclePlot: { createMany: async () => ({}) },
        }));
        await expect(plantingService.createCycle(payload())).resolves.toBeDefined();
    });
});
```

- [ ] **Step 2: Write the failing cancel test**

Create `apps/backend/__tests__/unit/cancel-uncovered-cycle.test.js`:

```js
/**
 * The in-app exit that does not exist today (facts.md G4). A cycle under a
 * withdrawn certificate cannot be harvested, so it holds its plot open forever, so
 * R15 refuses every new cycle on that ground, and the 409 tells the farmer to close
 * it by recording the harvest, which is the one thing they cannot do. Spec §3.1:
 * the way out is to CANCEL the cycle, with a reason, and the plot is free again.
 */
'use strict';

const mockPrisma = {
    plantingCycle: { findUnique: jest.fn(), update: jest.fn() },
    certificate: { findUnique: jest.fn() },
};
jest.mock('../../services/prisma-database', () => ({ prisma: mockPrisma }));
jest.mock('../../server', () => ({ prisma: mockPrisma }));

const plantingService = require('../../services/planting-service');
const { OPEN_CYCLE_STATUSES, CYCLE_STATUSES } = require('../../services/planting-service');

const PAST = new Date(Date.now() - 24 * 3600 * 1000);
const FUTURE = new Date(Date.now() + 365 * 24 * 3600 * 1000);

const revokedCert = {
    id: 'cert-1', certificateNumber: 'GACP-TH-2569-CAE820', farmId: 'farm-1',
    status: 'revoked', revokedAt: PAST, expiryDate: FUTURE, issuedDate: PAST,
    isDeleted: false, suspendedAt: null, reinstatedAt: null, renewedCertificateId: null,
};

beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.certificate.findUnique.mockResolvedValue(null);
    mockPrisma.plantingCycle.update.mockImplementation(async ({ data }) => ({ id: 'cycle-1', ...data }));
});

describe('cancelUncoveredCycle', () => {
    it('cancels an open uncovered cycle and records the reason without deleting anything', async () => {
        mockPrisma.plantingCycle.findUnique.mockResolvedValue({
            id: 'cycle-1', status: 'PLANTED', farmId: 'farm-1', isDeleted: false,
            notes: 'บันทึกเดิม', certificate: revokedCert,
        });

        const out = await plantingService.cancelUncoveredCycle('cycle-1', {
            reason: 'ใบรับรองถูกเพิกถอน จึงปิดรอบนี้เพื่อเริ่มรอบใหม่ใต้ใบปัจจุบัน',
            actorId: 'user-1',
        });

        expect(out.status).toBe('CANCELLED_UNCOVERED');
        const written = mockPrisma.plantingCycle.update.mock.calls[0][0].data;
        expect(written.status).toBe('CANCELLED_UNCOVERED');
        expect(written.notes).toContain('บันทึกเดิม');
        expect(written.notes).toContain('CYCLE_CANCEL_META:');
        expect(written.notes).toContain('ใบรับรองถูกเพิกถอน');
        // Nothing is soft-deleted and no plot assignment is removed.
        expect(written.isDeleted).toBeUndefined();
    });

    it('refuses without a reason', async () => {
        mockPrisma.plantingCycle.findUnique.mockResolvedValue({
            id: 'cycle-1', status: 'PLANTED', farmId: 'farm-1', isDeleted: false, certificate: revokedCert,
        });
        await expect(plantingService.cancelUncoveredCycle('cycle-1', { reason: '  ', actorId: 'user-1' }))
            .rejects.toMatchObject({ code: 'CANCEL_REASON_REQUIRED', statusCode: 400 });
    });

    it('refuses a cycle that IS still covered: this is not a delete button', async () => {
        mockPrisma.plantingCycle.findUnique.mockResolvedValue({
            id: 'cycle-1', status: 'PLANTED', farmId: 'farm-1', isDeleted: false,
            certificate: { ...revokedCert, status: 'active', revokedAt: null },
        });
        await expect(plantingService.cancelUncoveredCycle('cycle-1', { reason: 'อยากลบรอบนี้', actorId: 'user-1' }))
            .rejects.toMatchObject({ code: 'CYCLE_STILL_COVERED', statusCode: 409 });
    });

    it('refuses a cycle that is already closed', async () => {
        mockPrisma.plantingCycle.findUnique.mockResolvedValue({
            id: 'cycle-1', status: 'HARVESTED', farmId: 'farm-1', isDeleted: false, certificate: revokedCert,
        });
        await expect(plantingService.cancelUncoveredCycle('cycle-1', { reason: 'ปิดรอบนี้', actorId: 'user-1' }))
            .rejects.toMatchObject({ code: 'CYCLE_NOT_OPEN', statusCode: 409 });
    });

    it('the new status is legal but NOT open, so the plot is released (R15)', () => {
        expect(CYCLE_STATUSES).toContain('CANCELLED_UNCOVERED');
        expect(OPEN_CYCLE_STATUSES).not.toContain('CANCELLED_UNCOVERED');
    });
});
```

- [ ] **Step 3: Run both and watch them fail**

```bash
cd apps/backend && npx jest __tests__/unit/planting-coverage-list.test.js __tests__/unit/cancel-uncovered-cycle.test.js
```

Expected: FAIL — `rows[0].coverage` is `undefined`, `where.certificate` is defined, and `plantingService.cancelUncoveredCycle is not a function`.

- [ ] **Step 4: Stop filtering; ship coverage**

In `apps/backend/services/planting-service.js` add the import:

```js
const { resolveCertificateCoverage } = require('./trace-service/common');
```

Extend the status set at `:52` and leave `OPEN_CYCLE_STATUSES` (`:54`) alone:

```js
// CANCELLED_UNCOVERED is a legal status and deliberately NOT open: a cycle the
// farmer cancelled because its certificate stopped covering it must release the
// plot, or the R15 guard keeps refusing every new cycle on that ground. It is the
// in-app exit from the closed loop facts.md records as G4.
const CYCLE_STATUSES = ['PLANNING', 'PLANTED', 'GROWING', 'READY_HARVEST', 'HARVESTED', 'COMPLETED', 'CANCELLED_UNCOVERED'];

const CYCLE_CANCEL_META_PREFIX = 'CYCLE_CANCEL_META:';
```

Widen the `certificate` block inside `getCycleSummaryInclude()` (`:507-514`) to the full coverage projection:

```js
      certificate: {
        select: {
          id: true, certificateNumber: true, farmId: true, status: true,
          issuedDate: true, expiryDate: true, isDeleted: true,
          revokedAt: true, suspendedAt: true, reinstatedAt: true, renewedCertificateId: true,
        },
      },
```

Rewrite `listByFarm` (`:137-158`):

```js
  async listByFarm(farmId, status) {
    // The certificate filter that used to live here is GONE (spec §3.1). It made a
    // cycle under a revoked certificate unmatchable, so the farmer's own history
    // silently disappeared and parent spec :52 ("บันทึกรอบเดิมต่อได้") could not be
    // honoured: you cannot record on a cycle you cannot see. Coverage is now a LABEL
    // on every row, never a filter over them.
    const where = { farmId, isDeleted: false };
    if (status) {
      where.status = String(status).toUpperCase();
    }
    const cycles = await prisma.plantingCycle.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: this.getCycleSummaryInclude(),
    });
    return Promise.all(cycles.map((cycle) => this.decorateCycleSummaryWithCoverage(cycle)));
  }
```

`listByOwner` (`:159-183`) becomes the same, keeping its `farm: { ...(await farmAccessWhere(userId)), isDeleted: false }` clause and dropping only `certificateId` and `certificate`. **The old post-query `.filter(cycle => cycle.certificate.farmId === cycle.farmId)` must NOT survive as a filter** — it would drop the row again. That check moves into the decorator:

```js
  /**
   * A cycle summary plus the live answer to "is this under certification right now".
   *
   * Cross-farm hardening happens HERE rather than as a row filter: a certificate
   * belonging to another farm is not trusted (the rule
   * trace-service/resolve-generic.js:242-244 applies), but the cycle is still the
   * farmer's and still theirs to see.
   */
  async decorateCycleSummaryWithCoverage(cycle) {
    const certRow = cycle.certificate
      && String(cycle.certificate.farmId || '') === String(cycle.farmId || '')
      ? cycle.certificate
      : null;
    const coverage = await resolveCertificateCoverage(certRow, { client: prisma });
    return {
      ...this.decorateCycleSummary(cycle),
      // `minimalBody` is a function and is deliberately not serialised: this object
      // crosses the wire to the farmer's browser, and the public 410 body is not a
      // farmer-facing concern.
      coverage: {
        covered: coverage.covered,
        reason: coverage.reason,
        certificateNumber: coverage.certificateNumber,
        successorCertificateNumber: coverage.successorCertificateNumber,
        verifyUrl: coverage.verifyUrl,
      },
    };
  }
```

Export the status lists and the helpers at the bottom (the module currently ends `module.exports = new PlantingService();` at `:1067`):

```js
const service = new PlantingService();
module.exports = service;
module.exports.CYCLE_STATUSES = CYCLE_STATUSES;
module.exports.OPEN_CYCLE_STATUSES = OPEN_CYCLE_STATUSES;
module.exports.CYCLE_CANCEL_META_PREFIX = CYCLE_CANCEL_META_PREFIX;
module.exports.buildNotCoveringError = buildNotCoveringError;
```

- [ ] **Step 5: Add the one refusal builder every "new artefact" door uses**

Near the top of `apps/backend/services/planting-service.js`:

```js
/**
 * The refusal every "you may not start something new" door throws.
 *
 * One builder so the machine code, the HTTP status and the Thai sentence cannot
 * drift between the five doors that use it (create cycle, harvest cut, batch, lot,
 * plot QR). The catalogue entry is shared/error-codes.js CERTIFICATE_NOT_COVERING.
 *
 * Copy rules (.claude/skills/thai-ui-copy/SKILL.md): คุณ register, cause first then
 * the next action, no em dash, a space between Thai and Latin.
 */
const COVERAGE_REFUSAL_CAUSE = Object.freeze({
  revoked: 'ใบรับรองของฟาร์มนี้ถูกเพิกถอน',
  suspended: 'ใบรับรองของฟาร์มนี้ถูกระงับชั่วคราว',
  expired: 'ใบรับรองของฟาร์มนี้หมดอายุแล้ว',
  renewed: 'ใบรับรองฉบับนี้ถูกแทนที่ด้วยฉบับต่ออายุแล้ว',
  missing: 'ยังไม่มีใบรับรอง GACP ผูกกับฟาร์มนี้',
});

function buildNotCoveringError(coverage, action) {
  const cause = COVERAGE_REFUSAL_CAUSE[coverage.reason] || COVERAGE_REFUSAL_CAUSE.revoked;
  const next = coverage.successorCertificateNumber
    ? `คุณเลือกใบรับรองฉบับปัจจุบันเลขที่ ${coverage.successorCertificateNumber} แล้วทำรายการอีกครั้ง`
    : `คุณจึงยัง${action}ไม่ได้ ข้อมูลรอบปลูกเดิมยังบันทึกต่อได้ตามปกติ ตรวจสอบสถานะใบรับรองได้ที่เมนูใบรับรอง`;
  const error = new Error(`${cause} ${next}`);
  error.code = 'CERTIFICATE_NOT_COVERING';
  error.statusCode = 409;
  error.reason = coverage.reason;
  error.certificateNumber = coverage.certificateNumber;
  error.verifyUrl = coverage.verifyUrl;
  error.successorCertificateNumber = coverage.successorCertificateNumber;
  return error;
}
```

- [ ] **Step 6: Gate `createCycle` through the shared definition**

Replace the certificate block at `:270-305`:

```js
    // ── Coverage gate (spec §3.1; parent spec :52 "เริ่มรอบใหม่ไม่ได้ จนใบกลับมา active") ──
    //
    // The three ad-hoc string checks that stood here ('Certificate is not active',
    // 'Certificate has expired') are replaced by the single definition, so this door
    // and the public trace door can never disagree about what "active" means.
    let resolvedCertificateId = certificateId ? String(certificateId) : null;
    const CERT_COVERAGE_SELECT = {
      id: true, certificateNumber: true, farmId: true, status: true,
      issuedDate: true, expiryDate: true, isDeleted: true,
      revokedAt: true, suspendedAt: true, reinstatedAt: true, renewedCertificateId: true,
    };
    let certRow = null;
    if (resolvedCertificateId) {
      certRow = await prisma.certificate.findUnique({
        where: { id: resolvedCertificateId },
        select: CERT_COVERAGE_SELECT,
      });
      if (!certRow || certRow.farmId !== farmId) {
        throw new Error('Certificate not found for this farm');
      }
    } else {
      // Auto-link the farm's latest covering certificate. Unchanged in intent: the
      // query still asks for an active, unexpired row, and the coverage check below
      // is what actually decides.
      certRow = await prisma.certificate.findFirst({
        where: {
          farmId: String(farmId),
          isDeleted: false,
          OR: [{ status: 'active' }, { status: 'ACTIVE' }],
          expiryDate: { gte: new Date() },
        },
        orderBy: [{ issuedDate: 'desc' }, { createdAt: 'desc' }],
        select: CERT_COVERAGE_SELECT,
      });
      if (!certRow) {
        throw new Error('Active certificate is required before creating planting cycle');
      }
      resolvedCertificateId = certRow.id;
    }

    const coverage = await resolveCertificateCoverage(certRow, { client: prisma });
    if (!coverage.covered) {
      throw buildNotCoveringError(coverage, 'เริ่มรอบปลูกใหม่');
    }
```

- [ ] **Step 7: Make `requireActiveCert` a real caller (facts.md G13)**

In `apps/backend/services/planting-cycle-service.js`, add `const { resolveCertificateCoverage } = require('./trace-service/common');` and replace the option block at `:323-331`:

```js
    if (options.requireActiveCert === true) {
        // Was a second hand-rolled where-clause ({ status: { in: ['active','ACTIVE'] },
        // expiryDate: { gte: now } }) with zero callers: a rule nobody enforced and
        // nobody could test. It now asks certificateCoverage, so this option means
        // exactly what the public trace door means.
        const owned = await prisma.plantingCycle.findFirst({
            where,
            select: {
                id: true, farmId: true,
                certificate: {
                    select: {
                        id: true, certificateNumber: true, farmId: true, status: true,
                        issuedDate: true, expiryDate: true, isDeleted: true,
                        revokedAt: true, suspendedAt: true, reinstatedAt: true, renewedCertificateId: true,
                    },
                },
            },
        });
        if (!owned) { return null; }
        const certRow = owned.certificate
            && String(owned.certificate.farmId || '') === String(owned.farmId || '')
            ? owned.certificate
            : null;
        const coverage = await resolveCertificateCoverage(certRow, { client: prisma });
        return coverage.covered ? { id: owned.id, farmId: owned.farmId } : null;
    }
```

Fix the `:212` docblock, which names a `requireActiveCertificate(cycle)` that has never existed: say the gate is `verifyOwnedCycle(..., { requireActiveCert: true })` and that `hasActiveCertificate` is being deleted (Task 11).

Add `CANCELLED_UNCOVERED` to `isReservedCycleStatus` (`:159-162`):

```js
function isReservedCycleStatus(status) {
    const normalized = String(status || '').toUpperCase();
    // CANCELLED_UNCOVERED joins HARVESTED/COMPLETED: a cancelled cycle occupies no
    // ground and must not count against the farm's planted capacity.
    return !['HARVESTED', 'COMPLETED', 'CANCELLED_UNCOVERED'].includes(normalized);
}
```

- [ ] **Step 8: Gate the harvest cut at BOTH dates**

In `apps/backend/services/planting-cycle/harvest-capacity-operations.js`, widen the certificate `select` in the cycle load (`:35`) to the full coverage projection and add `farmId: true` to the cycle selection, then replace `:53-60`:

```js
    if (!cycle.certificateId) {
        return { status: 400, body: { success: false, message: 'Active certificate is required before harvest' } };
    }

    // ── Coverage at the cut date AND now (parent spec :144; see the plan's
    // contradiction #1). §144 asks that the certificate was active ON the harvest
    // date "ไม่ใช่แค่ active วันนี้" — not MERELY active today. Checking only the cut
    // date would let a back-dated harvest walk straight past a revocation, so both
    // questions are asked and both must answer yes.
    const certRow = cycle.certificate
        && String(cycle.certificate.farmId || '') === String(cycle.farmId || '')
        ? cycle.certificate
        : null;
    const coverageNow = await resolveCertificateCoverage(certRow, { client: prisma });
    const coverageAtCut = await resolveCertificateCoverage(certRow, { client: prisma, asOf: harvestDate });
    const failing = !coverageNow.covered ? coverageNow : (!coverageAtCut.covered ? coverageAtCut : null);
    if (failing) {
        const error = buildNotCoveringError(failing, 'บันทึกการเก็บเกี่ยว');
        return {
            status: 409,
            body: {
                success: false,
                code: error.code,
                reason: error.reason,
                certificateNumber: error.certificateNumber,
                verifyUrl: error.verifyUrl,
                successorCertificateNumber: error.successorCertificateNumber,
                message: error.message,
            },
        };
    }
```

`resolveCertificateCoverage` and `buildNotCoveringError` arrive through the `deps` object `createHarvestCapacityOperations(deps)` destructures at `:6-18`; add both names there and pass them from the injection site in `planting-cycle-service.js`. Apply the identical block to the legacy door `apps/backend/routes/api/cultivation/planting-cycles-activity-harvest-routes.js:222-242` — the same three string checks live there, and facts.md records that this file has **no test of its own**, so its gate must be a copy of the service's, never a second opinion.

- [ ] **Step 9: Gate lot creation and plot-QR generation**

`apps/backend/routes/api/trace/lots.js` — after the batch-exists check (`:117-124`), before `createLotWithQuotaCheck`:

```js
        // A lot is a NEW artefact carrying a GACP mark, so it needs live coverage
        // (spec §3.1). Existing lots are untouched: nothing is deleted, and their
        // public trace answers 410 through the certificate gate instead.
        const batchForCoverage = await prisma.harvestBatch.findUnique({
            where: { id: batchId },
            select: {
                cycle: {
                    select: {
                        farmId: true,
                        certificate: {
                            select: {
                                id: true, certificateNumber: true, farmId: true, status: true,
                                issuedDate: true, expiryDate: true, isDeleted: true,
                                revokedAt: true, suspendedAt: true, reinstatedAt: true, renewedCertificateId: true,
                            },
                        },
                    },
                },
            },
        });
        const lotCertRow = batchForCoverage?.cycle?.certificate
            && String(batchForCoverage.cycle.certificate.farmId || '') === String(batchForCoverage.cycle.farmId || '')
            ? batchForCoverage.cycle.certificate
            : null;
        const lotCoverage = await resolveCertificateCoverage(lotCertRow, { client: prisma });
        if (!lotCoverage.covered) {
            const err = plantingService.buildNotCoveringError(lotCoverage, 'สร้างล็อตสินค้าใหม่');
            return res.status(409).json({
                success: false, code: err.code, reason: err.reason,
                certificateNumber: err.certificateNumber, verifyUrl: err.verifyUrl,
                successorCertificateNumber: err.successorCertificateNumber, message: err.message,
            });
        }
```

`apps/backend/routes/api/cultivation/planting-cycles-plot-routes.js` — in `POST /:id/plot-qrs/generate`, after `loadOwnedCycleWithPlots` returns the cycle (`:37-42`) and before `generatePlotCycleQrsForCycle`:

```js
    // R3 (parent spec :18): a QR exists only behind a certificate. That was enforced
    // at cycle-creation ONLY and never re-checked, so a farmer whose certificate was
    // revoked could still mint fresh plot QR codes bearing GACP marks (facts.md G2).
    // Printed signs are NOT recalled: they keep scanning, and the public trace answers
    // 410 through the same gate.
    const qrCoverage = await plantingService.coverageForCycle(cycle.id);
    if (!qrCoverage.covered) {
      const err = plantingService.buildNotCoveringError(qrCoverage, 'สร้างหรือรีเฟรช QR ของแปลง');
      return res.status(409).json({
        success: false, code: err.code, reason: err.reason,
        certificateNumber: err.certificateNumber, verifyUrl: err.verifyUrl,
        successorCertificateNumber: err.successorCertificateNumber, message: err.message,
      });
    }
```

which needs one more method on the service:

```js
  /** The coverage of the certificate a cycle is bound to, cross-farm check included. */
  async coverageForCycle(cycleId) {
    const cycle = await prisma.plantingCycle.findUnique({
      where: { id: String(cycleId) },
      select: {
        farmId: true,
        certificate: {
          select: {
            id: true, certificateNumber: true, farmId: true, status: true,
            issuedDate: true, expiryDate: true, isDeleted: true,
            revokedAt: true, suspendedAt: true, reinstatedAt: true, renewedCertificateId: true,
          },
        },
      },
    });
    const certRow = cycle?.certificate
      && String(cycle.certificate.farmId || '') === String(cycle.farmId || '')
      ? cycle.certificate
      : null;
    return resolveCertificateCoverage(certRow, { client: prisma });
  }
```

- [ ] **Step 10: Write the cancel door**

Add to `PlantingService`:

```js
  /**
   * Cancel a cycle whose certificate stopped covering it (spec §3.1).
   *
   * The loop this exits (facts.md G4): a cycle under a revoked certificate cannot be
   * harvested, so it holds its plot open forever, so R15 refuses every new cycle on
   * that ground, and the 409 tells the farmer to "close it by recording the harvest",
   * which is the one thing they cannot do. There was no in-app way out.
   *
   * Nothing is deleted. The row keeps its plots, its logs, its batches and its
   * history; only the status changes, and the reason is appended to `notes` under the
   * same JSON-meta convention trace-service/common.js uses for plot harvests
   * (PLOT_HARVEST_META_PREFIX), so recording WHY needs no migration.
   */
  async cancelUncoveredCycle(cycleId, { reason, actorId } = {}) {
    const cleanReason = reason != null ? String(reason).trim() : '';
    if (cleanReason.length < 5) {
      const error = new Error('กรุณาระบุเหตุผลที่ยกเลิกรอบปลูกนี้ อย่างน้อย 5 ตัวอักษร เพื่อให้บันทึกใช้อ้างอิงกับผู้ตรวจได้');
      error.code = 'CANCEL_REASON_REQUIRED';
      error.statusCode = 400;
      throw error;
    }

    const cycle = await prisma.plantingCycle.findUnique({
      where: { id: String(cycleId) },
      select: {
        id: true, status: true, farmId: true, isDeleted: true, notes: true,
        certificate: {
          select: {
            id: true, certificateNumber: true, farmId: true, status: true,
            issuedDate: true, expiryDate: true, isDeleted: true,
            revokedAt: true, suspendedAt: true, reinstatedAt: true, renewedCertificateId: true,
          },
        },
      },
    });
    if (!cycle || cycle.isDeleted) {
      const error = new Error('ไม่พบรอบปลูกนี้ กรุณาโหลดหน้านี้ใหม่แล้วลองอีกครั้ง');
      error.code = 'CYCLE_NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }
    if (!OPEN_CYCLE_STATUSES.includes(String(cycle.status || '').toUpperCase())) {
      const error = new Error('รอบปลูกนี้ปิดไปแล้ว จึงยกเลิกไม่ได้ คุณเริ่มรอบใหม่ในพื้นที่นี้ได้เลย');
      error.code = 'CYCLE_NOT_OPEN';
      error.statusCode = 409;
      throw error;
    }

    const certRow = cycle.certificate
      && String(cycle.certificate.farmId || '') === String(cycle.farmId || '')
      ? cycle.certificate
      : null;
    const coverage = await resolveCertificateCoverage(certRow, { client: prisma });
    if (coverage.covered) {
      // This door exists for ONE situation. It is not a delete button for a cycle the
      // farmer changed their mind about: a covered cycle closes by recording its
      // harvest, which is what keeps the mass balance honest (parent spec §7.4).
      const error = new Error('รอบปลูกนี้ยังอยู่ภายใต้ใบรับรองที่ใช้งานได้ คุณปิดรอบได้ด้วยการบันทึกการเก็บเกี่ยว');
      error.code = 'CYCLE_STILL_COVERED';
      error.statusCode = 409;
      throw error;
    }

    const meta = JSON.stringify({
      reason: cleanReason,
      coverageReason: coverage.reason,
      certificateNumber: coverage.certificateNumber,
      cancelledAt: new Date().toISOString(),
      cancelledBy: actorId || 'unknown',
    });
    const notes = `${cycle.notes ? `${cycle.notes}\n` : ''}${CYCLE_CANCEL_META_PREFIX}${meta}`;

    const updated = await prisma.plantingCycle.update({
      where: { id: cycle.id },
      data: { status: 'CANCELLED_UNCOVERED', notes },
    });

    // Best-effort audit, never blocking the transition: same discipline as
    // certificate-service.js _auditCertLifecycle.
    try {
      const { auditLogger, AuditCategory, AuditSeverity, ResourceType } = require('../middleware/audit-logger');
      await auditLogger.log({
        category: AuditCategory.SYSTEM,
        action: 'PLANTING_CYCLE_CANCELLED_UNCOVERED',
        severity: AuditSeverity.WARNING,
        actorId: actorId || 'SYSTEM',
        actorRole: 'HEALTH',
        actorType: 'USER',
        resourceType: ResourceType.SYSTEM,
        resourceId: cycle.id,
        metadata: {
          reason: cleanReason,
          coverageReason: coverage.reason,
          certificateNumber: coverage.certificateNumber,
        },
      });
    } catch (_e) { /* audit failure must never block the cancel */ }

    return updated;
  }
```

Wire the route in `apps/backend/routes/api/cultivation/planting-cycles.js`, beside the other `/:id` routes:

```js
router.post('/:id/cancel-uncovered', ensureCycleReachable, requireCycleFarmPermission('CYCLE_CREATE'), async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    const cycle = await plantingService.cancelUncoveredCycle(req.params.id, {
      reason: req.body?.reason,
      actorId: userId,
    });
    return res.json({ success: true, data: cycle });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      success: false,
      code: error.code || 'CYCLE_CANCEL_FAILED',
      message: safeErrorMessage(error, 'ยกเลิกรอบปลูกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'),
    });
  }
});
```

- [ ] **Step 11: Run the planting family**

```bash
cd apps/backend && npx jest \
  __tests__/unit/planting-coverage-list.test.js \
  __tests__/unit/cancel-uncovered-cycle.test.js \
  __tests__/unit/harvest-does-not-require-plant-units.test.js \
  __tests__/unit/generate-plot-cycle-qrs-partial.test.js \
  __tests__/unit/plot-qr-partial-route-consumption.test.js \
  __tests__/unit/lot-number-suffix-race.test.js \
  __tests__/unit/planting-cycle-error-sanitization.test.js \
  __tests__/integration/planting-plot-trace.test.js \
  __tests__/integration/planting-plot-trace-harvest-guards.test.js \
  __tests__/integration/cycle-create-mints-zero-plant-units.test.js \
  __tests__/integration/harvest-cross-farm-cert-read.test.js \
  __tests__/integration/provider-admin-planting-integrity.test.js
```

Expected: PASS. Two known collision points, neither of which may be "fixed" by weakening the gate: `harvest-does-not-require-plant-units.test.js:80-109` asserts **400** + `'Active certificate is required before harvest'` for `certificateId: null` — the null branch above is kept exactly for it. `cycle-create-mints-zero-plant-units.test.js:153-186` mocks `plantingService.createCycle` wholesale, so it never runs the gate and must not move. Any fixture that now needs the wider certificate `select` gets `certificate: null` added to it.

- [ ] **Step 12: Ratchet + commit**

```bash
cd ../.. && bash scripts/check-done.sh ratchet
git add apps/backend/services/planting-service.js apps/backend/services/planting-cycle-service.js apps/backend/services/planting-cycle/harvest-capacity-operations.js apps/backend/routes/api/cultivation apps/backend/routes/api/trace/lots.js apps/backend/__tests__/unit/planting-coverage-list.test.js apps/backend/__tests__/unit/cancel-uncovered-cycle.test.js
git commit -m "fix(planting): the farmer keeps every cycle, and starts nothing new without cover"
```

---

### Task 6: the farmer's screens name the withdrawal and offer the way out

**Files:**
- Create: `apps/web-app/src/app/health/planting/coverage-badge.tsx`
- Create: `apps/web-app/src/app/health/planting/__tests__/coverage-badge.test.tsx`
- Modify: `apps/web-app/src/lib/services/planting-service.types.ts:7-31` (add `coverage` to `PlantingCycleSummary`)
- Modify: `apps/web-app/src/lib/services/planting-service.ts:55-64` (add `cancelUncoveredCycle`)
- Modify: `apps/web-app/src/app/health/planting/client-view.tsx:24-44,150-232` (the badge on each card)
- Modify: `apps/web-app/src/app/health/planting/[id]/client-view.tsx` (the cancel door on an uncovered cycle)
- Modify: `apps/web-app/src/app/health/planting/new/client-view.tsx:82-97,335-360,405-408` (certificate picker + Thai server error)
- Modify: `apps/web-app/src/app/health/planting/planting-cert-gate.tsx:50-61` (the copy that tells a revoked farmer they have no certificate)

> **Pointer corrections against HEAD:** `client-view.tsx` (the list) has `statusLabelMap` at `:24-31`, `statusChipMap` at `:37-44`, and no certificate reference anywhere — facts.md §5.2 is correct. `planting-cert-gate.tsx:37-38,50-53` — correct. `new/client-view.tsx:82-97` filters certificates then farms; the picker is at `:341-356`, the "ยังเปิดรอบปลูกไม่ได้" alert at `:405-408` — correct.

**Interfaces:**
- Consumes: `coverage: CycleCoverage` on every cycle summary and `POST /planting-cycles/:id/cancel-uncovered` (Task 5); `uncoveredCopy` is **not** reused — the farmer's sentences differ from the consumer's, because the farmer can act.
- Produces: `CoverageBadge({ coverage }: { coverage?: CycleCoverage | null })`, and `plantingService.cancelUncoveredCycle(cycleId, reason)` on the web service.

- [ ] **Step 1: Write the failing test**

Create `apps/web-app/src/app/health/planting/__tests__/coverage-badge.test.tsx`:

```tsx
/**
 * The farmer's side of spec §3.1: a cycle under a withdrawn certificate is VISIBLE
 * and carries a label saying so, plus a link to check the certificate. Before this,
 * the cycle simply vanished from the list (planting-service.js:137-183) and no page
 * in the whole planting subtree contained the word เพิกถอน (facts.md §5.3).
 *
 * The farmer's copy is deliberately NOT the consumer's: a farmer can act, so the
 * sentence ends in what to do next, not in "ask the seller".
 */
import * as React from 'react';
import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { CoverageBadge } from '../coverage-badge';

declare global { var IS_REACT_ACT_ENVIRONMENT: boolean | undefined }
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(ui: React.ReactElement) {
  act(() => { root.render(ui); });
  return container;
}

const coverage = (over = {}) => ({
  covered: false,
  reason: 'revoked' as const,
  certificateNumber: 'GACP-TH-2569-CAE820',
  successorCertificateNumber: null,
  verifyUrl: '/verify/GACP-TH-2569-CAE820',
  ...over,
});

describe('CoverageBadge', () => {
  it('renders nothing at all when the cycle is covered (no noise on the happy path)', () => {
    const el = render(<CoverageBadge coverage={{ ...coverage(), covered: true, reason: null }} />);
    expect(el.textContent).toBe('');
  });

  it('renders nothing when coverage is absent (an older payload must not crash the list)', () => {
    expect(render(<CoverageBadge coverage={undefined} />).textContent).toBe('');
    expect(render(<CoverageBadge coverage={null} />).textContent).toBe('');
  });

  it('says เพิกถอน for a revoked certificate and shows the number', () => {
    const el = render(<CoverageBadge coverage={coverage()} />);
    expect(el.textContent).toContain('ไม่อยู่ภายใต้การรับรอง');
    expect(el.textContent).toContain('ใบรับรองถูกเพิกถอน');
    expect(el.textContent).toContain('GACP-TH-2569-CAE820');
  });

  it('names suspension, expiry and renewal distinctly', () => {
    expect(render(<CoverageBadge coverage={coverage({ reason: 'suspended' })} />).textContent)
      .toContain('ใบรับรองถูกระงับชั่วคราว');
    expect(render(<CoverageBadge coverage={coverage({ reason: 'expired' })} />).textContent)
      .toContain('ใบรับรองหมดอายุแล้ว');
    expect(render(<CoverageBadge coverage={coverage({ reason: 'renewed' })} />).textContent)
      .toContain('ถูกแทนที่ด้วยฉบับต่ออายุ');
    expect(render(<CoverageBadge coverage={coverage({ reason: 'missing', certificateNumber: null, verifyUrl: null })} />).textContent)
      .toContain('ยังไม่ได้ผูกใบรับรอง');
  });

  it('tells the farmer what still works: recording on this cycle continues (parent spec :52)', () => {
    const el = render(<CoverageBadge coverage={coverage()} />);
    expect(el.textContent).toContain('บันทึกข้อมูลรอบนี้ต่อได้');
  });

  it('links to verify, and to the successor when there is one', () => {
    const el = render(<CoverageBadge coverage={coverage()} />);
    expect(el.querySelector('a[href="/verify/GACP-TH-2569-CAE820"]')).not.toBeNull();

    const renewed = render(<CoverageBadge coverage={coverage({
      reason: 'renewed', successorCertificateNumber: 'GACP-TH-2569-E5960D',
    })} />);
    expect(renewed.querySelector('a[href="/verify/GACP-TH-2569-E5960D"]')).not.toBeNull();
  });

  it('follows the Thai copy rules', () => {
    const el = render(<CoverageBadge coverage={coverage()} />);
    expect(el.textContent).not.toContain('—');
    expect(el.textContent).not.toContain('ท่าน');
    expect(el.innerHTML).not.toMatch(/tracking-(wide|wider|widest)/);
    expect(el.innerHTML).not.toMatch(/\buppercase\b/);
    expect(el.innerHTML).not.toMatch(/font-black/);
    expect(el.innerHTML).not.toMatch(/\bbg-red-\d/);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd apps/web-app && npx jest src/app/health/planting/__tests__/coverage-badge.test.tsx
```

Expected: FAIL — `Cannot find module '../coverage-badge'`.

- [ ] **Step 3: Write the badge**

Create `apps/web-app/src/app/health/planting/coverage-badge.tsx`:

```tsx
'use client';

/**
 * The label a farmer sees on a cycle whose certificate no longer covers it.
 *
 * Before this, the cycle was simply filtered out of the list and no page under
 * /health/planting contained เพิกถอน, ถูกยกเลิก or หมดอายุ (facts.md §5.2, §5.3):
 * the closest thing was "ยังไม่พร้อม", which reads as PENDING, the opposite of
 * revoked. This says which withdrawal it was, what still works, and where to check.
 *
 * Renders NOTHING when the cycle is covered: a badge that appears on every card
 * stops being read.
 */
import Link from 'next/link';
import { ShieldOff } from 'lucide-react';

import type { CycleCoverage } from '@/lib/services/planting-service.types';

const CAUSE: Record<NonNullable<CycleCoverage['reason']>, string> = {
  revoked: 'ใบรับรองถูกเพิกถอน',
  suspended: 'ใบรับรองถูกระงับชั่วคราว',
  expired: 'ใบรับรองหมดอายุแล้ว',
  renewed: 'ใบรับรองฉบับนี้ถูกแทนที่ด้วยฉบับต่ออายุ',
  missing: 'รอบปลูกนี้ยังไม่ได้ผูกใบรับรอง',
};

export function CoverageBadge({ coverage }: { coverage?: CycleCoverage | null }) {
  if (!coverage || coverage.covered || !coverage.reason) {
    return null;
  }
  const cause = CAUSE[coverage.reason];

  return (
    <div className="space-y-1 rounded-xl border border-destructive/20 bg-destructive/5 p-3">
      <p className="flex items-center gap-2 text-xs font-bold text-destructive">
        <ShieldOff className="h-4 w-4" />
        ไม่อยู่ภายใต้การรับรอง
      </p>
      <p className="text-[11px] font-medium leading-relaxed text-muted-foreground">
        {cause}
        {coverage.certificateNumber ? ` เลขที่ ${coverage.certificateNumber}` : ''}
        {' '}
        คุณบันทึกข้อมูลรอบนี้ต่อได้ตามปกติ แต่ยังเริ่มรอบใหม่ เก็บเกี่ยว สร้างล็อต หรือสร้าง QR ใหม่ไม่ได้
      </p>
      <div className="flex flex-wrap gap-3 pt-1 text-[11px] font-bold">
        {coverage.verifyUrl ? (
          <Link href={coverage.verifyUrl} className="text-primary underline">
            ตรวจสอบใบรับรอง
          </Link>
        ) : null}
        {coverage.successorCertificateNumber ? (
          <Link href={`/verify/${coverage.successorCertificateNumber}`} className="text-primary underline">
            ดูฉบับปัจจุบัน {coverage.successorCertificateNumber}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export default CoverageBadge;
```

- [ ] **Step 4: Type it and wire the list**

In `apps/web-app/src/lib/services/planting-service.types.ts`, add above `PlantingCycleSummary` and reference it from that type:

```ts
/** The live answer to "is this cycle under certification right now" (backend: certificateCoverage). */
export type CycleCoverage = {
  covered: boolean;
  reason: 'revoked' | 'suspended' | 'expired' | 'renewed' | 'missing' | null;
  certificateNumber: string | null;
  successorCertificateNumber: string | null;
  verifyUrl: string | null;
};

export type PlantingCycleSummary = {
  // ... existing fields unchanged ...
  /** Optional so a cached/older payload cannot crash the list. */
  coverage?: CycleCoverage | null;
};
```

In `apps/web-app/src/app/health/planting/client-view.tsx`, import the badge and render it inside the card body, immediately above the "Footer Info" block at `:201`:

```tsx
<CoverageBadge coverage={cycle.coverage} />
```

- [ ] **Step 5: Add the cancel door to the cycle detail page**

In `apps/web-app/src/lib/services/planting-service.ts`, next to `updateCycle` (`:136`):

```ts
  /**
   * The in-app exit for a cycle whose certificate stopped covering it. The reason is
   * mandatory server-side (planting-service.js cancelUncoveredCycle) because the note
   * has to make sense to an auditor reading the record later.
   */
  async cancelUncoveredCycle(cycleId: string, reason: string) {
    return apiClient.post(`/planting-cycles/${cycleId}/cancel-uncovered`, { reason });
  },
```

In `apps/web-app/src/app/health/planting/[id]/client-view.tsx`, render the door **only** when `!cycle.coverage?.covered` and the status is still open. A confirm dialog with a required textarea, mirroring the revision dialog C03 drives (`/admin/certificates/[id]`): the confirm button stays `disabled` until the reason has at least 5 characters, and the success path re-fetches the cycle.

```tsx
{!coverage?.covered && OPEN_STATUSES.includes(cycle.status) ? (
  <Button variant="outline" onClick={() => setCancelOpen(true)}>
    ยกเลิกรอบปลูกนี้
  </Button>
) : null}
```

Dialog copy (cause first, then the consequence, then the action):

- title: `ยกเลิกรอบปลูกนี้`
- body: `รอบปลูกนี้ไม่อยู่ภายใต้ใบรับรองแล้ว จึงบันทึกการเก็บเกี่ยวเพื่อปิดรอบไม่ได้ การยกเลิกจะปลดพื้นที่ปลูกให้คุณเริ่มรอบใหม่ได้ ข้อมูลเดิมทั้งหมดยังอยู่ในระบบ ไม่ถูกลบ`
- textarea label: `เหตุผลที่ยกเลิก`
- confirm: `ยืนยันยกเลิกรอบปลูก`

On a non-2xx, show `result.message` from the server verbatim: the backend already answers in Thai (Task 5's `buildNotCoveringError`), and re-writing it in the page would produce two sources for one sentence.

- [ ] **Step 6: Fix the new-cycle page (plan contradiction #2)**

In `apps/web-app/src/app/health/planting/new/client-view.tsx`:

1. **Keep every farm.** Delete the `eligibleFarmIds` / `eligibleFarms` narrowing at `:92-97` and the duplicate `useMemo` at `:157-172`; set `setFarms(farmRows)`. A farm silently vanishing from the dropdown is how the farmer ends up with no explanation at all.
2. **List every certificate of the farm, labelled.** Replace `activeCertificates` in the picker's `data` with all of the farm's certificates, each option labelled with its status:

```tsx
data={farmCertificates.map((certificate) => ({
  value: String(certificate.id || ''),
  label: `${certificate.certificateNumber || 'CERT'}${
    isCertificateCovering(certificate) ? '' : ` (${certStatusLabel(certificate)})`
  }`,
}))}
```

where `certStatusLabel` returns `ถูกเพิกถอน` / `ถูกระงับชั่วคราว` / `หมดอายุแล้ว` / `ถูกแทนที่ด้วยฉบับต่ออายุ`.

3. **Warn inline the moment an uncovered one is picked**, and let the press happen anyway — the server is the gate:

```tsx
{selectedCertificate && !isCertificateCovering(selectedCertificate) ? (
  <Alert color="red" title="ใบรับรองนี้ไม่คุ้มครองรอบปลูกใหม่">
    {certStatusLabel(selectedCertificate)} คุณจึงเริ่มรอบปลูกใหม่ใต้ใบนี้ไม่ได้ กรุณาเลือกใบรับรองที่ยังมีผล หรือตรวจสอบสถานะที่เมนูใบรับรอง
  </Alert>
) : null}
```

4. **Surface the server's refusal.** In the submit handler, on `result.code === 'CERTIFICATE_NOT_COVERING'`, render `result.message` in a red `Alert` — do not swap in local copy.
5. Replace the misleading `กรุณาดำเนินการรับรอง` at `:405-408` (facts.md §5.4: "please go get certified" is wrong advice for someone who *was* certified) with: `ฟาร์มนี้ยังไม่มีใบรับรองที่คุ้มครองรอบปลูกใหม่ คุณตรวจสอบสถานะใบรับรองได้ที่เมนูใบรับรอง`.

- [ ] **Step 7: Fix the lock-screen copy**

`apps/web-app/src/app/health/planting/planting-cert-gate.tsx:50-53` currently tells a farmer whose certificate was **revoked** that they have *no* certificate and that the menu opens with one *"ที่ยังไม่หมดอายุ"* — naming the wrong condition. Replace the body with:

```tsx
บันทึกการปลูกเปิดใช้เมื่อคุณมีใบรับรอง GACP ที่ยังมีผลบังคับใช้ ขณะนี้ระบบไม่พบใบรับรองที่ใช้งานได้ของคุณ ซึ่งอาจเป็นเพราะใบรับรองหมดอายุ ถูกระงับ หรือถูกเพิกถอน คุณตรวจสอบสถานะได้ที่เมนูใบรับรอง
```

Leave the fail-open behaviour at `:37-38` exactly as it is: it is deliberate and documented at `:29-34`, and the real boundary is the server.

- [ ] **Step 8: Run the web tests and lint**

```bash
cd apps/web-app && npx jest src/app/health/planting src/app/trace
npm run lint
npx tsc --noEmit -p tsconfig.json
```

Expected: PASS + clean lint + no type errors. `planting-cert-gate.test.tsx:94,100,115,136,151` asserts the gate's *behaviour*, not its copy — confirm it stays green; if any case asserts the old sentence, update the string, never the behaviour.

- [ ] **Step 9: Ratchet + commit**

```bash
cd ../.. && bash scripts/check-done.sh ratchet
git add apps/web-app/src/app/health/planting apps/web-app/src/lib/services/planting-service.ts apps/web-app/src/lib/services/planting-service.types.ts
git commit -m "feat(planting): the farmer sees the withdrawal, and has a way out"
```

---

### Task 7: a revoked farmer cannot print GACP marks

**Files:**
- Modify: `apps/web-app/src/app/health/planting/[id]/plot-signs/client-view.tsx:52-82` (the load) and the print control
- Modify: `apps/web-app/src/app/health/planting/[id]/planting-cycle-detail-header-block.tsx:141-143` (the "รีเฟรช QR" button)
- Modify: `apps/web-app/src/app/health/planting/[id]/plot-qr-permission.ts` (add the coverage predicate beside the permission one)
- Test: `apps/web-app/src/app/health/planting/[id]/plot-signs/__tests__/plot-signs-coverage.test.tsx` (create)
- Backend gate: already shipped in Task 5 Step 9 (`planting-cycles-plot-routes.js`)

> **Pointer corrections against HEAD:** `plot-qr-permission.ts` is a **workspace-permission** helper (`isWorkspacePermissionDenied`), not a certificate gate — facts.md §5.5 is right that it "gates purely on workspace permission", so this task ADDS a coverage predicate alongside rather than editing the permission one. The "รีเฟรช QR" button is at `planting-cycle-detail-header-block.tsx:141-143` with only a `loading` prop — correct. `plot-signs/client-view.tsx` and `page.tsx` contain zero `cert`/`hasActive` hits — correct.

**Interfaces:**
- Consumes: `coverage` on the cycle detail payload (Task 5); the backend 409 `CERTIFICATE_NOT_COVERING` from `POST /:id/plot-qrs/generate` (Task 5 Step 9).
- Produces: `isCycleCovered(cycle)` exported from `plot-qr-permission.ts`, used by both the header button and the sign sheet.

- [ ] **Step 1: Write the failing test — spec §4 RED (6)**

Create `apps/web-app/src/app/health/planting/[id]/plot-signs/__tests__/plot-signs-coverage.test.tsx`:

```tsx
/**
 * RED (6) of the spec's §4: a farmer whose certificate was revoked can still open
 * the printable plot-sign sheet and print signs bearing GACP marks. The sheet has no
 * certificate gating at all today (facts.md G2), and neither did the backend door
 * behind the "รีเฟรช QR" button.
 *
 * Spec §3.3: printing is for covered cycles only. Signs ALREADY printed keep
 * scanning; what they resolve to is the public trace's business (Task 2).
 */
import * as React from 'react';
import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { isCycleCovered } from '../../plot-qr-permission';

declare global { var IS_REACT_ACT_ENVIRONMENT: boolean | undefined }
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockGetCycleById = jest.fn();
const mockListPlotCycleQrs = jest.fn();
jest.mock('@/lib/services/planting-service', () => ({
  plantingService: {
    getCycleById: (id: string) => mockGetCycleById(id),
    listPlotCycleQrs: (id: string) => mockListPlotCycleQrs(id),
  },
}));
jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'cycle-1' }),
  useSearchParams: () => new URLSearchParams(''),
}));

import ClientView from '../client-view';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mockListPlotCycleQrs.mockResolvedValue({
    success: true,
    data: [{ cyclePlotId: 'cp-1', plotName: 'แปลงกลางแจ้ง 1', plotCode: 'PLOT-BEJAD-M4SR7', qrRevokedAt: null }],
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function renderSheet() {
  await act(async () => { root.render(<ClientView />); });
  return container;
}

const cycle = (coverage: unknown) => ({
  success: true,
  data: { id: 'cycle-1', status: 'PLANTED', farm: { farmName: 'ไร่ใจดีสมุนไพรไทย' }, coverage },
});

describe('isCycleCovered', () => {
  it('is false for every withdrawal and true only for covered', () => {
    expect(isCycleCovered({ coverage: { covered: true, reason: null } })).toBe(true);
    expect(isCycleCovered({ coverage: { covered: false, reason: 'revoked' } })).toBe(false);
    expect(isCycleCovered({ coverage: { covered: false, reason: 'suspended' } })).toBe(false);
    expect(isCycleCovered({ coverage: { covered: false, reason: 'missing' } })).toBe(false);
  });

  it('fails CLOSED when coverage is absent: a printable GACP mark is not a place to guess', () => {
    expect(isCycleCovered({})).toBe(false);
    expect(isCycleCovered(null)).toBe(false);
  });
});

describe('the printable plot-sign sheet', () => {
  it('refuses to render signs for a REVOKED cycle and says why', async () => {
    mockGetCycleById.mockResolvedValue(cycle({
      covered: false, reason: 'revoked',
      certificateNumber: 'GACP-TH-2569-CAE820',
      successorCertificateNumber: null, verifyUrl: '/verify/GACP-TH-2569-CAE820',
    }));

    const el = await renderSheet();

    expect(el.textContent).toContain('ใบรับรองถูกเพิกถอน');
    expect(el.textContent).toContain('พิมพ์ป้ายรหัสแปลงไม่ได้');
    // The sign itself, and its code, must not be on the page at all.
    expect(el.textContent).not.toContain('PLOT-BEJAD-M4SR7');
    expect(el.querySelector('canvas')).toBeNull();
  });

  it('renders the signs normally for a covered cycle', async () => {
    mockGetCycleById.mockResolvedValue(cycle({
      covered: true, reason: null,
      certificateNumber: 'GACP-TH-2569-E5960D',
      successorCertificateNumber: null, verifyUrl: '/verify/GACP-TH-2569-E5960D',
    }));

    const el = await renderSheet();

    expect(el.textContent).toContain('PLOT-BEJAD-M4SR7');
    expect(el.textContent).not.toContain('พิมพ์ป้ายรหัสแปลงไม่ได้');
  });

  it('still says "load failed", not "uncovered", when the fetch fails', async () => {
    mockGetCycleById.mockResolvedValue({ success: false });
    const el = await renderSheet();
    expect(el.textContent).toContain('โหลดข้อมูลแปลงไม่สำเร็จ');
    expect(el.textContent).not.toContain('พิมพ์ป้ายรหัสแปลงไม่ได้');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd apps/web-app && npx jest "src/app/health/planting/\[id\]/plot-signs"
```

Expected: FAIL — `isCycleCovered` is not exported, and the sheet renders `PLOT-BEJAD-M4SR7` for a revoked cycle.

- [ ] **Step 3: Add the coverage predicate**

Append to `apps/web-app/src/app/health/planting/[id]/plot-qr-permission.ts` (the file already owns "may this user touch plot QR codes"; this adds the other half of the same question):

```ts
/**
 * Is the cycle under a certificate that covers it right now?
 *
 * This file already answers "does this WORKSPACE MEMBER have QR_GENERATE"; the plot
 * sign needed a second question nobody was asking, and facts.md G2 is what that cost:
 * a farmer whose certificate had been revoked could still refresh and print signs
 * that publicly assert active GACP certification.
 *
 * FAILS CLOSED on a missing coverage field. A printable GACP mark is not a place to
 * assume the happy path when the payload is older than the server.
 */
export function isCycleCovered(cycle: { coverage?: { covered?: boolean } | null } | null | undefined): boolean {
  return cycle?.coverage?.covered === true;
}
```

- [ ] **Step 4: Gate the sheet**

In `apps/web-app/src/app/health/planting/[id]/plot-signs/client-view.tsx`, keep the cycle payload in state and branch before the QR generation `useEffect` runs (so no `canvas` is ever produced):

```tsx
const [coverage, setCoverage] = useState<CycleCoverage | null>(null);
// ... inside the loader, after the success check:
setCoverage((cycleResult.data?.coverage ?? null) as CycleCoverage | null);

// ... and in the render, after the `error` branch and before the sheet:
if (!isCycleCovered({ coverage })) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-16">
      <div className="max-w-md space-y-3 rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center">
        <h1 className="text-lg font-bold text-foreground">พิมพ์ป้ายรหัสแปลงไม่ได้</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {coverageCause(coverage)} ป้ายที่ติดอยู่แล้วยังสแกนได้ตามปกติ และจะแสดงสถานะจริงของใบรับรองเมื่อถูกสแกน
          คุณตรวจสอบสถานะใบรับรองได้ที่เมนูใบรับรอง
        </p>
      </div>
    </div>
  );
}
```

where `coverageCause` reuses the `CAUSE` table from Task 6's `coverage-badge.tsx` — export it from there (`export const COVERAGE_CAUSE_TH = CAUSE;`) rather than writing the four sentences twice.

- [ ] **Step 5: Gate the refresh button**

In `apps/web-app/src/app/health/planting/[id]/planting-cycle-detail-header-block.tsx:141-143`, add `disabled={!isCycleCovered(cycle)}` to the "รีเฟรช QR" button and a `title` explaining why, mirroring how the harvest button is already gated at `:144` (`disabled={!canHarvest}`). The backend refuses regardless (Task 5 Step 9) — this is the honesty layer, not the boundary.

- [ ] **Step 6: Run the tests and lint**

```bash
cd apps/web-app && npx jest src/app/health/planting
npm run lint
```

Expected: PASS. Then confirm the backend half:

```bash
cd ../backend && npx jest __tests__/unit/generate-plot-cycle-qrs-partial.test.js __tests__/unit/plot-qr-partial-route-consumption.test.js
```

- [ ] **Step 7: Ratchet + commit**

```bash
cd ../.. && bash scripts/check-done.sh ratchet
git add "apps/web-app/src/app/health/planting/[id]"
git commit -m "fix(planting): no new GACP marks printed under a withdrawn certificate"
```

---

### Task 8: the holder is told (ISO/IEC 17065 §7.11)

**Files:**
- Modify: `apps/backend/services/notification-service.js:7-95` (three `NotifyType` keys)
- Modify: `apps/backend/services/notification/domain-helpers.js` (add `notifyCertificateCoverageChanged`, export it)
- Modify: `apps/backend/services/certificate-service.js:1758` (revoke), `:2106` (suspend), `:2149` (reinstate)
- Test: `apps/backend/__tests__/unit/certificate-lifecycle-notifications.test.js` (create)
- Keep green: `apps/backend/__tests__/unit/certificate-service.test.js:311-380`, `apps/backend/__tests__/unit/admin-certificates-revoke-route.test.js`, `apps/backend/__tests__/unit/admin-certificates-revoke-already-revoked.test.js`, `apps/backend/__tests__/integration/cert-revoke-org-guard.test.js`

> **Pointer corrections against HEAD:** `revokeCertificate` is `:1672-1761` with the audit call at `:1758` — correct. `suspendCertificate` is `:2069-2107` (audit at `:2106`) and `reinstateCertificate` `:2123-2151` (audit at `:2149`) — facts.md's `:2054`/`:2111` are the docblock lines, not the function bodies. **`createNotification` is at `notification-service.js:308`, not the `:1516` facts.md mentions** (that is the renewal-reminder comment). **There is no admin HTTP route for suspend or reinstate** — only `POST /api/admin/certificates/:id/revoke` (`routes/api/admin/certificates.js:79-146`). The hook therefore goes in the SERVICE, where all three transitions pass and any future door inherits it. `Certificate.userId` (`prisma/schema/certification.prisma:17`) is the holder and is NOT NULL, so it is the notification recipient.

**Interfaces:**
- Consumes: nothing from earlier tasks (this task is independent of Tasks 1-7 and may be executed in parallel with them).
- Produces:
  ```js
  // services/notification/domain-helpers.js
  async function notifyCertificateCoverageChanged(certificate, event) // event: 'REVOKED' | 'SUSPENDED' | 'REINSTATED'
  // services/notification-service.js — NotifyType additions
  CERTIFICATE_REVOKED: 'CERTIFICATE_REVOKED',
  CERTIFICATE_SUSPENDED: 'CERTIFICATE_SUSPENDED',
  CERTIFICATE_REINSTATED: 'CERTIFICATE_REINSTATED',
  ```

- [ ] **Step 1: Record the signing-key mtime before anything runs**

```bash
cd apps/backend && ls -l keys/*.pem
```

Paste the output into the task log. `npx jest` has rotated these before and voided a live certificate; if the mtime changes at any point in this task, **stop and report**.

- [ ] **Step 2: Write the failing test**

Create `apps/backend/__tests__/unit/certificate-lifecycle-notifications.test.js`:

```js
/**
 * ISO/IEC 17065 §7.11 says the client must STOP USING the certification and the
 * marks. Today revokeCertificate stamps three columns and writes one audit row and
 * tells nobody: the only `notif` mention in the whole 2000-line file is a comment
 * about renewal reminders (facts.md G6). The holder learns nothing.
 *
 * Spec §3.6 (the one part the operator added beyond "make the code match the spec"):
 * an IN-APP notification to the holder on revoke, suspend and reinstate, saying what
 * still works and what does not. In-app only, per the standing decision recorded in
 * external-services-cleanup: no email, no SMS, no webhook.
 *
 * The hook lives in the SERVICE, not in the admin route, because there is no HTTP
 * door for suspend or reinstate at all (routes/api/admin/certificates.js has only
 * /revoke) and a second door added later must inherit it for free.
 */
'use strict';

const mockPrisma = {
    certificate: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    user: { findUnique: jest.fn() },
    notification: { create: jest.fn() },
};
jest.mock('../../services/prisma-database', () => ({ prisma: mockPrisma }));
jest.mock('../../server', () => ({ prisma: mockPrisma }));

const mockCreateNotification = jest.fn().mockResolvedValue({ id: 'notif-1' });
jest.mock('../../services/notification-service', () => {
    const actual = jest.requireActual('../../services/notification-service');
    return { ...actual, createNotification: (...args) => mockCreateNotification(...args) };
});

const certificateService = require('../../services/certificate-service');
const { notifyCertificateCoverageChanged } = require('../../services/notification/domain-helpers');

const FUTURE = new Date(Date.now() + 365 * 24 * 3600 * 1000);
const PAST = new Date(Date.now() - 24 * 3600 * 1000);

const certRow = (over = {}) => ({
    id: 'cert-1', certificateNumber: 'GACP-TH-2569-CAE820',
    userId: 'holder-1', organizationId: 'org-1', farmId: 'farm-1',
    status: 'active', expiryDate: FUTURE, issuedDate: PAST, isDeleted: false,
    revokedAt: null, suspendedAt: null, reinstatedAt: null, renewedCertificateId: null, ...over,
});

beforeEach(() => {
    jest.clearAllMocks();
});

describe('notifyCertificateCoverageChanged', () => {
    it('addresses the holder by userId, in Thai, naming the certificate', async () => {
        await notifyCertificateCoverageChanged(certRow({ status: 'revoked', revokedAt: new Date() }), 'REVOKED');

        expect(mockCreateNotification).toHaveBeenCalledTimes(1);
        const arg = mockCreateNotification.mock.calls[0][0];
        expect(arg.userId).toBe('holder-1');
        expect(arg.type).toBe('CERTIFICATE_REVOKED');
        expect(arg.title).toContain('เพิกถอน');
        expect(arg.message).toContain('GACP-TH-2569-CAE820');
    });

    it('says what still works and what does not (spec §3.6)', async () => {
        await notifyCertificateCoverageChanged(certRow({ status: 'revoked' }), 'REVOKED');
        const { message } = mockCreateNotification.mock.calls[0][0];
        expect(message).toContain('บันทึกข้อมูลรอบปลูกเดิมต่อได้');
        expect(message).toContain('เริ่มรอบปลูกใหม่');
        expect(message).toContain('ป้าย');
    });

    it('follows the Thai copy rules', async () => {
        await notifyCertificateCoverageChanged(certRow({ status: 'suspended' }), 'SUSPENDED');
        const { title, message } = mockCreateNotification.mock.calls[0][0];
        expect(`${title} ${message}`).not.toContain('—');
        expect(`${title} ${message}`).not.toContain('ท่าน');
        expect(`${title} ${message}`).toContain('คุณ');
    });

    it('distinguishes suspension from revocation, and reinstatement from both', async () => {
        await notifyCertificateCoverageChanged(certRow({ status: 'suspended' }), 'SUSPENDED');
        expect(mockCreateNotification.mock.calls[0][0].title).toContain('ระงับชั่วคราว');

        mockCreateNotification.mockClear();
        await notifyCertificateCoverageChanged(certRow(), 'REINSTATED');
        const arg = mockCreateNotification.mock.calls[0][0];
        expect(arg.type).toBe('CERTIFICATE_REINSTATED');
        expect(arg.title).toContain('กลับมาใช้งานได้');
        expect(arg.message).toContain('เริ่มรอบปลูกใหม่ได้แล้ว');
    });

    it('carries no reason text: the admin words are the register, not the inbox (PDPA + L2)', async () => {
        await notifyCertificateCoverageChanged(
            certRow({ status: 'revoked', revokedReason: 'คีย์ถูกหมุนโดยการรันเทส 2026-08-26' }),
            'REVOKED',
        );
        const { message, data } = mockCreateNotification.mock.calls[0][0];
        expect(message).not.toContain('คีย์ถูกหมุน');
        expect(JSON.stringify(data)).not.toContain('คีย์ถูกหมุน');
    });

    it('links to the certificate menu, not to an admin page', async () => {
        await notifyCertificateCoverageChanged(certRow({ status: 'revoked' }), 'REVOKED');
        expect(mockCreateNotification.mock.calls[0][0].actionUrl).toBe('/health/certificates');
    });

    it('does nothing, and throws nothing, when the certificate has no holder', async () => {
        await expect(notifyCertificateCoverageChanged(certRow({ userId: null }), 'REVOKED')).resolves.toBeUndefined();
        expect(mockCreateNotification).not.toHaveBeenCalled();
    });
});

describe('the lifecycle transitions fire it', () => {
    it('revokeCertificate notifies the holder', async () => {
        mockPrisma.certificate.findUnique.mockResolvedValue(certRow());
        mockPrisma.certificate.update.mockResolvedValue(certRow({ status: 'revoked', revokedAt: new Date() }));

        await certificateService.revokeCertificate('GACP-TH-2569-CAE820', {
            reason: 'ทดสอบ', actorId: 'admin-1', callerOrganizationId: 'org-1',
        });

        expect(mockCreateNotification).toHaveBeenCalledTimes(1);
        expect(mockCreateNotification.mock.calls[0][0].type).toBe('CERTIFICATE_REVOKED');
    });

    it('a failed notification never blocks the transition (the register is what matters)', async () => {
        mockPrisma.certificate.findUnique.mockResolvedValue(certRow());
        mockPrisma.certificate.update.mockResolvedValue(certRow({ status: 'revoked', revokedAt: new Date() }));
        mockCreateNotification.mockRejectedValueOnce(new Error('inbox on fire'));

        await expect(certificateService.revokeCertificate('GACP-TH-2569-CAE820', {
            reason: 'ทดสอบ', actorId: 'admin-1', callerOrganizationId: 'org-1',
        })).resolves.toMatchObject({ status: 'revoked' });
    });

    it('suspendCertificate and reinstateCertificate notify too', async () => {
        mockPrisma.certificate.update.mockResolvedValue(certRow({ status: 'suspended', suspendedAt: new Date() }));
        await certificateService.suspendCertificate('cert-1', { reason: 'ตรวจพบข้อบกพร่อง', suspendedBy: 'admin-1' });
        expect(mockCreateNotification.mock.calls[0][0].type).toBe('CERTIFICATE_SUSPENDED');

        mockCreateNotification.mockClear();
        mockPrisma.certificate.update.mockResolvedValue(certRow({ status: 'active', reinstatedAt: new Date() }));
        await certificateService.reinstateCertificate('cert-1', { reinstatedBy: 'admin-1' });
        expect(mockCreateNotification.mock.calls[0][0].type).toBe('CERTIFICATE_REINSTATED');
    });

    it('a SECOND revoke press still 409s and does NOT send a second notification', async () => {
        mockPrisma.certificate.findUnique.mockResolvedValue(certRow({ status: 'revoked', revokedAt: PAST }));
        await expect(certificateService.revokeCertificate('GACP-TH-2569-CAE820', {
            reason: 'ทดสอบ', actorId: 'admin-1', callerOrganizationId: 'org-1',
        })).rejects.toMatchObject({ code: 'CERTIFICATE_ALREADY_REVOKED' });
        expect(mockCreateNotification).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
cd apps/backend && npx jest __tests__/unit/certificate-lifecycle-notifications.test.js
```

Expected: FAIL — `notifyCertificateCoverageChanged is not a function`, and `mockCreateNotification` was never called.

- [ ] **Step 4: Add the three notification types**

In `apps/backend/services/notification-service.js`, beside `CERTIFICATE_EXPIRING` (`:85`):

```js
    // Certificate lifecycle (ISO/IEC 17065 §7.11). The clause is about the CLIENT
    // stopping their use of the certification and the marks, which they cannot do if
    // nobody tells them the certification changed.
    CERTIFICATE_REVOKED: 'CERTIFICATE_REVOKED',
    CERTIFICATE_SUSPENDED: 'CERTIFICATE_SUSPENDED',
    CERTIFICATE_REINSTATED: 'CERTIFICATE_REINSTATED',
```

- [ ] **Step 5: Write the domain helper**

Append to `apps/backend/services/notification/domain-helpers.js`, before `module.exports`:

```js
// ── Certificate lifecycle (ISO/IEC 17065 §7.11) ────────────

/**
 * Tell the certificate HOLDER that their certification changed.
 *
 * In-app only. Email/SMS/webhook are deliberately absent: the platform's standing
 * decision is in-app notifications only, and adding a channel here would be a policy
 * change smuggled in as an implementation detail.
 *
 * The message says what still works and what does not, because "your certificate was
 * revoked" alone leaves a farmer guessing whether their existing records just
 * evaporated. They did not: parent spec :52 keeps the existing cycle recordable.
 *
 * The admin's revocation REASON is deliberately not carried. It is the ISO §7.11
 * record of decision and lives in the register and the audit log; it is free text an
 * officer typed and can name a person, so it does not go into an inbox row.
 *
 * @param {{ id: string, certificateNumber: string, userId: string|null }} certificate
 * @param {'REVOKED'|'SUSPENDED'|'REINSTATED'} event
 */
async function notifyCertificateCoverageChanged(certificate, event) {
    try {
        const userId = certificate?.userId;
        if (!userId) { return; }
        const number = certificate.certificateNumber || '';

        const COPY = {
            REVOKED: {
                type: NotifyType.CERTIFICATE_REVOKED,
                title: 'ใบรับรอง GACP ของคุณถูกเพิกถอน',
                message: `ใบรับรองเลขที่ ${number} ถูกเพิกถอนแล้ว คุณบันทึกข้อมูลรอบปลูกเดิมต่อได้ตามปกติ `
                    + 'แต่จะเริ่มรอบปลูกใหม่ เก็บเกี่ยว สร้างล็อต หรือพิมพ์ป้าย QR ใหม่ไม่ได้ '
                    + 'ป้ายที่ติดอยู่แล้วยังสแกนได้ และจะแสดงสถานะจริงของใบรับรองเมื่อถูกสแกน',
            },
            SUSPENDED: {
                type: NotifyType.CERTIFICATE_SUSPENDED,
                title: 'ใบรับรอง GACP ของคุณถูกระงับชั่วคราว',
                message: `ใบรับรองเลขที่ ${number} ถูกระงับชั่วคราว คุณบันทึกข้อมูลรอบปลูกเดิมต่อได้ตามปกติ `
                    + 'แต่จะเริ่มรอบปลูกใหม่ เก็บเกี่ยว สร้างล็อต หรือพิมพ์ป้าย QR ใหม่ไม่ได้ '
                    + 'หากใบรับรองกลับมามีผล ทุกอย่างจะใช้งานได้เองทันที',
            },
            REINSTATED: {
                type: NotifyType.CERTIFICATE_REINSTATED,
                title: 'ใบรับรอง GACP ของคุณกลับมาใช้งานได้แล้ว',
                message: `ใบรับรองเลขที่ ${number} กลับมามีผลบังคับใช้แล้ว คุณเริ่มรอบปลูกใหม่ได้แล้ว `
                    + 'รวมถึงบันทึกการเก็บเกี่ยว สร้างล็อต และพิมพ์ป้าย QR ของแปลง',
            },
        }[event];

        if (!COPY) { return; }

        await createNotification({
            userId,
            type: COPY.type,
            title: COPY.title,
            message: COPY.message,
            data: { certificateId: certificate.id, certificateNumber: number, event },
            priority: 'HIGH',
            actionUrl: '/health/certificates',
        });
    } catch (error) {
        // Never blocks the lifecycle transition: the register is the legal record and
        // the inbox is a courtesy. Same discipline as certificate-service.js's
        // _auditCertLifecycle, which swallows its own errors at :2050.
        logger.error('[NotificationService] certificate coverage notification error:', error);
    }
}
```

and add `notifyCertificateCoverageChanged,` to `module.exports`.

- [ ] **Step 6: Fire it from all three transitions**

In `apps/backend/services/certificate-service.js`, immediately after each `_auditCertLifecycle` call:

```js
        // :1758 — revoke
        await this._auditCertLifecycle('CERTIFICATE_REVOKED', updated, { reason: cleanReason, actorId });
        await notifyCertificateCoverageChanged(updated, 'REVOKED');

        // :2106 — suspend
        await this._auditCertLifecycle('CERTIFICATE_SUSPENDED', suspended, { reason, actorId: suspendedBy });
        await notifyCertificateCoverageChanged(suspended, 'SUSPENDED');

        // :2149 — reinstate
        await this._auditCertLifecycle('CERTIFICATE_REINSTATED', reinstated, { actorId: reinstatedBy });
        await notifyCertificateCoverageChanged(reinstated, 'REINSTATED');
```

Require it lazily inside each method — `const { notifyCertificateCoverageChanged } = require('./notification/domain-helpers');` — matching how `_auditCertLifecycle` pulls `auditLogger` in, so a notification module that fails to load can never stop the certificate service from loading.

Note that the placement is **after** the `where: { id, status: notIn/... }` atomic update. A second revoke press throws before reaching it, so a duplicate notification is impossible by construction, not by a guard.

- [ ] **Step 7: Run the certificate family, twice**

```bash
cd apps/backend && npx jest \
  __tests__/unit/certificate-lifecycle-notifications.test.js \
  __tests__/unit/certificate-service.test.js \
  __tests__/unit/admin-certificates-revoke-route.test.js \
  __tests__/unit/admin-certificates-revoke-already-revoked.test.js \
  __tests__/unit/admin-routes-rbac.test.js \
  __tests__/integration/cert-revoke-org-guard.test.js \
  __tests__/integration/certified-notification-dispatch.test.js
```

Then re-run the same command with the backend `.env` flags blanked (`env -u NODE_ENV npx jest ...` plus any feature flag the suite reads), because jest loads `apps/backend/.env` through `@prisma/client` and a flag leaking in is how a green here becomes a red in CI.

- [ ] **Step 8: Re-check the signing keys**

```bash
ls -l apps/backend/keys/*.pem
```

Expected: mtimes identical to Step 1. If not, **stop and report** — a rotated key voids live certificates and is repaired through `SIGNING_KEY_RETIRED_FINGERPRINTS`, not by re-running.

- [ ] **Step 9: Ratchet + commit**

```bash
cd ../.. && bash scripts/check-done.sh ratchet
git add apps/backend/services/certificate-service.js apps/backend/services/notification apps/backend/services/notification-service.js apps/backend/__tests__/unit/certificate-lifecycle-notifications.test.js
git commit -m "feat(cert): the holder is told when their certification changes"
```

---

### Task 9: `CERTIFICATE_NOT_COVERING` in the catalogue

**Files:**
- Modify: `apps/backend/shared/error-codes.js` — insert after `CERTIFICATE_ALREADY_REVOKED` (`:1419-1426`)
- Modify: `apps/backend/__tests__/unit/error-codes-catalog.test.js` (add the entry-specific case)

> **Pointer corrections against HEAD:** `CERTIFICATE_ALREADY_REVOKED` is at `:1419-1426` — correct. The catalogue test is `error-codes-catalog.test.js` (singular "catalog"), not `catalogue`. Its contract requires **all six** fields `{ code, httpStatus, messageEn, messageTh, source, remediation }`, a `^[A-Z][A-Z0-9_]+$` key that equals `entry.code`, a 4xx/5xx `httpStatus`, and a `source` matching `^[^:]+:\d+$`.

**Interfaces:**
- Consumes: the code string thrown by Tasks 2, 5 and 7, and returned in the 410 body by Task 3.
- Produces: `ERROR_CODES.CERTIFICATE_NOT_COVERING` with `httpStatus: 409`. Note the deliberate split: the **doors** answer 409 (a farmer's request conflicts with the register's state), the **public trace** answers 410 (the resource existed and is no longer served). One code, two statuses, because they are two different conversations — recorded in the entry's `remediation` so a reader never has to guess.

- [ ] **Step 1: Write the failing test**

Add to `apps/backend/__tests__/unit/error-codes-catalog.test.js`:

```js
    it('catalogues CERTIFICATE_NOT_COVERING, the refusal every new-artefact door throws', () => {
        const entry = ERROR_CODES.CERTIFICATE_NOT_COVERING;
        expect(entry).toBeDefined();
        expect(entry.httpStatus).toBe(409);
        // The Thai message must name the cause and the next action, and must not be
        // the generic "not active" sentence the 410 body used to carry for revoked,
        // suspended and renewed alike (facts.md G10).
        expect(entry.messageTh).toContain('คุณ');
        expect(entry.messageTh).not.toContain('—');
        expect(entry.messageTh).not.toContain('ท่าน');
        // The remediation must explain the 409/410 split, or the next reader will
        // "fix" one of them to match the other.
        expect(entry.remediation).toContain('410');
        expect(entry.remediation).toContain('409');
    });

    it('the coverage reasons the code can carry are the five the spec fixes', () => {
        // Guards against a sixth reason being invented at a call site: the vocabulary
        // is closed (spec §1) and the /trace pages switch on it exhaustively.
        expect(ERROR_CODES.CERTIFICATE_NOT_COVERING.remediation)
            .toMatch(/revoked.*suspended.*expired.*renewed.*missing/);
    });
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd apps/backend && npx jest __tests__/unit/error-codes-catalog.test.js
```

Expected: FAIL — `expect(received).toBeDefined()` on `ERROR_CODES.CERTIFICATE_NOT_COVERING`.

- [ ] **Step 3: Add the entry**

In `apps/backend/shared/error-codes.js`, after `CERTIFICATE_ALREADY_REVOKED` (`:1426`):

```js
  CERTIFICATE_NOT_COVERING: {
    code: 'CERTIFICATE_NOT_COVERING',
    httpStatus: 409,
    messageEn: 'The certificate behind this farm does not cover it right now, so no new cycle, harvest, batch, lot or plot QR may be created; existing records are untouched',
    messageTh: 'ใบรับรองของฟาร์มนี้ไม่คุ้มครองอยู่ในขณะนี้ คุณจึงยังเริ่มรอบปลูกใหม่ บันทึกการเก็บเกี่ยว สร้างล็อต หรือสร้าง QR ใหม่ไม่ได้ ข้อมูลรอบปลูกเดิมยังบันทึกต่อได้ตามปกติ และไม่มีข้อมูลใดถูกลบ กรุณาตรวจสอบสถานะใบรับรองที่เมนูใบรับรอง',
    source: 'services/trace-service/common.js:242',
    remediation: 'Coverage is computed live by certificateCoverage() in services/trace-service/common.js, never stored: the reason is one of revoked, suspended, expired, renewed or missing, and a certificate whose status is renewed answers through its successor (Certificate.renewedCertificateId). TWO HTTP statuses carry this one code on purpose: the authenticated doors that create something new (createCycle, harvest cut, lot create, plot-QR generate) answer 409 because the request conflicts with the register\'s current state, while the PUBLIC trace resolvers answer 410 Gone because the resource existed and is deliberately no longer served. Do not "fix" one to match the other. Nothing is deleted by a revocation: existing cycles, batches, lots and QR seals stay, and their public trace answers the 410. The fix is to reinstate or renew the certificate; a suspended certificate that is reinstated restores every door with no further action, because nothing was flagged on the way down.',
  },
```

- [ ] **Step 4: Run the catalogue test and its extractor sanity check**

```bash
cd apps/backend && npx jest __tests__/unit/error-codes-catalog.test.js __tests__/unit/errors.test.js
```

Expected: PASS, including the whole-catalogue invariants (frozen, six fields, unique keys, `source` shaped `path:line`).

- [ ] **Step 5: Ratchet + commit**

```bash
cd ../.. && bash scripts/check-done.sh ratchet
git add apps/backend/shared/error-codes.js apps/backend/__tests__/unit/error-codes-catalog.test.js
git commit -m "docs(errors): catalogue CERTIFICATE_NOT_COVERING, 409 at the door and 410 in public"
```

---

### Task 10: C07 — the walk that presses it

**Files:**
- Create: `apps/web-app/e2e-g4/c07-revoked-certificate-consequences.spec.ts`
- Read first (conventions): `apps/web-app/e2e-g4/g4-helpers.ts`, `apps/web-app/e2e-g4/c03-revise-certificate-location.spec.ts`, `c04-revise-certificate-plant.spec.ts`, `c06-verify-status-reason.spec.ts`
- Run with: `apps/web-app/playwright.g4.config.ts`

> **Conventions these three specs establish, and C07 must follow:**
> - The docblock states the ledger item, what was true before, what is true now, and **which fixtures it uses and why** (c06's header is the model).
> - `const OUT = seg('c07');` then `shot(page, OUT, 'C07-NN-what.png')` — numbered, named for what the picture shows.
> - `test.setTimeout(300_000)` at minimum; C03 uses `600_000` because it logs in as an officer.
> - **Two-state**: every step checks the current state first and says out loud whether it is pressing or verifying (`c03:47-52` — "already at revision N, verifying, not re-pressing"). A resumed run must not re-press.
> - Reads go through `g4psql()`, which **throws on anything that is not a SELECT**. It is the only database access a walk may have.
> - Public pages need no login (c06 presses `/verify/...` cold); the farmer half needs `g4Login(page, { kind: 'health', id, pw })` with the id from `farmerId(FARMERS.A)` and the password from `pw(FARMERS.A)` (which reads `G4_PW_A` and throws if unset — passwords are never in the file, L2).
> - Close with `console.log('[C07] pressed: ...')` lines summarising what was actually pressed.

**Interfaces:**
- Consumes: everything. Tasks 1-9 must be merged before this walk can go green.
- Produces: `evidence/g4-rebuild-2026-08-25/c07/` — screenshots, video and trace for the C07 evidence pack, plus the console dump.

**The fixture — and why it is read, not typed.** The register already holds the exact situation the spec describes, created by C01's real press on 2026-08-27:

| thing | value |
|---|---|
| certificate | `GACP-TH-2569-CAE820`, `status revoked`, `revokedAt 2026-08-27`, expiry `2027-01-01` (**not** expired: revocation is the only reason it is invalid) |
| same farm also holds | `GACP-TH-2569-E5960D`, `status active`, expiry `2029-08-26` |
| farm | `ไร่ใจดีสมุนไพรไทย`, เมืองเชียงใหม่ — farmer A of `FARMERS.A` |
| cycle 1 | `PLANTED` (open), plot `PLOT-BEJAD-M4SR7`, bound to CAE820 |
| cycle 2 | `HARVESTED`, same plot, bound to CAE820 |
| batch | `BATCH-2569-000019`, `PACKED` |
| lot | `LOT-2569-000019-A`, `PACKAGED` |
| QR seals | 4, all `ACTIVE` |

facts.md §6 gives these ids **truncated** (`f5a675aa…`, `b153edc0…`, `eefa90c1…`). Do not paste a truncated id into the spec — resolve each one at run time from the certificate number with `g4psql`, which is both correct and self-repairing if the demo register is reseeded.

**The one thing this walk must not do:** press revoke, suspend or reinstate on any certificate. Spec §4(e) rules it out explicitly ("ห้ามแตะใบจริงเพิ่ม"), so the notification of Task 8 is proven by tests only and this walk records that in its own log line. A public trace page load *does* increment `TraceQrSecurity.scanCount` and write an audit row — that is a write through the real UI, which is what the walk is for.

- [ ] **Step 1: Write the walk**

Create `apps/web-app/e2e-g4/c07-revoked-certificate-consequences.spec.ts`:

```ts
/**
 * C07 — what a revoked certificate does to planting, QR and the public trace
 * (ledger F-G4-56). Spec: docs/superpowers/specs/2026-08-28-revoked-certificate-
 * consequences-design.md §4.
 *
 * Before this work (all four confirmed by reading the code, reports/research/
 * 2026-08-28-f-g4-56/facts.md):
 *   - the farmer's own cycles under GACP-TH-2569-CAE820 VANISHED from their list,
 *     and the R15 guard then refused a new cycle by naming the invisible one;
 *   - scanning the LOT QR answered 410 and the page printed "ไม่พบข้อมูล", telling a
 *     consumer holding a real bag that the product does not exist;
 *   - scanning the PLOT sign answered 200 with a hardcoded valid:true and the page
 *     painted a green "แหล่งปลูกได้รับการรับรอง GACP" shield;
 *   - the plot-sign print sheet had no certificate gate at all.
 *
 * FIXTURE: the register already holds the situation, created by C01's real press on
 * 2026-08-27. CAE820 is revoked (expiry 2027-01-01, so revocation is the ONLY reason
 * it is invalid), the same farm holds the active E5960D, and CAE820 still owns two
 * cycles on plot PLOT-BEJAD-M4SR7, one batch, one lot and four ACTIVE QR seals.
 * Every id is READ from the register at run time rather than pasted, because
 * facts.md records them truncated and a reseeded demo would silently pin the wrong row.
 *
 * WRITES: none, except through the real UI. g4psql() refuses anything but SELECT. The
 * public trace page loads do increment TraceQrSecurity.scanCount and write an audit
 * row, which is the product doing its job under a real press.
 *
 * NOT PRESSED HERE: revoke / suspend / reinstate. Spec §4(e) forbids touching another
 * live certificate, so the §3.6 notification is proven by
 * apps/backend/__tests__/unit/certificate-lifecycle-notifications.test.js only, and
 * this walk records that fact rather than papering over it.
 */
import { test, expect } from '@playwright/test';
import { FARMERS, captureConsole, farmerId, g4Login, g4psql, pw, seg, shot } from './g4-helpers';

const OUT = seg('c07');
const REVOKED = 'GACP-TH-2569-CAE820';
const ACTIVE = 'GACP-TH-2569-E5960D';

type CertRow = { id: string; status: string; expiryDate: string; revokedAt: string | null };
type CycleRow = { id: string; cycleName: string; status: string; plotCode: string | null };
type QrRow = { qrCode: string; entityType: string; status: string };
type LotRow = { id: string; lotNumber: string; qrCode: string };

function one<T>(sql: string, label: string): T {
  const rows = JSON.parse(g4psql(sql)) as T[];
  expect(rows.length, `${label} resolves to exactly one row`).toBe(1);
  return rows[0];
}

function many<T>(sql: string): T[] {
  return JSON.parse(g4psql(sql)) as T[];
}

test('C07 a revoked certificate: the farmer keeps the record, the public sees the truth', async ({ page }) => {
  test.setTimeout(900_000);
  const dumpConsole = captureConsole(page, OUT, 'c07');

  // ── 0. The fixture, read from the register ──
  const revoked = one<CertRow>(
    `SELECT id, status, "expiryDate", "revokedAt" FROM certificates WHERE "certificateNumber"='${REVOKED}';`,
    REVOKED,
  );
  expect(revoked.status, 'CAE820 is revoked before this walk starts').toBe('revoked');
  expect(revoked.revokedAt, 'and it carries the revocation timestamp C01 wrote').not.toBeNull();
  expect(new Date(revoked.expiryDate).getTime(), 'and it has NOT merely expired').toBeGreaterThan(Date.now());

  const active = one<CertRow>(
    `SELECT id, status, "expiryDate", "revokedAt" FROM certificates WHERE "certificateNumber"='${ACTIVE}';`,
    ACTIVE,
  );
  expect(active.status, 'the same farm holds a certificate that IS in force').toBe('active');

  const cycles = many<CycleRow>(
    `SELECT c.id, c."cycleName", c.status, p."plotCode"
       FROM planting_cycles c
       LEFT JOIN plots p ON p.id = c."plotId"
      WHERE c."certificateId"='${revoked.id}' AND c."isDeleted"=false
      ORDER BY c."createdAt";`,
  );
  expect(cycles.length, 'CAE820 still owns its two cycles: nothing was deleted by the revocation').toBe(2);
  const openCycle = cycles.find((c) => ['PLANNING', 'PLANTED', 'GROWING', 'READY_HARVEST'].includes(c.status));
  expect(openCycle, 'one of them is still open').toBeTruthy();
  const plotCode = openCycle!.plotCode;
  expect(plotCode, 'and it stands on a plot with a permanent code').toBeTruthy();

  const lot = one<LotRow>(
    `SELECT l.id, l."lotNumber", l."qrCode"
       FROM lots l
       JOIN harvest_batches b ON b.id = l."batchId"
       JOIN planting_cycles c ON c.id = b."cycleId"
      WHERE c."certificateId"='${revoked.id}' AND l."isDeleted"=false
      LIMIT 1;`,
    'the packaged lot under CAE820',
  );

  const seals = many<QrRow>(
    `SELECT q."qrCode", q."entityType", q.status
       FROM trace_qr_security q
       JOIN planting_cycle_plots cp ON cp.id = q."entityId"
       JOIN planting_cycles c ON c.id = cp."cycleId"
      WHERE q."entityType"='PLANTING_CYCLE_PLOT' AND c."certificateId"='${revoked.id}';`,
  );
  expect(seals.length, 'the plot QR seals are still there').toBeGreaterThan(0);
  expect(seals.every((s) => s.status === 'ACTIVE'), 'and still ACTIVE: a revocation revokes no seal (spec §3.4)').toBe(true);

  console.log(`[C07] fixture: ${REVOKED} revoked, ${cycles.length} cycles, lot ${lot.lotNumber}, ${seals.length} plot seals ACTIVE`);

  // ── (c) The plot sign: red hero, verify link, NO green shield ──
  //
  // Pressed BEFORE logging in, because this is what a stranger in a field sees.
  await page.goto(`/trace/plot-cycle/${encodeURIComponent(plotCode!)}`);
  await expect(page.getByText('ใบรับรองของแหล่งปลูกนี้ถูกเพิกถอน')).toBeVisible({ timeout: 200_000 });
  await expect(page.getByText('แหล่งปลูกได้รับการรับรอง GACP')).toHaveCount(0);
  await expect(page.getByText(REVOKED)).toBeVisible();
  await expect(page.getByRole('link', { name: 'ตรวจสอบใบรับรอง' })).toBeVisible();
  // Nothing about the land is published behind a withdrawn certificate.
  await expect(page.getByText(FARMERS.A.farmName)).toHaveCount(0);
  // And it is not the outage state either: this IS a verdict.
  await expect(page.getByText('ไม่สามารถตรวจสอบได้ในขณะนี้')).toHaveCount(0);
  await shot(page, OUT, 'C07-01-plot-sign-revoked.png');

  // The verify link actually goes somewhere true (the C06 copy, reached from here).
  await page.getByRole('link', { name: 'ตรวจสอบใบรับรอง' }).click();
  await expect(page).toHaveURL(new RegExp(`/verify/${REVOKED}$`));
  await expect(page.getByText('ใบรับรองถูกเพิกถอนแล้ว')).toBeVisible({ timeout: 120_000 });
  await shot(page, OUT, 'C07-02-verify-from-plot-sign.png');

  // ── (d) The lot QR: "ถูกเพิกถอน", not "ไม่พบ" ──
  await page.goto(`/trace/lot/${encodeURIComponent(lot.id)}`);
  await expect(page.getByText('ใบรับรองของแหล่งปลูกนี้ถูกเพิกถอน')).toBeVisible({ timeout: 200_000 });
  await expect(page.getByText('ไม่พบข้อมูลล็อตสินค้า')).toHaveCount(0);
  await expect(page.getByText('ไม่พบข้อมูลผลิตภัณฑ์')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'ตรวจสอบใบรับรอง' })).toBeVisible();
  await shot(page, OUT, 'C07-03-lot-qr-revoked-not-missing.png');

  // ── The farmer's half ──
  const id = farmerId(FARMERS.A);
  await g4Login(page, { kind: 'health', id, pw: pw(FARMERS.A) });

  // (a) The cycles are VISIBLE again, each carrying its label.
  await page.goto('/health/planting');
  await expect(page.getByText(openCycle!.cycleName).first()).toBeVisible({ timeout: 200_000 });
  await expect(page.getByText('ไม่อยู่ภายใต้การรับรอง').first()).toBeVisible();
  await expect(page.getByText('ใบรับรองถูกเพิกถอน').first()).toBeVisible();
  await expect(page.getByText(REVOKED).first()).toBeVisible();
  await shot(page, OUT, 'C07-04-planting-list-shows-uncovered-cycle.png');

  // (b) Starting a new cycle under the REVOKED certificate is refused, in Thai.
  //
  // The picker lists every certificate of the farm with its status, so this press
  // exists at all (see the plan's contradiction #2). The refusal comes from the
  // SERVER: the page does not pre-empt it.
  await page.goto('/health/planting/new');
  await page.getByLabel('ใบรับรอง').click();
  await page.getByRole('option', { name: new RegExp(REVOKED) }).click();
  await expect(page.getByText('ใบรับรองนี้ไม่คุ้มครองรอบปลูกใหม่')).toBeVisible();
  await shot(page, OUT, 'C07-05-new-cycle-picker-warns.png');

  // Fill the rest and press for real, so the SERVER is what refuses.
  await page.getByLabel('ชื่อรอบปลูก').fill('รอบทดสอบใต้ใบที่ถูกเพิกถอน');
  await page.getByLabel('ชนิดพืช').click();
  await page.getByRole('option').first().click();
  await page.getByRole('button', { name: /บันทึก|สร้างรอบปลูก/ }).click();
  await expect(page.getByText(/ใบรับรองของฟาร์มนี้ถูกเพิกถอน/)).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText(/คุณจึงยังเริ่มรอบปลูกใหม่ไม่ได้/)).toBeVisible();
  await shot(page, OUT, 'C07-06-new-cycle-refused-in-thai.png');

  // And the register is unchanged: the refusal wrote nothing.
  const afterCycles = many<CycleRow>(
    `SELECT c.id, c."cycleName", c.status, NULL as "plotCode"
       FROM planting_cycles c WHERE c."certificateId"='${revoked.id}' AND c."isDeleted"=false;`,
  );
  expect(afterCycles.length, 'the refused press created nothing').toBe(cycles.length);

  // (f) The plot-sign print sheet refuses too (spec §3.3).
  await page.goto(`/health/planting/${openCycle!.id}/plot-signs`);
  await expect(page.getByText('พิมพ์ป้ายรหัสแปลงไม่ได้')).toBeVisible({ timeout: 200_000 });
  await expect(page.getByText(plotCode!)).toHaveCount(0);
  await shot(page, OUT, 'C07-07-plot-signs-refused.png');

  // (g) The way OUT exists: the cancel door is offered on the uncovered cycle.
  //
  // Offered, photographed, and NOT pressed: cancelling would change the register that
  // C01 and this spec both read, and a walk that mutates its own fixture cannot be
  // re-run. The door's behaviour is pinned by
  // apps/backend/__tests__/unit/cancel-uncovered-cycle.test.js.
  await page.goto(`/health/planting/${openCycle!.id}`);
  await expect(page.getByRole('button', { name: 'ยกเลิกรอบปลูกนี้' })).toBeVisible({ timeout: 200_000 });
  await page.getByRole('button', { name: 'ยกเลิกรอบปลูกนี้' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('การยกเลิกจะปลดพื้นที่ปลูกให้คุณเริ่มรอบใหม่ได้');
  await expect(dialog.getByRole('button', { name: 'ยืนยันยกเลิกรอบปลูก' })).toBeDisabled();
  await shot(page, OUT, 'C07-08-cancel-door-offered.png');
  await page.keyboard.press('Escape');

  // ── The control: the ACTIVE certificate is untouched by all of this ──
  await page.goto(`/verify/${ACTIVE}`);
  await expect(page.getByText('ใบรับรองถูกต้องและยังมีผลบังคับใช้')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText('ใบรับรองถูกเพิกถอนแล้ว')).toHaveCount(0);
  await shot(page, OUT, 'C07-09-active-cert-still-green.png');

  // ── Nothing was revoked, suspended or reinstated by this walk ──
  const revokedAfter = one<CertRow>(
    `SELECT id, status, "expiryDate", "revokedAt" FROM certificates WHERE "certificateNumber"='${REVOKED}';`,
    REVOKED,
  );
  expect(revokedAfter.revokedAt, 'C01 revocation record untouched').toBe(revoked.revokedAt);
  const activeAfter = one<CertRow>(
    `SELECT id, status, "expiryDate", "revokedAt" FROM certificates WHERE "certificateNumber"='${ACTIVE}';`,
    ACTIVE,
  );
  expect(activeAfter.status, 'and the live certificate is still live').toBe('active');

  const lines = dumpConsole();
  console.log(`[C07] pressed: /trace/plot-cycle/${plotCode} → red hero + verify link, no green shield`);
  console.log(`[C07] pressed: /trace/lot/${lot.id} → 'ถูกเพิกถอน', not 'ไม่พบข้อมูล'`);
  console.log(`[C07] pressed: /health/planting → cycle "${openCycle!.cycleName}" VISIBLE with its uncovered label`);
  console.log(`[C07] pressed: new cycle under ${REVOKED} → refused by the server in Thai, register unchanged`);
  console.log(`[C07] pressed: plot-signs sheet → refused, no plot code rendered`);
  console.log('[C07] NOT pressed: revoke/suspend/reinstate (spec §4(e)) — the §3.6 notification is proven by');
  console.log('[C07]              apps/backend/__tests__/unit/certificate-lifecycle-notifications.test.js only');
  console.log(`[C07] browser console errors/warnings captured: ${lines.length}`);
});
```

- [ ] **Step 2: Bring the stack up on the current tree**

```bash
# backend
cd apps/backend && NODE_ENV=development PORT=8000 node server.js
# frontend (separate shell)
cd apps/web-app && BACKEND_URL=http://localhost:8000 INTERNAL_API_URL=http://localhost:8000 npx next dev -p 3000
```

The database must be at the tree's migration level, and the stack must be running **this branch's code** — a walk against a stale process proves the old behaviour. Warm the routes C07 visits with one manual load each before the run: `next dev` compiles per route on first hit, and a cold compile routinely exceeds the timeout.

- [ ] **Step 3: Run the walk**

```bash
cd apps/web-app && G4_FARMER=A G4_PW_A="$(cat <scratchpad path>)" npx playwright test e2e-g4/c07-revoked-certificate-consequences.spec.ts --config=playwright.g4.config.ts
```

The password comes from the scratchpad file the run command exports — never from this plan, never committed (L2).

- [ ] **Step 4: Read the evidence with your eyes**

Open `evidence/g4-rebuild-2026-08-25/c07/` and check each screenshot actually shows what its name claims — particularly `C07-01` (no green shield anywhere in the frame) and `C07-03` (the words "ไม่พบ" absent). A passing assertion on a page that rendered a spinner is the failure mode this repo has paid for twice. Then open the video and the trace in the report at `evidence/g4-rebuild-2026-08-25/playwright-report`.

- [ ] **Step 5: Commit**

```bash
cd ../.. && git add apps/web-app/e2e-g4/c07-revoked-certificate-consequences.spec.ts evidence/g4-rebuild-2026-08-25/c07
git commit -m "test(g4): C07 presses what a revoked certificate does, end to end"
```

---

### Task 11: delete the dead guards

**Files:**
- Modify: `apps/backend/services/planting-cycle-service.js:274-281` (`hasActiveCertificate`), `:637` (its export), `:212` (the docblock)
- Verify: `apps/backend/services/trace-service/common.js` no longer contains `buildCertificateSnapshot` (deleted in Task 1 Step 3)

> **Pointer corrections against HEAD:** `hasActiveCertificate` is `:274-281`, exported at `:637`, with **zero callers repo-wide** — correct. The `:212` docblock names `requireActiveCertificate(cycle)`, a function that does not exist — correct.

**Interfaces:**
- Consumes: Task 5 Step 7, which made `verifyOwnedCycle(..., { requireActiveCert: true })` a real, coverage-backed gate. This task removes what that replaced.
- Produces: nothing new. `hasActiveCertificate` is gone from the module's exports.

- [ ] **Step 1: Prove there is still no caller**

```bash
cd apps/backend && grep -rn "hasActiveCertificate" --include=*.js --include=*.ts . | grep -v node_modules
cd ../.. && grep -rn "hasActiveCertificate" apps/web-app/src | grep -v node_modules
```

Expected: the backend hit list contains only the definition, the export, and the docblock. **The web app has its own separate `hasActiveCertificate` name** (`use-planting-cycle-detail-derived.ts`, `planting-cycle-detail-page-config.ts`) — that is a different symbol in a different language and must NOT be touched here. Paste both outputs; if the backend one has a real caller, stop and report rather than deleting.

- [ ] **Step 2: Delete it**

Remove `apps/backend/services/planting-cycle-service.js:274-281` and the `hasActiveCertificate,` line from `module.exports` (`:637`), leaving:

```js
// `hasActiveCertificate` was deleted on 2026-08-28. It was correct logic
// (lowercased the status, checked expiry, checked isDeleted) that nothing ever
// called and no test ever ran — the third of three ways this file described a rule
// it did not enforce, alongside the never-passed `requireActiveCert` option and a
// docblock naming a `requireActiveCertificate(cycle)` that never existed. The
// enforced version is certificateCoverage() in services/trace-service/common.js, and
// verifyOwnedCycle(..., { requireActiveCert: true }) now calls it for real.
```

Rewrite the `:212` docblock so it stops pointing at a function that never existed:

```js
 *   - Use `verifyOwnedCycle(cycleId, userId, { requireActiveCert: true })` to
 *     gate a cert-restricted action. It asks certificateCoverage()
 *     (services/trace-service/common.js), the same definition the public trace
 *     doors use, so this gate and that one can never disagree.
```

- [ ] **Step 3: Run the suites that load this module**

```bash
cd apps/backend && npx jest \
  __tests__/unit/planting-coverage-list.test.js \
  __tests__/unit/cancel-uncovered-cycle.test.js \
  __tests__/integration/planting-plot-trace.test.js \
  __tests__/integration/planting-plot-trace-harvest-guards.test.js \
  __tests__/integration/provider-admin-planting-integrity.test.js
```

Expected: PASS. A red here means something imported the symbol after all — restore it and report, rather than adding a shim.

- [ ] **Step 4: Ratchet, then the full local gate**

```bash
cd ../.. && bash scripts/check-done.sh ratchet
LOCAL_GATE_FULL=1 NODE_OPTIONS=--max-old-space-size=3072 bash scripts/ci/local-gate.sh
```

The dead-route counter should FALL (two dead exports gone). It must not rise. Compare against the `AUDIT_LEDGER.md` baseline rather than against a memory of it, and treat the known-local failures as such: `dataset-export-service.test.js:81` (L-005, sandbox-only) and the `pdf-ssrf` timeout are pre-existing and not this diff's.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/services/planting-cycle-service.js
git commit -m "chore(planting): delete the guards nobody called, now that one is enforced"
```

---

## Evidence pack (Tier C — assemble before asking for the merge)

`CLAUDE.md` §5 tier C requires the full pack plus a view-pack, and `§6` caps the report at 40 lines. Collect:

1. **RED output pasted for every task**, from the step that says "watch it fail" — the actual failure text, not a description of it.
2. **GREEN output** for each task's suite list, plus the full-suite run (or the `LOCAL_GATE_FULL=1` fallback with two review layers, per the Actions-lock allowance).
3. **`bash scripts/check-done.sh ratchet`** before the first task and after the last, side by side.
4. **`ls -l apps/backend/keys/*.pem`** before and after Task 8.
5. **The C07 view-pack**: `evidence/g4-rebuild-2026-08-25/c07/` with its `INDEX.md` naming what each screenshot proves, the video, and the trace. Weight equal to or above the test logs (`CLAUDE.md` §5 tier B/C).
6. **The five spec contradictions**, restated for the operator with the direction this plan took on each.
7. **A ledger note** recording that the §3.6 notification was proven by unit test only, because spec §4(e) forbids touching another live certificate — exactly as §4 itself instructs.

Status lines use the `CLAUDE.md` §2 vocabulary only: `DONE(probe:<name>)` with the output attached, `PENDING`, or `BLOCKED(operator:<need>)`. **The merge is the operator's** (L5, L6).

---

## Self-Review

Run against the spec with fresh eyes, per the writing-plans skill.

**1. Spec coverage**

| Spec section | Task |
|---|---|
| §1 `certificateCoverage`, computed live, no flag, no admin choice | T1 (+ Global Constraints) |
| §2 the deviations table | T2, T4, T5, T7 (each names its row) |
| §3.1 list stops filtering, `coverage` per cycle, FE label + verify link | T5 Step 4, T6 Steps 3-4 |
| §3.1 `createCycle` calls the existing `requireActiveCert` | T5 Steps 6-7 |
| §3.1 `assertNoOpenCycle` kept; cancel door with reason | T5 Step 10 (the guard is untouched by design) |
| §3.1 harvest / batch / lot / QR need coverage at the cut date | T5 Steps 8-9 |
| §3.2 plot resolver uses the gate, drops the hardcode | T2 |
| §3.2 unified 410 body | T3 |
| §3.2 `trace-fetch` 410 → `uncovered`; four pages; green shield only when covered | T4 |
| §3.2 reason-specific copy | T3 Step 3 (API), T4 Step 3 (web), T6 Step 3 (farmer) |
| §3.3 plot QR / plot-signs gated | T5 Step 9 (server), T7 (web) |
| §3.4 revoke/suspend touch no cycle, lot or seal; notification | Global Constraints + T8 |
| §3.5 renewal follows the successor, FK never moved | T1 Steps 1&4, asserted in T2 and T5 |
| §3.6 in-app notification via `createNotification` | T8 |
| §4 RED (1)-(6) | (1) T2 · (2) T4 · (3) T5 · (4) T5 · (5) T4 · (6) T7 |
| §4 unit tests: coverage every reason + successor; route tests all four resolvers; planting list/create/cancel; plot-sign | T1, T2, T3, T5, T7 |
| §4 the C07 press | T10 |
| §5 not fixed here: `plant_units`, generic 410 copy, dead guards | `plant_units` deliberately untouched; copy done in T3; dead code T1 Step 3 + T11 |
| Error code | T9 |

No spec requirement is left without a task. The one spec line deliberately **not** implemented is `plant_units` (spec §5 puts it out of scope), and it is named as such.

**2. Placeholder scan**

No "TBD", no "implement later", no "add appropriate error handling", no "similar to Task N". Every code step carries the actual code. Two places describe an edit in prose rather than a full file: T4 Step 6 (three of the four pages take the *same* three edits, and the fourth is written out in full) and T6 Steps 5-6 (dialog copy and picker changes are given as exact strings with exact line anchors). Both give the engineer the literal text and the line numbers; neither leaves a decision open.

**3. Type consistency**

Checked across tasks:
- `certificateCoverage` / `resolveCertificateCoverage` / `evaluateCertGate` — one spelling each, defined in T1, consumed by T2 (plot resolver), T3 (410 body), T5 (planting, harvest, lot, QR).
- `coverage.covered` vs `coverage.gated` — the split is defined once in the Interfaces block and honoured everywhere: public resolvers branch on `gated`, doors branch on `covered`. T2's test asserts both sides of it.
- `CycleCoverage` (five keys, no `minimalBody`) is the wire shape in T5, the TS type in T6, and what T7's `isCycleCovered` reads. T5 has an explicit test that the key set is exactly those five.
- `TraceUncoveredCoverage` is declared in `trace-fetch.ts` (T4) and imported by `trace-uncovered-copy.ts` and `trace-uncovered.tsx` — one declaration, three consumers.
- `'CERTIFICATE_NOT_COVERING'` is the same literal in the 410 body (T3), the thrown error (T5), the classifier (T4) and the catalogue (T9).
- `CANCELLED_UNCOVERED` appears in `CYCLE_STATUSES` (T5 Step 4), `isReservedCycleStatus` (T5 Step 7) and the cancel service (T5 Step 10), and is asserted absent from `OPEN_CYCLE_STATUSES` by T5's test.
- `COVERAGE_CAUSE_TH` is defined once in T6's `coverage-badge.tsx` and imported by T7 rather than retyped.
- `notifyCertificateCoverageChanged(certificate, event)` — one signature, three call sites (T8 Step 6).

**Fixed during review:** T7 originally re-declared the four Thai cause strings; it now imports `COVERAGE_CAUSE_TH` from T6. T5's `lots.js` gate originally called a bare `buildNotCoveringError`; it now calls `plantingService.buildNotCoveringError`, which is the exported name T5 Step 4 actually creates.

## Coordinator rulings on the contradictions (2026-08-28, binding for execution)

1. Coverage is required **now and as at the cut date** — accepted as the plan wrote it.
2. The certificate picker lists every certificate with its coverage label and the server refuses an uncovered one; C07(b) presses that refusal — accepted.
3. **Overruled.** `buildDormantPlotBody` must not keep a hardcoded `verification:{valid:true}` and the shield must not be gated client-side only: a dormant plot derives its coverage server-side from its farm's certificates (`certificateCoverage` over the farm's most recent non-deleted certificate; any active certificate → covered, else the reason of the most recent one; no certificate → `missing`). The plot-cycle resolver and the dormant body share that helper; the client renders whatever `coverage` the API returns. Add the RED test (dormant plot of a farm whose only certificate is revoked answers `covered:false`).
4. C07(e) is proven by unit + route tests only; no live certificate is touched — accepted, with the ledger note.
5. A renewed certificate whose successor is not covered reports the successor's own reason and keeps `successorCertificateNumber` — accepted.
6. Cancel reason stored in `notes` under the `CYCLE_CANCEL_META:` prefix — accepted (no migration).
