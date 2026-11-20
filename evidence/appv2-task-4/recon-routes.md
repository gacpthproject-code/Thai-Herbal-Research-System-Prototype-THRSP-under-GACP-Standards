Reconnaissance complete. Report below.

---

# ROUTE-LAYER RECON — Task 4 (the one lens)

All line numbers below come from files read in this session at HEAD `fa345c5a`.

---

## 1. The `GET /:id/pdf` door — the pattern to copy

**It is NOT in `applications.js`.** It lives in
`/home/ubuntu/work/GACP-Certification-Application/apps/backend/routes/api/applications/application-workflow-handlers.js`, **lines 510-536** (file is 538 lines; `module.exports = router;` is line 538).

Full quote (lines 510-536, verbatim):

```js
router.get('/:id/pdf', authenticateHealth, async (req, res) => {
    try {
        const applicationId = req.params.id;
        const identity = await applicationService.resolveHealthIdentity(req.user.id, getHealthScopeOptions(req.user));
        // Application has no `documents` Prisma relation — uploaded
        // documents live as JSON in `formData.documents`. The PDF
        // template-service reads them from there directly. Including
        // `documents: true` here used to 500 every PDF download
        // request (UAT 2026-05-03).
        const app = await prisma.application.findFirst({
            where: { id: applicationId, healthId: identity.healthId, isDeleted: false },
            include: { applicant: true, entity: true, invoices: { orderBy: { createdAt: 'asc' } } },
        });
        if (!app) { return res.status(404).json({ success: false, error: 'Application not found' }); }

        const { generateApplicationSummaryPdf } = require('../../../services/pdf/application-template-service');
        const buffer = await generateApplicationSummaryPdf(app);
        const filename = `Application-${app.applicationNumber || app.id}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', buffer.length);
        return res.send(buffer);
    } catch (error) {
        logger.error('[Applications PDF] Error:', error);
        return respondError(res, req, error, { message: 'Failed to generate PDF' });
    }
});
```

### The contract, piece by piece

**Auth middleware** — `application-workflow-handlers.js:13`:
```js
const { authenticateAny: authenticateHealth, authenticateProvider } = require('../../../middleware/auth-middleware');
```
So the identifier `authenticateHealth` in that file is **`authenticateAny`**, not the strict health guard. It accepts both health and provider tokens (`middleware/auth-middleware.js:763` `authenticateAny`; sets `req.user = { ...decoded, id, healthId, providerId, canonicalId, canonicalRole, authType:'health'|'provider' }` — `auth-middleware.js:831-841` and `:898-906`). There is **no** `rejectIfNotHealthRole` on this door; a provider token is not rejected at the door, it simply resolves to its own (usually absent) `healthId` and 404s at the ownership `findFirst`. `authenticateHealth` (strict) and `authenticateProvider` are both exported from `middleware/auth-middleware.js:972-975` if the implementer wants the strict one.

**Ownership scoping for a HEALTH user** — two steps, in this order:
1. `applicationService.resolveHealthIdentity(req.user.id, getHealthScopeOptions(req.user))` → `{ userId, healthId }`.
   - `getHealthScopeOptions` is in `routes/api/helpers/applications-helpers.js:41-47`, exported at `:63-67`:
     ```js
     function getHealthScopeOptions(user) {
         const healthId = String(user?.healthId || '').trim();
         if (healthId) { return { healthId, strictHealthId: true }; }
         return { strictHealthId: true };
     }
     ```
   - `resolveHealthIdentity(identityRef, options = {})` is defined in `services/application-service/application-identity-methods.js:83`. It **throws** on failure — `Object.assign(new Error('Health identity is required and must include healthId'), { statusCode: 401 })` (`:116`, `:143`, `:172`) or a plain `new Error('Health account not found for this healthId')` (`:96`, no statusCode → 500 via respondError). `respondError` honours `error.statusCode` for 4xx (`shared/api-response.js:286-301`), so the 401 case is already correct without extra code.
2. The Prisma read is scoped by the resolved `healthId`, never by anything from the request body:
   `where: { id: applicationId, healthId: identity.healthId, isDeleted: false }`.

**Not-found response** — `404 { success: false, error: 'Application not found' }` (line 523). Note the sibling `GET /:id` (`application-workflow-handlers.js:268-288`) uses a different literal, `error: 'Not Found'` (line 283); `GET /:id/activities` (`:299`) uses `'Application not found'`. Pick the pdf-door wording.

**Error response** — `logger.error(...)` then `return respondError(res, req, error, { message: 'Failed to generate PDF' });`.
`respondError(res, req, error, opts)` is `shared/api-response.js:273`, exported at `:318-328`. Options: `{ status=500, code, message, messageTh, label, log=true }`. It maps Prisma errors to 400/404/409, honours `error.statusCode`/`error.status` in the 4xx range and passes through a non-Prisma `error.code`.

**Success response** — this door sends a binary buffer. For `GET /:id/requirements` the plan (`docs/superpowers/plans/2026-09-01-application-submission-v2.md:282`) specifies `res.json({ success: true, data: resolveApplicationRequirements(...) })`, which matches the house style everywhere else in these files.

**Imports the new file will need** (copy from `application-workflow-handlers.js:10-16` / `:47-50`):
```js
const express = require('express');
const { respondError } = require('../../../shared/api-response');
const router = express.Router();
const applicationService = require('../../../services/application-service');
const { authenticateAny: authenticateHealth } = require('../../../middleware/auth-middleware');
const { prisma } = require('../../../services/prisma-database');
const logger = require('../../../shared/logger');
const { getHealthScopeOptions } = require('../helpers/applications-helpers');
```

---

## 2. Where routes are mounted

### Inside `applications.js` (the router file)

- Router variable: `const router = express.Router();` — **`applications.js:24`** (with `const express = require('express');` at `:22` and `const { respondError } = require('../../../shared/api-response');` at `:23`).
- Sub-router mounts — the **only two** `router.use(...)` calls in the file, at the very bottom:

```
1556: // LISTING & TRACKING (extracted to application-listing-handlers.js)
1557:
1558: const listingHandlers = require('./application-listing-handlers');
1559: router.use('/', listingHandlers);
1560:
1561: // WORKFLOW: REJECT, GET BY ID, REVISION, PDF (extracted to application-workflow-handlers.js)
1562:
1563: const workflowHandlers = require('./application-workflow-handlers');
1564: router.use('/', workflowHandlers);
1565:
1566: module.exports = router;
```

**Recommended insertion point for `requirements.js`: between line 1564 and line 1566**, following the identical precedent:

```js
// REQUIREMENTS: the one lens (extracted to requirements.js)

