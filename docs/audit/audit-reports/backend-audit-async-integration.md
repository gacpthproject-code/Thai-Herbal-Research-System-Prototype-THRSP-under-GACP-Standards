# Phase 3 Backend Audit - Async and Integration Paths

[Backend Audit Item]
- ID: ASYNC-01
- Endpoint/Module: Offline sync surface `/api/sync/offline`
- Controller/Service/Middleware: `routes/api/sync.js` -> `controllers/sync-controller.js::processOfflineSync` -> `middleware/auth-middleware.js`
- Expected Role: Authenticated health or provider user, scoped to their own offline actions
- DB/Queue/External Dependency: JWT decode, `Application`, transaction writes
- Findings: `authenticateSyncUser` decodes JWT without verification to choose the auth branch, then calls the actual auth middleware afterward. The sync controller processes actions sequentially with per-action transactions, but the action envelope itself is not idempotent and still writes legacy statuses for some action types.
- Risk Level: High
- Evidence from code/runtime structure: `apps/backend/routes/api/sync.js` uses `jwt.decode(...)` before signature verification to infer provider vs health auth; `apps/backend/controllers/sync-controller.js` loops sync actions and can write statuses such as `WAITING_CERTIFICATE` or `REJECTED`.
- Suspected Failure Mode: Replayed or duplicated offline actions are applied more than once, and mixed legacy status writes can push synchronized applications outside canonical workflow expectations.
- What to inspect next: Open the exact action handlers in `sync-controller.js` to catalogue which actions have natural idempotency keys and which do not.

[Backend Audit Item]
- ID: ASYNC-02
- Endpoint/Module: Lab callback `/api/callbacks/lab-result`
- Controller/Service/Middleware: `routes/api/lab-webhook.routes.js` -> `controllers/lab-webhook-controller.js`
- Expected Role: Machine-to-machine callback authenticated by API key or signature
- DB/Queue/External Dependency: External lab payload, `Application`
- Findings: The route comments say to secure the callback with an API key in production, but no auth middleware is mounted. The controller updates application outcomes directly, uses non-canonical statuses such as `REJECTED_LAB`, and no idempotency, transaction wrapper, or audit log was found in the inspected path.
- Risk Level: Critical
- Evidence from code/runtime structure: `apps/backend/routes/api/lab-webhook.routes.js` mounts `POST /lab-result` directly to the controller; `apps/backend/controllers/lab-webhook-controller.js` performs direct application updates with no signature or API-key validation in the inspected runtime path.
- Suspected Failure Mode: Anyone able to reach the endpoint can spoof lab callbacks, and duplicate or malformed callbacks can push applications into states that other modules do not understand.
- What to inspect next: Open the controller in full and compare its status values against `workflow-transition-service.js` and admin/application status filters.

[Backend Audit Item]
- ID: ASYNC-03
- Endpoint/Module: Payment webhook async handling and DLQ integration
- Controller/Service/Middleware: `routes/api/webhooks.js` -> `services/payment-service-webhook-flow.js` -> `services/queue-service.js`
- Expected Role: Machine-to-machine callback with durable retry path
- DB/Queue/External Dependency: Payment gateway signature, `PaymentTransaction`, webhook DLQ queue
- Findings: Queue initialization defines a webhook DLQ, but the exported queue-service API inspected exposes getters only for SLA and PDF queues. Startup failures are logged and tolerated, so webhook-failure durability appears best-effort rather than guaranteed from the runtime path inspected.
- Risk Level: High
- Evidence from code/runtime structure: `apps/backend/services/queue-service.js` initializes `sla-monitor`, `pdf-generator`, and `webhook-dlq`, but only exports queue accessors for SLA and PDF; queue init failures are logged without failing startup.
- Suspected Failure Mode: Webhook processing failures cannot be routed consistently into a retriable DLQ path, leaving operators with logs but no durable recovery artifact.
- What to inspect next: Search for direct imports of the internal webhook DLQ queue object or worker registration files outside `queue-service.js`.

[Backend Audit Item]
- ID: ASYNC-04
- Endpoint/Module: Cron HTTP endpoint `/api/cron/auto-cancel`
- Controller/Service/Middleware: `routes/api/cron.js` -> working-days and notification services -> Prisma transaction updates
- Expected Role: Internal scheduler or trusted operator via `CRON_SECRET`
- DB/Queue/External Dependency: `Application`, `RevisionDeadline`, notification service, holiday calendar
- Findings: The route verifies a secret only if `CRON_SECRET` is configured; otherwise it allows unauthenticated execution. The cancel/update path does use a transaction, but exposure of the endpoint itself depends on environment configuration being present.
- Risk Level: High
- Evidence from code/runtime structure: `apps/backend/routes/api/cron.js` returns `true` from `verifyCronSecret()` when the env var is empty; the route then proceeds to reminder and cancellation logic.
- Suspected Failure Mode: In environments where `CRON_SECRET` is unset, anyone with network access can trigger auto-cancel and reminder jobs on demand.
- What to inspect next: Check deployment env files or compose manifests to confirm whether `CRON_SECRET` is mandatory in each runtime environment.

[Backend Audit Item]
- ID: ASYNC-05
- Endpoint/Module: Background cron service and queue-backed fallback behaviors
- Controller/Service/Middleware: `services/cron.service.js`, `services/queue-service.js`, `services/certificate-service.js`
- Expected Role: Internal system execution
- DB/Queue/External Dependency: `Application`, certificate PDF queue, SLA jobs
- Findings: Background services still operate on legacy status transitions such as reverting phase 1 to `DRAFT` and phase 2 to `WAITING_PAYMENT_2`, while route-level cron logic uses the newer revision/CAR model. Queue-backed behavior is also optional, with synchronous fallbacks when queues are unavailable.
- Risk Level: Medium
- Evidence from code/runtime structure: `apps/backend/services/cron.service.js` uses old payment-expiry states; `apps/backend/services/queue-service.js` treats queue init failure as non-fatal; `apps/backend/services/certificate-service.js` falls back to synchronous PDF generation when the queue is unavailable.
- Suspected Failure Mode: Scheduled background jobs mutate applications into states that newer route handlers and dashboards no longer expect, and operational load spikes hit request paths directly when async queues are down.
- What to inspect next: Compare actual job registration in `server.js` with the queue and cron services to see which background paths are active in production.
