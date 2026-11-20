# Health Wizard Draft Contract Lock-Down Design

## Summary

This design defines Slice A2 for the health wizard autosave/offline sync workstream. Slice A1 already separates local dirty state, active syncing, offline retry, and auth/server errors in the frontend autosave UI. Slice A2 will lock down the draft API contract so future changes do not regress the autosave ID and cleanup behavior.

The slice is intentionally narrow. It adds regression coverage and documentation alignment around the current draft contract. It does not add schema versioning, optimistic locking, conflict detection, production deploy steps, or broad wizard refactors.

## Current Context

The active user-facing wizard path `/health/applications/new` routes through the `new-legacy` implementation:

- `apps/web-app/src/app/health/applications/new/layout.tsx` imports `../new-legacy/layout`
- `apps/web-app/src/app/health/applications/new-legacy/hooks/use-auto-save.ts` posts autosave payloads to `/applications/draft`
- `apps/web-app/src/components/application-flow/auto-save-indicator.tsx` renders the refined autosave states

The backend draft routes currently live in:

- `apps/backend/routes/api/applications/applications.js`
- `apps/backend/services/application-service/application-draft-query-methods.js`

Current behavior already includes important contract fixes:

- `POST /api/applications/draft` returns both `draftId` and `_id`
- `GET /api/applications/draft` returns both `draftId` and `_id`
- `DELETE /api/applications/draft/:id` exists and soft-deletes a health-owned draft
- frontend autosave accepts `draftId` first and `_id` as a fallback

Targeted frontend unit tests already pass for Slice A1:

```powershell
npm.cmd --prefix apps/web-app test -- --runTestsByPath src/app/health/applications/new-legacy/hooks/auto-save-status.test.ts src/app/health/applications/new-legacy/hooks/use-auto-save.test.tsx src/components/application-flow/auto-save-indicator.test.tsx
```

## Goals

- Make the draft autosave contract explicit and regression-tested.
- Ensure the frontend can continue saving the backend draft ID after autosave.
- Ensure the cleanup path has backend coverage for `DELETE /api/applications/draft/:id`.
- Align the workstream mapping document with the current code so it no longer states that these fixes are missing.
- Keep verification local and targeted unless a server Docker runtime check is explicitly needed.

## Non-Goals

- Do not add client-side or server-side version semantics.
- Do not introduce optimistic locking, ETags, or conflict-safe sync claims.
- Do not run production-affecting tests against the server Docker stack.
- Do not deploy, restart containers, migrate the database, or mutate production data.
- Do not refactor unrelated wizard step validation, route aliases, auth, payments, or provider flows.

## Proposed Approach

Recommended approach: contract lock-down.

The implementation should add or tighten tests around the existing behavior rather than rewrite the route. If tests reveal a real gap, fix only the smallest contract surface required.

Expected implementation shape:

1. Add backend regression tests for the draft route contract.
2. Keep frontend autosave tests that prove `_id` fallback and delete cleanup behavior.
3. Update `docs/backlog/health-wizard-offline-sync-workstream-a-review-first-mapping.md` to mark Slice A1 and the existing A2 contract pieces as implemented or partially implemented.

## Draft API Contract

`POST /api/applications/draft`

- Requires authenticated health user.
- Creates or updates the current health-owned draft.
- Returns `success: true`.
- Returns `data.draftId` as the canonical draft/application ID.
- Returns `data._id` as a backward-compatible alias for older clients.
- Keeps the backend response free of conflict/version semantics.

`GET /api/applications/draft`

- Requires authenticated health user.
- Returns `success: true, data: null` when no draft exists.
- For an existing draft, returns `data.draftId` and `data._id` with the same value.
- Selects the most recently updated draft when multiple active draft-like records exist.

`DELETE /api/applications/draft/:id`

- Requires authenticated health user.
- Only deletes a draft owned by the authenticated health identity.
- Soft-deletes the draft instead of hard deleting it.
- Returns `success: true` with `data.deleted` and `data.draftId`.
- Does not delete submitted, paid, certified, or cross-tenant applications.

## Frontend Contract

`useAutoSave` should keep this behavior:

- Save via `POST /applications/draft`.
- Store `response.data.draftId` as the primary ID.
- Fall back to `response.data._id` for backward compatibility.
- Use the stored ID for `DELETE /applications/draft/:draftId` in `clearDraft()`.
- Keep offline/auth/server state classification separate from this contract work.

## Testing Strategy

Backend tests should be targeted and mocked. They should not require local Docker or a local database.

Minimum backend coverage:

- `POST /draft` response includes matching `draftId` and `_id`.
- `GET /draft` response includes matching `draftId` and `_id`.
- `DELETE /draft/:id` delegates to `applicationService.deleteDraft` with health scope and returns `deleted: true`.
- `DELETE /draft/:id` does not pretend a missing or non-owned draft was deleted.

Frontend coverage already exists, but the final verification should rerun:

```powershell
npm.cmd --prefix apps/web-app test -- --runTestsByPath src/app/health/applications/new-legacy/hooks/auto-save-status.test.ts src/app/health/applications/new-legacy/hooks/use-auto-save.test.tsx src/components/application-flow/auto-save-indicator.test.tsx
```

If backend tests require new files, prefer focused tests under `apps/backend/__tests__/unit/` or `apps/backend/__tests__/integration/` using mocks. Do not run the full backend suite on the PC as a production-equivalent signal because the authoritative Docker runtime and production environment variables live on the server.

## Server Docker Boundary

The production Docker stack is authoritative and runs on the server, not on the PC. For this slice, server checks may be read-only health checks only:

- `docker compose --env-file .env.production -f docker-compose.production.yml ps`
- backend container `/health`
- public `https://gacpth.com/api/health`

Do not run mutation-heavy tests against production containers for this slice.

## Acceptance Criteria

- The backend draft route contract is covered by focused regression tests.
- Frontend autosave targeted tests still pass.
- The workstream mapping doc no longer reports already-fixed draft ID/delete contract gaps as missing.
- No production Docker deployment, restart, migration, or production data mutation occurs.
- No unrelated dirty backend or docs changes are staged into this slice.

## Risks And Mitigations

- Risk: tests become coupled to implementation details.
  Mitigation: assert HTTP contract and service delegation, not internal helper structure.

- Risk: production data is accidentally mutated during verification.
  Mitigation: keep A2 tests local and mocked; use server Docker only for read-only health checks.

- Risk: scope creeps into optimistic sync/versioning.
  Mitigation: explicitly exclude version semantics until the backend supports a real concurrency contract.
