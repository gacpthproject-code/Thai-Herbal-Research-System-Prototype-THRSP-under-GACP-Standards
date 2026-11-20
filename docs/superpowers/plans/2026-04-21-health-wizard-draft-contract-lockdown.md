# Health Wizard Draft Contract Lock-Down Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock down the health wizard draft autosave API contract with focused regression coverage and align the workstream mapping document with the current implementation.

**Architecture:** This is a characterization/regression pass for existing behavior. Add mocked backend route tests that exercise the HTTP contract for `POST /api/applications/draft`, `GET /api/applications/draft`, and `DELETE /api/applications/draft/:id`, then update the backlog mapping so it no longer describes already-fixed draft ID/delete behavior as missing. Do not change schema, add optimistic locking, run production-mutating tests, or deploy.

**Tech Stack:** Node.js, Express, Jest, Supertest, Next.js/React frontend Jest tests, Markdown, PowerShell

---

### Task 1: Add Backend Draft Contract Regression Tests

**Files:**
- Create: `apps/backend/__tests__/unit/applications-draft-contract.test.js`
- Test: `apps/backend/__tests__/unit/applications-draft-contract.test.js`

- [ ] **Step 1: Write the route contract test**

Create `apps/backend/__tests__/unit/applications-draft-contract.test.js` with this exact content:

