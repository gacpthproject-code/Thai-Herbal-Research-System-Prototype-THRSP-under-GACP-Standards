# Phase 3 Backend Audit - Document and Certificate

[Backend Audit Item]
- ID: DOC-01
- Endpoint/Module: `/api/documents/verify`
- Controller/Service/Middleware: `routes/api/documents.js` -> `middleware/upload-middleware` -> `services/document-analysis-service.js`
- Expected Role: `health`
- DB/Queue/External Dependency: Uploaded files, OCR/AI document analysis, local/MinIO storage
- Findings: The route accepts a file and expected type, performs inline presence validation, and returns OCR/AI analysis output directly. No ownership record, audit trail, or persistent verification result write was found in the route chain inspected.
- Risk Level: Medium
- Evidence from code/runtime structure: `apps/backend/routes/api/documents.js` authenticates health users, uses `upload.single('file')`, then calls `documentAnalysisService.verifyUploadedDocument(...)`; the route logs through `console` and returns analysis data without a database write in the inspected path.
- Suspected Failure Mode: A document can be "verified" in-session for UI purposes with no durable record, leaving later review flows unable to reconcile what was checked or by whom.
- What to inspect next: Open `apps/backend/services/document-analysis-service.js` to confirm whether persistence happens deeper in the stack.

[Backend Audit Item]
- ID: DOC-02
- Endpoint/Module: Certificate list/detail/download under `/api/certificates/*`
- Controller/Service/Middleware: `routes/api/certificates.js` -> `services/certificate-service.js` -> Prisma direct access
- Expected Role: `health` for own certificates; provider roles for provider listing; public only for explicit verify endpoints
- DB/Queue/External Dependency: `Certificate`, `Application`, PDF generation queue
- Findings: `GET /api/certificates/:id/download` is exposed without any auth middleware, while list/detail routes do enforce health or provider auth. This makes the download surface materially less protected than the rest of the certificate module.
- Risk Level: Critical
- Evidence from code/runtime structure: `apps/backend/routes/api/certificates.js` mounts auth on `/`, `/my`, and `/:id`, but `/:id/download` is defined with no `authenticateHealth` or `authenticateProvider`.
- Suspected Failure Mode: Anyone who can guess or enumerate a certificate ID can retrieve the PDF directly even when they do not own the certificate.
- What to inspect next: Search web and mobile code for direct download links to determine whether certificate IDs are exposed in client-visible payloads.

[Backend Audit Item]
- ID: DOC-03
- Endpoint/Module: provider certificate listing `/api/certificates`
- Controller/Service/Middleware: `routes/api/certificates.js` -> provider auth wrapper -> Prisma certificate query
- Expected Role: Provider provider with certificate-view authority
- DB/Queue/External Dependency: `Certificate` table
- Findings: The provider list endpoint uses provider auth only and does not apply canonical permission checks. This diverges from newer provider modules that gate provider access with `requireCanonicalPermission(...)`.
- Risk Level: Medium
- Evidence from code/runtime structure: `apps/backend/routes/api/certificates.js` defines `authenticatePROVIDER` as a wrapper around `authenticateProvider` and uses it directly for `GET /`; no permission middleware is layered after authentication.
- Suspected Failure Mode: Any provider-authenticated provider account, regardless of functional role, can enumerate certificates and related metadata.
- What to inspect next: Open `apps/backend/routes/api/provider/certificates.js` and compare its gating against the root certificate routes.

[Backend Audit Item]
- ID: DOC-04
- Endpoint/Module: Certificate generation in `certificate-service`
- Controller/Service/Middleware: `services/certificate-service.js` -> Prisma `Certificate`, `Farm`, `Plot`, `PlantingCycle`, `HarvestBatch` writes -> optional PDF queue
- Expected Role: Provider approval/final issuance flow
- DB/Queue/External Dependency: Prisma client, PDF queue, farm and planting bootstrap entities
- Findings: Certificate issuance uses a standalone `new PrismaClient()` rather than the shared database service, generates certificate numbers via `count()+1`, and performs optional planting bootstrap side effects that are non-blocking when they fail. The route-facing issuance path is therefore not strongly transactional or concurrency-safe.
- Risk Level: High
- Evidence from code/runtime structure: `apps/backend/services/certificate-service.js` instantiates its own Prisma client, builds certificate number from `await prisma.certificate.count() + 1`, and wraps `createInitialAssets(...)` in a catch that logs and continues.
- Suspected Failure Mode: Concurrent issuance can generate duplicate certificate numbers, and a certificate can be marked issued while farm/plot/batch bootstrap side effects fail silently.
- What to inspect next: Open unique constraints in `apps/backend/prisma/schema.prisma` for `certificateNumber` and inspect whether any retry loop exists around certificate creation.
