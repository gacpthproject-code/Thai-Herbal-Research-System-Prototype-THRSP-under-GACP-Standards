# Phase 3 Backend Audit - Admin and System

[Backend Audit Item]
- ID: ADMIN-01
- Endpoint/Module: `/api/admin/config/*`
- Controller/Service/Middleware: `routes/api/admin/index.js` -> `routes/api/admin/config.js` -> Prisma `systemConfig`
- Expected Role: `admin`
- DB/Queue/External Dependency: `SystemConfig`
- Findings: The admin mount only applies provider authentication, and `admin/config.js` does not add any admin role or canonical permission middleware. Any provider-authenticated user can read and update admin configuration through this route family.
- Risk Level: Critical
- Evidence from code/runtime structure: `apps/backend/routes/api/admin/index.js` mounts children behind `authenticateProvider`; `apps/backend/routes/api/admin/config.js` defines `GET /` and `PATCH /:key` with no `requireAdmin` or `requireCanonicalPermission(...)`.
- Suspected Failure Mode: Non-admin provider accounts can mutate runtime configuration, causing privilege escalation and uncontrolled config drift.
- What to inspect next: Compare usage of `/api/admin/config` in frontend pages or BFF handlers to determine who can trigger these calls today.

[Backend Audit Item]
- ID: ADMIN-02
- Endpoint/Module: `/api/admin/plants/*`
- Controller/Service/Middleware: `routes/api/admin/index.js` -> `routes/api/admin/plants.js` -> Prisma `plantSpecies`
- Expected Role: `admin`
- DB/Queue/External Dependency: `PlantSpecies`, `PlantingCycle`
- Findings: Like admin config, the admin plants module has no admin-specific guard beyond provider authentication. Create, update, and delete are therefore available to any provider-authenticated user.
- Risk Level: Critical
- Evidence from code/runtime structure: `apps/backend/routes/api/admin/plants.js` defines list/create/update/delete handlers without admin middleware; the parent admin mount only authenticates the provider session.
- Suspected Failure Mode: Non-admin provider users can modify reference plant data and break planting flows that depend on those reference records.
- What to inspect next: Compare this module to `apps/backend/routes/api/admin/planting.js`, which does apply a role check, to document the inconsistency in more depth.

[Backend Audit Item]
- ID: ADMIN-03
- Endpoint/Module: Criteria mutation under `/api/criteria/*`
- Controller/Service/Middleware: `routes/api/criteria.js` -> provider auth -> criteria controller/service
- Expected Role: `admin`
- DB/Queue/External Dependency: Standards/criteria reference tables
- Findings: Comments describe mutating criteria routes as admin-only, but the route family inspected applies provider auth without an explicit admin or canonical permission guard. This is another admin-scope drift point outside `/api/admin/*`.
- Risk Level: High
- Evidence from code/runtime structure: `apps/backend/routes/api/criteria.js` documents admin-only mutations while relying on `authenticateProvider`; no matching `adminOnly` or permission middleware was found in the inspected route file.
- Suspected Failure Mode: Non-admin provider users can create or change compliance criteria that feed application review and frontend rule rendering.
- What to inspect next: Open the controller implementation to verify whether any late-stage role check exists there.

[Backend Audit Item]
- ID: ADMIN-04
- Endpoint/Module: Public plant routes `/api/plants/*`
- Controller/Service/Middleware: `routes/api/plants.js` -> `controllers/plant-controller.js`
- Expected Role: Public read access for selected reference data; admin for mutations if any
- DB/Queue/External Dependency: `PlantSpecies`
- Findings: The controller contract does not match the mounted routes. `getPlantById()` reads `req.params.plantId` while the route provides `:id`, and `GET /production-inputs` is mounted without a `:plantId` segment even though the controller expects one.
- Risk Level: High
- Evidence from code/runtime structure: `apps/backend/routes/api/plants.js` mounts `/:id` and `/production-inputs`; `apps/backend/controllers/plant-controller.js` reads `req.params.plantId` and comments still reference `/api/v2/plants`.
- Suspected Failure Mode: Plant detail and production-input reads return not found, undefined lookups, or empty data despite valid records and correct caller behavior.
- What to inspect next: Open frontend consumers of `/api/plants/*` to see whether this mismatch is currently masked by unused UI code.

[Backend Audit Item]
- ID: ADMIN-05
- Endpoint/Module: Mixed system/config surfaces outside admin namespace
- Controller/Service/Middleware: `routes/api/system-config.routes.js`, `routes/api/system.js`, `routes/api/master-data.js`, `routes/api/config.js`, `routes/api/standards.js`
- Expected Role: `admin` for mutable system config; public or health/provider users only where explicitly intended
- DB/Queue/External Dependency: `SystemConfig`, standards tables, hardcoded config payloads
- Findings: System surfaces use inconsistent source-of-truth patterns. `system-config.routes.js` applies `authenticateProvider + adminOnly`, `standards.js` uses a standalone `PrismaClient`, and `master-data.js` plus `config.js` return hardcoded compatibility payloads rather than a single DB-backed source. This makes system behavior dependent on which endpoint family a caller uses.
- Risk Level: Medium
- Evidence from code/runtime structure: `apps/backend/routes/api/system-config.routes.js` is stricter than `admin/config.js`; `apps/backend/routes/api/standards.js` instantiates its own Prisma client; `apps/backend/routes/api/master-data.js` and `apps/backend/routes/api/config.js` serve static response shapes.
- Suspected Failure Mode: Frontend or BFF surfaces receive contradictory config and reference data depending on which namespace they call, and operational changes apply to only part of the runtime.
- What to inspect next: Compare Phase 2 frontend findings against actual callers of `/api/system-config`, `/api/config`, and `/api/master-data`.