```js
const express = require('express');
const request = require('supertest');

jest.mock('../../middleware/auth-middleware', () => {
  const passHealthUser = (req, _res, next) => {
    req.user = {
      id: 'user-1',
      healthId: 'health-1',
      canonicalRole: 'health',
      role: 'HEALTH_USER',
    };
    next();
  };

  return {
    authenticateHealth: passHealthUser,
    authenticateAny: passHealthUser,
  };
});

jest.mock('../../services/application-service', () => ({
  resolveHealthIdentity: jest.fn(),
  deleteDraft: jest.fn(),
}));

jest.mock('../../services/prisma-database', () => ({
  prisma: {
    application: {
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
    },
  },
}));

jest.mock('../../services/storage-service', () => ({
  createUploader: jest.fn(() => ({
    single: jest.fn(() => (_req, _res, next) => next()),
  })),
}));

jest.mock('../../shared/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../shared/workflow-event-builder', () => ({
  buildWorkflowEvent: jest.fn((event) => ({
    ...event,
    id: 'workflow-event-1',
    createdAt: '2026-04-21T00:00:00.000Z',
  })),
}));

jest.mock('../../routes/api/helpers/applications-helpers', () => ({
  getHealthScopeOptions: jest.fn((user) => ({
    healthId: user.healthId,
    strictHealthScope: true,
  })),
}));

jest.mock('../../routes/api/helpers/application-constants', () => ({
  MASTER_STEPS: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  asObject: (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {}),
  asArray: (value) => (Array.isArray(value) ? value : []),
  upper: (value) => String(value || '').toUpperCase(),
  ensureApplicationNumber: jest.fn(() => 'APP-TEST-001'),
  mergeMasterSteps: jest.fn((formData, payload) => ({
    ...((formData && formData.steps) || {}),
    ...((payload && payload.steps) || {}),
  })),
  validateMasterSubmission: jest.fn(() => ({ isValid: true, missingByStep: {} })),
}));

jest.mock('../../routes/api/preview/preview-utils', () => ({
  normalizeDocuments: jest.fn(() => []),
  summarizeCompletion: jest.fn(() => ({ isComplete: true, missingFields: [] })),
}));

jest.mock('../../validation/application-schemas', () => ({
  validateStep: jest.fn(() => ({ success: true, errors: [] })),
  validateAllSteps: jest.fn(() => ({ isValid: true, errorsByStep: {} })),
}));

jest.mock('../../routes/api/applications/application-listing-handlers', () => {
  const router = require('express').Router();
  return router;
});

jest.mock('../../routes/api/applications/application-workflow-handlers', () => {
  const router = require('express').Router();
  return router;
});

const applicationService = require('../../services/application-service');
const { prisma } = require('../../services/prisma-database');
const applicationsRouter = require('../../routes/api/applications/applications');

function makeDraft(overrides = {}) {
  const now = new Date('2026-04-21T00:00:00.000Z');
  return {
    id: 'draft-1',
    applicationNumber: 'APP-2026-000001',
    status: 'DRAFT',
    serviceType: 'new_application',
    areaType: 'OUTDOOR',
    formData: {
      steps: {
        '1': { plantId: 'cannabis' },
      },
      certificationPurposes: ['COMMERCIAL'],
    },
    workflowHistory: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('Applications draft API contract', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/applications', applicationsRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    applicationService.resolveHealthIdentity.mockResolvedValue({
      userId: 'user-1',
      healthId: 'health-1',
    });
    prisma.application.count.mockResolvedValue(1);
  });

  it('POST /draft returns canonical draftId and backward-compatible _id', async () => {
    const existingDraft = makeDraft();
    const updatedDraft = makeDraft({
      formData: {
        ...existingDraft.formData,
        lastDraftSavedAt: '2026-04-21T00:00:00.000Z',
      },
    });

    prisma.application.findFirst.mockResolvedValue(existingDraft);
    prisma.application.update.mockResolvedValue(updatedDraft);

    const response = await request(app)
      .post('/api/applications/draft')
      .send({
        serviceType: 'new_application',
        areaType: 'OUTDOOR',
        step: 1,
        steps: {
          '1': { plantId: 'cannabis' },
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.draftId).toBe('draft-1');
    expect(response.body.data._id).toBe('draft-1');
    expect(response.body.data.applicationNumber).toBe('APP-2026-000001');
    expect(response.body.data).not.toHaveProperty('syncVersion');
    expect(response.body.data).not.toHaveProperty('etag');
  });

  it('GET /draft returns canonical draftId and backward-compatible _id for latest draft', async () => {
    prisma.application.findFirst.mockResolvedValue(makeDraft());

    const response = await request(app).get('/api/applications/draft');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.draftId).toBe('draft-1');
    expect(response.body.data._id).toBe('draft-1');
    expect(response.body.data.status).toBe('DRAFT');
    expect(prisma.application.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        healthId: 'health-1',
        isDeleted: false,
      }),
      orderBy: { updatedAt: 'desc' },
    }));
  });

  it('GET /draft returns success with null data when no draft exists', async () => {
    prisma.application.findFirst.mockResolvedValue(null);

    const response = await request(app).get('/api/applications/draft');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: null });
  });

  it('DELETE /draft/:id delegates to health-scoped soft delete and reports deletion', async () => {
    applicationService.deleteDraft.mockResolvedValue({ id: 'draft-1' });

    const response = await request(app).delete('/api/applications/draft/draft-1');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual({ deleted: true, draftId: 'draft-1' });
    expect(applicationService.deleteDraft).toHaveBeenCalledWith(
      'user-1',
      'draft-1',
      expect.objectContaining({
        healthId: 'health-1',
        strictHealthScope: true,
      }),
    );
  });

  it('DELETE /draft/:id reports deleted false when draft is missing or not owned', async () => {
    applicationService.deleteDraft.mockResolvedValue(null);

    const response = await request(app).delete('/api/applications/draft/not-owned');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toEqual({ deleted: false, draftId: 'not-owned' });
  });
});
```

- [ ] **Step 2: Run the contract test**

Run:

```powershell
npm.cmd --prefix apps/backend test -- --runTestsByPath __tests__/unit/applications-draft-contract.test.js
```

Expected:

- `PASS __tests__/unit/applications-draft-contract.test.js`
- `5 passed`

This test may pass immediately because the implementation already contains the A2 contract behavior. If it fails, do not broaden the route refactor. Inspect the failing assertion and make only the smallest route or service change needed to satisfy the documented contract.

- [ ] **Step 3: Commit backend contract coverage**

Run:

```powershell
git add apps/backend/__tests__/unit/applications-draft-contract.test.js
git commit -m "test: lock down health wizard draft contract"
```

Expected:

- Commit includes only `apps/backend/__tests__/unit/applications-draft-contract.test.js`

### Task 2: Align The Workstream Mapping With Current Contract State

**Files:**
- Modify: `docs/backlog/health-wizard-offline-sync-workstream-a-review-first-mapping.md`
- Test: `rg` documentation checks

- [ ] **Step 1: Write the documentation update**

Edit `docs/backlog/health-wizard-offline-sync-workstream-a-review-first-mapping.md`.

Change the status line near the top from:

