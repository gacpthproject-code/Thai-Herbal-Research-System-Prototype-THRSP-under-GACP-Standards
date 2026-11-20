# Onsite Evidence-Capture End-to-End Integration Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the onsite inspect capture feature work end-to-end so a fully-evidenced ONSITE audit can PASS and auto-mint a real GACP `Certificate` — by creating the `AuditChecklist` row at assignment, single-sourcing the applicationId→auditId resolution, pinning the decided audit through the mint, and matching every FE↔BE wire contract exactly.

**Architecture:** The cert gate (`onsite-evidence-gate.js`) counts `FarmAuditPhoto` + `FarmAuditChecklistItem` rows keyed to an `AuditChecklist.id`, but nothing created that row and the FE spoke a different id / body / vocabulary at every boundary. We create the row at `assignAuditor`, extract a shared `resolveCurrentOnsiteAuditId` resolver the gate + `/context` both call, pin the decided auditId through decision→mint, add an explicit `/context`-by-applicationId route, and align the FE service wire (id source, checklist body, vocab, GPS shape, photo response) — then prove it with supertest wire-contract tests on the real router and a real-Postgres e2e that drives a PASS through `/decision` and asserts a `Certificate` row appears.

**Tech Stack:** Node.js + Express (backend routes), Prisma (Postgres) with `prisma/schema/*.prisma`, Jest + supertest (backend tests), Next.js App Router + React + TypeScript (`apps/web-app`), `@/lib/api/api-client` (thin fetch wrapper), Jest + `react-dom/server` (FE tests), Playwright (e2e fixtures — mock-path update only).

## Global Constraints

Every task's requirements implicitly include this section. Values are copied from `docs/superpowers/specs/2026-08-17-onsite-evidence-capture-fix-design.md`.

- **Tier C — operator merges.** This touches audit / evidence / cert-issuance / identity. Agents do NOT merge; hand the operator the `! git push origin <branch>:main && git fetch origin main:main` line. The cert-affecting parts (Tasks 1–3, 12) are reviewer#2-gated (GOALS G3).
- **RED-first everywhere.** Every task writes a failing test, runs it to see it fail, implements the minimum to pass, then re-runs to GREEN. Paste the RED before asking for GREEN (Tier C requirement, spec §5).
- **Do NOT mock the FE↔BE seam.** Backend wire tests use supertest against the *real* Express onsite router. FE wire tests spy at the `apiClient`/fetch level and assert the exact outgoing body — never `jest.mock` `audit-service` wholesale (that wholesale mock is the root cause B10, spec §5).
- **Org-optional resolver stays behavior-identical when no org supplied.** `resolveCurrentOnsiteAuditId(prisma, applicationId, { organizationId } = {})` applies the `organizationId` filter ONLY when supplied; the gate passes none, so the refactor must not change any existing gate result (spec §2, Task 2).
- **Authorization is by auditorId-match, not org-scope.** Auditor org = application org (`assignAuditor` enforces it); `/context` scope check is `audit.auditorId === req.user.id` (ADMIN bypasses); org is a defense-in-depth filter only where the caller has one (spec §2, §7.2).
- **Vocabulary is canonicalized at the FE boundary:** the UI answer `YES/NO/NA` maps to `PASS/FAIL/NA` at a single point in `audit-service.ts` (spec §7.3). The separate decision-vocab fragmentation (PASS/FAIL/NEEDS_REVIEW vs PASS/MINOR/MAJOR/REJECT) stays OUT of scope.
- **Evidence integrity is in-scope, not deferred.** GPS `NaN` and broken photos are fake evidence for a government cert — B6/B7/B8 are fixed here (spec §6). GPS guards use `Number.isFinite`, not `typeof x !== 'number'`.
- **Idempotent audit-row creation:** exactly one active `AuditChecklist` per application; find-or-create, never duplicate (spec §7.1).

---

## File structure

**Backend — created**

| File | Responsibility |
|---|---|
| `apps/backend/services/onsite-audit-resolver.js` | Shared `resolveCurrentOnsiteAuditId(prisma, applicationId, {organizationId}={})` — the single source of applicationId→auditId resolution (Task 2). |
| `apps/backend/__tests__/unit/onsite-audit-resolver.test.js` | Unit tests for the resolver (org-optional, isDeleted, IN_PROGRESS preference) (Task 2). |
| `apps/backend/__tests__/integration/onsite-decision-mint-e2e.test.js` | DATABASE_URL-gated e2e: a fully-evidenced ONSITE PASS through `submitDecision` auto-mints a `Certificate`; an under-evidenced one refuses (Task 12). |

**Backend — modified**

| File | Change |
|---|---|
| `apps/backend/services/audit-scheduling-service.js` | `assignAuditor` find-or-creates the ONSITE `AuditChecklist` inside its tx (Task 1). |
| `apps/backend/services/onsite-evidence-gate.js` | `assertOnsiteEvidenceSufficient` calls the resolver; accepts an optional pinned `auditId` + `organizationId` (Tasks 2, 3). |
| `apps/backend/services/audit-onsite-service.js` | `submitDecision` pins its `auditId` to the gate + persists `formData.onsiteAuditId`; `startInspection`/`uploadPhoto` GPS guards use `Number.isFinite`; `uploadPhoto` returns `url` + best-effort checklistItem link (Tasks 3, 8, 9). |
| `apps/backend/services/certificate-service.js` | `generateCertificate` passes the pinned `app.formData.onsiteAuditId` to the gate (Task 3). |
| `apps/backend/routes/api/audit/onsite.js` | New `GET /application/:applicationId/context`; shared `loadSavedAnswers` (photoIds from `FarmAuditPhoto`); `/start` + `/photo` accept the nested `gps` shape; `/photo` returns `url` + forwards `itemId` (Tasks 4, 8, 9). |
| `apps/backend/__tests__/unit/audit-onsite-routes.test.js` | Fix the fabricated `photoIds` scalar (B10); add new-route + savedAnswers-join coverage (Task 4). |

**Backend — wire tests (created in Task 12)**

| File | Responsibility |
|---|---|
| `apps/backend/__tests__/unit/audit-onsite-wire-contract.test.js` | supertest on the real router: exact req.body → service args and res.json shapes for start/checklist/photo/decision (Task 12). |

**Frontend — modified**

| File | Change |
|---|---|
| `apps/web-app/src/lib/services/audit-service.ts` | `getOnsiteContext(applicationId)` → new route; `submitChecklistItem` emits `{items:[{itemCode,response,...}]}` + vocab map; `getOnsiteContext` maps savedAnswers `response→answer`; `uploadPhoto` reads `url`; new `verifyGps` (Tasks 5, 6, 7, 9, 10). |
| `apps/web-app/src/app/provider/audits/[id]/inspect/client-view.tsx` | Prop is `applicationId`; resolve `ctx.audit.id`; all writes use it; savedAnswers read `photoIds`; call `verifyGps` after start (Tasks 5, 7, 10). |
| `apps/web-app/src/app/provider/audits/[id]/inspect/page.tsx` | Pass `applicationId={id}` (Task 5). |
| `apps/web-app/src/app/provider/audits/[id]/page.tsx` | Replace the ONSITE field-tools tab content with the inspect entry (Task 11). |
| `apps/web-app/playwright/auditor-flow.spec.ts` + `apps/web-app/playwright/fixtures/dtam-fixtures.ts` | Update mocked `/context` route regex to `/application/:id/context` (Task 5, mock-alignment only). |

**Frontend — created (Task 12)**

| File | Responsibility |
|---|---|
| `apps/web-app/src/lib/services/__tests__/audit-service.wire.test.ts` | apiClient-level spy asserting the exact outgoing path + body for each onsite call (Task 12). |

---

### Task 1: Create the `AuditChecklist` at auditor-assignment (ONSITE)

Fixes **B1** + the wrong-`auditorId` half of B9. Find-or-create one active `AuditChecklist` per application, inside `assignAuditor`'s existing Serializable transaction, so the row the gate reads exists before the visit.

**Files:**
- Modify: `apps/backend/services/audit-scheduling-service.js` (inside the `$transaction` at `:525-559`, after the `writeApplicationStatus(...)` call that ends at `:558`)
- Test: `apps/backend/__tests__/unit/audit-scheduling-service.test.js` (extend `createPrismaMock` at `:41-120` + add a test in the `describe('[Iter25] audit-scheduling-service — assignAuditor')` block at `:245`)

**Interfaces:**
- Consumes: nothing from earlier tasks. Uses in-scope locals already present in `assignAuditor`: `app.id`, `app.organizationId` (selected at `:430`), `auditorId` (validated ACTIVE AUDITOR at `:471-485`), `effectiveActor`, `mode` (`'ONSITE'|'ONLINE_MEET'` from `:411-413`), and the tx handle `tx`.
- Produces: for an ONSITE assignment there is exactly one `AuditChecklist` row with `{ applicationId: app.id, auditorId, status: 'IN_PROGRESS', isDeleted: false, organizationId: app.organizationId }`. `AuditChecklist.id` is a uuid; downstream resolution is by `applicationId` (Task 2), not by this id.

- [ ] **Step 1: Write the failing test** — add to `audit-scheduling-service.test.js`. First teach the prisma mock about `auditChecklist` by adding this block inside `createPrismaMock`, immediately before `$transaction:` (`:114`):

```javascript
        auditChecklist: {
            findFirst: jest.fn(async () => null),
            create: jest.fn(async ({ data }) => ({ id: 'audit-created-1', ...data })),
        },
```

Then add the test at the end of the `assignAuditor` describe block:

```javascript
    test('ONSITE assign find-or-creates one AuditChecklist (IN_PROGRESS, auditorId=assigned, org=app org)', async () => {
        const app = makeApplication();
        const { prisma } = createPrismaMock({
            applications: [app],
            users: [AUDITOR_USER, APPLICANT_USER],
        });
        const svc = loadService({ prisma, fanoutMock: makeFanoutMock() });

        await svc.assignAuditor({
            applicationId: 'app-1',
            auditorId: 'auditor-1',
            scheduledDate: nextWorkingDayAt(10).toISOString(),
            location: 'ไร่ตัวอย่าง จ.เชียงใหม่',
            actor: ACTOR_SCHEDULER,
        });

        expect(prisma.auditChecklist.findFirst).toHaveBeenCalledTimes(1);
        expect(prisma.auditChecklist.create).toHaveBeenCalledTimes(1);
        const created = prisma.auditChecklist.create.mock.calls[0][0].data;
        expect(created).toMatchObject({
            applicationId: 'app-1',
            auditorId: 'auditor-1',
            status: 'IN_PROGRESS',
            organizationId: 'org-1',
        });
    });

    test('ONSITE assign is idempotent: an existing active AuditChecklist is reused, not duplicated', async () => {
        const app = makeApplication();
        const { prisma } = createPrismaMock({
            applications: [app],
            users: [AUDITOR_USER, APPLICANT_USER],
        });
        prisma.auditChecklist.findFirst.mockResolvedValueOnce({ id: 'audit-existing-1' });
        const svc = loadService({ prisma, fanoutMock: makeFanoutMock() });

        await svc.assignAuditor({
            applicationId: 'app-1',
            auditorId: 'auditor-1',
            scheduledDate: nextWorkingDayAt(10).toISOString(),
            actor: ACTOR_SCHEDULER,
        });

        expect(prisma.auditChecklist.create).not.toHaveBeenCalled();
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && npx jest __tests__/unit/audit-scheduling-service.test.js -t "AuditChecklist"`
Expected: FAIL — `prisma.auditChecklist.create` receives 0 calls (no creation code exists yet).