const requirementsHandlers = require('./requirements');
router.use('/', requirementsHandlers);
```

with the route inside `requirements.js` declared as `router.get('/:id/requirements', authenticateHealth, handler)` on a plain `express.Router()` (no `mergeParams` needed — the param is inside the sub-router's own path).

Plan Task 4 line 269 says "mount in applications.js **beside the draft-documents routes**" (i.e. after line 1486). That also works — `router.use('/', sub)` where `sub` only declares the two-segment `'/:id/requirements'` cannot shadow the one-segment literals that follow (`/draft` at `:1530`, `/draft/:id` at `:1544`) — but the bottom-of-file position is the established convention and is shadow-proof by construction.

**Do NOT** mount as `router.use('/:id/requirements', subRouter)` unless you also use `express.Router({ mergeParams: true })` — that is the `quotations.js` idiom (`routes/api/index.js:141`), not the listing/workflow idiom.

### Where `applications.js` itself is mounted (`routes/api/index.js`)

```
121: const appConsolidated = express.Router();
122: appConsolidated.use('/car', require('./applications/applications-car'));
123: appConsolidated.use('/config', require('./applications/applications-config'));
124: appConsolidated.use('/validate', validationRouter);
125: appConsolidated.use('/calculations', require('./applications/calculations'));
126: appConsolidated.use('/revision-deadline', require('./applications/revision-deadline'));
127: appConsolidated.use('/bundles', require('./applications/application-bundles'));
128: appConsolidated.use('/journey', require('./applications/journey'));
137: appConsolidated.use('/renewals', require('./applications/renewals'));
141: appConsolidated.use('/:applicationId/quotations', require('./applications/quotations'));
142: appConsolidated.use('/', applicationsRouter);                          // Main CRUD
143: router.use('/applications', appConsolidated);
```
(`const applicationsRouter = require('./applications/applications');` is `routes/api/index.js:18`.)

No prefix above can swallow `/:id/requirements`: all are literal single-segment prefixes except `:141`, which requires the literal second segment `quotations`.

The whole `routes/api` tree is mounted **twice** in `server.js`: `app.use('/api', apiRoutes)` (`server.js:378`) and `app.use('/api/v1', apiRoutes)` (`server.js:379`). The new door therefore answers at both `/api/applications/:id/requirements` and `/api/v1/applications/:id/requirements`.

**Nothing currently serves any `/:id/requirements` path** — grep over `routes/` found none. The only near-neighbour is `journey.js:59` `GET /document-requirements`, mounted under `/api/applications/journey` and `/api/cultivation-config` (`routes/api/index.js:128`, `:149`). No clash.

---

## 3. The draft-documents upload doors — both files

### Door A — `applications.js` (THE LIVE ONE, keep)

| Route | Lines | Middleware chain |
|---|---|---|
| `POST /draft-documents` | **1351-1436** | `authenticateHealth` (= `authenticateAny`, aliased at `applications.js:30`), `receiveDraftDocument`, inline handler |
| `GET /draft-documents` | **1438-1448** | `authenticateHealth` |
| `DELETE /draft-documents/:documentId` | **1450-1486** | `authenticateHealth` |

Supporting code in the same file:
- `draftDocumentUpload = storageService.createUploader('application-drafts', ['image/jpeg','image/png','image/webp','application/pdf'], MAX_UPLOAD_BYTES / (1024*1024))` — **`:203-210`**
- `receiveDraftDocument(req, res, next)` (multer wrapper turning `LIMIT_FILE_SIZE` into a Thai 400) — **`:226-242`**
- `rejectIfNotHealthRole(req, res)` → `true` when it already sent 403 `HEALTH_ROLE_REQUIRED` — **`:126-146`**; the POST calls it at `:1354`. GET and DELETE do **not**.
- `findOrCreateApplicationForHealth(healthIdentity, reqUser, options = {}, activeEntity = null)` — **`:333`**; reads `options.applicationId || options.draftId` (`:335`), refuses non-editable statuses with `statusCode 409 / code APPLICATION_NOT_EDITABLE`, else falls back to `findLatestOpenDraftForHealth`.
- Content guard: `uploadContentGuard.inspectStoredUpload(uploadedFile, slotId)` then `discardRejectedUpload` on refusal — **`:1378-1388`**.
- Storage of record: `formData.draftDocuments[]` on the **Application** row, replace-by-canonical-slot via `getCanonicalSlotId` (`:1408-1415`), plus best-effort `applicationDocumentSync.syncApplicationDocument(...)` (`:1421-1429`).
- Success body (`:1431`):
  `{ success:true, data:{ applicationId, draftId: application.id, documentId, fileName, fileUrl, mimeType, size } }`
- `GET` body (`:1444`): `{ success:true, data:{ applicationId, documents } }` (documents = `formData.draftDocuments`).
- `DELETE` body (`:1481`): `{ success:true, data:{ applicationId, documentId, deleted } }`; also unlinks the bytes (`:1479`).

### Door B — `wizard.js` (THE SECOND DOOR, slated for deletion)

| Route | Line | Middleware chain |
|---|---|---|
| `POST /draft-documents` | **178** | `authenticateHealth` (strict, imported at `wizard.js:10`), `receiveWizardDraftDocument`, `guardWizardDraftDocument`, `wizardController.uploadDraftDocument` |
| `GET /draft-documents` | **179** | `authenticateHealth`, `wizardController.listDraftDocuments` |
| `DELETE /draft-documents/:documentId` | **180** | `authenticateHealth`, `wizardController.deleteDraftDocument` |

Supporting code that becomes dead if the three routes go:
- `const storageService = require('../../../services/storage-service');` — `:12`
- `const uploadContentGuard = require('../../../services/upload-content-guard');` — `:13-14` (with its comment)
- `const { MAX_UPLOAD_BYTES, tooLargeRefusal } = require('@gacp/validation/upload-rules');` — `:15`
- `wizardDraftUpload = storageService.createUploader('wizard-drafts', [...], MAX_UPLOAD_BYTES/(1024*1024))` — **`:17-29`**
- `function receiveWizardDraftDocument(req, res, next)` — **`:31-58`** (doc comment starts at 31)
- `async function guardWizardDraftDocument(req, res, next)` — **`:60-116`** (doc comment starts at 60)
- The section comment `// Hybrid persisted draft documents (upload/list/delete)` — `:177`