```md
- Status: Review complete (implementation not started)
```

to:

```md
- Status: Slice A1 implemented; Slice A2 contract lock-down in progress
```

Then insert this block immediately after the `Scope:` line:

```md
## 2026-04-21 Implementation Update

- Slice A1 autosave/offline UX semantics are implemented in `new-legacy` wizard code.
- `POST /api/applications/draft` and `GET /api/applications/draft` now return both canonical `draftId` and backward-compatible `_id`.
- `DELETE /api/applications/draft/:id` exists and soft-deletes health-owned drafts through `applicationService.deleteDraft(...)`.
- Slice A2 is now a contract lock-down pass: add regression coverage and keep this mapping aligned with the current code.
```

In section `## 3. Findings (Review-First)`, update finding titles 4 and 5 from active defects to historical notes:

```md
### 4. `Resolved / Lock-down` Baseline autosave response contract now returns `draftId`
```

```md
### 5. `Resolved / Lock-down` Draft cleanup path now has a backend delete route
```

For each of those two findings, add this line directly under the heading:

```md
Current status (2026-04-21): resolved in code; covered by Slice A2 regression tests.
```

- [ ] **Step 2: Verify documentation alignment**

Run:

```powershell
rg -n "Slice A1 implemented|Slice A2 contract lock-down|2026-04-21 Implementation Update|Resolved / Lock-down|covered by Slice A2 regression tests" docs/backlog/health-wizard-offline-sync-workstream-a-review-first-mapping.md
```

Expected:

- matches for the updated status line
- matches for the implementation update section
- two `Resolved / Lock-down` finding headings
- two `covered by Slice A2 regression tests` lines

- [ ] **Step 3: Commit mapping update**

Run:

```powershell
git add docs/backlog/health-wizard-offline-sync-workstream-a-review-first-mapping.md
git commit -m "docs: align health wizard draft contract mapping"
```

Expected:

- Commit includes only `docs/backlog/health-wizard-offline-sync-workstream-a-review-first-mapping.md`

### Task 3: Run Final Targeted Verification

**Files:**
- Test: backend contract test
- Test: frontend autosave/indicator tests
- Test: plan scope via `git show` and `git status`

- [ ] **Step 1: Run backend draft contract test**

Run:

```powershell
npm.cmd --prefix apps/backend test -- --runTestsByPath __tests__/unit/applications-draft-contract.test.js
```

Expected:

- `PASS __tests__/unit/applications-draft-contract.test.js`
- `5 passed`

- [ ] **Step 2: Run frontend autosave/indicator tests**

Run:

```powershell
npm.cmd --prefix apps/web-app test -- --runTestsByPath src/app/health/applications/new-legacy/hooks/auto-save-status.test.ts src/app/health/applications/new-legacy/hooks/use-auto-save.test.tsx src/components/application-flow/auto-save-indicator.test.tsx
```

Expected:

- `PASS src/app/health/applications/new-legacy/hooks/auto-save-status.test.ts`
- `PASS src/app/health/applications/new-legacy/hooks/use-auto-save.test.tsx`
- `PASS src/components/application-flow/auto-save-indicator.test.tsx`
- `11 passed`

- [ ] **Step 3: Verify production Docker was not mutated**

Do not deploy, restart, migrate, or run mutation-heavy production tests.

Optional read-only check if server access is available:

```powershell
ssh.exe -p 2222 -o BatchMode=yes -o ConnectTimeout=10 root@152.42.218.251 "cd /opt/gacp-platform; docker compose --env-file .env.production -f docker-compose.production.yml ps"
```

Expected:

- Read-only container status output
- no deploy command
- no restart command
- no migration command

- [ ] **Step 4: Verify commit and working tree scope**

Run:

```powershell
git log --oneline -5
git show --stat --oneline HEAD~2..HEAD
git status --short
```

Expected:

- recent commits include:
  - `test: lock down health wizard draft contract`
  - `docs: align health wizard draft contract mapping`
- `git show --stat --oneline HEAD~2..HEAD` shows only:
  - `apps/backend/__tests__/unit/applications-draft-contract.test.js`
  - `docs/backlog/health-wizard-offline-sync-workstream-a-review-first-mapping.md`
- unrelated dirty files that existed before the slice may still appear in `git status --short`; do not stage or modify them
