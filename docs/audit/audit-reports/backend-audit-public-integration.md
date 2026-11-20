# Phase 3 Backend Audit - Public and Integration Surfaces

[Backend Audit Item]
- ID: PUBLIC-01
- Endpoint/Module: Public certificate verification routes `/verify/:certificateNumber` and `/verify/:certificateNumber/page`
- Controller/Service/Middleware: `routes/api/public.js` -> Prisma certificate read -> inline HTML generator
- Expected Role: Public
- DB/Queue/External Dependency: `Certificate`
- Findings: Public verification duplicates certificate verification behavior already exposed under `/api/certificates/verify/:certificateNumber` and references certificate fields that do not appear to match the current canonical schema consistently. The module is explicitly compatibility-oriented and mixes legacy and newer field names in its response.
- Risk Level: High
- Evidence from code/runtime structure: `apps/backend/routes/api/public.js` reads `certificate.location?.province`, `certificate.cropTypes`, `certificate.issueDate`, and `certificate.certificationStandards`, while `certificate-service.js` writes fields such as `province`, `cropType`, `issuedDate`, and `standardName`; `routes/api/certificates.js` also exposes a public verify endpoint.
- Suspected Failure Mode: Public verification returns partially empty metadata or inconsistent shapes depending on whether callers hit `/public` verification or `/api/certificates/verify`.
- What to inspect next: Compare the Prisma `Certificate` model in `apps/backend/prisma/schema.prisma` against both public verification route implementations.

[Backend Audit Item]
- ID: PUBLIC-02
- Endpoint/Module: Interoperability trust surface `/api/interoperability/v1/*`
- Controller/Service/Middleware: `routes/api/interoperability.js` -> trust/signature handlers -> provider auth and admin check for revoke operations
- Expected Role: Public for read/verify endpoints; `admin` for revocation or privileged trust operations
- DB/Queue/External Dependency: Certificate trust registry, signature verification, revocation feed
- Findings: The interoperability namespace is a separate public trust dialect from `/trace/*` and `/api/certificates/verify/*`. It appears intentionally public for several reads, but it expands the number of public verification contracts that have to stay consistent with certificate and trace runtime behavior.
- Risk Level: Medium
- Evidence from code/runtime structure: `apps/backend/routes/api/interoperability.js` mounts `/v1/*` public verification/trust endpoints and uses provider-auth plus admin checks only for revoke-style operations.
- Suspected Failure Mode: Different public consumers receive different certificate truth depending on which trust namespace they call, with drift accumulating between them.
- What to inspect next: Open the exact service functions behind verify and revocation routes to compare data sources and field mappings.

[Backend Audit Item]
- ID: PUBLIC-03
- Endpoint/Module: Identity review and public-facing verification adjacencies under `/api/identity/*`
- Controller/Service/Middleware: `routes/api/identity.js` -> `services/identity-service.js` -> storage upload helpers
- Expected Role: `health` for own verify/status; explicitly authorized provider reviewer for pending/user/review
- DB/Queue/External Dependency: `User`, uploaded identity files, review status fields
- Findings: provider review routes are only provider-authenticated, and the review call passes `req.user.username` into the service even though provider auth payloads inspected elsewhere do not reliably include that field. This is a sensitive provider action running with weak role gating and potentially incomplete actor identity metadata.
- Risk Level: High
- Evidence from code/runtime structure: `apps/backend/routes/api/identity.js` uses `authenticateProvider` alone for `/pending`, `/user/:id`, and `/review/:id`; the review handler calls `identityService.reviewUser(..., req.user.username)`.
- Suspected Failure Mode: Any provider-authenticated user can review identity records, and audit metadata for reviewer identity may be null or incorrect because `username` is not guaranteed in the auth payload.
- What to inspect next: Open `apps/backend/services/identity-service.js` to confirm how `reviewUser` stores reviewer identity and whether it guards role access internally.