- [ ] **Step 3: Write minimal implementation** — in `audit-scheduling-service.js`, inside the `$transaction` callback, insert this block immediately AFTER the `writeApplicationStatus({ ... })` call closes (after `:558`, before the callback's closing `});` at `:559`):

```javascript
            // cert-integrity follow-up (onsite evidence, 2026-08-17): the onsite
            // evidence gate counts photos + checklist items keyed to an
            // AuditChecklist row, but nothing created it — every real app resolved
            // to null. Create it here (ONSITE only) so it exists before the visit.
            // Idempotent: one active row per application (spec §7.1).
            if (mode === 'ONSITE') {
                const existingAudit = await tx.auditChecklist.findFirst({
                    where: { applicationId: app.id, isDeleted: false, status: 'IN_PROGRESS' },
                    orderBy: { createdAt: 'desc' },
                    select: { id: true },
                });
                if (!existingAudit) {
                    await tx.auditChecklist.create({
                        data: {
                            applicationId: app.id,
                            templateName: 'GACP_GENERAL',
                            sections: [],
                            auditorId,
                            status: 'IN_PROGRESS',
                            createdBy: effectiveActor.id || actorId || null,
                            organizationId: app.organizationId,
                        },
                    });
                }
            }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && npx jest __tests__/unit/audit-scheduling-service.test.js`
Expected: PASS (the two new tests + all pre-existing assignAuditor tests stay green).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/services/audit-scheduling-service.js apps/backend/__tests__/unit/audit-scheduling-service.test.js
git commit -m "feat(audit): find-or-create AuditChecklist at ONSITE assignAuditor (fixes B1)"
```

---

### Task 2: Shared `resolveCurrentOnsiteAuditId` resolver + refactor the gate

Fixes **B1's resolution** + the org trap + soft-delete. Single-source the applicationId→auditId lookup; refactor `onsite-evidence-gate.js` to call it. Org filter applies only when supplied so the gate stays behavior-identical.

**Files:**
- Create: `apps/backend/services/onsite-audit-resolver.js`
- Create: `apps/backend/__tests__/unit/onsite-audit-resolver.test.js`
- Modify: `apps/backend/services/onsite-evidence-gate.js` (`:46-100` — replace the inline `findFirst` at `:60-63` with a resolver call; widen the arg list at `:46-49`)

**Interfaces:**
- Produces: `async function resolveCurrentOnsiteAuditId(prisma, applicationId, { organizationId } = {}) → Promise<string|null>`. Returns the most-recent non-deleted `AuditChecklist.id` for the application, preferring an `IN_PROGRESS` row; applies `organizationId` only when truthy; returns `null` when none or when `prisma`/`applicationId` missing.
- Produces (widened gate): `async function assertOnsiteEvidenceSufficient({ prisma, applicationId, auditId, organizationId, minPhotos }) → Promise<{ auditId: string, photoCount: number, itemCount: number }>`. `auditId` is the optional pinned row (Task 3 supplies it); when absent it resolves via `resolveCurrentOnsiteAuditId`. Error codes unchanged: `NO_ONSITE_AUDIT | EVIDENCE_CAPTURE_UNAVAILABLE | INSUFFICIENT_PHOTOS | INCOMPLETE_CHECKLIST`.
- Consumed by: Task 3 (gate `auditId`), Task 4 (`/context` route calls the resolver directly).

- [ ] **Step 1: Write the failing resolver test** — `onsite-audit-resolver.test.js`:

```javascript
'use strict';

const { resolveCurrentOnsiteAuditId } = require('../../services/onsite-audit-resolver');

function makePrisma(rows) {
    return {
        auditChecklist: {
            findFirst: jest.fn(async ({ where, orderBy }) => {
                let matches = rows.filter((r) =>
                    r.applicationId === where.applicationId
                    && r.isDeleted === where.isDeleted
                    && (where.organizationId === undefined || r.organizationId === where.organizationId)
                    && (where.status === undefined || r.status === where.status));
                if (orderBy?.createdAt === 'desc') {
                    matches = [...matches].sort((a, b) => b.createdAt - a.createdAt);
                }
                const row = matches[0];
                return row ? { id: row.id } : null;
            }),
        },
    };
}

describe('resolveCurrentOnsiteAuditId', () => {
    const R = (over) => ({ isDeleted: false, status: 'IN_PROGRESS', organizationId: 'org-1', createdAt: 1, ...over });

    test('returns null when no row exists', async () => {
        expect(await resolveCurrentOnsiteAuditId(makePrisma([]), 'app-1')).toBeNull();
    });

    test('prefers an IN_PROGRESS row over a newer COMPLETED one', async () => {
        const prisma = makePrisma([
            R({ id: 'a-inprog', applicationId: 'app-1', status: 'IN_PROGRESS', createdAt: 1 }),
            R({ id: 'a-done', applicationId: 'app-1', status: 'COMPLETED', createdAt: 5 }),
        ]);
        expect(await resolveCurrentOnsiteAuditId(prisma, 'app-1')).toBe('a-inprog');
    });

    test('falls back to the most-recent row of any status when none IN_PROGRESS', async () => {
        const prisma = makePrisma([
            R({ id: 'a-old', applicationId: 'app-1', status: 'COMPLETED', createdAt: 1 }),
            R({ id: 'a-new', applicationId: 'app-1', status: 'COMPLETED', createdAt: 9 }),
        ]);
        expect(await resolveCurrentOnsiteAuditId(prisma, 'app-1')).toBe('a-new');
    });

    test('excludes soft-deleted rows (isDeleted:false always applied)', async () => {
        const prisma = makePrisma([R({ id: 'a-del', applicationId: 'app-1', isDeleted: true })]);
        expect(await resolveCurrentOnsiteAuditId(prisma, 'app-1')).toBeNull();
    });

    test('applies organizationId ONLY when supplied', async () => {
        const rows = [R({ id: 'a-org1', applicationId: 'app-1', organizationId: 'org-1' })];
        expect(await resolveCurrentOnsiteAuditId(makePrisma(rows), 'app-1', { organizationId: 'org-2' })).toBeNull();
        expect(await resolveCurrentOnsiteAuditId(makePrisma(rows), 'app-1')).toBe('a-org1');
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/backend && npx jest __tests__/unit/onsite-audit-resolver.test.js`
Expected: FAIL — `Cannot find module '../../services/onsite-audit-resolver'`.

- [ ] **Step 3: Create the resolver** — `onsite-audit-resolver.js`:

```javascript
'use strict';

/**
 * @module services/onsite-audit-resolver
 *
 * Single source of the applicationId -> AuditChecklist.id resolution the
 * onsite evidence flow keys off. The cert gate (onsite-evidence-gate.js) and
 * the inspect /context route both call this so they can never diverge.
 *
 * Preference order for a PASS/cert-mint/inspect happening NOW:
 *   1. the IN_PROGRESS row (the audit currently being executed)
 *   2. otherwise the most-recently-created row of any status (CAR / re-audit)
 * Soft-deleted rows are never returned. organizationId is a defense-in-depth
 * filter applied ONLY when the caller supplies one (the gate passes none, so
 * the gate stays behavior-identical — spec §2).
 *
 * @param {object} prisma           prisma client OR tx handle
 * @param {string} applicationId
 * @param {object} [opts]
 * @param {string} [opts.organizationId]
 * @returns {Promise<string|null>}  AuditChecklist.id, or null
 */
async function resolveCurrentOnsiteAuditId(prisma, applicationId, { organizationId } = {}) {
    if (!prisma || typeof prisma.auditChecklist?.findFirst !== 'function') { return null; }
    if (!applicationId) { return null; }

    const baseWhere = { applicationId, isDeleted: false };
    if (organizationId) { baseWhere.organizationId = organizationId; }

    const inProgress = await prisma.auditChecklist.findFirst({
        where: { ...baseWhere, status: 'IN_PROGRESS' },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
    });
    if (inProgress) { return inProgress.id; }

    const latest = await prisma.auditChecklist.findFirst({
        where: baseWhere,
        orderBy: { createdAt: 'desc' },
        select: { id: true },
    });
    return latest ? latest.id : null;
}

module.exports = { resolveCurrentOnsiteAuditId };
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/backend && npx jest __tests__/unit/onsite-audit-resolver.test.js`
Expected: PASS.

- [ ] **Step 5: Refactor the gate to call the resolver** — in `onsite-evidence-gate.js`, add the require after the module docblock (top of file, near `'use strict'` region is a comment; put it just above `async function assertOnsiteEvidenceSufficient`):

```javascript
const { resolveCurrentOnsiteAuditId } = require('./onsite-audit-resolver');
```

Replace the destructure + validation at `:47-49`:

```javascript
    const { prisma, applicationId, minPhotos } = args || {};
    if (!prisma) { throw new TypeError('assertOnsiteEvidenceSufficient: prisma required'); }
    if (!applicationId) { throw new TypeError('assertOnsiteEvidenceSufficient: applicationId required'); }
```

with:

```javascript
    const { prisma, applicationId, auditId: pinnedAuditId, organizationId, minPhotos } = args || {};
    if (!prisma) { throw new TypeError('assertOnsiteEvidenceSufficient: prisma required'); }
    if (!applicationId && !pinnedAuditId) {
        throw new TypeError('assertOnsiteEvidenceSufficient: applicationId or auditId required');
    }
```

Then replace the inline audit lookup at `:56-70` (the `const audit = await prisma.auditChecklist.findFirst(...)` block through its `NO_ONSITE_AUDIT` throw) with:

```javascript
    // Single-sourced resolution (onsite-audit-resolver). When Task 3 pins an
    // auditId (the decision freezes the row), verify that exact row is live;
    // otherwise resolve the current row for the application.
    let auditId = pinnedAuditId || null;
    if (auditId) {
        const live = await prisma.auditChecklist.findFirst({
            where: { id: auditId, isDeleted: false },
            select: { id: true },
        });
        auditId = live ? live.id : null;
    } else {
        auditId = await resolveCurrentOnsiteAuditId(prisma, applicationId, { organizationId });
    }
    if (!auditId) {
        const err = new Error(
            `assertOnsiteEvidenceSufficient: no onsite audit record found for application ${applicationId} — cannot certify an application with no recorded onsite audit.`,
        );
        err.code = 'NO_ONSITE_AUDIT';
        throw err;
    }
```

Finally, replace the two remaining `audit.id` references (`:81` and `:90`, the `count({ where: { auditId: audit.id } })` calls) with `auditId`, and the return at `:99` `return { auditId: audit.id, ... }` with `return { auditId, photoCount, itemCount };`.

- [ ] **Step 6: Run the gate's own suite to prove behavior-identical**

Run: `cd apps/backend && npx jest __tests__/services/onsite-evidence-gate.test.js`
Expected: PASS unchanged (all 11 cases — NO_ONSITE_AUDIT, EVIDENCE_CAPTURE_UNAVAILABLE partial, INSUFFICIENT_PHOTOS, INCOMPLETE_CHECKLIST, most-recent). The mock `findFirst` ignores the extra `status`/`isDeleted` filters, so the IN_PROGRESS-first query returns the same most-recent row it always did.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/services/onsite-audit-resolver.js apps/backend/__tests__/unit/onsite-audit-resolver.test.js apps/backend/services/onsite-evidence-gate.js
git commit -m "feat(audit): shared resolveCurrentOnsiteAuditId + gate refactor (org-optional, isDeleted, IN_PROGRESS-first)"
```

---

### Task 3: Pin the decided `auditId` through decision → mint

Prevents temporal divergence (a newer `AuditChecklist` between capture and mint). `submitDecision` already holds the `auditId`; pass THAT to the gate and persist it as `formData.onsiteAuditId` so `generateCertificate` verifies the SAME row.

**Files:**
- Modify: `apps/backend/services/audit-onsite-service.js` (`submitDecision` gate call `:798-804`; the `carFormData`/`additionalData` block `:812-874`)
- Modify: `apps/backend/services/certificate-service.js` (`generateCertificate` gate call `:300`)
- Test: `apps/backend/__tests__/services/audit-onsite-service.test.js` (add a `submitDecision` pinning assertion) and `apps/backend/__tests__/unit/certificate-service-evidence-gate.test.js` (assert the pinned id is forwarded)

**Interfaces:**
- Consumes: the widened gate `assertOnsiteEvidenceSufficient({ prisma, applicationId, auditId, minPhotos })` from Task 2.
- Produces: after a PASS/FAIL decision the application's `formData.onsiteAuditId === <the AuditChecklist.id the auditor acted on>`. `generateCertificate` reads `app.formData?.onsiteAuditId` and forwards it to the gate; when absent (legacy/other paths) the gate resolves as before.

- [ ] **Step 1: Write the failing test** — in `audit-onsite-service.test.js`, add a test that spies on the gate. At the top of the file confirm the pattern already `jest.mock`s `./onsite-evidence-gate`; if it does, reuse that mock, otherwise add:

```javascript
jest.mock('../../services/onsite-evidence-gate', () => ({
    assertOnsiteEvidenceSufficient: jest.fn(async () => ({ auditId: 'aud-1', photoCount: 5, itemCount: 24 })),
}));
```

Then the assertion (use the file's existing prisma/tx mock harness that backs `submitDecision`; seed an audit `{ id: 'aud-1', status: 'IN_PROGRESS', auditorId: 'auditor-1', application: { id: 'app-1', status: 'AUDIT_CONFIRMED', formData: {} } }`):

```javascript
    test('submitDecision(PASS) pins its auditId to the gate and persists formData.onsiteAuditId', async () => {
        const gate = require('../../services/onsite-evidence-gate');
        const { prisma, updates } = makeSubmitDecisionPrisma({
            audit: { id: 'aud-1', status: 'IN_PROGRESS', auditorId: 'auditor-1',
                application: { id: 'app-1', status: 'AUDIT_CONFIRMED', applicationNumber: 'A-1', healthId: null, formData: {} } },
        });

        await auditOnsiteService.submitDecision({
            auditId: 'aud-1', decision: 'PASS', summary: 'ok', actorId: 'auditor-1', prisma,
        });

        expect(gate.assertOnsiteEvidenceSufficient).toHaveBeenCalledWith(
            expect.objectContaining({ applicationId: 'app-1', auditId: 'aud-1' }),
        );
        // The parent-application write carried onsiteAuditId in formData.
        const appWrite = updates.find((u) => u.additionalData?.formData);
        expect(appWrite.additionalData.formData.onsiteAuditId).toBe('aud-1');
    });
```

> If `audit-onsite-service.test.js` has no reusable `submitDecision` prisma helper, add a local `makeSubmitDecisionPrisma({ audit })` that returns `{ prisma, updates }` where `prisma.auditChecklist.findFirst` resolves the seeded audit, `prisma.auditChecklist.update` records nothing, `prisma.$transaction(cb)` runs `cb(prisma)`, and `writeApplicationStatus` is captured by mocking `../../services/application-status-writer` to push each call's args into `updates`. Match the mocking already present in that file for `application-status-writer`.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/backend && npx jest __tests__/services/audit-onsite-service.test.js -t "pins its auditId"`
Expected: FAIL — the gate is called with `{ applicationId, minPhotos }` (no `auditId`), and no `onsiteAuditId` is written.

- [ ] **Step 3: Implement the pin in `submitDecision`** — change the gate call at `:798-804`:

```javascript
    if (decision === DECISIONS.PASS) {
        await assertOnsiteEvidenceSufficient({
            prisma,
            applicationId: audit.application.id,
            auditId,
            minPhotos,
        });
    }
```

Then persist `onsiteAuditId`. Replace the `carFormData` construction at `:813-820` with:

```javascript
    const baseFormData = (audit.application && typeof audit.application.formData === 'object' && audit.application.formData)
        ? audit.application.formData
        : {};
    // Pin the decided AuditChecklist row so the in-tx auto-mint verifies THE
    // SAME row rather than re-resolving (prevents a newer row diverging).
    const carFormData = carDueAt
        ? {
            ...baseFormData,
            workflowState: targetState,
            carDueAt: carDueAt.toISOString(),
            car_due_at: carDueAt.toISOString(),
            onsiteAuditId: auditId,
        }
        : null;
    const passFormData = (decision === DECISIONS.PASS)
        ? { ...baseFormData, onsiteAuditId: auditId }
        : null;
```

And replace the `additionalData` block inside `writeApplicationStatus(...)` at `:867-874` so the formData carries the pin on both PASS and FAIL:

```javascript
                additionalData: {
                    auditResult: decision,
                    auditNotes: summary,
                    ...(carFormData
                        ? { formData: carFormData }
                        : (passFormData ? { formData: passFormData } : {})),
                },
```

> Note: on PASS, `passFormData` has no `workflowState` key; the writer stamps `workflowState: 'AUDIT_PASSED'` itself (application-status-writer.js:766-775, the merge branch) — verified. On FAIL, `carFormData.workflowState === 'CAR_PENDING'` equals the canonical next state, so the writer leaves it (`:763-764`).

- [ ] **Step 4: Implement the read in `generateCertificate`** — in `certificate-service.js`, change the gate call at `:300`:

```javascript
        await assertOnsiteEvidenceSufficient({
            prisma: client,
            applicationId,
            auditId: app.formData?.onsiteAuditId,
        });
```

(`app` is already fetched at `:234` with all scalar columns incl. `formData`.)

> **Verify in-tx propagation (reviewer must confirm):** the auto-mint fires INSIDE `submitDecision`'s transaction, triggered by `writeApplicationStatus(tx)` which writes `formData.onsiteAuditId`. Confirm `generateCertificate`'s app fetch (`:234`) runs on the tx client AFTER that write, so it sees the just-pinned `onsiteAuditId`. If the auto-mint passes a PRE-write app snapshot, the pin is inert and the gate silently falls back to re-resolve — still correct for the single-audit case, but it defeats the temporal-divergence protection this task exists for. The e2e (Task 12) asserts `reread.formData.onsiteAuditId` is persisted, but because it has ONE audit it does NOT distinguish pin-reached from resolve-fell-back; add a focused check (or a log) if the fetch path is ambiguous.

- [ ] **Step 5: Add the certificate-service forwarding test** — in `certificate-service-evidence-gate.test.js`, add a case seeding `app.formData = { onsiteAuditId: 'pinned-1' }` and asserting the mocked `assertOnsiteEvidenceSufficient` received `expect.objectContaining({ auditId: 'pinned-1' })`. (Model it on the existing gate-call assertion already in that file.)

- [ ] **Step 6: Run both suites**

Run: `cd apps/backend && npx jest __tests__/services/audit-onsite-service.test.js __tests__/unit/certificate-service-evidence-gate.test.js`
Expected: PASS (new pinning tests + all pre-existing cases; the legacy no-pin cases pass `auditId: undefined` → resolver path unchanged).

- [ ] **Step 7: Commit**

```bash
git add apps/backend/services/audit-onsite-service.js apps/backend/services/certificate-service.js apps/backend/__tests__/services/audit-onsite-service.test.js apps/backend/__tests__/unit/certificate-service-evidence-gate.test.js
git commit -m "feat(audit): pin decided auditId through decision->mint (freezes the verified row)"
```

---

### Task 4: `/context` by applicationId (explicit route) + real savedAnswers photoIds

Fixes **B2 (read side)** + **B5's key** + **B10's fabricated `photoIds` scalar**. Add an explicit `GET /audit/onsite/application/:applicationId/context` (do NOT overload `:auditId`) that resolves via the resolver, returns the real `audit.id`, and reads savedAnswers whose `photoIds` come from the real `FarmAuditPhoto.checklistItemId` join (the pre-fix code read a non-existent scalar).

**Files:**
- Modify: `apps/backend/routes/api/audit/onsite.js` (extract a `loadSavedAnswers` helper from the block at `:188-204`; refactor the existing `/:auditId/context` savedAnswers to use it; add the new route after `:252`)
- Modify: `apps/backend/__tests__/unit/audit-onsite-routes.test.js` (add `farmAuditPhoto` to the prisma mock at `:81-87`; replace the fabricated `photoIds` scalar at `:212`; add new-route tests)

**Interfaces:**
- Consumes: `resolveCurrentOnsiteAuditId(prisma, applicationId, { organizationId })` (Task 2).
- Produces (response `data`, both `/context` routes): `{ audit: { id, applicationId, applicationNumber, applicantName, farmAddress, farmLat?, farmLng?, scope? }, checklist: Array<{ itemId, title, description, category?, required? }>, startedAt?, savedAnswers: Array<{ itemId, response: 'PASS'|'FAIL'|'NA', notes: string|null, photoIds: string[] }> }`. **`data.audit.id` is the resolved `AuditChecklist.id`** — consumed by Task 5.
- Produces: `async function loadSavedAnswers(prisma, auditId) → Promise<Array<{itemId,response,notes,photoIds}>>`.

- [ ] **Step 1: Write the failing test** — in `audit-onsite-routes.test.js`, first add a photo model to the prisma mock. Extend the mock block at `:70-87`:

```javascript
const mockPhotos = new Map(); // auditId -> FarmAuditPhoto[]
const mockFarmAuditPhoto = {
    findMany: jest.fn(async ({ where }) => mockPhotos.get(where.auditId) || []),
};
```
and add `farmAuditPhoto: mockFarmAuditPhoto,` to the `prisma` object in the `jest.mock('../../services/prisma-database', ...)` call, and `mockPhotos.clear();` to `beforeEach`.

Then FIX the B10 false positive: in the `aud-ctx-1` fixture at `:206-215`, remove `photoIds: ['photo-1'],` from the checklist-item row and instead register the real photo linkage:

```javascript
        mockPhotos.set('aud-ctx-1', [{ id: 'photo-1', checklistItemId: 'item-row-1' }]);
```

Add the new-route test:

```javascript
describe('onsite — GET /application/:applicationId/context (explicit applicationId route)', () => {
    test('resolves the current audit by applicationId and returns the real audit.id', async () => {
        mockAudits.set('aud-appctx-1', {
            id: 'aud-appctx-1', applicationId: 'app-777', auditorId: 'user-1', status: 'IN_PROGRESS',
            createdAt: new Date('2026-08-17T03:00:00.000Z'),
            application: { id: 'app-777', applicationNumber: 'GACP-2026-00777', formData: {} },
        });
        // resolver findFirst is keyed by applicationId — teach the mock to answer it.
        mockAuditChecklist.findFirst.mockImplementation(async ({ where }) => {
            if (where.applicationId) {
                return [...mockAudits.values()].find((a) => a.applicationId === where.applicationId && !a.isDeleted) || null;
            }
            return mockAudits.get(where.id) || null;
        });

        const res = await request(buildApp())
            .get('/api/audit/onsite/application/app-777/context')
            .set('x-test-role', 'auditor').set('x-test-user-id', 'user-1');

        expect(res.status).toBe(200);
        expect(res.body.data.audit.id).toBe('aud-appctx-1');
        expect(res.body.data.audit.applicationId).toBe('app-777');
    });

    test('savedAnswers photoIds come from the FarmAuditPhoto join, not a scalar', async () => {
        // Uses the aud-ctx-1 fixture + mockPhotos wiring from the shape test above.
        // (resolve by applicationId to the same audit id)
        // ...assert res.body.data.savedAnswers[0].photoIds === ['photo-1']
    });
});
```

Also update the existing shape assertion at `:250-257` to reflect that `savedAnswers[0].photoIds` now derives from the join (`['photo-1']`) — same expected value, real source.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/backend && npx jest __tests__/unit/audit-onsite-routes.test.js`
Expected: FAIL — `GET /application/app-777/context` returns 404 (route not defined); the join-based photoIds assertion fails (handler still reads `row.photoIds`).

- [ ] **Step 3: Extract `loadSavedAnswers`** — in `onsite.js`, add near `_composeApplicantName` (after `:96`):

```javascript
/**
 * Load an audit's saved checklist answers for resume. photoIds are derived
 * from the real FarmAuditPhoto.checklistItemId linkage — FarmAuditChecklistItem
 * has NO photoIds column (the pre-fix code read a non-existent scalar, which is
 * exactly what let B5 ship invisibly; see spec B10).
 */
async function loadSavedAnswers(prisma, auditId) {
    if (!prisma?.farmAuditChecklistItem || typeof prisma.farmAuditChecklistItem.findMany !== 'function') {
        return [];
    }
    let rows = [];
    try {
        rows = await prisma.farmAuditChecklistItem.findMany({
            where: { auditId },
            orderBy: { recordedAt: 'asc' },
        });
    } catch (err) {
        logger.warn(`[onsite] loadSavedAnswers: item lookup failed for ${auditId}: ${err?.message}`);
        return [];
    }
    const photosByItem = new Map();
    if (prisma.farmAuditPhoto && typeof prisma.farmAuditPhoto.findMany === 'function') {
        try {
            const photos = await prisma.farmAuditPhoto.findMany({
                where: { auditId },
                select: { id: true, checklistItemId: true },
            });
            for (const p of photos) {
                if (!p.checklistItemId) { continue; }
                const list = photosByItem.get(p.checklistItemId) || [];
                list.push(p.id);
                photosByItem.set(p.checklistItemId, list);
            }
        } catch (err) {
            logger.warn(`[onsite] loadSavedAnswers: photo lookup failed for ${auditId}: ${err?.message}`);
        }
    }
    return (Array.isArray(rows) ? rows : []).map((row) => ({
        itemId: row.itemCode,
        response: row.response,
        notes: row.notes || null,
        photoIds: photosByItem.get(row.id) || [],
    }));
}
```

Refactor the existing `/:auditId/context` handler: replace its savedAnswers block at `:188-204` with:

```javascript
        const savedAnswers = await loadSavedAnswers(prisma, auditId);
```

- [ ] **Step 4: Add the new applicationId route** — in `onsite.js`, after the existing `/:auditId/context` handler closes (`:252`), add:

```javascript
/**
 * GET /api/audit/onsite/application/:applicationId/context
 *
 * Explicit applicationId entry-point for the inspect page (the route param
 * [id] is the applicationId, NOT an auditId — do NOT overload /:auditId).
 * Resolves the current AuditChecklist via the shared resolver and returns
 * the SAME shape as /:auditId/context, including the real audit.id the FE
 * uses for every subsequent write (spec Task 4/5).
 */
router.get('/application/:applicationId/context', async (req, res) => {
    try {
        const { applicationId } = req.params;
        const prisma = _resolvePrisma();
        if (!prisma || !prisma.auditChecklist || typeof prisma.auditChecklist.findFirst !== 'function') {
            logger.warn(`[onsite] /application/:id/context: prisma unavailable for app ${applicationId}`);
            return res.status(503).json({ success: false, error: 'Database unavailable', code: 'PRISMA_UNAVAILABLE' });
        }

        // org is a defense-in-depth filter only; authz is auditorId-match below.
        const orgId = req.user?.organizationId || req.tenantContext?.organizationId || null;
        const auditId = await resolveCurrentOnsiteAuditId(prisma, applicationId, orgId ? { organizationId: orgId } : {});
        if (!auditId) {
            return res.status(404).json({ success: false, error: 'Audit not found', code: 'AUDIT_NOT_FOUND' });
        }

        const audit = await prisma.auditChecklist.findFirst({
            where: { id: auditId },
            include: { application: { select: { id: true, applicationNumber: true, formData: true } } },
        });
        if (!audit) {
            return res.status(404).json({ success: false, error: 'Audit not found', code: 'AUDIT_NOT_FOUND' });
        }

        const callerCanonical = normalizeRole(req.user?.canonicalRole || req.user?.role);
        const isAdmin = callerCanonical === CANONICAL_ROLES.ADMIN;
        const isAuditor = callerCanonical === CANONICAL_ROLES.AUDITOR;
        if (isAuditor && audit.auditorId && audit.auditorId !== req.user.id && !isAdmin) {
            return res.status(403).json({ success: false, error: 'Audit is assigned to a different auditor', code: 'AUDIT_AUDITOR_MISMATCH' });
        }

        const formData = (audit.application && audit.application.formData && typeof audit.application.formData === 'object')
            ? audit.application.formData : {};
        const locationData = (formData.locationData && typeof formData.locationData === 'object')
            ? formData.locationData
            : (formData.location && typeof formData.location === 'object' ? formData.location : {});
        const farmAddress = typeof locationData.farmAddress === 'string'
            ? locationData.farmAddress
            : (typeof locationData.address === 'string' ? locationData.address : '');
        const farmLat = typeof locationData.latitude === 'number' ? locationData.latitude : undefined;
        const farmLng = typeof locationData.longitude === 'number' ? locationData.longitude : undefined;

        const checklist = onsiteService.CHECKLIST_TEMPLATE_2026.map((item) => ({
            itemId: item.itemCode,
            title: item.prompt,
            description: item.prompt,
            category: item.section,
            required: item.isCritical === true,
        }));
        const startedAt = audit.createdAt instanceof Date ? audit.createdAt.toISOString() : (audit.createdAt || null);
        const savedAnswers = await loadSavedAnswers(prisma, auditId);

        return res.json({
            success: true,
            data: {
                audit: {
                    id: audit.id,
                    applicationId: audit.applicationId,
                    applicationNumber: audit.application?.applicationNumber || '-',
                    applicantName: (isAdmin || isAuditor) ? _composeApplicantName(formData) : null,
                    farmAddress: farmAddress || '',
                    farmLat,
                    farmLng,
                    scope: typeof formData.scope === 'string' ? formData.scope : undefined,
                },
                checklist,
                startedAt,
                savedAnswers,
            },
        });
    } catch (err) {
        logger.warn(`[onsite] /application/:id/context failed: ${err?.message}`);
        return res.status(500).json({ success: false, error: safeErrorMessage(err), code: err.code || 'ONSITE_CONTEXT_FAILED' });
    }
});
```

Add the resolver require near the top of `onsite.js` (after the existing service requires at `:36`):

```javascript
const { resolveCurrentOnsiteAuditId } = require('../../../services/onsite-audit-resolver');
```

- [ ] **Step 5: Run it to verify it passes**

Run: `cd apps/backend && npx jest __tests__/unit/audit-onsite-routes.test.js`
Expected: PASS (new applicationId route + join-based photoIds + all pre-existing RBAC/PDPA/shape/404 cases).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/routes/api/audit/onsite.js apps/backend/__tests__/unit/audit-onsite-routes.test.js
git commit -m "feat(audit): explicit /application/:id/context + real savedAnswers photoIds join (fixes B2 read, B5 key, B10 scalar)"
```

---

### Task 5: FE inspect uses `ctx.audit.id` for all writes

Fixes **B2 (write side)**. The route `[id]` is the applicationId; it flows ONLY into the context fetch. Every write (start/checklist/photo/decision/gps-verify) uses the resolved `ctx.audit.id`.

**Files:**
- Modify: `apps/web-app/src/lib/services/audit-service.ts` (`getOnsiteContext` path at `:354`)
- Modify: `apps/web-app/src/app/provider/audits/[id]/inspect/client-view.tsx` (prop `:78`; context fetch `:104`; every `auditId`-keyed write; effect dep `:137,164`)
- Modify: `apps/web-app/src/app/provider/audits/[id]/inspect/page.tsx` (`:31`)
- Modify: `apps/web-app/playwright/auditor-flow.spec.ts` (`:267`) + `apps/web-app/playwright/fixtures/dtam-fixtures.ts` (`:805`) — update the mocked `/context` route regex to the new path

**Interfaces:**
- Consumes: `getOnsiteContext` response `data.audit.id: string` (Task 4).
- Produces: `AuditService.getOnsiteContext(applicationId: string)` now GETs `/audit/onsite/application/:applicationId/context`. `InspectClient` prop is `{ applicationId: string }`. All subsequent `AuditService.*` write calls receive `context.audit.id`.

- [ ] **Step 1: Repoint `getOnsiteContext`** — in `audit-service.ts`, change the signature comment + call at `:329-355` so the param is `applicationId` and the path is the new route:

```typescript
    getOnsiteContext: async (
        applicationId: string,
    ): Promise<
        ApiResponse<{
            audit: { id: string; applicationId: string; applicationNumber: string; applicantName: string; farmAddress: string; farmLat?: number; farmLng?: number; scope?: string; };
            checklist: Array<{ itemId: string; title: string; description: string; category?: string; required?: boolean; }>;
            startedAt?: string;
            savedAnswers?: Array<{ itemId: string; response: 'PASS' | 'FAIL' | 'NA'; notes?: string | null; photoIds?: string[] }>;
        }>
    > => {
        return apiClient.get(`/audit/onsite/application/${encodeURIComponent(applicationId)}/context`);
    },
```

> The `savedAnswers` element type changes from `{ itemId, answer, ..., photoUrls? }` to the BE shape `{ itemId, response, notes?, photoIds? }`. Task 7 maps `response → answer` at this boundary; leaving the raw BE shape here is temporary until Task 7 — but do the type change now so the compiler flags the client-view read (fixed in Task 7).

- [ ] **Step 2: Write the failing FE test** — the wire assertion lives in Task 12, but add a focused source-guard now so the id-source change is pinned. Create `apps/web-app/src/app/provider/audits/[id]/inspect/__tests__/inspect-id-source.test.tsx`:

```typescript
import { describe, expect, it } from '@jest/globals';
const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');

const CLIENT = fs.readFileSync(path.resolve(__dirname, '..', 'client-view.tsx'), 'utf8');
const PAGE = fs.readFileSync(path.resolve(__dirname, '..', 'page.tsx'), 'utf8');

describe('inspect uses ctx.audit.id for writes, applicationId for context', () => {
    it('page passes applicationId (not auditId)', () => {
        expect(PAGE).toContain('applicationId={id}');
    });
    it('client resolves auditId from context, not the route prop', () => {
        expect(CLIENT).toMatch(/const\s+auditId\s*=\s*context[?.]+audit[?.]+id/);
        // the route prop is applicationId, only used for the context fetch
        expect(CLIENT).toContain('getOnsiteContext(applicationId)');
    });
});
```

Run: `cd apps/web-app && npx jest inspect-id-source` → Expected: FAIL (prop still `auditId`).

- [ ] **Step 3: Rewire `page.tsx`** — change `:31`:

```tsx
            <InspectClient applicationId={id} />
```

- [ ] **Step 4: Rewire `client-view.tsx`** — change the prop + derive the resolved id. Replace the component signature at `:78`:

```tsx
export default function InspectClient({ applicationId }: { applicationId: string }) {
```

Immediately after the state declarations (before the `useEffect` at `:101`), add:

```tsx
    // The route [id] is the applicationId; the real onsite AuditChecklist.id
    // is resolved server-side and returned as context.audit.id. Every write
    // (start/checklist/photo/decision/gps-verify) keys off THIS id.
    const auditId = context?.audit.id ?? null;
```

Change the context fetch at `:104`: `const res = await AuditService.getOnsiteContext(applicationId);`
Change the initial-load effect dep at `:137` from `[auditId]` to `[applicationId]`.
The auto-save effect at `:144-164`: keep `auditId` in the body but guard it — replace `for (const id of toFlush)` loop's `AuditService.submitChecklistItem(auditId, ...)` so it early-returns when `!auditId`, and change its dep array at `:164` from `[stage, auditId]` to `[stage, auditId]` (unchanged — `auditId` is now the resolved value and a valid dep). Inside the interval callback, add at the top: `if (!auditId) return;`.
Every other write already references `auditId` (`startInspection`, `uploadPhoto`, `submitDecision`) — they now use the resolved value. Add `if (!auditId) return;` guards at the top of `handleStart`, `handleStartWithFarmCoords`, `tryUploadOne`, and `submitDecision` so they no-op until context loads (context always loads before these are reachable via the stage machine, so this is defensive).

- [ ] **Step 5: Run it to verify it passes**

Run: `cd apps/web-app && npx jest inspect-id-source && npx jest apps/web-app/src/app/provider/audits`
Expected: the id-source guard PASSES; the pre-existing inspect a11y/tap-target tests still PASS (they render the loading shell with `applicationId="aud-1"` — update those two files' `<InspectClient auditId=...>` render calls to `applicationId=...` if present).

- [ ] **Step 6: Align the playwright mocks** — in `auditor-flow.spec.ts:267` and `fixtures/dtam-fixtures.ts:805`, change the route regex from `/api/audit/onsite/${AUDIT_ID}/context$` to `/api/audit/onsite/application/${APPLICATION_ID}/context$` (use the applicationId the spec already navigates `[id]` with). This is mock-path alignment; no assertion logic changes.

- [ ] **Step 7: Commit**

```bash
git add apps/web-app/src/lib/services/audit-service.ts apps/web-app/src/app/provider/audits/[id]/inspect/ apps/web-app/playwright/auditor-flow.spec.ts apps/web-app/playwright/fixtures/dtam-fixtures.ts
git commit -m "feat(inspect): resolve auditId from context.audit.id; route [id] is applicationId (fixes B2 write)"
```

---

### Task 6: Checklist write contract + vocab canonicalization

Fixes **B3** + **B4**. FE sends `{ items: [{ itemCode, response, notes?, photoIds? }] }`; the UI answer `YES/NO/NA` maps to `PASS/FAIL/NA` at the single canonicalization point in `audit-service.ts`.

**Files:**
- Modify: `apps/web-app/src/lib/services/audit-service.ts` (`submitChecklistItem` at `:247-255`; add the vocab map near the types at `:109-116`)
- Modify: `apps/web-app/src/app/provider/audits/[id]/inspect/client-view.tsx` (the auto-save call at `:153-158` — pass the UI item unchanged; the service now wraps + maps)

**Interfaces:**
- Consumes: `ChecklistItemPayload = { itemId: string; answer: 'YES'|'NO'|'NA'; notes?: string; photoIds?: string[] }` (existing FE type at `:111-116`).
- Produces: `AuditService.submitChecklistItem(auditId: string, item: ChecklistItemPayload)` POSTs body `{ items: [{ itemCode: item.itemId, response: MAP[item.answer], notes?: item.notes, photoIds?: item.photoIds }] }` to `/audit/onsite/:auditId/checklist`, where `MAP = { YES:'PASS', NO:'FAIL', NA:'NA' }`. This body exactly matches the BE handler's `req.body.items` destructuring (`onsite.js:337-360`).

- [ ] **Step 1: Write the failing test** — extend the Task 12 wire test target early with a focused unit test. Create `apps/web-app/src/lib/services/__tests__/audit-service.checklist.test.ts`:

```typescript
import { describe, expect, it, jest, beforeEach } from '@jest/globals';

const post = jest.fn(async () => ({ success: true, data: [] }));
const get = jest.fn(async () => ({ success: true, data: {} }));
jest.mock('@/lib/api/api-client', () => ({ apiClient: { post: (...a: unknown[]) => post(...a), get: (...a: unknown[]) => get(...a) } }));

import { AuditService } from '../audit-service';

beforeEach(() => { post.mockClear(); });

describe('submitChecklistItem wire contract', () => {
    it('wraps in {items:[...]} and maps YES->PASS, itemId->itemCode', async () => {
        await AuditService.submitChecklistItem('aud-9', { itemId: '4.1', answer: 'YES', notes: 'ok', photoIds: ['p1'] });
        expect(post).toHaveBeenCalledWith('/audit/onsite/aud-9/checklist', {
            items: [{ itemCode: '4.1', response: 'PASS', notes: 'ok', photoIds: ['p1'] }],
        });
    });
    it('maps NO->FAIL and NA->NA, omits empty notes', async () => {
        await AuditService.submitChecklistItem('aud-9', { itemId: '1.1', answer: 'NO' });
        expect(post.mock.calls[0][1]).toEqual({ items: [{ itemCode: '1.1', response: 'FAIL' }] });
        post.mockClear();
        await AuditService.submitChecklistItem('aud-9', { itemId: '2.1', answer: 'NA' });
        expect(post.mock.calls[0][1]).toEqual({ items: [{ itemCode: '2.1', response: 'NA' }] });
    });
});
```

Run: `cd apps/web-app && npx jest audit-service.checklist` → Expected: FAIL (current `submitChecklistItem` POSTs the raw `{itemId, answer, ...}`).

- [ ] **Step 2: Implement the map + wrap** — in `audit-service.ts`, add the map after the `ChecklistAnswer` type (`:109`):

```typescript
/** Single canonicalization point: UI answer -> BE checklist response vocab. */
const ANSWER_TO_RESPONSE: Record<ChecklistAnswer, 'PASS' | 'FAIL' | 'NA'> = {
    YES: 'PASS',
    NO: 'FAIL',
    NA: 'NA',
};
export const responseToAnswer: Record<'PASS' | 'FAIL' | 'NA', ChecklistAnswer> = {
    PASS: 'YES',
    FAIL: 'NO',
    NA: 'NA',
};
```

Replace `submitChecklistItem` at `:247-255`:

```typescript
    submitChecklistItem: async (
        auditId: string,
        item: ChecklistItemPayload,
    ): Promise<ApiResponse<{ ok: true }>> => {
        const entry: { itemCode: string; response: 'PASS' | 'FAIL' | 'NA'; notes?: string; photoIds?: string[] } = {
            itemCode: item.itemId,
            response: ANSWER_TO_RESPONSE[item.answer],
        };
        if (item.notes) entry.notes = item.notes;
        if (item.photoIds && item.photoIds.length > 0) entry.photoIds = item.photoIds;
        return apiClient.post<{ ok: true }>(
            `/audit/onsite/${encodeURIComponent(auditId)}/checklist`,
            { items: [entry] },
        );
    },
```

- [ ] **Step 3: Confirm the client-view caller is unchanged in shape** — the auto-save at `client-view.tsx:153-158` already passes `{ itemId: id, answer: v.answer, ...(notes), photoIds }` (a `ChecklistItemPayload`). No change needed beyond the Task 5 `if (!auditId) return;` guard already added. Verify it still type-checks against the (unchanged) `ChecklistItemPayload` signature.

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/web-app && npx jest audit-service.checklist`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web-app/src/lib/services/audit-service.ts apps/web-app/src/lib/services/__tests__/audit-service.checklist.test.ts
git commit -m "feat(inspect): checklist body {items:[{itemCode,response}]} + YES/NO/NA->PASS/FAIL/NA at FE boundary (fixes B3,B4)"
```

---

### Task 7: savedAnswers read contract

Fixes **B5 (read side)**. The FE reads `response`/`photoIds` (not `answer`/`photoUrls`) and maps `response → answer` at the same boundary.

**Files:**
- Modify: `apps/web-app/src/lib/services/audit-service.ts` (`getOnsiteContext` — map `savedAnswers` `response→answer` before returning)
- Modify: `apps/web-app/src/app/provider/audits/[id]/inspect/client-view.tsx` (the `OnsiteContext` interface `:54-59`; the seeding loop `:112-122`)

**Interfaces:**
- Consumes: BE savedAnswers `{ itemId, response: 'PASS'|'FAIL'|'NA', notes: string|null, photoIds: string[] }` (Task 4).
- Produces: `getOnsiteContext` returns `savedAnswers?: Array<{ itemId: string; answer: 'YES'|'NO'|'NA'; notes?: string | null; photoIds?: string[] }>` (UI vocab). `client-view` seeds `values[itemId] = { answer, notes, photos: photoIds.map(id => ({ id, name })) }`.

- [ ] **Step 1: Write the failing test** — add to `audit-service.checklist.test.ts` (or a sibling) a getOnsiteContext round-trip:

```typescript
describe('getOnsiteContext savedAnswers read contract', () => {
    it('maps BE response->UI answer and preserves photoIds', async () => {
        get.mockResolvedValueOnce({ success: true, data: {
            audit: { id: 'aud-9', applicationId: 'app-9', applicationNumber: 'A-9', applicantName: 'x', farmAddress: '' },
            checklist: [], startedAt: undefined,
            savedAnswers: [{ itemId: '4.1', response: 'PASS', notes: 'n', photoIds: ['p1'] }],
        }});
        const res = await AuditService.getOnsiteContext('app-9');
        expect(res.data!.savedAnswers).toEqual([{ itemId: '4.1', answer: 'YES', notes: 'n', photoIds: ['p1'] }]);
    });
});
```

Run: `cd apps/web-app && npx jest audit-service.checklist -t "read contract"` → Expected: FAIL (raw BE `response` passthrough).

- [ ] **Step 2: Map savedAnswers in `getOnsiteContext`** — change the return so the type is UI-vocab and the mapping runs. Replace the `return apiClient.get(...)` in `getOnsiteContext` (from Task 5) with:

```typescript
        const res = await apiClient.get<{
            audit: { id: string; applicationId: string; applicationNumber: string; applicantName: string; farmAddress: string; farmLat?: number; farmLng?: number; scope?: string; };
            checklist: Array<{ itemId: string; title: string; description: string; category?: string; required?: boolean; }>;
            startedAt?: string;
            savedAnswers?: Array<{ itemId: string; response: 'PASS' | 'FAIL' | 'NA'; notes?: string | null; photoIds?: string[] }>;
        }>(`/audit/onsite/application/${encodeURIComponent(applicationId)}/context`);
        if (res.success && res.data?.savedAnswers) {
            const mapped = res.data.savedAnswers.map((s) => ({
                itemId: s.itemId,
                answer: responseToAnswer[s.response],
                notes: s.notes ?? undefined,
                photoIds: s.photoIds ?? [],
            }));
            return { ...res, data: { ...res.data, savedAnswers: mapped } } as ApiResponse<typeof res.data & { savedAnswers: typeof mapped }>;
        }
        return res as ApiResponse<any>;
```

Update the declared return type of `getOnsiteContext` so `savedAnswers` elements are `{ itemId: string; answer: ChecklistAnswer; notes?: string; photoIds?: string[] }`.

- [ ] **Step 3: Update `client-view.tsx` read** — change the `OnsiteContext.savedAnswers` interface at `:54-59`:

```tsx
    savedAnswers?: Array<{
        itemId: string;
        answer: ChecklistAnswer;
        notes?: string;
        photoIds?: string[];
    }>;
```

Replace the seeding loop at `:112-122`:

```tsx
                for (const saved of res.data.savedAnswers || []) {
                    seeded[saved.itemId] = {
                        answer: saved.answer,
                        notes: saved.notes || '',
                        photos: (saved.photoIds || []).map((id, i) => ({
                            id,
                            name: `photo-${i + 1}.jpg`,
                        })),
                    };
                }
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/web-app && npx jest audit-service.checklist`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web-app/src/lib/services/audit-service.ts apps/web-app/src/app/provider/audits/[id]/inspect/client-view.tsx
git commit -m "feat(inspect): read savedAnswers response/photoIds, map response->answer (fixes B5)"
```

---

### Task 8: `/start` GPS contract + `Number.isFinite` guard

Fixes **B6**. BE accepts the FE's nested `{ gps: { latitude, longitude, accuracy, capturedAt } }`; the service guard uses `Number.isFinite` so `NaN` fails loud, not silent.

**Files:**
- Modify: `apps/backend/routes/api/audit/onsite.js` (`/start` handler `:301-330`)
- Modify: `apps/backend/services/audit-onsite-service.js` (`startInspection` guard `:446-448`)
- Test: `apps/backend/__tests__/unit/audit-onsite-wire-contract.test.js` (created in Task 12) covers `/start`; add the service-guard unit case to `apps/backend/__tests__/services/audit-onsite-service.test.js` now

**Interfaces:**
- Consumes: FE `/start` body `{ gps: { latitude: number, longitude: number, accuracy?: number, capturedAt?: string } }` (from `audit-service.startInspection` at `:233-241`).
- Produces: the route calls `onsiteService.startInspection({ auditId, auditorId, gpsLat: Number(gps.latitude), gpsLng: Number(gps.longitude), gpsAccuracy })`. `startInspection` rejects non-finite GPS with a `TypeError` (`Number.isFinite`), so a bad shape 400s instead of writing `NaN` into `GpsVerificationLog`.

- [ ] **Step 1: Write the failing service-guard test** — in `audit-onsite-service.test.js`:

```javascript
    test('startInspection rejects NaN GPS (Number.isFinite, not typeof)', async () => {
        await expect(auditOnsiteService.startInspection({
            auditId: 'aud-1', auditorId: 'auditor-1', gpsLat: Number(undefined), gpsLng: 100.5,
            prisma: { auditChecklist: { findFirst: async () => ({ id: 'aud-1', status: 'IN_PROGRESS', auditorId: 'auditor-1' }) } },
        })).rejects.toThrow(/gpsLat \+ gpsLng/);
    });
```

Run: `cd apps/backend && npx jest __tests__/services/audit-onsite-service.test.js -t "Number.isFinite"` → Expected: FAIL (`typeof NaN === 'number'` passes the old guard, then throws later or writes NaN).

- [ ] **Step 2: Fix the service guard** — in `audit-onsite-service.js`, replace `startInspection`'s guard at `:446-448`:

```javascript
    if (!Number.isFinite(gpsLat) || !Number.isFinite(gpsLng)) {
        throw new TypeError('startInspection: gpsLat + gpsLng (finite numbers) required');
    }
```

- [ ] **Step 3: Fix the route to read the nested gps shape** — in `onsite.js`, replace the `/start` handler body at `:302-312`:

```javascript
        const { auditId } = req.params;
        const gps = (req.body && typeof req.body.gps === 'object' && req.body.gps) ? req.body.gps : {};
        const gpsAccuracyRaw = gps.accuracy;

        const out = await onsiteService.startInspection({
            auditId,
            auditorId: req.user.id,
            gpsLat: Number(gps.latitude),
            gpsLng: Number(gps.longitude),
            gpsAccuracy: gpsAccuracyRaw !== undefined && gpsAccuracyRaw !== null ? Number(gpsAccuracyRaw) : null,
        });
```

Update the `@swagger` requestBody for `/start` (the doc block at `:273-288`) to the `{ gps: { latitude, longitude, accuracy? } }` shape so the API doc matches (documentation edit, same task).

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/backend && npx jest __tests__/services/audit-onsite-service.test.js -t "Number.isFinite"`
Expected: PASS. (The `/start` route body is proven end-to-end in Task 12's wire test.)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/routes/api/audit/onsite.js apps/backend/services/audit-onsite-service.js apps/backend/__tests__/services/audit-onsite-service.test.js
git commit -m "fix(audit): /start accepts nested gps shape + Number.isFinite guard (fixes B6)"
```

---

### Task 9: `/photo` GPS contract + viewable response + itemId linkage

Fixes **B7**. Same nested GPS + `Number.isFinite` guard; the BE returns a viewable `url` so captured photos render; the `itemId` is forwarded so `checklistItemId` links when the item row already exists.

**Files:**
- Modify: `apps/backend/routes/api/audit/onsite.js` (`/photo` handler `:387-429`)
- Modify: `apps/backend/services/audit-onsite-service.js` (`uploadPhoto` guard `:623-625`; return `:676-681`; add optional `checklistItemCode` best-effort link)
- Test: covered by Task 12 wire test; add a `uploadPhoto` unit case here for the guard + url + link

**Interfaces:**
- Consumes: FE `/photo` multipart body `photo` (file), `gps` (JSON string of `{latitude,longitude,accuracy,capturedAt}`), `itemId` (the checklist itemCode), `caption?` (from `audit-service.uploadPhoto` at `:261-275`).
- Produces: `uploadPhoto({ ..., gpsLat, gpsLng, checklistItemCode })` returns `{ photoId, fileHash, attachmentId, url, photo }` where `url = attachment.fileUrl`. The route responds `{ success: true, data: { photoId, url, fileHash } }`, matching the FE's `{ photoId, url }` expectation (`client-view.tsx:318-322`). `checklistItemCode`, when it maps to an existing `FarmAuditChecklistItem` for `(auditId, itemCode)`, sets that photo's `checklistItemId`.

- [ ] **Step 1: Write the failing unit test** — in `audit-onsite-service.test.js`:

```javascript
    test('uploadPhoto returns a viewable url and rejects NaN GPS', async () => {
        const attach = { id: 'att-1', fileUrl: '/uploads/audits/aud-1/x.jpg' };
        const prisma = {
            auditChecklist: { findFirst: async () => ({ id: 'aud-1', auditorId: 'auditor-1' }) },
            farmAuditPhoto: { create: async ({ data }) => ({ id: 'photo-1', ...data }) },
        };
        const attachmentService = { attach: async () => attach };

        const out = await auditOnsiteService.uploadPhoto({
            auditId: 'aud-1', fileBuffer: Buffer.from('x'), fileName: 'x.jpg',
            gpsLat: 13.75, gpsLng: 100.5, uploadedBy: 'auditor-1', organizationId: 'org-1',
            prisma, attachmentService,
        });
        expect(out.url).toBe('/uploads/audits/aud-1/x.jpg');
        expect(out.photoId).toBe('photo-1');

        await expect(auditOnsiteService.uploadPhoto({
            auditId: 'aud-1', fileBuffer: Buffer.from('x'), fileName: 'x.jpg',
            gpsLat: Number('nope'), gpsLng: 100.5, uploadedBy: 'auditor-1', organizationId: 'org-1',
            prisma, attachmentService,
        })).rejects.toThrow(/gpsLat \+ gpsLng/);
    });
```

Run: `cd apps/backend && npx jest __tests__/services/audit-onsite-service.test.js -t "viewable url"` → Expected: FAIL (`out.url` undefined; NaN passes the old `typeof` guard).

- [ ] **Step 2: Fix `uploadPhoto`** — in `audit-onsite-service.js`, replace the guard at `:623-625`:

```javascript
    if (!Number.isFinite(gpsLat) || !Number.isFinite(gpsLng)) {
        throw new TypeError('uploadPhoto: gpsLat + gpsLng (finite numbers) required');
    }
```

Add `checklistItemCode = null` to the destructure at `:603-616` (alongside `caption = null`). After the `photo = await prisma.farmAuditPhoto.create({...})` at `:662-674`, add the best-effort link + change the return at `:676-681`:

```javascript
    // Best-effort link to the checklist item this photo was taken for, IF that
    // item row already exists. The primary/authoritative linkage remains
    // submitChecklistItem's updateMany(photoIds) — this just upgrades the case
    // where the checklist item was saved before the photo.
    if (checklistItemCode && typeof prisma.farmAuditChecklistItem?.findFirst === 'function') {
        try {
            const item = await prisma.farmAuditChecklistItem.findFirst({
                where: { auditId, itemCode: checklistItemCode },
                select: { id: true },
            });
            if (item) {
                await prisma.farmAuditPhoto.update({ where: { id: photo.id }, data: { checklistItemId: item.id } });
            }
        } catch (_e) { /* non-fatal — the checklist submit will link it */ }
    }

    return {
        photoId: photo.id,
        fileHash,
        attachmentId: attachment.id,
        url: attachment.fileUrl,
        photo,
    };
```

- [ ] **Step 3: Fix the `/photo` route** — in `onsite.js`, replace the handler body at `:389-420`:

```javascript
        const { auditId } = req.params;
        const rawGps = req.body?.gps;
        let gps = {};
        if (rawGps && typeof rawGps === 'object') { gps = rawGps; }
        else if (typeof rawGps === 'string') { try { gps = JSON.parse(rawGps) || {}; } catch (_e) { gps = {}; } }
        const { caption } = req.body || {};
        const itemId = req.body?.itemId || null;

        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ success: false, error: 'photo file required', code: 'PHOTO_FILE_REQUIRED' });
        }

        const out = await onsiteService.uploadPhoto({
            auditId,
            fileBuffer: req.file.buffer,
            fileName: req.file.originalname,
            mimeType: req.file.mimetype,
            gpsLat: Number(gps.latitude),
            gpsLng: Number(gps.longitude),
            capturedAt: gps.capturedAt || new Date(),
            caption: caption || null,
            checklistItemCode: itemId,
            uploadedBy: req.user.id,
            organizationId: req.user.organizationId,
        });

        res.json({
            success: true,
            data: {
                photoId: out.photoId,
                url: out.url,
                fileHash: out.fileHash,
            },
        });
```

Update the `/photo` handler doc comment at `:383-386` to the `gps` (JSON) + `itemId` multipart contract and the `{ photoId, url, fileHash }` response.

> Note: the FE `audit-service.uploadPhoto` already sends `gps` (JSON string) + `itemId` and already reads `res.data.url` (`:271-274`, `client-view.tsx:320`) — no FE change needed for this task.

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/backend && npx jest __tests__/services/audit-onsite-service.test.js -t "viewable url"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/routes/api/audit/onsite.js apps/backend/services/audit-onsite-service.js apps/backend/__tests__/services/audit-onsite-service.test.js
git commit -m "fix(audit): /photo nested gps + Number.isFinite + returns url + itemId link (fixes B7)"
```

---

### Task 10: Wire the gps-verify fraud check from the client

Fixes **B8**. After a successful start, the FE calls `gps-verify` and surfaces a warning when the auditor is not physically at the farm — running the previously-dead physical-presence check.

**Files:**
- Modify: `apps/web-app/src/lib/services/audit-service.ts` (add `verifyGps`)
- Modify: `apps/web-app/src/app/provider/audits/[id]/inspect/client-view.tsx` (`startWithFix` at `:204-217`)

**Interfaces:**
- Produces: `AuditService.verifyGps(auditId: string, lat: number, lng: number) → Promise<ApiResponse<{ withinTolerance: boolean; distanceMeters: number | null; farmLatitude: number | null; farmLongitude: number | null; toleranceMeters: number; unknownFarmLocation: boolean }>>`, GETting `/audit/onsite/:auditId/gps-verify?lat=&lng=` (matches `onsite.js:435-460`).
- Consumes: `auditId = context.audit.id` (Task 5), the GPS `fix` from `startWithFix`.

- [ ] **Step 1: Write the failing test** — in `audit-service.checklist.test.ts`:

```typescript
describe('verifyGps wire', () => {
    it('GETs gps-verify with lat/lng query params', async () => {
        get.mockResolvedValueOnce({ success: true, data: { withinTolerance: true } });
        await AuditService.verifyGps('aud-9', 13.75, 100.5);
        expect(get).toHaveBeenCalledWith('/audit/onsite/aud-9/gps-verify?lat=13.75&lng=100.5');
    });
});
```

Run: `cd apps/web-app && npx jest audit-service.checklist -t "verifyGps"` → Expected: FAIL (`verifyGps` undefined).

- [ ] **Step 2: Add `verifyGps`** — in `audit-service.ts`, inside the `AuditService` object (after `startInspection`):

```typescript
    /** Step 4.1b — physical-presence fraud check (haversine vs farm coords). */
    verifyGps: async (
        auditId: string,
        lat: number,
        lng: number,
    ): Promise<ApiResponse<{
        withinTolerance: boolean;
        distanceMeters: number | null;
        farmLatitude: number | null;
        farmLongitude: number | null;
        toleranceMeters: number;
        unknownFarmLocation: boolean;
    }>> => {
        const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });
        return apiClient.get(`/audit/onsite/${encodeURIComponent(auditId)}/gps-verify?${params.toString()}`);
    },
```

- [ ] **Step 3: Call it from `startWithFix`** — in `client-view.tsx`, inside `startWithFix` after the successful-start notification (`:216`, before `setStage('checklist')`), add:

```tsx
        if (auditId) {
            const verify = await AuditService.verifyGps(auditId, fix.latitude, fix.longitude);
            if (verify.success && verify.data && !verify.data.unknownFarmLocation && !verify.data.withinTolerance) {
                notifications.show({
                    title: 'เตือน: อยู่นอกรัศมีฟาร์ม',
                    message: `ห่างจากพิกัดฟาร์มประมาณ ${Math.round(verify.data.distanceMeters ?? 0)} ม. (อนุญาต ${verify.data.toleranceMeters} ม.)`,
                    color: 'orange',
                });
            }
        }
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/web-app && npx jest audit-service.checklist`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web-app/src/lib/services/audit-service.ts apps/web-app/src/app/provider/audits/[id]/inspect/client-view.tsx
git commit -m "feat(inspect): wire gps-verify physical-presence check after start (fixes B8)"
```

---

### Task 11: Replace the field-tools tab for ONSITE with the inspect entry

Fixes **B9**. The broken "เครื่องมือภาคสนาม" tab (no checklist UI, FK-violating photo path) is replaced by a single, discoverable link into the inspect flow — the one capture path.

**Files:**
- Modify: `apps/web-app/src/app/provider/audits/[id]/page.tsx` (the ONSITE `fieldtools` tab content at `:506-515`; the trigger label at `:432-436`)

**Interfaces:**
- Consumes: `application.id` (already in scope on the page). Navigates to `/provider/audits/${application.id}/inspect` (Task 5's `[id]` = applicationId).
- Produces: the ONSITE tab renders a single primary action into the inspect flow; the `AuditFieldToolsPanel` (with its FK-violating `uploadAuditPhoto({ auditId: applicationId })` at `audit-field-tools-panel.tsx:61`) is no longer rendered for ONSITE.

- [ ] **Step 1: Write the failing test** — create `apps/web-app/src/app/provider/audits/[id]/__tests__/onsite-inspect-entry.test.tsx`:

```typescript
import { describe, expect, it } from '@jest/globals';
const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');
const SRC = fs.readFileSync(path.resolve(__dirname, '..', 'page.tsx'), 'utf8');

describe('ONSITE tab is the inspect entry, not the broken field-tools panel', () => {
    it('links into the inspect flow', () => {
        expect(SRC).toContain('/inspect');
        expect(SRC).toMatch(/audits\/\$\{application\.id\}\/inspect/);
    });
    it('does not render AuditFieldToolsPanel in the ONSITE tab content', () => {
        // AuditFieldToolsPanel must no longer be instantiated (FK-violating photo path).
        expect(SRC).not.toContain('<AuditFieldToolsPanel');
    });
});
```

Run: `cd apps/web-app && npx jest onsite-inspect-entry` → Expected: FAIL (`<AuditFieldToolsPanel` still present; no `/inspect` link).

- [ ] **Step 2: Replace the tab content** — in `page.tsx`, replace the ONSITE `fieldtools` `NotebookTabsContent` block at `:506-515`:

```tsx
                {queueItem?.inspectionMode === 'ONSITE' && (
                    <NotebookTabsContent value="fieldtools">
                        <div className="rounded-lg bg-card p-6 shadow-sm">
                            <div className="mb-3 flex flex-wrap items-center gap-2">
                                <ThemeIcon color="primary"><IconMapPin size={16} aria-hidden="true" /></ThemeIcon>
                                <p className="font-bold">{dDict?.tabs?.fieldtools || 'ตรวจประเมินภาคสนาม'}</p>
                            </div>
                            <p className="mb-4 text-sm text-slate-600">
                                เปิดแอปภาคสนามเพื่อบันทึกพิกัด GPS ถ่ายภาพหลักฐาน ทำแบบตรวจ และตัดสินผล ณ สถานที่จริง
                            </p>
                            <Link
                                href={`/provider/audits/${application.id}/inspect`}
                                data-testid="onsite-inspect-entry"
                                className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-leaf-700 px-6 py-3 text-sm font-bold text-white hover:bg-leaf-800"
                            >
                                เริ่มตรวจประเมินภาคสนาม
                            </Link>
                        </div>
                    </NotebookTabsContent>
                )}
```

Add `import Link from 'next/link';` at the top of `page.tsx` if not already present. Remove the now-unused `import { AuditFieldToolsPanel } from './audit-field-tools-panel';` at `:40` (leave the `audit-field-tools-panel.tsx` file in place — it is not deleted, only unmounted from the ONSITE tab, per spec §7.4 "GPS-check-in kept only if re-wired"; a follow-up may re-wire it).

- [ ] **Step 3: Run it to verify it passes**

Run: `cd apps/web-app && npx jest onsite-inspect-entry`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web-app/src/app/provider/audits/[id]/page.tsx apps/web-app/src/app/provider/audits/[id]/__tests__/onsite-inspect-entry.test.tsx
git commit -m "feat(audit): ONSITE tab is the single inspect entry, drop the FK-violating field-tools panel (fixes B9)"
```

---

### Task 12: Real wire-contract tests + e2e closure

Fixes **B10** and proves the whole fix. supertest on the real Express onsite router asserting exact request/response bodies; a FE apiClient-level wire test; and a DATABASE_URL-gated e2e that drives a real PASS through `submitDecision` and asserts a `Certificate` row appears (the auto-mint fires in-tx).

**Files:**
- Create: `apps/backend/__tests__/unit/audit-onsite-wire-contract.test.js`
- Create: `apps/web-app/src/lib/services/__tests__/audit-service.wire.test.ts`
- Create: `apps/backend/__tests__/integration/onsite-decision-mint-e2e.test.js`

**Interfaces:**
- Consumes: the real router (`routes/api/audit/onsite.js`), the real `AuditService`, and (e2e) the real `audit-onsite-service.submitDecision` + `certificate-service.generateCertificate` chain against Postgres.

- [ ] **Step 1: Backend wire-contract test (supertest, real router)** — model the bootstrap on `audit-onsite-routes.test.js:22-127` (mock auth-middleware, prisma-database, logger, multer). Mock `../../services/audit-onsite-service` so each handler's args are captured, then assert the router destructured them correctly:

```javascript
'use strict';
const express = require('express');
const request = require('supertest');

jest.mock('../../middleware/auth-middleware', () => {
    const u = (req, _res, next) => { req.user = { id: req.headers['x-test-user-id'] || 'auditor-1', role: 'auditor', canonicalRole: 'auditor', organizationId: 'org-1' }; next(); };
    return { authenticateProvider: u, authenticateHealth: u, authenticateAny: u, requireRole: () => (req, _res, next) => next() };
});
jest.mock('../../shared/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('multer', () => { const m = () => ({ single: () => (req, _res, next) => { req.file = { buffer: Buffer.from('x'), originalname: 'p.jpg', mimetype: 'image/jpeg' }; next(); } }); m.memoryStorage = () => ({}); return m; }, { virtual: true });
jest.mock('../../services/prisma-database', () => ({ prisma: { auditChecklist: { findFirst: jest.fn(async () => null) } } }));

const onsiteService = require('../../services/audit-onsite-service');
jest.mock('../../services/audit-onsite-service', () => ({
    CHECKLIST_TEMPLATE_2026: [],
    startInspection: jest.fn(async () => ({ ok: true })),
    submitChecklistItem: jest.fn(async (a) => ({ id: 'row', ...a })),
    uploadPhoto: jest.fn(async () => ({ photoId: 'photo-1', url: '/uploads/x.jpg', fileHash: 'h' })),
    submitDecision: jest.fn(async () => ({ audit: {}, transition: {}, notify: null })),
    verifyGpsAgainstFarm: jest.fn(async () => ({ withinTolerance: true })),
}));

const router = require('../../routes/api/audit/onsite');
const app = express(); app.use(express.json()); app.use('/api/audit/onsite', router);

beforeEach(() => jest.clearAllMocks());

describe('onsite wire contract (real router)', () => {
    test('/checklist unwraps {items:[...]} and calls submitChecklistItem per item with itemCode/response', async () => {
        const res = await request(app).post('/api/audit/onsite/aud-1/checklist')
            .send({ items: [{ itemCode: '4.1', response: 'PASS', notes: 'n', photoIds: ['p1'] }] });
        expect(res.status).toBe(200);
        expect(onsiteService.submitChecklistItem).toHaveBeenCalledWith(expect.objectContaining({
            auditId: 'aud-1', itemCode: '4.1', response: 'PASS', notes: 'n', photoIds: ['p1'], actorId: 'auditor-1',
        }));
    });

    test('/checklist with no items → 400 CHECKLIST_ITEMS_REQUIRED', async () => {
        const res = await request(app).post('/api/audit/onsite/aud-1/checklist').send({ itemId: 'x', answer: 'YES' });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('CHECKLIST_ITEMS_REQUIRED');
    });

    test('/start reads nested gps → numeric gpsLat/gpsLng', async () => {
        await request(app).post('/api/audit/onsite/aud-1/start').send({ gps: { latitude: 13.75, longitude: 100.5, accuracy: 5 } });
        expect(onsiteService.startInspection).toHaveBeenCalledWith(expect.objectContaining({ gpsLat: 13.75, gpsLng: 100.5, gpsAccuracy: 5 }));
    });

    test('/photo parses gps JSON + itemId, responds {photoId,url}', async () => {
        const res = await request(app).post('/api/audit/onsite/aud-1/photo')
            .field('gps', JSON.stringify({ latitude: 13.75, longitude: 100.5, capturedAt: '2026-08-17T00:00:00Z' }))
            .field('itemId', '4.1');
        expect(onsiteService.uploadPhoto).toHaveBeenCalledWith(expect.objectContaining({ gpsLat: 13.75, gpsLng: 100.5, checklistItemCode: '4.1' }));
        expect(res.body.data).toEqual({ photoId: 'photo-1', url: '/uploads/x.jpg', fileHash: 'h' });
    });

    test('/decision forwards PASS to submitDecision', async () => {
        const res = await request(app).post('/api/audit/onsite/aud-1/decision').send({ decision: 'PASS', summary: 'ok' });
        expect(res.status).toBe(200);
        expect(onsiteService.submitDecision).toHaveBeenCalledWith(expect.objectContaining({ auditId: 'aud-1', decision: 'PASS', summary: 'ok' }));
    });
});
```

- [ ] **Step 2: Run the backend wire test (RED then GREEN)**

Run: `cd apps/backend && npx jest __tests__/unit/audit-onsite-wire-contract.test.js`
Expected: PASS once Tasks 8–9 are in (`/start` reads nested gps, `/photo` parses gps+itemId and returns `url`). If run before Tasks 8–9, the `/start` and `/photo` assertions FAIL — that is the RED that pins the contract.

- [ ] **Step 3: FE apiClient-level wire test** — `audit-service.wire.test.ts` (this is the B10 fix on the FE side — assert the outgoing body, never a wholesale service mock):

```typescript
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
const post = jest.fn(async () => ({ success: true, data: {} }));
const get = jest.fn(async () => ({ success: true, data: {} }));
jest.mock('@/lib/api/api-client', () => ({ apiClient: { post: (...a: unknown[]) => post(...a), get: (...a: unknown[]) => get(...a) } }));
import { AuditService } from '../audit-service';
beforeEach(() => { post.mockClear(); get.mockClear(); });

describe('AuditService outgoing wire shapes', () => {
    it('startInspection posts {gps:{...}}', async () => {
        await AuditService.startInspection('aud-1', { latitude: 13.75, longitude: 100.5, accuracy: 5, capturedAt: 't' });
        expect(post).toHaveBeenCalledWith('/audit/onsite/aud-1/start', { gps: { latitude: 13.75, longitude: 100.5, accuracy: 5, capturedAt: 't' } });
    });
    it('getOnsiteContext GETs the applicationId route', async () => {
        get.mockResolvedValueOnce({ success: true, data: { audit: { id: 'a' }, checklist: [] } });
        await AuditService.getOnsiteContext('app-1');
        expect(get).toHaveBeenCalledWith('/audit/onsite/application/app-1/context');
    });
    it('submitDecision posts the decision payload', async () => {
        await AuditService.submitDecision('aud-1', { decision: 'PASS', summary: 'ok', criticalFindings: [] });
        expect(post).toHaveBeenCalledWith('/audit/onsite/aud-1/decision', { decision: 'PASS', summary: 'ok', criticalFindings: [] });
    });
});
```

Run: `cd apps/web-app && npx jest audit-service.wire`
Expected: PASS (after Tasks 5–7).

- [ ] **Step 4: e2e closure (real Postgres, DATABASE_URL-gated)** — `onsite-decision-mint-e2e.test.js`. Model the seed/teardown on `onsite-evidence-unfreeze.test.js:43-179` (same org/auditor/applicant seed, same `recordFullEvidence`), but drive `submitDecision` and assert the auto-minted `Certificate`:

```javascript
'use strict';
const { PrismaClient } = require('@prisma/client');
const auditOnsiteService = require('../../services/audit-onsite-service');

// Repo convention: DATABASE_URL presence gates real-DB tests (no separate
// REQUIRE_DB var exists — see rls-shadow-guc.int.test.js:37). Skips cleanly otherwise.
const HAS_DB = Boolean(process.env.DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;

d('onsite PASS through /decision auto-mints a Certificate (e2e closure)', () => {
    let prisma; let orgId; let auditorId; let applicantCanonicalId;
    const applicationIds = []; const auditIds = [];

    beforeAll(async () => {
        prisma = new PrismaClient(); await prisma.$connect();
        const s = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const org = await prisma.organization.create({ data: { name: 'E2E Mint Org', slug: `e2e-mint-${s}`, code: `E2EMINT_${s}`.toUpperCase().slice(0, 24) } });
        orgId = org.id;
        const auditor = await prisma.user.create({ data: { canonicalId: `e2e-auditor-${s}`, password: 'x', organizationId: orgId, authType: 'EMAIL_LEGACY', role: 'auditor', firstName: 'E2E', lastName: 'Auditor' } });
        auditorId = auditor.id;
        applicantCanonicalId = `e2e-applicant-${s}`;
        await prisma.user.create({ data: { canonicalId: applicantCanonicalId, password: 'x', organizationId: orgId, authType: 'EMAIL_LEGACY', role: 'health', firstName: 'E2E', lastName: 'Applicant' } });
    });

    afterAll(async () => {
        await prisma.certificate.deleteMany({ where: { applicationId: { in: applicationIds } } }).catch(() => {});
        if (prisma.farmAuditPhoto) await prisma.farmAuditPhoto.deleteMany({ where: { auditId: { in: auditIds } } }).catch(() => {});
        if (prisma.farmAuditChecklistItem) await prisma.farmAuditChecklistItem.deleteMany({ where: { auditId: { in: auditIds } } }).catch(() => {});
        await prisma.harvestBatch.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
        await prisma.plantingCycle.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
        await prisma.attachment.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
        await prisma.plot.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
        await prisma.farm.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
        await prisma.auditChecklist.deleteMany({ where: { id: { in: auditIds } } }).catch(() => {});
        await prisma.application.deleteMany({ where: { id: { in: applicationIds } } }).catch(() => {});
        await prisma.user.deleteMany({ where: { organizationId: orgId } }).catch(() => {});
        await prisma.organization.deleteMany({ where: { id: orgId } }).catch(() => {});
        await prisma.$disconnect();
    });

    async function seed() {
        const s = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const app = await prisma.application.create({ data: { applicationNumber: `E2E-${s}`, healthId: applicantCanonicalId, areaType: 'OUTDOOR', organizationId: orgId, status: 'AUDIT_CONFIRMED', formData: { workflowState: 'AUDIT_CONFIRMED' } } });
        applicationIds.push(app.id);
        const audit = await prisma.auditChecklist.create({ data: { applicationId: app.id, templateName: 'GACP_GENERAL', sections: [], auditorId, organizationId: orgId, status: 'IN_PROGRESS' } });
        auditIds.push(audit.id);
        return { app, audit };
    }
    async function recordFullEvidence(auditId) {
        for (const item of auditOnsiteService.CHECKLIST_TEMPLATE_2026) {
            // eslint-disable-next-line no-await-in-loop
            await auditOnsiteService.submitChecklistItem({ auditId, itemCode: item.itemCode, response: 'PASS', actorId: auditorId, prisma });
        }
        for (let i = 0; i < auditOnsiteService.DEFAULT_MIN_PHOTOS; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            await auditOnsiteService.uploadPhoto({ auditId, fileBuffer: Buffer.from(`e2e-${auditId}-${i}`), fileName: `e-${i}.jpg`, gpsLat: 13.75 + i * 1e-4, gpsLng: 100.5 + i * 1e-4, capturedAt: new Date(), uploadedBy: auditorId, organizationId: orgId, prisma });
        }
    }

    test('HEADLINE: a fully-evidenced PASS through submitDecision mints a Certificate (auto-mint in-tx)', async () => {
        const { app, audit } = await seed();
        await recordFullEvidence(audit.id);

        await auditOnsiteService.submitDecision({ auditId: audit.id, decision: 'PASS', summary: 'ผ่านการตรวจ', actorId: auditorId, actorRole: 'AUDITOR', prisma });

        const cert = await prisma.certificate.findFirst({ where: { applicationId: app.id } });
        expect(cert).not.toBeNull();
        expect(cert.certificateNumber).toMatch(/^GACP-TH-\d{4}-[A-F0-9]{6}$/);
        const reread = await prisma.application.findUnique({ where: { id: app.id }, select: { status: true, formData: true } });
        expect(reread.status).toBe('AUDIT_PASSED');
        expect(reread.formData.onsiteAuditId).toBe(audit.id);
    });

    test('gate holds: an under-evidenced PASS refuses and mints nothing', async () => {
        const { app, audit } = await seed();
        // no evidence recorded
        await expect(auditOnsiteService.submitDecision({ auditId: audit.id, decision: 'PASS', summary: 'x', actorId: auditorId, actorRole: 'AUDITOR', prisma }))
            .rejects.toMatchObject({ code: 'INSUFFICIENT_PHOTOS' });
        const cert = await prisma.certificate.findFirst({ where: { applicationId: app.id } });
        expect(cert).toBeNull();
    });
});
```

> The auto-mint runs the FULL cert machinery (NOT `skipInitialAssets`), so it needs a migrated Postgres with canonical seeds; `createInitialAssets` early-returns when no `PlantSpecies` exists (`certificate-service.js:751-754`), so the mint still succeeds on a species-empty DB. If the target DB has malformed species seeds, seed one clean `PlantSpecies` in `beforeAll`.

- [ ] **Step 4b: Run the e2e against staging Postgres**

Exact staging command (migrated + seeded DB per MEMORY: laptop node + Supabase, `ENCRYPTION_KEY` set):
```bash
cd apps/backend && NODE_OPTIONS=--max-old-space-size=3072 \
  DATABASE_URL="$STAGING_DATABASE_URL" ENCRYPTION_KEY="$ENCRYPTION_KEY" \
  npx jest __tests__/integration/onsite-decision-mint-e2e.test.js --runInBand
```
Expected without `DATABASE_URL`: the suite is `describe.skip` (0 run, green). With it: both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/__tests__/unit/audit-onsite-wire-contract.test.js apps/web-app/src/lib/services/__tests__/audit-service.wire.test.ts apps/backend/__tests__/integration/onsite-decision-mint-e2e.test.js
git commit -m "test(audit): real wire-contract supertest + FE apiClient spy + e2e decision->mint closure (fixes B10)"
```

---

## Self-review

### 1. Spec coverage — B1–B10 → task

| Break | Task(s) |
|---|---|
| **B1** No path creates `AuditChecklist` | Task 1 (create at assign) + Task 2 (resolver finds it) |
| **B2** Wrong key (applicationId passed as auditId) | Task 4 (`/context` by applicationId, read side) + Task 5 (FE writes use `ctx.audit.id`) |
| **B3** Checklist body `{items:[...]}` mismatch | Task 6 (FE emits `{items:[{itemCode,response}]}`); Task 12 asserts at real router |
| **B4** Vocab YES/NO/NA vs PASS/FAIL/NA | Task 6 (`ANSWER_TO_RESPONSE` at FE boundary) |
| **B5** savedAnswers resume blank | Task 4 (real `photoIds` join, BE emits `response`) + Task 7 (FE reads `response`/`photoIds`, maps back) |
| **B6** `/start` GPS → NaN | Task 8 (nested `gps` shape + `Number.isFinite`) |
| **B7** `/photo` GPS + response + itemId | Task 9 (nested `gps` + `Number.isFinite` + returns `url` + itemId link) |
| **B8** gps-verify dead from client | Task 10 (`verifyGps` called after start) |
| **B9** Field-tools trap beside PASS | Task 11 (ONSITE tab → inspect entry) + Task 1 (correct `auditorId` at create) |
| **B10** No wire-contract test; fabricated `photoIds` scalar | Task 4 (fix the fabricated scalar → real join) + Task 12 (supertest + FE apiClient spy + e2e) |

Spec §7 decisions: (1) audit-row at `assignAuditor` → Task 1; (2) auditorId-match authz → Task 4 scope check + Global Constraints; (3) vocab at FE → Task 6; (4) field-tools replaced → Task 11. §2 groundings (org=app org, in-tx auto-mint, gate org-agnostic) → Tasks 1/3/2. **No spec requirement is left unmapped.**

### 2. Placeholder scan

No "TBD/TODO/similar to Task N/add validation/handle edge cases". Every code step shows the exact edit or the exact new body. Two intentionally-scoped notes are explicit, not placeholders: (a) Task 4's second savedAnswers-join test body is elided with a one-line `// ...assert` because its setup is identical to the shape test in the same step — the assertion value (`['photo-1']`) is stated; (b) Task 12's e2e seed dependency on canonical `PlantSpecies` is called out with the exact fallback (`createInitialAssets` early-returns when none — cited file:line).

### 3. Type consistency (threaded across tasks)

- **Resolver** `resolveCurrentOnsiteAuditId(prisma, applicationId, { organizationId } = {}) → Promise<string|null>` — defined Task 2, consumed identically by the gate (Task 2/3) and the `/context` route (Task 4).
- **Gate** `assertOnsiteEvidenceSufficient({ prisma, applicationId, auditId?, organizationId?, minPhotos? }) → { auditId, photoCount, itemCount }` — widened in Task 2; `auditId` supplied by `submitDecision` (Task 3) and `generateCertificate` (Task 3). Error codes unchanged.
- **`ctx.audit.id`** — produced by Task 4 (`data.audit.id: string`), consumed by Task 5 (`const auditId = context?.audit.id`). The route `[id]` = applicationId everywhere (Tasks 4/5/11).
- **Checklist body** `{ items: [{ itemCode: string, response: 'PASS'|'FAIL'|'NA', notes?, photoIds? }] }` — emitted by Task 6 (`audit-service.submitChecklistItem`), destructured by the BE handler (`onsite.js:337-360`, unchanged), asserted by Task 12 wire test. Exact match.
- **savedAnswers** — BE emits `{ itemId, response, notes, photoIds }` (Task 4); FE maps `response→answer` via `responseToAnswer` (Task 7) so `client-view` reads `{ itemId, answer, notes?, photoIds? }`. `ANSWER_TO_RESPONSE`/`responseToAnswer` are inverse maps defined once (Task 6).
- **`/photo` response** `{ photoId, url, fileHash }` — produced by Task 9 (`uploadPhoto` returns `url: attachment.fileUrl`), consumed by the unchanged FE `client-view.tsx:318-322` (`res.data.url`).
- **`verifyGps(auditId, lat, lng)`** — Task 10, matches `onsite.js` GET `/:auditId/gps-verify?lat=&lng=` query contract.

DRY: one resolver, one vocab map pair, one `loadSavedAnswers` helper shared by both `/context` routes. YAGNI: decision-vocab unification explicitly out of scope; `audit-field-tools-panel.tsx` unmounted, not rewritten. TDD: every task is RED→GREEN→commit.
