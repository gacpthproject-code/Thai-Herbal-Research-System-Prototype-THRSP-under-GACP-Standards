# Phase 3 Backend Audit - Planting and Trace

[Backend Audit Item]
- ID: PLANT-01
- Endpoint/Module: Health farm creation/listing under `/api/farms/*`
- Controller/Service/Middleware: `routes/api/farms.js` -> `services/farm-service.js` -> health auth middleware
- Expected Role: `health`
- DB/Queue/External Dependency: `Farm`, QR generation helpers
- Findings: Runtime exposes `/api/farms/*` as the canonical health-owned farm namespace, but the frontend health establishment creation page posts to `/establishments`. This is a live route contract mismatch between backend runtime and web-app usage.
- Risk Level: High
- Evidence from code/runtime structure: `apps/backend/routes/api/index.js` mounts `/farms` and no `/establishments`; `apps/web-app/src/app/health/establishments/new/page.tsx` posts to an establishments path instead of the farm namespace.
- Suspected Failure Mode: New establishment creation fails at the network boundary, leaving the health user on a broken onboarding path even though farm endpoints exist.
- What to inspect next: Open the corresponding BFF proxy route if one exists to confirm whether it remaps `/establishments` to `/api/farms`.

[Backend Audit Item]
- ID: PLANT-02
- Endpoint/Module: Planting cycle creation and side effects under `/api/planting-cycles/*`
- Controller/Service/Middleware: `routes/api/planting-cycles.js` -> `services/planting-service.js` -> helper route registrars for plots/units/activities
- Expected Role: `health`
- DB/Queue/External Dependency: `PlantingCycle`, `Plot`, `PlantUnit`, QR generation, trace bootstrap
- Findings: Cycle creation is canonical and health-authenticated, but QR generation and optional unit generation are side effects that are downgraded to warnings when they fail. The route creates the cycle first and does not make those downstream steps part of one transaction boundary.
- Risk Level: Medium
- Evidence from code/runtime structure: `apps/backend/routes/api/planting-cycles.js` uses `authenticateHealth` globally and invokes helper registrations; the create flow logs warnings rather than rolling back when QR or unit generation fails.
- Suspected Failure Mode: A planting cycle can exist without the QR/unit assets that later trace, cultivation, or lot flows assume are present.
- What to inspect next: Open the exact create handler and any helper in `services/planting-service.js` that materializes QR/unit state.

[Backend Audit Item]
- ID: PLANT-03
- Endpoint/Module: Site analysis routes `/api/site-analyses/*`
- Controller/Service/Middleware: `routes/api/site-analyses.js` -> `controllers/site-analysis-controller.js` -> `services/site-analysis-service.js`
- Expected Role: `health` only for own farm records; provider provider for any verification action
- DB/Queue/External Dependency: `SiteAnalysis`, `Farm`
- Findings: The router applies `authenticateHealth` globally, including the `/:id/verify` route that comments describe as PROVIDER-facing. Controller and service flows inspected do not enforce farm ownership on create, list-by-farm, get, update, or delete. This is both an auth-boundary error and a missing tenancy check.
- Risk Level: Critical
- Evidence from code/runtime structure: `apps/backend/routes/api/site-analyses.js` uses health auth across the router; comments label verify as PROVIDER-only; inspected controller/service paths do not check `Farm.ownerId` against the authenticated user.
- Suspected Failure Mode: Any authenticated health user can read or mutate site analyses for another farm ID, and a health user can hit a route that appears intended for provider verification.
- What to inspect next: Open all service methods in `apps/backend/services/site-analysis-service.js` to confirm there is no hidden ownership gate deeper in the stack.

[Backend Audit Item]
- ID: PLANT-04
- Endpoint/Module: Training record routes `/api/training-records/*`
- Controller/Service/Middleware: `routes/api/training-records.js` -> `controllers/training-record-controller.js` -> `services/training-record-service.js`
- Expected Role: `health` only for own farm records; provider oversight only through explicit provider routes
- DB/Queue/External Dependency: `TrainingRecord`, `Farm`
- Findings: The training-record module follows the same pattern as site analysis: health-auth is global, but per-farm ownership checks were not found in the inspected controller/service chain. This exposes cross-tenant read/write risk inside a nominally authenticated route family.
- Risk Level: Critical
- Evidence from code/runtime structure: `apps/backend/routes/api/training-records.js` protects the family with `authenticateHealth`; the controller/service chain inspected accepts farm or record IDs without a visible ownership join against `Farm.ownerId`.
- Suspected Failure Mode: A logged-in health user can retrieve or modify training records associated with another applicant's farm if IDs are known.
- What to inspect next: Open any shared helper used by both training and site-analysis modules that may add ownership filtering implicitly.

[Backend Audit Item]
- ID: PLANT-05
- Endpoint/Module: Provider planting detail and public trace surfaces
- Controller/Service/Middleware: `routes/api/provider/planting.js`, `routes/api/trace.js`, root-mounted `routes/api/plots.js` and `routes/api/plant-units.js`
- Expected Role: Provider provider for provider planting; `health` for own planting; public for trace reads
- DB/Queue/External Dependency: `PlantingCycle`, `Plot`, `PlantUnit`, `Lot`, `TraceQrSecurity`, public QR URLs
- Findings: Backend planting surfaces are split across canonical `/api/provider/planting-cycles/*`, health-owned `/api/planting-cycles/*`, and compatibility root paths for plots and plant units. The frontend provider planting detail page still calls the health route `/api/planting-cycles/:id`, and `farm-service` generates QR URLs under `/verify/farm/:id`, which do not match an observed mounted public verification route.
- Risk Level: High
- Evidence from code/runtime structure: `apps/backend/routes/api/index.js` mounts `plots` and `plant-units` at root; provider planting routes sit under `/api/provider`; `apps/web-app/src/app/provider/planting/[id]/page.tsx` calls `/api/planting-cycles/${cycleId}`; `apps/backend/services/farm-service.js` generates `/verify/farm/:id` links.
- Suspected Failure Mode: Provider planting pages read from the wrong auth namespace, trace links resolve to missing pages, and downstream plot/unit APIs depend on compatibility paths rather than one canonical route family.
- What to inspect next: Open the Next.js trace and verify page tree under `apps/web-app/src/app/trace` and `apps/web-app/src/app/verify*` to confirm whether `/verify/farm/:id` exists.