Note this door writes to a **different store**: `wizardController` persists into the `ApplicationDraft` table and returns `draftId = draft.id` (an ApplicationDraft id, not an Application id) — `controllers/wizard-controller.js:97-111` (upload) and `:143-149` (list). It also calls `mergeApplicationAttachments` (`wizard-controller.js:95`). That is why the two doors are genuinely different, not aliases.

### Evidence for which door is live

**Web app — every upload goes to `/applications/draft-documents`. Zero references to any `/wizard/*` endpoint anywhere in `apps/web-app`** (verified: `grep -rn "wizard/draft\|/wizard'" apps/web-app --exclude-dir=node_modules --exclude-dir=.next` → 0 hits; the earlier targeted grep for `'/wizard`, `"/wizard`, `` `/wizard ``, `/api/wizard` over `src`, `e2e-g4`, `e2e-phase0`, `playwright` → 0 hits).

Live web callers:
- `apps/web-app/src/lib/services/draft-document-upload.ts:28` — `const ENDPOINT = '/applications/draft-documents';`
- `apps/web-app/src/app/health/applications/new/_steps/steps/documents-step.tsx:120` (POST) and `:148` (DELETE)
- `apps/web-app/src/components/feature/inline-document-upload.tsx:98`
- `apps/web-app/src/components/feature/document-uploader.tsx:113`
- `apps/web-app/src/app/health/planting/[id]/activities/use-planting-activities-page.ts:106` (POST), `:138` (DELETE)

`apiClient` auto-prefixes `/api` when the path does not already start with it (`apps/web-app/src/lib/api/api-client.ts:302-310`), so those resolve to `/api/applications/draft-documents`.

**Mobile app — same door:**
- `apps/mobile-app/lib/presentation/features/application/services/application_service.dart:234` — `await _client.post('/applications/draft-documents', data: formData);`
- `apps/mobile-app/test/integration/staging_contract_test.dart:202` — same path.
- `apps/mobile-app/lib/presentation/features/documents/documents_screen.dart:15` mentions the applications door only.
- Every other `wizard` hit in the mobile tree is Flutter UI naming (`wizard_steps/…`), not an endpoint.

**And the wizard router is flag-gated** — `routes/api/index.js:369-371`:
```js
if (process.env.ENABLE_PROVIDER_LEGACY_ALIAS === 'true') {
    router.use('/provider-cms', require('./system/provider-cms'));
    router.use('/wizard', require('./applications/wizard'));
}
```
That is the **only** mount of `routes/api/applications/wizard.js` in the whole repo (`grep -rn "applications/wizard'"` → `routes/api/index.js:371`, plus one test require and two doc mentions). The wizard.js comment at `:68-70` ("the route is mounted and authenticated") is imprecise — it is mounted *only when the flag is set*.

---

## 4. Callers of the door slated for deletion

**No, the callers are not only tests.** There is one **required-CI-gate script** that hits all three wizard draft-document routes, and CI sets the flag that mounts them.

### 4a. CI regression gate — LIVE, will break

`/home/ubuntu/work/GACP-Certification-Application/scripts/verify/verify-upload-integration.js`:
- `:20` — `await fetch(\`${BASE_URL}/wizard/draft-documents\`, { method:'POST', ... })` (form fields: `file`, `slotId:'LICENSE_PT09'`, `stepKey:'step-documents'`, `draftId`)
- `:42` — `POST /wizard/draft` to create the draft (reads `draftSave.body?.data?.id` at `:58`)
- `:63` — `GET /wizard/draft-documents?draftId=…`
- `:76` — `DELETE /wizard/draft-documents/:documentId?draftId=…`
- `:87` — `GET /wizard/draft-documents?draftId=…` again

It is one of exactly two required scripts in the ERP gate: `scripts/test/run-regression-gate.js:14-17`
```js
const requiredScripts = [
  'scripts/test/validate-health-planting-flow.js',
  'scripts/verify/verify-upload-integration.js',
];
```
run by `.github/workflows/ci.yml:746-750` (`node scripts/test/run-regression-gate.js`) in the `erp-regression` job (`ci.yml:659`), whose backend is started with **`ENABLE_PROVIDER_LEGACY_ALIAS: "true"`** (`ci.yml:734`). So on CI the wizard router *is* mounted and this door *is* exercised.

**Repointing gotchas (all verified):**
- `POST /applications/draft` returns `data.draftId` and `data._id` — **not `data.id`** (`applications.js:777-782`). The script's `draftSave.body?.data?.id` read (`:58`) would break on a naive `/wizard/draft` → `/applications/draft` swap.
- `POST /applications/draft-documents` response has no `sha256`, `slotId`, `stepKey` or `uploadedAt` (`applications.js:1431`); the wizard one does (`wizard-controller.js:97-111`). The script only asserts `data.documentId` (`verify-upload-integration.js:31`), so that part survives.
- `GET /applications/draft-documents` returns `data.applicationId` + `data.documents`, no `data.draftId` (`applications.js:1444`). The script only reads `data.documents` (`:65`), fine.
- `GET`/`DELETE` on the applications door read `req.query` through `findOrCreateApplicationForHealth` (`applications.js:1441`, `:1453`), which accepts `applicationId` **or** `draftId` (`:335`) — but that id must be an **Application** id; an ApplicationDraft id would silently fall through to `findLatestOpenDraftForHealth`.

### 4b. Backend tests

- `apps/backend/__tests__/unit/wizard-draft-document-content-guard.test.js` — **the only test that mounts the wizard router**: `require('../../routes/api/applications/wizard')` at `:63`, `app.use('/api/wizard', wizardRouter)` at `:70`, and all 5 tests POST to `/api/wizard/draft-documents` (`:110`, describes/tests at `:126, 127, 143, 154, 167, 177`). Deleting the POST route kills this entire suite — it must be deleted or rewritten against the applications door.
- `apps/backend/__tests__/unit/wizard-draft-document-path-confinement.test.js` — **does NOT touch the router**. It requires the controller directly (`const wizardController = require('../../controllers/wizard-controller');` at `:81`; only other require is `path` at `:36`; no express/supertest). Its 8 tests (`:104-208`) survive a route-only deletion; they die only if `wizard-controller.deleteDraftDocument` / `saveDraft` are removed.
- `apps/backend/__tests__/integration/storage-service-reject-status.test.js:8` names `wizard.js:85 router.post('/draft-documents', …)` in a comment only — it builds its own throwaway express app (`:42`), no dependency on the real router. Its comment line numbers are stale.

### 4c. Other `/wizard/*` script callers (not the upload door, but same file)

These hit `POST /wizard/draft` — they break only if the wizard `/draft` routes go too. All are ad-hoc journey scripts, **not** in `run-regression-gate.js`:
- `scripts/test/journey/agent-s3-workflow-state.js:27`, `:40`
- `scripts/test/journey/agent-j3-wizard-draft.js:39`, `:60`
- `scripts/test/journey/agent-b2-backend-security.js:127` (`GET /wizard/draft`)
- `scripts/test/journey/mega/agents-database-health.js:139-140`

### 4d. Docs / generated artifacts that mention the door

- `test-reports/api-inventory.md:1043-1047` (rows for the three `/api/v1/wizard/draft-documents` routes, marked FLAG-GATED; its line references into wizard.js are stale)
- `docs/architecture/duplicate-surface-inventory.md:166`; `docs/architecture/vocabulary-source-of-truth-map.md:35-36`; `docs/audit/audit-reports/2026-05-05-t020-legacy-retirement-status.md:55`; `reports/design-doctor/2026-08-15-sweep.md:105-107` (AP-08 already flags the whole wizard chain as unused); `reports/design-cleanup-2026-08-21/05-BACKLOG.md:90`.
- `docs/api/openapi.json` contains **`/api/wizard/draft` only** (`:668`); there is **no** `draft-documents` entry (`grep -n "draft-documents" docs/api/openapi.json` → 0 hits), because the three upload routes carry no `@swagger` block. So the generated spec needs no edit for the upload door, but does if `/wizard/draft` is ever removed.

---

## 5. What else lives in `wizard.js` — other routes DO exist

`wizard.js` is 218 lines. Besides the three draft-document routes it declares **8 more routes**. All are inside the same flag-gated router.

| Line | Route | Middleware / handler |
|---|---|---|
| 120-128 | `GET /config` | **no auth middleware at all**; inline handler → `wizardConfigService.getStepConfig(plantId)` |
| 156 | `POST /draft` | `authenticateHealth, wizardController.saveDraft` (swagger block `:132-155`) |
| 175 | `GET /draft` | `authenticateHealth, wizardController.getDraft` (swagger block `:158-174`) |
| 183 | `POST /submit` | `authenticateHealth, wizardController.submitApplication` |
| 185 | `POST /prepare` | `authenticateHealth, wizardController.prepareApplication` |
| 189-193 | `GET /admin/steps` | `authenticateProvider, adminOnly` |
| 195-201 | `PATCH /admin/steps/:stepKey` | `authenticateProvider, adminOnly` |
| 203-209 | `POST /admin/steps/:stepKey/toggle` | `authenticateProvider, adminOnly` |
| 211-215 | `POST /admin/seed` | `authenticateProvider, adminOnly` |

`module.exports = router;` at `:218`.

**Verdict: delete only the upload door, not the file.** Per plan Task 4 line 271 ("if other live routes share the file, delete only the upload route"), that condition is met:
- `POST /wizard/draft` is called by the **required CI gate** (`verify-upload-integration.js:42`) and by four journey scripts — it is not dead in the sense the deletion clause means.
- `/wizard/draft` is the only wizard path published in `docs/api/openapi.json:668`.
- The `/admin/*` routes are the subject of a closed drift-register entry (`docs/architecture/runtime-drift-register.md:26`) and are referenced by `docs/releases/post-implementation-verification-report.md:70`.

**Minimal, safe deletion set in `wizard.js`:** lines **177-180** (the section comment + the three routes), plus the now-orphaned `:12`, `:13-15`, `:17-29`, `:31-58`, `:60-116`. What remains: `express`, `safeErrorMessage`, `router`, `wizardConfigService`, `wizardController`, `authenticateHealth`/`authenticateProvider`, `adminOnly` (lines 5-11) — all still used by the surviving routes.

If Task 4 also wants `GET`/`DELETE /wizard/draft-documents` gone (lines 179-180 — the plan says "the draft-documents door", singular, and the spec at `docs/superpowers/specs/2026-09-01-application-submission-v2-design.md:39` says "**ลบ** `/api/wizard/draft-documents` (ไม่มีผู้เรียก)"), then `verify-upload-integration.js` must be repointed in the same commit or the ERP Regression Gate goes red — note that the spec's parenthetical "ไม่มีผู้เรียก" (no callers) is **wrong**: the CI gate script is a caller.

---

## Two smaller facts the implementer will want

- `getCanonicalSlotId` is imported in `applications.js:45` from `./validation-slot-utils` (61-line file in the same directory, modified most recently — Sep 4 21:00). It is the canonical alias fold the upload door uses at `:1414-1416`.
- `application-document-requirements.js` is already imported by **two** route files with the identical destructure — `applications.js:78-84` and `application-workflow-handlers.js:31-37`:
  ```js
  const {
      assertRequiredDocumentsPresent,
      buildRequirementSnapshot,
      DocumentRequirementError,
      MODE_FIRST_SUBMIT,
      MODE_RESUBMIT,
  } = require('../../../services/application-document-requirements');
  ```
  Both call sites must keep working when Task 4 rewires that service. The shared 422 shape is built by a helper at `applications.js:88-102` (`error: 'APPLICATION_INCOMPLETE'`, `code`, `message`, `missingSlots`) and is re-spelled inline in `application-workflow-handlers.js:479-487`. I did not audit the service itself — that is outside the route layer.